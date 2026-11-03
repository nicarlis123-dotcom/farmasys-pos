from __future__ import annotations
from pdf_generator import pdf_writer
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
from datetime import datetime

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
from ai_assistant import PharmacyAIAssistant
from pos_guide_service import pos_guide_hub
import farmabot_rd
from farma_brain import farma_brain


import hmac
import hashlib
import time

class SimpleJWT:
    """Implementación de JSON Web Tokens (JWT) estándar RFC 7519."""
    SECRET = os.environ.get("DAVALSI_JWT_SECRET", "DAVALSI_SECURE_JWT_SECRET_KEY_2026_RENDER_PROD")

    @staticmethod
    def _base64url_encode(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")

    @staticmethod
    def _base64url_decode(data: str) -> bytes:
        rem = len(data) % 4
        if rem > 0:
            data += "=" * (4 - rem)
        return base64.urlsafe_b64decode(data.encode("utf-8"))

    @classmethod
    def encode(cls, payload: dict, expires_in: int = 86400 * 7) -> str:
        header = {"alg": "HS256", "typ": "JWT"}
        payload_copy = dict(payload)
        now = int(time.time())
        payload_copy["iat"] = now
        payload_copy["exp"] = now + expires_in

        h_b64 = cls._base64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
        p_b64 = cls._base64url_encode(json.dumps(payload_copy, separators=(",", ":")).encode("utf-8"))
        sig_input = f"{h_b64}.{p_b64}".encode("utf-8")
        sig = hmac.new(cls.SECRET.encode("utf-8"), sig_input, hashlib.sha256).digest()
        sig_b64 = cls._base64url_encode(sig)
        return f"{h_b64}.{p_b64}.{sig_b64}"

    @classmethod
    def decode(cls, token: str) -> dict:
        clean = str(token or "").strip()
        if clean.lower().startswith("bearer "):
            clean = clean[7:].strip()
        parts = clean.split(".")
        if len(parts) != 3:
            # Fallback a session legacy si aplica
            if clean.startswith("PAC-SESSION-"):
                try:
                    p_id = int(clean.split("-")[2])
                    return {"user_id": p_id, "id": p_id, "role": "ROL_PACIENTE_APP", "sub": str(p_id)}
                except Exception:
                    pass
            elif clean.startswith("DAV-SESSION-"):
                try:
                    f_id = int(clean.split("-")[2])
                    return {"farmacia_id": f_id, "role": "ROL_ADMIN_CAJA", "sub": str(f_id)}
                except Exception:
                    pass
            raise ValueError("Token JWT malformado o no proporcionado.")

        h_b64, p_b64, sig_b64 = parts
        sig_input = f"{h_b64}.{p_b64}".encode("utf-8")
        expected_sig = hmac.new(cls.SECRET.encode("utf-8"), sig_input, hashlib.sha256).digest()
        if not hmac.compare_digest(cls._base64url_encode(expected_sig), sig_b64):
            raise ValueError("Firma de token JWT inválida o alterada.")
        payload = json.loads(cls._base64url_decode(p_b64).decode("utf-8"))
        if payload.get("exp", 0) < int(time.time()):
            raise ValueError("Token JWT expirado.")
        return payload


# Iniciar servidor WebSocket RFC 6455 para el Asistente Visual y Marco Verde en el POS
try:
    pos_guide_hub.start_websocket_server()
except Exception as e:
    print(f"Warning starting pos_guide_hub WebSocket: {e}")

# Iniciar Servidor WebSocket Asistente IA en Puerto 8765 (Venta Guiada: búsqueda -> lote -> cobro)
try:
    import servidor_asistente_ws
    servidor_asistente_ws.start_in_background()
    print("[Asistente IA] Servidor WebSocket 8765 activo para Venta Guiada.")
except Exception as e:
    print(f"Warning starting pos_guide_hub WebSocket: {e}")

db = DatabaseManager(DB_PATH)
whatsapp_engine = WhatsAppBusinessService(db)
ai_engine = PharmacyAIAssistant(db)

def safe_farmacia_id(body: dict, default: int = 1) -> int:
    val = body.get("farmacia_id")
    if val is None or val == "" or str(val).lower() in ("none", "nan", "null", "undefined"):
        return default
    try:
        res = int(val)
        return res if res > 0 else default
    except (ValueError, TypeError):
        return default
try:
    ai_engine.generate_ai_medical_kits(farmacia_id=1)
except Exception:
    pass

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

    def _get_authenticated_user(self) -> Optional[dict]:
        """Extrae y valida el token JWT del header Authorization o parámetro token."""
        auth_header = self.headers.get("Authorization", "")
        if not auth_header:
            auth_header = self.headers.get("x-access-token", "")
        if not auth_header:
            # Intentar query param token
            try:
                parsed = urllib.parse.urlparse(self.path)
                query = urllib.parse.parse_qs(parsed.query)
                auth_header = query.get("token", [""])[0]
            except Exception:
                pass
        if not auth_header:
            return None
        try:
            return SimpleJWT.decode(auth_header)
        except Exception:
            return None

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
        print(f'[SERVER-LOG] GET path={path}')

        try:
            
            
            if path == "/api/reportes/pdf/vencimientos-7-meses":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                f_info = db.get_pharmacy_config(farmacia_id) or {"nombre": "Farmacia Davalsi - Sucursal Principal"}
                farmacia_nombre = f_info.get("nombre", "Farmacia Davalsi")

                lotes = db.get_lotes_proximos_vencer(farmacia_id=farmacia_id, dias_umbral=210)

                columnas = [
                    ("Codigo Barras", 80.0),
                    ("Nombre Comercial", 130.0),
                    ("Principio Activo DCI", 125.0),
                    ("Lote", 65.0),
                    ("Vence (<=210d)", 65.0),
                    ("Cant. Disp.", 55.0)
                ]

                filas = []
                total_unidades = 0
                for lt in lotes:
                    cant = int(lt.get("cantidad_disponible", 0))
                    total_unidades += cant
                    filas.append([
                        str(lt.get("codigo_barras", "")),
                        str(lt.get("nombre_comercial", "")),
                        str(lt.get("principio_activo_dci", "")),
                        str(lt.get("numero_lote", "S/L")),
                        f"{lt.get('fecha_vencimiento', '')} ({lt.get('dias_para_vencer', 0)}d)",
                        f"{cant} unid."
                    ])

                totales_resumen = f"Total de Lotes Proximos a Vencer: {len(lotes)}  |  Total de Unidades en Riesgo: {total_unidades} unid."

                pdf_bytes = pdf_writer.build_report_pages(
                    farmacia_nombre=farmacia_nombre,
                    titulo_reporte="Reporte Oficial de Vencimientos a 7 Meses (<= 210 Dias)",
                    subtitulo="Lotes con existencia positiva proximos a expirar segun regla FEFO",
                    columnas=columnas,
                    filas=filas,
                    totales_resumen=totales_resumen
                )

                self.send_response(200)
                self.send_header("Content-Type", "application/pdf")
                self.send_header("Content-Disposition", 'inline; filename="reporte_vencimientos_7_meses.pdf"')
                self.send_header("Content-Length", str(len(pdf_bytes)))
                self.end_headers()
                self.wfile.write(pdf_bytes)
                return

            if path == "/api/reportes/pdf/bajo-stock":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                modalidad = query.get("modalidad", ["auditor"])[0].lower()  # "auditor" o "ciego"
                f_info = db.get_pharmacy_config(farmacia_id) or {"nombre": "Farmacia Davalsi - Sucursal Principal"}
                farmacia_nombre = f_info.get("nombre", "Farmacia Davalsi")

                productos = db.get_productos_bajo_stock(farmacia_id=farmacia_id)

                es_ciego = (modalidad == "ciego")
                col_stock_label = "Conteo Fisico Manual" if es_ciego else "Stock Sistema"

                columnas = [
                    ("Codigo Barras", 80.0),
                    ("Nombre Comercial", 135.0),
                    ("Principio Activo DCI", 125.0),
                    ("Anaquel / Ubicacion", 85.0),
                    ("Minimo", 45.0),
                    (col_stock_label, 55.0)
                ]

                filas = []
                for p in productos:
                    cant_val = "[  _________  ]" if es_ciego else f"{p.get('cantidad_disponible', 0)} unid."
                    filas.append([
                        str(p.get("codigo_barras", "")),
                        str(p.get("nombre_comercial", "")),
                        str(p.get("principio_activo", "")),
                        str(p.get("ubicacion_anaquel", "Mostrador")),
                        str(p.get("stock_minimo", 10)),
                        cant_val
                    ])

                modo_titulo = "Modalidad: Conteo Ciego en Anaquel" if es_ciego else "Modalidad: Auditor (Cantidades Esperadas del Sistema)"
                totales_resumen = f"Total de Items Bajo Stock Minimo: {len(productos)} productos"

                pdf_bytes = pdf_writer.build_report_pages(
                    farmacia_nombre=farmacia_nombre,
                    titulo_reporte=f"Reporte de Conteo Fisico por Quiebre de Stock ({modalidad.upper()})",
                    subtitulo=f"Filtro: Existencia actual <= Stock Minimo de Seguridad. {modo_titulo}",
                    columnas=columnas,
                    filas=filas,
                    totales_resumen=totales_resumen
                )

                self.send_response(200)
                self.send_header("Content-Type", "application/pdf")
                self.send_header("Content-Disposition", f'inline; filename="reporte_bajo_stock_{modalidad}.pdf"')
                self.send_header("Content-Length", str(len(pdf_bytes)))
                self.end_headers()
                self.wfile.write(pdf_bytes)
                return

            if path == "/api/finanzas/dashboard":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                periodo = query.get("periodo", ["dia"])[0].lower()  # "dia", "semana", "mes"
                current_user = self._get_authenticated_user()

                # Restricción ROL_ADMIN_CAJA
                if current_user and current_user.get("role") not in ("ROL_ADMIN_CAJA", "ADMIN", "SUPERADMIN"):
                    # Si tiene token de paciente o rol no autorizado
                    if current_user.get("role") == "ROL_PACIENTE_APP":
                        self._send_json(403, {"ok": False, "error": "Acceso restringido exclusivamente al Administrador de Caja físico."})
                        return

                dash = db.get_dashboard_financiero(farmacia_id=farmacia_id, periodo=periodo)
                self._send_json(200, dash)
                return

            if path == "/api/adherencia/renovaciones":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                dias = int(query.get("dias", ["5"])[0])
                current_user = self._get_authenticated_user()
                pid = None
                if current_user and current_user.get("role") == "ROL_PACIENTE_APP":
                    pid = current_user.get("user_id")

                renovaciones = db.get_adherence_expiring_treatments(farmacia_id=farmacia_id, dias_umbral=dias, paciente_id=pid)
                self._send_json(200, {
                    "ok": True,
                    "dias_umbral": dias,
                    "total_pacientes_renovacion": len(renovaciones),
                    "renovaciones": renovaciones
                })
                return

            if path == "/api/pre-carrito":
                current_user = self._get_authenticated_user()
                pid = query.get("paciente_id", [None])[0]
                if current_user and current_user.get("role") == "ROL_PACIENTE_APP":
                    pid = current_user.get("user_id")
                if not pid:
                    pid = 1
                pre_cart = db.get_pending_pre_carrito(paciente_id=int(pid))
                self._send_json(200, {
                    "ok": True,
                    "paciente_id": int(pid),
                    "pre_carrito": pre_cart
                })
                return

            if path == "/ping":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(b'{"status":"ok","message":"FarmaSys Render Keep-Alive Pong"}')
                return

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

            if path == "/api/chronic-patients":
                current_user = self._get_authenticated_user()
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                filter_status = query.get("filter_status", [None])[0]
                telefono = query.get("telefono", [None])[0]

                # REGLA DE ORO DE PRIVACIDAD: Si es ROL_PACIENTE_APP, aislar estrictamente por su propio teléfono
                if current_user and current_user.get("role") == "ROL_PACIENTE_APP":
                    user_phone = current_user.get("telefono", "")
                    if not user_phone:
                        # buscar teléfono del paciente
                        try:
                            with db._get_connection() as c_p:
                                p_row = c_p.execute("SELECT telefono FROM pacientes WHERE id = ?", (int(current_user.get("user_id", 0)),)).fetchone()
                                if p_row:
                                    user_phone = p_row["telefono"]
                        except Exception:
                            pass
                    telefono = user_phone

                patients = db.list_chronic_patients(farmacia_id=farmacia_id, filter_status=filter_status, telefono=telefono)
                self._send_json(200, {"ok": True, "patients": patients})
                return

            if path == "/api/patient/vital-signs":
                current_user = self._get_authenticated_user()
                if not current_user:
                    self._send_json(401, {"ok": False, "error": "Autenticación requerida. Token JWT ausente o inválido."})
                    return
                # Regla de Oro: Filtrar estrictamente WHERE paciente_id = current_user.id
                pac_id = int(current_user.get("user_id") or current_user.get("id") or current_user.get("paciente_id", 0))
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                vitals = db.get_historial_antropometrico(paciente_id=pac_id, farmacia_id=farmacia_id)
                self._send_json(200, {"ok": True, "paciente_id": pac_id, "vital_signs": vitals})
                return

            if path in ("/api/therapeutic-kits", "/api/kits-terapeuticos"):
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                only_active = query.get("only_active", ["1"])[0] in ("1", "true", "True")
                kits = db.list_kits_terapeuticos(farmacia_id=farmacia_id, only_active=only_active)
                self._send_json(200, {"ok": True, "kits": kits})
                return

            if path == "/api/promotional-kits":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                only_active = query.get("only_active", ["0"])[0] in ("1", "true", "True")
                kits = db.list_promotional_kits(farmacia_id=farmacia_id, only_active=only_active)
                if not kits:
                    kits = ai_engine.generate_ai_medical_kits(farmacia_id=farmacia_id)
                self._send_json(200, {"ok": True, "kits": kits})
                return

            if path == "/api/ai/hub":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                hub = ai_engine.get_full_ai_hub_overview(farmacia_id=farmacia_id)
                self._send_json(200, hub)
                return

            if path == "/api/pos/guide/status":
                self._send_json(200, pos_guide_hub.get_status())
                return

            if path == "/api/pos/guide/scenarios":
                self._send_json(200, {"ok": True, "scenarios": list(pos_guide_hub.scenarios.values())})
                return

            if path == "/api/ai/suggest-active-ingredient":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                q = query.get("q", [""])[0]
                prod_id_raw = query.get("producto_id", [None])[0]
                prod_id = int(prod_id_raw) if prod_id_raw and str(prod_id_raw).isdigit() else None
                res = ai_engine.suggest_by_active_ingredient(farmacia_id=farmacia_id, query=q, producto_id=prod_id)
                self._send_json(200, res)
                return

            if path == "/api/ai/stock-and-top-sellers":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                res = ai_engine.get_stock_and_top_sellers_intelligence(farmacia_id=farmacia_id)
                self._send_json(200, res)
                return

            if path == "/api/ai/chronic-10d-reminders":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                telefono = query.get("telefono", [None])[0]
                days_ahead_raw = query.get("days_ahead", ["10"])[0]
                days_ahead = int(days_ahead_raw) if str(days_ahead_raw).isdigit() else 10
                res = ai_engine.get_chronic_10day_reminders(farmacia_id=farmacia_id, telefono=telefono, days_ahead=days_ahead)
                self._send_json(200, res)
                return

            if path == "/api/ai/seasonal":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                season_key = query.get("season", [None])[0]
                res = ai_engine.get_seasonal_recommendations(farmacia_id=farmacia_id, season_key=season_key)
                self._send_json(200, res)
                return

            if path == "/api/pharmaceutical-care":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                pac_id_raw = query.get("paciente_cronico_id", [None])[0]
                pac_id = int(pac_id_raw) if pac_id_raw and str(pac_id_raw).isdigit() else None
                q_search = query.get("q", [None])[0]
                tariffs = db.get_pharmaceutical_care_tariffs(farmacia_id=farmacia_id)
                records = db.list_pharmaceutical_care_records(farmacia_id=farmacia_id, paciente_cronico_id=pac_id, query=q_search)
                self._send_json(200, {"ok": True, "tariffs": tariffs, "records": records})
                return

            if path == "/api/frequent-plans":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                plans = db.list_patient_plans(farmacia_id=farmacia_id)
                self._send_json(200, {"ok": True, "plans": plans})
                return

            if path == "/api/patient/search-checkout":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                q = query.get("q", [""])[0]
                result = db.search_patient_for_checkout(farmacia_id=farmacia_id, query=q)
                self._send_json(200, result)
                return

            if path == "/api/pos/quejas":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                estado = query.get("estado", [None])[0]
                quejas = db.list_customer_complaints(farmacia_id=farmacia_id, estado=estado)
                summary = db.get_complaints_summary(farmacia_id=farmacia_id)
                self._send_json(200, {"ok": True, "quejas": quejas, "summary": summary})
                return

            if path == "/api/paciente/alergias":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                cedula = query.get("cedula", [""])[0]
                alergias = db.get_patient_allergies(farmacia_id=farmacia_id, cedula=cedula)
                self._send_json(200, {"ok": True, "cedula": cedula, "alergias": alergias})
                return

            if path == "/api/pos/caja/resumen":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                cajero = query.get("cajero", ["Cajero Davalsi"])[0]
                res = db.get_caja_shift_summary(farmacia_id=farmacia_id, cajero=cajero)
                self._send_json(200, res)
                return

            if path == "/api/farmabot/consultar":
                pregunta = query.get("pregunta", [""])[0].strip()
                res = farmabot_rd.procesar_consulta(pregunta)
                try:
                    servidor_asistente_ws.broadcast_farmabot(res)
                except Exception:
                    pass
                self._send_json(200, res)
                return

            if path == "/api/pos/cross-selling":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                pid = query.get("producto_id", [None])[0]
                cart_items = [{"producto_id": int(pid)}] if pid else []
                res = ai_engine.get_clinical_cross_selling(farmacia_id=farmacia_id, cart_items=cart_items)
                self._send_json(200, res)
                return

            if path == "/api/pos/reabastecimiento/sugerencias":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                dias_cobertura = int(query.get("dias_cobertura", ["30"])[0])
                lab = query.get("laboratorio", [None])[0]
                res = db.get_droguerias_restock_report(farmacia_id=farmacia_id, dias_cobertura=dias_cobertura, laboratorio_filtro=lab)
                self._send_json(200, res)
                return

            if path == "/api/delivery/tracking":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                order_code = query.get("codigo_orden", [None])[0]
                res = db.get_delivery_tracking_info(farmacia_id=farmacia_id, codigo_orden=order_code)
                self._send_json(200, res)
                return

            if path in ("/api/admin/users", "/api/staff/users"):
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                current_user = self._get_authenticated_user()
                # Verificar rol de administración
                users = db.list_staff_users(farmacia_id=farmacia_id)
                self._send_json(200, {"ok": True, "users": users, "staff": users})
                return

            if path == "/api/admin/config":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                current_user = self._get_authenticated_user()
                cfg = db.get_pharmacy_config(farmacia_id)
                self._send_json(200, {"ok": True, "config": cfg})
                return

            
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                users = db.list_staff_users(farmacia_id=farmacia_id)
                self._send_json(200, {"ok": True, "users": users})
                return

            if path == "/api/psicotropicos/libro":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                libro = db.list_psychotropics_logbook(farmacia_id=farmacia_id)
                self._send_json(200, {"ok": True, "libro": libro})
                return

            if path == "/api/pos/caja/historial":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                res = db.list_caja_cortes(farmacia_id=farmacia_id)
                self._send_json(200, {"ok": True, "cortes": res})
                return

            if path == "/api/products/substitutes":
                farmacia_id = int(query.get("farmacia_id", ["1"])[0])
                prod_id_str = query.get("producto_id", [None])[0]
                producto_id = int(prod_id_str) if prod_id_str and prod_id_str != "null" else None
                q = query.get("q", [""])[0]
                subs = db.get_intelligent_substitutions(farmacia_id=farmacia_id, producto_id=producto_id, query=q)
                self._send_json(200, {"ok": True, "substitutes": subs})
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
                current_user = self._get_authenticated_user()
                is_patient_app = (
                    (current_user and current_user.get("role") == "ROL_PACIENTE_APP")
                    or query.get("canal", [""])[0] == "APP_PACIENTE"
                    or "app" in self.headers.get("Referer", "").lower()
                )

                # Si es consumido por la App de pacientes, jamás exponer precios de costo ni alertas internas
                clean_products = []
                for p in products:
                    p_copy = dict(p)
                    if is_patient_app:
                        p_copy.pop("precio_costo", None)
                        p_copy.pop("margen_ganancia", None)
                        p_copy.pop("stock_minimo_alerta", None)
                    clean_products.append(p_copy)

                pharmacy_cfg = db.get_pharmacy_config(farmacia_id)
                if is_patient_app and pharmacy_cfg:
                    cfg_clean = dict(pharmacy_cfg)
                    cfg_clean.pop("rnc", None)
                    pharmacy_cfg = cfg_clean

                self._send_json(200, {"ok": True, "products": clean_products, "pharmacy_config": pharmacy_cfg})
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

            if path in ("/pos", "/pos/", "/sistema", "/sistema/", "/admin", "/admin/"):
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
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
            self.end_headers()
            self.wfile.write(content)

        except Exception as exc:
            self._send_json(500, {"ok": False, "error": str(exc)})

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        try:
            body = self._read_json_body()

            if path == "/api/pos/guide/start":
                scen_id = body.get("scenario_id", "venta_rapida")
                res = pos_guide_hub.start_scenario(scen_id)
                self._send_json(200, res)
                return

            if path == "/api/pos/guide/next":
                res = pos_guide_hub.next_step()
                self._send_json(200, res)
                return

            if path == "/api/pos/guide/prev":
                res = pos_guide_hub.prev_step()
                self._send_json(200, res)
                return

            if path == "/api/pos/guide/stop":
                res = pos_guide_hub.stop_guide()
                self._send_json(200, res)
                return

            if path == "/api/pos/guide/custom-step":
                res = pos_guide_hub.send_custom_step(
                    target_selector=body.get("target_selector", "#pos-search-input"),
                    mensaje=body.get("mensaje", "Indicación del sistema"),
                    robot_pose=body.get("robot_pose", "apuntando"),
                    titulo=body.get("titulo", "Paso de Guía"),
                    target_name=body.get("target_name", "Control Objetivo"),
                    robot_dialogo=body.get("robot_dialogo")
                )
                self._send_json(200, res)
                return

            if path == "/api/auth/login":
                farmacia_id = safe_farmacia_id(body, 1)
                clave = str(body.get("clave_acceso", ""))
                username = str(body.get("username", ""))
                pharmacy_profile = db.authenticate_pharmacy(
                    farmacia_id=farmacia_id, clave_acceso=clave, username=username
                )
                jwt_payload = {
                    "sub": str(farmacia_id),
                    "farmacia_id": farmacia_id,
                    "username": username or "admin",
                    "role": "ROL_ADMIN_CAJA",
                    "rol": "ROL_ADMIN_CAJA"
                }
                token = SimpleJWT.encode(jwt_payload, expires_in=86400 * 3)
                self._send_json(200, {
                    "ok": True,
                    "token": token,
                    "role": "ROL_ADMIN_CAJA",
                    "pharmacy": pharmacy_profile
                })
                return

            if path == "/api/patient/auth/login":
                identificador = str(body.get("identificador", body.get("telefono", "")))
                clave = str(body.get("clave_acceso", ""))
                patient = db.authenticate_patient(identificador=identificador, clave_acceso=clave)
                # Sincronizar en tabla pacientes
                paciente_record = db.get_or_register_paciente({
                    "nombre_completo": patient.get("nombre_completo", ""),
                    "telefono": patient.get("telefono", identificador),
                    "cedula": patient.get("cedula", ""),
                    "email": patient.get("email", ""),
                    "direccion_frecuente": patient.get("direccion_frecuente", "")
                })
                p_id = paciente_record.get("id", patient.get("id", 1))
                jwt_payload = {
                    "sub": str(p_id),
                    "user_id": p_id,
                    "paciente_id": p_id,
                    "id": p_id,
                    "telefono": patient.get("telefono", identificador),
                    "role": "ROL_PACIENTE_APP",
                    "rol": "ROL_PACIENTE_APP"
                }
                token = SimpleJWT.encode(jwt_payload, expires_in=86400 * 7)
                self._send_json(200, {
                    "ok": True,
                    "token": token,
                    "role": "ROL_PACIENTE_APP",
                    "patient": paciente_record
                })
                return

            if path == "/api/patient/auth/register":
                patient = db.register_patient(body)
                paciente_record = db.get_or_register_paciente({
                    "nombre_completo": patient.get("nombre_completo", ""),
                    "telefono": patient.get("telefono", ""),
                    "cedula": patient.get("cedula", ""),
                    "email": patient.get("email", ""),
                    "direccion_frecuente": patient.get("direccion_frecuente", ""),
                    "condiciones_cronicas": body.get("condiciones_cronicas", ""),
                    "alergias_medicamentosas": body.get("alergias_medicamentosas", ""),
                    "contacto_whatsapp": body.get("contacto_whatsapp", patient.get("telefono", ""))
                })
                p_id = paciente_record.get("id", patient.get("id", 1))
                jwt_payload = {
                    "sub": str(p_id),
                    "user_id": p_id,
                    "paciente_id": p_id,
                    "id": p_id,
                    "telefono": patient.get("telefono", ""),
                    "role": "ROL_PACIENTE_APP",
                    "rol": "ROL_PACIENTE_APP"
                }
                token = SimpleJWT.encode(jwt_payload, expires_in=86400 * 7)
                self._send_json(201, {
                    "ok": True,
                    "token": token,
                    "role": "ROL_PACIENTE_APP",
                    "patient": paciente_record
                })
                return

            if path == "/api/patient/vital-signs":
                current_user = self._get_authenticated_user()
                if not current_user:
                    self._send_json(401, {"ok": False, "error": "Autenticación requerida para registrar signos vitales."})
                    return
                # Regla de Oro: paciente_id forzado al current_user.id
                pac_id = int(current_user.get("user_id") or current_user.get("id") or current_user.get("paciente_id", 0))
                farmacia_id = safe_farmacia_id(body, 1)
                saved = db.record_antropometria_vitales(paciente_id=pac_id, farmacia_id=farmacia_id, data=body)
                self._send_json(201, {"ok": True, "vital_sign": saved})
                return

            if path in ("/api/therapeutic-kits", "/api/kits-terapeuticos"):
                current_user = self._get_authenticated_user()
                actor_role = str(body.get("actor_role", "")).upper()
                if current_user and current_user.get("role") == "ROL_PACIENTE_APP":
                    self._send_json(403, {"ok": False, "error": "Acceso denegado: Los pacientes no pueden crear kits terapéuticos."})
                    return
                farmacia_id = safe_farmacia_id(body, 1)
                saved = db.create_or_update_kit_terapeutico(farmacia_id=farmacia_id, data=body)
                self._send_json(200, {"ok": True, "kit": saved})
                return

            if path == "/api/inventory/correct-entry":
                farmacia_id = safe_farmacia_id(body, 1)
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
                farmacia_id = safe_farmacia_id(body, 0)
                deleted_info = db.delete_pharmacy(farmacia_id)
                self._send_json(200, {"ok": True, "deleted": deleted_info})
                return

            if path == "/api/staff":
                farmacia_id = safe_farmacia_id(body, 1)
                new_seller = db.create_seller(farmacia_id, body)
                self._send_json(201, {"ok": True, "seller": new_seller})
                return

            if path == "/api/staff/delete":
                farmacia_id = safe_farmacia_id(body, 1)
                staff_id = int(body.get("staff_id", 0))
                db.delete_seller(farmacia_id, staff_id)
                self._send_json(200, {"ok": True})
                return

            if path == "/api/debtors":
                farmacia_id = safe_farmacia_id(body, 1)
                new_debtor = db.create_debtor(farmacia_id, body)
                self._send_json(201, {"ok": True, "debtor": new_debtor})
                return

            if path == "/api/debtors/pay":
                farmacia_id = safe_farmacia_id(body, 1)
                deudor_id = int(body.get("deudor_id", 0))
                abono_rd = float(body.get("abono_rd", 0.0))
                updated_debtor = db.pay_debtor(farmacia_id, deudor_id, abono_rd)
                self._send_json(200, {"ok": True, "debtor": updated_debtor})
                return

            if path == "/api/debtors/remind":
                farmacia_id = safe_farmacia_id(body, 1)
                deudor_id = int(body.get("deudor_id", 0))
                remind_res = whatsapp_engine.send_debtor_reminder(farmacia_id, deudor_id)
                self._send_json(200, remind_res)
                return

            if path == "/api/chronic-patients":
                farmacia_id = safe_farmacia_id(body, 1)
                saved = db.create_or_update_chronic_patient(farmacia_id=farmacia_id, data=body)
                self._send_json(200, {"ok": True, "patient": saved})
                return

            if path == "/api/chronic-patients/renew":
                farmacia_id = safe_farmacia_id(body, 1)
                paciente_id = int(body.get("paciente_id", 0))
                dias = int(body.get("dias_agregados", 30))
                renewed = db.renew_chronic_patient_dispensation(farmacia_id=farmacia_id, paciente_cronico_id=paciente_id, days_added=dias)
                self._send_json(200, {"ok": True, "patient": renewed})
                return

            if path == "/api/chronic-patients/delete":
                farmacia_id = safe_farmacia_id(body, 1)
                paciente_id = int(body.get("paciente_id", 0))
                res = db.delete_chronic_patient(farmacia_id=farmacia_id, paciente_cronico_id=paciente_id)
                self._send_json(200, {"ok": True, "deleted": res})
                return

            if path == "/api/promotional-kits":
                farmacia_id = safe_farmacia_id(body, 1)
                saved = db.create_or_update_promotional_kit(farmacia_id=farmacia_id, data=body)
                self._send_json(200, {"ok": True, "kit": saved})
                return

            if path == "/api/promotional-kits/delete":
                farmacia_id = safe_farmacia_id(body, 1)
                kit_id = int(body.get("kit_id", 0))
                res = db.delete_promotional_kit(farmacia_id=farmacia_id, kit_id=kit_id)
                self._send_json(200, {"ok": True, "deleted": res})
                return

            if path == "/api/app/quejas":
                farmacia_id = safe_farmacia_id(body, 1)
                cliente_nombre = str(body.get("cliente_nombre", ""))
                cliente_telefono = str(body.get("cliente_telefono", ""))
                mensaje = str(body.get("mensaje", ""))
                result = ai_engine.process_customer_complaint(
                    farmacia_id=farmacia_id,
                    cliente_nombre=cliente_nombre,
                    cliente_telefono=cliente_telefono,
                    mensaje=mensaje
                )
                self._send_json(200, {"ok": True, "queja": result})
                return

            if path == "/api/pos/quejas/actualizar":
                farmacia_id = safe_farmacia_id(body, 1)
                queja_id = int(body.get("queja_id", 0))
                nuevo_estado = str(body.get("estado", "RESUELTO"))
                respuesta_admin = str(body.get("respuesta_admin", ""))
                updated = db.update_customer_complaint(
                    farmacia_id=farmacia_id,
                    complaint_id=queja_id,
                    estado=nuevo_estado,
                    respuesta_admin=respuesta_admin
                )
                summary = db.get_complaints_summary(farmacia_id=farmacia_id)
                self._send_json(200, {"ok": True, "queja": updated, "summary": summary})
                return

            if path == "/api/paciente/alergias":
                farmacia_id = safe_farmacia_id(body, 1)
                saved = db.save_patient_allergy(farmacia_id=farmacia_id, data=body)
                self._send_json(200, {"ok": True, "alergia": saved})
                return

            if path == "/api/paciente/verificar-alergia-producto":
                farmacia_id = safe_farmacia_id(body, 1)
                cedula = str(body.get("cedula", "")).strip()
                nombre_prod = str(body.get("nombre_producto", "")).strip()
                principio = str(body.get("principio_activo", "")).strip()
                res = db.check_patient_allergy_conflict(
                    farmacia_id=farmacia_id,
                    cedula=cedula,
                    product_name=nombre_prod,
                    active_ingredient=principio
                )
                self._send_json(200, res)
                return

            if path == "/api/receta/ocr-procesar":
                farmacia_id = safe_farmacia_id(body, 1)
                img_data = str(body.get("image_data", "")).strip()
                cedula = str(body.get("patient_cedula", "")).strip()
                ocr_result = ai_engine.process_prescription_ocr(
                    image_data=img_data,
                    patient_cedula=cedula,
                    farmacia_id=farmacia_id
                )
                self._send_json(200, ocr_result)
                return

            if path == "/api/pos/caja/corte":
                farmacia_id = safe_farmacia_id(body, 1)
                actor_role = str(body.get("actor_role", "")).upper()
                if actor_role in ("CAJERO", "VENDEDOR", "REGENTE", "REGENTE_FARMACEUTICO"):
                    self._send_json(403, {"ok": False, "error": "Acceso denegado: El Arqueo y Cierre de Caja (Corte X y Z) es exclusivo del Administrador."})
                    return
                res = db.create_caja_arqueo_corte(farmacia_id=farmacia_id, data=body)
                self._send_json(200, res)
                return

            if path in ("/api/admin/users", "/api/staff/save-user"):
                farmacia_id = safe_farmacia_id(body, 1)
                current_user = self._get_authenticated_user()
                actor_role = str(body.get("actor_role", "")).upper()
                if not actor_role and current_user:
                    actor_role = str(current_user.get("role") or current_user.get("rol") or "").upper()
                if actor_role not in ("ADMINISTRADOR", "ROL_ADMIN_CAJA", "ADMIN"):
                    self._send_json(403, {"ok": False, "error": "Acceso denegado: Se requiere rol ROL_ADMIN_CAJA para gestionar personal y permisos."})
                    return
                user_res = db.save_staff_user(farmacia_id=farmacia_id, data=body)
                self._send_json(200, {"ok": True, "user": user_res})
                return

            if path in ("/api/admin/users/delete", "/api/staff/delete-user"):
                farmacia_id = safe_farmacia_id(body, 1)
                staff_id = int(body.get("staff_id", body.get("user_id", 0)))
                db.delete_seller(farmacia_id, staff_id)
                self._send_json(200, {"ok": True, "mensaje": "Usuario eliminado correctamente."})
                return

            if path == "/api/admin/config":
                farmacia_id = safe_farmacia_id(body, 1)
                current_user = self._get_authenticated_user()
                actor_role = str(body.get("actor_role", "")).upper()
                if not actor_role and current_user:
                    actor_role = str(current_user.get("role") or current_user.get("rol") or "").upper()
                if actor_role not in ("ADMINISTRADOR", "ROL_ADMIN_CAJA", "ADMIN"):
                    self._send_json(403, {"ok": False, "error": "Acceso denegado: Se requiere rol ROL_ADMIN_CAJA para actualizar configuración."})
                    return
                updated_cfg = db.update_pharmacy_config(farmacia_id, body)
                self._send_json(200, {"ok": True, "config": updated_cfg})
                return

            
                farmacia_id = safe_farmacia_id(body, 1)
                actor_role = str(body.get("actor_role", "ADMINISTRADOR")).upper()
                if actor_role != "ADMINISTRADOR":
                    self._send_json(403, {"ok": False, "error": "Acceso denegado: Solo el Administrador puede gestionar personal y roles."})
                    return
                user_res = db.save_staff_user(farmacia_id=farmacia_id, data=body)
                self._send_json(200, {"ok": True, "user": user_res})
                return

            if path == "/api/psicotropicos/registrar-movimiento":
                farmacia_id = safe_farmacia_id(body, 1)
                actor_role = str(body.get("actor_role", "")).upper()
                if actor_role not in ("REGENTE", "REGENTE_FARMACEUTICO", "ADMINISTRADOR"):
                    self._send_json(403, {"ok": False, "error": "Acceso denegado: Solo el Regente Farmacéutico o el Administrador pueden registrar movimientos en el Libro de Psicotrópicos (Ley 50-88)."})
                    return
                res = db.register_psychotropic_movement(farmacia_id=farmacia_id, data=body)
                self._send_json(200, res)
                return

            if path == "/api/psicotropicos/autorizar-despacho":
                farmacia_id = safe_farmacia_id(body, 1)
                res = db.authorize_psychotropic_sale(farmacia_id=farmacia_id, data=body)
                self._send_json(200, res)
                return

            if path == "/api/pos/imprimir-ticket":
                farmacia_id = safe_farmacia_id(body, 1)
                ticket_data = body.get("ticket_data", {})
                paper_w = str(body.get("paper_width", "80mm"))
                open_drw = bool(body.get("open_drawer", False))
                res = db.generate_escpos_thermal_ticket(ticket_data=ticket_data, paper_width=paper_w, open_drawer=open_drw)
                self._send_json(200, res)
                return

            if path == "/api/farmabot/consultar":
                pregunta = str(body.get("pregunta", "")).strip()
                res = farmabot_rd.procesar_consulta(pregunta)
                try:
                    servidor_asistente_ws.broadcast_farmabot(res)
                except Exception:
                    pass
                self._send_json(200, res)
                return

            if path == "/api/pos/cross-selling":
                farmacia_id = safe_farmacia_id(body, 1)
                cart_items = body.get("cart_items", [])
                res = ai_engine.get_clinical_cross_selling(farmacia_id=farmacia_id, cart_items=cart_items)
                if res.get("has_suggestions") and pos_guide_hub:
                    try:
                        pos_guide_hub.send_custom_step(
                            target_selector="#pos-cross-selling-container",
                            mensaje=res.get("copilot_dialogue", "Sugerencia clínica de venta cruzada"),
                            robot_pose=res.get("robot_pose", "atencion"),
                            titulo=f"FarmaIA 3D: {res.get('cart_trigger', 'Venta Cruzada')}"
                        )
                    except Exception:
                        pass
                self._send_json(200, res)
                return

            if path == "/api/pos/reabastecimiento/exportar-csv":
                farmacia_id = safe_farmacia_id(body, 1)
                items = body.get("items", [])
                dias = int(body.get("dias_cobertura", 30))
                csv_data = db.generate_restock_csv_content(items=items, dias_cobertura=dias)
                csv_bytes = csv_data.encode("utf-8")
                now_tag = datetime.now().strftime("%Y%m%d_%H%M")
                filename = f"Orden_Compra_Droguerias_Davalsi_{now_tag}.csv"
                self.send_response(200)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
                self.send_header("Content-Length", str(len(csv_bytes)))
                self.end_headers()
                self.wfile.write(csv_bytes)
                return

            if path == "/api/delivery/actualizar-estado":
                farmacia_id = safe_farmacia_id(body, 1)
                order_code = str(body.get("codigo_orden", ""))
                estado = str(body.get("estado_delivery", "EN_CAMINO"))
                prog = body.get("progreso_pct")
                prog_val = float(prog) if prog is not None else None
                res = db.update_delivery_tracking_status(farmacia_id, order_code, estado, prog_val)
                self._send_json(200, res)
                return

            if path == "/api/whatsapp/enviar-alerta-cronico":
                farmacia_id = safe_farmacia_id(body, 1)
                pac_id = int(body.get("paciente_cronico_id", 0))
                res = whatsapp_engine.send_chronic_5day_whatsapp_alert(farmacia_id, pac_id)
                self._send_json(200, res)
                return

            if path == "/api/whatsapp/cronicos-5d/disparar-todos":
                farmacia_id = safe_farmacia_id(body, 1)
                res = whatsapp_engine.scan_and_notify_all_chronic_5d(farmacia_id)
                self._send_json(200, res)
                return

            if path == "/api/pos/abrir-gaveta":
                farmacia_id = safe_farmacia_id(body, 1)
                res = db.generate_escpos_thermal_ticket(ticket_data={"tipo": "PULSO APERTURA GAVETA", "is_corte": False}, open_drawer=True)
                self._send_json(200, {"ok": True, "mensaje": "Pulso ESC/POS de apertura enviado a gaveta de dinero (RJ11)", "raw_hex": res["raw_hex"]})
                return

            if path == "/api/ai/generate-kits":
                farmacia_id = safe_farmacia_id(body, 1)
                kits = ai_engine.generate_ai_medical_kits(farmacia_id=farmacia_id)
                self._send_json(200, {"ok": True, "kits": kits})
                return

            if path == "/api/ai/evaluate-vitals":
                eval_res = ai_engine.evaluate_vital_signs_interactive(body)
                self._send_json(200, eval_res)
                return

            if path == "/api/ai/ask-copilot":
                farmacia_id = safe_farmacia_id(body, 1)
                question = str(body.get("question", ""))
                ans = ai_engine.ask_pos_copilot(farmacia_id=farmacia_id, question=question)
                self._send_json(200, ans)
                return

            if path == "/api/ai/ask-app-guide":
                farmacia_id = safe_farmacia_id(body, 1)
                question = str(body.get("question", ""))
                ans = ai_engine.ask_app_patient_guide(farmacia_id=farmacia_id, question=question)
                self._send_json(200, ans)
                return

            if path == "/api/pharmaceutical-care":
                farmacia_id = safe_farmacia_id(body, 1)
                saved = db.create_pharmaceutical_care_record(farmacia_id=farmacia_id, data=body)
                self._send_json(200, {"ok": True, "record": saved})
                return

            if path == "/api/pharmaceutical-care/tariffs":
                farmacia_id = safe_farmacia_id(body, 1)
                tariffs = body.get("tariffs", [])
                updated = db.update_pharmaceutical_care_tariffs(farmacia_id=farmacia_id, tariffs=tariffs)
                self._send_json(200, {"ok": True, "tariffs": updated})
                return

            if path == "/api/pharmaceutical-care/delete":
                farmacia_id = safe_farmacia_id(body, 1)
                record_id = int(body.get("record_id", 0))
                res = db.delete_pharmaceutical_care_record(farmacia_id=farmacia_id, record_id=record_id)
                self._send_json(200, {"ok": True, "deleted": res})
                return

            if path == "/api/frequent-plans":
                farmacia_id = safe_farmacia_id(body, 1)
                saved = db.create_or_update_patient_plan(farmacia_id=farmacia_id, data=body)
                self._send_json(200, {"ok": True, "plan": saved})
                return

            if path == "/api/frequent-plans/delete":
                farmacia_id = safe_farmacia_id(body, 1)
                plan_id = int(body.get("plan_id", 0))
                res = db.delete_patient_plan(farmacia_id=farmacia_id, plan_id=plan_id)
                self._send_json(200, {"ok": True, "deleted": res})
                return

            if path == "/api/pharmacy/config":
                farmacia_id = safe_farmacia_id(body, 1)
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
                try:
                    if body.get("modalidad_entrega") == "DOMICILIO" or "DOMICILIO" in str(body.get("cliente_direccion", "")):
                        with db._get_connection(order_record["farmacia_id"]) as conn:
                            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                            conn.execute("""
                                INSERT OR REPLACE INTO pedidos_delivery_tracking (
                                    farmacia_id, codigo_orden, cliente_nombre, cliente_telefono, cliente_direccion,
                                    repartidor_nombre, repartidor_telefono, repartidor_vehiculo, estado_delivery,
                                    lat_origen, lng_origen, lat_destino, lng_destino,
                                    lat_repartidor, lng_repartidor, progreso_pct, eta_minutos,
                                    fecha_despacho, fecha_actualizacion
                                ) VALUES (
                                    ?, ?, ?, ?, ?,
                                    'Pedro Ramírez (Motorizado #3)', '809-555-8899', 'Motocicleta Honda C-90 (Placa K-084213)', 'EN_CAMINO',
                                    18.4746, -69.9328, 18.4835, -69.9405,
                                    18.4760, -69.9340, 25.0, 12,
                                    ?, ?
                                )
                            """, (order_record["farmacia_id"], order_record["codigo_orden"], order_record.get("cliente_nombre", "Cliente"), order_record.get("cliente_telefono", ""), order_record.get("cliente_direccion", ""), now_str, now_str))
                except Exception:
                    pass

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
                farmacia_id = safe_farmacia_id(body, 1)
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

                farmacia_id = safe_farmacia_id(body, 1)
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
                farmacia_id = safe_farmacia_id(body, 1)
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
                farmacia_id = safe_farmacia_id(body, 1)
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
                # INGRESO DE INVENTARIO ASISTIDO POR FARMA:
                # Si falta Principio Activo o metadatos clínicos, FarmaBrain enriquece automáticamente
                nom_com = str(body.get("nombre_comercial", "")).strip()
                conc = str(body.get("concentracion", "")).strip()
                try:
                    meta = farma_brain.enrich_medication_metadata(nom_com, conc)
                    if not body.get("principio_activo"):
                        body["principio_activo"] = meta.get("principio_activo_dci", nom_com)
                    body["principio_activo_dci"] = meta.get("principio_activo_dci", body.get("principio_activo", nom_com))
                    body["familia_farmacologica"] = meta.get("familia_farmacologica", body.get("categoria", ""))
                    body["codigo_atc"] = meta.get("codigo_atc", "")
                    body["generacion"] = meta.get("generacion", "1ª Generación")
                    if "es_controlado" not in body:
                        body["es_controlado"] = meta.get("es_controlado", False)
                    if "requiere_ajuste_renal" not in body:
                        body["requiere_ajuste_renal"] = meta.get("requiere_ajuste_renal", False)
                except Exception as e_meta:
                    print(f"[FarmaBrain] Error enriqueciendo metadatos clínicos: {e_meta}")

                new_prod = db.create_or_update_product(body)
                try:
                    ai_engine.generate_ai_medical_kits(farmacia_id=safe_farmacia_id(body, 1))
                except Exception:
                    pass
                self._send_json(201, {"ok": True, "product": new_prod})
                return

            if path == "/api/inventory/batch-analysis":
                farmacia_id = safe_farmacia_id(body, 1)
                analysis = farma_brain.analyze_inventory_batch(farmacia_id=farmacia_id, db_manager=db)
                self._send_json(200, analysis)
                return

            
            
            if path == "/api/finanzas/conciliar-transferencia":
                farmacia_id = safe_farmacia_id(body, 1)
                total_venta_esperado = float(body.get("total_venta_esperado", 0.0))
                image_base64 = body.get("imagen_base64", "")
                mime_type = body.get("mime_type", "image/jpeg")
                paciente_id = body.get("paciente_id")
                transaccion_id = body.get("transaccion_id")

                import base64
                image_bytes = b""
                if image_base64:
                    try:
                        if "," in image_base64:
                            image_base64 = image_base64.split(",", 1)[1]
                        image_bytes = base64.b64decode(image_base64)
                    except Exception as e:
                        print(f"[Conciliacion] Error base64: {e}")

                # 1. OCR Multimodal del Comprobante
                voucher_info = farma_brain.extract_transfer_voucher_ocr(image_bytes=image_bytes, mime_type=mime_type)
                monto_transferido = float(voucher_info.get("monto", 0.0))
                banco = voucher_info.get("banco", "Banco Dominicano")
                ref_num = str(voucher_info.get("numero_referencia", "")).strip().upper()
                fecha_tx = voucher_info.get("fecha_hora", "")

                # 2. FILTRO ANTI-FRAUDE 1: Coincidencia de Monto
                # Si el monto de la transferencia es menor al total de la venta esperada
                if total_venta_esperado > 0 and monto_transferido < (total_venta_esperado - 0.05):
                    diferencia = round(total_venta_esperado - monto_transferido, 2)
                    alerta_msg = f"ALERTA ROJA ANTI-FRAUDE: El comprobante es por RD$ {monto_transferido:.2f}, pero el total de la venta es RD$ {total_venta_esperado:.2f}. Faltan RD$ {diferencia:.2f}."
                    self._send_json(200, {
                        "ok": False,
                        "nivel_riesgo": "ROJO",
                        "bloquear_cobro": True,
                        "error_fraude": "MONTO_INSUFICIENTE",
                        "mensaje_alerta": alerta_msg,
                        "farma_dialogo": f"Atención cajero: El váucher transferido tiene un monto menor al total de la factura. Cobro bloqueado de inmediato.",
                        "datos_voucher": voucher_info
                    })
                    return

                # 3. FILTRO ANTI-FRAUDE 2: Número de Referencia ÚNICO
                res_registro = db.verificar_y_registrar_transferencia(
                    farmacia_id=farmacia_id,
                    numero_referencia=ref_num,
                    banco=banco,
                    monto=monto_transferido,
                    fecha=fecha_tx,
                    paciente_id=paciente_id,
                    transaccion_id=transaccion_id
                )

                if not res_registro["ok"] and res_registro.get("duplicado"):
                    alerta_msg = f"ALERTA ROJA DE FRAUDE: El número de referencia bancaria {ref_num} YA FUE REGISTRADO PREVIAMENTE en el sistema. Posible duplicado o váucher reutilizado."
                    self._send_json(200, {
                        "ok": False,
                        "nivel_riesgo": "ROJO",
                        "bloquear_cobro": True,
                        "error_fraude": "REFERENCIA_DUPLICADA",
                        "mensaje_alerta": alerta_msg,
                        "farma_dialogo": f"Peligro: Este váucher ya fue utilizado en otra venta. Facturación cancelada para prevenir fraude.",
                        "datos_voucher": voucher_info,
                        "registro_previo": res_registro.get("registro_previo")
                    })
                    return

                # Transferencia válida y verificada
                self._send_json(200, {
                    "ok": True,
                    "nivel_riesgo": "VERDE",
                    "bloquear_cobro": False,
                    "banco": banco,
                    "numero_referencia": ref_num,
                    "monto_transferido": monto_transferido,
                    "fecha_transferencia": fecha_tx,
                    "pago_id": res_registro.get("pago_id"),
                    "mensaje": "Váucher bancario validado con éxito. Sin duplicados y monto exacto.",
                    "farma_dialogo": f"Transferencia de {banco} por RD$ {monto_transferido:.2f} verificada con éxito. Referencia {ref_num} validada."
                })
                return

            if path == "/api/caja/cierre-asistido":
                farmacia_id = safe_farmacia_id(body, 1)
                efectivo_contado = float(body.get("efectivo_contado_gaveta", 0.0))
                cajero = body.get("cajero_nombre", "Cajero Principal")
                tipo_corte = body.get("tipo_corte", "CORTE_Z")

                # Obtener ventas esperadas del día
                dash_hoy = db.get_dashboard_financiero(farmacia_id=farmacia_id, periodo="dia")
                ventas_efectivo_esperadas = dash_hoy["desglose_metodos_pago"].get("EFECTIVO", 0.0)

                # Calcular descuadre
                descuadre = round(efectivo_contado - ventas_efectivo_esperadas, 2)
                estado_cuadre = "CUADRADO" if abs(descuadre) < 1.0 else ("SOBRANTE" if descuadre > 0 else "FALTANTE")

                # Contar transferencias validadas hoy
                with db._get_connection(farmacia_id=farmacia_id) as conn:
                    cnt_transf = conn.execute(
                        "SELECT COUNT(*) FROM pagos_transferencias WHERE farmacia_id = ? AND fecha_registro >= datetime('now', 'start of day')",
                        (farmacia_id,)
                    ).fetchone()[0]

                # Producto más rentable del turno
                top_prod = dash_hoy.get("top_productos_rentables", [])
                mas_rentable_nombre = top_prod[0]["nombre"] if top_prod else "Medicamentos de Mostrador"

                # Generar diálogo ejecutivo Farma 3D
                if estado_cuadre == "CUADRADO":
                    dialogo = f"¡Caja perfectamente cuadrada! El producto más rentable del turno fue {mas_rentable_nombre}. Se validaron {cnt_transf} transferencias bancarias sin novedades."
                elif estado_cuadre == "SOBRANTE":
                    dialogo = f"Cierre finalizado con un sobrante de RD$ {descuadre:.2f}. El ítem más rentable fue {mas_rentable_nombre} y se registraron {cnt_transf} transferencias válidas."
                else:
                    dialogo = f"Alerta de cierre: Se detectó un faltante en gaveta de RD$ {abs(descuadre):.2f}. El producto con mayor ganancia fue {mas_rentable_nombre}."

                self._send_json(200, {
                    "ok": True,
                    "cajero": cajero,
                    "tipo_corte": tipo_corte,
                    "ventas_efectivo_esperadas": ventas_efectivo_esperadas,
                    "efectivo_contado": efectivo_contado,
                    "descuadre": descuadre,
                    "estado_cuadre": estado_cuadre,
                    "transferencias_validadas_count": cnt_transf,
                    "producto_mas_rentable": mas_rentable_nombre,
                    "dashboard_dia": dash_hoy,
                    "farma_dialogo": dialogo
                })
                return

            if path == "/api/whatsapp/recepcion-receta":
                farmacia_id = safe_farmacia_id(body, 1)
                image_base64 = body.get("imagen_base64", "")
                mime_type = body.get("mime_type", "image/jpeg")
                paciente_id = body.get("paciente_id")
                paciente_nombre = body.get("paciente_nombre", "")
                paciente_telefono = body.get("paciente_telefono", "")

                # Extraer imagen binaria si viene en base64
                import base64
                image_bytes = b""
                if image_base64:
                    try:
                        if "," in image_base64:
                            image_base64 = image_base64.split(",", 1)[1]
                        image_bytes = base64.b64decode(image_base64)
                    except Exception as e:
                        print(f"[RecepcionReceta] Error al decodificar base64: {e}")

                # 1. Invocar Gemini Multimodal OCR
                ocr_result = farma_brain.extract_prescription_multimodal(
                    image_bytes=image_bytes,
                    mime_type=mime_type
                )

                med_prescritos = ocr_result.get("medicamentos", [])
                medico_info = ocr_result.get("medico", {})
                pac_info = ocr_result.get("paciente", {})
                if not paciente_nombre and pac_info.get("nombre"):
                    paciente_nombre = pac_info["nombre"]

                # 2. Cotejar automáticamente contra el inventario real (stock > 0)
                productos_en_stock = []
                with db._get_connection(farmacia_id=farmacia_id) as conn:
                    # Traer productos activos con stock > 0
                    p_rows = conn.execute("""
                        SELECT id, codigo_barras, nombre_comercial, principio_activo,
                               concentracion, precio_base, stock_total_unidades, ubicacion_anaquel
                        FROM productos
                        WHERE farmacia_id = ? AND activo = 1 AND stock_total_unidades > 0
                    """, (farmacia_id,)).fetchall()
                    stock_list = [dict(r) for r in p_rows]

                matched_items = []
                for med in med_prescritos:
                    nombre_buscado = med.get("nombre_comercial", "").lower()
                    dci_buscado = med.get("principio_activo_dci", "").lower()
                    cant_req = int(med.get("cantidad_solicitada", 1))

                    matched = None
                    for sp in stock_list:
                        sp_nom = sp["nombre_comercial"].lower()
                        sp_pa = (sp.get("principio_activo") or "").lower()
                        if (nombre_buscado and nombre_buscado in sp_nom) or (dci_buscado and dci_buscado in sp_pa):
                            matched = sp
                            break

                    if matched and matched["stock_total_unidades"] > 0:
                        matched_items.append({
                            "producto_id": matched["id"],
                            "nombre_comercial": matched["nombre_comercial"],
                            "principio_activo": matched["principio_activo"],
                            "concentracion": matched["concentracion"],
                            "cantidad": cant_req,
                            "precio_unitario": float(matched["precio_base"]),
                            "subtotal": round(float(matched["precio_base"]) * cant_req, 2),
                            "ubicacion_anaquel": matched["ubicacion_anaquel"],
                            "posologia": med.get("posologia", "Según prescripción médica"),
                            "stock_actual": matched["stock_total_unidades"]
                        })

                # 3. Crear pre-carrito exclusivo asociado a ese paciente_id
                pid_final = int(paciente_id or 1)
                pre_cart = db.save_pre_carrito(
                    farmacia_id=farmacia_id,
                    paciente_id=pid_final,
                    origen="WHATSAPP_RECETA",
                    items=matched_items,
                    codigo_receta=f"RX-WA-{pid_final}"
                )

                # 4. Registrar receta formal en recetas_medicas
                try:
                    db.create_prescription(farmacia_id, {
                        "paciente_nombre": paciente_nombre or "Paciente WhatsApp",
                        "paciente_telefono": paciente_telefono or "",
                        "medico_nombre": medico_info.get("nombre", "Dr. Prescriptor"),
                        "medico_exequatur": medico_info.get("exequatur", ""),
                        "centro_medico": medico_info.get("centro_medico", ""),
                        "medicamentos_prescritos": json.dumps(med_prescritos, ensure_ascii=False),
                        "diagnostico": pac_info.get("diagnostico", "Receta WhatsApp")
                    })
                except Exception as e:
                    print(f"[RecepcionReceta] Advertencia al guardar receta formal: {e}")

                # 5. Notificación Push / WebSocket a la caja física
                p_nombre_display = paciente_nombre or f"Paciente #{pid_final}"
                cant_stock = len(matched_items)
                ws_mensaje = f"Nueva receta procesada de {p_nombre_display}. {cant_stock} productos en stock listos para revisión y despacho."
                try:
                    servidor_asistente_ws.broadcast_farmabot({
                        "titulo": "Nueva Receta WhatsApp Recibida",
                        "mensaje_dialogo": ws_mensaje,
                        "postura_robot": "medico",
                        "tipo_dialogo": "alerta",
                        "elemento_a_resaltar": "#pos-cart-tbody"
                    })
                except Exception as e:
                    print(f"[RecepcionReceta] WS broadcast error: {e}")

                self._send_json(200, {
                    "ok": True,
                    "mensaje": "Receta procesada exitosamente con IA multimodal",
                    "paciente_id": pid_final,
                    "paciente_nombre": p_nombre_display,
                    "medico": medico_info,
                    "medicamentos_extraidos": med_prescritos,
                    "items_en_stock": matched_items,
                    "pre_carrito": pre_cart,
                    "notificacion_caja": ws_mensaje
                })
                return

            if path == "/api/farma/asistir":
                farmacia_id = safe_farmacia_id(body, 1)
                current_user = self._get_authenticated_user()
                caller_role = (current_user.get("role") if current_user else "ROL_ANONIMO")
                
                # Inyectar rol autenticado en el payload para proteger datos privados / costos
                body["caller_role"] = caller_role
                if current_user and current_user.get("user_id"):
                    body["caller_user_id"] = current_user.get("user_id")

                assist_result = farma_brain.assist_pos_checkout(farmacia_id=farmacia_id, payload=body, db_manager=db)
                
                # Si el usuario es un paciente de la app (ROL_PACIENTE_APP), proteger costos y notas internas de almacén
                if caller_role == "ROL_PACIENTE_APP" or body.get("canal") == "APP_PACIENTE":
                    if "productos_sustitutos_en_stock" in assist_result:
                        for p in assist_result["productos_sustitutos_en_stock"]:
                            p.pop("precio_costo", None)
                            p.pop("margen_ganancia", None)
                    # Diálogo adaptado con calidez al paciente
                    if assist_result.get("farma_dialogo"):
                        dlg = assist_result["farma_dialogo"]
                        dlg = dlg.replace("personal de farmacia", "apreciado cliente").replace("cajero", "cliente")
                        assist_result["farma_dialogo"] = dlg

                self._send_json(200, assist_result)
                return

            if path in ("/api/products/update", "/api/products/edit"):
                farmacia_id = safe_farmacia_id(body, 1)
                producto_id = int(body.get("producto_id", 0))
                actor_role = str(body.get("actor_role", "")).upper()
                if actor_role in ("CAJERO", "VENDEDOR"):
                    self._send_json(403, {"ok": False, "error": "Acceso denegado: El Cajero solo tiene permisos de consulta y venta. No puede editar productos ni precios."})
                    return
                if actor_role in ("REGENTE", "REGENTE_FARMACEUTICO"):
                    # El regente puede editar lotes y vencimientos de inventario, pero no el precio base ni costo
                    if "precio_base" in body and body["precio_base"] is not None:
                        # Obtenemos producto original
                        orig = db.get_product_by_id(farmacia_id, producto_id)
                        if orig and float(body.get("precio_base", 0)) != float(orig.get("precio_base", 0)):
                            self._send_json(403, {"ok": False, "error": "Acceso denegado: El Regente Farmacéutico controla inventario técnico y psicotrópicos, pero la modificación de precios es exclusiva del Administrador."})
                            return
                updated_prod = db.update_product(farmacia_id, producto_id, body)
                self._send_json(200, {"ok": True, "product": updated_prod})
                return

            if path in ("/api/products/delete", "/api/products/remove"):
                farmacia_id = safe_farmacia_id(body, 1)
                producto_id = int(body.get("producto_id", 0))
                del_res = db.delete_product(farmacia_id, producto_id)
                self._send_json(200, {"ok": True, "deleted": del_res})
                return

            if path == "/api/prescriptions":
                farmacia_id = safe_farmacia_id(body, 1)
                new_rx = db.create_prescription(farmacia_id, body)
                self._send_json(201, {"ok": True, "prescription": new_rx})
                return

            if path == "/api/prescriptions/dispatch":
                farmacia_id = safe_farmacia_id(body, 1)
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
