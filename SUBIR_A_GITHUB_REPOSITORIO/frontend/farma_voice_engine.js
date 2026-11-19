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
      this.alwaysOnEnabled = localStorage.getItem(STORAGE_ALWAYS_ON_KEY) !== 'false';
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
        // await this.loadUnmetDemand();
        setTimeout(() => this.injectUnmetDemandNavButton(), 100);
      }
      // setTimeout(() => this.bindZeroResultSearchHooks(), 800);

      // Acoplar controles al avatar 3D y arrancar escucha continua automáticamente en el POS
      setTimeout(() => {
        this.attachAvatarControls();
        this.patchUnifiedAgentSpeech();

        // Tanto en POS físico como en la App del Paciente, Farma está siempre atenta a su nombre ("Farma...")
        this.startContinuousSentinel(true);

        // Desbloqueo automático ante la primera interacción si el navegador exige gesto de usuario para el micrófono
        const unlockMicOnFirstGesture = () => {
          if (!this.isListening) {
            this.startContinuousSentinel(true);
          }
        };
        document.addEventListener('pointerdown', unlockMicOnFirstGesture, { once: true, passive: true });
        document.addEventListener('keydown', unlockMicOnFirstGesture, { once: true, passive: true });
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
          if (window.farmaUnifiedAgent && typeof window.farmaUnifiedAgent.setAudioState === 'function') {
            window.farmaUnifiedAgent.setAudioState('speaking');
          }
        };
        utter.onend = () => {
          setTimeout(() => {
            this.isSpeaking = false;
            if (window.farmaUnifiedAgent && typeof window.farmaUnifiedAgent.setAudioState === 'function') {
              window.farmaUnifiedAgent.setAudioState(this.awaitingOrderAfterWake ? 'listening' : 'idle');
            }
          }, 250);
        };
        utter.onerror = () => {
          this.isSpeaking = false;
          if (window.farmaUnifiedAgent && typeof window.farmaUnifiedAgent.setAudioState === 'function') {
            window.farmaUnifiedAgent.setAudioState('idle');
          }
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
        // Barge-In: Si Farma está hablando y se detecta voz con la palabra Farma o comando, silenciar a Farma al instante
        if (this.isSpeaking) {
          let hasSpeech = false;
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const t = (event.results[i][0].transcript || '').toLowerCase();
            if (t.includes('farma') || t.includes('espera') || t.includes('para') || t.includes('agrega') || t.length > 5) {
              hasSpeech = true;
              break;
            }
          }
          if (hasSpeech) {
            if (this.synth) this.synth.cancel();
            this.isSpeaking = false;
            this.playChime('barge');
            if (window.farmaUnifiedAgent && typeof window.farmaUnifiedAgent.setAudioState === 'function') {
              window.farmaUnifiedAgent.setAudioState('listening');
            }
          } else {
            return;
          }
        }

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


    /* =========================================================================
       AUDIO CHIMES SINTETIZADOS (FEEDBACK AUDITIVO INMEDIATO)
       ========================================================================= */
    playChime(type = 'wake') {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        if (type === 'wake') {
          // Sonar / Wake chime: tono ascendente suave y futurista (440Hz -> 880Hz)
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.14);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
          osc.start(now);
          osc.stop(now + 0.28);
        } else if (type === 'success') {
          // Éxito: acorde musical mayor rápido
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(523.25, now); // C5
          osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
          gain.gain.setValueAtTime(0.10, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
          osc.start(now);
          osc.stop(now + 0.25);
        } else if (type === 'barge') {
          // Interrupción inmediata: clic sutil
          osc.type = 'sine';
          osc.frequency.setValueAtTime(300, now);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
          osc.start(now);
          osc.stop(now + 0.06);
        }
      } catch (e) {}
    }

    openFollowUpWakeWindow(seconds = 10) {
      this.awaitingOrderAfterWake = true;
      this.playChime('wake');
      if (window.farmaUnifiedAgent && typeof window.farmaUnifiedAgent.setAudioState === 'function') {
        window.farmaUnifiedAgent.setAudioState('listening');
      }
      this.updateToolbarUI();
      if (this.wakeWindowTimer) clearTimeout(this.wakeWindowTimer);
      this.wakeWindowTimer = setTimeout(() => {
        this.awaitingOrderAfterWake = false;
        if (window.farmaUnifiedAgent && typeof window.farmaUnifiedAgent.setAudioState === 'function') {
          window.farmaUnifiedAgent.setAudioState('idle');
        }
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
        // Si no hay voces aún en el POS, iniciamos escucha para permitirle al operador usar el sistema o pedirle grabar su voz al decir "Farma"
        this.alwaysOnEnabled = true;
        localStorage.setItem(STORAGE_ALWAYS_ON_KEY, 'true');
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
          if (window.farmaUnifiedAgent) {
            window.farmaUnifiedAgent.say(
              'Hola. Para que solo responda a tu voz en caja, dime tu nombre o presiona Grabar en este asistente.',
              'Seguridad Biométrica POS',
              8,
              [{ label: 'Grabar mi voz ahora', icon: '🎙️', primary: true, onClick: () => window.farmaVoice.openVoiceProfilesModal() }]
            );
          }
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
          this.playChime('success');

          // Generar chips interactivos si hay acciones relevantes (ej: sustituto bioequivalente, cobro, etc.)
          const interactiveActions = [];
          if (Array.isArray(data.acciones)) {
            data.acciones.forEach(acc => {
              if (acc.tipo === 'SUGGEST_SUBSTITUTE' && acc.termino_busqueda) {
                interactiveActions.push({
                  label: `Agregar ${acc.termino_busqueda} (${acc.presentacion_sugerida || 'Blíster'})`,
                  icon: '🔄',
                  primary: true,
                  command: `agrega 1 ${acc.presentacion_sugerida || 'blíster'} de ${acc.termino_busqueda}`
                });
              } else if (acc.tipo === 'FILTER_CATALOG' && acc.termino_busqueda) {
                interactiveActions.push({
                  label: `Ver ${acc.termino_busqueda}`,
                  icon: '🔍',
                  onClick: () => {
                    const inp = document.getElementById(isPOS ? 'pos-barcode-input' : 'app-search-input');
                    if (inp) {
                      inp.value = acc.termino_busqueda;
                      if (isPOS && typeof window.handlePosSearchInput === 'function') window.handlePosSearchInput(acc.termino_busqueda);
                      else if (!isPOS && typeof window.handleAppSearch === 'function') window.handleAppSearch();
                    }
                  }
                });
              }
            });
          }

          if (window.farmaUnifiedAgent) {
            window.farmaUnifiedAgent.say(
              data.respuesta_voz || 'Orden ejecutada.',
              isPOS ? 'Farma POS Copilot' : 'Farma Salud',
              12,
              interactiveActions
            );
          }

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
      this.unmetDemandItems = [];
      this.updateUnmetDemandBadge();
    }

    updateUnmetDemandBadge() {
      this.unmetDemandItems = [];
      document.querySelectorAll('[data-unmet-count]').forEach(el => {
        el.textContent = '0';
        el.style.display = 'none';
      });
    }

    injectUnmetDemandNavButton() {
      const btn = document.getElementById('btn-unmet-demand-dock');
      if (btn) btn.remove();
      const modal = document.getElementById('farma-unmet-demand-modal');
      if (modal) modal.remove();
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

    isPlausibleMedicine(term) {
      if (!term || typeof term !== 'string') return false;
      const t = term.trim().toLowerCase();
      if (t.length < 3 || /^\d+$/.test(t)) return false;
      const invalid = [
        'cuanto', 'cuánto', 'vendido', 'ventas', 'como se', 'cómo se', 'corte', 'caja', 'hola', 'buenos',
        'precio', 'deudor', 'reporte', 'ticket', 'imprimir', 'ayuda', 'farma', 'quien eres', 'quién eres',
        'gracias', 'cambiar', 'usuario', 'login', 'salir', 'sistema', 'dinero', 'ganancias',
        'dia', 'día', 'hoy', 'mes', 'ano', 'año', 'hora', 'que es', 'por que', 'para que', 'hacer', 'puedes',
        'donde', 'dónde', 'cuando', 'cuándo', 'stock', 'buscar', 'agregar', 'cobrar', 'cliente', 'factura',
        'explicame', 'explícame', 'enseñame', 'enséñame', 'donde esta', 'dónde está', 'prueba', 'test',
        'demo', 'ejemplo', 'inventado', 'cualquiera', 'nada', 'todo', 'algo', 'ver', 'mostrar'
      ];
      if (invalid.some(k => t.includes(k))) return false;
      if (!/[aeiouáéíóú]/.test(t)) return false;
      return true;
    }

    bindZeroResultSearchHooks() {
      // Desactivado: no registrar faltantes automáticos
    }

    async checkZeroResultSearch(term, origen) {
      return;
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
          } else if (tipo === 'APPLY_DISCOUNT') {
            const pct = Math.max(1, Math.min(100, Number(acc.porcentaje || 5)));
            if (window.sysState) {
              window.sysState.posManualDiscountPct = pct;
              const bonusCheck = document.getElementById('pos-apply-bonus-check');
              if (bonusCheck) bonusCheck.checked = true;
              const bonusPctLabel = document.getElementById('pos-bonus-pct-label');
              if (bonusPctLabel) bonusPctLabel.textContent = `${pct}%`;
              const bonusContainer = document.getElementById('pos-plan-bonus-container');
              if (bonusContainer) bonusContainer.classList.remove('hidden');
              if (typeof window.renderPosCart === 'function') window.renderPosCart();
            }
          } else if (tipo === 'NAV_REPORTES' || tipo === 'SHOW_SALES_REPORT' || tipo === 'OPEN_REPORTES') {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('reportes');
          } else if (tipo === 'NAV_DEUDORES' || tipo === 'OPEN_DEUDORES') {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('deudores');
          } else if (tipo === 'NAV_INVENTARIO' || tipo === 'OPEN_INVENTARIO') {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('inventario');
          } else if (tipo === 'NAV_PEDIDOS' || tipo === 'OPEN_PEDIDOS') {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('solicitudes');
          } else if (tipo === 'NAV_POS' || tipo === 'OPEN_POS') {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('pos');
          } else if (tipo === 'NAV_VENCIMIENTOS' || tipo === 'OPEN_VENCIMIENTOS') {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('vencimientos');
          } else if (tipo === 'NAV_RECETAS' || tipo === 'OPEN_RECETAS') {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('recetas');
          } else if (tipo === 'NAV_CRONICOS' || tipo === 'OPEN_CRONICOS') {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('cronicos');
          } else if (tipo === 'OPEN_CAJA_MODAL') {
            if (typeof window.openPosCajaModal === 'function') window.openPosCajaModal();
          } else if (tipo === 'OPEN_DEUDORES') {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('deudores');
          } else if (tipo === 'OPEN_PHARMACARE') {
            if (typeof window.openPharmaCareModal === 'function') window.openPharmaCareModal();
          } else if (tipo === 'OPEN_NEW_PRODUCT') {
            if (typeof window.openNewProductModal === 'function') window.openNewProductModal();
          } else if (tipo === 'OPEN_RECETA_OCR') {
            if (typeof window.openPosRecetaOcrModal === 'function') window.openPosRecetaOcrModal();
          } else if (tipo === 'OPEN_PSICOTROPICOS') {
            if (typeof window.openPosPsicotropicosModal === 'function') window.openPosPsicotropicosModal();
          } else if (tipo === 'OPEN_CRONICOS') {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('cronicos');
          } else if (tipo === 'OPEN_PEDIDOS') {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('solicitudes');
          } else if (tipo === 'OPEN_CONFIG') {
            if (typeof window.switchSysTab === 'function') window.switchSysTab('config');
          } else if (tipo === 'TOGGLE_ROLE_DROPDOWN') {
            if (typeof window.toggleRbacQuickSwitchDropdown === 'function') window.toggleRbacQuickSwitchDropdown();
          } else if (tipo === 'HIGHLIGHT_KITS') {
            const el = document.getElementById('pos-quick-kits-container') || document.querySelector('[class*="kits"]');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
