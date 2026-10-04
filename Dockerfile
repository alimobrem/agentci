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

FROM node AS build
USER 0
WORKDIR /app
COPY package.json package-lock.json npm-shrinkwrap.json ./
RUN npm install --global npm@12.2.0 --no-audit --no-fund && npm ci --no-audit --no-fund
COPY tsconfig*.json ./
COPY apps ./apps
COPY cmd ./cmd
COPY packages ./packages
COPY scripts/build-assets.mjs ./scripts/build-assets.mjs
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

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
