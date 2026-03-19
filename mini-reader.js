// ─── RSVP Reader — Mini Reader Module ───
// Lightweight floating word-at-a-time reader with page highlighting, pick mode, and RTL.

(function () {
    if (window.__RSVP_MINI_LOADED__) return;
    window.__RSVP_MINI_LOADED__ = true;

    // ═══════════════════════════════════════════════════════════════
    //  Feature 1: Site Profiles & Smart Content Extraction
    // ═══════════════════════════════════════════════════════════════

    const SITE_PROFILES = [
        {
            match: /reddit\.com/,
            headline: ['h1', '[data-testid="post-title"]', '.Post h1'],
            subheadline: [],
            body: ['[data-testid="post-content"]', '.RichTextJSON-root', '[data-click-id="text"]', '.Post .md', 'article'],
            ads: ['.ad', '.ads', '[class*="promoted"]', '[class*="ad-container"]', 'aside'],
            related: ['[class*="related"]', '[class*="recommend"]'],
            nav: ['nav', 'header', 'footer', '.sidebar', '[role="navigation"]']
        },
        {
            match: /medium\.com/,
            headline: ['h1', 'article h1'],
            subheadline: ['h2:first-of-type', '.subtitle', '.pw-subtitle'],
            body: ['article', '.meteredContent', 'main'],
            ads: ['.ad', '.ads', '[class*="ad-container"]'],
            related: ['[class*="related"]', '[class*="recommend"]', '[class*="more-stories"]'],
            nav: ['nav', 'header:not(article header)', 'footer', '.sidebar', '[role="navigation"]']
        },
        {
            match: /wikipedia\.org/,
            headline: ['h1#firstHeading', 'h1'],
            subheadline: ['.mw-parser-output > p:first-of-type b'],
            body: ['#mw-content-text .mw-parser-output', '#bodyContent', 'main'],
            ads: [],
            related: ['#catlinks', '.navbox', '.sistersitebox'],
            nav: ['nav', '#mw-navigation', '.sidebar', '#toc', '.toc', 'footer']
        },
        {
            // Generic fallback for any site
            match: /.*/,
            headline: ['h1', 'article h1', '.post-title', '.entry-title', '.article-title'],
            subheadline: ['.subtitle', '.sub-title', '.deck', 'article h2:first-of-type'],
            body: ['article', '[role="article"]', 'main', '[role="main"]', '.post-content', '.entry-content', '.article-body'],
            ads: ['.ad', '.ads', '.advertisement', '[class*="ad-container"]', '.taboola', '.outbrain', '[class*="promo"]', '[class*="sponsor"]', 'aside'],
            related: ['[class*="related"]', '[class*="recommend"]', '[class*="more-stories"]'],
            nav: ['nav', 'header:not(article header)', 'footer', '.sidebar', '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '.breadcrumb']
        }
    ];

    function getSiteProfile() {
        const url = window.location.href;
        return SITE_PROFILES.find(p => p.match.test(url)) || SITE_PROFILES[SITE_PROFILES.length - 1];
    }

    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'IMG', 'VIDEO', 'CANVAS', 'IFRAME', 'BR', 'HR', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']);

    function collectExcluded(profile) {
        const excluded = new Set();
        const selectors = [...(profile.ads || []), ...(profile.related || []), ...(profile.nav || [])];
        for (const sel of selectors) {
            try {
                document.querySelectorAll(sel).forEach(el => excluded.add(el));
            } catch (e) { /* invalid selector */ }
        }
        return excluded;
    }

    function isInsideExcluded(node, excludedSet) {
        let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        while (el) {
            if (excludedSet.has(el)) return true;
            el = el.parentElement;
        }
        return false;
    }

    function shouldSkipElement(el) {
        if (!el) return true;
        return SKIP_TAGS.has(el.tagName);
    }

    /**
     * Walk DOM tree, extract words with TextNode references.
     * Returns: [{ word, node, start, end }, ...]
     */
    function walkTextNodes(root, excludedSet) {
        const words = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!node.parentElement) return NodeFilter.FILTER_REJECT;
                if (shouldSkipElement(node.parentElement)) return NodeFilter.FILTER_REJECT;
                if (isInsideExcluded(node, excludedSet)) return NodeFilter.FILTER_REJECT;
                // Skip hidden elements
                const style = getComputedStyle(node.parentElement);
                if (style.display === 'none' || style.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        let textNode;
        while ((textNode = walker.nextNode())) {
            const text = textNode.textContent;
            const regex = /\S+/g;
            let match;
            while ((match = regex.exec(text))) {
                words.push({
                    word: match[0],
                    node: textNode,
                    start: match.index,
                    end: match.index + match[0].length
                });
            }
        }
        return words;
    }

    /**
     * Smart content extraction with DOM position tracking.
     * Returns [{ word, node, start, end }, ...]
     */
    function smartExtract() {
        const profile = getSiteProfile();
        const excludedSet = collectExcluded(profile);
        const usedNodes = new Set(); // track TextNodes already consumed by headline/sub

        let allWords = [];

        // Step 1: Headline
        for (const sel of profile.headline) {
            try {
                const el = document.querySelector(sel);
                if (el && el.innerText.trim().length > 0) {
                    const hw = walkTextNodes(el, excludedSet);
                    if (hw.length > 0) {
                        allWords.push(...hw);
                        hw.forEach(w => usedNodes.add(w.node));
                        break;
                    }
                }
            } catch (e) { }
        }

        // Step 2: Sub-headline
        for (const sel of profile.subheadline) {
            try {
                const el = document.querySelector(sel);
                if (el && el.innerText.trim().length > 0) {
                    const sw = walkTextNodes(el, excludedSet);
                    // Skip if it's the same text as headline
                    const subText = sw.map(w => w.word).join(' ');
                    const headText = allWords.map(w => w.word).join(' ');
                    if (sw.length > 0 && subText !== headText) {
                        allWords.push(...sw);
                        sw.forEach(w => usedNodes.add(w.node));
                        break;
                    }
                }
            } catch (e) { }
        }

        // Step 3: Article body
        for (const sel of profile.body) {
            try {
                const el = document.querySelector(sel);
                if (el && el.innerText.trim().length > 50) {
                    const bw = walkTextNodes(el, excludedSet);
                    // De-duplicate: skip words from TextNodes already used by headline/sub
                    const deduped = bw.filter(w => !usedNodes.has(w.node));
                    if (deduped.length > 10) {
                        allWords.push(...deduped);
                        break;
                    }
                }
            } catch (e) { }
        }

        // Fallback
        if (allWords.length < 20) {
            allWords = walkTextNodes(document.body, excludedSet);
        }

        return allWords;
    }

    // ═══════════════════════════════════════════════════════════════
    //  Feature 5: RTL Detection
    // ═══════════════════════════════════════════════════════════════

    const RTL_RE = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0780-\u07BF\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

    function isRtl(word) {
        return RTL_RE.test(word);
    }

    // ═══════════════════════════════════════════════════════════════
    //  Feature 2: Page Highlight
    // ═══════════════════════════════════════════════════════════════

    let highlightEl = null;
    let lastScrollTime = 0;
    const SCROLL_COOLDOWN = 1000;

    function ensureHighlight() {
        if (highlightEl) return highlightEl;
        highlightEl = document.createElement('div');
        highlightEl.id = 'rsvpPageHighlight';
        document.body.appendChild(highlightEl);
        return highlightEl;
    }

    function updateHighlight(wordInfo) {
        if (!wordInfo || !wordInfo.node || !wordInfo.node.parentNode) {
            hideHighlight();
            return;
        }

        try {
            const range = document.createRange();
            range.setStart(wordInfo.node, wordInfo.start);
            range.setEnd(wordInfo.node, wordInfo.end);
            const rect = range.getBoundingClientRect();

            if (rect.width === 0 && rect.height === 0) {
                hideHighlight();
                return;
            }

            const hl = ensureHighlight();
            hl.style.display = 'block';
            hl.style.left = (rect.left + window.scrollX - 2) + 'px';
            hl.style.top = (rect.top + window.scrollY - 2) + 'px';
            hl.style.width = (rect.width + 4) + 'px';
            hl.style.height = (rect.height + 4) + 'px';

            // Auto-scroll if off-screen
            const margin = window.innerHeight * 0.25;
            const now = Date.now();
            if (now - lastScrollTime > SCROLL_COOLDOWN) {
                if (rect.top < margin || rect.bottom > window.innerHeight - margin) {
                    const targetY = rect.top + window.scrollY - window.innerHeight / 2;
                    window.scrollTo({ top: targetY, behavior: 'smooth' });
                    lastScrollTime = now;
                }
            }
        } catch (e) {
            hideHighlight();
        }
    }

    function hideHighlight() {
        if (highlightEl) {
            highlightEl.style.display = 'none';
        }
    }

    function removeHighlight() {
        if (highlightEl) {
            highlightEl.remove();
            highlightEl = null;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Feature 3: Mini Reader Overlay
    // ═══════════════════════════════════════════════════════════════

    let miniOverlay = null;
    let miniInterval = null;
    let miniRunning = false;

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function getAnchorIndex(word, ratio) {
        return Math.min(word.length - 1, Math.max(0, Math.floor(word.length * ratio)));
    }

    function renderMiniWord(container, word, anchorRatio) {
        const ai = getAnchorIndex(word, anchorRatio);
        const before = escapeHtml(word.slice(0, ai));
        const anchor = escapeHtml(word.charAt(ai));
        const after = escapeHtml(word.slice(ai + 1));
        const rtlClass = isRtl(word) ? ' rsvp-rtl' : '';

        container.className = 'rsvp-mini-word' + rtlClass;
        container.innerHTML =
            `<span class="rsvp-before">${before}</span>` +
            `<span class="rsvp-anchor">${anchor}</span>` +
            `<span class="rsvp-after">${after}</span>`;
    }

    function createMiniOverlay() {
        const ov = document.createElement('div');
        ov.id = 'rsvp-mini-overlay';
        ov.innerHTML = `
            <div id="rsvp-mini-word-container" class="rsvp-mini-word"></div>
            <div id="rsvp-mini-progress"></div>
        `;
        document.body.appendChild(ov);
        return ov;
    }

    function startMiniReader(wordList, settings, startIndex = 0) {
        // Stop any existing mini reader
        stopMiniReader();

        if (!wordList || wordList.length === 0) return;

        miniOverlay = createMiniOverlay();
        const wordContainer = miniOverlay.querySelector('#rsvp-mini-word-container');
        const progressEl = miniOverlay.querySelector('#rsvp-mini-progress');

        const wpm = (settings && settings.WPM) || 400;
        const anchorRatio = (settings && settings.ANCHOR_RATIO) || 0.35;
        const delayMs = Math.round(60000 / wpm);

        let index = startIndex;
        miniRunning = true;

        // Show first word immediately
        const current = wordList[index];
        renderMiniWord(wordContainer, current.word || current, anchorRatio);
        progressEl.textContent = `${index + 1} / ${wordList.length}`;
        if (current.node) updateHighlight(current);

        miniInterval = setInterval(() => {
            index++;
            if (index >= wordList.length) {
                stopMiniReader();
                return;
            }

            const w = wordList[index];
            renderMiniWord(wordContainer, w.word || w, anchorRatio);
            progressEl.textContent = `${index + 1} / ${wordList.length}`;

            if (w.node) updateHighlight(w);
        }, delayMs);

        // Click overlay to stop
        miniOverlay.addEventListener('click', (e) => {
            e.stopPropagation();
            stopMiniReader();
        });

        // Escape to stop
        function onEsc(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                stopMiniReader();
                document.removeEventListener('keydown', onEsc, true);
            }
        }
        document.addEventListener('keydown', onEsc, true);
        miniOverlay._escHandler = onEsc;
    }

    function stopMiniReader() {
        miniRunning = false;
        if (miniInterval) {
            clearInterval(miniInterval);
            miniInterval = null;
        }
        if (miniOverlay) {
            if (miniOverlay._escHandler) {
                document.removeEventListener('keydown', miniOverlay._escHandler, true);
            }
            miniOverlay.remove();
            miniOverlay = null;
        }
        removeHighlight();
        exitPickMode(); // safety
    }

    // ═══════════════════════════════════════════════════════════════
    //  Feature 4: Pick Start Point Mode
    // ═══════════════════════════════════════════════════════════════

    let pickActive = false;
    let pickWords = null;
    let pickSettings = null;
    let pickHighlight = null;

    function enterPickMode(words, settings) {
        if (pickActive) exitPickMode();
        pickActive = true;
        pickWords = words;
        pickSettings = settings;

        document.body.classList.add('rsvp-pick-mode');

        // Create pick highlight
        pickHighlight = document.createElement('div');
        pickHighlight.id = 'rsvpPickHighlight';
        document.body.appendChild(pickHighlight);

        document.addEventListener('mousemove', onPickMove, true);
        document.addEventListener('click', onPickClick, true);
        document.addEventListener('keydown', onPickEsc, true);
    }

    function exitPickMode() {
        pickActive = false;
        pickWords = null;
        pickSettings = null;
        document.body.classList.remove('rsvp-pick-mode');

        if (pickHighlight) {
            pickHighlight.remove();
            pickHighlight = null;
        }

        document.removeEventListener('mousemove', onPickMove, true);
        document.removeEventListener('click', onPickClick, true);
        document.removeEventListener('keydown', onPickEsc, true);
    }

    function findWordAtPoint(x, y, words) {
        let best = null;
        let bestDist = Infinity;

        // Limit search range for performance — check only nearby words
        for (let i = 0; i < words.length; i++) {
            const w = words[i];
            if (!w.node || !w.node.parentNode) continue;

            try {
                const range = document.createRange();
                range.setStart(w.node, w.start);
                range.setEnd(w.node, w.end);
                const rect = range.getBoundingClientRect();

                if (rect.width === 0 && rect.height === 0) continue;

                // Direct hit
                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                    return { index: i, rect };
                }

                // Closest fallback (within 30px)
                const cx = (rect.left + rect.right) / 2;
                const cy = (rect.top + rect.bottom) / 2;
                const dist = Math.hypot(x - cx, y - cy);

                if (dist < bestDist && dist < 30) {
                    bestDist = dist;
                    best = { index: i, rect };
                }
            } catch (e) { continue; }
        }

        return best;
    }

    function onPickMove(e) {
        if (!pickActive || !pickWords) return;
        const found = findWordAtPoint(e.clientX, e.clientY, pickWords);
        if (found && pickHighlight) {
            pickHighlight.style.display = 'block';
            pickHighlight.style.left = (found.rect.left + window.scrollX - 2) + 'px';
            pickHighlight.style.top = (found.rect.top + window.scrollY - 2) + 'px';
            pickHighlight.style.width = (found.rect.width + 4) + 'px';
            pickHighlight.style.height = (found.rect.height + 4) + 'px';
        } else if (pickHighlight) {
            pickHighlight.style.display = 'none';
        }
    }

    function onPickClick(e) {
        if (!pickActive || !pickWords) return;
        e.preventDefault();
        e.stopPropagation();

        const found = findWordAtPoint(e.clientX, e.clientY, pickWords);
        const startIdx = found ? found.index : 0;
        const settings = pickSettings;
        const words = pickWords;

        exitPickMode();
        startMiniReader(words, settings, startIdx);
    }

    function onPickEsc(e) {
        if (e.key === 'Escape' && pickActive) {
            e.preventDefault();
            e.stopPropagation();
            exitPickMode();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Public API — exposed on window for content.js to call
    // ═══════════════════════════════════════════════════════════════

    window.__rsvpMini = {
        /**
         * Start mini reader with smart-extracted page content.
         */
        startFromPage(settings) {
            const words = smartExtract();
            if (words.length < 5) {
                showMiniToast('Could not extract enough content from this page.');
                return;
            }
            startMiniReader(words, settings);
        },

        /**
         * Start mini reader with selected text (no DOM tracking).
         */
        startFromSelection(settings) {
            const sel = window.getSelection().toString().trim();
            if (!sel) {
                showMiniToast('No text selected.');
                return;
            }
            // Split into simple word objects (no DOM tracking = no page highlight)
            const words = sel.split(/\s+/).filter(w => w.length > 0).map(w => ({ word: w, node: null, start: 0, end: 0 }));
            if (words.length < 2) {
                showMiniToast('Selection too short.');
                return;
            }
            startMiniReader(words, settings);
        },

        /**
         * Enter pick-start mode.
         */
        pickStart(settings) {
            const words = smartExtract();
            if (words.length < 5) {
                showMiniToast('Could not extract enough content from this page.');
                return;
            }
            enterPickMode(words, settings);
        },

        /**
         * Stop the mini reader (if running).
         */
        stop() {
            stopMiniReader();
        },

        /**
         * Smart extraction — reusable by other modules.
         */
        smartExtract,

        /**
         * RTL detection — reusable by other modules.
         */
        isRtl
    };

    function showMiniToast(message) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.85); color: #fff; padding: 12px 24px;
            border-radius: 8px; font: 14px/1.4 system-ui, sans-serif;
            z-index: 2147483647; pointer-events: none;
            animation: rsvp-toast-fade 3s ease forwards;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3200);
    }

    // ═══════════════════════════════════════════════════════════════
    //  Message Listener
    // ═══════════════════════════════════════════════════════════════

    if (!window.__rsvpMiniListenerAttached) {
        window.__rsvpMiniListenerAttached = true;

        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            if (msg.type === 'RSVP_MINI') {
                const s = msg.settings || {};
                if (msg.mode === 'extract') {
                    window.__rsvpMini.startFromPage(s);
                } else if (msg.mode === 'selection') {
                    window.__rsvpMini.startFromSelection(s);
                }
            } else if (msg.type === 'RSVP_PICK') {
                window.__rsvpMini.pickStart(msg.settings || {});
            }
        });
    }

})();
