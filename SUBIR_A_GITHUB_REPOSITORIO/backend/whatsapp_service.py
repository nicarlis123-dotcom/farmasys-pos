"""
Motor de Notificaciones Automatizadas por WhatsApp Business API (Meta Cloud API & Twilio)
Multi-Farmacia — Cada sucursal/farmacia tiene su propio número de WhatsApp y configuración de API.
"""

import os
import json
import base64
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime
from typing import Dict, Any, List, Optional


class WhatsAppBusinessService:
    """
    Cliente HTTP nativo para WhatsApp Business Cloud API (Meta) y Twilio WhatsApp API.
    Opera de manera independiente para cada farmacia registrada en el sistema.
    """

    def __init__(self, db_manager) -> None:
        self.db = db_manager

    def get_config(self, farmacia_id: int = 1) -> Dict[str, Any]:
        """Obtiene la configuración de WhatsApp específica de la farmacia seleccionada."""
        db_cfg = self.db.get_pharmacy_config(int(farmacia_id))
        return {
            "farmacia_id": int(farmacia_id),
            "farmacia_nombre": db_cfg.get("nombre", "Farmacia Davalsi"),
            "provider": os.environ.get("WHATSAPP_PROVIDER", db_cfg.get("wa_provider", "META_CLOUD_API")),
            "pharmacy_whatsapp": os.environ.get("PHARMACY_WHATSAPP_NUMBER", db_cfg.get("telefono_whatsapp", "18095550199")),
            "meta_phone_number_id": os.environ.get("META_PHONE_NUMBER_ID", db_cfg.get("meta_phone_number_id", "105928374650192")),
            "meta_access_token": os.environ.get("META_ACCESS_TOKEN", db_cfg.get("meta_access_token", "")),
            "meta_api_version": os.environ.get("META_API_VERSION", db_cfg.get("meta_api_version", "v20.0")),
            "twilio_account_sid": os.environ.get("TWILIO_ACCOUNT_SID", db_cfg.get("twilio_account_sid", "")),
            "twilio_auth_token": os.environ.get("TWILIO_AUTH_TOKEN", db_cfg.get("twilio_auth_token", "")),
            "twilio_from_number": os.environ.get("TWILIO_FROM_NUMBER", db_cfg.get("twilio_from_number", "whatsapp:+14155238886")),
            "public_base_url": os.environ.get("PUBLIC_BASE_URL", db_cfg.get("public_base_url", "http://localhost:8080")),
        }

    @staticmethod
    def normalize_phone(phone: str) -> str:
        """Normaliza números telefónicos al formato internacional E.164 (RD +1 809/829/849)."""
        digits = "".join(ch for ch in (phone or "") if ch.isdigit())
        if not digits:
            return "18095550100"
        if len(digits) == 10 and digits.startswith(("809", "829", "849")):
            return "1" + digits
        return digits

    def _dispatch_meta_cloud_api(
        self,
        to_phone: str,
        body_text: str,
        cfg: Dict[str, Any],
        media_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        phone_id = cfg["meta_phone_number_id"]
        version = cfg["meta_api_version"]
        endpoint = f"https://graph.facebook.com/{version}/{phone_id}/messages"

        payload: Dict[str, Any] = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": self.normalize_phone(to_phone),
            "type": "text",
            "text": {
                "preview_url": True,
                "body": body_text,
            },
        }

        token = (cfg.get("meta_access_token") or "").strip()
        if not token:
            return {
                "dispatched_live": False,
                "provider": "META_CLOUD_API",
                "endpoint": endpoint,
                "http_status": 200,
                "request_payload": payload,
                "response_body": {
                    "messaging_product": "whatsapp",
                    "contacts": [{"input": to_phone, "wa_id": self.normalize_phone(to_phone)}],
                    "messages": [{"id": f"wamid.DAVALSI_{int(datetime.now().timestamp() * 1000)}"}],
                    "mode": "SANDBOX_SIMULATED (Configure META_ACCESS_TOKEN en esta sucursal para envío en vivo)",
                },
            }

        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            endpoint,
            data=data_bytes,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                resp_body = json.loads(resp.read().decode("utf-8"))
                return {
                    "dispatched_live": True,
                    "provider": "META_CLOUD_API",
                    "endpoint": endpoint,
                    "http_status": resp.status,
                    "request_payload": payload,
                    "response_body": resp_body,
                }
        except urllib.error.HTTPError as e:
            err_text = e.read().decode("utf-8", errors="replace")
            return {
                "dispatched_live": False,
                "provider": "META_CLOUD_API",
                "endpoint": endpoint,
                "http_status": e.code,
                "request_payload": payload,
                "response_body": {"error": err_text},
            }
        except Exception as e:
            return {
                "dispatched_live": False,
                "provider": "META_CLOUD_API",
                "endpoint": endpoint,
                "http_status": 503,
                "request_payload": payload,
                "response_body": {"error": str(e)},
            }

    def _dispatch_twilio_api(
        self,
        to_phone: str,
        body_text: str,
        cfg: Dict[str, Any],
        media_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        sid = (cfg.get("twilio_account_sid") or "AC_DAVALSI_SANDBOX").strip()
        token = (cfg.get("twilio_auth_token") or "").strip()
        endpoint = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"

        form_fields: Dict[str, str] = {
            "From": cfg.get("twilio_from_number", "whatsapp:+14155238886"),
            "To": f"whatsapp:+{self.normalize_phone(to_phone)}",
            "Body": body_text,
        }
        if media_url:
            form_fields["MediaUrl"] = media_url

        if not token or sid == "AC_DAVALSI_SANDBOX":
            return {
                "dispatched_live": False,
                "provider": "TWILIO_API",
                "endpoint": endpoint,
                "http_status": 201,
                "request_payload": form_fields,
                "response_body": {
                    "sid": f"SM{int(datetime.now().timestamp() * 1000)}",
                    "status": "queued",
                    "to": form_fields["To"],
                    "from": form_fields["From"],
                    "mode": "SANDBOX_SIMULATED (Configure TWILIO_ACCOUNT_SID/TOKEN en esta sucursal para envío en vivo)",
                },
            }

        encoded_form = urllib.parse.urlencode(form_fields).encode("utf-8")
        basic_auth = base64.b64encode(f"{sid}:{token}".encode("utf-8")).decode("ascii")
        req = urllib.request.Request(
            endpoint,
            data=encoded_form,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": f"Basic {basic_auth}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                resp_body = json.loads(resp.read().decode("utf-8"))
                return {
                    "dispatched_live": True,
                    "provider": "TWILIO_API",
                    "endpoint": endpoint,
                    "http_status": resp.status,
                    "request_payload": form_fields,
                    "response_body": resp_body,
                }
        except urllib.error.HTTPError as e:
            err_text = e.read().decode("utf-8", errors="replace")
            return {
                "dispatched_live": False,
                "provider": "TWILIO_API",
                "endpoint": endpoint,
                "http_status": e.code,
                "request_payload": form_fields,
                "response_body": {"error": err_text},
            }
        except Exception as e:
            return {
                "dispatched_live": False,
                "provider": "TWILIO_API",
                "endpoint": endpoint,
                "http_status": 503,
                "request_payload": form_fields,
                "response_body": {"error": str(e)},
            }

    def send_api_message(
        self,
        farmacia_id: int,
        recipient_role: str,
        to_phone: str,
        message_text: str,
        order_code: str,
        media_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        cfg = self.get_config(farmacia_id)
        provider = cfg.get("provider", "META_CLOUD_API").upper()

        if provider == "TWILIO_API":
            result = self._dispatch_twilio_api(to_phone, message_text, cfg, media_url=media_url)
        else:
            result = self._dispatch_meta_cloud_api(to_phone, message_text, cfg, media_url=media_url)

        log_id = self.db.log_whatsapp_notification(
            farmacia_id=int(farmacia_id),
            codigo_orden=order_code,
            destinatario_rol=recipient_role,
            telefono_destino=self.normalize_phone(to_phone),
            proveedor_api=result["provider"],
            endpoint_url=result["endpoint"],
            mensaje_texto=message_text,
            payload_json=json.dumps(result["request_payload"], ensure_ascii=False),
            respuesta_json=json.dumps(result["response_body"], ensure_ascii=False),
            http_status=result["http_status"],
            enviado_en_vivo=1 if result["dispatched_live"] else 0,
        )
        result["log_id"] = log_id
        result["farmacia_id"] = int(farmacia_id)
        result["recipient_role"] = recipient_role
        result["to_phone"] = self.normalize_phone(to_phone)
        result["message_text"] = message_text
        return result

    def notify_new_app_order(self, order_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        farmacia_id = int(order_data.get("farmacia_id", 1))
        cfg = self.get_config(farmacia_id)
        farmacia_nombre = cfg["farmacia_nombre"]
        base_url = cfg["public_base_url"].rstrip("/")
        order_code = order_data["codigo_orden"]
        requires_rx = bool(order_data.get("requiere_validacion_receta"))
        rx_url = (
            f"{base_url}{order_data['receta_imagen_url']}"
            if order_data.get("receta_imagen_url")
            else None
        )

        items_lines = []
        for idx, item in enumerate(order_data.get("items", []), start=1):
            items_lines.append(
                f"  {idx}. *{item['nombre_comercial']}*\n"
                f"     • Presentación: {item['cantidad_presentacion']}x *{item['presentacion']}* "
                f"({item['unidades_minimas_descontadas']} unid. mínimas)\n"
                f"     • Subtotal: RD$ {item['subtotal']:,.2f}"
            )
        items_text = "\n".join(items_lines)

        rx_section = (
            f"🩺 *Receta Médica Adjunta (Obligatoria):*\n{rx_url}\n"
            f"⚠️ _Pendiente de validación por el farmacéutico de turno._"
            if rx_url
            else "✅ *Sin requerimiento de receta médica controlada.*"
        )

        payment_ref = (
            f" (Ref/Comprobante: {order_data.get('referencia_pago')})"
            if order_data.get("referencia_pago")
            else ""
        )

        pharmacy_msg = (
            f"🏥 *{farmacia_nombre.upper()} — NUEVO PEDIDO APP #{order_code}*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"👤 *Paciente:* {order_data['cliente_nombre']}\n"
            f"📱 *WhatsApp Cliente:* +{self.normalize_phone(order_data['cliente_telefono'])}\n"
            f"📍 *Dirección de Entrega:* {order_data.get('cliente_direccion') or 'Retiro en Sucursal'}\n"
            f"💳 *Método de Pago:* {order_data['metodo_pago']}{payment_ref}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"📦 *DETALLE DEL PEDIDO (Inventario de Sucursal):*\n"
            f"{items_text}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"💰 *TOTAL ORDEN:* *RD$ {order_data['total']:,.2f}*\n\n"
            f"{rx_section}"
        )

        status_line_client = (
            "🩺 *Estado:* En revisión farmacéutica de tu receta médica adjunta."
            if requires_rx
            else "✅ *Estado:* Confirmado y en preparación para despacho inmediato."
        )

        client_msg = (
            f"💚 *¡Hola {order_data['cliente_nombre']}! Gracias por su compra en {farmacia_nombre}.*\n\n"
            f"🧾 *Comprobante de Orden:* *#{order_code}*\n"
            f"🏥 *Sucursal:* {farmacia_nombre}\n"
            f"💳 *Método de Pago:* {order_data['metodo_pago']}{payment_ref}\n"
            f"📍 *Destino:* {order_data.get('cliente_direccion') or 'Despacho en Mostrador'}\n\n"
            f"📦 *MEDICAMENTOS FACTURADOS:*\n"
            f"{items_text}\n\n"
            f"💰 *TOTAL A PAGAR:* *RD$ {order_data['total']:,.2f}*\n\n"
            f"{status_line_client}\n\n"
            f"¡Muchas gracias por su preferencia! Su salud es nuestra prioridad. 💊💚"
        )

        dispatches = []
        dispatches.append(
            self.send_api_message(
                farmacia_id=farmacia_id,
                recipient_role="FARMACIA_SUCURSAL",
                to_phone=cfg["pharmacy_whatsapp"],
                message_text=pharmacy_msg,
                order_code=order_code,
                media_url=rx_url,
            )
        )
        dispatches.append(
            self.send_api_message(
                farmacia_id=farmacia_id,
                recipient_role="PACIENTE_CLIENTE",
                to_phone=order_data["cliente_telefono"],
                message_text=client_msg,
                order_code=order_code,
            )
        )
        return dispatches

    def notify_prescription_status_update(
        self, order_data: Dict[str, Any], nuevo_estado: str, notas_farmaceutico: str = ""
    ) -> Dict[str, Any]:
        farmacia_id = int(order_data.get("farmacia_id", 1))
        cfg = self.get_config(farmacia_id)
        farmacia_nombre = cfg["farmacia_nombre"]
        order_code = order_data["codigo_orden"]

        if nuevo_estado == "APROBADO_DESPACHO":
            msg = (
                f"✅ *{farmacia_nombre.upper()} — RECETA VALIDADA (#{order_code})*\n\n"
                f"Hola *{order_data['cliente_nombre']}*, nuestro farmacéutico de turno ha validado tu receta médica.\n"
                f"🛵 Tu pedido por *RD$ {order_data['total']:,.2f}* ha sido aprobado y está en camino a: "
                f"*{order_data.get('cliente_direccion') or 'Sucursal'}*.\n"
                + (f"\n📝 *Nota farmacéutica:* _{notas_farmaceutico}_" if notas_farmaceutico else "")
            )
        else:
            msg = (
                f"⚠️ *{farmacia_nombre.upper()} — OBSERVACIÓN EN RECETA (#{order_code})*\n\n"
                f"Hola *{order_data['cliente_nombre']}*, revisamos la receta adjunta a tu orden *#{order_code}* "
                f"y necesitamos tu atención:\n"
                f"📝 *Motivo:* _{notas_farmaceutico or 'La imagen de la receta no es legible o no coincide con el medicamento regulado.'}_\n\n"
                f"El stock reservado ha sido reintegrado. Por favor contáctanos o sube una nueva foto clara de tu indicación médica."
            )

        return self.send_api_message(
            farmacia_id=farmacia_id,
            recipient_role="PACIENTE_CLIENTE",
            to_phone=order_data["cliente_telefono"],
            message_text=msg,
            order_code=order_code,
        )

    def send_debtor_reminder(self, farmacia_id: int, deudor_id: int) -> Dict[str, Any]:
        with self.db._get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM deudores WHERE id = ? AND farmacia_id = ?",
                (int(deudor_id), int(farmacia_id)),
            ).fetchone()
            if not row:
                raise ValueError("Deudor no encontrado en esta farmacia.")
            debtor = dict(row)

        cfg = self.get_config(farmacia_id)
        farmacia_nombre = cfg.get("farmacia_nombre", "Farmacia Davalsi")
        farmacia_tel = cfg.get("whatsapp_pharmacy_number") or cfg.get("telefono", "(809) 555-0199")

        phone = debtor.get("cliente_telefono", "").strip()
        saldo = float(debtor.get("saldo_pendiente_rd", 0.0))
        monto_orig = float(debtor.get("monto_deuda_rd", 0.0))
        abonado = float(debtor.get("monto_abonado_rd", 0.0))
        concepto = debtor.get("concepto") or "Medicamentos / Despacho a crédito"
        cliente = debtor.get("cliente_nombre", "Estimado(a) Cliente")

        msg = (
            f"🏥 *RECORDATORIO DE BALANCE PENDIENTE*\n"
            f"*{farmacia_nombre.upper()}*\n\n"
            f"Estimado(a) *{cliente}*,\n"
            f"Le saludamos cordialmente de *{farmacia_nombre}*.\n\n"
            f"Le recordamos amablemente que en nuestros registros presenta un saldo pendiente:\n"
            f"📋 *Concepto:* {concepto}\n"
            f"💵 *Monto original:* RD$ {monto_orig:,.2f}\n"
            f"✅ *Abonado:* RD$ {abonado:,.2f}\n"
            f"🔴 *Balance Pendiente:* *RD$ {saldo:,.2f}*\n\n"
            f"Agradecemos coordinar su pago en nuestra sucursal o por transferencia bancaria.\n"
            f"📞 *Contacto / WhatsApp:* {farmacia_tel}\n\n"
            f"¡Muchas gracias por su atención y preferencia!"
        )

        norm_phone = self.normalize_phone(phone)
        wa_link = f"https://wa.me/{norm_phone}?text={urllib.parse.quote(msg)}"

        dispatch_res = self.send_api_message(
            farmacia_id=farmacia_id,
            recipient_role="DEUDOR_CLIENTE",
            to_phone=phone,
            message_text=msg,
            order_code=f"DEUDOR-{deudor_id}",
        )

        return {
            "ok": True,
            "deudor_id": deudor_id,
            "cliente_nombre": cliente,
            "cliente_telefono": phone,
            "saldo_pendiente_rd": saldo,
            "mensaje": msg,
            "wa_link": wa_link,
            "dispatch": dispatch_res,
        }

