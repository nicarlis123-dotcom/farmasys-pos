
/* =========================================================================
   CONTROLADOR DE PANTALLA DE CARGA FARMASYS (SEGURO Y SIN BLOQUEOS)
   ========================================================================= */
function showFarmasysLoader(title = "Cargando FarmaSys...", sub = "Un momento por favor...") {
  const el = document.getElementById('farmasys-global-loader');
  if (el) {
    const tEl = document.getElementById('farmasys-loader-title');
    const sEl = document.getElementById('farmasys-loader-sub');
    if (tEl) tEl.textContent = title;
    if (sEl) sEl.textContent = sub;
    el.style.display = 'flex';
    el.style.pointerEvents = 'auto';
    el.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
    el.classList.add('opacity-100');
  }
}

function hideFarmasysLoader() {
  const el = document.getElementById('farmasys-global-loader');
  if (el) {
    el.style.pointerEvents = 'none';
    el.classList.add('opacity-0', 'pointer-events-none');
    el.classList.remove('opacity-100');
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
  const params = new URLSearchParams();
  if (state.searchQuery) params.set('search', state.searchQuery);
  if (state.selectedSymptom && state.selectedSymptom !== 'todos') {
    params.set('symptom', state.selectedSymptom);
  }

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
      const fullRes = await fetch('/api/products');
      const fullData = await fullRes.json();
      if (fullData.ok) state.products = fullData.products;
    }
    state.filteredProducts = data.products;
    renderAppProductsGrid();
    renderPosQuickBarcodes();
    renderBackofficeInventory();
  }
}

async function loadDashboardMetrics() {
  const res = await fetch('/api/dashboard');
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
    const qEsc = escapeJsQuotes(state.searchQuery || '');
    grid.innerHTML = `
      <div class="col-span-full bg-white rounded-2xl p-8 text-center border border-slate-200 space-y-3">
        <p class="text-base font-extrabold text-slate-800">No encontramos ese nombre comercial exacto en el catálogo.</p>
        <p class="text-xs text-slate-600 max-w-lg mx-auto">💡 <strong>FarmaIA te ayuda:</strong> Si no encuentras el medicamento que buscas, nuestra Inteligencia Artificial te recomienda los medicamentos disponibles con el <strong>mismo Principio Activo</strong>.</p>
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
              ${rxBadge}
              ${stockStatusBadge}
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
    // Verificación de duplicidad farmacológica en la app del paciente
  const paNew = (product.principio_activo || '').trim().toLowerCase();
  if (paNew) {
    const duplicate = state.appCart.find(i => {
      if (i.product.id === productId) return false;
      const paExist = (i.product.principio_activo || '').trim().toLowerCase();
      return paExist && (paNew === paExist || paNew.includes(paExist) || paExist.includes(paNew));
    });
    if (duplicate) {
      const ok = confirm(`⚠️ Aviso de Farmacia Davalsi:\n\nYa tienes '${duplicate.product.nombre_comercial}' en tu carrito con el mismo principio activo (${product.principio_activo}).\n\n¿Deseas agregar '${product.nombre_comercial}' de todos modos?`);
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
}

function openCartDrawer() {
  fetchAndApplyLivePharmacyConfig();
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

  document.getElementById('app-cart-total-units').textContent = `${totalUnits} unidades mínimas`;
  document.getElementById('app-cart-total-rd').textContent = formatRD(totalRD);
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

function useSamplePrescription() {
  const sampleUri = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1MjAiIGhlaWdodD0iMzIwIiB2aWV3Qm94PSIwIDAgNTIwIDMyMCI+CiAgPHJlY3Qgd2lkdGg9IjUyMCIgaGVpZ2h0PSIzMjAiIHJ4PSIxNiIgZmlsbD0iI2Y4ZmFmYyIgc3Ryb2tlPSIjMGQ5NDg4IiBzdHJva2Utd2lkdGg9IjMiLz4KICA8dGV4dCB4PSIzMCIgeT0iNDUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IiMwZjc2NmUiPkNFTlRSTyBNw4lESUNPIERPTUlOSUNBTk8g4oCUIFJFQ0VUQSBNw4lESUNBPC90ZXh0PgogIDx0ZXh0IHg9IjMwIiB5PSI3MCIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjEzIiBmaWxsPSIjNDc1NTY5Ij5Eci4gQWxlamFuZHJvIE3DqW5kZXog4oCiIEV4ZXF1w6F0dXIgIzQ4Mi05MSDigKIgQ2FyZGlvbG9nw61hIC8gTWVkaWNpbmEgSW50ZXJuYTwvdGV4dD4KICA8bGluZSB4MT0iMzAiIHkxPSI4NSIgeDI9IjQ5MCIgeTI9Ijg1IiBzdHJva2U9IiNjYmQ1ZTEiIHN0cm9rZS13aWR0aD0iMiIvPgogIDx0ZXh0IHg9IjMwIiB5PSIxMjAiIGZvbnQtZmFtaWx5PSJDb3VyaWVyIE5ldywgbW9ub3NwYWNlIiBmb250LXNpemU9IjE1IiBmb250LXdlaWdodD0iYm9sZCIgZmlsbD0iIzBmMTcyYSI+Ung6IDEpIEFtb3hpbCAvIEFtb3hpY2lsaW5hIDg3NW1nIOKAlCAxIENhamEgKFRvbWFyIDEgYy8xMmggcG9yIDcgZMOtYXMpPC90ZXh0PgogIDx0ZXh0IHg9IjMwIiB5PSIxNTUiIGZvbnQtZmFtaWx5PSJDb3VyaWVyIE5ldywgbW9ub3NwYWNlIiBmb250LXNpemU9IjE1IiBmb250LXdlaWdodD0iYm9sZCIgZmlsbD0iIzBmMTcyYSI+ICAgIDIpIExvc2FydMOhbiBDYXJkaW9EYXYgNTBtZyDigJQgMSBDYWphIChUb21hciAxIGRpYXJpYSBlbiBsYSBtYcOxYW5hKTwvdGV4dD4KICA8cmVjdCB4PSIzMTAiIHk9IjIxNSIgd2lkdGg9IjE3NSIgaGVpZ2h0PSI3MCIgcng9IjgiIGZpbGw9IiNlNmZmZmEiIHN0cm9rZT0iIzBkOTQ4OCIgc3Ryb2tlLWRhc2hhcnJheT0iNCA0Ii8+CiAgPHRleHQgeD0iMzI1IiB5PSIyNDUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxMiIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IiMwZjc2NmUiPlNFTExPIFkgRklSTUEgTcOJRElDQTwvdGV4dD4KICA8dGV4dCB4PSIzMjUiIHk9IjI2OCIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjExIiBmaWxsPSIjMGQ5NDg4Ij5Ww6FsaWRvIHBhcmEgRGVzcGFjaG88L3RleHQ+Cjwvc3ZnPg==';
  state.uploadedPrescriptionUrl = sampleUri;
  document.getElementById('app-rx-preview-img').src = sampleUri;
  document.getElementById('app-rx-preview-wrap').classList.remove('hidden');
  showToast('Receta médica validada adjuntada correctamente.');
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
window.addEventListener('DOMContentLoaded', () => {
  refreshAllData();
  checkPatientAuthOnLoad();
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
  const sessionStr = localStorage.getItem('davalsi_patient_session');

  if (sessionStr) {
    try {
      currentPatient = JSON.parse(sessionStr);
      prefillPatientData();
      loadAppChronic5DayReminders();
    } catch (e) {
      localStorage.removeItem('davalsi_patient_session');
      currentPatient = null;
    }
  } else {
    currentPatient = null;
  }

  // La app permite explorar de inmediato; el modal permanece cerrado por defecto
  closePatientAuthModal();
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
  const loginForm = document.getElementById('form-patient-login');
  const regForm = document.getElementById('form-patient-register');

  if (mode === 'login') {
    if (loginTab) loginTab.className = 'flex-1 py-2 rounded-lg bg-white text-teal-800 shadow transition font-bold cursor-pointer';
    if (regTab) regTab.className = 'flex-1 py-2 rounded-lg text-slate-600 hover:text-slate-900 transition font-bold cursor-pointer';
    if (loginForm) loginForm.classList.remove('hidden');
    if (regForm) regForm.classList.add('hidden');
  } else {
    if (regTab) regTab.className = 'flex-1 py-2 rounded-lg bg-white text-teal-800 shadow transition font-bold cursor-pointer';
    if (loginTab) loginTab.className = 'flex-1 py-2 rounded-lg text-slate-600 hover:text-slate-900 transition font-bold cursor-pointer';
    if (regForm) regForm.classList.remove('hidden');
    if (loginForm) loginForm.classList.add('hidden');
  }
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
    localStorage.setItem('davalsi_patient_session', JSON.stringify(data.patient));
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
    localStorage.setItem('davalsi_patient_session', JSON.stringify(data.patient));
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
  localStorage.removeItem('davalsi_patient_session');
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

  closePatientAuthModal();
  updatePatientHeaderUI();
  showToast('Has cerrado sesión en tu cuenta. Datos protegidos.');
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
    const res = await fetch('/api/pharmacy/config?farmacia_id=1');
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
    if (addrInput) addrInput.value = 'Retiro en Sucursal — Farmacia Davalsi Principal';
  }
}

function applyPatientAppServiceConfig(cfg) {
  if (!cfg) return;
  const cardActive = cfg.pago_tarjeta_activo !== false;
  const deliveryActive = cfg.envio_domicilio_activo !== false;
  const arsActive = cfg.seguro_medico_activo !== false;

  state.pharmacyConfig = {
    pago_tarjeta_activo: cardActive,
    envio_domicilio_activo: deliveryActive,
    seguro_medico_activo: arsActive,
  };

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
const EMBEDDED_DEFAULT_PRODUCTS = [{"id": 1, "farmacia_id": 1, "codigo_barras": "7460101001015", "nombre_comercial": "Paracetamol Davalsi 500mg", "principio_activo": "Paracetamol / Acetaminofén", "concentracion": "500mg / 65mg", "laboratorio": "GSK / Rowe", "categoria": "Analgésicos y Antipiréticos", "sintomas_tags": "fiebre,dolor de cabeza,malestar general,gripe", "unidad_minima_nombre": "Tableta", "precio_base": 35.0, "descuento_blister_pct": 5.0, "descuento_caja_pct": 12.0, "requiere_receta": false, "unidades_por_blister": 10, "blisters_por_caja": 3, "stock_total_unidades": 39, "stock_minimo_alerta": 30, "lote": "LOT-26A10-F1", "fecha_vencimiento": "2027-06-19", "ubicacion_anaquel": "A-01", "activo": 1, "sintomas_lista": ["fiebre", "dolor de cabeza", "malestar general", "gripe"], "unidades_por_caja": 30, "permite_blister": true, "permite_caja": true, "es_mercancia": false, "inventario": {"stock_total_unidades": 39, "unidades_por_blister": 10, "blisters_por_caja": 3, "unidades_por_caja": 30, "cajas_disponibles": 1, "blisters_disponibles": 3, "desglose_fisico": {"cajas": 1, "blisters_sueltos": 0, "unidades_sueltas": 9, "texto": "1 Caja(s) + 0 Blíster(es) + 9 Unid."}, "stock_minimo_alerta": 30, "alerta_stock_bajo": false, "estado_stock": "BAJO"}, "precios_presentacion": {"UNIDAD": 35.0, "BLISTER": 332.5, "CAJA": 924.0}, "vencimiento": {"fecha_vencimiento": "2027-06-19", "dias_para_vencer": 237, "estado_vencimiento": "VIGENTE", "etiqueta_vencimiento": "Vigente (237 días restantes)", "alerta_vencimiento": false, "es_menor_7_meses": false, "vencido": false, "severidad": 0}}, {"id": 2, "farmacia_id": 1, "codigo_barras": "7460101002029", "nombre_comercial": "Amoxil / Amoxicilina Clavulánico 875mg", "principio_activo": "Amoxicilina + Ácido Clavulánico", "concentracion": "875mg / 125mg", "laboratorio": "Laboratorios Sued & Fargesa", "categoria": "Antibióticos", "sintomas_tags": "infeccion,garganta,fiebre", "unidad_minima_nombre": "Comprimido", "precio_base": 95.0, "descuento_blister_pct": 5.0, "descuento_caja_pct": 10.0, "requiere_receta": true, "unidades_por_blister": 7, "blisters_por_caja": 2, "stock_total_unidades": 9, "stock_minimo_alerta": 14, "lote": "LOT-26B04-F1", "fecha_vencimiento": "2026-11-09", "ubicacion_anaquel": "B-04", "activo": 1, "sintomas_lista": ["infeccion", "garganta", "fiebre"], "unidades_por_caja": 14, "permite_blister": true, "permite_caja": true, "es_mercancia": false, "inventario": {"stock_total_unidades": 9, "unidades_por_blister": 7, "blisters_por_caja": 2, "unidades_por_caja": 14, "cajas_disponibles": 0, "blisters_disponibles": 1, "desglose_fisico": {"cajas": 0, "blisters_sueltos": 1, "unidades_sueltas": 2, "texto": "0 Caja(s) + 1 Blíster(es) + 2 Unid."}, "stock_minimo_alerta": 14, "alerta_stock_bajo": true, "estado_stock": "CRITICO"}, "precios_presentacion": {"UNIDAD": 95.0, "BLISTER": 631.75, "CAJA": 1197.0}, "vencimiento": {"fecha_vencimiento": "2026-11-09", "dias_para_vencer": 15, "estado_vencimiento": "CRITICO_30D", "etiqueta_vencimiento": "Vence en 15 día(s) (Crítico ≤30d)", "alerta_vencimiento": true, "es_menor_7_meses": true, "vencido": false, "severidad": 2}}, {"id": 3, "farmacia_id": 1, "codigo_barras": "7460101003033", "nombre_comercial": "Voltaren Dolo / Diclofenac Potásico", "principio_activo": "Diclofenac Potásico", "concentracion": "50mg", "laboratorio": "Novartis / Infaca", "categoria": "Antiinflamatorios", "sintomas_tags": "dolor muscular,inflamacion,dolor de cabeza", "unidad_minima_nombre": "Gragea", "precio_base": 28.0, "descuento_blister_pct": 6.0, "descuento_caja_pct": 14.0, "requiere_receta": false, "unidades_por_blister": 10, "blisters_por_caja": 3, "stock_total_unidades": 62, "stock_minimo_alerta": 25, "lote": "LOT-26C19-F1", "fecha_vencimiento": "2026-12-23", "ubicacion_anaquel": "A-03", "activo": 1, "sintomas_lista": ["dolor muscular", "inflamacion", "dolor de cabeza"], "unidades_por_caja": 30, "permite_blister": true, "permite_caja": true, "es_mercancia": false, "inventario": {"stock_total_unidades": 62, "unidades_por_blister": 10, "blisters_por_caja": 3, "unidades_por_caja": 30, "cajas_disponibles": 2, "blisters_disponibles": 6, "desglose_fisico": {"cajas": 2, "blisters_sueltos": 0, "unidades_sueltas": 2, "texto": "2 Caja(s) + 0 Blíster(es) + 2 Unid."}, "stock_minimo_alerta": 25, "alerta_stock_bajo": false, "estado_stock": "OPTIMO"}, "precios_presentacion": {"UNIDAD": 28.0, "BLISTER": 263.2, "CAJA": 722.4}, "vencimiento": {"fecha_vencimiento": "2026-12-23", "dias_para_vencer": 59, "estado_vencimiento": "PREVENTIVO_90D", "etiqueta_vencimiento": "Vence en 59 días (Preventivo ≤90d)", "alerta_vencimiento": true, "es_menor_7_meses": true, "vencido": false, "severidad": 1}}, {"id": 4, "farmacia_id": 1, "codigo_barras": "7460101004047", "nombre_comercial": "Azitromicina Davalsi 500mg", "principio_activo": "Azitromicina Dihidrato", "concentracion": "500mg", "laboratorio": "Laboratorios Magnachem", "categoria": "Antibióticos", "sintomas_tags": "infeccion,garganta,gripe,fiebre", "unidad_minima_nombre": "Tableta", "precio_base": 135.0, "descuento_blister_pct": 4.0, "descuento_caja_pct": 10.0, "requiere_receta": true, "unidades_por_blister": 3, "blisters_por_caja": 2, "stock_total_unidades": 7, "stock_minimo_alerta": 18, "lote": "LOT-26D02-F1", "fecha_vencimiento": "2026-10-31", "ubicacion_anaquel": "B-01", "activo": 1, "sintomas_lista": ["infeccion", "garganta", "gripe", "fiebre"], "unidades_por_caja": 6, "permite_blister": true, "permite_caja": true, "es_mercancia": false, "inventario": {"stock_total_unidades": 7, "unidades_por_blister": 3, "blisters_por_caja": 2, "unidades_por_caja": 6, "cajas_disponibles": 1, "blisters_disponibles": 2, "desglose_fisico": {"cajas": 1, "blisters_sueltos": 0, "unidades_sueltas": 1, "texto": "1 Caja(s) + 0 Blíster(es) + 1 Unid."}, "stock_minimo_alerta": 18, "alerta_stock_bajo": true, "estado_stock": "CRITICO"}, "precios_presentacion": {"UNIDAD": 135.0, "BLISTER": 388.8, "CAJA": 729.0}, "vencimiento": {"fecha_vencimiento": "2026-10-31", "dias_para_vencer": 6, "estado_vencimiento": "CRITICO_30D", "etiqueta_vencimiento": "Vence en 6 día(s) (Crítico ≤30d)", "alerta_vencimiento": true, "es_menor_7_meses": true, "vencido": false, "severidad": 2}}, {"id": 5, "farmacia_id": 1, "codigo_barras": "7460101005051", "nombre_comercial": "Omeprazol Gastril 20mg", "principio_activo": "Omeprazol", "concentracion": "20mg", "laboratorio": "Laboratorios Feltrex", "categoria": "Gastrointestinal", "sintomas_tags": "acidez,estomago,reflujo", "unidad_minima_nombre": "Cápsula", "precio_base": 22.0, "descuento_blister_pct": 5.0, "descuento_caja_pct": 15.0, "requiere_receta": false, "unidades_por_blister": 10, "blisters_por_caja": 3, "stock_total_unidades": 180, "stock_minimo_alerta": 30, "lote": "LOT-26E88-F1", "fecha_vencimiento": "2027-04-20", "ubicacion_anaquel": "C-02", "activo": 1, "sintomas_lista": ["acidez", "estomago", "reflujo"], "unidades_por_caja": 30, "permite_blister": true, "permite_caja": true, "es_mercancia": false, "inventario": {"stock_total_unidades": 180, "unidades_por_blister": 10, "blisters_por_caja": 3, "unidades_por_caja": 30, "cajas_disponibles": 6, "blisters_disponibles": 18, "desglose_fisico": {"cajas": 6, "blisters_sueltos": 0, "unidades_sueltas": 0, "texto": "6 Caja(s) + 0 Blíster(es) + 0 Unid."}, "stock_minimo_alerta": 30, "alerta_stock_bajo": false, "estado_stock": "OPTIMO"}, "precios_presentacion": {"UNIDAD": 22.0, "BLISTER": 209.0, "CAJA": 561.0}, "vencimiento": {"fecha_vencimiento": "2027-04-20", "dias_para_vencer": 177, "estado_vencimiento": "ALERTA_7_MESES", "etiqueta_vencimiento": "Vence en 177 días (~5.8 meses | Alerta ≤ 7 Meses)", "alerta_vencimiento": true, "es_menor_7_meses": true, "vencido": false, "severidad": 1}}, {"id": 6, "farmacia_id": 1, "codigo_barras": "7460101006065", "nombre_comercial": "Desloratadina AlergiFin 5mg", "principio_activo": "Desloratadina", "concentracion": "5mg", "laboratorio": "Acromax Dominicana", "categoria": "Antialérgicos y Respiratorios", "sintomas_tags": "alergia,gripe,congestion", "unidad_minima_nombre": "Tableta", "precio_base": 42.0, "descuento_blister_pct": 5.0, "descuento_caja_pct": 12.0, "requiere_receta": false, "unidades_por_blister": 10, "blisters_por_caja": 2, "stock_total_unidades": 19, "stock_minimo_alerta": 20, "lote": "LOT-26F11-F1", "fecha_vencimiento": "2026-12-06", "ubicacion_anaquel": "C-05", "activo": 1, "sintomas_lista": ["alergia", "gripe", "congestion"], "unidades_por_caja": 20, "permite_blister": true, "permite_caja": true, "es_mercancia": false, "inventario": {"stock_total_unidades": 19, "unidades_por_blister": 10, "blisters_por_caja": 2, "unidades_por_caja": 20, "cajas_disponibles": 0, "blisters_disponibles": 1, "desglose_fisico": {"cajas": 0, "blisters_sueltos": 1, "unidades_sueltas": 9, "texto": "0 Caja(s) + 1 Blíster(es) + 9 Unid."}, "stock_minimo_alerta": 20, "alerta_stock_bajo": true, "estado_stock": "CRITICO"}, "precios_presentacion": {"UNIDAD": 42.0, "BLISTER": 399.0, "CAJA": 739.2}, "vencimiento": {"fecha_vencimiento": "2026-12-06", "dias_para_vencer": 42, "estado_vencimiento": "PREVENTIVO_90D", "etiqueta_vencimiento": "Vence en 42 días (Preventivo ≤90d)", "alerta_vencimiento": true, "es_menor_7_meses": true, "vencido": false, "severidad": 1}}, {"id": 7, "farmacia_id": 1, "codigo_barras": "7460101007079", "nombre_comercial": "Losartán CardioDav 50mg", "principio_activo": "Losartán Potásico", "concentracion": "50mg", "laboratorio": "Ethical Pharmaceutical RD", "categoria": "Cardiovascular e Hipertensión", "sintomas_tags": "presion arterial,corazon,dolor de cabeza", "unidad_minima_nombre": "Comprimido", "precio_base": 25.0, "descuento_blister_pct": 5.0, "descuento_caja_pct": 15.0, "requiere_receta": true, "unidades_por_blister": 10, "blisters_por_caja": 3, "stock_total_unidades": 112, "stock_minimo_alerta": 30, "lote": "LOT-26G50-F1", "fecha_vencimiento": "2027-06-19", "ubicacion_anaquel": "D-01", "activo": 1, "sintomas_lista": ["presion arterial", "corazon", "dolor de cabeza"], "unidades_por_caja": 30, "permite_blister": true, "permite_caja": true, "es_mercancia": false, "inventario": {"stock_total_unidades": 112, "unidades_por_blister": 10, "blisters_por_caja": 3, "unidades_por_caja": 30, "cajas_disponibles": 3, "blisters_disponibles": 11, "desglose_fisico": {"cajas": 3, "blisters_sueltos": 2, "unidades_sueltas": 2, "texto": "3 Caja(s) + 2 Blíster(es) + 2 Unid."}, "stock_minimo_alerta": 30, "alerta_stock_bajo": false, "estado_stock": "OPTIMO"}, "precios_presentacion": {"UNIDAD": 25.0, "BLISTER": 237.5, "CAJA": 637.5}, "vencimiento": {"fecha_vencimiento": "2027-06-19", "dias_para_vencer": 237, "estado_vencimiento": "VIGENTE", "etiqueta_vencimiento": "Vigente (237 días restantes)", "alerta_vencimiento": false, "es_menor_7_meses": false, "vencido": false, "severidad": 0}}, {"id": 8, "farmacia_id": 1, "codigo_barras": "7460101008083", "nombre_comercial": "Jarabe Pediátrico Ambroxol (Lote Vencido Demo)", "principio_activo": "Ambroxol Clorhidrato", "concentracion": "15mg/5ml", "laboratorio": "Laboratorios Lam", "categoria": "Respiratorios", "sintomas_tags": "gripe,tos,congestion", "unidad_minima_nombre": "Dosis", "precio_base": 35.0, "descuento_blister_pct": 5.0, "descuento_caja_pct": 10.0, "requiere_receta": false, "unidades_por_blister": 5, "blisters_por_caja": 4, "stock_total_unidades": 24, "stock_minimo_alerta": 20, "lote": "LOT-24X99-F1", "fecha_vencimiento": "2026-10-16", "ubicacion_anaquel": "Z-CUARENTENA", "activo": 1, "sintomas_lista": ["gripe", "tos", "congestion"], "unidades_por_caja": 20, "permite_blister": true, "permite_caja": true, "es_mercancia": false, "inventario": {"stock_total_unidades": 24, "unidades_por_blister": 5, "blisters_por_caja": 4, "unidades_por_caja": 20, "cajas_disponibles": 1, "blisters_disponibles": 4, "desglose_fisico": {"cajas": 1, "blisters_sueltos": 0, "unidades_sueltas": 4, "texto": "1 Caja(s) + 0 Blíster(es) + 4 Unid."}, "stock_minimo_alerta": 20, "alerta_stock_bajo": false, "estado_stock": "BAJO"}, "precios_presentacion": {"UNIDAD": 35.0, "BLISTER": 166.25, "CAJA": 630.0}, "vencimiento": {"fecha_vencimiento": "2026-10-16", "dias_para_vencer": -9, "estado_vencimiento": "VENCIDO", "etiqueta_vencimiento": "VENCIDO hace 9 día(s)", "alerta_vencimiento": true, "es_menor_7_meses": true, "vencido": true, "severidad": 3}}, {"id": 9, "farmacia_id": 1, "codigo_barras": "7460101009097", "nombre_comercial": "Desodorante Rexona Clinical Men Antitranspirante 50g", "principio_activo": "Aluminio Zirconio Tetraclorohidrex", "concentracion": "50g Barra Crema", "laboratorio": "Unilever / Rexona", "categoria": "Cuidado Personal", "sintomas_tags": "desodorante,antitranspirante,higiene,sudor,hombre", "unidad_minima_nombre": "Unidad", "precio_base": 300.0, "descuento_blister_pct": 0.0, "descuento_caja_pct": 5.0, "requiere_receta": false, "unidades_por_blister": 1, "blisters_por_caja": 12, "stock_total_unidades": 50, "stock_minimo_alerta": 6, "lote": "LOT-REEMPLAZAR-02", "fecha_vencimiento": "2027-12-31", "ubicacion_anaquel": "Pasillo 1 - Cabecera", "activo": 1, "sintomas_lista": ["desodorante", "antitranspirante", "higiene", "sudor", "hombre"], "unidades_por_caja": 12, "permite_blister": false, "permite_caja": true, "es_mercancia": false, "inventario": {"stock_total_unidades": 50, "unidades_por_blister": 1, "blisters_por_caja": 12, "unidades_por_caja": 12, "cajas_disponibles": 4, "blisters_disponibles": 50, "desglose_fisico": {"cajas": 4, "blisters_sueltos": 2, "unidades_sueltas": 0, "texto": "4 Caja(s) + 2 Blíster(es) + 0 Unid."}, "stock_minimo_alerta": 6, "alerta_stock_bajo": false, "estado_stock": "OPTIMO"}, "precios_presentacion": {"UNIDAD": 300.0, "BLISTER": 300.0, "CAJA": 3420.0}, "vencimiento": {"fecha_vencimiento": "2027-12-31", "dias_para_vencer": 432, "estado_vencimiento": "VIGENTE", "etiqueta_vencimiento": "Vigente (432 días restantes)", "alerta_vencimiento": false, "es_menor_7_meses": false, "vencido": false, "severidad": 0}}, {"id": 10, "farmacia_id": 1, "codigo_barras": "7460101009103", "nombre_comercial": "Desodorante Lady Speed Stick Powder Roll-On 50ml", "principio_activo": "Antitranspirante Femenino", "concentracion": "50ml Roll-On", "laboratorio": "Colgate-Palmolive", "categoria": "Cuidado Personal", "sintomas_tags": "desodorante,rollon,mujer,higiene,antitranspirante", "unidad_minima_nombre": "Unidad", "precio_base": 165.0, "descuento_blister_pct": 0.0, "descuento_caja_pct": 6.0, "requiere_receta": false, "unidades_por_blister": 1, "blisters_por_caja": 12, "stock_total_unidades": 28, "stock_minimo_alerta": 6, "lote": "LOT-26LSS2-F1", "fecha_vencimiento": "2027-04-23", "ubicacion_anaquel": "Pasillo 1 - Cuidado Personal", "activo": 1, "sintomas_lista": ["desodorante", "rollon", "mujer", "higiene", "antitranspirante"], "unidades_por_caja": 12, "permite_blister": false, "permite_caja": true, "es_mercancia": false, "inventario": {"stock_total_unidades": 28, "unidades_por_blister": 1, "blisters_por_caja": 12, "unidades_por_caja": 12, "cajas_disponibles": 2, "blisters_disponibles": 28, "desglose_fisico": {"cajas": 2, "blisters_sueltos": 4, "unidades_sueltas": 0, "texto": "2 Caja(s) + 4 Blíster(es) + 0 Unid."}, "stock_minimo_alerta": 6, "alerta_stock_bajo": false, "estado_stock": "OPTIMO"}, "precios_presentacion": {"UNIDAD": 165.0, "BLISTER": 165.0, "CAJA": 1861.2}, "vencimiento": {"fecha_vencimiento": "2027-04-23", "dias_para_vencer": 180, "estado_vencimiento": "ALERTA_7_MESES", "etiqueta_vencimiento": "Vence en 180 días (~5.9 meses | Alerta ≤ 7 Meses)", "alerta_vencimiento": true, "es_menor_7_meses": true, "vencido": false, "severidad": 1}}, {"id": 11, "farmacia_id": 1, "codigo_barras": "7460101009110", "nombre_comercial": "Lima de Uñas Profesional Esmeril 7 Pasos Brillo", "principio_activo": "Esmeril Abrasivo Pulidor", "concentracion": "1 Unidad Multisuperficie", "laboratorio": "Trim Beauty Tools", "categoria": "Limas y Manicura", "sintomas_tags": "lima,unas,manicura,pedicura,belleza,pulidor", "unidad_minima_nombre": "Pieza", "precio_base": 95.0, "descuento_blister_pct": 0.0, "descuento_caja_pct": 10.0, "requiere_receta": false, "unidades_por_blister": 1, "blisters_por_caja": 24, "stock_total_unidades": 45, "stock_minimo_alerta": 10, "lote": "LOT-26LIMA1-F1", "fecha_vencimiento": "2027-06-22", "ubicacion_anaquel": "Mostrador - Vitrina Limas", "activo": 1, "sintomas_lista": ["lima", "unas", "manicura", "pedicura", "belleza", "pulidor"], "unidades_por_caja": 24, "permite_blister": false, "permite_caja": true, "es_mercancia": false, "inventario": {"stock_total_unidades": 45, "unidades_por_blister": 1, "blisters_por_caja": 24, "unidades_por_caja": 24, "cajas_disponibles": 1, "blisters_disponibles": 45, "desglose_fisico": {"cajas": 1, "blisters_sueltos": 21, "unidades_sueltas": 0, "texto": "1 Caja(s) + 21 Blíster(es) + 0 Unid."}, "stock_minimo_alerta": 10, "alerta_stock_bajo": false, "estado_stock": "OPTIMO"}, "precios_presentacion": {"UNIDAD": 95.0, "BLISTER": 95.0, "CAJA": 2052.0}, "vencimiento": {"fecha_vencimiento": "2027-06-22", "dias_para_vencer": 240, "estado_vencimiento": "VIGENTE", "etiqueta_vencimiento": "Vigente (240 días restantes)", "alerta_vencimiento": false, "es_menor_7_meses": false, "vencido": false, "severidad": 0}}, {"id": 12, "farmacia_id": 1, "codigo_barras": "7460101009127", "nombre_comercial": "Lima Metálica Diamante con Mango Antideslizante", "principio_activo": "Acero Inoxidable Quirúrgico", "concentracion": "6 Pulgadas", "laboratorio": "Revlon / Titania", "categoria": "Limas y Manicura", "sintomas_tags": "lima,metalica,acero,unas,manicura,belleza", "unidad_minima_nombre": "Pieza", "precio_base": 125.0, "descuento_blister_pct": 0.0, "descuento_caja_pct": 8.0, "requiere_receta": false, "unidades_por_blister": 1, "blisters_por_caja": 12, "stock_total_unidades": 30, "stock_minimo_alerta": 8, "lote": "LOT-26LIMA2-F1", "fecha_vencimiento": "2027-06-22", "ubicacion_anaquel": "Mostrador - Vitrina Limas", "activo": 1, "sintomas_lista": ["lima", "metalica", "acero", "unas", "manicura", "belleza"], "unidades_por_caja": 12, "permite_blister": false, "permite_caja": true, "es_mercancia": false, "inventario": {"stock_total_unidades": 30, "unidades_por_blister": 1, "blisters_por_caja": 12, "unidades_por_caja": 12, "cajas_disponibles": 2, "blisters_disponibles": 30, "desglose_fisico": {"cajas": 2, "blisters_sueltos": 6, "unidades_sueltas": 0, "texto": "2 Caja(s) + 6 Blíster(es) + 0 Unid."}, "stock_minimo_alerta": 8, "alerta_stock_bajo": false, "estado_stock": "OPTIMO"}, "precios_presentacion": {"UNIDAD": 125.0, "BLISTER": 125.0, "CAJA": 1380.0}, "vencimiento": {"fecha_vencimiento": "2027-06-22", "dias_para_vencer": 240, "estado_vencimiento": "VIGENTE", "etiqueta_vencimiento": "Vigente (240 días restantes)", "alerta_vencimiento": false, "es_menor_7_meses": false, "vencido": false, "severidad": 0}}, {"id": 13, "farmacia_id": 1, "codigo_barras": "7460101009134", "nombre_comercial": "Champú Anticaspa Head & Shoulders Limpieza Renovadora 375ml", "principio_activo": "Piritionato de Zinc 1%", "concentracion": "375ml", "laboratorio": "Procter & Gamble", "categoria": "Cuidado Personal", "sintomas_tags": "champu,caspa,cabello,higiene,limpieza", "unidad_minima_nombre": "Frasco", "precio_base": 340.0, "descuento_blister_pct": 0.0, "descuento_caja_pct": 5.0, "requiere_receta": false, "unidades_por_blister": 1, "blisters_por_caja": 6, "stock_total_unidades": 22, "stock_minimo_alerta": 5, "lote": "LOT-26HS03-F1", "fecha_vencimiento": "2027-04-23", "ubicacion_anaquel": "Pasillo 2 - Cuidado Capilar", "activo": 1, "sintomas_lista": ["champu", "caspa", "cabello", "higiene", "limpieza"], "unidades_por_caja": 6, "permite_blister": false, "permite_caja": true, "es_mercancia": false, "inventario": {"stock_total_unidades": 22, "unidades_por_blister": 1, "blisters_por_caja": 6, "unidades_por_caja": 6, "cajas_disponibles": 3, "blisters_disponibles": 22, "desglose_fisico": {"cajas": 3, "blisters_sueltos": 4, "unidades_sueltas": 0, "texto": "3 Caja(s) + 4 Blíster(es) + 0 Unid."}, "stock_minimo_alerta": 5, "alerta_stock_bajo": false, "estado_stock": "OPTIMO"}, "precios_presentacion": {"UNIDAD": 340.0, "BLISTER": 340.0, "CAJA": 1938.0}, "vencimiento": {"fecha_vencimiento": "2027-04-23", "dias_para_vencer": 180, "estado_vencimiento": "ALERTA_7_MESES", "etiqueta_vencimiento": "Vence en 180 días (~5.9 meses | Alerta ≤ 7 Meses)", "alerta_vencimiento": true, "es_menor_7_meses": true, "vencido": false, "severidad": 1}}, {"id": 14, "farmacia_id": 1, "codigo_barras": "7460101009141", "nombre_comercial": "Curitas Adhesivas Antibacterianas Curad (Caja x 30)", "principio_activo": "Cloruro de Benzalconio Antiséptico", "concentracion": "Caja 30 Unidades", "laboratorio": "Medline Curad", "categoria": "Material Médico y Curaciones", "sintomas_tags": "curitas,heridas,cortaduras,primeros auxilios,adhesivas", "unidad_minima_nombre": "Caja", "precio_base": 180.0, "descuento_blister_pct": 0.0, "descuento_caja_pct": 8.0, "requiere_receta": false, "unidades_por_blister": 1, "blisters_por_caja": 10, "stock_total_unidades": 40, "stock_minimo_alerta": 8, "lote": "LOT-26CUR4-F1", "fecha_vencimiento": "2027-06-22", "ubicacion_anaquel": "Pasillo 3 - Primeros Auxilios", "activo": 1, "sintomas_lista": ["curitas", "heridas", "cortaduras", "primeros auxilios", "adhesivas"], "unidades_por_caja": 10, "permite_blister": false, "permite_caja": true, "es_mercancia": false, "inventario": {"stock_total_unidades": 40, "unidades_por_blister": 1, "blisters_por_caja": 10, "unidades_por_caja": 10, "cajas_disponibles": 4, "blisters_disponibles": 40, "desglose_fisico": {"cajas": 4, "blisters_sueltos": 0, "unidades_sueltas": 0, "texto": "4 Caja(s) + 0 Blíster(es) + 0 Unid."}, "stock_minimo_alerta": 8, "alerta_stock_bajo": false, "estado_stock": "OPTIMO"}, "precios_presentacion": {"UNIDAD": 180.0, "BLISTER": 180.0, "CAJA": 1656.0}, "vencimiento": {"fecha_vencimiento": "2027-06-22", "dias_para_vencer": 240, "estado_vencimiento": "VIGENTE", "etiqueta_vencimiento": "Vigente (240 días restantes)", "alerta_vencimiento": false, "es_menor_7_meses": false, "vencido": false, "severidad": 0}}, {"id": 15, "farmacia_id": 1, "codigo_barras": "7460101009158", "nombre_comercial": "Cepillo Dental Colgate Triple Acción 2x1 Pack", "principio_activo": "Cerdas Medias Antibacterianas", "concentracion": "Pack 2 Cepillos", "laboratorio": "Colgate-Palmolive", "categoria": "Higiene y Cuidado Personal", "sintomas_tags": "cepillo,dientes,dental,colgate,higiene oral", "unidad_minima_nombre": "Paquete", "precio_base": 145.0, "descuento_blister_pct": 0.0, "descuento_caja_pct": 6.0, "requiere_receta": false, "unidades_por_blister": 1, "blisters_por_caja": 12, "stock_total_unidades": 35, "stock_minimo_alerta": 8, "lote": "LOT-26COL5-F1", "fecha_vencimiento": "2027-06-22", "ubicacion_anaquel": "Pasillo 1 - Higiene Oral", "activo": 1, "sintomas_lista": ["cepillo", "dientes", "dental", "colgate", "higiene oral"], "unidades_por_caja": 12, "permite_blister": false, "permite_caja": true, "es_mercancia": false, "inventario": {"stock_total_unidades": 35, "unidades_por_blister": 1, "blisters_por_caja": 12, "unidades_por_caja": 12, "cajas_disponibles": 2, "blisters_disponibles": 35, "desglose_fisico": {"cajas": 2, "blisters_sueltos": 11, "unidades_sueltas": 0, "texto": "2 Caja(s) + 11 Blíster(es) + 0 Unid."}, "stock_minimo_alerta": 8, "alerta_stock_bajo": false, "estado_stock": "OPTIMO"}, "precios_presentacion": {"UNIDAD": 145.0, "BLISTER": 145.0, "CAJA": 1635.6}, "vencimiento": {"fecha_vencimiento": "2027-06-22", "dias_para_vencer": 240, "estado_vencimiento": "VIGENTE", "etiqueta_vencimiento": "Vigente (240 días restantes)", "alerta_vencimiento": false, "es_menor_7_meses": false, "vencido": false, "severidad": 0}}, {"id": 16, "farmacia_id": 1, "codigo_barras": "7460101009165", "nombre_comercial": "Alcohol Isopropílico Antiséptico 70% 500ml", "principio_activo": "Alcohol Isopropílico 70%", "concentracion": "500ml", "laboratorio": "Laboratorios Roldán", "categoria": "Material Médico y Curaciones", "sintomas_tags": "alcohol,desinfectante,antiseptico,curacion,primeros auxilios", "unidad_minima_nombre": "Frasco", "precio_base": 110.0, "descuento_blister_pct": 0.0, "descuento_caja_pct": 5.0, "requiere_receta": false, "unidades_por_blister": 1, "blisters_por_caja": 12, "stock_total_unidades": 50, "stock_minimo_alerta": 12, "lote": "LOT-26ALC6-F1", "fecha_vencimiento": "2027-04-23", "ubicacion_anaquel": "Pasillo 3 - Antisépticos", "activo": 1, "sintomas_lista": ["alcohol", "desinfectante", "antiseptico", "curacion", "primeros auxilios"], "unidades_por_caja": 12, "permite_blister": false, "permite_caja": true, "es_mercancia": false, "inventario": {"stock_total_unidades": 50, "unidades_por_blister": 1, "blisters_por_caja": 12, "unidades_por_caja": 12, "cajas_disponibles": 4, "blisters_disponibles": 50, "desglose_fisico": {"cajas": 4, "blisters_sueltos": 2, "unidades_sueltas": 0, "texto": "4 Caja(s) + 2 Blíster(es) + 0 Unid."}, "stock_minimo_alerta": 12, "alerta_stock_bajo": false, "estado_stock": "OPTIMO"}, "precios_presentacion": {"UNIDAD": 110.0, "BLISTER": 110.0, "CAJA": 1254.0}, "vencimiento": {"fecha_vencimiento": "2027-04-23", "dias_para_vencer": 180, "estado_vencimiento": "ALERTA_7_MESES", "etiqueta_vencimiento": "Vence en 180 días (~5.9 meses | Alerta ≤ 7 Meses)", "alerta_vencimiento": true, "es_menor_7_meses": true, "vencido": false, "severidad": 1}}, {"id": 17, "farmacia_id": 1, "codigo_barras": "7469001170152", "nombre_comercial": "Gel Fijador Egos Black For Men 250ml", "principio_activo": "Fijación Extrema", "concentracion": "250ml Frasco", "laboratorio": "Genomma Lab", "categoria": "Cuidado Personal", "sintomas_tags": "gel,cabello,fijador,hombre,higiene", "unidad_minima_nombre": "Frasco", "precio_base": 195.0, "descuento_blister_pct": 0.0, "descuento_caja_pct": 10.0, "requiere_receta": false, "unidades_por_blister": 1, "blisters_por_caja": 6, "stock_total_unidades": 18, "stock_minimo_alerta": 4, "lote": "LOT-EGOS-2026", "fecha_vencimiento": "2027-09-15", "ubicacion_anaquel": "Pasillo 2 - Cuidado Masculino", "activo": 1, "sintomas_lista": ["gel", "cabello", "fijador", "hombre", "higiene"], "unidades_por_caja": 6, "permite_blister": false, "permite_caja": true, "es_mercancia": false, "inventario": {"stock_total_unidades": 18, "unidades_por_blister": 1, "blisters_por_caja": 6, "unidades_por_caja": 6, "cajas_disponibles": 3, "blisters_disponibles": 18, "desglose_fisico": {"cajas": 3, "blisters_sueltos": 0, "unidades_sueltas": 0, "texto": "3 Caja(s) + 0 Blíster(es) + 0 Unid."}, "stock_minimo_alerta": 4, "alerta_stock_bajo": false, "estado_stock": "OPTIMO"}, "precios_presentacion": {"UNIDAD": 195.0, "BLISTER": 195.0, "CAJA": 1053.0}, "vencimiento": {"fecha_vencimiento": "2027-09-15", "dias_para_vencer": 325, "estado_vencimiento": "VIGENTE", "etiqueta_vencimiento": "Vigente (325 días restantes)", "alerta_vencimiento": false, "es_menor_7_meses": false, "vencido": false, "severidad": 0}}, {"id": 18, "farmacia_id": 1, "codigo_barras": "7469998881110", "nombre_comercial": "Lima de Cartón Abrasiva 100/180", "principio_activo": "Trim Manicura", "concentracion": "1 Unidad", "laboratorio": "Distribución General", "categoria": "Limas y Manicura", "sintomas_tags": "limas,manicura,unas", "unidad_minima_nombre": "Unidad", "precio_base": 42.5, "descuento_blister_pct": 0.0, "descuento_caja_pct": 10.0, "requiere_receta": false, "unidades_por_blister": 1, "blisters_por_caja": 24, "stock_total_unidades": 50, "stock_minimo_alerta": 10, "lote": "LOT-2026-FINAL", "fecha_vencimiento": "2029-05-15", "ubicacion_anaquel": "Pasillo 1 - Sección Cosmética", "activo": 1, "sintomas_lista": ["limas", "manicura", "unas"], "unidades_por_caja": 24, "permite_blister": false, "permite_caja": true, "es_mercancia": false, "inventario": {"stock_total_unidades": 50, "unidades_por_blister": 1, "blisters_por_caja": 24, "unidades_por_caja": 24, "cajas_disponibles": 2, "blisters_disponibles": 50, "desglose_fisico": {"cajas": 2, "blisters_sueltos": 2, "unidades_sueltas": 0, "texto": "2 Caja(s) + 2 Blíster(es) + 0 Unid."}, "stock_minimo_alerta": 10, "alerta_stock_bajo": false, "estado_stock": "OPTIMO"}, "precios_presentacion": {"UNIDAD": 42.5, "BLISTER": 42.5, "CAJA": 918.0}, "vencimiento": {"fecha_vencimiento": "2029-05-15", "dias_para_vencer": 933, "estado_vencimiento": "VIGENTE", "etiqueta_vencimiento": "Vigente (933 días restantes)", "alerta_vencimiento": false, "es_menor_7_meses": false, "vencido": false, "severidad": 0}}];
const EMBEDDED_DEFAULT_CONFIG = {"id": 1, "uuid_farmacia": "059accf8-1159-42d1-99f4-051f80ec3c09", "codigo": "DAVALSI-PIANTINI", "nombre": "Farmacia Davalsi — Principal", "eslogan": "Sistema de Farmacia Omnicanal", "ciudad_sector": "Piantini, Santo Domingo D.N.", "telefono": "809-555-0199", "direccion": "Av. Abraham Lincoln #402, Piantini, Santo Domingo", "telefono_whatsapp": "18095550199", "wa_activo": true, "mensaje_factura": "¡Gracias por su compra! Su salud es nuestra prioridad.", "usuario_admin": "nicarlis123", "pista_clave_demo": "davalsi123", "rnc": "1-31-99887-2", "banco_nombre": "Banco Popular Dominicano / Banreservas", "banco_cuenta": "Popular: 789-451230-9 | Banreservas: 960-112233-4", "wa_provider": "META_CLOUD_API", "meta_phone_number_id": "105928374650192", "meta_access_token": "", "meta_api_version": "v20.0", "twilio_account_sid": "", "twilio_auth_token": "", "twilio_from_number": "whatsapp:+14155238886", "public_base_url": "http://localhost:8080", "horario": "Lun-Dom 24 Horas", "activa": 1, "pago_tarjeta_activo": false, "envio_domicilio_activo": false, "seguro_medico_activo": false};

function getLocalMobileCatalog() {
  try {
    const saved = localStorage.getItem('davalsi_mobile_catalog_v2');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  localStorage.setItem('davalsi_mobile_catalog_v2', JSON.stringify(EMBEDDED_DEFAULT_PRODUCTS));
  return JSON.parse(JSON.stringify(EMBEDDED_DEFAULT_PRODUCTS));
}

function saveLocalMobileCatalog(prods) {
  try {
    localStorage.setItem('davalsi_mobile_catalog_v2', JSON.stringify(prods));
  } catch (e) {}
}

function recalculateProductStockBreakdown(p) {
  const uBlist = Math.max(1, Number(p.unidades_por_blister || 1));
  const bCaja = Math.max(1, Number(p.blisters_por_caja || 1));
  const uCaja = uBlist * bCaja;
  const totalU = Math.max(0, Number(p.stock_total_unidades || (p.inventario && p.inventario.stock_total_unidades) || 0));
  const minAlert = Number(p.stock_minimo_alerta || 10);

  const cajasDisp = uCaja > 1 ? Math.floor(totalU / uCaja) : totalU;
  const blistersDisp = uBlist > 1 ? Math.floor(totalU / uBlist) : totalU;
  const cajasFis = uCaja > 1 ? Math.floor(totalU / uCaja) : 0;
  const remAfterCajas = uCaja > 1 ? (totalU % uCaja) : totalU;
  const blistFis = uBlist > 1 ? Math.floor(remAfterCajas / uBlist) : 0;
  const unidSueltas = uBlist > 1 ? (remAfterCajas % uBlist) : remAfterCajas;

  p.stock_total_unidades = totalU;
  p.inventario = {
    stock_total_unidades: totalU,
    unidades_por_blister: uBlist,
    blisters_por_caja: bCaja,
    unidades_por_caja: uCaja,
    cajas_disponibles: cajasDisp,
    blisters_disponibles: blistersDisp,
    unidades_disponibles: totalU,
    alerta_stock_bajo: totalU <= minAlert,
    stock_minimo_alerta: minAlert,
    desglose_fisico: {
      cajas_cerradas: cajasFis,
      blisters_sueltos: blistFis,
      unidades_sueltas: unidSueltas,
      texto: uBlist > 1
        ? `${cajasFis} Caja(s), ${blistFis} Blíster(es), ${unidSueltas} ${p.unidad_minima_nombre || 'Unidad'}(s)`
        : `${totalU} ${p.unidad_minima_nombre || 'Unidad'}(s)`,
    }
  };
  return p;
}

function handleAutonomousMobileApi(urlStr, init) {
  const u = new URL(urlStr, 'http://localhost:8080');
  const path = u.pathname;
  const params = u.searchParams;
  const method = (init && init.method) ? init.method.toUpperCase() : 'GET';
  let body = {};
  if (init && init.body) {
    try { body = JSON.parse(init.body); } catch (e) {}
  }

  const cfgSaved = localStorage.getItem('farmasys_live_service_sync');
  let activeCfg = Object.assign({}, EMBEDDED_DEFAULT_CONFIG);
  if (cfgSaved) {
    try { Object.assign(activeCfg, JSON.parse(cfgSaved)); } catch (e) {}
  }

  if (path === '/api/pharmacy/config') {
    return { ok: true, config: activeCfg };
  }

  if (path === '/api/products' && method === 'GET') {
    let list = getLocalMobileCatalog().map(recalculateProductStockBreakdown);
    const search = (params.get('search') || '').trim().toLowerCase();
    const symptom = (params.get('symptom') || '').trim().toLowerCase();

    if (search) {
      list = list.filter((p) =>
        (p.nombre_comercial || '').toLowerCase().includes(search) ||
        (p.principio_activo || '').toLowerCase().includes(search) ||
        (p.categoria || '').toLowerCase().includes(search) ||
        (p.sintomas_tags || '').toLowerCase().includes(search)
      );
    }
    if (symptom && symptom !== 'todos') {
      list = list.filter((p) =>
        (p.sintomas_tags || '').toLowerCase().includes(symptom) ||
        (p.categoria || '').toLowerCase().includes(symptom)
      );
    }
    return { ok: true, products: list, pharmacy_config: activeCfg };
  }

  if (path === '/api/patient/auth/login' && method === 'POST') {
    const idVal = String(body.identificador || '').trim();
    const passVal = String(body.clave_acceso || '').trim();
    const customPatients = JSON.parse(localStorage.getItem('davalsi_mobile_patients') || '[]');
    const found = customPatients.find((pt) => pt.telefono === idVal || pt.cedula === idVal);
    if (found && found.clave_acceso === passVal) {
      return { ok: true, patient: found };
    }
    if ((idVal === '8095558490' || idVal === '001-1122334-5') && passVal === 'paciente123') {
      return {
        ok: true,
        patient: {
          id: 1,
          nombre_completo: 'María Fernanda Almonte',
          telefono: '8095558490',
          cedula: '001-1122334-5',
          direccion_frecuente: 'Av. Winston Churchill #102, Piantini, Santo Domingo',
        }
      };
    }
    // Permitir acceso rápido con cualquier teléfono de al menos 7 dígitos y clave >= 4 caracteres en modo móvil
    if (idVal.length >= 6 && passVal.length >= 4) {
      return {
        ok: true,
        patient: {
          id: Date.now(),
          nombre_completo: 'Cliente Farmacia Davalsi',
          telefono: idVal,
          cedula: '',
          direccion_frecuente: 'Santo Domingo, R.D.',
        }
      };
    }
    return { ok: false, error: 'Credenciales incorrectas. Puedes usar la Cuenta Demo o Crear Cuenta Nueva.' };
  }

  if (path === '/api/patient/auth/register' && method === 'POST') {
    const newPt = {
      id: Date.now(),
      nombre_completo: String(body.nombre_completo || 'Paciente Davalsi').trim(),
      telefono: String(body.telefono || '8095550000').trim(),
      cedula: String(body.cedula || '').trim(),
      clave_acceso: String(body.clave_acceso || '1234').trim(),
      direccion_frecuente: String(body.direccion_frecuente || 'Santo Domingo').trim(),
    };
    const customPatients = JSON.parse(localStorage.getItem('davalsi_mobile_patients') || '[]');
    customPatients.push(newPt);
    localStorage.setItem('davalsi_mobile_patients', JSON.stringify(customPatients));
    return { ok: true, patient: newPt };
  }

  if (path === '/api/upload-prescription' && method === 'POST') {
    return {
      ok: true,
      receta_imagen_url: body.image_base64 || '/api/sample-prescription.svg',
    };
  }

  if (path === '/api/sales' && method === 'POST') {
    const catalog = getLocalMobileCatalog().map(recalculateProductStockBreakdown);
    const itemsReq = body.items || [];
    if (!itemsReq.length) {
      return { ok: false, error: 'El carrito está vacío.' };
    }

    const evaluatedItems = [];
    let totalOrden = 0;

    for (const item of itemsReq) {
      const p = catalog.find((x) => Number(x.id) === Number(item.producto_id));
      if (!p) {
        return { ok: false, error: 'Producto no encontrado en el catálogo.' };
      }
      const pres = String(item.presentacion || 'UNIDAD').toUpperCase();
      const qty = Math.max(1, parseInt(item.cantidad, 10) || 1);
      const minUnits = calcMinUnits(p, pres, qty);
      const stockAntes = Number(p.inventario.stock_total_unidades || 0);

      if (minUnits > stockAntes) {
        return {
          ok: false,
          error: `Stock insuficiente para ${p.nombre_comercial}. Solicitado: ${minUnits} unid., Disponible: ${stockAntes} unid.`
        };
      }

      const unitPrice = Number((p.precios_presentacion && p.precios_presentacion[pres]) || p.precio_base || 0);
      const sub = Math.round(unitPrice * qty * 100) / 100;
      const stockDespues = stockAntes - minUnits;

      p.stock_total_unidades = stockDespues;
      recalculateProductStockBreakdown(p);

      evaluatedItems.push({
        producto_id: p.id,
        nombre_comercial: p.nombre_comercial,
        presentacion: pres,
        cantidad_presentacion: qty,
        unidades_minimas_descontadas: minUnits,
        precio_unitario_presentacion: unitPrice,
        subtotal: sub,
        stock_antes_unidades: stockAntes,
        stock_despues_unidades: stockDespues,
      });
      totalOrden = Math.round((totalOrden + sub) * 100) / 100;
    }

    saveLocalMobileCatalog(catalog);

    const orderNum = 'DAV-' + Math.floor(10000 + Math.random() * 90000);
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const orderObj = {
      id: Date.now(),
      codigo_orden: orderNum,
      fecha_hora: nowStr,
      canal: 'APP_PACIENTE',
      modalidad_entrega: body.modalidad_entrega || 'DOMICILIO',
      cliente_nombre: body.cliente_nombre || 'Cliente App',
      cliente_telefono: body.cliente_telefono || '18095550000',
      cliente_direccion: body.cliente_direccion || 'Santo Domingo',
      metodo_pago: body.metodo_pago || 'EFECTIVO',
      seguro_ars: body.seguro_ars || 'Sin Seguro',
      referencia_pago: body.referencia_pago || '',
      total: totalOrden,
      items: evaluatedItems,
    };

    const itemsLines = evaluatedItems
      .map((i) => `• ${i.cantidad_presentacion}x ${i.presentacion} ${i.nombre_comercial} (RD$ ${i.subtotal.toFixed(2)})`)
      .join('\n');

    const waDispatches = [
      {
        recipient_role: 'PACIENTE_CLIENTE',
        to_phone: orderObj.cliente_telefono,
        provider: 'WHATSAPP_DIRECT_ENGINE',
        http_status: 200,
        message_text: `✅ *FARMACIA DAVALSI — ORDEN #${orderNum} CONFIRMADA*\nHola ${orderObj.cliente_nombre}, recibimos tu pedido:\n${itemsLines}\n\n💳 *Pago:* ${orderObj.metodo_pago} (${orderObj.referencia_pago})\n🛡️ *Seguro:* ${orderObj.seguro_ars}\n📍 *Entrega:* ${orderObj.cliente_direccion}\n💰 *TOTAL:* RD$ ${totalOrden.toFixed(2)}`,
      },
      {
        recipient_role: 'FARMACIA_DESPACHO',
        to_phone: activeCfg.telefono_whatsapp || '18095550199',
        provider: 'WHATSAPP_DIRECT_ENGINE',
        http_status: 200,
        message_text: `🚨 *NUEVO PEDIDO APP MÓVIL #${orderNum}*\n👤 Cliente: ${orderObj.cliente_nombre} (+${orderObj.cliente_telefono})\n📍 Dirección: ${orderObj.cliente_direccion}\n💳 Método Pago: ${orderObj.metodo_pago}\n🛡️ Seguro ARS: ${orderObj.seguro_ars}\n\n📦 *Artículos:*\n${itemsLines}\n\n💰 *Total a Cobrar:* RD$ ${totalOrden.toFixed(2)}`,
      }
    ];

    return {
      ok: true,
      order: orderObj,
      whatsapp_dispatches: waDispatches,
    };
  }

  if (path === '/api/dashboard') {
    return {
      ok: true,
      metrics: {
        pedidos_web_pendientes: 0,
        alertas_stock_bajo_count: 0,
        total_whatsapp_logs: 0,
        total_unidades_minimas_stock: 1500,
        ventas_totales_rd: 0,
        ventas_pos_rd: 0,
        ventas_app_rd: 0,
        alertas_stock_bajo_items: [],
      }
    };
  }

  return { ok: true, transactions: [], logs: [], config: activeCfg };
}

function openDirectOrderWhatsApp() {
  const order = state.lastConfirmedAppOrder;
  if (!order) return;
  const itemsText = (order.items || [])
    .map((i) => `• ${i.cantidad_presentacion}x ${i.presentacion} ${i.nombre_comercial} (${formatRD(i.subtotal)})`)
    .join('\n');
  const msg =
    `Hola *Farmacia Davalsi*, acabo de realizar el pedido *#${order.codigo_orden}* desde la App Móvil:\n\n` +
    `👤 *Cliente:* ${order.cliente_nombre}\n` +
    `📞 *Teléfono:* ${order.cliente_telefono}\n` +
    `📍 *Entrega:* ${order.cliente_direccion}\n` +
    `🛡️ *Seguro ARS:* ${order.seguro_ars || 'Sin Seguro'}\n` +
    `💳 *Método de Pago:* ${order.metodo_pago} (${order.referencia_pago || ''})\n\n` +
    `💊 *Detalle del Pedido:*\n${itemsText}\n\n` +
    `💰 *TOTAL:* ${formatRD(order.total)}`;
  const farmPhone = (EMBEDDED_DEFAULT_CONFIG.telefono_whatsapp || '18095550199').replace(/\D/g, '');
  const waUrl = `https://wa.me/${farmPhone}?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');
}

function configurePosServerIp() {
  const currentUrl = localStorage.getItem('davalsi_apk_server_url') || 'http://192.168.1.100:8080';
  const nextUrl = window.prompt(
    '🌐 Conexión opcional con Caja POS en Red Wi-Fi:\nIngresa la dirección IP del servidor POS (o deja vacío para usar Modo Autónomo en el celular):',
    currentUrl
  );
  if (nextUrl !== null) {
    const clean = nextUrl.trim();
    if (clean) {
      localStorage.setItem('davalsi_apk_server_url', clean);
      showToast(`Conectando con servidor POS: ${clean}`);
    } else {
      localStorage.removeItem('davalsi_apk_server_url');
      showToast('Modo Autónomo Móvil activado.');
    }
    refreshAllData();
  }
}

// Interceptor global de fetch: intenta primero el servidor POS (si está en red) y si no hay conexión
// o se ejecuta desde el APK instalado en cualquier celular, procesa la operación con el Motor Autónomo.
(function() {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    let urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const isApiCall = urlStr.startsWith('/api/') || urlStr.includes('/api/');

    if (!isApiCall) {
      return nativeFetch(input, init);
    }

    const isFileProtocol = (window.location.protocol === 'file:' || window.location.protocol === 'content:');
    let targetUrl = urlStr;
    if (isFileProtocol && urlStr.startsWith('/')) {
      const savedServer = localStorage.getItem('davalsi_apk_server_url');
      if (savedServer) {
        targetUrl = savedServer.replace(/\/$/, '') + urlStr;
      } else {
        // Responder instantáneamente con el Motor Autónomo del APK en el celular
        const mockData = handleAutonomousMobileApi(urlStr, init);
        return new Response(JSON.stringify(mockData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2800);
      const resp = await nativeFetch(targetUrl, Object.assign({}, init || {}, { signal: controller.signal }));
      clearTimeout(timer);
      if (resp && (resp.ok || resp.status === 400)) {
        return resp;
      }
    } catch (err) {
      // Fallback automático al Motor Autónomo si el celular no está en la red del servidor PC
    }

    const fallbackData = handleAutonomousMobileApi(urlStr, init);
    return new Response(JSON.stringify(fallbackData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
})();



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
      farmacia_id: 1,
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
    const res = await fetch(`/api/chronic-patients?farmacia_id=1&telefono=${encodeURIComponent(phone)}`);
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
        farmacia_id: 1,
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
    const res = await fetch('/api/promotional-kits?farmacia_id=1');
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
      const fid = state.activePharmacyId || 1;
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
    const fid = state.activePharmacyId || 1;
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
          <span class="text-[10px] font-black uppercase tracking-wider text-teal-400 block">Principio Activo Analizado por FarmaIA:</span>
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

  const fid = state.activePharmacyId || 1;
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
        farmacia_id: state.activePharmacyId || 1,
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
        atendido_por: 'App Paciente / FarmaIA Davalsi',
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
        farmacia_id: state.activePharmacyId || 1,
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
  const farmaciaPhone = (state.pharmacyConfig && state.pharmacyConfig.whatsapp_notificaciones)
    ? String(state.pharmacyConfig.whatsapp_notificaciones).replace(/\D/g, '')
    : '18492831899';
  const msg = 'Hola Farmacia Davalsi, estoy usando la App y deseo asistencia para realizar mi pedido de medicamentos.';
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
    btn.innerHTML = '<span>🤖 FarmaIA procesando...</span>';
  }

  try {
    const res = await fetch('/api/app/quejas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: 1,
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
              <span class="text-slate-400">Verificado por FarmaIA</span>
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
        farmacia_id: 1,
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
    
    const res = await fetch(`/api/adherencia/renovaciones?farmacia_id=1&dias=5`);
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
      ? `/api/delivery/tracking?farmacia_id=1&codigo_orden=${encodeURIComponent(currentTrackingOrderCode)}`
      : `/api/delivery/tracking?farmacia_id=1`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.ok) return;

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
    if (etaPill) etaPill.textContent = `⏱️ ETA: ~${data.eta_minutos || 8} minutos`;
    if (courierName && data.repartidor) courierName.textContent = data.repartidor.nombre || 'Pedro Ramírez';
    if (courierPhone && data.repartidor) {
      courierPhone.textContent = `Tel: ${data.repartidor.telefono || '809-555-8899'}`;
      courierPhone.href = `tel:${(data.repartidor.telefono || '').replace(/\D/g, '')}`;
    }
    if (courierVeh && data.repartidor) courierVeh.textContent = data.repartidor.vehiculo || 'Motocicleta Honda C-90';
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
