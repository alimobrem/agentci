FROM registry.access.redhat.com/ubi9/nodejs-22-minimal:latest@sha256:ca1c79182159009eb15a041bc6bb16f390a4e738b9d57d6cc4975f3b2981788b AS build
USER 0
WORKDIR /app
COPY package.json package-lock.json npm-shrinkwrap.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig*.json ./
COPY apps ./apps
COPY cmd ./cmd
COPY packages ./packages
COPY scripts/build-assets.mjs ./scripts/build-assets.mjs
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM registry.access.redhat.com/ubi9/nodejs-22-minimal:latest@sha256:ca1c79182159009eb15a041bc6bb16f390a4e738b9d57d6cc4975f3b2981788b AS runtime
USER 0
WORKDIR /app
ENV NODE_ENV=production
RUN rm -rf /usr/lib/node_modules/npm /usr/share/nodejs/npm /usr/bin/npm /usr/bin/npx
COPY --from=build --chown=1001:0 /app/package.json ./package.json
COPY --from=build --chown=1001:0 /app/node_modules ./node_modules
COPY --from=build --chown=1001:0 /app/dist ./dist
COPY --chown=1001:0 deploy/migrations ./deploy/migrations
USER 1001
STOPSIGNAL SIGTERM

FROM runtime AS api
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3000/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/apps/control/main.js"]

FROM runtime AS worker
CMD ["node", "dist/apps/worker/main.js"]
