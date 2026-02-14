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
    print(f"User-Agent: {headers['User-Agent']}")
    
    try:
        response = requests.get(url, headers=headers, params={"page": 0, "size": 1, "supplierId": seller_id, "approved": "true"}, timeout=30)
        print(f"Response Code: {response.status_code}")
        print(f"Response: {response.text[:200]}")
    except Exception as e:
        print(f"Error with default UA: {e}")
        
    print("-" * 20)
    
    # Try with standard UA
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    print(f"Testing with Browser UA: {headers['User-Agent']}")
    try:
        response = requests.get(url, headers=headers, params={"page": 0, "size": 1, "supplierId": seller_id, "approved": "true"}, timeout=30)
        print(f"Response Code: {response.status_code}")
        print(f"Response: {response.text[:200]}")
    except Exception as e:
        print(f"Error with Browser UA: {e}")

if __name__ == "__main__":
    main()
