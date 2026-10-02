(() => {
  'use strict';

  const VIEWER_VERSION = '3.4.0';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const XLINK_NS = 'http://www.w3.org/1999/xlink';
  const FIELD_ALIASES = Object.freeze({
    domain: 'domain', dom: 'domain',
    pfam: 'pfam',
    organism: 'organism', org: 'organism',
    taxon: 'taxonomy', taxonomy: 'taxonomy', classification: 'taxonomy',
    pid: 'pid', protein: 'pid',
    nucleotide: 'nucleotide', nucc: 'nucleotide', accession: 'nucleotide',
    product: 'product',
    assembly: 'assembly',
    block: 'block', block_id: 'block'
  });

  const DEFAULTS = Object.freeze({
    rowHeight: 92,
    rowBuffer: 7,
    labelWidth: 310,
    trackHeight: 48,
    arrowHeight: 28,
    arrowHeadPx: 12,
    minGenePx: 3,
    minTrackWidth: 900,
    trackPadding: 28,
    unknownDomainColor: '#d7dce2',
    geneBackgroundColor: '#f4f6f8',
    minMarkerPixelWidth: 0.75,
    fixedSidePadding: 12,
    maxDataBytes: 64 * 1024 * 1024
  });

  let svgSerial = 0;

  function clean(value) {
    return value == null ? '' : String(value).trim();
  }

  function finiteNumber(value, fallback = NaN) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function formatInt(value) {
    return Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : '—';
  }

  function isTruthy(value) {
    return ['1', 'true', 'yes', 'y'].includes(clean(value).toLowerCase());
  }

  function normalizeStrand(value) {
    const normalized = clean(value);
    return normalized === '-1' || normalized === '-' ? '-' : '+';
  }

  function normalizeConfig(raw = {}) {
    const zoom = Math.min(2.8, Math.max(0.7, finiteNumber(raw.defaultZoom, 1)));
    const defaultMarkers = {
      TM: { width: 4, color: '#f4cf3a', position: 'ordered' },
      SIG: { width: 5, color: '#d62828', position: 'start' }
    };
    const rawMarkers = raw.markerDomains && typeof raw.markerDomains === 'object' && !Array.isArray(raw.markerDomains)
      ? raw.markerDomains
      : defaultMarkers;
    const markerDomains = Object.create(null);

    for (const [name, rawSpec] of Object.entries(rawMarkers)) {
      const markerName = clean(name);
      if (!markerName || !rawSpec || typeof rawSpec !== 'object' || Array.isArray(rawSpec)) continue;
      const width = finiteNumber(rawSpec.width);
      if (!Number.isFinite(width) || width <= 0) continue;
      markerDomains[markerName] = {
        width: Math.min(32, Math.max(1, width)),
        color: clean(rawSpec.color) || '#111827',
        position: rawSpec.position === 'start' ? 'start' : 'ordered'
      };
    }

    const fixedDomainWidths = Object.create(null);
    if (raw.fixedDomainWidths && typeof raw.fixedDomainWidths === 'object' && !Array.isArray(raw.fixedDomainWidths)) {
      for (const [name, value] of Object.entries(raw.fixedDomainWidths)) {
        const width = finiteNumber(value);
        if (clean(name) && Number.isFinite(width) && width > 0) {
          fixedDomainWidths[clean(name)] = Math.min(300, Math.max(16, width));
        }
      }
    }

    const requestedScaleMode = clean(raw.defaultScaleMode).toLocaleLowerCase();
    // Backward compatibility: the former "anchor" mode is now represented by
    // Fit window + Align query. New configurations default to fixed widths.
    const defaultScaleMode = requestedScaleMode === 'fit' ? 'fit' : 'fixed';
    const defaultAlignQuery = raw.defaultAlignQuery === true || requestedScaleMode === 'anchor';

    return {
      title: clean(raw.title) || 'Gene Neighborhood Viewer',
      paperTitle: clean(raw.paperTitle),
      figureTitle: clean(raw.figureTitle),
      dataUrl: clean(raw.dataUrl) || './data/te.tsv',
      colorUrl: clean(raw.colorUrl) || './data/color_dic.yaml',
      renameUrl: clean(raw.renameUrl) || './data/domain_rename.yaml',
      includePlaceholder: clean(raw.includePlaceholder || raw.searchPlaceholder)
        || 'Include by domain, PFAM, organism, taxonomy, PID…',
      excludePlaceholder: clean(raw.excludePlaceholder)
        || 'Exclude by the same syntax…',
      defaultScaleMode,
      defaultAlignQuery,
      defaultFlipNegativeQueries: raw.defaultFlipNegativeQueries !== false,
      defaultShowLabels: raw.defaultShowLabels !== false,
      defaultZoom: zoom,
      fixedDomainWidth: Math.min(300, Math.max(16, finiteNumber(raw.fixedDomainWidth, 64))),
      fixedDomainWidths,
      fixedGeneGap: Math.min(80, Math.max(0, finiteNumber(raw.fixedGeneGap, 10))),
      fixedMarkerOnlyGeneWidth: Math.min(300, Math.max(18, finiteNumber(raw.fixedMarkerOnlyGeneWidth, 34))),
      unknownDomainColor: clean(raw.unknownDomainColor) || DEFAULTS.unknownDomainColor,
      geneBackgroundColor: clean(raw.geneBackgroundColor) || DEFAULTS.geneBackgroundColor,
      markerDomains,
      maxDataBytes: Math.max(1024, finiteNumber(raw.maxDataBytes, DEFAULTS.maxDataBytes)),
      // Editor-only flag: when true, the viewer does not auto-load dataUrl/
      // colorUrl/renameUrl on startup and instead waits for
      // NeighborhoodViewer.loadFromSources() to be called (e.g. from a file
      // picker). Published figure pages leave this false (the default).
      manualLoad: raw.manualLoad === true,
      inputFormat: normalizeInputFormat(raw.inputFormat)
    };
  }

  function stripYamlComment(line) {
    let quote = null;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if ((char === '"' || char === "'") && (i === 0 || line[i - 1] !== '\\')) {
        if (quote === char) quote = null;
        else if (!quote) quote = char;
      } else if (char === '#' && !quote) {
        return line.slice(0, i);
      }
    }
    return line;
  }

  function findYamlColon(line) {
    let quote = null;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if ((char === '"' || char === "'") && (i === 0 || line[i - 1] !== '\\')) {
        if (quote === char) quote = null;
        else if (!quote) quote = char;
      } else if (char === ':' && !quote) {
        return i;
      }
    }
    return -1;
  }

  function unquoteYaml(value) {
    const text = clean(value);
    if (text.length >= 2) {
      const first = text[0];
      const last = text[text.length - 1];
      if (first === last && (first === '"' || first === "'")) {
        const inner = text.slice(1, -1);
        return first === '"'
          ? inner.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\')
          : inner.replace(/''/g, "'");
      }
    }
    return text;
  }

  function parseFlatYaml(text, sourceName) {
    const result = Object.create(null);
    const lines = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    lines.forEach((rawLine, index) => {
      const line = stripYamlComment(rawLine).trim();
      if (!line || line === '---' || line === '...') return;
      const colon = findYamlColon(line);
      if (colon < 1) {
        throw new Error(`${sourceName}: line ${index + 1} is not a key: value mapping.`);
      }
      const key = unquoteYaml(line.slice(0, colon));
      const value = unquoteYaml(line.slice(colon + 1));
      if (key) result[key] = value;
    });
    return result;
  }

  function makeCaseInsensitiveLookup(object) {
    const exact = new Map();
    const lower = new Map();
    for (const [key, value] of Object.entries(object)) {
      exact.set(key, value);
      lower.set(key.toLocaleLowerCase(), value);
    }
    return { exact, lower };
  }

  function lookupMapped(lookup, key) {
    return lookup.exact.get(key) ?? lookup.lower.get(key.toLocaleLowerCase());
  }

  function parseTsvLine(line) {
    const values = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === '\t' && !quoted) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    return values;
  }

  function parseBlockCoordinates(blockId) {
    const match = clean(blockId).match(/^(.*):(\d+)-(\d+)$/);
    if (!match) return null;
    const start = Number(match[2]);
    const end = Number(match[3]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return { nucleotide: match[1], start: Math.min(start, end), end: Math.max(start, end) };
  }

  function domainDisplayName(rawName, renameLookup) {
    const raw = clean(rawName);
    if (!raw || raw === '-') return '?';
    return clean(lookupMapped(renameLookup, raw)) || raw;
  }

  function domainColor(displayName, rawName, colorLookup, unknownColor) {
    return clean(lookupMapped(colorLookup, displayName))
      || clean(lookupMapped(colorLookup, rawName))
      || unknownColor;
  }

  function domainMarker(displayName, rawName, markerLookup) {
    const spec = lookupMapped(markerLookup, displayName) ?? lookupMapped(markerLookup, rawName);
    if (!spec) return null;
    return {
      width: spec.width,
      color: spec.color,
      position: spec.position
    };
  }

  function cssClassToken(value) {
    return clean(value)
      .toLocaleLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'marker';
  }

  function firstNonEmpty(...values) {
    for (const value of values) {
      const text = clean(value);
      if (text) return text;
    }
    return '';
  }

  function normalizeInputFormat(value) {
    const format = clean(value).toLocaleLowerCase();
    return ['standard', 'compact'].includes(format) ? format : 'auto';
  }

  function detectNeighborhoodInputFormat(text) {
    const lines = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    const firstLine = lines.find(line => line.trim());
    if (!firstLine) throw new Error('The neighborhood input is empty.');
    const values = parseTsvLine(firstLine);
    const lowerHeaders = new Set(values.map(value => clean(value).toLocaleLowerCase()));
    const standardRequired = ['block_id', 'pid', 'nucleotide', 'start', 'end', 'strand', 'query', 'dom', 'domp'];
    if (standardRequired.every(name => lowerHeaders.has(name))) return 'standard';
    if (
      values.length >= 4
      && /(?:->|<-|\|\|)/.test(values[1] || '')
      && /__/.test(values[3] || '')
    ) return 'compact';
    return 'unknown';
  }

  function setOrientation(orientations, index, value, warnings, context) {
    if (index < 0 || index >= orientations.length || !value) return;
    if (orientations[index] && orientations[index] !== value) {
      warnings.push(`${context}: conflicting orientation markers around gene ${index + 1}; using ${orientations[index]}.`);
      return;
    }
    orientations[index] = value;
  }

  function splitCompactArchitecture(text, context, warnings) {
    const tokens = String(text || '').split(/(\|\||->|<-)/);
    const genes = [];
    const separators = [];
    let pending = [];
    let leading = [];

    for (const token of tokens) {
      if (!token) continue;
      if (token === '||' || token === '->' || token === '<-') {
        pending.push(token);
        continue;
      }
      const geneText = clean(token);
      if (!geneText) continue;
      if (!genes.length) leading = pending.slice();
      else separators.push(pending.slice());
      pending = [];
      const domainTokens = geneText.split('+').map(clean).filter(Boolean);
      const query = domainTokens.some(name => name.includes('*'));
      const domains = domainTokens.map(name => clean(name.replace(/\*/g, '')) || '?');
      genes.push({
        text: geneText,
        query,
        domains: domains.length ? domains : ['?'],
        strand: '+'
      });
    }

    const trailing = pending.slice();
    if (!genes.length) throw new Error(`${context}: the architecture field contains no genes.`);
    while (separators.length < genes.length - 1) separators.push([]);

    const orientations = new Array(genes.length).fill(null);
    if (leading.includes('<-')) setOrientation(orientations, 0, '-', warnings, context);
    else if (leading.includes('->')) setOrientation(orientations, 0, '+', warnings, context);

    const relations = [];
    separators.forEach((ops, index) => {
      const flipIndex = ops.indexOf('||');
      const opposite = flipIndex >= 0;
      relations[index] = opposite ? 'opposite' : 'same';
      if (!opposite) {
        if (ops.includes('->')) {
          setOrientation(orientations, index, '+', warnings, context);
          setOrientation(orientations, index + 1, '+', warnings, context);
        } else if (ops.includes('<-')) {
          setOrientation(orientations, index, '-', warnings, context);
          setOrientation(orientations, index + 1, '-', warnings, context);
        }
        return;
      }
      const before = ops.slice(0, flipIndex);
      const after = ops.slice(flipIndex + 1);
      if (before.includes('->')) setOrientation(orientations, index, '+', warnings, context);
      else if (before.includes('<-')) setOrientation(orientations, index, '-', warnings, context);
      if (after.includes('<-')) setOrientation(orientations, index + 1, '-', warnings, context);
      else if (after.includes('->')) setOrientation(orientations, index + 1, '+', warnings, context);
    });

    if (trailing.includes('->')) setOrientation(orientations, genes.length - 1, '+', warnings, context);
    else if (trailing.includes('<-')) setOrientation(orientations, genes.length - 1, '-', warnings, context);

    let changed = true;
    while (changed) {
      changed = false;
      for (let index = 0; index < relations.length; index += 1) {
        const left = orientations[index];
        const right = orientations[index + 1];
        const opposite = relations[index] === 'opposite';
        if (left && !right) {
          orientations[index + 1] = opposite ? (left === '+' ? '-' : '+') : left;
          changed = true;
        } else if (!left && right) {
          orientations[index] = opposite ? (right === '+' ? '-' : '+') : right;
          changed = true;
        }
      }
    }
    if (!orientations.some(Boolean)) orientations[0] = '+';
    for (let index = 0; index < genes.length; index += 1) {
      if (!orientations[index]) {
        if (index > 0 && orientations[index - 1]) {
          const opposite = relations[index - 1] === 'opposite';
          orientations[index] = opposite
            ? (orientations[index - 1] === '+' ? '-' : '+')
            : orientations[index - 1];
        } else {
          orientations[index] = '+';
        }
      }
      genes[index].strand = orientations[index];
    }

    return { genes, leading, separators, trailing };
  }

  function parseCompactDetailGene(text, context, geneIndex, warnings) {
    const raw = clean(text);
    const separator = raw.indexOf('__');
    const rawPid = separator >= 0 ? clean(raw.slice(0, separator)) : raw;
    const annotationText = separator >= 0 ? clean(raw.slice(separator + 2)) : '';
    const pid = rawPid && rawPid !== '.' && rawPid !== '?' ? rawPid : '';
    const domains = [];

    if (annotationText && annotationText !== '?') {
      annotationText.split(',').map(clean).filter(Boolean).forEach((token, domainIndex) => {
        const ampersand = token.indexOf('&');
        const coordinateText = ampersand >= 0 ? clean(token.slice(0, ampersand)) : '';
        const rawNameWithMarker = ampersand >= 0 ? clean(token.slice(ampersand + 1)) : clean(token);
        const rawName = clean(rawNameWithMarker.replace(/\*/g, '')) || '?';
        const match = coordinateText.match(/^(\d+)\.\.(\d+)$/);
        const start = match ? Number(match[1]) : NaN;
        const end = match ? Number(match[2]) : NaN;
        if (coordinateText && !match) {
          warnings.push(`${context}: gene ${geneIndex + 1}, domain ${domainIndex + 1} has an unrecognized coordinate “${coordinateText}”.`);
        }
        domains.push({
          rawName,
          start: Number.isFinite(start) ? Math.min(start, end) : NaN,
          end: Number.isFinite(end) ? Math.max(start, end) : NaN
        });
      });
    }

    if (!domains.length) domains.push({ rawName: '?', start: NaN, end: NaN });
    const maxEnd = domains.reduce((maximum, domain) => Number.isFinite(domain.end) ? Math.max(maximum, domain.end) : maximum, 0);
    return { pid, domains, maxEnd, sourceText: raw };
  }

  function compactDomainSimilarity(architectureDomains, detailDomains) {
    const left = architectureDomains.map(name => clean(name).toLocaleLowerCase());
    const right = detailDomains.map(domain => clean(domain.rawName).toLocaleLowerCase());
    if (left.length === right.length && left.every((name, index) => name === right[index])) return 100 + left.length;
    const leftKnown = left.filter(name => name && name !== '?');
    const rightKnown = right.filter(name => name && name !== '?');
    if (!leftKnown.length || !rightKnown.length) return 1;
    const rightCounts = new Map();
    rightKnown.forEach(name => rightCounts.set(name, (rightCounts.get(name) || 0) + 1));
    let overlap = 0;
    leftKnown.forEach(name => {
      const count = rightCounts.get(name) || 0;
      if (count > 0) {
        overlap += 1;
        rightCounts.set(name, count - 1);
      }
    });
    return (overlap / Math.max(leftKnown.length, rightKnown.length)) * 20;
  }

  function chooseCompactDetailOrder(architectureGenes, detailGenes, queryPid, context, warnings) {
    const candidates = [
      { name: 'direct', genes: detailGenes.slice() },
      { name: 'reverse', genes: detailGenes.slice().reverse() }
    ];
    const queryIndex = architectureGenes.findIndex(gene => gene.query);
    for (const candidate of candidates) {
      candidate.score = architectureGenes.reduce((sum, gene, index) => {
        const detail = candidate.genes[index];
        if (!detail) return sum - 25;
        let score = compactDomainSimilarity(gene.domains, detail.domains);
        if (gene.query && detail.pid === queryPid) score += 1000;
        else if (gene.query && detail.pid) score -= 500;
        return sum + score;
      }, 0);
      candidate.queryIndex = candidate.genes.findIndex(gene => gene.pid === queryPid);
      if (candidate.queryIndex === queryIndex) candidate.score += 250;
    }
    candidates.sort((a, b) => b.score - a.score || (a.name === 'direct' ? -1 : 1));
    const chosen = candidates[0];
    if (chosen.queryIndex !== queryIndex) {
      warnings.push(`${context}: the detailed query PID could not be aligned to the starred architecture gene; architecture order was retained.`);
    }
    return chosen;
  }

  function matchCompactDomain(architectureName, detailDomains, used) {
    const target = clean(architectureName).toLocaleLowerCase();
    let index = detailDomains.findIndex((domain, candidateIndex) => !used.has(candidateIndex)
      && clean(domain.rawName).toLocaleLowerCase() === target);
    if (index < 0) index = detailDomains.findIndex((domain, candidateIndex) => !used.has(candidateIndex));
    if (index < 0) return null;
    used.add(index);
    return detailDomains[index];
  }

  function finalizeCompactEntry(entry, config) {
    entry.queryGenes = entry.genes.filter(gene => gene.query);
    const anchors = entry.queryGenes.length ? entry.queryGenes : [entry.genes[Math.floor(entry.genes.length / 2)]];
    entry.anchorCenter = anchors.reduce((sum, gene) => sum + (gene.start + gene.end) / 2, 0) / Math.max(1, anchors.length);
    const strandScore = anchors.reduce((sum, gene) => sum + (gene.strand === '-' ? -1 : 1), 0);
    entry.anchorStrand = strandScore < 0 ? '-' : anchors[0].strand;
    entry.queryPids = entry.queryGenes.map(gene => gene.pid);
    entry.regionStart = Math.min(...entry.genes.map(gene => gene.start));
    entry.regionEnd = Math.max(...entry.genes.map(gene => gene.end));

    const domainRaw = entry.genes.flatMap(gene => gene.domains.map(domain => domain.rawName));
    const domainDisplay = entry.genes.flatMap(gene => gene.domains.map(domain => domain.name));
    const lowerJoin = values => values.filter(Boolean).join(' ').toLocaleLowerCase();
    entry.searchFields = {
      domain: lowerJoin([...domainRaw, ...domainDisplay, ...entry.genes.map(gene => gene.arch), ...entry.genes.map(gene => gene.profiledb)]),
      pfam: lowerJoin(entry.genes.map(gene => gene.pfam)),
      organism: lowerJoin([entry.organism, ...entry.genes.map(gene => gene.organism)]),
      taxonomy: lowerJoin([entry.classification, entry.lineage, entry.taxid, ...entry.genes.map(gene => gene.classification), ...entry.genes.map(gene => gene.lineage)]),
      pid: lowerJoin([...entry.genes.map(gene => gene.pid), ...entry.genes.map(gene => gene.internalId), ...entry.genes.map(gene => gene.replaced), ...entry.genes.map(gene => gene.locus)]),
      nucleotide: lowerJoin([entry.nucleotide]),
      product: lowerJoin(entry.genes.map(gene => gene.product)),
      assembly: lowerJoin([entry.assembly, ...entry.genes.map(gene => gene.assembly)]),
      block: lowerJoin([entry.id])
    };
    entry.searchFields.all = lowerJoin(Object.values(entry.searchFields));
    return entry;
  }

  function parseCompactNeighborhoodInput(text, renameObject, colorObject, config) {
    const renameLookup = makeCaseInsensitiveLookup(renameObject);
    const colorLookup = makeCaseInsensitiveLookup(colorObject);
    const markerLookup = makeCaseInsensitiveLookup(config.markerDomains);
    const lines = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    const entries = [];
    const warnings = [];
    let totalGenes = 0;
    let totalDomains = 0;
    let totalMarkers = 0;
    let validRows = 0;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const rawLine = lines[lineIndex];
      if (!rawLine || !rawLine.trim()) continue;
      const values = parseTsvLine(rawLine);
      if (values.length < 4) throw new Error(`Compact line ${lineIndex + 1}: expected four tab-separated fields.`);
      const queryPid = clean(values[0]);
      const architectureText = clean(values[1]);
      const organism = clean(values[2]);
      const detailText = values.slice(3).join('\t').trim();
      if (!queryPid || !architectureText || !detailText) {
        throw new Error(`Compact line ${lineIndex + 1}: query PID, architecture, and detailed gene list are required.`);
      }
      if (lineIndex === 0 && queryPid.toLocaleLowerCase() === 'pid' && architectureText.toLocaleLowerCase().includes('architecture')) continue;
      const context = `Compact line ${lineIndex + 1} (${queryPid})`;
      const architecture = splitCompactArchitecture(architectureText, context, warnings);
      const detailGenes = detailText.split(';').map(clean).filter(Boolean)
        .map((geneText, geneIndex) => parseCompactDetailGene(geneText, context, geneIndex, warnings));
      if (detailGenes.length !== architecture.genes.length) {
        warnings.push(`${context}: architecture has ${architecture.genes.length} genes but the detailed field has ${detailGenes.length}; unmatched genes will use placeholders.`);
      }
      const chosenOrder = chooseCompactDetailOrder(architecture.genes, detailGenes, queryPid, context, warnings);
      const orderedDetails = chosenOrder.genes;
      let cursor = 1;
      const genes = [];

      architecture.genes.forEach((geneSpec, geneIndex) => {
        const detail = orderedDetails[geneIndex] || { pid: '', domains: [{ rawName: '?', start: NaN, end: NaN }], maxEnd: 0 };
        const query = Boolean(geneSpec.query);
        const pid = detail.pid || `unknown_${queryPid}_${geneIndex + 1}`;
        const estimatedAa = Math.max(detail.maxEnd || 0, geneSpec.domains.length * 45, 60);
        const span = Math.max(120, Math.round(estimatedAa * 3));
        const start = cursor;
        const end = cursor + span - 1;
        cursor = end + 61;
        const usedDetailDomains = new Set();
        const domains = geneSpec.domains.map((rawDomainName, domainIndex) => {
          const rawName = clean(rawDomainName) || '?';
          const displayName = domainDisplayName(rawName, renameLookup);
          const marker = domainMarker(displayName, rawName, markerLookup);
          const matched = matchCompactDomain(rawName, detail.domains, usedDetailDomains);
          return {
            rawName,
            name: displayName,
            order: domainIndex,
            blockOrder: geneIndex,
            color: marker?.color || domainColor(displayName, rawName, colorLookup, config.unknownDomainColor),
            marker,
            proteinStart: matched?.start,
            proteinEnd: matched?.end
          };
        });
        const gene = {
          pid,
          start,
          end,
          strand: geneSpec.strand,
          query,
          plen: detail.maxEnd || NaN,
          locus: '',
          geneName: '',
          type: '',
          seqType: '',
          assembly: '',
          product: '',
          taxid: '',
          organism,
          lineage: '',
          classification: '',
          featureOrder: geneIndex,
          internalId: '',
          replaced: '',
          c80e3: '',
          arch: geneSpec.domains.join('+'),
          profiledb: '',
          pfam: '',
          domains
        };
        genes.push(gene);
      });

      const queryGene = genes.find(gene => gene.query);
      if (!queryGene) throw new Error(`${context}: no starred query domain was found in the architecture.`);
      if (queryGene.pid !== queryPid) {
        const matchingIndex = genes.findIndex(gene => gene.pid === queryPid);
        if (matchingIndex >= 0) {
          warnings.push(`${context}: detailed gene order disagreed with the starred query position; the starred architecture position remains authoritative.`);
        } else {
          warnings.push(`${context}: query PID ${queryPid} was not found in the detailed field; the starred gene was retained with its matched PID.`);
        }
      }

      const entry = finalizeCompactEntry({
        id: `compact:${String(validRows + 1).padStart(5, '0')}:${queryPid}`,
        nucleotide: '',
        assembly: '',
        taxid: '',
        organism,
        lineage: '',
        classification: '',
        sourceOrder: validRows,
        sourceArchitecture: architectureText,
        compactDetailOrder: chosenOrder.name,
        inputFormat: 'compact',
        genes
      }, config);
      entries.push(entry);
      validRows += 1;
      totalGenes += genes.length;
      for (const gene of genes) {
        for (const domain of gene.domains) {
          if (domain.marker) totalMarkers += 1;
          else totalDomains += 1;
        }
      }
    }

    if (!entries.length) throw new Error('No valid compact neighborhoods were found.');
    return {
      entries,
      stats: { neighborhoods: entries.length, genes: totalGenes, domains: totalDomains, markers: totalMarkers, rows: validRows },
      warnings
    };
  }

  function tsvCell(value) {
    const text = value == null ? '' : String(value);
    return /[\t\r\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function serializeNormalizedNeighborhoodTsv(entries) {
    const headers = [
      'block_id', 'pid', 'nucleotide', 'start', 'end', 'strand', 'query', 'plen',
      'dom', 'domp', 'domain_start', 'domain_end', 'blockp', 'feature_order', 'organism', 'taxid', 'lineage',
      'classification', 'assembly', 'product', 'locus', 'arch', 'profiledb', 'pfam'
    ];
    const lines = [headers.join('\t')];
    for (const entry of entries) {
      entry.genes.forEach((gene, geneIndex) => {
        const domains = gene.domains.length ? gene.domains : [{ rawName: '?', order: 0, blockOrder: geneIndex }];
        domains.forEach((domain, domainIndex) => {
          const row = {
            block_id: entry.id,
            pid: gene.pid,
            nucleotide: entry.nucleotide,
            start: gene.start,
            end: gene.end,
            strand: gene.strand,
            query: gene.query ? 1 : 0,
            plen: Number.isFinite(gene.plen) ? gene.plen : '',
            dom: domain.rawName,
            domp: Number.isFinite(domain.order) ? domain.order : domainIndex,
            domain_start: Number.isFinite(domain.proteinStart) ? domain.proteinStart : '',
            domain_end: Number.isFinite(domain.proteinEnd) ? domain.proteinEnd : '',
            blockp: Number.isFinite(domain.blockOrder) ? domain.blockOrder : geneIndex,
            feature_order: Number.isFinite(gene.featureOrder) ? gene.featureOrder : geneIndex,
            organism: gene.organism || entry.organism,
            taxid: gene.taxid || entry.taxid,
            lineage: gene.lineage || entry.lineage,
            classification: gene.classification || entry.classification,
            assembly: gene.assembly || entry.assembly,
            product: gene.product,
            locus: gene.locus,
            arch: gene.arch,
            profiledb: gene.profiledb,
            pfam: gene.pfam
          };
          lines.push(headers.map(header => tsvCell(row[header])).join('\t'));
        });
      });
    }
    return `${lines.join('\n')}\n`;
  }

  function parseNeighborhoodInput(text, renameObject, colorObject, config, requestedFormat = 'auto') {
    const requested = normalizeInputFormat(requestedFormat || config.inputFormat);
    const detected = requested === 'auto' ? detectNeighborhoodInputFormat(text) : requested;
    if (detected === 'unknown') {
      throw new Error('Could not recognize the neighborhood input. Choose Standard TSV or Compact architecture explicitly.');
    }
    const parsed = detected === 'compact'
      ? parseCompactNeighborhoodInput(text, renameObject, colorObject, config)
      : parseNeighborhoodTsv(text, renameObject, colorObject, config);
    parsed.inputFormat = detected;
    parsed.warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
    parsed.normalizedTsv = serializeNormalizedNeighborhoodTsv(parsed.entries);
    return parsed;
  }

  function parseNeighborhoodTsv(text, renameObject, colorObject, config) {
    const renameLookup = makeCaseInsensitiveLookup(renameObject);
    const colorLookup = makeCaseInsensitiveLookup(colorObject);
    const markerLookup = makeCaseInsensitiveLookup(config.markerDomains);
    const lines = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    if (lines.length < 2) throw new Error('The TSV is empty or contains no data rows.');

    const headers = parseTsvLine(lines[0]).map(clean);
    const column = Object.create(null);
    headers.forEach((name, index) => { column[name] = index; });
    const required = ['block_id', 'pid', 'nucleotide', 'start', 'end', 'strand', 'query', 'dom', 'domp'];
    const missing = required.filter(name => column[name] == null);
    if (missing.length) throw new Error(`Required TSV columns are missing: ${missing.join(', ')}`);

    const valueAt = (values, name) => {
      const index = column[name];
      return index == null ? '' : values[index] ?? '';
    };

    const entriesById = new Map();
    let validRows = 0;

    for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
      if (!lines[lineIndex]) continue;
      const values = parseTsvLine(lines[lineIndex]);
      const blockId = clean(valueAt(values, 'block_id'));
      const pid = clean(valueAt(values, 'pid'));
      const start = finiteNumber(valueAt(values, 'start'));
      const end = finiteNumber(valueAt(values, 'end'));
      if (!blockId && !pid && !Number.isFinite(start) && !Number.isFinite(end)) continue;
      if (!blockId || !pid || !Number.isFinite(start) || !Number.isFinite(end)) {
        throw new Error(`TSV line ${lineIndex + 1}: block_id, pid, start, and end are required.`);
      }
      validRows += 1;

      let entry = entriesById.get(blockId);
      if (!entry) {
        entry = {
          id: blockId,
          nucleotide: clean(valueAt(values, 'nucleotide')),
          assembly: clean(valueAt(values, 'assembly')),
          taxid: clean(valueAt(values, 'taxid')),
          organism: clean(valueAt(values, 'organism')),
          lineage: clean(valueAt(values, 'lineage')),
          classification: clean(valueAt(values, 'classification')),
          geneMap: new Map(),
          sourceOrder: entriesById.size
        };
        entriesById.set(blockId, entry);
      } else {
        entry.nucleotide = firstNonEmpty(entry.nucleotide, valueAt(values, 'nucleotide'));
        entry.assembly = firstNonEmpty(entry.assembly, valueAt(values, 'assembly'));
        entry.taxid = firstNonEmpty(entry.taxid, valueAt(values, 'taxid'));
        entry.organism = firstNonEmpty(entry.organism, valueAt(values, 'organism'));
        entry.lineage = firstNonEmpty(entry.lineage, valueAt(values, 'lineage'));
        entry.classification = firstNonEmpty(entry.classification, valueAt(values, 'classification'));
      }

      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      const geneKey = `${pid}\u0000${lo}\u0000${hi}`;
      let gene = entry.geneMap.get(geneKey);
      if (!gene) {
        gene = {
          pid,
          start: lo,
          end: hi,
          strand: normalizeStrand(valueAt(values, 'strand')),
          query: isTruthy(valueAt(values, 'query')),
          plen: finiteNumber(valueAt(values, 'plen')),
          locus: clean(valueAt(values, 'locus')),
          geneName: clean(valueAt(values, 'gene')),
          type: clean(valueAt(values, 'type')),
          seqType: clean(valueAt(values, 'seq_type')),
          assembly: clean(valueAt(values, 'assembly')),
          product: clean(valueAt(values, 'product')),
          taxid: clean(valueAt(values, 'taxid')),
          organism: clean(valueAt(values, 'organism')),
          lineage: clean(valueAt(values, 'lineage')),
          classification: clean(valueAt(values, 'classification')),
          featureOrder: finiteNumber(valueAt(values, 'feature_order')),
          internalId: clean(valueAt(values, 'internal_id')),
          replaced: clean(valueAt(values, 'replaced')),
          c80e3: clean(valueAt(values, 'c80e3')),
          arch: clean(valueAt(values, 'arch')),
          profiledb: clean(valueAt(values, 'profiledb')),
          pfam: clean(valueAt(values, 'pfam')),
          domains: []
        };
        entry.geneMap.set(geneKey, gene);
      } else {
        gene.query = gene.query || isTruthy(valueAt(values, 'query'));
      }

      const rawName = clean(valueAt(values, 'dom')) || '?';
      const displayName = domainDisplayName(rawName, renameLookup);
      const marker = domainMarker(displayName, rawName, markerLookup);
      gene.domains.push({
        rawName,
        name: displayName,
        order: finiteNumber(valueAt(values, 'domp'), gene.domains.length),
        blockOrder: finiteNumber(valueAt(values, 'blockp'), Number.POSITIVE_INFINITY),
        color: marker?.color || domainColor(displayName, rawName, colorLookup, config.unknownDomainColor),
        marker,
        proteinStart: clean(valueAt(values, 'domain_start')) ? finiteNumber(valueAt(values, 'domain_start')) : NaN,
        proteinEnd: clean(valueAt(values, 'domain_end')) ? finiteNumber(valueAt(values, 'domain_end')) : NaN
      });
    }

    if (!validRows || !entriesById.size) throw new Error('No valid neighborhoods were found in the TSV.');

    let totalGenes = 0;
    let totalDomains = 0;
    let totalMarkers = 0;
    const entries = [];

    for (const entry of entriesById.values()) {
      const genes = Array.from(entry.geneMap.values());
      genes.forEach(gene => {
        gene.domains.sort((a, b) => (a.order - b.order) || (a.blockOrder - b.blockOrder));
        if (!gene.domains.length) {
          gene.domains.push({ rawName: '?', name: '?', order: 0, blockOrder: 0, color: config.unknownDomainColor, marker: null });
        }
      });
      genes.sort((a, b) => (a.start - b.start) || (a.end - b.end) || (a.featureOrder - b.featureOrder));
      entry.genes = genes;
      delete entry.geneMap;

      const parsedBlock = parseBlockCoordinates(entry.id);
      entry.nucleotide = firstNonEmpty(entry.nucleotide, parsedBlock?.nucleotide);
      entry.regionStart = parsedBlock?.start ?? Math.min(...genes.map(gene => gene.start));
      entry.regionEnd = parsedBlock?.end ?? Math.max(...genes.map(gene => gene.end));

      entry.queryGenes = genes.filter(gene => gene.query);
      const anchors = entry.queryGenes.length ? entry.queryGenes : [genes[Math.floor(genes.length / 2)]];
      entry.anchorCenter = anchors.reduce((sum, gene) => sum + (gene.start + gene.end) / 2, 0) / anchors.length;
      const strandScore = anchors.reduce((sum, gene) => sum + (gene.strand === '-' ? -1 : 1), 0);
      entry.anchorStrand = strandScore < 0 ? '-' : anchors[0].strand;
      entry.queryPids = entry.queryGenes.map(gene => gene.pid);

      const domainRaw = genes.flatMap(gene => gene.domains.map(domain => domain.rawName));
      const domainDisplay = genes.flatMap(gene => gene.domains.map(domain => domain.name));
      const pfams = genes.map(gene => gene.pfam);
      const products = genes.map(gene => gene.product);
      const pids = genes.map(gene => gene.pid);
      const assemblies = genes.map(gene => gene.assembly);

      const lowerJoin = values => values.filter(Boolean).join(' ').toLocaleLowerCase();
      entry.searchFields = {
        domain: lowerJoin([...domainRaw, ...domainDisplay, ...genes.map(gene => gene.arch), ...genes.map(gene => gene.profiledb)]),
        pfam: lowerJoin(pfams),
        organism: lowerJoin([entry.organism, ...genes.map(gene => gene.organism)]),
        taxonomy: lowerJoin([entry.classification, entry.lineage, entry.taxid, ...genes.map(gene => gene.classification), ...genes.map(gene => gene.lineage)]),
        pid: lowerJoin([...pids, ...genes.map(gene => gene.internalId), ...genes.map(gene => gene.replaced), ...genes.map(gene => gene.locus)]),
        nucleotide: lowerJoin([entry.nucleotide]),
        product: lowerJoin(products),
        assembly: lowerJoin([entry.assembly, ...assemblies]),
        block: lowerJoin([entry.id])
      };
      entry.searchFields.all = lowerJoin(Object.values(entry.searchFields));

      totalGenes += genes.length;
      for (const gene of genes) {
        for (const domain of gene.domains) {
          if (domain.marker) totalMarkers += 1;
          else totalDomains += 1;
        }
      }
      entries.push(entry);
    }

    return { entries, stats: { neighborhoods: entries.length, genes: totalGenes, domains: totalDomains, markers: totalMarkers, rows: validRows } };
  }

  function tokenizeFilter(input) {
    const tokens = [];
    let current = '';
    let quote = null;
    const text = clean(input);
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (char === '"' || char === "'") {
        if (quote === char) quote = null;
        else if (!quote) quote = char;
        else current += char;
      } else if (/\s/.test(char) && !quote) {
        if (current) tokens.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    if (current) tokens.push(current);
    return tokens;
  }

  function compileFilter(input, defaultExclude = false) {
    return tokenizeFilter(input).map(rawToken => {
      let token = rawToken;
      let exclude = defaultExclude;
      if (token.startsWith('-') && token.length > 1) {
        exclude = true;
        token = token.slice(1);
      }
      let field = 'all';
      const colon = token.indexOf(':');
      if (colon > 0) {
        const candidate = token.slice(0, colon).toLocaleLowerCase();
        if (FIELD_ALIASES[candidate]) {
          field = FIELD_ALIASES[candidate];
          token = token.slice(colon + 1);
        }
      }
      return { field, value: token.toLocaleLowerCase(), exclude };
    }).filter(term => term.value);
  }

  function entryMatches(entry, terms) {
    return terms.every(term => {
      const matched = (entry.searchFields[term.field] || '').includes(term.value);
      return term.exclude ? !matched : matched;
    });
  }

  // --- Source loading: URLs (fetch) or local Files (FileReader) ------------
  // readSource() accepts either a URL string (config-driven, published pages)
  // or a File object (editor file picker) and resolves to the same {text}
  // shape either way, so the parsing/rendering code below never needs to
  // know which one was used.

  function readFileAsText(file, maxBytes) {
    if (file.size > maxBytes) {
      return Promise.reject(new Error(`${file.name} exceeds the configured ${(maxBytes / 1048576).toFixed(0)} MB limit.`));
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}.`));
      reader.readAsText(file);
    });
  }

  async function fetchTextFromUrl(url, label, maxBytes) {
    let response;
    try {
      response = await fetch(url, { cache: 'no-store' });
    } catch (error) {
      const localHint = location.protocol === 'file:'
        ? '\n\nServe this directory over HTTP, for example: python -m http.server 8000'
        : '';
      throw new Error(`Could not load ${label} (${url}).${localHint}`);
    }
    if (!response.ok) throw new Error(`${label}: HTTP ${response.status} while loading ${url}.`);
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error(`${label} exceeds the configured ${(maxBytes / 1048576).toFixed(0)} MB limit.`);
    }
    const blob = await response.blob();
    if (blob.size > maxBytes) throw new Error(`${label} exceeds the configured ${(maxBytes / 1048576).toFixed(0)} MB limit.`);
    return blob.text();
  }

  function readSource(source, label, maxBytes) {
    if (source instanceof File || (typeof Blob !== 'undefined' && source instanceof Blob)) {
      return readFileAsText(source, maxBytes);
    }
    if (typeof source === 'string' && source) {
      return fetchTextFromUrl(source, label, maxBytes);
    }
    return Promise.reject(new Error(`${label} was not provided.`));
  }


  function readOptionalSource(source, label, maxBytes) {
    if (source == null || source === '') return Promise.resolve('');
    return readSource(source, label, maxBytes);
  }
  // --- end source loading ----------------------------------------------------

  function createSvgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) {
      if (value != null) element.setAttribute(key, String(value));
    }
    return element;
  }

  function arrowPoints(x1, x2, y1, y2, strand, arrowHeadPx) {
    const width = Math.max(0, x2 - x1);
    const midY = (y1 + y2) / 2;
    const tip = Math.min(arrowHeadPx, Math.max(3, width * 0.4));
    if (width <= tip + 0.5) {
      return strand === '+'
        ? `${x1},${y1} ${x2},${midY} ${x1},${y2}`
        : `${x2},${y1} ${x1},${midY} ${x2},${y2}`;
    }
    if (strand === '+') {
      const bodyEnd = x2 - tip;
      return `${x1},${y1} ${bodyEnd},${y1} ${x2},${midY} ${bodyEnd},${y2} ${x1},${y2}`;
    }
    const bodyStart = x1 + tip;
    return `${x2},${y1} ${bodyStart},${y1} ${x1},${midY} ${bodyStart},${y2} ${x2},${y2}`;
  }

  function shouldFlip(entry, flipNegative) {
    return Boolean(flipNegative && entry.anchorStrand === '-');
  }

  function orientedGene(entry, gene, flipNegative) {
    const flipped = shouldFlip(entry, flipNegative);
    if (!flipped) {
      return {
        start: gene.start - entry.anchorCenter,
        end: gene.end - entry.anchorCenter,
        strand: gene.strand,
        domains: gene.domains
      };
    }
    return {
      start: entry.anchorCenter - gene.end,
      end: entry.anchorCenter - gene.start,
      strand: gene.strand === '+' ? '-' : '+',
      domains: [...gene.domains].reverse()
    };
  }

  function computeGlobalExtent(entries, flipNegative) {
    let min = 0;
    let max = 0;
    for (const entry of entries) {
      for (const gene of entry.genes) {
        const oriented = orientedGene(entry, gene, flipNegative);
        min = Math.min(min, oriented.start);
        max = Math.max(max, oriented.end);
      }
    }
    const span = Math.max(1, max - min);
    const margin = span * 0.025;
    return { min: min - margin, max: max + margin };
  }

  function rowExtent(entry, flipNegative) {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const gene of entry.genes) {
      const oriented = orientedGene(entry, gene, flipNegative);
      min = Math.min(min, oriented.start);
      max = Math.max(max, oriented.end);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: -1, max: 1 };
    const span = Math.max(1, max - min);
    const margin = span * 0.03;
    return { min: min - margin, max: max + margin };
  }

  function mapToTrack(value, extent, width) {
    return ((value - extent.min) / Math.max(1e-9, extent.max - extent.min)) * width;
  }

  function visibleGeneBounds(x1, x2, trackWidth) {
    let left = Math.min(x1, x2);
    let right = Math.max(x1, x2);
    const width = right - left;
    if (width < DEFAULTS.minGenePx) {
      const center = (left + right) / 2;
      left = center - DEFAULTS.minGenePx / 2;
      right = center + DEFAULTS.minGenePx / 2;
    }
    if (right - left > 4) {
      left += 0.65;
      right -= 0.65;
    }
    return {
      x1: Math.max(-2, left),
      x2: Math.min(trackWidth + 2, right)
    };
  }

  function parseCssColor(color) {
    const hex = clean(color).match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!hex) return null;
    let value = hex[1];
    if (value.length === 3) value = value.split('').map(char => char + char).join('');
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16)
    };
  }

  function textColorFor(background) {
    const rgb = parseCssColor(background);
    if (!rgb) return '#111827';
    const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    return luminance < 0.48 ? '#ffffff' : '#111827';
  }

  function layoutOrderedDomains(domains, x1, x2) {
    if (!domains.length || x2 <= x1) return [];
    const totalWidth = Math.max(0.1, x2 - x1);
    const minWidth = DEFAULTS.minMarkerPixelWidth;
    const specs = domains.map(domain => ({
      domain,
      isMarker: domain.marker?.position === 'ordered',
      targetWidth: domain.marker?.position === 'ordered' ? domain.marker.width : 0
    }));
    const markerSpecs = specs.filter(spec => spec.isMarker);
    const regularCount = specs.length - markerSpecs.length;

    if (!markerSpecs.length) {
      const width = totalWidth / specs.length;
      return specs.map((spec, index) => ({ ...spec, x: x1 + index * width, width, contiguous: true }));
    }

    // A gene made only of TM-like markers gets a neutral body with the bars
    // distributed across it. This shows the number of helices without turning
    // each TM into a full-size domain block.
    if (!regularCount) {
      const requested = markerSpecs.reduce((sum, spec) => sum + spec.targetWidth, 0);
      const scale = requested > totalWidth ? totalWidth / requested : 1;
      const used = requested * scale;
      const gap = Math.max(0, (totalWidth - used) / (specs.length + 1));
      let cursor = x1 + gap;
      return specs.map(spec => {
        const width = spec.targetWidth * scale;
        const segment = { ...spec, x: cursor, width, contiguous: gap < 0.01 };
        cursor += width + gap;
        return segment;
      });
    }

    if (totalWidth <= minWidth * specs.length) {
      const width = totalWidth / specs.length;
      return specs.map((spec, index) => ({ ...spec, x: x1 + index * width, width, contiguous: true }));
    }

    const requestedMarkers = markerSpecs.reduce((sum, spec) => sum + spec.targetWidth, 0);
    const availableForMarkers = Math.max(
      markerSpecs.length * minWidth,
      totalWidth - regularCount * minWidth
    );
    const markerScale = requestedMarkers > availableForMarkers
      ? availableForMarkers / requestedMarkers
      : 1;
    const widths = specs.map(spec => spec.isMarker
      ? Math.max(minWidth, spec.targetWidth * markerScale)
      : 0
    );
    const markerTotal = widths.reduce((sum, width) => sum + width, 0);
    const regularWidth = Math.max(minWidth, (totalWidth - markerTotal) / regularCount);
    specs.forEach((spec, index) => {
      if (!spec.isMarker) widths[index] = regularWidth;
    });

    const widthSum = widths.reduce((sum, width) => sum + width, 0);
    if (Math.abs(widthSum - totalWidth) > 0.001) {
      const regularIndexes = specs
        .map((spec, index) => spec.isMarker ? -1 : index)
        .filter(index => index >= 0);
      const correction = (totalWidth - widthSum) / regularIndexes.length;
      regularIndexes.forEach(index => {
        widths[index] = Math.max(0.1, widths[index] + correction);
      });
    }

    let cursor = x1;
    return specs.map((spec, index) => {
      const width = widths[index];
      const segment = { ...spec, x: cursor, width, contiguous: true };
      cursor += width;
      return segment;
    });
  }

  function fixedWidthForDomain(domain, state) {
    const configured = lookupMapped(state.fixedDomainWidthLookup, domain.name)
      ?? lookupMapped(state.fixedDomainWidthLookup, domain.rawName);
    const baseWidth = Number.isFinite(Number(configured))
      ? Number(configured)
      : state.config.fixedDomainWidth;
    return Math.max(16, baseWidth) * state.zoom;
  }

  function layoutFixedOrderedDomains(domains, x1, x2, state) {
    if (!domains.length || x2 <= x1) return [];
    const regularCount = domains.filter(domain => !domain.marker).length;

    // Preserve the special marker-only treatment: a neutral gene body with
    // narrow TM bars distributed through it.
    if (!regularCount) return layoutOrderedDomains(domains, x1, x2);

    const requestedWidths = domains.map(domain => domain.marker?.position === 'ordered'
      ? domain.marker.width
      : fixedWidthForDomain(domain, state)
    );
    const requestedTotal = requestedWidths.reduce((sum, width) => sum + width, 0);
    const available = Math.max(0.1, x2 - x1);
    const scale = requestedTotal > available ? available / requestedTotal : 1;
    let cursor = x1;

    return domains.map((domain, index) => {
      const width = requestedWidths[index] * scale;
      const segment = {
        domain,
        isMarker: Boolean(domain.marker),
        x: cursor,
        width,
        contiguous: true
      };
      cursor += width;
      return segment;
    });
  }

  function fixedGeneDisplayWidth(domains, state) {
    const startMarkers = domains.filter(domain => domain.marker?.position === 'start');
    const orderedDomains = domains.filter(domain => domain.marker?.position !== 'start');
    const startWidth = startMarkers.reduce((sum, domain) => sum + domain.marker.width, 0);
    const orderedMarkerWidth = orderedDomains.reduce((sum, domain) => (
      sum + (domain.marker?.position === 'ordered' ? domain.marker.width : 0)
    ), 0);
    const regularDomains = orderedDomains.filter(domain => !domain.marker);

    const bodyWidth = regularDomains.length
      ? orderedMarkerWidth + regularDomains.reduce((sum, domain) => sum + fixedWidthForDomain(domain, state), 0)
      : Math.max(
        state.config.fixedMarkerOnlyGeneWidth * state.zoom,
        orderedMarkerWidth + 12 * state.zoom
      );

    return Math.max(DEFAULTS.minGenePx, startWidth + bodyWidth);
  }

  function computeFixedRowLayout(entry, state) {
    const orientedGenes = entry.genes.map(gene => ({
      gene,
      ...orientedGene(entry, gene, state.flipNegative)
    })).sort((a, b) => (a.start - b.start) || (a.end - b.end));

    const placements = new Map();
    const orderedPlacements = [];
    let cursor = 0;
    let previous = null;

    for (const oriented of orientedGenes) {
      if (previous) {
        const overlaps = oriented.start < previous.end;
        const baseGap = overlaps
          ? Math.max(2, state.config.fixedGeneGap * 0.25)
          : state.config.fixedGeneGap;
        cursor += baseGap * state.zoom;
      }

      const width = fixedGeneDisplayWidth(oriented.domains, state);
      const placement = {
        ...oriented,
        x1: cursor,
        x2: cursor + width
      };
      orderedPlacements.push(placement);
      placements.set(oriented.gene, placement);
      cursor += width;
      previous = oriented;
    }

    const anchorPlacements = orderedPlacements.filter(placement => placement.gene.query);
    const anchors = anchorPlacements.length
      ? anchorPlacements
      : [orderedPlacements[Math.floor(orderedPlacements.length / 2)]];
    const anchorCenter = anchors.reduce((sum, placement) => sum + (placement.x1 + placement.x2) / 2, 0)
      / Math.max(1, anchors.length);
    const min = orderedPlacements.length ? orderedPlacements[0].x1 : 0;
    const max = orderedPlacements.length ? orderedPlacements[orderedPlacements.length - 1].x2 : 0;

    return {
      placements,
      orderedPlacements,
      min,
      max,
      width: Math.max(0, max - min),
      anchorCenter,
      alignedMin: min - anchorCenter,
      alignedMax: max - anchorCenter
    };
  }

  function computeFixedLayouts(entries, state) {
    const rows = new Map();
    let alignedMin = 0;
    let alignedMax = 0;
    let maxWidth = 0;
    for (const entry of entries) {
      const row = computeFixedRowLayout(entry, state);
      rows.set(entry, row);
      alignedMin = Math.min(alignedMin, row.alignedMin);
      alignedMax = Math.max(alignedMax, row.alignedMax);
      maxWidth = Math.max(maxWidth, row.width);
    }
    return { rows, extent: { min: alignedMin, max: alignedMax }, maxWidth };
  }

  function layoutStartMarkers(domains, x1, x2, strand, reserveBody) {
    const markers = domains.filter(domain => domain.marker?.position === 'start');
    if (!markers.length) return { markers: [], bodyX1: x1, bodyX2: x2 };

    const totalWidth = Math.max(0.1, x2 - x1);
    const requested = markers.reduce((sum, domain) => sum + domain.marker.width, 0);
    const bodyReserve = reserveBody ? Math.min(1, totalWidth * 0.15) : 0;
    const available = Math.max(0.1, totalWidth - bodyReserve);
    const scale = requested > available ? available / requested : 1;
    const result = [];
    let used = 0;

    for (const domain of markers) {
      const width = domain.marker.width * scale;
      const x = strand === '+' ? x1 + used : x2 - used - width;
      result.push({ domain, x, width, isMarker: true, contiguous: true });
      used += width;
    }

    return {
      markers: result,
      bodyX1: strand === '+' ? x1 + used : x1,
      bodyX2: strand === '-' ? x2 - used : x2
    };
  }

  function fitDomainLabel(name, widthPx) {
    if (widthPx < 24) return '';
    const availableChars = Math.floor((widthPx - 7) / 6.25);
    if (availableChars < 2) return '';
    if (name.length <= availableChars) return name;
    if (availableChars <= 3) return '';
    return `${name.slice(0, availableChars - 1)}…`;
  }

  function ncbiUrl(nucleotide, start, end, strand = '+') {
    const accession = clean(nucleotide);
    if (!accession || !Number.isFinite(start) || !Number.isFinite(end)) return '';
    const url = new URL(`https://www.ncbi.nlm.nih.gov/nuccore/${encodeURIComponent(accession)}`);
    url.searchParams.set('from', String(Math.round(Math.min(start, end))));
    url.searchParams.set('to', String(Math.round(Math.max(start, end))));
    if (strand === '-') url.searchParams.set('strand', '2');
    return url.toString();
  }

  function ncbiProteinUrl(pid) {
    const accession = clean(pid);
    if (!accession || accession.startsWith('unknown_')) return '';
    return `https://www.ncbi.nlm.nih.gov/protein/${encodeURIComponent(accession)}`;
  }

  function createTooltip(host) {
    const element = document.createElement('div');
    element.className = 'nbh-tooltip';
    element.hidden = true;
    host.appendChild(element);
    let lastEvent = null;
    let moveFrame = 0;

    function addField(list, label, value) {
      const text = clean(value);
      if (!text || text === '-') return;
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = text;
      list.append(dt, dd);
    }

    function render({ domain, gene, entry }) {
      element.replaceChildren();
      const head = document.createElement('div');
      head.className = 'nbh-tooltip-head';
      const title = document.createElement('div');
      title.className = 'nbh-tooltip-title';
      title.textContent = domain?.name || gene.arch || gene.pid;
      head.appendChild(title);
      if (gene.query) {
        const badge = document.createElement('span');
        badge.className = 'nbh-tooltip-badge';
        badge.textContent = 'QUERY';
        head.appendChild(badge);
      }
      element.appendChild(head);

      const list = document.createElement('dl');
      list.className = 'nbh-tooltip-grid';
      addField(list, 'Protein', gene.pid);
      addField(list, 'PFAM', gene.pfam);
      addField(list, 'Organism', gene.organism || entry.organism);
      addField(list, 'Taxonomy', gene.classification || entry.classification || gene.lineage || entry.lineage);
      addField(list, 'Product', gene.product);
      if (entry.nucleotide) {
        addField(list, 'Region', `${entry.nucleotide}:${formatInt(gene.start)}–${formatInt(gene.end)} (${gene.strand})`);
      } else {
        addField(list, 'Orientation', gene.strand === '-' ? 'Reverse' : 'Forward');
      }
      if (domain && Number.isFinite(domain.proteinStart) && Number.isFinite(domain.proteinEnd)) {
        addField(list, 'Domain span', `${formatInt(domain.proteinStart)}–${formatInt(domain.proteinEnd)} aa`);
      }
      element.appendChild(list);

      const foot = document.createElement('div');
      foot.className = 'nbh-tooltip-foot';
      foot.textContent = entry.nucleotide
        ? 'Click the arrow to open this region at NCBI ↗'
        : (ncbiProteinUrl(gene.pid) ? 'Click the arrow to open this protein at NCBI ↗' : 'Schematic gene; no external accession is available.');
      element.appendChild(foot);
    }

    function position(event) {
      lastEvent = event;
      if (moveFrame) return;
      moveFrame = requestAnimationFrame(() => {
        moveFrame = 0;
        if (!lastEvent || element.hidden) return;
        const gap = 14;
        const bounds = element.getBoundingClientRect();
        let left = lastEvent.clientX + gap;
        let top = lastEvent.clientY + gap;
        if (left + bounds.width > window.innerWidth - 8) left = lastEvent.clientX - bounds.width - gap;
        if (top + bounds.height > window.innerHeight - 8) top = lastEvent.clientY - bounds.height - gap;
        element.style.left = `${Math.max(8, left)}px`;
        element.style.top = `${Math.max(8, top)}px`;
      });
    }

    return {
      show(event, payload) {
        render(payload);
        element.hidden = false;
        position(event);
      },
      move: position,
      hide() {
        element.hidden = true;
        lastEvent = null;
      }
    };
  }

  function buildTrackSvg(entry, state, layout, tooltip) {
    const trackWidth = layout.trackWidth;
    const trackHeight = DEFAULTS.trackHeight;
    const arrowY1 = (trackHeight - DEFAULTS.arrowHeight) / 2;
    const arrowY2 = arrowY1 + DEFAULTS.arrowHeight;
    const isFixed = state.scaleMode === 'fixed';
    const fixedRow = isFixed ? state.fixedLayouts.get(entry) : null;
    const extent = isFixed
      ? null
      : (state.alignQuery ? state.globalExtent : rowExtent(entry, state.flipNegative));
    const svgId = ++svgSerial;

    const svg = createSvgElement('svg', {
      viewBox: `0 0 ${trackWidth} ${trackHeight}`,
      width: trackWidth,
      height: trackHeight,
      class: 'nbh-track-svg',
      role: 'img',
      'data-layout': state.scaleMode,
      'aria-label': `Gene neighborhood ${entry.id}`
    });
    const defs = createSvgElement('defs');
    svg.appendChild(defs);

    svg.appendChild(createSvgElement('line', {
      x1: 0, x2: trackWidth,
      y1: trackHeight / 2, y2: trackHeight / 2,
      class: 'nbh-track-line'
    }));

    const anchorX = state.alignQuery
      ? (isFixed ? layout.fixedAnchorX : mapToTrack(0, extent, trackWidth))
      : null;
    if (anchorX != null && anchorX >= 0 && anchorX <= trackWidth) {
      svg.appendChild(createSvgElement('line', {
        x1: anchorX, x2: anchorX,
        y1: 2, y2: trackHeight - 2,
        class: 'nbh-anchor-line'
      }));
    }

    entry.genes.forEach((gene, geneIndex) => {
      let oriented;
      let bounds;

      if (isFixed) {
        const placement = fixedRow?.placements.get(gene);
        if (!placement) return;
        oriented = placement;
        const rowOffset = state.alignQuery
          ? layout.fixedAnchorX - fixedRow.anchorCenter
          : layout.fixedLeftX;
        bounds = {
          x1: rowOffset + placement.x1,
          x2: rowOffset + placement.x2
        };
      } else {
        oriented = orientedGene(entry, gene, state.flipNegative);
        const mappedStart = mapToTrack(oriented.start, extent, trackWidth);
        const mappedEnd = mapToTrack(oriented.end, extent, trackWidth);
        bounds = visibleGeneBounds(mappedStart, mappedEnd, trackWidth);
      }

      if (bounds.x2 < 0 || bounds.x1 > trackWidth || bounds.x2 <= bounds.x1) return;

      const points = arrowPoints(bounds.x1, bounds.x2, arrowY1, arrowY2, oriented.strand, DEFAULTS.arrowHeadPx);
      const clipId = `gnv-clip-${svgId}-${geneIndex}`;
      const clipPath = createSvgElement('clipPath', { id: clipId });
      clipPath.appendChild(createSvgElement('polygon', { points }));
      defs.appendChild(clipPath);

      const href = entry.nucleotide
        ? ncbiUrl(entry.nucleotide, gene.start, gene.end, gene.strand)
        : ncbiProteinUrl(gene.pid);
      const link = createSvgElement('a', {
        class: 'nbh-gene-link',
        target: '_blank',
        rel: 'noopener noreferrer',
        'aria-label': href
          ? `${gene.pid}; open at NCBI`
          : `${gene.pid}; schematic gene`
      });
      if (href) {
        link.setAttribute('href', href);
        link.setAttributeNS(XLINK_NS, 'xlink:href', href);
      }

      const clipped = createSvgElement('g', { 'clip-path': `url(#${clipId})` });
      const domains = oriented.domains.length
        ? oriented.domains
        : [{ name: '?', rawName: '?', color: state.config.unknownDomainColor, marker: null }];
      const orderedDomains = domains.filter(domain => domain.marker?.position !== 'start');
      const startLayout = layoutStartMarkers(
        domains,
        bounds.x1,
        bounds.x2,
        oriented.strand,
        orderedDomains.length > 0
      );
      const segments = isFixed
        ? layoutFixedOrderedDomains(orderedDomains, startLayout.bodyX1, startLayout.bodyX2, state)
        : layoutOrderedDomains(orderedDomains, startLayout.bodyX1, startLayout.bodyX2);

      clipped.appendChild(createSvgElement('rect', {
        x: bounds.x1,
        y: arrowY1,
        width: Math.max(0.1, bounds.x2 - bounds.x1),
        height: DEFAULTS.arrowHeight,
        fill: state.config.geneBackgroundColor,
        class: 'nbh-gene-background'
      }));

      function appendDomainRect(segment, extraClass = '') {
        const domain = segment.domain;
        const markerClass = domain.marker ? ` nbh-domain-marker nbh-domain-marker-${cssClassToken(domain.name || domain.rawName)}` : '';
        const selectedClass = state.highlightedDomain
          && clean(domain.rawName).toLocaleLowerCase() === clean(state.highlightedDomain).toLocaleLowerCase()
          ? ' nbh-domain-selected'
          : '';
        const rect = createSvgElement('rect', {
          x: segment.x,
          y: arrowY1,
          width: Math.max(0.1, segment.width + (segment.contiguous && !domain.marker && !isFixed ? 0.35 : 0)),
          height: DEFAULTS.arrowHeight,
          fill: domain.color,
          class: `nbh-domain${markerClass}${selectedClass}${extraClass}`,
          'data-domain': domain.name,
          'data-domain-id': domain.rawName,
          'data-marker': domain.marker ? domain.marker.position : null
        });
        rect.addEventListener('pointerenter', event => tooltip.show(event, { domain, gene, entry }));
        rect.addEventListener('pointermove', event => tooltip.move(event));
        rect.addEventListener('pointerleave', () => tooltip.hide());
        rect.addEventListener('click', event => {
          if (!state.domainEditMode || !state.domainSelectHandlers.size) return;
          event.preventDefault();
          event.stopPropagation();
          for (const handler of state.domainSelectHandlers) {
            try { handler({ rawName: domain.rawName, displayName: domain.name, marker: Boolean(domain.marker), gene, entry }); }
            catch (error) { console.error(error); }
          }
        });
        clipped.appendChild(rect);
      }

      segments.forEach((segment, domainIndex) => {
        appendDomainRect(segment);
        const previous = segments[domainIndex - 1];
        const touchesPrevious = previous && Math.abs(segment.x - (previous.x + previous.width)) < 0.75;
        if (touchesPrevious && !segment.domain.marker && !previous.domain.marker) {
          clipped.appendChild(createSvgElement('line', {
            x1: segment.x, x2: segment.x,
            y1: arrowY1, y2: arrowY2,
            class: 'nbh-domain-separator'
          }));
        }
      });

      // SIG-like markers are always drawn at the protein/gene start (the tail
      // of the oriented arrow), independently of their domp position.
      startLayout.markers.forEach(segment => appendDomainRect(segment, ' nbh-domain-marker-start'));
      link.appendChild(clipped);

      if (gene.query) {
        link.appendChild(createSvgElement('polygon', { points, class: 'nbh-query-halo' }));
        link.appendChild(createSvgElement('polygon', { points, class: 'nbh-query-outline' }));
      } else {
        link.appendChild(createSvgElement('polygon', { points, class: 'nbh-gene-outline' }));
      }

      if (state.showLabels) {
        const labels = createSvgElement('g', { 'clip-path': `url(#${clipId})` });
        segments.forEach(segment => {
          const domain = segment.domain;
          if (domain.marker) return;
          const label = fitDomainLabel(domain.name, segment.width);
          if (!label) return;
          const text = createSvgElement('text', {
            x: segment.x + segment.width / 2,
            y: trackHeight / 2 + 0.5,
            'text-anchor': 'middle',
            fill: textColorFor(domain.color),
            class: 'nbh-domain-label'
          });
          text.textContent = label;
          labels.appendChild(text);
        });
        link.appendChild(labels);
      }

      link.addEventListener('focus', () => {
        const rect = link.getBoundingClientRect();
        tooltip.show({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }, { domain: null, gene, entry });
      });
      link.addEventListener('blur', () => tooltip.hide());
      svg.appendChild(link);
    });

    return svg;
  }

  function createRowLabel(entry) {
    const label = document.createElement('div');
    label.className = 'nbh-row-label';
    label.title = entry.classification || entry.lineage || entry.organism || entry.id;

    const primary = document.createElement('strong');
    primary.textContent = entry.queryPids.length ? entry.queryPids.join(', ') : entry.id;
    if (entry.queryPids.length > 1) {
      const count = document.createElement('span');
      count.className = 'query-count';
      count.textContent = `${entry.queryPids.length} queries`;
      primary.appendChild(count);
    }

    const region = document.createElement(entry.nucleotide ? 'a' : 'span');
    region.className = 'nbh-region-label';
    if (entry.nucleotide) {
      region.textContent = `${entry.nucleotide}:${formatInt(entry.regionStart)}–${formatInt(entry.regionEnd)} ↗`;
      region.href = ncbiUrl(entry.nucleotide, entry.regionStart, entry.regionEnd);
      region.target = '_blank';
      region.rel = 'noopener noreferrer';
      region.title = 'Open the neighborhood at NCBI';
    } else {
      region.textContent = `${numberText(entry.genes.length)} genes · schematic`;
      region.title = 'Schematic neighborhood reconstructed from compact architecture input';
    }

    const organism = document.createElement('em');
    organism.textContent = entry.organism || 'Organism not provided';

    label.append(primary, region, organism);
    return label;
  }

  function createVirtualList({ viewport, spacer, rowLayer, tooltip, state, layout }) {
    let items = [];
    const rendered = new Map();
    let updateFrame = 0;

    function renderRow(entry, index) {
      const row = document.createElement('div');
      row.className = index % 2 ? 'nbh-row is-alt' : 'nbh-row';
      row.style.top = `${index * DEFAULTS.rowHeight}px`;
      row.style.width = `${layout.rowWidth}px`;
      row.appendChild(createRowLabel(entry));

      const track = document.createElement('div');
      track.className = 'nbh-row-track';
      track.style.width = `${layout.trackWidth + DEFAULTS.trackPadding}px`;
      track.appendChild(buildTrackSvg(entry, state, layout, tooltip));
      row.appendChild(track);
      return row;
    }

    function clearRendered() {
      for (const element of rendered.values()) element.remove();
      rendered.clear();
    }

    function updateNow() {
      if (!items.length) {
        clearRendered();
        return;
      }
      const first = Math.max(0, Math.floor(viewport.scrollTop / DEFAULTS.rowHeight) - DEFAULTS.rowBuffer);
      const last = Math.min(
        items.length - 1,
        Math.ceil((viewport.scrollTop + viewport.clientHeight) / DEFAULTS.rowHeight) + DEFAULTS.rowBuffer
      );

      for (const [index, element] of rendered) {
        if (index < first || index > last) {
          element.remove();
          rendered.delete(index);
        }
      }
      for (let index = first; index <= last; index += 1) {
        if (rendered.has(index)) continue;
        const row = renderRow(items[index], index);
        rowLayer.appendChild(row);
        rendered.set(index, row);
      }
    }

    function scheduleUpdate() {
      if (updateFrame) return;
      updateFrame = requestAnimationFrame(() => {
        updateFrame = 0;
        updateNow();
      });
    }

    viewport.addEventListener('scroll', scheduleUpdate, { passive: true });

    return {
      setItems(nextItems, resetScroll = true) {
        items = nextItems;
        clearRendered();
        spacer.style.height = `${Math.max(viewport.clientHeight, items.length * DEFAULTS.rowHeight)}px`;
        spacer.style.minWidth = `${layout.rowWidth}px`;
        if (resetScroll) viewport.scrollTop = 0;
        updateNow();
      },
      refresh() {
        clearRendered();
        spacer.style.height = `${Math.max(viewport.clientHeight, items.length * DEFAULTS.rowHeight)}px`;
        spacer.style.minWidth = `${layout.rowWidth}px`;
        updateNow();
      },
      scheduleUpdate
    };
  }

  function numberText(value) {
    return Number(value).toLocaleString('en-US');
  }

  async function init(elementIds) {
    const elements = {};
    for (const [key, id] of Object.entries(elementIds)) elements[key] = document.getElementById(id);
    const config = normalizeConfig(window.NEIGHBORHOOD_VIEWER_CONFIG || {});

    document.title = config.title;
    if (elements.appTitle) elements.appTitle.textContent = config.title;
    if (elements.includeInput) elements.includeInput.placeholder = config.includePlaceholder;
    if (elements.excludeInput) elements.excludeInput.placeholder = config.excludePlaceholder;
    document.documentElement.style.setProperty('--row-height', `${DEFAULTS.rowHeight}px`);
    document.documentElement.style.setProperty('--label-width', `${DEFAULTS.labelWidth}px`);

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

    const state = {
      config,
      scaleMode: config.defaultScaleMode,
      alignQuery: config.defaultAlignQuery,
      flipNegative: config.defaultFlipNegativeQueries,
      showLabels: config.defaultShowLabels,
      zoom: config.defaultZoom,
      globalExtent: { min: -1, max: 1 },
      fixedExtent: { min: 0, max: 0 },
      fixedMaxWidth: 0,
      fixedLayouts: new Map(),
      fixedDomainWidthLookup: makeCaseInsensitiveLookup(config.fixedDomainWidths),
      allEntries: [],
      filteredEntries: [],
      stats: { neighborhoods: 0, genes: 0, domains: 0, markers: 0, rows: 0 },
      rawTsvText: '',
      inputFormat: '',
      normalizedTsv: '',
      parseWarnings: [],
      renameMap: Object.create(null),
      colorMap: Object.create(null),
      domainEditMode: false,
      highlightedDomain: '',
      domainSelectHandlers: new Set(),
      visibleChangeHandlers: new Set(),
      dataChangeHandlers: new Set()
    };
    const layout = {
      trackWidth: DEFAULTS.minTrackWidth,
      rowWidth: DEFAULTS.labelWidth + DEFAULTS.minTrackWidth + DEFAULTS.trackPadding,
      fixedLeftX: DEFAULTS.fixedSidePadding,
      fixedAnchorX: DEFAULTS.minTrackWidth / 2
    };

    if (elements.scaleMode) elements.scaleMode.value = state.scaleMode;
    if (elements.alignQueryCheckbox) elements.alignQueryCheckbox.checked = state.alignQuery;
    if (elements.flipCheckbox) elements.flipCheckbox.checked = state.flipNegative;
    if (elements.labelsCheckbox) elements.labelsCheckbox.checked = state.showLabels;
    if (elements.zoomInput) elements.zoomInput.value = String(state.zoom);
    if (elements.zoomValue) elements.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;

    const tooltip = createTooltip(elements.tooltipHost || document.body);
    const virtualList = createVirtualList({
      viewport: elements.viewport,
      spacer: elements.spacer,
      rowLayer: elements.rowLayer,
      tooltip,
      state,
      layout
    });

    function copyFlatObject(value) {
      const result = Object.create(null);
      if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
      for (const [key, mapped] of Object.entries(value)) {
        const normalizedKey = clean(key);
        if (normalizedKey) result[normalizedKey] = clean(mapped);
      }
      return result;
    }

    function notifyHandlers(handlers, payload) {
      for (const handler of handlers) {
        try { handler(payload); }
        catch (error) { console.error(error); }
      }
    }

    function collectDomainStats(entries) {
      const stats = new Map();
      for (const entry of entries) {
        const neighborhoodSeen = new Set();
        for (const gene of entry.genes) {
          const geneSeen = new Set();
          for (const domain of gene.domains) {
            const rawName = clean(domain.rawName);
            if (!rawName || rawName === '?' || rawName === '-') continue;
            let record = stats.get(rawName);
            if (!record) {
              record = {
                rawName,
                displayName: clean(domain.name) || rawName,
                color: clean(domain.color) || state.config.unknownDomainColor,
                marker: Boolean(domain.marker),
                occurrences: 0,
                genes: 0,
                neighborhoods: 0
              };
              stats.set(rawName, record);
            }
            record.displayName = clean(domain.name) || record.displayName;
            record.color = clean(domain.color) || record.color;
            record.marker = record.marker || Boolean(domain.marker);
            record.occurrences += 1;
            if (!geneSeen.has(rawName)) {
              geneSeen.add(rawName);
              record.genes += 1;
            }
            if (!neighborhoodSeen.has(rawName)) {
              neighborhoodSeen.add(rawName);
              record.neighborhoods += 1;
            }
          }
        }
      }
      return Array.from(stats.values()).sort((a, b) => a.rawName.localeCompare(b.rawName));
    }

    function getDomainStats(options = {}) {
      const scope = clean(options.scope).toLocaleLowerCase() === 'visible' ? 'visible' : 'all';
      const entries = scope === 'visible' ? state.filteredEntries : state.allEntries;
      return collectDomainStats(entries).map(record => ({ ...record }));
    }

    function getDictionaries() {
      return {
        renames: { ...state.renameMap },
        colors: { ...state.colorMap }
      };
    }

    function setHighlightedDomain(rawName) {
      state.highlightedDomain = clean(rawName);
      virtualList.refresh();
    }

    function recomputeFixedLayouts() {
      const computed = computeFixedLayouts(state.allEntries, state);
      state.fixedLayouts = computed.rows;
      state.fixedExtent = computed.extent;
      state.fixedMaxWidth = computed.maxWidth;
    }

    function setDefaultHorizontalPosition() {
      if (state.scaleMode !== 'fixed' || !state.alignQuery) {
        elements.viewport.scrollLeft = 0;
        return;
      }
      const visibleTrackWidth = Math.max(1, elements.viewport.clientWidth - DEFAULTS.labelWidth);
      const desiredScreenX = DEFAULTS.labelWidth + visibleTrackWidth / 2;
      const anchorAbsoluteX = DEFAULTS.labelWidth + DEFAULTS.trackPadding / 2 + layout.fixedAnchorX;
      elements.viewport.scrollLeft = Math.max(0, anchorAbsoluteX - desiredScreenX);
    }

    function updateLayout(preserve = true) {
      const available = Math.max(0, elements.viewport.clientWidth - DEFAULTS.labelWidth - DEFAULTS.trackPadding);
      const baseWidth = Math.max(DEFAULTS.minTrackWidth, available);

      if (state.scaleMode === 'fixed') {
        if (state.alignQuery) {
          const span = Math.max(1, state.fixedExtent.max - state.fixedExtent.min);
          const contentWidth = span + DEFAULTS.fixedSidePadding * 2;
          layout.trackWidth = Math.max(300, Math.ceil(Math.max(baseWidth, contentWidth)));
          const extra = Math.max(0, layout.trackWidth - contentWidth);
          layout.fixedAnchorX = DEFAULTS.fixedSidePadding + extra / 2 - state.fixedExtent.min;
          layout.fixedLeftX = DEFAULTS.fixedSidePadding;
        } else {
          const contentWidth = state.fixedMaxWidth + DEFAULTS.fixedSidePadding * 2;
          layout.trackWidth = Math.max(300, Math.ceil(Math.max(baseWidth, contentWidth)));
          layout.fixedLeftX = DEFAULTS.fixedSidePadding;
          layout.fixedAnchorX = DEFAULTS.fixedSidePadding;
        }
      } else {
        layout.trackWidth = Math.max(300, Math.round(baseWidth * state.zoom));
        layout.fixedLeftX = DEFAULTS.fixedSidePadding;
        layout.fixedAnchorX = layout.trackWidth / 2;
      }

      layout.rowWidth = DEFAULTS.labelWidth + layout.trackWidth + DEFAULTS.trackPadding;
      if (elements.zoomValue) elements.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
      virtualList.refresh();
      if (!preserve) setDefaultHorizontalPosition();
    }

    function updateStatus() {
      if (!elements.statusText) return;
      const filtered = state.filteredEntries.length;
      const total = state.allEntries.length;
      const neighborhoodWord = total === 1 ? 'neighborhood' : 'neighborhoods';
      const percentage = total ? (filtered / total) * 100 : 0;
      const percentageText = percentage.toFixed(1).replace(/\.0$/, '');
      const prefix = filtered === total
        ? `${numberText(total)} ${neighborhoodWord}`
        : `${numberText(filtered)} of ${numberText(total)} ${neighborhoodWord}`;
      elements.statusText.textContent = `${prefix} (${percentageText}%) · ${numberText(state.stats.genes)} genes · ${numberText(state.stats.domains)} domains`;
    }

    function applyFilter(resetScroll = true) {
      const includeQuery = elements.includeInput ? elements.includeInput.value : '';
      const excludeQuery = elements.excludeInput ? elements.excludeInput.value : '';
      const terms = [
        ...compileFilter(includeQuery, false),
        ...compileFilter(excludeQuery, true)
      ];
      state.filteredEntries = terms.length
        ? state.allEntries.filter(entry => entryMatches(entry, terms))
        : state.allEntries;
      if (elements.includeClearButton) elements.includeClearButton.hidden = !includeQuery;
      if (elements.excludeClearButton) elements.excludeClearButton.hidden = !excludeQuery;
      virtualList.setItems(state.filteredEntries, resetScroll);
      updateStatus();
      notifyHandlers(state.visibleChangeHandlers, {
        visibleNeighborhoods: state.filteredEntries.length,
        totalNeighborhoods: state.allEntries.length,
        domainStats: getDomainStats({ scope: 'visible' })
      });
    }

    let filterTimer = 0;
    function scheduleFilter() {
      window.clearTimeout(filterTimer);
      filterTimer = window.setTimeout(() => applyFilter(true), 110);
    }

    if (elements.includeInput) elements.includeInput.addEventListener('input', scheduleFilter);
    if (elements.excludeInput) elements.excludeInput.addEventListener('input', scheduleFilter);

    if (elements.includeClearButton) {
      elements.includeClearButton.addEventListener('click', () => {
        elements.includeInput.value = '';
        elements.includeInput.focus();
        applyFilter(true);
      });
    }
    if (elements.excludeClearButton) {
      elements.excludeClearButton.addEventListener('click', () => {
        elements.excludeInput.value = '';
        elements.excludeInput.focus();
        applyFilter(true);
      });
    }

    if (elements.scaleMode) {
      elements.scaleMode.addEventListener('change', event => {
        const requested = clean(event.target.value).toLocaleLowerCase();
        state.scaleMode = ['fit', 'fixed'].includes(requested) ? requested : 'fixed';
        updateLayout(false);
      });
    }
    if (elements.alignQueryCheckbox) {
      elements.alignQueryCheckbox.addEventListener('change', event => {
        state.alignQuery = event.target.checked;
        updateLayout(false);
      });
    }
    if (elements.flipCheckbox) {
      elements.flipCheckbox.addEventListener('change', event => {
        state.flipNegative = event.target.checked;
        state.globalExtent = computeGlobalExtent(state.allEntries, state.flipNegative);
        recomputeFixedLayouts();
        updateLayout(!(state.scaleMode === 'fixed' && state.alignQuery));
      });
    }
    if (elements.labelsCheckbox) {
      elements.labelsCheckbox.addEventListener('change', event => {
        state.showLabels = event.target.checked;
        virtualList.refresh();
      });
    }
    if (elements.zoomInput) {
      elements.zoomInput.addEventListener('input', event => {
        state.zoom = Math.min(2.8, Math.max(0.7, finiteNumber(event.target.value, 1)));
        if (state.scaleMode === 'fixed') recomputeFixedLayouts();
        updateLayout(!(state.scaleMode === 'fixed' && state.alignQuery));
      });
    }

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => updateLayout(true), 90);
    };
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(onResize);
      observer.observe(elements.viewport);
    } else {
      window.addEventListener('resize', onResize);
    }

    // --- Data loading (shared by auto-load and the editor file picker) -------
    // sources may be { tsv, color, rename, format } where each value is either a URL
    // string or a File object (see readSource() above). The TSV is required;
    // rename and color dictionaries are optional in editor workflows.
    function applyParsedData(parsed, options = {}) {
      const resetFilters = options.resetFilters !== false;
      const resetScroll = options.resetScroll !== false;
      state.allEntries = parsed.entries;
      state.filteredEntries = parsed.entries;
      state.stats = parsed.stats;
      state.globalExtent = computeGlobalExtent(state.allEntries, state.flipNegative);
      recomputeFixedLayouts();
      updateLayout(!resetScroll);
      if (resetFilters) {
        if (elements.includeInput) elements.includeInput.value = '';
        if (elements.excludeInput) elements.excludeInput.value = '';
      }
      applyFilter(resetScroll);
      notifyHandlers(state.dataChangeHandlers, {
        reason: options.reason || 'load',
        stats: { ...state.stats },
        domainStats: getDomainStats({ scope: 'all' }),
        dictionaries: getDictionaries(),
        inputFormat: state.inputFormat,
        warnings: state.parseWarnings.slice()
      });
    }

    async function loadFromSources(sources) {
      if (elements.errorBox) elements.errorBox.hidden = true;
      if (elements.statusText) elements.statusText.textContent = 'Loading…';
      try {
        const [tsvText, colorText, renameText] = await Promise.all([
          readSource(sources.tsv, 'neighborhood input', config.maxDataBytes),
          readOptionalSource(sources.color, 'color dictionary', config.maxDataBytes),
          readOptionalSource(sources.rename, 'rename dictionary', config.maxDataBytes)
        ]);
        const colors = parseFlatYaml(colorText, 'color_dic.yaml');
        const renames = parseFlatYaml(renameText, 'domain_rename.yaml');
        const parsed = parseNeighborhoodInput(tsvText, renames, colors, config, sources.format || config.inputFormat);
        state.rawTsvText = tsvText;
        state.inputFormat = parsed.inputFormat;
        state.normalizedTsv = parsed.normalizedTsv;
        state.parseWarnings = parsed.warnings.slice();
        state.colorMap = copyFlatObject(colors);
        state.renameMap = copyFlatObject(renames);
        state.highlightedDomain = '';
        applyParsedData(parsed, { resetFilters: true, resetScroll: true, reason: 'load' });
        return true;
      } catch (error) {
        console.error(error);
        if (elements.statusText) elements.statusText.textContent = 'Load error';
        if (elements.errorBox) {
          elements.errorBox.hidden = false;
          elements.errorBox.textContent = error?.message || 'Could not load the data.';
        }
        return false;
      }
    }

    function updateDictionaries(next = {}) {
      if (!state.rawTsvText) throw new Error('Load a neighborhood input before editing domain dictionaries.');
      const renames = next.renames == null ? state.renameMap : copyFlatObject(next.renames);
      const colors = next.colors == null ? state.colorMap : copyFlatObject(next.colors);
      const parsed = parseNeighborhoodInput(state.rawTsvText, renames, colors, config, state.inputFormat || config.inputFormat);
      state.normalizedTsv = parsed.normalizedTsv;
      state.parseWarnings = parsed.warnings.slice();
      state.renameMap = renames;
      state.colorMap = colors;
      applyParsedData(parsed, { resetFilters: false, resetScroll: false, reason: 'dictionary-update' });
      return true;
    }

    function addHandler(set, handler) {
      if (typeof handler !== 'function') return () => {};
      set.add(handler);
      return () => set.delete(handler);
    }

    Object.assign(window.NeighborhoodViewer, {
      loadFromSources,
      updateDictionaries,
      getDictionaries,
      getDomainStats,
      getSummary: () => ({
        stats: { ...state.stats },
        visibleNeighborhoods: state.filteredEntries.length,
        totalNeighborhoods: state.allEntries.length,
        inputFormat: state.inputFormat,
        warnings: state.parseWarnings.slice()
      }),
      getInputFormat: () => state.inputFormat,
      getWarnings: () => state.parseWarnings.slice(),
      getNormalizedTsv: () => state.normalizedTsv,
      setDomainEditMode: value => { state.domainEditMode = Boolean(value); },
      setHighlightedDomain,
      onDomainSelect: handler => addHandler(state.domainSelectHandlers, handler),
      onVisibleChange: handler => addHandler(state.visibleChangeHandlers, handler),
      onDataChange: handler => addHandler(state.dataChangeHandlers, handler)
    });
    // --- end data loading -------------------------------------------------------

    if (!config.manualLoad) {
      await loadFromSources({ tsv: config.dataUrl, color: config.colorUrl, rename: config.renameUrl });
    } else if (elements.statusText) {
      elements.statusText.textContent = 'Choose a neighborhood input, then optionally add rename and color YAML files.';
    }
  }

  // Not frozen because init() attaches the editor-facing API at runtime.
  window.NeighborhoodViewer = {
    version: VIEWER_VERSION,
    init,
    detectInputFormat: detectNeighborhoodInputFormat,
    parseInput(text, options = {}) {
      const config = normalizeConfig(options.config || {});
      return parseNeighborhoodInput(
        text,
        options.renames || Object.create(null),
        options.colors || Object.create(null),
        config,
        options.format || config.inputFormat
      );
    }
  };
})();
