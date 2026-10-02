/**
 * Gene Neighborhood Viewer configuration.
 *
 * All paths are relative to index.html. The viewer reads the original neighborhood input
 * directly and applies the rename/color dictionaries in the browser.
 */
window.NEIGHBORHOOD_VIEWER_CONFIG = {
  title: 'Gene Neighborhood Viewer',
  paperTitle: '',
  figureTitle: 'Genomic neighborhoods',

  // 'auto' recognizes the canonical TSV or the compact architecture format.
  inputFormat: 'auto',

  dataUrl: './data/te.tsv',
  colorUrl: './data/color_dic.yaml',
  renameUrl: './data/domain_rename.yaml',

  includePlaceholder: 'Include by domain, PFAM, organism, taxonomy, PID…',
  excludePlaceholder: 'Exclude by the same syntax…',

  // "fixed" (default): regular domain blocks keep fixed screen widths and
  // each row starts at the left edge; the track can extend horizontally.
  // "fit": each genomic neighborhood fills the available window.
  defaultScaleMode: 'fixed',

  // Optional query alignment is independent of the sizing mode. When false,
  // every row begins near the left label.
  defaultAlignQuery: false,
  defaultFlipNegativeQueries: true,
  defaultShowLabels: true,
  defaultZoom: 1,

  // Used only by the fixed-domain-width layout. Every regular domain gets the
  // same width at 100% zoom, so all MoxR-AAA blocks (and all other repeated
  // domains) are exactly identical in width. Optional name-specific overrides
  // can be added to fixedDomainWidths.
  fixedDomainWidth: 64,
  fixedDomainWidths: {
    // 'MoxR-AAA': 72
  },
  fixedGeneGap: 10,
  fixedMarkerOnlyGeneWidth: 34,

  // Domains absent from color_dic.yaml remain neutral instead of receiving
  // an arbitrary color.
  unknownDomainColor: '#d7dce2',

  // Visual markers that are not treated as full domain blocks.
  // - TM: a minimal yellow bar, kept in domp order.
  // - SIG/SIF: a red bar forced to the beginning (tail) of the gene arrow.
  // Marker names are matched case-insensitively against both raw and renamed
  // domain names. Width is in screen pixels and does not grow with zoom.
  markerDomains: {
    TM:  { width: 4, color: '#f4cf3a', position: 'ordered' },
    SIG: { width: 5, color: '#d62828', position: 'start' },
    SIF: { width: 5, color: '#d62828', position: 'start' }
  },

  // Neutral gene body visible when a gene contains only marker annotations.
  geneBackgroundColor: '#f4f6f8',

  // Browser-side safety limit for the TSV and the two dictionaries.
  maxDataBytes: 64 * 1024 * 1024
};
