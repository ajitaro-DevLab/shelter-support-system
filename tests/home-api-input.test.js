const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { describe, it } = require('node:test');

const source = fs.readFileSync('js/home-events.js', 'utf8');
const scheduleSource = fs.readFileSync('js/confirmation-schedule.js', 'utf8');

class FakeElement {
  constructor({ dataset = {}, value = '', parentElement = null } = {}) {
    this.dataset = dataset;
    this.value = value;
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
    this.parentElement = parentElement;
    this.listeners = {};
    const classes = new Set();
    this.classList = {
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      contains: (name) => classes.has(name)
    };
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  async trigger(type, event = {}) {
    return this.listeners[type]?.({ target: this, ...event });
  }

  focus() {}
}

function createContext({ postError = null, postHandler = null, postPromise = null, userId = 'demo-user-01' } = {}) {
  const elements = new Map();
  const nextCountParent = new FakeElement();
  const ids = [
    'prototype-message', 'home-event-validation', 'home-event-next-count',
    'home-visitor-direct', 'home-supply-type', 'home-supply-quantity', 'home-supply-unit',
    'home-issue-category', 'home-issue-severity', 'home-confirmation-unchanged',
    'home-confirmation-direct', 'home-event-title', 'home-event-shelter-name', 'home-event-current-count',
    'home-event-confirmation-slot', 'home-event-dialog', 'home-event-submit',
    'home-event-close', 'home-event-cancel', 'home-event-updater'
  ];
  ids.forEach((id) => elements.set(id, new FakeElement()));
  elements.get('home-event-next-count').parentElement = nextCountParent;
  elements.get('home-event-dialog').hidden = true;

  const eventButtons = ['visitor', 'supply', 'issue', 'confirmation']
    .map((homeEvent) => new FakeElement({ dataset: { homeEvent } }));
  const visitorButtons = [1, 5, 10, -1, -5, -10]
    .map((delta) => new FakeElement({ dataset: { visitorDelta: String(delta) } }));
  const confirmationButtons = [1, 5, 10, -1, -5, -10]
    .map((delta) => new FakeElement({ dataset: { confirmationDelta: String(delta) } }));
  const forms = ['visitor', 'supply', 'issue', 'confirmation']
    .map((homeEventForm) => new FakeElement({ dataset: { homeEventForm } }));
  const documentListeners = {};
  const documentMock = {
    getElementById: (id) => elements.get(id),
    querySelectorAll: (selector) => ({
      '[data-home-event]': eventButtons,
      '[data-visitor-delta]': visitorButtons,
      '[data-confirmation-delta]': confirmationButtons,
      '[data-home-event-form]': forms
    }[selector] ?? []),
    addEventListener: (type, listener) => { documentListeners[type] = listener; }
  };
  const posts = [];
  let reloads = 0;
  const windowMock = {
    ApiClient: {
      apiPost: async (path, body) => {
        posts.push({ path, body });
        if (postError) throw postError;
        if (postHandler) return postHandler(path, body);
        if (postPromise) return postPromise;
        return { status: 'accepted' };
      }
    },
    HomeApp: { reloadHome: async () => { reloads += 1; } }
  };
  const vmContext = {
    window: windowMock,
    document: documentMock,
    console: { error: () => {} },
    Date,
    Intl,
    Number,
    encodeURIComponent
  };
  vm.runInNewContext(scheduleSource, vmContext);
  vm.runInNewContext(source, vmContext);
  windowMock.HomeEvents.init();
  windowMock.HomeEvents.setShelter({ id: 'shelter-A/2', name: 'Alpha中学校', currentCount: 86 }, userId);

  return {
    elements,
    eventButtons,
    visitorButtons,
    confirmationButtons,
    posts,
    get reloads() { return reloads; }
  };
}

async function openAndSubmit(context, eventName) {
  await context.eventButtons.find((button) => button.dataset.homeEvent === eventName).trigger('click');
  await context.elements.get('home-event-submit').trigger('click');
}

describe('Home major API inputs', () => {
  it('posts a visitor change and reloads only after success', async () => {
    const context = createContext();
    await context.eventButtons[0].trigger('click');
    await context.visitorButtons.find((button) => button.dataset.visitorDelta === '5').trigger('click');
    await context.elements.get('home-event-submit').trigger('click');

    assert.equal(context.posts[0].path, '/shelters/shelter-A%2F2/events/visitor-change');
    assert.equal(context.posts[0].body.delta, 5);
    assert.equal(context.posts[0].body.updatedBy, 'demo-user-01');
    assert.equal(context.reloads, 1);
    assert.equal(context.elements.get('prototype-message').textContent, '避難者数を更新しました');
    assert.equal(context.elements.get('prototype-message').hidden, false);
  });

  it('shows a disabled saving state while the request is in flight', async () => {
    let finishPost;
    const postPromise = new Promise((resolve) => { finishPost = resolve; });
    const context = createContext({ postPromise });
    await context.eventButtons[0].trigger('click');

    const submission = context.elements.get('home-event-submit').trigger('click');
    assert.equal(context.elements.get('home-event-submit').disabled, true);
    assert.equal(context.elements.get('home-event-submit').textContent, '保存中…');

    finishPost({ status: 'accepted' });
    await submission;
    assert.equal(context.elements.get('home-event-submit').disabled, false);
    assert.equal(context.elements.get('home-event-submit').textContent, '保存');
  });

  it('uses the configured terminal user as updatedBy and displays the same ID', async () => {
    const context = createContext({ userId: 'demo-hq-01' });
    await openAndSubmit(context, 'visitor');

    assert.equal(context.posts[0].body.updatedBy, 'demo-hq-01');
    assert.equal(context.elements.get('home-event-updater').textContent, 'demo-hq-01');
    assert.equal(context.elements.get('home-event-shelter-name').textContent, 'Alpha中学校');
  });

  it('posts supply and issue values using their API contracts', async () => {
    const context = createContext();
    await context.eventButtons[1].trigger('click');
    context.elements.get('home-supply-type').value = 'blanket';
    context.elements.get('home-supply-quantity').value = '20';
    context.elements.get('home-supply-unit').value = '枚';
    await context.elements.get('home-event-submit').trigger('click');

    await context.eventButtons[2].trigger('click');
    context.elements.get('home-issue-category').value = 'power';
    context.elements.get('home-issue-severity').value = 'urgent';
    await context.elements.get('home-event-submit').trigger('click');

    assert.deepEqual(
      JSON.parse(JSON.stringify(context.posts.map(({ path, body }) => ({ path, body: { ...body, occurredAt: '<time>' } })))),
      [
        {
          path: '/shelters/shelter-A%2F2/supplies',
          body: { supplyType: 'blanket', quantity: 20, unit: '枚', occurredAt: '<time>', updatedBy: 'demo-user-01' }
        },
        {
          path: '/shelters/shelter-A%2F2/issues',
          body: { category: 'power', severity: 'urgent', occurredAt: '<time>', updatedBy: 'demo-user-01' }
        }
      ]
    );
    assert.equal(context.reloads, 2);
  });

  it('posts a fixed-choice formal confirmation', async () => {
    const context = createContext();
    await context.eventButtons[3].trigger('click');
    await context.confirmationButtons.find((button) => button.dataset.confirmationDelta === '-5').trigger('click');
    await context.elements.get('home-event-submit').trigger('click');

    const request = context.posts[0];
    assert.equal(request.path, '/shelters/shelter-A%2F2/confirmations');
    assert.equal(request.body.mode, 'delta');
    assert.equal(request.body.confirmedCount, 81);
    assert.ok(['09:00', '13:00', '18:00'].includes(request.body.confirmationSlot));
    assert.equal(context.reloads, 1);
  });

  it('does not reload or close the dialog when POST fails', async () => {
    const context = createContext({ postError: { type: 'network' } });
    await openAndSubmit(context, 'visitor');

    assert.equal(context.posts.length, 1);
    assert.equal(context.reloads, 0);
    assert.equal(context.elements.get('home-event-dialog').hidden, false);
    assert.equal(
      context.elements.get('home-event-validation').textContent,
      '保存されていません。通信状態を確認して、もう一度保存してください。'
    );
    assert.equal(context.elements.get('home-event-submit').disabled, false);
    assert.equal(context.elements.get('home-event-submit').textContent, '保存');
  });

  it('allows retry after a failed save and reloads only after recovery', async () => {
    let attempts = 0;
    const context = createContext({
      postHandler: async () => {
        attempts += 1;
        if (attempts === 1) throw { type: 'network' };
        return { status: 'accepted' };
      }
    });

    await openAndSubmit(context, 'visitor');
    assert.equal(context.elements.get('home-event-dialog').hidden, false);
    assert.equal(context.reloads, 0);

    await context.elements.get('home-event-submit').trigger('click');
    assert.equal(context.posts.length, 2);
    assert.equal(context.reloads, 1);
    assert.equal(context.elements.get('home-event-dialog').hidden, true);
    assert.equal(context.elements.get('prototype-message').textContent, '避難者数を更新しました');
  });

  it('rejects invalid supply input before calling the API', async () => {
    const context = createContext();
    await openAndSubmit(context, 'supply');

    assert.equal(context.posts.length, 0);
    assert.equal(context.reloads, 0);
    assert.match(context.elements.get('home-event-validation').textContent, /入力してください/);
  });
});
