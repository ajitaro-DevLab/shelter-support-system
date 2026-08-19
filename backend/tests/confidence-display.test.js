import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getDisplayConfidence } from '../src/domain/confidence-display.js';

describe('confidence display evaluation', () => {
  it('returns confirmed for a formal confirmation in the current slot', () => {
    assert.equal(getDisplayConfidence({
      confidence: 'confirmed',
      confirmationSlot: '13:00',
      confirmedAt: '2026-08-14T13:02:00+09:00'
    }, new Date('2026-08-14T14:00:00+09:00')), 'confirmed');
  });

  it('returns estimated after a visitor change in the current confirmed slot', () => {
    assert.equal(getDisplayConfidence({
      confidence: 'estimated',
      confirmationSlot: '13:00',
      confirmedAt: '2026-08-14T13:02:00+09:00'
    }, new Date('2026-08-14T14:20:00+09:00')), 'estimated');
  });

  it('returns unconfirmed after entering a new unconfirmed slot', () => {
    assert.equal(getDisplayConfidence({
      confidence: 'confirmed',
      confirmationSlot: '09:00',
      confirmedAt: '2026-08-14T09:02:00+09:00'
    }, new Date('2026-08-14T14:00:00+09:00')), 'unconfirmed');
  });

  it('distinguishes the previous-day 18:00 slot before 09:00', () => {
    const now = new Date('2026-08-14T08:30:00+09:00');
    assert.equal(getDisplayConfidence({
      confidence: 'confirmed',
      confirmationSlot: '18:00',
      confirmedAt: '2026-08-13T18:02:00+09:00'
    }, now), 'confirmed');
    assert.equal(getDisplayConfidence({
      confidence: 'confirmed',
      confirmationSlot: '18:00',
      confirmedAt: '2026-08-12T18:02:00+09:00'
    }, now), 'unconfirmed');
  });

  it('accepts a late confirmation before 09:00 for the current previous-day 18:00 slot', () => {
    assert.equal(getDisplayConfidence({
      confidence: 'confirmed',
      confirmationSlot: '18:00',
      confirmedAt: '2026-08-14T08:30:00+09:00'
    }, new Date('2026-08-14T08:31:00+09:00')), 'confirmed');
  });

  it('returns unconfirmed when no formal confirmation exists', () => {
    assert.equal(getDisplayConfidence({
      confidence: 'estimated',
      confirmationSlot: null,
      confirmedAt: null
    }, new Date('2026-08-14T10:00:00+09:00')), 'unconfirmed');
  });
});
