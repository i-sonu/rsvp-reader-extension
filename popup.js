// ─── RSVP Reader — Popup Settings Logic ───

document.addEventListener('DOMContentLoaded', async () => {
    // ── DOM References ──
    const wpmInput = document.getElementById('wpm-input');
    const wpmValue = document.getElementById('wpm-value');
    const lengthInput = document.getElementById('length-input');
    const lengthValue = document.getElementById('length-value');
    const punctInput = document.getElementById('punct-input');
    const punctValue = document.getElementById('punct-value');
    const anchorInput = document.getElementById('anchor-input');
    const anchorValue = document.getElementById('anchor-value');
    const underlineInput = document.getElementById('underline-input');
    const saveBtn = document.getElementById('save-btn');
    const resetBtn = document.getElementById('reset-btn');
    const saveStatus = document.getElementById('save-status');

    // ── Load Current Settings ──
    const settings = await loadSettings();

    wpmInput.value = settings.WPM;
    wpmValue.textContent = `${settings.WPM} WPM`;

    lengthInput.value = settings.LENGTH_STRENGTH;
    lengthValue.textContent = settings.LENGTH_STRENGTH.toFixed(2);

    punctInput.value = settings.PUNCTUATION_BOOST;
    punctValue.textContent = `${settings.PUNCTUATION_BOOST.toFixed(1)}×`;

    anchorInput.value = settings.ANCHOR_RATIO;
    anchorValue.textContent = `${Math.round(settings.ANCHOR_RATIO * 100)}%`;

    underlineInput.checked = settings.SHOW_ANCHOR_UNDERLINE;

    // ── Live Value Display Updates ──
    wpmInput.addEventListener('input', () => {
        wpmValue.textContent = `${wpmInput.value} WPM`;
    });

    lengthInput.addEventListener('input', () => {
        lengthValue.textContent = parseFloat(lengthInput.value).toFixed(2);
    });

    punctInput.addEventListener('input', () => {
        punctValue.textContent = `${parseFloat(punctInput.value).toFixed(1)}×`;
    });

    anchorInput.addEventListener('input', () => {
        anchorValue.textContent = `${Math.round(parseFloat(anchorInput.value) * 100)}%`;
    });

    // ── Save ──
    saveBtn.addEventListener('click', async () => {
        const newSettings = {
            WPM: parseInt(wpmInput.value, 10),
            LENGTH_STRENGTH: parseFloat(lengthInput.value),
            PUNCTUATION_BOOST: parseFloat(punctInput.value),
            ANCHOR_RATIO: parseFloat(anchorInput.value),
            SHOW_ANCHOR_UNDERLINE: underlineInput.checked
        };

        // Validate ranges
        newSettings.WPM = Math.max(100, Math.min(1000, newSettings.WPM));
        newSettings.LENGTH_STRENGTH = Math.max(0, Math.min(1, newSettings.LENGTH_STRENGTH));
        newSettings.PUNCTUATION_BOOST = Math.max(1, Math.min(3, newSettings.PUNCTUATION_BOOST));
        newSettings.ANCHOR_RATIO = Math.max(0.1, Math.min(0.6, newSettings.ANCHOR_RATIO));

        await saveSettings(newSettings);
        showSaveStatus('✓ Settings saved');
    });

    // ── Reset Defaults ──
    resetBtn.addEventListener('click', async () => {
        const defaults = { ...RSVP_DEFAULTS };
        await saveSettings(defaults);

        // Update inputs
        wpmInput.value = defaults.WPM;
        wpmValue.textContent = `${defaults.WPM} WPM`;
        lengthInput.value = defaults.LENGTH_STRENGTH;
        lengthValue.textContent = defaults.LENGTH_STRENGTH.toFixed(2);
        punctInput.value = defaults.PUNCTUATION_BOOST;
        punctValue.textContent = `${defaults.PUNCTUATION_BOOST.toFixed(1)}×`;
        anchorInput.value = defaults.ANCHOR_RATIO;
        anchorValue.textContent = `${Math.round(defaults.ANCHOR_RATIO * 100)}%`;
        underlineInput.checked = defaults.SHOW_ANCHOR_UNDERLINE;

        showSaveStatus('✓ Reset to defaults');
    });

    // ── Status Flash ──
    function showSaveStatus(message) {
        saveStatus.textContent = message;
        saveStatus.classList.add('visible');
        setTimeout(() => {
            saveStatus.classList.remove('visible');
        }, 2000);
    }
});
