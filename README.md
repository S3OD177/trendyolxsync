# Trendyol BuyBox Guard

Production-ready Next.js 14 admin app for monitoring Trendyol BuyBox competitiveness and safely applying **manual** price updates.

Core capabilities:
- Poll Trendyol seller data every 5 minutes via cron endpoint
- Auto-sync catalog from Trendyol inside each poll run (no manual sync required)
- Store historical snapshots in Prisma/PostgreSQL
- Detect alerts (BuyBox loss, undercut, competitor drops, price-war risk)
- Send in-app alerts only
- Compute safe suggested prices with break-even protection
- One-click suggested apply and custom updates with hard no-loss floor enforcement
- Currency locked to **SAR (Saudi Riyal)**

## Stack
- Next.js 14 (App Router) + TypeScript
- Tailwind + shadcn-style UI components
- Prisma ORM + migrations
- PostgreSQL (cranl internal DB)

## Requirements
- Node.js 20 LTS (`.nvmrc` provided)
- npm

## Setup
```bash
cp .env.example .env
npm install
```

## Database
This app requires PostgreSQL only:
- Set `DATABASE_URL` to a real PostgreSQL URL (`postgresql://` or `postgres://`)
- No SQLite fallback is supported

Commands:
```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

Production migration:
```bash
npm run db:deploy
```

## Run locally
```bash
npm run dev
```

Open: `http://localhost:3000`

## Security model
- App assumes your domain/edge already enforces access control
- App enforces a 4-digit PIN session (`APP_PIN`) before dashboard/API access
- App still protects cron endpoint with `CRON_SECRET`

## Production deployment on cranl (internal Postgres)
1. Set `DATABASE_URL` to cranl internal PostgreSQL connection string
2. Set Trendyol credentials:
- `TRENDYOL_SUPPLIER_ID` (or `TRENDYOL_SELLER_ID`)
- `TRENDYOL_API_KEY`
- `TRENDYOL_API_SECRET`
- Optional `TRENDYOL_USER_AGENT`
- `TRENDYOL_STOREFRONT_CODE=SA` (Saudi storefront)
3. Optional Salla read-only integration credentials:
- `SALLA_ACCESS_TOKEN`
- Or configure OAuth:
- `SALLA_CLIENT_ID`
- `SALLA_CLIENT_SECRET`
- `SALLA_REDIRECT_URI` (for example: `http://localhost:3000/api/integrations/salla/oauth/callback`)
- Optional `SALLA_COST_SOURCE=PRE_TAX` (or `COST_PRICE`)
4. Set `APP_PIN` (4 digits, default `3698`)
5. Set `CRON_SECRET`
6. Run migration deploy and start app

## Cron trigger (every 5 minutes)
Endpoint:
- `POST /api/cron/poll`

Required header:
- `x-cron-secret: <CRON_SECRET>`

The poll job first syncs catalog pages (controlled by `AUTO_SYNC_*` env vars), then fetches price snapshots/alerts.

Example:
```bash
curl -X POST "https://your-app.example.com/api/cron/poll" \
  -H "x-cron-secret: $CRON_SECRET"
```

## Trendyol API notes
Configured in `/Users/saud/xcodeproject/trendyolxsync/lib/trendyol/client.ts` with:
- HTTP Basic auth
- Required `User-Agent`
- Exponential backoff retry on `429` and `5xx`
- Product sync endpoint:
  - `GET /integration/product/sellers/{sellerId}/products`

Reference guide:
- `/Users/saud/xcodeproject/trendyolxsync/docs/TRENDYOL_API_INTEGRATION_GUIDE.md`

## Main routes
- `/dashboard`
- `/products/[id]`
- `/alerts`
- `/settings`

## API routes
- `POST /api/cron/poll`
- `GET /api/dashboard`
- `POST /api/products/sync` (optional manual/debug sync)
- `POST /api/products/update-price`
- `GET /api/alerts`
- `POST /api/alerts/mark-read`
- `GET/POST /api/settings`
- `GET/PATCH /api/products/[id]/settings`
- `GET /api/products/[id]/details`
- `GET /api/integrations/salla/status`
- `GET /api/integrations/salla/oauth/start`
- `GET /api/integrations/salla/oauth/callback`
- `POST /api/integrations/salla/match`
- `POST /api/integrations/salla/sync`

## Testing
Unit tests cover:
- Pricing and break-even calculation
- Suggested price floor/cooldown logic
- Alert detector rules

Run:
```bash
npm test
```
