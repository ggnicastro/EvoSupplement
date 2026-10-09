(() => {
  'use strict';

  const APP_VERSION = '2.13.0';
  const MAX_PDB_BYTES = 50 * 1024 * 1024;
  const MAX_YAML_BYTES = 2 * 1024 * 1024;
  const MAX_MSA_BYTES = 5 * 1024 * 1024;
  const MAX_MSA_SEQUENCES = 500;
  const MAX_MSA_COLUMNS = 20000;
  const OVERLAP_ALIGNMENT_MAX_CELLS = 30000000;
  const MAX_STRUCTURE_SEQUENCE_GAP = 5000;
  const MSA_DEFAULT_CELL_SIZE = 16;
  const MSA_INITIAL_ZOOM_CELL_SIZE = 8;
  const MSA_MIN_CELL_SIZE = 4;
  const MSA_MAX_ZOOM_CELL_SIZE = 72;
  const MSA_SCROLLBAR_MIN_THUMB = 48;
  const MSA_NAME_COLUMN_MIN_WIDTH = 180;
  const MSA_NAME_COLUMN_MAX_WIDTH = 520;
  const MAX_REGIONS = 1000;
  const MAX_POSITIONS_PER_REGION = 5000;
  const MAX_SELECTOR_EXPRESSIONS = 25000;
  const MAX_COMPONENTS = 250;
  const REGION_COMPONENT_CUSTOM_KEY = 'protein_region_viewer_component';
  const DEFAULT_LAYOUT = 'canvas';
  const DEFAULT_COMPONENT_COLOR = '#CBD5E1';
  const DEFAULT_BACKGROUND = '#FFFFFF';
  const DEFAULT_VIEWER_STYLE = 'default';
  const DEFAULT_BASE_COMPONENT_NAME = 'Base structure';
  const DEFAULT_BASE_COMPONENT_COLOR = '#FFFFFF';
  const DEFAULT_BASE_COMPONENT_OPACITY = 0.2;

  const LAYOUTS = Object.freeze({
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

  const REPRESENTATIONS = new Set([
    'cartoon', 'backbone', 'ball_and_stick', 'line', 'spacefill', 'carbohydrate', 'surface', 'putty'
  ]);
  const MOLSTAR_IMPORT_REPRESENTATION_ALIASES = Object.freeze({
    cartoon: 'cartoon',
    backbone: 'backbone',
    'ball-and-stick': 'ball_and_stick',
    ball_and_stick: 'ball_and_stick',
    line: 'line',
    spacefill: 'spacefill',
    carbohydrate: 'carbohydrate',
    'molecular-surface': 'surface',
    molecular_surface: 'surface',
    surface: 'surface',
    'gaussian-surface': 'surface',
    gaussian_surface: 'surface',
    putty: 'putty'
  });
  const HYDROGEN_AWARE_REPRESENTATIONS = new Set([
    'ball_and_stick', 'line', 'spacefill', 'surface'
  ]);
  const VIEWER_STYLES = new Set(['default', 'illustrative']);

  // The built-in Mol* Illustrative quick style uses spacefill geometry, the
  // illustrative color theme, ignore-light rendering, outlines, and ambient
  // occlusion. Explicit YAML values can override each of these defaults.
  const ILLUSTRATIVE_COLOR_THEME_PARAMS = Object.freeze({
    style: Object.freeze({
      name: 'entity-id',
      params: Object.freeze({ overrideWater: true })
    })
  });
  const ILLUSTRATIVE_REPRESENTATION_PARAMS = Object.freeze({ ignoreLight: true });
  const ILLUSTRATIVE_POSTPROCESSING = Object.freeze({
    enable_outline: true,
    enable_ssao: true
  });

  // Native Mol* structure color themes that are useful for PDB-backed
  // representations. `uniform` preserves the previous project behavior and
  // uses component_color (or the region color). `default` delegates the color
  // choice to Mol* for the selected representation.
  const COMPONENT_COLOR_THEMES = new Set([
    'uniform', 'default',
    'atom-id', 'cartoon', 'chain-id', 'element-index', 'element-symbol',
    'entity-id', 'entity-source', 'formal-charge', 'hydrophobicity',
    'illustrative', 'model-index', 'molecule-type', 'occupancy',
    'operator-hkl', 'operator-name', 'plddt-confidence', 'polymer-id', 'polymer-index',
    'residue-charge', 'residue-name', 'secondary-structure', 'sequence-id',
    'structure-index', 'trajectory-index', 'uncertainty', 'unit-index'
  ]);

  const COMPONENT_COLOR_THEME_ALIASES = Object.freeze({
    atom: 'element-symbol',
    atoms: 'element-symbol',
    cpk: 'element-symbol',
    element: 'element-symbol',
    elements: 'element-symbol',
    'atom-color': 'element-symbol',
    'atom-colors': 'element-symbol',
    'element-color': 'element-symbol',
    'element-colors': 'element-symbol',
    chain: 'chain-id',
    chains: 'chain-id',
    residue: 'residue-name',
    residues: 'residue-name',
    'residue-type': 'residue-name',
    'amino-acid': 'residue-name',
    'amino-acids': 'residue-name',
    secondary: 'secondary-structure',
    sequence: 'sequence-id',
    rainbow: 'sequence-id',
    'sequence-position': 'sequence-id',
    hydrophobic: 'hydrophobicity',
    charge: 'residue-charge',
    'b-factor': 'uncertainty',
    bfactor: 'uncertainty',
    'temperature-factor': 'uncertainty',
    plddt: 'plddt-confidence',
    'plddt-confidence': 'plddt-confidence',
    confidence: 'plddt-confidence',
    'af-confidence': 'plddt-confidence',
    'alphafold-confidence': 'plddt-confidence',
    region: 'uniform',
    fixed: 'uniform',
    automatic: 'default',
    auto: 'default'
  });

  // Recognized keys at each YAML level. Anything outside these sets is
  // silently ignored by the parser below, which previously made typos (for
  // example "Chain:" instead of "chain:") fail without any warning. Keep
  // these in sync whenever a new alias or property is added above.
  const KNOWN_TOP_LEVEL_KEYS = new Set([
    'version', 'title', 'numbering', 'default_chain', 'defaultChain', 'chain',
    'viewer', 'regions', 'msa', 'background', 'representation', 'show_labels', 'show_tooltips'
  ]);

  const KNOWN_VIEWER_KEYS = new Set([
    'style', 'quick_style', 'quickStyle', 'preset', 'base_style', 'baseStyle',
    'component_representation', 'componentRepresentation', 'representation',
    'component_color_theme', 'componentColorTheme', 'component_color_scheme', 'componentColorScheme',
    'component_color_theme_params', 'componentColorThemeParams', 'component_color_params', 'componentColorParams',
    'component_representation_params', 'componentRepresentationParams', 'representation_params', 'representationParams',
    'postprocessing', 'post_processing', 'postProcessing',
    'component_color', 'componentColor',
    'background',
    'show_labels', 'showLabels',
    'show_tooltips', 'showTooltips',
    'create_components', 'createComponents',
    'components_visible', 'componentsVisible',
    'component_opacity', 'componentOpacity',
    'base_component_name', 'baseComponentName',
    'base_color', 'baseColor',
    'base_opacity', 'baseOpacity',
    'numbering'
  ]);

  const KNOWN_REGION_KEYS = new Set([
    'enabled', 'name', 'label', 'title',
    'positions', 'residues', 'residue_positions', 'residuePositions', 'position_list', 'positionList',
    'residue', 'position',
    'start', 'begin', 'from',
    'end', 'stop', 'to',
    'numbering',
    'chains', 'chain', 'chain_id', 'chainId',
    'color', 'colour',
    'description', 'note',
    'create_component', 'createComponent', 'component',
    'component_name', 'componentName',
    'component_representation', 'componentRepresentation', 'representation',
    'component_representation_params', 'componentRepresentationParams', 'representation_params', 'representationParams',
    'component_color', 'componentColor', 'component_colour',
    'component_color_theme', 'componentColorTheme', 'component_color_scheme', 'componentColorScheme',
    'component_color_theme_params', 'componentColorThemeParams', 'component_color_params', 'componentColorParams',
    'component_opacity', 'componentOpacity',
    'component_visible', 'componentVisible',
    'label_3d', 'show_label',
    'tooltip'
  ]);

  const KNOWN_MSA_KEYS = new Set(['references', 'reference']);

  function findUnknownKeys(candidate, knownKeys) {
    if (!isPlainObject(candidate)) return [];
    return Object.keys(candidate).filter(key => !knownKeys.has(key));
  }

  // Three-letter to one-letter amino acid codes, used only to build a plain
  // sequence string for matching PDB/CIF chains against FASTA records.
  // Unrecognized residues (ligands, waters, unusual monomers) map to "X".
  const RESIDUE_ONE_LETTER = Object.freeze({
    ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E', GLY: 'G',
    HIS: 'H', ILE: 'I', LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P', SER: 'S',
    THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V', SEC: 'U', PYL: 'O',
    MSE: 'M', HSD: 'H', HSE: 'H', HSP: 'H'
  });

  // A Clustal-like residue coloring scheme for the MSA canvas.
  const MSA_RESIDUE_COLORS = Object.freeze({
    A: '#80a0f0', R: '#f01505', N: '#00ff00', D: '#c048c0', C: '#f08080',
    Q: '#00ff00', E: '#c048c0', G: '#f09048', H: '#15a4a4', I: '#80a0f0',
    L: '#80a0f0', K: '#f01505', M: '#80a0f0', F: '#80a0f0', P: '#ffff00',
    S: '#00ff00', T: '#00ff00', W: '#80a0f0', Y: '#15a4a4', V: '#80a0f0',
    U: '#f08080', O: '#f01505', X: '#e2e8f0', '-': '#f8fafc', '.': '#f8fafc'
  });

  // MolViewSpec supports custom loading extensions. The YAML scene adds
  // metadata to component and representation nodes; this extension converts
  // that metadata into native Mol* component names and initial visibility.
  const REGION_COMPONENT_MVS_EXTENSION = Object.freeze({
    id: 'protein-region-viewer-components',
    description: 'Name YAML-defined Mol* components and apply initial visibility',
    createExtensionContext: () => ({}),
    action: (updateTarget, node) => {
      const metadata = node?.custom?.[REGION_COMPONENT_CUSTOM_KEY];
      if (!isPlainObject(metadata)) return;

      if (node.kind === 'component') {
        const label = cleanString(metadata.label);
        if (label) {
          updateTarget.update.to(updateTarget.selector).update(params => {
            if (params && typeof params === 'object') params.label = label;
          });
        }
      }

      if (metadata.hidden === true) {
        updateTarget.update.to(updateTarget.selector).updateState({ isHidden: true });
      }
    }
  });

  const elements = {
    brandTitle: document.getElementById('brandTitle'),
    brandSubtitle: document.getElementById('brandSubtitle'),
    pageTitle: document.getElementById('pageTitle'),
    pageSubtitle: document.getElementById('pageSubtitle'),
    layoutSelect: document.getElementById('layoutSelect'),
    loadConfiguredButton: document.getElementById('loadConfiguredButton'),
    choosePdbButton: document.getElementById('choosePdbButton'),
    chooseYamlButton: document.getElementById('chooseYamlButton'),
    clearYamlButton: document.getElementById('clearYamlButton'),
    loadLocalButton: document.getElementById('loadLocalButton'),
    pdbFileInput: document.getElementById('pdbFileInput'),
    yamlFileInput: document.getElementById('yamlFileInput'),
    pdbFilePill: document.getElementById('pdbFilePill'),
    yamlFilePill: document.getElementById('yamlFilePill'),
    viewerCard: document.getElementById('viewerCard'),
    viewerState: document.getElementById('viewerState'),
    structureTitle: document.getElementById('structureTitle'),
    viewerOverlay: document.getElementById('viewerOverlay'),
    overlayTitle: document.getElementById('overlayTitle'),
    overlayDetail: document.getElementById('overlayDetail'),
    overlayConfiguredButton: document.getElementById('overlayConfiguredButton'),
    overlayLocalButton: document.getElementById('overlayLocalButton'),
    dropZone: document.getElementById('dropZone'),
    dropOverlay: document.getElementById('dropOverlay'),
    fullscreenButton: document.getElementById('fullscreenButton'),
    sourceSummary: document.getElementById('sourceSummary'),
    reloadButton: document.getElementById('reloadButton'),
    downloadPdbButton: document.getElementById('downloadPdbButton'),
    downloadYamlButton: document.getElementById('downloadYamlButton'),
    downloadTemplateButton: document.getElementById('downloadTemplateButton'),
    toast: document.getElementById('toast'),
    msaCard: document.getElementById('msaCard'),
    chooseMsaButton: document.getElementById('chooseMsaButton'),
    msaFileInput: document.getElementById('msaFileInput'),
    msaFilePill: document.getElementById('msaFilePill'),
    msaNamesList: document.getElementById('msaNamesList'),
    msaScrollArea: document.getElementById('msaScrollArea'),
    msaStage: document.getElementById('msaStage'),
    msaCanvas: document.getElementById('msaCanvas'),
    msaHorizontalScrollbar: document.getElementById('msaHorizontalScrollbar'),
    msaHorizontalThumb: document.getElementById('msaHorizontalThumb'),
    msaVerticalScrollbar: document.getElementById('msaVerticalScrollbar'),
    msaVerticalThumb: document.getElementById('msaVerticalThumb'),
    msaSummary: document.getElementById('msaSummary'),
    clearMsaSelectionButton: document.getElementById('clearMsaSelectionButton'),
    clearMsaButton: document.getElementById('clearMsaButton'),
    downloadMsaButton: document.getElementById('downloadMsaButton'),
    msaZoomInput: document.getElementById('msaZoomInput'),
    msaZoomValue: document.getElementById('msaZoomValue'),
    paperHeader: document.getElementById('paperHeader'),
    paperTitleEl: document.getElementById('paperTitleEl'),
    figureTitleEl: document.getElementById('figureTitleEl')
  };

  const config = normalizeConfig(window.PROTEIN_REGION_VIEWER_CONFIG || {});
  const state = {
    viewer: null,
    selectedPdbFile: null,
    selectedYamlFile: null,
    selectedMsaFile: null,
    current: null,
    msa: null,
    loadGeneration: 0,
    toastTimer: null,
    dragDepth: 0,
    fallbackFullscreen: false,
    msaScrollSyncing: false,
    msaDrawFrame: 0,
    msaResizeObserver: null,
    msaCellSize: MSA_INITIAL_ZOOM_CELL_SIZE,
    msaSelectionSyncFrame: 0,
    msaLastMolstarClickResidues: [],
    msaExpectedMolstarSelectionSignature: null,
    msaExpectedMolstarSelectionTimer: null,
    selectionEventFrame: 0
  };

  function dispatchViewerEvent(name, detail = {}) {
    try {
      document.dispatchEvent(new CustomEvent(`protein-region-viewer:${name}`, { detail }));
    } catch (error) {
      console.warn(`[Protein Region Viewer] Could not dispatch ${name} event.`, error);
    }
  }

  function normalizeLayout(value) {
    const raw = String(value || '').trim().toLowerCase();
    const aliases = {
      '3d': 'canvas',
      viewer: 'canvas',
      structure: 'canvas',
      'sequence+3d': 'sequence',
      'controls+3d': 'controls',
      'sequence+controls': 'sequence-controls',
      interface: 'full'
    };
    const candidate = aliases[raw] || raw;
    return Object.prototype.hasOwnProperty.call(LAYOUTS, candidate) ? candidate : DEFAULT_LAYOUT;
  }

  function normalizeConfig(raw) {
    const title = cleanString(raw.title) || 'Protein Region Viewer';
    const subtitle = cleanString(raw.subtitle) || 'Render only the Mol* component representations defined by YAML residue ranges or exact positions';
    return {
      title,
      subtitle,
      paperTitle: cleanString(raw.paperTitle || ''),
      figureTitle: cleanString(raw.figureTitle || ''),
      autoLoad: Boolean(raw.autoLoad),
      pdbUrl: cleanString(raw.pdbUrl || raw.structureUrl || ''),
      yamlUrl: cleanString(raw.yamlUrl || raw.annotationUrl || ''),
      msaUrl: cleanString(raw.msaUrl || raw.alignmentUrl || ''),
      defaultLayout: normalizeLayout(raw.defaultLayout || raw.layout),
      editorMode: Boolean(raw.editorMode || raw.authoring || raw.isEditor)
    };
  }

  function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function toBoolean(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const text = String(value).trim().toLowerCase();
    if (['true', 'yes', 'on', '1'].includes(text)) return true;
    if (['false', 'no', 'off', '0'].includes(text)) return false;
    return fallback;
  }

  function normalizeColor(value, fallback, path) {
    const raw = cleanString(value || fallback);
    if (/^#[0-9a-f]{3}$/i.test(raw)) {
      return `#${raw.slice(1).split('').map(char => char + char).join('').toUpperCase()}`;
    }
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toUpperCase();
    if (/^[a-z]+$/i.test(raw)) {
      const excluded = new Set(['transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'revert', 'revertlayer']);
      const probe = document.createElement('span');
      probe.style.color = '';
      probe.style.color = raw;
      if (probe.style.color && !excluded.has(raw.toLowerCase())) return raw.toLowerCase();
    }
    throw new Error(`${path} must be a hexadecimal color such as #2563EB or a valid X11 color name.`);
  }

  function normalizeRepresentation(value, fallback, path) {
    const normalized = cleanString(value ?? fallback).toLowerCase().replaceAll('-', '_');
    if (!REPRESENTATIONS.has(normalized)) {
      throw new Error(`${path} "${normalized}" is not supported.`);
    }
    return normalized;
  }

  function normalizeViewerStyle(value, fallback = DEFAULT_VIEWER_STYLE, path = 'viewer.style') {
    const raw = cleanString(value ?? fallback)
      .toLowerCase()
      .replaceAll('_', '-')
      .replace(/\s+/g, '-');
    const normalized = ['none', 'custom', 'normal'].includes(raw) ? 'default' : raw;
    if (!VIEWER_STYLES.has(normalized)) {
      throw new Error(`${path} "${raw}" is not supported. Use "default" or "illustrative".`);
    }
    return normalized;
  }

  function normalizeComponentColorTheme(value, fallback = 'uniform', path = 'component_color_theme') {
    const raw = cleanString(value ?? fallback)
      .toLowerCase()
      .replaceAll('_', '-')
      .replace(/\s+/g, '-');
    const normalized = COMPONENT_COLOR_THEME_ALIASES[raw] || raw;
    if (!COMPONENT_COLOR_THEMES.has(normalized)) {
      throw new Error(
        `${path} "${raw}" is not supported. Use "uniform", "default", ` +
        `"element-symbol", "chain-id", "residue-name", "secondary-structure", ` +
        `"sequence-id", "plddt" (AlphaFold-style confidence from the B-factor column), ` +
        `or another documented Mol* theme.`
      );
    }
    return normalized;
  }

  function normalizeOptionalColor(value, path) {
    if (value === undefined || value === null || value === '') return null;
    return normalizeColor(value, '', path);
  }

  function normalizeThemeParams(value, path) {
    if (value === undefined || value === null || value === '') return null;
    const budget = { nodes: 0 };
    const walk = (item, itemPath, depth) => {
      budget.nodes += 1;
      if (budget.nodes > 5000) throw new Error(`${path} is too large.`);
      if (depth > 20) throw new Error(`${path} is nested too deeply.`);
      if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
      if (typeof item === 'number') {
        if (!Number.isFinite(item)) throw new Error(`${itemPath} must contain a finite number.`);
        return item;
      }
      if (Array.isArray(item)) {
        if (item.length > 1000) throw new Error(`${itemPath} contains too many array entries.`);
        return item.map((entry, index) => walk(entry, `${itemPath}[${index}]`, depth + 1));
      }
      if (!isPlainObject(item)) {
        throw new Error(`${itemPath} must contain only YAML objects, arrays, strings, numbers, booleans, or null.`);
      }
      const entries = Object.entries(item);
      if (entries.length > 250) throw new Error(`${itemPath} contains too many properties.`);
      const result = {};
      for (const [key, entry] of entries) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) {
          throw new Error(`${itemPath}.${key} is not allowed.`);
        }
        result[key] = walk(entry, `${itemPath}.${key}`, depth + 1);
      }
      return result;
    };
    const normalized = walk(value, path, 0);
    if (!isPlainObject(normalized)) throw new Error(`${path} must be a YAML object/mapping.`);
    return normalized;
  }

  function deepMergeObjects(...sources) {
    const output = {};
    for (const source of sources) {
      if (!isPlainObject(source)) continue;
      for (const [key, value] of Object.entries(source)) {
        if (isPlainObject(value)) {
          output[key] = deepMergeObjects(isPlainObject(output[key]) ? output[key] : {}, value);
        } else if (Array.isArray(value)) {
          output[key] = value.map(item => isPlainObject(item) ? deepMergeObjects(item) : item);
        } else {
          output[key] = value;
        }
      }
    }
    return Object.keys(output).length ? output : null;
  }

  function numberInRange(value, fallback, path, min = 0, max = 1) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      throw new Error(`${path} must be a number from ${min} to ${max}.`);
    }
    return parsed;
  }

  function normalizeNumbering(value, fallback = 'auth') {
    const normalized = cleanString(value || fallback).toLowerCase();
    if (normalized === 'author') return 'auth';
    if (normalized === 'sequential') return 'label';
    if (normalized !== 'auth' && normalized !== 'label') {
      throw new Error(`numbering must be "auth" or "label", not "${normalized}".`);
    }
    return normalized;
  }

  function normalizeChains(value, fallback = null) {
    const source = value === undefined || value === null || value === '' ? fallback : value;
    if (source === undefined || source === null || source === '') return [];
    const list = Array.isArray(source) ? source : String(source).split(',');
    const normalized = [];
    for (const item of list) {
      const chain = String(item ?? '').trim();
      if (!chain || chain === '*' || chain.toLowerCase() === 'all') return [];
      if (!normalized.includes(chain)) normalized.push(chain);
    }
    return normalized;
  }

  function integerField(value, path) {
    const parsed = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isInteger(parsed) || Math.abs(parsed) > 100000000) {
      throw new Error(`${path} must be an integer residue number.`);
    }
    return parsed;
  }

  function normalizePositionList(value, path) {
    if (!Array.isArray(value)) {
      throw new Error(`${path} must be a YAML list such as [2, 10, 22].`);
    }
    if (value.length === 0) throw new Error(`${path} cannot be empty.`);
    if (value.length > MAX_POSITIONS_PER_REGION) {
      throw new Error(`${path} contains more than ${MAX_POSITIONS_PER_REGION} residue positions.`);
    }

    const positions = [];
    const seen = new Set();
    value.forEach((item, index) => {
      const position = integerField(item, `${path}[${index}]`);
      if (!seen.has(position)) {
        seen.add(position);
        positions.push(position);
      }
    });
    positions.sort((a, b) => a - b);
    return positions;
  }

  function compressPositions(positions) {
    const runs = [];
    let start = null;
    let end = null;
    for (const position of positions) {
      if (start === null) {
        start = position;
        end = position;
      } else if (position === end + 1) {
        end = position;
      } else {
        runs.push({ start, end });
        start = position;
        end = position;
      }
    }
    if (start !== null) runs.push({ start, end });
    return runs;
  }

  function selectorExpressionCount(region) {
    if (!region.enabled) return 0;
    const selections = region.selectionType === 'positions'
      ? compressPositions(region.positions).length
      : 1;
    return selections * Math.max(1, region.chains.length);
  }

  function createDefaultAnnotation(title = 'Untitled protein annotation') {
    return {
      version: '1',
      title: cleanString(title) || 'Untitled protein annotation',
      numbering: 'auth',
      defaultChains: [],
      viewer: {
        style: DEFAULT_VIEWER_STYLE,
        postprocessing: null,
        background: DEFAULT_BACKGROUND,
        showLabels: false,
        showTooltips: true,
        createComponents: true,
        componentRepresentation: 'cartoon',
        componentRepresentationParams: null,
        componentColorTheme: 'uniform',
        componentColorThemeParams: null,
        componentColor: DEFAULT_COMPONENT_COLOR,
        componentsVisible: true,
        componentOpacity: 1,
        baseComponentName: DEFAULT_BASE_COMPONENT_NAME,
        baseColor: '#CBD5E1',
        baseOpacity: 1
      },
      regions: [],
      msaReferences: {},
      unknownKeyWarnings: [],
      generatedWithoutYaml: true
    };
  }

  function parseYamlAnnotation(text, filename = 'annotation.yaml') {
    const yamlApi = window.jsyaml || window.jsYaml || window.JSYAML || window['js-yaml'];
    if (!yamlApi || typeof yamlApi.load !== 'function') {
      throw new Error('The YAML parser did not load. Check the js-yaml CDN request.');
    }

    let raw;
    try {
      raw = yamlApi.load(text, {
        filename,
        maxDepth: 50,
        maxAliases: 1000,
        maxTotalMergeKeys: 1000
      });
    } catch (error) {
      const message = error?.mark
        ? `${error.reason || error.message} at line ${error.mark.line + 1}, column ${error.mark.column + 1}`
        : error?.message || String(error);
      throw new Error(`Invalid YAML: ${message}`);
    }

    if (!isPlainObject(raw)) throw new Error('The YAML document must contain a top-level mapping/object.');
    const viewerRaw = isPlainObject(raw.viewer) ? raw.viewer : {};
    const unknownKeyWarnings = [];
    for (const key of findUnknownKeys(raw, KNOWN_TOP_LEVEL_KEYS)) {
      unknownKeyWarnings.push(`Unknown key "${key}" at the top level was ignored.`);
    }
    for (const key of findUnknownKeys(viewerRaw, KNOWN_VIEWER_KEYS)) {
      unknownKeyWarnings.push(`Unknown key "viewer.${key}" was ignored.`);
    }
    const globalNumbering = normalizeNumbering(raw.numbering ?? viewerRaw.numbering ?? 'auth');
    const defaultChains = normalizeChains(raw.default_chain ?? raw.defaultChain ?? raw.chain ?? null);
    const regionsRaw = raw.regions;
    if (!Array.isArray(regionsRaw)) throw new Error('The YAML file must contain a regions: list.');
    if (regionsRaw.length > MAX_REGIONS) throw new Error(`The YAML file contains more than ${MAX_REGIONS} regions.`);

    const viewerStyleRaw = normalizeViewerStyle(
      viewerRaw.style ?? viewerRaw.quick_style ?? viewerRaw.quickStyle ??
        viewerRaw.preset ?? viewerRaw.base_style ?? viewerRaw.baseStyle,
      DEFAULT_VIEWER_STYLE,
      'viewer.style'
    );
    const componentRepresentationDefault = viewerStyleRaw === 'illustrative' ? 'spacefill' : 'cartoon';
    const componentRepresentationRaw = normalizeRepresentation(
      viewerRaw.component_representation ?? viewerRaw.componentRepresentation ??
        viewerRaw.representation ?? raw.representation ?? componentRepresentationDefault,
      componentRepresentationDefault,
      'viewer.component_representation'
    );
    const componentColorThemeRaw = normalizeComponentColorTheme(
      viewerRaw.component_color_theme ?? viewerRaw.componentColorTheme ??
        viewerRaw.component_color_scheme ?? viewerRaw.componentColorScheme,
      viewerStyleRaw === 'illustrative' ? 'illustrative' : 'uniform',
      'viewer.component_color_theme'
    );
    const componentColorThemeParamsValue =
      viewerRaw.component_color_theme_params ?? viewerRaw.componentColorThemeParams ??
      viewerRaw.component_color_params ?? viewerRaw.componentColorParams;
    const componentColorThemeParamsRaw = componentColorThemeParamsValue !== undefined
      ? normalizeThemeParams(componentColorThemeParamsValue, 'viewer.component_color_theme_params')
      : componentColorThemeRaw === 'illustrative'
        ? deepMergeObjects(ILLUSTRATIVE_COLOR_THEME_PARAMS)
        : null;
    const componentRepresentationParamsRaw = deepMergeObjects(
      viewerStyleRaw === 'illustrative' ? ILLUSTRATIVE_REPRESENTATION_PARAMS : null,
      normalizeThemeParams(
        viewerRaw.component_representation_params ?? viewerRaw.componentRepresentationParams ??
          viewerRaw.representation_params ?? viewerRaw.representationParams,
        'viewer.component_representation_params'
      )
    );
    const postprocessingRaw = deepMergeObjects(
      viewerStyleRaw === 'illustrative' ? ILLUSTRATIVE_POSTPROCESSING : null,
      normalizeThemeParams(
        viewerRaw.postprocessing ?? viewerRaw.post_processing ?? viewerRaw.postProcessing,
        'viewer.postprocessing'
      )
    );
    const componentColorRaw = normalizeOptionalColor(
      viewerRaw.component_color ?? viewerRaw.componentColor,
      'viewer.component_color'
    ) || DEFAULT_COMPONENT_COLOR;

    const annotation = {
      version: String(raw.version ?? 1),
      title: cleanString(raw.title) || filename,
      numbering: globalNumbering,
      defaultChains,
      viewer: {
        style: viewerStyleRaw,
        postprocessing: postprocessingRaw,
        background: normalizeColor(viewerRaw.background ?? raw.background, DEFAULT_BACKGROUND, 'viewer.background'),
        showLabels: toBoolean(viewerRaw.show_labels ?? viewerRaw.showLabels ?? raw.show_labels, false),
        showTooltips: toBoolean(viewerRaw.show_tooltips ?? viewerRaw.showTooltips ?? raw.show_tooltips, true),
        createComponents: toBoolean(viewerRaw.create_components ?? viewerRaw.createComponents, true),
        componentRepresentation: componentRepresentationRaw,
        componentRepresentationParams: componentRepresentationParamsRaw,
        componentColorTheme: componentColorThemeRaw,
        componentColorThemeParams: componentColorThemeParamsRaw,
        componentColor: componentColorRaw,
        componentsVisible: toBoolean(viewerRaw.components_visible ?? viewerRaw.componentsVisible, true),
        componentOpacity: numberInRange(
          viewerRaw.component_opacity ?? viewerRaw.componentOpacity,
          1,
          'viewer.component_opacity'
        ),
        baseComponentName: cleanString(viewerRaw.base_component_name ?? viewerRaw.baseComponentName) || DEFAULT_BASE_COMPONENT_NAME,
        baseColor: normalizeColor(
          viewerRaw.base_color ?? viewerRaw.baseColor,
          DEFAULT_BASE_COMPONENT_COLOR,
          'viewer.base_color'
        ),
        baseOpacity: numberInRange(
          viewerRaw.base_opacity ?? viewerRaw.baseOpacity,
          DEFAULT_BASE_COMPONENT_OPACITY,
          'viewer.base_opacity'
        )
      },
      regions: []
    };

    const msaRaw = isPlainObject(raw.msa) ? raw.msa : {};
    for (const key of findUnknownKeys(msaRaw, KNOWN_MSA_KEYS)) {
      unknownKeyWarnings.push(`Unknown key "msa.${key}" was ignored.`);
    }
    const referencesRaw = isPlainObject(msaRaw.references ?? msaRaw.reference) ? (msaRaw.references ?? msaRaw.reference) : {};
    const msaReferences = {};
    for (const [chainKey, value] of Object.entries(referencesRaw)) {
      const ref = cleanString(value);
      if (ref) msaReferences[chainKey] = ref;
    }
    annotation.msaReferences = msaReferences;

    regionsRaw.forEach((entry, index) => {
      const path = `regions[${index}]`;
      if (!isPlainObject(entry)) throw new Error(`${path} must be an object.`);
      for (const key of findUnknownKeys(entry, KNOWN_REGION_KEYS)) {
        unknownKeyWarnings.push(`Unknown key "${path}.${key}" was ignored.`);
      }
      const enabled = toBoolean(entry.enabled, true);
      const name = cleanString(entry.name || entry.label || entry.title);
      if (!name) throw new Error(`${path}.name is required.`);

      const positionsValue =
        entry.positions ?? entry.residues ?? entry.residue_positions ?? entry.residuePositions ??
        entry.position_list ?? entry.positionList;
      const hasPositionList = positionsValue !== undefined && positionsValue !== null;
      const singleResidue = entry.residue ?? entry.position;
      const startValue = entry.start ?? entry.begin ?? entry.from ?? singleResidue;
      const endValue = entry.end ?? entry.stop ?? entry.to ?? singleResidue;
      const hasRangeSelection = startValue !== undefined || endValue !== undefined;

      if (hasPositionList && hasRangeSelection) {
        throw new Error(
          `${path} must use either positions: [...] or start/end (or residue), not both in the same region.`
        );
      }

      let selectionType;
      let positions = [];
      let start = null;
      let end = null;
      if (hasPositionList) {
        selectionType = 'positions';
        positions = normalizePositionList(positionsValue, `${path}.positions`);
      } else {
        selectionType = 'range';
        if (startValue === undefined || endValue === undefined) {
          throw new Error(
            `${path} requires either start and end residue numbers, one residue/position, or positions: [...].`
          );
        }
        start = integerField(startValue, `${path}.start`);
        end = integerField(endValue, `${path}.end`);
        if (start > end) throw new Error(`${path}.start (${start}) cannot be greater than end (${end}).`);
      }

      const numbering = normalizeNumbering(entry.numbering, globalNumbering);
      const chainValue = entry.chains ?? entry.chain ?? entry.chain_id ?? entry.chainId;
      const chains = normalizeChains(chainValue, defaultChains);
      const color = normalizeOptionalColor(entry.color ?? entry.colour, `${path}.color`);
      const description = cleanString(entry.description || entry.note || '');
      const createComponent = toBoolean(
        entry.create_component ?? entry.createComponent ?? entry.component,
        annotation.viewer.createComponents
      );
      const componentName = cleanString(entry.component_name ?? entry.componentName) || name;
      const componentRepresentation = normalizeRepresentation(
        entry.component_representation ?? entry.componentRepresentation ?? entry.representation,
        annotation.viewer.componentRepresentation,
        `${path}.component_representation`
      );
      const componentRepresentationParams = deepMergeObjects(
        annotation.viewer.componentRepresentationParams,
        normalizeThemeParams(
          entry.component_representation_params ?? entry.componentRepresentationParams ??
            entry.representation_params ?? entry.representationParams,
          `${path}.component_representation_params`
        )
      );
      const explicitComponentColor = normalizeOptionalColor(
        entry.component_color ?? entry.componentColor ?? entry.component_colour,
        `${path}.component_color`
      );
      const componentColorThemeValue =
        entry.component_color_theme ?? entry.componentColorTheme ??
        entry.component_color_scheme ?? entry.componentColorScheme;
      const componentColorThemeFallback = color || explicitComponentColor
        ? 'uniform'
        : annotation.viewer.componentColorTheme;
      const componentColorTheme = normalizeComponentColorTheme(
        componentColorThemeValue,
        componentColorThemeFallback,
        `${path}.component_color_theme`
      );
      const componentColorThemeParamsValue =
        entry.component_color_theme_params ?? entry.componentColorThemeParams ??
        entry.component_color_params ?? entry.componentColorParams;
      const inheritedThemeParams = componentColorTheme === annotation.viewer.componentColorTheme
        ? annotation.viewer.componentColorThemeParams
        : componentColorTheme === 'illustrative'
          ? deepMergeObjects(ILLUSTRATIVE_COLOR_THEME_PARAMS)
          : null;
      const componentColorThemeParams = componentColorThemeParamsValue !== undefined
        ? deepMergeObjects(
            inheritedThemeParams,
            normalizeThemeParams(componentColorThemeParamsValue, `${path}.component_color_theme_params`)
          )
        : inheritedThemeParams;
      const componentColor = explicitComponentColor || color || annotation.viewer.componentColor || DEFAULT_COMPONENT_COLOR;
      const componentOpacity = numberInRange(
        entry.component_opacity ?? entry.componentOpacity,
        annotation.viewer.componentOpacity,
        `${path}.component_opacity`
      );

      annotation.regions.push({
        index,
        enabled,
        name,
        selectionType,
        start,
        end,
        positions,
        color,
        numbering,
        chains,
        label: toBoolean(entry.label_3d ?? entry.show_label ?? entry.label, annotation.viewer.showLabels),
        tooltip: toBoolean(entry.tooltip, annotation.viewer.showTooltips),
        description,
        createComponent,
        componentName,
        componentRepresentation,
        componentRepresentationParams,
        componentColorTheme,
        componentColorThemeParams,
        componentColor,
        componentOpacity,
        componentVisible: toBoolean(
          entry.component_visible ?? entry.componentVisible,
          annotation.viewer.componentsVisible
        )
      });
    });

    const enabledCount = annotation.regions.filter(region => region.enabled).length;

    const componentNodeCount = annotation.regions.filter(createsMvsComponent).length;
    if (componentNodeCount > MAX_COMPONENTS) {
      throw new Error(
        `The YAML file would create ${componentNodeCount} Mol* components. ` +
        `The safety limit is ${MAX_COMPONENTS}; disable create_component, tooltip, or label on some entries.`
      );
    }

    const selectorExpressionCountTotal = annotation.regions.reduce(
      (total, region) => total + selectorExpressionCount(region),
      0
    );
    if (selectorExpressionCountTotal > MAX_SELECTOR_EXPRESSIONS) {
      throw new Error(
        `The YAML file would create ${selectorExpressionCountTotal} residue-selector expressions. ` +
        `The safety limit is ${MAX_SELECTOR_EXPRESSIONS}; reduce very large positions lists or split the annotation.`
      );
    }
    annotation.unknownKeyWarnings = unknownKeyWarnings;
    return annotation;
  }

  function parsePdbInfo(text) {
    const chains = new Map();
    let atomCount = 0;
    let heteroAtomCount = 0;
    let inFirstModel = true;
    let sawModel = false;

    for (const line of text.split(/\r?\n/)) {
      const record = line.slice(0, 6).trim();
      if (record === 'MODEL') {
        if (!sawModel) {
          sawModel = true;
          inFirstModel = true;
        } else {
          inFirstModel = false;
        }
        continue;
      }
      if (record === 'ENDMDL' && sawModel && inFirstModel) {
        inFirstModel = false;
        continue;
      }
      if (sawModel && !inFirstModel) continue;
      if (record !== 'ATOM' && record !== 'HETATM') continue;
      if (record === 'HETATM') heteroAtomCount += 1;
      if (record !== 'ATOM') continue;

      atomCount += 1;
      const chain = line.length > 21 ? line.slice(21, 22).trim() : '';
      const authSeq = Number.parseInt(line.slice(22, 26).trim(), 10);
      const insertion = line.length > 26 ? line.slice(26, 27).trim() : '';
      const residueName = line.length > 20 ? line.slice(17, 20).trim() : '';
      if (!Number.isInteger(authSeq)) continue;

      if (!chains.has(chain)) chains.set(chain, { chain, residues: [], seen: new Set(), authNumbers: new Set(), labelNumbers: new Set() });
      const item = chains.get(chain);
      const key = `${authSeq}:${insertion}:${residueName}`;
      if (!item.seen.has(key)) {
        item.seen.add(key);
        item.residues.push({ authSeq, insertion, residueName, labelSeq: item.residues.length + 1, labelSeqFromFile: false });
        item.authNumbers.add(authSeq);
        item.labelNumbers.add(item.residues.length);
      }
    }

    if (atomCount === 0) throw new Error('The PDB file does not contain any ATOM records.');
    const chainItems = Array.from(chains.values()).map(item => ({
      ...item,
      minAuth: item.residues.length ? Math.min(...item.residues.map(residue => residue.authSeq)) : null,
      maxAuth: item.residues.length ? Math.max(...item.residues.map(residue => residue.authSeq)) : null
    }));
    return { atomCount, heteroAtomCount, chains: chainItems };
  }

  // --- mmCIF support -------------------------------------------------------
  // A lightweight mmCIF reader that extracts only the `_atom_site` loop,
  // which is all this viewer needs (chain IDs and residue numbers per
  // chain). It is not a full CIF parser: it supports quoted values, blank
  // lines, comments, and semicolon-delimited text fields inside the loop,
  // which covers the mmCIF files produced by the PDB and by Mol*/other
  // common structural biology tools.

  function tokenizeCifLine(line) {
    const tokens = [];
    const length = line.length;
    let index = 0;
    while (index < length) {
      while (index < length && /\s/.test(line[index])) index += 1;
      if (index >= length) break;
      const char = line[index];
      if (char === "'" || char === '"') {
        let end = index + 1;
        while (end < length) {
          if (line[end] === char && (end + 1 >= length || /\s/.test(line[end + 1]))) break;
          end += 1;
        }
        tokens.push(line.slice(index + 1, end));
        index = end + 1;
      } else {
        let end = index;
        while (end < length && !/\s/.test(line[end])) end += 1;
        tokens.push(line.slice(index, end));
        index = end;
      }
    }
    return tokens;
  }

  function parseCifAtomSiteLoop(text) {
    const lines = text.split(/\r?\n/);
    const total = lines.length;
    let i = 0;
    while (i < total) {
      if (lines[i].trim().toLowerCase() === 'loop_') {
        let j = i + 1;
        const tags = [];
        while (j < total) {
          const trimmed = lines[j].trim();
          if (trimmed.startsWith('_')) {
            tags.push(trimmed.split(/\s+/)[0]);
            j += 1;
          } else {
            break;
          }
        }
        if (tags.length && tags[0].toLowerCase().startsWith('_atom_site.')) {
          const lowerTags = tags.map(tag => tag.toLowerCase());
          const tokens = [];
          let k = j;
          while (k < total) {
            const trimmed = lines[k].trim();
            if (trimmed === '' || trimmed.startsWith('#')) {
              k += 1;
              continue;
            }
            const lower = trimmed.toLowerCase();
            if (
              trimmed.startsWith('_') || lower === 'loop_' || lower.startsWith('data_') ||
              lower.startsWith('save_') || lower === 'stop_'
            ) {
              break;
            }
            if (trimmed.startsWith(';')) {
              let block = trimmed.slice(1);
              k += 1;
              while (k < total && !lines[k].trim().startsWith(';')) {
                block += `\n${lines[k]}`;
                k += 1;
              }
              k += 1;
              tokens.push(block);
              continue;
            }
            tokens.push(...tokenizeCifLine(trimmed));
            k += 1;
          }
          const rows = [];
          const columnCount = tags.length;
          for (let start = 0; start + columnCount <= tokens.length; start += columnCount) {
            const row = {};
            for (let column = 0; column < columnCount; column += 1) {
              row[lowerTags[column]] = tokens[start + column];
            }
            rows.push(row);
          }
          if (rows.length) return rows;
        }
        i = j;
        continue;
      }
      i += 1;
    }
    return null;
  }

  function parseCifInfo(text) {
    const rows = parseCifAtomSiteLoop(text);
    if (!rows || !rows.length) {
      throw new Error('The CIF file does not contain a usable _atom_site loop with atom records.');
    }

    const chains = new Map();
    let atomCount = 0;
    let heteroAtomCount = 0;
    let firstModel = null;

    for (const row of rows) {
      const modelNum = row['_atom_site.pdbx_pdb_model_num'];
      if (modelNum !== undefined) {
        if (firstModel === null) firstModel = modelNum;
        else if (modelNum !== firstModel) continue;
      }

      const groupPdb = (row['_atom_site.group_pdb'] || 'ATOM').toUpperCase();
      if (groupPdb === 'HETATM') {
        heteroAtomCount += 1;
        continue;
      }
      if (groupPdb !== 'ATOM') continue;

      const authSeq = Number.parseInt(row['_atom_site.auth_seq_id'], 10);
      if (!Number.isInteger(authSeq)) continue;
      atomCount += 1;

      const chainId = row['_atom_site.auth_asym_id'] ?? '';
      const insertionRaw = row['_atom_site.pdbx_pdb_ins_code'] ?? '';
      const insertion = insertionRaw === '.' || insertionRaw === '?' ? '' : insertionRaw;
      const residueName = row['_atom_site.label_comp_id'] ?? row['_atom_site.auth_comp_id'] ?? '';
      const labelSeqValue = Number.parseInt(row['_atom_site.label_seq_id'], 10);

      if (!chains.has(chainId)) {
        chains.set(chainId, { chain: chainId, residues: [], seen: new Set(), authNumbers: new Set(), labelNumbers: new Set() });
      }
      const item = chains.get(chainId);
      const key = `${authSeq}:${insertion}:${residueName}`;
      if (!item.seen.has(key)) {
        item.seen.add(key);
        const labelSeqFromFile = Number.isInteger(labelSeqValue);
        const labelSeq = labelSeqFromFile ? labelSeqValue : item.residues.length + 1;
        item.residues.push({ authSeq, insertion, residueName, labelSeq, labelSeqFromFile });
        item.authNumbers.add(authSeq);
        item.labelNumbers.add(labelSeq);
      }
    }

    if (atomCount === 0) throw new Error('The CIF file does not contain any ATOM records in the first model.');
    const chainItems = Array.from(chains.values()).map(item => ({
      ...item,
      minAuth: item.residues.length ? Math.min(...item.residues.map(residue => residue.authSeq)) : null,
      maxAuth: item.residues.length ? Math.max(...item.residues.map(residue => residue.authSeq)) : null
    }));
    return { atomCount, heteroAtomCount, chains: chainItems };
  }

  function detectStructureFormat(filename, text) {
    const lower = String(filename || '').toLowerCase();
    if (lower.endsWith('.cif') || lower.endsWith('.mmcif')) return 'mmcif';
    if (lower.endsWith('.pdb') || lower.endsWith('.ent')) return 'pdb';
    const sample = String(text || '').slice(0, 400);
    if (/^\s*data_/i.test(sample)) return 'mmcif';
    return 'pdb';
  }

  function parseStructureInfo(text, format) {
    return format === 'mmcif' ? parseCifInfo(text) : parsePdbInfo(text);
  }
  // --- end mmCIF support ----------------------------------------------------

  // --- MSA (FASTA alignment) support ---------------------------------------
  // Parses an aligned FASTA file, matches each referenced chain (declared in
  // YAML under msa.references) to a FASTA record by sequence, and builds a
  // column -> auth_seq_id map so a click on the alignment can select the
  // corresponding residue in the 3D structure via viewer.structureInteractivity.

  function parseFasta(text) {
    const records = [];
    let current = null;
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith(';')) continue;
      if (line.startsWith('>')) {
        const header = line.slice(1).trim();
        const id = header.split(/\s+/)[0] || `seq${records.length + 1}`;
        current = { id, header: header || id, sequence: '' };
        records.push(current);
      } else if (current) {
        current.sequence += line.replace(/\s+/g, '');
      }
    }
    if (!records.length) {
      throw new Error('The FASTA file does not contain any sequences (lines starting with ">").');
    }
    const columnCount = records[0].sequence.length;
    for (const record of records) {
      if (record.sequence.length !== columnCount) {
        throw new Error(
          `All aligned sequences must have the same length. "${record.id}" has ${record.sequence.length} columns, expected ${columnCount}.`
        );
      }
    }
    if (columnCount > MAX_MSA_COLUMNS) {
      throw new Error(`The alignment has ${columnCount} columns, exceeding the safety limit of ${MAX_MSA_COLUMNS}.`);
    }
    if (records.length > MAX_MSA_SEQUENCES) {
      throw new Error(`The alignment has ${records.length} sequences, exceeding the safety limit of ${MAX_MSA_SEQUENCES}.`);
    }
    return { records, columnCount };
  }

  function ungapWithColumns(sequence) {
    const letters = [];
    const columns = [];
    for (let i = 0; i < sequence.length; i += 1) {
      const char = sequence[i];
      if (char !== '-' && char !== '.' && char !== ' ') {
        letters.push(char.toUpperCase());
        columns.push(i);
      }
    }
    return { letters: letters.join(''), columns };
  }

  function chainOneLetterSequence(chain) {
    const entries = [];
    const residues = chain.residues || [];
    const usePolymerLabelPositions = residues.length > 0 && residues.every(
      residue => residue.labelSeqFromFile === true && Number.isFinite(Number(residue.labelSeq))
    );
    const positionFor = residue => usePolymerLabelPositions
      ? Number(residue.labelSeq)
      : Number(residue.authSeq);
    let previousPosition = null;

    for (const residue of residues) {
      const position = positionFor(residue);
      if (Number.isFinite(previousPosition) && Number.isFinite(position)) {
        const missingCount = Math.trunc(position - previousPosition - 1);
        if (missingCount > 0 && missingCount <= MAX_STRUCTURE_SEQUENCE_GAP) {
          for (let offset = 0; offset < missingCount; offset += 1) {
            entries.push({ letter: 'X', residue: null, structuralGap: true });
          }
        }
      }
      const letter = RESIDUE_ONE_LETTER[String(residue.residueName || '').toUpperCase()] || 'X';
      entries.push({ letter, residue, structuralGap: false });
      if (Number.isFinite(position)) previousPosition = position;
    }

    return {
      letters: entries.map(entry => entry.letter).join(''),
      entries,
      observedLength: residues.length,
      gapAwareNumbering: usePolymerLabelPositions ? 'label' : 'auth'
    };
  }

  // Structure and MSA records may represent different slices of the same
  // biological sequence. The YAML explicitly declares the intended reference,
  // so the mapper trusts that relationship: it first accepts exact containment
  // in either direction and otherwise uses one permissive affine-gap local
  // alignment. Internal gaps are allowed, unrelated terminal overhangs are left
  // outside the shared segment, and no identity threshold blocks the mapping.

  function normalizeInsertionCode(value) {
    const code = String(value ?? '').trim();
    return code === '.' || code === '?' ? '' : code;
  }

  function residueLookupKey(authSeq, insertion = '') {
    return `${Number(authSeq)}:${normalizeInsertionCode(insertion)}`;
  }

  function summarizeAlignmentPairs(pairs, chainLetters, fastaLetters, gaps, score, method, ambiguous = false) {
    let matches = 0;
    let mismatches = 0;
    let unknownPairs = 0;
    for (const [chainIndex, fastaIndex] of pairs) {
      const a = chainLetters[chainIndex];
      const b = fastaLetters[fastaIndex];
      if (a === 'X' || b === 'X') unknownPairs += 1;
      else if (a === b) matches += 1;
      else mismatches += 1;
    }
    const comparablePairs = matches + mismatches;
    return {
      pairs,
      identity: comparablePairs ? matches / comparablePairs : 0,
      matches,
      mismatches,
      unknownPairs,
      gaps,
      score,
      method,
      ambiguous
    };
  }

  function exactOverlapPairs(chainLetters, fastaLetters) {
    if (!chainLetters.length || !fastaLetters.length) return null;

    const chainInsideReference = fastaLetters.indexOf(chainLetters);
    if (chainInsideReference !== -1) {
      const repeated = fastaLetters.indexOf(chainLetters, chainInsideReference + 1) !== -1;
      const pairs = Array.from({ length: chainLetters.length }, (_, index) => [index, chainInsideReference + index]);
      return summarizeAlignmentPairs(
        pairs,
        chainLetters,
        fastaLetters,
        0,
        chainLetters.length * 5,
        chainLetters.length === fastaLetters.length ? 'exact' : 'exact-chain-slice',
        repeated
      );
    }

    const referenceInsideChain = chainLetters.indexOf(fastaLetters);
    if (referenceInsideChain !== -1) {
      const repeated = chainLetters.indexOf(fastaLetters, referenceInsideChain + 1) !== -1;
      const pairs = Array.from({ length: fastaLetters.length }, (_, index) => [referenceInsideChain + index, index]);
      return summarizeAlignmentPairs(
        pairs,
        chainLetters,
        fastaLetters,
        0,
        fastaLetters.length * 5,
        'exact-reference-slice',
        repeated
      );
    }

    return null;
  }

  function overlapPairScore(a, b) {
    if (a === b && a !== 'X') return 5;
    if (a === 'X' || b === 'X') return 0;
    return -4;
  }

  // Permissive local affine-gap alignment. The YAML already declares the
  // biological relationship, so the mapper looks for the best shared segment
  // anywhere in either input and does not reject it by identity or length.
  // This keeps unrelated terminal tags, linkers, and slice overhangs outside
  // the map while retaining internal substitutions and gaps inside the shared
  // segment.
  function permissiveLocalAffineMap(chainLetters, fastaLetters, maxCells) {
    const n = chainLetters.length;
    const m = fastaLetters.length;
    if (!n || !m) return null;
    if (n * m > maxCells) return { method: 'too-large', pairs: [] };

    const GAP_OPEN = -7;
    const GAP_EXTEND = -1;
    const NEGATIVE_INFINITY = -1000000000;

    let hPrev = new Int32Array(m + 1);
    let hCur = new Int32Array(m + 1);
    let ePrev = new Int32Array(m + 1);
    let eCur = new Int32Array(m + 1);
    ePrev.fill(NEGATIVE_INFINITY);
    eCur.fill(NEGATIVE_INFINITY);

    // Low two bits: H direction (0 local start, 1 diagonal, 2 E/up, 3 F/left).
    // Bit 2: E extends from E. Bit 3: F extends from F.
    const traceback = new Uint8Array(n * m);
    let bestScore = 0;
    let bestI = 0;
    let bestJ = 0;

    for (let i = 1; i <= n; i += 1) {
      hCur[0] = 0;
      eCur[0] = NEGATIVE_INFINITY;
      let fScore = NEGATIVE_INFINITY;

      for (let j = 1; j <= m; j += 1) {
        const eOpen = hPrev[j] + GAP_OPEN;
        const eExtend = ePrev[j] + GAP_EXTEND;
        const eExtended = eExtend > eOpen;
        const eScore = eExtended ? eExtend : eOpen;
        eCur[j] = eScore;

        const fOpen = hCur[j - 1] + GAP_OPEN;
        const fExtend = fScore + GAP_EXTEND;
        const fExtended = fExtend > fOpen;
        fScore = fExtended ? fExtend : fOpen;

        const diagonal = hPrev[j - 1] + overlapPairScore(chainLetters[i - 1], fastaLetters[j - 1]);
        let score = 0;
        let direction = 0;
        if (diagonal > score) { score = diagonal; direction = 1; }
        if (eScore > score) { score = eScore; direction = 2; }
        if (fScore > score) { score = fScore; direction = 3; }
        hCur[j] = score;
        traceback[(i - 1) * m + (j - 1)] = direction | (eExtended ? 4 : 0) | (fExtended ? 8 : 0);

        if (score > bestScore) {
          bestScore = score;
          bestI = i;
          bestJ = j;
        }
      }

      [hPrev, hCur] = [hCur, hPrev];
      [ePrev, eCur] = [eCur, ePrev];
    }

    if (bestScore <= 0) return null;

    const pairs = [];
    let i = bestI;
    let j = bestJ;
    let stateName = 'H';
    let gaps = 0;

    while (i > 0 && j > 0) {
      const pointer = traceback[(i - 1) * m + (j - 1)];
      if (stateName === 'H') {
        const direction = pointer & 3;
        if (direction === 0) break;
        if (direction === 1) {
          i -= 1;
          j -= 1;
          pairs.push([i, j]);
        } else if (direction === 2) {
          stateName = 'E';
        } else {
          stateName = 'F';
        }
      } else if (stateName === 'E') {
        const extended = Boolean(pointer & 4);
        i -= 1;
        gaps += 1;
        stateName = extended ? 'E' : 'H';
      } else {
        const extended = Boolean(pointer & 8);
        j -= 1;
        gaps += 1;
        stateName = extended ? 'F' : 'H';
      }
    }

    pairs.reverse();
    return summarizeAlignmentPairs(
      pairs,
      chainLetters,
      fastaLetters,
      gaps,
      bestScore,
      'permissive-local-affine'
    );
  }

  function buildMsaMatch(chain, chainSequence, columns, chainLetters, fastaLetters, alignment) {
    const columnToResidue = new Map();
    const columnToAuthSeq = new Map();
    const residueToColumn = new Map();
    const authSeqToColumns = new Map();

    for (const [chainIndex, fastaIndex] of alignment?.pairs || []) {
      const residue = chainSequence.entries[chainIndex]?.residue || null;
      const column = columns[fastaIndex];
      if (!residue || column === undefined) continue;
      const mappedResidue = {
        authSeq: residue.authSeq,
        insertion: normalizeInsertionCode(residue.insertion),
        labelSeq: residue.labelSeq,
        chainIndex,
        fastaIndex
      };
      columnToResidue.set(column, mappedResidue);
      columnToAuthSeq.set(column, residue.authSeq);
      residueToColumn.set(residueLookupKey(residue.authSeq, residue.insertion), column);
      if (!authSeqToColumns.has(residue.authSeq)) authSeqToColumns.set(residue.authSeq, new Set());
      authSeqToColumns.get(residue.authSeq).add(column);
    }

    const mappedResidues = columnToResidue.size;
    return {
      columnToResidue,
      columnToAuthSeq,
      residueToColumn,
      authSeqToColumns,
      identity: alignment?.identity || 0,
      matches: alignment?.matches || 0,
      mismatches: alignment?.mismatches || 0,
      unknownPairs: alignment?.unknownPairs || 0,
      gaps: alignment?.gaps || 0,
      score: alignment?.score || 0,
      method: alignment?.method || 'unknown',
      ambiguous: Boolean(alignment?.ambiguous),
      reliable: mappedResidues > 0,
      failureReason: alignment?.method === 'too-large' ? 'too-large' : mappedResidues ? '' : 'no-overlap',
      mappedResidues,
      chainLength: chainSequence.observedLength,
      chainAlignmentLength: chainLetters.length,
      gapAwareNumbering: chainSequence.gapAwareNumbering,
      referenceLength: fastaLetters.length,
      chainCoverage: chainSequence.observedLength ? mappedResidues / chainSequence.observedLength : 0,
      referenceCoverage: fastaLetters.length ? mappedResidues / fastaLetters.length : 0
    };
  }

  function findFastaRecordByReference(msaResult, reference) {
    return msaResult.records.findIndex(record => record.id === reference || record.header === reference);
  }

  function matchChainToFastaRecord(chain, record) {
    const chainSequence = chainOneLetterSequence(chain);
    const { letters: chainLetters } = chainSequence;
    if (!chainLetters.length) return null;
    const { letters: fastaLetters, columns } = ungapWithColumns(record.sequence);
    if (!fastaLetters.length) return null;

    const alignment = exactOverlapPairs(chainLetters, fastaLetters)
      || permissiveLocalAffineMap(chainLetters, fastaLetters, OVERLAP_ALIGNMENT_MAX_CELLS);
    if (!alignment) return null;
    return buildMsaMatch(chain, chainSequence, columns, chainLetters, fastaLetters, alignment);
  }

  // Only chain/reference relationships explicitly declared in msa.references
  // are used. Once declared, the viewer trusts the author-provided reference
  // and accepts the best available overlap instead of blocking it on identity,
  // length, uniqueness, or conservative boundary thresholds.
  function computeMsaRowLinks(pdbInfo, msaResult, msaReferences) {
    const rowLinks = new Map();
    const chainLinks = new Map();
    const warnings = [];
    for (const [chainId, reference] of Object.entries(msaReferences || {})) {
      const chain = pdbInfo.chains.find(item => item.chain === chainId);
      if (!chain) {
        warnings.push(`msa.references has an entry for chain "${chainId}", which was not found in the loaded structure.`);
        continue;
      }
      const recordIndex = findFastaRecordByReference(msaResult, reference);
      if (recordIndex === -1) {
        warnings.push(`msa.references for chain "${chainId}" refers to "${reference}", which was not found as a sequence id or header in the FASTA file.`);
        continue;
      }
      const match = matchChainToFastaRecord(chain, msaResult.records[recordIndex]);
      if (!match || !match.columnToResidue?.size) {
        const reason = match?.failureReason === 'too-large'
          ? 'the pair exceeded the browser alignment safety limit'
          : 'no shared sequence segment was found';
        warnings.push(`Chain "${chainId}" could not be linked to "${reference}": ${reason}.`);
        continue;
      }
      const link = {
        row: recordIndex,
        chain: chainId,
        reference,
        ...match
      };
      chainLinks.set(chainId, link);
      if (!rowLinks.has(recordIndex)) rowLinks.set(recordIndex, link);

      const comparable = match.matches + match.mismatches;
      if (comparable >= 10 && match.identity < 0.5) {
        warnings.push(
          `Chain "${chainId}" was linked permissively to "${reference}" at ${Math.round(match.identity * 100)}% identity. ` +
          'The mapping remains active because msa.references is treated as author-confirmed.'
        );
      }
    }
    return { rowLinks, chainLinks, warnings };
  }
  // --- end MSA support -------------------------------------------------------

  function regionCoverage(region, pdbInfo) {
    const targetChains = region.chains.length
      ? pdbInfo.chains.filter(item => region.chains.includes(item.chain))
      : pdbInfo.chains;
    const missingChains = region.chains.filter(chain => !pdbInfo.chains.some(item => item.chain === chain));
    let matched = 0;

    if (region.selectionType === 'positions') {
      const missingPositions = [];
      for (const chain of targetChains) {
        const numbers = region.numbering === 'auth' ? chain.authNumbers : chain.labelNumbers;
        const missing = [];
        for (const position of region.positions) {
          if (numbers.has(position)) matched += 1;
          else missing.push(position);
        }
        if (missing.length) missingPositions.push({ chain: chain.chain, positions: missing });
      }
      const requestedChainCount = region.chains.length || targetChains.length;
      const requested = region.positions.length * requestedChainCount;
      const complete = missingChains.length === 0 && requested > 0 && matched === requested;
      return {
        matched,
        requested,
        complete,
        partial: matched > 0 && !complete,
        missingChains,
        missingPositions
      };
    }

    for (const chain of targetChains) {
      const numbers = region.numbering === 'auth' ? chain.authNumbers : chain.labelNumbers;
      for (const value of numbers) {
        if (value >= region.start && value <= region.end) matched += 1;
      }
    }
    return {
      matched,
      requested: null,
      complete: matched > 0 && missingChains.length === 0,
      partial: false,
      missingChains,
      missingPositions: []
    };
  }

  function makeSelector(region) {
    const chainKey = region.numbering === 'auth' ? 'auth_asym_id' : 'label_asym_id';
    const startKey = region.numbering === 'auth' ? 'beg_auth_seq_id' : 'beg_label_seq_id';
    const endKey = region.numbering === 'auth' ? 'end_auth_seq_id' : 'end_label_seq_id';
    const ranges = region.selectionType === 'positions'
      ? compressPositions(region.positions)
      : [{ start: region.start, end: region.end }];
    const chains = region.chains.length ? region.chains : [null];
    const selectors = [];

    for (const chain of chains) {
      for (const range of ranges) {
        const selector = { [startKey]: range.start, [endKey]: range.end };
        if (chain !== null && chain !== undefined) selector[chainKey] = chain;
        selectors.push(selector);
      }
    }
    return selectors.length === 1 ? selectors[0] : selectors;
  }

  function makeBaseSelector(annotation) {
    if (!annotation.defaultChains.length) return 'protein';
    const chainKey = annotation.numbering === 'auth' ? 'auth_asym_id' : 'label_asym_id';
    const selectors = annotation.defaultChains.map(chain => ({ [chainKey]: chain }));
    return selectors.length === 1 ? selectors[0] : selectors;
  }

  function formatPositionList(positions, limit = 12) {
    if (positions.length <= limit) return positions.join(', ');
    const visible = positions.slice(0, limit).join(', ');
    return `${visible}, … (+${positions.length - limit})`;
  }

  function regionSelectionText(region, compact = false) {
    if (region.selectionType === 'positions') {
      const list = formatPositionList(region.positions, compact ? 8 : 20);
      return `positions [${list}]`;
    }
    return `residues ${region.start}–${region.end}`;
  }

  function regionCoverageWarning(region) {
    return region.coverage.matched === 0 || region.coverage.partial;
  }

  function missingPositionText(region) {
    if (!region.coverage.missingPositions?.length) return '';
    const groups = region.coverage.missingPositions.slice(0, 4).map(item => {
      const chain = displayChain(item.chain);
      return `${chain}: ${formatPositionList(item.positions, 8)}`;
    });
    const extra = region.coverage.missingPositions.length > 4
      ? `; … (+${region.coverage.missingPositions.length - 4} chains)`
      : '';
    return ` Missing positions by chain: ${groups.join('; ')}${extra}.`;
  }

  function regionTooltip(region) {
    const chainText = region.chains.length ? `chain ${region.chains.join(', ')}` : 'all chains';
    const base = `${region.name} · ${chainText} · ${region.numbering} ${regionSelectionText(region)}`;
    return region.description ? `${base} · ${region.description}` : base;
  }

  function createsMvsComponent(region) {
    return region.enabled && (region.createComponent || region.tooltip || region.label);
  }

  function applyRepresentationColor(representation, theme, uniformColor, themeParams) {
    if (theme === 'uniform') {
      representation.color({ color: uniformColor });
      return;
    }
    if (theme === 'default') {
      representation.color({
        custom: { molstar_use_default_coloring: true }
      });
      return;
    }
    const custom = { molstar_color_theme_name: theme };
    if (themeParams) custom.molstar_color_theme_params = themeParams;
    representation.color({ custom });
  }

  function applyComponentColor(representation, region) {
    applyRepresentationColor(
      representation,
      region.componentColorTheme,
      region.componentColor,
      region.componentColorThemeParams
    );
  }


  function buildMvsData(structureObjectUrl, annotation, structureFormat) {
    const extension = window.molstar?.PluginExtensions?.mvs;
    if (!extension?.MVSData?.createBuilder || typeof extension.loadMVS !== 'function') {
      throw new Error('The MolViewSpec extension is not available in the loaded Mol* bundle.');
    }

    const builder = extension.MVSData.createBuilder();
    const canvasParams = { background_color: annotation.viewer.background };
    if (annotation.viewer.postprocessing) {
      canvasParams.custom = {
        molstar_postprocessing: annotation.viewer.postprocessing
      };
    }
    builder.canvas(canvasParams);
    const structure = builder
      .download({ url: structureObjectUrl })
      .parse({ format: structureFormat === 'mmcif' ? 'mmcif' : 'pdb' })
      .modelStructure({});

    const baseComponent = structure.component({
      selector: makeBaseSelector(annotation),
      ref: 'yaml-base-structure',
      custom: {
        [REGION_COMPONENT_CUSTOM_KEY]: {
          label: annotation.viewer.baseComponentName,
          role: 'base'
        }
      }
    });
    const baseRepresentation = baseComponent.representation({
      type: 'cartoon',
      ref: 'yaml-base-structure-representation',
      custom: {
        [REGION_COMPONENT_CUSTOM_KEY]: {
          hidden: false,
          role: 'base-representation'
        },
        molstar_representation_params: {
          ignoreHydrogens: true,
          ignoreHydrogensVariant: 'all'
        }
      }
    });
    baseRepresentation.color({ color: annotation.viewer.baseColor });
    baseRepresentation.opacity({ opacity: annotation.viewer.baseOpacity });

    let regionRepresentationCount = 0;

    for (const region of annotation.regions) {
      if (!region.enabled || region.coverage?.matched === 0 || !createsMvsComponent(region)) continue;
      const selector = makeSelector(region);
      const componentRef = `yaml-region-${region.index + 1}`;
      const regionComponent = structure.component({
        selector,
        ref: componentRef,
        custom: {
          [REGION_COMPONENT_CUSTOM_KEY]: {
            label: region.componentName,
            role: 'region',
            regionIndex: region.index
          }
        }
      });

      if (region.createComponent) {
        const representationParams = {
          type: region.componentRepresentation,
          ref: `${componentRef}-representation`,
          custom: {
            [REGION_COMPONENT_CUSTOM_KEY]: {
              hidden: !region.componentVisible,
              role: 'region-representation',
              regionIndex: region.index
            }
          }
        };
        if (HYDROGEN_AWARE_REPRESENTATIONS.has(region.componentRepresentation)) {
          representationParams.ignore_hydrogens = true;
        }
        const nativeRepresentationParams = deepMergeObjects(
          region.componentRepresentationParams,
          {
            ignoreHydrogens: true,
            ignoreHydrogensVariant: 'all'
          }
        );
        if (nativeRepresentationParams) {
          representationParams.custom.molstar_representation_params = nativeRepresentationParams;
        }
        const regionRepresentation = regionComponent.representation(representationParams);
        applyComponentColor(regionRepresentation, region);
        if (region.componentOpacity < 1) {
          regionRepresentation.opacity({ opacity: region.componentOpacity });
        }
        regionRepresentationCount += 1;
      }
      if (region.tooltip) regionComponent.tooltip({ text: regionTooltip(region) });
      if (region.label) regionComponent.label({ text: region.name });
    }

    const requestedRegionComponents = annotation.regions.filter(region => region.enabled && createsMvsComponent(region)).length;
    if (regionRepresentationCount === 0 && requestedRegionComponents > 0) {
      throw new Error(
        'No Mol* component representation could be created. Ensure that at least one enabled region matches the PDB and has create_component: true.'
      );
    }

    const mvsData = builder.getState();
    if (typeof extension.MVSData.isValid === 'function' && !extension.MVSData.isValid(mvsData)) {
      const issues = typeof extension.MVSData.validationIssues === 'function'
        ? extension.MVSData.validationIssues(mvsData)
        : 'Unknown validation issue';
      throw new Error(`The generated MolViewSpec scene is invalid: ${String(issues)}`);
    }
    return mvsData;
  }

  async function enforceHydrogensHidden() {
    const manager = state.viewer?.plugin?.managers?.structure?.component;
    const options = manager?.state?.options;
    if (!manager?.setOptions || !options || options.hydrogens === 'hide-all') return;
    try {
      await manager.setOptions({ ...options, hydrogens: 'hide-all' });
    } catch (error) {
      console.warn('Could not set the Mol* hydrogen display option to Hide All:', error);
    }
  }

  async function readSource(source, maxBytes, label) {
    if (source.kind === 'file') {
      if (!(source.file instanceof File)) throw new Error(`${label} file is missing.`);
      if (source.file.size > maxBytes) throw new Error(`${label} exceeds the ${formatBytes(maxBytes)} limit.`);
      return { text: await source.file.text(), name: source.file.name, sourceLabel: 'local file' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(source.url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`${label} request returned HTTP ${response.status}.`);
      const blob = await response.blob();
      if (blob.size > maxBytes) throw new Error(`${label} exceeds the ${formatBytes(maxBytes)} limit.`);
      return { text: await blob.text(), name: source.name || filenameFromUrl(source.url), sourceLabel: source.url };
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(`${label} request timed out.`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function installAnnotationScene(pdbText, pdbName, annotation, structureFormat) {
    const pdbInfo = parseStructureInfo(pdbText, structureFormat);
    annotation.regions = annotation.regions.map(region => ({
      ...region,
      coverage: regionCoverage(region, pdbInfo)
    }));

    const pdbBlob = new Blob([pdbText], {
      type: structureFormat === 'mmcif' ? 'chemical/x-cif' : 'chemical/x-pdb'
    });
    const pdbObjectUrl = URL.createObjectURL(pdbBlob);
    try {
      const mvsData = buildMvsData(pdbObjectUrl, annotation, structureFormat);
      await window.molstar.PluginExtensions.mvs.loadMVS(state.viewer.plugin, mvsData, {
        sourceUrl: undefined,
        sanityChecks: true,
        replaceExisting: true,
        extensions: [REGION_COMPONENT_MVS_EXTENSION]
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(pdbObjectUrl), 1000);
    }
    return pdbInfo;
  }

  function refreshMsaLinks(annotation, pdbInfo) {
    if (!state.msa) return [];
    const { rowLinks, chainLinks, warnings } = computeMsaRowLinks(
      pdbInfo,
      state.msa,
      annotation.msaReferences
    );
    state.msa.rowLinks = rowLinks;
    state.msa.chainLinks = chainLinks;
    state.msa.selectedColumns = [];
    state.msa.selectedColumn = null;
    state.msa.selectionAnchorColumn = null;
    state.msa.selectedCells = [];
    state.msa.selectionDetail = '';
    renderMsaPanel();
    if (warnings.length) {
      console.warn('[Protein Region Viewer] MSA reference warnings:\n- ' + warnings.join('\n- '));
    }
    return warnings;
  }

  function announceLoadedAnnotation(annotation, hasYaml) {
    const enabledCount = annotation.regions.filter(region => region.enabled).length;
    const componentCount = annotation.regions.filter(
      region => region.enabled && region.createComponent && region.coverage?.matched > 0
    ).length;
    const warnings = annotation.regions.filter(region => region.enabled && regionCoverageWarning(region)).length;
    const unknownKeyCount = annotation.unknownKeyWarnings.length;
    if (unknownKeyCount) {
      console.warn(
        `[Protein Region Viewer] ${unknownKeyCount} unrecognized YAML key${unknownKeyCount === 1 ? '' : 's'}:\n- ` +
        annotation.unknownKeyWarnings.join('\n- ')
      );
    }
    const statusParts = [];
    if (warnings) statusParts.push(`${warnings} selection warning${warnings === 1 ? '' : 's'}`);
    if (unknownKeyCount) statusParts.push(`${unknownKeyCount} unknown key${unknownKeyCount === 1 ? '' : 's'}`);
    if (!hasYaml) statusParts.push('no annotation YAML');
    setViewerStatus(statusParts.length ? 'warning' : 'ready', statusParts.length ? statusParts.join(' · ') : 'Loaded');
    if (!hasYaml) {
      showToast('Loaded the structure without YAML. Select residues in Mol* and use the annotation editor below.');
    } else {
      showToast(
        `Created ${componentCount} Mol* component representation${componentCount === 1 ? '' : 's'}` +
        (statusParts.length ? ` with ${statusParts.join(' and ')}.` : '.') +
        (unknownKeyCount ? ' Check the console for details.' : '')
      );
    }
    return { enabledCount, componentCount, warnings, unknownKeyCount };
  }

  async function loadSources(pdbSource, yamlSource, sourceKind) {
    if (!state.viewer) {
      showToast('Mol* is still initializing.');
      return false;
    }

    const generation = ++state.loadGeneration;
    setBusy(true);
    const withYaml = Boolean(yamlSource);
    showOverlay(
      'loading',
      withYaml ? 'Loading structure + YAML' : 'Loading structure',
      withYaml
        ? 'Reading files, validating residue selections, and building the Mol* scene…'
        : 'Reading the structure and preparing a base scene for annotation…'
    );
    setViewerStatus('loading', 'Loading');

    try {
      const [pdbResult, yamlResult] = await Promise.all([
        readSource(pdbSource, MAX_PDB_BYTES, 'Structure'),
        yamlSource ? readSource(yamlSource, MAX_YAML_BYTES, 'YAML') : Promise.resolve(null)
      ]);
      if (generation !== state.loadGeneration) return false;

      const structureFormat = detectStructureFormat(pdbResult.name, pdbResult.text);
      const annotation = yamlResult
        ? parseYamlAnnotation(yamlResult.text, yamlResult.name)
        : createDefaultAnnotation(filenameFromUrl(pdbResult.name).replace(/\.(pdb|ent|cif|mmcif)$/i, '') || 'Protein annotation');
      const pdbInfo = await installAnnotationScene(pdbResult.text, pdbResult.name, annotation, structureFormat);
      if (generation !== state.loadGeneration) return false;

      state.current = {
        sourceKind,
        annotationSourceKind: yamlResult ? sourceKind : 'generated-empty',
        structureFormat,
        pdbText: pdbResult.text,
        yamlText: yamlResult?.text || '',
        pdbName: safeFilename(pdbResult.name, structureFormat === 'mmcif' ? 'structure.cif' : 'structure.pdb'),
        yamlName: safeFilename(yamlResult?.name || 'protein-annotations.yaml', 'protein-annotations.yaml'),
        hasYaml: Boolean(yamlResult),
        annotation,
        pdbInfo,
        pdbSource,
        yamlSource: yamlSource || null
      };

      renderCurrentState();
      applyLayout(elements.layoutSelect.value, false);
      hideOverlay();
      announceLoadedAnnotation(annotation, Boolean(yamlResult));
      refreshMsaLinks(annotation, pdbInfo);
      dispatchViewerEvent('loaded', {
        sourceKind,
        hasYaml: Boolean(yamlResult),
        pdbName: state.current.pdbName,
        yamlName: state.current.yamlName
      });
      return true;
    } catch (error) {
      if (generation !== state.loadGeneration) return false;
      console.error(error);
      setViewerStatus('error', 'Load failed');
      showOverlay('error', 'Could not load the files', error?.message || String(error));
      showToast(error?.message || 'Could not load the structure files.', 6500);
      dispatchViewerEvent('error', { error });
      return false;
    } finally {
      if (generation === state.loadGeneration) setBusy(false);
    }
  }

  async function loadPair(pdbSource, yamlSource, sourceKind) {
    return loadSources(pdbSource, yamlSource, sourceKind);
  }

  async function applyAnnotationYaml(yamlText, filename = 'protein-annotations.yaml') {
    if (!state.current || !state.viewer) throw new Error('Load a structure before applying an annotation YAML.');
    const generation = ++state.loadGeneration;
    setBusy(true);
    showOverlay('loading', 'Applying annotations', 'Validating the generated YAML and rebuilding the Mol* component scene…');
    setViewerStatus('loading', 'Applying annotations');
    try {
      const annotation = parseYamlAnnotation(String(yamlText || ''), filename);
      const pdbInfo = await installAnnotationScene(
        state.current.pdbText,
        state.current.pdbName,
        annotation,
        state.current.structureFormat
      );
      if (generation !== state.loadGeneration) return false;
      state.current.annotation = annotation;
      state.current.pdbInfo = pdbInfo;
      state.current.yamlText = String(yamlText || '');
      state.current.yamlName = safeFilename(filename, 'protein-annotations.yaml');
      state.current.hasYaml = true;
      state.current.annotationSourceKind = 'generated';
      state.current.yamlSource = null;
      renderCurrentState();
      applyLayout(elements.layoutSelect.value, false);
      hideOverlay();
      announceLoadedAnnotation(annotation, true);
      refreshMsaLinks(annotation, pdbInfo);
      dispatchViewerEvent('annotation-applied', { filename: state.current.yamlName });
      return true;
    } catch (error) {
      if (generation !== state.loadGeneration) return false;
      console.error(error);
      setViewerStatus('error', 'Annotation failed');
      showOverlay('error', 'Could not apply the annotations', error?.message || String(error));
      showToast(error?.message || 'Could not apply the annotation YAML.', 6500);
      throw error;
    } finally {
      if (generation === state.loadGeneration) setBusy(false);
    }
  }

  function configuredSources() {
    if (!config.pdbUrl) return null;
    if (!config.yamlUrl && !config.editorMode) return null;
    return {
      pdb: { kind: 'url', url: config.pdbUrl, name: filenameFromUrl(config.pdbUrl) || 'structure.pdb' },
      yaml: config.yamlUrl
        ? { kind: 'url', url: config.yamlUrl, name: filenameFromUrl(config.yamlUrl) || 'regions.yaml' }
        : null
    };
  }

  async function loadConfigured() {
    const sources = configuredSources();
    if (!sources) {
      showToast(config.editorMode ? 'Add at least pdbUrl to config.js first.' : 'Add pdbUrl and yamlUrl to config.js first.');
      return false;
    }
    return loadSources(sources.pdb, sources.yaml, 'configured');
  }

  async function loadSelectedFiles() {
    if (!state.selectedPdbFile) {
      showToast('Select a structure file (.pdb or .cif). The YAML is optional in the editor.');
      return false;
    }
    if (!config.editorMode && !state.selectedYamlFile) {
      showToast('Select one structure file and one YAML file.');
      return false;
    }
    return loadSources(
      { kind: 'file', file: state.selectedPdbFile },
      state.selectedYamlFile ? { kind: 'file', file: state.selectedYamlFile } : null,
      'local'
    );
  }

  async function reloadCurrent() {
    if (!state.current) return false;
    if (state.current.annotationSourceKind === 'generated' && state.current.yamlText) {
      return applyAnnotationYaml(state.current.yamlText, state.current.yamlName);
    }
    if (state.current.sourceKind === 'local') return loadSelectedFiles();
    return loadConfigured();
  }

  function renderCurrentState() {
    const current = state.current;
    if (!current) return;
    const annotation = current.annotation;
    const enabledRegions = annotation.regions.filter(region => region.enabled);
    const componentCount = enabledRegions.filter(
      region => region.createComponent && region.coverage.matched > 0
    ).length;
    const warningCount = enabledRegions.filter(regionCoverageWarning).length;
    const formatLabel = current.structureFormat === 'mmcif' ? 'mmCIF' : 'PDB';

    elements.structureTitle.textContent = annotation.title || current.pdbName;
    const annotationLabel = current.hasYaml ? current.yamlName : 'no annotation YAML';
    elements.sourceSummary.textContent =
      `${current.pdbName} (${formatLabel}) + ${annotationLabel} · ${current.pdbInfo.atomCount.toLocaleString()} polymer atoms · ` +
      `${componentCount} component${componentCount === 1 ? '' : 's'}` +
      (warningCount ? ` · ${warningCount} selection warning${warningCount === 1 ? '' : 's'}` : '');

    elements.reloadButton.disabled = false;
    elements.downloadPdbButton.disabled = false;
    elements.downloadYamlButton.disabled = !current.hasYaml || !current.yamlText;
  }

  function applyLayout(value, announce = true) {
    const layoutName = normalizeLayout(value);
    elements.layoutSelect.value = layoutName;
    if (!state.viewer?.plugin?.layout?.setProps) return layoutName;
    const definition = LAYOUTS[layoutName];
    try {
      state.viewer.plugin.layout.setProps({
        showControls: definition.showControls,
        controlsDisplay: 'reactive',
        regionState: { ...definition.regionState }
      });
      state.viewer.handleResize();
      setTimeout(() => state.viewer?.handleResize(), 150);
      if (announce) showToast(`Layout: ${definition.label}.`);
    } catch (error) {
      console.error('Could not update Mol* layout:', error);
      showToast('Could not update the Mol* layout.');
    }
    return layoutName;
  }

  function showOverlay(mode, title, detail) {
    elements.viewerOverlay.dataset.mode = mode;
    elements.overlayTitle.textContent = title;
    elements.overlayDetail.textContent = detail;
    elements.viewerOverlay.classList.add('is-visible');
  }

  function hideOverlay() {
    elements.viewerOverlay.classList.remove('is-visible');
  }

  function setViewerStatus(status, text) {
    elements.viewerState.dataset.state = status;
    elements.viewerState.lastChild.textContent = text;
  }

  function localFilesReady() {
    return Boolean(state.selectedPdbFile && (config.editorMode || state.selectedYamlFile));
  }

  function setBusy(busy) {
    for (const button of [
      elements.loadConfiguredButton, elements.choosePdbButton, elements.chooseYamlButton, elements.clearYamlButton,
      elements.loadLocalButton, elements.reloadButton
    ].filter(Boolean)) {
      button.disabled = busy ||
        (button === elements.loadLocalButton && !localFilesReady()) ||
        (button === elements.reloadButton && !state.current);
    }
    elements.loadConfiguredButton.disabled = busy || !configuredSources();
    if (elements.clearYamlButton) elements.clearYamlButton.disabled = busy || !state.selectedYamlFile;
  }

  function updateSelectedFiles() {
    updateFilePill(elements.pdbFilePill, 'Structure', state.selectedPdbFile);
    updateFilePill(elements.yamlFilePill, config.editorMode ? 'YAML (optional)' : 'YAML', state.selectedYamlFile);
    elements.loadLocalButton.disabled = !localFilesReady();
    if (elements.clearYamlButton) elements.clearYamlButton.disabled = !state.selectedYamlFile;
  }

  function updateFilePill(element, type, file) {
    element.dataset.state = file ? 'ready' : 'empty';
    element.querySelector('strong').textContent = type;
    element.querySelector('span').textContent = file ? `${file.name} · ${formatBytes(file.size)}` : 'No local file selected';
    element.title = file ? file.name : '';
  }

  function choosePdb() {
    elements.pdbFileInput.value = '';
    elements.pdbFileInput.click();
  }

  function chooseYaml() {
    elements.yamlFileInput.value = '';
    elements.yamlFileInput.click();
  }

  function chooseMsa() {
    elements.msaFileInput.value = '';
    elements.msaFileInput.click();
  }

  function handleDroppedFiles(files) {
    let pdb = null;
    let yaml = null;
    let msa = null;
    for (const file of files) {
      const lower = file.name.toLowerCase();
      if (!pdb && (lower.endsWith('.pdb') || lower.endsWith('.ent') || lower.endsWith('.cif') || lower.endsWith('.mmcif'))) pdb = file;
      if (!yaml && (lower.endsWith('.yaml') || lower.endsWith('.yml'))) yaml = file;
      if (!msa && (lower.endsWith('.fasta') || lower.endsWith('.fa') || lower.endsWith('.aln') || lower.endsWith('.fas'))) msa = file;
    }
    if (!pdb) {
      showToast(config.editorMode
        ? 'Drop at least one .pdb or .cif file. YAML and FASTA are optional.'
        : 'Drop one .pdb/.cif file and one .yaml or .yml file.');
      return;
    }
    if (!config.editorMode && !yaml) {
      showToast('Drop one .pdb/.cif file and one .yaml or .yml file.');
      return;
    }
    state.selectedPdbFile = pdb;
    state.selectedYamlFile = yaml;
    if (msa) state.selectedMsaFile = msa;
    updateSelectedFiles();
    updateMsaFilePill();
    loadSelectedFiles().then(ok => {
      if (ok && msa) loadSelectedMsa();
    });
  }

  function isFullscreen() {
    return document.fullscreenElement === elements.viewerCard || document.webkitFullscreenElement === elements.viewerCard || state.fallbackFullscreen;
  }

  async function toggleFullscreen() {
    if (isFullscreen()) {
      if (state.fallbackFullscreen) {
        state.fallbackFullscreen = false;
        elements.viewerCard.classList.remove('is-fallback-fullscreen');
        document.body.classList.remove('has-fallback-fullscreen');
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    } else {
      try {
        if (elements.viewerCard.requestFullscreen) {
          await elements.viewerCard.requestFullscreen();
        } else if (elements.viewerCard.webkitRequestFullscreen) {
          elements.viewerCard.webkitRequestFullscreen();
        } else {
          throw new Error('Fullscreen API unavailable');
        }
      } catch (error) {
        state.fallbackFullscreen = true;
        elements.viewerCard.classList.add('is-fallback-fullscreen');
        document.body.classList.add('has-fallback-fullscreen');
      }
    }
    requestViewerResize();
  }

  function requestViewerResize() {
    requestAnimationFrame(() => state.viewer?.handleResize());
    setTimeout(() => state.viewer?.handleResize(), 180);
  }

  function downloadText(text, filename, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = safeFilename(filename, 'download.txt');
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadTemplate() {
    const template = `version: 1
title: My protein component scene
numbering: auth
default_chain: A

viewer:
  # Global defaults inherited by every region component.
  # default      = normal Mol* rendering
  # illustrative = spacefill + illustrative colors + ignore-light + outline + SSAO
  style: illustrative

  component_representation: spacefill
  component_color_theme: illustrative
  component_opacity: 0.45
  components_visible: true

  background: "#FFFFFF"
  show_labels: false
  show_tooltips: true
  create_components: true

  # Optional: override the automatic context layer created before your
  # regions. Defaults shown below.
  # base_component_name: Base structure
  # base_color: "#FFFFFF"
  # base_opacity: 0.20

  # Optional advanced defaults:
  # component_representation_params:
  #   ignoreLight: true
  # component_color_theme_params:
  #   style:
  #     name: entity-id
  #     params:
  #       overrideWater: true
  # postprocessing:
  #   enable_outline: true
  #   enable_ssao: true

# Optional: link an aligned FASTA file (loaded separately with the MSA
# button) to specific chains. Selection is synchronized in both directions:
# MSA column -> 3D residue and Mol* residue click -> reference MSA cell.
# msa:
#   references:
#     A: my_sequence_header_id
#     B: another_sequence_header_id

regions:
  # color is shorthand for a uniform color override on this component.
  - name: N-terminal domain
    chain: A
    start: 1
    end: 90
    color: "#2563EB"

  # Exact positions create one component containing all selected residues.
  - name: Active-site atoms
    chain: A
    positions: [202, 245, 277]
    component_representation: ball_and_stick
    component_color_theme: element-symbol
    component_opacity: 1.0

  - name: Catalytic surface
    chain: B
    start: 301
    end: 420
    component_representation: surface
    component_color_theme: uniform
    component_color: "#F97316"
    component_opacity: 0.65
`;
    downloadText(template, 'protein-components-template.yaml', 'application/yaml;charset=utf-8');
  }

  function filenameFromUrl(url) {
    try {
      const pathname = new URL(url, window.location.href).pathname;
      return decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '');
    } catch {
      return String(url).split('/').pop()?.split('?')[0] || '';
    }
  }

  function safeFilename(value, fallback) {
    const normalized = cleanString(value).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
    return normalized || fallback;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, bytes || 0)} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
  }

  function showToast(message, duration = 3200) {
    clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add('is-visible');
    state.toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), duration);
  }

  // --- MSA panel: loading, rendering, zoom, and click-to-highlight ---------

  function configuredMsaSource() {
    if (!config.msaUrl) return null;
    return { kind: 'url', url: config.msaUrl, name: filenameFromUrl(config.msaUrl) || 'alignment.fasta' };
  }

  async function loadMsaFile(source) {
    if (!state.current) {
      showToast('Load a structure first, then load the MSA.');
      return false;
    }
    try {
      const result = await readSource(source, MAX_MSA_BYTES, 'MSA');
      const msaResult = parseFasta(result.text);
      const { rowLinks, chainLinks, warnings } = computeMsaRowLinks(
        state.current.pdbInfo,
        msaResult,
        state.current.annotation.msaReferences
      );
      state.msa = {
        fileName: safeFilename(result.name, 'alignment.fasta'),
        text: result.text,
        records: msaResult.records,
        columnCount: msaResult.columnCount,
        rowLinks,
        chainLinks,
        selectedColumns: [],
        selectedColumn: null,
        selectionAnchorColumn: null,
        selectedCells: [],
        selectionDetail: ''
      };
      elements.msaScrollArea.scrollLeft = 0;
      elements.msaScrollArea.scrollTop = 0;
      elements.msaNamesList.scrollTop = 0;
      renderMsaPanel();
      const linkedCount = rowLinks.size;
      showToast(
        `Loaded MSA: ${msaResult.records.length} sequence${msaResult.records.length === 1 ? '' : 's'} × ${msaResult.columnCount} column${msaResult.columnCount === 1 ? '' : 's'}` +
        (linkedCount ? `, ${linkedCount} linked to the structure.` : ', none linked to the structure — check msa.references in the YAML.') +
        (warnings.length ? ` ${warnings.length} reference warning${warnings.length === 1 ? '' : 's'} — check the console.` : '')
      );
      if (warnings.length) {
        console.warn('[Protein Region Viewer] MSA reference warnings:\n- ' + warnings.join('\n- '));
      }
      dispatchViewerEvent('msa-loaded', {
        fileName: state.msa.fileName,
        sequenceCount: state.msa.records.length,
        columnCount: state.msa.columnCount,
        linkedChains: Array.from(state.msa.chainLinks.keys())
      });
      return true;
    } catch (error) {
      console.error(error);
      showToast(error?.message || 'Could not load the MSA file.', 6500);
      return false;
    }
  }

  async function loadMsaConfigured() {
    const source = configuredMsaSource();
    if (!source) return false;
    return loadMsaFile(source);
  }

  async function loadSelectedMsa() {
    if (!state.selectedMsaFile) {
      showToast('Select a FASTA file first.');
      return false;
    }
    return loadMsaFile({ kind: 'file', file: state.selectedMsaFile });
  }

  function clearMsa() {
    clearStructureSelection();
    state.msa = null;
    state.selectedMsaFile = null;
    state.msaLastMolstarClickResidues = [];
    state.msaExpectedMolstarSelectionSignature = null;
    if (state.msaExpectedMolstarSelectionTimer) {
      clearTimeout(state.msaExpectedMolstarSelectionTimer);
      state.msaExpectedMolstarSelectionTimer = null;
    }
    if (state.msaSelectionSyncFrame) {
      cancelAnimationFrame(state.msaSelectionSyncFrame);
      state.msaSelectionSyncFrame = 0;
    }
    if (state.msaDrawFrame) {
      cancelAnimationFrame(state.msaDrawFrame);
      state.msaDrawFrame = 0;
    }
    updateMsaFilePill();
    renderMsaPanel();
    dispatchViewerEvent('msa-cleared');
  }

  function updateMsaFilePill() {
    updateFilePill(elements.msaFilePill, 'MSA', state.selectedMsaFile);
  }

  function msaCellMetrics() {
    return {
      cellWidth: state.msaCellSize,
      cellHeight: state.msaCellSize
    };
  }

  function msaDisplayFontSize(cellSize) {
    const size = Math.max(1, Number(cellSize) || 1);
    return size >= 10
      ? Math.max(7, Math.floor(size * 0.72))
      : Math.max(4, Math.floor(size * 0.75));
  }

  function updateMsaNameRowMetrics(cellHeight) {
    const rowHeight = Math.max(1, Math.round(cellHeight));
    const fontSize = msaDisplayFontSize(rowHeight);
    elements.msaNamesList.style.setProperty('--msa-row-height', `${rowHeight}px`);
    elements.msaNamesList.style.setProperty('--msa-row-font-size', `${fontSize}px`);

    const longestIdLength = state.msa
      ? state.msa.records.reduce((maximum, record) => Math.max(maximum, String(record.id || '').length), 0)
      : 0;
    const viewportLimit = Math.max(
      MSA_NAME_COLUMN_MIN_WIDTH,
      Math.min(MSA_NAME_COLUMN_MAX_WIDTH, Math.floor((window.innerWidth || 1200) * 0.42))
    );
    const measuredWidth = Math.ceil(longestIdLength * fontSize * 0.62 + 28);
    const nameColumnWidth = Math.max(
      MSA_NAME_COLUMN_MIN_WIDTH,
      Math.min(viewportLimit, measuredWidth || MSA_NAME_COLUMN_MIN_WIDTH)
    );
    elements.msaCard.style.setProperty('--msa-name-column-width', `${nameColumnWidth}px`);
  }

  function updateMsaVirtualGeometry() {
    if (!state.msa || !elements.msaStage) return;
    const { records, columnCount } = state.msa;
    const { cellWidth, cellHeight } = msaCellMetrics();
    updateMsaNameRowMetrics(cellHeight);
    const totalWidth = Math.max(1, columnCount * cellWidth);
    const totalHeight = Math.max(1, records.length * cellHeight);
    elements.msaStage.style.width = `${Math.max(totalWidth, elements.msaScrollArea.clientWidth || 1)}px`;
    elements.msaStage.style.height = `${Math.max(totalHeight, elements.msaScrollArea.clientHeight || 1)}px`;
  }

  function msaScrollbarParts(axis) {
    if (axis === 'horizontal') {
      return {
        track: elements.msaHorizontalScrollbar,
        thumb: elements.msaHorizontalThumb,
        viewportLength: elements.msaScrollArea.clientWidth,
        contentLength: elements.msaScrollArea.scrollWidth,
        scrollOffset: elements.msaScrollArea.scrollLeft
      };
    }
    return {
      track: elements.msaVerticalScrollbar,
      thumb: elements.msaVerticalThumb,
      viewportLength: elements.msaScrollArea.clientHeight,
      contentLength: elements.msaScrollArea.scrollHeight,
      scrollOffset: elements.msaScrollArea.scrollTop
    };
  }

  function msaScrollbarMetrics(axis) {
    const parts = msaScrollbarParts(axis);
    const trackLength = parts.track
      ? (axis === 'horizontal' ? parts.track.clientWidth : parts.track.clientHeight)
      : 0;
    const maxScroll = Math.max(0, parts.contentLength - parts.viewportLength);
    const proportionalLength = parts.contentLength > 0
      ? trackLength * (parts.viewportLength / parts.contentLength)
      : trackLength;
    const thumbLength = trackLength > 0
      ? (maxScroll > 0
        ? Math.min(trackLength, Math.max(MSA_SCROLLBAR_MIN_THUMB, proportionalLength))
        : trackLength)
      : 0;
    const maxThumbTravel = Math.max(0, trackLength - thumbLength);
    const thumbOffset = maxScroll > 0 && maxThumbTravel > 0
      ? Math.min(maxThumbTravel, Math.max(0, parts.scrollOffset / maxScroll * maxThumbTravel))
      : 0;
    return { ...parts, trackLength, maxScroll, thumbLength, maxThumbTravel, thumbOffset };
  }

  function updateMsaScrollbar(axis) {
    const metrics = msaScrollbarMetrics(axis);
    const { track, thumb } = metrics;
    if (!track || !thumb) return;

    if (axis === 'horizontal') {
      thumb.style.width = `${Math.max(0, metrics.thumbLength)}px`;
      thumb.style.transform = `translateX(${metrics.thumbOffset}px)`;
    } else {
      thumb.style.height = `${Math.max(0, metrics.thumbLength)}px`;
      thumb.style.transform = `translateY(${metrics.thumbOffset}px)`;
    }

    const disabled = metrics.maxScroll <= 0 || metrics.trackLength <= 0;
    track.classList.toggle('is-disabled', disabled);
    track.setAttribute('aria-disabled', String(disabled));
    track.setAttribute('aria-valuemax', String(Math.round(metrics.maxScroll)));
    track.setAttribute('aria-valuenow', String(Math.round(Math.min(metrics.maxScroll, metrics.scrollOffset))));
  }

  function updateMsaScrollbars() {
    updateMsaScrollbar('horizontal');
    updateMsaScrollbar('vertical');
  }

  function setMsaScrollAxis(axis, value) {
    const scroller = elements.msaScrollArea;
    if (!scroller) return;
    if (axis === 'horizontal') {
      const maximum = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      scroller.scrollLeft = Math.min(maximum, Math.max(0, value));
    } else {
      const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      scroller.scrollTop = Math.min(maximum, Math.max(0, value));
      elements.msaNamesList.scrollTop = scroller.scrollTop;
    }
    updateMsaScrollbars();
    scheduleMsaDraw();
  }

  function handleMsaScrollbarPointerDown(event, axis) {
    if (!state.msa || event.button !== 0) return;
    const metrics = msaScrollbarMetrics(axis);
    if (!metrics.track || !metrics.thumb || metrics.maxScroll <= 0 || metrics.maxThumbTravel <= 0) return;
    event.preventDefault();

    const coordinate = axis === 'horizontal' ? event.clientX : event.clientY;
    const thumbWasPressed = event.target === metrics.thumb || metrics.thumb.contains(event.target);
    if (!thumbWasPressed) {
      const rect = metrics.track.getBoundingClientRect();
      const trackCoordinate = coordinate - (axis === 'horizontal' ? rect.left : rect.top);
      const targetThumbOffset = Math.min(
        metrics.maxThumbTravel,
        Math.max(0, trackCoordinate - metrics.thumbLength / 2)
      );
      setMsaScrollAxis(axis, targetThumbOffset / metrics.maxThumbTravel * metrics.maxScroll);
      return;
    }

    const pointerId = event.pointerId;
    const startCoordinate = coordinate;
    const startScroll = metrics.scrollOffset;
    const scrollPerPixel = metrics.maxScroll / metrics.maxThumbTravel;
    metrics.thumb.setPointerCapture?.(pointerId);

    const handleMove = moveEvent => {
      if (moveEvent.pointerId !== pointerId) return;
      moveEvent.preventDefault();
      const currentCoordinate = axis === 'horizontal' ? moveEvent.clientX : moveEvent.clientY;
      setMsaScrollAxis(axis, startScroll + (currentCoordinate - startCoordinate) * scrollPerPixel);
    };
    const finish = finishEvent => {
      if (finishEvent.pointerId !== pointerId) return;
      metrics.thumb.releasePointerCapture?.(pointerId);
      metrics.thumb.removeEventListener('pointermove', handleMove);
      metrics.thumb.removeEventListener('pointerup', finish);
      metrics.thumb.removeEventListener('pointercancel', finish);
    };
    metrics.thumb.addEventListener('pointermove', handleMove);
    metrics.thumb.addEventListener('pointerup', finish);
    metrics.thumb.addEventListener('pointercancel', finish);
  }

  function handleMsaScrollbarKeydown(event, axis) {
    if (!state.msa) return;
    const scroller = elements.msaScrollArea;
    const current = axis === 'horizontal' ? scroller.scrollLeft : scroller.scrollTop;
    const viewport = axis === 'horizontal' ? scroller.clientWidth : scroller.clientHeight;
    const maximum = axis === 'horizontal'
      ? Math.max(0, scroller.scrollWidth - scroller.clientWidth)
      : Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const smallStep = Math.max(24, state.msaCellSize * 2);
    let next = null;

    if (axis === 'horizontal') {
      if (event.key === 'ArrowLeft') next = current - smallStep;
      if (event.key === 'ArrowRight') next = current + smallStep;
    } else {
      if (event.key === 'ArrowUp') next = current - smallStep;
      if (event.key === 'ArrowDown') next = current + smallStep;
    }
    if (event.key === 'PageUp') next = current - viewport * 0.9;
    if (event.key === 'PageDown') next = current + viewport * 0.9;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = maximum;
    if (next === null) return;
    event.preventDefault();
    setMsaScrollAxis(axis, next);
  }

  function bindMsaScrollbar(track, axis) {
    if (!track) return;
    track.addEventListener('pointerdown', event => handleMsaScrollbarPointerDown(event, axis));
    track.addEventListener('keydown', event => handleMsaScrollbarKeydown(event, axis));
    track.addEventListener('wheel', event => {
      if (!state.msa) return;
      event.preventDefault();
      const delta = axis === 'horizontal'
        ? (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY)
        : event.deltaY;
      const current = axis === 'horizontal'
        ? elements.msaScrollArea.scrollLeft
        : elements.msaScrollArea.scrollTop;
      setMsaScrollAxis(axis, current + delta);
    }, { passive: false });
  }

  function positionMsaCanvas() {
    if (!state.msa) return;
    const scroller = elements.msaScrollArea;
    elements.msaCanvas.style.transform = `translate(${scroller.scrollLeft}px, ${scroller.scrollTop}px)`;
  }

  function drawMsaCanvas() {
    if (!state.msa) return;
    updateMsaVirtualGeometry();

    const { records, columnCount, selectedColumn, selectedColumns = [], selectedCells = [] } = state.msa;
    const normalizedSelectedColumns = selectedColumns.length
      ? selectedColumns
      : (Number.isInteger(selectedColumn) ? [selectedColumn] : []);
    const selectedColumnSet = new Set(normalizedSelectedColumns);
    const { cellWidth, cellHeight } = msaCellMetrics();
    const scroller = elements.msaScrollArea;
    const viewportWidth = Math.max(1, scroller.clientWidth);
    const viewportHeight = Math.max(1, scroller.clientHeight);
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    positionMsaCanvas();
    elements.msaCanvas.style.width = `${viewportWidth}px`;
    elements.msaCanvas.style.height = `${viewportHeight}px`;
    elements.msaCanvas.width = Math.max(1, Math.round(viewportWidth * dpr));
    elements.msaCanvas.height = Math.max(1, Math.round(viewportHeight * dpr));

    const ctx = elements.msaCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewportWidth, viewportHeight);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);

    const startColumn = Math.max(0, Math.floor(scroller.scrollLeft / cellWidth));
    const endColumn = Math.min(columnCount, Math.ceil((scroller.scrollLeft + viewportWidth) / cellWidth) + 1);
    const startRow = Math.max(0, Math.floor(scroller.scrollTop / cellHeight));
    const endRow = Math.min(records.length, Math.ceil((scroller.scrollTop + viewportHeight) / cellHeight) + 1);
    const showLetters = cellWidth >= 9 && cellHeight >= 11;
    if (showLetters) {
      const fontSize = msaDisplayFontSize(Math.min(cellWidth, cellHeight));
      ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
    }

    for (let row = startRow; row < endRow; row += 1) {
      const sequence = records[row].sequence;
      const y = row * cellHeight - scroller.scrollTop;
      for (let col = startColumn; col < endColumn; col += 1) {
        const letter = sequence[col] || '-';
        const upper = letter.toUpperCase();
        const x = col * cellWidth - scroller.scrollLeft;
        ctx.fillStyle = MSA_RESIDUE_COLORS[upper] || MSA_RESIDUE_COLORS.X;
        ctx.fillRect(x, y, cellWidth, cellHeight);
        if (showLetters && upper !== '-' && upper !== '.') {
          ctx.fillStyle = '#1e293b';
          ctx.fillText(letter, x + cellWidth / 2, y + cellHeight / 2 + 0.5);
        }
      }
    }

    for (let column = startColumn; column < endColumn; column += 1) {
      if (!selectedColumnSet.has(column)) continue;
      const isPrimary = column === selectedColumn;
      const x = column * cellWidth - scroller.scrollLeft;
      ctx.fillStyle = isPrimary ? 'rgba(37, 99, 235, 0.24)' : 'rgba(37, 99, 235, 0.13)';
      ctx.fillRect(x, 0, cellWidth, viewportHeight);
      ctx.strokeStyle = isPrimary ? 'rgba(29, 78, 216, 0.96)' : 'rgba(37, 99, 235, 0.50)';
      ctx.lineWidth = isPrimary
        ? Math.max(1.5, Math.min(3, cellWidth / 7))
        : Math.max(1, Math.min(1.5, cellWidth / 10));
      ctx.strokeRect(x + 0.5, 0.5, Math.max(0, cellWidth - 1), Math.max(0, viewportHeight - 1));
    }

    for (const cell of selectedCells) {
      if (!Number.isInteger(cell.row) || !Number.isInteger(cell.column)) continue;
      if (cell.row < startRow || cell.row >= endRow || cell.column < startColumn || cell.column >= endColumn) continue;
      const x = cell.column * cellWidth - scroller.scrollLeft;
      const y = cell.row * cellHeight - scroller.scrollTop;
      const isPrimary = cell.column === selectedColumn;
      ctx.fillStyle = isPrimary ? 'rgba(250, 204, 21, 0.72)' : 'rgba(250, 204, 21, 0.48)';
      ctx.fillRect(x, y, cellWidth, cellHeight);
      ctx.strokeStyle = isPrimary ? '#0f172a' : 'rgba(15, 23, 42, 0.72)';
      ctx.lineWidth = isPrimary
        ? Math.max(1.5, Math.min(3, cellWidth / 6))
        : Math.max(1, Math.min(2, cellWidth / 8));
      ctx.strokeRect(x + 1, y + 1, Math.max(0, cellWidth - 2), Math.max(0, cellHeight - 2));

      if (showLetters) {
        const letter = records[cell.row].sequence[cell.column] || '-';
        const upper = letter.toUpperCase();
        if (upper !== '-' && upper !== '.') {
          const fontSize = msaDisplayFontSize(Math.min(cellWidth, cellHeight));
          ctx.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
          ctx.fillStyle = '#0f172a';
          ctx.fillText(letter, x + cellWidth / 2, y + cellHeight / 2 + 0.5);
        }
      }
    }
    updateMsaScrollbars();
  }

  function scheduleMsaDraw() {
    if (!state.msa) return;
    positionMsaCanvas();
    if (state.msaDrawFrame) return;
    state.msaDrawFrame = requestAnimationFrame(() => {
      state.msaDrawFrame = 0;
      drawMsaCanvas();
    });
  }

  function formatMappedResidue(residue) {
    if (!residue) return '';
    return `${residue.authSeq}${normalizeInsertionCode(residue.insertion)}`;
  }

  function updateMsaSummary() {
    if (!state.msa) {
      elements.msaSummary.textContent = 'No alignment loaded';
      return;
    }
    const { records, columnCount, chainLinks, fileName, selectionDetail } = state.msa;
    const linkedCount = chainLinks.size;
    elements.msaSummary.textContent =
      `${fileName} · ${records.length} sequence${records.length === 1 ? '' : 's'} × ${columnCount} column${columnCount === 1 ? '' : 's'}` +
      ` · ${linkedCount} chain${linkedCount === 1 ? '' : 's'} linked to structure` +
      (selectionDetail ? ` · ${selectionDetail}` : '');
  }

  function updateMsaSelectedNameRows() {
    if (!state.msa) return;
    const selectedRows = new Set((state.msa.selectedCells || []).map(cell => cell.row));
    Array.from(elements.msaNamesList.children).forEach((rowElement, rowIndex) => {
      rowElement.classList.toggle('is-structure-selected', selectedRows.has(rowIndex));
    });
  }

  function updateMsaSelectionControls() {
    if (!elements.clearMsaSelectionButton) return;
    const hasSelection = Boolean(
      state.msa && ((state.msa.selectedColumns || []).length || Number.isInteger(state.msa.selectedColumn) || state.msa.selectionDetail)
    );
    elements.clearMsaSelectionButton.disabled = !hasSelection;
  }

  function renderMsaPanel() {
    const hasMsa = !!state.msa;
    elements.msaCard.classList.toggle('is-empty', !hasMsa);
    elements.clearMsaButton.disabled = !hasMsa;
    elements.downloadMsaButton.disabled = !hasMsa;

    if (!hasMsa) {
      updateMsaSummary();
      updateMsaSelectionControls();
      elements.msaNamesList.innerHTML = '';
      const ctx = elements.msaCanvas.getContext('2d');
      ctx.clearRect(0, 0, elements.msaCanvas.width, elements.msaCanvas.height);
      elements.msaCanvas.style.width = '0px';
      elements.msaCanvas.style.height = '0px';
      elements.msaCanvas.style.transform = 'none';
      if (elements.msaStage) {
        elements.msaStage.style.width = '0px';
        elements.msaStage.style.height = '0px';
      }
      elements.msaNamesList.style.removeProperty('--msa-row-height');
      elements.msaNamesList.style.removeProperty('--msa-row-font-size');
      elements.msaCard.style.removeProperty('--msa-name-column-width');
      elements.msaScrollArea.scrollLeft = 0;
      elements.msaScrollArea.scrollTop = 0;
      elements.msaNamesList.scrollTop = 0;
      updateMsaScrollbars();
      return;
    }

    const { records, rowLinks } = state.msa;
    updateMsaSummary();
    elements.msaNamesList.innerHTML = '';
    records.forEach((record, index) => {
      const row = document.createElement('div');
      row.className = 'msa-name-row';
      row.textContent = record.id;
      const link = rowLinks.get(index);
      row.title = link
        ? `${record.header}\nChain ${link.chain}: ${link.mappedResidues} mapped residues, ${Math.round(link.identity * 100)}% identity (${link.method})`
        : record.header;
      if (link) row.classList.add('is-linked');
      elements.msaNamesList.appendChild(row);
    });

    updateMsaVirtualGeometry();
    drawMsaCanvas();
    updateMsaSelectedNameRows();
    updateMsaSelectionControls();
  }

  function handleMsaZoomInput(event) {
    const value = Math.max(MSA_MIN_CELL_SIZE, Math.min(MSA_MAX_ZOOM_CELL_SIZE, Number(event.target.value) || MSA_INITIAL_ZOOM_CELL_SIZE));
    const scroller = elements.msaScrollArea;
    let centerRow = 0;
    let centerColumn = 0;
    if (state.msa) {
      const previous = msaCellMetrics();
      const previousContentHeight = state.msa.records.length * previous.cellHeight;
      const previousContentWidth = state.msa.columnCount * previous.cellWidth;
      const visibleContentHeight = Math.min(scroller.clientHeight, previousContentHeight);
      const visibleContentWidth = Math.min(scroller.clientWidth, previousContentWidth);
      centerRow = (scroller.scrollTop + visibleContentHeight / 2) / previous.cellHeight;
      centerColumn = (scroller.scrollLeft + visibleContentWidth / 2) / previous.cellWidth;
    }

    state.msaCellSize = value;
    elements.msaZoomValue.textContent = `${value}px`;

    if (state.msa) {
      updateMsaVirtualGeometry();
      const next = msaCellMetrics();
      const nextContentHeight = state.msa.records.length * next.cellHeight;
      const nextContentWidth = state.msa.columnCount * next.cellWidth;
      const nextVisibleContentHeight = Math.min(scroller.clientHeight, nextContentHeight);
      const nextVisibleContentWidth = Math.min(scroller.clientWidth, nextContentWidth);
      scroller.scrollTop = Math.max(0, centerRow * next.cellHeight - nextVisibleContentHeight / 2);
      elements.msaNamesList.scrollTop = scroller.scrollTop;
      scroller.scrollLeft = Math.max(0, centerColumn * next.cellWidth - nextVisibleContentWidth / 2);
      drawMsaCanvas();
    }
  }

  function clearStructureSelection() {
    try {
      const selects = state.viewer?.plugin?.managers?.interactivity?.lociSelects;
      if (typeof selects?.deselectAll === 'function') {
        selects.deselectAll();
        return;
      }
      if (typeof state.viewer?.structureInteractivity === 'function') {
        state.viewer.structureInteractivity({ action: 'clear' });
      }
    } catch (error) {
      console.warn('[Protein Region Viewer] Could not clear the Mol* residue selection.', error);
    }
  }

  function structureResidueKey(chain, residue) {
    return `${String(chain || '').trim()}|${residueLookupKey(residue?.authSeq, residue?.insertion)}`;
  }

  function normalizeStructureSelections(selections) {
    const normalized = [];
    const seen = new Set();
    for (const selection of selections || []) {
      const chain = String(selection?.chain || selection?.link?.chain || '').trim();
      const residue = selection?.residue || selection;
      const authSeq = Number(residue?.authSeq);
      if (!chain || !Number.isFinite(authSeq)) continue;
      const normalizedResidue = {
        ...residue,
        authSeq,
        insertion: normalizeInsertionCode(residue?.insertion)
      };
      const key = structureResidueKey(chain, normalizedResidue);
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push({ chain, residue: normalizedResidue });
    }
    return normalized;
  }

  function molstarSelectionSignature(selections) {
    return normalizeStructureSelections(selections)
      .map(selection => structureResidueKey(selection.chain, selection.residue))
      .sort()
      .join(';');
  }

  function expectMolstarSelection(selections) {
    state.msaExpectedMolstarSelectionSignature = molstarSelectionSignature(selections);
    if (state.msaExpectedMolstarSelectionTimer) clearTimeout(state.msaExpectedMolstarSelectionTimer);
    state.msaExpectedMolstarSelectionTimer = setTimeout(() => {
      state.msaExpectedMolstarSelectionSignature = null;
      state.msaExpectedMolstarSelectionTimer = null;
    }, 750);
  }

  function consumeExpectedMolstarSelection(selections) {
    if (state.msaExpectedMolstarSelectionSignature === null) return false;
    if (molstarSelectionSignature(selections) !== state.msaExpectedMolstarSelectionSignature) return false;
    state.msaExpectedMolstarSelectionSignature = null;
    if (state.msaExpectedMolstarSelectionTimer) {
      clearTimeout(state.msaExpectedMolstarSelectionTimer);
      state.msaExpectedMolstarSelectionTimer = null;
    }
    return true;
  }

  function clearStructureSelectionFromMsa() {
    expectMolstarSelection([]);
    clearStructureSelection();
  }

  function selectStructureResidues(selections) {
    const normalized = normalizeStructureSelections(selections);
    if (!normalized.length) {
      clearStructureSelectionFromMsa();
      return;
    }
    if (!state.viewer || typeof state.viewer.structureInteractivity !== 'function') {
      showToast('This Mol* build does not support residue selection from the MSA.');
      return;
    }
    try {
      const selectors = normalized.map(({ chain, residue }) => ({
        auth_asym_id: chain,
        auth_seq_id: residue.authSeq,
        pdbx_PDB_ins_code: normalizeInsertionCode(residue.insertion)
      }));
      let elements;
      if (selectors.length === 1) {
        const [selector] = selectors;
        elements = {
          auth_asym_id: selector.auth_asym_id,
          auth_seq_id: selector.auth_seq_id
        };
        if (selector.pdbx_PDB_ins_code) {
          elements.pdbx_PDB_ins_code = selector.pdbx_PDB_ins_code;
        }
      } else {
        const items = {
          auth_asym_id: selectors.map(selector => selector.auth_asym_id),
          auth_seq_id: selectors.map(selector => selector.auth_seq_id)
        };
        if (selectors.some(selector => selector.pdbx_PDB_ins_code)) {
          items.pdbx_PDB_ins_code = selectors.map(selector => selector.pdbx_PDB_ins_code || '');
        }
        elements = { items };
      }
      expectMolstarSelection(normalized);
      clearStructureSelection();
      state.viewer.structureInteractivity({
        elements,
        action: 'select'
      });
    } catch (error) {
      console.error('Could not select the residues in the structure:', error);
      showToast('Could not select the residues in the 3D structure.');
    }
  }

  function normalizeMsaColumns(columns) {
    if (!state.msa) return [];
    const unique = new Set();
    for (const value of columns || []) {
      const column = Number(value);
      if (!Number.isInteger(column) || column < 0 || column >= state.msa.columnCount) continue;
      unique.add(column);
    }
    return Array.from(unique).sort((a, b) => a - b);
  }

  function currentMsaColumns() {
    if (!state.msa) return [];
    const columns = normalizeMsaColumns(state.msa.selectedColumns || []);
    if (columns.length) return columns;
    return Number.isInteger(state.msa.selectedColumn) ? [state.msa.selectedColumn] : [];
  }

  function uniqueReferenceCellsForColumns(columns) {
    if (!state.msa) return [];
    const cells = [];
    const seen = new Set();
    for (const column of normalizeMsaColumns(columns)) {
      for (const link of state.msa.chainLinks.values()) {
        const key = `${link.row}:${column}`;
        if (seen.has(key)) continue;
        seen.add(key);
        cells.push({
          row: link.row,
          column,
          chain: link.chain,
          residue: link.columnToResidue.get(column) || null,
          link
        });
      }
    }
    return cells;
  }

  function setMsaSelection({
    columns = [],
    cells = [],
    detail = '',
    primaryCell = null,
    primaryColumn = null,
    anchorColumn = undefined,
    scrollIntoView = false
  } = {}) {
    if (!state.msa) return;
    const normalizedColumns = normalizeMsaColumns(columns);
    const selectedColumnSet = new Set(normalizedColumns);
    const deduplicatedCells = [];
    const seen = new Set();
    for (const cell of cells || []) {
      if (!Number.isInteger(cell?.row) || !Number.isInteger(cell?.column)) continue;
      if (normalizedColumns.length && !selectedColumnSet.has(cell.column)) continue;
      const key = `${cell.row}:${cell.column}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduplicatedCells.push(cell);
    }

    let activeColumn = Number.isInteger(primaryColumn) && selectedColumnSet.has(primaryColumn)
      ? primaryColumn
      : null;
    if (activeColumn === null && primaryCell && selectedColumnSet.has(primaryCell.column)) {
      activeColumn = primaryCell.column;
    }
    if (activeColumn === null && normalizedColumns.length) activeColumn = normalizedColumns[normalizedColumns.length - 1];

    const primary = primaryCell
      || deduplicatedCells.find(cell => cell.column === activeColumn)
      || deduplicatedCells[0]
      || null;

    state.msa.selectedColumns = normalizedColumns;
    state.msa.selectedColumn = activeColumn;
    if (anchorColumn !== undefined) {
      state.msa.selectionAnchorColumn = Number.isInteger(anchorColumn) ? anchorColumn : null;
    }
    state.msa.selectedCells = deduplicatedCells;
    state.msa.selectionDetail = detail || '';
    drawMsaCanvas();
    updateMsaSelectedNameRows();
    updateMsaSummary();
    updateMsaSelectionControls();
    if (scrollIntoView && Number.isInteger(activeColumn)) {
      scrollMsaCellIntoView(primary?.row ?? 0, activeColumn);
    }
  }

  function setMsaColumnsSelection(columns, detail, options = {}) {
    if (!state.msa) return;
    const normalizedColumns = normalizeMsaColumns(columns);
    const cells = uniqueReferenceCellsForColumns(normalizedColumns);
    const primaryColumn = Number.isInteger(options.primaryColumn) && normalizedColumns.includes(options.primaryColumn)
      ? options.primaryColumn
      : (normalizedColumns[normalizedColumns.length - 1] ?? null);
    const primaryCell = cells.find(cell => cell.column === primaryColumn && cell.row === options.primaryRow)
      || cells.find(cell => cell.column === primaryColumn)
      || null;
    setMsaSelection({
      columns: normalizedColumns,
      cells,
      detail,
      primaryCell,
      primaryColumn,
      anchorColumn: options.anchorColumn,
      scrollIntoView: Boolean(options.scrollIntoView)
    });
  }

  function clearMsaSelection(clearStructure = false) {
    if (!state.msa) return;
    setMsaSelection({
      columns: [],
      cells: [],
      detail: '',
      primaryColumn: null,
      anchorColumn: null,
      scrollIntoView: false
    });
    if (clearStructure) clearStructureSelectionFromMsa();
  }

  function scrollMsaCellIntoView(row, column) {
    if (!state.msa) return;
    const { cellWidth, cellHeight } = msaCellMetrics();
    const scroller = elements.msaScrollArea;
    const cellLeft = column * cellWidth;
    const cellTop = row * cellHeight;
    let nextLeft = scroller.scrollLeft;
    let nextTop = scroller.scrollTop;

    if (cellLeft < nextLeft || cellLeft + cellWidth > nextLeft + scroller.clientWidth) {
      nextLeft = Math.max(0, cellLeft - Math.max(0, scroller.clientWidth - cellWidth) / 2);
    }
    if (cellTop < nextTop || cellTop + cellHeight > nextTop + scroller.clientHeight) {
      nextTop = Math.max(0, cellTop - Math.max(0, scroller.clientHeight - cellHeight) / 2);
    }

    scroller.scrollLeft = nextLeft;
    scroller.scrollTop = nextTop;
    elements.msaNamesList.scrollTop = nextTop;
    scheduleMsaDraw();
  }

  function analyzeMsaColumns(columns) {
    const normalizedColumns = normalizeMsaColumns(columns);
    const links = state.msa ? Array.from(state.msa.chainLinks.values()) : [];
    const structureSelections = [];
    const seenResidues = new Set();
    let referenceGapColumns = 0;
    let referenceResidueWithoutStructureColumns = 0;

    for (const column of normalizedColumns) {
      let referenceResidueCount = 0;
      let mappedResidueCount = 0;
      for (const link of links) {
        const referenceRecord = state.msa.records[link.row];
        const referenceCharacter = (referenceRecord?.sequence[column] || '-').toUpperCase();
        if (referenceCharacter === '-' || referenceCharacter === '.') continue;
        referenceResidueCount += 1;
        const residue = link.columnToResidue.get(column);
        if (!residue) continue;
        mappedResidueCount += 1;
        const key = structureResidueKey(link.chain, residue);
        if (seenResidues.has(key)) continue;
        seenResidues.add(key);
        structureSelections.push({ chain: link.chain, residue, link, column });
      }
      if (links.length && referenceResidueCount === 0) referenceGapColumns += 1;
      else if (referenceResidueCount > 0 && mappedResidueCount === 0) referenceResidueWithoutStructureColumns += 1;
    }

    return {
      columns: normalizedColumns,
      links,
      structureSelections,
      referenceGapColumns,
      referenceResidueWithoutStructureColumns
    };
  }

  function describeMsaColumnAnalysis(analysis) {
    const count = analysis.columns.length;
    if (!count) return '';
    if (!analysis.links.length) {
      return count === 1
        ? `Column ${analysis.columns[0] + 1} selected · no structure reference is configured`
        : `${count} alignment columns selected · no structure reference is configured`;
    }

    if (count === 1) {
      const column = analysis.columns[0];
      if (analysis.structureSelections.length === 1) {
        const selected = analysis.structureSelections[0];
        return `Column ${column + 1} · chain ${selected.chain} residue ${formatMappedResidue(selected.residue)}`;
      }
      if (analysis.structureSelections.length > 1) {
        return `Column ${column + 1} · ${analysis.structureSelections.length} linked structure residues`;
      }
      if (analysis.referenceGapColumns) {
        return `Column ${column + 1} selected · the reference has no residue at this alignment position`;
      }
      if (analysis.referenceResidueWithoutStructureColumns) {
        return `Column ${column + 1} selected · the reference residue is not present in the loaded structure`;
      }
      return `Column ${column + 1} selected · no linked structure residue`;
    }

    const parts = [`${count} alignment columns selected`];
    const structuralCount = analysis.structureSelections.length;
    parts.push(`${structuralCount} structural residue${structuralCount === 1 ? '' : 's'} selected`);
    if (analysis.referenceGapColumns) {
      parts.push(`${analysis.referenceGapColumns} column${analysis.referenceGapColumns === 1 ? '' : 's'} without a reference residue`);
    }
    if (analysis.referenceResidueWithoutStructureColumns) {
      parts.push(
        `${analysis.referenceResidueWithoutStructureColumns} reference residue${analysis.referenceResidueWithoutStructureColumns === 1 ? '' : 's'} absent from the loaded structure`
      );
    }
    return parts.join(' · ');
  }

  function applyMsaColumnsToStructure(columns, options = {}) {
    const analysis = analyzeMsaColumns(columns);
    const detail = options.detail || describeMsaColumnAnalysis(analysis);
    setMsaColumnsSelection(analysis.columns, detail, {
      primaryRow: options.primaryRow,
      primaryColumn: options.primaryColumn,
      anchorColumn: options.anchorColumn,
      scrollIntoView: options.scrollIntoView
    });
    selectStructureResidues(analysis.structureSelections);
    return analysis;
  }

  function inclusiveColumnRange(first, last) {
    const start = Math.min(first, last);
    const end = Math.max(first, last);
    const range = [];
    for (let column = start; column <= end; column += 1) range.push(column);
    return range;
  }

  function handleMsaCanvasClick(event) {
    if (!state.msa) return;
    const rect = elements.msaCanvas.getBoundingClientRect();
    const { cellWidth, cellHeight } = msaCellMetrics();
    const worldX = elements.msaScrollArea.scrollLeft + event.clientX - rect.left;
    const worldY = elements.msaScrollArea.scrollTop + event.clientY - rect.top;
    const column = Math.floor(worldX / cellWidth);
    const clickedRow = Math.floor(worldY / cellHeight);
    if (clickedRow < 0 || clickedRow >= state.msa.records.length || column < 0 || column >= state.msa.columnCount) return;

    const currentColumns = currentMsaColumns();
    const additive = event.ctrlKey || event.metaKey;
    const anchor = Number.isInteger(state.msa.selectionAnchorColumn)
      ? state.msa.selectionAnchorColumn
      : (Number.isInteger(state.msa.selectedColumn) ? state.msa.selectedColumn : column);
    let nextColumns;
    let nextAnchor = state.msa.selectionAnchorColumn;

    if (event.shiftKey) {
      const range = inclusiveColumnRange(anchor, column);
      nextColumns = additive ? normalizeMsaColumns([...currentColumns, ...range]) : range;
      nextAnchor = anchor;
    } else if (additive) {
      const selected = new Set(currentColumns);
      if (selected.has(column)) selected.delete(column);
      else selected.add(column);
      nextColumns = normalizeMsaColumns(selected);
      nextAnchor = column;
    } else {
      nextColumns = [column];
      nextAnchor = column;
    }

    const primaryColumn = nextColumns.includes(column)
      ? column
      : (nextColumns[nextColumns.length - 1] ?? null);
    applyMsaColumnsToStructure(nextColumns, {
      primaryRow: clickedRow,
      primaryColumn,
      anchorColumn: nextAnchor,
      scrollIntoView: false
    });
  }

  function extractMolstarResidues(loci) {
    const structureLib = window.molstar?.lib?.structure;
    const lociApi = structureLib?.StructureElement?.Loci;
    const properties = structureLib?.StructureProperties;
    if (!lociApi?.is?.(loci) || typeof lociApi.forEachLocation !== 'function' || !properties) return [];

    const residues = [];
    const seen = new Set();
    lociApi.forEachLocation(loci, location => {
      const chain = String(properties.chain.auth_asym_id(location) ?? '').trim();
      const authSeq = Number(properties.residue.auth_seq_id(location));
      if (!Number.isFinite(authSeq)) return;
      const insertion = normalizeInsertionCode(properties.residue.pdbx_PDB_ins_code(location));
      const key = `${chain}|${residueLookupKey(authSeq, insertion)}`;
      if (seen.has(key)) return;
      seen.add(key);
      residues.push({
        chain,
        authSeq,
        insertion,
        labelSeq: properties.residue.label_seq_id(location),
        residueName: properties.residue.label_comp_id(location)
      });
    });
    return residues;
  }

  function mappedCellForStructureResidue(residue) {
    if (!state.msa) return null;
    const link = state.msa.chainLinks?.get(residue.chain);
    if (!link) return null;

    let column = link.residueToColumn.get(residueLookupKey(residue.authSeq, residue.insertion));
    if (column === undefined) {
      const candidates = link.authSeqToColumns.get(residue.authSeq);
      if (candidates?.size === 1) column = candidates.values().next().value;
    }
    if (column === undefined) return { link, cell: null };
    return {
      link,
      cell: {
        row: link.row,
        column,
        chain: residue.chain,
        residue
      }
    };
  }

  function readMolstarSelectionResidues() {
    const manager = state.viewer?.plugin?.managers?.structure?.selection;
    const entries = manager?.entries;
    if (!entries || typeof entries.values !== 'function') {
      return state.msaLastMolstarClickResidues || [];
    }
    const residues = [];
    const seen = new Set();
    for (const entry of entries.values()) {
      let loci = entry?.selection || entry?.loci || null;
      const structureApi = window.molstar?.lib?.structure?.Structure;
      if (!loci && entry?.structure && typeof structureApi?.toStructureElementLoci === 'function') {
        loci = structureApi.toStructureElementLoci(entry.structure);
      }
      loci ||= entry;
      for (const residue of extractMolstarResidues(loci)) {
        const key = structureResidueKey(residue.chain, residue);
        if (seen.has(key)) continue;
        seen.add(key);
        residues.push(residue);
      }
    }
    return residues.length ? residues : (state.msaLastMolstarClickResidues || []);
  }

  function preferredMappedCell(residues, mappedCells) {
    for (let index = (state.msaLastMolstarClickResidues || []).length - 1; index >= 0; index -= 1) {
      const preferred = mappedCellForStructureResidue(state.msaLastMolstarClickResidues[index]);
      if (preferred?.cell && mappedCells.some(mapped => mapped.cell.column === preferred.cell.column && mapped.cell.row === preferred.cell.row)) {
        return preferred;
      }
    }
    const activeColumn = state.msa?.selectedColumn;
    if (Number.isInteger(activeColumn)) {
      const active = mappedCells.find(mapped => mapped.cell.column === activeColumn);
      if (active) return active;
    }
    return mappedCells[mappedCells.length - 1] || null;
  }

  function syncMsaFromMolstarSelection() {
    if (!state.msa) return;
    const residues = readMolstarSelectionResidues();
    if (consumeExpectedMolstarSelection(residues)) return;

    if (!residues.length) {
      setMsaSelection({
        columns: [],
        cells: [],
        detail: '',
        primaryColumn: null,
        anchorColumn: null,
        scrollIntoView: false
      });
      return;
    }

    const mappedCells = [];
    let outsideMappedSegment = 0;
    let unlinked = 0;
    for (const residue of residues) {
      const mapped = mappedCellForStructureResidue(residue);
      if (mapped?.cell) mappedCells.push(mapped);
      else if (mapped?.link) outsideMappedSegment += 1;
      else unlinked += 1;
    }

    const columns = normalizeMsaColumns(mappedCells.map(mapped => mapped.cell.column));
    const preferred = preferredMappedCell(residues, mappedCells);
    const mappedResidueCount = mappedCells.length;
    let detail;
    if (residues.length === 1 && preferred?.cell) {
      detail = `Chain ${preferred.cell.chain} residue ${formatMappedResidue(preferred.cell.residue)} · column ${preferred.cell.column + 1}`;
    } else {
      const parts = [
        `${residues.length} structural residue${residues.length === 1 ? '' : 's'} selected`,
        `${mappedResidueCount} mapped to ${columns.length} alignment column${columns.length === 1 ? '' : 's'}`
      ];
      if (outsideMappedSegment) {
        parts.push(`${outsideMappedSegment} outside the mapped reference segment`);
      }
      if (unlinked) {
        parts.push(`${unlinked} from unlinked chain${unlinked === 1 ? '' : 's'}`);
      }
      detail = parts.join(' · ');
    }

    if (!columns.length) {
      if (outsideMappedSegment && !unlinked) {
        const first = residues[0];
        detail = residues.length === 1
          ? `Chain ${first.chain} residue ${formatMappedResidue(first)} is outside the mapped reference segment`
          : `${residues.length} structural residues selected · none are inside the mapped reference segment`;
      } else if (unlinked && !outsideMappedSegment) {
        const first = residues[0];
        detail = residues.length === 1
          ? `Chain ${first.chain || '(blank)'} is not linked under msa.references`
          : `${residues.length} structural residues selected · none are from chains linked under msa.references`;
      }
      setMsaSelection({
        columns: [],
        cells: [],
        detail,
        primaryColumn: null,
        anchorColumn: null,
        scrollIntoView: false
      });
      return;
    }

    setMsaColumnsSelection(columns, detail, {
      primaryRow: preferred?.cell?.row,
      primaryColumn: preferred?.cell?.column,
      anchorColumn: preferred?.cell?.column,
      scrollIntoView: true
    });
  }

  function scheduleMolstarSelectionSync() {
    if (!state.msa || state.msaSelectionSyncFrame) return;
    state.msaSelectionSyncFrame = requestAnimationFrame(() => {
      state.msaSelectionSyncFrame = 0;
      syncMsaFromMolstarSelection();
    });
  }

  function notifyMolstarSelectionChanged() {
    if (state.selectionEventFrame) return;
    state.selectionEventFrame = requestAnimationFrame(() => {
      state.selectionEventFrame = 0;
      const residues = readMolstarSelectionResidues();
      dispatchViewerEvent('selection-changed', {
        residues: residues.map(residue => ({ ...residue }))
      });
      scheduleMolstarSelectionSync();
    });
  }

  function handleMolstarInteractionClick(event) {
    const residues = extractMolstarResidues(event?.current?.loci);
    if (residues.length) state.msaLastMolstarClickResidues = residues;
    notifyMolstarSelectionChanged();
  }

  function subscribeMolstarObservable(observable, handler) {
    if (!observable) return false;
    if (typeof state.viewer?.subscribe === 'function') {
      state.viewer.subscribe(observable, handler);
      return true;
    }
    if (typeof observable.subscribe === 'function') {
      observable.subscribe(handler);
      return true;
    }
    return false;
  }

  function installMolstarMsaSelectionBridge() {
    const clickBehavior = state.viewer?.plugin?.behaviors?.interaction?.click;
    const selectionChanged = state.viewer?.plugin?.managers?.structure?.selection?.events?.changed;
    let installed = false;
    try {
      state.viewer.plugin?.managers?.interactivity?.setProps?.({ granularity: 'residue' });
      installed = subscribeMolstarObservable(clickBehavior, handleMolstarInteractionClick) || installed;
      installed = subscribeMolstarObservable(selectionChanged, notifyMolstarSelectionChanged) || installed;
      if (!installed) {
        console.warn('[Protein Region Viewer] Mol* selection events are unavailable; structure-to-MSA selection is disabled.');
      }
    } catch (error) {
      console.warn('[Protein Region Viewer] Could not install the structure-to-MSA selection bridge.', error);
    }
  }

  function syncMsaScroll(source, target) {
    if (state.msaScrollSyncing) return;
    state.msaScrollSyncing = true;
    target.scrollTop = source.scrollTop;
    state.msaScrollSyncing = false;
    updateMsaScrollbars();
    scheduleMsaDraw();
  }
  // --- end MSA panel ---------------------------------------------------------

  function serializableClone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function getAnnotationSnapshot() {
    if (!state.current) return null;
    const annotation = state.current.annotation;
    return {
      version: annotation.version,
      title: annotation.title,
      numbering: annotation.numbering,
      defaultChains: [...annotation.defaultChains],
      msaReferences: { ...annotation.msaReferences },
      viewer: serializableClone(annotation.viewer),
      regions: annotation.regions.map(region => ({
        index: region.index,
        enabled: region.enabled,
        name: region.name,
        selectionType: region.selectionType,
        start: region.start,
        end: region.end,
        positions: [...region.positions],
        color: region.color,
        numbering: region.numbering,
        chains: [...region.chains],
        label: region.label,
        tooltip: region.tooltip,
        description: region.description,
        createComponent: region.createComponent,
        componentName: region.componentName,
        componentRepresentation: region.componentRepresentation,
        componentRepresentationParams: serializableClone(region.componentRepresentationParams),
        componentColorTheme: region.componentColorTheme,
        componentColorThemeParams: serializableClone(region.componentColorThemeParams),
        componentColor: region.componentColor,
        componentOpacity: region.componentOpacity,
        componentVisible: region.componentVisible,
        coverage: serializableClone(region.coverage)
      }))
    };
  }

  function molstarColorToHex(value, fallback = DEFAULT_COMPONENT_COLOR) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return `#${(number >>> 0 & 0xFFFFFF).toString(16).padStart(6, '0').toUpperCase()}`;
  }

  function safeSerializableClone(value) {
    if (value === undefined || value === null) return null;
    try {
      return serializableClone(value);
    } catch (_error) {
      return null;
    }
  }

  function importableMolstarRepresentation(rawName) {
    const normalized = cleanString(rawName)
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replaceAll('_', '-');
    return MOLSTAR_IMPORT_REPRESENTATION_ALIASES[normalized] || null;
  }

  function importableMolstarColorTheme(rawName) {
    const raw = cleanString(rawName || 'default') || 'default';
    try {
      return normalizeComponentColorTheme(raw, 'default', 'Mol* component color theme');
    } catch (_error) {
      return 'default';
    }
  }

  function componentLabel(component, fallback) {
    return cleanString(
      component?.cell?.obj?.label ??
      component?.cell?.transform?.params?.label ??
      component?.cell?.params?.values?.label
    ) || fallback;
  }

  function componentOrigin(component, structureRef, label) {
    const ref = cleanString(component?.cell?.transform?.ref).toLowerCase();
    const annotation = state.current?.annotation;
    const knownLabels = new Set([
      cleanString(annotation?.viewer?.baseComponentName),
      ...(annotation?.regions || []).map(region => cleanString(region.componentName || region.name))
    ].filter(Boolean).map(value => value.toLowerCase()));
    const normalizedLabel = cleanString(label).toLowerCase();
    if (ref.includes('yaml-base-structure') || ref.includes('yaml-region-') || knownLabels.has(normalizedLabel)) {
      return 'yaml';
    }
    const componentData = component?.cell?.obj?.data;
    const structureData = structureRef?.cell?.obj?.data;
    if (componentData && structureData && Number(componentData.elementCount) >= Number(structureData.elementCount)) {
      return 'base';
    }
    return 'manual';
  }

  function componentResidues(componentData) {
    const structureApi = window.molstar?.lib?.structure?.Structure;
    if (!componentData || typeof structureApi?.toStructureElementLoci !== 'function') return [];
    try {
      return extractMolstarResidues(structureApi.toStructureElementLoci(componentData));
    } catch (error) {
      console.warn('[Protein Region Viewer] Could not inspect a Mol* component selection.', error);
      return [];
    }
  }

  function getMolstarComponentsSnapshot(options = {}) {
    const manager = state.viewer?.plugin?.managers?.structure?.component;
    const structures = manager?.currentStructures || [];
    const includeGenerated = options?.includeGenerated === true;
    const includeUnsupported = options?.includeUnsupported === true;
    const candidates = [];
    let componentIndex = 0;

    for (const structureRef of structures) {
      for (const component of structureRef?.components || []) {
        componentIndex += 1;
        const label = componentLabel(component, `Mol* component ${componentIndex}`);
        const origin = componentOrigin(component, structureRef, label);
        if (!includeGenerated && origin !== 'manual') continue;

        const data = component?.cell?.obj?.data;
        const residues = componentResidues(data);
        if (!residues.length) continue;
        const representations = component?.representations || [];
        const representationCount = representations.length;

        representations.forEach((representationRef, representationIndex) => {
          const params = representationRef?.cell?.transform?.params || representationRef?.cell?.params?.values || {};
          const rawRepresentation = cleanString(params?.type?.name);
          const representation = importableMolstarRepresentation(rawRepresentation);
          if (!representation && !includeUnsupported) return;

          const rawTheme = cleanString(params?.colorTheme?.name) || 'default';
          const colorTheme = importableMolstarColorTheme(rawTheme);
          const themeParams = safeSerializableClone(params?.colorTheme?.params);
          const color = rawTheme.toLowerCase() === 'uniform'
            ? molstarColorToHex(params?.colorTheme?.params?.value)
            : DEFAULT_COMPONENT_COLOR;
          const alpha = Number(params?.type?.params?.alpha ?? representationRef?.cell?.obj?.data?.repr?.props?.alpha);
          const opacity = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
          const visible = !Boolean(component?.cell?.state?.isHidden || representationRef?.cell?.state?.isHidden);
          const representationLabel = cleanString(representationRef?.cell?.obj?.label) || rawRepresentation || 'representation';
          const suggestedName = representationCount > 1
            ? `${label} — ${representationLabel}`
            : label;
          const chains = [...new Set(residues.map(residue => String(residue.chain || '')))].sort();
          const warnings = [];
          if (!representation) warnings.push(`Representation "${rawRepresentation || 'unknown'}" is not supported by the protein-viewer YAML.`);
          if (colorTheme === 'default' && rawTheme && rawTheme.toLowerCase() !== 'default') {
            warnings.push(`Color theme "${rawTheme}" will use the Mol* default in the exported YAML.`);
          }

          candidates.push({
            id: `${cleanString(component?.cell?.transform?.ref) || componentIndex}::${cleanString(representationRef?.cell?.transform?.ref) || representationIndex}`,
            componentRef: cleanString(component?.cell?.transform?.ref),
            representationRef: cleanString(representationRef?.cell?.transform?.ref),
            componentName: label,
            name: suggestedName,
            origin,
            representationIndex,
            representationCount,
            rawRepresentation,
            representation: representation || rawRepresentation || 'cartoon',
            representationLabel,
            colorTheme,
            rawColorTheme: rawTheme,
            colorThemeParams: colorTheme === 'uniform' || colorTheme === 'default' ? null : themeParams,
            color,
            opacity,
            visible,
            residues: residues.map(residue => ({ ...residue })),
            residueCount: residues.length,
            atomCount: Number(data?.elementCount) || 0,
            chains,
            supported: Boolean(representation),
            warnings
          });
        });
      }
    }

    return candidates;
  }

  function getStructureChainsSnapshot() {
    if (!state.current) return [];
    return state.current.pdbInfo.chains.map(chain => {
      const sequence = chainOneLetterSequence(chain);
      return {
        chain: chain.chain,
        residueCount: chain.residues.length,
        minAuth: chain.minAuth,
        maxAuth: chain.maxAuth,
        sequence: sequence.letters,
        gapAwareNumbering: sequence.gapAwareNumbering,
        residues: chain.residues.map(residue => ({
          authSeq: residue.authSeq,
          insertion: normalizeInsertionCode(residue.insertion),
          labelSeq: residue.labelSeq,
          residueName: residue.residueName
        }))
      };
    });
  }

  function getMsaRecordsSnapshot() {
    if (!state.msa) return [];
    return state.msa.records.map((record, index) => {
      const ungapped = ungapWithColumns(record.sequence);
      return {
        index,
        id: record.id,
        header: record.header,
        sequence: record.sequence,
        ungappedLength: ungapped.letters.length
      };
    });
  }

  function kmerContainmentScore(first, second) {
    const a = String(first || '');
    const b = String(second || '');
    if (!a.length || !b.length) return 0;
    const k = Math.min(a.length, b.length) >= 9 ? 3 : Math.min(a.length, b.length) >= 4 ? 2 : 1;
    const makeSet = value => {
      const set = new Set();
      for (let i = 0; i <= value.length - k; i += 1) {
        const word = value.slice(i, i + k);
        if (!word.includes('X')) set.add(word);
      }
      return set;
    };
    const aSet = makeSet(a);
    const bSet = makeSet(b);
    if (!aSet.size || !bSet.size) return 0;
    let shared = 0;
    const smaller = aSet.size <= bSet.size ? aSet : bSet;
    const larger = smaller === aSet ? bSet : aSet;
    for (const word of smaller) if (larger.has(word)) shared += 1;
    return shared / Math.max(1, Math.min(aSet.size, bSet.size));
  }

  function candidateRankValue(match) {
    if (!match) return -Infinity;
    const coverage = Math.max(match.chainCoverage || 0, match.referenceCoverage || 0);
    const balancedCoverage = Math.min(match.chainCoverage || 0, match.referenceCoverage || 0);
    return (match.mappedResidues || 0) * 20 +
      (match.matches || 0) * 5 +
      (match.identity || 0) * 100 +
      coverage * 30 + balancedCoverage * 20 +
      (String(match.method || '').startsWith('exact') ? 10000 : 0);
  }

  async function suggestMsaReferences(options = {}) {
    if (!state.current) throw new Error('Load a structure before finding MSA references.');
    if (!state.msa) throw new Error('Load an aligned FASTA file before finding references.');
    const requestedLimit = Number(options.limit);
    const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(20, requestedLimit)) : 5;
    const requestedShortlist = Number(options.shortlist);
    const shortlistSize = Number.isInteger(requestedShortlist)
      ? Math.max(limit, Math.min(40, requestedShortlist))
      : Math.max(12, limit * 3);
    const requestedChains = Array.isArray(options.chains)
      ? new Set(options.chains.map(value => String(value)))
      : null;
    const results = [];

    for (const chain of state.current.pdbInfo.chains) {
      if (requestedChains && !requestedChains.has(chain.chain)) continue;
      const chainSequence = chainOneLetterSequence(chain);
      const chainLetters = chainSequence.letters;
      const recognizedResidues = Array.from(chainLetters).filter(letter => letter !== 'X').length;
      const minimumRecognized = Math.min(3, chainLetters.length);
      if (recognizedResidues < minimumRecognized) {
        results.push({
          chain: chain.chain,
          chainLength: chain.residues.length,
          recognizedResidues,
          proteinLike: false,
          candidates: []
        });
        continue;
      }
      const exactCandidates = [];
      const roughCandidates = [];

      state.msa.records.forEach((record, recordIndex) => {
        const { letters: fastaLetters } = ungapWithColumns(record.sequence);
        if (!fastaLetters.length || !chainLetters.length) return;
        const exact = exactOverlapPairs(chainLetters, fastaLetters);
        if (exact) {
          const match = matchChainToFastaRecord(chain, record);
          if (match) exactCandidates.push({ recordIndex, record, match, roughScore: 1 });
          return;
        }
        const containment = kmerContainmentScore(chainLetters, fastaLetters);
        const lengthRatio = Math.min(chainLetters.length, fastaLetters.length) / Math.max(chainLetters.length, fastaLetters.length);
        roughCandidates.push({ recordIndex, record, roughScore: containment * 0.85 + lengthRatio * 0.15 });
      });

      roughCandidates.sort((a, b) => b.roughScore - a.roughScore || a.recordIndex - b.recordIndex);
      const evaluated = [...exactCandidates];
      for (const candidate of roughCandidates.slice(0, shortlistSize)) {
        const match = matchChainToFastaRecord(chain, candidate.record);
        if (match?.mappedResidues) evaluated.push({ ...candidate, match });
        if (evaluated.length % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }

      const deduplicated = new Map();
      for (const candidate of evaluated) {
        const existing = deduplicated.get(candidate.recordIndex);
        if (!existing || candidateRankValue(candidate.match) > candidateRankValue(existing.match)) {
          deduplicated.set(candidate.recordIndex, candidate);
        }
      }
      const candidates = Array.from(deduplicated.values())
        .sort((a, b) => candidateRankValue(b.match) - candidateRankValue(a.match) || a.recordIndex - b.recordIndex)
        .slice(0, limit)
        .map(candidate => ({
          recordIndex: candidate.recordIndex,
          id: candidate.record.id,
          header: candidate.record.header,
          reference: candidate.record.id || candidate.record.header,
          method: candidate.match.method,
          identity: candidate.match.identity,
          mappedResidues: candidate.match.mappedResidues,
          chainLength: candidate.match.chainLength,
          referenceLength: candidate.match.referenceLength,
          chainCoverage: candidate.match.chainCoverage,
          referenceCoverage: candidate.match.referenceCoverage,
          score: candidate.match.score,
          ambiguous: candidate.match.ambiguous
        }));
      results.push({
        chain: chain.chain,
        chainLength: chain.residues.length,
        recognizedResidues,
        proteinLike: true,
        candidates
      });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    dispatchViewerEvent('msa-reference-suggestions', { results });
    return results;
  }

  function setMsaReferences(references) {
    if (!state.current) throw new Error('Load a structure before setting MSA references.');
    const normalized = {};
    for (const [chain, reference] of Object.entries(references || {})) {
      const chainId = String(chain || '').trim();
      const ref = cleanString(reference);
      if (chainId && ref) normalized[chainId] = ref;
    }
    state.current.annotation.msaReferences = normalized;
    const warnings = refreshMsaLinks(state.current.annotation, state.current.pdbInfo);
    dispatchViewerEvent('msa-references-changed', {
      references: { ...normalized },
      linkedChains: state.msa ? Array.from(state.msa.chainLinks.keys()) : [],
      warnings
    });
    return {
      references: { ...normalized },
      linkedChains: state.msa ? Array.from(state.msa.chainLinks.keys()) : [],
      warnings
    };
  }

  function bindEvents() {
    elements.layoutSelect.addEventListener('change', event => applyLayout(event.target.value));
    elements.loadConfiguredButton.addEventListener('click', loadConfigured);
    elements.choosePdbButton.addEventListener('click', choosePdb);
    elements.chooseYamlButton.addEventListener('click', chooseYaml);
    if (elements.clearYamlButton) {
      elements.clearYamlButton.addEventListener('click', () => {
        state.selectedYamlFile = null;
        elements.yamlFileInput.value = '';
        updateSelectedFiles();
        showToast('The local YAML selection was cleared.');
      });
    }
    elements.loadLocalButton.addEventListener('click', loadSelectedFiles);
    elements.overlayConfiguredButton.addEventListener('click', loadConfigured);
    elements.overlayLocalButton.addEventListener('click', choosePdb);
    elements.reloadButton.addEventListener('click', reloadCurrent);
    elements.downloadPdbButton.addEventListener('click', () => {
      if (state.current) {
        const mime = state.current.structureFormat === 'mmcif' ? 'chemical/x-cif;charset=utf-8' : 'chemical/x-pdb;charset=utf-8';
        downloadText(state.current.pdbText, state.current.pdbName, mime);
      }
    });
    elements.downloadYamlButton.addEventListener('click', () => {
      if (state.current?.yamlText) downloadText(state.current.yamlText, state.current.yamlName, 'application/yaml;charset=utf-8');
    });
    elements.downloadTemplateButton.addEventListener('click', downloadTemplate);
    elements.fullscreenButton.addEventListener('click', toggleFullscreen);

    elements.pdbFileInput.addEventListener('change', event => {
      state.selectedPdbFile = event.target.files?.[0] || null;
      updateSelectedFiles();
      if (!config.editorMode && state.selectedPdbFile && !state.selectedYamlFile) setTimeout(chooseYaml, 120);
    });
    elements.yamlFileInput.addEventListener('change', event => {
      state.selectedYamlFile = event.target.files?.[0] || null;
      updateSelectedFiles();
    });

    elements.chooseMsaButton.addEventListener('click', chooseMsa);
    elements.msaFileInput.addEventListener('change', event => {
      state.selectedMsaFile = event.target.files?.[0] || null;
      updateMsaFilePill();
      if (state.selectedMsaFile) loadSelectedMsa();
    });
    if (elements.clearMsaSelectionButton) {
      elements.clearMsaSelectionButton.addEventListener('click', () => clearMsaSelection(true));
    }
    elements.clearMsaButton.addEventListener('click', clearMsa);
    elements.downloadMsaButton.addEventListener('click', () => {
      if (state.msa) downloadText(state.msa.text, state.msa.fileName, 'text/x-fasta;charset=utf-8');
    });
    elements.msaCanvas.addEventListener('click', handleMsaCanvasClick);
    elements.msaScrollArea.addEventListener('scroll', () => syncMsaScroll(elements.msaScrollArea, elements.msaNamesList), { passive: true });
    elements.msaNamesList.addEventListener('scroll', () => syncMsaScroll(elements.msaNamesList, elements.msaScrollArea), { passive: true });
    elements.msaScrollArea.addEventListener('wheel', event => {
      if (!event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      setMsaScrollAxis('horizontal', elements.msaScrollArea.scrollLeft + event.deltaY);
    }, { passive: false });
    elements.msaNamesList.addEventListener('wheel', event => {
      if (!state.msa) return;
      event.preventDefault();
      if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        setMsaScrollAxis('horizontal', elements.msaScrollArea.scrollLeft + delta);
      } else {
        setMsaScrollAxis('vertical', elements.msaScrollArea.scrollTop + event.deltaY);
      }
    }, { passive: false });
    bindMsaScrollbar(elements.msaHorizontalScrollbar, 'horizontal');
    bindMsaScrollbar(elements.msaVerticalScrollbar, 'vertical');
    if (elements.msaZoomInput) {
      elements.msaZoomInput.addEventListener('input', handleMsaZoomInput);
    }

    for (const eventName of ['dragenter', 'dragover']) {
      elements.dropZone.addEventListener(eventName, event => {
        event.preventDefault();
        if (eventName === 'dragenter') state.dragDepth += 1;
        elements.dropOverlay.classList.add('is-visible');
      });
    }
    elements.dropZone.addEventListener('dragleave', event => {
      event.preventDefault();
      state.dragDepth = Math.max(0, state.dragDepth - 1);
      if (state.dragDepth === 0) elements.dropOverlay.classList.remove('is-visible');
    });
    elements.dropZone.addEventListener('drop', event => {
      event.preventDefault();
      state.dragDepth = 0;
      elements.dropOverlay.classList.remove('is-visible');
      handleDroppedFiles(Array.from(event.dataTransfer?.files || []));
    });

    for (const eventName of ['fullscreenchange', 'webkitfullscreenchange']) {
      document.addEventListener(eventName, requestViewerResize);
    }
    window.addEventListener('resize', () => {
      requestViewerResize();
      scheduleMsaDraw();
    });
    if (typeof ResizeObserver === 'function' && elements.msaScrollArea) {
      state.msaResizeObserver = new ResizeObserver(() => scheduleMsaDraw());
      state.msaResizeObserver.observe(elements.msaScrollArea);
    }
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && state.fallbackFullscreen) toggleFullscreen();
    });
  }

  async function initializeViewer() {
    elements.brandTitle.textContent = config.title;
    elements.brandSubtitle.textContent = config.editorMode ? 'Structure annotations, components, and linked MSA' : 'PDB/CIF + YAML component representations';
    elements.pageTitle.textContent = config.title;
    elements.pageSubtitle.textContent = config.subtitle;
    document.title = config.title;
    if (elements.paperHeader) {
      const hasPaper = Boolean(config.paperTitle);
      const hasFigure = Boolean(config.figureTitle);
      if (elements.paperTitleEl) {
        elements.paperTitleEl.textContent = config.paperTitle;
        elements.paperTitleEl.hidden = !hasPaper;
      }
      if (elements.figureTitleEl) {
        elements.figureTitleEl.textContent = config.figureTitle;
        elements.figureTitleEl.hidden = !hasFigure;
      }
      elements.paperHeader.hidden = !hasPaper && !hasFigure;
    }
    elements.layoutSelect.value = config.defaultLayout;
    elements.loadConfiguredButton.disabled = !configuredSources();
    elements.overlayConfiguredButton.disabled = !configuredSources();
    if (elements.msaZoomInput) {
      elements.msaZoomInput.value = String(state.msaCellSize);
    }
    if (elements.msaZoomValue) {
      elements.msaZoomValue.textContent = `${state.msaCellSize}px`;
    }
    bindEvents();
    updateSelectedFiles();
    updateMsaFilePill();
    renderMsaPanel();

    try {
      if (!window.molstar?.Viewer?.create) throw new Error('Mol* did not load from the CDN.');
      state.viewer = await window.molstar.Viewer.create('molstarViewer', {
        layoutIsExpanded: false,
        layoutShowControls: true,
        layoutShowRemoteState: false,
        volumeStreamingDisabled: Boolean(window.EVOSUPPLEMENT_PORTABLE),
        layoutShowSequence: true,
        layoutShowLog: true,
        layoutShowLeftPanel: true,
        layoutControlsDisplay: 'reactive',
        collapseLeftPanel: false,
        collapseRightPanel: false,
        viewportShowExpand: false,
        viewportShowToggleFullscreen: false,
        viewportShowControls: true,
        viewportShowSettings: true,
        viewportShowSelectionMode: true,
        viewportShowAnimation: true,
        viewportShowTrajectoryControls: true,
        viewportShowScreenshotControls: true,
        viewportShowReset: true,
        viewportBackgroundColor: DEFAULT_BACKGROUND,
        powerPreference: 'high-performance',
        illumination: false
      });
      installMolstarMsaSelectionBridge();
      await enforceHydrogensHidden();
      applyLayout(config.defaultLayout, false);
      setViewerStatus('idle', 'Ready');
      showOverlay(
        'empty',
        config.editorMode ? 'Load a PDB or mmCIF structure' : 'Load a PDB/CIF + YAML pair',
        config.editorMode
          ? 'A YAML annotation and aligned FASTA are optional. Load a structure, select residues in Mol*, and create compatible annotations below.'
          : 'Use the configured repository files, select two local files, or drag the pair onto this component-only viewer.'
      );
      dispatchViewerEvent('ready', { version: APP_VERSION, editorMode: config.editorMode });
      if (config.autoLoad && configuredSources()) {
        await loadConfigured();
        if (configuredMsaSource()) await loadMsaConfigured();
      }
    } catch (error) {
      console.error(error);
      setViewerStatus('error', 'Initialization failed');
      showOverlay('error', 'Mol* Viewer could not start', error?.message || String(error));
    }
  }

  window.ProteinRegionViewer = Object.freeze({
    version: APP_VERSION,
    loadConfigured,
    loadSelectedFiles,
    reload: reloadCurrent,
    loadMsaConfigured,
    loadSelectedMsa,
    clearMsa,
    applyAnnotationYaml,
    getAnnotation: getAnnotationSnapshot,
    getStructureChains: getStructureChainsSnapshot,
    getMsaRecords: getMsaRecordsSnapshot,
    getCurrentSelectionResidues: () => readMolstarSelectionResidues().map(residue => ({ ...residue })),
    getMolstarComponents: options => getMolstarComponentsSnapshot(options),
    selectResidues: residues => selectStructureResidues(residues),
    clearStructureSelection,
    suggestMsaReferences,
    setMsaReferences,
    downloadText,
    setLayout: value => applyLayout(value),
    setMsaZoom: value => {
      const clamped = Math.max(MSA_MIN_CELL_SIZE, Math.min(MSA_MAX_ZOOM_CELL_SIZE, Number(value) || MSA_INITIAL_ZOOM_CELL_SIZE));
      state.msaCellSize = clamped;
      if (elements.msaZoomInput) elements.msaZoomInput.value = String(clamped);
      if (elements.msaZoomValue) elements.msaZoomValue.textContent = `${clamped}px`;
      if (state.msa) {
        updateMsaVirtualGeometry();
        drawMsaCanvas();
      }
      return clamped;
    },
    getState: () => ({
      version: APP_VERSION,
      layout: elements.layoutSelect.value,
      configured: { ...config },
      selectedFiles: {
        pdb: state.selectedPdbFile?.name || null,
        yaml: state.selectedYamlFile?.name || null,
        msa: state.selectedMsaFile?.name || null
      },
      msa: state.msa ? {
        fileName: state.msa.fileName,
        sequenceCount: state.msa.records.length,
        columnCount: state.msa.columnCount,
        cellSize: state.msaCellSize,
        linkedChains: Array.from((state.msa.chainLinks || state.msa.rowLinks).values()).map(link => ({
          chain: link.chain,
          reference: link.reference,
          identity: link.identity,
          method: link.method,
          mappedResidues: link.mappedResidues,
          chainLength: link.chainLength,
          chainAlignmentLength: link.chainAlignmentLength,
          gapAwareNumbering: link.gapAwareNumbering,
          referenceLength: link.referenceLength,
          chainCoverage: link.chainCoverage,
          referenceCoverage: link.referenceCoverage,
          ambiguousExactSlice: link.ambiguous
        })),
        selectedColumns: [...(state.msa.selectedColumns || [])],
        activeColumn: state.msa.selectedColumn,
        selection: (state.msa.selectedCells || []).map(cell => ({
          row: cell.row,
          column: cell.column,
          chain: cell.chain || null,
          authSeq: cell.residue?.authSeq ?? null,
          insertion: cell.residue?.insertion || ''
        }))
      } : null,
      current: state.current ? {
        sourceKind: state.current.sourceKind,
        annotationSourceKind: state.current.annotationSourceKind,
        structureFormat: state.current.structureFormat,
        pdbName: state.current.pdbName,
        yamlName: state.current.yamlName,
        hasYaml: state.current.hasYaml,
        title: state.current.annotation.title,
        msaReferences: { ...state.current.annotation.msaReferences },
        regionCount: state.current.annotation.regions.filter(region => region.enabled).length,
        viewer: {
          style: state.current.annotation.viewer.style,
          componentRepresentation: state.current.annotation.viewer.componentRepresentation,
          componentRepresentationParams: state.current.annotation.viewer.componentRepresentationParams,
          componentColor: state.current.annotation.viewer.componentColor,
          componentColorTheme: state.current.annotation.viewer.componentColorTheme,
          componentColorThemeParams: state.current.annotation.viewer.componentColorThemeParams,
          componentOpacity: state.current.annotation.viewer.componentOpacity,
          componentsVisible: state.current.annotation.viewer.componentsVisible,
          postprocessing: state.current.annotation.viewer.postprocessing,
          baseComponentName: state.current.annotation.viewer.baseComponentName,
          baseColor: state.current.annotation.viewer.baseColor,
          baseOpacity: state.current.annotation.viewer.baseOpacity
        },
        regions: state.current.annotation.regions.map(region => ({
          name: region.name,
          selectionType: region.selectionType,
          start: region.start,
          end: region.end,
          positions: [...region.positions],
          color: region.color,
          numbering: region.numbering,
          chains: [...region.chains],
          matchedResidues: region.coverage.matched,
          requestedResidues: region.coverage.requested,
          selectionComplete: region.coverage.complete,
          createComponent: region.createComponent,
          componentName: region.componentName,
          componentRepresentation: region.componentRepresentation,
          componentRepresentationParams: region.componentRepresentationParams,
          componentColorTheme: region.componentColorTheme,
          componentColorThemeParams: region.componentColorThemeParams,
          componentColor: region.componentColor,
          componentOpacity: region.componentOpacity,
          componentVisible: region.componentVisible
        }))
      } : null
    })
  });

  initializeViewer();
})();
