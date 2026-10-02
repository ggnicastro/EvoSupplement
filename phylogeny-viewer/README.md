# Phylogeny Viewer and Editor

**Module version: 2.1.0 · Status: available.**

The EvoSupplement Phylogeny module separates authoring from publication:

- `editor/` turns a Newick tree into a curated publication figure by saving support markers, clade groups, colors, a visual root, layout choices, and tip-label rules in `phylogeny.yaml`;
- `figureN/` loads the unchanged Newick tree, the optional tip-annotation table, and the author's YAML configuration for readers.

The module is not a phylogenetic-inference program. Alignment, model selection, tree inference, branch-length estimation, and support calculation remain the responsibility of the analytical workflow that produced the source tree.

## Scientific guarantees

The Newick file is treated as immutable source evidence. Authoring actions do not rewrite it. The module preserves:

- every source tip and edge;
- the source branch lengths;
- the internal labels or support values associated with source edges;
- the original downloadable Newick text;
- the identity of selected branches across layout changes and rerooting.

Search and highlighting never prune the tree. Clade groups, marked supports, and saved roots are linked to stable edge-split signatures computed from the tips on either side of a source edge. This allows author decisions to survive changes among unrooted, radial, and rectangular views without relying on temporary node numbers.

## Folder structure

```text
phylogeny-viewer/
├── README.md
├── shared/
│   ├── phylogeny-viewer.js
│   └── styles.css
├── editor/
│   ├── index.html
│   ├── config.js
│   ├── editor.js
│   └── data/
│       ├── tree.tree
│       ├── annotations.tsv       # optional
│       └── phylogeny.yaml        # optional starting configuration
└── figure1/
    ├── index.html
    ├── config.js
    └── data/
        ├── tree.tree
        ├── annotations.tsv       # optional
        └── phylogeny.yaml
```

The source repository may use different example filenames. Each page's `config.js` defines the actual paths.

## Inputs

### Newick tree — required

Accepted extensions include `.tree`, `.tre`, `.nwk`, and `.newick`; parsing is based on content. The parser supports labeled tips, quoted labels, multifurcations, internal labels, bracket comments, and decimal or scientific-notation branch lengths.

Tip labels must be unique. Numerical internal labels are treated as support values and are retained exactly as written; the viewer does not automatically convert proportions to percentages.

### Tip-annotation table — optional

The editor and publication figure work without a table. When supplied, the table may be TSV, INFO, TXT, or CSV according to the configured delimiter. One column must match the Newick tip identifiers exactly.

The table can provide:

- alternative leaf labels;
- hover metadata;
- categorical or numerical coloring;
- filtering fields;
- explicit colors associated with a category.

A tree tip without a matching row remains visible and receives blank annotation values. A table row absent from the tree is reported but not drawn. Duplicate identifier rows are rejected because they are ambiguous.

### `phylogeny.yaml` — optional in the editor, required for a curated publication figure

The editor can start from the Newick tree alone and generate this file. A publication page uses the YAML to reproduce the author's root, layout, supports, clade groups, and labels while leaving the Newick unchanged.

## Authoring workflow

1. Open `phylogeny-viewer/editor/` through an HTTP server.
2. Load a Newick tree. An annotation table and an existing phylogeny YAML are optional.
3. Choose the initial geometry and branch-length behavior.
4. Mark selected supports, create clade groups, choose colors, and optionally save a midpoint root.
5. Configure tip labels and hover fields when a table is present.
6. Review the figure in all supported layouts.
7. Download `phylogeny.yaml`.
8. Supply the Newick, YAML, and optional table to the EvoSupplement Project Builder.

The editor includes **Undo** and **Redo** for authoring-state changes. Local source files are never overwritten.

## Layouts

The three geometries are:

- **Unrooted** — equal-angle view without presenting the source root as a biological conclusion;
- **Radial** — rooted circular view with curved parent arcs and outward radial branches;
- **Rectangular** — rooted left-to-right view suitable for aligned labels and metadata-heavy figures.

The separate **Use branch lengths** control switches between proportional branch lengths and a topology-depth presentation. Therefore, rectangular and radial views can each function as a phylogram or cladogram-style display. The radial geometry uses conventional circular arcs at the parental radius followed by outward radial segments, making rooted relationships easier to read than a web of straight diagonals.

The reader-facing figure may temporarily switch among these layouts. The configured YAML determines the initial presentation.

## Marked supports

The default tree opens with no support text and no support circles unless the YAML marks specific source edges.

In the editor:

1. hover over an internal node to inspect its support value;
2. click the node to select the branch and mark or unmark its support;
3. choose **Circle** or **Number** under **Marked support display**;
4. set the global circle color and marker or number size;
5. optionally use **Mark supports at or above** to add multiple markers;
6. use **Clear marked supports** to remove all marks.

**Circle** is the default publication style. The exact support value remains available in the hover card. **Number** places the stored source value as text. The support scale is not transformed; a threshold must use the same scale stored in the Newick, such as `0.95` or `95`.

Marked supports are saved by edge-split signature, so changing the layout or saving a different root does not detach the marker from its source edge.

## Clade groups

Select an internal branch and create a group from the tips on the chosen side. Each group stores:

- a stable branch signature;
- one member tip used to preserve the intended side of the split;
- a name;
- a color;
- an optional label displayed near the clade.

Groups can be nested. When a tip belongs to several nested groups, the smallest, most specific group determines its color. The group list allows renaming, recoloring, showing or hiding the clade label, and removal.

Selecting **Clade groups** under **Color by** applies group colors to relevant branches and tip markers. TSV-based coloring remains available independently.

## Saved rerooting

The editor can save a visual midpoint root without rewriting the tree:

1. choose **Reroot**;
2. click the branch leading to the intended outgroup;
3. confirm the highlighted branch;
4. download the updated YAML.

The selected source edge is stored by split signature. Its displayed length is divided equally around the temporary root while the total source length remains unchanged. **Original root** removes the session's selected root. The publication figure opens at the root saved in the YAML and still permits temporary reader exploration.

## Tip labels and hover metadata

Without an annotation table, `{tip}` displays the Newick identifier.

With a table, the editor provides:

- **Tip ID column** — the field joined to tree tips;
- **Label template** — one or more placeholders, such as `{tip} | {organism}`;
- **Hover fields** — a checkbox list generated from the columns of the currently loaded table. New TSV columns appear automatically; **All** selects every field and **ID only** keeps only the join identifier.

The Newick tip identifier remains the internal identity even when the displayed label changes. Unknown or blank placeholders fall back safely, and an empty rendered label falls back to the original tip ID.

## Filtering and coloring

Include and Exclude fields search tree identifiers and available annotation columns. Supported syntax includes free text, `field:value`, quoted values, comparisons, and numerical ranges.

Coloring can use:

- a categorical TSV column;
- a numerical TSV column;
- explicit colors supplied by another TSV column;
- author-defined clade groups;
- no coloring.

Filtering changes emphasis only. All source tips and edges remain present.

## YAML structure

A generated file conceptually follows this structure:

```yaml
version: 1
title: "Phylogeny figure"
layout:
  mode: "unrooted"
  use_branch_lengths: true
  align_labels: true
  branch_scale: 1
  tip_spacing: 22
  fit_mode: "all"
  color_by: "groups"
root:
  edge: "split:..."
supports:
  display: "circle"
  color: "#172033"
  size: 5
  number_size: 9
  marked:
    - edge: "split:..."
      value: "0.97"
labels:
  id_column: "id"
  template: "{tip} | {organism}"
  hover_columns: ["organism", "taxonomy"]
groups:
  - id: "group-example"
    name: "Example clade"
    color: "#4f8fd9"
    edge: "split:..."
    member_tip: "WP_000000001.1"
    show_label: true
```

The edge signatures are generated and maintained by the editor. They should normally not be edited manually.

## Mouse navigation

The tree panel supports direct navigation in both the editor and publication figure:

- rotate the mouse wheel over the panel to zoom around the pointer location;
- drag empty tree space to pan horizontally or vertically;
- use the View zoom slider for large deterministic changes;
- use **Fit tree** or **Tree + labels** to recover the complete view.

Dragging never changes the topology, rooting, selected supports, or authored groups.

## Reader-facing controls

A publication figure can expose:

- Unrooted, Radial, and Rectangular views;
- branch-length on/off;
- fit tree and fit tree plus labels;
- branch scale, tip spacing, whole-view zoom, mouse-wheel zoom centered at the pointer, and click-drag panning;
- Include and Exclude highlighting;
- annotation or clade-group coloring;
- hover and pinned details;
- temporary reroot exploration;
- downloads of the source tree, optional table, and curation YAML.

Readers cannot permanently edit clade groups, marked supports, labels, or the publication YAML.

## Builder integration

Builder 1.5.1 expects:

- a Newick tree — required;
- `phylogeny.yaml` produced by the editor — required;
- a tip-annotation table — optional.

The Builder copies the compatible Viewer 2.1.0 template and shared assets, generates the publication `config.js`, and keeps the annotation table optional.

## Validation checklist

Before publication, verify that:

- tree-tip identifiers are unique;
- the optional annotation ID column matches the intended tips;
- every marked support corresponds to the intended source edge;
- every clade group still contains the expected tips;
- the saved root represents the documented rooting decision;
- nested group colors are distinguishable;
- tip-label templates remain readable at the chosen layout and zoom;
- the figure opens correctly without the editor controls;
- source downloads reproduce the original Newick and table unchanged.

## Local testing

Serve the repository root over HTTP:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/phylogeny-viewer/editor/
```

Direct `file://` access may prevent the browser from loading configured local data files.
