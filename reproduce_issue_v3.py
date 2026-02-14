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
    }
    
    print(f"Testing URL: {url}")
    
    # Test 3: Remove supplierId from params
    print("Test 3: Fetch 100 items, remove supplierId from params")
    try:
        # Note: Removing supplierId, and ensures approved is string "true" if needed, or omit it.
        # Let's try omitting approved first to get everything.
        response = requests.get(url, headers=headers, params={"page": 0, "size": 100}, timeout=30)
        print(f"Response Code: {response.status_code}")
        print(f"Response: {response.text[:200]}")
    except Exception as e:
        print(f"Error: {e}")

    print("-" * 20)

    # Test 4: supplierId in params, but size=10
    print("Test 4: supplierId in params, size=10")
    try:
        response = requests.get(url, headers=headers, params={"page": 0, "size": 10, "supplierId": seller_id}, timeout=30)
        print(f"Response Code: {response.status_code}")
        print(f"Response: {response.text[:200]}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
