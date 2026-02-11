const DEFAULT_RUNES = [
    "(각성)무자비한 포식자",
    "(각성)부서진 하늘",
    "(각성)대마법사",
    "(각성)흩날리는 검",
    "(각성)산맥 군주",
    "(각성)아득한 빛",
    "(각성)갈라진 땅",
    "(각성)녹아내린 대지",
];

function defaultConfig() {
    const runes = {};
    for (const name of DEFAULT_RUNES) {
        runes[name] = {
            triggerIds: [],
            requireAll: false,
        };
    }
    return {
        selectedRune: DEFAULT_RUNES[0],
        baseCooldownSec: 90,
        prophetEnabled: false,
        prophetLevel: 0,
        prophetReductionByLevel: { 0: 38, 1: 39, 2: 40 },
        overlayAlwaysOn: true,
        runes,
    };
}

function calcEffectiveCooldown(cfg) {
    const base = Number(cfg.baseCooldownSec ?? 90);
    if (!cfg.prophetEnabled) return base;
    const level = String(cfg.prophetLevel ?? 0);
    const reduction = Number(cfg.prophetReductionByLevel?.[level] ?? 0);
    return Math.max(1, base - reduction);
}

function setStatus(msg, kind = "ok") {
    const el = document.getElementById("status");
    el.textContent = msg;
    el.className = kind === "ok" ? "ok" : "warn";
}

async function loadConfig() {
    const stored = await chrome.storage.sync.get(["cfg"]);
    return stored.cfg ?? defaultConfig();
}

async function saveConfig(cfg) {
    await chrome.storage.sync.set({ cfg });
}

function populateRuneSelect(cfg) {
    const sel = document.getElementById("runeSelect");
    sel.innerHTML = "";
    const names = Object.keys(cfg.runes ?? {});
    for (const name of names) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
    }
    if (!names.includes(cfg.selectedRune) && names.length) {
        cfg.selectedRune = names[0];
    }
    sel.value = cfg.selectedRune;
}

function updateCooldownPill(cfg) {
    const pill = document.getElementById("cooldownPill");
    pill.textContent = `Effective cooldown: ${calcEffectiveCooldown(cfg)}s`;
}

function configToJsonText(cfg) {
    return JSON.stringify(cfg.runes ?? {}, null, 2);
}

function jsonTextToRuneConfig(text, cfg) {
    const parsed = JSON.parse(text);
    const nextRunes = {};

    for (const [name, value] of Object.entries(parsed)) {
        const triggerIds = Array.isArray(value?.triggerIds)
            ? value.triggerIds.map(Number).filter(Number.isFinite)
            : [];
        nextRunes[name] = {
            triggerIds,
            requireAll: Boolean(value?.requireAll),
        };
    }

    if (!Object.keys(nextRunes).length) {
        throw new Error("At least one rune entry is required.");
    }

    cfg.runes = nextRunes;
    if (!cfg.runes[cfg.selectedRune]) {
        cfg.selectedRune = Object.keys(cfg.runes)[0];
    }
}

(async function init() {
    const cfg = await loadConfig();

    populateRuneSelect(cfg);
    document.getElementById("prophetEnabled").checked = Boolean(
        cfg.prophetEnabled,
    );
    document.getElementById("prophetLevel").value = String(
        cfg.prophetLevel ?? 0,
    );
    document.getElementById("triggerJson").value = configToJsonText(cfg);
    updateCooldownPill(cfg);

    document.getElementById("runeSelect").addEventListener("change", (e) => {
        cfg.selectedRune = e.target.value;
        updateCooldownPill(cfg);
    });

    document
        .getElementById("prophetEnabled")
        .addEventListener("change", (e) => {
            cfg.prophetEnabled = e.target.checked;
            updateCooldownPill(cfg);
        });

    document.getElementById("prophetLevel").addEventListener("change", (e) => {
        cfg.prophetLevel = Number(e.target.value);
        updateCooldownPill(cfg);
    });

    document.getElementById("saveBtn").addEventListener("click", async () => {
        try {
            const text = document.getElementById("triggerJson").value;
            jsonTextToRuneConfig(text, cfg);
            await saveConfig(cfg);
            populateRuneSelect(cfg);
            updateCooldownPill(cfg);
            setStatus("Saved.");
        } catch (err) {
            console.error(err);
            setStatus(`Invalid JSON: ${String(err.message || err)}`, "warn");
        }
    });

    document.getElementById("resetBtn").addEventListener("click", async () => {
        const next = defaultConfig();
        await saveConfig(next);
        cfg.selectedRune = next.selectedRune;
        cfg.baseCooldownSec = next.baseCooldownSec;
        cfg.prophetEnabled = next.prophetEnabled;
        cfg.prophetLevel = next.prophetLevel;
        cfg.prophetReductionByLevel = next.prophetReductionByLevel;
        cfg.overlayAlwaysOn = next.overlayAlwaysOn;
        cfg.runes = next.runes;

        populateRuneSelect(cfg);
        document.getElementById("prophetEnabled").checked = false;
        document.getElementById("prophetLevel").value = "0";
        document.getElementById("triggerJson").value = configToJsonText(cfg);
        updateCooldownPill(cfg);
        setStatus("Reset to defaults.");
    });
})();
