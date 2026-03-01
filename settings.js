// ─── RSVP Reader — Settings Helpers ───

const RSVP_DEFAULTS = {
    WPM: 400,
    LENGTH_STRENGTH: 0.6,
    PUNCTUATION_BOOST: 1.5,
    ANCHOR_RATIO: 0.35,
    SHOW_ANCHOR_UNDERLINE: false
};

async function loadSettings() {
    return chrome.storage.sync.get(RSVP_DEFAULTS);
}

async function saveSettings(obj) {
    return chrome.storage.sync.set(obj);
}
