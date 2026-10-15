/* EvoSupplement Neighborhood Analysis — local, editor-only computational core. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NeighborhoodAnalysisCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '1.0.0';
  const MAX_PAIR_BUDGET = 25000000;
  const clean = value => String(value == null ? '' : value).trim();
  const compareText = (a, b) => String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  const unique = values => [...new Set(values)];
  const countMap = values => { const result = Object.create(null); for (const value of values) result[value] = (result[value] || 0) + 1; return result; };
  const knownDomain = value => { const name = clean(value); return name && !['?', '-', 'unknown', 'unannotated'].includes(name.toLowerCase()); };
  function failure(code, message) { const error = new Error(message); error.code = code; return error; }
  function numberOption(value, fallback, min, max, integer) {
    const n = value == null || value === '' ? fallback : Number(value);
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw failure('INVALID_OPTIONS', `Expected a ${integer ? 'whole ' : ''}number between ${min} and ${max}; received ${value}.`);
    return n;
  }
  function normalizeOptions(options) {
    const input = options || {};
    const pick = (key, fallback, allowed) => { const value = input[key] == null ? fallback : input[key]; if (!allowed.includes(value)) throw failure('INVALID_OPTIONS', `Unsupported ${key}: ${value}.`); return value; };
    return {
      representation: pick('representation', 'raw', ['raw', 'display']), excludeQuery: input.excludeQuery !== false,
      metric: pick('metric', 'jaccard', ['jaccard', 'weighted']), minDomains: numberOption(input.minDomains, 1, 0, 100000, true),
      threshold: numberOption(input.threshold, 0.5, 0, 1, false), maxNeighbors: numberOption(input.maxNeighbors, 10, 1, 100, true),
      grouping: pick('grouping', 'components', ['components', 'label-propagation']),
      overlapPolicy: pick('overlapPolicy', 'representative', ['representative', 'keep']),
      queryWindow: numberOption(input.queryWindow, 2, 0, 20, true),
      maxPairs: numberOption(input.maxPairs, 2000000, 1, MAX_PAIR_BUDGET, true),
      maxEdges: numberOption(input.maxEdges, 25000, 1, 250000, true),
      alternatives: { enabled: true, minSupport: 5, minExpected: 1, maxBothRate: 0.2, maxQ: 1, stratumField: '', stratumValue: '', maxPairs: 250000, maxContextCandidates: 500, ...(input.alternatives || {}), excludeQuery: input.excludeQuery !== false }
    };
  }
  function domainToken(gene) {
    return `${gene.query ? 'Q' : ''}${gene.strand === '-' ? '←' : '→'}[${gene.domains.length ? gene.domains.map(d => d.id).join(' | ') : '?'}]`;
  }
  function geneSignature(gene) { return [gene.query ? 1 : 0, gene.strand, gene.domains.map(d => d.id)]; }
  function entryObservation(entry, options, index) {
    const originalGenes = (Array.isArray(entry.genes) ? entry.genes : []).map((gene, originalIndex) => ({ ...gene, originalIndex })).sort((a, b) => {
      const sa = Number(a.start), sb = Number(b.start), ea = Number(a.end), eb = Number(b.end);
      return (Number.isFinite(sa) && Number.isFinite(sb) ? sa - sb : 0) || (Number.isFinite(ea) && Number.isFinite(eb) ? ea - eb : 0) || a.originalIndex - b.originalIndex;
    });
    if (!originalGenes.length) return null;
    const queries = originalGenes.filter(gene => gene.query || gene.isQuery);
    const firstGenomicQuery = queries[0] || originalGenes[Math.floor(originalGenes.length / 2)];
    const divergentQueries = queries.some(gene => (gene.strand === '-' ? '-' : '+') !== (firstGenomicQuery.strand === '-' ? '-' : '+'));
    // Anchor to the first query after direction normalization, so reverse-
    // complement views with multiple co-oriented queries retain identical offsets.
    // Mixed query directions use the explicit first-genomic-query convention.
    const originalAnchor = queries.length && !divergentQueries && firstGenomicQuery.strand === '-' ? queries[queries.length - 1] : firstGenomicQuery;
    const flip = originalAnchor.strand === '-';
    const coordinateSource = entry.coordinateSource === 'synthetic' ? 'synthetic' : clean(entry.nucleotide || entry.contig) ? 'genomic' : 'unavailable';
    const contig = clean(entry.nucleotide || entry.contig);
    const id = clean(entry.id) || `observation-${index + 1}`;
    const sourceId = clean(entry.sourceId || entry.originalId || entry.id) || id;
    const locusKeys = originalGenes.map(gene => coordinateSource === 'genomic' && Number.isFinite(Number(gene.start)) && Number.isFinite(Number(gene.end))
      ? JSON.stringify([contig, Math.min(Number(gene.start), Number(gene.end)), Math.max(Number(gene.start), Number(gene.end)), gene.strand === '-' ? '-' : '+'])
      : JSON.stringify([sourceId, clean(gene.pid || gene.id), gene.originalIndex]));
    const genes = (flip ? [...originalGenes].reverse() : originalGenes).map(gene => {
      const domains = (gene.domains || []).filter(domain => !domain.marker && knownDomain(domain.rawName || domain.name)).map(domain => {
        const rawName = clean(domain.rawName || domain.name), name = clean(domain.name || domain.rawName);
        return { id: options.representation === 'display' ? name : rawName, rawName, name, marker: false, profiledb: clean(domain.profiledb || gene.profiledb), order: domain.order, proteinStart: Number.isFinite(domain.proteinStart) ? domain.proteinStart : null, proteinEnd: Number.isFinite(domain.proteinEnd) ? domain.proteinEnd : null };
      });
      return { pid: clean(gene.pid || gene.id), start: Number.isFinite(Number(gene.start)) ? Number(gene.start) : null, end: Number.isFinite(Number(gene.end)) ? Number(gene.end) : null,
        strand: (gene.strand === '-' ? '-' : '+') === (flip ? '-' : '+') ? '+' : '-', originalStrand: gene.strand === '-' ? '-' : '+',
        query: Boolean(gene.query || gene.isQuery), domains, known: domains.length > 0, profiledb: clean(gene.profiledb), metadata: gene.metadata || {}, originalIndex: gene.originalIndex };
    });
    const anchorIndex = genes.findIndex(gene => gene.originalIndex === originalAnchor.originalIndex);
    genes.forEach((gene, i) => { gene.relativePosition = i - anchorIndex; gene.token = domainToken(gene); });
    const domainValues = genes.flatMap(gene => options.excludeQuery && gene.query ? [] : gene.domains.map(domain => domain.id));
    const counts = countMap(domainValues), domainIds = Object.keys(counts).sort(compareText);
    const adjacencyKeys = [];
    for (let i = 0; i + 1 < genes.length; i += 1) if (genes[i].known && genes[i + 1].known) adjacencyKeys.push(JSON.stringify([geneSignature(genes[i]), geneSignature(genes[i + 1])]));
    return { id, label: clean(entry.originalId || entry.sourceId || entry.id) || id, members: [id], sourceIds: [sourceId], genes, domainIds, counts, queryIndices: genes.map((g, i) => g.query ? i : -1).filter(i => i >= 0),
      anchor: { pid: clean(originalAnchor.pid || originalAnchor.id), index: anchorIndex, originalStrand: originalAnchor.strand === '-' ? '-' : '+', divergentQueries, hasQuery: queries.length > 0 },
      coordinateSource, nucleotide: contig, taxid: clean(entry.taxid), organism: clean(entry.organism), lineage: clean(entry.lineage), classification: clean(entry.classification), assembly: clean(entry.assembly), metadata: entry.metadata || {},
      segmentIndex: entry.segmentIndex == null ? null : entry.segmentIndex, segmentCount: entry.segmentCount == null ? null : entry.segmentCount,
      locusKeys, locusSignature: JSON.stringify(locusKeys), adjacencyKeys: unique(adjacencyKeys), duplicateCount: 0, overlapCount: 0 };
  }
  class UnionFind {
    constructor(n) { this.parents = Array.from({ length: n }, (_, i) => i); this.sizes = new Array(n).fill(1); }
    find(i) { while (this.parents[i] !== i) { this.parents[i] = this.parents[this.parents[i]]; i = this.parents[i]; } return i; }
    union(a, b) { a = this.find(a); b = this.find(b); if (a === b) return; if (this.sizes[a] < this.sizes[b] || (this.sizes[a] === this.sizes[b] && a > b)) [a, b] = [b, a]; this.parents[b] = a; this.sizes[a] += this.sizes[b]; }
  }
  function representativeOrder(a, b) { return b.queryIndices.length - a.queryIndices.length || b.domainIds.length - a.domainIds.length || b.genes.length - a.genes.length || compareText(a.id, b.id); }
  function prepare(snapshot, rawOptions) {
    if (!snapshot || !Array.isArray(snapshot.entries)) throw failure('INVALID_SNAPSHOT', 'The analysis snapshot must contain neighborhood entries.');
    const options = normalizeOptions(rawOptions), warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings.map(String) : [], excluded = [], seenIds = new Set();
    let observations = snapshot.entries.map((entry, i) => entryObservation(entry, options, i)).filter(Boolean);
    for (const observation of observations) { if (seenIds.has(observation.id)) throw failure('DUPLICATE_ID', `The analysis snapshot contains a duplicate neighborhood ID: ${observation.id}.`); seenIds.add(observation.id); }
    const noQuery = observations.filter(observation => !observation.anchor.hasQuery).length;
    observations = observations.filter(observation => { if (observation.anchor.hasQuery) return true; excluded.push({ id: observation.id, members: observation.members, reason: 'No annotated query gene' }); return false; });
    let exactDuplicates = 0, overlapRemoved = 0, duplicateAnnotations = 0;
    const exact = new Map();
    // A group must not lose an analyzable member because another row has more
    // queries but no eligible non-query composition. Preserve the existing
    // deterministic ranking within the eligible and ineligible subsets.
    const selectRepresentative = (a, b) => Number(b.domainIds.length >= options.minDomains) - Number(a.domainIds.length >= options.minDomains) || representativeOrder(a, b);
    observations.sort(selectRepresentative);
    for (const observation of observations) {
      const prior = exact.get(observation.locusSignature);
      if (!prior) { exact.set(observation.locusSignature, observation); continue; }
      if (JSON.stringify(prior.genes.map(geneSignature)) !== JSON.stringify(observation.genes.map(geneSignature))) duplicateAnnotations += 1;
      prior.members.push(...observation.members); prior.sourceIds = unique([...prior.sourceIds, ...observation.sourceIds]); prior.duplicateCount += 1; exactDuplicates += 1;
    }
    observations = [...exact.values()];
    const overlap = new UnionFind(observations.length), owners = new Map();
    observations.forEach((observation, i) => {
      if (observation.coordinateSource !== 'genomic') return;
      for (const locus of observation.locusKeys) { if (owners.has(locus)) overlap.union(i, owners.get(locus)); else owners.set(locus, i); }
    });
    // Shared gene IDs catch identical loci; interval overlap also catches partially
    // intersecting blocks with different gene boundaries/annotations.
    const genomicIntervals = new Map();
    observations.forEach((observation, index) => {
      if (observation.coordinateSource !== 'genomic') return;
      const coordinates = observation.genes.flatMap(gene => [gene.start, gene.end]).filter(Number.isFinite);
      if (!coordinates.length) return;
      if (!genomicIntervals.has(observation.nucleotide)) genomicIntervals.set(observation.nucleotide, []);
      genomicIntervals.get(observation.nucleotide).push({ index, start: Math.min(...coordinates), end: Math.max(...coordinates) });
    });
    for (const intervals of genomicIntervals.values()) {
      intervals.sort((a, b) => a.start - b.start || a.end - b.end || a.index - b.index);
      let active = null;
      for (const interval of intervals) {
        if (active && interval.start <= active.end) { overlap.union(active.index, interval.index); if (interval.end > active.end) active = { index: active.index, start: active.start, end: interval.end }; }
        else active = interval;
      }
    }
    const overlapGroups = new Map();
    observations.forEach((observation, i) => { const key = overlap.find(i); if (!overlapGroups.has(key)) overlapGroups.set(key, []); overlapGroups.get(key).push(observation); });
    const overlappingComponents = [...overlapGroups.values()].filter(group => group.length > 1).length;
    if (options.overlapPolicy === 'representative') {
      observations = [...overlapGroups.values()].map(group => {
        group.sort(selectRepresentative); const representative = group[0];
        for (const other of group.slice(1)) { representative.members.push(...other.members); representative.sourceIds = unique([...representative.sourceIds, ...other.sourceIds]); representative.overlapCount += 1 + other.overlapCount; representative.duplicateCount += other.duplicateCount; overlapRemoved += 1; }
        return representative;
      });
    }
    const beforeMinimum = observations.length;
    observations = observations.filter(observation => { if (observation.domainIds.length >= options.minDomains) return true; excluded.push({ id: observation.id, members: observation.members, reason: 'Below minimum annotated composition domains' }); return false; }).sort((a, b) => compareText(a.id, b.id));
    const divergent = observations.filter(o => o.anchor.divergentQueries).length;
    const synthetic = observations.filter(o => o.coordinateSource === 'synthetic').length, unknownGenes = observations.reduce((sum, o) => sum + o.genes.filter(g => !g.known).length, 0);
    if (duplicateAnnotations) warnings.push(`${duplicateAnnotations} duplicate locus row(s) differed in annotation or query designation. A deterministic representative was retained (meets the annotated-domain minimum first, then most queries, distinct domains, genes, and ID); merged support was not counted twice.`);
    if (exactDuplicates) warnings.push(`${exactDuplicates} exact duplicate locus observation(s) were collapsed; all source links are retained.`);
    if (overlapRemoved) warnings.push(`${overlapRemoved} overlapping observation(s) were represented by one deterministic member per overlapping genomic component. Counts use representatives, not all linked rows.`);
    if (overlappingComponents && options.overlapPolicy === 'keep') warnings.push(`${overlappingComponents} overlapping genomic component(s) remain as separate observations; their support is not independent.`);
    if (noQuery) warnings.push(`${noQuery} observation(s) without an annotated query were excluded. Every analyzed observation is anchored to a query.`);
    if (divergent) warnings.push(`${divergent} observation(s) contain queries with opposing orientations. The first query in genomic/input order determines orientation.`);
    if (synthetic) warnings.push(`${synthetic} compact observation(s) use synthetic coordinates: content and order are analyzed, not genomic distances. Cross-block overlap cannot be inferred from these coordinates.`);
    if (unknownGenes) warnings.push(`${unknownGenes} unannotated gene(s) remain as unknown order placeholders; missing annotation is not evidence of biological absence.`);
    if (beforeMinimum !== observations.length) warnings.push(`${beforeMinimum - observations.length} observation(s) fell below the minimum of ${options.minDomains} annotated composition domains.`);
    if (options.representation === 'display') warnings.push('Renamed display groups are the analysis units; different original domain IDs may be merged. The export retains their mapping.');
    const mapping = new Map();
    for (const observation of observations) for (const gene of observation.genes) for (const domain of gene.domains) { if (!mapping.has(domain.id)) mapping.set(domain.id, { id: domain.id, rawIds: new Set(), displayNames: new Set() }); const item = mapping.get(domain.id); item.rawIds.add(domain.rawName); item.displayNames.add(domain.name); }
    const domainMapping = [...mapping.values()].map(item => ({ id: item.id, rawIds: [...item.rawIds].sort(compareText), displayNames: [...item.displayNames].sort(compareText) })).sort((a, b) => compareText(a.id, b.id));
    return { options, observations, warnings, excluded, summary: { inputEntries: snapshot.entries.length, observations: observations.length, exactDuplicates, duplicateAnnotations, overlapRemoved, overlappingComponents, belowMinimum: beforeMinimum - observations.length, noQuery, divergentQueries: divergent, syntheticCoordinates: synthetic, unknownGenes },
      provenance: { scope: snapshot.scope || 'visible', filters: snapshot.filters || {}, source: snapshot.source || {}, representation: options.representation, domainMapping,
        methods: { unit: 'query-connected neighborhood segment', composition: options.metric === 'weighted' ? 'count-weighted Jaccard: sum(minimum counts) / sum(maximum counts)' : 'presence Jaccard: intersection / union', excludeQuery: options.excludeQuery ? 'Query genes are excluded from composition; retained in order and gene context.' : 'Query genes are included.', orientation: 'Co-oriented queries use the first query in normalized right-pointing order (last genomic/input query for negative-strand queries). Opposing queries use the first genomic/input query and are flagged. Gene order and arrows reverse; protein N-to-C domain order does not.', unknowns: 'Unknown genes retain order positions; adjacent-order similarity uses pairs where both genes are annotated.', overlap: options.overlapPolicy === 'representative' ? 'Exact locus duplicates collapsed; overlapping-genomic-interval connected components use one deterministic representative.' : 'Exact locus duplicates collapsed; overlapping observations retained.', representativeSelection: 'Prefer a member meeting the annotated composition-domain minimum; then most queries, most distinct composition domains, most genes, and lexicographically first ID.', inference: 'Descriptive similarities and candidate associations; no evolutionary replacement direction is inferred.' } } };
  }
  function jaccard(a, b) { const A = a instanceof Set ? a : new Set(a), B = b instanceof Set ? b : new Set(b); let intersection = 0; for (const id of A) if (B.has(id)) intersection += 1; const union = A.size + B.size - intersection; return union ? intersection / union : 0; }
  function compare(a, b, metric) {
    let compositionSimilarity;
    if (metric === 'weighted') { let numerator = 0, denominator = 0; const ids = new Set([...a.domainIds, ...b.domainIds]); for (const id of ids) { const left = a.counts[id] || 0, right = b.counts[id] || 0; numerator += Math.min(left, right); denominator += Math.max(left, right); } compositionSimilarity = denominator ? numerator / denominator : 0; }
    else compositionSimilarity = jaccard(a.domainIds, b.domainIds);
    return { similarity: compositionSimilarity, compositionSimilarity, orderSimilarity: jaccard(a.adjacencyKeys || [], b.adjacencyKeys || []) };
  }
  function patternsFor(observations, windowSize) {
    const inventories = { complete: new Map(), adjacent: new Map(), triplets: new Map(), queryWindows: new Map() };
    function add(kind, genes, observation) {
      if (!genes.length) return;
      const signature = JSON.stringify(genes.map(geneSignature)), table = inventories[kind];
      if (!table.has(signature)) table.set(signature, { signature, pattern: genes.map(g => g.token).join('  '), occurrences: 0, members: new Set() });
      const item = table.get(signature); item.occurrences += 1; item.members.add(observation.id);
    }
    for (const observation of observations) {
      add('complete', observation.genes, observation);
      for (let i = 0; i + 1 < observation.genes.length; i += 1) add('adjacent', observation.genes.slice(i, i + 2), observation);
      for (let i = 0; i + 2 < observation.genes.length; i += 1) add('triplets', observation.genes.slice(i, i + 3), observation);
      for (const index of observation.queryIndices) add('queryWindows', observation.genes.slice(Math.max(0, index - windowSize), index + windowSize + 1), observation);
    }
    return Object.fromEntries(Object.entries(inventories).map(([kind, table]) => [kind, [...table.values()].map(item => ({ ...item, members: [...item.members].sort(compareText), count: item.members.size, frequency: observations.length ? item.members.size / observations.length : 0 })).sort((a, b) => b.count - a.count || compareText(a.signature, b.signature)).map((item, i) => ({ id: `${kind}-${i + 1}`, ...item }))]));
  }
  async function analyze(snapshot, rawOptions, hooks) {
    hooks = hooks || {}; const prepared = prepare(snapshot, rawOptions), { options, observations } = prepared, n = observations.length;
    const progress = (phase, completed, total, message) => { if (hooks.isCancelled && hooks.isCancelled()) throw failure('CANCELLED', 'Analysis cancelled.'); if (hooks.onProgress) hooks.onProgress({ phase, completed, total, message }); };
    const yieldNow = async () => { if (hooks.yield !== false) await new Promise(resolve => setTimeout(resolve, 0)); if (hooks.isCancelled && hooks.isCancelled()) throw failure('CANCELLED', 'Analysis cancelled.'); };
    progress('prepare', n, n, 'Neighborhood observations prepared.'); await yieldNow();
    const postings = new Map(); observations.forEach((observation, i) => { for (const id of observation.domainIds) { if (!postings.has(id)) postings.set(id, []); postings.get(id).push(i); } });
    const possiblePairs = n * (n - 1) / 2, visited = new Int32Array(n), candidates = new Array(n); let candidatePairs = 0;
    for (let i = 0; i < n; i += 1) {
      const row = [];
      if (options.threshold === 0) { for (let j = i + 1; j < n; j += 1) row.push(j); }
      else for (const id of observations[i].domainIds) for (const j of postings.get(id)) if (j > i && visited[j] !== i + 1) { visited[j] = i + 1; row.push(j); }
      candidatePairs += row.length;
      if (candidatePairs > options.maxPairs) throw failure('PAIR_BUDGET', `This analysis requires more than ${options.maxPairs.toLocaleString()} candidate comparisons (${possiblePairs.toLocaleString()} possible pairs). No partial network was returned. Filter the neighborhoods or raise the comparison budget (maximum ${MAX_PAIR_BUDGET.toLocaleString()}).`);
      candidates[i] = row.sort((a, b) => a - b);
      if (i % 100 === 0) { progress('candidates', i, n, 'Counting exact positive-similarity candidates.'); await yieldNow(); }
    }
    const top = Array.from({ length: n }, () => []); let evaluated = 0, qualified = 0;
    const edgeOrder = (a, b) => b.similarity - a.similarity || a.i - b.i || a.j - b.j;
    function retain(index, edge) { const list = top[index]; let at = list.length; while (at > 0 && edgeOrder(edge, list[at - 1]) < 0) at -= 1; if (at < options.maxNeighbors) { list.splice(at, 0, edge); if (list.length > options.maxNeighbors) list.pop(); } }
    for (let i = 0; i < n; i += 1) {
      for (const j of candidates[i]) { const scores = compare(observations[i], observations[j], options.metric); evaluated += 1; if (scores.similarity >= options.threshold) { const edge = { i, j, ...scores }; qualified += 1; retain(i, edge); retain(j, edge); } if (evaluated % 5000 === 0) { progress('similarity', evaluated, candidatePairs, 'Comparing domain composition and annotated gene adjacency.'); await yieldNow(); } }
      candidates[i] = null;
    }
    const edgeMap = new Map(); for (const list of top) for (const edge of list) edgeMap.set(`${edge.i}:${edge.j}`, edge);
    if (edgeMap.size > options.maxEdges) throw failure('EDGE_BUDGET', `The per-node neighbor limit produces ${edgeMap.size.toLocaleString()} edges, above the ${options.maxEdges.toLocaleString()} edge budget. No edges were silently discarded. Reduce the neighbor limit, raise the similarity threshold, or raise the edge budget.`);
    const workingEdges = [...edgeMap.values()].sort((a, b) => a.i - b.i || a.j - b.j), adjacency = Array.from({ length: n }, () => []);
    for (const edge of workingEdges) { adjacency[edge.i].push({ node: edge.j, weight: edge.similarity }); adjacency[edge.j].push({ node: edge.i, weight: edge.similarity }); }
    progress('groups', 0, n, 'Grouping the retained similarity network.'); await yieldNow();
    let labels = Array.from({ length: n }, (_, i) => i), iterations = 0, converged = true;
    if (options.grouping === 'components') { const uf = new UnionFind(n); for (const edge of workingEdges) uf.union(edge.i, edge.j); labels = labels.map((_, i) => uf.find(i)); }
    else {
      converged = false;
      for (iterations = 1; iterations <= 50; iterations += 1) {
        let changes = 0;
        for (let i = 0; i < n; i += 1) {
          if (!adjacency[i].length) continue;
          const scores = new Map(); for (const neighbor of adjacency[i]) scores.set(labels[neighbor.node], (scores.get(labels[neighbor.node]) || 0) + neighbor.weight);
          let selected = labels[i], best = -1;
          for (const [label, score] of scores) if (score > best + 1e-12 || (Math.abs(score - best) <= 1e-12 && label < selected)) { best = score; selected = label; }
          if (labels[i] !== selected) { labels[i] = selected; changes += 1; }
        }
        if (!changes) { converged = true; break; } await yieldNow();
      }
      iterations = Math.min(iterations, 50);
    }
    const grouped = new Map(); labels.forEach((label, i) => { if (!grouped.has(label)) grouped.set(label, []); grouped.get(label).push(i); });
    const groups = [...grouped.values()].sort((a, b) => b.length - a.length || compareText(observations[a[0]].id, observations[b[0]].id)).map((indices, gi) => {
      const id = `group-${gi + 1}`, members = indices.map(i => observations[i].id), domainCounts = countMap(indices.flatMap(i => observations[i].domainIds));
      const representative = [...indices].sort((a, b) => adjacency[b].reduce((s, e) => s + e.weight, 0) - adjacency[a].reduce((s, e) => s + e.weight, 0) || compareText(observations[a].id, observations[b].id))[0];
      indices.forEach(i => { observations[i].groupId = id; });
      return { id, label: `Group ${gi + 1}`, count: indices.length, members, sourceMembers: unique(indices.flatMap(i => observations[i].members)), representative: observations[representative].id,
        domains: Object.entries(domainCounts).map(([domain, count]) => ({ id: domain, count, frequency: count / indices.length })).sort((a, b) => b.count - a.count || compareText(a.id, b.id)) };
    });
    const nodes = observations.map((observation, i) => ({ id: observation.id, label: observation.label, groupId: observation.groupId, degree: adjacency[i].length, strength: adjacency[i].reduce((sum, e) => sum + e.weight, 0), domainCount: observation.domainIds.length, memberCount: observation.members.length, members: observation.members }));
    const edges = workingEdges.map(edge => ({ source: observations[edge.i].id, target: observations[edge.j].id, similarity: edge.similarity, compositionSimilarity: edge.compositionSimilarity, orderSimilarity: edge.orderSimilarity }));
    const patterns = patternsFor(observations, options.queryWindow);
    const warnings = [...prepared.warnings]; if (qualified > edges.length) warnings.push(`${qualified - edges.length} threshold-qualified edge(s) were omitted by the explicit top-${options.maxNeighbors} neighbor sparsification. Groups use this retained network, not the complete threshold graph.`);
    if (!converged) warnings.push('Weighted label propagation reached its 50-iteration limit; the deterministic final partition is reported.');
    const summary = { ...prepared.summary, possiblePairs, candidatePairs, evaluatedPairs: evaluated, skippedZeroPairs: possiblePairs - candidatePairs, qualifiedEdges: qualified, retainedEdges: edges.length, omittedEdges: qualified - edges.length, groups: groups.length, isolates: nodes.filter(node => !node.degree).length,
      topK: options.maxNeighbors, topKPolicy: 'Union of each node’s highest-scoring K neighbors; a node can receive more than K edges.', grouping: options.grouping, groupingIterations: iterations, groupingConverged: converged };
    prepared.provenance.methods.network = 'Exact composition scores for all positive-overlap candidates (all pairs when threshold is zero); threshold followed by union of per-node top-K neighbors. Groups use the retained network.';
    prepared.provenance.methods.order = 'Separate presence Jaccard of annotated adjacent gene signatures; genes preserve boundaries, arrows and query identity.';
    prepared.provenance.methods.patternCounts = 'Number of distinct representative observations containing a pattern; occurrences are also reported. Denominator is all included observations.';
    progress('patterns', n, n, 'Counting complete orders, adjacent pairs, triplets and query windows.');
    return { version: VERSION, revision: snapshot.revision, datasetId: snapshot.datasetId, options, summary, warnings, provenance: prepared.provenance, excluded: prepared.excluded, observations, nodes, edges, groups, patterns };
  }
  return { VERSION, MAX_PAIR_BUDGET, normalizeOptions, prepare, compare, jaccard, analyze, patternsFor };
});
