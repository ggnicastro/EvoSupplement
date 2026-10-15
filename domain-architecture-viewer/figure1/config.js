/**
 * EvoSupplement Protein Domain Architecture Viewer publication example.
 */
window.DOMAIN_ARCHITECTURE_CONFIG = {
  title: 'Protein Domain Architecture Viewer',
  subtitle: 'Interactive comparison of protein domain architectures',
  paperTitle: 'Example interactive supplementary material',
  figureTitle: 'Figure S6 — RDD-Arc2 domain architectures',
  authoring: false,
  autoLoad: true,
  dataUrl: './data/domain.tsv',
  yamlUrl: './data/domain-architecture.yaml',
  colorUrl: '', // Optional flat color YAML keyed by final display name.
  shapeUrl: '', // Optional flat shape YAML keyed by final display name.
  fitOnLoad: true,
  maxFileBytes: 67108864,
  maxRows: 500000,
  showDownloads: true
};
