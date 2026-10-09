# EvoSupplement Builder

EvoSupplement Builder is a browser-based project generator for creating publication-ready supplementary websites from guided forms and module-specific publication inputs.

Open `builder/` through an HTTP server, enter the paper metadata, create sections and items, attach the required files, validate the project, and download a ZIP ready for GitHub Pages.

## Save and restore Builder state

**Save state** downloads an editable snapshot named `<repository>-builder-state-<timestamp>.zip`. It preserves the paper metadata, authors, section and item order, item settings, and attached files, even when the draft is incomplete or has publication-validation errors. Saving a state does not run publication validation or fetch templates or viewer assets.

To continue after changing or updating the Builder:

1. Click **Save state** before closing the current Builder or installing an update.
2. Open the updated Builder through HTTP.
3. Click **Load state** and select the saved state ZIP.
4. Continue editing with the draft and attached files restored; there is no need to select each input again.

The snapshot retains the original attachment bytes, including uploaded HTML ZIPs and Multi-Structure Comparison publication-package ZIPs. It stores the Builder project and its attachments, not a copy of the Builder implementation or unsaved work in separate module-editor tabs. When you generate a publication later, the currently running Builder supplies its templates and viewer code.

| Action | ZIP purpose | Incomplete drafts |
|---|---|---|
| **Save state** / **Load state** | Back up and resume editable Builder work, including its attached files. | Supported. |
| **Download project ZIP** / **Open project ZIP** | Generate and reopen a publication site with `evosupplement-project.json`. | Publication validation must pass before generation. |

State ZIPs contain an `evosupplement-builder-state.json` manifest using state schema **1**, separate from the publication recipe. The schema is versioned independently of the Builder so compatible Builder versions can restore the same snapshot. Missing supported optional settings receive the current defaults. Unsupported future schemas are rejected rather than silently converted; compatibility with every future Builder version is not guaranteed.

There is no automatic saving. Save another state ZIP after making changes and keep it until you have verified restoration in the updated Builder.

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

The generated ZIP includes only the shared viewer modules actually used by the project. Builder 1.7.0 includes all seven interactive modules, including the Taxonomy Sankey Viewer 1.4.1 and Multi-Structure Comparison Viewer 1.0.0.

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

Selected files are processed in the browser session. Saving a state or generating a publication ZIP downloads a copy to your device. ZIP assembly and validation run locally in the browser. The Builder does not require a server-side upload endpoint. Saved state ZIPs include the attached files, so handle them with the same care as the source material.

## Bundled dependency

The Builder bundles JSZip for reading and creating ZIP archives. Its license is included under `builder/vendor/JSZIP-LICENSE.md`.
