/**
 * Hosted-file configuration for the Protein Region Viewer — FIGURE 1 page.
 *
 * This is a "supplementary material" style page: the file-loading buttons
 * are hidden (see /figure1/index.html), so autoLoad MUST be true and
 * pdbUrl/yamlUrl MUST point to real files, or the viewer will show an
 * empty/error state with no way for the reader to load anything manually.
 *
 * paperTitle / figureTitle are shown above the viewer. Leave either one as
 * an empty string to hide just that line; leave both empty to hide the
 * whole title block.
 *
 * msaUrl is optional: point it at an aligned FASTA file (.fasta/.aln) to
 * show the MSA panel. Chains are only linked to the alignment if referenced
 * under msa.references in the YAML annotation — see annotations/README.md.
 * Leave msaUrl empty ('') if this figure has no alignment.
 */
window.PROTEIN_REGION_VIEWER_CONFIG = {
  title: 'Figure 1 viewer',

  paperTitle: 'Author et al., 2026, Journal Name',
  figureTitle: 'Figure 1 — Domain architecture of MYC',

  autoLoad: true,
  pdbUrl: './pdb/figure1-structure.pdb',
  yamlUrl: './annotations/figure1-regions.yaml',
  msaUrl: '',

  // canvas | sequence | controls | sequence-controls | full
  defaultLayout: 'canvas'
};
