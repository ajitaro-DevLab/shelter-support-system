const assert = require('node:assert/strict');
const fs = require('node:fs');
const { describe, it } = require('node:test');

const source = fs.readFileSync('js/event-center.js', 'utf8');
const html = fs.readFileSync('event-center.html', 'utf8');

describe('Event Center API migration contract', () => {
  it('uses the shared API client for the detail GET and five POST endpoints', () => {
    assert.match(source, /ApiClient\.apiGet/);
    assert.match(source, /ApiClient\.apiPost/);
    [
      '/events/visitor-change',
      '/confirmations',
      '/supplies',
      '/issues',
      '/notices'
    ].forEach((path) => assert.ok(source.includes(path), `${path} is missing`));
  });

  it('does not use EventStore or localStorage for business data', () => {
    assert.doesNotMatch(source, /EventStore|localStorage/);
    assert.doesNotMatch(html, /js\/event-store\.js/);
  });

  it('does not present the former localStorage reset as a DB reset', () => {
    assert.doesNotMatch(html, /試験データをリセット|reset-execute/);
    assert.match(html, /DB初期化は管理コマンド/);
  });

  it('uses the configured shelter and user without fixed demo IDs', () => {
    assert.match(source, /DemoContext\.getDemoContextState/);
    assert.match(source, /DemoContext\.isDemoContextConfigured/);
    assert.doesNotMatch(source, /CURRENT_SHELTER_ID|DEMO_USER_ID|shelter-002|demo-user-01/);
    assert.equal((source.match(/encodeURIComponent\(currentShelter\.id\)/g) || []).length, 5);
    assert.equal((source.match(/updatedBy: currentDemoContext\.userId/g) || []).length, 5);
    assert.match(html, /js\/demo-context\.js/);
  });

  it('shows the configured context in the header and every input modal', () => {
    assert.match(html, /id="event-current-shelter"/);
    assert.match(html, /id="event-current-user"/);
    assert.equal((html.match(/data-event-context-shelter/g) || []).length, 5);
    assert.equal((html.match(/data-event-context-updater/g) || []).length, 5);
    assert.match(html, /Launcherで設定する/);
  });

  it('makes sending and unsaved failure states explicit', () => {
    assert.match(source, /confirmButton\.disabled = true/);
    assert.match(source, /confirmButton\.textContent = '保存中…'/);
    assert.match(source, /保存されていません。通信状態を確認して、もう一度実行してください。/);
    assert.match(source, /confirmButton\.textContent = defaultLabel/);
  });
});
