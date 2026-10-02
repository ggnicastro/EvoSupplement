# Taxonomy Sankey Viewer

The Taxonomy Sankey module turns a protein list with NCBI TaxIDs into a curated, publication-ready taxonomic flow diagram.

It separates authoring from publication:

```text
taxonomy-sankey-viewer/
├── shared/
│   ├── taxonomy-sankey-viewer.js
│   └── styles.css
├── editor/
│   ├── index.html
│   ├── config.js
│   ├── editor.js
│   ├── data/
│   └── vendor/
└── figure1/
    ├── index.html
    ├── config.js
    └── data/
```

- `editor/` resolves and curates taxonomy and generates the publication files.
- `figureN/` loads a frozen resolved taxonomy and never contacts an external taxonomy service.
- `shared/` contains the reusable Sankey renderer and taxonomy-processing code.

## Input table

The editor accepts a tab-separated table with one protein per row.

Required columns:

| Column | Meaning |
|---|---|
| `pid` | Stable protein identifier. |
| `taxid` | NCBI Taxonomy identifier. |

Recommended column:

| Column | Meaning |
|---|---|
| `classification` | Semicolon-separated lineage used for immediate offline preview and fallback. |

The editor initially assigns weight 1 to every protein row.

## Taxonomy reconciliation

The input `taxid` is the stable identity used for reconciliation. The classification string is not interpreted as fixed ranks because lineages can have different depths and include clades or no-rank nodes.

The editor offers three sources:

1. **Input classification** — immediate local preview without a network request.
2. **NCBI Datasets API** — resolves unique TaxIDs and retrieves current names, ranks, standard-rank classification, and parent TaxIDs.
3. **Local snapshot ZIP** — accepts:
   - a ZIP containing `taxonomy-resolved.tsv`;
   - an NCBI Datasets package containing `taxonomy_report.jsonl` (download it with parent records for complete all-node lineages);
   - a taxdump archive containing `nodes.dmp` and `names.dmp`, with optional `merged.dmp` and `delnodes.dmp`.

Online resolution sends only unique TaxIDs. Protein identifiers and the input classification remain local.

Full NCBI taxdump archives are large and can require substantial browser memory. For routine use, prefer an NCBI Datasets taxonomy package limited to the requested TaxIDs with parent records, or reuse a previously exported `taxonomy-resolved.tsv`.

## Hierarchy modes

### All taxonomic nodes

Uses the full frozen lineage, including optional clades and no-rank nodes. This is useful during exploration and for unusual evolutionary groups.

### Selected standard ranks

Uses an ordered subset of:

- Domain or realm
- Kingdom
- Phylum
- Class
- Order
- Family
- Genus
- Species

The standard-rank fields come from the resolved taxonomy snapshot. If the data have only the input classification, these fields are heuristic and should be reconciled before publication.

In selected-standard-ranks mode, the **Keep unclassified taxa** and **Show no-rank nodes** controls can add those special lineage nodes alongside the chosen canonical ranks. When they are disabled, no-rank and unclassified nodes are omitted rather than reintroduced as a fallback for incomplete rows.

## Compression controls

The editor provides:

- minimum protein count;
- minimum percentage;
- Top N children per parent;
- single-child-chain collapse;
- root visibility;
- unclassified-taxon visibility;
- no-rank visibility;
- sibling ordering by count, name, taxonomy, or manual order.

Taxa removed by thresholds are aggregated within their direct displayed ancestor. By default, synthetic `Other <parent>` groups are **collapsed into the parent**, so their proteins remain in the counts without adding a separate ribbon or node. The viewer toolbar includes **Show Other groups** to expand them temporarily. When expanded, each Other group is kept last within its sibling block to reduce avoidable crossings and visual obstruction. Other groups are never combined across unrelated ancestors.

## Node curation

Click a node in the Sankey or a row in the taxon catalog to set:

- display name;
- action: automatic, always show, collapse into parent, or exclude subtree;
- sibling order;
- color override.

TaxIDs or stable lineage IDs remain the internal identity, so renaming a node does not break the data mapping.

## Published layout

The visualizer uses a hierarchy-aware layered layout. Children remain contiguous within each parent, which prevents avoidable flow crossings in a taxonomy tree. The figure starts with the ranks and special-node policies saved by the author in `taxonomy-sankey.yaml`. Readers can open **Taxonomic levels** to add or remove standard ranks, switch temporarily to the complete lineage, and show or hide unclassified and no-rank nodes. **Configured levels** restores the author's starting view. These reader changes are session-only and never rewrite the publication YAML.

The figure supports:

- clean floating taxon labels without a surrounding interaction rectangle;
- temporary reader-controlled taxonomic-level expansion;
- zoom and pan;
- taxon, TaxID, rank, and protein search;
- persistent node selection;
- ancestor and descendant highlighting;
- count and percentage labels;
- protein-ID download for the selected taxon.

## Exported files

### `taxonomy-resolved.tsv`

One row per protein, including:

- input and resolved TaxIDs;
- resolution status;
- current scientific name and rank;
- complete lineage IDs, names, and ranks;
- standard-rank names and TaxIDs;
- supplied classification;
- reconciliation differences.

### `taxonomy-sankey.yaml`

Stores:

- resolver metadata;
- hierarchy mode and displayed ranks;
- compression parameters;
- sorting and color grouping;
- node-specific rename, action, color, and order overrides.

### `taxonomy-colors.yaml`

Optional reusable dictionary mapping color-group labels to hexadecimal colors.

### `taxonomy-resolution-report.tsv`

Lists unresolved, remapped, and classification-difference information for review.

## Creating a publication figure

1. Open `taxonomy-sankey-viewer/editor/` through an HTTP server.
2. Load the protein taxonomy TSV.
3. Resolve TaxIDs online or from a local snapshot.
4. Select levels and compression rules.
5. Curate individual nodes.
6. Download the publication package.
7. Use `taxonomy-resolved.tsv` and `taxonomy-sankey.yaml` in the Project Builder.
8. Add the optional color YAML and original input TSV when desired.

The Project Builder copies only the publication viewer, shared assets, and selected data files. Editor controls are not included in `figureN/`.

## Local testing

From the repository root:

```bash
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000/taxonomy-sankey-viewer/editor/
```

Direct `file://` access can block local fetches.

## Compact height control

The **Diagram height** control is available in both the editor and publication viewer. It rescales the vertical layout from 20% to 250% without changing taxonomic counts or curation. Large protein sets can therefore be flattened when only a few ranks are displayed. The selected value is saved as `layout.height_scale` in `taxonomy-sankey.yaml`.

Synthetic `Other <parent>` nodes honor explicit curation actions before the global setting. `exclude` removes the aggregated branch and its proteins from displayed totals; `collapse` keeps the proteins in the parent; and `always` forces that particular Other node to remain visible. The exported YAML stores the global behavior as `layout.collapse_other` (default `true`).
