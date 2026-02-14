
import requests
import os
import sys
import base64
from dotenv import load_dotenv

# Load settings (copied from sync script)
load_dotenv()
seller_id = os.getenv("TRENDYOL_SELLER_ID")
api_key = os.getenv("TRENDYOL_API_KEY")
api_secret = os.getenv("TRENDYOL_API_SECRET")
base_url = os.getenv("TRENDYOL_BASE_URL", "https://apigw.trendyol.com").strip()
api_token = base64.b64encode(f"{api_key}:{api_secret}".encode("utf-8")).decode("utf-8")

session = requests.Session()
session.headers.update({
    "Authorization": f"Basic {api_token}",
    "User-Agent": f"{seller_id} - SelfIntegration",
    "Accept": "application/json",
    "Content-Type": "application/json",
    "storeFrontCode": "SA"
})

# 1. Fetch 1 page of products
print("Fetching 1 page of products...", file=sys.stderr)
products_url = f"{base_url}/integration/product/sellers/{seller_id}/products"
params = {"page": 0, "size": 20, "supplierId": seller_id, "approved": "true"}

try:
    resp = session.get(products_url, params=params, timeout=30)
    if resp.status_code != 200:
        print(f"Failed to fetch products: {resp.status_code} {resp.text}", file=sys.stderr)
        sys.exit(1)
    
    products = resp.json().get("content", [])
    print(f"Got {len(products)} products.", file=sys.stderr)
    
    # 2. Try fetching BuyBox for each individually
    buybox_url = f"{base_url}/integration/product/sellers/{seller_id}/products/buybox-information"
    
    for p in products:
        barcode = p.get("barcode")
        if not barcode:
            continue
            
        print(f"Testing barcode: {barcode}", file=sys.stderr)
        payload = {"barcodes": [barcode], "supplierId": int(seller_id)} # Cast to int just in case
        
        # Ensure headers are correct for this POST
        headers = session.headers.copy()
        headers["storeFrontCode"] = "SA"
        
        try:
            bb_resp = session.post(buybox_url, json=payload, headers=headers, timeout=10)
            if bb_resp.status_code == 200:
                print(f"  OK: {bb_resp.json()}", file=sys.stderr)
            else:
                print(f"  FAILED: {bb_resp.status_code} {bb_resp.text}", file=sys.stderr)
        except Exception as e:
            print(f"  ERROR: {e}", file=sys.stderr)

except Exception as e:
    print(f"Top level error: {e}", file=sys.stderr)
