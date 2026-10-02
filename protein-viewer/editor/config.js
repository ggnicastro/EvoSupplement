/**
 * Hosted-file configuration for the Protein Structure and MSA Editor.
 *
 * The editor can start from only a structure. yamlUrl and msaUrl are optional:
 * - with yamlUrl, the existing protein-viewer YAML is loaded into the editor;
 * - without yamlUrl, the structure opens with an empty annotation list and a
 *   visible base representation, ready for Mol* residue selection;
 * - with msaUrl, the aligned FASTA opens below the structure and the editor can
 *   rank candidate reference rows for each observed structure chain.
 *
 * Local files can always be selected in the page. Nothing is uploaded.
 */
window.PROTEIN_REGION_VIEWER_CONFIG = {
  title: 'Protein Structure and MSA Editor',
  subtitle: 'Load PDB/mmCIF with optional YAML and MSA, create annotations from Mol* selections, and export publication-ready YAML',

  paperTitle: '',
  figureTitle: '',

  editorMode: true,
  autoLoad: true,
  pdbUrl: './pdb/TelC-prok.pdb',
  yamlUrl: './annotations/demo-regions.yaml',
  msaUrl: './annotations/TelC-prok.fa',

  // canvas | sequence | controls | sequence-controls | full
  defaultLayout: 'canvas'
};
