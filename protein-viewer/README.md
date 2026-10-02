# Protein Structure and MSA Viewer

The Protein Structure and MSA Viewer is the EvoSupplement module for presenting three-dimensional protein structures together with author-defined regions and an optional multiple sequence alignment.

It is intended for supplementary figures involving predicted or experimentally determined structures, conserved domains, catalytic residues, interfaces, insertions, lineage-specific regions, AlphaFold confidence, or sequence-to-structure interpretation.

The viewer uses Mol* for molecular visualization and runs entirely in the browser.

## Main capabilities

- Loads PDB, ENT, CIF, and mmCIF structure files.
- Creates Mol* components from regions defined in a human-readable YAML annotation file.
- Lets authors start with only a structure, capture current Mol* residue selections as annotations, or import user-created Mol* selection components with their main representation, color theme, opacity, and visibility.
- Supports residue ranges, individual residues, and explicit residue lists.
- Supports multiple molecular representations, color themes, labels, tooltips, visibility settings, and opacity.
- Can color AlphaFold-derived structures by pLDDT values stored in the B-factor field.
- Displays an optional aligned FASTA file below the structure.
- Links selected alignment sequences to specific structure chains.
- Includes an editor-side reference finder that compares each observed structure chain with the loaded FASTA records, proposes ranked matches, and leaves the final chain-to-reference assignment under author control.
- Synchronizes persistent single, additive, and range-based MSA selections with residue selections in Mol* in both directions.
- Provides publication pages with automatic loading and editor pages with local file controls.
- Keeps structure, annotation, and alignment files downloadable from the published figure.

## Module organization

| Path | Purpose |
|---|---|
| `shared/app.js` | Shared viewer behavior, structure loading, annotation parsing, Mol* integration, MSA rendering, and downloads. |
| `shared/styles.css` | Shared appearance for all protein viewer pages. |
| `editor/` | Interactive authoring workspace. It can load a structure with or without YAML, create and edit annotations from Mol* selections, find MSA references, preview the generated scene, and export a compatible YAML. |
| `editor/config.js` | Configuration for the authoring workspace page. |
| `editor/pdb/` | Example structure files. |
| `editor/annotations/` | Example YAML annotations, aligned FASTA files, and detailed annotation documentation. |
| `figure1/`, `figure2/`, and so on | One publication-ready structure figure per folder. |
| `figureN/config.js` | Figure-specific titles, file paths, loading behavior, and Mol* layout. |
| `figureN/pdb/` | Structure files for that figure. |
| `figureN/annotations/` | YAML annotations and, when convenient, aligned FASTA files for that figure. |
| `figureN/msa/` | Optional dedicated location for aligned FASTA files. The viewer does not require this exact folder name. |

The figure configuration determines where each input is stored. An alignment may be placed in `annotations/`, `msa/`, or another figure-local folder as long as its configured path is correct.

## Editor page and publication page

### Editor page

The editor is intended for:

- loading a PDB or mmCIF structure with or without an existing annotation YAML;
- selecting one or many residues in Mol* and capturing that selection as a compatible YAML region;
- importing user-created Mol* selection components after choosing a supported primary representation such as cartoon, backbone, ball-and-stick, line, spacefill, carbohydrate, surface, or putty;
- editing the region name, description, molecular representation, color mode, color, opacity, visibility, label, and tooltip behavior;
- reviewing, reordering, selecting, or deleting annotation regions before export;
- applying the generated YAML back to the same Mol* scene as a publication-path preview;
- checking chain identifiers and author-versus-label residue numbering;
- loading an aligned FASTA file and finding ranked reference candidates for each structure chain;
- confirming the `msa.references` mapping and testing selection synchronization in both directions;
- exporting a YAML that can be supplied directly to the Builder or a publication `figureN/` folder.

Only the structure is required in the editor. The YAML and MSA are optional starting inputs. Existing YAML regions remain editable, while a structure loaded without YAML starts with an empty region list and a visible base representation. All editing and export operations remain local to the browser, and original files are never overwritten.

### Publication page

A publication folder such as `figure1/` is intended to represent one figure or supplementary analysis. It should:

- load all required hosted files automatically;
- show the paper and figure title when appropriate;
- hide author-oriented file selection controls;
- retain reload and download functions for readers;
- work without requiring any action before the structure appears.

For publication pages, automatic loading must remain enabled and all configured file paths must resolve to real files.

## Creating a new protein structure figure

1. Duplicate a working publication folder and rename it with the next figure number or a descriptive identifier.
2. Keep the folder inside `protein-viewer/` so its references to the shared files remain valid.
3. Replace the example structure with the final PDB or mmCIF file.
4. Add a YAML annotation file describing the displayed regions. This file may be written manually or generated from Mol* selections in `protein-viewer/editor/`.
5. Add an aligned FASTA file when the figure includes an MSA.
6. Update the figure's `config.js` with the final title and relative input paths.
7. Confirm that every annotated chain and residue exists in the structure.
8. Confirm that the intended alignment sequences are linked to the correct structure chains.
9. Test the figure through a local HTTP server.
10. Add the figure folder to the root `manifest.js` so it appears on the EvoSupplement portal.

The reusable `index.html`, `shared/app.js`, and `shared/styles.css` files normally do not need figure-specific edits.

## Configuration reference

Each figure reads its settings from `config.js`.

| Field | Purpose |
|---|---|
| `title` | Browser tab title and internal page title. |
| `subtitle` | Optional explanatory subtitle, mainly useful on the editor page. |
| `paperTitle` | Citation or paper title shown above a publication viewer. Leave blank to hide it. |
| `figureTitle` | Figure number and description shown above a publication viewer. Leave blank to hide it. |
| `autoLoad` | Controls whether the hosted inputs load when the page opens. This should normally be enabled for publication pages. |
| `pdbUrl` | Relative path to the PDB, ENT, CIF, or mmCIF structure file. |
| `yamlUrl` | Relative path to the YAML region annotation file. Required for publication pages; optional in the editor, where a new YAML can be generated from Mol* selections. |
| `msaUrl` | Optional relative path to an aligned FASTA file. Leave blank when no MSA is required. |
| `defaultLayout` | Initial Mol* interface layout. |

All relative paths are interpreted from the figure's `index.html`.

## Available Mol* layouts

| Layout value | Initial interface |
|---|---|
| `canvas` | Three-dimensional canvas only. This is the usual publication default. |
| `sequence` | Sequence panel and three-dimensional canvas. |
| `controls` | Mol* controls and three-dimensional canvas. |
| `sequence-controls` | Sequence panel, controls, and three-dimensional canvas. |
| `full` | Full Mol* interface. |

Choose the smallest layout that supports the intended scientific interpretation. A focused supplementary figure usually benefits from `canvas`, while method-oriented or exploratory pages may use a more complete layout.

## Structure input

Supported structure formats are:

- PDB;
- ENT;
- CIF;
- mmCIF.

The format is detected from the filename and content. Structure files are limited to 50 MB in the current viewer.

Before publication:

- confirm the chain identifiers used by the structure;
- confirm whether the YAML should use author numbering or label numbering;
- preserve ligands and non-standard residues only when they are relevant to the figure;
- use stable, concise, case-sensitive filenames;
- state the structure source and accession in the paper or figure description.

The guidance in `editor/pdb/README.md` provides additional file-handling notes.

## YAML annotation input

The YAML file defines what the viewer highlights and how each highlighted region is rendered. It can be written manually, loaded and edited in the Protein Structure and MSA Editor, or generated from residue selections made directly in Mol*. The complete format is documented in [editor/annotations/README.md](editor/annotations/README.md).

### Generating the YAML in the editor

There are two compatible authoring routes.

#### Capture the current residue selection

1. Load the structure. An existing YAML is optional.
2. Use Mol* Selection Mode at residue granularity and select one residue, an interval, or a non-contiguous set. Mol* additive selection can be used for multiple residues.
3. Click **Capture selection** in the annotation editor.
4. Name the annotation and choose its representation, color mode, opacity, component visibility, tooltip, and optional 3D label.
5. Save the annotation. Selections using the same residue positions on equivalent chains become one region with multiple chains; chain selections with different residue sets are exported as separate compatible regions.

#### Import a component created in Mol*

1. Use the native Mol* controls to create a component from a residue selection.
2. Add or choose a main representation and set its color theme, uniform color when applicable, opacity, and visibility.
3. Click **Refresh components** in the **Mol* components** panel.
4. Select one or more component representations and click **Import selected**, or import an individual row.
5. Review the resulting YAML regions in the normal annotation list and use **Edit** when the imported name or styling needs adjustment.

The importer intentionally ignores the base structure and regions already generated from the current YAML. It imports the residue selection and the principal representation settings only; camera state, measurements, distances, temporary focus objects, and other non-region scene objects are not part of the protein-viewer YAML. When one native component contains several supported representations, each representation is offered as a separate importable row because version 1 of the YAML stores one representation per region.

For either route, use **Apply preview** to rebuild the scene through the same YAML parser and MolViewSpec path used by publication pages, then download the generated YAML for the Builder or a `figureN/annotations/` folder.

The current YAML schema represents integer author or label residue positions. A selected residue with a PDB insertion code remains selectable in Mol*, but the editor reports that the exported region uses the corresponding integer author position because the version-1 schema has no separate insertion-code field.

### Main annotation sections

| Section | Purpose |
|---|---|
| `version` | Annotation format version. The current format uses version 1. |
| `title` | Name of the annotated structural scene. |
| `numbering` | Residue numbering system: author numbering or label numbering. |
| `default_chain` | Chain or chains used for the translucent base structure. |
| `viewer` | Defaults shared by all annotated regions. |
| `regions` | List of domains, motifs, sites, interfaces, or other selected regions. |
| `msa.references` | Optional mapping between structure chains and aligned FASTA sequence identifiers. |

### Region selection

Each region should use one selection method:

- an inclusive start-to-end residue range;
- a list of exact residue positions;
- one individual residue.

A region should explicitly identify its chain or chains. YAML keys are case-sensitive, and a misspelled or incorrectly capitalized chain field may cause a selection to apply more broadly than intended. The viewer reports unrecognized keys, but scientific validation remains the author's responsibility.

### Common region properties

| Property | Purpose |
|---|---|
| `name` | Human-readable region or component name. |
| `chain` or `chains` | Structure chain selection. |
| `start` and `end` | Inclusive residue range. |
| `positions` | Explicit list of residues. |
| `residue` | Single residue selection. |
| `numbering` | Optional region-specific numbering override. |
| `color` | Uniform region color. |
| `component_representation` | Molecular representation used for the region. |
| `component_color_theme` | Mol* color theme applied to the representation. |
| `component_opacity` | Initial transparency from fully transparent to fully opaque. |
| `component_visible` | Initial component visibility. |
| `tooltip` | Enables descriptive hover information. |
| `label` | Enables a persistent three-dimensional label. |
| `description` | Additional explanatory text for the region. |

Values defined under `viewer` act as defaults and may be overridden by individual regions.

## Molecular representations

The current viewer accepts these region representations:

- cartoon;
- backbone;
- ball and stick;
- line;
- spacefill;
- carbohydrate;
- molecular surface;
- putty.

Use representations consistently within a figure. Domains may be shown as cartoons or surfaces, while catalytic residues or ligands may be clearer as ball-and-stick components.

## Color themes

The viewer supports Mol* color themes and several convenient aliases. Common choices include:

| Theme | Typical use |
|---|---|
| Uniform | Author-defined colors for domains, motifs, and functional sites. |
| Element symbol | Atom-based coloring for residues and ligands. |
| Chain ID | Distinguishing chains or subunits. |
| Residue name | Comparing residue chemistry. |
| Secondary structure | Distinguishing helices, sheets, and coil regions. |
| Sequence ID | Showing progression along the sequence. |
| Hydrophobicity | Highlighting physicochemical patterns. |
| pLDDT confidence | AlphaFold-style confidence coloring from B-factor values. |
| Illustrative | Stylized Mol* presentation for publication-oriented scenes. |

The base structure is a separate contextual component with its own name, color, and opacity settings.

## Linking a multiple sequence alignment

The MSA input must be an aligned FASTA file. All records must represent the same alignment length after gaps are included.

A sequence becomes linked to a structure chain only when the YAML annotation declares the relationship under `msa.references`. The declared reference must match either the FASTA sequence identifier or the complete FASTA header. This declaration is treated as an author-confirmed biological relationship rather than a hypothesis inferred by the viewer. In the editor, **Find best references** ranks candidate FASTA records for every observed structure chain using exact-slice detection followed, when needed, by the same permissive shared-segment alignment used by the viewer. The author reviews the proposed rows and applies the final mapping before export.

For each declared chain-reference pair, the viewer:

1. extracts the amino acid sequence represented by residues present in the structure chain;
2. finds the selected FASTA record and removes its gaps while retaining the original MSA-column coordinates;
3. accepts a direct match when either sequence is an exact slice of the other;
4. otherwise performs a permissive affine-gap local alignment to find the best shared segment anywhere in either input;
5. uses the best shared segment without imposing an identity threshold or trimming correctly aligned boundary residues.

The two inputs do not need to have the same length. Either input may be a slice, both may be partially overlapping slices, and the structure may contain terminal tags, linkers, plasmid-derived residues, missing loops, substitutions, or other residues absent from the reference. Internal gaps are retained in the mapping, while the local alignment is designed to leave unrelated tags, linkers, and non-overlapping slice overhangs outside the shared segment. Completely disjoint slices cannot be linked because they contain no shared sequence information.

Numbering discontinuities in coordinate files are represented internally as unmapped placeholders instead of being silently concatenated away. For mmCIF input, the viewer uses polymer `label_seq_id` positions whenever they are available; for PDB input, it falls back to author residue numbering and insertion codes. Placeholders help keep observed residues on both sides of an unresolved loop registered to the reference, but they never create a selectable structural residue.

The mapping deliberately trusts `msa.references`. A low-identity mapping may generate a console warning, but it remains active; choosing the biologically correct reference is the figure author's responsibility.

Interaction is bidirectional and column-centered:

- clicking any sequence row selects that MSA column, not that row's amino acid as a direct structural reference;
- a normal click replaces the previous selection, **Ctrl/Cmd-click** adds or removes individual columns, and **Shift-click** selects the inclusive range from the current anchor column;
- all selected columns remain highlighted across all sequences until they are toggled off, replaced, or **Clear selection** is pressed;
- every linked reference cell receives a stronger highlight, while the most recently active column has an additional outline;
- Mol* receives every mapped structural residue represented by the selected columns; reference gaps and residues absent from the loaded structure remain selected only in the MSA and never create an incorrect structural selection;
- selecting multiple residues in Mol* highlights every corresponding homologous MSA column, scrolls to the most recently active mapped position, and reports how many selected residues were mapped;
- structure residues from tags, linkers, plasmid-derived segments, or otherwise outside the mapped reference overlap remain selected in Mol* but do not create a false MSA highlight;
- **Clear selection** clears the complete multi-selection in both the MSA and Mol*.

The MSA is rendered as a virtual viewport, so zoom no longer shrinks merely because the alignment has many columns. Cell size can be increased from 4 to 72 pixels, letters scale with the cells, and the horizontal and vertical scrollbars remain thick and easy to drag. Sequence names retain exactly the same row height as their aligned residues at every zoom level.

Before publication, verify that each YAML chain points to the intended FASTA reference and inspect several known residues in both interaction directions.

## Browser-side limits

| Input or operation | Current limit |
|---|---|
| Structure file | 50 MB |
| YAML annotation | 2 MB |
| Aligned FASTA | 5 MB |
| MSA sequences | 500 |
| MSA columns | 20,000 |
| Annotated regions | 1,000 |
| Positions in one region | 5,000 |
| Generated Mol* components | 250 |
| Residue selector expressions | 25,000 |

These limits protect the browser from accidental oversized inputs. A normal supplementary figure should remain well below them.

## Reader controls and downloads

Depending on the page template and selected layout, readers may be able to:

- rotate, zoom, and inspect the structure;
- use Mol* sequence or control panels;
- inspect labels and tooltips;
- select linked MSA residues in either direction between the MSA and Mol*;
- change MSA zoom from 4 to 72 pixels while keeping every sequence name vertically synchronized with its alignment row;
- navigate large alignments with persistent, enlarged horizontal and vertical scrollbars;
- reload the hosted inputs;
- download the structure file;
- download the YAML annotation;
- download the aligned FASTA file.

Keeping source files downloadable is important for transparency and reuse.

## Shared files and versioning

All protein figures use the same files in `shared/`. A bug fix or interface improvement applied there affects every protein figure.

When the shared JavaScript or CSS is updated, maintainers should ensure that every figure page references the same current asset version so browsers do not retain an incompatible cached copy. This is a framework-maintenance task, not a normal paper-authoring task.

## Local testing

Serve the repository root through HTTP and access the figure through the root portal or its full site path. Direct filesystem access may block structure, YAML, or FASTA loading.

Test at least:

- automatic loading;
- structure parsing;
- chain and residue selections;
- region colors and representations;
- labels and tooltips;
- MSA rendering and chain mapping;
- source-file downloads;
- narrow and wide browser windows;
- the final portal link from `manifest.js`.

## Troubleshooting

| Symptom | Likely cause or check |
|---|---|
| The publication page opens but remains empty | Automatic loading is disabled, or one of the configured input paths is invalid. |
| The structure loads but annotations do not | The YAML path is wrong, the YAML is invalid, or residue numbering does not match the structure. In the editor, load only the structure and rebuild the regions from Mol* selections when appropriate. |
| Capture selection remains empty | Confirm that Mol* Selection Mode is enabled at residue granularity and that residues, rather than only the empty canvas, are selected. |
| The reference finder proposes the wrong FASTA row | Suggestions are rankings, not biological decisions. Choose the intended record manually before applying `msa.references`. |
| A region appears on every chain | The chain field is missing, misspelled, incorrectly capitalized, or does not use the expected numbering convention. |
| A region is absent | The selected chain or residue numbers do not exist in the loaded structure. |
| The figure is unstyled | The shared stylesheet path or filename capitalization is incorrect. |
| Mol* does not appear | The shared application file did not load, or the page template and shared application versions are incompatible. |
| The MSA appears but a reference is not linked | The chain is absent from `msa.references`, the FASTA identifier or complete header does not match, the declared chain is absent from the loaded structure, or the two slices contain no shared sequence segment. |
| The MSA is slow or rejected | The alignment exceeds the browser-side size, sequence-count, or column limit. |
| pLDDT coloring looks incorrect | The structure does not store confidence values in the B-factor field or is not an AlphaFold-style model. |
| A hosted file works locally but not after deployment | Check case-sensitive filenames, relative paths, and hosting size limits. |

Browser console warnings provide additional detail for invalid keys, missing references, and failed MSA mappings.

## Figure publication checklist

- The structure source and accession are documented.
- The structure filename and configured path match exactly.
- The annotation uses the correct residue numbering system.
- Every region identifies the intended chain or chains.
- Colors, labels, and representations match the figure legend.
- The base structure provides context without obscuring highlighted regions.
- The MSA is genuinely aligned and uses stable sequence identifiers.
- Every declared MSA reference maps to the intended structure chain.
- The publication page loads without local file selection.
- Structure, YAML, and FASTA downloads work.
- Figure numbering and wording match the manuscript.
- The root manifest links to the correct figure folder.

## Current template note

The `editor/` folder contains functional example data and the visual YAML-authoring interface. The existing `figure1/` configuration is a publication template and currently refers to placeholder structure and annotation filenames. Replace those paths and files before using it as a real supplementary figure.
