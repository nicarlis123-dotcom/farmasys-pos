"""
Motor Matemático de Conversión de Empaques, Control de Inventario Unificado
y Evaluador de Alertas de Vencimiento (FEFO)
Farmacia Davalsi — Sistema Multi-Farmacia Omnicanal (App Paciente + Sistema POS/Admin)

Regla de Oro del Inventario:
- Todo el stock físico de cada farmacia se almacena en la base de datos en su UNIDAD MÍNIMA
  (ej. pastillas, cápsulas, sobres, ampollas o ml).
- Relación de empaques configurada por producto:
    * unidades_por_blister: cuántas unidades mínimas trae 1 blíster
    * blisters_por_caja: cuántos blísteres trae 1 caja
    * unidades_por_caja = unidades_por_blister * blisters_por_caja
"""

from dataclasses import dataclass
from datetime import datetime, date
from typing import Dict, Any, Tuple


PRESENTATION_UNIT = "UNIDAD"
PRESENTATION_BLISTER = "BLISTER"
PRESENTATION_BOX = "CAJA"

VALID_PRESENTATIONS = {PRESENTATION_UNIT, PRESENTATION_BLISTER, PRESENTATION_BOX}


@dataclass(frozen=True)
class PackagingConfig:
    """Configuración de factores de conversión de un medicamento."""
    unidades_por_blister: int
    blisters_por_caja: int
    permite_venta_unidad: bool = True
    permite_venta_blister: bool = True

    @property
    def unidades_por_caja(self) -> int:
        return max(1, self.unidades_por_blister * self.blisters_por_caja)

    def validate(self) -> None:
        if self.unidades_por_blister < 1:
            raise ValueError("unidades_por_blister debe ser mayor o igual a 1.")
        if self.blisters_por_caja < 1:
            raise ValueError("blisters_por_caja debe ser mayor o igual a 1.")


class InventoryMathEngine:
    """
    Motor centralizado para conversión exacta entre Caja ⇄ Blíster ⇄ Unidad,
    cálculo de precios por presentación en Pesos Dominicanos (RD$),
    desglose en tiempo real del stock físico y evaluación de caducidad/vencimiento.
    """

    @staticmethod
    def convert_to_minimum_units(
        presentation: str,
        quantity: int,
        unidades_por_blister: int,
        blisters_por_caja: int,
    ) -> int:
        """
        Convierte cualquier cantidad vendida (en CAJA, BLISTER o UNIDAD)
        al número exacto de unidades mínimas a descontar del stock_total_unidades.
        """
        if quantity <= 0:
            raise ValueError("La cantidad debe ser un entero positivo mayor a 0.")

        pres = (presentation or "").strip().upper()
        if pres not in VALID_PRESENTATIONS:
            raise ValueError(
                f"Presentación inválida '{presentation}'. Use: CAJA, BLISTER o UNIDAD."
            )

        cfg = PackagingConfig(
            unidades_por_blister=int(unidades_por_blister),
            blisters_por_caja=int(blisters_por_caja),
        )
        cfg.validate()

        if pres == PRESENTATION_UNIT:
            return int(quantity)
        elif pres == PRESENTATION_BLISTER:
            return int(quantity) * cfg.unidades_por_blister
        elif pres == PRESENTATION_BOX:
            return int(quantity) * cfg.unidades_por_caja

        raise ValueError(f"No se pudo convertir la presentación: {pres}")

    @staticmethod
    def evaluate_expiration_status(
        fecha_vencimiento_str: str,
        reference_date: date = None,
    ) -> Dict[str, Any]:
        """
        Evalúa el estado de vencimiento de un lote farmacéutico (FEFO):
        - VENCIDO (< 0 días)
        - CRITICO_30D (0 a 30 días)
        - PREVENTIVO_90D (31 a 90 días)
        - VIGENTE (> 90 días)
        """
        today = reference_date or datetime.now().date()
        try:
            exp_date = datetime.strptime((fecha_vencimiento_str or "").strip(), "%Y-%m-%d").date()
        except Exception:
            exp_date = date(today.year + 1, today.month, today.day)

        dias = (exp_date - today).days
        es_menor_7_meses = (dias <= 214)

        if dias < 0:
            estado = "VENCIDO"
            etiqueta = f"VENCIDO hace {abs(dias)} día(s)"
            alerta = True
            severidad = 3
        elif dias <= 30:
            estado = "CRITICO_30D"
            etiqueta = f"Vence en {dias} día(s) (Crítico ≤30d)"
            alerta = True
            severidad = 2
        elif dias <= 90:
            estado = "PREVENTIVO_90D"
            etiqueta = f"Vence en {dias} días (Preventivo ≤90d)"
            alerta = True
            severidad = 1
        elif dias <= 214:
            estado = "ALERTA_7_MESES"
            meses_aprox = max(1, round(dias / 30.5, 1))
            etiqueta = f"Vence en {dias} días (~{meses_aprox} meses | Alerta ≤ 7 Meses)"
            alerta = True
            severidad = 1
        else:
            estado = "VIGENTE"
            etiqueta = f"Vigente ({dias} días restantes)"
            alerta = False
            severidad = 0

        return {
            "fecha_vencimiento": exp_date.strftime("%Y-%m-%d"),
            "dias_para_vencer": dias,
            "estado_vencimiento": estado,
            "etiqueta_vencimiento": etiqueta,
            "alerta_vencimiento": alerta,
            "es_menor_7_meses": es_menor_7_meses,
            "vencido": dias < 0,
            "severidad": severidad,
        }

    @staticmethod
    def calculate_stock_breakdown(
        stock_total_unidades: int,
        unidades_por_blister: int,
        blisters_por_caja: int,
        stock_minimo_alerta: int = 20,
    ) -> Dict[str, Any]:
        """
        Calcula las equivalencias y el desglose físico a partir de stock_total_unidades.
        """
        total = max(0, int(stock_total_unidades))
        u_blister = max(1, int(unidades_por_blister))
        b_caja = max(1, int(blisters_por_caja))
        u_caja = u_blister * b_caja

        cajas_equivalentes = total // u_caja
        blisters_equivalentes = total // u_blister

        desglose_cajas = total // u_caja
        remanente_tras_cajas = total % u_caja
        desglose_blisters = remanente_tras_cajas // u_blister
        desglose_unidades = remanente_tras_cajas % u_blister

        if total == 0:
            estado_stock = "AGOTADO"
        elif total <= int(stock_minimo_alerta):
            estado_stock = "CRITICO"
        elif total <= int(stock_minimo_alerta * 1.75):
            estado_stock = "BAJO"
        else:
            estado_stock = "OPTIMO"

        return {
            "stock_total_unidades": total,
            "unidades_por_blister": u_blister,
            "blisters_por_caja": b_caja,
            "unidades_por_caja": u_caja,
            "cajas_disponibles": cajas_equivalentes,
            "blisters_disponibles": blisters_equivalentes,
            "desglose_fisico": {
                "cajas": desglose_cajas,
                "blisters_sueltos": desglose_blisters,
                "unidades_sueltas": desglose_unidades,
                "texto": (
                    f"{desglose_cajas} Caja(s) + {desglose_blisters} Blíster(es) + {desglose_unidades} Unid."
                    if u_caja > 1
                    else f"{total} Unidad(es)"
                ),
            },
            "stock_minimo_alerta": int(stock_minimo_alerta),
            "alerta_stock_bajo": total <= int(stock_minimo_alerta),
            "estado_stock": estado_stock,
        }

    @staticmethod
    def calculate_presentation_prices(
        precio_base_unidad: float,
        unidades_por_blister: int,
        blisters_por_caja: int,
        descuento_blister_pct: float = 5.0,
        descuento_caja_pct: float = 12.0,
    ) -> Dict[str, float]:
        """
        Calcula dinámicamente el precio en RD$ para cada presentación.
        """
        base = round(float(precio_base_unidad), 2)
        u_blister = max(1, int(unidades_por_blister))
        b_caja = max(1, int(blisters_por_caja))
        u_caja = u_blister * b_caja

        factor_blister = max(0.0, 1.0 - (float(descuento_blister_pct) / 100.0))
        factor_caja = max(0.0, 1.0 - (float(descuento_caja_pct) / 100.0))

        precio_blister = round(base * u_blister * factor_blister, 2) if u_blister > 1 else base
        precio_caja = round(base * u_caja * factor_caja, 2) if u_caja > 1 else base

        return {
            PRESENTATION_UNIT: base,
            PRESENTATION_BLISTER: precio_blister,
            PRESENTATION_BOX: precio_caja,
        }

    @classmethod
    def evaluate_sale_item(
        cls,
        product_row: Dict[str, Any],
        presentation: str,
        quantity: int,
    ) -> Tuple[int, float, float]:
        """
        Evalúa una línea de venta y retorna:
        (unidades_minimas_a_descontar, precio_unitario_presentacion, subtotal_linea)
        Valida disponibilidad contra stock_total_unidades y que no esté vencido.
        """
        pres = (presentation or "").strip().upper()
        qty = int(quantity)

        if product_row.get("fecha_vencimiento"):
            exp_info = cls.evaluate_expiration_status(product_row["fecha_vencimiento"])
            if exp_info["vencido"]:
                raise ValueError(
                    f"El lote {product_row.get('lote', 'N/A')} de '{product_row['nombre_comercial']}' "
                    f"está VENCIDO ({product_row['fecha_vencimiento']}). No puede ser dispensado."
                )

        unidades_a_descontar = cls.convert_to_minimum_units(
            presentation=pres,
            quantity=qty,
            unidades_por_blister=product_row["unidades_por_blister"],
            blisters_por_caja=product_row["blisters_por_caja"],
        )

        stock_actual = int(product_row["stock_total_unidades"])
        if unidades_a_descontar > stock_actual:
            raise ValueError(
                f"Stock insuficiente para '{product_row['nombre_comercial']}'. "
                f"Solicitado: {qty} {pres} ({unidades_a_descontar} unid. mínimas), "
                f"Disponible en esta sucursal: {stock_actual} unid. mínimas."
            )

        precios = cls.calculate_presentation_prices(
            precio_base_unidad=product_row["precio_base"],
            unidades_por_blister=product_row["unidades_por_blister"],
            blisters_por_caja=product_row["blisters_por_caja"],
            descuento_blister_pct=product_row.get("descuento_blister_pct", 5.0),
            descuento_caja_pct=product_row.get("descuento_caja_pct", 12.0),
        )

        precio_presentacion = precios[pres]
        subtotal = round(precio_presentacion * qty, 2)
        return unidades_a_descontar, precio_presentacion, subtotal
