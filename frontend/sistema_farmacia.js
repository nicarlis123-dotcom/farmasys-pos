/**
 * Sistema Privado de Venta y Gestión Multi-Farmacia — Farmacia Davalsi / FarmaSys (RD$)
 * Incluye todas las funciones solicitadas y las mostradas en las capturas:
 *  - Autenticación por Clave (Administrador o Vendedores registrados)
 *  - Creación y Eliminación permanente de farmacias (con UUID único)
 *  - Personal del sistema (Administrador + Registro de Vendedores con rol fijo Vendedor)
 *  - Identidad del negocio, Contacto, Switch de WhatsApp y Vista Previa en vivo de Factura
 *  - Control de Deudores (Cuentas por cobrar y abonos) y Seguro Médico (ARS)
 *  - Reportes de Ventas (Venta de Hoy, Venta del Mes, Total del Periodo, Ticket Promedio, Filtros Hoy/Este mes/Todo y Gráficos)
 */

const sysState = {
  pharmacies: [],
  authenticatedPharmacy: null,
  sessionToken: null,
  activeTab: 'pos',
  products: [],
  posCart: [],
  transactions: [],
  prescriptions: [],
  staff: [],
  debtors: [],
  metrics: null,
  expiryFilter: 'TODOS',
  salesHistoryPeriod: 'HOY',
  appRequestsFilter: 'TODAS',
  prescriptionsFilter: 'TODAS',
  inventoryFilterPill: 'TODOS',
  inventorySearchQuery: '',
  debtorsFilter: 'TODOS',
  debtorsSearchQuery: '',
  selectedDebtorForPay: null,
  whatsappLogs: [],
  activeReviewOrderId: null,
  charts: {
    daily: null,
    monthly: null,
  },
};

/* =========================================================================
   ESTADO MULTI-VENTANA Y NAVEGACIÓN HISTORIAL DEL SISTEMA POS
   ========================================================================= */
let sysNavHistory = ['pos'];
let sysNavSuppressPush = false;

const SYS_TAB_LABELS = {
  'pos': 'Mostrador de Ventas (POS)',
  'inventario': 'Inventario & Corrección de Errores',
  'vencimientos': 'Alertas de Vencimiento (≤ 7 Meses)',
  'deudores': 'Deudores & Recordatorios WhatsApp',
  'reportes': 'Reportes de Ventas (Diario y Mensual)',
  'whatsapp': 'Medicamentos WhatsApp & Notificaciones',
  'solicitudes': 'Pedidos Online (App Móvil)',
  'recetas': 'Recetas Médicas con IA',
  'config': 'Configuración de la Farmacia'
};

const sysReportState = {
  activeSubTab: 'diario', // 'diario', 'mensual', 'graficos', 'comparativa'
  dailyDate: new Date().toISOString().slice(0, 10),
  monthlyMonth: new Date().toISOString().slice(0, 7),
  dailyMethodFilter: 'TODOS',
  dailyChannelFilter: 'TODOS',
  dailySearchQuery: '',
  monthlyViewMode: 'days', // 'days' o 'all'
  monthlySearchQuery: '',
  dailyTransactions: [],
  monthlyTransactions: [],
  comparativeStats: null,
  comparativeWeeklyChart: null,
};

function updatePosActiveCartPills() {
  const badge = document.getElementById('sys-active-cart-badge-text');
  const pillContainer = document.getElementById('sys-pos-cart-status-pill');
  if (!badge) return;
  const count = sysState.posCart ? sysState.posCart.length : 0;
  if (count === 0) {
    badge.textContent = 'Carrito POS: Vacío';
    if (pillContainer) {
      pillContainer.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 text-xs font-semibold cursor-pointer transition shadow-2xs';
    }
  } else {
    let totalRD = 0;
    sysState.posCart.forEach((item) => {
      const p = sysState.products.find((pr) => pr.id === item.product.id) || item.product;
      const price = (p.precios_presentacion && p.precios_presentacion[item.presentacion]) || p.precio_base || 0;
      totalRD += price * item.cantidad;
    });
    badge.textContent = `🛒 Carrito en curso: ${count} ítem${count > 1 ? 's' : ''} (${formatRD(totalRD)})`;
    if (pillContainer) {
      pillContainer.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer transition shadow-xs animate-pulse-subtle';
    }
  }
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
      : 'bg-slate-900 text-white border border-teal-500/40';
  el.className = `pointer-events-auto px-4 py-3 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 transition ${bg}`;
  el.innerHTML = `<span>${type === 'error' ? '⚠️' : '✅'}</span><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function calcMinUnits(product, presentacion, cantidad) {
  const qty = Math.max(1, parseInt(cantidad, 10) || 1);
  if (presentacion === 'CAJA') return qty * product.inventario.unidades_por_caja;
  if (presentacion === 'BLISTER') return qty * product.unidades_por_blister;
  return qty;
}

function showModal(id) {
  const el = typeof id === 'string' ? document.getElementById(id) : id;
  if (!el) return;
  el.classList.remove('hidden');
  el.classList.add('flex');
  el.style.display = 'flex';
}

function hideModal(id) {
  const el = typeof id === 'string' ? document.getElementById(id) : id;
  if (!el) return;
  el.classList.add('hidden');
  el.classList.remove('flex');
  el.style.display = 'none';
}

/* =========================================================================
   AUTENTICACIÓN POR CLAVE Y GESTIÓN DE FARMACIAS
   ========================================================================= */

function handleHashNavigation() {
  const hash = (window.location.hash || '').replace('#', '').trim().toLowerCase();
  const validTabs = ['pos', 'solicitudes', 'recetas', 'inventario', 'vencimientos', 'deudores', 'reportes', 'config', 'whatsapp'];
  if (validTabs.includes(hash)) {
    switchSysTab(hash);
  }
}

async function initSistemaFarmacia() {
  await loadPharmaciesForLogin();

  const savedAuth = sessionStorage.getItem('davalsi_sys_auth');
  if (savedAuth) {
    try {
      const parsed = JSON.parse(savedAuth);
      if (parsed && parsed.pharmacy && parsed.token) {
        enterAuthenticatedWorkspace(parsed.pharmacy, parsed.token);
        handleHashNavigation();
        return;
      }
    } catch (e) {
      sessionStorage.removeItem('davalsi_sys_auth');
    }
  }

  // Mantener la pantalla de acceso por clave FarmaSys visible si no hay sesión activa
  const gate = document.getElementById('auth-gate-screen');
  if (gate) {
    gate.classList.remove('hidden');
    gate.style.display = 'flex';
  }
  if (sysState.pharmacies && sysState.pharmacies.length > 0) {
    const firstPharm = sysState.pharmacies[0];
    fillDemoLogin(firstPharm.id, firstPharm.usuario_admin, firstPharm.pista_clave_demo || 'davalsi123');
  }
}

async function loadPharmaciesForLogin() {
  const res = await fetch('/api/pharmacies');
  const data = await res.json();
  if (!data.ok) return;
  sysState.pharmacies = data.pharmacies || [];

  const sel = document.getElementById('login-pharmacy-select');
  const demoList = document.getElementById('demo-credentials-list');

  if (sysState.pharmacies.length === 0) {
    if (sel) {
      sel.innerHTML = '<option value="">(Sin farmacias registradas - Registra la tuya)</option>';
    }
    if (demoList) {
      demoList.innerHTML = `
        <div class="p-4 rounded-2xl bg-teal-950/70 border border-teal-500/40 text-center space-y-2">
          <p class="font-extrabold text-teal-300 text-xs">✨ Sistema Totalmente Limpio</p>
          <p class="text-[11px] text-slate-300 leading-tight">No hay farmacias de prueba ni medicamentos registrados.</p>
          <button type="button" onclick="openCreatePharmacyModal()" class="w-full py-2.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-black text-xs shadow-md transition cursor-pointer">
            ➕ Registrar Mi Farmacia
          </button>
        </div>
      `;
    }
    const formEl = document.querySelector('#auth-gate-screen form');
    if (formEl && !document.getElementById('empty-sys-prompt')) {
      const banner = document.createElement('div');
      banner.id = 'empty-sys-prompt';
      banner.className = 'p-4 rounded-2xl bg-teal-50 border-2 border-teal-500/50 text-center space-y-2 mb-3';
      banner.innerHTML = `
        <div class="text-2xl">🏥</div>
        <p class="text-sm font-black text-teal-950">¡Bienvenido a FarmaSys!</p>
        <p class="text-xs text-slate-600">El sistema está limpio y listo para ti. Registra tu farmacia oficial con su nombre comercial, dirección exacta y contraseña de acceso.</p>
        <button type="button" onclick="openCreatePharmacyModal()" class="w-full py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs shadow-lg transition cursor-pointer">
          ➕ Registrar Mi Farmacia Ahora
        </button>
      `;
      formEl.parentNode.insertBefore(banner, formEl);
    }
    setTimeout(() => { openCreatePharmacyModal(); }, 350);
    return;
  }

  // Remove empty prompt if present
  const existingPrompt = document.getElementById('empty-sys-prompt');
  if (existingPrompt) existingPrompt.remove();

  if (sel) {
    sel.innerHTML = data.pharmacies
      .map(
        (f) => `<option value="${f.id}">${f.nombre} • ${f.ciudad_sector}</option>`
      )
      .join('');
  }

  if (demoList) {
    demoList.innerHTML = data.pharmacies
      .map(
        (f) => `
        <div class="w-full p-2.5 rounded-xl bg-slate-800/90 border border-slate-700 hover:border-teal-500/50 transition flex items-center justify-between gap-2">
          <div class="cursor-pointer flex-1" onclick="fillDemoLogin(${f.id}, '${f.usuario_admin}', '${f.pista_clave_demo || 'davalsi123'}')">
            <p class="font-bold text-white text-xs">${f.nombre}</p>
            <p class="text-[10px] text-slate-400">Admin: <span class="text-teal-300 font-bold">${f.usuario_admin}</span> • Clave: <span class="font-mono text-teal-300 font-bold">${f.pista_clave_demo || '••••••'}</span></p>
          </div>
          <button
            type="button"
            onclick="quickDirectLogin(${f.id}, '${f.usuario_admin}', '${f.pista_clave_demo || 'davalsi123'}')"
            class="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-extrabold text-[11px] shadow transition shrink-0"
          >
            Entrar ➔
          </button>
        </div>
      `
      )
      .join('');
  }
}

async function quickDirectLogin(farmaciaId, username, clave) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmacia_id: farmaciaId, username, clave_acceso: clave }),
    });
    const data = await res.json();
    if (data.ok) {
      enterAuthenticatedWorkspace(data.pharmacy, data.token);
      showToast(`Sesión iniciada en ${data.pharmacy.nombre}`);
    } else {
      showToast(data.error || 'Error al entrar.', 'error');
    }
  } catch (err) {
    showToast('Error de conexión con el servidor.', 'error');
  }
}

function fillDemoLogin(farmaciaId, username, clave) {
  document.getElementById('login-pharmacy-select').value = String(farmaciaId);
  document.getElementById('login-username-input').value = username || '';
  document.getElementById('login-password-input').value = clave;
  document.getElementById('login-error-msg').classList.add('hidden');
}

async function handlePharmacyLogin(event) {
  event.preventDefault();
  const farmaciaId = parseInt(document.getElementById('login-pharmacy-select').value, 10);
  const username = document.getElementById('login-username-input').value.trim();
  const clave = document.getElementById('login-password-input').value;
  const errEl = document.getElementById('login-error-msg');
  errEl.classList.add('hidden');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmacia_id: farmaciaId, username, clave_acceso: clave }),
    });
    const data = await res.json();
    if (!data.ok) {
      errEl.textContent = data.error || 'Clave incorrecta.';
      errEl.classList.remove('hidden');
      return;
    }

    enterAuthenticatedWorkspace(data.pharmacy, data.token);
    showToast(`Sesión iniciada en ${data.pharmacy.nombre}`);
  } catch (err) {
    errEl.textContent = 'Error de conexión con el servidor.';
    errEl.classList.remove('hidden');
  }
}

function enterAuthenticatedWorkspace(pharmacy, token) {
  sysState.authenticatedPharmacy = pharmacy;
  sysState.sessionToken = token;
  sysState.posCart = [];
  sessionStorage.setItem('davalsi_sys_auth', JSON.stringify({ pharmacy, token }));

  const gate = document.getElementById('auth-gate-screen');
  if (gate) {
    gate.classList.add('hidden');
    gate.classList.remove('flex');
    gate.style.display = 'none';
  }

  document.getElementById('sys-header-pharmacy-name').textContent = pharmacy.nombre;
  const roleIcon = pharmacy.rol_actual === 'VENDEDOR' ? '👤' : '🛡️';
  document.getElementById('sys-header-user-badge').textContent = `${roleIcon} ${pharmacy.usuario_actual || pharmacy.usuario_admin} (${pharmacy.rol_actual || 'ADMINISTRADOR'})`;
  document.getElementById('sys-header-pharmacy-sub').textContent = `📍 ${pharmacy.direccion} • Tel: ${pharmacy.telefono || pharmacy.telefono_whatsapp}`;

  applyRolePermissions(pharmacy.rol_actual || 'ADMINISTRADOR');
  applyOperationalServiceFlags(pharmacy);
  if (pharmacy.rol_actual === 'VENDEDOR') {
    switchSysTab('pos');
  } else {
    refreshPharmacyWorkspace();
  }
}

function applyRolePermissions(role) {
  // Acceso unificado para todos los usuarios a Ventas, Inventario, Vencimientos, Deudores y WhatsApp
  const allTabs = ['pos', 'solicitudes', 'recetas', 'inventario', 'vencimientos', 'deudores', 'reportes', 'whatsapp', 'config'];
  allTabs.forEach((t) => {
    const btn = document.getElementById(`sys-tab-${t}`);
    if (btn) btn.style.display = '';
    const mobBtn = document.getElementById(`mob-tab-${t}`);
    if (mobBtn) mobBtn.style.display = '';
  });

  const isSeller = role === 'VENDEDOR';
  const newPhBtn = document.getElementById('sys-header-btn-new-pharmacy');
  if (newPhBtn) newPhBtn.style.display = isSeller ? 'none' : '';
}

function logoutPharmacy() {
  sysState.authenticatedPharmacy = null;
  sysState.sessionToken = null;
  sysState.posCart = [];
  sessionStorage.removeItem('davalsi_sys_auth');
  document.getElementById('login-password-input').value = '';

  const gate = document.getElementById('auth-gate-screen');
  if (gate) {
    gate.classList.remove('hidden');
    gate.classList.add('flex');
    gate.style.display = 'flex';
  }

  loadPharmaciesForLogin();
}

function openCreatePharmacyModal() {
  showModal('create-pharmacy-modal');
}

function closeCreatePharmacyModal() {
  hideModal('create-pharmacy-modal');
}

async function submitCreatePharmacy(event) {
  event.preventDefault();
  const payload = {
    nombre: document.getElementById('nf-nombre').value.trim(),
    codigo: document.getElementById('nf-codigo').value.trim().toUpperCase(),
    eslogan: document.getElementById('nf-eslogan').value.trim(),
    rnc: document.getElementById('nf-rnc').value.trim(),
    ciudad_sector: document.getElementById('nf-sector').value.trim(),
    telefono_whatsapp: document.getElementById('nf-whatsapp').value.trim(),
    telefono: document.getElementById('nf-whatsapp').value.trim(),
    direccion: document.getElementById('nf-direccion').value.trim(),
    banco_cuenta: document.getElementById('nf-cuenta').value.trim(),
    usuario_admin: document.getElementById('nf-admin-user').value.trim(),
    clave_acceso: document.getElementById('nf-clave').value.trim(),
    clonar_catalogo_base: document.getElementById('nf-clonar').checked,
  };

  try {
    const res = await fetch('/api/pharmacies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) {
      showToast(data.error || 'Error al registrar farmacia.', 'error');
      return;
    }

    hideModal('create-pharmacy-modal');
    await loadPharmaciesForLogin();
    enterAuthenticatedWorkspace(data.pharmacy, `DAV-NEW-${data.pharmacy.id}`);
    showToast(`Farmacia '${data.pharmacy.nombre}' creada con éxito.`);
  } catch (err) {
    showToast('Error de conexión al crear farmacia.', 'error');
  }
}

async function confirmDeleteCurrentPharmacy() {
  const f = sysState.authenticatedPharmacy;
  if (!f) return;
  if (f.rol_actual === 'VENDEDOR') {
    showToast('Solo el Administrador puede eliminar la farmacia.', 'error');
    return;
  }

  const confirmed = window.confirm(
    `⚠️ ¿Estás seguro de ELIMINAR PERMANENTEMENTE "${f.nombre}"?\n\nEsto borrará todos sus medicamentos, ventas, deudores, recetas, personal y configuración.`
  );
  if (!confirmed) return;

  const res = await fetch('/api/pharmacy/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ farmacia_id: f.id }),
  });
  const data = await res.json();
  if (!data.ok) {
    showToast(data.error || 'No se pudo eliminar la farmacia.', 'error');
    return;
  }

  showToast(`Farmacia '${data.deleted.nombre}' eliminada permanentemente.`);
  logoutPharmacy();
}

/* =========================================================================
   NAVEGACIÓN DE MÓDULOS Y CARGA DE DATOS DE LA FARMACIA AUTENTICADA
   ========================================================================= */

function updateSysWindowHeaders(tab) {
  const labelEl = document.getElementById('sys-window-current-label');
  if (labelEl) {
    labelEl.textContent = SYS_TAB_LABELS[tab] || tab.toUpperCase();
  }

  // Actualizar botón de Atrás
  const backBtn = document.getElementById('sys-nav-btn-back');
  if (backBtn) {
    if (sysNavHistory.length > 1) {
      const prevTab = sysNavHistory[sysNavHistory.length - 2];
      backBtn.title = `Regresar a ${SYS_TAB_LABELS[prevTab] || prevTab} (Alt + ←)`;
      backBtn.classList.remove('opacity-50');
    } else {
      backBtn.title = 'Regresar al Mostrador (POS)';
    }
  }

  // Ocultar botón 'Volver al Mostrador' si ya estamos en POS
  const toPosBtn = document.getElementById('sys-nav-btn-to-pos');
  if (toPosBtn) {
    if (tab === 'pos') {
      toPosBtn.classList.add('hidden');
    } else {
      toPosBtn.classList.remove('hidden');
    }
  }

  // Actualizar píldoras rápidas del toolbar
  const pills = ['pos', 'inventario', 'vencimientos', 'deudores', 'reportes', 'whatsapp'];
  pills.forEach((p) => {
    const pillBtn = document.getElementById(`sys-winpill-${p}`);
    if (pillBtn) {
      if (p === tab) {
        pillBtn.className = 'px-2.5 py-1 rounded-lg text-[11px] font-extrabold text-teal-950 bg-teal-100 shadow-2xs transition';
      } else {
        pillBtn.className = 'px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-600 hover:text-slate-900 transition';
      }
    }
  });

  updatePosActiveCartPills();
}

function switchSysTab(tab, pushToHistory = true) {
  const role = sysState.authenticatedPharmacy ? sysState.authenticatedPharmacy.rol_actual : null;
  if (role === 'VENDEDOR' && tab === 'config') {
    showToast('Acceso restringido: Configuración avanzada es exclusiva de Administrador.', 'error');
    tab = 'pos';
  }

  sysState.activeTab = tab;

  if (pushToHistory && !sysNavSuppressPush) {
    if (sysNavHistory[sysNavHistory.length - 1] !== tab) {
      sysNavHistory.push(tab);
      try {
        window.history.pushState({ tab: tab }, '', '#' + tab);
      } catch (e) {}
    }
  }

  updateSysWindowHeaders(tab);

  const allTabs = ['pos', 'solicitudes', 'recetas', 'inventario', 'vencimientos', 'deudores', 'reportes', 'config', 'whatsapp'];
  allTabs.forEach((t) => {
    const view = document.getElementById(`view-${t}`);
    const btn = document.getElementById(`sys-tab-${t}`);
    if (view) {
      if (t === tab) {
        view.classList.remove('hidden');
        view.style.display = 'block';
      } else {
        view.classList.add('hidden');
        view.style.display = 'none';
      }
    }
    if (btn) {
      if (t === tab) {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 bg-teal-600 text-white shadow-xs';
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 text-slate-300 hover:text-white';
      }
    }
  });

  if (tab === 'reportes') {
    initSalesReportsView();
  } else if (tab === 'pos') {
    setTimeout(() => {
      const barcodeInp = document.getElementById('pos-barcode-input');
      if (barcodeInp) barcodeInp.focus();
    }, 100);
  }

  refreshPharmacyWorkspace();
}

function goSysBack() {
  if (sysNavHistory.length > 1) {
    sysNavHistory.pop(); // Remove current
    const prevTab = sysNavHistory.pop(); // Get previous
    switchSysTab(prevTab, true);
  } else {
    switchSysTab('pos', true);
  }
}

// Navegación por historial del navegador (Atrás / Adelante) y gestos móviles
window.addEventListener('popstate', (e) => {
  if (e.state && e.state.tab) {
    sysNavSuppressPush = true;
    switchSysTab(e.state.tab, false);
    sysNavSuppressPush = false;
  } else if (window.location.hash) {
    const hashTab = window.location.hash.replace('#', '');
    if (hashTab && SYS_TAB_LABELS[hashTab]) {
      sysNavSuppressPush = true;
      switchSysTab(hashTab, false);
      sysNavSuppressPush = false;
    }
  }
});

// Atajo global: Alt + Flecha Izquierda para volver atrás
window.addEventListener('keydown', (e) => {
  if (e.altKey && e.key === 'ArrowLeft') {
    e.preventDefault();
    goSysBack();
  }
});


function toggleMobileNavDrawer() {
  const drawer = document.getElementById('mobile-nav-drawer');
  if (!drawer) return;
  if (drawer.classList.contains('hidden') || drawer.style.display === 'none') {
    drawer.classList.remove('hidden');
    drawer.classList.add('flex');
    drawer.style.display = 'flex';
  } else {
    drawer.classList.add('hidden');
    drawer.classList.remove('flex');
    drawer.style.display = 'none';
  }
}

async function refreshPharmacyWorkspace() {
  if (!sysState.authenticatedPharmacy) return;
  const fid = sysState.authenticatedPharmacy.id;
  await Promise.all([
    loadSysProducts(fid),
    loadSysDashboardAndReports(fid),
    loadSysTransactions(fid),
    loadSysPrescriptions(fid),
    loadSysStaff(fid),
    loadSysDebtors(fid),
    loadSysWhatsAppLogs(fid),
    loadAndRenderComparativeStats(fid),
  ]);
}

async function loadSysProducts(fid) {
  const id = fid || sysState.authenticatedPharmacy.id;
  const res = await fetch(`/api/products?farmacia_id=${id}`);
  const data = await res.json();
  if (data.ok) {
    sysState.products = data.products;
    if (data.pharmacy_config) {
      applyOperationalServiceFlags(data.pharmacy_config);
    }
    renderPosQuickBarcodes();
    renderPosCart();
    renderInventoryTable();
    renderExpiryTable();
  }
}

async function loadSysDashboardAndReports(fid) {
  const id = fid || sysState.authenticatedPharmacy.id;
  const res = await fetch(`/api/dashboard?farmacia_id=${id}`);
  const data = await res.json();
  if (!data.ok) return;
  const m = data.metrics;
  sysState.metrics = m;

  // Badges de alerta
  const bRx = document.getElementById('badge-sys-pending-rx');
  if (m.pedidos_web_pendientes > 0) {
    bRx.textContent = m.pedidos_web_pendientes;
    bRx.classList.remove('hidden');
  } else bRx.classList.add('hidden');

  const bLow = document.getElementById('badge-sys-low-stock');
  if (m.alertas_stock_bajo_count > 0) {
    bLow.textContent = m.alertas_stock_bajo_count;
    bLow.classList.remove('hidden');
  } else bLow.classList.add('hidden');

  const bExp = document.getElementById('badge-sys-expiry');
  if (m.vencimientos.total_alertas_vencimiento > 0) {
    bExp.textContent = m.vencimientos.total_alertas_vencimiento;
    bExp.classList.remove('hidden');
  } else bExp.classList.add('hidden');

  const bDeb = document.getElementById('badge-sys-debtors');
  if (m.deudores_pendientes_count > 0) {
    bDeb.textContent = m.deudores_pendientes_count;
    bDeb.classList.remove('hidden');
  } else bDeb.classList.add('hidden');

  // KPIs de Vencimiento
  document.getElementById('exp-kpi-vencidos').textContent = `${m.vencimientos.vencidos_count} lote(s)`;
  document.getElementById('exp-kpi-criticos').textContent = `${m.vencimientos.criticos_30d_count} lote(s)`;
  document.getElementById('exp-kpi-preventivos').textContent = `${m.vencimientos.preventivos_90d_count} lote(s)`;
  document.getElementById('exp-kpi-total').textContent = `${m.total_productos_catalogo} total`;

  // 4 Tarjetas KPI de Reportes de Ventas (Exactas a Captura 1)
  document.getElementById('rep-kpi-today').textContent = formatRD(m.ventas_hoy_rd);
  document.getElementById('rep-kpi-today-cnt').textContent = `${m.ventas_hoy_count} transacciones`;

  document.getElementById('rep-kpi-month').textContent = formatRD(m.ventas_mes_actual_rd);
  document.getElementById('rep-kpi-month-cnt').textContent = `${m.ventas_mes_actual_count} transacciones`;

  renderSalesReportsAndCharts(m);
}

/* =========================================================================
   1. POS DE MOSTRADOR, SEGURO MÉDICO (ARS) Y RECIBO IMPRIMIBLE
   ========================================================================= */

sysState.posActiveCategory = 'TODOS';

function filterPosQuickCategory(cat) {
  sysState.posActiveCategory = cat || 'TODOS';
  const cats = ['TODOS', 'CUIDADO', 'LIMAS', 'MEDICAMENTOS', 'HIGIENE'];
  cats.forEach((c) => {
    const btn = document.getElementById(`pos-cat-${c}`);
    if (btn) {
      if (c === sysState.posActiveCategory) {
        btn.className = 'px-2.5 py-1 rounded-lg font-extrabold bg-teal-700 text-white shadow-xs';
      } else {
        btn.className = 'px-2 py-1 rounded-lg font-bold bg-slate-100 hover:bg-slate-200 text-slate-700';
      }
    }
  });
  renderPosQuickBarcodes();
}

function renderPosQuickBarcodes() {
  const wrap = document.getElementById('pos-quick-barcodes');
  if (!wrap) return;
  const filterCat = sysState.posActiveCategory || 'TODOS';
  let list = (sysState.products || []).filter((p) => !p.vencimiento.vencido);

  if (filterCat === 'CUIDADO') {
    list = list.filter((p) => {
      const c = (p.categoria || '').toLowerCase();
      const n = (p.nombre_comercial || '').toLowerCase();
      return c.includes('cuidado') || c.includes('desodorante') || n.includes('desodorante') || c.includes('belleza');
    });
  } else if (filterCat === 'LIMAS') {
    list = list.filter((p) => {
      const c = (p.categoria || '').toLowerCase();
      const n = (p.nombre_comercial || '').toLowerCase();
      return c.includes('lima') || c.includes('manicura') || n.includes('lima');
    });
  } else if (filterCat === 'MEDICAMENTOS') {
    list = list.filter((p) => !p.es_mercancia && (p.unidades_por_blister > 1 || ['Analgésicos', 'Antibióticos', 'Gastrointestinal', 'Cardiovascular', 'Antialérgicos'].some((x) => (p.categoria || '').includes(x))));
  } else if (filterCat === 'HIGIENE') {
    list = list.filter((p) => {
      const c = (p.categoria || '').toLowerCase();
      const n = (p.nombre_comercial || '').toLowerCase();
      return c.includes('higiene') || c.includes('curacion') || c.includes('médico') || n.includes('cepillo') || n.includes('curitas') || n.includes('alcohol');
    });
  }

  if (!list.length) {
    wrap.innerHTML = `<span class="text-xs text-slate-400 italic py-1">No hay productos en esta categoría.</span>`;
    return;
  }

  wrap.innerHTML = list
    .map(
      (p) => `
      <button
        type="button"
        onclick="quickScanPosProduct('${p.codigo_barras}')"
        title="${p.nombre_comercial} (Stock: ${p.inventario.stock_total_unidades}u | RD$ ${p.precio_base} | Ubic: ${p.ubicacion_anaquel || 'A-01'})"
        class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-teal-50 border border-slate-300 text-[11px] font-medium flex items-center gap-1.5 transition hover:border-teal-400"
      >
        <span class="font-mono font-bold text-teal-700">${p.codigo_barras}</span>
        <span class="truncate max-w-[130px] font-semibold">${p.nombre_comercial}</span>
        <span class="text-[10px] text-slate-500 font-mono">(${p.inventario.stock_total_unidades}u)</span>
      </button>
    `
    )
    .join('');
}

function quickScanPosProduct(barcode) {
  document.getElementById('pos-barcode-input').value = barcode;
  handlePosBarcodeSubmit(new Event('submit'));
}

/* =========================================================================
   BÚSQUEDA EN TIEMPO REAL CON MENÚ FLOTANTE Y REGISTRO DIRECTO AL POS
   ========================================================================= */

function handlePosSearchInput(val) {
  const dropdown = document.getElementById('pos-search-dropdown');
  if (!dropdown) return;
  const q = (val || '').trim().toLowerCase();
  if (!q || q.length < 1) {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
    return;
  }

  const matches = (sysState.products || []).filter((p) => {
    const name = (p.nombre_comercial || '').toLowerCase();
    const cat = (p.categoria || '').toLowerCase();
    const active = (p.principio_activo || '').toLowerCase();
    const barcode = (p.codigo_barras || '').toLowerCase();
    const shelf = (p.ubicacion_anaquel || '').toLowerCase();
    const lote = (p.lote || '').toLowerCase();
    const tags = (p.sintomas_tags || '').toLowerCase();
    return (
      name.includes(q) ||
      cat.includes(q) ||
      active.includes(q) ||
      barcode.includes(q) ||
      shelf.includes(q) ||
      lote.includes(q) ||
      tags.includes(q)
    );
  });

  if (!matches.length) {
    dropdown.innerHTML = `
      <div class="p-4 text-center text-xs text-slate-500 font-medium">
        No se encontró ningún medicamento o mercancía con "<strong>${q}</strong>".
        <div class="mt-2.5">
          <button type="button" onclick="openNewProductModal()" class="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs shadow-xs">
            ➕ Registrar "${q}" en el Sistema
          </button>
        </div>
      </div>
    `;
    dropdown.classList.remove('hidden');
    return;
  }

  dropdown.innerHTML = matches
    .slice(0, 10)
    .map((p) => {
      const isExpired = p.vencimiento && p.vencimiento.vencido;
      const isLowStock = p.inventario && p.inventario.alerta_stock_bajo;
      const stock = p.inventario ? p.inventario.stock_total_unidades : 0;
      const isMerch = p.es_mercancia || p.unidades_por_blister <= 1;

      const uPrice = p.precio_base || 0;
      const bPrice =
        (p.precios_presentacion && p.precios_presentacion.BLISTER) ||
        uPrice * (p.unidades_por_blister || 1);
      const cPrice =
        (p.precios_presentacion && p.precios_presentacion.CAJA) ||
        uPrice * (p.inventario.unidades_por_caja || ((p.unidades_por_blister || 1) * (p.blisters_por_caja || 1)));

      const uBlister = p.unidades_por_blister || 1;
      const uCaja =
        p.inventario.unidades_por_caja || (uBlister * (p.blisters_por_caja || 1));
      const canBlister = !isMerch && uBlister > 1 && stock >= uBlister;
      const canCaja = uCaja > 1 && stock >= uCaja;

      return `
        <div class="p-3 hover:bg-slate-50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="px-2 py-0.5 rounded text-[10px] font-extrabold ${
                isMerch ? 'bg-teal-100 text-teal-800' : 'bg-sky-100 text-sky-800'
              }">
                ${isMerch ? '🧴 Mercancía' : '💊 Medicamento'}
              </span>
              <span class="font-extrabold text-slate-900 text-sm truncate">${p.nombre_comercial}</span>
              <span class="text-[10px] font-mono text-slate-400">#${p.codigo_barras}</span>
            </div>
            <div class="flex items-center gap-3 text-[11px] text-slate-600 mt-1 flex-wrap">
              <span>📍 Anaquel: <strong>${p.ubicacion_anaquel || 'A-01'}</strong></span>
              <span>Lote: <strong class="font-mono">${p.lote}</strong></span>
              <span>Vence: <strong class="font-mono">${p.fecha_vencimiento}</strong></span>
              <span class="font-bold ${
                isLowStock
                  ? 'text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded'
                  : 'text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded'
              }">
                Stock: ${stock} ${p.unidad_minima_nombre || 'unid.'}
              </span>
            </div>
          </div>

          <div class="flex items-center gap-1.5 flex-shrink-0">
            ${
              isExpired
                ? `
              <span class="px-3 py-1.5 rounded-xl bg-rose-100 text-rose-800 font-extrabold text-[11px]">
                ⛔ VENCIDO (${p.fecha_vencimiento})
              </span>
            `
                : `
              <button
                type="button"
                onclick="addPosItemDirect(${p.id}, 'UNIDAD')"
                ${
                  stock < 1
                    ? 'disabled class="px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-400 font-bold text-xs cursor-not-allowed"'
                    : 'class="px-2.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs shadow-xs"'
                }
                title="Vender 1 Unidad / Pieza suelta"
              >
                + 1 Unid (${formatRD(uPrice)})
              </button>
              ${
                !isMerch && uBlister > 1
                  ? `
                <button
                  type="button"
                  onclick="addPosItemDirect(${p.id}, 'BLISTER')"
                  ${
                    !canBlister
                      ? 'disabled class="px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-400 font-bold text-xs cursor-not-allowed"'
                      : 'class="px-2.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-xs shadow-xs"'
                  }
                  title="Vender 1 Blíster (${uBlister} unid.)"
                >
                  + Blíster (${formatRD(bPrice)})
                </button>
              `
                  : ''
              }
              ${
                uCaja > 1
                  ? `
                <button
                  type="button"
                  onclick="addPosItemDirect(${p.id}, 'CAJA')"
                  ${
                    !canCaja
                      ? 'disabled class="px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-400 font-bold text-xs cursor-not-allowed"'
                      : 'class="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-xs"'
                  }
                  title="Vender 1 Caja (${uCaja} unid.)"
                >
                  + Caja (${formatRD(cPrice)})
                </button>
              `
                  : ''
              }
            `
            }
          </div>
        </div>
      `;
    })
    .join('');

  dropdown.classList.remove('hidden');
}

function handlePosSearchKeydown(event) {
  if (event.key === 'Escape') {
    const dropdown = document.getElementById('pos-search-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    handlePosBarcodeSubmit(event);
  }
}

function addPosItemDirect(productId, presentation) {
  const p = sysState.products.find((x) => x.id === productId);
  if (!p) return;
  if (p.vencimiento && p.vencimiento.vencido) {
    showToast(
      `⛔ BLOQUEO SANITARIO: El producto está VENCIDO (${p.vencimiento.fecha_vencimiento}). No se puede vender.`,
      'error'
    );
    return;
  }
  const isMerch = p.es_mercancia || p.unidades_por_blister <= 1;
  let pres = presentation || 'UNIDAD';
  if (isMerch && pres === 'BLISTER') pres = 'UNIDAD';

  const needed = calcMinUnits(p, pres, 1);
  const committed = sysState.posCart
    .filter((i) => i.product.id === p.id)
    .reduce((acc, i) => acc + calcMinUnits(p, i.presentacion, i.cantidad), 0);

  if (committed + needed > p.inventario.stock_total_unidades) {
    showToast(
      `Stock insuficiente. Se requieren ${needed} unidades pero solo quedan ${Math.max(
        0,
        p.inventario.stock_total_unidades - committed
      )} disponibles en farmacia.`,
      'error'
    );
    return;
  }

  const existing = sysState.posCart.find(
    (i) => i.product.id === p.id && i.presentacion === pres
  );
  if (existing) existing.cantidad += 1;
  else sysState.posCart.push({ product: p, presentacion: pres, cantidad: 1 });

  const inp = document.getElementById('pos-barcode-input');
  if (inp) inp.value = '';
  const dropdown = document.getElementById('pos-search-dropdown');
  if (dropdown) {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
  }
  renderPosCart();
  showToast(`✅ Agregado: ${p.nombre_comercial} (${pres})`);
}

function handlePosBarcodeSubmit(event) {
  if (event && event.preventDefault) event.preventDefault();
  const input = document.getElementById('pos-barcode-input');
  const q = input.value.trim().toLowerCase();
  let pres = document.getElementById('pos-scan-presentation').value;
  if (!q) return;

  const product = sysState.products.find(
    (p) =>
      p.codigo_barras.toLowerCase() === q ||
      p.nombre_comercial.toLowerCase().includes(q)
  );
  if (!product) {
    showToast('Medicamento o mercancía no encontrada en el inventario.', 'error');
    return;
  }
  if (product.vencimiento.vencido) {
    showToast(
      `⛔ BLOQUEO SANITARIO: El lote ${product.lote} está VENCIDO (${product.vencimiento.fecha_vencimiento}).`,
      'error'
    );
    return;
  }

  const isMerch = product.es_mercancia || product.unidades_por_blister <= 1;
  if (isMerch && pres === 'BLISTER') pres = 'UNIDAD';

  const needed = calcMinUnits(product, pres, 1);
  const committed = sysState.posCart
    .filter((i) => i.product.id === product.id)
    .reduce((acc, i) => acc + calcMinUnits(product, i.presentacion, i.cantidad), 0);

  if (committed + needed > product.inventario.stock_total_unidades) {
    showToast(
      `Stock insuficiente en esta farmacia (${product.inventario.stock_total_unidades} unid. disp.).`,
      'error'
    );
    return;
  }

  const existing = sysState.posCart.find(
    (i) => i.product.id === product.id && i.presentacion === pres
  );
  if (existing) existing.cantidad += 1;
  else sysState.posCart.push({ product, presentacion: pres, cantidad: 1 });

  input.value = '';
  const dropdown = document.getElementById('pos-search-dropdown');
  if (dropdown) dropdown.classList.add('hidden');
  renderPosCart();
}

function changePosItemQty(index, delta) {
  const item = sysState.posCart[index];
  if (!item) return;
  const next = item.cantidad + delta;
  if (next <= 0) {
    sysState.posCart.splice(index, 1);
  } else {
    const p = sysState.products.find((pr) => pr.id === item.product.id) || item.product;
    const others = sysState.posCart
      .filter((it, idx) => idx !== index && it.product.id === p.id)
      .reduce((acc, it) => acc + calcMinUnits(p, it.presentacion, it.cantidad), 0);
    const needed = calcMinUnits(p, item.presentacion, next);
    const available = p.inventario.stock_total_unidades - others;
    if (needed > available) {
      showToast(
        `Stock insuficiente. Para ${next} ${item.presentacion}(s) se requieren ${needed} unidades pero solo quedan ${Math.max(
          0,
          available
        )} disponibles.`,
        'error'
      );
      return;
    }
    item.cantidad = next;
  }
  renderPosCart();
}

function setPosItemDirectQty(index, val) {
  const item = sysState.posCart[index];
  if (!item) return;
  const num = parseInt(val, 10);
  if (isNaN(num) || num <= 0) {
    sysState.posCart.splice(index, 1);
  } else {
    const p = sysState.products.find((pr) => pr.id === item.product.id) || item.product;
    const others = sysState.posCart
      .filter((it, idx) => idx !== index && it.product.id === p.id)
      .reduce((acc, it) => acc + calcMinUnits(p, it.presentacion, it.cantidad), 0);
    const needed = calcMinUnits(p, item.presentacion, num);
    const available = p.inventario.stock_total_unidades - others;
    if (needed > available) {
      showToast(
        `Stock insuficiente. Para ${num} ${item.presentacion}(s) se requieren ${needed} unidades pero solo quedan ${Math.max(
          0,
          available
        )} disponibles.`,
        'error'
      );
      renderPosCart();
      return;
    }
    item.cantidad = num;
  }
  renderPosCart();
}

function changePosItemPresentation(index, newPres) {
  const item = sysState.posCart[index];
  if (!item) return;
  const p = sysState.products.find((pr) => pr.id === item.product.id) || item.product;
  const isMerch = p.es_mercancia || p.unidades_por_blister <= 1;
  if (newPres === 'BLISTER' && isMerch) {
    showToast('Este artículo no cuenta con presentación de blíster.', 'error');
    renderPosCart();
    return;
  }
  const others = sysState.posCart
    .filter((it, idx) => idx !== index && it.product.id === p.id)
    .reduce((acc, it) => acc + calcMinUnits(p, it.presentacion, it.cantidad), 0);
  const needed = calcMinUnits(p, newPres, item.cantidad);
  const available = p.inventario.stock_total_unidades - others;
  if (needed > available) {
    showToast(
      `Stock insuficiente para cambiar a ${newPres}. Se requieren ${needed} unidades pero solo quedan ${Math.max(
        0,
        available
      )} disponibles en farmacia. Puede vender unidades sueltas.`,
      'error'
    );
    renderPosCart();
    return;
  }
  item.presentacion = newPres;
  renderPosCart();
}

function renderPosCart() {
  const tbody = document.getElementById('pos-cart-tbody');
  if (!sysState.posCart.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400">Escanee un código o busque una mercancía/medicamento arriba para facturar en mostrador.</td></tr>`;
    document.getElementById('pos-total-min-units').textContent = '0 unid.';
    document.getElementById('pos-total-amount').textContent = 'RD$ 0.00';
    updatePosActiveCartPills();
    return;
  }

  let totalU = 0;
  let totalRD = 0;
  tbody.innerHTML = sysState.posCart
    .map((item, idx) => {
      const p = sysState.products.find((pr) => pr.id === item.product.id) || item.product;
      const isMerch = p.es_mercancia || p.unidades_por_blister <= 1;
      const canBlister = !isMerch && p.unidades_por_blister > 1;
      const canCaja =
        (p.inventario.unidades_por_caja || (p.unidades_por_blister * p.blisters_por_caja)) > 1;

      // Normalizar si quedó en blister para mercancía
      if (!canBlister && item.presentacion === 'BLISTER') {
        item.presentacion = 'UNIDAD';
      }

      let presOptions = '';
      if (canCaja) {
        presOptions += `<option value="CAJA" ${
          item.presentacion === 'CAJA' ? 'selected' : ''
        }>CAJA (${p.inventario.unidades_por_caja}u)</option>`;
      }
      if (canBlister) {
        presOptions += `<option value="BLISTER" ${
          item.presentacion === 'BLISTER' ? 'selected' : ''
        }>BLÍSTER (${p.unidades_por_blister}u)</option>`;
      }
      presOptions += `<option value="UNIDAD" ${
        item.presentacion === 'UNIDAD' ? 'selected' : ''
      }>UNIDAD (1u)</option>`;

      const sub = (p.precios_presentacion && p.precios_presentacion[item.presentacion] != null
        ? p.precios_presentacion[item.presentacion]
        : (item.presentacion === 'CAJA' ? p.precio_base * p.inventario.unidades_por_caja : (item.presentacion === 'BLISTER' ? p.precio_base * p.unidades_por_blister : p.precio_base))
      ) * item.cantidad;

      const minU = calcMinUnits(p, item.presentacion, item.cantidad);
      totalU += minU;
      totalRD += sub;

      return `
        <tr>
          <td class="py-2.5 px-3">
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] font-extrabold px-1.5 py-0.2 rounded ${
                isMerch ? 'bg-teal-100 text-teal-800' : 'bg-sky-100 text-sky-800'
              }">${isMerch ? '🧴' : '💊'}</span>
              <p class="font-extrabold text-slate-900">${p.nombre_comercial}</p>
            </div>
            <p class="text-[10px] font-mono text-slate-400">Lote: ${p.lote} • Anaquel: ${
              p.ubicacion_anaquel || 'A-01'
            } • Disp: ${p.inventario.stock_total_unidades}u</p>
          </td>
          <td class="py-2.5 px-2">
            <select onchange="changePosItemPresentation(${idx}, this.value)" class="px-2 py-1 rounded border border-slate-300 font-bold text-[11px] bg-white">
              ${presOptions}
            </select>
          </td>
          <td class="py-2.5 px-2 text-center">
            <div class="inline-flex items-center gap-0.5">
              <button type="button" onclick="changePosItemQty(${idx}, -1)" class="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 font-extrabold text-xs">-</button>
              <input
                type="number"
                min="1"
                max="999"
                value="${item.cantidad}"
                onchange="setPosItemDirectQty(${idx}, this.value)"
                class="w-12 text-center font-bold border border-slate-300 rounded py-0.5 mx-0.5 text-xs font-mono"
              />
              <button type="button" onclick="changePosItemQty(${idx}, 1)" class="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 font-extrabold text-xs">+</button>
            </div>
          </td>
          <td class="py-2.5 px-2 text-center font-mono font-bold text-teal-700">-${minU}u</td>
          <td class="py-2.5 px-3 text-right font-extrabold">${formatRD(sub)}</td>
          <td class="py-2.5 px-2 text-center">
            <button onclick="changePosItemQty(${idx}, -999)" title="Quitar fila" class="text-rose-600 hover:text-rose-800 font-bold px-1.5 py-0.5 rounded">✕</button>
          </td>
        </tr>
      `;
    })
    .join('');

  document.getElementById('pos-total-min-units').textContent = `${totalU} unid. mínimas`;
  document.getElementById('pos-total-amount').textContent = formatRD(totalRD);
  updatePosActiveCartPills();
}

async function submitPosSale() {
  if (!sysState.posCart || !sysState.posCart.length) {
    showToast('El ticket POS está vacío. Añada al menos un producto para cobrar.', 'error');
    return;
  }
  
  const f = sysState.authenticatedPharmacy || { id: 1, nombre: 'Farmacia Davalsi - Principal' };
  const farmaciaId = Number(f.id || 1);

  const clientNameInput = document.getElementById('pos-client-name');
  const clientPhoneInput = document.getElementById('pos-client-phone');
  const paymentMethodInput = document.getElementById('pos-payment-method');
  const insuranceInput = document.getElementById('pos-insurance-ars');
  const paymentRefInput = document.getElementById('pos-payment-ref');
  const cashTenderedInput = document.getElementById('pos-cash-tendered');

  const metodoPago = paymentMethodInput ? paymentMethodInput.value : 'EFECTIVO';
  const clienteNombre = (clientNameInput ? clientNameInput.value.trim() : '') || 'Cliente de Mostrador';
  const clienteTelefono = clientPhoneInput ? clientPhoneInput.value.trim() : '';
  const seguroArs = insuranceInput ? insuranceInput.value : 'Sin Seguro';

  if (metodoPago === 'TARJETA' && f.pago_tarjeta_activo === false) {
    showToast('🔒 El pago con tarjeta está bloqueado en la configuración superior derecha.', 'error');
    return;
  }
  if (seguroArs !== 'Sin Seguro' && f.seguro_medico_activo === false) {
    showToast('🔒 El Seguro Médico (ARS) está bloqueado en la configuración superior derecha.', 'error');
    return;
  }
  const refPago = paymentRefInput ? paymentRefInput.value.trim() : '';
  const cashTendered = cashTenderedInput ? parseFloat(cashTenderedInput.value || 0) : 0;

  const itemsPayload = sysState.posCart.map((i) => ({
    producto_id: Number(i.product ? i.product.id : i.producto_id),
    presentacion: i.presentacion,
    cantidad: Number(i.cantidad || 1),
  }));

  try {
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: farmaciaId,
        canal: 'POS_MOSTRADOR',
        cliente_nombre: clienteNombre,
        cliente_telefono: clienteTelefono,
        metodo_pago: metodoPago,
        seguro_ars: seguroArs,
        referencia_pago: refPago,
        monto_pagado_efectivo: cashTendered,
        atendido_por: f.nombre_usuario_actual || f.usuario_actual || f.usuario_admin || 'Cajero Mostrador',
        items: itemsPayload,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      showToast(data.error || 'No se pudo procesar la venta en mostrador.', 'error');
      return;
    }

    // Registrar en memoria la última orden para impresión directa
    sysState.lastCompletedOrder = data.order;
    if (metodoPago === 'EFECTIVO' && cashTendered > 0) {
      sysState.lastCompletedOrder.monto_entregado_rd = cashTendered;
      sysState.lastCompletedOrder.cambio_vuelto_rd = Math.max(0, cashTendered - Number(data.order.total || 0));
    }

    showToast(`✅ Venta #${data.order.codigo_orden} registrada correctamente (RD$ ${Number(data.order.total).toFixed(2)})`);

    // Limpiar carrito y campos de cobro
    sysState.posCart = [];
    renderPosCart();
    if (cashTenderedInput) cashTenderedInput.value = '';
    const changeValEl = document.getElementById('pos-cash-change-val');
    if (changeValEl) changeValEl.textContent = 'RD$ 0.00';
    if (paymentRefInput) paymentRefInput.value = '';

    // Refrescar bases de datos, cintillo comparativo y reportes
    await refreshPharmacyWorkspace();

    // Mostrar modal con ticket listo para imprimir
    showInvoiceReceiptModal(sysState.lastCompletedOrder);
  } catch (err) {
    console.error('Error al registrar venta POS:', err);
    showToast('Fallo de conexión al registrar la venta. Verifique el servidor.', 'error');
  }
}

function showInvoiceReceiptModal(order) {
  sysState.lastCompletedOrder = order;
  const f = sysState.authenticatedPharmacy || {};
  const area = document.getElementById('printable-receipt-area');
  const itemsHtml = (order.items || [])
    .map(
      (i) => `
      <div class="flex justify-between py-1 border-b border-slate-100">
        <div>
          <span class="font-bold">${i.cantidad_presentacion}x ${i.presentacion} ${i.nombre_comercial}</span>
          <span class="block text-[10px] text-slate-400">${i.unidades_minimas_descontadas || 1} unid. mínimas</span>
        </div>
        <span class="font-bold">${formatRD(i.subtotal)}</span>
      </div>
    `
    )
    .join('');

  const cashChangeHtml = order.monto_entregado_rd ? `
    <div class="flex justify-between text-xs text-slate-600 pt-1">
      <span>Efectivo Entregado:</span>
      <span class="font-bold font-mono">${formatRD(order.monto_entregado_rd)}</span>
    </div>
    <div class="flex justify-between text-xs text-emerald-700 font-extrabold">
      <span>Cambio / Vuelto:</span>
      <span class="font-black font-mono text-sm">${formatRD(order.cambio_vuelto_rd || 0)}</span>
    </div>
  ` : '';

  area.innerHTML = `
    <div class="text-center space-y-1">
      <h3 class="text-lg font-extrabold text-teal-800">${f.nombre || 'Farmacia Davalsi'}</h3>
      <p class="text-xs text-slate-500">${f.eslogan || 'Sistema de Farmacia FarmaSys'}</p>
      <p class="text-[11px] font-mono text-slate-500">RNC: ${f.rnc || '1-31-99887-2'} • Tel: ${f.telefono || f.telefono_whatsapp}</p>
      <p class="text-[11px] text-slate-400">${f.direccion || ''}</p>
    </div>
    <div class="border-t-2 border-dashed border-teal-200 my-2"></div>
    <div class="text-[11px] space-y-0.5">
      <div class="flex justify-between"><span>Factura / Orden:</span><strong class="font-mono text-teal-900">#${order.codigo_orden}</strong></div>
      <div class="flex justify-between"><span>Fecha:</span><span>${order.fecha_hora}</span></div>
      <div class="flex justify-between"><span>Cliente:</span><strong>${order.cliente_nombre}</strong></div>
      <div class="flex justify-between"><span>Pago / Seguro:</span><span>${order.metodo_pago} • ${order.seguro_ars || 'Sin Seguro'}</span></div>
      <div class="flex justify-between"><span>Atendido por:</span><span>${order.atendido_por || 'Cajero Mostrador'}</span></div>
    </div>
    <div class="border-t border-slate-200 my-2 pt-1">
      ${itemsHtml}
    </div>
    <div class="flex justify-between items-baseline text-sm font-extrabold text-slate-900 pt-1">
      <span>TOTAL FACTURADO:</span>
      <span class="text-base text-teal-700 font-black">${formatRD(order.total)}</span>
    </div>
    ${cashChangeHtml}
    <div class="pt-2">
      <button type="button" onclick="sendInvoiceToWhatsApp('${order.codigo_orden}')" class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow transition">
        <span>💬</span> <span>Enviar Medicamentos y Recibo por WhatsApp</span>
      </button>
    </div>
    <div class="border-t-2 border-dashed border-teal-200 my-2 pt-2 text-center">
      <p class="text-xs font-semibold text-slate-600">${f.mensaje_factura || '¡Gracias por su compra en FarmaSys!'}</p>
    </div>
  `;

  showModal('invoice-receipt-modal');
}

function closeInvoiceReceiptModal() {
  hideModal('invoice-receipt-modal');
}

function openReceiptById(txId) {
  const tx = sysState.transactions.find((t) => t.id === txId);
  if (tx) showInvoiceReceiptModal(tx);
}

/* =========================================================================
   HISTORIAL DE VENTAS Y REPORTES (FILTROS HOY | ESTE MES | TODO)
   ========================================================================= */

function setSalesHistoryPeriod(periodo) {
  sysState.salesHistoryPeriod = periodo;
  ['HOY', 'MES', 'TODO'].forEach((p) => {
    const btn = document.getElementById(`btn-period-${p}`);
    if (!btn) return;
    if (p === periodo) {
      btn.className = 'px-4 py-2 rounded-xl text-xs font-extrabold transition bg-teal-600 text-white shadow-xs';
    } else {
      btn.className = 'px-4 py-2 rounded-xl text-xs font-bold transition text-slate-600 hover:text-slate-900';
    }
  });
  loadSysTransactions();
}

async function loadSysTransactions(fid) {
  const id = fid || sysState.authenticatedPharmacy.id;
  const periodo = sysState.salesHistoryPeriod || 'HOY';
  const res = await fetch(`/api/transactions?farmacia_id=${id}&periodo=${periodo}`);
  const data = await res.json();
  if (!data.ok) return;
  sysState.transactions = data.transactions;

  // Actualizar KPI "TOTAL DEL PERIODO" y "TICKET PROMEDIO" según el filtro activo (Exacto a Captura 1)
  const validTxs = sysState.transactions.filter((t) => t.estado_pedido !== 'RECHAZADO_RECETA');
  const sumPeriod = validTxs.reduce((acc, t) => acc + Number(t.total || 0), 0);
  const avgPeriod = validTxs.length > 0 ? sumPeriod / validTxs.length : 0;

  const elPeriodTot = document.getElementById('rep-kpi-period-total');
  const elPeriodCnt = document.getElementById('rep-kpi-period-cnt');
  const elAvg = document.getElementById('rep-kpi-avg-ticket');
  if (elPeriodTot) elPeriodTot.textContent = formatRD(sumPeriod);
  if (elPeriodCnt) elPeriodCnt.textContent = `${validTxs.length} transacciones`;
  if (elAvg) elAvg.textContent = formatRD(avgPeriod);

  renderPosWebOrdersInbox();
  renderAppRequests();
  renderSysTransactionsTable();
}

function renderPosWebOrdersInbox() {
  const inbox = document.getElementById('pos-web-orders-inbox');
  if (!inbox) return;
  const appOrders = sysState.transactions.filter((t) => t.canal === 'APP_PACIENTE');
  if (!appOrders.length) {
    inbox.innerHTML = `<div class="p-6 text-center text-xs text-slate-400">No hay pedidos desde la App en este periodo.</div>`;
    return;
  }

  inbox.innerHTML = appOrders
    .map((order) => {
      const isPending = order.estado_pedido === 'PENDIENTE_RECETA';
      return `
        <div class="p-3.5 rounded-2xl border ${
          isPending ? 'border-amber-400 bg-amber-50/40' : 'border-slate-200 bg-slate-50'
        } space-y-2 text-xs">
          <div class="flex items-center justify-between">
            <span class="font-mono font-extrabold">#${order.codigo_orden} • ${order.fecha_hora}</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-white border">${order.estado_pedido}</span>
          </div>
          <p class="font-bold text-slate-800">👤 ${order.cliente_nombre} • 📱 +${order.cliente_telefono}</p>
          <p class="text-[11px] text-teal-800 font-bold">💳 ${order.metodo_pago} — ${formatRD(order.total)}</p>
          <div class="flex items-center justify-between pt-1">
            ${
              order.receta_imagen_url
                ? `<button onclick="openPrescriptionModal(${order.id})" class="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-[11px]">
                    🔍 Ver Receta Médica
                  </button>`
                : `<span class="text-[11px] text-emerald-700 font-semibold">✅ Venta Libre</span>`
            }
            ${
              isPending || order.estado_pedido === 'EN_PREPARACION'
                ? `<button onclick="quickApproveOrder(${order.id})" class="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-[11px]">
                    ✓ Aprobar Despacho
                  </button>`
                : ''
            }
          </div>
        </div>
      `;
    })
    .join('');
}

/* =========================================================================
   SOLICITUDES DESDE LA APP (Screenshot 2: App Activa, KPIs y Filtros)
   ========================================================================= */

function renderAppRequests() {
  const container = document.getElementById('app-requests-list-container');
  if (!container) return;

  const appOrders = sysState.transactions.filter((tx) => tx.canal === 'APP_PACIENTE');
  const todayStr = new Date().toISOString().slice(0, 10);
  const hoyCnt = appOrders.filter((tx) => (tx.fecha_dia || tx.fecha_hora?.slice(0, 10)) === todayStr).length;
  const pendCnt = appOrders.filter((tx) => ['PENDIENTE_RECETA', 'EN_PREPARACION'].includes(tx.estado_pedido)).length;
  const atendCnt = appOrders.filter((tx) => ['COMPLETADO', 'RECHAZADO_RECETA'].includes(tx.estado_pedido)).length;

  const elHoy = document.getElementById('app-kpi-hoy');
  if (elHoy) elHoy.textContent = hoyCnt;
  const elPend = document.getElementById('app-kpi-pendientes');
  if (elPend) elPend.textContent = pendCnt;
  const elAtend = document.getElementById('app-kpi-atendidas');
  if (elAtend) elAtend.textContent = atendCnt;

  const bTodas = document.getElementById('cnt-app-todas');
  if (bTodas) bTodas.textContent = appOrders.length;
  const bPend = document.getElementById('cnt-app-pendientes');
  if (bPend) bPend.textContent = pendCnt;
  const bAtend = document.getElementById('cnt-app-atendidas');
  if (bAtend) bAtend.textContent = atendCnt;

  const navBadgeApp = document.getElementById('badge-sys-pending-app');
  if (navBadgeApp) {
    if (pendCnt > 0) {
      navBadgeApp.textContent = pendCnt;
      navBadgeApp.classList.remove('hidden');
    } else navBadgeApp.classList.add('hidden');
  }
  const mobBadgeApp = document.getElementById('badge-mobile-pending-app');
  if (mobBadgeApp) {
    if (pendCnt > 0) {
      mobBadgeApp.textContent = pendCnt;
      mobBadgeApp.classList.remove('hidden');
    } else mobBadgeApp.classList.add('hidden');
  }

  let filtered = appOrders;
  if (sysState.appRequestsFilter === 'PENDIENTES') {
    filtered = appOrders.filter((tx) => ['PENDIENTE_RECETA', 'EN_PREPARACION'].includes(tx.estado_pedido));
  } else if (sysState.appRequestsFilter === 'ATENDIDAS') {
    filtered = appOrders.filter((tx) => ['COMPLETADO', 'RECHAZADO_RECETA'].includes(tx.estado_pedido));
  }

  if (!filtered.length) {
    container.innerHTML = `
      <div class="p-10 text-center bg-white rounded-3xl border border-slate-200">
        <span class="text-3xl">📱</span>
        <p class="font-extrabold text-slate-700 mt-2">No hay solicitudes en este filtro.</p>
        <p class="text-xs text-slate-400">Los pedidos enviados desde la app de pacientes aparecerán aquí.</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map((tx) => {
    const isPending = ['PENDIENTE_RECETA', 'EN_PREPARACION'].includes(tx.estado_pedido);
    const itemsList = (tx.items || []).map((i) =>
      `<li class="flex justify-between py-1 border-b border-slate-100 last:border-b-0">
        <span><strong>${i.cantidad_presentacion}x ${i.presentacion}</strong> ${i.nombre_comercial} <span class="text-slate-400">(${i.unidades_minimas_descontadas} unid. mín.)</span></span>
        <span class="font-bold text-slate-800">${formatRD(i.subtotal)}</span>
      </li>`
    ).join('');

    const cleanPhone = (tx.cliente_telefono || '').replace(/\D/g, '');
    const waMsg = encodeURIComponent(`Hola ${tx.cliente_nombre}, le saludamos de Farmacia Davalsi respecto a su solicitud #${tx.codigo_orden}.`);
    const waLink = cleanPhone ? `https://wa.me/${cleanPhone.startsWith('1') ? cleanPhone : '1' + cleanPhone}?text=${waMsg}` : '#';

    return `
      <div class="bg-white rounded-3xl p-5 border ${isPending ? 'border-amber-300 shadow-md' : 'border-slate-200'} space-y-3.5">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="px-2.5 py-1 rounded-xl bg-slate-100 font-mono font-bold text-xs text-slate-800">#${tx.codigo_orden}</span>
            <span class="text-xs text-slate-400 font-medium">${tx.fecha_hora}</span>
          </div>
          <span class="px-3 py-1 rounded-full text-xs font-extrabold ${
            tx.estado_pedido === 'COMPLETADO'
              ? 'bg-emerald-100 text-emerald-800'
              : tx.estado_pedido === 'RECHAZADO_RECETA'
              ? 'bg-rose-100 text-rose-800'
              : 'bg-amber-100 text-amber-900 animate-pulse'
          }">${tx.estado_pedido}</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div class="space-y-1">
            <p class="font-bold text-sm text-slate-900">${tx.cliente_nombre}</p>
            <p class="text-slate-500 font-mono">📞 ${tx.cliente_telefono}</p>
            <p class="text-slate-600">📍 ${tx.cliente_direccion || 'Entrega en farmacia'}</p>
            <p class="text-slate-500">🛡️ Seguro: <strong>${tx.seguro_ars || 'Sin Seguro'}</strong> • Pago: <strong>${tx.metodo_pago}</strong></p>
          </div>

          <div class="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-1.5">
            <p class="font-extrabold text-[11px] uppercase text-slate-500">Medicamentos Solicitados:</p>
            <ul class="space-y-1 text-slate-800">${itemsList}</ul>
            <div class="pt-2 border-t border-slate-200 flex justify-between font-extrabold text-sm text-slate-900">
              <span>Total a Cobrar:</span>
              <span class="text-teal-700">${formatRD(tx.total)}</span>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div class="flex items-center gap-2">
            ${tx.receta_imagen_url ? `
              <button onclick="openPrescriptionModal(${tx.id})" class="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 font-bold text-xs flex items-center gap-1.5">
                <span>👁️</span> <span>Ver Receta Médica</span>
              </button>
            ` : '<span class="text-xs text-slate-400">Sin receta adjunta</span>'}
            ${cleanPhone ? `
              <a href="${waLink}" target="_blank" class="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs flex items-center gap-1.5">
                <span>💬</span> <span>WhatsApp Cliente</span>
              </a>
            ` : ''}
          </div>

          ${isPending ? `
            <div class="flex items-center gap-2">
              <button onclick="quickApproveOrder(${tx.id})" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow">
                ✅ Aprobar Despacho
              </button>
              <button onclick="quickRejectOrder(${tx.id})" class="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow">
                ❌ Rechazar
              </button>
            </div>
          ` : `<p class="text-xs text-slate-400 font-semibold">Atendido por: ${tx.atendido_por || 'Farmacéutico'}</p>`}
        </div>
      </div>
    `;
  }).join('');
}

function setAppRequestsFilter(filter) {
  sysState.appRequestsFilter = filter;
  ['TODAS', 'PENDIENTES', 'ATENDIDAS'].forEach((f) => {
    const b = document.getElementById(`filter-app-${f}`);
    if (b) {
      if (f === filter) {
        b.className = 'px-4 py-2 rounded-2xl text-xs font-extrabold transition bg-slate-900 text-white shadow';
      } else {
        b.className = 'px-4 py-2 rounded-2xl text-xs font-bold transition bg-white text-slate-700 border border-slate-300 hover:bg-slate-50';
      }
    }
  });
  renderAppRequests();
}

async function quickRejectOrder(orderId) {
  const mot = window.prompt('Motivo del rechazo de la solicitud (se notificará al paciente y se reintegrará el stock):', 'Receta no válida o ilegible');
  if (!mot) return;
  sysState.activeReviewOrderId = orderId;
  const inpNote = document.getElementById('rx-pharmacist-note');
  if (inpNote) inpNote.value = mot;
  await submitPrescriptionReview('RECHAZAR');
}

/* =========================================================================
   RECETAS MÉDICAS (Screenshot 3: + Nueva Receta, Filtros y Despacho)
   ========================================================================= */

async function loadSysPrescriptions(fid) {
  const id = fid || sysState.authenticatedPharmacy.id;
  const res = await fetch(`/api/prescriptions?farmacia_id=${id}`);
  const data = await res.json();
  if (data.ok) {
    sysState.prescriptions = data.prescriptions;
    renderPrescriptions();
  }
}

function renderPrescriptions() {
  const container = document.getElementById('prescriptions-list-container');
  if (!container) return;

  const rxs = sysState.prescriptions || [];
  const pendCnt = rxs.filter((r) => r.estado === 'PENDIENTE').length;
  const despCnt = rxs.filter((r) => r.estado === 'DESPACHADA').length;

  const bTodas = document.getElementById('cnt-rx-todas');
  if (bTodas) bTodas.textContent = rxs.length;
  const bPend = document.getElementById('cnt-rx-pendientes');
  if (bPend) bPend.textContent = pendCnt;
  const bDesp = document.getElementById('cnt-rx-despachadas');
  if (bDesp) bDesp.textContent = despCnt;

  const bNav = document.getElementById('badge-sys-pending-rx');
  if (bNav) {
    if (pendCnt > 0) {
      bNav.textContent = pendCnt;
      bNav.classList.remove('hidden');
    } else bNav.classList.add('hidden');
  }
  const bMob = document.getElementById('badge-mobile-pending-rx');
  if (bMob) {
    if (pendCnt > 0) {
      bMob.textContent = pendCnt;
      bMob.classList.remove('hidden');
    } else bMob.classList.add('hidden');
  }

  let filtered = rxs;
  if (sysState.prescriptionsFilter === 'PENDIENTES') {
    filtered = rxs.filter((r) => r.estado === 'PENDIENTE');
  } else if (sysState.prescriptionsFilter === 'DESPACHADAS') {
    filtered = rxs.filter((r) => r.estado === 'DESPACHADA');
  }

  if (!filtered.length) {
    container.innerHTML = `
      <div class="p-10 text-center bg-white rounded-3xl border border-slate-200">
        <span class="text-3xl">📋</span>
        <p class="font-extrabold text-slate-700 mt-2">No hay recetas médicas en este filtro.</p>
        <p class="text-xs text-slate-400">Pulsa "+ Nueva receta" para registrar recetas de pacientes con archivo digital.</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map((rx) => {
    const isPending = rx.estado === 'PENDIENTE';
    const imgUrl = rx.receta_imagen_url || '/api/sample-prescription.svg';
    return `
      <div class="bg-white rounded-3xl p-5 border ${isPending ? 'border-amber-300 shadow-md' : 'border-slate-200'} space-y-3.5">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="px-2.5 py-1 rounded-xl bg-slate-900 text-white font-mono font-bold text-xs">${rx.codigo_receta}</span>
            <span class="text-xs text-slate-400 font-medium">Fecha: ${rx.fecha_emision}</span>
          </div>
          <span class="px-3 py-1 rounded-full text-xs font-extrabold ${
            isPending ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'
          }">${rx.estado}</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div class="space-y-1">
            <p class="font-bold text-sm text-slate-900">👤 Paciente: ${rx.paciente_nombre}</p>
            <p class="text-slate-500 font-mono">Cédula: ${rx.paciente_cedula || 'N/D'} • Tel: ${rx.paciente_telefono || 'N/D'}</p>
            <p class="text-slate-700 pt-1">🩺 Médico: <strong>${rx.medico_nombre}</strong> (Exeq: ${rx.medico_exequatur || 'N/D'})</p>
            <p class="text-slate-500">🏥 Centro: ${rx.centro_medico || 'Clínica / Hospital'}</p>
          </div>

          <div class="bg-teal-50/50 p-3.5 rounded-2xl border border-teal-200 space-y-1.5">
            <p class="font-extrabold text-[11px] uppercase text-teal-900">Medicamentos Prescritos:</p>
            <p class="font-bold text-slate-800 text-sm">${rx.medicamentos_prescritos}</p>
            ${rx.diagnostico ? `<p class="text-teal-700 text-[11px]">Diagnóstico: <em>${rx.diagnostico}</em></p>` : ''}
            ${!isPending && rx.despachado_por ? `<p class="text-[10px] text-slate-400 pt-1 border-t border-teal-200">Despachado por: ${rx.despachado_por} (${rx.fecha_despacho || ''})</p>` : ''}
          </div>
        </div>

        <div class="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <button onclick="viewPrescriptionImage('${imgUrl}', '${rx.codigo_receta}', '${rx.paciente_nombre}')" class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1.5">
            <span>👁️</span> <span>Ver Receta Digital</span>
          </button>

          ${isPending ? `
            <button onclick="dispatchPrescriptionDirect(${rx.id})" class="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs shadow flex items-center gap-1.5">
              <span>✅</span> <span>Marcar como Despachada</span>
            </button>
          ` : `<span class="text-xs font-bold text-emerald-700 flex items-center gap-1"><span>✓</span> Receta archivada y despachada</span>`}
        </div>
      </div>
    `;
  }).join('');
}

function setPrescriptionsFilter(filter) {
  sysState.prescriptionsFilter = filter;
  ['TODAS', 'PENDIENTES', 'DESPACHADAS'].forEach((f) => {
    const b = document.getElementById(`filter-rx-${f}`);
    if (b) {
      if (f === filter) {
        b.className = 'px-4 py-2 rounded-2xl text-xs font-extrabold transition bg-slate-900 text-white shadow';
      } else {
        b.className = 'px-4 py-2 rounded-2xl text-xs font-bold transition bg-white text-slate-700 border border-slate-300 hover:bg-slate-50';
      }
    }
  });
  renderPrescriptions();
}

function openNewPrescriptionModal() {
  showModal('new-prescription-modal');
}

function closeNewPrescriptionModal() {
  hideModal('new-prescription-modal');
}

function setPresetSampleRx() {
  document.getElementById('rx-in-img-url').value = '/api/sample-prescription.svg';
  showToast('Receta de muestra asignada.');
}

async function submitNewPrescription(event) {
  event.preventDefault();
  const payload = {
    farmacia_id: sysState.authenticatedPharmacy.id,
    paciente_nombre: document.getElementById('rx-in-paciente').value.trim(),
    paciente_cedula: document.getElementById('rx-in-cedula').value.trim(),
    paciente_telefono: document.getElementById('rx-in-telefono').value.trim(),
    medico_nombre: document.getElementById('rx-in-medico').value.trim(),
    medico_exequatur: document.getElementById('rx-in-exequatur').value.trim(),
    centro_medico: document.getElementById('rx-in-centro').value.trim(),
    medicamentos_prescritos: document.getElementById('rx-in-medicamentos').value.trim(),
    diagnostico: document.getElementById('rx-in-diagnostico').value.trim(),
    receta_imagen_url: document.getElementById('rx-in-img-url').value.trim() || '/api/sample-prescription.svg',
  };

  const res = await fetch('/api/prescriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) {
    showToast(data.error || 'Error al guardar receta.', 'error');
    return;
  }

  closeNewPrescriptionModal();
  showToast(`Receta ${data.prescription.codigo_receta} guardada exitosamente.`);
  loadSysPrescriptions();
}

async function dispatchPrescriptionDirect(recetaId) {
  const res = await fetch('/api/prescriptions/dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      farmacia_id: sysState.authenticatedPharmacy.id,
      receta_id: recetaId,
      despachado_por: sysState.authenticatedPharmacy.usuario_actual || 'Farmacéutico',
    }),
  });
  const data = await res.json();
  if (data.ok) {
    showToast('Receta marcada como despachada.');
    loadSysPrescriptions();
  }
}

function viewPrescriptionImage(url, code, patient) {
  document.getElementById('rx-modal-title').textContent = `Receta Médica ${code}`;
  document.getElementById('rx-modal-subtitle').textContent = `Paciente: ${patient}`;
  document.getElementById('rx-modal-img').src = url;
  const actionsEl = document.getElementById('rx-modal-actions');
  if (actionsEl) actionsEl.classList.add('hidden');
  showModal('rx-viewer-modal');
}

function renderSysTransactionsTable() {
  const tbody = document.getElementById('sys-tx-tbody');
  if (!tbody) return;
  if (!sysState.transactions.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400">No hay transacciones registradas en este periodo.</td></tr>`;
    return;
  }

  tbody.innerHTML = sysState.transactions
    .map((tx) => {
      const details = tx.items
        .map(
          (i) =>
            `<div><strong>${i.cantidad_presentacion}x ${i.presentacion}</strong> ${i.nombre_comercial} <span class="font-mono text-teal-700">(-${i.unidades_minimas_descontadas}u)</span></div>`
        )
        .join('');
      return `
        <tr class="hover:bg-slate-50">
          <td class="py-3 px-4 font-mono font-bold text-slate-800">
            #${tx.codigo_orden}
            <span class="block text-[10px] text-slate-400 font-normal">${tx.fecha_hora}</span>
          </td>
          <td class="py-3 px-4 font-bold text-slate-800">${tx.cliente_nombre}</td>
          <td class="py-3 px-4">
            <span class="px-2.5 py-1 rounded-lg bg-slate-100 font-bold text-[11px] text-slate-700">${tx.metodo_pago}</span>
          </td>
          <td class="py-3 px-4">
            <span class="px-2.5 py-1 rounded-lg ${
              tx.seguro_ars && tx.seguro_ars !== 'Sin Seguro'
                ? 'bg-sky-50 text-sky-800 border border-sky-200 font-bold'
                : 'text-slate-400'
            } text-[11px]">
              ${tx.seguro_ars || 'Sin Seguro'}
            </span>
          </td>
          <td class="py-3 px-4 text-[11px]">${details}</td>
          <td class="py-3 px-4 text-right font-extrabold text-slate-900">${formatRD(tx.total)}</td>
          <td class="py-3 px-4 text-center">
            <button onclick="openReceiptById(${tx.id})" class="px-2.5 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-[11px]">
              🧾 Recibo
            </button>
          </td>
        </tr>
      `;
    })
    .join('');
}

/* =========================================================================
   2. INVENTARIO DE MEDICAMENTOS (Screenshots 4 y 5)
   ========================================================================= */

function handleInventorySearch() {
  const inp = document.getElementById('inv-search-input');
  sysState.inventorySearchQuery = inp ? inp.value.trim().toLowerCase() : '';
  renderInventoryTable();
}

sysState.inventorySubView = 'manage';

function openFullInventorySection(subView = 'manage') {
  switchSysTab('inventario');
  setInventoryFilterPill('TODOS');
  switchInventorySubView(subView);
}

function switchInventorySubView(mode) {
  sysState.inventorySubView = mode || 'manage';
  const manageDiv = document.getElementById('inv-subview-manage');
  const sheetDiv = document.getElementById('inv-subview-sheet');
  const btnManage = document.getElementById('inv-subtab-btn-manage');
  const btnSheet = document.getElementById('inv-subtab-btn-sheet');

  if (sysState.inventorySubView === 'sheet') {
    manageDiv?.classList.add('hidden');
    sheetDiv?.classList.remove('hidden');
    if (btnSheet) {
      btnSheet.className =
        'px-4 py-2 rounded-xl text-xs font-extrabold transition bg-slate-900 text-white shadow cursor-pointer flex items-center gap-2';
    }
    if (btnManage) {
      btnManage.className =
        'px-4 py-2 rounded-xl text-xs font-bold transition text-slate-700 hover:text-slate-900 bg-white/60 hover:bg-white cursor-pointer flex items-center gap-2';
    }
    renderPrintableInventorySheetPreview();
  } else {
    sheetDiv?.classList.add('hidden');
    manageDiv?.classList.remove('hidden');
    if (btnManage) {
      btnManage.className =
        'px-4 py-2 rounded-xl text-xs font-extrabold transition bg-slate-900 text-white shadow cursor-pointer flex items-center gap-2';
    }
    if (btnSheet) {
      btnSheet.className =
        'px-4 py-2 rounded-xl text-xs font-bold transition text-slate-700 hover:text-slate-900 bg-white/60 hover:bg-white cursor-pointer flex items-center gap-2';
    }
  }
}

function setInventoryFilterPill(pill) {
  sysState.inventoryFilterPill = pill;
  const pills = ['TODOS', 'MERCANCIA', 'MEDICAMENTOS', 'POR_VENCER', 'VENCIDOS', 'STOCK_BAJO', 'SIN_SALIDA'];
  pills.forEach((p) => {
    const el = document.getElementById(`inv-pill-${p}`);
    if (el) {
      if (p === pill) {
        el.className =
          'px-4 py-2 rounded-2xl text-xs font-extrabold transition bg-slate-900 text-white shadow cursor-pointer';
      } else {
        const borderCls =
          p === 'MERCANCIA'
            ? 'bg-teal-50 text-teal-900 border border-teal-300'
            : p === 'MEDICAMENTOS'
            ? 'bg-sky-50 text-sky-900 border border-sky-300'
            : p === 'POR_VENCER'
            ? 'bg-amber-50 text-amber-800 border border-amber-300'
            : p === 'VENCIDOS'
            ? 'bg-rose-50 text-rose-800 border border-rose-300'
            : p === 'STOCK_BAJO'
            ? 'bg-orange-50 text-orange-800 border border-orange-300'
            : p === 'SIN_SALIDA'
            ? 'bg-amber-50 text-amber-900 border border-amber-400 font-extrabold'
            : 'bg-white text-slate-700 border border-slate-300';
        el.className = `px-4 py-2 rounded-2xl text-xs font-bold transition hover:opacity-90 cursor-pointer ${borderCls}`;
      }
    }
  });
  renderInventoryTable();
}

function isProductMerchandise(p) {
  return !!(
    p.es_mercancia ||
    p.unidades_por_blister <= 1 ||
    ['Cuidado Personal', 'Limas y Manicura', 'Higiene y Belleza'].includes(p.categoria)
  );
}

function getFilteredInventoryProducts() {
  const prods = sysState.products || [];
  let list = [...prods];

  const q = sysState.inventorySearchQuery;
  if (q) {
    list = list.filter(
      (p) =>
        (p.nombre_comercial && p.nombre_comercial.toLowerCase().includes(q)) ||
        (p.principio_activo && p.principio_activo.toLowerCase().includes(q)) ||
        (p.categoria && p.categoria.toLowerCase().includes(q)) ||
        (p.codigo_barras && p.codigo_barras.toLowerCase().includes(q)) ||
        (p.ubicacion_anaquel && p.ubicacion_anaquel.toLowerCase().includes(q)) ||
        (p.lote && p.lote.toLowerCase().includes(q))
    );
  }

  const catSelect = document.getElementById('inv-category-filter');
  const selectedCat = catSelect ? catSelect.value : 'TODAS';
  if (selectedCat && selectedCat !== 'TODAS') {
    list = list.filter((p) => p.categoria === selectedCat);
  }

  if (sysState.inventoryFilterPill === 'MERCANCIA') {
    list = list.filter((p) => isProductMerchandise(p));
  } else if (sysState.inventoryFilterPill === 'MEDICAMENTOS') {
    list = list.filter((p) => !isProductMerchandise(p));
  } else if (sysState.inventoryFilterPill === 'POR_VENCER') {
    list = list.filter((p) =>
      ['CRITICO_30D', 'PREVENTIVO_90D'].includes(p.vencimiento.estado_vencimiento)
    );
  } else if (sysState.inventoryFilterPill === 'VENCIDOS') {
    list = list.filter((p) => p.vencimiento.estado_vencimiento === 'VENCIDO');
  } else if (sysState.inventoryFilterPill === 'STOCK_BAJO') {
    list = list.filter((p) => p.inventario.alerta_stock_bajo);
  } else if (sysState.inventoryFilterPill === 'SIN_SALIDA') {
    list = list.filter((p) => p.rotacion && p.rotacion.alerta_poca_salida);
  }

  const sortSelect = document.getElementById('inv-sort-filter');
  const sortMode = sortSelect ? sortSelect.value : 'NOMBRE_ASC';

  list.sort((a, b) => {
    const stockA = a.inventario ? a.inventario.stock_total_unidades : 0;
    const stockB = b.inventario ? b.inventario.stock_total_unidades : 0;
    const valA = stockA * (a.precio_base || 0);
    const valB = stockB * (b.precio_base || 0);
    if (sortMode === 'STOCK_DESC') return stockB - stockA;
    if (sortMode === 'STOCK_ASC') return stockA - stockB;
    if (sortMode === 'VALOR_DESC') return valB - valA;
    if (sortMode === 'ANAQUEL_ASC') {
      return (a.ubicacion_anaquel || '').localeCompare(b.ubicacion_anaquel || '');
    }
    if (sortMode === 'VENCE_ASC') {
      return (a.fecha_vencimiento || '').localeCompare(b.fecha_vencimiento || '');
    }
    return (a.nombre_comercial || '').localeCompare(b.nombre_comercial || '');
  });

  return list;
}

function renderInventoryTable() {
  const tbody = document.getElementById('inventory-tbody');
  if (!tbody) return;

  const prods = sysState.products || [];
  const todosCnt = prods.length;
  const mercanciaCnt = prods.filter((p) => isProductMerchandise(p)).length;
  const medicamentosCnt = prods.filter((p) => !isProductMerchandise(p)).length;
  const porVencerCnt = prods.filter((p) =>
    ['CRITICO_30D', 'PREVENTIVO_90D'].includes(p.vencimiento.estado_vencimiento)
  ).length;
  const vencidosCnt = prods.filter((p) => p.vencimiento.estado_vencimiento === 'VENCIDO').length;
  const stockBajoCnt = prods.filter((p) => p.inventario.alerta_stock_bajo).length;
  const sinSalidaCnt = prods.filter((p) => p.rotacion && p.rotacion.alerta_poca_salida).length;

  let globalUnits = 0;
  let globalBoxes = 0;
  let globalValue = 0;
  prods.forEach((p) => {
    const u = p.inventario ? p.inventario.stock_total_unidades : 0;
    const c = p.inventario ? p.inventario.cajas_disponibles : 0;
    globalUnits += u;
    globalBoxes += c;
    globalValue += u * (p.precio_base || 0);
  });

  // Update Top KPI Cards
  const kpiTotalItems = document.getElementById('inv-kpi-total-items');
  if (kpiTotalItems) kpiTotalItems.textContent = `${todosCnt} artículos`;
  const kpiSplit = document.getElementById('inv-kpi-split-types');
  if (kpiSplit) kpiSplit.textContent = `${medicamentosCnt} Medicamentos • ${mercanciaCnt} Mercancías`;
  const kpiTotalUnits = document.getElementById('inv-kpi-total-units');
  if (kpiTotalUnits) kpiTotalUnits.textContent = `${globalUnits.toLocaleString('es-DO')} unid.`;
  const kpiBoxes = document.getElementById('inv-kpi-boxes-equiv');
  if (kpiBoxes) kpiBoxes.textContent = `Equiv. a ${globalBoxes.toLocaleString('es-DO')} cajas cerradas`;
  const kpiTotalVal = document.getElementById('inv-kpi-total-value');
  if (kpiTotalVal) kpiTotalVal.textContent = formatRD(globalValue);
  const kpiAlerts = document.getElementById('inv-kpi-alerts-summary');
  if (kpiAlerts) kpiAlerts.textContent = `${stockBajoCnt} Stock Bajo • ${porVencerCnt} Por Vencer`;
  const kpiExp = document.getElementById('inv-kpi-expired-summary');
  if (kpiExp) kpiExp.textContent = `${vencidosCnt} Lotes vencidos`;

  // Populate category filter options dynamically
  const catSelect = document.getElementById('inv-category-filter');
  if (catSelect) {
    const prevCat = catSelect.value || 'TODAS';
    const uniqueCats = Array.from(new Set(prods.map((p) => p.categoria).filter(Boolean))).sort();
    catSelect.innerHTML =
      `<option value="TODAS">📂 Todas las Categorías (${uniqueCats.length})</option>` +
      uniqueCats
        .map((c) => `<option value="${c}" ${c === prevCat ? 'selected' : ''}>${c}</option>`)
        .join('');
  }

  // Update Pill Badges
  const elTodos = document.getElementById('cnt-inv-todos');
  if (elTodos) elTodos.textContent = todosCnt;
  const elMerch = document.getElementById('cnt-inv-mercancia');
  if (elMerch) elMerch.textContent = mercanciaCnt;
  const elMed = document.getElementById('cnt-inv-medicamentos');
  if (elMed) elMed.textContent = medicamentosCnt;
  const elPorVenc = document.getElementById('cnt-inv-por-vencer');
  if (elPorVenc) elPorVenc.textContent = porVencerCnt;
  const elVenc = document.getElementById('cnt-inv-vencidos');
  if (elVenc) elVenc.textContent = vencidosCnt;
  const elBajo = document.getElementById('cnt-inv-stock-bajo');
  if (elBajo) elBajo.textContent = stockBajoCnt;
  const elSinSalida = document.getElementById('cnt-inv-sin-salida');
  if (elSinSalida) elSinSalida.textContent = sinSalidaCnt;

  const list = getFilteredInventoryProducts();
  const showingCounter = document.getElementById('inv-showing-counter');
  if (showingCounter) {
    showingCounter.textContent = `Mostrando ${list.length} de ${todosCnt} artículos registrados`;
  }

  const tfoot = document.getElementById('inventory-tfoot');

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="py-10 text-center text-slate-400 font-semibold">No se encontraron artículos con los filtros aplicados.</td></tr>`;
    if (tfoot) tfoot.innerHTML = '';
    renderPrintableInventorySheetPreview();
    return;
  }

  let filteredUnits = 0;
  let filteredVal = 0;

  tbody.innerHTML = list
    .map((p, idx) => {
      const inv = p.inventario;
      const v = p.vencimiento;
      const isMerch = isProductMerchandise(p);
      const lineValue = (inv.stock_total_unidades || 0) * (p.precio_base || 0);
      filteredUnits += inv.stock_total_unidades || 0;
      filteredVal += lineValue;

      const expBadge =
        v.estado_vencimiento === 'VENCIDO'
          ? `<span class="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-extrabold text-[10px]">🔴 Vencido (${v.fecha_vencimiento})</span>`
          : v.estado_vencimiento === 'CRITICO_30D'
          ? `<span class="px-2.5 py-1 rounded-full bg-orange-100 text-orange-800 font-extrabold text-[10px]">🟠 ${v.dias_para_vencer}d (${v.fecha_vencimiento})</span>`
          : v.estado_vencimiento === 'PREVENTIVO_90D'
          ? `<span class="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 font-bold text-[10px]">🟡 ${v.dias_para_vencer}d (${v.fecha_vencimiento})</span>`
          : `<span class="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 font-semibold text-[10px]">🟢 Vigente (${v.fecha_vencimiento})</span>`;

      return `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-b-0">
          <td class="py-3 px-2.5 text-center font-mono font-bold text-slate-400">${idx + 1}</td>
          <td class="py-3 px-3">
            <div class="flex items-center gap-1.5 mb-0.5">
              <span class="px-2 py-0.5 rounded text-[9px] font-extrabold ${
                isMerch ? 'bg-teal-100 text-teal-800' : 'bg-sky-100 text-sky-800'
              }">${isMerch ? '🧴 Mercancía' : '💊 Medicamento'}</span>
              <p class="font-extrabold text-slate-900">${p.nombre_comercial}</p>
            </div>
            <p class="text-[11px] text-teal-700 font-medium">${p.principio_activo}${
              p.concentracion ? ' • ' + p.concentracion : ''
            }</p>
            <p class="text-[10px] text-slate-400 font-mono">${
              p.laboratorio ? p.laboratorio + ' • ' : ''
            }Código: ${p.codigo_barras}</p>
          </td>
          <td class="py-3 px-3">
            <span class="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-bold text-[10px] block w-fit mb-1">${
              p.categoria
            }</span>
            <span class="text-[11px] font-mono text-slate-600">📍 Anaquel: <strong class="text-slate-900">${
              p.ubicacion_anaquel || 'A-01'
            }</strong></span>
          </td>
          <td class="py-3 px-3 text-center bg-teal-50/30">
            ${
              isMerch
                ? `
              <div class="font-mono font-bold text-xs sm:text-sm">
                <span class="text-teal-900 font-extrabold">${inv.stock_total_unidades} unidades</span>
                ${
                  inv.cajas_disponibles > 0
                    ? `<span class="text-slate-600 text-xs font-semibold"> (${inv.cajas_disponibles} cj de ${inv.unidades_por_caja}u)</span>`
                    : ''
                }
              </div>
              <p class="text-[10px] text-slate-400 font-medium mt-0.5">Conteo por unidad / pieza</p>
            `
                : `
              <div class="font-mono font-bold text-xs sm:text-sm">
                <span class="text-teal-900 font-extrabold">${inv.stock_total_unidades}u</span> /
                <span class="text-sky-800">${inv.blisters_disponibles}bl</span> /
                <span class="text-slate-700">${inv.cajas_disponibles}cj</span>
              </div>
              <p class="text-[10px] text-slate-400 font-medium mt-0.5">${inv.desglose_fisico.texto}</p>
            `
            }
            ${
              inv.alerta_stock_bajo
                ? `<span class="mt-1 inline-block px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 font-extrabold text-[9px]">⚠️ Stock bajo</span>`
                : ''
            }
          </td>
          <td class="py-3 px-3">
            <p class="font-mono text-[11px] font-bold text-slate-700 mb-1">Lote: ${p.lote}</p>
            <div>${expBadge}</div>
          </td>
          <td class="py-3 px-3 text-right font-extrabold text-slate-900 text-sm">
            ${formatRD(p.precio_base)}
            <p class="text-[10px] text-slate-400 font-normal">por ${
              p.unidad_minima_nombre || 'unidad'
            }</p>
          </td>
          <td class="py-3 px-3 text-right font-mono font-black text-emerald-800 bg-emerald-50/30 text-sm">
            ${formatRD(lineValue)}
            <p class="text-[9px] text-slate-400 font-sans font-normal">${inv.stock_total_unidades}u × ${formatRD(p.precio_base)}</p>
          </td>
          <td class="py-3 px-3 text-center no-print">
            <div class="inline-flex items-center gap-1">
              <button
                onclick="openReplenishModal(${p.id})"
                title="Entrada de compra / Sumar stock o fijar valor real"
                class="w-7 h-7 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs flex items-center justify-center shadow-xs cursor-pointer"
              >
                +
              </button>
              <button
                onclick="openAdjustStockModal(${p.id})"
                title="Ajustar / Corregir stock físico (errores de conteo o merma)"
                class="w-7 h-7 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold text-xs flex items-center justify-center cursor-pointer"
              >
                ⚖️
              </button>
              <button
                onclick="openProductMovementsModal(${p.id})"
                title="Historial de movimientos (Kárdex)"
                class="w-7 h-7 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 font-bold text-xs flex items-center justify-center cursor-pointer"
              >
                🕒
              </button>
              <button
                onclick="openEditProductModal(${p.id})"
                title="Editar producto, precio, ubicación, lote y vencimiento"
                class="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-xs flex items-center justify-center cursor-pointer"
              >
                ✏️
              </button>
              <button
                onclick="confirmDeleteProduct(${p.id})"
                title="Eliminar producto"
                class="w-7 h-7 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold text-xs flex items-center justify-center cursor-pointer"
              >
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td colspan="3" class="py-3.5 px-4 text-right uppercase tracking-wider text-[11px] text-slate-300">
          TOTALES DEL INVENTARIO LISTADO (${list.length} artículos):
        </td>
        <td class="py-3.5 px-3 text-center font-mono text-sm text-teal-300 font-black">
          ${filteredUnits.toLocaleString('es-DO')} unidades
        </td>
        <td colspan="2" class="py-3.5 px-3 text-right uppercase text-[10px] text-slate-400">
          Valuación Total en Stock:
        </td>
        <td class="py-3.5 px-3 text-right font-mono text-sm text-emerald-400 font-black">
          ${formatRD(filteredVal)}
        </td>
        <td class="no-print"></td>
      </tr>
    `;
  }

  renderPrintableInventorySheetPreview();
}

function openEditProductModal(productId) {
  const p = sysState.products.find((x) => x.id === productId);
  if (!p) return;
  document.getElementById('edit-prod-id').value = p.id;
  document.getElementById('edit-prod-name').value = p.nombre_comercial;
  document.getElementById('edit-prod-active').value = p.principio_activo;
  document.getElementById('edit-prod-conc').value = p.concentracion;
  document.getElementById('edit-prod-lab').value = p.laboratorio;
  document.getElementById('edit-prod-shelf').value = p.ubicacion_anaquel;
  document.getElementById('edit-prod-cat').value = p.categoria;
  document.getElementById('edit-prod-price').value = p.precio_base;
  document.getElementById('edit-prod-u-blister').value = p.unidades_por_blister;
  document.getElementById('edit-prod-b-caja').value = p.blisters_por_caja;
  document.getElementById('edit-prod-min-stock').value = p.stock_minimo_alerta;
  document.getElementById('edit-prod-lote').value = p.lote;
  document.getElementById('edit-prod-expiry').value = p.fecha_vencimiento;
  document.getElementById('edit-prod-rx').checked = !!p.requiere_receta;

  const realStockInp = document.getElementById('edit-prod-real-stock');
  if (realStockInp) realStockInp.value = p.inventario.stock_total_unidades;
  const realCostInp = document.getElementById('edit-prod-real-cost');
  if (realCostInp) realCostInp.value = (p.precio_base * 0.7).toFixed(2);
  const auditReasonInp = document.getElementById('edit-prod-audit-reason');
  if (auditReasonInp) auditReasonInp.value = 'Corrección por error de digitación / Ajuste de valor real';

  document.getElementById('edit-product-modal').classList.remove('hidden');
  document.getElementById('edit-product-modal').classList.add('flex');
}
function _old_openEditProductModal(productId) {
  const p = sysState.products.find((prod) => prod.id === productId);
  if (!p) return;
  document.getElementById('edit-prod-id').value = p.id;
  document.getElementById('edit-prod-name').value = p.nombre_comercial;
  document.getElementById('edit-prod-active').value = p.principio_activo;
  document.getElementById('edit-prod-conc').value = p.concentracion || '';
  document.getElementById('edit-prod-lab').value = p.laboratorio || '';
  document.getElementById('edit-prod-shelf').value = p.ubicacion_anaquel || '';
  document.getElementById('edit-prod-cat').value = p.categoria;
  document.getElementById('edit-prod-price').value = p.precio_base;
  document.getElementById('edit-prod-u-blister').value = p.unidades_por_blister;
  document.getElementById('edit-prod-b-caja').value = p.blisters_por_caja;
  document.getElementById('edit-prod-min-stock').value = p.stock_minimo_alerta;
  document.getElementById('edit-prod-lote').value = p.lote;
  document.getElementById('edit-prod-expiry').value = p.fecha_vencimiento;
  document.getElementById('edit-prod-rx').checked = !!p.requiere_receta;
  showModal('edit-product-modal');
}

function closeEditProductModal() {
  hideModal('edit-product-modal');
}

function openAdjustStockModal(productId) {
  const p = sysState.products.find((prod) => prod.id === productId);
  if (!p) return;
  document.getElementById('adj-prod-id').value = p.id;
  document.getElementById('adj-prod-name').textContent = p.nombre_comercial;
  document.getElementById('adj-prod-sub').textContent = `${p.principio_activo} • ${p.categoria} • Lote: ${p.lote}`;
  document.getElementById('adj-current-stock-badge').textContent = `${p.inventario.stock_total_unidades} unid. mínimas`;
  document.getElementById('adj-current-breakdown').textContent = `Equivalente actual: ${p.inventario.desglose_fisico.texto} (${p.inventario.cajas_disponibles} Cajas, ${p.inventario.blisters_disponibles} Blísteres)`;
  document.getElementById('adj-new-units').value = p.inventario.stock_total_unidades;
  document.getElementById('adj-reason-select').value = 'Conteo físico / Cuadratura periódica';
  document.getElementById('adj-reason-custom').value = '';
  document.getElementById('adj-reason-custom').classList.add('hidden');
  showModal('adjust-stock-modal');
}

function closeAdjustStockModal() {
  hideModal('adjust-stock-modal');
}

function handleAdjustReasonChange() {
  const sel = document.getElementById('adj-reason-select').value;
  const custom = document.getElementById('adj-reason-custom');
  if (sel === 'OTRO') {
    custom.classList.remove('hidden');
    custom.focus();
  } else {
    custom.classList.add('hidden');
  }
}

async function submitAdjustStock(event) {
  event.preventDefault();
  const prodId = parseInt(document.getElementById('adj-prod-id').value, 10);
  const newUnits = parseInt(document.getElementById('adj-new-units').value, 10);
  if (isNaN(newUnits) || newUnits < 0) {
    showToast('Ingresa una cantidad de stock válida (mayor o igual a 0).', 'error');
    return;
  }

  let motivo = document.getElementById('adj-reason-select').value;
  if (motivo === 'OTRO') {
    motivo = document.getElementById('adj-reason-custom').value.trim() || 'Ajuste manual sin especificar';
  }

  const user = sysState.authenticatedPharmacy
    ? `${sysState.authenticatedPharmacy.usuario_actual || sysState.authenticatedPharmacy.usuario_admin} (${sysState.authenticatedPharmacy.rol_actual || 'ADMIN'})`
    : 'Farmacéutico';

  try {
    const res = await fetch('/api/inventory/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: sysState.authenticatedPharmacy.id,
        producto_id: prodId,
        nuevo_stock_unidades: newUnits,
        motivo: motivo,
        usuario: user,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      showToast(data.error || 'No se pudo ajustar el stock.', 'error');
      return;
    }

    closeAdjustStockModal();
    showToast(`Stock corregido a ${newUnits} unidades mínimas.`);
    await loadSysProducts(sysState.authenticatedPharmacy.id);
  } catch (err) {
    showToast('Error de conexión al ajustar stock.', 'error');
  }
}

async function submitEditProduct(event) {
  event.preventDefault();
  const prodId = parseInt(document.getElementById('edit-prod-id').value, 10);
  const realStockVal = parseInt(document.getElementById('edit-prod-real-stock').value, 10);
  const auditReason = document.getElementById('edit-prod-audit-reason').value.trim();
  const usuarioActual = sysState.authenticatedPharmacy ? (sysState.authenticatedPharmacy.usuario_actual || sysState.authenticatedPharmacy.usuario_admin) : 'Administrador';

  const payload = {
    farmacia_id: sysState.authenticatedPharmacy.id,
    producto_id: prodId,
    nombre_comercial: document.getElementById('edit-prod-name').value.trim(),
    principio_activo: document.getElementById('edit-prod-active').value.trim(),
    concentracion: document.getElementById('edit-prod-conc').value.trim(),
    laboratorio: document.getElementById('edit-prod-lab').value.trim(),
    ubicacion_anaquel: document.getElementById('edit-prod-shelf').value.trim(),
    categoria: document.getElementById('edit-prod-cat').value.trim(),
    precio_base: parseFloat(document.getElementById('edit-prod-price').value),
    stock_total_unidades: isNaN(realStockVal) ? 0 : realStockVal,
    unidades_por_blister: parseInt(document.getElementById('edit-prod-u-blister').value, 10),
    blisters_por_caja: parseInt(document.getElementById('edit-prod-b-caja').value, 10),
    stock_minimo_alerta: parseInt(document.getElementById('edit-prod-min-stock').value, 10),
    lote: document.getElementById('edit-prod-lote').value.trim(),
    fecha_vencimiento: document.getElementById('edit-prod-expiry').value,
    requiere_receta: document.getElementById('edit-prod-rx').checked,
    usuario: usuarioActual,
    motivo: auditReason || 'Corrección de error de digitación',
  };

  const res = await fetch('/api/products/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (data.ok) {
    showToast('Producto y valor real corregidos. Registro de auditoría guardado con éxito.', 'success');
    closeEditProductModal();
    await refreshPharmacyWorkspace();
  } else {
    showToast(data.error || 'Error al actualizar medicamento.', 'error');
  }
}
async function _old_submitEditProduct(event) {
  event.preventDefault();
  const prodId = parseInt(document.getElementById('edit-prod-id').value, 10);
  const payload = {
    farmacia_id: sysState.authenticatedPharmacy.id,
    producto_id: prodId,
    nombre_comercial: document.getElementById('edit-prod-name').value.trim(),
    principio_activo: document.getElementById('edit-prod-active').value.trim(),
    concentracion: document.getElementById('edit-prod-conc').value.trim(),
    laboratorio: document.getElementById('edit-prod-lab').value.trim(),
    ubicacion_anaquel: document.getElementById('edit-prod-shelf').value.trim(),
    categoria: document.getElementById('edit-prod-cat').value.trim(),
    precio_base: parseFloat(document.getElementById('edit-prod-price').value),
    unidades_por_blister: parseInt(document.getElementById('edit-prod-u-blister').value, 10),
    blisters_por_caja: parseInt(document.getElementById('edit-prod-b-caja').value, 10),
    stock_minimo_alerta: parseInt(document.getElementById('edit-prod-min-stock').value, 10),
    lote: document.getElementById('edit-prod-lote').value.trim(),
    fecha_vencimiento: document.getElementById('edit-prod-expiry').value,
    requiere_receta: document.getElementById('edit-prod-rx').checked,
  };

  const res = await fetch('/api/products/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) {
    showToast(data.error || 'Error al actualizar producto.', 'error');
    return;
  }

  closeEditProductModal();
  showToast(`Producto '${data.product.nombre_comercial}' actualizado.`);
  await refreshPharmacyWorkspace();
}

async function openProductMovementsModal(productId) {
  const p = sysState.products.find((prod) => prod.id === productId);
  if (!p) return;
  document.getElementById('mov-modal-product-title').textContent = `Kárdex — ${p.nombre_comercial} (Stock actual: ${p.inventario.stock_total_unidades} unid.)`;
  const tbody = document.getElementById('mov-modal-tbody');
  tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-400">Cargando movimientos...</td></tr>`;
  showModal('product-movements-modal');

  const res = await fetch(`/api/products/movements?farmacia_id=${sysState.authenticatedPharmacy.id}&producto_id=${productId}`);
  const data = await res.json();
  if (!data.ok || !data.movements.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-400">No hay movimientos registrados para este medicamento.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.movements.map((m) => {
    const isPositive = m.cambio_unidades_minimas > 0;
    return `
      <tr class="hover:bg-slate-50 border-b border-slate-100 last:border-b-0">
        <td class="py-2.5 px-3 font-mono text-slate-500">${m.fecha_hora}</td>
        <td class="py-2.5 px-3 font-bold text-slate-800">${m.tipo_movimiento}</td>
        <td class="py-2.5 px-3">${m.cantidad_presentacion}x ${m.presentacion_operada}</td>
        <td class="py-2.5 px-3 text-center font-mono font-extrabold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}">
          ${isPositive ? `+${m.cambio_unidades_minimas}` : m.cambio_unidades_minimas}
        </td>
        <td class="py-2.5 px-3 text-right font-mono font-bold text-slate-900">${m.stock_resultante} unid.</td>
        <td class="py-2.5 px-3 text-slate-500">${m.usuario || m.referencia_orden || 'Sistema'}</td>
      </tr>
    `;
  }).join('');
}

function closeProductMovementsModal() {
  hideModal('product-movements-modal');
}

async function confirmDeleteProduct(productId) {
  const p = sysState.products.find((prod) => prod.id === productId);
  if (!p) return;
  const ok = window.confirm(`⚠️ ¿Estás seguro de eliminar "${p.nombre_comercial}" del inventario de esta farmacia?`);
  if (!ok) return;

  const res = await fetch('/api/products/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      farmacia_id: sysState.authenticatedPharmacy.id,
      producto_id: productId,
    }),
  });
  const data = await res.json();
  if (data.ok) {
    showToast(`Medicamento '${p.nombre_comercial}' eliminado del catálogo.`);
    await refreshPharmacyWorkspace();
  } else {
    showToast(data.error || 'No se pudo eliminar el medicamento.', 'error');
  }
}

function setExpiryFilter(filterVal) {
  sysState.expiryFilter = filterVal;
  const sel = document.getElementById('expiry-filter-select');
  if (sel) sel.value = filterVal;
  renderExpiryTable();
}

function renderExpiryTable() {
  const tbody = document.getElementById('expiry-tbody');
  if (!tbody) return;

  let list = [...sysState.products].sort(
    (a, b) => a.vencimiento.dias_para_vencer - b.vencimiento.dias_para_vencer
  );

  if (sysState.expiryFilter === 'ALERTA_7_MESES') {
    list = list.filter((p) => p.vencimiento.es_menor_7_meses);
  } else if (sysState.expiryFilter === 'ALERTAS') {
    list = list.filter((p) => p.vencimiento.alerta_vencimiento);
  } else if (sysState.expiryFilter !== 'TODOS') {
    list = list.filter((p) => p.vencimiento.estado_vencimiento === sysState.expiryFilter);
  }

  tbody.innerHTML = list
    .map((p) => {
      const v = p.vencimiento;
      const valorRiesgo = p.inventario.stock_total_unidades * p.precio_base;
      let badge = '';
      if (v.estado_vencimiento === 'VENCIDO') {
        badge = `<span class="px-2.5 py-1 rounded-full bg-rose-600 text-white font-extrabold text-[10px]">🔴 VENCIDO — BLOQUEADO</span>`;
      } else if (v.estado_vencimiento === 'CRITICO_30D') {
        badge = `<span class="px-2.5 py-1 rounded-full bg-orange-500 text-white font-extrabold text-[10px]">🟠 CRÍTICO ≤ 30 DÍAS</span>`;
      } else if (v.estado_vencimiento === 'PREVENTIVO_90D') {
        badge = `<span class="px-2.5 py-1 rounded-full bg-amber-400 text-slate-950 font-extrabold text-[10px]">🟡 PREVENTIVO ≤ 90 DÍAS</span>`;
      } else if (v.estado_vencimiento === 'ALERTA_7_MESES') {
        badge = `<span class="px-2.5 py-1 rounded-full bg-amber-500 text-white font-extrabold text-[10px]">⚠️ ALERTA ≤ 7 MESES</span>`;
      } else {
        badge = `<span class="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">🟢 VIGENTE</span>`;
      }

      return `
        <tr class="${v.vencido ? 'bg-rose-50/60' : v.estado_vencimiento === 'CRITICO_30D' ? 'bg-orange-50/40' : ''}">
          <td class="py-3 px-3">${badge}</td>
          <td class="py-3 px-3">
            <p class="font-extrabold text-slate-900">${p.nombre_comercial}</p>
            <p class="text-[11px] text-slate-500">${p.principio_activo} • Anaquel ${p.ubicacion_anaquel}</p>
          </td>
          <td class="py-3 px-3 font-mono font-bold text-slate-800">${p.lote}</td>
          <td class="py-3 px-3 font-mono font-bold">${v.fecha_vencimiento}</td>
          <td class="py-3 px-3 text-center font-mono font-extrabold ${v.vencido ? 'text-rose-700' : 'text-slate-800'}">
            ${v.etiqueta_vencimiento}
          </td>
          <td class="py-3 px-3 text-center font-bold">${p.inventario.stock_total_unidades} ${p.unidad_minima_nombre}s</td>
          <td class="py-3 px-3 text-right font-extrabold text-slate-900">${formatRD(valorRiesgo)}</td>
          <td class="py-3 px-3 text-center">
            <button onclick="openReplenishModal(${p.id})" class="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-[11px]">
              🔄 Renovar Lote
            </button>
          </td>
        </tr>
      `;
    })
    .join('');
}

/* =========================================================================
   4. DEUDORES / CUENTAS POR COBRAR
   ========================================================================= */

async function loadSysDebtors(fid) {
  const id = fid || sysState.authenticatedPharmacy.id;
  const res = await fetch(`/api/debtors?farmacia_id=${id}`);
  const data = await res.json();
  if (!data.ok) return;
  sysState.debtors = data.debtors;
  renderDebtorsTable();
}

function handleDebtorsSearch() {
  const inp = document.getElementById('debtor-search-input');
  sysState.debtorsSearchQuery = inp ? inp.value.trim().toLowerCase() : '';
  renderDebtorsTable();
}

function setDebtorsFilter(filter) {
  sysState.debtorsFilter = filter;
  ['TODOS', 'PENDIENTES'].forEach((f) => {
    const el = document.getElementById(`deb-pill-${f}`);
    if (el) {
      if (f === filter) {
        el.className = 'px-4 py-2 rounded-2xl text-xs font-extrabold transition bg-slate-900 text-white shadow';
      } else {
        el.className = 'px-4 py-2 rounded-2xl text-xs font-bold transition bg-white text-slate-700 border border-slate-300 hover:bg-slate-50';
      }
    }
  });
  renderDebtorsTable();
}

function renderDebtorsTable() {
  const tbody = document.getElementById('debtors-tbody');
  if (!tbody) return;

  const allDebtors = sysState.debtors || [];
  const pendList = allDebtors.filter((d) => d.estado === 'PENDIENTE');
  const pagList = allDebtors.filter((d) => d.estado === 'PAGADO');
  const totalDeuda = pendList.reduce((acc, d) => acc + Number(d.saldo_pendiente_rd || 0), 0);

  // 3 KPI Cards de Deudores (Exacto a Screenshot 1)
  const elTot = document.getElementById('deb-kpi-total');
  if (elTot) elTot.textContent = formatRD(totalDeuda);
  const elPend = document.getElementById('deb-kpi-pendientes');
  if (elPend) elPend.textContent = pendList.length;
  const elPag = document.getElementById('deb-kpi-pagados');
  if (elPag) elPag.textContent = pagList.length;

  // Actualizar píldoras de conteo
  const bTodos = document.getElementById('cnt-deb-todos');
  if (bTodos) bTodos.textContent = allDebtors.length;
  const bPend = document.getElementById('cnt-deb-pendientes');
  if (bPend) bPend.textContent = pendList.length;

  // Actualizar badges de navegación
  const bNav = document.getElementById('badge-sys-debtors');
  if (bNav) {
    if (pendList.length > 0) {
      bNav.textContent = pendList.length;
      bNav.classList.remove('hidden');
    } else bNav.classList.add('hidden');
  }
  const bMob = document.getElementById('badge-mobile-debtors');
  if (bMob) {
    if (pendList.length > 0) {
      bMob.textContent = pendList.length;
      bMob.classList.remove('hidden');
    } else bMob.classList.add('hidden');
  }

  let list = allDebtors;
  const q = sysState.debtorsSearchQuery;
  if (q) {
    list = list.filter((d) =>
      d.cliente_nombre.toLowerCase().includes(q) ||
      (d.cedula || '').toLowerCase().includes(q) ||
      d.concepto.toLowerCase().includes(q)
    );
  }

  if (sysState.debtorsFilter === 'PENDIENTES') {
    list = list.filter((d) => d.estado === 'PENDIENTE');
  }

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400 font-semibold">No se encontraron deudores registrados con estos filtros.</td></tr>`;
    return;
  }

  tbody.innerHTML = list
    .map((d) => {
      const isPending = d.estado === 'PENDIENTE';
      const cleanPhone = (d.cliente_telefono || '').replace(/\D/g, '');
      const farmName = sysState.authenticatedPharmacy ? sysState.authenticatedPharmacy.nombre : 'Farmacia Davalsi';
      const waMsg = encodeURIComponent(`Hola ${d.cliente_nombre}, le saludamos de ${farmName}. Le recordamos amablemente su saldo pendiente de ${formatRD(d.saldo_pendiente_rd)}. ¡Muchas gracias!`);
      const waLink = cleanPhone ? `https://wa.me/${cleanPhone.startsWith('1') ? cleanPhone : '1' + cleanPhone}?text=${waMsg}` : '#';

      return `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-b-0">
          <td class="py-3 px-3">
            <p class="font-extrabold text-slate-900">${d.cliente_nombre}</p>
            <p class="text-[10px] font-mono text-slate-400">Tel: ${d.cliente_telefono || 'N/D'} ${d.cedula ? `• Céd: ${d.cedula}` : ''}</p>
          </td>
          <td class="py-3 px-3 text-slate-700 font-medium">${d.concepto}</td>
          <td class="py-3 px-3 text-right font-bold text-slate-800">${formatRD(d.monto_deuda_rd)}</td>
          <td class="py-3 px-3 text-right text-emerald-700 font-bold">${formatRD(d.monto_abonado_rd)}</td>
          <td class="py-3 px-3 text-right font-extrabold text-base ${isPending ? 'text-rose-600' : 'text-slate-400'}">
            ${formatRD(d.saldo_pendiente_rd)}
          </td>
          <td class="py-3 px-3 text-center">
            <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
              isPending ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'
            }">${d.estado}</span>
          </td>
          <td class="py-3 px-3 text-center">
            <div class="inline-flex items-center gap-1.5">
              ${cleanPhone && isPending ? `
                <button
                  type="button"
                  onclick="triggerDebtorWhatsAppCobro(${d.id})"
                  title="Enviar cobro automático por WhatsApp"
                  class="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition shadow-xs"
                >
                  <span>📲</span> <span>Cobro WhatsApp</span>
                </button>
              ` : ''}
              ${
                isPending
                  ? `<button onclick="openDebtorPayModal(${d.id}, '${d.cliente_nombre.replace(/'/g, "\\'")}', '${d.concepto.replace(/'/g, "\\'")}', ${d.saldo_pendiente_rd})" class="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-[11px] shadow-xs">
                      💵 Abonar
                    </button>`
                  : `<span class="text-[11px] text-emerald-700 font-bold">✓ Saldado</span>`
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

async function triggerDebtorWhatsAppCobro(debtorId) {
  if (!sysState.authenticatedPharmacy) return;
  const fid = sysState.authenticatedPharmacy.id;
  try {
    showToast('Enviando mensaje de cobro por WhatsApp...');
    const res = await fetch('/api/debtors/remind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmacia_id: fid, deudor_id: debtorId }),
    });
    const data = await res.json();
    if (data.ok) {
      showToast(`¡Mensaje de cobro generado para ${data.cliente_nombre}! Abriendo WhatsApp...`);
      if (data.wa_link) {
        window.open(data.wa_link, '_blank');
      }
      loadSysDashboard(fid);
      loadSysWhatsAppLogs(fid);
    } else {
      showToast(data.error || 'Error al enviar recordatorio.', 'error');
    }
  } catch (err) {
    showToast('Error de conexión al procesar cobro WhatsApp.', 'error');
  }
}

function openDebtorPayModal(debtorId, clientName, concept, balance) {
  sysState.selectedDebtorForPay = { id: debtorId, balance };
  document.getElementById('pay-deb-id').value = debtorId;
  document.getElementById('pay-deb-client-name').textContent = clientName;
  document.getElementById('pay-deb-concept').textContent = concept;
  document.getElementById('pay-deb-balance').textContent = formatRD(balance);
  document.getElementById('pay-deb-amount-input').value = balance;
  showModal('debtor-pay-modal');
}

function closeDebtorPayModal() {
  hideModal('debtor-pay-modal');
  sysState.selectedDebtorForPay = null;
}

function setQuickAbono(amount) {
  const inp = document.getElementById('pay-deb-amount-input');
  if (inp) inp.value = amount;
}

function setFullAbono() {
  if (sysState.selectedDebtorForPay) {
    const inp = document.getElementById('pay-deb-amount-input');
    if (inp) inp.value = sysState.selectedDebtorForPay.balance;
  }
}

async function submitDebtorPayment(event) {
  event.preventDefault();
  const debtorId = parseInt(document.getElementById('pay-deb-id').value, 10);
  const abono = parseFloat(document.getElementById('pay-deb-amount-input').value);
  if (isNaN(abono) || abono <= 0) return;

  const res = await fetch('/api/debtors/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      farmacia_id: sysState.authenticatedPharmacy.id,
      deudor_id: debtorId,
      abono_rd: abono,
    }),
  });
  const data = await res.json();
  if (data.ok) {
    closeDebtorPayModal();
    await refreshPharmacyWorkspace();
    showToast(`Abono de ${formatRD(abono)} registrado exitosamente.`);
  } else {
    showToast(data.error || 'Error registrando abono.', 'error');
  }
}

function openNewDebtorModal() {
  showModal('new-debtor-modal');
}

function closeNewDebtorModal() {
  hideModal('new-debtor-modal');
}

async function submitNewDebtor(event) {
  event.preventDefault();
  const res = await fetch('/api/debtors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      farmacia_id: sysState.authenticatedPharmacy.id,
      cliente_nombre: document.getElementById('deb-name').value.trim(),
      cliente_telefono: document.getElementById('deb-phone').value.trim(),
      cedula: document.getElementById('deb-cedula').value.trim(),
      concepto: document.getElementById('deb-concept').value.trim(),
      monto_deuda_rd: parseFloat(document.getElementById('deb-amount').value),
    }),
  });
  const data = await res.json();
  if (data.ok) {
    closeNewDebtorModal();
    await refreshPharmacyWorkspace();
    showToast('Deudor registrado correctamente.');
  }
}

async function promptPayDebtor(deudorId, saldoPendiente) {
  openDebtorPayModal(deudorId, 'Cliente Deudor', 'Saldo pendiente', saldoPendiente);
}

/* =========================================================================
   5. GRÁFICOS DE VENTAS DIARIAS Y MENSUALES (CHART.JS)
   ========================================================================= */

function renderSalesReportsAndCharts(m) {
  if (typeof Chart === 'undefined') return;

  const ctxDaily = document.getElementById('chart-daily-sales');
  if (ctxDaily) {
    if (sysState.charts.daily) sysState.charts.daily.destroy();
    sysState.charts.daily = new Chart(ctxDaily, {
      type: 'bar',
      data: {
        labels: m.reporte_diario.map((d) => d.etiqueta),
        datasets: [
          {
            label: 'POS Mostrador (RD$)',
            data: m.reporte_diario.map((d) => d.pos_rd),
            backgroundColor: '#0d9488',
            borderRadius: 6,
          },
          {
            label: 'App Pacientes (RD$)',
            data: m.reporte_diario.map((d) => d.app_rd),
            backgroundColor: '#38bdf8',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true },
        },
      },
    });
  }

  const ctxMonthly = document.getElementById('chart-monthly-sales');
  if (ctxMonthly) {
    if (sysState.charts.monthly) sysState.charts.monthly.destroy();
    sysState.charts.monthly = new Chart(ctxMonthly, {
      type: 'line',
      data: {
        labels: m.reporte_mensual.map((x) => x.mes),
        datasets: [
          {
            label: 'Total Mensual Facturado (RD$)',
            data: m.reporte_mensual.map((x) => x.total_rd),
            borderColor: '#4f46e5',
            backgroundColor: 'rgba(79, 70, 229, 0.15)',
            borderWidth: 3,
            fill: true,
            tension: 0.35,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true } },
      },
    });
  }
}

/* =========================================================================
   6. PERSONAL DEL SISTEMA, CONFIGURACIÓN Y VISTA PREVIA DE FACTURA
   ========================================================================= */

async function loadSysStaff(fid) {
  const id = fid || sysState.authenticatedPharmacy.id;
  const res = await fetch(`/api/staff?farmacia_id=${id}`);
  const data = await res.json();
  if (!data.ok) return;
  sysState.staff = data.staff;
  renderStaffList();
}

function renderStaffList() {
  const container = document.getElementById('staff-list-container');
  if (!container) return;

  container.innerHTML = sysState.staff
    .map((s) => {
      const isAdmin = s.rol === 'ADMINISTRADOR';
      return `
        <div class="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl ${
              isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'
            } flex items-center justify-center font-bold text-base">
              ${isAdmin ? '🛡️' : '👤'}
            </div>
            <div>
              <p class="text-sm font-extrabold text-slate-900">${s.username}</p>
              <p class="text-xs text-slate-500">${isAdmin ? 'Administrador' : `Vendedor • ${s.nombre_completo}`}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded bg-slate-200/80 font-mono text-[10px] font-bold text-slate-700">
              Clave: ${s.pista_clave || '****'}
            </span>
            ${
              !isAdmin
                ? `<button type="button" onclick="deleteSeller(${s.id})" class="text-rose-600 hover:text-rose-800 font-bold text-xs px-2">🗑️</button>`
                : ''
            }
          </div>
        </div>
      `;
    })
    .join('');
}

function openNewSellerModal() {
  showModal('new-seller-modal');
}

function closeNewSellerModal() {
  hideModal('new-seller-modal');
}

async function submitNewSeller(event) {
  event.preventDefault();
  const res = await fetch('/api/staff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      farmacia_id: sysState.authenticatedPharmacy.id,
      username: document.getElementById('seller-username').value.trim(),
      nombre_completo: document.getElementById('seller-fullname').value.trim(),
      clave_acceso: document.getElementById('seller-password').value.trim(),
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    showToast(data.error || 'Error registrando vendedor.', 'error');
    return;
  }
  closeNewSellerModal();
  document.getElementById('seller-username').value = '';
  document.getElementById('seller-fullname').value = '';
  document.getElementById('seller-password').value = '';
  await loadSysStaff();
  showToast(`Vendedor '${data.seller.username}' registrado (Rol fijo: Vendedor).`);
}

async function deleteSeller(staffId) {
  const res = await fetch('/api/staff/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      farmacia_id: sysState.authenticatedPharmacy.id,
      staff_id: staffId,
    }),
  });
  const data = await res.json();
  if (data.ok) {
    await loadSysStaff();
    showToast('Vendedor eliminado.');
  } else {
    showToast(data.error || 'No se pudo eliminar.', 'error');
  }
}

async function loadSysWhatsAppLogs(fid) {
  const id = fid || sysState.authenticatedPharmacy.id;
  const res = await fetch(`/api/whatsapp/logs?farmacia_id=${id}`);
  const data = await res.json();
  if (!data.ok) return;
  sysState.whatsappLogs = data.logs;
  const cfg = data.config || {};

  document.getElementById('cfg-name').value = cfg.nombre || '';
  document.getElementById('cfg-eslogan').value = cfg.eslogan || 'Sistema de Farmacia';
  document.getElementById('cfg-rnc').value = cfg.rnc || '';
  document.getElementById('cfg-telefono-local').value = cfg.telefono || '';
  document.getElementById('cfg-address').value = cfg.direccion || '';
  document.getElementById('cfg-sector').value = cfg.ciudad_sector || '';
  document.getElementById('cfg-bank-account').value = cfg.banco_cuenta || '';
  document.getElementById('cfg-phone').value = cfg.telefono_whatsapp || '';
  document.getElementById('cfg-wa-active').checked = cfg.wa_activo !== false;
  applyOperationalServiceFlags(cfg);
  document.getElementById('cfg-invoice-msg').value = cfg.mensaje_factura || '¡Gracias por su compra!';
  document.getElementById('cfg-wa-provider').value = cfg.wa_provider || 'META_CLOUD_API';
  document.getElementById('cfg-meta-phone-id').value = cfg.meta_phone_number_id || '';
  document.getElementById('cfg-meta-token').value = cfg.meta_access_token || '';

  // Card Farmacia Actual (UUID y nombre)
  document.getElementById('danger-pharmacy-name').textContent = cfg.nombre || 'Farmacia Principal';
  document.getElementById('danger-pharmacy-uuid').textContent = cfg.uuid_farmacia || '059accf8-1159-42d1-99f4-051f80ec3c09';

  updateInvoiceLivePreview();

  const container = document.getElementById('wa-logs-container');
  const containerFull = document.getElementById('wa-logs-container-full');
  const counterBadge = document.getElementById('wa-logs-counter-badge');

  if (counterBadge) {
    counterBadge.textContent = `${sysState.whatsappLogs.length} mensajes`;
  }

  if (!sysState.whatsappLogs.length) {
    const emptyHtml = `<div class="p-6 text-center text-xs text-slate-400">No hay despachos de WhatsApp API registrados para esta sucursal aún. Realiza un pedido desde la App de Pacientes para ver los despachos automáticos en vivo.</div>`;
    if (container) container.innerHTML = emptyHtml;
    if (containerFull) containerFull.innerHTML = emptyHtml;
    return;
  }

  const logsHtml = sysState.whatsappLogs
    .map(
      (log) => `
      <div class="rounded-xl border border-slate-200 overflow-hidden text-xs bg-white shadow-xs">
        <div class="bg-slate-900 text-white px-3 py-2 flex justify-between font-mono text-[11px]">
          <span>${log.destinatario_rol} (+${log.telefono_destino}) • #${log.codigo_orden}</span>
          <span class="text-emerald-400 font-bold">${log.proveedor_api} HTTP ${log.http_status}</span>
        </div>
        <div class="p-3 wa-chat-bg">
          <div class="wa-bubble p-3 text-[11px] font-sans leading-relaxed whitespace-pre-wrap">${log.mensaje_texto}</div>
        </div>
      </div>
    `
    )
    .join('');

  if (container) container.innerHTML = logsHtml;
  if (containerFull) containerFull.innerHTML = logsHtml;
}

function updateInvoiceLivePreview() {
  const name = document.getElementById('cfg-name')?.value.trim() || 'FarmaSys';
  const slogan = document.getElementById('cfg-eslogan')?.value.trim() || 'Sistema de Farmacia';
  const rnc = document.getElementById('cfg-rnc')?.value.trim() || '123456789';
  const tel = document.getElementById('cfg-telefono-local')?.value.trim() || '809-555-1234';
  const footer = document.getElementById('cfg-invoice-msg')?.value.trim() || '¡Gracias por su compra!';

  document.getElementById('preview-inv-name').textContent = name;
  document.getElementById('preview-inv-slogan').textContent = slogan;
  document.getElementById('preview-inv-meta').textContent = `RNC: ${rnc} • Tel: ${tel}`;
  document.getElementById('preview-inv-footer').textContent = footer;
}

async function saveCurrentPharmacyConfig(event) {
  event.preventDefault();
  const payload = {
    farmacia_id: sysState.authenticatedPharmacy.id,
    nombre: document.getElementById('cfg-name').value.trim(),
    eslogan: document.getElementById('cfg-eslogan').value.trim(),
    rnc: document.getElementById('cfg-rnc').value.trim(),
    telefono: document.getElementById('cfg-telefono-local').value.trim(),
    direccion: document.getElementById('cfg-address').value.trim(),
    ciudad_sector: document.getElementById('cfg-sector').value.trim(),
    banco_cuenta: document.getElementById('cfg-bank-account').value.trim(),
    telefono_whatsapp: document.getElementById('cfg-phone').value.trim(),
    wa_activo: document.getElementById('cfg-wa-active').checked,
    pago_tarjeta_activo: document.getElementById('cfg-card-active') ? document.getElementById('cfg-card-active').checked : true,
    envio_domicilio_activo: document.getElementById('cfg-delivery-active') ? document.getElementById('cfg-delivery-active').checked : true,
    seguro_medico_activo: document.getElementById('cfg-ars-active') ? document.getElementById('cfg-ars-active').checked : true,
    mensaje_factura: document.getElementById('cfg-invoice-msg').value.trim(),
    wa_provider: document.getElementById('cfg-wa-provider').value,
    meta_phone_number_id: document.getElementById('cfg-meta-phone-id').value.trim(),
    meta_access_token: document.getElementById('cfg-meta-token').value.trim(),
  };

  const res = await fetch('/api/pharmacy/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (data.ok) {
    const merged = { ...sysState.authenticatedPharmacy, ...data.config };
    enterAuthenticatedWorkspace(merged, sysState.sessionToken);
    showToast('Cambios guardados en la configuración de la farmacia.');
  }
}

/* =========================================================================
   ENTRADA DE MERCANCÍA / NUEVAS COMPRAS Y CORRECCIÓN DE VALOR REAL
   ========================================================================= */

function openReplenishModal(productId) {
  const p = sysState.products.find((x) => x.id === productId);
  if (!p) return;

  const selector = document.getElementById('replenish-product-selector');
  if (selector && sysState.products && sysState.products.length) {
    selector.innerHTML = sysState.products
      .map(
        (item) => `
      <option value="${item.id}" ${item.id === p.id ? 'selected' : ''}>
        ${item.nombre_comercial} (Stock: ${item.inventario.stock_total_unidades}u | ${item.ubicacion_anaquel || 'A-01'})
      </option>
    `
      )
      .join('');
    selector.value = p.id;
  }

  document.getElementById('replenish-product-id').value = p.id;
  document.getElementById('replenish-product-name').textContent = p.nombre_comercial;

  const isMerch = p.es_mercancia || p.unidades_por_blister <= 1;
  const catBadge = document.getElementById('replenish-cat-badge');
  if (catBadge) {
    catBadge.textContent = isMerch ? '🧴 Mercancía / Cuidado Personal' : '💊 Medicamento Farmacéutico';
    catBadge.className = isMerch
      ? 'px-2 py-0.5 rounded text-[10px] font-extrabold bg-teal-100 text-teal-800'
      : 'px-2 py-0.5 rounded text-[10px] font-extrabold bg-sky-100 text-sky-800';
  }

  const curBadge = document.getElementById('replenish-cur-stock-badge');
  if (curBadge) curBadge.textContent = `${p.inventario.stock_total_unidades} unid. mínimas`;

  const curPrice = document.getElementById('replenish-cur-price');
  if (curPrice) curPrice.textContent = formatRD(p.precio_base);

  const curShelf = document.getElementById('replenish-cur-shelf');
  if (curShelf) curShelf.textContent = p.ubicacion_anaquel || 'A-01';

  const curLote = document.getElementById('replenish-cur-lote');
  if (curLote) curLote.textContent = p.lote || 'N/A';

  const modeSumar = document.getElementById('replenish-mode-sumar');
  if (modeSumar) modeSumar.checked = true;

  const presSelect = document.getElementById('replenish-presentation');
  if (presSelect) {
    let opts = `<option value="UNIDAD">🔹 Unidades Mínimas / Sueltas (1u)</option>`;
    if (!isMerch && p.unidades_por_blister > 1) {
      opts += `<option value="BLISTER">💊 Blísteres (${p.unidades_por_blister}u)</option>`;
    }
    opts += `<option value="CAJA" selected>📦 Cajas Cerradas (${p.inventario.unidades_por_caja}u)</option>`;
    presSelect.innerHTML = opts;
  }

  const qtyInp = document.getElementById('replenish-quantity');
  if (qtyInp) qtyInp.value = '5';

  const dirStockInp = document.getElementById('replenish-new-direct-stock');
  if (dirStockInp) dirStockInp.value = p.inventario.stock_total_unidades;

  const loteInp = document.getElementById('replenish-lote');
  if (loteInp) loteInp.value = p.lote || '';

  const expInp = document.getElementById('replenish-expiry');
  if (expInp) {
    expInp.value =
      p.fecha_vencimiento || (p.vencimiento && p.vencimiento.fecha_vencimiento) || '';
  }

  const newPriceInp = document.getElementById('replenish-new-price');
  if (newPriceInp) newPriceInp.value = p.precio_base || '';

  const newShelfInp = document.getElementById('replenish-new-shelf');
  if (newShelfInp) newShelfInp.value = p.ubicacion_anaquel || '';

  const costInp = document.getElementById('replenish-cost');
  if (costInp) costInp.value = '';

  const motivoInp = document.getElementById('replenish-motivo');
  if (motivoInp) motivoInp.value = '';

  toggleReplenishModeUI();
  calcReplenishPreview();
  showModal('replenish-modal');
}

function openQuickReplenishModal() {
  if (!sysState.products || !sysState.products.length) {
    showToast('No hay productos en inventario para abastecer. Registre uno primero.', 'error');
    openNewProductModal();
    return;
  }
  openReplenishModal(sysState.products[0].id);
}

function closeReplenishModal() {
  hideModal('replenish-modal');
}

function toggleReplenishModeUI() {
  const isSumar = document.getElementById('replenish-mode-sumar')?.checked;
  const sumarFields = document.getElementById('replenish-sumar-fields');
  const cambiarFields = document.getElementById('replenish-cambiar-fields');

  if (isSumar) {
    sumarFields?.classList.remove('hidden');
    cambiarFields?.classList.add('hidden');
  } else {
    sumarFields?.classList.add('hidden');
    cambiarFields?.classList.remove('hidden');
  }
  calcReplenishPreview();
}

function calcReplenishPreview() {
  const pId = parseInt(document.getElementById('replenish-product-id')?.value, 10);
  const p = sysState.products.find((x) => x.id === pId);
  const preview = document.getElementById('replenish-live-calc');
  if (!p || !preview) return;

  const currentStock = p.inventario.stock_total_unidades;
  const isSumar = document.getElementById('replenish-mode-sumar')?.checked;

  if (isSumar) {
    const pres = document.getElementById('replenish-presentation')?.value || 'CAJA';
    const qty = Math.max(0, parseInt(document.getElementById('replenish-quantity')?.value, 10) || 0);
    const addedUnits = calcMinUnits(p, pres, qty);
    const finalStock = currentStock + addedUnits;
    preview.innerHTML = `Stock Actual (${currentStock}u) + Compra (+${addedUnits}u en ${qty} ${pres}) = <span class="text-teal-700 font-extrabold text-xs">Total: ${finalStock} unidades</span>`;
  } else {
    const directVal = parseInt(document.getElementById('replenish-new-direct-stock')?.value, 10);
    const validDirect = isNaN(directVal) ? currentStock : Math.max(0, directVal);
    const diff = validDirect - currentStock;
    const diffSign = diff > 0 ? `+${diff}` : `${diff}`;
    preview.innerHTML = `Stock Actual (${currentStock}u) → <span class="text-amber-700 font-extrabold text-xs">Nuevo Valor Real: ${validDirect} unidades</span> (${diffSign}u de ajuste)`;
  }
}

async function submitReplenishStock(event) {
  if (event && event.preventDefault) event.preventDefault();
  const pId = parseInt(document.getElementById('replenish-product-id').value, 10);
  const p = sysState.products.find((x) => x.id === pId);
  if (!p) {
    showToast('Producto no seleccionado.', 'error');
    return;
  }

  const isSumar = document.getElementById('replenish-mode-sumar')?.checked;
  const modo = isSumar ? 'SUMAR' : 'REEMPLAZAR';
  const pres = document.getElementById('replenish-presentation').value;
  const qty = parseInt(document.getElementById('replenish-quantity').value, 10) || 0;
  const directStock = parseInt(document.getElementById('replenish-new-direct-stock').value, 10);
  const lote = document.getElementById('replenish-lote').value.trim();
  const expiry = document.getElementById('replenish-expiry').value;
  const newPrice = parseFloat(document.getElementById('replenish-new-price').value);
  const newShelf = document.getElementById('replenish-new-shelf').value.trim();
  const cost = parseFloat(document.getElementById('replenish-cost').value);
  const motivo = document.getElementById('replenish-motivo').value.trim();

  if (!lote) {
    showToast('El número de lote es obligatorio.', 'error');
    return;
  }
  if (!expiry) {
    showToast('La fecha de vencimiento es obligatoria.', 'error');
    return;
  }

  const fid = sysState.authenticatedPharmacy ? sysState.authenticatedPharmacy.id : 1;

  const payload = {
    farmacia_id: fid,
    producto_id: pId,
    modo: modo,
    presentacion: pres,
    cantidad: qty,
    nuevo_stock_directo: isNaN(directStock) ? null : directStock,
    lote: lote,
    fecha_vencimiento: expiry,
    nuevo_precio_base: isNaN(newPrice) ? null : newPrice,
    nueva_ubicacion: newShelf || null,
    costo_compra: isNaN(cost) ? null : cost,
    motivo:
      motivo ||
      (modo === 'SUMAR'
        ? `Entrada de compra: ${qty} ${pres}`
        : 'Ajuste directo de valor real en almacén'),
  };

  try {
    const res = await fetch('/api/inventory/replenish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.ok) {
      closeReplenishModal();
      await refreshPharmacyWorkspace();
      showToast(`✅ ${data.message || 'Inventario actualizado exitosamente.'}`);
    } else {
      showToast(data.error || 'Error al actualizar inventario.', 'error');
    }
  } catch (err) {
    console.error('Error in submitReplenishStock:', err);
    showToast('Error de conexión con el servidor.', 'error');
  }
}

/* =========================================================================
   REGISTRO DE NUEVO PRODUCTO O MERCANCÍA (DESODORANTE, LIMAS, ETC.)
   ========================================================================= */

let currentNewProductType = 'MERCANCIA';

function setNewProductType(type) {
  currentNewProductType = type;
  const tabMerch = document.getElementById('np-tab-merch');
  const tabMed = document.getElementById('np-tab-med');
  const ublistWrap = document.getElementById('np-ublist-wrap');
  const rxWrap = document.getElementById('np-rx-wrap');
  const labelActive = document.getElementById('np-label-active');
  const labelBcaja = document.getElementById('np-label-bcaja');
  const badgeMode = document.getElementById('np-pack-mode-badge');
  const categoryInp = document.getElementById('np-category');
  const ublistInp = document.getElementById('np-u-blister');

  if (type === 'MERCANCIA') {
    if (tabMerch)
      tabMerch.className =
        'py-2 px-3 rounded-xl font-extrabold transition bg-white text-slate-900 shadow-xs flex items-center justify-center gap-1.5';
    if (tabMed)
      tabMed.className =
        'py-2 px-3 rounded-xl font-bold transition text-slate-600 hover:text-slate-900 flex items-center justify-center gap-1.5';
    ublistWrap?.classList.add('hidden');
    rxWrap?.classList.add('hidden');
    if (ublistInp) ublistInp.value = '1';
    if (labelActive) labelActive.textContent = 'Marca / Fabricante o Principio Activo';
    if (labelBcaja) labelBcaja.textContent = 'Unid. por Caja / Paquete (ej. 12)';
    if (badgeMode) badgeMode.textContent = '🛍️ Mercancía / Cuidado Personal (Venta por Unidad)';
    if (categoryInp && !categoryInp.value) categoryInp.value = 'Cuidado Personal';
  } else {
    if (tabMed)
      tabMed.className =
        'py-2 px-3 rounded-xl font-extrabold transition bg-white text-slate-900 shadow-xs flex items-center justify-center gap-1.5';
    if (tabMerch)
      tabMerch.className =
        'py-2 px-3 rounded-xl font-bold transition text-slate-600 hover:text-slate-900 flex items-center justify-center gap-1.5';
    ublistWrap?.classList.remove('hidden');
    rxWrap?.classList.remove('hidden');
    if (ublistInp && parseInt(ublistInp.value, 10) <= 1) ublistInp.value = '10';
    if (labelActive) labelActive.textContent = 'Principio Activo';
    if (labelBcaja) labelBcaja.textContent = 'Blísteres por Caja';
    if (badgeMode) badgeMode.textContent = '💊 Medicamento con Blíster y Caja';
    if (categoryInp && ['Cuidado Personal', 'Limas y Manicura'].includes(categoryInp.value)) {
      categoryInp.value = 'Analgésicos y Antipiréticos';
    }
  }
}

function generateRandomBarcode() {
  let code = '746';
  for (let i = 0; i < 9; i++) {
    code += Math.floor(Math.random() * 10);
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(code[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  code += check;
  const barcodeInp = document.getElementById('np-barcode');
  if (barcodeInp) barcodeInp.value = code;
}

function openNewProductModal() {
  const barcodeInp = document.getElementById('np-barcode');
  if (barcodeInp && !barcodeInp.value) generateRandomBarcode();

  const expiryInp = document.getElementById('np-expiry');
  if (expiryInp && !expiryInp.value) {
    const d = new Date();
    d.setMonth(d.getMonth() + 18);
    expiryInp.value = d.toISOString().slice(0, 10);
  }

  const loteInp = document.getElementById('np-lote');
  if (loteInp && !loteInp.value) {
    loteInp.value = 'LOT-' + new Date().getFullYear() + '-M' + Math.floor(100 + Math.random() * 900);
  }

  setNewProductType('MERCANCIA');
  showModal('new-product-modal');
}

function closeNewProductModal() {
  hideModal('new-product-modal');
}

async function submitNewProduct(event) {
  if (event && event.preventDefault) event.preventDefault();
  const fid = sysState.authenticatedPharmacy ? sysState.authenticatedPharmacy.id : 1;
  const isMerch = currentNewProductType === 'MERCANCIA';

  const uBlister = isMerch ? 1 : parseInt(document.getElementById('np-u-blister').value, 10) || 1;
  const bCaja = parseInt(document.getElementById('np-b-caja').value, 10) || 1;
  const stockInit = parseInt(document.getElementById('np-stock-init').value, 10) || 0;
  const price = parseFloat(document.getElementById('np-price').value) || 0;
  const barcode = document.getElementById('np-barcode').value.trim();
  const cat = document.getElementById('np-category').value.trim();
  const name = document.getElementById('np-name').value.trim();
  const active = document.getElementById('np-active').value.trim();
  const shelf = document.getElementById('np-shelf').value.trim();
  const lote = document.getElementById('np-lote').value.trim();
  const expiry = document.getElementById('np-expiry').value;
  const minStock = parseInt(document.getElementById('np-min-stock')?.value, 10) || 5;
  const rx = !isMerch && !!document.getElementById('np-rx')?.checked;

  if (!barcode || !name || !lote || !expiry) {
    showToast('Por favor complete los campos obligatorios (*).', 'error');
    return;
  }

  const payload = {
    farmacia_id: fid,
    codigo_barras: barcode,
    categoria: cat || (isMerch ? 'Cuidado Personal' : 'Medicamentos'),
    nombre_comercial: name,
    principio_activo: active || name,
    ubicacion_anaquel: shelf || 'Pasillo Mostrador',
    sintomas_tags: isMerch ? `${cat},${name},mercancia` : `${cat},medicamento`,
    lote: lote,
    fecha_vencimiento: expiry,
    unidades_por_blister: uBlister,
    blisters_por_caja: bCaja,
    stock_total_unidades: stockInit,
    stock_minimo_alerta: minStock,
    precio_base: price,
    requiere_receta: rx,
    es_mercancia: isMerch,
  };

  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.ok) {
      closeNewProductModal();
      await refreshPharmacyWorkspace();
      showToast(`✅ "${name}" registrado correctamente en ${sysState.authenticatedPharmacy.nombre}.`);
    } else {
      showToast(data.error || 'Error registrando producto.', 'error');
    }
  } catch (err) {
    console.error('submitNewProduct error:', err);
    showToast('Error de conexión al registrar producto.', 'error');
  }
}

function openPrescriptionModal(orderId) {
  const order = sysState.transactions.find((t) => t.id === orderId);
  if (!order) return;
  sysState.activeReviewOrderId = orderId;
  document.getElementById('rx-modal-title').textContent = `Receta Médica — Orden #${order.codigo_orden}`;
  document.getElementById('rx-modal-subtitle').textContent = `${order.cliente_nombre} • ${formatRD(order.total)}`;
  document.getElementById('rx-modal-img').src = order.receta_imagen_url || '/api/sample-prescription.svg';
  showModal('rx-viewer-modal');
}

function closePrescriptionModal() {
  hideModal('rx-viewer-modal');
  sysState.activeReviewOrderId = null;
}

async function quickApproveOrder(orderId) {
  sysState.activeReviewOrderId = orderId;
  await submitPrescriptionReview('APROBAR');
}

async function submitPrescriptionReview(accion) {
  if (!sysState.activeReviewOrderId) return;
  const notas = document.getElementById('rx-pharmacist-note')?.value.trim() || '';
  const res = await fetch('/api/orders/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transaccion_id: sysState.activeReviewOrderId,
      accion,
      notas_farmaceutico: notas,
      farmaceutico_nombre: `Farmacéutico — ${sysState.authenticatedPharmacy.nombre}`,
    }),
  });
  const data = await res.json();
  if (data.ok) {
    closePrescriptionModal();
    await refreshPharmacyWorkspace();
    showToast(`Orden #${data.order.codigo_orden} actualizada (${data.order.estado_pedido}).`);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSistemaFarmacia);
} else {
  initSistemaFarmacia();
}


// ============================================================================
// CALCULADORA DE CAMBIO EN EFECTIVO Y ATAJOS DE TECLADO POS (PC & MOVIL)
// ============================================================================
function calculatePosChange() {
  const tenderInp = document.getElementById('pos-cash-tendered');
  const changeValEl = document.getElementById('pos-cash-change-val');
  if (!tenderInp || !changeValEl) return;

  const tendered = parseFloat(tenderInp.value || '0');
  const totalAmountStr = document.getElementById('pos-total-amount').textContent;
  const total = parseFloat(totalAmountStr.replace(/[^0-9.]/g, '') || '0');

  const diff = tendered - total;
  if (diff >= 0) {
    changeValEl.textContent = formatRD(diff);
    changeValEl.className = 'text-lg font-black text-emerald-700 font-mono';
  } else {
    changeValEl.textContent = `Faltan ${formatRD(Math.abs(diff))}`;
    changeValEl.className = 'text-lg font-black text-rose-600 font-mono';
  }
}

function quickCashAdd(val) {
  const tenderInp = document.getElementById('pos-cash-tendered');
  if (!tenderInp) return;
  const cur = parseFloat(tenderInp.value || '0');
  tenderInp.value = (cur + val).toFixed(2);
  calculatePosChange();
}

function quickCashExact() {
  const tenderInp = document.getElementById('pos-cash-tendered');
  const totalAmountStr = document.getElementById('pos-total-amount').textContent;
  const total = parseFloat(totalAmountStr.replace(/[^0-9.]/g, '') || '0');
  if (tenderInp) {
    tenderInp.value = total.toFixed(2);
    calculatePosChange();
  }
}

// Atajos de teclado en PC para el Mostrador de Farmacia: F2 Búsqueda, F4 Cobro, ESC Cerrar
window.addEventListener('keydown', (e) => {
  if (sysState.activeTab === 'pos') {
    if (e.key === 'F2') {
      e.preventDefault();
      const bInp = document.getElementById('pos-barcode-input');
      if (bInp) { bInp.focus(); bInp.select(); }
    } else if (e.key === 'F4') {
      e.preventDefault();
      submitPosSale();
    } else if (e.key === 'Escape') {
      const modals = document.querySelectorAll('[id$="-modal"]');
      modals.forEach((m) => {
        if (!m.classList.contains('hidden')) {
          m.classList.add('hidden');
          m.classList.remove('flex');
        }
      });
    }
  }
});

// ============================================================================
// BITACORA DE AUDITORIA DE INVENTARIO
// ============================================================================
async function openAuditLogsModal() {
  const modal = document.getElementById('audit-logs-modal');
  const tbody = document.getElementById('audit-logs-tbody');
  const countEl = document.getElementById('audit-logs-count');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-slate-400">Cargando registros de auditoría...</td></tr>';

  try {
    const res = await fetch(`/api/inventory/audit-logs?farmacia_id=${sysState.authenticatedPharmacy.id}`);
    const data = await res.json();
    if (data.ok && data.audits) {
      countEl.textContent = data.audits.length;
      if (!data.audits.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-slate-400 font-bold">No hay modificaciones manuales registradas aún. Todas las correcciones de precio, stock o lote aparecerán aquí.</td></tr>';
        return;
      }
      tbody.innerHTML = data.audits.map((a) => `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100">
          <td class="py-2.5 px-3 font-mono text-[11px] text-slate-500">${a.fecha_hora}</td>
          <td class="py-2.5 px-3 font-bold text-slate-900">${a.producto_nombre} <span class="text-slate-400 font-mono text-[10px]">(${a.lote})</span></td>
          <td class="py-2.5 px-3 font-extrabold text-teal-700 uppercase text-[10px]">${a.campo_modificado}</td>
          <td class="py-2.5 px-3 text-center font-mono text-rose-600 font-bold line-through">${a.valor_anterior}</td>
          <td class="py-2.5 px-3 text-center font-mono text-emerald-700 font-black">${a.valor_nuevo}</td>
          <td class="py-2.5 px-3 font-semibold text-slate-800">${a.usuario}</td>
          <td class="py-2.5 px-3 text-slate-600 font-medium italic">"${a.motivo}"</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-rose-600 font-bold">Error al cargar bitácora de auditoría.</td></tr>';
  }
}

function closeAuditLogsModal() {
  const modal = document.getElementById('audit-logs-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

// ============================================================================
// PROGRAMACION DE MENSAJES DE COBRANZA WHATSAPP
// ============================================================================
let currentScheduleDebtor = null;

function openScheduleDebtorModal(debtorId) {
  const d = sysState.debtors.find((x) => x.id === debtorId);
  if (!d) return;
  currentScheduleDebtor = d;

  document.getElementById('sch-debtor-id').value = d.id;
  document.getElementById('sch-debtor-name').value = d.cliente_nombre;
  document.getElementById('sch-debtor-phone').value = d.cliente_telefono || '809-555-0000';
  document.getElementById('sch-debtor-balance').value = formatRD(d.saldo_pendiente_rd);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById('sch-date').value = tomorrow.toISOString().split('T')[0];

  const farmName = sysState.authenticatedPharmacy ? sysState.authenticatedPharmacy.nombre : 'Farmacia Davalsi';
  const bankInfo = sysState.authenticatedPharmacy ? sysState.authenticatedPharmacy.banco_cuenta : 'Popular: 789-451230-9 | Banreservas: 960-112233-4';

  document.getElementById('sch-message').value =
    `Hola ${d.cliente_nombre}, le saludamos de *${farmName}*. Le recordamos amablemente su saldo pendiente de *${formatRD(d.saldo_pendiente_rd)}* correspondiente a su compra de "${d.concepto}".\n\n💳 *Cuentas para transferencia:*\n${bankInfo}\n\nFavor responder a este mensaje con su comprobante de pago una vez realizado. ¡Muchas gracias!`;

  const modal = document.getElementById('schedule-debtor-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeScheduleDebtorModal() {
  const modal = document.getElementById('schedule-debtor-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function submitScheduleDebtorReminder(event) {
  event.preventDefault();
  const dateVal = document.getElementById('sch-date').value;
  const timeVal = document.getElementById('sch-time').value;
  showToast(`Mensaje de cobranza programado con éxito para el ${dateVal} a las ${timeVal}.`, 'success');
  closeScheduleDebtorModal();
}

function sendDirectWhatsAppDebtor() {
  if (!currentScheduleDebtor) return;
  const cleanPhone = (currentScheduleDebtor.cliente_telefono || '').replace(/\D/g, '');
  const msg = encodeURIComponent(document.getElementById('sch-message').value);
  const waUrl = `https://wa.me/${cleanPhone.startsWith('1') ? cleanPhone : '1' + cleanPhone}?text=${msg}`;
  window.open(waUrl, '_blank');
}


// ============================================================================
// LOGICA DE PESTAÑA DERECHA DEL POS: MEDICAMENTOS WHATSAPP EN VIVO
// ============================================================================
function switchPosRightTab(tab) {
  const btnWa = document.getElementById('tab-pos-right-wa');
  const btnOrd = document.getElementById('tab-pos-right-orders');
  const viewWa = document.getElementById('pos-right-wa-view');
  const viewOrd = document.getElementById('pos-right-orders-view');
  if (!btnWa || !btnOrd || !viewWa || !viewOrd) return;

  if (tab === 'wa') {
    btnWa.className = 'flex-1 py-2 rounded-xl bg-white text-teal-800 shadow transition flex items-center justify-center gap-1.5 font-bold';
    btnOrd.className = 'flex-1 py-2 rounded-xl text-slate-600 hover:text-slate-900 transition flex items-center justify-center gap-1.5 font-bold';
    viewWa.classList.remove('hidden');
    viewOrd.classList.add('hidden');
    renderPosWaLiveList();
  } else {
    btnOrd.className = 'flex-1 py-2 rounded-xl bg-white text-teal-800 shadow transition flex items-center justify-center gap-1.5 font-bold';
    btnWa.className = 'flex-1 py-2 rounded-xl text-slate-600 hover:text-slate-900 transition flex items-center justify-center gap-1.5 font-bold';
    viewOrd.classList.remove('hidden');
    viewWa.classList.add('hidden');
  }
}

function renderPosWaLiveList() {
  const container = document.getElementById('pos-wa-live-list');
  if (!container) return;

  const logs = sysState.whatsappLogs || [];
  if (!logs.length) {
    container.innerHTML = `
      <div class="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2">
        <span class="text-3xl">💬</span>
        <p class="font-extrabold text-xs text-slate-700">Sin mensajes de WhatsApp registrados aún</p>
        <p class="text-[11px] text-slate-500">Al confirmar pedidos o enviar recibos, aquí verás en tiempo real los medicamentos que se están enviando al cliente y a la farmacia.</p>
      </div>`;
    return;
  }

  container.innerHTML = logs.map((log) => {
    const isClient = log.destinatario_rol === 'PACIENTE_CLIENTE' || log.destinatario_rol === 'DEUDOR_CLIENTE';
    const cleanPhone = (log.telefono_destino || '').replace(/\D/g, '');
    const waUrl = `https://wa.me/${cleanPhone.startsWith('1') ? cleanPhone : '1' + cleanPhone}?text=${encodeURIComponent(log.mensaje_texto)}`;

    // Extraer líneas de medicamentos
    const lines = (log.mensaje_texto || '').split('\n');
    const medLines = lines.filter((l) => l.includes('•') || l.includes('1.') || l.includes('2.') || l.includes('3.') || l.includes('RD$') || l.includes('Caja') || l.includes('Blíster'));

    return `
      <div class="p-3.5 rounded-2xl bg-white border-2 border-slate-200 hover:border-teal-400 shadow-xs transition space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${isClient ? 'bg-emerald-100 text-emerald-800' : 'bg-teal-100 text-teal-800'}">
            ${isClient ? '📱 WhatsApp Paciente' : '🏥 WhatsApp Farmacia'}
          </span>
          <span class="text-[10px] text-slate-400 font-mono">${log.fecha_hora}</span>
        </div>

        <div class="flex items-center justify-between text-xs">
          <div>
            <p class="font-extrabold text-slate-900">Orden / Ref: <span class="font-mono text-teal-700">#${log.codigo_orden}</span></p>
            <p class="text-[11px] font-mono text-slate-500 font-bold">Destino: +${log.telefono_destino}</p>
          </div>
          <a href="${waUrl}" target="_blank" class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] shadow-xs flex items-center gap-1 transition">
            <span>💬</span> <span>Abrir WhatsApp</span>
          </a>
        </div>

        <!-- Desglose de los medicamentos que se están enviando al WhatsApp -->
        <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
          <span class="text-[10px] font-extrabold uppercase text-slate-600 flex items-center gap-1">
            <span>💊</span> <span>Medicamentos que se están enviando:</span>
          </span>
          <div class="text-[11px] text-slate-800 font-medium whitespace-pre-line leading-relaxed pl-2 border-l-2 border-emerald-500 bg-white p-2 rounded-lg border">
            ${medLines.length ? medLines.join('\n') : log.mensaje_texto.substring(0, 160) + '...'}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function updatePosQuickAlertRibbon() {
  const prods = sysState.products || [];
  const debtors = sysState.debtors || [];
  const logs = sysState.whatsappLogs || [];

  // 1. Stock Bajo
  const lowStockCnt = prods.filter((p) => p.inventario && p.inventario.stock_total_unidades <= p.stock_minimo_alerta).length;
  const elLow = document.getElementById('pos-quick-low-stock-cnt');
  if (elLow) elLow.textContent = `${lowStockCnt} producto(s)`;

  // 2. Vencimiento <= 7 meses
  const exp7mCnt = prods.filter((p) => p.vencimiento && p.vencimiento.es_menor_7_meses).length;
  const elExp = document.getElementById('pos-quick-expiry-cnt');
  if (elExp) elExp.textContent = `${exp7mCnt} lote(s)`;

  // 3. Deudas Pendientes
  const totalDue = debtors.filter((d) => d.estado === 'PENDIENTE').reduce((acc, d) => acc + Number(d.saldo_pendiente_rd || 0), 0);
  const elDue = document.getElementById('pos-quick-debtors-total');
  if (elDue) elDue.textContent = formatRD(totalDue);

  // 4. WhatsApp Mensajes
  const elWa = document.getElementById('pos-quick-wa-cnt');
  if (elWa) elWa.textContent = `${logs.length} mensaje(s)`;
  const elWaBadge = document.getElementById('badge-sys-wa-count');
  if (elWaBadge) elWaBadge.textContent = logs.length;

  renderPosWaLiveList();
}


/* =========================================================================
   MÓDULO DE REPORTES: VENTA DIARIA, VENTA MENSUAL, TABLAS INTERACTIVAS E IMPRESIÓN
   ========================================================================= */

function switchReportSubTab(subTab) {
  sysReportState.activeSubTab = subTab;
  const subtabs = ['diario', 'mensual', 'graficos', 'comparativa'];
  subtabs.forEach((st) => {
    const btn = document.getElementById(`rep-subtab-btn-${st}`);
    const panel = document.getElementById(`rep-subpanel-${st}`);
    if (panel) {
      if (st === subTab) {
        panel.classList.remove('hidden');
        panel.style.display = 'block';
      } else {
        panel.classList.add('hidden');
        panel.style.display = 'none';
      }
    }
    if (btn) {
      if (st === subTab) {
        btn.className = 'px-4 py-2 rounded-lg text-xs font-extrabold transition bg-teal-600 text-white shadow-xs flex items-center gap-1.5';
      } else {
        btn.className = 'px-4 py-2 rounded-lg text-xs font-bold transition text-slate-600 hover:text-slate-900 flex items-center gap-1.5';
      }
    }
  });

  const ind = document.getElementById('rep-subtab-indicator');
  if (ind) {
    if (subTab === 'diario') ind.textContent = `Visualizando: Venta Diaria (${sysReportState.dailyDate})`;
    else if (subTab === 'mensual') ind.textContent = `Visualizando: Venta Mensual (${sysReportState.monthlyMonth})`;
    else if (subTab === 'comparativa') ind.textContent = `Visualizando: Estadísticas Comparativas (Diaria, Semanal y Mensual)`;
    else ind.textContent = `Visualizando: Dashboard General y Gráficos`;
  }

  if (subTab === 'diario') {
    loadAndRenderDailyReport();
  } else if (subTab === 'mensual') {
    loadAndRenderMonthlyReport();
  } else if (subTab === 'comparativa') {
    loadAndRenderComparativeStats();
  } else if (subTab === 'graficos') {
    loadSysDashboardAndReports();
  }
}

function initSalesReportsView() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const thisMonthStr = new Date().toISOString().slice(0, 7);

  if (!sysReportState.dailyDate) sysReportState.dailyDate = todayStr;
  if (!sysReportState.monthlyMonth) sysReportState.monthlyMonth = thisMonthStr;

  const dPicker = document.getElementById('rep-daily-picker');
  if (dPicker && !dPicker.value) dPicker.value = sysReportState.dailyDate;

  const mPicker = document.getElementById('rep-monthly-month-picker');
  if (mPicker && !mPicker.value) mPicker.value = sysReportState.monthlyMonth;

  switchReportSubTab(sysReportState.activeSubTab || 'diario');
}

// -------------------------------------------------------------
// VENTA DIARIA: Carga, Filtros y Render de Tabla Interactiva
// -------------------------------------------------------------

function onDailyReportDateChange(val) {
  if (!val) return;
  sysReportState.dailyDate = val;
  const ind = document.getElementById('rep-subtab-indicator');
  if (ind) ind.textContent = `Visualizando: Venta Diaria (${val})`;
  loadAndRenderDailyReport(val);
}

function setDailyReportQuick(type) {
  const d = new Date();
  if (type === 'yesterday') {
    d.setDate(d.getDate() - 1);
  }
  const dateStr = d.toISOString().slice(0, 10);
  sysReportState.dailyDate = dateStr;
  const picker = document.getElementById('rep-daily-picker');
  if (picker) picker.value = dateStr;
  onDailyReportDateChange(dateStr);
}

async function loadAndRenderDailyReport(targetDate) {
  const dateStr = targetDate || sysReportState.dailyDate || new Date().toISOString().slice(0, 10);
  const fid = sysState.authenticatedPharmacy ? sysState.authenticatedPharmacy.id : 1;

  try {
    const res = await fetch(`/api/transactions?farmacia_id=${fid}&fecha_dia=${dateStr}&limit=500`);
    const data = await res.json();
    if (data.ok) {
      sysReportState.dailyTransactions = data.transactions || [];
    } else {
      sysReportState.dailyTransactions = [];
    }
  } catch (err) {
    console.error('Error cargando transacciones diarias:', err);
    sysReportState.dailyTransactions = [];
  }

  renderDailySalesReport();
}

function filterDailySalesTable() {
  const methodSel = document.getElementById('rep-daily-method-filter');
  const channelSel = document.getElementById('rep-daily-channel-filter');
  const searchInp = document.getElementById('rep-daily-search');

  sysReportState.dailyMethodFilter = methodSel ? methodSel.value : 'TODOS';
  sysReportState.dailyChannelFilter = channelSel ? channelSel.value : 'TODOS';
  sysReportState.dailySearchQuery = searchInp ? searchInp.value.trim().toLowerCase() : '';

  renderDailySalesReport();
}

function renderDailySalesReport() {
  const tbody = document.getElementById('rep-daily-tbody');
  const tfoot = document.getElementById('rep-daily-tfoot');
  if (!tbody) return;

  const txs = sysReportState.dailyTransactions || [];
  const methodF = sysReportState.dailyMethodFilter || 'TODOS';
  const channelF = sysReportState.dailyChannelFilter || 'TODOS';
  const query = sysReportState.dailySearchQuery || '';

  // Filtrado
  const filtered = txs.filter((tx) => {
    if (tx.estado_pedido === 'RECHAZADO_RECETA') return false;

    if (methodF !== 'TODOS') {
      if (methodF === 'EFECTIVO' && tx.metodo_pago !== 'EFECTIVO') return false;
      if (methodF === 'TARJETA' && tx.metodo_pago !== 'TARJETA') return false;
      if (methodF === 'DEPOSITO_CUENTA' && tx.metodo_pago !== 'DEPOSITO_CUENTA' && tx.metodo_pago !== 'TRANSFERENCIA') return false;
    }

    if (channelF !== 'TODOS') {
      if (tx.canal !== channelF) return false;
    }

    if (query) {
      const matchTicket = (tx.codigo_orden || '').toLowerCase().includes(query);
      const matchClient = (tx.cliente_nombre || '').toLowerCase().includes(query);
      const matchItems = (tx.items || []).some((i) => (i.nombre_comercial || '').toLowerCase().includes(query) || (i.principio_activo || '').toLowerCase().includes(query));
      if (!matchTicket && !matchClient && !matchItems) return false;
    }

    return true;
  });

  // Cálculo de KPIs
  let sumTotal = 0;
  let sumCash = 0;
  let sumCard = 0;
  let sumTransfer = 0;
  let totalUnits = 0;

  filtered.forEach((tx) => {
    const tot = Number(tx.total || 0);
    sumTotal += tot;

    if (tx.metodo_pago === 'EFECTIVO') sumCash += tot;
    else if (tx.metodo_pago === 'TARJETA') sumCard += tot;
    else sumTransfer += tot;

    (tx.items || []).forEach((item) => {
      totalUnits += Number(item.unidades_minimas_descontadas || item.cantidad_presentacion || 1);
    });
  });

  const avgTicket = filtered.length > 0 ? sumTotal / filtered.length : 0;

  // Actualizar KPIs en pantalla
  const elTot = document.getElementById('rep-daily-kpi-total');
  const elTxCount = document.getElementById('rep-daily-kpi-txcount');
  const elCash = document.getElementById('rep-daily-kpi-cash');
  const elCard = document.getElementById('rep-daily-kpi-card');
  const elTrans = document.getElementById('rep-daily-kpi-transfer');
  const elItems = document.getElementById('rep-daily-kpi-items');
  const elAvg = document.getElementById('rep-daily-kpi-ticketavg');
  const elBadge = document.getElementById('rep-daily-results-badge');
  const elSumm = document.getElementById('rep-daily-table-summary');

  if (elTot) elTot.textContent = formatRD(sumTotal);
  if (elTxCount) elTxCount.textContent = `${filtered.length} facturas emitidas`;
  if (elCash) elCash.textContent = formatRD(sumCash);
  if (elCard) elCard.textContent = formatRD(sumCard);
  if (elTrans) elTrans.textContent = formatRD(sumTransfer);
  if (elItems) elItems.textContent = `${totalUnits} unid.`;
  if (elAvg) elAvg.textContent = `Ticket prom: ${formatRD(avgTicket)}`;
  if (elBadge) elBadge.textContent = `Mostrando ${filtered.length} de ${txs.length} ventas`;
  if (elSumm) elSumm.textContent = `Fecha: ${sysReportState.dailyDate} • Total Facturado: ${formatRD(sumTotal)}`;

  // Renderizar filas de tabla
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-12 text-center text-slate-400">
      <div class="text-3xl mb-2">📋</div>
      <p class="font-extrabold text-slate-700">No se encontraron ventas para esta fecha o filtros</p>
      <p class="text-xs text-slate-400 mt-1">Seleccione otra fecha en el calendario o cambie los filtros de búsqueda.</p>
    </td></tr>`;
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  tbody.innerHTML = filtered
    .map((tx) => {
      const horaStr = tx.fecha_hora ? (tx.fecha_hora.slice(11, 19) || tx.fecha_hora) : '--:--';
      const itemsListHtml = (tx.items || [])
        .map((i) => {
          const lotText = i.lote ? `<span class="text-slate-400 font-mono text-[10px]">(${i.lote})</span>` : '';
          const subitem = Number(i.subtotal || i.precio_cobrado || 0);
          return `
            <div class="py-0.5 text-[11px] text-slate-700 flex items-start justify-between gap-1">
              <span>• <strong class="text-slate-900">${i.cantidad_presentacion}x</strong> ${i.presentacion} ${i.nombre_comercial} ${lotText}</span>
              <span class="font-mono text-slate-600 font-bold">${formatRD(subitem)}</span>
            </div>
          `;
        })
        .join('');

      let paymentBadgeCls = 'bg-slate-100 text-slate-700 border-slate-200';
      let paymentIcon = '💵';
      if (tx.metodo_pago === 'EFECTIVO') {
        paymentBadgeCls = 'bg-emerald-50 text-emerald-800 border-emerald-300';
        paymentIcon = '💵';
      } else if (tx.metodo_pago === 'TARJETA') {
        paymentBadgeCls = 'bg-sky-50 text-sky-800 border-sky-300';
        paymentIcon = '💳';
      } else {
        paymentBadgeCls = 'bg-purple-50 text-purple-800 border-purple-300';
        paymentIcon = '🏦';
      }

      const channelBadge =
        tx.canal === 'POS_MOSTRADOR'
          ? `<span class="px-2 py-0.5 rounded-lg bg-teal-50 text-teal-800 font-extrabold text-[10px] border border-teal-200">🛒 POS Mostrador</span>`
          : `<span class="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-800 font-extrabold text-[10px] border border-indigo-200">📱 App Móvil</span>`;

      return `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100">
          <td class="py-3 px-4 font-mono">
            <span class="font-extrabold text-slate-900">#${tx.codigo_orden}</span>
            <span class="block text-[11px] text-slate-500 font-semibold">${horaStr}</span>
          </td>
          <td class="py-3 px-4">
            <p class="font-extrabold text-slate-900">${tx.cliente_nombre || 'Cliente Mostrador'}</p>
            <p class="text-[10px] text-slate-400 font-mono">${tx.cliente_telefono ? `+${tx.cliente_telefono}` : 'Sin teléfono'}</p>
          </td>
          <td class="py-3 px-4">${channelBadge}</td>
          <td class="py-3 px-4">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-extrabold border ${paymentBadgeCls}">
              <span>${paymentIcon}</span>
              <span>${tx.metodo_pago}</span>
            </span>
            ${tx.numero_comprobante ? `<span class="block text-[10px] text-slate-400 font-mono mt-0.5">Ref: ${tx.numero_comprobante}</span>` : ''}
          </td>
          <td class="py-3 px-4">${itemsListHtml || '<span class="text-slate-400">Sin desglose</span>'}</td>
          <td class="py-3 px-4 text-right">
            <span class="font-extrabold text-base text-slate-900">${formatRD(tx.total)}</span>
          </td>
          <td class="py-3 px-4 text-center">
            <button type="button" onclick="openReceiptById(${tx.id})" class="px-2.5 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 font-extrabold text-xs transition cursor-pointer border border-teal-200 shadow-2xs">
              🧾 Ver Ticket
            </button>
          </td>
        </tr>
      `;
    })
    .join('');

  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td colspan="4" class="py-3 px-4 uppercase text-xs tracking-wider text-slate-600">
          TOTAL CUADRE DEL DÍA (${filtered.length} facturas)
        </td>
        <td class="py-3 px-4 text-[11px] text-slate-600 font-bold">
          Efectivo: <span class="text-emerald-700">${formatRD(sumCash)}</span> | Tarjeta: <span class="text-sky-700">${formatRD(sumCard)}</span> | Transf: <span class="text-purple-700">${formatRD(sumTransfer)}</span>
        </td>
        <td class="py-3 px-4 text-right text-base font-extrabold text-teal-900">
          ${formatRD(sumTotal)}
        </td>
        <td></td>
      </tr>
    `;
  }
}

// -------------------------------------------------------------
// VENTA MENSUAL: Carga, Agrupación Día a Día y Render de Tabla
// -------------------------------------------------------------

function onMonthlyReportMonthChange(val) {
  if (!val) return;
  sysReportState.monthlyMonth = val;
  const ind = document.getElementById('rep-subtab-indicator');
  if (ind) ind.textContent = `Visualizando: Venta Mensual (${val})`;
  loadAndRenderMonthlyReport(val);
}

function setMonthlyReportQuick(type) {
  const thisMonthStr = new Date().toISOString().slice(0, 7);
  sysReportState.monthlyMonth = thisMonthStr;
  const picker = document.getElementById('rep-monthly-month-picker');
  if (picker) picker.value = thisMonthStr;
  onMonthlyReportMonthChange(thisMonthStr);
}

function toggleMonthlyViewMode(mode) {
  sysReportState.monthlyViewMode = mode;
  const btnDays = document.getElementById('rep-monthly-btn-view-days');
  const btnAll = document.getElementById('rep-monthly-btn-view-all');
  const cDays = document.getElementById('rep-monthly-container-days');
  const cAll = document.getElementById('rep-monthly-container-all');

  if (mode === 'days') {
    if (btnDays) btnDays.className = 'px-3 py-1 rounded-lg text-xs font-extrabold bg-white text-slate-900 shadow-xs transition';
    if (btnAll) btnAll.className = 'px-3 py-1 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 transition';
    if (cDays) { cDays.classList.remove('hidden'); cDays.style.display = 'block'; }
    if (cAll) { cAll.classList.add('hidden'); cAll.style.display = 'none'; }
  } else {
    if (btnDays) btnDays.className = 'px-3 py-1 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 transition';
    if (btnAll) btnAll.className = 'px-3 py-1 rounded-lg text-xs font-extrabold bg-white text-slate-900 shadow-xs transition';
    if (cDays) { cDays.classList.add('hidden'); cDays.style.display = 'none'; }
    if (cAll) { cAll.classList.remove('hidden'); cAll.style.display = 'block'; }
  }
}

async function loadAndRenderMonthlyReport(targetMonth) {
  const monthStr = targetMonth || sysReportState.monthlyMonth || new Date().toISOString().slice(0, 7);
  const fid = sysState.authenticatedPharmacy ? sysState.authenticatedPharmacy.id : 1;

  try {
    const res = await fetch(`/api/transactions?farmacia_id=${fid}&fecha_mes=${monthStr}&limit=1000`);
    const data = await res.json();
    if (data.ok) {
      sysReportState.monthlyTransactions = data.transactions || [];
    } else {
      sysReportState.monthlyTransactions = [];
    }
  } catch (err) {
    console.error('Error cargando transacciones mensuales:', err);
    sysReportState.monthlyTransactions = [];
  }

  renderMonthlySalesReport();
}

function filterMonthlyAllTable() {
  const inp = document.getElementById('rep-monthly-all-search');
  sysReportState.monthlySearchQuery = inp ? inp.value.trim().toLowerCase() : '';
  renderMonthlyAllTableRows();
}

function renderMonthlySalesReport() {
  const tbodyDays = document.getElementById('rep-monthly-days-tbody');
  const tfootDays = document.getElementById('rep-monthly-days-tfoot');
  if (!tbodyDays) return;

  const txs = (sysReportState.monthlyTransactions || []).filter((t) => t.estado_pedido !== 'RECHAZADO_RECETA');

  // Agrupar por día
  const daysMap = {};
  let totalMonth = 0;
  let cashMonth = 0;
  let cardMonth = 0;
  let transMonth = 0;

  txs.forEach((tx) => {
    const day = tx.fecha_dia || (tx.fecha_hora ? tx.fecha_hora.slice(0, 10) : 'Desconocido');
    const tot = Number(tx.total || 0);

    totalMonth += tot;
    if (tx.metodo_pago === 'EFECTIVO') cashMonth += tot;
    else if (tx.metodo_pago === 'TARJETA') cardMonth += tot;
    else transMonth += tot;

    if (!daysMap[day]) {
      const dt = new Date(day + 'T12:00:00');
      const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const diaNom = !isNaN(dt.getDay()) ? diasSemana[dt.getDay()] : '';
      daysMap[day] = {
        fecha: day,
        diaSemana: diaNom,
        count: 0,
        cash: 0,
        card: 0,
        transfer: 0,
        total: 0,
      };
    }

    daysMap[day].count += 1;
    daysMap[day].total += tot;
    if (tx.metodo_pago === 'EFECTIVO') daysMap[day].cash += tot;
    else if (tx.metodo_pago === 'TARJETA') daysMap[day].card += tot;
    else daysMap[day].transfer += tot;
  });

  const sortedDays = Object.values(daysMap).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const activeDaysCount = sortedDays.length;
  const avgDaily = activeDaysCount > 0 ? totalMonth / activeDaysCount : 0;

  // Encontrar el día pico
  let topDay = { fecha: 'Sin datos', total: 0, diaSemana: '' };
  sortedDays.forEach((d) => {
    if (d.total > topDay.total) {
      topDay = d;
    }
  });

  // Actualizar KPIs del Mes
  const elTot = document.getElementById('rep-monthly-kpi-total');
  const elCnt = document.getElementById('rep-monthly-kpi-txcount');
  const elAvg = document.getElementById('rep-monthly-kpi-dailyavg');
  const elDaysCnt = document.getElementById('rep-monthly-kpi-activedays');
  const elCash = document.getElementById('rep-monthly-kpi-cash');
  const elCard = document.getElementById('rep-monthly-kpi-cardtrans');
  const elTopAmt = document.getElementById('rep-monthly-kpi-topday-amount');
  const elTopDate = document.getElementById('rep-monthly-kpi-topday-date');
  const elDaysBadge = document.getElementById('rep-monthly-days-count-badge');

  if (elTot) elTot.textContent = formatRD(totalMonth);
  if (elCnt) elCnt.textContent = `${txs.length} transacciones en el mes`;
  if (elAvg) elAvg.textContent = formatRD(avgDaily);
  if (elDaysCnt) elDaysCnt.textContent = `${activeDaysCount} días con ventas registradas`;
  if (elCash) elCash.textContent = formatRD(cashMonth);
  if (elCard) elCard.textContent = formatRD(cardMonth + transMonth);
  if (elTopAmt) elTopAmt.textContent = formatRD(topDay.total);
  if (elTopDate) elTopDate.textContent = topDay.total > 0 ? `${topDay.fecha} (${topDay.diaSemana})` : 'Sin datos';
  if (elDaysBadge) elDaysBadge.textContent = `${activeDaysCount} días con actividad`;

  // Renderizar filas del consolidado por día
  if (!sortedDays.length) {
    tbodyDays.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-slate-400">
      <div class="text-3xl mb-2">📆</div>
      <p class="font-extrabold text-slate-700">No hay ventas registradas en este mes (${sysReportState.monthlyMonth})</p>
      <p class="text-xs text-slate-400 mt-1">Seleccione otro mes en el selector superior.</p>
    </td></tr>`;
    if (tfootDays) tfootDays.innerHTML = '';
  } else {
    tbodyDays.innerHTML = sortedDays
      .map((d) => {
        return `
          <tr class="hover:bg-slate-50 transition border-b border-slate-100">
            <td class="py-3 px-4 font-mono font-extrabold text-slate-900">${d.fecha}</td>
            <td class="py-3 px-4 font-bold text-slate-700">${d.diaSemana}</td>
            <td class="py-3 px-4 text-center">
              <span class="px-2 py-0.5 rounded-full bg-slate-100 font-extrabold text-[11px] text-slate-800">${d.count} ventas</span>
            </td>
            <td class="py-3 px-4 text-right font-mono text-emerald-800 font-bold">${formatRD(d.cash)}</td>
            <td class="py-3 px-4 text-right font-mono text-sky-800 font-bold">${formatRD(d.card)}</td>
            <td class="py-3 px-4 text-right font-mono text-purple-800 font-bold">${formatRD(d.transfer)}</td>
            <td class="py-3 px-4 text-right font-extrabold text-slate-900 text-sm">${formatRD(d.total)}</td>
            <td class="py-3 px-4 text-center">
              <button type="button" onclick="jumpToDayReport('${d.fecha}')" class="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 font-extrabold text-xs transition cursor-pointer border border-teal-200 shadow-2xs">
                📅 Ver Detalle del Día
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    if (tfootDays) {
      tfootDays.innerHTML = `
        <tr>
          <td colspan="2" class="py-3 px-4 uppercase text-xs tracking-wider text-slate-700">TOTAL MES (${activeDaysCount} días)</td>
          <td class="py-3 px-4 text-center text-xs">${txs.length} ventas</td>
          <td class="py-3 px-4 text-right text-xs text-emerald-800">${formatRD(cashMonth)}</td>
          <td class="py-3 px-4 text-right text-xs text-sky-800">${formatRD(cardMonth)}</td>
          <td class="py-3 px-4 text-right text-xs text-purple-800">${formatRD(transMonth)}</td>
          <td class="py-3 px-4 text-right text-base text-indigo-900">${formatRD(totalMonth)}</td>
          <td></td>
        </tr>
      `;
    }
  }

  renderMonthlyAllTableRows();
}

function renderMonthlyAllTableRows() {
  const tbodyAll = document.getElementById('rep-monthly-all-tbody');
  if (!tbodyAll) return;

  const txs = (sysReportState.monthlyTransactions || []).filter((t) => t.estado_pedido !== 'RECHAZADO_RECETA');
  const q = sysReportState.monthlySearchQuery || '';

  const filtered = txs.filter((tx) => {
    if (!q) return true;
    const matchTicket = (tx.codigo_orden || '').toLowerCase().includes(q);
    const matchClient = (tx.cliente_nombre || '').toLowerCase().includes(q);
    const matchItems = (tx.items || []).some((i) => (i.nombre_comercial || '').toLowerCase().includes(q));
    return matchTicket || matchClient || matchItems;
  });

  if (!filtered.length) {
    tbodyAll.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-slate-400">No hay ventas registradas que coincidan con la búsqueda.</td></tr>`;
    return;
  }

  tbodyAll.innerHTML = filtered
    .map((tx) => {
      const itemsText = (tx.items || []).map((i) => `${i.cantidad_presentacion}x ${i.nombre_comercial}`).join(', ');
      return `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100">
          <td class="py-3 px-4 font-mono text-[11px] text-slate-600">${tx.fecha_hora || tx.fecha_dia}</td>
          <td class="py-3 px-4 font-mono font-extrabold text-slate-900">#${tx.codigo_orden}</td>
          <td class="py-3 px-4 font-bold text-slate-800">${tx.cliente_nombre || 'Cliente'}</td>
          <td class="py-3 px-4">
            <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold ${tx.canal === 'POS_MOSTRADOR' ? 'bg-teal-50 text-teal-800' : 'bg-indigo-50 text-indigo-800'}">${tx.canal}</span>
          </td>
          <td class="py-3 px-4">
            <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700">${tx.metodo_pago}</span>
          </td>
          <td class="py-3 px-4 text-[11px] text-slate-600 max-w-xs truncate" title="${itemsText}">${itemsText}</td>
          <td class="py-3 px-4 text-right font-extrabold text-slate-900">${formatRD(tx.total)}</td>
          <td class="py-3 px-4 text-center">
            <button type="button" onclick="openReceiptById(${tx.id})" class="px-2.5 py-1 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 font-extrabold text-xs transition border border-teal-200">
              🧾 Recibo
            </button>
          </td>
        </tr>
      `;
    })
    .join('');
}

function jumpToDayReport(dateStr) {
  sysReportState.dailyDate = dateStr;
  const picker = document.getElementById('rep-daily-picker');
  if (picker) picker.value = dateStr;
  switchReportSubTab('diario');
}

// -------------------------------------------------------------
// IMPRESIÓN FORMAL DE REPORTES (@media print)
// -------------------------------------------------------------

// =============================================================================
// MOTOR OFICIAL DE IMPRESION PROFESIONAL FARMASYS (IFRAME AISLADO & FISCAL)
// =============================================================================

function executePrintHtml(htmlContent, pageTitle = 'FarmaSys POS - Documento') {
  let printFrame = document.getElementById('sys-print-iframe');
  if (!printFrame) {
    printFrame = document.createElement('iframe');
    printFrame.id = 'sys-print-iframe';
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    document.body.appendChild(printFrame);
  }

  // Fallback en stage de la misma página
  const stage = document.getElementById('sys-print-stage');
  if (stage) {
    stage.innerHTML = htmlContent;
  }

  const doc = printFrame.contentWindow.document;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>${pageTitle}</title>
      <style>
        @page {
          size: auto;
          margin: 10mm 10mm 12mm 10mm;
        }
        body {
          font-family: Arial, sans-serif;
          color: #0f172a;
          background: #ffffff;
          margin: 0;
          padding: 8px;
          font-size: 11px;
          line-height: 1.35;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
          font-size: 10px;
        }
        th, td {
          border: 1px solid #94a3b8;
          padding: 5px 6px;
          text-align: left;
        }
        th {
          background-color: #f1f5f9 !important;
          font-weight: bold;
          text-transform: uppercase;
          font-size: 9px;
        }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .font-mono { font-family: 'Courier New', Courier, monospace; }
        .font-bold { font-weight: bold; }
        .header-box {
          border-bottom: 2px solid #0f172a;
          padding-bottom: 8px;
          margin-bottom: 12px;
        }
        .footer-signatures {
          margin-top: 35px;
          display: flex;
          justify-content: space-between;
          page-break-inside: avoid;
        }
        .sig-line {
          width: 30%;
          border-top: 1px solid #64748b;
          text-align: center;
          padding-top: 4px;
          font-size: 10px;
          color: #475569;
        }
        .badge-pill {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 9px;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      ${htmlContent}
    </body>
    </html>
  `);
  doc.close();

  setTimeout(() => {
    try {
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
    } catch (e) {
      console.error('Error invoking print iframe:', e);
      window.print();
    }
  }, 250);
}

function printCurrentModalReceipt() {
  const order = sysState.lastCompletedOrder;
  if (order) {
    printInvoiceReceipt(order);
    return;
  }
  const area = document.getElementById('printable-receipt-area');
  if (area) {
    executePrintHtml(`
      <div style="max-width: 320px; margin: 0 auto; font-family: 'Courier New', monospace; font-size: 11px;">
        ${area.innerHTML}
      </div>
    `, 'Recibo-FarmaSys');
  } else {
    window.print();
  }
}

function printPosTicketBody() {
  const body = document.getElementById('pos-ticket-body');
  if (!body) {
    window.print();
    return;
  }
  executePrintHtml(`
    <div style="max-width: 320px; margin: 0 auto; font-family: 'Courier New', monospace; font-size: 11px;">
      ${body.innerHTML}
    </div>
  `, 'Ticket-POS-FarmaSys');
}

function printInvoiceReceipt(order) {
  const f = sysState.authenticatedPharmacy || {
    nombre: 'Farmacia Davalsi - Principal',
    eslogan: 'FarmaSys - Sistema POS',
    rnc: '1-31-99887-2',
    telefono: '(809) 555-0199',
    direccion: 'Av. Abraham Lincoln #402, Piantini',
    mensaje_factura: '¡Gracias por su compra en FarmaSys!'
  };

  const itemsHtml = (order.items || []).map((i) => `
    <tr>
      <td style="padding: 3px 0; border: none;">${i.cantidad_presentacion}x ${i.presentacion} ${i.nombre_comercial}</td>
      <td style="padding: 3px 0; border: none; text-align: right; font-weight: bold;">${formatRD(i.subtotal)}</td>
    </tr>
  `).join('');

  const cashChangeHtml = order.monto_entregado_rd ? `
    <div style="display: flex; justify-content: space-between; margin-top: 4px;">
      <span>Efectivo Entregado:</span>
      <span style="font-weight: bold;">${formatRD(order.monto_entregado_rd)}</span>
    </div>
    <div style="display: flex; justify-content: space-between; font-weight: bold; color: #047857;">
      <span>Cambio / Vuelto:</span>
      <span>${formatRD(order.cambio_vuelto_rd || 0)}</span>
    </div>
  ` : '';

  const html = `
    <div style="max-width: 300px; margin: 0 auto; font-family: 'Courier New', Courier, monospace; font-size: 11px; line-height: 1.3;">
      <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
        <h2 style="margin: 0; font-size: 15px; font-weight: bold;">${f.nombre.toUpperCase()}</h2>
        <p style="margin: 2px 0; font-size: 10px;">${f.eslogan}</p>
        <p style="margin: 2px 0; font-size: 10px;">RNC: ${f.rnc} • Tel: ${f.telefono || f.telefono_whatsapp}</p>
        <p style="margin: 2px 0; font-size: 9px;">${f.direccion}</p>
      </div>

      <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; font-size: 10px;">
        <div><strong>FACTURA: #${order.codigo_orden}</strong></div>
        <div>Fecha: ${order.fecha_hora}</div>
        <div>Cliente: ${order.cliente_nombre}</div>
        <div>Método: ${order.metodo_pago} ${order.referencia_pago ? `(Ref: ${order.referencia_pago})` : ''}</div>
        <div>Cajero: ${order.atendido_por || 'Cajero de Turno'}</div>
      </div>

      <table style="width: 100%; border: none; margin: 6px 0; font-size: 10px;">
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="border-top: 1px dashed #000; padding-top: 6px; margin-top: 6px;">
        <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: bold;">
          <span>TOTAL FACTURADO:</span>
          <span>${formatRD(order.total)}</span>
        </div>
        ${cashChangeHtml}
      </div>

      <div style="text-align: center; border-top: 1px dashed #000; padding-top: 8px; margin-top: 8px; font-size: 10px;">
        <p style="margin: 2px 0; font-style: italic;">${f.mensaje_factura || '¡Gracias por su compra en FarmaSys!'}</p>
        <p style="margin: 4px 0 0 0; font-size: 8px; color: #475569;">FarmaSys POS - Sistema Farmacéutico Certificado</p>
      </div>
    </div>
  `;

  executePrintHtml(html, `Ticket-FarmaSys-${order.codigo_orden}`);
}

function buildInventoryReportHtml(prods, reportTitle = 'REPORTE GENERAL DE TODO EL INVENTARIO Y VALUACIÓN DE STOCK', includeAuditCols = false) {
  const farm = sysState.authenticatedPharmacy || {
    nombre: 'Farmacia Davalsi - Principal',
    rnc: '1-31-99887-2',
    telefono: '(809) 555-0199',
    direccion: 'Santo Domingo, República Dominicana'
  };

  let totalUnits = 0;
  let totalValuation = 0;
  let countMerch = 0;
  let countMed = 0;

  const rows = prods
    .map((p, idx) => {
      const units = Number(
        p.inventario ? p.inventario.stock_total_unidades : p.stock_total_unidades || 0
      );
      const price = Number(p.precio_base || 0);
      const subVal = units * price;
      totalUnits += units;
      totalValuation += subVal;

      const isMerch = isProductMerchandise(p);
      if (isMerch) countMerch++;
      else countMed++;

      const uBlister = Math.max(1, p.unidades_por_blister || 1);
      const uCaja = p.inventario
        ? p.inventario.unidades_por_caja
        : uBlister * Math.max(1, p.blisters_por_caja || 1);
      const cajas = uCaja > 1 ? Math.floor(units / uCaja) : 0;
      const blist = !isMerch && uBlister > 1 ? Math.floor((units % uCaja) / uBlister) : 0;
      const sueltas = !isMerch && uBlister > 1 ? units % uBlister : (uCaja > 1 ? units % uCaja : units);

      const desgloseStr = isMerch
        ? `${units} unid.${cajas > 0 ? ` (${cajas} cj)` : ''}`
        : `${cajas}c / ${blist}b / ${sueltas}u`;

      const vState = p.vencimiento ? p.vencimiento.estado_vencimiento : 'VIGENTE';
      let vColor = '#047857';
      if (vState === 'VENCIDO') vColor = '#b91c1c';
      else if (vState === 'CRITICO_30D') vColor = '#c2410c';
      else if (vState === 'PREVENTIVO_90D') vColor = '#b45309';

      return `
        <tr>
          <td class="text-center" style="border: 1px solid #94a3b8; padding: 5px;">${idx + 1}</td>
          <td class="font-mono text-center" style="border: 1px solid #94a3b8; padding: 5px;">${p.codigo_barras || 'S/C'}</td>
          <td style="border: 1px solid #94a3b8; padding: 5px;">
            <strong>${p.nombre_comercial}</strong>
            <span style="display: block; font-size: 9px; color: #475569;">${p.principio_activo || ''} ${p.concentracion || ''}</span>
          </td>
          <td class="text-center" style="border: 1px solid #94a3b8; padding: 5px; font-size: 9px; font-weight: bold; color: ${isMerch ? '#0f766e' : '#0369a1'};">
            ${isMerch ? 'MERCANCÍA' : 'MEDICAMENTO'}
          </td>
          <td style="border: 1px solid #94a3b8; padding: 5px;">${p.categoria || 'General'}</td>
          <td class="text-center font-bold font-mono" style="border: 1px solid #94a3b8; padding: 5px;">${p.ubicacion_anaquel || 'A-01'}</td>
          <td class="font-mono text-center" style="border: 1px solid #94a3b8; padding: 5px;">${p.lote || 'S/L'}</td>
          <td class="text-center" style="border: 1px solid #94a3b8; padding: 5px; color: ${vColor}; font-weight: bold;">${p.fecha_vencimiento || 'N/A'}</td>
          <td class="text-center font-mono" style="border: 1px solid #94a3b8; padding: 5px;">${desgloseStr}</td>
          <td class="text-right font-bold font-mono" style="border: 1px solid #94a3b8; padding: 5px; background: #f0fdfa;">${units}</td>
          ${
            includeAuditCols
              ? `
            <td style="border: 1px solid #94a3b8; padding: 5px; width: 85px;"></td>
            <td style="border: 1px solid #94a3b8; padding: 5px; width: 70px;"></td>
            <td style="border: 1px solid #94a3b8; padding: 5px; width: 110px;"></td>
          `
              : `
            <td class="text-right font-mono" style="border: 1px solid #94a3b8; padding: 5px;">${formatRD(price)}</td>
            <td class="text-right font-bold font-mono" style="border: 1px solid #94a3b8; padding: 5px; background: #ecfdf5;">${formatRD(subVal)}</td>
          `
          }
        </tr>
      `;
    })
    .join('');

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 11px;">
      <div class="header-box" style="border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h1 style="margin: 0; font-size: 18px; font-weight: 900; letter-spacing: -0.3px;">${farm.nombre.toUpperCase()}</h1>
            <p style="margin: 2px 0; font-size: 11px; color: #475569;">RNC: ${farm.rnc || '1-31-99887-2'} • Tel: ${farm.telefono || farm.telefono_whatsapp || '(809) 555-0199'} • ${farm.direccion}</p>
            <h2 style="margin: 6px 0 0 0; font-size: 13px; color: #0f766e; text-transform: uppercase; font-weight: 800;">${reportTitle}</h2>
          </div>
          <div style="text-align: right; font-size: 10px; color: #475569;">
            <div>Fecha de Emisión: <strong>${new Date().toLocaleDateString('es-DO')}</strong></div>
            <div>Hora: <strong>${new Date().toLocaleTimeString('es-DO')}</strong></div>
            <div>Total Referencias: <strong>${prods.length} artículos (${countMed} Med. / ${countMerch} Merc.)</strong></div>
          </div>
        </div>
      </div>

      <div style="display: flex; flex-wrap: wrap; gap: 18px; margin-bottom: 14px; background: #f8fafc; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 11px;">
        <div>Total Artículos Listados: <strong>${prods.length} productos</strong></div>
        <div>Existencia Total en Sucursal: <strong style="color: #0f766e;">${totalUnits.toLocaleString('es-DO')} unidades mínimas</strong></div>
        <div>Valuación Monetaria Total: <strong style="color: #047857;">${formatRD(totalValuation)}</strong></div>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
        <thead>
          <tr style="background-color: #e2e8f0; text-transform: uppercase; font-size: 9px;">
            <th class="text-center" style="border: 1px solid #94a3b8; padding: 6px;">#</th>
            <th class="text-center" style="border: 1px solid #94a3b8; padding: 6px;">CÓDIGO</th>
            <th style="border: 1px solid #94a3b8; padding: 6px;">ARTÍCULO (MEDICAMENTO / MERCANCÍA)</th>
            <th class="text-center" style="border: 1px solid #94a3b8; padding: 6px;">TIPO</th>
            <th style="border: 1px solid #94a3b8; padding: 6px;">CATEGORÍA</th>
            <th class="text-center" style="border: 1px solid #94a3b8; padding: 6px;">ANAQUEL</th>
            <th class="text-center" style="border: 1px solid #94a3b8; padding: 6px;">LOTE</th>
            <th class="text-center" style="border: 1px solid #94a3b8; padding: 6px;">VENCE</th>
            <th class="text-center" style="border: 1px solid #94a3b8; padding: 6px;">EMPAQUE / DESGLOSE</th>
            <th class="text-right" style="border: 1px solid #94a3b8; padding: 6px;">STOCK UNID.</th>
            ${
              includeAuditCols
                ? `
              <th class="text-center" style="border: 1px solid #94a3b8; padding: 6px;">CONTEO FÍSICO</th>
              <th class="text-center" style="border: 1px solid #94a3b8; padding: 6px;">DIFERENCIA</th>
              <th class="text-center" style="border: 1px solid #94a3b8; padding: 6px;">OBSERVACIONES</th>
            `
                : `
              <th class="text-right" style="border: 1px solid #94a3b8; padding: 6px;">PRECIO UNIT.</th>
              <th class="text-right" style="border: 1px solid #94a3b8; padding: 6px;">VALOR TOTAL</th>
            `
            }
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
        <tfoot>
          <tr style="background-color: #f1f5f9; font-weight: bold; font-size: 10px;">
            <td colspan="9" class="text-right" style="border: 1px solid #94a3b8; padding: 6px;">TOTALES GENERALES DEL INVENTARIO:</td>
            <td class="text-right font-mono" style="border: 1px solid #94a3b8; padding: 6px; color: #0f766e;">${totalUnits.toLocaleString('es-DO')} u</td>
            ${
              includeAuditCols
                ? `<td colspan="3" style="border: 1px solid #94a3b8; padding: 6px;"></td>`
                : `
              <td style="border: 1px solid #94a3b8; padding: 6px;"></td>
              <td class="text-right font-mono" style="border: 1px solid #94a3b8; padding: 6px; color: #047857;">${formatRD(totalValuation)}</td>
            `
            }
          </tr>
        </tfoot>
      </table>

      <div class="footer-signatures" style="margin-top: 38px; display: flex; justify-content: space-between; page-break-inside: avoid;">
        <div class="sig-line" style="width: 30%; border-top: 1px solid #64748b; text-align: center; padding-top: 5px; font-size: 10px; color: #475569;">Elaborado por (Cajero / Auxiliar)</div>
        <div class="sig-line" style="width: 30%; border-top: 1px solid #64748b; text-align: center; padding-top: 5px; font-size: 10px; color: #475569;">Supervisado por (Encargado Almacén)</div>
        <div class="sig-line" style="width: 30%; border-top: 1px solid #64748b; text-align: center; padding-top: 5px; font-size: 10px; color: #475569;">Lic. Farmacéutico Regente</div>
      </div>
    </div>
  `;
}

function renderPrintableInventorySheetPreview() {
  const container = document.getElementById('inv-printable-sheet-preview');
  if (!container) return;

  const scope = document.getElementById('inv-sheet-scope-select')?.value || 'TODOS';
  const includeAudit = !!document.getElementById('inv-sheet-audit-cols')?.checked;

  let items = [...(sysState.products || [])];
  let title = 'REPORTE GENERAL DE TODO EL INVENTARIO Y VALUACIÓN DE STOCK';

  if (scope === 'MERCANCIA') {
    items = items.filter((p) => isProductMerchandise(p));
    title = 'REPORTE DE INVENTARIO — MERCANCÍAS, DESODORANTES, LIMAS Y CUIDADO PERSONAL';
  } else if (scope === 'MEDICAMENTOS') {
    items = items.filter((p) => !isProductMerchandise(p));
    title = 'REPORTE DE INVENTARIO — MEDICAMENTOS FARMACÉUTICOS';
  } else if (scope === 'STOCK_BAJO') {
    items = items.filter((p) => p.inventario && p.inventario.alerta_stock_bajo);
    title = 'REPORTE DE INVENTARIO — ARTÍCULOS EN ALERTA DE STOCK BAJO';
  } else if (scope === 'POR_VENCER') {
    items = items.filter(
      (p) =>
        p.vencimiento &&
        ['CRITICO_30D', 'PREVENTIVO_90D', 'ALERTA_7_MESES'].includes(
          p.vencimiento.estado_vencimiento
        )
    );
    title = 'REPORTE DE INVENTARIO — LOTES PRÓXIMOS A VENCER';
  }

  if (includeAudit) {
    title += ' (HOJA DE CONTEO FÍSICO Y AUDITORÍA DE ANAQUEL)';
  }

  container.innerHTML = buildInventoryReportHtml(items, title, includeAudit);
}

function printCurrentSheetPreview() {
  const container = document.getElementById('inv-printable-sheet-preview');
  if (!container || !container.innerHTML.trim()) {
    renderPrintableInventorySheetPreview();
  }
  const html = container ? container.innerHTML : buildInventoryReportHtml(sysState.products || []);
  executePrintHtml(html, 'Inventario-Completo-FarmaSys');
}

function printInventoryList(mode = 'TODOS') {
  if (mode === 'FILTRADO') {
    const filtered = getFilteredInventoryProducts();
    const html = buildInventoryReportHtml(
      filtered,
      `REPORTE DE INVENTARIO FILTRADO (${filtered.length} ARTÍCULOS)`,
      false
    );
    executePrintHtml(html, 'Inventario-Filtrado-FarmaSys');
    return;
  }

  const allProds = sysState.products || [];
  const html = buildInventoryReportHtml(
    allProds,
    'REPORTE GENERAL DE TODO EL INVENTARIO Y VALUACIÓN DE STOCK',
    false
  );
  executePrintHtml(html, 'Inventario-General-Completo-FarmaSys');
}

function printPhysicalCountSheet() {
  const allProds = sysState.products || [];
  const html = buildInventoryReportHtml(
    allProds,
    'HOJA OFICIAL DE CONTEO FÍSICO Y AUDITORÍA DE ANAQUELES',
    true
  );
  executePrintHtml(html, 'Hoja-Conteo-Fisico-Inventario-FarmaSys');
}

function printLowStockReport() {
  const farm = sysState.authenticatedPharmacy || {
    nombre: 'Farmacia Davalsi - Principal',
    rnc: '1-31-99887-2',
    direccion: 'Santo Domingo, República Dominicana'
  };

  const prods = (sysState.products || []).filter((p) => p.inventario && p.inventario.alerta_stock_bajo);

  const rows = prods.map((p, idx) => {
    const stockActual = p.inventario.stock_total_unidades;
    const stockMin = p.inventario.stock_minimo_alerta || 20;
    const deficit = Math.max(0, stockMin - stockActual);

    return `
      <tr>
        <td class="text-center">${idx + 1}</td>
        <td class="font-mono text-center">${p.codigo_barras || 'S/C'}</td>
        <td>
          <strong>${p.nombre_comercial}</strong>
          <span style="display: block; font-size: 9px; color: #475569;">${p.principio_activo || ''}</span>
        </td>
        <td>${p.laboratorio || 'N/A'}</td>
        <td class="text-center font-mono font-bold">${p.ubicacion_anaquel || 'A-01'}</td>
        <td class="text-right font-black font-mono" style="color: #b91c1c;">${stockActual} u</td>
        <td class="text-right font-mono font-bold">${stockMin} u</td>
        <td class="text-right font-black font-mono" style="color: #c2410c;">+${deficit} u</td>
        <td class="text-center"><span style="color: #b91c1c; font-weight: bold;">PEDIDO URGENTE</span></td>
      </tr>
    `;
  }).join('');

  const html = `
    <div>
      <div class="header-box">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h1 style="margin: 0; font-size: 18px; font-weight: bold;">${farm.nombre.toUpperCase()}</h1>
            <p style="margin: 2px 0; font-size: 11px; color: #475569;">RNC: ${farm.rnc || '1-31-99887-2'} • ${farm.direccion}</p>
            <h2 style="margin: 6px 0 0 0; font-size: 14px; color: #b91c1c; text-transform: uppercase;">REPORTE DE MEDICAMENTOS CON STOCK CRÍTICO (BAJO STOCK MÍNIMO)</h2>
          </div>
          <div style="text-align: right; font-size: 10px; color: #475569;">
            <div>Fecha: <strong>${new Date().toLocaleDateString('es-DO')}</strong></div>
            <div>Total en Alerta: <strong style="color: #b91c1c;">${prods.length} medicamento(s)</strong></div>
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th class="text-center">#</th>
            <th class="text-center">CÓDIGO</th>
            <th>MEDICAMENTO</th>
            <th>LABORATORIO</th>
            <th class="text-center">ANAQUEL</th>
            <th class="text-right">STOCK ACTUAL</th>
            <th class="text-right">STOCK MÍNIMO</th>
            <th class="text-right">DÉFICIT A COMPRAR</th>
            <th class="text-center">PRIORIDAD</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="9" class="text-center">No hay productos con stock crítico en este momento.</td></tr>'}
        </tbody>
      </table>

      <div class="footer-signatures">
        <div class="sig-line">Encargado de Compras</div>
        <div class="sig-line">Administrador de Farmacia</div>
      </div>
    </div>
  `;

  executePrintHtml(html, 'Stock-Critico-FarmaSys');
}

function printExpirationsReport() {
  const farm = sysState.authenticatedPharmacy || {
    nombre: 'Farmacia Davalsi - Principal',
    rnc: '1-31-99887-2',
    direccion: 'Santo Domingo, República Dominicana'
  };

  const prods = (sysState.products || []).filter((p) => p.vencimiento && (p.vencimiento.es_menor_7_meses || p.vencimiento.dias_para_vencer <= 214));

  let totalRiesgoRD = 0;
  let totalUnidadesAfectadas = 0;

  const rows = prods.map((p, idx) => {
    const v = p.vencimiento;
    const u = Number(p.inventario ? p.inventario.stock_total_unidades : p.stock_total_unidades || 0);
    const subRiesgo = u * Number(p.precio_base || 0);
    totalUnidadesAfectadas += u;
    totalRiesgoRD += subRiesgo;

    let estadoSanitario = 'ALERTA ≤ 7 MESES';
    let stColor = '#b45309';
    if (v.vencido) {
      estadoSanitario = 'VENCIDO - BLOQUEADO';
      stColor = '#b91c1c';
    } else if (v.dias_para_vencer <= 30) {
      estadoSanitario = 'CRÍTICO ≤ 30 DÍAS';
      stColor = '#c2410c';
    } else if (v.dias_para_vencer <= 90) {
      estadoSanitario = 'PREVENTIVO ≤ 90 DÍAS';
      stColor = '#d97706';
    }

    return `
      <tr>
        <td class="text-center">${idx + 1}</td>
        <td>
          <strong>${p.nombre_comercial}</strong>
          <span style="display: block; font-size: 9px; color: #475569;">${p.principio_activo || ''}</span>
        </td>
        <td class="font-mono text-center">${p.lote || 'S/L'}</td>
        <td class="text-center font-bold" style="color: ${stColor};">${p.fecha_vencimiento}</td>
        <td class="text-center font-bold font-mono">${v.dias_para_vencer} días</td>
        <td class="text-center font-extrabold" style="color: ${stColor}; font-size: 9px;">${estadoSanitario}</td>
        <td class="text-right font-bold font-mono">${u} unid.</td>
        <td class="text-right font-bold font-mono">${formatRD(subRiesgo)}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <div>
      <div class="header-box">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h1 style="margin: 0; font-size: 18px; font-weight: bold;">${farm.nombre.toUpperCase()}</h1>
            <p style="margin: 2px 0; font-size: 11px; color: #475569;">RNC: ${farm.rnc || '1-31-99887-2'} • ${farm.direccion}</p>
            <h2 style="margin: 6px 0 0 0; font-size: 14px; color: #b91c1c; text-transform: uppercase;">REPORTE SANITARIO DE MEDICAMENTOS PRÓXIMOS A VENCER (≤ 7 MESES / CONTROL FEFO)</h2>
          </div>
          <div style="text-align: right; font-size: 10px; color: #475569;">
            <div>Corte Sanitario: <strong>${new Date().toLocaleDateString('es-DO')}</strong></div>
            <div>Lotes en Alerta: <strong style="color: #b91c1c;">${prods.length}</strong></div>
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 15px; margin-bottom: 12px; background: #fff1f2; padding: 8px 12px; border: 1px solid #fecdd3; border-radius: 6px;">
        <div>Total Unidades Afectadas: <strong style="color: #9f1239;">${totalUnidadesAfectadas.toLocaleString('es-DO')} unidades</strong></div>
        <div>Capital en Riesgo: <strong style="color: #b91c1c;">${formatRD(totalRiesgoRD)}</strong></div>
      </div>

      <table>
        <thead>
          <tr>
            <th class="text-center">#</th>
            <th>MEDICAMENTO</th>
            <th class="text-center">LOTE</th>
            <th class="text-center">FECHA VENCE</th>
            <th class="text-center">DÍAS RESTANTES</th>
            <th class="text-center">ESTADO SANITARIO</th>
            <th class="text-right">STOCK AFECTADO</th>
            <th class="text-right">VALOR EN RIESGO</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="8" class="text-center">No hay medicamentos próximos a vencer en los próximos 7 meses.</td></tr>'}
        </tbody>
      </table>

      <div class="footer-signatures">
        <div class="sig-line">Farmacéutico de Turno</div>
        <div class="sig-line">Director Técnico Farmacéutico</div>
      </div>
    </div>
  `;

  executePrintHtml(html, 'Vencimientos-7Meses-FarmaSys');
}

function printActiveSalesReport() {
  if (sysReportState.activeSubTab === 'mensual') {
    printMonthlySalesReport();
  } else if (sysReportState.activeSubTab === 'comparativa') {
    printComparativeSalesReport();
  } else {
    printDailySalesReport();
  }
}

function printDailySalesReport() {
  const farm = sysState.authenticatedPharmacy || {
    nombre: 'Farmacia Davalsi - Principal',
    rnc: '1-31-99887-2',
    direccion: 'Santo Domingo, República Dominicana'
  };

  const txs = (sysReportState.dailyTransactions || []).filter((t) => t.estado_pedido !== 'RECHAZADO_RECETA');
  const fechaRep = sysReportState.dailyDate || new Date().toISOString().slice(0, 10);

  let sumTotal = 0;
  let sumCash = 0;
  let sumCard = 0;
  let sumTransfer = 0;
  let sumCredit = 0;

  txs.forEach((tx) => {
    const tot = Number(tx.total || 0);
    sumTotal += tot;
    if (tx.metodo_pago === 'EFECTIVO') sumCash += tot;
    else if (tx.metodo_pago === 'TARJETA') sumCard += tot;
    else if (tx.metodo_pago === 'CREDITO_FIADO') sumCredit += tot;
    else sumTransfer += tot;
  });

  const rows = txs.map((tx, idx) => {
    const itemsList = (tx.items || []).map((i) => `${i.cantidad_presentacion}x ${i.nombre_comercial}`).join('; ');
    return `
      <tr>
        <td class="text-center">${idx + 1}</td>
        <td class="font-mono font-bold text-center">#${tx.codigo_orden}</td>
        <td class="text-center font-mono">${(tx.fecha_hora ? tx.fecha_hora.slice(11, 19) : '')}</td>
        <td>${tx.cliente_nombre || 'Cliente Mostrador'}</td>
        <td class="text-center font-bold">${tx.canal === 'POS_MOSTRADOR' ? 'POS Mostrador' : 'App Paciente'}</td>
        <td class="text-center font-bold">${tx.metodo_pago}</td>
        <td style="font-size: 9px;">${itemsList || 'Medicamentos en mostrador'}</td>
        <td class="text-right font-bold font-mono">${formatRD(tx.total)}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <div>
      <div class="header-box">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h1 style="margin: 0; font-size: 18px; font-weight: bold;">${farm.nombre.toUpperCase()}</h1>
            <p style="margin: 2px 0; font-size: 11px; color: #475569;">RNC: ${farm.rnc || '1-31-99887-2'} • ${farm.direccion}</p>
            <h2 style="margin: 6px 0 0 0; font-size: 14px; color: #0f766e; text-transform: uppercase;">REPORTE OFICIAL DE VENTAS DIARIAS — FECHA: ${fechaRep}</h2>
          </div>
          <div style="text-align: right; font-size: 10px; color: #475569;">
            <div>Transacciones: <strong>${txs.length}</strong></div>
            <div>Impreso: <strong>${new Date().toLocaleTimeString('es-DO')}</strong></div>
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 15px; margin-bottom: 12px; background: #f0fdf4; padding: 8px 12px; border: 1px solid #bbf7d0; border-radius: 6px; font-size: 10px;">
        <div>TOTAL FACTURADO: <strong style="font-size: 12px; color: #15803d;">${formatRD(sumTotal)}</strong></div>
        <div>Efectivo: <strong>${formatRD(sumCash)}</strong></div>
        <div>Tarjetas: <strong>${formatRD(sumCard)}</strong></div>
        <div>Transferencias: <strong>${formatRD(sumTransfer)}</strong></div>
        <div>Crédito/Fiado: <strong>${formatRD(sumCredit)}</strong></div>
      </div>

      <table>
        <thead>
          <tr>
            <th class="text-center">#</th>
            <th class="text-center">FACTURA</th>
            <th class="text-center">HORA</th>
            <th>CLIENTE</th>
            <th class="text-center">CANAL</th>
            <th class="text-center">PAGO</th>
            <th>MEDICAMENTOS</th>
            <th class="text-right">TOTAL RD$</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="8" class="text-center">No se registraron ventas en esta fecha.</td></tr>'}
        </tbody>
      </table>

      <div class="footer-signatures">
        <div class="sig-line">Cajero Responsable</div>
        <div class="sig-line">Supervisor de Sucursal</div>
        <div class="sig-line">Contabilidad / Finanzas</div>
      </div>
    </div>
  `;

  executePrintHtml(html, `Ventas-Diarias-${fechaRep}`);
}

function printMonthlySalesReport() {
  const farm = sysState.authenticatedPharmacy || {
    nombre: 'Farmacia Davalsi - Principal',
    rnc: '1-31-99887-2',
    direccion: 'Santo Domingo, República Dominicana'
  };

  const txs = (sysReportState.monthlyTransactions || []).filter((t) => t.estado_pedido !== 'RECHAZADO_RECETA');
  const mesRep = sysReportState.monthlyMonth || new Date().toISOString().slice(0, 7);

  let sumTotal = 0;
  let sumCash = 0;
  let sumCard = 0;
  let sumTransfer = 0;

  txs.forEach((tx) => {
    const tot = Number(tx.total || 0);
    sumTotal += tot;
    if (tx.metodo_pago === 'EFECTIVO') sumCash += tot;
    else if (tx.metodo_pago === 'TARJETA') sumCard += tot;
    else sumTransfer += tot;
  });

  const rows = txs.map((tx, idx) => `
    <tr>
      <td class="text-center">${idx + 1}</td>
      <td class="font-mono font-bold text-center">#${tx.codigo_orden}</td>
      <td class="text-center font-mono">${(tx.fecha_hora ? tx.fecha_hora.slice(0, 10) : '')}</td>
      <td>${tx.cliente_nombre || 'Cliente Mostrador'}</td>
      <td class="text-center">${tx.canal === 'POS_MOSTRADOR' ? 'POS Mostrador' : 'App Paciente'}</td>
      <td class="text-center font-bold">${tx.metodo_pago}</td>
      <td class="text-right font-bold font-mono">${formatRD(tx.total)}</td>
    </tr>
  `).join('');

  const html = `
    <div>
      <div class="header-box">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h1 style="margin: 0; font-size: 18px; font-weight: bold;">${farm.nombre.toUpperCase()}</h1>
            <p style="margin: 2px 0; font-size: 11px; color: #475569;">RNC: ${farm.rnc || '1-31-99887-2'} • ${farm.direccion}</p>
            <h2 style="margin: 6px 0 0 0; font-size: 14px; color: #1e3a8a; text-transform: uppercase;">REPORTE OFICIAL DE VENTAS MENSUALES — PERÍODO: ${mesRep}</h2>
          </div>
          <div style="text-align: right; font-size: 10px; color: #475569;">
            <div>Total Facturas: <strong>${txs.length}</strong></div>
            <div>Fecha: <strong>${new Date().toLocaleDateString('es-DO')}</strong></div>
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 15px; margin-bottom: 12px; background: #eff6ff; padding: 8px 12px; border: 1px solid #bfdbfe; border-radius: 6px; font-size: 10px;">
        <div>TOTAL MES: <strong style="font-size: 12px; color: #1d4ed8;">${formatRD(sumTotal)}</strong></div>
        <div>Efectivo: <strong>${formatRD(sumCash)}</strong></div>
        <div>Tarjetas: <strong>${formatRD(sumCard)}</strong></div>
        <div>Transferencias: <strong>${formatRD(sumTransfer)}</strong></div>
      </div>

      <table>
        <thead>
          <tr>
            <th class="text-center">#</th>
            <th class="text-center">FACTURA</th>
            <th class="text-center">FECHA</th>
            <th>CLIENTE</th>
            <th class="text-center">CANAL</th>
            <th class="text-center">MÉTODO PAGO</th>
            <th class="text-right">TOTAL RD$</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="7" class="text-center">No se registraron ventas en este mes.</td></tr>'}
        </tbody>
      </table>

      <div class="footer-signatures">
        <div class="sig-line">Auditor Financiero</div>
        <div class="sig-line">Gerencia General</div>
      </div>
    </div>
  `;

  executePrintHtml(html, `Ventas-Mensuales-${mesRep}`);
}

function printComparativeSalesReport() {
  const farm = sysState.authenticatedPharmacy || {
    nombre: 'Farmacia Davalsi - Principal',
    rnc: '1-31-99887-2',
    direccion: 'Santo Domingo, República Dominicana'
  };

  const comp = sysReportState.comparativeStats;
  if (!comp || !comp.diaria) {
    showToast('Datos comparativos no cargados aún.', 'error');
    return;
  }

  const d = comp.diaria;
  const s = comp.semanal;
  const m = comp.mensual;

  const weeklyRows = (s.desglose_dias || []).map((day) => `
    <tr>
      <td class="font-bold">${day.dia}</td>
      <td class="text-center font-mono">${day.fecha_actual}</td>
      <td class="text-right font-mono font-bold">${formatRD(day.actual_rd)}</td>
      <td class="text-center font-mono">${day.fecha_anterior}</td>
      <td class="text-right font-mono font-bold">${formatRD(day.anterior_rd)}</td>
      <td class="text-right font-mono font-bold" style="color: ${day.diferencia_rd >= 0 ? '#15803d' : '#b91c1c'};">
        ${day.diferencia_rd >= 0 ? '+' : ''}${formatRD(day.diferencia_rd)}
      </td>
    </tr>
  `).join('');

  const html = `
    <div>
      <div class="header-box">
        <h1 style="margin: 0; font-size: 18px; font-weight: bold;">${farm.nombre.toUpperCase()}</h1>
        <p style="margin: 2px 0; font-size: 11px; color: #475569;">RNC: ${farm.rnc || '1-31-99887-2'} • ${farm.direccion}</p>
        <h2 style="margin: 6px 0 0 0; font-size: 14px; color: #0f766e; text-transform: uppercase;">REPORTE DE COMPARATIVA DE RENDIMIENTO DE VENTAS</h2>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 15px;">
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; background: #f8fafc;">
          <strong style="text-transform: uppercase; font-size: 10px; color: #475569;">1. DIARIA (Hoy vs Ayer)</strong>
          <div style="margin-top: 4px; font-size: 11px;">Hoy (${d.hoy.fecha}): <strong>${formatRD(d.hoy.total_rd)}</strong> (${d.hoy.ventas_count} ventas)</div>
          <div style="font-size: 11px;">Ayer (${d.ayer.fecha}): <strong>${formatRD(d.ayer.total_rd)}</strong> (${d.ayer.ventas_count} ventas)</div>
          <div style="margin-top: 4px; font-weight: bold; color: ${d.diferencia_rd >= 0 ? '#15803d' : '#b91c1c'};">
            Diferencia: ${d.diferencia_rd >= 0 ? '+' : ''}${formatRD(d.diferencia_rd)} (${d.variacion_pct}%)
          </div>
        </div>

        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; background: #f8fafc;">
          <strong style="text-transform: uppercase; font-size: 10px; color: #475569;">2. SEMANAL (Esta vs Anterior)</strong>
          <div style="margin-top: 4px; font-size: 11px;">Esta semana: <strong>${formatRD(s.semana_actual.total_rd)}</strong> (${s.semana_actual.ventas_count} ventas)</div>
          <div style="font-size: 11px;">Semana anterior: <strong>${formatRD(s.semana_anterior.total_rd)}</strong> (${s.semana_anterior.ventas_count} ventas)</div>
          <div style="margin-top: 4px; font-weight: bold; color: ${s.diferencia_rd >= 0 ? '#15803d' : '#b91c1c'};">
            Diferencia: ${s.diferencia_rd >= 0 ? '+' : ''}${formatRD(s.diferencia_rd)} (${s.variacion_pct}%)
          </div>
        </div>

        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; background: #f8fafc;">
          <strong style="text-transform: uppercase; font-size: 10px; color: #475569;">3. MENSUAL (Este vs Anterior)</strong>
          <div style="margin-top: 4px; font-size: 11px;">Este mes (${m.mes_actual.mes}): <strong>${formatRD(m.mes_actual.total_rd)}</strong></div>
          <div style="font-size: 11px;">Mes anterior (${m.mes_anterior.mes}): <strong>${formatRD(m.mes_anterior.total_rd)}</strong></div>
          <div style="margin-top: 4px; font-weight: bold; color: ${m.diferencia_rd >= 0 ? '#15803d' : '#b91c1c'};">
            Diferencia: ${m.diferencia_rd >= 0 ? '+' : ''}${formatRD(m.diferencia_rd)} (${m.variacion_pct}%)
          </div>
        </div>
      </div>

      <h3 style="font-size: 12px; margin: 10px 0 4px 0; text-transform: uppercase;">Desglose Comparativo Día por Día (Lunes a Domingo)</h3>
      <table>
        <thead>
          <tr>
            <th>DÍA</th>
            <th class="text-center">FECHA ACTUAL</th>
            <th class="text-right">VENTA ACTUAL</th>
            <th class="text-center">FECHA ANTERIOR</th>
            <th class="text-right">VENTA ANTERIOR</th>
            <th class="text-right">VARIACIÓN NETA</th>
          </tr>
        </thead>
        <tbody>
          ${weeklyRows}
        </tbody>
      </table>

      <div class="footer-signatures">
        <div class="sig-line">Director de Operaciones</div>
        <div class="sig-line">Gerencia Financiera</div>
      </div>
    </div>
  `;

  executePrintHtml(html, 'Comparativa-Ventas-FarmaSys');
}

function printDebtorsReport() {
  const farm = sysState.authenticatedPharmacy || {
    nombre: 'Farmacia Davalsi - Principal',
    rnc: '1-31-99887-2',
    direccion: 'Santo Domingo, República Dominicana'
  };

  const debtors = sysState.debtors || [];
  let totalDeuda = 0;
  let totalAbonado = 0;
  let totalPendiente = 0;

  const rows = debtors.map((d, idx) => {
    const deuda = Number(d.monto_deuda_rd || 0);
    const abonado = Number(d.monto_abonado_rd || 0);
    const saldo = Number(d.saldo_pendiente_rd || 0);
    totalDeuda += deuda;
    totalAbonado += abonado;
    totalPendiente += saldo;

    return `
      <tr>
        <td class="text-center">${idx + 1}</td>
        <td><strong>${d.cliente_nombre}</strong></td>
        <td class="font-mono text-center">${d.cliente_telefono || 'S/N'}</td>
        <td class="font-mono text-center">${d.cedula || 'S/C'}</td>
        <td style="font-size: 9px;">${d.concepto || 'Crédito medicamentos'}</td>
        <td class="text-right font-mono">${formatRD(deuda)}</td>
        <td class="text-right font-mono" style="color: #047857;">${formatRD(abonado)}</td>
        <td class="text-right font-mono font-bold" style="color: #b91c1c;">${formatRD(saldo)}</td>
        <td class="text-center font-bold" style="font-size: 9px;">${d.estado}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <div>
      <div class="header-box">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h1 style="margin: 0; font-size: 18px; font-weight: bold;">${farm.nombre.toUpperCase()}</h1>
            <p style="margin: 2px 0; font-size: 11px; color: #475569;">RNC: ${farm.rnc || '1-31-99887-2'} • ${farm.direccion}</p>
            <h2 style="margin: 6px 0 0 0; font-size: 14px; color: #b45309; text-transform: uppercase;">REPORTE DE CUENTAS POR COBRAR Y CARTERA DE DEUDORES</h2>
          </div>
          <div style="text-align: right; font-size: 10px; color: #475569;">
            <div>Fecha: <strong>${new Date().toLocaleDateString('es-DO')}</strong></div>
            <div>Total Clientes: <strong>${debtors.length}</strong></div>
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 15px; margin-bottom: 12px; background: #fffbeb; padding: 8px 12px; border: 1px solid #fde68a; border-radius: 6px; font-size: 10px;">
        <div>TOTAL CARTERA: <strong>${formatRD(totalDeuda)}</strong></div>
        <div>TOTAL ABONADO: <strong style="color: #047857;">${formatRD(totalAbonado)}</strong></div>
        <div>BALANCE TOTAL PENDIENTE: <strong style="color: #b91c1c; font-size: 12px;">${formatRD(totalPendiente)}</strong></div>
      </div>

      <table>
        <thead>
          <tr>
            <th class="text-center">#</th>
            <th>CLIENTE</th>
            <th class="text-center">TELÉFONO</th>
            <th class="text-center">CÉDULA</th>
            <th>CONCEPTO</th>
            <th class="text-right">MONTO ORIG.</th>
            <th class="text-right">ABONADO</th>
            <th class="text-right">SALDO PENDIENTE</th>
            <th class="text-center">ESTADO</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="9" class="text-center">No hay cuentas por cobrar registradas.</td></tr>'}
        </tbody>
      </table>

      <div class="footer-signatures">
        <div class="sig-line">Gestor de Cobranzas</div>
        <div class="sig-line">Administrador de Sucursal</div>
      </div>
    </div>
  `;

  executePrintHtml(html, 'Cuentas-Por-Cobrar-FarmaSys');
}

function printAuditLogsReport() {
  const farm = sysState.authenticatedPharmacy || {
    nombre: 'Farmacia Davalsi - Principal',
    rnc: '1-31-99887-2',
    direccion: 'Santo Domingo, República Dominicana'
  };

  const tbody = document.getElementById('audit-logs-tbody');
  const rowsHtml = tbody ? tbody.innerHTML : '';

  const html = `
    <div>
      <div class="header-box">
        <h1 style="margin: 0; font-size: 18px; font-weight: bold;">${farm.nombre.toUpperCase()}</h1>
        <p style="margin: 2px 0; font-size: 11px; color: #475569;">RNC: ${farm.rnc || '1-31-99887-2'} • ${farm.direccion}</p>
        <h2 style="margin: 6px 0 0 0; font-size: 14px; color: #0f172a; text-transform: uppercase;">BITÁCORA OFICIAL DE AUDITORÍA — CORRECCIONES DE INVENTARIO</h2>
      </div>

      <table>
        <thead>
          <tr>
            <th class="text-center">FECHA / HORA</th>
            <th>PRODUCTO AFECTADO</th>
            <th class="text-center">LOTE</th>
            <th>CAMPO</th>
            <th class="text-center">VALOR ANTERIOR</th>
            <th class="text-center">VALOR NUEVO</th>
            <th>USUARIO RESPONSABLE</th>
            <th>MOTIVO REGISTRADO</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="8" class="text-center">No hay registros de auditoría.</td></tr>'}
        </tbody>
      </table>

      <div class="footer-signatures">
        <div class="sig-line">Auditor Interno</div>
        <div class="sig-line">Director de Farmacia</div>
      </div>
    </div>
  `;

  executePrintHtml(html, 'Auditoria-Inventario-FarmaSys');
}




/* =========================================================================
   MÓDULO FARMASYS: ESTADÍSTICAS COMPARATIVAS DE VENTA (DIARIA, SEMANAL, MENSUAL)
   ========================================================================= */

function goToComparativeReportsTab() {
  switchSysTab('reportes');
  switchReportSubTab('comparativa');
}

async function loadAndRenderComparativeStats(fid) {
  const farmaciaId = fid || (sysState.authenticatedPharmacy ? sysState.authenticatedPharmacy.id : 1);
  try {
    const res = await fetch(`/api/sales/comparative-stats?farmacia_id=${farmaciaId}`);
    const data = await res.json();
    if (!data || !data.ok) return;

    sysReportState.comparativeStats = data;
    const diaria = data.diaria;
    const semanal = data.semanal;
    const mensual = data.mensual;

    // -------------------------------------------------------------
    // 1. ACTUALIZAR CINTILLO SUPERIOR EN POS MOSTRADOR
    // -------------------------------------------------------------

    // Diaria (Hoy vs. Ayer)
    const posDailyToday = document.getElementById('pos-comp-daily-today');
    if (posDailyToday) posDailyToday.textContent = `RD$ ${formatMoneyRD(diaria.hoy.total_rd)}`;
    const posDailyTodayCnt = document.getElementById('pos-comp-daily-today-cnt');
    if (posDailyTodayCnt) posDailyTodayCnt.textContent = `${diaria.hoy.ventas_count} venta(s)`;
    const posDailyYest = document.getElementById('pos-comp-daily-yesterday');
    if (posDailyYest) posDailyYest.textContent = `RD$ ${formatMoneyRD(diaria.ayer.total_rd)}`;
    const posDailyYestCnt = document.getElementById('pos-comp-daily-yesterday-cnt');
    if (posDailyYestCnt) posDailyYestCnt.textContent = `${diaria.ayer.ventas_count} venta(s)`;
    const posDailyDiff = document.getElementById('pos-comp-daily-diff');
    if (posDailyDiff) {
      const sign = diaria.diferencia_rd >= 0 ? '+' : '-';
      posDailyDiff.textContent = `${sign}RD$ ${formatMoneyRD(Math.abs(diaria.diferencia_rd))}`;
      posDailyDiff.className = `font-extrabold ${diaria.diferencia_rd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }
    const posDailyBadge = document.getElementById('pos-comp-badge-daily');
    if (posDailyBadge) {
      if (diaria.diferencia_rd > 0) {
        posDailyBadge.textContent = `▲ +${diaria.variacion_pct.toFixed(1)}%`;
        posDailyBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      } else if (diaria.diferencia_rd < 0) {
        posDailyBadge.textContent = `▼ ${diaria.variacion_pct.toFixed(1)}%`;
        posDailyBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/30';
      } else {
        posDailyBadge.textContent = '▬ 0.0%';
        posDailyBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-500/20 text-slate-300 border border-slate-500/30';
      }
    }

    // Semanal (Esta Semana vs. Semana Anterior)
    const posWkCur = document.getElementById('pos-comp-weekly-current');
    if (posWkCur) posWkCur.textContent = `RD$ ${formatMoneyRD(semanal.semana_actual.total_rd)}`;
    const posWkCurCnt = document.getElementById('pos-comp-weekly-current-cnt');
    if (posWkCurCnt) posWkCurCnt.textContent = `${semanal.semana_actual.ventas_count} venta(s)`;
    const posWkPrev = document.getElementById('pos-comp-weekly-previous');
    if (posWkPrev) posWkPrev.textContent = `RD$ ${formatMoneyRD(semanal.semana_anterior.total_rd)}`;
    const posWkPrevCnt = document.getElementById('pos-comp-weekly-previous-cnt');
    if (posWkPrevCnt) posWkPrevCnt.textContent = `${semanal.semana_anterior.ventas_count} venta(s)`;
    const posWkDiff = document.getElementById('pos-comp-weekly-diff');
    if (posWkDiff) {
      const sign = semanal.diferencia_rd >= 0 ? '+' : '-';
      posWkDiff.textContent = `${sign}RD$ ${formatMoneyRD(Math.abs(semanal.diferencia_rd))}`;
      posWkDiff.className = `font-extrabold ${semanal.diferencia_rd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }
    const posWkBadge = document.getElementById('pos-comp-badge-weekly');
    if (posWkBadge) {
      if (semanal.diferencia_rd > 0) {
        posWkBadge.textContent = `▲ +${semanal.variacion_pct.toFixed(1)}%`;
        posWkBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      } else if (semanal.diferencia_rd < 0) {
        posWkBadge.textContent = `▼ ${semanal.variacion_pct.toFixed(1)}%`;
        posWkBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/30';
      } else {
        posWkBadge.textContent = '▬ 0.0%';
        posWkBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-500/20 text-slate-300 border border-slate-500/30';
      }
    }

    // Mensual (Este Mes vs. Mes Anterior)
    const posMoCur = document.getElementById('pos-comp-monthly-current');
    if (posMoCur) posMoCur.textContent = `RD$ ${formatMoneyRD(mensual.mes_actual.total_rd)}`;
    const posMoCurCnt = document.getElementById('pos-comp-monthly-current-cnt');
    if (posMoCurCnt) posMoCurCnt.textContent = `${mensual.mes_actual.ventas_count} venta(s)`;
    const posMoPrev = document.getElementById('pos-comp-monthly-previous');
    if (posMoPrev) posMoPrev.textContent = `RD$ ${formatMoneyRD(mensual.mes_anterior.total_rd)}`;
    const posMoPrevCnt = document.getElementById('pos-comp-monthly-previous-cnt');
    if (posMoPrevCnt) posMoPrevCnt.textContent = `${mensual.mes_anterior.ventas_count} venta(s)`;
    const posMoDiff = document.getElementById('pos-comp-monthly-diff');
    if (posMoDiff) {
      const sign = mensual.diferencia_rd >= 0 ? '+' : '-';
      posMoDiff.textContent = `${sign}RD$ ${formatMoneyRD(Math.abs(mensual.diferencia_rd))}`;
      posMoDiff.className = `font-extrabold ${mensual.diferencia_rd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }
    const posMoBadge = document.getElementById('pos-comp-badge-monthly');
    if (posMoBadge) {
      if (mensual.diferencia_rd > 0) {
        posMoBadge.textContent = `▲ +${mensual.variacion_pct.toFixed(1)}%`;
        posMoBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      } else if (mensual.diferencia_rd < 0) {
        posMoBadge.textContent = `▼ ${mensual.variacion_pct.toFixed(1)}%`;
        posMoBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/30';
      } else {
        posMoBadge.textContent = '▬ 0.0%';
        posMoBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-500/20 text-slate-300 border border-slate-500/30';
      }
    }

    // -------------------------------------------------------------
    // 2. ACTUALIZAR SUBPANEL COMPARATIVO EN REPORTES (KPIs)
    // -------------------------------------------------------------

    // Diaria KPI
    const repDailyToday = document.getElementById('rep-comp-daily-today');
    if (repDailyToday) repDailyToday.textContent = `RD$ ${formatMoneyRD(diaria.hoy.total_rd)}`;
    const repDailyTodayCnt = document.getElementById('rep-comp-daily-today-cnt');
    if (repDailyTodayCnt) repDailyTodayCnt.textContent = `${diaria.hoy.ventas_count} facturas emitidas`;
    const repDailyYest = document.getElementById('rep-comp-daily-yesterday');
    if (repDailyYest) repDailyYest.textContent = `RD$ ${formatMoneyRD(diaria.ayer.total_rd)}`;
    const repDailyYestCnt = document.getElementById('rep-comp-daily-yesterday-cnt');
    if (repDailyYestCnt) repDailyYestCnt.textContent = `${diaria.ayer.ventas_count} facturas emitidas`;
    const repDailySameDay = document.getElementById('rep-comp-daily-sameday-prev');
    if (repDailySameDay) repDailySameDay.textContent = `RD$ ${formatMoneyRD(diaria.mismo_dia_semana_anterior.total_rd)} (${diaria.mismo_dia_semana_anterior.fecha})`;
    const repDailyDiff = document.getElementById('rep-comp-daily-diff');
    if (repDailyDiff) {
      const sign = diaria.diferencia_rd >= 0 ? '+' : '-';
      repDailyDiff.textContent = `${sign}RD$ ${formatMoneyRD(Math.abs(diaria.diferencia_rd))}`;
      repDailyDiff.className = `text-sm font-black ${diaria.diferencia_rd >= 0 ? 'text-emerald-600' : 'text-rose-600'}`;
    }
    const repDailyBadge = document.getElementById('rep-comp-badge-daily');
    if (repDailyBadge) {
      if (diaria.diferencia_rd > 0) {
        repDailyBadge.textContent = `▲ +${diaria.variacion_pct.toFixed(1)}%`;
        repDailyBadge.className = 'px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800';
      } else if (diaria.diferencia_rd < 0) {
        repDailyBadge.textContent = `▼ ${diaria.variacion_pct.toFixed(1)}%`;
        repDailyBadge.className = 'px-2.5 py-1 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800';
      } else {
        repDailyBadge.textContent = '▬ 0.0%';
        repDailyBadge.className = 'px-2.5 py-1 rounded-full text-xs font-extrabold bg-slate-100 text-slate-700';
      }
    }

    // Semanal KPI
    const repWkRange = document.getElementById('rep-comp-weekly-cur-range');
    if (repWkRange) repWkRange.textContent = `Rango: ${semanal.semana_actual.rango}`;
    const repWkCur = document.getElementById('rep-comp-weekly-current');
    if (repWkCur) repWkCur.textContent = `RD$ ${formatMoneyRD(semanal.semana_actual.total_rd)}`;
    const repWkPrevRange = document.getElementById('rep-comp-weekly-prev-range');
    if (repWkPrevRange) repWkPrevRange.textContent = `Rango: ${semanal.semana_anterior.rango}`;
    const repWkPrev = document.getElementById('rep-comp-weekly-previous');
    if (repWkPrev) repWkPrev.textContent = `RD$ ${formatMoneyRD(semanal.semana_anterior.total_rd)}`;
    const repWkDiff = document.getElementById('rep-comp-weekly-diff');
    if (repWkDiff) {
      const sign = semanal.diferencia_rd >= 0 ? '+' : '-';
      repWkDiff.textContent = `${sign}RD$ ${formatMoneyRD(Math.abs(semanal.diferencia_rd))}`;
      repWkDiff.className = `text-sm font-black ${semanal.diferencia_rd >= 0 ? 'text-emerald-600' : 'text-rose-600'}`;
    }
    const repWkBadge = document.getElementById('rep-comp-badge-weekly');
    if (repWkBadge) {
      if (semanal.diferencia_rd > 0) {
        repWkBadge.textContent = `▲ +${semanal.variacion_pct.toFixed(1)}%`;
        repWkBadge.className = 'px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800';
      } else if (semanal.diferencia_rd < 0) {
        repWkBadge.textContent = `▼ ${semanal.variacion_pct.toFixed(1)}%`;
        repWkBadge.className = 'px-2.5 py-1 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800';
      } else {
        repWkBadge.textContent = '▬ 0.0%';
        repWkBadge.className = 'px-2.5 py-1 rounded-full text-xs font-extrabold bg-slate-100 text-slate-700';
      }
    }

    // Mensual KPI
    const repMoCurLabel = document.getElementById('rep-comp-monthly-cur-label');
    if (repMoCurLabel) repMoCurLabel.textContent = `Mes: ${mensual.mes_actual.mes}`;
    const repMoCur = document.getElementById('rep-comp-monthly-current');
    if (repMoCur) repMoCur.textContent = `RD$ ${formatMoneyRD(mensual.mes_actual.total_rd)}`;
    const repMoPrevLabel = document.getElementById('rep-comp-monthly-prev-label');
    if (repMoPrevLabel) repMoPrevLabel.textContent = `Mes: ${mensual.mes_anterior.mes}`;
    const repMoPrev = document.getElementById('rep-comp-monthly-previous');
    if (repMoPrev) repMoPrev.textContent = `RD$ ${formatMoneyRD(mensual.mes_anterior.total_rd)}`;
    const repMoDiff = document.getElementById('rep-comp-monthly-diff');
    if (repMoDiff) {
      const sign = mensual.diferencia_rd >= 0 ? '+' : '-';
      repMoDiff.textContent = `${sign}RD$ ${formatMoneyRD(Math.abs(mensual.diferencia_rd))}`;
      repMoDiff.className = `text-sm font-black ${mensual.diferencia_rd >= 0 ? 'text-emerald-600' : 'text-rose-600'}`;
    }
    const repMoBadge = document.getElementById('rep-comp-badge-monthly');
    if (repMoBadge) {
      if (mensual.diferencia_rd > 0) {
        repMoBadge.textContent = `▲ +${mensual.variacion_pct.toFixed(1)}%`;
        repMoBadge.className = 'px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800';
      } else if (mensual.diferencia_rd < 0) {
        repMoBadge.textContent = `▼ ${mensual.variacion_pct.toFixed(1)}%`;
        repMoBadge.className = 'px-2.5 py-1 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800';
      } else {
        repMoBadge.textContent = '▬ 0.0%';
        repMoBadge.className = 'px-2.5 py-1 rounded-full text-xs font-extrabold bg-slate-100 text-slate-700';
      }
    }

    // -------------------------------------------------------------
    // 3. RENDERIZAR GRÁFICO COMPARATIVO SEMANAL (Chart.js)
    // -------------------------------------------------------------
    renderComparativeWeeklyChart(semanal.desglose_dias || []);

    // -------------------------------------------------------------
    // 4. RENDERIZAR TABLA COMPARATIVA DÍA POR DÍA
    // -------------------------------------------------------------
    renderComparativeDaysTable(semanal);

    // -------------------------------------------------------------
    // 5. RENDERIZAR TABLA HISTÓRICA MENSUAL (6 MESES)
    // -------------------------------------------------------------
    renderComparativeMonthlyTable(mensual.historico_6_meses || []);

  } catch (err) {
    console.error('Error al cargar estadísticas comparativas de venta FarmaSys:', err);
  }
}

function renderComparativeWeeklyChart(desgloseDias) {
  const canvas = document.getElementById('chart-comparative-weekly');
  if (!canvas || !window.Chart) return;

  if (sysReportState.comparativeWeeklyChart) {
    sysReportState.comparativeWeeklyChart.destroy();
    sysReportState.comparativeWeeklyChart = null;
  }

  const labels = desgloseDias.map((d) => d.dia + (d.es_hoy ? ' (Hoy)' : ''));
  const dataActual = desgloseDias.map((d) => d.monto_actual_rd);
  const dataAnterior = desgloseDias.map((d) => d.monto_anterior_rd);

  const ctx = canvas.getContext('2d');
  sysReportState.comparativeWeeklyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Esta Semana (RD$)',
          data: dataActual,
          backgroundColor: 'rgba(13, 148, 136, 0.85)',
          borderColor: 'rgb(15, 118, 110)',
          borderWidth: 1.5,
          borderRadius: 6,
        },
        {
          label: 'Semana Anterior (RD$)',
          data: dataAnterior,
          backgroundColor: 'rgba(148, 163, 184, 0.65)',
          borderColor: 'rgb(100, 116, 139)',
          borderWidth: 1.5,
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { family: 'Inter', size: 11, weight: 'bold' },
            boxWidth: 14,
            usePointStyle: true,
          },
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const val = context.raw || 0;
              return `${context.dataset.label}: RD$ ${formatMoneyRD(val)}`;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function (val) {
              return 'RD$ ' + Number(val).toLocaleString('es-DO');
            },
            font: { family: 'Inter', size: 10 },
          },
          grid: {
            color: 'rgba(226, 232, 240, 0.6)',
          },
        },
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter', size: 11, weight: '600' } },
        },
      },
    },
  });
}

function renderComparativeDaysTable(semanal) {
  const tbody = document.getElementById('rep-comparative-days-tbody');
  const tfoot = document.getElementById('rep-comparative-days-tfoot');
  if (!tbody) return;

  const dias = semanal.desglose_dias || [];
  if (!dias.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400">Sin datos de ventas para comparar.</td></tr>`;
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  tbody.innerHTML = dias
    .map((d) => {
      const isPositive = d.diferencia_rd > 0;
      const isNegative = d.diferencia_rd < 0;
      const sign = isPositive ? '+' : (isNegative ? '-' : '');
      const diffClass = isPositive ? 'text-emerald-600 font-extrabold' : (isNegative ? 'text-rose-600 font-extrabold' : 'text-slate-500 font-medium');

      let badge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">▬ Neutro</span>';
      if (isPositive) {
        badge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">▲ +${d.variacion_pct.toFixed(1)}%</span>`;
      } else if (isNegative) {
        badge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800">▼ ${d.variacion_pct.toFixed(1)}%</span>`;
      }

      const rowHighlight = d.es_hoy ? 'bg-teal-50/50 font-bold' : 'hover:bg-slate-50/80';
      const hoyTag = d.es_hoy ? '<span class="ml-1.5 px-2 py-0.5 rounded-full text-[9px] font-black bg-teal-600 text-white uppercase tracking-wider">Hoy</span>' : '';

      return `
        <tr class="${rowHighlight} transition">
          <td class="py-3 px-4 font-bold text-slate-900">${d.dia} ${hoyTag}</td>
          <td class="py-3 px-4 font-mono text-slate-600 text-[11px]">${d.fecha_actual}</td>
          <td class="py-3 px-4 font-mono text-slate-400 text-[11px]">${d.fecha_anterior}</td>
          <td class="py-3 px-4 text-right font-black text-slate-900">RD$ ${formatMoneyRD(d.monto_actual_rd)}</td>
          <td class="py-3 px-4 text-right font-medium text-slate-600">RD$ ${formatMoneyRD(d.monto_anterior_rd)}</td>
          <td class="py-3 px-4 text-right ${diffClass}">${sign}RD$ ${formatMoneyRD(Math.abs(d.diferencia_rd))}</td>
          <td class="py-3 px-4 text-center font-bold text-slate-700">${sign}${d.variacion_pct.toFixed(1)}%</td>
          <td class="py-3 px-4 text-center">${badge}</td>
        </tr>
      `;
    })
    .join('');

  if (tfoot) {
    const totActual = semanal.semana_actual.total_rd;
    const totAnterior = semanal.semana_anterior.total_rd;
    const diffTot = semanal.diferencia_rd;
    const varTot = semanal.variacion_pct;
    const signTot = diffTot >= 0 ? '+' : '-';
    const diffTotClass = diffTot >= 0 ? 'text-emerald-700' : 'text-rose-700';

    tfoot.innerHTML = `
      <tr>
        <td class="py-3.5 px-4 font-extrabold uppercase text-slate-900">TOTAL SEMANAL</td>
        <td class="py-3.5 px-4 text-[10px] text-slate-500 font-normal">7 días</td>
        <td class="py-3.5 px-4 text-[10px] text-slate-500 font-normal">7 días</td>
        <td class="py-3.5 px-4 text-right text-sm font-black text-teal-900">RD$ ${formatMoneyRD(totActual)}</td>
        <td class="py-3.5 px-4 text-right text-xs font-bold text-slate-700">RD$ ${formatMoneyRD(totAnterior)}</td>
        <td class="py-3.5 px-4 text-right text-sm font-black ${diffTotClass}">${signTot}RD$ ${formatMoneyRD(Math.abs(diffTot))}</td>
        <td class="py-3.5 px-4 text-center font-extrabold text-slate-900">${signTot}${varTot.toFixed(1)}%</td>
        <td class="py-3.5 px-4 text-center font-extrabold ${diffTot >= 0 ? 'text-emerald-700' : 'text-rose-700'}">
          ${diffTot >= 0 ? '▲ Superó Anterior' : '▼ Inferior'}
        </td>
      </tr>
    `;
  }
}

function renderComparativeMonthlyTable(historico) {
  const tbody = document.getElementById('rep-comparative-monthly-tbody');
  if (!tbody) return;

  if (!historico || !historico.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-slate-400">Sin historial de meses disponible.</td></tr>`;
    return;
  }

  tbody.innerHTML = historico
    .map((item, idx) => {
      const prev = idx > 0 ? historico[idx - 1] : null;
      let compText = 'Mes inicial / Base';
      let varPctText = '0.0%';
      let badge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">Base</span>';

      if (prev) {
        const diff = item.total_rd - prev.total_rd;
        const pct = prev.total_rd > 0 ? ((diff / prev.total_rd) * 100) : (item.total_rd > 0 ? 100 : 0);
        const sign = diff >= 0 ? '+' : '-';
        compText = `${sign}RD$ ${formatMoneyRD(Math.abs(diff))} vs ${prev.mes}`;
        varPctText = `${sign}${pct.toFixed(1)}%`;

        if (diff > 0) {
          badge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">▲ Crecimiento (+${pct.toFixed(1)}%)</span>`;
        } else if (diff < 0) {
          badge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800">▼ Descenso (${pct.toFixed(1)}%)</span>`;
        } else {
          badge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">▬ Estable</span>';
        }
      }

      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-3 px-4 font-extrabold text-slate-900 font-mono">${item.mes}</td>
          <td class="py-3 px-4 text-right font-black text-slate-900 text-sm">RD$ ${formatMoneyRD(item.total_rd)}</td>
          <td class="py-3 px-4 text-right text-xs font-semibold text-slate-600">${compText}</td>
          <td class="py-3 px-4 text-center font-bold text-slate-800">${varPctText}</td>
          <td class="py-3 px-4 text-center">${badge}</td>
        </tr>
      `;
    })
    .join('');
}

function printComparativeSalesReport() {
  const pArea = document.getElementById('printable-sales-report-area');
  if (!pArea) return;

  const farm = sysState.authenticatedPharmacy || {
    nombre_comercial: 'FarmaSys Pharmacy',
    rnc: '131-98765-4',
    direccion: 'Av. 27 de Febrero #45, Santo Domingo, R.D.',
    telefono: '809-555-0199',
    whatsapp_notificaciones: '829-555-0199'
  };

  const user = farm.usuario_actual || farm.usuario_admin || 'Administrador';
  const stats = sysReportState.comparativeStats;
  if (!stats) {
    showToast('Cargando estadísticas para impresión...', 'info');
    loadAndRenderComparativeStats().then(() => printComparativeSalesReport());
    return;
  }

  const d = stats.diaria;
  const s = stats.semanal;
  const m = stats.mensual;
  const nowStr = new Date().toLocaleString('es-DO', { dateStyle: 'full', timeStyle: 'short' });

  let weeklyRowsHtml = '';
  (s.desglose_dias || []).forEach(row => {
    const isPos = row.diferencia_rd > 0;
    const isNeg = row.diferencia_rd < 0;
    const sign = isPos ? '+' : (isNeg ? '-' : '');
    weeklyRowsHtml += `
      <tr>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">${row.dia}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-family: monospace;">${row.fecha_actual}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;">RD$ ${formatMoneyRD(row.monto_actual_rd)}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #64748b;">RD$ ${formatMoneyRD(row.monto_anterior_rd)}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: ${isPos ? '#059669' : (isNeg ? '#dc2626' : '#475569')};">${sign}RD$ ${formatMoneyRD(Math.abs(row.diferencia_rd))}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: bold;">${sign}${row.variacion_pct.toFixed(1)}%</td>
      </tr>
    `;
  });

  let monthlyRowsHtml = '';
  (m.historico_6_meses || []).forEach(row => {
    monthlyRowsHtml += `
      <tr>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold; font-family: monospace;">${row.mes}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;">RD$ ${formatMoneyRD(row.total_rd)}</td>
      </tr>
    `;
  });

  pArea.innerHTML = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #0f172a; padding: 24px; max-width: 900px; margin: 0 auto; line-height: 1.4;">
      <!-- Membrete de la Farmacia -->
      <div style="border-bottom: 3px double #0d9488; padding-bottom: 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h1 style="font-size: 20px; font-weight: 900; margin: 0; color: #0f766e; text-transform: uppercase;">
            ${farm.nombre_comercial || farm.nombre}
          </h1>
          <p style="font-size: 11px; margin: 2px 0; color: #475569;">
            RNC / Cédula: <strong>${farm.rnc || 'N/A'}</strong> | Tel: ${farm.telefono || farm.telefono_whatsapp}
          </p>
          <p style="font-size: 11px; margin: 2px 0; color: #475569;">
            ${farm.direccion}
          </p>
        </div>
        <div style="text-align: right;">
          <span style="display: inline-block; background-color: #0f766e; color: #ffffff; padding: 4px 10px; border-radius: 6px; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">
            FARMASYS POS • AUDITORÍA
          </span>
          <p style="font-size: 10px; margin: 4px 0 0 0; color: #64748b;">
            Base de Datos: <strong>farmacia_${farm.id || 1}</strong>
          </p>
        </div>
      </div>

      <!-- Título del Documento -->
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="font-size: 16px; font-weight: 800; margin: 0; text-transform: uppercase; color: #1e293b;">
          Informe de Estadísticas Comparativas de Venta
        </h2>
        <p style="font-size: 11px; color: #64748b; margin: 3px 0 0 0;">
          Generado el: ${nowStr} | Auditor / Cajero: <strong>${user}</strong>
        </p>
      </div>

      <!-- SECCIÓN 1: RESUMEN COMPARATIVO EJECUTIVO (DIARIO, SEMANAL Y MENSUAL) -->
      <h3 style="font-size: 12px; font-weight: bold; background: #f1f5f9; padding: 6px 10px; border-left: 4px solid #0d9488; text-transform: uppercase; margin: 12px 0 8px 0;">
        1. Resumen de Rendimiento Comparativo
      </h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 18px;">
        <thead>
          <tr style="background: #f8fafc; border-bottom: 1.5px solid #cbd5e1; text-align: left;">
            <th style="padding: 6px 8px;">Nivel Comparativo</th>
            <th style="padding: 6px 8px; text-align: right;">Período Actual (RD$)</th>
            <th style="padding: 6px 8px; text-align: right;">Período Anterior (RD$)</th>
            <th style="padding: 6px 8px; text-align: right;">Diferencia Neta (RD$)</th>
            <th style="padding: 6px 8px; text-align: center;">Crecimiento %</th>
            <th style="padding: 6px 8px; text-align: center;">Tendencia</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 7px 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">
              Diaria: Hoy (${d.hoy.fecha}) vs. Ayer (${d.ayer.fecha})
            </td>
            <td style="padding: 7px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;">RD$ ${formatMoneyRD(d.hoy.total_rd)}</td>
            <td style="padding: 7px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #64748b;">RD$ ${formatMoneyRD(d.ayer.total_rd)}</td>
            <td style="padding: 7px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: ${d.diferencia_rd >= 0 ? '#059669' : '#dc2626'};">${d.diferencia_rd >= 0 ? '+' : '-'}RD$ ${formatMoneyRD(Math.abs(d.diferencia_rd))}</td>
            <td style="padding: 7px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: bold;">${d.diferencia_rd >= 0 ? '+' : ''}${d.variacion_pct.toFixed(1)}%</td>
            <td style="padding: 7px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: bold; color: ${d.diferencia_rd >= 0 ? '#059669' : '#dc2626'};">${d.tendencia}</td>
          </tr>
          <tr>
            <td style="padding: 7px 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">
              Semanal: Esta Semana vs. Semana Anterior
            </td>
            <td style="padding: 7px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;">RD$ ${formatMoneyRD(s.semana_actual.total_rd)}</td>
            <td style="padding: 7px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #64748b;">RD$ ${formatMoneyRD(s.semana_anterior.total_rd)}</td>
            <td style="padding: 7px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: ${s.diferencia_rd >= 0 ? '#059669' : '#dc2626'};">${s.diferencia_rd >= 0 ? '+' : '-'}RD$ ${formatMoneyRD(Math.abs(s.diferencia_rd))}</td>
            <td style="padding: 7px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: bold;">${s.diferencia_rd >= 0 ? '+' : ''}${s.variacion_pct.toFixed(1)}%</td>
            <td style="padding: 7px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: bold; color: ${s.diferencia_rd >= 0 ? '#059669' : '#dc2626'};">${s.tendencia}</td>
          </tr>
          <tr>
            <td style="padding: 7px 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">
              Mensual: Mes Actual (${m.mes_actual.mes}) vs. Anterior (${m.mes_anterior.mes})
            </td>
            <td style="padding: 7px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;">RD$ ${formatMoneyRD(m.mes_actual.total_rd)}</td>
            <td style="padding: 7px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #64748b;">RD$ ${formatMoneyRD(m.mes_anterior.total_rd)}</td>
            <td style="padding: 7px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: ${m.diferencia_rd >= 0 ? '#059669' : '#dc2626'};">${m.diferencia_rd >= 0 ? '+' : '-'}RD$ ${formatMoneyRD(Math.abs(m.diferencia_rd))}</td>
            <td style="padding: 7px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: bold;">${m.diferencia_rd >= 0 ? '+' : ''}${m.variacion_pct.toFixed(1)}%</td>
            <td style="padding: 7px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: bold; color: ${m.diferencia_rd >= 0 ? '#059669' : '#dc2626'};">${m.tendencia}</td>
          </tr>
        </tbody>
      </table>

      <!-- SECCIÓN 2: DESGLOSE SEMANAL DÍA A DÍA -->
      <h3 style="font-size: 12px; font-weight: bold; background: #f1f5f9; padding: 6px 10px; border-left: 4px solid #0d9488; text-transform: uppercase; margin: 16px 0 8px 0;">
        2. Comparativa Detallada Día por Día (Esta Semana vs. Anterior)
      </h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 18px;">
        <thead>
          <tr style="background: #f8fafc; border-bottom: 1.5px solid #cbd5e1; text-align: left;">
            <th style="padding: 6px 8px;">Día</th>
            <th style="padding: 6px 8px;">Fecha</th>
            <th style="padding: 6px 8px; text-align: right;">Esta Semana (RD$)</th>
            <th style="padding: 6px 8px; text-align: right;">Semana Anterior (RD$)</th>
            <th style="padding: 6px 8px; text-align: right;">Diferencia (RD$)</th>
            <th style="padding: 6px 8px; text-align: center;">Crecimiento %</th>
          </tr>
        </thead>
        <tbody>
          ${weeklyRowsHtml}
        </tbody>
        <tfoot>
          <tr style="background: #f1f5f9; font-weight: bold; border-top: 2px solid #cbd5e1;">
            <td style="padding: 8px;" colspan="2">TOTAL SEMANAL</td>
            <td style="padding: 8px; text-align: right; color: #0f766e;">RD$ ${formatMoneyRD(s.semana_actual.total_rd)}</td>
            <td style="padding: 8px; text-align: right; color: #475569;">RD$ ${formatMoneyRD(s.semana_anterior.total_rd)}</td>
            <td style="padding: 8px; text-align: right; color: ${s.diferencia_rd >= 0 ? '#059669' : '#dc2626'};">${s.diferencia_rd >= 0 ? '+' : '-'}RD$ ${formatMoneyRD(Math.abs(s.diferencia_rd))}</td>
            <td style="padding: 8px; text-align: center;">${s.diferencia_rd >= 0 ? '+' : ''}${s.variacion_pct.toFixed(1)}%</td>
          </tr>
        </tfoot>
      </table>

      <!-- SECCIÓN 3: HISTÓRICO CONSOLIDADO DE MESES -->
      <h3 style="font-size: 12px; font-weight: bold; background: #f1f5f9; padding: 6px 10px; border-left: 4px solid #0d9488; text-transform: uppercase; margin: 16px 0 8px 0;">
        3. Histórico de Ventas Mensuales (Últimos 6 Meses)
      </h3>
      <table style="width: 60%; border-collapse: collapse; font-size: 11px; margin-bottom: 24px;">
        <thead>
          <tr style="background: #f8fafc; border-bottom: 1.5px solid #cbd5e1; text-align: left;">
            <th style="padding: 6px 8px;">Mes Comercial</th>
            <th style="padding: 6px 8px; text-align: right;">Total Facturado (RD$)</th>
          </tr>
        </thead>
        <tbody>
          ${monthlyRowsHtml}
        </tbody>
      </table>

      <!-- Certificación y Firmas -->
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; font-size: 11px; color: #475569;">
        <div style="width: 40%; text-align: center;">
          <div style="border-bottom: 1px solid #94a3b8; height: 35px; margin-bottom: 6px;"></div>
          <p style="margin: 0; font-weight: bold;">Cajero / Operador FarmaSys POS</p>
          <p style="margin: 2px 0 0 0; font-size: 10px; color: #64748b;">${user}</p>
        </div>
        <div style="width: 40%; text-align: center;">
          <div style="border-bottom: 1px solid #94a3b8; height: 35px; margin-bottom: 6px;"></div>
          <p style="margin: 0; font-weight: bold;">Auditor Financiero / Regente</p>
          <p style="margin: 2px 0 0 0; font-size: 10px; color: #64748b;">Certificación y Cierre Oficial</p>
        </div>
      </div>
    </div>
  `;

  window.print();
}

// Cierre automático del menú de búsqueda POS al hacer click fuera
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('pos-search-dropdown');
  const input = document.getElementById('pos-barcode-input');
  if (dropdown && !dropdown.contains(e.target) && e.target !== input) {
    dropdown.classList.add('hidden');
  }
});


/* =========================================================================
   CONTROL DE CONFIGURACIÓN DE SERVICIOS EN ESQUINA SUPERIOR DERECHA (EXCLUSIVO POS)
   Sincroniza en vivo: Pago con Tarjeta, Envío a Domicilio y Seguro Médico (POS + App Casa)
   ========================================================================= */

function toggleQuickServicesConfigModal() {
  const modal = document.getElementById('quick-services-config-modal');
  if (!modal) return;
  if (modal.classList.contains('hidden')) {
    if (sysState.authenticatedPharmacy) {
      applyOperationalServiceFlags(sysState.authenticatedPharmacy);
    }
    modal.classList.remove('hidden');
  } else {
    modal.classList.add('hidden');
  }
}

function closeQuickServicesConfigModal() {
  const modal = document.getElementById('quick-services-config-modal');
  if (modal) modal.classList.add('hidden');
}

function applyOperationalServiceFlags(cfg) {
  if (!cfg) return;
  const cardActive = cfg.pago_tarjeta_activo !== false;
  const deliveryActive = cfg.envio_domicilio_activo !== false;
  const arsActive = cfg.seguro_medico_activo !== false;

  if (sysState.authenticatedPharmacy) {
    sysState.authenticatedPharmacy.pago_tarjeta_activo = cardActive;
    sysState.authenticatedPharmacy.envio_domicilio_activo = deliveryActive;
    sysState.authenticatedPharmacy.seguro_medico_activo = arsActive;
    try {
      sessionStorage.setItem(
        'davalsi_sys_auth',
        JSON.stringify({ pharmacy: sysState.authenticatedPharmacy, token: sysState.sessionToken })
      );
    } catch (e) {}
  }

  // 1. Puntos indicadores del botón en la esquina superior derecha
  const dotCard = document.getElementById('top-dot-card');
  if (dotCard) {
    dotCard.className = `w-2 h-2 rounded-full ${cardActive ? 'bg-emerald-400' : 'bg-rose-500 animate-pulse'}`;
    dotCard.title = `Pago con Tarjeta: ${cardActive ? 'Activo' : 'Bloqueado'}`;
  }
  const dotDel = document.getElementById('top-dot-delivery');
  if (dotDel) {
    dotDel.className = `w-2 h-2 rounded-full ${deliveryActive ? 'bg-emerald-400' : 'bg-rose-500 animate-pulse'}`;
    dotDel.title = `Envío a Domicilio: ${deliveryActive ? 'Activo' : 'Bloqueado'}`;
  }
  const dotArs = document.getElementById('top-dot-ars');
  if (dotArs) {
    dotArs.className = `w-2 h-2 rounded-full ${arsActive ? 'bg-emerald-400' : 'bg-rose-500 animate-pulse'}`;
    dotArs.title = `Seguro Médico ARS: ${arsActive ? 'Activo' : 'Bloqueado'}`;
  }

  // 2. Controles dentro del modal rápido de la esquina superior derecha
  const tCard = document.getElementById('quick-toggle-card');
  if (tCard) tCard.checked = cardActive;
  const bCard = document.getElementById('quick-badge-card');
  if (bCard) {
    bCard.textContent = cardActive ? 'ACTIVO' : 'BLOQUEADO';
    bCard.className = `px-2 py-0.5 rounded-full text-[10px] font-extrabold text-white ${cardActive ? 'bg-emerald-600' : 'bg-rose-600'}`;
  }
  const boxCard = document.getElementById('quick-card-box');
  if (boxCard) {
    boxCard.className = `p-3.5 rounded-2xl border-2 transition space-y-2 ${cardActive ? 'border-emerald-200 bg-emerald-50/40' : 'border-rose-300 bg-rose-50/50'}`;
  }

  const tDel = document.getElementById('quick-toggle-delivery');
  if (tDel) tDel.checked = deliveryActive;
  const bDel = document.getElementById('quick-badge-delivery');
  if (bDel) {
    bDel.textContent = deliveryActive ? 'ACTIVO' : 'BLOQUEADO';
    bDel.className = `px-2 py-0.5 rounded-full text-[10px] font-extrabold text-white ${deliveryActive ? 'bg-emerald-600' : 'bg-rose-600'}`;
  }
  const boxDel = document.getElementById('quick-delivery-box');
  if (boxDel) {
    boxDel.className = `p-3.5 rounded-2xl border-2 transition space-y-2 ${deliveryActive ? 'border-emerald-200 bg-emerald-50/40' : 'border-rose-300 bg-rose-50/50'}`;
  }

  const tArs = document.getElementById('quick-toggle-ars');
  if (tArs) tArs.checked = arsActive;
  const bArs = document.getElementById('quick-badge-ars');
  if (bArs) {
    bArs.textContent = arsActive ? 'ACTIVO' : 'BLOQUEADO';
    bArs.className = `px-2 py-0.5 rounded-full text-[10px] font-extrabold text-white ${arsActive ? 'bg-emerald-600' : 'bg-rose-600'}`;
  }
  const boxArs = document.getElementById('quick-ars-box');
  if (boxArs) {
    boxArs.className = `p-3.5 rounded-2xl border-2 transition space-y-2 ${arsActive ? 'border-emerald-200 bg-emerald-50/40' : 'border-rose-300 bg-rose-50/50'}`;
  }

  // 3. Switches en la pestaña de Configuración General
  const cfgCard = document.getElementById('cfg-card-active');
  if (cfgCard) cfgCard.checked = cardActive;
  const cfgDel = document.getElementById('cfg-delivery-active');
  if (cfgDel) cfgDel.checked = deliveryActive;
  const cfgArs = document.getElementById('cfg-ars-active');
  if (cfgArs) cfgArs.checked = arsActive;

  // 4. Efecto en el Mostrador POS (Selector de Método de Pago y Selector de Seguro Médico ARS)
  const posPaySelect = document.getElementById('pos-payment-method');
  const posOptCard = document.getElementById('pos-opt-payment-tarjeta');
  const posCardHint = document.getElementById('pos-card-lock-hint');
  if (posOptCard) {
    posOptCard.disabled = !cardActive;
    posOptCard.textContent = cardActive ? '💳 Tarjeta' : '🔒 Tarjeta (BLOQUEADO)';
  }
  if (posPaySelect && !cardActive && posPaySelect.value === 'TARJETA') {
    posPaySelect.value = 'EFECTIVO';
  }
  if (posCardHint) {
    posCardHint.classList.toggle('hidden', cardActive);
  }

  const posArsSelect = document.getElementById('pos-insurance-ars');
  const posArsHint = document.getElementById('pos-ars-lock-hint');
  if (posArsSelect) {
    if (!arsActive) {
      posArsSelect.value = 'Sin Seguro';
      posArsSelect.disabled = true;
      posArsSelect.classList.add('bg-slate-100', 'text-slate-400', 'cursor-not-allowed');
      posArsSelect.classList.remove('bg-white');
    } else {
      posArsSelect.disabled = false;
      posArsSelect.classList.remove('bg-slate-100', 'text-slate-400', 'cursor-not-allowed');
      posArsSelect.classList.add('bg-white');
    }
  }
  if (posArsHint) {
    posArsHint.classList.toggle('hidden', arsActive);
  }

  // 5. Badges informativos en la caja del POS
  const badgePosCard = document.getElementById('pos-badge-service-card');
  if (badgePosCard) {
    badgePosCard.textContent = cardActive ? '💳 Tarjeta: Activa' : '🔒 Tarjeta: Bloqueada';
    badgePosCard.className = cardActive
      ? 'px-2 py-0.5 rounded-md font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300'
      : 'px-2 py-0.5 rounded-md font-extrabold bg-rose-100 text-rose-800 border border-rose-300';
  }
  const badgePosDel = document.getElementById('pos-badge-service-delivery');
  if (badgePosDel) {
    badgePosDel.textContent = deliveryActive ? '🛵 Domicilio: Activo' : '🔒 Domicilio: Bloqueado';
    badgePosDel.className = deliveryActive
      ? 'px-2 py-0.5 rounded-md font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300'
      : 'px-2 py-0.5 rounded-md font-extrabold bg-rose-100 text-rose-800 border border-rose-300';
  }
  const badgePosArs = document.getElementById('pos-badge-service-ars');
  if (badgePosArs) {
    badgePosArs.textContent = arsActive ? '🛡️ Seguro ARS: Activo' : '🔒 Seguro ARS: Bloqueado';
    badgePosArs.className = arsActive
      ? 'px-2 py-0.5 rounded-md font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300'
      : 'px-2 py-0.5 rounded-md font-extrabold bg-rose-100 text-rose-800 border border-rose-300';
  }

  // Emitir evento localStorage para sincronizar al instante cualquier pestaña abierta de la App de Pacientes (/app)
  try {
    localStorage.setItem(
      'farmasys_live_service_sync',
      JSON.stringify({
        farmacia_id: sysState.authenticatedPharmacy ? sysState.authenticatedPharmacy.id : 1,
        pago_tarjeta_activo: cardActive,
        envio_domicilio_activo: deliveryActive,
        seguro_medico_activo: arsActive,
        ts: Date.now(),
      })
    );
  } catch (e) {}
}

async function onQuickServiceToggle(field, isChecked) {
  if (!sysState.authenticatedPharmacy) return;
  const fid = sysState.authenticatedPharmacy.id || 1;

  const nextState = {
    farmacia_id: fid,
    pago_tarjeta_activo:
      field === 'pago_tarjeta_activo'
        ? !!isChecked
        : sysState.authenticatedPharmacy.pago_tarjeta_activo !== false,
    envio_domicilio_activo:
      field === 'envio_domicilio_activo'
        ? !!isChecked
        : sysState.authenticatedPharmacy.envio_domicilio_activo !== false,
    seguro_medico_activo:
      field === 'seguro_medico_activo'
        ? !!isChecked
        : sysState.authenticatedPharmacy.seguro_medico_activo !== false,
  };

  applyOperationalServiceFlags(nextState);

  const labels = {
    pago_tarjeta_activo: 'Pago con Tarjeta',
    envio_domicilio_activo: 'Envío a Domicilio',
    seguro_medico_activo: 'Seguro Médico (ARS)',
  };

  try {
    const res = await fetch('/api/pharmacy/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextState),
    });
    const data = await res.json();
    if (data.ok && data.config) {
      applyOperationalServiceFlags(data.config);
      showToast(
        `${isChecked ? '✅ Activado' : '🔒 Bloqueado'}: ${labels[field]} (Sincronizado en POS y App en Casa)`
      );
    } else {
      showToast(data.error || 'No se pudo actualizar la configuración.', 'error');
    }
  } catch (err) {
    console.error('Error guardando configuración de servicio:', err);
    showToast('Error de conexión al guardar configuración.', 'error');
  }
}

async function setAllQuickServices(enableAll) {
  if (!sysState.authenticatedPharmacy) return;
  const fid = sysState.authenticatedPharmacy.id || 1;
  const nextState = {
    farmacia_id: fid,
    pago_tarjeta_activo: !!enableAll,
    envio_domicilio_activo: !!enableAll,
    seguro_medico_activo: !!enableAll,
  };
  applyOperationalServiceFlags(nextState);
  try {
    const res = await fetch('/api/pharmacy/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextState),
    });
    const data = await res.json();
    if (data.ok && data.config) {
      applyOperationalServiceFlags(data.config);
      showToast(
        enableAll
          ? '✅ Todos los servicios (Tarjeta, Domicilio y Seguro Médico) fueron ACTIVADOS en POS y App.'
          : '🔒 Todos los servicios (Tarjeta, Domicilio y Seguro Médico) fueron BLOQUEADOS en POS y App.'
      );
    }
  } catch (err) {
    showToast('Error al sincronizar servicios.', 'error');
  }
}

/* =========================================================================
   IMPORTADOR DE PEDIDOS DE WHATSAPP AL SISTEMA POS
   ========================================================================= */

function openImportWhatsAppOrderModal() {
  const modal = document.getElementById('modal-import-whatsapp-order');
  if (!modal) return;
  const txt = document.getElementById('wa-import-raw-text');
  if (txt) txt.value = '';
  const status = document.getElementById('wa-import-status');
  if (status) status.classList.add('hidden');
  modal.classList.remove('hidden');
  if (txt) txt.focus();
}

function closeImportWhatsAppOrderModal() {
  const modal = document.getElementById('modal-import-whatsapp-order');
  if (modal) modal.classList.add('hidden');
}

async function pasteFromClipboardToWhatsAppModal() {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const clipText = await navigator.clipboard.readText();
      if (clipText) {
        document.getElementById('wa-import-raw-text').value = clipText;
        showToast('Texto pegado del portapapeles correctamente.');
        return;
      }
    }
  } catch (err) {}
  showToast('Por favor pulsa Ctrl+V para pegar el mensaje de WhatsApp.', 'info');
}

async function submitImportWhatsAppOrder() {
  const raw = document.getElementById('wa-import-raw-text').value.trim();
  const status = document.getElementById('wa-import-status');
  if (!raw) {
    showToast('Pega el texto del pedido recibido por WhatsApp.', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit-import-wa');
  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> <span>Procesando...</span>';

  try {
    const res = await fetch('/api/whatsapp/incoming-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        raw_text: raw,
        farmacia_id: sysState.authenticatedPharmacy ? sysState.authenticatedPharmacy.id : 1,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      if (status) {
        status.className = 'p-3 rounded-xl text-xs font-bold bg-rose-50 border border-rose-200 text-rose-700';
        status.textContent = data.error || 'No se pudo procesar el pedido.';
        status.classList.remove('hidden');
      }
      showToast(data.error || 'Error al procesar el pedido de WhatsApp.', 'error');
      return;
    }

    closeImportWhatsAppOrderModal();
    await refreshPharmacyWorkspace();
    switchPosRightTab('orders');
    showToast(`✅ Pedido #${data.order.codigo_orden} ingresado al POS con éxito. Listo para aprobar.`);

    // Sonido de alerta de nuevo pedido
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      osc.frequency.setValueAtTime(880.0, audioCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {}

  } catch (err) {
    showToast('Error de conexión con el servidor POS.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>🚀</span> <span>Registrar Pedido y Ver en Despacho</span>';
  }
}

/* =========================================================================
   FARMASYS POS - CONTROLADORES VISUALES DE SELECCIÓN (ALTO CONTRASTE)
   ========================================================================= */

function selectVisualPaymentMethod(method) {
  const sel = document.getElementById('pos-payment-method');
  if (sel) {
    sel.value = method;
    sel.dispatchEvent(new Event('change'));
  }

  // Actualizar botones visuales con resalte
  const allBtns = document.querySelectorAll('.pay-method-btn');
  allBtns.forEach((btn) => {
    btn.classList.remove('active-pay');
    btn.classList.add('bg-white', 'text-slate-700', 'border-slate-300');
    const badge = btn.querySelector('.badge-active-indicator');
    if (badge) badge.classList.add('hidden');
  });

  const activeBtn = document.getElementById(`btn-pay-${method}`);
  if (activeBtn) {
    activeBtn.classList.add('active-pay');
    activeBtn.classList.remove('bg-white', 'text-slate-700', 'border-slate-300');
    const badge = activeBtn.querySelector('.badge-active-indicator');
    if (badge) badge.classList.remove('hidden');
  }

  // Control de calculadora de efectivo
  const cashContainer = document.getElementById('pos-cash-calc-container');
  if (cashContainer) {
    if (method === 'EFECTIVO') {
      cashContainer.classList.remove('hidden');
      setTimeout(() => document.getElementById('pos-cash-tendered')?.focus(), 100);
    } else {
      cashContainer.classList.add('hidden');
    }
  }

  // Alerta si tarjeta está bloqueada
  if (method === 'TARJETA' && sysState.authenticatedPharmacy && sysState.authenticatedPharmacy.pago_tarjeta_activo === false) {
    showToast('🔒 El pago con tarjeta se encuentra temporalmente bloqueado en la configuración.', 'error');
  }
}

function selectVisualScanPresentation(pres) {
  const sel = document.getElementById('pos-scan-presentation');
  if (sel) sel.value = pres;

  const allPres = document.querySelectorAll('.pres-pill-btn');
  allPres.forEach((btn) => {
    btn.classList.remove('active-pres');
    btn.classList.add('bg-white', 'text-slate-700');
    const badge = btn.querySelector('.badge-pres-active');
    if (badge) badge.classList.add('hidden');
  });

  const activeBtn = document.getElementById(`btn-pres-${pres}`);
  if (activeBtn) {
    activeBtn.classList.add('active-pres');
    activeBtn.classList.remove('bg-white', 'text-slate-700');
    const badge = activeBtn.querySelector('.badge-pres-active');
    if (badge) badge.classList.remove('hidden');
  }
}

