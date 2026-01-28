# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

FROM base AS builder
RUN mkdir -p /temp/dev
COPY . /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile && bun build --compile --minify ./src/index.ts --outfile rss-it

FROM base AS release
COPY --from=builder /temp/dev/rss-it .

USER bun
EXPOSE 3000/tcp
ENTRYPOINT [ "./rss-it" ]
