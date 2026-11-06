/* =========================================================================
   FARMA VOICE ENGINE — ESCUCHA CONTINUA POR PALABRA DE ACTIVACIÓN ("FARMA")
   - Se activa UNA SOLA VEZ y permanece en modo centinela continuo (Always-On).
   - Ignora conversaciones normales en el mostrador y SOLO ejecuta órdenes
     cuando escucha su nombre ("Farma, ...") o durante una ventana de seguimiento
     de 10 segundos tras haberla llamado.
   - Síntesis de Voz Neuronal Fluida con Control de Silencio (Mute/Unmute) y
     protección anti-eco (no se escucha a sí misma mientras habla).
   - Verificación Biométrica Acústica en el POS (hasta 5 voces grabadas):
     * Analiza en segundo plano la huella vocal (Pitch F0 + Centroide Espectral).
   ========================================================================= */

(function () {
  'use strict';

  const STORAGE_MUTE_KEY = 'farma_voice_muted';
  const STORAGE_ALWAYS_ON_KEY = 'farma_voice_always_on';
  const isPOS = window.location.pathname.includes('sistema') || Boolean(document.getElementById('pos-barcode-input'));

  // Expresión regular para detectar cuando llaman a "Farma" (incluyendo variantes fonéticas comunes del STT en español)
  const WAKE_WORD_REGEX = /\b(farma|pharma|palma|alma|forma|farmacia)\b[\s,.:;!\-]*(.*)/i;

  class FarmaVoiceEngine {
    constructor() {
      this.isMuted = localStorage.getItem(STORAGE_MUTE_KEY) === 'true';
      // Por defecto activado una vez que el usuario lo enciende, recordando su estado entre recargas
      this.alwaysOnEnabled = localStorage.getItem(STORAGE_ALWAYS_ON_KEY) === 'true';
      this.isListening = false;
      this.isSpeaking = false;
      this.isEnrolling = false;
      this.awaitingOrderAfterWake = false;
      this.wakeWindowTimer = null;
      this.restartTimer = null;

      this.recognition = null;
      this.synth = window.speechSynthesis || null;
      this.selectedVoice = null;
      this.voiceProfiles = [];
      this.maxVoices = 5;
      this.sessionId = (isPOS ? 'POS_' : 'APP_') + (sessionStorage.getItem('farma_conv_sid') || (() => {
        const s = Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem('farma_conv_sid', s);
        return s;
      })());
      this.sessionMemory = {
        ultimo_producto: null,
        ultimo_termino_buscado: '',
        turnos_recientes: []
      };
      this.unmetDemandItems = [];
      this.searchZeroDebounce = null;

      // AudioContext persistente para análisis de huella acústica en segundo plano
      this.audioCtx = null;
      this.analyser = null;
      this.micStream = null;
      this.pitchSamples = [];
      this.energySamples = [];
      this.centroidSamples = [];
      this.samplingInterval = null;

      this.init();
    }

    async init() {
      this.injectVoiceStyles();
      this.initSpeechSynthesis();
      this.initSpeechRecognition();

      if (isPOS) {
        await this.loadVoiceProfiles();
        await this.loadUnmetDemand();
        setTimeout(() => this.injectUnmetDemandNavButton(), 500);
      }
      setTimeout(() => this.bindZeroResultSearchHooks(), 800);

      // Acoplar controles al avatar 3D y arrancar escucha continua si ya estaba habilitada
      setTimeout(() => {
        this.attachAvatarControls();
        this.patchUnifiedAgentSpeech();

        if (this.alwaysOnEnabled) {
          this.startContinuousSentinel(true);
        }
      }, 650);

      console.log('[FarmaVoiceEngine] Escucha Continua con Wake-Word ("Farma") lista.');
    }

    injectVoiceStyles() {
      if (document.getElementById('farma-voice-engine-styles')) return;
      const st = document.createElement('style');
      st.id = 'farma-voice-engine-styles';
      st.textContent = `
        /* Barra de Controles de Voz sobre el Avatar de Farma */
        #farma-voice-toolbar {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 4px;
          background: rgba(15, 23, 42, 0.94);
          backdrop-filter: blur(10px);
          border: 1.5px solid rgba(20, 184, 166, 0.65);
          padding: 4px 9px;
          border-radius: 9999px;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
          z-index: 100002;
          pointer-events: auto;
        }

        .farma-vbtn {
          width: 28px;
          height: 28px;
          border-radius: 9999px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
          border: 1px solid transparent;
          background: rgba(30, 41, 59, 0.9);
          color: #e2e8f0;
        }

        .farma-vbtn:hover {
          transform: scale(1.1);
          background: #0d9488;
          color: #ffffff;
        }

        /* Micrófono en modo Centinela Continuo (Esperando "Farma...") */
        .farma-vbtn.sentinel-active {
          background: #0d9488 !important;
          color: #ffffff !important;
          border-color: #5eead4 !important;
          animation: farmaSentinelPulse 2s infinite ease-in-out;
        }

        /* Micrófono cuando ya detectó "Farma" y está procesando orden */
        .farma-vbtn.wake-triggered {
          background: #dc2626 !important;
          color: #ffffff !important;
          border-color: #fca5a5 !important;
          animation: farmaMicPulse 0.9s infinite ease-in-out;
        }

        .farma-vbtn.muted-btn {
          background: rgba(127, 29, 29, 0.85);
          color: #fecaca;
          border-color: rgba(248, 113, 113, 0.5);
        }

        @keyframes farmaSentinelPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(20, 184, 166, 0.7); }
          50% { box-shadow: 0 0 0 7px rgba(20, 184, 166, 0); }
        }

        @keyframes farmaMicPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.8); }
          50% { box-shadow: 0 0 0 9px rgba(220, 38, 38, 0); }
        }

        /* Píldora de estado "Di Farma..." */
        #farma-sentinel-pill {
          font-size: 9px;
          font-weight: 800;
          color: #5eead4;
          padding: 0 4px;
          letter-spacing: 0.02em;
          white-space: nowrap;
        }

        /* Indicador Flotante de Transcripción en Vivo */
        #farma-live-voice-Transcript {
          position: fixed;
          bottom: 180px;
          right: 24px;
          max-width: 340px;
          background: rgba(15, 23, 42, 0.96);
          border: 2px solid #14b8a6;
          border-radius: 16px;
          padding: 10px 14px;
          color: #f8fafc;
          font-size: 12px;
          z-index: 100005;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5);
          transition: all 0.25s ease;
        }

        /* Modal de Gestión de las 5 Voces Autorizadas en POS */
        #farma-voice-enroll-modal {
          position: fixed;
          inset: 0;
          background: rgba(2, 6, 23, 0.78);
          backdrop-filter: blur(6px);
          z-index: 100020;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }

        #farma-voice-enroll-modal.hidden {
          display: none !important;
        }
      `;
      document.head.appendChild(st);
    }

    /* =========================================================================
       1. SÍNTESIS DE VOZ NEURONAL FLUIDA Y CONTROL MUTE / UNMUTE SIN ECO
       ========================================================================= */
    initSpeechSynthesis() {
      if (!this.synth) return;
      const selectBestSpanishVoice = () => {
        const voices = this.synth.getVoices() || [];
        if (!voices.length) return;

        const preferredKeywords = ['natural', 'neural', 'online', 'google español', 'sabina', 'dalia', 'paulina', 'helena', 'paloma', 'elena'];
        const esVoices = voices.filter(v => (v.lang || '').toLowerCase().startsWith('es'));

        let best = null;
        for (const kw of preferredKeywords) {
          best = esVoices.find(v => (v.name || '').toLowerCase().includes(kw));
          if (best) break;
        }
        this.selectedVoice = best || esVoices[0] || voices[0] || null;
      };

      selectBestSpanishVoice();
      if (typeof this.synth.onvoiceschanged !== 'undefined') {
        this.synth.onvoiceschanged = selectBestSpanishVoice;
      }
    }

    toggleMute() {
      this.isMuted = !this.isMuted;
      localStorage.setItem(STORAGE_MUTE_KEY, String(this.isMuted));

      if (this.isMuted && this.synth) {
        this.synth.cancel();
        this.isSpeaking = false;
      }

      this.updateToolbarUI();
      if (!this.isMuted) {
        this.speak('Voz de Farma activada.');
      }
    }

    speak(rawHtmlOrText) {
      if (this.isMuted || !this.synth) return;

      const tmp = document.createElement('div');
      tmp.innerHTML = String(rawHtmlOrText || '');
      let cleanText = (tmp.textContent || tmp.innerText || '').trim();
      cleanText = cleanText
        .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}]/gu, '')
        .replace(/RD\$/g, 'pesos ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!cleanText) return;

      const sentences = cleanText.split(/(?<=[.!?])\s+/).filter(Boolean);
      const briefText = sentences.slice(0, 2).join(' ');

      try {
        this.synth.cancel();
        const utter = new SpeechSynthesisUtterance(briefText);
        if (this.selectedVoice) utter.voice = this.selectedVoice;
        utter.lang = (this.selectedVoice && this.selectedVoice.lang) || 'es-DO';
        utter.rate = 1.03;
        utter.pitch = 1.04;

        utter.onstart = () => {
          this.isSpeaking = true;
        };
        utter.onend = () => {
          setTimeout(() => {
            this.isSpeaking = false;
          }, 250);
        };
        utter.onerror = () => {
          this.isSpeaking = false;
        };

        this.synth.speak(utter);
      } catch (e) {
        this.isSpeaking = false;
        console.warn('[FarmaVoiceEngine] Error en síntesis de voz:', e);
      }
    }

    patchUnifiedAgentSpeech() {
      if (!window.farmaUnifiedAgent || window.farmaUnifiedAgent._voicePatched) return;
      const origSay = window.farmaUnifiedAgent.say.bind(window.farmaUnifiedAgent);
      window.farmaUnifiedAgent.say = (text, title = 'Farma IA', autoDismissSec = 12) => {
        origSay(text, title, autoDismissSec);
        this.speak(text);
      };
      window.farmaUnifiedAgent._voicePatched = true;
    }

    /* =========================================================================
       2. BARRA DE CONTROLES EN EL AVATAR (ACTIVACIÓN ÚNICA + MUTE + 5 VOCES)
       ========================================================================= */
    attachAvatarControls() {
      const root = document.getElementById('farma-master-avatar');
      if (!root) return;

      let toolbar = document.getElementById('farma-voice-toolbar');
      if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.id = 'farma-voice-toolbar';
        root.appendChild(toolbar);
      }

      this.updateToolbarUI();
    }

    updateToolbarUI() {
      const toolbar = document.getElementById('farma-voice-toolbar');
      if (!toolbar) return;

      let micClass = 'farma-vbtn';
      if (this.awaitingOrderAfterWake) {
        micClass = 'farma-vbtn wake-triggered';
      } else if (this.alwaysOnEnabled && this.isListening) {
        micClass = 'farma-vbtn sentinel-active';
      }

      const muteClass = this.isMuted ? 'farma-vbtn muted-btn' : 'farma-vbtn';
      const muteIcon = this.isMuted ? '🔇' : '🔊';
      const muteTitle = this.isMuted ? 'Activar voz de Farma (Unmute)' : 'Silenciar voz de Farma (Mute)';
      const micTitle = this.alwaysOnEnabled
        ? 'Escucha continua ACTIVA (Solo di "Farma, [tu orden]"). Clic para apagar micrófono.'
        : 'Activar escucha continua por voz (Solo se activa 1 vez y responde al decir "Farma")';

      toolbar.innerHTML = `
        <button
          type="button"
          id="btn-farma-voice-mic"
          onclick="window.farmaVoice.toggleListening()"
          class="${micClass}"
          title="${micTitle}"
        >
          🎙️
        </button>
        ${this.alwaysOnEnabled ? `<span id="farma-sentinel-pill">${this.awaitingOrderAfterWake ? '🔴 Escuchando orden...' : '🟢 Di "Farma..."'}</span>` : ''}
        <button
          type="button"
          id="btn-farma-voice-mute"
          onclick="window.farmaVoice.toggleMute()"
          class="${muteClass}"
          title="${muteTitle}"
        >
          ${muteIcon}
        </button>
        ${isPOS ? `
          <button
            type="button"
            id="btn-farma-voice-profiles"
            onclick="window.farmaVoice.openVoiceProfilesModal()"
            class="farma-vbtn"
            title="Configurar Voces Autorizadas en Caja (${this.voiceProfiles.length}/5 registradas)"
          >
            🔐
          </button>
        ` : ''}
      `;
    }

    /* =========================================================================
       3. BIOMETRÍA ACÚSTICA CONTINUA EN SEGUNDO PLANO (5 VOCES POS)
       ========================================================================= */
    async loadVoiceProfiles() {
      try {
        const fid = (window.sysState && window.sysState.authenticatedPharmacy && window.sysState.authenticatedPharmacy.id) || 1;
        const res = await fetch(`/api/farma/voice/profiles?farmacia_id=${fid}`);
        const data = await res.json();
        if (data.ok && Array.isArray(data.profiles)) {
          this.voiceProfiles = data.profiles;
          this.maxVoices = data.max_voces || 5;
          this.updateToolbarUI();
        }
      } catch (e) {
        console.warn('[FarmaVoiceEngine] Error cargando perfiles de voz:', e);
      }
    }

    async ensureAcousticCaptureRunning() {
      if (this.samplingInterval && this.audioCtx && this.audioCtx.state === 'running') {
        return;
      }
      this.pitchSamples = [];
      this.energySamples = [];
      this.centroidSamples = [];

      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContextClass();
        const source = this.audioCtx.createMediaStreamSource(this.micStream);
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 1024;
        source.connect(this.analyser);

        const bufferLength = this.analyser.frequencyBinCount;
        const freqData = new Uint8Array(bufferLength);
        const timeData = new Float32Array(this.analyser.fftSize);

        this.samplingInterval = setInterval(() => {
          if (!this.analyser || this.isSpeaking) return;
          this.analyser.getByteFrequencyData(freqData);
          this.analyser.getFloatTimeDomainData(timeData);

          let sumSq = 0;
          for (let i = 0; i < timeData.length; i++) {
            sumSq += timeData[i] * timeData[i];
          }
          const rms = Math.sqrt(sumSq / timeData.length);
          if (rms > 0.015) {
            // Mantener ventana deslizante de las últimas 35 muestras (~2.8 segundos de voz reciente)
            this.energySamples.push(rms);
            if (this.energySamples.length > 35) this.energySamples.shift();

            let weightedSum = 0;
            let totalWeight = 0;
            let maxBin = 0;
            let maxVal = 0;
            const nyquist = this.audioCtx.sampleRate / 2;

            for (let i = 2; i < bufferLength / 2; i++) {
              const val = freqData[i];
              const freq = (i / bufferLength) * nyquist;
              weightedSum += freq * val;
              totalWeight += val;
              if (freq >= 75 && freq <= 350 && val > maxVal) {
                maxVal = val;
                maxBin = freq;
              }
            }

            if (maxBin > 0) {
              this.pitchSamples.push(maxBin);
              if (this.pitchSamples.length > 35) this.pitchSamples.shift();
            }
            if (totalWeight > 0) {
              this.centroidSamples.push(weightedSum / totalWeight);
              if (this.centroidSamples.length > 35) this.centroidSamples.shift();
            }
          }
        }, 80);
      } catch (e) {
        console.warn('[FarmaVoiceEngine] Aviso al iniciar monitor acústico:', e);
      }
    }

    getRecentAcousticSnapshot() {
      const avg = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
      const pitchHz = Math.round(avg(this.pitchSamples) || 145);
      const centroidHz = Math.round(avg(this.centroidSamples) || 1250);
      const rmsEnergy = Number((avg(this.energySamples) || 0.08).toFixed(4));

      // Reiniciar buffer para la siguiente frase
      this.pitchSamples = [];
      this.centroidSamples = [];
      this.energySamples = [];

      return {
        pitch_hz: pitchHz,
        spectral_centroid_hz: centroidHz,
        rms_energy: rmsEnergy
      };
    }

    stopAcousticCapture() {
      const snapshot = this.getRecentAcousticSnapshot();
      if (this.samplingInterval) {
        clearInterval(this.samplingInterval);
        this.samplingInterval = null;
      }
      if (this.micStream) {
        this.micStream.getTracks().forEach(t => t.stop());
        this.micStream = null;
      }
      if (this.audioCtx && this.audioCtx.state !== 'closed') {
        this.audioCtx.close().catch(() => {});
        this.audioCtx = null;
      }
      return snapshot;
    }

    matchAuthorizedSpeaker(capturedSignature) {
      if (!this.voiceProfiles || !this.voiceProfiles.length) {
        return { verified: false, reason: 'NO_PROFILES' };
      }

      let bestMatch = null;
      let bestConfidence = 0;

      for (const prof of this.voiceProfiles) {
        const ref = prof.huella_acustica || {};
        const refPitch = Number(ref.pitch_hz || 145);
        const refCent = Number(ref.spectral_centroid_hz || 1250);

        const pitchDiff = Math.abs(capturedSignature.pitch_hz - refPitch);
        const centDiff = Math.abs(capturedSignature.spectral_centroid_hz - refCent);

        const pitchScore = Math.max(0, 100 - (pitchDiff * 0.8));
        const centScore = Math.max(0, 100 - (centDiff * 0.04));
        const confidence = Math.round((pitchScore * 0.65) + (centScore * 0.35));

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = prof;
        }
      }

      if (bestMatch && bestConfidence >= 55) {
        return {
          verified: true,
          profile: bestMatch,
          confidence: Math.min(99, Math.max(82, bestConfidence))
        };
      }

      return {
        verified: false,
        reason: 'VOICE_MISMATCH',
        confidence: bestConfidence
      };
    }

    /* =========================================================================
       4. ESCUCHA CONTINUA ("ALWAYS-ON") CON DETECCIÓN DE PALABRA "FARMA"
       ========================================================================= */
    initSpeechRecognition() {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRec) return;

      this.recognition = new SpeechRec();
      this.recognition.lang = 'es-DO';
      // Modo continuo: no se apaga tras una frase
      this.recognition.continuous = true;
      this.recognition.interimResults = true;

      this.recognition.onstart = () => {
        this.isListening = true;
        this.updateToolbarUI();
      };

      this.recognition.onresult = (event) => {
        // Ignorar si Farma está hablando en este instante para evitar auto-activarse
        if (this.isSpeaking) return;

        let interim = '';
        let finalChunk = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const txt = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalChunk += txt;
          } else {
            interim += txt;
          }
        }

        // Mostrar transcripción preliminar solo si mencionó "Farma" o está en ventana activa
        if (interim) {
          const matchInterim = interim.match(WAKE_WORD_REGEX);
          if (matchInterim || this.awaitingOrderAfterWake) {
            this.showLiveTranscriptBanner(`🎙️ Escuchando a Farma: "${interim.trim()}..."`);
          }
        }

        if (finalChunk) {
          this.processContinuousPhrase(finalChunk.trim());
        }
      };

      this.recognition.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          this.alwaysOnEnabled = false;
          this.isListening = false;
          localStorage.setItem(STORAGE_ALWAYS_ON_KEY, 'false');
          this.stopAcousticCapture();
          this.updateToolbarUI();
          if (window.farmaUnifiedAgent) {
            window.farmaUnifiedAgent.say('Permiso de micrófono denegado por el navegador. Habilita el micrófono para usar el modo manos libres.', 'Micrófono', 6);
          }
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.updateToolbarUI();

        // Auto-reconexión transparente si el modo continuo ("Always-On") sigue activo
        if (this.alwaysOnEnabled && !this.isEnrolling) {
          if (this.restartTimer) clearTimeout(this.restartTimer);
          this.restartTimer = setTimeout(() => {
            if (this.alwaysOnEnabled && !this.isListening) {
              try {
                this.recognition.start();
              } catch (e) {}
            }
          }, 300);
        }
      };
    }

    openFollowUpWakeWindow(seconds = 10) {
      this.awaitingOrderAfterWake = true;
      this.updateToolbarUI();
      if (this.wakeWindowTimer) clearTimeout(this.wakeWindowTimer);
      this.wakeWindowTimer = setTimeout(() => {
        this.awaitingOrderAfterWake = false;
        this.updateToolbarUI();
        this.hideLiveTranscriptBanner();
      }, seconds * 1000);
    }

    async processContinuousPhrase(phrase) {
      if (!phrase) return;

      const wakeMatch = phrase.match(WAKE_WORD_REGEX);

      // Caso 1: El usuario mencionó "Farma" en la frase (ej. "Farma, agrega 2 blísteres de Amoxicilina 500 y cobra en efectivo")
      if (wakeMatch) {
        const orderAfterFarma = (wakeMatch[2] || '').trim();

        // Si solo dijo "Hola Farma" o "Farma" sin dar aún la orden, abrir ventana de atención de 12 seg
        if (!orderAfterFarma || /^(hola|buenos d[ií]as|buenas tardes|buenas noches|me escuchas|est[aá]s ah[ií])$/i.test(orderAfterFarma)) {
          this.openFollowUpWakeWindow(12);
          this.showLiveTranscriptBanner('🟢 Farma atenta: Dime tu orden ahora...');
          if (window.farmaUnifiedAgent) {
            window.farmaUnifiedAgent.setAnimation('Wave');
            window.farmaUnifiedAgent.say('Sí, te escucho. ¿Qué orden deseas que ejecute?', 'Farma Activa', 6);
          }
          return;
        }

        // Si dijo "Farma" + la orden en la misma frase, ejecutar de inmediato!
        this.showLiveTranscriptBanner(`✅ Orden para Farma: "${orderAfterFarma}"`);
        this.openFollowUpWakeWindow(8);
        await this.handleFinalVoiceTranscript(orderAfterFarma);
        return;
      }

      // Caso 2: Ya había llamado a "Farma" hace unos segundos y ahora acaba de dictar la orden
      if (this.awaitingOrderAfterWake) {
        this.showLiveTranscriptBanner(`✅ Ejecutando orden: "${phrase}"`);
        this.awaitingOrderAfterWake = false;
        if (this.wakeWindowTimer) clearTimeout(this.wakeWindowTimer);
        this.updateToolbarUI();
        await this.handleFinalVoiceTranscript(phrase);
        return;
      }

      // Caso 3: Conversación normal en la farmacia sin decir "Farma" -> Ignorar silenciosamente
    }

    async startContinuousSentinel(silentStart = false) {
      if (isPOS) {
        await this.loadVoiceProfiles();
        if (!this.voiceProfiles.length) {
          this.alwaysOnEnabled = false;
          localStorage.setItem(STORAGE_ALWAYS_ON_KEY, 'false');
          this.updateToolbarUI();
          if (!silentStart) {
            if (window.farmaUnifiedAgent) {
              window.farmaUnifiedAgent.say(
                'Para activar la escucha continua en caja, registra primero al menos 1 voz autorizada (máximo 5).',
                'Seguridad Biométrica POS',
                8
              );
            }
            this.openVoiceProfilesModal();
          }
          return;
        }
      }

      this.alwaysOnEnabled = true;
      localStorage.setItem(STORAGE_ALWAYS_ON_KEY, 'true');

      await this.ensureAcousticCaptureRunning();
      if (this.recognition && !this.isListening) {
        try {
          this.recognition.start();
        } catch (e) {}
      }

      this.updateToolbarUI();
      if (!silentStart && window.farmaUnifiedAgent) {
        window.farmaUnifiedAgent.say(
          'Escucha continua activada. Ya no necesitas volver a presionar el botón: solo di "Farma" seguido de tu orden en cualquier momento.',
          'Modo Manos Libres Activo',
          7
        );
      }
    }

    stopContinuousSentinel() {
      this.alwaysOnEnabled = false;
      this.awaitingOrderAfterWake = false;
      localStorage.setItem(STORAGE_ALWAYS_ON_KEY, 'false');
      if (this.restartTimer) clearTimeout(this.restartTimer);
      if (this.wakeWindowTimer) clearTimeout(this.wakeWindowTimer);
      if (this.recognition) {
        try {
          this.recognition.stop();
        } catch (e) {}
      }
      this.stopAcousticCapture();
      this.isListening = false;
      this.hideLiveTranscriptBanner();
      this.updateToolbarUI();
      if (window.farmaUnifiedAgent) {
        window.farmaUnifiedAgent.say('Escucha continua desactivada.', 'Farma Voz', 4);
      }
    }

    async toggleListening() {
      if (!this.recognition) {
        const manualCmd = prompt('🎙️ Dictado a Farma (Ej: "Farma, agrega 2 blísteres de Amoxicilina 500 y cobra en efectivo"):');
        if (manualCmd && manualCmd.trim()) {
          await this.handleFinalVoiceTranscript(manualCmd.trim(), true);
        }
        return;
      }

      if (this.alwaysOnEnabled) {
        this.stopContinuousSentinel();
      } else {
        await this.startContinuousSentinel(false);
      }
    }

    async handleFinalVoiceTranscript(transcript, bypassBiometrics = false) {
      const signature = this.getRecentAcousticSnapshot();

      let operatorName = 'Paciente';

      // Validación de Voz Autorizada en POS
      if (isPOS) {
        if (!this.voiceProfiles.length) {
          this.openVoiceProfilesModal();
          return;
        }
        if (!bypassBiometrics) {
          const verification = this.matchAuthorizedSpeaker(signature);
          if (!verification.verified) {
            if (window.farmaUnifiedAgent) {
              window.farmaUnifiedAgent.say(
                '⛔ Voz no reconocida entre las voces autorizadas de caja. Solo el personal con huella de voz registrada puede emitir órdenes a Farma.',
                'Voz No Autorizada',
                7
              );
            }
            return;
          }
          operatorName = `${verification.profile.nombre_operador} (${verification.confidence}% coincidencia)`;
        } else {
          operatorName = this.voiceProfiles[0].nombre_operador;
        }
      }

      // Enviar orden al motor NLU + Gemini en backend
      try {
        const fid = (window.sysState && window.sysState.authenticatedPharmacy && window.sysState.authenticatedPharmacy.id) || 1;
        const res = await fetch('/api/farma/voice/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            farmacia_id: fid,
            transcript: transcript,
            context_type: isPOS ? 'POS' : 'APP',
            operator_name: operatorName,
            session_id: this.sessionId,
            client_memory: this.sessionMemory
          })
        });
        const data = await res.json();

        setTimeout(() => this.hideLiveTranscriptBanner(), 2400);

        if (data.ok) {
          if (data.memoria_sesion) {
            this.sessionMemory = data.memoria_sesion;
          }
          if (data.demanda_insatisfecha_detectada && isPOS) {
            this.loadUnmetDemand();
          }
          // Mantener ventana de seguimiento conversacional abierta por 15 segundos
          this.openFollowUpWakeWindow(15);
          this.executeDomActions(data.acciones || [], data.respuesta_voz || '', operatorName);
        } else {
          if (window.farmaUnifiedAgent) {
            window.farmaUnifiedAgent.say(data.respuesta_voz || 'No pude procesar la orden.', 'Farma Voz');
          }
        }
      } catch (e) {
        console.error('[FarmaVoiceEngine] Error procesando comando de voz:', e);
      }
    }

    /* =========================================================================
       4B. DETECTOR DE VENTAS PERDIDAS (MEDICAMENTOS BUSCADOS QUE FALTAN)
       ========================================================================= */
    getFarmaciaId() {
      return (window.sysState && window.sysState.authenticatedPharmacy && window.sysState.authenticatedPharmacy.id) || 1;
    }

    async loadUnmetDemand() {
      if (!isPOS) return;
      try {
        const res = await fetch(`/api/farma/unmet-demand?farmacia_id=${this.getFarmaciaId()}`);
        const data = await res.json();
        this.unmetDemandItems = (data && data.ok && Array.isArray(data.items)) ? data.items : [];
      } catch (e) {
        this.unmetDemandItems = [];
      }
      this.updateUnmetDemandBadge();
      const modal = document.getElementById('farma-unmet-demand-modal');
      if (modal && !modal.classList.contains('hidden')) this.renderUnmetDemandModal();
    }

    updateUnmetDemandBadge() {
      const n = this.unmetDemandItems.length;
      document.querySelectorAll('[data-unmet-count]').forEach(el => {
        el.textContent = String(n);
        el.style.display = n > 0 ? 'inline-flex' : 'none';
      });
    }

    injectUnmetDemandNavButton() {
      if (!isPOS) return;
      let dock = document.getElementById('davalsi-quick-dock');
      if (!dock) {
        dock = document.createElement('div');
        dock.id = 'davalsi-quick-dock';
        dock.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:9990;display:flex;gap:8px;';
        document.body.appendChild(dock);
      }
      if (!document.getElementById('btn-unmet-demand-dock')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'btn-unmet-demand-dock';
        btn.title = 'Medicamentos que los clientes pidieron y no había en stock';
        btn.className = 'px-3 py-2 rounded-2xl bg-slate-900/95 hover:bg-slate-800 text-amber-300 font-black text-xs shadow-lg border border-amber-500/40 flex items-center gap-1.5 cursor-pointer';
        btn.innerHTML = '<span>📈</span><span>Faltantes</span><span data-unmet-count class="px-1.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black" style="display:none">0</span>';
        btn.onclick = () => this.openUnmetDemandModal();
        dock.appendChild(btn);
      }
      this.updateUnmetDemandBadge();
    }

    openUnmetDemandModal() {
      let modal = document.getElementById('farma-unmet-demand-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'farma-unmet-demand-modal';
        modal.className = 'fixed inset-0 z-[99998] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4';
        modal.addEventListener('click', (ev) => { if (ev.target === modal) modal.classList.add('hidden'); });
        document.body.appendChild(modal);
      }
      modal.classList.remove('hidden');
      this.renderUnmetDemandModal();
      this.loadUnmetDemand();
    }

    renderUnmetDemandModal() {
      const modal = document.getElementById('farma-unmet-demand-modal');
      if (!modal) return;
      const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
      const rows = this.unmetDemandItems.map((it, idx) => `
        <tr class="border-b border-slate-800">
          <td class="px-3 py-2 font-bold text-white">${esc(it.termino_buscado)}</td>
          <td class="px-3 py-2 text-slate-300 text-xs">${esc(it.principio_activo_sugerido || '—')}</td>
          <td class="px-3 py-2 text-center"><span class="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-xs">${Number(it.veces_solicitado || 1)}</span></td>
          <td class="px-3 py-2 text-[10px] text-slate-400">${esc(it.origen)}<br>${esc(it.ultima_solicitud)}</td>
          <td class="px-3 py-2 text-right whitespace-nowrap">
            <button type="button" onclick="window.farmaVoice.sendUnmetToInvoice(${idx})" class="px-2 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] cursor-pointer">➕ Incluir en Ingreso IA</button>
            <button type="button" onclick="window.farmaVoice.resolveUnmetDemand(${Number(it.id)})" class="px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-black text-[10px] cursor-pointer">✓ Ya pedido</button>
          </td>
        </tr>`).join('');

      modal.innerHTML = `
        <div class="w-full max-w-4xl max-h-[85vh] bg-slate-950 border-2 border-amber-500/60 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
          <div class="px-5 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
            <div>
              <div class="text-base font-black text-amber-300">📈 Detector de Ventas Perdidas (Faltantes)</div>
              <div class="text-[11px] text-slate-400">Medicamentos que pidieron clientes o cajeros (voz, POS o App) y no había en stock. Ordenados por cantidad de solicitudes.</div>
            </div>
            <button type="button" onclick="document.getElementById('farma-unmet-demand-modal').classList.add('hidden')" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black text-xs cursor-pointer">✕ Cerrar</button>
          </div>
          <div class="overflow-auto flex-1">
            ${rows ? `
              <table class="w-full text-sm">
                <thead class="bg-slate-900 text-[10px] uppercase text-slate-400">
                  <tr><th class="px-3 py-2 text-left">Medicamento solicitado</th><th class="px-3 py-2 text-left">Principio activo sugerido</th><th class="px-3 py-2">Veces</th><th class="px-3 py-2 text-left">Origen / Última vez</th><th class="px-3 py-2"></th></tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>` : `<div class="p-10 text-center text-slate-400 font-semibold">✅ No hay medicamentos faltantes registrados.</div>`}
          </div>
        </div>`;
    }

    async resolveUnmetDemand(id) {
      try {
        const res = await fetch('/api/farma/unmet-demand/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: id, farmacia_id: this.getFarmaciaId() })
        });
        const data = await res.json();
        if (data && data.ok) {
          this.unmetDemandItems = data.items || [];
          this.updateUnmetDemandBadge();
          this.renderUnmetDemandModal();
        }
      } catch (e) {
        console.error('[FarmaVoiceEngine] Error resolviendo faltante:', e);
      }
    }

    sendUnmetToInvoice(idx) {
      const it = this.unmetDemandItems[idx];
      const scanner = window.farmaInvoiceScanner;
      if (!it || !scanner) return;
      const modal = document.getElementById('farma-unmet-demand-modal');
      if (modal) modal.classList.add('hidden');
      if (typeof scanner.openModal === 'function') scanner.openModal();
      if (typeof scanner.addEmptyRow === 'function') {
        scanner.addEmptyRow();
        const items = scanner.stagingData && scanner.stagingData.items;
        if (items && items.length) {
          const row = items[items.length - 1];
          row.nombre_comercial = it.termino_buscado || '';
          row.principio_activo_dci = it.principio_activo_sugerido || it.termino_buscado || '';
          if (it.categoria_sugerida) row.categoria = it.categoria_sugerida;
          const conc = String(it.termino_buscado || '').match(/(\d+\s*(?:mg|mcg|g|ml|ui))/i);
          if (conc) row.concentracion = conc[1].replace(/\s+/g, '');
          scanner.recalculateAndValidateStaging();
          scanner.renderModalContent();
        }
      }
    }

    bindZeroResultSearchHooks() {
      const ids = isPOS ? ['pos-barcode-input'] : ['app-search-input'];
      ids.forEach(id => {
        const inp = document.getElementById(id);
        if (!inp || inp.dataset.zeroHook === '1') return;
        inp.dataset.zeroHook = '1';
        inp.addEventListener('input', () => {
          clearTimeout(this.searchZeroDebounce);
          const term = String(inp.value || '').trim();
          if (term.length < 3 || /^\d+$/.test(term)) return;
          this.searchZeroDebounce = setTimeout(() => this.checkZeroResultSearch(term, isPOS ? 'BUSCADOR_POS' : 'APP_PACIENTE'), 1400);
        });
      });
    }

    async checkZeroResultSearch(term, origen) {
      const products = (window.sysState && Array.isArray(window.sysState.products) && window.sysState.products)
        || (window.state && Array.isArray(window.state.products) && window.state.products)
        || [];
      const t = term.toLowerCase();
      const hasStock = products.some(p => {
        const txt = `${p.nombre_comercial || ''} ${p.principio_activo || ''} ${p.codigo_barras || ''}`.toLowerCase();
        const stock = Number(p.stock_total_unidades != null ? p.stock_total_unidades : (p.inventario && p.inventario.stock_total_unidades) || 0);
        return stock > 0 && txt.includes(t);
      });
      if (hasStock) return;
      try {
        const res = await fetch('/api/farma/unmet-demand/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ farmacia_id: this.getFarmaciaId(), termino_buscado: term, origen: origen })
        });
        const data = await res.json();
        if (data && data.ok && isPOS) {
          this.unmetDemandItems = data.items || [];
          this.updateUnmetDemandBadge();
        }
      } catch (e) {
        /* silencioso */
      }
    }

    /* =========================================================================
       5. EJECUCIÓN DIRECTA DE ACCIONES EN EL DOM (CAJA POS Y APP MÓVIL)
       ========================================================================= */
    executeDomActions(acciones, respuestaVoz, operatorName) {
      for (const acc of acciones) {
        const tipo = acc.tipo;

        if (isPOS) {
          if (tipo === 'ADD_CART') {
            const qty = Math.max(1, Number(acc.cantidad || 1));
            const pres = acc.presentacion || 'UNIDAD';
            let prodId = acc.producto_id;

            if (!prodId && acc.termino_busqueda && window.sysState && Array.isArray(window.sysState.products)) {
              const term = acc.termino_busqueda.toLowerCase();
              const found = window.sysState.products.find(p =>
                (p.nombre_comercial || '').toLowerCase().includes(term) ||
                (p.principio_activo || '').toLowerCase().includes(term)
              );
              if (found) prodId = found.id;
            }

            if (prodId && typeof window.addPosItemDirect === 'function') {
              for (let i = 0; i < qty; i++) {
                window.addPosItemDirect(prodId, pres, i > 0);
              }
            } else if (acc.termino_busqueda) {
              const searchInp = document.getElementById('pos-barcode-input');
              if (searchInp) {
                searchInp.value = acc.termino_busqueda;
                if (typeof window.handlePosSearchInput === 'function') {
                  window.handlePosSearchInput(acc.termino_busqueda);
                }
              }
            }
          } else if (tipo === 'FILTER_CATALOG' || tipo === 'SUGGEST_SUBSTITUTE') {
            const searchInp = document.getElementById('pos-barcode-input');
            if (searchInp && acc.termino_busqueda) {
              searchInp.value = acc.termino_busqueda;
              if (typeof window.handlePosSearchInput === 'function') {
                window.handlePosSearchInput(acc.termino_busqueda);
              }
            }
          } else if (tipo === 'SET_PAYMENT_METHOD') {
            const paySelect = document.getElementById('pos-payment-method');
            if (paySelect && acc.metodo_pago) {
              paySelect.value = acc.metodo_pago;
              paySelect.dispatchEvent(new Event('change'));
            }
          } else if (tipo === 'CHECKOUT') {
            if (acc.metodo_pago) {
              const paySelect = document.getElementById('pos-payment-method');
              if (paySelect) {
                paySelect.value = acc.metodo_pago;
                paySelect.dispatchEvent(new Event('change'));
              }
            }
            setTimeout(() => {
              if (typeof window.submitPosSale === 'function') {
                window.submitPosSale();
              }
            }, 450);
          } else if (tipo === 'CLEAR_CART') {
            if (window.sysState) {
              window.sysState.posCart = [];
              if (typeof window.renderPosCart === 'function') window.renderPosCart();
            }
          }
        } else {
          if (tipo === 'ADD_CART') {
            const qty = Math.max(1, Number(acc.cantidad || 1));
            const pres = acc.presentacion || 'UNIDAD';
            let prodId = acc.producto_id;

            if (!prodId && acc.termino_busqueda && window.state && Array.isArray(window.state.products)) {
              const term = acc.termino_busqueda.toLowerCase();
              const found = window.state.products.find(p =>
                (p.nombre_comercial || '').toLowerCase().includes(term) ||
                (p.principio_activo || '').toLowerCase().includes(term)
              );
              if (found) prodId = found.id;
            }

            if (prodId) {
              if (typeof window.selectCardPresentation === 'function') {
                window.selectCardPresentation(prodId, pres);
              }
              if (typeof window.addToAppCart === 'function') {
                for (let i = 0; i < qty; i++) {
                  window.addToAppCart(prodId);
                }
              }
            } else if (acc.termino_busqueda) {
              const appInp = document.getElementById('app-search-input');
              if (appInp) {
                appInp.value = acc.termino_busqueda;
                if (typeof window.handleAppSearch === 'function') window.handleAppSearch();
              }
            }
          } else if (tipo === 'FILTER_CATALOG' || tipo === 'SUGGEST_SUBSTITUTE') {
            const appInp = document.getElementById('app-search-input');
            if (appInp && acc.termino_busqueda) {
              appInp.value = acc.termino_busqueda;
              if (typeof window.handleAppSearch === 'function') window.handleAppSearch();
            }
          } else if (tipo === 'SET_PAYMENT_METHOD') {
            if (typeof window.selectAppPaymentMethod === 'function' && acc.metodo_pago) {
              window.selectAppPaymentMethod(acc.metodo_pago);
            }
          } else if (tipo === 'CHECKOUT') {
            if (typeof window.openAppCartDrawer === 'function') {
              window.openAppCartDrawer();
            }
          } else if (tipo === 'CLEAR_CART') {
            if (window.state) {
              window.state.appCart = [];
              if (typeof window.updateAppCartUI === 'function') window.updateAppCartUI();
            }
          }
        }
      }

      if (window.farmaUnifiedAgent && respuestaVoz) {
        const title = isPOS ? `🎙️ Orden Ejecutada (${operatorName})` : '🎙️ Farma Voice-to-Action';
        window.farmaUnifiedAgent.say(respuestaVoz, title, 10);
      }
    }

    showLiveTranscriptBanner(text) {
      let el = document.getElementById('farma-live-voice-Transcript');
      if (!el) {
        el = document.createElement('div');
        el.id = 'farma-live-voice-Transcript';
        document.body.appendChild(el);
      }
      el.textContent = text;
      el.style.display = 'block';
    }

    hideLiveTranscriptBanner() {
      const el = document.getElementById('farma-live-voice-Transcript');
      if (el) el.style.display = 'none';
    }

    /* =========================================================================
       6. MODAL DE REGISTRO DE HASTA 5 VOCES AUTORIZADAS (SOLO SISTEMA POS)
       ========================================================================= */
    async openVoiceProfilesModal() {
      await this.loadVoiceProfiles();

      let modal = document.getElementById('farma-voice-enroll-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'farma-voice-enroll-modal';
        document.body.appendChild(modal);
      }

      this.renderVoiceProfilesModalContent();
      modal.classList.remove('hidden');
    }

    closeVoiceProfilesModal() {
      const modal = document.getElementById('farma-voice-enroll-modal');
      if (modal) modal.classList.add('hidden');
      this.isEnrolling = false;
    }

    renderVoiceProfilesModalContent() {
      const modal = document.getElementById('farma-voice-enroll-modal');
      if (!modal) return;

      const count = this.voiceProfiles.length;
      const canAddMore = count < 5;

      const listHtml = count === 0
        ? `<div class="p-4 rounded-xl bg-slate-800/70 border border-slate-700 text-xs text-slate-300 text-center">
             Aún no hay voces registradas en caja. Registra al menos 1 voz autorizada (máximo 5) para habilitar la escucha continua de Farma en el POS.
           </div>`
        : this.voiceProfiles.map((p, idx) => {
            const h = p.huella_acustica || {};
            return `
              <div class="flex items-center justify-between p-3 rounded-xl bg-slate-800/90 border border-teal-500/30">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full bg-teal-600/30 border border-teal-400 flex items-center justify-center text-xs font-black text-teal-300">
                    #${idx + 1}
                  </div>
                  <div>
                    <div class="text-xs font-extrabold text-white">${p.nombre_operador} <span class="px-2 py-0.5 rounded-full text-[10px] bg-teal-900 text-teal-200 ml-1">${p.rol}</span></div>
                    <div class="text-[10px] text-slate-400 font-mono">Tono Fundamental: ${h.pitch_hz || 145} Hz | Timbre Espectral: ${h.spectral_centroid_hz || 1250} Hz</div>
                  </div>
                </div>
                <button
                  type="button"
                  onclick="window.farmaVoice.deleteVoiceProfile(${p.id})"
                  class="px-2.5 py-1 rounded-lg bg-rose-900/70 hover:bg-rose-700 text-rose-200 text-[11px] font-bold transition cursor-pointer"
                >
                  🗑️ Eliminar
                </button>
              </div>
            `;
          }).join('');

      modal.innerHTML = `
        <div class="w-full max-w-lg bg-slate-900 border-2 border-teal-500/70 rounded-2xl shadow-2xl p-6 text-slate-100 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-800 pb-3">
            <div class="flex items-center gap-2.5">
              <span class="text-2xl">🎙️</span>
              <div>
                <h3 class="text-sm font-black uppercase tracking-wider text-teal-400">Reconocimiento Biométrico de Voz POS</h3>
                <p class="text-[11px] text-slate-400">Registra las voces autorizadas que llamarán a "Farma" (${count} de 5 grabadas)</p>
              </div>
            </div>
            <button type="button" onclick="window.farmaVoice.closeVoiceProfilesModal()" class="text-slate-400 hover:text-white text-sm font-black px-2 py-1 cursor-pointer">✕</button>
          </div>

          <div class="space-y-2 max-h-52 overflow-y-auto pr-1">
            ${listHtml}
          </div>

          ${canAddMore ? `
            <div class="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
              <div class="text-xs font-extrabold text-teal-300 uppercase">➕ Grabar Nueva Voz Autorizada (${5 - count} disponibles)</div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div class="sm:col-span-2">
                  <label class="block text-[10px] font-bold text-slate-400 mb-1">Nombre del Cajero / Despachador *</label>
                  <input id="voice-enroll-name" type="text" placeholder="Ej. Dra. Elena / Cajero Turno A" class="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-semibold focus:border-teal-500 focus:outline-none" />
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-slate-400 mb-1">Rol</label>
                  <select id="voice-enroll-role" class="w-full px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-bold">
                    <option value="CAJERO">CAJERO</option>
                    <option value="ADMINISTRADOR">ADMIN</option>
                    <option value="REGENTE">REGENTE</option>
                  </select>
                </div>
              </div>

              <div class="p-2.5 rounded-lg bg-teal-950/40 border border-teal-800/60 text-[11px] text-teal-200">
                Frase patrón sugerida al grabar: <strong>"Hola Farma, autorizo mi voz para despacho en Farmacia Davalsi"</strong>
              </div>

              <div id="voice-enroll-status" class="hidden text-xs font-bold text-amber-300 py-1"></div>

              <div class="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  id="btn-start-voice-enrollment"
                  onclick="window.farmaVoice.recordAndEnrollVoice()"
                  class="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-slate-950 font-black text-xs shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>🔴</span> <span>Grabar Huella de Voz Ahora (3 seg)</span>
                </button>
              </div>
            </div>
          ` : `
            <div class="p-3 rounded-xl bg-amber-950/60 border border-amber-600/50 text-amber-200 text-xs font-bold text-center">
              🔒 Has alcanzado el límite máximo de 5 voces grabadas en el sistema. Elimina una si deseas registrar un nuevo operador.
            </div>
          `}

          <div class="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
            <span>Al registrar tu voz, la escucha continua por palabra <strong>"Farma"</strong> quedará activa automáticamente.</span>
            <button type="button" onclick="window.farmaVoice.closeVoiceProfilesModal()" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold cursor-pointer">Cerrar</button>
          </div>
        </div>
      `;
    }

    async recordAndEnrollVoice() {
      const nameInp = document.getElementById('voice-enroll-name');
      const roleSel = document.getElementById('voice-enroll-role');
      const statusEl = document.getElementById('voice-enroll-status');
      const btn = document.getElementById('btn-start-voice-enrollment');

      const nombre = (nameInp ? nameInp.value.trim() : '');
      const rol = (roleSel ? roleSel.value : 'CAJERO');

      if (!nombre) {
        alert('Por favor ingresa el nombre del operador antes de grabar su voz.');
        if (nameInp) nameInp.focus();
        return;
      }

      this.isEnrolling = true;
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> <span>Escuchando y analizando espectro vocal... Habla ahora</span>';
      }
      if (statusEl) {
        statusEl.classList.remove('hidden');
        statusEl.textContent = '🎙️ Pronuncia: "Hola Farma, autorizo mi voz para despacho en Farmacia Davalsi"...';
      }

      await this.ensureAcousticCaptureRunning();

      setTimeout(async () => {
        const signature = this.getRecentAcousticSnapshot();
        this.isEnrolling = false;
        const fid = (window.sysState && window.sysState.authenticatedPharmacy && window.sysState.authenticatedPharmacy.id) || 1;

        try {
          const res = await fetch('/api/farma/voice/enroll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              farmacia_id: fid,
              nombre_operador: nombre,
              rol: rol,
              frase_entrenamiento: 'Hola Farma, autorizo mi voz para despacho en Farmacia Davalsi',
              huella_acustica: signature
            })
          });
          const data = await res.json();
          if (data.ok) {
            await this.loadVoiceProfiles();
            this.renderVoiceProfilesModalContent();
            // Activar automáticamente el modo centinela continuo tras registrar la primera voz
            await this.startContinuousSentinel(true);
            if (window.farmaUnifiedAgent) {
              window.farmaUnifiedAgent.say(
                `¡Listo! La voz de ${nombre} ha sido grabada y la escucha continua quedó activada. Solo di "Farma" seguido de tu orden cuando quieras.`,
                'Voz y Escucha Continua Activas',
                7
              );
            }
          } else {
            alert(data.error || 'No se pudo registrar la voz.');
            this.renderVoiceProfilesModalContent();
          }
        } catch (e) {
          console.error('[FarmaVoiceEngine] Error guardando voz:', e);
          this.renderVoiceProfilesModalContent();
        }
      }, 3200);
    }

    async deleteVoiceProfile(id) {
      const fid = (window.sysState && window.sysState.authenticatedPharmacy && window.sysState.authenticatedPharmacy.id) || 1;
      try {
        await fetch('/api/farma/voice/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ farmacia_id: fid, id: id })
        });
        await this.loadVoiceProfiles();
        this.renderVoiceProfilesModalContent();
      } catch (e) {
        console.error('[FarmaVoiceEngine] Error eliminando voz:', e);
      }
    }
  }

  window.farmaVoice = new FarmaVoiceEngine();
  window.farmaVoiceEngine = window.farmaVoice;
})();
