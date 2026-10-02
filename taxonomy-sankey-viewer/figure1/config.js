/**
 * Taxonomy Flow Viewer configuration — publication figure.
 *
 * The publication page uses a frozen resolved-taxonomy TSV and the curation
 * YAML produced by the Taxonomy Sankey Editor. No external taxonomy service is
 * queried by the published figure.
 */
window.TAXONOMY_SANKEY_CONFIG = {
  title: 'Taxonomy Flow Viewer',
  subtitle: 'Interactive taxonomic Sankey',

  paperTitle: '',
  figureTitle: 'Taxonomic distribution of the protein set',

  autoLoad: true,
  inputUrl: './data/taxonomy-input.tsv',
  resolvedUrl: './data/taxonomy-resolved.tsv',
  yamlUrl: './data/taxonomy-sankey.yaml',
  colorUrl: './data/taxonomy-colors.yaml',

  pidColumn: 'pid',
  taxidColumn: 'taxid',
  classificationColumn: 'classification',

  maxFileBytes: 64 * 1024 * 1024,
  maxRows: 250000,
  showDownloads: true
};
