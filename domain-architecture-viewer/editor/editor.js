(() => {
  'use strict';

  const api = window.DomainArchitectureViewer;
  const config = window.DOMAIN_ARCHITECTURE_CONFIG || {};
  const $ = id => document.getElementById(id);
  const files = { data: null, yaml: null };
  let currentDataText = '';
  let selectedDomain = '';
  let catalogSearch = '';

  const els = {
    dataInput: $('architectureEditorDataInput'),
    yamlInput: $('architectureEditorYamlInput'),
    dataName: $('architectureEditorDataName'),
    yamlName: $('architectureEditorYamlName'),
    load: $('architectureEditorLoad'),
    reload: $('architectureEditorReload'),
    clearYaml: $('architectureEditorClearYaml'),
    metric: $('architectureFrequencyMetric'),
    topCount: $('architectureTopCount'),
    customTopWrap: $('architectureCustomTopWrap'),
    customTop: $('architectureCustomTop'),
    preserve: $('architecturePreserveStyles'),
    suggest: $('architectureSuggestStyles'),
    domainSearch: $('architectureDomainSearch'),
    tableBody: $('architectureDomainTableBody'),
    editorEmpty: $('architectureDomainEditorEmpty'),
    editorForm: $('architectureDomainEditorForm'),
    selectedDomain: $('architectureSelectedDomain'),
    selectedProteins: $('architectureSelectedProteins'),
    selectedOccurrences: $('architectureSelectedOccurrences'),
    selectedResidues: $('architectureSelectedResidues'),
    styleName: $('architectureStyleName'),
    styleColor: $('architectureStyleColor'),
    styleColorText: $('architectureStyleColorText'),
    styleShape: $('architectureStyleShape'),
    styleVisible: $('architectureStyleVisible'),
    saveStyle: $('architectureSaveStyle'),
    resetStyle: $('architectureResetStyle'),
    exportYaml: $('architectureExportYaml'),
    exportPackage: $('architectureExportPackage')
  };

  function readFileText(file) {
    return file ? file.text() : Promise.resolve('');
  }

  function updateFileUi() {
    els.dataName.textContent = files.data?.name || 'No file selected';
    els.yamlName.textContent = files.yaml?.name || 'Optional';
    els.load.disabled = !files.data;
    els.clearYaml.hidden = !files.yaml;
  }

  async function loadFiles() {
    if (!files.data) return;
    els.load.disabled = true;
    try {
      currentDataText = await readFileText(files.data);
      const yamlText = await readFileText(files.yaml);
      await api.load({ tsvText: currentDataText, tsvName: files.data.name, yamlText, yamlName: files.yaml?.name || '' });
    } finally {
      els.load.disabled = false;
    }
  }

  async function reloadBundled() {
    const [dataResponse, yamlResponse] = await Promise.all([
      fetch(config.dataUrl, { cache: 'no-store' }),
      config.yamlUrl ? fetch(config.yamlUrl, { cache: 'no-store' }) : Promise.resolve(null)
    ]);
    if (!dataResponse.ok) throw new Error(`Could not load ${config.dataUrl}.`);
    currentDataText = await dataResponse.text();
    const yamlText = yamlResponse && yamlResponse.ok ? await yamlResponse.text() : '';
    files.data = null;
    files.yaml = null;
    updateFileUi();
    await api.load({ tsvText: currentDataText, tsvName: config.dataUrl, yamlText, yamlName: config.yamlUrl || '' });
  }

  function metricValue(stats) {
    if (els.metric.value === 'occurrences') return stats.occurrences;
    if (els.metric.value === 'residues') return stats.residues;
    return stats.proteins;
  }

  function catalogRows() {
    const query = catalogSearch.trim().toLowerCase();
    return api.getDomainStats().filter(stats => !query || stats.id.toLowerCase().includes(query) || stats.style.display_name.toLowerCase().includes(query))
      .sort((a, b) => metricValue(b) - metricValue(a) || a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));
  }

  function shapeLabel(shape) {
    return ({ rounded: 'Rounded', rectangle: 'Rectangle', capsule: 'Capsule', ellipse: 'Ellipse', hexagon: 'Hexagon', chevron: 'Chevron', arrow: 'Arrow', diamond: 'Diamond', tm: 'TM', signal: 'Signal', lipo: 'LIPO' })[shape] || shape;
  }

  function renderCatalog() {
    const rows = catalogRows();
    els.tableBody.innerHTML = rows.map(stats => {
      const style = stats.style;
      const selected = stats.id === selectedDomain ? ' is-selected' : '';
      return `<tr class="${selected.trim()}" data-domain="${escapeHtml(stats.id)}">
        <td><strong>${escapeHtml(stats.id)}</strong>${stats.special ? ` <span class="special-badge">${escapeHtml(stats.special)}</span>` : ''}${style.display_name !== stats.id ? `<br><small>${escapeHtml(style.display_name)}</small>` : ''}</td>
        <td class="numeric">${stats.proteins.toLocaleString()}</td>
        <td class="numeric">${stats.occurrences.toLocaleString()}</td>
        <td class="numeric">${stats.residues.toLocaleString()}</td>
        <td><span class="style-chip" style="--chip:${escapeHtml(style.color)}"><i></i><span>${escapeHtml(shapeLabel(style.shape))}</span></span></td>
      </tr>`;
    }).join('');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function selectDomain(domain) {
    selectedDomain = domain || '';
    const stats = selectedDomain ? api.domainStats(selectedDomain) : null;
    if (!stats || stats.special) {
      els.editorEmpty.hidden = false;
      els.editorForm.hidden = true;
      if (stats?.special) els.editorEmpty.textContent = `${selectedDomain} is a fixed special feature. Its color and shape are intentionally consistent across EvoSupplement figures.`;
      else els.editorEmpty.textContent = 'Select an ordinary domain to edit its publication style. Special features retain the fixed EvoSupplement conventions.';
    } else {
      els.editorEmpty.hidden = true;
      els.editorForm.hidden = false;
      els.selectedDomain.textContent = stats.id;
      els.selectedProteins.textContent = stats.proteins.toLocaleString();
      els.selectedOccurrences.textContent = stats.occurrences.toLocaleString();
      els.selectedResidues.textContent = stats.residues.toLocaleString();
      els.styleName.value = stats.style.display_name || stats.id;
      els.styleColor.value = stats.style.color;
      els.styleColorText.value = stats.style.color;
      els.styleShape.value = stats.style.shape;
      els.styleVisible.checked = stats.style.visible !== false;
    }
    renderCatalog();
  }

  function saveStyle() {
    if (!selectedDomain) return;
    const color = /^#[0-9a-f]{6}$/i.test(els.styleColorText.value.trim()) ? els.styleColorText.value.trim() : els.styleColor.value;
    api.setDomainStyle(selectedDomain, {
      display_name: els.styleName.value.trim() || selectedDomain,
      color,
      shape: els.styleShape.value,
      visible: els.styleVisible.checked
    });
    selectDomain(selectedDomain);
  }

  function resetStyle() {
    if (!selectedDomain) return;
    api.resetDomainStyle(selectedDomain);
    selectDomain(selectedDomain);
  }

  function topCount() {
    return els.topCount.value === 'custom' ? Math.max(1, Number(els.customTop.value) || 1) : Number(els.topCount.value);
  }

  function suggestStyles() {
    api.suggestStyles(topCount(), els.metric.value, els.preserve.checked);
    renderCatalog();
    if (selectedDomain) selectDomain(selectedDomain);
  }

  function downloadYaml() {
    api.downloadBlob('domain-architecture.yaml', api.serializeYaml(), 'text/yaml;charset=utf-8');
  }

  async function downloadPackage() {
    if (!window.JSZip) throw new Error('JSZip is not available.');
    if (!currentDataText) {
      const response = await fetch(config.dataUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not read the current domain TSV.');
      currentDataText = await response.text();
    }
    const zip = new JSZip();
    zip.file('domain.tsv', currentDataText);
    zip.file('domain-architecture.yaml', api.serializeYaml());
    zip.file('README.txt', `EvoSupplement Protein Domain Architecture publication package\n\nFiles:\n- domain.tsv: one row per domain or special feature\n- domain-architecture.yaml: colors, shapes, layout, labels, sorting, grouping, and hover fields\n\nRequired TSV columns: pid, domain, start, end, plen\nSpecial fixed features: SIG, TM, LIPO\nGenerated: ${new Date().toISOString()}\n`);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    api.downloadBlob('domain-architecture-publication-package.zip', blob, 'application/zip');
  }

  function bind() {
    els.dataInput.addEventListener('change', () => { files.data = els.dataInput.files?.[0] || null; updateFileUi(); });
    els.yamlInput.addEventListener('change', () => { files.yaml = els.yamlInput.files?.[0] || null; updateFileUi(); });
    els.load.addEventListener('click', () => loadFiles().catch(error => alert(error.message)));
    els.reload.addEventListener('click', () => reloadBundled().catch(error => alert(error.message)));
    els.clearYaml.addEventListener('click', () => { files.yaml = null; els.yamlInput.value = ''; updateFileUi(); });
    els.topCount.addEventListener('change', () => { els.customTopWrap.hidden = els.topCount.value !== 'custom'; });
    els.suggest.addEventListener('click', suggestStyles);
    els.domainSearch.addEventListener('input', () => { catalogSearch = els.domainSearch.value; renderCatalog(); });
    els.tableBody.addEventListener('click', event => { const row = event.target.closest('tr[data-domain]'); if (row) selectDomain(row.dataset.domain); });
    els.styleColor.addEventListener('input', () => { els.styleColorText.value = els.styleColor.value; });
    els.styleColorText.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(els.styleColorText.value.trim())) els.styleColor.value = els.styleColorText.value.trim(); });
    els.saveStyle.addEventListener('click', saveStyle);
    els.resetStyle.addEventListener('click', resetStyle);
    els.exportYaml.addEventListener('click', downloadYaml);
    els.exportPackage.addEventListener('click', () => downloadPackage().catch(error => alert(error.message)));

    document.addEventListener('domain-architecture:ready', event => {
      const snapshot = event.detail;
      if (!currentDataText && config.dataUrl) fetch(config.dataUrl, { cache: 'no-store' }).then(response => response.ok ? response.text() : '').then(text => { if (text) currentDataText = text; });
      renderCatalog();
      selectDomain('');
      if (snapshot.warnings?.length) console.warn('[Domain Architecture Editor]', ...snapshot.warnings);
    });
    document.addEventListener('domain-architecture:domain-selected', event => selectDomain(event.detail.domain));
    document.addEventListener('domain-architecture:style-changed', renderCatalog);
    document.addEventListener('domain-architecture:styles-suggested', renderCatalog);
  }

  bind();
  updateFileUi();
  api.init();
})();
