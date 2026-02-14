# Trendyol API Integration Guide

Last updated: February 14, 2026

This guide is a practical implementation playbook for building an app on top of Trendyol Marketplace APIs.

It focuses on:
- Authentication and request format
- Environment setup
- Pagination and time-window sync strategy
- Shipment packages and product sync
- Database modeling and operational best practices

Use this together with the official reference:
- https://developers.trendyol.com

## 1. Credentials and access

From the Trendyol Partner/Seller panel, you need:
- `Seller ID` (a.k.a. `supplierId` / `sellerId`)
- `API Key`
- `API Secret`

Optional:
- Integration reference metadata from your panel

Store secrets in environment variables only. Do not hardcode in source files.

Recommended variables:

```env
TRENDYOL_SELLER_ID=1111632
TRENDYOL_API_KEY=...
TRENDYOL_API_SECRET=...
TRENDYOL_API_TOKEN=... # optional, base64(api_key:api_secret)
TRENDYOL_BASE_URL=https://apigw.trendyol.com
TRENDYOL_USER_AGENT=1111632 - SelfIntegration
DATABASE_URL=postgresql://...
```

## 2. Base URLs and environments

Trendyol documents two base environments:
- Production: `https://apigw.trendyol.com`
- Stage/Test: `https://stageapigw.trendyol.com`

Use stage while developing, then switch to production for live operations.

## 3. Authentication and required headers

Trendyol uses HTTP Basic Auth and a required `User-Agent`.

Headers:
- `Authorization: Basic <base64(apiKey:apiSecret)>`
- `User-Agent: <sellerId> - <your-app-name>`
- `Accept: application/json`
- `Content-Type: application/json`

Generate token:

```bash
echo -n "$TRENDYOL_API_KEY:$TRENDYOL_API_SECRET" | base64
```

Example request:

```bash
curl -X GET \
  "$TRENDYOL_BASE_URL/integration/product/sellers/$TRENDYOL_SELLER_ID/products?page=0&size=50&supplierId=$TRENDYOL_SELLER_ID" \
  -H "Authorization: Basic $TRENDYOL_API_TOKEN" \
  -H "User-Agent: $TRENDYOL_USER_AGENT" \
  -H "Accept: application/json"
```

## 4. Pagination model

Most list endpoints are paginated and return a page wrapper with fields such as:
- `content`: list of records
- `totalPages`
- `totalElements`
- `page`
- `size`

Sync loop pattern:
1. Start `page=0`
2. Fetch page
3. Persist records
4. Stop when one of these is true:
   - `content` is empty
   - `page + 1 >= totalPages`
   - reached local safety limit (`maxPages`)

## 5. Date and time filters

Order and shipment endpoints typically use epoch milliseconds:
- `startDate`
- `endDate`

Recommended strategy:
1. Run incremental sync in rolling windows (for example, every 5-15 minutes)
2. Keep overlap (for example, 5 minutes) to avoid missing late updates
3. Upsert by stable business key (`packageNumber`, `orderNumber`, etc.)

## 6. High-value endpoints to implement first

These are the minimum endpoints for most operational apps.

### 6.1 Products

Get products:
- `GET /integration/product/sellers/{sellerId}/products`

Typical query params:
- `page`
- `size`
- `supplierId`
- `approved` (optional)

Use cases:
- Catalog bootstrap
- Price and stock reconciliation
- Product state monitoring

### 6.2 Shipment packages

Get shipment packages:
- `GET /integration/order/sellers/{sellerId}/shipment-packages`

Typical query params:
- `page`
- `size`
- `startDate`
- `endDate`
- `shipmentPackageStatus` (optional)
- `orderByField` (commonly `PackageLastModifiedDate`)
- `orderByDirection` (`ASC` or `DESC`)

Use cases:
- Fulfillment dashboard
- Carrier tracking sync
- SLA / delivery monitoring

Example:

```bash
curl -X GET \
  "$TRENDYOL_BASE_URL/integration/order/sellers/$TRENDYOL_SELLER_ID/shipment-packages?page=0&size=200&startDate=1739491200000&endDate=1739577600000&orderByField=PackageLastModifiedDate&orderByDirection=DESC" \
  -H "Authorization: Basic $TRENDYOL_API_TOKEN" \
  -H "User-Agent: $TRENDYOL_USER_AGENT" \
  -H "Accept: application/json"
```

### 6.3 Orders

Implement orders next from the official Orders reference section:
- Order listing/search
- Detailed order payload pull
- Post-order operational actions

## 7. Suggested database schema

Use append-safe upsert tables with raw payload retention.

Minimum tables:
- `trendyol_products`
- `trendyol_shipment_packages`
- `trendyol_sync_runs` (optional run log)

Store:
- Business identifiers (`productCode`, `packageNumber`, `orderNumber`)
- Operational status fields
- `raw JSONB` for forward compatibility
- `synced_at` timestamp

Why keep `raw JSONB`:
- New fields appear without code changes
- Easier debugging and replay
- Safer during API version changes

## 8. Error handling and retries

Implement:
- Retry on `429` and `5xx` with exponential backoff + jitter
- No blind retry on `401` or `403` (fix credentials/permissions first)
- Dead-letter logging for invalid payloads
- Request timeout (for example, 30s)

Recommended retry policy:
- Attempts: 3 to 5
- Backoff: 1s, 2s, 4s, ...
- Add random jitter to reduce synchronized bursts

## 9. Idempotency and data consistency

Rules:
1. Treat every sync run as repeatable
2. Upsert, do not insert-only
3. Never assume sorted responses are complete without pagination
4. Keep overlapping date windows
5. Reconcile periodically with larger backfills (daily/hourly)

## 10. Security checklist

- Keep all secrets in env/secret manager
- Rotate API credentials if exposed
- Do not commit `.env`
- Restrict DB user permissions
- Add audit logs for outbound API calls

## 11. Operational checklist before go-live

1. Verify production credentials in Seller panel
2. Validate `User-Agent` format accepted by Trendyol
3. Run initial backfill for products and shipments
4. Enable scheduled incremental sync
5. Add alerting for:
   - no data fetched for N runs
   - repeated 401/403
   - repeated 429 spikes
   - DB write failures

## 12. Repo scripts in this project

Available scripts:
- `sync_trendyol_products.py`
- `sync_shipment_packages.py`

Install and run:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Product sync (1 page)
python sync_trendyol_products.py --max-pages 1

# Shipment sync (last 24h, 1 page)
python sync_shipment_packages.py --lookback-hours 24 --max-pages 1
```

Dry-run shipment sync:

```bash
python sync_shipment_packages.py --dry-run --lookback-hours 24 --max-pages 2
```

## 13. Source references

- Auth/User-Agent guidance: https://trendyol.readme.io/reference/magaza-bilgileri
- Environments: https://trendyol.readme.io/reference/prod-stage-environment
- API rules and retry/rate-limit pages: https://developers.trendyol.com
- Shipment packages reference: https://developers.trendyol.com/v3.0/reference/getshipmentpackages

When a specific endpoint is unclear, always confirm request/response fields from the exact endpoint reference page in the current Trendyol docs before releasing to production.
