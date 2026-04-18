const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getCircuitPointsByPosition, calculateNoHesiPoints, getTierFromPoints } = require('./points');

describe('Circuit points', () => {
    it('maps positions 1-5 correctly', () => {
        assert.equal(getCircuitPointsByPosition(1), 25);
        assert.equal(getCircuitPointsByPosition(2), 18);
        assert.equal(getCircuitPointsByPosition(3), 15);
        assert.equal(getCircuitPointsByPosition(5), 10);
    });
    it('returns 0 for position beyond top 10', () => {
        assert.equal(getCircuitPointsByPosition(11), 0);
    });
});

describe('No Hesi scoring', () => {
    it('awards distance + speed + clean bonus', () => {
        const r = calculateNoHesiPoints({ distanceMeters: 1000, crashes: 0, topSpeed: 150, cleanRun: true });
        assert.equal(r.distancePts, 10);   // 1000 * 0.01
        assert.equal(r.speedPts,    3);    // (150-100)*0.05
        assert.equal(r.cleanBonus,  50);
        assert.equal(r.crashPen,    0);
        assert.equal(r.total,       63);
    });
    it('applies crash penalties', () => {
        const r = calculateNoHesiPoints({ distanceMeters: 0, crashes: 3, topSpeed: 0, cleanRun: false });
        assert.equal(r.total, 0);          // clamped to 0
    });
});

describe('Tier mapping', () => {
    it('maps thresholds correctly', () => {
        assert.equal(getTierFromPoints(0),    'Rookie');
        assert.equal(getTierFromPoints(499),  'Rookie');
        assert.equal(getTierFromPoints(500),  'Pro');
        assert.equal(getTierFromPoints(1200), 'Elite');
        assert.equal(getTierFromPoints(2000), 'Champion');
    });
});
