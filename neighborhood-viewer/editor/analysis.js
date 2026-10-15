/* EvoSupplement Neighborhood analysis workspace. Loaded only by the editor. */
(() => {
  'use strict';
  const VERSION = '1.0.0';
  const PAGE_SIZE = 20;
  const MAX_DRAW_NODES = 200;
  const MAX_DRAW_EDGES = 800;
  const KIND = 'EvoSupplementNeighborhoodAnalysis';
  const COLORS = ['#3672c5', '#dc7540', '#399985', '#9863b9', '#c14b6b', '#9a8736', '#497c9b', '#8d6c57'];
  const fmt = value => Number(value || 0).toLocaleString('en-US');
  const score = value => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toFixed(3);
  const pValue = value => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value) === 0 ? '< 1e−300' : Number(value) < 0.001 ? Number(value).toExponential(2) : Number(value).toFixed(3);
  const array = value => Array.isArray(value) ? value : [];
  const clone = value => JSON.parse(JSON.stringify(value));
  function canonical(value) {
    if (value == null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(item => item === undefined ? 'null' : canonical(item)).join(',') + ']';
    return '{' + Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  // Dataset IDs are local load counters. Scientific content, not those counters,
  // determines whether an imported session may select rows in the current data.
  function contentKey(snapshot) {
    return canonical({ scope: snapshot.scope, format: snapshot.source?.format, filters: snapshot.filters,
      renames: snapshot.dictionaries?.renames || {}, entries: array(snapshot.entries).map(entry => {
        const copy = { ...entry }; delete copy.id; delete copy.analysisId; return copy;
      }) });
  }
  function fingerprint(text) {
    let a = 2166136261, b = 5381;
    for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
    return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}-${text.length}`;
  }
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }
  function empty(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function button(text, action, disabled = false) {
    const node = el('button', text, 'nbh-editor-button'); node.type = 'button'; node.disabled = disabled; node.addEventListener('click', action); return node;
  }
  function download(name, blob) {
    const url = URL.createObjectURL(blob), link = el('a'); link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function tsv(rows, fields) {
    const safe = value => {
      const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
      // Quoting alone does not prevent spreadsheet formula evaluation.
      const escaped = /^[=+@-]/.test(text) ? "'" + text : text;
      return /[\t\n\r"]/.test(escaped) ? '"' + escaped.replace(/"/g, '""') + '"' : escaped;
    };
    return fields.map(([label]) => safe(label)).join('\t') + '\n' + rows.map(row => fields.map(([, get]) => safe(typeof get === 'function' ? get(row) : row[get])).join('\t')).join('\n') + '\n';
  }
  function create(viewer, hooks = {}) {
    if (!viewer?.getAnalysisSnapshot) throw new Error('The Neighborhood analysis bridge is unavailable. Reload the updated editor.');
    const ids = ['Card','Summary','Setup','Scope','Representation','Metric','Threshold','ExcludeQuery','MinDomains','TopK','Grouping','Overlap','Window','AlternativesEnabled','MinSupport','MinExpected','MaxBoth','MaxQ','MaxPairs','MaxEdges','AlternativePairs','ContextLimit','StratumField','StratumValue','MetadataFields','Run','Cancel','Progress','Status','Load','LoadInput','Stale','Results','ClearFocus','Save','Export','Selection','Tabs','Panel','Overview','Network','NetworkGroup','NetworkNote','Graph','TabDescription','Search','ViewField','View','Sort','RowCount','TableHead','TableBody','Empty','Prev','Next','PageInfo','Detail','Provenance'];
    const e = Object.fromEntries(ids.map(id => [id, document.getElementById('analysis' + id)]));
    const state = { result: null, snapshot: null, settings: null, fingerprint: '', stale: false, running: false, worker: null, requestId: 0, tab: 'overview', page: 0, rows: [], view: '', selected: null, currentIds: new Map(), sourceKey: '', saved: true };
    function status(message, error = false) { e.Status.textContent = message; e.Status.classList.toggle('is-error', error); }
    function number(id, min, max, integer = false) {
      const input = e[id], value = Number(input.value);
      if (input.value.trim() === '' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error(`Enter ${integer ? 'a whole number' : 'a number'} from ${min} to ${max} for ${input.closest?.('label')?.querySelector?.('span')?.textContent || id}.`);
      return value;
    }
    function readSettings() {
      const stratumField = e.StratumField.value.trim(), stratumValue = e.StratumValue.value.trim();
      if ((stratumField && !stratumValue) || (!stratumField && stratumValue)) throw new Error('Enter both a metadata field and its exact value, or clear both.');
      return {
        scope: e.Scope.value === 'all' ? 'all' : 'visible', representation: e.Representation.value === 'display' ? 'display' : 'raw',
        metric: e.Metric.value === 'weighted' ? 'weighted' : 'jaccard', threshold: number('Threshold', 0, 1), excludeQuery: e.ExcludeQuery.checked,
        maxPairs: number('MaxPairs', 1, 25000000, true), maxEdges: number('MaxEdges', 1, 250000, true),
        minDomains: number('MinDomains', 1, 10000, true), maxNeighbors: number('TopK', 1, 100, true),
        grouping: e.Grouping.value === 'label-propagation' ? 'label-propagation' : 'components', overlapPolicy: e.Overlap.value === 'keep' ? 'keep' : 'representative', queryWindow: number('Window', 1, 20, true),
        alternatives: { enabled: e.AlternativesEnabled.checked, maxPairs: number('AlternativePairs', 1, 1000000, true), maxContextCandidates: number('ContextLimit', 1, 5000, true), minSupport: number('MinSupport', 1, 1000000, true), minExpected: number('MinExpected', 0, 1000000), maxBothRate: number('MaxBoth', 0, 1), maxQ: number('MaxQ', 0, 1), stratumField, stratumValue }
      };
    }
    function writeSettings(s) {
      const map = { Scope:'scope', Representation:'representation', Metric:'metric', Threshold:'threshold', MinDomains:'minDomains', TopK:'maxNeighbors', Grouping:'grouping', Overlap:'overlapPolicy', Window:'queryWindow', MaxPairs:'maxPairs', MaxEdges:'maxEdges' };
      for (const [id, key] of Object.entries(map)) if (s[key] != null) e[id].value = String(s[key]);
      e.ExcludeQuery.checked = s.excludeQuery !== false;
      const a = s.alternatives || {};
      e.AlternativesEnabled.checked = a.enabled !== false;
      for (const [id, key] of Object.entries({ AlternativePairs:'maxPairs', ContextLimit:'maxContextCandidates', MinSupport:'minSupport', MinExpected:'minExpected', MaxBoth:'maxBothRate', MaxQ:'maxQ', StratumField:'stratumField', StratumValue:'stratumValue' })) if (a[key] != null) e[id].value = String(a[key]);
    }
    function markStale(reason = '') {
      if (!state.result) return;
      state.stale = true; e.Stale.hidden = false;
      e.Stale.textContent = reason || 'These results use earlier data or settings. Run the analysis again before selecting neighborhoods.';
      viewer.clearAnalysisFocus(); e.ClearFocus.disabled = true; e.Selection.textContent = '';
      renderTable(); renderGraph();
    }
    function refreshData(event) {
      let snapshot;
      try { snapshot = viewer.getAnalysisSnapshot({ scope: e.Scope.value }); }
      catch (error) { status(error.message, true); return; }
      const count = array(snapshot.entries).length;
      e.Run.disabled = state.running || !count;
      e.Summary.textContent = count ? `${fmt(count)} segments ready · similarity, order and alternative domains` : 'Load data to explore similarity, order and alternatives';
      if (!state.result && !state.running) status(count ? `${fmt(count)} segments from ${snapshot.source?.name || 'loaded data'}. Choose settings, then run.` : 'Load neighborhood data above to begin.');
      const fields = new Set(['taxid', 'organism', 'lineage']);
      for (const entry of array(snapshot.entries)) for (const field of Object.keys(entry.metadata || {})) fields.add(field);
      empty(e.MetadataFields); for (const field of [...fields].sort()) { const opt = el('option'); opt.value = field; e.MetadataFields.appendChild(opt); }
      if (event && state.result) markStale('The loaded data, domain names or neighborhood filters changed. Run again to update these results.');
    }
    function busy(value) {
      state.running = value; e.Setup.disabled = value; e.Cancel.hidden = !value; e.Progress.hidden = !value; e.Run.disabled = value;
      e.Load.disabled = value; e.Run.textContent = value ? 'Analyzing…' : 'Run analysis';
      if (!value) refreshData();
    }
    async function run() {
      let settings, snapshot;
      try { settings = readSettings(); snapshot = viewer.getAnalysisSnapshot({ scope: settings.scope }); if (!snapshot.entries?.length) throw new Error('No neighborhoods match this scope. Load data or adjust the viewer filters first.'); }
      catch (error) { status(error.message, true); return false; }
      cancel(false);
      const requestId = ++state.requestId;
      busy(true); e.Progress.value = 0; status('Preparing analysis…');
      return new Promise(resolve => {
        let worker;
        const finish = (ok, message, error = false) => { if (requestId !== state.requestId) return; worker?.terminate(); state.worker = null; state.pendingResolve = null; busy(false); if (message) status(message, error); resolve(ok); };
        try {
          worker = hooks.workerFactory ? hooks.workerFactory() : new Worker('./analysis-worker.js?v=' + VERSION);
          state.worker = worker; state.pendingResolve = resolve;
          worker.onmessage = event => {
            const data = event.data || {}; if (data.requestId !== requestId || requestId !== state.requestId) return;
            if (data.type === 'progress') { const ratio = data.total ? data.completed / data.total : 0; e.Progress.value = Math.min(100, Math.max(0, ratio * 100)); status(data.message || `Working: ${data.phase || 'analysis'}…`); }
            if (data.type === 'error') finish(false, data.error?.message || 'Analysis could not finish. Previous results were kept.', true);
            if (data.type === 'result') {
              try {
                if (!data.result || !Array.isArray(data.result.observations)) throw new Error('The analysis returned an invalid result. Previous results were kept.');
                state.result = data.result; state.snapshot = snapshot; state.settings = settings; state.sourceKey = contentKey(snapshot); state.fingerprint = fingerprint(state.sourceKey); state.currentIds = new Map(snapshot.entries.map(entry => [entry.id, entry.id])); state.saved = false; state.stale = false;
                state.tab = 'overview'; state.page = 0; state.selected = null; e.Stale.hidden = true; e.Search.value = ''; e.NetworkGroup.value = ''; viewer.clearAnalysisFocus();
                const current = viewer.getAnalysisSnapshot({ scope: settings.scope });
                if (contentKey(current) !== state.sourceKey) { state.stale = true; e.Stale.hidden = false; } else state.currentIds = new Map(snapshot.entries.map((entry, i) => [entry.id, current.entries[i].id]));
                render(true); finish(true, `Analysis complete: ${fmt(state.result.observations.length)} observations. Results stay in this tab until you save them.`);
              } catch (error) { finish(false, error.message, true); }
            }
          };
          worker.onerror = event => { event.preventDefault?.(); finish(false, 'The analysis worker could not start. Open the Studio through a local HTTP server or hosted site, then retry. ' + (event.message || ''), true); };
          worker.postMessage({ type: 'analyze', requestId, snapshot, options: settings });
        } catch (error) { finish(false, 'Analysis needs a browser worker. Open the Studio through a local HTTP server or hosted site, then retry. ' + error.message, true); }
      });
    }
    function cancel(showMessage = true) {
      if (!state.running) return;
      state.requestId++; state.worker?.terminate(); state.worker = null; const resolve = state.pendingResolve; state.pendingResolve = null; busy(false); resolve?.(false);
      if (showMessage) status('Analysis cancelled. Any previous results were kept.');
    }
    function observationIdsToEntries(ids, includeLinked = false) {
      const byId = new Map(array(state.result?.observations).map(o => [o.id, o]));
      const entries = new Set();
      for (const id of ids) { const obs = byId.get(id); if (!obs) continue; for (const member of includeLinked ? array(obs.members) : [obs.id]) entries.add(state.currentIds.get(member) || member); }
      return [...entries];
    }
    function focus(ids, label, includeLinked = false) {
      if (state.stale || !state.result) { status('Run the analysis again before selecting neighborhoods from these results.', true); return; }
      try {
        const current = viewer.getAnalysisSnapshot({ scope: state.settings.scope });
        if (contentKey(current) !== state.sourceKey) { markStale(); return; }
        const entryIds = observationIdsToEntries(ids, includeLinked);
        if (!entryIds.length) { status('This result has no linked neighborhood rows.', true); return; }
        const focused = viewer.setAnalysisFocus({ entryIds, label, revision: current.revision }) || viewer.getAnalysisFocus?.();
        const matches = focused?.matchedRows;
        e.Selection.textContent = `${label}: ${fmt(ids.length)} analysis observations selected${matches != null ? ` · ${fmt(matches)} rows visible below` : ''}.${matches === 0 ? ' The current Include / Exclude filters hide these rows; clear the selection before changing those filters and rerun.' : ' Scroll to the neighborhood viewer to inspect them.'}`;
        e.ClearFocus.disabled = false;
      } catch (error) { status(error.message, true); }
    }
    function setOptions(select, options, selected) {
      empty(select);
      for (const [value, label] of options) { const opt = el('option', label); opt.value = value; select.appendChild(opt); }
      select.value = options.some(([value]) => value === selected) ? selected : options[0]?.[0] || '';
    }
    function setTab(tab) {
      if (!['overview','network','orders','alternatives'].includes(tab)) return;
      state.tab = tab; state.page = 0; state.selected = null; e.Search.value = ''; render(true);
    }
    function render(resetOptions = false) {
      e.Results.hidden = !state.result; if (!state.result) return;
      e.Stale.hidden = !state.stale;
      for (const tab of e.Tabs.querySelectorAll('[data-analysis-tab]')) { const selected = tab.dataset.analysisTab === state.tab; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; if (selected) e.Panel.setAttribute('aria-labelledby', tab.id); }
      e.Overview.hidden = state.tab !== 'overview'; e.Network.hidden = state.tab !== 'network'; e.Detail.hidden = !state.selected;
      if (resetOptions) {
        const views = state.tab === 'network' ? [['groups','Groups'],['nodes','Neighborhoods'],['edges','Similarity links']] : state.tab === 'orders' ? [['complete','Complete patterns'],['adjacent','Adjacent gene pairs'],['triplets','Gene triplets'],['queryWindows','Query-centered windows']] : [['default',state.tab === 'alternatives' ? 'Candidate pairs' : 'Neighborhoods']];
        setOptions(e.View, views, ''); e.ViewField.hidden = views.length === 1;
        const sorts = state.tab === 'alternatives' ? [['context','Context support'],['q','Adjusted p-value'],['support','Domain support'],['name','Domain name']] : state.tab === 'overview' ? [['domains','Domain count'],['name','Neighborhood name']] : [['count','Frequency / strength'],['name','Name / pattern']];
        setOptions(e.Sort, sorts, '');
      }
      const descriptions = {
        overview: 'Select a neighborhood to inspect it in the viewer. Overlap representatives retain links to their source segments.',
        network: 'Groups come from the retained similarity links. Select a group or a node to inspect its neighborhoods. Every group is available in the paginated table.',
        orders: 'Patterns keep gene boundaries, orientation relative to the query, and unknown genes. Counts are distinct analysis observations, not repeated occurrences within one neighborhood.',
        alternatives: state.settings.alternatives.enabled ? 'Candidate alternatives can coexist occasionally. Inspect both the adjusted p-value and matched context. These are exploratory associations, without an inferred direction of replacement.' : 'Alternative-domain analysis was disabled for this run. Enable it in Advanced settings and run again.'
      };
      e.TabDescription.textContent = descriptions[state.tab];
      renderOverview(); renderTable(); renderProvenance(); renderGraph();
    }
    function renderOverview() {
      if (!state.result) return;
      empty(e.Overview);
      const r = state.result, metrics = el('div', null, 'analysis-metrics');
      for (const [value, label] of [[r.observations.length,'Analysis observations'],[array(r.groups).length,'Similarity groups'],[array(r.edges).length,'Retained links'],[array(r.alternatives?.candidates).length,'Candidate alternative pairs']]) { const box = el('div', null, 'analysis-metric'); box.appendChild(el('strong',fmt(value))); box.appendChild(el('span',label)); metrics.appendChild(box); }
      e.Overview.appendChild(metrics);
      e.Overview.appendChild(el('p',`${state.snapshot.source?.name || 'Neighborhood input'} · ${state.settings.scope === 'all' ? 'All loaded neighborhoods, current continuity rules' : 'Current filtered view'} · ${state.settings.representation === 'raw' ? 'Original domain IDs' : 'Renamed domain groups'} · ${state.settings.metric === 'weighted' ? 'Weighted Jaccard' : 'Jaccard'} ≥ ${state.settings.threshold}.`, 'analysis-note'));
      const warnings = [...array(r.warnings), ...array(r.alternatives?.warnings)].map(w => typeof w === 'string' ? w : w.message || JSON.stringify(w));
      if (warnings.length) { const details = el('details'); details.appendChild(el('summary',`${fmt(warnings.length)} data and method notes`)); const list = el('ul', null, 'analysis-warning-list'); for (const warning of [...new Set(warnings)]) list.appendChild(el('li', warning)); details.appendChild(list); e.Overview.appendChild(details); }
    }
    function rowsForView() {
      const r = state.result;
      if (state.tab === 'overview') return array(r.observations).map(o => ({ ...o, _kind:'observation' }));
      if (state.tab === 'network') return e.View.value === 'nodes' ? array(r.nodes).map(o => ({...o,_kind:'node'})) : e.View.value === 'edges' ? array(r.edges).map(o => ({...o,_kind:'edge'})) : array(r.groups).map(o => ({...o,_kind:'group'}));
      if (state.tab === 'orders') return array(r.patterns?.[e.View.value]).map(o => ({...o,_kind:'pattern'}));
      return array(r.alternatives?.candidates).map(o => ({...o,_kind:'alternative'}));
    }
    function rowName(row) { return row.label || row.pattern || (row.domainA != null ? `${row.domainA} / ${row.domainB}` : row.source != null ? `${nodeLabel(row.source)} / ${nodeLabel(row.target)}` : row.sourceIds?.join(', ') || row.id || 'Neighborhood'); }
    function rowCount(row) { return row.count ?? row.strength ?? row.similarity ?? row.domainIds?.length ?? row.domainCount ?? 0; }
    function nodeLabel(id) { const node = array(state.result?.nodes).find(n => n.id === id); return node?.label || id; }
    function renderTable() {
      if (!state.result) return;
      const query = e.Search.value.trim().toLowerCase();
      let rows = rowsForView();
      if (query) rows = rows.filter(row => [rowName(row),row.id,row.groupId,array(row.domainIds).join(' '),array(row.sourceIds).join(' '),array(row.domains).map(d => d.id).join(' ')].join(' ').toLowerCase().includes(query));
      const sort = e.Sort.value;
      rows.sort((a,b) => {
        if (sort === 'name') return rowName(a).localeCompare(rowName(b));
        if (sort === 'q') return (a.q ?? 1) - (b.q ?? 1) || rowName(a).localeCompare(rowName(b));
        if (sort === 'context') return (b.contextMatches || 0) - (a.contextMatches || 0) || (a.q ?? 1) - (b.q ?? 1) || rowName(a).localeCompare(rowName(b));
        if (sort === 'support') return Math.min(b.supportA || 0,b.supportB || 0) - Math.min(a.supportA || 0,a.supportB || 0) || rowName(a).localeCompare(rowName(b));
        return rowCount(b) - rowCount(a) || rowName(a).localeCompare(rowName(b));
      });
      state.rows = rows; state.page = Math.min(state.page, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1));
      const kind = rows[0]?._kind || (state.tab === 'alternatives' ? 'alternative' : state.tab === 'orders' ? 'pattern' : state.tab === 'network' ? e.View.value === 'nodes' ? 'node' : e.View.value === 'edges' ? 'edge' : 'group' : 'observation');
      const heads = {observation:['Neighborhood','Domains','Genes','Source segments'],node:['Neighborhood','Group','Domains','Links'],group:['Group','Neighborhoods','Common domains','Representative'],edge:['Neighborhood pair','Jaccard','Order similarity'],pattern:['Pattern','Neighborhoods','Frequency'],alternative:['Domain pair','A only','B only','Both','Neither','Expected both','q-value','Matched contexts']};
      empty(e.TableHead); const tr = el('tr'); for (const [i, head] of heads[kind].entries()) { const th = el('th',head); th.scope = 'col'; if (i) th.className = 'is-number'; tr.appendChild(th); } e.TableHead.appendChild(tr);
      empty(e.TableBody);
      for (const row of rows.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE)) {
        const tr = el('tr'), cell = el('td', null, 'analysis-label');
        const select = button(rowName(row), () => inspect(row), false); select.className = 'analysis-text-button'; cell.appendChild(select);
        if (row._kind === 'observation') cell.appendChild(el('span',array(row.sourceIds).join(', '),'analysis-subtext'));
        if (row._kind === 'alternative') cell.appendChild(el('span','A / B · candidate, direction unknown','analysis-subtext'));
        tr.appendChild(cell);
        let values;
        if (kind === 'observation') values = [fmt(array(row.domainIds).length),fmt(array(row.genes).length),fmt(array(row.members).length)];
        if (kind === 'node') values = [row.groupId,fmt(row.domainCount),fmt(row.degree)];
        if (kind === 'group') values = [fmt(row.count),array(row.domains).slice(0,4).map(d => `${d.id} (${fmt(d.count)})`).join(', '),nodeLabel(row.representative)];
        if (kind === 'edge') values = [score(row.similarity),score(row.orderSimilarity)];
        if (kind === 'pattern') values = [fmt(row.count),`${(Number(row.frequency || 0) * 100).toFixed(1)}%`];
        if (kind === 'alternative') values = [fmt(row.counts?.aOnly),fmt(row.counts?.bOnly),fmt(row.counts?.both),fmt(row.counts?.neither),score(row.expectedBoth),pValue(row.q),row.contextStatus === 'not-assessed-limit' ? 'Not assessed (limit)' : fmt(row.contextMatches)];
        for (const value of values || []) { const td = el('td',value, 'is-number'); if (String(value).length > 40) td.className = 'analysis-label'; tr.appendChild(td); }
        e.TableBody.appendChild(tr);
      }
      e.Empty.hidden = rows.length > 0;
      e.Empty.textContent = state.tab === 'alternatives' ? 'No candidate pairs pass this run’s support and coexistence settings. Review the method notes or adjust Advanced settings.' : 'No results match this search.';
      e.RowCount.textContent = `${fmt(rows.length)} results · ${PAGE_SIZE} per page`;
      e.PageInfo.textContent = rows.length ? `${fmt(state.page * PAGE_SIZE + 1)}–${fmt(Math.min(rows.length, (state.page + 1) * PAGE_SIZE))} of ${fmt(rows.length)}` : '0 results';
      e.Prev.disabled = state.page === 0; e.Next.disabled = (state.page + 1) * PAGE_SIZE >= rows.length;
      if (state.selected) renderDetail(state.selected);
    }
    function inspect(row) {
      state.selected = row; renderDetail(row);
      if (row._kind === 'alternative') return;
      const ids = row._kind === 'group' || row._kind === 'pattern' ? array(row.members) : row._kind === 'edge' ? [row.source,row.target] : [row.id];
      focus(ids, rowName(row));
    }
    function renderDetail(row) {
      empty(e.Detail); e.Detail.hidden = false; e.Detail.appendChild(el('h3', rowName(row)));
      if (row._kind === 'alternative') {
        const cohort = new Set(array(state.result.alternatives?.observationIds).length ? state.result.alternatives.observationIds : state.result.observations.map(o => o.id));
        const buckets = { aOnly:[], bOnly:[], both:[], neither:[] };
        for (const obs of state.result.observations) { if (!cohort.has(obs.id)) continue; const domains = new Set(array(obs.domainIds)), a = domains.has(row.domainA), b = domains.has(row.domainB); buckets[a && b ? 'both' : a ? 'aOnly' : b ? 'bOnly' : 'neither'].push(obs.id); }
        e.Detail.appendChild(el('p',`Observed together in ${fmt(row.counts?.both)} neighborhoods; expected ${score(row.expectedBoth)} under independence. One-sided Fisher p = ${pValue(row.fisherP)}; adjusted q = ${pValue(row.q)}. ${row.contextStatus === 'not-assessed-limit' ? 'Context was not assessed for this pair because the context assessment limit was reached.' : `${fmt(row.contextMatches)} matched contexts; ${fmt(row.sharedFlankMatches)} same-slot / shared-flank contexts. Contexts can share observations and are not independent replicates.`}`));
        if (row.contextStatus !== 'not-assessed-limit') e.Detail.appendChild(el('p',`Carrier-gene alternatives: ${fmt(row.geneAlternativeMatches)} contexts. Alternative domains within a shared protein architecture: ${fmt(row.domainArchitectureMatches)} contexts. These counts are evidence to inspect, not proof of replacement.`));
        const actions = el('div',null,'analysis-actions');
        for (const [key,label] of [['aOnly','A only'],['bOnly','B only'],['both','Both (exceptions)'],['neither','Neither']]) actions.appendChild(button(`${label} · ${fmt(buckets[key].length)}`,()=>focus(buckets[key],`${row.domainA} / ${row.domainB}: ${label}`),state.stale || !buckets[key].length));
        e.Detail.appendChild(actions);
        const contextIds = [...new Set([...array(row.contextObservationIndicesA),...array(row.contextObservationIndicesB)].map(i => state.result.alternatives.observationIds[i]).filter(Boolean))];
        if (contextIds.length) e.Detail.appendChild(button(`Inspect all matched-context observations · ${fmt(contextIds.length)}`,()=>focus(contextIds,'Matched-context observations'),state.stale));
        else if (array(row.exampleObservationIds).length) e.Detail.appendChild(button('Inspect matched-context examples (sample)',()=>focus(row.exampleObservationIds,'Matched-context example sample'),state.stale));
        if (array(row.strata).length) { const details = el('details'); details.appendChild(el('summary','Metadata support')); const pre = el('pre',JSON.stringify(row.strata,null,2)); details.appendChild(pre); e.Detail.appendChild(details); }
      } else {
        const ids = row._kind === 'group' || row._kind === 'pattern' ? array(row.members) : row._kind === 'edge' ? [row.source,row.target] : [row.id];
        const observations = state.result.observations.filter(o => ids.includes(o.id));
        if (row._kind === 'group') e.Detail.appendChild(el('p',`Representative: ${nodeLabel(row.representative)}. Common domains: ${array(row.domains).slice(0,10).map(d => `${d.id} (${fmt(d.count)})`).join(', ')}.`));
        e.Detail.appendChild(el('p',`${fmt(observations.length)} analysis observations, linked to ${fmt(observationIdsToEntries(ids,true).length)} source segments. Selection shows the analyzed representatives; linked overlapping rows may have different annotations and did not add statistical observations.`));
        e.Detail.appendChild(button('Show analyzed neighborhoods',()=>focus(ids,rowName(row)),state.stale));
        if (observationIdsToEntries(ids,true).length > ids.length) e.Detail.appendChild(button('Inspect all linked source rows (includes overlaps)',()=>focus(ids,rowName(row) + ' · all linked source rows',true),state.stale));
        renderMemberList(observations);
      }
    }
    function renderMemberList(observations) {
      const details = el('details'), summary = el('summary',`Inspect member neighborhoods (${fmt(observations.length)})`), holder = el('div'), pager = el('div',null,'analysis-pagination'); let page = 0;
      details.appendChild(summary); details.appendChild(holder); details.appendChild(pager); e.Detail.appendChild(details);
      function draw() { empty(holder); empty(pager); const ul = el('ul'); for (const obs of observations.slice(page * PAGE_SIZE,(page+1)*PAGE_SIZE)) { const li=el('li'); const b=button(rowName(obs),()=>focus([obs.id],rowName(obs)),state.stale); b.className='analysis-text-button'; li.appendChild(b); ul.appendChild(li); } holder.appendChild(ul); pager.appendChild(button('Previous',()=>{page--;draw();},page===0)); pager.appendChild(el('span',`${fmt(observations.length ? page*PAGE_SIZE+1 : 0)}–${fmt(Math.min(observations.length,(page+1)*PAGE_SIZE))} of ${fmt(observations.length)}`)); pager.appendChild(button('Next',()=>{page++;draw();},(page+1)*PAGE_SIZE>=observations.length)); }
      details.addEventListener('toggle',()=>{if(details.open)draw();});
    }
    function renderGraph() {
      if (!state.result || state.tab !== 'network') return;
      const groups = array(state.result.groups), previous = e.NetworkGroup.value;
      setOptions(e.NetworkGroup,[['','All groups'],...groups.map(g=>[g.id,`${g.label || g.id} · ${fmt(g.count)}`])],previous);
      let nodes = array(state.result.nodes).filter(n => !e.NetworkGroup.value || n.groupId === e.NetworkGroup.value);
      const total = nodes.length;
      nodes = nodes.slice().sort((a,b)=>(b.degree||0)-(a.degree||0)||String(a.id).localeCompare(String(b.id))).slice(0,MAX_DRAW_NODES);
      const ids = new Set(nodes.map(n=>n.id)), allEdges = array(state.result.edges).filter(edge=>ids.has(edge.source)&&ids.has(edge.target));
      const edges = allEdges.slice().sort((a,b)=>b.similarity-a.similarity).slice(0,MAX_DRAW_EDGES);
      e.NetworkNote.textContent = `${fmt(nodes.length)} / ${fmt(total)} nodes drawn; ${fmt(edges.length)} / ${fmt(allEdges.length)} links among drawn nodes. Display limit: ${MAX_DRAW_NODES} nodes and ${MAX_DRAW_EDGES} links. All results remain in tables and exports. Circle position has no biological meaning.`;
      empty(e.Graph); if (!nodes.length) {e.Graph.appendChild(el('p','No nodes in this group.','analysis-empty'));return;}
      const ns='http://www.w3.org/2000/svg', svg=document.createElementNS(ns,'svg'); svg.setAttribute('viewBox','0 0 900 360'); svg.setAttribute('role','group'); svg.setAttribute('aria-label','Similarity network; each focusable node selects a neighborhood');
      const sorted = nodes.slice().sort((a,b)=>String(a.groupId).localeCompare(String(b.groupId))||String(a.id).localeCompare(String(b.id))), positions=new Map();
      sorted.forEach((node,i)=>{const angle=2*Math.PI*i/sorted.length-Math.PI/2;positions.set(node.id,{x:450+Math.cos(angle)*405,y:180+Math.sin(angle)*145});});
      for(const edge of edges){const a=positions.get(edge.source),b=positions.get(edge.target),line=document.createElementNS(ns,'line'); for(const[k,v]of Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y,'stroke-width':Math.max(.5,edge.similarity*2)}))line.setAttribute(k,String(v));svg.appendChild(line);}
      for(const node of sorted){const pos=positions.get(node.id),circle=document.createElementNS(ns,'circle'),colorIndex=Math.max(0,groups.findIndex(g=>g.id===node.groupId));for(const[k,v]of Object.entries({cx:pos.x,cy:pos.y,r:Math.min(8,4+Math.sqrt(node.degree||0)/2),fill:COLORS[colorIndex%COLORS.length],tabindex:state.stale?'-1':'0',role:'button','aria-label':`${node.label || node.id}, ${node.groupId}, ${node.degree || 0} links`,'aria-disabled':String(state.stale)}))circle.setAttribute(k,String(v));const title=document.createElementNS(ns,'title');title.textContent=`${node.label || node.id} · ${node.groupId} · ${node.degree || 0} links`;circle.appendChild(title);const select=()=>{if(!state.stale)inspect({...node,_kind:'node'});};circle.addEventListener('click',select);circle.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select();}});svg.appendChild(circle);}
      e.Graph.appendChild(svg);
    }
    function renderProvenance() {
      empty(e.Provenance); const dl=el('dl',null,'analysis-provenance-grid');
      for(const[label,value]of [['Input',state.snapshot.source?.name || 'Neighborhood input'],['Analysis version',state.result.version || VERSION],['Dataset fingerprint',state.fingerprint],['Observations',fmt(state.result.observations.length)],['Method parameters',JSON.stringify(state.settings,null,2)],['Processing summary',JSON.stringify(state.result.summary || {},null,2)]]){dl.appendChild(el('dt',label));const dd=el('dd');dd.appendChild(el(label==='Method parameters'||label==='Processing summary'?'pre':'span',value));dl.appendChild(dd);}e.Provenance.appendChild(dl);
    }
    function exportSession() {
      if (!state.result) return null;
      return { kind:KIND, schemaVersion:1, editorVersion:VERSION, savedAt:new Date().toISOString(), fingerprint:state.fingerprint, settings:clone(state.settings), snapshot:clone(state.snapshot), result:clone(state.result), stale:state.stale };
    }
    function validateSession(input) {
      const reject = message => { throw new Error('Invalid analysis session: ' + message + ' The current results were kept.'); };
      const object = value => value && typeof value === 'object' && !Array.isArray(value);
      const whole = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
      const unit = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
      const string = value => typeof value === 'string' && value.length > 0;
      const uniqueStrings = value => Array.isArray(value) && value.every(string) && new Set(value).size === value.length;
      const nearly = (a,b) => Math.abs(a-b) <= 1e-9 * Math.max(1,Math.abs(a),Math.abs(b));
      if (!object(input) || input.kind !== KIND || input.schemaVersion !== 1 || !object(input.settings) || !object(input.snapshot) || !Array.isArray(input.snapshot.entries) || !object(input.result)) reject('unsupported format or schema.');
      const r=input.result, settings=input.settings;
      if (!['visible','all'].includes(settings.scope) || input.snapshot.scope !== settings.scope) reject('invalid or inconsistent data scope.');
      if (!Array.isArray(r.observations)||!Array.isArray(r.groups)||!Array.isArray(r.nodes)||!Array.isArray(r.edges)||!object(r.patterns)||!object(r.options)) reject('missing result collections.');
      for (const key of ['representation','metric','excludeQuery','threshold','minDomains','maxNeighbors','grouping','overlapPolicy','queryWindow','maxPairs','maxEdges']) if (r.options[key] !== settings[key]) reject('saved parameters disagree with result parameters.');
      if (!object(settings.alternatives)||!object(r.options.alternatives)) reject('missing alternative-domain parameters.');
      for (const [key,value] of Object.entries(settings.alternatives)) if (r.options.alternatives[key] !== value) reject('alternative-domain parameters disagree with the results.');
      const snapshotIds=new Set();
      for (const entry of input.snapshot.entries) { if(!object(entry)||!string(entry.id)||snapshotIds.has(entry.id)||!Array.isArray(entry.genes))reject('invalid or duplicate input segment.');snapshotIds.add(entry.id);for(const gene of entry.genes)if(!object(gene)||!Array.isArray(gene.domains))reject('invalid input gene.'); }
      const observations=new Map();
      for (const obs of r.observations) {
        if(!object(obs)||!string(obs.id)||observations.has(obs.id)||!snapshotIds.has(obs.id)||!uniqueStrings(obs.members)||!obs.members.includes(obs.id)||obs.members.some(id=>!snapshotIds.has(id))||!uniqueStrings(obs.domainIds)||!Array.isArray(obs.genes)||!object(obs.counts))reject('invalid observation or source-segment reference.');
        const counts=new Map();for(const gene of obs.genes){if(!object(gene)||!Array.isArray(gene.domains))reject('invalid observation gene.');for(const domain of gene.domains){if(!object(domain)||!string(domain.id))reject('invalid domain identifier.');if(!(settings.excludeQuery&&gene.query))counts.set(domain.id,(counts.get(domain.id)||0)+1);}}
        if(obs.domainIds.length!==counts.size||Object.keys(obs.counts).length!==counts.size||obs.domainIds.some(id=>!counts.has(id)||obs.counts[id]!==counts.get(id)))reject('domain counts do not match the observation genes.');
        observations.set(obs.id,obs);
      }
      const groups=new Map(), assigned=new Set();
      for(const group of r.groups){if(!object(group)||!string(group.id)||groups.has(group.id)||!uniqueStrings(group.members)||!whole(group.count)||group.count!==group.members.length||!group.members.includes(group.representative)||!Array.isArray(group.domains)||group.members.some(id=>!observations.has(id)||assigned.has(id)))reject('invalid group count, representative or membership.');for(const id of group.members)assigned.add(id);for(const domain of group.domains)if(!object(domain)||!string(domain.id)||!whole(domain.count)||domain.count>group.count||!unit(domain.frequency))reject('invalid group domain support.');groups.set(group.id,group);}
      if(assigned.size!==observations.size)reject('group membership does not cover all observations.');
      const nodes=new Map();for(const node of r.nodes){if(!object(node)||!string(node.id)||nodes.has(node.id)||!observations.has(node.id)||!groups.has(node.groupId)||!groups.get(node.groupId).members.includes(node.id)||!whole(node.degree)||!uniqueStrings(node.members)||canonical(node.members)!==canonical(observations.get(node.id).members)||!whole(node.memberCount)||node.memberCount!==node.members.length||!whole(node.domainCount)||node.domainCount!==observations.get(node.id).domainIds.length||!Number.isFinite(node.strength)||node.strength<0)reject('invalid network node.');nodes.set(node.id,node);}
      if(nodes.size!==observations.size)reject('network node inventory differs from observations.');
      const edgeKeys=new Set(),degrees=new Map(),strengths=new Map();for(const edge of r.edges){if(!object(edge)||!nodes.has(edge.source)||!nodes.has(edge.target)||edge.source===edge.target||!unit(edge.similarity)||!unit(edge.compositionSimilarity)||!unit(edge.orderSimilarity)||!nearly(edge.similarity,edge.compositionSimilarity))reject('invalid similarity link or score.');const key=JSON.stringify([edge.source,edge.target].sort());if(edgeKeys.has(key))reject('duplicate similarity link.');edgeKeys.add(key);for(const id of [edge.source,edge.target]){degrees.set(id,(degrees.get(id)||0)+1);strengths.set(id,(strengths.get(id)||0)+edge.similarity);}}
      for(const node of nodes.values())if(node.degree!==(degrees.get(node.id)||0)||!nearly(node.strength,strengths.get(node.id)||0))reject('node degree or strength differs from retained links.');
      for(const type of ['complete','adjacent','triplets','queryWindows']){if(!Array.isArray(r.patterns[type]))reject('missing order-pattern collection.');const patternIds=new Set();for(const pattern of r.patterns[type]){if(!object(pattern)||!string(pattern.id)||patternIds.has(pattern.id)||typeof pattern.pattern!=='string'||!uniqueStrings(pattern.members)||pattern.members.some(id=>!observations.has(id))||!whole(pattern.count)||pattern.count!==pattern.members.length||!unit(pattern.frequency)||!nearly(pattern.frequency,observations.size?pattern.count/observations.size:0)||!whole(pattern.occurrences)||pattern.occurrences<pattern.count)reject('invalid order pattern count or membership.');patternIds.add(pattern.id);}}
      if(!object(r.alternatives)||!Array.isArray(r.alternatives.candidates))reject('missing alternative-domain results.');
      const alt=r.alternatives;if(!alt.disabled){if(!uniqueStrings(alt.observationIds)||alt.observationIds.some(id=>!observations.has(id))||alt.observationCount!==alt.observationIds.length||!whole(alt.testedPairCount))reject('invalid alternative-domain cohort.');const cohort=alt.observationIds.map(id=>observations.get(id)),seenPairs=new Set(),postings=new Map();cohort.forEach((obs,index)=>{for(const domain of obs.domainIds){if(!postings.has(domain))postings.set(domain,new Set());postings.get(domain).add(index);}});for(const pair of alt.candidates){if(!object(pair)||!string(pair.domainA)||!string(pair.domainB)||pair.domainA===pair.domainB||!object(pair.counts)||!unit(pair.q)||!unit(pair.fisherP))reject('invalid candidate pair or p-value.');const key=JSON.stringify([pair.domainA,pair.domainB].sort());if(seenPairs.has(key))reject('duplicate candidate pair.');seenPairs.add(key);const aIds=postings.get(pair.domainA)||new Set(),bIds=postings.get(pair.domainB)||new Set(),smaller=aIds.size<=bIds.size?aIds:bIds,larger=aIds.size<=bIds.size?bIds:aIds;let both=0;for(const index of smaller)if(larger.has(index))both++;const counts={aOnly:aIds.size-both,bOnly:bIds.size-both,both,neither:cohort.length-aIds.size-bIds.size+both};if(Object.keys(counts).some(k=>pair.counts[k]!==counts[k])||pair.supportA!==counts.aOnly+counts.both||pair.supportB!==counts.bOnly+counts.both||!Number.isFinite(pair.expectedBoth)||!nearly(pair.expectedBoth,cohort.length?pair.supportA*pair.supportB/cohort.length:0))reject('candidate contingency counts disagree with the saved cohort.');for(const key of ['contextObservationIndicesA','contextObservationIndicesB'])if(pair[key]!=null&&(!Array.isArray(pair[key])||pair[key].some(i=>!whole(i)||i>=cohort.length)))reject('invalid context-support observation index.');}}
      const key=contentKey(input.snapshot);if(input.fingerprint!==fingerprint(key))reject('the fingerprint does not match the saved input snapshot.');
      return key;
    }
    function importSession(input) {
      if (state.running) throw new Error('Cancel the running analysis before loading a session.');
      const data=typeof input==='string'?JSON.parse(input):clone(input),sourceKey=validateSession(data);
      const controls=Array.from(e.Setup.querySelectorAll('input, select'));
      const originalControls=controls.map(control=>({control,value:control.value,checked:control.checked}));
      const previous={...state},previousSearch=e.Search.value;
      try {
        writeSettings(data.settings);const normalizedSettings=readSettings();if(canonical(normalizedSettings)!==canonical(data.settings))throw new Error('Invalid analysis session: parameter types or values are unsupported. The current results were kept.');
        const current=viewer.getAnalysisSnapshot({scope:data.settings.scope}),same=sourceKey===contentKey(current);
        state.result=data.result;state.snapshot=data.snapshot;state.settings=data.settings;state.sourceKey=sourceKey;state.fingerprint=data.fingerprint;state.stale=!same;state.saved=true;state.page=0;state.tab='overview';state.selected=null;
        state.currentIds=new Map(same?data.snapshot.entries.map((entry,i)=>[entry.id,current.entries[i].id]):[]);
        e.Search.value='';render(true);
        viewer.clearAnalysisFocus();e.ClearFocus.disabled=true;e.Selection.textContent='';e.Card.open=true;
        if(!same)e.Stale.textContent='Saved results loaded for inspection. The current data or filters differ from their snapshot. Load the matching input and filters, then reload this analysis JSON; or run a new analysis. Selection is disabled.';
        status(same?'Saved analysis loaded; its data and filters match this editor.':'Saved analysis loaded for inspection only. Its input does not match the current data.');return {matched:same,observations:data.result.observations.length};
      } catch(error){Object.assign(state,previous);for(const {control,value,checked}of originalControls){control.value=value;control.checked=checked;}e.Search.value=previousSearch;render(true);throw error;}
    }
    async function exportResults() {
      if(!state.result)return;
      if(!window.JSZip){status('The local ZIP library is unavailable. Save the analysis JSON instead.',true);return;}
      e.Export.disabled=true;
      try {
        const zip=new window.JSZip(),r=state.result;
        zip.file('analysis-session.json',JSON.stringify(exportSession(),null,2));
        zip.file('neighborhoods.tsv',tsv(r.observations,[['observation_id','id'],['source_segments','members'],['source_blocks','sourceIds'],['domains','domainIds'],['counts','counts'],['query_indices','queryIndices'],['coordinate_source','coordinateSource']]));
        zip.file('groups.tsv',tsv(array(r.groups),[['group_id','id'],['label','label'],['count','count'],['representative','representative'],['members','members'],['common_domains','domains']]));
        zip.file('similarity-links.tsv',tsv(array(r.edges),[['source','source'],['target','target'],['composition_similarity','similarity'],['order_similarity','orderSimilarity']]));
        for(const[key,patterns]of Object.entries(r.patterns || {}))zip.file(`order-${key}.tsv`,tsv(array(patterns),[['pattern_id','id'],['pattern','pattern'],['count','count'],['frequency','frequency'],['occurrences','occurrences'],['members','members']]));
        zip.file('alternative-domains.tsv',tsv(array(r.alternatives?.candidates),[['domain_A','domainA'],['domain_B','domainB'],['A_only',x=>x.counts?.aOnly],['B_only',x=>x.counts?.bOnly],['both',x=>x.counts?.both],['neither',x=>x.counts?.neither],['support_A','supportA'],['support_B','supportB'],['expected_both','expectedBoth'],['observed_expected_ratio','observedExpected'],['odds_ratio','oddsRatio'],['corrected_odds_ratio','correctedOddsRatio'],['fisher_p','fisherP'],['adjusted_q','q'],['coexistence_fraction','bothRate'],['context_status','contextStatus'],['matched_contexts','contextMatches'],['context_support_A','contextSupportA'],['context_support_B','contextSupportB'],['shared_flank_contexts','sharedFlankMatches'],['carrier_gene_alternative_contexts','geneAlternativeMatches'],['within_protein_alternative_contexts','domainArchitectureMatches'],['example_observations','exampleObservationIds']]));
        zip.file('domain-mapping.tsv',tsv(array(r.provenance?.domainMapping),[['analysis_domain','id'],['original_IDs','rawIds'],['display_names','displayNames']]));
        zip.file('README.txt',`EvoSupplement Neighborhood analysis ${VERSION}\n\nThe analysis-session.json contains the exact input snapshot, parameters, provenance and complete computed result. Load it in the Neighborhood editor to inspect or restore this analysis.\n\nTSV files contain computed sparse similarity links, all groups, order patterns and candidate alternative-domain pairs. Spreadsheet-sensitive strings are prefixed with an apostrophe; JSON retains exact values. Grouping uses the retained threshold/top-neighbor graph, not every possible pair.\n\nCandidate alternatives are exploratory associations, not evidence of direction of replacement or functional equivalence. Counts refer to analysis observations after overlap handling. Unknown annotations and related samples limit interpretation. Context counts can share observations.\n\n${state.stale?'These results were marked stale relative to the current editor. The saved snapshot describes their actual input.\n':''}`);
        const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});download('neighborhood-analysis-results.zip',blob);state.saved=true;status('Results ZIP exported with complete analysis state, parameters and tables.');
      }catch(error){status(error.message,true);}finally{e.Export.disabled=false;}
    }
    e.Run.addEventListener('click',run); e.Cancel.addEventListener('click',()=>cancel());
    e.Setup.addEventListener('change',()=>{ if(state.result)markStale('Analysis settings changed. Run again to calculate results for the new settings.'); refreshData(); });
    e.Setup.addEventListener('input',()=>{ if(state.result)markStale('Analysis settings changed. Run again to calculate results for the new settings.'); });
    e.ClearFocus.addEventListener('click',()=>{viewer.clearAnalysisFocus();e.ClearFocus.disabled=true;e.Selection.textContent='Selection cleared. All rows allowed by the viewer filters are visible.';});
    e.Search.addEventListener('input',()=>{state.page=0;renderTable();}); e.Sort.addEventListener('change',()=>{state.page=0;renderTable();});e.View.addEventListener('change',()=>{state.page=0;state.selected=null;e.Detail.hidden=true;renderTable();});
    e.Prev.addEventListener('click',()=>{if(state.page>0){state.page--;renderTable();}});e.Next.addEventListener('click',()=>{if((state.page+1)*PAGE_SIZE<state.rows.length){state.page++;renderTable();}});
    e.NetworkGroup.addEventListener('change',renderGraph);
    const tabs=Array.from(e.Tabs.querySelectorAll('[data-analysis-tab]'));
    tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>setTab(tab.dataset.analysisTab));tab.addEventListener('keydown',event=>{let next=index;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();setTab(tabs[next].dataset.analysisTab);tabs[next].focus();});});
    e.Save.addEventListener('click',()=>{const session=exportSession();if(session){download('neighborhood-analysis-session.json',new Blob([JSON.stringify(session,null,2)],{type:'application/json'}));state.saved=true;status('Analysis JSON saved with data snapshot, results and settings.');}});
    e.Export.addEventListener('click',exportResults);e.Load.addEventListener('click',()=>e.LoadInput.click());e.LoadInput.addEventListener('change',async()=>{const file=e.LoadInput.files?.[0];if(!file)return;try{if(file.size>256*1024*1024)throw new Error('The analysis JSON exceeds the 256 MB import limit.');importSession(await file.text());}catch(error){status(error.message,true);}finally{e.LoadInput.value='';}});
    viewer.onAnalysisChange(refreshData);
    window.addEventListener('beforeunload',event=>{if(state.running || (state.result&&!state.saved)){event.preventDefault();event.returnValue='';}});
    refreshData();
    return {run,cancel,importSession,exportSession,exportResults,getState:()=>state,setTab,render,refreshData};
  }
  window.NeighborhoodAnalysisEditor={VERSION,init:create,contentFingerprint:snapshot=>fingerprint(contentKey(snapshot))};
})();
