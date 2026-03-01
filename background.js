// ─── RSVP Reader — Background Service Worker ───
// Creates context menu, loads settings, injects content scripts, and forwards messages.

const DEFAULTS = {
  WPM: 400,
  LENGTH_STRENGTH: 0.6,
  PUNCTUATION_BOOST: 1.5,
  ANCHOR_RATIO: 0.35,
  SHOW_ANCHOR_UNDERLINE: false,
  THEME_MODE: 'system',
  THEME_CUSTOM: 'dark'
};

// ── Context Menu ──
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'start_rsvp',
    title: 'Start RSVP',
    contexts: ['selection']
  });
});

// ── Menu Click Handler ──
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'start_rsvp' || !tab?.id) return;

  let text = info.selectionText || '';

  // Fallback: if selectionText is empty, grab it from the page directly
  if (!text.trim()) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.getSelection().toString()
      });
      text = results?.[0]?.result || '';
    } catch (e) {
      console.warn('RSVP: Could not retrieve selection from page:', e);
      return;
    }
  }

  if (!text.trim()) return;

  // Load user settings
  const settings = await chrome.storage.sync.get(DEFAULTS);

  // Inject CSS first, then scripts, then send message
  try {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['ui.css']
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['rsvp.js', 'content.js']
    });

    // Small delay to ensure scripts are loaded before messaging
    setTimeout(() => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'START_RSVP',
        text: text,
        settings: settings
      });
    }, 50);
  } catch (e) {
    console.error('RSVP: Failed to inject scripts:', e);
  }
});
