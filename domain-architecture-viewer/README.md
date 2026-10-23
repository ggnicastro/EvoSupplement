# Protein Domain Architecture Viewer

Version 1.2.0 adds standalone rename dictionaries and full-view SVG export from the Editor. Existing architecture YAML files remain usable.

The Protein Domain Architecture Viewer renders Pfam-like domain diagrams for many proteins while preserving domain coordinates, protein lengths, repeated domains, overlapping annotations, and optional per-protein or per-domain metadata.

The module follows the standard EvoSupplement structure:

```text
domain-architecture-viewer/
├── shared/
│   ├── domain-architecture-viewer.js
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

## Input table

The TSV uses one row per domain or special feature. Five columns are required:

| Column | Meaning |
|---|---|
| `pid` | Stable protein identifier. |
| `domain` | Domain or feature identifier. |
| `start` | Inclusive 1-based start coordinate. |
| `end` | Inclusive 1-based end coordinate. |
| `plen` | Full protein length in amino acids. |

Any additional columns are accepted. A column whose value is constant across all rows of a protein is treated as protein metadata and becomes available for labels, sorting, grouping, filtering, and protein hover. A column that varies between rows of the same protein is treated as domain metadata and becomes available in domain hover.

The editor reports invalid coordinates, inconsistent `plen` values, and metadata columns containing more than one value for a protein.

## Drawing modes

### True length

All proteins share an amino-acid scale. Domain positions, widths, terminal extensions, and unannotated intervals remain proportional to the source coordinates.

### Normalized proteins

Every protein occupies the same visual width. Domain positions and widths remain proportional to the corresponding protein length, making relative architectures easy to compare.

### Compact architecture

Domain widths remain proportional to their annotated lengths, while unannotated intervals are capped or removed. Optional break marks preserve awareness that omitted residues occur between adjacent annotations. Original coordinates and omitted interval sizes remain available in hover.

## Special features

The identifiers below use fixed cross-figure conventions and are excluded from Top-N style suggestions:

- `SIG`: gold signal-peptide wedge;
- `TM`: dark transmembrane capsule;
- `LIPO`: magenta lipobox diamond.

They remain separate occurrences even when repeated within a protein.

## Editor workflow

1. Open `domain-architecture-viewer/editor/` through an HTTP server.
2. Load a domain TSV. An existing architecture YAML, a separate rename YAML, a color YAML, and a shape YAML are optional.
3. Choose true-length, normalized, or compact drawing.
4. Configure alignment, sorting, grouping, labels, subtitles, and hover fields.
5. Rank ordinary domains by distinct proteins, occurrences, or residues covered.
6. Suggest styles for Top 10, Top 15, Top 20, or a custom number of domains.
7. Click a domain in the table or drawing to edit its display name, color, shape, or visibility.
8. Export the current filtered figure as SVG, or download `domain-architecture.yaml`, separate rename/color/shape dictionaries, or a publication package ZIP.

### Rename YAML

Rename files are flat mappings from the original TSV domain ID to its display name:

```yaml
PF00001: Kinase
PF00002: "Helicase C-terminal"
```

JSON objects with the same mapping are also accepted. The separate rename YAML takes precedence over `display_name` values in the architecture YAML. Names are applied before color and shape dictionaries, whose keys continue to use the final display name. The Editor can export the current rename mapping separately; the architecture YAML also retains the resolved names so publication figures remain self-contained. Unused entries from a loaded rename dictionary are preserved in the separate export.

The `renameUrl` figure configuration option can load the same dictionary on a published figure. The shared API accepts `renameText` or `renameUrl` alongside the other inputs.

### SVG export

**Export SVG** is available in the Editor only. It exports all rows in the current filtered and sorted view, including group headings, labels, ruler, domain shapes, and the current layout/style settings. Search filtering, grouping, and collapsing apply; browser scroll position and zoom do not crop the file. Large filtered collections produce correspondingly tall SVG files.

Source files are never overwritten.

## Shapes

Supported shape values are:

- rounded rectangle;
- rectangle;
- capsule;
- ellipse;
- hexagon;
- chevron;
- arrow;
- diamond.

Shapes are chosen in the editor. The publication page consumes the resulting YAML and does not expose authoring controls.

## Labels and metadata

The protein label and optional subtitle accept templates such as:

```text
{pid}
{gene} — {organism}
{pid} | {protein_family}
{display_name} [{class}]
```

The editor also exposes every detected metadata field for sorting, grouping, and hover. The original `pid` remains the stable identity even when another label is displayed.

## Alignment

Rows can be aligned by:

- N terminus;
- C terminus;
- start, center, or end of a selected domain.

Proteins without the selected anchor domain remain N-terminally aligned.

## YAML

`domain-architecture.yaml` stores:

- initial drawing mode;
- compact-gap behavior;
- row height;
- alignment and anchor domain;
- sorting and grouping;
- label and subtitle templates;
- hover fields;
- explicit domain styles;
- fixed special-feature conventions.

The original domain identifier is the YAML key. Renaming a displayed domain therefore does not break its association with TSV rows.

## Reader controls

A published `figureN/` page can temporarily change:

- drawing mode;
- alignment;
- sorting and grouping;
- row height;
- zoom;
- gap marks;
- domain labels;
- protein lengths;
- ruler;
- metadata labels and hover fields;
- collapse of identical visible architectures.

These changes affect only the browser session and never modify the YAML or TSV.

## Large datasets

Rows are virtualized: only the visible portion of the protein list is rendered. The bundled example contains 1,000 proteins and 2,005 domain rows. The default browser-side limits are 500,000 rows and 64 MB per source file.

Use compact architecture, grouping, search, and architecture collapse when publishing very large collections.

## Separate color and shape dictionaries

Color and shape YAMLs are flat mappings keyed by the **final display name after renaming**:

```yaml
# color_dic.yaml
"HAD": "#4f8fd9"
"HTH": "#d55d68"
```

```yaml
# shape_dic.yaml
"HAD": "hexagon"
"HTH": "rounded"
```

The supported shape values are `rounded`, `rectangle`, `capsule`, `ellipse`, `hexagon`, `chevron`, `arrow`, and `diamond`. Colors accept quoted three- or six-digit hexadecimal values. JSON objects with the same flat mapping are also accepted.

Load order is architecture YAML (including display names), color YAML, then shape YAML. Each dictionary changes only its listed entries and its own property; layout, labels, visibility, metadata and other style settings are preserved. Every original domain ID that resolves to the same final name receives the selected color or shape. Original ID keys are accepted for older dictionaries when the key is not also a final name elsewhere; a final-name entry takes precedence. Conflicting legacy ID entries for one final name use the first ID in natural order and produce a warning. Prefer final-name keys to make choices explicit.

After loading a figure, **Apply colors and shapes to current figure** applies the selected dictionaries without reloading the TSV or discarding manual edits. Clearing an input removes the pending file; it does not undo an already applied style. Reloading local files or the bundled example clears the previous dictionary state. SIG, TM, and LIPO retain fixed conventions and are excluded from ordinary-domain dictionaries.

Manual style edits propagate color and shape to all IDs sharing that final name, while each ID keeps its visibility and other metadata. Changing a display name first resolves that new name against the active dictionaries (or an existing domain with that name); further manual color/shape edits update the shared style. Top-N suggestions also keep aliases sharing a final name consistent. Separate dictionary exports use final names and retain unused imported entries. If a legacy architecture contains conflicting styles under one final name, dictionary export asks you to resolve that conflict first. The architecture YAML and publication package retain all resolved styles under original domain IDs; separate YAML files are also included in the package.

Published figure configurations accept optional `renameUrl`, `colorUrl`, and `shapeUrl`. The shared API accepts `load({ tsvText, yamlText, renameText, colorText, shapeText })`, or the corresponding `dataUrl`, `yamlUrl`, `renameUrl`, `colorUrl`, and `shapeUrl` inputs. It also exposes `applyStyleDictionaries({ colorText, shapeText })`, `serializeRenameYaml()`, `serializeColorYaml()`, `serializeShapeYaml()`, and `serializeCurrentSvg()`.
