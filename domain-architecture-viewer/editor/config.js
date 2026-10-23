/**
 * EvoSupplement Protein Domain Architecture Editor example.
 */
window.DOMAIN_ARCHITECTURE_CONFIG = {
  title: 'Protein Domain Architecture Editor',
  subtitle: 'Author workspace for names, styles, metadata, and architecture layouts',
  paperTitle: '',
  figureTitle: '',
  authoring: true,
  autoLoad: true,
  dataUrl: './data/domain.tsv',
  yamlUrl: './data/domain-architecture.yaml',
  renameUrl: '', // Optional flat mapping from original domain IDs to display names.
  colorUrl: '', // Optional flat color YAML keyed by final display name.
  shapeUrl: '', // Optional flat shape YAML keyed by final display name.
  fitOnLoad: true,
  defaults: {
    mode: 'true',
    row_height: 44,
    label_template: '{pid}',
    subtitle_template: '',
    sort_primary: 'original',
    group_by: ''
  },
  maxFileBytes: 67108864,
  maxRows: 500000,
  showDownloads: true
};
