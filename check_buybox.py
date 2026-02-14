import os
import requests
import base64
import json
from dotenv import load_dotenv

def main():
    load_dotenv()
    
    seller_id = os.getenv("TRENDYOL_SELLER_ID")
    api_key = os.getenv("TRENDYOL_API_KEY")
    api_secret = os.getenv("TRENDYOL_API_SECRET")
    base_url = os.getenv("TRENDYOL_BASE_URL", "https://apigw.trendyol.com").strip()
    
    if not all([seller_id, api_key, api_secret]):
        print("Missing env vars (TRENDYOL_SELLER_ID, TRENDYOL_API_KEY, TRENDYOL_API_SECRET)")
        return

    api_token = base64.b64encode(f"{api_key}:{api_secret}".encode("utf-8")).decode("utf-8")
    
    url = f"{base_url}/integration/product/sellers/{seller_id}/products/buybox-information"
    
    headers = {
        "Authorization": f"Basic {api_token}",
        "User-Agent": f"{seller_id} - SelfIntegration",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "storeFrontCode": "SA"
    }
    
    barcode = "6941812798126" # User's problem barcode
    payload = {
        "barcodes": [barcode],
        "supplierId": int(seller_id)
    }
    
    storefront_codes = ["SA", "TR", "GLOBAL", "GCC"]
    
    for code in storefront_codes:
        print(f"\nTesting with storeFrontCode: {code}")
        headers["storeFrontCode"] = code
        
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=30)
            print(f"Response Code: {response.status_code}")
            print("Response Body:")
            try:
                print(json.dumps(response.json(), indent=2))
            except:
                print(response.text)
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    main()
