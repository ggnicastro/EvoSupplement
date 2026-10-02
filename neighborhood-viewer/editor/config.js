/**
 * Gene Neighborhood Viewer configuration — EDITOR page.
 *
 * manualLoad: true means the viewer waits for files selected in index.html.
 * Only the neighborhood input is required. Rename and color YAML dictionaries
 * are optional and can be created or revised in the Domain curation panel.
 *
 * Publication figure pages leave manualLoad false and load hosted files from
 * their own data/ directories.
 */
window.NEIGHBORHOOD_VIEWER_CONFIG = {
  title: 'Gene Neighborhood Editor',
  paperTitle: '',
  figureTitle: '',

  manualLoad: true,
  // 'auto' recognizes the canonical TSV or the compact architecture format.
  inputFormat: 'auto',

  dataUrl: '',
  colorUrl: '',
  renameUrl: '',

  includePlaceholder: 'Include by domain, PFAM, organism, taxonomy, PID…',
  excludePlaceholder: 'Exclude by the same syntax…',

  defaultScaleMode: 'fixed',
  defaultAlignQuery: false,
  defaultFlipNegativeQueries: true,
  defaultShowLabels: true,
  defaultZoom: 1,

  fixedDomainWidth: 64,
  fixedDomainWidths: {},
  fixedGeneGap: 10,
  fixedMarkerOnlyGeneWidth: 34,

  unknownDomainColor: '#d7dce2',

  markerDomains: {
    TM:  { width: 4, color: '#f4cf3a', position: 'ordered' },
    SIG: { width: 5, color: '#d62828', position: 'start' },
    SIF: { width: 5, color: '#d62828', position: 'start' }
  },

  geneBackgroundColor: '#f4f6f8',
  maxDataBytes: 64 * 1024 * 1024
};
