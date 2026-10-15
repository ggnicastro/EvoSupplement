/* Editor-only worker. Cancelling a run terminates this worker in analysis.js. */
'use strict';
importScripts('analysis-core.js?v=1.0.0', 'analysis-alternatives.js?v=1.0.0');
self.onmessage = async function (event) {
  const message = event.data || {};
  if (message.type !== 'analyze') return;
  const requestId = message.requestId;
  const onProgress = update => self.postMessage({ type: 'progress', requestId, ...update });
  try {
    const result = await NeighborhoodAnalysisCore.analyze(message.snapshot, message.options, { onProgress, yield: false });
    if (result.options.alternatives.enabled !== false) {
      result.alternatives = await NeighborhoodAlternatives.analyze(result.observations, result.options.alternatives, { onProgress, yield: false });
      result.options.alternatives = { ...result.alternatives.parameters, enabled: true };
      if (Array.isArray(result.alternatives.warnings)) result.warnings.push(...result.alternatives.warnings);
    } else result.alternatives = { candidates: [], warnings: [], parameters: result.options.alternatives, disabled: true, testedPairCount: 0 };
    self.postMessage({ type: 'result', requestId, result });
  } catch (error) {
    self.postMessage({ type: 'error', requestId, error: { code: error && error.code || 'ANALYSIS_ERROR', message: error && error.message || String(error) } });
  }
};
