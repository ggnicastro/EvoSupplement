(() => {
  'use strict';

  const files = { input: null, resolved: null, yaml: null, colors: null, snapshot: null };
  let activeCatalogId = '';
  let catalogQuery = '';
  const STANDARD_RANKS = ['domain', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'];

  const $ = id => document.getElementById(id);
  const els = {};

  function collect() {
    Object.assign(els, {
      inputFile: $('editorInputFile'), resolvedFile: $('editorResolvedFile'), yamlFile: $('editorYamlFile'), colorFile: $('editorColorFile'), colorsFile: $('editorColorFile'), snapshotFile: $('editorSnapshotFile'),
      inputName: $('editorInputName'), resolvedName: $('editorResolvedName'), yamlName: $('editorYamlName'), colorName: $('editorColorName'), colorsName: $('editorColorName'), snapshotName: $('editorSnapshotName'),
      loadFiles: $('editorLoadFiles'), restoreExample: $('editorRestoreExample'), clearOptional: $('editorClearOptional'), loadStatus: $('editorLoadStatus'),
      resolveOnline: $('editorResolveOnline'), resolveSnapshot: $('editorResolveSnapshot'), apiKey: $('editorNcbiApiKey'), resolveProgress: $('editorResolveProgress'), resolveStatus: $('editorResolveStatus'),
      mode: $('editorMode'), colorBy: $('editorColorBy'), ranks: $('editorRanks'), minimumCount: $('editorMinimumCount'), minimumPercent: $('editorMinimumPercent'), topN: $('editorTopN'), sortChildren: $('editorSortChildren'),
      collapseSingle: $('editorCollapseSingle'), hideRoot: $('editorHideRoot'), includeUnclassified: $('editorIncludeUnclassified'), showNoRank: $('editorShowNoRank'), applySettings: $('editorApplySettings'), resetSettings: $('editorResetSettings'),
      nodeEmpty: $('editorNodeEmpty'), nodeForm: $('editorNodeForm'), nodeIdentity: $('editorNodeIdentity'), nodeMeta: $('editorNodeMeta'), nodeDisplayName: $('editorNodeDisplayName'), nodeAction: $('editorNodeAction'), nodeDisplayRank: $('editorNodeDisplayRank'), moveNodeLeft: $('editorMoveNodeLeft'), moveNodeRight: $('editorMoveNodeRight'), nodeColumnStatus: $('editorNodeColumnStatus'), missingRankTools: $('editorMissingRankTools'), missingAncestor: $('editorMissingAncestor'), missingRankContext: $('editorMissingRankContext'), nodeOrder: $('editorNodeOrder'), nodeColorPicker: $('editorNodeColorPicker'), nodeColorText: $('editorNodeColorText'), saveNode: $('editorSaveNode'), resetNode: $('editorResetNode'),
      catalogBody: $('editorCatalogBody'), catalogSearch: $('editorCatalogSearch'), catalogSummary: $('editorCatalogSummary'),
      downloadResolved: $('editorDownloadResolved'), downloadYaml: $('editorDownloadYaml'), downloadColors: $('editorDownloadColors'), downloadReport: $('editorDownloadReport'), downloadSvg: $('editorDownloadSvg'), downloadPackage: $('editorDownloadPackage'),
      diagnosticsList: $('editorDiagnosticsList')
    });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function readFileText(file) {
    return file ? file.text() : Promise.resolve('');
  }

  function setFile(role, file) {
    files[role] = file || null;
    const label = els[`${role}Name`];
    if (label) label.textContent = file ? file.name : (role === 'snapshot' ? 'No snapshot selected' : 'No local file selected');
    if (role === 'snapshot') els.resolveSnapshot.disabled = !file;
  }

  function bindFile(input, role) {
    input.addEventListener('change', () => setFile(role, input.files?.[0] || null));
  }

  function buildRankChips() {
    const labels = { domain: 'Domain / realm', kingdom: 'Kingdom', phylum: 'Phylum', class: 'Class', order: 'Order', family: 'Family', genus: 'Genus', species: 'Species' };
    els.ranks.innerHTML = Object.entries(labels).map(([rank, label]) => `<label class="rank-chip"><input type="checkbox" value="${rank}"><span>${label}</span></label>`).join('');
  }

  function selectedRanks() {
    return [...els.ranks.querySelectorAll('input:checked')].map(input => input.value);
  }

  function syncSettings() {
    const api = window.TaxonomySankeyViewer;
    if (!api) return;
    const settings = api.getState().settings;
    els.mode.value = settings.mode;
    if ([...els.colorBy.options].some(option => option.value === settings.color_by)) els.colorBy.value = settings.color_by;
    else {
      const option = document.createElement('option');
      option.value = settings.color_by;
      option.textContent = settings.color_by;
      els.colorBy.appendChild(option);
      els.colorBy.value = settings.color_by;
    }
    for (const input of els.ranks.querySelectorAll('input')) input.checked = settings.ranks.includes(input.value);
    els.minimumCount.value = settings.minimum_count;
    els.minimumPercent.value = settings.minimum_percent;
    els.topN.value = settings.top_n_per_parent;
    els.sortChildren.value = settings.sort_children;
    els.collapseSingle.checked = settings.collapse_single_child;
    els.hideRoot.checked = settings.hide_root;
    els.includeUnclassified.checked = settings.include_unclassified;
    els.showNoRank.checked = settings.show_no_rank;
    for (const input of els.ranks.querySelectorAll('input')) input.disabled = settings.mode !== 'standard';
  }

  function applySettings() {
    const ranks = selectedRanks();
    if (els.mode.value === 'standard' && !ranks.length) {
      els.loadStatus.textContent = 'Select at least one standard rank.';
      return;
    }
    window.TaxonomySankeyViewer.updateSettings({
      mode: els.mode.value,
      ranks,
      minimum_count: Number(els.minimumCount.value) || 0,
      minimum_percent: Number(els.minimumPercent.value) || 0,
      top_n_per_parent: Number(els.topN.value) || 0,
      sort_children: els.sortChildren.value,
      collapse_single_child: els.collapseSingle.checked,
      hide_root: els.hideRoot.checked,
      include_unclassified: els.includeUnclassified.checked,
      show_no_rank: els.showNoRank.checked,
      color_by: els.colorBy.value
    }, { fit: true });
    els.loadStatus.textContent = 'Hierarchy settings applied.';
    renderCatalog();
  }

  function resetSettings() {
    window.TaxonomySankeyViewer.updateSettings({
      mode: 'all', ranks: ['domain', 'phylum', 'class', 'order', 'family', 'genus'], minimum_count: 1,
      minimum_percent: 0, top_n_per_parent: 12, sort_children: 'count', collapse_single_child: false,
      collapse_other: true, hide_root: true, include_unclassified: true, show_no_rank: true, color_by: 'domain'
    }, { fit: true });
    syncSettings();
    renderCatalog();
  }

  async function loadSelectedFiles() {
    const api = window.TaxonomySankeyViewer;
    const current = api.getState();
    els.loadFiles.disabled = true;
    els.loadStatus.textContent = 'Reading selected files…';
    try {
      const payload = {};
      if (files.input) {
        payload.rawText = await readFileText(files.input);
        payload.rawName = files.input.name;
        // A newly selected TSV starts a clean authoring session unless the user
        // explicitly supplies compatible curation/color files alongside it.
        payload.resetCuration = !files.yaml;
        payload.resetColors = !files.colors;
      }
      if (files.resolved) { payload.resolvedText = await readFileText(files.resolved); payload.resolvedName = files.resolved.name; }
      if (files.yaml) { payload.yamlText = await readFileText(files.yaml); payload.yamlName = files.yaml.name; }
      if (files.colors) { payload.colorText = await readFileText(files.colors); payload.colorName = files.colors.name; }
      if (!files.input && !current.rawRows.length) throw new Error('Choose a protein taxonomy TSV.');
      await api.loadData(payload);
      els.loadStatus.textContent = `Loaded ${files.input?.name || 'current TSV'}${files.resolved ? ' with a resolved taxonomy snapshot' : ''}.`;
      syncSettings();
      renderCatalog();
      renderDiagnostics();
    } catch (error) {
      console.error(error);
      els.loadStatus.textContent = `Could not load files: ${error.message}`;
    } finally {
      els.loadFiles.disabled = false;
    }
  }

  function clearOptionalFiles() {
    for (const role of ['resolved', 'yaml', 'colors', 'snapshot']) {
      const input = els[`${role}File`];
      if (input) input.value = '';
      setFile(role, null);
    }
    els.loadStatus.textContent = 'Optional local selections cleared. Click “Load selected files” to rebuild from the current input TSV.';
  }

  function progress(fraction, message) {
    els.resolveProgress.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
    els.resolveStatus.textContent = message;
  }

  async function resolveOnline() {
    const api = window.TaxonomySankeyViewer;
    const current = api.getState();
    if (!current.rawRows.length) { els.resolveStatus.textContent = 'Load a protein taxonomy TSV first.'; return; }
    els.resolveOnline.disabled = true;
    els.resolveSnapshot.disabled = true;
    progress(0.01, 'Preparing the NCBI request…');
    try {
      const result = await api.resolveWithNcbi(current.rawRows, { apiKey: els.apiKey.value, progress });
      api.replaceResolvedRows(result.rows, { resolver: result.resolver, resolvedAt: new Date().toISOString().slice(0, 10), report: result.report, note: 'Resolved with the NCBI Datasets taxonomy API.' });
      progress(1, `NCBI resolution complete: ${result.rows.filter(row => row.status !== 'unresolved').length} of ${result.rows.length} proteins resolved.`);
      syncSettings(); renderCatalog(); renderDiagnostics();
    } catch (error) {
      console.error(error);
      progress(0, `Online resolution failed: ${error.message}. The current local classification remains available.`);
    } finally {
      els.resolveOnline.disabled = false;
      els.resolveSnapshot.disabled = !files.snapshot;
    }
  }

  async function resolveSnapshot() {
    const api = window.TaxonomySankeyViewer;
    const current = api.getState();
    if (!files.snapshot) return;
    if (!current.rawRows.length) { els.resolveStatus.textContent = 'Load a protein taxonomy TSV first.'; return; }
    els.resolveOnline.disabled = true;
    els.resolveSnapshot.disabled = true;
    progress(0.01, 'Opening the local taxonomy snapshot…');
    try {
      const result = await api.resolveFromSnapshot(files.snapshot, current.rawRows, { progress });
      api.replaceResolvedRows(result.rows, { resolver: result.resolver, resolvedAt: new Date().toISOString().slice(0, 10), report: result.report, note: `Resolved from ${files.snapshot.name}.` });
      progress(1, `Snapshot resolution complete: ${result.rows.filter(row => row.status !== 'unresolved').length} of ${result.rows.length} proteins resolved.`);
      syncSettings(); renderCatalog(); renderDiagnostics();
    } catch (error) {
      console.error(error);
      progress(0, `Snapshot resolution failed: ${error.message}`);
    } finally {
      els.resolveOnline.disabled = false;
      els.resolveSnapshot.disabled = !files.snapshot;
    }
  }

  function catalogRows() {
    const state = window.TaxonomySankeyViewer.getState();
    const values = [...state.nodeCatalog.values()];
    const query = catalogQuery.trim().toLowerCase();
    const filtered = query ? values.filter(node => [node.name, node.id, node.rank, ...node.members].join('\u0000').toLowerCase().includes(query)) : values;
    filtered.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return filtered;
  }

  function renderCatalog() {
    const apiState = window.TaxonomySankeyViewer?.getState();
    if (!apiState || !els.catalogBody) return;
    const rows = catalogRows();
    els.catalogSummary.textContent = `${rows.length} of ${apiState.nodeCatalog.size} taxonomy nodes`;
    els.catalogBody.innerHTML = rows.slice(0, 3000).map(node => {
      const override = apiState.overrides[node.id] || {};
      return `<tr data-node-id="${escapeHtml(node.id)}" class="${node.id === activeCatalogId ? 'is-selected' : ''}">
        <td><b>${escapeHtml(override.display_name || node.name)}</b></td>
        <td>${escapeHtml(node.rank)}</td>
        <td>${escapeHtml(node.id.startsWith('taxid:') ? node.id.slice(6) : node.id)}</td>
        <td class="count">${node.count.toLocaleString()}</td>
        <td><span class="action-badge">${escapeHtml(override.action || 'auto')}</span></td>
      </tr>`;
    }).join('');
  }

  function rankLabel(rank) {
    const labels = { domain: 'Domain / realm', kingdom: 'Kingdom', phylum: 'Phylum', class: 'Class', order: 'Order', family: 'Family', genus: 'Genus', species: 'Species' };
    return labels[String(rank || '').toLowerCase()] || String(rank || 'No rank');
  }

  function nodeForEditor(id) {
    const state = window.TaxonomySankeyViewer.getState();
    return state.graph?.nodes.find(node => node.id === id) || state.nodeCatalog.get(id) || null;
  }

  function availableDisplayRanks(state) {
    return state.settings.mode === 'standard' ? [...state.settings.ranks] : [...STANDARD_RANKS];
  }

  function populateDisplayRank(node, override, state) {
    const ranks = availableDisplayRanks(state);
    els.nodeDisplayRank.innerHTML = '<option value="">Automatic / official rank</option>'
      + ranks.map(rank => `<option value="${escapeHtml(rank)}">${escapeHtml(rankLabel(rank))}</option>`).join('');
    const requested = String(override.display_rank || '').toLowerCase();
    els.nodeDisplayRank.value = ranks.includes(requested) ? requested : '';
    const current = node.displayRank || requested || node.rank || '';
    const official = node.officialRank || node.rank || '';
    els.nodeColumnStatus.textContent = node.placeholder
      ? `This spacer belongs to the ${rankLabel(current)} column.`
      : `Official rank: ${rankLabel(official)} · displayed in: ${rankLabel(current)}${requested ? ' · manual override' : ''}`;
    const currentIndex = ranks.indexOf(current);
    const editable = state.settings.mode === 'standard' && !node.placeholder;
    els.nodeDisplayRank.disabled = !editable;
    els.moveNodeLeft.disabled = !editable || currentIndex <= 0;
    els.moveNodeRight.disabled = !editable || currentIndex < 0 || currentIndex >= ranks.length - 1;
  }

  function populateMissingRankTools(node, override) {
    const isPlaceholder = Boolean(node.placeholder);
    els.missingRankTools.hidden = !isPlaceholder;
    if (!isPlaceholder) {
      els.missingAncestor.innerHTML = '<option value="">Custom name</option>';
      els.missingRankContext.textContent = '';
      return;
    }
    const candidates = Array.isArray(node.candidateAncestors) ? node.candidateAncestors : [];
    els.missingAncestor.innerHTML = '<option value="">Custom name</option>' + candidates.map(candidate => {
      const taxid = candidate.taxid || (/^\d+$/.test(String(candidate.id || '')) ? candidate.id : '');
      return `<option value="${escapeHtml(candidate.id)}" data-name="${escapeHtml(candidate.name)}" data-rank="${escapeHtml(candidate.rank || '')}" data-taxid="${escapeHtml(taxid)}">${escapeHtml(candidate.name)} · ${escapeHtml(candidate.rank || 'no rank')}${taxid ? ` · ${escapeHtml(taxid)}` : ''}</option>`;
    }).join('');
    const match = candidates.find(candidate => {
      const taxid = candidate.taxid || (/^\d+$/.test(String(candidate.id || '')) ? candidate.id : '');
      return (override.source_taxid && String(override.source_taxid) === String(taxid))
        || (override.source_name && override.source_name === candidate.name);
    });
    els.missingAncestor.value = match?.id || '';
    const context = node.contextName ? `Routing context: ${node.contextName}.` : '';
    els.missingRankContext.textContent = `${context} You may type any display name, or select an ancestor from the frozen lineage. This does not change the NCBI rank.`;
  }

  function shiftSelectedNode(direction) {
    if (!activeCatalogId) return;
    const state = window.TaxonomySankeyViewer.getState();
    const node = nodeForEditor(activeCatalogId);
    if (!node || node.placeholder || state.settings.mode !== 'standard') return;
    const ranks = availableDisplayRanks(state);
    const current = node.displayRank || node.rank;
    const currentIndex = ranks.indexOf(current);
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= ranks.length) return;
    const requestedRank = ranks[targetIndex];
    window.TaxonomySankeyViewer.setOverride(activeCatalogId, { display_rank: requestedRank });
    const updated = nodeForEditor(activeCatalogId);
    selectCatalogNode(activeCatalogId, false);
    els.loadStatus.textContent = updated?.displayRank === requestedRank
      ? `${node.displayName || node.name} moved to the ${rankLabel(requestedRank)} display column.`
      : `The ${rankLabel(requestedRank)} column is already occupied on this lineage. The node stayed in ${rankLabel(updated?.displayRank || node.rank)}.`;
  }

  function selectCatalogNode(id, selectInGraph = true) {
    activeCatalogId = id || '';
    const state = window.TaxonomySankeyViewer.getState();
    const catalog = state.nodeCatalog.get(activeCatalogId);
    const graphNode = state.graph?.nodes.find(node => node.id === activeCatalogId);
    const node = graphNode || catalog;
    if (!node) {
      els.nodeEmpty.hidden = false;
      els.nodeForm.hidden = true;
      return;
    }
    const override = state.overrides[activeCatalogId] || {};
    els.nodeEmpty.hidden = true;
    els.nodeForm.hidden = false;
    const shownName = override.display_name || node.displayName || node.name || `Missing ${rankLabel(node.displayRank || node.rank)}`;
    els.nodeIdentity.textContent = shownName;
    const official = node.placeholder ? 'missing in resolved standard ranks' : rankLabel(node.officialRank || node.rank);
    const displayed = rankLabel(node.displayRank || node.rank);
    els.nodeMeta.textContent = `${official} · display: ${displayed} · ${activeCatalogId} · ${(node.count || 0).toLocaleString()} proteins`;
    els.nodeDisplayName.value = override.display_name || '';
    els.nodeAction.value = override.action || 'auto';
    populateDisplayRank(node, override, state);
    populateMissingRankTools(node, override);
    els.nodeOrder.value = Number.isFinite(Number(override.order)) ? override.order : '';
    const color = override.color || '#4f8fd9';
    els.nodeColorPicker.value = /^#[0-9a-f]{6}$/i.test(color) ? color : '#4f8fd9';
    els.nodeColorText.value = override.color || '';
    if (selectInGraph && graphNode) window.TaxonomySankeyViewer.selectNode(activeCatalogId);
    renderCatalog();
  }

  function saveNodeOverride() {
    if (!activeCatalogId) return;
    const color = els.nodeColorText.value.trim();
    if (color && !/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(color)) {
      els.loadStatus.textContent = 'Enter a hexadecimal color such as #4f8fd9.';
      return;
    }
    const node = nodeForEditor(activeCatalogId);
    const selectedAncestor = els.missingAncestor?.selectedOptions?.[0] || null;
    const sourceName = node?.placeholder && selectedAncestor?.value ? selectedAncestor.dataset.name || '' : '';
    const sourceTaxid = node?.placeholder && selectedAncestor?.value ? selectedAncestor.dataset.taxid || '' : '';
    const sourceRank = node?.placeholder && selectedAncestor?.value ? selectedAncestor.dataset.rank || '' : '';
    const requestedDisplayRank = node?.placeholder ? '' : els.nodeDisplayRank.value;
    window.TaxonomySankeyViewer.setOverride(activeCatalogId, {
      display_name: els.nodeDisplayName.value.trim(),
      action: els.nodeAction.value,
      display_rank: requestedDisplayRank || null,
      order: els.nodeOrder.value === '' ? null : Number(els.nodeOrder.value),
      color,
      source_taxid: sourceTaxid || null,
      source_name: sourceName || null,
      source_rank: sourceRank || null
    });
    const updated = nodeForEditor(activeCatalogId);
    selectCatalogNode(activeCatalogId, false);
    els.loadStatus.textContent = node?.placeholder
      ? 'Missing-rank display node saved. The resolved taxonomy TSV was not modified.'
      : (requestedDisplayRank && updated?.displayRank !== requestedDisplayRank
        ? `The ${rankLabel(requestedDisplayRank)} column is already occupied on this lineage. The node stayed in ${rankLabel(updated?.displayRank || node.rank)}.`
        : 'Taxon override saved.');
    renderDiagnostics();
  }

  function resetNodeOverride() {
    if (!activeCatalogId) return;
    const state = window.TaxonomySankeyViewer.getState();
    const existing = state.overrides[activeCatalogId] || {};
    window.TaxonomySankeyViewer.setOverride(activeCatalogId, {
      display_name: '', action: 'auto', display_rank: null, order: null, color: '',
      source_taxid: null, source_name: null, source_rank: null,
      ...Object.fromEntries(Object.keys(existing).map(key => [key, key === 'action' ? 'auto' : null]))
    });
    selectCatalogNode(activeCatalogId, false);
    els.loadStatus.textContent = 'Node override reset.';
  }

  function renderDiagnostics() {
    const state = window.TaxonomySankeyViewer.getState();
    const items = [...state.diagnostics];
    const unresolved = state.resolvedRows.filter(row => row.status === 'unresolved').length;
    const merged = state.resolvedRows.filter(row => row.status === 'merged').length;
    const discrepant = state.resolvedRows.filter(row => row.discrepancy).length;
    items.push({ level: unresolved ? 'warning' : 'info', message: `${unresolved} unresolved protein row${unresolved === 1 ? '' : 's'}.` });
    items.push({ level: merged ? 'warning' : 'info', message: `${merged} row${merged === 1 ? '' : 's'} remapped from an input TaxID to a current TaxID.` });
    items.push({ level: discrepant ? 'warning' : 'info', message: `${discrepant} row${discrepant === 1 ? '' : 's'} differ between the supplied classification and resolved lineage.` });
    items.push({ level: 'info', message: `Resolver: ${state.source.resolver || 'input-classification'}.` });
    els.diagnosticsList.innerHTML = items.map(item => `<div class="diagnostic-item ${escapeHtml(item.level || '')}">${escapeHtml(item.message)}</div>`).join('');
  }

  function safeSlug(value) {
    return String(value || 'taxonomy-sankey').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'taxonomy-sankey';
  }

  function exportResolved() {
    window.TaxonomySankeyViewer.downloadBlob('taxonomy-resolved.tsv', window.TaxonomySankeyViewer.serializeResolvedTsv(), 'text/tab-separated-values;charset=utf-8');
  }
  function exportYaml() { window.TaxonomySankeyViewer.downloadBlob('taxonomy-sankey.yaml', window.TaxonomySankeyViewer.serializeCurationYaml(), 'text/yaml;charset=utf-8'); }
  function exportColors() { window.TaxonomySankeyViewer.downloadBlob('taxonomy-colors.yaml', window.TaxonomySankeyViewer.serializeColorYaml(), 'text/yaml;charset=utf-8'); }
  function exportReport() { window.TaxonomySankeyViewer.downloadBlob('taxonomy-resolution-report.tsv', window.TaxonomySankeyViewer.serializeResolutionReport(), 'text/tab-separated-values;charset=utf-8'); }
  function exportSvg() {
    const api = window.TaxonomySankeyViewer;
    try {
      const svg = api.serializeCurrentSvg({
        title: window.TAXONOMY_SANKEY_CONFIG.figureTitle || 'Taxonomy Sankey',
        background: '#ffffff'
      });
      api.downloadBlob(`${safeSlug(window.TAXONOMY_SANKEY_CONFIG.figureTitle)}.svg`, svg, 'image/svg+xml;charset=utf-8');
      els.loadStatus.textContent = 'SVG exported from the current Sankey settings.';
    } catch (error) {
      els.loadStatus.textContent = `Could not export SVG: ${error.message}`;
    }
  }

  async function exportPackage() {
    if (!window.JSZip) return;
    const api = window.TaxonomySankeyViewer;
    const state = api.getState();
    const zip = new JSZip();
    zip.file('taxonomy-resolved.tsv', api.serializeResolvedTsv());
    zip.file('taxonomy-sankey.yaml', api.serializeCurationYaml());
    zip.file('taxonomy-colors.yaml', api.serializeColorYaml());
    zip.file('taxonomy-resolution-report.tsv', api.serializeResolutionReport());
    if (state.rawRows.length) {
      const headers = ['pid', 'taxid', 'classification'];
      const input = [headers.join('\t'), ...state.rawRows.map(row => [row.pid, row.taxid, row.classification].map(value => String(value ?? '').replace(/\t/g, ' ')).join('\t'))].join('\n') + '\n';
      zip.file('taxonomy-input.tsv', input);
    }
    zip.file('README.txt', `EvoSupplement Taxonomy Sankey publication package\n\nFiles:\n- taxonomy-resolved.tsv: frozen protein-to-lineage mapping\n- taxonomy-sankey.yaml: ranks, compression rules, and node overrides\n- taxonomy-colors.yaml: optional reusable color dictionary\n- taxonomy-resolution-report.tsv: reconciliation report\n- taxonomy-input.tsv: original compact input\n\nResolver: ${state.source.resolver}\nGenerated: ${new Date().toISOString()}\n`);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    api.downloadBlob(`${safeSlug(window.TAXONOMY_SANKEY_CONFIG.figureTitle)}-taxonomy-sankey.zip`, blob, 'application/zip');
  }

  function bind() {
    bindFile(els.inputFile, 'input'); bindFile(els.resolvedFile, 'resolved'); bindFile(els.yamlFile, 'yaml'); bindFile(els.colorsFile, 'colors'); bindFile(els.snapshotFile, 'snapshot');
    els.loadFiles.addEventListener('click', loadSelectedFiles);
    els.restoreExample.addEventListener('click', () => window.location.reload());
    els.clearOptional.addEventListener('click', clearOptionalFiles);
    els.resolveOnline.addEventListener('click', resolveOnline);
    els.resolveSnapshot.addEventListener('click', resolveSnapshot);
    els.mode.addEventListener('change', () => { for (const input of els.ranks.querySelectorAll('input')) input.disabled = els.mode.value !== 'standard'; });
    els.applySettings.addEventListener('click', applySettings);
    els.resetSettings.addEventListener('click', resetSettings);
    els.catalogSearch.addEventListener('input', () => { catalogQuery = els.catalogSearch.value; renderCatalog(); });
    els.catalogBody.addEventListener('click', event => { const row = event.target.closest('tr[data-node-id]'); if (row) selectCatalogNode(row.dataset.nodeId); });
    els.nodeColorPicker.addEventListener('input', () => { els.nodeColorText.value = els.nodeColorPicker.value; });
    els.nodeColorText.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(els.nodeColorText.value)) els.nodeColorPicker.value = els.nodeColorText.value; });
    els.nodeDisplayRank.addEventListener('change', () => {
      const node = nodeForEditor(activeCatalogId);
      if (!node || node.placeholder) return;
      const requested = els.nodeDisplayRank.value;
      els.nodeColumnStatus.textContent = requested
        ? `Pending display column: ${rankLabel(requested)}. Click Save taxon override to apply it.`
        : `Pending display column: automatic / ${rankLabel(node.officialRank || node.rank)}. Click Save taxon override to apply it.`;
    });
    els.moveNodeLeft.addEventListener('click', () => shiftSelectedNode(-1));
    els.moveNodeRight.addEventListener('click', () => shiftSelectedNode(1));
    els.missingAncestor.addEventListener('change', () => {
      const option = els.missingAncestor.selectedOptions?.[0];
      if (option?.value) els.nodeDisplayName.value = option.dataset.name || '';
    });
    els.saveNode.addEventListener('click', saveNodeOverride);
    els.resetNode.addEventListener('click', resetNodeOverride);
    els.downloadResolved.addEventListener('click', exportResolved);
    els.downloadYaml.addEventListener('click', exportYaml);
    els.downloadColors.addEventListener('click', exportColors);
    els.downloadReport.addEventListener('click', exportReport);
    els.downloadSvg.addEventListener('click', exportSvg);
    els.downloadPackage.addEventListener('click', exportPackage);

    document.addEventListener('taxonomy-sankey:loaded', () => { syncSettings(); renderCatalog(); renderDiagnostics(); });
    document.addEventListener('taxonomy-sankey:rendered', () => { renderCatalog(); if (activeCatalogId) selectCatalogNode(activeCatalogId, false); });
    document.addEventListener('taxonomy-sankey:selection', event => {
      const id = event.detail?.id || '';
      if (id) selectCatalogNode(id, false);
    });
    document.addEventListener('taxonomy-sankey:override', () => { renderCatalog(); renderDiagnostics(); });
  }

  function init() {
    collect();
    buildRankChips();
    bind();
    syncSettings();
    renderCatalog();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
