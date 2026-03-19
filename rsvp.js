// ─── RSVP Reader — Core Algorithm (port of rsvp.py) ───
// RsvpController: preprocess, compute weights/delays, display loop with anchor alignment.

window.RsvpController = class RsvpController {
    constructor(text, settings, overlay) {
        this.settings = Object.assign({
            WPM: 400,
            LENGTH_STRENGTH: 0.6,
            PUNCTUATION_BOOST: 1.5,
            ANCHOR_RATIO: 0.35,
            SHOW_ANCHOR_UNDERLINE: false,
            CONTEXT_ANIMATION: true,
            FONT_SIZE: 72,
            GRADUAL_RAMP: false,
            RAMP_DURATION: 10,
            FONT_FAMILY: 'default'
        }, settings);

        this.overlay = overlay;
        this.wordContainer = overlay.querySelector('#rsvp-word');
        this.contextView = overlay.querySelector('#rsvp-context-view');
        this.contextText = overlay.querySelector('#rsvp-context-text');
        this.progressBar = overlay.querySelector('#rsvp-progress-fill');
        this.wpmDisplay = overlay.querySelector('#rsvp-wpm');
        this.pauseIndicator = overlay.querySelector('#rsvp-pause-indicator');
        this.wordWrapper = overlay.querySelector('#rsvp-word-wrapper');

        // Apply custom font size
        this.overlay.style.setProperty('--rsvp-font-size', this.settings.FONT_SIZE + 'px');

        this.words = this.preprocess(text);
        this.delays = this.computeDelays(this.words);

        this.index = 0;
        this.stopped = false;
        this.paused = false;
        this._readingStartTime = 0;  // set when start() is called
        this._rafId = null;
        this._resolveDisplay = null;
        this._pauseStartTime = 0;
        this._totalPausedTime = 0;

        this.updateWpmDisplay();
    }

    // ── Text Preprocessing ──
    preprocess(text) {
        // Decode common HTML entities
        const textarea = document.createElement('textarea');
        textarea.innerHTML = text;
        let decoded = textarea.value;

        // Collapse whitespace, trim, remove control characters (except spaces)
        decoded = decoded.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        decoded = decoded.replace(/\s+/g, ' ').trim();

        if (!decoded) return [];

        const rawWords = decoded.split(' ').filter(w => w.length > 0);

        // Split on hyphens (-), em-dashes (—), and en-dashes (–):
        // "high-rise" → ["high-", "rise"]
        // "forgotten—the" → ["forgotten—", "the"]
        const words = [];
        for (const w of rawWords) {
            // Match any hyphen or dash character
            const dashPattern = /[-\u2013\u2014]/;
            if (dashPattern.test(w) && w.length > 1 && w !== '-' && w !== '\u2013' && w !== '\u2014') {
                // Split on any dash, keeping the dash as a delimiter
                const parts = w.split(/([-\u2013\u2014])/);
                // parts alternates: [text, dash, text, dash, text, ...]
                for (let i = 0; i < parts.length; i++) {
                    if (parts[i].length === 0) continue;
                    if (dashPattern.test(parts[i])) {
                        // It's a dash — attach it to the previous word if one exists
                        if (words.length > 0) {
                            words[words.length - 1] += parts[i];
                        }
                    } else {
                        words.push(parts[i]);
                    }
                }
            } else {
                words.push(w);
            }
        }

        return words;
    }

    // ── Weight & Delay Computation (exact port of rsvp.py) ──
    computeDelays(words) {
        if (words.length === 0) return [];
        if (words.length === 1) {
            return [(1 / this.settings.WPM) * 60];
        }

        const lengths = words.map(w => w.length);
        const avgLen = lengths.reduce((s, l) => s + l, 0) / lengths.length;

        const weights = words.map(w => {
            let lengthFactor = 1 + this.settings.LENGTH_STRENGTH * ((w.length - avgLen) / avgLen);

            // Punctuation boost for words ending with .,;:!?
            if (/[.,;:!?]$/.test(w)) {
                lengthFactor *= this.settings.PUNCTUATION_BOOST;
            }

            // Clamp minimum weight
            return Math.max(0.1, lengthFactor);
        });

        const totalWeight = weights.reduce((a, b) => a + b, 0);
        const totalTime = (words.length / this.settings.WPM) * 60; // seconds

        // Normalize weights to delays
        const delays = weights.map(w => (w / totalWeight) * totalTime);

        // Assign floating-point remainder to final word
        const delaySum = delays.reduce((a, b) => a + b, 0);
        delays[delays.length - 1] += (totalTime - delaySum);

        return delays;
    }

    // Compute delay for a single word at a given WPM
    computeWordDelay(word, wpm) {
        const baseDelay = (1 / wpm) * 60; // seconds per word at this WPM
        let factor = 1;

        // Length factor (use median length of 5 as reference)
        factor += this.settings.LENGTH_STRENGTH * ((word.length - 5) / 5);

        // Punctuation boost
        if (/[.,;:!?]$/.test(word)) {
            factor *= this.settings.PUNCTUATION_BOOST;
        }

        return Math.max(0.02, baseDelay * Math.max(0.1, factor));
    }

    // ── Anchor Index (exact port) ──
    getAnchorIndex(word) {
        return Math.min(word.length - 1, Math.max(0, Math.floor(word.length * this.settings.ANCHOR_RATIO)));
    }

    // ── HTML Escaping ──
    escapeHtml(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // ── Render Word with Anchor ──
    render(word) {
        const anchorIndex = this.getAnchorIndex(word);

        const before = this.escapeHtml(word.slice(0, anchorIndex));
        const anchorChar = this.escapeHtml(word.charAt(anchorIndex));
        const after = this.escapeHtml(word.slice(anchorIndex + 1));

        const underlineClass = this.settings.SHOW_ANCHOR_UNDERLINE ? ' rsvp-anchor-underline' : '';

        const wordHtml =
            `<span class="rsvp-before">${before}</span>` +
            `<span class="rsvp-anchor${underlineClass}">${anchorChar}</span>` +
            `<span class="rsvp-after">${after}</span>`;

        // Reset transform BEFORE setting new content so measurement is from natural position
        this.wordContainer.style.transform = 'translateX(0)';
        this.wordContainer.innerHTML = wordHtml;

        // RTL support
        const rtlRe = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0780-\u07BF\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
        if (rtlRe.test(word)) {
            this.wordContainer.classList.add('rsvp-rtl');
        } else {
            this.wordContainer.classList.remove('rsvp-rtl');
        }

        // Force synchronous reflow so the reset transform and new content are laid out
        void this.wordContainer.offsetWidth;

        // Now measure anchor position and compute the delta to center it
        const anchorSpan = this.wordContainer.querySelector('.rsvp-anchor');
        if (anchorSpan) {
            const anchorRect = anchorSpan.getBoundingClientRect();
            const anchorCenter = anchorRect.left + anchorRect.width / 2;
            const screenCenter = window.innerWidth / 2;
            const delta = anchorCenter - screenCenter;
            this.wordContainer.style.transform = `translateX(${-delta}px)`;
        }

        // Update progress bar
        if (this.progressBar && this.words.length > 0) {
            const progress = ((this.index + 1) / this.words.length) * 100;
            this.progressBar.style.width = `${progress}%`;
        }
    }

    // ── Display Word with Timing ──
    async displayWord(word, delay) {
        return new Promise(resolve => {
            this._resolveDisplay = resolve;
            const delayMs = delay * 1000;

            this.render(word);
            this._totalPausedTime = 0;

            const startTime = performance.now();

            const tick = () => {
                if (this.stopped) {
                    this._resolveDisplay = null;
                    return resolve();
                }

                if (this.paused) {
                    if (this._pauseStartTime === 0) {
                        this._pauseStartTime = performance.now();
                    }
                    this._rafId = requestAnimationFrame(tick);
                    return;
                }

                // If we were paused, accumulate paused time
                if (this._pauseStartTime > 0) {
                    this._totalPausedTime += performance.now() - this._pauseStartTime;
                    this._pauseStartTime = 0;
                }

                const elapsed = performance.now() - startTime - this._totalPausedTime;

                if (elapsed >= delayMs - 1) {
                    this._resolveDisplay = null;
                    return resolve();
                }

                this._rafId = requestAnimationFrame(tick);
            };

            this._rafId = requestAnimationFrame(tick);
        });
    }

    // ── Main Loop ──
    async start() {
        if (this.words.length === 0) {
            this.cleanup();
            return;
        }

        this._readingStartTime = performance.now();
        this._totalPausedTime = 0;

        for (; this.index < this.words.length && !this.stopped; this.index++) {
            let delay;

            // Gradual WPM ramp-up: interpolate WPM from half → full over rampDuration
            if (this.settings.GRADUAL_RAMP && this.settings.RAMP_DURATION > 0) {
                const activeTime = (performance.now() - this._readingStartTime - this._totalPausedTime) / 1000;
                const rampSec = this.settings.RAMP_DURATION;

                if (activeTime < rampSec) {
                    const fraction = activeTime / rampSec;
                    const startWPM = Math.max(60, this.settings.WPM * 0.5);
                    const currentWPM = startWPM + (this.settings.WPM - startWPM) * fraction;
                    delay = this.computeWordDelay(this.words[this.index], currentWPM);
                } else {
                    delay = this.delays[this.index];
                }
            } else {
                delay = this.delays[this.index];
            }

            await this.displayWord(this.words[this.index], delay);
        }

        // Reading complete — show done state with restart option
        if (!this.stopped) {
            this.showComplete();
        }
    }

    // ── Pause / Resume ──
    togglePause() {
        this.paused = !this.paused;

        if (this.pauseIndicator) {
            this.pauseIndicator.style.opacity = this.paused ? '1' : '0';
        }
    }

    // ── Skip Forward / Backward ──
    skip(delta) {
        const newIndex = Math.max(0, Math.min(this.words.length - 1, this.index + delta));

        if (this.paused) {
            // When paused, render the word at the new position immediately
            this.index = newIndex;
            this.render(this.words[this.index]);
            // Refresh context view with new position
            this.showContextView();
        } else {
            // When playing, force-resolve current word to jump
            this.index = newIndex;
            if (this._resolveDisplay) {
                this.index = newIndex - 1; // start() loop will increment
                this._resolveDisplay();
                this._resolveDisplay = null;
            }
        }
    }

    // ── Seek To (direct index jump) ──
    seekTo(newIndex) {
        this.index = Math.max(0, Math.min(this.words.length - 1, newIndex));
        // Update progress bar
        if (this.progressBar && this.words.length > 0) {
            const progress = ((this.index + 1) / this.words.length) * 100;
            this.progressBar.style.width = `${progress}%`;
        }
    }

    // ── Stop ──
    stop() {
        this.stopped = true;
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        if (this._resolveDisplay) {
            this._resolveDisplay();
            this._resolveDisplay = null;
        }
    }

    // ── Show Context View (on pause) ──
    showContextView(forceInstant = false) {
        if (!this.contextView || !this.contextText) return;

        const words = this.words;
        const idx = this.index;
        const underlineClass = this.settings.SHOW_ANCHOR_UNDERLINE ? ' rsvp-anchor-underline' : '';

        // Show context view, hide single-word display
        if (this.wordWrapper) this.wordWrapper.style.display = 'none';
        this.contextView.style.display = 'block';
        this.contextText.style.transform = '';
        this.contextText.innerHTML = '';

        // ── Measure character width (monospace font) ──
        const measurer = document.createElement('span');
        measurer.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;';
        measurer.textContent = 'M';
        this.contextText.appendChild(measurer);
        void measurer.offsetWidth;
        const charWidth = measurer.getBoundingClientRect().width;
        measurer.remove();

        // ── Layout constants ──
        const screenWidth = window.innerWidth;
        const PADDING = 20;
        const availableWidth = screenWidth - PADDING * 2;
        const screenCenterX = screenWidth / 2;
        const spaceWidth = charWidth; // monospace: space = one character
        const wordPx = (w) => w.length * charWidth;

        // Line height from computed styles
        const fontSize = parseFloat(getComputedStyle(this.contextText).fontSize);
        const lineHeight = fontSize * 1.4; // matches CSS line-height: 1.4

        // Word window: generous range around current index
        const WINDOW = 120;
        const winStart = Math.max(0, idx - WINDOW);
        const winEnd = Math.min(words.length - 1, idx + WINDOW);

        // ── Build the ACTIVE line (expand outward from current word) ──
        // Position current word so its anchor character sits at screen center X
        const anchorCharIdx = this.getAnchorIndex(words[idx]);
        const anchorOffset = (anchorCharIdx + 0.5) * charWidth;
        const currentWordLeft = screenCenterX - anchorOffset;
        const currentWordRight = currentWordLeft + wordPx(words[idx]);

        let activeLineIndices = [idx];
        let leftEdge = currentWordLeft;
        let rightEdge = currentWordRight;

        // Expand left
        for (let i = idx - 1; i >= winStart; i--) {
            const newLeft = leftEdge - spaceWidth - wordPx(words[i]);
            if (newLeft < PADDING) break;
            activeLineIndices.unshift(i);
            leftEdge = newLeft;
        }

        // Expand right
        for (let i = idx + 1; i <= winEnd; i++) {
            const newRight = rightEdge + spaceWidth + wordPx(words[i]);
            if (newRight > screenWidth - PADDING) break;
            activeLineIndices.push(i);
            rightEdge = newRight;
        }

        // ── Build lines ABOVE (greedy pack, right-to-left from remaining words) ──
        const linesAbove = [];
        let cursor = activeLineIndices[0] - 1;
        while (cursor >= winStart) {
            const line = [];
            let lineWidth = 0;
            for (let w = cursor; w >= winStart; w--) {
                const needed = line.length > 0 ? wordPx(words[w]) + spaceWidth : wordPx(words[w]);
                if (lineWidth + needed > availableWidth) break;
                line.unshift(w);
                lineWidth += needed;
            }
            if (line.length === 0) break;
            linesAbove.unshift(line);
            cursor = line[0] - 1;
        }

        // ── Build lines BELOW (greedy pack, left-to-right from remaining words) ──
        const linesBelow = [];
        cursor = activeLineIndices[activeLineIndices.length - 1] + 1;
        while (cursor <= winEnd) {
            const line = [];
            let lineWidth = 0;
            for (; cursor <= winEnd; cursor++) {
                const needed = line.length > 0 ? wordPx(words[cursor]) + spaceWidth : wordPx(words[cursor]);
                if (lineWidth + needed > availableWidth) break;
                line.push(cursor);
                lineWidth += needed;
            }
            if (line.length === 0) break;
            linesBelow.push(line);
        }

        // ── Assemble all lines ──
        const allLines = [...linesAbove, activeLineIndices, ...linesBelow];
        const activeLineNum = linesAbove.length;

        // ── Vertical positioning: center the active line in the container ──
        const containerHeight = this.contextView.getBoundingClientRect().height;
        const centerY = containerHeight / 2;
        const activeLineTop = centerY - lineHeight / 2;

        // ── Render each line as an absolutely positioned div ──
        let html = '';
        for (let ln = 0; ln < allLines.length; ln++) {
            const line = allLines[ln];
            const top = activeLineTop + (ln - activeLineNum) * lineHeight;
            const lineDistance = Math.abs(ln - activeLineNum);
            const animDelay = lineDistance * 80; // 80ms cascade per line
            const isActiveLine = ln === activeLineNum;
            const isVisible = top >= -lineHeight && top <= containerHeight + lineHeight;

            // Build word spans for this line
            let lineHtml = '';
            const useAnim = this.settings.CONTEXT_ANIMATION !== false && !forceInstant;
            for (const wi of line) {
                if (wi === idx) {
                    // Active word: full brightness with anchor highlight
                    const w = words[wi];
                    const ai = this.getAnchorIndex(w);
                    const before = this.escapeHtml(w.slice(0, ai));
                    const anchor = this.escapeHtml(w.charAt(ai));
                    const after = this.escapeHtml(w.slice(ai + 1));
                    const activeClass = useAnim ? 'rsvp-ctx-fadein' : 'rsvp-ctx-instant';
                    lineHtml += `<span class="rsvp-ctx-word rsvp-ctx-active ${activeClass}" id="rsvp-ctx-active" style="--ctx-delay:0ms;">` +
                        `<span class="rsvp-before">${before}</span>` +
                        `<span class="rsvp-anchor${underlineClass}">${anchor}</span>` +
                        `<span class="rsvp-after">${after}</span>` +
                        `</span> `;
                } else {
                    if (useAnim) {
                        const cls = isVisible ? 'rsvp-ctx-fadein' : 'rsvp-ctx-hidden';
                        lineHtml += `<span class="rsvp-ctx-word ${cls}" style="--ctx-delay:${animDelay}ms;">${this.escapeHtml(words[wi])}</span> `;
                    } else {
                        // No animation: show instantly
                        const cls = isVisible ? 'rsvp-ctx-instant' : 'rsvp-ctx-hidden';
                        lineHtml += `<span class="rsvp-ctx-word ${cls}">${this.escapeHtml(words[wi])}</span> `;
                    }
                }
            }

            // Active line: positioned at exact leftEdge so anchor stays at center
            // Other lines: centered horizontally via text-align: center
            if (isActiveLine) {
                html += `<div class="rsvp-ctx-line" style="position:absolute;top:${top}px;left:${leftEdge}px;white-space:nowrap;line-height:${lineHeight}px;">${lineHtml}</div>`;
            } else {
                html += `<div class="rsvp-ctx-line" style="position:absolute;top:${top}px;left:0;right:0;text-align:center;white-space:nowrap;line-height:${lineHeight}px;">${lineHtml}</div>`;
            }
        }

        this.contextText.innerHTML = html;
    }

    // ── Hide Context View (on resume) ──
    hideContextView() {
        if (!this.contextView) return;
        this.contextView.style.display = 'none';
        if (this.contextText) this.contextText.innerHTML = '';
        if (this.wordWrapper) this.wordWrapper.style.display = 'flex';
    }

    // ── Show Completion State ──
    showComplete() {
        this.paused = true;
        if (this.pauseIndicator) this.pauseIndicator.style.opacity = '0';

        // Hide context view if visible
        this.hideContextView();

        if (this.wordContainer) {
            this.wordContainer.innerHTML = '<span class="rsvp-complete">✓ Done</span>';
            this.wordContainer.style.transform = 'translateX(0)';
        }

        // Show restart button below
        const existing = this.overlay.querySelector('#rsvp-restart-btn');
        if (existing) existing.remove();

        const restartBtn = document.createElement('button');
        restartBtn.id = 'rsvp-restart-btn';
        restartBtn.innerHTML = '↻ Restart';
        this.overlay.appendChild(restartBtn);

        // Dispatch custom event so content.js can wire up
        this.overlay.dispatchEvent(new CustomEvent('rsvp-complete'));
    }

    // ── Restart Reading ──
    async restart() {
        // Stop current execution if any
        if (!this.stopped) {
            this.stop();
            // yield briefly to let the old async start() loop exit
            await new Promise(r => setTimeout(r, 0));
        }

        // Remove restart button
        const btn = this.overlay.querySelector('#rsvp-restart-btn');
        if (btn) btn.remove();

        // Reset state
        this.index = 0;
        this.stopped = false;
        this.paused = false;
        this._readingStartTime = 0;
        this._totalPausedTime = 0;
        this._pauseStartTime = 0;

        // Hide context view, show word
        this.hideContextView();

        // Update progress bar
        if (this.progressBar) this.progressBar.style.width = '0%';

        // Restart the reading loop
        this.start();
    }

    // ── Update WPM Display ──
    updateWpmDisplay() {
        if (this.wpmDisplay) {
            this.wpmDisplay.textContent = `${this.settings.WPM} WPM`;
        }
    }

    // ── Cleanup ──
    cleanup() {
        this.stop();
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
    }
};
