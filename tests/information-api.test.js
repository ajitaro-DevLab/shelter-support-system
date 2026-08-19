const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { describe, it } = require('node:test');

const source = fs.readFileSync('js/information.js', 'utf8');
const html = fs.readFileSync('information.html', 'utf8');

function createContext({
  contextState = { status: 'stored', context: { shelterId: 'shelter-004', userId: 'demo-hq-01' } },
  listError = null,
  noticeResponses = []
} = {}) {
  let start;
  const intervals = [];
  const elements = new Map([
    ['current-time', { textContent: '' }],
    ['current-date', { textContent: '' }],
    ['facility-name', { textContent: '' }],
    ['important-message', { textContent: '' }],
    ['data-updated', { textContent: '' }],
    ['load-status', { textContent: '' }],
    ['published-notices', { innerHTML: '' }],
    ['information-context-message', { textContent: '' }],
    ['information-context-guidance', { hidden: true }]
  ]);
  const shelters = [
    { id: 'shelter-002', name: 'I市立Alpha中学校' },
    { id: 'shelter-004', name: 'I市立Gamma小学校' }
  ];
  const apiCalls = [];
  const errors = [];
  const windowMock = {
    ApiClient: {
      apiGet: async (path) => {
        apiCalls.push(path);
        if (path === '/shelters') {
          if (listError) throw listError;
          return shelters;
        }
        const next = noticeResponses.shift();
        if (next instanceof Error) throw next;
        return next;
      }
    },
    DemoContext: {
      getDemoContextState: () => contextState,
      isDemoContextConfigured: (context, items) => items.some((item) => item.id === context.shelterId)
    },
    addEventListener: (type, listener) => { if (type === 'DOMContentLoaded') start = listener; },
    setInterval: (listener, delay) => intervals.push({ listener, delay })
  };
  const documentMock = {
    getElementById: (id) => elements.get(id),
    createElement: () => {
      const element = { innerHTML: '' };
      Object.defineProperty(element, 'textContent', {
        set(value) { element.innerHTML = String(value); }
      });
      return element;
    }
  };
  vm.runInNewContext(source, {
    window: windowMock,
    document: documentMock,
    console: { error: (...args) => errors.push(args) },
    Intl,
    Date,
    Error,
    encodeURIComponent
  });
  return { apiCalls, elements, errors, intervals, run: () => start() };
}

const publicNotice = {
  noticeId: '1',
  shelterId: 'shelter-004',
  title: '給水',
  startTime: '14:00',
  location: '体育館東側',
  body: '14時から給水を開始します',
  isPublic: true,
  occurredAt: '2026-08-14T04:55:00.000Z',
  updatedBy: 'demo-hq-01',
  createdAt: '2026-08-14T04:55:01.000Z'
};

describe('Information Board API migration', () => {
  it('requests only the selected shelter server-filtered public notice endpoint', async () => {
    const context = createContext({ noticeResponses: [[publicNotice]] });
    await context.run();

    assert.deepEqual(
      context.apiCalls,
      ['/shelters', '/shelters/shelter-004/notices?public=true']
    );
    assert.match(context.elements.get('published-notices').innerHTML, /給水/);
    assert.match(context.elements.get('published-notices').innerHTML, /14時から給水を開始します/);
    assert.equal(context.elements.get('facility-name').textContent, 'I市立Gamma小学校');
    assert.equal(context.elements.get('information-context-guidance').hidden, true);
  });

  it('keeps the last successful display and reports the last normal update on failure', async () => {
    const context = createContext({ noticeResponses: [[publicNotice], new Error('network down')] });
    await context.run();
    const previousDisplay = context.elements.get('published-notices').innerHTML;
    const refresh = context.intervals.find(({ delay }) => delay === 60000);

    await refresh.listener();

    assert.equal(context.elements.get('published-notices').innerHTML, previousDisplay);
    assert.match(context.elements.get('load-status').textContent, /前回の表示を継続します/);
    assert.match(context.elements.get('load-status').textContent, /最終正常更新/);
    assert.equal(context.errors.length, 1);
  });

  it('keeps the selected facility visible when the first notice request fails', async () => {
    const context = createContext({ noticeResponses: [new Error('network down')] });
    await context.run();

    assert.equal(context.elements.get('facility-name').textContent, 'I市立Gamma小学校');
    assert.equal(context.elements.get('published-notices').innerHTML, '');
    assert.equal(context.elements.get('important-message').textContent, '情報を取得できませんでした');
    assert.match(context.elements.get('load-status').textContent, /最終正常更新なし/);
    assert.equal(context.errors.length, 1);
  });

  it('recovers automatically on the next successful poll without reloading the page', async () => {
    const context = createContext({ noticeResponses: [new Error('network down'), [publicNotice]] });
    await context.run();
    const refresh = context.intervals.find(({ delay }) => delay === 60000);

    await refresh.listener();

    assert.match(context.elements.get('published-notices').innerHTML, /給水/);
    assert.equal(context.elements.get('load-status').textContent, '確定済み生活支援情報を表示中');
    assert.deepEqual(
      context.apiCalls,
      [
        '/shelters',
        '/shelters/shelter-004/notices?public=true',
        '/shelters/shelter-004/notices?public=true'
      ]
    );
  });

  it('guides missing settings to Launcher without requesting notice data', async () => {
    const context = createContext({
      contextState: { status: 'missing', context: null }
    });
    await context.run();

    assert.deepEqual(context.apiCalls, []);
    assert.equal(context.elements.get('facility-name').textContent, '未設定');
    assert.equal(context.elements.get('information-context-guidance').hidden, false);
    assert.equal(context.elements.get('important-message').textContent, '避難所設定を確認してください');
    assert.match(context.elements.get('information-context-message').textContent, /設定してください/);
    assert.equal(context.intervals.some(({ delay }) => delay === 60000), false);
  });

  it('rejects an unknown shelter without requesting its notices', async () => {
    const context = createContext({
      contextState: { status: 'stored', context: { shelterId: 'shelter-999', userId: 'demo-user-01' } }
    });
    await context.run();

    assert.deepEqual(context.apiCalls, ['/shelters']);
    assert.equal(context.elements.get('information-context-guidance').hidden, false);
    assert.match(context.elements.get('information-context-message').textContent, /無効/);
  });

  it('shows a communication message without legacy fallback when shelter validation fails', async () => {
    const context = createContext({ listError: new Error('network down') });
    await context.run();

    assert.deepEqual(context.apiCalls, ['/shelters']);
    assert.equal(context.elements.get('facility-name').textContent, '未設定');
    assert.equal(context.elements.get('information-context-guidance').hidden, false);
    assert.match(context.elements.get('information-context-message').textContent, /通信状態/);
  });

  it('does not use EventStore, localStorage, JSON notices, or client-side publication filtering', () => {
    assert.doesNotMatch(source, /EventStore|localStorage|data\/notices\.json/);
    assert.doesNotMatch(html, /js\/event-store\.js/);
    assert.doesNotMatch(source, /\.filter\([^)]*isPublic|isPublic\s*===/);
    assert.match(html, /js\/demo-context\.js/);
    assert.doesNotMatch(source, /CURRENT_SHELTER_ID|FACILITY_NAME|shelter-002/);
  });

  it('polls within the required 30 to 60 second range', () => {
    const interval = Number(source.match(/DATA_REFRESH_INTERVAL_MS = (\d+)/)?.[1]);
    assert.ok(interval >= 30000 && interval <= 60000);
  });
});
