// ─── RSVP Reader — Content Script ───
// Receives START_RSVP message, builds overlay DOM, manages controls and lifecycle.

(function () {
    // ── State ──
    // Use window-level state so re-injection doesn't lose track
    if (!window.__rsvpState) {
        window.__rsvpState = {
            activeController: null,
            previousFocus: null,
            previousOverflow: ''
        };
    }

    const state = window.__rsvpState;

    // Prevent double-injection: if overlay already exists, remove it first
    const existing = document.getElementById('rsvp-overlay');
    if (existing) {
        if (state.activeController) {
            state.activeController.stop();
            state.activeController = null;
        }
        existing.remove();
    }

    // ── Build Overlay DOM ──
    function buildOverlayDom() {
        const overlay = document.createElement('div');
        overlay.id = 'rsvp-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'RSVP speed reader');
        overlay.tabIndex = -1;

        overlay.innerHTML = `
      <div id="rsvp-center-line"></div>

      <!-- Hamburger Menu Button -->
      <button id="rsvp-menu-btn" aria-label="Settings" title="Settings">
        <span></span><span></span><span></span>
      </button>

      <button id="rsvp-close" aria-label="Close RSVP" title="Close (Esc)">✕</button>

      <div id="rsvp-wpm"></div>

      <!-- Settings Panel -->
      <div id="rsvp-settings-backdrop" style="display: none;"></div>
      <div id="rsvp-settings-panel" style="display: none;">
        <div class="rsvp-settings-header">
          <span>Settings</span>
          <button id="rsvp-settings-close" aria-label="Close settings">✕</button>
        </div>

        <div class="rsvp-setting-row">
          <label title="Words Per Minute — controls the overall reading speed. Higher = faster reading.">WPM <span id="rsvp-s-wpm-val" class="rsvp-setting-val"></span></label>
          <input type="range" id="rsvp-s-wpm" min="100" max="1000" step="25">
        </div>
        <div class="rsvp-setting-row">
          <label title="Length Weight — how strongly a word's character count affects its display time. Higher values give longer words more time.">Length Weight <span id="rsvp-s-len-val" class="rsvp-setting-val"></span></label>
          <input type="range" id="rsvp-s-len" min="0" max="1" step="0.05">
        </div>
        <div class="rsvp-setting-row">
          <label title="Punctuation Pause — multiplier for extra pause on words ending in . , ; : ! ? Gives your brain time to process sentence boundaries.">Punctuation Pause <span id="rsvp-s-punct-val" class="rsvp-setting-val"></span></label>
          <input type="range" id="rsvp-s-punct" min="1" max="3" step="0.1">
        </div>
        <div class="rsvp-setting-row">
          <label title="Anchor Position — where the red focus letter sits within each word (as a percentage from left). ~35% is optimal for most readers.">Anchor Position <span id="rsvp-s-anchor-val" class="rsvp-setting-val"></span></label>
          <input type="range" id="rsvp-s-anchor" min="0.1" max="0.6" step="0.05">
        </div>
        <div class="rsvp-setting-row rsvp-toggle-row">
          <label title="Anchor Underline — adds an underline beneath the red anchor letter as an accessibility aid for colorblind users.">Anchor Underline</label>
          <label class="rsvp-toggle">
            <input type="checkbox" id="rsvp-s-underline">
            <span class="rsvp-toggle-track"></span>
          </label>
        </div>

        <button id="rsvp-reset-btn">Reset to Defaults</button>

        <div id="rsvp-theme-toggle-area">
          <button id="rsvp-theme-btn" aria-label="Toggle theme" title="Toggle light/dark theme">
            <svg id="rsvp-theme-moon" viewBox="0 0 24 24" width="20" height="20"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" fill="currentColor"/></svg>
            <svg id="rsvp-theme-sun" viewBox="0 0 24 24" width="20" height="20" style="display:none;"><circle cx="12" cy="12" r="5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></g></svg>
          </button>
          <button id="rsvp-theme-mode-btn" aria-label="Theme mode" title="Theme mode">
            <svg viewBox="0 0 12 8" width="10" height="8"><path d="M1 7 L6 2 L11 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div id="rsvp-theme-mode-menu" style="display: none;">
            <button class="rsvp-theme-mode-option" data-mode="system"><span class="rsvp-mode-check">✓</span> System Default</button>
            <button class="rsvp-theme-mode-option" data-mode="custom"><span class="rsvp-mode-check"></span> Custom</button>
          </div>
        </div>
      </div>

      <!-- Start Screen -->
      <div id="rsvp-start-screen">
        <div id="rsvp-start-title">RSVP Reader</div>
        <div id="rsvp-start-info"></div>
        <button id="rsvp-start-btn">▶ Start Reading</button>
        <div id="rsvp-start-hint">or press <kbd>Space</kbd></div>
      </div>

      <!-- Reading View (hidden initially) -->
      <div id="rsvp-word-wrapper" style="display: none;">
        <div id="rsvp-word"></div>
      </div>

      <!-- Context View (shown when paused) -->
      <div id="rsvp-context-view" style="display: none;">
        <div id="rsvp-context-text"></div>
      </div>

      <div id="rsvp-pause-indicator">⏸ PAUSED</div>

      <div id="rsvp-controls-hint" style="display: none;">
        <span>Space: pause</span>
        <span>←→: skip</span>
        <span>Esc: close</span>
      </div>

      <div id="rsvp-progress">
        <div id="rsvp-progress-fill"></div>
      </div>
    `;

        return overlay;
    }

    // ── Start Overlay ──
    function startRsvpOverlay(text, settings) {
        // Clean up any existing session
        if (state.activeController) {
            state.activeController.stop();
            state.activeController = null;
        }

        const existingOverlay = document.getElementById('rsvp-overlay');
        if (existingOverlay) existingOverlay.remove();

        // Check for very long selections
        if (text.length > 10000) {
            const wordCount = text.split(/\s+/).length;
            const estTime = Math.round((wordCount / (settings.WPM || 400)) * 60);
            if (!confirm(`Selection is ${wordCount} words (~${estTime}s at ${settings.WPM || 400} WPM). Continue?`)) {
                return;
            }
        }

        // Save page state
        state.previousFocus = document.activeElement;
        state.previousOverflow = document.body.style.overflow;

        // Lock scroll
        document.body.style.overflow = 'hidden';

        // Build and insert overlay
        const overlay = buildOverlayDom();
        document.body.appendChild(overlay);

        // Focus overlay for keyboard events
        overlay.focus();

        // Create controller (but don't start yet)
        state.activeController = new RsvpController(text, settings, overlay);

        // ── Determine initial theme ──
        const themeMode = settings.THEME_MODE || 'system'; // 'system' or 'custom'
        const customTheme = settings.THEME_CUSTOM || 'dark'; // 'dark' or 'light'
        let initialDark;
        if (themeMode === 'system') {
            initialDark = !window.matchMedia('(prefers-color-scheme: light)').matches;
        } else {
            initialDark = customTheme === 'dark';
        }
        // Apply initial theme immediately (no animation)
        if (!initialDark) {
            overlay.classList.add('rsvp-light');
        }

        // Show word count & estimated time on start screen
        const startInfo = overlay.querySelector('#rsvp-start-info');
        const wordCount = state.activeController.words.length;
        const estSeconds = Math.round((wordCount / (settings.WPM || 400)) * 60);
        if (startInfo) {
            startInfo.textContent = `${wordCount} words · ~${estSeconds}s at ${settings.WPM || 400} WPM`;
        }

        // ── Settings Panel Logic ──
        const menuBtn = overlay.querySelector('#rsvp-menu-btn');
        const settingsPanel = overlay.querySelector('#rsvp-settings-panel');
        const settingsBackdrop = overlay.querySelector('#rsvp-settings-backdrop');
        const settingsClose = overlay.querySelector('#rsvp-settings-close');
        let settingsOpen = false;

        function openSettings() {
            settingsOpen = true;
            settingsPanel.style.display = 'flex';
            settingsBackdrop.style.display = 'block';
            if (state.activeController && !state.activeController.paused) {
                state.activeController.togglePause();
            }
        }

        function closeSettings() {
            settingsOpen = false;
            settingsPanel.style.display = 'none';
            settingsBackdrop.style.display = 'none';
        }

        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (settingsOpen) closeSettings(); else openSettings();
        });
        settingsClose.addEventListener('click', (e) => { e.stopPropagation(); closeSettings(); });
        settingsBackdrop.addEventListener('click', (e) => { e.stopPropagation(); closeSettings(); });

        // Populate settings with current values
        const sWpm = overlay.querySelector('#rsvp-s-wpm');
        const sLen = overlay.querySelector('#rsvp-s-len');
        const sPunct = overlay.querySelector('#rsvp-s-punct');
        const sAnchor = overlay.querySelector('#rsvp-s-anchor');
        const sUnderline = overlay.querySelector('#rsvp-s-underline');
        const sWpmVal = overlay.querySelector('#rsvp-s-wpm-val');
        const sLenVal = overlay.querySelector('#rsvp-s-len-val');
        const sPunctVal = overlay.querySelector('#rsvp-s-punct-val');
        const sAnchorVal = overlay.querySelector('#rsvp-s-anchor-val');

        sWpm.value = settings.WPM || 400;
        sLen.value = settings.LENGTH_STRENGTH || 0.6;
        sPunct.value = settings.PUNCTUATION_BOOST || 1.5;
        sAnchor.value = settings.ANCHOR_RATIO || 0.35;
        sUnderline.checked = settings.SHOW_ANCHOR_UNDERLINE || false;
        sWpmVal.textContent = sWpm.value;
        sLenVal.textContent = parseFloat(sLen.value).toFixed(2);
        sPunctVal.textContent = parseFloat(sPunct.value).toFixed(1) + '×';
        sAnchorVal.textContent = Math.round(parseFloat(sAnchor.value) * 100) + '%';

        // Live updates + save
        function applySettings() {
            if (!state.activeController) return;
            const s = state.activeController.settings;
            s.WPM = parseInt(sWpm.value, 10);
            s.LENGTH_STRENGTH = parseFloat(sLen.value);
            s.PUNCTUATION_BOOST = parseFloat(sPunct.value);
            s.ANCHOR_RATIO = parseFloat(sAnchor.value);
            s.SHOW_ANCHOR_UNDERLINE = sUnderline.checked;
            // Recompute delays with new settings
            state.activeController.delays = state.activeController.computeDelays(state.activeController.words);
            state.activeController.updateWpmDisplay();
            // Persist
            try { chrome.storage.sync.set({ WPM: s.WPM, LENGTH_STRENGTH: s.LENGTH_STRENGTH, PUNCTUATION_BOOST: s.PUNCTUATION_BOOST, ANCHOR_RATIO: s.ANCHOR_RATIO, SHOW_ANCHOR_UNDERLINE: s.SHOW_ANCHOR_UNDERLINE }); } catch (e) { }
        }

        sWpm.addEventListener('input', () => { sWpmVal.textContent = sWpm.value; applySettings(); });
        sLen.addEventListener('input', () => { sLenVal.textContent = parseFloat(sLen.value).toFixed(2); applySettings(); });
        sPunct.addEventListener('input', () => { sPunctVal.textContent = parseFloat(sPunct.value).toFixed(1) + '×'; applySettings(); });
        sAnchor.addEventListener('input', () => { sAnchorVal.textContent = Math.round(parseFloat(sAnchor.value) * 100) + '%'; applySettings(); });
        sUnderline.addEventListener('change', () => { applySettings(); });

        // ── Reset Button ──
        const resetBtn = overlay.querySelector('#rsvp-reset-btn');
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!confirm('Reset all settings to defaults?')) return;
            const d = { WPM: 400, LENGTH_STRENGTH: 0.6, PUNCTUATION_BOOST: 1.5, ANCHOR_RATIO: 0.35, SHOW_ANCHOR_UNDERLINE: false };
            sWpm.value = d.WPM; sWpmVal.textContent = d.WPM;
            sLen.value = d.LENGTH_STRENGTH; sLenVal.textContent = d.LENGTH_STRENGTH.toFixed(2);
            sPunct.value = d.PUNCTUATION_BOOST; sPunctVal.textContent = d.PUNCTUATION_BOOST.toFixed(1) + '\u00d7';
            sAnchor.value = d.ANCHOR_RATIO; sAnchorVal.textContent = Math.round(d.ANCHOR_RATIO * 100) + '%';
            sUnderline.checked = d.SHOW_ANCHOR_UNDERLINE;
            applySettings();
        });

        // ── Theme Toggle ──
        let isDark = initialDark;
        const themeBtn = overlay.querySelector('#rsvp-theme-btn');
        const moonIcon = overlay.querySelector('#rsvp-theme-moon');
        const sunIcon = overlay.querySelector('#rsvp-theme-sun');

        // Set initial icon state
        if (!isDark) {
            moonIcon.style.display = 'none';
            sunIcon.style.display = 'block';
        }

        // Sine-gamma transition inspired by LED PWM curve:
        // float sine = sin(t * PI) * 0.5 + 0.5; int pwm = pow(sine, 2.2) * 255;
        function animateTheme(toDark) {
            const duration = 800; // ms
            const startTime = performance.now();

            // Remove the CSS class BEFORE animating so !important rules don't fight inline styles
            if (toDark) {
                overlay.classList.remove('rsvp-light');
            }

            // Color endpoints
            const darkBg = [10, 10, 10];       // #0a0a0a
            const lightBg = [245, 245, 245];   // #f5f5f5
            const darkText = [232, 232, 232];  // #e8e8e8
            const lightText = [30, 30, 30];    // #1e1e1e
            const darkPanel = [20, 20, 34];    // #141422
            const lightPanel = [235, 235, 240]; // #ebebf0

            function lerpColor(a, b, t) {
                return a.map((v, i) => Math.round(v + (b[i] - v) * t));
            }

            function tick() {
                const elapsed = performance.now() - startTime;
                const rawT = Math.min(elapsed / duration, 1.0);

                // Sine-gamma easing: pow(sin(t * PI/2), 2.2)
                const sine = Math.sin(rawT * Math.PI / 2);
                const eased = Math.pow(sine, 2.2);

                // Interpolate: if toDark, we go from light→dark; else dark→light
                const fromBg = toDark ? lightBg : darkBg;
                const toBg = toDark ? darkBg : lightBg;
                const fromText = toDark ? lightText : darkText;
                const toText = toDark ? darkText : lightText;
                const fromPanel = toDark ? lightPanel : darkPanel;
                const toPanel = toDark ? darkPanel : lightPanel;

                const bg = lerpColor(fromBg, toBg, eased);
                const txt = lerpColor(fromText, toText, eased);
                const pnl = lerpColor(fromPanel, toPanel, eased);

                overlay.style.background = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
                const wordEl = overlay.querySelector('#rsvp-word');
                if (wordEl) wordEl.style.color = `rgb(${txt[0]},${txt[1]},${txt[2]})`;
                // Also update before/after spans
                overlay.querySelectorAll('.rsvp-before, .rsvp-after').forEach(el => {
                    el.style.color = `rgb(${txt[0]},${txt[1]},${txt[2]})`;
                });
                // Start screen text
                const startTitle = overlay.querySelector('#rsvp-start-title');
                if (startTitle) startTitle.style.color = `rgb(${txt[0]},${txt[1]},${txt[2]})`;
                // Settings panel
                const panel = overlay.querySelector('#rsvp-settings-panel');
                if (panel) panel.style.background = `rgb(${pnl[0]},${pnl[1]},${pnl[2]})`;

                if (rawT < 1.0) {
                    requestAnimationFrame(tick);
                } else {
                    // Apply final CSS class AFTER animation for ongoing style (only for light)
                    if (!toDark) {
                        overlay.classList.add('rsvp-light');
                    }
                    // Clear inline styles so CSS class takes over cleanly
                    overlay.style.background = '';
                    const w = overlay.querySelector('#rsvp-word');
                    if (w) w.style.color = '';
                    overlay.querySelectorAll('.rsvp-before, .rsvp-after').forEach(el => { el.style.color = ''; });
                    const st = overlay.querySelector('#rsvp-start-title');
                    if (st) st.style.color = '';
                    const p = overlay.querySelector('#rsvp-settings-panel');
                    if (p) p.style.background = '';
                }
            }
            requestAnimationFrame(tick);
        }

        themeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isDark = !isDark;
            if (isDark) {
                moonIcon.style.display = 'block';
                sunIcon.style.display = 'none';
            } else {
                moonIcon.style.display = 'none';
                sunIcon.style.display = 'block';
            }
            animateTheme(isDark);
            // If custom mode, persist the theme choice
            try { chrome.storage.sync.set({ THEME_CUSTOM: isDark ? 'dark' : 'light' }); } catch (e) { }
        });

        // ── Theme Mode Dropdown ──
        let currentMode = themeMode;
        const themeModeBtn = overlay.querySelector('#rsvp-theme-mode-btn');
        const themeModeMenu = overlay.querySelector('#rsvp-theme-mode-menu');
        const modeOptions = overlay.querySelectorAll('.rsvp-theme-mode-option');
        let modeMenuOpen = false;

        // Set initial checkmarks
        function updateModeChecks() {
            modeOptions.forEach(opt => {
                const check = opt.querySelector('.rsvp-mode-check');
                check.textContent = opt.dataset.mode === currentMode ? '\u2713' : '';
            });
        }
        updateModeChecks();

        themeModeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            modeMenuOpen = !modeMenuOpen;
            themeModeMenu.style.display = modeMenuOpen ? 'flex' : 'none';
        });

        modeOptions.forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                currentMode = opt.dataset.mode;
                updateModeChecks();
                modeMenuOpen = false;
                themeModeMenu.style.display = 'none';
                try { chrome.storage.sync.set({ THEME_MODE: currentMode }); } catch (e) { }
            });
        });

        // Close menu when clicking elsewhere
        overlay.addEventListener('click', () => {
            if (modeMenuOpen) {
                modeMenuOpen = false;
                themeModeMenu.style.display = 'none';
            }
        });

        // ── State: waiting for user to press Start ──
        let started = false;

        function beginReading() {
            if (started) return;
            started = true;

            // Hide start screen, show reading view
            const startScreen = overlay.querySelector('#rsvp-start-screen');
            const wordWrapper = overlay.querySelector('#rsvp-word-wrapper');
            const hint = overlay.querySelector('#rsvp-controls-hint');

            if (startScreen) startScreen.style.display = 'none';
            if (wordWrapper) wordWrapper.style.display = 'flex';
            if (hint) {
                hint.style.display = 'flex';
                // Auto-hide controls hint after 3 seconds
                setTimeout(() => { hint.style.opacity = '0'; }, 3000);
            }

            // Attach cleanup to controller
            const origCleanup = state.activeController.cleanup.bind(state.activeController);
            state.activeController.cleanup = function () {
                document.removeEventListener('keydown', onKeyDown, true);
                document.body.style.overflow = state.previousOverflow;
                if (state.previousFocus && state.previousFocus.focus) {
                    state.previousFocus.focus();
                }
                origCleanup();
                state.activeController = null;
            };

            // Start the reading loop
            state.activeController.start();
        }

        // ── Start Button Click ──
        const startBtn = overlay.querySelector('#rsvp-start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                beginReading();
            });
        }

        // ── Keyboard Controls ──
        function onKeyDown(e) {
            if (!document.getElementById('rsvp-overlay')) {
                document.removeEventListener('keydown', onKeyDown, true);
                return;
            }

            switch (e.key) {
                case 'Escape':
                    e.preventDefault();
                    e.stopPropagation();
                    closeOverlay();
                    break;
                case ' ':
                    e.preventDefault();
                    e.stopPropagation();
                    if (!started) {
                        // Space on start screen → begin reading
                        beginReading();
                    } else if (state.activeController) {
                        state.activeController.togglePause();
                        // Show or hide context view
                        if (state.activeController.paused) {
                            state.activeController.showContextView();
                        } else {
                            state.activeController.hideContextView();
                        }
                    }
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    e.stopPropagation();
                    if (started && state.activeController) {
                        // Skip 1 word when paused, 5 when playing
                        const step = state.activeController.paused ? 1 : 5;
                        state.activeController.skip(-step);
                    }
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    e.stopPropagation();
                    if (started && state.activeController) {
                        const step = state.activeController.paused ? 1 : 5;
                        state.activeController.skip(step);
                    }
                    break;
            }
        }

        document.addEventListener('keydown', onKeyDown, true);

        // ── Close Button ──
        const closeBtn = overlay.querySelector('#rsvp-close');
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeOverlay();
        });

        // ── Close Handler ──
        function closeOverlay() {
            document.removeEventListener('keydown', onKeyDown, true);

            if (state.activeController) {
                state.activeController.stop();
                state.activeController = null;
            }

            const ov = document.getElementById('rsvp-overlay');
            if (ov) ov.remove();

            // Restore page state
            document.body.style.overflow = state.previousOverflow;
            if (state.previousFocus && state.previousFocus.focus) {
                state.previousFocus.focus();
            }
        }
    }

    // Expose startRsvpOverlay globally so re-injection updates it
    window.__rsvpStartOverlay = startRsvpOverlay;

    // Only set up message listener once
    if (!window.__rsvpListenerAttached) {
        window.__rsvpListenerAttached = true;

        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            if (msg.type === 'START_RSVP') {
                // Always call the latest version of startRsvpOverlay
                if (window.__rsvpStartOverlay) {
                    window.__rsvpStartOverlay(msg.text || '', msg.settings || {});
                }
            }
        });
    }
})();
