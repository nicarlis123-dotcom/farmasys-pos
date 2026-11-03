/* =========================================================================
   FARMA COGNITIVE BRAIN & AUTONOMOUS SALES ADVISOR (FARMACIA DAVALSI)
   - Motor cognitivo proactivo en tiempo real: Farma no es un bot pasivo.
   - Micro-burbuja de pensamiento dinámico:
     * "🧠 Evaluando seguridad clínica..."
     * "💡 Analizando velocidad de rotación..."
     * "⚠️ Verificando duplicidad farmacológica..."
   - Criterio clínico estricto y prevención de errores de medicación:
     * Duplicidad terapéutica (mismo principio activo o misma familia).
     * Interacciones farmacológicas de alto riesgo (AINEs + anticoagulantes, etc.).
     * Detección de errores de digitación (cantidades >= 20 o dosis atípicas).
   - FarmaSalesAdvisor: Cross-selling ético y clínico (ej. probióticos con antibióticos).
   - Memoria de sesión: No repetir consejos ya descartados o aprobados.
   - Chips de acción rápida ejecutables en 1 clic:
     * [Corregir cantidad], [Ver alternativa bioequivalente], [Añadir terapia complementaria], [Descartar con justificación]
   ========================================================================= */

(function () {
  'use strict';

  // Memoria local de sesión para evitar repetir consejos descartados o aceptados
  const dismissedAdviceMemory = new Set();
  const appliedAdviceMemory = new Set();

  class FarmaCognitiveBrain {
    constructor() {
      this.evaluating = false;
      this.lastEvaluationHash = '';
      this.currentAlerts = [];
      this.idleTimer = null;
      this.init();
    }

    init() {
      this.injectCognitiveStyles();
      this.bindCartObservers();
      console.log('[FarmaCognitiveBrain] Motor cognitivo autónomo y asesor comercial inicializado.');
    }

    injectCognitiveStyles() {
      if (document.getElementById('farma-cognitive-styles')) return;
      const st = document.createElement('style');
      st.id = 'farma-cognitive-styles';
      st.textContent = `
        /* Micro-burbuja de Estado Mental Proactivo */
        #farma-thought-badge {
          position: absolute;
          top: -34px;
          left: 50%;
          transform: translateX(-50%);
          white-space: nowrap;
          background: rgba(15, 23, 42, 0.95);
          backdrop-filter: blur(8px);
          border: 1.5px solid rgba(20, 184, 166, 0.7);
          border-radius: 9999px;
          padding: 4px 12px;
          font-size: 11px;
          font-weight: 800;
          color: #2dd4bf;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
          pointer-events: none;
          z-index: 100005;
          transition: all 0.25s ease;
          animation: thoughtBadgeFloat 2.4s ease-in-out infinite;
        }

        @keyframes thoughtBadgeFloat {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-3px); }
        }

        /* Chips de Acción Rápida en la Burbuja de Farma */
        .farma-action-chips-container {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
          padding-top: 6px;
          border-top: 1px dashed rgba(20, 184, 166, 0.3);
        }

        .farma-chip-btn {
          font-size: 10px;
          font-weight: 800;
          padding: 4px 9px;
          border-radius: 8px;
          transition: all 0.2s ease;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .farma-chip-primary {
          background: #0d9488;
          color: #ffffff;
          border: 1px solid #14b8a6;
        }
        .farma-chip-primary:hover {
          background: #0f766e;
        }

        .farma-chip-secondary {
          background: #334155;
          color: #f1f5f9;
          border: 1px solid #475569;
        }
        .farma-chip-secondary:hover {
          background: #475569;
        }

        .farma-chip-danger {
          background: #991b1b;
          color: #ffffff;
          border: 1px solid #dc2626;
        }
        .farma-chip-danger:hover {
          background: #7f1d1d;
        }

        /* Tarjeta Clínica Compacta No Intrusiva */
        #farma-clinical-toast {
          position: fixed;
          bottom: 24px;
          left: 24px;
          max-width: 380px;
          background: rgba(15, 23, 42, 0.98);
          backdrop-filter: blur(12px);
          border: 2px solid #ef4444;
          border-radius: 18px;
          padding: 14px;
          color: #ffffff;
          z-index: 99998;
          box-shadow: 0 10px 25px rgba(239, 68, 68, 0.35);
          animation: slideInToast 0.3s ease-out;
        }

        @keyframes slideInToast {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `;
      document.head.appendChild(st);
    }

    setMentalState(thoughtText) {
      const avatarRoot = document.getElementById('farma-master-avatar') || document.getElementById('farma-container');
      if (!avatarRoot) return;

      let badge = document.getElementById('farma-thought-badge');
      if (!thoughtText) {
        if (badge) badge.remove();
        return;
      }

      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'farma-thought-badge';
        avatarRoot.appendChild(badge);
      }
      badge.textContent = thoughtText;
    }

    bindCartObservers() {
      // Observador de cambios periódicos en el carrito
      setInterval(() => {
        this.evaluateCartCognitively();
      }, 2500);
    }

    evaluateCartCognitively() {
      const cart = (window.sysState && window.sysState.posCart) || (window.state && window.state.posCart) || [];
      const hash = JSON.stringify(cart.map(i => `${i.product.id}-${i.cantidad}-${i.presentacion}`));

      if (hash === this.lastEvaluationHash || this.evaluating) return;
      this.lastEvaluationHash = hash;

      if (!cart.length) {
        this.setMentalState('');
        this.dismissClinicalToast();
        return;
      }

      this.evaluating = true;

      // 1. Mostrar estado mental proactivo
      this.setMentalState('🧠 Evaluando seguridad clínica...');

      setTimeout(async () => {
        // Ejecutar validación clínica
        await this.validarSeguridadFarmacologica(cart);

        // 2. Ejecutar asesoría de ventas éticas (cross-selling)
        setTimeout(() => {
          this.setMentalState('💡 Analizando complementos éticos...');
          this.evaluateEthicalSales(cart);
          setTimeout(() => {
            this.setMentalState('');
            this.evaluating = false;
          }, 1200);
        }, 800);
      }, 500);
    }

    /* =========================================================================
       2. CRITERIO CLINICO Y PREVENCION DE ERRORES DE MEDICACION
       ========================================================================= */
    async validarSeguridadFarmacologica(itemsCarrito) {
      this.setMentalState('⚠️ Verificando duplicidad farmacológica...');

      // Consultar endpoint backend asistido por IA
      try {
        const payload = {
          items: itemsCarrito.map(i => ({
            producto_id: i.product.id,
            nombre_comercial: i.product.nombre_comercial,
            principio_activo: i.product.principio_activo,
            concentracion: i.product.concentracion,
            categoria: i.product.categoria,
            cantidad: i.cantidad,
            presentacion: i.presentacion
          })),
          paciente: {
            alergias_medicamentosas: document.getElementById('pos-client-alergias')?.value || '',
            diagnostico_cronico: document.getElementById('pos-client-diagnostico')?.value || ''
          }
        };

        const res = await fetch('/api/farma/asistir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.ok && data.alertas_clinicas && data.alertas_clinicas.length > 0) {
          const primeraAlerta = data.alertas_clinicas[0];
          const alertaKey = primeraAlerta.tipo + '_' + (primeraAlerta.producto || '');

          if (!dismissedAdviceMemory.has(alertaKey)) {
            this.showClinicalToast(primeraAlerta, data.alertas_clinicas, alertaKey);
            
            // Volar hacia el carrito para señalar el peligro
            if (window.farmaFlyAndPoint) {
              window.farmaFlyAndPoint(
                '#pos-cart-tbody',
                `¡Atención clínica! ${primeraAlerta.mensaje}`,
                'VERIFICAR_SEGURIDAD'
              );
            }
          }
        } else {
          this.dismissClinicalToast();
        }
      } catch (err) {
        console.warn('Error en validación clínica cognitiva:', err);
      }
    }

    showClinicalToast(alertaPrincipal, todasAlertas, alertaKey) {
      this.dismissClinicalToast();

      const toast = document.createElement('div');
      toast.id = 'farma-clinical-toast';
      toast.innerHTML = `
        <div class="flex items-start justify-between gap-2 border-b border-rose-500/40 pb-2 mb-2">
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-full bg-rose-500 animate-ping"></span>
            <span class="text-xs font-black text-rose-300 uppercase tracking-wide">Farma • Auditoría de Seguridad</span>
          </div>
          <button type="button" onclick="window.farmaBrain.dismissAlert('${alertaKey}')" class="text-slate-400 hover:text-white text-xs font-black p-1 cursor-pointer">✕</button>
        </div>
        <p class="text-xs font-bold text-rose-100 leading-snug mb-3">
          ${alertaPrincipal.mensaje}
        </p>
        <div class="farma-action-chips-container">
          <button type="button" onclick="window.farmaBrain.corregirCantidad()" class="farma-chip-btn farma-chip-primary">
            <span>✏️</span> <span>Corregir cantidad</span>
          </button>
          <button type="button" onclick="window.farmaBrain.buscarAlternativaBio()" class="farma-chip-btn farma-chip-secondary">
            <span>🔍</span> <span>Ver alternativa bioequivalente</span>
          </button>
          <button type="button" onclick="window.farmaBrain.dismissAlert('${alertaKey}')" class="farma-chip-btn farma-chip-danger">
            <span>⚠️</span> <span>Descartar con justificación</span>
          </button>
        </div>
      `;

      document.body.appendChild(toast);
    }

    dismissClinicalToast() {
      const t = document.getElementById('farma-clinical-toast');
      if (t) t.remove();
    }

    dismissAlert(alertaKey) {
      dismissedAdviceMemory.add(alertaKey);
      this.dismissClinicalToast();
      if (window.farmaUnifiedAgent) {
        window.farmaUnifiedAgent.say('Alerta descartada bajo criterio profesional del despachador.', 'Farma Auditor');
      }
    }

    corregirCantidad() {
      this.dismissClinicalToast();
      const firstInput = document.querySelector('#pos-cart-tbody input[type="number"], #pos-cart-tbody td');
      if (firstInput && window.farmaFlyAndPoint) {
        window.farmaFlyAndPoint(firstInput, 'Ajusta aquí la cantidad requerida para evitar errores de sobredosificación.', 'CORREGIR');
      }
    }

    buscarAlternativaBio() {
      this.dismissClinicalToast();
      const searchInput = document.getElementById('pos-barcode-input');
      if (searchInput && window.farmaFlyAndPoint) {
        window.farmaFlyAndPoint(searchInput, 'Ingresa el principio activo para consultar opciones bioequivalentes disponibles en anaquel.', 'BUSCAR');
      }
    }

    /* =========================================================================
       3. CONSEJOS SABIOS DE VENTAS (CROSS-SELLING ETICO Y CLINICO)
       ========================================================================= */
    evaluateEthicalSales(cart) {
      if (!cart || !cart.length) return;

      // Evaluar antibióticos
      const tieneAntibiotico = cart.some(i => {
        const cat = (i.product.categoria || '').toLowerCase();
        const nom = (i.product.nombre_comercial || '').toLowerCase();
        const pa = (i.product.principio_activo || '').toLowerCase();
        return cat.includes('antibiot') || pa.includes('amoxi') || pa.includes('azitro') || pa.includes('cipro') || nom.includes('bactrim');
      });

      const adviceAntibioticoKey = 'advice_antibiotico_probiotico';
      if (tieneAntibiotico && !dismissedAdviceMemory.has(adviceAntibioticoKey) && !appliedAdviceMemory.has(adviceAntibioticoKey)) {
        if (window.farmaUnifiedAgent) {
          window.farmaUnifiedAgent.say(`
            <div>
              <p class="text-xs font-semibold text-slate-100">
                <strong>Consejo clínico:</strong> Sugiera un <strong>probiótico o protector gastrointestinal</strong> para preservar la microbiota del paciente durante el tratamiento antibiótico.
              </p>
              <div class="farma-action-chips-container">
                <button type="button" onclick="window.farmaBrain.addProbiotico('${adviceAntibioticoKey}')" class="farma-chip-btn farma-chip-primary">
                  <span>➕</span> <span>Añadir terapia complementaria</span>
                </button>
                <button type="button" onclick="window.farmaBrain.dismissAdvice('${adviceAntibioticoKey}')" class="farma-chip-btn farma-chip-secondary">
                  <span>✕</span> <span>Omitir por ahora</span>
                </button>
              </div>
            </div>
          `, 'Farma Asesor Clínico', 14);
        }
        return;
      }

      // Evaluar crónicos (diabetes / hipertensión)
      const tieneCronico = cart.some(i => {
        const nom = (i.product.nombre_comercial || '').toLowerCase();
        const pa = (i.product.principio_activo || '').toLowerCase();
        return pa.includes('losartan') || pa.includes('enalapril') || pa.includes('metformin') || nom.includes('metformina');
      });

      const adviceCronicoKey = 'advice_cronico_insumos';
      if (tieneCronico && !dismissedAdviceMemory.has(adviceCronicoKey) && !appliedAdviceMemory.has(adviceCronicoKey)) {
        if (window.farmaUnifiedAgent) {
          window.farmaUnifiedAgent.say(`
            <div>
              <p class="text-xs font-semibold text-slate-100">
                <strong>Consejo preventivo:</strong> El paciente lleva medicación crónica. Verifique si dispone de insumos esenciales de monitoreo (tiras de glucemia o tensiómetro).
              </p>
              <div class="farma-action-chips-container">
                <button type="button" onclick="window.farmaBrain.dismissAdvice('${adviceCronicoKey}')" class="farma-chip-btn farma-chip-secondary">
                  <span>✓</span> <span>Verificado con el paciente</span>
                </button>
              </div>
            </div>
          `, 'Farma Prevención', 14);
        }
      }
    }

    addProbiotico(adviceKey) {
      appliedAdviceMemory.add(adviceKey);
      // Buscar si existe probiótico en catálogo
      const prods = (window.sysState && window.sysState.products) || [];
      const match = prods.find(p => (p.nombre_comercial || '').toLowerCase().includes('probi') || (p.nombre_comercial || '').toLowerCase().includes('flora'));
      if (match && typeof window.addPosItemDirect === 'function') {
        window.addPosItemDirect(match.id, 'UNIDAD');
        if (window.farmaUnifiedAgent) {
          window.farmaUnifiedAgent.say(`✅ ${match.nombre_comercial} añadido como terapia protectora.`, 'Terapia Complementaria', 4);
        }
      } else {
        if (typeof showToast === 'function') showToast('Sugerencia de probiótico comunicada al cliente.', 'info');
      }
    }

    dismissAdvice(adviceKey) {
      dismissedAdviceMemory.add(adviceKey);
      if (window.farmaUnifiedAgent) {
        window.farmaUnifiedAgent.closeBubble();
      }
    }
  }

  // Instanciar singleton
  window.farmaBrain = new FarmaCognitiveBrain();
})();
