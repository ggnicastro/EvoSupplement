const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../editor/analysis-core.js');
const { connectorSummaries, detectCommunities } = require('../editor/analysis-communities.js');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function snapshot(sets) {
  return { scope: 'visible', datasetId: 1, revision: 1, entries: sets.map((domains, i) => ({
    id: `v${i}`, sourceId: `block${i}`, coordinateSource: 'synthetic',
    genes: [{ pid: `p${i}`, start: 1, end: 100, query: true, strand: '+',
      domains: domains.map(name => ({ rawName: name, name })) }]
  })) };
}
const analyze = (data, options = {}) => core.analyze(data, options, { yield: false });

test('defaults are binary Jaccard, 0.33, Louvain and complete threshold edges', async () => {
  const result = await analyze(snapshot([['A','B','G','X'], ['A','B','G','Y'], ['A','B','H','Z'], ['U']]));
  assert.equal(result.options.threshold, 0.33);
  assert.equal(result.options.grouping, 'louvain');
  assert.equal(result.edges.length, 3);
  assert.equal(result.summary.omittedEdges, 0);
  assert.equal(result.summary.isolates, 1);
  assert.deepEqual(result.groups[0].connectors.map(d => d.id), ['A','B','G']);
  assert.deepEqual(result.groups[0].members, ['v0','v1','v2']);
  assert.deepEqual(result.groups[1].connectors, []);
});

test('threshold is inclusive, with no rounding before edge selection', async () => {
  const data = snapshot([['A','B'], ['A','C']]);
  assert.equal((await analyze(data, { threshold: 1/3 })).edges.length, 1);
  assert.equal((await analyze(data, { threshold: 0.34 })).edges.length, 0);
});

test('all threshold-qualified edges survive even with a legacy top-K of one', async () => {
  const result = await analyze(snapshot(Array.from({length: 6}, () => ['A','B'])), { maxNeighbors: 1 });
  assert.equal(result.edges.length, 15);
  assert.equal(result.summary.qualifiedEdges, 15);
  assert.equal(result.summary.topK, null);
});

test('copy counts, gene order and strand do not change presence similarity', async () => {
  const data = snapshot([['A','A','B'], ['B','A']]);
  data.entries[1].genes[0].strand = '-';
  const result = await analyze(data);
  assert.equal(result.edges[0].similarity, 1);
});

test('connectors exclude private domains and cross-community-only support', () => {
  const observations = [
    {id:'a',domainIds:['A','Private','Cross']}, {id:'b',domainIds:['A']},
    {id:'c',domainIds:['Cross','B']}, {id:'d',domainIds:['B']}
  ];
  const groups = [{id:'g1',members:['a','b']},{id:'g2',members:['c','d']}];
  const summaries = connectorSummaries(observations, [{source:'a',target:'b'},{source:'c',target:'d'},{source:'a',target:'c'}], groups);
  assert.deepEqual(summaries.map(g => g.connectors.map(c => c.id)), [['A'],['B']]);
  assert.equal(summaries[0].connectors[0].edgeCount, 1);
  assert.equal(summaries[0].connectors[0].neighborhoodCount, 2);
});

test('one domain can support multiple communities', () => {
  const summaries = connectorSummaries(['a','b','c','d'].map(id=>({id,domainIds:['A']})),
    [{source:'a',target:'b'},{source:'c',target:'d'}], [{id:'g1',members:['a','b']},{id:'g2',members:['c','d']}]);
  assert.deepEqual(summaries.map(g=>g.connectors[0].id), ['A','A']);
});

test('both community methods are deterministic for a fixed seed and separate disjoint modules', () => {
  const nodes = ['a','b','c','d','e','f','isolated'].map(id => ({id}));
  const edges = [['a','b'],['b','c'],['a','c'],['d','e'],['e','f'],['d','f']].map(([source,target])=>({source,target,totalCount:0.9}));
  for (const algorithm of ['louvain','leiden']) {
    const options={resolution:1,seed:42,iterations:20};
    const a=detectCommunities(algorithm,nodes,edges,options),b=detectCommunities(algorithm,nodes,edges,options);
    assert.deepEqual(a.communities,b.communities);
    assert.deepEqual(a.communities.map(c=>c.members), [['a','b','c'],['d','e','f'],['isolated']]);
  }
});

test('edge and comparison budgets fail explicitly instead of pruning', async () => {
  const data = snapshot(Array.from({length: 5}, () => ['A']));
  await assert.rejects(analyze(data,{maxEdges:2}), /No partial graph/);
  await assert.rejects(analyze(data,{maxPairs:2}), /No partial network/);
});

test('empty data and one isolated neighborhood produce no fabricated connectors', async () => {
  assert.deepEqual((await analyze(snapshot([]))).groups, []);
  const result=await analyze(snapshot([['A']]));
  assert.equal(result.summary.isolates,1);
  assert.deepEqual(result.groups[0].connectors,[]);
});

test('production worker imports its dependencies and returns connector results', async () => {
  const directory=path.join(__dirname,'../editor');
  let resolve;
  const completed=new Promise(done=>{resolve=done;});
  const context=vm.createContext({setTimeout,console});
  context.self=context;
  context.postMessage=message=>{if(message.type==='result'||message.type==='error')resolve(message);};
  context.importScripts=(...urls)=>{for(const url of urls)vm.runInContext(fs.readFileSync(path.join(directory,url.split('?')[0]),'utf8'),context);};
  vm.runInContext(fs.readFileSync(path.join(directory,'analysis-worker.js'),'utf8'),context);
  await context.onmessage({data:{type:'analyze',requestId:1,snapshot:snapshot([['A','B'],['A','C']]),options:{}}});
  const response=await completed;
  assert.equal(response.type,'result',response.error?.message);
  assert.equal(response.result.options.threshold,0.33);
  assert.equal(response.result.groups[0].connectors[0].id,'A');
  assert.equal(response.result.alternatives.disabled,true);
});
