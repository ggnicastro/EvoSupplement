(() => {
  'use strict';

  const VERSION = '2.1.0';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const VIEW_ZOOM_SLIDER_STEPS = 3000;
  const GROUP_SENTINEL = '__clade_groups__';

  const DEFAULT_IDS = {
    appTitle: 'appTitle',
    appSubtitle: 'appSubtitle',
    paperHeader: 'paperHeader',
    paperTitle: 'paperTitleEl',
    figureTitle: 'figureTitleEl',
    includeInput: 'phyInclude',
    excludeInput: 'phyExclude',
    includeClear: 'phyIncludeClear',
    excludeClear: 'phyExcludeClear',
    status: 'phyStatus',
    previousMatch: 'phyPreviousMatch',
    nextMatch: 'phyNextMatch',
    colorBy: 'phyColorBy',
    layoutUnrooted: 'phyLayoutUnrooted',
    layoutRadial: 'phyLayoutRadial',
    layoutRectangular: 'phyLayoutRectangular',
    useBranchLengths: 'phyUseBranchLengths',
    alignLabels: 'phyAlignLabels',
    branchScale: 'phyBranchScale',
    branchScaleValue: 'phyBranchScaleValue',
    tipSpacing: 'phyTipSpacing',
    tipSpacingValue: 'phyTipSpacingValue',
    viewZoom: 'phyViewZoom',
    viewZoomValue: 'phyViewZoomValue',
    fitTree: 'phyFitTree',
    fitAll: 'phyFitAll',
    reroot: 'phyReroot',
    restoreRoot: 'phyRestoreRoot',
    rerootBar: 'phyRerootBar',
    rerootMessage: 'phyRerootMessage',
    rerootConfirm: 'phyRerootConfirm',
    rerootCancel: 'phyRerootCancel',
    resetView: 'phyResetView',
    legendWrap: 'phyLegendWrap',
    legend: 'phyLegend',
    viewport: 'phyViewport',
    svg: 'phySvg',
    overlay: 'phyOverlay',
    overlaySpinner: 'phyOverlaySpinner',
    overlayTitle: 'phyOverlayTitle',
    overlayDetail: 'phyOverlayDetail',
    tooltip: 'phyTooltip',
    sourceSummary: 'phySourceSummary',
    downloadTree: 'phyDownloadTree',
    downloadAnnotations: 'phyDownloadAnnotations',
    downloadCuration: 'phyDownloadCuration',
    error: 'phyError'
  };

  const DEFAULT_CONFIG = {
    title: 'Phylogeny Viewer',
    subtitle: 'Interactive Newick phylogeny',
    paperTitle: '',
    figureTitle: '',
    authoring: false,
    autoLoad: true,
    treeUrl: '',
    annotationUrl: '',
    curationUrl: '',
    idColumn: '',
    delimiter: '\t',
    defaultColorBy: '',
    defaultLayout: 'unrooted',
    defaultUseBranchLengths: true,
    defaultAlignLabels: true,
    defaultBranchScale: 1,
    defaultTipSpacing: 22,
    defaultFitMode: 'all',
    defaultViewZoom: 1,
    defaultTipLabelTemplate: '{tip}',
    defaultSupportDisplay: 'circle',
    defaultSupportColor: '#172033',
    defaultSupportSize: 5,
    defaultSupportNumberSize: 9,
    colorColumn: 'color',
    colorTargetColumn: '',
    hiddenColorColumns: [],
    tooltipColumns: [],
    columnLabels: {},
    filterAliases: {},
    includePlaceholder: 'Include by identifier or annotation…',
    excludePlaceholder: 'Exclude by identifier or annotation…',
    minTipSpacing: 10,
    maxTipSpacing: 48,
    minBranchScale: 0.15,
    maxBranchScale: 4,
    minViewZoom: 0.1,
    maxViewZoom: 100,
    blankColor: '#b7c0cc',
    neutralColor: '#7d8999',
    maxFileBytes: 32 * 1024 * 1024,
    maxTips: 10000,
    maxLegendItems: 40,
    showDownloads: true
  };

  const state = {
    initialized: false,
    ids: null,
    config: null,
    els: {},
    tree: null,
    table: null,
    sources: null,
    curationSource: null,
    refs: new Map(),
    edgeRefs: new Map(),
    layout: null,
    layoutMode: 'unrooted',
    useBranchLengths: true,
    fitMode: 'all',
    viewZoom: 1,
    displayScale: 1,
    rootEdgeId: null,
    rerootMode: 'idle',
    rerootPreviewEdgeId: null,
    rerootHoverEdgeId: null,
    colorColumn: '',
    colorScale: null,
    includeTerms: [],
    excludeTerms: [],
    activeFilter: false,
    matchingLeaves: [],
    matchCursor: -1,
    hoveredUid: null,
    pinnedUid: null,
    selectedNodeUid: null,
    selectedEdgeId: null,
    selectedSideUid: null,
    markedSupports: new Map(),
    supportDisplay: 'circle',
    supportColor: '#172033',
    supportSize: 5,
    supportNumberSize: 9,
    groups: [],
    tipLabelTemplate: '{tip}',
    objectUrls: [],
    renderToken: 0,
    resizeObserver: null,
    renderTimer: null,
    currentLoadToken: null,
    lastViewportWidth: 0,
    lastViewportHeight: 0,
    configuredTooltipColumns: [],
    pan: { active: false, pointerId: null, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0, moved: false },
    suppressNextClick: false
  };

  function clean(value) {
    return String(value ?? '').trim();
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeKey(value) {
    return clean(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function humanize(value) {
    const text = clean(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
    return text ? text.replace(/\b\w/g, char => char.toUpperCase()) : '';
  }

  function basename(path) {
    const value = String(path ?? '').split(/[?#]/)[0];
    return value.split('/').filter(Boolean).pop() || 'file';
  }

  function formatInteger(value) {
    return Number(value || 0).toLocaleString('en-US');
  }

  function formatPercent(part, total) {
    if (!total) return '0%';
    const value = (part / total) * 100;
    if (value === 0 || value === 100) return `${value.toFixed(0)}%`;
    return `${value.toFixed(1)}%`;
  }

  function formatNumeric(value) {
    if (!Number.isFinite(value)) return '';
    if (Number.isInteger(value)) return String(value);
    return Number(value.toPrecision(6)).toString();
  }

  function validCssColor(value) {
    if (!clean(value)) return false;
    const probe = document.createElement('span');
    probe.style.color = '';
    probe.style.color = value;
    return Boolean(probe.style.color);
  }

  function stableHash(value, seed = 2166136261) {
    let hash = seed >>> 0;
    const text = String(value ?? '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
  }

  function hashHex(value) {
    return (value >>> 0).toString(16).padStart(8, '0');
  }

  function svgElement(tag, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) {
      if (value != null) element.setAttribute(name, String(value));
    }
    return element;
  }

  function debounce(callback, wait) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => callback(...args), wait);
    };
  }

  function getElement(id, required = true) {
    if (!id) return null;
    const element = document.getElementById(id);
    if (!element && required) throw new Error(`Missing required page element #${id}.`);
    return element;
  }

  function resolveElements(ids) {
    const optional = new Set([
      'paperHeader', 'paperTitle', 'figureTitle', 'previousMatch', 'nextMatch',
      'layoutUnrooted', 'layoutRadial', 'layoutRectangular', 'useBranchLengths',
      'viewZoom', 'viewZoomValue', 'fitTree', 'fitAll', 'reroot', 'restoreRoot',
      'rerootBar', 'rerootMessage', 'rerootConfirm', 'rerootCancel',
      'legendWrap', 'legend', 'overlay', 'overlaySpinner', 'overlayTitle',
      'overlayDetail', 'sourceSummary', 'downloadTree', 'downloadAnnotations',
      'downloadCuration', 'error'
    ]);
    const elements = {};
    for (const [key, id] of Object.entries(ids)) elements[key] = getElement(id, !optional.has(key));
    return elements;
  }

  function normalizeLayoutMode(value) {
    const key = normalizeKey(value);
    if (key === 'radial' || key === 'radial_rooted') return 'radial';
    if (key === 'rooted' || key === 'rectangular' || key === 'cladogram' || key === 'phylogram') return 'rectangular';
    return 'unrooted';
  }

  function normalizeSupportDisplay(value) {
    return normalizeKey(value) === 'number' ? 'number' : 'circle';
  }

  function normalizeConfig(input) {
    const config = { ...DEFAULT_CONFIG, ...(input || {}) };
    config.columnLabels = { ...DEFAULT_CONFIG.columnLabels, ...(input?.columnLabels || {}) };
    config.filterAliases = { ...DEFAULT_CONFIG.filterAliases, ...(input?.filterAliases || {}) };
    config.hiddenColorColumns = Array.isArray(config.hiddenColorColumns) ? config.hiddenColorColumns : [];
    config.tooltipColumns = Array.isArray(config.tooltipColumns) ? config.tooltipColumns : [];
    config.defaultLayout = normalizeLayoutMode(config.defaultLayout);
    config.defaultUseBranchLengths = config.defaultUseBranchLengths !== false;
    config.defaultAlignLabels = config.defaultAlignLabels !== false;
    config.defaultBranchScale = clamp(Number(config.defaultBranchScale) || 1, Number(config.minBranchScale) || 0.15, Number(config.maxBranchScale) || 4);
    config.defaultTipSpacing = clamp(Number(config.defaultTipSpacing) || 22, Number(config.minTipSpacing) || 10, Number(config.maxTipSpacing) || 48);
    config.defaultFitMode = normalizeKey(config.defaultFitMode) === 'tree' ? 'tree' : 'all';
    config.minViewZoom = Math.max(0.0001, Number(config.minViewZoom) || DEFAULT_CONFIG.minViewZoom);
    config.maxViewZoom = Math.max(config.minViewZoom, Number(config.maxViewZoom) || DEFAULT_CONFIG.maxViewZoom);
    config.defaultViewZoom = clamp(Number(config.defaultViewZoom) || 1, config.minViewZoom, config.maxViewZoom);
    config.defaultSupportDisplay = normalizeSupportDisplay(config.defaultSupportDisplay);
    config.defaultSupportColor = validCssColor(config.defaultSupportColor) ? config.defaultSupportColor : DEFAULT_CONFIG.defaultSupportColor;
    config.defaultSupportSize = clamp(Number(config.defaultSupportSize) || 5, 2, 20);
    config.defaultSupportNumberSize = clamp(Number(config.defaultSupportNumberSize) || 9, 6, 24);
    config.defaultTipLabelTemplate = clean(config.defaultTipLabelTemplate) || '{tip}';
    config.maxFileBytes = Math.max(1024, Number(config.maxFileBytes) || DEFAULT_CONFIG.maxFileBytes);
    config.maxTips = Math.max(1, Number(config.maxTips) || DEFAULT_CONFIG.maxTips);
    config.maxLegendItems = Math.max(4, Number(config.maxLegendItems) || DEFAULT_CONFIG.maxLegendItems);
    return config;
  }

  function viewZoomBounds() {
    return { minimum: state.config.minViewZoom, maximum: state.config.maxViewZoom };
  }

  function viewZoomToSliderValue(zoom) {
    const { minimum, maximum } = viewZoomBounds();
    if (maximum <= minimum) return 0;
    const safeZoom = clamp(Number(zoom) || minimum, minimum, maximum);
    const fraction = (Math.log(safeZoom) - Math.log(minimum)) / (Math.log(maximum) - Math.log(minimum));
    return Math.round(clamp(fraction, 0, 1) * VIEW_ZOOM_SLIDER_STEPS);
  }

  function sliderValueToViewZoom(value) {
    const { minimum, maximum } = viewZoomBounds();
    if (maximum <= minimum) return minimum;
    const fraction = clamp((Number(value) || 0) / VIEW_ZOOM_SLIDER_STEPS, 0, 1);
    return Math.exp(Math.log(minimum) + fraction * (Math.log(maximum) - Math.log(minimum)));
  }

  function syncViewZoomControl() {
    const input = state.els.viewZoom;
    if (!input) return;
    input.min = '0';
    input.max = String(VIEW_ZOOM_SLIDER_STEPS);
    input.step = '1';
    input.value = String(viewZoomToSliderValue(state.viewZoom));
  }

  function setStatus(text) {
    if (state.els.status) state.els.status.textContent = text;
  }

  function showOverlay(mode, title, detail) {
    if (!state.els.overlay) return;
    state.els.overlay.hidden = false;
    state.els.overlay.dataset.mode = mode;
    if (state.els.overlaySpinner) state.els.overlaySpinner.hidden = mode !== 'loading';
    if (state.els.overlayTitle) state.els.overlayTitle.textContent = title;
    if (state.els.overlayDetail) state.els.overlayDetail.textContent = detail;
  }

  function hideOverlay() {
    if (state.els.overlay) state.els.overlay.hidden = true;
  }

  function clearError() {
    if (!state.els.error) return;
    state.els.error.hidden = true;
    state.els.error.textContent = '';
  }

  function showError(error) {
    const message = error instanceof Error ? error.message : String(error);
    if (state.els.error) {
      state.els.error.textContent = message;
      state.els.error.hidden = false;
    }
    showOverlay('error', 'Could not load the phylogeny', message);
    setStatus('Load failed');
    console.error(error);
  }

  function dispatch(name, detail = {}) {
    document.dispatchEvent(new CustomEvent(`phylogeny:${name}`, { detail }));
  }

  function revokeObjectUrls() {
    for (const url of state.objectUrls) URL.revokeObjectURL(url);
    state.objectUrls = [];
  }

  function readFileAsText(file, maxBytes) {
    if (file.size > maxBytes) return Promise.reject(new Error(`${file.name} exceeds the configured ${(maxBytes / 1048576).toFixed(0)} MB limit.`));
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ text: String(reader.result ?? ''), name: file.name || 'local file', source: file, local: true });
      reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}.`));
      reader.readAsText(file);
    });
  }

  async function fetchText(url, label, maxBytes) {
    let response;
    try {
      response = await fetch(url, { cache: 'no-store' });
    } catch (error) {
      const hint = location.protocol === 'file:' ? '\n\nServe the repository over HTTP, for example: python3 -m http.server 8000' : '';
      throw new Error(`Could not load ${label} (${url}).${hint}`);
    }
    if (!response.ok) throw new Error(`${label}: HTTP ${response.status} while loading ${url}.`);
    const blob = await response.blob();
    if (blob.size > maxBytes) throw new Error(`${label} exceeds the configured ${(maxBytes / 1048576).toFixed(0)} MB limit.`);
    return { text: await blob.text(), name: basename(url), source: url, local: false };
  }

  function readSource(source, label, optional = false) {
    if (source instanceof File || (typeof Blob !== 'undefined' && source instanceof Blob)) return readFileAsText(source, state.config.maxFileBytes);
    if (typeof source === 'string' && clean(source)) return fetchText(source, label, state.config.maxFileBytes);
    if (optional) return Promise.resolve(null);
    return Promise.reject(new Error(`${label} was not provided.`));
  }

  function aggregateLeaf(name) {
    const a = stableHash(name, 2166136261);
    const b = stableHash(name, 3335557771);
    return { count: 1, xorA: a, xorB: b, sumA: a, sumB: b };
  }

  function aggregateAdd(first, second) {
    return {
      count: first.count + second.count,
      xorA: (first.xorA ^ second.xorA) >>> 0,
      xorB: (first.xorB ^ second.xorB) >>> 0,
      sumA: (first.sumA + second.sumA) >>> 0,
      sumB: (first.sumB + second.sumB) >>> 0
    };
  }

  function aggregateSubtract(total, part) {
    return {
      count: total.count - part.count,
      xorA: (total.xorA ^ part.xorA) >>> 0,
      xorB: (total.xorB ^ part.xorB) >>> 0,
      sumA: (total.sumA - part.sumA) >>> 0,
      sumB: (total.sumB - part.sumB) >>> 0
    };
  }

  function aggregateToken(value) {
    return `${value.count}:${hashHex(value.xorA)}:${hashHex(value.sumA)}:${hashHex(value.xorB)}:${hashHex(value.sumB)}`;
  }

  function canonicalSplitSignature(descendant, total) {
    const complement = aggregateSubtract(total, descendant);
    let selected = descendant;
    if (complement.count < descendant.count) selected = complement;
    else if (complement.count === descendant.count && aggregateToken(complement) < aggregateToken(descendant)) selected = complement;
    return `split:${aggregateToken(selected)}`;
  }

  function parseNewick(sourceText) {
    const text = String(sourceText ?? '').replace(/^\uFEFF/, '').trim();
    if (!text) throw new Error('The Newick tree is empty.');
    let position = 0;
    let nextUid = 0;

    function fail(message) {
      const start = Math.max(0, position - 28);
      const end = Math.min(text.length, position + 28);
      throw new Error(`${message} near character ${position + 1}: “${text.slice(start, end).replace(/\s+/g, ' ')}”.`);
    }

    function skip() {
      while (position < text.length) {
        if (/\s/.test(text[position])) { position += 1; continue; }
        if (text[position] === '[') {
          let depth = 1;
          position += 1;
          while (position < text.length && depth > 0) {
            if (text[position] === '[') depth += 1;
            else if (text[position] === ']') depth -= 1;
            position += 1;
          }
          if (depth) fail('Unterminated Newick comment');
          continue;
        }
        break;
      }
    }

    function label() {
      skip();
      if (position >= text.length) return '';
      const quote = text[position] === "'" || text[position] === '"' ? text[position] : null;
      if (quote) {
        position += 1;
        let value = '';
        while (position < text.length) {
          const char = text[position];
          if (char === quote) {
            if (text[position + 1] === quote) { value += quote; position += 2; continue; }
            position += 1;
            return value;
          }
          if (char === '\\' && position + 1 < text.length) { value += text[position + 1]; position += 2; continue; }
          value += char;
          position += 1;
        }
        fail('Unterminated quoted Newick label');
      }
      const start = position;
      while (position < text.length && !'(),:;[]'.includes(text[position])) position += 1;
      return text.slice(start, position).trim();
    }

    function length() {
      skip();
      if (text[position] !== ':') return null;
      position += 1;
      skip();
      const start = position;
      while (position < text.length && !',);['.includes(text[position]) && !/\s/.test(text[position])) position += 1;
      const token = text.slice(start, position);
      const value = Number(token);
      if (!token || !Number.isFinite(value)) fail(`Invalid branch length “${token}”`);
      return value;
    }

    function subtree(parent) {
      skip();
      const node = {
        uid: nextUid++, name: '', length: null, children: [], parent,
        depth: 0, distance: 0, leafIndex: -1, descendantLeaves: 0,
        matchCount: 0, filterMatch: true, x: 0, y: 0,
        annotation: null, hasAnnotation: false, searchFields: {}, searchAll: '',
        aggregate: null, displayLabel: ''
      };
      if (text[position] === '(') {
        position += 1;
        while (true) {
          node.children.push(subtree(node));
          skip();
          if (text[position] === ',') { position += 1; continue; }
          if (text[position] === ')') { position += 1; break; }
          fail('Expected a comma or closing parenthesis');
        }
        node.name = label();
      } else {
        node.name = label();
        if (!node.name) fail('A tree tip is missing its label');
      }
      node.length = length();
      skip();
      return node;
    }

    const root = subtree(null);
    skip();
    if (text[position] === ';') position += 1;
    skip();
    if (position !== text.length) fail('Unexpected content after the Newick tree');

    const nodes = [];
    const leaves = [];
    const nodeByUid = new Map();
    let maxDepth = 0;
    let maxDistance = 0;
    let hasPositiveBranchLengths = false;
    let negativeBranchLengths = 0;
    let supportNodes = 0;

    function visit(node, depth, distance) {
      node.depth = depth;
      const rawLength = node.parent && Number.isFinite(node.length) ? node.length : 0;
      if (rawLength > 0) hasPositiveBranchLengths = true;
      if (rawLength < 0) negativeBranchLengths += 1;
      node.distance = distance + Math.max(0, rawLength);
      maxDepth = Math.max(maxDepth, depth);
      maxDistance = Math.max(maxDistance, node.distance);
      nodes.push(node);
      nodeByUid.set(node.uid, node);
      if (!node.children.length) {
        node.leafIndex = leaves.length;
        node.descendantLeaves = 1;
        node.aggregate = aggregateLeaf(node.name);
        leaves.push(node);
      } else {
        let aggregate = { count: 0, xorA: 0, xorB: 0, sumA: 0, sumB: 0 };
        for (const child of node.children) {
          visit(child, depth + 1, node.distance);
          aggregate = aggregateAdd(aggregate, child.aggregate);
        }
        node.descendantLeaves = aggregate.count;
        node.aggregate = aggregate;
        if (node.name && Number.isFinite(Number(node.name))) supportNodes += 1;
      }
    }
    visit(root, 0, 0);

    if (!leaves.length) throw new Error('The Newick tree contains no labeled tips.');
    if (leaves.length > state.config.maxTips) throw new Error(`The tree contains ${formatInteger(leaves.length)} tips, exceeding the configured limit of ${formatInteger(state.config.maxTips)}.`);
    const seen = new Set();
    const duplicates = [];
    for (const leaf of leaves) {
      if (seen.has(leaf.name)) duplicates.push(leaf.name);
      seen.add(leaf.name);
    }
    if (duplicates.length) throw new Error(`Tip identifiers must be unique. Duplicate labels include: ${[...new Set(duplicates)].slice(0, 10).join(', ')}`);

    const edges = [];
    const edgeById = new Map();
    const edgeByChildUid = new Map();
    const edgeBySignature = new Map();
    const adjacency = new Map(nodes.map(node => [node.uid, []]));
    const neighborOrder = new Map();
    for (const node of nodes) {
      neighborOrder.set(node.uid, [...(node.parent ? [node.parent.uid] : []), ...node.children.map(child => child.uid)]);
      if (!node.parent) continue;
      const edge = {
        id: `edge-${node.uid}`,
        aUid: node.parent.uid,
        bUid: node.uid,
        length: Number.isFinite(node.length) ? node.length : null,
        label: node.children.length ? node.name : '',
        labelNodeUid: node.uid,
        baseSignature: canonicalSplitSignature(node.aggregate, root.aggregate),
        sourceSideToken: aggregateToken(node.aggregate),
        signature: ''
      };
      edges.push(edge);
      edgeById.set(edge.id, edge);
      edgeByChildUid.set(node.uid, edge);
      adjacency.get(edge.aUid).push({ nodeUid: edge.bUid, edge });
      adjacency.get(edge.bUid).push({ nodeUid: edge.aUid, edge });
    }

    // A degree-two source root creates two distinct source edges that encode the
    // same unrooted bipartition. Keep the canonical split as the stable identity
    // for ordinary edges, but add the source-side aggregate when a split occurs
    // more than once so support labels, lengths, groups, and saved roots do not
    // silently collapse onto a single root-adjacent edge.
    const signatureCounts = new Map();
    for (const edge of edges) signatureCounts.set(edge.baseSignature, (signatureCounts.get(edge.baseSignature) || 0) + 1);
    for (const edge of edges) {
      edge.signature = signatureCounts.get(edge.baseSignature) > 1
        ? `${edge.baseSignature}:source:${edge.sourceSideToken}`
        : edge.baseSignature;
      edgeBySignature.set(edge.signature, edge);
      delete edge.baseSignature;
      delete edge.sourceSideToken;
    }

    return {
      root, originalRootUid: root.uid, nodes, leaves,
      leafUidSet: new Set(leaves.map(leaf => leaf.uid)), nodeByUid,
      maxDepth, maxDistance, hasPositiveBranchLengths, negativeBranchLengths,
      supportNodes, edges, edgeById, edgeByChildUid, edgeBySignature,
      adjacency, neighborOrder, totalAggregate: root.aggregate
    };
  }

  function parseDelimited(text, delimiter) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const source = String(text ?? '').replace(/^\uFEFF/, '');
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (char === '"') {
          if (source[index + 1] === '"') { cell += '"'; index += 1; }
          else quoted = false;
        } else cell += char;
        continue;
      }
      if (char === '"' && cell === '') quoted = true;
      else if (char === delimiter) { row.push(cell); cell = ''; }
      else if (char === '\n' || char === '\r') {
        if (char === '\r' && source[index + 1] === '\n') index += 1;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += char;
    }
    if (quoted) throw new Error('The annotation table contains an unterminated quoted field.');
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function createEmptyTable(idColumn = 'id') {
    const aliases = new Map([['id', idColumn], ['tip', idColumn], ['tip_id', idColumn], [normalizeKey(idColumn), idColumn]]);
    return { headers: [idColumn], rows: [], byId: new Map(), idColumn, numericColumns: new Set(), aliases, extraCellRows: 0, empty: true };
  }

  function parseAnnotationTable(sourceText, requestedIdColumn = state.config.idColumn) {
    const delimiter = String(state.config.delimiter || '\t');
    if (delimiter.length !== 1) throw new Error('The annotation delimiter must be a single character.');
    const matrix = parseDelimited(sourceText, delimiter).filter(row => row.some(cell => clean(cell) !== ''));
    if (!matrix.length) throw new Error('The annotation table is empty.');
    const headers = matrix[0].map((header, index) => clean(header) || `column_${index + 1}`);
    const normalizedHeaders = headers.map(normalizeKey);
    const duplicateHeaders = headers.filter((header, index) => normalizedHeaders.indexOf(normalizeKey(header)) !== index);
    if (duplicateHeaders.length) throw new Error(`Annotation column names must be unique. Duplicate columns include: ${[...new Set(duplicateHeaders)].join(', ')}`);

    const candidates = [requestedIdColumn, 'id', 'tip_id', 'tip', 'name', 'accession', 'sequence_id', 'sequence']
      .filter(Boolean).map(normalizeKey);
    let idColumn = '';
    for (const candidate of candidates) {
      const index = normalizedHeaders.indexOf(candidate);
      if (index >= 0) { idColumn = headers[index]; break; }
    }
    if (!idColumn) throw new Error(`Could not identify the tip identifier column. Available columns: ${headers.join(', ')}.`);

    const rows = [];
    let extraCellRows = 0;
    for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
      const cells = matrix[rowIndex];
      const record = {};
      headers.forEach((header, columnIndex) => { record[header] = cells[columnIndex] == null ? '' : clean(cells[columnIndex]); });
      if (cells.slice(headers.length).some(value => clean(value))) extraCellRows += 1;
      if (clean(record[idColumn])) rows.push(record);
    }
    const byId = new Map();
    const duplicates = [];
    for (const row of rows) {
      const id = clean(row[idColumn]);
      if (byId.has(id)) duplicates.push(id);
      else byId.set(id, row);
    }
    if (duplicates.length) throw new Error(`Annotation identifiers must be unique. Duplicate values include: ${[...new Set(duplicates)].slice(0, 10).join(', ')}`);

    const numericColumns = new Set();
    for (const header of headers) {
      if (header === idColumn) continue;
      const values = rows.map(row => clean(row[header])).filter(Boolean);
      if (values.length && values.every(value => Number.isFinite(Number(value)))) numericColumns.add(header);
    }
    const aliases = new Map();
    for (const header of headers) {
      aliases.set(clean(header).toLocaleLowerCase(), header);
      aliases.set(normalizeKey(header), header);
      const label = state.config.columnLabels[header];
      if (label) { aliases.set(clean(label).toLocaleLowerCase(), header); aliases.set(normalizeKey(label), header); }
    }
    aliases.set('id', idColumn); aliases.set('tip', idColumn); aliases.set('tip_id', idColumn);
    for (const [alias, target] of Object.entries(state.config.filterAliases || {})) {
      const resolved = headers.find(header => normalizeKey(header) === normalizeKey(target));
      if (resolved) { aliases.set(clean(alias).toLocaleLowerCase(), resolved); aliases.set(normalizeKey(alias), resolved); }
    }
    return { headers, rows, byId, idColumn, numericColumns, aliases, extraCellRows, empty: false };
  }

  function templateValue(leaf, key) {
    const normalized = normalizeKey(key);
    if (normalized === 'tip' || normalized === 'tree_id' || normalized === 'id') return leaf.name;
    const header = state.table?.headers.find(candidate => normalizeKey(candidate) === normalized);
    return header ? clean(leaf.annotation?.[header]) : '';
  }

  function displayLabelForLeaf(leaf) {
    const template = clean(state.tipLabelTemplate) || '{tip}';
    const value = template.replace(/\{([^{}]+)\}/g, (_match, key) => templateValue(leaf, key));
    return clean(value.replace(/\s+/g, ' ')) || leaf.name;
  }

  function refreshLeafLabels() {
    if (!state.tree) return;
    for (const leaf of state.tree.leaves) leaf.displayLabel = displayLabelForLeaf(leaf);
  }

  function attachAnnotations(tree, table) {
    const matchedIds = new Set();
    let annotatedTips = 0;
    for (const leaf of tree.leaves) {
      const row = table.byId.get(leaf.name) || null;
      const annotation = {};
      for (const header of table.headers) annotation[header] = row ? clean(row[header]) : '';
      annotation[table.idColumn] = leaf.name;
      leaf.annotation = annotation;
      leaf.hasAnnotation = Boolean(row);
      if (row) { annotatedTips += 1; matchedIds.add(leaf.name); }
      const searchFields = {};
      for (const header of table.headers) searchFields[header] = clean(annotation[header]).toLocaleLowerCase();
      searchFields[table.idColumn] = leaf.name.toLocaleLowerCase();
      leaf.searchFields = searchFields;
      leaf.searchAll = [leaf.name, ...table.headers.map(header => annotation[header])].filter(Boolean).join(' ').toLocaleLowerCase();
    }
    refreshLeafLabels();
    return {
      annotatedTips,
      blankTips: tree.leaves.length - annotatedTips,
      unmatchedRows: table.rows.filter(row => !matchedIds.has(clean(row[table.idColumn])))
    };
  }

  function parseSimpleYaml(text) {
    const lines = String(text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/)
      .map((raw, index) => {
        let quote = null;
        let cut = raw.length;
        for (let i = 0; i < raw.length; i += 1) {
          const char = raw[i];
          if ((char === '"' || char === "'") && raw[i - 1] !== '\\') quote = quote === char ? null : (quote || char);
          if (char === '#' && !quote && (i === 0 || /\s/.test(raw[i - 1]))) { cut = i; break; }
        }
        const value = raw.slice(0, cut).replace(/\s+$/, '');
        const match = value.match(/^(\s*)(.*)$/);
        return { indent: match[1].replace(/\t/g, '  ').length, content: match[2], line: index + 1 };
      })
      .filter(line => line.content.trim() !== '');

    function scalar(token) {
      const value = token.trim();
      if (!value) return '';
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        const inner = value.slice(1, -1);
        return value[0] === '"' ? inner.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\') : inner.replace(/''/g, "'");
      }
      if (value === 'null' || value === '~') return null;
      if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
      if (/^[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/.test(value)) return Number(value);
      if (value.startsWith('[') && value.endsWith(']')) {
        const inner = value.slice(1, -1);
        const result = [];
        let current = '';
        let quote = null;
        let depth = 0;
        for (let i = 0; i < inner.length; i += 1) {
          const char = inner[i];
          if ((char === '"' || char === "'") && inner[i - 1] !== '\\') quote = quote === char ? null : (quote || char);
          if (!quote) {
            if (char === '[' || char === '{') depth += 1;
            if (char === ']' || char === '}') depth -= 1;
            if (char === ',' && depth === 0) { result.push(scalar(current)); current = ''; continue; }
          }
          current += char;
        }
        if (current.trim()) result.push(scalar(current));
        return result;
      }
      if (value.startsWith('{') && value.endsWith('}')) {
        try { return JSON.parse(value.replace(/'/g, '"')); } catch (_error) { return value; }
      }
      return value;
    }

    function keyValue(content, lineNo) {
      let quote = null;
      for (let i = 0; i < content.length; i += 1) {
        const char = content[i];
        if ((char === '"' || char === "'") && content[i - 1] !== '\\') quote = quote === char ? null : (quote || char);
        if (char === ':' && !quote) {
          const rawKey = content.slice(0, i).trim();
          if (!rawKey) throw new Error(`Invalid YAML key on line ${lineNo}.`);
          return [String(scalar(rawKey)), content.slice(i + 1).trim()];
        }
      }
      throw new Error(`Expected a YAML key-value pair on line ${lineNo}.`);
    }

    function parseBlock(start, indent) {
      if (start >= lines.length) return [null, start];
      const isArray = lines[start].content.startsWith('-');
      const container = isArray ? [] : {};
      let index = start;
      while (index < lines.length) {
        const line = lines[index];
        if (line.indent < indent) break;
        if (line.indent > indent) throw new Error(`Unexpected YAML indentation on line ${line.line}.`);
        if (isArray) {
          if (!line.content.startsWith('-')) break;
          const rest = line.content.slice(1).trim();
          if (!rest) {
            if (index + 1 < lines.length && lines[index + 1].indent > indent) {
              const [child, next] = parseBlock(index + 1, lines[index + 1].indent);
              container.push(child); index = next; continue;
            }
            container.push(null); index += 1; continue;
          }
          if (/^[^:]+:/.test(rest)) {
            const object = {};
            const [key, rawValue] = keyValue(rest, line.line);
            if (rawValue) { object[key] = scalar(rawValue); index += 1; }
            else if (index + 1 < lines.length && lines[index + 1].indent > indent) {
              const [child, next] = parseBlock(index + 1, lines[index + 1].indent);
              object[key] = child; index = next;
            } else { object[key] = {}; index += 1; }
            while (index < lines.length && lines[index].indent > indent) {
              const childIndent = lines[index].indent;
              const [extra, next] = parseBlock(index, childIndent);
              if (Array.isArray(extra)) throw new Error(`Unexpected YAML list on line ${lines[index].line}.`);
              Object.assign(object, extra);
              index = next;
            }
            container.push(object);
            continue;
          }
          container.push(scalar(rest));
          index += 1;
          continue;
        }
        if (line.content.startsWith('-')) break;
        const [key, rawValue] = keyValue(line.content, line.line);
        if (rawValue) { container[key] = scalar(rawValue); index += 1; continue; }
        if (index + 1 < lines.length && lines[index + 1].indent > indent) {
          const [child, next] = parseBlock(index + 1, lines[index + 1].indent);
          container[key] = child;
          index = next;
        } else { container[key] = {}; index += 1; }
      }
      return [container, index];
    }

    if (!lines.length) return {};
    return parseBlock(0, lines[0].indent)[0];
  }

  function parseYamlOrJson(text) {
    const source = String(text ?? '').replace(/^\uFEFF/, '').trim();
    if (!source) return {};
    try { return JSON.parse(source); } catch (_error) { /* continue */ }
    if (window.jsyaml?.load) return window.jsyaml.load(source) || {};
    return parseSimpleYaml(source) || {};
  }

  function normalizeCuration(input = {}) {
    const layout = input.layout || {};
    const supports = input.supports || {};
    const labels = input.labels || {};
    const groups = Array.isArray(input.groups) ? input.groups : [];
    return {
      version: Number(input.version) || 1,
      title: clean(input.title),
      layout: {
        mode: normalizeLayoutMode(layout.mode || state.config.defaultLayout),
        use_branch_lengths: layout.use_branch_lengths !== false,
        align_labels: layout.align_labels !== false,
        branch_scale: clamp(Number(layout.branch_scale) || state.config.defaultBranchScale, state.config.minBranchScale, state.config.maxBranchScale),
        tip_spacing: clamp(Number(layout.tip_spacing) || state.config.defaultTipSpacing, state.config.minTipSpacing, state.config.maxTipSpacing),
        fit_mode: normalizeKey(layout.fit_mode) === 'tree' ? 'tree' : 'all',
        color_by: clean(layout.color_by || state.config.defaultColorBy)
      },
      root: input.root && clean(input.root.edge) ? { edge: clean(input.root.edge) } : null,
      supports: {
        display: normalizeSupportDisplay(supports.display || state.config.defaultSupportDisplay),
        color: validCssColor(supports.color) ? supports.color : state.config.defaultSupportColor,
        size: clamp(Number(supports.size) || state.config.defaultSupportSize, 2, 20),
        number_size: clamp(Number(supports.number_size) || state.config.defaultSupportNumberSize, 6, 24),
        marked: Array.isArray(supports.marked) ? supports.marked
          .map(item => ({
            edge: clean(item?.edge),
            value: clean(item?.value),
            color: validCssColor(item?.color) ? item.color : '',
            size: Number.isFinite(Number(item?.size)) ? clamp(Number(item.size), 2, 20) : null
          }))
          .filter(item => item.edge) : []
      },
      labels: {
        id_column: clean(labels.id_column || state.config.idColumn),
        template: clean(labels.template || state.config.defaultTipLabelTemplate) || '{tip}',
        hover_columns: Array.isArray(labels.hover_columns) ? labels.hover_columns.map(clean).filter(Boolean) : [...state.configuredTooltipColumns]
      },
      groups: groups.map((group, index) => ({
        id: clean(group?.id) || `group-${index + 1}`,
        name: clean(group?.name) || `Group ${index + 1}`,
        color: validCssColor(group?.color) ? group.color : generatedColor(clean(group?.name) || `group-${index + 1}`, index),
        edge: clean(group?.edge),
        member_tip: clean(group?.member_tip),
        show_label: Boolean(group?.show_label),
        tips: Array.isArray(group?.tips) ? group.tips.map(clean).filter(Boolean) : []
      })).filter(group => group.edge || group.tips.length)
    };
  }

  function defaultCuration() {
    return normalizeCuration({
      layout: {
        mode: state.config.defaultLayout,
        use_branch_lengths: state.config.defaultUseBranchLengths,
        align_labels: state.config.defaultAlignLabels,
        branch_scale: state.config.defaultBranchScale,
        tip_spacing: state.config.defaultTipSpacing,
        fit_mode: state.config.defaultFitMode,
        color_by: state.config.defaultColorBy
      },
      supports: {
        display: state.config.defaultSupportDisplay,
        color: state.config.defaultSupportColor,
        size: state.config.defaultSupportSize,
        number_size: state.config.defaultSupportNumberSize,
        marked: []
      },
      labels: {
        id_column: state.config.idColumn,
        template: state.config.defaultTipLabelTemplate,
        hover_columns: state.configuredTooltipColumns
      },
      groups: []
    });
  }

  function collectComponent(startUid, blockedUid) {
    const nodeUids = new Set();
    const edgeIds = new Set();
    const tipNames = [];
    const stack = [[startUid, blockedUid]];
    while (stack.length) {
      const [uid, previous] = stack.pop();
      if (nodeUids.has(uid)) continue;
      nodeUids.add(uid);
      const node = state.tree.nodeByUid.get(uid);
      if (state.tree.leafUidSet.has(uid)) tipNames.push(node.name);
      for (const entry of state.tree.adjacency.get(uid) || []) {
        if (entry.nodeUid === previous) continue;
        edgeIds.add(entry.edge.id);
        stack.push([entry.nodeUid, uid]);
      }
    }
    tipNames.sort();
    return { nodeUids, edgeIds, tipNames };
  }

  function resolveGroup(group) {
    let edge = group.edge ? state.tree.edgeBySignature.get(group.edge) : null;
    let component = null;
    if (edge) {
      const first = collectComponent(edge.aUid, edge.bUid);
      const second = collectComponent(edge.bUid, edge.aUid);
      if (group.member_tip) component = first.tipNames.includes(group.member_tip) ? first : second;
      else if (group.tips?.length) {
        const wanted = new Set(group.tips);
        const firstHits = first.tipNames.reduce((sum, tip) => sum + (wanted.has(tip) ? 1 : 0), 0);
        const secondHits = second.tipNames.reduce((sum, tip) => sum + (wanted.has(tip) ? 1 : 0), 0);
        component = firstHits >= secondHits ? first : second;
      } else component = second;
      component.edgeIds.add(edge.id);
    } else if (group.tips?.length) {
      const tipSet = new Set(group.tips.filter(tip => state.tree.leaves.some(leaf => leaf.name === tip)));
      component = { nodeUids: new Set(), edgeIds: new Set(), tipNames: [...tipSet].sort() };
      for (const leaf of state.tree.leaves) {
        if (!tipSet.has(leaf.name)) continue;
        let node = leaf;
        while (node.parent) {
          component.edgeIds.add(state.tree.edgeByChildUid.get(node.uid)?.id);
          node = node.parent;
        }
      }
    }
    if (!component) return { ...group, valid: false, tipSet: new Set(), edgeSet: new Set(), anchorUid: null };
    const tipSet = new Set(component.tipNames);
    const anchorUid = edge
      ? (tipSet.has(state.tree.nodeByUid.get(edge.aUid)?.name) || component.nodeUids.has(edge.aUid) ? edge.aUid : edge.bUid)
      : null;
    return { ...group, valid: true, tipSet, edgeSet: component.edgeIds, anchorUid, tipCount: tipSet.size };
  }

  function resolveAllGroups() {
    state.groups = state.groups.map(resolveGroup).filter(group => group.valid);
  }

  function groupForLeaf(leaf) {
    let result = null;
    for (const group of state.groups) {
      if (!group.tipSet.has(leaf.name)) continue;
      if (!result || group.tipSet.size <= result.tipSet.size) result = group;
    }
    return result;
  }

  function groupForEdge(edgeId) {
    let result = null;
    for (const group of state.groups) {
      if (!group.edgeSet.has(edgeId)) continue;
      if (!result || group.tipSet.size <= result.tipSet.size) result = group;
    }
    return result;
  }

  function edgeForNode(nodeUid) {
    if (!state.tree) return null;
    if (state.layoutMode !== 'unrooted') {
      const record = state.layout?.display?.nodeByUid.get(nodeUid);
      return record?.incomingEdge || null;
    }
    return state.tree.edgeByChildUid.get(nodeUid) || null;
  }

  function sideUidForNode(nodeUid, edge) {
    if (!edge) return null;
    if (nodeUid === edge.aUid || nodeUid === edge.bUid) return nodeUid;
    const record = state.layout?.display?.nodeByUid.get(nodeUid);
    if (record?.uid === edge.aUid || record?.uid === edge.bUid) return record.uid;
    return edge.bUid;
  }

  function firstTipInComponent(startUid, blockedUid) {
    const stack = [[startUid, blockedUid]];
    while (stack.length) {
      const [uid, previous] = stack.pop();
      const node = state.tree.nodeByUid.get(uid);
      if (state.tree.leafUidSet.has(uid)) return node.name;
      for (const entry of state.tree.adjacency.get(uid) || []) {
        if (entry.nodeUid !== previous) stack.push([entry.nodeUid, uid]);
      }
    }
    return '';
  }

  function markForEdge(edge) {
    return edge ? state.markedSupports.get(edge.signature) || null : null;
  }

  function selectNode(nodeUid) {
    const node = state.tree?.nodeByUid.get(nodeUid);
    if (!node || !node.children.length) {
      state.selectedNodeUid = null;
      state.selectedEdgeId = null;
      state.selectedSideUid = null;
      dispatchStateChange();
      return;
    }
    const edge = edgeForNode(nodeUid);
    state.selectedNodeUid = nodeUid;
    state.selectedEdgeId = edge?.id || null;
    state.selectedSideUid = sideUidForNode(nodeUid, edge);
    dispatch('selection', selectionSummary());
    dispatchStateChange();
  }

  function selectionSummary() {
    const node = state.selectedNodeUid == null ? null : state.tree?.nodeByUid.get(state.selectedNodeUid);
    const edge = state.selectedEdgeId ? state.tree?.edgeById.get(state.selectedEdgeId) : null;
    if (!node || !edge) return { selected: false };
    const displayRecord = state.layoutMode === 'unrooted' ? null : state.layout?.display?.nodeByUid.get(node.uid);
    const support = clean(edge.label || node.name);
    const sideUid = state.selectedSideUid || edge.bUid;
    const blocked = sideUid === edge.aUid ? edge.bUid : edge.aUid;
    const component = collectComponent(sideUid, blocked);
    return {
      selected: true,
      nodeUid: node.uid,
      edgeId: edge.id,
      edgeSignature: edge.signature,
      support,
      marked: state.markedSupports.has(edge.signature),
      descendantTips: displayRecord?.descendantLeaves || component.tipNames.length,
      memberTip: component.tipNames[0] || '',
      tipCount: component.tipNames.length
    };
  }

  function tokenizeFilter(input) {
    const tokens = [];
    let current = '';
    let quote = null;
    for (const char of clean(input)) {
      if (char === '"' || char === "'") {
        if (quote === char) quote = null;
        else if (!quote) quote = char;
        else current += char;
      } else if (/\s/.test(char) && !quote) {
        if (current) tokens.push(current);
        current = '';
      } else current += char;
    }
    if (current) tokens.push(current);
    return tokens;
  }

  function resolveField(candidate) {
    if (!state.table) return null;
    return state.table.aliases.get(clean(candidate).toLocaleLowerCase()) || state.table.aliases.get(normalizeKey(candidate)) || null;
  }

  function parseNumericExpression(value) {
    const text = clean(value);
    const range = text.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))\.\.(-?(?:\d+(?:\.\d+)?|\.\d+))$/);
    if (range) return { type: 'range', min: Math.min(Number(range[1]), Number(range[2])), max: Math.max(Number(range[1]), Number(range[2])) };
    const comparison = text.match(/^(<=|>=|<|>|=)?\s*(-?(?:\d+(?:\.\d+)?|\.\d+))$/);
    return comparison ? { type: 'comparison', operator: comparison[1] || '=', value: Number(comparison[2]) } : null;
  }

  function compileFilter(input) {
    const terms = [];
    for (const rawToken of tokenizeFilter(input)) {
      let token = rawToken;
      let field = null;
      const colon = token.indexOf(':');
      if (colon > 0) {
        const resolved = resolveField(token.slice(0, colon));
        if (resolved) { field = resolved; token = token.slice(colon + 1); }
      } else {
        const direct = token.match(/^([^<>=:]+)(<=|>=|<|>|=)(.+)$/);
        if (direct) {
          const resolved = resolveField(direct[1]);
          if (resolved) { field = resolved; token = `${direct[2]}${direct[3]}`; }
        }
      }
      const value = clean(token);
      if (!value) continue;
      terms.push({ field, lower: value.toLocaleLowerCase(), numeric: field && state.table.numericColumns.has(field) ? parseNumericExpression(value) : null });
    }
    return terms;
  }

  function matchesNumeric(value, expression) {
    const number = Number(value);
    if (!Number.isFinite(number)) return false;
    if (expression.type === 'range') return number >= expression.min && number <= expression.max;
    if (expression.operator === '<') return number < expression.value;
    if (expression.operator === '<=') return number <= expression.value;
    if (expression.operator === '>') return number > expression.value;
    if (expression.operator === '>=') return number >= expression.value;
    return number === expression.value;
  }

  function leafMatchesTerm(leaf, term) {
    if (!term.field) return leaf.searchAll.includes(term.lower);
    const value = leaf.annotation?.[term.field] ?? '';
    return term.numeric ? matchesNumeric(value, term.numeric) : clean(value).toLocaleLowerCase().includes(term.lower);
  }

  function updateNodeMatchCounts(node) {
    if (!node.children.length) { node.matchCount = node.filterMatch ? 1 : 0; return node.matchCount; }
    node.matchCount = node.children.reduce((sum, child) => sum + updateNodeMatchCounts(child), 0);
    return node.matchCount;
  }

  function updateFilters() {
    if (!state.tree) return;
    const includeValue = state.els.includeInput?.value || '';
    const excludeValue = state.els.excludeInput?.value || '';
    state.includeTerms = compileFilter(includeValue);
    state.excludeTerms = compileFilter(excludeValue);
    state.activeFilter = Boolean(clean(includeValue) || clean(excludeValue));
    state.matchingLeaves = [];
    for (const leaf of state.tree.leaves) {
      const included = state.includeTerms.every(term => leafMatchesTerm(leaf, term));
      const excluded = state.excludeTerms.some(term => leafMatchesTerm(leaf, term));
      leaf.filterMatch = included && !excluded;
      if (leaf.filterMatch) state.matchingLeaves.push(leaf);
    }
    updateNodeMatchCounts(state.tree.root);
    state.matchCursor = -1;
    if (state.els.includeClear) state.els.includeClear.hidden = !clean(includeValue);
    if (state.els.excludeClear) state.els.excludeClear.hidden = !clean(excludeValue);
    state.els.svg.classList.toggle('has-filter', state.activeFilter);
    updateStatus();
    updateMatchNavigation();
    applyVisualState();
  }

  function updateStatus() {
    if (!state.tree) return;
    if (state.activeFilter) setStatus(`${formatInteger(state.matchingLeaves.length)} of ${formatInteger(state.tree.leaves.length)} tips highlighted (${formatPercent(state.matchingLeaves.length, state.tree.leaves.length)})`);
    else setStatus(`${formatInteger(state.tree.leaves.length)} tips · ${formatInteger(state.table?.rows.length || 0)} annotation rows`);
  }

  function updateMatchNavigation() {
    const disabled = !state.activeFilter || !state.matchingLeaves.length;
    if (state.els.previousMatch) state.els.previousMatch.disabled = disabled;
    if (state.els.nextMatch) state.els.nextMatch.disabled = disabled;
  }

  const COLOR_PALETTE = ['#4f8fd9','#d55d68','#4d9f79','#b56ac4','#e09245','#5aa7a7','#9a6d91','#6f9d52','#7c83d4','#9e8f3f','#b0724a','#71859a'];

  function generatedColor(value, index = 0) {
    const hash = stableHash(value || String(index));
    return COLOR_PALETTE[(hash + index) % COLOR_PALETTE.length];
  }

  function numericColor(value, min, max) {
    const fraction = max === min ? 0.5 : clamp((Number(value) - min) / (max - min), 0, 1);
    const hue = 215 - (190 * fraction);
    return `hsl(${hue} 68% 54%)`;
  }

  function buildColorScale(column) {
    if (!column) return { type: 'none' };
    if (column === GROUP_SENTINEL) {
      return { type: 'groups', groups: [...state.groups].sort((a, b) => b.tipSet.size - a.tipSet.size) };
    }
    if (!state.table?.headers.includes(column)) return { type: 'none' };
    const nonblank = state.tree.leaves.map(leaf => clean(leaf.annotation?.[column])).filter(Boolean);
    if (state.table.numericColumns.has(column) && nonblank.length) {
      const values = nonblank.map(Number);
      const min = Math.min(...values);
      const max = Math.max(...values);
      return { type: 'numeric', column, min, max, color: value => numericColor(value, min, max) };
    }
    const counts = new Map();
    for (const value of nonblank) counts.set(value, (counts.get(value) || 0) + 1);
    const colors = new Map();
    const explicitColorColumn = state.config.colorColumn;
    const targetMatches = !state.config.colorTargetColumn || normalizeKey(state.config.colorTargetColumn) === normalizeKey(column);
    let index = 0;
    for (const value of counts.keys()) {
      let color = '';
      if (targetMatches && explicitColorColumn && state.table.headers.includes(explicitColorColumn)) {
        const row = state.tree.leaves.find(leaf => clean(leaf.annotation?.[column]) === value && validCssColor(leaf.annotation?.[explicitColorColumn]));
        color = row ? leafColorFromRow(row, explicitColorColumn) : '';
      }
      colors.set(value, color || generatedColor(value, index++));
    }
    return { type: 'categorical', column, counts, colors, color: value => colors.get(value) || state.config.blankColor };
  }

  function leafColorFromRow(leaf, colorColumn) {
    const value = clean(leaf.annotation?.[colorColumn]);
    return validCssColor(value) ? value : '';
  }

  function colorForLeaf(leaf) {
    if (state.colorScale?.type === 'groups') return groupForLeaf(leaf)?.color || state.config.blankColor;
    if (!state.colorScale || state.colorScale.type === 'none') return state.config.neutralColor;
    const value = leaf.annotation?.[state.colorScale.column] ?? '';
    if (!clean(value)) return state.config.blankColor;
    return state.colorScale.color(value);
  }

  function createLegendItem(label, color, count) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.background = color;
    const text = document.createElement('span');
    text.textContent = label;
    const number = document.createElement('span');
    number.className = 'legend-count';
    number.textContent = `(${formatInteger(count)})`;
    item.append(swatch, text, number);
    return item;
  }

  function renderLegend() {
    const { legend, legendWrap } = state.els;
    if (!legend) return;
    legend.textContent = '';
    if (!state.colorScale || state.colorScale.type === 'none') {
      if (legendWrap) legendWrap.hidden = true;
      return;
    }
    if (legendWrap) legendWrap.hidden = false;
    if (state.colorScale.type === 'groups') {
      for (const group of state.colorScale.groups.slice(0, state.config.maxLegendItems)) legend.appendChild(createLegendItem(group.name, group.color, group.tipSet.size));
      return;
    }
    if (state.colorScale.type === 'numeric') {
      const low = document.createElement('span'); low.className = 'legend-item'; low.textContent = formatNumeric(state.colorScale.min);
      const gradient = document.createElement('span'); gradient.className = 'legend-gradient'; gradient.style.background = `linear-gradient(90deg, ${numericColor(state.colorScale.min, state.colorScale.min, state.colorScale.max)}, ${numericColor(state.colorScale.max, state.colorScale.min, state.colorScale.max)})`;
      const high = document.createElement('span'); high.className = 'legend-item'; high.textContent = formatNumeric(state.colorScale.max);
      legend.append(low, gradient, high);
      return;
    }
    const entries = [...state.colorScale.colors.entries()];
    for (const [value, color] of entries.slice(0, state.config.maxLegendItems)) legend.appendChild(createLegendItem(value, color, state.colorScale.counts.get(value) || 0));
  }

  function populateColorSelector() {
    const select = state.els.colorBy;
    if (!select) return;
    select.textContent = '';
    const none = document.createElement('option'); none.value = ''; none.textContent = 'None'; select.appendChild(none);
    if (state.groups.length) {
      const option = document.createElement('option'); option.value = GROUP_SENTINEL; option.textContent = 'Clade groups'; select.appendChild(option);
    }
    const hidden = new Set([state.table.idColumn, state.config.colorColumn, ...state.config.hiddenColorColumns].filter(Boolean));
    for (const header of state.table.headers) {
      if (hidden.has(header)) continue;
      const option = document.createElement('option'); option.value = header; option.textContent = state.config.columnLabels[header] || humanize(header); select.appendChild(option);
    }
    const requested = state.colorColumn || clean(state.config.defaultColorBy);
    let resolved = '';
    if (normalizeKey(requested) === 'groups' || requested === GROUP_SENTINEL) resolved = state.groups.length ? GROUP_SENTINEL : '';
    else resolved = state.table.headers.find(header => normalizeKey(header) === normalizeKey(requested)) || '';
    select.value = resolved;
    state.colorColumn = resolved;
    updateColoring(false);
  }

  function updateColoring(dispatchChange = true) {
    if (!state.tree) return;
    state.colorColumn = state.els.colorBy?.value || state.colorColumn || '';
    state.colorScale = buildColorScale(state.colorColumn);
    renderLegend();
    applyVisualState();
    if (dispatchChange) dispatchStateChange();
  }

  function updateLayoutControls() {
    const map = [
      [state.els.layoutUnrooted, 'unrooted'],
      [state.els.layoutRadial, 'radial'],
      [state.els.layoutRectangular, 'rectangular']
    ];
    for (const [button, mode] of map) {
      if (!button) continue;
      const active = state.layoutMode === mode;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-active', active);
    }
    if (state.els.useBranchLengths) state.els.useBranchLengths.checked = state.useBranchLengths;
  }

  function updateFitControls() {
    if (state.els.fitTree) {
      const active = state.fitMode === 'tree';
      state.els.fitTree.classList.toggle('is-active', active);
      state.els.fitTree.setAttribute('aria-pressed', String(active));
    }
    if (state.els.fitAll) {
      const active = state.fitMode === 'all';
      state.els.fitAll.classList.toggle('is-active', active);
      state.els.fitAll.setAttribute('aria-pressed', String(active));
    }
  }

  function updateRangeOutputs() {
    if (state.els.branchScaleValue) state.els.branchScaleValue.textContent = `${Math.round(Number(state.els.branchScale.value) * 100)}%`;
    if (state.els.tipSpacingValue) state.els.tipSpacingValue.textContent = `${Number(state.els.tipSpacing.value)} px`;
    if (state.els.viewZoomValue) {
      const percent = state.viewZoom * 100;
      state.els.viewZoomValue.textContent = `${percent >= 1000 ? Math.round(percent).toLocaleString('en-US') : Math.round(percent)}%`;
    }
  }

  function setLayoutMode(mode, options = {}) {
    const next = normalizeLayoutMode(mode);
    const changed = next !== state.layoutMode;
    state.layoutMode = next;
    updateLayoutControls();
    if (state.tree && (changed || options.force)) {
      unpinTooltip();
      renderTree(Boolean(options.preserveScroll));
      dispatchStateChange();
    }
    return state.layoutMode;
  }

  function setUseBranchLengths(enabled, options = {}) {
    state.useBranchLengths = Boolean(enabled);
    updateLayoutControls();
    if (state.tree && options.render !== false) renderTree(options.preserveScroll !== false);
    dispatchStateChange();
  }

  function setFitMode(mode, options = {}) {
    state.fitMode = normalizeKey(mode) === 'tree' ? 'tree' : 'all';
    if (options.resetZoom !== false) { state.viewZoom = 1; syncViewZoomControl(); }
    updateFitControls();
    updateRangeOutputs();
    if (state.tree && state.layout) applyViewScale(Boolean(options.preserveCenter));
    dispatchStateChange();
  }

  function setViewZoomFromSlider(value, preserveCenter = true) {
    state.viewZoom = sliderValueToViewZoom(value);
    syncViewZoomControl();
    updateRangeOutputs();
    if (state.tree && state.layout) applyViewScale(preserveCenter);
  }

  function zoomAtViewportPoint(clientX, clientY, factor) {
    if (!state.tree || !state.layout || !(state.displayScale > 0)) return;
    const viewport = state.els.viewport;
    const rect = viewport.getBoundingClientRect();
    const viewportX = clientX - rect.left;
    const viewportY = clientY - rect.top;
    const marginLeft = Number.parseFloat(state.els.svg.style.marginLeft) || 0;
    const marginTop = Number.parseFloat(state.els.svg.style.marginTop) || 0;
    const anchor = {
      x: (viewport.scrollLeft + viewportX - marginLeft) / state.displayScale,
      y: (viewport.scrollTop + viewportY - marginTop) / state.displayScale,
      viewportX,
      viewportY
    };
    const next = clamp(state.viewZoom * factor, state.config.minViewZoom, state.config.maxViewZoom);
    if (Math.abs(next - state.viewZoom) < 1e-8) return;
    state.viewZoom = next;
    syncViewZoomControl();
    updateRangeOutputs();
    applyViewScale(false, null, anchor);
  }

  function handleViewportWheel(event) {
    if (!state.tree || !state.layout || !event.deltaY) return;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.25 && !event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? state.els.viewport.clientHeight : 1;
    const delta = event.deltaY * unit;
    const factor = clamp(Math.exp(-delta * 0.0015), 0.72, 1.38);
    zoomAtViewportPoint(event.clientX, event.clientY, factor);
  }

  function panTargetIsInteractive(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('[data-node-id], [data-edge-id], button, input, select, a'));
  }

  function beginViewportPan(event) {
    if (!state.tree || state.rerootMode !== 'idle') return;
    const middleButton = event.button === 1;
    if (event.button !== 0 && !middleButton) return;
    if (!middleButton && panTargetIsInteractive(event.target)) return;
    event.preventDefault();
    const viewport = state.els.viewport;
    state.pan.active = true;
    state.pan.pointerId = event.pointerId;
    state.pan.startX = event.clientX;
    state.pan.startY = event.clientY;
    state.pan.scrollLeft = viewport.scrollLeft;
    state.pan.scrollTop = viewport.scrollTop;
    state.pan.moved = false;
    viewport.classList.add('is-panning');
    viewport.setPointerCapture?.(event.pointerId);
    if (state.pinnedUid == null) {
      state.hoveredUid = null;
      state.els.tooltip.hidden = true;
      applyVisualState();
    }
  }

  function moveViewportPan(event) {
    if (!state.pan.active || event.pointerId !== state.pan.pointerId) return;
    const dx = event.clientX - state.pan.startX;
    const dy = event.clientY - state.pan.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) state.pan.moved = true;
    state.els.viewport.scrollLeft = state.pan.scrollLeft - dx;
    state.els.viewport.scrollTop = state.pan.scrollTop - dy;
  }

  function endViewportPan(event) {
    if (!state.pan.active || (event.pointerId != null && event.pointerId !== state.pan.pointerId)) return;
    const viewport = state.els.viewport;
    const pointerId = state.pan.pointerId;
    const moved = state.pan.moved;
    state.pan.active = false;
    state.pan.pointerId = null;
    state.pan.moved = false;
    viewport.classList.remove('is-panning');
    if (moved) {
      state.suppressNextClick = true;
      setTimeout(() => { state.suppressNextClick = false; }, 0);
    }
    try { viewport.releasePointerCapture?.(pointerId); } catch (_) { /* already released */ }
  }

  function updateRerootUi() {
    const selecting = state.rerootMode !== 'idle';
    const hasPreview = Boolean(state.rerootPreviewEdgeId);
    if (state.els.reroot) {
      state.els.reroot.classList.toggle('is-active', selecting);
      state.els.reroot.setAttribute('aria-pressed', String(selecting));
      state.els.reroot.textContent = selecting ? 'Choosing branch…' : 'Reroot';
    }
    if (state.els.restoreRoot) state.els.restoreRoot.disabled = !state.rootEdgeId;
    if (state.els.rerootBar) state.els.rerootBar.hidden = !selecting;
    if (state.els.rerootConfirm) state.els.rerootConfirm.disabled = !hasPreview;
    if (state.els.rerootMessage) state.els.rerootMessage.textContent = hasPreview
      ? 'Branch selected. Confirm to place the saved root at its midpoint.'
      : 'Select the branch leading to the outgroup. The source Newick file will not be changed.';
    if (state.els.svg) state.els.svg.classList.toggle('is-rerooting', selecting);
  }

  function beginReroot() {
    if (!state.tree) return;
    state.rerootMode = 'selecting';
    state.rerootPreviewEdgeId = null;
    state.rerootHoverEdgeId = null;
    unpinTooltip();
    updateRerootUi();
    applyRerootVisualState();
  }

  function cancelReroot() {
    state.rerootMode = 'idle';
    state.rerootPreviewEdgeId = null;
    state.rerootHoverEdgeId = null;
    updateRerootUi();
    applyRerootVisualState();
  }

  function chooseRerootEdge(edgeId) {
    if (state.rerootMode === 'idle' || !state.tree?.edgeById.has(edgeId)) return;
    state.rerootPreviewEdgeId = edgeId;
    state.rerootMode = 'preview';
    updateRerootUi();
    applyRerootVisualState();
  }

  function confirmReroot() {
    if (!state.rerootPreviewEdgeId || !state.tree?.edgeById.has(state.rerootPreviewEdgeId)) return;
    state.rootEdgeId = state.rerootPreviewEdgeId;
    state.rerootMode = 'idle';
    state.rerootPreviewEdgeId = null;
    state.rerootHoverEdgeId = null;
    state.layoutMode = 'rectangular';
    state.fitMode = 'all';
    state.viewZoom = 1;
    syncViewZoomControl();
    updateLayoutControls();
    updateFitControls();
    updateRangeOutputs();
    updateRerootUi();
    renderTree(false);
    dispatchStateChange();
  }

  function restoreOriginalRoot() {
    if (!state.tree) return;
    state.rootEdgeId = null;
    state.rerootMode = 'idle';
    state.rerootPreviewEdgeId = null;
    state.rerootHoverEdgeId = null;
    state.layoutMode = 'rectangular';
    state.fitMode = 'all';
    state.viewZoom = 1;
    syncViewZoomControl();
    updateLayoutControls();
    updateFitControls();
    updateRangeOutputs();
    updateRerootUi();
    renderTree(false);
    dispatchStateChange();
  }

  function orderedGraphNeighborEntries(nodeUid, incomingUid = null) {
    const order = state.tree.neighborOrder.get(nodeUid) || [];
    const adjacency = state.tree.adjacency.get(nodeUid) || [];
    const byUid = new Map(adjacency.map(entry => [entry.nodeUid, entry]));
    if (incomingUid == null) return order.map(uid => byUid.get(uid)).filter(Boolean);
    const incomingIndex = order.indexOf(incomingUid);
    if (incomingIndex < 0) return order.filter(uid => uid !== incomingUid).map(uid => byUid.get(uid)).filter(Boolean);
    const result = [];
    for (let offset = 1; offset < order.length; offset += 1) {
      const entry = byUid.get(order[(incomingIndex + offset) % order.length]);
      if (entry) result.push(entry);
    }
    return result;
  }

  function componentMinLeafIndex(startUid, blockedUid) {
    let minimum = Number.POSITIVE_INFINITY;
    const stack = [[startUid, blockedUid]];
    while (stack.length) {
      const [uid, previous] = stack.pop();
      const node = state.tree.nodeByUid.get(uid);
      if (state.tree.leafUidSet.has(uid)) minimum = Math.min(minimum, node.leafIndex);
      for (const entry of state.tree.adjacency.get(uid) || []) if (entry.nodeUid !== previous) stack.push([entry.nodeUid, uid]);
    }
    return minimum;
  }

  function buildRootedDisplay() {
    const records = [];
    const nodeByUid = new Map();
    let maxDepth = 0;
    let maxDistance = 0;

    function buildNode(nodeUid, incomingUid, parent, incomingEdge, lengthOverride = null) {
      const node = state.tree.nodeByUid.get(nodeUid);
      const length = lengthOverride == null ? (Number.isFinite(incomingEdge?.length) ? incomingEdge.length : 0) : lengthOverride;
      const record = {
        uid: node.uid, node, synthetic: false, parent, children: [], incomingEdge, length,
        depth: parent ? parent.depth + 1 : 0,
        distance: parent ? parent.distance + Math.max(0, length) : 0,
        descendantLeaves: 0, matchCount: 0, minOriginalLeafIndex: Number.POSITIVE_INFINITY,
        x: 0, y: 0, angle: 0
      };
      records.push(record);
      nodeByUid.set(node.uid, record);
      maxDepth = Math.max(maxDepth, record.depth);
      maxDistance = Math.max(maxDistance, record.distance);
      for (const entry of orderedGraphNeighborEntries(nodeUid, incomingUid)) record.children.push(buildNode(entry.nodeUid, nodeUid, record, entry.edge));
      if (!record.children.length) {
        record.descendantLeaves = 1;
        record.minOriginalLeafIndex = node.leafIndex;
        record.matchCount = node.filterMatch ? 1 : 0;
      } else {
        record.descendantLeaves = record.children.reduce((sum, child) => sum + child.descendantLeaves, 0);
        record.minOriginalLeafIndex = Math.min(...record.children.map(child => child.minOriginalLeafIndex));
        record.matchCount = record.children.reduce((sum, child) => sum + child.matchCount, 0);
      }
      return record;
    }

    let root;
    const selectedEdge = state.rootEdgeId ? state.tree.edgeById.get(state.rootEdgeId) : null;
    if (selectedEdge) {
      root = {
        uid: '__reroot_midpoint__', node: null, synthetic: true, parent: null, children: [], incomingEdge: null,
        length: 0, depth: 0, distance: 0, descendantLeaves: state.tree.leaves.length,
        matchCount: state.matchingLeaves.length, minOriginalLeafIndex: 0, x: 0, y: 0, angle: 0
      };
      records.push(root); nodeByUid.set(root.uid, root);
      const halfLength = Number.isFinite(selectedEdge.length) ? selectedEdge.length / 2 : 0;
      const sides = [
        { uid: selectedEdge.aUid, blocked: selectedEdge.bUid, min: componentMinLeafIndex(selectedEdge.aUid, selectedEdge.bUid) },
        { uid: selectedEdge.bUid, blocked: selectedEdge.aUid, min: componentMinLeafIndex(selectedEdge.bUid, selectedEdge.aUid) }
      ].sort((a, b) => a.min - b.min);
      for (const side of sides) root.children.push(buildNode(side.uid, side.blocked, root, selectedEdge, halfLength));
      root.matchCount = root.children.reduce((sum, child) => sum + child.matchCount, 0);
    } else root = buildNode(state.tree.originalRootUid, null, null, null, 0);

    const leaves = [];
    (function collect(record) {
      if (!record.children.length) { leaves.push(record); return; }
      for (const child of record.children) collect(child);
    })(root);
    leaves.forEach((leaf, index) => { leaf.displayLeafIndex = index; });
    return {
      root, nodes: records, leaves, nodeByUid, maxDepth, maxDistance,
      useLengths: state.useBranchLengths && state.tree.hasPositiveBranchLengths && maxDistance > 0,
      selectedEdgeId: selectedEdge?.id || null
    };
  }

  function refreshRootedDisplayMatchCounts() {
    const display = state.layout?.display;
    if (!display) return;
    (function visit(record) {
      if (!record.children.length) { record.matchCount = record.node?.filterMatch ? 1 : 0; return record.matchCount; }
      record.matchCount = record.children.reduce((sum, child) => sum + visit(child), 0);
      return record.matchCount;
    })(display.root);
  }

  function estimateLabelWidth() {
    const maxLength = state.tree.leaves.reduce((max, leaf) => Math.max(max, (leaf.displayLabel || leaf.name).length), 0);
    return clamp(maxLength * 7.2 + 18, 130, 560);
  }

  function labelWidthForLeaf(leaf) {
    return clamp((leaf.displayLabel || leaf.name).length * 7.2 + 6, 24, 560);
  }

  function layoutRectangularTree() {
    const spacing = Number(state.els.tipSpacing.value);
    const branchScale = Number(state.els.branchScale.value);
    const viewportWidth = Math.max(720, state.els.viewport.clientWidth || 720);
    const labelWidth = estimateLabelWidth();
    const left = 28;
    const top = 26;
    const bottom = 30;
    const labelGap = 12;
    const baseBranchWidth = Math.max(500, viewportWidth - labelWidth - left - 74);
    const branchWidth = baseBranchWidth * branchScale;
    const display = buildRootedDisplay();
    const denominator = display.useLengths ? display.maxDistance : Math.max(1, display.maxDepth);
    for (const leaf of display.leaves) leaf.y = top + leaf.displayLeafIndex * spacing;
    (function place(record) {
      const metric = display.useLengths ? record.distance : record.depth;
      record.x = left + (metric / denominator) * branchWidth;
      if (record.children.length) {
        for (const child of record.children) place(child);
        record.y = record.children.reduce((sum, child) => sum + child.y, 0) / record.children.length;
      }
      if (record.node) { record.node.x = record.x; record.node.y = record.y; }
    })(display.root);
    const aligned = state.els.alignLabels.checked;
    const alignedLabelX = left + branchWidth + labelGap;
    let width = alignedLabelX + labelWidth + 24;
    if (!aligned) width = Math.max(viewportWidth, ...display.leaves.map(leaf => leaf.x + labelWidthForLeaf(leaf.node) + 24));
    const height = top + bottom + Math.max(0, display.leaves.length - 1) * spacing;
    const treeXs = display.nodes.map(record => record.x);
    const treeYs = display.nodes.map(record => record.y);
    return {
      mode: 'rectangular', spacing, width: Math.ceil(width), height: Math.ceil(height), aligned,
      alignedLabelX, labelGap, useLengths: display.useLengths, display,
      treeBounds: { minX: Math.min(...treeXs) - 10, maxX: Math.max(...treeXs) + 10, minY: Math.min(...treeYs) - 12, maxY: Math.max(...treeYs) + 12 },
      fullBounds: { minX: 0, minY: 0, maxX: Math.ceil(width), maxY: Math.ceil(height) }
    };
  }

  function includeBounds(bounds, x, y) {
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxY = Math.max(bounds.maxY, y);
  }

  function includeRotatedLabelBounds(bounds, leaf) {
    const width = leaf._labelWidth;
    const halfHeight = 7;
    const startX = leaf._labelAnchor === 'start' ? 0 : -width;
    const endX = leaf._labelAnchor === 'start' ? width : 0;
    const angle = leaf._labelRotation * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const [localX, localY] of [[startX,-halfHeight],[startX,halfHeight],[endX,-halfHeight],[endX,halfHeight]]) {
      includeBounds(bounds, leaf._labelXRaw + localX * cos - localY * sin, leaf._labelYRaw + localX * sin + localY * cos);
    }
  }

  function finalizeRadialBounds(nodes, leaves, viewportWidth, viewportHeight) {
    const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (const node of nodes) includeBounds(bounds, node._xRaw, node._yRaw);
    for (const leaf of leaves) includeRotatedLabelBounds(bounds, leaf);
    const margin = 36;
    const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
    const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
    const width = Math.max(viewportWidth, Math.ceil(contentWidth + margin * 2));
    const height = Math.max(viewportHeight, Math.ceil(contentHeight + margin * 2));
    const shiftX = margin - bounds.minX + Math.max(0, width - contentWidth - margin * 2) / 2;
    const shiftY = margin - bounds.minY + Math.max(0, height - contentHeight - margin * 2) / 2;
    for (const node of nodes) { node.x = node._xRaw + shiftX; node.y = node._yRaw + shiftY; }
    for (const leaf of leaves) {
      leaf._labelX = leaf._labelXRaw + shiftX;
      leaf._labelY = leaf._labelYRaw + shiftY;
      leaf._connectorX = leaf._connectorXRaw + shiftX;
      leaf._connectorY = leaf._connectorYRaw + shiftY;
    }
    const treeXs = nodes.map(node => node.x);
    const treeYs = nodes.map(node => node.y);
    return {
      width, height, shiftX, shiftY,
      treeBounds: { minX: Math.min(...treeXs) - 12, maxX: Math.max(...treeXs) + 12, minY: Math.min(...treeYs) - 12, maxY: Math.max(...treeYs) + 12 },
      fullBounds: { minX: 0, minY: 0, maxX: width, maxY: height }
    };
  }

  function layoutRadialTree() {
    const spacing = Number(state.els.tipSpacing.value);
    const branchScale = Number(state.els.branchScale.value);
    const viewportWidth = Math.max(520, state.els.viewport.clientWidth || 720);
    const viewportHeight = Math.max(420, state.els.viewport.clientHeight || 520);
    const display = buildRootedDisplay();
    const denominator = display.useLengths ? display.maxDistance : Math.max(1, display.maxDepth);
    const baseRadius = Math.max(280, display.leaves.length * spacing / (2 * Math.PI), Math.min(760, Math.max(viewportWidth, viewportHeight) * 0.38));
    const branchRadius = baseRadius * branchScale;
    const startAngle = -Math.PI / 2;
    for (const leaf of display.leaves) {
      leaf._angleIndex = leaf.displayLeafIndex;
      leaf.angle = startAngle + (Math.PI * 2 * leaf.displayLeafIndex / Math.max(1, display.leaves.length));
    }
    (function assign(record) {
      if (record.children.length) {
        for (const child of record.children) assign(child);
        record._angleIndex = record.children.reduce((sum, child) => sum + child._angleIndex * child.descendantLeaves, 0) / record.descendantLeaves;
        record.angle = startAngle + (Math.PI * 2 * record._angleIndex / Math.max(1, display.leaves.length));
      }
      const metric = display.useLengths ? record.distance : record.depth;
      const radius = denominator ? metric / denominator * branchRadius : 0;
      record.radius = radius;
      record._xRaw = Math.cos(record.angle) * radius;
      record._yRaw = Math.sin(record.angle) * radius;
      if (record.node) { record.node._xRaw = record._xRaw; record.node._yRaw = record._yRaw; }
    })(display.root);
    const aligned = state.els.alignLabels.checked;
    const maxRadius = Math.max(...display.leaves.map(leaf => Math.hypot(leaf._xRaw, leaf._yRaw)), 1);
    const labelRadius = maxRadius + Math.max(18, spacing * 0.75);
    for (const leafRecord of display.leaves) {
      const leaf = leafRecord.node;
      const radius = Math.hypot(leafRecord._xRaw, leafRecord._yRaw);
      const angle = leafRecord.angle;
      const target = aligned ? labelRadius : radius + Math.max(11, spacing * 0.55);
      const connectorRadius = Math.max(radius, target - 5);
      const degrees = angle * 180 / Math.PI;
      const flipped = Math.cos(angle) < 0;
      leafRecord._labelXRaw = Math.cos(angle) * target;
      leafRecord._labelYRaw = Math.sin(angle) * target;
      leafRecord._connectorXRaw = Math.cos(angle) * connectorRadius;
      leafRecord._connectorYRaw = Math.sin(angle) * connectorRadius;
      leafRecord._labelRotation = flipped ? degrees + 180 : degrees;
      leafRecord._labelAnchor = flipped ? 'end' : 'start';
      leafRecord._labelWidth = labelWidthForLeaf(leaf);
    }
    const bounds = finalizeRadialBounds(display.nodes, display.leaves, viewportWidth, viewportHeight);
    return { mode: 'radial', spacing, aligned, display, useLengths: display.useLengths, centerX: bounds.shiftX, centerY: bounds.shiftY, ...bounds };
  }

  function graphNeighbors(node) {
    return node.parent ? [node.parent, ...node.children] : [...node.children];
  }

  function findUnrootedCenter() {
    const totalTips = state.tree.leaves.length;
    let best = state.tree.root;
    let bestLargest = Infinity;
    for (const node of state.tree.nodes) {
      const neighbors = graphNeighbors(node);
      if (neighbors.length < 2) continue;
      let largest = node.parent ? totalTips - node.descendantLeaves : 0;
      for (const child of node.children) largest = Math.max(largest, child.descendantLeaves);
      if (largest < bestLargest) { best = node; bestLargest = largest; }
    }
    return best;
  }

  function orderedUnrootedChildren(node, incoming) {
    const cycle = graphNeighbors(node);
    if (!incoming) return cycle.slice();
    const index = cycle.indexOf(incoming);
    if (index < 0) return cycle.filter(neighbor => neighbor !== incoming);
    const ordered = [];
    for (let offset = 1; offset < cycle.length; offset += 1) ordered.push(cycle[(index + offset) % cycle.length]);
    return ordered;
  }

  function sourceEdgeLength(first, second, useLengths) {
    if (!useLengths) return 1;
    const child = second.parent === first ? second : (first.parent === second ? first : null);
    return child && Number.isFinite(child.length) ? Math.max(0, child.length) : 0;
  }

  function layoutUnrootedTree() {
    const spacing = Number(state.els.tipSpacing.value);
    const branchScale = Number(state.els.branchScale.value);
    const viewportWidth = Math.max(520, state.els.viewport.clientWidth || 720);
    const viewportHeight = Math.max(420, state.els.viewport.clientHeight || 520);
    const useLengths = state.useBranchLengths && state.tree.hasPositiveBranchLengths && state.tree.maxDistance > 0;
    const centerNode = findUnrootedCenter();
    const displayChildren = new Map();
    const tipCounts = new Map();
    (function orient(node, incoming) {
      const children = orderedUnrootedChildren(node, incoming);
      displayChildren.set(node.uid, children);
      for (const child of children) orient(child, node);
    })(centerNode, null);
    (function count(node) {
      const children = displayChildren.get(node.uid) || [];
      if (!children.length) { tipCounts.set(node.uid, 1); return 1; }
      const total = children.reduce((sum, child) => sum + count(child), 0);
      tipCounts.set(node.uid, total);
      return total;
    })(centerNode);
    centerNode._xRaw = 0; centerNode._yRaw = 0;
    (function place(node, start, end) {
      const children = displayChildren.get(node.uid) || [];
      if (!children.length) return;
      const total = children.reduce((sum, child) => sum + (tipCounts.get(child.uid) || 1), 0);
      let cursor = start;
      for (const child of children) {
        const span = (end - start) * ((tipCounts.get(child.uid) || 1) / total);
        const angle = cursor + span / 2;
        const length = sourceEdgeLength(node, child, useLengths);
        child._xRaw = node._xRaw + Math.cos(angle) * length;
        child._yRaw = node._yRaw + Math.sin(angle) * length;
        child._unrootedAngle = angle;
        place(child, cursor, cursor + span);
        cursor += span;
      }
    })(centerNode, -Math.PI / 2, Math.PI * 3 / 2);
    let maxRaw = Math.max(...state.tree.nodes.map(node => Math.hypot(node._xRaw || 0, node._yRaw || 0)), 1);
    const targetRadius = Math.max(300, state.tree.leaves.length * spacing / (2 * Math.PI), Math.min(720, Math.max(viewportWidth, viewportHeight) * 0.38)) * branchScale;
    const coordinateScale = targetRadius / maxRaw;
    for (const node of state.tree.nodes) { node._xRaw *= coordinateScale; node._yRaw *= coordinateScale; }
    const aligned = state.els.alignLabels.checked;
    const maxRadius = Math.max(...state.tree.leaves.map(leaf => Math.hypot(leaf._xRaw, leaf._yRaw)), 1);
    const labelRadius = maxRadius + Math.max(16, spacing * 0.72);
    for (const leaf of state.tree.leaves) {
      const radius = Math.hypot(leaf._xRaw, leaf._yRaw);
      const angle = radius > 1e-8 ? Math.atan2(leaf._yRaw, leaf._xRaw) : leaf._unrootedAngle;
      const target = aligned ? labelRadius : radius + Math.max(10, spacing * 0.55);
      const connectorRadius = Math.max(radius, target - 5);
      const degrees = angle * 180 / Math.PI;
      const flipped = Math.cos(angle) < 0;
      leaf._labelXRaw = Math.cos(angle) * target;
      leaf._labelYRaw = Math.sin(angle) * target;
      leaf._connectorXRaw = Math.cos(angle) * connectorRadius;
      leaf._connectorYRaw = Math.sin(angle) * connectorRadius;
      leaf._labelRotation = flipped ? degrees + 180 : degrees;
      leaf._labelAnchor = flipped ? 'end' : 'start';
      leaf._labelWidth = labelWidthForLeaf(leaf);
    }
    const bounds = finalizeRadialBounds(state.tree.nodes, state.tree.leaves, viewportWidth, viewportHeight);
    return { mode: 'unrooted', spacing, aligned, centerUid: centerNode.uid, useLengths, ...bounds };
  }

  function getEdgeRefs(edgeId) {
    if (!edgeId) return null;
    if (!state.edgeRefs.has(edgeId)) state.edgeRefs.set(edgeId, { lines: [], hits: [], supportTexts: [], supportCircles: [] });
    return state.edgeRefs.get(edgeId);
  }

  function registerEdgeElement(edgeId, kind, element) {
    const refs = getEdgeRefs(edgeId);
    if (refs && element) refs[kind].push(element);
  }

  function createEdgeHit(edge, x1, y1, x2, y2) {
    return svgElement('line', { x1, y1, x2, y2, class: 'phylo-edge-hit', 'data-edge-id': edge.id, 'aria-label': 'Tree branch' });
  }

  function createEdgePathHit(edge, d) {
    return svgElement('path', { d, class: 'phylo-edge-hit', 'data-edge-id': edge.id, 'aria-label': 'Tree branch' });
  }

  function normalizedAngleDelta(from, to) {
    let delta = (to - from) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  }

  function radialBranchPath(record, layout) {
    const parent = record.parent;
    if (!parent) return '';
    const parentRadius = Math.max(0, Number(parent.radius) || 0);
    if (parentRadius < 0.001) return `M ${parent.x} ${parent.y} L ${record.x} ${record.y}`;
    const delta = normalizedAngleDelta(parent.angle, record.angle);
    const arcX = layout.centerX + Math.cos(record.angle) * parentRadius;
    const arcY = layout.centerY + Math.sin(record.angle) * parentRadius;
    const sweep = delta >= 0 ? 1 : 0;
    return `M ${parent.x} ${parent.y} A ${parentRadius} ${parentRadius} 0 0 ${sweep} ${arcX} ${arcY} L ${record.x} ${record.y}`;
  }

  function addSupportObjects(edge, textX, textY, circleX, circleY, supportLayer) {
    if (!edge?.label) return;
    const text = svgElement('text', { x: textX, y: textY, class: 'phylo-support-label', 'data-support-edge': edge.id });
    text.textContent = edge.label;
    const circle = svgElement('circle', { cx: circleX, cy: circleY, r: state.supportSize, class: 'phylo-support-circle', 'data-support-edge': edge.id });
    supportLayer.append(circle, text);
    registerEdgeElement(edge.id, 'supportTexts', text);
    registerEdgeElement(edge.id, 'supportCircles', circle);
  }

  function addTipElements(leaf, x, y, labelX, labelY, labelTransform, labelAnchor, spacing, connector, tipLayer, hitLayer) {
    const refs = state.refs.get(leaf.uid) || {};
    if (connector) {
      const line = svgElement('line', { x1: connector.x1, y1: connector.y1, x2: connector.x2, y2: connector.y2, class: `phylo-connector ${connector.radial ? 'phylo-radial-connector' : ''}` });
      tipLayer.parentNode?.insertBefore(line, tipLayer);
      refs.connector = line;
    }
    const dot = svgElement('circle', { cx: x, cy: y, r: 3.2, class: 'phylo-tip-dot' });
    const labelAttributes = { x: labelTransform ? 0 : labelX, y: labelTransform ? 0 : labelY, class: `phylo-tip-label ${labelTransform ? 'phylo-radial-label' : ''}` };
    if (labelTransform) labelAttributes.transform = labelTransform;
    if (labelAnchor) labelAttributes['text-anchor'] = labelAnchor;
    const label = svgElement('text', labelAttributes);
    label.textContent = leaf.displayLabel || leaf.name;
    tipLayer.append(dot, label);
    refs.dot = dot; refs.label = label;

    if (labelTransform) {
      const dotHit = svgElement('circle', { cx: x, cy: y, r: 8, class: 'phylo-tip-hit', 'data-node-id': leaf.uid, 'data-node-kind': 'tip', 'aria-label': leaf.displayLabel || leaf.name });
      const hitHeight = Math.max(14, Math.min(30, spacing * 0.9));
      const width = labelWidthForLeaf(leaf);
      const hitX = labelAnchor === 'start' ? -5 : -width - 5;
      const labelHit = svgElement('rect', { x: hitX, y: -hitHeight / 2, width: width + 10, height: hitHeight, transform: labelTransform, class: 'phylo-tip-hit', 'data-node-id': leaf.uid, 'data-node-kind': 'tip', 'aria-label': leaf.displayLabel || leaf.name });
      hitLayer.append(dotHit, labelHit);
      refs.hit = labelHit;
    } else {
      const width = Math.max(30, labelWidthForLeaf(leaf) + Math.abs(labelX - x) + 16);
      const hit = svgElement('rect', { x: Math.min(x - 7, labelX - 4), y: y - spacing / 2, width, height: spacing, class: 'phylo-tip-hit', 'data-node-id': leaf.uid, 'data-node-kind': 'tip', 'aria-label': leaf.displayLabel || leaf.name });
      hitLayer.appendChild(hit);
      refs.hit = hit;
    }
    state.refs.set(leaf.uid, refs);
  }

  function renderRectangularTree(branchLayer, connectorLayer, supportLayer, tipLayer, hitLayer, layout) {
    const display = layout.display;
    const renderedSupport = new Set();
    for (const record of display.nodes) {
      const refs = state.refs.get(record.uid) || {};
      if (record.children.length) {
        const firstY = Math.min(...record.children.map(child => child.y));
        const lastY = Math.max(...record.children.map(child => child.y));
        const vertical = svgElement('line', { x1: record.x, y1: firstY, x2: record.x, y2: lastY, class: 'phylo-branch phylo-vertical-branch' });
        branchLayer.appendChild(vertical);
        refs.vertical = vertical;
      }
      if (record.parent && record.incomingEdge) {
        const horizontal = svgElement('line', { x1: record.parent.x, y1: record.y, x2: record.x, y2: record.y, class: `phylo-branch ${record.children.length ? 'phylo-internal-branch' : 'phylo-tip-branch'}` });
        branchLayer.appendChild(horizontal); refs.horizontal = horizontal;
        registerEdgeElement(record.incomingEdge.id, 'lines', horizontal);
        const hit = createEdgeHit(record.incomingEdge, record.parent.x, record.y, record.x, record.y);
        hitLayer.appendChild(hit); registerEdgeElement(record.incomingEdge.id, 'hits', hit);
        if (record.incomingEdge.label && !renderedSupport.has(record.incomingEdge.id)) {
          addSupportObjects(record.incomingEdge, (record.parent.x + record.x) / 2 + 3, record.y - 5, record.x, record.y, supportLayer);
          renderedSupport.add(record.incomingEdge.id);
        }
      }
      if (record.synthetic) {
        const marker = svgElement('circle', { cx: record.x, cy: record.y, r: 4.2, class: 'phylo-root-marker' });
        tipLayer.appendChild(marker); refs.rootMarker = marker;
      } else if (record.children.length && record.parent) {
        const hit = svgElement('circle', { cx: record.x, cy: record.y, r: 8, class: 'phylo-node-hit', 'data-node-id': record.node.uid, 'data-node-kind': 'internal' });
        hitLayer.appendChild(hit); refs.hit = hit;
      }
      state.refs.set(record.uid, refs);
    }
    for (const leafRecord of display.leaves) {
      const leaf = leafRecord.node;
      const labelX = layout.aligned ? layout.alignedLabelX : leafRecord.x + 9;
      const connector = layout.aligned && labelX - leafRecord.x > 8 ? { x1: leafRecord.x + 4, y1: leafRecord.y, x2: labelX - 4, y2: leafRecord.y } : null;
      addTipElements(leaf, leafRecord.x, leafRecord.y, labelX, leafRecord.y, null, null, layout.spacing, connector, tipLayer, hitLayer);
    }
  }

  function renderRadialTree(branchLayer, supportLayer, tipLayer, hitLayer, layout) {
    const renderedSupport = new Set();
    for (const record of layout.display.nodes) {
      const refs = state.refs.get(record.uid) || {};
      if (record.parent && record.incomingEdge) {
        const d = radialBranchPath(record, layout);
        const branch = svgElement('path', { d, class: `phylo-branch phylo-radial-branch ${record.children.length ? 'phylo-internal-branch' : 'phylo-tip-branch'}` });
        branchLayer.appendChild(branch); refs.horizontal = branch;
        registerEdgeElement(record.incomingEdge.id, 'lines', branch);
        const hit = createEdgePathHit(record.incomingEdge, d);
        hitLayer.appendChild(hit); registerEdgeElement(record.incomingEdge.id, 'hits', hit);
        if (record.incomingEdge.label && !renderedSupport.has(record.incomingEdge.id)) {
          addSupportObjects(record.incomingEdge, record.x + 4, record.y - 4, record.x, record.y, supportLayer);
          renderedSupport.add(record.incomingEdge.id);
        }
      }
      if (record.synthetic) {
        const marker = svgElement('circle', { cx: record.x, cy: record.y, r: 4.2, class: 'phylo-root-marker' });
        tipLayer.appendChild(marker); refs.rootMarker = marker;
      } else if (record.children.length && record.parent) {
        const hit = svgElement('circle', { cx: record.x, cy: record.y, r: 8, class: 'phylo-node-hit', 'data-node-id': record.node.uid, 'data-node-kind': 'internal' });
        hitLayer.appendChild(hit); refs.hit = hit;
      }
      state.refs.set(record.uid, refs);
    }
    for (const leafRecord of layout.display.leaves) {
      const leaf = leafRecord.node;
      const distance = Math.hypot(leafRecord._connectorX - leafRecord.x, leafRecord._connectorY - leafRecord.y);
      const connector = distance > 7 ? { x1: leafRecord.x, y1: leafRecord.y, x2: leafRecord._connectorX, y2: leafRecord._connectorY, radial: true } : null;
      const transform = `translate(${leafRecord._labelX} ${leafRecord._labelY}) rotate(${leafRecord._labelRotation})`;
      addTipElements(leaf, leafRecord.x, leafRecord.y, 0, 0, transform, leafRecord._labelAnchor, layout.spacing, connector, tipLayer, hitLayer);
    }
  }

  function renderUnrootedTree(branchLayer, supportLayer, tipLayer, hitLayer, layout) {
    for (const node of state.tree.nodes) {
      const refs = state.refs.get(node.uid) || {};
      if (node.parent) {
        const edge = state.tree.edgeByChildUid.get(node.uid);
        const branch = svgElement('line', { x1: node.parent.x, y1: node.parent.y, x2: node.x, y2: node.y, class: `phylo-branch phylo-diagonal-branch ${node.children.length ? 'phylo-internal-branch' : 'phylo-tip-branch'}` });
        branchLayer.appendChild(branch); refs.horizontal = branch;
        registerEdgeElement(edge?.id, 'lines', branch);
        if (edge) { const hit = createEdgeHit(edge, node.parent.x, node.parent.y, node.x, node.y); hitLayer.appendChild(hit); registerEdgeElement(edge.id, 'hits', hit); }
      }
      if (node.children.length) {
        const hit = svgElement('circle', { cx: node.x, cy: node.y, r: 8, class: 'phylo-node-hit', 'data-node-id': node.uid, 'data-node-kind': 'internal' });
        hitLayer.appendChild(hit); refs.hit = hit;
        const edge = node.parent ? state.tree.edgeByChildUid.get(node.uid) : null;
        if (edge?.label) addSupportObjects(edge, node.x + 4, node.y - 4, node.x, node.y, supportLayer);
      }
      state.refs.set(node.uid, refs);
    }
    for (const leaf of state.tree.leaves) {
      const distance = Math.hypot(leaf._connectorX - leaf.x, leaf._connectorY - leaf.y);
      const connector = distance > 7 ? { x1: leaf.x, y1: leaf.y, x2: leaf._connectorX, y2: leaf._connectorY, radial: true } : null;
      const transform = `translate(${leaf._labelX} ${leaf._labelY}) rotate(${leaf._labelRotation})`;
      addTipElements(leaf, leaf.x, leaf.y, 0, 0, transform, leaf._labelAnchor, layout.spacing, connector, tipLayer, hitLayer);
    }
  }

  function renderGroupLabels(groupLayer) {
    for (const group of state.groups) {
      if (!group.show_label || !group.valid || !group.anchorUid) continue;
      let x = 0; let y = 0;
      if (state.layoutMode === 'unrooted') {
        const node = state.tree.nodeByUid.get(group.anchorUid);
        if (!node) continue;
        x = node.x + 8; y = node.y + 14;
      } else {
        const record = state.layout?.display?.nodeByUid.get(group.anchorUid);
        if (!record) continue;
        x = record.x + 8; y = record.y + 14;
      }
      const text = svgElement('text', { x, y, class: 'phylo-group-label' });
      text.textContent = group.name;
      text.style.fill = group.color;
      groupLayer.appendChild(text);
    }
  }

  function selectedFitBounds(layout = state.layout) {
    if (!layout) return null;
    return state.fitMode === 'tree' ? layout.treeBounds : layout.fullBounds;
  }

  function currentViewportCenter() {
    if (!state.layout || !(state.displayScale > 0)) return null;
    const viewport = state.els.viewport;
    const marginLeft = Number.parseFloat(state.els.svg.style.marginLeft) || 0;
    const marginTop = Number.parseFloat(state.els.svg.style.marginTop) || 0;
    return {
      x: (viewport.scrollLeft + viewport.clientWidth / 2 - marginLeft) / state.displayScale,
      y: (viewport.scrollTop + viewport.clientHeight / 2 - marginTop) / state.displayScale
    };
  }

  function applyViewScale(preserveCenter = true, centerOverride = null, anchorOverride = null) {
    if (!state.layout) return;
    const bounds = selectedFitBounds();
    if (!bounds) return;
    const { viewport, svg } = state.els;
    const previousCenter = centerOverride || (preserveCenter ? currentViewportCenter() : null);
    const boundsWidth = Math.max(1, bounds.maxX - bounds.minX);
    const boundsHeight = Math.max(1, bounds.maxY - bounds.minY);
    const viewportWidth = Math.max(1, viewport.clientWidth);
    const viewportHeight = Math.max(1, viewport.clientHeight);
    const baseScale = Math.min(Math.max(0.001, (viewportWidth - 24) / boundsWidth), Math.max(0.001, (viewportHeight - 24) / boundsHeight));
    const displayScale = Math.max(0.002, baseScale * state.viewZoom);
    const displayWidth = Math.max(1, state.layout.width * displayScale);
    const displayHeight = Math.max(1, state.layout.height * displayScale);
    const marginLeft = displayWidth < viewportWidth ? (viewportWidth - displayWidth) / 2 : 0;
    const marginTop = displayHeight < viewportHeight ? (viewportHeight - displayHeight) / 2 : 0;
    state.displayScale = displayScale;
    svg.setAttribute('width', String(displayWidth));
    svg.setAttribute('height', String(displayHeight));
    svg.style.width = `${displayWidth}px`;
    svg.style.height = `${displayHeight}px`;
    svg.style.marginLeft = `${marginLeft}px`;
    svg.style.marginTop = `${marginTop}px`;
    viewport.dataset.fitMode = state.fitMode;
    const target = previousCenter || { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
    requestAnimationFrame(() => {
      const desiredLeft = anchorOverride
        ? anchorOverride.x * displayScale + marginLeft - anchorOverride.viewportX
        : target.x * displayScale + marginLeft - viewport.clientWidth / 2;
      const desiredTop = anchorOverride
        ? anchorOverride.y * displayScale + marginTop - anchorOverride.viewportY
        : target.y * displayScale + marginTop - viewport.clientHeight / 2;
      viewport.scrollLeft = Math.max(0, Math.min(desiredLeft, viewport.scrollWidth - viewport.clientWidth));
      viewport.scrollTop = Math.max(0, Math.min(desiredTop, viewport.scrollHeight - viewport.clientHeight));
    });
  }

  function renderTree(preserveScroll = true) {
    if (!state.tree) return;
    const token = ++state.renderToken;
    const previousCenter = preserveScroll ? currentViewportCenter() : null;
    let layout;
    if (state.layoutMode === 'rectangular') layout = layoutRectangularTree();
    else if (state.layoutMode === 'radial') layout = layoutRadialTree();
    else layout = layoutUnrootedTree();
    state.layout = layout;
    state.refs = new Map();
    state.edgeRefs = new Map();
    const svg = state.els.svg;
    svg.textContent = '';
    svg.dataset.layout = layout.mode;
    svg.classList.toggle('is-unrooted', layout.mode === 'unrooted');
    svg.classList.toggle('is-radial', layout.mode === 'radial');
    state.els.viewport.classList.toggle('is-unrooted', layout.mode === 'unrooted');
    svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${humanize(layout.mode)} phylogenetic view with ${state.tree.leaves.length} tips. Filters alter emphasis only.`);
    const title = svgElement('title'); title.textContent = `${humanize(layout.mode)} interactive phylogenetic tree`;
    const desc = svgElement('desc'); desc.textContent = 'The source topology is retained. The author configuration controls marked supports, clade groups, labels, layout, and root.';
    svg.append(title, desc);
    const branchLayer = svgElement('g', { class: 'phylo-branches' });
    const connectorLayer = svgElement('g', { class: 'phylo-connectors' });
    const supportLayer = svgElement('g', { class: 'phylo-supports' });
    const groupLayer = svgElement('g', { class: 'phylo-groups' });
    const tipLayer = svgElement('g', { class: 'phylo-tips' });
    const hitLayer = svgElement('g', { class: 'phylo-hits' });
    svg.append(branchLayer, connectorLayer, supportLayer, groupLayer, tipLayer, hitLayer);
    for (const node of state.tree.nodes) state.refs.set(node.uid, {});
    if (layout.mode === 'rectangular') renderRectangularTree(branchLayer, connectorLayer, supportLayer, tipLayer, hitLayer, layout);
    else if (layout.mode === 'radial') renderRadialTree(branchLayer, supportLayer, tipLayer, hitLayer, layout);
    else renderUnrootedTree(branchLayer, supportLayer, tipLayer, hitLayer, layout);
    renderGroupLabels(groupLayer);
    applySupportVisibility();
    applyVisualState();
    updateRerootUi();
    applyRerootVisualState();
    requestAnimationFrame(() => {
      if (token !== state.renderToken) return;
      applyViewScale(Boolean(previousCenter), previousCenter);
    });
  }

  function setVisualClass(element, className, enabled) {
    if (element) element.classList.toggle(className, Boolean(enabled));
  }

  function applyVisualState() {
    if (!state.tree || !state.refs.size) return;
    if (state.layoutMode !== 'unrooted') refreshRootedDisplayMatchCounts();
    const activeUid = state.hoveredUid ?? state.pinnedUid;
    const hoverPath = new Set();
    if (activeUid != null && state.layoutMode !== 'unrooted') {
      let record = state.layout?.display?.nodeByUid.get(activeUid);
      while (record) { hoverPath.add(record.uid); record = record.parent; }
    }
    for (const edge of state.tree.edges) {
      const refs = state.edgeRefs.get(edge.id);
      if (!refs) continue;
      const group = state.colorScale?.type === 'groups' ? groupForEdge(edge.id) : null;
      for (const line of refs.lines) {
        line.style.stroke = group ? group.color : '';
        setVisualClass(line, 'is-group-edge', Boolean(group));
        setVisualClass(line, 'is-selected-author-edge', edge.id === state.selectedEdgeId);
      }
    }
    for (const node of state.tree.nodes) {
      const refs = state.refs.get(node.uid) || {};
      const leaf = state.tree.leafUidSet.has(node.uid);
      const displayRecord = state.layoutMode !== 'unrooted' ? state.layout?.display?.nodeByUid.get(node.uid) : null;
      const unrootedContext = state.layoutMode === 'unrooted' && node.parent && node.matchCount > 0 && node.matchCount < state.matchingLeaves.length;
      const filterMatch = leaf ? Boolean(node.filterMatch) : (state.layoutMode === 'unrooted' ? unrootedContext : (displayRecord?.matchCount || 0) > 0);
      const filterClass = state.activeFilter ? (filterMatch ? (leaf ? 'match' : 'context') : 'muted') : 'normal';
      for (const element of [refs.horizontal, refs.vertical, refs.connector, refs.dot, refs.label]) {
        setVisualClass(element, 'is-filter-match', filterClass === 'match');
        setVisualClass(element, 'is-filter-context', filterClass === 'context');
        setVisualClass(element, 'is-filter-muted', filterClass === 'muted');
        setVisualClass(element, 'is-hovered', node.uid === activeUid && leaf);
        setVisualClass(element, 'is-pinned', node.uid === state.pinnedUid && leaf);
      }
      const rootedHoverPath = state.layoutMode !== 'unrooted' && hoverPath.has(node.uid);
      const unrootedActiveEdge = state.layoutMode === 'unrooted' && node.uid === activeUid && node.parent;
      setVisualClass(refs.horizontal, 'is-hover-path', (rootedHoverPath && Boolean(displayRecord?.parent)) || unrootedActiveEdge);
      setVisualClass(refs.vertical, 'is-hover-path', state.layoutMode !== 'unrooted' && activeUid != null && rootedHoverPath);
      if (leaf) {
        const color = colorForLeaf(node);
        if (refs.dot) refs.dot.style.fill = color;
        if (refs.horizontal && state.colorScale?.type !== 'groups') refs.horizontal.style.stroke = color;
      }
    }
    applySupportVisibility();
    applyRerootVisualState();
  }

  function applyRerootVisualState() {
    for (const [edgeId, refs] of state.edgeRefs) {
      const preview = edgeId === state.rerootPreviewEdgeId;
      const hovered = state.rerootMode !== 'idle' && edgeId === state.rerootHoverEdgeId && !preview;
      const selected = edgeId === state.rootEdgeId;
      for (const line of refs.lines) {
        setVisualClass(line, 'is-reroot-preview', preview);
        setVisualClass(line, 'is-reroot-hover', hovered);
        setVisualClass(line, 'is-selected-root-edge', selected);
      }
      for (const element of [...refs.supportTexts, ...refs.supportCircles]) {
        setVisualClass(element, 'is-reroot-preview', preview);
        setVisualClass(element, 'is-selected-root-edge', selected);
      }
      for (const hit of refs.hits) hit.setAttribute('aria-pressed', String(preview));
    }
  }

  function applySupportVisibility() {
    if (!state.tree) return;
    const hoveredEdge = state.hoveredUid == null ? null : edgeForNode(state.hoveredUid);
    for (const edge of state.tree.edges) {
      const refs = state.edgeRefs.get(edge.id);
      if (!refs) continue;
      const mark = markForEdge(edge);
      const hovered = hoveredEdge?.id === edge.id && Boolean(edge.label);
      const showNumber = Boolean(mark && state.supportDisplay === 'number') || (hovered && !mark);
      const showCircle = Boolean(mark && state.supportDisplay === 'circle');
      for (const text of refs.supportTexts) {
        text.style.display = showNumber ? '' : 'none';
        text.style.fill = mark?.color || state.supportColor;
        text.style.fontSize = `${state.supportNumberSize}px`;
        text.classList.toggle('is-hover-support', hovered && !mark);
      }
      for (const circle of refs.supportCircles) {
        circle.style.display = showCircle ? '' : 'none';
        circle.style.fill = mark?.color || state.supportColor;
        circle.setAttribute('r', String(mark?.size || state.supportSize));
      }
    }
  }

  function clearTooltip() {
    state.hoveredUid = null;
    if (state.pinnedUid == null) {
      state.els.tooltip.hidden = true;
      state.els.tooltip.classList.remove('is-pinned');
    }
    applyVisualState();
  }

  function unpinTooltip() {
    state.pinnedUid = null;
    state.hoveredUid = null;
    state.els.tooltip.hidden = true;
    state.els.tooltip.classList.remove('is-pinned');
    applyVisualState();
  }

  function addTooltipSection(table, label) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 2;
    cell.className = 'tooltip-section';
    cell.textContent = label;
    row.appendChild(cell);
    table.appendChild(row);
  }

  function addTooltipRow(table, label, value, options = {}) {
    const row = document.createElement('tr');
    const header = document.createElement('th');
    header.scope = 'row';
    header.textContent = label;
    const cell = document.createElement('td');
    const text = value == null ? '' : String(value);
    if (options.color && validCssColor(text)) {
      const wrap = document.createElement('span');
      wrap.className = 'tooltip-color-value';
      const swatch = document.createElement('span');
      swatch.className = 'tooltip-color-swatch';
      swatch.style.background = text;
      const valueText = document.createElement('span');
      valueText.textContent = text;
      wrap.append(swatch, valueText);
      cell.appendChild(wrap);
    } else cell.textContent = text;
    row.append(header, cell);
    table.appendChild(row);
  }

  function renderTooltipContent(node, pinned) {
    const tooltip = state.els.tooltip;
    tooltip.textContent = '';
    tooltip.classList.toggle('is-pinned', pinned);
    const displayRecord = state.layoutMode !== 'unrooted' ? state.layout?.display?.nodeByUid.get(node.uid) : null;
    const isLeaf = state.tree.leafUidSet.has(node.uid);
    const edge = edgeForNode(node.uid);
    const activeLength = displayRecord?.parent ? displayRecord.length : node.length;
    const activeSupport = edge?.label || node.name;
    const activeDescendants = displayRecord?.descendantLeaves ?? node.descendantLeaves;
    const head = document.createElement('div');
    head.className = 'tooltip-head';
    const title = document.createElement('strong');
    title.textContent = isLeaf ? (node.displayLabel || node.name) : 'Internal node';
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'tooltip-close'; close.setAttribute('aria-label', 'Close details'); close.textContent = '×'; close.addEventListener('click', unpinTooltip);
    head.append(title, close);
    const table = document.createElement('table'); table.className = 'tooltip-table';
    const body = document.createElement('tbody'); table.appendChild(body);
    if (isLeaf) {
      addTooltipSection(body, 'Annotations');
      const requested = state.config.tooltipColumns.length ? state.config.tooltipColumns : state.table.headers;
      const columns = requested.map(name => state.table.headers.find(header => normalizeKey(header) === normalizeKey(name))).filter((header, index, list) => header && list.indexOf(header) === index);
      if (!columns.includes(state.table.idColumn)) columns.unshift(state.table.idColumn);
      for (const header of columns) {
        const label = state.config.columnLabels[header] || humanize(header);
        const value = header === state.table.idColumn ? node.name : (node.annotation?.[header] ?? '');
        addTooltipRow(body, label, value, { color: header === state.config.colorColumn });
      }
      const group = groupForLeaf(node);
      if (group) addTooltipRow(body, 'Clade group', group.name);
      addTooltipSection(body, 'Tree');
      addTooltipRow(body, 'Tree tip ID', node.name);
      addTooltipRow(body, 'Branch length', activeLength == null ? '' : formatNumeric(activeLength));
      addTooltipRow(body, 'Tip order', formatInteger(node.leafIndex + 1));
    } else {
      addTooltipSection(body, 'Tree');
      addTooltipRow(body, 'Support', activeSupport || '');
      addTooltipRow(body, 'Marked support', edge ? (state.markedSupports.has(edge.signature) ? 'Yes' : 'No') : '');
      addTooltipRow(body, 'Branch length', activeLength == null ? '' : formatNumeric(activeLength));
      addTooltipRow(body, 'Descendant tips', formatInteger(activeDescendants));
      if (state.config.authoring) addTooltipRow(body, 'Editor action', edge?.label ? 'Click to mark or unmark this support.' : 'Select this node to define a clade group.');
    }
    tooltip.append(head, table);
    tooltip.hidden = false;
  }

  function positionTooltip(clientX, clientY) {
    const tooltip = state.els.tooltip;
    const margin = 12;
    const gap = 14;
    tooltip.style.left = `${clientX + gap}px`;
    tooltip.style.top = `${clientY + gap}px`;
    const rect = tooltip.getBoundingClientRect();
    let left = clientX + gap;
    let top = clientY + gap;
    if (rect.right > window.innerWidth - margin) left = Math.max(margin, clientX - rect.width - gap);
    if (rect.bottom > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - rect.height - margin);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function showTooltip(node, event, pinned = false) {
    if (!node) return;
    renderTooltipContent(node, pinned);
    positionTooltip(event.clientX, event.clientY);
  }

  function nodeFromEventTarget(target) {
    const element = target instanceof Element ? target.closest('[data-node-id]') : null;
    if (!element || !state.els.svg.contains(element)) return null;
    return state.tree?.nodeByUid.get(Number(element.getAttribute('data-node-id'))) || null;
  }

  function edgeIdFromEventTarget(target) {
    const element = target instanceof Element ? target.closest('[data-edge-id]') : null;
    if (!element || !state.els.svg.contains(element)) return null;
    const edgeId = element.getAttribute('data-edge-id');
    return state.tree?.edgeById.has(edgeId) ? edgeId : null;
  }

  function handlePointerOver(event) {
    if (state.pan.active) return;
    if (state.rerootMode !== 'idle') {
      const edgeId = edgeIdFromEventTarget(event.target);
      if (!edgeId || edgeIdFromEventTarget(event.relatedTarget) === edgeId) return;
      state.rerootHoverEdgeId = edgeId;
      applyRerootVisualState();
      return;
    }
    const node = nodeFromEventTarget(event.target);
    if (!node || nodeFromEventTarget(event.relatedTarget)?.uid === node.uid) return;
    state.hoveredUid = node.uid;
    applyVisualState();
    if (state.pinnedUid == null) showTooltip(node, event, false);
  }

  function handlePointerMove(event) {
    if (state.pan.active) return;
    if (state.rerootMode !== 'idle' || state.pinnedUid != null || state.hoveredUid == null || state.els.tooltip.hidden) return;
    positionTooltip(event.clientX, event.clientY);
  }

  function handlePointerOut(event) {
    if (state.pan.active) return;
    if (state.rerootMode !== 'idle') {
      const edgeId = edgeIdFromEventTarget(event.target);
      if (!edgeId || edgeIdFromEventTarget(event.relatedTarget) === edgeId) return;
      if (state.rerootHoverEdgeId === edgeId) state.rerootHoverEdgeId = null;
      applyRerootVisualState();
      return;
    }
    const node = nodeFromEventTarget(event.target);
    if (!node || nodeFromEventTarget(event.relatedTarget)?.uid === node.uid) return;
    state.hoveredUid = null;
    if (state.pinnedUid == null) state.els.tooltip.hidden = true;
    applyVisualState();
  }

  function toggleSupportForEdge(edge) {
    if (!edge?.label) return false;
    if (state.markedSupports.has(edge.signature)) state.markedSupports.delete(edge.signature);
    else state.markedSupports.set(edge.signature, { edge: edge.signature, value: edge.label, color: '', size: null });
    applySupportVisibility();
    dispatchStateChange();
    return state.markedSupports.has(edge.signature);
  }

  function handleTreeClick(event) {
    if (state.suppressNextClick) { state.suppressNextClick = false; return; }
    if (state.rerootMode !== 'idle') {
      const edgeId = edgeIdFromEventTarget(event.target);
      if (edgeId) chooseRerootEdge(edgeId);
      return;
    }
    const node = nodeFromEventTarget(event.target);
    if (!node) {
      if (state.pinnedUid != null) unpinTooltip();
      return;
    }
    if (node.children.length && state.config.authoring) {
      selectNode(node.uid);
      const edge = edgeForNode(node.uid);
      if (edge?.label) toggleSupportForEdge(edge);
      state.pinnedUid = node.uid;
      state.hoveredUid = null;
      applyVisualState();
      showTooltip(node, event, true);
      return;
    }
    if (state.pinnedUid === node.uid) { unpinTooltip(); return; }
    state.pinnedUid = node.uid;
    state.hoveredUid = null;
    applyVisualState();
    showTooltip(node, event, true);
  }

  function navigateMatch(direction) {
    if (!state.activeFilter || !state.matchingLeaves.length) return;
    const count = state.matchingLeaves.length;
    state.matchCursor = (state.matchCursor + direction + count) % count;
    const leaf = state.matchingLeaves[state.matchCursor];
    state.pinnedUid = leaf.uid;
    state.hoveredUid = null;
    applyVisualState();
    const marginLeft = Number.parseFloat(state.els.svg.style.marginLeft) || 0;
    const marginTop = Number.parseFloat(state.els.svg.style.marginTop) || 0;
    state.els.viewport.scrollTo({
      top: Math.max(0, leaf.y * state.displayScale + marginTop - state.els.viewport.clientHeight / 2),
      left: Math.max(0, leaf.x * state.displayScale + marginLeft - state.els.viewport.clientWidth / 2),
      behavior: 'smooth'
    });
  }

  function scheduleRender() {
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(() => { updateRangeOutputs(); renderTree(true); dispatchStateChange(); }, 70);
  }

  function curationObject() {
    const rootEdge = state.rootEdgeId ? state.tree?.edgeById.get(state.rootEdgeId) : null;
    return {
      version: 1,
      title: clean(state.config.figureTitle || state.config.title),
      layout: {
        mode: state.layoutMode,
        use_branch_lengths: state.useBranchLengths,
        align_labels: Boolean(state.els.alignLabels?.checked),
        branch_scale: Number(state.els.branchScale?.value || state.config.defaultBranchScale),
        tip_spacing: Number(state.els.tipSpacing?.value || state.config.defaultTipSpacing),
        fit_mode: state.fitMode,
        color_by: state.colorColumn === GROUP_SENTINEL ? 'groups' : state.colorColumn
      },
      root: rootEdge ? { edge: rootEdge.signature } : null,
      supports: {
        display: state.supportDisplay,
        color: state.supportColor,
        size: state.supportSize,
        number_size: state.supportNumberSize,
        marked: [...state.markedSupports.values()].map(item => ({
          edge: item.edge,
          value: item.value || '',
          ...(item.color ? { color: item.color } : {}),
          ...(item.size ? { size: item.size } : {})
        }))
      },
      labels: {
        id_column: state.table?.idColumn || state.config.idColumn || 'id',
        template: state.tipLabelTemplate,
        hover_columns: [...state.config.tooltipColumns]
      },
      groups: state.groups.map(group => ({
        id: group.id,
        name: group.name,
        color: group.color,
        edge: group.edge,
        member_tip: group.member_tip,
        show_label: Boolean(group.show_label)
      }))
    };
  }

  function dumpSimpleYaml(value, indent = 0) {
    const pad = ' '.repeat(indent);
    const scalar = item => {
      if (item == null) return 'null';
      if (typeof item === 'boolean' || typeof item === 'number') return String(item);
      return JSON.stringify(String(item));
    };
    if (Array.isArray(value)) {
      if (!value.length) return '[]';
      return value.map(item => {
        if (item && typeof item === 'object') {
          const lines = dumpSimpleYaml(item, indent + 2).split('\n');
          return `${pad}- ${lines[0].trimStart()}${lines.length > 1 ? `\n${lines.slice(1).join('\n')}` : ''}`;
        }
        return `${pad}- ${scalar(item)}`;
      }).join('\n');
    }
    if (value && typeof value === 'object') {
      const lines = [];
      for (const [key, item] of Object.entries(value)) {
        const safeKey = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : JSON.stringify(key);
        if (Array.isArray(item)) {
          if (!item.length) lines.push(`${pad}${safeKey}: []`);
          else if (item.every(entry => entry == null || ['string','number','boolean'].includes(typeof entry))) lines.push(`${pad}${safeKey}: [${item.map(scalar).join(', ')}]`);
          else lines.push(`${pad}${safeKey}:\n${dumpSimpleYaml(item, indent + 2)}`);
        } else if (item && typeof item === 'object') {
          lines.push(`${pad}${safeKey}:\n${dumpSimpleYaml(item, indent + 2)}`);
        } else lines.push(`${pad}${safeKey}: ${scalar(item)}`);
      }
      return lines.join('\n');
    }
    return `${pad}${scalar(value)}`;
  }

  function curationText() {
    const object = curationObject();
    return `${dumpSimpleYaml(object)}\n`;
  }

  function applyCurationObject(input, options = {}) {
    const curation = normalizeCuration(input || {});
    state.layoutMode = curation.layout.mode;
    state.useBranchLengths = curation.layout.use_branch_lengths;
    state.fitMode = curation.layout.fit_mode;
    state.tipLabelTemplate = curation.labels.template;
    state.supportDisplay = curation.supports.display;
    state.supportColor = curation.supports.color;
    state.supportSize = curation.supports.size;
    state.supportNumberSize = curation.supports.number_size;
    state.markedSupports = new Map(curation.supports.marked.map(item => [item.edge, item]));
    state.groups = curation.groups;
    if (state.els.alignLabels) state.els.alignLabels.checked = curation.layout.align_labels;
    if (state.els.branchScale) state.els.branchScale.value = String(curation.layout.branch_scale);
    if (state.els.tipSpacing) state.els.tipSpacing.value = String(curation.layout.tip_spacing);
    state.colorColumn = normalizeKey(curation.layout.color_by) === 'groups' ? GROUP_SENTINEL : curation.layout.color_by;
    state.config.tooltipColumns = [...curation.labels.hover_columns];
    if (state.tree) {
      state.rootEdgeId = curation.root?.edge ? state.tree.edgeBySignature.get(curation.root.edge)?.id || null : null;
      resolveAllGroups();
      refreshLeafLabels();
      populateColorSelector();
      updateLayoutControls();
      updateFitControls();
      updateRangeOutputs();
      if (options.render !== false) renderTree(false);
    }
    dispatchStateChange();
    return curation;
  }

  async function loadCuration(source, options = {}) {
    const info = await readSource(source, options.label || 'phylogeny YAML', true);
    state.curationSource = info;
    if (!info) {
      applyCurationObject(defaultCuration(), options);
      return null;
    }
    const parsed = parseYamlOrJson(info.text);
    applyCurationObject(parsed, options);
    return parsed;
  }

  function setSupportStyle(style = {}) {
    if (style.display) state.supportDisplay = normalizeSupportDisplay(style.display);
    if (validCssColor(style.color)) state.supportColor = style.color;
    if (Number.isFinite(Number(style.size))) state.supportSize = clamp(Number(style.size), 2, 20);
    if (Number.isFinite(Number(style.numberSize))) state.supportNumberSize = clamp(Number(style.numberSize), 6, 24);
    applySupportVisibility();
    dispatchStateChange();
  }

  function markSupportsAbove(threshold) {
    if (!state.tree) return 0;
    const value = Number(threshold);
    if (!Number.isFinite(value)) return 0;
    let added = 0;
    for (const edge of state.tree.edges) {
      const support = Number(edge.label);
      if (!Number.isFinite(support) || support < value) continue;
      if (!state.markedSupports.has(edge.signature)) added += 1;
      state.markedSupports.set(edge.signature, { edge: edge.signature, value: edge.label, color: '', size: null });
    }
    applySupportVisibility();
    dispatchStateChange();
    return added;
  }

  function clearMarkedSupports() {
    state.markedSupports.clear();
    applySupportVisibility();
    dispatchStateChange();
  }

  function toggleSelectedSupport() {
    const edge = state.selectedEdgeId ? state.tree?.edgeById.get(state.selectedEdgeId) : null;
    return toggleSupportForEdge(edge);
  }

  function createGroupFromSelection(input = {}) {
    const edge = state.selectedEdgeId ? state.tree?.edgeById.get(state.selectedEdgeId) : null;
    if (!edge) throw new Error('Select an internal node or branch before creating a clade group.');
    const sideUid = state.selectedSideUid || edge.bUid;
    const blockedUid = sideUid === edge.aUid ? edge.bUid : edge.aUid;
    const memberTip = firstTipInComponent(sideUid, blockedUid);
    if (!memberTip) throw new Error('The selected branch does not define a tip-containing clade.');
    const group = {
      id: clean(input.id) || `group-${Date.now().toString(36)}`,
      name: clean(input.name) || `Clade ${state.groups.length + 1}`,
      color: validCssColor(input.color) ? input.color : generatedColor(clean(input.name) || `group-${state.groups.length + 1}`, state.groups.length),
      edge: edge.signature,
      member_tip: memberTip,
      show_label: Boolean(input.showLabel),
      tips: []
    };
    state.groups.push(resolveGroup(group));
    state.colorColumn = GROUP_SENTINEL;
    populateColorSelector();
    renderTree(true);
    dispatchStateChange();
    return group.id;
  }

  function updateGroup(id, changes = {}) {
    const group = state.groups.find(item => item.id === id);
    if (!group) return false;
    if (changes.name != null) group.name = clean(changes.name) || group.name;
    if (validCssColor(changes.color)) group.color = changes.color;
    if (changes.showLabel != null) group.show_label = Boolean(changes.showLabel);
    resolveAllGroups();
    populateColorSelector();
    renderTree(true);
    dispatchStateChange();
    return true;
  }

  function removeGroup(id) {
    const previous = state.groups.length;
    state.groups = state.groups.filter(group => group.id !== id);
    if (state.colorColumn === GROUP_SENTINEL && !state.groups.length) state.colorColumn = '';
    populateColorSelector();
    renderTree(true);
    dispatchStateChange();
    return state.groups.length !== previous;
  }

  function setTipLabelTemplate(template) {
    state.tipLabelTemplate = clean(template) || '{tip}';
    refreshLeafLabels();
    renderTree(true);
    dispatchStateChange();
  }

  function setTooltipColumns(columns) {
    state.config.tooltipColumns = Array.isArray(columns) ? columns.map(clean).filter(Boolean) : [];
    dispatchStateChange();
  }

  function setIdColumn(column) {
    if (!state.sources?.annotations?.text) return false;
    const table = parseAnnotationTable(state.sources.annotations.text, column);
    state.table = table;
    state.tree.annotationStats = attachAnnotations(state.tree, table);
    state.config.idColumn = table.idColumn;
    populateColorSelector();
    updateFilters();
    renderTree(true);
    updateSourceUi(state.sources.tree, state.sources.annotations, state.curationSource);
    dispatchStateChange();
    return true;
  }

  function downloadText(text, filename, type = 'text/plain;charset=utf-8') {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function downloadCuration(filename = 'phylogeny.yaml') {
    downloadText(curationText(), filename, 'text/yaml;charset=utf-8');
  }

  function dispatchStateChange() {
    dispatch('statechange', getEditorState());
  }

  function getEditorState() {
    return {
      loaded: Boolean(state.tree),
      version: VERSION,
      authoring: Boolean(state.config?.authoring),
      layout: state.layoutMode,
      useBranchLengths: state.useBranchLengths,
      rootEdgeSignature: state.rootEdgeId ? state.tree?.edgeById.get(state.rootEdgeId)?.signature || '' : '',
      selection: selectionSummary(),
      supports: {
        display: state.supportDisplay,
        color: state.supportColor,
        size: state.supportSize,
        numberSize: state.supportNumberSize,
        marked: [...state.markedSupports.values()]
      },
      groups: state.groups.map(group => ({ id: group.id, name: group.name, color: group.color, showLabel: group.show_label, tipCount: group.tipSet?.size || 0 })),
      table: state.table ? { headers: [...state.table.headers], idColumn: state.table.idColumn, rows: state.table.rows.length, empty: state.table.empty } : null,
      labels: { template: state.tipLabelTemplate, tooltipColumns: [...state.config.tooltipColumns] },
      tips: state.tree?.leaves.length || 0
    };
  }

  function applyPageMetadata() {
    const { config, els } = state;
    document.title = config.title || 'Phylogeny Viewer';
    if (els.appTitle) els.appTitle.textContent = config.title || 'Phylogeny Viewer';
    if (els.appSubtitle) els.appSubtitle.textContent = config.subtitle || '';
    const hasPaperTitle = Boolean(clean(config.paperTitle));
    const hasFigureTitle = Boolean(clean(config.figureTitle));
    if (els.paperTitle) { els.paperTitle.textContent = config.paperTitle || ''; els.paperTitle.hidden = !hasPaperTitle; }
    if (els.figureTitle) { els.figureTitle.textContent = config.figureTitle || ''; els.figureTitle.hidden = !hasFigureTitle; }
    if (els.paperHeader) els.paperHeader.hidden = !(hasPaperTitle || hasFigureTitle);
    if (els.includeInput) els.includeInput.placeholder = config.includePlaceholder;
    if (els.excludeInput) els.excludeInput.placeholder = config.excludePlaceholder;
    state.layoutMode = config.defaultLayout;
    state.useBranchLengths = config.defaultUseBranchLengths;
    state.fitMode = config.defaultFitMode;
    state.viewZoom = config.defaultViewZoom;
    state.supportDisplay = config.defaultSupportDisplay;
    state.supportColor = config.defaultSupportColor;
    state.supportSize = config.defaultSupportSize;
    state.supportNumberSize = config.defaultSupportNumberSize;
    state.tipLabelTemplate = config.defaultTipLabelTemplate;
    if (els.alignLabels) els.alignLabels.checked = config.defaultAlignLabels;
    if (els.branchScale) {
      els.branchScale.min = String(config.minBranchScale);
      els.branchScale.max = String(config.maxBranchScale);
      els.branchScale.value = String(config.defaultBranchScale);
    }
    if (els.tipSpacing) {
      els.tipSpacing.min = String(config.minTipSpacing);
      els.tipSpacing.max = String(config.maxTipSpacing);
      els.tipSpacing.value = String(config.defaultTipSpacing);
    }
    syncViewZoomControl();
    updateLayoutControls();
    updateFitControls();
    updateRangeOutputs();
    updateRerootUi();
  }

  function configureDownload(anchor, sourceInfo, text, fallbackName) {
    if (!anchor) return;
    if (!state.config.showDownloads || !sourceInfo) { anchor.hidden = true; return; }
    let href;
    if (typeof sourceInfo.source === 'string') href = sourceInfo.source;
    else {
      href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      state.objectUrls.push(href);
    }
    anchor.href = href;
    anchor.download = sourceInfo.name || fallbackName;
    anchor.hidden = false;
  }

  function updateSourceUi(treeInfo, annotationInfo, curationInfo) {
    revokeObjectUrls();
    if (state.els.sourceSummary) {
      const parts = [treeInfo?.name || 'tree', `${formatInteger(state.tree.leaves.length)} tips`];
      if (annotationInfo) parts.splice(1, 0, annotationInfo.name);
      if (curationInfo) parts.splice(parts.length - 1, 0, curationInfo.name);
      state.els.sourceSummary.textContent = parts.join(' · ');
      const details = [];
      if (state.tree.negativeBranchLengths) details.push(`${state.tree.negativeBranchLengths} negative branch lengths displayed as zero-length`);
      if (state.tree.annotationStats?.unmatchedRows.length) details.push(`${state.tree.annotationStats.unmatchedRows.length} annotation rows not present in the tree`);
      state.els.sourceSummary.title = details.join(' · ');
    }
    configureDownload(state.els.downloadTree, treeInfo, treeInfo?.text || '', 'tree.newick');
    configureDownload(state.els.downloadAnnotations, annotationInfo, annotationInfo?.text || '', 'annotations.tsv');
    if (state.els.downloadCuration) {
      const text = curationText();
      const url = URL.createObjectURL(new Blob([text], { type: 'text/yaml;charset=utf-8' }));
      state.objectUrls.push(url);
      state.els.downloadCuration.href = url;
      state.els.downloadCuration.download = curationInfo?.name || 'phylogeny.yaml';
      state.els.downloadCuration.hidden = !state.config.showDownloads;
    }
  }

  async function loadSources(treeSource, annotationSource = null, curationSource = null, options = {}) {
    clearError();
    unpinTooltip();
    showOverlay('loading', 'Loading phylogeny', 'Parsing the Newick tree and preparing the author configuration…');
    setStatus('Loading…');
    const token = Symbol('load');
    state.currentLoadToken = token;
    try {
      const [treeInfo, annotationInfo, curationInfo] = await Promise.all([
        readSource(treeSource, options.treeLabel || 'Newick tree'),
        readSource(annotationSource, options.annotationLabel || 'annotation table', true),
        readSource(curationSource, options.curationLabel || 'phylogeny YAML', true)
      ]);
      if (state.currentLoadToken !== token) return null;
      const tree = parseNewick(treeInfo.text);
      let curation = defaultCuration();
      if (curationInfo) curation = normalizeCuration(parseYamlOrJson(curationInfo.text));
      state.tipLabelTemplate = curation.labels.template;
      state.config.idColumn = curation.labels.id_column || state.config.idColumn;
      const table = annotationInfo ? parseAnnotationTable(annotationInfo.text, state.config.idColumn) : createEmptyTable(state.config.idColumn || 'id');
      tree.annotationStats = attachAnnotations(tree, table);
      state.tree = tree;
      state.table = table;
      state.sources = { tree: treeInfo, annotations: annotationInfo };
      state.curationSource = curationInfo;
      state.hoveredUid = null;
      state.pinnedUid = null;
      state.selectedNodeUid = null;
      state.selectedEdgeId = null;
      state.selectedSideUid = null;
      state.matchCursor = -1;
      state.rerootMode = 'idle';
      state.rerootPreviewEdgeId = null;
      state.rerootHoverEdgeId = null;
      state.viewZoom = state.config.defaultViewZoom;
      syncViewZoomControl();
      applyCurationObject(curation, { render: false });
      state.baselineCuration = curationObject();
      updateLayoutControls();
      updateFitControls();
      updateRerootUi();
      updateRangeOutputs();
      populateColorSelector();
      updateFilters();
      renderTree(false);
      updateSourceUi(treeInfo, annotationInfo, curationInfo);
      hideOverlay();
      dispatch('loaded', getEditorState());
      dispatchStateChange();
      return {
        tips: tree.leaves.length,
        annotatedTips: tree.annotationStats.annotatedTips,
        blankTips: tree.annotationStats.blankTips,
        unmatchedRows: tree.annotationStats.unmatchedRows.length,
        groups: state.groups.length,
        markedSupports: state.markedSupports.size
      };
    } catch (error) {
      if (state.currentLoadToken === token) showError(error);
      return null;
    }
  }

  function loadPair(treeSource, annotationSource, options = {}) {
    return loadSources(treeSource, annotationSource, options.curationSource || null, options);
  }

  function loadConfigured() {
    if (!clean(state.config.treeUrl)) {
      showOverlay('waiting', 'Waiting for a tree', 'Choose a Newick tree. An annotation table and phylogeny YAML are optional.');
      setStatus('Waiting for files…');
      return Promise.resolve(null);
    }
    return loadSources(state.config.treeUrl, clean(state.config.annotationUrl) || null, clean(state.config.curationUrl) || null);
  }

  function resetView() {
    if (!state.tree) return;
    if (state.els.includeInput) state.els.includeInput.value = '';
    if (state.els.excludeInput) state.els.excludeInput.value = '';
    state.viewZoom = state.config.defaultViewZoom;
    syncViewZoomControl();
    state.rerootMode = 'idle';
    state.rerootPreviewEdgeId = null;
    state.rerootHoverEdgeId = null;
    applyCurationObject(state.baselineCuration || defaultCuration(), { render: false });
    updateFilters();
    renderTree(false);
    updateSourceUi(state.sources.tree, state.sources.annotations, state.curationSource);
    dispatchStateChange();
  }

  function bindEvents() {
    const { els } = state;
    const delayedFilter = debounce(updateFilters, 100);
    els.includeInput.addEventListener('input', delayedFilter);
    els.excludeInput.addEventListener('input', delayedFilter);
    els.includeClear.addEventListener('click', () => { els.includeInput.value = ''; els.includeInput.focus(); updateFilters(); });
    els.excludeClear.addEventListener('click', () => { els.excludeInput.value = ''; els.excludeInput.focus(); updateFilters(); });
    els.colorBy.addEventListener('change', () => updateColoring(true));
    if (els.layoutUnrooted) els.layoutUnrooted.addEventListener('click', () => setLayoutMode('unrooted'));
    if (els.layoutRadial) els.layoutRadial.addEventListener('click', () => setLayoutMode('radial'));
    if (els.layoutRectangular) els.layoutRectangular.addEventListener('click', () => setLayoutMode('rectangular'));
    if (els.useBranchLengths) els.useBranchLengths.addEventListener('change', () => setUseBranchLengths(els.useBranchLengths.checked));
    els.alignLabels.addEventListener('change', () => { renderTree(true); dispatchStateChange(); });
    els.branchScale.addEventListener('input', scheduleRender);
    els.tipSpacing.addEventListener('input', scheduleRender);
    if (els.viewZoom) els.viewZoom.addEventListener('input', () => setViewZoomFromSlider(els.viewZoom.value, true));
    if (els.fitTree) els.fitTree.addEventListener('click', () => setFitMode('tree'));
    if (els.fitAll) els.fitAll.addEventListener('click', () => setFitMode('all'));
    if (els.reroot) els.reroot.addEventListener('click', () => state.rerootMode === 'idle' ? beginReroot() : cancelReroot());
    if (els.restoreRoot) els.restoreRoot.addEventListener('click', restoreOriginalRoot);
    if (els.rerootConfirm) els.rerootConfirm.addEventListener('click', confirmReroot);
    if (els.rerootCancel) els.rerootCancel.addEventListener('click', cancelReroot);
    els.resetView.addEventListener('click', resetView);
    if (els.previousMatch) els.previousMatch.addEventListener('click', () => navigateMatch(-1));
    if (els.nextMatch) els.nextMatch.addEventListener('click', () => navigateMatch(1));
    els.svg.addEventListener('pointerover', handlePointerOver);
    els.svg.addEventListener('pointermove', handlePointerMove);
    els.svg.addEventListener('pointerout', handlePointerOut);
    els.svg.addEventListener('click', handleTreeClick);
    els.viewport.addEventListener('wheel', handleViewportWheel, { passive: false });
    els.viewport.addEventListener('pointerdown', beginViewportPan);
    els.viewport.addEventListener('pointermove', moveViewportPan);
    els.viewport.addEventListener('pointerup', endViewportPan);
    els.viewport.addEventListener('pointercancel', endViewportPan);
    els.viewport.addEventListener('lostpointercapture', endViewportPan);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (state.rerootMode !== 'idle') cancelReroot();
      else if (state.pinnedUid != null) unpinTooltip();
    });
    const rerender = debounce(() => {
      if (!state.tree) return;
      const width = els.viewport.clientWidth;
      const height = els.viewport.clientHeight;
      if (Math.abs(width - state.lastViewportWidth) < 12 && Math.abs(height - state.lastViewportHeight) < 12) return;
      state.lastViewportWidth = width;
      state.lastViewportHeight = height;
      renderTree(true);
    }, 140);
    if ('ResizeObserver' in window) {
      state.resizeObserver = new ResizeObserver(rerender);
      state.resizeObserver.observe(els.viewport);
    } else window.addEventListener('resize', rerender);
  }

  async function init(customIds = {}) {
    if (state.initialized) return window.PhylogenyViewer;
    state.ids = { ...DEFAULT_IDS, ...(customIds || {}) };
    state.config = normalizeConfig(window.PHYLOGENY_VIEWER_CONFIG || {});
    state.configuredTooltipColumns = [...state.config.tooltipColumns];
    state.els = resolveElements(state.ids);
    state.initialized = true;
    applyPageMetadata();
    bindEvents();
    state.lastViewportWidth = state.els.viewport.clientWidth;
    state.lastViewportHeight = state.els.viewport.clientHeight;
    setStatus('Waiting for data…');
    showOverlay('waiting', 'Waiting for a tree', 'Load a Newick tree. Annotation and curation files are optional.');
    if (state.config.autoLoad !== false) await loadConfigured();
    return window.PhylogenyViewer;
  }

  window.PhylogenyViewer = {
    version: VERSION,
    init,
    loadSources,
    loadPair,
    loadConfigured,
    loadCuration,
    applyCuration: applyCurationObject,
    resetView,
    setLayoutMode,
    setUseBranchLengths,
    setSupportStyle,
    markSupportsAbove,
    clearMarkedSupports,
    toggleSelectedSupport,
    createGroupFromSelection,
    updateGroup,
    removeGroup,
    setTipLabelTemplate,
    setTooltipColumns,
    setIdColumn,
    downloadCuration,
    getCuration: curationObject,
    getCurationText: curationText,
    getEditorState,
    selectNode,
    getSummary() {
      if (!state.tree) return null;
      return {
        tips: state.tree.leaves.length,
        annotations: state.tree.annotationStats.annotatedTips,
        blankAnnotations: state.tree.annotationStats.blankTips,
        matches: state.matchingLeaves.length,
        activeFilter: state.activeFilter,
        colorBy: state.colorColumn,
        layout: state.layoutMode,
        useBranchLengths: state.useBranchLengths,
        fitMode: state.fitMode,
        viewZoom: state.viewZoom,
        savedRoot: Boolean(state.rootEdgeId),
        rootEdgeId: state.rootEdgeId || '',
        markedSupports: state.markedSupports.size,
        groups: state.groups.length
      };
    }
  };
})();
