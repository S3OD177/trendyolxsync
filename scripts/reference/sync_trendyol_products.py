#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import os
import sys
import time
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

import psycopg
import requests
from dotenv import load_dotenv
from psycopg.types.json import Json


UPSERT_SQL = """
INSERT INTO trendyol_products (
    seller_id,
    product_code,
    barcode,
    stock_code,
    title,
    brand,
    category_name,
    quantity,
    list_price,
    sale_price,
    approved,
    on_sale,
    archived,
    rejected,
    blacklisted,
    last_update_epoch_ms,
    raw,
    synced_at
)
VALUES (
    %(seller_id)s,
    %(product_code)s,
    %(barcode)s,
    %(stock_code)s,
    %(title)s,
    %(brand)s,
    %(category_name)s,
    %(quantity)s,
    %(list_price)s,
    %(sale_price)s,
    %(approved)s,
    %(on_sale)s,
    %(archived)s,
    %(rejected)s,
    %(blacklisted)s,
    %(last_update_epoch_ms)s,
    %(raw)s,
    NOW()
)
ON CONFLICT (seller_id, product_code)
DO UPDATE SET
    barcode = EXCLUDED.barcode,
    stock_code = EXCLUDED.stock_code,
    title = EXCLUDED.title,
    brand = EXCLUDED.brand,
    category_name = EXCLUDED.category_name,
    quantity = EXCLUDED.quantity,
    list_price = EXCLUDED.list_price,
    sale_price = EXCLUDED.sale_price,
    approved = EXCLUDED.approved,
    on_sale = EXCLUDED.on_sale,
    archived = EXCLUDED.archived,
    rejected = EXCLUDED.rejected,
    blacklisted = EXCLUDED.blacklisted,
    last_update_epoch_ms = EXCLUDED.last_update_epoch_ms,
    raw = EXCLUDED.raw,
    synced_at = NOW();
"""


CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS trendyol_products (
    seller_id BIGINT NOT NULL,
    product_code TEXT NOT NULL,
    barcode TEXT,
    stock_code TEXT,
    title TEXT,
    brand TEXT,
    category_name TEXT,
    quantity INTEGER,
    list_price NUMERIC(18, 2),
    sale_price NUMERIC(18, 2),
    approved BOOLEAN,
    on_sale BOOLEAN,
    archived BOOLEAN,
    rejected BOOLEAN,
    blacklisted BOOLEAN,
    last_update_epoch_ms BIGINT,
    raw JSONB NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (seller_id, product_code)
);

CREATE INDEX IF NOT EXISTS idx_trendyol_products_barcode
    ON trendyol_products (barcode);

CREATE INDEX IF NOT EXISTS idx_trendyol_products_stock_code
    ON trendyol_products (stock_code);

CREATE INDEX IF NOT EXISTS idx_trendyol_products_synced_at
    ON trendyol_products (synced_at DESC);
"""


@dataclass(frozen=True)
class Settings:
    seller_id: int
    api_key: str
    api_secret: str
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


def to_decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch Trendyol products and sync into PostgreSQL."
    )
    parser.add_argument(
        "--page-size",
        type=int,
        default=int(os.getenv("TRENDYOL_PAGE_SIZE", "100")),
        help="Number of products per page (default: 100)",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=int(os.getenv("TRENDYOL_MAX_PAGES", "10")),
        help="Maximum pages to fetch in one run (default: 10)",
    )
    parser.add_argument(
        "--include-unapproved",
        action="store_true",
        help="Fetch both approved and unapproved products (approved filter disabled)",
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
        api_key=api_key,
        api_secret=api_secret,
        api_token=api_token,
        base_url=base_url,
        user_agent=user_agent,
        database_url=database_url,
        timeout_seconds=timeout_seconds,
    )


def fetch_products_page(
    session: requests.Session,
    settings: Settings,
    page: int,
    page_size: int,
    include_unapproved: bool,
) -> dict[str, Any]:
    url = (
        f"{settings.base_url}/integration/product/sellers/"
        f"{settings.seller_id}/products"
    )

    params: dict[str, Any] = {
        "page": page,
        "size": page_size,
        "supplierId": settings.seller_id,
    }

    if not include_unapproved:
        params["approved"] = "true"

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

    raise RuntimeError("Failed to fetch Trendyol products due to repeated rate limiting")


def ensure_schema(conn: psycopg.Connection[Any]) -> None:
    with conn.cursor() as cur:
        cur.execute(CREATE_TABLE_SQL)


def product_code_from_item(item: dict[str, Any]) -> str | None:
    for key in ("productCode", "stockCode", "barcode", "id"):
        value = item.get(key)
        if value is not None and str(value).strip() != "":
            return str(value)
    return None


def upsert_products(
    conn: psycopg.Connection[Any], seller_id: int, items: list[dict[str, Any]]
) -> int:
    rows: list[dict[str, Any]] = []

    for item in items:
        product_code = product_code_from_item(item)
        if not product_code:
            continue

        rows.append(
            {
                "seller_id": seller_id,
                "product_code": product_code,
                "barcode": item.get("barcode"),
                "stock_code": item.get("stockCode"),
                "title": item.get("title"),
                "brand": item.get("brand"),
                "category_name": item.get("categoryName"),
                "quantity": item.get("quantity"),
                "list_price": to_decimal(item.get("listPrice")),
                "sale_price": to_decimal(item.get("salePrice")),
                "approved": item.get("approved"),
                "on_sale": item.get("onSale"),
                "archived": item.get("archived"),
                "rejected": item.get("rejected"),
                "blacklisted": item.get("blacklisted"),
                "last_update_epoch_ms": item.get("lastUpdateDate"),
                "raw": Json(item),
            }
        )

    if not rows:
        return 0

    with conn.cursor() as cur:
        cur.executemany(UPSERT_SQL, rows)

    return len(rows)


def main() -> int:
    args = parse_args()

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
        }
    )

    page = 0
    fetched = 0
    upserted = 0

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
            data = fetch_products_page(
                session=session,
                settings=settings,
                page=page,
                page_size=args.page_size,
                include_unapproved=args.include_unapproved,
            )

            content = data.get("content") or []
            if not isinstance(content, list):
                raise RuntimeError("Unexpected payload: 'content' field is not a list")

            fetched += len(content)
            total_pages = data.get("totalPages")

            if not content:
                break

            if not args.dry_run and db_conn is not None:
                upserted += upsert_products(db_conn, settings.seller_id, content)
                db_conn.commit()

            print(
                f"Page {page} fetched: {len(content)} items"
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
        print(f"Dry-run complete. Total fetched: {fetched}")
    else:
        print(f"Sync complete. Total fetched: {fetched}, total upserted: {upserted}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
