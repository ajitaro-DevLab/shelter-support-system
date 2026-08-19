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
  console, Intl, Date
};
vm.runInNewContext(fs.readFileSync('js/event-store.js', 'utf8'), context);
const store = windowMock.EventStore;
const shelterId = 'shelter-002';
const at = (hour, minute) => new Date(2026, 7, 7, hour, minute);

assert.throws(() => store.recordSupplyReceipt({ shelterId, item: '飲料水', quantity: 0, unit: 'ケース' }), /0より大きい整数/);
assert.throws(() => store.recordSupplyReceipt({ shelterId, item: '飲料水', quantity: 1.5, unit: 'ケース' }), /0より大きい整数/);
assert.throws(() => store.recordFacilityIssue({ shelterId, category: '', severity: 'caution' }), /カテゴリ/);
assert.throws(() => store.recordNotice({ shelterId, title: '給水', startTime: '', location: '体育館', message: '給水', isPublic: true }), /開始時刻/);

let currentTotal = 86;
let confirmation = store.recordScheduledConfirmation({ shelterId, currentTotal, mode: 'correction', value: 93, confirmedAt: at(9, 0) });
currentTotal = confirmation.evacueesTotal;
currentTotal = store.recordEvacueeArrival({ shelterId, currentTotal, delta: 5, occurredAt: at(9, 40) }).evacueesTotal;
store.recordSupplyReceipt({ shelterId, item: '飲料水', quantity: 10, unit: 'ケース', occurredAt: at(10, 20) });
store.recordFacilityIssue({ shelterId, category: 'トイレ', severity: 'caution', occurredAt: at(11, 15) });
store.recordNotice({ shelterId, title: '給水', startTime: '14:00', location: '体育館東側', message: '14:00より給水を開始します', isPublic: true, occurredAt: at(12, 0) });
confirmation = store.recordScheduledConfirmation({ shelterId, currentTotal, mode: 'unchanged', confirmedAt: at(13, 0) });
currentTotal = confirmation.evacueesTotal;
store.recordFacilityIssue({ shelterId, category: 'ごみ・衛生', severity: 'urgent', occurredAt: at(15, 30) });
store.recordSupplyReceipt({ shelterId, item: '毛布', quantity: 20, unit: '枚', occurredAt: at(17, 20) });
confirmation = store.recordScheduledConfirmation({ shelterId, currentTotal, mode: 'correction', value: 96, confirmedAt: at(18, 0) });
currentTotal = confirmation.evacueesTotal;

assert.equal(currentTotal, 96);
assert.equal(store.getOfficialConfirmation(shelterId).officialTotal, 96);
assert.equal(store.getOfficialConfirmation(shelterId).confirmationSlot, '2026-08-07 18:00');
assert.equal(store.getAllEvents().length, 9);
assert.ok(store.getAllEvents().every((event) => event.eventType && event.shelterId && event.occurredAt && event.updatedBy && event.payload && event.status));
assert.equal(store.getLatestSupplyReceipts(shelterId).length, 2);
assert.equal(store.getLatestSupplyReceipts(shelterId).find((item) => item.item === '飲料水').quantity, 10);
assert.equal(store.getLatestSupplyReceipts(shelterId).find((item) => item.item === '毛布').quantity, 20);
assert.equal(store.getFacilityIssues(shelterId).find((item) => item.category === 'トイレ').severity, 'caution');
assert.equal(store.getFacilityIssues(shelterId).find((item) => item.category === 'ごみ・衛生').severity, 'urgent');
assert.equal(store.getPublicNotices(shelterId).length, 1);

store.recordNotice({ shelterId, title: '調整中', startTime: '16:00', location: '未定', message: '調整中です', isPublic: false, occurredAt: at(12, 5) });
assert.equal(store.getPublicNotices(shelterId).length, 1);
assert.equal(store.getAllEvents().length, 10);

const baseHistory = [{ shelterId, lastUpdatedBy: '山田', history: [{ time: '08:00', user: '山田', action: '開設' }] }];
const displayedHistory = store.applyHistoryUpdates(baseHistory)[0].history;
assert.equal(displayedHistory.length, 3);
assert.ok(JSON.parse(storage.get('shelter-event-updates-v1')).history[shelterId].length >= 10);

store.resetTestData();
assert.equal(store.getAllEvents().length, 0);
assert.equal(store.getOfficialConfirmation(shelterId), null);

console.log('V1 day scenario tests: PASS');
