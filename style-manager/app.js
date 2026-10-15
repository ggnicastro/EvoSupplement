/* EvoSupplement Project Style Manager — local authoring UI. */
(function () {
  'use strict';

  const core = window.EvoStyleCore;
  const LAYERS = ['taxonomy', 'neighborhood', 'architecture', 'network'];
  const LABELS = { taxonomy: 'Taxonomy', neighborhood: 'Neighborhood', architecture: 'Architecture', network: 'Network' };
  const PAGE_SIZE = 50;
  const $ = id => document.getElementById(id);
  const layerInputs = Array.from(document.querySelectorAll('input[name="layer"]'));
  let session = null;
  let analysis = null;
  let baseAnalysis = null;
  let renameEdits = new Map();
  let previewedRenames = Object.create(null);
  let renameStale = false;
  let renamePage = 0;
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
      const group = assignment(input.value);
      input.disabled = busy || !session || Boolean(editingGroupId) || !countLayer(input.value) || Boolean(group);
      const count = countLayer(input.value);
      let note = session ? `${count} ${count === 1 ? 'instance' : 'instances'}` : 'Load a state first';
      if (group) note += ` · ${group.name}`;
      $('count-' + input.value).textContent = note;
    });
    const selected = selectedLayers();
    $('includeShapes').disabled = busy || !session || !selected.includes('architecture');
    $('analyzeButton').disabled = busy || !session || !selected.length;
    $('newGroupButton').hidden = !editingGroupId;
    $('newGroupButton').disabled = busy;
    $('searchInput').disabled = busy || !analysis || renameStale;
    $('conflictsOnly').disabled = busy || !analysis || renameStale;
    $('applyButton').disabled = busy || !analysis || renameStale || !analysis.entries.length || unresolvedCount() > 0;
    $('applyButton').textContent = editingGroupId ? 'Update shared palette' : 'Apply shared palette';
    $('exportStateButton').disabled = busy || !groups().length;
    $('exportGroup').disabled = busy || !groups().length;
    document.querySelectorAll('#groupsList button').forEach(button => { button.disabled = busy; });
    document.querySelectorAll('#paletteBody input,#paletteBody select').forEach(control => { control.disabled = busy || renameStale; });
    document.querySelectorAll('#renameBody input').forEach(control => { control.disabled = busy; });
    $('renameSearchInput').disabled = busy || !baseAnalysis;
    $('renameFile').disabled = busy || !baseAnalysis;
    $('previewRenamesButton').disabled = busy || !baseAnalysis || invalidRenameCount() > 0;
    $('resetRenamesButton').disabled = busy || !baseAnalysis || !renameEdits.size;
    $('renameStaleNotice').hidden = !renameStale;
    updatePaletteDownloads();
    updateReviewStatus();
    updatePagination();
    updateRenamePagination();
    updateRenameHint();
    if (editingGroupId) {
      $('layerHint').textContent = 'Editing an applied group. Its layer membership is fixed; use New group for unassigned layers. To regroup layers, reload your original state ZIP.';
    } else {
      $('layerHint').textContent = 'Names are matched exactly after renaming. Network uses Function categories; taxonomy retains its coloring mode. Each layer belongs to one palette group.';
    }
  }

  function invalidateReview() {
    analysis = null;
    baseAnalysis = null;
    renameEdits = new Map();
    previewedRenames = Object.create(null);
    renameStale = false;
    choices = new Map();
    reviewLayers = [];
    hasReviewEdits = false;
    $('reviewPanel').hidden = true;
    $('paletteBody').replaceChildren();
    $('renameBody').replaceChildren();
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
    const layers = selectedLayers();
    const includeShapes = $('includeShapes').checked && layers.includes('architecture');
    await perform('Reading styles and final display names from the selected layers…', async () => {
      const next = await core.analyze(session, layers);
      reviewLayers = layers;
      reviewShapes = includeShapes;
      baseAnalysis = next;
      renameEdits = new Map();
      previewedRenames = Object.create(null);
      renameStale = false;
      setAnalysis(next);
      hasReviewEdits = false;
      page = 0;
      renamePage = 0;
      $('searchInput').value = '';
      $('renameSearchInput').value = '';
      $('conflictsOnly').checked = false;
      $('reviewPanel').hidden = false;
      $('shapeColumnHeading').textContent = reviewShapes ? 'Architecture shape' : 'Shape';
      renderRenameTable();
      renderWarnings();
      renderTable();
      const remaining = unresolvedCount();
      notify(remaining ? `Review ready. ${remaining} ${remaining === 1 ? 'name needs' : 'names need'} a style choice.` : 'Review ready. Inspect the palette, then apply it to the selected layers.', !remaining);
      $('reviewHeading').setAttribute('tabindex', '-1');
      $('reviewHeading').focus({ preventScroll: true });
      $('reviewPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function sourceSignature(entry) {
    return JSON.stringify([entry.colorEditable !== false, (entry.sources || []).map(source =>
      [source.layer, source.itemId, source.originalId]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
  }

  function setAnalysis(next, preserveChoices = false) {
    const previous = new Map();
    if (preserveChoices && analysis) analysis.entries.forEach(entry => previous.set(sourceSignature(entry), choices.get(entryName(entry))));
    analysis = next;
    choices = new Map();
    analysis.entries.forEach(entry => {
      const existing = previous.get(sourceSignature(entry));
      const color = entry.colorConflict ? '' : (entry.suggestedColor || entry.colors[0] || '');
      const shape = entry.shapeConflict ? '' : (entry.suggestedShape || entry.shapes[0] || 'rounded');
      choices.set(entryName(entry), existing ? { ...existing } : { color, colorText: color, shape });
    });
    $('reviewSummary').textContent = `${reviewLayers.map(layer => LABELS[layer]).join(' + ')} · ${analysis.instances.length} module ${analysis.instances.length === 1 ? 'instance' : 'instances'} · ${analysis.entries.length} final ${analysis.entries.length === 1 ? 'name' : 'names'}`;
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

  function nameEdited() {
    renameStale = invalidRenameCount() > 0 || !sameRenamePlan(renamePlan(), previewedRenames);
    hasReviewEdits = true;
    updateControls();
  }

  function filteredRenameEntries() {
    if (!baseAnalysis) return [];
    const query = $('renameSearchInput').value.trim().toLocaleLowerCase();
    return baseAnalysis.entries.filter(entry => !query || [entryName(entry), renameEdits.get(entryName(entry)),
      ...(entry.sources || []).flatMap(source => [source.originalId, source.title, source.sectionTitle, LABELS[source.layer]])]
      .some(value => String(value || '').toLocaleLowerCase().includes(query)));
  }

  function updateRenamePagination() {
    const count = filteredRenameEntries().length;
    const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
    renamePage = Math.max(0, Math.min(renamePage, pages - 1));
    $('previousRenamePage').disabled = busy || !baseAnalysis || renamePage === 0;
    $('nextRenamePage').disabled = busy || !baseAnalysis || renamePage >= pages - 1;
    $('renamePageInfo').textContent = `Page ${renamePage + 1} of ${pages}`;
    $('renameFilteredCount').textContent = `${count} ${count === 1 ? 'name' : 'names'} shown`;
  }

  function updateRenameHint() {
    const count = Object.keys(renamePlan()).length;
    const invalid = invalidRenameCount();
    $('renameHint').textContent = invalid ? `${invalid} ${invalid === 1 ? 'name is' : 'names are'} invalid. Use nonempty text without control characters.`
      : count ? `${count} ${count === 1 ? 'name change' : 'name changes'} ${renameStale ? 'to preview' : 'previewed'}. Changes are saved only when you apply the group.`
        : 'Keep a name as it is, or enter its replacement. Renames are applied simultaneously, without following rename chains.';
  }

  function renderRenameTable() {
    updateRenamePagination();
    const entries = filteredRenameEntries();
    const body = $('renameBody');
    body.replaceChildren();
    entries.slice(renamePage * PAGE_SIZE, (renamePage + 1) * PAGE_SIZE).forEach(entry => {
      const name = entryName(entry), row = element('tr'), current = element('td'), target = element('td');
      current.append(element('strong', name, 'rename-current-name'));
      const input = element('input');
      input.type = 'text';
      input.value = renameEdits.has(name) ? renameEdits.get(name) : name;
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute('aria-label', `New display name for ${name}`);
      input.disabled = busy;
      const validate = () => {
        const invalid = !input.value.trim() || /[\u0000-\u001f\u007f]/.test(input.value);
        input.classList.toggle('invalid-input', invalid);
        input.setAttribute('aria-invalid', String(invalid));
      };
      validate();
      input.addEventListener('input', () => {
        if (input.value === name) renameEdits.delete(name); else renameEdits.set(name, input.value);
        validate();
        nameEdited();
      });
      target.append(input);
      row.append(current, target, sourcesCell(entry));
      body.append(row);
    });
    $('emptyRenames').hidden = entries.length > 0;
    updateRenameHint();
  }

  async function previewRenames() {
    if (!baseAnalysis || invalidRenameCount()) return;
    const plan = renamePlan();
    await perform('Previewing renamed entries and their combined styles…', async () => {
      const next = await core.analyze(session, reviewLayers, { renames: plan });
      setAnalysis(next, true);
      previewedRenames = plan;
      renameStale = false;
      page = 0;
      renderWarnings();
      renderTable();
      const remaining = unresolvedCount();
      notify(remaining ? `Rename preview ready. Resolve styles for ${remaining} ${remaining === 1 ? 'name' : 'names'} before applying.` : 'Rename preview ready. Apply the group to save its names and styles.', !remaining);
    });
  }

  async function importRenames(file) {
    if (!file || !baseAnalysis) return;
    await perform('Reading the rename plan YAML…', async () => {
      const plan = core.parseRenameYaml(await file.text());
      const names = new Set(baseAnalysis.entries.map(entryName));
      const unknown = Object.keys(plan).filter(name => !names.has(name));
      if (unknown.length) throw new Error(`Rename plan contains names absent from the selected layers: ${unknown.slice(0, 5).join(', ')}. Use current display names as keys.`);
      // Validate all targets before replacing any pending edits.
      await core.analyze(session, reviewLayers, { renames: plan });
      renameEdits = new Map(Object.entries(plan).filter(([name, value]) => name !== value));
      renamePage = 0;
      renderRenameTable();
      nameEdited();
      notify('Rename plan imported. Preview the renamed palette, then resolve any style conflicts.');
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

  function filteredEntries() {
    if (!analysis) return [];
    const query = $('searchInput').value.trim().toLocaleLowerCase();
    return analysis.entries.filter(entry => {
      if ($('conflictsOnly').checked && entryResolved(entry)) return false;
      if (!query) return true;
      return [entryName(entry), ...(entry.sources || []).flatMap(source => [source.originalId, source.title, source.sectionTitle, LABELS[source.layer]])]
        .some(value => String(value || '').toLocaleLowerCase().includes(query));
    });
  }

  function updateReviewStatus() {
    if (!analysis) return;
    const remaining = unresolvedCount();
    $('conflictBadge').textContent = renameStale ? 'Preview name edits' : remaining ? `${remaining} unresolved` : 'Ready to apply';
    $('conflictBadge').className = renameStale || remaining ? 'badge badge-warning' : 'badge';
    $('applyHint').textContent = renameStale ? 'Preview the name edits to refresh the palette before applying.' : !analysis.entries.length ? 'No configurable names or styles were found in these layers.' : remaining
      ? `Choose the missing colors${reviewShapes ? ' or shapes' : ''} for ${remaining} ${remaining === 1 ? 'name' : 'names'}. Conflicting values are never selected automatically.`
      : `Apply the previewed names and palette to all ${analysis.instances.length} selected module ${analysis.instances.length === 1 ? 'instance' : 'instances'}. Original identifiers are preserved.`;
    $('applyButton').disabled = busy || renameStale || !analysis.entries.length || remaining > 0;
  }

  function updatePagination() {
    const count = filteredEntries().length;
    const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
    page = Math.max(0, Math.min(page, pages - 1));
    $('previousPage').disabled = busy || !analysis || renameStale || page === 0;
    $('nextPage').disabled = busy || !analysis || renameStale || page >= pages - 1;
    $('pageInfo').textContent = `Page ${page + 1} of ${pages}`;
    $('filteredCount').textContent = `${count} ${count === 1 ? 'name' : 'names'} shown`;
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
    hasReviewEdits = true;
    updateEntryRow(row, entry);
    updateReviewStatus();
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
    const text = element('input');
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
    (entry.colors || []).forEach(color => {
      const uses = (entry.sources || []).filter(source => String(source.color).toLowerCase() === String(color).toLowerCase()).length;
      const option = element('option', `${color}${uses ? ` · ${uses} ${uses === 1 ? 'source' : 'sources'}` : ''}`);
      option.value = color;
      candidates.append(option);
    });
    if ((entry.colors || []).length) cell.append(candidates);
    else cell.append(element('small', 'Suggested color; adjust if needed.', 'cell-note'));
    if ((entry.colors || []).some(color => !normalizedHex(color))) cell.append(element('small', 'Choose a hexadecimal color (#RRGGBB) to share across viewers.', 'cell-note'));
    function setColor(value, isTextInput) {
      const normalized = normalizedHex(value);
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
    const select = element('select');
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
    select.addEventListener('change', () => { choice.shape = select.value; choiceChanged(row, entry); });
    cell.append(select);
    if (entry.shapeConflict) cell.append(element('small', 'Different shapes found in architecture sources.', 'cell-note'));
    return cell;
  }

  function sourcesCell(entry) {
    const cell = element('td');
    const sources = entry.sources || [];
    const details = element('details');
    const instances = new Set(sources.map(source => source.itemId));
    const layers = Array.from(new Set(sources.map(source => LABELS[source.layer] || source.layer)));
    details.append(element('summary', `${sources.length} ${sources.length === 1 ? 'source' : 'sources'} · ${instances.size} ${instances.size === 1 ? 'instance' : 'instances'}`, 'source-summary'));
    const list = element('ul', null, 'source-list');
    sources.forEach(source => {
      const item = element('li');
      item.append(element('strong', `${LABELS[source.layer] || source.layer} · ${source.title || source.itemId}`));
      if (source.sectionTitle) item.append(element('small', source.sectionTitle));
      item.append(element('code', String(source.originalId || source.name || entryName(entry))));
      if (source.previousName && source.previousName !== entryName(entry)) item.append(element('small', `Previous name: ${source.previousName}`));
      const style = element('small', null, 'source-style');
      if (source.color) {
        const swatch = element('span', null, 'color-swatch');
        if (validColor(source.color)) swatch.style.backgroundColor = source.color;
        swatch.setAttribute('aria-hidden', 'true');
        style.append(swatch, document.createTextNode(String(source.color)));
      } else style.append(document.createTextNode('No explicit color'));
      if (source.shape) style.append(document.createTextNode(` · ${source.shape}`));
      item.append(style);
      list.append(item);
    });
    details.append(list);
    cell.append(details, element('small', layers.join(' + '), 'cell-note'));
    return cell;
  }

  function renderTable() {
    updatePagination();
    const entries = filteredEntries();
    const body = $('paletteBody');
    body.replaceChildren();
    entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).forEach(entry => {
      const row = element('tr');
      const name = element('td');
      name.append(element('strong', entryName(entry), 'entry-name'), element('span', '', 'entry-status'));
      row.append(name, colorCell(row, entry), shapeCell(row, entry), sourcesCell(entry));
      updateEntryRow(row, entry);
      body.append(row);
    });
    $('emptyReview').hidden = entries.length > 0;
    $('emptyReview').textContent = analysis && analysis.entries.length ? 'No names match these filters.' : 'No configurable styles were found in the selected layers.';
    updateReviewStatus();
  }

  async function applyPalette() {
    if (!analysis || renameStale || unresolvedCount()) return;
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
      renamePage = 0;
      page = 0;
      $('renameSearchInput').value = '';
      setAnalysis(next);
      renderRenameTable();
      renderWarnings();
      renderTable();
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
  $('renameSearchInput').addEventListener('input', () => { renamePage = 0; renderRenameTable(); });
  $('previousRenamePage').addEventListener('click', () => { renamePage--; renderRenameTable(); });
  $('nextRenamePage').addEventListener('click', () => { renamePage++; renderRenameTable(); });
  $('renameFile').addEventListener('change', event => importRenames(event.target.files && event.target.files[0]));
  $('previewRenamesButton').addEventListener('click', previewRenames);
  $('resetRenamesButton').addEventListener('click', () => { renameEdits = new Map(); nameEdited(); renderRenameTable(); });
  $('applyButton').addEventListener('click', applyPalette);
  $('searchInput').addEventListener('input', () => { page = 0; renderTable(); });
  $('conflictsOnly').addEventListener('change', () => { page = 0; renderTable(); });
  $('previousPage').addEventListener('click', () => { page--; renderTable(); });
  $('nextPage').addEventListener('click', () => { page++; renderTable(); });
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
