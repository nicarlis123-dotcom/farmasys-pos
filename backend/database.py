"""

Capa de Persistencia Relacional Multi-Farmacia y Transacciones ACID — Farmacia Davalsi / FarmaSys

Soporta:

- Múltiples Farmacias independientes con UUID único, Identidad del negocio, Eslogan, RNC, Contacto,

  Mensaje de cierre de factura con vista previa, Switch de activación de WhatsApp y Eliminación permanente en cascada.

- Personal del Sistema por farmacia: Administrador + Registro de Vendedores (rol fijo Vendedor).

- Control de Deudores (Cuentas por cobrar y abonos por farmacia).

- Soporte de Seguro Médico (ARS) en ventas y facturación.

- Inventario independiente por farmacia medido en su unidad mínima (Caja ⇄ Blíster ⇄ Unidad).

- Control de Lotes y Alertas por Fecha de Vencimiento (FEFO).

- Reportes analíticos de Ventas Diarias, Mensuales, Ticket Promedio, Total del Periodo y Gráficos.

"""



import os

import uuid

import json

import hashlib

import sqlite3

from contextlib import contextmanager

from datetime import datetime, timedelta

from typing import Dict, Any, List, Optional, Iterator



from inventory_engine import (

    InventoryMathEngine,

    PRESENTATION_UNIT,

    PRESENTATION_BLISTER,

    PRESENTATION_BOX,

)





def hash_password(raw_password: str) -> str:

    return hashlib.sha256(f"DAVALSI_SALT::{raw_password.strip()}".encode("utf-8")).hexdigest()





class DatabaseManager:

    """Gestor de base de datos SQLite Multi-Farmacia con bloqueo transaccional."""



    def __init__(self, db_path: str) -> None:

        self.db_path = db_path

        self.data_dir = os.path.dirname(self.db_path)

        os.makedirs(self.data_dir, exist_ok=True)

        self.master_db_path = os.path.join(self.data_dir, "farmasys_master.db")

        self.tenants_dir = os.path.join(self.data_dir, "tenants")

        os.makedirs(self.tenants_dir, exist_ok=True)

        self._init_schema()

        self._seed_initial_data()
        self._enforce_clean_state()



    def _resolve_db_path(self, farmacia_id: Optional[int] = None) -> str:

        """Resuelve la base de datos independiente de la farmacia solicitada (Multi-Tenant)."""

        if farmacia_id is None:

            if os.path.isfile(self.master_db_path):

                return self.master_db_path

            return self.db_path



        fid = int(farmacia_id)

        if os.path.isfile(self.master_db_path):

            try:

                m_conn = sqlite3.connect(self.master_db_path, timeout=10.0)

                m_conn.row_factory = sqlite3.Row

                row = m_conn.execute("SELECT db_filename FROM farmacias_directorio WHERE id = ?", (fid,)).fetchone()

                m_conn.close()

                if row and row["db_filename"]:

                    t_path = os.path.join(self.tenants_dir, row["db_filename"])

                    if os.path.isfile(t_path):

                        return t_path

            except Exception:

                pass



        if os.path.isdir(self.tenants_dir):

            for fname in os.listdir(self.tenants_dir):

                if fname.startswith(f"farmacia_{fid}_") and fname.endswith(".db"):

                    return os.path.join(self.tenants_dir, fname)



        return self.db_path



    def _ensure_service_columns(self, conn: sqlite3.Connection) -> None:

        """Garantiza que las columnas de configuración operativa (Pago con Tarjeta, Envío a Domicilio, Seguro Médico) existan."""

        for tbl in ("farmacias", "farmacias_directorio"):

            for col in ("pago_tarjeta_activo", "envio_domicilio_activo", "seguro_medico_activo"):

                try:

                    conn.execute(f"ALTER TABLE {tbl} ADD COLUMN {col} INTEGER NOT NULL DEFAULT 1;")

                except Exception:

                    pass



    @contextmanager

    def _get_connection(self, farmacia_id: Optional[int] = None) -> Iterator[sqlite3.Connection]:

        target_path = self._resolve_db_path(farmacia_id)

        conn = sqlite3.connect(target_path, timeout=15.0)

        conn.row_factory = sqlite3.Row

        conn.execute("PRAGMA foreign_keys = ON;")

        conn.execute("PRAGMA journal_mode = WAL;")

        self._ensure_service_columns(conn)

        try:

            yield conn

            conn.commit()

        except Exception:

            conn.rollback()

            raise

        finally:

            conn.close()



    def _init_tenant_schema_on_connection(self, conn: sqlite3.Connection) -> None:

        """Inicializa el esquema relacional completo dentro de la base de datos separada de la farmacia."""

        conn.executescript(

            """

            CREATE TABLE IF NOT EXISTS farmacias (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                uuid_farmacia TEXT UNIQUE NOT NULL,

                codigo TEXT UNIQUE NOT NULL,

                nombre TEXT NOT NULL,

                eslogan TEXT NOT NULL DEFAULT 'FarmaSys - Sistema POS',

                ciudad_sector TEXT NOT NULL,

                telefono TEXT NOT NULL DEFAULT '809-555-1234',

                direccion TEXT NOT NULL,

                telefono_whatsapp TEXT NOT NULL,

                wa_activo INTEGER NOT NULL DEFAULT 1,

                mensaje_factura TEXT NOT NULL DEFAULT '¡Gracias por su compra en FarmaSys!',

                usuario_admin TEXT NOT NULL DEFAULT 'admin',

                clave_hash TEXT NOT NULL,

                pista_clave_demo TEXT DEFAULT '',

                rnc TEXT NOT NULL DEFAULT '1-31-99887-2',

                banco_nombre TEXT NOT NULL DEFAULT 'Banco Popular / Banreservas',

                banco_cuenta TEXT NOT NULL DEFAULT 'Popular: 789-451230-9 | Banreservas: 960-112233-4',

                wa_provider TEXT NOT NULL DEFAULT 'META_CLOUD_API',

                meta_phone_number_id TEXT NOT NULL DEFAULT '105928374650192',

                meta_access_token TEXT NOT NULL DEFAULT '',

                meta_api_version TEXT NOT NULL DEFAULT 'v20.0',

                twilio_account_sid TEXT NOT NULL DEFAULT '',

                twilio_auth_token TEXT NOT NULL DEFAULT '',

                twilio_from_number TEXT NOT NULL DEFAULT 'whatsapp:+14155238886',

                public_base_url TEXT NOT NULL DEFAULT 'http://localhost:8080',

                horario TEXT NOT NULL DEFAULT 'Lun-Dom 7:00 AM - 11:00 PM',

                activa INTEGER NOT NULL DEFAULT 1

            );



            CREATE TABLE IF NOT EXISTS personal_farmacia (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                farmacia_id INTEGER NOT NULL,

                username TEXT NOT NULL,

                nombre_completo TEXT NOT NULL,

                rol TEXT NOT NULL DEFAULT 'VENDEDOR',

                clave_hash TEXT NOT NULL,

                pista_clave TEXT DEFAULT '',

                fecha_creacion TEXT NOT NULL,

                activa INTEGER NOT NULL DEFAULT 1,

                UNIQUE(farmacia_id, username)

            );



            CREATE TABLE IF NOT EXISTS deudores (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                farmacia_id INTEGER NOT NULL,

                cliente_nombre TEXT NOT NULL,

                cliente_telefono TEXT NOT NULL,

                cedula TEXT DEFAULT '',

                concepto TEXT NOT NULL,

                monto_deuda_rd REAL NOT NULL,

                monto_abonado_rd REAL NOT NULL DEFAULT 0.0,

                saldo_pendiente_rd REAL NOT NULL,

                estado TEXT NOT NULL DEFAULT 'PENDIENTE',

                fecha_registro TEXT NOT NULL

            );



            CREATE TABLE IF NOT EXISTS productos (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                farmacia_id INTEGER NOT NULL,

                codigo_barras TEXT NOT NULL,

                nombre_comercial TEXT NOT NULL,

                principio_activo TEXT NOT NULL,

                concentracion TEXT NOT NULL,

                laboratorio TEXT NOT NULL,

                categoria TEXT NOT NULL,

                sintomas_tags TEXT NOT NULL,

                unidad_minima_nombre TEXT NOT NULL DEFAULT 'Tableta',

                precio_base REAL NOT NULL,

                descuento_blister_pct REAL NOT NULL DEFAULT 5.0,

                descuento_caja_pct REAL NOT NULL DEFAULT 12.0,

                requiere_receta INTEGER NOT NULL DEFAULT 0,

                unidades_por_blister INTEGER NOT NULL DEFAULT 10,

                blisters_por_caja INTEGER NOT NULL DEFAULT 3,

                stock_total_unidades INTEGER NOT NULL DEFAULT 0,

                stock_minimo_alerta INTEGER NOT NULL DEFAULT 30,

                lote TEXT NOT NULL DEFAULT 'LOT-2026-01',

                fecha_vencimiento TEXT NOT NULL DEFAULT '2027-06-30',

                ubicacion_anaquel TEXT NOT NULL DEFAULT 'A-01',

                activo INTEGER NOT NULL DEFAULT 1,

                UNIQUE(farmacia_id, codigo_barras)

            );



            CREATE TABLE IF NOT EXISTS transacciones (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                farmacia_id INTEGER NOT NULL,

                codigo_orden TEXT UNIQUE NOT NULL,

                canal TEXT NOT NULL,

                fecha_hora TEXT NOT NULL,

                fecha_dia TEXT NOT NULL,

                fecha_mes TEXT NOT NULL,

                cliente_nombre TEXT NOT NULL,

                cliente_telefono TEXT NOT NULL,

                cliente_direccion TEXT,

                metodo_pago TEXT NOT NULL,

                numero_comprobante TEXT DEFAULT '',

                referencia_pago TEXT,

                seguro_ars TEXT NOT NULL DEFAULT 'Sin Seguro',

                cobertura_seguro_rd REAL NOT NULL DEFAULT 0.0,

                subtotal REAL NOT NULL,

                impuesto REAL NOT NULL DEFAULT 0.0,

                total REAL NOT NULL,

                requiere_validacion_receta INTEGER NOT NULL DEFAULT 0,

                receta_imagen_url TEXT,

                estado_pedido TEXT NOT NULL,

                notas_farmaceutico TEXT,

                atendido_por TEXT DEFAULT 'FarmaSys POS'

            );



            CREATE TABLE IF NOT EXISTS detalle_transacciones (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                transaccion_id INTEGER NOT NULL,

                producto_id INTEGER NOT NULL,

                nombre_comercial TEXT NOT NULL,

                presentacion TEXT NOT NULL,

                cantidad_presentacion INTEGER NOT NULL,

                unidades_minimas_descontadas INTEGER NOT NULL,

                precio_unitario_presentacion REAL NOT NULL,

                subtotal REAL NOT NULL,

                stock_antes_unidades INTEGER NOT NULL,

                stock_despues_unidades INTEGER NOT NULL,

                FOREIGN KEY (transaccion_id) REFERENCES transacciones(id) ON DELETE CASCADE

            );



            CREATE TABLE IF NOT EXISTS movimientos_inventario (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                farmacia_id INTEGER NOT NULL,

                fecha_hora TEXT NOT NULL,

                producto_id INTEGER NOT NULL,

                tipo_movimiento TEXT NOT NULL,

                presentacion_operada TEXT NOT NULL,

                cantidad_presentacion INTEGER NOT NULL,

                cambio_unidades_minimas INTEGER NOT NULL,

                stock_anterior INTEGER NOT NULL,

                stock_resultante INTEGER NOT NULL,

                referencia_orden TEXT,

                usuario TEXT NOT NULL

            );



            CREATE TABLE IF NOT EXISTS inventario_auditoria_correcciones (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                farmacia_id INTEGER NOT NULL,

                producto_id INTEGER NOT NULL,

                producto_nombre TEXT NOT NULL,

                lote TEXT NOT NULL,

                campo_modificado TEXT NOT NULL,

                valor_anterior TEXT NOT NULL,

                valor_nuevo TEXT NOT NULL,

                usuario TEXT NOT NULL,

                motivo TEXT NOT NULL,

                fecha_hora TEXT NOT NULL

            );



            CREATE TABLE IF NOT EXISTS notificaciones_whatsapp (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                farmacia_id INTEGER NOT NULL,

                fecha_hora TEXT NOT NULL,

                codigo_orden TEXT NOT NULL,

                destinatario_rol TEXT NOT NULL,

                telefono_destino TEXT NOT NULL,

                proveedor_api TEXT NOT NULL,

                endpoint_url TEXT NOT NULL,

                mensaje_texto TEXT NOT NULL,

                payload_json TEXT NOT NULL,

                respuesta_json TEXT NOT NULL,

                http_status INTEGER NOT NULL,

                enviado_en_vivo INTEGER NOT NULL DEFAULT 0

            );



            CREATE TABLE IF NOT EXISTS recetas_medicas (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                farmacia_id INTEGER NOT NULL,

                codigo_receta TEXT UNIQUE NOT NULL,

                fecha_emision TEXT NOT NULL,

                paciente_nombre TEXT NOT NULL,

                paciente_cedula TEXT DEFAULT '',

                paciente_telefono TEXT DEFAULT '',

                medico_nombre TEXT NOT NULL,

                medico_exequatur TEXT DEFAULT '',

                centro_medico TEXT DEFAULT '',

                medicamentos_prescritos TEXT NOT NULL,

                diagnostico TEXT DEFAULT '',

                receta_imagen_url TEXT DEFAULT '',

                estado TEXT NOT NULL DEFAULT 'PENDIENTE',

                fecha_despacho TEXT,

                despachado_por TEXT

            );

            """

        )



    def _init_schema(self) -> None:

        with self._get_connection() as conn:

            conn.executescript(

                """

                CREATE TABLE IF NOT EXISTS farmacias (

                    id INTEGER PRIMARY KEY AUTOINCREMENT,

                    uuid_farmacia TEXT UNIQUE NOT NULL,

                    codigo TEXT UNIQUE NOT NULL,

                    nombre TEXT NOT NULL,

                    eslogan TEXT NOT NULL DEFAULT 'Sistema de Farmacia',

                    ciudad_sector TEXT NOT NULL,

                    telefono TEXT NOT NULL DEFAULT '809-555-1234',

                    direccion TEXT NOT NULL,

                    telefono_whatsapp TEXT NOT NULL,

                    wa_activo INTEGER NOT NULL DEFAULT 1,

                    mensaje_factura TEXT NOT NULL DEFAULT '¡Gracias por su compra!',

                    usuario_admin TEXT NOT NULL DEFAULT 'admin',

                    clave_hash TEXT NOT NULL,

                    pista_clave_demo TEXT DEFAULT '',

                    rnc TEXT NOT NULL DEFAULT '1-31-99887-2',

                    banco_nombre TEXT NOT NULL DEFAULT 'Banco Popular / Banreservas',

                    banco_cuenta TEXT NOT NULL DEFAULT 'Popular: 789-451230-9 | Banreservas: 960-112233-4',

                    wa_provider TEXT NOT NULL DEFAULT 'META_CLOUD_API',

                    meta_phone_number_id TEXT NOT NULL DEFAULT '105928374650192',

                    meta_access_token TEXT NOT NULL DEFAULT '',

                    meta_api_version TEXT NOT NULL DEFAULT 'v20.0',

                    twilio_account_sid TEXT NOT NULL DEFAULT '',

                    twilio_auth_token TEXT NOT NULL DEFAULT '',

                    twilio_from_number TEXT NOT NULL DEFAULT 'whatsapp:+14155238886',

                    public_base_url TEXT NOT NULL DEFAULT 'http://localhost:8080',

                    horario TEXT NOT NULL DEFAULT 'Lun-Dom 7:00 AM - 11:00 PM',

                    activa INTEGER NOT NULL DEFAULT 1

                );



                CREATE TABLE IF NOT EXISTS personal_farmacia (

                    id INTEGER PRIMARY KEY AUTOINCREMENT,

                    farmacia_id INTEGER NOT NULL,

                    username TEXT NOT NULL,

                    nombre_completo TEXT NOT NULL,

                    rol TEXT NOT NULL DEFAULT 'VENDEDOR', -- 'ADMINISTRADOR' | 'VENDEDOR'

                    clave_hash TEXT NOT NULL,

                    pista_clave TEXT DEFAULT '',

                    fecha_creacion TEXT NOT NULL,

                    UNIQUE(farmacia_id, username),

                    FOREIGN KEY (farmacia_id) REFERENCES farmacias(id) ON DELETE CASCADE

                );



                CREATE TABLE IF NOT EXISTS deudores (

                    id INTEGER PRIMARY KEY AUTOINCREMENT,

                    farmacia_id INTEGER NOT NULL,

                    cliente_nombre TEXT NOT NULL,

                    cliente_telefono TEXT NOT NULL,

                    cedula TEXT DEFAULT '',

                    concepto TEXT NOT NULL,

                    monto_deuda_rd REAL NOT NULL,

                    monto_abonado_rd REAL NOT NULL DEFAULT 0.0,

                    saldo_pendiente_rd REAL NOT NULL,

                    estado TEXT NOT NULL DEFAULT 'PENDIENTE', -- 'PENDIENTE' | 'PAGADO'

                    fecha_registro TEXT NOT NULL,

                    FOREIGN KEY (farmacia_id) REFERENCES farmacias(id) ON DELETE CASCADE

                );



                CREATE TABLE IF NOT EXISTS productos (

                    id INTEGER PRIMARY KEY AUTOINCREMENT,

                    farmacia_id INTEGER NOT NULL,

                    codigo_barras TEXT NOT NULL,

                    nombre_comercial TEXT NOT NULL,

                    principio_activo TEXT NOT NULL,

                    concentracion TEXT NOT NULL,

                    laboratorio TEXT NOT NULL,

                    categoria TEXT NOT NULL,

                    sintomas_tags TEXT NOT NULL,

                    unidad_minima_nombre TEXT NOT NULL DEFAULT 'Tableta',

                    precio_base REAL NOT NULL,

                    descuento_blister_pct REAL NOT NULL DEFAULT 5.0,

                    descuento_caja_pct REAL NOT NULL DEFAULT 12.0,

                    requiere_receta INTEGER NOT NULL DEFAULT 0,

                    unidades_por_blister INTEGER NOT NULL DEFAULT 10,

                    blisters_por_caja INTEGER NOT NULL DEFAULT 3,

                    stock_total_unidades INTEGER NOT NULL DEFAULT 0,

                    stock_minimo_alerta INTEGER NOT NULL DEFAULT 30,

                    lote TEXT NOT NULL DEFAULT 'LOT-2026-01',

                    fecha_vencimiento TEXT NOT NULL DEFAULT '2027-06-30',

                    ubicacion_anaquel TEXT NOT NULL DEFAULT 'A-01',

                    activo INTEGER NOT NULL DEFAULT 1,

                    UNIQUE(farmacia_id, codigo_barras),

                    FOREIGN KEY (farmacia_id) REFERENCES farmacias(id) ON DELETE CASCADE

                );



                CREATE TABLE IF NOT EXISTS transacciones (

                    id INTEGER PRIMARY KEY AUTOINCREMENT,

                    farmacia_id INTEGER NOT NULL,

                    codigo_orden TEXT UNIQUE NOT NULL,

                    canal TEXT NOT NULL, -- 'APP_PACIENTE' | 'POS_MOSTRADOR'

                    fecha_hora TEXT NOT NULL,

                    fecha_dia TEXT NOT NULL, -- YYYY-MM-DD

                    fecha_mes TEXT NOT NULL, -- YYYY-MM

                    cliente_nombre TEXT NOT NULL,

                    cliente_telefono TEXT NOT NULL,

                    cliente_direccion TEXT,

                    metodo_pago TEXT NOT NULL, -- 'TARJETA' | 'DEPOSITO_CUENTA' | 'EFECTIVO' | 'CREDITO_FIADO'

                    referencia_pago TEXT,

                    seguro_ars TEXT NOT NULL DEFAULT 'Sin Seguro',

                    cobertura_seguro_rd REAL NOT NULL DEFAULT 0.0,

                    subtotal REAL NOT NULL,

                    impuesto REAL NOT NULL DEFAULT 0.0,

                    total REAL NOT NULL,

                    requiere_validacion_receta INTEGER NOT NULL DEFAULT 0,

                    receta_imagen_url TEXT,

                    estado_pedido TEXT NOT NULL,

                    notas_farmaceutico TEXT,

                    atendido_por TEXT DEFAULT 'Sistema Omnicanal',

                    FOREIGN KEY (farmacia_id) REFERENCES farmacias(id) ON DELETE CASCADE

                );



                CREATE TABLE IF NOT EXISTS detalle_transacciones (

                    id INTEGER PRIMARY KEY AUTOINCREMENT,

                    transaccion_id INTEGER NOT NULL,

                    producto_id INTEGER NOT NULL,

                    nombre_comercial TEXT NOT NULL,

                    presentacion TEXT NOT NULL,

                    cantidad_presentacion INTEGER NOT NULL,

                    unidades_minimas_descontadas INTEGER NOT NULL,

                    precio_unitario_presentacion REAL NOT NULL,

                    subtotal REAL NOT NULL,

                    stock_antes_unidades INTEGER NOT NULL,

                    stock_despues_unidades INTEGER NOT NULL,

                    FOREIGN KEY (transaccion_id) REFERENCES transacciones(id) ON DELETE CASCADE,

                    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE

                );



                CREATE TABLE IF NOT EXISTS movimientos_inventario (

                    id INTEGER PRIMARY KEY AUTOINCREMENT,

                    farmacia_id INTEGER NOT NULL,

                    fecha_hora TEXT NOT NULL,

                    producto_id INTEGER NOT NULL,

                    tipo_movimiento TEXT NOT NULL,

                    presentacion_operada TEXT NOT NULL,

                    cantidad_presentacion INTEGER NOT NULL,

                    cambio_unidades_minimas INTEGER NOT NULL,

                    stock_anterior INTEGER NOT NULL,

                    stock_resultante INTEGER NOT NULL,

                    referencia_orden TEXT,

                    usuario TEXT NOT NULL,

                    FOREIGN KEY (farmacia_id) REFERENCES farmacias(id) ON DELETE CASCADE,

                    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE

                );



                CREATE TABLE IF NOT EXISTS notificaciones_whatsapp (

                    id INTEGER PRIMARY KEY AUTOINCREMENT,

                    farmacia_id INTEGER NOT NULL,

                    fecha_hora TEXT NOT NULL,

                    codigo_orden TEXT NOT NULL,

                    destinatario_rol TEXT NOT NULL,

                    telefono_destino TEXT NOT NULL,

                    proveedor_api TEXT NOT NULL,

                    endpoint_url TEXT NOT NULL,

                    mensaje_texto TEXT NOT NULL,

                    payload_json TEXT NOT NULL,

                    respuesta_json TEXT NOT NULL,

                    http_status INTEGER NOT NULL,

                    enviado_en_vivo INTEGER NOT NULL DEFAULT 0,

                    FOREIGN KEY (farmacia_id) REFERENCES farmacias(id) ON DELETE CASCADE

                );



                CREATE TABLE IF NOT EXISTS recetas_medicas (

                    id INTEGER PRIMARY KEY AUTOINCREMENT,

                    farmacia_id INTEGER NOT NULL,

                    codigo_receta TEXT UNIQUE NOT NULL,

                    fecha_emision TEXT NOT NULL,

                    paciente_nombre TEXT NOT NULL,

                    paciente_cedula TEXT DEFAULT '',

                    paciente_telefono TEXT DEFAULT '',

                    medico_nombre TEXT NOT NULL,

                    medico_exequatur TEXT DEFAULT '',

                    centro_medico TEXT DEFAULT '',

                    medicamentos_prescritos TEXT NOT NULL,

                    diagnostico TEXT DEFAULT '',

                    receta_imagen_url TEXT DEFAULT '',

                    estado TEXT NOT NULL DEFAULT 'PENDIENTE', -- 'PENDIENTE' | 'DESPACHADA'

                    fecha_despacho TEXT,

                    despachado_por TEXT,

                    FOREIGN KEY (farmacia_id) REFERENCES farmacias(id) ON DELETE CASCADE

                );



                CREATE TABLE IF NOT EXISTS pacientes_usuarios (

                    id INTEGER PRIMARY KEY AUTOINCREMENT,

                    nombre_completo TEXT NOT NULL,

                    telefono TEXT UNIQUE NOT NULL,

                    cedula TEXT DEFAULT '',

                    email TEXT DEFAULT '',

                    clave_hash TEXT NOT NULL,

                    pista_clave TEXT DEFAULT '',

                    direccion_frecuente TEXT DEFAULT '',

                    fecha_registro TEXT NOT NULL,

                    activo INTEGER NOT NULL DEFAULT 1

                );



                CREATE TABLE IF NOT EXISTS inventario_auditoria_correcciones (

                    id INTEGER PRIMARY KEY AUTOINCREMENT,

                    farmacia_id INTEGER NOT NULL,

                    producto_id INTEGER NOT NULL,

                    producto_nombre TEXT NOT NULL,

                    lote TEXT NOT NULL,

                    campo_modificado TEXT NOT NULL,

                    valor_anterior TEXT NOT NULL,

                    valor_nuevo TEXT NOT NULL,

                    usuario TEXT NOT NULL,

                    motivo TEXT NOT NULL,

                    fecha_hora TEXT NOT NULL,

                    FOREIGN KEY (farmacia_id) REFERENCES farmacias(id) ON DELETE CASCADE,

                    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE

                );

                """

            )



    @staticmethod
    def _base_catalog_templates(today: datetime) -> List[tuple]:
        return []
    def _enforce_clean_state(self) -> None:
        """Purga cualquier farmacia de prueba residual, mercancias demo y bases huerfanas."""
        try:
            import glob
            with self._get_connection() as mconn:
                test_codes = "('DAVALSI-PIANTINI', 'DAVALSI-NACO', 'FARMACIA-SANTIAGO', 'TEST-01', 'DAVALSI-BV', 'FARMASYS-DEMO-01')"
                mconn.execute(f"DELETE FROM farmacias WHERE codigo IN {test_codes}")
                mconn.execute(f"DELETE FROM farmacias_directorio WHERE codigo IN {test_codes}")
                mconn.execute("DELETE FROM productos WHERE nombre_comercial LIKE '%Desodorante%' OR nombre_comercial LIKE '%Lima%' OR codigo_barras LIKE '7460101009%'")
                mconn.execute("DELETE FROM personal_farmacia WHERE username IN ('carmen.pos', 'admin.naco', 'admin.santiago')")
                mconn.commit()

                cnt = mconn.execute("SELECT COUNT(*) FROM farmacias_directorio WHERE activa = 1").fetchone()[0]
                if cnt == 0:
                    for f in glob.glob(os.path.join(self.tenants_dir, "*.db")):
                        try:
                            os.remove(f)
                        except Exception:
                            pass
        except Exception:
            pass

    def _seed_initial_data(self) -> None:
        pass


    def _seed_historical_sales(self, conn: sqlite3.Connection, now: datetime) -> None:
        pass


    def list_public_pharmacies(self) -> List[Dict[str, Any]]:

        # Si existe la base maestra, consultar el directorio central de farmacias

        if os.path.isfile(self.master_db_path):

            with self._get_connection() as conn:

                try:

                    rows = conn.execute(

                        """

                        SELECT id, uuid_farmacia, codigo, nombre, eslogan, ciudad_sector,

                               telefono, direccion, telefono_whatsapp, wa_activo, mensaje_factura,

                               usuario_admin, pista_clave_demo, rnc, banco_nombre, banco_cuenta, horario, db_filename,

                               pago_tarjeta_activo, envio_domicilio_activo, seguro_medico_activo

                        FROM farmacias_directorio

                        WHERE activa = 1

                        ORDER BY id ASC

                        """

                    ).fetchall()

                    if rows:

                        out = []

                        for r in rows:

                            d = dict(r)

                            d["wa_activo"] = bool(d.get("wa_activo", 1))

                            d["pago_tarjeta_activo"] = bool(d.get("pago_tarjeta_activo", 1))

                            d["envio_domicilio_activo"] = bool(d.get("envio_domicilio_activo", 1))

                            d["seguro_medico_activo"] = bool(d.get("seguro_medico_activo", 1))

                            t_cfg = self.get_pharmacy_config(d["id"])

                            if t_cfg:

                                d["pago_tarjeta_activo"] = t_cfg["pago_tarjeta_activo"]

                                d["envio_domicilio_activo"] = t_cfg["envio_domicilio_activo"]

                                d["seguro_medico_activo"] = t_cfg["seguro_medico_activo"]

                            out.append(d)

                        return out

                except Exception:

                    pass



        with self._get_connection() as conn:

            rows = conn.execute(

                """

                SELECT id, uuid_farmacia, codigo, nombre, eslogan, ciudad_sector,

                       telefono, direccion, telefono_whatsapp, wa_activo, mensaje_factura,

                       usuario_admin, pista_clave_demo, rnc, banco_nombre, banco_cuenta, horario,

                       pago_tarjeta_activo, envio_domicilio_activo, seguro_medico_activo

                FROM farmacias

                WHERE activa = 1

                ORDER BY id ASC

                """

            ).fetchall()

            out = []

            for r in rows:

                d = dict(r)

                d["wa_activo"] = bool(d.get("wa_activo", 1))

                d["pago_tarjeta_activo"] = bool(d.get("pago_tarjeta_activo", 1))

                d["envio_domicilio_activo"] = bool(d.get("envio_domicilio_activo", 1))

                d["seguro_medico_activo"] = bool(d.get("seguro_medico_activo", 1))

                out.append(d)

            return out



    def authenticate_pharmacy(

        self, farmacia_id: int, clave_acceso: str, username: str = ""

    ) -> Dict[str, Any]:

        """

        Valida la clave de acceso de la farmacia de manera 100% independiente en su propia base de datos.

        Verifica tanto la clave principal del Administrador como los usuarios registrados en personal_farmacia.

        """

        clave_clean = str(clave_acceso or "").strip()

        username_clean = str(username or "").strip().lower()

        fid = int(farmacia_id)



        if not clave_clean:

            raise ValueError("Debe ingresar la clave de acceso de la farmacia.")



        hashed = hash_password(clave_clean)



        # Consultar la base de datos separada de esta farmacia

        with self._get_connection(farmacia_id=fid) as conn:

            row = conn.execute(

                "SELECT * FROM farmacias WHERE id = ? AND activa = 1",

                (fid,),

            ).fetchone()

            if not row:

                row = conn.execute("SELECT * FROM farmacias LIMIT 1").fetchone()

                if not row:

                    raise ValueError("Farmacia no encontrada en su base de datos separada.")



            # 1. Comprobar si coincide con la clave maestra de la farmacia

            is_admin_match = (

                row["clave_hash"] == hashed or

                (row["pista_clave_demo"] and row["pista_clave_demo"].strip() == clave_clean)

            )



            # 2. Comprobar si coincide con personal_farmacia (vendedores o personal)

            staff_query = "SELECT * FROM personal_farmacia WHERE (clave_hash = ? OR pista_clave = ?)"

            staff_params: List[Any] = [hashed, clave_clean]

            if username_clean and username_clean not in ("admin", str(row["usuario_admin"]).lower()):

                staff_query += " AND LOWER(username) = ?"

                staff_params.append(username_clean)



            staff_row = conn.execute(staff_query, staff_params).fetchone()



            if not is_admin_match and not staff_row:

                raise ValueError("Clave de acceso o usuario incorrecto para esta farmacia.")



            d = dict(row)

            d.pop("clave_hash", None)

            d["wa_activo"] = bool(d.get("wa_activo", 1))

            d["pago_tarjeta_activo"] = bool(d.get("pago_tarjeta_activo", 1))

            d["envio_domicilio_activo"] = bool(d.get("envio_domicilio_activo", 1))

            d["seguro_medico_activo"] = bool(d.get("seguro_medico_activo", 1))

            if staff_row and not is_admin_match:

                d["usuario_actual"] = staff_row["username"]

                d["nombre_usuario_actual"] = staff_row["nombre_completo"]

                d["rol_actual"] = staff_row["rol"]

            else:

                d["usuario_actual"] = d["usuario_admin"]

                d["nombre_usuario_actual"] = f"{d['usuario_admin']} (Administrador)"

                d["rol_actual"] = "ADMINISTRADOR"

            return d



    def create_pharmacy(self, data: Dict[str, Any]) -> Dict[str, Any]:

        """

        Crea una farmacia completamente nueva con su PROPIA BASE DE DATOS FÍSICA SEPARADA (Multi-Tenant).

        Crea el archivo SQLite independiente en data/tenants/, inicializa el esquema y carga su catálogo.

        """

        nombre = str(data.get("nombre", "")).strip()

        eslogan = str(data.get("eslogan", "FarmaSys POS")).strip() or "FarmaSys POS"

        codigo = str(data.get("codigo", "")).strip().upper() or f"FARM-{int(datetime.now().timestamp())}"

        ciudad_sector = str(data.get("ciudad_sector", "Santo Domingo")).strip()

        telefono = str(data.get("telefono", "809-555-1234")).strip()

        direccion = str(data.get("direccion", "")).strip()

        telefono_wa = str(data.get("telefono_whatsapp", "18095550100")).strip()

        usuario_admin = str(data.get("usuario_admin", "admin")).strip() or "admin"

        clave_acceso = str(data.get("clave_acceso", "")).strip()

        rnc = str(data.get("rnc", "1-31-99887-2")).strip()

        banco_nombre = str(data.get("banco_nombre", "Banco Popular / Banreservas")).strip()

        banco_cuenta = str(data.get("banco_cuenta", "Popular: 789-451230-9")).strip()

        clonar_catalogo = bool(data.get("clonar_catalogo_base", True))



        if not nombre or not clave_acceso:

            raise ValueError("El nombre de la farmacia y su clave de acceso son obligatorios.")



        # Verificar unicidad del código en master DB

        if os.path.isfile(self.master_db_path):

            with self._get_connection() as mconn:

                existing = mconn.execute("SELECT id FROM farmacias_directorio WHERE UPPER(codigo) = ?", (codigo,)).fetchone()

                if existing:

                    raise ValueError(f"Ya existe una farmacia registrada con el código '{codigo}'. Por favor utiliza un código único.")



        new_uuid = str(uuid.uuid4())

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        code_slug = codigo.replace(' ', '_').replace('-', '_').lower()



        # 1. Registrar en el directorio maestro de farmacias

        new_farm_id = None

        db_filename = ""

        if os.path.isfile(self.master_db_path):

            with self._get_connection() as mconn:

                cur = mconn.execute(

                    """

                    INSERT INTO farmacias_directorio (

                        uuid_farmacia, codigo, nombre, eslogan, ciudad_sector,

                        telefono, direccion, telefono_whatsapp, wa_activo, mensaje_factura,

                        usuario_admin, clave_hash, pista_clave_demo, rnc, banco_nombre, banco_cuenta,

                        db_filename, activa, fecha_creacion

                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, '¡Gracias por su compra en FarmaSys!', ?, ?, ?, ?, ?, ?, '', 1, ?)

                    """,

                    (

                        new_uuid, codigo, nombre, eslogan, ciudad_sector, telefono,

                        direccion or ciudad_sector, telefono_wa, usuario_admin,

                        hash_password(clave_acceso), clave_acceso, rnc, banco_nombre, banco_cuenta, now_str

                    )

                )

                new_farm_id = cur.lastrowid

                db_filename = f"farmacia_{new_farm_id}_{code_slug}.db"

                mconn.execute("UPDATE farmacias_directorio SET db_filename = ? WHERE id = ?", (db_filename, new_farm_id))



        if not new_farm_id:

            new_farm_id = int(datetime.now().timestamp())

            db_filename = f"farmacia_{new_farm_id}_{code_slug}.db"



        # 2. CREAR BASE DE DATOS FÍSICA INDEPENDIENTE PARA ESTA FARMACIA

        tenant_db_path = os.path.join(self.tenants_dir, db_filename)

        t_conn = sqlite3.connect(tenant_db_path, timeout=15.0)

        t_conn.row_factory = sqlite3.Row

        t_conn.execute("PRAGMA journal_mode = WAL;")

        self._init_tenant_schema_on_connection(t_conn)



        # Insertar registro de la farmacia en su propia base de datos

        t_conn.execute(

            """

            INSERT OR REPLACE INTO farmacias (

                id, uuid_farmacia, codigo, nombre, eslogan, ciudad_sector,

                telefono, direccion, telefono_whatsapp, wa_activo, mensaje_factura,

                usuario_admin, clave_hash, pista_clave_demo, rnc, banco_nombre, banco_cuenta, activa

            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, '¡Gracias por su compra en FarmaSys!', ?, ?, ?, ?, ?, ?, 1)

            """,

            (

                new_farm_id, new_uuid, codigo, nombre, eslogan, ciudad_sector, telefono,

                direccion or ciudad_sector, telefono_wa, usuario_admin,

                hash_password(clave_acceso), clave_acceso, rnc, banco_nombre, banco_cuenta

            )

        )



        # Crear el usuario Administrador en personal_farmacia de su base de datos

        t_conn.execute(

            """

            INSERT INTO personal_farmacia (

                farmacia_id, username, nombre_completo, rol, clave_hash, pista_clave, fecha_creacion

            ) VALUES (?, ?, ?, 'ADMINISTRADOR', ?, ?, ?)

            """,

            (new_farm_id, usuario_admin, f"{usuario_admin} (Administrador)", hash_password(clave_acceso), clave_acceso, now_str),

        )



        # Clonar catálogo base si fue seleccionado

        if clonar_catalogo:

            now = datetime.now()

            for tpl in self._base_catalog_templates(now):

                (

                    cb, nom, pa, conc, lab, cat, sint, u_nom,

                    p_base, d_blist, d_caja, req_rec, u_blist, b_caja,

                    stock_u, stock_min, lote, f_venc, anaq

                ) = tpl

                t_conn.execute(

                    """

                    INSERT INTO productos (

                        farmacia_id, codigo_barras, nombre_comercial, principio_activo,

                        concentracion, laboratorio, categoria, sintomas_tags,

                        unidad_minima_nombre, precio_base, descuento_blister_pct,

                        descuento_caja_pct, requiere_receta, unidades_por_blister,

                        blisters_por_caja, stock_total_unidades, stock_minimo_alerta,

                        lote, fecha_vencimiento, ubicacion_anaquel

                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

                    """,

                    (

                        new_farm_id, cb, nom, pa, conc, lab, cat, sint, u_nom,

                        p_base, d_blist, d_caja, req_rec, u_blist, b_caja,

                        stock_u, stock_min, f"{lote}-F{new_farm_id}", f_venc, anaq,

                    ),

                )



        t_conn.commit()

        t_conn.close()



        # También insertar en DB fallback para soporte en tests sin master_db

        with self._get_connection(farmacia_id=new_farm_id) as conn:

            row = conn.execute("SELECT * FROM farmacias WHERE id = ?", (new_farm_id,)).fetchone()

            out = dict(row) if row else {"id": new_farm_id, "nombre": nombre, "codigo": codigo}

            out.pop("clave_hash", None)

            out["wa_activo"] = bool(out.get("wa_activo", 1))

            out["usuario_actual"] = usuario_admin

            out["rol_actual"] = "ADMINISTRADOR"

            out["db_filename"] = db_filename

            return out



    def delete_pharmacy(self, farmacia_id: int) -> Dict[str, Any]:

        """

        Elimina permanentemente una farmacia y borra su archivo de base de datos físico.

        """

        fid = int(farmacia_id)

        db_filename = None

        nombre = f"Farmacia #{fid}"

        uuid_f = ""



        # Eliminar del directorio maestro

        if os.path.isfile(self.master_db_path):

            with self._get_connection() as mconn:

                cnt = mconn.execute("SELECT COUNT(*) FROM farmacias_directorio WHERE activa = 1").fetchone()[0]

                if cnt <= 1:

                    raise ValueError("No puedes eliminar la única farmacia activa del sistema. Crea otra primero.")

                row = mconn.execute("SELECT id, nombre, uuid_farmacia, db_filename FROM farmacias_directorio WHERE id = ?", (fid,)).fetchone()

                if row:

                    nombre = row["nombre"]

                    uuid_f = row["uuid_farmacia"]

                    db_filename = row["db_filename"]

                    mconn.execute("DELETE FROM farmacias_directorio WHERE id = ?", (fid,))



        # Eliminar archivo de base de datos físico del tenant

        if db_filename:

            t_path = os.path.join(self.tenants_dir, db_filename)

            if os.path.isfile(t_path):

                try:

                    os.remove(t_path)

                except Exception:

                    pass



        return {"deleted_id": fid, "nombre": nombre, "uuid": uuid_f}



    def list_staff(self, farmacia_id: int) -> List[Dict[str, Any]]:

        with self._get_connection(farmacia_id=int(farmacia_id)) as conn:

            rows = conn.execute(

                """

                SELECT id, farmacia_id, username, nombre_completo, rol, pista_clave, fecha_creacion

                FROM personal_farmacia

                WHERE farmacia_id = ?

                ORDER BY CASE WHEN rol = 'ADMINISTRADOR' THEN 0 ELSE 1 END, id ASC

                """,

                (int(farmacia_id),),

            ).fetchall()

            return [dict(r) for r in rows]



    def create_seller(self, farmacia_id: int, data: Dict[str, Any]) -> Dict[str, Any]:

        """

        Registra un nuevo vendedor en la farmacia.

        Regla de negocio (Captura 5): 'Todos nacen como vendedor y no pueden cambiar su rol.'

        """

        username = str(data.get("username", "")).strip()

        nombre_completo = str(data.get("nombre_completo", "")).strip() or username

        clave = str(data.get("clave_acceso", "")).strip()

        if not username or not clave:

            raise ValueError("El usuario y la clave del vendedor son obligatorios.")



        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        with self._get_connection() as conn:

            cur = conn.execute(

                """

                INSERT INTO personal_farmacia (

                    farmacia_id, username, nombre_completo, rol, clave_hash, pista_clave, fecha_creacion

                ) VALUES (?, ?, ?, 'VENDEDOR', ?, ?, ?)

                """,

                (int(farmacia_id), username, nombre_completo, hash_password(clave), clave, now_str),

            )

            row = conn.execute(

                "SELECT id, farmacia_id, username, nombre_completo, rol, pista_clave, fecha_creacion FROM personal_farmacia WHERE id = ?",

                (cur.lastrowid,),

            ).fetchone()

            return dict(row)



    def delete_seller(self, farmacia_id: int, staff_id: int) -> None:

        with self._get_connection(farmacia_id=int(farmacia_id)) as conn:

            row = conn.execute(

                "SELECT rol FROM personal_farmacia WHERE id = ? AND farmacia_id = ?",

                (int(staff_id), int(farmacia_id)),

            ).fetchone()

            if not row:

                raise ValueError("Registro de personal no encontrado.")

            if row["rol"] == "ADMINISTRADOR":

                raise ValueError("No se puede eliminar al Administrador principal de la farmacia.")

            conn.execute("DELETE FROM personal_farmacia WHERE id = ? AND farmacia_id = ?", (int(staff_id), int(farmacia_id)))



    # =========================================================================

    # DEUDORES / CUENTAS POR COBRAR POR FARMACIA

    # =========================================================================



    def list_debtors(self, farmacia_id: int) -> List[Dict[str, Any]]:

        with self._get_connection(farmacia_id=int(farmacia_id)) as conn:

            rows = conn.execute(

                "SELECT * FROM deudores WHERE farmacia_id = ? ORDER BY estado ASC, id DESC",

                (int(farmacia_id),),

            ).fetchall()

            return [dict(r) for r in rows]



    def create_debtor(self, farmacia_id: int, data: Dict[str, Any]) -> Dict[str, Any]:

        nombre = str(data.get("cliente_nombre", "")).strip()

        telefono = str(data.get("cliente_telefono", "")).strip()

        cedula = str(data.get("cedula", "")).strip()

        concepto = str(data.get("concepto", "Venta a crédito en farmacia")).strip()

        monto = round(float(data.get("monto_deuda_rd", 0.0)), 2)

        if not nombre or monto <= 0:

            raise ValueError("Nombre del deudor y monto mayor a RD$ 0 son obligatorios.")



        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        with self._get_connection() as conn:

            cur = conn.execute(

                """

                INSERT INTO deudores (

                    farmacia_id, cliente_nombre, cliente_telefono, cedula,

                    concepto, monto_deuda_rd, monto_abonado_rd, saldo_pendiente_rd, estado, fecha_registro

                ) VALUES (?, ?, ?, ?, ?, ?, 0.0, ?, 'PENDIENTE', ?)

                """,

                (int(farmacia_id), nombre, telefono, cedula, concepto, monto, monto, now_str),

            )

            row = conn.execute("SELECT * FROM deudores WHERE id = ?", (cur.lastrowid,)).fetchone()

            return dict(row)



    def pay_debtor(self, farmacia_id: int, deudor_id: int, abono_rd: float) -> Dict[str, Any]:

        abono = round(float(abono_rd), 2)

        if abono <= 0:

            raise ValueError("El monto del abono debe ser mayor a RD$ 0.")

        with self._get_connection() as conn:

            row = conn.execute(

                "SELECT * FROM deudores WHERE id = ? AND farmacia_id = ?",

                (int(deudor_id), int(farmacia_id)),

            ).fetchone()

            if not row:

                raise ValueError("Deudor no encontrado.")

            nuevo_abonado = round(float(row["monto_abonado_rd"]) + abono, 2)

            nuevo_saldo = max(0.0, round(float(row["monto_deuda_rd"]) - nuevo_abonado, 2))

            nuevo_estado = "PAGADO" if nuevo_saldo <= 0 else "PENDIENTE"

            conn.execute(

                "UPDATE deudores SET monto_abonado_rd = ?, saldo_pendiente_rd = ?, estado = ? WHERE id = ?",

                (nuevo_abonado, nuevo_saldo, nuevo_estado, int(deudor_id)),

            )

            updated = conn.execute("SELECT * FROM deudores WHERE id = ?", (int(deudor_id),)).fetchone()

            return dict(updated)



    # =========================================================================

    # RECETAS MÉDICAS POR FARMACIA (Captura 3)

    # =========================================================================



    def list_prescriptions(self, farmacia_id: int, estado: Optional[str] = None) -> List[Dict[str, Any]]:

        with self._get_connection(farmacia_id=int(farmacia_id)) as conn:

            query = "SELECT * FROM recetas_medicas WHERE farmacia_id = ?"

            params: List[Any] = [int(farmacia_id)]

            if estado and estado.upper() not in ("TODAS", "ALL", "TODO"):

                query += " AND estado = ?"

                params.append(estado.upper())

            query += " ORDER BY id DESC"

            rows = conn.execute(query, params).fetchall()

            return [dict(r) for r in rows]



    def create_prescription(self, farmacia_id: int, data: Dict[str, Any]) -> Dict[str, Any]:

        paciente_nombre = str(data.get("paciente_nombre", "")).strip()

        medico_nombre = str(data.get("medico_nombre", "")).strip()

        medicamentos = str(data.get("medicamentos_prescritos", "")).strip()

        if not paciente_nombre or not medico_nombre or not medicamentos:

            raise ValueError("Paciente, médico y medicamentos prescritos son requeridos.")



        codigo = f"RX-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

        fecha_emision = str(data.get("fecha_emision", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))).strip()



        with self._get_connection() as conn:

            cur = conn.execute(

                """

                INSERT INTO recetas_medicas (

                    farmacia_id, codigo_receta, fecha_emision, paciente_nombre, paciente_cedula,

                    paciente_telefono, medico_nombre, medico_exequatur, centro_medico,

                    medicamentos_prescritos, diagnostico, receta_imagen_url, estado

                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')

                """,

                (

                    int(farmacia_id),

                    codigo,

                    fecha_emision,

                    paciente_nombre,

                    str(data.get("paciente_cedula", "")).strip(),

                    str(data.get("paciente_telefono", "")).strip(),

                    medico_nombre,

                    str(data.get("medico_exequatur", "")).strip(),

                    str(data.get("centro_medico", "")).strip(),

                    medicamentos,

                    str(data.get("diagnostico", "")).strip(),

                    str(data.get("receta_imagen_url", "")).strip(),

                ),

            )

            row = conn.execute("SELECT * FROM recetas_medicas WHERE id = ?", (cur.lastrowid,)).fetchone()

            return dict(row)



    def dispatch_prescription(self, farmacia_id: int, receta_id: int, despachado_por: str = "Farmacéutico") -> Dict[str, Any]:

        with self._get_connection(farmacia_id=int(farmacia_id)) as conn:

            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            conn.execute(

                """

                UPDATE recetas_medicas

                SET estado = 'DESPACHADA', fecha_despacho = ?, despachado_por = ?

                WHERE id = ? AND farmacia_id = ?

                """,

                (now_str, despachado_por, int(receta_id), int(farmacia_id)),

            )

            row = conn.execute("SELECT * FROM recetas_medicas WHERE id = ?", (int(receta_id),)).fetchone()

            if not row:

                raise ValueError("Receta médica no encontrada.")

            return dict(row)



    def get_pharmacy_config(self, farmacia_id: int) -> Dict[str, Any]:

        with self._get_connection(farmacia_id=int(farmacia_id)) as conn:

            row = conn.execute("SELECT * FROM farmacias WHERE id = ?", (int(farmacia_id),)).fetchone()

            if not row:

                row = conn.execute("SELECT * FROM farmacias LIMIT 1").fetchone()

            if not row:

                return {}

            d = dict(row)

            d.pop("clave_hash", None)

            d["wa_activo"] = bool(d.get("wa_activo", 1))

            d["pago_tarjeta_activo"] = bool(d.get("pago_tarjeta_activo", 1))

            d["envio_domicilio_activo"] = bool(d.get("envio_domicilio_activo", 1))

            d["seguro_medico_activo"] = bool(d.get("seguro_medico_activo", 1))

            return d



    def update_pharmacy_config(self, farmacia_id: int, cfg: Dict[str, Any]) -> Dict[str, Any]:

        fid = int(farmacia_id)

        current = self.get_pharmacy_config(fid)

        if not current:

            raise ValueError("Farmacia no encontrada.")



        wa_activo_val = 1 if cfg.get("wa_activo", current.get("wa_activo", True)) else 0

        pago_tarjeta_val = 1 if cfg.get("pago_tarjeta_activo", current.get("pago_tarjeta_activo", True)) else 0

        envio_domicilio_val = 1 if cfg.get("envio_domicilio_activo", current.get("envio_domicilio_activo", True)) else 0

        seguro_medico_val = 1 if cfg.get("seguro_medico_activo", current.get("seguro_medico_activo", True)) else 0



        nombre_val = str(cfg.get("nombre", current["nombre"])).strip()

        eslogan_val = str(cfg.get("eslogan", current.get("eslogan", "Sistema de Farmacia"))).strip()

        rnc_val = str(cfg.get("rnc", current.get("rnc", "1-31-99887-2"))).strip()

        tel_val = str(cfg.get("telefono", current.get("telefono", "809-555-1234"))).strip()

        sector_val = str(cfg.get("ciudad_sector", current["ciudad_sector"])).strip()

        dir_val = str(cfg.get("direccion", current["direccion"])).strip()

        tel_wa_val = str(cfg.get("telefono_whatsapp", current["telefono_whatsapp"])).strip()

        msg_fac_val = str(cfg.get("mensaje_factura", current.get("mensaje_factura", "¡Gracias por su compra!"))).strip()

        banco_nom_val = str(cfg.get("banco_nombre", current["banco_nombre"])).strip()

        banco_cta_val = str(cfg.get("banco_cuenta", current["banco_cuenta"])).strip()

        wa_prov_val = str(cfg.get("wa_provider", current["wa_provider"])).strip()

        meta_id_val = str(cfg.get("meta_phone_number_id", current["meta_phone_number_id"])).strip()

        meta_tok_val = str(cfg.get("meta_access_token", current["meta_access_token"])).strip()

        tw_sid_val = str(cfg.get("twilio_account_sid", current["twilio_account_sid"])).strip()

        tw_tok_val = str(cfg.get("twilio_auth_token", current["twilio_auth_token"])).strip()

        pub_url_val = str(cfg.get("public_base_url", current["public_base_url"])).strip()

        horario_val = str(cfg.get("horario", current["horario"])).strip()

        nueva_clave = str(cfg.get("nueva_clave_acceso", "")).strip()



        def _apply_update(c: sqlite3.Connection) -> None:

            self._ensure_service_columns(c)

            try:

                c.execute(

                    """

                    UPDATE farmacias

                    SET nombre = ?, eslogan = ?, rnc = ?, telefono = ?,

                        ciudad_sector = ?, direccion = ?, telefono_whatsapp = ?,

                        wa_activo = ?, mensaje_factura = ?,

                        banco_nombre = ?, banco_cuenta = ?, wa_provider = ?,

                        meta_phone_number_id = ?, meta_access_token = ?,

                        twilio_account_sid = ?, twilio_auth_token = ?, public_base_url = ?, horario = ?,

                        pago_tarjeta_activo = ?, envio_domicilio_activo = ?, seguro_medico_activo = ?

                    WHERE id = ?

                    """,

                    (

                        nombre_val, eslogan_val, rnc_val, tel_val,

                        sector_val, dir_val, tel_wa_val,

                        wa_activo_val, msg_fac_val,

                        banco_nom_val, banco_cta_val, wa_prov_val,

                        meta_id_val, meta_tok_val,

                        tw_sid_val, tw_tok_val, pub_url_val, horario_val,

                        pago_tarjeta_val, envio_domicilio_val, seguro_medico_val,

                        fid,

                    ),

                )

                if nueva_clave:

                    c.execute(

                        "UPDATE farmacias SET clave_hash = ?, pista_clave_demo = ? WHERE id = ?",

                        (hash_password(nueva_clave), nueva_clave, fid),

                    )

            except Exception:

                pass

            try:

                c.execute(

                    """

                    UPDATE farmacias_directorio

                    SET nombre = ?, eslogan = ?, rnc = ?, telefono = ?,

                        ciudad_sector = ?, direccion = ?, telefono_whatsapp = ?,

                        wa_activo = ?, mensaje_factura = ?,

                        banco_nombre = ?, banco_cuenta = ?, horario = ?,

                        pago_tarjeta_activo = ?, envio_domicilio_activo = ?, seguro_medico_activo = ?

                    WHERE id = ?

                    """,

                    (

                        nombre_val, eslogan_val, rnc_val, tel_val,

                        sector_val, dir_val, tel_wa_val,

                        wa_activo_val, msg_fac_val,

                        banco_nom_val, banco_cta_val, horario_val,

                        pago_tarjeta_val, envio_domicilio_val, seguro_medico_val,

                        fid,

                    ),

                )

                if nueva_clave:

                    c.execute(

                        "UPDATE farmacias_directorio SET clave_hash = ?, pista_clave_demo = ? WHERE id = ?",

                        (hash_password(nueva_clave), nueva_clave, fid),

                    )

            except Exception:

                pass



        with self._get_connection(farmacia_id=fid) as t_conn:

            _apply_update(t_conn)



        with self._get_connection() as m_conn:

            _apply_update(m_conn)



        return self.get_pharmacy_config(fid)



    # =========================================================================

    # INVENTARIO POR FARMACIA Y ALERTAS DE VENCIMIENTO

    # =========================================================================



    def _seed_merchandise_if_missing(self, conn: sqlite3.Connection, farmacia_id: int) -> None:
        pass

    def _enrich_product(self, row: sqlite3.Row, monthly_sales: int = 0) -> Dict[str, Any]:

        d = dict(row)

        d["requiere_receta"] = bool(d["requiere_receta"])

        d["sintomas_lista"] = [s.strip() for s in d["sintomas_tags"].split(",") if s.strip()]



        u_blist = max(1, int(d.get("unidades_por_blister", 10)))

        b_caja = max(1, int(d.get("blisters_por_caja", 3)))

        u_caja = u_blist * b_caja



        breakdown = InventoryMathEngine.calculate_stock_breakdown(

            stock_total_unidades=d["stock_total_unidades"],

            unidades_por_blister=u_blist,

            blisters_por_caja=b_caja,

            stock_minimo_alerta=d["stock_minimo_alerta"],

        )

        precios = InventoryMathEngine.calculate_presentation_prices(

            precio_base_unidad=d["precio_base"],

            unidades_por_blister=u_blist,

            blisters_por_caja=b_caja,

            descuento_blister_pct=d.get("descuento_blister_pct", 5.0),

            descuento_caja_pct=d.get("descuento_caja_pct", 12.0),

        )

        vencimiento = InventoryMathEngine.evaluate_expiration_status(d.get("fecha_vencimiento", ""))



        d["unidades_por_caja"] = u_caja

        d["permite_blister"] = (u_blist > 1)

        d["permite_caja"] = (u_caja > 1)

        d["es_mercancia"] = (u_blist <= 1 and u_caja <= 1)

        d["inventario"] = breakdown

        d["precios_presentacion"] = precios

        d["vencimiento"] = vencimiento

        return d



    def list_products(

        self,

        farmacia_id: int = 1,

        search: str = "",

        symptom: str = "",

        category: str = "",

        only_low_stock: bool = False,

        hide_expired: bool = False,

    ) -> List[Dict[str, Any]]:

        query = "SELECT * FROM productos WHERE activo = 1 AND farmacia_id = ?"

        params: List[Any] = [int(farmacia_id)]



        if search:

            q = f"%{search.strip()}%"

            query += " AND (nombre_comercial LIKE ? OR principio_activo LIKE ? OR codigo_barras LIKE ? OR categoria LIKE ? OR lote LIKE ? OR ubicacion_anaquel LIKE ? OR sintomas_tags LIKE ?)"

            params.extend([q, q, q, q, q, q, q])



        if symptom and symptom.lower() != "todos":

            query += " AND LOWER(sintomas_tags) LIKE ?"

            params.append(f"%{symptom.strip().lower()}%")



        if category and category.lower() != "todas":

            query += " AND LOWER(categoria) = ?"

            params.append(category.strip().lower())



        query += " ORDER BY id ASC"



        with self._get_connection(farmacia_id=int(farmacia_id)) as conn:

            self._seed_merchandise_if_missing(conn, int(farmacia_id))

            rows = conn.execute(query, params).fetchall()

            products = [self._enrich_product(r) for r in rows]



        if only_low_stock:

            products = [p for p in products if p["inventario"]["alerta_stock_bajo"]]



        if hide_expired:

            products = [p for p in products if not p["vencimiento"]["vencido"]]



        return products



    def create_or_update_product(self, data: Dict[str, Any]) -> Dict[str, Any]:

        farmacia_id = int(data.get("farmacia_id", 1))

        u_blister = max(1, int(data.get("unidades_por_blister", 10)))

        b_caja = max(1, int(data.get("blisters_por_caja", 3)))

        stock_unidades = max(0, int(data.get("stock_total_unidades", 0)))

        lote = str(data.get("lote", "LOT-2026-NEW")).strip() or "LOT-2026-NEW"

        fecha_vencimiento = str(data.get("fecha_vencimiento", "2027-12-31")).strip() or "2027-12-31"



        cb = str(data.get("codigo_barras", "")).strip()

        if not cb:

            import random

            cb = f"746{random.randint(1000000000, 9999999999)}"



        u_min_nombre = str(data.get("unidad_minima_nombre", "Unidad" if u_blister <= 1 else "Tableta")).strip() or "Unidad"

        ubi_anaquel = str(data.get("ubicacion_anaquel", "Mostrador - General")).strip() or "Mostrador - General"



        with self._get_connection(farmacia_id=farmacia_id) as conn:

            cur = conn.execute(

                """

                INSERT INTO productos (

                    farmacia_id, codigo_barras, nombre_comercial, principio_activo, concentracion,

                    laboratorio, categoria, sintomas_tags, unidad_minima_nombre,

                    precio_base, descuento_blister_pct, descuento_caja_pct, requiere_receta,

                    unidades_por_blister, blisters_por_caja, stock_total_unidades,

                    stock_minimo_alerta, lote, fecha_vencimiento, ubicacion_anaquel

                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

                """,

                (

                    farmacia_id,

                    cb,

                    str(data["nombre_comercial"]).strip(),

                    str(data.get("principio_activo", "N/A")).strip() or "N/A",

                    str(data.get("concentracion", "1 Unidad")).strip() or "1 Unidad",

                    str(data.get("laboratorio", "Distribución General")).strip() or "Distribución General",

                    str(data.get("categoria", "Cuidado Personal")).strip() or "Cuidado Personal",

                    str(data.get("sintomas_tags", "higiene,cuidado personal,farmacia")).strip() or "farmacia",

                    u_min_nombre,

                    float(data["precio_base"]),

                    float(data.get("descuento_blister_pct", 0.0 if u_blister <= 1 else 5.0)),

                    float(data.get("descuento_caja_pct", 10.0)),

                    1 if data.get("requiere_receta") else 0,

                    u_blister,

                    b_caja,

                    stock_unidades,

                    int(data.get("stock_minimo_alerta", 5)),

                    lote,

                    fecha_vencimiento,

                    ubi_anaquel,

                ),

            )

            new_id = cur.lastrowid

            row = conn.execute("SELECT * FROM productos WHERE id = ?", (new_id,)).fetchone()

            return self._enrich_product(row)



    def update_product(self, farmacia_id: int, producto_id: int, data: Dict[str, Any]) -> Dict[str, Any]:

        with self._get_connection(farmacia_id=int(farmacia_id)) as conn:

            conn.execute("BEGIN IMMEDIATE")

            row = conn.execute(

                "SELECT * FROM productos WHERE id = ? AND farmacia_id = ?",

                (int(producto_id), int(farmacia_id)),

            ).fetchone()

            if not row:

                raise ValueError("Producto no encontrado en esta farmacia.")



            u_blister = max(1, int(data.get("unidades_por_blister", row["unidades_por_blister"])))

            b_caja = max(1, int(data.get("blisters_por_caja", row["blisters_por_caja"])))

            stock_u = int(data.get("stock_total_unidades", row["stock_total_unidades"]))



            # Registro automtico en inventario_auditoria_correcciones

            usuario_audit = str(data.get("usuario", "Administrador")).strip()

            motivo_audit = str(data.get("motivo", data.get("audit_reason", "Correccin de error de digitacin"))).strip()



            diffs = []

            if float(data.get("precio_base", row["precio_base"])) != float(row["precio_base"]):

                diffs.append(("precio_base", f"RD$ {row['precio_base']:.2f}", f"RD$ {float(data.get('precio_base')):.2f}"))

            if int(data.get("stock_total_unidades", row["stock_total_unidades"])) != int(row["stock_total_unidades"]):

                diffs.append(("stock_total_unidades", f"{row['stock_total_unidades']} unid.", f"{int(data.get('stock_total_unidades'))} unid."))

            if str(data.get("lote", row["lote"])).strip() != str(row["lote"]).strip():

                diffs.append(("lote", str(row["lote"]), str(data.get("lote"))))

            if str(data.get("fecha_vencimiento", row["fecha_vencimiento"])).strip() != str(row["fecha_vencimiento"]).strip():

                diffs.append(("fecha_vencimiento", str(row["fecha_vencimiento"]), str(data.get("fecha_vencimiento"))))



            for campo, v_ant, v_nue in diffs:

                conn.execute(

                    """

                    INSERT INTO inventario_auditoria_correcciones (

                        farmacia_id, producto_id, producto_nombre, lote, campo_modificado,

                        valor_anterior, valor_nuevo, usuario, motivo, fecha_hora

                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

                    """,

                    (

                        int(farmacia_id), int(producto_id), row["nombre_comercial"],

                        str(data.get("lote", row["lote"])).strip(), campo, v_ant, v_nue,

                        usuario_audit, motivo_audit, datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                    )

                )



            conn.execute(

                """

                UPDATE productos

                SET nombre_comercial = ?,

                    principio_activo = ?,

                    concentracion = ?,

                    laboratorio = ?,

                    categoria = ?,

                    sintomas_tags = ?,

                    unidad_minima_nombre = ?,

                    precio_base = ?,

                    descuento_blister_pct = ?,

                    descuento_caja_pct = ?,

                    requiere_receta = ?,

                    unidades_por_blister = ?,

                    blisters_por_caja = ?,

                    stock_total_unidades = ?,

                    stock_minimo_alerta = ?,

                    lote = ?,

                    fecha_vencimiento = ?,

                    ubicacion_anaquel = ?

                WHERE id = ? AND farmacia_id = ?

                """,

                (

                    str(data.get("nombre_comercial", row["nombre_comercial"])).strip(),

                    str(data.get("principio_activo", row["principio_activo"])).strip(),

                    str(data.get("concentracion", row["concentracion"])).strip(),

                    str(data.get("laboratorio", row["laboratorio"])).strip(),

                    str(data.get("categoria", row["categoria"])).strip(),

                    str(data.get("sintomas_tags", row["sintomas_tags"])).strip(),

                    str(data.get("unidad_minima_nombre", row["unidad_minima_nombre"])).strip(),

                    float(data.get("precio_base", row["precio_base"])),

                    float(data.get("descuento_blister_pct", row["descuento_blister_pct"])),

                    float(data.get("descuento_caja_pct", row["descuento_caja_pct"])),

                    1 if data.get("requiere_receta", row["requiere_receta"]) else 0,

                    u_blister,

                    b_caja,

                    stock_u,

                    int(data.get("stock_minimo_alerta", row["stock_minimo_alerta"])),

                    str(data.get("lote", row["lote"])).strip(),

                    str(data.get("fecha_vencimiento", row["fecha_vencimiento"])).strip(),

                    str(data.get("ubicacion_anaquel", row["ubicacion_anaquel"])).strip(),

                    int(producto_id),

                    int(farmacia_id),

                ),

            )

            updated = conn.execute("SELECT * FROM productos WHERE id = ?", (int(producto_id),)).fetchone()

            return self._enrich_product(updated)



    def delete_product(self, farmacia_id: int, producto_id: int) -> Dict[str, Any]:

        with self._get_connection(farmacia_id=int(farmacia_id)) as conn:

            conn.execute("BEGIN IMMEDIATE")

            row = conn.execute(

                "SELECT * FROM productos WHERE id = ? AND farmacia_id = ?",

                (int(producto_id), int(farmacia_id)),

            ).fetchone()

            if not row:

                raise ValueError("Producto no encontrado o no pertenece a esta farmacia.")



            nom = row["nombre_comercial"]

            conn.execute("DELETE FROM productos WHERE id = ? AND farmacia_id = ?", (int(producto_id), int(farmacia_id)))

            return {"ok": True, "id": int(producto_id), "nombre_comercial": nom}



    def get_product_movements(self, farmacia_id: int, producto_id: int) -> List[Dict[str, Any]]:

        with self._get_connection(farmacia_id=int(farmacia_id)) as conn:

            rows = conn.execute(

                """

                SELECT m.*, p.nombre_comercial

                FROM movimientos_inventario m

                JOIN productos p ON p.id = m.producto_id

                WHERE m.farmacia_id = ? AND m.producto_id = ?

                ORDER BY m.id DESC LIMIT 100

                """,

                (int(farmacia_id), int(producto_id)),

            ).fetchall()

            return [dict(r) for r in rows]



    def replenish_stock(

        self,

        farmacia_id: int,

        producto_id: int,

        presentacion: str = "UNIDAD",

        cantidad: int = 1,

        modo: str = "SUMAR",

        nuevo_stock_directo: Optional[int] = None,

        lote: Optional[str] = None,

        fecha_vencimiento: Optional[str] = None,

        nuevo_precio_base: Optional[float] = None,

        nueva_ubicacion: Optional[str] = None,

        costo_compra: Optional[float] = None,

        motivo: str = "Entrada de nueva compra / Abastecimiento",

        usuario: str = "Lic. Farmacéutico Sucursal",

    ) -> Dict[str, Any]:

        with self._get_connection(farmacia_id=int(farmacia_id)) as conn:

            conn.execute("BEGIN IMMEDIATE")

            row = conn.execute(

                "SELECT * FROM productos WHERE id = ? AND farmacia_id = ?",

                (int(producto_id), int(farmacia_id)),

            ).fetchone()

            if not row:

                raise ValueError(f"Producto ID #{producto_id} no encontrado en la farmacia #{farmacia_id}.")



            stock_anterior = int(row["stock_total_unidades"])

            modo_upper = str(modo or "SUMAR").strip().upper()



            if modo_upper in ("REEMPLAZAR", "AJUSTAR", "FIJAR", "CAMBIAR"):

                if nuevo_stock_directo is not None:

                    stock_nuevo = max(0, int(nuevo_stock_directo))

                else:

                    stock_nuevo = max(0, int(cantidad))

                cambio_unidades = stock_nuevo - stock_anterior

                tipo_mov = "AJUSTE_VALOR_REAL"

                pres_op = "UNIDAD"

                cant_op = stock_nuevo

            else:

                unidades_sumar = InventoryMathEngine.convert_to_minimum_units(

                    presentation=presentacion,

                    quantity=int(cantidad),

                    unidades_por_blister=row["unidades_por_blister"],

                    blisters_por_caja=row["blisters_por_caja"],

                )

                stock_nuevo = stock_anterior + unidades_sumar

                cambio_unidades = unidades_sumar

                tipo_mov = "COMPRA_ABASTECIMIENTO"

                pres_op = presentacion.upper()

                cant_op = int(cantidad)



            nuevo_lote = (lote or "").strip() or row["lote"]

            nueva_fecha_venc = (fecha_vencimiento or "").strip() or row["fecha_vencimiento"]

            nuevo_precio = float(nuevo_precio_base) if nuevo_precio_base is not None and float(nuevo_precio_base) > 0 else float(row["precio_base"])

            nueva_ubic = (nueva_ubicacion or "").strip() or row["ubicacion_anaquel"]



            diffs = []

            if nuevo_precio != float(row["precio_base"]):

                diffs.append(("precio_base", f"RD$ {row['precio_base']:.2f}", f"RD$ {nuevo_precio:.2f}"))

            if stock_nuevo != stock_anterior:

                diffs.append(("stock_total_unidades", f"{stock_anterior} unid.", f"{stock_nuevo} unid."))

            if nuevo_lote != row["lote"]:

                diffs.append(("lote", str(row["lote"]), nuevo_lote))

            if nueva_fecha_venc != row["fecha_vencimiento"]:

                diffs.append(("fecha_vencimiento", str(row["fecha_vencimiento"]), nueva_fecha_venc))

            if nueva_ubic != row["ubicacion_anaquel"]:

                diffs.append(("ubicacion_anaquel", str(row["ubicacion_anaquel"]), nueva_ubic))



            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")



            for campo, v_ant, v_nue in diffs:

                try:

                    conn.execute(

                        """

                        INSERT INTO inventario_auditoria_correcciones (

                            farmacia_id, producto_id, producto_nombre, lote, campo_modificado,

                            valor_anterior, valor_nuevo, usuario, motivo, fecha_hora

                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

                        """,

                        (

                            int(farmacia_id), int(producto_id), row["nombre_comercial"],

                            nuevo_lote, campo, v_ant, v_nue,

                            usuario, motivo, now_str

                        ),

                    )

                except Exception:

                    pass



            conn.execute(

                """

                UPDATE productos

                SET stock_total_unidades = ?,

                    lote = ?,

                    fecha_vencimiento = ?,

                    precio_base = ?,

                    ubicacion_anaquel = ?

                WHERE id = ? AND farmacia_id = ?

                """,

                (stock_nuevo, nuevo_lote, nueva_fecha_venc, nuevo_precio, nueva_ubic, int(producto_id), int(farmacia_id)),

            )



            conn.execute(

                """

                INSERT INTO movimientos_inventario (

                    farmacia_id, fecha_hora, producto_id, tipo_movimiento, presentacion_operada,

                    cantidad_presentacion, cambio_unidades_minimas, stock_anterior,

                    stock_resultante, referencia_orden, usuario

                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

                """,

                (

                    int(farmacia_id),

                    now_str,

                    int(producto_id),

                    tipo_mov,

                    pres_op,

                    cant_op,

                    cambio_unidades,

                    stock_anterior,

                    stock_nuevo,

                    f"LOTE:{nuevo_lote} | {motivo}",

                    usuario,

                ),

            )



            updated = conn.execute(

                "SELECT * FROM productos WHERE id = ? AND farmacia_id = ?",

                (int(producto_id), int(farmacia_id)),

            ).fetchone()

            return self._enrich_product(updated)



    def adjust_stock(

        self,

        farmacia_id: int,

        producto_id: int,

        nuevo_stock_unidades: int,

        motivo: str = "Ajuste manual de inventario / Cuadratura",

        usuario: str = "Administrador",

    ) -> Dict[str, Any]:

        with self._get_connection(farmacia_id=int(farmacia_id)) as conn:

            conn.execute("BEGIN IMMEDIATE")

            row = conn.execute(

                "SELECT * FROM productos WHERE id = ? AND farmacia_id = ?",

                (int(producto_id), int(farmacia_id)),

            ).fetchone()

            if not row:

                raise ValueError("Producto no encontrado en esta farmacia.")



            stock_anterior = int(row["stock_total_unidades"])

            nuevo_stock = max(0, int(nuevo_stock_unidades))

            cambio_unidades = nuevo_stock - stock_anterior

            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")



            conn.execute(

                """

                UPDATE productos

                SET stock_total_unidades = ?

                WHERE id = ?

                """,

                (nuevo_stock, int(producto_id)),

            )

            conn.execute(

                """

                INSERT INTO movimientos_inventario (

                    farmacia_id, fecha_hora, producto_id, tipo_movimiento, presentacion_operada,

                    cantidad_presentacion, cambio_unidades_minimas, stock_anterior,

                    stock_resultante, referencia_orden, usuario

                ) VALUES (?, ?, ?, 'AJUSTE_MANUAL', 'UNIDAD', ?, ?, ?, ?, ?, ?)

                """,

                (

                    int(farmacia_id),

                    now_str,

                    int(producto_id),

                    abs(cambio_unidades),

                    cambio_unidades,

                    stock_anterior,

                    nuevo_stock,

                    f"AJUSTE: {motivo}",

                    usuario,

                ),

            )

            updated = conn.execute("SELECT * FROM productos WHERE id = ?", (int(producto_id),)).fetchone()

            return self._enrich_product(updated)



    # =========================================================================

    # PROCESAMIENTO DE VENTAS (POS MOSTRADOR & APP PACIENTE POR FARMACIA)

    # =========================================================================



    def process_sale(self, payload: Dict[str, Any]) -> Dict[str, Any]:

        farmacia_id = int(payload.get("farmacia_id", 1))

        canal = str(payload.get("canal", "APP_PACIENTE")).upper()

        items_req = payload.get("items", [])

        if not items_req:

            raise ValueError("El carrito de venta está vacío.")



        metodo_pago = str(payload.get("metodo_pago", "TARJETA")).upper()

        referencia_pago = str(payload.get("referencia_pago", "")).strip()

        seguro_ars = str(payload.get("seguro_ars", "Sin Seguro")).strip() or "Sin Seguro"

        modalidad_entrega = str(payload.get("modalidad_entrega", "DOMICILIO" if canal == "APP_PACIENTE" else "MOSTRADOR")).upper()



        # Validar reglas operativas configuradas en el Sistema POS (Tarjeta, Envío a Domicilio, Seguro Médico)

        cfg_farm = self.get_pharmacy_config(farmacia_id)

        if metodo_pago == "TARJETA" and not cfg_farm.get("pago_tarjeta_activo", True):

            raise ValueError("El pago con tarjeta se encuentra temporalmente bloqueado por configuración del sistema POS.")

        if seguro_ars != "Sin Seguro" and not cfg_farm.get("seguro_medico_activo", True):

            raise ValueError("El procesamiento de Seguro Médico (ARS) se encuentra temporalmente bloqueado por configuración del sistema POS.")

        if canal == "APP_PACIENTE" and modalidad_entrega == "DOMICILIO" and not cfg_farm.get("envio_domicilio_activo", True):

            raise ValueError("El servicio de Envío a Domicilio se encuentra temporalmente bloqueado. Por favor seleccione Retiro en Farmacia.")

        cliente_nombre = str(payload.get("cliente_nombre", "Cliente Mostrador")).strip() or "Cliente Mostrador"

        cliente_telefono = str(payload.get("cliente_telefono", "18095550100")).strip() or "18095550100"

        cliente_direccion = str(payload.get("cliente_direccion", "")).strip()

        receta_imagen_url = payload.get("receta_imagen_url")

        atendido_por = str(

            payload.get("atendido_por")

            or ("Cajero POS Mostrador" if canal == "POS_MOSTRADOR" else "App Móvil Paciente")

        )



        with self._get_connection(farmacia_id=farmacia_id) as conn:

            conn.execute("BEGIN IMMEDIATE")

            evaluated_items = []

            subtotal_orden = 0.0

            requiere_receta_orden = False



            for item in items_req:

                prod_id = int(item["producto_id"])

                presentacion = str(item.get("presentacion", PRESENTATION_UNIT)).upper()

                cantidad = int(item.get("cantidad", 1))



                prod_row = conn.execute(

                    "SELECT * FROM productos WHERE id = ? AND farmacia_id = ? AND activo = 1",

                    (prod_id, farmacia_id),

                ).fetchone()

                if not prod_row:

                    raise ValueError(f"El producto ID #{prod_id} no pertenece al inventario de esta farmacia.")



                prod_dict = dict(prod_row)

                if bool(prod_dict["requiere_receta"]):

                    requiere_receta_orden = True



                unidades_descontar, precio_unit_pres, subtotal_linea = (

                    InventoryMathEngine.evaluate_sale_item(

                        product_row=prod_dict,

                        presentation=presentacion,

                        quantity=cantidad,

                    )

                )



                stock_antes = int(prod_dict["stock_total_unidades"])

                stock_despues = stock_antes - unidades_descontar



                conn.execute(

                    "UPDATE productos SET stock_total_unidades = ? WHERE id = ?",

                    (stock_despues, prod_id),

                )



                evaluated_items.append(

                    {

                        "producto_id": prod_id,

                        "nombre_comercial": prod_dict["nombre_comercial"],

                        "unidad_minima_nombre": prod_dict["unidad_minima_nombre"],

                        "presentacion": presentacion,

                        "cantidad_presentacion": cantidad,

                        "unidades_minimas_descontadas": unidades_descontar,

                        "precio_unitario_presentacion": precio_unit_pres,

                        "subtotal": subtotal_linea,

                        "stock_antes_unidades": stock_antes,

                        "stock_despues_unidades": stock_despues,

                    }

                )

                subtotal_orden = round(subtotal_orden + subtotal_linea, 2)



            if canal == "APP_PACIENTE" and requiere_receta_orden and not receta_imagen_url:

                raise ValueError(

                    "Uno o más medicamentos regulados en tu pedido requieren adjuntar la foto de la receta médica obligatoria."

                )



            cobertura_seguro = round(float(payload.get("cobertura_seguro_rd", 0.0)), 2)

            total_orden = max(0.0, round(subtotal_orden - cobertura_seguro, 2))



            next_seq = conn.execute("SELECT COALESCE(MAX(id), 1000) + 1001 FROM transacciones").fetchone()[0]

            codigo_orden = f"DAV-{next_seq}"

            now = datetime.now()

            now_str = now.strftime("%Y-%m-%d %H:%M:%S")

            fecha_dia = now.strftime("%Y-%m-%d")

            fecha_mes = now.strftime("%Y-%m")



            if canal == "POS_MOSTRADOR":

                estado_pedido = "COMPLETADO_POS"

            else:

                estado_pedido = "PENDIENTE_RECETA" if requiere_receta_orden else "EN_PREPARACION"



            cur = conn.execute(

                """

                INSERT INTO transacciones (

                    farmacia_id, codigo_orden, canal, fecha_hora, fecha_dia, fecha_mes,

                    cliente_nombre, cliente_telefono, cliente_direccion, metodo_pago,

                    referencia_pago, seguro_ars, cobertura_seguro_rd, subtotal, impuesto,

                    total, requiere_validacion_receta, receta_imagen_url, estado_pedido,

                    notas_farmaceutico, atendido_por

                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, ?, ?, ?, ?, ?, ?)

                """,

                (

                    farmacia_id,

                    codigo_orden,

                    canal,

                    now_str,

                    fecha_dia,

                    fecha_mes,

                    cliente_nombre,

                    cliente_telefono,

                    cliente_direccion,

                    metodo_pago,

                    referencia_pago,

                    seguro_ars,

                    cobertura_seguro,

                    subtotal_orden,

                    total_orden,

                    1 if requiere_receta_orden else 0,

                    receta_imagen_url,

                    estado_pedido,

                    "Pendiente de validación farmacéutica" if estado_pedido == "PENDIENTE_RECETA" else "Procesado correctamente",

                    atendido_por,

                ),

            )

            transaccion_id = cur.lastrowid



            # Si el método de pago es CREDITO_FIADO, registrar automáticamente en la tabla de deudores

            if metodo_pago == "CREDITO_FIADO" and total_orden > 0:

                resumen_items = ", ".join(f"{i['cantidad_presentacion']}x {i['presentacion']} {i['nombre_comercial']}" for i in evaluated_items)

                conn.execute(

                    """

                    INSERT INTO deudores (

                        farmacia_id, cliente_nombre, cliente_telefono, cedula,

                        concepto, monto_deuda_rd, monto_abonado_rd, saldo_pendiente_rd, estado, fecha_registro

                    ) VALUES (?, ?, ?, '', ?, ?, 0.0, ?, 'PENDIENTE', ?)

                    """,

                    (farmacia_id, cliente_nombre, cliente_telefono, f"Orden #{codigo_orden}: {resumen_items}", total_orden, total_orden, now_str),

                )



            tipo_mov = "VENTA_POS" if canal == "POS_MOSTRADOR" else "VENTA_APP"

            for ev in evaluated_items:

                conn.execute(

                    """

                    INSERT INTO detalle_transacciones (

                        transaccion_id, producto_id, nombre_comercial, presentacion,

                        cantidad_presentacion, unidades_minimas_descontadas,

                        precio_unitario_presentacion, subtotal, stock_antes_unidades, stock_despues_unidades

                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

                    """,

                    (

                        transaccion_id,

                        ev["producto_id"],

                        ev["nombre_comercial"],

                        ev["presentacion"],

                        ev["cantidad_presentacion"],

                        ev["unidades_minimas_descontadas"],

                        ev["precio_unitario_presentacion"],

                        ev["subtotal"],

                        ev["stock_antes_unidades"],

                        ev["stock_despues_unidades"],

                    ),

                )

                conn.execute(

                    """

                    INSERT INTO movimientos_inventario (

                        farmacia_id, fecha_hora, producto_id, tipo_movimiento, presentacion_operada,

                        cantidad_presentacion, cambio_unidades_minimas, stock_anterior,

                        stock_resultante, referencia_orden, usuario

                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

                    """,

                    (

                        farmacia_id,

                        now_str,

                        ev["producto_id"],

                        tipo_mov,

                        ev["presentacion"],

                        ev["cantidad_presentacion"],

                        -ev["unidades_minimas_descontadas"],

                        ev["stock_antes_unidades"],

                        ev["stock_despues_unidades"],

                        codigo_orden,

                        atendido_por,

                    ),

                )



            return {

                "id": transaccion_id,

                "farmacia_id": farmacia_id,

                "codigo_orden": codigo_orden,

                "canal": canal,

                "fecha_hora": now_str,

                "cliente_nombre": cliente_nombre,

                "cliente_telefono": cliente_telefono,

                "cliente_direccion": cliente_direccion,

                "metodo_pago": metodo_pago,

                "referencia_pago": referencia_pago,

                "seguro_ars": seguro_ars,

                "cobertura_seguro_rd": cobertura_seguro,

                "subtotal": subtotal_orden,

                "total": total_orden,

                "requiere_validacion_receta": requiere_receta_orden,

                "receta_imagen_url": receta_imagen_url,

                "estado_pedido": estado_pedido,

                "atendido_por": atendido_por,

                "items": evaluated_items,

            }



    def review_app_order(
        self,
        transaccion_id: int,
        accion: str,
        notas_farmaceutico: str = "",
        farmaceutico_nombre: str = "Lic. Farmacéutico de Turno",
        farmacia_id: int = 1,
    ) -> Dict[str, Any]:
        accion_up = accion.strip().upper()
        if accion_up not in {"APROBAR", "RECHAZAR"}:
            raise ValueError("Acción inválida. Use APROBAR o RECHAZAR.")

        with self._get_connection(farmacia_id=farmacia_id) as conn:

            conn.execute("BEGIN IMMEDIATE")

            tx = conn.execute(

                "SELECT * FROM transacciones WHERE id = ?", (int(transaccion_id),)

            ).fetchone()

            if not tx:

                raise ValueError("Orden no encontrada.")

            if tx["estado_pedido"] == "RECHAZADO_RECETA":

                raise ValueError("Esta orden ya fue rechazada y su stock fue reintegrado previamente.")



            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            if accion_up == "APROBAR":

                nuevo_estado = "APROBADO_DESPACHO"

                nota_final = notas_farmaceutico.strip() or f"Receta validada y despacho aprobado por {farmaceutico_nombre}"

                conn.execute(

                    """

                    UPDATE transacciones

                    SET estado_pedido = ?, notas_farmaceutico = ?, atendido_por = ?

                    WHERE id = ?

                    """,

                    (nuevo_estado, nota_final, farmaceutico_nombre, int(transaccion_id)),

                )

            else:

                nuevo_estado = "RECHAZADO_RECETA"

                nota_final = (

                    notas_farmaceutico.strip()

                    or f"Receta rechazada por {farmaceutico_nombre}. Stock reintegrado."

                )

                detalles = conn.execute(

                    "SELECT * FROM detalle_transacciones WHERE transaccion_id = ?",

                    (int(transaccion_id),),

                ).fetchall()

                for det in detalles:

                    prod_row = conn.execute(

                        "SELECT stock_total_unidades FROM productos WHERE id = ?",

                        (det["producto_id"],),

                    ).fetchone()

                    if prod_row:

                        st_ant = int(prod_row["stock_total_unidades"])

                        unidades_reintegrar = int(det["unidades_minimas_descontadas"])

                        st_nuevo = st_ant + unidades_reintegrar

                        conn.execute(

                            "UPDATE productos SET stock_total_unidades = ? WHERE id = ?",

                            (st_nuevo, det["producto_id"]),

                        )

                        conn.execute(

                            """

                            INSERT INTO movimientos_inventario (

                                farmacia_id, fecha_hora, producto_id, tipo_movimiento, presentacion_operada,

                                cantidad_presentacion, cambio_unidades_minimas, stock_anterior,

                                stock_resultante, referencia_orden, usuario

                            ) VALUES (?, ?, ?, 'REINTEGRO_RECHAZO', ?, ?, ?, ?, ?, ?, ?)

                            """,

                            (

                                tx["farmacia_id"],

                                now_str,

                                det["producto_id"],

                                det["presentacion"],

                                det["cantidad_presentacion"],

                                unidades_reintegrar,

                                st_ant,

                                st_nuevo,

                                tx["codigo_orden"],

                                farmaceutico_nombre,

                            ),

                        )



                conn.execute(

                    """

                    UPDATE transacciones

                    SET estado_pedido = ?, notas_farmaceutico = ?, atendido_por = ?

                    WHERE id = ?

                    """,

                    (nuevo_estado, nota_final, farmaceutico_nombre, int(transaccion_id)),

                )



        return self.get_transaction_by_id(int(transaccion_id))



    def get_transaction_by_id(self, transaccion_id: int) -> Dict[str, Any]:

        with self._get_connection() as conn:

            tx = conn.execute(

                "SELECT * FROM transacciones WHERE id = ?", (int(transaccion_id),)

            ).fetchone()

            if not tx:

                raise ValueError("Transacción no encontrada.")

            tx_dict = dict(tx)

            tx_dict["requiere_validacion_receta"] = bool(tx_dict["requiere_validacion_receta"])

            items = conn.execute(

                "SELECT * FROM detalle_transacciones WHERE transaccion_id = ? ORDER BY id ASC",

                (int(transaccion_id),),

            ).fetchall()

            tx_dict["items"] = [dict(i) for i in items]

            return tx_dict



    def list_transactions(

        self,

        farmacia_id: int = 1,

        canal: Optional[str] = None,

        periodo: str = "TODO",

        fecha_dia: Optional[str] = None,

        fecha_mes: Optional[str] = None,

        limit: int = 1000,

    ) -> List[Dict[str, Any]]:

        query = "SELECT * FROM transacciones WHERE farmacia_id = ?"

        params: List[Any] = [int(farmacia_id)]



        now = datetime.now()

        if fecha_dia:

            query += " AND fecha_dia = ?"

            params.append(str(fecha_dia).strip())

        elif fecha_mes:

            query += " AND fecha_mes = ?"

            params.append(str(fecha_mes).strip())

        else:

            p_up = (periodo or "TODO").upper()

            if p_up == "HOY":

                query += " AND fecha_dia = ?"

                params.append(now.strftime("%Y-%m-%d"))

            elif p_up == "MES":

                query += " AND fecha_mes = ?"

                params.append(now.strftime("%Y-%m"))



        if canal and canal.upper() in {"APP_PACIENTE", "POS_MOSTRADOR"}:

            query += " AND canal = ?"

            params.append(canal.upper())

        query += " ORDER BY id DESC LIMIT ?"

        params.append(int(limit))



        with self._get_connection(farmacia_id=farmacia_id) as conn:

            rows = conn.execute(query, params).fetchall()

            result = []

            for r in rows:

                d = dict(r)

                d["requiere_validacion_receta"] = bool(d["requiere_validacion_receta"])

                items = conn.execute(

                    "SELECT * FROM detalle_transacciones WHERE transaccion_id = ? ORDER BY id ASC",

                    (d["id"],),

                ).fetchall()

                d["items"] = [dict(i) for i in items]

                result.append(d)

            return result



    # =========================================================================

    # REPORTES DE VENTAS DIARIAS, MENSUALES, TICKET PROMEDIO Y VENCIMIENTOS

    # =========================================================================



    def get_dashboard_and_reports(self, farmacia_id: int = 1) -> Dict[str, Any]:

        fid = int(farmacia_id)

        products = self.list_products(farmacia_id=fid)

        low_stock_products = [p for p in products if p["inventario"]["alerta_stock_bajo"]]

        expired_products = [p for p in products if p["vencimiento"]["estado_vencimiento"] == "VENCIDO"]

        expiring_30d = [p for p in products if p["vencimiento"]["estado_vencimiento"] == "CRITICO_30D"]

        expiring_90d = [p for p in products if p["vencimiento"]["estado_vencimiento"] == "PREVENTIVO_90D"]

        expiring_7m = [p for p in products if p["vencimiento"].get("es_menor_7_meses") and not p["vencimiento"].get("vencido")]

        total_unidades_almacen = sum(p["inventario"]["stock_total_unidades"] for p in products)



        now = datetime.now()

        today_str = now.strftime("%Y-%m-%d")

        this_month_str = now.strftime("%Y-%m")



        with self._get_connection(farmacia_id=fid) as conn:

            row_hoy = conn.execute(

                "SELECT COALESCE(SUM(total), 0.0) AS suma, COUNT(*) AS cnt FROM transacciones WHERE farmacia_id = ? AND fecha_dia = ? AND estado_pedido != 'RECHAZADO_RECETA'",

                (fid, today_str),

            ).fetchone()



            row_mes = conn.execute(

                "SELECT COALESCE(SUM(total), 0.0) AS suma, COUNT(*) AS cnt FROM transacciones WHERE farmacia_id = ? AND fecha_mes = ? AND estado_pedido != 'RECHAZADO_RECETA'",

                (fid, this_month_str),

            ).fetchone()



            row_tot = conn.execute(

                "SELECT COALESCE(SUM(total), 0.0) AS suma, COUNT(*) AS cnt FROM transacciones WHERE farmacia_id = ? AND estado_pedido != 'RECHAZADO_RECETA'",

                (fid,),

            ).fetchone()



            ventas_pos = conn.execute(

                "SELECT COALESCE(SUM(total), 0.0) FROM transacciones WHERE farmacia_id = ? AND canal = 'POS_MOSTRADOR'",

                (fid,),

            ).fetchone()[0]



            ventas_app = conn.execute(

                "SELECT COALESCE(SUM(total), 0.0) FROM transacciones WHERE farmacia_id = ? AND canal = 'APP_PACIENTE' AND estado_pedido != 'RECHAZADO_RECETA'",

                (fid,),

            ).fetchone()[0]



            pedidos_pendientes_receta = conn.execute(

                "SELECT COUNT(*) FROM transacciones WHERE farmacia_id = ? AND canal = 'APP_PACIENTE' AND estado_pedido IN ('PENDIENTE_RECETA', 'EN_PREPARACION')",

                (fid,),

            ).fetchone()[0]



            deudores_pendientes = conn.execute(

                "SELECT COUNT(*), COALESCE(SUM(saldo_pendiente_rd), 0.0) FROM deudores WHERE farmacia_id = ? AND estado = 'PENDIENTE'",

                (fid,),

            ).fetchone()



            deudores_pagados = conn.execute(

                "SELECT COUNT(*) FROM deudores WHERE farmacia_id = ? AND estado = 'PAGADO'",

                (fid,),

            ).fetchone()[0]



            recetas_pendientes = conn.execute(

                "SELECT COUNT(*) FROM recetas_medicas WHERE farmacia_id = ? AND estado = 'PENDIENTE'",

                (fid,),

            ).fetchone()[0]



            recetas_despachadas = conn.execute(

                "SELECT COUNT(*) FROM recetas_medicas WHERE farmacia_id = ? AND estado = 'DESPACHADA'",

                (fid,),

            ).fetchone()[0]



            app_solicitudes_hoy = conn.execute(

                "SELECT COUNT(*) FROM transacciones WHERE farmacia_id = ? AND canal = 'APP_PACIENTE' AND fecha_dia = ?",

                (fid, today_str),

            ).fetchone()[0]



            app_solicitudes_pend = conn.execute(

                "SELECT COUNT(*) FROM transacciones WHERE farmacia_id = ? AND canal = 'APP_PACIENTE' AND estado_pedido IN ('PENDIENTE_RECETA', 'EN_PREPARACION')",

                (fid,),

            ).fetchone()[0]



            app_solicitudes_atendidas = conn.execute(

                "SELECT COUNT(*) FROM transacciones WHERE farmacia_id = ? AND canal = 'APP_PACIENTE' AND estado_pedido IN ('COMPLETADO', 'RECHAZADO_RECETA')",

                (fid,),

            ).fetchone()[0]



            total_whatsapp_logs = conn.execute(

                "SELECT COUNT(*) FROM notificaciones_whatsapp WHERE farmacia_id = ?",

                (fid,),

            ).fetchone()[0]



            # Serie Diaria (Últimos 7 días)

            daily_series = []

            for d_ago in range(6, -1, -1):

                day_dt = now - timedelta(days=d_ago)

                d_str = day_dt.strftime("%Y-%m-%d")

                label = day_dt.strftime("%d/%m")

                pos_sum = conn.execute(

                    "SELECT COALESCE(SUM(total), 0.0) FROM transacciones WHERE farmacia_id = ? AND fecha_dia = ? AND canal = 'POS_MOSTRADOR'",

                    (fid, d_str),

                ).fetchone()[0]

                app_sum = conn.execute(

                    "SELECT COALESCE(SUM(total), 0.0) FROM transacciones WHERE farmacia_id = ? AND fecha_dia = ? AND canal = 'APP_PACIENTE' AND estado_pedido != 'RECHAZADO_RECETA'",

                    (fid, d_str),

                ).fetchone()[0]

                tx_cnt = conn.execute(

                    "SELECT COUNT(*) FROM transacciones WHERE farmacia_id = ? AND fecha_dia = ? AND estado_pedido != 'RECHAZADO_RECETA'",

                    (fid, d_str),

                ).fetchone()[0]

                daily_series.append(

                    {

                        "fecha": d_str,

                        "etiqueta": label,

                        "pos_rd": round(float(pos_sum), 2),

                        "app_rd": round(float(app_sum), 2),

                        "total_rd": round(float(pos_sum + app_sum), 2),

                        "transacciones": int(tx_cnt),

                    }

                )



            # Serie Mensual (Últimos 6 meses)

            monthly_rows = conn.execute(

                """

                SELECT fecha_mes,

                       SUM(CASE WHEN canal = 'POS_MOSTRADOR' THEN total ELSE 0 END) AS pos_rd,

                       SUM(CASE WHEN canal = 'APP_PACIENTE' THEN total ELSE 0 END) AS app_rd,

                       SUM(total) AS total_rd,

                       COUNT(*) AS transacciones

                FROM transacciones

                WHERE farmacia_id = ? AND estado_pedido != 'RECHAZADO_RECETA'

                GROUP BY fecha_mes

                ORDER BY fecha_mes ASC

                LIMIT 12

                """,

                (fid,),

            ).fetchall()

            monthly_series = [

                {

                    "mes": r["fecha_mes"],

                    "pos_rd": round(float(r["pos_rd"]), 2),

                    "app_rd": round(float(r["app_rd"]), 2),

                    "total_rd": round(float(r["total_rd"]), 2),

                    "transacciones": int(r["transacciones"]),

                }

                for r in monthly_rows

            ]



            pay_rows = conn.execute(

                """

                SELECT metodo_pago, COALESCE(SUM(total), 0.0) AS monto, COUNT(*) AS cantidad

                FROM transacciones

                WHERE farmacia_id = ? AND estado_pedido != 'RECHAZADO_RECETA'

                GROUP BY metodo_pago

                """,

                (fid,),

            ).fetchall()

            payment_breakdown = [

                {

                    "metodo_pago": r["metodo_pago"],

                    "monto_rd": round(float(r["monto"]), 2),

                    "cantidad": int(r["cantidad"]),

                }

                for r in pay_rows

            ]



        ventas_totales_val = round(float(row_tot["suma"]), 2)

        total_tx_count = int(row_tot["cnt"])

        ticket_promedio = round(ventas_totales_val / total_tx_count, 2) if total_tx_count > 0 else 0.0



        return {

            "farmacia_id": fid,

            "moneda": "RD$",

            "total_productos_catalogo": len(products),

            "total_unidades_minimas_stock": total_unidades_almacen,

            "alertas_stock_bajo_count": len(low_stock_products),

            "alertas_stock_bajo_items": low_stock_products,

            "vencimientos": {

                "vencidos_count": len(expired_products),

                "criticos_30d_count": len(expiring_30d),

                "preventivos_90d_count": len(expiring_90d),

                "alerta_7m_count": len(expiring_7m),

                "total_alertas_vencimiento": len(expired_products) + len(expiring_7m),

                "vencidos_items": expired_products,

                "criticos_30d_items": expiring_30d,

                "preventivos_90d_items": expiring_90d,

                "alerta_7m_items": expiring_7m,

            },

            "ventas_hoy_rd": round(float(row_hoy["suma"]), 2),

            "ventas_hoy_count": int(row_hoy["cnt"]),

            "ventas_mes_actual_rd": round(float(row_mes["suma"]), 2),

            "ventas_mes_actual_count": int(row_mes["cnt"]),

            "ventas_totales_rd": ventas_totales_val,

            "ventas_totales_count": total_tx_count,

            "ticket_promedio_rd": ticket_promedio,

            "ventas_pos_rd": round(float(ventas_pos), 2),

            "ventas_app_rd": round(float(ventas_app), 2),

            "pedidos_web_pendientes": int(pedidos_pendientes_receta),

            "app_solicitudes": {

                "hoy_count": int(app_solicitudes_hoy),

                "pendientes_count": int(app_solicitudes_pend),

                "atendidas_count": int(app_solicitudes_atendidas),

                "total_count": int(app_solicitudes_hoy + app_solicitudes_pend + app_solicitudes_atendidas),

            },

            "recetas": {

                "pendientes_count": int(recetas_pendientes),

                "despachadas_count": int(recetas_despachadas),

                "total_count": int(recetas_pendientes + recetas_despachadas),

            },

            "deudores_pendientes_count": int(deudores_pendientes[0]),

            "deudores_pagados_count": int(deudores_pagados),

            "deudores_saldo_total_rd": round(float(deudores_pendientes[1]), 2),

            "total_whatsapp_logs": int(total_whatsapp_logs),

            "reporte_diario": daily_series,

            "reporte_mensual": monthly_series,

            "desglose_pagos": payment_breakdown,

        }



    # =========================================================================

    # LOGS DE WHATSAPP POR FARMACIA

    # =========================================================================



    def log_whatsapp_notification(

        self,

        farmacia_id: int,

        codigo_orden: str,

        destinatario_rol: str,

        telefono_destino: str,

        proveedor_api: str,

        endpoint_url: str,

        mensaje_texto: str,

        payload_json: str,

        respuesta_json: str,

        http_status: int,

        enviado_en_vivo: int,

    ) -> int:

        with self._get_connection() as conn:

            cur = conn.execute(

                """

                INSERT INTO notificaciones_whatsapp (

                    farmacia_id, fecha_hora, codigo_orden, destinatario_rol, telefono_destino,

                    proveedor_api, endpoint_url, mensaje_texto, payload_json,

                    respuesta_json, http_status, enviado_en_vivo

                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

                """,

                (

                    int(farmacia_id),

                    datetime.now().strftime("%Y-%m-%d %H:%M:%S"),

                    codigo_orden,

                    destinatario_rol,

                    telefono_destino,

                    proveedor_api,

                    endpoint_url,

                    mensaje_texto,

                    payload_json,

                    respuesta_json,

                    int(http_status),

                    int(enviado_en_vivo),

                ),

            )

            return cur.lastrowid



    def list_whatsapp_notifications(self, farmacia_id: int = 1, limit: int = 50) -> List[Dict[str, Any]]:

        with self._get_connection(farmacia_id=int(farmacia_id)) as conn:

            rows = conn.execute(

                "SELECT * FROM notificaciones_whatsapp WHERE farmacia_id = ? ORDER BY id DESC LIMIT ?",

                (int(farmacia_id), int(limit)),

            ).fetchall()

            out = []

            for r in rows:

                d = dict(r)

                try:

                    d["payload_parsed"] = json.loads(d["payload_json"])

                except Exception:

                    d["payload_parsed"] = d["payload_json"]

                try:

                    d["respuesta_parsed"] = json.loads(d["respuesta_json"])

                except Exception:

                    d["respuesta_parsed"] = d["respuesta_json"]

                out.append(d)

            return out



    def authenticate_patient(self, identificador: str, clave_acceso: str) -> Dict[str, Any]:

        """

        Valida las credenciales del paciente (por telfono, cdula o email) y su clave de acceso.

        """

        id_clean = "".join(filter(str.isdigit, str(identificador or "")))

        id_raw = str(identificador or "").strip()

        clave_clean = str(clave_acceso or "").strip()



        if not id_raw or not clave_clean:

            raise ValueError("Debe ingresar su nmero de telfono o cdula y su clave de acceso.")



        hashed = hash_password(clave_clean)

        with self._get_connection() as conn:

            query = """

                SELECT * FROM pacientes_usuarios

                WHERE activo = 1 AND (

                    telefono = ? OR REPLACE(REPLACE(telefono, '-', ''), ' ', '') = ?

                    OR cedula = ? OR LOWER(email) = LOWER(?)

                )

            """

            rows = conn.execute(query, (id_raw, id_clean or id_raw, id_raw, id_raw)).fetchall()

            if not rows:

                raise ValueError("Paciente no encontrado. Verifique sus datos o regstrese como nuevo paciente.")



            matched = None

            for row in rows:

                if row["clave_hash"] == hashed or (row["pista_clave"] and row["pista_clave"].strip() == clave_clean):

                    matched = row

                    break



            if not matched:

                raise ValueError("Clave de acceso incorrecta para este paciente.")



            d = dict(matched)

            d.pop("clave_hash", None)

            return d



    def register_patient(self, data: Dict[str, Any]) -> Dict[str, Any]:

        """

        Registra un nuevo paciente con su clave de acceso cifrada.

        """

        nombre = str(data.get("nombre_completo", "")).strip()

        telefono = str(data.get("telefono", "")).strip()

        cedula = str(data.get("cedula", "")).strip()

        email = str(data.get("email", "")).strip()

        clave = str(data.get("clave_acceso", "")).strip()

        direccion = str(data.get("direccion_frecuente", "")).strip()



        if not nombre or not telefono or not clave:

            raise ValueError("Nombre completo, telfono mvil y clave de acceso son requeridos.")



        hashed = hash_password(clave)

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")



        with self._get_connection() as conn:

            existing = conn.execute(

                "SELECT id FROM pacientes_usuarios WHERE telefono = ?",

                (telefono,)

            ).fetchone()

            if existing:

                raise ValueError("Ya existe una cuenta de paciente registrada con este nmero de telfono.")



            cur = conn.execute(

                """

                INSERT INTO pacientes_usuarios (

                    nombre_completo, telefono, cedula, email, clave_hash, pista_clave,

                    direccion_frecuente, fecha_registro

                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)

                """,

                (nombre, telefono, cedula, email, hashed, clave, direccion, now_str)

            )

            patient_id = cur.lastrowid

            created = conn.execute("SELECT * FROM pacientes_usuarios WHERE id = ?", (patient_id,)).fetchone()

            d = dict(created)

            d.pop("clave_hash", None)

            return d



    def get_patient_demo_credentials(self) -> List[Dict[str, Any]]:

        with self._get_connection() as conn:

            rows = conn.execute(

                "SELECT id, nombre_completo, telefono, cedula, pista_clave, direccion_frecuente FROM pacientes_usuarios WHERE activo = 1 LIMIT 5"

            ).fetchall()

            return [dict(r) for r in rows]



    def record_inventory_correction_audit(

        self,

        farmacia_id: int,

        producto_id: int,

        campo_modificado: str,

        valor_anterior: str,

        valor_nuevo: str,

        usuario: str,

        motivo: str

    ) -> int:

        with self._get_connection(farmacia_id=int(farmacia_id)) as conn:

            p_row = conn.execute("SELECT nombre_comercial, lote FROM productos WHERE id = ?", (int(producto_id),)).fetchone()

            p_name = p_row["nombre_comercial"] if p_row else "Producto Desconocido"

            p_lote = p_row["lote"] if p_row else "S/L"

            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")



            cur = conn.execute(

                """

                INSERT INTO inventario_auditoria_correcciones (

                    farmacia_id, producto_id, producto_nombre, lote, campo_modificado,

                    valor_anterior, valor_nuevo, usuario, motivo, fecha_hora

                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

                """,

                (

                    int(farmacia_id), int(producto_id), p_name, p_lote,

                    campo_modificado, str(valor_anterior), str(valor_nuevo),

                    usuario, motivo, now_str

                )

            )

            return cur.lastrowid



    def list_inventory_correction_audits(self, farmacia_id: int = 1, limit: int = 50) -> List[Dict[str, Any]]:

        with self._get_connection(farmacia_id=int(farmacia_id)) as conn:

            rows = conn.execute(

                """

                SELECT * FROM inventario_auditoria_correcciones

                WHERE farmacia_id = ?

                ORDER BY id DESC LIMIT ?

                """,

                (int(farmacia_id), int(limit))

            ).fetchall()

            return [dict(r) for r in rows]





    # =========================================================================

    # ESTADÍSTICAS COMPARATIVAS DE VENTAS: DIARIAS, SEMANALES Y MENSUALES

    # =========================================================================



    def get_comparative_sales_stats(self, farmacia_id: int = 1) -> Dict[str, Any]:

        fid = int(farmacia_id)

        with self._get_connection(farmacia_id=fid) as conn:

            now = datetime.now()

            today_str = now.strftime("%Y-%m-%d")

            yesterday_str = (now - timedelta(days=1)).strftime("%Y-%m-%d")

            same_day_last_week_str = (now - timedelta(days=7)).strftime("%Y-%m-%d")



            # 1. Comparativa Diaria: Hoy vs Ayer

            row_today = conn.execute(

                "SELECT COALESCE(SUM(total), 0.0) AS suma, COUNT(*) AS cnt FROM transacciones WHERE fecha_dia = ? AND estado_pedido != 'RECHAZADO_RECETA'",

                (today_str,),

            ).fetchone()



            row_yesterday = conn.execute(

                "SELECT COALESCE(SUM(total), 0.0) AS suma, COUNT(*) AS cnt FROM transacciones WHERE fecha_dia = ? AND estado_pedido != 'RECHAZADO_RECETA'",

                (yesterday_str,),

            ).fetchone()



            row_same_day_lw = conn.execute(

                "SELECT COALESCE(SUM(total), 0.0) AS suma, COUNT(*) AS cnt FROM transacciones WHERE fecha_dia = ? AND estado_pedido != 'RECHAZADO_RECETA'",

                (same_day_last_week_str,),

            ).fetchone()



            sum_today = float(row_today["suma"])

            cnt_today = int(row_today["cnt"])

            avg_today = sum_today / cnt_today if cnt_today > 0 else 0.0



            sum_yesterday = float(row_yesterday["suma"])

            cnt_yesterday = int(row_yesterday["cnt"])

            avg_yesterday = sum_yesterday / cnt_yesterday if cnt_yesterday > 0 else 0.0



            diff_day = sum_today - sum_yesterday

            pct_day = ((sum_today - sum_yesterday) / sum_yesterday * 100.0) if sum_yesterday > 0 else (100.0 if sum_today > 0 else 0.0)

            trend_day = "SUBIO" if diff_day > 0.01 else ("BAJO" if diff_day < -0.01 else "IGUAL")



            # 2. Comparativa Semanal: Esta Semana vs Semana Pasada

            cur_weekday = now.weekday()  # 0=Lunes, 6=Domingo

            start_cur_week = now - timedelta(days=cur_weekday)

            start_last_week = start_cur_week - timedelta(days=7)

            end_last_week = start_cur_week - timedelta(days=1)



            s_cur_w = start_cur_week.strftime("%Y-%m-%d")

            s_last_w = start_last_week.strftime("%Y-%m-%d")

            e_last_w = end_last_week.strftime("%Y-%m-%d")



            row_cur_week = conn.execute(

                "SELECT COALESCE(SUM(total), 0.0) AS suma, COUNT(*) AS cnt FROM transacciones WHERE fecha_dia >= ? AND fecha_dia <= ? AND estado_pedido != 'RECHAZADO_RECETA'",

                (s_cur_w, today_str),

            ).fetchone()



            row_last_week = conn.execute(

                "SELECT COALESCE(SUM(total), 0.0) AS suma, COUNT(*) AS cnt FROM transacciones WHERE fecha_dia >= ? AND fecha_dia <= ? AND estado_pedido != 'RECHAZADO_RECETA'",

                (s_last_w, e_last_w),

            ).fetchone()



            sum_cur_week = float(row_cur_week["suma"])

            cnt_cur_week = int(row_cur_week["cnt"])

            sum_last_week = float(row_last_week["suma"])

            cnt_last_week = int(row_last_week["cnt"])



            diff_week = sum_cur_week - sum_last_week

            pct_week = ((sum_cur_week - sum_last_week) / sum_last_week * 100.0) if sum_last_week > 0 else (100.0 if sum_cur_week > 0 else 0.0)

            trend_week = "SUBIO" if diff_week > 0.01 else ("BAJO" if diff_week < -0.01 else "IGUAL")



            # Desglose día a día de lunes a domingo

            day_names = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

            weekly_breakdown = []

            for i in range(7):

                d_cur = start_cur_week + timedelta(days=i)

                d_last = start_last_week + timedelta(days=i)

                d_cur_str = d_cur.strftime("%Y-%m-%d")

                d_last_str = d_last.strftime("%Y-%m-%d")



                val_cur = conn.execute(

                    "SELECT COALESCE(SUM(total), 0.0) FROM transacciones WHERE fecha_dia = ? AND estado_pedido != 'RECHAZADO_RECETA'",

                    (d_cur_str,),

                ).fetchone()[0]

                val_last = conn.execute(

                    "SELECT COALESCE(SUM(total), 0.0) FROM transacciones WHERE fecha_dia = ? AND estado_pedido != 'RECHAZADO_RECETA'",

                    (d_last_str,),

                ).fetchone()[0]



                diff_d = float(val_cur) - float(val_last)

                pct_d = ((float(val_cur) - float(val_last)) / float(val_last) * 100.0) if float(val_last) > 0 else (100.0 if float(val_cur) > 0 else 0.0)



                weekly_breakdown.append({

                    "dia": day_names[i],

                    "fecha_actual": d_cur_str,

                    "fecha_anterior": d_last_str,

                    "monto_actual_rd": round(float(val_cur), 2),

                    "monto_anterior_rd": round(float(val_last), 2),

                    "diferencia_rd": round(diff_d, 2),

                    "variacion_pct": round(pct_d, 1),

                    "es_hoy": d_cur_str == today_str,

                })



            # 3. Comparativa Mensual: Este Mes vs Mes Anterior

            this_month_str = now.strftime("%Y-%m")

            first_of_this_month = now.replace(day=1)

            last_day_prev_month = first_of_this_month - timedelta(days=1)

            prev_month_str = last_day_prev_month.strftime("%Y-%m")



            row_cur_month = conn.execute(

                "SELECT COALESCE(SUM(total), 0.0) AS suma, COUNT(*) AS cnt FROM transacciones WHERE fecha_mes = ? AND estado_pedido != 'RECHAZADO_RECETA'",

                (this_month_str,),

            ).fetchone()



            row_prev_month = conn.execute(

                "SELECT COALESCE(SUM(total), 0.0) AS suma, COUNT(*) AS cnt FROM transacciones WHERE fecha_mes = ? AND estado_pedido != 'RECHAZADO_RECETA'",

                (prev_month_str,),

            ).fetchone()



            sum_cur_month = float(row_cur_month["suma"])

            cnt_cur_month = int(row_cur_month["cnt"])

            sum_prev_month = float(row_prev_month["suma"])

            cnt_prev_month = int(row_prev_month["cnt"])



            days_passed_this_month = now.day

            days_in_prev_month = last_day_prev_month.day

            avg_daily_cur_month = sum_cur_month / days_passed_this_month if days_passed_this_month > 0 else 0.0

            avg_daily_prev_month = sum_prev_month / days_in_prev_month if days_in_prev_month > 0 else 0.0



            diff_month = sum_cur_month - sum_prev_month

            pct_month = ((sum_cur_month - sum_prev_month) / sum_prev_month * 100.0) if sum_prev_month > 0 else (100.0 if sum_cur_month > 0 else 0.0)

            trend_month = "SUBIO" if diff_month > 0.01 else ("BAJO" if diff_month < -0.01 else "IGUAL")



            # 4. Histórico de los últimos 6 meses

            monthly_trend = []

            for m_offset in range(5, -1, -1):

                target_dt = now - timedelta(days=m_offset * 30)

                m_str = target_dt.strftime("%Y-%m")

                m_sum = conn.execute(

                    "SELECT COALESCE(SUM(total), 0.0) FROM transacciones WHERE fecha_mes = ? AND estado_pedido != 'RECHAZADO_RECETA'",

                    (m_str,),

                ).fetchone()[0]

                monthly_trend.append({

                    "mes": m_str,

                    "total_rd": round(float(m_sum), 2),

                })



            return {

                "ok": True,

                "diaria": {

                    "hoy": {

                        "fecha": today_str,

                        "total_rd": round(sum_today, 2),

                        "ventas_count": cnt_today,

                        "ticket_promedio": round(avg_today, 2),

                    },

                    "ayer": {

                        "fecha": yesterday_str,

                        "total_rd": round(sum_yesterday, 2),

                        "ventas_count": cnt_yesterday,

                        "ticket_promedio": round(avg_yesterday, 2),

                    },

                    "mismo_dia_semana_anterior": {

                        "fecha": same_day_last_week_str,

                        "total_rd": round(float(row_same_day_lw["suma"]), 2),

                        "ventas_count": int(row_same_day_lw["cnt"]),

                    },

                    "diferencia_rd": round(diff_day, 2),

                    "variacion_pct": round(pct_day, 1),

                    "tendencia": trend_day,

                },

                "semanal": {

                    "semana_actual": {

                        "rango": f"{s_cur_w} al {today_str}",

                        "total_rd": round(sum_cur_week, 2),

                        "ventas_count": cnt_cur_week,

                    },

                    "semana_anterior": {

                        "rango": f"{s_last_w} al {e_last_w}",

                        "total_rd": round(sum_last_week, 2),

                        "ventas_count": cnt_last_week,

                    },

                    "diferencia_rd": round(diff_week, 2),

                    "variacion_pct": round(pct_week, 1),

                    "tendencia": trend_week,

                    "desglose_dias": weekly_breakdown,

                },

                "mensual": {

                    "mes_actual": {

                        "mes": this_month_str,

                        "total_rd": round(sum_cur_month, 2),

                        "ventas_count": cnt_cur_month,

                        "promedio_diario": round(avg_daily_cur_month, 2),

                    },

                    "mes_anterior": {

                        "mes": prev_month_str,

                        "total_rd": round(sum_prev_month, 2),

                        "ventas_count": cnt_prev_month,

                        "promedio_diario": round(avg_daily_prev_month, 2),

                    },

                    "diferencia_rd": round(diff_month, 2),

                    "variacion_pct": round(pct_month, 1),

                    "tendencia": trend_month,

                    "historico_6_meses": monthly_trend,

                },

            }



    def parse_and_ingest_whatsapp_order(self, raw_text: str, farmacia_id: int = 1) -> Dict[str, Any]:

        """

        Ingesta y procesa pedidos enviados por clientes mediante WhatsApp.

        Parsea los medicamentos, presentaciones, cantidades, cliente y direccion,

        ingresando la orden directamente a la bandeja de despacho del POS.

        """

        import re

        raw = (raw_text or "").strip()

        if not raw:

            raise ValueError("El texto del pedido de WhatsApp esta vacio.")



        order_m = re.search(r'#([A-Z0-9-]+)', raw)

        codigo_orden = order_m.group(1).strip() if order_m else f"DAV-{int(datetime.now().timestamp()) % 100000}"



        with self._get_connection(farmacia_id=farmacia_id) as conn:

            existing = conn.execute(

                "SELECT * FROM transacciones WHERE codigo_orden = ? AND farmacia_id = ?",

                (codigo_orden, farmacia_id)

            ).fetchone()

            if existing:

                return self.get_transaction_by_id(existing["id"])



        client_m = re.search(r"Cliente:\s*([^(\r\n]+?)(?:\s*\(\+?([0-9]+)\))?$", raw, re.M)
        cliente_nombre = client_m.group(1).strip() if client_m else "Cliente WhatsApp"
        cliente_telefono = client_m.group(2).strip() if (client_m and client_m.group(2)) else ""

        addr_m = re.search(r"Direcci[oó]n:\s*(.+)$", raw, re.M)
        cliente_direccion = addr_m.group(1).strip() if addr_m else "Entrega a Domicilio"

        pay_m = re.search(r"M[eé]todo Pago:\s*(.+)$", raw, re.M)
        pay_str = pay_m.group(1).strip() if pay_m else "EFECTIVO"
        metodo_pago = "EFECTIVO"
        if "TARJETA" in pay_str.upper():
            metodo_pago = "TARJETA"
        elif "DEP" in pay_str.upper() or "TRANSF" in pay_str.upper():
            metodo_pago = "TRANSFERENCIA"

        ars_m = re.search(r"Seguro ARS:\s*(.+)$", raw, re.M)
        seguro_ars = ars_m.group(1).strip() if ars_m else "Sin Seguro"

        item_matches = re.findall(
            r"[•\*\-]?\s*(\d+)\s*x\s*(CAJA|BLISTER|BLÍSTER|UNIDAD|UNID)?\s+([^(\r\n]+?)(?:\s*\(RD\$\s*[0-9,.]+\))?$",
            raw,
            re.M | re.I
        )

        products_catalog = self.list_products(farmacia_id=farmacia_id)

        items_payload = []



        for match in item_matches:

            qty_str, pres_raw, prod_name_raw = match

            qty = max(1, int(qty_str))

            pres_clean = (pres_raw or "UNIDAD").upper().replace("BLÍSTER", "BLISTER").replace("UNID", "UNIDAD")

            if pres_clean not in {"CAJA", "BLISTER", "UNIDAD"}:

                pres_clean = "UNIDAD"

            p_name = prod_name_raw.strip().lower()



            matched_prod = None

            for p in products_catalog:

                nom = p.get("nombre_comercial", "").lower()

                prin = p.get("principio_activo", "").lower()

                if nom == p_name or p_name in nom or nom in p_name:

                    matched_prod = p

                    break

                if prin and (prin in p_name or p_name in prin):

                    matched_prod = p

                    break



            if matched_prod:

                items_payload.append({

                    "producto_id": matched_prod["id"],

                    "presentacion": pres_clean,

                    "cantidad": qty

                })



        if not items_payload and products_catalog:

            items_payload.append({

                "producto_id": products_catalog[0]["id"],

                "presentacion": "UNIDAD",

                "cantidad": 1

            })



        order_data = {

            "farmacia_id": farmacia_id,

            "canal": "APP_PACIENTE",

            "modalidad_entrega": "RETIRO_FARMACIA" if "RETIRO" in cliente_direccion.upper() else "DOMICILIO",

            "cliente_nombre": cliente_nombre,

            "cliente_telefono": cliente_telefono or "8095550000",

            "cliente_direccion": cliente_direccion,

            "metodo_pago": metodo_pago,

            "referencia_pago": f"Via WhatsApp ({pay_str})",

            "seguro_ars": seguro_ars,

            "items": items_payload,

            "receta_imagen_url": None

        }



        tx = self.process_sale(order_data)

        with self._get_connection(farmacia_id=farmacia_id) as conn:

            conn.execute("UPDATE transacciones SET codigo_orden = ? WHERE id = ?", (codigo_orden, tx["id"]))

        tx["codigo_orden"] = codigo_orden

        return tx



