(() => {
  'use strict';

  const selected = { tree: null, annotations: null, curation: null };
  const els = {};
  let latestState = null;
  let syncing = false;
  let restoringHistory = false;
  let lastCurationSnapshot = null;
  const undoStack = [];
  const redoStack = [];
  const HISTORY_LIMIT = 50;

  function byId(id) { return document.getElementById(id); }
  function clean(value) { return String(value ?? '').trim(); }
  function validHex(value) { return /^#[0-9a-f]{6}$/i.test(clean(value)); }

  function setMessage(text, tone = '') {
    els.authorMessage.textContent = text || '';
    els.authorMessage.dataset.tone = tone;
  }

  function syncColor(colorInput, textInput, value, callback) {
    const normalized = validHex(value) ? value.toLowerCase() : colorInput.value;
    colorInput.value = normalized;
    textInput.value = normalized;
    if (callback) callback(normalized);
  }


  function curationSnapshot() {
    try {
      return JSON.stringify(window.PhylogenyViewer.getCuration());
    } catch (_) {
      return null;
    }
  }

  function updateHistoryButtons() {
    if (!els.undoCuration || !els.redoCuration) return;
    els.undoCuration.disabled = undoStack.length === 0;
    els.redoCuration.disabled = redoStack.length === 0;
  }

  function resetHistory() {
    undoStack.length = 0;
    redoStack.length = 0;
    lastCurationSnapshot = curationSnapshot();
    updateHistoryButtons();
  }

  function recordHistorySnapshot() {
    if (restoringHistory) return;
    const current = curationSnapshot();
    if (!current) return;
    if (lastCurationSnapshot == null) {
      lastCurationSnapshot = current;
      updateHistoryButtons();
      return;
    }
    if (current === lastCurationSnapshot) return;
    undoStack.push(lastCurationSnapshot);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
    lastCurationSnapshot = current;
    updateHistoryButtons();
  }

  function restoreHistorySnapshot(snapshot, direction) {
    if (!snapshot) return;
    restoringHistory = true;
    try {
      const parsed = JSON.parse(snapshot);
      window.PhylogenyViewer.applyCuration(parsed);
      lastCurationSnapshot = curationSnapshot() || snapshot;
      setMessage(direction === 'undo' ? 'Previous authoring state restored.' : 'Next authoring state restored.', 'success');
    } catch (error) {
      setMessage(error.message || String(error), 'error');
    } finally {
      restoringHistory = false;
      updateHistoryButtons();
    }
  }

  function bindHistory() {
    els.undoCuration.addEventListener('click', () => {
      if (!undoStack.length || !lastCurationSnapshot) return;
      const target = undoStack.pop();
      redoStack.push(lastCurationSnapshot);
      restoreHistorySnapshot(target, 'undo');
    });
    els.redoCuration.addEventListener('click', () => {
      if (!redoStack.length || !lastCurationSnapshot) return;
      const target = redoStack.pop();
      undoStack.push(lastCurationSnapshot);
      restoreHistorySnapshot(target, 'redo');
    });
  }

  function updateSelectionFiles() {
    els.treeFileName.textContent = selected.tree ? selected.tree.name : 'No local file selected';
    els.annotationFileName.textContent = selected.annotations ? selected.annotations.name : 'No local file selected';
    els.curationFileName.textContent = selected.curation ? selected.curation.name : 'No local file selected';
    els.clearAnnotationButton.hidden = !selected.annotations;
    els.clearCurationButton.hidden = !selected.curation;
    els.loadLocalButton.disabled = !selected.tree;
  }

  function renderSelection(state) {
    const selection = state?.selection;
    if (!selection?.selected) {
      els.selectedNodeSummary.textContent = 'Click an internal node to select its branch. A node with a support value is marked or unmarked by the same click.';
      els.addCladeGroup.disabled = true;
      return;
    }
    const support = selection.support || 'no support label';
    els.selectedNodeSummary.textContent = `${selection.tipCount.toLocaleString()} tips on selected side · support ${support} · ${selection.marked ? 'marked' : 'not marked'}`;
    els.addCladeGroup.disabled = false;
  }

  function groupRow(group) {
    const row = document.createElement('article');
    row.className = 'group-row';
    row.dataset.groupId = group.id;

    const swatch = document.createElement('input');
    swatch.type = 'color';
    swatch.value = validHex(group.color) ? group.color : '#4f8fd9';
    swatch.title = 'Group color';

    const name = document.createElement('input');
    name.type = 'text';
    name.value = group.name;
    name.setAttribute('aria-label', 'Group name');

    const count = document.createElement('span');
    count.className = 'group-count';
    count.textContent = `${group.tipCount.toLocaleString()} tips`;

    const labelWrap = document.createElement('label');
    labelWrap.className = 'mini-check';
    const showLabel = document.createElement('input');
    showLabel.type = 'checkbox';
    showLabel.checked = Boolean(group.showLabel);
    labelWrap.append(showLabel, document.createTextNode(' Tree label'));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'mini-button danger';
    remove.textContent = 'Remove';

    let updateTimer = null;
    const update = () => {
      clearTimeout(updateTimer);
      updateTimer = setTimeout(() => {
        window.PhylogenyViewer.updateGroup(group.id, { name: name.value, color: swatch.value, showLabel: showLabel.checked });
      }, 120);
    };
    name.addEventListener('input', update);
    swatch.addEventListener('input', update);
    showLabel.addEventListener('change', update);
    remove.addEventListener('click', () => window.PhylogenyViewer.removeGroup(group.id));

    row.append(swatch, name, count, labelWrap, remove);
    return row;
  }

  function renderGroups(groups) {
    els.cladeGroupList.textContent = '';
    if (!groups?.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-note';
      empty.textContent = 'No clade groups yet.';
      els.cladeGroupList.appendChild(empty);
      return;
    }
    for (const group of groups) els.cladeGroupList.appendChild(groupRow(group));
  }

  function hoverColumnSelection(proposedIdColumn = '') {
    const table = latestState?.table;
    if (!table || table.empty) return [];
    const idColumn = clean(proposedIdColumn || els.tipIdColumn.value || table.idColumn);
    const previousId = clean(table.idColumn);
    const boxes = [...els.hoverColumnOptions.querySelectorAll('input[type="checkbox"][data-header]')];
    const optionalHeaders = table.headers.filter(header => header !== idColumn);
    const selected = boxes
      .filter(box => box.checked)
      .map(box => box.dataset.header)
      .filter(header => header && header !== idColumn && header !== previousId);
    if (optionalHeaders.length && optionalHeaders.every(header => selected.includes(header) || header === previousId)) return [];
    if (!selected.length) return [idColumn || table.idColumn];
    return selected;
  }

  function applyHoverColumnSelection() {
    if (!latestState?.table || latestState.table.empty) return;
    window.PhylogenyViewer.setTooltipColumns(hoverColumnSelection());
  }

  function renderHoverColumnControls(state) {
    const table = state?.table;
    els.hoverColumnOptions.textContent = '';
    const available = Boolean(table && !table.empty && table.headers.length);
    els.selectAllHoverColumns.disabled = !available;
    els.clearHoverColumns.disabled = !available;
    if (!available) {
      const empty = document.createElement('span');
      empty.className = 'empty-note';
      empty.textContent = 'Load an annotation TSV to choose hover fields.';
      els.hoverColumnOptions.appendChild(empty);
      return;
    }
    const configured = state.labels?.tooltipColumns || [];
    const showAll = configured.length === 0;
    const selectedKeys = new Set(configured.map(value => value.toLocaleLowerCase()));
    for (const header of table.headers) {
      const label = document.createElement('label');
      label.className = `hover-column-option${header === table.idColumn ? ' is-id' : ''}`;
      label.title = header;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.header = header;
      checkbox.checked = header === table.idColumn || showAll || selectedKeys.has(header.toLocaleLowerCase());
      checkbox.disabled = header === table.idColumn;
      checkbox.addEventListener('change', applyHoverColumnSelection);
      const text = document.createElement('span');
      text.textContent = header === table.idColumn ? `${header} (tip ID)` : header;
      label.append(checkbox, text);
      els.hoverColumnOptions.appendChild(label);
    }
  }

  function renderTableControls(state) {
    const table = state?.table;
    const previous = els.tipIdColumn.value;
    els.tipIdColumn.textContent = '';
    if (!table) {
      const option = document.createElement('option');
      option.value = 'id'; option.textContent = 'id';
      els.tipIdColumn.appendChild(option);
      els.tipIdColumn.disabled = true;
      return;
    }
    for (const header of table.headers) {
      const option = document.createElement('option');
      option.value = header;
      option.textContent = header;
      els.tipIdColumn.appendChild(option);
    }
    els.tipIdColumn.value = table.headers.includes(table.idColumn) ? table.idColumn : (table.headers.includes(previous) ? previous : table.headers[0]);
    els.tipIdColumn.disabled = table.empty;
    els.applyTipLabels.disabled = !state.loaded;
  }

  function syncState(state) {
    if (!state) return;
    latestState = state;
    syncing = true;
    els.supportDisplay.value = state.supports.display;
    syncColor(els.supportColor, els.supportColorText, state.supports.color);
    els.supportSize.value = String(state.supports.size);
    els.supportSizeValue.textContent = `${state.supports.size} px`;
    els.supportNumberSize.value = String(state.supports.numberSize);
    els.supportNumberSizeValue.textContent = `${state.supports.numberSize} px`;
    els.clearMarkedSupports.disabled = !state.supports.marked.length;
    els.markSupportsAbove.disabled = !state.loaded;
    els.downloadPhylogenyYaml.disabled = !state.loaded;
    els.tipLabelTemplate.value = state.labels.template || '{tip}';
    renderSelection(state);
    renderGroups(state.groups);
    renderTableControls(state);
    renderHoverColumnControls(state);
    syncing = false;
  }

  function bindFiles() {
    els.chooseTreeButton.addEventListener('click', () => els.treeFileInput.click());
    els.chooseAnnotationButton.addEventListener('click', () => els.annotationFileInput.click());
    els.chooseCurationButton.addEventListener('click', () => els.curationFileInput.click());
    els.treeFileInput.addEventListener('change', () => { selected.tree = els.treeFileInput.files?.[0] || null; updateSelectionFiles(); });
    els.annotationFileInput.addEventListener('change', () => { selected.annotations = els.annotationFileInput.files?.[0] || null; updateSelectionFiles(); });
    els.curationFileInput.addEventListener('change', () => { selected.curation = els.curationFileInput.files?.[0] || null; updateSelectionFiles(); });
    els.clearAnnotationButton.addEventListener('click', () => { selected.annotations = null; els.annotationFileInput.value = ''; updateSelectionFiles(); });
    els.clearCurationButton.addEventListener('click', () => { selected.curation = null; els.curationFileInput.value = ''; updateSelectionFiles(); });
    els.loadLocalButton.addEventListener('click', async () => {
      if (!selected.tree) return;
      setMessage('Loading local phylogeny…');
      const result = await window.PhylogenyViewer.loadSources(selected.tree, selected.annotations, selected.curation);
      setMessage(result ? `Loaded ${result.tips.toLocaleString()} tips, ${result.groups} groups, and ${result.markedSupports} marked supports.` : 'Could not load the selected files.', result ? 'success' : 'error');
    });
    els.loadExampleButton.addEventListener('click', async () => {
      setMessage('Reloading configured example…');
      const result = await window.PhylogenyViewer.loadConfigured();
      setMessage(result ? 'Example restored.' : 'Could not reload the example.', result ? 'success' : 'error');
    });
  }

  function bindSupports() {
    const apply = () => {
      if (syncing) return;
      window.PhylogenyViewer.setSupportStyle({
        display: els.supportDisplay.value,
        color: els.supportColorText.value,
        size: Number(els.supportSize.value),
        numberSize: Number(els.supportNumberSize.value)
      });
    };
    els.supportDisplay.addEventListener('change', apply);
    els.supportColor.addEventListener('input', () => syncColor(els.supportColor, els.supportColorText, els.supportColor.value, apply));
    els.supportColorText.addEventListener('change', () => syncColor(els.supportColor, els.supportColorText, els.supportColorText.value, apply));
    els.supportSize.addEventListener('input', () => { els.supportSizeValue.textContent = `${els.supportSize.value} px`; apply(); });
    els.supportNumberSize.addEventListener('input', () => { els.supportNumberSizeValue.textContent = `${els.supportNumberSize.value} px`; apply(); });
    els.markSupportsAbove.addEventListener('click', () => {
      const value = Number(els.supportThreshold.value);
      if (!Number.isFinite(value)) { setMessage('Enter a numerical support threshold.', 'error'); return; }
      const added = window.PhylogenyViewer.markSupportsAbove(value);
      setMessage(`${added.toLocaleString()} new support markers were added.`, 'success');
    });
    els.clearMarkedSupports.addEventListener('click', () => {
      window.PhylogenyViewer.clearMarkedSupports();
      setMessage('All marked supports were cleared.', 'success');
    });
  }

  function bindGroups() {
    els.groupColor.addEventListener('input', () => syncColor(els.groupColor, els.groupColorText, els.groupColor.value));
    els.groupColorText.addEventListener('change', () => syncColor(els.groupColor, els.groupColorText, els.groupColorText.value));
    els.addCladeGroup.addEventListener('click', () => {
      try {
        const id = window.PhylogenyViewer.createGroupFromSelection({
          name: els.groupName.value,
          color: els.groupColorText.value,
          showLabel: els.groupShowLabel.checked
        });
        els.groupName.value = '';
        setMessage(`Created clade group ${id}.`, 'success');
      } catch (error) {
        setMessage(error.message || String(error), 'error');
      }
    });
  }

  function bindLabels() {
    els.selectAllHoverColumns.addEventListener('click', () => {
      for (const box of els.hoverColumnOptions.querySelectorAll('input[type="checkbox"]')) box.checked = true;
      window.PhylogenyViewer.setTooltipColumns([]);
      setMessage('All TSV fields will be shown in tip hover.', 'success');
    });
    els.clearHoverColumns.addEventListener('click', () => {
      for (const box of els.hoverColumnOptions.querySelectorAll('input[type="checkbox"]')) box.checked = box.disabled;
      const idColumn = clean(els.tipIdColumn.value || latestState?.table?.idColumn || 'id');
      window.PhylogenyViewer.setTooltipColumns([idColumn]);
      setMessage('Tip hover was reduced to the identifier field.', 'success');
    });
    els.applyTipLabels.addEventListener('click', () => {
      try {
        const columns = hoverColumnSelection(els.tipIdColumn.value);
        if (latestState?.table && !latestState.table.empty && els.tipIdColumn.value !== latestState.table.idColumn) {
          window.PhylogenyViewer.setIdColumn(els.tipIdColumn.value);
        }
        window.PhylogenyViewer.setTipLabelTemplate(els.tipLabelTemplate.value);
        window.PhylogenyViewer.setTooltipColumns(columns);
        setMessage('Tip labels and hover fields were applied.', 'success');
      } catch (error) {
        setMessage(error.message || String(error), 'error');
      }
    });
  }

  function bindDownload() {
    els.downloadPhylogenyYaml.addEventListener('click', () => window.PhylogenyViewer.downloadCuration('phylogeny.yaml'));
  }

  async function init() {
    const ids = [
      'treeFileInput','annotationFileInput','curationFileInput','chooseTreeButton','chooseAnnotationButton','chooseCurationButton',
      'clearAnnotationButton','clearCurationButton','treeFileName','annotationFileName','curationFileName','loadLocalButton','loadExampleButton',
      'supportDisplay','supportColor','supportColorText','supportSize','supportSizeValue','supportNumberSize','supportNumberSizeValue',
      'supportThreshold','markSupportsAbove','clearMarkedSupports','selectedNodeSummary','groupName','groupColor','groupColorText',
      'groupShowLabel','addCladeGroup','cladeGroupList','tipIdColumn','tipLabelTemplate','hoverColumnOptions','selectAllHoverColumns','clearHoverColumns','applyTipLabels',
      'undoCuration','redoCuration','downloadPhylogenyYaml','authorMessage'
    ];
    for (const id of ids) els[id] = byId(id);
    bindFiles();
    bindSupports();
    bindGroups();
    bindLabels();
    bindDownload();
    bindHistory();
    document.addEventListener('phylogeny:statechange', event => { syncState(event.detail); recordHistorySnapshot(); });
    document.addEventListener('phylogeny:loaded', event => { syncState(event.detail); resetHistory(); });
    await window.PhylogenyViewer.init();
    syncState(window.PhylogenyViewer.getEditorState());
    updateSelectionFiles();
    resetHistory();
  }

  init().catch(error => setMessage(error.message || String(error), 'error'));
})();
