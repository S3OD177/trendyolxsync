#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import psycopg
import requests
from dotenv import load_dotenv
from psycopg.types.json import Json

def ms_to_datetime(ms: int | None) -> datetime | None:
    if ms is None:
        return None
    return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc)


# Table managed by Prisma, so we don't strictly need CREATE TABLE if it exists.
# But for reference or standalone use (schema matches Prisma):
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS "shipment_packages" (
    "id" TEXT NOT NULL,
    "sellerId" BIGINT NOT NULL,
    "packageNumber" TEXT NOT NULL,
    "orderNumber" TEXT,
    "status" TEXT NOT NULL,
    "cargoProvider" TEXT,
    "trackingNumber" TEXT,
    "trackingLink" TEXT,
    "lastModifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3),
    "estimatedDeliveryStart" TIMESTAMP(3),
    "estimatedDeliveryEnd" TIMESTAMP(3),
    "linesCount" INTEGER,
    "rawPayload" JSONB NOT NULL,
    "syncedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT "shipment_packages_pkey" PRIMARY KEY ("id")
);

-- Indexes are managed by Prisma generally, but for standalone:
CREATE INDEX IF NOT EXISTS "idx_shipment_packages_status" ON "shipment_packages" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "shipment_packages_sellerId_packageNumber_key" ON "shipment_packages" ("sellerId", "packageNumber");
"""


UPSERT_SQL = """
INSERT INTO "shipment_packages" (
    "id",
    "sellerId",
    "packageNumber",
    "orderNumber",
    "status",
    "cargoProvider",
    "trackingNumber",
    "trackingLink",
    "lastModifiedAt",
    "createdAt",
    "estimatedDeliveryStart",
    "estimatedDeliveryEnd",
    "linesCount",
    "rawPayload",
    "syncedAt"
)
VALUES (
    gen_random_uuid()::text, -- Generate ID if new
    %(sellerId)s,
    %(packageNumber)s,
    %(orderNumber)s,
    %(status)s,
    %(cargoProvider)s,
    %(trackingNumber)s,
    %(trackingLink)s,
    %(lastModifiedAt)s,
    %(createdAt)s,
    %(estimatedDeliveryStart)s,
    %(estimatedDeliveryEnd)s,
    %(linesCount)s,
    %(rawPayload)s,
    NOW()
)
ON CONFLICT ("sellerId", "packageNumber")
DO UPDATE SET
    "orderNumber" = EXCLUDED."orderNumber",
    "status" = EXCLUDED."status",
    "cargoProvider" = EXCLUDED."cargoProvider",
    "trackingNumber" = EXCLUDED."trackingNumber",
    "trackingLink" = EXCLUDED."trackingLink",
    "lastModifiedAt" = EXCLUDED."lastModifiedAt",
    "createdAt" = EXCLUDED."createdAt",
    "estimatedDeliveryStart" = EXCLUDED."estimatedDeliveryStart",
    "estimatedDeliveryEnd" = EXCLUDED."estimatedDeliveryEnd",
    "linesCount" = EXCLUDED."linesCount",
    "rawPayload" = EXCLUDED."rawPayload",
    "syncedAt" = NOW();
"""


@dataclass(frozen=True)
class Settings:
    seller_id: int
    api_token: str
    base_url: str
    user_agent: str
    database_url: str
    timeout_seconds: int


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def default_start_ms(hours: int) -> int:
    return int((datetime.now(timezone.utc) - timedelta(hours=hours)).timestamp() * 1000)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch Trendyol shipment packages and sync into PostgreSQL."
    )
    parser.add_argument(
        "--start-date-ms",
        type=int,
        default=None,
        help="Unix epoch in milliseconds (inclusive). Default: now - --lookback-hours",
    )
    parser.add_argument(
        "--end-date-ms",
        type=int,
        default=None,
        help="Unix epoch in milliseconds (inclusive). Default: now",
    )
    parser.add_argument(
        "--lookback-hours",
        type=int,
        default=int(os.getenv("TRENDYOL_SHIPMENT_LOOKBACK_HOURS", "24")),
        help="Used only when --start-date-ms is omitted (default: 24)",
    )
    parser.add_argument(
        "--page-size",
        type=int,
        default=int(os.getenv("TRENDYOL_SHIPMENT_PAGE_SIZE", "200")),
        help="Number of packages per page (default: 200)",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=int(os.getenv("TRENDYOL_SHIPMENT_MAX_PAGES", "20")),
        help="Maximum pages to fetch in one run (default: 20)",
    )
    parser.add_argument(
        "--shipment-package-status",
        default=os.getenv("TRENDYOL_SHIPMENT_PACKAGE_STATUS", "").strip(),
        help="Optional shipment package status filter (e.g. Created, Picking, Invoiced)",
    )
    parser.add_argument(
        "--order-by-field",
        default=os.getenv("TRENDYOL_ORDER_BY_FIELD", "PackageLastModifiedDate"),
        help="Sort field (default: PackageLastModifiedDate)",
    )
    parser.add_argument(
        "--order-by-direction",
        choices=("ASC", "DESC"),
        default=os.getenv("TRENDYOL_ORDER_BY_DIRECTION", "DESC").upper(),
        help="Sort direction (default: DESC)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch from Trendyol but do not write to Postgres",
    )
    return parser.parse_args()


def load_settings() -> Settings:
    load_dotenv()

    seller_id = int(require_env("TRENDYOL_SELLER_ID"))
    api_key = require_env("TRENDYOL_API_KEY")
    api_secret = require_env("TRENDYOL_API_SECRET")

    api_token = os.getenv("TRENDYOL_API_TOKEN", "").strip()
    if not api_token:
        api_token = base64.b64encode(f"{api_key}:{api_secret}".encode("utf-8")).decode(
            "utf-8"
        )

    base_url = os.getenv("TRENDYOL_BASE_URL", "https://apigw.trendyol.com").strip()
    user_agent = os.getenv("TRENDYOL_USER_AGENT", f"{seller_id} - SelfIntegration").strip()
    database_url = require_env("DATABASE_URL")
    timeout_seconds = int(os.getenv("TRENDYOL_TIMEOUT_SECONDS", "30"))

    return Settings(
        seller_id=seller_id,
        api_token=api_token,
        base_url=base_url,
        user_agent=user_agent,
        database_url=database_url,
        timeout_seconds=timeout_seconds,
    )


def fetch_shipment_packages_page(
    session: requests.Session,
    settings: Settings,
    page: int,
    page_size: int,
    start_date_ms: int,
    end_date_ms: int,
    shipment_package_status: str,
    order_by_field: str,
    order_by_direction: str,
) -> dict[str, Any]:
    url = (
        f"{settings.base_url}/integration/order/sellers/"
        f"{settings.seller_id}/shipment-packages"
    )

    params: dict[str, Any] = {
        "page": page,
        "size": page_size,
        "startDate": start_date_ms,
        "endDate": end_date_ms,
        "orderByField": order_by_field,
        "orderByDirection": order_by_direction,
    }

    if shipment_package_status:
        params["shipmentPackageStatus"] = shipment_package_status

    for attempt in range(3):
        response = session.get(url, params=params, timeout=settings.timeout_seconds)

        if response.status_code == 429 and attempt < 2:
            time.sleep((attempt + 1) * 1.5)
            continue

        if response.status_code in (401, 403):
            raise RuntimeError(
                "Authentication/authorization failed for Trendyol API "
                f"({response.status_code}). Check API credentials and User-Agent format."
            )

        if response.status_code >= 400:
            body_preview = response.text[:300]
            raise RuntimeError(
                f"Trendyol API request failed with {response.status_code}: {body_preview}"
            )

        payload = response.json()
        if not isinstance(payload, dict):
            raise RuntimeError("Unexpected response format from Trendyol API")
        return payload

    raise RuntimeError("Failed to fetch shipment packages due to repeated rate limiting")


def ensure_schema(conn: psycopg.Connection[Any]) -> None:
    with conn.cursor() as cur:
        cur.execute(CREATE_TABLE_SQL)


def package_number_from_item(item: dict[str, Any]) -> str | None:
    for key in ("packageNumber", "shipmentPackageId", "id"):
        value = item.get(key)
        if value is not None and str(value).strip() != "":
            return str(value)
    return None


def upsert_packages(
    conn: psycopg.Connection[Any], seller_id: int, items: list[dict[str, Any]]
) -> int:
    rows: list[dict[str, Any]] = []

    for item in items:
        package_number = package_number_from_item(item)
        if not package_number:
            continue

        lines = item.get("lines")
        lines_count = len(lines) if isinstance(lines, list) else None

        rows.append(
            {
                "sellerId": seller_id,
                "packageNumber": package_number,
                "orderNumber": item.get("orderNumber"),
                "status": item.get("shipmentPackageStatus"),
                "cargoProvider": item.get("cargoProviderName"),
                "trackingNumber": item.get("cargoTrackingNumber"),
                "trackingLink": item.get("cargoTrackingLink"),
                "lastModifiedAt": ms_to_datetime(item.get("packageLastModifiedDate")),
                "createdAt": ms_to_datetime(item.get("shipmentPackageCreationDate")),
                "estimatedDeliveryStart": ms_to_datetime(item.get("estimatedDeliveryStartDate")),
                "estimatedDeliveryEnd": ms_to_datetime(item.get("estimatedDeliveryEndDate")),
                "linesCount": lines_count,
                "rawPayload": Json(item),
            }
        )

    if not rows:
        return 0

    with conn.cursor() as cur:
        cur.executemany(UPSERT_SQL, rows)

    return len(rows)


def main() -> int:
    args = parse_args()

    start_date_ms = args.start_date_ms if args.start_date_ms is not None else default_start_ms(args.lookback_hours)
    end_date_ms = args.end_date_ms if args.end_date_ms is not None else now_ms()

    if start_date_ms > end_date_ms:
        print("Argument error: start-date-ms must be <= end-date-ms", file=sys.stderr)
        return 1

    try:
        settings = load_settings()
    except Exception as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 1

    session = requests.Session()
    session.headers.update(
        {
            "Authorization": f"Basic {settings.api_token}",
            "User-Agent": settings.user_agent,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "storeFrontCode": "SA",
        }
    )

    fetched = 0
    upserted = 0
    page = 0
    db_conn: psycopg.Connection[Any] | None = None

    if not args.dry_run:
        try:
            db_conn = psycopg.connect(settings.database_url)
            ensure_schema(db_conn)
            db_conn.commit()
        except Exception as exc:
            print(f"Database connection/schema error: {exc}", file=sys.stderr)
            return 1

    try:
        while page < args.max_pages:
            data = fetch_shipment_packages_page(
                session=session,
                settings=settings,
                page=page,
                page_size=args.page_size,
                start_date_ms=start_date_ms,
                end_date_ms=end_date_ms,
                shipment_package_status=args.shipment_package_status,
                order_by_field=args.order_by_field,
                order_by_direction=args.order_by_direction,
            )

            content = data.get("content") or []
            if not isinstance(content, list):
                raise RuntimeError("Unexpected payload: 'content' field is not a list")

            fetched += len(content)
            total_pages = data.get("totalPages")

            if not content:
                break

            if not args.dry_run and db_conn is not None:
                upserted += upsert_packages(db_conn, settings.seller_id, content)
                db_conn.commit()

            print(
                f"Page {page} fetched: {len(content)} packages"
                + (
                    f" | totalPages={total_pages}"
                    if total_pages is not None
                    else ""
                )
            )

            if isinstance(total_pages, int) and page + 1 >= total_pages:
                break

            page += 1

    except Exception as exc:
        if db_conn is not None:
            db_conn.rollback()
        print(f"Sync failed: {exc}", file=sys.stderr)
        return 1
    finally:
        if db_conn is not None:
            db_conn.close()
        session.close()

    if args.dry_run:
        print(
            f"Dry-run complete. Total fetched: {fetched} "
            f"(startDate={start_date_ms}, endDate={end_date_ms})"
        )
    else:
        print(
            "Sync complete. "
            f"Total fetched: {fetched}, total upserted: {upserted}, "
            f"startDate={start_date_ms}, endDate={end_date_ms}"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
