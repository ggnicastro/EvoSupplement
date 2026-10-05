(() => {
  'use strict';

  const VERSION = 1;
  const host = document.getElementById('panelConfigHost');
  const summary = document.getElementById('editorSummary');
  const startSynchronized = document.getElementById('startSynchronized');
  const downloadDefinition = document.getElementById('downloadDefinition');
  const downloadPackage = document.getElementById('downloadPackage');
  let unsubscribe = null;
  let renderQueued = false;
  let bound = false;

  function api() { return window.MultiStructureViewer; }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function sourceName(source, fallback = 'Not selected') {
    if (!source) return fallback;
    if (source.name) return source.name;
    if (source.file?.name) return source.file.name;
    try { return decodeURIComponent(new URL(source.url, document.baseURI).pathname.split('/').pop()) || fallback; }
    catch { return fallback; }
  }

  function focusedLayoutOptions(selected) {
    return [
      ['canvas', '3D only'],
      ['sequence', 'Sequence + 3D'],
      ['controls', 'Controls + 3D'],
      ['sequence-controls', 'Sequence + controls'],
      ['full', 'Full Mol* interface']
    ].map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
  }

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
  }

  function render() {
    const viewer = api();
    if (!viewer || !host) return;
    const panels = viewer.getEditorPanels();
    host.innerHTML = panels.map(panel => {
      const molx = sourceName(panel.source);
      const structure = sourceName(panel.structureSource, 'Optional');
      return `<article class="panel-config-row" data-panel-index="${panel.index}">
        <div class="panel-config-number">${panel.index + 1}</div>
        <label class="panel-config-field panel-config-label"><span>Panel label</span><input type="text" data-role="label" value="${escapeHtml(panel.label)}"></label>
        <label class="panel-config-field"><span>Focused layout</span><select data-role="focused-layout">${focusedLayoutOptions(panel.focusedLayout)}</select></label>
        <div class="panel-config-field file-config-field"><span>MOLX snapshot</span><label class="mini-file-button">Choose MOLX<input type="file" data-role="molx" accept=".molx" hidden></label><small title="${escapeHtml(molx)}">${escapeHtml(molx)}</small></div>
        <div class="panel-config-field file-config-field"><span>Structure download</span><label class="mini-file-button">Choose PDB/mmCIF<input type="file" data-role="structure" accept=".pdb,.ent,.cif,.mmcif" hidden></label><small title="${escapeHtml(structure)}">${escapeHtml(structure)}</small><button class="text-button" type="button" data-role="clear-structure" ${panel.structureSource ? '' : 'disabled'}>Clear</button></div>
      </article>`;
    }).join('');

    const loaded = panels.filter(panel => panel.source).length;
    const structures = panels.filter(panel => panel.structureSource).length;
    const warning = panels.length > 12 ? ' Large panel counts can require substantial GPU memory.' : '';
    summary.textContent = `${loaded} of ${panels.length} MOLX snapshots configured; ${structures} optional structure downloads.${warning}`;
  }

  function safeBaseName(name, fallback) {
    const raw = String(name || fallback).replace(/\\/g, '/').split('/').pop();
    const dot = raw.lastIndexOf('.');
    const base = dot > 0 ? raw.slice(0, dot) : raw;
    return base.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || fallback;
  }

  function extension(name, fallback) {
    const match = String(name || '').toLowerCase().match(/\.[a-z0-9]+$/);
    return match ? match[0] : fallback;
  }

  function makeDefinition(paths = null) {
    const viewer = api();
    const state = viewer.getState();
    const panels = viewer.getEditorPanels();
    return {
      version: VERSION,
      title: 'Multi-Structure Comparison Viewer',
      panelCount: panels.length,
      layoutColumns: state.layoutColumns,
      syncOnLoad: Boolean(startSynchronized?.checked),
      focusedLayout: 'sequence-controls',
      panels: panels.map((panel, index) => ({
        id: panel.id || `panel-${index + 1}`,
        label: panel.label || `Panel ${index + 1}`,
        molx: paths?.[index]?.molx || sourceName(panel.source, ''),
        structure: paths?.[index]?.structure || '',
        focusedLayout: panel.focusedLayout || 'sequence-controls'
      }))
    };
  }

  function triggerDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1800);
  }

  async function sourceBlob(source, label) {
    if (!source) throw new Error(`${label} is missing.`);
    if (source.kind === 'file' && source.file) return source.file;
    if (source.kind === 'url' && source.url) {
      const response = await fetch(source.url);
      if (!response.ok) throw new Error(`Could not fetch ${label} (${response.status}).`);
      return response.blob();
    }
    throw new Error(`${label} is unavailable.`);
  }

  async function buildPackage() {
    if (typeof JSZip === 'undefined') throw new Error('JSZip did not load.');
    const viewer = api();
    const panels = viewer.getEditorPanels();
    const missing = panels.filter(panel => !panel.source);
    if (missing.length) throw new Error(`Choose a MOLX snapshot for every panel before packaging (${missing.length} missing).`);

    downloadPackage.disabled = true;
    const originalText = downloadPackage.textContent;
    downloadPackage.textContent = 'Building package…';
    try {
      const zip = new JSZip();
      const paths = [];
      for (let index = 0; index < panels.length; index += 1) {
        const panel = panels[index];
        const prefix = String(index + 1).padStart(2, '0');
        const molxName = `${prefix}-${safeBaseName(sourceName(panel.source), `panel-${prefix}`)}${extension(sourceName(panel.source), '.molx') === '.molx' ? '.molx' : '.molx'}`;
        const molxPath = `molx/${molxName}`;
        zip.file(molxPath, await sourceBlob(panel.source, `MOLX for panel ${index + 1}`));
        let structurePath = '';
        if (panel.structureSource) {
          const sourceFileName = sourceName(panel.structureSource, `structure-${prefix}.pdb`);
          const structureName = `${prefix}-${safeBaseName(sourceFileName, `structure-${prefix}`)}${extension(sourceFileName, '.pdb')}`;
          structurePath = `structures/${structureName}`;
          zip.file(structurePath, await sourceBlob(panel.structureSource, `structure for panel ${index + 1}`));
        }
        paths.push({ molx: molxPath, structure: structurePath });
        downloadPackage.textContent = `Packaging ${index + 1}/${panels.length}…`;
      }

      const definition = makeDefinition(paths);
      zip.file('multi-structure.json', JSON.stringify(definition, null, 2));
      zip.file('README.txt', [
        'EvoSupplement Multi-Structure Comparison publication package',
        '',
        'Use this ZIP as the input for the Multi-Structure Comparison Viewer item in EvoSupplement Project Builder.',
        'The JSON file fixes panel order, labels, focused layouts, grid columns, and the initial synchronization state.',
        'MOLX files preserve the Mol* scene, including representations, components, colors, and camera state.',
        ''
      ].join('\n'));
      try {
        const response = await fetch('../MVT-LICENSE.txt');
        if (response.ok) zip.file('MVT-LICENSE.txt', await response.text());
      } catch (error) { console.debug(error); }

      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      triggerDownload(blob, 'multi-structure-publication.zip');
    } finally {
      downloadPackage.disabled = false;
      downloadPackage.textContent = originalText;
    }
  }

  function bind() {
    const viewer = api();
    if (!viewer || bound) return;
    bound = true;
    unsubscribe?.();
    unsubscribe = viewer.onStateChange(({ reason }) => {
      if (!['panel-label', 'focused-layout', 'layout', 'camera-sync'].includes(reason)) scheduleRender();
    });
    render();

    host.addEventListener('input', event => {
      const row = event.target.closest('[data-panel-index]');
      if (!row) return;
      const index = Number(row.dataset.panelIndex);
      if (event.target.dataset.role === 'label') viewer.setPanelLabel(index, event.target.value);
    });
    host.addEventListener('change', event => {
      const row = event.target.closest('[data-panel-index]');
      if (!row) return;
      const index = Number(row.dataset.panelIndex);
      const role = event.target.dataset.role;
      if (role === 'focused-layout') viewer.setFocusedLayout(index, event.target.value, { announce: false });
      if (role === 'molx') {
        const file = event.target.files?.[0];
        if (file) viewer.loadFileIntoPanel(index, file);
      }
      if (role === 'structure') {
        const file = event.target.files?.[0];
        if (file) viewer.setPanelStructureFile(index, file);
      }
    });
    host.addEventListener('click', event => {
      const button = event.target.closest('[data-role="clear-structure"]');
      if (!button) return;
      const row = button.closest('[data-panel-index]');
      viewer.setPanelStructureFile(Number(row.dataset.panelIndex), null);
    });

    downloadDefinition.addEventListener('click', () => {
      const definition = makeDefinition();
      triggerDownload(new Blob([JSON.stringify(definition, null, 2)], { type: 'application/json' }), 'multi-structure.json');
    });
    downloadPackage.addEventListener('click', () => {
      buildPackage().catch(error => {
        console.error(error);
        window.alert(error.message || 'Could not build the publication package.');
      });
    });
  }

  window.addEventListener('evosupplement:multi-structure-ready', bind, { once: true });
  if (api()) bind();
})();
