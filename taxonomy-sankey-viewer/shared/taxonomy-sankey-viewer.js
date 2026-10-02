(() => {
  'use strict';

  const VERSION = '1.3.1';
  const STANDARD_RANKS = ['domain', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'];
  const DEFAULT_PALETTE = [
    '#4f8fd9', '#e09245', '#67a96b', '#b56ac4', '#d55d68', '#5aa7a7',
    '#c69c3c', '#7c83d4', '#b0724a', '#4d9f79', '#d177a8', '#71859a',
    '#8a70b8', '#5f9cc9', '#9e8f3f', '#c7634f', '#6f9d52', '#9a6d91'
  ];
  const MAX_MEMBER_CACHE = 250000;

  const DEFAULTS = {
    title: 'Taxonomy Flow Viewer',
    subtitle: 'Curated taxonomic flow of a protein set',
    paperTitle: '',
    figureTitle: '',
    autoLoad: false,
    inputUrl: '',
    resolvedUrl: '',
    yamlUrl: '',
    colorUrl: '',
    pidColumn: 'pid',
    taxidColumn: 'taxid',
    classificationColumn: 'classification',
    initialSettings: {},
    maxFileBytes: 64 * 1024 * 1024,
    maxRows: 250000,
    showDownloads: true
  };

  const config = { ...DEFAULTS, ...(window.TAXONOMY_SANKEY_CONFIG || {}) };
  const state = {
    rawRows: [],
    resolvedRows: [],
    nodeCatalog: new Map(),
    inputFileName: '',
    resolvedFileName: '',
    yamlFileName: '',
    colorFileName: '',
    settings: normalizeSettings(config.initialSettings || {}),
    configuredSettings: cloneSettings(normalizeSettings(config.initialSettings || {})),
    overrides: {},
    colors: {},
    source: { resolver: 'input-classification', resolved_at: '', note: '' },
    graph: null,
    selectedNodeId: '',
    searchQuery: '',
    searchMatches: new Set(),
    showLabels: true,
    countMode: 'both',
    transform: { x: 0, y: 0, scale: 1 },
    dragging: null,
    diagnostics: [],
    resolutionReport: [],
    loaded: false,
    busy: false
  };

  const dom = {};

  function normalizeSettings(input = {}) {
    const ranks = Array.isArray(input.ranks) && input.ranks.length
      ? input.ranks.map(value => String(value).toLowerCase()).filter(value => STANDARD_RANKS.includes(value))
      : ['domain', 'phylum', 'class', 'order', 'family', 'genus'];
    const collapseOtherInput = input.collapse_other ?? input.collapseOther;
    const showOtherInput = input.show_other ?? input.showOther;
    const collapseOther = collapseOtherInput !== undefined
      ? Boolean(collapseOtherInput)
      : (showOtherInput !== undefined ? !Boolean(showOtherInput) : true);
    return {
      mode: input.mode === 'standard' ? 'standard' : 'all',
      ranks,
      minimum_count: Math.max(0, Number(input.minimum_count ?? input.minimumCount ?? 1) || 0),
      minimum_percent: Math.max(0, Number(input.minimum_percent ?? input.minimumPercent ?? 0) || 0),
      top_n_per_parent: Math.max(0, Math.floor(Number(input.top_n_per_parent ?? input.topNPerParent ?? 12) || 0)),
      collapse_single_child: Boolean(input.collapse_single_child ?? input.collapseSingleChild ?? false),
      collapse_other: collapseOther,
      hide_root: input.hide_root !== false && input.hideRoot !== false,
      include_unclassified: input.include_unclassified !== false && input.includeUnclassified !== false,
      show_no_rank: input.show_no_rank !== false && input.showNoRank !== false,
      sort_children: ['count', 'name', 'taxonomy', 'manual'].includes(input.sort_children || input.sortChildren)
        ? (input.sort_children || input.sortChildren)
        : 'count',
      color_by: String(input.color_by ?? input.colorBy ?? 'domain'),
      show_counts: input.show_counts !== false && input.showCounts !== false,
      show_percentages: input.show_percentages !== false && input.showPercentages !== false,
      height_scale: Math.min(2.5, Math.max(0.2, Number(input.height_scale ?? input.heightScale ?? 1) || 1)),
      node_padding: Math.min(60, Math.max(0, Number(input.node_padding ?? input.nodePadding ?? 12) || 0)),
      node_width: Math.max(8, Number(input.node_width ?? input.nodeWidth ?? 18) || 18)
    };
  }

  function cloneSettings(settings = {}) {
    const normalized = normalizeSettings(settings);
    return { ...normalized, ranks: [...normalized.ranks] };
  }

  function isUnclassifiedNode(node) {
    return normalizeRank(node?.rank) === 'unclassified' || /\bunclassified\b/i.test(String(node?.name || ''));
  }

  function isNoRankNode(node) {
    return normalizeRank(node?.rank) === 'no rank';
  }

  function emit(name, detail = {}) {
    document.dispatchEvent(new CustomEvent(`taxonomy-sankey:${name}`, { detail }));
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function stableHash(value) {
    let hash = 2166136261;
    const text = String(value ?? '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function automaticColor(key) {
    const index = parseInt(stableHash(key).slice(0, 8), 16) % DEFAULT_PALETTE.length;
    return DEFAULT_PALETTE[index];
  }

  function normalizeColor(value, fallback = '#94a3b8') {
    const text = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(text)) {
      const chars = text.slice(1).split('');
      return `#${chars.map(char => `${char}${char}`).join('')}`.toLowerCase();
    }
    return fallback;
  }

  function colorWithAlpha(color, alpha) {
    const hex = normalizeColor(color).slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('en-US').format(Number(value) || 0);
  }

  function formatPercent(value) {
    const number = Number(value) || 0;
    return `${number >= 10 ? number.toFixed(1) : number.toFixed(2)}%`;
  }

  function splitDelimitedLine(line, delimiter = '\t') {
    if (delimiter === '\t') return line.split('\t');
    const out = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
        else quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        out.push(current);
        current = '';
      } else current += char;
    }
    out.push(current);
    return out;
  }

  function parseTable(text, delimiter = '\t') {
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim() !== '');
    if (!lines.length) return { headers: [], rows: [] };
    const headers = splitDelimitedLine(lines[0], delimiter).map(value => value.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i += 1) {
      const values = splitDelimitedLine(lines[i], delimiter);
      const row = {};
      headers.forEach((header, index) => { row[header] = values[index] ?? ''; });
      row.__line = i + 1;
      rows.push(row);
    }
    return { headers, rows };
  }

  function quoteTsv(value) {
    const text = String(value ?? '');
    if (!/[\t\n\r"]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function parseRawTaxonomyTsv(text, options = {}) {
    const pidColumn = options.pidColumn || config.pidColumn || 'pid';
    const taxidColumn = options.taxidColumn || config.taxidColumn || 'taxid';
    const classificationColumn = options.classificationColumn || config.classificationColumn || 'classification';
    const parsed = parseTable(text, '\t');
    const missing = [pidColumn, taxidColumn].filter(column => !parsed.headers.includes(column));
    if (missing.length) throw new Error(`Input TSV is missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
    const diagnostics = [];
    const seenPids = new Map();
    const rows = parsed.rows.map((row, index) => {
      const pid = String(row[pidColumn] || '').trim();
      const taxid = String(row[taxidColumn] || '').trim();
      const classification = String(row[classificationColumn] || '').trim();
      if (!pid) diagnostics.push({ level: 'warning', message: `Line ${row.__line}: empty protein identifier.` });
      if (!/^\d+$/.test(taxid)) diagnostics.push({ level: 'warning', message: `Line ${row.__line}: taxid “${taxid || '(empty)'}” is not a positive integer.` });
      if (pid) seenPids.set(pid, (seenPids.get(pid) || 0) + 1);
      return { pid: pid || `row-${index + 1}`, taxid, classification, input: row };
    });
    for (const [pid, count] of seenPids) if (count > 1) diagnostics.push({ level: 'warning', message: `Protein identifier ${pid} appears ${count} times.` });
    if (rows.length > config.maxRows) throw new Error(`The table contains ${formatNumber(rows.length)} rows; the configured maximum is ${formatNumber(config.maxRows)}.`);
    return { rows, headers: parsed.headers, diagnostics, columns: { pidColumn, taxidColumn, classificationColumn } };
  }

  function parseLineageField(value) {
    return String(value || '').split(/\s*\|\s*/).map(part => part.trim()).filter(Boolean);
  }

  function parseResolvedTaxonomyTsv(text) {
    const parsed = parseTable(text, '\t');
    const required = ['pid', 'input_taxid', 'resolved_taxid', 'status', 'lineage_taxids', 'lineage_names', 'lineage_ranks'];
    const missing = required.filter(column => !parsed.headers.includes(column));
    if (missing.length) throw new Error(`Resolved taxonomy TSV is missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
    const rows = parsed.rows.map(row => {
      const lineageTaxids = parseLineageField(row.lineage_taxids);
      const lineageNames = parseLineageField(row.lineage_names);
      const lineageRanks = parseLineageField(row.lineage_ranks).map(rank => normalizeRank(rank));
      const length = Math.min(lineageTaxids.length, lineageNames.length);
      const standard = {};
      for (const rank of [...STANDARD_RANKS, 'realm']) {
        standard[rank] = {
          id: String(row[`${rank}_taxid`] || '').trim(),
          name: String(row[`${rank}_name`] || '').trim()
        };
      }
      return {
        pid: String(row.pid || '').trim(),
        inputTaxid: String(row.input_taxid || '').trim(),
        resolvedTaxid: String(row.resolved_taxid || '').trim(),
        status: String(row.status || '').trim() || 'resolved',
        scientificName: String(row.scientific_name || '').trim(),
        rank: normalizeRank(row.rank),
        lineageTaxids: lineageTaxids.slice(0, length),
        lineageNames: lineageNames.slice(0, length),
        lineageRanks: lineageRanks.slice(0, length),
        standard,
        inputClassification: String(row.input_classification || '').trim(),
        discrepancy: String(row.discrepancy || '').trim()
      };
    });
    return { rows, headers: parsed.headers };
  }

  function normalizeRank(rank) {
    const raw = String(rank || '').trim().toLowerCase().replace(/_/g, ' ');
    if (!raw) return 'no rank';
    if (raw === 'superkingdom') return 'domain';
    return raw;
  }

  function inferFallbackRanks(names) {
    // The compact classification column normally has no explicit rank metadata.
    // Keep the preview conservative and use only broadly recognizable structural
    // cues; authoritative ranks should come from NCBI or a local snapshot.
    const ranks = names.map(() => 'no rank');
    const lower = names.map(value => String(value || '').trim().toLowerCase());
    if (names.length && /^(cellular organisms|root)$/i.test(names[0])) ranks[0] = 'root';
    lower.forEach((value, index) => {
      if (['bacteria', 'archaea', 'eukaryota'].includes(value) || /viruses?$/.test(value) && index <= 1) ranks[index] = 'domain';
      else if (value.startsWith('unclassified ')) ranks[index] = 'unclassified';
      else if (/(aceae|idae)$/i.test(names[index])) ranks[index] = 'family';
      else if (/(ales|iformes)$/i.test(names[index])) ranks[index] = 'order';
      else if (/(ota|phyta|mycota)$/i.test(names[index])) ranks[index] = 'phylum';
    });
    // When an explicit order is present, the two preceding unnamed nodes are
    // commonly class and phylum. Apply that positional hint only to unresolved
    // ranks and never overwrite a suffix-based assignment.
    ranks.forEach((rank, index) => {
      if (rank !== 'order') return;
      if (index > 0 && ranks[index - 1] === 'no rank') ranks[index - 1] = 'class';
      if (index > 1 && ranks[index - 2] === 'no rank') ranks[index - 2] = 'phylum';
    });
    const last = names.length - 1;
    if (last >= 0 && ranks[last] === 'no rank') ranks[last] = 'terminal';
    return ranks;
  }

  function buildFallbackResolution(rawRows) {
    const rows = [];
    for (const row of rawRows) {
      const names = String(row.classification || '').split(';').map(value => value.trim()).filter(Boolean);
      if (!names.length) names.push(`TaxID ${row.taxid || 'unresolved'}`);
      const ids = [];
      const ranks = inferFallbackRanks(names);
      let parent = 'root';
      names.forEach((name, index) => {
        const id = index === names.length - 1 && row.taxid
          ? `taxid:${row.taxid}`
          : `path:${stableHash(`${parent}\u0000${name}`)}`;
        ids.push(id);
        parent = id;
      });
      const standard = {};
      for (const rank of [...STANDARD_RANKS, 'realm']) standard[rank] = { id: '', name: '' };
      ids.forEach((id, index) => {
        const rank = ranks[index];
        if (standard[rank] && !standard[rank].name) standard[rank] = { id, name: names[index] };
      });
      rows.push({
        pid: row.pid,
        inputTaxid: row.taxid,
        resolvedTaxid: row.taxid,
        status: 'input_classification',
        scientificName: names[names.length - 1],
        rank: ranks[ranks.length - 1],
        lineageTaxids: ids,
        lineageNames: names,
        lineageRanks: ranks,
        standard,
        inputClassification: row.classification,
        discrepancy: ''
      });
    }
    return rows;
  }

  function stripYamlComment(line) {
    let quoted = '';
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if ((char === '"' || char === "'") && line[i - 1] !== '\\') quoted = quoted === char ? '' : (quoted || char);
      if (char === '#' && !quoted && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
    }
    return line;
  }

  function yamlKeyValue(content) {
    let quoted = '';
    let depth = 0;
    for (let i = 0; i < content.length; i += 1) {
      const char = content[i];
      if ((char === '"' || char === "'") && content[i - 1] !== '\\') quoted = quoted === char ? '' : (quoted || char);
      if (!quoted) {
        if (char === '[' || char === '{') depth += 1;
        if (char === ']' || char === '}') depth -= 1;
        if (char === ':' && depth === 0) return [content.slice(0, i).trim(), content.slice(i + 1).trim()];
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
    const root = {};
    const stack = [{ indent: -1, value: root }];
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
    for (const original of lines) {
      const withoutComment = stripYamlComment(original).replace(/\s+$/, '');
      if (!withoutComment.trim()) continue;
      const indent = withoutComment.match(/^\s*/)[0].replace(/\t/g, '  ').length;
      const content = withoutComment.trim();
      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
      const parent = stack[stack.length - 1].value;
      if (content.startsWith('- ')) {
        if (!Array.isArray(parent)) continue;
        parent.push(parseYamlScalar(content.slice(2)));
        continue;
      }
      const [rawKey, rawValue] = yamlKeyValue(content);
      const key = String(parseYamlScalar(rawKey));
      if (!rawValue) {
        const next = {};
        parent[key] = next;
        stack.push({ indent, value: next });
      } else {
        parent[key] = parseYamlScalar(rawValue);
      }
    }
    return root;
  }

  function parseColorYaml(text) {
    const object = parseSimpleYaml(text);
    const colors = {};
    for (const [key, value] of Object.entries(object || {})) {
      if (typeof value === 'string' && /^#[0-9a-f]{3,6}$/i.test(value.trim())) colors[key] = normalizeColor(value);
      else if (value && typeof value === 'object' && value.color) colors[key] = normalizeColor(value.color);
    }
    return colors;
  }

  function quoteYaml(value) {
    return JSON.stringify(String(value ?? ''));
  }

  function serializeCurationYaml() {
    const settings = state.settings;
    const lines = [
      'version: 1',
      `title: ${quoteYaml(config.figureTitle || config.title || 'Taxonomy Sankey')}`,
      'source:',
      `  resolver: ${quoteYaml(state.source.resolver || 'input-classification')}`,
      `  resolved_at: ${quoteYaml(state.source.resolved_at || new Date().toISOString().slice(0, 10))}`,
      `  note: ${quoteYaml(state.source.note || '')}`,
      'layout:',
      `  mode: ${quoteYaml(settings.mode)}`,
      `  ranks: ${JSON.stringify(settings.ranks)}`,
      `  minimum_count: ${settings.minimum_count}`,
      `  minimum_percent: ${settings.minimum_percent}`,
      `  top_n_per_parent: ${settings.top_n_per_parent}`,
      `  collapse_single_child: ${settings.collapse_single_child}`,
      `  collapse_other: ${settings.collapse_other}`,
      `  hide_root: ${settings.hide_root}`,
      `  include_unclassified: ${settings.include_unclassified}`,
      `  show_no_rank: ${settings.show_no_rank}`,
      `  sort_children: ${quoteYaml(settings.sort_children)}`,
      `  color_by: ${quoteYaml(settings.color_by)}`,
      `  show_counts: ${settings.show_counts}`,
      `  show_percentages: ${settings.show_percentages}`,
      `  height_scale: ${Number(settings.height_scale.toFixed(3))}`,
      `  node_padding: ${settings.node_padding}`,
      `  node_width: ${settings.node_width}`,
      'overrides:'
    ];
    const entries = Object.entries(state.overrides || {}).filter(([, value]) => value && Object.keys(value).some(key => value[key] !== '' && value[key] !== null && value[key] !== undefined && value[key] !== 'auto'));
    if (!entries.length) lines[lines.length - 1] = 'overrides: {}';
    else {
      entries.sort(([a], [b]) => a.localeCompare(b));
      for (const [id, value] of entries) {
        lines.push(`  ${quoteYaml(id)}:`);
        if (value.display_name) lines.push(`    display_name: ${quoteYaml(value.display_name)}`);
        if (value.action && value.action !== 'auto') lines.push(`    action: ${quoteYaml(value.action)}`);
        if (value.color) lines.push(`    color: ${quoteYaml(normalizeColor(value.color))}`);
        if (Number.isFinite(Number(value.order))) lines.push(`    order: ${Number(value.order)}`);
      }
    }
    return `${lines.join('\n')}\n`;
  }

  function serializeColorYaml() {
    const lines = [];
    const entries = Object.entries(state.colors || {}).sort(([a], [b]) => a.localeCompare(b));
    for (const [key, color] of entries) lines.push(`${quoteYaml(key)}: ${quoteYaml(normalizeColor(color))}`);
    if (!lines.length && state.graph) {
      for (const [key, color] of Object.entries(state.graph.categoryColors || {}).sort(([a], [b]) => a.localeCompare(b))) lines.push(`${quoteYaml(key)}: ${quoteYaml(color)}`);
    }
    return `${lines.join('\n')}\n`;
  }

  function applyCurationYaml(text) {
    const parsed = parseSimpleYaml(text);
    if (parsed.layout && typeof parsed.layout === 'object') state.settings = normalizeSettings({ ...state.settings, ...parsed.layout });
    state.source = { ...state.source, ...(parsed.source && typeof parsed.source === 'object' ? parsed.source : {}) };
    state.overrides = parsed.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {};
    return parsed;
  }

  function rebuildNodeCatalog() {
    const catalog = new Map();
    for (const row of state.resolvedRows) {
      const length = Math.min(row.lineageTaxids.length, row.lineageNames.length, row.lineageRanks.length);
      let parentId = '';
      for (let i = 0; i < length; i += 1) {
        const id = row.lineageTaxids[i];
        if (!id) continue;
        const entry = catalog.get(id) || {
          id,
          name: row.lineageNames[i] || id,
          rank: normalizeRank(row.lineageRanks[i]),
          parentIds: new Set(),
          childIds: new Set(),
          count: 0,
          members: [],
          standardRanks: new Set(),
          statuses: new Set()
        };
        entry.name = entry.name || row.lineageNames[i] || id;
        entry.rank = entry.rank || normalizeRank(row.lineageRanks[i]);
        if (parentId) entry.parentIds.add(parentId);
        entry.count += 1;
        if (entry.members.length < MAX_MEMBER_CACHE) entry.members.push(row.pid);
        entry.statuses.add(row.status);
        catalog.set(id, entry);
        if (parentId && catalog.has(parentId)) catalog.get(parentId).childIds.add(id);
        parentId = id;
      }
      for (const [rank, value] of Object.entries(row.standard || {})) {
        if (value?.id && catalog.has(value.id)) catalog.get(value.id).standardRanks.add(rank);
      }
    }
    state.nodeCatalog = catalog;
  }

  function nodeFromResolved(row, index) {
    const id = row.lineageTaxids[index];
    const catalog = state.nodeCatalog.get(id);
    const override = state.overrides[id] || {};
    return {
      id,
      taxid: id.startsWith('taxid:') ? id.slice(6) : (/^\d+$/.test(id) ? id : ''),
      name: row.lineageNames[index] || catalog?.name || id,
      displayName: override.display_name || row.lineageNames[index] || catalog?.name || id,
      rank: normalizeRank(row.lineageRanks[index] || catalog?.rank),
      override
    };
  }

  function standardNode(row, rank) {
    let value = row.standard?.[rank];
    if (rank === 'domain') value = row.standard?.domain?.name ? row.standard.domain : (row.standard?.realm?.name ? row.standard.realm : value);
    if (!value?.name) return null;
    const id = value.id || `standard:${rank}:${stableHash(value.name)}`;
    const override = state.overrides[id] || {};
    return {
      id,
      taxid: /^\d+$/.test(String(value.id || '')) ? String(value.id) : '',
      name: value.name,
      displayName: override.display_name || value.name,
      rank,
      override
    };
  }

  function pathForRow(row) {
    const fullPath = row.lineageTaxids.map((_, index) => nodeFromResolved(row, index)).filter(node => node?.id);

    // Excluding a taxon is a statement about its whole subtree, even when that
    // taxon is not one of the levels currently displayed. Apply exclusions to
    // the complete frozen lineage before selecting presentation levels.
    if (fullPath.some(node => (node.override?.action || 'auto') === 'exclude')) return [];

    let path = [];
    if (state.settings.mode === 'standard') {
      const selectedById = new Map();
      const selectedDescriptors = [];
      for (const rank of state.settings.ranks) {
        const descriptor = standardNode(row, rank);
        if (!descriptor) continue;
        selectedDescriptors.push(descriptor);
        selectedById.set(descriptor.id, descriptor);
      }

      const seen = new Set();
      for (const node of fullPath) {
        const standardDescriptor = selectedById.get(node.id);
        const keepSpecial = (state.settings.include_unclassified && isUnclassifiedNode(node))
          || (state.settings.show_no_rank && isNoRankNode(node));
        if (!standardDescriptor && !keepSpecial) continue;
        const descriptor = standardDescriptor || node;
        if (seen.has(descriptor.id)) continue;
        path.push(descriptor);
        seen.add(descriptor.id);
      }

      // Resolved snapshots normally use the same IDs in the full lineage and
      // standard-rank columns. Keep a safe fallback for incomplete snapshots
      // without reverting to every lineage node (which would bypass the rank
      // filter and reintroduce no-rank or unclassified taxa unexpectedly).
      for (const descriptor of selectedDescriptors) {
        if (!seen.has(descriptor.id)) {
          path.push(descriptor);
          seen.add(descriptor.id);
        }
      }
    } else {
      path = fullPath;
    }

    const clean = [];
    for (const node of path) {
      if (!node?.id) continue;
      if (clean.length && clean[clean.length - 1].id === node.id) continue;
      const action = node.override?.action || 'auto';
      if (action === 'exclude') return [];
      const isRoot = normalizeRank(node.rank) === 'root' || /^(root|cellular organisms)$/i.test(node.name);
      if (state.settings.hide_root && isRoot) continue;
      if (!state.settings.include_unclassified && isUnclassifiedNode(node)) continue;
      if (!state.settings.show_no_rank && isNoRankNode(node)) continue;
      if (action === 'collapse') continue;
      clean.push(node);
    }
    return clean;
  }

  function makeTreeNode(node, parent = null) {
    return {
      id: node.id,
      taxid: node.taxid || '',
      name: node.name,
      displayName: node.displayName || node.name,
      rank: node.rank || 'no rank',
      override: node.override || {},
      parent,
      children: new Map(),
      count: 0,
      members: [],
      terminalCount: 0,
      terminalMembers: [],
      depth: parent ? parent.depth + 1 : -1,
      synthetic: Boolean(node.synthetic),
      isOther: Boolean(node.isOther || node.syntheticType === 'other'),
      orderStart: 0,
      orderEnd: 0,
      orderValue: 0
    };
  }

  function sortedChildren(node) {
    const children = [...node.children.values()];
    const method = state.settings.sort_children;
    children.sort((a, b) => {
      // Synthetic Other groups are placed at the outer edge of each sibling
      // block. Keeping them last prevents their broad aggregate ribbons from
      // being interleaved with biological child subtrees when they are shown.
      if (Boolean(a.isOther) !== Boolean(b.isOther)) return a.isOther ? 1 : -1;
      const orderA = Number.isFinite(Number(a.override?.order)) ? Number(a.override.order) : null;
      const orderB = Number.isFinite(Number(b.override?.order)) ? Number(b.override.order) : null;
      if (orderA !== null || orderB !== null) {
        if (orderA === null) return 1;
        if (orderB === null) return -1;
        if (orderA !== orderB) return orderA - orderB;
      }
      if (method === 'name') return a.displayName.localeCompare(b.displayName);
      if (method === 'taxonomy' || method === 'manual') return a.name.localeCompare(b.name);
      return b.count - a.count || a.displayName.localeCompare(b.displayName);
    });
    return children;
  }

  function buildFullTree() {
    const root = makeTreeNode({ id: '__root__', name: 'Root', displayName: 'Root', rank: 'root', synthetic: true });
    root.depth = -1;
    let includedRows = 0;
    for (const row of state.resolvedRows) {
      const path = pathForRow(row);
      if (!path.length) continue;
      includedRows += 1;
      let parent = root;
      parent.count += 1;
      if (parent.members.length < MAX_MEMBER_CACHE) parent.members.push(row.pid);
      for (const descriptor of path) {
        let child = parent.children.get(descriptor.id);
        if (!child) {
          child = makeTreeNode(descriptor, parent);
          parent.children.set(descriptor.id, child);
        }
        child.count += 1;
        if (child.members.length < MAX_MEMBER_CACHE) child.members.push(row.pid);
        parent = child;
      }
      parent.terminalCount += 1;
      if (parent.terminalMembers.length < MAX_MEMBER_CACHE) parent.terminalMembers.push(row.pid);
    }
    root.count = includedRows;
    return root;
  }

  function compressTree(fullRoot) {
    const total = Math.max(1, fullRoot.count);
    const minCount = state.settings.minimum_count;
    const minPercent = state.settings.minimum_percent;
    const topN = state.settings.top_n_per_parent;

    function appendMembers(target, values) {
      for (const pid of values || []) {
        if (target.length >= MAX_MEMBER_CACHE) break;
        target.push(pid);
      }
    }

    function refreshVisibleTotals(node) {
      let visibleCount = Number(node.terminalCount) || 0;
      const visibleMembers = [];
      appendMembers(visibleMembers, node.terminalMembers);
      for (const child of node.children.values()) {
        visibleCount += Number(child.count) || 0;
        appendMembers(visibleMembers, child.members);
      }
      node.count = visibleCount;
      node.members = visibleMembers;
      return node;
    }

    function cloneNode(node, parent = null) {
      const clone = { ...node, parent, children: new Map(), members: [], terminalMembers: [...node.terminalMembers] };
      const children = sortedChildren(node);
      const forced = children.filter(child => child.override?.action === 'always');
      const candidates = children.filter(child => child.override?.action !== 'always' && child.count >= minCount && (child.count / total * 100) >= minPercent);
      const keep = new Set(forced);
      for (const child of (topN > 0 ? candidates.slice(0, topN) : candidates)) keep.add(child);
      const dropped = children.filter(child => !keep.has(child));

      for (const child of children) {
        if (!keep.has(child)) continue;
        const childClone = cloneNode(child, clone);
        if (childClone.count > 0 || child.override?.action === 'always') clone.children.set(childClone.id, childClone);
      }

      if (dropped.length) {
        const otherMembers = [];
        let otherCount = 0;
        for (const child of dropped) {
          otherCount += child.count;
          appendMembers(otherMembers, child.members);
        }
        const otherId = `other:${node.id}`;
        const otherOverride = state.overrides[otherId] || {};
        const otherAction = otherOverride.action || 'auto';

        // Synthetic Other groups are collapsed into their direct parent by
        // default. This preserves all proteins in the displayed totals without
        // introducing a broad aggregate ribbon that can obscure nearby
        // taxonomic branches. Explicit node actions still take precedence:
        // exclude removes the group, collapse keeps it in the parent, and
        // always forces the synthetic node to be shown.
        const collapseOther = otherAction === 'collapse'
          || (otherAction === 'auto' && state.settings.collapse_other);
        const showOther = otherAction === 'always'
          || (otherAction === 'auto' && !state.settings.collapse_other);
        if (collapseOther) {
          clone.terminalCount += otherCount;
          appendMembers(clone.terminalMembers, otherMembers);
        } else if (showOther) {
          const other = makeTreeNode({
            id: otherId,
            name: `Other within ${node.displayName}`,
            displayName: otherOverride.display_name || `Other ${node.displayName}`,
            rank: 'other',
            synthetic: true,
            syntheticType: 'other',
            isOther: true,
            override: otherOverride
          }, clone);
          other.count = otherCount;
          other.members = otherMembers;
          other.terminalCount = otherCount;
          other.terminalMembers = [...otherMembers];
          clone.children.set(other.id, other);
        }
      }
      return refreshVisibleTotals(clone);
    }

    const root = cloneNode(fullRoot, null);

    if (state.settings.collapse_single_child) {
      function collapse(node) {
        for (const child of [...node.children.values()]) collapse(child);
        for (const child of [...node.children.values()]) {
          if (child.synthetic || child.override?.action === 'always') continue;
          if (child.children.size === 1 && child.terminalCount === 0) {
            const grandchild = [...child.children.values()][0];
            if (grandchild.count === child.count) {
              node.children.delete(child.id);
              grandchild.parent = node;
              node.children.set(grandchild.id, grandchild);
            }
          }
        }
        refreshVisibleTotals(node);
      }
      collapse(root);
    }

    function resetDepth(node, depth = -1) {
      node.depth = depth;
      for (const child of node.children.values()) resetDepth(child, depth + 1);
    }
    resetDepth(root);
    return root;
  }

  function assignOrder(root) {
    let cursor = 0;
    function visit(node) {
      const children = sortedChildren(node).filter(child => node.children.has(child.id));
      if (!children.length) {
        node.orderStart = cursor;
        node.orderEnd = cursor;
        node.orderValue = cursor;
        cursor += 1;
        return;
      }
      for (const child of children) visit(child);
      node.orderStart = Math.min(...children.map(child => child.orderStart));
      node.orderEnd = Math.max(...children.map(child => child.orderEnd));
      node.orderValue = (node.orderStart + node.orderEnd) / 2;
    }
    visit(root);
  }

  function ancestorForRank(node, rank) {
    let current = node;
    while (current && current.id !== '__root__') {
      if (current.rank === rank) return current;
      current = current.parent;
    }
    return null;
  }

  function colorCategoryForNode(node) {
    const colorBy = state.settings.color_by || 'domain';
    if (colorBy === 'self') return node.displayName;
    if (colorBy.startsWith('depth:')) {
      const target = Number(colorBy.split(':')[1]);
      let current = node;
      while (current && current.depth > target) current = current.parent;
      return current && current.id !== '__root__' ? current.displayName : node.displayName;
    }
    const ancestor = ancestorForRank(node, colorBy);
    if (ancestor) return ancestor.displayName;
    let domain = ancestorForRank(node, 'domain');
    if (domain) return domain.displayName;
    let top = node;
    while (top.parent && top.parent.id !== '__root__') top = top.parent;
    return top.displayName || 'Unclassified';
  }

  function flattenTree(root) {
    const nodes = [];
    const links = [];
    function visit(node) {
      if (node.id !== '__root__') nodes.push(node);
      for (const child of node.children.values()) {
        if (node.id !== '__root__') links.push({ id: `${node.id}=>${child.id}`, source: node, target: child, count: child.count });
        visit(child);
      }
    }
    visit(root);
    return { nodes, links };
  }

  function layoutTree(root, viewportWidth, viewportHeight) {
    assignOrder(root);
    const { nodes, links } = flattenTree(root);
    const maxDepth = nodes.reduce((max, node) => Math.max(max, node.depth), 0);
    const columns = Array.from({ length: maxDepth + 1 }, () => []);
    for (const node of nodes) columns[node.depth].push(node);
    for (const column of columns) column.sort((a, b) => a.orderValue - b.orderValue || b.count - a.count);

    const margin = { top: 58, right: 235, bottom: 44, left: 145 };
    const minColumnSpace = 230;
    const width = Math.max(980, viewportWidth || 1200, margin.left + margin.right + maxDepth * minColumnSpace + 60);
    const maxColumnNodes = Math.max(1, ...columns.map(column => column.length));
    const baseHeight = Math.max(560, viewportHeight || 620, margin.top + margin.bottom + maxColumnNodes * 30);
    const height = Math.max(300, Math.round(baseHeight * state.settings.height_scale));
    const usableHeight = Math.max(80, height - margin.top - margin.bottom);
    const nodeWidth = state.settings.node_width;
    const xStep = maxDepth > 0 ? (width - margin.left - margin.right - nodeWidth) / maxDepth : 0;

    // A protein count is a weight, not a pixel count. The previous minimum of
    // 1.4 px per protein made large datasets thousands of pixels tall. Derive
    // a true count-to-pixel scale from the requested diagram height instead.
    const columnMetrics = columns.map(column => {
      const count = column.length;
      const desiredGap = state.settings.node_padding;
      const maxGap = count > 1 ? Math.max(0, usableHeight * 0.38 / (count - 1)) : desiredGap;
      const gap = Math.min(desiredGap, maxGap);
      const sum = column.reduce((total, node) => total + node.count, 0);
      const availableForNodes = Math.max(1, usableHeight - Math.max(0, count - 1) * gap);
      return { gap, sum, availableForNodes };
    });
    const scaleCandidates = columnMetrics
      .filter(metric => metric.sum > 0)
      .map(metric => metric.availableForNodes / metric.sum);
    const flowScale = Math.max(0.0001, Math.min(...scaleCandidates.filter(Number.isFinite), 28));

    columns.forEach((column, depth) => {
      const metric = columnMetrics[depth];
      const gap = metric.gap;
      const preferredMinimum = Math.max(0.7, Math.min(6, usableHeight / Math.max(1, column.length * 2.8)));
      let heights = column.map(node => Math.max(preferredMinimum, node.count * flowScale));
      const gapsHeight = Math.max(0, column.length - 1) * gap;
      const availableForNodes = Math.max(1, usableHeight - gapsHeight);
      const rawTotal = heights.reduce((a, b) => a + b, 0);
      if (rawTotal > availableForNodes && rawTotal > 0) {
        const factor = availableForNodes / rawTotal;
        heights = heights.map(value => Math.max(0.35, value * factor));
      }
      const totalHeight = heights.reduce((a, b) => a + b, 0) + gapsHeight;
      let y = margin.top + Math.max(0, (usableHeight - totalHeight) / 2);
      column.forEach((node, index) => {
        node.x0 = margin.left + depth * xStep;
        node.x1 = node.x0 + nodeWidth;
        node.y0 = y;
        node.y1 = y + heights[index];
        node.layoutHeight = heights[index];
        node.colorCategory = colorCategoryForNode(node);
        node.color = normalizeColor(node.override?.color || state.colors[node.colorCategory] || state.colors[node.id] || automaticColor(node.colorCategory));
        y = node.y1 + gap;
      });
    });

    const sourceOffsets = new Map();
    const outgoing = new Map();
    for (const link of links) {
      if (!outgoing.has(link.source.id)) outgoing.set(link.source.id, []);
      outgoing.get(link.source.id).push(link);
    }
    for (const list of outgoing.values()) list.sort((a, b) => a.target.y0 - b.target.y0);
    for (const [sourceId, list] of outgoing) {
      const source = list[0].source;
      const rawThicknesses = list.map(link => Math.min(link.target.layoutHeight, Math.max(0.25, link.count * flowScale)));
      const rawTotal = rawThicknesses.reduce((sum, value) => sum + value, 0);
      const factor = rawTotal > source.layoutHeight && rawTotal > 0 ? source.layoutHeight / rawTotal : 1;
      list.forEach((link, index) => { link.layoutThickness = Math.max(0.05, rawThicknesses[index] * factor); });
      const used = list.reduce((sum, link) => sum + link.layoutThickness, 0);
      sourceOffsets.set(sourceId, source.y0 + Math.max(0, (source.layoutHeight - used) / 2));
    }

    for (const link of links) {
      const thickness = link.layoutThickness || Math.min(link.target.layoutHeight, Math.max(0.25, link.count * flowScale));
      const sourceY0 = sourceOffsets.get(link.source.id) ?? link.source.y0;
      sourceOffsets.set(link.source.id, sourceY0 + thickness);
      const sourceY1 = sourceY0 + thickness;
      const targetCenter = (link.target.y0 + link.target.y1) / 2;
      const targetY0 = targetCenter - thickness / 2;
      const targetY1 = targetCenter + thickness / 2;
      link.sx = link.source.x1;
      link.tx = link.target.x0;
      link.sy0 = sourceY0;
      link.sy1 = sourceY1;
      link.ty0 = targetY0;
      link.ty1 = targetY1;
      link.color = link.source.color;
    }

    const categoryColors = {};
    for (const node of nodes) categoryColors[node.colorCategory] = node.color;
    return { root, nodes, links, columns, width, height, bounds: { x0: 0, y0: 0, x1: width, y1: height }, flowScale, categoryColors };
  }

  function buildGraph() {
    if (!state.resolvedRows.length) return null;
    const full = buildFullTree();
    const compressed = compressTree(full);
    const viewportWidth = dom.viewport?.clientWidth || 1200;
    const viewportHeight = Math.max(520, dom.viewport?.clientHeight || 620);
    return layoutTree(compressed, viewportWidth, viewportHeight);
  }

  function svgEl(name, attrs = {}) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
    return element;
  }

  function linkPath(link) {
    const curve = Math.max(48, (link.tx - link.sx) * 0.46);
    return [
      `M${link.sx},${link.sy0}`,
      `C${link.sx + curve},${link.sy0} ${link.tx - curve},${link.ty0} ${link.tx},${link.ty0}`,
      `L${link.tx},${link.ty1}`,
      `C${link.tx - curve},${link.ty1} ${link.sx + curve},${link.sy1} ${link.sx},${link.sy1}`,
      'Z'
    ].join(' ');
  }

  function nodeCountLabel(node) {
    const percent = state.graph?.root?.count ? node.count / state.graph.root.count * 100 : 0;
    if (state.countMode === 'count') return formatNumber(node.count);
    if (state.countMode === 'percent') return formatPercent(percent);
    return `${formatNumber(node.count)} · ${formatPercent(percent)}`;
  }

  function rankLabel(rank) {
    const normalized = normalizeRank(rank);
    const labels = {
      domain: 'Domain / realm', kingdom: 'Kingdom', phylum: 'Phylum', class: 'Class',
      order: 'Order', family: 'Family', genus: 'Genus', species: 'Species',
      unclassified: 'Unclassified', 'no rank': 'No rank', root: 'Root', terminal: 'Terminal taxon'
    };
    return labels[normalized] || normalized.replace(/\b\w/g, char => char.toUpperCase());
  }

  function columnTitle(column, index) {
    const ranks = [...new Set(column.map(node => normalizeRank(node.rank)).filter(Boolean))];
    if (ranks.length === 1) return rankLabel(ranks[0]);
    if (ranks.length > 1 && ranks.length <= 3) return ranks.map(rankLabel).join(' / ');
    return `Level ${index + 1}`;
  }

  function buildViewerRankControls() {
    if (!dom.viewerRanks || dom.viewerRanks.children.length) return;
    const labels = {
      domain: 'Domain / realm', kingdom: 'Kingdom', phylum: 'Phylum', class: 'Class',
      order: 'Order', family: 'Family', genus: 'Genus', species: 'Species'
    };
    dom.viewerRanks.innerHTML = Object.entries(labels)
      .map(([rank, label]) => `<label class="rank-chip"><input type="checkbox" value="${rank}"><span>${label}</span></label>`)
      .join('');
  }

  function selectedViewerRanks() {
    if (!dom.viewerRanks) return [...state.settings.ranks];
    return [...dom.viewerRanks.querySelectorAll('input:checked')].map(input => input.value);
  }

  function syncViewerRankControls() {
    buildViewerRankControls();
    if (dom.hierarchyMode) dom.hierarchyMode.value = state.settings.mode;
    if (dom.viewerRanks) {
      for (const input of dom.viewerRanks.querySelectorAll('input')) {
        input.checked = state.settings.ranks.includes(input.value);
        input.disabled = state.settings.mode !== 'standard';
      }
    }
    if (dom.viewerIncludeUnclassified) dom.viewerIncludeUnclassified.checked = state.settings.include_unclassified;
    if (dom.viewerShowNoRank) dom.viewerShowNoRank.checked = state.settings.show_no_rank;
    if (dom.rankSummary) {
      const special = [];
      if (state.settings.include_unclassified) special.push('unclassified');
      if (state.settings.show_no_rank) special.push('no-rank');
      if (state.settings.mode === 'all') {
        dom.rankSummary.textContent = `Complete lineage${special.length ? ` · ${special.join(' + ')}` : ' · ranked nodes only'}`;
      } else {
        const count = state.settings.ranks.length;
        dom.rankSummary.textContent = `${count} standard level${count === 1 ? '' : 's'}${special.length ? ` · ${special.join(' + ')}` : ''}`;
      }
    }
  }

  function applyViewerLevelControls(options = {}) {
    if (!dom.hierarchyMode) return;
    const mode = dom.hierarchyMode.value === 'all' ? 'all' : 'standard';
    const ranks = selectedViewerRanks();
    const includeUnclassified = Boolean(dom.viewerIncludeUnclassified?.checked);
    const showNoRank = Boolean(dom.viewerShowNoRank?.checked);
    if (mode === 'standard' && !ranks.length) {
      syncViewerRankControls();
      return;
    }
    updateSettings({
      mode,
      ranks,
      include_unclassified: includeUnclassified,
      show_no_rank: showNoRank
    }, { fit: options.fit !== false });
  }

  function restoreConfiguredLevels() {
    const configured = state.configuredSettings || normalizeSettings(config.initialSettings || {});
    updateSettings({
      mode: configured.mode,
      ranks: [...configured.ranks],
      include_unclassified: configured.include_unclassified,
      show_no_rank: configured.show_no_rank
    }, { fit: true });
  }

  function syncViewerControls() {
    const percent = Math.round(state.settings.height_scale * 100);
    if (dom.heightScale && Number(dom.heightScale.value) !== percent) dom.heightScale.value = String(percent);
    if (dom.heightScaleValue) dom.heightScaleValue.textContent = `${percent}%`;
    if (dom.showOther) dom.showOther.checked = !state.settings.collapse_other;
    syncViewerRankControls();
  }

  function renderGraph({ fit = false } = {}) {
    if (!dom.svg || !dom.world) return;
    syncViewerControls();
    state.graph = buildGraph();
    dom.world.replaceChildren();
    if (!state.graph || !state.graph.nodes.length) {
      const empty = svgEl('text', { x: '50%', y: '50%', class: 'sankey-empty' });
      empty.textContent = state.resolvedRows.length ? 'No taxa remain after the current curation and compression settings.' : 'Load taxonomy data to begin.';
      dom.world.appendChild(empty);
      updateStatus();
      renderLegend();
      renderSelection();
      return;
    }

    dom.svg.setAttribute('viewBox', `0 0 ${Math.max(1, dom.viewport.clientWidth)} ${Math.max(1, dom.viewport.clientHeight)}`);
    const columnsGroup = svgEl('g', { class: 'sankey-column-headings' });
    state.graph.columns.forEach((column, index) => {
      if (!column.length) return;
      const label = svgEl('text', {
        x: column[0].x0,
        y: 28,
        class: 'sankey-column-label'
      });
      label.textContent = columnTitle(column, index);
      columnsGroup.appendChild(label);
    });
    dom.world.appendChild(columnsGroup);

    const linksGroup = svgEl('g', { class: 'sankey-links' });
    for (const link of state.graph.links) {
      const path = svgEl('path', {
        d: linkPath(link),
        class: 'sankey-link',
        fill: colorWithAlpha(link.color, 0.72),
        'data-link-id': link.id
      });
      path.addEventListener('pointerenter', event => showLinkTooltip(event, link));
      path.addEventListener('pointermove', moveTooltip);
      path.addEventListener('pointerleave', hideTooltip);
      path.addEventListener('click', event => {
        event.stopPropagation();
        selectNode(link.target.id);
      });
      link.element = path;
      linksGroup.appendChild(path);
    }
    dom.world.appendChild(linksGroup);

    const nodesGroup = svgEl('g', { class: 'sankey-nodes' });
    for (const node of state.graph.nodes) {
      const group = svgEl('g', { class: 'sankey-node', 'data-node-id': node.id });
      const rect = svgEl('rect', {
        x: node.x0,
        y: node.y0,
        width: Math.max(1, node.x1 - node.x0),
        height: Math.max(1, node.y1 - node.y0),
        fill: node.color,
        class: 'sankey-node-bar'
      });
      const label = svgEl('text', {
        x: node.x1 + 6,
        y: (node.y0 + node.y1) / 2 - 4,
        class: 'sankey-label'
      });
      label.textContent = node.displayName;
      const count = svgEl('text', {
        x: node.x1 + 6,
        y: (node.y0 + node.y1) / 2 + 9,
        class: 'sankey-label-count'
      });
      count.textContent = nodeCountLabel(node);
      if (!state.showLabels) { label.setAttribute('display', 'none'); count.setAttribute('display', 'none'); }
      const hit = svgEl('rect', {
        x: node.x0 - 4,
        y: node.y0 - 3,
        width: Math.max(44, node.x1 - node.x0 + 210),
        height: Math.max(10, node.y1 - node.y0 + 6),
        class: 'sankey-hit'
      });
      hit.addEventListener('pointerenter', event => showNodeTooltip(event, node));
      hit.addEventListener('pointermove', moveTooltip);
      hit.addEventListener('pointerleave', hideTooltip);
      hit.addEventListener('click', event => {
        event.stopPropagation();
        selectNode(node.id);
      });
      group.append(rect, label, count, hit);
      node.element = group;
      nodesGroup.appendChild(group);
    }
    dom.world.appendChild(nodesGroup);

    applyHighlightState();
    renderLegend();
    renderSelection();
    updateStatus();
    updateTransform();
    if (fit) fitView();
    emit('rendered', { graph: state.graph });
  }

  function renderLegend() {
    if (!dom.legend || !dom.legendWrap) return;
    dom.legend.replaceChildren();
    const entries = Object.entries(state.graph?.categoryColors || {}).sort(([a], [b]) => a.localeCompare(b));
    dom.legendWrap.hidden = !entries.length;
    for (const [name, color] of entries) {
      const item = document.createElement('span');
      item.className = 'legend-item';
      item.innerHTML = `<span class="legend-swatch" style="background:${escapeHtml(color)}"></span><span>${escapeHtml(name)}</span>`;
      dom.legend.appendChild(item);
    }
    if (dom.legendTitle) dom.legendTitle.textContent = `Color by ${state.settings.color_by}`;
  }

  function showNodeTooltip(event, node) {
    const percent = state.graph?.root?.count ? node.count / state.graph.root.count * 100 : 0;
    const taxid = node.taxid || (node.id.startsWith('taxid:') ? node.id.slice(6) : '');
    dom.tooltip.innerHTML = `
      <strong>${escapeHtml(node.displayName)}</strong>
      <div class="tooltip-grid">
        <span>Rank</span><b>${escapeHtml(node.rank)}</b>
        ${taxid ? `<span>TaxID</span><b>${escapeHtml(taxid)}</b>` : ''}
        <span>Proteins</span><b>${formatNumber(node.count)}</b>
        <span>Fraction</span><b>${formatPercent(percent)}</b>
        <span>Color group</span><b>${escapeHtml(node.colorCategory || '')}</b>
        <span>Action</span><b>${escapeHtml(node.override?.action || 'auto')}</b>
      </div>`;
    dom.tooltip.hidden = false;
    moveTooltip(event);
  }

  function showLinkTooltip(event, link) {
    const percent = state.graph?.root?.count ? link.count / state.graph.root.count * 100 : 0;
    dom.tooltip.innerHTML = `
      <strong>${escapeHtml(link.source.displayName)} → ${escapeHtml(link.target.displayName)}</strong>
      <div class="tooltip-grid">
        <span>Proteins</span><b>${formatNumber(link.count)}</b>
        <span>Fraction</span><b>${formatPercent(percent)}</b>
        <span>Source rank</span><b>${escapeHtml(link.source.rank)}</b>
        <span>Target rank</span><b>${escapeHtml(link.target.rank)}</b>
      </div>`;
    dom.tooltip.hidden = false;
    moveTooltip(event);
  }

  function moveTooltip(event) {
    if (!dom.tooltip || dom.tooltip.hidden) return;
    const margin = 14;
    const rect = dom.tooltip.getBoundingClientRect();
    let left = event.clientX + 14;
    let top = event.clientY + 14;
    if (left + rect.width > window.innerWidth - margin) left = event.clientX - rect.width - 14;
    if (top + rect.height > window.innerHeight - margin) top = event.clientY - rect.height - 14;
    dom.tooltip.style.left = `${Math.max(margin, left)}px`;
    dom.tooltip.style.top = `${Math.max(margin, top)}px`;
  }

  function hideTooltip() {
    if (dom.tooltip) dom.tooltip.hidden = true;
  }

  function descendants(node) {
    const set = new Set();
    function visit(current) {
      set.add(current.id);
      for (const child of current.children.values()) visit(child);
    }
    visit(node);
    return set;
  }

  function ancestors(node) {
    const set = new Set();
    let current = node;
    while (current && current.id !== '__root__') { set.add(current.id); current = current.parent; }
    return set;
  }

  function findGraphNode(id) {
    return state.graph?.nodes.find(node => node.id === id) || null;
  }

  function selectNode(id) {
    state.selectedNodeId = state.selectedNodeId === id ? '' : id;
    applyHighlightState();
    renderSelection();
    emit('selection', { node: findGraphNode(state.selectedNodeId), id: state.selectedNodeId });
  }

  function clearSelection() {
    state.selectedNodeId = '';
    applyHighlightState();
    renderSelection();
    emit('selection', { node: null, id: '' });
  }

  function applyHighlightState() {
    if (!state.graph) return;
    const selected = findGraphNode(state.selectedNodeId);
    const related = selected ? new Set([...ancestors(selected), ...descendants(selected)]) : new Set();
    const matches = state.searchMatches;
    const hasSearch = Boolean(state.searchQuery.trim());
    for (const node of state.graph.nodes) {
      const selectedRelated = !selected || related.has(node.id);
      const searchRelated = !hasSearch || matches.has(node.id);
      node.element?.classList.toggle('is-selected', Boolean(selected && node.id === selected.id));
      node.element?.classList.toggle('is-muted', !(selectedRelated && searchRelated));
    }
    for (const link of state.graph.links) {
      const selectedRelated = !selected || (related.has(link.source.id) && related.has(link.target.id));
      const searchRelated = !hasSearch || matches.has(link.source.id) || matches.has(link.target.id);
      link.element?.classList.toggle('is-selected', Boolean(selected && (link.source.id === selected.id || link.target.id === selected.id)));
      link.element?.classList.toggle('is-muted', !(selectedRelated && searchRelated));
    }
  }

  function renderSelection() {
    if (!dom.selectionPanel) return;
    const node = findGraphNode(state.selectedNodeId);
    dom.selectionPanel.hidden = !node;
    if (!node) return;
    const percent = state.graph?.root?.count ? node.count / state.graph.root.count * 100 : 0;
    if (dom.selectionTitle) dom.selectionTitle.textContent = node.displayName;
    if (dom.selectionName) dom.selectionName.textContent = node.name;
    if (dom.selectionTaxid) dom.selectionTaxid.textContent = node.taxid || '—';
    if (dom.selectionRank) dom.selectionRank.textContent = node.rank;
    if (dom.selectionCount) dom.selectionCount.textContent = formatNumber(node.count);
    if (dom.selectionPercent) dom.selectionPercent.textContent = formatPercent(percent);
    if (dom.downloadSelection) dom.downloadSelection.disabled = !node.members?.length;
  }

  function updateStatus() {
    if (!dom.status) return;
    const totalRows = state.resolvedRows.length;
    if (!state.loaded) {
      dom.status.textContent = 'No taxonomy data loaded';
      if (dom.substatus) dom.substatus.textContent = '';
      return;
    }
    const graph = state.graph;
    dom.status.textContent = graph
      ? `${formatNumber(graph.root.count)} proteins · ${formatNumber(graph.nodes.length)} nodes · ${formatNumber(graph.links.length)} flows`
      : `${formatNumber(totalRows)} proteins`;
    if (dom.substatus) {
      const uniqueTaxids = new Set(state.resolvedRows.map(row => row.resolvedTaxid || row.inputTaxid).filter(Boolean)).size;
      const resolver = state.source.resolver || 'input-classification';
      dom.substatus.textContent = `${formatNumber(uniqueTaxids)} terminal TaxIDs · ${resolver}`;
    }
  }

  function performSearch(query) {
    state.searchQuery = String(query || '').trim().toLowerCase();
    state.searchMatches.clear();
    if (state.searchQuery && state.graph) {
      for (const node of state.graph.nodes) {
        const haystack = [node.displayName, node.name, node.rank, node.id, node.taxid, ...(node.members || [])].join('\u0000').toLowerCase();
        if (haystack.includes(state.searchQuery)) state.searchMatches.add(node.id);
      }
    }
    if (dom.searchCount) dom.searchCount.textContent = state.searchQuery ? `${state.searchMatches.size} matching node${state.searchMatches.size === 1 ? '' : 's'}` : '';
    if (dom.searchClear) dom.searchClear.hidden = !state.searchQuery;
    applyHighlightState();
  }

  function updateTransform() {
    if (!dom.world) return;
    const { x, y, scale } = state.transform;
    dom.world.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);
    if (dom.zoomValue) dom.zoomValue.textContent = `${Math.round(scale * 100)}%`;
  }

  function fitView() {
    if (!state.graph || !dom.viewport) return;
    const viewportWidth = Math.max(1, dom.viewport.clientWidth);
    const viewportHeight = Math.max(1, dom.viewport.clientHeight);
    const padding = 18;
    const scale = Math.min(
      (viewportWidth - padding * 2) / state.graph.width,
      (viewportHeight - padding * 2) / state.graph.height,
      1.45
    );
    state.transform.scale = Math.max(0.08, scale);
    state.transform.x = (viewportWidth - state.graph.width * state.transform.scale) / 2;
    state.transform.y = (viewportHeight - state.graph.height * state.transform.scale) / 2;
    updateTransform();
  }

  function zoomAt(factor, clientX, clientY) {
    if (!dom.viewport) return;
    const rect = dom.viewport.getBoundingClientRect();
    const px = clientX ?? rect.left + rect.width / 2;
    const py = clientY ?? rect.top + rect.height / 2;
    const localX = px - rect.left;
    const localY = py - rect.top;
    const oldScale = state.transform.scale;
    const newScale = Math.max(0.06, Math.min(12, oldScale * factor));
    const worldX = (localX - state.transform.x) / oldScale;
    const worldY = (localY - state.transform.y) / oldScale;
    state.transform.x = localX - worldX * newScale;
    state.transform.y = localY - worldY * newScale;
    state.transform.scale = newScale;
    updateTransform();
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
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  function downloadSelectedPids() {
    const node = findGraphNode(state.selectedNodeId);
    if (!node?.members?.length) return;
    const unique = [...new Set(node.members)].sort();
    const slug = node.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'taxon';
    downloadBlob(`${slug}-proteins.txt`, `${unique.join('\n')}\n`);
  }

  function resolvedHeaders() {
    const base = ['pid', 'input_taxid', 'resolved_taxid', 'status', 'scientific_name', 'rank', 'lineage_taxids', 'lineage_names', 'lineage_ranks', 'input_classification', 'discrepancy'];
    for (const rank of ['domain', 'realm', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species']) base.push(`${rank}_taxid`, `${rank}_name`);
    return base;
  }

  function serializeResolvedTsv(rows = state.resolvedRows) {
    const headers = resolvedHeaders();
    const lines = [headers.join('\t')];
    for (const row of rows) {
      const object = {
        pid: row.pid,
        input_taxid: row.inputTaxid,
        resolved_taxid: row.resolvedTaxid,
        status: row.status,
        scientific_name: row.scientificName,
        rank: row.rank,
        lineage_taxids: row.lineageTaxids.join(' | '),
        lineage_names: row.lineageNames.join(' | '),
        lineage_ranks: row.lineageRanks.join(' | '),
        input_classification: row.inputClassification || '',
        discrepancy: row.discrepancy || ''
      };
      for (const rank of ['domain', 'realm', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species']) {
        object[`${rank}_taxid`] = row.standard?.[rank]?.id || '';
        object[`${rank}_name`] = row.standard?.[rank]?.name || '';
      }
      lines.push(headers.map(header => quoteTsv(object[header] ?? '')).join('\t'));
    }
    return `${lines.join('\n')}\n`;
  }

  function serializeResolutionReport() {
    const headers = ['pid', 'input_taxid', 'resolved_taxid', 'status', 'input_classification', 'resolved_classification', 'difference'];
    const lines = [headers.join('\t')];
    const rows = state.resolutionReport.length ? state.resolutionReport : state.resolvedRows.map(row => ({
      pid: row.pid,
      inputTaxid: row.inputTaxid,
      resolvedTaxid: row.resolvedTaxid,
      status: row.status,
      inputClassification: row.inputClassification,
      resolvedClassification: row.lineageNames.join('; '),
      difference: row.discrepancy || ''
    }));
    for (const row of rows) {
      lines.push([
        row.pid, row.inputTaxid, row.resolvedTaxid, row.status,
        row.inputClassification || '', row.resolvedClassification || '', row.difference || ''
      ].map(quoteTsv).join('\t'));
    }
    return `${lines.join('\n')}\n`;
  }

  function classifyDifference(inputClassification, officialNames) {
    const input = String(inputClassification || '').split(';').map(value => value.trim().toLowerCase()).filter(Boolean);
    const official = (officialNames || []).map(value => String(value).trim().toLowerCase()).filter(Boolean);
    if (!input.length) return 'No input classification supplied.';
    const inputSet = new Set(input);
    const officialSet = new Set(official);
    const onlyInput = input.filter(value => !officialSet.has(value));
    const onlyOfficial = official.filter(value => !inputSet.has(value));
    if (!onlyInput.length && !onlyOfficial.length) return '';
    const parts = [];
    if (onlyInput.length) parts.push(`Input-only: ${onlyInput.join(', ')}`);
    if (onlyOfficial.length) parts.push(`Resolved-only: ${onlyOfficial.join(', ')}`);
    return parts.join(' | ');
  }

  function reportTaxonomyObject(report) {
    return report?.taxonomy || report?.taxon || report?.node || report || null;
  }

  function reportName(taxonomy) {
    return taxonomy?.currentScientificName?.name || taxonomy?.current_scientific_name?.name || taxonomy?.scientificName || taxonomy?.scientific_name || taxonomy?.name || '';
  }

  function reportTaxid(taxonomy) {
    return String(taxonomy?.taxId ?? taxonomy?.tax_id ?? taxonomy?.id ?? '').trim();
  }

  function reportRank(taxonomy) {
    return normalizeRank(taxonomy?.rank || 'no rank');
  }

  async function fetchNcbiReports(ids, apiKey = '', progress = () => {}) {
    const unique = [...new Set(ids.map(String).filter(value => /^\d+$/.test(value)))];
    const reports = [];
    const batchSize = 40;
    for (let i = 0; i < unique.length; i += batchSize) {
      const batch = unique.slice(i, i + batchSize);
      const endpoint = `https://api.ncbi.nlm.nih.gov/datasets/v2/taxonomy/taxon/${batch.join(',')}/dataset_report?returned_content=COMPLETE`;
      const headers = { Accept: 'application/json' };
      if (apiKey) headers['api-key'] = apiKey;
      const response = await fetch(endpoint, { headers, mode: 'cors', cache: 'no-store' });
      if (!response.ok) throw new Error(`NCBI Datasets returned HTTP ${response.status} for ${batch.length} TaxID${batch.length === 1 ? '' : 's'}.`);
      const data = await response.json();
      const batchReports = data.reports || data.taxonomy_nodes || data.taxonomyNodes || data.results || [];
      if (!Array.isArray(batchReports)) throw new Error('The NCBI Datasets response did not contain a reports array.');
      reports.push(...batchReports);
      progress(Math.min(0.95, (i + batch.length) / unique.length), `Resolved ${Math.min(unique.length, i + batch.length)} of ${unique.length} TaxIDs…`);
      if (i + batchSize < unique.length) await new Promise(resolve => setTimeout(resolve, apiKey ? 110 : 360));
    }
    return reports;
  }

  function reportsToMap(reports) {
    const map = new Map();
    for (const report of reports) {
      const taxonomy = reportTaxonomyObject(report);
      const taxid = reportTaxid(taxonomy);
      if (!taxid) continue;
      const entry = {
        taxid,
        name: reportName(taxonomy) || `TaxID ${taxid}`,
        rank: reportRank(taxonomy),
        parents: (taxonomy.parents || taxonomy.parentTaxIds || taxonomy.parent_tax_ids || []).map(String),
        classification: taxonomy.classification || {},
        queries: Array.isArray(report.query) ? report.query.map(String) : (report.query ? [String(report.query)] : []),
        raw: taxonomy
      };
      map.set(taxid, entry);
      for (const query of entry.queries) if (/^\d+$/.test(query)) map.set(`query:${query}`, entry);
    }
    return map;
  }

  function orderParentIds(parentIds) {
    const ids = [...parentIds].map(String).filter(Boolean);
    if (ids[0] === '1' || ids[0] === '131567') return ids;
    if (ids[ids.length - 1] === '1' || ids[ids.length - 1] === '131567') return ids.reverse();
    return ids;
  }

  function standardFromClassification(classification = {}) {
    const standard = {};
    for (const rank of [...STANDARD_RANKS, 'realm']) {
      const source = classification[rank] || (rank === 'domain' ? classification.superkingdom : null);
      standard[rank] = source ? { id: String(source.id ?? source.taxId ?? ''), name: String(source.name || '') } : { id: '', name: '' };
    }
    return standard;
  }

  async function resolveWithNcbi(rawRows, options = {}) {
    const progress = typeof options.progress === 'function' ? options.progress : () => {};
    const apiKey = String(options.apiKey || '').trim();
    const requested = [...new Set(rawRows.map(row => row.taxid).filter(value => /^\d+$/.test(value)))];
    if (!requested.length) throw new Error('No valid numeric TaxIDs were found in the input table.');
    progress(0.02, `Requesting ${requested.length} terminal TaxIDs from NCBI Datasets…`);
    const leafReports = await fetchNcbiReports(requested, apiKey, (fraction, message) => progress(fraction * 0.35, message));
    const leafMap = reportsToMap(leafReports);
    const parentIds = new Set();
    for (const report of leafReports) {
      const taxonomy = reportTaxonomyObject(report);
      for (const id of taxonomy?.parents || []) parentIds.add(String(id));
    }
    const missingParents = [...parentIds].filter(id => !leafMap.has(id));
    progress(0.38, `Requesting ${missingParents.length} parent nodes for complete lineages…`);
    const parentReports = missingParents.length
      ? await fetchNcbiReports(missingParents, apiKey, (fraction, message) => progress(0.38 + fraction * 0.52, message))
      : [];
    const map = reportsToMap([...leafReports, ...parentReports]);
    const fallback = buildFallbackResolution(rawRows);
    const fallbackByPid = new Map(fallback.map(row => [row.pid, row]));
    const resolved = [];
    const resolutionReport = [];

    for (const input of rawRows) {
      const leaf = map.get(`query:${input.taxid}`) || map.get(input.taxid);
      if (!leaf) {
        const row = fallbackByPid.get(input.pid);
        row.status = 'unresolved';
        row.discrepancy = 'TaxID was not returned by NCBI Datasets; input classification retained.';
        resolved.push(row);
        resolutionReport.push({
          pid: input.pid, inputTaxid: input.taxid, resolvedTaxid: input.taxid, status: 'unresolved',
          inputClassification: input.classification, resolvedClassification: row.lineageNames.join('; '), difference: row.discrepancy
        });
        continue;
      }
      const parentIdsOrdered = orderParentIds(leaf.parents);
      const lineageEntries = [];
      for (const id of parentIdsOrdered) {
        const parent = map.get(id);
        if (parent) lineageEntries.push(parent);
        else lineageEntries.push({ taxid: id, name: `TaxID ${id}`, rank: 'no rank' });
      }
      if (!lineageEntries.length || lineageEntries[lineageEntries.length - 1].taxid !== leaf.taxid) lineageEntries.push(leaf);
      const lineageTaxids = lineageEntries.map(entry => entry.taxid);
      const lineageNames = lineageEntries.map(entry => entry.name);
      const lineageRanks = lineageEntries.map(entry => entry.rank);
      const difference = classifyDifference(input.classification, lineageNames);
      const status = leaf.taxid !== input.taxid ? 'merged' : 'resolved';
      const row = {
        pid: input.pid,
        inputTaxid: input.taxid,
        resolvedTaxid: leaf.taxid,
        status,
        scientificName: leaf.name,
        rank: leaf.rank,
        lineageTaxids,
        lineageNames,
        lineageRanks,
        standard: standardFromClassification(leaf.classification),
        inputClassification: input.classification,
        discrepancy: difference
      };
      resolved.push(row);
      resolutionReport.push({
        pid: input.pid, inputTaxid: input.taxid, resolvedTaxid: leaf.taxid, status,
        inputClassification: input.classification, resolvedClassification: lineageNames.join('; '), difference
      });
    }
    progress(1, `Resolved ${resolved.filter(row => row.status !== 'unresolved').length} of ${resolved.length} proteins.`);
    return { rows: resolved, report: resolutionReport, resolver: 'ncbi-datasets-api' };
  }

  function resolvedFromTaxonomyMap(rawRows, map, resolverName) {
    const fallback = buildFallbackResolution(rawRows);
    const fallbackByPid = new Map(fallback.map(row => [row.pid, row]));
    const resolved = [];
    const report = [];
    for (const input of rawRows) {
      let leaf = map.get(`query:${input.taxid}`) || map.get(input.taxid);
      if (!leaf) {
        const row = fallbackByPid.get(input.pid);
        row.status = 'unresolved';
        row.discrepancy = `TaxID was not found in ${resolverName}; input classification retained.`;
        resolved.push(row);
        report.push({ pid: input.pid, inputTaxid: input.taxid, resolvedTaxid: input.taxid, status: row.status, inputClassification: input.classification, resolvedClassification: row.lineageNames.join('; '), difference: row.discrepancy });
        continue;
      }
      const parents = leaf.parents?.length ? orderParentIds(leaf.parents) : [];
      let lineageEntries = [];
      if (parents.length) {
        lineageEntries = parents.map(id => map.get(id) || { taxid: id, name: `TaxID ${id}`, rank: 'no rank' });
      } else if (leaf.parent) {
        const reversed = [];
        const seen = new Set();
        let current = leaf;
        while (current && !seen.has(current.taxid)) {
          seen.add(current.taxid);
          reversed.push(current);
          if (!current.parent || current.parent === current.taxid) break;
          current = map.get(current.parent);
        }
        lineageEntries = reversed.reverse();
        leaf = lineageEntries[lineageEntries.length - 1] || leaf;
      }
      if (!lineageEntries.length || lineageEntries[lineageEntries.length - 1].taxid !== leaf.taxid) lineageEntries.push(leaf);
      const names = lineageEntries.map(entry => entry.name || `TaxID ${entry.taxid}`);
      const taxids = lineageEntries.map(entry => String(entry.taxid));
      const ranks = lineageEntries.map(entry => normalizeRank(entry.rank));
      const standard = leaf.classification ? standardFromClassification(leaf.classification) : deriveStandardFromLineage(taxids, names, ranks);
      const difference = classifyDifference(input.classification, names);
      const status = leaf.taxid !== input.taxid ? 'merged' : 'resolved';
      const row = {
        pid: input.pid,
        inputTaxid: input.taxid,
        resolvedTaxid: leaf.taxid,
        status,
        scientificName: leaf.name,
        rank: normalizeRank(leaf.rank),
        lineageTaxids: taxids,
        lineageNames: names,
        lineageRanks: ranks,
        standard,
        inputClassification: input.classification,
        discrepancy: difference
      };
      resolved.push(row);
      report.push({ pid: input.pid, inputTaxid: input.taxid, resolvedTaxid: leaf.taxid, status, inputClassification: input.classification, resolvedClassification: names.join('; '), difference });
    }
    return { rows: resolved, report };
  }

  function deriveStandardFromLineage(ids, names, ranks) {
    const standard = {};
    for (const rank of [...STANDARD_RANKS, 'realm']) standard[rank] = { id: '', name: '' };
    ids.forEach((id, index) => {
      const rank = normalizeRank(ranks[index]);
      if (standard[rank] && !standard[rank].name) standard[rank] = { id: String(id), name: names[index] || '' };
    });
    return standard;
  }

  function findZipEntry(zip, pattern) {
    const names = Object.keys(zip.files).filter(name => !zip.files[name].dir);
    return names.find(name => pattern.test(name)) || '';
  }

  async function resolveFromSnapshot(file, rawRows, options = {}) {
    if (!window.JSZip) throw new Error('JSZip is required to read an NCBI snapshot ZIP.');
    const progress = typeof options.progress === 'function' ? options.progress : () => {};
    progress(0.02, 'Opening taxonomy snapshot…');
    const zip = await window.JSZip.loadAsync(file);

    const resolvedPath = findZipEntry(zip, /(^|\/)taxonomy-resolved\.tsv$/i);
    if (resolvedPath) {
      progress(0.35, 'Reading taxonomy-resolved.tsv from the snapshot…');
      const parsed = parseResolvedTaxonomyTsv(await zip.file(resolvedPath).async('string'));
      const byPid = new Map(parsed.rows.map(row => [row.pid, row]));
      const rows = rawRows.map(input => byPid.get(input.pid) || buildFallbackResolution([input])[0]);
      progress(1, `Loaded ${rows.length} resolved rows from the snapshot.`);
      return { rows, report: rows.map(row => ({ pid: row.pid, inputTaxid: row.inputTaxid, resolvedTaxid: row.resolvedTaxid, status: row.status, inputClassification: row.inputClassification, resolvedClassification: row.lineageNames.join('; '), difference: row.discrepancy })), resolver: 'resolved-tsv-snapshot' };
    }

    const reportPath = findZipEntry(zip, /(^|\/)taxonomy_report\.jsonl$/i);
    if (reportPath) {
      progress(0.2, 'Reading NCBI Datasets taxonomy_report.jsonl…');
      const text = await zip.file(reportPath).async('string');
      const reports = [];
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try { reports.push(JSON.parse(line)); } catch { /* skip malformed line */ }
      }
      const map = reportsToMap(reports);
      if (!map.size) throw new Error('No taxonomy records were found in taxonomy_report.jsonl.');
      const result = resolvedFromTaxonomyMap(rawRows, map, 'NCBI Datasets snapshot');
      progress(1, `Resolved ${result.rows.filter(row => row.status !== 'unresolved').length} of ${result.rows.length} proteins from the snapshot.`);
      return { ...result, resolver: 'ncbi-datasets-snapshot' };
    }

    const nodesPath = findZipEntry(zip, /(^|\/)nodes\.dmp$/i);
    const namesPath = findZipEntry(zip, /(^|\/)names\.dmp$/i);
    if (nodesPath && namesPath) {
      progress(0.12, 'Reading nodes.dmp…');
      const nodesText = await zip.file(nodesPath).async('string');
      progress(0.38, 'Reading names.dmp…');
      const namesText = await zip.file(namesPath).async('string');
      const mergedPath = findZipEntry(zip, /(^|\/)merged\.dmp$/i);
      const deletedPath = findZipEntry(zip, /(^|\/)delnodes\.dmp$/i);
      const mergedText = mergedPath ? await zip.file(mergedPath).async('string') : '';
      const deletedText = deletedPath ? await zip.file(deletedPath).async('string') : '';
      progress(0.5, 'Indexing the NCBI taxonomy dump…');
      const map = parseTaxdump(nodesText, namesText, mergedText, deletedText);
      const result = resolvedFromTaxonomyMap(rawRows, map, 'NCBI taxdump snapshot');
      progress(1, `Resolved ${result.rows.filter(row => row.status !== 'unresolved').length} of ${result.rows.length} proteins from taxdump.`);
      return { ...result, resolver: 'ncbi-taxdump-snapshot' };
    }

    throw new Error('The ZIP does not contain taxonomy-resolved.tsv, an NCBI taxonomy_report.jsonl, or the nodes.dmp + names.dmp taxdump pair.');
  }

  function parseDmpFields(line) {
    return line.split(/\t\|\t|\t\|$/).map(value => value.trim());
  }

  function parseTaxdump(nodesText, namesText, mergedText = '', deletedText = '') {
    const names = new Map();
    for (const line of namesText.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const fields = parseDmpFields(line);
      if (fields[3] === 'scientific name') names.set(fields[0], fields[1]);
    }
    const map = new Map();
    for (const line of nodesText.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const fields = parseDmpFields(line);
      const taxid = fields[0];
      map.set(taxid, {
        taxid,
        parent: fields[1],
        rank: normalizeRank(fields[2]),
        name: names.get(taxid) || `TaxID ${taxid}`,
        classification: null,
        parents: []
      });
    }
    for (const line of mergedText.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const [oldId, newId] = parseDmpFields(line);
      const current = map.get(newId);
      if (current) map.set(`query:${oldId}`, current);
    }
    for (const line of deletedText.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const [taxid] = parseDmpFields(line);
      map.set(`deleted:${taxid}`, { taxid, deleted: true });
    }
    return map;
  }

  function setResolvedRows(rows, metadata = {}) {
    state.resolvedRows = Array.isArray(rows) ? rows : [];
    if (metadata.resolver) state.source.resolver = metadata.resolver;
    if (metadata.resolvedAt) state.source.resolved_at = metadata.resolvedAt;
    if (metadata.note !== undefined) state.source.note = metadata.note;
    if (metadata.report) state.resolutionReport = metadata.report;
    rebuildNodeCatalog();
    state.loaded = true;
    renderGraph({ fit: true });
    emit('loaded', getPublicState());
  }

  async function loadData(payload = {}) {
    state.diagnostics = [];
    if (payload.rawText !== undefined) {
      const parsed = parseRawTaxonomyTsv(payload.rawText, payload.columns || {});
      state.rawRows = parsed.rows;
      state.diagnostics.push(...parsed.diagnostics);
      state.inputFileName = payload.rawName || '';
    }
    if (payload.yamlText) {
      applyCurationYaml(payload.yamlText);
      state.yamlFileName = payload.yamlName || '';
    } else if (payload.resetCuration) {
      state.settings = normalizeSettings(config.initialSettings || {});
      state.overrides = {};
    }
    if (payload.colorText) {
      state.colors = parseColorYaml(payload.colorText);
      state.colorFileName = payload.colorName || '';
    } else if (payload.resetColors) state.colors = {};

    // Remember the author-configured starting view. Reader controls can expand
    // or reduce taxonomic levels temporarily and return here without modifying
    // the publication YAML.
    state.configuredSettings = cloneSettings(state.settings);

    if (payload.resolvedText) {
      const parsed = parseResolvedTaxonomyTsv(payload.resolvedText);
      state.resolvedFileName = payload.resolvedName || '';
      setResolvedRows(parsed.rows, { resolver: payload.resolver || state.source.resolver || 'resolved-tsv' });
    } else if (state.rawRows.length) {
      const fallback = buildFallbackResolution(state.rawRows);
      state.resolutionReport = fallback.map(row => ({
        pid: row.pid, inputTaxid: row.inputTaxid, resolvedTaxid: row.resolvedTaxid,
        status: row.status, inputClassification: row.inputClassification,
        resolvedClassification: row.lineageNames.join('; '), difference: ''
      }));
      setResolvedRows(fallback, { resolver: 'input-classification' });
    } else {
      state.resolvedRows = [];
      state.nodeCatalog.clear();
      state.loaded = false;
      renderGraph();
    }
    return getPublicState();
  }

  async function loadFromUrls() {
    const fetchText = async url => {
      if (!url) return '';
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Could not load ${url} (${response.status}).`);
      const length = Number(response.headers.get('content-length') || 0);
      if (length > config.maxFileBytes) throw new Error(`${url} exceeds the configured file-size limit.`);
      return response.text();
    };
    setBusy(true, 'Loading taxonomy flow…');
    try {
      const [rawText, resolvedText, yamlText, colorText] = await Promise.all([
        fetchText(config.inputUrl), fetchText(config.resolvedUrl), fetchText(config.yamlUrl), fetchText(config.colorUrl)
      ]);
      await loadData({
        rawText: rawText || undefined,
        rawName: config.inputUrl ? config.inputUrl.split('/').pop() : '',
        resolvedText: resolvedText || undefined,
        resolvedName: config.resolvedUrl ? config.resolvedUrl.split('/').pop() : '',
        yamlText: yamlText || undefined,
        yamlName: config.yamlUrl ? config.yamlUrl.split('/').pop() : '',
        colorText: colorText || undefined,
        colorName: config.colorUrl ? config.colorUrl.split('/').pop() : ''
      });
    } catch (error) {
      console.error(error);
      state.diagnostics.push({ level: 'error', message: error.message });
      if (dom.status) dom.status.textContent = `Load error: ${error.message}`;
      emit('error', { error });
    } finally {
      setBusy(false);
    }
  }

  function setBusy(busy, message = 'Working…') {
    state.busy = Boolean(busy);
    if (dom.loadingOverlay) dom.loadingOverlay.hidden = !state.busy;
    if (dom.loadingMessage) dom.loadingMessage.textContent = message;
  }

  function getPublicState() {
    return {
      version: VERSION,
      rawRows: state.rawRows,
      resolvedRows: state.resolvedRows,
      nodeCatalog: state.nodeCatalog,
      settings: { ...state.settings, ranks: [...state.settings.ranks] },
      configuredSettings: cloneSettings(state.configuredSettings || state.settings),
      overrides: JSON.parse(JSON.stringify(state.overrides || {})),
      colors: { ...state.colors },
      source: { ...state.source },
      graph: state.graph,
      diagnostics: [...state.diagnostics],
      resolutionReport: [...state.resolutionReport],
      loaded: state.loaded
    };
  }

  function updateSettings(partial = {}, options = {}) {
    state.settings = normalizeSettings({ ...state.settings, ...partial });
    renderGraph({ fit: Boolean(options.fit) });
    emit('settings', { settings: state.settings });
  }

  function setOverride(id, value = {}) {
    if (!id) return;
    const clean = { ...(state.overrides[id] || {}), ...value };
    for (const key of Object.keys(clean)) if (clean[key] === '' || clean[key] === null || clean[key] === undefined || (key === 'action' && clean[key] === 'auto')) delete clean[key];
    if (Object.keys(clean).length) state.overrides[id] = clean;
    else delete state.overrides[id];
    rebuildNodeCatalog();
    renderGraph();
    emit('override', { id, value: state.overrides[id] || {} });
  }

  function replaceResolvedRows(rows, metadata = {}) {
    setResolvedRows(rows, metadata);
  }

  function bindViewerEvents() {
    dom.search?.addEventListener('input', () => performSearch(dom.search.value));
    dom.searchClear?.addEventListener('click', () => {
      dom.search.value = '';
      performSearch('');
      dom.search.focus();
    });
    dom.showLabels?.addEventListener('change', () => {
      state.showLabels = dom.showLabels.checked;
      renderGraph();
    });
    dom.countMode?.addEventListener('change', () => {
      state.countMode = dom.countMode.value;
      renderGraph();
    });
    dom.zoomIn?.addEventListener('click', () => zoomAt(1.28));
    dom.zoomOut?.addEventListener('click', () => zoomAt(1 / 1.28));
    dom.fit?.addEventListener('click', fitView);
    dom.heightScale?.addEventListener('input', () => {
      const percent = Math.max(20, Math.min(250, Number(dom.heightScale.value) || 100));
      if (dom.heightScaleValue) dom.heightScaleValue.textContent = `${percent}%`;
      window.clearTimeout(bindViewerEvents.heightTimer);
      bindViewerEvents.heightTimer = window.setTimeout(() => updateSettings({ height_scale: percent / 100 }, { fit: true }), 70);
    });
    dom.showOther?.addEventListener('change', () => {
      updateSettings({ collapse_other: !dom.showOther.checked }, { fit: true });
    });
    dom.hierarchyMode?.addEventListener('change', () => applyViewerLevelControls());
    dom.viewerRanks?.addEventListener('change', event => {
      if (event.target?.matches?.('input[type="checkbox"]')) applyViewerLevelControls();
    });
    dom.viewerIncludeUnclassified?.addEventListener('change', () => applyViewerLevelControls());
    dom.viewerShowNoRank?.addEventListener('change', () => applyViewerLevelControls());
    dom.ranksConfigured?.addEventListener('click', restoreConfiguredLevels);
    dom.ranksAllStandard?.addEventListener('click', () => {
      updateSettings({ mode: 'standard', ranks: [...STANDARD_RANKS] }, { fit: true });
    });
    dom.clearSelection?.addEventListener('click', clearSelection);
    dom.downloadSelection?.addEventListener('click', downloadSelectedPids);
    dom.viewport?.addEventListener('wheel', event => {
      event.preventDefault();
      zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
    }, { passive: false });
    dom.viewport?.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest?.('.sankey-node, .sankey-link')) return;
      state.dragging = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: state.transform.x, y: state.transform.y };
      dom.viewport.setPointerCapture?.(event.pointerId);
    });
    dom.viewport?.addEventListener('pointermove', event => {
      if (!state.dragging || state.dragging.pointerId !== event.pointerId) return;
      state.transform.x = state.dragging.x + event.clientX - state.dragging.startX;
      state.transform.y = state.dragging.y + event.clientY - state.dragging.startY;
      updateTransform();
    });
    const stopDrag = event => {
      if (state.dragging?.pointerId === event.pointerId) state.dragging = null;
    };
    dom.viewport?.addEventListener('pointerup', stopDrag);
    dom.viewport?.addEventListener('pointercancel', stopDrag);
    dom.svg?.addEventListener('click', clearSelection);
    window.addEventListener('resize', () => {
      if (!state.loaded) return;
      window.clearTimeout(bindViewerEvents.resizeTimer);
      bindViewerEvents.resizeTimer = window.setTimeout(() => renderGraph({ fit: true }), 140);
    });
  }

  function collectDom() {
    Object.assign(dom, {
      appTitle: document.getElementById('appTitle'),
      appSubtitle: document.getElementById('appSubtitle'),
      paperHeader: document.getElementById('paperHeader'),
      paperTitle: document.getElementById('paperTitleEl'),
      figureTitle: document.getElementById('figureTitleEl'),
      search: document.getElementById('taxonomySearch'),
      searchClear: document.getElementById('taxonomySearchClear'),
      searchCount: document.getElementById('taxonomySearchCount'),
      status: document.getElementById('taxonomyStatus'),
      substatus: document.getElementById('taxonomySubstatus'),
      showLabels: document.getElementById('taxonomyShowLabels'),
      countMode: document.getElementById('taxonomyCountMode'),
      zoomIn: document.getElementById('taxonomyZoomIn'),
      zoomOut: document.getElementById('taxonomyZoomOut'),
      zoomValue: document.getElementById('taxonomyZoomValue'),
      fit: document.getElementById('taxonomyFit'),
      heightScale: document.getElementById('taxonomyHeightScale'),
      heightScaleValue: document.getElementById('taxonomyHeightScaleValue'),
      showOther: document.getElementById('taxonomyShowOther'),
      hierarchyMode: document.getElementById('taxonomyHierarchyMode'),
      viewerRanks: document.getElementById('taxonomyViewerRanks'),
      viewerIncludeUnclassified: document.getElementById('taxonomyViewerIncludeUnclassified'),
      viewerShowNoRank: document.getElementById('taxonomyViewerShowNoRank'),
      ranksConfigured: document.getElementById('taxonomyRanksConfigured'),
      ranksAllStandard: document.getElementById('taxonomyRanksAllStandard'),
      rankSummary: document.getElementById('taxonomyRankSummary'),
      clearSelection: document.getElementById('taxonomyClearSelection'),
      viewport: document.getElementById('taxonomyViewport'),
      svg: document.getElementById('taxonomySvg'),
      world: document.getElementById('taxonomyWorld'),
      tooltip: document.getElementById('taxonomyTooltip'),
      legendWrap: document.getElementById('taxonomyLegendWrap'),
      legendTitle: document.getElementById('taxonomyLegendTitle'),
      legend: document.getElementById('taxonomyLegend'),
      selectionPanel: document.getElementById('taxonomySelectionPanel'),
      selectionTitle: document.getElementById('taxonomySelectionTitle'),
      selectionName: document.getElementById('taxonomySelectionName'),
      selectionTaxid: document.getElementById('taxonomySelectionTaxid'),
      selectionRank: document.getElementById('taxonomySelectionRank'),
      selectionCount: document.getElementById('taxonomySelectionCount'),
      selectionPercent: document.getElementById('taxonomySelectionPercent'),
      downloadSelection: document.getElementById('taxonomyDownloadSelection'),
      loadingOverlay: document.getElementById('taxonomyLoadingOverlay'),
      loadingMessage: document.getElementById('taxonomyLoadingMessage')
    });
  }

  function applyPageMetadata() {
    if (dom.appTitle) dom.appTitle.textContent = config.title;
    if (dom.appSubtitle) dom.appSubtitle.textContent = config.subtitle;
    document.title = config.title;
    if (config.paperTitle && dom.paperTitle) {
      dom.paperTitle.textContent = config.paperTitle;
      dom.paperTitle.hidden = false;
      dom.paperHeader.hidden = false;
    }
    if (config.figureTitle && dom.figureTitle) {
      dom.figureTitle.textContent = config.figureTitle;
      dom.figureTitle.hidden = false;
      dom.paperHeader.hidden = false;
    }
    const downloadResolved = document.getElementById('taxonomyDownloadResolved');
    const downloadYaml = document.getElementById('taxonomyDownloadYaml');
    const downloadColors = document.getElementById('taxonomyDownloadColors');
    const downloadInput = document.getElementById('taxonomyDownloadInput');
    if (downloadResolved && config.resolvedUrl) downloadResolved.href = config.resolvedUrl;
    if (downloadYaml && config.yamlUrl) downloadYaml.href = config.yamlUrl;
    if (downloadColors) { downloadColors.hidden = !config.colorUrl; if (config.colorUrl) downloadColors.href = config.colorUrl; }
    if (downloadInput) { downloadInput.hidden = !config.inputUrl; if (config.inputUrl) downloadInput.href = config.inputUrl; }
    state.showLabels = dom.showLabels ? dom.showLabels.checked : true;
    state.countMode = dom.countMode?.value || 'both';
    buildViewerRankControls();
    syncViewerRankControls();
  }

  function init() {
    collectDom();
    applyPageMetadata();
    bindViewerEvents();
    updateStatus();
    renderGraph();
    if (config.autoLoad) loadFromUrls();
    emit('ready', { version: VERSION });
  }

  window.TaxonomySankeyViewer = {
    version: VERSION,
    config,
    loadData,
    parseRawTaxonomyTsv,
    parseResolvedTaxonomyTsv,
    buildFallbackResolution,
    parseSimpleYaml,
    parseColorYaml,
    serializeResolvedTsv,
    serializeCurationYaml,
    serializeColorYaml,
    serializeResolutionReport,
    resolveWithNcbi,
    resolveFromSnapshot,
    replaceResolvedRows,
    updateSettings,
    setOverride,
    render: options => renderGraph(options),
    fit: fitView,
    selectNode,
    clearSelection,
    getState: getPublicState,
    downloadBlob
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
