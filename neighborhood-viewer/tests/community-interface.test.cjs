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
function setup(domainSets = [['A','B','G','X'],['A','B','G','Y'],['A','B','H','Z'],['Private']], options = {}) {
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
  if (options.prepareSnapshot) options.prepareSnapshot(snapshot);
  let selection = null, onChange;
  const viewer = {
    getAnalysisSnapshot: () => snapshot, clearAnalysisFocus() { selection = null; },
    setAnalysisFocus(value) { selection = value; return { matchedRows:value.entryIds.length }; },
    onAnalysisChange(handler) { onChange = handler; }
  };
  const controller = window.NeighborhoodAnalysisEditor.init(viewer, { addToColorList: options.addToColorList, workerFactory: () => ({
    terminate() {}, async postMessage(message) {
      try {
        const result = await core.analyze(message.snapshot, message.options, { yield:false });
        result.alternatives = {disabled:true,candidates:[],parameters:result.options.alternatives};
        this.onmessage({data:{type:'result',requestId:message.requestId,result}});
      } catch (error) { this.onmessage({data:{type:'error',requestId:message.requestId,error:{message:error.message}}}); }
    }
  }) });
  return {controller,elements,snapshot,api:window.NeighborhoodAnalysisEditor,getDownloaded:()=>downloaded,getSelection:()=>selection,changed:reason=>onChange({type:'data',reason})};
}

test('community-first controls run, select member neighborhoods, clear, and invalidate results', async () => {
  const {controller,elements,getSelection,changed} = setup();
  assert.equal(elements.get('analysisThreshold').value,'0.33');
  assert.equal(elements.get('analysisGrouping').value,'louvain');
  assert.equal(await controller.run(), true, elements.get('analysisStatus').textContent);
  const cards = elements.get('analysisCommunities').children;
  assert.equal(cards.length,1);
  assert.match(cards[0].textContent.replace(/\s+/g,' '),/A B G/);
  assert.doesNotMatch(cards[0].textContent,/Private|v0|v1|v2/);
  cards[0].children.find(e=>e.tagName==='button'&&e.textContent==='Show neighborhoods').events.click();
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
  assert.match(elements.get('analysisCommunities').textContent.replace(/\s+/g,' '),/A B G/);
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

function connectorBoxes(elements, id) {
  const found=[];
  function visit(node) {
    if(node.tagName==='input'&&node['aria-label']===`Select connector ${id}`) found.push(node);
    for(const child of node.children) visit(child);
  }
  visit(elements.get('analysisCommunities'));
  return found;
}

test('connector selections synchronize across communities and add each original ID once', async () => {
  const calls=[];
  const {controller,elements}=setup([['nPUA','B','C'],['nPUA','B','C'],['nPUA','X','Y'],['nPUA','X','Y']],{
    addToColorList(ids){calls.push(Array.from(ids));return{added:ids.length,alreadyIncluded:0};}
  });
  assert.equal(await controller.run(),true);
  const boxes=connectorBoxes(elements,'nPUA');
  assert.equal(boxes.length,2);
  boxes[0].checked=true;boxes[0].events.change();
  assert.equal(boxes[1].checked,true);
  assert.match(elements.get('analysisConnectorSelectionCount').textContent,/1 connector/);
  const result=controller.getState().result;
  for(const card of elements.get('analysisCommunities').children) card.children.find(e=>e.textContent==='Select all connectors').events.click();
  elements.get('analysisAddConnectorColors').events.click();
  assert.deepEqual(calls[0].sort(),['B','C','X','Y','nPUA']);
  assert.equal(controller.getState().result,result);
  assert.equal(connectorBoxes(elements,'nPUA')[0].checked,false);
  assert.equal(elements.get('analysisAddConnectorColors').disabled,true);
});

test('selections survive searches and clearing them does not change the color list', async () => {
  const calls=[];
  const {controller,elements}=setup([['A','B'],['A','B'],['X','Y'],['X','Y']],{
    addToColorList(ids){calls.push(ids);return{added:ids.length,alreadyIncluded:0};}
  });
  await controller.run();
  const box=connectorBoxes(elements,'A')[0];box.checked=true;box.events.change();
  elements.get('analysisCommunitySearch').value='X';elements.get('analysisCommunitySearch').events.input();
  assert.match(elements.get('analysisConnectorSelectionCount').textContent,/1 connector/);
  elements.get('analysisClearConnectorSelection').events.click();
  assert.equal(calls.length,0);
  elements.get('analysisCommunitySearch').value='';elements.get('analysisCommunitySearch').events.input();
  assert.equal(connectorBoxes(elements,'A')[0].checked,false);
});

test('renamed connector groups resolve to their original raw IDs', async () => {
  const calls=[];
  const {controller,elements}=setup([['A','B','C'],['A','B','C']],{
    prepareSnapshot(snapshot){for(const entry of snapshot.entries)for(const d of entry.genes[0].domains)if(d.rawName==='A'||d.rawName==='B')d.name='Merged';},
    addToColorList(ids){calls.push(Array.from(ids));return{added:ids.length,alreadyIncluded:0};}
  });
  elements.get('analysisRepresentation').value='display';
  assert.equal(await controller.run(),true);
  const box=connectorBoxes(elements,'Merged')[0];box.checked=true;box.events.change();
  elements.get('analysisAddConnectorColors').events.click();
  assert.deepEqual(calls[0].sort(),['A','B']);
});

test('color-only updates keep analysis and community focus valid; rename changes invalidate it', async () => {
  let h;
  h=setup(undefined,{
    prepareSnapshot(snapshot){for(const entry of snapshot.entries){for(const domain of entry.genes[0].domains)domain.color='#111111';entry.queryGenes=entry.genes;}},
    addToColorList(ids){
      for(const entry of h.snapshot.entries)for(const domain of entry.genes[0].domains)if(ids.includes(domain.rawName))domain.color='#abcdef';
      h.snapshot.revision++;
      h.changed('dictionary-update');
      return{added:ids.length,alreadyIncluded:0};
    }
  });
  await h.controller.run();
  h.elements.get('analysisCommunities').children[0].children.find(e=>e.textContent==='Show neighborhoods').events.click();
  const box=connectorBoxes(h.elements,'A')[0];box.checked=true;box.events.change();
  h.elements.get('analysisAddConnectorColors').events.click();
  assert.equal(h.controller.getState().stale,false);
  assert.deepEqual(Array.from(h.getSelection().entryIds),['v0','v1','v2']);
  h.snapshot.dictionaries={renames:{A:'Changed'}};
  h.changed('dictionary-update');
  assert.equal(h.controller.getState().stale,true);
  assert.equal(h.elements.get('analysisAddConnectorColors').disabled,true);
});

test('a changed scientific input blocks pending additions before the callback runs', async () => {
  let calls=0;
  const h=setup(undefined,{addToColorList(){calls++;return{added:1,alreadyIncluded:0};}});
  await h.controller.run();
  const box=connectorBoxes(h.elements,'A')[0];box.checked=true;box.events.change();
  h.snapshot.filters={maxIntergenicDistance:999};
  h.elements.get('analysisAddConnectorColors').events.click();
  assert.equal(calls,0);
  assert.equal(h.controller.getState().stale,true);
});

test('older color-sensitive fingerprints import and migrate to the scientific fingerprint', async () => {
  const h=setup(undefined,{prepareSnapshot(snapshot){for(const entry of snapshot.entries)for(const d of entry.genes[0].domains)d.color='#111111';}});
  await h.controller.run();
  const session=JSON.parse(JSON.stringify(h.controller.exportSession()));
  const oldWindow={};
  const legacySource=fs.readFileSync(path.join(__dirname,'../editor/analysis.js'),'utf8').replace('legacyColors = false','legacyColors = true');
  vm.runInNewContext(legacySource,{window:oldWindow});
  session.fingerprint=oldWindow.NeighborhoodAnalysisEditor.contentFingerprint(session.snapshot);
  assert.notEqual(session.fingerprint,h.api.contentFingerprint(session.snapshot));
  assert.equal(h.controller.importSession(session).matched,true);
  assert.equal(h.controller.exportSession().fingerprint,h.api.contentFingerprint(session.snapshot));
});
