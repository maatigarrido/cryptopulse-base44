# CryptoPulse Base44

Vite/React dashboard for BTC market-cycle analysis, prepared for deployment on Cloudflare Pages.

## Local Development

```bash
pnpm install
pnpm dev
```

Optional local Base44 proxy variables:

```bash
VITE_BASE44_APP_ID=69a9f47984b17fff1284c605
VITE_BASE44_APP_BASE_URL=https://app.base44.com
```

## Build

```bash
pnpm build
```

The build writes static assets to `dist/` and copies `cloudflare-worker.js` to `dist/_worker.js`, so Cloudflare Pages can proxy:

- `/api` to `https://app.base44.com`
- `/kraken` to `https://api.kraken.com`
- `/yahoo` to `https://query1.finance.yahoo.com`

## Cloudflare Pages

Use these settings when connecting the GitHub repository:

- Framework preset: Vite
- Build command: `pnpm build`
- Build output directory: `dist`
- Root directory: repository root

Set these environment variables in Cloudflare Pages if Base44 integration is needed:

- `VITE_BASE44_APP_ID=69a9f47984b17fff1284c605`
- `VITE_BASE44_APP_BASE_URL=https://app.base44.com`
