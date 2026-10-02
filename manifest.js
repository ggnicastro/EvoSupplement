/**
 * Example publication manifest.
 *
 * The EvoSupplement Studio home page does not load this file. Generated
 * publication projects receive their own manifest.js and a separate portal
 * index.html from EvoSupplement Builder. This example remains available for
 * testing and for authors who maintain a publication project manually.
 *
 * ---------------------------------------------------------------------
 * PAPER INFO
 * ---------------------------------------------------------------------
 * title, authors, description, journal, year, doi: shown at the top of the page.
 * Leave any of them as '' to hide that line. doi should be just the DOI
 * string (e.g. "10.1234/abcd.2026"), not a full URL — the link is built
 * automatically as https://doi.org/<doi>.
 *
 * ---------------------------------------------------------------------
 * SECTIONS
 * ---------------------------------------------------------------------
 * `sections` is a list of groups, each with a `title` (shown as a heading,
 * e.g. "Figures", "Tables", "Data availability") and a list of `items`.
 * Add/remove/reorder sections freely; add as many as you need.
 *
 * ---------------------------------------------------------------------
 * ITEM FIELDS
 * ---------------------------------------------------------------------
 * id          Optional short unique string. Not shown, just for your own
 *             reference/search. Not required.
 * title       Shown in bold, e.g. "Figure S1".
 * description Optional one-line summary shown under the title.
 * type        Controls the small colored badge. One of:
 *               'viewer'   — links to a protein, neighborhood, phylogeny, or network viewer page
 *               'pdf'      — a PDF document
 *               'image'    — a static image (PNG/JPG/SVG)
 *               'table'    — a table (HTML, CSV, or PDF of a table)
 *               'dataset'  — raw data (spreadsheet, archive, repository)
 *               'doc'      — any other document/text
 *               'external' — a link that leaves this site (e.g. Zenodo, GitHub)
 *             Unrecognized values fall back to a plain gray badge — the
 *             page will not break, so it's safe to invent a new type name.
 * href        Relative path (e.g. './protein-viewer/figure1/') or full URL
 *             (e.g. 'https://zenodo.org/...'). Leave as '' (empty string)
 *             if the item isn't ready yet — it will show as
 *             "Coming soon" and will not be clickable.
 * external    Optional. Set to true to force opening the link in a new
 *             browser tab (this happens automatically for any href that
 *             starts with "http", so you usually don't need to set this
 *             for type: 'external').
 */
window.SUPPLEMENTARY_MANIFEST = {
  paper: {
    title: 'Supplementary Material',
    authors: 'Author A, Author B, Author C',
    description: '', // optional short paragraph below the citation
    journal: 'Journal Name',
    year: '2026',
    doi: '' // e.g. '10.1234/abcd.2026' — leave '' to hide the DOI line
  },

  sections: [
    {
      title: 'Figures',
      items: [
        {
          id: 'fig-s1',
          title: 'Figure S1',
          description: 'Domain architecture and conserved regions, colored by AlphaFold confidence.',
          type: 'viewer',
          href: './protein-viewer/figure1/'
        },
        {
          id: 'fig-s2',
          title: 'Figure S2',
          description: 'Structural alignment across homologs with linked MSA.',
          type: 'viewer',
          href: '' // not published yet — renders as "Coming soon"
        },
        {
          id: 'fig-s3',
          title: 'Figure S3',
          description: 'Phylogenetic tree with annotation-driven coloring, hover details, and non-destructive filtering.',
          type: 'viewer',
          href: './phylogeny-viewer/figure1/'
        },
        {
          id: 'fig-s4',
          title: 'Figure S4',
          description: 'Genomic neighborhoods of MoxR-AAA-containing loci.',
          type: 'viewer',
          href: './neighborhood-viewer/figure1/'
        },
        {
          id: 'fig-s5',
          title: 'Figure S5',
          description: 'Interactive undirected domain-association network with YAML scope, summed edge-count filtering, alternative layouts, and Louvain/Leiden community detection.',
          type: 'viewer',
          href: './network-viewer/figure1/'
        }
      ]
    },
    {
      title: 'Tables',
      items: [
        {
          id: 'table-s1',
          title: 'Table S1',
          description: 'List of constructs and mutations used in this study.',
          type: 'table',
          href: './tables/table-s1.pdf'
        }
      ]
    },
    {
      title: 'Data availability',
      items: [
        {
          id: 'data-s1',
          title: 'Data S1',
          description: 'Raw sequencing data and processed counts.',
          type: 'dataset',
          href: 'https://zenodo.org/record/XXXXXXX'
        },
        {
          id: 'code',
          title: 'Analysis code',
          description: 'Scripts used to generate all figures in this paper.',
          type: 'external',
          href: 'https://github.com/your-org/your-repo'
        }
      ]
    }
  ]
};
