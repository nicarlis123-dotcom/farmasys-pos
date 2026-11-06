
// =============================================================================
// CONTROL DE MENÚS DESPLEGABLES AGRUPADOS (HOVER + CLICK)
// =============================================================================
function toggleSysDropdown(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const wasOpen = container.classList.contains('open');
  closeAllSysDropdowns();
  if (!wasOpen) {
    container.classList.add('open');
  }
}

function closeAllSysDropdowns() {
  document.querySelectorAll('.sys-dropdown-container').forEach(el => el.classList.remove('open'));
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.sys-dropdown-container')) {
    closeAllSysDropdowns();
  }
});

window.toggleSysDropdown = toggleSysDropdown;
window.closeAllSysDropdowns = closeAllSysDropdowns;

function togglePosStatsCollapsible() {
  const body = document.getElementById('pos-stats-collapsible-body');
  const btnText = document.getElementById('btn-toggle-pos-stats-text');
  const arrow = document.getElementById('arrow-toggle-pos-stats');
  if (!body) return;
  const isHidden = body.classList.contains('hidden');
  if (isHidden) {
    body.classList.remove('hidden');
    if (btnText) btnText.textContent = 'Ocultar Métricas y Alertas';
    if (arrow) arrow.textContent = '▴';
  } else {
    body.classList.add('hidden');
    if (btnText) btnText.textContent = 'Mostrar Métricas y Alertas';
    if (arrow) arrow.textContent = '▾';
  }
}
window.togglePosStatsCollapsible = togglePosStatsCollapsible;


function escapeQuote(str) { return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

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
  promotionalKits: [],
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
window.sysState = sysState;
try {
  Object.defineProperty(window, 'posCart', {
    get() { return sysState.posCart; },
    set(v) { sysState.posCart = v; },
    configurable: true
  });
} catch(e) {}

/* =========================================================================
   ESTADO MULTI-VENTANA Y NAVEGACIÓN HISTORIAL DEL SISTEMA POS
   ========================================================================= */
// Helper global para adjuntar automáticamente el token JWT ROL_ADMIN_CAJA
const origFetchSystem = window.fetch;
window.fetch = function(input, init = {}) {
  const token = (window.sysState && window.sysState.sessionToken) 
    ? window.sysState.sessionToken 
    : (function() {
        try {
          const auth = JSON.parse(sessionStorage.getItem('davalsi_sys_auth') || '{}');
          return auth.token || '';
        } catch(e) { return ''; }
      })();

  if (token) {
    init.headers = init.headers || {};
    if (init.headers instanceof Headers) {
      if (!init.headers.has('Authorization')) init.headers.set('Authorization', 'Bearer ' + token);
    } else if (Array.isArray(init.headers)) {
      init.headers.push(['Authorization', 'Bearer ' + token]);
    } else {
      if (!init.headers['Authorization']) init.headers['Authorization'] = 'Bearer ' + token;
    }
  }
  return origFetchSystem.apply(this, [input, init]);
};

// Modal / Notificación para funciones futuras o en desarrollo
window.showProximamenteModal = function(featureName = 'Esta función') {
  if (typeof showToast === 'function') {
    showToast(`ℹ️ ${featureName}: Próximamente disponible en la siguiente actualización.`, 'info');
  } else {
    alert(`${featureName}: Próximamente disponible.`);
  }
};

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



function formatMoneyRD(val) {
  const num = Number(val || 0);
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  // Si se solicita acceso directo como admin desde la app (ej. /pos?auto=admin o /pos?role=admin)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('auto') === 'admin' || urlParams.get('role') === 'admin') {
    const fid = (sysState.pharmacies && sysState.pharmacies.length > 0) ? sysState.pharmacies[0].id : 1;
    await quickDirectLogin(fid, 'admin', '123456');
    handleHashNavigation();
    return;
  }

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
  // Formulario de login limpio (sin autocompletar contraseñas)
  if (sysState.pharmacies && sysState.pharmacies.length > 0) {
    const sel = document.getElementById('login-pharmacy-select');
    if (sel) sel.value = String(sysState.pharmacies[0].id);
  }
}

async function loadPharmaciesForLogin() {
  const res = await fetch('/api/pharmacies');
  const data = await res.json();
  if (!data.ok) return;
  sysState.pharmacies = data.pharmacies || [];
  hideFarmasysLoader();

  const sel = document.getElementById('login-pharmacy-select');
  const demoList = document.getElementById('demo-credentials-list');

  if (sysState.pharmacies.length === 0) {
    if (sel) {
      sel.innerHTML = '<option value="">(Sin farmacias registradas - Registra la tuya)</option>';
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
}

async function quickDirectLogin(farmaciaId, username, clave) {
  let fid = parseInt(farmaciaId, 10);
  if (!fid || isNaN(fid) || fid <= 0) {
    fid = (sysState.pharmacies && sysState.pharmacies.length > 0) ? sysState.pharmacies[0].id : 1;
  }
  let data;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmacia_id: fid, username: username || 'admin', clave_acceso: clave || '123456' }),
    });
    data = await res.json();
  } catch (err) {
    console.error('Error de red en quickDirectLogin:', err);
    showToast('Error de red al conectar con el servidor.', 'error');
    return;
  }

  if (data && data.ok) {
    try {
      enterAuthenticatedWorkspace(data.pharmacy, data.token);
      showToast(`Sesión iniciada en ${data.pharmacy.nombre || 'FarmaSys'}`);
    } catch (renderErr) {
      console.error('Error post-login:', renderErr);
      const gate = document.getElementById('auth-gate-screen');
      if (gate) { gate.classList.add('hidden'); gate.style.display = 'none'; }
    }
  } else {
    showToast(data?.error || 'Error al entrar. Clave o usuario no válido.', 'error');
  }
}

function fillDemoLogin(farmaciaId, username, clave) {
  const sel = document.getElementById('login-pharmacy-select');
  if (sel && farmaciaId) sel.value = String(farmaciaId);
  const u = document.getElementById('login-username-input');
  if (u && username) u.value = username;
  const errEl = document.getElementById('login-error-msg');
  if (errEl) errEl.classList.add('hidden');
}

async function handlePharmacyLogin(event) {
  if (event) event.preventDefault();
  const selEl = document.getElementById('login-pharmacy-select');
  let farmaciaId = selEl ? parseInt(selEl.value, 10) : 1;
  if (!farmaciaId || isNaN(farmaciaId) || farmaciaId <= 0) {
    farmaciaId = (sysState.pharmacies && sysState.pharmacies.length > 0) ? sysState.pharmacies[0].id : 1;
  }
  const uInput = document.getElementById('login-username-input');
  const pInput = document.getElementById('login-password-input');
  const username = (uInput ? uInput.value : 'admin').trim() || 'admin';
  const clave = (pInput ? pInput.value : '123456').trim() || '123456';
  const errEl = document.getElementById('login-error-msg');
  if (errEl) errEl.classList.add('hidden');

  let data;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmacia_id: farmaciaId, username, clave_acceso: clave }),
    });
    data = await res.json();
  } catch (netErr) {
    console.error('Error de red al conectar con el backend:', netErr);
    if (errEl) {
      errEl.textContent = 'Error de conexión: El backend en el puerto 8080 no responde o hubo un corte de red.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  if (!data || !data.ok) {
    if (errEl) {
      errEl.textContent = (data && data.error) ? data.error : 'Clave de acceso o usuario incorrecto.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  try {
    enterAuthenticatedWorkspace(data.pharmacy, data.token);
    showToast(`Sesión iniciada en ${data.pharmacy.nombre || 'FarmaSys'}`);
  } catch (renderErr) {
    console.error('Error inicializando el espacio de trabajo:', renderErr);
    const gate = document.getElementById('auth-gate-screen');
    if (gate) {
      gate.classList.add('hidden');
      gate.classList.remove('flex');
      gate.style.display = 'none';
    }
  }
}

function enterAuthenticatedWorkspace(pharmacy, token) {
  if (!pharmacy) pharmacy = { id: 1, nombre: 'Farmacia Davalsi', rol_actual: 'ADMINISTRADOR', usuario_actual: 'admin' };
  sysState.authenticatedPharmacy = pharmacy;
  sysState.sessionToken = token;
  sysState.posCart = [];
  try { clearSelectedPosPatient(); } catch (e) {}
  try { sessionStorage.setItem('davalsi_sys_auth', JSON.stringify({ pharmacy, token })); } catch (e) {}

  const gate = document.getElementById('auth-gate-screen');
  if (gate) {
    gate.classList.add('hidden');
    gate.classList.remove('flex');
    gate.style.display = 'none';
  }

  const nameEl = document.getElementById('sys-header-pharmacy-name');
  if (nameEl) nameEl.textContent = pharmacy.nombre || 'Farmacia Davalsi';

  const r = (pharmacy.rol_actual || 'ADMINISTRADOR').toUpperCase();
  const roleIcon = (r === 'CAJERO' || r === 'VENDEDOR') ? '👤' : (r.includes('REGENTE') ? '🩺' : '🛡️');
  const badgeEl = document.getElementById('sys-header-user-badge');
  if (badgeEl) badgeEl.textContent = `${roleIcon} ${pharmacy.usuario_actual || pharmacy.usuario_admin || 'admin'} (${r})`;

  const subEl = document.getElementById('sys-header-pharmacy-sub');
  if (subEl) subEl.textContent = `📍 ${pharmacy.direccion || 'Sede Principal'} • Tel: ${pharmacy.telefono || pharmacy.telefono_whatsapp || '809-555-0900'}`;

  try { applyRolePermissions(r); } catch (e) { console.error('Error en applyRolePermissions:', e); }
  try { applyOperationalServiceFlags(pharmacy); } catch (e) { console.error('Error en applyOperationalServiceFlags:', e); }
  try { switchSysTab('pos'); } catch (e) { console.error('Error en switchSysTab:', e); }
  try { refreshPharmacyWorkspace(); } catch (e) { console.error('Error en refreshPharmacyWorkspace:', e); }
}

function applyRolePermissions(role) {
  const r = (role || 'ADMINISTRADOR').toUpperCase();
  const isCajero = (r === 'CAJERO' || r === 'VENDEDOR');
  const isRegente = (r === 'REGENTE' || r === 'REGENTE_FARMACEUTICO');
  const isAdmin = (r === 'ADMINISTRADOR' || r === 'ROL_ADMIN_CAJA' || r === 'ADMIN');

  // Actualizar etiqueta del botón selector rápido de roles
  const roleLabel = document.getElementById('sys-current-role-label');
  if (roleLabel) {
    if (isAdmin) roleLabel.textContent = '🛡️ Admin';
    else if (isRegente) roleLabel.textContent = '🩺 Regente';
    else roleLabel.textContent = '👤 Cajero';
  }

  // 1. Visibilidad de pestañas y módulos
  // Cajero: solo ventas y consulta (no reportes ni config avanzada)
  // Regente: inventario, vencimientos, recetas, crónicos, pero no reportes financieros globales ni config
  // Admin: acceso total
  const reportesBtn = document.getElementById('sys-tab-reportes');
  const configBtn = document.getElementById('sys-tab-config');
  const mobReportesBtn = document.getElementById('mob-tab-reportes');
  const mobConfigBtn = document.getElementById('mob-tab-config');

  if (reportesBtn) reportesBtn.style.display = (isAdmin) ? '' : 'none';
  if (configBtn) configBtn.style.display = (isAdmin) ? '' : 'none';
  if (mobReportesBtn) mobReportesBtn.style.display = (isAdmin) ? '' : 'none';
  if (mobConfigBtn) mobConfigBtn.style.display = (isAdmin) ? '' : 'none';

  // 2. Botón de Quejas Clientes IA (Exclusivo Administrador)
  const quejasBtn = document.getElementById('sys-nav-quejas-btn');
  if (quejasBtn) {
    quejasBtn.style.display = (isAdmin) ? '' : 'none';
  }

  // 3. Botón de Arqueo y Cierre de Caja Cortes X y Z (Exclusivo Administrador)
  const cajaBtn = document.getElementById('sys-nav-caja-btn');
  const posCajaBtn = document.getElementById('pos-caja-btn');
  if (cajaBtn) cajaBtn.style.display = (isAdmin) ? '' : 'none';
  if (posCajaBtn) posCajaBtn.style.display = (isAdmin) ? '' : 'none';

  // 4. Botón de Psicotrópicos Ley 50-88 (Visible para Regente y Admin, oculto para Cajero)
  const psicoBtn = document.getElementById('sys-nav-psicotropicos-btn');
  if (psicoBtn) {
    psicoBtn.style.display = (isRegente || isAdmin) ? '' : 'none';
  }

  // 5. Botón de Nueva Farmacia (Exclusivo Administrador)
  const newPhBtn = document.getElementById('sys-header-btn-new-pharmacy');
  if (newPhBtn) newPhBtn.style.display = (isAdmin) ? '' : 'none';

  // 5.1 Menús agrupados: mismos permisos en versión móvil y grupo "Gestión" solo Administrador
  const setVis = (id, visible) => {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? '' : 'none';
  };
  ['mob-nav-caja-btn', 'mob-nav-quejas-btn', 'mob-nav-staff-btn', 'mob-nav-services-btn',
   'sys-nav-staff-btn', 'sys-nav-services-btn'].forEach((id) => setVis(id, isAdmin));
  setVis('mob-nav-psicotropicos-btn', isRegente || isAdmin);
  setVis('sys-grp-container-gestion', isAdmin);
  setVis('mob-grp-gestion', isAdmin);

  // 6. Configuración de Precios en el modal de edición de producto
  const priceInput = document.getElementById('edit-prod-price');
  const costInput = document.getElementById('edit-prod-real-cost');
  if (priceInput && costInput) {
    if (isAdmin) {
      priceInput.readOnly = false;
      priceInput.title = 'Modificación permitida para Administrador';
      priceInput.classList.remove('bg-slate-100', 'cursor-not-allowed');
      costInput.readOnly = false;
      costInput.title = 'Modificación permitida para Administrador';
      costInput.classList.remove('bg-slate-100', 'cursor-not-allowed');
    } else {
      priceInput.readOnly = true;
      priceInput.title = '🔒 Modificación de precio bloqueada. Exclusiva del Administrador.';
      priceInput.classList.add('bg-slate-100', 'cursor-not-allowed');
      costInput.readOnly = true;
      costInput.title = '🔒 Modificación de costo bloqueada. Exclusiva del Administrador.';
      costInput.classList.add('bg-slate-100', 'cursor-not-allowed');
    }
  }
}

function logoutPharmacy() {
  sysState.authenticatedPharmacy = null;
  sysState.sessionToken = null;
  sysState.posCart = [];
    clearSelectedPosPatient();
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
  const auth = sysState.authenticatedPharmacy || {};
  const role = (auth.rol_actual || auth.role || 'ADMINISTRADOR').toUpperCase();
  const isAdmin = (role === 'ADMINISTRADOR' || role === 'ROL_ADMIN_CAJA' || role === 'ADMIN');

  if (!isAdmin && tab === 'config') {
    showToast('Acceso restringido: Configuración avanzada es exclusiva de Administrador (ROL_ADMIN_CAJA).', 'error');
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

  closeAllSysDropdowns();
  const allTabs = ['pos', 'solicitudes', 'recetas', 'inventario', 'vencimientos', 'deudores', 'reportes', 'config', 'whatsapp', 'cronicos', 'planes', 'kits'];
  allTabs.forEach((t) => {
    const view = document.getElementById(`view-${t}`);
    const btn = document.getElementById(`sys-tab-${t}`);
    const mobBtn = document.getElementById(`mob-tab-${t}`);
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
        btn.classList.add('bg-teal-600/30', 'text-teal-300');
        btn.classList.remove('text-slate-200');
      } else {
        btn.classList.remove('bg-teal-600/30', 'text-teal-300');
        btn.classList.add('text-slate-200');
      }
    }
    if (mobBtn) {
      if (t === tab) {
        mobBtn.classList.add('bg-teal-600/30', 'text-teal-300');
        mobBtn.classList.remove('text-slate-200');
      } else {
        mobBtn.classList.remove('bg-teal-600/30', 'text-teal-300');
        mobBtn.classList.add('text-slate-200');
      }
    }
  });

  // Resaltado visual en la barra de navegación superior (Listo para Venta y WhatsApp en Primera Instancia)
  const posBtn = document.getElementById('sys-nav-pos-btn');
  const pedidosBtn = document.getElementById('sys-nav-pedidos-btn');
  const masterGrpBtn = document.getElementById('sys-grp-btn-master');

  if (posBtn) {
    if (tab === 'pos') {
      posBtn.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 bg-teal-600 text-white shadow-md shadow-teal-700/30 cursor-pointer';
    } else {
      posBtn.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 text-slate-300 hover:text-white hover:bg-slate-700/60 cursor-pointer';
    }
  }

  if (pedidosBtn) {
    if (tab === 'solicitudes') {
      pedidosBtn.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 bg-teal-600 text-white shadow-md shadow-teal-700/30 cursor-pointer';
    } else {
      pedidosBtn.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 text-slate-300 hover:text-white hover:bg-slate-700/60 cursor-pointer';
    }
  }

  if (masterGrpBtn) {
    const isMasterTab = !['pos', 'solicitudes'].includes(tab);
    if (isMasterTab) {
      masterGrpBtn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-teal-600 text-white shadow-md shadow-teal-700/30 cursor-pointer border border-teal-500';
    } else {
      masterGrpBtn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 text-slate-300 hover:text-white hover:bg-slate-700/60 cursor-pointer border border-slate-600/60';
    }
  }

  // Resaltar el grupo desplegable que contiene la vista activa
  const TAB_TO_GROUP = {
    deudores: 'ventas', kits: 'ventas',
    inventario: 'inventario', vencimientos: 'inventario',
    recetas: 'clinico',
    cronicos: 'clientes', planes: 'clientes', whatsapp: 'clientes',
    reportes: 'gestion', config: 'gestion',
  };
  const activeGroup = TAB_TO_GROUP[tab] || null;
  ['ventas', 'inventario', 'clinico', 'clientes', 'ia', 'gestion'].forEach((g) => {
    const gb = document.getElementById(`sys-grp-btn-${g}`);
    if (!gb) return;
    gb.className = (g === activeGroup)
      ? 'px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-teal-600 text-white shadow-md shadow-teal-700/30 cursor-pointer border border-teal-500'
      : 'px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 text-slate-300 hover:text-white hover:bg-slate-700/60 cursor-pointer border border-slate-600/60';
  });

  if (tab === 'cronicos') {
    loadChronicPatients();
  } else if (tab === 'planes') {
    loadFrequentPlans();
  } else if (tab === 'reportes') {
    initSalesReportsView();
  } else if (tab === 'config') {
    loadSysStaff();
    loadSysWhatsAppLogs();
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
    loadPromotionalKits(fid),
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
  
  const bannerAlerts = document.getElementById('pos-banner-alerts-summary');
  if (bannerAlerts && m) {
    const totalAlerts = (m.alertas_stock_bajo_count || 0) + (m.vencimientos?.total_alertas_vencimiento || 0) + (m.deudores_pendientes_count || 0) + (m.pedidos_web_pendientes || 0);
    bannerAlerts.textContent = `${totalAlerts} alertas pendientes`;
    const masterBadge = document.getElementById('badge-master-menu');
    if (masterBadge) {
      if (totalAlerts > 0) {
        masterBadge.textContent = totalAlerts;
        masterBadge.classList.remove('hidden');
      } else {
        masterBadge.classList.add('hidden');
      }
    }
  }
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

// Estado global para navegación con teclado en el buscador POS
let posSearchHighlightedIndex = -1;
let posCurrentMatches = [];

function handlePosSearchInput(val) {
  const dropdown = document.getElementById('pos-search-dropdown');
  if (!dropdown) return;
  const q = (val || '').trim().toLowerCase();
  posSearchHighlightedIndex = -1;
  posCurrentMatches = [];

  if (!q || q.length < 1) {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
    const inlineAi = document.getElementById('pos-inline-ai-suggestion-box');
    if (inlineAi) inlineAi.classList.add('hidden');
    return;
  }
  if (q.length >= 3) {
    triggerInlinePosAiSuggestion(q);
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

  posCurrentMatches = matches.slice(0, 10);

  // Selector externo de presentación activo en la pantalla principal
  const extPresSelect = document.getElementById('pos-scan-presentation');
  const currentExternalPres = extPresSelect ? extPresSelect.value : 'UNIDAD';

  dropdown.innerHTML = posCurrentMatches
    .map((p, idx) => {
      // 1. Nombre del Fármaco
      const nombre = p.nombre_comercial || 'Medicamento Sin Nombre';

      // 2. Dosis y Presentación (ej. "500 mg - Tableta" o "250 mg/5 ml - Jarabe")
      let dosisPres = p.dosis_presentacion;
      if (!dosisPres) {
        const conc = (p.concentracion || '').trim();
        const forma = (p.forma_farmaceutica || p.unidad_minima_nombre || 'Tableta').trim();
        if (conc && forma) dosisPres = `${conc} - ${forma}`;
        else if (conc) dosisPres = conc;
        else if (forma) dosisPres = forma;
        else dosisPres = 'Estándar';
      }

      // 3. Ubicación en Farmacia (Anaquel B-2 / Tramo 3)
      const ubicacionRaw = (p.ubicacion_anaquel || 'A-01').trim();
      const ubicacion = ubicacionRaw.toLowerCase().startsWith('anaquel')
        ? ubicacionRaw
        : `Anaquel ${ubicacionRaw}`;

      // 4. Precio de Venta (calculado según presentación o precio base)
      let precioVenta = p.precio_base || 0;
      if (p.precios_presentacion && p.precios_presentacion[currentExternalPres]) {
        precioVenta = p.precios_presentacion[currentExternalPres];
      }

      const isExpired = p.vencimiento && p.vencimiento.vencido;
      const isLowStock = p.inventario && p.inventario.alerta_stock_bajo;
      const stock = p.inventario ? p.inventario.stock_total_unidades : 0;

      return `
        <div
          id="pos-search-item-${idx}"
          class="pos-search-result-row p-3 hover:bg-teal-50/70 border-b border-slate-100 last:border-b-0 cursor-pointer transition flex items-center justify-between gap-3 group"
          onclick="selectProductFromSearch(${p.id})"
          data-product-id="${p.id}"
          title="Clic para despachar ${nombre} (${currentExternalPres})"
        >
          <!-- Datos Esenciales Izquierda: Nombre, Dosis y Ubicación -->
          <div class="flex-1 min-w-0 pr-2">
            <div class="flex items-center gap-2 flex-wrap">
              <!-- a) Nombre del Fármaco (destacado en negrita y con estilo de enlace interactivo) -->
              <span class="font-extrabold text-teal-800 group-hover:text-teal-900 group-hover:underline text-sm tracking-tight cursor-pointer">
                ${nombre}
              </span>

              <!-- b) Dosis y Presentación (ej. 500 mg - Tableta) -->
              <span class="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                ${dosisPres}
              </span>
            </div>

            <div class="flex items-center gap-2.5 mt-1 text-xs">
              <!-- c) Ubicación en Farmacia (Etiqueta clara para el despachador) -->
              <span class="inline-flex items-center gap-1 font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 shadow-2xs">
                <span>📍</span> <span>${ubicacion}</span>
              </span>

              ${
                isExpired
                  ? `<span class="text-[11px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">⛔ Vencido</span>`
                  : stock <= 0
                  ? `<span class="text-[11px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Sin stock</span>`
                  : ''
              }
            </div>
          </div>

          <!-- d) Precio de Venta (Alineado a la derecha, claro y legible) -->
          <div class="text-right flex-shrink-0">
            <div class="text-sm font-black text-slate-900 group-hover:text-teal-700">
              ${formatRD(precioVenta)}
            </div>
            <div class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              ${currentExternalPres}
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  dropdown.classList.remove('hidden');
}

// Selección directa con un clic en el nombre o fila
function selectProductFromSearch(productId) {
  const extPresSelect = document.getElementById('pos-scan-presentation');
  const currentPres = extPresSelect ? extPresSelect.value : 'UNIDAD';

  // Agregar directamente al carrito con la presentación del selector externo
  addPosItemDirect(productId, currentPres);

  // Limpiar y cerrar lista de resultados automáticamente
  const dropdown = document.getElementById('pos-search-dropdown');
  if (dropdown) {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
  }
  const input = document.getElementById('pos-barcode-input');
  if (input) {
    input.value = '';
    input.focus();
  }
}

function handlePosSearchKeydown(event) {
  const dropdown = document.getElementById('pos-search-dropdown');
  const isDropdownOpen = dropdown && !dropdown.classList.contains('hidden');

  if (event.key === 'Escape') {
    if (dropdown) dropdown.classList.add('hidden');
    return;
  }

  // Navegación con flechas en la lista de resultados
  if (isDropdownOpen && posCurrentMatches.length > 0) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      posSearchHighlightedIndex = (posSearchHighlightedIndex + 1) % posCurrentMatches.length;
      updateSearchHighlight();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      posSearchHighlightedIndex = (posSearchHighlightedIndex - 1 + posCurrentMatches.length) % posCurrentMatches.length;
      updateSearchHighlight();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (posSearchHighlightedIndex >= 0 && posSearchHighlightedIndex < posCurrentMatches.length) {
        selectProductFromSearch(posCurrentMatches[posSearchHighlightedIndex].id);
        return;
      }
      // Si no hay ninguno resaltado con flechas pero hay resultados, seleccionar el primero para agilizar
      if (posCurrentMatches.length > 0) {
        selectProductFromSearch(posCurrentMatches[0].id);
        return;
      }
    }
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    handlePosBarcodeSubmit(event);
  }
}

function updateSearchHighlight() {
  document.querySelectorAll('.pos-search-result-row').forEach((row, idx) => {
    if (idx === posSearchHighlightedIndex) {
      row.classList.add('bg-teal-100/80', 'ring-2', 'ring-teal-500', 'ring-inset');
      row.scrollIntoView({ block: 'nearest' });
    } else {
      row.classList.remove('bg-teal-100/80', 'ring-2', 'ring-teal-500', 'ring-inset');
    }
  });
}

function addPosItemDirect(productId, presentation, force = false) {
  const p = sysState.products.find((x) => x.id === productId);
  if (!p) return;

  // Verificación de Duplicidad Farmacológica / Misma Familia antes de agregar
  if (!force) {
    const dup = checkCartDuplicity(p);
    if (dup) {
      showDuplicityWarningModal(dup.itemExistente, p, presentation || 'UNIDAD');
      return;
    }
  }
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

  // Verificación de Alergias Clínicas del Paciente
  const currentCedula = (document.getElementById('pos-client-cedula')?.value || '').trim();
  if (currentCedula && window.checkProductAllergyConflictSync) {
    const conflict = window.checkProductAllergyConflictSync(currentCedula, p.nombre_comercial, p.principio_activo);
    if (conflict && conflict.blocked) {
      window.showPosAllergyBlockModal(p, conflict);
      return;
    }
  }

  // Control RBAC de Psicotrópicos y Estupefacientes (Ley 50-88):
  const esPsico = Boolean(p.es_psicotropico || (p.categoria && p.categoria.toLowerCase().includes('psicotr')) || (p.tipo_control && p.tipo_control.includes('PSICO')));
  const currentRole = sysState.authenticatedPharmacy ? (sysState.authenticatedPharmacy.rol_actual || 'ADMINISTRADOR').toUpperCase() : 'ADMINISTRADOR';
  const isCajero = (currentRole === 'CAJERO' || currentRole === 'VENDEDOR');

  if (esPsico && isCajero && !p._autorizado_por_regente) {
    openPsicotropicoAuthModal(p, pres);
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

  // Verificación de Alergias Clínicas del Paciente
  const barcodeCedula = (document.getElementById('pos-client-cedula')?.value || '').trim();
  if (barcodeCedula && window.checkProductAllergyConflictSync) {
    const conflict = window.checkProductAllergyConflictSync(barcodeCedula, product.nombre_comercial, product.principio_activo);
    if (conflict && conflict.blocked) {
      window.showPosAllergyBlockModal(product, conflict);
      return;
    }
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

function evaluatePosCrossSelling() {
  try {
    if (!sysState.posCart || !sysState.posCart.length) {
      const banner = document.getElementById('pos-cross-sell-banner');
      if (banner) banner.classList.add('hidden');
      return;
    }
    const lastItem = sysState.posCart[sysState.posCart.length - 1];
    if (lastItem && window.farmaIaEngine && typeof window.farmaIaEngine.setDialogue === 'function') {
      const name = lastItem.nombre_comercial || lastItem.nombre || '';
      if (name) {
        window.farmaIaEngine.setPose('atencion');
      }
    }
  } catch (e) {
    console.debug('Cross-selling evaluation note:', e);
  }
}

function renderPosCart() {
  const tbody = document.getElementById('pos-cart-tbody');
  if (!sysState.posCart.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400">Escanee un código o busque una mercancía/medicamento arriba para facturar en mostrador.</td></tr>`;
    document.getElementById('pos-total-min-units').textContent = '0 unid.';
    document.getElementById('pos-total-amount').textContent = 'RD$ 0.00';
    updatePosActiveCartPills();
    evaluatePosCrossSelling();
    return;
  }

  let totalU = 0;
  let totalRD = 0;
  tbody.innerHTML = sysState.posCart
    .map((item, idx) => {
      if (item.is_pharma_service) {
        const sub = Number(item.unit_price || 0) * item.cantidad;
        totalU += item.cantidad;
        totalRD += sub;
        return `
          <tr class="bg-rose-50/50 border-b border-rose-200/70">
            <td class="py-2.5 px-3">
              <div class="flex items-center gap-1.5">
                <span class="text-[10px] font-black px-1.5 py-0.2 rounded bg-rose-600 text-white shadow-2xs">🩺 SERVICIO SECUNDARIO</span>
                <p class="font-extrabold text-slate-900">${item.nombre_comercial}</p>
              </div>
              <p class="text-[10px] text-rose-900 font-bold mt-0.5">${item.detalle_clinico || 'Atención Farmacéutica / Paciente Crónico'}</p>
            </td>
            <td class="py-2.5 px-2">
              <span class="px-2 py-0.5 rounded font-black text-[10px] bg-rose-100 text-rose-900 border border-rose-300">SERVICIO</span>
            </td>
            <td class="py-2.5 px-2 text-center font-mono font-bold">1</td>
            <td class="py-2.5 px-2 text-center font-mono text-slate-400">Servicio</td>
            <td class="py-2.5 px-3 text-right font-extrabold text-slate-900">${formatRD(sub)}</td>
            <td class="py-2.5 px-2 text-center">
              <button type="button" onclick="changePosItemQty(${idx}, -999)" class="text-rose-500 hover:text-rose-700 font-extrabold cursor-pointer p-1">✕</button>
            </td>
          </tr>
        `;
      }
      if (item.is_kit || item.es_kit) {
        const sub = (item.unit_price || item.precio_oferta || item.product.precio_base) * item.cantidad;
        const totalComps = item.items ? item.items.length * item.cantidad : item.cantidad;
        totalU += totalComps;
        totalRD += sub;
        const compsText = (item.items || []).map(it => `${it.cantidad}x ${it.presentacion} ${it.nombre_comercial}`).join(' + ');

        return `
          <tr class="bg-amber-50/40 border-b border-amber-200/60">
            <td class="py-2.5 px-3">
              <div class="flex items-center gap-1.5">
                <span class="text-[10px] font-black px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 shadow-2xs">⚡ KIT OFERTA</span>
                <p class="font-extrabold text-slate-900">${item.nombre_comercial}</p>
              </div>
              <p class="text-[10px] text-amber-900 font-bold mt-0.5">
                📦 Consta de: ${compsText}
              </p>
              <p class="text-[10px] font-mono text-slate-400">Precio regular: RD$ ${(item.precio_regular_total * item.cantidad).toFixed(2)} • Ahorro combo: RD$ ${(item.ahorro_monto * item.cantidad).toFixed(2)}</p>
            </td>
            <td class="py-2.5 px-2">
              <span class="px-2 py-0.5 rounded font-black text-[10px] bg-amber-100 text-amber-900 border border-amber-300">PAQUETE SEMANAL</span>
            </td>
            <td class="py-2.5 px-2 text-center">
              <div class="inline-flex items-center gap-0.5">
                <button type="button" onclick="changePosItemQty(${idx}, -1)" class="w-6 h-6 rounded bg-white border border-slate-300 hover:bg-slate-100 font-extrabold text-xs cursor-pointer">-</button>
                <input
                  type="number"
                  min="1"
                  max="999"
                  value="${item.cantidad}"
                  onchange="setPosItemDirectQty(${idx}, this.value)"
                  class="w-10 text-center font-extrabold text-xs border border-slate-300 rounded bg-white py-0.5"
                />
                <button type="button" onclick="changePosItemQty(${idx}, 1)" class="w-6 h-6 rounded bg-white border border-slate-300 hover:bg-slate-100 font-extrabold text-xs cursor-pointer">+</button>
              </div>
            </td>
            <td class="py-2.5 px-3 text-right">
              <span class="font-extrabold text-slate-900">${formatRD(sub)}</span>
            </td>
            <td class="py-2.5 px-2 text-center">
              <button type="button" onclick="removePosItem(${idx})" class="text-rose-500 hover:text-rose-700 font-extrabold cursor-pointer p-1">✕</button>
            </td>
          </tr>
        `;
      }
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
            <button type="button" onclick="openSubstituteModal(${p.id}, '${escapeQuote(p.nombre_comercial)}', '${escapeQuote(p.principio_activo || '')}')" class="text-indigo-600 hover:text-indigo-800 font-extrabold px-1.5 py-0.5 rounded text-[11px] block mx-auto mb-1" title="Ver sustitutos y bioequivalentes con stock">💡 Sustitutos</button>
            <button onclick="changePosItemQty(${idx}, -999)"  title="Quitar fila" class="text-rose-600 hover:text-rose-800 font-bold px-1.5 py-0.5 rounded">✕</button>
          </td>
        </tr>
      `;
    })
    .join('');

  document.getElementById('pos-total-min-units').textContent = `${totalU} unid. mínimas`;
  let subtotalRD = totalRD;
  let discountRD = 0;
  let pctDiscount = 0;

  if (sysState.posSelectedPatient && sysState.posSelectedPatient.plan_descuento_porcentaje > 0 && sysState.posApplyBonus) {
    pctDiscount = sysState.posSelectedPatient.plan_descuento_porcentaje;
    discountRD = (subtotalRD * pctDiscount) / 100;
  }

  let finalToChargeRD = Math.max(0, subtotalRD - discountRD);

  const elSubtotal = document.getElementById('pos-subtotal-val');
  if (elSubtotal) elSubtotal.textContent = formatRD(subtotalRD);

  const rowBonus = document.getElementById('pos-row-bonus-discount');
  const elBonusAmount = document.getElementById('pos-discount-amount-summary');
  const elBonusPct = document.getElementById('pos-discount-pct-summary');
  const elBonusDirect = document.getElementById('pos-bonus-discount-amount');

  if (discountRD > 0) {
    if (rowBonus) rowBonus.classList.remove('hidden');
    if (elBonusAmount) elBonusAmount.textContent = '-' + formatRD(discountRD);
    if (elBonusPct) elBonusPct.textContent = pctDiscount + '%';
    if (elBonusDirect) elBonusDirect.textContent = '-' + formatRD(discountRD);
  } else {
    if (rowBonus) rowBonus.classList.add('hidden');
    if (elBonusDirect) elBonusDirect.textContent = '-RD$ 0.00';
  }

  document.getElementById('pos-total-amount').textContent = formatRD(finalToChargeRD);
  updatePosActiveCartPills();
  evaluatePosCrossSelling();
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

  const itemsPayload = sysState.posCart.map((i) => {
    if (i.is_pharma_service) {
      return {
        es_servicio_farmaceutico: true,
        presentacion: 'SERVICIO',
        nombre_comercial: i.nombre_comercial,
        cantidad: Number(i.cantidad || 1),
        precio_servicio: Number(i.unit_price || 0),
        detalle_clinico: i.detalle_clinico || ''
      };
    }
    if (i.is_kit || i.es_kit) {
      return {
        es_kit: true,
        kit_id: i.kit_id || i.codigo_kit,
        cantidad: Number(i.cantidad || 1),
        presentacion: 'KIT',
        precio_vendedor: Number(i.unit_price || 0)
      };
    }
    return {
      producto_id: Number(i.product ? i.product.id : i.producto_id),
      presentacion: i.presentacion,
      cantidad: Number(i.cantidad || 1),
    };
  });

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
        descuento_porcentaje: (sysState.posSelectedPatient && sysState.posApplyBonus) ? (sysState.posSelectedPatient.plan_descuento_porcentaje || 0) : 0,
        plan_paciente_id: (sysState.posSelectedPatient && sysState.posApplyBonus) ? (sysState.posSelectedPatient.plan_id || null) : null,
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
    clearSelectedPosPatient();
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
      <div class="flex justify-center mb-1"><img src="/icon-192.png" class="w-11 h-11 object-contain mx-auto" /></div>
      <h3 class="text-lg font-black text-teal-900 tracking-wider">FARMACIA DAVALSI</h3>
      <p class="text-xs font-semibold text-teal-700">${f.eslogan || 'Salud al Instante'}</p>
      <p class="text-[11px] font-mono font-bold text-slate-600">RNC: ${f.rnc || '1-31-99887-2'} | Tel: ${f.telefono || f.telefono_whatsapp || '(809) 555-0199'}</p>
      <p class="text-[11px] text-slate-500">${f.direccion || 'Av. Abraham Lincoln #402, Piantini'}</p>
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
  const pills = ['TODOS', 'MERCANCIA', 'MEDICAMENTOS', 'POR_VENCER', 'VENCIDOS', 'STOCK_BAJO', 'SIN_SALIDA', 'CRONICOS'];
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
            : p === 'CRONICOS'
            ? 'bg-purple-50 text-purple-900 border border-purple-400 font-extrabold'
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
    // Alerta de poca salida REAL: Excluye medicamentos de uso crónico mensual
    list = list.filter((p) => p.rotacion && p.rotacion.alerta_poca_salida && !p.rotacion.es_uso_cronico);
  } else if (sysState.inventoryFilterPill === 'CRONICOS') {
    // Medicamentos de uso crónico con salida mensual programada
    list = list.filter((p) => p.rotacion && p.rotacion.es_uso_cronico);
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
  const sinSalidaCnt = prods.filter((p) => p.rotacion && p.rotacion.alerta_poca_salida && !p.rotacion.es_uso_cronico).length;
  const cronicosCnt = prods.filter((p) => p.rotacion && p.rotacion.es_uso_cronico).length;

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
  const elCronicos = document.getElementById('cnt-inv-cronicos');
  if (elCronicos) elCronicos.textContent = cronicosCnt;

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
              ${
                p.rotacion && p.rotacion.es_uso_cronico
                  ? `<span class="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-purple-100 text-purple-900 border border-purple-300" title="${p.rotacion.descripcion || 'Salida mensual continua por pacientes crónicos. No es producto estancado.'}">🩺 Uso Crónico (${p.rotacion.unidades_vendidas_mes || 0}u/mes)</span>`
                  : (p.rotacion && p.rotacion.alerta_poca_salida
                      ? `<span class="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300" title="${p.rotacion.descripcion || 'Baja rotación real'}">📉 Sin Salida Real (${p.rotacion.unidades_vendidas_mes || 0}u/mes)</span>`
                      : '')
              }
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
  const currentRole = sysState.authenticatedPharmacy ? (sysState.authenticatedPharmacy.rol_actual || 'ADMINISTRADOR').toUpperCase() : 'ADMINISTRADOR';
  if (currentRole === 'CAJERO' || currentRole === 'VENDEDOR') {
    showToast('🔒 Acceso denegado: El Cajero solo tiene permisos de consulta y venta. La edición de productos y precios requiere Regente o Administrador.', 'error');
    return;
  }
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
  const subtabs = ['diario', 'mensual', 'graficos', 'comparativa', 'finanzas'];
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
        <div style="margin-bottom: 6px;"><img src="/icon-192.png" style="width: 44px; height: 44px; object-contain: contain; margin: 0 auto; display: block;" /></div>
        <h2 style="margin: 0; font-size: 16px; font-weight: 900; letter-spacing: 0.5px;">FARMACIA DAVALSI</h2>
        <p style="margin: 2px 0; font-size: 10px; font-weight: 600;">${f.eslogan || 'Salud al Instante • Servicio Profesional'}</p>
        <p style="margin: 3px 0; font-size: 10px;">RNC: <strong>${f.rnc || '1-31-99887-2'}</strong> | Tel: <strong>${f.telefono || f.telefono_whatsapp || '(809) 555-0199'}</strong></p>
        <p style="margin: 2px 0; font-size: 10px; color: #333;">${f.direccion || 'Av. Abraham Lincoln #402, Piantini, Santo Domingo'}</p>
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
    
    const bannerSummary = document.getElementById('pos-banner-today-summary');
    if (bannerSummary && diaria && diaria.hoy) {
      bannerSummary.textContent = `Hoy: RD$ ${formatMoneyRD(diaria.hoy.total_rd)} (${diaria.hoy.ventas_count} ventas)`;
    }
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


// =====================================================================
// MÓDULOS NUEVOS: CRÓNICOS, PLANES, SUSTITUCIÓN Y DUPLICIDAD
// =====================================================================

// Estado global para módulos nuevos
sysState.chronicPatients = [];
sysState.chronicFilter = 'TODOS';
sysState.frequentPlans = [];
sysState.posSelectedPatient = null;
sysState.posApplyBonus = true;

// 1. GESTIÓN DE PACIENTES CRÓNICOS & ALERTA 10 DÍAS
async function loadChronicPatients(statusFilter) {
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const farmaciaId = Number(f.id || 1);
  const filter = statusFilter || sysState.chronicFilter || 'TODOS';
  sysState.chronicFilter = filter;

  try {
    let url = `/api/chronic-patients?farmacia_id=${farmaciaId}`;
    if (filter && filter !== 'TODOS') {
      url += `&filter_status=${encodeURIComponent(filter)}`;
    }
    const res = await fetch(url);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al cargar pacientes crónicos');

    sysState.chronicPatients = Array.isArray(data.patients) ? data.patients : (data.patients?.items || []);
    renderChronicPatientsTable();
    updateChronicKPIs();
    if (typeof loadPharmaceuticalCareData === 'function') {
      loadPharmaceuticalCareData(farmaciaId);
    }
  } catch (err) {
    console.error('Error cargando crónicos:', err);
    showToast('No se pudieron cargar los pacientes crónicos: ' + err.message, 'error');
  }
}

function updateChronicKPIs() {
  const pts = Array.isArray(sysState.chronicPatients) ? sysState.chronicPatients : (sysState.chronicPatients?.items || []);
  const total = pts.length;
  const alertas = pts.filter(p => p.estado_alerta === 'ALERTA_10_DIAS').length;
  const vencidos = pts.filter(p => p.estado_alerta === 'VENCIDO').length;
  const vigentes = pts.filter(p => p.estado_alerta === 'VIGENTE').length;

  const elTotal = document.getElementById('chronic-kpi-total');
  const elAlerta = document.getElementById('chronic-kpi-alerta');
  const elVenc = document.getElementById('chronic-kpi-vencidos');
  const elVig = document.getElementById('chronic-kpi-vigentes');

  if (elTotal) elTotal.textContent = total;
  if (elAlerta) elAlerta.textContent = alertas;
  if (elVenc) elVenc.textContent = vencidos;
  if (elVig) elVig.textContent = vigentes;

  // Actualizar badges en navbar
  const badgeAlerts = document.getElementById('badge-sys-chronic-alerts');
  const badgeGrp = document.getElementById('badge-grp-pacientes');
  const badgeMob = document.getElementById('badge-mobile-chronic');

  if (badgeAlerts) {
    if (alertas > 0) {
      badgeAlerts.textContent = alertas;
      badgeAlerts.classList.remove('hidden');
    } else {
      badgeAlerts.classList.add('hidden');
    }
  }
  if (badgeGrp) {
    if (alertas > 0) {
      badgeGrp.textContent = alertas;
      badgeGrp.classList.remove('hidden');
    } else {
      badgeGrp.classList.add('hidden');
    }
  }
  if (badgeMob) {
    if (alertas > 0) {
      badgeMob.textContent = alertas;
      badgeMob.classList.remove('hidden');
    } else {
      badgeMob.classList.add('hidden');
    }
  }
}

function filterChronicByStatus(status) {
  sysState.chronicFilter = status;
  const pills = ['TODOS', 'ALERTA_10_DIAS', 'VENCIDO', 'VIGENTE'];
  pills.forEach(p => {
    const el = document.getElementById(`chronic-filter-${p}`);
    if (el) {
      if (p === status) {
        el.className = 'px-3 py-1.5 rounded-xl text-xs font-extrabold bg-slate-900 text-white shadow-xs';
      } else {
        el.className = 'px-3 py-1.5 rounded-xl text-xs font-extrabold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200';
      }
    }
  });
  renderChronicPatientsTable();
}

function handleChronicSearch(query) {
  const q = (query || '').toLowerCase().trim();
  renderChronicPatientsTable(q);
}

function renderChronicPatientsTable(searchTerm = '') {
  const tbody = document.getElementById('chronic-table-tbody');
  if (!tbody) return;

  let list = Array.isArray(sysState.chronicPatients) ? sysState.chronicPatients : (sysState.chronicPatients?.items || []);

  if (sysState.chronicFilter && sysState.chronicFilter !== 'TODOS') {
    list = list.filter(p => p.estado_alerta === sysState.chronicFilter);
  }

  if (searchTerm) {
    list = list.filter(p => 
      (p.nombre_completo || '').toLowerCase().includes(searchTerm) ||
      (p.cedula_identificacion || '').toLowerCase().includes(searchTerm) ||
      (p.telefono || '').toLowerCase().includes(searchTerm) ||
      (p.medicamento_cronico || '').toLowerCase().includes(searchTerm) ||
      (p.diagnostico || '').toLowerCase().includes(searchTerm)
    );
  }

  if (!list.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-8 text-center text-slate-400">
          No hay pacientes crónicos que coincidan con los filtros actuales.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map(p => {
    let alertBadge = '';
    let rowBg = '';
    const esAlerta5d = (Number(p.dias_restantes) <= 5 && Number(p.dias_restantes) >= 0);
    if (esAlerta5d) {
      alertBadge = `
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-purple-100 text-purple-900 border-2 border-purple-400 animate-bounce shadow-xs">
          <span>⏰</span> <span>¡5 DÍAS RESTANTES (IA)!</span>
        </span>
      `;
      rowBg = 'bg-purple-50/40 border-l-4 border-l-purple-500';
    } else if (p.estado_alerta === 'ALERTA_10_DIAS') {
      alertBadge = `
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
          <span>⚠️</span> <span>Quedan ${p.dias_restantes} días</span>
        </span>
      `;
      rowBg = 'bg-amber-50/20';
    } else if (p.estado_alerta === 'VENCIDO') {
      alertBadge = `
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-100 text-rose-900 border border-rose-300">
          <span>🚨</span> <span>Agotado hace ${Math.abs(p.dias_restantes)}d</span>
        </span>
      `;
      rowBg = 'bg-rose-50/20';
    } else {
      alertBadge = `
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
          <span>✅</span> <span>Vigente (${p.dias_restantes}d)</span>
        </span>
      `;
    }

    return `
      <tr class="hover:bg-slate-50 transition ${rowBg}">
        <td class="py-3 px-3">
          <p class="font-extrabold text-slate-900">${p.nombre_completo}</p>
          <div class="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
            <span>🪪 ${p.cedula_identificacion || 'Sin cédula'}</span>
            <span>•</span>
            <span>📞 ${p.telefono}</span>
          </div>
          ${p.plan_nombre ? `<span class="inline-block mt-0.5 px-2 py-0.2 rounded-full text-[9px] font-bold bg-teal-100 text-teal-800">Plan: ${p.plan_nombre} (${p.plan_descuento}%)</span>` : ''}
        </td>
        <td class="py-3 px-3">
          <span class="px-2 py-0.5 rounded-lg font-bold bg-slate-100 text-slate-700 text-[11px]">
            ${p.diagnostico}
          </span>
        </td>
        <td class="py-3 px-3">
          <p class="font-extrabold text-teal-900">${p.medicamento_cronico}</p>
          <p class="text-[10px] text-slate-500 font-medium">${p.dosis_diaria || '1 dosis diaria'}</p>
        </td>
        <td class="py-3 px-3 text-center">
          <span class="font-mono font-bold text-slate-800">${p.dias_suministro} días</span>
          <p class="text-[10px] text-slate-400">Próx: <b>${p.fecha_proximo_vencimiento_tratamiento || '-'}</b></p>
        </td>
        <td class="py-3 px-3 text-center">
          ${alertBadge}
        </td>
        <td class="py-3 px-3 text-right">
          <div class="inline-flex items-center gap-1.5 flex-wrap justify-end">
            <!-- Botón WhatsApp Directo con Mensaje Dominicano Preformateado -->
            <a 
              href="${p.wa_link || '#'}" 
              target="_blank" 
              class="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] shadow-2xs flex items-center gap-1 transition"
              title="Contactar al paciente por WhatsApp para coordinar reposición de su medicamento"
            >
              <span>💬</span> <span>WhatsApp</span>
            </a>
            ${(Number(p.dias_restantes) <= 5 && Number(p.dias_restantes) >= 0) ? `
            <button
              type="button"
              onclick="sendChronic5dWhatsApp(${p.id})"
              class="px-2.5 py-1 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-[11px] shadow flex items-center gap-1 transition cursor-pointer animate-pulse"
              title="Disparar mensaje de WhatsApp de 5 días con oferta de delivery a domicilio"
            >
              <span>🛵</span> <span>Alertar 5d + Delivery</span>
            </button>` : ''}
            <!-- Botón Llamada -->
            <a 
              href="${p.call_link || `tel:${p.telefono}`}" 
              class="px-2 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] border border-slate-300"
              title="Llamar al paciente"
            >
              📞
            </a>
            <!-- Botón Toma de Presión / Glicemia (Atención Farmacéutica) -->
            <button
              type="button"
              onclick="openPharmaCareModalForPatient(${p.id})"
              class="px-2.5 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] transition shadow-2xs flex items-center gap-1 cursor-pointer"
              title="Registrar Toma de Presión Arterial o Glicemia para este paciente crónico e imprimir comprobante"
            >
              <span>🩺</span> <span>Presión / Glicemia</span>
            </button>
            <!-- Botón Renovar Despacho 30 Días (1 Clic) -->
            <button 
              type="button" 
              onclick="renewChronicPatient(${p.id})" 
              class="px-2.5 py-1 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 font-extrabold text-[11px] transition shadow-2xs flex items-center gap-1"
              title="Renovar tratamiento por 30 días adicionales tras despacho en mostrador"
            >
              <span>🔄</span> <span>Renovar 30d</span>
            </button>
            <!-- Editar y Eliminar -->
            <button 
              type="button" 
              onclick="editChronicPatient(${p.id})" 
              class="p-1 rounded-lg hover:bg-slate-200 text-slate-600 font-bold text-xs"
              title="Editar"
            >
              ✏️
            </button>
            <button 
              type="button" 
              onclick="deleteChronicPatient(${p.id})" 
              class="p-1 rounded-lg hover:bg-rose-100 text-rose-600 font-bold text-xs"
              title="Dar de baja"
            >
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function renewChronicPatient(patientId) {
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const farmaciaId = Number(f.id || 1);

  if (!confirm('¿Confirma que se le despachó la medicación de este mes y desea renovar el tratamiento por 30 días adicionales?')) {
    return;
  }

  try {
    const res = await fetch('/api/chronic-patients/renew', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: farmaciaId,
        paciente_id: patientId,
        dias_agregados: 30
      })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al renovar');

    showToast('✅ Despacho renovado exitosamente por 30 días. Próxima alerta programada.', 'success');
    loadChronicPatients();
  } catch (err) {
    showToast('Error al renovar: ' + err.message, 'error');
  }
}

async function deleteChronicPatient(patientId) {
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const farmaciaId = Number(f.id || 1);

  if (!confirm('¿Seguro que desea eliminar el seguimiento crónico de este paciente?')) {
    return;
  }

  try {
    const res = await fetch('/api/chronic-patients/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmacia_id: farmaciaId, paciente_id: patientId })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al eliminar');

    showToast('Paciente removido del seguimiento crónico.', 'info');
    loadChronicPatients();
  } catch (err) {
    showToast('Error al eliminar: ' + err.message, 'error');
  }
}

function openNewChronicPatientModal() {
  document.getElementById('modal-chronic-title').textContent = 'Registrar Paciente Crónico';
  document.getElementById('chronic-form-id').value = '';
  document.getElementById('chronic-form-nombre').value = '';
  document.getElementById('chronic-form-cedula').value = '';
  document.getElementById('chronic-form-telefono').value = '';
  document.getElementById('chronic-form-diagnostico').value = '';
  document.getElementById('chronic-form-medicamento').value = '';
  document.getElementById('chronic-form-dosis').value = '1 tableta al día';
  document.getElementById('chronic-form-dias').value = '30';
  document.getElementById('chronic-form-fecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('chronic-form-notas').value = '';

  // Poblar opciones de planes
  populatePlanSelectInChronicModal();

  const modal = document.getElementById('modal-chronic-patient');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function populatePlanSelectInChronicModal(selectedPlanId = null) {
  const select = document.getElementById('chronic-form-plan');
  if (!select) return;

  const plans = sysState.frequentPlans || [];
  select.innerHTML = '<option value="">Sin plan específico</option>' + plans.map(pl => `
    <option value="${pl.id}" ${selectedPlanId == pl.id ? 'selected' : ''}>
      ${pl.nombre_plan} (${pl.descuento_porcentaje}% Descuento)
    </option>
  `).join('');
}

function editChronicPatient(patientId) {
  const p = sysState.chronicPatients.find(x => x.id === patientId);
  if (!p) return;

  document.getElementById('modal-chronic-title').textContent = 'Editar Paciente Crónico';
  document.getElementById('chronic-form-id').value = p.id;
  document.getElementById('chronic-form-nombre').value = p.nombre_completo || '';
  document.getElementById('chronic-form-cedula').value = p.cedula_identificacion || '';
  document.getElementById('chronic-form-telefono').value = p.telefono || '';
  document.getElementById('chronic-form-diagnostico').value = p.diagnostico || '';
  document.getElementById('chronic-form-medicamento').value = p.medicamento_cronico || '';
  document.getElementById('chronic-form-dosis').value = p.dosis_diaria || '';
  document.getElementById('chronic-form-dias').value = p.dias_suministro || 30;
  document.getElementById('chronic-form-fecha').value = p.fecha_ultima_entrega || new Date().toISOString().split('T')[0];
  document.getElementById('chronic-form-notas').value = p.notas_medicas || '';

  populatePlanSelectInChronicModal(p.plan_frecuente_id);

  const modal = document.getElementById('modal-chronic-patient');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeChronicPatientModal() {
  const modal = document.getElementById('modal-chronic-patient');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

async function handleSaveChronicPatient(e) {
  e.preventDefault();
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const farmaciaId = Number(f.id || 1);

  const id = document.getElementById('chronic-form-id').value;
  const payload = {
    farmacia_id: farmaciaId,
    id: id ? Number(id) : null,
    nombre_completo: document.getElementById('chronic-form-nombre').value.trim(),
    cedula_identificacion: document.getElementById('chronic-form-cedula').value.trim(),
    telefono: document.getElementById('chronic-form-telefono').value.trim(),
    plan_frecuente_id: document.getElementById('chronic-form-plan').value ? Number(document.getElementById('chronic-form-plan').value) : null,
    diagnostico: document.getElementById('chronic-form-diagnostico').value.trim(),
    medicamento_cronico: document.getElementById('chronic-form-medicamento').value.trim(),
    dosis_diaria: document.getElementById('chronic-form-dosis').value.trim(),
    dias_suministro: Number(document.getElementById('chronic-form-dias').value || 30),
    fecha_ultima_entrega: document.getElementById('chronic-form-fecha').value,
    notas_medicas: document.getElementById('chronic-form-notas').value.trim(),
  };

  try {
    const res = await fetch('/api/chronic-patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al guardar');

    showToast('✅ Paciente crónico guardado y monitoreo de 10 días programado.', 'success');
    closeChronicPatientModal();
    loadChronicPatients();
  } catch (err) {
    showToast('Error al guardar paciente crónico: ' + err.message, 'error');
  }
}

// 2. GESTIÓN DE PLANES DE PACIENTES FRECUENTES
async function loadFrequentPlans() {
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const farmaciaId = Number(f.id || 1);

  try {
    const res = await fetch(`/api/frequent-plans?farmacia_id=${farmaciaId}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al cargar planes');

    sysState.frequentPlans = data.plans || [];
    renderFrequentPlansTable();
  } catch (err) {
    console.error('Error cargando planes:', err);
    showToast('No se pudieron cargar los planes de pacientes: ' + err.message, 'error');
  }
}

function renderFrequentPlansTable() {
  const tbody = document.getElementById('plans-table-tbody');
  const badge = document.getElementById('plans-count-badge');
  if (!tbody) return;

  const list = sysState.frequentPlans || [];
  if (badge) badge.textContent = `${list.length} Planes Configurados`;

  if (!list.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-8 text-center text-slate-400">
          No hay planes de pacientes frecuentes registrados.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map(pl => `
    <tr class="hover:bg-slate-50 transition">
      <td class="py-3 px-3">
        <p class="font-extrabold text-slate-900 text-sm">${pl.nombre_plan}</p>
        <p class="text-[10px] text-slate-400">Código: PLAN-${pl.id}</p>
      </td>
      <td class="py-3 px-3">
        <span class="px-2.5 py-1 rounded-full font-black text-xs bg-emerald-100 text-emerald-800 border border-emerald-300">
          ${pl.descuento_porcentaje}% Descuento
        </span>
      </td>
      <td class="py-3 px-3 font-mono font-bold text-indigo-700">
        ${pl.puntos_por_cada_100rd || 1} pts / RD$100
      </td>
      <td class="py-3 px-3 text-slate-600 max-w-xs truncate">
        ${pl.descripcion || 'Sin descripción'}
      </td>
      <td class="py-3 px-3 text-center">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${pl.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}">
          ${pl.activo ? 'ACTIVO' : 'INACTIVO'}
        </span>
      </td>
      <td class="py-3 px-3 text-right">
        <button onclick="editPlan(${pl.id})" class="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs mr-1">
          ✏️ Editar
        </button>
        <button onclick="deletePlan(${pl.id})" class="px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs">
          🗑️
        </button>
      </td>
    </tr>
  `).join('');
}

function openNewPlanModal() {
  document.getElementById('modal-plan-title').textContent = 'Crear Plan de Fidelidad';
  document.getElementById('plan-form-id').value = '';
  document.getElementById('plan-form-nombre').value = '';
  document.getElementById('plan-form-descuento').value = '10';
  document.getElementById('plan-form-puntos').value = '1';
  document.getElementById('plan-form-desc').value = '';

  const modal = document.getElementById('modal-patient-plan');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function editPlan(planId) {
  const pl = sysState.frequentPlans.find(x => x.id === planId);
  if (!pl) return;

  document.getElementById('modal-plan-title').textContent = 'Editar Plan de Fidelidad';
  document.getElementById('plan-form-id').value = pl.id;
  document.getElementById('plan-form-nombre').value = pl.nombre_plan || '';
  document.getElementById('plan-form-descuento').value = pl.descuento_porcentaje || 0;
  document.getElementById('plan-form-puntos').value = pl.puntos_por_cada_100rd || 1;
  document.getElementById('plan-form-desc').value = pl.descripcion || '';

  const modal = document.getElementById('modal-patient-plan');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closePatientPlanModal() {
  const modal = document.getElementById('modal-patient-plan');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

async function handleSavePatientPlan(e) {
  e.preventDefault();
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const farmaciaId = Number(f.id || 1);

  const id = document.getElementById('plan-form-id').value;
  const payload = {
    farmacia_id: farmaciaId,
    id: id ? Number(id) : null,
    nombre_plan: document.getElementById('plan-form-nombre').value.trim(),
    descuento_porcentaje: parseFloat(document.getElementById('plan-form-descuento').value || 0),
    puntos_por_cada_100rd: parseInt(document.getElementById('plan-form-puntos').value || 1),
    descripcion: document.getElementById('plan-form-desc').value.trim(),
    activo: 1
  };

  try {
    const res = await fetch('/api/frequent-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al guardar plan');

    showToast('✅ Plan de fidelidad guardado exitosamente.', 'success');
    closePatientPlanModal();
    loadFrequentPlans();
  } catch (err) {
    showToast('Error al guardar plan: ' + err.message, 'error');
  }
}

async function deletePlan(planId) {
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const farmaciaId = Number(f.id || 1);

  if (!confirm('¿Seguro que desea eliminar este plan de fidelidad?')) return;

  try {
    const res = await fetch('/api/frequent-plans/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmacia_id: farmaciaId, plan_id: planId })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al eliminar');

    showToast('Plan eliminado.', 'info');
    loadFrequentPlans();
  } catch (err) {
    showToast('Error al eliminar: ' + err.message, 'error');
  }
}

// 3. POS CHECKOUT: BUSCADOR DE PACIENTE FRECUENTE & BONIFICACIÓN OPCIONAL
async function handlePosPatientSearch(query) {
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const farmaciaId = Number(f.id || 1);
  const dropdown = document.getElementById('pos-patient-search-results');
  if (!dropdown) return;

  const q = (query || '').trim();
  if (q.length < 2) {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
    return;
  }

  try {
    const res = await fetch(`/api/patient/search-checkout?farmacia_id=${farmaciaId}&q=${encodeURIComponent(q)}`);
    const data = await res.json();
    const results = data.results || [];

    if (!results.length) {
      dropdown.innerHTML = `<div class="p-3 text-slate-400 text-xs">No se encontró ningún paciente con '${q}'.</div>`;
      dropdown.classList.remove('hidden');
      return;
    }

    dropdown.innerHTML = results.map(p => `
      <div 
        onclick='selectPosPatient(${JSON.stringify(p)})' 
        class="p-2.5 hover:bg-teal-50 cursor-pointer flex items-center justify-between transition"
      >
        <div>
          <p class="font-bold text-slate-900">${p.nombre}</p>
          <p class="text-[10px] text-slate-400">Tel: ${p.telefono} • Céd: ${p.cedula || 'N/A'}</p>
        </div>
        <div class="text-right">
          ${p.plan_nombre ? `
            <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-teal-100 text-teal-800">
              ${p.plan_nombre} (${p.plan_descuento_porcentaje}%)
            </span>
          ` : `
            <span class="text-[10px] text-slate-400">Sin plan</span>
          `}
          <p class="text-[9px] font-mono text-purple-700 font-bold">${p.puntos_fidelidad || 0} pts</p>
        </div>
      </div>
    `).join('');
    dropdown.classList.remove('hidden');
  } catch (err) {
    console.error('Error buscando paciente para POS:', err);
  }
}

function selectPosPatient(patient) {
  sysState.posSelectedPatient = patient;
  sysState.posApplyBonus = true;

  // Llenar datos de cliente en formulario POS
  const clientNameInp = document.getElementById('pos-client-name');
  const clientPhoneInp = document.getElementById('pos-client-phone');
  const clientCedulaInp = document.getElementById('pos-client-cedula');
  if (clientNameInp) clientNameInp.value = patient.nombre;
  if (clientPhoneInp) clientPhoneInp.value = patient.telefono;
  if (clientCedulaInp && patient.cedula) {
    clientCedulaInp.value = patient.cedula;
    checkPosPatientAllergies(patient.cedula);
  }

  // Actualizar UI de Fidelización
  const searchInp = document.getElementById('pos-patient-search');
  if (searchInp) searchInp.value = `${patient.nombre} (${patient.telefono})`;

  const dropdown = document.getElementById('pos-patient-search-results');
  if (dropdown) {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
  }

  const btnClear = document.getElementById('pos-btn-clear-patient');
  if (btnClear) btnClear.classList.remove('hidden');

  const badgePlan = document.getElementById('pos-patient-plan-badge');
  const bonusContainer = document.getElementById('pos-plan-bonus-container');
  const bonusPctLabel = document.getElementById('pos-bonus-pct-label');
  const bonusCheck = document.getElementById('pos-apply-bonus-check');

  if (patient.plan_descuento_porcentaje > 0) {
    if (badgePlan) {
      badgePlan.textContent = `${patient.plan_nombre || 'Plan Frecuente'} (${patient.plan_descuento_porcentaje}%)`;
      badgePlan.classList.remove('hidden');
    }
    if (bonusContainer) bonusContainer.classList.remove('hidden');
    if (bonusPctLabel) bonusPctLabel.textContent = `${patient.plan_descuento_porcentaje}%`;
    if (bonusCheck) bonusCheck.checked = true;
  } else {
    if (badgePlan) {
      badgePlan.textContent = `Registrado (${patient.puntos_fidelidad || 0} pts)`;
      badgePlan.classList.remove('hidden');
    }
    if (bonusContainer) bonusContainer.classList.add('hidden');
  }

  renderPosCart();
  showToast(`👤 Paciente '${patient.nombre}' seleccionado en mostrador.`, 'info');
}

function clearSelectedPosPatient() {
  sysState.posSelectedPatient = null;
  sysState.posApplyBonus = true;

  const searchInp = document.getElementById('pos-patient-search');
  if (searchInp) searchInp.value = '';

  const btnClear = document.getElementById('pos-btn-clear-patient');
  if (btnClear) btnClear.classList.add('hidden');

  const badgePlan = document.getElementById('pos-patient-plan-badge');
  if (badgePlan) badgePlan.classList.add('hidden');

  const bonusContainer = document.getElementById('pos-plan-bonus-container');
  if (bonusContainer) bonusContainer.classList.add('hidden');

  const clientNameInp = document.getElementById('pos-client-name');
  const clientPhoneInp = document.getElementById('pos-client-phone');
  if (clientNameInp) clientNameInp.value = 'Cliente de Mostrador';
  if (clientPhoneInp) clientPhoneInp.value = '';

  renderPosCart();
}

function togglePosBonusApplication() {
  const check = document.getElementById('pos-apply-bonus-check');
  sysState.posApplyBonus = check ? check.checked : false;
  renderPosCart();
}

// 4. MODAL DE ALERTA DE DUPLICIDAD CLÍNICA
function checkCartDuplicity(productToAdd) {
  if (!productToAdd || !sysState.posCart || !sysState.posCart.length) return null;

  const paNew = (productToAdd.principio_activo || '').trim().toLowerCase();
  const catNew = (productToAdd.categoria || '').trim().toLowerCase();

  for (const item of sysState.posCart) {
    const existingP = item.product;
    if (existingP.id === productToAdd.id) continue;

    const paExist = (existingP.principio_activo || '').trim().toLowerCase();
    const catExist = (existingP.categoria || '').trim().toLowerCase();

    // 1. Mismo Principio Activo
    if (paNew && paExist && (paNew === paExist || paNew.includes(paExist) || paExist.includes(paNew))) {
      return {
        tipo: 'PRINCIPIO_ACTIVO',
        itemExistente: existingP,
        principio: productToAdd.principio_activo
      };
    }

    // 2. Misma familia terapéutica de alto riesgo de sobredosis (ej. AINEs, Antihipertensivos)
    const familiasAlerta = ['antiinflamatorio', 'aine', 'antihipertensivo', 'hipolipemiante', 'antibiotico'];
    if (catNew && catExist && catNew === catExist && familiasAlerta.some(f => catNew.includes(f))) {
      return {
        tipo: 'FAMILIA_TERAPEUTICA',
        itemExistente: existingP,
        familia: productToAdd.categoria
      };
    }
  }

  return null;
}

function showDuplicityWarningModal(existingProduct, newProduct, presentation) {
  const modal = document.getElementById('modal-duplicity-warning');
  const textEl = document.getElementById('duplicity-explanation-text');
  const currItem = document.getElementById('duplicity-current-item');
  const currPa = document.getElementById('duplicity-current-pa');
  const newItem = document.getElementById('duplicity-new-item');
  const newPa = document.getElementById('duplicity-new-pa');
  const confirmBtn = document.getElementById('duplicity-confirm-btn');

  if (currItem) currItem.textContent = existingProduct.nombre_comercial;
  if (currPa) currPa.textContent = `Principio: ${existingProduct.principio_activo || 'N/A'}`;
  if (newItem) newItem.textContent = newProduct.nombre_comercial;
  if (newPa) newPa.textContent = `Principio: ${newProduct.principio_activo || 'N/A'}`;

  if (textEl) {
    textEl.innerHTML = `
      El ticket ya incluye <b>${existingProduct.nombre_comercial}</b> y está agregando <b>${newProduct.nombre_comercial}</b> con el mismo principio activo (<i>${newProduct.principio_activo || existingProduct.principio_activo}</i>).
      <br><br>
      <b>Riesgo:</b> Posible duplicidad farmacológica o sobremedicación del paciente.
    `;
  }

  if (confirmBtn) {
    confirmBtn.onclick = () => {
      closeDuplicityModal();
      addPosItemDirect(newProduct.id, presentation, true);
    };
  }

  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeDuplicityModal() {
  const modal = document.getElementById('modal-duplicity-warning');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

// 5. MODAL DE SUSTITUCIÓN INTELIGENTE Y BIOEQUIVALENTES
async function openSubstituteModal(productId, productName, activeIngredient) {
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const farmaciaId = Number(f.id || 1);

  const modal = document.getElementById('modal-substitutes');
  const origName = document.getElementById('sub-orig-name');
  const origPa = document.getElementById('sub-orig-pa');
  const origPrice = document.getElementById('sub-orig-price');
  const listContainer = document.getElementById('substitutes-list-container');
  const countBadge = document.getElementById('sub-count-badge');

  const p = sysState.products.find(x => x.id === productId);
  if (origName) origName.textContent = productName || (p ? p.nombre_comercial : 'Medicamento');
  if (origPa) origPa.textContent = `Principio Activo: ${activeIngredient || (p ? p.principio_activo : 'No especificado')}`;
  if (origPrice && p) origPrice.textContent = formatRD(p.precio_base);

  if (listContainer) {
    listContainer.innerHTML = '<p class="text-center py-6 text-slate-400">Buscando bioequivalentes con stock...</p>';
  }

  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  try {
    const res = await fetch(`/api/products/substitutes?farmacia_id=${farmaciaId}&producto_id=${productId}&q=${encodeURIComponent(activeIngredient || '')}`);
    const data = await res.json();
    const subs = data.substitutes || [];

    if (countBadge) countBadge.textContent = `${subs.length} encontrados`;

    if (!subs.length) {
      if (listContainer) {
        listContainer.innerHTML = `
          <div class="p-6 text-center text-slate-500 bg-slate-50 rounded-2xl border border-slate-200">
            <p class="text-base">🔍</p>
            <p class="font-bold text-xs mt-1">No se encontraron alternativas en inventario actual.</p>
            <p class="text-[11px] text-slate-400 mt-0.5">Actualmente no hay otros medicamentos con el principio activo '${activeIngredient || 'este medicamento'}'.</p>
          </div>
        `;
      }
      return;
    }

    if (listContainer) {
      listContainer.innerHTML = subs.map(s => {
        let ahorroHtml = '';
        if (s.es_mas_barato) {
          ahorroHtml = `
            <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
              🎉 Ahorro de ${formatRD(s.ahorro_rd)} (${s.porcentaje_ahorro}%)
            </span>
          `;
        } else if (s.precio_rd === (p ? p.precio_base : s.precio_rd)) {
          ahorroHtml = `<span class="text-[10px] text-slate-500 font-bold">Mismo precio</span>`;
        } else {
          ahorroHtml = `<span class="text-[10px] text-slate-400">Opción premium</span>`;
        }

        return `
          <div class="p-3 bg-white rounded-2xl border border-slate-200 hover:border-teal-400 transition flex items-center justify-between gap-3 shadow-2xs">
            <div class="space-y-0.5">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="font-extrabold text-slate-900">${s.nombre_comercial}</span>
                <span class="text-[10px] px-1.5 py-0.2 rounded font-bold ${s.es_generico ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-700'}">
                  ${s.es_generico ? 'Genérico Bioequivalente' : 'Marca Alternativa'}
                </span>
                ${ahorroHtml}
              </div>
              <p class="text-[10px] text-slate-500">
                Principio: <span class="font-bold text-teal-700">${s.principio_activo}</span> • Concentración: ${s.concentracion || 'Estándar'}
              </p>
              <p class="text-[10px] font-mono font-bold ${s.stock_unidades > 0 ? 'text-emerald-700' : 'text-rose-600'}">
                Stock: ${s.stock_unidades} unidades disponibles
              </p>
            </div>
            <div class="text-right flex flex-col items-end gap-1.5 flex-shrink-0">
              <span class="font-mono font-black text-slate-900 text-sm">${formatRD(s.precio_rd)}</span>
              <div class="flex items-center gap-1">
                <button 
                  type="button" 
                  onclick="applyCartSubstitution(${productId}, ${s.id})" 
                  class="px-2.5 py-1 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-[11px] shadow-2xs transition"
                  title="Reemplazar el medicamento actual en el carrito por este sustituto"
                >
                  🔄 Sustituir
                </button>
                <button 
                  type="button" 
                  onclick="addPosItemDirect(${s.id}, 'UNIDAD')" 
                  class="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] border border-slate-300"
                  title="Añadir también este producto al carrito"
                >
                  ➕ Agregar
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

  } catch (err) {
    if (listContainer) {
      listContainer.innerHTML = `<p class="text-rose-600 text-center py-4">Error al buscar alternativas: ${err.message}</p>`;
    }
  }
}

function applyCartSubstitution(oldProductId, newProductId) {
  // Buscar si el producto anterior estaba en el carrito
  const oldIndex = sysState.posCart.findIndex(i => i.product.id === oldProductId);
  let pres = 'UNIDAD';
  let qty = 1;

  if (oldIndex !== -1) {
    pres = sysState.posCart[oldIndex].presentacion;
    qty = sysState.posCart[oldIndex].cantidad;
    sysState.posCart.splice(oldIndex, 1);
  }

  // Agregar el nuevo producto
  const newProduct = sysState.products.find(p => p.id === newProductId);
  if (newProduct) {
    sysState.posCart.push({
      product: newProduct,
      presentacion: pres,
      cantidad: qty
    });
    showToast(`🔄 Sustitución aplicada: Ahora despachando '${newProduct.nombre_comercial}'.`, 'success');
  }

  closeSubstitutesModal();
  renderPosCart();
}

function closeSubstitutesModal() {
  const modal = document.getElementById('modal-substitutes');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

// 6. HELPER PARA FILTRAR MEDICAMENTOS SIN SALIDA (≤ 50 unidades/mes)
function filterSlowMovingProducts() {
  switchSysTab('inventario');
  closeAllSysDropdowns();
  setInventoryFilterPill('SIN_SALIDA');
  showToast('Mostrando productos de baja rotación / sin salida real (≤ 50 unidades/mes). Los medicamentos de uso crónico mensual están protegidos y excluidos de esta alerta.', 'info');
}

function filterChronicMonthlyProducts() {
  switchSysTab('inventario');
  closeAllSysDropdowns();
  setInventoryFilterPill('CRONICOS');
  showToast('Mostrando medicamentos de uso crónico con demanda mensual programada por pacientes.', 'info');
}

window.filterSlowMovingProducts = filterSlowMovingProducts;
window.filterChronicMonthlyProducts = filterChronicMonthlyProducts;

function closePosTicketModal() {
  const m = document.getElementById('pos-ticket-modal');
  if (m) {
    m.classList.add('hidden');
    m.classList.remove('flex');
  }
}


/* =========================================================================
   SISTEMA POS: KITS ALIVIO EN 1 CLIC — OFERTAS SEMANALES Y DESPACHO FÍSICO
   ========================================================================= */
function escapeJsQuotes(str) {
  return String(str || '').replace(/'/g, "\'").replace(/"/g, '&quot;');
}

let activePosKitModalData = null;
let kitBuilderItemsState = [];

async function loadPromotionalKits(fid) {
  try {
    const id = fid || (sysState.authenticatedPharmacy ? sysState.authenticatedPharmacy.id : 1);
    const res = await fetch(`/api/promotional-kits?farmacia_id=${id}`);
    const data = await res.json();
    if (data.ok) {
      sysState.promotionalKits = data.kits || [];
      renderPosQuickKits();
      renderKitsManagementView();
    }
  } catch (err) {
    console.error('Error al cargar kits en FarmaSys POS:', err);
  }
}

function renderPosQuickKits() {
  const container = document.getElementById('pos-quick-kits-container');
  if (!container) return;

  const kits = sysState.promotionalKits || [];
  if (!kits.length) {
    container.innerHTML = `<span class="text-[11px] text-slate-400 italic">No hay kits armados aún.</span>`;
    return;
  }

  container.innerHTML = kits.map(k => {
    const isAvail = k.disponible !== false && (k.kits_disponibles == null || k.kits_disponibles > 0);
    const hasOffer = Number(k.ahorro_monto || 0) > 0;
    return `
      <button
        type="button"
        onclick="openPosKitDetailModal('${k.id}')"
        class="px-2.5 py-1.5 rounded-xl border text-xs font-black transition flex items-center gap-1.5 shadow-2xs cursor-pointer ${
          isAvail
            ? 'bg-white hover:bg-amber-50 border-amber-300 text-slate-900 hover:border-amber-400'
            : 'bg-slate-100 border-slate-300 text-slate-400 opacity-60'
        }"
        title="Ver medicamentos existentes que componen el kit, su precio por unidad solicitada y definir oferta del vendedor"
      >
        <span>${k.icono || '⚡'}</span>
        <span>${k.nombre_kit}</span>
        <span class="px-1.5 py-0.2 rounded-full font-black text-[10px] ${hasOffer ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-slate-950'}">${formatRD(k.precio_oferta_kit)}</span>
      </button>
    `;
  }).join('');
}

function openPosKitDetailModal(kitId) {
  const kit = (sysState.promotionalKits || []).find(k => String(k.id) === String(kitId) || k.codigo_kit === kitId);
  if (!kit) {
    showToast('Kit no encontrado', 'error');
    return;
  }
  activePosKitModalData = { ...kit, sellerCustomPrice: Number(kit.precio_oferta_kit || kit.precio_regular_total || 0) };

  document.getElementById('modal-pos-kit-title').textContent = kit.nombre_kit;
  document.getElementById('modal-pos-kit-icon').textContent = kit.icono || '⚡';
  document.getElementById('modal-pos-kit-tag').textContent = (kit.ahorro_monto > 0) ? 'OFERTA DEL VENDEDOR ⚡' : 'PRECIO POR UNIDAD SOLICITADA ⚡';
  document.getElementById('modal-pos-kit-desc').textContent = kit.descripcion || kit.lema || '';

  const availEl = document.getElementById('modal-pos-kit-avail');
  const isAvail = kit.disponible !== false && (kit.kits_disponibles == null || kit.kits_disponibles > 0);
  if (isAvail) {
    availEl.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white';
    availEl.textContent = `Disponible (${kit.kits_disponibles} kits armables)`;
  } else {
    availEl.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white';
    availEl.textContent = 'Sin Stock Completo';
  }

  const tbody = document.getElementById('modal-pos-kit-table-body');
  if (tbody) {
    tbody.innerHTML = (kit.items || []).map(comp => {
      const pProd = (sysState.products || []).find(p => p.id === comp.producto_id || p.codigo_barras === comp.codigo_barras);
      const stockDisp = pProd ? (pProd.inventario ? pProd.inventario.stock_total_unidades : pProd.stock_total_unidades) : (comp.stock_actual_unidades != null ? comp.stock_actual_unidades : '-');
      const subtotalComp = comp.precio_unitario * comp.cantidad;
      const unitLabel = comp.unidad_minima_nombre || comp.presentacion || 'UNIDAD';

      return `
        <tr class="hover:bg-amber-50/30">
          <td class="py-2 px-3">
            <div class="flex items-center gap-1.5 font-bold text-slate-900">
              <span>${comp.icono || '💊'}</span>
              <span>${comp.nombre_comercial}</span>
            </div>
            <p class="text-[10px] text-slate-500 font-mono">${comp.principio_activo || ''}</p>
          </td>
          <td class="py-2 px-2 text-center font-bold text-slate-700">
            ${unitLabel}
          </td>
          <td class="py-2 px-2 text-center font-black text-slate-900">
            ${comp.cantidad}
          </td>
          <td class="py-2 px-2 text-center font-mono font-bold ${Number(stockDisp) > 10 ? 'text-teal-700' : 'text-rose-600'}">
            ${stockDisp} unid.
          </td>
          <td class="py-2 px-3 text-right font-mono text-slate-600">
            RD$ ${Number(comp.precio_unitario).toFixed(2)}
          </td>
          <td class="py-2 px-3 text-right font-mono font-black text-slate-900">
            RD$ ${Number(subtotalComp).toFixed(2)}
          </td>
        </tr>
      `;
    }).join('');
  }

  document.getElementById('modal-pos-kit-reg-price').textContent = formatRD(kit.precio_regular_total);
  const sellerInp = document.getElementById('modal-pos-kit-seller-price-input');
  if (sellerInp) {
    sellerInp.value = Number(kit.precio_oferta_kit || kit.precio_regular_total).toFixed(2);
  }
  handlePosKitSellerPriceChange(kit.precio_oferta_kit || kit.precio_regular_total);

  const btnAdd = document.getElementById('btn-modal-add-kit-to-pos');
  if (btnAdd) {
    btnAdd.disabled = !isAvail;
    if (!isAvail) {
      btnAdd.className = 'px-5 py-2.5 rounded-xl bg-slate-200 text-slate-400 font-bold text-xs cursor-not-allowed';
    } else {
      btnAdd.className = 'px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs shadow-lg transition flex items-center gap-2 cursor-pointer transform active:scale-95';
    }
  }

  const modal = document.getElementById('modal-pos-kit-detail');
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
}

function handlePosKitSellerPriceChange(val) {
  if (!activePosKitModalData) return;
  const reg = Number(activePosKitModalData.precio_regular_total || 0);
  let finalPrice = parseFloat(val);
  if (isNaN(finalPrice) || finalPrice <= 0) {
    finalPrice = reg;
  }
  activePosKitModalData.sellerCustomPrice = finalPrice;

  const offerEl = document.getElementById('modal-pos-kit-offer-price');
  const savEl = document.getElementById('modal-pos-kit-savings');
  if (offerEl) offerEl.textContent = formatRD(finalPrice);

  if (savEl) {
    const diff = Math.max(0, reg - finalPrice);
    if (diff > 0.01) {
      const pct = reg > 0 ? ((diff / reg) * 100).toFixed(1) : '0.0';
      savEl.className = 'px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-black';
      savEl.textContent = `¡Oferta aplicada por vendedor: -${formatRD(diff)} (-${pct}%)!`;
    } else {
      savEl.className = 'px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 font-bold';
      savEl.textContent = 'Precio exacto por unidad de lo solicitado (Sin descuento)';
    }
  }
}

function applyPosKitSellerQuickDiscount(pct) {
  if (!activePosKitModalData) return;
  const reg = Number(activePosKitModalData.precio_regular_total || 0);
  const newPrice = Number((reg * (1 - Number(pct) / 100)).toFixed(2));
  const sellerInp = document.getElementById('modal-pos-kit-seller-price-input');
  if (sellerInp) sellerInp.value = newPrice.toFixed(2);
  handlePosKitSellerPriceChange(newPrice);
}

function closePosKitDetailModal() {
  const modal = document.getElementById('modal-pos-kit-detail');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
  activePosKitModalData = null;
}

function executeAddKitFromModal() {
  if (!activePosKitModalData) return;
  const sellerInp = document.getElementById('modal-pos-kit-seller-price-input');
  const customPrice = sellerInp ? parseFloat(sellerInp.value) : activePosKitModalData.sellerCustomPrice;
  addKitToPosCart(activePosKitModalData.id, customPrice);
  closePosKitDetailModal();
}

function addKitToPosCart(kitId, sellerPriceOverride = null) {
  const kit = (sysState.promotionalKits || []).find(k => String(k.id) === String(kitId) || k.codigo_kit === kitId);
  if (!kit) {
    showToast('Kit no encontrado', 'error');
    return;
  }

  const chosenPrice = (sellerPriceOverride != null && !isNaN(sellerPriceOverride) && Number(sellerPriceOverride) > 0)
    ? Number(sellerPriceOverride)
    : Number(kit.precio_oferta_kit || kit.precio_regular_total);
  const ahorro = Math.max(0, Number(kit.precio_regular_total) - chosenPrice);

  const existing = sysState.posCart.find(i => i.is_kit && (String(i.kit_id) === String(kit.id) || i.codigo_kit === kit.codigo_kit));
  if (existing) {
    existing.cantidad += 1;
    existing.unit_price = chosenPrice;
    existing.ahorro_monto = ahorro;
  } else {
    sysState.posCart.push({
      is_kit: true,
      es_kit: true,
      kit_id: kit.id,
      codigo_kit: kit.codigo_kit,
      nombre_comercial: kit.nombre_kit,
      product: {
        id: 0,
        nombre_comercial: `[KIT] ${kit.nombre_kit}`,
        principio_activo: 'Kit por Unidad Solicitada',
        precio_base: chosenPrice,
        precios_presentacion: { KIT: chosenPrice },
        unidad_minima_nombre: 'Kit',
        inventario: { stock_total_unidades: kit.kits_disponibles || 50 }
      },
      presentacion: 'KIT',
      cantidad: 1,
      unit_price: chosenPrice,
      subtotal: chosenPrice,
      items: kit.items,
      precio_regular_total: kit.precio_regular_total,
      ahorro_monto: ahorro
    });
  }

  renderPosCart();
  showToast(`⚡ ${kit.nombre_kit} cargado al mostrador (${formatRD(chosenPrice)})`);
}

function renderKitsManagementView() {
  const container = document.getElementById('kits-management-grid');
  if (!container) return;

  const kits = sysState.promotionalKits || [];
  if (!kits.length) {
    container.innerHTML = `<div class="col-span-full p-8 text-center text-slate-500 bg-white rounded-3xl border border-slate-200">No hay kits registrados en el sistema.</div>`;
    return;
  }

  container.innerHTML = kits.map(kit => {
    const isAvail = kit.disponible !== false && (kit.kits_disponibles == null || kit.kits_disponibles > 0);
    const hasOffer = Number(kit.ahorro_monto || 0) > 0;
    const compsList = (kit.items || []).map(c => `
      <div class="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-xl bg-slate-50 border border-slate-200">
        <div class="flex items-center gap-2">
          <span>${c.icono || '💊'}</span>
          <span class="font-bold text-slate-800">${c.cantidad}x ${c.unidad_minima_nombre || c.presentacion} <strong>${c.nombre_comercial}</strong></span>
        </div>
        <div class="text-right">
          <span class="text-slate-700 font-mono font-bold">RD$ ${Number(c.precio_unitario * c.cantidad).toFixed(2)}</span>
          <span class="text-[10px] text-teal-700 block font-semibold">Stock: ${c.stock_actual_unidades != null ? c.stock_actual_unidades : '-'}u</span>
        </div>
      </div>
    `).join('');

    return `
      <div class="bg-white rounded-3xl p-5 border-2 ${isAvail ? 'border-amber-300' : 'border-slate-200'} shadow-sm space-y-4">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <span class="text-3xl">${kit.icono || '⚡'}</span>
            <div>
              <div class="flex items-center gap-1.5">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500 text-slate-950">${hasOffer ? 'OFERTA DEL VENDEDOR ⚡' : 'PRECIO POR UNIDAD ⚡'}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isAvail ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
                  ${isAvail ? `● ${kit.kits_disponibles} kits armables` : '● Stock insuficiente'}
                </span>
              </div>
              <h3 class="text-base font-black text-slate-900 mt-1">${kit.nombre_kit}</h3>
            </div>
          </div>
          <div class="text-right">
            <span class="text-[10px] font-extrabold uppercase text-slate-400 block">Precio por Unidad: ${formatRD(kit.precio_regular_total)}</span>
            <span class="text-xl font-black text-teal-700">${formatRD(kit.precio_oferta_kit)}</span>
            <span class="text-[10px] ${hasOffer ? 'text-emerald-700 font-bold' : 'text-slate-400'} block">
              ${hasOffer ? `Oferta activa (-${formatRD(kit.ahorro_monto)})` : 'Sin oferta (Precio exacto)'}
            </span>
          </div>
        </div>

        <p class="text-xs text-slate-600 leading-relaxed font-medium">${kit.descripcion}</p>

        <div class="space-y-1.5 p-3 rounded-2xl bg-amber-50/50 border border-amber-200">
          <p class="text-[11px] font-black uppercase text-amber-900 mb-1">📦 Medicamentos existentes que componen el kit (Por Unidad):</p>
          ${compsList}
        </div>

        <!-- Control rápido para que el vendedor defina la oferta a su decisión -->
        <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <span class="text-[10px] font-black uppercase text-slate-700 block">🏷️ Oferta a decisión del vendedor:</span>
            <span class="text-[10px] text-slate-500">Precio base por unidad: <b>${formatRD(kit.precio_regular_total)}</b></span>
          </div>
          <div class="flex items-center gap-1.5">
            <input
              id="admin-kit-offer-inp-${kit.id}"
              type="number"
              step="0.01"
              value="${Number(kit.precio_oferta_kit).toFixed(2)}"
              class="w-24 px-2 py-1 rounded-lg border border-slate-300 bg-white font-mono font-bold text-xs text-right"
            />
            <button
              type="button"
              onclick="saveSellerQuickKitOffer(${kit.id})"
              class="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] cursor-pointer"
            >
              Guardar Precio
            </button>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onclick="openKitBuilderModal(${kit.id})"
            class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs cursor-pointer"
          >
            ✏️ Editar Medicamentos del Kit
          </button>
          <button
            type="button"
            onclick="openPosKitDetailModal('${kit.id}'); switchSysTab('pos');"
            ${!isAvail ? 'disabled' : ''}
            class="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-extrabold text-xs transition shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <span>➕</span> <span>Despachar en POS</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function saveSellerQuickKitOffer(kitId) {
  const kit = (sysState.promotionalKits || []).find(k => Number(k.id) === Number(kitId));
  if (!kit) return;
  const inp = document.getElementById(`admin-kit-offer-inp-${kitId}`);
  const val = inp ? parseFloat(inp.value) : kit.precio_regular_total;
  const f = sysState.authenticatedPharmacy || { id: 1 };

  try {
    const res = await fetch('/api/promotional-kits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: Number(f.id || 1),
        id: kit.id,
        codigo_kit: kit.codigo_kit,
        nombre_kit: kit.nombre_kit,
        lema: kit.lema,
        descripcion: kit.descripcion,
        categoria: kit.categoria,
        icono: kit.icono,
        precio_regular_total: kit.precio_regular_total,
        precio_oferta_kit: val,
        oferta_vendedor_activa: val < kit.precio_regular_total ? 1 : 0,
        items: kit.items
      })
    });
    const data = await res.json();
    if (data.ok) {
      showToast('✅ Precio / Oferta del vendedor actualizada en el Kit.');
      await loadPromotionalKits(f.id);
    }
  } catch (e) {
    showToast('Error al actualizar oferta del kit', 'error');
  }
}

/* =========================================================================
   CONSTRUCTOR DE KITS CON MEDICAMENTOS EXISTENTES EN INVENTARIO
   ========================================================================= */

function openKitBuilderModal(editKitId = null) {
  const select = document.getElementById('kit-builder-prod-select');
  if (select) {
    const prods = sysState.products || [];
    select.innerHTML = prods.map(p => `
      <option value="${p.id}">
        ${p.nombre_comercial} — RD$ ${Number(p.precio_base).toFixed(2)} / ${p.unidad_minima_nombre || 'Unidad'} (Stock: ${p.inventario?.stock_total_unidades || 0}u)
      </option>
    `).join('');
  }

  if (editKitId) {
    const kit = (sysState.promotionalKits || []).find(k => Number(k.id) === Number(editKitId));
    if (kit) {
      document.getElementById('kit-builder-id').value = kit.id;
      document.getElementById('kit-builder-name').value = kit.nombre_kit;
      document.getElementById('kit-builder-icon').value = kit.icono || '⚡';
      document.getElementById('kit-builder-cat').value = kit.categoria || 'Alivio en 1 Clic';
      document.getElementById('kit-builder-desc').value = kit.descripcion || kit.lema || '';
      kitBuilderItemsState = (kit.items || []).map(it => ({
        producto_id: it.producto_id,
        codigo_barras: it.codigo_barras,
        nombre_comercial: it.nombre_comercial,
        presentacion: 'UNIDAD',
        cantidad: Number(it.cantidad || 1),
        precio_unitario: Number(it.precio_unitario || 0),
        icono: it.icono || '💊'
      }));
      const offerInp = document.getElementById('kit-builder-seller-offer');
      if (offerInp) {
        offerInp.value = (kit.ahorro_monto > 0) ? Number(kit.precio_oferta_kit).toFixed(2) : '';
      }
    }
  } else {
    document.getElementById('kit-builder-id').value = '';
    document.getElementById('kit-builder-name').value = '';
    document.getElementById('kit-builder-icon').value = '🤧';
    document.getElementById('kit-builder-cat').value = 'Alivio en 1 Clic';
    document.getElementById('kit-builder-desc').value = '';
    document.getElementById('kit-builder-seller-offer').value = '';
    kitBuilderItemsState = [];
  }

  renderKitBuilderItems();
  showModal('modal-kit-builder');
}

function closeKitBuilderModal() {
  hideModal('modal-kit-builder');
}

function addProductToKitBuilder() {
  const select = document.getElementById('kit-builder-prod-select');
  const qtyInp = document.getElementById('kit-builder-prod-qty');
  if (!select || !select.value) return;
  const pid = Number(select.value);
  const qty = Math.max(1, parseInt(qtyInp?.value || '1', 10));
  const prod = (sysState.products || []).find(p => Number(p.id) === pid);
  if (!prod) return;

  const existing = kitBuilderItemsState.find(i => Number(i.producto_id) === pid);
  if (existing) {
    existing.cantidad += qty;
  } else {
    kitBuilderItemsState.push({
      producto_id: prod.id,
      codigo_barras: prod.codigo_barras || '',
      nombre_comercial: prod.nombre_comercial,
      presentacion: 'UNIDAD',
      cantidad: qty,
      precio_unitario: Number(prod.precio_base || 0),
      icono: '💊'
    });
  }
  renderKitBuilderItems();
}

function removeProductFromKitBuilder(idx) {
  kitBuilderItemsState.splice(idx, 1);
  renderKitBuilderItems();
}

function renderKitBuilderItems() {
  const tbody = document.getElementById('kit-builder-items-tbody');
  const sumEl = document.getElementById('kit-builder-unit-sum-display');
  if (!tbody) return;

  if (!kitBuilderItemsState.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-400">Seleccione medicamentos existentes arriba para armar el kit.</td></tr>`;
    if (sumEl) sumEl.textContent = 'RD$ 0.00';
    return;
  }

  let totalSum = 0;
  tbody.innerHTML = kitBuilderItemsState.map((it, idx) => {
    const sub = it.precio_unitario * it.cantidad;
    totalSum += sub;
    return `
      <tr>
        <td class="py-2 px-3 font-bold text-slate-900">${it.nombre_comercial}</td>
        <td class="py-2 px-2 text-center font-mono font-black">${it.cantidad} unid.</td>
        <td class="py-2 px-3 text-right font-mono">RD$ ${Number(it.precio_unitario).toFixed(2)}</td>
        <td class="py-2 px-3 text-right font-mono font-bold text-teal-800">RD$ ${Number(sub).toFixed(2)}</td>
        <td class="py-2 px-2 text-center">
          <button type="button" onclick="removeProductFromKitBuilder(${idx})" class="text-rose-600 font-black cursor-pointer">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  if (sumEl) sumEl.textContent = formatRD(totalSum);
}

async function submitKitBuilderForm(e) {
  e.preventDefault();
  if (!kitBuilderItemsState.length) {
    showToast('Añada al menos un medicamento existente al kit.', 'error');
    return;
  }
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const kitId = document.getElementById('kit-builder-id').value;
  const nombre = document.getElementById('kit-builder-name').value.trim();
  const icono = document.getElementById('kit-builder-icon').value.trim() || '⚡';
  const cat = document.getElementById('kit-builder-cat').value.trim() || 'Alivio en 1 Clic';
  const desc = document.getElementById('kit-builder-desc').value.trim() || kitBuilderItemsState.map(i => `${i.cantidad}x ${i.nombre_comercial}`).join(' + ');
  const sellerOfferRaw = document.getElementById('kit-builder-seller-offer').value.trim();

  const unitSum = kitBuilderItemsState.reduce((acc, i) => acc + (i.precio_unitario * i.cantidad), 0);
  const sellerOfferVal = sellerOfferRaw ? parseFloat(sellerOfferRaw) : unitSum;

  try {
    const res = await fetch('/api/promotional-kits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: Number(f.id || 1),
        id: kitId ? Number(kitId) : null,
        nombre_kit: nombre,
        lema: desc,
        descripcion: desc,
        categoria: cat,
        icono: icono,
        precio_regular_total: unitSum,
        precio_oferta_kit: sellerOfferVal,
        oferta_vendedor_activa: (sellerOfferRaw && sellerOfferVal < unitSum) ? 1 : 0,
        items: kitBuilderItemsState
      })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(`✅ Kit "${nombre}" guardado con precio por unidad (${formatRD(unitSum)}).`);
      closeKitBuilderModal();
      await loadPromotionalKits(f.id);
    } else {
      showToast(data.error || 'No se pudo guardar el kit', 'error');
    }
  } catch (err) {
    showToast('Error al guardar el kit', 'error');
  }
}

/* =========================================================================
   ATENCIÓN FARMACÉUTICA: TOMA DE PRESIÓN ARTERIAL Y GLICEMIA
   (REGISTRO A PACIENTES CRÓNICOS, PRECIO CONFIGURABLE E IMPRESIÓN CON FECHA Y HORA)
   ========================================================================= */

sysState.pharmaCareTariffs = [];
sysState.pharmaCareRecords = [];
sysState.lastPrintedPharmaCareRecord = null;

async function loadPharmaceuticalCareData(fid) {
  try {
    const id = fid || (sysState.authenticatedPharmacy ? sysState.authenticatedPharmacy.id : 1);
    const res = await fetch(`/api/pharmaceutical-care?farmacia_id=${id}`);
    const data = await res.json();
    if (data.ok) {
      sysState.pharmaCareTariffs = data.tariffs || [];
      sysState.pharmaCareRecords = data.records || [];
      renderPharmaCareTariffsCards();
      renderPharmaCareRecordsTable();
    }
  } catch (err) {
    console.error('Error cargando Atención Farmacéutica:', err);
  }
}

function renderPharmaCareTariffsCards() {
  const container = document.getElementById('pharma-care-tariffs-cards');
  if (!container) return;
  const tariffs = sysState.pharmaCareTariffs || [];
  if (!tariffs.length) return;

  container.innerHTML = tariffs.map(t => `
    <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2.5">
        <span class="text-2xl">${t.icono || '🩺'}</span>
        <div>
          <h4 class="text-xs font-extrabold text-slate-900 leading-tight">${t.nombre_servicio}</h4>
          <span class="text-[10px] text-slate-500">Servicio secundario configurable</span>
        </div>
      </div>
      <div class="text-right shrink-0">
        <span class="text-sm font-black font-mono text-rose-700">${formatRD(t.precio_rd)}</span>
        <button type="button" onclick="openPharmaCareModal(null, '${t.codigo_servicio}')" class="block mt-0.5 text-[10px] font-extrabold text-teal-700 hover:underline cursor-pointer">
          + Registrar Toma
        </button>
      </div>
    </div>
  `).join('');
}

function renderPharmaCareRecordsTable() {
  const tbody = document.getElementById('pharma-care-records-tbody');
  if (!tbody) return;
  const records = sysState.pharmaCareRecords || [];
  if (!records.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-6 text-center text-slate-400">
          No hay registros de Toma de Presión o Glicemia aún. Use el botón "🩺 Toma de Presión / Glicemia" para registrar.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = records.map(r => {
    const hasPA = r.presion_sistolica && r.presion_diastolica;
    const hasGlic = r.glicemia_mg_dl && Number(r.glicemia_mg_dl) > 0;
    let clinicalHtml = '';
    if (hasPA) {
      clinicalHtml += `
        <div class="mb-1">
          <span class="font-mono font-black text-slate-900 text-xs">🩺 PA: ${r.presion_sistolica}/${r.presion_diastolica} mmHg</span>
          ${r.pulso_bpm ? `<span class="text-[10px] text-slate-500 font-mono ml-1">(♥ ${r.pulso_bpm} lpm)</span>` : ''}
          <span class="block text-[10px] font-bold text-rose-800">${r.clasificacion_pa || ''}</span>
        </div>
      `;
    }
    if (hasGlic) {
      clinicalHtml += `
        <div>
          <span class="font-mono font-black text-indigo-900 text-xs">🩸 Glicemia: ${r.glicemia_mg_dl} mg/dL</span>
          <span class="text-[10px] text-slate-500">(${r.condicion_ayuno || 'Ayunas'})</span>
          <span class="block text-[10px] font-bold text-indigo-800">${r.clasificacion_glicemia || ''}</span>
        </div>
      `;
    }

    return `
      <tr class="hover:bg-rose-50/20 transition">
        <td class="py-3 px-3">
          <span class="font-mono font-black text-rose-700 text-xs">#${r.codigo_atencion}</span>
          <div class="text-[11px] font-bold text-slate-800 mt-0.5">📅 ${r.fecha_toma}</div>
          <div class="text-[11px] font-mono font-extrabold text-teal-800">⏰ ${r.hora_toma}</div>
        </td>
        <td class="py-3 px-3">
          <p class="font-extrabold text-slate-900">${r.paciente_nombre}</p>
          <p class="text-[10px] text-slate-500 font-mono">🪪 ${r.paciente_cedula || '-'} • 📞 ${r.paciente_telefono || '-'}</p>
          <span class="inline-block mt-0.5 px-2 py-0.2 rounded bg-slate-100 text-slate-700 font-bold text-[10px]">${r.diagnostico_cronico || 'Crónico'}</span>
        </td>
        <td class="py-3 px-3">
          <span class="font-extrabold text-slate-800">${r.nombre_servicio}</span>
          <span class="block text-[10px] text-slate-400">Atendido: ${r.atendido_por || 'Farmacéutico'}</span>
        </td>
        <td class="py-3 px-3">
          ${clinicalHtml || '<span class="text-slate-400">Control registrado</span>'}
        </td>
        <td class="py-3 px-3 text-center">
          <span class="font-mono font-black text-sm text-slate-900 block">${formatRD(r.precio_cobrado)}</span>
          <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${r.estado_pago === 'PAGADO' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}">
            ${r.estado_pago} • ${r.metodo_pago}
          </span>
        </td>
        <td class="py-3 px-3 text-right">
          <div class="inline-flex items-center gap-1.5 justify-end">
            <button
              type="button"
              onclick="openPharmaCarePrintModal(${r.id})"
              class="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] shadow-xs flex items-center gap-1 cursor-pointer"
              title="Imprimir reporte con fecha y hora de toma para entregar al paciente"
            >
              <span>🖨️</span> <span>Imprimir para Paciente</span>
            </button>
            <button
              type="button"
              onclick="deletePharmaCareRecord(${r.id})"
              class="p-1.5 rounded-lg hover:bg-rose-100 text-rose-600 font-bold text-xs cursor-pointer"
              title="Eliminar registro"
            >
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function openPharmaCareModal(patientId = null, defaultServiceCode = 'TOMA_PRESION') {
  if (!sysState.pharmaCareTariffs || !sysState.pharmaCareTariffs.length) {
    await loadPharmaceuticalCareData();
  }
  if (!sysState.chronicPatients || !sysState.chronicPatients.length) {
    try {
      const f = sysState.authenticatedPharmacy || { id: 1 };
      const res = await fetch(`/api/chronic-patients?farmacia_id=${f.id || 1}`);
      const d = await res.json();
      if (d.ok) sysState.chronicPatients = Array.isArray(d.patients) ? d.patients : (d.patients?.items || []);
    } catch (e) {}
  }

  // Llenar selector de pacientes crónicos
  const sel = document.getElementById('pc-select-chronic-patient');
  if (sel) {
    const pts = Array.isArray(sysState.chronicPatients) ? sysState.chronicPatients : (sysState.chronicPatients?.items || []);
    sel.innerHTML = `<option value="">-- Seleccionar Paciente Crónico Registrado --</option>` +
      pts.map(p => `<option value="${p.id}">${p.nombre_completo} (${p.diagnostico || 'Crónico'}) — 🪪 ${p.cedula_identificacion || 'S/C'}</option>`).join('');
  }

  // Fecha y Hora actuales por defecto
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const timeStr = now.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true });

  document.getElementById('pc-date').value = `${yyyy}-${mm}-${dd}`;
  document.getElementById('pc-time').value = timeStr;
  document.getElementById('pc-pa-sys').value = '';
  document.getElementById('pc-pa-dia').value = '';
  document.getElementById('pc-pulso').value = '';
  document.getElementById('pc-glicemia').value = '';
  document.getElementById('pc-peso').value = '';
  if (document.getElementById('pc-talla')) document.getElementById('pc-talla').value = '';
  document.getElementById('pc-spo2').value = '';
  document.getElementById('pc-notes').value = '';

  const f = sysState.authenticatedPharmacy || {};
  document.getElementById('pc-attended-by').value = f.nombre_usuario_actual || f.usuario_actual || 'Farmacéutico de Turno';

  if (patientId) {
    if (sel) sel.value = String(patientId);
    handleSelectChronicPatientForCare(patientId);
  } else {
    if (sel) sel.value = '';
    document.getElementById('pc-patient-name').value = '';
    document.getElementById('pc-patient-cedula').value = '';
    document.getElementById('pc-patient-phone').value = '';
    document.getElementById('pc-patient-diag').value = '';
    document.getElementById('pc-patient-med').value = '';
  }

  const srvSel = document.getElementById('pc-service-type');
  if (srvSel) {
    srvSel.value = defaultServiceCode || 'TOMA_PRESION';
    handlePharmaCareServiceTypeChange(srvSel.value);
  }

  updateLivePharmaCareClassification();
  showModal('modal-pharma-care-register');
}

function openPharmaCareModalForPatient(patientId) {
  openPharmaCareModal(patientId, 'TOMA_PRESION');
}

function closePharmaCareModal() {
  hideModal('modal-pharma-care-register');
}

function handleSelectChronicPatientForCare(patientId) {
  if (!patientId) return;
  const ptsArr = Array.isArray(sysState.chronicPatients) ? sysState.chronicPatients : (sysState.chronicPatients?.items || []); const p = ptsArr.find(x => String(x.id) === String(patientId));
  if (!p) return;
  document.getElementById('pc-patient-name').value = p.nombre_completo || '';
  document.getElementById('pc-patient-cedula').value = p.cedula_identificacion || '';
  document.getElementById('pc-patient-phone').value = p.telefono || '';
  document.getElementById('pc-patient-diag').value = p.diagnostico || '';
  document.getElementById('pc-patient-med').value = p.medicamento_cronico || '';
}

function handlePharmaCareServiceTypeChange(serviceCode) {
  const tariffs = sysState.pharmaCareTariffs || [];
  const found = tariffs.find(t => t.codigo_servicio === serviceCode);
  const priceInp = document.getElementById('pc-service-price');
  if (priceInp) {
    if (found) {
      priceInp.value = Number(found.precio_rd).toFixed(2);
    } else {
      const defaults = { TOMA_PRESION: 50, TOMA_GLICEMIA: 150, COMBO_PRESION_GLICEMIA: 175, ATENCION_FARMACEUTICA: 100 };
      priceInp.value = Number(defaults[serviceCode] || 50).toFixed(2);
    }
  }
}

function updateLivePharmaCareClassification() {
  const sys = parseInt(document.getElementById('pc-pa-sys')?.value || '0', 10);
  const dia = parseInt(document.getElementById('pc-pa-dia')?.value || '0', 10);
  const paBadge = document.getElementById('pc-live-pa-badge');
  if (paBadge) {
    if (sys > 0 && dia > 0) {
      if (sys >= 180 || dia >= 120) {
        paBadge.className = 'text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-600 text-white';
        paBadge.textContent = '🚨 Crisis Hipertensiva';
      } else if (sys >= 140 || dia >= 90) {
        paBadge.className = 'text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300';
        paBadge.textContent = '⚠️ HTA Grado 2';
      } else if (sys >= 130 || dia >= 80) {
        paBadge.className = 'text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300';
        paBadge.textContent = '⚠️ HTA Grado 1';
      } else if (sys >= 120 && dia < 80) {
        paBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200';
        paBadge.textContent = '🟡 Presión Elevada';
      } else if (sys < 90 || dia < 60) {
        paBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-300';
        paBadge.textContent = '🔵 Hipotensión';
      } else {
        paBadge.className = 'text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300';
        paBadge.textContent = '✅ Presión Normal';
      }
    } else {
      paBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-slate-500 border border-slate-200';
      paBadge.textContent = 'Sin medir';
    }
  }

  const glic = parseFloat(document.getElementById('pc-glicemia')?.value || '0');
  const cond = document.getElementById('pc-condicion-ayuno')?.value || 'En Ayunas';
  const glicBadge = document.getElementById('pc-live-glic-badge');
  if (glicBadge) {
    if (glic > 0) {
      const isFasting = cond.toLowerCase().includes('ayun');
      if (glic < 70) {
        glicBadge.className = 'text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-600 text-white';
        glicBadge.textContent = '🚨 Hipoglicemia';
      } else if (isFasting ? glic <= 99 : glic < 140) {
        glicBadge.className = 'text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300';
        glicBadge.textContent = '✅ Glicemia Normal';
      } else if (isFasting ? glic <= 125 : glic <= 199) {
        glicBadge.className = 'text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300';
        glicBadge.textContent = '⚠️ Valor en Alerta';
      } else {
        glicBadge.className = 'text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300';
        glicBadge.textContent = '🚨 Hiperglicemia';
      }
    } else {
      glicBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-slate-500 border border-slate-200';
      glicBadge.textContent = 'Sin medir';
    }
  }
}

async function submitPharmaCareRecord(e, sendToPosCart = false) {
  if (e) e.preventDefault();
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const farmaciaId = Number(f.id || 1);

  const pacId = document.getElementById('pc-select-chronic-patient')?.value || null;
  const nombre = document.getElementById('pc-patient-name')?.value.trim();
  if (!nombre) {
    showToast('Ingrese o seleccione el nombre del paciente.', 'error');
    return;
  }

  const srvSelect = document.getElementById('pc-service-type');
  const codigoServicio = srvSelect ? srvSelect.value : 'TOMA_PRESION';
  const nombreServicio = srvSelect ? srvSelect.options[srvSelect.selectedIndex].text.replace(/^[^\wÁÉÍÓÚáéíóú]+/, '').trim() : 'Toma de Presión / Glicemia';
  const metodoPago = document.getElementById('pc-payment-method')?.value || 'EFECTIVO';
  let precio = parseFloat(document.getElementById('pc-service-price')?.value || '0');
  if (metodoPago === 'CORTESIA') precio = 0;

  const payload = {
    farmacia_id: farmaciaId,
    paciente_cronico_id: pacId ? Number(pacId) : null,
    paciente_nombre: nombre,
    paciente_cedula: document.getElementById('pc-patient-cedula')?.value.trim() || '',
    paciente_telefono: document.getElementById('pc-patient-phone')?.value.trim() || '',
    diagnostico_cronico: document.getElementById('pc-patient-diag')?.value.trim() || 'Control Crónico',
    medicamento_habitual: document.getElementById('pc-patient-med')?.value.trim() || '',
    codigo_servicio: codigoServicio,
    nombre_servicio: nombreServicio,
    fecha_toma: document.getElementById('pc-date')?.value || '',
    hora_toma: document.getElementById('pc-time')?.value || '',
    presion_sistolica: document.getElementById('pc-pa-sys')?.value || null,
    presion_diastolica: document.getElementById('pc-pa-dia')?.value || null,
    pulso_bpm: document.getElementById('pc-pulso')?.value || null,
    brazo_toma: document.getElementById('pc-brazo')?.value || 'Brazo Izquierdo',
    postura_paciente: document.getElementById('pc-postura')?.value || 'Sentado (5 min reposo)',
    glicemia_mg_dl: document.getElementById('pc-glicemia')?.value || null,
    condicion_ayuno: document.getElementById('pc-condicion-ayuno')?.value || 'En Ayunas (8h+)',
    peso_kg: document.getElementById('pc-peso')?.value || null,
    talla_cm: document.getElementById('pc-talla')?.value || null,
    saturacion_o2: document.getElementById('pc-spo2')?.value || null,
    observaciones: document.getElementById('pc-notes')?.value.trim() || '',
    atendido_por: document.getElementById('pc-attended-by')?.value.trim() || 'Farmacéutico de Turno',
    precio_cobrado: precio,
    metodo_pago: metodoPago,
    estado_pago: sendToPosCart ? 'EN_TICKET_POS' : (metodoPago === 'CORTESIA' ? 'CORTESIA' : 'PAGADO'),
    registrar_en_caja: !sendToPosCart
  };

  try {
    const res = await fetch('/api/pharmaceutical-care', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.ok) {
      showToast(data.error || 'Error al guardar registro', 'error');
      return;
    }

    const rec = data.record;
    closePharmaCareModal();
    await loadPharmaceuticalCareData(farmaciaId);

    if (sendToPosCart) {
      const detParts = [];
      if (rec.presion_sistolica && rec.presion_diastolica) detParts.push(`PA: ${rec.presion_sistolica}/${rec.presion_diastolica} mmHg`);
      if (rec.glicemia_mg_dl) detParts.push(`Glicemia: ${rec.glicemia_mg_dl} mg/dL`);
      sysState.posCart.push({
        is_pharma_service: true,
        nombre_comercial: rec.nombre_servicio,
        presentacion: 'SERVICIO',
        cantidad: 1,
        unit_price: Number(rec.precio_cobrado || 0),
        subtotal: Number(rec.precio_cobrado || 0),
        detalle_clinico: `Paciente: ${rec.paciente_nombre} • Toma: ${rec.fecha_toma} ${rec.hora_toma} • ${detParts.join(' | ')}`
      });
      renderPosCart();
      showToast(`🛒 Servicio "${rec.nombre_servicio}" cargado al Carrito POS (${formatRD(rec.precio_cobrado)})`);
    } else {
      showToast(`✅ Registro #${rec.codigo_atencion} guardado correctamente.`);
      if (typeof refreshPharmacyWorkspace === 'function') {
        refreshPharmacyWorkspace();
      }
    }

    // Mostrar inmediatamente el comprobante imprimible con fecha y hora de toma para entregar al paciente
    openPharmaCarePrintModal(rec.id, rec);
  } catch (err) {
    console.error('Error al registrar Atención Farmacéutica:', err);
    showToast('Error de conexión al guardar registro.', 'error');
  }
}

function openPharmaCareTariffsModal() {
  const container = document.getElementById('pharma-care-tariffs-form-list');
  if (!container) return;
  const tariffs = sysState.pharmaCareTariffs || [];
  container.innerHTML = tariffs.map((t, idx) => `
    <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <span class="text-xl">${t.icono || '🩺'}</span>
        <div>
          <p class="font-extrabold text-slate-900">${t.nombre_servicio}</p>
          <p class="text-[10px] text-slate-500">${t.descripcion || ''}</p>
        </div>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <span class="font-bold text-slate-600">RD$</span>
        <input
          type="number"
          step="0.01"
          min="0"
          data-tariff-code="${t.codigo_servicio}"
          data-tariff-name="${t.nombre_servicio}"
          data-tariff-desc="${t.descripcion || ''}"
          value="${Number(t.precio_rd).toFixed(2)}"
          class="pharma-tariff-price-inp w-28 px-3 py-1.5 rounded-xl border-2 border-teal-500 bg-white font-mono font-black text-sm text-right"
        />
      </div>
    </div>
  `).join('');
  showModal('modal-pharma-care-tariffs');
}

function closePharmaCareTariffsModal() {
  hideModal('modal-pharma-care-tariffs');
}

async function submitPharmaCareTariffsForm(e) {
  e.preventDefault();
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const inputs = document.querySelectorAll('.pharma-tariff-price-inp');
  const tariffsPayload = Array.from(inputs).map(inp => ({
    codigo_servicio: inp.getAttribute('data-tariff-code'),
    nombre_servicio: inp.getAttribute('data-tariff-name'),
    descripcion: inp.getAttribute('data-tariff-desc'),
    precio_rd: parseFloat(inp.value || '0')
  }));

  try {
    const res = await fetch('/api/pharmaceutical-care/tariffs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: Number(f.id || 1),
        tariffs: tariffsPayload
      })
    });
    const data = await res.json();
    if (data.ok) {
      sysState.pharmaCareTariffs = data.tariffs || [];
      renderPharmaCareTariffsCards();
      closePharmaCareTariffsModal();
      showToast('✅ Precios de servicios de Atención Farmacéutica actualizados.');
    }
  } catch (err) {
    showToast('Error al guardar precios', 'error');
  }
}

function openPharmaCarePrintModal(recordId, directRecordObj = null) {
  const rec = directRecordObj || (sysState.pharmaCareRecords || []).find(r => Number(r.id) === Number(recordId));
  if (!rec) {
    showToast('Registro no encontrado para imprimir.', 'error');
    return;
  }
  sysState.lastPrintedPharmaCareRecord = rec;
  const f = sysState.authenticatedPharmacy || {};
  const area = document.getElementById('printable-pharma-care-area');
  if (!area) return;

  const hasPA = rec.presion_sistolica && rec.presion_diastolica;
  const hasGlic = rec.glicemia_mg_dl && Number(rec.glicemia_mg_dl) > 0;

  area.innerHTML = `
    <div class="text-center space-y-0.5 pb-2 border-b-2 border-dashed border-slate-300">
      <h3 class="text-base font-black text-slate-900 uppercase">${f.nombre || 'Farmacia Davalsi'}</h3>
      <p class="text-[11px] font-bold text-rose-700 uppercase">SERVICIO DE ATENCIÓN FARMACÉUTICA</p>
      <p class="text-[10px] font-mono text-slate-500">RNC: ${f.rnc || '1-31-99887-2'} • Tel: ${f.telefono || f.telefono_whatsapp || '809-555-0900'}</p>
      <p class="text-[10px] text-slate-500">${f.direccion || ''}</p>
    </div>

    <!-- Recuadro de Fecha y Hora Exacta de la Toma -->
    <div class="p-2.5 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-between text-[11px]">
      <div>
        <span class="text-slate-500 font-bold block">CONTROL N°: <strong class="font-mono text-slate-900">#${rec.codigo_atencion}</strong></span>
        <span class="text-slate-800 font-extrabold">📅 FECHA DE TOMA: <span class="font-mono">${rec.fecha_toma}</span></span>
      </div>
      <div class="text-right">
        <span class="px-2 py-0.5 rounded bg-rose-600 text-white font-black text-[10px] uppercase">REGISTRO OFICIAL</span>
        <span class="block text-slate-900 font-black mt-0.5">⏰ HORA: <span class="font-mono">${rec.hora_toma}</span></span>
      </div>
    </div>

    <!-- Datos del Paciente Crónico -->
    <div class="space-y-1 text-[11px] border-b border-slate-200 pb-2">
      <div class="flex justify-between"><span class="text-slate-500 font-semibold">Paciente:</span><strong class="text-slate-900">${rec.paciente_nombre}</strong></div>
      <div class="flex justify-between"><span class="text-slate-500 font-semibold">Cédula / Tel:</span><span class="font-mono font-bold">${rec.paciente_cedula || 'S/C'} • ${rec.paciente_telefono || '-'}</span></div>
      <div class="flex justify-between"><span class="text-slate-500 font-semibold">Condición Crónica:</span><strong class="text-teal-800">${rec.diagnostico_cronico || 'Control Preventivo'}</strong></div>
      ${rec.medicamento_habitual ? `<div class="flex justify-between"><span class="text-slate-500 font-semibold">Medicación Habitual:</span><span class="font-bold">${rec.medicamento_habitual}</span></div>` : ''}
    </div>

    <!-- Resultados Clínicos Registrados -->
    <div class="space-y-2 py-1">
      <p class="text-[10px] font-black uppercase text-slate-500 tracking-wider">RESULTADOS DE LA TOMA REGISTRADA:</p>

      ${hasPA ? `
        <div class="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-1">
          <div class="flex items-center justify-between">
            <span class="font-black text-rose-950 text-xs">🩺 PRESIÓN ARTERIAL (PA):</span>
            <span class="text-base font-black font-mono text-slate-900">${rec.presion_sistolica} / ${rec.presion_diastolica} mmHg</span>
          </div>
          <div class="flex items-center justify-between text-[11px] text-slate-700">
            <span>♥ Pulso / FC: <strong class="font-mono">${rec.pulso_bpm || '-'} lpm</strong></span>
            <span>${rec.brazo_toma || 'Brazo Izq.'} • ${rec.postura_paciente || 'Sentado'}</span>
          </div>
          <div class="pt-1 border-t border-rose-200/60 text-[11px] font-extrabold text-rose-900">
            Interpretación: ${rec.clasificacion_pa || 'Registrada'}
          </div>
        </div>
      ` : ''}

      ${hasGlic ? `
        <div class="p-3 rounded-xl bg-indigo-50 border border-indigo-200 space-y-1">
          <div class="flex items-center justify-between">
            <span class="font-black text-indigo-950 text-xs">🩸 GLICEMIA CAPILAR:</span>
            <span class="text-base font-black font-mono text-slate-900">${rec.glicemia_mg_dl} mg/dL</span>
          </div>
          <div class="flex items-center justify-between text-[11px] text-slate-700">
            <span>Condición de toma:</span>
            <strong class="font-bold">${rec.condicion_ayuno || 'En Ayunas'}</strong>
          </div>
          <div class="pt-1 border-t border-indigo-200/60 text-[11px] font-extrabold text-indigo-900">
            Interpretación: ${rec.clasificacion_glicemia || 'Registrada'}
          </div>
        </div>
      ` : ''}

      ${(rec.peso_kg || rec.talla_cm || rec.saturacion_o2) ? `
        <div class="p-2.5 rounded-xl bg-teal-50/70 border border-teal-200 flex flex-wrap justify-around gap-2 text-[11px] font-bold text-slate-800">
          ${rec.peso_kg ? `<span>⚖️ Peso: <strong>${rec.peso_kg} kg</strong> (${(Number(rec.peso_kg)*2.20462).toFixed(1)} lb)</span>` : ''}
          ${rec.talla_cm ? `<span>📏 Talla: <strong>${rec.talla_cm} cm</strong></span>` : ''}
          ${rec.imc ? `<span>📊 IMC: <strong>${rec.imc} kg/m²</strong> (${rec.clasificacion_imc || ''})</span>` : ''}
          ${rec.saturacion_o2 ? `<span>🫁 SpO2: <strong>${rec.saturacion_o2}%</strong></span>` : ''}
        </div>
      ` : ''}
    </div>

    ${rec.observaciones ? `
      <div class="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px]">
        <span class="font-black text-amber-900 block uppercase text-[10px]">Recomendación Farmacéutica:</span>
        <p class="text-slate-800 font-medium mt-0.5">${rec.observaciones}</p>
      </div>
    ` : ''}

    <!-- Comprobante de Pago del Servicio Secundario -->
    <div class="pt-2 border-t-2 border-dashed border-slate-300 space-y-1 text-[11px]">
      <div class="flex justify-between font-bold text-slate-700">
        <span>Servicio Realizado:</span>
        <span>${rec.nombre_servicio}</span>
      </div>
      <div class="flex justify-between items-baseline text-sm font-black text-slate-900">
        <span>MONTO DEL SERVICIO:</span>
        <span class="text-teal-700 font-mono">${formatRD(rec.precio_cobrado)} (${rec.estado_pago})</span>
      </div>
      <div class="flex justify-between text-[10px] text-slate-500">
        <span>Atendido por: ${rec.atendido_por || 'Farmacéutico'}</span>
        <span>Pago: ${rec.metodo_pago}</span>
      </div>
    </div>

    <div class="pt-4 text-center space-y-1">
      <div class="border-t border-slate-400 w-44 mx-auto pt-1 text-[10px] font-bold text-slate-600">
        Firma / Sello de Atención Farmacéutica
      </div>
      <p class="text-[9px] text-slate-400 italic">Conserve este comprobante para el control médico de su tratamiento crónico.</p>
    </div>
  `;

  showModal('modal-pharma-care-print');
}

function closePharmaCarePrintModal() {
  hideModal('modal-pharma-care-print');
}

function printCurrentPharmaCareReport() {
  const area = document.getElementById('printable-pharma-care-area');
  if (!area) return;
  const win = window.open('', '_blank', 'width=420,height=700');
  if (!win) {
    window.print();
    return;
  }
  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <title>Comprobante Atención Farmacéutica - Toma de Presión / Glicemia</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 14px; color: #0f172a; font-size: 12px; }
        .voucher { max-width: 320px; margin: 0 auto; border: 1px dashed #334155; padding: 12px; border-radius: 8px; }
        h3 { margin: 0 0 4px 0; font-size: 15px; text-align: center; }
        p { margin: 2px 0; }
        .box { border: 1px solid #94a3b8; padding: 8px; border-radius: 6px; margin: 8px 0; background: #f8fafc; }
        .row { display: flex; justify-content: space-between; margin: 3px 0; }
        @media print { body { padding: 0; } .voucher { border: none; } }
      </style>
    </head>
    <body>
      <div class="voucher">${area.innerHTML}</div>
      <script>
        window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 400); };
      </script>
    </body>
    </html>
  `);
  win.document.close();
}

async function deletePharmaCareRecord(recordId) {
  const f = sysState.authenticatedPharmacy || { id: 1 };
  try {
    const res = await fetch('/api/pharmaceutical-care/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmacia_id: Number(f.id || 1), record_id: Number(recordId) })
    });
    const data = await res.json();
    if (data.ok) {
      showToast('Registro eliminado.');
      await loadPharmaceuticalCareData(f.id);
    }
  } catch (e) {
    showToast('No se pudo eliminar el registro.', 'error');
  }
}

window.loadPromotionalKits = loadPromotionalKits;
window.renderPosQuickKits = renderPosQuickKits;
window.openPosKitDetailModal = openPosKitDetailModal;
window.handlePosKitSellerPriceChange = handlePosKitSellerPriceChange;
window.applyPosKitSellerQuickDiscount = applyPosKitSellerQuickDiscount;
window.closePosKitDetailModal = closePosKitDetailModal;
window.executeAddKitFromModal = executeAddKitFromModal;
window.addKitToPosCart = addKitToPosCart;
window.renderKitsManagementView = renderKitsManagementView;
window.saveSellerQuickKitOffer = saveSellerQuickKitOffer;
window.openKitBuilderModal = openKitBuilderModal;
window.closeKitBuilderModal = closeKitBuilderModal;
window.addProductToKitBuilder = addProductToKitBuilder;
window.removeProductFromKitBuilder = removeProductFromKitBuilder;
window.submitKitBuilderForm = submitKitBuilderForm;

window.loadPharmaceuticalCareData = loadPharmaceuticalCareData;
window.openPharmaCareModal = openPharmaCareModal;
window.openPharmaCareModalForPatient = openPharmaCareModalForPatient;
window.closePharmaCareModal = closePharmaCareModal;
window.handleSelectChronicPatientForCare = handleSelectChronicPatientForCare;
window.handlePharmaCareServiceTypeChange = handlePharmaCareServiceTypeChange;
window.updateLivePharmaCareClassification = updateLivePharmaCareClassification;
window.submitPharmaCareRecord = submitPharmaCareRecord;
window.openPharmaCareTariffsModal = openPharmaCareTariffsModal;
window.closePharmaCareTariffsModal = closePharmaCareTariffsModal;
window.submitPharmaCareTariffsForm = submitPharmaCareTariffsForm;
window.openPharmaCarePrintModal = openPharmaCarePrintModal;
window.closePharmaCarePrintModal = closePharmaCarePrintModal;
window.printCurrentPharmaCareReport = printCurrentPharmaCareReport;
window.deletePharmaCareRecord = deletePharmaCareRecord;



/* =========================================================================
   MÓDULO DE INTELIGENCIA ARTIFICIAL FARMACÉUTICA (FARMA-IA) — SISTEMA POS
   1. Sugerencias por Principio Activo / Equivalentes Terapéuticos en Stock
   2. Recordatorios de Bajo Stock + Medicamentos Más Vendidos para Comprar Más
   3. Recordatorios de Pacientes Crónicos con 10 Días de Anticipación + Cruce Stock
   4. Kits Médicos Automáticos Multi-Dosis (>1 dosis: Gripe, Parásitos, Gástrico, Dolor, Cardio)
   5. Sugerencias por Temporadas Epidemiológicas
   6. Manejo Interactivo de Presión Arterial y Azúcar (Glicemia) Tomadas Adecuadamente
   7. Copiloto Interactivo de Uso del Sistema de Venta (POS)
   ========================================================================= */

sysState.aiHubData = null;
sysState.lastLiveVitalRecommendationText = '';
let posInlineAiDebounceTimer = null;

async function refreshAiAssistantHub() {
  const fid = sysState.authenticatedPharmacy ? sysState.authenticatedPharmacy.id : 1;
  try {
    const res = await fetch(`/api/ai/hub?farmacia_id=${fid}`);
    const data = await res.json();
    if (data.ok) {
      sysState.aiHubData = data;
      const badgeNav = document.getElementById('badge-sys-ai-alerts');
      if (badgeNav) {
        const total = Number(data.total_alertas_activas || 0);
        badgeNav.textContent = total > 0 ? `${total} Alertas IA` : 'IA Activa';
      }
      const badgeStock = document.getElementById('ai-badge-tab-stock');
      if (badgeStock && data.stock_and_top_sellers?.resumen) {
        badgeStock.textContent = data.stock_and_top_sellers.resumen.total_bajo_stock || 0;
      }
      const badgeCron = document.getElementById('ai-badge-tab-cronicos');
      if (badgeCron && data.chronic_10d_reminders?.resumen) {
        badgeCron.textContent = data.chronic_10d_reminders.resumen.total_alertas_10d || 0;
      }
      renderAiStockAndTopSellers(data.stock_and_top_sellers);
      renderAiChronic10dReminders(data.chronic_10d_reminders);
      renderAiMultiDoseKitsGrid(data.ai_medical_kits || []);
      renderAiSeasonalSection(data.seasonal_intelligence);
    }
  } catch (err) {
    console.error('Error cargando Hub FarmaIA:', err);
  }
}

function openAiAssistantModal(initialTab = 'principio_activo', initialQuery = '') {
  showModal('modal-ai-assistant');
  switchAiAssistantTab(initialTab);
  refreshAiAssistantHub();
  if (initialQuery) {
    quickSearchAiSubstitute(initialQuery);
  } else {
    const container = document.getElementById('ai-sub-results-container');
    if (container && !container.innerHTML.trim()) {
      quickSearchAiSubstitute('Panadol');
    }
  }
  const copilotBox = document.getElementById('ai-copilot-answer-box');
  if (copilotBox && !copilotBox.innerHTML.trim()) {
    askAiPosCopilot('¿Cómo realizar una venta rápida por unidad, blíster o caja?');
  }
}

function closeAiAssistantModal() {
  hideModal('modal-ai-assistant');
}

function switchAiAssistantTab(tabKey) {
  const tabs = ['principio_activo', 'stock_top', 'cronicos_10d', 'kits_temporadas', 'guia_sistema'];
  tabs.forEach(t => {
    const btn = document.getElementById(`ai-tab-btn-${t}`);
    const view = document.getElementById(`ai-tab-view-${t}`);
    if (view) {
      if (t === tabKey) view.classList.remove('hidden');
      else view.classList.add('hidden');
    }
    if (btn) {
      if (t === tabKey) {
        btn.className = 'px-3.5 py-2 rounded-xl bg-indigo-600 text-white shadow-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap';
      } else {
        btn.className = 'px-3.5 py-2 rounded-xl bg-white text-slate-700 hover:bg-slate-200 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap';
      }
    }
  });
}

// -------------------------------------------------------------------------
// 1. SUGERENCIAS IA POR PRINCIPIO ACTIVO (EN MODAL Y EN LÍNEA EN EL POS)
// -------------------------------------------------------------------------

function handleAiSubstituteSearchSubmit(e) {
  if (e) e.preventDefault();
  const inp = document.getElementById('ai-sub-search-input');
  const q = inp ? inp.value.trim() : '';
  if (!q) return;
  quickSearchAiSubstitute(q);
}

async function quickSearchAiSubstitute(queryText) {
  const inp = document.getElementById('ai-sub-search-input');
  if (inp) inp.value = queryText;
  const fid = sysState.authenticatedPharmacy ? sysState.authenticatedPharmacy.id : 1;
  const container = document.getElementById('ai-sub-results-container');
  if (container) {
    container.innerHTML = `<div class="p-4 text-center text-xs font-bold text-indigo-700">🤖 Analizando principio activo y existencias en anaquel para "${queryText}"...</div>`;
  }
  try {
    const res = await fetch(`/api/ai/suggest-active-ingredient?farmacia_id=${fid}&q=${encodeURIComponent(queryText)}`);
    const data = await res.json();
    if (data.ok) {
      renderAiSubstituteResults(data);
    }
  } catch (err) {
    console.error('Error buscando sustituto IA:', err);
  }
}

function renderAiSubstituteResults(data) {
  const container = document.getElementById('ai-sub-results-container');
  if (!container) return;

  const allOptions = [
    ...(data.disponibles_exactos || []),
    ...(data.sustitutos_principio_activo || []),
    ...(data.alternativas_terapeuticas || [])
  ];

  const cardsHtml = allOptions.map(p => `
    <div class="p-3.5 rounded-2xl bg-white border-2 ${p.es_bioequivalente ? 'border-emerald-300' : 'border-indigo-200'} shadow-2xs flex flex-col justify-between gap-2.5">
      <div>
        <div class="flex items-center justify-between gap-1.5 flex-wrap">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-black ${p.es_bioequivalente ? 'bg-emerald-100 text-emerald-900' : 'bg-indigo-100 text-indigo-900'}">
            ${p.etiqueta_ia || '🧬 Equivalente en Stock'}
          </span>
          <span class="text-[10px] font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg">
            📍 Anaquel: ${p.ubicacion_anaquel} • Stock: ${p.stock_unidades} uds
          </span>
        </div>
        <h5 class="font-black text-slate-900 text-sm mt-1.5">${p.nombre_comercial}</h5>
        <p class="text-xs font-bold text-teal-700">Principio Activo: ${p.principio_activo} (${p.concentracion})</p>
        <p class="text-[11px] text-slate-500">${p.laboratorio || 'Laboratorio Certificado'} • ${p.categoria}</p>
      </div>

      <div class="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div>
          <span class="text-[10px] text-slate-400 uppercase font-bold block">Precio por ${p.unidad_minima_nombre || 'Unidad'}</span>
          <span class="text-base font-black text-slate-900 font-mono">${formatRD(p.precio_unidad)}</span>
          <span class="text-[10px] text-slate-500 block">Blíster: ${formatRD(p.precio_blister)} • Caja: ${formatRD(p.precio_caja)}</span>
        </div>
        <div class="flex items-center gap-1">
          <button type="button" onclick="addAiSuggestedProductToPosCart(${p.id}, 'UNIDAD')" class="px-2.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-[11px] cursor-pointer shadow-2xs">
            + 1 Unid.
          </button>
          <button type="button" onclick="addAiSuggestedProductToPosCart(${p.id}, 'BLISTER')" class="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] cursor-pointer">
            + Blíster
          </button>
          <button type="button" onclick="addAiSuggestedProductToPosCart(${p.id}, 'CAJA')" class="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold text-[11px] cursor-pointer">
            + Caja
          </button>
        </div>
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="p-4 rounded-2xl bg-slate-900 text-white space-y-2 border border-slate-700">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] uppercase">
          PRINCIPIO ACTIVO DETECTADO: ${data.principio_activo_detectado}
        </span>
        <span class="text-xs font-bold text-teal-300">${data.grupo_terapeutico}</span>
      </div>
      <p class="text-xs font-bold text-white leading-relaxed">${data.guion_vendedor}</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px] text-slate-300">
        <div class="p-2 rounded-xl bg-white/5 border border-white/10">
          <strong class="text-amber-300">🩺 Indicación Clínica:</strong> ${data.indicacion_clinica}
        </div>
        <div class="p-2 rounded-xl bg-white/5 border border-white/10">
          <strong class="text-teal-300">💊 Posología Orientativa:</strong> ${data.posologia_orientativa}
        </div>
      </div>
    </div>

    ${allOptions.length ? `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        ${cardsHtml}
      </div>
    ` : `
      <div class="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold">
        ⚠️ No se encontraron unidades disponibles para este principio activo. Puedes registrarlo en Inventario o consultar otra familia terapéutica.
      </div>
    `}
  `;
}

function addAiSuggestedProductToPosCart(productId, presentacion = 'UNIDAD') {
  addProductToPosCartById(Number(productId), presentacion, 1);
  closeAiAssistantModal();
  switchSysTab('pos');
}

function triggerInlinePosAiSuggestion(queryText) {
  if (posInlineAiDebounceTimer) clearTimeout(posInlineAiDebounceTimer);
  posInlineAiDebounceTimer = setTimeout(async () => {
    const box = document.getElementById('pos-inline-ai-suggestion-box');
    if (!box) return;
    const fid = sysState.authenticatedPharmacy ? sysState.authenticatedPharmacy.id : 1;
    try {
      const res = await fetch(`/api/ai/suggest-active-ingredient?farmacia_id=${fid}&q=${encodeURIComponent(queryText)}`);
      const data = await res.json();
      if (!data.ok || !data.total_opciones_en_stock) {
        box.classList.add('hidden');
        return;
      }
      const topOpts = [
        ...(data.sustitutos_principio_activo || []),
        ...(data.disponibles_exactos || []),
        ...(data.alternativas_terapeuticas || [])
      ].slice(0, 3);

      if (!topOpts.length) {
        box.classList.add('hidden');
        return;
      }

      box.classList.remove('hidden');
      box.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded-lg bg-indigo-600 text-white font-black text-[10px]">🤖 SUGERENCIA FARMA-IA POR PRINCIPIO ACTIVO</span>
            <span class="text-xs font-extrabold text-indigo-950">${data.principio_activo_detectado} (${data.grupo_terapeutico})</span>
          </div>
          <button type="button" onclick="document.getElementById('pos-inline-ai-suggestion-box').classList.add('hidden')" class="text-[11px] font-bold text-slate-400 hover:text-slate-700 cursor-pointer">✕ Ocultar</button>
        </div>
        <p class="text-[11px] font-semibold text-slate-700">${data.guion_vendedor}</p>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          ${topOpts.map(p => `
            <div class="p-2.5 rounded-xl bg-white border border-indigo-200 flex items-center justify-between gap-2 shadow-2xs">
              <div class="min-w-0">
                <span class="text-[9px] font-black text-emerald-700 block">${p.etiqueta_ia || 'Equivalente en Stock'}</span>
                <p class="font-extrabold text-slate-900 text-xs truncate">${p.nombre_comercial}</p>
                <p class="text-[10px] text-slate-500">Anaquel ${p.ubicacion_anaquel} • Stock: ${p.stock_unidades}u • <strong>${formatRD(p.precio_unidad)}</strong></p>
              </div>
              <button type="button" onclick="addProductToPosCartById(${p.id}, 'UNIDAD', 1)" class="px-2.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-black text-[10px] shrink-0 cursor-pointer">
                + Unidad
              </button>
            </div>
          `).join('')}
        </div>
      `;
    } catch (e) {
      // Silencioso en sugerencia inline
    }
  }, 220);
}

// -------------------------------------------------------------------------
// 2. RECORDATORIOS DE COMPRA (BAJO STOCK) + MÁS VENDIDOS PARA COMPRAR MÁS
// -------------------------------------------------------------------------

function renderAiStockAndTopSellers(stockData) {
  if (!stockData) return;
  const lowContainer = document.getElementById('ai-low-stock-list');
  const topContainer = document.getElementById('ai-top-sellers-list');

  if (lowContainer) {
    const lowList = stockData.low_stock_reminders || [];
    if (!lowList.length) {
      lowContainer.innerHTML = `<div class="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold">✅ Todos los medicamentos superan su stock mínimo y cubren la demanda de pacientes crónicos.</div>`;
    } else {
      lowContainer.innerHTML = lowList.map(item => `
        <div class="p-3 rounded-xl bg-rose-50/60 border border-rose-200 flex flex-wrap items-center justify-between gap-2">
          <div class="space-y-0.5">
            <div class="flex items-center gap-1.5">
              <span class="px-2 py-0.5 rounded text-[9px] font-black ${item.urgencia === 'CRITICO_AGOTADO' ? 'bg-rose-600 text-white' : 'bg-amber-200 text-amber-950'}">${item.urgencia}</span>
              <strong class="text-xs text-slate-900">${item.nombre_comercial}</strong>
              <span class="text-[10px] text-slate-500">(${item.principio_activo})</span>
            </div>
            <p class="text-[11px] text-rose-800 font-semibold">${item.motivo_ia}</p>
            <p class="text-[10px] text-slate-600">Stock actual: <strong>${item.stock_actual_unidades} uds</strong> • Sugerencia IA: Comprar <strong>${item.cantidad_sugerida_cajas} caja(s) (${item.cantidad_sugerida_unidades} uds)</strong></p>
          </div>
          <button type="button" onclick="closeAiAssistantModal(); openReplenishModal(${item.id});" class="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] cursor-pointer shadow-2xs">
            ➕ Reabastecer
          </button>
        </div>
      `).join('');
    }
  }

  if (topContainer) {
    const topList = stockData.top_sellers_to_buy_more || [];
    if (!topList.length) {
      topContainer.innerHTML = `<div class="p-4 text-center text-slate-400 text-xs">Sin datos de rotación aún.</div>`;
    } else {
      topContainer.innerHTML = topList.map((item, idx) => `
        <div class="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200 flex flex-wrap items-center justify-between gap-2">
          <div class="space-y-0.5">
            <div class="flex items-center gap-1.5">
              <span class="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-[10px] flex items-center justify-center">#${idx + 1}</span>
              <strong class="text-xs text-slate-900">${item.nombre_comercial}</strong>
              <span class="text-[10px] font-mono text-teal-700 font-bold">Stock: ${item.stock_actual_unidades}u</span>
            </div>
            <p class="text-[11px] text-emerald-900 font-semibold">${item.recomendacion_ia}</p>
          </div>
          <button type="button" onclick="closeAiAssistantModal(); openReplenishModal(${item.id});" class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] cursor-pointer">
            📦 Comprar +${item.sugerencia_compra_cajas} Caja(s)
          </button>
        </div>
      `).join('');
    }
  }
}

function printAiPurchaseOrderReport() {
  const stockData = sysState.aiHubData?.stock_and_top_sellers;
  if (!stockData) {
    showToast('Cargando datos de abastecimiento IA...', 'error');
    return;
  }
  const f = sysState.authenticatedPharmacy || { nombre: 'Farmacia Davalsi' };
  const lowList = stockData.low_stock_reminders || [];
  const topList = stockData.top_sellers_to_buy_more || [];

  const win = window.open('', '_blank', 'width=800,height=700');
  if (!win) return;
  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <title>Orden de Compra y Reabastecimiento Sugerido por FarmaIA</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; font-size: 12px; }
        h2 { margin: 0 0 4px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; margin-bottom: 24px; }
        th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
        th { background: #f1f5f9; font-weight: bold; }
      </style>
    </head>
    <body>
      <h2>🤖 ${f.nombre} — Orden de Compra Inteligente Sugerida por FarmaIA</h2>
      <p>Fecha de emisión: ${new Date().toLocaleString('es-DO')}</p>
      <h3>1. Medicamentos en Bajo Stock o Comprometidos por Pacientes Crónicos</h3>
      <table>
        <thead>
          <tr><th>Medicamento</th><th>Principio Activo</th><th>Stock Actual</th><th>Motivo IA</th><th>Compra Sugerida</th></tr>
        </thead>
        <tbody>
          ${lowList.map(i => `<tr><td><b>${i.nombre_comercial}</b></td><td>${i.principio_activo}</td><td>${i.stock_actual_unidades} uds</td><td>${i.motivo_ia}</td><td><b>${i.cantidad_sugerida_cajas} Caja(s) (${i.cantidad_sugerida_unidades} uds)</b></td></tr>`).join('') || '<tr><td colspan="5">Sin alertas de bajo stock.</td></tr>'}
        </tbody>
      </table>
      <h3>2. Medicamentos Más Vendidos (Alta Rotación para Comprar Más)</h3>
      <table>
        <thead>
          <tr><th>#</th><th>Medicamento</th><th>Ventas 30d</th><th>Stock Actual</th><th>Recomendación IA</th></tr>
        </thead>
        <tbody>
          ${topList.map((i, idx) => `<tr><td>${idx + 1}</td><td><b>${i.nombre_comercial}</b></td><td>${i.unidades_vendidas_30d} uds</td><td>${i.stock_actual_unidades} uds</td><td>${i.recomendacion_ia}</td></tr>`).join('')}
        </tbody>
      </table>
      <script>window.onload = function() { window.print(); };</script>
    </body>
    </html>
  `);
  win.document.close();
}

// -------------------------------------------------------------------------
// 3. RECORDATORIO DE VENTAS DE MEDICAMENTOS CRÓNICOS (10 DÍAS ANTICIPACIÓN)
// -------------------------------------------------------------------------

function renderAiChronic10dReminders(chronicData) {
  const container = document.getElementById('ai-chronic-10d-list');
  if (!container || !chronicData) return;

  const alerts = chronicData.alertas_10_dias_y_vencidos || [];
  const all = chronicData.todos_los_pacientes_cronicos || [];
  const listToRender = alerts.length ? alerts : all;

  if (!listToRender.length) {
    container.innerHTML = `
      <div class="p-6 text-center bg-white rounded-2xl border border-slate-200 space-y-2">
        <p class="text-sm font-black text-slate-800">No hay pacientes crónicos registrados todavía.</p>
        <p class="text-xs text-slate-500">Cuando registres pacientes hipertensos, diabéticos o de uso continuo, la IA te avisará automáticamente 10 días antes de que se les termine su medicamento.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = listToRender.map(cp => {
    const isUrgent = Number(cp.dias_restantes) <= 10;
    return `
      <div class="p-4 rounded-2xl bg-white border-2 ${isUrgent ? 'border-amber-400' : 'border-slate-200'} shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div class="space-y-1">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${cp.dias_restantes < 0 ? 'bg-rose-600 text-white' : (cp.dias_restantes <= 10 ? 'bg-amber-400 text-slate-950' : 'bg-emerald-100 text-emerald-900')}">
              ${cp.mensaje_estado}
            </span>
            <strong class="text-sm font-black text-slate-900">${cp.paciente_nombre}</strong>
            <span class="text-xs font-mono text-slate-500">📞 ${cp.paciente_telefono}</span>
          </div>
          <p class="text-xs font-bold text-teal-800">💊 Medicamento Crónico: <strong>${cp.medicamento_nombre}</strong> • Diagnóstico: ${cp.diagnostico_cronico}</p>
          <p class="text-[11px] ${cp.stock_suficiente_para_venta ? 'text-emerald-700 font-bold' : 'text-rose-700 font-black'}">
            ${cp.alerta_stock_cronico} • Próximo retiro: <span class="font-mono">${cp.fecha_proximo_vencimiento_tratamiento}</span>
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <a href="${cp.whatsapp_link}" target="_blank" class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-1 shadow-2xs">
            <span>💬</span> <span>Recordar por WhatsApp (10d)</span>
          </a>
          ${cp.producto_vinculado_id ? `
            <button type="button" onclick="dispatchChronicMedicationToPos(${cp.id}, ${cp.producto_vinculado_id}, ${cp.unidades_requeridas_ciclo || 30}, '${(cp.paciente_nombre || '').replace(/'/g, '')}', '${(cp.paciente_telefono || '').replace(/'/g, '')}')" class="px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs cursor-pointer shadow-2xs">
              🛒 Cargar ${cp.unidades_requeridas_ciclo || 30} uds al POS
            </button>
          ` : ''}
          <button type="button" onclick="openPharmaCareModalForPatient(${cp.id}); closeAiAssistantModal();" class="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer">
            🩺 Tomar Presión/Azúcar
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function dispatchChronicMedicationToPos(patientId, productId, unitsCount, patientName, patientPhone) {
  addProductToPosCartById(Number(productId), 'UNIDAD', Number(unitsCount || 30));
  const nameInp = document.getElementById('pos-client-name');
  const phoneInp = document.getElementById('pos-client-phone');
  if (nameInp && patientName) nameInp.value = patientName;
  if (phoneInp && patientPhone) phoneInp.value = patientPhone;
  closeAiAssistantModal();
  switchSysTab('pos');
  showToast(`✅ Tratamiento crónico de ${patientName} (${unitsCount} uds) cargado al POS.`);
}

// -------------------------------------------------------------------------
// 4. KITS MÉDICOS AUTOMÁTICOS MULTI-DOSIS (>1 DOSIS) Y TEMPORADAS
// -------------------------------------------------------------------------

async function triggerRegenerateAiMedicalKits() {
  const fid = sysState.authenticatedPharmacy ? sysState.authenticatedPharmacy.id : 1;
  try {
    const res = await fetch('/api/ai/generate-kits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmacia_id: fid })
    });
    const data = await res.json();
    if (data.ok) {
      sysState.promotionalKits = data.kits || [];
      renderPosQuickKits();
      renderKitsManagementView();
      renderAiMultiDoseKitsGrid(sysState.promotionalKits);
      showToast('🤖 Kits Médicos Multi-Dosis actualizados automáticamente por la IA según tu inventario.');
    }
  } catch (err) {
    showToast('Error al regenerar kits con IA', 'error');
  }
}

function renderAiMultiDoseKitsGrid(kits) {
  const container = document.getElementById('ai-kits-multidose-grid');
  if (!container) return;
  if (!kits || !kits.length) {
    container.innerHTML = `<div class="col-span-full p-4 text-center text-slate-400 text-xs">No hay kits generados. Pulse "Re-Generar Kits Médicos con IA Ahora".</div>`;
    return;
  }

  container.innerHTML = kits.map(kit => {
    const totalDoses = kit.total_dosis_unidades || (kit.items || []).reduce((acc, i) => acc + Number(i.cantidad || 1), 0);
    return `
      <div class="p-4 rounded-2xl bg-slate-50 border-2 border-indigo-200 flex flex-col justify-between gap-3">
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-1">
            <span class="px-2 py-0.5 rounded-full bg-indigo-600 text-white font-black text-[10px]">
              🤖 ESQUEMA ${totalDoses} DOSIS / UNIDADES
            </span>
            <span class="text-xs font-mono font-black text-teal-800">${formatRD(kit.precio_oferta_kit)}</span>
          </div>
          <h5 class="font-black text-slate-900 text-xs sm:text-sm">${kit.icono || '⚡'} ${kit.nombre_kit}</h5>
          <p class="text-[11px] text-slate-600">${kit.descripcion || kit.lema}</p>
          <div class="space-y-1 pt-1">
            ${(kit.items || []).map(it => `
              <div class="flex justify-between text-[11px] bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                <span class="font-bold text-slate-800">${it.icono || '💊'} <strong>${it.cantidad}x</strong> ${it.nombre_comercial}</span>
                <span class="font-mono text-slate-600">RD$ ${Number(it.subtotal_componente || (it.precio_unitario * it.cantidad)).toFixed(2)}</span>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
          <span class="text-[10px] font-bold text-emerald-800">Disponibles: ${kit.kits_disponibles} kits</span>
          <button type="button" onclick="closeAiAssistantModal(); openPosKitDetailModal('${kit.id}');" class="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs cursor-pointer shadow-2xs">
            🛒 Despachar Kit en POS
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function loadAiSeason(seasonKey) {
  const fid = sysState.authenticatedPharmacy ? sysState.authenticatedPharmacy.id : 1;
  try {
    const res = await fetch(`/api/ai/seasonal?farmacia_id=${fid}&season=${encodeURIComponent(seasonKey)}`);
    const data = await res.json();
    if (data.ok) {
      renderAiSeasonalSection(data);
    }
  } catch (e) {
    console.error('Error cargando temporada IA:', e);
  }
}

function renderAiSeasonalSection(seasonalData) {
  const container = document.getElementById('ai-seasonal-container');
  if (!container || !seasonalData || !seasonalData.temporada_activa) return;
  const s = seasonalData.temporada_activa;
  const inStock = seasonalData.productos_disponibles_temporada || [];

  container.innerHTML = `
    <div class="p-3.5 rounded-2xl bg-gradient-to-r from-teal-900 to-slate-900 text-white space-y-1.5">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <span class="font-black text-sm text-amber-300">${s.nombre}</span>
        <span class="px-2.5 py-0.5 rounded-full bg-white/10 text-teal-200 text-[10px] font-bold">Meses pico: ${s.meses_pico}</span>
      </div>
      <p class="text-xs text-slate-200 leading-relaxed">${s.alerta_epidemiologica}</p>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      ${inStock.map(p => `
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
          <div>
            <p class="font-black text-slate-900 text-xs">${p.nombre_comercial}</p>
            <p class="text-[10px] text-teal-700 font-bold">${p.principio_activo} • Stock: ${p.stock_unidades}u</p>
            <p class="text-[11px] font-mono font-bold text-slate-800">${formatRD(p.precio_base)} / ud</p>
          </div>
          <button type="button" onclick="addAiSuggestedProductToPosCart(${p.id}, 'UNIDAD')" class="px-2.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-[11px] cursor-pointer">
            + POS
          </button>
        </div>
      `).join('')}
    </div>
  `;
}

// -------------------------------------------------------------------------
// 5. COPILOTO INTERACTIVO DE USO DEL SISTEMA DE VENTA (POS)
// -------------------------------------------------------------------------

function handleAiCopilotFormSubmit(e) {
  if (e) e.preventDefault();
  const inp = document.getElementById('ai-copilot-question-input');
  const q = inp ? inp.value.trim() : '';
  if (!q) return;
  askAiPosCopilot(q);
}

async function askAiPosCopilot(questionText) {
  const inp = document.getElementById('ai-copilot-question-input');
  if (inp) inp.value = questionText;
  const fid = sysState.authenticatedPharmacy ? sysState.authenticatedPharmacy.id : 1;
  const box = document.getElementById('ai-copilot-answer-box');
  if (!box) return;

  try {
    const res = await fetch('/api/ai/ask-copilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmacia_id: fid, question: questionText })
    });
    const data = await res.json();
    if (!data.ok) return;

    let actionBtnHtml = '';
    if (data.accion_ui) {
      if (data.accion_ui.view) {
        actionBtnHtml = `<button type="button" onclick="closeAiAssistantModal(); switchSysTab('${data.accion_ui.view}');" class="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs cursor-pointer shadow">${data.accion_ui.label} →</button>`;
      } else if (data.accion_ui.modal === 'pharma_care') {
        actionBtnHtml = `<button type="button" onclick="closeAiAssistantModal(); openPharmaCareModal();" class="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs cursor-pointer shadow">${data.accion_ui.label} →</button>`;
      } else if (data.accion_ui.action === 'regenerate_ai_kits') {
        actionBtnHtml = `<button type="button" onclick="triggerRegenerateAiMedicalKits()" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs cursor-pointer shadow">${data.accion_ui.label} →</button>`;
      }
    }

    box.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
        <h5 class="font-black text-slate-900 text-sm">${data.titulo}</h5>
        ${actionBtnHtml}
      </div>
      <div class="space-y-1.5 py-1">
        ${(data.pasos || []).map(p => `<p class="text-xs text-slate-700 font-medium leading-relaxed">${p}</p>`).join('')}
      </div>
    `;
  } catch (err) {
    console.error('Error en Copiloto POS:', err);
  }
}

// -------------------------------------------------------------------------
// 6. EVALUADOR CLÍNICO INTERACTIVO DE PRESIÓN Y AZÚCAR (TOMA ADECUADA)
// -------------------------------------------------------------------------

async function updateLivePharmaCareClassification() {
  const sys = parseInt(document.getElementById('pc-pa-sys')?.value || '0', 10);
  const dia = parseInt(document.getElementById('pc-pa-dia')?.value || '0', 10);
  const pulso = parseInt(document.getElementById('pc-pulso')?.value || '0', 10);
  const glic = parseFloat(document.getElementById('pc-glicemia')?.value || '0');
  const cond = document.getElementById('pc-condicion-ayuno')?.value || 'En Ayunas (8h+)';

  const checks = {
    reposo_5min: document.getElementById('pc-chk-reposo')?.checked !== false,
    espalda_pies_apoyados: document.getElementById('pc-chk-postura')?.checked !== false,
    brazo_altura_corazon: document.getElementById('pc-chk-brazo')?.checked !== false,
    sin_cafe_tabaco_30min: document.getElementById('pc-chk-cafe')?.checked !== false,
    manos_limpias_secas: document.getElementById('pc-chk-manos')?.checked !== false
  };

  const passed = Object.values(checks).filter(Boolean).length;
  const pct = Math.round((passed / 5) * 100);
  const qBadge = document.getElementById('pc-technique-quality-badge');
  if (qBadge) {
    qBadge.textContent = `${pct}% Toma Adecuada (${passed}/5)`;
    qBadge.className = passed >= 4
      ? 'px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-2xs'
      : 'px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 shadow-2xs';
  }

  // Actualizar insignias rápidas locales inmediatamente
  const paBadge = document.getElementById('pc-live-pa-badge');
  if (paBadge) {
    if (sys > 0 && dia > 0) {
      if (sys >= 180 || dia >= 120) {
        paBadge.className = 'text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-600 text-white';
        paBadge.textContent = '🚨 Crisis Hipertensiva';
      } else if (sys >= 140 || dia >= 90) {
        paBadge.className = 'text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300';
        paBadge.textContent = '⚠️ HTA Nivel 2';
      } else if (sys >= 130 || dia >= 80) {
        paBadge.className = 'text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300';
        paBadge.textContent = '⚠️ HTA Nivel 1';
      } else if (sys >= 120 && dia < 80) {
        paBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200';
        paBadge.textContent = '🟡 Presión Elevada';
      } else if (sys < 90 || dia < 60) {
        paBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-300';
        paBadge.textContent = '🔵 Hipotensión';
      } else {
        paBadge.className = 'text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300';
        paBadge.textContent = '✅ Presión Normal';
      }
    } else {
      paBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-slate-500 border border-slate-200';
      paBadge.textContent = 'Sin medir';
    }
  }

  const glicBadge = document.getElementById('pc-live-glic-badge');
  if (glicBadge) {
    if (glic > 0) {
      const isFasting = cond.toLowerCase().includes('ayun');
      if (glic < 70) {
        glicBadge.className = 'text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-600 text-white';
        glicBadge.textContent = '🚨 Hipoglicemia';
      } else if (isFasting ? glic <= 99 : glic < 140) {
        glicBadge.className = 'text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300';
        glicBadge.textContent = '✅ Glicemia Normal';
      } else if (isFasting ? glic <= 125 : glic <= 199) {
        glicBadge.className = 'text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300';
        glicBadge.textContent = '⚠️ Valor en Alerta';
      } else {
        glicBadge.className = 'text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300';
        glicBadge.textContent = '🚨 Hiperglicemia';
      }
    } else {
      glicBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-slate-500 border border-slate-200';
      glicBadge.textContent = 'Sin medir';
    }
  }

  // Consultar evaluación interactiva completa del motor FarmaIA
  try {
    const res = await fetch('/api/ai/evaluate-vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        presion_sistolica: sys > 0 ? sys : null,
        presion_diastolica: dia > 0 ? dia : null,
        pulso_bpm: pulso > 0 ? pulso : null,
        glicemia_mg_dl: glic > 0 ? glic : null,
        condicion_ayuno: cond,
        peso_kg: parseFloat(document.getElementById('pc-peso')?.value || '0') || null,
        talla_cm: parseFloat(document.getElementById('pc-talla')?.value || '0') || null,
        checks_toma_adecuada: checks
      })
    });
    const evalData = await res.json();
    if (!evalData.ok) return;

    sysState.lastLiveVitalRecommendationText = evalData.observacion_sugerida_reporte || '';
    const notesInp = document.getElementById('pc-notes');
    if (notesInp && !notesInp.value.trim() && (sys > 0 || glic > 0)) {
      notesInp.value = sysState.lastLiveVitalRecommendationText;
    }

    const aiBody = document.getElementById('pc-interactive-ai-body');
    if (aiBody) {
      const pa = evalData.presion_arterial || {};
      const gl = evalData.glicemia_capilar || {};
      const cal = evalData.calidad_toma || {};

      let htmlParts = [];
      htmlParts.push(`<div class="text-[11px] font-bold text-emerald-300">${cal.etiqueta} (${cal.porcentaje}% protocolo cumplido)</div>`);
      if (cal.advertencias_tecnica && cal.advertencias_tecnica.length) {
        htmlParts.push(`<div class="text-[10px] text-amber-300">⚠️ Técnica: ${cal.advertencias_tecnica.join(' • ')}</div>`);
      }
      if (pa.registrada) {
        htmlParts.push(`
          <div class="p-2 rounded-xl bg-white/10 border border-white/15 space-y-0.5">
            <div class="flex items-center justify-between font-black text-white">
              <span>${pa.clasificacion}</span>
              <span class="font-mono text-[10px] text-teal-300">PAM: ${pa.pam_mmhg} mmHg • P. Pulso: ${pa.presion_pulso_mmhg} mmHg</span>
            </div>
            <p class="text-[11px] text-slate-200">${(pa.recomendaciones || []).join(' ')}</p>
          </div>
        `);
      }
      if (gl.registrada) {
        htmlParts.push(`
          <div class="p-2 rounded-xl bg-white/10 border border-white/15 space-y-0.5">
            <div class="flex items-center justify-between font-black text-white">
              <span>${gl.clasificacion}</span>
              <span class="font-mono text-[10px] text-indigo-300">HbA1c orientativa: ~${gl.hba1c_orientativa}%</span>
            </div>
            <p class="text-[11px] text-slate-200">${(gl.recomendaciones || []).join(' ')}</p>
          </div>
        `);
      }
      const antro = evalData.antropometria || {};
      if (antro.registrada) {
        htmlParts.push(`
          <div class="p-2 rounded-xl bg-white/10 border border-white/15 space-y-0.5">
            <div class="flex items-center justify-between font-black text-white">
              <span>${antro.clasificacion}</span>
              <span class="font-mono text-[10px] text-emerald-300">Peso: ${antro.peso_kg || '-'} kg (${antro.peso_lb || '-'} lb) • Talla: ${antro.talla_cm || '-'} cm</span>
            </div>
            ${antro.recomendaciones?.length ? `<p class="text-[11px] text-slate-200">${antro.recomendaciones.join(' ')}</p>` : ''}
          </div>
        `);
      }
      aiBody.innerHTML = htmlParts.join('');
    }
  } catch (e) {
    // fallback silencioso
  }
}

function applyAiVitalRecommendationToNotes() {
  const notesInp = document.getElementById('pc-notes');
  if (notesInp && sysState.lastLiveVitalRecommendationText) {
    notesInp.value = sysState.lastLiveVitalRecommendationText;
    showToast('✍️ Interpretación clínica IA copiada al reporte imprimible del paciente.');
  }
}

window.openAiAssistantModal = openAiAssistantModal;
window.closeAiAssistantModal = closeAiAssistantModal;
window.switchAiAssistantTab = switchAiAssistantTab;
window.refreshAiAssistantHub = refreshAiAssistantHub;
window.handleAiSubstituteSearchSubmit = handleAiSubstituteSearchSubmit;
window.quickSearchAiSubstitute = quickSearchAiSubstitute;
window.addAiSuggestedProductToPosCart = addAiSuggestedProductToPosCart;
window.triggerInlinePosAiSuggestion = triggerInlinePosAiSuggestion;
window.printAiPurchaseOrderReport = printAiPurchaseOrderReport;
window.dispatchChronicMedicationToPos = dispatchChronicMedicationToPos;
window.triggerRegenerateAiMedicalKits = triggerRegenerateAiMedicalKits;
window.loadAiSeason = loadAiSeason;
window.handleAiCopilotFormSubmit = handleAiCopilotFormSubmit;
window.askAiPosCopilot = askAiPosCopilot;
window.applyAiVitalRecommendationToNotes = applyAiVitalRecommendationToNotes;

setTimeout(() => {
  refreshAiAssistantHub();
}, 900);


/* =========================================================================
   REACCIÓN 3D DE FARMA-IA EN EL POS (COPILOTO FARMACÉUTICO)
   ========================================================================= */
function triggerPosFarmaIa3dReaction() {
  if (window.farmaIaPos3D) {
    window.farmaIaPos3D.triggerSalute();
  } else {
    initPosFarmaIa3d();
  }
  const avatars = document.querySelectorAll('.farmaia-3d-avatar');
  avatars.forEach(img => {
    img.style.transform = 'scale(1.2) rotate(-3deg)';
    setTimeout(() => { img.style.transform = ''; }, 400);
  });
}


/* =========================================================================
   INICIALIZACIÓN DEL MODELO 3D EN EL POS FÍSICO
   ========================================================================= */
function initPosFarmaIa3d() {
  if (typeof FarmaIa3DViewer === 'undefined' || typeof THREE === 'undefined') return;
  if (!window.farmaIaPos3D && document.getElementById('farmaia-pos-3d-canvas')) {
    try {
      window.farmaIaPos3D = new FarmaIa3DViewer('farmaia-pos-3d-canvas', {
        width: 80,
        height: 80,
        interactive: true,
        initialMode: 'idle'
      });
    } catch (e) {
      console.warn('Error inicializando 3D POS:', e);
    }
  }
}


/* =========================================================================
   BANDEJA DE QUEJAS Y RECLAMOS DE CLIENTES ASISTIDAS POR IA (POS)
   ========================================================================= */

let posCurrentQuejasFilter = 'TODAS';

function openPosQuejasModal(initialFilter = 'TODAS') {
  const modal = document.getElementById('pos-quejas-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  loadPosQuejas(initialFilter);
}

function closePosQuejasModal() {
  const modal = document.getElementById('pos-quejas-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

async function loadPosQuejas(filterState = null) {
  if (filterState) posCurrentQuejasFilter = filterState;
  const fid = (sysState && sysState.authenticatedPharmacy) ? sysState.authenticatedPharmacy.id : 1;
  const container = document.getElementById('pos-quejas-list-container');
  if (!container) return;

  // Actualizar botones de filtro
  const filters = ['TODAS', 'PENDIENTE', 'EN_REVISION', 'RESUELTO'];
  filters.forEach(f => {
    const btn = document.getElementById(`pos-queja-filter-${f}`);
    if (btn) {
      if (f === posCurrentQuejasFilter) {
        btn.className = 'px-3 py-1.5 rounded-xl font-extrabold bg-slate-900 text-white transition';
      } else {
        btn.className = 'px-3 py-1.5 rounded-xl font-extrabold bg-white text-slate-700 hover:bg-slate-200 border border-slate-200 transition';
      }
    }
  });

  container.innerHTML = `
    <div class="p-8 text-center text-slate-500 space-y-2">
      <span class="inline-block w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></span>
      <p class="text-xs font-bold">Cargando quejas y reclamos clasificados por IA...</p>
    </div>
  `;

  try {
    const url = `/api/pos/quejas?farmacia_id=${fid}` + (posCurrentQuejasFilter !== 'TODAS' ? `&estado=${posCurrentQuejasFilter}` : '');
    const res = await fetch(url);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error cargando quejas');

    const quejas = data.quejas || [];
    const summary = data.summary || { pendientes: 0 };

    // Actualizar badges
    const badgeHeader = document.getElementById('pos-quejas-badge');
    if (badgeHeader) badgeHeader.textContent = summary.pendientes || 0;
    const badgeModal = document.getElementById('pos-quejas-modal-count-badge');
    if (badgeModal) badgeModal.textContent = `${summary.pendientes || 0} Pendientes`;

    if (quejas.length === 0) {
      container.innerHTML = `
        <div class="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 space-y-3">
          <span class="text-3xl">🎉</span>
          <h4 class="font-black text-slate-900 text-sm">¡No hay quejas en esta bandeja!</h4>
          <p class="text-xs text-slate-500 max-w-sm mx-auto">No se encontraron reclamos con el filtro seleccionado (${posCurrentQuejasFilter}). Todo opera con normalidad.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = quejas.map(q => {
      const isPending = q.estado === 'PENDIENTE';
      const isReview = q.estado === 'EN_REVISION';
      const isSolved = q.estado === 'RESUELTO';

      let gravedadBg = 'bg-amber-100 text-amber-900 border-amber-300';
      if (q.gravedad === 'URGENTE') gravedadBg = 'bg-rose-100 text-rose-900 border-rose-300';
      else if (q.gravedad === 'LEVE') gravedadBg = 'bg-teal-100 text-teal-900 border-teal-300';

      const telRaw = String(q.cliente_telefono || '').replace(/\D/g, '');
      const waLink = telRaw ? `https://wa.me/${telRaw}?text=${encodeURIComponent(`Hola ${q.cliente_nombre}, le escribimos de Farmacia Davalsi respecto a su reporte (${q.codigo_ticket}): `)}` : null;

      return `
        <div class="p-4 sm:p-5 bg-white rounded-2xl border ${isPending ? 'border-rose-300 shadow-md ring-1 ring-rose-200' : 'border-slate-200 shadow-xs'} space-y-3">
          <!-- Cabecera de la queja -->
          <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded-lg bg-slate-900 text-teal-300 font-mono font-black text-xs">
                ${q.codigo_ticket}
              </span>
              <span class="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase border ${gravedadBg}">
                ${q.gravedad}
              </span>
              <span class="text-xs font-extrabold text-slate-800">
                ${q.cliente_nombre}
              </span>
              ${q.cliente_telefono ? `<span class="text-[11px] text-slate-500">📞 ${q.cliente_telefono}</span>` : ''}
            </div>

            <div class="flex items-center gap-2">
              <span class="text-[11px] text-slate-400">🕒 ${q.fecha_hora}</span>
              ${waLink ? `
                <a href="${waLink}" target="_blank" class="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-[10px] flex items-center gap-1 shadow-xs transition" title="Contactar al paciente por WhatsApp">
                  <span>💬 WhatsApp</span>
                </a>
              ` : ''}
            </div>
          </div>

          <!-- Clasificación y Resumen Ejecutivo generado por FarmaIA -->
          <div class="p-3 rounded-xl bg-gradient-to-r from-slate-900 to-indigo-950 text-white space-y-1">
            <div class="flex items-center gap-1.5 text-[10px] font-black uppercase text-teal-300">
              <span>🤖</span> <span>ANÁLISIS DE LA IA • ÁREA: ${q.area}</span>
            </div>
            <p class="text-xs text-indigo-100 font-bold leading-relaxed">
              ${q.resumen_ia}
            </p>
          </div>

          <!-- Mensaje original del paciente -->
          <div class="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
            <span class="block text-[10px] font-black uppercase text-slate-400 mb-0.5">Mensaje Original del Paciente:</span>
            <p class="italic font-medium leading-relaxed">«${q.mensaje_original}»</p>
          </div>

          <!-- Resolución o respuesta administrativa -->
          <div class="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div class="flex items-center gap-2 flex-1 min-w-[260px]">
              <label class="text-[11px] font-bold text-slate-500">Estado:</label>
              <select id="pos-queja-select-${q.id}" class="px-2.5 py-1.5 rounded-xl border text-xs font-bold ${isPending ? 'border-rose-400 bg-rose-50 text-rose-900' : (isReview ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-emerald-400 bg-emerald-50 text-emerald-900')}">
                <option value="PENDIENTE" ${isPending ? 'selected' : ''}>⏳ Pendiente</option>
                <option value="EN_REVISION" ${isReview ? 'selected' : ''}>🔍 En Revisión</option>
                <option value="RESUELTO" ${isSolved ? 'selected' : ''}>✅ Resuelta / Solucionada</option>
              </select>
              <input id="pos-queja-note-${q.id}" type="text" placeholder="Nota de solución o medida tomada..." value="${q.respuesta_admin || ''}" class="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium" />
            </div>

            <button type="button" onclick="submitPosQuejaUpdate(${q.id})" class="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-xs transition cursor-pointer">
              Guardar
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `
      <div class="p-6 text-center bg-rose-50 rounded-2xl border border-rose-200 text-rose-700 text-xs font-bold">
        Error al cargar quejas: ${err.message}
      </div>
    `;
  }
}

async function submitPosQuejaUpdate(quejaId) {
  const fid = (sysState && sysState.authenticatedPharmacy) ? sysState.authenticatedPharmacy.id : 1;
  const select = document.getElementById(`pos-queja-select-${quejaId}`);
  const noteInp = document.getElementById(`pos-queja-note-${quejaId}`);
  if (!select) return;

  const newStatus = select.value;
  const adminNote = noteInp ? noteInp.value.trim() : '';

  try {
    const res = await fetch('/api/pos/quejas/actualizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: fid,
        queja_id: quejaId,
        estado: newStatus,
        respuesta_admin: adminNote
      })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al actualizar');

    showToast(`Queja ${data.queja.codigo_ticket} actualizada a: ${newStatus}`);
    loadPosQuejas();
  } catch (err) {
    showToast('Error al actualizar queja: ' + err.message, 'error');
  }
}

async function refreshPosQuejasBadge() {
  const fid = (sysState && sysState.authenticatedPharmacy) ? sysState.authenticatedPharmacy.id : 1;
  try {
    const res = await fetch(`/api/pos/quejas?farmacia_id=${fid}&estado=PENDIENTE`);
    const data = await res.json();
    if (data.ok && data.summary) {
      const badgeHeader = document.getElementById('pos-quejas-badge');
      if (badgeHeader) {
        badgeHeader.textContent = data.summary.pendientes || 0;
        if (data.summary.pendientes > 0) {
          badgeHeader.className = 'px-1.5 py-0.2 bg-rose-500 text-white font-black rounded-full text-[10px] animate-bounce';
        } else {
          badgeHeader.className = 'px-1.5 py-0.2 bg-white text-rose-900 font-black rounded-full text-[10px]';
        }
      }
    }
  } catch (e) {}
}

setInterval(refreshPosQuejasBadge, 12000);
setTimeout(refreshPosQuejasBadge, 1500);

window.openPosQuejasModal = openPosQuejasModal;
window.closePosQuejasModal = closePosQuejasModal;
window.loadPosQuejas = loadPosQuejas;
window.submitPosQuejaUpdate = submitPosQuejaUpdate;
window.refreshPosQuejasBadge = refreshPosQuejasBadge;


// =========================================================================
// MÓDULO DE ALERGIAS FARMACOLÓGICAS Y OCR DE RECETAS MÉDICAS (FARMAIA)
// =========================================================================

// Caché local de alergias por cédula
window.patientAllergiesCache = {};
window.currentOcrReceta = null;

// 1. Consultar y verificar alergias del paciente por Cédula
async function checkPosPatientAllergies(cedula) {
  const cleanCed = (cedula || '').trim();
  const alertBox = document.getElementById('pos-patient-allergy-alert');
  const alertText = document.getElementById('pos-patient-allergy-text');
  if (!cleanCed || cleanCed.length < 3) {
    if (alertBox) alertBox.classList.add('hidden');
    return;
  }

  try {
    const f = sysState.authenticatedPharmacy || { id: 1 };
    const res = await fetch(`/api/paciente/alergias?farmacia_id=${f.id || 1}&cedula=${encodeURIComponent(cleanCed)}`);
    const data = await res.json();
    if (data.ok && data.alergias && data.alergias.length > 0) {
      window.patientAllergiesCache[cleanCed] = data.alergias;
      const descList = data.alergias.map(a => `${a.alergia_tipo} (${a.descripcion_alergia || a.reaccion_severidad})`).join(' • ');
      if (alertText) alertText.textContent = `ALERGIA CONFIRMADA: ${descList}`;
      if (alertBox) {
        alertBox.classList.remove('hidden');
        alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      showToast(`⚠️ Paciente con Alergia Registrada: ${data.alergias[0].alergia_tipo}`, 'error');
    } else {
      window.patientAllergiesCache[cleanCed] = [];
      if (alertBox) alertBox.classList.add('hidden');
    }
  } catch (err) {
    console.error('Error al verificar alergias:', err);
  }
}

// Validación síncrona o con reglas clínicas locales
window.checkProductAllergyConflictSync = function(cedula, productName, activeIngredient) {
  const cleanCed = (cedula || '').trim();
  const allergies = window.patientAllergiesCache[cleanCed] || [];
  if (!allergies.length) return { blocked: false };

  const norm = (s) => (s || '').toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u');

  const target = norm(`${productName} ${activeIngredient}`);

  const RULES = {
    'PENICILINAS': {
      nombre_grupo: 'Penicilinas y Betalactámicos',
      terminos: ['amoxicilina', 'ampicilina', 'penicilina', 'oxacilina', 'dicloxacilina', 'sultamicilina', 'clavulanato', 'clavulanico', 'augmentin', 'amoxil', 'amoxicillin', 'ampicillin'],
      severidad: 'SEVERA / ANAFILAXIS',
      alternativas: [
        { nombre: 'Azitromicina 500mg (Tratamiento 3 Días)', principio: 'Azitromicina', motivo: 'Macrólido seguro sin reactividad cruzada con betalactámicos', precio: 45.0 }
      ]
    },
    'SULFAS': {
      nombre_grupo: 'Sulfas y Sulfonamidas',
      terminos: ['trimetoprim', 'sulfametoxazol', 'bactrim', 'sulfadiazina', 'sulfasalazina', 'sulfisoxazol', 'sulfa', 'cotrimoxazol'],
      severidad: 'SEVERA / SHOCK',
      alternativas: [
        { nombre: 'Nitrofurantoína 100mg (Macrodantina)', principio: 'Nitrofurantoína', motivo: 'Antiséptico urinario seguro sin sulfonamidas', precio: 22.0 }
      ]
    },
    'AINES': {
      nombre_grupo: 'AINEs (Antiinflamatorios)',
      terminos: ['ibuprofeno', 'diclofenac', 'diclofenaco', 'ketoprofeno', 'naproxeno', 'ketorolaco', 'aspirina', 'acido acetilsalicilico'],
      severidad: 'MODERADA / BRONCOESPASMO',
      alternativas: [
        { nombre: 'Acetaminofén 500mg', principio: 'Paracetamol', motivo: 'Analgésico / antipirético seguro de primera línea', precio: 8.0 }
      ]
    }
  };

  for (const al of allergies) {
    const tipo = (al.alergia_tipo || '').toUpperCase();
    const rule = RULES[tipo];
    if (rule) {
      for (const t of rule.terminos) {
        if (target.includes(t)) {
          return {
            blocked: true,
            alergia_tipo: tipo,
            nombre_grupo: rule.nombre_grupo,
            severidad: rule.severidad,
            termino_coincidente: t,
            alternativas: rule.alternativas,
            mensaje: `El paciente tiene registrada ALERGIA A ${rule.nombre_grupo}. Despachar este medicamento presenta riesgo de ${rule.severidad}.`
          };
        }
      }
    }
  }
  return { blocked: false };
};

// Modal de Bloqueo de Seguridad por Alergia
window.showPosAllergyBlockModal = function(product, conflict) {
  const modal = document.getElementById('pos-allergy-block-modal');
  if (!modal) {
    alert(`⛔ BLOQUEO POR ALERGIA: ${conflict.mensaje}`);
    return;
  }
  const patientInp = document.getElementById('pos-client-name');
  const cedulaInp = document.getElementById('pos-client-cedula');
  const pInfo = document.getElementById('pos-allergy-modal-patient-info');
  const pReason = document.getElementById('pos-allergy-modal-reason');
  const altList = document.getElementById('pos-allergy-alternatives-list');

  if (pInfo) pInfo.textContent = `Paciente: ${patientInp ? patientInp.value : 'Cliente'} (Cédula: ${cedulaInp ? cedulaInp.value : 'N/A'})`;
  if (pReason) {
    pReason.innerHTML = `
      <p class="font-black text-rose-800 text-sm">⛔ Medicamento Bloqueado: ${product.nombre_comercial} (${product.principio_activo})</p>
      <p class="text-xs text-rose-950 mt-1">${conflict.mensaje}</p>
    `;
  }

  if (altList) {
    if (conflict.alternativas && conflict.alternativas.length > 0) {
      altList.innerHTML = conflict.alternativas.map(alt => `
        <div class="p-3 rounded-xl bg-teal-50 border border-teal-300 flex items-center justify-between shadow-xs">
          <div>
            <p class="font-extrabold text-teal-950 text-xs">✅ ${alt.nombre}</p>
            <p class="text-[10px] text-teal-700">${alt.motivo || 'Alternativa segura'}</p>
          </div>
          <button type="button" onclick='substituteWithSafeAlternative(${JSON.stringify(alt)})' class="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-black text-xs transition cursor-pointer shadow-xs shrink-0">
            🔄 Despachar Alternativa
          </button>
        </div>
      `).join('');
    } else {
      altList.innerHTML = `<p class="text-xs text-slate-500 italic">Consulte con el regente farmacéutico una alternativa adecuada.</p>`;
    }
  }

  modal.classList.remove('hidden');
};

window.closePosAllergyBlockModal = function() {
  const modal = document.getElementById('pos-allergy-block-modal');
  if (modal) modal.classList.add('hidden');
};

window.substituteWithSafeAlternative = function(alt) {
  closePosAllergyBlockModal();
  // Buscar en catálogo de productos
  const match = sysState.products.find(p => 
    p.nombre_comercial.toLowerCase().includes(alt.principio.toLowerCase()) ||
    p.principio_activo.toLowerCase().includes(alt.principio.toLowerCase())
  );
  if (match) {
    addProductToPosCart(match, 'UNIDAD');
    showToast(`🔄 Alternativa segura cargada: ${match.nombre_comercial}`, 'success');
  } else {
    showToast(`Alternativa ${alt.nombre} recomendada. Búsquela en el catálogo general.`, 'info');
  }
};

// 2. Módulo OCR de Recetas Médicas
window.openPosRecetaOcrModal = function() {
  const modal = document.getElementById('pos-receta-ocr-modal');
  if (modal) modal.classList.remove('hidden');
};

window.closePosRecetaOcrModal = function() {
  const modal = document.getElementById('pos-receta-ocr-modal');
  if (modal) modal.classList.add('hidden');
};

window.executeDemoRecetaOcr = async function(demoFilename) {
  const loading = document.getElementById('pos-ocr-loading');
  const results = document.getElementById('pos-ocr-results');
  const btnPreload = document.getElementById('pos-ocr-btn-precargar');
  if (loading) loading.classList.remove('hidden');
  if (results) results.classList.add('hidden');
  if (btnPreload) btnPreload.classList.add('hidden');

  try {
    const f = sysState.authenticatedPharmacy || { id: 1 };
    const res = await fetch('/api/receta/ocr-procesar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: f.id || 1,
        image_data: demoFilename,
        patient_cedula: ''
      })
    });
    const data = await res.json();
    renderPosOcrResults(data);
  } catch (err) {
    showToast('Error al procesar receta OCR: ' + err.message, 'error');
  } finally {
    if (loading) loading.classList.add('hidden');
  }
};

window.handleRecetaCustomFile = function(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = async function(e) {
    const base64 = e.target.result;
    const loading = document.getElementById('pos-ocr-loading');
    const results = document.getElementById('pos-ocr-results');
    const btnPreload = document.getElementById('pos-ocr-btn-precargar');
    if (loading) loading.classList.remove('hidden');
    if (results) results.classList.add('hidden');
    if (btnPreload) btnPreload.classList.add('hidden');

    try {
      const f = sysState.authenticatedPharmacy || { id: 1 };
      const currentCed = (document.getElementById('pos-client-cedula')?.value || '').trim();
      const res = await fetch('/api/receta/ocr-procesar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farmacia_id: f.id || 1,
          image_data: base64,
          patient_cedula: currentCed
        })
      });
      const data = await res.json();
      renderPosOcrResults(data);
    } catch (err) {
      showToast('Error al procesar imagen: ' + err.message, 'error');
    } finally {
      if (loading) loading.classList.add('hidden');
    }
  };
  reader.readAsDataURL(file);
};

function renderPosOcrResults(data) {
  if (!data.ok) {
    showToast('No se pudo interpretar la receta.', 'error');
    return;
  }
  window.currentOcrReceta = data;

  const results = document.getElementById('pos-ocr-results');
  const docName = document.getElementById('pos-ocr-doctor-name');
  const docInfo = document.getElementById('pos-ocr-doctor-info');
  const patName = document.getElementById('pos-ocr-patient-name');
  const diagInfo = document.getElementById('pos-ocr-diagnosis');
  const tbody = document.getElementById('pos-ocr-table-body');
  const sumCard = document.getElementById('pos-ocr-summary-card');
  const sumText = document.getElementById('pos-ocr-summary-text');
  const btnPreload = document.getElementById('pos-ocr-btn-precargar');

  if (docName) docName.textContent = data.medico?.nombre || 'Médico Tratante';
  if (docInfo) docInfo.textContent = `Exeq: ${data.medico?.exequatur || 'N/A'} • ${data.medico?.centro || 'Centro de Salud'}`;
  if (patName) patName.textContent = `${data.paciente?.nombre || 'Paciente'} (Céd: ${data.paciente?.cedula || 'N/A'})`;
  if (diagInfo) diagInfo.textContent = `Diagnóstico: ${data.medico?.diagnostico || 'Evaluación médica'}`;

  let approvedCount = 0;
  if (tbody) {
    tbody.innerHTML = (data.medicamentos_prescritos || []).map(m => {
      const isBlocked = m.alerta_alergia;
      if (!isBlocked && m.en_stock) approvedCount++;
      return `
        <tr class="${isBlocked ? 'bg-rose-50/70 border-l-4 border-l-rose-500' : 'hover:bg-slate-50'}">
          <td class="p-3">
            <p class="font-extrabold text-slate-900">${m.nombre_recetado}</p>
            <p class="text-[10px] text-slate-500 font-mono">Principio: ${m.principio_activo} • ${m.dosis}</p>
            ${isBlocked ? `
              <p class="text-[11px] font-extrabold text-rose-700 mt-1">${m.motivo_seguridad}</p>
              ${m.alternativas_seguras && m.alternativas_seguras.length ? `
                <div class="mt-1 flex items-center gap-1.5">
                  <span class="text-[10px] font-bold text-teal-800">Sugerencia segura:</span>
                  <span class="px-2 py-0.5 rounded bg-teal-100 text-teal-900 font-extrabold text-[10px]">${m.alternativas_seguras[0].nombre}</span>
                </div>
              ` : ''}
            ` : ''}
          </td>
          <td class="p-3 text-slate-600">${m.posologia}</td>
          <td class="p-3">
            <p class="font-mono font-bold text-slate-900">RD$ ${(m.precio_unitario * 60).toFixed(2)}</p>
            <p class="text-[10px] ${m.en_stock ? 'text-emerald-600 font-bold' : 'text-rose-600 font-black'}">
              ${m.en_stock ? `Stock: ${m.stock_disponible} unid.` : 'Agotado'}
            </p>
          </td>
          <td class="p-3 text-center">
            ${isBlocked ? `
              <span class="px-2.5 py-1 rounded-full bg-rose-600 text-white font-black text-[10px] tracking-wide inline-flex items-center gap-1 shadow-xs">
                <span>⛔</span> <span>BLOQUEADO POR ALERGIA</span>
              </span>
            ` : `
              <span class="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-black text-[10px] tracking-wide inline-flex items-center gap-1">
                <span>✅</span> <span>SEGURO</span>
              </span>
            `}
          </td>
          <td class="p-3 text-right">
            ${isBlocked ? `
              <span class="text-[10px] text-rose-600 font-bold italic">Despacho no permitido</span>
            ` : `
              <span class="text-[10px] text-emerald-700 font-bold">Listo para agregar</span>
            `}
          </td>
        </tr>
      `;
    }).join('');
  }

  if (sumCard && sumText) {
    sumText.textContent = data.resumen_ia || '';
    if (data.bloqueos_alergia_count > 0) {
      sumCard.className = 'p-3.5 rounded-2xl bg-rose-50 border-2 border-rose-400 text-rose-900 text-xs flex items-center justify-between shadow-xs';
    } else {
      sumCard.className = 'p-3.5 rounded-2xl bg-emerald-50 border-2 border-emerald-400 text-emerald-900 text-xs flex items-center justify-between shadow-xs';
    }
  }

  if (btnPreload) {
    btnPreload.classList.remove('hidden');
    btnPreload.innerHTML = `<span>🛒 Precargar en Carrito POS (${approvedCount} Medicamento${approvedCount === 1 ? '' : 's'})</span>`;
  }
  if (results) results.classList.remove('hidden');
}

window.preloadOcrItemsToPosCart = function() {
  if (!window.currentOcrReceta) return;
  const data = window.currentOcrReceta;

  // Llenar datos de paciente en formulario
  if (data.paciente) {
    const nameInp = document.getElementById('pos-client-name');
    const cedInp = document.getElementById('pos-client-cedula');
    if (nameInp && data.paciente.nombre) nameInp.value = data.paciente.nombre;
    if (cedInp && data.paciente.cedula) {
      cedInp.value = data.paciente.cedula;
      checkPosPatientAllergies(data.paciente.cedula);
    }
  }

  // Agregar ítems aprobados (no alérgicos y con stock)
  let countAdded = 0;
  for (const m of (data.medicamentos_prescritos || [])) {
    if (!m.alerta_alergia && m.producto_id) {
      const p = sysState.products.find(x => x.id === m.producto_id);
      if (p) {
        const existing = sysState.posCart.find(i => i.product.id === p.id);
        if (existing) existing.cantidad += 1;
        else sysState.posCart.push({ product: p, presentacion: 'UNIDAD', cantidad: 1 });
        countAdded++;
      }
    }
  }

  renderPosCart();
  closePosRecetaOcrModal();
  showToast(`✅ Receta precargada con éxito: ${countAdded} medicamento(s) seguro(s) en carrito.`, 'success');
};


// =========================================================================
// 1. LECTOR DE CÓDIGO DE BARRAS GLOBAL (HARDWARE SCANNER LISTENER HID)
// =========================================================================

let globalBarcodeBuffer = '';
let lastGlobalBarcodeTime = 0;

// Reproductor de Beep POS con Web Audio API
function playPosScanBeep(isError = false) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (isError) {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, ctx.currentTime); // Beep agudo y limpio POS
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    }
  } catch(e) {
    console.warn('AudioContext no disponible:', e);
  }
}

// Listener de Hardware en Toda la Pantalla
window.addEventListener('keydown', (e) => {
  // Ignorar si el usuario está activamente en un campo de texto largo (textarea)
  const activeEl = document.activeElement;
  const isInputOrTextArea = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

  const now = performance.now();
  const diff = now - lastGlobalBarcodeTime;
  lastGlobalBarcodeTime = now;

  // Los lectores de códigos de barras envían ráfagas muy rápidas (< 70ms entre caracteres)
  if (e.key === 'Enter') {
    if (globalBarcodeBuffer.length >= 6) {
      e.preventDefault();
      e.stopPropagation();
      const code = globalBarcodeBuffer.trim();
      globalBarcodeBuffer = '';
      processGlobalBarcodeScanned(code);
      return;
    }
    globalBarcodeBuffer = '';
    return;
  }

  // Filtrar teclas modificadoras
  if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (diff > 90) {
      // Reiniciar buffer si la velocidad indica tecleo humano
      globalBarcodeBuffer = e.key;
    } else {
      globalBarcodeBuffer += e.key;
    }
  }
}, true);

// Procesar el código escaneado globalmente
function processGlobalBarcodeScanned(barcode) {
  playPosScanBeep(false);

  // Efecto visual en indicador de escáner
  const statusEl = document.getElementById('pos-global-scanner-text');
  if (statusEl) {
    statusEl.textContent = `⚡ Escaneado: ${barcode}`;
    setTimeout(() => {
      statusEl.textContent = '⚡ Lector Pistola Activo';
    }, 3000);
  }

  const p = sysState.products.find(x => 
    (x.codigo_barras && x.codigo_barras.trim() === barcode) ||
    (x.lote && x.lote.trim() === barcode)
  );

  if (!p) {
    playPosScanBeep(true);
    showToast(`Código de barra '${barcode}' no encontrado en catálogo.`, 'error');
    return;
  }

  // Validar si el lote está vencido
  if (p.vencimiento && p.vencimiento.vencido) {
    playPosScanBeep(true);
    showToast(`⛔ BLOQUEO SANITARIO: El lote ${p.lote} de '${p.nombre_comercial}' está VENCIDO.`, 'error');
    return;
  }

  // Validar si el paciente actual tiene conflicto alérgico con este producto
  const currentCedula = (document.getElementById('pos-client-cedula')?.value || '').trim();
  if (currentCedula && window.checkProductAllergyConflictSync) {
    const conflict = window.checkProductAllergyConflictSync(currentCedula, p.nombre_comercial, p.principio_activo);
    if (conflict && conflict.blocked) {
      playPosScanBeep(true);
      window.showPosAllergyBlockModal(p, conflict);
      return;
    }
  }

  // Agregar al carrito
  addProductToPosCart(p, 'UNIDAD');
  showToast(`⚡ Escáner Global: ${p.nombre_comercial} (RD$ ${(p.precio_base * 60).toFixed(2)})`, 'success');
}


// =========================================================================
// 2. IMPRESIÓN TÉRMICA DIRECTA (ESC/POS 58mm / 80mm) Y GAVETA RJ11
// =========================================================================

window.openPosThermalPrinterModal = function() {
  const modal = document.getElementById('pos-thermal-printer-modal');
  if (modal) {
    modal.classList.remove('hidden');
    refreshThermalPreviewSample();
  }
};

window.closePosThermalPrinterModal = function() {
  const modal = document.getElementById('pos-thermal-printer-modal');
  if (modal) modal.classList.add('hidden');
};

async function openPosCashDrawerDirect() {
  try {
    const f = sysState.authenticatedPharmacy || { id: 1 };
    const res = await fetch('/api/pos/abrir-gaveta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmacia_id: f.id || 1 })
    });
    const data = await res.json();
    playPosScanBeep(false);
    showToast('🔓 Pulso ESC/POS enviado: Gaveta de dinero abierta.', 'success');
  } catch (err) {
    showToast('Error al abrir gaveta: ' + err.message, 'error');
  }
}

async function printTestThermalTicket() {
  const pWidth = document.getElementById('thermal-setting-width')?.value || '80mm';
  try {
    const f = sysState.authenticatedPharmacy || { id: 1 };
    const res = await fetch('/api/pos/imprimir-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: f.id || 1,
        paper_width: pWidth,
        open_drawer: true,
        ticket_data: {
          tipo: 'TICKET DE PRUEBA ESC/POS DIRECTO',
          codigo: 'TST-' + Date.now().toString().slice(-6),
          cajero: 'Cajero Principal',
          cliente: 'Prueba de Impresión Térmica Directa',
          items: [
            { cantidad: 1, nombre: 'Prueba Ticket Térmico 80mm', precio: 150.0 },
            { cantidad: 2, nombre: 'Papel Térmico de Alta Durabilidad', precio: 50.0 }
          ],
          metodo_pago: 'EFECTIVO PESOS (DOP)',
          monto_recibido: 300.0
        }
      })
    });
    const data = await res.json();
    if (data.ok) {
      const container = document.getElementById('thermal-preview-container');
      if (container) container.textContent = data.text_preview || 'Ticket generado';
      playPosScanBeep(false);
      showToast('🖨️ Ticket impreso directamente sin diálogo de Windows.', 'success');
    }
  } catch (err) {
    showToast('Error al imprimir ticket térmico: ' + err.message, 'error');
  }
}

function refreshThermalPreviewSample() {
  const container = document.getElementById('thermal-preview-container');
  if (!container) return;
  const pWidth = document.getElementById('thermal-setting-width')?.value || '80mm';
  const cols = pWidth === '80mm' ? 48 : 32;
  const sep = '='.repeat(cols);
  container.textContent = `
       FARMACIA DAVALSI
RNC: 131-98234-1 • Registro #2026
Av. Independencia #104, Santo Domingo
${sep}
*** TICKET DIRECTO ESC/POS (${pWidth}) ***
No. Comprobante: B02-0004921
Fecha: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
Cajero: Personal de Mostrador
${'-'.repeat(cols)}
CANT  DESCRIPCIÓN             TOTAL
${'-'.repeat(cols)}
1     Amoxicilina 500mg    RD$  20.00
2     Paracetamol 500mg    RD$  16.00
${'-'.repeat(cols)}
TOTAL EN PESOS:            RD$  36.00
TOTAL EN DÓLARES:           $    0.60
FORMA DE PAGO: EFECTIVO
${sep}
🩺 FarmaIA: Verificación Clínica Activa
  [Corte de Papel Automático]
  [Pulso Gaveta RJ11: OK]
`;
}


// =========================================================================
// 3. MÓDULO DE ARQUEO Y CIERRE DE CAJA (CORTE X Y Z) MULTIMONEDA
// =========================================================================

window.cajaActiveShift = null;

window.openPosCajaModal = async function() {
  const modal = document.getElementById('pos-caja-modal');
  if (modal) modal.classList.remove('hidden');
  await loadCajaShiftSummary();
};

window.closePosCajaModal = function() {
  const modal = document.getElementById('pos-caja-modal');
  if (modal) modal.classList.add('hidden');
};

async function loadCajaShiftSummary() {
  try {
    const f = sysState.authenticatedPharmacy || { id: 1 };
    const res = await fetch(`/api/pos/caja/resumen?farmacia_id=${f.id || 1}`);
    const data = await res.json();
    window.cajaActiveShift = data;

    const fondoDopEl = document.getElementById('caja-fondo-dop');
    const fondoUsdEl = document.getElementById('caja-fondo-usd');
    const ventasEfecEl = document.getElementById('caja-ventas-efectivo');
    const ventasUsdEl = document.getElementById('caja-ventas-usd');
    const ventasBancosEl = document.getElementById('caja-ventas-bancos');
    const totalTxEl = document.getElementById('caja-total-tx');
    const totalEspEl = document.getElementById('caja-total-esperado');

    if (fondoDopEl) fondoDopEl.textContent = `RD$ ${(data.fondo_inicial.dop).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (fondoUsdEl) fondoUsdEl.textContent = `+ $${(data.fondo_inicial.usd).toFixed(2)} USD`;

    if (ventasEfecEl) ventasEfecEl.textContent = `RD$ ${(data.ventas.efectivo_dop).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (ventasUsdEl) ventasUsdEl.textContent = `$${(data.ventas.efectivo_usd).toFixed(2)} USD recibidos`;

    if (ventasBancosEl) ventasBancosEl.textContent = `RD$ ${(data.ventas.tarjeta_dop + data.ventas.transferencia_dop).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (totalTxEl) totalTxEl.textContent = `${data.total_transacciones} transacciones hoy`;

    if (totalEspEl) totalEspEl.textContent = `RD$ ${(data.total_esperado_gaveta_dop).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    recalculateCajaCounting();
  } catch (err) {
    showToast('Error al cargar datos de caja: ' + err.message, 'error');
  }
}

function recalculateCajaCounting() {
  const tasaInp = document.getElementById('caja-tasa-usd');
  const tasa = parseFloat(tasaInp ? tasaInp.value : 60.0) || 60.0;

  let totalDop = 0;
  let totalUsd = 0;

  const billInputs = document.querySelectorAll('.caja-bill-inp');
  billInputs.forEach(inp => {
    const val = parseFloat(inp.getAttribute('data-val') || 0);
    const cur = inp.getAttribute('data-cur');
    const count = parseInt(inp.value || 0, 10);
    if (count > 0) {
      if (cur === 'USD') {
        totalUsd += (val * count);
      } else {
        totalDop += (val * count);
      }
    }
  });

  const subDopBadge = document.getElementById('caja-subtotal-dop-badge');
  const subUsdBadge = document.getElementById('caja-subtotal-usd-badge');
  if (subDopBadge) subDopBadge.textContent = `RD$ ${totalDop.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  if (subUsdBadge) subUsdBadge.textContent = `$ ${totalUsd.toFixed(2)} USD (= RD$ ${(totalUsd * tasa).toFixed(2)})`;

  const totalContadoConsolidado = totalDop + (totalUsd * tasa);
  const totalEsperado = window.cajaActiveShift ? window.cajaActiveShift.total_esperado_gaveta_dop : 6000.0;
  const diferencia = totalContadoConsolidado - totalEsperado;

  const card = document.getElementById('caja-diferencia-card');
  const title = document.getElementById('caja-diferencia-title');
  const desc = document.getElementById('caja-diferencia-desc');
  const amount = document.getElementById('caja-diferencia-amount');
  const icon = document.getElementById('caja-diferencia-icon');

  if (desc) desc.textContent = `Total Físico Contado: RD$ ${totalContadoConsolidado.toLocaleString('en-US', { minimumFractionDigits: 2 })} • Esperado en Gaveta: RD$ ${totalEsperado.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const difFormatted = Math.abs(diferencia).toLocaleString('en-US', { minimumFractionDigits: 2 });

  if (totalContadoConsolidado === 0) {
    if (card) card.className = 'p-4 rounded-2xl bg-slate-100 border-2 border-slate-300 flex items-center justify-between text-xs';
    if (title) title.textContent = 'ESTADO DEL CUADRE: INGRESA EL CONTEO DE BILLETES';
    if (amount) {
      amount.textContent = 'RD$ 0.00';
      amount.className = 'text-base font-black font-mono text-slate-700';
    }
    if (icon) icon.textContent = '⚖️';
  } else if (Math.abs(diferencia) <= 1.0) {
    if (card) card.className = 'p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-500 flex items-center justify-between text-xs animate-pulse';
    if (title) title.textContent = '✅ CAJA CUADRADA EXACTA (SIN DIFERENCIAS)';
    if (amount) {
      amount.textContent = 'RD$ 0.00';
      amount.className = 'text-base font-black font-mono text-emerald-800';
    }
    if (icon) icon.textContent = '🎯';
  } else if (diferencia > 1.0) {
    if (card) card.className = 'p-4 rounded-2xl bg-amber-50 border-2 border-amber-500 flex items-center justify-between text-xs';
    if (title) title.textContent = '⚠️ SOBRANTE DE DINERO EN CAJA';
    if (amount) {
      amount.textContent = `+RD$ ${difFormatted}`;
      amount.className = 'text-base font-black font-mono text-amber-900';
    }
    if (icon) icon.textContent = '💵';
  } else {
    if (card) card.className = 'p-4 rounded-2xl bg-rose-50 border-2 border-rose-500 flex items-center justify-between text-xs';
    if (title) title.textContent = '⛔ FALTANTE DE DINERO EN CAJA';
    if (amount) {
      amount.textContent = `-RD$ ${difFormatted}`;
      amount.className = 'text-base font-black font-mono text-rose-900';
    }
    if (icon) icon.textContent = '🚨';
  }
}

function autoFillCajaBalanced() {
  const esperado = window.cajaActiveShift ? window.cajaActiveShift.total_esperado_gaveta_dop : 6000.0;
  // Fondo base: $50 USD (= RD$ 3,000) + RD$ 3,000 pesos
  const billInputs = document.querySelectorAll('.caja-bill-inp');
  billInputs.forEach(inp => {
    const val = inp.getAttribute('data-val');
    const cur = inp.getAttribute('data-cur');
    if (cur === 'USD' && val === '50') inp.value = 1;
    else if (cur === 'DOP' && val === '1000') inp.value = 3;
    else inp.value = 0;
  });
  recalculateCajaCounting();
  showToast('⚡ Conteo de prueba cuadrado completado.', 'info');
}

async function executeCajaCorte(tipoCorte) {
  const isCorteZ = (tipoCorte === 'CORTE_Z');
  const confirmMsg = isCorteZ
    ? '¿Estás seguro de emitir el CORTE Z FISCAL DEFINITIVO? Esto cerrará el turno, abrirá la gaveta e imprimirá el comprobante final de auditoría.'
    : '¿Deseas emitir un CORTE X (Arqueo Parcial)? Se generará la auditoría sin cerrar el turno ni alterar contadores.';

  if (!confirm(confirmMsg)) return;

  const tasaInp = document.getElementById('caja-tasa-usd');
  const tasa = parseFloat(tasaInp ? tasaInp.value : 60.0) || 60.0;
  const obsInp = document.getElementById('caja-observaciones-inp');
  const paperW = document.getElementById('caja-paper-width')?.value || '80mm';

  // Recolectar desglose
  let totalDop = 0;
  let totalUsd = 0;
  const desglose = { DOP: {}, USD: {} };

  const billInputs = document.querySelectorAll('.caja-bill-inp');
  billInputs.forEach(inp => {
    const val = inp.getAttribute('data-val');
    const cur = inp.getAttribute('data-cur');
    const count = parseInt(inp.value || 0, 10);
    if (count > 0) {
      desglose[cur][val] = count;
      if (cur === 'USD') totalUsd += (parseFloat(val) * count);
      else totalDop += (parseFloat(val) * count);
    }
  });

  try {
    const f = sysState.authenticatedPharmacy || { id: 1 };
    const res = await fetch('/api/pos/caja/corte', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: f.id || 1,
        tipo_corte: tipoCorte,
        cajero_nombre: 'Eliot Farmacéutico',
        tasa_cambio_usd: tasa,
        conteo_fisico_dop: totalDop,
        conteo_fisico_usd: totalUsd,
        desglose_billetes: desglose,
        observaciones: obsInp ? obsInp.value : '',
        paper_width: paperW,
        open_drawer: isCorteZ
      })
    });

    const data = await res.json();
    playPosScanBeep(false);

    // Si fue corte Z, abrir gaveta con sonido
    if (isCorteZ) {
      showToast('🔓 Gaveta de dinero abierta automáticamente para entrega de turno.', 'success');
    }

    alert(`✅ ${tipoCorte} GENERADO CON ÉXITO
Código: ${data.codigo_cierre}
Estado: ${data.estado_cuadre}
Diferencia: RD$ ${data.diferencia_dop}

Ticket fiscal enviado a la impresora térmica.`);
    closePosCajaModal();

    // Actualizar vista previa en el modal de impresora
    const previewContainer = document.getElementById('thermal-preview-container');
    if (previewContainer && data.ticket_escpos) {
      previewContainer.textContent = data.ticket_escpos.text_preview;
    }
  } catch (err) {
    showToast(`Error al emitir ${tipoCorte}: ` + err.message, 'error');
  }
}

window.recalculateCajaCounting = recalculateCajaCounting;
window.autoFillCajaBalanced = autoFillCajaBalanced;
window.executeCajaCorte = executeCajaCorte;
window.openPosCashDrawerDirect = openPosCashDrawerDirect;
window.printTestThermalTicket = printTestThermalTicket;


// ============================================================================
// GESTIÓN DE NOTIFICACIONES WHATSAPP DE 5 DÍAS & MONITOR DE DELIVERY EN VIVO
// ============================================================================

async function triggerAllChronic5dWhatsAppAlerts() {
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const farmaciaId = Number(f.id || 1);

  if (!confirm('¿Desea escanear y enviar automáticamente las alertas de WhatsApp a todos los pacientes crónicos a los que les queden 5 días o menos de tratamiento?')) {
    return;
  }

  showToast('🔍 Escaneando pacientes crónicos con ≤ 5 días...', 'info');

  try {
    const res = await fetch('/api/whatsapp/cronicos-5d/disparar-todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmacia_id: farmaciaId })
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al disparar alertas');

    if (data.total_alertas_5d_enviadas === 0) {
      alert('ℹ️ No hay pacientes crónicos con 5 días o menos de medicación pendiente.');
    } else {
      let resumen = `✅ Se enviaron ${data.total_alertas_5d_enviadas} alertas de WhatsApp:

`;
      data.alertas.forEach(a => {
        resumen += `• ${a.paciente_nombre} (${a.medicamento}) — Quedan ${a.dias_restantes} días
`;
      });
      alert(resumen);
      loadChronicPatients();
    }
  } catch (err) {
    showToast('Error al enviar alertas: ' + err.message, 'error');
  }
}

async function sendChronic5dWhatsApp(patientId) {
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const farmaciaId = Number(f.id || 1);

  try {
    const res = await fetch('/api/whatsapp/enviar-alerta-cronico', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: farmaciaId,
        paciente_cronico_id: patientId
      })
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'No se pudo generar la alerta');

    const msg = data.alerta;
    if (msg && msg.wa_link) {
      window.open(msg.wa_link, '_blank');
      showToast(`📲 Alerta abierta para ${msg.paciente_nombre} (5 días restantes)`, 'success');
    } else {
      showToast('Alerta enviada correctamente.', 'success');
    }
  } catch (err) {
    showToast('Error al enviar WhatsApp: ' + err.message, 'error');
  }
}

// ----------------- MONITOR DE DELIVERY POS -----------------
let posDeliveryLeafletMap = null;
let posDeliveryCourierMarker = null;
let posDeliveryInterval = null;
let activePosDeliveryOrderCode = 'ORD-DAV-202610-88';

async function openPosDeliveryTrackingModal(codigoOrden) {
  const code = codigoOrden || activePosDeliveryOrderCode;
  activePosDeliveryOrderCode = code;

  const modal = document.getElementById('pos-delivery-tracking-modal');
  if (modal) modal.classList.remove('hidden');

  await refreshPosDeliveryTrackingData(code);
}

function closePosDeliveryTrackingModal() {
  const modal = document.getElementById('pos-delivery-tracking-modal');
  if (modal) modal.classList.add('hidden');
  if (posDeliveryInterval) {
    clearInterval(posDeliveryInterval);
    posDeliveryInterval = null;
  }
}

async function refreshPosDeliveryTrackingData(codigoOrden) {
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const farmaciaId = Number(f.id || 1);

  try {
    const res = await fetch(`/api/delivery/tracking?farmacia_id=${farmaciaId}&codigo_orden=${encodeURIComponent(codigoOrden)}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'No se encontró la orden de delivery');

    renderPosDeliveryTrackingUI(data);
    initPosDeliveryLeafletMap(data);

    // Iniciar simulación de movimiento cada 3s si no está activo
    if (!posDeliveryInterval && data.estado_delivery === 'EN_CAMINO') {
      let stepIdx = 0;
      posDeliveryInterval = setInterval(() => {
        if (!posDeliveryLeafletMap || !data.ruta_coordenadas || !data.ruta_coordenadas.length) return;
        stepIdx = (stepIdx + 1) % data.ruta_coordenadas.length;
        const pt = data.ruta_coordenadas[stepIdx];
        if (posDeliveryCourierMarker) {
          posDeliveryCourierMarker.setLatLng([pt.lat, pt.lng]);
        }
      }, 3000);
    }
  } catch (err) {
    showToast('Error al consultar delivery: ' + err.message, 'error');
  }
}

function renderPosDeliveryTrackingUI(data) {
  const orderEl = document.getElementById('pos-delivery-modal-order');
  const badgeEl = document.getElementById('pos-delivery-modal-status-badge');
  const clientEl = document.getElementById('pos-delivery-modal-client');
  const addrEl = document.getElementById('pos-delivery-modal-address');
  const phoneEl = document.getElementById('pos-delivery-modal-phone');
  const courierNameEl = document.getElementById('pos-delivery-modal-courier-name');
  const courierVehEl = document.getElementById('pos-delivery-modal-courier-vehicle');
  const courierPhoneEl = document.getElementById('pos-delivery-modal-courier-phone');
  const etaEl = document.getElementById('pos-delivery-modal-eta');
  const selectEl = document.getElementById('pos-delivery-status-select');

  if (orderEl) orderEl.textContent = data.codigo_orden;
  if (badgeEl) {
    badgeEl.textContent = data.estado_delivery || 'EN_CAMINO';
    if (data.estado_delivery === 'ENTREGADO') {
      badgeEl.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-400 text-slate-950 uppercase';
    } else {
      badgeEl.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 uppercase animate-pulse';
    }
  }
  if (clientEl) clientEl.textContent = data.cliente_nombre || 'Cliente General';
  if (addrEl) addrEl.textContent = data.cliente_direccion || 'Dirección no registrada';
  if (phoneEl) phoneEl.textContent = '📞 ' + (data.cliente_telefono || 'N/A');

  if (data.repartidor) {
    if (courierNameEl) courierNameEl.textContent = data.repartidor.nombre || 'Motorizado';
    if (courierVehEl) courierVehEl.textContent = data.repartidor.vehiculo || 'Motocicleta';
    if (courierPhoneEl) courierPhoneEl.textContent = '📞 ' + (data.repartidor.telefono || 'N/A');
  }

  const eta = data.puntos?.repartidor_actual?.eta_minutos || 8;
  if (etaEl) etaEl.textContent = data.estado_delivery === 'ENTREGADO' ? '¡Entregado!' : `~${eta} minutos`;
  if (selectEl) selectEl.value = data.estado_delivery || 'EN_CAMINO';

  // Stepper
  const stepperContainer = document.getElementById('pos-delivery-stepper-container');
  if (stepperContainer && Array.isArray(data.stepper)) {
    stepperContainer.innerHTML = data.stepper.map(s => {
      let bg = s.completado ? 'bg-emerald-500 text-white' : (s.activo ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-500 animate-pulse' : 'bg-slate-200 text-slate-500');
      let icon = s.completado ? '✓' : (s.activo ? '🛵' : s.paso);
      return `
        <div class="p-2.5 rounded-xl border border-slate-200 text-center ${s.activo ? 'bg-amber-50/60' : 'bg-white'}">
          <div class="w-6 h-6 rounded-full mx-auto flex items-center justify-center text-xs font-black mb-1 ${bg}">
            ${icon}
          </div>
          <p class="text-[10px] font-extrabold text-slate-900 leading-tight">${s.titulo}</p>
          <span class="text-[9px] text-slate-400">${s.hora || ''}</span>
        </div>
      `;
    }).join('');
  }
}

function initPosDeliveryLeafletMap(data) {
  if (typeof L === 'undefined') return;
  const container = document.getElementById('pos-delivery-leaflet-map');
  if (!container) return;

  const farmaciaPt = data.puntos?.origen || { lat: 18.4746, lng: -69.9328 };
  const pacientePt = data.puntos?.destino || { lat: 18.4835, lng: -69.9405 };
  const repPt = data.puntos?.repartidor_actual || { lat: 18.4791, lng: -69.9368 };

  if (!posDeliveryLeafletMap) {
    posDeliveryLeafletMap = L.map('pos-delivery-leaflet-map').setView([repPt.lat, repPt.lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap FarmaSys'
    }).addTo(posDeliveryLeafletMap);
  } else {
    posDeliveryLeafletMap.invalidateSize();
  }

  // Clear previous layers
  posDeliveryLeafletMap.eachLayer(layer => {
    if (layer instanceof L.Marker || layer instanceof L.Polyline) {
      posDeliveryLeafletMap.removeLayer(layer);
    }
  });

  // Marcador Farmacia
  L.marker([farmaciaPt.lat, farmaciaPt.lng])
    .addTo(posDeliveryLeafletMap)
    .bindPopup('<b>🏥 Farmacia Davalsi</b><br>Despacho de medicamentos');

  // Marcador Paciente
  L.marker([pacientePt.lat, pacientePt.lng])
    .addTo(posDeliveryLeafletMap)
    .bindPopup(`<b>📍 ${data.cliente_nombre || 'Domicilio del Paciente'}</b><br>${data.cliente_direccion || ''}`);

  // Marcador Repartidor (Motorizado)
  const courierIcon = L.divIcon({
    html: '<div style="background:#0f766e; color:white; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; font-size:18px; border:2px solid white; box-shadow:0 2px 6px rgba(0,0,0,0.3)">🛵</div>',
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  posDeliveryCourierMarker = L.marker([repPt.lat, repPt.lng], { icon: courierIcon })
    .addTo(posDeliveryLeafletMap)
    .bindPopup('<b>🛵 Pedro Ramírez</b><br>En trayecto con el pedido')
    .openPopup();

  // Trazar línea de ruta
  if (Array.isArray(data.ruta_coordenadas) && data.ruta_coordenadas.length) {
    const latlngs = data.ruta_coordenadas.map(p => [p.lat, p.lng]);
    L.polyline(latlngs, { color: '#0d9488', weight: 4, dashArray: '6, 6' }).addTo(posDeliveryLeafletMap);
    posDeliveryLeafletMap.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30] });
  }
}

async function updatePosDeliveryStatusBtn() {
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const farmaciaId = Number(f.id || 1);
  const select = document.getElementById('pos-delivery-status-select');
  if (!select) return;

  const nuevoEstado = select.value;
  try {
    const res = await fetch('/api/delivery/actualizar-estado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: farmaciaId,
        codigo_orden: activePosDeliveryOrderCode,
        estado: nuevoEstado
      })
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al actualizar estado');

    showToast(`✅ Despacho actualizado a ${nuevoEstado}`, 'success');
    refreshPosDeliveryTrackingData(activePosDeliveryOrderCode);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

window.triggerAllChronic5dWhatsAppAlerts = triggerAllChronic5dWhatsAppAlerts;
window.sendChronic5dWhatsApp = sendChronic5dWhatsApp;
window.openPosDeliveryTrackingModal = openPosDeliveryTrackingModal;
window.closePosDeliveryTrackingModal = closePosDeliveryTrackingModal;
window.updatePosDeliveryStatusBtn = updatePosDeliveryStatusBtn;


// ============================================================================
// FUNCIONES DEL CONTROL DE ROLES Y PERMISOS (RBAC) & LIBRO DE PSICOTRÓPICOS
// ============================================================================

function toggleRbacQuickSwitchDropdown() {
  const menu = document.getElementById('rbac-quick-switch-menu');
  if (menu) menu.classList.toggle('hidden');
}

async function switchActiveRoleQuickly(newRole) {
  toggleRbacQuickSwitchDropdown();
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const fid = Number(f.id || 1);

  let username = 'admin';
  if (newRole === 'REGENTE') username = 'regente';
  else if (newRole === 'CAJERO') username = 'cajero';

  showToast(`Cambiando a perfil ${newRole}...`, 'info');
  await quickDirectLogin(fid, username, '123456');
}

// ----------------- MODAL DE PSICOTRÓPICOS (LEY 50-88) -----------------
let pendingPsicoAuthProduct = null;
let pendingPsicoAuthPresentation = 'UNIDAD';

function openPosPsicotropicosModal() {
  const modal = document.getElementById('pos-psicotropicos-modal');
  if (modal) modal.classList.remove('hidden');
  loadPosPsicotropicosLibro();
  populatePsicotropicosSelect();
}

function closePosPsicotropicosModal() {
  const modal = document.getElementById('pos-psicotropicos-modal');
  if (modal) modal.classList.add('hidden');
}

function togglePsicoNewEntryForm() {
  const f = document.getElementById('psico-new-entry-container');
  if (f) f.classList.toggle('hidden');
}

function populatePsicotropicosSelect() {
  const sel = document.getElementById('psico-form-prod-id');
  if (!sel) return;
  const psicos = (sysState.products || []).filter(p => p.es_psicotropico || (p.categoria && p.categoria.toLowerCase().includes('psicotr')));
  sel.innerHTML = psicos.map(p => `
    <option value="${p.id}">${p.nombre_comercial} (Stock: ${p.inventario?.stock_total_unidades || p.stock_total_unidades || 0}u)</option>
  `).join('');
}

async function loadPosPsicotropicosLibro() {
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const tbody = document.getElementById('psico-table-tbody');
  if (!tbody) return;

  try {
    const res = await fetch(`/api/psicotropicos/libro?farmacia_id=${f.id || 1}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al cargar libro');

    const items = data.libro || [];
    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-slate-400">No hay movimientos registrados en el Libro Oficial de Psicotrópicos.</td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(item => {
      let movBadge = '<span class="px-2 py-0.5 rounded-full font-black text-[10px] bg-emerald-100 text-emerald-900">📦 ENTRADA</span>';
      if (item.tipo_movimiento === 'SALIDA_VENTA') {
        movBadge = '<span class="px-2 py-0.5 rounded-full font-black text-[10px] bg-rose-100 text-rose-900">🩺 SALIDA RECETA</span>';
      } else if (item.tipo_movimiento === 'AJUSTE') {
        movBadge = '<span class="px-2 py-0.5 rounded-full font-black text-[10px] bg-amber-100 text-amber-900">⚖️ AJUSTE</span>';
      }

      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-2.5 px-3 font-mono text-[11px] text-slate-500">
            <span class="font-bold text-slate-900">#${item.id}</span> • ${item.fecha_registro}
          </td>
          <td class="py-2.5 px-3 font-extrabold text-purple-950">${item.medicamento_nombre}</td>
          <td class="py-2.5 px-2 text-center">${movBadge}</td>
          <td class="py-2.5 px-2 text-center font-mono font-black text-slate-800">${item.cantidad_unidades}u</td>
          <td class="py-2.5 px-2 text-center font-mono font-black text-purple-900 bg-purple-50/50">${item.saldo_nuevo}u</td>
          <td class="py-2.5 px-3 font-mono text-[11px] text-slate-600">
            <span class="font-bold text-slate-900">${item.receta_numero || 'Sin Receta'}</span><br>
            <span class="text-[10px] text-slate-500">${item.medico_nombre || '-'} (${item.medico_exequatur || '-'})</span>
          </td>
          <td class="py-2.5 px-3 text-[11px] text-slate-700">
            <span class="font-bold">${item.paciente_nombre || 'N/A'}</span><br>
            <span class="font-mono text-[10px] text-slate-500">${item.paciente_cedula || '-'}</span>
          </td>
          <td class="py-2.5 px-3 text-[11px] text-purple-900 font-semibold">${item.regente_responsable}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    showToast('Error cargando libro de psicotrópicos: ' + err.message, 'error');
  }
}

async function submitPsicoMovement(event) {
  event.preventDefault();
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const prodId = document.getElementById('psico-form-prod-id').value;
  const tipo = document.getElementById('psico-form-tipo').value;
  const cant = document.getElementById('psico-form-cantidad').value;
  const receta = document.getElementById('psico-form-receta').value;
  const medico = document.getElementById('psico-form-medico').value;
  const exequatur = document.getElementById('psico-form-exequatur').value;
  const paciente = document.getElementById('psico-form-paciente').value;
  const obs = document.getElementById('psico-form-obs').value;
  const actorRole = sysState.authenticatedPharmacy ? (sysState.authenticatedPharmacy.rol_actual || 'REGENTE') : 'REGENTE';

  try {
    const res = await fetch('/api/psicotropicos/registrar-movimiento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: f.id || 1,
        producto_id: prodId,
        tipo_movimiento: tipo,
        cantidad_unidades: cant,
        receta_numero: receta,
        medico_nombre: medico,
        medico_exequatur: exequatur,
        paciente_nombre: paciente,
        observaciones: obs,
        actor_role: actorRole
      })
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al registrar');

    showToast('✅ Movimiento registrado en el Libro Oficial de Psicotrópicos.', 'success');
    togglePsicoNewEntryForm();
    loadPosPsicotropicosLibro();
    loadSysProducts(f.id || 1);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ----------------- AUTORIZACIÓN DE PSICOTRÓPICO PARA CAJERO -----------------
function openPsicotropicoAuthModal(product, presentation) {
  pendingPsicoAuthProduct = product;
  pendingPsicoAuthPresentation = presentation;

  document.getElementById('psico-auth-product-title').textContent = `${product.nombre_comercial} (${presentation})`;
  document.getElementById('psico-auth-product-id').value = product.id;
  document.getElementById('psico-auth-receta').value = '';
  document.getElementById('psico-auth-medico').value = '';
  document.getElementById('psico-auth-exequatur').value = '';
  document.getElementById('psico-auth-cedula').value = '';
  document.getElementById('psico-auth-regente-pin').value = '';

  const modal = document.getElementById('pos-psicotropico-auth-modal');
  if (modal) modal.classList.remove('hidden');
}

function closePsicotropicoAuthModal() {
  const modal = document.getElementById('pos-psicotropico-auth-modal');
  if (modal) modal.classList.add('hidden');
  pendingPsicoAuthProduct = null;
}

async function submitPsicotropicoAuthorization(event) {
  event.preventDefault();
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const prodId = document.getElementById('psico-auth-product-id').value;
  const receta = document.getElementById('psico-auth-receta').value;
  const medico = document.getElementById('psico-auth-medico').value;
  const exequatur = document.getElementById('psico-auth-exequatur').value;
  const cedula = document.getElementById('psico-auth-cedula').value;
  const pin = document.getElementById('psico-auth-regente-pin').value;

  try {
    const res = await fetch('/api/psicotropicos/autorizar-despacho', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: f.id || 1,
        producto_id: prodId,
        cantidad_unidades: 1,
        receta_numero: receta,
        medico_nombre: medico,
        medico_exequatur: exequatur,
        paciente_cedula: cedula,
        clave_regente: pin,
        regente_usuario: 'regente'
      })
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Autorización rechazada');

    showToast(`✅ Autorizado por ${data.autorizado_por}: Receta #${receta} registrada en Libro Oficial.`, 'success');
    closePsicotropicoAuthModal();

    if (pendingPsicoAuthProduct) {
      pendingPsicoAuthProduct._autorizado_por_regente = true;
      addProductToPosCart(pendingPsicoAuthProduct, pendingPsicoAuthPresentation);
      pendingPsicoAuthProduct._autorizado_por_regente = false;
    }
  } catch (err) {
    showToast('Error de autorización: ' + err.message, 'error');
  }
}

// ----------------- GESTIÓN DE PERSONAL Y ROLES (ADMINISTRADOR) -----------------
function openPosStaffRbacModal() {
  const modal = document.getElementById('pos-staff-rbac-modal');
  if (modal) modal.classList.remove('hidden');
  loadPosStaffUsers();
}

function closePosStaffRbacModal() {
  const modal = document.getElementById('pos-staff-rbac-modal');
  if (modal) modal.classList.add('hidden');
}

async function loadPosStaffUsers() {
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const tbody = document.getElementById('staff-table-tbody');
  if (!tbody) return;

  try {
    const res = await fetch(`/api/staff/users?farmacia_id=${f.id || 1}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al cargar personal');

    tbody.innerHTML = (data.users || []).map(u => {
      let roleBadge = '<span class="px-2 py-0.5 rounded-full font-black text-[10px] bg-amber-100 text-amber-900 border border-amber-300">🛡️ ADMINISTRADOR</span>';
      if (u.rol === 'REGENTE') {
        roleBadge = '<span class="px-2 py-0.5 rounded-full font-black text-[10px] bg-teal-100 text-teal-900 border border-teal-300">🩺 REGENTE</span>';
      } else if (u.rol === 'CAJERO') {
        roleBadge = '<span class="px-2 py-0.5 rounded-full font-black text-[10px] bg-sky-100 text-sky-900 border border-sky-300">👤 CAJERO</span>';
      }

      let permsSummary = 'Acceso total a precios, arqueos, quejas y reportes';
      if (u.rol === 'REGENTE') permsSummary = 'Psicotrópicos Ley 50-88, alertas clínicas e inventario';
      else if (u.rol === 'CAJERO') permsSummary = 'Solo ventas mostrador POS y consulta de catálogo';

      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-2.5 px-3 font-mono font-bold text-slate-800">${u.username}</td>
          <td class="py-2.5 px-3 font-extrabold text-slate-900">${u.nombre_completo}</td>
          <td class="py-2.5 px-2 text-center">${roleBadge}</td>
          <td class="py-2.5 px-3 text-[11px] text-slate-600">${permsSummary}</td>
          <td class="py-2.5 px-3 text-right">
            <button type="button" onclick="openSwitchAccountModal('${u.username}'); closePosStaffRbacModal();" class="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] border border-indigo-200 transition cursor-pointer">
              Iniciar Sesión
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    showToast('Error cargando personal: ' + err.message, 'error');
  }
}

async function submitStaffUser(event) {
  event.preventDefault();
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const nombre = document.getElementById('staff-form-nombre').value;
  const username = document.getElementById('staff-form-username').value;
  const rol = document.getElementById('staff-form-rol').value;
  const claveEl = document.getElementById('staff-form-clave');
  const clave = claveEl ? claveEl.value.trim() : '123456';

  try {
    const res = await fetch('/api/staff/save-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: f.id || 1,
        nombre_completo: nombre,
        username: username,
        rol: rol,
        clave: clave || '123456',
        actor_role: 'ADMINISTRADOR'
      })
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al guardar personal');

    showToast(`✅ Personal '${username}' guardado como ${rol}.`, 'success');
    document.getElementById('staff-form-nombre').value = '';
    document.getElementById('staff-form-username').value = '';
    loadPosStaffUsers();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

window.toggleRbacQuickSwitchDropdown = toggleRbacQuickSwitchDropdown;
window.switchActiveRoleQuickly = switchActiveRoleQuickly;
window.openPosPsicotropicosModal = openPosPsicotropicosModal;
window.closePosPsicotropicosModal = closePosPsicotropicosModal;
window.togglePsicoNewEntryForm = togglePsicoNewEntryForm;
window.submitPsicoMovement = submitPsicoMovement;
window.loadPosPsicotropicosLibro = loadPosPsicotropicosLibro;
window.openPsicotropicoAuthModal = openPsicotropicoAuthModal;
window.closePsicotropicoAuthModal = closePsicotropicoAuthModal;
window.submitPsicotropicoAuthorization = submitPsicotropicoAuthorization;
window.openPosStaffRbacModal = openPosStaffRbacModal;
window.closePosStaffRbacModal = closePosStaffRbacModal;
window.loadPosStaffUsers = loadPosStaffUsers;
window.submitStaffUser = submitStaffUser;


// =========================================================================
// ASISTENTE DE REABASTECIMIENTO A DROGUERIAS (IA)
// =========================================================================

let posRestockCache = [];

async function openPosRestockModal() {
  const modal = document.getElementById('pos-restock-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  await fetchRestockData();
}

function closePosRestockModal() {
  const modal = document.getElementById('pos-restock-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.style.display = 'none';
}

async function fetchRestockData() {
  const farmaciaId = (sysState.authenticatedPharmacy && sysState.authenticatedPharmacy.id) || 1;
  const daysSelect = document.getElementById('restock-filter-days');
  const dias = daysSelect ? parseInt(daysSelect.value, 10) || 30 : 30;
  const tbody = document.getElementById('restock-table-tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-slate-400">⏳ Consultando ritmo de ventas y stock para reabastecimiento con IA...</td></tr>';
  }

  try {
    const res = await fetch(`/api/pos/reabastecimiento/sugerencias?farmacia_id=${farmaciaId}&dias_cobertura=${dias}`);
    const data = await res.json();
    if (!data.ok) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-rose-500 font-bold">${data.error || 'Error al obtener sugerencias.'}</td></tr>`;
      return;
    }

    posRestockCache = data.sugerencias || [];

    // Actualizar KPIs
    const kpiTot = document.getElementById('restock-card-total-prods');
    const kpiCrit = document.getElementById('restock-card-criticos');
    const kpiBajo = document.getElementById('restock-card-bajo-stock');
    const kpiDop = document.getElementById('restock-card-total-dop');
    const kpiUsd = document.getElementById('restock-card-total-usd');
    const badge = document.getElementById('pos-restock-badge');

    if (kpiTot) kpiTot.textContent = data.total_items_sugeridos || posRestockCache.length;
    if (kpiCrit) kpiCrit.textContent = data.items_criticos_agotados || 0;
    if (kpiBajo) kpiBajo.textContent = data.items_stock_bajo || 0;
    if (kpiDop) kpiDop.textContent = typeof formatRD === 'function' ? formatRD(data.costo_total_estimado_rd || 0) : `RD$ ${(data.costo_total_estimado_rd || 0).toFixed(2)}`;
    if (kpiUsd) kpiUsd.textContent = `$${(data.costo_total_estimado_usd || 0).toFixed(2)} USD`;
    if (badge) badge.textContent = data.total_items_sugeridos || posRestockCache.length;

    // Poblar selector de laboratorios
    const labSel = document.getElementById('restock-filter-lab');
    if (labSel) {
      const currentLab = labSel.value;
      const labs = [...new Set(posRestockCache.map(i => i.laboratorio).filter(Boolean))].sort();
      labSel.innerHTML = '<option value="">Todas las Droguerías / Laboratorios</option>' +
        labs.map(l => `<option value="${l}">${l}</option>`).join('');
      if (labs.includes(currentLab)) labSel.value = currentLab;
    }

    renderRestockTable(posRestockCache);
  } catch (err) {
    console.error('Error fetching restock data:', err);
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-6 text-rose-500 font-bold">Error de conexión al cargar reabastecimiento.</td></tr>';
  }
}

function filterRestockGrid() {
  const labSel = document.getElementById('restock-filter-lab');
  const selectedLab = labSel ? labSel.value : '';
  const filtered = selectedLab ? posRestockCache.filter(i => i.laboratorio === selectedLab) : posRestockCache;
  renderRestockTable(filtered);
}

function renderRestockTable(items) {
  const tbody = document.getElementById('restock-table-tbody');
  if (!tbody) return;

  if (!items || !items.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-emerald-600 font-bold">✨ Stock en niveles óptimos. No se requieren órdenes de compra urgentes.</td></tr>';
    return;
  }

  tbody.innerHTML = items.map((it, idx) => {
    const isCritico = it.stock_actual <= 0 || it.prioridad === 'CRÍTICA' || it.prioridad === 'AGOTADO';
    const badgeColor = isCritico ? 'bg-rose-100 text-rose-800 border-rose-300' : 'bg-amber-100 text-amber-800 border-amber-300';
    const subtotal = (it.cantidad_sugerida || 0) * (it.costo_unitario || 0);

    return `
      <tr class="hover:bg-slate-50 border-b border-slate-100">
        <td class="py-2.5 px-3">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-black border ${badgeColor}">
            ${isCritico ? '🚨 CRÍTICO' : '⚠️ REORDEN'}
          </span>
        </td>
        <td class="py-2.5 px-3">
          <div class="font-extrabold text-slate-900">${it.producto_nombre || it.nombre || 'Medicamento'}</div>
          <div class="text-[10px] text-slate-500">${it.principio_activo || ''}</div>
        </td>
        <td class="py-2.5 px-2 text-slate-700 font-semibold text-xs">${it.laboratorio || 'Droguería Genérica'}</td>
        <td class="py-2.5 px-2 text-center font-bold">
          <span class="${isCritico ? 'text-rose-600 font-black' : 'text-slate-800'}">${it.stock_actual}</span>
          <span class="text-slate-400 font-normal"> / ${it.stock_minimo || 10}</span>
        </td>
        <td class="py-2.5 px-2 text-center text-slate-700">${it.ritmo_semanal_unidades || it.venta_semanal || 0} u/sem</td>
        <td class="py-2.5 px-3 text-center bg-purple-50/50">
          <input type="number" min="1" value="${it.cantidad_sugerida || 10}"
            onchange="updateRestockItemQty(${idx}, this.value)"
            class="w-20 px-2 py-1 text-center font-black rounded-lg border border-purple-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400 text-purple-950" />
        </td>
        <td class="py-2.5 px-2 text-right font-mono text-slate-700">RD$ ${(it.costo_unitario || 0).toFixed(2)}</td>
        <td class="py-2.5 px-3 text-right font-mono font-bold text-slate-900" id="restock-subtotal-${idx}">
          RD$ ${subtotal.toFixed(2)}
        </td>
      </tr>
    `;
  }).join('');
}

function updateRestockItemQty(idx, newQty) {
  const qty = Math.max(1, parseInt(newQty, 10) || 1);
  if (posRestockCache[idx]) {
    posRestockCache[idx].cantidad_sugerida = qty;
    const sub = qty * (posRestockCache[idx].costo_unitario || 0);
    const subEl = document.getElementById(`restock-subtotal-${idx}`);
    if (subEl) subEl.textContent = `RD$ ${sub.toFixed(2)}`;
  }
}

async function downloadRestockCSV() {
  if (!posRestockCache.length) {
    if (typeof showToast === 'function') showToast('No hay productos sugeridos para exportar.', 'error');
    return;
  }
  const farmaciaId = (sysState.authenticatedPharmacy && sysState.authenticatedPharmacy.id) || 1;
  const daysSelect = document.getElementById('restock-filter-days');
  const dias = daysSelect ? parseInt(daysSelect.value, 10) || 30 : 30;

  try {
    const res = await fetch('/api/pos/reabastecimiento/exportar-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmacia_id: farmaciaId, dias_cobertura: dias, items: posRestockCache }),
    });
    if (!res.ok) throw new Error('Error al generar CSV');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Orden_Droguerias_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (typeof showToast === 'function') showToast('✅ Orden de compra descargada en CSV.');
  } catch (err) {
    console.error(err);
    if (typeof showToast === 'function') showToast('Error al descargar CSV.', 'error');
  }
}

function printRestockVoucher() {
  if (!posRestockCache.length) {
    if (typeof showToast === 'function') showToast('No hay datos para imprimir.', 'error');
    return;
  }
  window.print();
}

window.openPosRestockModal = openPosRestockModal;
window.closePosRestockModal = closePosRestockModal;
window.fetchRestockData = fetchRestockData;
window.filterRestockGrid = filterRestockGrid;
window.updateRestockItemQty = updateRestockItemQty;
window.downloadRestockCSV = downloadRestockCSV;
window.printRestockVoucher = printRestockVoucher;


// =========================================================================
// CAMBIO SEGURO DE CUENTA RBAC CON VALIDACIÓN DE CONTRASEÑA
// =========================================================================
function openSwitchAccountModal(targetUsername) {
  const modal = document.getElementById('pos-switch-user-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  const uInput = document.getElementById('switch-modal-username');
  const pInput = document.getElementById('switch-modal-password');
  const errEl = document.getElementById('switch-modal-error');
  if (errEl) errEl.classList.add('hidden');
  if (uInput) {
    if (targetUsername) uInput.value = targetUsername;
    else uInput.value = '';
  }
  if (pInput) {
    pInput.value = '';
    setTimeout(() => pInput.focus(), 100);
  }
}

function closeSwitchAccountModal() {
  const modal = document.getElementById('pos-switch-user-modal');
  if (modal) modal.classList.add('hidden');
  const errEl = document.getElementById('switch-modal-error');
  if (errEl) errEl.classList.add('hidden');
}

async function handleSwitchAccountSubmit(event) {
  if (event) event.preventDefault();
  const f = sysState.authenticatedPharmacy || { id: 1 };
  const fid = Number(f.id || 1);
  const uInput = document.getElementById('switch-modal-username');
  const pInput = document.getElementById('switch-modal-password');
  const errEl = document.getElementById('switch-modal-error');
  const btnSubmit = document.getElementById('switch-modal-btn-submit');

  const username = uInput ? uInput.value.trim() : '';
  const clave = pInput ? pInput.value.trim() : '';

  if (!username || !clave) {
    if (errEl) {
      errEl.textContent = 'Debes ingresar el usuario y su contraseña correspondiente.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  if (errEl) errEl.classList.add('hidden');
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Validando clave...';
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmacia_id: fid, username: username, clave_acceso: clave })
    });
    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.error || 'Contraseña incorrecta o usuario no autorizado.');
    }

    // Éxito: actualizar sesión y workspace
    enterAuthenticatedWorkspace(data.pharmacy, data.token);
    closeSwitchAccountModal();
    showToast(`✅ Sesión cambiada a perfil '${data.pharmacy.rol_actual}' (${data.pharmacy.usuario_actual}).`, 'success');
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || 'Error al autenticar el usuario.';
      errEl.classList.remove('hidden');
    }
    showToast(err.message || 'Contraseña incorrecta', 'error');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Validar y Cambiar Perfil ➔';
    }
  }
}

window.openSwitchAccountModal = openSwitchAccountModal;
window.closeSwitchAccountModal = closeSwitchAccountModal;
window.handleSwitchAccountSubmit = handleSwitchAccountSubmit;



/* =========================================================================
   MODULO FINANCIERO, CONCILIACIÓN CON IA Y DESCARGA DE REPORTES PDF
   ========================================================================= */

function descargarPdfBajoStock() {
  const sel = document.getElementById('sel-pdf-modalidad-stock');
  const mod = sel ? sel.value : 'auditor';
  const fid = (sysState && sysState.activeFarmaciaId) ? sysState.activeFarmaciaId : 1;
  const url = `/api/reportes/pdf/bajo-stock?farmacia_id=${fid}&modalidad=${mod}`;
  window.open(url, '_blank');
}

async function loadDashboardFinanzas(periodo = 'dia') {
  const fid = (sysState && sysState.activeFarmaciaId) ? sysState.activeFarmaciaId : 1;
  
  // Actualizar estilos de botones de período
  ['dia', 'semana', 'mes'].forEach(p => {
    const btn = document.getElementById(`btn-periodo-${p}`);
    if (btn) {
      if (p === periodo) {
        btn.className = 'px-3 py-1.5 rounded-lg font-black bg-teal-600 text-white shadow-xs';
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg font-bold text-slate-700 hover:bg-white';
      }
    }
  });

  try {
    const res = await fetch(`/api/finanzas/dashboard?farmacia_id=${fid}&periodo=${periodo}`);
    const data = await res.json();
    if (!data.ok) {
      if (typeof showToast === 'function') showToast(data.error || 'Error al cargar finanzas', 'error');
      return;
    }

    // Actualizar KPIs
    const elBrutas = document.getElementById('fin-kpi-brutas');
    const elDesc = document.getElementById('fin-kpi-descuentos');
    const elNetas = document.getElementById('fin-kpi-netas');
    const elUtilidad = document.getElementById('fin-kpi-utilidad');
    const elMargen = document.getElementById('fin-kpi-margen');

    if (elBrutas) elBrutas.textContent = `RD$ ${data.ventas_brutas.toFixed(2)}`;
    if (elDesc) elDesc.textContent = `-RD$ ${data.descuentos_otorgados.toFixed(2)}`;
    if (elNetas) elNetas.textContent = `RD$ ${data.ventas_netas.toFixed(2)}`;
    if (elUtilidad) elUtilidad.textContent = `RD$ ${data.utilidad_real.toFixed(2)}`;
    if (elMargen) elMargen.textContent = `Margen Real: ${data.margen_utilidad_pct}%`;

    // Desglose Métodos
    const met = data.desglose_metodos_pago || {};
    const elEfec = document.getElementById('fin-metodo-efectivo');
    const elTarj = document.getElementById('fin-metodo-tarjeta');
    const elTrans = document.getElementById('fin-metodo-transferencia');
    if (elEfec) elEfec.textContent = `RD$ ${(met.EFECTIVO || 0).toFixed(2)}`;
    if (elTarj) elTarj.textContent = `RD$ ${(met.TARJETA || 0).toFixed(2)}`;
    if (elTrans) elTrans.textContent = `RD$ ${(met.TRANSFERENCIA || 0).toFixed(2)}`;

    // Desglose Canales
    const can = data.desglose_canales_venta || {};
    const elPos = document.getElementById('fin-canal-pos');
    const elWa = document.getElementById('fin-canal-wa');
    const elApp = document.getElementById('fin-canal-app');
    if (elPos) elPos.textContent = `RD$ ${(can.POS_MOSTRADOR || 0).toFixed(2)}`;
    if (elWa) elWa.textContent = `RD$ ${(can.WHATSAPP || 0).toFixed(2)}`;
    if (elApp) elApp.textContent = `RD$ ${(can.APP_PACIENTE || 0).toFixed(2)}`;

  } catch (err) {
    console.error('Error en loadDashboardFinanzas:', err);
  }
}

// 2. Conciliación de Transferencia Anti-Fraude con IA
async function ejecutarConciliacionIa() {
  const fileInput = document.getElementById('conciliacion-file-input');
  const montoInput = document.getElementById('conciliacion-monto-esperado');
  const resultBox = document.getElementById('conciliacion-resultado-box');

  const esperado = parseFloat(montoInput ? montoInput.value : '0') || 0.0;
  const fid = (sysState && sysState.activeFarmaciaId) ? sysState.activeFarmaciaId : 1;

  if (resultBox) {
    resultBox.innerHTML = `
      <div class="space-y-2">
        <div class="inline-block animate-spin text-2xl text-indigo-600">⏳</div>
        <p class="text-xs font-black text-indigo-900">Farma IA analizando el váucher con Gemini 2.5 Flash...</p>
      </div>
    `;
  }

  let base64Img = '';
  if (fileInput && fileInput.files && fileInput.files[0]) {
    const file = fileInput.files[0];
    base64Img = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    });
  }

  try {
    const res = await fetch('/api/finanzas/conciliar-transferencia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: fid,
        total_venta_esperado: esperado,
        imagen_base64: base64Img,
        mime_type: 'image/jpeg'
      })
    });
    const data = await res.json();

    if (!resultBox) return;

    if (!data.ok || data.nivel_riesgo === 'ROJO') {
      // Alerta Crítica Anti-Fraude
      resultBox.className = 'md:col-span-6 p-4 rounded-2xl bg-rose-50 border-2 border-rose-500 text-left space-y-2 animate-pulse';
      resultBox.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="text-2xl">🚨</span>
          <span class="px-2.5 py-0.5 rounded-full bg-rose-600 text-white font-black text-[10px] uppercase">BLOQUEO ANTI-FRAUDE</span>
        </div>
        <p class="text-xs font-black text-rose-950">${data.mensaje_alerta || 'Comprobante no válido o sospechoso.'}</p>
        <div class="text-[11px] text-rose-800 bg-white/80 p-2 rounded-xl border border-rose-200">
          <p><strong>Referencia leída:</strong> ${data.datos_voucher?.numero_referencia || 'N/A'}</p>
          <p><strong>Monto detectado:</strong> RD$ ${parseFloat(data.datos_voucher?.monto || 0).toFixed(2)}</p>
        </div>
      `;
      if (window.farma3DWidget) {
        window.farma3DWidget.setDialogue(data.farma_dialogo || data.mensaje_alerta, 'ROJO', true);
      }
      if (typeof showToast === 'function') showToast(data.mensaje_alerta, 'error');
    } else {
      // Transferencia Válida
      resultBox.className = 'md:col-span-6 p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-400 text-left space-y-2';
      resultBox.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="text-2xl">✅</span>
          <span class="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white font-black text-[10px] uppercase">VÁUCHER CONCILIADO</span>
        </div>
        <p class="text-xs font-black text-emerald-950">¡Transferencia bancaria legítima y autorizada!</p>
        <div class="text-[11px] text-emerald-800 bg-white/90 p-2 rounded-xl border border-emerald-200 space-y-0.5">
          <p><strong>Banco:</strong> ${data.banco}</p>
          <p><strong>Referencia Única:</strong> ${data.numero_referencia}</p>
          <p><strong>Monto Validado:</strong> RD$ ${parseFloat(data.monto_transferido).toFixed(2)}</p>
          <p><strong>Fecha/Hora:</strong> ${data.fecha_transferencia}</p>
        </div>
      `;
      if (window.farma3DWidget) {
        window.farma3DWidget.setDialogue(data.farma_dialogo, 'VERDE', false);
      }
      if (typeof showToast === 'function') showToast('Transferencia validada exitosamente.', 'success');
    }
  } catch (err) {
    console.error('Error en ejecutarConciliacionIa:', err);
  }
}

// 3. Cierre de Turno / Arqueo de Caja Asistido
async function ejecutarCierreCajaAsistido() {
  const cajeroInp = document.getElementById('cierre-cajero-nombre');
  const efecInp = document.getElementById('cierre-efectivo-contado');
  const resDisplay = document.getElementById('cierre-resultado-display');

  const cajero = cajeroInp ? cajeroInp.value : 'Cajero Davalsi';
  const contado = parseFloat(efecInp ? efecInp.value : '0') || 0.0;
  const fid = (sysState && sysState.activeFarmaciaId) ? sysState.activeFarmaciaId : 1;

  try {
    const res = await fetch('/api/caja/cierre-asistido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmacia_id: fid,
        efectivo_contado_gaveta: contado,
        cajero_nombre: cajero,
        tipo_corte: 'CORTE_Z'
      })
    });
    const data = await res.json();
    if (!data.ok) return;

    if (resDisplay) {
      resDisplay.classList.remove('hidden');
      const isCuadrado = data.estado_cuadre === 'CUADRADO';
      resDisplay.className = `p-4 rounded-2xl border-2 ${isCuadrado ? 'bg-emerald-50 border-emerald-400 text-emerald-950' : 'bg-amber-50 border-amber-400 text-amber-950'} space-y-2`;
      resDisplay.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="font-black text-sm uppercase">Resultado del Cuadre: ${data.estado_cuadre}</span>
          <span class="text-xs font-mono font-black">Descuadre: RD$ ${data.descuadre.toFixed(2)}</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
          <div class="p-2 bg-white rounded-xl border border-slate-200">
            <span class="text-[10px] text-slate-500 block">Efectivo Esperado</span>
            <strong>RD$ ${data.ventas_efectivo_esperadas.toFixed(2)}</strong>
          </div>
          <div class="p-2 bg-white rounded-xl border border-slate-200">
            <span class="text-[10px] text-slate-500 block">Efectivo Contado</span>
            <strong>RD$ ${data.efectivo_contado.toFixed(2)}</strong>
          </div>
          <div class="p-2 bg-white rounded-xl border border-slate-200">
            <span class="text-[10px] text-slate-500 block">Transferencias Validadas</span>
            <strong>${data.transferencias_validadas_count} pagos</strong>
          </div>
          <div class="p-2 bg-white rounded-xl border border-slate-200">
            <span class="text-[10px] text-slate-500 block">Más Rentable</span>
            <strong>${data.producto_mas_rentable}</strong>
          </div>
        </div>
      `;
    }

    // Proyectar Resumen Ejecutivo en la burbuja 3D de Farma
    if (window.farma3DWidget && data.farma_dialogo) {
      window.farma3DWidget.setDialogue(data.farma_dialogo, data.estado_cuadre === 'CUADRADO' ? 'VERDE' : 'AMARILLO', false);
    }
    if (typeof showToast === 'function') {
      showToast(`Cierre procesado: Caja ${data.estado_cuadre}`, data.estado_cuadre === 'CUADRADO' ? 'success' : 'info');
    }

  } catch (err) {
    console.error('Error en ejecutarCierreCajaAsistido:', err);
  }
}

window.descargarPdfBajoStock = descargarPdfBajoStock;
window.loadDashboardFinanzas = loadDashboardFinanzas;
window.ejecutarConciliacionIa = ejecutarConciliacionIa;
window.ejecutarCierreCajaAsistido = ejecutarCierreCajaAsistido;
