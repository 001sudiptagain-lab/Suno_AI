// ==============================================================================
// PRODUCTION REAL-TIME LIVE VOICE ASSISTANT CLIENT CONTROLLER (voice-live.js)
// Real VAD, Web Audio API, WebSocket Streaming, Canvas 3D Neural Orb, Barge-in
// ==============================================================================

(function () {
  'use strict';

  // State Machine definitions
  const VoiceState = {
    IDLE: 'IDLE',
    CONNECTING: 'CONNECTING',
    READY: 'READY',
    LISTENING: 'LISTENING',
    USER_SPEAKING: 'USER_SPEAKING',
    THINKING: 'THINKING',
    AI_SPEAKING: 'AI_SPEAKING',
    INTERRUPTED: 'INTERRUPTED',
    ERROR: 'ERROR'
  };

  class LiveVoiceManager {
    constructor() {
      // DOM Elements
      this.screen = document.getElementById('liveVoiceScreen');
      this.waveCanvas = document.getElementById('liveVoiceWaveCanvas');
      this.statusText = document.getElementById('liveVoiceStatusText');
      this.transcriptUser = document.getElementById('liveTranscriptUser');
      this.transcriptAi = document.getElementById('liveTranscriptAi');
      this.langSelect = document.getElementById('liveVoiceLangSelect');
      this.micDeviceSelect = document.getElementById('liveMicDeviceSelect');
      this.micMeter = document.getElementById('liveMicMeter');
      this.dockTypeContainer = document.getElementById('dockTypeContainer');
      this.dockTypeToggleBtn = document.getElementById('dockTypeToggleBtn');
      this.dockTextInput = document.getElementById('dockTextInput');
      this.dockSendBtn = document.getElementById('dockSendBtn');
      this.dockSpeakerBtn = document.getElementById('dockSpeakerBtn');
      this.dockMicToggleBtn = document.getElementById('dockMicToggleBtn');
      this.dockMicIcon = document.getElementById('dockMicIcon');
      this.dockEndVoiceBtn = document.getElementById('dockEndVoiceBtn');
      this.isSpeakerMuted = false;

      // Live Analysis & Assessment Popup Elements
      this.voiceDataToggleBtn = document.getElementById('voiceDataToggleBtn');
      this.vdToggleDot = this.voiceDataToggleBtn ? this.voiceDataToggleBtn.querySelector('.vd-indicator-dot') : null;
      this.voiceDataCardPopup = document.getElementById('voiceDataCardPopup');
      this.vdLiveDot = this.voiceDataCardPopup ? this.voiceDataCardPopup.querySelector('.vd-emerald-live-dot') : null;
      this.vdPage1 = document.getElementById('vdPage1');
      this.vdPage2 = document.getElementById('vdPage2');
      this.vdNextBtn = document.getElementById('vdNextBtn');
      this.vdBackBtn = document.getElementById('vdBackBtn');
      this.vdCloseBtn = document.getElementById('vdCloseBtn');

      // Metric Indicators Elements
      this.vdLatencyVal = document.getElementById('vdLatencyVal');
      this.vdSviNum = document.getElementById('vdSviNum');
      this.vdSeverityBadge = document.getElementById('vdSeverityBadge');
      this.vdBadgeText = document.getElementById('vdBadgeText');
      this.vdTrendArrow = document.getElementById('vdTrendArrow');
      this.vdTrendText = document.getElementById('vdTrendText');
      this.vdMoodDot = document.getElementById('vdMoodDot');
      this.vdMoodText = document.getElementById('vdMoodText');
      this.vdDistressVal = document.getElementById('vdDistressVal');
      this.vdFearVal = document.getElementById('vdFearVal');
      this.vdLangVal = document.getElementById('vdLangVal');
      this.vdIndSuicide = document.getElementById('vdIndSuicide');
      this.vdIndThreat = document.getElementById('vdIndThreat');
      this.vdIndDistress = document.getElementById('vdIndDistress');
      this.vdIndSelfHarm = document.getElementById('vdIndSelfHarm');
      this.vdSupportList = document.getElementById('vdSupportList');

      // Real-Time Live Analysis & Assessment Telemetry Engine State
      this.currentSvi = 15;
      this.smoothedSvi = 15;
      this.lastSvi = 15;
      this.sviHistory = [];
      this.turnStartTime = null;

      // Acoustic Feature Tracker
      this.audioFeatureTracker = {
        samples: [],
        speechEnergySum: 0,
        speechFramesCount: 0,
        silentFramesCount: 0,
        lastVoiceActivityTime: Date.now(),
        isUserSpeakingAcoustic: false,
        speakingDurationMs: 0,
        pauseCount: 0,
        totalPauseDurationMs: 0,
        wordsSpoken: 0,
        lastSpokeTimestamp: 0,
        smoothedAcousticDistress: 12
      };

      // Emotional & Risk State
      this.currentEmotion = 'Calm';
      this.currentDistressPct = 10;
      this.currentFearPct = 5;
      this.detectedLanguageName = 'English';
      this.sessionDetectedSafetyFlags = {
        suicide: false,
        threat: false,
        severeDistress: false,
        selfHarm: false,
        deescalated: false,
        safetyConfirmed: false
      };
      this.lastAnalysisUpdateTime = 0;

      // Launcher triggers in standard UI
      this.openLiveVoiceBtn = document.getElementById('openLiveVoiceBtn');
      this.launchLiveVoicePillBtn = document.getElementById('launchLiveVoicePillBtn');

      // Internal State
      this.currentState = VoiceState.IDLE;
      this.isMuted = false;
      this.isThinkMode = false;
      this.selectedDeviceId = 'default';

      // Modular VoiceAssistant Service Instance
      this.voiceAssistant = new window.VoiceAssistant({
        enableGeminiLive: true,
        onStateChange: (state, payload) => {
          this.setState(state, payload?.message);
        },
        onAudioLevel: (data) => {
          this.currentAudioRMS = data.rms || 0;
          this.audioFrequencyData = data.frequencyData || this.audioFrequencyData;
          this.updateMicMeterUI(this.currentAudioRMS);
          // Continuous Live Real-time Acoustic Feature Processing
          this.processAcousticFrame(this.currentAudioRMS, this.audioFrequencyData, data.state);
        },
        onTranscript: ({ role, text, isFinal }) => {
          if (role === 'user') {
            if (this.transcriptUser) {
              this.transcriptUser.textContent = `"${text}"`;
            }
            // Auto-detect spoken language and synchronize the top dropdown accordingly
            if (text && text.trim()) {
              this.autoDetectAndSetLanguage(text);
              this.updateTelemetryAnalysis(text);
            }
            this.turnStartTime = Date.now();
            if (isFinal && window.syncLiveVoiceUserMessage) {
              window.syncLiveVoiceUserMessage(text);
            }
          } else if (role === 'assistant') {
            if (this.turnStartTime) {
              const latencySec = ((Date.now() - this.turnStartTime) / 1000).toFixed(1);
              if (this.vdLatencyVal) {
                this.vdLatencyVal.textContent = `${latencySec}s`;
              }
              if (isFinal) {
                this.turnStartTime = null;
              }
            }
            if (this.transcriptAi) {
              if (isFinal) {
                this.transcriptAi.textContent = text;
                if (window.syncLiveVoiceMessage) {
                  window.syncLiveVoiceMessage(text);
                }
              } else {
                if (this.transcriptAi.textContent === 'Thinking...' || this.transcriptAi.textContent === '') {
                  this.transcriptAi.textContent = text;
                } else {
                  this.transcriptAi.textContent += text;
                }
              }
            }
          }
        },
        onInterruption: () => {
          console.log('[Live Voice UI] Interruption received from service');
          if (this.statusText) {
            this.statusText.textContent = 'Listening...';
            this.statusText.style.color = '#D9F9DF';
          }
        },
        onError: (err) => {
          const msg = (typeof err === 'object' && err !== null) ? (err.message || 'Connection issue') : String(err);
          this.setState(VoiceState.ERROR, msg);
        }
      });

      // Orb & Wave Animation Data
      this.orbCtx = this.orbCanvas ? this.orbCanvas.getContext('2d') : null;
      this.waveCtx = this.waveCanvas ? this.waveCanvas.getContext('2d') : null;
      this.animationFrameId = null;
      this.orbPhase = 0;
      this.audioFrequencyData = new Uint8Array(64);
      this.currentAudioRMS = 0;

      // Render initial real baseline telemetry state (15/100, Very Low, Stable, Calm, 10% Distress, 5% Fear)
      this.renderTelemetryUI('Stable', '→');

      this.initEvents();
    }

    updateRecognitionLanguage() {
      if (!this.langSelect) return;
      const lang = this.langSelect.value || 'hi-IN';
      console.log('[Live Voice UI] Recognition language updated to:', lang);
      if (this.voiceAssistant) {
        this.voiceAssistant.setLanguage(lang);
      }
    }

    initEvents() {
      if (this.langSelect) {
        this.langSelect.addEventListener('change', () => {
          this.updateRecognitionLanguage();
        });
      }
      if (this.micDeviceSelect) {
        this.micDeviceSelect.addEventListener('change', async () => {
          const newDeviceId = this.micDeviceSelect.value;
          if (newDeviceId === this.selectedDeviceId && this.voiceAssistant && this.voiceAssistant.mediaStream) {
            return; // Don't abort/switch if already connected to this device
          }
          this.selectedDeviceId = newDeviceId;
          console.log(`[Live Voice UI] Selected microphone changed to: ${this.selectedDeviceId}`);
          if (this.voiceAssistant && this.screen && this.screen.classList.contains('active')) {
            const currentLabel = this.micDeviceSelect.options[this.micDeviceSelect.selectedIndex]?.text?.replace(/^[🎙️\s]+/, '') || 'Microphone';
            this.setState(VoiceState.CONNECTING, `Connecting ${currentLabel}...`);
            const ok = await this.voiceAssistant.switchMicrophone(this.selectedDeviceId);
            if (this.screen && this.screen.classList.contains('active') && !this.isMuted) {
              this.setState(VoiceState.LISTENING, 'Listening... Speak now');
            }
          }
        });
      }

      // Automatically refresh microphone list when external USB / Bluetooth mics are plugged in or unplugged
      if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
        navigator.mediaDevices.addEventListener('devicechange', async () => {
          console.log('[Live Voice UI] Audio device change detected (hotplug)');
          await this.populateAudioDevices();
        });
      }
      if (this.openLiveVoiceBtn) {
        this.openLiveVoiceBtn.addEventListener('click', () => this.startLiveSession());
      }
      if (this.launchLiveVoicePillBtn) {
        this.launchLiveVoicePillBtn.addEventListener('click', () => {
          if (this.screen && this.screen.classList.contains('active')) {
            this.toggleMicrophoneMute();
          } else {
            this.startLiveSession();
          }
        });
      }
      const sidebarLiveVoiceBtn = document.getElementById('sidebarLiveVoiceBtn');
      if (sidebarLiveVoiceBtn) {
        sidebarLiveVoiceBtn.addEventListener('click', () => this.startLiveSession());
      }
      const voiceBackBtn = document.getElementById('voiceBackBtn');
      if (voiceBackBtn) {
        voiceBackBtn.addEventListener('click', () => this.endLiveSession());
      }
      if (this.dockEndVoiceBtn) {
        this.dockEndVoiceBtn.addEventListener('click', () => this.endLiveSession());
      }
      if (this.dockMicToggleBtn) {
        this.dockMicToggleBtn.addEventListener('click', () => this.toggleMicrophoneMute());
      }
      if (this.dockSpeakerBtn) {
        this.dockSpeakerBtn.addEventListener('click', () => this.toggleSpeakerMute());
      }
      if (this.dockTypeToggleBtn) {
        this.dockTypeToggleBtn.addEventListener('click', () => {
          this.dockTextInput.focus();
        });
      }
      if (this.dockSendBtn) {
        this.dockSendBtn.addEventListener('click', () => this.sendTypedQuery());
      }
      if (this.dockTextInput) {
        this.dockTextInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.sendTypedQuery();
          }
        });
      }

      // Quick Dola Topic Pills Handler
      document.querySelectorAll('.dola-topic-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          const prompt = pill.getAttribute('data-voice-prompt');
          if (prompt) {
            if (this.transcriptUser) {
              this.transcriptUser.textContent = `"${prompt}"`;
            }
            this.processUserSpeech(prompt);
          }
        });
      });

      // Live Analysis & Assessment Popup Handlers
      if (this.voiceDataToggleBtn && this.voiceDataCardPopup) {
        this.voiceDataToggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isActive = this.voiceDataCardPopup.classList.toggle('active');
          this.voiceDataToggleBtn.classList.toggle('active', isActive);
        });
      }

      // Page Navigation: Page 1 -> Page 2
      if (this.vdNextBtn && this.vdPage1 && this.vdPage2) {
        this.vdNextBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.vdPage1.classList.remove('active');
          this.vdPage2.classList.add('active');
        });
      }

      // Page Navigation: Page 2 -> Page 1
      if (this.vdBackBtn && this.vdPage1 && this.vdPage2) {
        this.vdBackBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.vdPage2.classList.remove('active');
          this.vdPage1.classList.add('active');
        });
      }

      // Close Button
      if (this.vdCloseBtn && this.voiceDataCardPopup) {
        this.vdCloseBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.voiceDataCardPopup.classList.remove('active');
          if (this.voiceDataToggleBtn) this.voiceDataToggleBtn.classList.remove('active');
        });
      }

      // Dismiss popup when clicking outside
      document.addEventListener('click', (e) => {
        if (!this.voiceDataCardPopup || !this.voiceDataCardPopup.classList.contains('active')) return;
        if (!this.voiceDataCardPopup.contains(e.target) && !this.voiceDataToggleBtn.contains(e.target)) {
          this.voiceDataCardPopup.classList.remove('active');
          if (this.voiceDataToggleBtn) this.voiceDataToggleBtn.classList.remove('active');
        }
      });

      // Keyboard Accessibility
      window.addEventListener('keydown', (e) => {
        if (!this.screen || !this.screen.classList.contains('active')) return;
        if (e.key === 'Escape') {
          if (this.voiceDataCardPopup && this.voiceDataCardPopup.classList.contains('active')) {
            this.voiceDataCardPopup.classList.remove('active');
            if (this.voiceDataToggleBtn) this.voiceDataToggleBtn.classList.remove('active');
            return;
          }
          this.endLiveSession();
        } else if (e.key.toLowerCase() === 'm' && document.activeElement !== this.dockTextInput) {
          this.toggleMicrophoneMute();
        }
      });
    }

    setState(newState, statusLabel = null) {
      if (this.isMuted && (newState === VoiceState.LISTENING || newState === VoiceState.USER_SPEAKING)) {
        if (this.statusText) {
          this.statusText.textContent = 'Microphone Muted';
          this.statusText.style.color = '#ef4444';
        }
        return;
      }
      this.currentState = newState;
      if (this.statusText) {
        switch (newState) {
          case VoiceState.CONNECTING:
            this.statusText.textContent = statusLabel || 'Connecting...';
            this.statusText.style.color = 'rgba(255, 230, 240, 0.9)';
            break;
          case VoiceState.READY:
            this.statusText.textContent = statusLabel || 'Microphone Ready';
            this.statusText.style.color = 'rgba(255, 230, 240, 0.9)';
            break;
          case VoiceState.LISTENING:
            this.statusText.textContent = statusLabel || 'Listening... Speak now';
            this.statusText.style.color = '#ffffff';
            break;
          case VoiceState.USER_SPEAKING:
            this.statusText.textContent = statusLabel || 'Listening to you...';
            this.statusText.style.color = '#ffb3ce';
            break;
          case VoiceState.THINKING:
            this.statusText.textContent = statusLabel || 'Thinking...';
            this.statusText.style.color = '#ffa3c4';
            break;
          case VoiceState.AI_SPEAKING:
            this.statusText.textContent = statusLabel || '';
            this.statusText.style.color = '#ffffff';
            break;
          case VoiceState.INTERRUPTED:
            this.statusText.textContent = 'Listening...';
            this.statusText.style.color = '#ffb3ce';
            break;
          case VoiceState.ERROR:
            this.statusText.textContent = statusLabel || 'Connection Issue';
            this.statusText.style.color = '#f43f85';
            break;
          default:
            this.statusText.textContent = statusLabel || '';
        }
      }
    }

    // ==========================================
    // HARDWARE AUDIO DEVICE ENUMERATION
    // ==========================================
    async populateAudioDevices() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        
        console.log('[Mic] Available audio input devices:');
        audioInputs.forEach((device, idx) => {
          console.log(`[Mic] Device #${idx}: label="${device.label || 'Default / Generic'}" deviceId="${device.deviceId}" groupId="${device.groupId}"`);
        });

        if (this.micDeviceSelect && audioInputs.length > 0) {
          const currentVal = this.selectedDeviceId || this.micDeviceSelect.value;
          this.micDeviceSelect.innerHTML = '';

          // 1. Add Default System Microphone option
          const defaultOpt = document.createElement('option');
          defaultOpt.value = 'default';
          defaultOpt.textContent = '🎙️ Default microphone';
          this.micDeviceSelect.appendChild(defaultOpt);

          // 2. Add enumerated audio devices
          let bestDeviceId = null;

          // First identify if there is a real physical microphone (Intel, Realtek, Array, etc.)
          const physicalMics = audioInputs.filter(device => {
            const label = device.label || '';
            const isVirtual = /steam|virtual|cable|voicemeeter|default|communications/i.test(label);
            return !isVirtual && device.deviceId && device.deviceId !== 'default';
          });

          if (physicalMics.length > 0) {
            bestDeviceId = physicalMics[0].deviceId;
          }

          audioInputs.forEach((device, idx) => {
            if (device.deviceId === 'default') return; // Handled above

            const opt = document.createElement('option');
            opt.value = device.deviceId || `mic-${idx}`;
            const label = device.label || `Microphone ${idx + 1}`;
            opt.textContent = `🎙️ ${label}`;
            this.micDeviceSelect.appendChild(opt);
          });

          // Retain user's explicit selection if valid, otherwise prioritize physical mic
          if (currentVal && currentVal !== 'default' && Array.from(this.micDeviceSelect.options).some(o => o.value === currentVal)) {
            this.micDeviceSelect.value = currentVal;
            this.selectedDeviceId = currentVal;
          } else if (bestDeviceId) {
            this.micDeviceSelect.value = bestDeviceId;
            this.selectedDeviceId = bestDeviceId;
            console.log(`[Mic] Prioritized physical microphone: ${bestDeviceId}`);
          } else {
            this.micDeviceSelect.value = 'default';
            this.selectedDeviceId = 'default';
          }

          if (window.refreshCustomDropdown) {
            window.refreshCustomDropdown(this.micDeviceSelect);
          }
        }
      } catch (err) {
        console.warn('[Live Voice]: enumerateDevices error:', err);
      }
    }

    updateMicMeterUI(rms) {
      if (!this.micMeter) return;
      const bars = this.micMeter.querySelectorAll('.meter-bar');
      const activeCount = Math.min(Math.floor(rms / 4), bars.length);
      bars.forEach((bar, idx) => {
        if (idx < activeCount) {
          bar.style.height = `${8 + idx * 3}px`;
          bar.style.backgroundColor = idx >= 3 ? '#D9F9DF' : '#AEE2FF';
        } else {
          bar.style.height = '6px';
          bar.style.backgroundColor = '#CBD0FF';
        }
      });
    }

    updateRecognitionLanguage() {
      const selected = this.langSelect ? this.langSelect.value : 'auto';
      if (this.voiceAssistant) {
        this.voiceAssistant.setLanguage(selected);
      }
    }

    autoDetectAndSetLanguage(text) {
      if (!text || !this.langSelect) return;
      const str = text.trim();
      let detectedLang = null;

      // 1. Bengali detection (Bengali script or key Bengali words)
      if (/[\u0980-\u09FF]/.test(str) || /\b(kemon|acho|achen|tumi|tomar|apni|apnar|bhalo|kothay|ki|korcho|bolchi|shuncho|aajke|ekhon|bangla|khobor)\b/i.test(str)) {
        detectedLang = 'bn-IN';
      }
      // 2. Pure Hindi detection (Devanagari script or pure Hindi words)
      else if (/[\u0900-\u097F]/.test(str) || /\b(namaste|kaise|kaisa|batao|aap|aapka|aapki|mera|meri|kijiye|dhanyawad|shukriya|madad|sahayata|kripya)\b/i.test(str)) {
        detectedLang = 'hi-IN';
      }
      // 3. English detection (Default for English words and standard Latin characters)
      else if (/[a-zA-Z]/.test(str)) {
        detectedLang = 'en-US';
      }

      if (detectedLang && this.langSelect.value !== detectedLang) {
        this.langSelect.value = detectedLang;
        // Trigger dropdown UI refresh
        if (typeof window.refreshCustomDropdown === 'function') {
          window.refreshCustomDropdown(this.langSelect);
        } else {
          this.langSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (this.voiceAssistant) {
          this.voiceAssistant.setLanguage(detectedLang);
        }
      }
    }

    processUserSpeech(text) {
      if (!text) return;
      this.autoDetectAndSetLanguage(text);
      if (this.transcriptAi) this.transcriptAi.textContent = 'Thinking...';
      if (this.voiceAssistant) {
        this.voiceAssistant.send(text);
      }
    }

    sendTypedQuery() {
      const text = this.dockTextInput ? this.dockTextInput.value.trim() : '';
      if (!text) return;

      if (this.dockTextInput) this.dockTextInput.value = '';
      if (this.transcriptUser) {
        this.transcriptUser.textContent = `"${text}"`;
      }
      this.processUserSpeech(text);
    }

    // =========================================================================
    // CIRCULAR QUANTUM HARMONIC HALO & ORBITAL AURA (AUDIO-SYNCED CIRCLE)
    // Synchronized circular multi-harmonic glowing loops + reactive audio halo
    // =========================================================================
    startOrbRenderer() {
      if (!this.waveCanvas) {
        this.waveCanvas = document.getElementById('liveVoiceWaveCanvas');
      }
      this.waveCtx = this.waveCanvas ? this.waveCanvas.getContext('2d') : null;
      if (!this.waveCtx || !this.waveCanvas) return;

      let smoothedRMS = 0;
      let currentSpeechScale = 0.20;
      let smoothedCompFactor = 0;
      const smoothedFreqs = new Float32Array(64);
      for (let i = 0; i < 64; i++) {
        smoothedFreqs[i] = 10;
      }

      // 36 Ambient Orbiting Stardust Particles
      const particles = [];
      const particleColors = ['#7358FF', '#00D2FF', '#FF4DB8', '#00FF9D', '#AEE2FF'];
      for (let p = 0; p < 36; p++) {
        particles.push({
          angle: Math.random() * Math.PI * 2,
          dist: Math.random() * 95 + 35,
          speed: (Math.random() * 0.02 + 0.008) * (Math.random() > 0.5 ? 1 : -1),
          size: Math.random() * 2.2 + 0.8,
          alpha: Math.random() * 0.6 + 0.25,
          color: particleColors[Math.floor(Math.random() * particleColors.length)]
        });
      }

      const render = () => {
        if (!this.screen || !this.screen.classList.contains('active')) return;

        this.orbPhase += 0.035;

        // Smooth energy and frequency data with progressive dual-rate attack/release lerp
        const rawRMS = this.currentAudioRMS || 0;
        smoothedRMS += (rawRMS - smoothedRMS) * 0.15;

        for (let i = 0; i < 64; i++) {
          const rawF = this.audioFrequencyData[i] || 0;
          // Smooth rise and fall for each spectral frequency
          const smoothingFactor = rawF > smoothedFreqs[i] ? 0.22 : 0.12;
          smoothedFreqs[i] += (rawF - smoothedFreqs[i]) * smoothingFactor;
        }

        let sumEnergy = 0;
        for (let i = 0; i < 32; i++) {
          sumEnergy += smoothedFreqs[i];
        }
        const avgEnergy = (sumEnergy / 32) / 255;
        const isSpeaking = this.currentState === VoiceState.USER_SPEAKING || this.currentState === VoiceState.AI_SPEAKING;
        const isThinking = this.currentState === VoiceState.THINKING;

        // Dynamic audio amplitude factor with gentle continuous soft-knee compression
        const rawSpeechFactor = avgEnergy * 2.5 + (smoothedRMS * 0.08);
        const targetCompFactor = Math.tanh(rawSpeechFactor * 1.4) * 1.15;
        
        // Attack vs Release smoothing for the suppression curve
        const compLerpRate = targetCompFactor > smoothedCompFactor ? 0.14 : 0.07;
        smoothedCompFactor += (targetCompFactor - smoothedCompFactor) * compLerpRate;

        const targetSpeechScale = isSpeaking 
          ? (0.50 + smoothedCompFactor) 
          : (isThinking ? (0.32 + Math.sin(this.orbPhase * 2.5) * 0.10) : 0.18);

        // Smoothly interpolate between active and idle scale (eliminates sudden pops or jumps)
        const scaleLerpRate = targetSpeechScale > currentSpeechScale ? 0.16 : 0.08;
        currentSpeechScale += (targetSpeechScale - currentSpeechScale) * scaleLerpRate;
        const speechScale = currentSpeechScale;

        const ctx = this.waveCtx;
        const w = this.waveCanvas.width;
        const h = this.waveCanvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const baseRadius = 100;

        ctx.clearRect(0, 0, w, h);

        // -------------------------------------------------------------
        // LAYER 1: Orbiting Stardust Particles
        // -------------------------------------------------------------
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        particles.forEach(pt => {
          pt.angle += pt.speed * (1 + speechScale * 0.5);
          const dynamicDist = pt.dist * (1 + speechScale * 0.15) + Math.sin(this.orbPhase * 1.5 + pt.angle * 2) * 4;
          const px = cx + Math.cos(pt.angle) * dynamicDist;
          const py = cy + Math.sin(pt.angle) * dynamicDist;

          ctx.beginPath();
          ctx.arc(px, py, pt.size * (0.8 + speechScale * 0.4), 0, Math.PI * 2);
          ctx.fillStyle = pt.color;
          ctx.globalAlpha = Math.min(0.9, pt.alpha * (0.6 + speechScale * 0.5));
          ctx.fill();
        });
        ctx.restore();

        // -------------------------------------------------------------
        // LAYER 2: Multi-Harmonic Undulating Circular Ribbons (Deepened & Enriched)
        // -------------------------------------------------------------
        ctx.save();
        ctx.globalCompositeOperation = 'screen';

        const circularHarmonics = [
          // 1. Deep Wine / Radiant Fuchsia Harmonic (#e02875)
          {
            color: 'rgba(224, 40, 117, 0.92)',
            glow: '#e02875',
            radiusOffset: -5,
            freq: 3,
            speed: 0.8,
            amp: 11 * speechScale,
            thick: 2.4,
            phaseOffset: 0
          },
          // 2. Glowing Neon Radiant Rose (#ff4f93)
          {
            color: 'rgba(255, 79, 147, 0.95)',
            glow: '#ff4f93',
            radiusOffset: 0,
            freq: 4,
            speed: -0.7,
            amp: 12 * speechScale,
            thick: 2.2,
            phaseOffset: 1.6
          },
          // 3. Vibrant Soft Pastel Coral Pink (#ffa6cc)
          {
            color: 'rgba(255, 166, 204, 0.95)',
            glow: '#ffa6cc',
            radiusOffset: 4,
            freq: 5,
            speed: 0.9,
            amp: 13 * speechScale,
            thick: 2.4,
            phaseOffset: 3.2
          },
          // 4. Radiant Pure Rose White Wave (#ffd6e7)
          {
            color: 'rgba(255, 214, 231, 0.98)',
            glow: '#ff7ebb',
            radiusOffset: -2,
            freq: 6,
            speed: -0.85,
            amp: 14 * speechScale,
            thick: 2.6,
            phaseOffset: 4.8
          }
        ];

        // 180 points for silky smooth, anti-aliased curves without harsh edges
        const numCircleSteps = 180;

        circularHarmonics.forEach((harm, hIdx) => {
          ctx.beginPath();
          for (let i = 0; i <= numCircleSteps; i++) {
            const angle = (i / numCircleSteps) * Math.PI * 2;
            
            // Frequency spectrum audio sync with smooth cosine interpolation
            const normPos = Math.abs((i % 90) - 45) / 45;
            const binIdx = Math.min(31, Math.floor(normPos * 31));
            const rawEnergy = (smoothedFreqs[binIdx] || 0) / 255;
            const fEnergy = Math.tanh(rawEnergy * 1.5); // Suppressed soft curve

            // Fluid sinusoidal harmonic wave formula around circle
            const wave1 = Math.sin(angle * harm.freq + this.orbPhase * harm.speed + harm.phaseOffset) * harm.amp;
            const wave2 = Math.cos(angle * (harm.freq - 1) - this.orbPhase * 0.5 + hIdx) * (harm.amp * 0.35);
            const reactiveExpansion = (fEnergy * 14 * speechScale);

            const r = baseRadius + harm.radiusOffset + wave1 + wave2 + reactiveExpansion;
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();

          ctx.strokeStyle = harm.color;
          ctx.lineWidth = Math.max(1.8, harm.thick * (0.8 + speechScale * 0.3));
          ctx.shadowColor = harm.glow;
          ctx.shadowBlur = 14 * (0.8 + speechScale * 0.4);
          ctx.stroke();
        });

        // -------------------------------------------------------------
        // LAYER 3: Incandescent Center Core Spine (Rose-Pink & Pure White Glow)
        // -------------------------------------------------------------
        ctx.beginPath();
        for (let i = 0; i <= numCircleSteps; i++) {
          const angle = (i / numCircleSteps) * Math.PI * 2;
          const normPos = Math.abs((i % 90) - 45) / 45;
          const binIdx = Math.min(31, Math.floor(normPos * 31));
          const fEnergy = Math.tanh(((smoothedFreqs[binIdx] || 0) / 255) * 1.5);

          const wave = Math.sin(angle * 5 + this.orbPhase * 1.4) * (7 * speechScale) +
                       Math.cos(angle * 2 - this.orbPhase * 1.0) * (5 * speechScale);
          const reactiveLift = (fEnergy * 9 * speechScale);

          const r = baseRadius + wave + reactiveLift;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(255, 245, 250, 0.98)';
        ctx.lineWidth = 2.4 * (0.9 + speechScale * 0.3);
        ctx.shadowColor = '#ff6ea6';
        ctx.shadowBlur = 16 * (0.8 + speechScale * 0.4);
        ctx.stroke();

        // Deep rich center radiant glow
        const centerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius * (0.85 + speechScale * 0.3));
        centerGlow.addColorStop(0, 'rgba(255, 79, 147, 0.38)');
        centerGlow.addColorStop(0.45, 'rgba(224, 40, 117, 0.22)');
        centerGlow.addColorStop(0.8, 'rgba(168, 38, 102, 0.10)');
        centerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = centerGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius * (0.85 + speechScale * 0.3), 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Living audio-reactive breathing for central S emblem (if present)
        if (this.sEmblemEl) {
          const sScale = 0.98 + (speechScale * 0.12);
          const sGlowBlur = 24 + (speechScale * 30);
          this.sEmblemEl.style.transform = `scale(${sScale.toFixed(3)})`;
          this.sEmblemEl.style.filter = `drop-shadow(0 0 ${sGlowBlur.toFixed(1)}px rgba(255, 79, 147, 0.75)) drop-shadow(0 0 ${(sGlowBlur * 1.6).toFixed(1)}px rgba(216, 69, 137, 0.45))`;
        }

        this.animationFrameId = requestAnimationFrame(render);
      };

      this.animationFrameId = requestAnimationFrame(render);
    }

    stopOrbRenderer() {
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    }

    // ==========================================
    // SESSION LIFECYCLE (START / END)
    // ==========================================
    async startLiveSession() {
      const mainPanel = document.querySelector('.aura-main-panel');
      if (mainPanel) {
        mainPanel.classList.add('voice-active-mode');
      }
      this.screen.classList.add('active');
      this.setState(VoiceState.CONNECTING, 'Initializing Microphone...');

      // Populate hardware microphones dropdown
      await this.populateAudioDevices();

      // Start 3D Ribbon / Orb Renderer
      this.startOrbRenderer();

      // Retrieve conversation memory and user settings
      const currentChat = window.getLiveVoiceActiveMessages ? window.getLiveVoiceActiveMessages() : [];
      let savedSettings = {};
      try {
        if (typeof localStorage !== 'undefined' && localStorage) {
          savedSettings = JSON.parse(localStorage.getItem('aura_settings') || localStorage.getItem('chatgpt_settings') || '{}');
        }
      } catch (e) {}

      // Seed session-level telemetry state from existing conversation memory
      this.currentSvi = 15;
      this.smoothedSvi = 15;
      this.lastSvi = 15;
      this.sviHistory = [];
      this.conversationTurns = [];
      this.audioFeatureTracker.speechEnergySum = 0;
      this.audioFeatureTracker.speechFramesCount = 0;
      this.audioFeatureTracker.silentFramesCount = 0;
      this.audioFeatureTracker.speakingDurationMs = 0;
      this.audioFeatureTracker.pauseCount = 0;
      this.audioFeatureTracker.totalPauseDurationMs = 0;
      this.audioFeatureTracker.wordsSpoken = 0;
      this.audioFeatureTracker.smoothedAcousticDistress = 12;
      this.currentDistressPct = 10;
      this.currentFearPct = 5;
      this.currentEmotion = 'Calm';
      this.sessionDetectedSafetyFlags = {
        suicide: false,
        threat: false,
        severeDistress: false,
        selfHarm: false
      };

      // Warm-start analysis from previous chat turns so context carries over seamlessly
      if (Array.isArray(currentChat) && currentChat.length > 0) {
        const userMsgs = currentChat.filter(m => m && m.role === 'user' && m.content);
        userMsgs.forEach(m => {
          this.updateTelemetryAnalysis(m.content);
        });
      } else {
        this.renderTelemetryUI('Stable', '→');
      }

      // Connect Modular Voice Assistant Service
      if (this.voiceAssistant) {
        const selectedLang = this.langSelect ? this.langSelect.value : 'auto';
        this.voiceAssistant.connect({
          deviceId: this.selectedDeviceId,
          language: selectedLang,
          history: currentChat,
          provider: savedSettings.provider || 'gemini',
          apiKey: savedSettings.apiKey || ''
        });
      }
    }

    endLiveSession() {
      console.log('[Live Voice]: Terminating session and releasing audio devices.');

      if (this.voiceAssistant) {
        this.voiceAssistant.disconnect();
      }

      this.stopOrbRenderer();
      this.screen.classList.remove('active');
      const mainPanel = document.querySelector('.aura-main-panel');
      if (mainPanel) {
        mainPanel.classList.remove('voice-active-mode');
      }
      this.setState(VoiceState.IDLE);
    }

    toggleMicrophoneMute() {
      this.isMuted = !this.isMuted;
      
      // Update Dock Mic Button visual state
      if (this.dockMicToggleBtn) {
        this.dockMicToggleBtn.classList.toggle('muted', this.isMuted);
        const micIcon = document.getElementById('dockMicIcon');
        if (micIcon) {
          if (this.isMuted) {
            // Muted Mic SVG (with strike-through slash)
            micIcon.innerHTML = `
              <line x1="1" y1="1" x2="23" y2="23"></line>
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            `;
          } else {
            // Normal Active Mic SVG
            micIcon.innerHTML = `
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            `;
          }
        }
      }

      // Update Pill Mic Button visual state if present
      if (this.launchLiveVoicePillBtn) {
        this.launchLiveVoicePillBtn.classList.toggle('muted', this.isMuted);
      }

      if (this.voiceAssistant) {
        this.voiceAssistant.setMuted(this.isMuted);
      }

      if (this.isMuted) {
        this.setState(VoiceState.IDLE, 'Microphone Muted');
      } else {
        this.setState(VoiceState.LISTENING, 'Listening... Speak now');
      }
    }

    toggleSpeakerMute() {
      this.isSpeakerMuted = !this.isSpeakerMuted;
      if (this.dockSpeakerBtn) {
        this.dockSpeakerBtn.classList.toggle('muted', this.isSpeakerMuted);
      }

      if (this.voiceAssistant) {
        if (this.isSpeakerMuted) {
          this.voiceAssistant._stopAllAudioPlayback();
          if (this.voiceAssistant.outputAnalyser) {
            this.voiceAssistant.outputAnalyser.disconnect();
          }
        } else {
          this.voiceAssistant._initAudioOutput();
        }
      }
    }

    // =========================================================
    // REAL-TIME ACOUSTIC FEATURE EXTRACTION & VAD TRACKER
    // =========================================================
    processAcousticFrame(rms, freqData, voiceState) {
      if (this.isMuted || this.currentState === VoiceState.IDLE) return;

      const now = performance.now();
      const tracker = this.audioFeatureTracker;

      // Filter background noise floor (< 2.2% RMS). Mic noise / fan hum shouldn't count as voice
      const isVoiceEnergy = rms > 2.2;

      // Detect speech vs silence
      if (isVoiceEnergy) {
        if (!tracker.isUserSpeakingAcoustic) {
          tracker.isUserSpeakingAcoustic = true;
          // If we had a pause between speech segments, count pause frequency
          if (tracker.lastSpokeTimestamp > 0) {
            const pauseDuration = now - tracker.lastSpokeTimestamp;
            if (pauseDuration > 300 && pauseDuration < 4000) {
              tracker.pauseCount++;
              tracker.totalPauseDurationMs += pauseDuration;
            }
          }
        }
        tracker.speakingDurationMs += 16;
        tracker.speechFramesCount++;
        tracker.speechEnergySum += rms;
        tracker.lastSpokeTimestamp = now;
        tracker.silentFramesCount = 0;
      } else {
        if (tracker.isUserSpeakingAcoustic) {
          tracker.silentFramesCount++;
          // Require at least 250ms of quiet before declaring utterance pause
          if (tracker.silentFramesCount > 15) {
            tracker.isUserSpeakingAcoustic = false;
          }
        }
      }

      // Calculate instantaneous Acoustic Distress Signal (0 - 100)
      // Energy intensity variance + sudden loud bursts + prolonged hesitation
      let rawAcousticDistress = 12; // calm conversational baseline

      // Agitation / high intensity voice bursts (RMS > 35)
      if (rms > 35) {
        rawAcousticDistress += Math.min(45, (rms - 35) * 1.2);
      } else if (rms > 18) {
        rawAcousticDistress += (rms - 18) * 0.6;
      }

      // High frequency pitch / spectral tilt agitation (energy in upper frequencies)
      if (freqData && freqData.length > 32) {
        let highFreqSum = 0;
        let lowFreqSum = 0;
        for (let i = 0; i < 16; i++) lowFreqSum += freqData[i] || 0;
        for (let i = 16; i < 48; i++) highFreqSum += freqData[i] || 0;
        if (lowFreqSum > 50 && (highFreqSum / lowFreqSum) > 0.85) {
          rawAcousticDistress += 12; // vocal strain / agitation marker
        }
      }

      // Smooth acoustic distress with Exponential Moving Average (EMA)
      if (this.sessionDetectedSafetyFlags.suicide || this.sessionDetectedSafetyFlags.selfHarm) {
        tracker.smoothedAcousticDistress = Math.max(tracker.smoothedAcousticDistress || 75, 75);
      } else if (this.currentDistressPct >= 50) {
        // When session has elevated emotional distress, don't decay acoustic signal below 28
        tracker.smoothedAcousticDistress = Math.max(28, (tracker.smoothedAcousticDistress * 0.94) + (rawAcousticDistress * 0.06));
      } else if (this.currentDistressPct >= 40) {
        tracker.smoothedAcousticDistress = Math.max(22, (tracker.smoothedAcousticDistress * 0.92) + (rawAcousticDistress * 0.08));
      } else {
        tracker.smoothedAcousticDistress = (tracker.smoothedAcousticDistress * 0.88) + (rawAcousticDistress * 0.12);
      }

      // Periodic Live Analysis update (every 180ms when speaking, or decay every 600ms when silent)
      if (now - this.lastAnalysisUpdateTime > (isVoiceEnergy ? 180 : 600)) {
        this.lastAnalysisUpdateTime = now;
        this.recalculateLiveTelemetry();
      }
    }

    // =========================================================
    // REACTIVE SVI & PSYCHOLOGICAL SAFETY TELEMETRY ENGINE
    // =========================================================
    updateTelemetryAnalysis(userText) {
      if (!userText || !userText.trim()) return;
      const text = userText.trim();
      const lower = text.toLowerCase();

      // 1. Language Detection (Multilingual Indian context: Hindi, Bengali, English)
      let detectedLang = this.detectedLanguageName || 'Hindi';
      if (/[\u0980-\u09FF]/.test(text) || /\b(tumi|tomar|kemon|achen|korecho|khub|bhalo|mon kharap|kosto|kichu|aajke|ekhon)\b/i.test(lower)) {
        detectedLang = 'Bengali';
      } else if (/[\u0900-\u097F]/.test(text) || /\b(kya|kaise|kaisa|nahi|meri|mera|dard|takleef|pareshan|chinta|bohot|accha|achha|hai|hu|bhi|kar|raha|rahi|samajh|ab|padhna|chahta|chahti|breakup)\b/i.test(lower)) {
        detectedLang = 'Hindi';
      } else if (/[a-zA-Z]/.test(text) && !/\b(kya|kaise|nahi|meri|mera|dard|hai|hu|kemon|bhalo|mar|jana|chahta|chahti|aatmhatya)\b/i.test(lower)) {
        detectedLang = 'English';
      }
      this.detectedLanguageName = detectedLang;
      if (this.vdLangVal) this.vdLangVal.textContent = detectedLang;

      // Track conversation turn in session history
      if (!this.conversationTurns) this.conversationTurns = [];
      const lastTurn = this.conversationTurns[this.conversationTurns.length - 1];
      if (!lastTurn || lastTurn.lower !== lower) {
        this.conversationTurns.push({ text: text, lower: lower, time: Date.now() });
      }
      if (this.conversationTurns.length > 30) this.conversationTurns.shift();

      // Retrieve full chat history (from text chat + live voice turns)
      const chatMessages = (typeof window.getLiveVoiceActiveMessages === 'function') 
        ? window.getLiveVoiceActiveMessages() 
        : [];
      
      const userHistoryTexts = chatMessages
        .filter(m => m && m.role === 'user' && m.content)
        .map(m => m.content.toLowerCase());
      
      const liveHistoryTexts = this.conversationTurns.map(t => t.lower);
      const combinedHistory = Array.from(new Set([...userHistoryTexts, ...liveHistoryTexts, lower]));
      const fullContextLower = combinedHistory.join(' ');

      // 2. Semantic Emotional & Distress Scoring
      // Severe Despair & Hopelessness keywords (English, Hindi/Hinglish, Bengali, Devanagari)
      const despairKeywords = [
        'hopeless', 'worthless', 'useless', 'broken', 'nobody cares', 'no one cares', 'hate myself',
        'hate my life', 'cant go on', "can't go on", 'lost everything', 'tired of living', 'tired of life',
        'want to disappear', 'give up', 'given up', 'pointless', 'nothing matters', 'feel empty',
        'crying every day', 'crying all day', 'mental breakdown', 'lost my mind', 'alone in this world',
        'bohot akela', 'koi nahi hai', 'sab khatam', 'barbaad', 'zindagi bekar', 'dimag kharab',
        'kosto hocche', 'aar bhalo lagena', 'aar parchi na', 'mon venge geche',
        'बर्बाद', 'सब खत्म', 'अकेला', 'कोई नहीं है', 'हिम्मत टूट गई', 'थक गया', 'खालीपन', 'जीने का मन नहीं'
      ];
      // Distress markers (Stress, sadness, overwhelm, suffering, breakup, relationship pain)
      const distressKeywords = [
        'breakup', 'break up', 'dhokha', 'chhod diya', 'chhod ke', 'alag ho gaye', 'dil toot',
        'tension', 'stress', 'pressure', 'overwhelmed', 'burnout', 'dard', 'takleef', 
        'pareshan', 'chinta', 'heavy', 'crying', 'cry', 'sad', 'sadness', 'depressed', 'depression',
        'dukh', 'dukhi', 'lonely', 'loneliness', 'broken', 'helpless', 'exhausted', "can't take it",
        'cant take it', 'aar parchi na', 'kosto', 'mon kharap', 'suffering', 'hurting', 'pain',
        'unhappy', 'miserable', 'grief', 'tabiyat kharab', 'bura lag raha', 'udas', 'pareshani',
        // Devanagari keywords
        'ब्रेकअप', 'ब्रेक अप', 'धोखा', 'छोड़ दिया', 'दिल टूट गया', 'दर्द', 'तकलीफ', 'परेशान',
        'चिंता', 'रोना', 'रो रहा', 'रो रही', 'दुख', 'दुखी', 'अकेलापन', 'टूट गया', 'बीमार', 'बुरा लग रहा', 'उदास'
      ];
      // Fear & Anxiety markers (panic, nervous, threat of harm)
      const fearKeywords = [
        'fear', 'scared', 'darr', 'dar lag raha', 'panic', 'panicking', 'anxious', 'anxiety',
        'nervous', 'frightened', 'dread', 'ghabrahat', 'bhoe', 'chinta', 'afraid', 'terrified',
        'freaking out', 'trembling', 'shaking', 'nightmare', 'danger', 'khatra',
        'डर', 'घबराहट', 'खतरा', 'डर लग रहा'
      ];
      // Anger, Hostility & Bad/Abusive Language markers
      const angerWords = [
        'angry', 'gussa', 'hate', 'furious', 'annoyed', 'frustrated', 'irritated', 'ridiculous',
        'bakwas', 'shut up', 'idiot', 'stupid', 'bastard', 'fuck', 'shit', 'bitch', 'asshole',
        'harami', 'kamina', 'kutta', 'chutiya', 'saala', 'sala', 'madarchod', 'behenchod', 'gaali',
        'pagal', 'nonsense', 'worthless crap', 'rubbish', 'hell', 'gand mar', 'mar to aap',
        'गांड', 'गुस्सा', 'बकवास', 'पागल', 'कुत्ता', 'हरामी', 'कमीना', 'चूतिया', 'साला', 'मादरचोद', 'बहनचोद', 'गाली'
      ];
      // Joy & Positivity markers
      const joyKeywords = [
        'happy', 'khush', 'great', 'awesome', 'excited', 'joy', 'wonderful', 'badiya', 
        'achha', 'achha lag raha', 'theek ho gaya', 'sub theek', 'all good', 'much better',
        'mazedar', 'proud', 'love', 'anondo', 'shandar', 'relaxed', 'grateful', 'peaceful',
        'खुश', 'अच्छा', 'बढ़िया', 'मजेदार', 'शानदार', 'सब ठीक', 'बेहतर'
      ];

      // Scan current turn
      let currentDespair = 0;
      let currentDistress = 0;
      let currentFear = 0;
      let currentAnger = 0;
      let currentJoy = 0;

      despairKeywords.forEach(w => { if (lower.includes(w)) currentDespair++; });
      distressKeywords.forEach(w => { if (lower.includes(w)) currentDistress++; });
      fearKeywords.forEach(w => { if (lower.includes(w)) currentFear++; });
      angerWords.forEach(w => { if (lower.includes(w)) currentAnger++; });
      joyKeywords.forEach(w => { if (lower.includes(w)) currentJoy++; });

      // Scan cumulative context across previous and current turns
      let contextDespair = 0;
      let contextDistress = 0;
      let contextFear = 0;
      let contextAnger = 0;
      let contextJoy = 0;

      despairKeywords.forEach(w => { if (fullContextLower.includes(w)) contextDespair++; });
      distressKeywords.forEach(w => { if (fullContextLower.includes(w)) contextDistress++; });
      fearKeywords.forEach(w => { if (fullContextLower.includes(w)) contextFear++; });
      angerWords.forEach(w => { if (fullContextLower.includes(w)) contextAnger++; });
      joyKeywords.forEach(w => { if (fullContextLower.includes(w)) contextJoy++; });

      // 3. Page 2 Critical Clinical Safety Triggers (NHAA Triage Protocol)
      // Critical Clinical Safety Triggers (NHAA Triage Protocol)
      // Suicide & Suicidal Ideation: Multilingual coverage (English, Hindi/Hinglish, Bengali, Devanagari)
      const suicidePhrases = [
        'suicid', 'kill myself', 'killing myself', 'want to die', 'wanna die', 'end my life',
        'ending my life', 'take my life', 'better off dead', 'no reason to live', 'hang myself',
        'hanging myself', 'slit my wrist', 'cut my wrist', 'overdose', 'jump off', 'end it all',
        'wish i was dead', 'wished i was dead', "don't want to live", 'dont want to live',
        'tired of living', 'i will die', 'ready to die', 'die alone',
        // Hindi / Hinglish
        'mar jana', 'marne ka man', 'marna chahta', 'marna chahti', 'marna hai', 'mar jau',
        'mar jaunga', 'mar jaungi', 'jeena nahi chahta', 'jeena nahi chahti', 'jeena nahi hai',
        'jaan de dunga', 'jaan de dungi', 'aatmhatya', 'atmahatya', 'khudkushi', 'khud kushi',
        'apna jeevan samapt', 'zindagi khatam', 'chhat se kood', 'zeher kha', 'zehar kha',
        'khud ko khatam', 'susaid', 'suiside',
        // Devanagari Hindi Script
        'सुसाइड', 'आत्महत्या', 'खुदकुशी', 'मर जाना', 'मरने का मन', 'मरना चाहता', 'मरना चाहती',
        'मरना है', 'मर जाऊं', 'मर जाऊंगा', 'मर जाऊंगी', 'जीना नहीं चाहता', 'जीना नहीं चाहती',
        'जीना नहीं है', 'जान दे दूंगा', 'जान दे दूंगी', 'जिंदगी खत्म', 'जहर खा', 'फांसी लगा',
        // Bengali
        'morte chai', 'more jabo', 'aar bachte chai na', 'aar baachte chai na', 'jeebon sesh',
        'jeevan sesh kore debo', 'aattohotta', 'attohotta', 'morar ichha', 'মরতে চাই', 'মরে যাব', 'আত্মহত্যা'
      ];

      // Self-Harm triggers: cutting, burning, poisoning, hitting self, injuring self (English, Hindi, Hinglish, Bengali)
      const selfHarmPhrases = [
        'cut myself', 'cutting myself', 'hurt myself', 'hurting myself', 'harm myself', 'harming myself',
        'burn myself', 'burning myself', 'bleeding myself', 'injure myself', 'injuring myself', 'punish myself',
        'scratch myself', 'hit myself', 'pain myself', 'inflict pain', 'bleed myself', 'blade on my skin',
        'slit', 'wrist cut', 'cut my arm', 'cut my wrist', 'cut my leg', 'blade se', 'chaku se kaat',
        // Hindi / Hinglish
        'khud ko chot', 'apne aap ko chot', 'apne ko chot', 'khud ko nuksan', 'apne aap ko nuksan',
        'khud ko takleef', 'khud ko dard', 'apne hath kaat', 'haath kaat', 'haath kat', 'nus kaat',
        'nas kaat', 'chaku se hath', 'blade marna', 'blade se kaat', 'khud ko jalana', 'apne ko jalaya',
        'khud ko marunga', 'apne aap ko marunga', 'khud ko zakhmi',
        // Devanagari Hindi Script
        'खुद को चोट', 'अपने आप को चोट', 'हाथ काट', 'नस काट', 'नस काटना', 'ब्लेड', 'खुद को नुकसान',
        'खुद को दर्द', 'खुद को तकलीफ', 'चाकू से काट', 'खुद को जलाना', 'अपने हाथ पर कट', 'जख्मी करना',
        // Bengali
        'nije ke aghat', 'nije kosto dewa', 'haat kata', 'rokto ber kora', 'nijeke kosto',
        'হাত কাটা', 'নিজেকে আঘাত', 'রক্ত বের করা', 'নিজেকে কষ্ট'
      ];

      // Threat / Violence / Intimidation triggers (English, Hindi, Hinglish, Bengali)
      const threatPhrases = [
        'kill you', 'destroy you', 'harm you', 'shoot you', 'hurt you', 'beat you', 'stab you',
        'outside my house', 'outside your house', 'attacking me', 'breaking into', 'chaku', 'knife',
        'bandook', 'gun', 'police bula', 'threat', 'threaten', 'threatened', 'threatening',
        'intimidation', 'intimidate', 'intimidated', 'intimidating', 'blackmail', 'blackmailing',
        'blackmailed', 'stalking', 'stalk', 'stalker', 'harass', 'harassment', 'harassing',
        'abuse', 'abusing', 'physical abuse', 'assault', 'assaulting', 'weapon', 'danger to my life',
        'somebody is following', 'someone is following', 'following me', 'chasing me', 'force me',
        // Hindi / Hinglish
        'mar dunga', 'maar dunga', 'maar dalunga', 'jaan se maar', 'goli maar', 'dhamki',
        'dhamki de raha', 'dhamki di', 'darana', 'dara raha hai', 'dekh lunga', 'barbaad kar dunga',
        'barbad kar dunga', 'pit dunga', 'maar peet', 'chaku dikha raha', 'piche pada hai',
        'picha kar raha hai', 'blackmail kar raha', 'badla lunga', 'teri jaan le lunga',
        // Devanagari Hindi Script
        'मार दूंगा', 'मार डालूंगा', 'जान से मार', 'गोली मार', 'धमकी', 'धमकी दे रहा', 'डरा रहा है',
        'देख लूँगा', 'बर्बाद कर दूंगा', 'चाकू', 'पिस्तौल', 'बंदूक', 'ब्लैकमेल', 'पीछा कर रहा',
        // Bengali
        'toke mere phelbo', 'mere phelbo', 'bhoy dekhacche', 'dhamki dicche', 'khun kore debo',
        'boma', 'marpeet', 'অ্যাসিড', 'খুন করে দেব', 'ভয় দেখাচ্ছে', 'মারব'
      ];

      // Safety Recovery & Reassurance triggers (English, Hindi/Hinglish, Bengali, Devanagari)
      const safetyRecoveryPhrases = [
        'im safe', "i'm safe", 'i am safe', 'feeling better', 'feel better', 'feeling good',
        'feel good', 'much better', 'all good', 'im ok', "i'm ok", 'i am ok', 'im okay', "i'm okay",
        'i am okay', 'calm now', 'better now', 'out of danger', 'safe now', 'not suicidal',
        'dont worry', "don't worry", 'no problem', 'i feel relaxed',
        // Hindi / Hinglish
        'achha feel', 'achha feel kar raha', 'achha feel ho raha', 'theek hu', 'mai theek hu',
        'ab theek hu', 'sab theek hai', 'sab theek', 'theek lag raha', 'bach gaya', 'sukun mila',
        'sukoon mila', 'tension nahi hai', 'dar nahi lag raha', 'shant hu', 'chinta mat karo',
        'koi baat nahi', 'theek thaak hu',
        // Devanagari Hindi Script
        'अच्छा फील', 'अच्छा महसूस', 'मैं ठीक हूँ', 'मैं ठीक हू', 'अब ठीक हूँ', 'सब ठीक है', 'सब ठीक',
        'सुरक्षित हूँ', 'सकून मिला', 'सुकून मिला', 'शांत हूँ', 'चिंता मत करो', 'चिंता मत कीजिए',
        'बेहतर महसूस', 'डर नहीं लग रहा', 'अच्छा लग रहा',
        // Bengali
        'bhalo achi', 'ami safe', 'ar kosto nei', 'thik achi', 'shanto achi', 'bhalo lagche'
      ];

      const isSafetyConfirmed = safetyRecoveryPhrases.some(p => lower.includes(p));

      // Trigger detection on current utterance or recent context
      const isSuicideTriggered = suicidePhrases.some(p => lower.includes(p)) || 
        (!isSafetyConfirmed && suicidePhrases.some(p => fullContextLower.includes(p)));
      const isSelfHarmTriggered = selfHarmPhrases.some(p => lower.includes(p)) || 
        (!isSafetyConfirmed && selfHarmPhrases.some(p => fullContextLower.includes(p)));
      const isThreatTriggered = threatPhrases.some(p => lower.includes(p)) || 
        (!isSafetyConfirmed && threatPhrases.some(p => fullContextLower.includes(p)));

      if (isSafetyConfirmed) {
        // Explicit reassurance & safety recovery: safely de-escalate crisis flags
        this.sessionDetectedSafetyFlags.suicide = false;
        this.sessionDetectedSafetyFlags.selfHarm = false;
        this.sessionDetectedSafetyFlags.threat = false;
        this.sessionDetectedSafetyFlags.severeDistress = false;
        this.sessionDetectedSafetyFlags.deescalated = true;
        this.sessionDetectedSafetyFlags.safetyConfirmed = true;
      } else {
        if (isSuicideTriggered) {
          this.sessionDetectedSafetyFlags.suicide = true;
          this.sessionDetectedSafetyFlags.deescalated = false;
        }
        if (isSelfHarmTriggered) {
          this.sessionDetectedSafetyFlags.selfHarm = true;
          this.sessionDetectedSafetyFlags.deescalated = false;
        }
        if (isThreatTriggered) {
          this.sessionDetectedSafetyFlags.threat = true;
          this.sessionDetectedSafetyFlags.deescalated = false;
        }
      }

      // 4. Multi-turn Context-Aware Semantic Emotional & Risk Calculation
      let targetDistress = 12;
      let targetFear = 6;
      let targetMood = 'Calm';
      let targetMoodColor = '#10b981';

      if (isSafetyConfirmed) {
        // User confirmed safety: set calm/grounded recovery values
        targetDistress = 14;
        targetFear = 6;
        targetMood = 'Calm';
        targetMoodColor = '#10b981';
      } else if (this.sessionDetectedSafetyFlags.suicide || this.sessionDetectedSafetyFlags.selfHarm) {
        targetDistress = 96;
        targetFear = 85;
        targetMood = 'Distress';
        targetMoodColor = '#f47aa9';
      } else if (this.sessionDetectedSafetyFlags.threat) {
        targetDistress = 85;
        targetFear = 90;
        targetMood = 'Fear';
        targetMoodColor = '#fb923c';
      } else if (currentDespair > 0 || (!this.sessionDetectedSafetyFlags.deescalated && contextDespair > 0)) {
        const dMatches = Math.max(currentDespair, this.sessionDetectedSafetyFlags.deescalated ? 0 : contextDespair);
        targetDistress = Math.min(92, 72 + dMatches * 8);
        targetFear = Math.min(80, 48 + Math.max(currentFear, this.sessionDetectedSafetyFlags.deescalated ? 0 : contextFear) * 10);
        targetMood = 'Distress';
        targetMoodColor = '#f47aa9';
      } else if (currentDistress > 1 || (!this.sessionDetectedSafetyFlags.deescalated && (contextDistress > 1 || fullContextLower.includes('breakup') || fullContextLower.includes('ब्रेकअप') || fullContextLower.includes('depressed')))) {
        const count = Math.max(currentDistress, this.sessionDetectedSafetyFlags.deescalated ? 0 : contextDistress);
        targetDistress = Math.min(88, 62 + count * 8);
        targetFear = Math.min(75, 36 + Math.max(currentFear, this.sessionDetectedSafetyFlags.deescalated ? 0 : contextFear) * 10);
        targetMood = 'Distress';
        targetMoodColor = '#f47aa9';
      } else if (currentAnger > 0 || (!this.sessionDetectedSafetyFlags.deescalated && contextAnger > 0)) {
        targetDistress = Math.min(85, 60 + Math.max(currentAnger, this.sessionDetectedSafetyFlags.deescalated ? 0 : contextAnger) * 8);
        targetFear = 28;
        targetMood = 'Anger';
        targetMoodColor = '#f87171';
      } else if (currentFear > 0 || (!this.sessionDetectedSafetyFlags.deescalated && contextFear > 0)) {
        targetDistress = 48 + Math.max(currentDistress, this.sessionDetectedSafetyFlags.deescalated ? 0 : contextDistress) * 8;
        targetFear = Math.min(85, 55 + Math.max(currentFear, this.sessionDetectedSafetyFlags.deescalated ? 0 : contextFear) * 12);
        targetMood = 'Fear';
        targetMoodColor = '#fb923c';
      } else if (currentDistress > 0 || (!this.sessionDetectedSafetyFlags.deescalated && contextDistress > 0)) {
        targetDistress = Math.min(72, 48 + Math.max(currentDistress, this.sessionDetectedSafetyFlags.deescalated ? 0 : contextDistress) * 8);
        targetFear = 20 + Math.max(currentFear, this.sessionDetectedSafetyFlags.deescalated ? 0 : contextFear) * 6;
        targetMood = 'Distress';
        targetMoodColor = '#fbbf24';
      } else if (currentJoy > 0 && contextDistress === 0 && contextDespair === 0) {
        targetDistress = 6;
        targetFear = 4;
        targetMood = 'Calm';
        targetMoodColor = '#34d399';
      } else {
        targetDistress = 15;
        targetFear = 8;
        targetMood = 'Calm';
        targetMoodColor = '#10b981';
      }

      // 5. Psychological Retention & Cumulative Multi-Turn Context Floor
      if (isSafetyConfirmed) {
        // Fast de-escalation towards target recovery values
        this.currentDistressPct = Math.round(this.currentDistressPct * 0.20 + targetDistress * 0.80);
        this.currentFearPct = Math.round(this.currentFearPct * 0.20 + targetFear * 0.80);
        this.smoothedSvi = Math.min(this.smoothedSvi, 24);
      } else if (this.sessionDetectedSafetyFlags.suicide || this.sessionDetectedSafetyFlags.selfHarm) {
        this.currentDistressPct = Math.max(this.currentDistressPct, targetDistress);
        this.currentFearPct = Math.max(this.currentFearPct, targetFear);
      } else if (!this.sessionDetectedSafetyFlags.deescalated && (contextDespair > 0 || contextDistress > 0 || contextAnger > 0)) {
        let contextFloor = 48;
        if (contextDespair > 0) contextFloor = 65;
        else if (contextDistress > 1 || fullContextLower.includes('breakup') || fullContextLower.includes('ब्रेकअप')) contextFloor = 56;
        else if (contextAnger > 0) contextFloor = 52;

        const boundedTarget = Math.max(contextFloor, targetDistress);
        this.currentDistressPct = Math.round(this.currentDistressPct * 0.40 + boundedTarget * 0.60);
        this.currentFearPct = Math.round(this.currentFearPct * 0.40 + targetFear * 0.60);
        
        if (this.currentDistressPct >= 42) {
          if (contextAnger > 0 && currentAnger > 0) {
            targetMood = 'Anger';
            targetMoodColor = '#f87171';
          } else {
            targetMood = 'Distress';
            targetMoodColor = '#f47aa9';
          }
        }
      } else {
        this.currentDistressPct = Math.round(this.currentDistressPct * 0.35 + targetDistress * 0.65);
        this.currentFearPct = Math.round(this.currentFearPct * 0.35 + targetFear * 0.65);
      }
      this.currentEmotion = targetMood;
      this.currentEmotionColor = targetMoodColor;

      // Track words spoken for acoustic rate estimation
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      this.audioFeatureTracker.wordsSpoken += wordCount;

      this.recalculateLiveTelemetry();
    }

    // =========================================================
    // MULTI-SIGNAL SVI CALCULATION & TEMPORAL SMOOTHING ENGINE
    // =========================================================
    recalculateLiveTelemetry() {
      const tracker = this.audioFeatureTracker;
      const acousticDistress = tracker.smoothedAcousticDistress || 12;

      // Multi-signal weighted formula:
      // Semantic Distress: 45%
      // Semantic Fear & Safety: 30%
      // Observable Acoustic Dynamics: 25%
      let rawSVI = (this.currentDistressPct * 0.45) + 
                   (this.currentFearPct * 0.30) + 
                   (acousticDistress * 0.25);

      // Multi-turn context floor for SVI:
      const hasCriticalTrigger = this.sessionDetectedSafetyFlags.suicide || this.sessionDetectedSafetyFlags.selfHarm;
      if (this.sessionDetectedSafetyFlags.suicide) {
        rawSVI = Math.max(rawSVI, 95);
      } else if (this.sessionDetectedSafetyFlags.selfHarm) {
        rawSVI = Math.max(rawSVI, 90);
      } else if (this.sessionDetectedSafetyFlags.threat) {
        rawSVI = Math.max(rawSVI, 85);
      } else if (!this.sessionDetectedSafetyFlags.deescalated && this.currentDistressPct >= 55) {
        rawSVI = Math.max(rawSVI, 46); // Minimum Moderate band floor
      } else if (!this.sessionDetectedSafetyFlags.deescalated && this.currentDistressPct >= 42) {
        rawSVI = Math.max(rawSVI, 38); // Minimum Elevated Low floor
      } else if (this.currentEmotion === 'Anger') {
        rawSVI = Math.max(rawSVI, 52); // Elevate bad/aggressive language to Moderate band
      }

      // Clamp strictly within 1 - 100
      rawSVI = Math.max(1, Math.min(100, Math.round(rawSVI)));

      // Temporal Exponential Moving Average (EMA) Smoothing
      this.lastSvi = this.currentSvi;
      if (this.sessionDetectedSafetyFlags.deescalated && rawSVI < this.smoothedSvi) {
        // Fast responsive downward tracking when user affirms safety
        this.smoothedSvi = (this.smoothedSvi * 0.25) + (rawSVI * 0.75);
      } else if (hasCriticalTrigger || rawSVI >= 85) {
        this.smoothedSvi = Math.max(this.smoothedSvi, rawSVI);
      } else if (rawSVI > this.smoothedSvi + 15) {
        this.smoothedSvi = (this.smoothedSvi * 0.40) + (rawSVI * 0.60);
      } else if (rawSVI < this.smoothedSvi) {
        this.smoothedSvi = (this.smoothedSvi * 0.90) + (rawSVI * 0.10);
      } else {
        this.smoothedSvi = (this.smoothedSvi * 0.78) + (rawSVI * 0.22);
      }
      this.currentSvi = Math.max(1, Math.min(100, Math.round(this.smoothedSvi)));

      // Add to rolling history for trend calculation (keeps last 15 samples)
      const now = performance.now();
      this.sviHistory.push({ svi: this.currentSvi, time: now });
      if (this.sviHistory.length > 15) this.sviHistory.shift();

      // Determine Trend (Increasing, Decreasing, Stable) from rolling 3-second window
      const threeSecAgo = now - 3200;
      const pastSamples = this.sviHistory.filter(s => s.time >= threeSecAgo);
      let trendState = 'Stable';
      let trendArrow = '→';

      if (pastSamples.length >= 2) {
        const oldest = pastSamples[0].svi;
        const delta = this.currentSvi - oldest;
        if (delta >= 3) {
          trendState = 'Increasing';
          trendArrow = '↑';
        } else if (delta <= -3) {
          trendState = 'Decreasing';
          trendArrow = '↓';
        } else {
          trendState = 'Stable';
          trendArrow = '→';
        }
      }

      // Check for Severe Distress
      if (this.currentSvi >= 61 || this.currentDistressPct >= 65) {
        this.sessionDetectedSafetyFlags.severeDistress = true;
      }

      // Render updated telemetry to the UI
      this.renderTelemetryUI(trendState, trendArrow);
    }

    // =========================================================
    // RENDER TELEMETRY UI (Page 1 & Page 2)
    // =========================================================
    renderTelemetryUI(trendState, trendArrow) {
      // 1. SVI Score Number Display (1 - 100)
      if (this.vdSviNum) {
        this.vdSviNum.textContent = this.currentSvi;
      }

      // 2. SVI Severity Band with Hysteresis (1-20 Very Low, 21-40 Low, 41-60 Moderate, 61-80 High, 81-100 Critical)
      let severityClass = 'low';
      let severityLabel = 'LOW';
      let sviColor = '#10b981';

      if (this.currentSvi <= 20) {
        severityClass = 'very-low';
        severityLabel = 'VERY LOW';
        sviColor = '#10b981';
      } else if (this.currentSvi <= 40) {
        severityClass = 'low';
        severityLabel = 'LOW';
        sviColor = '#10b981';
      } else if (this.currentSvi <= 60) {
        severityClass = 'moderate';
        severityLabel = 'MODERATE';
        sviColor = '#fbbf24';
      } else if (this.currentSvi <= 80) {
        severityClass = 'high';
        severityLabel = 'HIGH';
        sviColor = '#f87171';
      } else {
        severityClass = 'critical';
        severityLabel = 'CRITICAL';
        sviColor = '#fb7185';
      }

      if (this.vdSeverityBadge && this.vdBadgeText) {
        this.vdSeverityBadge.className = `vd-severity-pill ${severityClass}`;
        this.vdBadgeText.textContent = severityLabel;
      }
      if (this.vdSviNum) {
        this.vdSviNum.style.color = sviColor;
      }

      // Synchronize Data Button Dynamic Light & Live Analysis Status Dot
      if (this.vdToggleDot) {
        this.vdToggleDot.style.background = sviColor;
        this.vdToggleDot.style.boxShadow = `0 0 10px ${sviColor}, 0 0 4px ${sviColor}`;
      }
      if (this.vdLiveDot) {
        this.vdLiveDot.style.background = sviColor;
        this.vdLiveDot.style.boxShadow = `0 0 10px ${sviColor}`;
      }

      // 3. Trend Indicator Tag (Increasing, Decreasing, Stable)
      if (this.vdTrendArrow && this.vdTrendText) {
        const parentTag = this.vdTrendArrow.parentElement;
        if (parentTag) {
          parentTag.className = 'vd-trend-tag';
          if (trendState === 'Increasing') parentTag.classList.add('increasing');
          else if (trendState === 'Stable') parentTag.classList.add('stable');
        }
        this.vdTrendArrow.textContent = trendArrow;
        this.vdTrendText.textContent = trendState;
      }

      // 4. Mood, Distress %, Fear %, Language
      if (this.vdMoodText) this.vdMoodText.textContent = this.currentEmotion;
      if (this.vdMoodDot && this.currentEmotionColor) this.vdMoodDot.style.background = this.currentEmotionColor;
      if (this.vdDistressVal) this.vdDistressVal.textContent = `${this.currentDistressPct}%`;
      if (this.vdFearVal) this.vdFearVal.textContent = `${this.currentFearPct}%`;
      if (this.vdLangVal) this.vdLangVal.textContent = this.detectedLanguageName;

      // 5. Page 2: Key Indicators (NHAA Clinical Triage Protocol)
      const flags = this.sessionDetectedSafetyFlags;
      if (this.vdIndSuicide) {
        if (flags.suicide) {
          this.vdIndSuicide.className = 'vd-indicator-badge danger';
          this.vdIndSuicide.textContent = 'DETECTED';
        } else if (flags.deescalated && flags.safetyConfirmed) {
          this.vdIndSuicide.className = 'vd-indicator-badge deescalated';
          this.vdIndSuicide.textContent = 'De-escalated / Safe';
        } else {
          this.vdIndSuicide.className = 'vd-indicator-badge safe';
          this.vdIndSuicide.textContent = 'Not Detected';
        }
      }
      if (this.vdIndSelfHarm) {
        if (flags.selfHarm) {
          this.vdIndSelfHarm.className = 'vd-indicator-badge danger';
          this.vdIndSelfHarm.textContent = 'DETECTED';
        } else if (flags.deescalated && flags.safetyConfirmed) {
          this.vdIndSelfHarm.className = 'vd-indicator-badge deescalated';
          this.vdIndSelfHarm.textContent = 'De-escalated / Safe';
        } else {
          this.vdIndSelfHarm.className = 'vd-indicator-badge safe';
          this.vdIndSelfHarm.textContent = 'Not Detected';
        }
      }
      if (this.vdIndThreat) {
        if (flags.threat) {
          this.vdIndThreat.className = 'vd-indicator-badge danger';
          this.vdIndThreat.textContent = 'DETECTED';
        } else if (flags.deescalated && flags.safetyConfirmed) {
          this.vdIndThreat.className = 'vd-indicator-badge deescalated';
          this.vdIndThreat.textContent = 'De-escalated / Safe';
        } else {
          this.vdIndThreat.className = 'vd-indicator-badge safe';
          this.vdIndThreat.textContent = 'Not Detected';
        }
      }
      if (this.vdIndDistress) {
        const isSevere = flags.severeDistress || this.currentSvi >= 61;
        if (isSevere) {
          this.vdIndDistress.className = 'vd-indicator-badge danger';
          this.vdIndDistress.textContent = 'ELEVATED';
        } else if (flags.deescalated && flags.safetyConfirmed) {
          this.vdIndDistress.className = 'vd-indicator-badge deescalated';
          this.vdIndDistress.textContent = 'Stabilized / Safe';
        } else {
          this.vdIndDistress.className = 'vd-indicator-badge safe';
          this.vdIndDistress.textContent = 'Not Detected';
        }
      }

      // 6. Page 2: Recommended Support Section
      if (this.vdSupportList) {
        if (flags.suicide || flags.selfHarm) {
          this.vdSupportList.innerHTML = `
            <div class="vd-support-bullet" style="color:#f87171;font-weight:700;">Immediate crisis safety protocol recommended</div>
            <div class="vd-support-bullet">Connect with certified 24x7 emergency helpline</div>
            <div class="vd-support-bullet">Provide grounding and safety reassurance</div>
          `;
        } else if (flags.threat) {
          this.vdSupportList.innerHTML = `
            <div class="vd-support-bullet" style="color:#fb923c;font-weight:700;">Active safety alert: ensure caller is in a secure location</div>
            <div class="vd-support-bullet">Provide emergency contact information and crisis escalation</div>
            <div class="vd-support-bullet">Maintain supportive, reassuring communication</div>
          `;
        } else if (this.currentSvi >= 61 || flags.severeDistress) {
          this.vdSupportList.innerHTML = `
            <div class="vd-support-bullet">Active compassionate de-escalation</div>
            <div class="vd-support-bullet">Encourage deep calming breaths & grounding</div>
            <div class="vd-support-bullet">Provide emotional validation without rush</div>
          `;
        } else if (this.currentSvi >= 41) {
          this.vdSupportList.innerHTML = `
            <div class="vd-support-bullet">Empathetic listening and validation</div>
            <div class="vd-support-bullet">Explore manageable steps to address concerns</div>
            <div class="vd-support-bullet">Provide calming conversational presence</div>
          `;
        } else {
          this.vdSupportList.innerHTML = `
            <div class="vd-support-bullet">Continue conversation</div>
            <div class="vd-support-bullet">Provide emotional support and guidance</div>
          `;
        }
      }
    }
  }

  // Initialize on document ready
  document.addEventListener('DOMContentLoaded', () => {
    window.liveVoiceInstance = new LiveVoiceManager();
  });
})();
