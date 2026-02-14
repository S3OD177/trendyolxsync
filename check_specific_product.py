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
    
    product_code = "14C-4/128-black"
    barcode = "6941812798126"
    
    print(f"Testing URL: {url}")
    
    # Test 1: Filter by barcode
    print(f"Test 1: Filter by barcode={barcode}")
    try:
        response = requests.get(url, headers=headers, params={"barcode": barcode}, timeout=30)
        print(f"Response Code: {response.status_code}")
        print(f"Response: {response.text[:500]}")
    except Exception as e:
        print(f"Error: {e}")

    print("-" * 20)

    # Test 2: Filter by productCode
    print(f"Test 2: Filter by productCode={product_code}")
    try:
        response = requests.get(url, headers=headers, params={"productCode": product_code}, timeout=30)
        print(f"Response Code: {response.status_code}")
        print(f"Response: {response.text[:500]}")
    except Exception as e:
        print(f"Error: {e}")
        
    print("-" * 20)
    
    # Test 3: Search text (title) if supported? (Unlikely but worth a shot if others fail)
    # The API doc summary mentioned "perform searches with various filters".
    # Maybe 'title' or 'query'?
    print("Test 3: Filter by title='Redmi'")
    try:
        response = requests.get(url, headers=headers, params={"title": "Redmi"}, timeout=30)
        print(f"Response Code: {response.status_code}")
        print(f"Response: {response.text[:500]}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
