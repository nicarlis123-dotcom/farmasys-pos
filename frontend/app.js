/**
 * Lógica Frontend Reactiva Omnicanal — Farmacia Davalsi (República Dominicana RD$)
 * Conecta App Móvil Paciente, POS de Mostrador, Backoffice e Integración WhatsApp Business API.
 */

const state = {
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
}

function clearAppSearch() {
  document.getElementById('app-search-input').value = '';
  state.searchQuery = '';
  document.getElementById('btn-clear-search').classList.add('hidden');
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
    grid.innerHTML = `
      <div class="col-span-full bg-white rounded-2xl p-8 text-center border border-slate-200">
        <p class="text-base font-bold text-slate-700">No encontramos medicamentos para esa búsqueda o síntoma.</p>
        <button onclick="selectSymptom('todos'); clearAppSearch();" class="mt-3 px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold">
          Mostrar todo el catálogo
        </button>
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
    (acc, i) => acc + calcMinUnits(i.product, i.presentacion, i.cantidad),
    0
  );
  const totalRD = state.appCart.reduce(
    (acc, i) => acc + i.product.precios_presentacion[i.presentacion] * i.cantidad,
    0
  );

  document.getElementById('floating-cart-count').textContent = totalItems;
  document.getElementById('floating-cart-total').textContent = formatRD(totalRD);
  document.getElementById('floating-cart-subtitle').textContent =
    totalItems > 0
      ? `${totalItems} presentación(es) • Equivalente a ${totalUnits} unidades mínimas`
      : 'Agrega medicamentos por Caja, Blíster o Unidad';
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
    const unitPrice = item.product.precios_presentacion[item.presentacion] || item.product.precio_base;
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

  const payload = {
    canal: 'APP_PACIENTE',
    modalidad_entrega: effectiveDeliveryMode,
    cliente_nombre: clienteNombre,
    cliente_telefono: clienteTelefono,
    cliente_direccion: finalAddress,
    metodo_pago: state.appPaymentMethod,
    seguro_ars: seguroArs,
    referencia_pago: referenciaPago,
    receta_imagen_url: state.uploadedPrescriptionUrl,
    items: state.appCart.map((i) => ({
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

function checkPatientAuthOnLoad() {
  const sessionStr = localStorage.getItem('davalsi_patient_session');
  const gateEl = document.getElementById('patient-auth-gate-screen');
  const badgeEl = document.getElementById('patient-auth-badge');
  const nameEl = document.getElementById('header-patient-name');

  if (sessionStr) {
    try {
      currentPatient = JSON.parse(sessionStr);
      if (gateEl) gateEl.classList.add('hidden');
      if (badgeEl) badgeEl.classList.remove('hidden');
      if (nameEl) nameEl.textContent = currentPatient.nombre_completo || 'Paciente';
      prefillPatientData();
      return;
    } catch (e) {
      localStorage.removeItem('davalsi_patient_session');
    }
  }

  if (state.activeModule === 'app' && gateEl) {
    gateEl.classList.remove('hidden');
    if (badgeEl) badgeEl.classList.add('hidden');
  }
}

function prefillPatientData() {
  if (!currentPatient) return;
  const nameInput = document.getElementById('app-client-name');
  const phoneInput = document.getElementById('app-client-phone');
  const addressInput = document.getElementById('app-client-address');

  if (nameInput && currentPatient.nombre_completo) nameInput.value = currentPatient.nombre_completo;
  if (phoneInput && currentPatient.telefono) phoneInput.value = currentPatient.telefono;
  if (addressInput && currentPatient.direccion_frecuente) addressInput.value = currentPatient.direccion_frecuente;
}

function switchPatientAuthMode(mode) {
  const loginTab = document.getElementById('tab-patient-login');
  const regTab = document.getElementById('tab-patient-register');
  const loginForm = document.getElementById('form-patient-login');
  const regForm = document.getElementById('form-patient-register');

  if (mode === 'login') {
    loginTab.className = 'flex-1 py-2 rounded-lg bg-white text-teal-800 shadow transition font-bold';
    regTab.className = 'flex-1 py-2 rounded-lg text-slate-600 hover:text-slate-900 transition font-bold';
    loginForm.classList.remove('hidden');
    regForm.classList.add('hidden');
  } else {
    regTab.className = 'flex-1 py-2 rounded-lg bg-white text-teal-800 shadow transition font-bold';
    loginTab.className = 'flex-1 py-2 rounded-lg text-slate-600 hover:text-slate-900 transition font-bold';
    regForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  }
}

async function handlePatientLogin(event) {
  if (event && event.preventDefault) event.preventDefault();
  const idVal = document.getElementById('pac-login-id').value.trim();
  const passVal = document.getElementById('pac-login-password').value.trim();
  const errEl = document.getElementById('pac-login-error');
  errEl.classList.add('hidden');

  try {
    const res = await fetch('/api/patient/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identificador: idVal, clave_acceso: passVal })
    });
    const data = await res.json();
    if (!data.ok) {
      errEl.textContent = data.error || 'Credenciales de paciente incorrectas.';
      errEl.classList.remove('hidden');
      return;
    }

    currentPatient = data.patient;
    localStorage.setItem('davalsi_patient_session', JSON.stringify(data.patient));
    document.getElementById('patient-auth-gate-screen').classList.add('hidden');
    document.getElementById('patient-auth-badge').classList.remove('hidden');
    document.getElementById('header-patient-name').textContent = currentPatient.nombre_completo;
    prefillPatientData();
    showToast(`¡Bienvenido(a), ${currentPatient.nombre_completo}!`);
  } catch (err) {
    errEl.textContent = 'Error al conectar con el servidor.';
    errEl.classList.remove('hidden');
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
  errEl.classList.add('hidden');

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
      errEl.textContent = data.error || 'Error en el registro del paciente.';
      errEl.classList.remove('hidden');
      return;
    }

    currentPatient = data.patient;
    localStorage.setItem('davalsi_patient_session', JSON.stringify(data.patient));
    document.getElementById('patient-auth-gate-screen').classList.add('hidden');
    document.getElementById('patient-auth-badge').classList.remove('hidden');
    document.getElementById('header-patient-name').textContent = currentPatient.nombre_completo;
    prefillPatientData();
    showToast(`¡Cuenta creada con éxito! Bienvenido(a), ${currentPatient.nombre_completo}.`);
  } catch (err) {
    errEl.textContent = 'Error al registrar la cuenta.';
    errEl.classList.remove('hidden');
  }
}

function autoLoginDemoPatient(tel, pass) {
  document.getElementById('pac-login-id').value = tel;
  document.getElementById('pac-login-password').value = pass;
  handlePatientLogin({ preventDefault: () => {} });
}

function handlePatientLogout() {
  localStorage.removeItem('davalsi_patient_session');
  currentPatient = null;
  document.getElementById('patient-auth-badge').classList.add('hidden');
  document.getElementById('patient-auth-gate-screen').classList.remove('hidden');
  showToast('Has cerrado sesión en la App de Pacientes.');
}


// ============================================================================
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
