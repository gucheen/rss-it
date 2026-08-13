# RSS-it

RSS-it generates RSS 2.0 feeds from web pages that do not provide their own
subscriptions. Feed definitions live in `config.json`; the homepage is generated
from the same configuration so the two cannot drift apart.

## Start

```bash
cp config.example.json config.json
bun install --frozen-lockfile
bun start
```

The server listens on port 3000 by default and honors Bun's `PORT` environment
variable.

- Homepage: `http://localhost:3000/`
- Feed: `http://localhost:3000/?id=ENTRY_ID`
- Health check: `http://localhost:3000/healthz`

Unknown entry IDs return 404. A first-time upstream fetch failure returns 502.
When an expired feed already exists, RSS-it serves that last-known-good value and
refreshes it in the background.

## Configuration

```json
{
  "cacheTtlSeconds": 3600,
  "fetchTimeoutMs": 10000,
  "maxResponseBytes": 2097152,
  "entries": [
    {
      "id": "unique_identifier",
      "url": "https://example.com/updates",
      "title": "Optional feed title",
      "image": "https://example.com/cover.png",
      "ruleUpdatedAt": "2026-08-13",
      "selectors": {
        "title": "title",
        "copyright": "footer",
        "item": "article.release",
        "itemGroupSize": 1,
        "itemDate": "time",
        "itemTitle": "h2",
        "itemId": ".version",
        "itemDescription": ".notes",
        "itemLink": "a"
      },
      "format": {
        "itemDate": "YYYY-MM-DD"
      }
    }
  ]
}
```

`itemTitle`, `itemId`, and `itemDescription` also accept arrays of selectors;
their matching text is joined with `|`.

`itemGroupSize` explicitly combines adjacent elements returned by `item`. It is
useful for markup such as alternating `dt` and `dd` nodes. Prefer selecting one
common parent per feed item whenever the target page permits it.

The former top-level field name `entris` remains accepted for compatibility but
is deprecated. New configurations should use `entries`.

Configuration is validated at startup. Invalid URLs, selectors with missing
required fields, duplicate IDs, and invalid numeric limits stop the process with
an actionable error.

`ruleUpdatedAt` records when a feed rule was added or last adjusted and must use
`YYYY-MM-DD`. The homepage displays it alongside the date of the newest parsed
feed item. The latter appears after that feed has been fetched and is independent
from the internal last-successful-fetch timestamp. Opening the homepage starts
missing or expired feed refreshes in the background; a reload shows newly
available content dates without delaying the initial page response.

## Development

```bash
bun run typecheck
bun test
bun run format:check
bun run build
```

Parser tests use local HTML fixtures and do not depend on target websites or the
W3C online validator. This keeps pull-request CI deterministic; live target-page
checks can be run separately when updating selectors.

## Docker

```bash
cp config.example.json config.json
docker compose -f docker-compose.example.yml up -d
```

The image exposes port 3000, runs as a non-root user, and includes a `/healthz`
health check. Published releases are tagged from the Git release version, commit
SHA, and `latest` for stable releases.
