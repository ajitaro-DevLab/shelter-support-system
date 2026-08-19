const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { describe, it } = require('node:test');

const mainSource = fs.readFileSync('js/main.js', 'utf8');
const uiSource = fs.readFileSync('js/ui.js', 'utf8');

const apiDetail = {
  id: 'shelter-002',
  name: 'API避難所A',
  latitude: 35.8,
  longitude: 140.1,
  status: 'yellow',
  currentCount: 86,
  confirmedCount: null,
  confirmedAt: null,
  confirmationSlot: null,
  confidence: 'unconfirmed',
  updatedAt: '2026-08-14T05:05:00.000Z',
  updatedBy: 'demo-user-01',
  latestSupply: null,
  latestIssue: null,
  history: []
};
const hqShelters = [{
  shelterId: 'shelter-002',
  name: 'API避難所A',
  status: 'yellow',
  currentCount: 86,
  confirmedCount: null,
  confirmedAt: null,
  confidence: 'unconfirmed',
  updatedAt: '2026-08-14T05:05:00.000Z',
  updatedBy: 'demo-user-01',
  freshness: { level: 'black', elapsedMinutes: null, display: '未確認', delayed: true }
}];
const shelterList = [{ id: 'shelter-002', name: 'API避難所A' }];

function createMainContext({
  detail = apiDetail,
  apiError = null,
  list = shelterList,
  listError = null,
  contextState = {
    status: 'stored',
    context: { shelterId: 'shelter-002', userId: 'demo-user-01' }
  }
} = {}) {
  let start;
  const calls = {
    apiPaths: [],
    homeUpdates: [],
    homeEventShelters: [],
    homeErrors: [],
    mapShelters: null,
    mapUpdates: [],
    localStorageReads: 0
  };
  const elements = new Map([
    ['shelter-name', { textContent: '', hidden: false }],
    ['home-context-user', { textContent: '', hidden: false }],
    ['home-context-message', { textContent: '', hidden: false }],
    ['home-context-guidance', { textContent: '', hidden: true }],
    ['map-error', { textContent: '', hidden: true }]
  ]);
  const pollutedShelters = [{
    id: 'shelter-002', name: '旧JSON避難所', latitude: 35.8, longitude: 140.1,
    status: 'red', updatedAt: '2000-01-01 00:00',
    confidence: { level: '確定', color: 'green' }, evacuees: { total: 999 }
  }];
  const windowMock = {
    addEventListener: (type, listener) => { if (type === 'DOMContentLoaded') start = listener; },
    localStorage: {
      getItem: () => {
        calls.localStorageReads += 1;
        return JSON.stringify({
          shelters: { 'shelter-002': { currentCount: 999, status: 'red' } }
        });
      }
    },
    ApiClient: {
      apiGet: async (path) => {
        calls.apiPaths.push(path);
        if (path === '/shelters') {
          if (listError) throw listError;
          return list;
        }
        if (path === '/hq/shelters') return hqShelters;
        if (apiError) throw apiError;
        return detail;
      }
    },
    DemoContext: {
      getDemoContextState: () => contextState,
      isDemoContextConfigured: (context, shelters) => shelters.some((shelter) => (
        shelter.id === context?.shelterId
        && ['demo-user-01', 'demo-hq-01'].includes(context?.userId)
      )),
      getDemoUsers: () => [
        { id: 'demo-user-01', displayName: '実証利用者01' },
        { id: 'demo-hq-01', displayName: '実証本部01' }
      ]
    },
    ShelterUi: {
      init: () => {},
      updateHomeShelter: (value) => calls.homeUpdates.push(value),
      showHomeLoadError: (message) => calls.homeErrors.push(message),
      clearHomeLoadError: () => {}
    },
    ShelterMap: {
      init: (shelters) => { calls.mapShelters = shelters; },
      update: (shelters) => calls.mapUpdates.push(shelters)
    },
    HomeEvents: {
      init: () => {},
      setShelter: (shelter, userId) => calls.homeEventShelters.push({ shelter, userId })
    }
  };
  const context = {
    window: windowMock,
    document: {
      getElementById: (id) => elements.get(id) || { textContent: '', hidden: true }
    },
    fetch: async (path) => ({
      ok: true,
      json: async () => path.includes('shelters') ? pollutedShelters : []
    }),
    console: { error: () => {} },
    encodeURIComponent,
    Promise
  };
  vm.runInNewContext(mainSource, context);
  return { calls, elements, run: async () => start() };
}

function createUiContext() {
  const elements = new Map();
  const ids = [
    'shelter-name', 'home-evacuees', 'home-confirmed-count', 'home-confirmed-at',
    'home-confirmation-slot', 'home-status', 'home-confidence', 'home-updated-at',
    'home-last-updater', 'home-latest-supply', 'home-latest-issue', 'home-load-status'
  ];
  ids.forEach((id) => elements.set(id, { textContent: '', hidden: false }));
  const history = {
    children: [],
    replaceChildren() { this.children = []; },
    append(item) { this.children.push(item); }
  };
  elements.set('home-history', history);
  const statusSection = { dataset: {} };
  const documentMock = {
    getElementById: (id) => elements.get(id),
    querySelector: (selector) => selector === '.shelter-status' ? statusSection : null,
    createElement: () => ({ textContent: '' })
  };
  const windowMock = {};
  vm.runInNewContext(uiSource, {
    window: windowMock,
    document: documentMock,
    Intl,
    Date
  });
  return { elements, history, statusSection, ui: windowMock.ShelterUi };
}

describe('Home shelter API read migration', () => {
  it('uses API business values for Home and the map without EventStore composition', async () => {
    const { calls, run } = createMainContext();
    await run();

    assert.equal(calls.homeUpdates.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(calls.homeUpdates[0])), apiDetail);
    assert.equal(calls.homeUpdates[0].currentCount, 86);
    assert.ok(calls.apiPaths.includes('/shelters'));
    assert.ok(calls.apiPaths.includes('/shelters/shelter-002'));
    assert.equal(calls.mapShelters[0].evacuees.total, 86);
    assert.equal(calls.mapShelters[0].status, 'yellow');
    assert.deepEqual(JSON.parse(JSON.stringify(calls.mapShelters[0].confidence)), {
      level: '未確認', color: 'gray'
    });
    assert.equal(calls.mapShelters[0].updatedAt, '2026-08-14T05:05:00.000Z');
    assert.equal(calls.mapShelters[0].latitude, 35.8);
    assert.equal(calls.localStorageReads, 0);
    assert.equal(calls.homeErrors.length, 0);
  });

  it('loads only the shelter selected in DemoContext and identifies the configured user', async () => {
    const selectedDetail = {
      ...apiDetail,
      id: 'shelter-004',
      name: 'I市立Gamma小学校',
      currentCount: 63
    };
    const { calls, elements, run } = createMainContext({
      detail: selectedDetail,
      list: [
        { id: 'shelter-002', name: 'I市立Alpha中学校' },
        { id: 'shelter-004', name: 'I市立Gamma小学校' }
      ],
      contextState: {
        status: 'stored',
        context: { shelterId: 'shelter-004', userId: 'demo-hq-01' }
      }
    });
    await run();

    assert.ok(calls.apiPaths.includes('/shelters/shelter-004'));
    assert.ok(!calls.apiPaths.includes('/shelters/shelter-002'));
    assert.equal(calls.homeUpdates[0].id, 'shelter-004');
    assert.equal(calls.homeEventShelters[0].shelter.id, 'shelter-004');
    assert.equal(calls.homeEventShelters[0].userId, 'demo-hq-01');
    assert.equal(elements.get('shelter-name').textContent, 'I市立Gamma小学校');
    assert.equal(elements.get('home-context-user').textContent, '実証本部01（demo-hq-01）');
    assert.equal(elements.get('home-context-guidance').hidden, true);
  });

  it('guides missing, malformed, and unknown settings back to Launcher without detail loading', async () => {
    const cases = [
      { contextState: { status: 'missing', context: null }, expected: /設定してください/ },
      { contextState: { status: 'invalid', context: null }, expected: /設定し直してください/ },
      {
        contextState: {
          status: 'stored',
          context: { shelterId: 'invalid-shelter', userId: 'demo-user-01' }
        },
        expected: /設定し直してください/
      }
    ];

    for (const testCase of cases) {
      const { calls, elements, run } = createMainContext(testCase);
      await run();
      assert.equal(calls.homeUpdates.length, 0);
      assert.ok(!calls.apiPaths.some((path) => /^\/shelters\//.test(path)));
      assert.equal(elements.get('home-context-guidance').hidden, false);
      assert.match(elements.get('home-context-message').textContent, testCase.expected);
      assert.equal(elements.get('shelter-name').textContent, '未設定');
    }
  });

  it('shows a configuration check error when the shelter list API is unavailable', async () => {
    const { calls, elements, run } = createMainContext({
      listError: { type: 'network', status: null, code: null }
    });
    await run();

    assert.equal(calls.homeUpdates.length, 0);
    assert.ok(!calls.apiPaths.some((path) => /^\/shelters\//.test(path)));
    assert.equal(elements.get('home-context-guidance').hidden, false);
    assert.match(elements.get('home-context-message').textContent, /端末設定を確認できませんでした/);
  });

  it('shows a load error and does not fall back to old JSON business values', async () => {
    const { calls, run } = createMainContext({
      apiError: { type: 'api', status: 503, code: 'SERVICE_UNAVAILABLE' }
    });
    await run();

    assert.equal(calls.homeUpdates.length, 0);
    assert.deepEqual(calls.homeErrors, ['データを取得できませんでした']);
    assert.equal(calls.mapShelters[0].evacuees.total, 86);
    assert.notEqual(calls.mapShelters[0].evacuees.total, 999);
  });

  it('renders null records and the API confidence as normal Home values', () => {
    const { elements, history, statusSection, ui } = createUiContext();
    ui.updateHomeShelter(apiDetail);

    assert.equal(elements.get('shelter-name').textContent, 'API避難所A');
    assert.equal(elements.get('home-evacuees').textContent, '86名');
    assert.equal(elements.get('home-confirmed-count').textContent, '未確認');
    assert.equal(elements.get('home-confirmed-at').textContent, '未確認');
    assert.equal(elements.get('home-confirmation-slot').textContent, '未確認');
    assert.equal(elements.get('home-status').textContent, '注意');
    assert.equal(elements.get('home-confidence').textContent, '未確認');
    assert.equal(elements.get('home-last-updater').textContent, 'demo-user-01');
    assert.equal(elements.get('home-latest-supply').textContent, '記録なし');
    assert.equal(elements.get('home-latest-issue').textContent, '記録なし');
    assert.deepEqual(history.children.map((item) => item.textContent), ['記録なし']);
    assert.deepEqual(statusSection.dataset, { status: 'yellow', confidence: 'unconfirmed' });
  });

  it('renders only the selected shelter latest records and three API history items', () => {
    const { elements, history, ui } = createUiContext();
    ui.updateHomeShelter({
      ...apiDetail,
      latestSupply: {
        supplyType: 'blanket', quantity: 20, unit: '枚',
        occurredAt: '2026-08-14T07:00:00.000Z', updatedBy: 'demo-user-01'
      },
      latestIssue: {
        category: 'power', severity: 'urgent',
        occurredAt: '2026-08-14T07:10:00.000Z', updatedBy: 'demo-user-01'
      },
      history: [
        { eventType: 'issue_update', occurredAt: '2026-08-14T07:10:00.000Z', updatedBy: 'demo-user-01' },
        { eventType: 'supply_received', occurredAt: '2026-08-14T07:00:00.000Z', updatedBy: 'demo-user-01' },
        { eventType: 'confirmation', occurredAt: '2026-08-14T04:02:00.000Z', updatedBy: 'demo-user-01' }
      ]
    });

    assert.match(elements.get('home-latest-supply').textContent, /毛布 20枚/);
    assert.match(elements.get('home-latest-issue').textContent, /電力・urgent/);
    assert.equal(history.children.length, 3);
    assert.ok(history.children.every((item) => !item.textContent.includes('避難所B')));
  });
});
