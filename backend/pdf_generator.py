# -*- coding: utf-8 -*-
"""
Generador nativo de documentos PDF estándar (ISO 32000-1 / PDF-1.4) en Python puro.
Cero dependencias pesadas externas (funciona perfectamente en Render con <= 512 MB RAM).
Genera tablas limpias, encabezados oficiales con numeración de páginas y formato de impresión A4 / Carta.
"""

from __future__ import annotations
import io
from datetime import datetime
from typing import List, Dict, Any, Tuple


class CleanPdfWriter:
    """Constructor determinista de PDF 1.4 de alto rendimiento y bajo consumo de memoria."""

    def __init__(self, page_width: float = 595.28, page_height: float = 841.89) -> None:  # A4 Portrait
        self.width = page_width
        self.height = page_height
        self.pages: List[str] = []

    def _escape_pdf_text(self, text: str) -> str:
        """Escapa caracteres especiales para texto de PDF estándar."""
        if text is None:
            return ""
        # Reemplazar acentos comunes a ASCII seguro para Type1 Helvetica estándar
        replacements = {
            'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
            'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U',
            'ñ': 'n', 'Ñ': 'N', 'ü': 'u', 'Ü': 'U', '°': 'o',
            '—': '-', '–': '-', '"': "'", '“': "'", '”': "'",
            '‘': "'", '’': "'", '≤': '<=', '≥': '>='
        }
        res = str(text)
        for k, v in replacements.items():
            res = res.replace(k, v)
        res = res.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
        return res

    def build_report_pages(
        self,
        farmacia_nombre: str,
        titulo_reporte: str,
        subtitulo: str,
        columnas: List[Tuple[str, float]],  # (Nombre Columna, ancho en pt)
        filas: List[List[str]],
        totales_resumen: str = ""
    ) -> bytes:
        """
        Construye una o más páginas PDF con encabezado, tabla con rejilla y pie de página.
        """
        margin_x = 36.0  # 0.5 pulgada
        margin_top = 40.0
        margin_bottom = 45.0
        row_height = 18.0
        header_height = 22.0

        table_top = self.height - margin_top - 80.0
        table_bottom = margin_bottom + 30.0
        available_height = table_top - table_bottom
        rows_per_page = int(available_height // row_height)
        if rows_per_page < 1:
            rows_per_page = 1

        total_filas = len(filas)
        total_pages = max(1, (total_filas + rows_per_page - 1) // rows_per_page) if total_filas > 0 else 1

        page_streams: List[str] = []

        for p_idx in range(total_pages):
            start_row = p_idx * rows_per_page
            end_row = min(start_row + rows_per_page, total_filas)
            page_rows = filas[start_row:end_row] if total_filas > 0 else []

            stream_lines: List[str] = []

            # 1. ENCABEZADO INSTITUCIONAL
            # Fondo del encabezado
            stream_lines.append("0.05 0.25 0.28 rg")  # Color Teal Oscuro institucional
            stream_lines.append(f"{margin_x} {self.height - margin_top - 48} {self.width - margin_x * 2} 48 re f")

            # Textos del encabezado
            stream_lines.append("BT")
            stream_lines.append("/F1 14 Tf")
            stream_lines.append("1 1 1 rg")  # Blanco
            stream_lines.append(f"{margin_x + 12} {self.height - margin_top - 20} Td")
            stream_lines.append(f"({self._escape_pdf_text(farmacia_nombre).upper()}) Tj")
            stream_lines.append("ET")

            stream_lines.append("BT")
            stream_lines.append("/F2 11 Tf")
            stream_lines.append("0.9 0.95 0.95 rg")
            stream_lines.append(f"{margin_x + 12} {self.height - margin_top - 36} Td")
            stream_lines.append(f"({self._escape_pdf_text(titulo_reporte)}) Tj")
            stream_lines.append("ET")

            stream_lines.append("BT")
            stream_lines.append("/F2 8.5 Tf")
            stream_lines.append("0.8 0.9 0.9 rg")
            now_str = datetime.now().strftime("%d/%m/%Y %I:%M %p")
            stream_lines.append(f"{self.width - margin_x - 175} {self.height - margin_top - 22} Td")
            stream_lines.append(f"(Fecha Impresion: {now_str}) Tj")
            stream_lines.append("ET")

            stream_lines.append("BT")
            stream_lines.append("/F2 8.5 Tf")
            stream_lines.append("0.8 0.9 0.9 rg")
            stream_lines.append(f"{self.width - margin_x - 175} {self.height - margin_top - 36} Td")
            stream_lines.append(f"(Pagina {p_idx + 1} de {total_pages}) Tj")
            stream_lines.append("ET")

            # Subtítulo explicativo
            stream_lines.append("BT")
            stream_lines.append("/F2 8 Tf")
            stream_lines.append("0.2 0.25 0.3 rg")
            stream_lines.append(f"{margin_x + 2} {table_top + 10} Td")
            stream_lines.append(f"({self._escape_pdf_text(subtitulo)}) Tj")
            stream_lines.append("ET")

            # 2. ENCABEZADOS DE COLUMNA DE LA TABLA
            cur_y = table_top
            # Fondo de encabezado de tabla
            stream_lines.append("0.90 0.93 0.95 rg")  # Gris claro azulado
            stream_lines.append(f"{margin_x} {cur_y - header_height} {self.width - margin_x * 2} {header_height} re f")
            stream_lines.append("0.6 0.65 0.7 RG 1 w")
            stream_lines.append(f"{margin_x} {cur_y - header_height} {self.width - margin_x * 2} {header_height} re S")

            cur_x = margin_x
            for col_nombre, col_w in columnas:
                stream_lines.append("BT")
                stream_lines.append("/F1 8.5 Tf")
                stream_lines.append("0.1 0.15 0.2 rg")
                stream_lines.append(f"{cur_x + 4} {cur_y - 14} Td")
                stream_lines.append(f"({self._escape_pdf_text(col_nombre)}) Tj")
                stream_lines.append("ET")
                cur_x += col_w

            cur_y -= header_height

            # 3. FILAS DE LA TABLA
            for r_idx, row in enumerate(page_rows):
                # Fondo alternado
                if r_idx % 2 == 1:
                    stream_lines.append("0.97 0.98 0.99 rg")
                    stream_lines.append(f"{margin_x} {cur_y - row_height} {self.width - margin_x * 2} {row_height} re f")

                # Borde inferior de fila
                stream_lines.append("0.85 0.88 0.9 RG 0.5 w")
                stream_lines.append(f"{margin_x} {cur_y - row_height} m {self.width - margin_x} {cur_y - row_height} l S")

                cur_x = margin_x
                for c_idx, val in enumerate(row):
                    col_w = columnas[c_idx][1] if c_idx < len(columnas) else 60.0
                    stream_lines.append("BT")
                    stream_lines.append("/F2 8 Tf")
                    stream_lines.append("0.1 0.1 0.1 rg")
                    stream_lines.append(f"{cur_x + 4} {cur_y - 13} Td")
                    # Truncar si es muy largo
                    val_str = self._escape_pdf_text(str(val))
                    if len(val_str) > 38:
                        val_str = val_str[:35] + "..."
                    stream_lines.append(f"({val_str}) Tj")
                    stream_lines.append("ET")
                    cur_x += col_w

                cur_y -= row_height

            # Si es la última página y hay totales de resumen
            if p_idx == total_pages - 1 and totales_resumen:
                stream_lines.append("0.92 0.96 0.95 rg")
                stream_lines.append(f"{margin_x} {cur_y - 24} {self.width - margin_x * 2} 24 re f")
                stream_lines.append("0.2 0.6 0.5 RG 1 w")
                stream_lines.append(f"{margin_x} {cur_y - 24} {self.width - margin_x * 2} 24 re S")

                stream_lines.append("BT")
                stream_lines.append("/F1 8.5 Tf")
                stream_lines.append("0.05 0.3 0.25 rg")
                stream_lines.append(f"{margin_x + 8} {cur_y - 16} Td")
                stream_lines.append(f"({self._escape_pdf_text(totales_resumen)}) Tj")
                stream_lines.append("ET")

            # 4. PIE DE PÁGINA
            stream_lines.append("0.7 0.7 0.7 RG 0.5 w")
            stream_lines.append(f"{margin_x} {margin_bottom} m {self.width - margin_x} {margin_bottom} l S")

            stream_lines.append("BT")
            stream_lines.append("/F2 7.5 Tf")
            stream_lines.append("0.4 0.45 0.5 rg")
            stream_lines.append(f"{margin_x} {margin_bottom - 14} Td")
            stream_lines.append("(FarmaSys POS - Sistema Administrativo Farmaceutico Oficial - Confidencial ROL_ADMIN_CAJA) Tj")
            stream_lines.append("ET")

            page_streams.append("\n".join(stream_lines))

        return self._assemble_pdf_binary(page_streams)

    def _assemble_pdf_binary(self, page_contents: List[str]) -> bytes:
        """Ensambla el archivo binario PDF válido de acuerdo al estándar PDF 1.4."""
        buf = io.BytesIO()
        buf.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")

        objects: List[int] = []

        def write_obj(content: bytes) -> int:
            offset = buf.tell()
            obj_num = len(objects) + 1
            objects.append(offset)
            buf.write(f"{obj_num} 0 obj\n".encode("latin1"))
            buf.write(content)
            buf.write(b"\nendobj\n")
            return obj_num

        # Obj 1: Catalog
        # Obj 2: Pages container
        # Obj 3: Font Helvetica Bold (F1)
        # Obj 4: Font Helvetica Regular (F2)

        # Pre-reservar número para Catalog y Pages
        num_pages = len(page_contents)
        page_obj_nums: List[int] = []

        # Crear fuentes
        f1_obj = write_obj(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
        f2_obj = write_obj(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")

        # Crear objetos de contenido (streams) y páginas
        for content_str in page_contents:
            c_bytes = content_str.encode("latin1", "replace")
            stream_obj = write_obj(
                f"<< /Length {len(c_bytes)} >>\nstream\n".encode("latin1") + c_bytes + b"\nendstream"
            )

            page_dict = (
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {self.width} {self.height}] "
                f"/Contents {stream_obj} 0 R /Resources << /Font << /F1 {f1_obj} 0 R /F2 {f2_obj} 0 R >> >> >>"
            ).encode("latin1")
            page_obj = write_obj(page_dict)
            page_obj_nums.append(page_obj)

        # Objeto Pages
        kids_str = " ".join([f"{num} 0 R" for num in page_obj_nums])
        pages_dict = f"<< /Type /Pages /Kids [{kids_str}] /Count {num_pages} >>".encode("latin1")
        pages_obj = write_obj(pages_dict)

        # Objeto Catalog
        catalog_dict = f"<< /Type /Catalog /Pages {pages_obj} 0 R >>".encode("latin1")
        catalog_obj = write_obj(catalog_dict)

        # Tabla de referencias cruzadas (XREF)
        xref_offset = buf.tell()
        total_objs = len(objects) + 1
        buf.write(f"xref\n0 {total_objs}\n".encode("latin1"))
        buf.write(b"0000000000 65535 f \n")
        for offset in objects:
            buf.write(f"{offset:010d} 00000 n \n".encode("latin1"))

        # Trailer
        trailer = (
            f"trailer\n<< /Size {total_objs} /Root {catalog_obj} 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode("latin1")
        buf.write(trailer)

        return buf.getvalue()


pdf_writer = CleanPdfWriter()
