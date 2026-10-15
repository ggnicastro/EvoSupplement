(() => {
  'use strict';

  const api = window.DomainArchitectureViewer;
  const config = window.DOMAIN_ARCHITECTURE_CONFIG || {};
  const $ = id => document.getElementById(id);
  const files = { data: null, yaml: null, color: null, shape: null };
  let currentDataText = '';
  let selectedDomain = '';
  let catalogSearch = '';

  const els = {
    dataInput: $('architectureEditorDataInput'),
    yamlInput: $('architectureEditorYamlInput'),
    colorInput: $('architectureEditorColorInput'),
    shapeInput: $('architectureEditorShapeInput'),
    dataName: $('architectureEditorDataName'),
    yamlName: $('architectureEditorYamlName'),
    colorName: $('architectureEditorColorName'),
    shapeName: $('architectureEditorShapeName'),
    load: $('architectureEditorLoad'),
    reload: $('architectureEditorReload'),
    clearYaml: $('architectureEditorClearYaml'),
    clearColor: $('architectureEditorClearColor'),
    clearShape: $('architectureEditorClearShape'),
    applyDictionaries: $('architectureApplyDictionaries'),
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
    exportColor: $('architectureExportColor'),
    exportShape: $('architectureExportShape'),
    exportPackage: $('architectureExportPackage')
  };

  function readFileText(file) {
    return file ? file.text() : Promise.resolve('');
  }

  function updateFileUi() {
    els.dataName.textContent = files.data?.name || 'No file selected';
    els.yamlName.textContent = files.yaml?.name || 'Optional';
    els.colorName.textContent = files.color?.name || 'Optional';
    els.shapeName.textContent = files.shape?.name || 'Optional';
    els.clearColor.hidden = !files.color;
    els.clearShape.hidden = !files.shape;
    els.applyDictionaries.disabled = !api.getSnapshot().proteinCount || !(files.color || files.shape);
    els.load.disabled = !files.data;
    els.clearYaml.hidden = !files.yaml;
  }

  async function loadFiles() {
    if (!files.data) return;
    els.load.disabled = true;
    try {
      const nextDataText = await readFileText(files.data);
      const [yamlText, colorText, shapeText] = await Promise.all([readFileText(files.yaml), readFileText(files.color), readFileText(files.shape)]);
      await api.load({ tsvText: nextDataText, tsvName: files.data.name, yamlText, yamlName: files.yaml?.name || '', colorText, colorName: files.color?.name || '', shapeText, shapeName: files.shape?.name || '' });
      currentDataText = nextDataText;
    } finally {
      els.load.disabled = false;
    }
  }

  async function reloadBundled() {
    const [dataResponse, yamlResponse, colorResponse, shapeResponse] = await Promise.all([
      fetch(config.dataUrl, { cache: 'no-store' }),
      config.yamlUrl ? fetch(config.yamlUrl, { cache: 'no-store' }) : Promise.resolve(null),
      config.colorUrl ? fetch(config.colorUrl, { cache: 'no-store' }) : Promise.resolve(null),
      config.shapeUrl ? fetch(config.shapeUrl, { cache: 'no-store' }) : Promise.resolve(null)
    ]);
    if (!dataResponse.ok) throw new Error(`Could not load ${config.dataUrl}.`);
    const nextDataText = await dataResponse.text();
    const yamlText = yamlResponse && yamlResponse.ok ? await yamlResponse.text() : '';
    const colorText = colorResponse && colorResponse.ok ? await colorResponse.text() : '';
    const shapeText = shapeResponse && shapeResponse.ok ? await shapeResponse.text() : '';
    await api.load({ tsvText: nextDataText, tsvName: config.dataUrl, yamlText, yamlName: config.yamlUrl || '', colorText, colorName: config.colorUrl || '', shapeText, shapeName: config.shapeUrl || '' });
    currentDataText = nextDataText;
    for (const role of Object.keys(files)) { files[role] = null; els[`${role}Input`].value = ''; }
    updateFileUi();
  }

  async function applyDictionaries() {
    const payload = {};
    for (const role of ['color', 'shape']) {
      if (!files[role]) continue;
      payload[`${role}Text`] = await readFileText(files[role]);
      payload[`${role}Name`] = files[role].name;
    }
    api.applyStyleDictionaries(payload);
    if (selectedDomain) selectDomain(selectedDomain);
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
    zip.file('color_dic.yaml', api.serializeColorYaml());
    zip.file('shape_dic.yaml', api.serializeShapeYaml());
    zip.file('README.txt', `EvoSupplement Protein Domain Architecture publication package\n\nFiles:\n- domain.tsv: one row per domain or special feature\n- domain-architecture.yaml: colors, shapes, layout, labels, sorting, grouping, and hover fields\n- color_dic.yaml: colors keyed by final display name\n- shape_dic.yaml: shapes keyed by final display name\n\nRequired TSV columns: pid, domain, start, end, plen\nSpecial fixed features: SIG, TM, LIPO\nGenerated: ${new Date().toISOString()}\n`);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    api.downloadBlob('domain-architecture-publication-package.zip', blob, 'application/zip');
  }

  function bind() {
    els.dataInput.addEventListener('change', () => { files.data = els.dataInput.files?.[0] || null; updateFileUi(); });
    els.yamlInput.addEventListener('change', () => { if (els.yamlInput.files?.[0]) files.yaml = els.yamlInput.files[0]; updateFileUi(); });
    for (const role of ['color', 'shape']) {
      els[`${role}Input`].addEventListener('change', () => { if (els[`${role}Input`].files?.[0]) files[role] = els[`${role}Input`].files[0]; updateFileUi(); });
      els[`clear${role[0].toUpperCase()}${role.slice(1)}`].addEventListener('click', () => { files[role] = null; els[`${role}Input`].value = ''; updateFileUi(); });
    }
    els.applyDictionaries.addEventListener('click', () => applyDictionaries().catch(error => alert(error.message)));
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
    els.exportColor.addEventListener('click', () => { try { api.downloadBlob('color_dic.yaml', api.serializeColorYaml(), 'text/yaml;charset=utf-8'); } catch (error) { alert(error.message); } });
    els.exportShape.addEventListener('click', () => { try { api.downloadBlob('shape_dic.yaml', api.serializeShapeYaml(), 'text/yaml;charset=utf-8'); } catch (error) { alert(error.message); } });
    els.exportPackage.addEventListener('click', () => downloadPackage().catch(error => alert(error.message)));

    document.addEventListener('domain-architecture:ready', event => {
      const snapshot = event.detail;
      if (!currentDataText && !files.data && config.dataUrl) fetch(config.dataUrl, { cache: 'no-store' }).then(response => response.ok ? response.text() : '').then(text => { if (text) currentDataText = text; });
      updateFileUi();
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
