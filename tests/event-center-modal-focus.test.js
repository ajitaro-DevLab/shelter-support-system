const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { describe, it } = require('node:test');

const eventCenterSource = fs.readFileSync('js/event-center.js', 'utf8');
const scheduleSource = fs.readFileSync('js/confirmation-schedule.js', 'utf8');
const events = JSON.parse(fs.readFileSync('data/events.json', 'utf8'));

describe('Event Center modal close does not leak IME/keyboard focus state', () => {
  it('defines a single shared blur helper and calls it before every modal is hidden', () => {
    assert.equal((eventCenterSource.match(/function releaseModalFocus\(/g) || []).length, 1);
    assert.equal((eventCenterSource.match(/releaseModalFocus\(\);/g) || []).length, 5);
    ['arrival-modal', 'routine-modal', 'supply-modal', 'issue-modal', 'notice-modal'].forEach((modalId) => {
      assert.match(
        eventCenterSource,
        new RegExp(`releaseModalFocus\\(\\);\\s*\\n\\s*document\\.getElementById\\('${modalId}'\\)\\.hidden = true;`)
      );
    });
  });

  it('still focuses the notice title synchronously on open (unchanged in this task)', () => {
    assert.match(
      eventCenterSource,
      /document\.getElementById\('notice-modal'\)\.hidden = false;\s*\n\s*document\.getElementById\('notice-title'\)\.focus\(\);/
    );
    assert.doesNotMatch(eventCenterSource, /requestAnimationFrame/);
  });
});

class FakeElement {
  constructor({ dataset = {}, textContent = '', value = '', id = null, focusState } = {}) {
    this.id = id;
    this.dataset = dataset;
    this.textContent = textContent;
    this.value = value;
    this.innerHTML = '';
    this.hidden = false;
    this.disabled = false;
    this.listeners = {};
    this.selectedOptions = [{ textContent: '' }];
    this.focusState = focusState;
    const classes = new Set();
    this.classList = {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      contains: (name) => classes.has(name)
    };
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  async trigger(type, event = {}) {
    if (type === 'click' && this.disabled) return undefined;
    return this.listeners[type]?.({ target: this, ...event });
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  querySelectorAll() {
    return [];
  }

  focus() {
    this.focusState.activeElement = this;
  }

  blur() {
    if (this.focusState.activeElement === this) this.focusState.activeElement = null;
  }
}

function createHarness({ postError = null } = {}) {
  const focusState = { activeElement: null };
  const elements = new Map();
  const contextShelterElements = Array.from({ length: 5 }, () => new FakeElement({ focusState }));
  const contextUpdaterElements = Array.from({ length: 5 }, () => new FakeElement({ focusState }));
  const eventButtons = events.map((event) => new FakeElement({ dataset: { eventId: event.id }, focusState }));
  const deltaButtons = [1, 5, 10, -1, -5, -10]
    .map((delta) => new FakeElement({ dataset: { delta: String(delta) }, focusState }));
  const routineButtons = [1, 5, 10, -1, -5, -10]
    .map((delta) => new FakeElement({ dataset: { routineDelta: String(delta) }, focusState }));
  const modalIds = ['arrival-modal', 'supply-modal', 'issue-modal', 'notice-modal', 'routine-modal'];
  const hiddenIds = [...modalIds, 'event-context-guidance', 'event-error', 'event-success'];
  const confirmLabels = {
    'arrival-confirm': 'この内容で更新',
    'supply-confirm': '受領を記録',
    'issue-confirm': '不具合を記録',
    'notice-confirm': 'お知らせを記録',
    'routine-confirm': '正式確認を記録'
  };

  function getElement(id) {
    if (!elements.has(id)) {
      elements.set(id, new FakeElement({ id, textContent: confirmLabels[id] || '', focusState }));
    }
    return elements.get(id);
  }

  hiddenIds.forEach((id) => { getElement(id).hidden = true; });
  getElement('event-list').querySelectorAll = () => eventButtons;
  getElement('supply-item').selectedOptions = [{ textContent: '毛布' }];
  getElement('issue-category').selectedOptions = [{ textContent: '停電' }];
  getElement('issue-severity').selectedOptions = [{ textContent: '至急対応' }];

  const documentListeners = {};
  const documentMock = {
    getElementById: getElement,
    get activeElement() { return focusState.activeElement; },
    querySelectorAll: (selector) => ({
      '[data-event-context-shelter]': contextShelterElements,
      '[data-event-context-updater]': contextUpdaterElements,
      '[data-event-id]': eventButtons,
      '[data-delta]': deltaButtons,
      '[data-routine-delta]': routineButtons
    }[selector] || []),
    querySelector: (selector) => selector === '[data-delta="1"]' ? deltaButtons[0] : null,
    createElement: () => {
      const created = { innerHTML: '' };
      Object.defineProperty(created, 'textContent', {
        set: (value) => {
          created.innerHTML = String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;');
        }
      });
      return created;
    },
    addEventListener: (type, listener) => { documentListeners[type] = listener; }
  };

  const shelters = [{ id: 'shelter-004', name: 'I市立Gamma小学校' }];
  const detail = {
    id: 'shelter-004',
    name: 'I市立Gamma小学校',
    currentCount: 63,
    confirmedCount: 63,
    confirmedAt: '2026-08-14T04:00:00.000Z',
    history: []
  };
  const posts = [];
  const apiGet = async (path) => (path === '/shelters' ? shelters : detail);
  const apiPost = async (path, body) => {
    posts.push({ path, body });
    if (postError) throw postError;
    if (path.endsWith('/notices')) return { title: body.title, isPublic: body.isPublic };
    return { status: 'accepted' };
  };
  const windowListeners = {};
  const windowMock = {
    ApiClient: { apiGet, apiPost },
    DemoContext: {
      getDemoContextState: () => ({ status: 'stored', context: { shelterId: 'shelter-004', userId: 'demo-user-01' } }),
      isDemoContextConfigured: (context, items) => items.some((item) => item.id === context.shelterId),
      getDemoUsers: () => [{ id: 'demo-user-01', displayName: '実証利用者01' }]
    },
    addEventListener: (type, listener) => { windowListeners[type] = listener; },
    setTimeout: () => {}
  };
  const vmContext = {
    window: windowMock,
    document: documentMock,
    fetch: async () => ({ ok: true, json: async () => events }),
    console: { error: () => {} },
    Date,
    Intl,
    Number,
    encodeURIComponent,
    decodeURIComponent
  };

  vm.runInNewContext(scheduleSource, vmContext);
  vm.runInNewContext(eventCenterSource, vmContext);

  return {
    elements,
    eventButtons,
    deltaButtons,
    posts,
    focusState,
    start: () => windowListeners.DOMContentLoaded(),
    pressEscape: () => documentListeners.keydown({ key: 'Escape' })
  };
}

function eventButton(harness, id) {
  return harness.eventButtons.find((button) => button.dataset.eventId === id);
}

describe('Event Center modal focus/blur behaviour', () => {
  it('A: releases focus from a numeric input when the modal is closed', async () => {
    const harness = createHarness();
    await harness.start();

    await eventButton(harness, 'evacuee-arrival').trigger('click');
    harness.elements.get('arrival-direct-input').focus();
    assert.equal(harness.focusState.activeElement, harness.elements.get('arrival-direct-input'));

    await harness.elements.get('arrival-cancel').trigger('click');

    assert.equal(harness.elements.get('arrival-modal').hidden, true);
    assert.notEqual(harness.focusState.activeElement, harness.elements.get('arrival-direct-input'));
    assert.equal(harness.focusState.activeElement, null);
  });

  it('B: releases focus from the notice title text input when the modal is closed', async () => {
    const harness = createHarness();
    await harness.start();

    await eventButton(harness, 'notice-update').trigger('click');
    assert.equal(harness.focusState.activeElement, harness.elements.get('notice-title'));

    await harness.elements.get('notice-cancel').trigger('click');

    assert.equal(harness.elements.get('notice-modal').hidden, true);
    assert.notEqual(harness.focusState.activeElement, harness.elements.get('notice-title'));
    assert.equal(harness.focusState.activeElement, null);
  });

  it('C: keeps the modal open, the value, and the focused field when the save fails', async () => {
    const harness = createHarness({ postError: { type: 'network' } });
    await harness.start();

    await eventButton(harness, 'evacuee-arrival').trigger('click');
    harness.elements.get('arrival-direct-input').value = '3';
    await harness.elements.get('arrival-direct-input').trigger('input');
    harness.elements.get('arrival-direct-input').focus();
    await harness.elements.get('arrival-confirm').trigger('click');

    assert.equal(harness.posts.length, 1);
    assert.equal(harness.elements.get('arrival-modal').hidden, false);
    assert.equal(harness.elements.get('arrival-direct-input').value, '3');
    assert.equal(harness.focusState.activeElement, harness.elements.get('arrival-direct-input'));
  });

  it('D: releases focus when the notice modal is closed with Escape', async () => {
    const harness = createHarness();
    await harness.start();

    await eventButton(harness, 'notice-update').trigger('click');
    assert.equal(harness.focusState.activeElement, harness.elements.get('notice-title'));

    await harness.pressEscape();

    assert.equal(harness.elements.get('notice-modal').hidden, true);
    assert.equal(harness.focusState.activeElement, null);
  });

  it('E: releases focus when a numeric modal is closed by a background click', async () => {
    const harness = createHarness();
    await harness.start();

    await eventButton(harness, 'evacuee-arrival').trigger('click');
    harness.elements.get('arrival-direct-input').focus();
    assert.equal(harness.focusState.activeElement, harness.elements.get('arrival-direct-input'));

    await harness.elements.get('arrival-modal').trigger('click', { target: { id: 'arrival-modal' } });

    assert.equal(harness.elements.get('arrival-modal').hidden, true);
    assert.equal(harness.focusState.activeElement, null);
  });
});
