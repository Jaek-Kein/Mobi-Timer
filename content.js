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
    for (const name of DEFAULT_RUNES) {
        runes[name] = { triggerIds: [], requireAll: false };
    }
    return {
        selectedRune: DEFAULT_RUNES[0],
        baseCooldownSec: 90,
        prophetEnabled: false,
        prophetLevel: 0,
        prophetReductionByLevel: { 0: 38, 1: 39, 2: 40 },
        overlayAlwaysOn: true,
        overlayPosition: { top: 12, right: 12 },
        runes,
    };
}

function normalize(s) {
    return String(s || "")
        .replace(/\s+/g, "")
        .trim();
}

function calcEffectiveCooldown(cfg) {
    const base = Number(cfg?.baseCooldownSec ?? 90);
    if (!cfg?.prophetEnabled) return base;
    const level = String(cfg?.prophetLevel ?? 0);
    const reduction = Number(cfg?.prophetReductionByLevel?.[level] ?? 0);
    return Math.max(1, base - reduction);
}

let cfg = defaultCfg();
let running = false;
let remainingSec = null;
let endAtMs = 0;
let lastReason = "";
let lastCount = null;
let lastRowKey = "";
let overlayVisible = true;
const NO_DATA_TEXT = normalize("버프 데이터가 없습니다");
let __awakenLastAttachCheckAt = 0;
let __awakenMissingSinceMs = 0;
let __awakenDragging = false;
let __awakenDragOffsetX = 0;
let __awakenDragOffsetY = 0;

function formatMMSS(sec) {
    if (sec == null) return "--:--";
    const s = Math.max(0, Math.floor(sec));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
}

function getOrCreateOverlay() {
    let box = document.getElementById("__awaken_timer_overlay");
    if (box) return box;

    box = document.createElement("div");
    box.id = "__awaken_timer_overlay";
    box.style.position = "fixed";
    box.style.top = "12px";
    box.style.right = "12px";
    box.style.zIndex = "2147483647";
    box.style.background = "rgba(18,18,18,0.88)";
    box.style.color = "#fff";
    box.style.border = "1px solid rgba(255,255,255,0.2)";
    box.style.borderRadius = "16px";
    box.style.padding = "16px 20px";
    box.style.fontFamily =
        "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    box.style.minWidth = "232px";
    box.style.textAlign = "center";
    box.style.pointerEvents = "auto";
    box.style.cursor = "move";
    box.style.userSelect = "none";
    box.innerHTML = `
    <div id="__awaken_title" style="font-size:22px;opacity:0.75;">쿨타임</div>
    <div id="__awaken_time" style="font-size:48px;font-weight:800;line-height:1.15;">--:--</div>
    <div id="__awaken_reason" style="font-size:20px;opacity:0.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
  `;
    box.addEventListener("mousedown", onOverlayMouseDown);
    document.documentElement.appendChild(box);
    applyOverlayPosition();
    return box;
}

function clamp(n, min, max) {
    return Math.min(Math.max(n, min), max);
}

function getOverlayPosition() {
    const pos = cfg?.overlayPosition;
    if (!pos) return { top: 12, right: 12 };
    const hasLeft = Number.isFinite(Number(pos.left));
    const hasRight = Number.isFinite(Number(pos.right));
    const hasTop = Number.isFinite(Number(pos.top));
    return {
        top: hasTop ? Number(pos.top) : 12,
        left: hasLeft ? Number(pos.left) : undefined,
        right: hasRight ? Number(pos.right) : hasLeft ? undefined : 12,
    };
}

function applyOverlayPosition() {
    const box = document.getElementById("__awaken_timer_overlay");
    if (!box) return;
    const pos = getOverlayPosition();
    box.style.top = `${Math.max(0, Math.floor(pos.top))}px`;
    if (pos.left != null) {
        box.style.left = `${Math.max(0, Math.floor(pos.left))}px`;
        box.style.right = "auto";
    } else {
        box.style.right = `${Math.max(0, Math.floor(pos.right ?? 12))}px`;
        box.style.left = "auto";
    }
}

function persistOverlayPosition() {
    chrome.storage.sync.set({ cfg }).catch(() => {});
}

function onOverlayMouseDown(e) {
    if (e.button !== 0) return;
    const box = document.getElementById("__awaken_timer_overlay");
    if (!box) return;
    const rect = box.getBoundingClientRect();
    __awakenDragging = true;
    __awakenDragOffsetX = e.clientX - rect.left;
    __awakenDragOffsetY = e.clientY - rect.top;
    document.addEventListener("mousemove", onOverlayMouseMove);
    document.addEventListener("mouseup", onOverlayMouseUp);
    e.preventDefault();
}

function onOverlayMouseMove(e) {
    if (!__awakenDragging) return;
    const box = document.getElementById("__awaken_timer_overlay");
    if (!box) return;
    const maxLeft = Math.max(0, window.innerWidth - box.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - box.offsetHeight);
    const left = clamp(e.clientX - __awakenDragOffsetX, 0, maxLeft);
    const top = clamp(e.clientY - __awakenDragOffsetY, 0, maxTop);

    cfg.overlayPosition = { top, left };
    applyOverlayPosition();
}

function onOverlayMouseUp() {
    if (!__awakenDragging) return;
    __awakenDragging = false;
    document.removeEventListener("mousemove", onOverlayMouseMove);
    document.removeEventListener("mouseup", onOverlayMouseUp);
    persistOverlayPosition();
}

function renderOverlay() {
    const box = getOrCreateOverlay();
    box.style.display = overlayVisible ? "block" : "none";

    const timeEl = document.getElementById("__awaken_time");
    const reasonEl = document.getElementById("__awaken_reason");
    if (timeEl) timeEl.textContent = formatMMSS(remainingSec);
    if (reasonEl) reasonEl.textContent = running ? lastReason : "";
}

function startTimer(reason = "Count increased") {
    const cd = calcEffectiveCooldown(cfg);
    running = true;
    remainingSec = cd;
    endAtMs = Date.now() + cd * 1000;
    lastReason = reason;
    renderOverlay();
}

function stopTimer() {
    running = false;
    remainingSec = null;
    endAtMs = 0;
    lastReason = "";
    renderOverlay();
}

function setOverlayVisible(visible) {
    overlayVisible = Boolean(visible);
    renderOverlay();
}

function findRuneRow(runeName) {
    const target = normalize(runeName);
    if (!target) return null;

    for (const tr of document.querySelectorAll("tr")) {
        const txt = normalize(tr.textContent);
        if (!txt) continue;
        if (txt.includes(NO_DATA_TEXT)) continue;
        if (txt.includes(target)) return tr;
    }
    return null;
}

function parseNumericText(text) {
    const raw = String(text || "").trim();
    if (!raw) return null;
    const match = raw.match(/-?\d[\d,]*/);
    if (!match) return null;
    const value = Number(match[0].replace(/,/g, ""));
    return Number.isFinite(value) ? value : null;
}

function findCountCell(tr) {
    const tds = Array.from(tr.querySelectorAll("td"));
    if (tds.length >= 2) {
        const countCell = tds[1];
        if (parseNumericText(countCell.textContent) != null) return countCell;
    }

    const nums = tds.filter((td) => parseNumericText(td.textContent) != null);
    return nums.length ? nums[0] : null;
}

function readSelectedRuneCount() {
    if (!cfg?.selectedRune) return null;
    const tr = findRuneRow(cfg.selectedRune);
    if (!tr) return null;
    const cell = findCountCell(tr);
    if (!cell) return null;

    const value = parseNumericText(cell.textContent);
    if (value == null) return null;

    return { tr, cell, value };
}

function evaluateSelectedRune(reasonPrefix = "Count") {
    const snapshot = readSelectedRuneCount();
    if (!snapshot) {
        if (!__awakenMissingSinceMs) __awakenMissingSinceMs = Date.now();
        if (Date.now() - __awakenMissingSinceMs >= 1000) {
            lastCount = null;
            __awakenDisconnectCellObserver();
        }
        return;
    }
    __awakenMissingSinceMs = 0;

    const { cell, value } = snapshot;
    __awakenAttachCellObserver(cell);

    if (lastCount == null) {
        lastCount = value;
        if (value > 0) startTimer("각성 활성화(" + value + ")");
        return;
    }

    if (value > lastCount) {
        const prev = lastCount;
        const isRetrigger = running;
        lastCount = value;
        const delta = value - prev;
        startTimer(
            (isRetrigger ? "각성 활성화" : reasonPrefix) +
                " (" +
                value +
                ")"
        );
        return;
    }

    if (value < lastCount) lastCount = value;
}

let __awakenRootObserver = null;
let __awakenCellObserver = null;
let __awakenWatchingCell = null;

function __awakenDisconnectCellObserver() {
    if (__awakenCellObserver) {
        try {
            __awakenCellObserver.disconnect();
        } catch (_) {}
    }
    __awakenCellObserver = null;
    __awakenWatchingCell = null;
}

function __awakenDisconnectRootObserver() {
    if (__awakenRootObserver) {
        try {
            __awakenRootObserver.disconnect();
        } catch (_) {}
    }
    __awakenRootObserver = null;
}

function __awakenAttachCellObserver(cell) {
    if (!cell || cell === __awakenWatchingCell) return;

    __awakenDisconnectCellObserver();
    __awakenWatchingCell = cell;

    __awakenCellObserver = new MutationObserver(() => {
        evaluateSelectedRune("Count");
    });

    __awakenCellObserver.observe(cell, {
        characterData: true,
        subtree: true,
        childList: true,
    });
}

function __awakenTryAttachSelectedRune() {
    if (!cfg?.selectedRune) return;

    const rowKey = normalize(cfg.selectedRune);
    if (rowKey !== lastRowKey) {
        lastRowKey = rowKey;
        lastCount = null;
        __awakenDisconnectCellObserver();
    }

    evaluateSelectedRune("Count");
}

function __awakenStartRootObserver() {
    __awakenDisconnectRootObserver();

    __awakenRootObserver = new MutationObserver((mutations) => {
        if (!mutations || mutations.length === 0) return;
        __awakenTryAttachSelectedRune();
    });

    __awakenRootObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
    });
}
async function loadCfg() {
    const stored = await chrome.storage.sync.get(["cfg"]);
    cfg = stored.cfg ?? defaultCfg();
    setOverlayVisible(cfg.overlayAlwaysOn ?? true);
    applyOverlayPosition();
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes.cfg) return;
    cfg = changes.cfg.newValue ?? defaultCfg();
    setOverlayVisible(cfg.overlayAlwaysOn ?? true);
    applyOverlayPosition();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
        if (message?.type === "GET_STATE") {
            sendResponse({ running, remainingSec, overlayVisible });
            return;
        }

        if (message?.type === "START_TIMER") {
            startTimer(message.reason || "Manual start");
            sendResponse({ ok: true });
            return;
        }

        if (message?.type === "STOP_TIMER") {
            stopTimer();
            sendResponse({ ok: true });
            return;
        }

        if (message?.type === "SET_OVERLAY_VISIBLE") {
            setOverlayVisible(Boolean(message.visible));
            sendResponse({ ok: true });
            return;
        }

        sendResponse({ ok: false, reason: "Unknown message" });
    } catch (err) {
        sendResponse({ ok: false, reason: String(err) });
    }
});

setInterval(() => {
    if (__awakenWatchingCell && !__awakenWatchingCell.isConnected) {
        __awakenDisconnectCellObserver();
        __awakenTryAttachSelectedRune();
    }

    const now = Date.now();
    if (now - __awakenLastAttachCheckAt >= 1000) {
        __awakenLastAttachCheckAt = now;
        __awakenTryAttachSelectedRune();
    }

    if (running) {
        const next = Math.max(0, Math.ceil((endAtMs - Date.now()) / 1000));
        remainingSec = next;
        if (next <= 0) stopTimer();
    }
    renderOverlay();
}, 250);

(async () => {
    await loadCfg();
    renderOverlay();

    __awakenTryAttachSelectedRune();
    __awakenStartRootObserver();
})();

