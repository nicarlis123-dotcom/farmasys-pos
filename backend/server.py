"""
Servidor Omnicanal Multi-Farmacia — Farmacia Davalsi / FarmaSys
Rutas separadas:
  - http://localhost:8080/app      -> App Exclusiva para Pacientes (con selector superior de Farmacia)
  - http://localhost:8080/sistema  -> Sistema Privado de Venta (POS, Inventario, Vencimientos, Deudores, Personal, Reportes y Configuración)
"""

import os
import sys
import json
import uuid
import base64
import mimetypes
import urllib.parse
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

if getattr(sys, "frozen", False):
    EXE_DIR = os.path.dirname(os.path.abspath(sys.executable))
    MEIPASS_DIR = getattr(sys, "_MEIPASS", EXE_DIR)
    PROJECT_ROOT = EXE_DIR
    if os.path.isdir(os.path.join(EXE_DIR, "frontend")):
        STATIC_DIR = os.path.join(EXE_DIR, "frontend")
    else:
        STATIC_DIR = os.path.join(MEIPASS_DIR, "frontend")
    BASE_DIR = os.path.join(MEIPASS_DIR, "backend") if os.path.isdir(os.path.join(MEIPASS_DIR, "backend")) else os.path.join(EXE_DIR, "backend")
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    PROJECT_ROOT = os.path.dirname(BASE_DIR)
    STATIC_DIR = os.path.join(PROJECT_ROOT, "frontend")

UPLOADS_DIR = os.path.join(PROJECT_ROOT, "uploads", "recetas")
DB_PATH = os.path.join(PROJECT_ROOT, "data", "farmacia_davalsi.db")

os.makedirs(UPLOADS_DIR, exist_ok=True)
sys.path.insert(0, BASE_DIR)

from database import DatabaseManager
from inventory_engine import InventoryMathEngine
from whatsapp_service import WhatsAppBusinessService

db = DatabaseManager(DB_PATH)
whatsapp_engine = WhatsAppBusinessService(db)

SAMPLE_PRESCRIPTION_SVG = """<svg xmlns="http://www.w3.org/2000/svg" width="650" height="820" viewBox="0 0 650 820">
  <rect width="650" height="820" fill="#f8fafc"/>
  <rect x="25" y="25" width="600" height="770" rx="12" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <rect x="25" y="25" width="600" height="115" rx="12" fill="#0f766e"/>
  <text x="55" y="68" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#ffffff">CENTRO MÉDICO DOMINICANO — SANTO DOMINGO</text>
  <text x="55" y="96" font-family="Arial, sans-serif" font-size="14" fill="#ccfbf1">Dr. Alejandro Méndez Rosario • Exequátur #482-19 • Medicina Interna &amp; Infectología</text>
  <text x="55" y="120" font-family="Arial, sans-serif" font-size="12" fill="#99f6e4">Av. Abraham Lincoln #405, Piantini • Tel: (809) 555-8490 • RNC: 1-01-88421-9</text>

  <line x1="55" y1="205" x2="595" y2="205" stroke="#e2e8f0" stroke-width="2"/>
  <text x="55" y="175" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="#1e293b">PACIENTE: María Fernanda Almonte</text>
  <text x="410" y="175" font-family="Arial, sans-serif" font-size="14" fill="#475569">FECHA: 22/10/2026</text>
  <text x="55" y="196" font-family="Arial, sans-serif" font-size="13" fill="#64748b">Cédula: 001-1849201-7 • Edad: 34 años • ARS: Humano Primera</text>

  <text x="55" y="260" font-family="Georgia, serif" font-size="38" font-weight="bold" fill="#0f766e">Rx.</text>

  <rect x="55" y="285" width="540" height="190" rx="10" fill="#f0fdfa" stroke="#99f6e4" stroke-width="1.5"/>
  <text x="75" y="325" font-family="Courier New, monospace" font-size="18" font-weight="bold" fill="#0f172a">1) Amoxil / Amoxicilina + Ác. Clavulánico 875/125 mg</text>
  <text x="75" y="360" font-family="Arial, sans-serif" font-size="15" fill="#334155">• Presentación: 1 Caja (14 Comprimidos recubiertos)</text>
  <text x="75" y="390" font-family="Arial, sans-serif" font-size="15" fill="#334155">• Posología: Tomar 1 comprimido vía oral cada 12 horas por 7 días.</text>
  <text x="75" y="425" font-family="Arial, sans-serif" font-size="14" font-style="italic" fill="#0f766e">Diagnóstico CIE-10: J02.9 Faringoamigdalitis Bacteriana Aguda</text>

  <circle cx="480" cy="610" r="64" fill="none" stroke="#1d4ed8" stroke-width="2.5" stroke-dasharray="6,3" opacity="0.75"/>
  <text x="480" y="598" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#1d4ed8">DR. ALEJANDRO MÉNDEZ</text>
  <text x="480" y="615" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#1d4ed8">EXEQUÁTUR 482-19</text>
  <text x="480" y="632" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#1d4ed8">COLEGIADO CMD</text>

  <path d="M 100 630 Q 145 575 180 625 T 260 595 T 320 620" fill="none" stroke="#0f172a" stroke-width="3"/>
  <line x1="80" y1="650" x2="350" y2="650" stroke="#94a3b8" stroke-width="1.5"/>
  <text x="215" y="672" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#475569">Firma y Sello del Médico Tratante</text>

  <rect x="55" y="715" width="540" height="50" rx="8" fill="#fef3c7" stroke="#f59e0b"/>
  <text x="325" y="745" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#92400e">RECETA MÉDICA VÁLIDA PARA DISPENSACIÓN EN FARMACIA DAVALSI RD</text>
</svg>"""


class DavalsiRequestHandler(BaseHTTPRequestHandler):
    """Manejador HTTP omnicanal para API REST Multi-Farmacia y aplicaciones separadas."""

    def log_message(self, format: str, *args) -> None:
        pass

    def _send_json(self, status_code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict:
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length <= 0:
            return {}
        raw_bytes = self.rfile.read(content_length)
        try:
            raw = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            raw = raw_bytes.decode("latin-1", errors="replace")
        return json.loads(raw) if raw else {}

    def do_OPTIONS(self) -> None:
        self._send_json(200, {"ok": True})

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        try:
            if path == "/api/health":
                self._send_json(
                    200,
                    {
                        "status": "ok",
                        "service": "Farmacia Davalsi Multi-Farmacia API",
                        "currency": "RD$",
                        "routes": {
                            "app_pacientes": "/app",
                            "sistema_farmacia": "/sistema",
                        },
                    },
                )
                return

            if path == "/api/sample-prescription.svg":
                svg_bytes = SAMPLE_PRESCRIPTION_SVG.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "image/svg+xml; charset=utf-8")
                self.send_header("Content-Length", str(len(svg_bytes)))
                self.end_headers()
                self.wfile.write(svg_bytes)
                return

            if path == "/api/patient/demo-credentials":
                creds = db.get_patient_demo_credentials()
                self._send_json(200, {"ok": True, "credentials": creds})
                return

            if path == "/api/inventory/audit-logs":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                audits = db.list_inventory_correction_audits(farmacia_id=farmacia_id)
                self._send_json(200, {"ok": True, "audits": audits})
                return

            if path == "/api/pharmacies":
                pharmacies = db.list_public_pharmacies()
                self._send_json(200, {"ok": True, "pharmacies": pharmacies})
                return

            if path == "/api/pharmacy/config":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                cfg = db.get_pharmacy_config(farmacia_id)
                self._send_json(200, {"ok": True, "config": cfg})
                return

            if path == "/api/staff":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                staff = db.list_staff(farmacia_id=farmacia_id)
                self._send_json(200, {"ok": True, "staff": staff})
                return

            if path == "/api/debtors":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                debtors = db.list_debtors(farmacia_id=farmacia_id)
                self._send_json(200, {"ok": True, "debtors": debtors})
                return

            if path == "/api/products":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                search = query.get("search", [""])[0]
                symptom = query.get("symptom", [""])[0]
                category = query.get("category", [""])[0]
                low_stock = query.get("low_stock", ["false"])[0].lower() == "true"
                hide_expired = query.get("hide_expired", ["false"])[0].lower() == "true"
                products = db.list_products(
                    farmacia_id=farmacia_id,
                    search=search,
                    symptom=symptom,
                    category=category,
                    only_low_stock=low_stock,
                    hide_expired=hide_expired,
                )
                pharmacy_cfg = db.get_pharmacy_config(farmacia_id)
                self._send_json(200, {"ok": True, "products": products, "pharmacy_config": pharmacy_cfg})
                return

            if path == "/api/products/movements":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                producto_id = int(query.get("producto_id", ["0"])[0])
                movements = db.get_product_movements(farmacia_id=farmacia_id, producto_id=producto_id)
                self._send_json(200, {"ok": True, "movements": movements})
                return

            if path == "/api/prescriptions":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                estado = query.get("estado", [None])[0]
                prescriptions = db.list_prescriptions(farmacia_id=farmacia_id, estado=estado)
                self._send_json(200, {"ok": True, "prescriptions": prescriptions})
                return

            if path == "/api/dashboard":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                metrics = db.get_dashboard_and_reports(farmacia_id=farmacia_id)
                self._send_json(200, {"ok": True, "metrics": metrics})
                return

            if path == "/api/transactions":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                canal = query.get("canal", [None])[0]
                periodo = query.get("periodo", ["TODO"])[0]
                fecha_dia = query.get("fecha_dia", [None])[0]
                fecha_mes = query.get("fecha_mes", [None])[0]
                limit = int(query.get("limit", ["1000"])[0])
                transactions = db.list_transactions(
                    farmacia_id=farmacia_id,
                    canal=canal,
                    periodo=periodo,
                    fecha_dia=fecha_dia,
                    fecha_mes=fecha_mes,
                    limit=limit,
                )
                self._send_json(200, {"ok": True, "transactions": transactions})
                return

            if path == "/api/sales/comparative-stats":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                stats = db.get_comparative_sales_stats(farmacia_id=farmacia_id)
                self._send_json(200, stats)
                return

            if path == "/api/whatsapp/logs":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                logs = db.list_whatsapp_notifications(farmacia_id=farmacia_id)
                cfg = db.get_pharmacy_config(farmacia_id=farmacia_id)
                self._send_json(200, {"ok": True, "logs": logs, "config": cfg})
                return

            if path.startswith("/uploads/recetas/"):
                filename = os.path.basename(path)
                file_path = os.path.join(UPLOADS_DIR, filename)
                if not os.path.isfile(file_path):
                    self._send_json(404, {"ok": False, "error": "Imagen de receta no encontrada."})
                    return
                ctype, _ = mimetypes.guess_type(file_path)
                with open(file_path, "rb") as f:
                    data = f.read()
                self.send_response(200)
                self.send_header("Content-Type", ctype or "image/png")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return

            if path in ("/descargar-apk", "/Farmacia_Davalsi_App_Movil.apk"):
                apk_path = os.path.join(STATIC_DIR, "Farmacia_Davalsi_App_Movil.apk")
                if os.path.isfile(apk_path):
                    with open(apk_path, "rb") as f:
                        apk_bytes = f.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/vnd.android.package-archive")
                    self.send_header("Content-Disposition", 'attachment; filename="Farmacia_Davalsi_App_Movil.apk"')
                    self.send_header("Content-Length", str(len(apk_bytes)))
                    self.end_headers()
                    self.wfile.write(apk_bytes)
                    return

            if path in ("/sistema", "/sistema/", "/admin", "/admin/"):
                rel_path = "sistema.html"
            elif path in ("/", "/app", "/app/", "/index.html"):
                rel_path = "index.html"
            else:
                rel_path = path.lstrip("/")

            full_static_path = os.path.abspath(os.path.join(STATIC_DIR, rel_path))
            if not full_static_path.startswith(os.path.abspath(STATIC_DIR)) or not os.path.isfile(full_static_path):
                full_static_path = os.path.join(STATIC_DIR, "index.html")

            ctype, _ = mimetypes.guess_type(full_static_path)
            with open(full_static_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header(
                "Content-Type",
                f"{ctype or 'text/html'}; charset=utf-8"
                if (ctype or "").startswith("text/") or full_static_path.endswith(".js")
                else (ctype or "application/octet-stream"),
            )
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        except Exception as exc:
            self._send_json(500, {"ok": False, "error": str(exc)})

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        try:
            body = self._read_json_body()

            if path == "/api/auth/login":
                farmacia_id = int(body.get("farmacia_id", 1))
                clave = str(body.get("clave_acceso", ""))
                username = str(body.get("username", ""))
                pharmacy_profile = db.authenticate_pharmacy(
                    farmacia_id=farmacia_id, clave_acceso=clave, username=username
                )
                token = f"DAV-SESSION-{farmacia_id}-{uuid.uuid4().hex[:12]}"
                self._send_json(200, {"ok": True, "token": token, "pharmacy": pharmacy_profile})
                return

            if path == "/api/patient/auth/login":
                identificador = str(body.get("identificador", body.get("telefono", "")))
                clave = str(body.get("clave_acceso", ""))
                patient = db.authenticate_patient(identificador=identificador, clave_acceso=clave)
                token = f"PAC-SESSION-{patient['id']}-{uuid.uuid4().hex[:12]}"
                self._send_json(200, {"ok": True, "token": token, "patient": patient})
                return

            if path == "/api/patient/auth/register":
                patient = db.register_patient(body)
                token = f"PAC-SESSION-{patient['id']}-{uuid.uuid4().hex[:12]}"
                self._send_json(201, {"ok": True, "token": token, "patient": patient})
                return

            if path == "/api/inventory/correct-entry":
                farmacia_id = int(body.get("farmacia_id", 1))
                producto_id = int(body.get("producto_id", 0))
                campo = str(body.get("campo_modificado", "lote_caducidad"))
                val_ant = str(body.get("valor_anterior", ""))
                val_nue = str(body.get("valor_nuevo", ""))
                usuario = str(body.get("usuario", "Administrador"))
                motivo = str(body.get("motivo", "Correccin de error de digitacin"))

                audit_id = db.record_inventory_correction_audit(
                    farmacia_id=farmacia_id,
                    producto_id=producto_id,
                    campo_modificado=campo,
                    valor_anterior=val_ant,
                    valor_nuevo=val_nue,
                    usuario=usuario,
                    motivo=motivo
                )
                self._send_json(200, {"ok": True, "audit_id": audit_id})
                return

            if path == "/api/pharmacies":
                new_pharmacy = db.create_pharmacy(body)
                self._send_json(201, {"ok": True, "pharmacy": new_pharmacy})
                return

            if path == "/api/pharmacy/delete":
                farmacia_id = int(body.get("farmacia_id", 0))
                deleted_info = db.delete_pharmacy(farmacia_id)
                self._send_json(200, {"ok": True, "deleted": deleted_info})
                return

            if path == "/api/staff":
                farmacia_id = int(body.get("farmacia_id", 1))
                new_seller = db.create_seller(farmacia_id, body)
                self._send_json(201, {"ok": True, "seller": new_seller})
                return

            if path == "/api/staff/delete":
                farmacia_id = int(body.get("farmacia_id", 1))
                staff_id = int(body.get("staff_id", 0))
                db.delete_seller(farmacia_id, staff_id)
                self._send_json(200, {"ok": True})
                return

            if path == "/api/debtors":
                farmacia_id = int(body.get("farmacia_id", 1))
                new_debtor = db.create_debtor(farmacia_id, body)
                self._send_json(201, {"ok": True, "debtor": new_debtor})
                return

            if path == "/api/debtors/pay":
                farmacia_id = int(body.get("farmacia_id", 1))
                deudor_id = int(body.get("deudor_id", 0))
                abono_rd = float(body.get("abono_rd", 0.0))
                updated_debtor = db.pay_debtor(farmacia_id, deudor_id, abono_rd)
                self._send_json(200, {"ok": True, "debtor": updated_debtor})
                return

            if path == "/api/debtors/remind":
                farmacia_id = int(body.get("farmacia_id", 1))
                deudor_id = int(body.get("deudor_id", 0))
                remind_res = whatsapp_engine.send_debtor_reminder(farmacia_id, deudor_id)
                self._send_json(200, remind_res)
                return

            if path == "/api/pharmacy/config":
                farmacia_id = int(body.get("farmacia_id", 1))
                updated_cfg = db.update_pharmacy_config(farmacia_id, body)
                self._send_json(200, {"ok": True, "config": updated_cfg})
                return

            if path == "/api/upload-prescription":
                data_url = str(body.get("image_base64", ""))
                filename_orig = str(body.get("filename", "receta.png"))
                if not data_url:
                    self._send_json(400, {"ok": False, "error": "No se recibió imagen de la receta médica."})
                    return

                ext = ".png"
                if "image/jpeg" in data_url or filename_orig.lower().endswith((".jpg", ".jpeg")):
                    ext = ".jpg"
                elif "image/svg+xml" in data_url or filename_orig.lower().endswith(".svg"):
                    ext = ".svg"
                elif "image/webp" in data_url:
                    ext = ".webp"

                raw_b64 = data_url.split(",", 1)[1] if "," in data_url else data_url
                img_bytes = base64.b64decode(raw_b64)
                saved_name = f"receta_{uuid.uuid4().hex[:10]}{ext}"
                saved_path = os.path.join(UPLOADS_DIR, saved_name)
                with open(saved_path, "wb") as f:
                    f.write(img_bytes)

                public_url = f"/uploads/recetas/{saved_name}"
                self._send_json(200, {"ok": True, "receta_imagen_url": public_url})
                return

            if path == "/api/sales":
                order_record = db.process_sale(body)
                whatsapp_dispatches = []
                cfg = db.get_pharmacy_config(order_record["farmacia_id"])
                if cfg.get("wa_activo", True) and (order_record["canal"] == "APP_PACIENTE" or bool(order_record.get("cliente_telefono"))):
                    whatsapp_dispatches = whatsapp_engine.notify_new_app_order(order_record)

                self._send_json(
                    201,
                    {
                        "ok": True,
                        "order": order_record,
                        "pharmacy_config": cfg,
                        "whatsapp_dispatches": whatsapp_dispatches,
                    },
                )
                return

            if path in ("/api/whatsapp/incoming-order", "/api/whatsapp/webhook"):
                raw_text = str(body.get("raw_text") or body.get("whatsapp_text") or body.get("message") or "")
                farmacia_id = int(body.get("farmacia_id", 1))
                if not raw_text and body.get("entry"):
                    try:
                        messages = body["entry"][0]["changes"][0]["value"]["messages"]
                        raw_text = messages[0]["text"]["body"]
                    except Exception:
                        pass

                order_record = db.parse_and_ingest_whatsapp_order(raw_text, farmacia_id=farmacia_id)
                self._send_json(201, {"ok": True, "order": order_record})
                return

            if path == "/api/orders/review":
                tx_id = int(body["transaccion_id"])
                accion = str(body["accion"])
                notas = str(body.get("notas_farmaceutico", ""))
                farmaceutico = str(body.get("farmaceutico_nombre", "Lic. Farmacéutico de Turno"))

                farmacia_id = int(body.get("farmacia_id", 1))
                updated_order = db.review_app_order(
                    transaccion_id=tx_id,
                    accion=accion,
                    notas_farmaceutico=notas,
                    farmaceutico_nombre=farmaceutico,
                    farmacia_id=farmacia_id,
                )
                wa_notif = whatsapp_engine.notify_prescription_status_update(
                    order_data=updated_order,
                    nuevo_estado=updated_order["estado_pedido"],
                    notas_farmaceutico=updated_order.get("notas_farmaceutico", ""),
                )
                self._send_json(
                    200,
                    {
                        "ok": True,
                        "order": updated_order,
                        "whatsapp_notification": wa_notif,
                    },
                )
                return

            if path == "/api/inventory/replenish":
                farmacia_id = int(body.get("farmacia_id", 1))
                updated_product = db.replenish_stock(
                    farmacia_id=farmacia_id,
                    producto_id=int(body["producto_id"]),
                    presentacion=str(body.get("presentacion", "UNIDAD")),
                    cantidad=int(body.get("cantidad", 1)),
                    modo=str(body.get("modo", "SUMAR")),
                    nuevo_stock_directo=int(body["nuevo_stock_directo"]) if "nuevo_stock_directo" in body and body["nuevo_stock_directo"] is not None else None,
                    lote=body.get("lote"),
                    fecha_vencimiento=body.get("fecha_vencimiento"),
                    nuevo_precio_base=float(body["nuevo_precio_base"]) if "nuevo_precio_base" in body and body["nuevo_precio_base"] is not None else None,
                    nueva_ubicacion=body.get("nueva_ubicacion") or body.get("ubicacion_anaquel"),
                    costo_compra=float(body["costo_compra"]) if "costo_compra" in body and body["costo_compra"] is not None else None,
                    motivo=str(body.get("motivo", "Entrada de nueva compra / Abastecimiento")),
                    usuario=str(body.get("usuario", "Lic. Farmacéutico Sucursal")),
                )
                self._send_json(200, {"ok": True, "product": updated_product})
                return

            if path == "/api/inventory/adjust":
                farmacia_id = int(body.get("farmacia_id", 1))
                producto_id = int(body.get("producto_id", 0))
                nuevo_stock = int(body.get("nuevo_stock_unidades", 0))
                motivo = str(body.get("motivo", "Ajuste manual de inventario / Cuadratura"))
                usuario = str(body.get("usuario", "Administrador"))
                updated_product = db.adjust_stock(
                    farmacia_id=farmacia_id,
                    producto_id=producto_id,
                    nuevo_stock_unidades=nuevo_stock,
                    motivo=motivo,
                    usuario=usuario,
                )
                self._send_json(200, {"ok": True, "product": updated_product})
                return

            if path == "/api/products":
                new_prod = db.create_or_update_product(body)
                self._send_json(201, {"ok": True, "product": new_prod})
                return

            if path in ("/api/products/update", "/api/products/edit"):
                farmacia_id = int(body.get("farmacia_id", 1))
                producto_id = int(body.get("producto_id", 0))
                updated_prod = db.update_product(farmacia_id, producto_id, body)
                self._send_json(200, {"ok": True, "product": updated_prod})
                return

            if path in ("/api/products/delete", "/api/products/remove"):
                farmacia_id = int(body.get("farmacia_id", 1))
                producto_id = int(body.get("producto_id", 0))
                del_res = db.delete_product(farmacia_id, producto_id)
                self._send_json(200, {"ok": True, "deleted": del_res})
                return

            if path == "/api/prescriptions":
                farmacia_id = int(body.get("farmacia_id", 1))
                new_rx = db.create_prescription(farmacia_id, body)
                self._send_json(201, {"ok": True, "prescription": new_rx})
                return

            if path == "/api/prescriptions/dispatch":
                farmacia_id = int(body.get("farmacia_id", 1))
                receta_id = int(body.get("receta_id", 0))
                despachado_por = str(body.get("despachado_por", "Farmacéutico"))
                dispatched_rx = db.dispatch_prescription(farmacia_id, receta_id, despachado_por)
                self._send_json(200, {"ok": True, "prescription": dispatched_rx})
                return

            self._send_json(404, {"ok": False, "error": f"Ruta POST no encontrada: {path}"})

        except ValueError as ve:
            self._send_json(400, {"ok": False, "error": str(ve)})
        except Exception as exc:
            self._send_json(500, {"ok": False, "error": str(exc)})

    def do_PUT(self) -> None:
        self.do_POST()

    def do_DELETE(self) -> None:
        self.do_POST()


def run_server(port: int = 8080) -> None:
    server = ThreadingHTTPServer(("0.0.0.0", port), DavalsiRequestHandler)
    print(f"==================================================================")
    print(f"  FARMACIA DAVALSI — ARQUITECTURA SEPARADA MULTI-FARMACIA")
    print(f"  1) App Pacientes:        http://localhost:{port}/app")
    print(f"  2) Sistema de Farmacias: http://localhost:{port}/sistema")
    print(f"==================================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == "__main__":
    port_arg = int(os.environ.get("PORT", 8080))
    run_server(port_arg)
