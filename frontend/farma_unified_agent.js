/* =========================================================================
   FARMA UNIFIED AGENT — SINGLETON GLOBAL (FARMA MASTER AVATAR)
   - Componente único e irrepetible en todo el DOM (#farma-master-avatar).
   - Utilizado tanto en App de Pacientes (index.html) como en el POS Físico (sistema.html).
   - Maneja el renderizado del avatar visual de Farma (con soporte para modelo 3D GLB y
     fallback hiper-estético con ojos LED y halo médico).
   - Cinemática completa con `farmaFlyAndPoint(targetSelector, mensaje, accionEsperada)`:
     * Calcula coordenadas con getBoundingClientRect().
     * Vuelo físico por la pantalla con animación cinemática suave e inclinación.
     * Rotación y orientación del avatar apuntando hacia el objetivo.
     * Indicador direccional animado (brazo holográfico pulsante `@keyframes pointBounce`).
     * Espera interactiva que valida clics o escritura del usuario antes de celebrar y continuar.
   ========================================================================= */

(function () {
  'use strict';

  // ID Maestro del nodo único
  const FARMA_MASTER_ID = 'farma-master-avatar';
  const FARMA_ROBOT_GLB = 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/models/gltf/RobotExpressive/RobotExpressive.glb';

  // Variables de control de cinemática
  let activeInteractionListener = null;
  let activeTargetElement = null;
  let flightTimeout = null;
  let farmaState = {
    isExpanded: false,
    isFlying: false,
    currentStepIndex: 0,
    hasArrived: false,
    pointingSide: 'right', // 'right' | 'left'
    defaultPosition: { bottom: 24, right: 24 }
  };

  // Inyectar Estilos Cinemáticos y Animaciones
  function injectUnifiedStyles() {
    if (document.getElementById('farma-unified-agent-styles')) return;

    const style = document.createElement('style');
    style.id = 'farma-unified-agent-styles';
    style.textContent = `
      /* =========================================================================
         1. CONTENEDOR MAESTRO DE TRASLACIÓN Y VUELO CINEMÁTICO (#farma-master-avatar)
         ========================================================================= */
      #farma-master-avatar {
        position: fixed !important;
        z-index: 99999 !important;
        display: flex;
        flex-direction: column;
        align-items: center;
        pointer-events: auto;
        user-select: none;
        transition: transform 0.65s cubic-bezier(0.22, 1, 0.36, 1),
                    top 0.65s cubic-bezier(0.22, 1, 0.36, 1),
                    left 0.65s cubic-bezier(0.22, 1, 0.36, 1),
                    bottom 0.65s cubic-bezier(0.22, 1, 0.36, 1),
                    right 0.65s cubic-bezier(0.22, 1, 0.36, 1);
        will-change: top, left, transform;
      }

      /* Inclinación durante el vuelo hacia la derecha o izquierda */
      #farma-master-avatar.flying-right .farma-mesh-wrapper {
        transform: rotate(14deg) scale(1.04);
        transition: transform 0.3s ease;
      }
      #farma-master-avatar.flying-left .farma-mesh-wrapper {
        transform: rotate(-14deg) scale(1.04);
        transition: transform 0.3s ease;
      }

      
      /* Anillo de Partículas / Audio Visualizer alrededor del avatar */
      .farma-audio-halo {
        position: absolute;
        inset: -10px;
        border-radius: 9999px;
        border: 2px solid transparent;
        pointer-events: none;
        transition: all 0.15s ease;
      }
      .farma-audio-halo.active-listening {
        border-color: rgba(20, 184, 166, 0.7);
        box-shadow: 0 0 25px rgba(20, 184, 166, 0.6), inset 0 0 15px rgba(20, 184, 166, 0.4);
        animation: haloPulse 1.2s infinite alternate ease-in-out;
      }
      .farma-audio-halo.active-speaking {
        border-color: rgba(56, 189, 248, 0.85);
        box-shadow: 0 0 35px rgba(56, 189, 248, 0.8), inset 0 0 20px rgba(56, 189, 248, 0.5);
        animation: haloSpeaking 0.6s infinite alternate ease-in-out;
      }
      @keyframes haloPulse {
        0% { transform: scale(0.96); opacity: 0.6; }
        100% { transform: scale(1.12); opacity: 1; }
      }
      @keyframes haloSpeaking {
        0% { transform: scale(1.0); opacity: 0.75; }
        100% { transform: scale(1.22); opacity: 1; filter: hue-rotate(30deg); }
      }

      /* Boca animada para Lip-Sync en el fallback SVG */
      .farma-mouth-talking {
        animation: mouthLipSync 0.22s infinite alternate ease-in-out !important;
        transform-origin: 50% 68%;
      }
      @keyframes mouthLipSync {
        0% { transform: scaleY(0.4) scaleX(0.85); }
        50% { transform: scaleY(1.8) scaleX(1.15); }
        100% { transform: scaleY(1.1) scaleX(0.95); }
      }

      /* Widget interactivo dentro de la burbuja */
      .farma-interactive-widget {
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px dashed rgba(20, 184, 166, 0.4);
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .farma-action-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 10px;
        border-radius: 9999px;
        font-size: 11px;
        font-weight: 800;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .farma-action-chip-primary {
        background: linear-gradient(135deg, #0d9488, #14b8a6);
        color: #ffffff;
        box-shadow: 0 3px 10px rgba(13, 148, 136, 0.4);
        border: 1px solid rgba(94, 234, 212, 0.5);
      }
      .farma-action-chip-primary:hover {
        transform: translateY(-1.5px) scale(1.04);
        box-shadow: 0 5px 15px rgba(13, 148, 136, 0.6);
      }
      .farma-action-chip-secondary {
        background: rgba(30, 41, 59, 0.85);
        color: #94a3b8;
        border: 1px solid rgba(71, 85, 105, 0.6);
      }
      .farma-action-chip-secondary:hover {
        background: rgba(51, 65, 85, 0.95);
        color: #ffffff;
      }

      /* =========================================================================
         2. ANIMACIONES DE LEVITACIÓN Y PULSO MÉDICO
         ========================================================================= */
      @keyframes farmaLevitation {
        0%, 100% {
          transform: translateY(0px) rotate(0deg);
        }
        50% {
          transform: translateY(-10px) rotate(1deg);
        }
      }

      @keyframes farmaDynamicShadow {
        0%, 100% {
          transform: scale(1) scaleY(0.35);
          opacity: 0.5;
        }
        50% {
          transform: scale(0.7) scaleY(0.25);
          opacity: 0.25;
        }
      }

      /* =========================================================================
         3. INDICADOR DIRECCIONAL ANIMADO (BRAZO / HAZ GUÍA PULSANTE)
         ========================================================================= */
      @keyframes pointBounceRight {
        0%, 100% {
          transform: translateX(0px) scale(1);
          opacity: 0.95;
        }
        50% {
          transform: translateX(12px) scale(1.15);
          opacity: 1;
        }
      }

      @keyframes pointBounceLeft {
        0%, 100% {
          transform: translateX(0px) scaleX(-1);
          opacity: 0.95;
        }
        50% {
          transform: translateX(-12px) scaleX(-1) scale(1.15);
          opacity: 1;
        }
      }

      .farma-pointer-arrow {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        pointer-events: none;
        z-index: 100001;
        display: none;
        filter: drop-shadow(0 4px 12px rgba(13, 148, 136, 0.6));
      }

      .farma-pointer-arrow.point-right {
        right: -55px;
        display: flex;
        animation: pointBounceRight 0.85s infinite ease-in-out;
      }

      .farma-pointer-arrow.point-left {
        left: -55px;
        display: flex;
        animation: pointBounceLeft 0.85s infinite ease-in-out;
      }

      /* =========================================================================
         4. RESALTADO DINÁMICO DEL ELEMENTO OBJETIVO
         ========================================================================= */
      .farma-target-highlight {
        position: relative !important;
        box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.7), 0 0 25px rgba(20, 184, 166, 0.5) !important;
        animation: farmaTargetPulse 1.4s infinite !important;
        z-index: 99990 !important;
      }

      @keyframes farmaTargetPulse {
        0%, 100% {
          box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.8), 0 0 16px rgba(13, 148, 136, 0.4);
        }
        50% {
          box-shadow: 0 0 0 7px rgba(13, 148, 136, 0.2), 0 0 30px rgba(13, 148, 136, 0.7);
        }
      }

      /* Malla del Robot */
      .farma-mesh-wrapper {
        position: relative;
        width: 120px;
        height: 120px;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: farmaLevitation 3.8s ease-in-out infinite;
        cursor: grab;
      }

      .farma-mesh-wrapper:active {
        cursor: grabbing;
      }

      /* Burbuja de Diálogo Inteligente */
      .farma-bubble-container {
        position: absolute;
        bottom: 125px;
        width: 290px;
        background: rgba(15, 23, 42, 0.94);
        backdrop-filter: blur(12px);
        border: 2px solid rgba(20, 184, 166, 0.7);
        border-radius: 20px;
        padding: 12px 14px;
        color: #f8fafc;
        font-family: system-ui, -apple-system, sans-serif;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
        transition: opacity 0.3s ease, transform 0.3s ease;
      }

      .farma-bubble-container.hidden-bubble {
        opacity: 0;
        transform: translateY(10px) scale(0.95);
        pointer-events: none;
      }

      .farma-bubble-tail {
        position: absolute;
        bottom: -9px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 9px solid transparent;
        border-right: 9px solid transparent;
        border-top: 9px solid rgba(20, 184, 166, 0.8);
      }
    `;
    document.head.appendChild(style);
  }

  // Clase Principal del Agente Unificado
  class FarmaUnifiedAgent {
    constructor() {
      this.root = null;
      this.modelViewer = null;
      this.bubbleEl = null;
      this.bubbleText = null;
      this.bubbleTitle = null;
      this.pointerEl = null;
      this.autoDismissTimer = null;

      this.haloEl = null;
      this.svgMouthEl = null;
      this.headTrackingBound = false;
      this.lastClickTime = 0;
      this.init();
    }

    init() {
      injectUnifiedStyles();

      // Eliminar CUALQUIER instancia duplicada antigua
      const oldNodes = document.querySelectorAll('#farma-master-avatar, #farma-container, #farma-copilot-widget');
      oldNodes.forEach((node) => node.remove());

      // Crear el ÚNICO nodo singleton
      this.root = document.createElement('div');
      this.root.id = FARMA_MASTER_ID;
      this.root.style.bottom = `${farmaState.defaultPosition.bottom}px`;
      this.root.style.right = `${farmaState.defaultPosition.right}px`;

      this.root.innerHTML = `
        <!-- Burbuja de Diálogo Interactiva -->
        <div id="farma-master-bubble" class="farma-bubble-container hidden-bubble">
          <div class="flex items-center justify-between gap-2 border-b border-teal-500/30 pb-1.5 mb-2">
            <div class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span id="farma-bubble-title" class="text-xs font-black text-teal-300 uppercase tracking-wider">Farma IA</span>
            </div>
            <button type="button" onclick="window.farmaUnifiedAgent.closeBubble()" class="text-slate-400 hover:text-white text-xs font-bold px-1.5 py-0.5 rounded transition cursor-pointer">✕</button>
          </div>
          <div id="farma-bubble-text" class="text-xs font-medium text-slate-200 leading-snug">
            Hola, soy Farma, el copiloto inteligente de Farmacia Davalsi. ¿En qué puedo asistirte hoy?
          </div>
          <div class="farma-bubble-tail"></div>
        </div>

        <!-- Malla Levitante del Avatar con Indicador Direccional -->
        <div class="farma-mesh-wrapper" id="farma-master-mesh" onclick="window.farmaUnifiedAgent.handleAvatarClick()">
          <div id="farma-audio-halo" class="farma-audio-halo"></div>
          <!-- Puntero Animado Direccional -->
          <div id="farma-master-pointer" class="farma-pointer-arrow">
            <svg class="w-12 h-12 text-teal-400 filter drop-shadow-md" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13.025 1l-2.847 2.828 6.176 6.176h-16.354v3.992h16.354l-6.176 6.176 2.847 2.828 10.975-11z"/>
            </svg>
          </div>

          <!-- Componente 3D Model Viewer con Robot Expressive de Three.js -->
          <model-viewer
            id="farma-master-mv"
            src="${FARMA_ROBOT_GLB}"
            alt="Farma IA Robot Avatar"
            autoplay
            animation-name="Idle"
            shadow-intensity="1"
            exposure="1.1"
            interaction-prompt="none"
            style="width: 110px; height: 110px; background: transparent; --poster-color: transparent;"
          >
            <!-- Fallback Robótico Hiper-Estético si model-viewer no carga o tarda -->
            <div slot="poster" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
              <svg viewBox="0 0 100 100" class="w-24 h-24 filter drop-shadow-lg">
                <circle cx="50" cy="50" r="42" fill="#0f172a" stroke="#14b8a6" stroke-width="4"/>
                <circle cx="36" cy="46" r="6" fill="#34d399">
                  <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite"/>
                </circle>
                <circle cx="64" cy="46" r="6" fill="#34d399">
                  <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite"/>
                </circle>
                <path id="farma-svg-mouth" d="M38 65 Q50 74 62 65" stroke="#34d399" stroke-width="3" fill="none" stroke-linecap="round"/>
                <path d="M47 28 H53 V38 H47 Z M42 33 H58 V33 H42 Z" stroke="#38bdf8" stroke-width="3" fill="none"/>
              </svg>
            </div>
          </model-viewer>
        </div>

        <!-- Sombra Dinámica Inferior -->
        <div class="w-14 h-3 bg-teal-900/40 rounded-full blur-xs -mt-1 pointer-events-none" style="animation: farmaDynamicShadow 3.8s ease-in-out infinite;"></div>
      `;

      document.body.appendChild(this.root);

      this.modelViewer = document.getElementById('farma-master-mv');
      this.bubbleEl = document.getElementById('farma-master-bubble');
      this.bubbleText = document.getElementById('farma-bubble-text');
      this.bubbleTitle = document.getElementById('farma-bubble-title');
            this.pointerEl = document.getElementById('farma-master-pointer');
      this.haloEl = document.getElementById('farma-audio-halo');
      this.svgMouthEl = document.getElementById('farma-svg-mouth');

      this.initHeadTracking();


      // Escuchar eventos globales del ciclo de vida
      this.bindGlobalTriggers();
    }

    setAnimation(animName) {
      if (this.modelViewer && this.modelViewer.availableAnimations) {
        if (this.modelViewer.availableAnimations.includes(animName)) {
          this.modelViewer.animationName = animName;
        }
      }
    }

    say(text, title = 'Farma IA', autoDismissSec = 12, actions = []) {
      if (!this.bubbleEl || !this.bubbleText) return;
      this.bubbleTitle.textContent = title;

      let html = text;
      if (Array.isArray(actions) && actions.length > 0) {
        html += '<div class="farma-interactive-widget"><div class="text-[10px] uppercase font-bold text-teal-300">Acciones Rápidas:</div><div class="flex flex-wrap gap-1.5">';
        actions.forEach((act, idx) => {
          const btnClass = act.primary ? 'farma-action-chip farma-action-chip-primary' : 'farma-action-chip farma-action-chip-secondary';
          html += `<button type="button" class="${btnClass}" onclick="window.farmaUnifiedAgent.triggerWidgetAction(${idx})">${act.icon || '⚡'} ${act.label}</button>`;
        });
        html += '</div></div>';
        this._currentActions = actions;
      } else {
        this._currentActions = [];
      }

      this.bubbleText.innerHTML = html;
      this.bubbleEl.classList.remove('hidden-bubble');

      if (this.autoDismissTimer) clearTimeout(this.autoDismissTimer);
      if (autoDismissSec > 0) {
        this.autoDismissTimer = setTimeout(() => {
          this.closeBubble();
        }, autoDismissSec * 1000);
      }
    }

    closeBubble() {
      if (this.bubbleEl) {
        this.bubbleEl.classList.add('hidden-bubble');
      }
    }


    /* =========================================================================
       SEGUIMIENTO OCULAR Y DE CABEZA CON EL CURSOR (HEAD TRACKING)
       ========================================================================= */
    initHeadTracking() {
      if (this.headTrackingBound) return;
      this.headTrackingBound = true;

      window.addEventListener('mousemove', (e) => {
        if (!this.root || farmaState.isFlying) return;
        const rect = this.root.getBoundingClientRect();
        const avatarCenterX = rect.left + rect.width / 2;
        const avatarCenterY = rect.top + rect.height / 2;

        const deltaX = (e.clientX - avatarCenterX) / window.innerWidth;
        const deltaY = (e.clientY - avatarCenterY) / window.innerHeight;

        // Limitar rotación sutil entre -15 y +15 grados
        const rotY = Math.max(-16, Math.min(16, deltaX * 32));
        const rotX = Math.max(-10, Math.min(10, -deltaY * 20));

        if (this.modelViewer) {
          const baseYaw = farmaState.pointingSide === 'left' ? 45 : (farmaState.pointingSide === 'right' ? -45 : 0);
          this.modelViewer.cameraOrbit = `${baseYaw + rotY}deg ${75 - rotX}deg 105%`;
        }

        const meshEl = document.getElementById('farma-master-mesh');
        if (meshEl && !meshEl.classList.contains('farma-mouth-talking')) {
          meshEl.style.transform = `perspective(600px) rotateY(${rotY * 0.45}deg) rotateX(${rotX * 0.45}deg)`;
        }
      }, { passive: true });
    }

    /* =========================================================================
       LIP-SYNC Y AUDIO VISUALIZER (ESTADOS AUDITIVOS EN VIVO)
       ========================================================================= */
    setAudioState(state) { // 'idle' | 'listening' | 'speaking'
      if (!this.haloEl) this.haloEl = document.getElementById('farma-audio-halo');
      if (!this.svgMouthEl) this.svgMouthEl = document.getElementById('farma-svg-mouth');

      if (this.haloEl) {
        this.haloEl.classList.remove('active-listening', 'active-speaking');
        if (state === 'listening') this.haloEl.classList.add('active-listening');
        if (state === 'speaking') this.haloEl.classList.add('active-speaking');
      }

      if (this.svgMouthEl) {
        if (state === 'speaking') {
          this.svgMouthEl.classList.add('farma-mouth-talking');
        } else {
          this.svgMouthEl.classList.remove('farma-mouth-talking');
        }
      }

      if (state === 'speaking') {
        this.setAnimation('Talking');
      } else if (state === 'listening') {
        this.setAnimation('Wave');
      } else {
        this.setAnimation('Idle');
      }
    }

    /* =========================================================================
       HOTSPOTS TÁCTILES SOBRE EL AVATAR (DOBLE CLIC, UN CLIC)
       ========================================================================= */
    handleAvatarClick() {
      const now = Date.now();
      const isDouble = (now - this.lastClickTime) < 320;
      this.lastClickTime = now;

      if (isDouble) {
        // Doble clic: Resumen de Carrito / Estado
        const isPOS = window.location.pathname.includes('sistema') || Boolean(document.getElementById('pos-barcode-input'));
        if (isPOS && window.sysState && window.sysState.posCart) {
          const count = window.sysState.posCart.length;
          const total = (typeof window.calculatePosCartTotal === 'function') ? window.calculatePosCartTotal() : 0;
          this.say(`Llevas ${count} producto(s) en el carrito por un total de RD$ ${Number(total).toFixed(2)}.`, 'Resumen de Carrito');
        } else if (window.state && window.state.cart) {
          const count = window.state.cart.length;
          this.say(`Tienes ${count} producto(s) en tu carrito de compras de la farmacia.`, 'Tu Carrito');
        } else {
          this.say('Sistema listo y sincronizado. Di "Farma" seguido de tu orden.', 'Farma Estado');
        }
        return;
      }

      // Un clic: Repetir o Saludo
      this.setAnimation('Wave');
      this.say('Hola, estoy atenta a tu voz. Solo di <strong>"Farma..."</strong> seguido de lo que necesitas.', 'Farma Copiloto');
      setTimeout(() => {
        this.setAnimation('Idle');
      }, 3000);
    }

    _oldHandleAvatarClick() {
      this.setAnimation('Wave');
      this.say('Hola, soy Farma, el copiloto inteligente de Farmacia Davalsi. ¿En qué puedo asistirte hoy?', 'Farma Copiloto');
      setTimeout(() => {
        this.setAnimation('Idle');
      }, 3500);
    }

    triggerWidgetAction(index) {
      if (this._currentActions && this._currentActions[index]) {
        const act = this._currentActions[index];
        if (typeof act.onClick === 'function') {
          act.onClick();
        } else if (typeof act.command === 'string' && window.farmaVoice) {
          window.farmaVoice.handleFinalVoiceTranscript(act.command, true);
        }
      }
    }

    bindGlobalTriggers() {
      // Reaccionar a cambios de vista en el POS o App
      window.addEventListener('popstate', () => this.returnToHome());
    }

    returnToHome() {
      this.removeActivePointer();
      this.root.style.top = 'auto';
      this.root.style.left = 'auto';
      this.root.style.bottom = `${farmaState.defaultPosition.bottom}px`;
      this.root.style.right = `${farmaState.defaultPosition.right}px`;
      this.root.className = '';
      this.setAnimation('Idle');
      if (this.modelViewer) {
        this.modelViewer.setAttribute('camera-orbit', '0deg 75deg 105%');
      }
    }

    removeActivePointer() {
      if (this.pointerEl) {
        this.pointerEl.className = 'farma-pointer-arrow';
      }
      if (activeTargetElement) {
        activeTargetElement.classList.remove('farma-target-highlight');
        if (activeInteractionListener && activeTargetElement) {
          activeTargetElement.removeEventListener('click', activeInteractionListener);
          activeTargetElement.removeEventListener('input', activeInteractionListener);
        }
        activeTargetElement = null;
        activeInteractionListener = null;
      }
    }

    /* =========================================================================
       2 & 3. FUNCIÓN MAESTRA: farmaFlyAndPoint(targetSelector, mensaje, accionEsperada)
       ========================================================================= */
    flyAndPoint(targetSelector, mensaje = '', accionEsperada = null, onComplete = null) {
      const el = typeof targetSelector === 'string' ? document.querySelector(targetSelector) : targetSelector;
      if (!el) {
        console.warn(`[Farma] No se encontró elemento para señalar: ${targetSelector}`);
        if (mensaje) this.say(mensaje);
        return;
      }

      this.removeActivePointer();
      activeTargetElement = el;

      // a) Asegurar visibilidad con scroll suave
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

      // Esperar 250ms a que el scroll se asiente antes de calcular coordenadas
      setTimeout(() => {
        const rect = el.getBoundingClientRect();
        const avatarW = 120;
        const avatarH = 120;
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;

        // b) Calcular posición de aterrizaje al lado (izquierda o derecha)
        let targetLeft = 0;
        let targetTop = rect.top + (rect.height / 2) - (avatarH / 2);
        let pointSide = 'right';

        // Si hay espacio a la izquierda del elemento
        if (rect.left > (avatarW + 40)) {
          targetLeft = rect.left - avatarW - 20;
          pointSide = 'right'; // Farma está a la izquierda y apunta a la derecha hacia el botón
        } else if (screenW - rect.right > (avatarW + 40)) {
          // Espacio a la derecha
          targetLeft = rect.right + 20;
          pointSide = 'left'; // Farma está a la derecha y apunta a la izquierda hacia el botón
        } else {
          // Si es muy estrecho (móvil), aterrizar justo arriba
          targetLeft = Math.max(10, Math.min(screenW - avatarW - 10, rect.left + (rect.width / 2) - (avatarW / 2)));
          targetTop = Math.max(10, rect.top - avatarH - 20);
          pointSide = 'right';
        }

        // Clamp dentro de la pantalla
        targetTop = Math.max(20, Math.min(screenH - avatarH - 20, targetTop));
        targetLeft = Math.max(10, Math.min(screenW - avatarW - 10, targetLeft));

        // c) Cinemática de Vuelo
        const currentRect = this.root.getBoundingClientRect();
        const flyingRight = targetLeft > currentRect.left;

        this.root.classList.remove('flying-right', 'flying-left');
        this.root.classList.add(flyingRight ? 'flying-right' : 'flying-left');
        this.setAnimation('Walking');

        this.root.style.bottom = 'auto';
        this.root.style.right = 'auto';
        this.root.style.top = `${targetTop}px`;
        this.root.style.left = `${targetLeft}px`;

        // Al finalizar el vuelo (650ms)
        if (flightTimeout) clearTimeout(flightTimeout);
        flightTimeout = setTimeout(() => {
          this.root.classList.remove('flying-right', 'flying-left');
          this.setAnimation('Idle');

          // d) Orientación del Cuerpo hacia el botón (rotar modelo 3D o escala)
          if (this.modelViewer) {
            if (pointSide === 'right') {
              this.modelViewer.setAttribute('camera-orbit', '-45deg 75deg 105%');
            } else {
              this.modelViewer.setAttribute('camera-orbit', '45deg 75deg 105%');
            }
          }

          // e) Desplegar Indicador Direccional Animado hacia el botón
          if (this.pointerEl) {
            this.pointerEl.className = `farma-pointer-arrow point-${pointSide}`;
          }

          // Resaltar elemento objetivo
          el.classList.add('farma-target-highlight');

          // Diálogo explicativo
          if (mensaje) {
            this.say(mensaje, 'Paso Guiado por Farma', 0); // No desaparece hasta completar la acción
          }

          // f) Espera Interactiva: validar clic o escritura del usuario
          activeInteractionListener = (e) => {
            // Usuario interactuó con el objetivo!
            this.setAnimation('ThumbsUp');
            this.say('¡Excelente! Muy bien hecho.', 'Farma Aprobación', 3);

            // Retirar puntero y highlight
            this.removeActivePointer();

            if (typeof onComplete === 'function') {
              setTimeout(() => {
                onComplete();
              }, 1200);
            }
          };

          const eventType = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') ? 'input' : 'click';
          el.addEventListener(eventType, activeInteractionListener, { once: true });

        }, 660);
      }, 260);
    }
  }

  // Instanciar singleton en el objeto global de ventana
  const agent = new FarmaUnifiedAgent();
  window.farmaUnifiedAgent = agent;

  // Exportar función global obligatoria
  window.farmaFlyAndPoint = function (targetSelector, mensaje, accionEsperada, onComplete) {
    window.farmaUnifiedAgent.flyAndPoint(targetSelector, mensaje, accionEsperada, onComplete);
  };

  // Compatibilidad con invocaciones existentes
  window.moverFarmaHacia = function (selector, mensaje) {
    window.farmaFlyAndPoint(selector, mensaje);
  };

  window.farmaHablar = function (mensaje, titulo) {
    window.farmaUnifiedAgent.say(mensaje, titulo);
  };

  console.log('[FarmaUnifiedAgent] Singleton global 3D inicializado con cinemática farmaFlyAndPoint.');
})();
