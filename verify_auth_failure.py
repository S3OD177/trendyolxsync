import os
import requests
import base64
from dotenv import load_dotenv

def main():
    load_dotenv()
    
    seller_id = os.getenv("TRENDYOL_SELLER_ID")
    base_url = os.getenv("TRENDYOL_BASE_URL", "https://apigw.trendyol.com").strip()
    
    url = f"{base_url}/integration/product/sellers/{seller_id}/products"
    
    # invalid token
    headers = {
        "Authorization": "Basic INVALID_TOKEN_123",
        "User-Agent": f"{seller_id} - SelfIntegration",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    
    print(f"Testing URL with INVALID token: {url}")
    try:
        response = requests.get(url, headers=headers, params={"page": 0, "size": 1}, timeout=30)
        print(f"Response Code: {response.status_code}")
        print(f"Response: {response.text[:200]}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
