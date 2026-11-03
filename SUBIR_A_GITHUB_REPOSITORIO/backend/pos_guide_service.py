# -*- coding: utf-8 -*-
"""
Servicio de Asistencia Interactiva y Copiloto Visual para el Sistema de Ventas (POS)
Arquitectura:
  [ Sistema de Ventas en Python ]
         │
         ▼ (Envía orden JSON con el paso a seguir)
  [ WebSocket / Canal Local ]
         │
         ▼
  [ Pantalla / Frontend POS ]
         │──> 1. Mueve el marco verde al control objetivo
         │──> 2. Escribe el mensaje en el cuadro de diálogo
         └──> 3. El robot cambia su postura
"""

import json
import base64
import hashlib
import socket
import threading
import time
from typing import Dict, Any, List, Optional

class PosGuideService:
    def __init__(self, host: str = "0.0.0.0", ws_port: int = 8085):
        self.host = host
        self.ws_port = ws_port
        self.clients: List[socket.socket] = []
        self.lock = threading.Lock()
        self.current_state: Dict[str, Any] = {
            "active": False,
            "scenario_id": None,
            "step_index": 0,
            "step_data": None
        }
        self.event_queue: List[Dict[str, Any]] = []

        # Catálogo de Guías Interactivas Pre-configuradas del POS
        self.scenarios: Dict[str, Dict[str, Any]] = {
            "venta_rapida": {
                "id": "venta_rapida",
                "titulo": "Flujo de Venta Rápida en POS",
                "descripcion": "Aprende a buscar un medicamento, seleccionar su presentación, agregarlo al carrito y cobrar en caja.",
                "pasos": [
                    {
                        "paso": 1,
                        "titulo": "Paso 1: Buscar Medicamento",
                        "target_selector": "#pos-search-input",
                        "target_name": "Buscador de Medicamentos / Principio Activo",
                        "mensaje": "Escribe aquí el nombre comercial o principio activo del producto que pide el cliente (ej: «Paracetamol», «Ibuprofeno» o «Amoxicilina»).",
                        "robot_pose": "apuntando",
                        "robot_dialogo": "¡Hola! Para iniciar una venta rápida, escribe el producto aquí en el buscador.",
                        "accion_esperada": "Escribir en el buscador"
                    },
                    {
                        "paso": 2,
                        "titulo": "Paso 2: Seleccionar Presentación (Unidad, Blíster o Caja)",
                        "target_selector": "#pos-product-list-container, #pos-products-container, #pos-catalogo-grid",
                        "target_name": "Selector de Presentación en Catálogo",
                        "mensaje": "Elige si despacharás por Unidad, Blíster o Caja. El sistema desglosa y descuenta el inventario unificado en tiempo real.",
                        "robot_pose": "explicando",
                        "robot_dialogo": "Puedes vender pastillas sueltas por Unidad, por Blíster o la Caja completa. ¡Toca la presentación deseada!",
                        "accion_esperada": "Seleccionar presentación"
                    },
                    {
                        "paso": 3,
                        "titulo": "Paso 3: Verificar Carrito y Descuentos",
                        "target_selector": "#pos-cart-table-body, #cart-table, #pos-cart-container",
                        "target_name": "Tabla del Carrito de Ventas",
                        "mensaje": "Verifica el listado del pedido, la cantidad y si aplica algún descuento o seguro médico antes de proceder al cobro.",
                        "robot_pose": "observando",
                        "robot_dialogo": "Aquí tienes el desglose exacto de lo que lleva el cliente. Puedes ajustar cantidades fácilmente.",
                        "accion_esperada": "Revisar carrito"
                    },
                    {
                        "paso": 4,
                        "titulo": "Paso 4: Cobrar y Emitir Factura Fiscal",
                        "target_selector": "#btn-pay-EFECTIVO, #pos-checkout-btn, #btn-cobrar-pos",
                        "target_name": "Botones de Cobro en Caja",
                        "mensaje": "Presiona Efectivo, Tarjeta, Crédito o Seguro ARS. Al registrar el pago, se imprime el ticket térmico y se actualiza el stock.",
                        "robot_pose": "celebrando",
                        "robot_dialogo": "¡Excelente trabajo! Presiona cobrar para finalizar la venta e imprimir la factura oficial.",
                        "accion_esperada": "Cobrar en caja"
                    }
                ]
            },
            "toma_presion_azucar": {
                "id": "toma_presion_azucar",
                "titulo": "Registro de Presión Arterial, Azúcar y Peso",
                "descripcion": "Registra las tomas clínicas de salud hechas al paciente en la farmacia e imprime su comprobante térmico.",
                "pasos": [
                    {
                        "paso": 1,
                        "titulo": "Paso 1: Abrir Panel de Pacientes / Signos Vitales",
                        "target_selector": "#sys-grp-btn-pacientes, #btn-nav-pacientes, button[onclick*='pacientes']",
                        "target_name": "Módulo de Pacientes & Atención Clínica",
                        "mensaje": "Haz clic en «Pacientes & Clientes» en la barra de navegación para acceder al registro de salud.",
                        "robot_pose": "apuntando",
                        "robot_dialogo": "Vamos a registrar una toma de salud. Primero entra al módulo de Pacientes.",
                        "accion_esperada": "Abrir menú de pacientes"
                    },
                    {
                        "paso": 2,
                        "titulo": "Paso 2: Ingresar Presión Arterial (Sistólica / Diastólica)",
                        "target_selector": "#pc-pa-sis, #modal-patient-care-vitals",
                        "target_name": "Campos de Presión Arterial",
                        "mensaje": "Digita los valores tomados con el tensiómetro (ej: 120 / 80 mmHg). FarmaIA clasificará automáticamente el rango clínico.",
                        "robot_pose": "explicando",
                        "robot_dialogo": "Ingresa la presión arterial sistólica y diastólica. La IA evalúa si está normal o elevada.",
                        "accion_esperada": "Digitar valores de tensión"
                    },
                    {
                        "paso": 3,
                        "titulo": "Paso 3: Registrar Glicemia, Peso y Talla",
                        "target_selector": "#pc-glicemia, #pc-peso-kg, #pc-talla-cm",
                        "target_name": "Glicemia Capilar y Datos Antropométricos",
                        "mensaje": "Completa el nivel de azúcar en sangre (mg/dL), el peso (kg) y la estatura (cm). Se calculará el IMC al instante.",
                        "robot_pose": "observando",
                        "robot_dialogo": "Registra también el azúcar, peso y talla. Esta información queda guardada en el historial del cliente.",
                        "accion_esperada": "Completar signos"
                    },
                    {
                        "paso": 4,
                        "titulo": "Paso 4: Guardar e Imprimir Ticket Clínico",
                        "target_selector": "#btn-save-vitals, button[onclick*='savePatientVitals']",
                        "target_name": "Botón Guardar & Imprimir Comprobante",
                        "mensaje": "Guarda el registro para emitir el voucher térmico con semáforo preventivo que se entrega al paciente.",
                        "robot_pose": "celebrando",
                        "robot_dialogo": "¡Listo! El paciente recibe su ticket con recomendaciones preventivas personalizadas.",
                        "accion_esperada": "Guardar e imprimir"
                    }
                ]
            },
            "despachar_kit": {
                "id": "despachar_kit",
                "titulo": "Despacho de Kits Médicos Multi-Dosis",
                "descripcion": "Aprende a aplicar combos pre-configurados para Gripe, Cuadro Gástrico, Parásitos o Hipertensión.",
                "pasos": [
                    {
                        "paso": 1,
                        "titulo": "Paso 1: Abrir Asistente FarmaIA / Pestaña Kits",
                        "target_selector": "button[onclick*='openAiAssistantModal'], #btn-open-ai-modal",
                        "target_name": "Botón Copiloto FarmaIA",
                        "mensaje": "Abre el asistente inteligente para ver los Kits Médicos Multi-Dosis armados según la temporada y la patología.",
                        "robot_pose": "apuntando",
                        "robot_dialogo": "Los kits ofrecen esquemas completos de más de 1 dosis con precio especial. ¡Abramos el asistente!",
                        "accion_esperada": "Abrir FarmaIA"
                    },
                    {
                        "paso": 2,
                        "titulo": "Paso 2: Seleccionar el Combo Clínico",
                        "target_selector": "#ai-kits-container, #ai-tab-view-kits_temporadas",
                        "target_name": "Catálogo de Kits Médicos",
                        "mensaje": "Elige el kit correspondiente (ej: «Kit Gripe 3 Días» o «Kit Gástrico 5 Días»). Podrás ver el desglose exacto de medicamentos.",
                        "robot_pose": "explicando",
                        "robot_dialogo": "Cada kit incluye analgésico, protector gástrico o hidratación según corresponda.",
                        "accion_esperada": "Seleccionar combo"
                    },
                    {
                        "paso": 3,
                        "titulo": "Paso 3: Cargar Kit al Mostrador POS",
                        "target_selector": "button[onclick*='addKitToPosDirectly']",
                        "target_name": "Botón Despachar Kit en POS",
                        "mensaje": "Al hacer clic, todos los medicamentos del kit se cargan al carrito con su descuento de oferta aplicado.",
                        "robot_pose": "celebrando",
                        "robot_dialogo": "¡Todo en 1 solo clic! Sin tener que buscar producto por producto en el inventario.",
                        "accion_esperada": "Cargar al carrito"
                    }
                ]
            },
            "bajo_stock_compras": {
                "id": "bajo_stock_compras",
                "titulo": "Revisión de Bajo Stock y Sugerencias de Compra",
                "descripcion": "Identifica qué medicamentos están por agotarse y cuáles comprar más según el ranking de ventas.",
                "pasos": [
                    {
                        "paso": 1,
                        "titulo": "Paso 1: Pestaña Bajo Stock & Más Vendidos",
                        "target_selector": "#ai-tab-btn-stock_top, button[onclick*='stock_top']",
                        "target_name": "Pestaña Bajo Stock de FarmaIA",
                        "mensaje": "Accede a la inteligencia de abastecimiento que audita los niveles mínimos de inventario.",
                        "robot_pose": "alerta",
                        "robot_dialogo": "¡Atención aquí! La IA detecta productos en nivel crítico para evitar quedarnos sin mercancía.",
                        "accion_esperada": "Ver alertas de stock"
                    },
                    {
                        "paso": 2,
                        "titulo": "Paso 2: Generar Orden al Distribuidor",
                        "target_selector": "#ai-low-stock-list, #ai-top-sellers-list",
                        "target_name": "Lista de Compras Recomendadas",
                        "mensaje": "Revisa la sugerencia de compra calculada con el volumen de ventas recientes y confirma la reposición.",
                        "robot_pose": "explicando",
                        "robot_dialogo": "FarmaIA te indica exactamente cuántas cajas pedir de los productos de mayor rotación.",
                        "accion_esperada": "Revisar lista de reposición"
                    }
                ]
            }
        }

    # =========================================================================
    # SERVIDOR WEBSOCKET RFC 6455
    # =========================================================================

    def start_websocket_server(self):
        """Inicia el servidor WebSocket en segundo plano en un hilo independiente."""
        t = threading.Thread(target=self._run_server, daemon=True)
        t.start()
        print(f"[PosGuideService] Servidor WebSocket activo en ws://{self.host}:{self.ws_port}")

    def _run_server(self):
        srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            srv.bind((self.host, self.ws_port))
            srv.listen(10)
            while True:
                client_sock, addr = srv.accept()
                threading.Thread(target=self._handle_client, args=(client_sock, addr), daemon=True).start()
        except Exception as e:
            print(f"[PosGuideService] Error en servidor WebSocket: {e}")
        finally:
            srv.close()

    def _handle_client(self, client_sock: socket.socket, addr):
        try:
            # 1. Handshake WebSocket RFC 6455
            req_data = client_sock.recv(4096)
            if not req_data:
                client_sock.close()
                return

            req_str = req_data.decode("latin1", errors="ignore")
            key = None
            for line in req_str.split("\r\n"):
                if line.lower().startswith("sec-websocket-key:"):
                    key = line.split(":", 1)[1].strip()
                    break

            if not key:
                client_sock.close()
                return

            # Generar Sec-WebSocket-Accept
            magic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
            acc_str = key + magic
            sha1_hash = hashlib.sha1(acc_str.encode("utf-8")).digest()
            accept_key = base64.b64encode(sha1_hash).decode("ascii")

            handshake_resp = (
                "HTTP/1.1 101 Switching Protocols\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                f"Sec-WebSocket-Accept: {accept_key}\r\n\r\n"
            )
            client_sock.sendall(handshake_resp.encode("ascii"))

            with self.lock:
                self.clients.append(client_sock)
            print(f"[PosGuideService] Cliente POS conectado desde {addr}. Total: {len(self.clients)}")

            # Enviar estado actual si hay una guía en curso
            if self.current_state["active"] and self.current_state["step_data"]:
                self._send_frame_to_socket(client_sock, self.current_state["step_data"])

            # Mantener conexión y escuchar mensajes entrantes
            while True:
                hdr = client_sock.recv(2)
                if not hdr or len(hdr) < 2:
                    break
                # Opcode 8 = close
                opcode = hdr[0] & 0x0F
                if opcode == 0x08:
                    break
                
                pay_len = hdr[1] & 0x7F
                is_masked = bool(hdr[1] & 0x80)
                if pay_len == 126:
                    ext = client_sock.recv(2)
                    pay_len = int.from_bytes(ext, "big")
                elif pay_len == 127:
                    ext = client_sock.recv(8)
                    pay_len = int.from_bytes(ext, "big")

                mask_key = client_sock.recv(4) if is_masked else b""
                raw_payload = bytearray()
                while len(raw_payload) < pay_len:
                    chunk = client_sock.recv(min(pay_len - len(raw_payload), 65536))
                    if not chunk:
                        break
                    raw_payload.extend(chunk)

                if is_masked and mask_key:
                    unmasked = bytearray(b ^ mask_key[i % 4] for i, b in enumerate(raw_payload))
                else:
                    unmasked = raw_payload

                msg_text = unmasked.decode("utf-8", errors="ignore")
                if msg_text:
                    self._process_incoming_client_message(msg_text)

        except Exception as ex:
            pass
        finally:
            with self.lock:
                if client_sock in self.clients:
                    self.clients.remove(client_sock)
            try:
                client_sock.close()
            except Exception:
                pass

    def _send_frame_to_socket(self, sock: socket.socket, data: Dict[str, Any]):
        try:
            payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
            length = len(payload)
            frame = bytearray([0x81])
            if length <= 125:
                frame.append(length)
            elif length <= 65535:
                frame.append(126)
                frame.extend(length.to_bytes(2, "big"))
            else:
                frame.append(127)
                frame.extend(length.to_bytes(8, "big"))
            frame.extend(payload)
            sock.sendall(frame)
        except Exception:
            pass

    def broadcast_order(self, order_dict: Dict[str, Any]):
        """Transmite una orden JSON a todos los clientes WebSocket y guarda para SSE/Polling."""
        with self.lock:
            self.event_queue.append(order_dict)
            if len(self.event_queue) > 50:
                self.event_queue = self.event_queue[-50:]

            dead_clients = []
            for c in self.clients:
                try:
                    self._send_frame_to_socket(c, order_dict)
                except Exception:
                    dead_clients.append(c)
            for d in dead_clients:
                if d in self.clients:
                    self.clients.remove(d)

    def _process_incoming_client_message(self, text: str):
        try:
            cmd = json.loads(text)
            action = cmd.get("action")
            if action == "start":
                self.start_scenario(cmd.get("scenario_id", "venta_rapida"))
            elif action == "next":
                self.next_step()
            elif action == "prev":
                self.prev_step()
            elif action == "stop":
                self.stop_guide()
        except Exception:
            pass

    # =========================================================================
    # LÓGICA DE CONTROL DEL SISTEMA DE VENTAS EN PYTHON
    # =========================================================================

    def start_scenario(self, scenario_id: str = "venta_rapida") -> Dict[str, Any]:
        """Inicia un escenario guiado y emite el primer paso al Frontend POS."""
        scen = self.scenarios.get(scenario_id)
        if not scen:
            return {"ok": False, "error": f"Escenario «{scenario_id}» no existe."}

        self.current_state["active"] = True
        self.current_state["scenario_id"] = scenario_id
        self.current_state["step_index"] = 0

        return self._emit_step(0)

    def next_step(self) -> Dict[str, Any]:
        """Avanza al siguiente paso del escenario activo."""
        if not self.current_state["active"]:
            return {"ok": False, "error": "No hay guía activa."}

        scen = self.scenarios.get(self.current_state["scenario_id"])
        if not scen:
            return {"ok": False, "error": "Escenario no encontrado."}

        new_idx = self.current_state["step_index"] + 1
        if new_idx >= len(scen["pasos"]):
            # Completado con éxito
            complete_order = {
                "type": "POS_GUIDE_COMPLETE",
                "scenario_id": scen["id"],
                "titulo": "¡Guía Completada con Éxito!",
                "mensaje": f"Has finalizado todos los pasos de «{scen['titulo']}». ¡Excelente trabajo!",
                "robot_pose": "celebrando",
                "robot_dialogo": "¡Fantástico! Dominas este flujo del sistema de venta.",
                "marco_verde": {"visible": False}
            }
            self.current_state["active"] = False
            self.current_state["step_data"] = complete_order
            self.broadcast_order(complete_order)
            return complete_order

        self.current_state["step_index"] = new_idx
        return self._emit_step(new_idx)

    def prev_step(self) -> Dict[str, Any]:
        """Retrocede al paso anterior."""
        if not self.current_state["active"]:
            return {"ok": False, "error": "No hay guía activa."}
        new_idx = max(0, self.current_state["step_index"] - 1)
        self.current_state["step_index"] = new_idx
        return self._emit_step(new_idx)

    def stop_guide(self) -> Dict[str, Any]:
        """Detiene y oculta la guía interactiva en la pantalla."""
        self.current_state["active"] = False
        stop_order = {
            "type": "POS_GUIDE_STOP",
            "mensaje": "Guía cerrada por el usuario.",
            "robot_pose": "observando",
            "marco_verde": {"visible": False}
        }
        self.current_state["step_data"] = stop_order
        self.broadcast_order(stop_order)
        return stop_order

    def send_custom_step(
        self,
        target_selector: str,
        mensaje: str,
        robot_pose: str = "apuntando",
        titulo: str = "Indicación de FarmaIA",
        target_name: str = "Control Objetivo",
        robot_dialogo: Optional[str] = None
    ) -> Dict[str, Any]:
        """Permite a cualquier parte del backend Python enviar una orden puntual al POS."""
        valid_poses = ["apuntando", "explicando", "observando", "celebrando", "alerta"]
        if robot_pose not in valid_poses:
            robot_pose = "apuntando"

        step_order = {
            "type": "POS_GUIDE_STEP",
            "scenario_id": "custom",
            "paso": 1,
            "total_pasos": 1,
            "titulo": titulo,
            "target_selector": target_selector,
            "target_name": target_name,
            "mensaje": mensaje,
            "robot_pose": robot_pose,
            "robot_dialogo": robot_dialogo or mensaje,
            "marco_verde": {
                "visible": True,
                "color": "#10b981",
                "pulso": True,
                "grosor": "3.5px"
            }
        }
        self.current_state["active"] = True
        self.current_state["step_data"] = step_order
        self.broadcast_order(step_order)
        return step_order

    def _emit_step(self, idx: int) -> Dict[str, Any]:
        scen = self.scenarios[self.current_state["scenario_id"]]
        step_raw = scen["pasos"][idx]
        order = {
            "type": "POS_GUIDE_STEP",
            "scenario_id": scen["id"],
            "paso": step_raw["paso"],
            "total_pasos": len(scen["pasos"]),
            "titulo": step_raw["titulo"],
            "target_selector": step_raw["target_selector"],
            "target_name": step_raw["target_name"],
            "mensaje": step_raw["mensaje"],
            "robot_pose": step_raw.get("robot_pose", "apuntando"),
            "robot_dialogo": step_raw.get("robot_dialogo", step_raw["mensaje"]),
            "accion_esperada": step_raw.get("accion_esperada", "Interacción en control"),
            "marco_verde": {
                "visible": True,
                "color": "#10b981",
                "pulso": True,
                "grosor": "3.5px"
            }
        }
        self.current_state["step_data"] = order
        self.broadcast_order(order)
        return order

    def get_status(self) -> Dict[str, Any]:
        return {
            "ok": True,
            "connected_clients": len(self.clients),
            "state": self.current_state,
            "available_scenarios": [
                {"id": s["id"], "titulo": s["titulo"], "descripcion": s["descripcion"], "total_pasos": len(s["pasos"])}
                for s in self.scenarios.values()
            ]
        }

# Instancia global única
pos_guide_hub = PosGuideService(host="0.0.0.0", ws_port=8085)
