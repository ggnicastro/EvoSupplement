(function (global) {
  'use strict';

  const PAGE_SIZE = 50;
  const clean = value => String(value == null ? '' : value).trim();
  const normalized = value => clean(value).replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
  const number = value => value == null || !Number.isFinite(Number(value)) ? 'n/a' : Number(value).toLocaleString('en-US');
  const labelKey = entry => normalized(clean(entry.label) || entry.id);

  function normalizedColor(value) {
    const color = clean(value);
    if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(color)) return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`.toLowerCase();
    return color;
  }

  function element(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text != null) result.textContent = text;
    return result;
  }

  function pickerColor(color) {
    if (/^#[0-9a-f]{6}$/i.test(color)) return color;
    if (/^#[0-9a-f]{3}$/i.test(color)) return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
    return '#b8c0cc';
  }

  function init(adapter) {
    const host = document.getElementById('networkNodeCuration');
    if (!host) return { reload() {} };
    host.replaceChildren();

    const panel = element('details', 'network-node-curation');
    const summary = element('summary', '', 'Node editor');
    const summaryCount = element('span', 'nnc-summary-count');
    summary.append(summaryCount);
    panel.append(summary);
    const body = element('div', 'nnc-body');
    panel.append(body);
    host.append(panel);
    body.append(element('p', 'nnc-description', 'Include or exclude nodes, rename them, and choose colors. Matching display names merge into one node with all connections. A merged node remains included while any alias is included; search its display name and exclude matching to exclude all aliases. Changes take effect when you apply them.'));

    const toolbar = element('div', 'nnc-toolbar');
    const searchLabel = element('label', 'control-field nnc-search');
    searchLabel.append(element('span', '', 'Find original or display name'));
    const search = element('input');
    search.type = 'search';
    search.placeholder = 'Filter nodes…';
    search.autocomplete = 'off';
    searchLabel.append(search);
    toolbar.append(searchLabel);
    const sortLabel = element('label', 'control-field');
    sortLabel.append(element('span', '', 'Sort by'));
    const sort = element('select');
    [['blocks', 'Neighborhood frequency'], ['proteins', 'Protein frequency'], ['occurrences', 'Domain occurrences'], ['name', 'Original name'], ['label', 'Display name']].forEach(([value, text]) => {
      const option = element('option', '', text);
      option.value = value;
      sort.append(option);
    });
    sortLabel.append(sort);
    toolbar.append(sortLabel);
    body.append(toolbar);

    const bulk = element('div', 'nnc-bulk');
    const include = element('button', 'action-button', 'Include matching');
    const exclude = element('button', 'action-button', 'Exclude matching');
    const matchCount = element('span', 'nnc-count');
    include.type = exclude.type = 'button';
    bulk.append(include, exclude, matchCount);
    body.append(bulk);

    const tableWrap = element('div', 'nnc-table-wrap');
    const table = element('table', 'nnc-table');
    const caption = element('caption', 'nnc-visually-hidden', 'Node annotations and frequency in the loaded input');
    table.append(caption);
    const head = element('thead');
    const headers = element('tr');
    ['Include', 'Original name', 'Rename', 'Color', 'Neighborhoods', 'Proteins', 'Occurrences'].forEach(text => {
      const th = element('th', '', text);
      th.scope = 'col';
      headers.append(th);
    });
    head.append(headers);
    const tbody = element('tbody');
    table.append(head, tbody);
    tableWrap.append(table);
    body.append(tableWrap);

    const pager = element('div', 'nnc-pagination');
    const previous = element('button', 'action-button', 'Previous');
    const next = element('button', 'action-button', 'Next');
    previous.type = next.type = 'button';
    const pageText = element('span');
    pageText.setAttribute('aria-live', 'polite');
    pager.append(previous, pageText, next);
    body.append(pager);
    body.append(element('p', 'nnc-description', 'Frequencies describe the loaded input before relationship and edge-count filters. A merged node uses the union of its source observations; counts for individual names in this table may overlap. n/a means the input does not provide occurrence evidence.'));

    const actions = element('div', 'nnc-actions');
    const apply = element('button', 'action-button primary', 'Apply changes');
    const reset = element('button', 'action-button', 'Reset draft');
    const download = element('button', 'action-button', 'Download node YAML');
    apply.type = reset.type = download.type = 'button';
    const pending = element('span', 'nnc-pending');
    pending.setAttribute('aria-live', 'polite');
    actions.append(apply, reset, download, pending);
    body.append(actions);
    const message = element('p', 'nnc-message');
    message.setAttribute('role', 'status');
    body.append(message);

    let entries = [];
    let baseline = new Map();
    let page = 0;
    let busy = false;
    let dirty = new Set();
    let visibleRows = new Map();

    function messageText(text, error = false) {
      message.textContent = text;
      message.classList.toggle('is-error', error);
    }

    function filtered() {
      const query = normalized(search.value);
      return entries.filter(entry => !query || normalized(entry.id).includes(query) || normalized(entry.label).includes(query));
    }

    function mark(entry) {
      const original = baseline.get(entry.id);
      if (original && (clean(entry.label) || entry.id) === original.label && entry.color === original.color && entry.included === original.included) dirty.delete(entry.id);
      else dirty.add(entry.id);
    }

    function updateActions() {
      const matches = filtered().length;
      const includedCount = entries.filter(entry => entry.included).length;
      summaryCount.textContent = entries.length ? ` · ${number(entries.length)} names${dirty.size ? ` · ${number(dirty.size)} pending` : ''}` : ' · load data to begin';
      matchCount.textContent = `${number(matches)} matching of ${number(entries.length)} names · ${number(includedCount)} included`;
      pending.textContent = dirty.size ? `${number(dirty.size)} name${dirty.size === 1 ? '' : 's'} with unapplied changes` : 'All changes applied';
      apply.disabled = busy || !dirty.size;
      reset.disabled = busy || !dirty.size;
      download.disabled = busy || !entries.length;
      include.disabled = exclude.disabled = busy || !matches;
      include.textContent = `Include matching (${number(matches)})`;
      exclude.textContent = `Exclude matching (${number(matches)})`;
      search.disabled = sort.disabled = busy || !entries.length;
    }

    function syncColor(entry) {
      const row = visibleRows.get(entry.id);
      if (!row) return;
      row.picker.value = pickerColor(entry.color);
      row.picker.title = entry.color || 'Use the automatic color';
      row.colorText.textContent = entry.color || 'Auto';
      row.clear.disabled = busy || !entry.color;
    }

    function shareColor(entry, color) {
      const label = labelKey(entry);
      entries.forEach(peer => {
        if (labelKey(peer) !== label) return;
        peer.color = normalizedColor(color);
        mark(peer);
        syncColor(peer);
      });
    }

    function renderRows() {
      visibleRows = new Map();
      const matches = filtered();
      const mode = sort.value;
      matches.sort((a, b) => {
        if (['blocks', 'proteins', 'occurrences'].includes(mode)) return (b[mode] == null ? -1 : b[mode]) - (a[mode] == null ? -1 : a[mode]) || a.id.localeCompare(b.id);
        return clean(mode === 'label' ? a.label : a.id).localeCompare(clean(mode === 'label' ? b.label : b.id)) || a.id.localeCompare(b.id);
      });
      const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
      page = Math.max(0, Math.min(page, pageCount - 1));
      tbody.replaceChildren();
      matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).forEach(entry => {
        const tr = element('tr');
        const includeCell = element('td');
        const checkbox = element('input');
        checkbox.type = 'checkbox';
        checkbox.checked = entry.included;
        checkbox.disabled = busy;
        checkbox.setAttribute('aria-label', `Include ${entry.id}`);
        checkbox.addEventListener('change', () => {
          entry.included = checkbox.checked;
          mark(entry);
          messageText('');
          updateActions();
        });
        includeCell.append(checkbox);
        const original = element('td', 'nnc-original', entry.id);
        const renameCell = element('td');
        const rename = element('input', 'nnc-rename');
        rename.type = 'text';
        rename.value = entry.label;
        rename.placeholder = entry.id;
        rename.disabled = busy;
        rename.setAttribute('aria-label', `Rename ${entry.id}`);
        rename.addEventListener('input', () => {
          entry.label = rename.value;
          mark(entry);
          const peer = entries.find(other => other.id !== entry.id && labelKey(other) === labelKey(entry) && other.color);
          if (peer || entry.color) shareColor(entry, peer ? peer.color : entry.color);
          messageText('');
          updateActions();
        });
        renameCell.append(rename);
        const colorCell = element('td');
        const colorControls = element('div', 'nnc-color-controls');
        const picker = element('input');
        picker.type = 'color';
        picker.disabled = busy;
        picker.setAttribute('aria-label', `Color for ${entry.id} and matching display names`);
        picker.addEventListener('input', () => {
          shareColor(entry, picker.value);
          messageText('');
          updateActions();
        });
        const colorText = element('span', 'nnc-color-text');
        const clear = element('button', 'mini-button', 'Clear');
        clear.type = 'button';
        clear.setAttribute('aria-label', `Clear color for ${entry.id} and matching display names`);
        clear.addEventListener('click', () => {
          shareColor(entry, '');
          messageText('');
          updateActions();
        });
        colorControls.append(picker, colorText, clear);
        colorCell.append(colorControls);
        tr.append(includeCell, original, renameCell, colorCell);
        ['blocks', 'proteins', 'occurrences'].forEach(field => tr.append(element('td', 'nnc-number', number(entry[field]))));
        visibleRows.set(entry.id, { picker, colorText, clear });
        syncColor(entry);
        tbody.append(tr);
      });
      if (!matches.length) {
        const td = element('td', 'nnc-empty', entries.length ? 'No names match this search.' : 'Load a network or neighborhood input to edit nodes.');
        td.colSpan = 7;
        const tr = element('tr');
        tr.append(td);
        tbody.append(tr);
      }
      previous.disabled = busy || page === 0;
      next.disabled = busy || page >= pageCount - 1;
      pageText.textContent = matches.length ? `${number(page * PAGE_SIZE + 1)}–${number(Math.min(matches.length, (page + 1) * PAGE_SIZE))} of ${number(matches.length)} · Page ${page + 1} of ${pageCount}` : '0 names';
      updateActions();
    }

    function reload() {
      const source = adapter.getEntries() || [];
      entries = source.map(entry => ({ ...entry, id: String(entry.id), label: clean(entry.label) || String(entry.id), included: Boolean(entry.included), color: normalizedColor(entry.color) }));
      baseline = new Map(entries.map(entry => [entry.id, { ...entry }]));
      dirty = new Set();
      page = 0;
      messageText('');
      renderRows();
    }

    search.addEventListener('input', () => { page = 0; renderRows(); });
    sort.addEventListener('change', () => { page = 0; renderRows(); });
    previous.addEventListener('click', () => { page -= 1; renderRows(); });
    next.addEventListener('click', () => { page += 1; renderRows(); });
    function bulkInclude(value) {
      filtered().forEach(entry => { entry.included = value; mark(entry); });
      messageText('');
      renderRows();
    }
    include.addEventListener('click', () => bulkInclude(true));
    exclude.addEventListener('click', () => bulkInclude(false));
    reset.addEventListener('click', () => {
      reload();
      messageText('Draft reset to the applied node settings.');
    });
    apply.addEventListener('click', async () => {
      busy = true;
      messageText('Applying node changes…');
      renderRows();
      try {
        await adapter.apply(entries.map(entry => ({ ...entry, label: clean(entry.label) || entry.id })));
        busy = false;
        reload();
        messageText('Node changes applied. Matching display names now share one node.');
      } catch (error) {
        busy = false;
        const detail = error && error.message ? error.message : 'Could not apply these changes.';
        messageText(`${detail} Your draft has been kept; correct the problem and apply again.`, true);
        renderRows();
      }
    });
    download.addEventListener('click', () => {
      try {
        adapter.download();
        messageText(dirty.size ? 'Downloaded the applied settings. Pending edits are not included; apply them before downloading an updated YAML.' : 'Downloaded the applied node settings.');
      } catch (error) {
        messageText(error && error.message ? error.message : 'Could not download the node YAML.', true);
      }
    });

    reload();
    return { reload };
  }

  global.NetworkNodeCuration = { init };
})(window);
