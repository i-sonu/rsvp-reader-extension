// ─── RSVP Reader — Settings Helpers ───

const RSVP_DEFAULTS = {
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
};

async function loadSettings() {
    return chrome.storage.local.get(RSVP_DEFAULTS);
}

async function saveSettings(obj) {
    return chrome.storage.local.set(obj);
}
