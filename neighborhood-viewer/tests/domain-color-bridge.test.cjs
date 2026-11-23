const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup({ loaded = true } = {}) {
  const elements = {
    card: { hidden: true, open: false },
    message: { textContent: '', classList: { toggle() {} } }
  };
  const pending = new Map(), updates = [];
  let timerId = 0, scheduled = 0, onDataChange;
  const dictionaries = { renames: { A: 'Alpha' }, colors: { B: '#222222' } };
  const rawNames = ['A', 'B', 'C', '?', '-', 'TM', 'TMS', 'SIG', 'SIF', 'unknown', 'CustomMarker'];
  const stats = rawNames.map((rawName, index) => ({
    rawName, displayName: rawName, occurrences: 2, genes: 2,
    neighborhoods: 2, color: ['#111111', '#222222', '#333333'][index % 3], marker: rawName === 'CustomMarker'
  }));
  const viewer = {
    getDictionaries: () => dictionaries,
    getDomainStats: () => stats,
    getSummary: () => ({ inputFormat: 'standard', totalNeighborhoods: 2 }),
    setHighlightedDomain() {},
    onDomainSelect() {},
    onVisibleChange() {},
    onDataChange(handler) { onDataChange = handler; },
    updateDictionaries(value) { updates.push(value); }
  };
  const window = {
    NeighborhoodViewer: viewer,
    setTimeout(fn) { scheduled++; pending.set(++timerId, fn); return timerId; },
    clearTimeout(id) { pending.delete(id); }
  };
  const document = { getElementById: id => elements[id], querySelectorAll: () => [] };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../editor/domain-curation.js'), 'utf8'), { window, document, console });
  const editor = window.NeighborhoodDomainEditor.init({ card: 'card', message: 'message' });
  if (loaded) onDataChange({ reason: 'load', dictionaries });
  return {
    editor, elements, updates, scheduled: () => scheduled,
    flush() { for (const [id, fn] of [...pending]) { pending.delete(id); fn(); } }
  };
}

const selected = editor => [...editor.getState().records.values()].filter(record => record.colorIncluded).map(record => record.rawName);

test('adding connector IDs is additive, deduplicated and preserves colors and names', () => {
  const { editor, elements, updates, scheduled, flush } = setup();
  const state = editor.getState();
  const before = [...state.records.values()].map(record => ({ id: record.rawName, color: record.color, label: record.displayName }));
  const selectedRawName = state.selectedRawName;
  assert.deepEqual(selected(editor), ['B']);
  const result = editor.addToColorList(['A', 'B', 'A']);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { added: 1, alreadyIncluded: 1, total: 2 });
  assert.deepEqual(selected(editor), ['A', 'B']);
  assert.deepEqual([...state.records.values()].map(record => ({ id: record.rawName, color: record.color, label: record.displayName })), before);
  assert.equal(state.selectedRawName, selectedRawName);
  assert.equal(elements.card.open, true);
  assert.equal(scheduled(), 1);
  flush();
  assert.equal(updates.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(updates[0])), { renames: { A: 'Alpha' }, colors: { A: '#111111', B: '#222222' } });
  assert.match(elements.message.textContent, /Added 1 connector domain/);
});

test('requesting already-included connectors does not alter other selections or schedule work', () => {
  const { editor, scheduled } = setup();
  const result = editor.addToColorList(['B', 'B']);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { added: 0, alreadyIncluded: 1, total: 1 });
  assert.deepEqual(selected(editor), ['B']);
  assert.equal(scheduled(), 0);
});

test('missing IDs and display names are rejected atomically before any mutation', () => {
  for (const bad of ['Missing', 'Alpha', 'a', ' A']) {
    const { editor, scheduled, elements } = setup();
    const before = JSON.stringify([...editor.getState().records]);
    assert.throws(() => editor.addToColorList(['A', bad]), /not in the current input/);
    assert.equal(JSON.stringify([...editor.getState().records]), before);
    assert.equal(scheduled(), 0);
    assert.equal(elements.card.open, false);
  }
});

test('markers and unknown annotations are rejected atomically', () => {
  for (const bad of ['?', '-', 'TM', 'TMS', 'SIG', 'SIF', 'unknown', 'CustomMarker']) {
    const { editor, scheduled } = setup();
    assert.throws(() => editor.addToColorList(['A', bad]), /marker or unknown annotation/);
    assert.deepEqual(selected(editor), ['B']);
    assert.equal(scheduled(), 0);
  }
});

test('unloaded data and malformed requests are rejected without scheduling updates', () => {
  const unloaded = setup({ loaded: false });
  assert.throws(() => unloaded.editor.addToColorList(['A']), /Load neighborhood data/);
  assert.equal(unloaded.scheduled(), 0);
  for (const bad of [undefined, null, 'A', [], [null], [''], ['   '], ['A', 1]]) {
    const { editor, scheduled } = setup();
    assert.throws(() => editor.addToColorList(bad), /original domain ID/);
    assert.deepEqual(selected(editor), ['B']);
    assert.equal(scheduled(), 0);
  }
});
