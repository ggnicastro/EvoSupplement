/**
 * Taxonomy Sankey Editor configuration.
 *
 * The bundled example opens with a classification-derived frozen snapshot.
 * Authors can load only a pid/taxid/classification TSV, reconcile its TaxIDs
 * online with NCBI Datasets or from a local snapshot, curate the displayed
 * hierarchy, and export publication files.
 */
window.TAXONOMY_SANKEY_CONFIG = {
  title: 'Taxonomy Sankey Editor',
  subtitle: 'Resolve, compress, curate, and export taxonomic flows',

  paperTitle: '',
  figureTitle: 'Taxonomy Sankey editor',

  autoLoad: true,
  inputUrl: './data/taxonomy.tsv',
  resolvedUrl: './data/taxonomy-resolved.tsv',
  yamlUrl: './data/taxonomy-sankey.yaml',
  colorUrl: './data/taxonomy-colors.yaml',

  pidColumn: 'pid',
  taxidColumn: 'taxid',
  classificationColumn: 'classification',

  maxFileBytes: 256 * 1024 * 1024,
  maxRows: 250000,
  showDownloads: false
};
