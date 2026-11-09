# Network Viewer

**Status: available.**

The EvoSupplement Network Viewer presents precomputed biological association networks as interactive, browser-based supplementary figures. It is intended for relationships among protein families, domains, genomic-context features, architectures, clades, structural classes, or other author-defined entities.

The viewer does not infer the source network. Authors provide node metadata and edge observations produced by their analysis. The browser resolves node names, unifies aliases, aggregates undirected relationships, filters them by summed evidence, optionally restricts the node set through the YAML `Include` field, detects communities from the currently visible graph, and renders the result.

## Current capabilities

- undirected networks built from a TSV edge table;
- optional node names, alias unification, inclusion status, curated functions, and notes from a YAML dictionary;
- automatic unification by `Display_name`;
- summation of every directional and relationship-type row for the same undirected node pair;
- minimum-total-edge-count filtering, with a default threshold of 5;
- a live switch between YAML-curated nodes and all TSV-referenced nodes;
- Louvain and Leiden community detection;
- weighted or unweighted community detection;
- configurable resolution, random seed, and local-moving iterations;
- community calculation exclusively from the currently visible network;
- coloring by curated YAML function or detected community;
- grouping layouts by YAML function, detected community, or no category;
- same-category edges colored with the active category color;
- cross-category edges shown as neutral dashed relationships;
- optional author-supplied function-color dictionary;
- deterministic automatic colors when no function-color dictionary is supplied;
- Fruchterman–Reingold, Eades spring, Kamada–Kawai, grouped spring, circle, concentric, and grid layouts;
- node dragging and pinning;
- pan, wheel zoom, zoom buttons, and fit-to-network;
- node search by display name, YAML key, function, detected community, or notes;
- persistent node and edge selection;
- hover details for nodes and aggregated relationships;
- node sizing by degree, weighted degree, or a constant radius;
- optional display of nodes that become isolated under the active edge threshold;
- local-file loading in the editor and automatic hosted loading in publication figures;
- source-file downloads from publication pages;
- generated node-YAML and community-color downloads from the editor.

All parsing, aggregation, filtering, community detection, layouts, and rendering occur in the browser. The source TSV and YAML files are never rewritten.

## Module organization

```text
network-viewer/
├── README.md
├── group-colors.example.yaml
├── shared/
│   ├── network-viewer.js
│   └── styles.css
├── editor/
│   ├── index.html
│   ├── config.js
│   └── data/
│       ├── interactions.tsv
│       └── nodes.yaml
└── figure1/
    ├── index.html
    ├── config.js
    └── data/
        ├── interactions.tsv
        └── nodes.yaml
```

`shared/` contains the reusable implementation. `editor/` accepts local files and also loads a bundled example. Each `figureN/` folder is a publication instance that loads its configured files automatically and does not expose upload controls.

## Input files

The edge TSV is the only required file in the editor. A node YAML is optional and adds aliases, display names, curated inclusion, functions, and notes. A third YAML containing function colors is also optional. Publication figures normally provide a node YAML so their curated defaults and labels are reproducible, but the shared viewer can load a configured edge TSV without one.

### Edge TSV

The default columns are:

| Column | Meaning |
|---|---|
| `source` | Name or YAML key of the first endpoint. |
| `target` | Name or YAML key of the second endpoint. |
| `edge_type` | Directional or relationship annotation retained for hover details. |
| `edge_count` | Numeric evidence count contributed by this row. |

The column names can be changed through `edgeColumns` in `config.js`.

The input may contain reciprocal rows, multiple relationship types, or repeated observations. The viewer deliberately treats the final network as undirected. After resolving both endpoints to canonical display-name nodes, it groups every row for the same unordered pair and sums all `edge_count` values.

For example, all of the following contribute to one displayed relationship between A and B:

```text
A    B    Upstream      6
B    A    Downstream    6
A    B    Cterminal     3
B    A    Nterminal     3
```

The resulting undirected relationship has a total edge count of 18. The four original rows, their types, directions, and individual counts remain available in the edge hover card.

### Node YAML

The YAML is a top-level dictionary. Each key identifies one input node and contains scalar metadata fields:

```yaml
Internal_node_key:
  Display_name: Reader-facing label
  Include: 1
  Function: Functional_group
  Notes: Optional note
```

The default field names can be changed through `nodeFields` in `config.js`.

| Field | Default behavior |
|---|---|
| `Display_name` | Canonical reader-facing label and the identity used for unification. If blank, the YAML key is used. |
| `Include` | Curated inclusion flag. Entries interpreted as `1`, `true`, or `yes` enter the default node scope. |
| `Function` | Curated category used for function coloring and function-grouped layouts. Blank or `.nan` values become `Unassigned`. |
| `Notes` | Optional text displayed in node hover details. |

The parser intentionally accepts the simple two-level YAML schema shown above. It supports quoted strings, double-quoted Unicode escapes, booleans, numbers, nulls, and comments. Nested lists or deeper arbitrary YAML structures are outside the module schema.

## Node scope and `Include`

The toolbar contains:

> **Only YAML Include = 1**

It is enabled by default when a node YAML is present. When no node YAML is loaded, the control is disabled and every TSV-referenced node is eligible.

When enabled:

- a canonical node is eligible if at least one YAML entry merged into it has `Include: 1`;
- relationships are retained only when both endpoints are eligible;
- the active edge-count threshold is then applied;
- isolated eligible nodes appear only when **Isolated nodes** is enabled.

When disabled:

- every node referenced by the TSV may enter the graph, including YAML entries with `Include: 0`;
- TSV endpoints not found in the YAML are retained as `Unassigned` nodes;
- YAML entries that are never referenced by the TSV are not added merely because the scope switch is off;
- `Display_name`, `Function`, and `Notes` are still used whenever YAML metadata exists.

This design lets the author publish a curated default while allowing readers to inspect the broader TSV network without rendering thousands of unrelated YAML entries.

## Display-name unification

The viewer uses this sequence:

1. read the scalar metadata for every valid top-level YAML entry;
2. choose `Display_name` as the canonical node label;
3. merge YAML entries that have the same normalized display name;
4. resolve each TSV endpoint first as a YAML key and then as a display name;
5. retain an unmatched TSV endpoint as an unannotated node;
6. replace every endpoint with its canonical display name;
7. aggregate all rows for each unordered canonical pair;
8. apply the active YAML inclusion scope;
9. apply the minimum total edge-count threshold.

This permits several internal keys to become one displayed node. All original YAML keys and functions remain available in the node hover card.

If merged entries provide more than one non-empty `Function`, the first included function is used as the primary curated function. When none of the merged entries is included, the first non-empty function is used. All supplied functions remain visible in hover details, and the processing report records the conflict. Authors should correct the YAML when this merge is not biologically intended.

Relationships that become self-loops after display-name unification are omitted from the drawing and reported.

## Edge filtering

The default publication configuration uses:

```text
minimum total edge count = 5
```

The threshold is applied **after** all directions, edge types, aliases, and repeated rows have been unified and summed. A relationship is visible when its aggregate total is greater than or equal to the active threshold.

The toolbar provides:

- a logarithmic slider for rapid exploration across a wide count range;
- a numeric field for an exact threshold;
- a live summary of visible nodes and relationships.

Changing the threshold does not automatically rearrange positions. This avoids unexpected movement while a reader is examining the graph. Use **Run layout** or **Re-layout** after a major change.

When community detection is active, changing the threshold immediately recalculates the communities from the newly visible nodes and relationships.

### Isolated nodes

By default, nodes with no relationship above the active threshold are hidden so the connected graph can be fitted at a readable scale. The **Isolated nodes** checkbox reveals every eligible node in the current YAML scope.

When community detection is active, a visible isolated node forms a singleton community because it has no visible relationship to another node.

## Community detection

The community panel offers three methods:

| Method | Behavior |
|---|---|
| `None` | No detected partition. Curated YAML functions remain available for color and layout. |
| `Louvain` | Multilevel modularity optimization using local node moves and graph aggregation. |
| `Leiden` | Local moving followed by connectivity refinement and aggregation, preventing disconnected detected groups in the rendered partition. |

Community detection is descriptive and depends on the active graph and parameters. It does not replace the author's biological interpretation.

### Visible-network rule

Communities are always calculated from the graph currently shown to the reader, in this order:

1. resolve and unify all names;
2. select either YAML `Include: 1` nodes or all TSV-referenced nodes;
3. retain relationships whose summed total meets the minimum edge-count threshold;
4. include or hide isolated nodes according to the checkbox;
5. run Louvain or Leiden on exactly those visible nodes and relationships.

Search, hover, selection, pan, zoom, and manual node movement do not change community membership because they do not hide graph elements.

### Parameters

| Control | Meaning |
|---|---|
| `Resolution` | Controls granularity. Lower values generally favor fewer, larger communities; higher values favor more, smaller communities. |
| `Weight by edge count` | When enabled, each relationship uses its aggregated total `edge_count`; when disabled, every visible relationship has weight 1. |
| `Seed` | Controls deterministic node-processing order for reproducible runs with the same browser implementation, data, and parameters. |
| `Iterations` | Maximum local-moving passes at each multilevel stage. |
| `Recompute` | Runs the selected method again on the current visible graph. |

The default resolution is 1.0, the default seed is 42, and edge weights are enabled.

The summary reports the method, number of communities, weighting mode, resolution, and modularity value `Q`. Community numbers are display identifiers ordered primarily by community size. They should not be interpreted as stable biological names across different filters or parameter settings.

## Colors

### Color nodes by YAML function

This preserves the original behavior:

- each node uses the color associated with its curated `Function`;
- an edge between two nodes with the same non-empty function uses that function color;
- an edge between different functions is neutral gray and dashed;
- `Unassigned` receives a neutral color.

### Color nodes by detected community

This option becomes available after Louvain or Leiden is selected:

- each detected community receives a deterministic automatic color;
- an edge within one community uses that community color;
- an edge between communities is neutral gray and dashed;
- the legend changes from functions to communities;
- YAML functions remain visible in node and edge hover details.

Community colors are generated by the viewer because the number and composition of communities can change with node scope, threshold, resolution, weighting, or algorithm.

### Optional function-color dictionary

When no color file is supplied, the viewer assigns deterministic colors to each distinct YAML function. Common groups in the bundled example use a publication-oriented palette, while unseen names receive colors from a stable fallback palette.

A function-color YAML may be configured through `colorUrl` or selected in the editor. The simplest form is:

```yaml
Arc2_FHA: "#86b7e8"
Arc2_classical: "#ef8e91"
Conflict: "#b99bd3"
```

The following nested form is also accepted:

```yaml
colors:
  Arc2_FHA: "#86b7e8"
  Arc2_classical: "#ef8e91"
```

A dictionary may be partial. Missing functions continue to receive automatic colors. See `group-colors.example.yaml` for a complete example.

The edge width follows a logarithmic transformation of aggregate `edge_count`, preventing very large counts from overwhelming the graph.

## Layouts

| Layout | Intended use |
|---|---|
| Fruchterman–Reingold | General force-directed overview; the publication default. |
| Spring (Eades) | Alternative force model using logarithmic spring attraction. |
| Kamada–Kawai | Graph-distance-based arrangement that emphasizes topological distances. |
| Grouped spring | Force-directed layout with additional attraction toward the active layout category. |
| Circle | Deterministic circular ordering by the active layout category and label. |
| Concentric | High weighted-degree nodes near the center. |
| Grid | Stable inspection layout independent of network topology. |

`Group layout by` is independent of node color and can be set to:

- `None`;
- `YAML function`;
- `Detected community`.

This permits comparisons such as function colors inside community-grouped positions or community colors inside function-grouped positions.

**Re-layout** selects the grouped-spring layout and recalculates positions with the active grouping choice. Manually pinned nodes remain fixed. **Reset positions** releases all nodes, restores the configured layout and seed, and recalculates the network.

## Interaction

### Nodes

- Hover to inspect the canonical display name, YAML function, detected community, inclusion state, original YAML keys, notes, visible degree, and weighted counts.
- Click to select a node persistently.
- Ctrl/Cmd-click to add or remove a node from the selection.
- Drag to move and pin a node.
- Double-click a node to release its fixed position.
- Use **Release nodes** to release every pinned node without immediately rearranging the graph.

Selecting a node emphasizes its direct neighbors and connected edges while dimming unrelated elements.

### Edges

Hovering an edge shows:

- canonical source and target display names;
- summed total edge count;
- endpoint YAML functions;
- endpoint detected communities;
- whether the relationship is within or between the active categories;
- totals by `edge_type`;
- totals by original direction;
- the contributing TSV rows.

Clicking an edge selects it and its two endpoints.

### Search

Free text searches display names, YAML keys, functions, detected communities, and notes. Field-qualified searches are also available:

```text
group:Conflict
community:"Community 2"
key:Sigma70_r2
notes:membrane
```

Press Enter to select and center the first matching node.

### View controls

- mouse wheel or trackpad: zoom around the pointer;
- drag the background: pan;
- `+` and `−`: zoom around the viewport center;
- **Fit network**: fit the visible graph and labels;
- **Labels**: show or hide display names;
- **Node size**: constant, degree, or weighted degree.

## Figure configuration

A publication `config.js` has this structure:

```javascript
window.NETWORK_VIEWER_CONFIG = {
  autoLoad: true,
  edgeUrl: './data/interactions.tsv',
  nodeUrl: './data/nodes.yaml',
  colorUrl: '',

  defaultMinimumCount: 5,
  defaultLayout: 'fruchterman-reingold',
  defaultNodeSize: 'weighted-degree',
  defaultShowLabels: true,
  defaultShowIsolates: false,

  defaultOnlyIncluded: true,
  defaultCommunityMethod: 'none',
  defaultCommunityResolution: 1.0,
  defaultCommunityWeighted: true,
  defaultCommunitySeed: 42,
  defaultCommunityIterations: 20,
  defaultColorBy: 'function',
  defaultGroupLayoutBy: 'function'
};
```

Allowed community methods are `none`, `louvain`, and `leiden`. `defaultColorBy` accepts `function` or `community`; community coloring requires an active community method. `defaultGroupLayoutBy` accepts `none`, `function`, or `community`.

The complete example configurations document column mappings, limits, titles, layout seed, and download behavior.

## Creating another publication figure

1. Duplicate `figure1/` as `figure2/` or another figure folder.
2. Replace the files in its `data/` directory.
3. Update `edgeUrl` and, when used, `nodeUrl` and `colorUrl` in its `config.js`.
4. Set the paper and figure titles.
5. Select the initial threshold, node scope, community method and parameters, color mode, layout, node-size mode, label behavior, and isolate behavior.
6. Keep the current `index.html` template and shared asset version.
7. Add the figure path to the root `manifest.js`.
8. Test endpoint resolution, merged display names, aggregate counts, scope switching, community recalculation, colors, hover details, layouts, and downloads through an HTTP server.

## Editor behavior

The editor exposes three file selectors:

- edge TSV — required;
- node YAML — optional;
- function-color YAML — optional.

The files are read with the browser File API and are not uploaded. With an edge TSV alone, each unique endpoint name becomes an independent node. The bundled annotated example can be restored at any time.

Publication pages intentionally omit all upload controls and load their configured files automatically.

## Validation and troubleshooting

| Symptom | Likely cause or check |
|---|---|
| A curated node is missing | Its YAML entry is absent, none of its merged aliases has `Include: 1`, or the active threshold leaves it isolated while **Isolated nodes** is off. |
| An excluded node is missing after turning off the Include switch | It is not referenced by any TSV row, so it is not part of the network input. |
| An edge is missing | Its summed total is below the active threshold, or one endpoint is outside the current YAML scope. |
| Two expected nodes became one | Their YAML entries share the same `Display_name`; use distinct display names if they should remain separate. |
| A merged node has an unexpected function color | Its aliases provide different `Function` values; inspect the hover card and processing report, then correct the YAML. |
| A same-function edge is gray | The endpoint functions differ after unification, or one endpoint is `Unassigned`. |
| Community colors changed | The visible graph, algorithm, resolution, weighting, seed, or iteration setting changed. Community numbers and colors are analysis-state labels, not permanent identifiers. |
| Louvain and Leiden disagree | They use different refinement behavior; report the chosen method and parameters rather than treating either partition as a fixed annotation. |
| Community detection produces many singletons | Lower the resolution, lower the edge threshold, hide isolated nodes, or inspect whether the visible graph is fragmented. |
| Colors change between papers | Provide an explicit function-color dictionary for YAML function coloring. Community colors remain generated dynamically. |
| The graph becomes very small | Lower the threshold, turn off the YAML-only scope, reveal isolates, or use **Fit network** after selecting the desired layout. |
| A force layout appears unstable | Release pinned nodes, reset positions, or use a deterministic circle/grid layout for inspection. |
| Local files do not load | Confirm the edge-table column names and file-size limits. When a node YAML is supplied, also confirm its two-level schema and browser console messages. |

The **Data processing report** summarizes input rows, YAML entries, included and TSV-referenced nodes, display-name merges, function conflicts, unannotated endpoints, invalid rows, self-loops, final undirected relationships, and the current visible graph used by community detection.

## Scientific reporting

The viewer does not define what `edge_count` means or whether a detected community represents a biological module. The methods and figure legend should state:

- how the original rows were generated;
- whether reciprocal rows represent independent observations or mirrored descriptions;
- why summing all rows is appropriate for the analysis;
- what edge-count threshold was used in the published default;
- what `edge_type` represents;
- how `Function` groups and YAML `Include` values were assigned;
- whether merged `Display_name` aliases are biologically equivalent;
- whether node sizes represent degree or weighted degree;
- whether Louvain or Leiden was used;
- whether relationships were weighted by aggregated `edge_count`;
- the resolution, seed, and iteration setting;
- whether isolated nodes were included;
- which visible node scope and threshold were active when the reported communities were calculated.

The source edge table, YAML metadata, and any explicit function-color dictionary should remain downloadable beside the visualization.

## Browser limits

The default configuration permits up to:

- 32 MB per input file;
- 5,000 relevant canonical nodes;
- 30,000 aggregated undirected relationships.

The bundled example is far below these limits. Force-directed layouts and iterative community methods scale less efficiently than circle or grid layouts; large figures should be tested on ordinary reader hardware.


## Editor without a node YAML

The editor requires only the edge TSV. When no node YAML is supplied, every unique value found in the configured `source` and `target` columns becomes an independent node, and that identifier is also used as its initial display name. The viewer does not guess biological aliases. A node YAML remains useful when authors need to merge aliases through a common `Display_name`, retain notes, curate `Include`, or provide a manual `Function` classification.

The optional group-color YAML remains supported. Without it, deterministic colors are assigned automatically.

## Generate a node YAML from the visible network

After choosing Louvain or Leiden, the editor can export a publication-ready starting YAML from the current analysis. Community detection and export use the network after undirected aggregation, the active minimum total `edge_count`, the optional YAML `Include` scope, and the isolated-node setting.

The generated file contains every unique node identifier found in the TSV:

- nodes participating in at least one currently visible relationship receive `Include: 1`;
- other TSV nodes receive `Include: 0`;
- included nodes receive a deterministic `Function` label such as `Community_01`;
- excluded nodes receive an empty `Function`;
- `Display_name` and `Notes` are preserved from an optional input YAML when available;
- checking **Include visible isolated nodes** also marks currently displayed isolates as included.

Community labels are ordered deterministically by community size and then by member composition. The export header records the method, threshold, resolution, weighting mode, seed, and iteration limit used to create the file. A second download produces a matching community-color dictionary. Both downloads are generated locally; the original TSV and YAML files are never modified.
