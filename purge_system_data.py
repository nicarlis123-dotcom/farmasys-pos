import sqlite3
import glob
import os
import hashlib

def hash_pw(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

admin_hash = hash_pw("123456")

db_files = glob.glob('farmacia-davalsi/**/*.db', recursive=True)
print(f"Cleaning {len(db_files)} databases...")

for db_path in db_files:
    print(f"\nProcessing: {db_path}")
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    # Get all tables
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [r[0] for r in cur.fetchall()]
    
    # 1. Clear products & inventory
    for t in ['productos', 'productos_farmaceuticos', 'inventario_lotes', 'kit_items', 'kits_terapeuticos', 
              'kits_promocionales', 'movimientos_inventario', 'inventario_auditoria_correcciones', 
              'transacciones', 'detalle_transacciones', 'pre_carritos', 'deudores', 
              'recetas_medicas', 'control_psicotropicos', 'registros_atencion_farmaceutica', 
              'quejas_reclamos', 'pacientes_alergias', 'caja_turnos_arqueos', 'pagos_transferencias',
              'pedidos_delivery_tracking', 'planes_pacientes', 'pacientes_cronicos', 'historial_antropometrico_vitales']:
        if t in tables:
            cur.execute(f"DELETE FROM {t}")
            print(f"  Emptied table: {t}")
            
    # 2. Clear patient users
    for t in ['pacientes_usuarios', 'pacientes']:
        if t in tables:
            cur.execute(f"DELETE FROM {t}")
            print(f"  Emptied table: {t}")

    # 3. Clean personal_farmacia (keep ONLY admin / 123456)
    if 'personal_farmacia' in tables:
        cur.execute("PRAGMA table_info(personal_farmacia)")
        cols = [c[1] for c in cur.fetchall()]
        cur.execute("DELETE FROM personal_farmacia WHERE username != 'admin'")
        cur.execute("SELECT COUNT(*) FROM personal_farmacia WHERE username = 'admin'")
        admin_count = cur.fetchone()[0]
        if admin_count == 0:
            if 'activa' in cols:
                cur.execute("""
                    INSERT INTO personal_farmacia (farmacia_id, username, nombre_completo, rol, clave_hash, pista_clave, fecha_creacion, activa)
                    VALUES (1, 'admin', 'Administrador General', 'ADMINISTRADOR', ?, '123456', datetime('now'), 1)
                """, (admin_hash,))
            else:
                cur.execute("""
                    INSERT INTO personal_farmacia (farmacia_id, username, nombre_completo, rol, clave_hash, pista_clave, fecha_creacion)
                    VALUES (1, 'admin', 'Administrador General', 'ADMINISTRADOR', ?, '123456', datetime('now'))
                """, (admin_hash,))
        else:
            # Update admin credentials to 123456
            if 'activa' in cols:
                cur.execute("UPDATE personal_farmacia SET clave_hash = ?, pista_clave = '123456', activa = 1 WHERE username = 'admin'", (admin_hash,))
            else:
                cur.execute("UPDATE personal_farmacia SET clave_hash = ?, pista_clave = '123456' WHERE username = 'admin'", (admin_hash,))
        print("  Cleaned personal_farmacia (ONLY admin remaining).")

    # 4. Enable delivery & payments in farmacias / farmacias_directorio
    if 'farmacias' in tables:
        cur.execute("PRAGMA table_info(farmacias)")
        cols = [c[1] for c in cur.fetchall()]
        updates = ["activa = 1", "nombre = 'Farmacia Davalsi'"]
        if 'envio_domicilio_activo' in cols:
            updates.append("envio_domicilio_activo = 1")
        if 'pago_tarjeta_activo' in cols:
            updates.append("pago_tarjeta_activo = 1")
        cur.execute(f"UPDATE farmacias SET {', '.join(updates)}")
        print(f"  Updated farmacias settings: {', '.join(updates)}")

    if 'farmacias_directorio' in tables:
        cur.execute("PRAGMA table_info(farmacias_directorio)")
        cols = [c[1] for c in cur.fetchall()]
        updates = ["activa = 1", "nombre = 'Farmacia Davalsi'"]
        if 'envio_domicilio_activo' in cols:
            updates.append("envio_domicilio_activo = 1")
        if 'pago_tarjeta_activo' in cols:
            updates.append("pago_tarjeta_activo = 1")
        cur.execute(f"UPDATE farmacias_directorio SET {', '.join(updates)}")
        print(f"  Updated farmacias_directorio settings: {', '.join(updates)}")

    conn.commit()
    conn.close()

print("\n--- ALL DATABASES PURGED & INITIALIZED CLEANLY ---")
