import os
import requests
import base64
from dotenv import load_dotenv

def main():
    load_dotenv()
    
    seller_id = os.getenv("TRENDYOL_SELLER_ID")
    api_key = os.getenv("TRENDYOL_API_KEY")
    api_secret = os.getenv("TRENDYOL_API_SECRET")
    base_url = os.getenv("TRENDYOL_BASE_URL", "https://apigw.trendyol.com").strip()
    
    # EXACT UA from .env
    user_agent = os.getenv("TRENDYOL_USER_AGENT", f"{seller_id} - TrendyolBuyBoxGuard")
    
    if not all([seller_id, api_key, api_secret]):
        print("Missing env vars")
        return

    api_token = base64.b64encode(f"{api_key}:{api_secret}".encode("utf-8")).decode("utf-8")
    
    url = f"{base_url}/integration/product/sellers/{seller_id}/products"
    
    headers = {
        "Authorization": f"Basic {api_token}",
        "User-Agent": user_agent,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    
    barcode = "6941812798126"
    
    print(f"Testing URL: {url}")
    print(f"Using User-Agent: {user_agent}")
    
    # Test 1: Fetch with exact UA, filter by barcode
    print(f"Test 1: Filter by barcode={barcode}")
    try:
        response = requests.get(url, headers=headers, params={"barcode": barcode}, timeout=30)
        print(f"Response Code: {response.status_code}")
        print(f"Response: {response.text[:500]}")
    except Exception as e:
        print(f"Error: {e}")

    print("-" * 20)
    
    # Test 2: Fetch ALL with exact UA
    print("Test 2: Fetch ALL (page 0, size 100)")
    try:
        response = requests.get(url, headers=headers, params={"page": 0, "size": 100, "supplierId": seller_id}, timeout=30)
        print(f"Response Code: {response.status_code}")
        print(f"Response: {response.text[:500]}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
