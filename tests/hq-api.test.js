const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { describe, it } = require('node:test');

const source = fs.readFileSync('js/hq-dashboard.js', 'utf8');
const html = fs.readFileSync('hq-dashboard.html', 'utf8');

const hqShelters = [
  ['shelter-001', 'I市防災センター', 'green', 128, 'confirmed'],
  ['shelter-002', 'I市立Alpha中学校', 'yellow', 86, 'unconfirmed'],
  ['shelter-003', 'I市立Beta小学校', 'red', 174, 'estimated'],
  ['shelter-004', 'I市立Gamma小学校', 'green', 63, 'confirmed'],
  ['shelter-005', 'I市立Delta中学校', 'gray', 41, 'unconfirmed']
].map(([shelterId, name, status, currentCount, confidence]) => ({
  shelterId,
  name,
  status,
  currentCount,
  confirmedCount: confidence === 'unconfirmed' ? null : currentCount,
  confirmedAt: confidence === 'unconfirmed' ? null : '2026-08-14T04:00:00.000Z',
  confidence,
  updatedAt: '2026-08-14T04:05:00.000Z',
  updatedBy: 'demo-user-01',
  freshness: { level: 'green', elapsedMinutes: 5, display: '5分前', delayed: false }
}));

class FakeElement {
  constructor() {
    this._textContent = '';
    this._innerHTML = '';
    this.hidden = true;
    this.className = '';
    this.dataset = {};
    this.value = '';
    this.listeners = new Map();
    this.attributes = new Map();
    this.sortMark = null;
    this.classList = { add() {}, toggle() {} };
  }

  set textContent(value) {
    this._textContent = String(value ?? '');
    this._innerHTML = this._textContent
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  get textContent() {
    return this._textContent;
  }

  set innerHTML(value) {
    this._innerHTML = String(value ?? '');
  }

  get innerHTML() {
    return this._innerHTML;
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  dispatch(type, event = {}) {
    return this.listeners.get(type)?.({ target: this, preventDefault() {}, ...event });
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name);
  }

  querySelector(selector) {
    if (selector === '.sort-mark') {
      if (!this.sortMark) this.sortMark = new FakeElement();
      return this.sortMark;
    }
    return new FakeElement();
  }
}

function countRenderedRows(tableHtml) {
  return (tableHtml.match(/data-shelter-id=/g) || []).length;
}

function createHqRuntime(listResults, detailsById = {}) {
  let startHandler;
  let localStorageReads = 0;
  const intervals = new Map();
  const elements = new Map();
  const detailRequests = [];
  const sortKeys = ['name', 'status', 'evacuees', 'officialConfirmedAt', 'freshness', 'confidence'];
  const sortButtons = sortKeys.map((key) => {
    const element = new FakeElement();
    element.dataset.sortKey = key;
    return element;
  });
  const sortHeaders = sortKeys.map((key) => {
    const element = new FakeElement();
    element.dataset.sortColumn = key;
    return element;
  });
  let renderedRows = [];
  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, new FakeElement());
    return elements.get(id);
  };
  const queuedResults = [...listResults];
  const pollutedLocations = hqShelters.map((shelter, index) => ({
    id: shelter.shelterId,
    name: `旧JSON-${shelter.name}`,
    latitude: 35.8 + index * 0.01,
    longitude: 140.1 + index * 0.01,
    status: 'red',
    evacuees: { total: 999 },
    confidence: { level: '確定', color: 'green' }
  }));
  const windowMock = {
    addEventListener: (type, handler) => {
      if (type === 'DOMContentLoaded') startHandler = handler;
    },
    setInterval: (handler, delay) => {
      intervals.set(delay, handler);
      return delay;
    },
    localStorage: {
      getItem: () => {
        localStorageReads += 1;
        return JSON.stringify({ currentCount: 999, status: 'red', confidence: 'confirmed' });
      }
    },
    ApiClient: {
      apiGet: async (path) => {
        if (path === '/hq/shelters') {
          const result = queuedResults.shift();
          if (result instanceof Error) throw result;
          return result;
        }
        const shelterId = decodeURIComponent(path.split('/').at(-1));
        detailRequests.push(path);
        return {
          id: shelterId,
          latestSupply: null,
          latestIssue: null,
          history: [],
          ...detailsById[shelterId]
        };
      }
    }
  };
  const documentMock = {
    createElement: () => new FakeElement(),
    getElementById: getElement,
    querySelectorAll: (selector) => {
      if (selector === '[data-sort-key]') return sortButtons;
      if (selector === '[data-sort-column]') return sortHeaders;
      if (selector === '[data-shelter-id]') {
        const ids = [...getElement('shelter-table-body').innerHTML.matchAll(/data-shelter-id="([^"]+)"/g)]
          .map((match) => match[1]);
        const renderedIds = renderedRows.map((row) => row.dataset.shelterId);
        if (ids.join('\n') !== renderedIds.join('\n')) {
          renderedRows = ids.map((id) => {
            const row = new FakeElement();
            row.dataset.shelterId = id;
            return row;
          });
        }
        return renderedRows;
      }
      return [];
    },
    querySelector: (selector) => {
      const shelterId = selector.match(/^\[data-shelter-id="([^"]+)"\]$/)?.[1];
      return shelterId ? renderedRows.find((row) => row.dataset.shelterId === shelterId) || null : null;
    }
  };

  vm.runInNewContext(source, {
    window: windowMock,
    document: documentMock,
    fetch: async () => ({ ok: true, json: async () => pollutedLocations }),
    console: { error() {}, warn() {} },
    Intl,
    Date,
    encodeURIComponent,
    decodeURIComponent
  });

  return {
    start: () => startHandler(),
    poll: () => intervals.get(15000)(),
    element: getElement,
    filter: (value) => {
      const filter = getElement('status-filter');
      filter.value = value;
      return filter.dispatch('change');
    },
    sort: (key) => sortButtons.find((button) => button.dataset.sortKey === key).dispatch('click'),
    row: (shelterId) => renderedRows.find((row) => row.dataset.shelterId === shelterId),
    detailRequests: () => [...detailRequests],
    sortHeader: (key) => sortHeaders.find((header) => header.dataset.sortColumn === key),
    localStorageReads: () => localStorageReads
  };
}

describe('HQ Dashboard API migration contract', () => {
  it('loads the HQ list and selected shelter detail through the shared API client', () => {
    assert.match(source, /ApiClient\.apiGet\(HQ_API_PATH\)/);
    assert.match(source, /HQ_API_PATH = '\/hq\/shelters'/);
    assert.match(source, /ApiClient\.apiGet\(`\/shelters\/\$\{encodeURIComponent\(shelterId\)\}`\)/);
  });

  it('uses API confidence and freshness without frontend business recalculation', () => {
    assert.match(source, /shelter\.freshness\?\.display/);
    assert.match(source, /shelter\.freshness\?\.delayed/);
    assert.match(source, /shelter\.freshness\?\.level/);
    assert.match(source, /shelter\.confidence/);
    assert.doesNotMatch(source, /function getFreshness|getDisplayConfidence|FRESHNESS_LIMITS|getReferenceTime/);
  });

  it('does not use EventStore or localStorage for HQ business data', () => {
    assert.doesNotMatch(source, /EventStore|localStorage/);
    assert.doesNotMatch(html, /js\/event-store\.js/);
    assert.doesNotMatch(source, /data\/supplies\.json|data\/history\.json/);
  });

  it('polls within the specified interval and preserves the previous list on failure', () => {
    const interval = Number(source.match(/POLLING_INTERVAL_MS = (\d+)/)?.[1]);
    assert.ok(interval >= 5000 && interval <= 30000);
    assert.match(source, /setInterval\(refreshDashboard, POLLING_INTERVAL_MS\)/);
    assert.match(source, /直前の表示を維持しています/);
    assert.doesNotMatch(source, /catch[\s\S]{0,300}allShelters\s*=\s*\[\]/);
  });

  it('keeps map failures separate from list operation', () => {
    assert.match(source, /地図タイルを取得できません。一覧はそのまま利用できます/);
    assert.match(html, /id="map-error"/);
  });

  it('keeps HQ independent from the demo shelter context', () => {
    assert.doesNotMatch(source, /DemoContext|shelter-demo-context-v1/);
    assert.doesNotMatch(html, /js\/demo-context\.js/);
  });

  it('renders summary counts and API-provided freshness and confidence', async () => {
    const runtime = createHqRuntime([hqShelters]);
    await runtime.start();

    assert.equal(runtime.element('total-count').textContent, '5');
    assert.equal(runtime.element('normal-count').textContent, '2');
    assert.equal(runtime.element('warning-count').textContent, '1');
    assert.equal(runtime.element('support-count').textContent, '1');
    assert.equal(runtime.element('stale-count').textContent, '1');
    assert.match(runtime.element('shelter-table-body').innerHTML, /5分前/);
    assert.match(runtime.element('shelter-table-body').innerHTML, /確定/);
    assert.match(runtime.element('shelter-table-body').innerHTML, /推定/);
    assert.match(runtime.element('shelter-table-body').innerHTML, /未確認/);
  });

  it('keeps sorting and single-choice filtering operational', async () => {
    const runtime = createHqRuntime([hqShelters]);
    await runtime.start();

    runtime.sort('evacuees');
    const sortedTable = runtime.element('shelter-table-body').innerHTML;
    assert.ok(sortedTable.indexOf('41人') < sortedTable.indexOf('63人'));
    assert.ok(sortedTable.indexOf('63人') < sortedTable.indexOf('86人'));
    assert.equal(runtime.sortHeader('evacuees').getAttribute('aria-sort'), 'ascending');

    runtime.filter('attention');
    assert.equal(countRenderedRows(runtime.element('shelter-table-body').innerHTML), 2);
    assert.match(runtime.element('shelter-table-body').innerHTML, /I市立Alpha中学校/);
    assert.match(runtime.element('shelter-table-body').innerHTML, /I市立Beta小学校/);

    runtime.filter('support');
    assert.equal(countRenderedRows(runtime.element('shelter-table-body').innerHTML), 1);
    assert.match(runtime.element('shelter-table-body').innerHTML, /I市立Beta小学校/);
  });

  it('keeps list and detail selection usable when the map library is unavailable', async () => {
    const runtime = createHqRuntime([hqShelters], {
      'shelter-004': {
        latestSupply: { supplyType: 'water', quantity: 12, unit: '箱', occurredAt: '2026-08-14T04:10:00.000Z', updatedBy: 'demo-hq-01' },
        latestIssue: { category: 'water', severity: 'caution', occurredAt: '2026-08-14T04:12:00.000Z', updatedBy: 'demo-hq-01' },
        history: [{ eventType: 'issue_update', occurredAt: '2026-08-14T04:12:00.000Z', updatedBy: 'demo-hq-01' }]
      }
    });
    await runtime.start();

    assert.equal(countRenderedRows(runtime.element('shelter-table-body').innerHTML), 5);
    assert.equal(runtime.element('map-error').hidden, false);
    assert.match(runtime.element('map-error').textContent, /一覧はそのまま利用できます/);

    runtime.row('shelter-004').dispatch('click');
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(runtime.element('detail-title').textContent, 'I市立Gamma小学校');
    assert.equal(runtime.element('detail-evacuees').textContent, '63人');
    assert.match(runtime.element('detail-supplies').textContent, /水 12箱/);
    assert.match(runtime.element('detail-facility-issues').innerHTML, /水道・注意/);
    assert.deepEqual(runtime.detailRequests().at(-1), '/shelters/shelter-004');
  });
});

describe('HQ Dashboard API failure state transitions', () => {
  it('preserves the five rendered shelters when a later poll fails', async () => {
    const runtime = createHqRuntime([hqShelters, new Error('network unavailable')]);
    await runtime.start();
    const initialTable = runtime.element('shelter-table-body').innerHTML;

    assert.equal(countRenderedRows(initialTable), 5);
    assert.match(initialTable, /I市立Alpha中学校/);
    assert.match(initialTable, /86人/);
    assert.match(initialTable, /status-yellow/);
    assert.match(initialTable, /未確認/);

    await runtime.poll();

    assert.equal(runtime.element('shelter-table-body').innerHTML, initialTable);
    assert.equal(countRenderedRows(runtime.element('shelter-table-body').innerHTML), 5);
    assert.equal(runtime.element('dashboard-error').hidden, false);
    assert.match(runtime.element('dashboard-error').textContent, /直前の表示を維持しています/);
  });

  it('keeps the initial list empty without legacy fallback when the first request fails', async () => {
    const runtime = createHqRuntime([new Error('network unavailable')]);
    await runtime.start();
    const tableHtml = runtime.element('shelter-table-body').innerHTML;

    assert.equal(countRenderedRows(tableHtml), 0);
    assert.doesNotMatch(tableHtml, /999|旧JSON/);
    assert.equal(runtime.localStorageReads(), 0);
    assert.equal(runtime.element('dashboard-error').hidden, false);
    assert.match(runtime.element('dashboard-error').textContent, /避難所情報を読み込めませんでした/);
  });

  it('renders the latest API values and clears the error on the next successful poll', async () => {
    const recoveredShelters = hqShelters.map((shelter) => shelter.shelterId === 'shelter-002'
      ? { ...shelter, currentCount: 91, status: 'red', confidence: 'estimated' }
      : shelter);
    const runtime = createHqRuntime([new Error('network unavailable'), recoveredShelters]);
    await runtime.start();

    assert.equal(countRenderedRows(runtime.element('shelter-table-body').innerHTML), 0);
    assert.equal(runtime.element('dashboard-error').hidden, false);

    await runtime.poll();
    const recoveredTable = runtime.element('shelter-table-body').innerHTML;

    assert.equal(countRenderedRows(recoveredTable), 5);
    assert.match(recoveredTable, /I市立Alpha中学校/);
    assert.match(recoveredTable, /91人/);
    assert.match(recoveredTable, /status-red/);
    assert.match(recoveredTable, /推定/);
    assert.equal(runtime.element('dashboard-error').hidden, true);
    assert.equal(runtime.element('dashboard-error').textContent, '');
  });
});
