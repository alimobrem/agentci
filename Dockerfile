FROM registry.access.redhat.com/ubi10/ubi-minimal:latest@sha256:204e1531cee54562b107fb31e0b327062fc3d5d67af7cc0d2e66b2c572b9044f AS node
ARG TARGETARCH
RUN microdnf install -y tar xz libstdc++ libatomic && microdnf clean all
# Official Node.js release; checksums from its SHASUMS256.txt, reviewed per update.
RUN case "$TARGETARCH" in \
      amd64) arch=x64; sha=ca70e9e349de048b9522abb3adc05b3bd6f43c5ffd3ec57916c7da292f59f022 ;; \
      arm64) arch=arm64; sha=7a6353f63eb3d04765004b4adf172616243e4522434635cb1d26288658b04ab5 ;; \
      *) echo 'Unsupported architecture' >&2; exit 1 ;; \
    esac; \
    curl --fail --location --silent --show-error "https://nodejs.org/dist/v26.10.0/node-v26.10.0-linux-${arch}.tar.xz" -o /tmp/node.tar.xz && \
    echo "$sha  /tmp/node.tar.xz" | sha256sum --check - && \
    tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 && rm /tmp/node.tar.xz

FROM node AS python-build
USER 0
RUN microdnf install -y gcc make openssl-devel bzip2-devel libffi-devel zlib-devel xz-devel sqlite-devel expat-devel libzstd-devel && microdnf clean all
RUN curl --fail --location --silent --show-error https://www.python.org/ftp/python/3.14.8/Python-3.14.8.tar.xz -o /tmp/python.tar.xz && \
    echo 'c2215904f02b175596dc49351585104f4bc20341e1c47378b26a2c274360ce73  /tmp/python.tar.xz' | sha256sum --check - && \
    mkdir /tmp/python-src && tar -xJf /tmp/python.tar.xz -C /tmp/python-src --strip-components=1 && \
    cd /tmp/python-src && ./configure --prefix=/opt/python --with-ensurepip=install --with-system-expat --disable-test-modules && \
    make -j4 && make install && rm -rf /tmp/python-src /tmp/python.tar.xz
COPY deploy/runner-requirements.txt /tmp/runner-requirements.txt
RUN /opt/python/bin/python3.14 -m pip install --require-hashes --no-cache-dir --disable-pip-version-check -r /tmp/runner-requirements.txt && \
    /opt/python/bin/python3.14 -c 'import ssl, sqlite3, bz2, lzma, pytest; assert pytest.__version__ == "9.1.1"'

FROM node AS eval-runner
USER 0
RUN microdnf install -y openssl-libs bzip2-libs libffi zlib xz-libs sqlite-libs expat libzstd && microdnf clean all
COPY --from=python-build /opt/python /opt/python
COPY LICENSE /licenses/AgentCI-MIT.txt
ENV PATH=/opt/python/bin:/usr/local/bin:/usr/bin:/bin PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1
RUN ln -s /opt/python/bin/python3.14 /usr/local/bin/python && ln -s /opt/python/bin/python3.14 /usr/local/bin/python3 && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx && \
    /opt/python/bin/python3.14 -m pip uninstall --yes pip && \
    rm -rf /opt/python/lib/python3.14/ensurepip /opt/python/bin/pip* && \
    /opt/python/bin/python3.14 -c 'import ssl, sqlite3, bz2, lzma, pytest; assert pytest.__version__ == "9.1.1"'
USER 1001
WORKDIR /workspace
CMD ["node", "--version"]

FROM python-build AS eval-engines-build
USER 0
ENV PATH=/opt/python/bin:/usr/local/bin:/usr/bin:/bin
RUN microdnf install -y gcc-c++ && microdnf clean all && npm install --global npm@12.2.0 --no-audit --no-fund
COPY deploy/engines/deepeval/requirements.txt /tmp/deepeval-requirements.txt
RUN python3.14 -m pip install --require-hashes --only-binary=:all: --no-cache-dir --disable-pip-version-check -r /tmp/deepeval-requirements.txt && \
    DEEPEVAL_TELEMETRY_OPT_OUT=1 DEEPEVAL_DISABLE_DOTENV=1 python3.14 -c 'import deepeval; assert deepeval.__version__ == "4.2.8"' && \
    python3.14 -m pip uninstall --yes pip && rm -rf /opt/python/lib/python3.14/ensurepip /opt/python/bin/pip*
WORKDIR /opt/promptfoo
COPY deploy/engines/promptfoo/package.json deploy/engines/promptfoo/package-lock.json ./
COPY deploy/engines/patches /opt/agentci-patches
RUN npm ci --omit=dev --no-audit --no-fund && \
    node /opt/agentci-patches/apply-forge-backport.mjs /opt/promptfoo/node_modules/node-forge && \
    node /opt/agentci-patches/verify-forge-backport.cjs /opt/promptfoo/node_modules/node-forge

FROM eval-runner AS eval-engines
USER 0
COPY --from=eval-engines-build /opt/python /opt/python
COPY --from=eval-engines-build /opt/promptfoo /opt/promptfoo
COPY --from=eval-engines-build /opt/agentci-patches /opt/agentci-patches
ENV PATH=/opt/promptfoo/node_modules/.bin:/opt/python/bin:/usr/local/bin:/usr/bin:/bin
USER 1001
CMD ["node", "--version"]

FROM node AS dependencies
USER 0
WORKDIR /app
COPY package.json package-lock.json npm-shrinkwrap.json ./
RUN npm install --global npm@12.2.0 --no-audit --no-fund && npm ci --no-audit --no-fund

FROM dependencies AS build
COPY tsconfig*.json ./
COPY apps ./apps
COPY cmd ./cmd
COPY packages ./packages
COPY scripts/build-assets.mjs ./scripts/build-assets.mjs
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

# Trusted lockfile dependencies for AgentCI self-evals. Reviewed source stays in /workspace.
# Root-level module resolution supplies read-only deps without any PR dependency installation.
FROM eval-runner AS eval-agentci
USER 0
COPY --from=build /app/node_modules /node_modules
# Self-evals execute TypeScript with tsx; the unused Go-based typechecker stays in build/CI.
COPY --from=dependencies /app/node_modules/tsx /node_modules/tsx
COPY --from=dependencies /app/node_modules/esbuild /node_modules/esbuild
COPY --from=dependencies /app/node_modules/@esbuild /node_modules/@esbuild
COPY --from=dependencies /app/npm-shrinkwrap.json /licenses/AgentCI-self-eval-shrinkwrap.json
USER 1001

FROM node AS runtime
USER 0
WORKDIR /app
ENV NODE_ENV=production
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build --chown=1001:0 /app/package.json ./package.json
COPY --from=build --chown=1001:0 /app/node_modules ./node_modules
COPY --from=build --chown=1001:0 /app/dist ./dist
COPY --chown=1001:0 deploy/migrations ./deploy/migrations
COPY --chown=1001:0 LICENSE ./LICENSE
USER 1001
STOPSIGNAL SIGTERM

FROM runtime AS api
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3000/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/apps/control/main.js"]

FROM runtime AS worker
CMD ["node", "dist/apps/worker/main.js"]

# Copy only the CLI component into UBI; no Docker daemon or upstream Alpine filesystem ships.
FROM docker:29.8.2-cli@sha256:b1805116a6a86cc591b5d5f60a910a0715cdcc9d18d866ad68b1457ead25c35c AS docker-cli
FROM runtime AS eval-worker
USER 0
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY deploy/licenses/docker-cli-LICENSE /licenses/docker-cli-LICENSE
RUN microdnf remove -y microdnf rpm rpm-libs libdnf libmodulemd librepo libsolv dnf-data rpm-sequoia && mkdir -p /opt/agentci/docker-config && chmod 0555 /opt/agentci/docker-config && \
    docker --version | grep '29.8.2'
ENV DOCKER_CONFIG=/opt/agentci/docker-config DOCKER_HOST=unix:///var/run/docker.sock
USER 1001
CMD ["node", "dist/apps/eval-worker/main.js"]
