# Gene Neighborhood Viewer

The Gene Neighborhood Viewer is the EvoSupplement module for presenting genomic context as interactive, query-centered gene neighborhoods.

It is intended for comparative protein evolution studies in which conserved gene order, domain architecture, operon-like association, taxonomic distribution, or neighboring functional systems contribute to a biological or evolutionary interpretation.

The viewer reads either the canonical row-per-domain TSV or a compact architecture file directly in the browser, reconstructs genomic neighborhoods, draws one oriented arrow per gene, and displays one or more domains inside each gene.

## Main capabilities

- Renders forward- and reverse-strand genes as oriented arrows.
- Displays ordered domain architectures inside each gene.
- Renames domains through a simple YAML dictionary.
- Applies publication-specific domain colors through a separate YAML dictionary.
- Highlights one or more query genes in each neighborhood.
- Filters large datasets by domain, PFAM, organism, taxonomy, accession, product, assembly, or neighborhood identifier.
- Supports fixed-width schematic domain layouts and genomic-coordinate-based layouts.
- Can align neighborhoods around their query genes.
- Can orient negative-strand queries in a common direction.
- Links canonical genomic neighborhoods to NCBI Nucleotide and compact-format genes with known PIDs to NCBI Protein.
- Uses virtualized rendering so thousands of neighborhoods do not require thousands of SVG elements at the same time.
- Provides an editor page for local file loading, automatic format detection, normalized TSV export, and publication pages for automatic hosted-data loading.

## Module organization

| Path | Purpose |
|---|---|
| `shared/neighborhood-viewer.js` | TSV parsing, YAML dictionary parsing, filtering, layout, SVG rendering, tooltips, NCBI links, and virtual scrolling. |
| `shared/styles.css` | Shared appearance for all neighborhood viewer pages. |
| `editor/` | Interactive authoring workspace and local file-loading page. |
| `editor/config.js` | Authoring workspace defaults and manual-loading behavior. |
| `figure1/`, `figure2/`, and so on | One publication-ready genomic-context figure per folder. |
| `figureN/config.js` | Figure title, data paths, layout defaults, marker rules, colors, and size limits. |
| `figureN/data/` | Figure-specific TSV dataset and YAML dictionaries. |
| `figureN/data/te.tsv` | Example name for the neighborhood dataset. The filename may be changed in the configuration. |
| `figureN/data/domain_rename.yaml` | Optional mapping from raw domain names to publication display names. |
| `figureN/data/color_dic.yaml` | Mapping from display names to colors. |

The shared JavaScript and CSS belong to the reusable module. Scientific content belongs to each figure folder.

## Editor page and publication page

### Editor page

The editor is intended for:

- loading a canonical TSV or compact architecture dataset from the local computer;
- testing rename and color dictionaries;
- checking filters and layout controls;
- validating a new dataset before publication;
- exploring configuration choices without modifying a published figure.

Manual loading is enabled in the editor configuration. Local files remain in the browser session and are not uploaded by the viewer.

### Publication page

A publication folder such as `figure1/` should:

- load its TSV and YAML files automatically;
- show the final paper or figure title;
- use stable layout defaults selected by the authors;
- work without requiring readers to choose local files;
- retain interactive filters, layout controls, tooltips, and external links.

For a publication page, all configured data paths must refer to files stored with the figure or to accessible hosted resources.

## Creating a new gene neighborhood figure

1. Duplicate a working publication folder and rename it with the next figure number or a descriptive identifier.
2. Keep the folder inside `neighborhood-viewer/` so its shared-file references remain valid.
3. Replace the example data file with a canonical neighborhood TSV or a compact architecture file.
4. Replace or revise the domain rename dictionary.
5. Replace or revise the domain color dictionary.
6. Update the figure's `config.js` with the final title, input paths, marker rules, and layout defaults.
7. Verify the selected input format and review parser warnings; for compact data, export a normalized TSV after checking the reconstruction.
8. Test filtering, query orientation, query alignment, labels, colors, and NCBI links.
9. Test performance using the full publication dataset rather than a small subset only.
10. Add the figure folder to the root `manifest.js` so it appears on the EvoSupplement portal.

The reusable `index.html`, shared JavaScript, and shared CSS normally do not require figure-specific edits.

## Configuration reference

Each figure reads its settings from `config.js`.

### Titles and input sources

| Field | Purpose |
|---|---|
| `title` | Browser tab title and internal viewer title. |
| `paperTitle` | Optional paper citation or title shown above the publication viewer. |
| `figureTitle` | Figure number and description shown above the publication viewer. |
| `manualLoad` | Enables editor-style local file loading instead of automatic hosted-data loading. Publication pages normally leave this disabled. |
| `inputFormat` | `auto`, `standard`, or `compact`. Auto-detection is the recommended default. |
| `dataUrl` | Relative path to the canonical TSV or compact architecture dataset. |
| `renameUrl` | Relative path to the domain rename YAML dictionary. |
| `colorUrl` | Relative path to the domain color YAML dictionary. |

All relative paths are interpreted from the figure's `index.html`.

### Filter text

| Field | Purpose |
|---|---|
| `includePlaceholder` | Guidance shown in the include-filter box. |
| `excludePlaceholder` | Guidance shown in the exclude-filter box. |

### Initial layout

| Field | Purpose |
|---|---|
| `defaultScaleMode` | Initial layout mode: fixed-width schematic domains or genomic-coordinate fit. |
| `defaultAlignQuery` | Initially aligns query-gene centers when enabled. |
| `defaultFlipNegativeQueries` | Initially mirrors neighborhoods whose query is on the reverse strand. |
| `defaultShowLabels` | Initially displays domain labels when space permits. |
| `defaultZoom` | Initial visual zoom level. |

### Fixed-width geometry

| Field | Purpose |
|---|---|
| `fixedDomainWidth` | Default screen width for regular domain blocks. |
| `fixedDomainWidths` | Optional name-specific widths for selected domains. |
| `fixedGeneGap` | Screen-space gap between neighboring gene arrows. |
| `fixedMarkerOnlyGeneWidth` | Width used when a gene contains only marker annotations. |

### Colors and markers

| Field | Purpose |
|---|---|
| `unknownDomainColor` | Neutral color for domains absent from the color dictionary. |
| `geneBackgroundColor` | Background body color visible behind domains or in marker-only genes. |
| `markerDomains` | Definitions for compact visual markers such as transmembrane segments or signal peptides. |

### File-size protection

| Field | Purpose |
|---|---|
| `maxDataBytes` | Browser-side maximum size applied independently to the TSV and each YAML dictionary. |

The current figure configuration uses a 64 MB limit per input file.

## TSV data model

The TSV represents neighborhoods, genes, and domains in a flattened form. A gene may occur on multiple rows when it contains multiple domain annotations.

The viewer first groups rows by `block_id`, then groups repeated rows for the same gene using its protein identifier and coordinates. Domain entries are ordered by `domp`.

### Required columns

| Column | Purpose |
|---|---|
| `block_id` | Identifier shared by all rows in one genomic neighborhood. |
| `pid` | Protein identifier for the gene. |
| `nucleotide` | Nucleotide accession used for labels and NCBI links. |
| `start` | Gene start coordinate. |
| `end` | Gene end coordinate. |
| `strand` | Gene orientation. Reverse strands may be represented as minus or negative one. |
| `query` | Marks the focal gene or genes. Accepted true-like values include 1, true, yes, and y. |
| `dom` | Raw domain or marker name. |
| `domp` | Domain order within the gene. |

The viewer stops with an error when any required column is missing.

### Useful optional columns

| Column | Use in the viewer |
|---|---|
| `blockp` | Secondary ordering value for domain records. |
| `domain_start`, `domain_end` | Optional residue coordinates retained in domain tooltips and normalized compact-format exports. |
| `feature_order` | Stable ordering support for genes. |
| `assembly` | Display and filtering by assembly accession. |
| `organism` | Organism label and filtering. |
| `taxid` | Taxonomic identifier and filtering. |
| `lineage` | Taxonomic lineage and filtering. |
| `classification` | Alternate taxonomic classification and filtering. |
| `product` | Product description shown in tooltips and searchable filters. |
| `locus` | Locus identifier included in accession searches. |
| `internal_id` | Additional internal or protein identifier included in searches. |
| `replaced` | Replacement accession included in searches. |
| `arch` | Domain architecture text included in domain searches. |
| `profiledb` | Profile annotation text included in domain searches. |
| `pfam` | PFAM annotation used by the PFAM filter. |

Additional TSV columns are tolerated and remain available in the source data even when the current interface does not display them.

## Compact architecture input

The alternative compact format has no header and uses four tab-separated fields per neighborhood:

1. query protein PID;
2. the left-to-right gene architecture and orientation string;
3. organism name;
4. a semicolon-separated detailed list of genes, protein accessions, domain coordinates, and domain names.

The architecture field is authoritative for visual order. `+` joins domains in one protein, `->` and `<-` describe gene direction, `||` flips the orientation of the next gene, `*` marks the query domain, and `?` preserves an unknown gene or annotation. The PID in the first field must correspond to the gene carrying the starred domain.

The detailed field uses entries such as `PID__start..end&domain,start..end&domain`. Its order may be the same as or the reverse of the architecture field. The parser evaluates both orientations, anchors the query PID, and matches gene domain signatures before reconstructing the neighborhood.

Compact files are schematic. They contain protein-domain coordinates but not genomic coordinates or intergenic distances. The viewer therefore synthesizes stable display coordinates, keeps true domain spans in tooltips, and links known PIDs to NCBI Protein instead of Nucleotide. Use fixed-width mode for the intended presentation.

The editor can export `neighborhoods.normalized.tsv`, a canonical standard-format representation of the reconstructed neighborhoods. Review the visualization and any parser warnings before using that normalized file in a publication project.


## Neighborhood coordinates

When `block_id` follows an accession-and-coordinate pattern, the viewer can use it to determine the complete neighborhood interval. Otherwise, the neighborhood range is inferred from the minimum and maximum gene coordinates.

Gene and neighborhood links are generated from `nucleotide`, `start`, and `end`. Reverse-strand gene links include the reverse-strand parameter when opened at NCBI.

Before publication, verify a sample of forward- and reverse-strand links manually.

## Domain rename dictionary

`domain_rename.yaml` is a flat key-to-value mapping from raw annotation names to the names that should appear in the figure.

Use it to:

- merge synonymous profile names;
- replace internal profile identifiers with publication labels;
- standardize capitalization;
- shorten labels for compact domain blocks;
- group several source annotations under one biological name.

Matching is case-insensitive when an exact match is not available. The dictionary must remain flat; nested YAML structures are not supported by this viewer.

Renaming is applied before the display color is chosen.

## Domain color dictionary

`color_dic.yaml` is a flat key-to-color mapping. Keys should normally use the final display names produced by the rename dictionary.

Domains without a configured color remain neutral rather than receiving an arbitrary color. This makes incomplete dictionaries visible during quality control and avoids accidental color reuse.

Use colors consistently across related figures and explain biologically meaningful color groupings in the paper legend.

## Marker domains

Some annotations represent compact features rather than full domain blocks. The configuration can define these as markers.

Typical examples include:

- transmembrane segments;
- signal peptides;
- lipobox or secretion markers;
- short sequence features that should not occupy a full domain width.

Each marker definition has a name, screen-space width, color, and position rule.

An ordered marker remains in its `domp` position. A start marker is placed at the protein start, which corresponds to the tail of the oriented gene arrow and changes side when the gene is reversed.

Markers are matched against both raw and renamed domain names without case sensitivity. Their visual width is schematic and does not represent amino acid coordinates because the current TSV format does not provide residue-level domain boundaries.

## Layout modes

### Fixed domain widths

This is the default schematic mode.

- Repeated occurrences of the same regular domain have the same screen width at a given zoom level.
- Gene spacing is fixed.
- Long neighborhoods may extend beyond the browser width and use horizontal scrolling.
- Rows begin near the left label unless query alignment is enabled.
- The layout emphasizes domain architecture rather than nucleotide distance.

Use this mode when the primary goal is comparing protein architectures and gene content.

### Fit window

This mode uses genomic coordinates.

- Gene lengths and intergenic distances are represented proportionally.
- Each neighborhood can fill the available display width independently.
- Very short genes or domains may be visually compressed.
- The layout emphasizes genomic spacing rather than equal domain visibility.

Use this mode when physical organization of the locus is an important part of the interpretation.

## Query alignment and orientation

Query alignment and query orientation are independent controls.

### Align query

When enabled, neighborhoods are shifted so query-gene centers share a common vertical guide.

In fixed-width mode, this aligns the schematic query positions. In fit-window mode, it uses a shared query-centered genomic scale, so individual rows may no longer fill both sides of the window.

If a neighborhood contains multiple query genes, their combined center is used as the anchor.

### Orient query to the right

When enabled, neighborhoods whose query is on the reverse strand are mirrored. Gene order, strand direction, domain order, and marker placement are mirrored together.

This control is useful for comparing conserved context upstream and downstream of homologous query genes.

## Filters

The viewer has separate include and exclude filters.

- Every include term must match a neighborhood.
- A neighborhood is removed when any exclude term matches.
- Plain text searches across all indexed fields.
- Quotation marks preserve phrases containing spaces.
- Field-specific terms use a field name followed by a colon.
- A leading minus sign in the include box remains accepted for backward-compatible exclusion.

Supported filter fields are:

| Field | Search target |
|---|---|
| `domain` or `dom` | Raw domains, renamed domains, architecture text, and profile text. |
| `pfam` | PFAM annotations. |
| `organism` or `org` | Organism names. |
| `taxon`, `taxonomy`, or `classification` | Taxonomic identifiers and lineage text. |
| `pid` or `protein` | Protein, locus, internal, and replacement identifiers. |
| `nucleotide`, `nucc`, or `accession` | Nucleotide accession. |
| `product` | Product description. |
| `assembly` | Assembly accession. |
| `block` or `block_id` | Neighborhood identifier. |

Representative searches include a domain plus an organism, a PFAM plus a taxonomic group, removal of transmembrane-containing neighborhoods, or exclusion of hypothetical proteins. Test manuscript-relevant searches before publication and document any filters used to derive static conclusions.

## Labels, tooltips, and links

- Domain labels appear when enabled and when sufficient width is available.
- Hovering over a domain or gene reveals its protein identifier, organism, product, coordinates, and other available metadata.
- Clicking a gene opens its nucleotide interval at NCBI.
- Clicking the region link below a row label opens the complete neighborhood interval.
- Query genes receive a distinct visual outline.

The viewer links to external NCBI pages; therefore, those links require internet access even when EvoSupplement itself is hosted locally.

## Virtualized rendering

The viewer renders only the rows visible in the browser plus a small buffer. This allows large datasets to remain responsive without creating an SVG for every neighborhood at once.

Performance still depends on TSV size, number of neighborhoods, number of genes and domain records, filter complexity, browser memory, and the width of fixed-layout tracks.

Always test the complete publication dataset in at least one current desktop browser.

## Shared files and versioning

All gene-neighborhood figures use the same files in `shared/`. A bug fix or interface change applied there affects every neighborhood figure.

When shared JavaScript or CSS is updated, maintainers should ensure that all figure pages reference the same current asset version. This is a framework-maintenance task rather than a normal figure-authoring task.

## Local testing

Serve the repository root through HTTP and open the neighborhood figure through its portal link or full site path. Direct filesystem access may prevent the browser from loading TSV and YAML files.

Test at least:

- automatic loading on publication pages;
- manual loading on the editor page;
- neighborhood and gene counts;
- query identification;
- forward and reverse orientation;
- fixed and fit layouts;
- query alignment;
- include and exclude filters;
- domain renaming and colors;
- marker placement;
- gene and neighborhood NCBI links;
- performance with the full dataset;
- the final portal link from `manifest.js`.

## Domain curation in `editor/`

The Gene Neighborhood Editor can start from either supported neighborhood input alone. The rename and color YAML dictionaries are optional inputs. After the input is loaded, the **Domain curation** panel provides an author-facing workflow that is intentionally absent from publication `figureN/` pages.

The editor computes three frequency measures for every canonical domain identifier:

- **Distinct genes** — the default ranking, counting a domain at most once per gene;
- **Occurrences** — every domain segment in the TSV;
- **Distinct neighborhoods** — the number of neighborhood blocks containing the domain.

Frequency can be calculated from the full loaded dataset or from the neighborhoods currently retained by the Include/Exclude filters. Special markers such as TM, SIG, and SIF remain visible in the table but are excluded from automatic Top-N color suggestions.

Choose Top 10, 15, 20, or a custom number and use **Suggest colors** to assign a deterministic high-contrast palette. Existing selected colors can be preserved. Selecting a row, or clicking a domain block while editor mode is enabled, opens controls for:

- changing the display name without changing the original domain identifier;
- including or excluding that domain from the color dictionary;
- selecting a color visually or entering a hexadecimal color;
- reviewing occurrence, gene, and neighborhood counts.

The original TSV value remains the canonical key for both exported dictionaries. This means renaming a domain never breaks its color association. The editor can export:

- `domain_rename.yaml`;
- `color_dic.yaml`;
- a ZIP containing both files.

Only names that differ from their original identifiers are included in the rename YAML. Only explicitly selected colors are included in the color YAML. Entries loaded from an existing YAML but not found in the current TSV are preserved by default and can be omitted with the corresponding editor option. Selected files are never overwritten.

## Troubleshooting

| Symptom | Likely cause or check |
|---|---|
| The page loads but no data appear | One or more configured paths are invalid, automatic loading is disabled, or a source file exceeds the size limit. |
| The viewer reports missing columns | The TSV header lacks one or more required names or uses different capitalization. |
| A gene is duplicated | Rows for the same gene do not share the same `pid`, start, and end values. |
| Domains appear in the wrong order | Check `domp` and, when present, `blockp`. |
| A domain has the neutral color | Its final display name is absent from the color dictionary. |
| A rename does not apply | Check the raw `dom` value and the flat YAML mapping. |
| A marker appears as a full domain | Its raw or renamed name does not match a configured marker name. |
| Query alignment looks incorrect | Check which genes are marked as query and whether multiple queries occur in the same block. |
| A row is mirrored unexpectedly | Check the query gene's strand and the query-orientation control. |
| NCBI links open the wrong interval | Check nucleotide accessions, coordinates, strand values, and the interval encoded by `block_id`. |
| Filters return unexpected results | Check quoting, field names, renamed domain values, and whether terms are in the include or exclude box. |
| Large datasets feel slow | Reduce unnecessary rows, simplify the displayed dataset, or verify that the source is below browser and hosting limits. |
| The page is unstyled or inactive | Check the shared CSS and JavaScript paths and exact filename capitalization. |

## Figure publication checklist

- The TSV contains all required columns.
- Each neighborhood has a stable `block_id`.
- Repeated rows for one gene use consistent identifiers and coordinates.
- Query genes are marked correctly.
- Strand values and genomic coordinates have been validated.
- Domain ordering matches the intended architecture.
- Rename and color dictionaries use the final publication terminology.
- Marker domains are configured intentionally.
- Fixed or fit layout has been selected for a scientific reason.
- Default query alignment and orientation support the intended comparison.
- Include and exclude filters behave as documented.
- A sample of gene and neighborhood NCBI links has been checked.
- The complete dataset performs acceptably.
- The publication page loads without local file selection.
- The root manifest links to the correct figure folder.

## Current template note

The existing `figure1/` folder contains a large example TSV and associated rename and color dictionaries. Treat these files as example or project-specific material until their provenance and intended publication role are confirmed for the new paper instance.
