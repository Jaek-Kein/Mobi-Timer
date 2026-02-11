const DEFAULT_RUNES = [
    "(전설)무자비한 포식자",
    "(전설)부서진 하늘",
    "(전설)대마법사",
    "(전설)흩날리는 검",
    "(전설)산맥 군주",
    "(전설)아득한 빛",
    "(전설)갈라진 땅",
    "(전설)녹아내린 대지",
];

function defaultCfg() {
    const runes = {};
    for (const name of DEFAULT_RUNES)
        runes[name] = { triggerIds: [], requireAll: false };
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
    const red = Number(
        cfg.prophetReductionByLevel?.[String(cfg.prophetLevel ?? 0)] ?? 0,
    );
    return Math.max(1, base - red);
}

async function getCfg() {
    const stored = await chrome.storage.sync.get(["cfg"]);
    return stored.cfg ?? defaultCfg();
}

async function setCfg(cfg) {
    await chrome.storage.sync.set({ cfg });
}

async function getActiveDashboardTab() {
    const tabs = await chrome.tabs.query({ url: ["https://m-inbody.info/*"] });
    return tabs[0] ?? null;
}

async function sendToDashboard(message) {
    const tab = await getActiveDashboardTab();
    if (!tab)
        return {
            ok: false,
            reason: "Dashboard tab is not open (https://m-inbody.info).",
        };
    try {
        const res = await chrome.tabs.sendMessage(tab.id, message);
        return { ok: true, res };
    } catch (_) {
        return {
            ok: false,
            reason: "Could not reach content script. Refresh dashboard and try again.",
        };
    }
}

function formatMMSS(sec) {
    if (sec == null) return "--:--";
    const s = Math.max(0, Math.floor(sec));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
}

(async function init() {
    let cfg = await getCfg();

    const runeSel = document.getElementById("rune");
    const prophetEnabled = document.getElementById("prophetEnabled");
    const prophetLevel = document.getElementById("prophetLevel");
    const effCd = document.getElementById("effCd");
    const timeEl = document.getElementById("time");
    const stateEl = document.getElementById("state");
    const toggleOverlayBtn = document.getElementById("toggleOverlay");
    const togglePipBtn = document.getElementById("togglePip");

    function getRuneNames() {
        const names = Object.keys(cfg?.runes ?? {});
        return names.length ? names : DEFAULT_RUNES;
    }

    function refreshUI() {
        const names = getRuneNames();
        runeSel.innerHTML = "";
        for (const r of names) {
            const opt = document.createElement("option");
            opt.value = r;
            opt.textContent = r;
            runeSel.appendChild(opt);
        }
        if (!names.includes(cfg.selectedRune)) cfg.selectedRune = names[0];

        runeSel.value = cfg.selectedRune;
        prophetEnabled.checked = Boolean(cfg.prophetEnabled);
        prophetLevel.value = String(cfg.prophetLevel ?? 0);
        effCd.textContent = `${calcEffectiveCooldown(cfg)}s`;
        toggleOverlayBtn.textContent = cfg.overlayAlwaysOn
            ? "Overlay ON"
            : "Overlay OFF";
    }

    async function refreshState() {
        const r = await sendToDashboard({ type: "GET_STATE" });
        if (!r.ok) {
            stateEl.textContent = `State: ${r.reason}`;
            timeEl.textContent = "--:--";
            return;
        }
        const st = r.res;
        stateEl.textContent = `State: ${st.running ? "Running" : "Idle"} / Overlay: ${st.overlayVisible ? "ON" : "OFF"} / PiP: ${st.pipActive ? "ON" : "OFF"}`;
        timeEl.textContent = formatMMSS(st.remainingSec);
    }

    refreshUI();
    await refreshState();

    runeSel.addEventListener("change", async (e) => {
        cfg.selectedRune = e.target.value;
        await setCfg(cfg);
        refreshUI();
    });

    prophetEnabled.addEventListener("change", async (e) => {
        cfg.prophetEnabled = e.target.checked;
        await setCfg(cfg);
        refreshUI();
    });

    prophetLevel.addEventListener("change", async (e) => {
        cfg.prophetLevel = Number(e.target.value);
        await setCfg(cfg);
        refreshUI();
    });

    document.getElementById("start").addEventListener("click", async () => {
        await setCfg(cfg);
        const r = await sendToDashboard({
            type: "START_TIMER",
            reason: "Manual start from popup",
        });
        if (!r.ok) stateEl.textContent = `State: ${r.reason}`;
        await refreshState();
    });

    document.getElementById("stop").addEventListener("click", async () => {
        const r = await sendToDashboard({ type: "STOP_TIMER" });
        if (!r.ok) stateEl.textContent = `State: ${r.reason}`;
        await refreshState();
    });

    toggleOverlayBtn.addEventListener("click", async () => {
        cfg.overlayAlwaysOn = !cfg.overlayAlwaysOn;
        await setCfg(cfg);
        const r = await sendToDashboard({
            type: "SET_OVERLAY_VISIBLE",
            visible: cfg.overlayAlwaysOn,
        });
        if (!r.ok) stateEl.textContent = `State: ${r.reason}`;
        refreshUI();
        await refreshState();
    });

    togglePipBtn.addEventListener("click", async () => {
        const r = await sendToDashboard({ type: "TOGGLE_PIP" });
        if (!r.ok) {
            stateEl.textContent = `State: ${r.reason}`;
            return;
        }
        if (!r.res?.ok) {
            stateEl.textContent = `State: ${r.res?.reason || "PiP toggle failed"}`;
            return;
        }
        const pipState = r.res.active ? "ON" : "OFF";
        stateEl.textContent = `State: PiP ${pipState}`;
        await refreshState();
    });

    document
        .getElementById("openOptions")
        .addEventListener("click", async () => {
            await chrome.runtime.openOptionsPage();
        });

    const ticker = setInterval(refreshState, 700);
    window.addEventListener("unload", () => clearInterval(ticker));
})();
