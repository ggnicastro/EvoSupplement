/* EvoSupplement Project Style Manager — local authoring UI. */
(function () {
  'use strict';

  const core = window.EvoStyleCore;
  const LAYERS = ['taxonomy', 'neighborhood', 'architecture', 'network'];
  const LABELS = { taxonomy: 'Taxonomy', neighborhood: 'Neighborhood', architecture: 'Architecture', network: 'Network' };
  const CHANGE_PAGE_SIZE = 20;
  const UNITS = { taxonomy: 'records', neighborhood: 'genes', architecture: 'proteins', network: 'nodes' };
  const MEASURES = { taxonomy: 'Taxonomy records', neighborhood: 'Neighborhood genes', architecture: 'Architecture proteins', network: 'Network nodes' };
  const $ = id => document.getElementById(id);
  const layerInputs = Array.from(document.querySelectorAll('input[name="layer"]'));
  let session = null;
  let analysis = null;
  let baseAnalysis = null;
  let renameEdits = new Map();
  let previewedRenames = Object.create(null);
  let renameStale = false;
  let changesPage = 0;
  let reviewed = false;
  let previewRows = [];
  let choices = new Map();
  let reviewLayers = [];
  let reviewShapes = true;
  let editingGroupId = null;
  let page = 0;
  let busy = false;
  let pendingDownload = false;
  let hasReviewEdits = false;
  let busyControls = new Map();

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }

  function selectedLayers() {
    return layerInputs.filter(input => input.checked).map(input => input.value);
  }

  function groups() {
    return session && Array.isArray(session.groups) ? session.groups : [];
  }

  function countLayer(layer) {
    return session ? session.instances.filter(instance => instance.layer === layer).length : 0;
  }

  function assignment(layer) {
    return groups().find(group => Array.isArray(group.layers) && group.layers.includes(layer));
  }

  function notify(message, success) {
    $('status').textContent = message;
    $('status').className = success ? 'status status-success' : 'status';
    $('status').hidden = !message;
  }

  function clearError() {
    $('error').hidden = true;
    $('error').textContent = '';
  }

  function reportError(error) {
    $('error').textContent = error && error.message ? error.message : String(error);
    $('error').hidden = false;
    $('status').hidden = true;
  }

  function setBusy(value) {
    busy = value;
    document.querySelector('main').setAttribute('aria-busy', String(value));
    if (value) {
      busyControls = new Map();
      document.querySelectorAll('button,input,select').forEach(control => {
        busyControls.set(control, control.disabled);
        control.disabled = true;
      });
    } else {
      busyControls.forEach((wasDisabled, control) => {
        if (control.isConnected) control.disabled = wasDisabled;
      });
      busyControls.clear();
      updateControls();
    }
  }

  async function perform(message, action) {
    if (busy) return;
    clearError();
    notify(message);
    setBusy(true);
    try {
      await action();
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  function normalizedHex(value) {
    const text = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(text)) return '#' + text.slice(1).split('').map(char => char + char).join('').toLowerCase();
    return null;
  }

  function validColor(value) {
    return Boolean(normalizedHex(value));
  }

  function entryName(entry) {
    return String(entry.name !== undefined ? entry.name : entry.key);
  }

  function shapeApplies(entry) {
    if (!reviewShapes) return false;
    return Array.isArray(entry.shapes) && entry.shapes.length > 0;
  }

  function entryResolved(entry) {
    const choice = choices.get(entryName(entry));
    return Boolean(choice && (entry.colorEditable === false || validColor(choice.color)) && (!shapeApplies(entry) || core.SHAPES.includes(choice.shape)));
  }

  function unresolvedCount() {
    return analysis ? analysis.entries.filter(entry => !entryResolved(entry)).length : 0;
  }

  function updateControls() {
    $('stateFile').disabled = busy || !core;
    $('layerFields').disabled = busy || !session;
    $('groupName').disabled = busy || !session;
    layerInputs.forEach(input => {
      const group = assignment(input.value), count = countLayer(input.value);
      input.disabled = busy || !session || Boolean(editingGroupId) || !count || Boolean(group);
      $('count-' + input.value).textContent = session ? `${count} ${count === 1 ? 'instance' : 'instances'}${group ? ` · ${group.name}` : ''}` : 'Load a state first';
    });
    $('includeShapes').disabled = busy || !session || !selectedLayers().includes('architecture');
    $('analyzeButton').disabled = busy || !session || !selectedLayers().length;
    $('newGroupButton').hidden = !editingGroupId;
    $('newGroupButton').disabled = busy;
    ['searchInput', 'conflictsOnly', 'changedOnly', 'minFrequency', 'layerFilter', 'moduleFilter', 'sortBy', 'frequencyLayer', 'pageSize', 'reviewNamesButton', 'renameFile', 'backToNamesButton'].forEach(id => { $(id).disabled = busy || !analysis; });
    document.querySelectorAll('#paletteBody input,#paletteBody select').forEach(control => {
      control.disabled = busy || (renameStale && !control.className.split(/\s+/).includes('rename-input'));
    });
    $('previewChangesButton').disabled = busy || !analysis || !analysis.entries.length || invalidRenameCount() > 0;
    $('resetRenamesButton').disabled = busy || !analysis || !renameEdits.size;
    $('renameStaleNotice').hidden = !renameStale;
    $('applyButton').textContent = editingGroupId ? 'Update shared palette' : 'Apply shared palette';
    $('exportStateButton').disabled = busy || !groups().length;
    $('exportGroup').disabled = busy || !groups().length;
    document.querySelectorAll('#groupsList button').forEach(button => { button.disabled = busy; });
    updatePaletteDownloads(); updateReviewStatus(); updatePagination(); updateRenameHint(); updateChangePagination();
    $('layerHint').textContent = editingGroupId
      ? 'Editing an applied group. Its layer membership is fixed; use New group for unassigned layers. To regroup layers, reload your original state ZIP.'
      : 'Names are matched exactly after renaming. Network uses Function categories; taxonomy retains its coloring mode. Each layer belongs to one palette group.';
  }

  function invalidateReview() {
    analysis = null; baseAnalysis = null; renameEdits = new Map(); previewedRenames = Object.create(null);
    renameStale = false; choices = new Map(); reviewLayers = []; hasReviewEdits = false;
    reviewed = false; previewRows = []; changesPage = 0;
    $('reviewPanel').hidden = true; $('changesPanel').hidden = true;
    $('namesPanel').hidden = true; $('paletteBody').replaceChildren(); $('changesBody').replaceChildren();
    updateControls();
  }

  function showProject() {
    $('projectInfo').hidden = false;
    $('projectTitle').textContent = session.title || 'Untitled project';
    $('projectFile').textContent = session.name || 'Builder state ZIP';
    const count = session.instances.length;
    $('projectCounts').textContent = `${count} supported module ${count === 1 ? 'instance' : 'instances'} in this project`;
    $('loadHint').textContent = 'Data and unselected modules are preserved. Download the updated state to keep applied changes.';
  }

  function startNewGroup() {
    editingGroupId = null;
    $('groupName').value = '';
    const available = LAYERS.filter(layer => countLayer(layer) && !assignment(layer));
    const defaults = available.filter(layer => ['neighborhood', 'architecture'].includes(layer));
    layerInputs.forEach(input => { input.checked = (defaults.length ? defaults : available).includes(input.value); });
    $('includeShapes').checked = true;
    invalidateReview();
  }

  async function loadState(file) {
    if (!file) return;
    await perform('Loading the Builder state…', async () => {
      const next = await core.loadArchive(file, { name: file.name });
      session = next;
      pendingDownload = false;
      showProject();
      startNewGroup();
      renderGroups();
      notify(`Loaded ${session.title || file.name}. Choose the layers that should share a palette.`, true);
    });
    $('stateFile').value = '';
  }

  async function analyzeSelection() {
    if (!session || !selectedLayers().length) return;
    const layers = selectedLayers(), includeShapes = $('includeShapes').checked && layers.includes('architecture');
    await perform('Reading names, styles, and frequencies from the selected layers…', async () => {
      const next = await core.analyze(session, layers);
      reviewLayers = layers; reviewShapes = includeShapes; baseAnalysis = next;
      renameEdits = new Map(); previewedRenames = Object.create(null); renameStale = false;
      setAnalysis(next); hasReviewEdits = false; reviewed = false; page = 0; changesPage = 0; previewRows = [];
      $('searchInput').value = ''; $('conflictsOnly').checked = false; $('changedOnly').checked = false;
      $('minFrequency').value = '0'; $('sortBy').value = 'frequency'; $('pageSize').value = '20';
      fillFilterOptions();
      $('reviewPanel').hidden = false; $('namesPanel').hidden = true; $('changesPanel').hidden = true;
      $('paletteBody').replaceChildren(); $('changesBody').replaceChildren();
      $('reviewNamesButton').textContent = 'Review names'; $('reviewNamesButton').setAttribute('aria-expanded', 'false');
      $('shapeColumnHeading').textContent = reviewShapes ? 'Architecture shape' : 'Shape';
      renderWarnings();
      notify('Review ready. Open Review names to explore the most frequent entries, or preview the proposed palette.', true);
      $('reviewHeading').setAttribute('tabindex', '-1'); $('reviewHeading').focus({ preventScroll: true });
      $('reviewPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function sourceKey(source) { return JSON.stringify([source.layer, source.itemId, source.originalId, source.kind]); }
  function sourceSignature(entry) { return JSON.stringify([entry.colorEditable !== false, (entry.sources || []).map(sourceKey).sort()]); }

  function setAnalysis(next, preserveChoices = false) {
    const previous = new Map(), bySource = new Map();
    if (preserveChoices && analysis) analysis.entries.forEach(entry => {
      const value = choices.get(entryName(entry)); previous.set(sourceSignature(entry), value);
      (entry.sources || []).forEach(source => bySource.set(sourceKey(source), value));
    });
    analysis = next; choices = new Map();
    analysis.entries.forEach(entry => {
      const color = entry.colorConflict ? '' : (entry.suggestedColor || entry.colors[0] || '');
      const shape = entry.shapeConflict ? '' : (entry.suggestedShape || entry.shapes[0] || 'rounded');
      let value = { color, colorText: color, shape, touchedColor: false, touchedShape: false };
      const existing = previous.get(sourceSignature(entry));
      if (existing) value = { ...existing };
      else {
        const contributors = (entry.sources || []).map(source => bySource.get(sourceKey(source)));
        if (contributors.length && contributors.every(Boolean)) {
          for (const field of ['color', 'shape']) {
            const touch = field === 'color' ? 'touchedColor' : 'touchedShape';
            const values = new Set(contributors.map(choice => choice[field]));
            if (values.size === 1 && contributors.some(choice => choice[touch])) {
              value[field] = contributors[0][field]; value[touch] = true;
              if (field === 'color') value.colorText = contributors[0].colorText;
            }
          }
        }
      }
      choices.set(entryName(entry), value);
    });
    $('reviewSummary').textContent = reviewLayers.map(layer => LABELS[layer]).join(' + ');
  }

  function option(value, text) { const node = element('option', text); node.value = value; return node; }
  function fillFilterOptions() {
    $('frequencyLayer').replaceChildren(...reviewLayers.map(layer => option(layer, MEASURES[layer])));
    $('frequencyLayer').value = reviewLayers.includes('neighborhood') ? 'neighborhood' : reviewLayers[0];
    $('layerFilter').replaceChildren(option('', 'All selected layers'), ...reviewLayers.map(layer => option(layer, LABELS[layer])));
    $('layerFilter').value = ''; fillModuleOptions();
  }
  function fillModuleOptions() {
    const layer = $('layerFilter').value;
    const instances = analysis ? analysis.instances.filter(instance => !layer || instance.layer === layer) : [];
    $('moduleFilter').replaceChildren(option('', 'All selected modules'), ...instances.map(instance => option(instance.itemId || instance.id, `${LABELS[instance.layer]} · ${instance.title || instance.itemId || instance.id}`)));
    $('moduleFilter').value = '';
  }

  function renamePlan() {
    const plan = Object.create(null);
    renameEdits.forEach((value, name) => { if (value.trim() !== name) plan[name] = value.trim(); });
    return plan;
  }

  function invalidRenameCount() {
    return Array.from(renameEdits.values()).filter(value => !value.trim() || /[\u0000-\u001f\u007f]/.test(value)).length;
  }

  function sameRenamePlan(left, right) {
    const keys = Object.keys(left).sort();
    return JSON.stringify(keys.map(key => [key, left[key]])) === JSON.stringify(Object.keys(right).sort().map(key => [key, right[key]]));
  }

  function invalidatePreview() {
    reviewed = false; hasReviewEdits = true; $('changesPanel').hidden = true;
  }
  function nameEdited() {
    renameStale = invalidRenameCount() > 0 || !sameRenamePlan(renamePlan(), previewedRenames);
    invalidatePreview(); updateControls();
  }
  function updateRenameHint() {
    const count = Object.keys(renamePlan()).length, invalid = invalidRenameCount();
    $('renameHint').textContent = invalid ? `${invalid} invalid ${invalid === 1 ? 'name' : 'names'}. Use nonempty text without control characters.`
      : count ? `${count} pending ${count === 1 ? 'name change' : 'name changes'}. Preview changes before applying. Renames run simultaneously.`
      : 'Edit names, colors, and shapes in the same row. Original identifiers remain in the project.';
  }
  function currentNames(entry) {
    return entry.previousNames && entry.previousNames.length ? entry.previousNames : Array.from(new Set((entry.sources || []).map(source => source.previousName || source.name || entryName(entry))));
  }
  function renameInput(name) {
    const wrap = element('label', null, 'name-edit'); wrap.append(element('span', name, 'current-name'));
    const input = element('input', null, 'rename-input'); input.type = 'text';
    input.value = renameEdits.has(name) ? renameEdits.get(name) : name;
    input.autocomplete = 'off'; input.spellcheck = false; input.setAttribute('aria-label', `New display name for ${name}`); input.disabled = busy;
    const validate = () => { const invalid = !input.value.trim() || /[\u0000-\u001f\u007f]/.test(input.value); input.classList.toggle('invalid-input', invalid); input.setAttribute('aria-invalid', String(invalid)); };
    validate(); input.addEventListener('input', () => {
      if (input.value === name) renameEdits.delete(name); else renameEdits.set(name, input.value);
      validate(); nameEdited();
    });
    wrap.append(element('span', '→', 'name-arrow'), input); return wrap;
  }
  function nameCell(entry) {
    const cell = element('td'), names = currentNames(entry);
    cell.append(element('strong', entryName(entry), 'entry-name'), element('span', '', 'entry-status'));
    names.slice(0, 3).forEach(name => cell.append(renameInput(name)));
    if (names.length > 3) {
      const details = element('details', null, 'more-name-edits'); details.append(element('summary', `${names.length - 3} more current names`));
      let loaded = false; details.addEventListener('toggle', () => { if (details.open && !loaded) { loaded = true; pagedDetails(details, names.slice(3), renameInput, 'names'); } }); cell.append(details);
    }
    return cell;
  }

  async function importRenames(file) {
    if (!file || !baseAnalysis) return;
    await perform('Reading the rename plan YAML…', async () => {
      const plan = core.parseRenameYaml(await file.text()), names = new Set(baseAnalysis.entries.map(entryName));
      const unknown = Object.keys(plan).filter(name => !names.has(name));
      if (unknown.length) throw new Error(`Rename plan contains names absent from the selected layers: ${unknown.slice(0, 5).join(', ')}. Use current display names as keys.`);
      await core.analyze(session, reviewLayers, { renames: plan });
      renameEdits = new Map(Object.entries(plan).filter(([name, value]) => name !== value));
      nameEdited(); page = 0; renderTable(); notify('Rename plan imported. Preview changes to combine matching names and review their styles.');
    });
    $('renameFile').value = '';
  }

  function renderWarnings() {
    const warnings = analysis && Array.isArray(analysis.warnings) ? analysis.warnings : [];
    const list = $('warningsList');
    list.replaceChildren();
    warnings.forEach(warning => {
      const text = typeof warning === 'string' ? warning : warning.message || warning.text || JSON.stringify(warning);
      list.append(element('li', text));
    });
    $('warningsBox').hidden = !warnings.length;
  }

  function scopeSources(entry) {
    const layer = $('layerFilter').value, module = $('moduleFilter').value;
    return (entry.sources || []).filter(source => (!layer || source.layer === layer) && (!module || source.itemId === module));
  }
  function scopedFrequency(entry, layer) {
    const module = $('moduleFilter').value, visible = $('layerFilter').value;
    if (visible && visible !== layer) return { count: 0, occurrences: 0, instanceCount: 0 };
    if (module) {
      const value = (entry.frequenciesByInstance || {})[module];
      return value && value.layer === layer ? { ...value, instanceCount: value.count > 0 ? 1 : 0 } : { count: 0, occurrences: 0, instanceCount: 0 };
    }
    return (entry.frequency || {})[layer] || { count: 0, occurrences: 0, instanceCount: 0 };
  }
  function frequencyCount(entry) { return scopedFrequency(entry, $('frequencyLayer').value).count || 0; }
  function scopedInstances(entry) {
    return reviewLayers.reduce((total, layer) => total + (scopedFrequency(entry, layer).instanceCount || 0), 0);
  }
  function entryEdited(entry) {
    const choice = choices.get(entryName(entry));
    return currentNames(entry).some(name => renameEdits.has(name) && renameEdits.get(name).trim() !== name) || Boolean(choice && (choice.touchedColor || choice.touchedShape));
  }
  function filteredEntries() {
    if (!analysis) return [];
    const query = $('searchInput').value.trim().toLocaleLowerCase(), minimum = Math.max(0, Number($('minFrequency').value) || 0);
    return analysis.entries.filter(entry => {
      if (!scopeSources(entry).length) return false;
      if ($('conflictsOnly').checked && entryResolved(entry)) return false;
      if ($('changedOnly').checked && !entryEdited(entry)) return false;
      if (frequencyCount(entry) < minimum) return false;
      return !query || [entryName(entry), ...currentNames(entry), ...currentNames(entry).map(name => renameEdits.get(name)), ...(entry.sources || []).flatMap(source => [source.originalId, source.title, source.sectionTitle, LABELS[source.layer]])]
        .some(value => String(value || '').toLocaleLowerCase().includes(query));
    }).sort((left, right) => {
      const mode = $('sortBy').value;
      return (mode === 'frequency' ? frequencyCount(right) - frequencyCount(left) : mode === 'modules' ? scopedInstances(right) - scopedInstances(left) : 0) || entryName(left).localeCompare(entryName(right));
    });
  }
  function updateReviewStatus() {
    const remaining = unresolvedCount();
    $('applyButton').disabled = busy || !analysis || renameStale || !reviewed || !analysis.entries.length || remaining > 0;
    if (!analysis) return;
    $('summaryNames').textContent = analysis.entries.length; $('summaryInstances').textContent = analysis.instances.length; $('summaryConflicts').textContent = remaining;
    $('conflictBadge').textContent = renameStale ? 'Name edits pending' : remaining ? `${remaining} unresolved` : reviewed ? 'Preview reviewed' : 'Ready to preview';
    $('conflictBadge').className = renameStale || remaining ? 'badge badge-warning' : 'badge';
    $('applyHint').textContent = renameStale ? 'Preview changes to regroup renamed entries before resolving their styles.'
      : !analysis.entries.length ? 'No configurable names or styles were found in these layers.'
      : remaining ? `Resolve ${remaining} ${remaining === 1 ? 'entry' : 'entries'} in the list, then preview changes. Conflicts are never chosen automatically.`
      : reviewed ? `Apply to all ${analysis.instances.length} selected modules. List filters do not limit the application.`
      : 'Preview the changes before applying names and styles to this group.';
  }
  function pageSize() { const size = Number($('pageSize').value); return [20, 50, 100].includes(size) ? size : 20; }
  function updatePagination() {
    const count = filteredEntries().length, pages = Math.max(1, Math.ceil(count / pageSize()));
    page = Math.max(0, Math.min(page, pages - 1));
    $('previousPage').disabled = busy || !analysis || page === 0; $('nextPage').disabled = busy || !analysis || page >= pages - 1;
    $('pageInfo').textContent = `Page ${page + 1} of ${pages}`;
    $('filteredCount').textContent = `${count} of ${analysis ? analysis.entries.length : 0} names`;
    const measure = $('frequencyLayer').value;
    $('frequencyHint').textContent = measure ? `${MEASURES[measure]}; counted once per ${measure === 'neighborhood' ? 'gene' : measure === 'architecture' ? 'protein' : measure === 'network' ? 'node' : 'record'} in each module. Counts are separate across layers.` : '';
  }
  function frequencyCell(entry) {
    const cell = element('td');
    reviewLayers.forEach(layer => {
      if ($('layerFilter').value && $('layerFilter').value !== layer) return;
      if (!scopeSources(entry).some(source => source.layer === layer)) return;
      const metric = scopedFrequency(entry, layer), line = element('div', null, 'frequency-line');
      line.append(element('strong', (metric.count || 0).toLocaleString()), document.createTextNode(` ${UNITS[layer]}`));
      line.title = `${LABELS[layer]}: ${(metric.occurrences || 0).toLocaleString()} occurrences in ${metric.instanceCount || 0} modules`;
      cell.append(line);
    });
    cell.append(element('small', `${scopedInstances(entry)} modules with data`, 'cell-note')); return cell;
  }

  function updateEntryRow(row, entry) {
    const resolved = entryResolved(entry);
    row.classList.toggle('has-conflict', !resolved);
    const status = row.querySelector('.entry-status');
    status.className = resolved ? 'entry-status' : 'entry-status unresolved';
    const choice = choices.get(entryName(entry));
    if (entry.colorEditable !== false && !validColor(choice.color)) status.textContent = 'Choose a color';
    else if (shapeApplies(entry) && !core.SHAPES.includes(choice.shape)) status.textContent = 'Choose a shape';
    else status.textContent = entry.colorConflict || (shapeApplies(entry) && entry.shapeConflict) ? 'Conflict resolved' : 'Ready';
  }

  function choiceChanged(row, entry) {
    invalidatePreview();
    updateEntryRow(row, entry);
    updateControls();
  }

  function colorCell(row, entry) {
    const cell = element('td');
    if (entry.colorEditable === false) {
      cell.append(element('small', 'Preserve taxonomy coloring mode', 'cell-note'));
      return cell;
    }
    const name = entryName(entry);
    const choice = choices.get(name);
    const controls = element('div', null, 'color-controls');
    const picker = element('input');
    picker.type = 'color';
    picker.value = normalizedHex(choice.color) || '#cbd5e1';
    picker.setAttribute('aria-label', `Choose shared color for ${name}`);
    const text = element('input', null, 'color-text');
    text.type = 'text';
    text.value = choice.colorText;
    text.placeholder = '#RRGGBB';
    text.autocomplete = 'off';
    text.spellcheck = false;
    text.setAttribute('aria-label', `Shared color for ${name}`);
    controls.append(picker, text);
    cell.append(controls);
    const candidates = element('select');
    candidates.setAttribute('aria-label', `Use an existing color for ${name}`);
    const prompt = element('option', entry.colorConflict ? 'Choose an existing color…' : 'Existing colors…');
    prompt.value = '';
    candidates.append(prompt);
    const colorUses = new Map();
    (entry.sources || []).forEach(source => { const key = String(source.color || '').toLowerCase(); if (key) colorUses.set(key, (colorUses.get(key) || 0) + 1); });
    (entry.colors || []).slice().sort((left, right) => (colorUses.get(String(right).toLowerCase()) || 0) - (colorUses.get(String(left).toLowerCase()) || 0)).slice(0, 100).forEach(color => {
      const uses = colorUses.get(String(color).toLowerCase()) || 0;
      const existing = element('option', `${color}${uses ? ` · ${uses} ${uses === 1 ? 'source' : 'sources'}` : ''}`);
      existing.value = color; candidates.append(existing);
    });
    if ((entry.colors || []).length) cell.append(candidates);
    else cell.append(element('small', 'Suggested color; adjust if needed.', 'cell-note'));
    if ((entry.colors || []).length > 100) cell.append(element('small', '100 most-used colors shown. Enter any other hexadecimal color.', 'cell-note'));
    if ((entry.colors || []).some(color => !normalizedHex(color))) cell.append(element('small', 'Choose a hexadecimal color (#RRGGBB) to share across viewers.', 'cell-note'));
    function setColor(value, isTextInput) {
      const normalized = normalizedHex(value);
      choice.touchedColor = true;
      choice.colorText = value;
      choice.color = normalized || (validColor(value) ? value : '');
      if (!isTextInput) text.value = value;
      text.classList.toggle('invalid-input', Boolean(value) && !choice.color);
      text.setAttribute('aria-invalid', String(Boolean(value) && !choice.color));
      if (normalized) picker.value = normalized;
      choiceChanged(row, entry);
    }
    picker.addEventListener('input', () => { candidates.value = ''; setColor(picker.value, false); });
    text.addEventListener('input', () => { candidates.value = ''; setColor(text.value, true); });
    candidates.addEventListener('change', () => { if (candidates.value) setColor(candidates.value, false); });
    [picker, text, candidates].forEach(control => { control.disabled = busy || renameStale; });
    return cell;
  }

  function shapeCell(row, entry) {
    const cell = element('td');
    if (!reviewShapes) {
      cell.append(element('small', 'Preserve current shapes', 'cell-note'));
      return cell;
    }
    if (!shapeApplies(entry)) {
      cell.append(element('small', 'Not applicable', 'cell-note'));
      return cell;
    }
    const choice = choices.get(entryName(entry));
    const select = element('select', null, 'shape-select');
    select.setAttribute('aria-label', `Shared shape for ${entryName(entry)}`);
    const prompt = element('option', 'Choose a shape…');
    prompt.value = '';
    select.append(prompt);
    core.SHAPES.forEach(shape => {
      const option = element('option', shape.charAt(0).toUpperCase() + shape.slice(1));
      option.value = shape;
      select.append(option);
    });
    select.value = choice.shape;
    select.disabled = busy || renameStale;
    select.addEventListener('change', () => { choice.shape = select.value; choice.touchedShape = true; choiceChanged(row, entry); });
    cell.append(select);
    if (entry.shapeConflict) cell.append(element('small', 'Different shapes found in architecture sources.', 'cell-note'));
    return cell;
  }

  function pagedDetails(details, items, render, noun) {
    let index = 0; const pageLength = 20;
    const body = element(noun === 'sources' ? 'ul' : 'div', null, noun === 'sources' ? 'source-list' : 'more-names-list');
    const pager = element('div', null, 'detail-pagination'), previous = element('button', 'Previous', 'button button-ghost detail-previous'), next = element('button', 'Next', 'button button-ghost detail-next'), info = element('span');
    previous.type = 'button'; next.type = 'button'; previous.setAttribute('aria-label', `Previous ${noun}`); next.setAttribute('aria-label', `Next ${noun}`);
    const update = () => {
      body.replaceChildren(...items.slice(index * pageLength, (index + 1) * pageLength).map(render));
      previous.disabled = index === 0; next.disabled = (index + 1) * pageLength >= items.length;
      info.textContent = `${index * pageLength + 1}–${Math.min(items.length, (index + 1) * pageLength)} of ${items.length}`;
    };
    previous.addEventListener('click', () => { index--; update(); }); next.addEventListener('click', () => { index++; update(); });
    pager.append(previous, info, next); details.append(body); if (items.length > pageLength) details.append(pager); update();
  }
  function sourcesCell(entry) {
    const cell = element('td'), sources = entry.sources || [], details = element('details', null, 'source-details');
    details.append(element('summary', `${sources.length} ${sources.length === 1 ? 'source' : 'sources'}`, 'source-summary'));
    let loaded = false;
    details.addEventListener('toggle', () => {
      if (!details.open || loaded) return; loaded = true;
      pagedDetails(details, sources, source => {
        const item = element('li'); item.append(element('strong', `${LABELS[source.layer] || source.layer} · ${source.title || source.itemId}`));
        if (source.sectionTitle) item.append(element('small', source.sectionTitle));
        item.append(element('code', String(source.originalId || source.name || entryName(entry))));
        if (source.previousName && source.previousName !== entryName(entry)) item.append(element('small', `Previous name: ${source.previousName}`));
        item.append(element('small', `${source.color || 'No explicit color'}${source.shape ? ` · ${source.shape}` : ''}`, 'source-style'));
        return item;
      }, 'sources');
      reviewLayers.forEach(layer => { const value = (entry.frequency || {})[layer]; if (value) details.append(element('small', `${LABELS[layer]}: ${value.count || 0} ${UNITS[layer]}, ${value.occurrences || 0} occurrences across ${value.instanceCount || 0} modules`, 'cell-note')); });
    });
    cell.append(details); return cell;
  }
  function renderTable() {
    updatePagination();
    const entries = filteredEntries(), body = $('paletteBody'); body.replaceChildren();
    if ($('namesPanel').hidden) return;
    entries.slice(page * pageSize(), (page + 1) * pageSize()).forEach(entry => {
      const row = element('tr'); row.append(nameCell(entry), frequencyCell(entry), colorCell(row, entry), shapeCell(row, entry), sourcesCell(entry));
      updateEntryRow(row, entry); body.append(row);
    });
    $('emptyReview').hidden = entries.length > 0;
    $('emptyReview').textContent = analysis && analysis.entries.length ? 'No names match these filters.' : 'No configurable styles were found in the selected layers.';
    updateReviewStatus();
  }
  function showNames(show) {
    $('namesPanel').hidden = !show; $('reviewNamesButton').textContent = show ? 'Collapse names' : 'Review names';
    $('reviewNamesButton').setAttribute('aria-expanded', String(show));
    if (show) { $('changesPanel').hidden = true; renderTable(); } else $('paletteBody').replaceChildren();
  }

  function changedEntry(entry) {
    const choice = choices.get(entryName(entry)), names = currentNames(entry);
    const renames = names.filter(name => name !== entryName(entry));
    const color = entry.colorEditable !== false && Boolean(choice.color) && (entry.sources || []).some(source => source.color && normalizedHex(source.color) !== normalizedHex(choice.color));
    const shape = shapeApplies(entry) && Boolean(choice.shape) && (entry.sources || []).some(source => source.layer === 'architecture' && source.shape && source.shape !== choice.shape);
    return { entry, renames, color, shape, merge: names.length > 1, unresolved: !entryResolved(entry) };
  }
  function updateChangePagination() {
    const pages = Math.max(1, Math.ceil(previewRows.length / CHANGE_PAGE_SIZE));
    changesPage = Math.max(0, Math.min(changesPage, pages - 1));
    $('previousChangesPage').disabled = busy || changesPage === 0; $('nextChangesPage').disabled = busy || changesPage >= pages - 1;
    $('changesPageInfo').textContent = `Page ${changesPage + 1} of ${pages}`;
    $('changesPagination').hidden = previewRows.length <= CHANGE_PAGE_SIZE;
  }
  function renderChangePreview() {
    const body = $('changesBody'); body.replaceChildren(); updateChangePagination();
    previewRows.slice(changesPage * CHANGE_PAGE_SIZE, (changesPage + 1) * CHANGE_PAGE_SIZE).forEach(change => {
      const { entry, renames, color, shape, merge, unresolved } = change, choice = choices.get(entryName(entry)), item = element('li');
      item.append(element('strong', entryName(entry)));
      const labels = [];
      if (renames.length) labels.push(`${renames.slice(0, 4).join(', ')}${renames.length > 4 ? ` + ${renames.length - 4} more` : ''} → ${entryName(entry)}`);
      if (merge) labels.push(`${currentNames(entry).length} names combined`);
      if (color) labels.push(`color ${choice.color}`); if (shape) labels.push(`shape ${choice.shape}`);
      if (unresolved) labels.push('style choice required');
      item.append(element('span', labels.join(' · '))); body.append(item);
    });
    $('emptyChanges').hidden = previewRows.length > 0;
    $('changesSummary').textContent = `${Object.keys(previewedRenames).length} name changes · ${previewRows.filter(row => row.merge).length} merged entries · ${previewRows.filter(row => row.color || row.shape).length} style updates${unresolvedCount() ? ` · ${unresolvedCount()} unresolved` : ''}`;
    $('changesScope').textContent = `Applies to all ${analysis.instances.length} modules in ${reviewLayers.map(layer => LABELS[layer]).join(' + ')}. Preview includes changes outside the current list filters.`;
    $('backToNamesButton').textContent = unresolvedCount() ? 'Resolve styles in list' : 'Back to names';
  }
  async function previewChanges() {
    if (!baseAnalysis || invalidRenameCount()) return;
    await perform('Previewing name changes and the shared palette…', async () => {
      const plan = renamePlan(), next = await core.analyze(session, reviewLayers, { renames: plan });
      setAnalysis(next, true); previewedRenames = plan; renameStale = false;
      previewRows = analysis.entries.map(changedEntry).filter(change => change.renames.length || change.merge || change.color || change.shape || change.unresolved);
      changesPage = 0; reviewed = true; renderWarnings(); showNames(false); renderChangePreview(); $('changesPanel').hidden = false;
      notify(unresolvedCount() ? `Preview ready. Resolve ${unresolvedCount()} ${unresolvedCount() === 1 ? 'entry' : 'entries'} in the list before applying.` : 'Preview ready. Review the changes, then apply them to the selected group.', !unresolvedCount());
    });
  }

  async function applyPalette() {
    if (!analysis || renameStale || !reviewed || unresolvedCount()) return;
    await perform('Applying names and the shared palette to every selected module instance…', async () => {
      const resolved = new Map();
      analysis.entries.forEach(entry => {
        const choice = choices.get(entryName(entry));
        const value = {};
        if (entry.colorEditable !== false) value.color = choice.color;
        if (shapeApplies(entry)) value.shape = choice.shape;
        resolved.set(entryName(entry), value);
      });
      const group = await core.applyGroup(session, reviewLayers, resolved, {
        name: $('groupName').value.trim() || reviewLayers.map(layer => LABELS[layer]).join(' + '),
        id: editingGroupId || undefined,
        includeShapes: reviewShapes,
        renames: previewedRenames
      });
      editingGroupId = group.id;
      $('groupName').value = group.name;
      pendingDownload = true;
      hasReviewEdits = false;
      // Start the next edit from committed names. An applied plan must not run twice.
      const next = await core.analyze(session, reviewLayers);
      baseAnalysis = next;
      renameEdits = new Map();
      previewedRenames = Object.create(null);
      renameStale = false;
      page = 0; reviewed = false; previewRows = []; $('changesPanel').hidden = true;
      setAnalysis(next); showNames(false); renderWarnings();
      renderGroups(group.id);
      notify(`Applied “${group.name}” to ${group.instanceCount} module ${group.instanceCount === 1 ? 'instance' : 'instances'}. Download the updated state to keep these changes.`, true);
      $('downloadPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function editGroup(group) {
    if (busy) return;
    editingGroupId = group.id;
    layerInputs.forEach(input => { input.checked = group.layers.includes(input.value); });
    $('groupName').value = group.name;
    $('includeShapes').checked = Boolean(group.shapes && Object.keys(group.shapes).length);
    invalidateReview();
    await analyzeSelection();
  }

  function renderGroups(preferredId) {
    const list = $('groupsList');
    const select = $('exportGroup');
    const selectedId = preferredId || select.value;
    list.replaceChildren();
    select.replaceChildren();
    groups().forEach(group => {
      const card = element('div', null, 'group-card');
      const copy = element('div');
      copy.append(element('strong', group.name));
      const colors = Object.keys(group.colors || {}).length;
      const shapes = Object.keys(group.shapes || {}).length;
      const renames = Object.keys(group.renames || {}).length;
      copy.append(element('p', `${group.layers.map(layer => LABELS[layer] || layer).join(' + ')} · ${group.instanceCount} instances · ${colors} colors${shapes ? ` · ${shapes} shapes` : ''}${renames ? ` · ${renames} latest name changes` : ''}`));
      const edit = element('button', 'Edit names and styles', 'button button-ghost button-small');
      edit.type = 'button';
      edit.disabled = busy;
      edit.setAttribute('aria-label', `Edit names and styles for ${group.name}`);
      edit.addEventListener('click', () => editGroup(group));
      card.append(copy, edit);
      list.append(card);
      const option = element('option', group.name);
      option.value = group.id;
      select.append(option);
    });
    if (groups().some(group => group.id === selectedId)) select.value = selectedId;
    $('downloadPanel').hidden = !groups().length;
    updatePaletteDownloads();
  }

  function chosenExportGroup() {
    return groups().find(group => group.id === $('exportGroup').value);
  }

  function updatePaletteDownloads() {
    const group = chosenExportGroup();
    $('exportColorsButton').disabled = busy || !group || !Object.keys(group.colors || {}).length;
    $('exportShapesButton').disabled = busy || !group || !Object.keys(group.shapes || {}).length;
    $('exportShapesButton').title = group && Object.keys(group.shapes || {}).length ? '' : 'This group has no unified architecture shapes.';
    $('exportRenamesButton').disabled = busy || !group || !Object.keys(group.renames || {}).length || typeof group.renameYaml !== 'string';
    $('exportRenamesButton').title = group && Object.keys(group.renames || {}).length ? '' : 'This group has no applied rename plan.';
  }

  function safeFilename(name, fallback) {
    const safe = String(name || '').replace(/\.zip$/i, '').normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
    return safe || fallback;
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = element('a');
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function exportState() {
    if (!session || !groups().length) return;
    await perform('Packaging the updated Builder state…', async () => {
      const blob = await core.exportState(session, { type: 'blob' });
      const base = safeFilename(session.name || session.title, 'evosupplement-builder-state').replace(/-styles$/i, '');
      download(blob, `${base}-styles.zip`);
      pendingDownload = false;
      notify(`Downloaded the updated state with ${groups().length} applied palette ${groups().length === 1 ? 'group' : 'groups'}. Open it with Load state in the Builder.${hasReviewEdits ? ' Your current review edits still need to be applied.' : ''}`, true);
    });
  }

  function exportPalette(type) {
    const group = chosenExportGroup();
    if (!group) return;
    const content = type === 'color' ? group.colorYaml : type === 'shape' ? group.shapeYaml : group.renameYaml;
    if (typeof content !== 'string') {
      reportError(new Error('This palette is not available. Review and apply the group again.'));
      return;
    }
    download(new Blob([content], { type: 'application/yaml;charset=utf-8' }), `${safeFilename(group.name, 'shared')}-${type === 'color' ? 'colors' : type === 'shape' ? 'shapes' : 'rename-plan'}.yaml`);
    notify(`Downloaded the ${type} YAML for “${group.name}”.`, true);
  }

  $('stateFile').addEventListener('change', event => loadState(event.target.files && event.target.files[0]));
  layerInputs.forEach(input => input.addEventListener('change', invalidateReview));
  $('includeShapes').addEventListener('change', invalidateReview);
  $('newGroupButton').addEventListener('click', () => { startNewGroup(); clearError(); notify('Choose unassigned layers for another independent palette group.'); });
  $('analyzeButton').addEventListener('click', analyzeSelection);
  $('reviewNamesButton').addEventListener('click', () => showNames($('namesPanel').hidden));
  $('backToNamesButton').addEventListener('click', () => {
    if (unresolvedCount()) { $('conflictsOnly').checked = true; $('changedOnly').checked = false; $('searchInput').value = ''; $('minFrequency').value = '0'; $('layerFilter').value = ''; fillModuleOptions(); }
    page = 0; showNames(true);
  });
  $('renameFile').addEventListener('change', event => importRenames(event.target.files && event.target.files[0]));
  $('resetRenamesButton').addEventListener('click', () => { renameEdits = new Map(); nameEdited(); renderTable(); });
  $('previewChangesButton').addEventListener('click', previewChanges);
  $('applyButton').addEventListener('click', applyPalette);
  $('groupName').addEventListener('input', () => { if (analysis) { invalidatePreview(); updateControls(); } });
  ['searchInput', 'minFrequency'].forEach(id => $(id).addEventListener('input', () => { page = 0; renderTable(); }));
  ['conflictsOnly', 'changedOnly', 'sortBy', 'frequencyLayer', 'pageSize'].forEach(id => $(id).addEventListener('change', () => { page = 0; renderTable(); }));
  $('layerFilter').addEventListener('change', () => { fillModuleOptions(); if ($('layerFilter').value) $('frequencyLayer').value = $('layerFilter').value; page = 0; renderTable(); });
  $('moduleFilter').addEventListener('change', () => { const instance = analysis.instances.find(item => (item.itemId || item.id) === $('moduleFilter').value); if (instance) $('frequencyLayer').value = instance.layer; page = 0; renderTable(); });
  $('previousPage').addEventListener('click', () => { page--; renderTable(); });
  $('nextPage').addEventListener('click', () => { page++; renderTable(); });
  $('previousChangesPage').addEventListener('click', () => { changesPage--; renderChangePreview(); });
  $('nextChangesPage').addEventListener('click', () => { changesPage++; renderChangePreview(); });
  $('exportGroup').addEventListener('change', updatePaletteDownloads);
  $('exportStateButton').addEventListener('click', exportState);
  $('exportColorsButton').addEventListener('click', () => exportPalette('color'));
  $('exportShapesButton').addEventListener('click', () => exportPalette('shape'));
  $('exportRenamesButton').addEventListener('click', () => exportPalette('rename'));
  window.addEventListener('beforeunload', event => {
    if (!pendingDownload && !hasReviewEdits) return;
    event.preventDefault();
    event.returnValue = '';
  });
  if (!core || typeof window.JSZip === 'undefined') reportError(new Error('The local Style Manager scripts could not be loaded. Open EvoSupplement through its local server and reload this page.'));
  updateControls();
})();
