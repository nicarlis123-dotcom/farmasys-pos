// =============================================================================
// FARMA-IA: DEMO AUTOMATIZADA CON GUÍA EN TIEMPO REAL Y EJEMPLOS EN VIVO
// Resuelve exactamente las necesidades del usuario:
// 1. Cambia automáticamente de paso mostrando cada acción en tiempo real.
// 2. Control de reproducción: Botón Reproducir / Pausar y barra de progreso.
// 3. Señaliza con flecha animada y marco de neón brillante cada elemento.
// 4. Muestra ejemplos reales y completos que NO se guardan en el sistema:
//    - Receta médica manuscrita/digital con OCR en vivo.
//    - Factura térmica con NCF B02, RNC y desglose fiscal.
//    - Libro de Psicotrópicos oficial Ley 50-88 con exequátur.
//    - Arqueo de caja con desglose de billetes y Corte X.
//    - Notificación por WhatsApp enviada al cliente.
// 5. Cuadro arrastrable con aviso de seguridad "Modo Demo Activo".
// =============================================================================

(function () {
  'use strict';

  let currentCategory = 'pos';
  let currentStepIndex = 0;
  let isDemoRunning = false;
  let isAutoPlaying = true; // Auto-avance activado por defecto
  let autoAdvanceTimer = null;
  let autoAdvanceProgressTimer = null;
  let autoAdvanceProgress = 0;
  let stepDurationMs = 5000; // 5 segundos por paso
  let typewriterTimer = null;
  let keystrokeTimer = null;

  // Variables para arrastrar el cuadro de diálogo (Drag & Drop)
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let cardInitialLeft = 0;
  let cardInitialTop = 0;
  let hasUserMovedCard = false;

  function resetAllModals() {
    const modalIds = [
      'pos-caja-modal', 'pos-thermal-printer-modal', 'pos-restock-modal',
      'pos-receta-ocr-modal', 'pos-psicotropicos-modal', 'pos-psicotropico-auth-modal',
      'modal-pharma-care-register', 'pos-delivery-tracking-modal', 'pos-quejas-modal',
      'modal-ai-assistant', 'pos-staff-rbac-modal', 'quick-services-config-modal',
      'audit-logs-modal', 'modal-kit-builder', 'create-pharmacy-modal',
      'pos-switch-user-modal', 'pos-ticket-modal'
    ];
    modalIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.add('hidden');
        el.classList.remove('flex');
        el.style.display = 'none';
      }
    });
    if (typeof window.closeAllSysDropdowns === 'function') {
      window.closeAllSysDropdowns();
    }
  }

  // ===========================================================================
  // MÓDULOS CON EJEMPLIFICACIÓN EN VIVO (SIN GUARDAR EN BD)
  // ===========================================================================
  const DEMO_MODULES = {
    pos: {
      id: 'pos',
      name: 'Venta de Mostrador Completa',
      icon: '🖥️',
      category: 'Ventas y Mostrador',
      description: 'Secuencia completa de venta: buscador de medicamentos con dosis y anaquel, fraccionamiento, farmacovigilancia, fidelidad, copago ARS, devuelta y ticket fiscal NCF.',
      steps: [
        {
          pasoNum: 1,
          totalPasos: 10,
          faceta: 'FACETA 1: BÚSQUEDA EN TIEMPO REAL',
          title: '1. Búsqueda de Fármaco en el Catálogo',
          badge: '1. Buscador Rápido',
          selector: '#pos-barcode-input',
          arrowDirection: 'top',
          colorTheme: '#06b6d4',
          dondeDarleAhora: 'Escribe aquí el nombre del medicamento o escanea su código (#pos-barcode-input)',
          dondeDarleDespues: 'Aparecerá el menú con la Dosis y la Ubicación exacta en el Anaquel.',
          prepare: () => {
            resetAllModals();
            if (typeof window.switchSysTab === 'function') window.switchSysTab('pos');
            const inp = document.querySelector('#pos-barcode-input');
            if (inp) inp.value = '';
            const dropdown = document.querySelector('#pos-search-dropdown');
            if (dropdown) dropdown.classList.add('hidden');
          },
          executeAction: (onComplete) => {
            const inp = document.querySelector('#pos-barcode-input');
            if (!inp) { if (onComplete) onComplete(); return; }
            inp.focus();
            inp.value = '';
            const textToType = 'Amoxicilina';
            let i = 0;
            if (keystrokeTimer) clearInterval(keystrokeTimer);
            keystrokeTimer = setInterval(() => {
              if (i < textToType.length) {
                inp.value += textToType.charAt(i);
                try { inp.dispatchEvent(new Event('input', { bubbles: true })); } catch(e){}
                i++;
              } else {
                clearInterval(keystrokeTimer);
                const dropdown = document.querySelector('#pos-search-dropdown');
                if (dropdown) {
                  dropdown.classList.remove('hidden');
                  dropdown.innerHTML = `
                    <div class="p-3.5 bg-gradient-to-r from-teal-50 to-sky-50 border-2 border-teal-400 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg animate-pulse">
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <span class="px-2 py-0.5 rounded text-[10px] font-black bg-sky-100 text-sky-800">💊 Antibiótico</span>
                          <span class="font-black text-slate-950 text-sm">Amoxicilina + Ác. Clavulánico</span>
                          <span class="px-2.5 py-0.5 rounded-lg bg-purple-600 text-white font-extrabold text-[11px] border border-purple-300">
                            🧪 Dosis: 500mg / 125mg
                          </span>
                        </div>
                        <div class="flex items-center gap-2.5 text-xs text-slate-700 mt-2 flex-wrap">
                          <span class="px-3 py-1 rounded-lg bg-amber-400 text-slate-950 font-black border border-amber-500 shadow-xs">
                            📍 UBICACIÓN: Anaquel B-04 (Pasillo 2)
                          </span>
                          <span class="bg-white px-2 py-0.5 rounded border border-slate-200">Lote: <strong>LOT-2026-X</strong></span>
                          <span class="bg-white px-2 py-0.5 rounded border border-slate-200">Vence: <strong>2027-08-30</strong></span>
                        </div>
                      </div>
                      <div class="flex items-center gap-1.5 flex-shrink-0">
                        <span class="px-3 py-1.5 rounded-xl bg-teal-600 text-white font-black text-xs">✓ Encontrado</span>
                      </div>
                    </div>
                  `;
                }
                if (onComplete) onComplete();
              }
            }, 60);
          },
          explanation: 'La búsqueda predictiva consulta el stock al instante. Despliega la dosis farmacéutica y le indica al despachador la posición en el anaquel físico (Anaquel B-04).'
        },
        {
          pasoNum: 2,
          totalPasos: 10,
          faceta: 'FACETA 2: SELECCIÓN DE PRESENTACIÓN Y UBICACIÓN',
          title: '2. Selección de Presentación (Dosis y Anaquel)',
          badge: '2. Elegir Blíster',
          selector: '#pos-search-dropdown',
          arrowDirection: 'top',
          colorTheme: '#f59e0b',
          dondeDarleAhora: 'Haz clic aquí en "+ Blíster (RD$ 240.00)" para añadir la presentación fraccionada',
          dondeDarleDespues: 'El producto se enviará a la factura con su lote correspondiente.',
          prepare: () => {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('pos');
            const inp = document.querySelector('#pos-barcode-input');
            if (inp) inp.value = 'Amoxicilina';
          },
          executeAction: (onComplete) => {
            const dropdown = document.querySelector('#pos-search-dropdown');
            if (dropdown) {
              dropdown.classList.remove('hidden');
              dropdown.innerHTML = `
                <div class="p-3.5 bg-amber-50/90 border-2 border-amber-400 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="font-black text-slate-950 text-sm">Amoxicilina + Ác. Clavulánico</span>
                      <span class="px-2 py-0.5 rounded-md bg-purple-600 text-white font-extrabold text-xs">🧪 500mg / 125mg</span>
                    </div>
                    <div class="text-xs text-amber-950 font-bold mt-1.5">
                      📍 Anaquel B-04 • Stock: 140 unidades disponibles
                    </div>
                  </div>
                  <div class="flex items-center gap-2 flex-shrink-0">
                    <button type="button" class="px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs">+ Unid (RD$25)</button>
                    <button type="button" id="demo-action-btn-blister" class="px-3 py-2 rounded-xl bg-teal-600 text-white font-black text-xs ring-4 ring-teal-300 animate-pulse">
                      👉 + Blíster (RD$240)
                    </button>
                    <button type="button" class="px-2.5 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-xs">+ Caja (RD$680)</button>
                  </div>
                </div>
              `;
              setTimeout(() => {
                const btn = document.querySelector('#demo-action-btn-blister');
                if (btn) btn.classList.add('scale-95', 'bg-teal-700');
                if (typeof showToast === 'function') {
                  showToast('✓ Blíster de 10 pastillas cargado desde Anaquel B-04', 'success');
                }
                if (onComplete) onComplete();
              }, 600);
            } else {
              if (onComplete) onComplete();
            }
          },
          explanation: 'El sistema permite fraccionar la medicina con un solo toque: puedes vender pastillas sueltas (unidad), blíster o la caja completa sin descuadrar el inventario.'
        },
        {
          pasoNum: 3,
          totalPasos: 10,
          faceta: 'FACETA 3: SELECTOR DE PISTOLA DE CÓDIGOS',
          title: '3. Botones Rápidos de Fraccionamiento para Escaneo',
          badge: '3. Pistola de Código',
          selector: '#btn-pres-BLISTER',
          arrowDirection: 'bottom',
          colorTheme: '#8b5cf6',
          dondeDarleAhora: 'Haz clic en el botón "💊 Blíster" (#btn-pres-BLISTER) para fraccionar ventas',
          dondeDarleDespues: 'Cualquier código de barras escaneado se registrará como blíster.',
          prepare: () => {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('pos');
          },
          executeAction: (onComplete) => {
            if (typeof window.selectVisualScanPresentation === 'function') {
              window.selectVisualScanPresentation('BLISTER');
            }
            const btn = document.querySelector('#btn-pres-BLISTER');
            if (btn) btn.classList.add('ring-4', 'ring-purple-400');
            if (onComplete) onComplete();
          },
          explanation: 'Si utilizas lector láser de código de barras, estos 3 botones superiores definen cómo se interpretará el escaneo de la caja para ventas rápidas.'
        },
        {
          pasoNum: 4,
          totalPasos: 10,
          faceta: 'FACETA 4: CARRITO Y TRAZABILIDAD FEFO',
          title: '4. Asignación Automática de Lote y Vencimiento',
          badge: '4. Carrito FEFO',
          selector: '#tabla-lotes-vencimiento',
          arrowDirection: 'top',
          colorTheme: '#10b981',
          dondeDarleAhora: 'Revisa aquí el medicamento añadido al carrito con su lote y fecha de vencimiento (#tabla-lotes-vencimiento)',
          dondeDarleDespues: 'Continuamos identificando al cliente en el sistema.',
          prepare: () => {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('pos');
            const dropdown = document.querySelector('#pos-search-dropdown');
            if (dropdown) dropdown.classList.add('hidden');
          },
          executeAction: (onComplete) => {
            const tbody = document.querySelector('#pos-cart-tbody');
            if (tbody) {
              tbody.innerHTML = `
                <tr class="bg-emerald-50/80 border-b-2 border-emerald-300">
                  <td class="py-3 px-3">
                    <p class="font-extrabold text-slate-900 text-sm">Amoxicilina + Ác. Clavulánico 500/125mg</p>
                    <div class="flex items-center gap-2 mt-1">
                      <span class="text-[11px] font-mono font-bold text-teal-800 bg-teal-100 px-2 py-0.5 rounded">Lote: LOT-2026-X</span>
                      <span class="text-[11px] font-mono text-slate-600">Vence: 2027-08-30</span>
                      <span class="text-[11px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded">📍 Anaquel B-04</span>
                    </div>
                  </td>
                  <td class="py-3 px-2"><span class="px-2.5 py-1 rounded-lg bg-teal-600 text-white font-extrabold text-xs">💊 BLÍSTER (10u)</span></td>
                  <td class="py-3 px-2 text-center font-black text-slate-900 text-sm">1</td>
                  <td class="py-3 px-2 text-center font-mono font-bold text-teal-700">10 unid.</td>
                  <td class="py-3 px-3 text-right font-mono font-black text-slate-950 text-base">RD$ 240.00</td>
                  <td class="py-3 px-2 text-right"><span class="text-xs text-emerald-700 font-bold">✓ Cargado</span></td>
                </tr>
              `;
              const subEl = document.querySelector('#pos-subtotal-val');
              const totEl = document.querySelector('#pos-total-amount');
              const minEl = document.querySelector('#pos-total-min-units');
              if (subEl) subEl.textContent = 'RD$ 240.00';
              if (totEl) totEl.textContent = 'RD$ 240.00';
              if (minEl) minEl.textContent = '10 unid.';
            }
            if (onComplete) onComplete();
          },
          explanation: 'La regla FEFO (primero en expirar, primero en salir) garantiza que no salgan lotes antiguos retenidos en estantería, protegiendo al negocio de caducidades.'
        },
        {
          pasoNum: 5,
          totalPasos: 10,
          faceta: 'FACETA 5: FARMACOVIGILANCIA Y ALERTA DE ALERGIA',
          title: '5. Identificación del Paciente y Alerta de Alergia',
          badge: '5. Alerta Clínica',
          selector: '#pos-client-cedula',
          arrowDirection: 'right',
          colorTheme: '#ef4444',
          dondeDarleAhora: 'Digita aquí la cédula del paciente (#pos-client-cedula) para auditar alergias',
          dondeDarleDespues: 'El sistema emite una alerta roja bloqueante de seguridad.',
          prepare: () => {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('pos');
          },
          executeAction: (onComplete) => {
            const ced = document.querySelector('#pos-client-cedula');
            const nom = document.querySelector('#pos-client-name');
            const tel = document.querySelector('#pos-client-phone');
            const alertEl = document.querySelector('#pos-patient-allergy-alert');
            const alertTxt = document.querySelector('#pos-patient-allergy-text');
            if (ced) {
              ced.value = '402-1234567-8';
              ced.classList.add('ring-2', 'ring-rose-500');
            }
            if (nom) nom.value = 'Carlos Santana (Paciente Alérgico)';
            if (tel) tel.value = '809-555-0199';
            if (alertEl && alertTxt) {
              alertTxt.textContent = 'ALERTA CLÍNICA: PACIENTE DECLARÓ ALERGIA A LA PENICILINA (BETALACTÁMICOS)';
              alertEl.classList.remove('hidden');
              alertEl.classList.add('animate-bounce');
            }
            if (typeof showToast === 'function') {
              showToast('⚠️ ALERTA: Paciente con alergia declarada a la Amoxicilina', 'error');
            }
            if (onComplete) onComplete();
          },
          explanation: 'Si el paciente tiene alergias registradas en su historial, el sistema avisa de inmediato para advertir al cliente y evitar choques anafilácticos o errores fatales.'
        },
        {
          pasoNum: 6,
          totalPasos: 10,
          faceta: 'FACETA 6: VENTA CRUZADA CON FARMAIA',
          title: '6. Sugerencia de Venta Cruzada Clínica con FarmaIA',
          badge: '6. Copiloto FarmaIA',
          selector: '#pos-cross-selling-container',
          arrowDirection: 'left',
          colorTheme: '#6366f1',
          dondeDarleAhora: 'Haz clic aquí para revisar las recomendaciones clínicas de FarmaIA (#pos-cross-selling-container)',
          dondeDarleDespues: 'Continuamos con la bonificación por cliente frecuente.',
          prepare: () => {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('pos');
          },
          executeAction: (onComplete) => {
            const box = document.querySelector('#pos-cross-selling-container');
            const diag = document.querySelector('#pos-cross-selling-dialogue');
            const cards = document.querySelector('#pos-cross-selling-cards');
            if (box) box.classList.remove('hidden');
            if (diag) diag.textContent = 'Tratamiento antibiótico en curso: Recuerda sugerir Probióticos (Enterogermina) o Protector Gástrico (Omeprazol).';
            if (cards) {
              cards.innerHTML = `
                <div class="p-3 rounded-2xl bg-white border-2 border-indigo-200 flex items-center justify-between shadow-xs">
                  <div>
                    <p class="font-extrabold text-xs text-indigo-950">Enterogermina 2 Billones</p>
                    <p class="text-[10px] text-slate-500 font-medium">Reconstituyente de Flora Intestinal</p>
                  </div>
                  <button type="button" class="px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-extrabold text-xs">+ Agregar RD$120</button>
                </div>
                <div class="p-3 rounded-2xl bg-indigo-50 border-2 border-indigo-400 flex items-center justify-between shadow-xs ring-4 ring-indigo-200">
                  <div>
                    <p class="font-extrabold text-xs text-indigo-950">Omeprazol 20mg (Caja 14u)</p>
                    <p class="text-[10px] text-slate-500 font-medium">Protector de Mucosa Gástrica</p>
                  </div>
                  <button type="button" class="px-3 py-1.5 rounded-xl bg-indigo-700 text-white font-extrabold text-xs animate-pulse">👉 + Agregar RD$95</button>
                </div>
              `;
            }
            if (onComplete) onComplete();
          },
          explanation: 'FarmaIA analiza la compatibilidad farmacológica y sugiere productos complementarios adecuados, aumentando las ventas y cuidando la salud estomacal del paciente.'
        },
        {
          pasoNum: 7,
          totalPasos: 10,
          faceta: 'FACETA 7: FIDELIZACIÓN Y DESCUENTOS',
          title: '7. Aplicación de Bonificación del 10% por Paciente Frecuente',
          badge: '7. Descuento 10%',
          selector: '#pos-plan-bonus-container',
          arrowDirection: 'right',
          colorTheme: '#059669',
          dondeDarleAhora: 'Se marca la casilla de bonificación en (#pos-plan-bonus-container)',
          dondeDarleDespues: 'El total se actualiza automáticamente con el descuento.',
          prepare: () => {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('pos');
          },
          executeAction: (onComplete) => {
            const planBox = document.querySelector('#pos-plan-bonus-container');
            const bonusLabel = document.querySelector('#pos-bonus-pct-label');
            const bonusAmt = document.querySelector('#pos-bonus-discount-amount');
            const totEl = document.querySelector('#pos-total-amount');
            if (planBox) {
              planBox.classList.remove('hidden');
              planBox.classList.add('bg-emerald-50', 'border-emerald-300');
            }
            if (bonusLabel) bonusLabel.textContent = '10%';
            if (bonusAmt) bonusAmt.textContent = '-RD$ 24.00';
            if (totEl) totEl.textContent = 'RD$ 216.00';
            if (typeof showToast === 'function') {
              showToast('🎉 Bonificación del 10% aplicada al total: -RD$ 24.00', 'success');
            }
            if (onComplete) onComplete();
          },
          explanation: 'Premia la lealtad de pacientes hipertensos, diabéticos o crónicos otorgándoles descuentos programados y reteniendo clientes para la farmacia.'
        },
        {
          pasoNum: 8,
          totalPasos: 10,
          faceta: 'FACETA 8: FORMA DE PAGO Y SEGURO ARS',
          title: '8. Selección de Pago en Efectivo y Seguro ARS Humano',
          badge: '8. Cobro y Seguro',
          selector: '#btn-pay-EFECTIVO',
          arrowDirection: 'bottom',
          colorTheme: '#0284c7',
          dondeDarleAhora: 'El botón "💵 Efectivo RD$" queda seleccionado (#btn-pay-EFECTIVO)',
          dondeDarleDespues: 'Pasamos a la calculadora automática de cambio.',
          prepare: () => {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('pos');
          },
          executeAction: (onComplete) => {
            if (typeof window.selectVisualPaymentMethod === 'function') {
              window.selectVisualPaymentMethod('EFECTIVO');
            }
            const btn = document.querySelector('#btn-pay-EFECTIVO');
            if (btn) btn.classList.add('ring-4', 'ring-sky-400');
            const ars = document.querySelector('#pos-insurance-ars');
            if (ars) ars.value = 'ARS Humano';
            if (onComplete) onComplete();
          },
          explanation: 'La farmacia puede liquidar en Efectivo, Tarjeta de Crédito, Transferencia bancaria o copago con ARS (Humano, Senasa, Mapfre, etc.).'
        },
        {
          pasoNum: 9,
          totalPasos: 10,
          faceta: 'FACETA 9: CALCULADORA DE DEVUELTA',
          title: '9. Ingreso de Billete de RD$ 500 y Cálculo de Devuelta',
          badge: '9. Cambio RD$ 284',
          selector: '#pos-cash-calc-container',
          arrowDirection: 'top',
          colorTheme: '#16a34a',
          dondeDarleAhora: 'Se digita 500 en Monto Recibido (#pos-cash-tendered)',
          dondeDarleDespues: 'La pantalla muestra en grande la devuelta exacta de RD$ 284.00.',
          prepare: () => {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('pos');
          },
          executeAction: (onComplete) => {
            const tender = document.querySelector('#pos-cash-tendered');
            if (tender) {
              tender.value = '500.00';
              tender.classList.add('ring-4', 'ring-emerald-400');
              try { tender.dispatchEvent(new Event('input', { bubbles: true })); } catch(e){}
            }
            const change = document.querySelector('#pos-cash-change-val');
            if (change) {
              change.textContent = 'RD$ 284.00';
              change.classList.add('animate-pulse');
            }
            if (onComplete) onComplete();
          },
          explanation: 'La calculadora de devuelta elimina los fallos de vuelto y agiliza el despacho cuando hay filas de clientes esperando en horas pico.'
        },
        {
          pasoNum: 10,
          totalPasos: 10,
          faceta: 'FACETA 10: FACTURACIÓN, NCF Y TICKET TÉRMICO',
          title: '10. Emisión de Factura Fiscal con NCF e Impresión Térmica',
          badge: '10. Ticket Final',
          selector: '#btn-cobrar-factura',
          arrowDirection: 'bottom',
          colorTheme: '#0d9488',
          dondeDarleAhora: 'Se pulsa "🧾 Facturar e Imprimir Recibo" (#btn-cobrar-factura)',
          dondeDarleDespues: 'Apertura de gaveta y ticket térmico listo.',
          prepare: () => {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('pos');
          },
          executeAction: (onComplete) => {
            const ticketModal = document.querySelector('#pos-ticket-modal');
            const ticketBody = document.querySelector('#pos-ticket-body');
            if (ticketModal && ticketBody) {
              ticketBody.innerHTML = `
                <div class="text-center pb-2 border-b border-dashed border-slate-300">
                  <p class="font-black text-sm">FARMACIA DAVALSI S.R.L.</p>
                  <p class="text-[10px]">RNC: 1-31-99887-2 • Tel: (809) 555-0199</p>
                  <p class="text-[10px]">Av. 27 de Febrero #45, Santo Domingo</p>
                  <div class="my-1.5 py-1 px-2 rounded bg-slate-100 border border-slate-300">
                    <p class="text-[11px] font-black text-slate-900">NCF: B0200004921</p>
                    <p class="text-[9px] text-slate-600">FACTURA DE CONSUMO FINAL</p>
                  </div>
                  <p class="text-[10px] font-bold">FECHA: 2026-11-01 • CAJA 01 • TURNO M</p>
                </div>
                <div class="py-2 space-y-1 text-[11px] border-b border-dashed border-slate-300">
                  <div class="flex justify-between font-bold">
                    <span>1x Blíster Amoxicilina 500/125mg</span>
                    <span>RD$ 240.00</span>
                  </div>
                  <p class="text-[9px] text-slate-500 font-mono">LOT-2026-X • Vence: 2027-08-30 • Anaquel B-04</p>
                  <div class="flex justify-between text-emerald-700 font-bold pt-1">
                    <span>Bonificación Cliente Frecuente (10%)</span>
                    <span>-RD$ 24.00</span>
                  </div>
                </div>
                <div class="pt-2 text-[11px] font-bold space-y-0.5">
                  <div class="flex justify-between text-xs font-black">
                    <span>SUBTOTAL:</span>
                    <span>RD$ 216.00</span>
                  </div>
                  <div class="flex justify-between text-xs font-black text-teal-800">
                    <span>TOTAL A PAGAR:</span>
                    <span>RD$ 216.00</span>
                  </div>
                  <div class="flex justify-between text-slate-600">
                    <span>Efectivo Entregado:</span>
                    <span>RD$ 500.00</span>
                  </div>
                  <div class="flex justify-between text-emerald-800 font-black text-xs">
                    <span>CAMBIO ENTREGADO:</span>
                    <span>RD$ 284.00</span>
                  </div>
                </div>
                <div class="text-center pt-3 text-[9px] text-slate-500 border-t border-dashed border-slate-200 mt-2">
                  <p>🔒 Datos simulados en vivo • No grabados en base de datos</p>
                  <p class="font-bold text-slate-700">¡Gracias por su compra en FarmaSys POS!</p>
                </div>
              `;
              ticketModal.classList.remove('hidden');
              ticketModal.classList.add('flex');
              ticketModal.style.display = 'flex';
            }
            if (typeof showToast === 'function') {
              showToast('🧾 Factura emitida con NCF B0200004921 e impresa.', 'success');
            }
            if (onComplete) onComplete();
          },
          explanation: '¡Venta finalizada! El ticket incluye el Comprobante Fiscal (NCF) oficial de República Dominicana, desglose del lote FEFO y confirmación de la devuelta en efectivo.'
        }
      ]
    },

    recetas: {
      id: 'recetas',
      name: 'Recetas Médicas & OCR IA',
      icon: '📸',
      category: 'Recetas y Control',
      description: 'Demostración de lectura óptica inteligente (OCR) de recetas médicas manuscritas para cargarlas al carrito de venta.',
      steps: [
        {
          pasoNum: 1,
          totalPasos: 2,
          faceta: 'RECETAS: ESCANEO Y SUBIDA',
          title: '1. Cargar Receta Médica en el Escáner OCR',
          badge: '1. Subir Imagen',
          selector: '#pos-receta-ocr-modal',
          arrowDirection: 'top',
          colorTheme: '#06b6d4',
          dondeDarleAhora: 'Se abre la ventana de OCR Inteligente (#pos-receta-ocr-modal)',
          dondeDarleDespues: 'La inteligencia artificial leerá el texto del médico.',
          prepare: () => {
            resetAllModals();
            if (typeof window.openPosRecetaOcrModal === 'function') window.openPosRecetaOcrModal();
          },
          executeAction: (onComplete) => {
            const m = document.querySelector('#pos-receta-ocr-modal');
            if (m) {
              m.classList.remove('hidden');
              m.style.display = 'flex';
            }
            if (onComplete) onComplete();
          },
          explanation: 'Permite tomar una foto con la cámara del mostrador o subir una imagen JPG/PNG de la prescripción médica expedida por el doctor.'
        },
        {
          pasoNum: 2,
          totalPasos: 2,
          faceta: 'RECETAS: TRANSCRIPCIÓN CON IA',
          title: '2. Ejemplo de Receta Transcrita por IA',
          badge: '2. Receta Leída',
          selector: '#pos-receta-ocr-modal',
          arrowDirection: 'bottom',
          colorTheme: '#10b981',
          dondeDarleAhora: 'Observa la receta médica procesada por el OCR',
          dondeDarleDespues: 'Los productos se pueden enviar con un clic a la factura.',
          prepare: () => {},
          executeAction: (onComplete) => {
            const preview = document.querySelector('#pos-receta-ocr-preview');
            const resultBox = document.querySelector('#pos-receta-ocr-results');
            if (preview) {
              preview.innerHTML = `
                <div class="p-3 bg-amber-50 border-2 border-amber-300 rounded-xl text-left font-serif text-slate-800 shadow-sm">
                  <div class="border-b border-amber-200 pb-1.5 mb-1.5 flex justify-between items-center text-xs">
                    <div>
                      <p class="font-bold">DR. ALEJANDRO MORALES PEÑA</p>
                      <p class="text-[10px] text-slate-600">Medicina Interna • Exequátur #12948</p>
                    </div>
                    <span class="px-2 py-0.5 rounded bg-blue-100 text-blue-900 font-bold text-[10px]">CLÍNICA CORAZÓN</span>
                  </div>
                  <p class="text-xs"><strong>Paciente:</strong> Carmen Rodríguez (54 años)</p>
                  <p class="text-xs"><strong>Fecha:</strong> 01/Nov/2026</p>
                  <div class="mt-2 text-xs space-y-1">
                    <p>💊 <strong>Losartán Potásico 50mg</strong> - Tomar 1 tableta cada 24 horas.</p>
                    <p>💊 <strong>Atorvastatina 20mg</strong> - Tomar 1 tableta en la noche.</p>
                  </div>
                </div>
              `;
            }
            if (resultBox) {
              resultBox.innerHTML = `
                <div class="p-3 bg-emerald-50 border-2 border-emerald-400 rounded-xl space-y-2">
                  <p class="text-xs font-black text-emerald-900">✅ Fármacos Detectados por Visión Artificial:</p>
                  <div class="flex items-center justify-between p-2 bg-white rounded-lg border border-emerald-200 text-xs">
                    <span>Losartán Potásico 50mg (Anaquel C-01)</span>
                    <span class="font-bold text-teal-800">RD$ 180.00</span>
                  </div>
                  <div class="flex items-center justify-between p-2 bg-white rounded-lg border border-emerald-200 text-xs">
                    <span>Atorvastatina 20mg (Anaquel C-04)</span>
                    <span class="font-bold text-teal-800">RD$ 320.00</span>
                  </div>
                </div>
              `;
            }
            if (typeof showToast === 'function') {
              showToast('📸 Receta del Dr. Morales transcrita por Visión Artificial', 'info');
            }
            if (onComplete) onComplete();
          },
          explanation: 'La IA extrae el nombre del médico, el exequátur legal y los medicamentos prescritos, reduciendo a cero el tiempo de digitación manual.'
        }
      ]
    },

    psicotropicos: {
      id: 'psicotropicos',
      name: 'Psicotrópicos (Ley 50-88)',
      icon: '📋',
      category: 'Recetas y Control',
      description: 'Control oficial exigido por la DNCD y el Ministerio de Salud Pública para sustancias controladas.',
      steps: [
        {
          pasoNum: 1,
          totalPasos: 2,
          faceta: 'PSICOTRÓPICOS: LIBRO OFICIAL',
          title: '1. Apertura del Libro Foliado de Psicotrópicos',
          badge: '1. Libro DNCD',
          selector: '#pos-psicotropicos-modal',
          arrowDirection: 'top',
          colorTheme: '#dc2626',
          dondeDarleAhora: 'Se despliega el Libro Oficial de Control (#pos-psicotropicos-modal)',
          dondeDarleDespues: 'Continuamos con la firma digital del Farmacéutico Regente.',
          prepare: () => {
            resetAllModals();
            if (typeof window.openPosPsicotropicosModal === 'function') window.openPosPsicotropicosModal();
          },
          executeAction: (onComplete) => {
            const m = document.querySelector('#pos-psicotropicos-modal');
            if (m) {
              m.classList.remove('hidden');
              m.style.display = 'flex';
            }
            if (onComplete) onComplete();
          },
          explanation: 'Mantiene el registro inviolable de entradas y salidas de Clonazepam, Alprazolam, Diazepam y morfina con número de folio oficial.'
        },
        {
          pasoNum: 2,
          totalPasos: 2,
          faceta: 'PSICOTRÓPICOS: FIRMA DEL REGENTE',
          title: '2. Ejemplo de Autorización con PIN del Regente',
          badge: '2. Clave Regente',
          selector: '#pos-psicotropico-auth-modal',
          arrowDirection: 'right',
          colorTheme: '#7c3aed',
          dondeDarleAhora: 'Se valida la clave del Regente (#pos-psicotropico-auth-modal)',
          dondeDarleDespues: 'El producto controlado queda autorizado para la venta.',
          prepare: () => {},
          executeAction: (onComplete) => {
            const m = document.querySelector('#pos-psicotropico-auth-modal');
            if (m) {
              m.classList.remove('hidden');
              m.style.display = 'flex';
            }
            if (typeof showToast === 'function') {
              showToast('🔐 Lic. Roberto Valenzuela (Regente Exeq. 4492) autorizó la salida.', 'success');
            }
            if (onComplete) onComplete();
          },
          explanation: 'Para evitar sanciones legales de Salud Pública, el software exige la clave personal del regente antes de dispensar cualquier sustancia controlada.'
        }
      ]
    },

    caja: {
      id: 'caja',
      name: 'Caja: Cortes X / Z y Arqueo',
      icon: '💰',
      category: 'Ventas y Caja',
      description: 'Auditoría en tiempo real de la gaveta de dinero con desglose por denominación de billetes y cortes de turno.',
      steps: [
        {
          pasoNum: 1,
          totalPasos: 2,
          faceta: 'CAJA: ARQUEO DE EFECTIVO',
          title: '1. Desglose de Dinero en la Gaveta',
          badge: '1. Arqueo en Vivo',
          selector: '#pos-caja-modal',
          arrowDirection: 'top',
          colorTheme: '#f59e0b',
          dondeDarleAhora: 'Se abre el módulo de Caja y Arqueo (#pos-caja-modal)',
          dondeDarleDespues: 'Se procede a imprimir el comprobante de Corte X.',
          prepare: () => {
            resetAllModals();
            if (typeof window.openPosCajaModal === 'function') window.openPosCajaModal();
          },
          executeAction: (onComplete) => {
            const m = document.querySelector('#pos-caja-modal');
            if (m) {
              m.classList.remove('hidden');
              m.style.display = 'flex';
            }
            if (onComplete) onComplete();
          },
          explanation: 'El cajero cuenta los billetes (RD$ 2,000, RD$ 1,000, RD$ 500, RD$ 200, RD$ 100, RD$ 50) y el sistema calcula la diferencia contra las ventas registradas.'
        },
        {
          pasoNum: 2,
          totalPasos: 2,
          faceta: 'CAJA: CORTE FISCAL X / Z',
          title: '2. Ejemplo de Reporte de Corte X Impreso',
          badge: '2. Corte Impreso',
          selector: '#pos-caja-modal',
          arrowDirection: 'bottom',
          colorTheme: '#10b981',
          dondeDarleAhora: 'Observa el resumen del balance de caja',
          dondeDarleDespues: 'Fin de la auditoría de caja.',
          prepare: () => {},
          executeAction: (onComplete) => {
            if (typeof showToast === 'function') {
              showToast('🖨️ CORTE X: Total Efectivo RD$ 18,450.00 • Tarjetas RD$ 9,200.00', 'info');
            }
            if (onComplete) onComplete();
          },
          explanation: 'El Corte X se usa para cambios de cajero al mediodía; el Corte Z bloquea el día de operaciones y genera el asiento contable definitivo.'
        }
      ]
    },

    solicitudes: {
      id: 'solicitudes',
      name: 'Pedidos WhatsApp & App Móvil',
      icon: '📱',
      category: 'Ventas y Mostrador',
      description: 'Gestión de órdenes en línea con despacho a domicilio y notificación automática por WhatsApp.',
      steps: [
        {
          pasoNum: 1,
          totalPasos: 2,
          faceta: 'PEDIDOS: BANDEJA ENTRANTE',
          title: '1. Recepción de Pedidos desde WhatsApp y App Móvil',
          badge: '1. Pedidos Nuevos',
          selector: '#sys-nav-pedidos-btn',
          arrowDirection: 'bottom',
          colorTheme: '#25d366',
          dondeDarleAhora: 'Pestaña de Pedidos en línea (#sys-nav-pedidos-btn)',
          dondeDarleDespues: 'Se confirma la orden y se asigna el repartidor.',
          prepare: () => {
            resetAllModals();
            if (typeof window.switchSysTab === 'function') window.switchSysTab('solicitudes');
          },
          executeAction: (onComplete) => {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('solicitudes');
            if (onComplete) onComplete();
          },
          explanation: 'Permite a la farmacia recibir recetas y solicitudes digitales sin llamadas telefónicas ni desorden en el mostrador.'
        },
        {
          pasoNum: 2,
          totalPasos: 2,
          faceta: 'PEDIDOS: MENSAJE WHATSAPP',
          title: '2. Notificación Automática de Despacho al Paciente',
          badge: '2. WhatsApp Enviado',
          selector: '#view-solicitudes',
          arrowDirection: 'top',
          colorTheme: '#0284c7',
          dondeDarleAhora: 'Se envía mensaje de confirmación al cliente',
          dondeDarleDespues: 'El motorizado sale con la medicina.',
          prepare: () => {},
          executeAction: (onComplete) => {
            if (typeof showToast === 'function') {
              showToast('📲 WhatsApp enviado al 809-555-0199: "Su pedido va en camino con el mensajero 🛵"', 'success');
            }
            if (onComplete) onComplete();
          },
          explanation: 'Fideliza al paciente con avisos instantáneos con el valor de la factura y el tiempo estimado de entrega a su casa.'
        }
      ]
    },

    staff: {
      id: 'staff',
      name: 'Personal, Roles y Cuentas RBAC',
      icon: '🔐',
      category: 'Gestión',
      description: 'Creación de cajeros, administradores y cambio de usuario protegido con contraseña.',
      steps: [
        {
          pasoNum: 1,
          totalPasos: 2,
          faceta: 'ROLES: CREACIÓN DE PERSONAL',
          title: '1. Crear Cajeros con Permisos Restringidos',
          badge: '1. Alta de Personal',
          selector: '#pos-staff-rbac-modal',
          arrowDirection: 'top',
          colorTheme: '#6366f1',
          dondeDarleAhora: 'Haz clic en este panel para crear o gestionar cajeros y permisos (#pos-staff-rbac-modal)',
          dondeDarleDespues: 'Se prueba el cambio seguro con clave.',
          prepare: () => {
            resetAllModals();
            if (typeof window.openPosStaffRbacModal === 'function') window.openPosStaffRbacModal();
          },
          executeAction: (onComplete) => {
            const m = document.querySelector('#pos-staff-rbac-modal');
            if (m) {
              m.classList.remove('hidden');
              m.style.display = 'flex';
            }
            if (onComplete) onComplete();
          },
          explanation: 'La farmacia solo se crea con 1 Administrador. Desde aquí se registran los Cajeros (solo cobranza) y Regentes, asignándoles clave única.'
        },
        {
          pasoNum: 2,
          totalPasos: 2,
          faceta: 'ROLES: CAMBIO CON CLAVE OBLIGATORIA',
          title: '2. Cambio de Usuario Seguro con Contraseña',
          badge: '2. Clave Requerida',
          selector: '#pos-switch-user-modal',
          arrowDirection: 'right',
          colorTheme: '#f43f5e',
          dondeDarleAhora: 'Digita tu clave aquí para autorizar el cambio de cajero (#pos-switch-user-modal)',
          dondeDarleDespues: 'El sistema valida la contraseña individual.',
          prepare: () => {},
          executeAction: (onComplete) => {
            const m = document.querySelector('#pos-switch-user-modal');
            if (m) {
              m.classList.remove('hidden');
              m.style.display = 'flex';
            }
            if (typeof showToast === 'function') {
              showToast('🔒 Cambio protegido: Contraseña obligatoria para cambiar de cuenta', 'info');
            }
            if (onComplete) onComplete();
          },
          explanation: 'Para evitar desfalcos en caja, ningún usuario puede usar la cuenta de otro compañero sin digitar su contraseña secreta.'
        }
      ]
    }
  };

  // ===========================================================================
  // INTERFAZ: OVERLAY, FLECHA ANIMADA, BARRA DE PROGRESO Y CONTROLES DE DEMO
  // ===========================================================================
  function injectDemoModalAndOverlay() {
    let hubModal = document.getElementById('pos-interactive-demo-hub-modal');
    if (!hubModal) {
      hubModal = document.createElement('div');
      hubModal.id = 'pos-interactive-demo-hub-modal';
      hubModal.className = 'fixed inset-0 z-[150] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 hidden animate-fade-in';
      hubModal.innerHTML = `
        <div class="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
          <div class="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white flex items-center justify-between border-b border-teal-900/60">
            <div class="flex items-center gap-3.5">
              <div class="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-400/40 flex items-center justify-center text-2xl shadow-inner">
                🎯
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-400 text-slate-950">
                    DEMO EN VIVO • AUTO-GUIADA
                  </span>
                  <span class="text-xs text-teal-300 font-extrabold">Avanza Sola con Ejemplos Reales</span>
                </div>
                <h2 class="text-lg sm:text-xl font-extrabold text-white mt-0.5">Demostración en Tiempo Real de FarmaSys POS</h2>
              </div>
            </div>
            <button type="button" onclick="window.posGuide.closeHub()" class="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center text-sm font-bold transition cursor-pointer">
              ✕
            </button>
          </div>

          <!-- Filtro -->
          <div class="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div class="flex items-center gap-1.5 overflow-x-auto" id="demo-hub-category-filters">
              <button type="button" onclick="window.posGuide.filterHub('TODOS')" class="demo-cat-btn px-3 py-1.5 rounded-xl font-black bg-slate-900 text-white transition">Todas las Funciones</button>
              <button type="button" onclick="window.posGuide.filterHub('Ventas y Mostrador')" class="demo-cat-btn px-3 py-1.5 rounded-xl font-bold bg-white text-slate-700 border border-slate-200 hover:bg-teal-50 transition">Venta Mostrador</button>
              <button type="button" onclick="window.posGuide.filterHub('Ventas y Caja')" class="demo-cat-btn px-3 py-1.5 rounded-xl font-bold bg-white text-slate-700 border border-slate-200 hover:bg-teal-50 transition">Caja y Arqueo</button>
              <button type="button" onclick="window.posGuide.filterHub('Recetas y Control')" class="demo-cat-btn px-3 py-1.5 rounded-xl font-bold bg-white text-slate-700 border border-slate-200 hover:bg-teal-50 transition">Recetas & Psicotrópicos</button>
              <button type="button" onclick="window.posGuide.filterHub('Gestión')" class="demo-cat-btn px-3 py-1.5 rounded-xl font-bold bg-white text-slate-700 border border-slate-200 hover:bg-teal-50 transition">Personal & Roles</button>
            </div>
            <button type="button" onclick="window.posGuide.startFullTour()" class="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-extrabold shadow-md flex items-center gap-1.5 transition cursor-pointer">
              <span>🚀</span> <span>Iniciar Venta Completa (10 Pasos Reales)</span>
            </button>
          </div>

          <!-- Módulos -->
          <div class="p-4 sm:p-6 overflow-y-auto max-h-[60vh] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5" id="demo-hub-cards-container">
            <!-- Dinámico -->
          </div>

          <!-- Footer -->
          <div class="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <p class="text-[11px] font-medium">💡 Los ejemplos se ejecutan en tiempo real. No se guarda ningún dato falso en el sistema.</p>
            <button type="button" onclick="window.posGuide.closeHub()" class="px-5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-extrabold transition cursor-pointer">
              Cerrar
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(hubModal);
    }

    // Overlay Flotante con Flecha, Resaltador y Cuadro Arrastrable
    let overlay = document.getElementById('pos-interactive-demo-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'pos-interactive-demo-overlay';
      overlay.style.cssText = 'position:fixed; inset:0; pointer-events:none; z-index:99990; display:none;';
      overlay.innerHTML = `
        <!-- Marco Resaltador Neón con Flecha Direccional -->
        <div id="demo-spotlight-box" style="position:absolute; pointer-events:auto; border:3.5px solid #06b6d4; border-radius:18px; box-shadow:0 0 0 6px rgba(6,182,212,0.35), 0 0 35px rgba(6,182,212,0.85); transition:all 0.25s ease; z-index:99992; display:none; cursor:pointer;" title="Elemento en demostración">
          
          <div id="demo-spotlight-badge" style="position:absolute; top:-30px; left:12px; background:#0f172a; color:#38bdf8; font-family:ui-sans-serif, system-ui, sans-serif; font-size:11px; font-weight:900; padding:3px 12px; border-radius:20px; border:1.5px solid #06b6d4; white-space:nowrap; box-shadow:0 4px 14px rgba(0,0,0,0.6); display:flex; align-items:center; gap:6px;">
            <span id="demo-spotlight-dot" style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#38bdf8; animation:pulse 1.2s infinite;"></span>
            <span id="demo-spotlight-text">Acción en Vivo</span>
          </div>

          <div id="demo-directional-arrow" style="position:absolute; pointer-events:none; z-index:99993; transition:all 0.25s ease;">
            <div id="demo-arrow-inner" style="display:flex; flex-direction:column; align-items:center; filter:drop-shadow(0 6px 14px rgba(0,0,0,0.85));">
              <span id="demo-arrow-label" style="background:#0f172a; color:#f8fafc; font-size:11px; font-weight:900; padding:3px 10px; border-radius:12px; border:1.5px solid #06b6d4; white-space:nowrap; margin-bottom:4px; box-shadow:0 4px 10px rgba(0,0,0,0.5);">
                SEÑALIZACIÓN EN VIVO 👇
              </span>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" style="animation:demoArrowBounce 1s infinite alternate;">
                <path d="M12 3V19M12 19L5 12M12 19L19 12" stroke="#06b6d4" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </div>
        </div>

        <!-- Cuadro de Diálogo Arrastrable (Draggable Dialog) -->
        <div id="demo-dialog-card" style="position:fixed; top:85px; right:25px; pointer-events:auto; width:470px; max-width:92vw; background:#090d16; color:#f8fafc; border:2.5px solid #38bdf8; border-radius:24px; padding:18px 22px; box-shadow:0 25px 60px -10px rgba(0,0,0,0.95); z-index:99995; font-family:ui-sans-serif, system-ui, sans-serif; backdrop-filter:blur(16px);">
          
          <!-- Barra de Progreso de Auto-Avance -->
          <div style="width:100%; height:4px; background:#1e293b; border-radius:4px; margin-bottom:12px; overflow:hidden;">
            <div id="demo-progress-bar" style="width:0%; height:100%; background:linear-gradient(90deg, #38bdf8, #10b981); transition:width 0.1s linear;"></div>
          </div>

          <!-- Barra Superior Arrastrable (Drag Handle) -->
          <div id="demo-drag-handle" style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.12); padding-bottom:8px; cursor:move; user-select:none;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span title="Haz clic y arrastra para mover este cuadro" style="font-size:15px; opacity:0.8; color:#38bdf8;">⠿</span>
              <span id="demo-dialog-module-badge" style="font-size:11px; font-weight:900; text-transform:uppercase; color:#38bdf8; letter-spacing:0.5px;">DEMO AUTOMATIZADA</span>
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
              <button type="button" id="demo-toggle-play-btn" onclick="window.posGuide.toggleAutoPlay()" title="Pausar o reanudar el avance automático" style="background:#0f766e; border:1px solid #14b8a6; color:#ffffff; border-radius:8px; font-size:11px; font-weight:extrabold; cursor:pointer; padding:3px 9px;">⏸ Pausar</button>
              <button type="button" onclick="window.posGuide.resetCardPosition()" title="Mover a la esquina" style="background:#1e293b; border:1px solid #334155; color:#94a3b8; border-radius:8px; font-size:11px; font-weight:bold; cursor:pointer; padding:3px 7px;">📌</button>
              <button type="button" onclick="window.posGuide.openHub()" title="Ver todos los módulos" style="background:#1e293b; border:1px solid #334155; color:#38bdf8; border-radius:8px; font-size:11px; font-weight:bold; cursor:pointer; padding:3px 8px;">☰ Menú</button>
              <button type="button" onclick="window.posGuide.stopDemo()" title="Cerrar Demostración" style="background:rgba(255,255,255,0.08); border:none; color:#94a3b8; width:26px; height:26px; border-radius:8px; font-size:14px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center;">✕</button>
            </div>
          </div>

          <!-- Etiqueta de Faceta -->
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
            <div id="demo-faceta-tag" style="font-size:10px; font-weight:900; text-transform:uppercase; color:#fbbf24; background:rgba(245, 158, 11, 0.15); border:1px solid rgba(245, 158, 11, 0.4); padding:2px 8px; border-radius:10px;">
              FACETA EN TIEMPO REAL
            </div>
            <span style="font-size:9.5px; font-weight:800; color:#10b981; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); padding:2px 8px; border-radius:10px;">
              🔒 MODO SIMULACIÓN (NO GRABA EN BD)
            </span>
          </div>

          <!-- Caja de Secuencia: DÓNDE SE HACE Y QUÉ PASA DESPUÉS -->
          <div style="background:rgba(15, 23, 42, 0.9); border:1.5px solid #334155; border-radius:16px; padding:10px 12px; margin-bottom:10px; display:flex; flex-direction:column; gap:6px;">
            <div style="display:flex; align-items:flex-start; gap:8px;">
              <span style="font-size:16px; color:#10b981;">👉</span>
              <div>
                <span style="font-size:10px; font-weight:900; text-transform:uppercase; color:#10b981; letter-spacing:0.5px;">ACCIÓN EN PANTALLA:</span>
                <p id="demo-donde-ahora" style="font-size:11.5px; font-weight:800; color:#f8fafc; margin:2px 0 0 0; line-height:1.35;"></p>
              </div>
            </div>
            <div style="display:flex; align-items:flex-start; gap:8px; border-top:1px dashed #334155; padding-top:6px;">
              <span style="font-size:16px; color:#38bdf8;">➡️</span>
              <div>
                <span style="font-size:10px; font-weight:900; text-transform:uppercase; color:#38bdf8; letter-spacing:0.5px;">SIGUIENTE PASO:</span>
                <p id="demo-donde-despues" style="font-size:11px; font-weight:700; color:#cbd5e1; margin:2px 0 0 0; line-height:1.35;"></p>
              </div>
            </div>
          </div>

          <!-- Título y Explicación -->
          <h4 id="demo-dialog-title" style="font-size:14.5px; font-weight:900; color:#ffffff; margin:0 0 6px 0; line-height:1.35;"></h4>
          <p id="demo-dialog-message" style="font-size:12px; color:#cbd5e1; line-height:1.55; margin:0 0 12px 0; min-height:44px;"></p>

          <!-- Barra de Navegación Manual -->
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.1);">
            <button type="button" id="demo-btn-prev" onclick="window.posGuide.prevStep()" style="background:#1e293b; color:#94a3b8; border:1px solid #334155; border-radius:12px; padding:7px 14px; font-size:11.5px; font-weight:bold; cursor:pointer;">
              ← Anterior
            </button>
            <div id="demo-step-dots" style="display:flex; align-items:center; gap:4px;"></div>
            <button type="button" id="demo-btn-next" onclick="window.posGuide.nextStep()" style="background:linear-gradient(135deg, #0284c7, #2563eb); color:#ffffff; border:none; border-radius:12px; padding:7px 16px; font-size:11.5px; font-weight:800; cursor:pointer; box-shadow:0 4px 12px rgba(2,132,199,0.35);">
              Siguiente Paso →
            </button>
          </div>
        </div>
      `;

      const styleEl = document.createElement('style');
      styleEl.innerHTML = `
        @keyframes demoArrowBounce {
          0% { transform: translateY(0); }
          100% { transform: translateY(-10px); }
        }
      `;
      document.head.appendChild(styleEl);
      document.body.appendChild(overlay);

      setupDraggableDialog();
    }
  }

  function setupDraggableDialog() {
    const handle = document.getElementById('demo-drag-handle');
    const card = document.getElementById('demo-dialog-card');
    if (!handle || !card) return;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.tagName.toLowerCase() === 'button') return;
      isDragging = true;
      hasUserMovedCard = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = card.getBoundingClientRect();
      cardInitialLeft = rect.left;
      cardInitialTop = rect.top;
      document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      let newLeft = cardInitialLeft + dx;
      let newTop = cardInitialTop + dy;

      newLeft = Math.max(10, Math.min(window.innerWidth - card.offsetWidth - 10, newLeft));
      newTop = Math.max(10, Math.min(window.innerHeight - card.offsetHeight - 10, newTop));

      card.style.left = `${newLeft}px`;
      card.style.top = `${newTop}px`;
      card.style.right = 'auto';
      card.style.bottom = 'auto';
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
      document.body.style.userSelect = '';
    });
  }

  function renderHubCards(filterCat = 'TODOS') {
    const container = document.getElementById('demo-hub-cards-container');
    if (!container) return;

    const moduleKeys = Object.keys(DEMO_MODULES);
    const filtered = moduleKeys.filter(k => {
      if (filterCat === 'TODOS') return true;
      return DEMO_MODULES[k].category === filterCat;
    });

    container.innerHTML = filtered.map(k => {
      const m = DEMO_MODULES[k];
      return `
        <div class="p-4 rounded-2xl border border-slate-200 bg-white hover:border-teal-400 hover:shadow-md transition flex flex-col justify-between space-y-3 cursor-pointer group" onclick="window.posGuide.startModule('${m.id}')">
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="text-2xl p-2 rounded-xl bg-slate-50 border border-slate-100 group-hover:bg-teal-50 transition">${m.icon}</span>
              <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">${m.category}</span>
            </div>
            <h3 class="font-extrabold text-sm text-slate-900 group-hover:text-teal-700 transition">${m.name}</h3>
            <p class="text-[11px] text-slate-500 leading-relaxed">${m.description}</p>
          </div>
          <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-teal-700">
            <span>${m.steps.length} Pasos explicados</span>
            <span class="group-hover:translate-x-1 transition font-black">Iniciar Demostración ➔</span>
          </div>
        </div>
      `;
    }).join('');
  }

  function updateArrowPosition(targetEl, direction, colorTheme) {
    const arrow = document.getElementById('demo-directional-arrow');
    const arrowInner = document.getElementById('demo-arrow-inner');
    const arrowLabel = document.getElementById('demo-arrow-label');
    if (!arrow || !targetEl) return;

    const color = colorTheme || '#06b6d4';

    if (arrowLabel) {
      arrowLabel.style.borderColor = color;
    }

    if (direction === 'bottom') {
      arrow.style.top = '100%';
      arrow.style.bottom = 'auto';
      arrow.style.left = '50%';
      arrow.style.transform = 'translate(-50%, 12px)';
      if (arrowInner) {
        arrowInner.innerHTML = `
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" style="animation:demoArrowBounce 1s infinite alternate;">
            <path d="M12 21V5M12 5L5 12M12 5L19 12" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span style="background:#0f172a; color:#f8fafc; font-size:11px; font-weight:900; padding:3px 10px; border-radius:12px; border:1.5px solid ${color}; white-space:nowrap; margin-top:4px; box-shadow:0 4px 10px rgba(0,0,0,0.5);">
            ACCIÓN AQUÍ 👆
          </span>
        `;
      }
    } else if (direction === 'left') {
      arrow.style.top = '50%';
      arrow.style.bottom = 'auto';
      arrow.style.left = '100%';
      arrow.style.transform = 'translate(12px, -50%)';
      if (arrowInner) {
        arrowInner.style.flexDirection = 'row';
        arrowInner.innerHTML = `
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" style="animation:demoArrowBounce 1s infinite alternate;">
            <path d="M21 12H5M5 12L12 5M5 12L12 19" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span style="background:#0f172a; color:#f8fafc; font-size:11px; font-weight:900; padding:3px 10px; border-radius:12px; border:1.5px solid ${color}; white-space:nowrap; margin-left:4px; box-shadow:0 4px 10px rgba(0,0,0,0.5);">
            ACCIÓN AQUÍ 👈
          </span>
        `;
      }
    } else if (direction === 'right') {
      arrow.style.top = '50%';
      arrow.style.bottom = 'auto';
      arrow.style.left = 'auto';
      arrow.style.right = '100%';
      arrow.style.transform = 'translate(-12px, -50%)';
      if (arrowInner) {
        arrowInner.style.flexDirection = 'row-reverse';
        arrowInner.innerHTML = `
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" style="animation:demoArrowBounce 1s infinite alternate;">
            <path d="M3 12H19M19 12L12 5M19 12L12 19" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span style="background:#0f172a; color:#f8fafc; font-size:11px; font-weight:900; padding:3px 10px; border-radius:12px; border:1.5px solid ${color}; white-space:nowrap; margin-right:4px; box-shadow:0 4px 10px rgba(0,0,0,0.5);">
            ACCIÓN AQUÍ 👉
          </span>
        `;
      }
    } else {
      arrow.style.top = 'auto';
      arrow.style.bottom = '100%';
      arrow.style.left = '50%';
      arrow.style.transform = 'translate(-50%, -12px)';
      if (arrowInner) {
        arrowInner.style.flexDirection = 'column';
        arrowInner.innerHTML = `
          <span style="background:#0f172a; color:#f8fafc; font-size:11px; font-weight:900; padding:3px 10px; border-radius:12px; border:1.5px solid ${color}; white-space:nowrap; margin-bottom:4px; box-shadow:0 4px 10px rgba(0,0,0,0.5);">
            ACCIÓN AQUÍ 👇
          </span>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" style="animation:demoArrowBounce 1s infinite alternate;">
            <path d="M12 3V19M12 19L5 12M12 19L19 12" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        `;
      }
    }
  }

  function startAutoAdvance() {
    clearTimeout(autoAdvanceTimer);
    clearInterval(autoAdvanceProgressTimer);
    if (!isAutoPlaying) return;

    autoAdvanceProgress = 0;
    const progressBar = document.getElementById('demo-progress-bar');
    if (progressBar) progressBar.style.width = '0%';

    const intervalMs = 100;
    const stepIncrement = (intervalMs / stepDurationMs) * 100;

    autoAdvanceProgressTimer = setInterval(() => {
      if (!isAutoPlaying) return;
      autoAdvanceProgress += stepIncrement;
      if (progressBar) progressBar.style.width = `${Math.min(100, autoAdvanceProgress)}%`;
      if (autoAdvanceProgress >= 100) {
        clearInterval(autoAdvanceProgressTimer);
        window.posGuide.nextStep();
      }
    }, intervalMs);
  }

  function renderCurrentStep() {
    clearTimeout(autoAdvanceTimer);
    clearInterval(autoAdvanceProgressTimer);

    const mod = DEMO_MODULES[currentCategory];
    if (!mod) return;

    if (currentStepIndex < 0) currentStepIndex = 0;
    if (currentStepIndex >= mod.steps.length) {
      const keys = Object.keys(DEMO_MODULES);
      const nextIdx = keys.indexOf(currentCategory) + 1;
      if (nextIdx < keys.length) {
        currentCategory = keys[nextIdx];
        currentStepIndex = 0;
        if (typeof showToast === 'function') {
          showToast(`¡Excelente! Pasando al siguiente módulo: ${DEMO_MODULES[currentCategory].name}`);
        }
        renderCurrentStep();
      } else {
        window.posGuide.stopDemo();
        if (typeof showToast === 'function') {
          showToast('🎉 ¡Demostración interactiva completada!', 'success');
        }
      }
      return;
    }

    const step = mod.steps[currentStepIndex];

    // 1. Preparar entorno
    if (typeof step.prepare === 'function') {
      try { step.prepare(); } catch(e){}
    }

    const overlay = document.getElementById('pos-interactive-demo-overlay');
    if (overlay) overlay.style.display = 'block';

    const spotlight = document.getElementById('demo-spotlight-box');
    const badgeText = document.getElementById('demo-spotlight-text');
    const badgeDot = document.getElementById('demo-spotlight-dot');
    const badgeBox = document.getElementById('demo-spotlight-badge');
    const dialog = document.getElementById('demo-dialog-card');
    const titleEl = document.getElementById('demo-dialog-title');
    const msgEl = document.getElementById('demo-dialog-message');
    const facetaEl = document.getElementById('demo-faceta-tag');
    const dondeAhoraEl = document.getElementById('demo-donde-ahora');
    const dondeDespuesEl = document.getElementById('demo-donde-despues');
    const modBadgeEl = document.getElementById('demo-dialog-module-badge');
    const prevBtn = document.getElementById('demo-btn-prev');
    const nextBtn = document.getElementById('demo-btn-next');
    const dotsContainer = document.getElementById('demo-step-dots');

    const themeColor = step.colorTheme || '#06b6d4';

    if (modBadgeEl) modBadgeEl.textContent = `${mod.name} • PASO ${currentStepIndex + 1}/${mod.steps.length}`;
    if (titleEl) titleEl.textContent = step.title;
    if (badgeText) badgeText.textContent = step.badge;
    if (dondeAhoraEl) dondeAhoraEl.textContent = step.dondeDarleAhora || 'Observa la acción resaltada';
    if (dondeDespuesEl) dondeDespuesEl.textContent = step.dondeDarleDespues || 'Avanzando automáticamente...';

    if (facetaEl) {
      if (step.faceta) {
        facetaEl.textContent = step.faceta;
        facetaEl.style.display = 'inline-block';
      } else {
        facetaEl.style.display = 'none';
      }
    }

    if (prevBtn) {
      prevBtn.style.opacity = currentStepIndex === 0 ? '0.4' : '1';
      prevBtn.disabled = currentStepIndex === 0;
    }
    if (nextBtn) {
      nextBtn.textContent = currentStepIndex === mod.steps.length - 1 ? 'Siguiente Módulo ➔' : 'Siguiente Paso →';
    }

    if (dotsContainer) {
      dotsContainer.innerHTML = mod.steps.map((_, i) => {
        const bg = i === currentStepIndex ? '#38bdf8' : (i < currentStepIndex ? '#10b981' : '#475569');
        return `<span style="width:7px; height:7px; border-radius:50%; background:${bg};"></span>`;
      }).join('');
    }

    if (msgEl) {
      if (typewriterTimer) clearInterval(typewriterTimer);
      msgEl.textContent = '';
      let charIndex = 0;
      typewriterTimer = setInterval(() => {
        if (charIndex < step.explanation.length) {
          msgEl.textContent += step.explanation.charAt(charIndex);
          charIndex++;
        } else {
          clearInterval(typewriterTimer);
        }
      }, 12);
    }

    // Posicionamiento dinámico del spotlight y flecha direccional (Con protección anti-cajas vacías)
    const rawTargetEl = document.querySelector(step.selector);
    const isVisible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' &&
             (rect.width > 2 || rect.height > 2 || el.getClientRects().length > 0);
    };

    const targetEl = isVisible(rawTargetEl) ? rawTargetEl : null;
    if (targetEl && spotlight) {
      try { targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(e){}

      setTimeout(() => {
        const rect = targetEl.getBoundingClientRect();
        const pad = 6;
        spotlight.style.display = 'block';
        spotlight.style.borderColor = themeColor;
        spotlight.style.boxShadow = `0 0 0 5px ${themeColor}44, 0 0 35px ${themeColor}aa`;
        spotlight.style.top = `${window.scrollY + rect.top - pad}px`;
        spotlight.style.left = `${window.scrollX + rect.left - pad}px`;
        spotlight.style.width = `${Math.max(60, rect.width + pad * 2)}px`;
        spotlight.style.height = `${Math.max(38, rect.height + pad * 2)}px`;

        if (badgeBox) badgeBox.style.borderColor = themeColor;
        if (badgeText) badgeText.style.color = themeColor;
        if (badgeDot) badgeDot.style.background = themeColor;

        updateArrowPosition(targetEl, step.arrowDirection || 'top', themeColor);
        if (typeof window.farmaFlyAndPoint === 'function') {
          window.farmaFlyAndPoint(targetEl, step.title || step.description || '', step.actionPrompt || null);
        } else if (typeof window.moverFarmaHacia === 'function') {
          window.moverFarmaHacia(targetEl, step.title || '');
        }

        // Reposicionar tarjeta si no ha sido movida por el usuario
        if (!hasUserMovedCard && dialog) {
          let top = 85;
          let left = window.innerWidth - 500;

          if (rect.left > window.innerWidth / 2) {
            left = 25;
          }

          dialog.style.top = `${Math.max(15, top)}px`;
          dialog.style.left = `${Math.max(15, left)}px`;
          dialog.style.right = 'auto';
          dialog.style.bottom = 'auto';
        }

        // Ejecutar acción en tiempo real automáticamente después de 300ms
        setTimeout(() => {
          if (typeof step.executeAction === 'function') {
            step.executeAction(() => {
              // Iniciar temporizador de avance automático una vez ejecutada la acción
              startAutoAdvance();
            });
          } else {
            startAutoAdvance();
          }
        }, 350);

      }, 180);
    } else {
      if (spotlight) spotlight.style.display = 'none';
      setTimeout(() => {
        if (typeof step.executeAction === 'function') {
          step.executeAction(() => startAutoAdvance());
        } else {
          startAutoAdvance();
        }
      }, 350);
    }
  }

  // ===========================================================================
  // API GLOBAL WINDOW.POSGUIDE
  // ===========================================================================
  window.posGuide = {
    openHub: function () {
      injectDemoModalAndOverlay();
      const hub = document.getElementById('pos-interactive-demo-hub-modal');
      if (hub) {
        hub.classList.remove('hidden');
        renderHubCards('TODOS');
      }
    },

    closeHub: function () {
      const hub = document.getElementById('pos-interactive-demo-hub-modal');
      if (hub) hub.classList.add('hidden');
    },

    filterHub: function (cat) {
      const btns = document.querySelectorAll('.demo-cat-btn');
      btns.forEach(b => {
        if (b.textContent.trim() === cat || (cat === 'TODOS' && b.textContent.trim() === 'Todas las Funciones')) {
          b.className = 'demo-cat-btn px-3 py-1.5 rounded-xl font-black bg-slate-900 text-white transition';
        } else {
          b.className = 'demo-cat-btn px-3 py-1.5 rounded-xl font-bold bg-white text-slate-700 border border-slate-200 hover:bg-teal-50 transition';
        }
      });
      renderHubCards(cat);
    },

    startModule: function (modId) {
      if (!DEMO_MODULES[modId]) modId = 'pos';
      currentCategory = modId;
      currentStepIndex = 0;
      isDemoRunning = true;
      isAutoPlaying = true;
      this.closeHub();
      injectDemoModalAndOverlay();
      this.updatePlayBtnText();
      renderCurrentStep();
    },

    startFullTour: function () {
      this.startModule('pos');
    },

    startScenario: function (scenarioName) {
      if (scenarioName && DEMO_MODULES[scenarioName]) {
        this.startModule(scenarioName);
      } else {
        this.openHub();
      }
    },

    toggleAutoPlay: function () {
      isAutoPlaying = !isAutoPlaying;
      this.updatePlayBtnText();
      if (isAutoPlaying) {
        startAutoAdvance();
      } else {
        clearTimeout(autoAdvanceTimer);
        clearInterval(autoAdvanceProgressTimer);
        const progressBar = document.getElementById('demo-progress-bar');
        if (progressBar) progressBar.style.width = '0%';
      }
    },

    updatePlayBtnText: function () {
      const btn = document.getElementById('demo-toggle-play-btn');
      if (btn) {
        if (isAutoPlaying) {
          btn.textContent = '⏸ Pausar';
          btn.style.background = '#0f766e';
          btn.style.borderColor = '#14b8a6';
        } else {
          btn.textContent = '▶ Reanudar';
          btn.style.background = '#0284c7';
          btn.style.borderColor = '#38bdf8';
        }
      }
    },

    nextStep: function () {
      currentStepIndex++;
      renderCurrentStep();
    },

    prevStep: function () {
      if (currentStepIndex > 0) {
        currentStepIndex--;
        renderCurrentStep();
      }
    },

    resetCardPosition: function () {
      hasUserMovedCard = false;
      const card = document.getElementById('demo-dialog-card');
      if (card) {
        card.style.top = '85px';
        card.style.right = '25px';
        card.style.left = 'auto';
        card.style.bottom = 'auto';
      }
    },

    stopDemo: function () {
      isDemoRunning = false;
      isAutoPlaying = false;
      clearTimeout(autoAdvanceTimer);
      clearInterval(autoAdvanceProgressTimer);
      if (typewriterTimer) clearInterval(typewriterTimer);
      if (keystrokeTimer) clearInterval(keystrokeTimer);
      const overlay = document.getElementById('pos-interactive-demo-overlay');
      if (overlay) overlay.style.display = 'none';
      const spotlight = document.getElementById('demo-spotlight-box');
      if (spotlight) spotlight.style.display = 'none';
      resetAllModals();
    },

    toggleMenu: function () {
      this.openHub();
    },

    advanceNextFlow: function () {
      this.nextStep();
    },

    notifyEvent: function (evento) {
      if (evento === 'iniciar_guia') this.openHub();
      else if (evento === 'venta_completada') this.stopDemo();
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    injectDemoModalAndOverlay();
  });
})();
