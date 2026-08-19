const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { describe, it } = require('node:test');

const eventCenterSource = fs.readFileSync('js/event-center.js', 'utf8');
const scheduleSource = fs.readFileSync('js/confirmation-schedule.js', 'utf8');
const events = JSON.parse(fs.readFileSync('data/events.json', 'utf8'));

class FakeElement {
  constructor({ dataset = {}, textContent = '', value = '' } = {}) {
    this.dataset = dataset;
    this.textContent = textContent;
    this.value = value;
    this.innerHTML = '';
    this.hidden = false;
    this.disabled = false;
    this.listeners = {};
    this.selectedOptions = [{ textContent: '' }];
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

  focus() {}
}

function createHarness({
  contextState = { status: 'stored', context: { shelterId: 'shelter-004', userId: 'demo-hq-01' } },
  listError = null,
  postError = null,
  postPromise = null
} = {}) {
  const elements = new Map();
  const contextShelterElements = Array.from({ length: 5 }, () => new FakeElement());
  const contextUpdaterElements = Array.from({ length: 5 }, () => new FakeElement());
  const eventButtons = events.map((event) => new FakeElement({ dataset: { eventId: event.id } }));
  const deltaButtons = [1, 5, 10, -1, -5, -10]
    .map((delta) => new FakeElement({ dataset: { delta: String(delta) } }));
  const routineButtons = [1, 5, 10, -1, -5, -10]
    .map((delta) => new FakeElement({ dataset: { routineDelta: String(delta) } }));
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
      elements.set(id, new FakeElement({ textContent: confirmLabels[id] || '' }));
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

  const shelters = [
    { id: 'shelter-002', name: 'I市立Alpha中学校' },
    { id: 'shelter-004', name: 'I市立Gamma小学校' }
  ];
  const detail = {
    id: 'shelter-004',
    name: 'I市立Gamma小学校',
    currentCount: 63,
    confirmedCount: 63,
    confirmedAt: '2026-08-14T04:00:00.000Z',
    history: []
  };
  const gets = [];
  const posts = [];
  let fetchCount = 0;
  const apiGet = async (path) => {
    gets.push(path);
    if (path === '/shelters') {
      if (listError) throw listError;
      return shelters;
    }
    return { ...detail, id: decodeURIComponent(path.split('/').at(-1)) };
  };
  const apiPost = async (path, body) => {
    posts.push({ path, body });
    if (postError) throw postError;
    if (postPromise) return postPromise;
    if (path.endsWith('/notices')) return { title: body.title, isPublic: body.isPublic };
    if (path.endsWith('/confirmations')) return { currentCount: body.confirmedCount };
    return { status: 'accepted' };
  };
  const windowListeners = {};
  const windowMock = {
    ApiClient: { apiGet, apiPost },
    DemoContext: {
      getDemoContextState: () => contextState,
      isDemoContextConfigured: (context, items) => items.some((item) => item.id === context.shelterId),
      getDemoUsers: () => [
        { id: 'demo-user-01', displayName: '実証利用者01' },
        { id: 'demo-hq-01', displayName: '実証本部01' }
      ]
    },
    addEventListener: (type, listener) => { windowListeners[type] = listener; },
    setTimeout: () => {}
  };
  const vmContext = {
    window: windowMock,
    document: documentMock,
    fetch: async () => {
      fetchCount += 1;
      return { ok: true, json: async () => events };
    },
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
    contextShelterElements,
    contextUpdaterElements,
    eventButtons,
    deltaButtons,
    routineButtons,
    gets,
    posts,
    get fetchCount() { return fetchCount; },
    start: () => windowListeners.DOMContentLoaded()
  };
}

function eventButton(harness, id) {
  return harness.eventButtons.find((button) => button.dataset.eventId === id);
}

describe('Event Center demo context', () => {
  it('loads and displays only the shelter and user selected in terminal settings', async () => {
    const harness = createHarness();
    await harness.start();

    assert.deepEqual(harness.gets.slice(0, 2), ['/shelters', '/shelters/shelter-004']);
    assert.equal(harness.elements.get('event-current-shelter').textContent, 'I市立Gamma小学校');
    assert.equal(harness.elements.get('event-current-user').textContent, '実証本部01（demo-hq-01）');
    assert.ok(harness.contextShelterElements.every((element) => element.textContent === 'I市立Gamma小学校'));
    assert.ok(harness.contextUpdaterElements.every((element) => element.textContent === 'demo-hq-01'));
    assert.equal(harness.elements.get('event-context-guidance').hidden, true);
  });

  it('guides missing settings to Launcher without loading business data', async () => {
    const harness = createHarness({ contextState: { status: 'missing', context: null } });
    await harness.start();

    assert.deepEqual(harness.gets, []);
    assert.equal(harness.fetchCount, 0);
    assert.equal(harness.elements.get('event-context-guidance').hidden, false);
    assert.match(harness.elements.get('event-context-message').textContent, /設定してください/);
  });

  it('rejects an unknown selected shelter without loading its detail', async () => {
    const harness = createHarness({
      contextState: { status: 'stored', context: { shelterId: 'shelter-999', userId: 'demo-user-01' } }
    });
    await harness.start();

    assert.deepEqual(harness.gets, ['/shelters']);
    assert.equal(harness.fetchCount, 0);
    assert.equal(harness.elements.get('event-context-guidance').hidden, false);
    assert.match(harness.elements.get('event-context-message').textContent, /無効/);
  });

  it('shows a communication message without static fallback when context validation fails', async () => {
    const harness = createHarness({ listError: { type: 'network' } });
    await harness.start();

    assert.deepEqual(harness.gets, ['/shelters']);
    assert.equal(harness.fetchCount, 0);
    assert.equal(harness.elements.get('event-context-guidance').hidden, false);
    assert.match(harness.elements.get('event-context-message').textContent, /通信状態/);
  });

  it('posts all five implemented events to the selected shelter and user', async () => {
    const harness = createHarness();
    await harness.start();

    await eventButton(harness, 'evacuee-arrival').trigger('click');
    await harness.deltaButtons.find((button) => button.dataset.delta === '5').trigger('click');
    await harness.elements.get('arrival-confirm').trigger('click');

    await eventButton(harness, 'supply-received').trigger('click');
    harness.elements.get('supply-item').value = 'blanket';
    harness.elements.get('supply-quantity').value = '20';
    harness.elements.get('supply-unit').value = '枚';
    await harness.elements.get('supply-confirm').trigger('click');

    await eventButton(harness, 'facility-issue').trigger('click');
    harness.elements.get('issue-category').value = 'power';
    harness.elements.get('issue-severity').value = 'urgent';
    await harness.elements.get('issue-confirm').trigger('click');

    await eventButton(harness, 'notice-update').trigger('click');
    harness.elements.get('notice-title').value = '給水';
    harness.elements.get('notice-start-time').value = '14:00';
    harness.elements.get('notice-location').value = '体育館東側';
    harness.elements.get('notice-message').value = '14:00より給水を開始します';
    harness.elements.get('notice-public').value = 'public';
    await harness.elements.get('notice-confirm').trigger('click');

    await eventButton(harness, 'shelter-routine-update').trigger('click');
    await harness.elements.get('routine-confirm').trigger('click');

    assert.deepEqual(
      harness.posts.map(({ path }) => path),
      [
        '/shelters/shelter-004/events/visitor-change',
        '/shelters/shelter-004/supplies',
        '/shelters/shelter-004/issues',
        '/shelters/shelter-004/notices',
        '/shelters/shelter-004/confirmations'
      ]
    );
    assert.ok(harness.posts.every(({ body }) => body.updatedBy === 'demo-hq-01'));
  });

  it('keeps the modal open and explicitly reports that a failed save was not stored', async () => {
    const harness = createHarness({ postError: { type: 'network' } });
    await harness.start();
    await eventButton(harness, 'evacuee-arrival').trigger('click');
    await harness.elements.get('arrival-confirm').trigger('click');

    assert.equal(harness.posts.length, 1);
    assert.equal(harness.elements.get('arrival-modal').hidden, false);
    assert.match(harness.elements.get('arrival-validation').textContent, /保存されていません/);
    assert.equal(harness.elements.get('arrival-confirm').disabled, false);
    assert.equal(harness.elements.get('arrival-confirm').textContent, 'この内容で更新');
  });

  it('disables the save control while sending so a second click cannot create another event', async () => {
    let finishPost;
    const pendingPost = new Promise((resolve) => { finishPost = resolve; });
    const harness = createHarness({ postPromise: pendingPost });
    await harness.start();
    await eventButton(harness, 'evacuee-arrival').trigger('click');

    const firstSave = harness.elements.get('arrival-confirm').trigger('click');
    assert.equal(harness.elements.get('arrival-confirm').disabled, true);
    assert.equal(harness.elements.get('arrival-confirm').textContent, '保存中…');
    await harness.elements.get('arrival-confirm').trigger('click');
    assert.equal(harness.posts.length, 1);

    finishPost({ status: 'accepted' });
    await firstSave;
    assert.equal(harness.elements.get('arrival-confirm').disabled, false);
    assert.equal(harness.elements.get('arrival-confirm').textContent, 'この内容で更新');
  });
});
