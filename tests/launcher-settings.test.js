const assert = require('node:assert/strict');
const fs = require('node:fs');
const { describe, it } = require('node:test');

const DemoContext = require('../js/demo-context.js');
const { createLauncher } = require('../js/launcher.js');

const shelters = [
  ['shelter-001', 'I市防災センター'],
  ['shelter-002', 'I市立Alpha中学校'],
  ['shelter-003', 'I市立Beta小学校'],
  ['shelter-004', 'I市立Gamma小学校'],
  ['shelter-005', 'I市立Delta中学校']
].map(([id, name]) => ({ id, name }));

class FakeElement {
  constructor({ dataset = {}, disabled = false } = {}) {
    this.dataset = dataset;
    this.disabled = disabled;
    this.hidden = false;
    this.textContent = '';
    this.value = '';
    this.children = [];
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  append(child) {
    this.children.push(child);
  }

  replaceChildren() {
    this.children = [];
    this.value = '';
  }

  trigger(type) {
    return this.listeners.get(type)?.({ preventDefault() {} });
  }
}

function createStorage(initialContext) {
  const values = new Map();
  if (initialContext !== undefined) {
    values.set(DemoContext.STORAGE_KEY, typeof initialContext === 'string'
      ? initialContext
      : JSON.stringify(initialContext));
  }
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    value: () => values.get(DemoContext.STORAGE_KEY)
  };
}

function createRuntime({ apiResult = shelters, storedContext } = {}) {
  const storage = createStorage(storedContext);
  const elementIds = [
    'demo-context-error', 'demo-context-state', 'current-shelter', 'current-user',
    'shelter-select', 'user-select', 'demo-context-save', 'demo-context-form',
    'demo-context-guidance'
  ];
  const elements = new Map(elementIds.map((id) => [id, new FakeElement({
    disabled: ['shelter-select', 'user-select', 'demo-context-save'].includes(id)
  })]));
  elements.get('demo-context-error').hidden = true;

  const launchButtons = [
    ['index.html', 'shelter-home'],
    ['information.html', 'information-board'],
    ['hq-dashboard.html', 'hq-dashboard'],
    ['event-center.html', 'event-center']
  ].map(([launchUrl, windowName]) => new FakeElement({ dataset: { launchUrl, windowName } }));
  const apiCalls = [];
  const opened = [];
  const errors = [];
  const windowScope = {
    localStorage: storage,
    open: (...args) => opened.push(args)
  };
  const documentScope = {
    getElementById: (id) => elements.get(id),
    querySelectorAll: (selector) => selector === '[data-launch-url]' ? launchButtons : [],
    createElement: () => new FakeElement()
  };
  const apiClient = {
    apiGet: async (path) => {
      apiCalls.push(path);
      if (apiResult instanceof Error) throw apiResult;
      return apiResult;
    }
  };
  const boundDemoContext = {
    ...DemoContext,
    getDemoContextState: () => DemoContext.getDemoContextState(storage),
    saveDemoContext: (context, validShelters) => DemoContext.saveDemoContext(context, validShelters, storage)
  };
  const originalConsoleError = console.error;
  console.error = (...args) => errors.push(args);
  const launcher = createLauncher({ windowScope, documentScope, apiClient, demoContext: boundDemoContext });

  return {
    apiCalls,
    elements,
    errors,
    launchButtons,
    opened,
    storage,
    start: async () => {
      try {
        await launcher.start();
      } finally {
        console.error = originalConsoleError;
      }
    },
    submit: () => elements.get('demo-context-form').trigger('submit')
  };
}

describe('Launcher demo settings', () => {
  it('loads five shelters from the API and shows the unconfigured state', async () => {
    const runtime = createRuntime();
    await runtime.start();

    assert.deepEqual(runtime.apiCalls, ['/shelters']);
    assert.equal(runtime.elements.get('shelter-select').children.length, 6);
    assert.equal(runtime.elements.get('user-select').children.length, 3);
    assert.equal(runtime.elements.get('demo-context-state').textContent, '未設定');
    assert.match(runtime.elements.get('demo-context-guidance').textContent, /設定してください/);
  });

  it('saves, restores, and changes a valid terminal setting', async () => {
    const first = createRuntime();
    await first.start();
    first.elements.get('shelter-select').value = 'shelter-002';
    first.elements.get('user-select').value = 'demo-user-01';
    first.submit();
    assert.deepEqual(JSON.parse(first.storage.value()), {
      shelterId: 'shelter-002', userId: 'demo-user-01'
    });

    const restored = createRuntime({ storedContext: JSON.parse(first.storage.value()) });
    await restored.start();
    assert.equal(restored.elements.get('shelter-select').value, 'shelter-002');
    assert.equal(restored.elements.get('user-select').value, 'demo-user-01');
    assert.equal(restored.elements.get('current-shelter').textContent, 'I市立Alpha中学校');

    restored.elements.get('shelter-select').value = 'shelter-004';
    restored.submit();
    assert.equal(JSON.parse(restored.storage.value()).shelterId, 'shelter-004');
  });

  it('marks tampered shelter and user settings as invalid', async () => {
    const invalidShelter = createRuntime({
      storedContext: { shelterId: 'invalid-shelter', userId: 'demo-user-01' }
    });
    await invalidShelter.start();
    assert.equal(invalidShelter.elements.get('demo-context-state').textContent, '設定が無効');

    const invalidUser = createRuntime({
      storedContext: { shelterId: 'shelter-002', userId: 'invalid-user' }
    });
    await invalidUser.start();
    assert.equal(invalidUser.elements.get('demo-context-state').textContent, '設定が無効');
  });

  it('does not overwrite or hide a valid saved setting after invalid resubmission', async () => {
    const runtime = createRuntime({
      storedContext: { shelterId: 'shelter-002', userId: 'demo-user-01' }
    });
    await runtime.start();
    runtime.elements.get('shelter-select').value = '';
    runtime.submit();

    assert.deepEqual(JSON.parse(runtime.storage.value()), {
      shelterId: 'shelter-002', userId: 'demo-user-01'
    });
    assert.equal(runtime.elements.get('demo-context-state').textContent, '設定済み');
    assert.equal(runtime.elements.get('current-shelter').textContent, 'I市立Alpha中学校');
    assert.equal(runtime.elements.get('demo-context-error').hidden, false);
  });

  it('shows an API error, keeps saved IDs visible, and does not enable changes', async () => {
    const runtime = createRuntime({
      apiResult: new Error('network down'),
      storedContext: { shelterId: 'shelter-002', userId: 'demo-user-01' }
    });
    await runtime.start();

    assert.equal(runtime.elements.get('current-shelter').textContent, 'shelter-002');
    assert.equal(runtime.elements.get('demo-context-state').textContent, '保存済み・未照合');
    assert.equal(runtime.elements.get('shelter-select').disabled, true);
    assert.equal(runtime.elements.get('demo-context-save').disabled, true);
    assert.equal(runtime.elements.get('demo-context-error').hidden, false);
    assert.match(runtime.elements.get('demo-context-error').textContent, /避難所一覧を取得できませんでした/);
  });

  it('preserves all four window.open launch actions without static JSON fallback', async () => {
    const runtime = createRuntime();
    await runtime.start();
    runtime.launchButtons.forEach((button) => button.trigger('click'));

    assert.deepEqual(runtime.opened, [
      ['index.html', 'shelter-home'],
      ['information.html', 'information-board'],
      ['hq-dashboard.html', 'hq-dashboard'],
      ['event-center.html', 'event-center']
    ]);
    const source = fs.readFileSync('js/launcher.js', 'utf8');
    assert.doesNotMatch(source, /data\/shelters\.json|EventStore|shelter-event-updated/);
  });

  it('keeps accessible labels and live status/error semantics', () => {
    const html = fs.readFileSync('launcher.html', 'utf8');
    assert.match(html, /<label for="shelter-select">/);
    assert.match(html, /<label for="user-select">/);
    assert.match(html, /id="demo-context-state"[^>]*role="status"/);
    assert.match(html, /id="demo-context-error"[^>]*role="alert"/);
  });
});
