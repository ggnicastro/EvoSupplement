(function (global) {
  'use strict';

  const VERSION = '1.2.0';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const DEFAULT_CONFIG = {
    title: 'Network Viewer',
    subtitle: 'Interactive association network',
    paperTitle: '',
    figureTitle: '',
    autoLoad: false,
    edgeUrl: '',
    nodeUrl: '',
    colorUrl: '',
    delimiter: '\t',
    edgeColumns: {
      source: 'source',
      target: 'target',
      type: 'edge_type',
      count: 'edge_count'
    },
    nodeFields: {
      label: 'Display_name',
      include: 'Include',
      group: 'Function',
      notes: 'Notes'
    },
    defaultMinimumCount: 5,
    defaultLayout: 'fruchterman-reingold',
    defaultNodeSize: 'weighted-degree',
    defaultShowLabels: true,
    defaultShowIsolates: false,
    defaultOnlyIncluded: true,
    defaultCommunityMethod: 'none',
    defaultCommunityResolution: 1.0,
    defaultCommunityWeighted: true,
    defaultCommunitySeed: 42,
    defaultCommunityIterations: 20,
    defaultColorBy: 'function',
    defaultGroupLayoutBy: 'function',
    layoutSeed: 20260929,
    fitAfterLayout: true,
    maxFileBytes: 32 * 1024 * 1024,
    maxNodes: 5000,
    maxAggregatedEdges: 30000,
    showDownloads: true
  };

  const AUTO_COLOR_HINTS = {
    'Arc2_FHA': '#86b7e8',
    'Arc2_classical': '#ef8e91',
    'Arc2_core': '#cf87c7',
    'Transcription': '#82c995',
    'Envelope': '#f2b46f',
    'Lipid_traff_T3': '#d7b57e',
    'Conflict': '#b99bd3',
    'Clp': '#e6bd43',
    'pep_tm': '#b9cb7e',
    'Pex': '#77cbc5',
    'Center': '#9ca3af',
    'Unassigned': '#b8c0cc'
  };

  const AUTO_PALETTE = [
    '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948',
    '#b07aa1', '#ff9da7', '#9c755f', '#bab0ab', '#6f93c3', '#d98c55',
    '#8f63a8', '#65a9a2', '#8fbb62', '#c5a13b', '#d16d75', '#8097ad'
  ];

  const state = {
    config: null,
    els: {},
    graph: null,
    visibleEdges: [],
    visibleNodes: [],
    nodeElements: new Map(),
    edgeElements: new Map(),
    selectedNodes: new Set(),
    selectedEdge: null,
    hoveredNode: null,
    hoveredEdge: null,
    searchMatches: new Set(),
    threshold: 5,
    showLabels: true,
    showIsolates: true,
    onlyIncluded: true,
    communityMethod: 'none',
    communityResolution: 1.0,
    communityWeighted: true,
    communitySeed: 42,
    communityIterations: 20,
    communityMembership: new Map(),
    communityStats: [],
    communityColors: new Map(),
    communityQuality: null,
    communityElapsedMs: 0,
    exportIncludeIsolates: false,
    colorBy: 'function',
    groupLayoutBy: 'function',
    scopeNodeCount: 0,
    scopeEdgeCount: 0,
    nodeSizeMode: 'weighted-degree',
    layoutName: 'fruchterman-reingold',
    camera: { x: 0, y: 0, k: 1 },
    pan: null,
    drag: null,
    resizeObserver: null,
    resizeTimer: null,
    sourceUrls: { edges: '', nodes: '', colors: '' },
    localNames: { edges: '', nodes: '', colors: '' },
    lastInputTexts: null,
    layoutRunning: false
  };

  function mergeConfig(base, extra) {
    const result = Object.assign({}, base, extra || {});
    result.edgeColumns = Object.assign({}, base.edgeColumns, extra && extra.edgeColumns ? extra.edgeColumns : {});
    result.nodeFields = Object.assign({}, base.nodeFields, extra && extra.nodeFields ? extra.nodeFields : {});
    return result;
  }

  function normalizeToken(value) {
    return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
  }

  function cleanText(value) {
    if (value == null) return '';
    const text = String(value).trim();
    if (!text || /^(?:\.?(?:nan)|null|none|undefined|~)$/i.test(text)) return '';
    return text;
  }

  function parseInclude(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    const text = normalizeToken(value);
    return text === '1' || text === 'true' || text === 'yes' || text === 'y' || text === 'include';
  }

  function splitYamlKeyValue(line) {
    let quote = '';
    let escaped = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\' && quote === '"') {
        escaped = true;
        continue;
      }
      if (quote) {
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === ':') {
        return [line.slice(0, i), line.slice(i + 1)];
      }
    }
    return [line, ''];
  }

  function stripYamlComment(raw) {
    const value = String(raw == null ? '' : raw);
    let quote = '';
    let escaped = false;
    for (let i = 0; i < value.length; i += 1) {
      const ch = value[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\' && quote === '"') {
        escaped = true;
        continue;
      }
      if (quote) {
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === '#' && (i === 0 || /\s/.test(value[i - 1]))) {
        return value.slice(0, i).trimEnd();
      }
    }
    return value;
  }

  function parseYamlScalar(raw) {
    let text = stripYamlComment(raw).trim();
    if (!text) return '';
    if (text[0] === '"' && text[text.length - 1] === '"') {
      try {
        return JSON.parse(text);
      } catch (_error) {
        return text.slice(1, -1);
      }
    }
    if (text[0] === "'" && text[text.length - 1] === "'") {
      return text.slice(1, -1).replace(/''/g, "'");
    }
    if (/^(?:true|yes|on)$/i.test(text)) return true;
    if (/^(?:false|no|off)$/i.test(text)) return false;
    if (/^(?:null|~)$/i.test(text)) return null;
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
      const number = Number(text);
      if (Number.isFinite(number)) return number;
    }
    return text;
  }

  /**
   * Parser for the deliberately simple YAML schema used by the network module:
   * a top-level mapping whose values are either scalars or one nested mapping
   * of scalar fields. It supports quoted strings, JSON-style escapes in double
   * quotes, booleans, numbers, nulls, and comments.
   */
  function parseFlatYaml(text) {
    const root = {};
    let currentKey = null;
    const lines = String(text == null ? '' : text).replace(/^\uFEFF/, '').split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const original = lines[lineIndex];
      if (!original.trim() || /^\s*#/.test(original)) continue;
      if (/\t/.test(original.slice(0, original.search(/\S|$/)))) {
        throw new Error(`Tabs are not allowed for YAML indentation (line ${lineIndex + 1}).`);
      }
      const indent = original.length - original.trimStart().length;
      const trimmed = original.trim();
      const pair = splitYamlKeyValue(trimmed);
      const rawKey = pair[0].trim();
      if (!rawKey) throw new Error(`Missing YAML key on line ${lineIndex + 1}.`);
      const key = String(parseYamlScalar(rawKey));
      const rawValue = pair[1];

      if (indent === 0) {
        if (!rawValue.trim()) {
          root[key] = {};
          currentKey = key;
        } else {
          root[key] = parseYamlScalar(rawValue);
          currentKey = null;
        }
      } else {
        if (!currentKey || typeof root[currentKey] !== 'object' || Array.isArray(root[currentKey])) {
          throw new Error(`Nested YAML field without a parent mapping on line ${lineIndex + 1}.`);
        }
        root[currentKey][key] = parseYamlScalar(rawValue);
      }
    }
    return root;
  }

  function parseDelimitedLine(line, delimiter) {
    const fields = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else if (ch === '"') {
          quoted = false;
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === delimiter) {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current);
    return fields;
  }

  function parseTsv(text, delimiter) {
    const lines = String(text == null ? '' : text).replace(/^\uFEFF/, '').split(/\r?\n/);
    let header = null;
    const rows = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (!lines[i].trim()) continue;
      const values = parseDelimitedLine(lines[i], delimiter);
      if (!header) {
        header = values.map((value) => value.trim());
        continue;
      }
      const row = {};
      header.forEach((column, index) => {
        row[column] = values[index] == null ? '' : values[index].trim();
      });
      row.__line = i + 1;
      rows.push(row);
    }
    if (!header) throw new Error('The edge table is empty.');
    return { header, rows };
  }

  function readColorMap(yamlObject) {
    if (!yamlObject || typeof yamlObject !== 'object') return new Map();
    const source = yamlObject.colors && typeof yamlObject.colors === 'object' ? yamlObject.colors : yamlObject;
    const result = new Map();
    Object.entries(source).forEach(([group, value]) => {
      let color = value;
      if (value && typeof value === 'object') color = value.color || value.Color || value.hex || value.fill;
      color = cleanText(color);
      if (/^#[0-9a-f]{3,8}$/i.test(color) || /^(?:rgb|hsl)a?\(/i.test(color)) {
        result.set(normalizeToken(group), color);
      }
    });
    return result;
  }

  function createAutoColorMap(groups, supplied) {
    const result = new Map();
    const sorted = Array.from(groups).sort((a, b) => a.localeCompare(b));
    let paletteIndex = 0;
    sorted.forEach((group) => {
      const normalized = normalizeToken(group);
      if (supplied.has(normalized)) {
        result.set(group, supplied.get(normalized));
      } else if (AUTO_COLOR_HINTS[group]) {
        result.set(group, AUTO_COLOR_HINTS[group]);
      } else {
        result.set(group, AUTO_PALETTE[paletteIndex % AUTO_PALETTE.length]);
        paletteIndex += 1;
      }
    });
    return result;
  }

  function pairKey(a, b) {
    return a.localeCompare(b) <= 0 ? `${a}\u0000${b}` : `${b}\u0000${a}`;
  }

  function buildGraph(edgeText, nodeText, colorText, config) {
    const nodeYaml = cleanText(nodeText) ? parseFlatYaml(nodeText) : {};
    const yamlEntries = [];
    const canonicalByNormalizedLabel = new Map();
    const allCanonicalNodes = new Map();
    const keyLookup = new Map();
    const yamlEntryLookup = new Map();
    const tsvEndpointLookup = new Map();
    const fields = config.nodeFields;

    function createNode(displayName, hasYaml) {
      return {
        id: displayName,
        label: displayName,
        aliases: [],
        inputTokens: [],
        groups: [],
        notes: [],
        sourceEntries: [],
        group: 'Unassigned',
        color: '',
        x: 0,
        y: 0,
        pinned: false,
        degree: 0,
        weightedDegree: 0,
        totalDegree: 0,
        totalWeightedDegree: 0,
        radius: 9,
        yamlIncluded: false,
        hasYaml: Boolean(hasYaml),
        referencedInEdges: false,
        communityId: null,
        communityLabel: ''
      };
    }

    function getOrCreateCanonical(displayName, hasYaml) {
      const normalizedLabel = normalizeToken(displayName);
      const existingId = canonicalByNormalizedLabel.get(normalizedLabel);
      let node = existingId ? allCanonicalNodes.get(existingId) : null;
      if (!node) {
        node = createNode(displayName, hasYaml);
        allCanonicalNodes.set(node.id, node);
        canonicalByNormalizedLabel.set(normalizedLabel, node.id);
      } else if (hasYaml) {
        node.hasYaml = true;
      }
      return node;
    }

    Object.entries(nodeYaml).forEach(([yamlKey, raw]) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
      const included = parseInclude(raw[fields.include]);
      const displayName = cleanText(raw[fields.label]) || yamlKey;
      const group = cleanText(raw[fields.group]) || 'Unassigned';
      const notes = cleanText(raw[fields.notes]);
      const node = getOrCreateCanonical(displayName, true);
      if (!node.aliases.includes(yamlKey)) node.aliases.push(yamlKey);
      if (!node.groups.includes(group)) node.groups.push(group);
      if (notes && !node.notes.includes(notes)) node.notes.push(notes);
      node.sourceEntries.push({ key: yamlKey, displayName, group, notes, included });
      node.yamlIncluded = node.yamlIncluded || included;
      const entry = { key: yamlKey, displayName, group, notes, included, canonicalId: node.id };
      keyLookup.set(normalizeToken(yamlKey), node.id);
      yamlEntryLookup.set(normalizeToken(yamlKey), entry);
      yamlEntries.push(entry);
    });

    allCanonicalNodes.forEach((node) => {
      const preferredIncluded = node.sourceEntries.find((entry) => entry.included && entry.group !== 'Unassigned');
      const preferredAny = node.sourceEntries.find((entry) => entry.group !== 'Unassigned');
      node.group = (preferredIncluded || preferredAny || { group: 'Unassigned' }).group;
    });

    const table = parseTsv(edgeText, config.delimiter);
    const edgeFields = config.edgeColumns;
    const required = [edgeFields.source, edgeFields.target, edgeFields.type, edgeFields.count];
    const missing = required.filter((field) => !table.header.includes(field));
    if (missing.length) throw new Error(`The edge table is missing required column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`);

    const aggregated = new Map();
    const unannotatedEndpoints = new Map();
    const invalidRows = [];
    const selfLoops = [];
    let acceptedRows = 0;

    function resolveEndpoint(token) {
      const displayName = cleanText(token);
      if (!displayName) return null;
      const normalized = normalizeToken(displayName);
      const knownId = keyLookup.get(normalized) || canonicalByNormalizedLabel.get(normalized);
      let node;
      if (knownId) {
        node = allCanonicalNodes.get(knownId);
      } else {
        node = getOrCreateCanonical(displayName, false);
        if (!node.aliases.includes(displayName)) node.aliases.push(displayName);
        keyLookup.set(normalized, node.id);
        unannotatedEndpoints.set(displayName, (unannotatedEndpoints.get(displayName) || 0) + 1);
      }
      if (!node.inputTokens.includes(displayName)) node.inputTokens.push(displayName);
      if (!tsvEndpointLookup.has(normalized)) {
        tsvEndpointLookup.set(normalized, {
          token: displayName,
          canonicalId: node.id,
          yamlEntry: yamlEntryLookup.get(normalized) || null
        });
      }
      return node.id;
    }

    table.rows.forEach((row) => {
      const rawSource = cleanText(row[edgeFields.source]);
      const rawTarget = cleanText(row[edgeFields.target]);
      const type = cleanText(row[edgeFields.type]) || 'Unspecified';
      const count = Number(row[edgeFields.count]);
      if (!rawSource || !rawTarget || !Number.isFinite(count) || count < 0) {
        invalidRows.push(row.__line);
        return;
      }
      const source = resolveEndpoint(rawSource);
      const target = resolveEndpoint(rawTarget);
      if (!source || !target) {
        invalidRows.push(row.__line);
        return;
      }
      const sourceNode = allCanonicalNodes.get(source);
      const targetNode = allCanonicalNodes.get(target);
      sourceNode.referencedInEdges = true;
      targetNode.referencedInEdges = true;
      acceptedRows += 1;
      if (source === target) {
        selfLoops.push({ source, target, rawSource, rawTarget, type, count, line: row.__line });
        return;
      }
      const key = pairKey(source, target);
      let edge = aggregated.get(key);
      if (!edge) {
        const ordered = source.localeCompare(target) <= 0 ? [source, target] : [target, source];
        edge = {
          id: key,
          source: ordered[0],
          target: ordered[1],
          totalCount: 0,
          typeTotals: new Map(),
          directionTotals: new Map(),
          rows: []
        };
        aggregated.set(key, edge);
      }
      edge.totalCount += count;
      edge.typeTotals.set(type, (edge.typeTotals.get(type) || 0) + count);
      const directionKey = `${source} → ${target}`;
      edge.directionTotals.set(directionKey, (edge.directionTotals.get(directionKey) || 0) + count);
      edge.rows.push({ source, target, rawSource, rawTarget, type, count, line: row.__line });
    });

    const relevantNodes = Array.from(allCanonicalNodes.values()).filter((node) => node.yamlIncluded || node.referencedInEdges);
    if (relevantNodes.length > config.maxNodes) {
      throw new Error(`The edge table and YAML produce ${relevantNodes.length.toLocaleString()} relevant display-name nodes; the configured limit is ${config.maxNodes.toLocaleString()}.`);
    }
    if (aggregated.size > config.maxAggregatedEdges) {
      throw new Error(`The table produces ${aggregated.size.toLocaleString()} undirected relationships; the configured limit is ${config.maxAggregatedEdges.toLocaleString()}.`);
    }

    const canonicalNodes = new Map(relevantNodes.map((node) => [node.id, node]));
    const edges = Array.from(aggregated.values()).filter((edge) => canonicalNodes.has(edge.source) && canonicalNodes.has(edge.target));
    const groups = new Set(relevantNodes.map((node) => node.group));
    const suppliedColors = colorText ? readColorMap(parseFlatYaml(colorText)) : new Map();
    const colors = createAutoColorMap(groups, suppliedColors);
    relevantNodes.forEach((node) => {
      node.color = colors.get(node.group) || AUTO_COLOR_HINTS.Unassigned;
    });

    const totalAdjacency = new Map(relevantNodes.map((node) => [node.id, new Set()]));
    const totalWeighted = new Map(relevantNodes.map((node) => [node.id, 0]));
    edges.forEach((edge) => {
      totalAdjacency.get(edge.source).add(edge.target);
      totalAdjacency.get(edge.target).add(edge.source);
      totalWeighted.set(edge.source, totalWeighted.get(edge.source) + edge.totalCount);
      totalWeighted.set(edge.target, totalWeighted.get(edge.target) + edge.totalCount);
    });
    relevantNodes.forEach((node) => {
      node.totalDegree = totalAdjacency.get(node.id).size;
      node.totalWeightedDegree = totalWeighted.get(node.id);
    });

    const mergedLabels = relevantNodes.filter((node) => node.sourceEntries.length > 1);
    const groupConflicts = relevantNodes.filter((node) => new Set(node.groups.filter((g) => g !== 'Unassigned')).size > 1);
    const maxEdgeCount = edges.reduce((max, edge) => Math.max(max, edge.totalCount), 1);
    const includedEntries = yamlEntries.filter((entry) => entry.included);
    const includedCanonicalNodes = relevantNodes.filter((node) => node.yamlIncluded);
    const referencedCanonicalNodes = relevantNodes.filter((node) => node.referencedInEdges);

    return {
      nodes: relevantNodes,
      nodeMap: canonicalNodes,
      edges,
      colors,
      maxEdgeCount,
      metadata: {
        hasNodeYaml: yamlEntries.length > 0,
        yamlEntryCount: yamlEntries.length,
        includedEntryCount: includedEntries.length,
        tsvEndpointCount: tsvEndpointLookup.size,
        tsvEndpoints: Array.from(tsvEndpointLookup.values()).sort((a, b) => a.token.localeCompare(b.token)),
        includedCanonicalNodeCount: includedCanonicalNodes.length,
        referencedCanonicalNodeCount: referencedCanonicalNodes.length,
        canonicalNodeCount: relevantNodes.length,
        mergedLabels,
        groupConflicts,
        inputRowCount: table.rows.length,
        acceptedRows,
        invalidRows,
        unannotatedEndpoints,
        selfLoops
      }
    };
  }


  function makeCommunityGraph(nodeCount, edgeTuples) {
    const adjacency = Array.from({ length: nodeCount }, () => new Map());
    const degree = Array(nodeCount).fill(0);
    const edgeList = [];
    let totalWeight = 0;
    edgeTuples.forEach((tuple) => {
      const a = Number(tuple[0]);
      const b = Number(tuple[1]);
      const weight = Number(tuple[2]);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= nodeCount || b >= nodeCount || !Number.isFinite(weight) || weight <= 0) return;
      edgeList.push([a, b, weight]);
      totalWeight += weight;
      if (a === b) {
        adjacency[a].set(a, (adjacency[a].get(a) || 0) + weight);
        degree[a] += weight * 2;
      } else {
        adjacency[a].set(b, (adjacency[a].get(b) || 0) + weight);
        adjacency[b].set(a, (adjacency[b].get(a) || 0) + weight);
        degree[a] += weight;
        degree[b] += weight;
      }
    });
    return { n: nodeCount, adjacency, degree, edgeList, totalWeight, twoM: totalWeight * 2 };
  }

  function createCommunityGraph(nodes, edges, weighted) {
    const index = new Map(nodes.map((node, position) => [node.id, position]));
    const tuples = [];
    edges.forEach((edge) => {
      const a = index.get(edge.source);
      const b = index.get(edge.target);
      if (!Number.isInteger(a) || !Number.isInteger(b)) return;
      const weight = weighted ? Math.max(0, Number(edge.totalCount) || 0) : 1;
      if (weight > 0) tuples.push([a, b, weight]);
    });
    return { graph: makeCommunityGraph(nodes.length, tuples), index };
  }

  function shuffledIndices(length, random) {
    const values = Array.from({ length }, (_value, index) => index);
    for (let i = values.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const temporary = values[i];
      values[i] = values[j];
      values[j] = temporary;
    }
    return values;
  }

  function renumberPartition(partition) {
    const remap = new Map();
    let next = 0;
    const dense = partition.map((community) => {
      if (!remap.has(community)) remap.set(community, next++);
      return remap.get(community);
    });
    return { partition: dense, count: next };
  }

  function localMoving(graph, resolution, seed, maxPasses, allowedGroups) {
    if (!graph.n || graph.totalWeight <= 0) return { partition: Array.from({ length: graph.n }, (_value, index) => index), count: graph.n, moved: false };
    const random = seededRandom(seed || 1);
    const community = Array.from({ length: graph.n }, (_value, index) => index);
    const totals = graph.degree.slice();
    let movedAtLeastOnce = false;
    const passes = Math.max(1, Math.min(250, Number(maxPasses) || 20));

    for (let pass = 0; pass < passes; pass += 1) {
      let movedThisPass = false;
      const order = shuffledIndices(graph.n, random);
      order.forEach((node) => {
        const current = community[node];
        const nodeDegree = graph.degree[node];
        if (nodeDegree <= 0) return;
        const neighborWeights = new Map();
        graph.adjacency[node].forEach((weight, neighbor) => {
          if (neighbor === node) return;
          if (allowedGroups && allowedGroups[neighbor] !== allowedGroups[node]) return;
          const candidate = community[neighbor];
          neighborWeights.set(candidate, (neighborWeights.get(candidate) || 0) + weight);
        });
        if (!neighborWeights.has(current)) neighborWeights.set(current, 0);
        totals[current] -= nodeDegree;
        let bestCommunity = current;
        let bestGain = 0;
        neighborWeights.forEach((weightIn, candidate) => {
          const gain = weightIn - resolution * nodeDegree * totals[candidate] / graph.twoM;
          if (gain > bestGain + 1e-10 || (Math.abs(gain - bestGain) <= 1e-10 && candidate < bestCommunity)) {
            bestGain = gain;
            bestCommunity = candidate;
          }
        });
        community[node] = bestCommunity;
        totals[bestCommunity] += nodeDegree;
        if (bestCommunity !== current) {
          movedThisPass = true;
          movedAtLeastOnce = true;
        }
      });
      if (!movedThisPass) break;
    }
    const dense = renumberPartition(community);
    dense.moved = movedAtLeastOnce;
    return dense;
  }

  function connectedComponentsWithin(graph, partition) {
    const components = Array(graph.n).fill(-1);
    let component = 0;
    for (let start = 0; start < graph.n; start += 1) {
      if (components[start] !== -1) continue;
      const expectedCommunity = partition[start];
      const queue = [start];
      components[start] = component;
      for (let head = 0; head < queue.length; head += 1) {
        const current = queue[head];
        graph.adjacency[current].forEach((weight, neighbor) => {
          if (weight <= 0 || neighbor === current || components[neighbor] !== -1 || partition[neighbor] !== expectedCommunity) return;
          components[neighbor] = component;
          queue.push(neighbor);
        });
      }
      component += 1;
    }
    return components;
  }

  function refineLeidenPartition(graph, coarsePartition, resolution, seed, maxPasses) {
    const connectedBlocks = connectedComponentsWithin(graph, coarsePartition);
    const refined = localMoving(graph, resolution, seed, maxPasses, connectedBlocks).partition;
    return renumberPartition(connectedComponentsWithin(graph, refined));
  }

  function aggregateCommunityGraph(graph, partition, members) {
    const dense = renumberPartition(partition);
    const nextMembers = Array.from({ length: dense.count }, () => []);
    members.forEach((memberList, node) => {
      nextMembers[dense.partition[node]].push(...memberList);
    });
    const edgeMap = new Map();
    graph.edgeList.forEach(([a, b, weight]) => {
      const ca = dense.partition[a];
      const cb = dense.partition[b];
      const low = Math.min(ca, cb);
      const high = Math.max(ca, cb);
      const key = `${low}\u0000${high}`;
      edgeMap.set(key, (edgeMap.get(key) || 0) + weight);
    });
    const tuples = Array.from(edgeMap.entries(), ([key, weight]) => {
      const parts = key.split('\u0000').map(Number);
      return [parts[0], parts[1], weight];
    });
    return { graph: makeCommunityGraph(dense.count, tuples), members: nextMembers };
  }

  function modularityForMembership(nodes, edges, membership, weighted, resolution) {
    if (!nodes.length || !edges.length) return 0;
    const degree = new Map(nodes.map((node) => [node.id, 0]));
    let totalWeight = 0;
    let internalWeight = new Map();
    edges.forEach((edge) => {
      const weight = weighted ? Math.max(0, Number(edge.totalCount) || 0) : 1;
      if (weight <= 0) return;
      totalWeight += weight;
      degree.set(edge.source, (degree.get(edge.source) || 0) + weight);
      degree.set(edge.target, (degree.get(edge.target) || 0) + weight);
      const sourceCommunity = membership.get(edge.source);
      const targetCommunity = membership.get(edge.target);
      if (sourceCommunity != null && sourceCommunity === targetCommunity) {
        internalWeight.set(sourceCommunity, (internalWeight.get(sourceCommunity) || 0) + weight);
      }
    });
    if (totalWeight <= 0) return 0;
    const communityDegree = new Map();
    degree.forEach((value, id) => {
      const community = membership.get(id);
      if (community == null) return;
      communityDegree.set(community, (communityDegree.get(community) || 0) + value);
    });
    let quality = 0;
    communityDegree.forEach((degreeSum, community) => {
      const internal = internalWeight.get(community) || 0;
      quality += internal / totalWeight - resolution * Math.pow(degreeSum / (2 * totalWeight), 2);
    });
    return quality;
  }

  function finalizeCommunityResult(nodes, edges, members, weighted, resolution) {
    const groups = members
      .filter((memberList) => memberList.length)
      .map((memberList) => memberList.slice().sort((a, b) => a.localeCompare(b)))
      .sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
    const membership = new Map();
    const communities = groups.map((memberList, index) => {
      const id = index;
      const label = `Community ${index + 1}`;
      memberList.forEach((nodeId) => membership.set(nodeId, id));
      return { id, label, size: memberList.length, members: memberList };
    });
    return {
      membership,
      communities,
      modularity: modularityForMembership(nodes, edges, membership, weighted, resolution)
    };
  }

  function detectCommunities(method, nodes, edges, options) {
    const weighted = options.weighted !== false;
    const resolution = Math.max(0.0001, Number(options.resolution) || 1);
    const seed = Number(options.seed) || 1;
    const passes = Math.max(1, Math.min(250, Number(options.iterations) || 20));
    const initial = createCommunityGraph(nodes, edges, weighted);
    let graph = initial.graph;
    let members = nodes.map((node) => [node.id]);
    if (!nodes.length) return finalizeCommunityResult(nodes, edges, members, weighted, resolution);
    if (graph.totalWeight <= 0) return finalizeCommunityResult(nodes, edges, members, weighted, resolution);

    for (let level = 0; level < 40 && graph.n > 1; level += 1) {
      const coarse = localMoving(graph, resolution, seed + level * 1009, passes);
      let selected = coarse;
      if (method === 'leiden') {
        selected = refineLeidenPartition(graph, coarse.partition, resolution, seed + level * 1009 + 503, passes);
      }
      if (selected.count >= graph.n) break;
      const aggregated = aggregateCommunityGraph(graph, selected.partition, members);
      graph = aggregated.graph;
      members = aggregated.members;
    }
    return finalizeCommunityResult(nodes, edges, members, weighted, resolution);
  }

  function communityColor(index) {
    if (index < AUTO_PALETTE.length) return AUTO_PALETTE[index];
    const hue = (index * 137.508 + 19) % 360;
    return `hsl(${hue.toFixed(1)} 58% 56%)`;
  }

  function activeLayoutGroup(node) {
    if (state.groupLayoutBy === 'community' && node.communityLabel) return node.communityLabel;
    if (state.groupLayoutBy === 'none') return 'All nodes';
    return node.group || 'Unassigned';
  }

  function activeColorCategory(node) {
    if (state.colorBy === 'community' && node.communityLabel) return node.communityLabel;
    return node.group || 'Unassigned';
  }

  function activeNodeColor(node) {
    if (state.colorBy === 'community' && node.communityLabel) {
      return state.communityColors.get(node.communityLabel) || AUTO_COLOR_HINTS.Unassigned;
    }
    return node.color || AUTO_COLOR_HINTS.Unassigned;
  }

  function activeCategoryColor(category) {
    if (state.colorBy === 'community') return state.communityColors.get(category) || AUTO_COLOR_HINTS.Unassigned;
    return state.graph.colors.get(category) || AUTO_COLOR_HINTS.Unassigned;
  }

  function recomputeVisibleCommunities() {
    state.communityMembership = new Map();
    state.communityStats = [];
    state.communityColors = new Map();
    state.communityQuality = null;
    state.communityElapsedMs = 0;
    state.visibleNodes.forEach((node) => {
      node.communityId = null;
      node.communityLabel = '';
    });
    if (state.communityMethod === 'none' || !state.visibleNodes.length) {
      if (state.colorBy === 'community') state.colorBy = 'function';
      if (state.groupLayoutBy === 'community') state.groupLayoutBy = 'function';
      updateCommunityControls();
      return;
    }
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const result = detectCommunities(state.communityMethod, state.visibleNodes, state.visibleEdges, {
      weighted: state.communityWeighted,
      resolution: state.communityResolution,
      seed: state.communitySeed,
      iterations: state.communityIterations
    });
    state.communityMembership = result.membership;
    state.communityStats = result.communities;
    state.communityQuality = result.modularity;
    result.communities.forEach((community, index) => {
      state.communityColors.set(community.label, communityColor(index));
    });
    state.visibleNodes.forEach((node) => {
      const communityId = result.membership.get(node.id);
      if (communityId == null) return;
      const community = result.communities[communityId];
      node.communityId = communityId;
      node.communityLabel = community ? community.label : `Community ${communityId + 1}`;
    });
    const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
    state.communityElapsedMs = Math.max(0, ended - started);
    updateCommunityControls();
  }


  function yamlQuoted(value) {
    return JSON.stringify(String(value == null ? '' : value));
  }

  function sanitizeFilenamePart(value) {
    const text = String(value == null ? '' : value).trim().toLowerCase();
    return text.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'network';
  }

  function downloadTextFile(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function currentExportModel() {
    if (!state.graph || state.communityMethod === 'none' || !state.communityStats.length) return null;
    const tsvCanonicalIds = new Set((state.graph.metadata.tsvEndpoints || []).map((endpoint) => endpoint.canonicalId));
    const connectedIds = new Set();
    state.visibleEdges.forEach((edge) => {
      if (tsvCanonicalIds.has(edge.source)) connectedIds.add(edge.source);
      if (tsvCanonicalIds.has(edge.target)) connectedIds.add(edge.target);
    });
    const includedIds = new Set(connectedIds);
    if (state.exportIncludeIsolates) {
      state.visibleNodes.forEach((node) => {
        if (tsvCanonicalIds.has(node.id)) includedIds.add(node.id);
      });
    }

    const orderedCommunities = state.communityStats
      .map((community) => ({
        sourceLabel: community.label,
        members: community.members.filter((id) => includedIds.has(id)).slice().sort((a, b) => a.localeCompare(b))
      }))
      .filter((community) => community.members.length)
      .sort((a, b) => b.members.length - a.members.length || a.members.join('\u0000').localeCompare(b.members.join('\u0000')));

    const communityNameByNode = new Map();
    const communityRows = orderedCommunities.map((community, index) => {
      const generatedName = `Community_${String(index + 1).padStart(2, '0')}`;
      community.members.forEach((id) => communityNameByNode.set(id, generatedName));
      return {
        sourceLabel: community.sourceLabel,
        generatedName,
        members: community.members,
        color: state.communityColors.get(community.sourceLabel) || communityColor(index)
      };
    });

    const endpoints = (state.graph.metadata.tsvEndpoints || []).map((endpoint) => {
      const node = state.graph.nodeMap.get(endpoint.canonicalId);
      const included = Boolean(node && includedIds.has(node.id));
      let notes = '';
      if (endpoint.yamlEntry && endpoint.yamlEntry.notes) notes = endpoint.yamlEntry.notes;
      else if (node && node.notes.length) notes = node.notes.join(' | ');
      return {
        key: endpoint.token,
        displayName: node ? node.label : endpoint.token,
        include: included ? 1 : 0,
        functionName: included ? (communityNameByNode.get(endpoint.canonicalId) || '') : '',
        notes
      };
    }).sort((a, b) => a.key.localeCompare(b.key));

    return {
      endpoints,
      communities: communityRows,
      includedCanonicalCount: includedIds.size,
      excludedEndpointCount: endpoints.filter((entry) => !entry.include).length
    };
  }

  function generatedNodeYaml(model) {
    const method = state.communityMethod === 'leiden' ? 'Leiden' : 'Louvain';
    const lines = [
      '# Generated by EvoSupplement Network Viewer 1.2.0',
      `# Community method: ${method}`,
      `# Minimum total edge count: ${state.threshold}`,
      `# Resolution: ${state.communityResolution}`,
      `# Edge weights: ${state.communityWeighted ? 'aggregated edge_count' : 'unweighted'}`,
      `# Seed: ${state.communitySeed}`,
      `# Iterations: ${state.communityIterations}`,
      `# Included canonical nodes: ${model.includedCanonicalCount}`,
      `# Detected communities represented in the export: ${model.communities.length}`,
      '# Review Display_name, Include, Function, and Notes before publication.',
      ''
    ];
    model.endpoints.forEach((entry) => {
      lines.push(`${yamlQuoted(entry.key)}:`);
      lines.push(`  Display_name: ${yamlQuoted(entry.displayName)}`);
      lines.push(`  Include: ${entry.include}`);
      lines.push(`  Function: ${yamlQuoted(entry.functionName)}`);
      lines.push(`  Notes: ${yamlQuoted(entry.notes)}`);
    });
    return `${lines.join('\n')}\n`;
  }

  function generatedCommunityColorYaml(model) {
    const lines = [
      '# Generated by EvoSupplement Network Viewer 1.2.0',
      `# ${state.communityMethod === 'leiden' ? 'Leiden' : 'Louvain'} communities at minimum total edge count ${state.threshold}`,
      'colors:'
    ];
    model.communities.forEach((community) => {
      lines.push(`  ${yamlQuoted(community.generatedName)}: ${yamlQuoted(community.color)}`);
    });
    return `${lines.join('\n')}\n`;
  }

  function updateExportControls() {
    if (!state.els.downloadGeneratedYaml && !state.els.downloadCommunityColors && !state.els.exportSummary) return;
    const model = currentExportModel();
    const ready = Boolean(model && model.communities.length);
    if (state.els.exportIncludeIsolates) state.els.exportIncludeIsolates.checked = state.exportIncludeIsolates;
    if (state.els.downloadGeneratedYaml) state.els.downloadGeneratedYaml.disabled = !ready;
    if (state.els.downloadCommunityColors) state.els.downloadCommunityColors.disabled = !ready;
    if (state.els.exportSummary) {
      if (!state.graph) {
        state.els.exportSummary.textContent = 'Load an edge table to prepare an export.';
      } else if (state.communityMethod === 'none') {
        state.els.exportSummary.textContent = 'Choose Louvain or Leiden to assign Function values in the generated YAML.';
      } else if (!ready) {
        state.els.exportSummary.textContent = 'No detected community is available for the current visible network.';
      } else {
        state.els.exportSummary.textContent = `${model.endpoints.length.toLocaleString()} TSV node IDs · ${model.includedCanonicalCount.toLocaleString()} included canonical nodes · ${model.communities.length.toLocaleString()} communities`;
      }
    }
  }

  function updateCommunityControls() {
    const enabled = state.communityMethod !== 'none';
    if (state.els.communityMethod) state.els.communityMethod.value = state.communityMethod;
    if (state.els.onlyIncluded) {
      const hasNodeYaml = Boolean(state.graph && state.graph.metadata && state.graph.metadata.hasNodeYaml);
      state.els.onlyIncluded.disabled = !hasNodeYaml;
      state.els.onlyIncluded.checked = hasNodeYaml && state.onlyIncluded;
      state.els.onlyIncluded.title = hasNodeYaml ? 'Restrict the network to YAML entries with Include: 1' : 'No node YAML was loaded; all TSV nodes are eligible';
    }
    if (state.els.communityResolutionSlider) state.els.communityResolutionSlider.value = state.communityResolution;
    if (state.els.communityResolutionNumber) state.els.communityResolutionNumber.value = state.communityResolution;
    if (state.els.communityWeighted) state.els.communityWeighted.checked = state.communityWeighted;
    if (state.els.communitySeed) state.els.communitySeed.value = state.communitySeed;
    if (state.els.communityIterations) state.els.communityIterations.value = state.communityIterations;
    if (state.els.colorBy) {
      const communityOption = state.els.colorBy.querySelector('option[value="community"]');
      if (communityOption) communityOption.disabled = !enabled;
      state.els.colorBy.value = state.colorBy;
    }
    if (state.els.groupLayoutBy) {
      const communityOption = state.els.groupLayoutBy.querySelector('option[value="community"]');
      if (communityOption) communityOption.disabled = !enabled;
      state.els.groupLayoutBy.value = state.groupLayoutBy;
    }
    if (state.els.recomputeCommunities) state.els.recomputeCommunities.disabled = !enabled;
    if (state.els.relayoutGroups) state.els.relayoutGroups.disabled = !state.visibleNodes.length;
    if (state.els.communitySummary) {
      if (!enabled) {
        state.els.communitySummary.textContent = 'Community detection is off';
      } else {
        const method = state.communityMethod === 'leiden' ? 'Leiden' : 'Louvain';
        const weighted = state.communityWeighted ? 'weighted' : 'unweighted';
        const quality = Number.isFinite(state.communityQuality) ? ` · Q ${state.communityQuality.toFixed(3)}` : '';
        state.els.communitySummary.textContent = `${method} · ${state.communityStats.length.toLocaleString()} communities · ${weighted} · resolution ${state.communityResolution}${quality}`;
      }
    }
    updateExportControls();
  }

  function seededRandom(seedValue) {
    let seed = (Number(seedValue) || 1) >>> 0;
    return function random() {
      seed += 0x6D2B79F5;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function initializePositions(nodes, seed) {
    const random = seededRandom(seed);
    const radius = Math.max(260, Math.sqrt(nodes.length) * 62);
    const ordered = nodes.slice().sort((a, b) => activeLayoutGroup(a).localeCompare(activeLayoutGroup(b)) || a.label.localeCompare(b.label));
    ordered.forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(ordered.length, 1) + (random() - 0.5) * 0.08;
      const jitter = 0.72 + random() * 0.28;
      node.x = Math.cos(angle) * radius * jitter;
      node.y = Math.sin(angle) * radius * jitter;
    });
  }

  function graphForLayout(nodes, edges) {
    const nodeIndex = new Map(nodes.map((node, index) => [node.id, index]));
    const usableEdges = edges
      .map((edge) => ({ edge, a: nodeIndex.get(edge.source), b: nodeIndex.get(edge.target) }))
      .filter((item) => Number.isInteger(item.a) && Number.isInteger(item.b));
    return { nodeIndex, edges: usableEdges };
  }

  function clampDisplacement(dx, dy, maxStep) {
    const length = Math.hypot(dx, dy) || 1;
    if (length <= maxStep) return [dx, dy];
    return [dx / length * maxStep, dy / length * maxStep];
  }

  function fruchtermanReingold(nodes, edges, seed, grouped) {
    const random = seededRandom(seed + (grouped ? 1709 : 0));
    const positions = nodes.map((node, index) => ({
      x: Number.isFinite(node.x) ? node.x : (random() - 0.5) * 800,
      y: Number.isFinite(node.y) ? node.y : (random() - 0.5) * 600,
      pinned: node.pinned,
      node,
      index
    }));
    const graph = graphForLayout(nodes, edges);
    const n = Math.max(nodes.length, 1);
    const area = Math.max(900000, n * 15000);
    const k = Math.sqrt(area / n);
    const maxLog = Math.log1p(Math.max(1, ...edges.map((edge) => edge.totalCount)));
    const groups = Array.from(new Set(nodes.map((node) => activeLayoutGroup(node)))).sort();
    const groupCenters = new Map();
    groups.forEach((group, index) => {
      const angle = Math.PI * 2 * index / Math.max(groups.length, 1) - Math.PI / 2;
      const radius = Math.max(180, groups.length * 26);
      groupCenters.set(group, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    });
    let temperature = Math.max(90, Math.sqrt(area) / 8);
    const iterations = grouped ? 380 : 330;

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const disp = positions.map(() => ({ x: 0, y: 0 }));
      for (let i = 0; i < positions.length; i += 1) {
        for (let j = i + 1; j < positions.length; j += 1) {
          let dx = positions[i].x - positions[j].x;
          let dy = positions[i].y - positions[j].y;
          let distance = Math.hypot(dx, dy);
          if (distance < 0.01) {
            dx = (random() - 0.5) * 0.2;
            dy = (random() - 0.5) * 0.2;
            distance = Math.hypot(dx, dy);
          }
          const force = (k * k) / distance;
          const fx = dx / distance * force;
          const fy = dy / distance * force;
          disp[i].x += fx;
          disp[i].y += fy;
          disp[j].x -= fx;
          disp[j].y -= fy;
        }
      }
      graph.edges.forEach(({ edge, a, b }) => {
        const dx = positions[a].x - positions[b].x;
        const dy = positions[a].y - positions[b].y;
        const distance = Math.max(Math.hypot(dx, dy), 0.01);
        const weight = 0.72 + 1.25 * (Math.log1p(edge.totalCount) / maxLog);
        const force = (distance * distance / k) * weight;
        const fx = dx / distance * force;
        const fy = dy / distance * force;
        disp[a].x -= fx;
        disp[a].y -= fy;
        disp[b].x += fx;
        disp[b].y += fy;
      });
      positions.forEach((position, index) => {
        disp[index].x += -position.x * 0.015;
        disp[index].y += -position.y * 0.015;
        if (grouped) {
          const center = groupCenters.get(activeLayoutGroup(position.node));
          disp[index].x += (center.x - position.x) * 0.12;
          disp[index].y += (center.y - position.y) * 0.12;
        }
        if (position.pinned) return;
        const step = clampDisplacement(disp[index].x, disp[index].y, temperature);
        position.x += step[0];
        position.y += step[1];
      });
      temperature *= 0.982;
    }
    return new Map(positions.map((position) => [position.node.id, { x: position.x, y: position.y }]));
  }

  function eadesSpring(nodes, edges, seed) {
    const random = seededRandom(seed + 991);
    const positions = nodes.map((node) => ({
      node,
      x: Number.isFinite(node.x) ? node.x : (random() - 0.5) * 900,
      y: Number.isFinite(node.y) ? node.y : (random() - 0.5) * 700,
      pinned: node.pinned
    }));
    const graph = graphForLayout(nodes, edges);
    const ideal = Math.max(85, 55 + Math.sqrt(nodes.length) * 6);
    const maxLog = Math.log1p(Math.max(1, ...edges.map((edge) => edge.totalCount)));
    let stepSize = 0.12;
    for (let iteration = 0; iteration < 520; iteration += 1) {
      const force = positions.map(() => ({ x: 0, y: 0 }));
      for (let i = 0; i < positions.length; i += 1) {
        for (let j = i + 1; j < positions.length; j += 1) {
          let dx = positions[i].x - positions[j].x;
          let dy = positions[i].y - positions[j].y;
          let distance = Math.max(Math.hypot(dx, dy), 1);
          const repulsion = 42000 / (distance * distance);
          const fx = dx / distance * repulsion;
          const fy = dy / distance * repulsion;
          force[i].x += fx;
          force[i].y += fy;
          force[j].x -= fx;
          force[j].y -= fy;
        }
      }
      graph.edges.forEach(({ edge, a, b }) => {
        const dx = positions[b].x - positions[a].x;
        const dy = positions[b].y - positions[a].y;
        const distance = Math.max(Math.hypot(dx, dy), 1);
        const weight = 0.8 + 1.5 * (Math.log1p(edge.totalCount) / maxLog);
        const attraction = 10 * Math.log(distance / ideal) * weight;
        const fx = dx / distance * attraction;
        const fy = dy / distance * attraction;
        force[a].x += fx;
        force[a].y += fy;
        force[b].x -= fx;
        force[b].y -= fy;
      });
      positions.forEach((position, index) => {
        force[index].x += -position.x * 0.018;
        force[index].y += -position.y * 0.018;
        if (position.pinned) return;
        position.x += Math.max(-18, Math.min(18, force[index].x * stepSize));
        position.y += Math.max(-18, Math.min(18, force[index].y * stepSize));
      });
      stepSize *= 0.996;
    }
    return new Map(positions.map((position) => [position.node.id, { x: position.x, y: position.y }]));
  }

  function shortestPathMatrix(nodes, edges) {
    const n = nodes.length;
    const index = new Map(nodes.map((node, i) => [node.id, i]));
    const adjacency = Array.from({ length: n }, () => []);
    edges.forEach((edge) => {
      const a = index.get(edge.source);
      const b = index.get(edge.target);
      if (!Number.isInteger(a) || !Number.isInteger(b)) return;
      adjacency[a].push(b);
      adjacency[b].push(a);
    });
    const matrix = Array.from({ length: n }, () => Array(n).fill(Infinity));
    let maxFinite = 1;
    for (let source = 0; source < n; source += 1) {
      const queue = [source];
      matrix[source][source] = 0;
      for (let head = 0; head < queue.length; head += 1) {
        const current = queue[head];
        adjacency[current].forEach((next) => {
          if (matrix[source][next] !== Infinity) return;
          matrix[source][next] = matrix[source][current] + 1;
          maxFinite = Math.max(maxFinite, matrix[source][next]);
          queue.push(next);
        });
      }
    }
    const disconnected = maxFinite + 2;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (!Number.isFinite(matrix[i][j])) matrix[i][j] = disconnected;
      }
    }
    return matrix;
  }

  function kamadaKawai(nodes, edges, seed) {
    const base = fruchtermanReingold(nodes, edges, seed + 77, false);
    const positions = nodes.map((node) => ({
      node,
      x: base.get(node.id).x,
      y: base.get(node.id).y,
      pinned: node.pinned
    }));
    const distances = shortestPathMatrix(nodes, edges);
    const unit = Math.max(55, 38 + Math.sqrt(nodes.length) * 3.5);
    let learningRate = 0.035;
    for (let iteration = 0; iteration < 430; iteration += 1) {
      const forces = positions.map(() => ({ x: 0, y: 0 }));
      for (let i = 0; i < positions.length; i += 1) {
        for (let j = i + 1; j < positions.length; j += 1) {
          const graphDistance = distances[i][j];
          const desired = unit * graphDistance;
          const stiffness = 1 / (graphDistance * graphDistance);
          let dx = positions[j].x - positions[i].x;
          let dy = positions[j].y - positions[i].y;
          const distance = Math.max(Math.hypot(dx, dy), 0.5);
          const delta = distance - desired;
          const magnitude = stiffness * delta;
          const fx = dx / distance * magnitude;
          const fy = dy / distance * magnitude;
          forces[i].x += fx;
          forces[i].y += fy;
          forces[j].x -= fx;
          forces[j].y -= fy;
        }
      }
      positions.forEach((position, index) => {
        forces[index].x += -position.x * 0.002;
        forces[index].y += -position.y * 0.002;
        if (position.pinned) return;
        position.x += Math.max(-15, Math.min(15, forces[index].x * learningRate));
        position.y += Math.max(-15, Math.min(15, forces[index].y * learningRate));
      });
      learningRate *= 0.997;
    }
    return new Map(positions.map((position) => [position.node.id, { x: position.x, y: position.y }]));
  }

  function circleLayout(nodes) {
    const sorted = nodes.slice().sort((a, b) => activeLayoutGroup(a).localeCompare(activeLayoutGroup(b)) || a.label.localeCompare(b.label));
    const radius = Math.max(300, sorted.length * 9.5);
    const result = new Map();
    sorted.forEach((node, index) => {
      const angle = Math.PI * 2 * index / Math.max(sorted.length, 1) - Math.PI / 2;
      result.set(node.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    });
    return result;
  }

  function gridLayout(nodes) {
    const sorted = nodes.slice().sort((a, b) => activeLayoutGroup(a).localeCompare(activeLayoutGroup(b)) || a.label.localeCompare(b.label));
    const columns = Math.ceil(Math.sqrt(sorted.length * 1.25));
    const gapX = 150;
    const gapY = 105;
    const result = new Map();
    sorted.forEach((node, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      result.set(node.id, {
        x: (column - (columns - 1) / 2) * gapX,
        y: (row - (Math.ceil(sorted.length / columns) - 1) / 2) * gapY
      });
    });
    return result;
  }

  function concentricLayout(nodes) {
    const sorted = nodes.slice().sort((a, b) => b.weightedDegree - a.weightedDegree || b.degree - a.degree || a.label.localeCompare(b.label));
    const result = new Map();
    let cursor = 0;
    let ring = 0;
    while (cursor < sorted.length) {
      const capacity = ring === 0 ? 1 : Math.max(6, ring * 10);
      const batch = sorted.slice(cursor, cursor + capacity);
      const radius = ring * 145;
      batch.forEach((node, index) => {
        const angle = Math.PI * 2 * index / Math.max(batch.length, 1) - Math.PI / 2;
        result.set(node.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
      });
      cursor += batch.length;
      ring += 1;
    }
    return result;
  }

  function computeLayout(name, nodes, edges, seed) {
    switch (name) {
      case 'spring': return eadesSpring(nodes, edges, seed);
      case 'kamada-kawai': return kamadaKawai(nodes, edges, seed);
      case 'grouped-spring': return fruchtermanReingold(nodes, edges, seed, true);
      case 'circle': return circleLayout(nodes);
      case 'concentric': return concentricLayout(nodes);
      case 'grid': return gridLayout(nodes);
      case 'fruchterman-reingold':
      default: return fruchtermanReingold(nodes, edges, seed, false);
    }
  }

  function nodeRadius(node, mode, maxDegree, maxWeighted) {
    if (mode === 'degree') {
      const normalized = maxDegree ? Math.sqrt(node.degree / maxDegree) : 0;
      return 7 + normalized * 14;
    }
    if (mode === 'weighted-degree') {
      const normalized = maxWeighted ? Math.log1p(node.weightedDegree) / Math.log1p(maxWeighted) : 0;
      return 7 + normalized * 17;
    }
    return 10;
  }

  function refreshVisibleGraph(options) {
    if (!state.graph) return;
    const threshold = state.threshold;
    const hasNodeYaml = Boolean(state.graph.metadata && state.graph.metadata.hasNodeYaml);
    const eligibleNodes = state.graph.nodes.filter((node) => !hasNodeYaml || !state.onlyIncluded || node.yamlIncluded);
    const eligibleIds = new Set(eligibleNodes.map((node) => node.id));
    const scopeEdges = state.graph.edges.filter((edge) => eligibleIds.has(edge.source) && eligibleIds.has(edge.target));
    const thresholdEdges = scopeEdges.filter((edge) => edge.totalCount >= threshold);
    const incident = new Set();
    thresholdEdges.forEach((edge) => {
      incident.add(edge.source);
      incident.add(edge.target);
    });
    const visibleNodes = eligibleNodes.filter((node) => state.showIsolates || incident.has(node.id));
    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    const filteredEdges = thresholdEdges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
    const adjacency = new Map(visibleNodes.map((node) => [node.id, new Set()]));
    const weighted = new Map(visibleNodes.map((node) => [node.id, 0]));
    filteredEdges.forEach((edge) => {
      adjacency.get(edge.source).add(edge.target);
      adjacency.get(edge.target).add(edge.source);
      weighted.set(edge.source, weighted.get(edge.source) + edge.totalCount);
      weighted.set(edge.target, weighted.get(edge.target) + edge.totalCount);
    });
    let maxDegree = 1;
    let maxWeighted = 1;
    visibleNodes.forEach((node) => {
      node.degree = adjacency.get(node.id).size;
      node.weightedDegree = weighted.get(node.id);
      maxDegree = Math.max(maxDegree, node.degree);
      maxWeighted = Math.max(maxWeighted, node.weightedDegree);
    });
    visibleNodes.forEach((node) => {
      node.radius = nodeRadius(node, state.nodeSizeMode, maxDegree, maxWeighted);
    });
    state.visibleNodes = visibleNodes;
    state.visibleEdges = filteredEdges;
    state.scopeNodeCount = eligibleNodes.length;
    state.scopeEdgeCount = scopeEdges.length;
    state.selectedNodes.forEach((id) => {
      if (!visibleIds.has(id)) state.selectedNodes.delete(id);
    });
    if (state.selectedEdge && !filteredEdges.some((edge) => edge.id === state.selectedEdge)) state.selectedEdge = null;
    recomputeVisibleCommunities();
    renderGraph();
    updateStatus();
    renderLegend();
    renderDiagnostics();
    updateSelectionSummary();
    if (options && options.fit) requestAnimationFrame(() => fitNetwork(true));
  }

  function createSvgElement(name, attributes) {
    const element = document.createElementNS(SVG_NS, name);
    if (attributes) {
      Object.entries(attributes).forEach(([key, value]) => {
        if (value != null) element.setAttribute(key, String(value));
      });
    }
    return element;
  }

  function edgeWidth(edge) {
    const max = Math.max(state.graph ? state.graph.maxEdgeCount : 1, 1);
    const normalized = Math.log1p(edge.totalCount) / Math.log1p(max);
    return 0.9 + normalized * 5.4;
  }

  function edgeColor(edge) {
    const source = state.graph.nodeMap.get(edge.source);
    const target = state.graph.nodeMap.get(edge.target);
    if (!source || !target) return '#9aa5b4';
    const sourceCategory = activeColorCategory(source);
    const targetCategory = activeColorCategory(target);
    const valid = state.colorBy === 'community' || sourceCategory !== 'Unassigned';
    if (valid && sourceCategory === targetCategory) return activeCategoryColor(sourceCategory);
    return '#9aa5b4';
  }

  function renderGraph() {
    const edgesGroup = state.els.edgesGroup;
    const nodesGroup = state.els.nodesGroup;
    const labelsGroup = state.els.labelsGroup;
    if (!edgesGroup || !nodesGroup || !labelsGroup) return;
    edgesGroup.replaceChildren();
    nodesGroup.replaceChildren();
    labelsGroup.replaceChildren();
    state.nodeElements.clear();
    state.edgeElements.clear();

    state.visibleEdges.forEach((edge) => {
      const sourceNode = state.graph.nodeMap.get(edge.source);
      const targetNode = state.graph.nodeMap.get(edge.target);
      const sourceCategory = activeColorCategory(sourceNode);
      const targetCategory = activeColorCategory(targetNode);
      const sameGroup = sourceCategory === targetCategory && (state.colorBy === 'community' || sourceCategory !== 'Unassigned');
      const wrapper = createSvgElement('g', { class: `network-edge${sameGroup ? ' same-group' : ' cross-group'}` });
      const line = createSvgElement('line', {
        class: 'network-edge-line',
        stroke: edgeColor(edge),
        'stroke-width': edgeWidth(edge),
        'stroke-dasharray': sameGroup ? '' : '3 4'
      });
      const hit = createSvgElement('line', {
        class: 'network-edge-hit',
        'stroke-width': Math.max(10, edgeWidth(edge) + 8)
      });
      wrapper.append(line, hit);
      wrapper.addEventListener('pointerenter', (event) => onEdgeEnter(edge, event));
      wrapper.addEventListener('pointermove', positionTooltip);
      wrapper.addEventListener('pointerleave', onEdgeLeave);
      wrapper.addEventListener('click', (event) => onEdgeClick(edge, event));
      edgesGroup.appendChild(wrapper);
      state.edgeElements.set(edge.id, { wrapper, line, hit, edge });
    });

    state.visibleNodes.forEach((node) => {
      const wrapper = createSvgElement('g', {
        class: `network-node${node.pinned ? ' is-pinned' : ''}`,
        tabindex: '0',
        role: 'button',
        'aria-label': `${node.label}, ${activeColorCategory(node)}`
      });
      const halo = createSvgElement('circle', { class: 'network-node-halo', r: node.radius + 6 });
      const circle = createSvgElement('circle', {
        class: 'network-node-circle',
        r: node.radius,
        fill: activeNodeColor(node)
      });
      const pin = createSvgElement('circle', {
        class: 'network-node-pin',
        r: 2.6,
        cx: node.radius * 0.62,
        cy: -node.radius * 0.62
      });
      wrapper.append(halo, circle, pin);
      wrapper.addEventListener('pointerenter', (event) => onNodeEnter(node, event));
      wrapper.addEventListener('pointermove', positionTooltip);
      wrapper.addEventListener('pointerleave', onNodeLeave);
      wrapper.addEventListener('pointerdown', (event) => onNodePointerDown(node, event));
      wrapper.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();
        node.pinned = false;
        wrapper.classList.remove('is-pinned');
        showToast(`${node.label} released from its fixed position.`);
      });
      wrapper.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectNode(node, event.ctrlKey || event.metaKey);
        }
      });
      nodesGroup.appendChild(wrapper);

      const label = createSvgElement('text', {
        class: 'network-node-label',
        'dominant-baseline': 'middle'
      });
      label.textContent = node.label;
      labelsGroup.appendChild(label);
      state.nodeElements.set(node.id, { wrapper, halo, circle, pin, label, node });
    });
    labelsGroup.hidden = !state.showLabels;
    updateGeometry();
    updateInteractionStyles();
  }

  function updateGeometry() {
    state.edgeElements.forEach(({ line, hit, edge }) => {
      const source = state.graph.nodeMap.get(edge.source);
      const target = state.graph.nodeMap.get(edge.target);
      const values = { x1: source.x, y1: source.y, x2: target.x, y2: target.y };
      Object.entries(values).forEach(([name, value]) => {
        line.setAttribute(name, value);
        hit.setAttribute(name, value);
      });
    });
    state.nodeElements.forEach(({ wrapper, label, node }) => {
      wrapper.setAttribute('transform', `translate(${node.x} ${node.y})`);
      label.setAttribute('x', node.x + node.radius + 5);
      label.setAttribute('y', node.y);
    });
    applyCamera();
  }

  function applyCamera() {
    if (!state.els.rootGroup) return;
    const camera = state.camera;
    state.els.rootGroup.setAttribute('transform', `translate(${camera.x} ${camera.y}) scale(${camera.k})`);
    if (state.els.zoomValue) state.els.zoomValue.textContent = `${Math.round(camera.k * 100)}%`;
  }

  function updateInteractionStyles() {
    if (!state.graph) return;
    const selected = state.selectedNodes;
    const hoveredNode = state.hoveredNode;
    const hoveredEdge = state.hoveredEdge;
    const hasSelection = selected.size > 0;
    const hasSearch = state.searchMatches.size > 0 || (state.els.searchInput && state.els.searchInput.value.trim());
    const emphasizedNodes = new Set(selected);
    const emphasizedEdges = new Set();

    if (hoveredNode) emphasizedNodes.add(hoveredNode);
    if (hoveredEdge) {
      emphasizedEdges.add(hoveredEdge);
      const edge = state.visibleEdges.find((item) => item.id === hoveredEdge);
      if (edge) {
        emphasizedNodes.add(edge.source);
        emphasizedNodes.add(edge.target);
      }
    }
    if (state.selectedEdge) {
      emphasizedEdges.add(state.selectedEdge);
      const edge = state.visibleEdges.find((item) => item.id === state.selectedEdge);
      if (edge) {
        emphasizedNodes.add(edge.source);
        emphasizedNodes.add(edge.target);
      }
    }

    if (hasSelection || hoveredNode) {
      state.visibleEdges.forEach((edge) => {
        if (selected.has(edge.source) || selected.has(edge.target) || edge.source === hoveredNode || edge.target === hoveredNode) {
          emphasizedEdges.add(edge.id);
          emphasizedNodes.add(edge.source);
          emphasizedNodes.add(edge.target);
        }
      });
    }

    state.nodeElements.forEach(({ wrapper }, id) => {
      const isSelected = selected.has(id);
      const isHover = id === hoveredNode;
      const isSearch = state.searchMatches.has(id);
      const shouldDimSelection = (hasSelection || hoveredNode || state.selectedEdge || hoveredEdge) && !emphasizedNodes.has(id);
      const shouldDimSearch = hasSearch && !isSearch;
      wrapper.classList.toggle('is-selected', isSelected);
      wrapper.classList.toggle('is-hovered', isHover);
      wrapper.classList.toggle('is-search-match', isSearch);
      wrapper.classList.toggle('is-dimmed', shouldDimSelection || shouldDimSearch);
    });

    state.edgeElements.forEach(({ wrapper }, id) => {
      const isSelected = id === state.selectedEdge;
      const isHover = id === hoveredEdge;
      const shouldDimSelection = (hasSelection || hoveredNode || state.selectedEdge || hoveredEdge) && !emphasizedEdges.has(id);
      let shouldDimSearch = false;
      if (hasSearch) {
        const edge = state.edgeElements.get(id).edge;
        shouldDimSearch = !(state.searchMatches.has(edge.source) || state.searchMatches.has(edge.target));
      }
      wrapper.classList.toggle('is-selected', isSelected);
      wrapper.classList.toggle('is-hovered', isHover);
      wrapper.classList.toggle('is-dimmed', shouldDimSelection || shouldDimSearch);
    });
  }

  function selectNode(node, additive) {
    if (additive) {
      if (state.selectedNodes.has(node.id)) state.selectedNodes.delete(node.id);
      else state.selectedNodes.add(node.id);
    } else {
      state.selectedNodes.clear();
      state.selectedNodes.add(node.id);
    }
    state.selectedEdge = null;
    updateInteractionStyles();
    updateSelectionSummary();
  }

  function clearSelection() {
    state.selectedNodes.clear();
    state.selectedEdge = null;
    updateInteractionStyles();
    updateSelectionSummary();
  }

  function onNodeEnter(node, event) {
    if (state.drag) return;
    state.hoveredNode = node.id;
    showNodeTooltip(node, event);
    updateInteractionStyles();
  }

  function onNodeLeave() {
    if (state.drag) return;
    state.hoveredNode = null;
    hideTooltip();
    updateInteractionStyles();
  }

  function onEdgeEnter(edge, event) {
    if (state.drag) return;
    state.hoveredEdge = edge.id;
    showEdgeTooltip(edge, event);
    updateInteractionStyles();
  }

  function onEdgeLeave() {
    state.hoveredEdge = null;
    hideTooltip();
    updateInteractionStyles();
  }

  function onEdgeClick(edge, event) {
    event.stopPropagation();
    state.selectedEdge = state.selectedEdge === edge.id ? null : edge.id;
    state.selectedNodes.clear();
    if (state.selectedEdge) {
      state.selectedNodes.add(edge.source);
      state.selectedNodes.add(edge.target);
    }
    updateInteractionStyles();
    updateSelectionSummary();
  }

  function onNodePointerDown(node, event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = screenToWorld(event.clientX, event.clientY);
    state.drag = {
      node,
      startClientX: event.clientX,
      startClientY: event.clientY,
      offsetX: node.x - point.x,
      offsetY: node.y - point.y,
      moved: false,
      additive: event.ctrlKey || event.metaKey
    };
    state.els.viewport.classList.add('is-dragging-node');
    hideTooltip();
  }

  function screenToWorld(clientX, clientY) {
    const rect = state.els.svg.getBoundingClientRect();
    return {
      x: (clientX - rect.left - state.camera.x) / state.camera.k,
      y: (clientY - rect.top - state.camera.y) / state.camera.k
    };
  }

  function onGlobalPointerMove(event) {
    if (state.drag) {
      const drag = state.drag;
      if (Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) > 3) drag.moved = true;
      const point = screenToWorld(event.clientX, event.clientY);
      drag.node.x = point.x + drag.offsetX;
      drag.node.y = point.y + drag.offsetY;
      drag.node.pinned = true;
      const elements = state.nodeElements.get(drag.node.id);
      if (elements) elements.wrapper.classList.add('is-pinned');
      updateGeometry();
      return;
    }
    if (state.pan) {
      state.camera.x = state.pan.startX + event.clientX - state.pan.clientX;
      state.camera.y = state.pan.startY + event.clientY - state.pan.clientY;
      applyCamera();
    }
  }

  function onGlobalPointerUp() {
    if (state.drag) {
      const drag = state.drag;
      if (!drag.moved) selectNode(drag.node, drag.additive);
      state.drag = null;
      state.els.viewport.classList.remove('is-dragging-node');
    }
    if (state.pan) {
      state.pan = null;
      state.els.viewport.classList.remove('is-panning');
    }
  }

  function onViewportPointerDown(event) {
    if (event.button !== 0 || event.target.closest('.network-node') || event.target.closest('.network-edge')) return;
    state.pan = {
      clientX: event.clientX,
      clientY: event.clientY,
      startX: state.camera.x,
      startY: state.camera.y
    };
    state.els.viewport.classList.add('is-panning');
    hideTooltip();
    clearSelection();
  }

  function onWheel(event) {
    event.preventDefault();
    const rect = state.els.svg.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const oldK = state.camera.k;
    const factor = Math.exp(-event.deltaY * 0.0015);
    const newK = Math.max(0.04, Math.min(35, oldK * factor));
    const worldX = (mouseX - state.camera.x) / oldK;
    const worldY = (mouseY - state.camera.y) / oldK;
    state.camera.k = newK;
    state.camera.x = mouseX - worldX * newK;
    state.camera.y = mouseY - worldY * newK;
    applyCamera();
  }

  function showNodeTooltip(node, event) {
    const groupText = node.groups.length > 1 ? node.groups.join(', ') : node.group;
    const notes = node.notes.length ? node.notes.join(' · ') : '';
    const aliases = node.aliases.length ? node.aliases.join(', ') : '—';
    const conflict = new Set(node.groups.filter((group) => group !== 'Unassigned')).size > 1;
    const includeText = node.hasYaml ? (node.yamlIncluded ? 'Include = 1' : 'Include = 0') : 'Not present in YAML';
    const community = node.communityLabel || '—';
    const html = [
      `<div class="tooltip-title">${escapeHtml(node.label)}</div>`,
      `<dl>`,
      `<dt>YAML function</dt><dd>${escapeHtml(groupText)}${conflict ? ' <span class="tooltip-warning">(merged groups)</span>' : ''}</dd>`,
      `<dt>Detected community</dt><dd>${escapeHtml(community)}</dd>`,
      `<dt>YAML inclusion</dt><dd>${escapeHtml(includeText)}</dd>`,
      `<dt>YAML key${node.aliases.length === 1 ? '' : 's'}</dt><dd>${escapeHtml(aliases)}</dd>`,
      `<dt>Visible degree</dt><dd>${node.degree.toLocaleString()}</dd>`,
      `<dt>Visible edge count</dt><dd>${formatNumber(node.weightedDegree)}</dd>`,
      `<dt>All relationships</dt><dd>${node.totalDegree.toLocaleString()} · ${formatNumber(node.totalWeightedDegree)} total count</dd>`,
      notes ? `<dt>Notes</dt><dd>${escapeHtml(notes)}</dd>` : '',
      `</dl>`,
      `<div class="tooltip-hint">Drag to move and pin. Double-click to release.</div>`
    ].join('');
    showTooltip(html, event);
  }

  function showEdgeTooltip(edge, event) {
    const source = state.graph.nodeMap.get(edge.source);
    const target = state.graph.nodeMap.get(edge.target);
    const sameFunction = source.group === target.group && source.group !== 'Unassigned';
    const sameCommunity = source.communityLabel && source.communityLabel === target.communityLabel;
    const typeRows = Array.from(edge.typeTotals.entries()).sort((a, b) => b[1] - a[1]);
    const directionRows = Array.from(edge.directionTotals.entries()).sort((a, b) => b[1] - a[1]);
    const rawRows = edge.rows.slice().sort((a, b) => b.count - a.count).slice(0, 12);
    const html = [
      `<div class="tooltip-title">${escapeHtml(edge.source)} — ${escapeHtml(edge.target)}</div>`,
      `<dl>`,
      `<dt>Total edge count</dt><dd>${formatNumber(edge.totalCount)}</dd>`,
      `<dt>Input rows</dt><dd>${edge.rows.length.toLocaleString()}</dd>`,
      `<dt>YAML functions</dt><dd>${escapeHtml(source.group)} ↔ ${escapeHtml(target.group)}${sameFunction ? ' · within function' : ''}</dd>`,
      `<dt>Communities</dt><dd>${escapeHtml(source.communityLabel || '—')} ↔ ${escapeHtml(target.communityLabel || '—')}${sameCommunity ? ' · within community' : ''}</dd>`,
      `</dl>`,
      `<div class="tooltip-section"><strong>By edge type</strong>${typeRows.map(([type, count]) => `<span>${escapeHtml(type)} <b>${formatNumber(count)}</b></span>`).join('')}</div>`,
      `<div class="tooltip-section"><strong>By direction</strong>${directionRows.map(([direction, count]) => `<span>${escapeHtml(direction)} <b>${formatNumber(count)}</b></span>`).join('')}</div>`,
      `<div class="tooltip-section tooltip-details"><strong>Input-row details</strong>${rawRows.map((row) => `<span>${escapeHtml(row.rawSource)} → ${escapeHtml(row.rawTarget)} · ${escapeHtml(row.type)} · <b>${formatNumber(row.count)}</b></span>`).join('')}${edge.rows.length > rawRows.length ? `<em>+ ${edge.rows.length - rawRows.length} more rows</em>` : ''}</div>`
    ].join('');
    showTooltip(html, event);
  }

  function showTooltip(html, event) {
    const tooltip = state.els.tooltip;
    if (!tooltip) return;
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    positionTooltip(event);
  }

  function positionTooltip(event) {
    const tooltip = state.els.tooltip;
    if (!tooltip || tooltip.hidden || !event) return;
    const margin = 14;
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    let left = event.clientX + 16;
    let top = event.clientY + 16;
    if (left + width + margin > window.innerWidth) left = event.clientX - width - 16;
    if (top + height + margin > window.innerHeight) top = event.clientY - height - 16;
    tooltip.style.left = `${Math.max(margin, left)}px`;
    tooltip.style.top = `${Math.max(margin, top)}px`;
  }

  function hideTooltip() {
    if (state.els.tooltip) state.els.tooltip.hidden = true;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function updateStatus() {
    if (!state.graph || !state.els.status) return;
    const incident = new Set();
    state.visibleEdges.forEach((edge) => { incident.add(edge.source); incident.add(edge.target); });
    const nodeSummary = state.showIsolates
      ? `${state.visibleNodes.length.toLocaleString()} nodes (${incident.size.toLocaleString()} connected)`
      : `${state.visibleNodes.length.toLocaleString()} connected nodes`;
    const scope = state.onlyIncluded ? 'YAML Include = 1' : 'all TSV nodes';
    const community = state.communityMethod === 'none' ? '' : ` · ${state.communityStats.length.toLocaleString()} communities`;
    state.els.status.textContent = `${nodeSummary} · ${state.visibleEdges.length.toLocaleString()} of ${state.scopeEdgeCount.toLocaleString()} relationships · total edge count ≥ ${formatNumber(state.threshold)} · ${scope}${community}`;
    state.els.status.title = `${state.scopeNodeCount.toLocaleString()} nodes are eligible in the active scope; communities are always computed from the currently visible nodes and relationships.`;
  }

  function updateSelectionSummary() {
    if (!state.els.selectionSummary) return;
    if (state.selectedEdge) {
      const edge = state.graph.edges.find((item) => item.id === state.selectedEdge);
      state.els.selectionSummary.textContent = edge ? `${edge.source} — ${edge.target} selected` : '';
    } else if (state.selectedNodes.size) {
      state.els.selectionSummary.textContent = `${state.selectedNodes.size.toLocaleString()} node${state.selectedNodes.size === 1 ? '' : 's'} selected`;
    } else {
      state.els.selectionSummary.textContent = 'No persistent selection';
    }
    if (state.els.clearSelection) state.els.clearSelection.disabled = !state.selectedNodes.size && !state.selectedEdge;
  }

  function renderLegend() {
    if (!state.graph || !state.els.legend || !state.els.legendWrap) return;
    state.els.legend.replaceChildren();
    const counts = new Map();
    state.visibleNodes.forEach((node) => {
      const category = activeColorCategory(node);
      counts.set(category, (counts.get(category) || 0) + 1);
    });
    const entries = Array.from(counts.entries());
    if (state.colorBy === 'community') {
      entries.sort((a, b) => {
        const ai = Number(a[0].replace(/\D/g, '')) || 0;
        const bi = Number(b[0].replace(/\D/g, '')) || 0;
        return ai - bi;
      });
    } else {
      entries.sort((a, b) => a[0].localeCompare(b[0]));
    }
    entries.forEach(([category, count]) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'legend-item';
      item.innerHTML = `<span class="legend-swatch" style="--swatch:${escapeHtml(activeCategoryColor(category))}"></span><span>${escapeHtml(category)}</span><small>${count}</small>`;
      item.addEventListener('click', () => {
        state.els.searchInput.value = state.colorBy === 'community' ? `community:${category}` : `group:${category}`;
        applySearch();
      });
      state.els.legend.appendChild(item);
    });
    if (state.els.legendTitle) state.els.legendTitle.textContent = state.colorBy === 'community' ? 'Community' : 'Function';
    state.els.legendWrap.hidden = counts.size === 0;
  }

  function renderDiagnostics() {
    if (!state.graph || !state.els.diagnosticsBody || !state.els.diagnostics) return;
    const meta = state.graph.metadata;
    const yamlDiagnostic = meta.hasNodeYaml
      ? `${meta.yamlEntryCount.toLocaleString()} YAML entries were parsed; ${meta.includedEntryCount.toLocaleString()} have Include = 1.`
      : 'No node YAML was supplied; every unique TSV endpoint was retained with its original name.';
    const lines = [
      `${meta.inputRowCount.toLocaleString()} edge rows were read; ${meta.acceptedRows.toLocaleString()} valid rows were aggregated.`,
      yamlDiagnostic,
      `${meta.includedCanonicalNodeCount.toLocaleString()} included display-name nodes and ${meta.referencedCanonicalNodeCount.toLocaleString()} TSV-referenced display-name nodes contribute to ${meta.canonicalNodeCount.toLocaleString()} relevant nodes.`,
      `${meta.mergedLabels.length.toLocaleString()} display names merge more than one YAML key.`,
      `${state.graph.edges.length.toLocaleString()} undirected relationships remain after summing all directions and edge types.`,
      `Community detection, when active, uses only the ${state.visibleNodes.length.toLocaleString()} nodes and ${state.visibleEdges.length.toLocaleString()} relationships currently visible.`
    ];
    if (meta.groupConflicts.length) lines.push(`${meta.groupConflicts.length.toLocaleString()} merged display name has more than one non-empty function; the first included function is used for function coloring and all functions remain visible in hover details.`);
    if (meta.unannotatedEndpoints.size) lines.push(`${meta.unannotatedEndpoints.size.toLocaleString()} TSV endpoint names were absent from the YAML and were retained as unannotated nodes.`);
    if (meta.invalidRows.length) lines.push(`${meta.invalidRows.length.toLocaleString()} invalid edge rows were omitted.`);
    if (meta.selfLoops.length) lines.push(`${meta.selfLoops.length.toLocaleString()} relationships became self-loops after display-name unification and were omitted from the drawing.`);
    state.els.diagnosticsBody.innerHTML = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
    state.els.diagnostics.hidden = false;
  }

  function applySearch() {
    if (!state.graph) return;
    const raw = state.els.searchInput.value.trim();
    state.searchMatches.clear();
    state.els.searchClear.hidden = !raw;
    if (raw) {
      let field = '';
      let query = raw;
      const fieldMatch = raw.match(/^([a-z_]+):(.*)$/i);
      if (fieldMatch) {
        field = normalizeToken(fieldMatch[1]);
        query = fieldMatch[2].trim();
      }
      if ((query.startsWith('"') && query.endsWith('"')) || (query.startsWith("'") && query.endsWith("'"))) query = query.slice(1, -1);
      const normalizedQuery = normalizeToken(query);
      state.visibleNodes.forEach((node) => {
        let haystack;
        if (field === 'group' || field === 'function') haystack = node.groups.join(' ');
        else if (field === 'community') haystack = node.communityLabel;
        else if (field === 'key' || field === 'alias') haystack = node.aliases.join(' ');
        else if (field === 'note' || field === 'notes') haystack = node.notes.join(' ');
        else haystack = [node.label, node.aliases.join(' '), node.groups.join(' '), node.communityLabel, node.notes.join(' ')].join(' ');
        if (normalizeToken(haystack).includes(normalizedQuery)) state.searchMatches.add(node.id);
      });
    }
    if (state.els.searchCount) {
      state.els.searchCount.textContent = raw ? `${state.searchMatches.size.toLocaleString()} match${state.searchMatches.size === 1 ? '' : 'es'}` : '';
    }
    updateInteractionStyles();
  }

  function thresholdToSlider(value) {
    const max = Math.max(1, state.graph ? state.graph.maxEdgeCount : 1);
    const normalized = Math.log1p(Math.max(0, value)) / Math.log1p(max);
    return Math.round(normalized * 1000);
  }

  function sliderToThreshold(value) {
    const max = Math.max(1, state.graph ? state.graph.maxEdgeCount : 1);
    return Math.max(0, Math.round(Math.expm1((Number(value) / 1000) * Math.log1p(max))));
  }

  function updateThresholdControls() {
    if (!state.graph) return;
    state.els.thresholdSlider.value = thresholdToSlider(state.threshold);
    state.els.thresholdNumber.value = state.threshold;
    state.els.thresholdNumber.max = Math.ceil(state.graph.maxEdgeCount);
    state.els.thresholdValue.textContent = `≥ ${formatNumber(state.threshold)}`;
  }

  function runCurrentLayout(options) {
    if (!state.graph || !state.visibleNodes.length || state.layoutRunning) return;
    state.layoutRunning = true;
    state.els.runLayout.disabled = true;
    state.els.layoutSelect.disabled = true;
    state.els.layoutProgress.hidden = false;
    hideTooltip();
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          const seedOffset = options && options.reseed ? Date.now() % 100000 : 0;
          const positions = computeLayout(state.layoutName, state.visibleNodes, state.visibleEdges, state.config.layoutSeed + seedOffset);
          animatePositions(positions, options && options.instant ? 0 : 620, () => {
            state.layoutRunning = false;
            state.els.runLayout.disabled = false;
            state.els.layoutSelect.disabled = false;
            state.els.layoutProgress.hidden = true;
            if (state.config.fitAfterLayout || (options && options.fit)) fitNetwork(true);
          });
        } catch (error) {
          state.layoutRunning = false;
          state.els.runLayout.disabled = false;
          state.els.layoutSelect.disabled = false;
          state.els.layoutProgress.hidden = true;
          showError(error);
        }
      }, 30);
    });
  }

  function animatePositions(targets, duration, done) {
    const starts = new Map(state.visibleNodes.map((node) => [node.id, { x: node.x, y: node.y }]));
    const startTime = performance.now();
    function frame(now) {
      const t = duration === 0 ? 1 : Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      state.visibleNodes.forEach((node) => {
        if (node.pinned) return;
        const target = targets.get(node.id);
        const start = starts.get(node.id);
        if (!target || !start) return;
        node.x = start.x + (target.x - start.x) * eased;
        node.y = start.y + (target.y - start.y) * eased;
      });
      updateGeometry();
      if (t < 1) requestAnimationFrame(frame);
      else if (done) done();
    }
    requestAnimationFrame(frame);
  }

  function releaseAllNodes() {
    if (!state.graph) return;
    state.graph.nodes.forEach((node) => { node.pinned = false; });
    state.nodeElements.forEach(({ wrapper }) => wrapper.classList.remove('is-pinned'));
    showToast('All node positions are released. Run a layout to reorganize them.');
  }

  function resetPositions() {
    if (!state.graph) return;
    state.graph.nodes.forEach((node) => { node.pinned = false; });
    initializePositions(state.graph.nodes, state.config.layoutSeed);
    state.layoutName = state.config.defaultLayout;
    state.els.layoutSelect.value = state.layoutName;
    renderGraph();
    runCurrentLayout({ instant: false, fit: true });
  }

  function fitNetwork(includeLabels) {
    if (!state.visibleNodes.length || !state.els.svg) return;
    const rect = state.els.svg.getBoundingClientRect();
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    state.visibleNodes.forEach((node) => {
      const labelWidth = includeLabels && state.showLabels ? Math.min(260, node.label.length * 7.1 + 12) : 0;
      minX = Math.min(minX, node.x - node.radius - 8);
      maxX = Math.max(maxX, node.x + node.radius + labelWidth + 8);
      minY = Math.min(minY, node.y - node.radius - 12);
      maxY = Math.max(maxY, node.y + node.radius + 12);
    });
    if (!Number.isFinite(minX)) return;
    const padding = 48;
    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);
    const k = Math.max(0.04, Math.min(4.5, Math.min((width - padding * 2) / contentWidth, (height - padding * 2) / contentHeight)));
    state.camera.k = k;
    state.camera.x = width / 2 - (minX + maxX) / 2 * k;
    state.camera.y = height / 2 - (minY + maxY) / 2 * k;
    applyCamera();
  }

  function zoomBy(factor) {
    if (!state.els.svg) return;
    const rect = state.els.svg.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const oldK = state.camera.k;
    const newK = Math.max(0.04, Math.min(35, oldK * factor));
    const worldX = (centerX - state.camera.x) / oldK;
    const worldY = (centerY - state.camera.y) / oldK;
    state.camera.k = newK;
    state.camera.x = centerX - worldX * newK;
    state.camera.y = centerY - worldY * newK;
    applyCamera();
  }

  function showOverlay(title, detail, spinning) {
    if (!state.els.overlay) return;
    state.els.overlay.hidden = false;
    state.els.overlayTitle.textContent = title;
    state.els.overlayDetail.textContent = detail || '';
    state.els.overlaySpinner.hidden = !spinning;
  }

  function hideOverlay() {
    if (state.els.overlay) state.els.overlay.hidden = true;
  }

  function showError(error) {
    const message = error instanceof Error ? error.message : String(error);
    if (state.els.error) {
      state.els.error.textContent = message;
      state.els.error.hidden = false;
    }
    hideOverlay();
    console.error('[Network Viewer]', error);
  }

  function clearError() {
    if (state.els.error) state.els.error.hidden = true;
  }

  function showToast(message) {
    if (!state.els.toast) return;
    state.els.toast.textContent = message;
    state.els.toast.hidden = false;
    clearTimeout(state.els.toast.__timer);
    state.els.toast.__timer = setTimeout(() => { state.els.toast.hidden = true; }, 2600);
  }

  async function fetchText(url, label) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${label} could not be loaded (${response.status} ${response.statusText}).`);
    const length = Number(response.headers.get('content-length'));
    if (length && length > state.config.maxFileBytes) throw new Error(`${label} exceeds the configured ${Math.round(state.config.maxFileBytes / 1024 / 1024)} MB limit.`);
    const text = await response.text();
    if (text.length > state.config.maxFileBytes) throw new Error(`${label} exceeds the configured ${Math.round(state.config.maxFileBytes / 1024 / 1024)} MB limit.`);
    return text;
  }

  function readLocalFile(file, label) {
    if (!file) return Promise.resolve('');
    if (file.size > state.config.maxFileBytes) return Promise.reject(new Error(`${label} exceeds the configured ${Math.round(state.config.maxFileBytes / 1024 / 1024)} MB limit.`));
    return file.text();
  }

  async function loadHostedInputs() {
    const config = state.config;
    if (!config.edgeUrl) {
      showOverlay('Choose network files', 'Load an edge TSV to begin. Node annotations are optional.', false);
      return;
    }
    clearError();
    showOverlay('Loading network', 'Reading the edge table and included-node annotations…', true);
    try {
      const [edgeText, nodeText, colorText] = await Promise.all([
        fetchText(config.edgeUrl, 'Edge table'),
        config.nodeUrl ? fetchText(config.nodeUrl, 'Node YAML') : Promise.resolve(''),
        config.colorUrl ? fetchText(config.colorUrl, 'Group color dictionary') : Promise.resolve('')
      ]);
      state.sourceUrls = { edges: config.edgeUrl, nodes: config.nodeUrl || '', colors: config.colorUrl || '' };
      state.localNames = { edges: '', nodes: '', colors: '' };
      await loadTexts(edgeText, nodeText, colorText, false);
      configureDownloads();
    } catch (error) {
      showError(error);
    }
  }

  async function loadTexts(edgeText, nodeText, colorText, fromLocal) {
    clearError();
    showOverlay('Building network', 'Unifying display names and summing undirected relationships…', true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    try {
      const graph = buildGraph(edgeText, nodeText, colorText, state.config);
      state.graph = graph;
      state.lastInputTexts = { edgeText, nodeText, colorText };
      state.selectedNodes.clear();
      state.selectedEdge = null;
      state.hoveredNode = null;
      state.hoveredEdge = null;
      state.searchMatches.clear();
      state.threshold = Math.max(0, Number(state.config.defaultMinimumCount) || 0);
      state.showLabels = Boolean(state.config.defaultShowLabels);
      state.showIsolates = Boolean(state.config.defaultShowIsolates);
      state.onlyIncluded = graph.metadata.hasNodeYaml && state.config.defaultOnlyIncluded !== false;
      state.exportIncludeIsolates = false;
      state.communityMethod = ['none', 'louvain', 'leiden'].includes(state.config.defaultCommunityMethod) ? state.config.defaultCommunityMethod : 'none';
      state.communityResolution = Math.max(0.0001, Number(state.config.defaultCommunityResolution) || 1);
      state.communityWeighted = state.config.defaultCommunityWeighted !== false;
      state.communitySeed = Number(state.config.defaultCommunitySeed) || 42;
      state.communityIterations = Math.max(1, Number(state.config.defaultCommunityIterations) || 20);
      state.colorBy = state.config.defaultColorBy === 'community' && state.communityMethod !== 'none' ? 'community' : 'function';
      state.groupLayoutBy = ['none', 'function', 'community'].includes(state.config.defaultGroupLayoutBy) ? state.config.defaultGroupLayoutBy : 'function';
      if (state.groupLayoutBy === 'community' && state.communityMethod === 'none') state.groupLayoutBy = 'function';
      state.nodeSizeMode = state.config.defaultNodeSize;
      state.layoutName = state.config.defaultLayout;
      state.els.layoutSelect.value = state.layoutName;
      state.els.nodeSizeSelect.value = state.nodeSizeMode;
      state.els.showLabels.checked = state.showLabels;
      state.els.showIsolates.checked = state.showIsolates;
      updateCommunityControls();
      state.els.searchInput.value = '';
      state.els.searchClear.hidden = true;
      initializePositions(graph.nodes, state.config.layoutSeed);
      updateThresholdControls();
      refreshVisibleGraph();
      updateSelectionSummary();
      updateSourceSummary(fromLocal);
      hideOverlay();
      runCurrentLayout({ instant: true, fit: true });
    } catch (error) {
      showError(error);
      throw error;
    }
  }

  function updateSourceSummary(fromLocal) {
    if (!state.graph || !state.els.sourceSummary) return;
    const meta = state.graph.metadata;
    const origin = fromLocal ? 'Local files' : 'Hosted files';
    const yamlPart = meta.hasNodeYaml
      ? `${meta.includedEntryCount.toLocaleString()} YAML Include = 1 entries`
      : 'no node YAML (TSV names used directly)';
    state.els.sourceSummary.textContent = `${origin} · ${meta.inputRowCount.toLocaleString()} input rows · ${yamlPart} · ${meta.canonicalNodeCount.toLocaleString()} relevant display-name nodes · ${state.graph.edges.length.toLocaleString()} undirected relationships`;
  }

  function configureDownloads() {
    const show = state.config.showDownloads;
    const mapping = [
      ['downloadEdges', state.sourceUrls.edges, 'Download edges'],
      ['downloadNodes', state.sourceUrls.nodes, 'Download node YAML'],
      ['downloadColors', state.sourceUrls.colors, 'Download colors']
    ];
    mapping.forEach(([key, url, label]) => {
      const element = state.els[key];
      if (!element) return;
      if (show && url) {
        element.href = url;
        element.textContent = label;
        element.hidden = false;
      } else {
        element.hidden = true;
      }
    });
  }

  function setupDemoLoader() {
    if (!state.els.demoLoader) return;
    const edgeInput = state.els.demoEdgeInput;
    const nodeInput = state.els.demoNodeInput;
    const colorInput = state.els.demoColorInput;

    function updateDemoState() {
      state.els.demoEdgeName.textContent = edgeInput.files[0] ? edgeInput.files[0].name : 'No file selected';
      state.els.demoNodeName.textContent = nodeInput.files[0] ? nodeInput.files[0].name : 'Optional';
      state.els.demoColorName.textContent = colorInput.files[0] ? colorInput.files[0].name : 'Optional';
      state.els.demoLoad.disabled = !edgeInput.files[0];
      if (state.els.demoClearNodes) state.els.demoClearNodes.hidden = !nodeInput.files[0];
      state.els.demoClearColors.hidden = !colorInput.files[0];
    }
    [edgeInput, nodeInput, colorInput].forEach((input) => input.addEventListener('change', updateDemoState));
    if (state.els.demoClearNodes) state.els.demoClearNodes.addEventListener('click', () => {
      nodeInput.value = '';
      updateDemoState();
    });
    state.els.demoClearColors.addEventListener('click', () => {
      colorInput.value = '';
      updateDemoState();
    });
    state.els.demoLoad.addEventListener('click', async () => {
      clearError();
      showOverlay('Reading local files', 'All processing remains in this browser tab.', true);
      try {
        const [edgeText, nodeText, colorText] = await Promise.all([
          readLocalFile(edgeInput.files[0], 'Edge table'),
          readLocalFile(nodeInput.files[0], 'Node YAML'),
          readLocalFile(colorInput.files[0], 'Group color dictionary')
        ]);
        state.localNames = {
          edges: edgeInput.files[0].name,
          nodes: nodeInput.files[0] ? nodeInput.files[0].name : '',
          colors: colorInput.files[0] ? colorInput.files[0].name : ''
        };
        state.sourceUrls = { edges: '', nodes: '', colors: '' };
        configureDownloads();
        await loadTexts(edgeText, nodeText, colorText, true);
      } catch (error) {
        showError(error);
      }
    });
    state.els.demoReload.addEventListener('click', loadHostedInputs);
    updateDemoState();
  }

  function bindElements() {
    const ids = [
      'networkSvg', 'networkRootGroup', 'networkEdgesGroup', 'networkNodesGroup', 'networkLabelsGroup',
      'networkViewport', 'networkTooltip', 'networkError', 'networkToast', 'networkOverlay',
      'networkOverlayTitle', 'networkOverlayDetail', 'networkOverlaySpinner', 'networkSearch',
      'networkSearchClear', 'networkSearchCount', 'networkStatus', 'networkSelectionSummary',
      'networkLayout', 'networkRunLayout', 'networkLayoutProgress', 'networkThresholdSlider',
      'networkThresholdNumber', 'networkThresholdValue', 'networkNodeSize', 'networkShowLabels',
      'networkShowIsolates', 'networkOnlyIncluded', 'networkCommunityMethod',
      'networkCommunityResolutionSlider', 'networkCommunityResolutionNumber', 'networkCommunityWeighted',
      'networkCommunitySeed', 'networkCommunityIterations', 'networkRecomputeCommunities',
      'networkColorBy', 'networkGroupLayoutBy', 'networkRelayoutGroups', 'networkCommunitySummary',
      'networkFit', 'networkZoomIn', 'networkZoomOut', 'networkZoomValue',
      'networkReleaseAll', 'networkResetPositions', 'networkClearSelection', 'networkLegendWrap',
      'networkLegendTitle', 'networkLegend', 'networkSourceSummary', 'networkDownloadEdges', 'networkDownloadNodes',
      'networkDownloadColors', 'networkDiagnostics', 'networkDiagnosticsBody', 'networkDemoLoader',
      'networkDemoEdgeInput', 'networkDemoNodeInput', 'networkDemoColorInput', 'networkDemoEdgeName',
      'networkDemoNodeName', 'networkDemoColorName', 'networkDemoLoad', 'networkDemoReload',
      'networkDemoClearNodes', 'networkDemoClearColors', 'networkExportIncludeIsolates', 'networkDownloadGeneratedYaml',
      'networkDownloadCommunityColors', 'networkExportSummary', 'appTitle', 'appSubtitle',
      'paperHeader', 'paperTitleEl', 'figureTitleEl'
    ];
    ids.forEach((id) => {
      const key = id
        .replace(/^network/, '')
        .replace(/^./, (character) => character.toLowerCase());
      state.els[key] = document.getElementById(id);
    });
    state.els.svg = state.els.svg;
    state.els.rootGroup = state.els.rootGroup;
    state.els.edgesGroup = state.els.edgesGroup;
    state.els.nodesGroup = state.els.nodesGroup;
    state.els.labelsGroup = state.els.labelsGroup;
    state.els.tooltip = state.els.tooltip;
    state.els.error = state.els.error;
    state.els.toast = state.els.toast;
    state.els.overlay = state.els.overlay;
    state.els.status = state.els.status;
    state.els.searchInput = state.els.search;
    state.els.searchClear = state.els.searchClear;
    state.els.searchCount = state.els.searchCount;
    state.els.layoutSelect = state.els.layout;
    state.els.runLayout = state.els.runLayout;
    state.els.layoutProgress = state.els.layoutProgress;
    state.els.thresholdSlider = state.els.thresholdSlider;
    state.els.thresholdNumber = state.els.thresholdNumber;
    state.els.thresholdValue = state.els.thresholdValue;
    state.els.nodeSizeSelect = state.els.nodeSize;
    state.els.showLabels = state.els.showLabels;
    state.els.showIsolates = state.els.showIsolates;
    state.els.onlyIncluded = state.els.onlyIncluded;
    state.els.communityMethod = state.els.communityMethod;
    state.els.communityResolutionSlider = state.els.communityResolutionSlider;
    state.els.communityResolutionNumber = state.els.communityResolutionNumber;
    state.els.communityWeighted = state.els.communityWeighted;
    state.els.communitySeed = state.els.communitySeed;
    state.els.communityIterations = state.els.communityIterations;
    state.els.recomputeCommunities = state.els.recomputeCommunities;
    state.els.colorBy = state.els.colorBy;
    state.els.groupLayoutBy = state.els.groupLayoutBy;
    state.els.relayoutGroups = state.els.relayoutGroups;
    state.els.communitySummary = state.els.communitySummary;
    state.els.legendTitle = state.els.legendTitle;
    state.els.clearSelection = state.els.clearSelection;
    state.els.legendWrap = state.els.legendWrap;
    state.els.legend = state.els.legend;
    state.els.sourceSummary = state.els.sourceSummary;
    state.els.downloadEdges = state.els.downloadEdges;
    state.els.downloadNodes = state.els.downloadNodes;
    state.els.downloadColors = state.els.downloadColors;
    state.els.diagnostics = state.els.diagnostics;
    state.els.diagnosticsBody = state.els.diagnosticsBody;
    state.els.demoLoader = state.els.demoLoader;
    state.els.demoEdgeInput = state.els.demoEdgeInput;
    state.els.demoNodeInput = state.els.demoNodeInput;
    state.els.demoColorInput = state.els.demoColorInput;
    state.els.demoEdgeName = state.els.demoEdgeName;
    state.els.demoNodeName = state.els.demoNodeName;
    state.els.demoColorName = state.els.demoColorName;
    state.els.demoLoad = state.els.demoLoad;
    state.els.demoReload = state.els.demoReload;
    state.els.demoClearNodes = state.els.demoClearNodes;
    state.els.demoClearColors = state.els.demoClearColors;
    state.els.exportIncludeIsolates = state.els.exportIncludeIsolates;
    state.els.downloadGeneratedYaml = state.els.downloadGeneratedYaml;
    state.els.downloadCommunityColors = state.els.downloadCommunityColors;
    state.els.exportSummary = state.els.exportSummary;
    state.els.selectionSummary = state.els.selectionSummary;
    state.els.zoomValue = state.els.zoomValue;
    state.els.overlayTitle = state.els.overlayTitle;
    state.els.overlayDetail = state.els.overlayDetail;
    state.els.overlaySpinner = state.els.overlaySpinner;
  }

  function bindControls() {
    state.els.searchInput.addEventListener('input', applySearch);
    state.els.searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && state.searchMatches.size) {
        const id = state.searchMatches.values().next().value;
        const node = state.graph.nodeMap.get(id);
        if (node) {
          state.selectedNodes.clear();
          state.selectedNodes.add(id);
          updateInteractionStyles();
          centerOnNode(node);
          updateSelectionSummary();
        }
      }
    });
    state.els.searchClear.addEventListener('click', () => {
      state.els.searchInput.value = '';
      applySearch();
      state.els.searchInput.focus();
    });
    state.els.layoutSelect.addEventListener('change', () => {
      state.layoutName = state.els.layoutSelect.value;
      runCurrentLayout({ fit: true });
    });
    state.els.runLayout.addEventListener('click', () => runCurrentLayout({ reseed: false, fit: true }));
    state.els.thresholdSlider.addEventListener('input', () => {
      state.threshold = sliderToThreshold(state.els.thresholdSlider.value);
      updateThresholdControls();
      refreshVisibleGraph();
    });
    state.els.thresholdNumber.addEventListener('change', () => {
      const max = state.graph ? state.graph.maxEdgeCount : Infinity;
      state.threshold = Math.max(0, Math.min(max, Number(state.els.thresholdNumber.value) || 0));
      updateThresholdControls();
      refreshVisibleGraph();
    });
    state.els.nodeSizeSelect.addEventListener('change', () => {
      state.nodeSizeMode = state.els.nodeSizeSelect.value;
      refreshVisibleGraph();
    });
    state.els.showLabels.addEventListener('change', () => {
      state.showLabels = state.els.showLabels.checked;
      if (state.els.labelsGroup) state.els.labelsGroup.hidden = !state.showLabels;
    });
    state.els.showIsolates.addEventListener('change', () => {
      state.showIsolates = state.els.showIsolates.checked;
      refreshVisibleGraph({ fit: true });
    });
    if (state.els.onlyIncluded) state.els.onlyIncluded.addEventListener('change', () => {
      const hasNodeYaml = Boolean(state.graph && state.graph.metadata && state.graph.metadata.hasNodeYaml);
      state.onlyIncluded = hasNodeYaml && state.els.onlyIncluded.checked;
      refreshVisibleGraph({ fit: true });
      runCurrentLayout({ instant: true, fit: true });
    });
    if (state.els.communityMethod) state.els.communityMethod.addEventListener('change', () => {
      state.communityMethod = state.els.communityMethod.value;
      if (state.communityMethod === 'none') {
        if (state.colorBy === 'community') state.colorBy = 'function';
        if (state.groupLayoutBy === 'community') state.groupLayoutBy = 'function';
      }
      refreshVisibleGraph();
    });
    function syncResolution(value) {
      state.communityResolution = Math.max(0.05, Math.min(10, Number(value) || 1));
      if (state.els.communityResolutionSlider) state.els.communityResolutionSlider.value = state.communityResolution;
      if (state.els.communityResolutionNumber) state.els.communityResolutionNumber.value = state.communityResolution;
      refreshVisibleGraph();
    }
    if (state.els.communityResolutionSlider) state.els.communityResolutionSlider.addEventListener('input', () => syncResolution(state.els.communityResolutionSlider.value));
    if (state.els.communityResolutionNumber) state.els.communityResolutionNumber.addEventListener('change', () => syncResolution(state.els.communityResolutionNumber.value));
    if (state.els.communityWeighted) state.els.communityWeighted.addEventListener('change', () => {
      state.communityWeighted = state.els.communityWeighted.checked;
      refreshVisibleGraph();
    });
    if (state.els.communitySeed) state.els.communitySeed.addEventListener('change', () => {
      state.communitySeed = Number(state.els.communitySeed.value) || 42;
      refreshVisibleGraph();
    });
    if (state.els.communityIterations) state.els.communityIterations.addEventListener('change', () => {
      state.communityIterations = Math.max(1, Math.min(250, Number(state.els.communityIterations.value) || 20));
      state.els.communityIterations.value = state.communityIterations;
      refreshVisibleGraph();
    });
    if (state.els.recomputeCommunities) state.els.recomputeCommunities.addEventListener('click', () => {
      refreshVisibleGraph();
      showToast(`Communities recomputed from ${state.visibleNodes.length.toLocaleString()} visible nodes and ${state.visibleEdges.length.toLocaleString()} visible relationships.`);
    });
    if (state.els.colorBy) state.els.colorBy.addEventListener('change', () => {
      state.colorBy = state.els.colorBy.value;
      renderGraph();
      renderLegend();
      updateStatus();
    });
    if (state.els.groupLayoutBy) state.els.groupLayoutBy.addEventListener('change', () => {
      state.groupLayoutBy = state.els.groupLayoutBy.value;
      if (state.layoutName === 'grouped-spring') runCurrentLayout({ fit: true });
    });
    if (state.els.relayoutGroups) state.els.relayoutGroups.addEventListener('click', () => {
      state.layoutName = 'grouped-spring';
      state.els.layoutSelect.value = state.layoutName;
      runCurrentLayout({ fit: true });
    });
    if (state.els.exportIncludeIsolates) state.els.exportIncludeIsolates.addEventListener('change', () => {
      state.exportIncludeIsolates = state.els.exportIncludeIsolates.checked;
      updateExportControls();
    });
    if (state.els.downloadGeneratedYaml) state.els.downloadGeneratedYaml.addEventListener('click', () => {
      const model = currentExportModel();
      if (!model || !model.communities.length) return;
      const method = sanitizeFilenamePart(state.communityMethod);
      downloadTextFile(`network-nodes-${method}-min-${sanitizeFilenamePart(state.threshold)}.yaml`, generatedNodeYaml(model), 'text/yaml;charset=utf-8');
      showToast(`Generated node YAML with ${model.endpoints.length.toLocaleString()} TSV node identifiers.`);
    });
    if (state.els.downloadCommunityColors) state.els.downloadCommunityColors.addEventListener('click', () => {
      const model = currentExportModel();
      if (!model || !model.communities.length) return;
      const method = sanitizeFilenamePart(state.communityMethod);
      downloadTextFile(`network-community-colors-${method}-min-${sanitizeFilenamePart(state.threshold)}.yaml`, generatedCommunityColorYaml(model), 'text/yaml;charset=utf-8');
      showToast(`Generated a color dictionary for ${model.communities.length.toLocaleString()} communities.`);
    });
    state.els.fit.addEventListener('click', () => fitNetwork(true));
    state.els.zoomIn.addEventListener('click', () => zoomBy(1.35));
    state.els.zoomOut.addEventListener('click', () => zoomBy(1 / 1.35));
    state.els.releaseAll.addEventListener('click', releaseAllNodes);
    state.els.resetPositions.addEventListener('click', resetPositions);
    state.els.clearSelection.addEventListener('click', clearSelection);
    state.els.viewport.addEventListener('pointerdown', onViewportPointerDown);
    state.els.viewport.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointermove', onGlobalPointerMove);
    window.addEventListener('pointerup', onGlobalPointerUp);
    window.addEventListener('pointercancel', onGlobalPointerUp);
    state.resizeObserver = new ResizeObserver(() => {
      clearTimeout(state.resizeTimer);
      state.resizeTimer = setTimeout(() => {
        if (state.graph && state.camera.k === 1) fitNetwork(true);
      }, 150);
    });
    state.resizeObserver.observe(state.els.viewport);
  }

  function centerOnNode(node) {
    const rect = state.els.svg.getBoundingClientRect();
    const targetK = Math.max(state.camera.k, 1.4);
    state.camera.k = targetK;
    state.camera.x = rect.width / 2 - node.x * targetK;
    state.camera.y = rect.height / 2 - node.y * targetK;
    applyCamera();
  }

  function applyPageMetadata() {
    const config = state.config;
    if (state.els.appTitle) state.els.appTitle.textContent = config.title;
    if (state.els.appSubtitle) state.els.appSubtitle.textContent = config.subtitle;
    document.title = config.figureTitle ? `${config.figureTitle} · ${config.title}` : config.title;
    if (config.paperTitle || config.figureTitle) {
      state.els.paperHeader.hidden = false;
      if (config.paperTitle) {
        state.els.paperTitleEl.textContent = config.paperTitle;
        state.els.paperTitleEl.hidden = false;
      }
      if (config.figureTitle) {
        state.els.figureTitleEl.textContent = config.figureTitle;
        state.els.figureTitleEl.hidden = false;
      }
    }
  }

  function init() {
    if (typeof document === 'undefined') return;
    state.config = mergeConfig(DEFAULT_CONFIG, global.NETWORK_VIEWER_CONFIG || {});
    bindElements();
    applyPageMetadata();
    state.threshold = state.config.defaultMinimumCount;
    state.layoutName = state.config.defaultLayout;
    state.nodeSizeMode = state.config.defaultNodeSize;
    state.showLabels = state.config.defaultShowLabels;
    state.showIsolates = state.config.defaultShowIsolates;
    state.onlyIncluded = state.config.defaultOnlyIncluded !== false;
    state.communityMethod = state.config.defaultCommunityMethod || 'none';
    state.communityResolution = Number(state.config.defaultCommunityResolution) || 1;
    state.communityWeighted = state.config.defaultCommunityWeighted !== false;
    state.communitySeed = Number(state.config.defaultCommunitySeed) || 42;
    state.communityIterations = Number(state.config.defaultCommunityIterations) || 20;
    state.colorBy = state.config.defaultColorBy || 'function';
    state.groupLayoutBy = state.config.defaultGroupLayoutBy || 'function';
    bindControls();
    setupDemoLoader();
    if (state.config.autoLoad) loadHostedInputs();
    else showOverlay('Choose network files', 'Load an edge TSV to begin. Node YAML and colors are optional.', false);
  }

  const testApi = {
    parseFlatYaml,
    parseTsv,
    buildGraph,
    detectCommunities,
    createCommunityGraph,
    modularityForMembership,
    computeLayout,
    normalizeToken,
    parseInclude,
    currentExportModel,
    generatedNodeYaml,
    generatedCommunityColorYaml,
    VERSION
  };

  const api = { init, version: VERSION, _test: testApi };
  if (typeof module !== 'undefined' && module.exports) module.exports = testApi;
  global.NetworkViewer = api;
}(typeof window !== 'undefined' ? window : globalThis));
