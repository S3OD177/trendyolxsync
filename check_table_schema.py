
import psycopg
import os
from dotenv import load_dotenv

load_dotenv()

try:
    conn = psycopg.connect(os.getenv("DATABASE_URL"))
    cur = conn.cursor()
    cur.execute("""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'trendyol_products';
    """)
    columns = cur.fetchall()
    print("Columns in trendyol_products:")
    for col in columns:
        print(f"  {col[0]} ({col[1]})")
        
    cur.execute("SELECT count(*) FROM trendyol_products")
    res = cur.fetchone()
    print(f"\nTotal rows: {res[0]}")

    cur.execute("SELECT buybox_status, count(*) FROM trendyol_products GROUP BY buybox_status")
    stats = cur.fetchall()
    print("\nBuyBox Status Distribution:")
    for status, count in stats:
        print(f"  {status}: {count}")

except Exception as e:
    print(f"Error: {e}")
finally:
    if 'conn' in locals():
        conn.close()
