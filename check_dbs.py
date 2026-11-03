import sqlite3
import glob
import os

files = glob.glob('farmacia-davalsi/**/*.db', recursive=True)
print("DB files found:", files)

for f in files:
    try:
        conn = sqlite3.connect(f)
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [r[0] for r in cur.fetchall()]
        print(f"--- {f} ---")
        print("Tables:", tables)
        for t in ['personal_farmacia', 'productos', 'productos_farmaceuticos', 'pacientes_usuarios', 'pedidos_delivery_tracking', 'farmacias']:
            if t in tables:
                cur.execute(f"SELECT COUNT(*) FROM {t}")
                cnt = cur.fetchone()[0]
                print(f"  {t}: {cnt} rows")
        conn.close()
    except Exception as e:
        print(f"Error {f}: {e}")
