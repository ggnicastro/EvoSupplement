/**
 * EvoSupplement Protein Domain Architecture Editor example.
 */
window.DOMAIN_ARCHITECTURE_CONFIG = {
  title: 'Protein Domain Architecture Editor',
  subtitle: 'Author workspace for colors, shapes, metadata, and compact architecture layouts',
  paperTitle: '',
  figureTitle: '',
  authoring: true,
  autoLoad: true,
  dataUrl: './data/domain.tsv',
  yamlUrl: './data/domain-architecture.yaml',
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
