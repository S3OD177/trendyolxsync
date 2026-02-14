# trendyolxsync

Utilities for syncing Trendyol marketplace data into PostgreSQL.

## Docs

- Full integration guide: `docs/TRENDYOL_API_INTEGRATION_GUIDE.md`

## Quick start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Environment variables

Copy `.env.example` to `.env` and set values:

- `TRENDYOL_SELLER_ID`
- `TRENDYOL_API_KEY`
- `TRENDYOL_API_SECRET`
- `TRENDYOL_API_TOKEN` (optional, auto-derived from key/secret)
- `TRENDYOL_BASE_URL` (default: `https://apigw.trendyol.com`)
- `TRENDYOL_USER_AGENT` (required by Trendyol, e.g. `1111632 - SelfIntegration`)
- `DATABASE_URL`

## Sync scripts

Products sync:

```bash
python sync_trendyol_products.py --max-pages 1
```

Shipment packages sync:

```bash
python sync_shipment_packages.py --max-pages 1
```

Dry-run shipment packages:

```bash
python sync_shipment_packages.py --dry-run --lookback-hours 24 --max-pages 2
```
