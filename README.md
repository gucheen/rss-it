# RSS-it

RSS-it is a simple RSS generator from static pages. Mainly used for static web pages that do not provide update subscriptions.

## Start

1. start server
```
bun src/index.ts
# default port is 3000
```

2. Get RSS feed: Access via `/?id=ENTRY_ID` format. Example: `http://localhost:3000/?id=nikon_downloader_center`

3. Available ENTRY_ID list:
- nikon_downloader_center
- tamron_lens_firmware
- ricoh_griii_firmware
- rss_it_homepage
- viltrox_16mm_f18z_firmware

## config.json Configuration

1. 配置结构：

```json
{
  "id": "Unique identifier",
  "url": "Target page URL",
  "title": "Custom title (optional override)",
  "image": "Cover image URL",
  "selectors": {
    "item": "Entry container selector",
    "itemDate": "Date selector",
    "itemTitle": "Title selector (supports multi-selector merge)",
    "itemId": "Unique ID generator selector",
    "itemDescription": "Description selector",
    "itemLink": "Link selector (defaults to <a>)"
  },
  "format": {
    "itemDate": "Date parsing format"
  }
}
```

## Development

To install dependencies:

```bash
bun install
```

To run:

```bash
bun start
```

This project was created using `bun init` in bun v1.1.43. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
