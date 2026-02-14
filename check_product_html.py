import requests
import sys

def check_html():
    url = "https://www.trendyol.com/sr?mid=1111632"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,tr;q=0.8",
        "Referer": "https://www.google.com/"
    }
    
    print(f"Fetching {url}...")
    try:
        response = requests.get(url, headers=headers, timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            html = response.text
            print(f"Content Length: {len(html)}")
            
            # Check for common "no results" text in Turkish
            no_results_texts = [
                "Aradığınız kriterlere uygun ürün bulunamadı",
                "Sonuç bulunamadı",
                "no result",
                "bulunamadı"
            ]
            
            found_no_result = False
            for text in no_results_texts:
                if text in html:
                    print(f"Found 'no results' text: '{text}'")
                    found_no_result = True
            
            # Check for product card classes or similar
            if 'p-card-wrppr' in html or 'product-card' in html:
                print("Found product card markers in HTML.")
            else:
                print("No product card markers found in HTML.")

            if not found_no_result and 'p-card-wrppr' not in html:
                print("Ambiguous result. Saving HTML snippet...")
                with open("seller_page.html", "w") as f:
                    f.write(html)
                print("Saved to seller_page.html")
                
        else:
            print("Failed to fetch page.")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_html()
