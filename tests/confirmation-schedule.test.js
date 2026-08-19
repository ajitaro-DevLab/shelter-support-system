const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { describe, it } = require('node:test');

const source = fs.readFileSync('js/confirmation-schedule.js', 'utf8');
const windowMock = {};
vm.runInNewContext(source, { window: windowMock, Intl, Date, Number });
const { getConfirmationSchedule } = windowMock.ConfirmationSchedule;

describe('shared frontend confirmation schedule', () => {
  it('selects the previous 18:00 slot before 09:00 in Japan', () => {
    assert.deepEqual(
      JSON.parse(JSON.stringify(getConfirmationSchedule(new Date('2026-08-14T08:30:00+09:00')))),
      { currentSlot: '18:00', currentSlotLabel: '18:00', nextSlotLabel: '09:00' }
    );
  });

  it('selects the 09:00, 13:00 and 18:00 slots', () => {
    assert.equal(getConfirmationSchedule(new Date('2026-08-14T10:30:00+09:00')).currentSlot, '09:00');
    assert.equal(getConfirmationSchedule(new Date('2026-08-14T14:20:00+09:00')).currentSlot, '13:00');
    assert.deepEqual(
      JSON.parse(JSON.stringify(getConfirmationSchedule(new Date('2026-08-14T18:30:00+09:00')))),
      { currentSlot: '18:00', currentSlotLabel: '18:00', nextSlotLabel: '翌日09:00' }
    );
  });
});
