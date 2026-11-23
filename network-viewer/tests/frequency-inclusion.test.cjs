const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGraph, frequencyNodeEdits, serializeCuratedNodeYaml } = require('../shared/network-viewer.js');

const config = {
  delimiter: '\t', maxNodes: 5000, maxAggregatedEdges: 30000,
  edgeColumns: { source: 'source', target: 'target', type: 'edge_type', count: 'edge_count' },
  nodeFields: { label: 'Display_name', include: 'Include', group: 'Function', notes: 'Notes' }
};
const edges = 'source\ttarget\tedge_type\tedge_count\nA\tB\tFusion\t1000\nB\tC\tFusion\t1\n';
const evidence = (id, blocks, proteins = blocks) => ({ id, blocks, proteins, occurrences: [] });
const ids = count => Array.from({ length: count }, (_, i) => String(i));
const rule = { unit: 'blocks', minimum: 5 };
const inclusion = entries => Object.fromEntries(entries.map(entry => [entry.id, entry.included]));
function graph(yaml = '', nodeEvidence = [], nodeEdits) {
  return buildGraph(edges, yaml, '', { ...config, nodeEvidence, nodeEdits });
}

test('default boundary uses distinct neighborhoods, independently of edge counts', () => {
  const g = graph('', [evidence('A', ids(4)), evidence('B', [...ids(5), '0']), evidence('C', ids(6))]);
  assert.deepEqual(inclusion(frequencyNodeEdits(g, rule, '', config, true).entries), { A: false, B: true, C: true });
});

test('protein unit counts distinct proteins rather than domain occurrences', () => {
  const g = graph('', [evidence('A', ids(6), ['p', 'p']), evidence('B', ['b'], ids(5))]);
  assert.deepEqual(inclusion(frequencyNodeEdits(g, { unit: 'proteins', minimum: 5 }, '', config).entries), { A: false, B: true, C: true });
});

test('automatic threshold preserves explicit YAML includes and fills missing Include', () => {
  const yaml = 'A:\n  Include: 1\nB:\n  Include: 0\nC:\n  Display_name: C\n';
  const g = graph(yaml, [evidence('A', ['x']), evidence('B', ids(6)), evidence('C', ids(5))]);
  assert.deepEqual(inclusion(frequencyNodeEdits(g, rule, yaml, config, true).entries), { A: true, B: false, C: true });
  assert.deepEqual(inclusion(frequencyNodeEdits(g, rule, yaml, config).entries), { A: false, B: true, C: true });
});

test('merged names use evidence unions and keep per-alias YAML priority', () => {
  const yaml = 'A:\n  Display_name: X\n  Include: 0\nB:\n  Display_name: X\n';
  const g = graph(yaml, [evidence('A', ['1', '2', '3']), evidence('B', ['3', '4', '5'])]);
  const entries = frequencyNodeEdits(g, rule, yaml, config, true).entries;
  assert.equal(inclusion(entries).A, false);
  assert.equal(inclusion(entries).B, true);
  const rebuilt = graph(yaml, [evidence('A', ['1', '2', '3']), evidence('B', ['3', '4', '5'])], entries);
  assert.equal(rebuilt.nodeMap.get('X').yamlIncluded, true);
  assert.equal(rebuilt.nodeMap.get('X').blockFrequency, 5);
});

test('edge-only data never substitutes edge count for frequency', () => {
  const g = graph();
  const result = frequencyNodeEdits(g, rule, '', config, true);
  assert.equal(result.evaluated, 0);
  assert.deepEqual(inclusion(result.entries), { A: true, B: true, C: true });
});

test('saved YAML preserves threshold choices and incomplete evidence stays unknown', () => {
  const yaml = `A:\n  Evidence_blocks: '${JSON.stringify(ids(6))}'\n`;
  const g = graph(yaml);
  assert.equal(g.nodeMap.get('A').proteinFrequency, null);
  assert.equal(frequencyNodeEdits(g, { unit: 'proteins', minimum: 5 }, yaml, config).evaluated, 0);
  const result = frequencyNodeEdits(g, rule, yaml, config, true);
  const applied = graph(yaml, [], result.entries);
  const saved = serializeCuratedNodeYaml(applied, yaml, config);
  assert.doesNotMatch(saved, /Evidence_proteins/);
  const restored = graph(saved);
  assert.equal(restored.nodeMap.get('A').yamlIncluded, true);
  assert.equal(restored.nodeMap.get('A').blockFrequency, 6);
  assert.equal(restored.nodeMap.get('A').proteinFrequency, null);
});

test('invalid limits fail before modifying inclusion', () => {
  for (const minimum of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => frequencyNodeEdits(graph(), { unit: 'blocks', minimum }, '', config), /positive whole number/);
  }
});

test('standard neighborhood conversion feeds complete-input frequencies into inclusion', () => {
  global.window = globalThis;
  require('../../neighborhood-viewer/shared/neighborhood-viewer.js');
  require('../shared/neighborhood-network.js');
  const rows = ['block_id\tpid\tnucleotide\tstart\tend\tstrand\tquery\tdom\tdomp'];
  for (let i = 0; i < 6; i++) {
    rows.push(`b${i}\tp${i}\tchr\t1\t300\t+\t1\tCommon\t1`);
    rows.push(`b${i}\tp${i}\tchr\t1\t300\t+\t1\tCommon\t2`);
    if (i < 4) rows.push(`b${i}\tp${i}\tchr\t1\t300\t+\t1\tRare\t3`);
    rows.push(`b${i}\tq${i}\tchr\t400\t600\t+\t0\tNeighbor\t1`);
  }
  const conversion = global.NetworkNeighborhood.convert(rows.join('\n'), { format: 'standard', scope: 'all', proximity: 'all' });
  const g = buildGraph(conversion.edgeText, '', '', { ...config, nodeEvidence: conversion.nodeEvidence });
  assert.equal(g.nodeMap.get('Common').proteinFrequency, 6);
  assert.equal(g.nodeMap.get('Common').occurrenceFrequency, 12);
  assert.deepEqual(inclusion(frequencyNodeEdits(g, rule, '', config, true).entries), { Common: true, Neighbor: true, Rare: false });
  delete global.window;
});
