# EvoSupplement Builder

EvoSupplement Builder is a browser-based project generator for creating publication-ready supplementary websites from guided forms and module-specific publication inputs.

Open `builder/` through an HTTP server, enter the paper metadata, create sections and items, attach the required files, validate the project, and download a ZIP ready for GitHub Pages.

## Studio page versus generated portal

The source repository opens as **EvoSupplement Studio**. That page links to the Project Builder and module editors and is not copied into paper projects.

The Builder uses its own internal template at:

```text
builder/templates/publication-portal.html
```

Every generated ZIP receives that template as its root `index.html` together with a generated `manifest.js`. Readers therefore open directly to the paper-specific publication portal, not the Studio authoring dashboard.

## Supported item types

- uploaded files;
- self-contained HTML pages;
- ZIP-packaged HTML pages with an `index.html` entry point;
- external links;
- coming-soon placeholders;
- Protein Structure and MSA Viewer figures;
- Gene Neighborhood Viewer figures from canonical TSV or compact architecture inputs;
- Phylogeny Viewer figures;
- Network Viewer figures;
- Taxonomy Flow Viewer figures generated from a frozen resolved-taxonomy TSV and curation YAML;
- Protein Domain Architecture Viewer figures generated from a one-row-per-domain TSV and architecture YAML.
- Multi-Structure Comparison Viewer figures generated from the publication package ZIP exported by its editor.

The generated ZIP includes only the shared viewer modules actually used by the project. Builder 1.6.2 includes all seven interactive modules, including the Taxonomy Sankey Viewer 1.4.1 and Multi-Structure Comparison Viewer 1.0.0.

## Editors and publication figures

The source EvoSupplement repository uses `shared/`, `editor/`, and `figureN/` consistently in every viewer module.

Editors are author workspaces for local loading, validation, curation, and derived-file generation. For protein figures, the Protein Structure and MSA Editor can start from a structure alone, create a compatible annotation YAML from Mol* residue selections, and help assign structure chains to aligned FASTA references. The Builder expects the finalized YAML when it packages a reader-facing protein figure.

For taxonomy figures, the Taxonomy Sankey Editor resolves or imports lineages, assigns every selected canonical rank to a fixed column, lets authors name missing-rank display spacers or move curated nodes between display columns, and exports `taxonomy-resolved.tsv` plus `taxonomy-sankey.yaml`. The Builder packages those frozen files so the reader-facing figure never depends on a live taxonomy service.

For phylogeny figures, the Phylogeny Editor exports `phylogeny.yaml`, which stores the selected layout, visual root, marked supports, clade groups, colors, and label rules. The Builder requires the Newick tree and this YAML; the tip-annotation table is optional.

For domain-architecture figures, the Protein Domain Architecture Editor exports `domain-architecture.yaml`, which stores true-length, normalized, or compact layout settings together with domain names, colors, shapes, labels, sorting, grouping, and hover fields. The Builder requires the domain TSV and this YAML.

For multi-structure figures, the Multi-Structure Comparison Editor exports a ZIP containing `multi-structure.json`, the ordered MOLX snapshots, optional PDB/mmCIF downloads, and the preserved MVT license. The Builder reads that package, fixes the publication panel count, and installs its contents under the figure data folder.

Builder-generated projects copy the compatible shared implementation and a clean publication figure template. Author-editor controls are not added to reader-facing figures.

## Generated files

A generated project contains:

- the publication portal `index.html` and generated `manifest.js`;
- uploaded scientific files and viewer inputs;
- shared JavaScript and CSS for used modules;
- one publication folder per interactive item;
- `README.md`, `DEPLOYMENT.md`, `CITATION.cff`, and an optional MIT license;
- `.nojekyll` and a GitHub Pages workflow;
- `evosupplement-project.json`, which allows the generated ZIP to be reopened in the Builder.

## Run locally

From the source repository root:

```bash
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000/builder/
```

Do not open the Builder directly through `file://`; browsers may block access to bundled templates and viewer assets.

## Privacy

Selected files remain in the browser session. ZIP assembly and validation run locally in the browser. The Builder does not require a server-side upload endpoint.

## Bundled dependency

The Builder bundles JSZip for reading and creating ZIP archives. Its license is included under `builder/vendor/JSZIP-LICENSE.md`.
