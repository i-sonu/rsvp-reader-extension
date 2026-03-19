// ─── RSVP Reader — Background Service Worker ───
// Creates context menus, loads settings, injects content scripts, and forwards messages.

const DEFAULTS = {
  WPM: 400,
  LENGTH_STRENGTH: 0.6,
  PUNCTUATION_BOOST: 1.5,
  ANCHOR_RATIO: 0.35,
  SHOW_ANCHOR_UNDERLINE: false,
  CONTEXT_ANIMATION: true,
  FONT_SIZE: 72,
  GRADUAL_RAMP: false,
  RAMP_DURATION: 10,
  FONT_FAMILY: 'default',
  THEME_MODE: 'system',
  THEME_CUSTOM: 'dark'
};

// ── Context Menus ──
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'rsvp_selection',
    title: 'Read selection with RSVP',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'rsvp_page',
    title: 'Read page with RSVP',
    contexts: ['page']
  });
  // Mini reader items
  chrome.contextMenus.create({
    id: 'rsvp_mini_page',
    title: 'Read page with RSVP (Mini)',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'rsvp_mini_selection',
    title: 'Read selection with RSVP (Mini)',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'rsvp_pick',
    title: 'Pick start word for RSVP',
    contexts: ['page']
  });
});

// ── Shared injection + message helper ──
async function injectAndSend(tabId, message) {
  const settings = await chrome.storage.local.get(DEFAULTS);
  message.settings = settings;

  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['ui.css']
    });

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['rsvp.js', 'content.js']
    });

    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, message);
    }, 50);
  } catch (e) {
  }
}

// ── Menu Click Handler ──
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === 'rsvp_selection') {
    let text = info.selectionText || '';

    // Fallback: grab selection from the page directly
    if (!text.trim()) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => document.getSelection().toString()
        });
        text = results?.[0]?.result || '';
      } catch (e) {
        return;
      }
    }

    if (!text.trim()) return;

    await injectAndSend(tab.id, {
      type: 'START_RSVP',
      mode: 'selection',
      text: text
    });

  } else if (info.menuItemId === 'rsvp_page') {
    await injectAndSend(tab.id, {
      type: 'START_RSVP',
      mode: 'extract'
    });

  } else if (info.menuItemId === 'rsvp_mini_page') {
    await injectMiniAndSend(tab.id, {
      type: 'RSVP_MINI',
      mode: 'extract'
    });

  } else if (info.menuItemId === 'rsvp_mini_selection') {
    await injectMiniAndSend(tab.id, {
      type: 'RSVP_MINI',
      mode: 'selection'
    });

  } else if (info.menuItemId === 'rsvp_pick') {
    await injectMiniAndSend(tab.id, {
      type: 'RSVP_PICK'
    });
  }
});

// ── Mini Reader injection helper ──
async function injectMiniAndSend(tabId, message) {
  const settings = await chrome.storage.local.get(DEFAULTS);
  message.settings = settings;

  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['ui.css']
    });

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['mini-reader.js']
    });

    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, message);
    }, 50);
  } catch (e) {
  }
}
