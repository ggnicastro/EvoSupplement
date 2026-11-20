# Network Viewer

**Status: available — version 1.4.1.**

The EvoSupplement Network Viewer presents biological association networks as interactive supplementary figures. Authors can load a precomputed edge TSV or generate domain relationships from either Gene Neighborhood Viewer input format. All parsing, aggregation, filtering, community detection, layouts, and rendering run locally in the browser. Source files are never rewritten.

There is always **one undirected edge per displayed node pair**. Relation types and directional observations remain available in the hover card. Same-protein and genomic-context associations describe the supplied annotations; they do not establish physical interaction or a historical fusion event.

## Capabilities and organization

- optional node YAML with display names, alias unification, inclusion, functions, notes, and individual colors;
- a collapsed node editor with Include/Exclude, Rename, Color, search, frequency sorting, and pagination;
- standard and compact neighborhood conversion, alongside the existing edge TSV input;
- relation-family and subtype filters before aggregation thresholds and community detection;
- node sizing by degree, weighted degree, constant radius, or available input frequency;
- Louvain and Leiden community analysis of the currently visible graph;
- function or community colors and grouped layouts;
- seven layouts, node dragging/pinning, pan/zoom, search, and persistent selection;
- adjustable edge thickness and standalone SVG export in the editor;
- converted-edge, curated node-YAML, and community-YAML/color downloads.

| Path | Purpose |
|---|---|
| `shared/network-viewer.js` | Parsing, alias resolution, aggregation, filtering, communities, layouts, and rendering. |
| `shared/neighborhood-network.js` | Converts neighborhood parser output into an edge ledger and node evidence. |
| `shared/styles.css` | Shared network appearance. |
| `editor/index.html`, `editor/config.js` | Local authoring page and defaults. |
| `editor/node-curation.js`, `editor/node-curation.css` | Collapsed searchable node editor. |
| `editor/data/` | Bundled edge and node example. |
| `figure1/` | Automatically loaded publication example. |

The editor reuses `neighborhood-viewer/shared/neighborhood-viewer.js` as its neighborhood parser. Keep that module available when distributing the editor. Publication pages using exported edge tables do not need to run the converter.

## Input files

The editor requires one data file: an edge TSV, a standard row-per-domain neighborhood TSV, or the compact neighborhood architecture format. Node YAML and function-color YAML are optional. Publication figures load their configured edge/YAML files automatically.

### Edge TSV

Default columns:

| Column | Meaning |
|---|---|
| `source` | Name or YAML key of the first endpoint. |
| `target` | Name or YAML key of the second endpoint. |
| `edge_type` | Directional or relation annotation retained in hover details. |
| `edge_count` | Numeric evidence count contributed by this row. |

The column names can be changed through `edgeColumns` in `config.js`.

For legacy rows without an `event_id`, every `edge_count` is summed for the same unordered canonical pair, including reciprocal rows. These rows:

```tsv
source	target	edge_type	edge_count
A	B	Upstream	6
B	A	Downstream	6
A	B	Cterminal	3
B	A	Nterminal	3
```

produce one edge with total 18. Their directions, types, and counts remain visible in the hover card. Whether reciprocal rows are independent observations is the author's responsibility.

Additional generated-ledger columns have these meanings:

| Column | Meaning |
|---|---|
| `event_id` | Shared identity for descriptions of one observation. That event contributes once to a canonical pair's total, including after alias merging. |
| `relation` | Explicit family, such as `fusion` or `neighborhood`. |
| `block_id` | Input neighborhood identity. |
| `source_pid`, `target_pid` | Protein identifiers supporting the observation. |

Without explicit `relation`, N/C-terminal types are recognized as fusion, upstream/downstream as neighborhood, and unfamiliar types as other. Do not assign the same event ID to independent evidence. Rows without event identities retain legacy summation behavior.

### Generate a network from neighborhood input

The editor accepts the same formats as the Gene Neighborhood Viewer:

| Format | Required information | Available context |
|---|---|---|
| Standard TSV | `block_id`, `pid`, `nucleotide`, `start`, `end`, `strand`, `query`, `dom`, `domp` | Protein membership, domain order, genomic gene order, and strand. |
| Compact | Query PID; architecture/orientation string; organism; detailed gene/domain list | Protein membership, domain order, schematic gene order, and orientation. |

Use automatic detection or explicitly choose the expected format. Compact input does not provide real genomic distances. Reconstructed coordinates are schematic and must not be interpreted as measured base-pair gaps.

Each annotated domain name becomes a node; unknown annotations (`?`) are omitted. Conversion options select:

- **Scope:** all proteins, or only relations involving at least one query protein;
- **Proximity:** every pair in scope, or consecutive domain positions and adjacent genes only;
- **Markers:** include or omit features such as transmembrane segments and signal peptides.

The converter preserves input order when deciding adjacency. Omitting unknown or marker annotations does not make previously separated genes/domain positions adjacent.

| Relation family | Observation unit | Position annotation |
|---|---|---|
| Fusion / same protein | A domain pair within one protein | Target is N-terminal or C-terminal relative to source, according to domain order. |
| Neighborhood | A domain pair across two proteins in one block | Target gene is upstream or downstream relative to the source gene's strand. |

“Fusion” here means co-presence in one protein, not an inferred historical event. N/C-terminal indicates relative order, not necessarily a protein extremity. A negative-strand gene retains its protein N-to-C domain order; protein order and genomic order are separate. Unknown or tied orientation/order is reported without inventing a directional subtype. Overlapping genes retain a generic neighborhood relation because their spans do not establish an unambiguous upstream/downstream separation.

The converter emits reciprocal descriptions sharing an `event_id`. The undirected total counts each observation once. Repeated instances of a domain within the same observation unit do not inflate that domain pair's count; distinct proteins or gene pairs remain distinct observations. Counts by type or direction can overlap because they describe the same underlying events and need not sum to the undirected total.

Keep parser warnings with the analysis and inspect reconstructed neighborhoods when compact annotations or query assignments are ambiguous. Repeated or overlapping blocks can still contain repeated biological evidence: event IDs do not infer independence between different blocks.

### Node YAML

The YAML is a top-level dictionary whose entries contain scalar fields:

```yaml
Internal_node_key:
  Display_name: Reader-facing label
  Include: 1
  Function: Functional_group
  Notes: Optional note
  Color: "#4e79a7"
```

| Field | Meaning |
|---|---|
| `Display_name` | Canonical label and identity used for unification; defaults to the YAML key when blank. |
| `Include` | Curated inclusion. Values such as `1`, `true`, or `yes` enter the default scope. |
| `Function` | Existing curated category for function colors/layouts; blank or `.nan` becomes `Unassigned`. |
| `Notes` | Optional hover text. |
| `Color` | Optional six-digit hex node-color override for either function or community coloring. |
| `Evidence_blocks`, `Evidence_proteins`, `Evidence_occurrences` | Scalar strings holding JSON identity arrays, written by curated YAML export to preserve exact frequency unions. |

Default display/include/function/notes field names are configurable through `nodeFields`. The simple two-level parser supports quoted strings, JSON-style escapes, booleans, numbers, nulls, and comments. Arbitrary deeper YAML structures and lists are outside its schema; saved evidence arrays are encoded inside scalar strings.

## Collapsed node editor

The **Node editor** panel starts collapsed near the beginning of the editor. Search original or display names, sort by name or available frequency, and use paginated rows rather than expanding every node at once.

Each row offers Include, Rename, and Color with a clear-color action. Include/Exclude can also be applied to all matching search results. There is no additional group editor: assigning the same normalized display name is what merges nodes and their connections. Existing Function/Notes metadata remain available.

Edits remain drafts until **Apply changes**. **Reset draft** returns to the applied state. Curated YAML downloads contain applied settings; apply pending changes first. When a color is assigned to a merged name, matching draft aliases share that color.

The curated YAML download preserves applied display names, inclusion, explicit colors, and available evidence identities. Keep it with the exported edge ledger to restore frequency sizing and future alias unions. The converted-edge download contains the complete conversion output, before the display-only relation/subtype and minimum-count filters; record those controls separately when reproducing a view. This is separate from community-generated YAML, which assigns Function labels from a detected partition.

## Name unification and inclusion

The viewer resolves endpoints as YAML keys and then display names, merges normalized display names, and collects evidence for each unordered canonical pair. Unmatched endpoints retain their original names. All aliases and functions remain visible in hover details.

The **Only YAML Include = 1** switch restricts the graph to canonical nodes with at least one included alias. Applying editor inclusion uses this same rule: if A and B both become X, X remains included when either alias is included. Disable the scope intentionally to inspect excluded, input-referenced nodes. With no node YAML or editor inclusion, all input nodes are eligible.

An edge requires both endpoints to be eligible. Isolated eligible nodes are shown only when **Isolated nodes** is enabled. Evidence-only nodes reconstructed from neighborhood input are retained in the model even when they have no edge.

When aliases supply conflicting non-empty functions, the first included function is preferred, otherwise the first non-empty function. The hover card and processing report retain conflicts. Relationships that become self-loops after renaming are omitted from the drawing and reported.

## Relation and count filters

Choose **All relations**, **Fusion only**, **Neighborhood only**, or **Other**, then choose the desired subtypes. Filtering selects supporting rows before the pair's total is recalculated and compared with the minimum count. The drawing still has one edge per pair, and hover details show its active supporting evidence.

For a pair supported by 10 same-protein events and 20 neighborhood events:

| Selection | Active edge count |
|---|---:|
| All relations | 30 |
| Fusion only | 10 |
| Neighborhood only | 20 |

If no selected observation remains, the edge disappears. Generated event identities prevent reciprocal descriptions from counting twice even when both directional subtypes are selected. Legacy inputs without those identities still sum their rows.

The publication default minimum total is 5. A newly converted neighborhood input starts at minimum 1 and neighborhood-frequency sizing so its initial evidence is visible. The toolbar offers a logarithmic slider, an exact numeric threshold, and a visible-network summary. Changing filters does not rearrange positions automatically; use **Run layout** or **Re-layout** when desired. Active community detection is recalculated after node scope, relation/subtype, threshold, and isolate changes.

## Node frequency and size

Neighborhood conversion stores identity sets for distinct input blocks, proteins, and annotated domain occurrences. A renamed node uses the union of those sets. If A and B occur in the same block and merge into X, that block contributes once. Multiple domain copies in a protein can still count separately as domain occurrences.

Frequency is measured from the loaded conversion input, independently of the displayed relation family. Filtering relations changes degrees and edge totals, but does not redefine input occurrence frequency. A plain edge table cannot establish node occurrence frequency; frequency modes stay unavailable unless its curated node YAML supplies saved evidence identities. The viewer does not substitute degree for frequency.

Node-size choices are constant, degree, weighted degree, and the available block/protein/occurrence frequencies. Minimum and maximum frequency-radius controls bound the display scaling. Frequency is scaled through circle area: the radius is the square root of the minimum squared radius plus the frequency fraction of the available squared-radius range. Frequency counts and the chosen unit are also available for inspection in the editor/hover details.

## Community analysis

| Method | Behavior |
|---|---|
| None | No detected partition; curated functions remain available. |
| Louvain | Multilevel modularity optimization with local node moves and aggregation. |
| Leiden | Local moving with connectivity refinement before aggregation. |

These are descriptive partitions, not proof of biological modules. Community labels are display identifiers and are not stable biological names across filters/settings.

Communities use exactly the graph currently shown, after:

1. alias unification and inclusion scope;
2. relation-family and subtype selection;
3. recalculation of each pair's active total and minimum-count filtering;
4. optional isolated-node retention.

Search, hover, selection, pan/zoom, and dragging do not hide elements and do not change membership. A visible isolate forms a singleton community.

| Parameter | Meaning |
|---|---|
| Resolution | Granularity; lower values generally favor larger communities. Default 1.0. |
| Weight by edge count | Use active aggregate totals; otherwise each edge has weight 1. Enabled by default. |
| Seed | Deterministic processing order. Default 42. |
| Iterations | Maximum local-moving passes at each multilevel stage. Default 20. |
| Recompute | Repeat analysis on the current visible graph. |

The summary reports method, community count, weighting, resolution, and modularity Q.

## Colors, layouts, and interaction

An individual node's explicit `Color` takes priority in both coloring modes. Without an explicit override, function coloring uses its `Function` palette and community coloring uses the detected partition palette. The existing function metadata remain visible in either mode. Same-category edges use the category color; cross-category edges are neutral and dashed. Individual node colors do not create new groups.

An optional partial color dictionary can use either form:

```yaml
Arc2_FHA: "#86b7e8"
Conflict: "#b99bd3"
```

```yaml
colors:
  Arc2_FHA: "#86b7e8"
  Conflict: "#b99bd3"
```

Missing functions receive deterministic automatic colors. Community colors are generated dynamically. See `group-colors.example.yaml`.

| Layout | Use |
|---|---|
| Fruchterman–Reingold | General force-directed overview. |
| Spring (Eades) | Logarithmic spring attraction. |
| Kamada–Kawai | Graph-distance-based arrangement. |
| Grouped spring | Additional attraction within the selected grouping. |
| Circle | Deterministic circular ordering. |
| Concentric | High weighted-degree nodes near the center. |
| Grid | Stable inspection independent of topology. |

**Group layout by** retains the existing options None, YAML function, or Detected community, independently of node color. **Re-layout** selects grouped spring; pinned nodes remain fixed. **Reset positions** releases nodes and recalculates the configured default. Double-click a node to release it, or **Release nodes** to unpin all without rearranging them.

Click a node or edge for persistent selection; Ctrl/Cmd-click adds/removes nodes. Drag nodes to pin positions; drag the background to pan. Wheel/trackpad zooms around the pointer. Fit network and zoom buttons adjust the view. Node hover shows aliases, functions, inclusion, communities, degrees, frequencies where known, and notes. Edge hover shows active totals, types, directions, and supporting input rows. Event-based type/direction counts may overlap.

Free-text search covers labels, YAML keys, functions, communities, and notes. Field searches such as `group:Conflict`, `community:"Community 2"`, `key:Sigma70_r2`, and `notes:membrane` remain available. Enter centers the first match.

Edge width uses logarithmic active-count scaling. The thickness buttons multiply widths from 0.4× to 2.4× in 0.2× steps without changing evidence or analysis. **Export SVG** in the editor exports the full visible network with current positions, colors, sizes, labels, relation filters, scope, threshold, and widths. Screen pan/zoom does not crop the SVG; interaction handles are omitted.

## Publication configuration

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

Community methods: `none`, `louvain`, `leiden`. Color modes: `function`, `community`; community mode requires detection. Layout groups: `none`, `function`, `community`. Existing configurations continue to work with edge TSVs.

To publish a figure, duplicate `figure1/`, replace its data, update its configuration/titles, and register its path in the root `manifest.js`. Use the exported edge ledger and matching curated node YAML for converted networks. Keep the current template and shared asset versions. Publication pages omit upload and curation controls.

The separate **Generate node YAML** action requires Louvain/Leiden. It exports every input endpoint: nodes with visible edges receive Include 1 and a deterministic Function such as Community_01; others receive Include 0. **Include visible isolated nodes** extends inclusion to displayed isolates. Existing display names, notes, explicit colors, and frequency evidence are preserved when available. A matching community-color dictionary can also be downloaded. The export records analysis parameters, including active relation and subtype selection. These comments document the view; loading the YAML does not automatically change the relation controls. This community export has different inclusion/function semantics from the node editor's curated-settings export.

## Validation, limits, and reporting

| Symptom | Check |
|---|---|
| A node is missing | Inclusion scope, alias inclusion, active edges, and Isolated nodes setting. |
| An edge is missing | Selected relation/subtypes, active total versus threshold, and endpoint scope. |
| Two nodes merged | Their normalized display names are equal. |
| Frequency sizing is unavailable | Use neighborhood input or its matching saved evidence identities. |
| Type counts exceed total | Complementary event descriptions overlap; total counts each event once. |
| A function color is unexpected | Inspect merged aliases/functions and any explicit Color override. |
| Community numbers/colors changed | The active graph or analysis parameters changed. |
| The force layout is hard to inspect | Release pins, reset, or choose circle/grid. |
| Input will not load | Confirm format, required columns, YAML schema, file limits, and displayed parser warnings. |

The processing report summarizes original rows, aliases, inclusion, conflicts, invalid rows, self-loops, and the visible network used by communities.

Default limits are 32 MB per input file, 5,000 relevant nodes, and 30,000 aggregated edges. Neighborhood conversion also limits generated ledger rows; when expansion reaches that limit, reduce input, choose adjacent pairs, or restrict to query proteins. Force layouts and iterative community methods should be checked on ordinary reader hardware.

Methods/legends should state the source inputs, conversion scope/proximity/marker settings, event unit or legacy summation rule, selected relation/subtypes, threshold, alias mapping, inclusion scope, frequency unit, layout, community method, weighting, resolution, seed, iterations, and isolate handling. Related taxa, overlapping neighborhoods, and annotation completeness affect interpretation. Keep source input, exported edge ledger, curated YAML, and supplied color dictionaries with the figure.
