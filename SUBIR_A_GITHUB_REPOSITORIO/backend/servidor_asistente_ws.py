# -*- coding: utf-8 -*-
"""
Servidor WebSocket del Asistente IA (FarmaIA Copiloto) para Venta Guiada en POS
Puerto: 8765
"""

import asyncio
import json
import websockets
import os
import sys

# Asegurar importación de farmabot_rd
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

try:
    import farmabot_rd
except ImportError:
    farmabot_rd = None

# Definición de los pasos de la venta guiada
PASOS_VENTA = {
    "paso_1_busqueda": {
        "selector": "#txt-buscar-medicamento",
        "postura": "apuntar_izq",
        "postura_robot": "apuntar_izq",
        "tipo_dialogo": "info",
        "titulo": "1. Fármaco o Código",
        "mensaje": "Ingresa el nombre o escanea el código de barra del medicamento.",
        "mensaje_dialogo": "Ingresa el nombre o escanea el código de barra del medicamento.",
        "sugerencias_botones": ["Escanear Código", "Ver Inventario"]
    },
    "paso_2_lote": {
        "selector": "#tabla-lotes-vencimiento",
        "postura": "atencion",
        "postura_robot": "pensando",
        "tipo_dialogo": "info",
        "titulo": "2. Lote y Vencimiento",
        "mensaje": "Verifica que el lote seleccionado coincida con el empaque físico y tenga fecha vigente.",
        "mensaje_dialogo": "Verifica que el lote seleccionado coincida con el empaque físico y tenga fecha vigente.",
        "sugerencias_botones": ["Confirmar Lote", "Consultar Regente"]
    },
    "paso_3_cobro": {
        "selector": "#btn-cobrar-factura",
        "postura": "celebracion",
        "postura_robot": "celebracion",
        "tipo_dialogo": "exito",
        "titulo": "3. Finalizar Venta",
        "mensaje": "Haz clic en Cobrar para registrar el pago y emitir el comprobante fiscal.",
        "mensaje_dialogo": "Haz clic en Cobrar para registrar el pago y emitir el comprobante fiscal.",
        "sugerencias_botones": ["Cobrar en Efectivo", "Cobrar con Tarjeta", "Imprimir Comprobante"]
    },
    "ocultar": {
        "accion": "cerrar"
    }
}

clientes_conectados = set()
_main_loop = None

async def handler(websocket):
    clientes_conectados.add(websocket)
    print(f"[WS 8765] Cliente conectado desde {websocket.remote_address}. Clientes activos: {len(clientes_conectados)}")
    
    # Al conectarse un nuevo cliente POS, se puede enviar opcionalmente el paso 1 inicial
    try:
        await websocket.send(json.dumps(PASOS_VENTA["paso_1_busqueda"], ensure_ascii=False))
    except Exception as e:
        print(f"[WS 8765] Error al enviar paso inicial: {e}")

    try:
        async for mensaje in websocket:
            try:
                datos = json.loads(mensaje)
            except Exception:
                continue

            evento = datos.get("evento") or datos.get("accion")
            print(f"[WS 8765] Evento recibido desde POS: «{evento}»")
            
            if evento in ("consulta_clinica", "consultar_farmabot"):
                pregunta = datos.get("pregunta", "")
                if farmabot_rd:
                    resp = farmabot_rd.procesar_consulta(pregunta)
                else:
                    resp = {
                        "titulo": "Asistencia de Farmacia",
                        "mensaje_dialogo": f"Consulta procesada: {pregunta}",
                        "postura_robot": "idle",
                        "tipo_dialogo": "info",
                        "elemento_a_resaltar": "#pos-cart-tbody",
                        "sugerencias_botones": ["Entendido"]
                    }
                
                instruccion = {
                    "accion": "mostrar",
                    "titulo": resp.get("titulo", "FarmaBot RD"),
                    "mensaje": resp.get("mensaje_dialogo", ""),
                    "mensaje_dialogo": resp.get("mensaje_dialogo", ""),
                    "postura": resp.get("postura_robot", "idle"),
                    "postura_robot": resp.get("postura_robot", "idle"),
                    "tipo_dialogo": resp.get("tipo_dialogo", "info"),
                    "selector": resp.get("elemento_a_resaltar", "#pos-cart-tbody"),
                    "elemento_a_resaltar": resp.get("elemento_a_resaltar", "#pos-cart-tbody"),
                    "sugerencias_botones": resp.get("sugerencias_botones", [])
                }
                msg_json = json.dumps(instruccion, ensure_ascii=False)
                await asyncio.gather(*[ws.send(msg_json) for ws in clientes_conectados], return_exceptions=True)

            elif evento == "farmaco_ingresado":
                await notificar_paso("paso_2_lote")
                
            elif evento == "lote_confirmado":
                await notificar_paso("paso_3_cobro")
                
            elif evento in ("venta_completada", "cerrar", "ocultar"):
                await notificar_paso("ocultar")
                
            elif evento in ("iniciar_guia", "reiniciar"):
                await notificar_paso("paso_1_busqueda")
                
    except Exception as ex:
        pass
    finally:
        clientes_conectados.discard(websocket)
        print(f"[WS 8765] Cliente desconectado. Restantes: {len(clientes_conectados)}")

async def notificar_paso(nombre_paso):
    if clientes_conectados and nombre_paso in PASOS_VENTA:
        mensaje_json = json.dumps(PASOS_VENTA[nombre_paso], ensure_ascii=False)
        print(f"[WS 8765] Despachando paso a {len(clientes_conectados)} cliente(s): {nombre_paso}")
        await asyncio.gather(*[ws.send(mensaje_json) for ws in clientes_conectados], return_exceptions=True)

def broadcast_farmabot(res: dict):
    """Permite a server.py enviar respuestas de FarmaBot a todos los clientes POS conectados vía WebSocket."""
    global _main_loop
    if _main_loop and clientes_conectados:
        instruccion = {
            "accion": "mostrar",
            "titulo": res.get("titulo", "FarmaBot RD"),
            "mensaje": res.get("mensaje_dialogo", ""),
            "mensaje_dialogo": res.get("mensaje_dialogo", ""),
            "postura": res.get("postura_robot", "idle"),
            "postura_robot": res.get("postura_robot", "idle"),
            "tipo_dialogo": res.get("tipo_dialogo", "info"),
            "selector": res.get("elemento_a_resaltar", "#pos-cart-tbody"),
            "elemento_a_resaltar": res.get("elemento_a_resaltar", "#pos-cart-tbody"),
            "sugerencias_botones": res.get("sugerencias_botones", [])
        }
        msg_json = json.dumps(instruccion, ensure_ascii=False)
        async def _send():
            await asyncio.gather(*[ws.send(msg_json) for ws in clientes_conectados], return_exceptions=True)
        asyncio.run_coroutine_threadsafe(_send(), _main_loop)

async def main():
    global _main_loop
    _main_loop = asyncio.get_running_loop()
    async with websockets.serve(handler, "0.0.0.0", 8765):
        print("Servidor del Asistente IA activo en puerto 8765...")
        await asyncio.Future()  # Mantiene el servidor corriendo

def start_in_background():
    """Inicia el servidor en un hilo secundario para ser integrado con server.py"""
    import threading
    def _run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(main())
    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return t

if __name__ == "__main__":
    asyncio.run(main())
