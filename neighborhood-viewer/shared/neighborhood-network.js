(function (global) {
  'use strict';

  const HEADERS = ['source', 'target', 'edge_type', 'edge_count', 'event_id', 'block_id', 'source_pid', 'target_pid', 'relation'];
  const text = value => String(value == null ? '' : value).trim();
  const unitId = values => JSON.stringify(values);
  const cell = value => {
    const valueText = String(value == null ? '' : value);
    return /[\t\r\n"]/.test(valueText) ? '"' + valueText.replace(/"/g, '""') + '"' : valueText;
  };
  const isUnknown = value => !value || /^(?:\?|\.|nan|null|undefined)$/i.test(value);

  function quotedTsvLine(line) {
    const fields = [];
    let value = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { value += '"'; i += 1; }
        else quoted = !quoted;
      } else if (ch === '\t' && !quoted) { fields.push(value); value = ''; }
      else value += ch;
    }
    fields.push(value);
    return fields;
  }

  // The display reader fills absent/invalid domp values with layout positions.
  // Audit the original standard cells before using those positions as evidence.
  function auditStandardInput(input) {
    const genes = new Map();
    const lines = String(input).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n').filter(line => line.trim());
    const headers = quotedTsvLine(lines.shift() || '').map(value => text(value).toLowerCase());
    const index = Object.fromEntries(headers.map((header, i) => [header, i]));
    lines.forEach(line => {
      const values = quotedTsvLine(line);
      const at = name => text(values[index[name]]);
      const start = Number(at('start'));
      const end = Number(at('end'));
      const key = unitId([at('block_id'), at('pid'), Math.min(start, end), Math.max(start, end)]);
      let audit = genes.get(key);
      if (!audit) { audit = { invalidOrder: false, invalidStrand: false, strands: new Set() }; genes.set(key, audit); }
      const order = at('domp');
      if (!order || !Number.isFinite(Number(order))) audit.invalidOrder = true;
      const strand = at('strand');
      if (!/^(?:[+-]|[+-]?1)$/.test(strand)) audit.invalidStrand = true;
      else audit.strands.add(strand === '-' || strand === '-1' ? '-' : '+');
    });
    return genes;
  }

  /**
   * Convert the viewer's canonical model, rather than interpreting its two file
   * formats independently. A relationship event is one protein (fusion) or one
   * pair of genes in a block (neighborhood). Reciprocal directional annotations
   * share event_id so an undirected consumer can count the evidence once.
   */
  function convert(input, suppliedOptions) {
    if (!global.NeighborhoodViewer || typeof global.NeighborhoodViewer.parseInput !== 'function') {
      throw new Error('The neighborhood reader is unavailable. Load neighborhood-viewer.js before converting an input.');
    }
    const options = Object.assign({ format: 'auto', scope: 'all', proximity: 'all', includeMarkers: false, maxGeneratedRows: 200000, maxPairComparisons: 5000000 }, suppliedOptions || {});
    if (!['all', 'query'].includes(options.scope)) throw new Error('Neighborhood scope must be all or query.');
    if (!['all', 'adjacent'].includes(options.proximity)) throw new Error('Neighborhood proximity must be all or adjacent.');
    const rowLimit = Number(options.maxGeneratedRows);
    const comparisonLimit = Number(options.maxPairComparisons);
    if (!Number.isSafeInteger(rowLimit) || rowLimit < 1 || !Number.isSafeInteger(comparisonLimit) || comparisonLimit < 1) {
      throw new Error('Conversion limits must be positive safe integers.');
    }
    const parsed = global.NeighborhoodViewer.parseInput(input, { format: options.format, config: options.config || {} });
    const warnings = (parsed.warnings || []).slice();
    const sourceAudit = parsed.inputFormat === 'standard' ? auditStandardInput(input) : new Map();
    const evidence = new Map();
    const output = [HEADERS.join('\t')];
    const eventIds = new Set();
    let rowCount = 0;
    let comparisons = 0;
    let duplicateRows = 0;
    let skippedDomains = 0;
    let unknownStrands = 0;
    let tiedOrders = 0;
    let invalidOrderGenes = 0;
    let overlappingGenePairs = 0;
    let syntheticBlocks = 0;
    let querylessBlocks = 0;
    let totalGenes = 0;
    let fusionEvents = 0;
    let neighborhoodEvents = 0;

    function checkWork() {
      comparisons += 1;
      if (comparisons > comparisonLimit) {
        throw new Error('Neighborhood conversion exceeds the pair-comparison limit. Select query-only scope or consecutive domains/genes, or reduce the input.');
      }
    }

    function addEvidence(id, block, protein, occurrence) {
      let item = evidence.get(id);
      if (!item) {
        item = { id, blocks: new Set(), proteins: new Set(), occurrences: new Set() };
        evidence.set(id, item);
      }
      item.blocks.add(block);
      item.proteins.add(protein);
      item.occurrences.add(occurrence);
    }

    function writePairRows(sourceDomain, targetDomain, sourceGene, targetGene, event, block, relation, firstType, secondType, seenRows) {
      const rows = [
        [sourceDomain.id, targetDomain.id, firstType, 1, event, block, sourceGene.pid, targetGene.pid, relation],
        [targetDomain.id, sourceDomain.id, secondType, 1, event, block, targetGene.pid, sourceGene.pid, relation]
      ];
      rows.forEach(row => {
        const key = unitId([row[0], row[1], row[2], event]);
        if (seenRows.has(key)) return;
        if (rowCount >= rowLimit) throw new Error('Neighborhood conversion exceeds the generated-row limit. Select query-only scope or consecutive domains/genes, or reduce the input.');
        seenRows.add(key);
        output.push(row.map(cell).join('\t'));
        rowCount += 1;
      });
      if (!eventIds.has(event)) {
        eventIds.add(event);
        if (relation === 'fusion') fusionEvents += 1;
        else neighborhoodEvents += 1;
      }
    }

    parsed.entries.forEach(entry => {
      const block = text(entry.id);
      const synthetic = entry.coordinateSource === 'synthetic' || entry.inputFormat === 'compact';
      if (synthetic) syntheticBlocks += 1;
      if (!(entry.genes || []).some(gene => gene.query)) querylessBlocks += 1;
      const genes = (entry.genes || []).map((gene, geneIndex) => {
        totalGenes += 1;
        const pid = text(gene.pid);
        // Real PIDs identify proteins across overlapping blocks. Unidentified
        // compact placeholders are local to their schematic observation.
        const protein = isUnknown(pid) || /^unknown_/.test(pid)
          ? unitId(['local-protein', block, geneIndex])
          : synthetic ? unitId(['protein', pid])
            : unitId(['protein', text(entry.nucleotide), pid, gene.start, gene.end]);
        const audit = sourceAudit.get(unitId([block, pid, gene.start, gene.end]));
        const knownStrand = audit ? !audit.invalidStrand && audit.strands.size === 1 : entry.inputFormat === 'compact';
        const knownDomainOrder = !audit || !audit.invalidOrder;
        if (!knownStrand) unknownStrands += 1;
        if (!knownDomainOrder) invalidOrderGenes += 1;
        const seenAnnotations = new Set();
        const domains = (gene.domains || []).map((domain, domainIndex) => {
          const id = text(domain.rawName || domain.name);
          if (isUnknown(id) || domain.marker && !options.includeMarkers) {
            skippedDomains += 1;
            return null;
          }
          const annotation = unitId([id, domain.order, Number.isFinite(domain.proteinStart) ? domain.proteinStart : null, Number.isFinite(domain.proteinEnd) ? domain.proteinEnd : null]);
          if (seenAnnotations.has(annotation)) {
            duplicateRows += 1;
            return null;
          }
          seenAnnotations.add(annotation);
          const occurrence = unitId([protein, annotation]);
          addEvidence(id, block, protein, occurrence);
          return { id, order: domain.order, originalIndex: domainIndex };
        });
        return { pid, geneIndex, protein, query: Boolean(gene.query), strand: gene.strand, knownStrand, knownDomainOrder, start: gene.start, end: gene.end, domains };
      });
      const seenRows = new Set();
      genes.forEach(gene => {
        if (options.scope === 'query' && !gene.query) return;
        if (options.proximity === 'adjacent' && !gene.knownDomainOrder) return;
        const event = unitId(['fusion', block, gene.geneIndex]);
        gene.domains.forEach((a, i) => {
          if (!a) return;
          const end = options.proximity === 'adjacent' ? Math.min(gene.domains.length, i + 2) : gene.domains.length;
          for (let j = i + 1; j < end; j += 1) {
            checkWork();
            const b = gene.domains[j];
            if (!b || a.id === b.id) continue;
            const ordered = gene.knownDomainOrder && Number.isFinite(a.order) && Number.isFinite(b.order) && a.order !== b.order;
            if (!ordered) tiedOrders += 1;
            writePairRows(a, b, gene, gene, event, block, 'fusion', ordered ? 'Cterminal' : 'Fusion', ordered ? 'Nterminal' : 'Fusion', seenRows);
          }
        });
      });
      genes.forEach((a, i) => {
        const end = options.proximity === 'adjacent' ? Math.min(genes.length, i + 2) : genes.length;
        for (let j = i + 1; j < end; j += 1) {
          const b = genes[j];
          if (options.scope === 'query' && !a.query && !b.query) continue;
          const event = unitId(['neighborhood', block, i, j]);
          const overlap = !synthetic && a.start <= b.end && b.start <= a.end;
          if (overlap) overlappingGenePairs += 1;
          const firstType = overlap || !a.knownStrand ? 'Neighborhood' : a.strand === '-' ? 'Upstream' : 'Downstream';
          const secondType = overlap || !b.knownStrand ? 'Neighborhood' : b.strand === '-' ? 'Downstream' : 'Upstream';
          a.domains.forEach(da => {
            if (!da) return;
            b.domains.forEach(db => {
              checkWork();
              if (!db || da.id === db.id) return;
              writePairRows(da, db, a, b, event, block, 'neighborhood', firstType, secondType, seenRows);
            });
          });
        }
      });
    });
    if (syntheticBlocks) warnings.push(`${syntheticBlocks} compact/synthetic block(s): gene order and orientation are used; no genomic distances are inferred.`);
    if (unknownStrands) warnings.push(`${unknownStrands} gene(s) have missing, conflicting or unrecognized strand values. Their outgoing neighborhood annotations use the generic Neighborhood type.`);
    if (tiedOrders) warnings.push(`${tiedOrders} domain pair(s) have ambiguous order. They use the generic Fusion type without N/C-terminal inference.`);
    if (invalidOrderGenes) warnings.push(`${invalidOrderGenes} gene(s) contain blank or invalid domp values. Display-layout fallback positions are not used for terminal inference; in consecutive mode these genes do not generate fusion relationships.`);
    if (overlappingGenePairs) warnings.push(`${overlappingGenePairs} genomic gene pair(s) overlap. Their neighborhood annotations use the generic Neighborhood type without upstream/downstream inference.`);
    if (duplicateRows) warnings.push(`${duplicateRows} duplicate domain annotation row(s) were ignored when computing frequencies and relationships.`);
    if (options.scope === 'query' && querylessBlocks) warnings.push(`${querylessBlocks} block(s) have no query gene and generate no relationships in query-only scope.`);
    warnings.push('Counts are descriptive evidence units: one protein for fusion, one gene pair per block for neighborhood, for each domain pair. Reciprocal directional annotations share an event ID and must not be added twice. Overlapping blocks are separate observations.');
    return {
      edgeText: output.join('\n') + '\n',
      nodeEvidence: Array.from(evidence.values(), item => ({ id: item.id, blocks: Array.from(item.blocks), proteins: Array.from(item.proteins), occurrences: Array.from(item.occurrences) })).sort((a, b) => a.id.localeCompare(b.id)),
      stats: { neighborhoods: parsed.entries.length, genes: totalGenes, nodes: evidence.size, generatedRows: rowCount, fusionUnits: fusionEvents, neighborhoodUnits: neighborhoodEvents, skippedDomains, duplicateAnnotations: duplicateRows, invalidOrderGenes, overlappingGenePairs, syntheticBlocks, scope: options.scope, proximity: options.proximity, includeMarkers: Boolean(options.includeMarkers), countUnit: 'protein for fusion; gene pair within block for neighborhood; directional annotations overlap', nodeFrequencyScope: 'all supplied blocks and proteins, independent of relationship filters' },
      warnings,
      inputFormat: parsed.inputFormat
    };
  }

  global.NetworkNeighborhood = { version: '1.0.0', convert };
})(typeof window === 'undefined' ? globalThis : window);
