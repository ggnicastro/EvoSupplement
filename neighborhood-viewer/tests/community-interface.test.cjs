const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../editor/analysis-core.js');
const communities = require('../editor/analysis-communities.js');
const JSZip = require('../editor/vendor/jszip.min.js');

// Exercise controller behavior against the real HTML IDs/defaults. This small
// DOM harness does not assert layout or substitute for a visual browser review.
function setup(domainSets = [['A','B','G','X'],['A','B','G','Y'],['A','B','H','Z'],['Private']]) {
  const html = fs.readFileSync(path.join(__dirname, '../editor/index.html'), 'utf8');
  const elements = new Map();
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.events = {}; this.value = ''; this.dataset = {}; this.hidden = false; this.classList = { toggle() {} }; this._text = ''; }
    appendChild(child) { this.children.push(child); if (this.tagName === 'select' && this.children.length === 1) this.value = child.value; return child; }
    get firstChild() { return this.children[0]; }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(c => c.textContent).join(' '); }
    setAttribute(key, value) { this[key] = value; }
    addEventListener(type, handler) { this.events[type] = handler; }
    click() {}
    remove() {}
    querySelectorAll(selector) { return [...elements.values()].filter(e => selector === '[data-analysis-tab]' ? e.dataset.analysisTab : ['input', 'select'].includes(e.tagName)); }
  }
  for (const match of html.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const [,tag,attributes,id] = match, element = new Element(tag);
    assert.equal(elements.has(id), false, `Duplicate HTML ID: ${id}`);
    element.id = id;
    element.value = attributes.match(/\bvalue="([^"]*)"/)?.[1] || '';
    element.checked = /\bchecked\b/.test(attributes);
    element.hidden = /\bhidden\b/.test(attributes);
    element.dataset.analysisTab = attributes.match(/data-analysis-tab="([^"]+)"/)?.[1];
    if (tag === 'select') element.value = html.slice(match.index + match[0].length).split('</select>')[0].match(/value="([^"]*)"/)?.[1] || '';
    elements.set(id, element);
  }
  const document = { getElementById(id) { assert.ok(elements.has(id), `Missing HTML ID: ${id}`); return elements.get(id); }, createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag) };
  document.body = new Element('body');
  let downloaded;
  const window = { NeighborhoodCommunities: communities, JSZip, addEventListener() {} };
  const URL = {createObjectURL(blob) { downloaded = blob; return 'blob:test'; }, revokeObjectURL() {}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../editor/analysis.js'), 'utf8'), { window, document, Blob, URL, setTimeout: fn=>fn(), clearTimeout, console });
  const snapshot = { scope:'visible', datasetId:1, revision:1, source:{name:'fixture'}, entries:domainSets.map((ids,i)=>({
    id:`v${i}`, sourceId:`block${i}`, coordinateSource:'synthetic', genes:[{pid:`p${i}`,start:1,end:100,strand:'+',query:true,domains:ids.map(name=>({rawName:name,name}))}]
  })) };
  let selection = null, onChange;
  const viewer = {
    getAnalysisSnapshot: () => snapshot, clearAnalysisFocus() { selection = null; },
    setAnalysisFocus(value) { selection = value; return { matchedRows:value.entryIds.length }; },
    onAnalysisChange(handler) { onChange = handler; }
  };
  const controller = window.NeighborhoodAnalysisEditor.init(viewer, { workerFactory: () => ({
    terminate() {}, async postMessage(message) {
      try {
        const result = await core.analyze(message.snapshot, message.options, { yield:false });
        result.alternatives = {disabled:true,candidates:[],parameters:result.options.alternatives};
        this.onmessage({data:{type:'result',requestId:message.requestId,result}});
      } catch (error) { this.onmessage({data:{type:'error',requestId:message.requestId,error:{message:error.message}}}); }
    }
  }) });
  return {controller,elements,getDownloaded:()=>downloaded,getSelection:()=>selection,changed:()=>onChange({type:'data'})};
}

test('community-first controls run, select member neighborhoods, clear, and invalidate results', async () => {
  const {controller,elements,getSelection,changed} = setup();
  assert.equal(elements.get('analysisThreshold').value,'0.33');
  assert.equal(elements.get('analysisGrouping').value,'louvain');
  assert.equal(await controller.run(), true, elements.get('analysisStatus').textContent);
  const cards = elements.get('analysisCommunities').children;
  assert.equal(cards.length,1);
  assert.match(cards[0].textContent,/A, B, G/);
  assert.doesNotMatch(cards[0].textContent,/Private|v0|v1|v2/);
  cards[0].children.find(e=>e.tagName==='button').events.click();
  assert.deepEqual(Array.from(getSelection().entryIds),['v0','v1','v2']);
  elements.get('analysisClearFocus').events.click();
  assert.equal(getSelection(),null);
  changed();
  assert.equal(elements.get('analysisCommunities').children[0].children.find(e=>e.tagName==='button').disabled,true);
});

test('analysis JSON round trip restores selection and validates connector support', async () => {
  const {controller,elements} = setup();
  assert.equal(await controller.run(),true);
  const session = JSON.parse(JSON.stringify(controller.exportSession()));
  assert.equal(controller.importSession(session).matched,true);
  const bad = JSON.parse(JSON.stringify(session));
  bad.result.groups[0].connectors[0].edgeCount = 999;
  assert.throws(()=>controller.importSession(bad),/connector domains disagree/);
  const badSharedCount=JSON.parse(JSON.stringify(session));
  badSharedCount.result.edges[0].sharedDomainCount=999;
  assert.throws(()=>controller.importSession(badSharedCount),/shared-domain count disagrees/);
  assert.equal(elements.get('analysisCommunities').children.length,1);
});

test('legacy sessions retain their grouping and derive connectors from saved edges', async () => {
  const {controller,elements} = setup();
  assert.equal(await controller.run(),true);
  const legacy = JSON.parse(JSON.stringify(controller.exportSession()));
  legacy.editorVersion = legacy.result.version = '1.0.0';
  legacy.settings.grouping = legacy.result.options.grouping = 'components';
  for (const key of ['resolution','seed','iterations','minSharedDomains']) {
    delete legacy.settings[key]; delete legacy.result.options[key];
  }
  for (const group of legacy.result.groups) { delete group.connectors; delete group.internalEdges; }
  assert.equal(controller.importSession(legacy).matched,true);
  assert.match(elements.get('analysisCommunitySummary').textContent,/legacy/);
  assert.match(elements.get('analysisCommunities').textContent,/A, B, G/);
});

test('ZIP exports simple connector lists alongside complete membership and edge tables', async () => {
  const {controller,getDownloaded} = setup();
  assert.equal(await controller.run(),true);
  await controller.exportResults();
  assert.ok(getDownloaded());
  const zip=await JSZip.loadAsync(await getDownloaded().arrayBuffer());
  const text=await zip.file('communities.txt').async('string');
  assert.equal(text,'Community 1: A, B, G\n');
  assert.doesNotMatch(text,/v0|v1|Private/);
  assert.match(await zip.file('groups.tsv').async('string'), /v0/);
  assert.ok(zip.file('similarity-links.tsv'));
  assert.ok(zip.file('analysis-session.json'));
});

test('pairs with only one shared domain create no community output or simple export', async () => {
  const {controller,elements,getDownloaded} = setup([['A','B'],['A','C']]);
  assert.equal(await controller.run(),true);
  assert.equal(controller.getState().result.edges.length,0);
  assert.equal(controller.getState().result.groups[0].connectors.length,0);
  assert.match(elements.get('analysisCommunities').textContent,/No communities with at least 2/);
  await controller.exportResults();
  const zip=await JSZip.loadAsync(await getDownloaded().arrayBuffer());
  assert.equal((await zip.file('communities.txt').async('string')).trim(),'');
});

test('rerunning an older session enforces a minimum of two even if it saved one', async () => {
  const {controller,elements} = setup();
  assert.equal(await controller.run(),true);
  const session=JSON.parse(JSON.stringify(controller.exportSession()));
  session.settings.minDomains=session.result.options.minDomains=1;
  controller.importSession(session);
  assert.equal(await controller.run(),true);
  assert.equal(controller.getState().settings.minDomains,2);
  assert.equal(elements.get('analysisMinDomains').value,'2');
});

test('older single-shared-domain links remain inspectable but disappear on rerun', async () => {
  const {controller,elements}=setup([['A','B'],['A','C']]);
  assert.equal(await controller.run(),true);
  const legacy=JSON.parse(JSON.stringify(controller.exportSession()));
  legacy.result.version=legacy.editorVersion='1.1.1';
  delete legacy.settings.minSharedDomains;
  delete legacy.result.options.minSharedDomains;
  const group=legacy.result.groups[0];
  group.members=['v0','v1'];group.count=2;group.sourceMembers=['v0','v1'];group.internalEdges=1;
  group.domains=[{id:'A',count:2,frequency:1},{id:'B',count:1,frequency:0.5},{id:'C',count:1,frequency:0.5}];
  group.connectors=[{id:'A',edgeCount:1,neighborhoodCount:2,members:['v0','v1']}];
  legacy.result.groups=[group];
  for(const obs of legacy.result.observations)obs.groupId=group.id;
  for(const node of legacy.result.nodes){node.groupId=group.id;node.degree=1;node.strength=1/3;}
  legacy.result.edges=[{source:'v0',target:'v1',similarity:1/3,compositionSimilarity:1/3,orderSimilarity:0}];
  assert.equal(controller.importSession(legacy).matched,true);
  assert.equal(controller.getState().result.edges.length,1);
  assert.match(elements.get('analysisCommunitySummary').textContent,/Archived result: single-domain links were allowed/);
  assert.equal(await controller.run(),true);
  assert.equal(controller.getState().settings.minSharedDomains,2);
  assert.equal(controller.getState().result.edges.length,0);
});
