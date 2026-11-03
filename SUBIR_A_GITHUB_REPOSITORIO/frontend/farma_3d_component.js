/* =========================================================================
   FARMA-IA 3D NATIVE COMPONENT & ANTIGRAVITY FLOATING ENGINE (UNIFICADO)
   - Contenedor Padre (#farma-container): Movilidad y traslación fluida por la pantalla.
   - Contenedor Hijo (.farma-3d-levitating-mesh): Levitación vertical continua Antigravity.
   - Burbuja HTML interactiva y reactiva conectada a /api/farma/asistir.
   - Seguimiento dinámico en vivo con window.moverFarmaHacia(selectorDOM).
   ========================================================================= */

(function () {
  'use strict';

  // ID estándar del contenedor principal único
  const FARMA_CONTAINER_ID = 'farma-container';

  // URL del modelo 3D GLB nativo (Robot médico / dron clínico optimizado)
  // NOTA: Si el usuario desea cargar un archivo local, reemplace FARMA_ROBOT_GLB por '/farma.glb' o '/assets/farma.glb'
  const FARMA_ROBOT_GLB = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/FlightHelmet/glTF/FlightHelmet.gltf';

  // Inyectar Estilos CSS separados en 2 capas (Padre para traslación, Hijo para levitación)
  function injectStyles() {
    if (document.getElementById('farma-antigravity-styles')) return;

    const style = document.createElement('style');
    style.id = 'farma-antigravity-styles';
    style.textContent = `
      /* =========================================================================
         CAPA B (HIJO): Animación de levitación vertical en eje Y (Antigravity Float)
         ========================================================================= */
      @keyframes farmaAntigravityFloat {
        0% {
          transform: translateY(0px) rotate(0deg);
        }
        50% {
          transform: translateY(-13px) rotate(1.2deg);
        }
        100% {
          transform: translateY(0px) rotate(0deg);
        }
      }

      /* Sombra dinámica Antigravity inferior */
      @keyframes farmaDynamicShadow {
        0% {
          transform: scale(1) scaleY(0.4);
          opacity: 0.55;
          filter: blur(5px);
        }
        50% {
          transform: scale(0.72) scaleY(0.28);
          opacity: 0.22;
          filter: blur(8px);
        }
        100% {
          transform: scale(1) scaleY(0.4);
          opacity: 0.55;
          filter: blur(5px);
        }
      }

      /* Pulso de alerta crítica roja */
      @keyframes farmaRedAlertPulse {
        0%, 100% {
          box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7), 0 10px 30px rgba(239, 68, 68, 0.4);
          border-color: #ef4444;
        }
        50% {
          box-shadow: 0 0 0 14px rgba(239, 68, 68, 0), 0 15px 40px rgba(239, 68, 68, 0.6);
          border-color: #dc2626;
        }
      }

      /* =========================================================================
         CAPA A (PADRE): #farma-container con transiciones fluidas de coordenadas
         ========================================================================= */
      #farma-container,
      .farma-3d-floating-container {
        position: fixed !important;
        z-index: 9999 !important;
        display: flex;
        flex-direction: column;
        align-items: center;
        pointer-events: auto;
        /* Viaje cinemático suave y fluido por la pantalla */
        transition: top 0.6s cubic-bezier(0.25, 1, 0.5, 1),
                    left 0.6s cubic-bezier(0.25, 1, 0.5, 1),
                    bottom 0.6s cubic-bezier(0.25, 1, 0.5, 1),
                    right 0.6s cubic-bezier(0.25, 1, 0.5, 1);
        will-change: top, left, bottom, right;
      }

      #farma-container.training-mode {
        z-index: 100010 !important;
      }

      /* =========================================================================
         CONTENEDOR HIJO (MALLA LEVITANTE): Aplica la levitación pura vertical
         ========================================================================= */
      .farma-3d-levitating-mesh {
        position: relative;
        width: 130px;
        height: 130px;
        animation: farmaAntigravityFloat 3.8s ease-in-out infinite;
        transform-origin: center bottom;
        filter: drop-shadow(0 14px 22px rgba(13, 148, 136, 0.4));
        transition: filter 0.3s ease, transform 0.3s ease;
        cursor: pointer;
      }

      .farma-3d-levitating-mesh.risk-red {
        filter: drop-shadow(0 14px 26px rgba(239, 68, 68, 0.65));
      }

      /* Sombra dinámica en el suelo */
      .farma-3d-ground-shadow {
        width: 76px;
        height: 16px;
        background: radial-gradient(ellipse at center, rgba(15, 23, 42, 0.75) 0%, rgba(15, 23, 42, 0) 75%);
        border-radius: 50%;
        margin-top: -6px;
        animation: farmaDynamicShadow 3.8s ease-in-out infinite;
      }

      /* Burbuja de diálogo HTML superior */
      .farma-3d-speech-bubble {
        position: relative;
        margin-bottom: 8px;
        max-width: 310px;
        min-width: 200px;
        background: rgba(15, 23, 42, 0.94);
        backdrop-filter: blur(14px);
        color: #f8fafc;
        border: 2px solid #14b8a6;
        border-radius: 20px;
        padding: 12px 16px;
        box-shadow: 0 16px 36px -6px rgba(0, 0, 0, 0.7), 0 0 18px rgba(20, 184, 166, 0.3);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 11.5px;
        line-height: 1.45;
        transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.3s ease, background 0.3s ease;
        user-select: none;
      }

      .farma-3d-speech-bubble.bubble-fade-out {
        opacity: 0.18;
        transform: translateY(6px) scale(0.96);
      }

      .farma-3d-speech-bubble.bubble-idle {
        border-color: rgba(20, 184, 166, 0.45);
        background: rgba(15, 23, 42, 0.85);
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
      }

      /* Flechita inferior de la burbuja */
      .farma-3d-speech-bubble::after {
        content: "";
        position: absolute;
        bottom: -9px;
        left: 50%;
        transform: translateX(-50%);
        border-width: 9px 8px 0 8px;
        border-style: solid;
        border-color: #14b8a6 transparent transparent transparent;
        transition: border-color 0.3s ease;
      }

      /* Variantes de riesgo en la burbuja */
      .farma-3d-speech-bubble.bubble-risk-red {
        border-color: #ef4444 !important;
        background: rgba(45, 10, 15, 0.96) !important;
        animation: farmaRedAlertPulse 1.8s infinite;
      }
      .farma-3d-speech-bubble.bubble-risk-red::after {
        border-color: #ef4444 transparent transparent transparent !important;
      }

      .farma-3d-speech-bubble.bubble-risk-yellow {
        border-color: #f59e0b !important;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6), 0 0 16px rgba(245, 158, 11, 0.4);
      }
      .farma-3d-speech-bubble.bubble-risk-yellow::after {
        border-color: #f59e0b transparent transparent transparent !important;
      }

      /* Banner de Alerta Visual Global en Pantalla */
      .farma-screen-alert-banner {
        position: fixed;
        top: 18px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 100020;
        background: linear-gradient(135deg, #b91c1c, #dc2626);
        color: #ffffff;
        border: 2px solid #fecaca;
        border-radius: 18px;
        padding: 12px 24px;
        font-size: 13px;
        font-weight: 800;
        box-shadow: 0 20px 40px rgba(220, 38, 38, 0.5);
        display: flex;
        align-items: center;
        gap: 12px;
        animation: farmaRedAlertPulse 1.5s infinite;
      }

      /* Interruptor de Modo Entrenamiento */
      .farma-training-switch-btn {
        transition: all 0.25s ease;
      }
      .farma-training-switch-btn.active {
        background: linear-gradient(135deg, #0d9488, #059669) !important;
        color: #ffffff !important;
        border-color: #34d399 !important;
        box-shadow: 0 0 14px rgba(52, 211, 153, 0.6) !important;
      }
    `;
    document.head.appendChild(style);
  }

  // Cargar Google <model-viewer> si no existe
  function loadModelViewerScript(onLoaded) {
    if (customElements.get('model-viewer')) {
      if (typeof onLoaded === 'function') onLoaded();
      return;
    }
    const script = document.createElement('script');
    script.type = 'module';
    script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js';
    script.onload = () => {
      if (typeof onLoaded === 'function') onLoaded();
    };
    script.onerror = () => {
      console.warn('[Farma3D] model-viewer CDN no disponible, activando Three.js WebGL canvas nativo.');
      if (typeof onLoaded === 'function') onLoaded();
    };
    document.head.appendChild(script);
  }

  // Cargar Driver.js si no existe
  function loadDriverJs(onLoaded) {
    if (window.driver) {
      if (typeof onLoaded === 'function') onLoaded();
      return;
    }
    if (!document.getElementById('driver-js-css')) {
      const link = document.createElement('link');
      link.id = 'driver-js-css';
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/driver.js@1.3.1/dist/driver.css';
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/driver.js@1.3.1/dist/driver.bind.min.js';
    script.onload = () => {
      if (typeof onLoaded === 'function') onLoaded();
    };
    script.onerror = () => {
      console.warn('[Farma3D] Driver.js no pudo ser cargado desde CDN. Modo nativo activo.');
      if (typeof onLoaded === 'function') onLoaded();
    };
    document.head.appendChild(script);
  }

  // =========================================================================
  // CLASE PRINCIPAL: FarmaFloatingWidget (Único Avatar en Pantalla)
  // =========================================================================
  class FarmaFloatingWidget {
    constructor(options = {}) {
      this.containerId = FARMA_CONTAINER_ID;
      this.activeModelUrl = options.modelUrl || FARMA_ROBOT_GLB;
      this.isLevitating = true;
      this.currentRisk = 'VERDE';
      this.idleMessage = 'A la espera de instrucciones...';
      this.lastDialogue = '¡Hola! Soy Farma, tu copiloto clínico 3D.';
      this.bubbleTimer = null;
      this.fadeTimer = null;
      this.init();
    }

    init() {
      injectStyles();
      this.removeDuplicateAvatars();
      this.createDom();
      loadModelViewerScript(() => {
        this.render3DModel();
      });
    }

    // 1. Elimina por completo cualquier avatar duplicado previo en el DOM
    removeDuplicateAvatars() {
      const duplicateIds = [
        'farma-global-3d-widget',
        'farmaia-3d-floating-widget',
        'farmaia-fab-3d-canvas',
        'farmaia-bubble-msg'
      ];
      duplicateIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.id !== FARMA_CONTAINER_ID) {
          el.remove();
        }
      });

      // Si existe algún otro model-viewer huérfano, retirarlo
      const existingViewers = document.querySelectorAll('model-viewer');
      existingViewers.forEach(mv => {
        if (!mv.closest(`#${FARMA_CONTAINER_ID}`)) {
          mv.remove();
        }
      });
    }

    createDom() {
      let root = document.getElementById(this.containerId);
      if (root) {
        // Asegurar que el id y clases coincidan
        root.className = 'farma-3d-floating-container';
        return;
      }

      root = document.createElement('div');
      root.id = this.containerId;
      root.className = 'farma-3d-floating-container';
      // Posición de reposo por defecto abajo a la derecha
      root.style.top = 'auto';
      root.style.left = 'auto';
      root.style.bottom = '24px';
      root.style.right = '24px';

      root.innerHTML = `
        <!-- Burbuja de Diálogo Farma superpuesta a la cabeza -->
        <div id="farma-3d-bubble" class="farma-3d-speech-bubble">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:4px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <span id="farma-3d-badge-status" style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981;"></span>
              <strong style="color:#2dd4bf; text-transform:uppercase; font-size:10px; letter-spacing:0.5px;">Farma 3D Copiloto</strong>
            </div>
            <span id="farma-3d-risk-pill" style="font-size:9px; font-weight:900; background:#0f766e; color:#ffffff; padding:1px 7px; border-radius:10px;">SEGURO</span>
          </div>
          <div id="farma-3d-dialogue-text" style="font-weight:700; color:#f1f5f9; font-size:11.5px;">
            ${this.lastDialogue}
          </div>
        </div>

        <!-- Malla 3D con Animación Antigravity (Capa B: Levitación vertical pura) -->
        <div id="farma-3d-mesh-wrapper" class="farma-3d-levitating-mesh" title="Haz clic para interactuar con Farma 3D">
          <div id="farma-3d-inner-canvas" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center;">
            <!-- model-viewer o Three.js fallback -->
          </div>
        </div>

        <!-- Sombra Dinámica Drop-Shadow Antigravity -->
        <div class="farma-3d-ground-shadow"></div>
      `;

      document.body.appendChild(root);

      // Evento de clic en Farma para saludar o abrir asistencia
      const mesh = root.querySelector('#farma-3d-mesh-wrapper');
      if (mesh) {
        mesh.addEventListener('click', () => {
          this.triggerBounceReaction();
          if (typeof window.openAiAssistantModal === 'function') {
            window.openAiAssistantModal('principio_activo');
          } else if (typeof window.openAppAiAssistantModal === 'function') {
            window.openAppAiAssistantModal('guia_app_whatsapp');
          }
        });
      }
    }

    render3DModel() {
      const container = document.getElementById('farma-3d-inner-canvas');
      if (!container) return;

      // Usar Google <model-viewer> si está disponible o fallback Three.js
      if (customElements.get('model-viewer') && this.activeModelUrl) {
        container.innerHTML = `
          <model-viewer
            id="farma-native-model-viewer"
            src="${this.activeModelUrl}"
            alt="Farma 3D Copiloto Médico"
            auto-rotate
            rotation-per-second="25deg"
            camera-controls
            disable-zoom
            shadow-intensity="1.4"
            exposure="1.1"
            interaction-prompt="none"
            style="width: 100%; height: 100%; outline: none; background: transparent;"
          >
          </model-viewer>
        `;
      } else if (typeof THREE !== 'undefined' && typeof FarmaIa3DViewer !== 'undefined') {
        container.innerHTML = '<div id="farma-3d-threejs-holder" style="width:100%; height:100%;"></div>';
        try {
          new FarmaIa3DViewer('farma-3d-threejs-holder', {
            width: 130,
            height: 130,
            interactive: true,
            initialMode: 'welcome'
          });
        } catch (e) {
          console.warn('[Farma3D] Error inicializando fallback Three.js:', e);
          this.renderImageFallback(container);
        }
      } else {
        this.renderImageFallback(container);
      }
    }

    renderImageFallback(container) {
      container.innerHTML = `
        <img
          src="/assets/robot_atencion.png"
          alt="Farma 3D"
          style="width:100%; height:100%; object-fit:contain;"
          onerror="this.src='/farmaia_model.jpg'"
        />
      `;
    }

    clearBubbleTimers() {
      if (this.bubbleTimer) {
        clearTimeout(this.bubbleTimer);
        this.bubbleTimer = null;
      }
      if (this.fadeTimer) {
        clearTimeout(this.fadeTimer);
        this.fadeTimer = null;
      }
    }

    resetBubbleToIdle(immediate = false) {
      this.clearBubbleTimers();
      const bubble = document.getElementById('farma-3d-bubble');
      const textEl = document.getElementById('farma-3d-dialogue-text');
      const badgeDot = document.getElementById('farma-3d-badge-status');
      const riskPill = document.getElementById('farma-3d-risk-pill');
      const mesh = document.getElementById('farma-3d-mesh-wrapper');

      const applyIdleState = () => {
        if (textEl) textEl.textContent = this.idleMessage;
        if (bubble) {
          bubble.classList.remove('bubble-risk-red', 'bubble-risk-yellow', 'bubble-fade-out');
          bubble.classList.add('bubble-idle');
        }
        if (mesh) mesh.classList.remove('risk-red');
        if (badgeDot) badgeDot.style.background = '#10b981';
        if (riskPill) {
          riskPill.style.background = '#0f766e';
          riskPill.textContent = 'EN REPOSO';
        }
      };

      if (immediate || !bubble) {
        applyIdleState();
      } else {
        bubble.classList.add('bubble-fade-out');
        this.fadeTimer = setTimeout(() => {
          applyIdleState();
        }, 400);
      }
    }

    scheduleBubbleInactivity(seconds = 12) {
      this.clearBubbleTimers();
      this.bubbleTimer = setTimeout(() => {
        if (this.currentRisk !== 'ROJO') {
          this.resetBubbleToIdle(false);
        }
      }, seconds * 1000);
    }

    setDialogue(text, risk = 'VERDE', blockCheckout = false) {
      if (!text) return;
      this.clearBubbleTimers();
      this.lastDialogue = text;
      this.currentRisk = risk;

      const bubble = document.getElementById('farma-3d-bubble');
      const textEl = document.getElementById('farma-3d-dialogue-text');
      const badgeDot = document.getElementById('farma-3d-badge-status');
      const riskPill = document.getElementById('farma-3d-risk-pill');
      const mesh = document.getElementById('farma-3d-mesh-wrapper');

      if (bubble) {
        bubble.classList.remove('bubble-fade-out', 'bubble-idle', 'bubble-risk-red', 'bubble-risk-yellow');
      }
      if (mesh) mesh.classList.remove('risk-red');
      if (textEl) textEl.textContent = text;

      const existingBanner = document.getElementById('farma-screen-alert-banner');
      if (existingBanner) existingBanner.remove();

      if (risk === 'ROJO' || blockCheckout) {
        if (bubble) bubble.classList.add('bubble-risk-red');
        if (mesh) mesh.classList.add('risk-red');
        if (badgeDot) badgeDot.style.background = '#ef4444';
        if (riskPill) {
          riskPill.style.background = '#dc2626';
          riskPill.textContent = 'PELIGRO CLÍNICO';
        }
        this.emitScreenAlert(text);
        this.lockCheckoutButton();
      } else if (risk === 'AMARILLO') {
        if (bubble) bubble.classList.add('bubble-risk-yellow');
        if (badgeDot) badgeDot.style.background = '#f59e0b';
        if (riskPill) {
          riskPill.style.background = '#d97706';
          riskPill.textContent = 'PRECAUCIÓN';
        }
        this.unlockCheckoutButton();
        this.scheduleBubbleInactivity(14);
      } else {
        if (badgeDot) badgeDot.style.background = '#10b981';
        if (riskPill) {
          riskPill.style.background = '#0f766e';
          riskPill.textContent = 'SEGURO';
        }
        this.unlockCheckoutButton();
        this.scheduleBubbleInactivity(12);
      }
    }

    emitScreenAlert(message) {
      if (document.getElementById('farma-screen-alert-banner')) return;
      const banner = document.createElement('div');
      banner.id = 'farma-screen-alert-banner';
      banner.className = 'farma-screen-alert-banner';
      banner.innerHTML = `
        <span style="font-size:20px;">🚨</span>
        <div>
          <span style="text-transform:uppercase; font-size:11px; letter-spacing:1px; display:block;">ALERTA DE SEGURIDAD DEL PACIENTE (FARMA 3D)</span>
          <span>${message}</span>
        </div>
        <button type="button" onclick="this.parentElement.remove()" style="background:rgba(255,255,255,0.2); border:none; color:#fff; border-radius:50%; width:24px; height:24px; cursor:pointer; font-weight:bold; margin-left:8px;">✕</button>
      `;
      document.body.appendChild(banner);
      setTimeout(() => {
        if (banner && banner.parentElement) banner.remove();
      }, 7000);
    }

    lockCheckoutButton() {
      const btn = document.getElementById('btn-cobrar-factura');
      if (btn) {
        btn.disabled = true;
        btn.setAttribute('data-farma-locked', 'true');
        btn.classList.add('opacity-40', 'cursor-not-allowed', 'bg-rose-700');
        btn.classList.remove('bg-emerald-500', 'hover:bg-emerald-600', 'bg-teal-600');
        btn.innerHTML = '🛑 FACTURACIÓN BLOQUEADA POR RIESGO CLÍNICO ROJO';
      }
    }

    unlockCheckoutButton() {
      const btn = document.getElementById('btn-cobrar-factura');
      if (btn && btn.getAttribute('data-farma-locked') === 'true') {
        btn.disabled = false;
        btn.removeAttribute('data-farma-locked');
        btn.classList.remove('opacity-40', 'cursor-not-allowed', 'bg-rose-700');
        btn.classList.add('bg-emerald-500', 'hover:bg-emerald-600');
        btn.innerHTML = '🧾 Facturar e Imprimir Recibo';
      }
    }

    triggerBounceReaction() {
      const mesh = document.getElementById('farma-3d-mesh-wrapper');
      if (mesh) {
        mesh.style.transform = 'scale(1.2) translateY(-20px)';
        setTimeout(() => {
          mesh.style.transform = '';
        }, 350);
      }
    }

    // =========================================================================
    // SEGUIMIENTO DINÁMICO: moverFarmaHacia(selectorDOM)
    // Lee getBoundingClientRect() y actualiza style.top y style.left del Contenedor Padre
    // =========================================================================
    moverFarmaHacia(selectorDOM, dialogueMsg = '') {
      const container = document.getElementById(this.containerId);
      if (!container) return;

      const targetEl = (typeof selectorDOM === 'string') 
        ? document.querySelector(selectorDOM) 
        : selectorDOM;

      if (dialogueMsg) {
        this.setDialogue(dialogueMsg, 'VERDE', false);
      }

      if (!targetEl) {
        this.resetPosition();
        return;
      }

      try {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (e) {}

      // Esperar brevemente a que el scroll se asiente y calcular coordenadas
      setTimeout(() => {
        const rect = targetEl.getBoundingClientRect();
        const containerW = container.offsetWidth || 230;
        const containerH = container.offsetHeight || 250;

        // Intentar posicionarlo a la derecha del elemento
        let left = rect.right + 25;
        let top = rect.top - 20;

        // Si se sale por la derecha de la ventana gráfica, ubicar a la izquierda
        if (left + containerW > window.innerWidth - 20) {
          left = Math.max(15, rect.left - containerW - 25);
        }

        // Si se sale por abajo de la ventana gráfica
        if (top + containerH > window.innerHeight - 20) {
          top = Math.max(15, window.innerHeight - containerH - 25);
        }
        if (top < 15) top = 15;

        // Quitar bottom/right para permitir la traslación fluida por top/left
        container.style.bottom = 'auto';
        container.style.right = 'auto';
        container.style.top = `${top}px`;
        container.style.left = `${left}px`;
      }, 120);
    }

    moveToElement(targetSelector, message = '') {
      return this.moverFarmaHacia(targetSelector, message);
    }

    resetPosition() {
      const container = document.getElementById(this.containerId);
      if (container) {
        container.classList.remove('training-mode');
        container.style.top = 'auto';
        container.style.left = 'auto';
        container.style.bottom = '24px';
        container.style.right = '24px';
      }
    }
  }

  // =========================================================================
  // SANDBOX INTERCEPTOR: ESTRICTAMENTE PROHIBIDO ENVIAR POST/PUT/DELETE EN DEMO
  // =========================================================================
  const originalFetch = window.fetch;
  let mockDatabaseState = {
    sales: [],
    patients: [
      { id: 991, nombre_completo: 'Carlos Santana (Demo)', cedula_identificacion: '402-1234567-8', telefono: '809-555-0199', alergias: 'Penicilinas' },
      { id: 992, nombre_completo: 'María Gómez (Hipertensa)', cedula_identificacion: '001-9876543-2', telefono: '809-555-0288', alergias: 'Ninguna' }
    ],
    vitals: [
      { id: 1, paciente_id: 991, presion_sistolica: 165, presion_diastolica: 102, pulso: 88, glucemia_mg_dl: 110, peso_kg: 82, talla_cm: 172, imc: 27.7 }
    ],
    inventory: [
      { id: 101, codigo_barras: '746001', nombre_comercial: 'Amoxicilina 500mg', principio_activo_dci: 'Amoxicilina', ubicacion_anaquel: 'Anaquel B-04', stock: 120, precio_venta: 25.0 },
      { id: 102, codigo_barras: '746002', nombre_comercial: 'Paracetamol 500mg', principio_activo_dci: 'Paracetamol', ubicacion_anaquel: 'Anaquel A-01', stock: 250, precio_venta: 10.0 },
      { id: 103, codigo_barras: '746003', nombre_comercial: 'Losartán 50mg', principio_activo_dci: 'Losartán', ubicacion_anaquel: 'Anaquel C-02', stock: 85, precio_venta: 18.0 }
    ]
  };

  window.isDemoMode = false;

  window.fetch = async function (resource, options = {}) {
    const url = (typeof resource === 'string') ? resource : (resource ? resource.url : '');
    const method = (options.method || 'GET').toUpperCase();

    if (window.isDemoMode && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      console.warn(`[Modo Entrenamiento Farma] 🛡️ INTERCEPTADA petición ${method} a ${url}. Almacenada temporalmente en memoria (Cero escritura en BD de producción).`);

      let bodyData = {};
      try {
        if (options.body) {
          bodyData = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        }
      } catch (e) {}

      if (url.includes('/api/sales')) {
        const mockSale = { id: 8000 + mockDatabaseState.sales.length, ncf: 'B0200004921', total: bodyData.total || 240.0, fecha: new Date().toISOString() };
        mockDatabaseState.sales.push(mockSale);
        return new Response(JSON.stringify({ ok: true, mensaje: 'Venta simulada guardada en memoria sandbox', venta: mockSale }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url.includes('/api/chronic-patients') || url.includes('/api/patients')) {
        const newPac = { id: 990 + mockDatabaseState.patients.length, ...bodyData };
        mockDatabaseState.patients.push(newPac);
        return new Response(JSON.stringify({ ok: true, mensaje: 'Paciente registrado en memoria temporal', paciente: newPac }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url.includes('/api/patient/vital-signs') || url.includes('/api/pharmacare/records')) {
        const newVital = { id: 500 + mockDatabaseState.vitals.length, ...bodyData, created_at: new Date().toISOString() };
        mockDatabaseState.vitals.push(newVital);
        return new Response(JSON.stringify({ ok: true, mensaje: 'Signos vitales registrados en memoria temporal', record: newVital }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url.includes('/api/products') || url.includes('/api/inventory')) {
        return new Response(JSON.stringify({ ok: true, mensaje: 'Inventario actualizado en memoria sandbox' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ ok: true, mock: true, mensaje: 'Operación simulada en Modo Entrenamiento con Farma' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return originalFetch.apply(this, arguments);
  };

  // =========================================================================
  // CONTROLADOR DE MODO ENTRENAMIENTO GUIADO POR DRIVER.JS & FARMA 3D
  // =========================================================================
  class FarmaTrainingTour {
    constructor(farmaWidget) {
      this.widget = farmaWidget;
      this.driverObj = null;
      this.currentTourStep = 0;
    }

    start() {
      window.isDemoMode = true;
      this.updateNavbarToggle(true);

      if (typeof showToast === 'function') {
        showToast('🎓 Modo Entrenamiento con Farma ACTIVADO (Sandbox en Memoria).', 'info');
      }

      if (typeof window.switchSysTab === 'function') {
        window.switchSysTab('pos');
      }

      loadDriverJs(() => {
        this.runGuidedSteps();
      });
    }

    stop() {
      window.isDemoMode = false;
      this.updateNavbarToggle(false);

      if (this.driverObj) {
        try { this.driverObj.destroy(); } catch (e) {}
      }

      if (this.widget) {
        this.widget.resetPosition();
        this.widget.setDialogue('Modo Entrenamiento finalizado. Sistema real listo para despachos.', 'VERDE', false);
      }

      if (typeof showToast === 'function') {
        showToast('Modo Entrenamiento cerrado. Conexión a Base de Datos en Producción restaurada.', 'success');
      }
    }

    toggle() {
      if (window.isDemoMode) {
        this.stop();
      } else {
        this.start();
      }
    }

    updateNavbarToggle(isActive) {
      const btn = document.getElementById('btn-nav-training-toggle');
      if (btn) {
        if (isActive) {
          btn.classList.add('active');
          btn.innerHTML = '🟢 <span>Modo Entrenamiento Activo</span>';
        } else {
          btn.classList.remove('active');
          btn.innerHTML = '🎓 <span>Modo Entrenamiento con Farma</span>';
        }
      }
    }

    async waitForVisibleElement(selector, maxWaitMs = 2500) {
      const startTime = Date.now();
      while (Date.now() - startTime < maxWaitMs) {
        const el = document.querySelector(selector);
        if (el) {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          const isDisplayed = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
          const hasSize = (rect.width > 2 || rect.height > 2 || el.getClientRects().length > 0);
          if (isDisplayed && hasSize && el.offsetParent !== null) {
            return el;
          }
        }
        await new Promise(r => setTimeout(r, 80));
      }
      return null;
    }

    runGuidedSteps() {
      const self = this;
      const tourSteps = [
        {
          element: '#pos-barcode-input',
          popover: {
            title: '1. Buscar Medicamento en Anaquel',
            description: 'Escribe aquí el nombre del medicamento (ej: "Amoxicilina" o "Paracetamol") o escanea su código de barras. Observa cómo el sistema despliega su ubicación exacta en el anaquel físico.',
            side: 'bottom',
            align: 'start'
          },
          farmaMsg: 'Escribe aquí el nombre del medicamento. Te mostraré su concentración, stock disponible y anaquel exacto.',
          onHighlighted: async () => {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('pos', false);
            const input = await self.waitForVisibleElement('#pos-barcode-input', 2000);
            if (input) {
              window.moverFarmaHacia('#pos-barcode-input', 'Escribe aquí el nombre del medicamento para consultar su anaquel.');
              input.focus();
              const onAction = () => {
                input.removeEventListener('input', onAction);
                setTimeout(() => {
                  if (self.driverObj && self.driverObj.hasNextStep()) self.driverObj.moveNext();
                }, 700);
              };
              input.addEventListener('input', onAction, { once: true });
            }
          }
        },
        {
          element: '#btn-pres-BLISTER',
          popover: {
            title: '2. Fraccionamiento en Mostrador',
            description: 'Haz clic en este botón para vender por Blíster o Unidad fraccionada, recalculando el precio al instante sin alterar el empaque original.',
            side: 'bottom',
            align: 'center'
          },
          farmaMsg: 'Haz clic en este botón para fraccionar en blíster o unidad según solicite el cliente.',
          onHighlighted: async () => {
            const btn = await self.waitForVisibleElement('#btn-pres-BLISTER', 2000);
            if (btn) {
              window.moverFarmaHacia('#btn-pres-BLISTER', 'Haz clic en este botón para fraccionar en blíster o unidad.');
            }
          }
        },
        {
          element: '#pos-client-cedula',
          popover: {
            title: '3. Identificar Paciente y Alergias',
            description: 'Digita aquí la cédula del paciente (ej: 402-1234567-8). Cruzo en milisegundos su historial clínico, alergias farmacológicas y presión arterial contra el carrito.',
            side: 'right',
            align: 'center'
          },
          farmaMsg: 'Digita aquí la cédula del paciente. Audito de inmediato contraindicaciones y alergias severas.',
          onHighlighted: async () => {
            const cedula = await self.waitForVisibleElement('#pos-client-cedula', 2000);
            if (cedula) {
              window.moverFarmaHacia('#pos-client-cedula', 'Digita aquí la cédula del paciente para auditar contraindicaciones.');
              cedula.focus();
              const onAction = () => {
                if (cedula.value.trim().length >= 4) {
                  cedula.removeEventListener('input', onAction);
                  setTimeout(() => {
                    if (self.driverObj && self.driverObj.hasNextStep()) self.driverObj.moveNext();
                  }, 700);
                }
              };
              cedula.addEventListener('input', onAction);
            }
          }
        },
        {
          element: '#btn-pay-EFECTIVO',
          popover: {
            title: '4. Seleccionar Método de Pago',
            description: 'Haz clic en esta opción para seleccionar Efectivo, Tarjeta de Crédito, Transferencia bancaria o Copago con Seguro Médico ARS.',
            side: 'top',
            align: 'start'
          },
          farmaMsg: 'Haz clic aquí para elegir Efectivo, Tarjeta o Seguro ARS.',
          onHighlighted: async () => {
            const btnPay = await self.waitForVisibleElement('#btn-pay-EFECTIVO', 2000);
            if (btnPay) {
              window.moverFarmaHacia('#btn-pay-EFECTIVO', 'Selecciona aquí el método de pago del cliente.');
            }
          }
        },
        {
          element: '#btn-cobrar-factura',
          popover: {
            title: '5. Facturar e Imprimir Comprobante Fiscal',
            description: 'Haz clic en este botón para emitir el comprobante NCF oficial y concluir la venta de forma segura.',
            side: 'top',
            align: 'center'
          },
          farmaMsg: '¡Excelente! Haz clic en este botón para generar la factura fiscal NCF autorizada.',
          onHighlighted: async () => {
            const cobroBtn = await self.waitForVisibleElement('#btn-cobrar-factura', 2000);
            if (cobroBtn) {
              window.moverFarmaHacia('#btn-cobrar-factura', 'Haz clic en este botón para emitir el comprobante fiscal NCF.');
              const onAction = () => {
                cobroBtn.removeEventListener('click', onAction);
                if (typeof showToast === 'function') {
                  showToast('🎉 ¡Entrenamiento interactivo del POS completado con éxito!', 'success');
                }
                setTimeout(() => self.stop(), 800);
              };
              cobroBtn.addEventListener('click', onAction, { once: true });
            }
          }
        },
        {
          element: '#top-right-services-config-btn',
          popover: {
            title: '6. Configuración de Operaciones y Servicios',
            description: 'Haz clic en este botón de la esquina superior derecha para activar o pausar pagos con tarjeta, servicio a domicilio y copago con seguro ARS.',
            side: 'left',
            align: 'center'
          },
          farmaMsg: 'Haz clic en este botón para ajustar los servicios activos en mostrador y en la App.',
          onHighlighted: async () => {
            const cfgBtn = await self.waitForVisibleElement('#top-right-services-config-btn', 2000);
            if (cfgBtn) {
              window.moverFarmaHacia('#top-right-services-config-btn', 'Haz clic aquí para gestionar servicios de mostrador.');
            }
          }
        }
      ];

      // Inicializar Driver.js (versión 1.x) con onHighlightStarted conectado a moverFarmaHacia
      if (window.driver && window.driver.js && window.driver.js.driver) {
        this.driverObj = window.driver.js.driver({
          showProgress: true,
          animate: true,
          allowClose: true,
          overlayColor: 'rgba(5, 10, 20, 0.85)',
          nextBtnText: 'Siguiente →',
          prevBtnText: '← Anterior',
          doneBtnText: 'Finalizar Tour',
          steps: tourSteps,
          onDestroyStarted: () => {
            self.stop();
          },
          onHighlightStarted: (element, step, options) => {
            if (element) {
              // Farma vuela físicamente a señalar el elemento resaltado
              window.moverFarmaHacia(element, (step && step.farmaMsg) ? step.farmaMsg : '');
            }
            if (step && typeof step.onHighlighted === 'function') {
              step.onHighlighted();
            }
          }
        });

        this.driverObj.drive();
      } else {
        tourSteps[0].onHighlighted();
      }
    }
  }

  // =========================================================================
  // FUNCION GLOBAL DE MOVILIDAD: window.moverFarmaHacia(selectorDOM)
  // =========================================================================
  window.moverFarmaHacia = function (selectorDOM, message = '') {
    if (window.farma3DWidget && typeof window.farma3DWidget.moverFarmaHacia === 'function') {
      window.farma3DWidget.moverFarmaHacia(selectorDOM, message);
    }
  };

  // =========================================================================
  // INICIALIZACIÓN GLOBAL EN EL ENTORNO
  // =========================================================================
  document.addEventListener('DOMContentLoaded', () => {
    // 1. Instanciar el único widget 3D flotante
    window.farma3DWidget = new FarmaFloatingWidget();

    // 2. Instanciar el controlador de entrenamiento
    window.farmaTraining = new FarmaTrainingTour(window.farma3DWidget);

    // 3. Conectar FarmaBrainClient con la burbuja 3D única
    if (window.FarmaBrainClient) {
      const originalRenderDialogue = window.FarmaBrainClient.renderFarmaDialogue;
      window.FarmaBrainClient.renderFarmaDialogue = function (data) {
        if (typeof originalRenderDialogue === 'function') {
          originalRenderDialogue(data);
        }
        if (window.farma3DWidget && data) {
          window.farma3DWidget.setDialogue(
            data.farma_dialogo || 'Parámetros evaluados correctamente.',
            data.nivel_riesgo || 'VERDE',
            Boolean(data.bloquear_cobro)
          );
        }
      };

      const originalEnforce = window.FarmaBrainClient.enforceCheckoutBlock;
      window.FarmaBrainClient.enforceCheckoutBlock = function (data) {
        if (typeof originalEnforce === 'function') originalEnforce(data);
        if (window.farma3DWidget) {
          window.farma3DWidget.lockCheckoutButton();
        }
      };

      const originalRelease = window.FarmaBrainClient.releaseCheckoutBlock;
      window.FarmaBrainClient.releaseCheckoutBlock = function () {
        if (typeof originalRelease === 'function') originalRelease();
        if (window.farma3DWidget) {
          window.farma3DWidget.unlockCheckoutButton();
        }
      };
    }

    // 4. Conectar el interruptor en la barra superior si existe
    const navBtn = document.getElementById('btn-nav-training-toggle');
    if (navBtn) {
      navBtn.addEventListener('click', () => {
        window.farmaTraining.toggle();
      });
    }

    // =========================================================================
    // 5. SEGUIMIENTO DINÁMICO Y EVENTOS DE LA INTERFAZ:
    // Focus en buscador de medicamentos, selección de paciente y facturación
    // =========================================================================

    // A. Focus en el buscador de medicamentos: Farma vuela hacia él
    const barcodeInp = document.getElementById('pos-barcode-input');
    if (barcodeInp) {
      barcodeInp.addEventListener('focus', () => {
        window.moverFarmaHacia(barcodeInp, 'Buscador de medicamentos activo. Escribe el fármaco para consultar stock y anaquel.');
      });
      barcodeInp.addEventListener('blur', () => {
        setTimeout(() => {
          // Si no hay otro foco interactivo, regresar a reposo tras 3 segundos
          if (document.activeElement !== barcodeInp && !window.isDemoMode) {
            window.farma3DWidget.resetPosition();
          }
        }, 3000);
      });
    }

    // B. Selección de paciente en mostrador: Farma vuela hacia la sección del paciente
    if (typeof window.selectPosPatient === 'function') {
      const origSelectPosPatient = window.selectPosPatient;
      window.selectPosPatient = function (patient) {
        const res = origSelectPosPatient.apply(this, arguments);
        if (window.farma3DWidget && patient) {
          const nombre = patient.nombre || 'Paciente';
          const alergiaTxt = patient.alergias ? ` (Alergias: ${patient.alergias})` : '';
          const msg = `Paciente ${nombre} cargado.${alergiaTxt} Revisando historial clínico cruzado...`;
          
          const patientTarget = document.getElementById('pos-client-cedula') || document.getElementById('pos-patient-search');
          if (patientTarget) {
            window.moverFarmaHacia(patientTarget, msg);
          } else {
            window.farma3DWidget.setDialogue(msg, 'VERDE', false);
          }
        }
        return res;
      };
    }

    // C. Click en el botón de facturar: Farma vuela hacia el panel de cobro
    const cobroBtn = document.getElementById('btn-cobrar-factura');
    if (cobroBtn) {
      cobroBtn.addEventListener('mouseenter', () => {
        if (!cobroBtn.disabled) {
          window.moverFarmaHacia(cobroBtn, 'Listo para facturación. Verificando emisión del comprobante NCF fiscal.');
        }
      });
    }

    // D. Interceptar switchSysTab para limpiar la burbuja y reposicionar
    if (typeof window.switchSysTab === 'function') {
      const origSwitchSysTab = window.switchSysTab;
      window.switchSysTab = function (tab, pushToHistory = true) {
        const res = origSwitchSysTab.apply(this, arguments);
        if (window.farma3DWidget) {
          window.farma3DWidget.resetPosition();
          window.farma3DWidget.resetBubbleToIdle(true);
        }
        return res;
      };
    }

    // E. Interceptar renderPosCart para detectar carrito vacío
    if (typeof window.renderPosCart === 'function') {
      const origRenderPosCart = window.renderPosCart;
      window.renderPosCart = function () {
        const res = origRenderPosCart.apply(this, arguments);
        const cartLen = (window.sysState && window.sysState.posCart) ? window.sysState.posCart.length : 0;
        if (cartLen === 0 && window.farma3DWidget && window.farma3DWidget.currentRisk !== 'ROJO') {
          window.farma3DWidget.resetBubbleToIdle(false);
          if (!window.isDemoMode) {
            window.farma3DWidget.resetPosition();
          }
        }
        return res;
      };
    }

    // F. Interceptar clearSelectedPosPatient para restaurar reposo
    if (typeof window.clearSelectedPosPatient === 'function') {
      const origClearPatient = window.clearSelectedPosPatient;
      window.clearSelectedPosPatient = function () {
        const res = origClearPatient.apply(this, arguments);
        if (window.farma3DWidget && window.farma3DWidget.currentRisk !== 'ROJO') {
          window.farma3DWidget.resetBubbleToIdle(false);
          if (!window.isDemoMode) {
            window.farma3DWidget.resetPosition();
          }
        }
        return res;
      };
    }
  });

  // Exportar a window
  window.FarmaFloatingWidget = FarmaFloatingWidget;
  window.FarmaTrainingTour = FarmaTrainingTour;
})();
