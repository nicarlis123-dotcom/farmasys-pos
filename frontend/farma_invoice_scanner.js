/* =========================================================================
   FARMA INVOICE SCANNER (OCR MULTIMODAL FOTO / PDF -> INVENTARIO EN 1 CLIC)
   - Extrae de golpe toda la tabla de productos de una factura de proveedor
     usando Gemini 2.5 Flash Multimodal (o asistente estructurado).
   - Autocompleta Principio Activo (DCI), Código ATC, Concentración, Lote,
     Vencimiento, Costo Unitario y Precio de Venta sugerido.
   - MESA DE AUDITORÍA Y PRE-INGRESO (Staging):
     * Muestra exactamente los cambios que se harán antes de completarse
       (Productos Nuevos vs Incrementos de Stock: Antes ➔ Después).
     * Detecta errores o inconsistencias automáticamente (vencimiento corto/vencido,
       margen negativo, campos faltantes) y permite editar y corregir cualquier
       celda en tiempo real antes de confirmar el ingreso masivo.
   ========================================================================= */

(function () {
  'use strict';

  class FarmaInvoiceScanner {
    constructor() {
      this.stagingData = null;
      this.selectedFileDataUrl = null;
      this.selectedFileName = '';
      this.selectedMimeType = 'image/jpeg';
      this.isExtracting = false;
      this.isCommitting = false;
      this.init();
    }

    init() {
      this.injectStyles();
      setTimeout(() => this.injectEntryButtons(), 400);
      console.log('[FarmaInvoiceScanner] Módulo OCR Multimodal de Facturas de Proveedor listo.');
    }

    injectStyles() {
      if (document.getElementById('farma-invoice-scanner-styles')) return;
      const st = document.createElement('style');
      st.id = 'farma-invoice-scanner-styles';
      st.textContent = `
        #farma-invoice-ocr-modal {
          position: fixed;
          inset: 0;
          background: rgba(2, 6, 23, 0.84);
          backdrop-filter: blur(8px);
          z-index: 100025;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 14px;
        }
        #farma-invoice-ocr-modal.hidden {
          display: none !important;
        }
        .invoice-cell-input {
          width: 100%;
          padding: 5px 7px;
          border-radius: 8px;
          background: #0f172a;
          border: 1px solid #334155;
          color: #f8fafc;
          font-size: 11px;
          font-weight: 600;
          transition: border-color 0.15s ease;
        }
        .invoice-cell-input:focus {
          border-color: #14b8a6;
          outline: none;
          background: #020617;
        }
        .invoice-row-error {
          background: rgba(127, 29, 29, 0.28) !important;
        }
        .invoice-row-warning {
          background: rgba(120, 53, 15, 0.22) !important;
        }
        .invoice-row-ok:hover {
          background: rgba(30, 41, 59, 0.55);
        }
      `;
      document.head.appendChild(st);
    }

    injectEntryButtons() {
      // 1. Insertar botón destacado en la vista de Inventario General (#view-inventario)
      const invSection = document.getElementById('view-inventario');
      if (invSection && !document.getElementById('btn-open-invoice-ocr')) {
        const newProdBtn = invSection.querySelector('button[onclick*="openNewProductModal"]');
        if (newProdBtn && newProdBtn.parentElement) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.id = 'btn-open-invoice-ocr';
          btn.onclick = () => this.openModal();
          btn.className = 'px-4 py-2.5 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-black text-xs shadow-md flex items-center gap-1.5 cursor-pointer transition border border-teal-400/40';
          btn.innerHTML = '<span>📸</span> <span>Escanear Factura Proveedor (IA 1-Clic)</span>';
          newProdBtn.parentElement.insertBefore(btn, newProdBtn);
        }
      }

      // 2. Insertar acceso directo en el menú desplegable superior de Inventario
      const invMenu = document.querySelector('#sys-grp-container-inventario .sys-dropdown-menu .space-y-0\\.5');
      if (invMenu && !document.getElementById('sys-nav-invoice-ocr-btn')) {
        const menuBtn = document.createElement('button');
        menuBtn.type = 'button';
        menuBtn.id = 'sys-nav-invoice-ocr-btn';
        menuBtn.onclick = () => {
          if (typeof window.closeAllSysDropdowns === 'function') window.closeAllSysDropdowns();
          this.openModal();
        };
        menuBtn.className = 'w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-extrabold transition flex items-center justify-between gap-2 text-emerald-300 bg-emerald-950/50 hover:bg-emerald-900/70 border border-emerald-500/30 cursor-pointer mb-1';
        menuBtn.innerHTML = '<span class="flex items-center gap-1.5"><span>📸</span><span>Escanear Factura (Foto/PDF)</span></span><span class="px-1.5 py-0.2 bg-emerald-500 text-slate-950 font-black rounded-full text-[9px]">IA</span>';
        invMenu.insertBefore(menuBtn, invMenu.children[1] || null);
      }
    }

    openModal() {
      let modal = document.getElementById('farma-invoice-ocr-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'farma-invoice-ocr-modal';
        document.body.appendChild(modal);
      }
      this.renderModalContent();
      modal.classList.remove('hidden');

      if (window.farmaUnifiedAgent) {
        window.farmaUnifiedAgent.say(
          'Sube la foto o PDF de la factura del proveedor. Extraeré todos los medicamentos, autocompletaré Principio Activo DCI y Código ATC, y te mostraré una vista previa editable antes de guardar.',
          'Farma Auditor de Facturas',
          9
        );
      }
    }

    closeModal() {
      const modal = document.getElementById('farma-invoice-ocr-modal');
      if (modal) modal.classList.add('hidden');
    }

    handleFileSelect(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      this.selectedFileName = file.name;
      this.selectedMimeType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

      const reader = new FileReader();
      reader.onload = (e) => {
        this.selectedFileDataUrl = e.target.result;
        const lbl = document.getElementById('invoice-file-selected-label');
        if (lbl) {
          lbl.innerHTML = `✅ Archivo cargado: <strong>${this.selectedFileName}</strong> (${Math.round(file.size / 1024)} KB) — Listo para extraer con IA`;
          lbl.classList.remove('hidden');
        }
      };
      reader.readAsDataURL(file);
    }

    async extractInvoiceWithAI() {
      this.isExtracting = true;
      this.renderModalContent();

      const rawTextEl = document.getElementById('invoice-raw-text-input');
      const rawText = rawTextEl ? rawTextEl.value.trim() : '';
      const fid = (window.sysState && window.sysState.authenticatedPharmacy && window.sysState.authenticatedPharmacy.id) || 1;

      try {
        const res = await fetch('/api/farma/invoice/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            farmacia_id: fid,
            file_data_url: this.selectedFileDataUrl || '',
            mime_type: this.selectedMimeType,
            raw_text: rawText
          })
        });
        const data = await res.json();
        this.isExtracting = false;

        if (data.ok) {
          this.stagingData = data;
          this.recalculateAndValidateStaging();
          this.renderModalContent();

          const r = this.stagingData.resumen_cambios;
          if (window.farmaUnifiedAgent) {
            window.farmaUnifiedAgent.say(
              `He extraído ${r.total_renglones} medicamentos (${r.productos_nuevos_a_crear} nuevos y ${r.productos_existentes_a_incrementar} actualizaciones de stock). Revisa la tabla y corrige cualquier dato antes de confirmar.`,
              'Revisión Pre-Ingreso',
              10
            );
          }
        } else {
          alert(data.error || 'Error al analizar la factura.');
          this.renderModalContent();
        }
      } catch (e) {
        this.isExtracting = false;
        console.error('[FarmaInvoiceScanner] Error en extracción:', e);
        this.renderModalContent();
      }
    }

    /* =========================================================================
       VALIDACIÓN Y AUDITORÍA EN TIEMPO REAL DE CADA CELDA EDITADA
       ========================================================================= */
    recalculateAndValidateStaging() {
      if (!this.stagingData || !Array.isArray(this.stagingData.items)) return;

      const existingProducts = (window.sysState && window.sysState.products) || [];
      const byBarcode = {};
      const byName = {};
      existingProducts.forEach(p => {
        if (p.codigo_barras) byBarcode[String(p.codigo_barras).trim()] = p;
        if (p.nombre_comercial) byName[String(p.nombre_comercial).trim().toLowerCase()] = p;
      });

      let nuevos = 0;
      let actualizaciones = 0;
      let conError = 0;
      let conAdvertencia = 0;
      let totalInversion = 0;
      let subidasCosto = 0;
      let margenesEnRiesgo = 0;
      const today = new Date();

      this.stagingData.items.forEach((it, idx) => {
        it.fila_id = idx + 1;
        const nombre = String(it.nombre_comercial || '').trim();
        const cb = String(it.codigo_barras || '').trim();
        const cant = Math.max(0, parseInt(it.cantidad_unidades, 10) || 0);
        const costo = Math.max(0, parseFloat(it.costo_unitario) || 0);
        const precio = Math.max(0, parseFloat(it.precio_venta_sugerido) || 0);
        const lote = String(it.lote || '').trim();
        const vence = String(it.fecha_vencimiento || '').trim();

        // Cruzar con catálogo actual para saber si crea o actualiza stock
        const match = byBarcode[cb] || byName[nombre.toLowerCase()];
        if (match) {
          it.accion_tipo = 'ACTUALIZAR_EXISTENTE';
          it.stock_anterior = Number(match.stock_total_unidades || (match.inventario && match.inventario.stock_total_unidades) || 0);
          it.precio_anterior = Number(match.precio_base || 0);
          it.costo_anterior = Number(match.precio_costo || it.costo_anterior || 0);
          if (it.incluir !== false) actualizaciones++;
        } else {
          it.accion_tipo = 'CREAR_NUEVO';
          it.stock_anterior = 0;
          it.precio_anterior = 0;
          it.costo_anterior = 0;
          if (it.incluir !== false) nuevos++;
        }

        // Comparador de costo del proveedor vs. compra anterior
        it.variacion_costo_pct = 0;
        it.margen_anterior_pct = null;
        it.margen_en_riesgo = false;
        if (it.costo_anterior > 0 && costo > 0) {
          it.variacion_costo_pct = Number((((costo - it.costo_anterior) / it.costo_anterior) * 100).toFixed(1));
          if (it.precio_anterior > it.costo_anterior) {
            it.margen_anterior_pct = Number((((it.precio_anterior - it.costo_anterior) / it.costo_anterior) * 100).toFixed(1));
          }
        }

        it.cantidad_unidades = cant;
        it.stock_nuevo_total = it.stock_anterior + cant;
        it.subtotal_costo_rd = Number((cant * costo).toFixed(2));
        it.margen_pct = costo > 0 ? Number((((precio - costo) / costo) * 100).toFixed(1)) : 35.0;

        if (it.incluir !== false) {
          totalInversion += it.subtotal_costo_rd;
        }

        const errores = [];
        const advertencias = [];

        if (!nombre) errores.push('Nombre comercial vacío.');
        if (!String(it.principio_activo_dci || '').trim()) errores.push('Falta Principio Activo (DCI).');
        if (cant <= 0) errores.push('Cantidad debe ser > 0.');
        if (precio <= 0) errores.push('Precio de venta debe ser > 0.');
        else if (costo > 0 && precio <= costo) {
          errores.push(`Pérdida financiera: Precio (RD$ ${precio}) <= Costo (RD$ ${costo}).`);
        }

        if (!lote) advertencias.push('Falta número de lote.');

        if (it.variacion_costo_pct >= 3) {
          if (it.incluir !== false) subidasCosto++;
          let msg = `📈 Subida de costo +${it.variacion_costo_pct}% vs. compra anterior (RD$ ${Number(it.costo_anterior).toFixed(2)} ➔ RD$ ${costo.toFixed(2)}).`;
          if (it.precio_reajustado_auto && it.precio_original_factura && Math.abs(precio - Number(it.precio_original_factura)) > 0.001) {
            msg += ` Farma reajustó el precio de RD$ ${Number(it.precio_original_factura).toFixed(2)} a RD$ ${precio.toFixed(2)} para conservar tu margen.`;
          }
          advertencias.push(msg);
        }
        if (it.margen_anterior_pct !== null && costo > 0 && precio > costo) {
          const margenActual = ((precio - costo) / costo) * 100;
          if (margenActual < it.margen_anterior_pct - 2) {
            it.margen_en_riesgo = true;
            if (it.incluir !== false) margenesEnRiesgo++;
            advertencias.push(`🛡️ Tu margen bajaría de ${it.margen_anterior_pct}% a ${margenActual.toFixed(1)}%.`);
          }
        }

        // Validar fecha YYYY-MM-DD
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(vence)) {
          errores.push('Fecha inválida (use YYYY-MM-DD).');
        } else {
          const dtVence = new Date(vence + 'T00:00:00');
          const diffDays = Math.ceil((dtVence - today) / (1000 * 60 * 60 * 24));
          it.dias_para_vencer = diffDays;
          if (diffDays <= 0) {
            errores.push(`⛔ Producto VENCIDO (${vence}).`);
          } else if (diffDays <= 210) {
            advertencias.push(`⚠️ Vence pronto (${diffDays} días).`);
          }
        }

        it.errores = errores;
        it.advertencias = advertencias;
        it.estado_validacion = errores.length > 0 ? 'ERROR' : (advertencias.length > 0 ? 'ADVERTENCIA' : 'OK');

        if (it.incluir !== false) {
          if (errores.length > 0) conError++;
          else if (advertencias.length > 0) conAdvertencia++;
        }
      });

      this.stagingData.resumen_cambios = {
        total_renglones: this.stagingData.items.filter(i => i.incluir !== false).length,
        productos_nuevos_a_crear: nuevos,
        productos_existentes_a_incrementar: actualizaciones,
        renglones_con_error: conError,
        renglones_con_advertencia: conAdvertencia,
        inversion_total_costo_rd: Number(totalInversion.toFixed(2)),
        subidas_costo: subidasCosto,
        margenes_en_riesgo: margenesEnRiesgo
      };
    }

    precioProtegido(item) {
      const costo = Math.max(0, parseFloat(item.costo_unitario) || 0);
      const margen = item.margen_anterior_pct !== null && item.margen_anterior_pct !== undefined ? item.margen_anterior_pct : 35;
      return Math.ceil(costo * (1 + margen / 100) * 100) / 100;
    }

    protegerMargenFila(index) {
      if (!this.stagingData || !this.stagingData.items[index]) return;
      const item = this.stagingData.items[index];
      const nuevo = this.precioProtegido(item);
      if (nuevo > (parseFloat(item.precio_venta_sugerido) || 0)) {
        item.precio_original_factura = item.precio_venta_sugerido;
        item.precio_venta_sugerido = Number(nuevo.toFixed(2));
        item.precio_reajustado_auto = true;
      }
      this.recalculateAndValidateStaging();
      this.renderModalContent();
    }

    protegerMargenTodas() {
      if (!this.stagingData || !Array.isArray(this.stagingData.items)) return;
      let ajustados = 0;
      this.stagingData.items.forEach(item => {
        if (item.incluir === false || !item.margen_en_riesgo) return;
        const nuevo = this.precioProtegido(item);
        if (nuevo > (parseFloat(item.precio_venta_sugerido) || 0)) {
          item.precio_original_factura = item.precio_venta_sugerido;
          item.precio_venta_sugerido = Number(nuevo.toFixed(2));
          item.precio_reajustado_auto = true;
          ajustados++;
        }
      });
      this.recalculateAndValidateStaging();
      this.renderModalContent();
      if (window.farmaUnifiedAgent && ajustados > 0) {
        window.farmaUnifiedAgent.say(
          `Reajusté el precio de venta de ${ajustados} medicamento(s) para conservar el margen que tenías antes del aumento del proveedor.`,
          'Protección de Margen',
          7
        );
      }
    }

    updateRowField(index, field, value) {
      if (!this.stagingData || !this.stagingData.items[index]) return;
      const item = this.stagingData.items[index];

      if (field === 'incluir') {
        item.incluir = Boolean(value);
      } else if (field === 'cantidad_unidades' || field === 'unidades_por_blister' || field === 'blisters_por_caja') {
        item[field] = Math.max(0, parseInt(value, 10) || 0);
      } else if (field === 'costo_unitario') {
        item.costo_unitario = Math.max(0, parseFloat(value) || 0);
        // Si el precio de venta quedó por debajo, sugerir ajuste opcional
      } else if (field === 'precio_venta_sugerido') {
        item.precio_venta_sugerido = Math.max(0, parseFloat(value) || 0);
      } else {
        item[field] = value;
      }

      this.recalculateAndValidateStaging();
      this.renderStagingSummaryAndRowStatus(index);
    }

    autoFixRowError(index) {
      if (!this.stagingData || !this.stagingData.items[index]) return;
      const item = this.stagingData.items[index];

      if (!item.nombre_comercial || !item.nombre_comercial.trim()) {
        item.nombre_comercial = `Medicamento Factura #${index + 1}`;
      }
      if (!item.principio_activo_dci || !item.principio_activo_dci.trim()) {
        item.principio_activo_dci = item.nombre_comercial;
      }
      if (!item.codigo_atc || !item.codigo_atc.trim()) {
        item.codigo_atc = 'V03AX';
      }
      if (!item.cantidad_unidades || item.cantidad_unidades <= 0) {
        item.cantidad_unidades = 30;
      }
      if (!item.costo_unitario || item.costo_unitario <= 0) {
        item.costo_unitario = 10.0;
      }
      if (!item.precio_venta_sugerido || item.precio_venta_sugerido <= item.costo_unitario) {
        item.precio_venta_sugerido = Number((item.costo_unitario * 1.35).toFixed(2));
      }
      if (!item.lote || !item.lote.trim()) {
        item.lote = `LOT-2026-${index + 1}`;
      }
      // Si la fecha es inválida o vencida, fijar a 2 años en el futuro
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(item.fecha_vencimiento) || (item.dias_para_vencer !== undefined && item.dias_para_vencer <= 0)) {
        item.fecha_vencimiento = '2028-12-31';
      }

      this.recalculateAndValidateStaging();
      this.renderModalContent();
    }

    addEmptyRow() {
      if (!this.stagingData) {
        this.stagingData = {
          proveedor: { nombre: 'Proveedor Manual', rnc: '', numero_factura: 'NCF-001', fecha_factura: new Date().toISOString().slice(0, 10) },
          items: []
        };
      }
      const nextIdx = this.stagingData.items.length + 1;
      this.stagingData.items.push({
        fila_id: nextIdx,
        incluir: true,
        accion_tipo: 'CREAR_NUEVO',
        codigo_barras: `746202699${String(nextIdx).padStart(3, '0')}`,
        nombre_comercial: '',
        concentracion: '500mg',
        principio_activo_dci: '',
        codigo_atc: 'V03AX',
        categoria: 'Especialidad Farmacéutica',
        laboratorio: 'Laboratorio General',
        unidad_minima_nombre: 'Tableta',
        unidades_por_blister: 10,
        blisters_por_caja: 3,
        cantidad_unidades: 100,
        stock_anterior: 0,
        stock_nuevo_total: 100,
        lote: `LOT-2026-${nextIdx}`,
        fecha_vencimiento: '2028-12-31',
        costo_unitario: 10.0,
        precio_venta_sugerido: 15.0,
        ubicacion_anaquel: 'A-01',
        requiere_receta: false
      });
      this.recalculateAndValidateStaging();
      this.renderModalContent();
    }

    removeRow(index) {
      if (!this.stagingData || !this.stagingData.items) return;
      this.stagingData.items.splice(index, 1);
      this.recalculateAndValidateStaging();
      this.renderModalContent();
    }

    renderStagingSummaryAndRowStatus(rowIndex) {
      // Actualizar resumen superior y botón de confirmación sin perder el foco del input
      const sumWrap = document.getElementById('invoice-staging-kpis');
      const statusCell = document.getElementById(`invoice-row-status-${rowIndex}`);
      const stockPreviewCell = document.getElementById(`invoice-row-stock-preview-${rowIndex}`);
      const trEl = document.getElementById(`invoice-staging-tr-${rowIndex}`);
      const btnCommit = document.getElementById('btn-commit-invoice-bulk');

      if (!this.stagingData) return;
      const r = this.stagingData.resumen_cambios;
      const it = this.stagingData.items[rowIndex];

      if (sumWrap) {
        sumWrap.innerHTML = this.buildSummaryCardsHtml(r);
      }

      if (it && statusCell && trEl && stockPreviewCell) {
        trEl.className = `border-b border-slate-800 transition ${
          it.incluir === false ? 'opacity-40' :
          it.estado_validacion === 'ERROR' ? 'invoice-row-error' :
          it.estado_validacion === 'ADVERTENCIA' ? 'invoice-row-warning' : 'invoice-row-ok'
        }`;
        stockPreviewCell.innerHTML = this.buildStockPreviewBadge(it);
        statusCell.innerHTML = this.buildRowValidationBadge(it, rowIndex);
      }

      if (btnCommit) {
        const blocked = r.renglones_con_error > 0 || r.total_renglones === 0;
        btnCommit.disabled = blocked;
        btnCommit.className = blocked
          ? 'px-6 py-3 rounded-xl bg-slate-800 text-slate-500 font-black text-xs cursor-not-allowed border border-slate-700'
          : 'px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs shadow-lg cursor-pointer transition';
        btnCommit.innerHTML = blocked
          ? `⛔ Corrija ${r.renglones_con_error} error(es) antes de confirmar`
          : `✅ Confirmar e Ingresar ${r.total_renglones} Productos al Inventario`;
      }
    }

    buildSummaryCardsHtml(r) {
      return `
        <div class="p-3 rounded-xl bg-slate-900 border border-slate-800">
          <div class="text-[10px] font-bold uppercase text-slate-400">Renglones Activos</div>
          <div class="text-lg font-black text-white">${r.total_renglones} ítems</div>
          <div class="text-[10px] text-teal-400 font-semibold">${r.productos_nuevos_a_crear} Nuevos • ${r.productos_existentes_a_incrementar} Actualizaciones</div>
        </div>
        <div class="p-3 rounded-xl bg-slate-900 border border-emerald-500/30">
          <div class="text-[10px] font-bold uppercase text-emerald-400">Inversión Total Factura</div>
          <div class="text-lg font-black text-emerald-300">RD$ ${r.inversion_total_costo_rd.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</div>
          <div class="text-[10px] text-slate-400">Calculado sobre costo unitario</div>
        </div>
        <div class="p-3 rounded-xl bg-slate-900 border ${r.renglones_con_error > 0 ? 'border-rose-500 bg-rose-950/30' : 'border-slate-800'}">
          <div class="text-[10px] font-bold uppercase ${r.renglones_con_error > 0 ? 'text-rose-400' : 'text-slate-400'}">Errores Críticos</div>
          <div class="text-lg font-black ${r.renglones_con_error > 0 ? 'text-rose-400' : 'text-emerald-400'}">${r.renglones_con_error} errores</div>
          <div class="text-[10px] text-slate-400">${r.renglones_con_error > 0 ? 'Debe corregirlos para continuar' : 'Todo validado correctamente'}</div>
        </div>
        <div class="p-3 rounded-xl bg-slate-900 border ${r.renglones_con_advertencia > 0 ? 'border-amber-500/50' : 'border-slate-800'}">
          <div class="text-[10px] font-bold uppercase text-amber-400">Advertencias Clínicas/FEFO</div>
          <div class="text-lg font-black text-amber-300">${r.renglones_con_advertencia} avisos</div>
          <div class="text-[10px] text-slate-400">Vencimientos ≤ 7 meses o lotes</div>
        </div>
        <div class="p-3 rounded-xl bg-slate-900 border ${(r.subidas_costo || 0) > 0 ? 'border-orange-500/60 bg-orange-950/20' : 'border-slate-800'}">
          <div class="text-[10px] font-bold uppercase text-orange-400">Costos del Proveedor</div>
          <div class="text-lg font-black ${(r.subidas_costo || 0) > 0 ? 'text-orange-300' : 'text-emerald-400'}">${r.subidas_costo || 0} subida(s)</div>
          ${(r.margenes_en_riesgo || 0) > 0
            ? `<button type="button" onclick="window.farmaInvoiceScanner.protegerMargenTodas()" class="mt-1 px-2 py-0.5 rounded bg-orange-400 hover:bg-orange-300 text-slate-950 font-black text-[10px] cursor-pointer">🛡️ Proteger margen (${r.margenes_en_riesgo})</button>`
            : `<div class="text-[10px] text-slate-400">${(r.subidas_costo || 0) > 0 ? 'Margen protegido' : 'Sin aumentos vs. compra anterior'}</div>`}
        </div>
      `;
    }

    buildStockPreviewBadge(it) {
      const isNew = it.accion_tipo === 'CREAR_NUEVO';
      const badgeAction = isNew
        ? `<span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-sky-500/20 text-sky-300 border border-sky-500/40">✨ NUEVO</span>`
        : `<span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/40">🔄 SUMA STOCK</span>`;

      return `
        <div class="space-y-0.5">
          <div>${badgeAction}</div>
          <div class="text-[10px] font-mono text-slate-300">
            Antes: <strong>${it.stock_anterior}</strong> ➔ Ahora: <strong class="text-emerald-400">${it.stock_nuevo_total}</strong>
          </div>
          ${(!isNew && it.costo_anterior > 0) ? `
          <div class="text-[10px] font-mono ${it.variacion_costo_pct >= 3 ? 'text-orange-300 font-black' : (it.variacion_costo_pct <= -3 ? 'text-emerald-300' : 'text-slate-400')}">
            Costo: RD$ ${Number(it.costo_anterior).toFixed(2)} ➔ RD$ ${Number(it.costo_unitario || 0).toFixed(2)} (${it.variacion_costo_pct > 0 ? '+' : ''}${it.variacion_costo_pct}%)
          </div>` : ''}
          ${it.margen_en_riesgo ? `
          <button type="button" onclick="window.farmaInvoiceScanner.protegerMargenFila(${(it.fila_id || 1) - 1})" class="px-2 py-0.5 rounded bg-orange-400 hover:bg-orange-300 text-slate-950 font-black text-[9px] cursor-pointer">
            🛡️ Proteger margen (RD$ ${this.precioProtegido(it).toFixed(2)})
          </button>` : ''}
        </div>
      `;
    }

    buildRowValidationBadge(it, idx) {
      if (it.estado_validacion === 'ERROR') {
        return `
          <div class="space-y-1">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-black">
              ⛔ ERROR
            </span>
            <div class="text-[10px] text-rose-300 font-bold leading-tight">${it.errores.join(' ')}</div>
            <button
              type="button"
              onclick="window.farmaInvoiceScanner.autoFixRowError(${idx})"
              class="px-2 py-0.5 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[9px] cursor-pointer"
            >
              🔧 Auto-Corregir Error
            </button>
          </div>
        `;
      }
      if (it.estado_validacion === 'ADVERTENCIA') {
        return `
          <div class="space-y-0.5">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/30 border border-amber-400 text-amber-200 text-[10px] font-black">
              ⚠️ AVISO
            </span>
            <div class="text-[10px] text-amber-200 leading-tight">${it.advertencias.join(' ')}</div>
          </div>
        `;
      }
      return `
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-black">
          ✅ LISTO (+${it.margen_pct}% margen)
        </span>
      `;
    }

    async commitBulkInventory() {
      if (!this.stagingData || !this.stagingData.items) return;
      this.recalculateAndValidateStaging();
      const r = this.stagingData.resumen_cambios;

      if (r.renglones_con_error > 0) {
        alert(`Aún tienes ${r.renglones_con_error} renglón(es) con errores marcados en rojo. Por favor edítalos o pulsa "Auto-Corregir Error" antes de guardar.`);
        return;
      }

      const activeItems = this.stagingData.items.filter(i => i.incluir !== false);
      if (!activeItems.length) {
        alert('Selecciona al menos un medicamento para ingresar al inventario.');
        return;
      }

      this.isCommitting = true;
      this.renderModalContent();

      const fid = (window.sysState && window.sysState.authenticatedPharmacy && window.sysState.authenticatedPharmacy.id) || 1;
      const provName = document.getElementById('inv-prov-nombre')?.value || this.stagingData.proveedor?.nombre || 'Proveedor Farmacéutico';
      const provNum = document.getElementById('inv-prov-ncf')?.value || this.stagingData.proveedor?.numero_factura || 'S/N';

      try {
        const res = await fetch('/api/farma/invoice/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            farmacia_id: fid,
            proveedor: {
              nombre: provName,
              numero_factura: provNum
            },
            items: activeItems
          })
        });
        const data = await res.json();
        this.isCommitting = false;

        if (data.ok) {
          this.stagingData = null;
          this.selectedFileDataUrl = null;
          this.closeModal();

          // Recargar catálogo completo y métricas en el POS / Inventario
          if (typeof window.loadSysProducts === 'function') {
            await window.loadSysProducts(fid);
          }
          if (typeof window.loadSysDashboardAndReports === 'function') {
            await window.loadSysDashboardAndReports(fid);
          }

          if (window.farmaVoiceEngine && typeof window.farmaVoiceEngine.loadUnmetDemand === 'function') {
            window.farmaVoiceEngine.loadUnmetDemand();
          }
          const resumenVoz = data.resumen_voz_ia ||
            `¡Ingreso masivo completado! Se procesaron ${data.total_renglones_procesados} medicamentos sumando ${data.total_unidades_ingresadas} unidades al inventario.`;
          if (window.farmaUnifiedAgent) {
            window.farmaUnifiedAgent.say(
              resumenVoz,
              data.demandas_resueltas && data.demandas_resueltas.length
                ? `Inventario + ${data.demandas_resueltas.length} Faltante(s) Cubierto(s)`
                : 'Inventario Actualizado',
              11
            );
          }
          if (typeof window.showToast === 'function') {
            const extraSolved = (data.demandas_resueltas && data.demandas_resueltas.length)
              ? ` | 🎯 ${data.demandas_resueltas.length} faltante(s) resuelto(s)`
              : '';
            window.showToast(`✅ Factura ingresada: +${data.total_unidades_ingresadas} unid.${extraSolved}`);
          }
        } else {
          alert(data.error || 'No se pudo completar el ingreso masivo.');
          this.renderModalContent();
        }
      } catch (e) {
        this.isCommitting = false;
        console.error('[FarmaInvoiceScanner] Error en commit:', e);
        alert('Error de red al confirmar el ingreso.');
        this.renderModalContent();
      }
    }

    renderModalContent() {
      const modal = document.getElementById('farma-invoice-ocr-modal');
      if (!modal) return;

      const hasStaging = Boolean(this.stagingData && Array.isArray(this.stagingData.items));
      const r = hasStaging ? this.stagingData.resumen_cambios : null;
      const prov = hasStaging ? (this.stagingData.proveedor || {}) : {};

      modal.innerHTML = `
        <div class="w-full max-w-7xl max-h-[92vh] bg-slate-950 border-2 border-teal-500/70 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
          <!-- Encabezado -->
          <div class="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-400 flex items-center justify-center text-xl">📸</div>
              <div>
                <h2 class="text-base sm:text-lg font-black text-white tracking-tight">
                  Escaneo Inteligente de Facturas de Proveedores (Foto / PDF)
                </h2>
                <p class="text-xs text-slate-400">
                  Gemini Multimodal extrae todos los medicamentos de golpe, autocompleta DCI + Código ATC y te muestra la auditoría editable antes de guardar
                </p>
              </div>
            </div>
            <button type="button" onclick="window.farmaInvoiceScanner.closeModal()" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer">✕ Cerrar</button>
          </div>

          <!-- Cuerpo Scrollable -->
          <div class="p-6 overflow-y-auto space-y-5 flex-1">
            <!-- Paso 1: Subir Foto/PDF o Pegar Factura -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 bg-slate-900/70 p-4 rounded-2xl border border-slate-800">
              <div class="lg:col-span-2 space-y-2">
                <label class="block text-xs font-extrabold uppercase text-teal-400">1. Subir Foto o PDF de la Factura del Laboratorio / Droguería</label>
                <div class="flex flex-wrap items-center gap-3">
                  <label class="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-teal-500/50 text-xs font-extrabold text-teal-300 cursor-pointer transition flex items-center gap-2">
                    <span>📂</span> <span>Seleccionar Foto (JPG/PNG) o PDF</span>
                    <input type="file" accept="image/*,application/pdf" class="hidden" onchange="window.farmaInvoiceScanner.handleFileSelect(event)" />
                  </label>
                  <button
                    type="button"
                    onclick="window.farmaInvoiceScanner.extractInvoiceWithAI()"
                    ${this.isExtracting ? 'disabled' : ''}
                    class="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs shadow-lg cursor-pointer transition flex items-center gap-2"
                  >
                    <span>${this.isExtracting ? '⏳' : '🤖'}</span>
                    <span>${this.isExtracting ? 'Analizando Factura y Enriqueciendo DCI/ATC...' : 'Extraer Tabla de Productos con IA'}</span>
                  </button>
                  <button
                    type="button"
                    onclick="window.farmaInvoiceScanner.addEmptyRow()"
                    class="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs cursor-pointer transition"
                  >
                    ➕ Añadir Fila Manual
                  </button>
                </div>
                <div id="invoice-file-selected-label" class="${this.selectedFileName ? '' : 'hidden'} text-xs text-emerald-400 font-semibold pt-1">
                  ✅ Archivo cargado: <strong>${this.selectedFileName}</strong>
                </div>
              </div>

              <div>
                <label class="block text-[11px] font-bold text-slate-400 mb-1">O pega líneas de texto/CSV de la factura (opcional):</label>
                <textarea
                  id="invoice-raw-text-input"
                  rows="2"
                  placeholder="Ej: Amoxicilina 500mg | 150 | Lote L26 | 2028-10-30 | 12.50"
                  class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono focus:border-teal-500 focus:outline-none"
                ></textarea>
              </div>
            </div>

            ${hasStaging ? `
              <!-- Paso 2: Resumen de Cambios que se Harán Antes de Completarse -->
              <div class="space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <span class="px-2.5 py-1 rounded-lg bg-teal-500/20 border border-teal-500/40 text-teal-300 text-xs font-black">
                      2. VISTA PREVIA DE CAMBIOS Y AUDITORÍA DE ERRORES
                    </span>
                    <span class="text-xs text-slate-400">
                      Verifica y edita cualquier celda. Si un dato tiene error (ej. precio menor al costo o fecha vencida), corrígelo aquí mismo.
                    </span>
                  </div>
                  <div class="flex items-center gap-2">
                    <input id="inv-prov-nombre" type="text" value="${prov.nombre || ''}" placeholder="Proveedor / Laboratorio" class="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-bold" />
                    <input id="inv-prov-ncf" type="text" value="${prov.numero_factura || ''}" placeholder="NCF / Nº Factura" class="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-teal-300 font-mono font-bold w-40" />
                  </div>
                </div>

                <!-- 4 Tarjetas KPI de Impacto del Ingreso -->
                <div id="invoice-staging-kpis" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  ${this.buildSummaryCardsHtml(r)}
                </div>

                <!-- Tabla Editable de Renglones Extraídos -->
                <div class="rounded-2xl border border-slate-800 overflow-x-auto bg-slate-900/50">
                  <table class="w-full text-left border-collapse min-w-[1150px]">
                    <thead>
                      <tr class="bg-slate-900 border-b border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400">
                        <th class="p-2.5 w-8 text-center">Inc.</th>
                        <th class="p-2.5 w-36">Impacto en Stock</th>
                        <th class="p-2.5 w-48">Nombre Comercial *</th>
                        <th class="p-2.5 w-24">Concentración</th>
                        <th class="p-2.5 w-44">Principio Activo (DCI) *</th>
                        <th class="p-2.5 w-24">Código ATC</th>
                        <th class="p-2.5 w-24">Cant. Unid. *</th>
                        <th class="p-2.5 w-28">Lote</th>
                        <th class="p-2.5 w-32">Vencimiento *</th>
                        <th class="p-2.5 w-24">Costo RD$</th>
                        <th class="p-2.5 w-28">Precio Venta *</th>
                        <th class="p-2.5 w-20">Anaquel</th>
                        <th class="p-2.5 w-44">Estado / Validación</th>
                        <th class="p-2.5 w-10"></th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-800/80 text-xs">
                      ${this.stagingData.items.map((it, idx) => `
                        <tr id="invoice-staging-tr-${idx}" class="border-b border-slate-800 transition ${
                          it.incluir === false ? 'opacity-40' :
                          it.estado_validacion === 'ERROR' ? 'invoice-row-error' :
                          it.estado_validacion === 'ADVERTENCIA' ? 'invoice-row-warning' : 'invoice-row-ok'
                        }">
                          <td class="p-2 text-center">
                            <input
                              type="checkbox"
                              ${it.incluir !== false ? 'checked' : ''}
                              onchange="window.farmaInvoiceScanner.updateRowField(${idx}, 'incluir', this.checked)"
                              class="w-4 h-4 accent-teal-500 cursor-pointer"
                            />
                          </td>
                          <td id="invoice-row-stock-preview-${idx}" class="p-2">
                            ${this.buildStockPreviewBadge(it)}
                          </td>
                          <td class="p-2">
                            <input
                              type="text"
                              value="${(it.nombre_comercial || '').replace(/"/g, '&quot;')}"
                              oninput="window.farmaInvoiceScanner.updateRowField(${idx}, 'nombre_comercial', this.value)"
                              class="invoice-cell-input"
                              placeholder="Nombre del fármaco"
                            />
                          </td>
                          <td class="p-2">
                            <input
                              type="text"
                              value="${(it.concentracion || '').replace(/"/g, '&quot;')}"
                              oninput="window.farmaInvoiceScanner.updateRowField(${idx}, 'concentracion', this.value)"
                              class="invoice-cell-input"
                              placeholder="500mg"
                            />
                          </td>
                          <td class="p-2">
                            <input
                              type="text"
                              value="${(it.principio_activo_dci || '').replace(/"/g, '&quot;')}"
                              oninput="window.farmaInvoiceScanner.updateRowField(${idx}, 'principio_activo_dci', this.value)"
                              class="invoice-cell-input text-teal-300"
                              placeholder="Principio Activo DCI"
                            />
                          </td>
                          <td class="p-2">
                            <input
                              type="text"
                              value="${(it.codigo_atc || '').replace(/"/g, '&quot;')}"
                              oninput="window.farmaInvoiceScanner.updateRowField(${idx}, 'codigo_atc', this.value)"
                              class="invoice-cell-input font-mono text-sky-300"
                              placeholder="J01CA04"
                            />
                          </td>
                          <td class="p-2">
                            <input
                              type="number"
                              min="1"
                              value="${it.cantidad_unidades}"
                              oninput="window.farmaInvoiceScanner.updateRowField(${idx}, 'cantidad_unidades', this.value)"
                              class="invoice-cell-input font-mono font-bold text-emerald-300"
                            />
                          </td>
                          <td class="p-2">
                            <input
                              type="text"
                              value="${(it.lote || '').replace(/"/g, '&quot;')}"
                              oninput="window.farmaInvoiceScanner.updateRowField(${idx}, 'lote', this.value)"
                              class="invoice-cell-input font-mono"
                            />
                          </td>
                          <td class="p-2">
                            <input
                              type="date"
                              value="${it.fecha_vencimiento}"
                              oninput="window.farmaInvoiceScanner.updateRowField(${idx}, 'fecha_vencimiento', this.value)"
                              class="invoice-cell-input font-mono"
                            />
                          </td>
                          <td class="p-2">
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value="${it.costo_unitario}"
                              oninput="window.farmaInvoiceScanner.updateRowField(${idx}, 'costo_unitario', this.value)"
                              class="invoice-cell-input font-mono"
                            />
                          </td>
                          <td class="p-2">
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value="${it.precio_venta_sugerido}"
                              oninput="window.farmaInvoiceScanner.updateRowField(${idx}, 'precio_venta_sugerido', this.value)"
                              class="invoice-cell-input font-mono font-bold text-amber-300"
                            />
                          </td>
                          <td class="p-2">
                            <input
                              type="text"
                              value="${(it.ubicacion_anaquel || 'A-01').replace(/"/g, '&quot;')}"
                              oninput="window.farmaInvoiceScanner.updateRowField(${idx}, 'ubicacion_anaquel', this.value)"
                              class="invoice-cell-input text-center"
                            />
                          </td>
                          <td id="invoice-row-status-${idx}" class="p-2">
                            ${this.buildRowValidationBadge(it, idx)}
                          </td>
                          <td class="p-2 text-center">
                            <button
                              type="button"
                              onclick="window.farmaInvoiceScanner.removeRow(${idx})"
                              class="text-rose-400 hover:text-rose-200 font-bold text-xs px-1.5 py-1 cursor-pointer"
                              title="Quitar este renglón"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            ` : `
              <div class="p-10 rounded-3xl bg-slate-900/40 border-2 border-dashed border-slate-800 text-center space-y-2">
                <div class="text-3xl">📄✨</div>
                <div class="text-sm font-extrabold text-slate-200">
                  Sube una foto o PDF de la factura de compra o haz clic en "Extraer Tabla de Productos con IA"
                </div>
                <p class="text-xs text-slate-400 max-w-xl mx-auto">
                  Antes de guardar cualquier cambio en la base de datos, verás aquí la tabla completa con el cálculo de stock anterior vs. nuevo, Principio Activo (DCI), Código ATC y detector de errores en vivo para que puedas editar y corregir lo que necesites.
                </p>
              </div>
            `}
          </div>

          <!-- Pie de Confirmación Segura -->
          <div class="px-6 py-4 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div class="text-xs text-slate-400">
              🛡️ <strong>Garantía de Integridad:</strong> Ningún producto se guarda sin tu confirmación explícita. Los productos existentes sumarán su stock sin perder historial.
            </div>
            <div class="flex items-center gap-3">
              <button
                type="button"
                onclick="window.farmaInvoiceScanner.closeModal()"
                class="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
              >
                Cancelar
              </button>
              ${hasStaging ? `
                <button
                  type="button"
                  id="btn-commit-invoice-bulk"
                  onclick="window.farmaInvoiceScanner.commitBulkInventory()"
                  ${(r.renglones_con_error > 0 || r.total_renglones === 0 || this.isCommitting) ? 'disabled' : ''}
                  class="${
                    (r.renglones_con_error > 0 || r.total_renglones === 0)
                      ? 'px-6 py-3 rounded-xl bg-slate-800 text-slate-500 font-black text-xs cursor-not-allowed border border-slate-700'
                      : 'px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs shadow-lg cursor-pointer transition'
                  }"
                >
                  ${
                    this.isCommitting
                      ? '⏳ Guardando e indexando lotes en el inventario...'
                      : r.renglones_con_error > 0
                        ? `⛔ Corrija ${r.renglones_con_error} error(es) antes de confirmar`
                        : `✅ Confirmar e Ingresar ${r.total_renglones} Productos al Inventario`
                  }
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }
  }

  window.farmaInvoiceScanner = new FarmaInvoiceScanner();
})();
