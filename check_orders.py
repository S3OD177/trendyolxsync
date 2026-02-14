import os
import requests
import base64
import time
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
    
    # Endpoint for shipments/orders
    # /integration/order/sellers/{sellerId}/shipment-packages
    url = f"{base_url}/integration/order/sellers/{seller_id}/shipment-packages"
    
    headers = {
        "Authorization": f"Basic {api_token}",
        "User-Agent": f"{seller_id} - SelfIntegration",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    
    # Need to provide startDate and endDate
    # Let's look back 30 days
    end_date = int(time.time() * 1000)
    start_date = end_date - (30 * 24 * 60 * 60 * 1000) # 30 days
    
    params = {
        "page": 0,
        "size": 10,
        "startDate": start_date,
        "endDate": end_date,
        "orderByField": "PackageLastModifiedDate",
        "orderByDirection": "DESC"
    }
    
    print(f"Testing URL: {url}")
    print(f"Params: {params}")
    
    try:
        response = requests.get(url, headers=headers, params=params, timeout=30)
        print(f"Response Code: {response.status_code}")
        print(f"Response: {response.text[:500]}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
