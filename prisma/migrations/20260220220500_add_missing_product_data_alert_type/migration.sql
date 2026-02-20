-- Add dedicated alert type for products that are missing required pricing/catalog fields.
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'MISSING_PRODUCT_DATA';
