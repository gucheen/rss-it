# Keep the build runtime aligned with CI for reproducible compiled output.
FROM oven/bun:1.3.14-alpine AS base
WORKDIR /usr/src/app

FROM base AS builder
RUN mkdir -p /temp/dev
COPY . /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile && bun build --compile --minify ./src/index.ts --outfile rss-it

FROM base AS release
COPY --from=builder /temp/dev/rss-it .

USER bun
EXPOSE 3000/tcp
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
ENTRYPOINT [ "./rss-it" ]
