const assert = require('node:assert/strict');
const fs = require('node:fs');
const { describe, it } = require('node:test');

const productionHtml = [
  'index.html', 'event-center.html', 'hq-dashboard.html', 'information.html', 'launcher.html'
].map((path) => fs.readFileSync(path, 'utf8')).join('\n');
const productionJs = [
  'js/main.js', 'js/map.js', 'js/home-events.js', 'js/event-center.js',
  'js/hq-dashboard.js', 'js/information.js'
].map((path) => fs.readFileSync(path, 'utf8')).join('\n');

describe('Phase 3 frontend business dependency removal', () => {
  it('does not load EventStore from a production screen', () => {
    assert.doesNotMatch(productionHtml, /js\/event-store\.js/);
  });

  it('does not use EventStore, localStorage, or legacy update events in production data flows', () => {
    assert.doesNotMatch(productionJs, /EventStore|localStorage|shelter-event-updated|addEventListener\(['"]storage/);
  });

  it('uses static Home shelter JSON only for coordinates and HQ API for business state', () => {
    const mainSource = fs.readFileSync('js/main.js', 'utf8');
    assert.match(mainSource, /apiGet\('\/hq\/shelters'\)/);
    assert.match(mainSource, /latitude: location\.latitude/);
    assert.match(mainSource, /longitude: location\.longitude/);
    assert.match(mainSource, /status: apiShelter\.status/);
    assert.match(mainSource, /evacuees: \{ total: apiShelter\.currentCount \}/);
    assert.match(mainSource, /updatedAt: apiShelter\.updatedAt/);
    assert.doesNotMatch(mainSource, /applyShelterUpdates|applyHistoryUpdates/);
  });

  it('keeps only allowed static JSON uses in production screens', () => {
    assert.match(productionJs, /data\/shelters\.json/);
    assert.match(productionJs, /data\/supplies\.json/);
    assert.match(productionJs, /data\/events\.json/);
    assert.doesNotMatch(productionJs, /data\/history\.json|data\/notices\.json/);
  });
});
