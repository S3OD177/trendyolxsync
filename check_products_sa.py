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
        print("Missing env vars")
        return

    api_token = base64.b64encode(f"{api_key}:{api_secret}".encode("utf-8")).decode("utf-8")
    
    url = f"{base_url}/integration/product/sellers/{seller_id}/products"
    
    headers = {
        "Authorization": f"Basic {api_token}",
        "User-Agent": f"{seller_id} - SelfIntegration",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "storeFrontCode": "SA"
    }
    
    print(f"Testing URL: {url}")
    
    try:
        # Fetch specific item
        barcode = "6941812798126"
        print(f"Searching for barcode: {barcode}")
        response = requests.get(url, headers=headers, params={"barcode": barcode, "supplierId": int(seller_id)}, timeout=30)
        print(f"Response Code: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print("Response Content:")
            print(json.dumps(data, indent=2))
        else:
            print(f"Response: {response.text[:500]}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
