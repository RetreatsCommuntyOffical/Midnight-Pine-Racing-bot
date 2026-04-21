'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { __test } = require('./dailyDigestService');

test('quoteForDateKey is deterministic for a given day key', () => {
    const one = __test.quoteForDateKey('2026-04-20');
    const two = __test.quoteForDateKey('2026-04-20');
    assert.equal(one, two);
    assert.equal(typeof one, 'string');
    assert.ok(one.length > 0);
});

test('normalizeTimeZone falls back to UTC for invalid values', () => {
    assert.equal(__test.normalizeTimeZone('America/Chicago'), 'America/Chicago');
    assert.equal(__test.normalizeTimeZone('not-a-real-timezone'), 'UTC');
});

test('isAfterDailyPostTime compares hour and minute correctly', () => {
    assert.equal(__test.isAfterDailyPostTime({ hour: 8, minute: 59 }, 9, 0), false);
    assert.equal(__test.isAfterDailyPostTime({ hour: 9, minute: 0 }, 9, 0), true);
    assert.equal(__test.isAfterDailyPostTime({ hour: 9, minute: 30 }, 9, 0), true);
});

test('parseBoolean handles common truthy and falsy values', () => {
    assert.equal(__test.parseBoolean('true', false), true);
    assert.equal(__test.parseBoolean('1', false), true);
    assert.equal(__test.parseBoolean('yes', false), true);
    assert.equal(__test.parseBoolean('false', true), false);
    assert.equal(__test.parseBoolean('0', true), false);
    assert.equal(__test.parseBoolean('', true), true);
});
