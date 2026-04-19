'use strict';

const hud = document.getElementById('hud');
const comboShell = document.getElementById('comboShell');
const comboValueEl = document.getElementById('comboValue');
const multiplierValueEl = document.getElementById('multiplierValue');
const timerValueEl = document.getElementById('timerValue');
const rankValueEl = document.getElementById('rankValue');
const proBadgeEl = document.getElementById('proBadge');
const xpFillEl = document.getElementById('xpFill');
const xpPercentTextEl = document.getElementById('xpPercentText');
const xpGainEl = document.getElementById('xpGain');
const speedValueEl = document.getElementById('speedValue');
const rpmFillEl = document.getElementById('rpmFill');
const gearValueEl = document.getElementById('gearValue');
const driftPointsEl = document.getElementById('driftPoints');
const tapLabelEl = document.getElementById('tapLabel');
const tapDotsWrapEl = document.getElementById('tapDots');
const tapDotEls = Array.from(document.querySelectorAll('.tap-dot'));
const vignetteEl = document.getElementById('vignette');
const toast = document.getElementById('announceToast');
const audio = document.getElementById('audioPlayer');

let toastTimer = null;
let progressTimer = null;
let xpGainTimer = null;
let tapFlashTimer = null;
let vignetteTimer = null;

const state = {
    combo: 0,
    multiplier: 1,
    timer: 0,
    xpPercent: 0,
    rank: 'CERTIFIED',
    isPro: false,
    speed: 0,
    rpm: 0,
    rpmMax: 9000,
    gear: 'N',
    driftPoints: 0,
    tapsUsed: 0,
    tapsMax: 3,
};

const tweenState = {
    combo: 0,
    multiplier: 1,
    speed: 0,
    driftPoints: 0,
};

const tweenTargets = {
    combo: 0,
    multiplier: 1,
    speed: 0,
    driftPoints: 0,
};

let tweenRaf = 0;

function resourceName() {
    return (typeof GetParentResourceName !== 'undefined') ? GetParentResourceName() : 'midnight-music';
}

function nuiPost(eventName, data) {
    fetch(`https://${resourceName()}/${eventName}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data || {}),
    }).catch(() => {});
}

function setHudVisible(visible) {
    hud.classList.toggle('hidden', !visible);
}

function setPosition(pos) {
    if (pos === 'bottom-left') {
        document.querySelector('.left-side').style.left = '22px';
        document.querySelector('.right-side').style.right = 'auto';
        document.querySelector('.right-side').style.left = 'calc(100vw - 272px)';
    }
}

function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 3800);
}

function startProgress() {
    clearInterval(progressTimer);
    if (!audio.duration || isNaN(audio.duration)) return;
    const dur = audio.duration;
    progressTimer = setInterval(() => {
        const pct = Math.min(100, (audio.currentTime / dur) * 100);
        if (pct >= 99.5) {
            clearInterval(progressTimer);
        }
    }, 1000);
}

function formatTimer(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds || 0));
    const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
    const secs = String(seconds % 60).padStart(2, '0');
    return `${mins}:${secs}`;
}

function animateNumber(key, decimals) {
    const current = tweenState[key];
    const target = tweenTargets[key];
    const delta = target - current;
    if (Math.abs(delta) < 0.001) {
        tweenState[key] = target;
        return false;
    }

    const step = delta * 0.22;
    tweenState[key] = current + step;
    if (Math.abs(target - tweenState[key]) < 0.01) {
        tweenState[key] = target;
    }

    if (key === 'combo') {
        comboValueEl.textContent = Math.max(0, Math.round(tweenState.combo)).toLocaleString('en-US');
    } else if (key === 'multiplier') {
        multiplierValueEl.textContent = `x${Math.max(1, tweenState.multiplier).toFixed(decimals || 1)}`;
    } else if (key === 'speed') {
        speedValueEl.textContent = `${Math.max(0, Math.round(tweenState.speed))} MPH`;
    } else if (key === 'driftPoints') {
        const points = Math.max(0, Math.round(tweenState.driftPoints));
        driftPointsEl.textContent = `+${points.toLocaleString('en-US')}`;
    }

    return true;
}

function tickTweens() {
    const active =
        animateNumber('combo', 0) |
        animateNumber('multiplier', 1) |
        animateNumber('speed', 0) |
        animateNumber('driftPoints', 0);

    if (active) {
        tweenRaf = requestAnimationFrame(tickTweens);
    } else {
        tweenRaf = 0;
    }
}

function queueTween(key, value) {
    tweenTargets[key] = Number.isFinite(value) ? value : 0;
    if (!tweenRaf) {
        tweenRaf = requestAnimationFrame(tickTweens);
    }
}

function updateComboVisuals() {
    comboShell.classList.remove('high', 'extreme', 'maxed');
    if (state.multiplier >= 40) {
        comboShell.classList.add('maxed');
    } else if (state.multiplier >= 25) {
        comboShell.classList.add('extreme');
    } else if (state.combo >= 10000 || state.multiplier >= 12) {
        comboShell.classList.add('high');
    }
}

function bumpMultiplier() {
    multiplierValueEl.classList.remove('bump');
    requestAnimationFrame(() => multiplierValueEl.classList.add('bump'));
    setTimeout(() => multiplierValueEl.classList.remove('bump'), 250);
}

function updateXp(xpPercent, xpGain) {
    const clamped = Math.max(0, Math.min(100, Math.round(xpPercent || 0)));
    state.xpPercent = clamped;
    xpFillEl.style.width = `${clamped}%`;
    xpPercentTextEl.textContent = `${clamped}%`;

    if (typeof xpGain === 'number' && xpGain > 0) {
        xpGainEl.textContent = `+${Math.round(xpGain)} XP`;
        xpGainEl.classList.remove('hidden', 'show');
        clearTimeout(xpGainTimer);
        requestAnimationFrame(() => xpGainEl.classList.add('show'));
        xpGainTimer = setTimeout(() => {
            xpGainEl.classList.remove('show');
            xpGainEl.classList.add('hidden');
        }, 980);
    }
}

function updateRank(rank, isPro) {
    state.rank = rank || state.rank;
    state.isPro = !!isPro;
    rankValueEl.textContent = state.rank;
    rankValueEl.classList.toggle('pro', state.isPro);
    proBadgeEl.classList.toggle('hidden', !state.isPro);
}

function updateSpeedCluster(speed, rpm, rpmMax, gear) {
    state.speed = Math.max(0, speed || 0);
    state.rpm = Math.max(0, rpm || 0);
    state.rpmMax = Math.max(1, rpmMax || state.rpmMax || 9000);
    state.gear = (gear === 0 || gear === '0') ? 'R' : String(gear || 'N');

    queueTween('speed', state.speed);

    const speedRounded = Math.round(state.speed);
    speedValueEl.classList.remove('fast', 'max');
    if (speedRounded >= 160) {
        speedValueEl.classList.add('max');
    } else if (speedRounded >= 120) {
        speedValueEl.classList.add('fast');
    }

    const rpmPct = Math.max(0, Math.min(100, (state.rpm / state.rpmMax) * 100));
    rpmFillEl.style.width = `${rpmPct}%`;
    if (rpmPct >= 96) {
        rpmFillEl.classList.add('redline');
        setTimeout(() => rpmFillEl.classList.remove('redline'), 210);
    }

    gearValueEl.textContent = state.gear;
}

function updateDriftPoints(points) {
    state.driftPoints = Math.max(0, points || 0);
    queueTween('driftPoints', state.driftPoints);
    driftPointsEl.classList.add('show');
    setTimeout(() => driftPointsEl.classList.remove('show'), 460);
}

function updateTaps(tapsUsed, tapsMax, tapHit) {
    state.tapsUsed = Math.max(0, Math.floor(tapsUsed || 0));
    state.tapsMax = Math.max(1, Math.floor(tapsMax || 3));

    hud.classList.remove('tap-state-1', 'tap-state-2', 'tap-state-3', 'tap-hit');
    if (state.tapsUsed >= 3) {
        hud.classList.add('tap-state-3');
    } else if (state.tapsUsed === 2) {
        hud.classList.add('tap-state-2');
    } else if (state.tapsUsed === 1) {
        hud.classList.add('tap-state-1');
    }

    tapLabelEl.textContent = `TAPS:`;
    tapDotEls.forEach((dot, index) => {
        dot.classList.toggle('used', index < state.tapsUsed);
        dot.style.opacity = index < state.tapsMax ? '1' : '0.2';
    });

    if (tapHit) {
        clearTimeout(tapFlashTimer);
        clearTimeout(vignetteTimer);
        hud.classList.add('tap-hit', 'tap-shake');
        vignetteEl.classList.add('show');
        tapFlashTimer = setTimeout(() => {
            hud.classList.remove('tap-hit', 'tap-shake');
        }, 240);
        vignetteTimer = setTimeout(() => {
            vignetteEl.classList.remove('show');
        }, 160);
    }
}

function updateCombo(combo, multiplier, timer) {
    const prevMultiplier = state.multiplier;
    state.combo = Math.max(0, combo || 0);
    state.multiplier = Math.max(1, multiplier || 1);
    state.timer = Math.max(0, timer || 0);

    queueTween('combo', state.combo);
    queueTween('multiplier', state.multiplier);
    timerValueEl.textContent = formatTimer(state.timer);
    updateComboVisuals();

    if (state.multiplier > prevMultiplier) {
        bumpMultiplier();
    }
}

function hydrateFromMessage(msg) {
    if (!msg) return;
    if (typeof msg.combo === 'number' || typeof msg.multiplier === 'number' || typeof msg.timer === 'number') {
        updateCombo(msg.combo ?? state.combo, msg.multiplier ?? state.multiplier, msg.timer ?? state.timer);
    }
    if (typeof msg.xpPercent === 'number' || typeof msg.xpGain === 'number') {
        updateXp(msg.xpPercent ?? state.xpPercent, msg.xpGain);
    }
    if (typeof msg.rank === 'string' || typeof msg.isPro === 'boolean') {
        updateRank(msg.rank ?? state.rank, msg.isPro ?? state.isPro);
    }
    if (typeof msg.speed === 'number' || typeof msg.rpm === 'number' || typeof msg.gear !== 'undefined') {
        updateSpeedCluster(msg.speed ?? state.speed, msg.rpm ?? state.rpm, msg.rpmMax ?? state.rpmMax, msg.gear ?? state.gear);
    }
    if (typeof msg.driftPoints === 'number') {
        updateDriftPoints(msg.driftPoints);
    }
    if (typeof msg.tapsUsed === 'number' || typeof msg.tapsMax === 'number' || msg.tapHit) {
        updateTaps(msg.tapsUsed ?? state.tapsUsed, msg.tapsMax ?? state.tapsMax, !!msg.tapHit);
    }
}

audio.addEventListener('ended',        () => nuiPost('trackEnded', {}));
audio.addEventListener('loadedmetadata', startProgress);
audio.addEventListener('play',          startProgress);
audio.addEventListener('error', (e) => {
    console.warn('[midnight-music] Audio error:', e.message || 'unknown');
    setTimeout(() => nuiPost('trackEnded', {}), 2000);
});

window.addEventListener('message', (e) => {
    const msg = e.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {

        case 'INIT':
            setHudVisible(msg.enabled !== false);
            if (msg.position) setPosition(msg.position);
            hydrateFromMessage(msg);
            break;

        case 'PLAY':
            if (msg.url && msg.url !== '') {
                audio.volume = 0;
                audio.src    = msg.url;
                audio.play().then(() => {
                    const target = Math.max(0, Math.min(1, msg.volume ?? 0.45));
                    let vol = 0;
                    const ramp = setInterval(() => {
                        vol = Math.min(target, vol + 0.04);
                        audio.volume = vol;
                        if (vol >= target) clearInterval(ramp);
                    }, 80);
                }).catch(() => {});
            }
            break;

        case 'STOP':
            audio.pause();
            audio.src = '';
            clearInterval(progressTimer);
            break;

        case 'SET_VOLUME':
            audio.volume = Math.max(0, Math.min(1, msg.volume ?? 0.45));
            break;

        case 'SET_TRACK':
            setHudVisible(msg.enabled !== false);
            if (msg.message) showToast(msg.message);
            break;

        case 'SET_ENABLED':
            setHudVisible(msg.enabled !== false);
            break;

        case 'SET_HUD_VISIBLE':
            setHudVisible(msg.visible !== false);
            break;

        case 'ANNOUNCE':
            if (msg.message) showToast(msg.message);
            break;

        case 'HUD_UPDATE':
            hydrateFromMessage(msg);
            break;

        case 'HUD_TAP':
            updateTaps(msg.tapsUsed ?? state.tapsUsed, msg.tapsMax ?? state.tapsMax, true);
            break;

        case 'HUD_XP_GAIN':
            updateXp(msg.xpPercent ?? state.xpPercent, msg.xpGain ?? 0);
            break;

        case 'HUD_RESET':
            updateCombo(0, 1, 0);
            updateSpeedCluster(0, 0, state.rpmMax, 'N');
            updateDriftPoints(0);
            updateTaps(0, 3, false);
            updateXp(0, 0);
            updateRank('CERTIFIED', false);
            break;
    }
});

updateCombo(0, 1, 0);
updateXp(0, 0);
updateSpeedCluster(0, 0, 9000, 'N');
updateDriftPoints(0);
updateTaps(0, 3, false);

nuiPost('nuiReady', {});
