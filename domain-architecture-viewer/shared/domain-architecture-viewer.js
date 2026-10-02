(() => {
  'use strict';

  const VERSION = '1.0.0';
  const REQUIRED_COLUMNS = ['pid', 'domain', 'start', 'end', 'plen'];
  const SPECIAL_FEATURES = Object.freeze({
    TM: { color: '#4b5563', stroke: '#1f2937', shape: 'tm', label: 'TM' },
    SIG: { color: '#f2c94c', stroke: '#a16207', shape: 'signal', label: 'SIG' },
    LIPO: { color: '#d946ef', stroke: '#86198f', shape: 'lipo', label: 'LIPO' }
  });
  const SHAPES = ['rounded', 'rectangle', 'capsule', 'ellipse', 'hexagon', 'chevron', 'arrow', 'diamond'];
  const PALETTE = [
    '#4f8fd9', '#d55d68', '#67a96b', '#b56ac4', '#e09245', '#5aa7a7', '#7c83d4',
    '#9e8f3f', '#d177a8', '#6f9d52', '#5f9cc9', '#b0724a', '#4d9f79', '#9a6d91',
    '#d97825', '#418abf', '#78bc1d', '#d6ce3e', '#af68b8', '#2f8f83'
  ];

  const DEFAULT_SETTINGS = Object.freeze({
    mode: 'true',
    compact_gap_mode: 'cap',
    compact_gap_px: 12,
    show_gap_markers: true,
    show_domain_labels: true,
    show_protein_lengths: true,
    show_ruler: true,
    row_height: 44,
    zoom: 1,
    align: 'n',
    anchor_domain: '',
    anchor_point: 'start',
    sort_primary: 'original',
    sort_primary_direction: 'asc',
    sort_secondary: 'pid',
    sort_secondary_direction: 'asc',
    group_by: '',
    label_template: '{pid}',
    subtitle_template: '',
    protein_hover_fields: ['pid', 'plen', 'domain_count', 'architecture'],
    domain_hover_fields: ['domain', 'start', 'end', 'length'],
    label_width: 270,
    normalized_width: 920,
    pixels_per_aa: 1.65,
    collapse_identical: false
  });

  const state = {
    config: {},
    elements: {},
    headers: [],
    rows: [],
    proteins: [],
    proteinById: new Map(),
    domains: new Map(),
    proteinMetadataColumns: [],
    domainMetadataColumns: [],
    allExtraColumns: [],
    settings: { ...DEFAULT_SETTINGS },
    styles: {},
    originalYaml: null,
    warnings: [],
    errors: [],
    sourceName: '',
    yamlName: '',
    search: '',
    selectedDomain: '',
    displayItems: [],
    itemOffsets: [],
    totalHeight: 0,
    contentWidth: 1000,
    renderFrame: 0,
    resizeObserver: null,
    drag: null,
    initialized: false
  };

  const $ = id => document.getElementById(id);

  function emit(name, detail = {}) {
    document.dispatchEvent(new CustomEvent(`domain-architecture:${name}`, { detail }));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value)));
  }

  function normalizeColor(value, fallback = '#94a3b8') {
    const text = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(text)) return `#${text.slice(1).split('').map(char => char + char).join('')}`.toLowerCase();
    return fallback;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function fileSize(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 ** 2).toFixed(1)} MB`;
  }

  function naturalCompare(a, b) {
    return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
  }

  function splitTsvLine(line) {
    return String(line).split('\t');
  }

  function unique(values) {
    return [...new Set(values)];
  }

  function specialKey(domain) {
    const key = String(domain || '').trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(SPECIAL_FEATURES, key) ? key : '';
  }

  function parseTSV(text, sourceName = 'domain.tsv') {
    const source = String(text || '').replace(/^\uFEFF/, '');
    const lines = source.split(/\r?\n/).filter(line => line.trim() !== '');
    if (!lines.length) throw new Error('The domain table is empty.');
    const headers = splitTsvLine(lines[0]).map(value => value.trim());
    const headerIndex = new Map(headers.map((name, index) => [name, index]));
    const missing = REQUIRED_COLUMNS.filter(name => !headerIndex.has(name));
    if (missing.length) throw new Error(`The domain table is missing required columns: ${missing.join(', ')}.`);
    if (new Set(headers).size !== headers.length) throw new Error('The domain table contains duplicate column names.');

    const warnings = [];
    const rows = [];
    const proteinMap = new Map();
    const domainMap = new Map();
    const extraColumns = headers.filter(name => !REQUIRED_COLUMNS.includes(name));

    for (let lineNumber = 2; lineNumber <= lines.length; lineNumber += 1) {
      const cells = splitTsvLine(lines[lineNumber - 1]);
      while (cells.length < headers.length) cells.push('');
      const raw = {};
      headers.forEach((header, index) => { raw[header] = String(cells[index] ?? '').trim(); });
      const pid = raw.pid;
      const domain = raw.domain;
      const start = Number(raw.start);
      const end = Number(raw.end);
      const plen = Number(raw.plen);
      if (!pid) { warnings.push(`Line ${lineNumber}: empty pid; row skipped.`); continue; }
      if (!domain) { warnings.push(`Line ${lineNumber}: empty domain for ${pid}; row skipped.`); continue; }
      if (![start, end, plen].every(Number.isFinite)) { warnings.push(`Line ${lineNumber}: non-numeric start, end, or plen; row skipped.`); continue; }
      if (start < 1 || end < start || plen < 1 || end > plen) {
        warnings.push(`Line ${lineNumber}: invalid coordinates ${start}-${end} for ${pid} (length ${plen}); row skipped.`);
        continue;
      }
      const row = {
        index: rows.length,
        lineNumber,
        pid,
        domain,
        start,
        end,
        plen,
        length: end - start + 1,
        raw,
        special: specialKey(domain)
      };
      rows.push(row);

      let protein = proteinMap.get(pid);
      if (!protein) {
        protein = {
          id: pid,
          originalIndex: proteinMap.size,
          plen,
          rows: [],
          domains: [],
          metadata: {},
          metadataValues: new Map(),
          architecture: '',
          domainCount: 0,
          featureCount: 0,
          layoutCache: new Map()
        };
        proteinMap.set(pid, protein);
      } else if (protein.plen !== plen) {
        warnings.push(`Protein ${pid} has inconsistent plen values (${protein.plen} and ${plen}); the first value is used.`);
      }
      protein.rows.push(row);
      protein.domains.push(row);
      for (const column of extraColumns) {
        const value = raw[column];
        if (!protein.metadataValues.has(column)) protein.metadataValues.set(column, new Set());
        if (value !== '') protein.metadataValues.get(column).add(value);
      }

      let domainStats = domainMap.get(domain);
      if (!domainStats) {
        domainStats = {
          id: domain,
          special: row.special,
          occurrences: 0,
          proteins: new Set(),
          residues: 0,
          firstIndex: domainMap.size
        };
        domainMap.set(domain, domainStats);
      }
      domainStats.occurrences += 1;
      domainStats.proteins.add(pid);
      domainStats.residues += row.length;
    }

    const proteinMetadataColumns = [];
    const domainMetadataColumns = [];
    for (const column of extraColumns) {
      let proteinSafe = true;
      for (const protein of proteinMap.values()) {
        const count = protein.metadataValues.get(column)?.size || 0;
        if (count > 1) { proteinSafe = false; break; }
      }
      (proteinSafe ? proteinMetadataColumns : domainMetadataColumns).push(column);
    }

    const proteins = [...proteinMap.values()];
    for (const protein of proteins) {
      protein.domains.sort((a, b) => a.start - b.start || a.end - b.end || naturalCompare(a.domain, b.domain));
      protein.domainCount = protein.domains.filter(row => !row.special).length;
      protein.featureCount = protein.domains.length;
      protein.architecture = protein.domains.map(row => row.domain).join(' — ');
      for (const column of extraColumns) {
        const values = [...(protein.metadataValues.get(column) || [])];
        protein.metadata[column] = values.length <= 1 ? (values[0] || '') : values.join(' | ');
        if (values.length > 1) warnings.push(`Protein ${protein.id} has multiple values for ${column}: ${values.join(', ')}.`);
      }
    }

    for (const stats of domainMap.values()) stats.proteinCount = stats.proteins.size;

    return {
      sourceName,
      headers,
      rows,
      proteins,
      proteinMap,
      domainMap,
      extraColumns,
      proteinMetadataColumns,
      domainMetadataColumns,
      warnings
    };
  }

  function stripYamlComment(line) {
    let quoted = '';
    for (let i = 0; i < line.length; i += 1) {
      const character = line[i];
      if ((character === '"' || character === "'") && line[i - 1] !== '\\') quoted = quoted === character ? '' : (quoted || character);
      if (character === '#' && !quoted && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
    }
    return line;
  }

  function yamlKeyValue(content) {
    let quoted = '';
    let depth = 0;
    for (let i = 0; i < content.length; i += 1) {
      const character = content[i];
      if ((character === '"' || character === "'") && content[i - 1] !== '\\') quoted = quoted === character ? '' : (quoted || character);
      if (!quoted) {
        if (character === '[' || character === '{') depth += 1;
        if (character === ']' || character === '}') depth -= 1;
        if (character === ':' && depth === 0) return [content.slice(0, i).trim(), content.slice(i + 1).trim()];
      }
    }
    return [content.trim(), ''];
  }

  function parseYamlScalar(raw) {
    const text = String(raw ?? '').trim();
    if (!text) return '';
    if (text === 'null' || text === '~') return null;
    if (/^(true|false)$/i.test(text)) return /^true$/i.test(text);
    if (/^[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?$/i.test(text)) return Number(text);
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      if (text.startsWith('"')) {
        try { return JSON.parse(text); } catch { return text.slice(1, -1); }
      }
      return text.slice(1, -1).replace(/''/g, "'");
    }
    if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) {
      try { return JSON.parse(text); } catch { return text; }
    }
    return text;
  }

  function parseSimpleYaml(text) {
    const source = String(text || '').trim();
    if (!source) return {};
    if (source.startsWith('{')) {
      try { return JSON.parse(source); } catch { /* continue */ }
    }
    const root = {};
    const stack = [{ indent: -1, value: root }];
    for (const original of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const line = stripYamlComment(original).replace(/\s+$/, '');
      if (!line.trim()) continue;
      const indent = line.match(/^\s*/)[0].replace(/\t/g, '  ').length;
      const content = line.trim();
      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
      const parent = stack[stack.length - 1].value;
      if (content.startsWith('- ')) {
        if (Array.isArray(parent)) parent.push(parseYamlScalar(content.slice(2)));
        continue;
      }
      const [rawKey, rawValue] = yamlKeyValue(content);
      const key = String(parseYamlScalar(rawKey));
      if (!rawValue) {
        const next = {};
        parent[key] = next;
        stack.push({ indent, value: next });
      } else parent[key] = parseYamlScalar(rawValue);
    }
    return root;
  }

  function normalizeSettings(input = {}) {
    const output = { ...DEFAULT_SETTINGS, ...(input || {}) };
    if (!['true', 'normalized', 'compact'].includes(output.mode)) output.mode = 'true';
    if (!['cap', 'remove'].includes(output.compact_gap_mode)) output.compact_gap_mode = 'cap';
    output.compact_gap_px = clamp(output.compact_gap_px, 0, 100);
    output.row_height = clamp(output.row_height, 28, 100);
    output.zoom = clamp(output.zoom, 0.15, 12);
    output.label_width = clamp(output.label_width, 150, 640);
    output.normalized_width = clamp(output.normalized_width, 300, 5000);
    output.pixels_per_aa = clamp(output.pixels_per_aa, 0.1, 20);
    output.show_gap_markers = output.show_gap_markers !== false;
    output.show_domain_labels = output.show_domain_labels !== false;
    output.show_protein_lengths = output.show_protein_lengths !== false;
    output.show_ruler = output.show_ruler !== false;
    output.collapse_identical = Boolean(output.collapse_identical);
    output.protein_hover_fields = Array.isArray(output.protein_hover_fields) ? output.protein_hover_fields.map(String) : [...DEFAULT_SETTINGS.protein_hover_fields];
    output.domain_hover_fields = Array.isArray(output.domain_hover_fields) ? output.domain_hover_fields.map(String) : [...DEFAULT_SETTINGS.domain_hover_fields];
    return output;
  }

  function normalizeStyle(domain, input = {}) {
    const special = specialKey(domain);
    if (special) return { ...SPECIAL_FEATURES[special], display_name: SPECIAL_FEATURES[special].label, visible: true, explicit: false, special };
    return {
      display_name: String(input.display_name ?? input.label ?? domain),
      color: normalizeColor(input.color, '#cbd5e1'),
      shape: SHAPES.includes(String(input.shape)) ? String(input.shape) : 'rounded',
      visible: input.visible !== false,
      explicit: input.explicit !== false
    };
  }

  function applyYaml(text, yamlName = '') {
    const parsed = parseSimpleYaml(text);
    const layout = parsed.layout && typeof parsed.layout === 'object' ? parsed.layout : {};
    const metadata = parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : {};
    const sort = layout.sort && typeof layout.sort === 'object' ? layout.sort : {};
    state.settings = normalizeSettings({
      ...state.settings,
      ...layout,
      ...metadata,
      sort_primary: sort.primary ?? layout.sort_primary ?? state.settings.sort_primary,
      sort_primary_direction: sort.primary_direction ?? layout.sort_primary_direction ?? state.settings.sort_primary_direction,
      sort_secondary: sort.secondary ?? layout.sort_secondary ?? state.settings.sort_secondary,
      sort_secondary_direction: sort.secondary_direction ?? layout.sort_secondary_direction ?? state.settings.sort_secondary_direction
    });
    state.styles = {};
    const styles = parsed.styles && typeof parsed.styles === 'object' ? parsed.styles : {};
    for (const [domain, style] of Object.entries(styles)) state.styles[domain] = normalizeStyle(domain, style && typeof style === 'object' ? style : {});
    state.originalYaml = parsed;
    state.yamlName = yamlName;
    return parsed;
  }

  function quoteYaml(value) {
    return JSON.stringify(String(value ?? ''));
  }

  function serializeYaml() {
    const settings = state.settings;
    const lines = [
      'version: 1',
      `title: ${quoteYaml(state.config.figureTitle || state.config.title || 'Protein domain architectures')}`,
      'layout:',
      `  mode: ${quoteYaml(settings.mode)}`,
      `  compact_gap_mode: ${quoteYaml(settings.compact_gap_mode)}`,
      `  compact_gap_px: ${Number(settings.compact_gap_px)}`,
      `  show_gap_markers: ${Boolean(settings.show_gap_markers)}`,
      `  show_domain_labels: ${Boolean(settings.show_domain_labels)}`,
      `  show_protein_lengths: ${Boolean(settings.show_protein_lengths)}`,
      `  show_ruler: ${Boolean(settings.show_ruler)}`,
      `  row_height: ${Number(settings.row_height)}`,
      `  align: ${quoteYaml(settings.align)}`,
      `  anchor_domain: ${quoteYaml(settings.anchor_domain || '')}`,
      `  anchor_point: ${quoteYaml(settings.anchor_point || 'start')}`,
      `  group_by: ${quoteYaml(settings.group_by || '')}`,
      `  collapse_identical: ${Boolean(settings.collapse_identical)}`,
      '  sort:',
      `    primary: ${quoteYaml(settings.sort_primary || 'original')}`,
      `    primary_direction: ${quoteYaml(settings.sort_primary_direction || 'asc')}`,
      `    secondary: ${quoteYaml(settings.sort_secondary || 'pid')}`,
      `    secondary_direction: ${quoteYaml(settings.sort_secondary_direction || 'asc')}`,
      'metadata:',
      `  label_template: ${quoteYaml(settings.label_template || '{pid}')}`,
      `  subtitle_template: ${quoteYaml(settings.subtitle_template || '')}`,
      `  protein_hover_fields: ${JSON.stringify(settings.protein_hover_fields || [])}`,
      `  domain_hover_fields: ${JSON.stringify(settings.domain_hover_fields || [])}`,
      `  label_width: ${Number(settings.label_width)}`,
      'special_features:',
      ...Object.entries(SPECIAL_FEATURES).map(([key, value]) => `  ${quoteYaml(key)}: {"color":${quoteYaml(value.color)},"shape":${quoteYaml(value.shape)}}`),
      'styles:'
    ];
    const entries = Object.entries(state.styles).filter(([domain, style]) => !specialKey(domain) && style && style.explicit !== false);
    if (!entries.length) lines[lines.length - 1] = 'styles: {}';
    else {
      entries.sort(([a], [b]) => naturalCompare(a, b));
      for (const [domain, style] of entries) {
        lines.push(`  ${quoteYaml(domain)}:`);
        lines.push(`    display_name: ${quoteYaml(style.display_name || domain)}`);
        lines.push(`    color: ${quoteYaml(normalizeColor(style.color))}`);
        lines.push(`    shape: ${quoteYaml(SHAPES.includes(style.shape) ? style.shape : 'rounded')}`);
        lines.push(`    visible: ${style.visible !== false}`);
      }
    }
    return `${lines.join('\n')}\n`;
  }

  function templateValue(template, protein) {
    const text = String(template || '');
    return text.replace(/\{([^{}]+)\}/g, (_match, rawField) => {
      const field = String(rawField).trim();
      if (field === 'pid') return protein.id;
      if (field === 'plen') return String(protein.plen);
      if (field === 'domain_count') return String(protein.domainCount);
      if (field === 'feature_count') return String(protein.featureCount);
      if (field === 'architecture') return protein.architecture;
      return protein.metadata[field] || '';
    }).replace(/\s+([|,;:\-–—])\s*(?=$|[|,;:\-–—])/g, '').replace(/^[\s|,;:\-–—]+|[\s|,;:\-–—]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  }

  function getStyle(domain) {
    const special = specialKey(domain);
    if (special) return normalizeStyle(domain, SPECIAL_FEATURES[special]);
    if (state.styles[domain]) return normalizeStyle(domain, state.styles[domain]);
    return { display_name: domain, color: '#cbd5e1', shape: 'rounded', visible: true, explicit: false };
  }

  function availableProteinFields() {
    return ['pid', 'plen', 'domain_count', 'feature_count', 'architecture', ...state.proteinMetadataColumns];
  }

  function availableDomainFields() {
    return ['domain', 'start', 'end', 'length', 'pid', 'plen', ...state.allExtraColumns];
  }

  function getProteinField(protein, field) {
    switch (field) {
      case 'original': return protein.originalIndex;
      case 'pid': return protein.id;
      case 'plen': return protein.plen;
      case 'domain_count': return protein.domainCount;
      case 'feature_count': return protein.featureCount;
      case 'architecture': return protein.architecture;
      default: return protein.metadata[field] ?? '';
    }
  }

  function compareField(a, b, field, direction = 'asc') {
    const av = getProteinField(a, field);
    const bv = getProteinField(b, field);
    let result;
    const an = Number(av);
    const bn = Number(bv);
    if (av !== '' && bv !== '' && Number.isFinite(an) && Number.isFinite(bn)) result = an - bn;
    else result = naturalCompare(av, bv);
    return direction === 'desc' ? -result : result;
  }

  function filteredAndSortedProteins() {
    const query = state.search.trim().toLowerCase();
    let proteins = state.proteins.filter(protein => {
      if (!query) return true;
      const haystack = [protein.id, protein.architecture, ...Object.values(protein.metadata), ...protein.domains.map(row => row.domain)].join('\n').toLowerCase();
      return haystack.includes(query);
    });
    const settings = state.settings;
    proteins.sort((a, b) => compareField(a, b, settings.sort_primary, settings.sort_primary_direction)
      || compareField(a, b, settings.sort_secondary, settings.sort_secondary_direction)
      || a.originalIndex - b.originalIndex);
    if (settings.collapse_identical) {
      const grouped = new Map();
      for (const protein of proteins) {
        const key = protein.architecture;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(protein);
      }
      proteins = [...grouped.values()].map(group => {
        const representative = group[0];
        return { ...representative, collapsedMembers: group, collapsedCount: group.length };
      });
    }
    return proteins;
  }

  function rebuildDisplayItems() {
    const proteins = filteredAndSortedProteins();
    const groupBy = state.settings.group_by;
    const items = [];
    let lastGroup = Symbol('initial');
    for (const protein of proteins) {
      if (groupBy) {
        const group = String(getProteinField(protein, groupBy) || 'Unassigned');
        if (group !== lastGroup) {
          items.push({ type: 'group', key: group, label: group });
          lastGroup = group;
        }
      }
      items.push({ type: 'protein', key: protein.id, protein });
    }
    state.displayItems = items;
    const offsets = [];
    let y = 0;
    for (const item of items) {
      offsets.push(y);
      y += item.type === 'group' ? 34 : state.settings.row_height;
    }
    state.itemOffsets = offsets;
    state.totalHeight = y;
    updateStatus(proteins.length);
  }

  function updateStatus(visibleProteinCount = state.proteins.length) {
    const element = state.elements.status;
    if (!element) return;
    const visibleDomains = state.proteins.reduce((sum, protein) => sum + protein.domains.length, 0);
    element.textContent = `${visibleProteinCount.toLocaleString()} of ${state.proteins.length.toLocaleString()} proteins · ${visibleDomains.toLocaleString()} annotations · ${state.domains.size.toLocaleString()} feature types`;
  }

  function mergedIntervals(protein) {
    const intervals = protein.domains.filter(row => getStyle(row.domain).visible !== false).map(row => [row.start, row.end]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged = [];
    for (const interval of intervals) {
      const last = merged[merged.length - 1];
      if (!last || interval[0] > last[1] + 1) merged.push([...interval]);
      else last[1] = Math.max(last[1], interval[1]);
    }
    return merged;
  }

  function compactMapper(protein, scale) {
    const intervals = mergedIntervals(protein);
    if (!intervals.length) return { map: position => (position - 1) * scale, width: protein.plen * scale, gaps: [] };
    const segments = [];
    const gaps = [];
    let sourceCursor = 1;
    let targetCursor = 0;
    const gapWidth = gapLength => state.settings.compact_gap_mode === 'remove'
      ? (state.settings.show_gap_markers ? 8 : 3)
      : Math.min(gapLength * scale, state.settings.compact_gap_px);
    for (const [start, end] of intervals) {
      if (start > sourceCursor) {
        const length = start - sourceCursor;
        const width = gapWidth(length);
        gaps.push({ start: sourceCursor, end: start - 1, length, x: targetCursor, width });
        segments.push({ sourceStart: sourceCursor, sourceEnd: start - 1, targetStart: targetCursor, targetEnd: targetCursor + width, gap: true });
        targetCursor += width;
      }
      const width = (end - start + 1) * scale;
      segments.push({ sourceStart: start, sourceEnd: end, targetStart: targetCursor, targetEnd: targetCursor + width, gap: false });
      targetCursor += width;
      sourceCursor = end + 1;
    }
    if (sourceCursor <= protein.plen) {
      const length = protein.plen - sourceCursor + 1;
      const width = gapWidth(length);
      gaps.push({ start: sourceCursor, end: protein.plen, length, x: targetCursor, width });
      segments.push({ sourceStart: sourceCursor, sourceEnd: protein.plen, targetStart: targetCursor, targetEnd: targetCursor + width, gap: true });
      targetCursor += width;
    }
    const map = position => {
      const value = clamp(position, 1, protein.plen + 1);
      for (const segment of segments) {
        if (value >= segment.sourceStart && value <= segment.sourceEnd + 1) {
          const sourceLength = segment.sourceEnd - segment.sourceStart + 1;
          const fraction = sourceLength > 0 ? (value - segment.sourceStart) / sourceLength : 0;
          return segment.targetStart + fraction * (segment.targetEnd - segment.targetStart);
        }
      }
      return targetCursor;
    };
    return { map, width: targetCursor, gaps };
  }

  function proteinLayout(protein) {
    const settings = state.settings;
    const key = [settings.mode, settings.zoom, settings.compact_gap_mode, settings.compact_gap_px, settings.show_gap_markers].join('|');
    if (protein.layoutCache.has(key)) return protein.layoutCache.get(key);
    const scale = settings.pixels_per_aa * settings.zoom;
    let result;
    if (settings.mode === 'normalized') {
      const width = settings.normalized_width * settings.zoom;
      result = { width, map: position => ((position - 1) / protein.plen) * width, gaps: [] };
    } else if (settings.mode === 'compact') result = compactMapper(protein, scale);
    else result = { width: protein.plen * scale, map: position => (position - 1) * scale, gaps: [] };
    protein.layoutCache.set(key, result);
    return result;
  }

  function anchorPosition(protein, layout) {
    const domain = state.settings.anchor_domain;
    if (!domain) return null;
    const row = protein.domains.find(entry => entry.domain === domain);
    if (!row) return null;
    if (state.settings.anchor_point === 'center') return (layout.map(row.start) + layout.map(row.end + 1)) / 2;
    if (state.settings.anchor_point === 'end') return layout.map(row.end + 1);
    return layout.map(row.start);
  }

  function calculateContentGeometry() {
    let maxWidth = 100;
    const layouts = new Map();
    for (const protein of state.proteins) {
      const layout = proteinLayout(protein);
      layouts.set(protein.id, layout);
      maxWidth = Math.max(maxWidth, layout.width);
    }
    let origin = 0;
    if (state.settings.align.startsWith('anchor') && state.settings.anchor_domain) {
      let left = 0;
      let right = 0;
      for (const protein of state.proteins) {
        const layout = layouts.get(protein.id);
        const anchor = anchorPosition(protein, layout);
        if (anchor == null) continue;
        left = Math.max(left, anchor);
        right = Math.max(right, layout.width - anchor);
      }
      origin = left;
      maxWidth = left + right;
    }
    state.contentWidth = state.settings.label_width + maxWidth + 140;
    return { maxWidth, origin, layouts };
  }

  function rowOffset(protein, layout, geometry) {
    if (state.settings.align === 'c') return geometry.maxWidth - layout.width;
    if (state.settings.align.startsWith('anchor') && state.settings.anchor_domain) {
      const anchor = anchorPosition(protein, layout);
      return anchor == null ? 0 : geometry.origin - anchor;
    }
    return 0;
  }

  function assignLanes(rows) {
    const lanes = [];
    const assignments = new Map();
    for (const row of rows.filter(entry => !entry.special).sort((a, b) => a.start - b.start || a.end - b.end)) {
      let lane = 0;
      while (lane < lanes.length && row.start <= lanes[lane]) lane += 1;
      if (lane === lanes.length) lanes.push(row.end);
      else lanes[lane] = row.end;
      assignments.set(row, lane);
    }
    return { assignments, count: Math.max(1, lanes.length) };
  }

  function shapeMarkup(shape, x, y, width, height, fill, stroke, extra = '') {
    const w = Math.max(2, width);
    const h = Math.max(4, height);
    const rx = Math.min(h / 2, 7);
    const attributes = `fill="${fill}" stroke="${stroke}" stroke-width="1" ${extra}`;
    if (shape === 'rectangle') return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${attributes}/>`;
    if (shape === 'capsule' || shape === 'tm') return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" ry="${h / 2}" ${attributes}/>`;
    if (shape === 'ellipse') return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${attributes}/>`;
    if (shape === 'diamond' || shape === 'lipo') return `<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}" ${attributes}/>`;
    if (shape === 'hexagon') {
      const cut = Math.min(w * 0.22, h * 0.65);
      return `<polygon points="${x + cut},${y} ${x + w - cut},${y} ${x + w},${y + h / 2} ${x + w - cut},${y + h} ${x + cut},${y + h} ${x},${y + h / 2}" ${attributes}/>`;
    }
    if (shape === 'chevron') {
      const cut = Math.min(w * 0.28, h * 0.8);
      return `<polygon points="${x},${y} ${x + w - cut},${y} ${x + w},${y + h / 2} ${x + w - cut},${y + h} ${x},${y + h} ${x + cut},${y + h / 2}" ${attributes}/>`;
    }
    if (shape === 'arrow' || shape === 'signal') {
      const head = Math.min(w * 0.38, h * 1.1);
      return `<polygon points="${x},${y} ${x + w - head},${y} ${x + w},${y + h / 2} ${x + w - head},${y + h} ${x},${y + h}" ${attributes}/>`;
    }
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${rx}" ${attributes}/>`;
  }

  function domainTooltip(row, protein) {
    const fields = state.settings.domain_hover_fields.length ? state.settings.domain_hover_fields : DEFAULT_SETTINGS.domain_hover_fields;
    const values = [];
    for (const field of fields) {
      let value = '';
      if (field === 'domain') value = row.domain;
      else if (field === 'start') value = row.start;
      else if (field === 'end') value = row.end;
      else if (field === 'length') value = row.length;
      else if (field === 'pid') value = row.pid;
      else if (field === 'plen') value = row.plen;
      else value = row.raw[field] ?? '';
      if (value !== '') values.push(`<div><span>${escapeHtml(field)}</span><strong>${escapeHtml(value)}</strong></div>`);
    }
    const style = getStyle(row.domain);
    return `<header><strong>${escapeHtml(style.display_name || row.domain)}</strong><small>${escapeHtml(row.domain)}</small></header><div class="tooltip-grid">${values.join('')}</div>`;
  }

  function proteinTooltip(protein) {
    const fields = state.settings.protein_hover_fields.length ? state.settings.protein_hover_fields : DEFAULT_SETTINGS.protein_hover_fields;
    const values = [];
    for (const field of fields) {
      const value = getProteinField(protein, field);
      if (value !== '') values.push(`<div><span>${escapeHtml(field)}</span><strong>${escapeHtml(value)}</strong></div>`);
    }
    return `<header><strong>${escapeHtml(protein.id)}</strong></header><div class="tooltip-grid">${values.join('')}</div>`;
  }

  function renderProteinRow(item, top, geometry) {
    const protein = item.protein;
    const layout = geometry.layouts.get(protein.id) || proteinLayout(protein);
    const offset = rowOffset(protein, layout, geometry);
    const rowHeight = state.settings.row_height;
    const label = templateValue(state.settings.label_template, protein) || protein.id;
    const subtitle = templateValue(state.settings.subtitle_template, protein);
    const lanes = assignLanes(protein.domains);
    const normalHeight = Math.max(6, Math.min(24, (rowHeight - 12) / Math.max(1, lanes.count)));
    const normalTop = Math.max(13, (rowHeight - normalHeight * lanes.count) / 2 + 4);
    const specialHeight = 9;
    const baselineY = Math.min(rowHeight - 8, normalTop + normalHeight * Math.max(1, lanes.count) / 2);
    const innerWidth = geometry.maxWidth + 110;
    const svgParts = [
      `<line class="protein-backbone" x1="${offset}" y1="${baselineY}" x2="${offset + layout.width}" y2="${baselineY}"/>`
    ];

    if (state.settings.mode === 'compact' && state.settings.show_gap_markers) {
      for (const gap of layout.gaps) {
        if (gap.length < 2) continue;
        const gx = offset + gap.x + gap.width / 2;
        svgParts.push(`<g class="gap-marker" data-gap="${gap.length}"><path d="M ${gx - 4} ${baselineY - 5} l 4 10 M ${gx + 1} ${baselineY - 5} l 4 10"/><title>${gap.length} unannotated residues compressed</title></g>`);
      }
    }

    for (const row of protein.domains) {
      const style = getStyle(row.domain);
      if (style.visible === false) continue;
      const startX = offset + layout.map(row.start);
      const endX = offset + layout.map(row.end + 1);
      const width = Math.max(3, endX - startX);
      let y = normalTop;
      let height = normalHeight - 2;
      let shape = style.shape;
      if (row.special) {
        y = 2;
        height = specialHeight;
        shape = SPECIAL_FEATURES[row.special].shape;
      } else y += (lanes.assignments.get(row) || 0) * normalHeight;
      if (row.special === 'LIPO') {
        const size = Math.max(8, Math.min(14, width));
        svgParts.push(`<g class="domain-feature domain-special" data-domain="${escapeAttribute(row.domain)}" data-row-index="${row.index}" tabindex="0">${shapeMarkup(shape, endX - size / 2, y, size, size, style.color, style.stroke || '#86198f')}<title>${escapeHtml(row.domain)} ${row.start}-${row.end}</title></g>`);
      } else {
        const selectedClass = state.selectedDomain === row.domain ? ' domain-selected' : '';
        svgParts.push(`<g class="domain-feature${row.special ? ' domain-special' : ''}${selectedClass}" data-domain="${escapeAttribute(row.domain)}" data-row-index="${row.index}" tabindex="0">${shapeMarkup(shape, startX, y, width, height, style.color, style.stroke || '#475569')}<title>${escapeHtml(row.domain)} ${row.start}-${row.end}</title>`);
        if (state.settings.show_domain_labels && width >= 44 && height >= 12) {
          const display = style.display_name || row.domain;
          svgParts.push(`<text class="domain-label" x="${startX + width / 2}" y="${y + height / 2 + 3.5}" text-anchor="middle">${escapeHtml(display)}</text>`);
        }
        svgParts.push('</g>');
      }
    }

    if (state.settings.show_protein_lengths) svgParts.push(`<text class="protein-length" x="${offset + layout.width + 10}" y="${baselineY + 4}">${protein.plen.toLocaleString()} aa</text>`);

    const countBadge = protein.collapsedCount > 1 ? `<span class="architecture-count">${protein.collapsedCount.toLocaleString()} proteins</span>` : '';
    return `<div class="architecture-row" data-pid="${escapeAttribute(protein.id)}" style="top:${top}px;height:${rowHeight}px;width:${state.contentWidth}px">
      <div class="protein-label-cell" style="width:${state.settings.label_width}px" data-protein-id="${escapeAttribute(protein.id)}" tabindex="0">
        <span class="protein-label-main" title="${escapeAttribute(label)}">${escapeHtml(label)}</span>
        ${subtitle ? `<span class="protein-label-sub" title="${escapeAttribute(subtitle)}">${escapeHtml(subtitle)}</span>` : ''}
        ${countBadge}
      </div>
      <svg class="architecture-row-svg" style="left:${state.settings.label_width}px" width="${innerWidth}" height="${rowHeight}" viewBox="0 0 ${innerWidth} ${rowHeight}" aria-label="${escapeAttribute(protein.id)} domain architecture">${svgParts.join('')}</svg>
    </div>`;
  }

  function renderGroupRow(item, top) {
    return `<div class="architecture-group-row" style="top:${top}px;height:34px;width:${state.contentWidth}px"><span>${escapeHtml(item.label)}</span></div>`;
  }

  function binarySearchOffset(value) {
    const offsets = state.itemOffsets;
    let low = 0;
    let high = offsets.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (offsets[middle] <= value) low = middle + 1;
      else high = middle - 1;
    }
    return Math.max(0, high);
  }

  function renderVisibleRows() {
    const viewport = state.elements.viewport;
    const layer = state.elements.rowLayer;
    const spacer = state.elements.spacer;
    if (!viewport || !layer || !spacer || !state.proteins.length) return;
    const geometry = calculateContentGeometry();
    spacer.style.width = `${state.contentWidth}px`;
    spacer.style.height = `${Math.max(state.totalHeight, viewport.clientHeight)}px`;
    const start = Math.max(0, binarySearchOffset(viewport.scrollTop) - 5);
    const endY = viewport.scrollTop + viewport.clientHeight;
    let end = start;
    while (end < state.displayItems.length && state.itemOffsets[end] < endY + state.settings.row_height * 6) end += 1;
    const html = [];
    for (let index = start; index < end; index += 1) {
      const item = state.displayItems[index];
      const top = state.itemOffsets[index];
      html.push(item.type === 'group' ? renderGroupRow(item, top) : renderProteinRow(item, top, geometry));
    }
    layer.innerHTML = html.join('');
    renderRuler(geometry);
  }

  function renderRuler(geometry) {
    const ruler = state.elements.ruler;
    if (!ruler) return;
    if (!state.settings.show_ruler || state.settings.mode === 'compact' || (state.settings.mode === 'true' && state.settings.align !== 'n')) { ruler.hidden = true; return; }
    ruler.hidden = false;
    ruler.style.paddingLeft = `${state.settings.label_width}px`;
    const width = geometry.maxWidth;
    const ticks = [];
    if (state.settings.mode === 'normalized') {
      for (const percent of [0, 25, 50, 75, 100]) {
        const x = (percent / 100) * width;
        ticks.push(`<span class="ruler-tick" style="left:${x}px"><i></i><b>${percent}%</b></span>`);
      }
    } else {
      const maxLength = Math.max(1, ...state.proteins.map(protein => protein.plen));
      const desiredTicks = Math.max(2, Math.floor(width / 110));
      const roughStep = maxLength / desiredTicks;
      const power = 10 ** Math.floor(Math.log10(Math.max(1, roughStep)));
      const step = [1, 2, 5, 10].map(value => value * power).find(value => value >= roughStep) || 10 * power;
      for (let value = 0; value <= maxLength; value += step) {
        const x = value * state.settings.pixels_per_aa * state.settings.zoom;
        if (x > width + 1) break;
        ticks.push(`<span class="ruler-tick" style="left:${x}px"><i></i><b>${value.toLocaleString()}</b></span>`);
      }
    }
    ruler.innerHTML = `<div class="ruler-track" style="width:${width}px">${ticks.join('')}</div>`;
    syncRulerScroll();
  }

  function syncRulerScroll() {
    const track = state.elements.ruler?.querySelector('.ruler-track');
    if (track && state.elements.viewport) track.style.transform = `translateX(${-state.elements.viewport.scrollLeft}px)`;
  }

  function scheduleRender(full = false) {
    cancelAnimationFrame(state.renderFrame);
    state.renderFrame = requestAnimationFrame(() => {
      if (full) rebuildDisplayItems();
      renderVisibleRows();
      syncControls();
    });
  }

  function showTooltip(html, event) {
    const tooltip = state.elements.tooltip;
    if (!tooltip) return;
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    const padding = 14;
    const rect = tooltip.getBoundingClientRect();
    let left = event.clientX + 14;
    let top = event.clientY + 14;
    if (left + rect.width > innerWidth - padding) left = event.clientX - rect.width - 14;
    if (top + rect.height > innerHeight - padding) top = event.clientY - rect.height - 14;
    tooltip.style.left = `${Math.max(padding, left)}px`;
    tooltip.style.top = `${Math.max(padding, top)}px`;
  }

  function hideTooltip() {
    if (state.elements.tooltip) state.elements.tooltip.hidden = true;
  }

  function bindViewportEvents() {
    const viewport = state.elements.viewport;
    const layer = state.elements.rowLayer;
    if (!viewport || !layer) return;
    viewport.addEventListener('scroll', () => { syncRulerScroll(); scheduleRender(false); }, { passive: true });
    viewport.addEventListener('wheel', event => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const oldZoom = state.settings.zoom;
        const factor = event.deltaY < 0 ? 1.14 : 1 / 1.14;
        const newZoom = clamp(oldZoom * factor, 0.15, 12);
        const rect = viewport.getBoundingClientRect();
        const pointerX = event.clientX - rect.left + viewport.scrollLeft;
        const ratio = newZoom / oldZoom;
        state.settings.zoom = newZoom;
        for (const protein of state.proteins) protein.layoutCache.clear();
        scheduleRender(false);
        requestAnimationFrame(() => { viewport.scrollLeft = Math.max(0, pointerX * ratio - (event.clientX - rect.left)); });
        emit('settings-changed', { settings: getSettings() });
      } else if (event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        event.preventDefault();
        viewport.scrollLeft += event.deltaY;
      }
    }, { passive: false });

    viewport.addEventListener('pointerdown', event => {
      if (event.button !== 1 && event.button !== 0) return;
      if (event.target.closest('.domain-feature, .protein-label-cell, button, input, select, a')) return;
      state.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('is-panning');
    });
    viewport.addEventListener('pointermove', event => {
      if (!state.drag || state.drag.id !== event.pointerId) return;
      viewport.scrollLeft = state.drag.left - (event.clientX - state.drag.x);
      viewport.scrollTop = state.drag.top - (event.clientY - state.drag.y);
    });
    const endDrag = event => {
      if (!state.drag || (event && state.drag.id !== event.pointerId)) return;
      state.drag = null;
      viewport.classList.remove('is-panning');
    };
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);

    layer.addEventListener('pointerover', event => {
      const feature = event.target.closest('.domain-feature');
      const label = event.target.closest('.protein-label-cell');
      if (feature) {
        const row = state.rows[Number(feature.dataset.rowIndex)];
        const protein = row ? state.proteinById.get(row.pid) : null;
        if (row && protein) showTooltip(domainTooltip(row, protein), event);
      } else if (label) {
        const protein = state.proteinById.get(label.dataset.proteinId);
        if (protein) showTooltip(proteinTooltip(protein), event);
      }
    });
    layer.addEventListener('pointermove', event => {
      if (state.elements.tooltip && !state.elements.tooltip.hidden) showTooltip(state.elements.tooltip.innerHTML, event);
    });
    layer.addEventListener('pointerout', event => {
      if (!event.relatedTarget || !event.relatedTarget.closest?.('.domain-feature, .protein-label-cell')) hideTooltip();
    });
    layer.addEventListener('click', event => {
      const feature = event.target.closest('.domain-feature');
      if (!feature) return;
      const domain = feature.dataset.domain;
      state.selectedDomain = domain;
      scheduleRender(false);
      emit('domain-selected', { domain, stats: domainStats(domain), style: getStyle(domain) });
    });
  }

  function fitWidth() {
    const viewport = state.elements.viewport;
    if (!viewport || !state.proteins.length) return;
    const available = Math.max(200, viewport.clientWidth - state.settings.label_width - 120);
    if (state.settings.mode === 'normalized') state.settings.zoom = clamp(available / state.settings.normalized_width, 0.15, 12);
    else {
      const currentGeometry = calculateContentGeometry();
      const currentScaleWidth = currentGeometry.maxWidth / state.settings.zoom;
      state.settings.zoom = clamp(available / Math.max(1, currentScaleWidth), 0.15, 12);
    }
    for (const protein of state.proteins) protein.layoutCache.clear();
    scheduleRender(false);
    emit('settings-changed', { settings: getSettings() });
  }

  function populateSelect(select, options, selected, includeBlank = false, blankLabel = 'None') {
    if (!select) return;
    const values = [];
    if (includeBlank) values.push(['', blankLabel]);
    values.push(...options);
    select.innerHTML = values.map(([value, label]) => `<option value="${escapeAttribute(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
  }

  function syncDynamicControls() {
    const sortOptions = [
      ['original', 'Input order'], ['pid', 'Protein ID'], ['plen', 'Protein length'], ['domain_count', 'Domain count'], ['feature_count', 'All feature count'], ['architecture', 'Architecture'],
      ...state.proteinMetadataColumns.map(column => [column, column])
    ];
    populateSelect(state.elements.sortPrimary, sortOptions, state.settings.sort_primary);
    populateSelect(state.elements.sortSecondary, sortOptions, state.settings.sort_secondary);
    populateSelect(state.elements.groupBy, state.proteinMetadataColumns.map(column => [column, column]), state.settings.group_by, true, 'No grouping');
    populateSelect(state.elements.anchorDomain, [...state.domains.values()].filter(stats => !stats.special).sort((a, b) => b.proteinCount - a.proteinCount || naturalCompare(a.id, b.id)).map(stats => [stats.id, stats.id]), state.settings.anchor_domain, true, 'Choose domain');
    renderHoverFieldControls();
  }

  function renderHoverFieldControls() {
    const proteinHost = state.elements.proteinHoverFields;
    const domainHost = state.elements.domainHoverFields;
    if (proteinHost) proteinHost.innerHTML = availableProteinFields().map(field => `<label><input type="checkbox" value="${escapeAttribute(field)}" ${state.settings.protein_hover_fields.includes(field) ? 'checked' : ''}> <span>${escapeHtml(field)}</span></label>`).join('');
    if (domainHost) domainHost.innerHTML = availableDomainFields().map(field => `<label><input type="checkbox" value="${escapeAttribute(field)}" ${state.settings.domain_hover_fields.includes(field) ? 'checked' : ''}> <span>${escapeHtml(field)}</span></label>`).join('');
  }

  function syncControls() {
    const settings = state.settings;
    const setValue = (element, value) => { if (element && document.activeElement !== element) element.value = value; };
    const setChecked = (element, value) => { if (element) element.checked = Boolean(value); };
    setValue(state.elements.mode, settings.mode);
    setValue(state.elements.align, settings.align);
    setValue(state.elements.anchorDomain, settings.anchor_domain);
    setValue(state.elements.anchorPoint, settings.anchor_point);
    setValue(state.elements.sortPrimary, settings.sort_primary);
    setValue(state.elements.sortPrimaryDirection, settings.sort_primary_direction);
    setValue(state.elements.sortSecondary, settings.sort_secondary);
    setValue(state.elements.sortSecondaryDirection, settings.sort_secondary_direction);
    setValue(state.elements.groupBy, settings.group_by);
    setValue(state.elements.rowHeight, settings.row_height);
    setValue(state.elements.zoom, settings.zoom);
    setValue(state.elements.compactGap, settings.compact_gap_px);
    setValue(state.elements.compactGapMode, settings.compact_gap_mode);
    setValue(state.elements.labelTemplate, settings.label_template);
    setValue(state.elements.subtitleTemplate, settings.subtitle_template);
    setChecked(state.elements.showGapMarkers, settings.show_gap_markers);
    setChecked(state.elements.showDomainLabels, settings.show_domain_labels);
    setChecked(state.elements.showProteinLengths, settings.show_protein_lengths);
    setChecked(state.elements.showRuler, settings.show_ruler);
    setChecked(state.elements.collapseIdentical, settings.collapse_identical);
    if (state.elements.zoomValue) state.elements.zoomValue.textContent = `${Math.round(settings.zoom * 100)}%`;
    if (state.elements.rowHeightValue) state.elements.rowHeightValue.textContent = `${Math.round(settings.row_height)} px`;
    if (state.elements.compactControls) state.elements.compactControls.hidden = settings.mode !== 'compact';
    if (state.elements.anchorControls) state.elements.anchorControls.hidden = !settings.align.startsWith('anchor');
  }

  function bindControl(element, eventName, callback) {
    if (!element) return;
    element.addEventListener(eventName, callback);
  }

  function bindControls() {
    bindControl(state.elements.search, 'input', event => { state.search = event.target.value; scheduleRender(true); });
    bindControl(state.elements.searchClear, 'click', () => { state.search = ''; if (state.elements.search) state.elements.search.value = ''; scheduleRender(true); });
    bindControl(state.elements.mode, 'change', event => updateSettings({ mode: event.target.value }));
    bindControl(state.elements.align, 'change', event => updateSettings({ align: event.target.value }));
    bindControl(state.elements.anchorDomain, 'change', event => updateSettings({ anchor_domain: event.target.value }));
    bindControl(state.elements.anchorPoint, 'change', event => updateSettings({ anchor_point: event.target.value }));
    bindControl(state.elements.sortPrimary, 'change', event => updateSettings({ sort_primary: event.target.value }, true));
    bindControl(state.elements.sortPrimaryDirection, 'change', event => updateSettings({ sort_primary_direction: event.target.value }, true));
    bindControl(state.elements.sortSecondary, 'change', event => updateSettings({ sort_secondary: event.target.value }, true));
    bindControl(state.elements.sortSecondaryDirection, 'change', event => updateSettings({ sort_secondary_direction: event.target.value }, true));
    bindControl(state.elements.groupBy, 'change', event => updateSettings({ group_by: event.target.value }, true));
    bindControl(state.elements.rowHeight, 'input', event => updateSettings({ row_height: Number(event.target.value) }, true));
    bindControl(state.elements.zoom, 'input', event => updateSettings({ zoom: Number(event.target.value) }));
    bindControl(state.elements.zoomIn, 'click', () => updateSettings({ zoom: clamp(state.settings.zoom * 1.2, 0.15, 12) }));
    bindControl(state.elements.zoomOut, 'click', () => updateSettings({ zoom: clamp(state.settings.zoom / 1.2, 0.15, 12) }));
    bindControl(state.elements.fit, 'click', fitWidth);
    bindControl(state.elements.compactGap, 'input', event => updateSettings({ compact_gap_px: Number(event.target.value) }));
    bindControl(state.elements.compactGapMode, 'change', event => updateSettings({ compact_gap_mode: event.target.value }));
    bindControl(state.elements.showGapMarkers, 'change', event => updateSettings({ show_gap_markers: event.target.checked }));
    bindControl(state.elements.showDomainLabels, 'change', event => updateSettings({ show_domain_labels: event.target.checked }));
    bindControl(state.elements.showProteinLengths, 'change', event => updateSettings({ show_protein_lengths: event.target.checked }));
    bindControl(state.elements.showRuler, 'change', event => updateSettings({ show_ruler: event.target.checked }));
    bindControl(state.elements.collapseIdentical, 'change', event => updateSettings({ collapse_identical: event.target.checked }, true));
    bindControl(state.elements.labelTemplate, 'input', event => updateSettings({ label_template: event.target.value }, false, false));
    bindControl(state.elements.subtitleTemplate, 'input', event => updateSettings({ subtitle_template: event.target.value }, false, false));
    bindControl(state.elements.applyMetadata, 'click', () => {
      const proteinFields = state.elements.proteinHoverFields ? [...state.elements.proteinHoverFields.querySelectorAll('input:checked')].map(input => input.value) : state.settings.protein_hover_fields;
      const domainFields = state.elements.domainHoverFields ? [...state.elements.domainHoverFields.querySelectorAll('input:checked')].map(input => input.value) : state.settings.domain_hover_fields;
      updateSettings({
        label_template: state.elements.labelTemplate?.value || '{pid}',
        subtitle_template: state.elements.subtitleTemplate?.value || '',
        protein_hover_fields: proteinFields,
        domain_hover_fields: domainFields
      }, true);
    });
  }

  function updateSettings(patch, full = false, emitChange = true) {
    state.settings = normalizeSettings({ ...state.settings, ...patch });
    if (Object.keys(patch).some(key => ['mode', 'compact_gap_mode', 'compact_gap_px', 'zoom'].includes(key))) {
      for (const protein of state.proteins) protein.layoutCache.clear();
    }
    scheduleRender(full);
    if (emitChange) emit('settings-changed', { settings: getSettings() });
  }

  function domainStats(domain) {
    const stats = state.domains.get(domain);
    if (!stats) return null;
    return {
      id: stats.id,
      special: stats.special,
      occurrences: stats.occurrences,
      proteins: stats.proteinCount,
      residues: stats.residues,
      style: getStyle(domain)
    };
  }

  function getDomainStats() {
    return [...state.domains.values()].map(stats => ({
      id: stats.id,
      special: stats.special,
      occurrences: stats.occurrences,
      proteins: stats.proteinCount,
      residues: stats.residues,
      firstIndex: stats.firstIndex,
      style: getStyle(stats.id)
    }));
  }

  function setDomainStyle(domain, patch) {
    if (!state.domains.has(domain) || specialKey(domain)) return;
    const existing = getStyle(domain);
    state.styles[domain] = normalizeStyle(domain, { ...existing, ...patch, explicit: true });
    state.styles[domain].explicit = true;
    for (const protein of state.proteins) protein.layoutCache.clear();
    state.selectedDomain = domain;
    scheduleRender(false);
    emit('style-changed', { domain, style: getStyle(domain), stats: domainStats(domain) });
  }

  function resetDomainStyle(domain) {
    delete state.styles[domain];
    for (const protein of state.proteins) protein.layoutCache.clear();
    scheduleRender(false);
    emit('style-changed', { domain, style: getStyle(domain), stats: domainStats(domain) });
  }

  function suggestStyles(count = 10, metric = 'proteins', preserve = true) {
    const sorted = getDomainStats().filter(stats => !stats.special).sort((a, b) => {
      const av = metric === 'occurrences' ? a.occurrences : metric === 'residues' ? a.residues : a.proteins;
      const bv = metric === 'occurrences' ? b.occurrences : metric === 'residues' ? b.residues : b.proteins;
      return bv - av || naturalCompare(a.id, b.id);
    }).slice(0, Math.max(0, Number(count) || 0));
    sorted.forEach((stats, index) => {
      if (preserve && state.styles[stats.id]?.explicit) return;
      state.styles[stats.id] = normalizeStyle(stats.id, {
        display_name: state.styles[stats.id]?.display_name || stats.id,
        color: PALETTE[index % PALETTE.length],
        shape: SHAPES[index % SHAPES.length],
        visible: true,
        explicit: true
      });
      state.styles[stats.id].explicit = true;
    });
    for (const protein of state.proteins) protein.layoutCache.clear();
    scheduleRender(false);
    emit('styles-suggested', { domains: sorted.map(stats => stats.id) });
    return sorted.map(stats => stats.id);
  }

  function setOverlay(visible, title = 'Loading domain architectures', detail = '') {
    const overlay = state.elements.overlay;
    if (!overlay) return;
    overlay.hidden = !visible;
    if (visible) {
      if (state.elements.overlayTitle) state.elements.overlayTitle.textContent = title;
      if (state.elements.overlayDetail) state.elements.overlayDetail.textContent = detail;
    }
  }

  function showError(message) {
    if (!state.elements.error) return;
    state.elements.error.textContent = message;
    state.elements.error.hidden = !message;
  }

  async function readUrl(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load ${url} (${response.status}).`);
    return response.text();
  }

  async function load(payload = {}) {
    setOverlay(true, 'Loading domain architectures', 'Parsing one row per domain…');
    showError('');
    try {
      const tsvText = payload.tsvText ?? await readUrl(payload.dataUrl || state.config.dataUrl);
      const yamlText = payload.yamlText !== undefined ? payload.yamlText : ((payload.yamlUrl || state.config.yamlUrl) ? await readUrl(payload.yamlUrl || state.config.yamlUrl) : '');
      const parsed = parseTSV(tsvText, payload.tsvName || payload.dataUrl || state.config.dataUrl || 'domain.tsv');
      state.headers = parsed.headers;
      state.rows = parsed.rows;
      state.proteins = parsed.proteins;
      state.proteinById = parsed.proteinMap;
      state.domains = parsed.domainMap;
      state.proteinMetadataColumns = parsed.proteinMetadataColumns;
      state.domainMetadataColumns = parsed.domainMetadataColumns;
      state.allExtraColumns = parsed.extraColumns;
      state.warnings = parsed.warnings;
      state.errors = [];
      state.sourceName = parsed.sourceName;
      state.settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...(state.config.defaults || {}) });
      state.styles = {};
      state.originalYaml = null;
      state.selectedDomain = '';
      if (yamlText && String(yamlText).trim()) applyYaml(yamlText, payload.yamlName || payload.yamlUrl || state.config.yamlUrl || '');
      for (const protein of state.proteins) protein.layoutCache.clear();
      syncDynamicControls();
      rebuildDisplayItems();
      renderVisibleRows();
      if (state.elements.sourceSummary) state.elements.sourceSummary.textContent = `${state.proteins.length.toLocaleString()} proteins · ${state.rows.length.toLocaleString()} domain rows · ${state.domains.size.toLocaleString()} feature types · ${state.proteinMetadataColumns.length} protein metadata fields · ${state.domainMetadataColumns.length} domain metadata fields`;
      if (state.elements.downloadData && state.config.dataUrl) { state.elements.downloadData.href = state.config.dataUrl; state.elements.downloadData.hidden = false; }
      if (state.elements.downloadYaml && state.config.yamlUrl) { state.elements.downloadYaml.href = state.config.yamlUrl; state.elements.downloadYaml.hidden = false; }
      setOverlay(false);
      emit('ready', getSnapshot());
      requestAnimationFrame(() => { if (state.config.fitOnLoad !== false) fitWidth(); });
      return getSnapshot();
    } catch (error) {
      setOverlay(false);
      showError(error.message || String(error));
      emit('error', { error });
      throw error;
    }
  }

  function getSettings() {
    return JSON.parse(JSON.stringify(state.settings));
  }

  function getSnapshot() {
    return {
      version: VERSION,
      sourceName: state.sourceName,
      yamlName: state.yamlName,
      headers: [...state.headers],
      proteinCount: state.proteins.length,
      rowCount: state.rows.length,
      domainCount: state.domains.size,
      proteinMetadataColumns: [...state.proteinMetadataColumns],
      domainMetadataColumns: [...state.domainMetadataColumns],
      extraColumns: [...state.allExtraColumns],
      warnings: [...state.warnings],
      settings: getSettings(),
      domains: getDomainStats()
    };
  }

  function mapElements(ids = {}) {
    const get = (key, fallback) => $(ids[key] || fallback);
    state.elements = {
      appTitle: get('appTitle', 'appTitle'),
      paperHeader: get('paperHeader', 'paperHeader'),
      paperTitle: get('paperTitle', 'paperTitleEl'),
      figureTitle: get('figureTitle', 'figureTitleEl'),
      search: get('search', 'architectureSearch'),
      searchClear: get('searchClear', 'architectureSearchClear'),
      status: get('status', 'architectureStatus'),
      mode: get('mode', 'architectureMode'),
      align: get('align', 'architectureAlign'),
      anchorDomain: get('anchorDomain', 'architectureAnchorDomain'),
      anchorPoint: get('anchorPoint', 'architectureAnchorPoint'),
      anchorControls: get('anchorControls', 'architectureAnchorControls'),
      sortPrimary: get('sortPrimary', 'architectureSortPrimary'),
      sortPrimaryDirection: get('sortPrimaryDirection', 'architectureSortPrimaryDirection'),
      sortSecondary: get('sortSecondary', 'architectureSortSecondary'),
      sortSecondaryDirection: get('sortSecondaryDirection', 'architectureSortSecondaryDirection'),
      groupBy: get('groupBy', 'architectureGroupBy'),
      rowHeight: get('rowHeight', 'architectureRowHeight'),
      rowHeightValue: get('rowHeightValue', 'architectureRowHeightValue'),
      zoom: get('zoom', 'architectureZoom'),
      zoomValue: get('zoomValue', 'architectureZoomValue'),
      zoomIn: get('zoomIn', 'architectureZoomIn'),
      zoomOut: get('zoomOut', 'architectureZoomOut'),
      fit: get('fit', 'architectureFit'),
      compactControls: get('compactControls', 'architectureCompactControls'),
      compactGap: get('compactGap', 'architectureCompactGap'),
      compactGapMode: get('compactGapMode', 'architectureCompactGapMode'),
      showGapMarkers: get('showGapMarkers', 'architectureShowGapMarkers'),
      showDomainLabels: get('showDomainLabels', 'architectureShowDomainLabels'),
      showProteinLengths: get('showProteinLengths', 'architectureShowProteinLengths'),
      showRuler: get('showRuler', 'architectureShowRuler'),
      collapseIdentical: get('collapseIdentical', 'architectureCollapseIdentical'),
      labelTemplate: get('labelTemplate', 'architectureLabelTemplate'),
      subtitleTemplate: get('subtitleTemplate', 'architectureSubtitleTemplate'),
      proteinHoverFields: get('proteinHoverFields', 'architectureProteinHoverFields'),
      domainHoverFields: get('domainHoverFields', 'architectureDomainHoverFields'),
      applyMetadata: get('applyMetadata', 'architectureApplyMetadata'),
      viewport: get('viewport', 'architectureViewport'),
      spacer: get('spacer', 'architectureSpacer'),
      rowLayer: get('rowLayer', 'architectureRowLayer'),
      ruler: get('ruler', 'architectureRuler'),
      sourceSummary: get('sourceSummary', 'architectureSourceSummary'),
      downloadData: get('downloadData', 'architectureDownloadData'),
      downloadYaml: get('downloadYaml', 'architectureDownloadYaml'),
      overlay: get('overlay', 'architectureOverlay'),
      overlayTitle: get('overlayTitle', 'architectureOverlayTitle'),
      overlayDetail: get('overlayDetail', 'architectureOverlayDetail'),
      tooltip: get('tooltip', 'architectureTooltip'),
      error: get('error', 'architectureError')
    };
  }

  function configureHeader() {
    const config = state.config;
    if (state.elements.appTitle) state.elements.appTitle.textContent = config.title || 'Protein Domain Architecture Viewer';
    const paperTitle = config.paperTitle || '';
    const figureTitle = config.figureTitle || '';
    if (state.elements.paperTitle) { state.elements.paperTitle.textContent = paperTitle; state.elements.paperTitle.hidden = !paperTitle; }
    if (state.elements.figureTitle) { state.elements.figureTitle.textContent = figureTitle; state.elements.figureTitle.hidden = !figureTitle; }
    if (state.elements.paperHeader) state.elements.paperHeader.hidden = !(paperTitle || figureTitle);
  }

  function init(options = {}) {
    if (state.initialized) return api;
    state.config = { ...(window.DOMAIN_ARCHITECTURE_CONFIG || {}), ...(options.config || {}) };
    mapElements(options.elements || options);
    configureHeader();
    bindControls();
    bindViewportEvents();
    state.resizeObserver = new ResizeObserver(() => scheduleRender(false));
    if (state.elements.viewport) state.resizeObserver.observe(state.elements.viewport);
    state.initialized = true;
    if (state.config.autoLoad !== false && state.config.dataUrl) load({ dataUrl: state.config.dataUrl, yamlUrl: state.config.yamlUrl || '' });
    return api;
  }

  function downloadBlob(name, content, type = 'text/plain;charset=utf-8') {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const api = {
    VERSION,
    SPECIAL_FEATURES,
    SHAPES,
    PALETTE,
    init,
    load,
    parseTSV,
    parseSimpleYaml,
    serializeYaml,
    getSnapshot,
    getSettings,
    updateSettings,
    getDomainStats,
    domainStats,
    getStyle,
    setDomainStyle,
    resetDomainStyle,
    suggestStyles,
    fitWidth,
    downloadBlob,
    fileSize
  };

  window.DomainArchitectureViewer = api;
})();
