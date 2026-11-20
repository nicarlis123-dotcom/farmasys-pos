
/* =========================================================================
   CONTROLADOR DE PANTALLA DE CARGA FARMASYS (SEGURO Y SIN BLOQUEOS)
   ========================================================================= */
let farmasysSlowTimer = null;
let farmasysSlowStageTimer = null;

function showFarmasysLoader(title = "Cargando FarmaSys...", sub = "Un momento por favor...") {
  const el = document.getElementById('farmasys-global-loader');
  if (el) {
    const tEl = document.getElementById('farmasys-loader-title');
    const sEl = document.getElementById('farmasys-loader-sub');
    const slowNotice = document.getElementById('farmasys-slow-notice');
    const slowMsg = document.getElementById('farmasys-slow-msg');

    if (tEl) tEl.textContent = title;
    if (sEl) sEl.textContent = sub;
    if (slowNotice) slowNotice.classList.add('hidden');
    el.classList.remove('farmasys-is-slow');

    el.style.display = 'flex';
    el.style.pointerEvents = 'auto';
    el.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
    el.classList.add('opacity-100');

    clearTimeout(farmasysSlowTimer);
    clearTimeout(farmasysSlowStageTimer);
    farmasysSlowTimer = setTimeout(() => {
      if (el && !el.classList.contains('hidden') && !el.classList.contains('opacity-0')) {
        el.classList.add('farmasys-is-slow');
        if (slowNotice) slowNotice.classList.remove('hidden');
        if (slowMsg) slowMsg.textContent = "Sincronizando módulos e inventario seguro...";
        
        farmasysSlowStageTimer = setTimeout(() => {
          if (slowMsg && el && !el.classList.contains('hidden')) {
            slowMsg.textContent = "Optimizando respuestas y bases de datos...";
          }
        }, 3000);
      }
    }, 2500);
  }
}

function hideFarmasysLoader() {
  clearTimeout(farmasysSlowTimer);
  clearTimeout(farmasysSlowStageTimer);
  const el = document.getElementById('farmasys-global-loader');
  if (el) {
    el.style.pointerEvents = 'none';
    el.classList.add('opacity-0', 'pointer-events-none');
    el.classList.remove('opacity-100', 'farmasys-is-slow');
    const slowNotice = document.getElementById('farmasys-slow-notice');
    if (slowNotice) slowNotice.classList.add('hidden');
    setTimeout(() => {
      el.style.display = 'none';
      el.classList.add('hidden');
    }, 250);
  }
}

// Asegurar desbloqueo inmediato al arrancar
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hideFarmasysLoader);
} else {
  hideFarmasysLoader();
}
window.addEventListener('load', hideFarmasysLoader);

window.addEventListener('load', () => {
  setTimeout(hideFarmasysLoader, 450);
});

/**
 * Lógica Frontend Reactiva Omnicanal — Farmacia Davalsi (República Dominicana RD$)
 * Conecta App Móvil Paciente, POS de Mostrador, Backoffice e Integración WhatsApp Business API.
 */

const state = {
  activePharmacyId: 1,
  pharmacies: [],
  patientOrders: [],
  promotionalKits: [],
  activeModule: 'app',
  products: [],
  filteredProducts: [],
  selectedSymptom: 'todos',
  searchQuery: '',
  // Selección activa de presentación en cada tarjeta de producto: { [productId]: 'CAJA' | 'BLISTER' | 'UNIDAD' }
  cardPresentationSelection: {},
  // Carrito de la App Paciente: Array de { product, presentacion, cantidad }
  appCart: [],
  appPaymentMethod: 'EFECTIVO',
  appDeliveryMode: 'DOMICILIO',
  pharmacyConfig: {
    pago_tarjeta_activo: true,
    envio_domicilio_activo: true,
    seguro_medico_activo: true,
  },
  uploadedPrescriptionUrl: null,
  // Carrito del POS Físico: Array de { product, presentacion, cantidad }
  posCart: [],
  transactions: [],
  dashboardMetrics: null,
  whatsappLogs: [],
  whatsappConfig: {},
  activeReviewOrderId: null,
};

function getActiveAppPharmacyId() {
  const fid = parseInt(state.activePharmacyId, 10);
  return (!isNaN(fid) && fid > 0) ? fid : 1;
}

async function initAppPharmacies() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const paramFid = parseInt(urlParams.get('farmacia_id') || urlParams.get('farmacia') || '', 10);
    const paramCode = (urlParams.get('codigo') || '').trim().toUpperCase();
    const savedFid = parseInt(localStorage.getItem('farmasys_app_pharmacy_id') || '', 10);

    const res = await fetch('/api/pharmacies');
    const data = await res.json();
    const list = (data && data.ok && Array.isArray(data.pharmacies)) ? data.pharmacies : [];
    state.pharmacies = list;

    let chosen = null;
    if (!isNaN(paramFid) && paramFid > 0) {
      chosen = list.find((p) => Number(p.id) === paramFid) || null;
    }
    if (!chosen && paramCode) {
      chosen = list.find((p) => String(p.codigo || '').toUpperCase() === paramCode) || null;
    }
    if (!chosen && !isNaN(savedFid) && savedFid > 0) {
      chosen = list.find((p) => Number(p.id) === savedFid) || null;
    }
    if (!chosen && list.length > 0) {
      chosen = list[0];
    }

    if (chosen) {
      state.activePharmacyId = Number(chosen.id);
      localStorage.setItem('farmasys_app_pharmacy_id', String(state.activePharmacyId));
    } else if (!isNaN(paramFid) && paramFid > 0) {
      state.activePharmacyId = paramFid;
    }

    const selWrap = document.getElementById('app-pharmacy-selector-wrap');
    const sel = document.getElementById('app-pharmacy-select');
    const hasExplicitTarget = (!isNaN(paramFid) && paramFid > 0) || Boolean(paramCode);
    if (selWrap) {
      if (list.length > 1 && !hasExplicitTarget) {
        selWrap.classList.remove('hidden');
        selWrap.classList.add('flex');
      } else {
        selWrap.classList.add('hidden');
        selWrap.classList.remove('flex');
      }
    }
    if (sel) {
      if (list.length === 0) {
        sel.innerHTML = '<option value="1" class="bg-slate-900 text-white">Sin farmacias registradas</option>';
      } else {
        sel.innerHTML = list.map((p) => {
          const label = p.ciudad_sector ? `${p.nombre} (${p.ciudad_sector})` : p.nombre;
          return `<option value="${p.id}" class="bg-slate-900 text-white">${label}</option>`;
        }).join('');
        sel.value = String(getActiveAppPharmacyId());
      }
    }
  } catch (e) {
    console.warn('Error cargando farmacias en App:', e);
  }
}

async function onAppPharmacyChange(newVal) {
  const newFid = parseInt(newVal, 10);
  if (isNaN(newFid) || newFid <= 0 || newFid === getActiveAppPharmacyId()) return;
  saveAppCartToStorage();
  state.activePharmacyId = newFid;
  localStorage.setItem('farmasys_app_pharmacy_id', String(newFid));

  loadAppCartFromStorage();
  renderCartDrawerItems();
  const ph = (state.pharmacies || []).find((p) => Number(p.id) === newFid);
  if (ph) showToast(`Farmacia seleccionada: ${ph.nombre}`, 'success');

  try {
    const url = new URL(window.location.href);
    url.searchParams.set('farmacia_id', String(newFid));
    window.history.replaceState({}, '', url.toString());
  } catch (e) {}

  await fetchAndApplyLivePharmacyConfig();
  await refreshAllData();
  refreshActiveOrderBanner();
}

function formatRD(amount) {
  const num = Number(amount || 0);
  return `RD$ ${num.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  const bg =
    type === 'error'
      ? 'bg-rose-600 text-white'
      : type === 'warning'
      ? 'bg-amber-500 text-slate-950'
      : 'bg-slate-900 text-white border border-teal-500/40';
  el.className = `pointer-events-auto px-4 py-3 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 transition transform ${bg}`;
  el.innerHTML = `<span>${type === 'error' ? '⚠️' : type === 'warning' ? '🔔' : '✅'}</span><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 4200);
}

/**
 * Cálculo local espejo del Motor Matemático de Empaques del Backend
 */
function calcMinUnits(product, presentacion, cantidad) {
  const qty = Math.max(1, parseInt(cantidad, 10) || 1);
  const uBlister = product.unidades_por_blister;
  const uCaja = product.inventario.unidades_por_caja;
  if (presentacion === 'CAJA') return qty * uCaja;
  if (presentacion === 'BLISTER') return qty * uBlister;
  return qty;
}

function getPresentationLabel(product, presentacion) {
  const uName = product.unidad_minima_nombre || 'Unidad';
  if (presentacion === 'CAJA') {
    return `Caja (${product.blisters_por_caja} Blíst. / ${product.inventario.unidades_por_caja} ${uName}s)`;
  }
  if (presentacion === 'BLISTER') {
    return `Blíster (${product.unidades_por_blister} ${uName}s)`;
  }
  return `Unidad Suelta (1 ${uName})`;
}

/**
 * Conmutador de módulos (App Paciente | POS Mostrador | Backoffice | WhatsApp API)
 */
function switchModule(mod) {
  state.activeModule = mod;
  ['app', 'pos', 'backoffice', 'whatsapp'].forEach((m) => {
    const sec = document.getElementById(`module-${m}`);
    const btn = document.getElementById(`tab-btn-${m}`);
    if (m === mod) {
      sec.classList.remove('hidden');
      btn.className =
        'module-tab-btn px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 bg-teal-600 text-white shadow';
    } else {
      sec.classList.add('hidden');
      btn.className =
        'module-tab-btn px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 text-slate-300 hover:text-white';
    }
  });

  const floatingBar = document.getElementById('floating-cart-bar');
  if (mod === 'app') {
    floatingBar.classList.remove('hidden');
  } else {
    floatingBar.classList.add('hidden');
  }

  refreshAllData();
}

/**
 * Carga integral de datos desde el Backend Python
 */
async function refreshAllData() {
  await Promise.all([
    loadProducts(),
    loadDashboardMetrics(),
    loadTransactions(),
    loadWhatsAppLogs(),
    loadPromotionalKits(),
  ]);
}

async function loadProducts() {
  const fid = getActiveAppPharmacyId();
  const params = new URLSearchParams();
  params.set('farmacia_id', String(fid));
  if (state.searchQuery) params.set('search', state.searchQuery);
  if (state.selectedSymptom && state.selectedSymptom !== 'todos' && state.selectedSymptom !== 'favoritos') {
    params.set('symptom', state.selectedSymptom);
  }

  try {
    const res = await fetch(`/api/products?${params.toString()}`);
    const data = await res.json();
    if (data.ok) {
      if (data.pharmacy_config) {
        applyPatientAppServiceConfig(data.pharmacy_config);
      }
      // También guardamos el catálogo completo si no hay filtro para el POS y Backoffice
      if (!state.searchQuery && state.selectedSymptom === 'todos') {
        state.products = data.products;
      } else {
        const fullRes = await fetch(`/api/products?farmacia_id=${fid}`);
        const fullData = await fullRes.json();
        if (fullData.ok) state.products = fullData.products;
      }
      state.filteredProducts = state.selectedSymptom === 'favoritos'
        ? (data.products || []).filter((p) => isAppFavorite(p.id))
        : data.products;
      renderAppProductsGrid();
      renderPosQuickBarcodes();
      renderBackofficeInventory();
    }
  } catch (err) {
    const grid = document.getElementById('app-products-grid');
    if (grid) {
      grid.innerHTML = `
        <div class="col-span-full bg-white rounded-2xl p-8 text-center border border-rose-200 space-y-3">
          <p class="text-base font-extrabold text-rose-800">No pudimos conectar con el catálogo de esta farmacia.</p>
          <p class="text-xs text-slate-600">Verifica tu conexión a internet e intenta recargar para ver los precios y disponibilidad reales.</p>
          <button type="button" onclick="loadProducts()" class="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold cursor-pointer">
            🔄 Reintentar
          </button>
        </div>
      `;
    }
  }
}

async function loadDashboardMetrics() {
  const res = await fetch(`/api/dashboard?farmacia_id=${getActiveAppPharmacyId()}`);
  const data = await res.json();
  if (!data.ok) return;
  const m = data.metrics;
  state.dashboardMetrics = m;

  // Badges en navegación superior
  const badgePending = document.getElementById('badge-pending-orders');
  if (m.pedidos_web_pendientes > 0) {
    badgePending.textContent = m.pedidos_web_pendientes;
    badgePending.classList.remove('hidden');
  } else {
    badgePending.classList.add('hidden');
  }

  const badgeLowStock = document.getElementById('badge-low-stock');
  if (m.alertas_stock_bajo_count > 0) {
    badgeLowStock.textContent = m.alertas_stock_bajo_count;
    badgeLowStock.classList.remove('hidden');
  } else {
    badgeLowStock.classList.add('hidden');
  }

  document.getElementById('badge-wa-logs').textContent = m.total_whatsapp_logs;

  // KPIs en Backoffice
  document.getElementById('kpi-total-units').textContent = `${m.total_unidades_minimas_stock.toLocaleString('es-DO')} unid.`;
  document.getElementById('kpi-total-sales').textContent = formatRD(m.ventas_totales_rd);
  document.getElementById('kpi-sales-split').textContent = `POS: ${formatRD(m.ventas_pos_rd)} | App: ${formatRD(m.ventas_app_rd)}`;
  document.getElementById('kpi-low-stock-count').textContent = `${m.alertas_stock_bajo_count} en alerta`;

  // Banner de alertas de stock bajo
  const banner = document.getElementById('low-stock-banner');
  const listEl = document.getElementById('low-stock-items-list');
  if (m.alertas_stock_bajo_count > 0) {
    banner.classList.remove('hidden');
    listEl.innerHTML = m.alertas_stock_bajo_items
      .map(
        (p) => `
        <div class="bg-white p-3 rounded-xl border border-rose-300 flex items-center justify-between gap-2 shadow-xs">
          <div>
            <p class="text-xs font-extrabold text-slate-900">${p.nombre_comercial}</p>
            <p class="text-[11px] text-rose-700 font-bold">
              Quedan ${p.inventario.stock_total_unidades} ${p.unidad_minima_nombre}s (Mínimo: ${p.inventario.stock_minimo_alerta})
            </p>
            <p class="text-[10px] text-slate-500">${p.inventario.desglose_fisico.texto}</p>
          </div>
          <button onclick="openReplenishModal(${p.id})" class="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] shrink-0">
            + Abastecer
          </button>
        </div>
      `
      )
      .join('');
  } else {
    banner.classList.add('hidden');
  }
}

/* =========================================================================
   MÓDULO 1: APP CLIENTE (BÚSQUEDA, SÍNTOMAS, TARJETAS CON SELECTOR Y CARRITO)
   ========================================================================= */

function handleAppSearch() {
  const input = document.getElementById('app-search-input');
  state.searchQuery = input.value.trim();
  const clearBtn = document.getElementById('btn-clear-search');
  if (state.searchQuery) clearBtn.classList.remove('hidden');
  else clearBtn.classList.add('hidden');
  loadProducts();
  triggerAppAiSubstituteHelper(state.searchQuery);
}

function clearAppSearch() {
  document.getElementById('app-search-input').value = '';
  state.searchQuery = '';
  document.getElementById('btn-clear-search').classList.add('hidden');
  const box = document.getElementById('app-ai-substitute-box');
  if (box) box.classList.add('hidden');
  loadProducts();
}

function selectSymptom(symptom) {
  state.selectedSymptom = symptom;
  document.querySelectorAll('.symptom-pill').forEach((btn) => {
    const s = btn.getAttribute('data-symptom');
    if (s === symptom) {
      btn.className =
        'symptom-pill shrink-0 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold border transition flex items-center gap-2 bg-teal-600 text-white border-teal-600 shadow-sm';
    } else {
      btn.className =
        'symptom-pill shrink-0 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold border transition flex items-center gap-2 bg-slate-50 text-slate-700 border-slate-200 hover:border-teal-400';
    }
  });
  loadProducts();
}

function selectCardPresentation(productId, presentacion) {
  state.cardPresentationSelection[productId] = presentacion;
  renderAppProductsGrid();
}

function renderAppProductsGrid() {
  const grid = document.getElementById('app-products-grid');
  if (!state.filteredProducts.length) {
    if (state.selectedSymptom === 'favoritos') {
      grid.innerHTML = `
        <div class="col-span-full bg-white rounded-2xl p-8 text-center border border-amber-200 space-y-2">
          <div class="text-3xl">⭐</div>
          <p class="text-base font-extrabold text-slate-800">Aún no tienes medicamentos favoritos en esta farmacia.</p>
          <p class="text-xs text-slate-500 max-w-md mx-auto">Toca la estrella <strong>☆</strong> en cualquier medicamento del catálogo para guardarlo aquí y comprarlo más rápido cada mes.</p>
          <button type="button" onclick="selectSymptom('todos')" class="mt-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold cursor-pointer">
            Explorar catálogo completo
          </button>
        </div>
      `;
      return;
    }
    if (!state.products.length && !state.searchQuery && state.selectedSymptom === 'todos') {
      const phName = (state.pharmacyConfig && state.pharmacyConfig.nombre) || 'esta farmacia';
      grid.innerHTML = `
        <div class="col-span-full bg-white rounded-2xl p-8 text-center border border-slate-200 space-y-2">
          <div class="text-3xl">🏥</div>
          <p class="text-base font-extrabold text-slate-800">${phName} aún no tiene medicamentos publicados en su catálogo.</p>
          <p class="text-xs text-slate-500 max-w-md mx-auto">Cuando la farmacia agregue sus productos en el sistema, aparecerán aquí automáticamente con su stock y precios reales.</p>
        </div>
      `;
      return;
    }
    const qEsc = escapeJsQuotes(state.searchQuery || '');
    grid.innerHTML = `
      <div class="col-span-full bg-white rounded-2xl p-8 text-center border border-slate-200 space-y-3">
        <p class="text-base font-extrabold text-slate-800">No encontramos ese nombre comercial exacto en el catálogo.</p>
        <p class="text-xs text-slate-600 max-w-lg mx-auto">💡 <strong>Consejo de búsqueda:</strong> Si no encuentras el medicamento que buscas, nuestra Inteligencia Artificial te recomienda los medicamentos disponibles con el <strong>mismo Principio Activo</strong>.</p>
        <div class="flex flex-wrap items-center justify-center gap-2 pt-1">
          ${state.searchQuery ? `
            <button type="button" onclick="openAppAiAssistantModal('principio', '${qEsc}')" class="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black shadow-sm cursor-pointer">
              🤖 Buscar Equivalente por Principio Activo para "${state.searchQuery}"
            </button>
          ` : ''}
          <button type="button" onclick="selectSymptom('todos'); clearAppSearch();" class="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer">
            Mostrar todo el catálogo
          </button>
        </div>
      </div>
    `;
    return;
  }

  grid.innerHTML = state.filteredProducts
    .map((p) => {
      const pres = state.cardPresentationSelection[p.id] || 'CAJA';
      const priceSelected = p.precios_presentacion[pres];
      const inv = p.inventario;
      const minUnitsNeeded = calcMinUnits(p, pres, 1);
      const canBuySelected = inv.stock_total_unidades >= minUnitsNeeded;

      const rxBadge = p.requiere_receta
        ? `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">🩺 Requiere Receta</span>`
        : `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Venta Libre</span>`;

      const stockStatusBadge = inv.alerta_stock_bajo
        ? `<span class="text-[10px] font-extrabold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">¡Últimas ${inv.stock_total_unidades} unid.!</span>`
        : `<span class="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">${inv.stock_total_unidades} ${p.unidad_minima_nombre}s disp.</span>`;

      return `
        <div class="bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition border border-slate-200/90 flex flex-col justify-between space-y-3">
          <div>
            <!-- Encabezado de tarjeta -->
            <div class="flex items-center justify-between gap-1 mb-2">
              <div class="flex items-center gap-1 flex-wrap">
                ${rxBadge}
                ${stockStatusBadge}
              </div>
              <button
                type="button"
                onclick="toggleAppFavorite(${p.id})"
                title="${isAppFavorite(p.id) ? 'Quitar de favoritos' : 'Guardar en Mis Favoritos'}"
                class="w-7 h-7 rounded-full flex items-center justify-center border transition cursor-pointer shrink-0 ${isAppFavorite(p.id) ? 'bg-amber-100 border-amber-400 text-amber-600' : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-amber-500 hover:border-amber-300'}"
              >
                ${isAppFavorite(p.id) ? '⭐' : '☆'}
              </button>
            </div>

            <h3 class="text-sm sm:text-base font-extrabold text-slate-900 leading-snug">${p.nombre_comercial}</h3>
            <p class="text-xs font-semibold text-teal-700">${p.principio_activo} • ${p.concentracion}</p>
            ${p.principio_activo ? `
              <button 
                type="button" 
                onclick="openAppSubstitutesModal(${p.id}, '${escapeQuote(p.nombre_comercial)}', '${escapeQuote(p.principio_activo)}')" 
                class="mt-1 text-[11px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-lg transition inline-flex items-center gap-1 cursor-pointer"
                title="Ver medicamentos genéricos o de menor precio con el mismo principio activo"
              >
                <span>💡</span> <span>Ver alternativas y ahorro</span>
              </button>
            ` : ''}
            <p class="text-[11px] text-slate-400 mt-0.5">${p.laboratorio} • ${p.categoria}</p>

            <!-- Caja de equivalencia de stock en tiempo real -->
            <div class="mt-2.5 p-2 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 flex items-center justify-between">
              <span>📦 <strong>${inv.cajas_disponibles}</strong> Cajas</span>
              <span>•</span>
              <span>💊 <strong>${inv.blisters_disponibles}</strong> Blíst.</span>
              <span>•</span>
              <span>🔹 <strong>${inv.stock_total_unidades}</strong> Unid.</span>
            </div>

            <!-- Selector de Presentación Dinámico (Caja / Blíster / Unidad) -->
            <div class="mt-3">
              <p class="text-[10px] font-extrabold uppercase text-slate-400 mb-1.5">Selecciona Presentación:</p>
              <div class="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onclick="selectCardPresentation(${p.id}, 'CAJA')"
                  class="py-2 px-1.5 rounded-xl border text-center transition ${
                    pres === 'CAJA'
                      ? 'bg-teal-600 text-white border-teal-600 font-extrabold shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-teal-300 font-semibold'
                  }"
                >
                  <div class="text-[11px]">📦 Caja</div>
                  <div class="text-[9px] opacity-85">${inv.unidades_por_caja} ${p.unidad_minima_nombre}s</div>
                </button>
                <button
                  type="button"
                  onclick="selectCardPresentation(${p.id}, 'BLISTER')"
                  class="py-2 px-1.5 rounded-xl border text-center transition ${
                    pres === 'BLISTER'
                      ? 'bg-teal-600 text-white border-teal-600 font-extrabold shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-teal-300 font-semibold'
                  }"
                >
                  <div class="text-[11px]">💊 Blíster</div>
                  <div class="text-[9px] opacity-85">${p.unidades_por_blister} ${p.unidad_minima_nombre}s</div>
                </button>
                <button
                  type="button"
                  onclick="selectCardPresentation(${p.id}, 'UNIDAD')"
                  class="py-2 px-1.5 rounded-xl border text-center transition ${
                    pres === 'UNIDAD'
                      ? 'bg-teal-600 text-white border-teal-600 font-extrabold shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-teal-300 font-semibold'
                  }"
                >
                  <div class="text-[11px]">🔹 Unidad</div>
                  <div class="text-[9px] opacity-85">1 ${p.unidad_minima_nombre}</div>
                </button>
              </div>
            </div>
          </div>

          <!-- Precio ajustado dinámicamente y botón de compra -->
          <div class="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
            <div>
              <span class="block text-[10px] font-bold text-slate-400 uppercase">Precio ${pres}</span>
              <span class="text-lg font-extrabold text-slate-900">${formatRD(priceSelected)}</span>
              <span class="block text-[10px] text-teal-700 font-semibold">Descuenta ${minUnitsNeeded} ${p.unidad_minima_nombre}(s)</span>
            </div>
            <button
              type="button"
              onclick="addToAppCart(${p.id})"
              ${!canBuySelected ? 'disabled' : ''}
              class="px-4 py-2.5 rounded-xl font-extrabold text-xs transition shadow-sm ${
                canBuySelected
                  ? 'bg-slate-900 hover:bg-teal-600 text-white'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }"
            >
              ${canBuySelected ? '+ Agregar' : 'Sin Stock'}
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

function addToAppCart(productId) {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;

  // Verificación de alergias registradas por el paciente
  const allergyHit = checkAppAllergyConflict(product);
  if (allergyHit) {
    const okAllergy = confirm(`⚠️ ALERTA DE ALERGIA:\n\nRegistraste alergia a "${allergyHit}".\n"${product.nombre_comercial}" (${product.principio_activo || ''}) puede ser incompatible.\n\n¿Deseas agregarlo de todos modos?`);
    if (!okAllergy) return;
  }

  // Verificación de duplicidad farmacológica en la app del paciente
  const paNew = (product.principio_activo || '').trim().toLowerCase();
  if (paNew) {
    const duplicate = state.appCart.find(i => {
      if (i.product.id === productId) return false;
      const paExist = (i.product.principio_activo || '').trim().toLowerCase();
      return paExist && (paNew === paExist || paNew.includes(paExist) || paExist.includes(paNew));
    });
    if (duplicate) {
      const ok = confirm(`⚠️ Aviso Farmacéutico:\n\nYa tienes '${duplicate.product.nombre_comercial}' en tu carrito con el mismo principio activo (${product.principio_activo}).\n\n¿Deseas agregar '${product.nombre_comercial}' de todos modos?`);
      if (!ok) return;
    }
  }

  const pres = state.cardPresentationSelection[productId] || 'CAJA';

  // Verificar cuántas unidades mínimas ya están comprometidas en el carrito para este producto
  const currentCommittedUnits = state.appCart
    .filter((i) => i.product.id === productId)
    .reduce((acc, i) => acc + calcMinUnits(product, i.presentacion, i.cantidad), 0);

  const unitsToAdd = calcMinUnits(product, pres, 1);
  if (currentCommittedUnits + unitsToAdd > product.inventario.stock_total_unidades) {
    showToast(
      `Stock insuficiente en unidades mínimas. Disponibles: ${product.inventario.stock_total_unidades} ${product.unidad_minima_nombre}s.`,
      'error'
    );
    return;
  }

  const existing = state.appCart.find(
    (item) => item.product.id === productId && item.presentacion === pres
  );
  if (existing) {
    existing.cantidad += 1;
  } else {
    state.appCart.push({
      product,
      presentacion: pres,
      cantidad: 1,
    });
  }

  updateFloatingCartUI();
  showToast(`Agregado: 1 ${pres} de ${product.nombre_comercial} (${unitsToAdd} unid. mín.)`);
}

function updateAppCartQty(index, delta) {
  const item = state.appCart[index];
  if (!item) return;
  const newQty = item.cantidad + delta;
  if (newQty <= 0) {
    state.appCart.splice(index, 1);
  } else {
    const product = state.products.find((p) => p.id === item.product.id) || item.product;
    const otherUnits = state.appCart
      .filter((it, idx) => idx !== index && it.product.id === product.id)
      .reduce((acc, it) => acc + calcMinUnits(product, it.presentacion, it.cantidad), 0);
    const needed = calcMinUnits(product, item.presentacion, newQty);
    if (otherUnits + needed > product.inventario.stock_total_unidades) {
      showToast(`No hay suficientes unidades físicas (${product.inventario.stock_total_unidades} disp.).`, 'error');
      return;
    }
    item.cantidad = newQty;
  }
  updateFloatingCartUI();
  renderCartDrawerItems();
}

function updateFloatingCartUI() {
  const totalItems = state.appCart.reduce((acc, i) => acc + i.cantidad, 0);
  const totalUnits = state.appCart.reduce(
    (acc, i) => acc + (i.es_kit ? (i.items_desglose ? i.items_desglose.length * i.cantidad : i.cantidad) : calcMinUnits(i.product, i.presentacion, i.cantidad)),
    0
  );
  const totalRD = state.appCart.reduce(
    (acc, i) => acc + (i.es_kit ? i.precio_oferta * i.cantidad : (i.product.precios_presentacion[i.presentacion] || i.product.precio_base) * i.cantidad),
    0
  );

  const countEl = document.getElementById('floating-cart-count');
  if (countEl) countEl.textContent = totalItems;
  const totalEl = document.getElementById('floating-cart-total');
  if (totalEl) totalEl.textContent = formatRD(totalRD);
  const subEl = document.getElementById('floating-cart-subtitle');
  if (subEl) {
    subEl.textContent =
      totalItems > 0
        ? `${totalItems} artículo(s) • Total: ${formatRD(totalRD)}`
        : 'Agrega medicamentos por Caja, Blíster o Kits en 1 Clic';
  }
  const hdrCount = document.getElementById('app-cart-count');
  if (hdrCount) hdrCount.textContent = totalItems;
  const hdrText = document.getElementById('app-cart-badge-text');
  if (hdrText) hdrText.textContent = formatRD(totalRD);

  saveAppCartToStorage();
}

function getAppCartStorageKey(fidOverride = null) {
  const fid = fidOverride || getActiveAppPharmacyId();
  return `farmasys_app_cart_${fid}`;
}

function saveAppCartToStorage() {
  try {
    const key = getAppCartStorageKey();
    if (!state.appCart || state.appCart.length === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(state.appCart));
    }
  } catch (e) {}
}

function loadAppCartFromStorage() {
  try {
    const raw = localStorage.getItem(getAppCartStorageKey());
    if (!raw) {
      state.appCart = [];
    } else {
      const parsed = JSON.parse(raw);
      state.appCart = Array.isArray(parsed)
        ? parsed.filter((i) => i && Number(i.cantidad) > 0 && (i.es_kit || (i.product && i.product.id)))
        : [];
    }
  } catch (e) {
    state.appCart = [];
  }
  const totalItems = state.appCart.reduce((acc, i) => acc + i.cantidad, 0);
  const totalRD = state.appCart.reduce(
    (acc, i) => acc + (i.es_kit ? i.precio_oferta * i.cantidad : (i.product.precios_presentacion[i.presentacion] || i.product.precio_base) * i.cantidad),
    0
  );
  const countEl = document.getElementById('floating-cart-count');
  if (countEl) countEl.textContent = totalItems;
  const totalEl = document.getElementById('floating-cart-total');
  if (totalEl) totalEl.textContent = formatRD(totalRD);
  const hdrCount = document.getElementById('app-cart-count');
  if (hdrCount) hdrCount.textContent = totalItems;
  const hdrText = document.getElementById('app-cart-badge-text');
  if (hdrText) hdrText.textContent = formatRD(totalRD);
}

function openCartDrawer() {
  fetchAndApplyLivePharmacyConfig();
  renderSavedAddressesBar();
  renderCartDrawerItems();
  document.getElementById('cart-drawer-backdrop').classList.remove('hidden');
}

function toggleCartDrawer() {
  const bd = document.getElementById('cart-drawer-backdrop');
  if (!bd) return;
  if (bd.classList.contains('hidden')) {
    openCartDrawer();
  } else {
    closeCartDrawer();
  }
}

function closeCartDrawer() {
  document.getElementById('cart-drawer-backdrop').classList.add('hidden');
}

function renderCartDrawerItems() {
  const list = document.getElementById('app-cart-items-list');
  const rxBox = document.getElementById('app-prescription-box');

  if (!state.appCart.length) {
    list.innerHTML = `
      <div class="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
        Tu carrito está vacío. Selecciona medicamentos por Caja, Blíster o Unidad desde el catálogo.
      </div>
    `;
    rxBox.classList.add('hidden');
    document.getElementById('app-cart-total-units').textContent = '0 unidades mínimas';
    document.getElementById('app-cart-total-rd').textContent = 'RD$ 0.00';
    return;
  }

  let requiresRx = false;
  let totalUnits = 0;
  let totalRD = 0;

  list.innerHTML = state.appCart
    .map((item, idx) => {
      if (item.es_kit) {
        const sub = item.precio_oferta * item.cantidad;
        const compCount = item.items_desglose ? item.items_desglose.length : 3;
        totalUnits += compCount * item.cantidad;
        totalRD += sub;
        const compsHtml = (item.items_desglose || []).map(c => `
          <div class="flex items-center justify-between text-[11px] text-slate-700 bg-white/80 px-2 py-0.5 rounded border border-amber-200">
            <span>${c.icono || '🔹'} <strong>${c.cantidad}x ${c.presentacion}</strong> ${c.nombre_comercial}</span>
            <span class="text-slate-400 font-mono">RD$ ${Number(c.precio_unitario * c.cantidad).toFixed(2)}</span>
          </div>
        `).join('');

        return `
          <div class="p-3.5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-amber-500/10 border-2 border-amber-400/60 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-slate-950">⚡ KIT OFERTA</span>
                <span class="text-xs font-black text-slate-900">${item.nombre_comercial}</span>
              </div>
              <div class="text-right">
                <p class="text-xs font-black text-slate-900">${formatRD(sub)}</p>
                <p class="text-[10px] text-slate-400 line-through">Reg: RD$ ${(item.precio_regular * item.cantidad).toFixed(2)}</p>
              </div>
            </div>
            <div class="space-y-1 pt-1 border-t border-amber-300/40">
              <p class="text-[10px] font-black uppercase text-amber-800 tracking-wider">📦 Consta de este kit:</p>
              ${compsHtml}
            </div>
            <div class="flex items-center justify-between pt-1">
              <span class="text-[10px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                ¡Ahorro: RD$ ${(item.ahorro * item.cantidad).toFixed(2)}!
              </span>
              <div class="inline-flex items-center gap-1 bg-white border border-amber-300 rounded-lg px-1 py-0.5">
                <button type="button" onclick="updateAppCartQty(${idx}, -1)" class="w-5 h-5 rounded text-xs font-extrabold text-slate-700 hover:bg-slate-100">-</button>
                <span class="text-xs font-bold px-1.5">${item.cantidad}</span>
                <button type="button" onclick="updateAppCartQty(${idx}, 1)" class="w-5 h-5 rounded text-xs font-extrabold text-slate-700 hover:bg-slate-100">+</button>
              </div>
            </div>
          </div>
        `;
      }
      const p = item.product;
      if (p.requiere_receta) requiresRx = true;
      const unitPrice = p.precios_presentacion[item.presentacion];
      const sub = unitPrice * item.cantidad;
      const minU = calcMinUnits(p, item.presentacion, item.cantidad);
      totalUnits += minU;
      totalRD += sub;

      return `
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
          <div class="space-y-0.5">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-extrabold text-slate-900">${p.nombre_comercial}</span>
              ${
                p.requiere_receta
                  ? '<span class="px-1.5 py-0.2 rounded bg-amber-200 text-amber-950 font-extrabold text-[9px]">RECETA</span>'
                  : ''
              }
            </div>
            <p class="text-[11px] font-semibold text-teal-700">
              Presentación: ${getPresentationLabel(p, item.presentacion)}
            </p>
            <p class="text-[10px] font-mono text-slate-500">
              Descuento exacto del stock: <strong>${minU} ${p.unidad_minima_nombre}(s)</strong>
            </p>
          </div>
          <div class="text-right shrink-0 space-y-1">
            <p class="text-xs font-extrabold text-slate-900">${formatRD(sub)}</p>
            <div class="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-1 py-0.5">
              <button type="button" onclick="updateAppCartQty(${idx}, -1)" class="w-5 h-5 rounded text-xs font-extrabold text-slate-700 hover:bg-slate-100">-</button>
              <span class="text-xs font-bold px-1.5">${item.cantidad}</span>
              <button type="button" onclick="updateAppCartQty(${idx}, 1)" class="w-5 h-5 rounded text-xs font-extrabold text-slate-700 hover:bg-slate-100">+</button>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  if (requiresRx) {
    rxBox.classList.remove('hidden');
  } else {
    rxBox.classList.add('hidden');
  }

  const shipInfo = calcAppShippingFee(totalRD);
  const grandTotal = totalRD + shipInfo.fee;

  document.getElementById('app-cart-total-units').textContent = `${totalUnits} unidades mínimas`;
  const subEl = document.getElementById('app-cart-subtotal-rd');
  if (subEl) subEl.textContent = formatRD(totalRD);
  const shipLabelEl = document.getElementById('app-cart-shipping-label');
  if (shipLabelEl) shipLabelEl.textContent = shipInfo.label;
  const shipValEl = document.getElementById('app-cart-shipping-rd');
  if (shipValEl) {
    shipValEl.textContent = shipInfo.fee > 0 ? formatRD(shipInfo.fee) : 'GRATIS';
    shipValEl.className = shipInfo.fee > 0 ? 'font-extrabold text-slate-900' : 'font-extrabold text-emerald-700';
  }
  document.getElementById('app-cart-total-rd').textContent = formatRD(grandTotal);
  calculateCashChange();
}

function selectAppPaymentMethod(method) {
  if (method === 'TARJETA' && state.pharmacyConfig && state.pharmacyConfig.pago_tarjeta_activo === false) {
    showToast('🔒 El pago con tarjeta se encuentra temporalmente deshabilitado por la farmacia.', 'error');
    return;
  }
  state.appPaymentMethod = method;
  const btnEfectivo = document.getElementById('btn-pay-efectivo');
  const btnTarjeta = document.getElementById('btn-pay-tarjeta');
  const btnDeposito = document.getElementById('btn-pay-deposito');

  const boxEfectivo = document.getElementById('payment-box-efectivo');
  const boxTarjeta = document.getElementById('payment-box-tarjeta');
  const boxDeposito = document.getElementById('payment-box-deposito');

  [btnEfectivo, btnTarjeta, btnDeposito].forEach((btn) => {
    if (btn) btn.className = 'p-2.5 sm:p-3 rounded-xl border-2 border-slate-200 bg-white text-left transition';
  });
  [boxEfectivo, boxTarjeta, boxDeposito].forEach((box) => {
    if (box) {
      box.classList.add('hidden');
      box.style.display = 'none';
    }
  });

  if (method === 'EFECTIVO') {
    if (btnEfectivo) btnEfectivo.className = 'p-2.5 sm:p-3 rounded-xl border-2 border-emerald-600 bg-emerald-50 text-left transition';
    if (boxEfectivo) {
      boxEfectivo.classList.remove('hidden');
      boxEfectivo.style.display = 'block';
    }
    calculateCashChange();
  } else if (method === 'TARJETA') {
    if (btnTarjeta) btnTarjeta.className = 'p-2.5 sm:p-3 rounded-xl border-2 border-teal-600 bg-teal-50/60 text-left transition';
    if (boxTarjeta) {
      boxTarjeta.classList.remove('hidden');
      boxTarjeta.style.display = 'block';
    }
  } else {
    if (btnDeposito) btnDeposito.className = 'p-2.5 sm:p-3 rounded-xl border-2 border-teal-600 bg-teal-50/60 text-left transition';
    if (boxDeposito) {
      boxDeposito.classList.remove('hidden');
      boxDeposito.style.display = 'block';
    }
  }
}

function calculateCashChange() {
  const total = state.appCart.reduce((sum, item) => {
    const unitPrice = item.es_kit ? item.precio_oferta : (item.product.precios_presentacion[item.presentacion] || item.product.precio_base);
    return sum + unitPrice * item.cantidad;
  }, 0);

  const inp = document.getElementById('app-cash-amount');
  const cashVal = parseFloat(inp ? inp.value : 0) || 0;
  const changeEl = document.getElementById('app-cash-change-val');

  if (cashVal >= total) {
    const change = cashVal - total;
    if (changeEl) changeEl.textContent = formatRD(change);
  } else {
    if (changeEl) changeEl.textContent = 'Monto menor al total';
  }
}

async function handlePrescriptionFileChange(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64Data = e.target.result;
    const res = await fetch('/api/upload-prescription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        image_base64: base64Data,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      state.uploadedPrescriptionUrl = data.receta_imagen_url;
      document.getElementById('app-rx-preview-img').src = data.receta_imagen_url;
      document.getElementById('app-rx-preview-wrap').classList.remove('hidden');
      showToast('Foto de receta médica cargada correctamente.');
    } else {
      showToast(data.error || 'Error subiendo receta', 'error');
    }
  };
  reader.readAsDataURL(file);
}

function clearPrescriptionUpload() {
  state.uploadedPrescriptionUrl = null;
  document.getElementById('app-rx-preview-img').src = '';
  document.getElementById('app-rx-preview-wrap').classList.add('hidden');
}

async function submitAppOrder() {
  if (!state.appCart.length) {
    showToast('Agrega al menos un medicamento al carrito.', 'error');
    return;
  }

  const requiresRx = state.appCart.some((i) => i.product.requiere_receta);
  if (requiresRx && !state.uploadedPrescriptionUrl) {
    showToast('Debes adjuntar la foto de la receta médica obligatoria para continuar.', 'error');
    return;
  }

  const clienteNombre = document.getElementById('app-client-name').value.trim();
  const clienteTelefono = document.getElementById('app-client-phone').value.trim();
  let clienteDireccion = document.getElementById('app-client-address').value.trim();

  const deliveryAllowed = state.pharmacyConfig ? state.pharmacyConfig.envio_domicilio_activo !== false : true;
  const effectiveDeliveryMode = deliveryAllowed ? (state.appDeliveryMode || 'DOMICILIO') : 'RETIRO_FARMACIA';

  if (effectiveDeliveryMode === 'RETIRO_FARMACIA' && !clienteDireccion) {
    clienteDireccion = 'Retiro en Sucursal — Farmacia Davalsi';
  }

  if (!clienteNombre || !clienteTelefono || (effectiveDeliveryMode === 'DOMICILIO' && !clienteDireccion)) {
    showToast('Por favor completa tu nombre, teléfono WhatsApp y dirección de entrega.', 'error');
    return;
  }

  if (state.pharmacyOpenStatus && state.pharmacyOpenStatus.open === false) {
    const okClosed = confirm(`🕒 Esta farmacia se encuentra fuera de su horario (${(state.pharmacyConfig && state.pharmacyConfig.horario) || 'cerrada'}).\n\nTu pedido quedará registrado para ser atendido en su apertura. ¿Deseas enviarlo?`);
    if (!okClosed) return;
  }

  if (state.appPaymentMethod === 'TARJETA' && state.pharmacyConfig && state.pharmacyConfig.pago_tarjeta_activo === false) {
    showToast('🔒 El pago con tarjeta está temporalmente deshabilitado. Elige Efectivo o Depósito.', 'error');
    return;
  }

  const arsAllowed = state.pharmacyConfig ? state.pharmacyConfig.seguro_medico_activo !== false : true;
  const arsSelect = document.getElementById('app-insurance-ars');
  const affiliateInp = document.getElementById('app-insurance-affiliate');
  let seguroArs = arsAllowed && arsSelect ? arsSelect.value : 'Sin Seguro';
  if (seguroArs !== 'Sin Seguro' && affiliateInp && affiliateInp.value.trim()) {
    seguroArs = `${seguroArs} (Afiliado: ${affiliateInp.value.trim()})`;
  }

  let referenciaPago = '';
  if (state.appPaymentMethod === 'EFECTIVO') {
    const cashVal = parseFloat(document.getElementById('app-cash-amount')?.value || 0);
    const total = state.appCart.reduce((sum, item) => {
      const unitPrice = item.product.precios_presentacion[item.presentacion] || item.product.precio_base;
      return sum + unitPrice * item.cantidad;
    }, 0);
    if (cashVal > total) {
      referenciaPago = `Efectivo (Paga con: ${formatRD(cashVal)} - Cambio: ${formatRD(cashVal - total)})`;
    } else {
      referenciaPago = 'Efectivo (Monto exacto)';
    }
  } else if (state.appPaymentMethod === 'TARJETA') {
    referenciaPago = document.getElementById('app-card-ref')?.value.trim() || 'Tarjeta de Crédito / Débito';
  } else {
    referenciaPago = document.getElementById('app-deposit-ref')?.value.trim() || 'Depósito Bancario';
  }

  const finalAddress =
    effectiveDeliveryMode === 'RETIRO_FARMACIA'
      ? `[RETIRO EN SUCURSAL] ${clienteDireccion}`
      : `[ENVÍO A DOMICILIO] ${clienteDireccion}`;

  const latitudEntrega = parseFloat(document.getElementById('app-client-lat')?.value || 18.4835);
  const longitudEntrega = parseFloat(document.getElementById('app-client-lng')?.value || -69.9405);

  const payload = {
    farmacia_id: getActiveAppPharmacyId(),
    canal: 'APP_PACIENTE',
    modalidad_entrega: effectiveDeliveryMode,
    cliente_nombre: clienteNombre,
    cliente_telefono: clienteTelefono,
    cliente_direccion: finalAddress,
    direccion_texto: clienteDireccion,
    latitud_entrega: latitudEntrega,
    longitud_entrega: longitudEntrega,
    telefono_contacto: clienteTelefono,
    metodo_pago: state.appPaymentMethod,
    seguro_ars: seguroArs,
    referencia_pago: referenciaPago,
    receta_imagen_url: state.uploadedPrescriptionUrl,
    items: state.appCart.map((i) => {
      if (i.es_kit) {
        return {
          es_kit: true,
          kit_id: i.kit_id || i.codigo_kit,
          cantidad: i.cantidad,
          presentacion: 'KIT'
        };
      }
      return {
        producto_id: i.product.id,
        presentacion: i.presentacion,
        cantidad: i.cantidad,
      };
    }),
  };

  const res = await fetch('/api/sales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();

  if (!data.ok) {
    showToast(data.error || 'Error al procesar el pedido.', 'error');
    return;
  }

  // Limpiar carrito y mostrar modal con las notificaciones WhatsApp API enviadas
  state.appCart = [];
  state.uploadedPrescriptionUrl = null;
  clearPrescriptionUpload();
  updateFloatingCartUI();
  closeCartDrawer();
  await refreshAllData();
  showOrderSuccessModal(data.order, data.whatsapp_dispatches);
}

function showOrderSuccessModal(order, waDispatches) {
  state.lastConfirmedAppOrder = order;
  saveActiveAppOrder(order);
  document.getElementById('success-modal-title').textContent = `¡Orden #${order.codigo_orden} Confirmada (${formatRD(order.total)})!`;
  const body = document.getElementById('order-success-body');

  const itemsHtml = order.items
    .map(
      (i) => `
      <div class="flex items-center justify-between py-1.5 border-b border-slate-100">
        <div>
          <span class="font-bold text-slate-900">${i.cantidad_presentacion}x ${i.presentacion} — ${i.nombre_comercial}</span>
          <span class="block text-[11px] text-teal-700 font-mono">
            Stock Unificado: ${i.stock_antes_unidades} → <strong>${i.stock_despues_unidades} unid.</strong> (-${i.unidades_minimas_descontadas} unid. mínimas)
          </span>
        </div>
        <span class="font-extrabold text-slate-900">${formatRD(i.subtotal)}</span>
      </div>
    `
    )
    .join('');

  const waHtml = (waDispatches || [])
    .map(
      (w) => `
      <div class="rounded-2xl border border-emerald-300 overflow-hidden">
        <div class="bg-emerald-900 text-white px-3.5 py-2 flex items-center justify-between text-[11px]">
          <span class="font-extrabold">💬 API WHATSAPP → ${w.recipient_role} (+${w.to_phone})</span>
          <span class="px-2 py-0.5 rounded bg-emerald-700 font-mono">${w.provider} • HTTP ${w.http_status}</span>
        </div>
        <div class="p-3 wa-chat-bg">
          <div class="wa-bubble p-3 text-[11px] text-slate-900 font-sans">${w.message_text}</div>
        </div>
      </div>
    `
    )
    .join('');

  body.innerHTML = `
    <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
      <div class="flex items-center justify-between">
        <span class="font-extrabold text-slate-700 uppercase">Impacto Instantáneo en Inventario Central</span>
        <span class="px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-bold text-[10px]">${order.metodo_pago}</span>
      </div>
      ${itemsHtml}
    </div>

    <div class="space-y-2.5">
      <h4 class="font-extrabold text-slate-800 uppercase text-[11px]">
        🚀 Notificaciones Automáticas Disparadas vía WhatsApp Business API:
      </h4>
      ${waHtml}
    </div>

    <div class="flex flex-wrap justify-end gap-2 pt-2">
      <button onclick="closeOrderSuccessModal(); openDeliveryTrackingModal('${order.codigo_orden}');" class="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs shadow flex items-center gap-1.5 cursor-pointer">
        <span>🛵</span> <span>Rastrear Mi Delivery en Vivo (Mapa)</span>
      </button>
      <button onclick="openDirectOrderWhatsApp()" class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow flex items-center gap-1.5 cursor-pointer">
        <span>📲</span> <span>Enviar Pedido por WhatsApp a la Farmacia</span>
      </button>
      <button onclick="closeOrderSuccessModal();" class="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-extrabold text-xs cursor-pointer">
        ✓ Finalizar Compra
      </button>
    </div>
  `;

  document.getElementById('order-success-modal').classList.remove('hidden');
}

function closeOrderSuccessModal() {
  document.getElementById('order-success-modal').classList.add('hidden');
}

/* =========================================================================
   MÓDULO 2: POS DE MOSTRADOR FÍSICO Y VALIDACIÓN DE RECETAS WEB/APP
   ========================================================================= */

function renderPosQuickBarcodes() {
  const wrap = document.getElementById('pos-quick-barcodes');
  if (!wrap) return;
  wrap.innerHTML = state.products
    .map(
      (p) => `
      <button
        type="button"
        onclick="quickScanPosProduct('${p.codigo_barras}')"
        class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-teal-50 hover:border-teal-400 border border-slate-300 text-[11px] font-medium flex items-center gap-1.5 transition"
      >
        <span class="font-mono font-bold text-teal-700">${p.codigo_barras}</span>
        <span class="text-slate-700 truncate max-w-[140px]">${p.nombre_comercial}</span>
      </button>
    `
    )
    .join('');
}

function quickScanPosProduct(barcode) {
  const input = document.getElementById('pos-barcode-input');
  input.value = barcode;
  handlePosBarcodeSubmit(new Event('submit'));
}

function handlePosBarcodeSubmit(event) {
  if (event && event.preventDefault) event.preventDefault();
  const input = document.getElementById('pos-barcode-input');
  const query = input.value.trim().toLowerCase();
  const pres = document.getElementById('pos-scan-presentation').value;
  if (!query) return;

  const product = state.products.find(
    (p) =>
      p.codigo_barras.toLowerCase() === query ||
      p.nombre_comercial.toLowerCase().includes(query) ||
      p.principio_activo.toLowerCase().includes(query)
  );

  if (!product) {
    showToast(`No se encontró ningún medicamento con el código o nombre '${query}'.`, 'error');
    return;
  }

  const unitsNeeded = calcMinUnits(product, pres, 1);
  const currentInPos = state.posCart
    .filter((i) => i.product.id === product.id)
    .reduce((acc, i) => acc + calcMinUnits(product, i.presentacion, i.cantidad), 0);

  if (currentInPos + unitsNeeded > product.inventario.stock_total_unidades) {
    showToast(
      `Stock físico insuficiente para ${product.nombre_comercial}. Disponible: ${product.inventario.stock_total_unidades} unid.`,
      'error'
    );
    return;
  }

  const existing = state.posCart.find(
    (i) => i.product.id === product.id && i.presentacion === pres
  );
  if (existing) {
    existing.cantidad += 1;
  } else {
    state.posCart.push({
      product,
      presentacion: pres,
      cantidad: 1,
    });
  }

  input.value = '';
  renderPosCart();
  showToast(`Escaneado: 1 ${pres} de ${product.nombre_comercial}`);
}

function changePosItemPresentation(index, newPres) {
  const item = state.posCart[index];
  if (!item) return;
  item.presentacion = newPres;
  renderPosCart();
}

function changePosItemQty(index, delta) {
  const item = state.posCart[index];
  if (!item) return;
  const next = item.cantidad + delta;
  if (next <= 0) {
    state.posCart.splice(index, 1);
  } else {
    item.cantidad = next;
  }
  renderPosCart();
}

function renderPosCart() {
  const tbody = document.getElementById('pos-cart-tbody');
  if (!state.posCart.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-8 text-center text-slate-400 font-medium">
          Escanee un código de barras o haga clic en un acceso rápido arriba para agregar al ticket de mostrador.
        </td>
      </tr>
    `;
    document.getElementById('pos-total-min-units').textContent = '0 unid.';
    document.getElementById('pos-total-amount').textContent = 'RD$ 0.00';
    return;
  }

  let totalMinUnits = 0;
  let totalAmount = 0;

  tbody.innerHTML = state.posCart
    .map((item, idx) => {
      const p = state.products.find((prod) => prod.id === item.product.id) || item.product;
      const unitPrice = p.precios_presentacion[item.presentacion];
      const sub = unitPrice * item.cantidad;
      const minU = calcMinUnits(p, item.presentacion, item.cantidad);
      totalMinUnits += minU;
      totalAmount += sub;

      return `
        <tr class="hover:bg-slate-50">
          <td class="py-2.5 px-3">
            <p class="font-extrabold text-slate-900">${p.nombre_comercial}</p>
            <p class="text-[10px] font-mono text-slate-400">${p.codigo_barras} • Stock actual: ${p.inventario.stock_total_unidades} unid.</p>
          </td>
          <td class="py-2.5 px-2">
            <select onchange="changePosItemPresentation(${idx}, this.value)" class="px-2 py-1 rounded-lg border border-slate-300 font-bold text-[11px] bg-white">
              <option value="CAJA" ${item.presentacion === 'CAJA' ? 'selected' : ''}>CAJA (${p.inventario.unidades_por_caja}u)</option>
              <option value="BLISTER" ${item.presentacion === 'BLISTER' ? 'selected' : ''}>BLÍSTER (${p.unidades_por_blister}u)</option>
              <option value="UNIDAD" ${item.presentacion === 'UNIDAD' ? 'selected' : ''}>UNIDAD (1u)</option>
            </select>
          </td>
          <td class="py-2.5 px-2 text-center">
            <div class="inline-flex items-center gap-1 border border-slate-300 rounded-lg px-1 py-0.5 bg-white">
              <button onclick="changePosItemQty(${idx}, -1)" class="w-5 h-5 font-extrabold text-slate-600">-</button>
              <span class="px-1.5 font-bold">${item.cantidad}</span>
              <button onclick="changePosItemQty(${idx}, 1)" class="w-5 h-5 font-extrabold text-slate-600">+</button>
            </div>
          </td>
          <td class="py-2.5 px-2 text-center font-mono font-bold text-teal-700">
            -${minU} ${p.unidad_minima_nombre}s
          </td>
          <td class="py-2.5 px-3 text-right font-extrabold text-slate-900">
            ${formatRD(sub)}
          </td>
          <td class="py-2.5 px-2 text-center">
            <button onclick="changePosItemQty(${idx}, -999)" class="text-rose-500 hover:text-rose-700 font-bold">✕</button>
          </td>
        </tr>
      `;
    })
    .join('');

  document.getElementById('pos-total-min-units').textContent = `${totalMinUnits} unid. mínimas`;
  document.getElementById('pos-total-amount').textContent = formatRD(totalAmount);
}

async function submitPosSale() {
  if (!state.posCart.length) {
    showToast('El ticket del POS está vacío.', 'error');
    return;
  }

  const payload = {
    canal: 'POS_MOSTRADOR',
    cliente_nombre: document.getElementById('pos-client-name').value.trim() || 'Cliente Mostrador',
    cliente_telefono: '18095550000',
    cliente_direccion: 'Mostrador Físico Farmacia Davalsi',
    metodo_pago: document.getElementById('pos-payment-method').value,
    referencia_pago: document.getElementById('pos-payment-ref').value.trim(),
    atendido_por: 'Cajero POS Caja #01',
    items: state.posCart.map((i) => ({
      producto_id: i.product.id,
      presentacion: i.presentacion,
      cantidad: i.cantidad,
    })),
  };

  const res = await fetch('/api/sales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) {
    showToast(data.error || 'Error procesando venta en POS.', 'error');
    return;
  }

  state.posCart = [];
  document.getElementById('pos-payment-ref').value = '';
  renderPosCart();
  await refreshAllData();
  showToast(`Venta POS #${data.order.codigo_orden} completada (${formatRD(data.order.total)}). Stock actualizado en tiempo real.`);
}

/* =========================================================================
   BANDEJA DE PEDIDOS WEB / APP Y VALIDACIÓN DE RECETAS MÉDICAS
   ========================================================================= */

async function loadTransactions() {
  const filterChannel = document.getElementById('filter-tx-channel')
    ? document.getElementById('filter-tx-channel').value
    : '';
  const url = filterChannel ? `/api/transactions?canal=${filterChannel}` : '/api/transactions';
  const res = await fetch(url);
  const data = await res.json();
  if (!data.ok) return;
  state.transactions = data.transactions;
  renderPosWebOrdersInbox();
  renderBackofficeTransactions();
}

function renderPosWebOrdersInbox() {
  const inbox = document.getElementById('pos-web-orders-inbox');
  if (!inbox) return;

  const appOrders = state.transactions.filter((t) => t.canal === 'APP_PACIENTE');
  if (!appOrders.length) {
    inbox.innerHTML = `<div class="p-6 text-center text-xs text-slate-400">No hay pedidos digitales registrados aún.</div>`;
    return;
  }

  inbox.innerHTML = appOrders
    .map((order) => {
      const isPendingRx = order.estado_pedido === 'PENDIENTE_RECETA';
      const isRejected = order.estado_pedido === 'RECHAZADO_RECETA';
      const badgeColor = isPendingRx
        ? 'bg-amber-100 text-amber-900 border-amber-300'
        : isRejected
        ? 'bg-rose-100 text-rose-800 border-rose-300'
        : 'bg-emerald-100 text-emerald-800 border-emerald-300';

      const itemsSummary = order.items
        .map(
          (i) =>
            `<li>• <strong>${i.cantidad_presentacion}x ${i.presentacion}</strong> ${i.nombre_comercial} <span class="text-slate-500">(-${i.unidades_minimas_descontadas} unid.)</span></li>`
        )
        .join('');

      return `
        <div class="p-4 rounded-2xl border ${
          isPendingRx ? 'border-amber-400 bg-amber-50/40' : 'border-slate-200 bg-slate-50/60'
        } space-y-2.5">
          <div class="flex items-center justify-between gap-2">
            <div>
              <span class="font-mono font-extrabold text-xs text-slate-900">#${order.codigo_orden}</span>
              <span class="text-[11px] text-slate-400 ml-1">${order.fecha_hora}</span>
            </div>
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${badgeColor}">
              ${order.estado_pedido}
            </span>
          </div>

          <div class="text-xs">
            <p class="font-bold text-slate-800">👤 ${order.cliente_nombre} • 📱 +${order.cliente_telefono}</p>
            <p class="text-[11px] text-slate-500">📍 ${order.cliente_direccion || 'Retiro en sucursal'}</p>
            <p class="text-[11px] font-semibold text-teal-800 mt-0.5">
              💳 ${order.metodo_pago} ${order.referencia_pago ? `(${order.referencia_pago})` : ''} — Total: <strong>${formatRD(order.total)}</strong>
            </p>
          </div>

          <ul class="text-[11px] text-slate-700 space-y-0.5 bg-white p-2.5 rounded-xl border border-slate-200">
            ${itemsSummary}
          </ul>

          <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
            ${
              order.receta_imagen_url
                ? `<button onclick="openPrescriptionModal(${order.id})" class="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-xs">
                    <span>🔍 Ver Receta Médica Adjunta</span>
                  </button>`
                : `<span class="text-[11px] text-emerald-700 font-semibold">✅ Medicamentos de Venta Libre</span>`
            }

            ${
              order.estado_pedido === 'PENDIENTE_RECETA' || order.estado_pedido === 'EN_PREPARACION'
                ? `<button onclick="quickApproveOrder(${order.id})" class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs">
                    ✓ Aprobar Despacho
                  </button>`
                : `<span class="text-[10px] text-slate-500 italic">${order.notas_farmaceutico || ''}</span>`
            }
          </div>
        </div>
      `;
    })
    .join('');
}

function openPrescriptionModal(orderId) {
  const order = state.transactions.find((t) => t.id === orderId);
  if (!order) return;
  state.activeReviewOrderId = orderId;

  document.getElementById('rx-modal-title').textContent = `Receta Médica — Orden #${order.codigo_orden}`;
  document.getElementById('rx-modal-subtitle').textContent = `Paciente: ${order.cliente_nombre} • Total: ${formatRD(order.total)}`;
  document.getElementById('rx-modal-img').src = order.receta_imagen_url || '/api/sample-prescription.svg';
  document.getElementById('rx-pharmacist-note').value = '';

  const actionsEl = document.getElementById('rx-modal-actions');
  if (order.estado_pedido === 'RECHAZADO_RECETA' || order.estado_pedido === 'APROBADO_DESPACHO') {
    actionsEl.classList.add('hidden');
  } else {
    actionsEl.classList.remove('hidden');
  }

  document.getElementById('rx-viewer-modal').classList.remove('hidden');
}

function closePrescriptionModal() {
  document.getElementById('rx-viewer-modal').classList.add('hidden');
  state.activeReviewOrderId = null;
}

async function quickApproveOrder(orderId) {
  state.activeReviewOrderId = orderId;
  await submitPrescriptionReview('APROBAR');
}

async function submitPrescriptionReview(accion) {
  if (!state.activeReviewOrderId) return;
  const noteEl = document.getElementById('rx-pharmacist-note');
  const notas = noteEl ? noteEl.value.trim() : '';

  const res = await fetch('/api/orders/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transaccion_id: state.activeReviewOrderId,
      accion,
      notas_farmaceutico: notas,
      farmaceutico_nombre: 'Lic. Carmen Rosario (Regente Farmacia Davalsi)',
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    showToast(data.error || 'No se pudo actualizar la orden.', 'error');
    return;
  }

  closePrescriptionModal();
  await refreshAllData();
  showToast(
    accion === 'APROBAR'
      ? `Orden #${data.order.codigo_orden} aprobada y cliente notificado por WhatsApp API.`
      : `Orden #${data.order.codigo_orden} rechazada. Las unidades fueron reintegradas al stock.`
  );
}

/* =========================================================================
   MÓDULO 3: BACKOFFICE — INVENTARIO EN TIEMPO REAL Y TRANSACCIONES
   ========================================================================= */

function renderBackofficeInventory() {
  const tbody = document.getElementById('backoffice-inventory-tbody');
  if (!tbody) return;
  const onlyLow = document.getElementById('chk-filter-low-stock')?.checked;
  const list = onlyLow
    ? state.products.filter((p) => p.inventario.alerta_stock_bajo)
    : state.products;

  tbody.innerHTML = list
    .map((p) => {
      const inv = p.inventario;
      const statusBadge =
        inv.estado_stock === 'AGOTADO' || inv.estado_stock === 'CRITICO'
          ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300">🚨 CRÍTICO (≤${inv.stock_minimo_alerta})</span>`
          : inv.estado_stock === 'BAJO'
          ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">⚠️ STOCK BAJO</span>`
          : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">✅ ÓPTIMO</span>`;

      return `
        <tr class="hover:bg-slate-50 ${inv.alerta_stock_bajo ? 'bg-rose-50/30' : ''}">
          <td class="py-3 px-3">
            <div class="flex items-center gap-1.5">
              <span class="font-extrabold text-slate-900">${p.nombre_comercial}</span>
              ${
                p.requiere_receta
                  ? '<span class="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-bold text-[9px]">Receta</span>'
                  : ''
              }
            </div>
            <p class="text-[11px] text-teal-700 font-medium">${p.principio_activo} (${p.concentracion})</p>
            <p class="text-[10px] font-mono text-slate-400">EAN: ${p.codigo_barras} • Anaquel: ${p.ubicacion_anaquel}</p>
          </td>
          <td class="py-3 px-3 font-mono text-[11px] text-slate-700">
            <div>1 Caja = <strong>${p.blisters_por_caja}</strong> Blíst.</div>
            <div>1 Blíst. = <strong>${p.unidades_por_blister}</strong> ${p.unidad_minima_nombre}s</div>
            <div class="text-teal-700 font-bold">1 Caja = ${inv.unidades_por_caja} ${p.unidad_minima_nombre}s</div>
          </td>
          <td class="py-3 px-3 text-center bg-teal-50/40">
            <span class="text-base font-extrabold text-teal-900">${inv.cajas_disponibles}</span>
            <span class="block text-[10px] text-teal-700">cajas enteras</span>
          </td>
          <td class="py-3 px-3 text-center bg-sky-50/40">
            <span class="text-base font-extrabold text-sky-900">${inv.blisters_disponibles}</span>
            <span class="block text-[10px] text-sky-700">blísteres equiv.</span>
          </td>
          <td class="py-3 px-3 text-center bg-emerald-50/60">
            <span class="text-base font-extrabold text-emerald-950 font-mono">${inv.stock_total_unidades}</span>
            <span class="block text-[10px] font-bold text-emerald-800">${p.unidad_minima_nombre}s totales</span>
          </td>
          <td class="py-3 px-3">
            <span class="inline-block px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 font-mono text-[11px] font-semibold text-slate-800">
              ${inv.desglose_fisico.texto}
            </span>
          </td>
          <td class="py-3 px-3 text-[11px]">
            <div>📦 Caja: <strong>${formatRD(p.precios_presentacion.CAJA)}</strong></div>
            <div>💊 Blíst: <strong>${formatRD(p.precios_presentacion.BLISTER)}</strong></div>
            <div>🔹 Unid: <strong>${formatRD(p.precios_presentacion.UNIDAD)}</strong></div>
          </td>
          <td class="py-3 px-3 text-center space-y-1.5">
            <div>${statusBadge}</div>
            <button onclick="openReplenishModal(${p.id})" class="px-3 py-1 rounded-lg bg-slate-900 hover:bg-teal-600 text-white font-bold text-[11px] transition">
              + Abastecer
            </button>
          </td>
        </tr>
      `;
    })
    .join('');
}

function renderBackofficeTransactions() {
  const tbody = document.getElementById('backoffice-tx-tbody');
  if (!tbody) return;

  tbody.innerHTML = state.transactions
    .map((tx) => {
      const channelBadge =
        tx.canal === 'POS_MOSTRADOR'
          ? `<span class="px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-900 font-extrabold text-[10px]">🖥️ POS MOSTRADOR</span>`
          : `<span class="px-2 py-0.5 rounded-lg bg-teal-100 text-teal-900 font-extrabold text-[10px]">📱 APP PACIENTE</span>`;

      const detailsHtml = tx.items
        .map(
          (i) => `
          <div class="text-[11px] py-0.5">
            <span class="font-bold text-slate-900">${i.cantidad_presentacion}x ${i.presentacion}</span> de ${i.nombre_comercial}
            <span class="inline-block ml-1 px-1.5 py-0.2 rounded bg-slate-100 font-mono text-[10px] text-teal-800 border border-slate-200">
              -${i.unidades_minimas_descontadas} unid. (${i.stock_antes_unidades} → ${i.stock_despues_unidades})
            </span>
          </div>
        `
        )
        .join('');

      return `
        <tr class="hover:bg-slate-50">
          <td class="py-3 px-3">
            <span class="font-mono font-extrabold text-slate-900">#${tx.codigo_orden}</span>
            <span class="block text-[10px] text-slate-400">${tx.fecha_hora}</span>
          </td>
          <td class="py-3 px-3">${channelBadge}</td>
          <td class="py-3 px-3">
            <p class="font-bold text-slate-800">${tx.cliente_nombre}</p>
            <p class="text-[10px] text-slate-500">+${tx.cliente_telefono}</p>
          </td>
          <td class="py-3 px-3">${detailsHtml}</td>
          <td class="py-3 px-3">
            <span class="font-bold text-slate-800">${tx.metodo_pago}</span>
            ${tx.referencia_pago ? `<span class="block text-[10px] font-mono text-slate-500">${tx.referencia_pago}</span>` : ''}
          </td>
          <td class="py-3 px-3 text-right font-extrabold text-slate-900">${formatRD(tx.total)}</td>
          <td class="py-3 px-3 text-center">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
              ${tx.estado_pedido}
            </span>
            ${
              tx.receta_imagen_url
                ? `<button onclick="openPrescriptionModal(${tx.id})" class="block mx-auto mt-1 text-[10px] font-bold text-amber-700 underline">Ver Receta</button>`
                : ''
            }
          </td>
        </tr>
      `;
    })
    .join('');
}

function openReplenishModal(productId) {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;
  document.getElementById('replenish-product-id').value = product.id;
  document.getElementById('replenish-product-name').textContent = `${product.nombre_comercial} (Stock actual: ${product.inventario.stock_total_unidades} ${product.unidad_minima_nombre}s)`;
  document.getElementById('replenish-modal').classList.remove('hidden');
}

function closeReplenishModal() {
  document.getElementById('replenish-modal').classList.add('hidden');
}

async function submitReplenishStock(event) {
  event.preventDefault();
  const productId = parseInt(document.getElementById('replenish-product-id').value, 10);
  const presentacion = document.getElementById('replenish-presentation').value;
  const cantidad = parseInt(document.getElementById('replenish-quantity').value, 10);

  const res = await fetch('/api/inventory/replenish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      producto_id: productId,
      presentacion,
      cantidad,
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    showToast(data.error || 'Error al abastecer stock.', 'error');
    return;
  }

  closeReplenishModal();
  await refreshAllData();
  showToast(
    `Inventario actualizado: ${data.product.nombre_comercial} ahora tiene ${data.product.inventario.stock_total_unidades} unidades mínimas.`
  );
}

function openNewProductModal() {
  document.getElementById('new-product-modal').classList.remove('hidden');
}

function closeNewProductModal() {
  document.getElementById('new-product-modal').classList.add('hidden');
}

async function submitNewProduct(event) {
  event.preventDefault();
  const body = {
    codigo_barras: document.getElementById('np-barcode').value.trim(),
    categoria: document.getElementById('np-category').value.trim(),
    nombre_comercial: document.getElementById('np-name').value.trim(),
    principio_activo: document.getElementById('np-active').value.trim(),
    sintomas_tags: document.getElementById('np-symptoms').value.trim(),
    unidades_por_blister: parseInt(document.getElementById('np-u-blister').value, 10),
    blisters_por_caja: parseInt(document.getElementById('np-b-caja').value, 10),
    stock_total_unidades: parseInt(document.getElementById('np-stock-init').value, 10),
    precio_base: parseFloat(document.getElementById('np-price').value),
    requiere_receta: document.getElementById('np-rx').checked,
  };

  const res = await fetch('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    showToast(data.error || 'Error creando producto.', 'error');
    return;
  }

  closeNewProductModal();
  await refreshAllData();
  showToast(`Medicamento '${data.product.nombre_comercial}' incorporado con éxito.`);
}

/* =========================================================================
   MÓDULO 4: WHATSAPP BUSINESS API LOGS Y CONFIGURACIÓN
   ========================================================================= */

async function loadWhatsAppLogs() {
  const res = await fetch('/api/whatsapp/logs');
  const data = await res.json();
  if (!data.ok) return;
  state.whatsappLogs = data.logs;
  state.whatsappConfig = data.config || {};

  // Poblar campos de configuración si existen
  const cfg = state.whatsappConfig;
  if (document.getElementById('wa-cfg-provider')) {
    document.getElementById('wa-cfg-provider').value = cfg.provider || 'META_CLOUD_API';
    document.getElementById('wa-cfg-pharmacy-phone').value = cfg.pharmacy_whatsapp || '18095550199';
    document.getElementById('wa-cfg-meta-phone-id').value = cfg.meta_phone_number_id || '105928374650192';
    document.getElementById('wa-cfg-meta-token').value = cfg.meta_access_token || '';
    document.getElementById('wa-cfg-twilio-sid').value = cfg.twilio_account_sid || '';
    document.getElementById('wa-cfg-twilio-token').value = cfg.twilio_auth_token || '';
    document.getElementById('wa-cfg-base-url').value = cfg.public_base_url || 'http://localhost:8080';
  }

  renderWhatsAppLogs();
}

function renderWhatsAppLogs() {
  const container = document.getElementById('wa-logs-container');
  if (!container) return;

  if (!state.whatsappLogs.length) {
    container.innerHTML = `
      <div class="p-8 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
        Aún no se han disparado notificaciones en esta sesión. Realiza un pedido de prueba desde la <strong>App Paciente</strong> para ver los 2 despachos automáticos hacia Meta WhatsApp Cloud API / Twilio.
      </div>
    `;
    return;
  }

  container.innerHTML = state.whatsappLogs
    .map(
      (log) => `
      <div class="rounded-2xl border border-slate-200 overflow-hidden shadow-xs bg-white">
        <div class="bg-slate-900 text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded bg-teal-500 text-slate-950 font-extrabold text-[10px]">
              ${log.destinatario_rol}
            </span>
            <span class="font-mono font-bold">+${log.telefono_destino}</span>
            <span class="text-slate-400">• Orden #${log.codigo_orden}</span>
          </div>
          <div class="flex items-center gap-2 text-[11px] font-mono">
            <span class="text-emerald-400">${log.proveedor_api} (HTTP ${log.http_status})</span>
            <span class="text-slate-400">${log.fecha_hora}</span>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">
          <!-- Vista previa del mensaje recibido en WhatsApp -->
          <div class="p-3.5 wa-chat-bg">
            <p class="text-[10px] font-extrabold uppercase text-slate-600 mb-1.5">Vista del Mensaje Entregado:</p>
            <div class="wa-bubble p-3 text-[11px] text-slate-900">${log.mensaje_texto}</div>
          </div>

          <!-- Payload técnico enviado por el Backend a la API de WhatsApp Business -->
          <div class="p-3.5 bg-slate-950 text-slate-200 font-mono text-[10px] overflow-x-auto space-y-2">
            <div class="text-teal-400 font-bold">POST ${log.endpoint_url}</div>
            <pre class="text-[10px] leading-relaxed text-emerald-300">${JSON.stringify(log.payload_parsed, null, 2)}</pre>
          </div>
        </div>
      </div>
    `
    )
    .join('');
}

async function saveWhatsAppConfig(event) {
  event.preventDefault();
  const payload = {
    provider: document.getElementById('wa-cfg-provider').value,
    pharmacy_whatsapp: document.getElementById('wa-cfg-pharmacy-phone').value.trim(),
    meta_phone_number_id: document.getElementById('wa-cfg-meta-phone-id').value.trim(),
    meta_access_token: document.getElementById('wa-cfg-meta-token').value.trim(),
    twilio_account_sid: document.getElementById('wa-cfg-twilio-sid').value.trim(),
    twilio_auth_token: document.getElementById('wa-cfg-twilio-token').value.trim(),
    public_base_url: document.getElementById('wa-cfg-base-url').value.trim(),
  };

  const res = await fetch('/api/whatsapp/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (data.ok) {
    showToast('Configuración de WhatsApp Business API guardada en el backend.');
    loadWhatsAppLogs();
  }
}

// Inicialización al cargar la página
window.addEventListener('DOMContentLoaded', async () => {
  checkPatientAuthOnLoad();
  await initAppPharmacies();
  loadAppCartFromStorage();
  await fetchAndApplyLivePharmacyConfig();
  refreshAllData();
  refreshActiveOrderBanner();
  startActiveOrderPolling();
  updateAppAllergiesBadge();
});


// ============================================================================
// COMPUERTA DE ACCESO POR CLAVE / PIN PARA PACIENTES (PATIENT AUTH GATE)
// ============================================================================
let currentPatient = null;

function openPatientAuthModal() {
  const gateEl = document.getElementById('patient-auth-gate-screen');
  if (gateEl) {
    gateEl.classList.remove('hidden');
    gateEl.classList.add('flex');
    gateEl.style.display = 'flex';
  }
}

function closePatientAuthModal() {
  const gateEl = document.getElementById('patient-auth-gate-screen');
  if (gateEl) {
    gateEl.classList.add('hidden');
    gateEl.classList.remove('flex');
    gateEl.style.display = 'none';
  }
}

function updatePatientHeaderUI() {
  const badgeEl = document.getElementById('patient-auth-badge');
  const loginBtn = document.getElementById('btn-open-patient-login');
  const nameEl = document.getElementById('header-patient-name');

  if (currentPatient && currentPatient.nombre_completo) {
    if (badgeEl) {
      badgeEl.classList.remove('hidden');
      badgeEl.classList.add('flex');
      badgeEl.style.display = 'flex';
    }
    if (loginBtn) {
      loginBtn.classList.add('hidden');
      loginBtn.style.display = 'none';
    }
    if (nameEl) nameEl.textContent = currentPatient.nombre_completo;
  } else {
    if (badgeEl) {
      badgeEl.classList.add('hidden');
      badgeEl.classList.remove('flex');
      badgeEl.style.display = 'none';
    }
    if (loginBtn) {
      loginBtn.classList.remove('hidden');
      loginBtn.classList.add('inline-flex');
      loginBtn.style.display = 'inline-flex';
    }
    if (nameEl) nameEl.textContent = 'Paciente';
  }
}

function checkPatientAuthOnLoad() {
  const sessionStr = sessionStorage.getItem('farmasys_patient_session');

  if (sessionStr) {
    try {
      currentPatient = JSON.parse(sessionStr);
      prefillPatientData();
      loadAppChronic5DayReminders();
    } catch (e) {
      sessionStorage.removeItem('farmasys_patient_session');
      currentPatient = null;
    }
  } else {
    currentPatient = null;
  }

  // Mostrar pantalla de login profesional al abrir la App si no hay sesión activa
  if (currentPatient && currentPatient.nombre_completo) {
    closePatientAuthModal();
  } else {
    openPatientAuthModal();
  }
  updatePatientHeaderUI();
}

function prefillPatientData() {
  if (!currentPatient) return;
  const nameInput = document.getElementById('app-client-name');
  const phoneInput = document.getElementById('app-client-phone');
  const addressInput = document.getElementById('app-client-address');

  if (nameInput && currentPatient.nombre_completo) nameInput.value = currentPatient.nombre_completo;
  if (phoneInput && currentPatient.telefono) phoneInput.value = currentPatient.telefono;
  if (addressInput && currentPatient.direccion_frecuente) addressInput.value = currentPatient.direccion_frecuente;

  const qNombre = document.getElementById('app-queja-nombre-input-aparte');
  const qTel = document.getElementById('app-queja-telefono-input-aparte');
  if (qNombre && currentPatient.nombre_completo) qNombre.value = currentPatient.nombre_completo;
  if (qTel && currentPatient.telefono) qTel.value = currentPatient.telefono;
}

function switchPatientAuthMode(mode) {
  const loginTab = document.getElementById('tab-patient-login');
  const regTab = document.getElementById('tab-patient-register');
  const forgotTab = document.getElementById('tab-patient-forgot');
  const loginForm = document.getElementById('form-patient-login');
  const regForm = document.getElementById('form-patient-register');
  const forgotForm = document.getElementById('form-patient-forgot');

  const activeCls = 'flex-1 py-2 rounded-lg bg-white text-teal-800 shadow transition font-bold cursor-pointer';
  const idleCls = 'flex-1 py-2 rounded-lg text-slate-600 hover:text-slate-900 transition font-bold cursor-pointer';

  if (loginTab) loginTab.className = mode === 'login' ? activeCls : idleCls;
  if (regTab) regTab.className = mode === 'register' ? activeCls : idleCls;
  if (forgotTab) forgotTab.className = mode === 'forgot' ? activeCls : idleCls;

  if (loginForm) loginForm.classList.toggle('hidden', mode !== 'login');
  if (regForm) regForm.classList.toggle('hidden', mode !== 'register');
  if (forgotForm) forgotForm.classList.toggle('hidden', mode !== 'forgot');
}

async function handlePatientLogin(event) {
  if (event && event.preventDefault) event.preventDefault();
  const idVal = document.getElementById('pac-login-id').value.trim();
  const passVal = document.getElementById('pac-login-password').value.trim();
  const errEl = document.getElementById('pac-login-error');
  if (errEl) errEl.classList.add('hidden');

  try {
    const res = await fetch('/api/patient/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identificador: idVal, clave_acceso: passVal })
    });
    const data = await res.json();
    if (!data.ok) {
      if (errEl) {
        errEl.textContent = data.error || 'Credenciales de paciente incorrectas.';
        errEl.classList.remove('hidden');
      }
      return;
    }

    currentPatient = data.patient;
    sessionStorage.setItem('farmasys_patient_session', JSON.stringify(data.patient));
    closePatientAuthModal();
    updatePatientHeaderUI();
    prefillPatientData();
    loadAppChronic5DayReminders();
    showToast(`¡Bienvenido(a), ${currentPatient.nombre_completo}! Has entrado a la app.`);
  } catch (err) {
    if (errEl) {
      errEl.textContent = 'Error al conectar con el servidor.';
      errEl.classList.remove('hidden');
    }
  }
}

async function handlePatientRegister(event) {
  if (event && event.preventDefault) event.preventDefault();
  const nombre = document.getElementById('pac-reg-nombre').value.trim();
  const email = document.getElementById('pac-reg-email')?.value.trim() || '';
  const tel = document.getElementById('pac-reg-tel').value.trim();
  const cedula = document.getElementById('pac-reg-cedula').value.trim();
  const clave = document.getElementById('pac-reg-clave').value.trim();
  const dir = document.getElementById('pac-reg-dir').value.trim();
  const errEl = document.getElementById('pac-reg-error');
  if (errEl) errEl.classList.add('hidden');

  try {
    const res = await fetch('/api/patient/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre_completo: nombre,
        email: email,
        telefono: tel,
        cedula: cedula,
        clave_acceso: clave,
        direccion_frecuente: dir
      })
    });
    const data = await res.json();
    if (!data.ok) {
      if (errEl) {
        errEl.textContent = data.error || 'Error en el registro del paciente.';
        errEl.classList.remove('hidden');
      }
      return;
    }

    currentPatient = data.patient;
    sessionStorage.setItem('farmasys_patient_session', JSON.stringify(data.patient));
    closePatientAuthModal();
    updatePatientHeaderUI();
    prefillPatientData();
    loadAppChronic5DayReminders();
    showToast(`¡Cuenta creada con éxito! Bienvenido(a), ${currentPatient.nombre_completo}.`);
  } catch (err) {
    if (errEl) {
      errEl.textContent = 'Error al registrar la cuenta.';
      errEl.classList.remove('hidden');
    }
  }
}

function handlePatientLogout() {
  currentPatient = null;
  sessionStorage.removeItem('farmasys_patient_session');
  localStorage.removeItem('davalsi_chronic_phone');

  // Limpiar campos de cliente para que no queden datos expuestos
  const nameInput = document.getElementById('app-client-name');
  const phoneInput = document.getElementById('app-client-phone');
  const addressInput = document.getElementById('app-client-address');
  if (nameInput) nameInput.value = '';
  if (phoneInput) phoneInput.value = '';
  if (addressInput) addressInput.value = '';

  // Ocultar banner de crónicos del cliente anterior
  const banner = document.getElementById('app-chronic-5d-alert-banner');
  if (banner) {
    banner.classList.add('hidden');
    banner.style.display = 'none';
  }

  // Limpiar carrito
  state.cart = [];
  state.appCart = [];
  if (typeof updateFloatingCartUI === 'function') updateFloatingCartUI();
  if (typeof updateAppCartUI === 'function') updateAppCartUI();

  openPatientAuthModal();
  updatePatientHeaderUI();
  showToast('Has cerrado sesión en tu cuenta. Inicia sesión para continuar.');
}

window.openPatientAuthModal = openPatientAuthModal;
window.closePatientAuthModal = closePatientAuthModal;
window.updatePatientHeaderUI = updatePatientHeaderUI;
window.handlePatientLogin = handlePatientLogin;
window.handlePatientRegister = handlePatientRegister;
window.handlePatientLogout = handlePatientLogout;
window.switchPatientAuthMode = switchPatientAuthMode;

// SINCRONIZACIÓN EN TIEMPO REAL DE SERVICIOS CON EL SISTEMA POS
// (Pago con Tarjeta, Envío a Domicilio y Seguro Médico ARS)
// ============================================================================

async function fetchAndApplyLivePharmacyConfig() {
  try {
    const res = await fetch(`/api/pharmacy/config?farmacia_id=${getActiveAppPharmacyId()}`);
    const data = await res.json();
    if (data.ok && data.config) {
      applyPatientAppServiceConfig(data.config);
    }
  } catch (e) {}
}

function selectAppDeliveryMode(mode) {
  const deliveryAllowed = state.pharmacyConfig ? state.pharmacyConfig.envio_domicilio_activo !== false : true;
  if (mode === 'DOMICILIO' && !deliveryAllowed) {
    showToast('🚫 El servicio de Envío a Domicilio se encuentra temporalmente deshabilitado por la farmacia.', 'error');
    mode = 'RETIRO_FARMACIA';
  }
  state.appDeliveryMode = mode;

  const btnDom = document.getElementById('btn-delivery-domicilio');
  const btnRet = document.getElementById('btn-delivery-retiro');
  const addrWrap = document.getElementById('app-address-field-wrap');
  const addrLabel = document.getElementById('app-address-label');
  const addrInput = document.getElementById('app-client-address');

  if (mode === 'DOMICILIO') {
    if (btnDom) btnDom.className = 'p-2.5 rounded-xl border-2 border-teal-600 bg-teal-50/70 text-left transition flex items-center gap-2';
    if (btnRet) btnRet.className = 'p-2.5 rounded-xl border-2 border-slate-200 bg-white text-left transition flex items-center gap-2';
    if (addrWrap) addrWrap.classList.remove('hidden');
    if (addrLabel) addrLabel.textContent = 'Dirección Exacta de Entrega a Domicilio *';
    if (addrInput && addrInput.value.startsWith('Retiro en Sucursal')) {
      addrInput.value = currentPatient?.direccion_frecuente || 'Calle Polibio Díaz #44, Evaristo Morales, Santo Domingo';
    }
  } else {
    if (btnRet) btnRet.className = 'p-2.5 rounded-xl border-2 border-teal-600 bg-teal-50/70 text-left transition flex items-center gap-2';
    if (btnDom) {
      btnDom.className = deliveryAllowed
        ? 'p-2.5 rounded-xl border-2 border-slate-200 bg-white text-left transition flex items-center gap-2'
        : 'p-2.5 rounded-xl border-2 border-rose-200 bg-rose-50/50 text-left transition flex items-center gap-2 opacity-60 cursor-not-allowed';
    }
    if (addrLabel) addrLabel.textContent = 'Sucursal de Retiro / Nota de Recogida';
    const phName = (state.pharmacyConfig && state.pharmacyConfig.nombre) || 'Sucursal Principal';
    if (addrInput) addrInput.value = `Retiro en Sucursal — ${phName}`;
  }
  renderCartDrawerItems();
}

function applyPatientAppServiceConfig(cfg) {
  if (!cfg) return;
  const cardActive = cfg.pago_tarjeta_activo !== false;
  const deliveryActive = cfg.envio_domicilio_activo !== false;
  const arsActive = cfg.seguro_medico_activo !== false;

  state.pharmacyConfig = {
    ...cfg,
    pago_tarjeta_activo: cardActive,
    envio_domicilio_activo: deliveryActive,
    seguro_medico_activo: arsActive,
  };

  const phName = cfg.nombre || 'FarmaSys';
  document.title = `${phName} - Tu Salud y Bienestar`;
  document.querySelectorAll('.app-dynamic-pharmacy-name').forEach((el) => {
    el.textContent = phName;
  });
  const hdrName = document.getElementById('app-header-pharmacy-name');
  if (hdrName) hdrName.textContent = phName.toUpperCase();
  const infoAddr = document.getElementById('app-info-address');
  if (infoAddr) infoAddr.textContent = cfg.direccion || cfg.ciudad_sector || 'Sucursal Principal';
  const infoPhone = document.getElementById('app-info-phone');
  if (infoPhone) infoPhone.textContent = cfg.telefono || 'Consultar';
  const infoPhoneLink = document.getElementById('app-info-phone-link');
  if (infoPhoneLink && cfg.telefono) infoPhoneLink.href = `tel:${String(cfg.telefono).replace(/[^0-9+]/g, '')}`;
  const infoHours = document.getElementById('app-info-hours');
  const horarioText = cfg.horario || 'Lun-Dom 7:00 AM - 11:00 PM';
  if (infoHours) infoHours.textContent = horarioText;
  const openStatus = evaluatePharmacyOpenStatus(horarioText);
  state.pharmacyOpenStatus = openStatus;
  const openBadge = document.getElementById('app-open-status-badge');
  if (openBadge) {
    openBadge.textContent = openStatus.label;
    openBadge.className = openStatus.open
      ? 'ml-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300'
      : 'ml-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300';
  }
  const heroTitle = document.getElementById('app-hero-pharmacy-title');
  if (heroTitle) heroTitle.textContent = `Tu salud a un toque en ${phName}`;
  const checkoutTitle = document.getElementById('app-checkout-pharmacy-title');
  if (checkoutTitle) checkoutTitle.textContent = `Confirmar Pedido — ${phName}`;
  const bankTitle = document.getElementById('app-bank-pharmacy-title');
  if (bankTitle) bankTitle.textContent = `🏦 Cuentas Bancarias ${phName} (RD$):`;
  const bankBox = document.getElementById('app-bank-details-box');
  if (bankBox) {
    const banco = cfg.banco_nombre || 'Banco Popular / Banreservas';
    const cuenta = cfg.banco_cuenta || 'Consultar con la sucursal';
    const rnc = cfg.rnc || 'N/A';
    bankBox.innerHTML = `• ${banco}: ${cuenta}<br/>• RNC: ${rnc} (${phName})`;
  }

  // 1. Cintillo superior en el catálogo de la App
  const topCard = document.getElementById('app-top-status-card');
  if (topCard) {
    topCard.textContent = cardActive ? '💳 Pago con Tarjeta: Disponible' : '🔒 Pago con Tarjeta: No Disponible';
    topCard.className = cardActive
      ? 'px-2.5 py-1 rounded-full font-extrabold text-[11px] bg-emerald-100 text-emerald-800 border border-emerald-300'
      : 'px-2.5 py-1 rounded-full font-extrabold text-[11px] bg-rose-100 text-rose-800 border border-rose-300';
  }
  const topDel = document.getElementById('app-top-status-delivery');
  if (topDel) {
    topDel.textContent = deliveryActive ? '🛵 Envío a Domicilio: Disponible' : '🔒 Envío a Domicilio: Solo Retiro en Farmacia';
    topDel.className = deliveryActive
      ? 'px-2.5 py-1 rounded-full font-extrabold text-[11px] bg-emerald-100 text-emerald-800 border border-emerald-300'
      : 'px-2.5 py-1 rounded-full font-extrabold text-[11px] bg-rose-100 text-rose-800 border border-rose-300';
  }
  const topArs = document.getElementById('app-top-status-ars');
  if (topArs) {
    topArs.textContent = arsActive ? '🛡️ Seguro Médico (ARS): Disponible' : '🔒 Seguro Médico (ARS): No Disponible';
    topArs.className = arsActive
      ? 'px-2.5 py-1 rounded-full font-extrabold text-[11px] bg-emerald-100 text-emerald-800 border border-emerald-300'
      : 'px-2.5 py-1 rounded-full font-extrabold text-[11px] bg-rose-100 text-rose-800 border border-rose-300';
  }

  // 2. Control de Envío a Domicilio en el Checkout Drawer
  const delBadge = document.getElementById('app-drawer-delivery-badge');
  const delBanner = document.getElementById('app-delivery-blocked-banner');
  const subDom = document.getElementById('sub-delivery-domicilio');
  if (delBadge) {
    delBadge.textContent = deliveryActive ? '🛵 Delivery Activo' : '🔒 Delivery Bloqueado';
    delBadge.className = deliveryActive
      ? 'px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800'
      : 'px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800';
  }
  if (delBanner) delBanner.classList.toggle('hidden', deliveryActive);
  if (subDom) {
    subDom.textContent = deliveryActive ? 'Entrega en tu casa' : '🔒 No disponible';
    subDom.className = deliveryActive ? 'text-[10px] text-slate-500' : 'text-[10px] font-bold text-rose-600';
  }
  if (!deliveryActive) {
    selectAppDeliveryMode('RETIRO_FARMACIA');
  } else {
    selectAppDeliveryMode(state.appDeliveryMode || 'DOMICILIO');
  }

  // 3. Control de Seguro Médico (ARS) en el Checkout Drawer
  const arsBadge = document.getElementById('app-drawer-ars-badge');
  const arsBanner = document.getElementById('app-ars-blocked-banner');
  const arsSelect = document.getElementById('app-insurance-ars');
  const arsAff = document.getElementById('app-insurance-affiliate');
  if (arsBadge) {
    arsBadge.textContent = arsActive ? '🛡️ ARS Disponible' : '🔒 ARS Bloqueado';
    arsBadge.className = arsActive
      ? 'px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800'
      : 'px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800';
  }
  if (arsBanner) arsBanner.classList.toggle('hidden', arsActive);
  if (arsSelect) {
    if (!arsActive) {
      arsSelect.value = 'Sin Seguro';
      arsSelect.disabled = true;
      arsSelect.className = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-slate-100 text-slate-400 cursor-not-allowed';
    } else {
      arsSelect.disabled = false;
      arsSelect.className = 'w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white';
    }
  }
  if (arsAff) {
    if (!arsActive) {
      arsAff.value = '';
      arsAff.disabled = true;
      arsAff.className = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono bg-slate-100 text-slate-400 cursor-not-allowed';
    } else {
      arsAff.disabled = false;
      arsAff.className = 'w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono bg-white';
    }
  }

  // 4. Control de Pago con Tarjeta en el Checkout Drawer
  const cardBadge = document.getElementById('app-drawer-card-badge');
  const cardBanner = document.getElementById('app-card-blocked-banner');
  const btnTarjeta = document.getElementById('btn-pay-tarjeta');
  const subTarjeta = document.getElementById('sub-pay-tarjeta');
  if (cardBadge) {
    cardBadge.textContent = cardActive ? '💳 Tarjeta Disponible' : '🔒 Tarjeta Bloqueada';
    cardBadge.className = cardActive
      ? 'px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800'
      : 'px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800';
  }
  if (cardBanner) cardBanner.classList.toggle('hidden', cardActive);
  if (subTarjeta) {
    subTarjeta.textContent = cardActive ? 'Crédito / Débito' : '🔒 Bloqueado';
    subTarjeta.className = cardActive ? 'text-[9px] sm:text-[10px] text-slate-500' : 'text-[9px] sm:text-[10px] font-bold text-rose-600';
  }
  if (!cardActive) {
    if (state.appPaymentMethod === 'TARJETA') {
      selectAppPaymentMethod('EFECTIVO');
    }
    if (btnTarjeta) {
      btnTarjeta.className = 'p-2.5 sm:p-3 rounded-xl border-2 border-rose-200 bg-rose-50/40 text-left transition opacity-60 cursor-not-allowed';
    }
  } else if (state.appPaymentMethod !== 'TARJETA' && btnTarjeta) {
    btnTarjeta.className = 'p-2.5 sm:p-3 rounded-xl border-2 border-slate-200 bg-white text-left transition';
  }
}

// Escuchar cambios instantáneos emitidos desde el Sistema POS en otra pestaña
window.addEventListener('storage', (e) => {
  if (e.key === 'farmasys_live_service_sync' && e.newValue) {
    try {
      const syncData = JSON.parse(e.newValue);
      applyPatientAppServiceConfig(syncData);
    } catch (err) {}
  }
});

window.addEventListener('focus', () => {
  fetchAndApplyLivePharmacyConfig();
});

setInterval(() => {
  fetchAndApplyLivePharmacyConfig();
}, 5000);


// ============================================================================
// CONTROLES DE BARRA DE DESPLAZAMIENTO DE SINTOMATOLOGÍA (APP PACIENTES)
// ============================================================================
function scrollSymptomsBar(deltaX) {
  const container = document.getElementById('symptom-pills-container');
  if (!container) return;
  container.scrollBy({ left: deltaX, behavior: 'smooth' });
  setTimeout(syncSymptomScrollRange, 250);
}

function onSymptomSliderInput(val) {
  const container = document.getElementById('symptom-pills-container');
  if (!container) return;
  const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
  container.scrollLeft = (Number(val) / 100) * maxScroll;
}

function syncSymptomScrollRange() {
  const container = document.getElementById('symptom-pills-container');
  const slider = document.getElementById('symptom-scroll-slider');
  if (!container || !slider) return;
  const maxScroll = Math.max(1, container.scrollWidth - container.clientWidth);
  const pct = Math.min(100, Math.max(0, Math.round((container.scrollLeft / maxScroll) * 100)));
  slider.value = String(pct);
}


// ============================================================================
// MOTOR AUTÓNOMO DE COMPRA PARA APK MÓVIL (FUNCIONA EN CUALQUIER CELULAR)
// Permite comprar por Caja, Blíster o Unidad, calcular cambio, elegir Tarjeta o
// Depósito, adjuntar receta y procesar la orden tanto conectado al POS como autónomo.
// ============================================================================
function openDirectOrderWhatsApp() {
  const order = state.lastConfirmedAppOrder;
  if (!order) return;
  const itemsText = (order.items || [])
    .map((i) => `• ${i.cantidad_presentacion}x ${i.presentacion} ${i.nombre_comercial} (${formatRD(i.subtotal)})`)
    .join('\n');
  const phName = (state.pharmacyConfig && state.pharmacyConfig.nombre) || 'Farmacia';
  const msg =
    `Hola *${phName}*, acabo de realizar el pedido *#${order.codigo_orden}* desde la App Móvil:\n\n` +
    `👤 *Cliente:* ${order.cliente_nombre}\n` +
    `📞 *Teléfono:* ${order.cliente_telefono}\n` +
    `📍 *Entrega:* ${order.cliente_direccion}\n` +
    `🛡️ *Seguro ARS:* ${order.seguro_ars || 'Sin Seguro'}\n` +
    `💳 *Método de Pago:* ${order.metodo_pago} (${order.referencia_pago || ''})\n\n` +
    `💊 *Detalle del Pedido:*\n${itemsText}\n\n` +
    `💰 *TOTAL:* ${formatRD(order.total)}`;
  const rawWa = (state.pharmacyConfig && (state.pharmacyConfig.telefono_whatsapp || state.pharmacyConfig.whatsapp_notificaciones)) || '18095550199';
  const farmPhone = String(rawWa).replace(/\D/g, '');
  const waUrl = `https://wa.me/${farmPhone}?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');
}

function configurePosServerIp() {
  const currentUrl = localStorage.getItem('davalsi_apk_server_url') || 'http://192.168.1.100:8080';
  const newUrl = prompt(
    'Ingresa la URL del servidor FarmaSys (ejemplo: https://tu-app.onrender.com o http://192.168.1.100:8080):',
    currentUrl
  );
  if (newUrl !== null) {
    const clean = newUrl.trim().replace(/\/$/, '');
    if (clean) {
      localStorage.setItem('davalsi_apk_server_url', clean);
      showToast(`Conectando con servidor POS: ${clean}`);
    } else {
      localStorage.removeItem('davalsi_apk_server_url');
      showToast('URL de servidor personalizada eliminada.');
    }
    refreshAllData();
  }
}

// =============================================================================
// PROGRAMA DE PACIENTES CRÓNICOS Y MEDICACIÓN CONTINUA (APP PACIENTE)
// =============================================================================

function openChronicPatientModal() {
  const modal = document.getElementById('modal-app-chronic-register');
  if (!modal) return;

  const nameInput = document.getElementById('pac-chronic-name');
  const phoneInput = document.getElementById('pac-chronic-phone');
  const cedulaInput = document.getElementById('pac-chronic-cedula');
  const dateInput = document.getElementById('pac-chronic-date');

  // Prellenar si hay paciente autenticado o datos previos
  if (typeof currentPatient !== 'undefined' && currentPatient) {
    if (nameInput && currentPatient.nombre_completo) nameInput.value = currentPatient.nombre_completo;
    if (phoneInput && currentPatient.telefono) phoneInput.value = currentPatient.telefono;
    if (cedulaInput && currentPatient.cedula) cedulaInput.value = currentPatient.cedula;
  } else {
    const savedPhone = localStorage.getItem('davalsi_chronic_phone');
    if (savedPhone && phoneInput && !phoneInput.value) phoneInput.value = savedPhone;
    const savedName = localStorage.getItem('davalsi_chronic_name');
    if (savedName && nameInput && !nameInput.value) nameInput.value = savedName;
  }

  // Fecha de inicio por defecto: HOY
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  updateChronicRefillCalc();

  modal.classList.remove('hidden');
  modal.style.display = 'flex';
}

function closeChronicPatientModal() {
  const modal = document.getElementById('modal-app-chronic-register');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

function handleChronicDiagChange(val) {
  const customInput = document.getElementById('pac-chronic-diag-custom');
  if (!customInput) return;
  if (val === 'OTRO') {
    customInput.classList.remove('hidden');
    customInput.focus();
  } else {
    customInput.classList.add('hidden');
  }
}

function handleChronicMedSearch(query) {
  const val = (query || '').trim().toLowerCase();
  const suggestionsBox = document.getElementById('pac-chronic-med-suggestions');
  if (!suggestionsBox) return;

  if (val.length < 2) {
    suggestionsBox.classList.add('hidden');
    suggestionsBox.innerHTML = '';
    return;
  }

  const products = (typeof state !== 'undefined' && state.products) ? state.products : [];
  const matches = products.filter(p => 
    (p.nombre || '').toLowerCase().includes(val) || 
    (p.principio_activo || '').toLowerCase().includes(val)
  ).slice(0, 6);

  if (matches.length === 0) {
    suggestionsBox.innerHTML = `
      <div class="px-3 py-2 text-slate-500 text-[11px] italic">
        No encontrado en catálogo. Puedes continuar escribiendo el nombre manualmente.
      </div>
    `;
    suggestionsBox.classList.remove('hidden');
    return;
  }

  suggestionsBox.innerHTML = matches.map(p => `
    <div onclick="selectChronicMedSuggestion(${p.id}, '${escapeJsQuotes(p.nombre)}', '${escapeJsQuotes(p.principio_activo || '')}')" class="px-3 py-2 rounded-xl hover:bg-purple-50 hover:text-purple-900 cursor-pointer flex items-center justify-between transition border-b border-slate-100 last:border-b-0">
      <div>
        <p class="font-extrabold text-slate-900 text-xs">${p.nombre}</p>
        <p class="text-[10px] text-purple-700 font-semibold">${p.principio_activo || 'Principio activo no indicado'}</p>
      </div>
      <span class="text-[10px] font-bold text-slate-400 font-mono">RD$ ${Number(p.precio_unidad || 0).toFixed(2)}</span>
    </div>
  `).join('');
  suggestionsBox.classList.remove('hidden');
}

function selectChronicMedSuggestion(id, nombre, pa) {
  const medInput = document.getElementById('pac-chronic-med');
  const paInput = document.getElementById('pac-chronic-pa');
  const prodIdInput = document.getElementById('pac-chronic-prod-id');
  const suggestionsBox = document.getElementById('pac-chronic-med-suggestions');

  if (medInput) medInput.value = nombre;
  if (paInput) paInput.value = pa;
  if (prodIdInput) prodIdInput.value = id;
  if (suggestionsBox) {
    suggestionsBox.classList.add('hidden');
    suggestionsBox.innerHTML = '';
  }
}

function updateChronicRefillCalc() {
  const dateInput = document.getElementById('pac-chronic-date');
  const daysSelect = document.getElementById('pac-chronic-days');
  const calcEndEl = document.getElementById('calc-chronic-end-date');
  const calcAlertEl = document.getElementById('calc-chronic-alert-date');

  if (!dateInput || !daysSelect || !calcEndEl || !calcAlertEl) return;

  const dateVal = dateInput.value;
  const days = parseInt(daysSelect.value || '30', 10);

  if (!dateVal) {
    calcEndEl.textContent = '-';
    calcAlertEl.textContent = '-';
    return;
  }

  const parts = dateVal.split('-');
  const startDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  
  const endDate = new Date(startDate.getTime());
  endDate.setDate(endDate.getDate() + days);

  const alertDate = new Date(endDate.getTime());
  alertDate.setDate(alertDate.getDate() - 5);

  const formatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
  calcEndEl.textContent = endDate.toLocaleDateString('es-DO', formatOptions);
  calcAlertEl.textContent = alertDate.toLocaleDateString('es-DO', formatOptions);
}

async function submitChronicPatientFromApp(event) {
  if (event && event.preventDefault) event.preventDefault();

  const nameVal = document.getElementById('pac-chronic-name').value.trim();
  const phoneVal = document.getElementById('pac-chronic-phone').value.trim();
  const cedulaVal = document.getElementById('pac-chronic-cedula').value.trim();
  const diagSelect = document.getElementById('pac-chronic-diag').value;
  const diagCustom = document.getElementById('pac-chronic-diag-custom').value.trim();
  const diagVal = diagSelect === 'OTRO' ? (diagCustom || 'Condición Crónica') : diagSelect;
  const medVal = document.getElementById('pac-chronic-med').value.trim();
  const paVal = document.getElementById('pac-chronic-pa').value.trim();
  const prodId = parseInt(document.getElementById('pac-chronic-prod-id').value || '0', 10);
  const doseVal = document.getElementById('pac-chronic-dose').value.trim();
  const daysVal = parseInt(document.getElementById('pac-chronic-days').value || '30', 10);
  const dateVal = document.getElementById('pac-chronic-date').value;
  const notesVal = document.getElementById('pac-chronic-notes').value.trim();
  const errEl = document.getElementById('pac-chronic-error');
  const submitBtn = document.getElementById('btn-submit-chronic-app');

  if (errEl) errEl.classList.add('hidden');

  if (!nameVal || !phoneVal || !diagVal || !medVal) {
    if (errEl) {
      errEl.textContent = 'Por favor completa tu nombre, teléfono, diagnóstico y medicamento.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳</span> <span>Guardando en Sistema...</span>';
  }

  try {
    const payload = {
      farmacia_id: getActiveAppPharmacyId(),
      paciente_nombre: nameVal,
      paciente_telefono: phoneVal,
      paciente_cedula: cedulaVal,
      diagnostico_cronico: diagVal,
      medicamento_nombre: medVal,
      producto_id: prodId,
      principio_activo: paVal,
      dosis_diaria: doseVal || '1 comprimido diario',
      duracion_dias: daysVal,
      fecha_ultimo_despacho: dateVal || new Date().toISOString().split('T')[0],
      notas: notesVal ? `${notesVal} (Inscrito desde App Móvil)` : 'Inscrito desde App Móvil'
    };

    const res = await fetch('/api/chronic-patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.error || 'No se pudo guardar la inscripción.');
    }

    // Guardar teléfono para consultas futuras
    localStorage.setItem('davalsi_chronic_phone', phoneVal);
    localStorage.setItem('davalsi_chronic_name', nameVal);

    showToast(`¡Inscripción exitosa! Estás registrado en el Programa Crónico de Farmacia Davalsi.`);
    closeChronicPatientModal();

    // Abrir automáticamente la vista de "Mis Tratamientos"
    setTimeout(() => {
      openMyChronicTreatmentsModal(phoneVal);
    }, 400);

  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || 'Error de conexión al registrar.';
      errEl.classList.remove('hidden');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>✅</span> <span>Completar Inscripción</span>';
    }
  }
}

function openMyChronicTreatmentsModal(preferredPhone) {
  const modal = document.getElementById('modal-app-my-chronic');
  if (!modal) return;

  const phoneInput = document.getElementById('my-chronic-phone-input');
  const targetPhone = preferredPhone || 
    (typeof currentPatient !== 'undefined' && currentPatient ? currentPatient.telefono : '') || 
    localStorage.getItem('davalsi_chronic_phone') || '';

  if (phoneInput && targetPhone) {
    phoneInput.value = targetPhone;
  }

  modal.classList.remove('hidden');
  modal.style.display = 'flex';

  loadMyChronicTreatments();
}

function closeMyChronicTreatmentsModal() {
  const modal = document.getElementById('modal-app-my-chronic');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

async function loadMyChronicTreatments() {
  const container = document.getElementById('my-chronic-treatments-container');
  const phoneInput = document.getElementById('my-chronic-phone-input');
  if (!container) return;

  const phone = phoneInput ? phoneInput.value.trim() : '';

  if (!phone) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-500 bg-slate-50 rounded-2xl border border-slate-200">
        <p class="text-2xl mb-1">📱</p>
        <p class="font-bold">Escribe tu número de teléfono para ver tus tratamientos registrados.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="p-6 text-center text-slate-500">
      <div class="inline-block animate-spin text-xl mb-1">⏳</div>
      <p>Consultando tratamientos en la farmacia...</p>
    </div>
  `;

  try {
    const res = await fetch(`/api/chronic-patients?farmacia_id=${getActiveAppPharmacyId()}&telefono=${encodeURIComponent(phone)}`);
    const data = await res.json();

    const patients = (data.patients && data.patients.patients) ? data.patients.patients : [];

    if (patients.length === 0) {
      container.innerHTML = `
        <div class="p-6 text-center text-slate-500 bg-purple-50/50 rounded-2xl border border-purple-200 space-y-2">
          <p class="text-3xl">🩺</p>
          <p class="font-extrabold text-slate-800 text-sm">No encontramos tratamientos asociados a este teléfono.</p>
          <p class="text-xs text-slate-500">¿Tomas algún medicamento todos los meses? Inscríbete ahora para apartar tu stock y recibir recordatorio 5 días antes.</p>
          <button type="button" onclick="closeMyChronicTreatmentsModal(); openChronicPatientModal();" class="mt-2 px-4 py-2 rounded-xl bg-purple-700 text-white font-bold text-xs shadow">
            ➕ Inscribir Medicamento Ahora
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = patients.map(p => {
      const dias = p.dias_restantes;
      let badgeHtml = '';
      let borderClass = 'border-slate-200';

      if (dias < 0) {
        badgeHtml = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300">🔴 Agotado hace ${Math.abs(dias)} día(s)</span>`;
        borderClass = 'border-rose-300 bg-rose-50/30';
      } else if (dias <= 5) {
        badgeHtml = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">⏰ Recordatorio 5 Días: Quedan ${dias} día(s)</span>`;
        borderClass = 'border-amber-300 bg-amber-50/40';
      } else {
        badgeHtml = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">🟢 Vigente (${dias} días restantes)</span>`;
        borderClass = 'border-emerald-200 bg-emerald-50/20';
      }

      return `
        <div class="p-3.5 rounded-2xl border ${borderClass} bg-white shadow-xs space-y-2">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-base">💊</span>
                <h4 class="font-extrabold text-sm text-slate-900">${p.medicamento_nombre}</h4>
              </div>
              <p class="text-[11px] text-purple-700 font-semibold">${p.principio_activo ? 'Principio Activo: ' + p.principio_activo : ''} • Condición: ${p.diagnostico_cronico}</p>
            </div>
            <div>
              ${badgeHtml}
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <div>
              <span class="text-slate-400 block text-[10px]">Dosis diaria:</span>
              <span class="font-bold text-slate-800">${p.dosis_diaria || '1 comprimido diario'}</span>
            </div>
            <div>
              <span class="text-slate-400 block text-[10px]">Próxima reposición:</span>
              <span class="font-bold font-mono text-slate-800">${p.fecha_proximo_vencimiento_tratamiento}</span>
            </div>
            <div class="col-span-2 sm:col-span-1">
              <span class="text-slate-400 block text-[10px]">Ciclo:</span>
              <span class="font-bold text-slate-800">Cada ${p.duracion_dias} días</span>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span class="text-[10px] text-slate-400">Paciente: <strong>${p.paciente_nombre}</strong></span>
            <div class="flex items-center gap-1.5">
              <button type="button" onclick="orderChronicViaWhatsApp('${escapeJsQuotes(p.paciente_nombre)}', '${escapeJsQuotes(p.medicamento_nombre)}', ${p.dias_restantes})" class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition">
                <span>📲</span> <span>Pedir por WhatsApp</span>
              </button>
              <button type="button" onclick="renewMyChronicTreatment(${p.id}, ${p.duracion_dias})" title="Confirmar que compraste tu medicina para extender el calendario otros ${p.duracion_dias} días" class="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-800 border border-slate-200 font-bold text-xs transition">
                🔄 Renovar Ciclo
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    container.innerHTML = `
      <div class="p-4 text-center text-rose-700 bg-rose-50 rounded-2xl border border-rose-200">
        Error al cargar los tratamientos: ${err.message}
      </div>
    `;
  }
}

function orderChronicViaWhatsApp(pacienteNombre, medNombre, diasRestantes) {
  const farmaciaPhone = '18492831899'; // Teléfono oficial Farmacia Davalsi
  let msg = `Hola Farmacia Davalsi, soy ${pacienteNombre}. Estoy inscrito en su Programa de Pacientes Crónicos. Deseo coordinar la reposición de mi medicamento continuo: ${medNombre}.`;
  if (diasRestantes <= 5) {
    msg += ` (A mi tratamiento le quedan ${diasRestantes > 0 ? diasRestantes : 0} días).`;
  }
  msg += ` ¿Tienen disponibilidad para retiro o envío a domicilio?`;

  const url = `https://wa.me/${farmaciaPhone}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

async function renewMyChronicTreatment(patientId, duracionDias) {
  if (!confirm(`¿Deseas renovar el ciclo de tratamiento por ${duracionDias} días más?`)) return;

  try {
    const res = await fetch('/api/chronic-patients/renew', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: getActiveAppPharmacyId(),
        paciente_id: patientId,
        dias_agregados: duracionDias
      })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al renovar.');

    showToast('¡Tratamiento renovado con éxito! Se ha actualizado la fecha de tu próxima alerta.');
    loadMyChronicTreatments();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function escapeJsQuotes(str) {
  return String(str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

window.openChronicPatientModal = openChronicPatientModal;
window.closeChronicPatientModal = closeChronicPatientModal;
window.handleChronicDiagChange = handleChronicDiagChange;
window.handleChronicMedSearch = handleChronicMedSearch;
window.selectChronicMedSuggestion = selectChronicMedSuggestion;
window.updateChronicRefillCalc = updateChronicRefillCalc;
window.submitChronicPatientFromApp = submitChronicPatientFromApp;
window.openMyChronicTreatmentsModal = openMyChronicTreatmentsModal;
window.closeMyChronicTreatmentsModal = closeMyChronicTreatmentsModal;
window.loadMyChronicTreatments = loadMyChronicTreatments;
window.orderChronicViaWhatsApp = orderChronicViaWhatsApp;
window.renewMyChronicTreatment = renewMyChronicTreatment;


/* =========================================================================
   KITS ALIVIO EN 1 CLIC — OFERTAS SEMANALES EN LA APP DEL PACIENTE
   ========================================================================= */
async function loadPromotionalKits() {
  try {
    const res = await fetch(`/api/promotional-kits?farmacia_id=${getActiveAppPharmacyId()}`);
    const data = await res.json();
    if (data.ok) {
      state.promotionalKits = data.kits || [];
      renderAppPromotionalKits();
    }
  } catch (err) {
    console.error('Error al cargar kits promocionales:', err);
  }
}

function renderAppPromotionalKits() {
  const container = document.getElementById('app-kits-grid');
  if (!container) return;

  const kits = state.promotionalKits || [];
  if (!kits.length) {
    container.innerHTML = `
      <div class="col-span-full p-4 rounded-2xl bg-white/80 border border-amber-200 text-center text-xs text-slate-500 font-semibold">
        Cargando kits médicos disponibles...
      </div>
    `;
    return;
  }

  // Tarjetas de kits limpias y compactas: Solo nombre bonito y precio destacado (el desglose se abre al hacer clic)
  container.innerHTML = kits.map(kit => {
    const isAvailable = kit.disponible !== false && (kit.kits_disponibles == null || kit.kits_disponibles > 0);
    const hasOffer = Number(kit.ahorro_monto || 0) > 0;
    const numItems = (kit.items || []).length;
    const dosisTotal = kit.total_dosis_unidades || (kit.items || []).reduce((a, b) => a + Number(b.cantidad || 1), 0);

    return `
      <div class="group bg-white rounded-2xl p-3.5 sm:p-4 shadow-xs hover:shadow-md transition-all duration-200 border-2 ${isAvailable ? 'border-amber-200 hover:border-amber-400' : 'border-slate-200 opacity-75'} flex items-center justify-between gap-3">
        <!-- Lado Izquierdo: Icono, Nombre Bonito y Botón para ver contenido -->
        <div class="flex items-center gap-3 min-w-0 cursor-pointer flex-1" onclick="openKitDetailModal('${kit.id}')" title="Toca para ver qué contiene este kit">
          <div class="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-400 text-slate-950 flex items-center justify-center text-xl shrink-0 shadow-sm group-hover:scale-105 transition">
            ${kit.icono || '⚡'}
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="px-2 py-0.2 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                ${dosisTotal} Dosis • ${numItems} Medicamentos
              </span>
              ${hasOffer ? `<span class="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800">Ahorras RD$ ${Number(kit.ahorro_monto).toFixed(0)}</span>` : ''}
            </div>
            <h4 class="text-xs sm:text-sm font-black text-slate-900 truncate mt-0.5 group-hover:text-amber-800 transition">${kit.nombre_kit}</h4>
            <button type="button" class="text-[11px] font-bold text-teal-700 hover:underline flex items-center gap-1 mt-0.5">
              <span>👁️ Ver qué contiene</span> <span class="text-[10px]">➔</span>
            </button>
          </div>
        </div>

        <!-- Lado Derecho: Precio y Botón de Pedir en 1 Clic -->
        <div class="text-right shrink-0 flex flex-col items-end gap-1.5">
          <div>
            ${hasOffer ? `<span class="text-[10px] text-slate-400 line-through block font-mono font-bold leading-none">${formatRD(kit.precio_regular_total)}</span>` : ''}
            <span class="text-base sm:text-lg font-black text-slate-950 block leading-tight">${formatRD(kit.precio_oferta_kit)}</span>
          </div>
          <button
            type="button"
            onclick="addKitToAppCart('${kit.id}', true)"
            ${!isAvailable ? 'disabled' : ''}
            class="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-[11px] transition flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
            title="Pedir este kit de inmediato"
          >
            <span>⚡</span> <span>Pedir</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function openKitDetailModal(kitId) {
  const kit = (state.promotionalKits || []).find(k => String(k.id) === String(kitId) || k.codigo_kit === kitId);
  if (!kit) return;

  const compsHtml = (kit.items || []).map(comp => {
    const unitLabel = comp.presentacion === 'BLISTER'
      ? 'Blíster'
      : (comp.presentacion === 'CAJA' ? 'Caja' : (comp.unidad_minima_nombre || 'Unidad'));
    return `
      <div class="flex items-center justify-between text-xs py-2 px-3 rounded-xl bg-slate-50 border border-slate-200">
        <div class="flex items-center gap-2">
          <span class="text-base">${comp.icono || '💊'}</span>
          <div>
            <span class="font-extrabold text-slate-900 block">${comp.cantidad}x ${unitLabel} ${comp.nombre_comercial}</span>
            <span class="text-[10px] text-teal-700 font-semibold block">${comp.principio_activo || ''}</span>
          </div>
        </div>
        <span class="font-mono font-black text-slate-900 text-xs">RD$ ${Number(comp.precio_unitario * comp.cantidad).toFixed(2)}</span>
      </div>
    `;
  }).join('');

  const modal = document.getElementById('modal-app-kit-detail');
  if (modal) {
    document.getElementById('modal-kit-detail-icon').textContent = kit.icono || '⚡';
    document.getElementById('modal-kit-detail-name').textContent = kit.nombre_kit;
    document.getElementById('modal-kit-detail-desc').textContent = kit.descripcion || 'Kit médico preparado por la farmacia.';
    document.getElementById('modal-kit-detail-items').innerHTML = compsHtml;
    document.getElementById('modal-kit-detail-price').textContent = formatRD(kit.precio_oferta_kit);
    document.getElementById('modal-kit-detail-btn-cart').onclick = () => { addKitToAppCart(kit.id, false); closeKitDetailModal(); };
    document.getElementById('modal-kit-detail-btn-quick').onclick = () => { addKitToAppCart(kit.id, true); closeKitDetailModal(); };

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeKitDetailModal() {
  const modal = document.getElementById('modal-app-kit-detail');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

window.openKitDetailModal = openKitDetailModal;
window.closeKitDetailModal = closeKitDetailModal;

function addKitToAppCart(kitId, openCheckoutImmediately = false) {
  const kit = (state.promotionalKits || []).find(k => String(k.id) === String(kitId) || k.codigo_kit === kitId);
  if (!kit) {
    showToast('Kit no encontrado', 'error');
    return;
  }

  const existing = state.appCart.find(i => i.es_kit && (String(i.kit_id) === String(kit.id) || i.codigo_kit === kit.codigo_kit));
  if (existing) {
    existing.cantidad += 1;
  } else {
    state.appCart.push({
      es_kit: true,
      kit_id: kit.id,
      codigo_kit: kit.codigo_kit,
      nombre_comercial: `[KIT] ${kit.nombre_kit}`,
      product: {
        id: 0,
        nombre_comercial: kit.nombre_kit,
        principio_activo: 'Kit Alivio en 1 Clic (Semanal)',
        precios_presentacion: { KIT: kit.precio_oferta_kit },
        precio_base: kit.precio_oferta_kit,
        unidad_minima_nombre: 'Kit',
        inventario: { stock_total_unidades: kit.kits_disponibles || 50 }
      },
      presentacion: 'KIT',
      cantidad: 1,
      precio_oferta: kit.precio_oferta_kit,
      precio_regular: kit.precio_regular_total,
      ahorro: kit.ahorro_monto,
      items_desglose: kit.items
    });
  }

  updateFloatingCartUI();
  showToast(`⚡ ¡${kit.nombre_kit} agregado al carrito! Ahorro: ${formatRD(kit.ahorro_monto)}`);

  if (openCheckoutImmediately) {
    openCartDrawer();
  }
}

window.loadPromotionalKits = loadPromotionalKits;
window.renderAppPromotionalKits = renderAppPromotionalKits;
window.addKitToAppCart = addKitToAppCart;



/* =========================================================================
   EXTENSIÓN FARMA-IA EN LA APP DE CLIENTES (4 PILARES DEL PACIENTE):
   1. Ayuda en la compra por Principio Activo si no se encuentra el medicamento
   2. Recordatorio 5 días antes de que se terminen sus medicamentos crónicos
   3. Control de Presión Arterial, Azúcar, Peso y Talla tomados con nosotros
   4. Guía de uso de la App, cómo comprar y cómo usar WhatsApp al pedir
   ========================================================================= */

let appAiSearchDebounce = null;
let appVitalsHistoryCache = [];

function normalizeAppAiTabKey(tabKey) {
  const map = {
    'principio': 'principio_activo',
    'principio_activo': 'principio_activo',
    'cronicos5d': 'cronicos_5d',
    'cronicos_5d': 'cronicos_5d',
    'signos': 'presion_azucar_peso',
    'presion_azucar_peso': 'presion_azucar_peso',
    'guia': 'guia_app_whatsapp',
    'guia_app_whatsapp': 'guia_app_whatsapp',
    'quejas': 'quejas_ia',
    'quejas_ia': 'quejas_ia',
    'sugerencias': 'quejas_ia',
    'receta': 'receta_ia',
    'receta_ia': 'receta_ia',
    'ocr': 'receta_ia'
  };
  return map[tabKey] || 'principio_activo';
}

function openAppAiAssistantModal(initialTab = 'principio_activo', initialQuery = '') {
  const m = document.getElementById('modal-app-interactive-vitals');
  if (!m) return;
  m.classList.remove('hidden');
  m.classList.add('flex');

  const normTab = normalizeAppAiTabKey(initialTab);
  switchAppAiTab(normTab);

  if (normTab === 'principio_activo') {
    const inp = document.getElementById('app-ai-modal-sub-input');
    const q = (initialQuery || state.searchQuery || '').trim();
    if (inp && q) {
      inp.value = q;
      searchAppAiModalSubstitute(q);
    }
  }
}

function openAppInteractiveVitalsModal() {
  openAppAiAssistantModal('presion_azucar_peso');
}

function closeAppInteractiveVitalsModal() {
  const m = document.getElementById('modal-app-interactive-vitals');
  if (m) {
    m.classList.add('hidden');
    m.classList.remove('flex');
  }
}

function switchAppAiTab(tabKey) {
  const normTab = normalizeAppAiTabKey(tabKey);
  const tabs = ['principio_activo', 'cronicos_5d', 'presion_azucar_peso', 'guia_app_whatsapp', 'quejas_ia', 'receta_ia'];
  tabs.forEach(k => {
    const panel = document.getElementById(`app-ai-tab-view-${k}`);
    const btn = document.getElementById(`app-ai-tab-btn-${k}`);
    if (panel) {
      if (k === normTab) panel.classList.remove('hidden');
      else panel.classList.add('hidden');
    }
    if (btn) {
      if (k === normTab) {
        btn.className = 'px-3.5 py-2 rounded-xl bg-indigo-600 text-white shadow-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap';
      } else {
        btn.className = 'px-3.5 py-2 rounded-xl bg-white text-slate-700 hover:bg-slate-200 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap';
      }
    }
  });

  if (normTab === 'cronicos_5d') {
    const savedPhone = (currentPatient && currentPatient.telefono) ? currentPatient.telefono : (localStorage.getItem('davalsi_chronic_phone') || '');
    const phoneInp = document.getElementById('app-ai-chronic-5d-phone');
    if (phoneInp && savedPhone) {
      phoneInp.value = savedPhone;
    }
    loadAppChronic5DayReminders(false);
  } else if (normTab === 'presion_azucar_peso') {
    const savedPhone = localStorage.getItem('davalsi_chronic_phone') || '';
    const savedName = localStorage.getItem('davalsi_chronic_name') || '';
    const vSearch = document.getElementById('app-my-vitals-search');
    if (vSearch && !vSearch.value && (savedPhone || savedName)) {
      vSearch.value = savedPhone || savedName;
    }
    const vName = document.getElementById('app-vital-save-name');
    const vPhone = document.getElementById('app-vital-save-phone');
    if (vName && !vName.value && savedName) vName.value = savedName;
    if (vPhone && !vPhone.value && savedPhone) vPhone.value = savedPhone;
    loadMyPharmacyVitalsHistory();
    evaluateAppVitalsLive();
  } else triggerFarmaIaReaction(normTab);
  if (normTab === 'guia_app_whatsapp') {
    const ansBox = document.getElementById('app-ai-guide-answer');
    if (ansBox && !ansBox.innerHTML.trim()) {
      askAppGuideQuestion('¿Cómo usar WhatsApp cuando estoy pidiendo los medicamentos?');
    }
  }
}

/* -------------------------------------------------------------------------
   PILAR 1: RECOMENDACIÓN DE MEDICAMENTOS POR PRINCIPIO ACTIVO
   ------------------------------------------------------------------------- */
function triggerAppAiSubstituteHelper(queryText) {
  const box = document.getElementById('app-ai-substitute-box');
  if (!box) return;
  const q = (queryText || '').trim();
  if (q.length < 2) {
    box.classList.add('hidden');
    return;
  }
  if (appAiSearchDebounce) clearTimeout(appAiSearchDebounce);
  appAiSearchDebounce = setTimeout(async () => {
    try {
      const fid = getActiveAppPharmacyId();
      const res = await fetch(`/api/ai/suggest-active-ingredient?farmacia_id=${fid}&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!data.ok || !data.total_opciones_en_stock) {
        box.classList.add('hidden');
        return;
      }
      const exactosYBio = [
        ...(data.disponibles_exactos || []),
        ...(data.sustitutos_principio_activo || [])
      ];
      // Máximo 2 fármacos sugeridos de otras terapias relacionadas para evitar confusión
      const otrasTerapias = (data.alternativas_terapeuticas || []).slice(0, 2);

      if (!exactosYBio.length && !otrasTerapias.length) {
        box.classList.add('hidden');
        return;
      }

      box.classList.remove('hidden');

      // 1. Tarjetas con el MISMO Principio Activo (Color Verde/Esmeralda)
      const samePaHtml = exactosYBio.map(p => `
        <div class="p-3 rounded-2xl bg-emerald-950/60 border-2 border-emerald-400/80 flex items-center justify-between gap-2 shadow-sm">
          <div>
            <span class="px-2 py-0.2 rounded-full bg-emerald-400 text-slate-950 font-black text-[9px] uppercase tracking-wider inline-block">
              🧬 MISMO PRINCIPIO ACTIVO: ${p.principio_activo || data.principio_activo_detectado}
            </span>
            <p class="font-black text-white text-xs mt-1">${p.nombre_comercial}</p>
            <p class="text-[11px] text-emerald-300 font-mono font-bold">${formatRD(p.precio_unidad)} <span class="text-[9px] text-slate-300">/ ${p.unidad_minima_nombre || 'Unidad'}</span></p>
          </div>
          <button type="button" onclick="addSubstituteToAppCart(${p.id}, 'UNIDAD')" class="px-3 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black text-xs cursor-pointer shrink-0 shadow">
            + Comprar
          </button>
        </div>
      `).join('');

      // 2. Tarjetas con OTRAS Terapias Sugeridas (Color Ámbar/Naranja, máx 2 fármacos)
      const altTherapyHtml = otrasTerapias.map(p => `
        <div class="p-3 rounded-2xl bg-amber-950/60 border-2 border-amber-400/80 flex items-center justify-between gap-2 shadow-sm">
          <div>
            <span class="px-2 py-0.2 rounded-full bg-amber-400 text-slate-950 font-black text-[9px] uppercase tracking-wider inline-block">
              🩺 OTRA TERAPIA SUGERIDA: ${p.principio_activo || ''}
            </span>
            <p class="font-black text-amber-100 text-xs mt-1">${p.nombre_comercial}</p>
            <p class="text-[11px] text-amber-300 font-mono font-bold">${formatRD(p.precio_unidad)} <span class="text-[9px] text-slate-300">/ ${p.unidad_minima_nombre || 'Unidad'}</span></p>
          </div>
          <button type="button" onclick="addSubstituteToAppCart(${p.id}, 'UNIDAD')" class="px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs cursor-pointer shrink-0 shadow">
            + Comprar
          </button>
        </div>
      `).join('');

      box.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/10">
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-full bg-emerald-400 text-slate-950 font-black text-[10px]">🤖 FARMA-IA</span>
            <span class="text-xs font-black text-teal-300">Principio Activo Detectado: <strong>${data.principio_activo_detectado}</strong></span>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" onclick="openAppAiAssistantModal('principio_activo', '${escapeJsQuotes(q)}')" class="text-[11px] font-black text-amber-300 hover:text-amber-200 underline cursor-pointer">
              Ver detalle completo ➔
            </button>
            <button type="button" onclick="document.getElementById('app-ai-substitute-box').classList.add('hidden')" class="text-xs text-slate-300 hover:text-white cursor-pointer">✕</button>
          </div>
        </div>

        <p class="text-xs text-slate-200 mt-2 leading-relaxed">${data.indicacion_clinica || ''}</p>

        <!-- Bloque 1: Mismo principio activo -->
        ${exactosYBio.length ? `
          <div class="space-y-1.5 mt-2">
            <span class="text-[10px] font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1">
              <span>✅</span> <span>Medicamentos disponibles con el MISMO principio activo (${exactosYBio.length}):</span>
            </span>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              ${samePaHtml}
            </div>
          </div>
        ` : `
          <div class="p-2.5 rounded-xl bg-rose-950/40 border border-rose-400/50 text-rose-200 text-xs font-semibold mt-2">
            ⚠️ No tenemos stock exacto de «${data.principio_activo_detectado}» en este momento.
          </div>
        `}

        <!-- Bloque 2: Otras terapias sugeridas (Máx 2) -->
        ${otrasTerapias.length ? `
          <div class="space-y-1.5 mt-3 pt-2.5 border-t border-white/10">
            <span class="text-[10px] font-black uppercase tracking-wider text-amber-300 flex items-center gap-1">
              <span>🩺</span> <span>Otras terapias relacionadas para su mejoría (Distinto principio activo - Máx 2 sugerencias):</span>
            </span>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              ${altTherapyHtml}
            </div>
          </div>
        ` : ''}
      `;
    } catch (e) {}
  }, 220);
}

function handleAppAiModalSubSubmit(event) {
  if (event && event.preventDefault) event.preventDefault();
  const inp = document.getElementById('app-ai-modal-sub-input');
  if (!inp) return;
  searchAppAiModalSubstitute(inp.value);
}

async function searchAppAiModalSubstitute(queryText) {
  const inp = document.getElementById('app-ai-modal-sub-input');
  const resultsEl = document.getElementById('app-ai-modal-sub-results');
  if (!resultsEl) return;
  const q = (queryText || '').trim();
  if (inp && inp.value !== q) inp.value = q;

  if (!q) {
    resultsEl.innerHTML = `<div class="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 font-semibold">Escribe arriba el medicamento o principio activo que buscas.</div>`;
    return;
  }

  resultsEl.innerHTML = `<div class="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 font-semibold">🤖 Analizando principio activo y buscando equivalentes disponibles en inventario...</div>`;

  try {
    const fid = getActiveAppPharmacyId();
    const res = await fetch(`/api/ai/suggest-active-ingredient?farmacia_id=${fid}&q=${encodeURIComponent(q)}`);
    const data = await res.json();

    if (!data.ok) {
      resultsEl.innerHTML = `<div class="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-bold">No se pudo completar la consulta.</div>`;
      return;
    }

    const sameIngredient = [
      ...(data.disponibles_exactos || []),
      ...(data.sustitutos_principio_activo || [])
    ];
    // Limit therapeutic suggestions strictly to at most 2 items
    const therapeuticOpts = (data.alternativas_terapeuticas || []).slice(0, 2);

    if (!sameIngredient.length && !therapeuticOpts.length) {
      const waMsg = `Hola Farmacia Davalsi, busqué "${q}" en la App y deseo saber qué equivalente con el mismo principio activo tienen disponible.`;
      resultsEl.innerHTML = `
        <div class="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-2.5">
          <p class="text-sm font-black text-amber-950">No encontramos existencias directas para "${q}" en este momento.</p>
          <p class="text-xs text-amber-900">Principio activo detectado: <strong>${data.principio_activo_detectado || q}</strong> (${data.indicacion_clinica || 'Consulta farmacéutica'}).</p>
          <a href="https://wa.me/18492831899?text=${encodeURIComponent(waMsg)}" target="_blank" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-xs">
            <span>📲</span> <span>Consultar disponibilidad por WhatsApp</span>
          </a>
        </div>
      `;
      return;
    }

    let outHtml = `
      <div class="p-3.5 rounded-2xl bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 shadow-sm">
        <div>
          <span class="text-[10px] font-black uppercase tracking-wider text-teal-400 block">Principio Activo Analizado:</span>
          <h5 class="text-sm font-black text-white flex items-center gap-2">
            <span>🔬</span> <span>${data.principio_activo_detectado || q}</span>
          </h5>
          <p class="text-xs text-slate-300 mt-0.5">${data.indicacion_clinica || 'Acción terapéutica comprobada'}</p>
        </div>
        <div class="text-right">
          <span class="px-3 py-1 rounded-full bg-teal-500/20 border border-teal-400/40 text-teal-300 text-xs font-black">
            ${sameIngredient.length} Bioequivalente(s) • ${therapeuticOpts.length} Sugerencia(s)
          </span>
        </div>
      </div>
    `;

    // 🟢 BLOQUE 1: MISMO PRINCIPIO ACTIVO (VERDE ESMERALDA)
    if (sameIngredient.length > 0) {
      outHtml += `
        <div class="p-3.5 rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/40 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
              <h5 class="text-xs font-black text-emerald-950 uppercase tracking-wide">
                🟢 MISMO PRINCIPIO ACTIVO (Bioequivalentes Farmacéuticos)
              </h5>
            </div>
            <span class="text-[11px] font-extrabold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
              Contienen exactamente: ${data.principio_activo_detectado || q}
            </span>
          </div>
          <p class="text-[11px] text-emerald-900 font-medium">
            Sustitución directa con la misma molécula activa, forma y efecto terapéutico.
          </p>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            ${sameIngredient.map(p => `
              <div class="p-3.5 rounded-2xl bg-white border-2 border-emerald-300 hover:border-emerald-500 shadow-sm flex flex-col justify-between gap-2.5 transition">
                <div>
                  <div class="flex items-start justify-between gap-2">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                      🟢 MISMO PRINCIPIO ACTIVO
                    </span>
                    <span class="text-[11px] font-mono font-bold text-emerald-700">Stock: ${p.stock_unidades} u.</span>
                  </div>
                  <h6 class="text-sm font-black text-slate-900 mt-1.5 leading-snug">${p.nombre_comercial}</h6>
                  <p class="text-xs font-extrabold text-emerald-700 mt-0.5">Molécula: ${p.principio_activo}</p>
                  <p class="text-[11px] text-slate-500">${p.categoria || 'Medicamento'} • Lab: ${p.laboratorio || 'Genérico/Comercial'}</p>
                </div>

                <div class="pt-2 border-t border-slate-100 space-y-2">
                  <div class="grid grid-cols-3 gap-1 text-center text-[10px]">
                    <div class="p-1 rounded-lg bg-emerald-50/50 border border-emerald-200">
                      <span class="text-slate-500 block text-[9px]">Unidad</span>
                      <strong class="text-slate-900 font-mono">${formatRD(p.precio_unidad)}</strong>
                    </div>
                    <div class="p-1 rounded-lg bg-emerald-50/50 border border-emerald-200">
                      <span class="text-slate-500 block text-[9px]">Blíster</span>
                      <strong class="text-slate-900 font-mono">${formatRD(p.precio_blister)}</strong>
                    </div>
                    <div class="p-1 rounded-lg bg-emerald-50/50 border border-emerald-200">
                      <span class="text-slate-500 block text-[9px]">Caja</span>
                      <strong class="text-slate-900 font-mono">${formatRD(p.precio_caja)}</strong>
                    </div>
                  </div>

                  <div class="grid grid-cols-3 gap-1">
                    <button type="button" onclick="addSubstituteToAppCart(${p.id}, 'UNIDAD')" class="px-1.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] cursor-pointer transition">
                      + Unidad
                    </button>
                    <button type="button" onclick="addSubstituteToAppCart(${p.id}, 'BLISTER')" class="px-1.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] cursor-pointer transition">
                      + Blíster
                    </button>
                    <button type="button" onclick="addSubstituteToAppCart(${p.id}, 'CAJA')" class="px-1.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-black text-[10px] cursor-pointer transition">
                      + Caja
                    </button>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // 🟡 BLOQUE 2: OTRAS TERAPIAS SUGERIDAS (ÁMBAR / MÁXIMO 2 FÁRMACOS)
    if (therapeuticOpts.length > 0) {
      outHtml += `
        <div class="p-3.5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/50 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-amber-500 animate-pulse"></span>
              <h5 class="text-xs font-black text-amber-950 uppercase tracking-wide">
                🟡 OTRA TERAPIA SUGERIDA PARA SU MEJORÍA (Distinto Principio Activo)
              </h5>
            </div>
            <span class="text-[10px] font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
              Máx 2 fármacos orientativos
            </span>
          </div>
          <div class="p-2.5 rounded-xl bg-amber-100/70 border border-amber-300 text-amber-950 text-xs">
            <strong>⚠️ Diferenciación de Seguridad:</strong> Este medicamento <u>NO</u> tiene el mismo principio activo. Es una alternativa terapéutica para alivio de la condición consultada.
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            ${therapeuticOpts.map(p => `
              <div class="p-3.5 rounded-2xl bg-white border-2 border-amber-300 hover:border-amber-500 shadow-sm flex flex-col justify-between gap-2.5 transition">
                <div>
                  <div class="flex items-start justify-between gap-2">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                      🟡 TERAPIA SUGERIDA RELACIONADA
                    </span>
                    <span class="text-[11px] font-mono font-bold text-amber-800">Stock: ${p.stock_unidades} u.</span>
                  </div>
                  <h6 class="text-sm font-black text-slate-900 mt-1.5 leading-snug">${p.nombre_comercial}</h6>
                  <p class="text-xs font-bold text-amber-900 mt-0.5">Principio Activo Diferente: ${p.principio_activo}</p>
                  <p class="text-[11px] text-slate-500">${p.categoria || 'Medicamento'} • Lab: ${p.laboratorio || 'Comercial'}</p>
                </div>

                <div class="pt-2 border-t border-slate-100 space-y-2">
                  <div class="grid grid-cols-3 gap-1 text-center text-[10px]">
                    <div class="p-1 rounded-lg bg-amber-50/50 border border-amber-200">
                      <span class="text-slate-500 block text-[9px]">Unidad</span>
                      <strong class="text-slate-900 font-mono">${formatRD(p.precio_unidad)}</strong>
                    </div>
                    <div class="p-1 rounded-lg bg-amber-50/50 border border-amber-200">
                      <span class="text-slate-500 block text-[9px]">Blíster</span>
                      <strong class="text-slate-900 font-mono">${formatRD(p.precio_blister)}</strong>
                    </div>
                    <div class="p-1 rounded-lg bg-amber-50/50 border border-amber-200">
                      <span class="text-slate-500 block text-[9px]">Caja</span>
                      <strong class="text-slate-900 font-mono">${formatRD(p.precio_caja)}</strong>
                    </div>
                  </div>

                  <div class="grid grid-cols-3 gap-1">
                    <button type="button" onclick="addSubstituteToAppCart(${p.id}, 'UNIDAD')" class="px-1.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-black text-[10px] cursor-pointer transition">
                      + Unidad
                    </button>
                    <button type="button" onclick="addSubstituteToAppCart(${p.id}, 'BLISTER')" class="px-1.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] cursor-pointer transition">
                      + Blíster
                    </button>
                    <button type="button" onclick="addSubstituteToAppCart(${p.id}, 'CAJA')" class="px-1.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-black text-[10px] cursor-pointer transition">
                      + Caja
                    </button>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    resultsEl.innerHTML = outHtml;
  } catch (err) {
    resultsEl.innerHTML = `<div class="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-bold">Error al consultar principio activo: ${err.message}</div>`;
  }
}

function addSubstituteToAppCart(productId, presentacion = 'UNIDAD') {
  selectCardPresentation(productId, presentacion);
  addToAppCart(productId);
}

/* -------------------------------------------------------------------------
   PILAR 2: RECORDATORIO 5 DÍAS ANTES DE MEDICAMENTOS DE USO CRÓNICO
   ------------------------------------------------------------------------- */
async function loadAppChronic5DayReminders(autoBannerOnly = false) {
  const banner = document.getElementById('app-chronic-5d-alert-banner');
  const bannerList = document.getElementById('app-chronic-5d-alert-items');

  // REGLA ESTRICTA: La alerta de medicamentos crónicos solo está disponible
  // para quien registre medicamentos crónicos y cuando la fecha se esté acercando a su siguiente compra (<= 5 días).
  if (!currentPatient || !currentPatient.telefono) {
    if (banner) {
      banner.classList.add('hidden');
      banner.style.display = 'none';
    }
    return;
  }

  const phoneFilter = currentPatient.telefono.trim();
  const listEl = document.getElementById('app-ai-chronic-5d-results');
  if (!autoBannerOnly && listEl) {
    listEl.innerHTML = `<div class="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 font-semibold">⏳ Verificando tus medicamentos crónicos registrados...</div>`;
  }

  const fid = getActiveAppPharmacyId();
  const url = `/api/ai/chronic-10d-reminders?farmacia_id=${fid}&days_ahead=5&telefono=${encodeURIComponent(phoneFilter)}`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (!data.ok) {
        if (banner) {
          banner.classList.add('hidden');
          banner.style.display = 'none';
        }
        return;
      }

      // Filtrar estrictamente los pacientes crónicos del usuario autenticado
      const myCleanPhone = String(phoneFilter).replace(/[^0-9]/g, '');
      const todosMisCronicos = (data.todos_los_pacientes_cronicos || data.todos_pacientes || []).filter(r => {
        const rPhone = String(r.paciente_telefono || r.telefono || '').replace(/[^0-9]/g, '');
        return !rPhone || !myCleanPhone || rPhone.includes(myCleanPhone) || myCleanPhone.includes(rPhone);
      });

      // Alerta activa SOLO cuando la fecha se esté acercando a su siguiente compra (<= 5 días o vencido reciente)
      const alertas5d = todosMisCronicos.filter(r => {
        const d = parseInt(r.dias_restantes, 10);
        return d <= 5 && d >= -7;
      });

      const badge5d = document.getElementById('app-ai-tab-badge-5d');
      if (badge5d) badge5d.textContent = String(alertas5d.length);

      // BANNER PRINCIPAL EN LA APP:
      // Se muestra ÚNICAMENTE si tiene medicamentos registrados Y la fecha de compra se está acercando
      if (banner) {
        if (alertas5d.length > 0) {
          banner.classList.remove('hidden');
          banner.style.display = 'block';
          if (bannerList) {
            bannerList.innerHTML = alertas5d.slice(0, 4).map(r => {
              const diasTxt = r.dias_restantes < 0
                ? `Vencido hace ${Math.abs(r.dias_restantes)} día(s)`
                : (r.dias_restantes === 0 ? '¡Se termina HOY!' : `Se termina en ${r.dias_restantes} día(s)`);
              return `
                <div class="p-3.5 rounded-2xl bg-white border border-amber-300 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">${diasTxt}</span>
                      <span class="text-[11px] font-bold text-slate-500">Próxima compra: ${r.fecha_proximo_vencimiento_tratamiento || r.fecha_proximo_vencimiento || 'Próximos días'}</span>
                    </div>
                    <p class="font-black text-slate-900 text-xs mt-1">💊 ${r.medicamento_nombre}</p>
                    <p class="text-[11px] text-slate-600 font-medium">Dosis: ${r.dosis_diaria || 'Tratamiento continuo'}</p>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    ${r.producto_id ? `
                      <button type="button" onclick="addToAppCart(${r.producto_id}, 'CAJA')" class="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs shadow-sm cursor-pointer">
                        🛒 Reponer en Carrito
                      </button>
                    ` : ''}
                    <a href="${r.whatsapp_url || r.wa_link || '#'}" target="_blank" class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-sm flex items-center gap-1 cursor-pointer">
                      <span>📲</span> <span>Pedir por WhatsApp</span>
                    </a>
                  </div>
                </div>
              `;
            }).join('');
          }
        } else {
          banner.classList.add('hidden');
          banner.style.display = 'none';
        }
      }

      // PANEL DETALLADO DE CRÓNICOS DENTRO DEL ASISTENTE:
      if (!autoBannerOnly && listEl) {
        if (todosMisCronicos.length === 0) {
          listEl.innerHTML = `
            <div class="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-3">
              <span class="text-3xl">📋</span>
              <h5 class="font-black text-slate-800 text-sm">No tienes medicamentos crónicos registrados actualmente</h5>
              <p class="text-xs text-slate-500 max-w-md mx-auto">
                La alerta automática se activa únicamente para quienes inscriban sus medicamentos de uso continuo. Inscribe tu tratamiento para que FarmaIA te avise 5 días antes de tu siguiente compra.
              </p>
              <button type="button" onclick="closeAppInteractiveVitalsModal(); if(typeof openChronicPatientModal==='function') openChronicPatientModal();" class="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-xs shadow cursor-pointer">
                ➕ Inscribir Medicamento Crónico
              </button>
            </div>
          `;
        } else if (alertas5d.length > 0) {
          listEl.innerHTML = `
            <div class="space-y-3">
              <div class="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 font-bold flex items-center gap-2">
                <span>⚠️</span> <span>Tienes ${alertas5d.length} medicamento(s) cuya fecha de compra se está acercando:</span>
              </div>
              ${alertas5d.map(r => `
                <div class="p-4 rounded-2xl bg-white border border-amber-300 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                      ${r.dias_restantes <= 0 ? '¡Vence Hoy / Vencido!' : `Faltan ${r.dias_restantes} días para tu compra`}
                    </span>
                    <h5 class="font-black text-slate-900 text-sm mt-1">💊 ${r.medicamento_nombre}</h5>
                    <p class="text-xs text-slate-600 font-semibold">Dosis: ${r.dosis_diaria || '1 cada 24 horas'} • Fecha estimada: ${r.fecha_proximo_vencimiento_tratamiento || r.fecha_proximo_vencimiento}</p>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    ${r.producto_id ? `
                      <button type="button" onclick="addToAppCart(${r.producto_id}, 'CAJA'); closeAppInteractiveVitalsModal();" class="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs cursor-pointer">
                        🛒 Al Carrito
                      </button>
                    ` : ''}
                    <a href="${r.whatsapp_url || r.wa_link || '#'}" target="_blank" class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer">
                      💬 Pedir por WhatsApp
                    </a>
                  </div>
                </div>
              `).join('')}
            </div>
          `;
        } else {
          // Tiene medicamentos registrados pero ninguno está cerca de vencer (> 5 días)
          listEl.innerHTML = `
            <div class="p-5 rounded-2xl bg-emerald-50 border border-emerald-300 space-y-3">
              <div class="flex items-center gap-2 text-emerald-900 font-black text-xs">
                <span>✅</span> <span>Tus tratamientos crónicos están al día</span>
              </div>
              <p class="text-xs text-emerald-800">
                Tienes <strong>${todosMisCronicos.length} medicamento(s) crónico(s)</strong> registrado(s). Tu próxima compra aún no está próxima. FarmaIA te avisará de forma automática en la app cuando falten 5 días.
              </p>
              <div class="space-y-2 pt-2">
                ${todosMisCronicos.map(r => `
                  <div class="p-3 rounded-xl bg-white border border-emerald-200 flex items-center justify-between text-xs">
                    <div>
                      <span class="font-bold text-slate-900">💊 ${r.medicamento_nombre}</span>
                      <span class="text-slate-500 block text-[11px]">Próxima compra: ${r.fecha_proximo_vencimiento_tratamiento || r.fecha_proximo_vencimiento} (faltan ${r.dias_restantes} días)</span>
                    </div>
                    <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">Al día</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }
      }
    })
    .catch(() => {
      if (banner) {
        banner.classList.add('hidden');
        banner.style.display = 'none';
      }
    });
}

async function savePatientVitalsFromApp() {
  const nameVal = (document.getElementById('app-vital-save-name')?.value || '').trim();
  const phoneVal = (document.getElementById('app-vital-save-phone')?.value || '').trim();
  const sys = parseInt(document.getElementById('app-vital-sys')?.value || '0', 10);
  const dia = parseInt(document.getElementById('app-vital-dia')?.value || '0', 10);
  const pulso = parseInt(document.getElementById('app-vital-pulso')?.value || '0', 10);
  const glic = parseFloat(document.getElementById('app-vital-glic')?.value || '0');
  const cond = document.getElementById('app-vital-cond')?.value || 'En Ayunas';
  const peso = parseFloat(document.getElementById('app-vital-peso')?.value || '0');
  const talla = parseFloat(document.getElementById('app-vital-talla')?.value || '0');

  if (!nameVal) {
    showToast('Por favor escribe tu nombre para guardar tu control en la ficha de la farmacia.', 'error');
    document.getElementById('app-vital-save-name')?.focus();
    return;
  }
  if (sys <= 0 && glic <= 0 && peso <= 0 && talla <= 0) {
    showToast('Ingresa al menos tu Presión Arterial, Azúcar, Peso o Talla para guardar el control.', 'error');
    return;
  }

  let tipoServicio = 'TOMA DE PRESIÓN Y GLICEMIA';
  if (sys > 0 && glic <= 0) tipoServicio = 'TOMA DE PRESIÓN ARTERIAL';
  else if (glic > 0 && sys <= 0) tipoServicio = 'PRUEBA DE GLICEMIA CAPILAR';
  if (peso > 0 || talla > 0) tipoServicio += ' + PESO Y TALLA';

  try {
    const res = await fetch('/api/pharmaceutical-care', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: getActiveAppPharmacyId(),
        paciente_nombre: nameVal,
        paciente_telefono: phoneVal,
        tipo_servicio: tipoServicio,
        presion_sistolica: sys > 0 ? sys : null,
        presion_diastolica: dia > 0 ? dia : null,
        pulso_bpm: pulso > 0 ? pulso : null,
        glicemia_mg_dl: glic > 0 ? glic : null,
        condicion_ayuno: cond,
        peso_kg: peso > 0 ? peso : null,
        talla_cm: talla > 0 ? talla : null,
        atendido_por: 'App Paciente / Farmacia Davalsi',
        observaciones: 'Registrado desde la App con verificación interactiva de técnica.'
      })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'No se pudo guardar el registro.');

    if (phoneVal) localStorage.setItem('davalsi_chronic_phone', phoneVal);
    if (nameVal) localStorage.setItem('davalsi_chronic_name', nameVal);

    const searchInp = document.getElementById('app-my-vitals-search');
    if (searchInp) searchInp.value = phoneVal || nameVal;

    showToast('✅ ¡Control de Presión, Azúcar, Peso y Talla guardado en tu historial!');
    loadMyPharmacyVitalsHistory();
  } catch (err) {
    showToast(err.message || 'Error al guardar control', 'error');
  }
}

function printAppVitalRecord(recordId) {
  const r = (appVitalsHistoryCache || []).find(item => Number(item.id) === Number(recordId));
  if (!r) return;
  const pesoLb = r.peso_kg ? (Number(r.peso_kg) * 2.20462).toFixed(1) : null;
  const win = window.open('', '_blank', 'width=460,height=680');
  if (!win) return;
  win.document.write(`
    <html>
      <head>
        <title>Tarjeta de Control #${r.id} - Farmacia Davalsi</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 18px; color: #0f172a; }
          .card { border: 2px solid #0d9488; border-radius: 14px; padding: 16px; max-width: 380px; margin: 0 auto; }
          h2 { margin: 0 0 4px 0; color: #0f766e; font-size: 18px; text-align: center; }
          .sub { text-align: center; font-size: 11px; color: #475569; margin-bottom: 12px; }
          .box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px; margin-bottom: 10px; font-size: 12px; }
          .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
          .val { font-weight: bold; }
        </style>
      </head>
      <body onload="window.print()">
        <div class="card">
          <h2>🏥 FARMACIA DAVALSI</h2>
          <div class="sub">Control de Presión Arterial, Azúcar, Peso y Talla<br/>Fecha: <strong>${r.fecha_toma}</strong> • Hora: <strong>${r.hora_toma}</strong></div>
          <div class="box">
            <div class="row"><span>Paciente:</span><span class="val">${r.paciente_nombre}</span></div>
            <div class="row"><span>Teléfono:</span><span class="val">${r.paciente_telefono || '-'}</span></div>
          </div>
          ${r.presion_sistolica && r.presion_diastolica ? `
            <div class="box">
              <div class="row"><span>💓 Presión Arterial:</span><span class="val">${r.presion_sistolica}/${r.presion_diastolica} mmHg</span></div>
              ${r.pulso_bpm ? `<div class="row"><span>Pulso:</span><span class="val">${r.pulso_bpm} lpm</span></div>` : ''}
              <div class="row"><span>Clasificación:</span><span class="val">${r.clasificacion_presion || ''}</span></div>
            </div>
          ` : ''}
          ${r.glicemia_mg_dl ? `
            <div class="box">
              <div class="row"><span>🩸 Azúcar (Glicemia):</span><span class="val">${r.glicemia_mg_dl} mg/dL (${r.condicion_ayuno || ''})</span></div>
              <div class="row"><span>Clasificación:</span><span class="val">${r.clasificacion_glicemia || ''}</span></div>
            </div>
          ` : ''}
          ${(r.peso_kg || r.talla_cm) ? `
            <div class="box">
              ${r.peso_kg ? `<div class="row"><span>⚖️ Peso:</span><span class="val">${r.peso_kg} kg (${pesoLb} lb)</span></div>` : ''}
              ${r.talla_cm ? `<div class="row"><span>📏 Talla:</span><span class="val">${r.talla_cm} cm</span></div>` : ''}
              ${r.imc ? `<div class="row"><span>IMC:</span><span class="val">${r.imc} kg/m² (${r.clasificacion_imc || ''})</span></div>` : ''}
            </div>
          ` : ''}
          <div style="font-size:10px;text-align:center;color:#64748b;margin-top:10px;">
            Control preventivo registrado en Farmacia Davalsi.
          </div>
        </div>
      </body>
    </html>
  `);
  win.document.close();
}

/* -------------------------------------------------------------------------
   PILAR 4: AYUDA PARA USAR LA APP, CÓMO COMPRAR Y CÓMO USAR WHATSAPP
   ------------------------------------------------------------------------- */
function handleAppGuideFormSubmit(event) {
  if (event && event.preventDefault) event.preventDefault();
  const inp = document.getElementById('app-ai-guide-input');
  if (!inp || !inp.value.trim()) return;
  askAppGuideQuestion(inp.value.trim());
}

async function askAppGuideQuestion(questionText) {
  const box = document.getElementById('app-ai-guide-answer');
  const inp = document.getElementById('app-ai-guide-input');
  if (inp) inp.value = questionText;
  if (!box) return;

  box.innerHTML = `<div class="text-xs text-teal-300 font-bold">🤖 Preparando guía paso a paso...</div>`;

  try {
    const res = await fetch('/api/ai/ask-app-guide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: getActiveAppPharmacyId(),
        question: questionText
      })
    });
    const data = await res.json();
    if (!data.ok) return;

    const actionsHtml = (data.botones_accion || []).map(b => `
      <button type="button" onclick="runAppGuideAction('${b.accion}')" class="px-3 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs cursor-pointer transition">
        ${b.texto}
      </button>
    `).join('');

    box.innerHTML = `
      <div class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <span class="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[10px]">🤖 GUÍA FARMA-IA</span>
          <span class="text-xs font-extrabold text-teal-300">${data.titulo || 'Ayuda de la App'}</span>
        </div>
        <div class="text-xs text-slate-100 leading-relaxed whitespace-pre-line">${(data.respuesta || '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>
        ${actionsHtml ? `<div class="flex flex-wrap items-center gap-2 pt-2">${actionsHtml}</div>` : ''}
      </div>
    `;
  } catch (err) {
    box.innerHTML = `<div class="text-xs text-rose-300 font-bold">Error al consultar guía: ${err.message}</div>`;
  }
}

function runAppGuideAction(actionKey) {
  if (actionKey === 'ABRIR_CARRITO') {
    closeAppInteractiveVitalsModal();
    openCartDrawer();
  } else if (actionKey === 'WHATSAPP_DIRECTO') {
    openDirectPharmacyWhatsAppHelp();
  } else if (actionKey === 'TAB_PRINCIPIO_ACTIVO') {
    switchAppAiTab('principio');
  } else if (actionKey === 'TAB_CRONICOS_5D') {
    switchAppAiTab('cronicos5d');
  } else if (actionKey === 'TAB_SIGNOS_VITALES') {
    switchAppAiTab('signos');
  } else if (actionKey === 'INSCRIBIR_CRONICO') {
    closeAppInteractiveVitalsModal();
    openChronicPatientModal();
  } else if (actionKey === 'IR_CATALOGO') {
    closeAppInteractiveVitalsModal();
    document.getElementById('app-search-input')?.focus();
  }
}

function openDirectPharmacyWhatsAppHelp() {
  const rawWa = (state.pharmacyConfig && (state.pharmacyConfig.telefono_whatsapp || state.pharmacyConfig.whatsapp_notificaciones)) || '18492831899';
  const farmaciaPhone = String(rawWa).replace(/\D/g, '');
  const phName = (state.pharmacyConfig && state.pharmacyConfig.nombre) || 'Farmacia';
  const msg = `Hola ${phName}, estoy usando la App y deseo asistencia para realizar mi pedido de medicamentos.`;
  window.open(`https://wa.me/${farmaciaPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}


async function handleCustomerComplaintSubmit(event) {
  event.preventDefault();
  const nombre = (document.getElementById('app-queja-nombre-input')?.value || '').trim();
  const telefono = (document.getElementById('app-queja-telefono-input')?.value || '').trim();
  const mensaje = (document.getElementById('app-queja-mensaje-input')?.value || '').trim();
  const btn = document.getElementById('btn-submit-app-queja');
  const resultCard = document.getElementById('app-queja-result-card');

  if (!mensaje) {
    if (typeof showToast === 'function') showToast('Por favor describe tu queja o sugerencia.', 'warning');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Procesando receta...</span>';
  }

  try {
    const res = await fetch('/api/app/quejas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: getActiveAppPharmacyId(),
        cliente_nombre: nombre,
        cliente_telefono: telefono,
        mensaje: mensaje
      })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al enviar queja');

    const q = data.queja;
    if (resultCard) {
      resultCard.classList.remove('hidden');
      resultCard.innerHTML = `
        <div class="flex items-center justify-between pb-2 border-b border-slate-700">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
            <span class="text-[11px] font-black uppercase text-emerald-400">TICKET REGISTRADO: ${q.codigo_ticket}</span>
          </div>
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${q.gravedad === 'URGENTE' ? 'bg-rose-500/30 text-rose-300 border border-rose-500/50' : 'bg-amber-500/30 text-amber-300 border border-amber-500/50'}">
            ${q.gravedad}
          </span>
        </div>

        <div class="p-3.5 rounded-xl bg-slate-800/80 border border-teal-500/30 space-y-2">
          <p class="text-xs text-teal-200 font-bold leading-relaxed">🤖 ${q.mensaje_respuesta_ia || 'Tu mensaje ha sido registrado.'}</p>
          <div class="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-400 pt-1 border-t border-slate-700/60">
            <span><strong>Área clasificada por IA:</strong> ${q.area}</span>
            <span class="text-emerald-400 font-extrabold">✓ Transmitido al Mostrador</span>
          </div>
        </div>

        <div class="flex items-center justify-between text-[11px] text-slate-300 pt-1">
          <span>📍 Registrado para revisión del Administrador</span>
          <span class="text-amber-400 font-bold">Estado: Pendiente</span>
        </div>
      `;
    }

    const inpMsg = document.getElementById('app-queja-mensaje-input');
    if (inpMsg) inpMsg.value = '';
    if (typeof showToast === 'function') showToast(`Queja ${q.codigo_ticket} transmitida al mostrador de la farmacia`);
  } catch (err) {
    if (typeof showToast === 'function') showToast('Error al transmitir la queja: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>Enviar Otra Queja o Sugerencia</span> <span>➔</span>';
    }
  }
}

window.handleCustomerComplaintSubmit = handleCustomerComplaintSubmit;
window.openAppAiModal = openAppAiAssistantModal;

window.openAppAiAssistantModal = openAppAiAssistantModal;
window.openAppInteractiveVitalsModal = openAppInteractiveVitalsModal;
window.closeAppInteractiveVitalsModal = closeAppInteractiveVitalsModal;
window.switchAppAiTab = switchAppAiTab;
window.triggerAppAiSubstituteHelper = triggerAppAiSubstituteHelper;
window.handleAppAiModalSubSubmit = handleAppAiModalSubSubmit;
window.searchAppAiModalSubstitute = searchAppAiModalSubstitute;
window.addSubstituteToAppCart = addSubstituteToAppCart;
window.loadAppChronic5DayReminders = loadAppChronic5DayReminders;
window.loadMyPharmacyVitalsHistory = loadMyPharmacyVitalsHistory;
window.evaluateAppVitalsLive = evaluateAppVitalsLive;
window.savePatientVitalsFromApp = savePatientVitalsFromApp;
window.printAppVitalRecord = printAppVitalRecord;
window.handleAppGuideFormSubmit = handleAppGuideFormSubmit;
window.askAppGuideQuestion = askAppGuideQuestion;
window.runAppGuideAction = runAppGuideAction;
window.openDirectPharmacyWhatsAppHelp = openDirectPharmacyWhatsAppHelp;

setTimeout(() => {
  loadAppChronic5DayReminders(true);
}, 700);


/* =========================================================================
   COMPORTAMIENTO INTERACTIVO Y REACCIONES 3D DE FARMA-IA EN CADA FUNCIÓN
   ========================================================================= */

const FARMAIA_3D_DIALOGUES = {
  welcome: [
    "¡Hola! 👋 Soy <strong>FarmaIA 3D</strong>, tu copiloto de salud y compra de medicamentos.",
    "¿Buscabas una marca y no la encuentras? 🧬 Te busco opciones con el mismo principio activo.",
    "¿Tomas medicamentos todos los meses? ⏰ Te aviso 5 días antes para que no te falten.",
    "¿Quieres tomar tu presión, azúcar, peso o talla? ❤️‍🩹 Puedes revisarlos o medirlos aquí."
  ],
  principio_activo: [
    "¡Modo Principio Activo activado! 🧬 Si no encuentras la marca exacta, dime qué necesitas y te recomendaré opciones equivalentes en stock.",
    "Revisando moléculas y bioequivalencias farmacéuticas en inventario... 🔍"
  ],
  cronicos_5d: [
    "¡Modo Recordatorio Crónico activado! ⏰ Estoy monitoreando tus tratamientos continuos para avisarte 5 días antes.",
    "Así nunca te quedarás sin medicación y podrás pedirla en 1 clic o por WhatsApp 📲"
  ],
  presion_azucar_peso: [
    "¡Modo Monitoreo Clínico 3D activo! ❤️‍🩹 Revisemos tu Presión Arterial, Azúcar, Peso, Talla e IMC.",
    "Recuerda estar en reposo al menos 5 minutos antes de la toma para mayor precisión clínica 🩺"
  ],
  guia_app_whatsapp: [
    "¡Aquí estoy para guiarte! 📲 Te explico cómo comprar por unidad/blíster/caja y cómo coordinar por WhatsApp.",
    "Puedes enviarnos recetas médicas, seguros ARS o recibos de transferencia directamente por el chat 💬"
  ]
};

function setFarmaIa3dSpeech(text, durationMs = 6000) {
  return;
  const bubble = document.getElementById('farmaia-bubble-msg');
  const bubbleText = document.getElementById('farmaia-bubble-text');
  if (!bubble || !bubbleText) return;
  bubbleText.innerHTML = text;
  bubble.classList.remove('hidden');
  bubble.classList.add('flex');
  if (durationMs > 0) {
    if (window._farmaiaBubbleTimer) clearTimeout(window._farmaiaBubbleTimer);
    window._farmaiaBubbleTimer = setTimeout(() => {
      // keep visible or cycle randomly
    }, durationMs);
  }
}

function triggerFarmaIaReaction(role) {
  return;
  if (window.farmaIaModal3D) {
    window.farmaIaModal3D.setMode(role);
    window.farmaIaModal3D.triggerSalute();
  }
  if (window.farmaIaFab3D) {
    window.farmaIaFab3D.setMode(role);
  }
  const quotes = FARMAIA_3D_DIALOGUES[role] || FARMAIA_3D_DIALOGUES.welcome;
  const chosen = quotes[Math.floor(Math.random() * quotes.length)];
  setFarmaIa3dSpeech(chosen);

  // Play gentle pulse animation on 3D avatar
  const avatars = document.querySelectorAll('.farmaia-3d-avatar');
  avatars.forEach(img => {
    img.style.transform = 'scale(1.18) rotate(3deg)';
    setTimeout(() => { img.style.transform = ''; }, 450);
  });
}

function toggleFarmaIaFabMenu() {
  const modal = document.getElementById('modal-app-interactive-vitals');
  if (modal && !modal.classList.contains('hidden')) {
    closeAppInteractiveVitalsModal();
  } else {
    triggerFarmaIaReaction('welcome');
    openAppAiAssistantModal('guia_app_whatsapp');
  }
}

window.setFarmaIa3dSpeech = setFarmaIa3dSpeech;
window.triggerFarmaIaReaction = triggerFarmaIaReaction;
window.toggleFarmaIaFabMenu = toggleFarmaIaFabMenu;


/* =========================================================================
   INICIALIZACIÓN DEL MOTOR 3D EN LA APP DE PACIENTES
   ========================================================================= */
function initFarmaIa3dViewers() {
  return;
  if (typeof FarmaIa3DViewer === 'undefined' || typeof THREE === 'undefined') return;

  // 1. Floating Action Button 3D avatar
  if (!window.farmaIaFab3D && document.getElementById('farmaia-fab-3d-canvas')) {
    try {
      window.farmaIaFab3D = new FarmaIa3DViewer('farmaia-fab-3d-canvas', {
        width: 80,
        height: 80,
        interactive: false,
        initialMode: 'idle'
      });
    } catch (e) {
      console.warn('Error inicializando 3D FAB:', e);
    }
  }

  // 2. Modal Header 3D Interactive Robot
  if (!window.farmaIaModal3D && document.getElementById('farmaia-modal-3d-canvas')) {
    try {
      window.farmaIaModal3D = new FarmaIa3DViewer('farmaia-modal-3d-canvas', {
        width: 80,
        height: 80,
        interactive: true,
        initialMode: 'welcome'
      });
    } catch (e) {
      console.warn('Error inicializando 3D Modal:', e);
    }
  }
}

// Hook tab switch to update 3D Robot modes
const origSwitchAppAiTab = window.switchAppAiTab;

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(initFarmaIa3dViewers, 300);
});
setTimeout(initFarmaIa3dViewers, 800);


// =========================================================================
// MÓDULO APP: OCR DE RECETAS MÉDICAS CON VISIÓN IA Y ALERGIAS
// =========================================================================

window.appCurrentOcrReceta = null;

async function executeAppRecetaOcr(demoFilename) {
  const loading = document.getElementById('app-ocr-loading');
  const results = document.getElementById('app-ocr-results');
  if (loading) loading.classList.remove('hidden');
  if (results) results.classList.add('hidden');

  try {
    const fId = (state.activePharmacy && state.activePharmacy.id) ? state.activePharmacy.id : 1;
    const res = await fetch('/api/receta/ocr-procesar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: fId,
        image_data: demoFilename,
        patient_cedula: ''
      })
    });
    const data = await res.json();
    renderAppOcrResults(data);
  } catch (err) {
    showToast('Error al analizar receta: ' + err.message, 'error');
  } finally {
    if (loading) loading.classList.add('hidden');
  }
}

function handleAppCustomRecetaFile(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = async function(e) {
    const base64 = e.target.result;
    const loading = document.getElementById('app-ocr-loading');
    const results = document.getElementById('app-ocr-results');
    if (loading) loading.classList.remove('hidden');
    if (results) results.classList.add('hidden');

    try {
      const fId = (state.activePharmacy && state.activePharmacy.id) ? state.activePharmacy.id : 1;
      const res = await fetch('/api/receta/ocr-procesar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farmacia_id: fId,
          image_data: base64,
          patient_cedula: ''
        })
      });
      const data = await res.json();
      renderAppOcrResults(data);
    } catch (err) {
      showToast('Error al leer la foto: ' + err.message, 'error');
    } finally {
      if (loading) loading.classList.add('hidden');
    }
  };
  reader.readAsDataURL(file);
}

function renderAppOcrResults(data) {
  if (!data.ok) {
    showToast('No se pudo procesar la receta.', 'error');
    return;
  }
  window.appCurrentOcrReceta = data;

  const results = document.getElementById('app-ocr-results');
  const docTitle = document.getElementById('app-ocr-doc-title');
  const diagText = document.getElementById('app-ocr-diag-text');
  const patText = document.getElementById('app-ocr-patient-text');
  const medsList = document.getElementById('app-ocr-meds-list');
  const btnPreload = document.getElementById('app-btn-preload-recipe');

  if (docTitle) docTitle.textContent = `${data.medico?.nombre || 'Médico'} • Exeq: ${data.medico?.exequatur || 'N/A'}`;
  if (diagText) diagText.textContent = `Diagnóstico: ${data.medico?.diagnostico || 'Consulta Médica'}`;
  if (patText) patText.textContent = `Paciente: ${data.paciente?.nombre || 'Tú'} (Cédula: ${data.paciente?.cedula || 'N/A'})`;

  let approvedCount = 0;
  if (medsList) {
    medsList.innerHTML = (data.medicamentos_prescritos || []).map(m => {
      const isBlocked = m.alerta_alergia;
      if (!isBlocked && m.en_stock) approvedCount++;
      return `
        <div class="p-3.5 rounded-2xl ${isBlocked ? 'bg-rose-50 border-2 border-rose-400' : 'bg-white border border-slate-200'} shadow-xs space-y-2">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="font-extrabold text-slate-900 text-xs">${m.nombre_recetado}</p>
              <p class="text-[10px] text-slate-500 font-mono">Principio: ${m.principio_activo} • ${m.dosis}</p>
              <p class="text-xs text-indigo-900 font-medium mt-1">📋 ${m.posologia}</p>
            </div>
            <div class="text-right shrink-0">
              <span class="font-bold text-xs text-slate-900 block">$${(m.precio_unitario).toFixed(2)} USD</span>
              <span class="text-[9px] ${m.en_stock ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'}">${m.en_stock ? 'En Stock' : 'Agotado'}</span>
            </div>
          </div>

          ${isBlocked ? `
            <div class="p-2.5 rounded-xl bg-rose-100/80 border border-rose-300 text-rose-950 text-xs space-y-1">
              <p class="font-black flex items-center gap-1.5 text-rose-800">
                <span>⛔ ALERTA CLÍNICA:</span>
                <span>${m.motivo_seguridad}</span>
              </p>
              ${m.alternativas_seguras && m.alternativas_seguras.length ? `
                <div class="pt-1 flex items-center justify-between text-[11px]">
                  <span class="font-bold text-teal-900">Sugerencia médica segura:</span>
                  <span class="px-2 py-0.5 rounded-md bg-teal-600 text-white font-extrabold text-[10px]">${m.alternativas_seguras[0].nombre}</span>
                </div>
              ` : ''}
            </div>
          ` : `
            <div class="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px]">
              <span class="text-emerald-700 font-extrabold flex items-center gap-1"><span>✅</span> <span>Seguro para tu salud</span></span>
              <span class="text-slate-400">Verificado por el sistema</span>
            </div>
          `}
        </div>
      `;
    }).join('');
  }

  if (btnPreload) {
    btnPreload.innerHTML = `<span>🛒 Agregar al Pedido (${approvedCount} Medicamento${approvedCount === 1 ? '' : 's'} Seguro${approvedCount === 1 ? '' : 's'})</span>`;
  }
  if (results) results.classList.remove('hidden');
}

function preloadAppRecipeToCart() {
  if (!window.appCurrentOcrReceta) return;
  const data = window.appCurrentOcrReceta;
  let countAdded = 0;

  for (const m of (data.medicamentos_prescritos || [])) {
    if (!m.alerta_alergia && m.producto_id) {
      const p = (state.products || []).find(x => x.id === m.producto_id);
      if (p) {
        addToCart(p, 'UNIDAD');
        countAdded++;
      }
    }
  }

  closeAppAiAssistantModal();
  showToast(`✅ ${countAdded} medicamento(s) seguro(s) agregado(s) a tu pedido.`);
  openCartDrawer();
}

window.executeAppRecetaOcr = executeAppRecetaOcr;
window.handleAppCustomRecetaFile = handleAppCustomRecetaFile;
window.preloadAppRecipeToCart = preloadAppRecipeToCart;

// ============================================================================
// BUZÓN OFICIAL DE QUEJAS Y SUGERENCIAS (SECCIÓN APARTE)
// ============================================================================
async function handleCustomerComplaintSubmitAparte(event) {
  if (event && event.preventDefault) event.preventDefault();
  const nombre = (document.getElementById('app-queja-nombre-input-aparte')?.value || '').trim();
  const telefono = (document.getElementById('app-queja-telefono-input-aparte')?.value || '').trim();
  const mensaje = (document.getElementById('app-queja-mensaje-input-aparte')?.value || '').trim();
  const btn = document.getElementById('btn-submit-app-queja-aparte');
  const resultCard = document.getElementById('app-queja-result-card-aparte');

  if (!mensaje) {
    if (typeof showToast === 'function') showToast('Por favor describe tu queja o sugerencia.', 'warning');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>🤖 Enviando a gerencia...</span>';
  }

  try {
    const res = await fetch('/api/app/quejas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: getActiveAppPharmacyId(),
        cliente_nombre: nombre || 'Cliente de la App',
        cliente_telefono: telefono,
        mensaje: mensaje
      })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al registrar queja');

    const q = data.queja || {};
    if (resultCard) {
      resultCard.classList.remove('hidden');
      resultCard.style.display = 'block';
      resultCard.innerHTML = `
        <div class="flex items-center justify-between pb-3 border-b border-rose-500/30">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></span>
            <span class="font-extrabold text-sm text-emerald-300">Ticket Registrado: #${q.codigo_ticket || 'TK-DAVALSI'}</span>
          </div>
          <span class="px-2.5 py-0.5 rounded-full bg-rose-500/30 text-rose-200 text-[10px] font-black border border-rose-400/40">
            ${q.sentimiento_ia || 'REVISIÓN PRIORITARIA'}
          </span>
        </div>
        <div class="space-y-2 text-xs">
          <p class="text-slate-200 font-semibold leading-relaxed">
            ${q.respuesta_ia || '¡Gracias por comunicarte! Tu mensaje ha sido recibido de forma segura y transferido de inmediato al equipo de gerencia y regencia farmacéutica de Farmacia Davalsi. Te contactaremos vía WhatsApp para brindarte una solución satisfactoria.'}
          </p>
          <div class="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between text-[11px] text-slate-300">
            <span>📞 Contacto de seguimiento: <strong>${telefono}</strong></span>
            <span>⏱️ Tiempo de respuesta estimado: <strong>< 30 min</strong></span>
          </div>
        </div>
      `;
    }

    const msgInput = document.getElementById('app-queja-mensaje-input-aparte');
    if (msgInput) msgInput.value = '';

    if (typeof showToast === 'function') {
      showToast('✅ ¡Queja o sugerencia enviada a gerencia con éxito!');
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message || 'Error al enviar queja', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>📨 Enviar Queja / Sugerencia</span> <span>➔</span>';
    }
  }
}

window.handleCustomerComplaintSubmitAparte = handleCustomerComplaintSubmitAparte;



/* =========================================================================
   ADHERENCIA TERAPÉUTICA FARMA 3D: RECORDATORIOS A 5 DÍAS Y REPETIR PEDIDO
   ========================================================================= */

async function checkPatientAdherenceReminders() {
  try {
    // 1. Verificar si hay un usuario autenticado o teléfono guardado en la App
    const authUser = window.state && window.state.user ? window.state.user : null;
    const phone = (authUser && authUser.telefono) ? authUser.telefono : (localStorage.getItem('farma_patient_phone') || '');
    
    const res = await fetch(`/api/adherencia/renovaciones?farmacia_id=${getActiveAppPharmacyId()}&dias=5`);
    const data = await res.json();
    if (!data.ok || !data.renovaciones || data.renovaciones.length === 0) return;

    // Filtrar si coincide con el paciente o tomar el primer tratamiento próximo
    let match = data.renovaciones[0];
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      const found = data.renovaciones.find(r => (r.paciente_telefono || '').replace(/\D/g, '').includes(cleanPhone.slice(-7)));
      if (found) match = found;
    }

    if (!match) return;

    // 2. Proyectar diálogo con Farma 3D si faltan <= 5 días
    const bubbleMsg = "Hola, noté que te quedan pocos días de tu tratamiento. ¿Deseas preparar tu pedido mensual con tu descuento habitual?";
    
    // Si existe el widget Farma 3D flotante
    if (window.farma3DWidget) {
      window.farma3DWidget.setDialogue(bubbleMsg, 'AMARILLO', false);
    }
    
    // Además proyectar en el globo de texto superior de la App con botón de Repetir Pedido
    const appBubble = document.getElementById('farmaia-bubble-msg');
    const appBubbleText = document.getElementById('farmaia-bubble-text');
    if (appBubble && appBubbleText) {
      appBubbleText.innerHTML = `
        <div class="space-y-1.5">
          <p class="leading-tight">
            <strong>Hola</strong>, noté que te quedan pocos días de tu tratamiento de <strong>${match.medicamento_nombre}</strong>. ¿Deseas preparar tu pedido mensual con tu descuento habitual?
          </p>
          <div class="flex items-center gap-2 pt-1">
            <button type="button" onclick="quickRepeatChronicOrder(${match.producto_id}, '${escapeJsQuotes(match.medicamento_nombre)}', ${match.precio_final_fidelizado})" class="px-3 py-1 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-black text-[11px] shadow-xs cursor-pointer">
              ⚡ [Repetir pedido] (RD$ ${parseFloat(match.precio_final_fidelizado).toFixed(2)})
            </button>
            <button type="button" onclick="this.closest('#farmaia-bubble-msg').classList.add('hidden')" class="px-2 py-0.5 rounded text-[10px] text-slate-500 hover:text-slate-700">
              Cerrar
            </button>
          </div>
        </div>
      `;
      appBubble.classList.remove('hidden');
      appBubble.classList.add('flex');
    }
  } catch (err) {
    console.warn('[Adherencia] Error al verificar recordatorios a 5 días:', err);
  }
}

// Acción rápida [Repetir pedido]
function quickRepeatChronicOrder(productId, medNombre, precioFidelizado) {
  if (typeof addToCartById === 'function') {
    addToCartById(productId, 1, 'UNIDAD');
    if (typeof showToast === 'function') {
      showToast(`🎉 ¡Tratamiento ${medNombre} agregado al carrito con descuento de fidelización!`, 'success');
    }
    // Abrir modal de carrito si existe
    if (typeof openCartModal === 'function') {
      setTimeout(() => openCartModal(), 400);
    }
  } else {
    // Si no tiene función de carrito directa, enviar mensaje de WhatsApp con descuento
    const farmaciaPhone = '18492831899';
    const msg = `Hola Farmacia Davalsi, deseo [Repetir mi pedido mensual] de ${medNombre} con mi descuento de fidelización (RD$ ${precioFidelizado}). ¿Tienen disponibilidad para enviármelo hoy? 💊🛵`;
    window.open(`https://wa.me/${farmaciaPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  }
}

window.checkPatientAdherenceReminders = checkPatientAdherenceReminders;
window.quickRepeatChronicOrder = quickRepeatChronicOrder;

// Comprobar automáticamente al cargar la App del paciente
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    checkPatientAdherenceReminders();
  }, 1200);
});


// =========================================================================
// CAPTURA DE UBICACION GPS PRECISA PARA DELIVERY
// =========================================================================
window.capturarUbicacionActualGPS = function() {
  const btn = document.getElementById('btn-app-get-geolocation');
  const latInp = document.getElementById('app-client-lat');
  const lngInp = document.getElementById('app-client-lng');
  const addrInp = document.getElementById('app-client-address');
  const icon = document.getElementById('app-gps-status-icon');
  const feedback = document.getElementById('app-gps-feedback');

  const aplicarCoordenadas = (lat, lng, esAproximado) => {
    if (latInp) latInp.value = lat;
    if (lngInp) lngInp.value = lng;
    if (icon) icon.classList.remove('hidden');
    if (feedback) {
      feedback.classList.remove('hidden');
      if (esAproximado) {
        feedback.innerHTML = '<span>📍</span> <span>Ubicación base (Santo Domingo) asignada. Puedes detallar tu calle o casa abajo.</span>';
      } else {
        feedback.innerHTML = '<span>🎯</span> <span>Ubicación GPS capturada con éxito para navegación directa del motorizado.</span>';
      }
    }

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = esAproximado ? '<span>📍</span> <span>Ubicación Lista</span>' : '<span>✅</span> <span>GPS Capturado</span>';
      btn.className = 'px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-extrabold text-[11px] border border-emerald-300 shadow-2xs transition flex items-center gap-1 cursor-pointer';
    }

    if (addrInp && (!addrInp.value.trim() || addrInp.value.includes('GPS:') || addrInp.value.includes('Ubicación'))) {
      addrInp.value = esAproximado ? 'Santo Domingo, Distrito Nacional' : 'Mi Ubicación Actual (GPS: ' + Number(lat).toFixed(4) + ', ' + Number(lng).toFixed(4) + ')';
    }

    if (typeof showToast === 'function') {
      showToast(esAproximado ? '📍 Ubicación base asignada para el delivery.' : '📍 Coordenadas GPS capturadas con éxito.', 'success');
    }
  };

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> <span>Detectando GPS...</span>';
  }

  if (!navigator.geolocation) {
    aplicarCoordenadas(18.4835, -69.9405, true);
    return;
  }

  let resuelto = false;
  const timeoutId = setTimeout(() => {
    if (!resuelto) {
      resuelto = true;
      aplicarCoordenadas(18.4835, -69.9405, true);
    }
  }, 4000);

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (resuelto) return;
      resuelto = true;
      clearTimeout(timeoutId);
      aplicarCoordenadas(pos.coords.latitude, pos.coords.longitude, false);
    },
    (err) => {
      if (resuelto) return;
      resuelto = true;
      clearTimeout(timeoutId);
      console.warn('Geolocation fallback used:', err);
      aplicarCoordenadas(18.4835, -69.9405, true);
    },
    { enableHighAccuracy: false, timeout: 3500, maximumAge: 60000 }
  );
};

// =========================================================================
// RASTREO EN VIVO CON LEAFLET MAP PARA EL PACIENTE (MODAL & CANAL EN TIEMPO REAL)
// =========================================================================
window.openDeliveryTrackingModal = async function(codigoOrden) {
  const modal = document.getElementById('modal-delivery-tracking');
  if (!modal) return;

  currentTrackingOrderCode = codigoOrden || null;
  modal.classList.remove('hidden');

  await refrescarRastreoDelivery();

  // Iniciar sondeo en tiempo real cada 3.5 segundos para escuchar movimientos del repartidor
  if (appTrackingInterval) clearInterval(appTrackingInterval);
  appTrackingInterval = setInterval(refrescarRastreoDelivery, 3500);
};

window.closeDeliveryTrackingModal = function() {
  const modal = document.getElementById('modal-delivery-tracking');
  if (modal) modal.classList.add('hidden');
  if (appTrackingInterval) clearInterval(appTrackingInterval);
  appTrackingInterval = null;
};

async function refrescarRastreoDelivery() {
  try {
    const url = currentTrackingOrderCode
      ? `/api/delivery/tracking?farmacia_id=${getActiveAppPharmacyId()}&codigo_orden=${encodeURIComponent(currentTrackingOrderCode)}`
      : `/api/delivery/tracking?farmacia_id=${getActiveAppPharmacyId()}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.ok) {
      const orderTitle = document.getElementById('tracking-order-title');
      const statusPill = document.getElementById('tracking-status-pill');
      if (orderTitle) orderTitle.textContent = 'Sin pedidos activos';
      if (statusPill) statusPill.textContent = 'ℹ️ SIN DELIVERY ACTIVO';
      return;
    }

    // Actualizar Textos y Badges
    const orderTitle = document.getElementById('tracking-order-title');
    const statusPill = document.getElementById('tracking-status-pill');
    const etaPill = document.getElementById('tracking-eta-pill');
    const courierName = document.getElementById('tracking-courier-name');
    const courierPhone = document.getElementById('tracking-courier-phone');
    const courierVeh = document.getElementById('tracking-courier-vehicle');
    const addrDestino = document.getElementById('tracking-address-destino');

    if (orderTitle) orderTitle.textContent = `#${data.codigo_orden}`;
    if (statusPill) statusPill.textContent = data.estado_delivery === 'EN_CAMINO' ? '🛵 EN CAMINO' : (data.estado_delivery === 'ENTREGADO' ? '✅ ENTREGADO' : '📦 PREPARANDO');
    if (etaPill) etaPill.textContent = data.estado_delivery === 'ENTREGADO' ? '✅ Entregado' : `⏱️ ETA: ~${data.eta_minutos || 12} minutos`;
    if (courierName && data.repartidor) courierName.textContent = data.repartidor.nombre || 'Por asignar';
    if (courierPhone && data.repartidor) {
      const tel = data.repartidor.telefono || '';
      courierPhone.textContent = tel ? `Tel: ${tel}` : 'Tel: Consultar sucursal';
      courierPhone.href = tel ? `tel:${tel.replace(/\D/g, '')}` : '#';
    }
    if (courierVeh && data.repartidor) courierVeh.textContent = data.repartidor.vehiculo || 'Delivery Farmacia';
    if (addrDestino) addrDestino.textContent = data.cliente_direccion || 'Tu Domicilio';

    // Renderizar o actualizar Mapa Leaflet
    renderizarMapaCliente(data);

  } catch (err) {
    console.warn('Error al refrescar rastreo:', err);
  }
}

function renderizarMapaCliente(data) {
  const mapContainer = document.getElementById('delivery-leaflet-map');
  if (!mapContainer || typeof L === 'undefined') return;

  const ptOrigen = (data.puntos && data.puntos.origen) || { lat: 18.4746, lng: -69.9328 };
  const ptDestino = (data.puntos && data.puntos.destino) || { lat: 18.4835, lng: -69.9405 };
  const ptMotorizado = (data.puntos && data.puntos.repartidor_actual) || { lat: 18.4791, lng: -69.9368 };

  if (!appTrackingMap) {
    appTrackingMap = L.map('delivery-leaflet-map').setView([ptMotorizado.lat, ptMotorizado.lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap Farmacia Davalsi'
    }).addTo(appTrackingMap);
  }

  // Limpiar marcadores previos
  appTrackingMap.eachLayer((layer) => {
    if (layer instanceof L.Marker || layer instanceof L.Polyline) {
      appTrackingMap.removeLayer(layer);
    }
  });

  // Punto A: Farmacia Davalsi (Origen)
  const iconFarmacia = L.divIcon({
    className: 'custom-pin-farmacia',
    html: '<div style="background:#0f766e; color:white; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; font-size:16px; border:2px solid white; box-shadow:0 3px 8px rgba(0,0,0,0.4);">🏥</div>',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
  L.marker([ptOrigen.lat, ptOrigen.lng], { icon: iconFarmacia })
    .addTo(appTrackingMap)
    .bindPopup('<strong>Punto A: Farmacia Davalsi</strong><br>Salida del Despacho');

  // Punto B: Domicilio del Paciente (Destino exacto capturado por GPS)
  const iconDestino = L.divIcon({
    className: 'custom-pin-destino',
    html: '<div style="background:#e11d48; color:white; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; font-size:16px; border:2px solid white; box-shadow:0 3px 8px rgba(0,0,0,0.4);">📍</div>',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
  L.marker([ptDestino.lat, ptDestino.lng], { icon: iconDestino })
    .addTo(appTrackingMap)
    .bindPopup('<strong>Punto B: Tu Ubicación</strong><br>' + (data.cliente_direccion || 'Destino'));

  // Marcador Dinámico: Moto del Mensajero en Movimiento
  const iconMoto = L.divIcon({
    className: 'custom-pin-moto',
    html: '<div style="background:#f59e0b; color:white; border-radius:50%; width:38px; height:38px; display:flex; align-items:center; justify-content:center; font-size:20px; border:3px solid white; box-shadow:0 4px 12px rgba(245,158,11,0.6); animation:pulseLive 1.5s infinite;">🛵</div>',
    iconSize: [38, 38],
    iconAnchor: [19, 19]
  });
  L.marker([ptMotorizado.lat, ptMotorizado.lng], { icon: iconMoto })
    .addTo(appTrackingMap)
    .bindPopup(`<strong>${(data.repartidor && data.repartidor.nombre) || 'Repartidor en Vivo'}</strong><br>ETA: ~${data.eta_minutos || 8} min`)
    .openPopup();

  // Trazar línea de ruta
  const latlngs = [
    [ptOrigen.lat, ptOrigen.lng],
    [ptMotorizado.lat, ptMotorizado.lng],
    [ptDestino.lat, ptDestino.lng]
  ];
  L.polyline(latlngs, { color: '#0d9488', weight: 4, dashArray: '6, 6' }).addTo(appTrackingMap);
  appTrackingMap.fitBounds(L.latLngBounds(latlngs), { padding: [35, 35] });
  setTimeout(() => appTrackingMap.invalidateSize(), 200);
}


// ============================================================================
// MIS PEDIDOS + REPETIR COMPRA EN 1 CLIC
// ============================================================================

function openPatientOrdersModal() {
  const modal = document.getElementById('patient-orders-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  const phTitle = document.getElementById('patient-orders-pharmacy-name');
  if (phTitle) phTitle.textContent = (state.pharmacyConfig && state.pharmacyConfig.nombre) || 'esta Farmacia';

  const phoneInput = document.getElementById('patient-orders-phone-input');
  if (phoneInput && !phoneInput.value.trim()) {
    const savedPhone = (currentPatient && currentPatient.telefono) || document.getElementById('app-client-phone')?.value || '';
    if (savedPhone) phoneInput.value = savedPhone.trim();
  }
  loadPatientOrders();
}

function closePatientOrdersModal() {
  const modal = document.getElementById('patient-orders-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function loadPatientOrders() {
  const listEl = document.getElementById('patient-orders-list');
  const phoneVal = (document.getElementById('patient-orders-phone-input')?.value || '').trim();
  const patientName = (currentPatient && currentPatient.nombre_completo) || '';

  if (!phoneVal && !patientName) {
    if (listEl) {
      listEl.innerHTML = '<div class="p-6 text-center rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600">Escribe tu número de teléfono arriba o inicia sesión para consultar tus pedidos en esta farmacia.</div>';
    }
    return;
  }

  if (listEl) {
    listEl.innerHTML = '<div class="p-6 text-center text-xs text-slate-500">Cargando tus pedidos...</div>';
  }

  try {
    const params = new URLSearchParams();
    params.set('farmacia_id', String(getActiveAppPharmacyId()));
    if (phoneVal) params.set('telefono', phoneVal);
    if (patientName) params.set('nombre', patientName);

    const res = await fetch(`/api/patient/orders?${params.toString()}`);
    const data = await res.json();
    if (!data.ok) {
      if (listEl) listEl.innerHTML = `<div class="p-4 rounded-xl bg-rose-50 text-rose-700 text-xs font-bold">${data.error || 'No se pudieron cargar los pedidos.'}</div>`;
      return;
    }
    state.patientOrders = data.orders || [];
    renderPatientOrdersList();
  } catch (e) {
    if (listEl) listEl.innerHTML = '<div class="p-4 rounded-xl bg-rose-50 text-rose-700 text-xs font-bold">Error de conexión al consultar tus pedidos.</div>';
  }
}

function renderPatientOrdersList() {
  const listEl = document.getElementById('patient-orders-list');
  if (!listEl) return;
  const orders = state.patientOrders || [];
  if (orders.length === 0) {
    listEl.innerHTML = '<div class="p-6 text-center rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600">No encontramos pedidos registrados con esos datos en la farmacia seleccionada.</div>';
    return;
  }

  const badgeStyle = (estado) => {
    const st = String(estado || '').toUpperCase();
    if (st === 'ENTREGADO' || st === 'COMPLETADO' || st === 'APROBADO') return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    if (st === 'EN_CAMINO' || st === 'LISTO_PARA_ENTREGA') return 'bg-sky-100 text-sky-800 border-sky-300';
    if (st === 'RECHAZADO' || st === 'ANULADO') return 'bg-rose-100 text-rose-800 border-rose-300';
    return 'bg-amber-100 text-amber-800 border-amber-300';
  };

  listEl.innerHTML = orders.map((o) => {
    const estadoMostrado = o.estado_delivery || o.estado_pedido || 'PENDIENTE';
    const itemsHtml = (o.items || []).map((it) => `
      <li class="flex items-center justify-between text-[11px] text-slate-700">
        <span>• <strong>${it.cantidad_presentacion}x</strong> ${it.presentacion} ${it.nombre_comercial}</span>
        <span class="font-mono font-bold">${formatRD(it.subtotal)}</span>
      </li>
    `).join('') || '<li class="text-[11px] text-slate-400">Sin detalle de artículos</li>';

    const etaTxt = o.eta_minutos ? ` • ETA ~${o.eta_minutos} min` : '';
    return `
      <div class="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2.5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span class="font-mono font-black text-xs text-slate-900">#${o.codigo_orden}</span>
            <span class="text-[11px] text-slate-500 ml-2">${o.fecha_hora || o.fecha_dia || ''}</span>
          </div>
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black border ${badgeStyle(estadoMostrado)}">
            ${estadoMostrado}${etaTxt}
          </span>
        </div>

        <ul class="space-y-1 bg-white p-2.5 rounded-xl border border-slate-200">${itemsHtml}</ul>

        <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div class="text-xs font-extrabold text-slate-900">
            Total: <span class="text-teal-700">${formatRD(o.total)}</span>
            <span class="text-[10px] font-semibold text-slate-500 ml-1">(${o.metodo_pago || 'EFECTIVO'})</span>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" onclick="closePatientOrdersModal(); openDeliveryTrackingModal('${o.codigo_orden}');" class="px-3 py-1.5 rounded-xl bg-sky-100 hover:bg-sky-200 text-sky-900 font-extrabold text-[11px] cursor-pointer">
              🛵 Rastrear
            </button>
            <button type="button" onclick="repeatPatientOrder('${o.codigo_orden}')" class="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-[11px] cursor-pointer">
              🔄 Repetir Pedido
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function repeatPatientOrder(codigoOrden) {
  const order = (state.patientOrders || []).find((o) => o.codigo_orden === codigoOrden);
  if (!order || !Array.isArray(order.items) || order.items.length === 0) {
    showToast('Este pedido no tiene artículos disponibles para repetir.', 'error');
    return;
  }

  if (!state.products || state.products.length === 0) {
    await loadProducts();
  }

  let addedCount = 0;
  let skippedNames = [];

  for (const it of order.items) {
    const prod = (state.products || []).find(
      (p) => Number(p.id) === Number(it.producto_id) ||
        (it.codigo_barras && p.codigo_barras === it.codigo_barras) ||
        String(p.nombre_comercial || '').toLowerCase() === String(it.nombre_comercial || '').toLowerCase()
    );

    if (!prod || Number(prod.stock_total_unidades || 0) <= 0) {
      skippedNames.push(it.nombre_comercial || 'Producto');
      continue;
    }

    const pres = it.presentacion || 'UNIDAD';
    const qty = Math.max(1, parseInt(it.cantidad_presentacion || 1, 10));
    const existing = state.appCart.find((c) => !c.es_kit && c.product && c.product.id === prod.id && c.presentacion === pres);
    if (existing) {
      existing.cantidad += qty;
    } else {
      state.appCart.push({ product: prod, presentacion: pres, cantidad: qty });
    }
    addedCount += 1;
  }

  updateFloatingCartUI();
  renderCartDrawerItems();
  closePatientOrdersModal();

  if (addedCount > 0) {
    openCartDrawer();
    const extra = skippedNames.length > 0 ? ` (Sin stock actual: ${skippedNames.join(', ')})` : '';
    showToast(`🔄 Se cargaron ${addedCount} artículo(s) del pedido #${codigoOrden} al carrito.${extra}`, 'success');
  } else {
    showToast(`Ningún artículo del pedido #${codigoOrden} tiene stock disponible en este momento.`, 'error');
  }
}


// ============================================================================
// DIRECCIONES GUARDADAS (CASA / TRABAJO) Y TARIFA DE ENVÍO CONFIGURABLE
// ============================================================================

function calcAppShippingFee(subtotalRD) {
  const deliveryAllowed = state.pharmacyConfig ? state.pharmacyConfig.envio_domicilio_activo !== false : true;
  const effectiveMode = deliveryAllowed ? (state.appDeliveryMode || 'DOMICILIO') : 'RETIRO_FARMACIA';
  if (effectiveMode !== 'DOMICILIO') {
    return { fee: 0, label: 'Retiro en farmacia:' };
  }
  const tarifa = Math.max(0, Number((state.pharmacyConfig && state.pharmacyConfig.tarifa_envio_rd) || 0));
  const gratisDesde = Math.max(0, Number((state.pharmacyConfig && state.pharmacyConfig.envio_gratis_desde_rd) || 0));
  if (tarifa <= 0) {
    return { fee: 0, label: 'Costo de envío (Domicilio):' };
  }
  if (gratisDesde > 0 && subtotalRD >= gratisDesde) {
    return { fee: 0, label: `Envío gratis (compra ≥ ${formatRD(gratisDesde)}):` };
  }
  const extraHint = gratisDesde > 0 ? ` (gratis desde ${formatRD(gratisDesde)})` : '';
  return { fee: tarifa, label: `Costo de envío${extraHint}:` };
}

function getSavedAddressesStorageKey() {
  const tel = (currentPatient && currentPatient.telefono) || document.getElementById('app-client-phone')?.value || 'guest';
  const clean = String(tel).replace(/\D/g, '') || 'guest';
  return `farmasys_saved_addresses_${clean}`;
}

function loadSavedAddresses() {
  try {
    const raw = localStorage.getItem(getSavedAddressesStorageKey());
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
  } catch (e) {
    return [];
  }
}

function saveAddressesList(list) {
  try {
    localStorage.setItem(getSavedAddressesStorageKey(), JSON.stringify((list || []).slice(0, 3)));
  } catch (e) {}
}

function renderSavedAddressesBar() {
  const bar = document.getElementById('app-saved-addresses-bar');
  if (!bar) return;
  const list = loadSavedAddresses();
  if (list.length === 0) {
    bar.innerHTML = '<span class="text-[10px] text-slate-400 font-semibold">💡 Puedes guardar hasta 3 direcciones frecuentes (Casa, Trabajo, Otro).</span>';
    return;
  }
  const icons = { Casa: '🏠', Trabajo: '🏢', Otro: '📍' };
  bar.innerHTML = list.map((item, idx) => `
    <div class="inline-flex items-center rounded-lg border border-teal-300 bg-teal-50 text-teal-900 text-[11px] font-bold overflow-hidden">
      <button type="button" onclick="applySavedAddress(${idx})" title="${escapeJsQuotes(item.address)}" class="px-2 py-1 hover:bg-teal-100 cursor-pointer flex items-center gap-1">
        <span>${icons[item.label] || '📍'}</span> <span>${item.label}</span>
      </button>
      <button type="button" onclick="deleteSavedAddress(${idx})" title="Eliminar dirección" class="px-1.5 py-1 text-rose-600 hover:bg-rose-100 cursor-pointer text-[10px]">✕</button>
    </div>
  `).join('');
}

function applySavedAddress(idx) {
  const list = loadSavedAddresses();
  const item = list[idx];
  if (!item) return;
  const input = document.getElementById('app-client-address');
  if (input) input.value = item.address;
  showToast(`📍 Dirección "${item.label}" aplicada.`);
}

function deleteSavedAddress(idx) {
  const list = loadSavedAddresses();
  list.splice(idx, 1);
  saveAddressesList(list);
  renderSavedAddressesBar();
}

function promptSaveClientAddress() {
  const input = document.getElementById('app-client-address');
  const addr = (input ? input.value : '').trim();
  if (!addr || addr.startsWith('Retiro en Sucursal')) {
    showToast('Escribe primero una dirección de entrega válida para guardarla.', 'error');
    return;
  }
  const labelRaw = prompt('Etiqueta para esta dirección (ej. Casa, Trabajo u Otro):', 'Casa');
  if (labelRaw === null) return;
  const label = (labelRaw.trim() || 'Casa').slice(0, 18);

  const list = loadSavedAddresses().filter((x) => x.label.toLowerCase() !== label.toLowerCase());
  list.unshift({ label, address: addr });
  saveAddressesList(list.slice(0, 3));
  renderSavedAddressesBar();
  showToast(`💾 Dirección "${label}" guardada para tus próximos pedidos.`);
}


// ============================================================================
// BARRA FIJA DE SEGUIMIENTO EN VIVO + WHATSAPP POR ORDEN
// ============================================================================
let activeOrderPollTimer = null;

function getActiveOrderStorageKey() {
  return `farmasys_active_order_${getActiveAppPharmacyId()}`;
}

function saveActiveAppOrder(order) {
  if (!order || !order.codigo_orden) return;
  try {
    localStorage.setItem(getActiveOrderStorageKey(), JSON.stringify({
      codigo_orden: order.codigo_orden,
      farmacia_id: getActiveAppPharmacyId(),
      estado: order.estado_pedido || 'PENDIENTE',
      total: order.total || 0,
      ts: Date.now(),
    }));
    refreshActiveOrderBanner();
  } catch (e) {}
}

function getSavedActiveAppOrder() {
  try {
    const raw = localStorage.getItem(getActiveOrderStorageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.codigo_orden) return null;
    // Expirar automáticamente tras 24 horas
    if (parsed.ts && (Date.now() - parsed.ts > 24 * 60 * 60 * 1000)) {
      localStorage.removeItem(getActiveOrderStorageKey());
      return null;
    }
    return parsed;
  } catch (e) {
    return null;
  }
}

function dismissActiveOrderBanner() {
  try { localStorage.removeItem(getActiveOrderStorageKey()); } catch (e) {}
  const el = document.getElementById('app-active-order-banner');
  if (el) el.classList.add('hidden');
}

function formatFriendlyOrderStatus(rawStatus) {
  const st = String(rawStatus || '').toUpperCase();
  if (st === 'EN_CAMINO') return 'En camino 🛵';
  if (st === 'LISTO_PARA_ENTREGA') return 'Listo para entrega 📦';
  if (st === 'APROBADO' || st === 'COMPLETADO') return 'Aprobado / En preparación ✅';
  if (st === 'ENTREGADO') return 'Entregado ✅';
  if (st === 'RECHAZADO' || st === 'ANULADO') return 'Cancelado / Anulado';
  return 'En preparación ⏳';
}

async function refreshActiveOrderBanner(showFeedback = false) {
  const banner = document.getElementById('app-active-order-banner');
  if (!banner) return;
  const saved = getSavedActiveAppOrder();
  if (!saved) {
    banner.classList.add('hidden');
    return;
  }

  const codeEl = document.getElementById('active-banner-order-code');
  const statusEl = document.getElementById('active-banner-order-status');
  const etaEl = document.getElementById('active-banner-order-eta');
  if (codeEl) codeEl.textContent = `#${saved.codigo_orden}`;

  let currentStatus = saved.estado || 'PENDIENTE';
  let etaText = '';

  try {
    const res = await fetch(`/api/delivery/tracking?farmacia_id=${getActiveAppPharmacyId()}&codigo_orden=${encodeURIComponent(saved.codigo_orden)}`);
    const data = await res.json();
    if (data && data.ok && data.tracking) {
      currentStatus = data.tracking.estado_delivery || currentStatus;
      if (data.tracking.eta_minutos && String(currentStatus).toUpperCase() !== 'ENTREGADO') {
        etaText = `ETA ~${data.tracking.eta_minutos} min`;
      }
      if (data.tracking.repartidor_nombre && String(currentStatus).toUpperCase() === 'EN_CAMINO') {
        etaText = `${data.tracking.repartidor_nombre}${etaText ? ' • ' + etaText : ''}`;
      }
    }
  } catch (e) {}

  if (statusEl) statusEl.textContent = formatFriendlyOrderStatus(currentStatus);
  if (etaEl) etaEl.textContent = etaText;
  banner.classList.remove('hidden');

  if (showFeedback) {
    showToast(`Estado actualizado para #${saved.codigo_orden}: ${formatFriendlyOrderStatus(currentStatus)}`, 'info');
  }
}

function startActiveOrderPolling() {
  if (activeOrderPollTimer) clearInterval(activeOrderPollTimer);
  activeOrderPollTimer = setInterval(() => {
    const saved = getSavedActiveAppOrder();
    if (saved) refreshActiveOrderBanner(false);
  }, 15000);
}

function openActiveOrderMap() {
  const saved = getSavedActiveAppOrder();
  if (saved && saved.codigo_orden) {
    openDeliveryTrackingModal(saved.codigo_orden);
  } else {
    openDeliveryTrackingModal();
  }
}

function openActiveOrderWhatsApp() {
  const saved = getSavedActiveAppOrder();
  const code = saved ? saved.codigo_orden : '';
  const phName = (state.pharmacyConfig && state.pharmacyConfig.nombre) || 'Farmacia';
  const rawWa = (state.pharmacyConfig && (state.pharmacyConfig.telefono_whatsapp || state.pharmacyConfig.whatsapp_notificaciones)) || '18095550199';
  const farmPhone = String(rawWa).replace(/\D/g, '');
  const msg = code
    ? `Hola *${phName}*, quiero consultar el seguimiento de mi pedido *#${code}*.`
    : `Hola *${phName}*, quiero consultar el seguimiento de mi pedido.`;
  window.open(`https://wa.me/${farmPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}


// ============================================================================
// FAVORITOS POR FARMACIA EN EL CATÁLOGO
// ============================================================================

function getAppFavoritesStorageKey() {
  return `farmasys_app_favorites_${getActiveAppPharmacyId()}`;
}

function getAppFavorites() {
  try {
    const raw = localStorage.getItem(getAppFavoritesStorageKey());
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((id) => Number(id)) : [];
  } catch (e) {
    return [];
  }
}

function isAppFavorite(productId) {
  return getAppFavorites().includes(Number(productId));
}

function toggleAppFavorite(productId) {
  const pid = Number(productId);
  let favs = getAppFavorites();
  const exists = favs.includes(pid);
  if (exists) {
    favs = favs.filter((id) => id !== pid);
    showToast('Quitado de tus favoritos.', 'info');
  } else {
    favs.push(pid);
    showToast('⭐ Guardado en tus Favoritos de esta farmacia.', 'success');
  }
  try {
    localStorage.setItem(getAppFavoritesStorageKey(), JSON.stringify(favs));
  } catch (e) {}

  if (state.selectedSymptom === 'favoritos') {
    state.filteredProducts = (state.products || []).filter((p) => favs.includes(Number(p.id)));
  }
  renderAppProductsGrid();
}


// ============================================================================
// MODO REPARTIDOR CONECTADO EN TODO MOMENTO + TRANSMISIÓN GPS EN VIVO
// ============================================================================
let courierSession = null;
let courierActiveOrderCode = null;
let courierGpsWatchId = null;
let courierGpsBackupTimer = null;
let courierLastCoords = { lat: 18.4746, lng: -69.9328 };

function openCourierModeModal() {
  const modal = document.getElementById('courier-mode-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  try {
    const saved = localStorage.getItem(`farmasys_courier_${getActiveAppPharmacyId()}`);
    if (saved) {
      courierSession = JSON.parse(saved);
    }
  } catch (e) {}

  syncCourierModalView();
}

function closeCourierModeModal() {
  const modal = document.getElementById('courier-mode-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function syncCourierModalView() {
  const loginForm = document.getElementById('courier-login-form');
  const activePanel = document.getElementById('courier-active-panel');
  const nameEl = document.getElementById('courier-session-name');
  if (courierSession && courierSession.username) {
    if (loginForm) loginForm.classList.add('hidden');
    if (activePanel) activePanel.classList.remove('hidden');
    if (nameEl) nameEl.textContent = `${courierSession.nombre_completo} (${courierSession.username})`;
    loadCourierOrders();
  } else {
    if (loginForm) loginForm.classList.remove('hidden');
    if (activePanel) activePanel.classList.add('hidden');
  }
}

async function handleCourierLogin(event) {
  event.preventDefault();
  const errEl = document.getElementById('courier-login-error');
  if (errEl) errEl.classList.add('hidden');

  const username = document.getElementById('courier-login-username')?.value?.trim() || '';
  const clave = document.getElementById('courier-login-password')?.value?.trim() || '';

  try {
    const res = await fetch('/api/delivery/login-repartidor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: getActiveAppPharmacyId(),
        username,
        clave_acceso: clave,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      if (errEl) {
        errEl.textContent = data.error || 'Credenciales inválidas.';
        errEl.classList.remove('hidden');
      }
      return;
    }
    courierSession = data;
    try {
      localStorage.setItem(`farmasys_courier_${getActiveAppPharmacyId()}`, JSON.stringify(courierSession));
    } catch (e) {}
    syncCourierModalView();
    showToast(`🛵 Conectado como repartidor: ${courierSession.nombre_completo}`, 'success');
  } catch (e) {
    if (errEl) {
      errEl.textContent = 'Error de conexión con el servidor.';
      errEl.classList.remove('hidden');
    }
  }
}

function logoutCourierMode() {
  stopCourierGpsTransmission();
  courierSession = null;
  try { localStorage.removeItem(`farmasys_courier_${getActiveAppPharmacyId()}`); } catch (e) {}
  syncCourierModalView();
}

async function loadCourierOrders() {
  const listEl = document.getElementById('courier-orders-list');
  if (!listEl) return;
  try {
    const res = await fetch(`/api/delivery/pedidos-pendientes?farmacia_id=${getActiveAppPharmacyId()}&estado=TODOS`);
    const data = await res.json();
    const orders = (data && data.ok && Array.isArray(data.pedidos)) ? data.pedidos : [];
    if (orders.length === 0) {
      listEl.innerHTML = '<div class="p-6 text-center rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600">No hay pedidos a domicilio registrados en esta farmacia todavía.</div>';
      return;
    }

    listEl.innerHTML = orders.map((o) => {
      const st = String(o.estado_delivery || 'LISTO_PARA_ENTREGA').toUpperCase();
      const isActive = st === 'EN_CAMINO';
      const isDone = st === 'ENTREGADO';
      const badge = isDone
        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
        : (isActive ? 'bg-amber-100 text-amber-900 border-amber-400 animate-pulse' : 'bg-sky-100 text-sky-900 border-sky-300');

      return `
        <div class="p-3.5 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-2 text-xs">
          <div class="flex items-center justify-between gap-2">
            <span class="font-mono font-black text-slate-900">#${o.codigo_orden}</span>
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black border ${badge}">${st}</span>
          </div>
          <p class="font-bold text-slate-800">👤 ${o.cliente_nombre} • 📞 ${o.telefono_contacto || o.cliente_telefono}</p>
          <p class="text-[11px] text-slate-600">📍 ${o.direccion_texto || o.cliente_direccion}</p>
          <p class="text-[11px] text-teal-800 font-semibold">💊 ${o.medicamentos_detalle || 'Pedido de Farmacia'} • Total: <strong>${formatRD(o.total_rd || 0)}</strong></p>
          <p class="text-[10px] text-slate-500">🛵 Repartidor: <strong>${o.repartidor_nombre || 'Por asignar'}</strong></p>
          <div class="flex flex-wrap items-center gap-1.5 pt-1">
            ${!isDone ? `
              <button type="button" onclick="startCourierDelivery('${o.codigo_orden}')" class="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-[11px] cursor-pointer">
                🚀 ${isActive ? 'Transmitir GPS en Vivo' : 'Iniciar Entrega + GPS'}
              </button>
              <button type="button" onclick="completeCourierDelivery('${o.codigo_orden}')" class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] cursor-pointer">
                ✅ Marcar Entregado
              </button>
            ` : ''}
            <button type="button" onclick="closeCourierModeModal(); openDeliveryTrackingModal('${o.codigo_orden}');" class="px-3 py-1.5 rounded-xl bg-sky-100 hover:bg-sky-200 text-sky-900 font-extrabold text-[11px] cursor-pointer">
              🗺️ Ver Mapa
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    listEl.innerHTML = '<div class="p-4 rounded-xl bg-rose-50 text-rose-700 text-xs font-bold">Error al consultar pedidos de delivery.</div>';
  }
}

async function sendCourierGpsPing(orderCode, lat, lng) {
  try {
    await fetch('/api/delivery/actualizar-gps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: getActiveAppPharmacyId(),
        codigo_orden: orderCode,
        latitud: lat,
        longitud: lng,
        estado: 'EN_CAMINO',
        repartidor_nombre: courierSession ? `${courierSession.nombre_completo} (${courierSession.username})` : '',
      }),
    });
  } catch (e) {}
}

function stopCourierGpsTransmission() {
  if (courierGpsWatchId !== null && navigator.geolocation) {
    try { navigator.geolocation.clearWatch(courierGpsWatchId); } catch (e) {}
    courierGpsWatchId = null;
  }
  if (courierGpsBackupTimer) {
    clearInterval(courierGpsBackupTimer);
    courierGpsBackupTimer = null;
  }
  courierActiveOrderCode = null;
  const stEl = document.getElementById('courier-gps-live-status');
  if (stEl) {
    stEl.textContent = 'GPS en espera (inicia una entrega para transmitir en tiempo real)';
    stEl.className = 'text-[11px] font-bold text-slate-600';
  }
}

async function startCourierDelivery(orderCode) {
  stopCourierGpsTransmission();
  courierActiveOrderCode = orderCode;
  const repName = courierSession ? `${courierSession.nombre_completo} (${courierSession.username})` : '';

  const beginLive = async (lat, lng) => {
    courierLastCoords = { lat, lng };
    await fetch('/api/delivery/iniciar-entrega', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: getActiveAppPharmacyId(),
        codigo_orden: orderCode,
        latitud: lat,
        longitud: lng,
        repartidor_nombre: repName,
      }),
    });
    const stEl = document.getElementById('courier-gps-live-status');
    if (stEl) {
      stEl.textContent = `📡 GPS Conectado y Transmitiendo en Vivo — Orden #${orderCode}`;
      stEl.className = 'text-[11px] font-extrabold text-emerald-700 animate-pulse';
    }
    loadCourierOrders();
    showToast(`📡 Entrega #${orderCode} iniciada. Cliente y farmacia ya ven tu ubicación en el mapa.`, 'success');
  };

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => beginLive(pos.coords.latitude, pos.coords.longitude),
      () => beginLive(courierLastCoords.lat, courierLastCoords.lng),
      { enableHighAccuracy: true, timeout: 4000 }
    );
    courierGpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        courierLastCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (courierActiveOrderCode) {
          sendCourierGpsPing(courierActiveOrderCode, courierLastCoords.lat, courierLastCoords.lng);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000 }
    );
  } else {
    await beginLive(courierLastCoords.lat, courierLastCoords.lng);
  }

  courierGpsBackupTimer = setInterval(() => {
    if (courierActiveOrderCode) {
      sendCourierGpsPing(courierActiveOrderCode, courierLastCoords.lat, courierLastCoords.lng);
    }
  }, 5000);
}

async function completeCourierDelivery(orderCode) {
  try {
    await fetch('/api/delivery/actualizar-estado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: getActiveAppPharmacyId(),
        codigo_orden: orderCode,
        estado_delivery: 'ENTREGADO',
        progreso_pct: 100.0,
      }),
    });
    if (courierActiveOrderCode === orderCode) {
      stopCourierGpsTransmission();
    }
    await loadCourierOrders();
    showToast(`✅ Pedido #${orderCode} marcado como ENTREGADO.`, 'success');
  } catch (e) {
    showToast('Error al marcar entrega.', 'error');
  }
}


// ============================================================================
// ALERGIAS DEL PACIENTE + INDICADOR EN VIVO ABIERTO / CERRADO
// ============================================================================

function getPatientAllergiesStorageKey() {
  const tel = (currentPatient && currentPatient.telefono) || document.getElementById('app-client-phone')?.value || 'guest';
  const clean = String(tel).replace(/\D/g, '') || 'guest';
  return `farmasys_patient_allergies_${clean}`;
}

function getPatientAllergies() {
  try {
    const raw = localStorage.getItem(getPatientAllergiesStorageKey());
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function savePatientAllergies(list) {
  try {
    localStorage.setItem(getPatientAllergiesStorageKey(), JSON.stringify(list || []));
  } catch (e) {}
  updateAppAllergiesBadge();
}

function updateAppAllergiesBadge() {
  const badge = document.getElementById('app-allergies-count-badge');
  if (!badge) return;
  const cnt = getPatientAllergies().length;
  badge.textContent = String(cnt);
  if (cnt > 0) badge.classList.remove('hidden');
  else badge.classList.add('hidden');
}

function openPatientAllergiesModal() {
  const modal = document.getElementById('patient-allergies-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  renderPatientAllergiesList();
}

function closePatientAllergiesModal() {
  const modal = document.getElementById('patient-allergies-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function handleAddAllergySubmit(event) {
  event.preventDefault();
  const inp = document.getElementById('app-allergy-input');
  const val = (inp ? inp.value : '').trim();
  if (!val) return;
  addPatientAllergy(val);
  if (inp) inp.value = '';
}

function addPatientAllergy(text) {
  const clean = String(text || '').trim();
  if (!clean) return;
  const list = getPatientAllergies();
  if (!list.some((a) => a.toLowerCase() === clean.toLowerCase())) {
    list.push(clean);
    savePatientAllergies(list);
    showToast(`⚠️ Alergia "${clean}" guardada en tu perfil.`, 'info');
  }
  renderPatientAllergiesList();
}

function removePatientAllergy(idx) {
  const list = getPatientAllergies();
  list.splice(idx, 1);
  savePatientAllergies(list);
  renderPatientAllergiesList();
}

function renderPatientAllergiesList() {
  const container = document.getElementById('app-allergies-list');
  if (!container) return;
  const list = getPatientAllergies();
  if (list.length === 0) {
    container.innerHTML = '<p class="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-center">No has registrado alergias todavía.</p>';
    return;
  }
  container.innerHTML = list.map((al, idx) => `
    <div class="p-2.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between">
      <span class="font-extrabold text-rose-900">⚠️ ${al}</span>
      <button type="button" onclick="removePatientAllergy(${idx})" class="text-xs font-bold text-rose-600 hover:underline cursor-pointer">Quitar</button>
    </div>
  `).join('');
}

function checkAppAllergyConflict(product) {
  const allergies = getPatientAllergies();
  if (!allergies.length || !product) return null;
  const hay = `${product.nombre_comercial || ''} ${product.principio_activo || ''} ${product.categoria || ''}`.toLowerCase();

  const crossGroups = [
    ['penicilina', 'amoxicilina', 'ampicilina', 'amoxil', 'clavulanico'],
    ['aine', 'ibuprofeno', 'diclofenac', 'naproxeno', 'ketorolaco', 'meloxicam', 'aspirina'],
    ['sulfa', 'sulfametoxazol', 'trimetoprim'],
    ['paracetamol', 'acetaminofen'],
    ['dipirona', 'metamizol'],
  ];

  for (const al of allergies) {
    const alLow = al.toLowerCase();
    const tokens = alLow.split(/[\s/,+]+/).filter((t) => t.length >= 4);
    for (const tok of tokens) {
      if (hay.includes(tok)) return al;
      for (const grp of crossGroups) {
        if (grp.some((g) => tok.includes(g) || g.includes(tok)) && grp.some((g) => hay.includes(g))) {
          return al;
        }
      }
    }
  }
  return null;
}

function evaluatePharmacyOpenStatus(horarioStr) {
  const raw = String(horarioStr || '').trim();
  const low = raw.toLowerCase();
  if (!raw || low.includes('24')) {
    return { open: true, label: low.includes('24') ? '🟢 Abierto 24h' : '🟢 Abierto ahora' };
  }

  const now = new Date();
  const day = now.getDay();
  if (low.includes('lun-vie') && (day === 0 || day === 6)) {
    return { open: false, label: '🔴 Cerrado hoy' };
  }
  if ((low.includes('lun-sab') || low.includes('lun-sáb')) && day === 0) {
    return { open: false, label: '🔴 Cerrado hoy' };
  }

  const timeMatches = [...raw.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi)];
  if (timeMatches.length >= 2) {
    const toMins = (m) => {
      let h = parseInt(m[1], 10);
      const min = parseInt(m[2] || '0', 10);
      const ampm = (m[3] || '').toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      return h * 60 + min;
    };
    const startM = toMins(timeMatches[0]);
    const endM = toMins(timeMatches[1]);
    const nowM = now.getHours() * 60 + now.getMinutes();
    const isOpen = endM >= startM ? (nowM >= startM && nowM <= endM) : (nowM >= startM || nowM <= endM);
    return isOpen
      ? { open: true, label: '🟢 Abierto ahora' }
      : { open: false, label: '🔴 Cerrado ahora' };
  }

  return { open: true, label: '🟢 Abierto' };
}


// ============================================================================
// RECUPERACIÓN / CAMBIO DE CONTRASEÑA DE PACIENTE POR CORREO ELECTRÓNICO
// ============================================================================

async function handlePatientForgotSendCode(event) {
  if (event && event.preventDefault) event.preventDefault();
  const email = document.getElementById('pac-forgot-email')?.value.trim() || '';
  const infoEl = document.getElementById('pac-forgot-info');
  const errEl = document.getElementById('pac-forgot-error');
  if (infoEl) infoEl.classList.add('hidden');
  if (errEl) errEl.classList.add('hidden');

  try {
    const res = await fetch('/api/patient/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!data.ok) {
      if (errEl) {
        errEl.textContent = data.error || 'No se pudo enviar el código de verificación.';
        errEl.classList.remove('hidden');
      }
      return;
    }
    if (infoEl) {
      infoEl.textContent = data.smtp_sent
        ? `📧 Código enviado a ${email}. Revisa tu bandeja de entrada.`
        : `📧 Código de verificación generado para ${email}: ${data.verification_code}`;
      infoEl.classList.remove('hidden');
    }
    if (data.verification_code) {
      const codeInp = document.getElementById('pac-forgot-code');
      if (codeInp && !codeInp.value) codeInp.value = data.verification_code;
    }
    showToast('Código de verificación listo.', 'success');
  } catch (e) {
    if (errEl) {
      errEl.textContent = 'Error de conexión al solicitar código.';
      errEl.classList.remove('hidden');
    }
  }
}

async function handlePatientResetPassword(event) {
  if (event && event.preventDefault) event.preventDefault();
  const email = document.getElementById('pac-forgot-email')?.value.trim() || '';
  const code = document.getElementById('pac-forgot-code')?.value.trim() || '';
  const newPwd = document.getElementById('pac-forgot-new-password')?.value.trim() || '';
  const errEl = document.getElementById('pac-forgot-error');
  if (errEl) errEl.classList.add('hidden');

  try {
    const res = await fetch('/api/patient/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, new_password: newPwd }),
    });
    const data = await res.json();
    if (!data.ok) {
      if (errEl) {
        errEl.textContent = data.error || 'No se pudo cambiar la contraseña.';
        errEl.classList.remove('hidden');
      }
      return;
    }
    showToast('✅ Contraseña actualizada. Inicia sesión con tu nueva clave.', 'success');
    const loginIdInp = document.getElementById('pac-login-id');
    const loginPwdInp = document.getElementById('pac-login-password');
    if (loginIdInp) loginIdInp.value = email;
    if (loginPwdInp) loginPwdInp.value = '';
    switchPatientAuthMode('login');
  } catch (e) {
    if (errEl) {
      errEl.textContent = 'Error de conexión al actualizar la contraseña.';
      errEl.classList.remove('hidden');
    }
  }
}
