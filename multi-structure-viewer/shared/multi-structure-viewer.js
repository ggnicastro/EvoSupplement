(() => {
  'use strict';

  const MIN_PANEL_COUNT = 1;
  const MAX_PANEL_COUNT = 64;
  const DEFAULT_PANEL_COUNT = 4;
  const LOAD_CONCURRENCY = 2;
  const DEFAULT_FOCUSED_LAYOUT = 'sequence';
  const VIEWER_VERSION = '1.0.0';

  const FOCUSED_LAYOUTS = Object.freeze({
    canvas: Object.freeze({
      label: '3D only',
      showControls: false,
      regionState: Object.freeze({ left: 'hidden', top: 'hidden', right: 'hidden', bottom: 'hidden' })
    }),
    sequence: Object.freeze({
      label: 'Sequence + 3D',
      showControls: true,
      regionState: Object.freeze({ left: 'hidden', top: 'full', right: 'hidden', bottom: 'hidden' })
    }),
    controls: Object.freeze({
      label: 'Controls + 3D',
      showControls: true,
      regionState: Object.freeze({ left: 'hidden', top: 'hidden', right: 'full', bottom: 'hidden' })
    }),
    'sequence-controls': Object.freeze({
      label: 'Sequence + controls',
      showControls: true,
      regionState: Object.freeze({ left: 'hidden', top: 'full', right: 'full', bottom: 'hidden' })
    }),
    full: Object.freeze({
      label: 'Full Mol* interface',
      showControls: true,
      regionState: Object.freeze({ left: 'full', top: 'full', right: 'full', bottom: 'full' })
    })
  });

  const RECOMMENDED_COLUMNS = Object.freeze({
    1: 1, 2: 2, 3: 3, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4,
    9: 3, 10: 5, 11: 4, 12: 4, 13: 5, 14: 5, 15: 5, 16: 4,
    17: 5, 18: 6, 19: 5, 20: 5, 21: 6, 22: 6, 23: 6, 24: 6
  });

  const ICONS = {
    folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H2v16h20V6H12l-2-2Zm10 14H4V8h16v10Z"/></svg>',
    reload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h8V3l-3.35 3.35Z"/></svg>',
    clear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V7H6v12Zm3.46-7.12 1.42-1.42L12 11.59l1.12-1.13 1.42 1.42L13.41 13l1.13 1.12-1.42 1.42L12 14.41l-1.12 1.13-1.42-1.42L10.59 13l-1.13-1.12ZM15.5 4l-1-1h-5l-1 1H5v2h14V4h-3.5Z"/></svg>',
    expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14H5v5h5v-2H7v-3Zm-2-4h2V7h3V5H5v5Zm12 7h-3v2h5v-5h-2v3ZM14 5v2h3v3h2V5h-5Z"/></svg>',
    collapse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 16h3v3h2v-5H5v2Zm3-8H5v2h5V5H8v3Zm6 11h2v-3h3v-2h-5v5Zm2-11V5h-2v5h5V8h-3Z"/></svg>',
    upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 13v6H5v-6H3v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6h-2ZM13 5.83l2.59 2.58L17 7l-5-5-5 5 1.41 1.41L11 5.83V16h2V5.83Z"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7ZM5 18v2h14v-2H5Z"/></svg>'
  };

  const viewerOptions = {
    layoutIsExpanded: false,
    layoutShowControls: false,
    layoutShowRemoteState: false,
    volumeStreamingDisabled: Boolean(window.EVOSUPPLEMENT_PORTABLE),
    // Keep these UI regions available, but hidden in the compact grid.
    // Focused mode reveals them without recreating or reloading the viewer.
    layoutShowSequence: true,
    layoutShowLog: true,
    layoutShowLeftPanel: true,
    layoutControlsDisplay: 'reactive',
    collapseLeftPanel: true,
    collapseRightPanel: true,
    viewportShowReset: true,
    viewportShowScreenshotControls: true,
    viewportShowControls: true,
    viewportShowExpand: false,
    viewportShowToggleFullscreen: false,
    viewportShowSettings: true,
    viewportShowSelectionMode: true,
    viewportShowAnimation: true,
    viewportShowTrajectoryControls: true,
    viewportBackgroundColor: '#ffffff',
    powerPreference: 'high-performance',
    illumination: false
  };

  const elements = {
    grid: document.getElementById('viewerGrid'),
    panelCountSelect: document.getElementById('panelCountInput'),
    panelCountApply: document.getElementById('panelCountApply'),
    layoutSelect: document.getElementById('layoutSelect'),
    syncToggle: document.getElementById('syncCameras'),
    syncStatus: document.getElementById('syncStatus'),
    bulkButton: document.getElementById('bulkFileButton'),
    bulkButtonLabel: document.getElementById('bulkFileButtonLabel'),
    bulkInput: document.getElementById('bulkFileInput'),
    panelInput: document.getElementById('panelFileInput'),
    hostedButton: document.getElementById('loadHostedButton'),
    clearAllButton: document.getElementById('clearAllButton'),
    toast: document.getElementById('toast'),
    brandTitle: document.getElementById('brandTitle'),
    pageSubtitle: document.getElementById('pageSubtitle'),
    panelCountHelp: document.getElementById('panelCountHelp'),
    helperText: document.getElementById('helperText'),
    footerPanelCount: document.getElementById('footerPanelCount')
  };

  let config = normalizeConfig(window.MULTI_STRUCTURE_VIEWER_CONFIG || window.MOLX_DASHBOARD_CONFIG || {});
  let directView = null;
  const panels = [];
  const stateListeners = new Set();

  let panelCount = config.panelCount;
  let layoutColumns = recommendedColumns(panelCount);
  let selectedPanelIndex = null;
  let gridDragDepth = 0;
  let toastTimer = null;
  let bulkLoadGeneration = 0;
  let fallbackFocusedPanelIndex = null;
  let syncEnabled = Boolean(config.syncOnLoad);
  let syncDriverIndex = 0;
  let syncGuard = false;
  let syncBaselines = new Map();

  function emitStateChange(reason = 'update') {
    const detail = { reason, panelCount, layoutColumns, syncEnabled };
    stateListeners.forEach(listener => {
      try { listener(detail); } catch (error) { console.error(error); }
    });
    window.dispatchEvent(new CustomEvent('evosupplement:multi-structure-change', { detail }));
  }

  function normalizeFocusedLayout(value, fallback = DEFAULT_FOCUSED_LAYOUT) {
    const normalized = String(value || '').trim().toLowerCase();
    const aliases = {
      '3d': 'canvas',
      viewer: 'canvas',
      structure: 'canvas',
      'sequence-3d': 'sequence',
      'sequence+3d': 'sequence',
      'controls-3d': 'controls',
      'controls+3d': 'controls',
      'sequence+controls': 'sequence-controls',
      interface: 'full'
    };
    const candidate = aliases[normalized] || normalized;
    return Object.prototype.hasOwnProperty.call(FOCUSED_LAYOUTS, candidate)
      ? candidate
      : fallback;
  }

  function normalizeEntryId(value, fallback = '') {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized || fallback;
  }

  function readDirectView(configObject) {
    const params = new URLSearchParams(window.location.search);
    const requestedId = normalizeEntryId(params.get('structure'));

    if (!requestedId) return null;

    const entryIndex = configObject.files.findIndex(entry =>
      normalizeEntryId(entry.id) === requestedId
    );

    if (entryIndex < 0) {
      return {
        found: false,
        id: requestedId
      };
    }

    const entry = configObject.files[entryIndex];
    const layout = normalizeFocusedLayout(
      params.get('layout'),
      entry.focusedLayout || configObject.focusedLayout
    );

    return {
      found: true,
      id: requestedId,
      entryIndex,
      layout
    };
  }

  function clampPanelCount(value, fallback = DEFAULT_PANEL_COUNT) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(config?.maxPanels || MAX_PANEL_COUNT, Math.max(MIN_PANEL_COUNT, parsed));
  }

  function normalizeConfig(raw) {
    const maxPanels = Math.min(64, Math.max(1, Number.parseInt(raw.maxPanels, 10) || MAX_PANEL_COUNT));
    const rawFiles = Array.isArray(raw.files) ? raw.files : (Array.isArray(raw.panels) ? raw.panels : []);
    const inferredCount = raw.panelCount ?? raw.defaultPanelCount ?? (rawFiles.length || DEFAULT_PANEL_COUNT);
    const normalizedPanelCount = Math.min(maxPanels, Math.max(1, Number.parseInt(inferredCount, 10) || DEFAULT_PANEL_COUNT));
    const defaultFocusedLayout = normalizeFocusedLayout(raw.focusedLayout);
    const configuredColumns = Math.max(1, Number.parseInt(raw.layoutColumns, 10) || recommendedColumns(normalizedPanelCount));

    const files = Array.from({ length: maxPanels }, (_, index) => {
      const entry = rawFiles[index];
      if (typeof entry === 'string') {
        return {
          id: `panel-${index + 1}`,
          label: `Panel ${index + 1}`,
          molxUrl: entry.trim(),
          structureUrl: '',
          focusedLayout: defaultFocusedLayout
        };
      }

      const rawLabel = String(entry?.label || entry?.title || `Panel ${index + 1}`).trim();
      return {
        id: normalizeEntryId(entry?.id, `panel-${index + 1}`),
        label: rawLabel || `Panel ${index + 1}`,
        molxUrl: String(entry?.molxUrl || entry?.molx || entry?.url || '').trim(),
        structureUrl: String(entry?.structureUrl || entry?.structure || entry?.pdbUrl || entry?.pdb || '').trim(),
        focusedLayout: normalizeFocusedLayout(entry?.focusedLayout, defaultFocusedLayout)
      };
    });

    return {
      title: String(raw.title || (raw.editorMode ? 'Multi-Structure Comparison Editor' : 'Multi-Structure Comparison Viewer')).trim(),
      subtitle: String(raw.subtitle || '').trim(),
      editorMode: Boolean(raw.editorMode),
      panelCount: normalizedPanelCount,
      maxPanels,
      layoutColumns: Math.min(normalizedPanelCount, configuredColumns),
      focusedLayout: defaultFocusedLayout,
      autoLoad: Boolean(raw.autoLoad),
      syncOnLoad: Boolean(raw.syncOnLoad),
      showDownloads: raw.showDownloads !== false,
      definitionUrl: String(raw.definitionUrl || '').trim(),
      files
    };
  }

  async function resolveDefinition(baseConfig) {
    if (!baseConfig.definitionUrl) return baseConfig;
    const definitionUrl = new URL(baseConfig.definitionUrl, document.baseURI);
    const response = await fetch(definitionUrl.href, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load the multi-structure definition (${response.status}).`);
    const definition = await response.json();
    const rawPanels = Array.isArray(definition.panels) ? definition.panels : (Array.isArray(definition.files) ? definition.files : []);
    const files = rawPanels.map((entry, index) => ({
      id: entry.id || `panel-${index + 1}`,
      label: entry.label || entry.title || `Panel ${index + 1}`,
      molxUrl: entry.molxUrl || entry.molx ? new URL(entry.molxUrl || entry.molx, definitionUrl).href : '',
      structureUrl: entry.structureUrl || entry.structure ? new URL(entry.structureUrl || entry.structure, definitionUrl).href : '',
      focusedLayout: entry.focusedLayout || definition.focusedLayout || baseConfig.focusedLayout
    }));
    return normalizeConfig({
      ...baseConfig,
      ...definition,
      title: baseConfig.title || definition.title,
      editorMode: baseConfig.editorMode,
      showDownloads: baseConfig.showDownloads,
      definitionUrl: baseConfig.definitionUrl,
      panelCount: files.length || definition.panelCount || baseConfig.panelCount,
      files
    });
  }

  function recommendedColumns(count) {
    return RECOMMENDED_COLUMNS[count] || Math.max(1, Math.ceil(Math.sqrt(count)));
  }

  function pluralize(value, singular, plural = `${singular}s`) {
    return value === 1 ? singular : plural;
  }

  function createPanel(index) {
    const card = document.createElement('article');
    card.className = 'viewer-card';
    card.classList.toggle('is-publication', !config.editorMode);
    card.dataset.panelIndex = String(index);
    card.innerHTML = `
      <header class="panel-header">
        <span class="panel-number">${index + 1}.</span>
        <span class="panel-name-wrap">
          <span class="panel-label"></span>
          <span class="panel-source"></span>
        </span>
        <span class="panel-spacer"></span>
        <button class="panel-file-button" type="button" data-action="choose" title="Select a .molx file for this panel">
          ${ICONS.folder}<span>File</span>
        </button>
        <button class="icon-button" type="button" data-action="reload" title="Reload snapshot" aria-label="Reload snapshot" disabled>
          ${ICONS.reload}
        </button>
        <button class="icon-button" type="button" data-action="clear" title="Clear panel" aria-label="Clear panel" disabled>
          ${ICONS.clear}
        </button>
        <label class="focus-layout-control" title="Choose which Mol* interface regions are visible">
          <span>Focused layout</span>
          <select data-action="focus-layout" aria-label="Focused Mol* layout">
            <option value="canvas">3D only</option>
            <option value="sequence">Sequence + 3D</option>
            <option value="controls">Controls + 3D</option>
            <option value="sequence-controls">Sequence + controls</option>
            <option value="full">Full Mol* interface</option>
          </select>
        </label>
        <button class="icon-button" type="button" data-action="fullscreen" title="Open focused view" aria-label="Open panel in focused view">
          ${ICONS.expand}
        </button>
      </header>
      <div class="viewer-stage">
        <div class="molstar-host" id="molstar-panel-${index + 1}"></div>
        <div class="viewer-overlay is-visible" data-mode="empty">
          <div class="overlay-content">
            <span class="overlay-icon">${ICONS.upload}</span>
            <span class="spinner" aria-hidden="true"></span>
            <span class="overlay-error-icon" aria-hidden="true">!</span>
            <strong class="overlay-title"></strong>
            <span class="overlay-detail"></span>
            <span class="overlay-actions">
              <button class="overlay-button" type="button" data-action="choose">${ICONS.folder}Select file</button>
              <button class="overlay-button" type="button" data-action="retry">${ICONS.reload}Try again</button>
            </span>
          </div>
        </div>
      </div>
      <footer class="panel-footer" data-state="empty">
        <span class="status-dot" aria-hidden="true"></span>
        <span class="status-text"></span>
        <span class="panel-download-actions" aria-label="Panel downloads">
          <button class="panel-download-button" type="button" data-action="download-structure" title="No structure file configured" aria-label="Download structure file" disabled>
            ${ICONS.download}<span>Structure</span>
          </button>
          <button class="panel-download-button" type="button" data-action="download-molx" title="No MOLX file available" aria-label="Download MOLX file" disabled>
            ${ICONS.download}<span>MOLX</span>
          </button>
        </span>
      </footer>
    `;

    const refs = {
      card,
      stage: card.querySelector('.viewer-stage'),
      host: card.querySelector('.molstar-host'),
      overlay: card.querySelector('.viewer-overlay'),
      overlayTitle: card.querySelector('.overlay-title'),
      overlayDetail: card.querySelector('.overlay-detail'),
      label: card.querySelector('.panel-label'),
      source: card.querySelector('.panel-source'),
      footer: card.querySelector('.panel-footer'),
      statusText: card.querySelector('.status-text'),
      chooseButtons: card.querySelectorAll('[data-action="choose"]'),
      retryButton: card.querySelector('[data-action="retry"]'),
      reloadButton: card.querySelector('[data-action="reload"]'),
      clearButton: card.querySelector('[data-action="clear"]'),
      focusLayoutSelect: card.querySelector('[data-action="focus-layout"]'),
      fullscreenButton: card.querySelector('[data-action="fullscreen"]'),
      structureDownloadButton: card.querySelector('[data-action="download-structure"]'),
      molxDownloadButton: card.querySelector('[data-action="download-molx"]')
    };

    const panel = {
      index,
      id: config.files[index]?.id || `panel-${index + 1}`,
      label: config.files[index]?.label || `Panel ${index + 1}`,
      source: null,
      structureSource: config.files[index]?.structureUrl ? { kind: 'url', url: new URL(config.files[index].structureUrl, document.baseURI).href, name: fileNameFromUrl(config.files[index].structureUrl) } : null,
      viewer: null,
      status: 'empty',
      errorMessage: '',
      focusLayout: config.files[index]?.focusedLayout || config.focusedLayout,
      isFocused: false,
      focusFallback: false,
      dragging: false,
      dragDepth: 0,
      dragFileCount: 0,
      queue: Promise.resolve(),
      refs,
      resizeObserver: null,
      cameraSubscription: null,
      ignoreCameraChangesUntil: 0,
      active: true
    };

    refs.chooseButtons.forEach(button => {
      button.hidden = !config.editorMode;
      button.addEventListener('click', () => choosePanelFile(panel.index));
    });
    refs.retryButton.addEventListener('click', () => reloadPanel(panel.index));
    refs.reloadButton.addEventListener('click', () => reloadPanel(panel.index));
    refs.clearButton.hidden = !config.editorMode;
    refs.clearButton.addEventListener('click', () => clearPanel(panel.index));
    refs.focusLayoutSelect.addEventListener('change', () => {
      setFocusedLayout(panel.index, refs.focusLayoutSelect.value);
    });
    refs.fullscreenButton.addEventListener('click', () => toggleFullscreen(panel.index));
    refs.structureDownloadButton.addEventListener('click', () => downloadPanelFile(panel.index, 'structure'));
    refs.molxDownloadButton.addEventListener('click', () => downloadPanelFile(panel.index, 'molx'));
    const downloadActions = card.querySelector('.panel-download-actions');
    if (downloadActions) downloadActions.hidden = !config.showDownloads;

    if (config.editorMode) addPanelDragHandlers(panel);

    refs.stage.addEventListener('pointerdown', () => beginSynchronizedInteraction(panel.index), true);
    refs.stage.addEventListener('wheel', () => beginSynchronizedInteraction(panel.index), { capture: true, passive: true });

    if ('ResizeObserver' in window) {
      panel.resizeObserver = new ResizeObserver(() => {
        if (!panel.active) return;
        try {
          panel.viewer?.handleResize();
        } catch (error) {
          console.debug('Mol* resize ignored:', error);
        }
      });
      panel.resizeObserver.observe(refs.stage);
    }

    panels.push(panel);
    elements.grid.appendChild(card);
    renderPanel(panel);
    return panel;
  }

  function destroyPanel(panel) {
    if (!panel) return;
    if (panel.focusFallback) exitFallbackFocus(panel);
    panel.active = false;
    panel.dragging = false;
    panel.resizeObserver?.disconnect();
    disposeViewer(panel);
    panel.refs.card.remove();
  }

  function renderPanel(panel) {
    if (!panel?.active) return;

    const { refs } = panel;
    const sourceName = panel.source ? displayName(panel.source) : '';

    refs.label.textContent = panel.label;
    refs.source.textContent = sourceName || 'No snapshot loaded';
    refs.source.title = sourceName;
    refs.focusLayoutSelect.value = panel.focusLayout;

    const isLoading = panel.status === 'loading';
    refs.reloadButton.disabled = !panel.source || isLoading;
    refs.clearButton.disabled = (!panel.source && !panel.viewer) || isLoading;
    refs.focusLayoutSelect.disabled = isLoading;
    refs.chooseButtons.forEach(button => {
      button.disabled = isLoading;
    });

    const structureDownload = panelDownloadSource(panel, 'structure');
    const molxDownload = panelDownloadSource(panel, 'molx');
    updateDownloadButton(refs.structureDownloadButton, structureDownload, 'Structure');
    updateDownloadButton(refs.molxDownloadButton, molxDownload, 'MOLX');

    if (panel.dragging && !isLoading) {
      const isBulkDrop = panel.dragFileCount === panelCount;
      refs.overlay.dataset.mode = 'drop';
      refs.overlay.classList.add('is-visible');
      refs.overlayTitle.textContent = isBulkDrop
        ? `Drop the ${panelCount} .molx ${pluralize(panelCount, 'file')}`
        : 'Drop the .molx file into this panel';
      refs.overlayDetail.textContent = isBulkDrop
        ? `Files will be sorted by name and distributed across all ${panelCount} panels.`
        : 'This file will replace only the snapshot in this panel.';
      return;
    }

    refs.footer.dataset.state = panel.status;

    if (panel.status === 'ready') {
      refs.overlay.classList.remove('is-visible');
      refs.overlay.dataset.mode = 'empty';
      refs.statusText.textContent = `${sourceName} loaded`;
      refs.card.setAttribute('aria-busy', 'false');
      return;
    }

    refs.overlay.classList.add('is-visible');
    refs.overlay.dataset.mode = panel.status;

    if (panel.status === 'loading') {
      refs.overlayTitle.textContent = 'Loading .molx snapshot...';
      refs.overlayDetail.textContent = sourceName || 'Preparing the Mol* viewer.';
      refs.statusText.textContent = sourceName ? `Loading ${sourceName}` : 'Initializing Mol*';
      refs.card.setAttribute('aria-busy', 'true');
      return;
    }

    refs.card.setAttribute('aria-busy', 'false');

    if (panel.status === 'error') {
      refs.overlayTitle.textContent = 'This .molx file could not be opened';
      refs.overlayDetail.textContent = panel.errorMessage || 'Check the file and try again.';
      refs.statusText.textContent = sourceName ? `Failed to load ${sourceName}` : 'Snapshot failed to load';
      return;
    }

    refs.overlay.dataset.mode = 'empty';
    refs.overlayTitle.textContent = config.editorMode ? 'Drop a .molx file here' : 'Snapshot unavailable';
    refs.overlayDetail.textContent = config.editorMode ? 'Or select a snapshot saved by Mol*.' : 'The configured MOLX scene could not be loaded.';
    refs.statusText.textContent = config.editorMode ? 'Waiting for a .molx file' : 'Waiting for configured snapshot';
  }

  function addPanelDragHandlers(panel) {
    const card = panel.refs.card;

    card.addEventListener('dragenter', event => {
      if (!panel.active || !hasDraggedFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      panel.dragDepth += 1;
      panel.dragging = true;
      panel.dragFileCount = event.dataTransfer?.items?.length || 0;
      card.classList.add('is-dragover');
      renderPanel(panel);
    });

    card.addEventListener('dragover', event => {
      if (!panel.active || !hasDraggedFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      panel.dragFileCount = event.dataTransfer?.items?.length || panel.dragFileCount;
    });

    card.addEventListener('dragleave', event => {
      if (!panel.active || !hasDraggedFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      panel.dragDepth = Math.max(0, panel.dragDepth - 1);
      if (panel.dragDepth === 0) resetPanelDrag(panel);
    });

    card.addEventListener('drop', event => {
      if (!panel.active || !hasDraggedFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const files = Array.from(event.dataTransfer?.files || []);
      resetPanelDrag(panel);

      if (files.length === panelCount) {
        loadLocalFiles(files);
        return;
      }
      if (files.length === 1) {
        loadSingleLocalFile(panel.index, files[0]);
        return;
      }
      showToast(
        `Drop one file into this panel, or exactly ${panelCount} files to fill the grid.`,
        'error'
      );
    });
  }

  function hasDraggedFiles(event) {
    return Array.from(event.dataTransfer?.types || []).includes('Files');
  }

  function resetPanelDrag(panel) {
    if (!panel) return;
    panel.dragDepth = 0;
    panel.dragging = false;
    panel.dragFileCount = 0;
    panel.refs.card.classList.remove('is-dragover');
    renderPanel(panel);
  }

  function choosePanelFile(index) {
    if (!panels[index]?.active) return;
    selectedPanelIndex = index;
    elements.panelInput.value = '';
    elements.panelInput.click();
  }

  function isMolxFile(file) {
    return Boolean(file && typeof file.name === 'string' && /\.molx$/i.test(file.name));
  }

  function naturalSortFiles(files) {
    return [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: 'base'
    }));
  }

  async function loadSingleLocalFile(index, file) {
    if (!isMolxFile(file)) {
      showToast('Select a file with the .molx extension.', 'error');
      return false;
    }

    return loadSourceIntoPanel(index, {
      kind: 'file',
      file,
      name: file.name
    });
  }

  async function loadLocalFiles(fileList) {
    const files = Array.from(fileList || []);
    const expectedCount = panelCount;
    const generation = ++bulkLoadGeneration;

    if (files.length !== expectedCount) {
      showToast(
        `Select exactly ${expectedCount} .molx ${pluralize(expectedCount, 'file')}. Received ${files.length}.`,
        'error'
      );
      return [];
    }

    const invalid = files.filter(file => !isMolxFile(file));
    if (invalid.length > 0) {
      showToast(`Invalid files: ${invalid.map(file => file.name).join(', ')}. Use only .molx files.`, 'error');
      return [];
    }

    const sorted = naturalSortFiles(files);
    showToast(`Loading ${expectedCount} .molx ${pluralize(expectedCount, 'snapshot')} in batches...`);

    const results = await mapWithConcurrency(sorted, LOAD_CONCURRENCY, (file, index) => {
      if (generation !== bulkLoadGeneration || expectedCount !== panelCount) return false;
      return loadSourceIntoPanel(index, {
        kind: 'file',
        file,
        name: file.name
      });
    });

    if (generation !== bulkLoadGeneration || expectedCount !== panelCount) return results;

    const loaded = results.filter(Boolean).length;
    if (loaded === expectedCount) {
      showToast(
        `${expectedCount} .molx ${pluralize(expectedCount, 'file')} loaded successfully.`,
        'success'
      );
    } else {
      showToast(
        `${loaded} of ${expectedCount} snapshots loaded. Check the panels showing an error.`,
        'error'
      );
    }
    return results;
  }

  function hostedEntriesForActivePanels() {
    return config.files.slice(0, panelCount);
  }

  function hostedFilesReady() {
    const entries = hostedEntriesForActivePanels();
    return entries.length === panelCount && entries.every(entry => entry.molxUrl);
  }

  async function loadHostedFiles() {
    const expectedCount = panelCount;
    const entries = hostedEntriesForActivePanels();
    const generation = ++bulkLoadGeneration;
    const missingCount = entries.filter(entry => !entry.molxUrl).length;

    if (entries.length !== expectedCount || missingCount > 0) {
      showToast(
        `Add URLs for all ${expectedCount} active panels in config.js before loading from the repository.`,
        'error'
      );
      return [];
    }

    const sources = entries.map(entry => ({
      kind: 'url',
      url: new URL(entry.molxUrl, document.baseURI).href,
      name: fileNameFromUrl(entry.molxUrl),
      label: entry.label
    }));

    showToast(`Loading ${expectedCount} ${pluralize(expectedCount, 'snapshot')} from the repository...`);
    const results = await mapWithConcurrency(sources, LOAD_CONCURRENCY, (source, index) => {
      if (generation !== bulkLoadGeneration || expectedCount !== panelCount) return false;
      if (panels[index]) panels[index].label = source.label || panels[index].label;
      return loadSourceIntoPanel(index, source);
    });

    if (generation !== bulkLoadGeneration || expectedCount !== panelCount) return results;

    const loaded = results.filter(Boolean).length;
    if (loaded === expectedCount) {
      showToast(
        `${expectedCount} repository ${pluralize(expectedCount, 'snapshot')} loaded successfully.`,
        'success'
      );
    } else {
      showToast(`${loaded} of ${expectedCount} repository snapshots loaded.`, 'error');
    }
    return results;
  }

  function loadSourceIntoPanel(index, source) {
    const panel = panels[index];
    if (!panel?.active) return Promise.resolve(false);

    return enqueuePanel(panel, async () => {
      if (!panel.active) return false;

      panel.source = source;
      panel.status = 'loading';
      panel.errorMessage = '';
      renderPanel(panel);

      try {
        const viewer = await recreateViewer(panel);
        if (!panel.active) {
          try { viewer.dispose(); } catch (error) { console.debug(error); }
          return false;
        }

        if (source.kind === 'file') {
          await viewer.loadFiles([source.file]);
        } else {
          await viewer.loadSnapshotFromUrl(source.url, 'molx');
        }

        if (!panel.active) {
          disposeViewer(panel);
          return false;
        }

        panel.status = 'ready';
        panel.errorMessage = '';
        attachCameraSync(panel);
        // A MOLX snapshot can contain UI/layout state; enforce the dashboard presentation again.
        applyPanelPresentation(panel);
        renderPanel(panel);
        requestViewerResize(panel);
        captureSyncBaselines();
        emitStateChange('panel-loaded');
        return true;
      } catch (error) {
        if (!panel.active) return false;
        console.error(`Panel ${index + 1} failed:`, error);
        panel.status = 'error';
        panel.errorMessage = friendlyError(error, source);
        renderPanel(panel);
        return false;
      }
    });
  }

  function reloadPanel(index) {
    const panel = panels[index];
    if (!panel?.active) return Promise.resolve(false);
    if (!panel.source) {
      choosePanelFile(index);
      return Promise.resolve(false);
    }
    return loadSourceIntoPanel(index, panel.source);
  }

  function clearPanel(index, options = {}) {
    const panel = panels[index];
    if (!panel?.active) return Promise.resolve();

    return enqueuePanel(panel, async () => {
      if (!panel.active) return;
      disposeViewer(panel);
      panel.source = null;
      panel.status = 'empty';
      panel.errorMessage = '';
      renderPanel(panel);
      captureSyncBaselines();
      emitStateChange('panel-cleared');
      if (!options.silent) showToast(`Panel ${index + 1} cleared.`);
    });
  }

  async function clearAll() {
    bulkLoadGeneration += 1;
    await Promise.all(panels.map(panel => clearPanel(panel.index, { silent: true })));
    showToast(`All ${panelCount} ${pluralize(panelCount, 'panel')} cleared.`);
  }

  function enqueuePanel(panel, operation) {
    const result = panel.queue.catch(() => undefined).then(operation);
    panel.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async function recreateViewer(panel) {
    if (!panel.active) throw new Error('Panel is no longer active.');
    disposeViewer(panel);

    if (!window.molstar?.Viewer?.create) {
      throw new Error('The Mol* library did not load. Check your internet connection or host the Mol* bundle locally.');
    }

    panel.refs.host.replaceChildren();
    const viewer = await window.molstar.Viewer.create(panel.refs.host, viewerOptions);

    if (!panel.active) {
      try { viewer.dispose(); } catch (error) { console.debug(error); }
      throw new Error('Panel is no longer active.');
    }

    panel.viewer = viewer;
    applyPanelPresentation(panel);
    requestViewerResize(panel);
    return viewer;
  }

  function disposeViewer(panel) {
    try { panel?.cameraSubscription?.unsubscribe?.(); } catch (error) { console.debug(error); }
    if (panel) panel.cameraSubscription = null;
    if (panel?.viewer) {
      try {
        panel.viewer.dispose();
      } catch (error) {
        console.debug('Mol* dispose ignored:', error);
      }
      panel.viewer = null;
    }
    panel?.refs.host.replaceChildren();
  }

  function requestViewerResize(panel) {
    if (!panel?.active) return;
    requestAnimationFrame(() => {
      try {
        panel.viewer?.handleResize();
      } catch (error) {
        console.debug('Mol* resize ignored:', error);
      }
    });
    setTimeout(() => {
      if (!panel.active) return;
      try {
        panel.viewer?.handleResize();
      } catch (error) {
        console.debug('Mol* delayed resize ignored:', error);
      }
    }, 180);
  }

  function nativeFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function isPanelFocused(panel) {
    if (!panel?.active) return false;
    return nativeFullscreenElement() === panel.refs.card || panel.focusFallback;
  }

  function focusedLayoutDefinition(value) {
    return FOCUSED_LAYOUTS[normalizeFocusedLayout(value)] || FOCUSED_LAYOUTS[DEFAULT_FOCUSED_LAYOUT];
  }

  function applyPanelPresentation(panel) {
    if (!panel?.active) return false;

    const focused = isPanelFocused(panel);
    panel.isFocused = focused;
    panel.refs.card.classList.toggle('is-focused', focused);
    panel.refs.card.dataset.focusLayout = focused ? panel.focusLayout : 'compact';
    panel.refs.focusLayoutSelect.value = panel.focusLayout;
    panel.refs.fullscreenButton.innerHTML = focused ? ICONS.collapse : ICONS.expand;
    panel.refs.fullscreenButton.title = focused ? 'Exit focused view' : 'Open focused view';
    panel.refs.fullscreenButton.setAttribute(
      'aria-label',
      focused ? 'Exit focused view' : 'Open panel in focused view'
    );

    const viewer = panel.viewer;
    const layout = viewer?.plugin?.layout;
    if (!layout?.setProps) {
      requestViewerResize(panel);
      return false;
    }

    const definition = focused
      ? focusedLayoutDefinition(panel.focusLayout)
      : FOCUSED_LAYOUTS.canvas;

    try {
      layout.setProps({
        showControls: focused ? definition.showControls : false,
        controlsDisplay: 'reactive',
        regionState: { ...definition.regionState }
      });
      // Viewer.handleResize emits the Mol* layout update event after changing state.
      viewer.handleResize();
      requestViewerResize(panel);
      return true;
    } catch (error) {
      console.error('Could not update the Mol* focused layout:', error);
      return false;
    }
  }

  function setFocusedLayout(index, value, options = {}) {
    const panel = panels[index];
    if (!panel?.active) return null;

    const next = normalizeFocusedLayout(value, panel.focusLayout);
    panel.focusLayout = next;
    panel.refs.focusLayoutSelect.value = next;
    if (isPanelFocused(panel)) applyPanelPresentation(panel);

    emitStateChange('focused-layout');
    if (options.announce !== false && isPanelFocused(panel)) {
      showToast(`Focused layout: ${focusedLayoutDefinition(next).label}.`);
    }
    return next;
  }

  function enterFallbackFocus(panel) {
    if (!panel?.active) return;

    if (fallbackFocusedPanelIndex !== null && fallbackFocusedPanelIndex !== panel.index) {
      const previous = panels[fallbackFocusedPanelIndex];
      if (previous) exitFallbackFocus(previous);
    }

    fallbackFocusedPanelIndex = panel.index;
    panel.focusFallback = true;
    panel.refs.card.classList.add('is-focus-fallback');
    document.body.classList.add('has-focus-fallback');
    applyPanelPresentation(panel);
  }

  function exitFallbackFocus(panel) {
    if (!panel) return;
    panel.focusFallback = false;
    panel.refs.card.classList.remove('is-focus-fallback');
    if (fallbackFocusedPanelIndex === panel.index) fallbackFocusedPanelIndex = null;
    if (!panels.some(candidate => candidate.focusFallback)) {
      document.body.classList.remove('has-focus-fallback');
    }
    applyPanelPresentation(panel);
  }

  function syncFocusedPanels() {
    const fullscreen = nativeFullscreenElement();
    panels.forEach(panel => {
      if (!panel.active) return;
      if (fullscreen === panel.refs.card && panel.focusFallback) {
        panel.focusFallback = false;
        panel.refs.card.classList.remove('is-focus-fallback');
        if (fallbackFocusedPanelIndex === panel.index) fallbackFocusedPanelIndex = null;
      }
      applyPanelPresentation(panel);
    });

    if (!panels.some(panel => panel.focusFallback)) {
      document.body.classList.remove('has-focus-fallback');
    }
  }

  async function toggleFullscreen(index) {
    const panel = panels[index];
    const card = panel?.refs.card;
    if (!panel || !card) return;

    if (panel.focusFallback) {
      exitFallbackFocus(panel);
      return;
    }

    const fullscreen = nativeFullscreenElement();
    if (fullscreen === card) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      try {
        if (exit) await exit.call(document);
      } catch (error) {
        console.debug('Native fullscreen exit failed:', error);
      }
      syncFocusedPanels();
      return;
    }

    const request = card.requestFullscreen || card.webkitRequestFullscreen;
    if (!request) {
      enterFallbackFocus(panel);
      showToast('Focused view opened inside the page.');
      return;
    }

    try {
      await request.call(card);
      // Some WebKit implementations fail silently instead of rejecting the request.
      if (nativeFullscreenElement() === card) {
        syncFocusedPanels();
      } else {
        enterFallbackFocus(panel);
        showToast('Focused view opened inside the page.');
      }
    } catch (error) {
      console.debug('Native fullscreen unavailable; using focused fallback:', error);
      enterFallbackFocus(panel);
      showToast('Focused view opened inside the page.');
    }
  }

  function getLayoutCandidates(count) {
    const candidates = new Set();
    const regularMaximum = Math.ceil(count / 2);
    for (let columns = 1; columns <= regularMaximum; columns += 1) {
      candidates.add(columns);
    }
    candidates.add(count);
    return [...candidates].sort((a, b) => a - b);
  }

  function layoutDescription(count, columns) {
    const rows = Math.ceil(count / columns);
    const rowText = pluralize(rows, 'row');
    const columnText = pluralize(columns, 'column');
    const remainder = count % columns;
    const partialText = remainder && rows > 1 ? ` · ${remainder} in last row` : '';
    return `${rows} ${rowText} × ${columns} ${columnText}${partialText}`;
  }

  function populateLayoutOptions(preferRecommended = true) {
    const candidates = getLayoutCandidates(panelCount);
    const recommended = recommendedColumns(panelCount);
    const previous = layoutColumns;
    const selected = !preferRecommended && candidates.includes(previous)
      ? previous
      : recommended;

    elements.layoutSelect.replaceChildren();
    candidates.forEach(columns => {
      const option = document.createElement('option');
      option.value = String(columns);
      option.textContent = `${layoutDescription(panelCount, columns)}${columns === recommended ? ' — Recommended' : ''}`;
      elements.layoutSelect.appendChild(option);
    });

    applyLayout(selected, false);
  }

  function applyLayout(columns, announce = true) {
    const parsed = Number.parseInt(String(columns), 10);
    const validColumns = getLayoutCandidates(panelCount);
    layoutColumns = validColumns.includes(parsed) ? parsed : recommendedColumns(panelCount);

    elements.layoutSelect.value = String(layoutColumns);
    elements.grid.style.setProperty('--columns', String(layoutColumns));
    emitStateChange('layout');
    elements.grid.dataset.layoutColumns = String(layoutColumns);
    panels.forEach(requestViewerResize);

    if (announce) {
      showToast(`Layout changed to ${layoutDescription(panelCount, layoutColumns)}.`);
    }
    return layoutColumns;
  }

  function setPanelCount(value, options = {}) {
    const nextCount = clampPanelCount(value, panelCount);
    const previousCount = panelCount;
    if (nextCount === previousCount) return panelCount;

    bulkLoadGeneration += 1;
    selectedPanelIndex = null;
    panelCount = nextCount;

    let removedSnapshots = 0;
    if (nextCount < previousCount) {
      const removedPanels = panels.splice(nextCount);
      removedSnapshots = removedPanels.filter(panel => panel.source).length;
      removedPanels.forEach(destroyPanel);
    } else {
      for (let index = panels.length; index < nextCount; index += 1) {
        createPanel(index);
      }
    }

    populateLayoutOptions(options.preserveLayout === true ? false : true);
    updateDynamicUi();
    updateHostedButton();
    panels.forEach(requestViewerResize);

    captureSyncBaselines();
    emitStateChange('panel-count');
    if (options.announce !== false) {
      const removalNote = removedSnapshots > 0
        ? ` ${removedSnapshots} removed ${pluralize(removedSnapshots, 'snapshot')} unloaded.`
        : '';
      showToast(`Panel count changed to ${panelCount}.${removalNote}`);
    }
    return panelCount;
  }

  async function mapWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function runWorker() {
      while (nextIndex < items.length) {
        const current = nextIndex;
        nextIndex += 1;
        try {
          results[current] = await worker(items[current], current);
        } catch (error) {
          console.error(error);
          results[current] = false;
        }
      }
    }

    const count = Math.min(Math.max(1, limit), items.length);
    await Promise.all(Array.from({ length: count }, runWorker));
    return results;
  }

  function displayName(source) {
    if (!source) return '';
    return source.name || (source.kind === 'url' ? fileNameFromUrl(source.url) : 'snapshot.molx');
  }

  function fileNameFromUrl(url) {
    try {
      const parsed = new URL(url, document.baseURI);
      const name = parsed.pathname.split('/').filter(Boolean).pop();
      return decodeURIComponent(name || 'snapshot.molx');
    } catch (error) {
      return String(url).split('/').pop() || 'snapshot.molx';
    }
  }

  function panelDownloadSource(panel, format) {
    if (!panel?.active) return null;
    const entry = config.files[panel.index] || {};

    if (format === 'structure') {
      if (panel.structureSource?.kind === 'file' && panel.structureSource.file) return panel.structureSource;
      if (panel.structureSource?.kind === 'url' && panel.structureSource.url) return panel.structureSource;
      if (!entry.structureUrl) return null;
      return { kind: 'url', url: new URL(entry.structureUrl, document.baseURI).href, name: fileNameFromUrl(entry.structureUrl) };
    }

    if (panel.source?.kind === 'file' && panel.source.file) {
      return { kind: 'file', file: panel.source.file, name: panel.source.name || panel.source.file.name || `panel-${panel.index + 1}.molx` };
    }
    if (panel.source?.kind === 'url' && panel.source.url) {
      return { kind: 'url', url: panel.source.url, name: panel.source.name || fileNameFromUrl(panel.source.url) };
    }
    if (!entry.molxUrl) return null;
    return { kind: 'url', url: new URL(entry.molxUrl, document.baseURI).href, name: fileNameFromUrl(entry.molxUrl) };
  }

  function updateDownloadButton(button, source, format) {
    if (!button) return;
    button.disabled = !source;
    const filename = source?.name || '';
    const unavailableText = `No ${format} file ${format === 'Structure' ? 'configured' : 'available'}`;
    button.title = source ? `Download ${filename || format}` : unavailableText;
    button.setAttribute('aria-label', source ? `Download ${filename || `${format} file`}` : unavailableText);
  }

  function downloadPanelFile(index, format) {
    const panel = panels[index];
    if (!panel?.active) return false;

    const normalizedFormat = String(format).toLowerCase() === 'structure' ? 'structure' : 'molx';
    const source = panelDownloadSource(panel, normalizedFormat);
    if (!source) {
      const field = normalizedFormat === 'structure' ? 'structureUrl' : 'molxUrl';
      showToast(`Add ${field} for panel ${index + 1} in config.js first.`, 'error');
      return false;
    }

    let objectUrl = null;
    try {
      const anchor = document.createElement('a');
      if (source.kind === 'file') {
        objectUrl = URL.createObjectURL(source.file);
        anchor.href = objectUrl;
      } else {
        anchor.href = source.url;
      }
      anchor.download = source.name || `panel-${index + 1}.${normalizedFormat === 'structure' ? 'pdb' : 'molx'}`;
      anchor.rel = 'noopener';
      anchor.hidden = true;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      showToast(`Downloading ${anchor.download}...`, 'success');
      return true;
    } catch (error) {
      console.error('Download failed:', error);
      showToast(`The ${normalizedFormat === 'structure' ? 'STRUCTURE' : 'MOLX'} download could not be started. Check the path in config.js.`, 'error');
      return false;
    } finally {
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    }
  }

  function friendlyError(error, source) {
    const message = String(error?.message || error || '').replace(/\s+/g, ' ').trim();

    if (/webgl|graphics|context/i.test(message)) {
      return 'WebGL could not start. Close other 3D tabs or use a browser with hardware acceleration enabled.';
    }
    if (source?.kind === 'url' && /fetch|network|cors|404|failed to load|http/i.test(message)) {
      return 'The file was not found or was blocked by CORS. Check molxUrl in config.js and publish the .molx file in the same repository.';
    }
    if (/snapshot|zip|archive|parse|invalid|molx/i.test(message)) {
      return 'The file does not appear to be a valid .molx snapshot, or it may be corrupted.';
    }
    if (message) return message.slice(0, 220);
    return 'Mol* could not restore the snapshot.';
  }

  function showToast(message, type = '') {
    clearTimeout(toastTimer);
    if (!elements.toast) return;
    elements.toast.textContent = message;
    elements.toast.className = 'toast is-visible';
    if (type === 'error') elements.toast.classList.add('is-error');
    if (type === 'success') elements.toast.classList.add('is-success');
    toastTimer = setTimeout(() => {
      elements.toast.classList.remove('is-visible');
    }, type === 'error' ? 6500 : 3600);
  }

  function vectorSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function vectorAdd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function vectorScale(a, factor) { return [a[0] * factor, a[1] * factor, a[2] * factor]; }
  function vectorDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function vectorCross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function vectorLength(a) { return Math.hypot(a[0], a[1], a[2]); }
  function vectorNormalize(a, fallback = [0, 0, 1]) {
    const length = vectorLength(a);
    return length > 1e-10 ? vectorScale(a, 1 / length) : [...fallback];
  }
  function cameraBasis(snapshot) {
    const back = vectorNormalize(vectorSub(snapshot.position, snapshot.target));
    const right = vectorNormalize(vectorCross(snapshot.up, back), [1, 0, 0]);
    const up = vectorNormalize(vectorCross(back, right), [0, 1, 0]);
    return { right, up, back };
  }
  function basisTransform(basis, local) {
    return [
      basis.right[0] * local[0] + basis.up[0] * local[1] + basis.back[0] * local[2],
      basis.right[1] * local[0] + basis.up[1] * local[1] + basis.back[1] * local[2],
      basis.right[2] * local[0] + basis.up[2] * local[1] + basis.back[2] * local[2]
    ];
  }
  function basisLocal(basis, world) {
    return [vectorDot(world, basis.right), vectorDot(world, basis.up), vectorDot(world, basis.back)];
  }
  function cloneCameraSnapshot(snapshot) {
    if (!snapshot) return null;
    return { ...snapshot, position: [...snapshot.position], target: [...snapshot.target], up: [...snapshot.up] };
  }
  function currentCameraSnapshot(panel) {
    return cloneCameraSnapshot(panel?.viewer?.plugin?.canvas3d?.camera?.getSnapshot?.());
  }
  function captureSyncBaselines(driverIndex = syncDriverIndex) {
    syncDriverIndex = Number.isInteger(driverIndex) ? driverIndex : syncDriverIndex;
    syncBaselines = new Map();
    panels.filter(panel => panel.active && panel.status === 'ready').forEach(panel => {
      const snapshot = currentCameraSnapshot(panel);
      if (snapshot) syncBaselines.set(panel.index, snapshot);
    });
    return syncBaselines.size;
  }
  function beginSynchronizedInteraction(index) {
    if (!syncEnabled || syncGuard) return;
    syncDriverIndex = index;
    captureSyncBaselines(index);
  }
  function relativeCameraSnapshot(sourceBase, sourceCurrent, targetBase) {
    const sourceBasis0 = cameraBasis(sourceBase);
    const sourceBasis1 = cameraBasis(sourceCurrent);
    const targetBasis0 = cameraBasis(targetBase);
    const rotateColumn = column => basisTransform(targetBasis0, basisLocal(sourceBasis0, column));
    const newRight = vectorNormalize(rotateColumn(sourceBasis1.right), targetBasis0.right);
    const newUp0 = vectorNormalize(rotateColumn(sourceBasis1.up), targetBasis0.up);
    const newBack = vectorNormalize(rotateColumn(sourceBasis1.back), targetBasis0.back);
    const newUp = vectorNormalize(vectorCross(newBack, newRight), newUp0);

    const sourceDistance0 = Math.max(1e-6, vectorLength(vectorSub(sourceBase.position, sourceBase.target)));
    const sourceDistance1 = Math.max(1e-6, vectorLength(vectorSub(sourceCurrent.position, sourceCurrent.target)));
    const targetDistance0 = Math.max(1e-6, vectorLength(vectorSub(targetBase.position, targetBase.target)));
    const distanceRatio = sourceDistance1 / sourceDistance0;

    const sourcePan = vectorSub(sourceCurrent.target, sourceBase.target);
    const localPan = basisLocal(sourceBasis0, sourcePan).map(value => value / sourceDistance0);
    const targetPan = basisTransform(targetBasis0, localPan.map(value => value * targetDistance0));
    const target = vectorAdd(targetBase.target, targetPan);
    const position = vectorAdd(target, vectorScale(newBack, targetDistance0 * distanceRatio));

    const radiusRatio = sourceBase.radius > 1e-6 ? sourceCurrent.radius / sourceBase.radius : 1;
    return {
      mode: sourceCurrent.mode,
      fov: sourceCurrent.fov,
      position,
      target,
      up: newUp,
      radius: Math.max(0.01, targetBase.radius * (Number.isFinite(radiusRatio) ? radiusRatio : 1)),
      fog: sourceCurrent.fog,
      clipFar: sourceCurrent.clipFar,
      minNear: targetBase.minNear,
      minFar: targetBase.minFar
    };
  }
  function broadcastCameraFrom(panel) {
    if (!syncEnabled || syncGuard || panel.index !== syncDriverIndex) return;
    const sourceBase = syncBaselines.get(panel.index);
    const sourceCurrent = currentCameraSnapshot(panel);
    if (!sourceBase || !sourceCurrent) return;
    syncGuard = true;
    try {
      panels.forEach(targetPanel => {
        if (!targetPanel.active || targetPanel.index === panel.index || targetPanel.status !== 'ready') return;
        const targetBase = syncBaselines.get(targetPanel.index);
        const camera = targetPanel.viewer?.plugin?.canvas3d?.camera;
        if (!targetBase || !camera?.setState) return;
        targetPanel.ignoreCameraChangesUntil = performance.now() + 90;
        camera.setState(relativeCameraSnapshot(sourceBase, sourceCurrent, targetBase), 0);
      });
    } finally {
      syncGuard = false;
    }
  }
  function attachCameraSync(panel) {
    try { panel.cameraSubscription?.unsubscribe?.(); } catch (error) { console.debug(error); }
    panel.cameraSubscription = null;
    const camera = panel.viewer?.plugin?.canvas3d?.camera;
    if (!camera?.changed?.subscribe) return;
    panel.cameraSubscription = camera.changed.subscribe(() => {
      if (performance.now() < panel.ignoreCameraChangesUntil) return;
      broadcastCameraFrom(panel);
    });
  }
  function updateSyncUi() {
    if (elements.syncToggle) elements.syncToggle.checked = syncEnabled;
    if (elements.syncStatus) elements.syncStatus.textContent = syncEnabled ? 'Cameras locked' : 'Independent cameras';
    document.body.classList.toggle('cameras-synchronized', syncEnabled);
  }
  function setSyncEnabled(value, options = {}) {
    syncEnabled = Boolean(value);
    if (syncEnabled) captureSyncBaselines(syncDriverIndex);
    else syncBaselines.clear();
    updateSyncUi();
    emitStateChange('camera-sync');
    if (options.announce !== false) showToast(syncEnabled ? 'Camera synchronization enabled. Current panel positions were preserved.' : 'Camera synchronization disabled. Panels can be positioned independently.', 'success');
    return syncEnabled;
  }
  function setPanelLabel(index, label) {
    const panel = panels[index];
    if (!panel?.active) return false;
    panel.label = String(label || '').trim() || `Panel ${index + 1}`;
    if (config.files[index]) config.files[index].label = panel.label;
    renderPanel(panel);
    emitStateChange('panel-label');
    return true;
  }
  function setPanelStructureFile(index, file) {
    const panel = panels[index];
    if (!panel?.active) return false;
    panel.structureSource = file ? { kind: 'file', file, name: file.name } : null;
    renderPanel(panel);
    emitStateChange('panel-structure');
    return true;
  }
  function setPanelStructureUrl(index, url) {
    const panel = panels[index];
    if (!panel?.active) return false;
    const value = String(url || '').trim();
    panel.structureSource = value ? { kind: 'url', url: new URL(value, document.baseURI).href, name: fileNameFromUrl(value) } : null;
    if (config.files[index]) config.files[index].structureUrl = value;
    renderPanel(panel);
    emitStateChange('panel-structure');
    return true;
  }

  function applyConfig() {
    document.title = config.title;
    if (elements.brandTitle) elements.brandTitle.textContent = config.title;
    if (elements.pageSubtitle) elements.pageSubtitle.textContent = config.subtitle;
  }

  function updateHostedButton() {
    const ready = hostedFilesReady();
    if (!elements.hostedButton) return;
    elements.hostedButton.disabled = !ready;
    elements.hostedButton.title = ready
      ? `Load the ${panelCount} MOLX files configured in config.js`
      : `Add molxUrl (or legacy url) for the first ${panelCount} files in config.js to enable this button`;
  }

  function updateDynamicUi() {
    const panelWord = pluralize(panelCount, 'panel');
    const fileWord = pluralize(panelCount, 'file');

    if (elements.panelCountSelect) elements.panelCountSelect.value = String(panelCount);
    if (elements.bulkButtonLabel) elements.bulkButtonLabel.textContent = `Select ${panelCount} .molx ${fileWord}`;
    if (elements.panelCountHelp) elements.panelCountHelp.textContent = `Select exactly ${panelCount} .molx ${fileWord}; files are sorted naturally by name.`;
    if (elements.helperText) elements.helperText.innerHTML = `Local snapshots are processed in your browser and are not uploaded to GitHub. Drag one <code>.molx</code> file onto a panel, or drag exactly ${panelCount} files onto the grid. Expand a panel to choose 3D-only, sequence, controls, or full Mol* layouts. Hosted downloads use <code>molxUrl</code> and <code>structureUrl</code> from <code>config.js</code>.`;
    if (elements.footerPanelCount) elements.footerPanelCount.textContent = `${panelCount} ${panelWord}`;
    elements.grid.setAttribute('aria-label', `${panelCount} Mol* ${pluralize(panelCount, 'viewer')}`);
    updateSyncUi();
  }

  function addGlobalHandlers() {
    if (elements.panelCountApply) elements.panelCountApply.addEventListener('click', () => setPanelCount(elements.panelCountSelect?.value));
    if (elements.panelCountSelect) elements.panelCountSelect.addEventListener('change', () => {
      if (!elements.panelCountApply) setPanelCount(elements.panelCountSelect.value);
    });
    if (elements.layoutSelect) elements.layoutSelect.addEventListener('change', () => applyLayout(elements.layoutSelect.value));
    if (elements.syncToggle) elements.syncToggle.addEventListener('change', () => setSyncEnabled(elements.syncToggle.checked));

    if (elements.bulkButton && elements.bulkInput) elements.bulkButton.addEventListener('click', () => {
      elements.bulkInput.value = '';
      elements.bulkInput.click();
    });
    if (elements.bulkInput) elements.bulkInput.addEventListener('change', () => loadLocalFiles(elements.bulkInput.files));
    if (elements.panelInput) elements.panelInput.addEventListener('change', () => {
      const file = elements.panelInput.files?.[0];
      const index = selectedPanelIndex;
      selectedPanelIndex = null;
      if (file && index !== null) loadSingleLocalFile(index, file);
    });
    elements.hostedButton?.addEventListener('click', loadHostedFiles);
    elements.clearAllButton?.addEventListener('click', clearAll);

    if (config.editorMode) {
      elements.grid.addEventListener('dragenter', event => {
        if (!hasDraggedFiles(event)) return;
        event.preventDefault();
        gridDragDepth += 1;
        elements.grid.classList.add('is-dragover');
      });
      elements.grid.addEventListener('dragover', event => {
        if (!hasDraggedFiles(event)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      });
      elements.grid.addEventListener('dragleave', event => {
        if (!hasDraggedFiles(event)) return;
        event.preventDefault();
        gridDragDepth = Math.max(0, gridDragDepth - 1);
        if (gridDragDepth === 0) elements.grid.classList.remove('is-dragover');
      });
      elements.grid.addEventListener('drop', event => {
        if (!hasDraggedFiles(event)) return;
        event.preventDefault();
        gridDragDepth = 0;
        elements.grid.classList.remove('is-dragover');
        const files = Array.from(event.dataTransfer?.files || []);
        if (files.length === panelCount) loadLocalFiles(files);
        else showToast(`Drop exactly ${panelCount} files onto the grid, or one file directly into a panel.`, 'error');
      });
    }

    document.addEventListener('fullscreenchange', syncFocusedPanels);
    document.addEventListener('webkitfullscreenchange', syncFocusedPanels);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || fallbackFocusedPanelIndex === null) return;
      const panel = panels[fallbackFocusedPanelIndex];
      if (panel) exitFallbackFocus(panel);
    });
    window.addEventListener('resize', () => panels.forEach(requestViewerResize), { passive: true });
    window.addEventListener('beforeunload', () => panels.forEach(panel => {
      panel.resizeObserver?.disconnect();
      disposeViewer(panel);
    }));
  }

  async function init() {
    if (!elements.grid || !elements.layoutSelect) return;
    try {
      config = await resolveDefinition(config);
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Could not load the multi-structure definition.', 'error');
    }

    directView = readDirectView(config);
    if (directView?.found) {
      const selectedEntry = config.files[directView.entryIndex];
      config.files = [{ ...selectedEntry, focusedLayout: directView.layout }, ...config.files.filter((_, index) => index !== directView.entryIndex)];
      config.panelCount = 1;
      config.focusedLayout = directView.layout;
      config.autoLoad = true;
    }

    panelCount = config.panelCount;
    layoutColumns = config.layoutColumns || recommendedColumns(panelCount);
    syncEnabled = Boolean(config.syncOnLoad);
    applyConfig();
    for (let index = 0; index < panelCount; index += 1) createPanel(index);
    populateLayoutOptions(false);
    updateDynamicUi();
    updateHostedButton();
    updateSyncUi();
    addGlobalHandlers();

    window.MultiStructureViewer = Object.freeze({
      loadLocalFiles,
      loadHostedFiles,
      loadFileIntoPanel: loadSingleLocalFile,
      downloadPanelFile,
      clearPanel,
      clearAll,
      setPanelCount,
      setLayoutColumns: columns => applyLayout(columns),
      setFocusedLayout,
      toggleFocusedPanel: toggleFullscreen,
      setPanelLabel,
      setPanelStructureFile,
      setPanelStructureUrl,
      setSyncEnabled,
      captureSyncBaselines,
      onStateChange(listener) { stateListeners.add(listener); return () => stateListeners.delete(listener); },
      getEditorPanels: () => panels.filter(panel => panel.active).map(panel => ({
        index: panel.index,
        id: panel.id,
        label: panel.label,
        focusedLayout: panel.focusLayout,
        source: panel.source,
        structureSource: panel.structureSource,
        status: panel.status
      })),
      getCameraSnapshots: () => panels.filter(panel => panel.active).map(panel => ({
        index: panel.index,
        status: panel.status,
        snapshot: currentCameraSnapshot(panel)
      })),
      getState: () => ({
        version: VIEWER_VERSION,
        editorMode: config.editorMode,
        panelCount,
        layoutColumns,
        syncEnabled,
        focusedPanelIndex: panels.find(panel => isPanelFocused(panel))?.index ?? null,
        panels: panels.filter(panel => panel.active).map(panel => ({
          index: panel.index,
          id: panel.id,
          label: panel.label,
          status: panel.status,
          focused: isPanelFocused(panel),
          focusedLayout: panel.focusLayout,
          source: panel.source ? { kind: panel.source.kind, name: displayName(panel.source) } : null,
          structure: panel.structureSource ? { kind: panel.structureSource.kind, name: displayName(panel.structureSource) } : null
        }))
      })
    });

    emitStateChange('ready');
    window.dispatchEvent(new CustomEvent('evosupplement:multi-structure-ready'));

    if (directView && !directView.found) {
      setTimeout(() => showToast(`No structure with id "${directView.id}" was found in the configuration.`, 'error'), 80);
      return;
    }
    if (directView?.found) {
      setTimeout(() => {
        if (!hostedFilesReady()) {
          showToast(`The structure "${directView.id}" does not have a MOLX source.`, 'error');
          return;
        }
        enterFallbackFocus(panels[0]);
        loadHostedFiles();
      }, 80);
      return;
    }
    if (config.autoLoad && hostedFilesReady()) setTimeout(loadHostedFiles, 80);
  }

  init();
})();
