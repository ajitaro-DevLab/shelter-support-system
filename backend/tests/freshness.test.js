import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getFreshness } from '../src/domain/freshness.js';

const NOW = new Date('2026-08-14T14:00:00+09:00');

describe('HQ freshness', () => {
  it('treats a missing formal confirmation as black and delayed', () => {
    assert.deepEqual(getFreshness(null, NOW), {
      level: 'black',
      elapsedMinutes: null,
      display: '未確認',
      delayed: true
    });
  });

  it('applies all boundary values from the HQ display rules', () => {
    const cases = [
      [30, 'green', false],
      [31, 'yellow', true],
      [120, 'yellow', true],
      [121, 'orange', true],
      [360, 'orange', true],
      [361, 'black', true]
    ];

    for (const [minutes, level, delayed] of cases) {
      const confirmedAt = new Date(NOW.getTime() - minutes * 60 * 1000);
      const freshness = getFreshness(confirmedAt, NOW);
      assert.equal(freshness.level, level);
      assert.equal(freshness.elapsedMinutes, minutes);
      assert.equal(freshness.delayed, delayed);
    }
  });

  it('returns a readable elapsed-time label', () => {
    assert.equal(getFreshness('2026-08-14T13:55:00+09:00', NOW).display, '5分前');
    assert.equal(getFreshness('2026-08-14T12:00:00+09:00', NOW).display, '2時間前');
    assert.equal(getFreshness('2026-08-13T14:00:00+09:00', NOW).display, '1日前');
  });
});
