# Protein Domain Architecture Viewer

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
2. Load a domain TSV. An existing architecture YAML is optional.
3. Choose true-length, normalized, or compact drawing.
4. Configure alignment, sorting, grouping, labels, subtitles, and hover fields.
5. Rank ordinary domains by distinct proteins, occurrences, or residues covered.
6. Suggest styles for Top 10, Top 15, Top 20, or a custom number of domains.
7. Click a domain in the table or drawing to edit its display name, color, shape, or visibility.
8. Download `domain-architecture.yaml` or a publication package ZIP.

Source files are never overwritten.

## Shapes

The first version supports:

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
