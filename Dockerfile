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
COPY deploy/engines/licenses/mcp-server-filesystem-LICENSE /licenses/mcp-server-filesystem-LICENSE
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

# Local M3 dashboard packaging only; no publication workflow or release role activation.
FROM build AS dashboard-build
# Build-time declarations are required by Next; only locked production SDK dependencies ship.
COPY --from=dependencies /app/node_modules /app/node_modules
COPY scripts/dashboard-production-trace.mjs /app/scripts/dashboard-production-trace.mjs
ENV NEXT_TELEMETRY_DISABLED=1
RUN test "$(node --version)" = "v26.10.0" && test "$(npm --version)" = "12.2.0" && \
    npm ci --prefix apps/dashboard --no-audit --no-fund && npm run build --prefix apps/dashboard && \
    npm prune --omit=dev --no-audit --no-fund && \
    node scripts/dashboard-production-trace.mjs apps/dashboard/.next/standalone
COPY LICENSE /app/LICENSE
COPY scripts/dashboard-license-inventory.mjs /app/scripts/dashboard-license-inventory.mjs
COPY scripts/dashboard-notice-associations.mjs /app/scripts/dashboard-notice-associations.mjs
COPY scripts/dashboard-notices /app/scripts/dashboard-notices
RUN node scripts/dashboard-license-inventory.mjs --root /app --standalone /app/apps/dashboard/.next/standalone --output /app/dashboard-licenses

FROM node AS dashboard
ARG SOURCE_COMMIT
ARG DASHBOARD_LOCK_SHA256
ARG ROOT_LOCK_SHA256
ARG DASHBOARD_VERSION=0.0.0-local-m3
LABEL org.opencontainers.image.title="AgentCI dashboard local qualification" \
      org.opencontainers.image.revision=$SOURCE_COMMIT \
      org.agentci.dashboard.lock-sha256=$DASHBOARD_LOCK_SHA256 \
      org.agentci.root.lock-sha256=$ROOT_LOCK_SHA256 \
      org.agentci.dashboard.version=$DASHBOARD_VERSION
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
USER 0
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /app
COPY --from=dashboard-build --chown=1001:0 /app/apps/dashboard/.next/standalone ./
COPY --from=dashboard-build --chown=1001:0 /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=dashboard-build /app/dashboard-licenses /licenses/dashboard
COPY --from=node /usr/local/LICENSE /licenses/Node-LICENSE
COPY LICENSE /licenses/AgentCI-MIT.txt
USER 1001
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3000/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
STOPSIGNAL SIGTERM
CMD ["node", "apps/dashboard/server.js"]

FROM runtime AS api
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3000/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/apps/control/main.js"]

FROM runtime AS worker
CMD ["node", "dist/apps/worker/main.js"]

# Official Podman remote client; the executor socket belongs to dedicated evaluator infrastructure.
FROM node AS podman-cli
RUN microdnf install -y gzip && microdnf clean all
ARG TARGETARCH
RUN case "$TARGETARCH" in \
      amd64) sha=23ee4f71873810a864389b78ffe0d7536296432bb96d0c2acfbbfc7d50ee9c1b ;; \
      arm64) sha=a0e949d1df0198bd5fe4a8aa4aa57b3038dd1946acbb2088ab318ea0e89bd349 ;; \
      *) exit 1 ;; \
    esac; \
    curl --fail --location --silent --show-error "https://github.com/podman-container-tools/podman/releases/download/v6.1.3/podman-remote-static-linux_${TARGETARCH}.tar.gz" -o /tmp/podman.tar.gz && \
    echo "$sha  /tmp/podman.tar.gz" | sha256sum --check - && \
    tar -xzf /tmp/podman.tar.gz -C /tmp && \
    install -m 0755 "/tmp/bin/podman-remote-static-linux_${TARGETARCH}" /usr/local/bin/podman && \
    podman --version | grep '6.1.3'

# Copy only the CLI component into UBI; no Docker daemon or upstream Alpine filesystem ships.
FROM docker:29.9.0-cli@sha256:1a4c7cb63513f349bdad01fcc6e0f3f2f67d37b9da86f14dc0d4a0942eecda00 AS docker-cli
FROM runtime AS eval-worker-base
USER 0
RUN microdnf remove -y microdnf rpm rpm-libs libdnf libmodulemd librepo libsolv dnf-data rpm-sequoia
USER 1001
CMD ["node", "dist/apps/eval-worker/main.js"]

# Development target; Podman security, stability and hosted release acceptance remain open.
FROM eval-worker-base AS eval-worker-podman
ARG TARGETARCH
USER 0
COPY --from=podman-cli /usr/local/bin/podman /usr/local/bin/podman
COPY deploy/licenses/podman-LICENSE /licenses/podman-LICENSE
COPY deploy/security/podman-client-go.mod /licenses/podman-client/go.mod
COPY deploy/security/podman-client-${TARGETARCH}.json /licenses/podman-client/compiled.json
RUN mkdir -p /opt/agentci/podman-config/containers /opt/agentci/podman-runtime && chown -R 1001:0 /opt/agentci/podman-config /opt/agentci/podman-runtime && chmod 0700 /opt/agentci/podman-config /opt/agentci/podman-config/containers /opt/agentci/podman-runtime
ENV AGENTCI_CONTAINER_ENGINE=podman XDG_CONFIG_HOME=/opt/agentci/podman-config XDG_RUNTIME_DIR=/opt/agentci/podman-runtime/private CONTAINER_HOST=unix:///run/agentci/engine.sock
USER 1001

# M2 release target: only the selected Docker client ships in the evaluator.
FROM eval-worker-base AS eval-worker
USER 0
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY deploy/security/docker-cli-vendor.mod /licenses/docker-cli/go.mod
COPY deploy/licenses/docker-cli-LICENSE /licenses/docker-cli-LICENSE
RUN mkdir -p /opt/agentci/docker-config && chmod 0555 /opt/agentci/docker-config && docker --version | grep '29.9.0'
ENV AGENTCI_CONTAINER_ENGINE=docker DOCKER_CONFIG=/opt/agentci/docker-config DOCKER_HOST=unix:///run/agentci/engine.sock
USER 1001
