(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.NeighborhoodAlternatives = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '1.0.0';
  const DEFAULTS = Object.freeze({ minSupport: 5, minExpected: 1, maxBothRate: 0.2,
    maxQ: 1, maxPairs: 250000, maxContextCandidates: 500, maxStratumCells: 250000, excludeQuery: true,
    stratumField: '', stratumValue: '' });
  const logFactorials = [0];
  const clean = value => value == null ? '' : String(value).trim();
  const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;

  function parameters(options) {
    const result = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) if (options?.[key] !== undefined) result[key] = options[key];
    for (const key of ['minSupport', 'maxPairs', 'maxContextCandidates', 'maxStratumCells']) {
      const number = Number(result[key]);
      if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${key} must be a positive whole number.`);
      result[key] = number;
    }
    for (const key of ['minExpected', 'maxBothRate', 'maxQ']) {
      const number = Number(result[key]);
      if (!Number.isFinite(number) || number < 0 || (key !== 'minExpected' && number > 1)) {
        throw new Error(`${key} must be ${key === 'minExpected' ? 'a non-negative number' : 'between 0 and 1'}.`);
      }
      result[key] = number;
    }
    result.excludeQuery = result.excludeQuery !== false;
    result.stratumField = clean(result.stratumField);
    result.stratumValue = clean(result.stratumValue);
    if (result.stratumValue && !result.stratumField) throw new Error('Choose a metadata field before selecting a cohort value.');
    return result;
  }

  function ensureFactorials(n) {
    for (let i = logFactorials.length; i <= n; i += 1) logFactorials.push(logFactorials[i - 1] + Math.log(i));
  }
  function logChoose(n, k) {
    if (k < 0 || k > n) return -Infinity;
    return logFactorials[n] - logFactorials[k] - logFactorials[n - k];
  }
  function validateTable(both, aOnly, bOnly, neither) {
    if (![both, aOnly, bOnly, neither].every(value => Number.isSafeInteger(value) && value >= 0)) {
      throw new Error('Contingency table cells must be non-negative whole numbers.');
    }
    const n = both + aOnly + bOnly + neither;
    if (!Number.isSafeInteger(n)) throw new Error('The contingency table is too large.');
    return n;
  }

  // Hypergeometric P(X <= observed), conditioned on the two observed margins.
  // Sum away from the mode, so the recurrence has decreasing terms. The omitted
  // tail is bounded by a geometric series at < 2e-15 of the accumulated sum.
  function fisherDetails(both, aOnly, bOnly, neither) {
    const n = validateTable(both, aOnly, bOnly, neither);
    if (!n) return { p: 1, logP: 0 };
    const k = both + aOnly, draws = both + bOnly;
    const lo = Math.max(0, k + draws - n), hi = Math.min(k, draws);
    if (both >= hi) return { p: 1, logP: 0 };
    ensureFactorials(n);
    const mode = Math.floor((draws + 1) * (k + 1) / (n + 2));
    const lower = both < mode;
    let x = lower ? both : both + 1;
    const firstLog = logChoose(k, x) + logChoose(n - k, draws - x) - logChoose(n, draws);
    let term = 1, sum = 1;
    while (lower ? x > lo : x < hi) {
      const ratio = lower
        ? x * (n - k - draws + x) / ((k - x + 1) * (draws - x + 1))
        : (k - x) * (draws - x) / ((x + 1) * (n - k - draws + x + 1));
      if (ratio < 1 && term * ratio / (1 - ratio) < sum * 2e-15) break;
      term *= ratio;
      sum += term;
      x += lower ? -1 : 1;
    }
    const logTail = Math.min(0, firstLog + Math.log(sum));
    if (lower) return { p: Math.exp(logTail), logP: logTail };
    const tail = Math.exp(logTail);
    return { p: Math.max(0, -Math.expm1(logTail)), logP: Math.log1p(-tail) };
  }
  function fisherDepletion(both, aOnly, bOnly, neither) {
    return fisherDetails(both, aOnly, bOnly, neither).p;
  }

  function adjustBH(values) {
    if (!Array.isArray(values) || values.some(value => !Number.isFinite(value) || value < 0 || value > 1)) {
      throw new Error('P values must be finite numbers between 0 and 1.');
    }
    const order = values.map((p, index) => ({ p, index })).sort((a, b) => a.p - b.p || a.index - b.index);
    const q = Array(values.length);
    let previous = 1;
    for (let i = order.length - 1; i >= 0; i -= 1) {
      previous = Math.min(previous, order[i].p * order.length / (i + 1), 1);
      q[order[i].index] = previous;
    }
    return q;
  }

  function metadataValue(observation, field) {
    const value = observation.metadata?.[field] ?? observation[field];
    if (Array.isArray(value)) return value.map(clean).filter(Boolean).join('; ');
    return value != null && typeof value === 'object' ? JSON.stringify(value) : clean(value);
  }
  function presence(observation) {
    const supplied = observation.domainIds ?? observation.domains ?? [];
    return new Set(Array.from(supplied, value => clean(typeof value === 'object' ? value.id ?? value.name : value))
      .filter(value => value && value !== '?'));
  }
  function countIntersection(left, right) {
    let a = 0, b = 0, count = 0;
    while (a < left.length && b < right.length) {
      if (left[a] === right[b]) { count += 1; a += 1; b += 1; }
      else if (left[a] < right[b]) a += 1;
      else b += 1;
    }
    return count;
  }
  function contingency(a, b, both, n) {
    return { aOnly: a - both, bOnly: b - both, both, neither: n - a - b + both };
  }
  function effect(counts, n) {
    const supportA = counts.aOnly + counts.both, supportB = counts.bOnly + counts.both;
    const expectedBoth = n ? supportA * supportB / n : 0;
    const numerator = counts.both * counts.neither, denominator = counts.aOnly * counts.bOnly;
    return { supportA, supportB, expectedBoth,
      bothRate: Math.min(supportA, supportB) ? counts.both / Math.min(supportA, supportB) : 0,
      observedExpected: expectedBoth ? counts.both / expectedBoth : null,
      oddsRatio: denominator ? numerator / denominator : null,
      oddsRatioStatus: denominator ? 'finite' : numerator ? 'infinite' : 'undefined',
      correctedOddsRatio: (counts.both + 0.5) * (counts.neither + 0.5) /
        ((counts.aOnly + 0.5) * (counts.bOnly + 0.5)) };
  }
  function domainIds(gene) {
    return (gene.domains || []).filter(domain => !domain?.marker)
      .map(domain => clean(typeof domain === 'object' ? domain.id ?? domain.name ?? domain.rawName : domain))
      .filter(id => id && id !== '?');
  }
  function contextTemplates(observation, domain, otherDomain, options) {
    const genes = observation.genes || [];
    if (!genes.some(gene => gene.query)) return [];
    const mask = new Set([domain, otherDomain]);
    const architectures = genes.map(gene => domainIds(gene));
    const residuals = architectures.map(ids => ids.filter(id => !mask.has(id)));
    const known = genes.map((gene, index) => gene.known !== false && architectures[index].length > 0);
    // A masked annotated gene and an unannotated gene must remain distinguishable.
    const tokens = genes.map((gene, index) => [gene.strand, Boolean(gene.query),
      known[index] ? ['annotated', architectures[index].map(id => mask.has(id) ? ['candidate'] : ['domain', id])] : ['unannotated']]);
    const remainder = JSON.stringify(tokens);
    const records = [];
    for (let i = 0; i < genes.length; i += 1) {
      const gene = genes[i];
      if ((options.excludeQuery && gene.query) || !architectures[i].includes(domain) || !Number.isFinite(gene.relativePosition)) continue;
      const neighbors = [i - 1, i + 1].filter(index => index >= 0 && index < genes.length);
      if (!neighbors.length || neighbors.some(index => !known[index]) || !neighbors.some(index => residuals[index].length)) continue;
      const left = i > 0 ? tokens[i - 1] : ['<boundary>'];
      const right = i + 1 < genes.length ? tokens[i + 1] : ['<boundary>'];
      const flankKey = JSON.stringify([gene.relativePosition, gene.strand, left, right]);
      const exactKey = JSON.stringify([flankKey, remainder]);
      records.push({ flankKey, exactKey, observationId: observation.id,
        relativePosition: gene.relativePosition, residual: residuals[i],
        kind: residuals[i].length ? 'domain-architecture' : 'carrier-gene' });
    }
    return records;
  }
  function addTemplate(map, key, record) {
    if (!map.has(key)) map.set(key, { ids: new Set(), positions: new Set(), kind: record.kind, residual: record.residual });
    const item = map.get(key);
    item.ids.add(record.observationId);
    item.positions.add(record.relativePosition);
  }
  function matchContexts(observations, sets, candidate, options) {
    const leftExact = new Map(), rightExact = new Map(), leftFlanks = new Map(), rightFlanks = new Map();
    const exceptionIds = [];
    for (let i = 0; i < observations.length; i += 1) {
      const a = sets[i].has(candidate.domainA), b = sets[i].has(candidate.domainB);
      if (a && b) { exceptionIds.push(observations[i].id); continue; }
      if (a === b) continue;
      const exact = a ? leftExact : rightExact, flanks = a ? leftFlanks : rightFlanks;
      for (const record of contextTemplates(observations[i], a ? candidate.domainA : candidate.domainB,
        a ? candidate.domainB : candidate.domainA, options)) {
        addTemplate(exact, record.exactKey, record);
        addTemplate(flanks, record.flankKey, record);
      }
    }
    const supportA = new Set(), supportB = new Set(), flankA = new Set(), flankB = new Set();
    const contexts = [];
    let contextMatches = 0, geneAlternativeMatches = 0, domainArchitectureMatches = 0, sharedFlankMatches = 0;
    for (const [key, a] of leftExact) {
      const b = rightExact.get(key);
      if (!b) continue;
      contextMatches += 1;
      if (a.kind === 'domain-architecture') domainArchitectureMatches += 1; else geneAlternativeMatches += 1;
      for (const id of a.ids) supportA.add(id);
      for (const id of b.ids) supportB.add(id);
      if (contexts.length < 12) contexts.push({ kind: a.kind, relativePositions: [...a.positions].sort((x, y) => x - y),
        sharedArchitecture: a.residual, supportA: a.ids.size, supportB: b.ids.size,
        observationIdsA: [...a.ids].slice(0, 8), observationIdsB: [...b.ids].slice(0, 8),
        observationIdsATruncated: a.ids.size > 8, observationIdsBTruncated: b.ids.size > 8 });
    }
    for (const [key, a] of leftFlanks) {
      const b = rightFlanks.get(key);
      if (!b) continue;
      sharedFlankMatches += 1;
      for (const id of a.ids) flankA.add(id);
      for (const id of b.ids) flankB.add(id);
    }
    const examples = [...new Set([...supportA, ...supportB])];
    return { contextMatches, exactContextMatches: contextMatches, contextSupportA: supportA.size,
      contextSupportB: supportB.size, geneAlternativeMatches, domainArchitectureMatches,
      sharedFlankMatches, sharedFlankSupportA: flankA.size, sharedFlankSupportB: flankB.size,
      contexts, contextExamplesTruncated: contextMatches > contexts.length,
      contextObservationIndicesA: observations.flatMap((observation, index) => supportA.has(observation.id) ? [index] : []),
      contextObservationIndicesB: observations.flatMap((observation, index) => supportB.has(observation.id) ? [index] : []),
      exampleObservationIds: examples.slice(0, 24), exampleObservationIdsTruncated: examples.length > 24,
      cooccurringExceptionIds: exceptionIds.slice(0, 24), cooccurringExceptionsTruncated: exceptionIds.length > 24,
      directionUnknown: true };
  }
  function prepareStrata(observations, sets, field) {
    const groups = new Map();
    const membership = [];
    if (!field) return { groups: [], membership };
    observations.forEach((observation, index) => {
      const value = metadataValue(observation, field), key = JSON.stringify([Boolean(value), value]);
      if (!groups.has(key)) groups.set(key, { value, label: value || '[Missing metadata]', missing: !value,
        observationCount: 0, domainCounts: new Map(), index: groups.size });
      const group = groups.get(key);
      group.observationCount += 1;
      membership[index] = group.index;
      for (const domain of sets[index]) group.domainCounts.set(domain, (group.domainCounts.get(domain) || 0) + 1);
    });
    return { groups: [...groups.values()], membership };
  }
  function breakdown(strata, candidate, postings) {
    if (!strata.groups.length) return [];
    const bothCounts = Array(strata.groups.length).fill(0);
    const left = postings.get(candidate.domainA), right = postings.get(candidate.domainB);
    let a = 0, b = 0;
    while (a < left.length && b < right.length) {
      if (left[a] === right[b]) { bothCounts[strata.membership[left[a]]] += 1; a += 1; b += 1; }
      else if (left[a] < right[b]) a += 1; else b += 1;
    }
    return strata.groups.map(group => {
      const counts = contingency(group.domainCounts.get(candidate.domainA) || 0,
        group.domainCounts.get(candidate.domainB) || 0, bothCounts[group.index], group.observationCount);
      return { value: group.value, label: group.label, missing: group.missing,
        observationCount: group.observationCount, counts, ...effect(counts, group.observationCount) };
    })
      .sort((a, b) => b.observationCount - a.observationCount || compareText(a.label, b.label));
  }
  function exceptionExamples(observations, candidate, postings) {
    const left = postings.get(candidate.domainA), right = postings.get(candidate.domainB), ids = [];
    let a = 0, b = 0;
    while (a < left.length && b < right.length && ids.length < 24) {
      if (left[a] === right[b]) { ids.push(observations[left[a]].id); a += 1; b += 1; }
      else if (left[a] < right[b]) a += 1; else b += 1;
    }
    return { cooccurringExceptionIds: ids, cooccurringExceptionsTruncated: candidate.counts.both > ids.length };
  }
  function abortIfRequested(hooks) {
    if (hooks?.isCancelled?.()) { const error = new Error('Neighborhood analysis cancelled.'); error.name = 'AbortError'; throw error; }
  }
  async function checkpoint(hooks, completed, total, phase) {
    abortIfRequested(hooks);
    hooks?.onProgress?.({ phase: phase || 'alternatives', completed, total });
    if (hooks?.yieldControl) await hooks.yieldControl();
    else if (typeof setTimeout === 'function') await new Promise(resolve => setTimeout(resolve, 0));
    abortIfRequested(hooks);
  }

  async function analyze(input, options = {}, hooks = {}) {
    if (!Array.isArray(input)) throw new Error('Alternatives analysis requires prepared neighborhood observations.');
    const params = parameters(options);
    abortIfRequested(hooks);
    const observations = params.stratumValue
      ? input.filter(observation => metadataValue(observation, params.stratumField) === params.stratumValue) : input.slice();
    const ids = new Set();
    for (const observation of observations) {
      if (!clean(observation.id) || ids.has(observation.id)) throw new Error('Prepared observations must have unique, non-empty IDs.');
      ids.add(observation.id);
    }
    const sets = observations.map(presence), postings = new Map(), warnings = [];
    sets.forEach((set, index) => { for (const domain of set) {
      if (!postings.has(domain)) postings.set(domain, []);
      postings.get(domain).push(index);
    } });
    const domains = [...postings].filter(([, members]) => members.length >= params.minSupport)
      .sort((a, b) => b[1].length - a[1].length || compareText(a[0], b[0]));
    const n = observations.length;
    let testedPairCount = 0;
    const limits = [];
    for (let i = 0; i < domains.length; i += 1) {
      let left = i + 1, right = domains.length;
      while (left < right) {
        const middle = Math.floor((left + right) / 2);
        if (domains[i][1].length * domains[middle][1].length / n >= params.minExpected) left = middle + 1;
        else right = middle;
      }
      limits.push(left);
      testedPairCount += Math.max(0, left - i - 1);
    }
    if (testedPairCount > params.maxPairs) {
      const error = new Error(`Alternatives would test ${testedPairCount.toLocaleString('en-US')} domain pairs, above the ${params.maxPairs.toLocaleString('en-US')} pair budget. Increase minimum support or expected coexistence, or select a smaller cohort. No pairs were silently omitted and no partial FDR was calculated.`);
      error.code = 'ALTERNATIVES_PAIR_BUDGET'; error.testedPairCount = testedPairCount; error.maxPairs = params.maxPairs;
      throw error;
    }
    const tables = [];
    let completed = 0;
    await checkpoint(hooks, 0, testedPairCount);
    for (let i = 0; i < domains.length; i += 1) {
      for (let j = i + 1; j < limits[i]; j += 1) {
        const left = domains[i], right = domains[j], both = countIntersection(left[1], right[1]);
        let domainA = left[0], domainB = right[0], supportA = left[1].length, supportB = right[1].length;
        if (compareText(domainA, domainB) > 0) { [domainA, domainB] = [domainB, domainA]; [supportA, supportB] = [supportB, supportA]; }
        const counts = contingency(supportA, supportB, both, n);
        const fisher = fisherDetails(counts.both, counts.aOnly, counts.bOnly, counts.neither);
        tables.push({ domainA, domainB, counts, ...effect(counts, n), fisherP: fisher.p, fisherLogP: fisher.logP });
        completed += 1;
        if (completed % 256 === 0) await checkpoint(hooks, completed, testedPairCount);
      }
    }
    const qValues = adjustBH(tables.map(table => table.fisherP));
    tables.forEach((table, index) => { table.q = qValues[index]; });
    const screened = tables.filter(table => table.counts.both < table.expectedBoth &&
      table.bothRate <= params.maxBothRate && table.q <= params.maxQ)
      .sort((a, b) => a.q - b.q || a.fisherLogP - b.fisherLogP || a.observedExpected - b.observedExpected ||
        Math.min(b.supportA, b.supportB) - Math.min(a.supportA, a.supportB) ||
        compareText(a.domainA, b.domainA) || compareText(a.domainB, b.domainB));
    const strata = prepareStrata(observations, sets, params.stratumField);
    if (strata.groups.length * screened.length > params.maxStratumCells) {
      const error = new Error(`Metadata breakdown would contain ${strata.groups.length.toLocaleString('en-US')} strata for ${screened.length.toLocaleString('en-US')} candidates, above the ${params.maxStratumCells.toLocaleString('en-US')} row budget. Choose a broader metadata field, select a cohort, or tighten candidate thresholds. No strata were silently omitted.`);
      error.code = 'ALTERNATIVES_STRATA_BUDGET';
      throw error;
    }
    const selected = screened.slice(0, params.maxContextCandidates);
    const candidates = [];
    for (let i = 0; i < selected.length; i += 1) {
      const candidate = selected[i];
      candidates.push({ ...candidate, contextStatus: 'assessed', ...matchContexts(observations, sets, candidate, params),
        strata: breakdown(strata, candidate, postings) });
      if (i % 8 === 0) await checkpoint(hooks, i + 1, selected.length, 'alternative-contexts');
    }
    for (let i = selected.length; i < screened.length; i += 1) {
      candidates.push({ ...screened[i], contextStatus: 'not-assessed-limit', contextMatches: null, exactContextMatches: null,
        contextSupportA: null, contextSupportB: null, geneAlternativeMatches: null,
        domainArchitectureMatches: null, sharedFlankMatches: null, sharedFlankSupportA: null,
        sharedFlankSupportB: null, contexts: [], exampleObservationIds: [],
        contextObservationIndicesA: null, contextObservationIndicesB: null,
        ...exceptionExamples(observations, screened[i], postings), directionUnknown: true,
        strata: breakdown(strata, screened[i], postings) });
      if (i % 256 === 0) await checkpoint(hooks, i + 1, screened.length, 'alternative-details');
    }
    const unknownObservations = observations.filter(observation => (observation.genes || []).some(gene => gene.known === false || !domainIds(gene).length)).length;
    warnings.push('Exploratory depletion among annotations, not proof of functional equivalence or evolutionary replacement. The direction of a change is unknown.');
    warnings.push('Fisher tests assume independent observations. Related genomes, repeated strains, and shared ancestry can inflate support; locus deduplication does not correct phylogenetic dependence.');
    warnings.push('Not detected means absent from the loaded annotations, not demonstrated biological absence. Annotation completeness and neighborhood boundaries affect these results.');
    if (unknownObservations) warnings.push(`${unknownObservations} analyzed neighborhoods contain unannotated genes. Such genes remain in the order and cannot establish absence of a candidate domain.`);
    if (params.stratumField) warnings.push('Metadata strata are descriptive breakdowns; no phylogenetic correction or combined stratified significance test has been applied.');
    if (params.stratumField === 'groupId') warnings.push('Similarity groups can depend on the candidate domains themselves. Group-based cohort selection is exploratory and can introduce circular selection.');
    if (!testedPairCount) warnings.push('No domain pairs pass the minimum support and expected-coexistence thresholds. Lower those thresholds or analyze more neighborhoods.');
    if (screened.length > selected.length) warnings.push(`Context evidence was assessed for the top ${selected.length} of ${screened.length} screened candidates, ranked by adjusted P value, then depletion. Every candidate's statistics are retained, and FDR uses all ${testedPairCount} tested pairs. Other candidates are marked not assessed; increase maxContextCandidates to assess more contexts.`);
    await checkpoint(hooks, testedPairCount, testedPairCount, 'alternatives-complete');
    return { version: VERSION, parameters: params, observationCount: n, observationIds: observations.map(observation => observation.id),
      eligibleDomainCount: domains.length, testedPairCount, candidateCount: screened.length,
      returnedCandidateCount: candidates.length, contextAssessedCount: selected.length,
      contextAssessmentLimit: params.maxContextCandidates, contextLimited: screened.length > selected.length,
      unknownObservationCount: unknownObservations,
      fdrMethod: 'Benjamini-Hochberg across every support/expected-eligible domain pair before candidate screening',
      test: 'one-sided Fisher exact test for depletion', coexistenceDefinition: 'both / min(supportA, supportB)',
      contextDefinition: 'Same query-relative gene offset, strand, flanks, and ordered neighborhood after masking both candidate identities with anonymous domain slots. N-to-C domain positions remain distinct; unannotated flanks do not count as matching evidence.',
      candidates, warnings };
  }

  return Object.freeze({ VERSION, DEFAULTS, analyze, fisherDepletion, fisherDetails, adjustBH });
});
