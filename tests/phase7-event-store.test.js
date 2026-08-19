const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const storage = new Map();
const windowMock = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key)
  },
  addEventListener: () => {},
  dispatchEvent: () => {}
};
const context = {
  window: windowMock,
  CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
  console,
  Intl,
  Date
};
vm.runInNewContext(fs.readFileSync('js/event-store.js', 'utf8'), context);
const store = windowMock.EventStore;

assert.deepEqual(
  JSON.parse(JSON.stringify(store.getConfirmationSchedule(new Date(2026, 7, 7, 10, 30)))),
  {
    currentSlot: '2026-08-07 09:00', currentSlotLabel: '09:00',
    nextSlot: '2026-08-07 13:00', nextSlotLabel: '13:00'
  }
);
assert.equal(store.getConfirmationSchedule(new Date(2026, 7, 7, 14, 20)).currentSlotLabel, '13:00');
assert.equal(store.getConfirmationSchedule(new Date(2026, 7, 7, 14, 20)).nextSlotLabel, '18:00');
assert.equal(store.getConfirmationSchedule(new Date(2026, 7, 7, 18, 30)).currentSlotLabel, '18:00');
assert.equal(store.getConfirmationSchedule(new Date(2026, 7, 7, 18, 30)).nextSlotLabel, '翌日09:00');

const shelterId = 'shelter-test';
let result = store.recordScheduledConfirmation({
  shelterId, currentTotal: 10, mode: 'unchanged', confirmedAt: new Date(2026, 7, 7, 13, 2)
});
assert.equal(result.evacueesTotal, 10);
assert.equal(result.officialConfirmation.officialTotal, 10);

result = store.recordScheduledConfirmation({
  shelterId, currentTotal: 10, mode: 'delta', value: 5, confirmedAt: new Date(2026, 7, 7, 13, 3)
});
assert.equal(result.evacueesTotal, 15);

result = store.recordScheduledConfirmation({
  shelterId, currentTotal: 15, mode: 'delta', value: -5, confirmedAt: new Date(2026, 7, 7, 13, 4)
});
assert.equal(result.evacueesTotal, 10);

result = store.recordScheduledConfirmation({
  shelterId, currentTotal: 10, mode: 'correction', value: 12, confirmedAt: new Date(2026, 7, 7, 13, 5)
});
assert.equal(result.evacueesTotal, 12);
assert.equal(result.officialConfirmation.lastUpdatedBy, 'user_demo');
assert.equal(result.history.length, 4);

assert.throws(() => store.recordScheduledConfirmation({ shelterId, currentTotal: 12, mode: 'correction', value: 2.5 }), /整数/);
assert.throws(() => store.recordScheduledConfirmation({ shelterId, currentTotal: 12, mode: 'correction', value: -1 }), /0以上/);
assert.throws(() => store.recordScheduledConfirmation({ shelterId, currentTotal: 0, mode: 'delta', value: -1 }), /0人未満/);

store.recordEvacueeArrival({ shelterId, currentTotal: 12, delta: 1 });
const applied = store.applyShelterUpdates([{ id: shelterId, updatedAt: '2026-08-07 12:00', evacuees: { total: 10 } }])[0];
assert.equal(applied.evacuees.total, 13);
assert.equal(applied.officialConfirmation.officialTotal, 12);
assert.equal(store.getAllEvents().length, 5);

const saved = JSON.parse(storage.get('shelter-event-updates-v1'));
assert.equal(saved.confirmations[shelterId].officialTotal, 12);
assert.equal(saved.confirmations[shelterId].confirmationSlot, '2026-08-07 13:00');
assert.equal(saved.confirmations[shelterId].lastUpdatedBy, 'user_demo');

console.log('phase7 EventStore tests: PASS');
