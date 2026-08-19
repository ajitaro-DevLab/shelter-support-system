const assert = require('node:assert/strict');
const fs = require('node:fs');
const { describe, it } = require('node:test');

const DemoContext = require('../js/demo-context.js');

const shelters = [
  ['shelter-001', 'I市防災センター'],
  ['shelter-002', 'I市立Alpha中学校'],
  ['shelter-003', 'I市立Beta小学校'],
  ['shelter-004', 'I市立Gamma小学校'],
  ['shelter-005', 'I市立Delta中学校']
].map(([id, name]) => ({ id, name }));

function createStorage(initialValue) {
  const values = new Map();
  if (initialValue !== undefined) {
    values.set(DemoContext.STORAGE_KEY, initialValue);
  }
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    value: (key) => values.get(key)
  };
}

describe('DemoContext terminal settings', () => {
  it('saves and restores only the selected shelter and seeded user IDs', () => {
    const storage = createStorage();
    const saved = DemoContext.saveDemoContext({
      shelterId: 'shelter-002',
      userId: 'demo-user-01',
      currentCount: 999,
      status: 'red',
      confidence: 'confirmed',
      events: [{ eventType: 'invalid' }],
      notices: [{ title: 'invalid' }]
    }, shelters, storage);

    assert.deepEqual(saved, { shelterId: 'shelter-002', userId: 'demo-user-01' });
    assert.deepEqual(
      JSON.parse(storage.value(DemoContext.STORAGE_KEY)),
      { shelterId: 'shelter-002', userId: 'demo-user-01' }
    );
    assert.deepEqual(DemoContext.getDemoContext(storage), saved);
    assert.equal(DemoContext.isDemoContextConfigured(saved, shelters), true);
  });

  it('persists a changed shelter selection and supports clearing settings', () => {
    const storage = createStorage();
    DemoContext.saveDemoContext({ shelterId: 'shelter-002', userId: 'demo-user-01' }, shelters, storage);
    DemoContext.saveDemoContext({ shelterId: 'shelter-004', userId: 'demo-user-01' }, shelters, storage);

    assert.equal(DemoContext.getDemoContext(storage).shelterId, 'shelter-004');
    DemoContext.clearDemoContext(storage);
    assert.deepEqual(DemoContext.getDemoContextState(storage), { status: 'missing', context: null });
  });

  it('rejects shelters and users outside the API and seed allowlists', () => {
    const storage = createStorage();
    assert.throws(
      () => DemoContext.saveDemoContext({ shelterId: 'invalid-shelter', userId: 'demo-user-01' }, shelters, storage),
      /有効な避難所と利用者/
    );
    assert.throws(
      () => DemoContext.saveDemoContext({ shelterId: 'shelter-002', userId: 'invalid-user' }, shelters, storage),
      /有効な避難所と利用者/
    );
    assert.equal(storage.getItem(DemoContext.STORAGE_KEY), null);
  });

  it('does not accept malformed or business-data-polluted localStorage as configured', () => {
    const invalidUser = createStorage(JSON.stringify({ shelterId: 'shelter-002', userId: 'invalid-user' }));
    const polluted = createStorage(JSON.stringify({
      shelterId: 'shelter-002', userId: 'demo-user-01', currentCount: 999
    }));
    const invalidShelter = { shelterId: 'invalid-shelter', userId: 'demo-user-01' };

    assert.equal(DemoContext.getDemoContextState(invalidUser).status, 'invalid');
    assert.equal(DemoContext.getDemoContextState(polluted).status, 'invalid');
    assert.equal(DemoContext.isDemoContextConfigured(invalidShelter, shelters), false);
  });

  it('defines only user IDs that exist in the database seed', () => {
    const seed = fs.readFileSync('database/seed/001_demo_data.sql', 'utf8');
    const users = DemoContext.getDemoUsers();

    assert.deepEqual(users.map((user) => user.id), ['demo-user-01', 'demo-hq-01']);
    users.forEach((user) => {
      assert.match(seed, new RegExp(`\\('${user.id.replaceAll('-', '\\-')}',\\s*'${user.displayName}'`));
    });
  });
});
