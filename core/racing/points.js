// ─── Scoring constants ────────────────────────────────────────────────────────

const CIRCUIT_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

const NO_HESI_DISTANCE_RATE = 0.01;   // pts per meter
const NO_HESI_SPEED_BONUS   = 0.05;   // pts per mph/kph over 100
const NO_HESI_CLEAN_BONUS   = 50;
const NO_HESI_CRASH_PENALTY = 10;

const TIER_THRESHOLDS = [
    { label: 'Champion', min: 2000 },
    { label: 'Elite',    min: 1200 },
    { label: 'Pro',      min: 500  },
    { label: 'Rookie',   min: 0    },
];

// ─── Circuit ──────────────────────────────────────────────────────────────────

function getCircuitPointsByPosition(position) {
    return CIRCUIT_POINTS[position - 1] ?? 0;
}

// ─── No Hesi ─────────────────────────────────────────────────────────────────

function calculateNoHesiPoints({ distanceMeters, crashes, topSpeed, cleanRun }) {
    const distance  = Math.max(0, Number(distanceMeters || 0));
    const speed     = Math.max(0, Number(topSpeed || 0));
    const numCrashes = Math.max(0, Number(crashes || 0));

    const distancePts = distance * NO_HESI_DISTANCE_RATE;
    const speedPts    = speed > 100 ? (speed - 100) * NO_HESI_SPEED_BONUS : 0;
    const cleanBonus  = cleanRun ? NO_HESI_CLEAN_BONUS : 0;
    const crashPen    = numCrashes * NO_HESI_CRASH_PENALTY;

    const total = Math.max(0, Math.round(distancePts + speedPts + cleanBonus - crashPen));

    return { distancePts: Math.round(distancePts), speedPts: Math.round(speedPts), cleanBonus, crashPen, total };
}

// ─── Tier ─────────────────────────────────────────────────────────────────────

function getTierFromPoints(points) {
    for (const t of TIER_THRESHOLDS) {
        if (points >= t.min) return t.label;
    }
    return 'Rookie';
}

module.exports = {
    getCircuitPointsByPosition,
    calculateNoHesiPoints,
    getTierFromPoints,
    CIRCUIT_POINTS,
    TIER_THRESHOLDS,
};
