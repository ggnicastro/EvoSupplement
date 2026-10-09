# EvoSupplement Builder

EvoSupplement Builder is a browser-based project generator for creating publication-ready supplementary websites from guided forms and module-specific publication inputs.

Open `builder/` through an HTTP server, enter the paper metadata, create sections and items, attach the required files, and validate the project. Download a project ZIP for hosting or a portable ZIP that recipients can open locally without Python or Git hosting.

## Add an optional cover image

Builder 1.9.0 lets you add a **Cover image** in Project information. Choose a PNG, JPEG, WebP, GIF, or SVG file, add an accessibility description, and optionally enter a caption or credit. The published portal displays the entire image below the paper information and above the sections, preserving its aspect ratio without cropping. **Remove image** returns the portal to its original layout.

The selected image is processed locally, included in both regular and portable publication ZIPs, and preserved in **Save state** / **Load state** together with its description and caption. **Open project ZIP** restores it from a generated publication as well. The portal manifest stores the optional image as `paper.cover` with `src`, `alt`, and `caption` fields. Existing states and projects without a cover continue to work without adding one.

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
| **Download portable ZIP** | Share a publication site with a local launcher and bundled viewer libraries. | Publication validation must pass before generation. |

State ZIPs contain an `evosupplement-builder-state.json` manifest using state schema **1**, separate from the publication recipe. The schema is versioned independently of the Builder so compatible Builder versions can restore the same snapshot. Missing supported optional settings receive the current defaults. Unsupported future schemas are rejected rather than silently converted; compatibility with every future Builder version is not guaranteed.

There is no automatic saving. Save another state ZIP after making changes and keep it until you have verified restoration in the updated Builder.

## Share a portable supplement

Builder 1.8.1 includes **Download portable ZIP** with English launcher names and a Windows launch icon. Choose the **recipient’s computer**, then generate the ZIP. It contains the publication site, the appropriate launcher, and the libraries needed by the included standard EvoSupplement viewers. Recipients do not need Python, Git, or a hosted website.

To view the supplement:

1. Extract the **entire ZIP** into a folder.
2. On Windows, double-click the **Open supplement** icon. On macOS or Linux, open the launcher listed below.
3. The launcher opens the supplement in the default browser. Keep its console window open while reading; closing the window or pressing **Ctrl+C** stops the local server.

| Recipient’s computer | Launcher | Runtime |
|---|---|---|
| Windows, Intel/AMD or ARM64 | `Open supplement.lnk` (launch icon); `Open-supplement.cmd` as a fallback. | Built-in Windows PowerShell and .NET. |
| macOS, Intel or Apple Silicon | `Open-supplement.command` | System Perl at `/usr/bin/perl`; the launcher checks for its availability. |
| Linux Intel/AMD x64 | `Open-supplement` | Bundled executable; system glibc 2.34+ and a desktop terminal. |

Keep the Windows shortcut, its command file, and the supporting folders together in the extracted project. The **Open supplement** icon starts the local launcher; if the shortcut cannot be opened, run `Open-supplement.cmd` instead.

Run the launcher from the extracted folder, rather than opening `index.html` directly. Viewer data loading needs the local HTTP server. Windows and macOS may display their normal trust prompts for downloaded launchers. A managed computer may restrict launching scripts. The Windows and macOS launchers have not been exercised on those operating systems in this release; verify the package on the recipient’s platform before distributing it widely. The macOS option requires the system Perl runtime and does not install it if missing.

On Linux, the file manager may require **Allow launching** or **Run as program**, depending on the desktop. When opened outside a terminal, the launcher opens an installed desktop terminal and keeps the server attached to that window. Supported terminals include `x-terminal-emulator`, GNOME Terminal, Konsole, `xfce4-terminal`, and `xterm`. If none is available, the launcher refuses to start a hidden background server. The bundled Linux executable uses the system’s existing glibc 2.34 or later.

The first portable export that needs external viewer libraries requires internet access in the author’s browser. Successfully downloaded libraries are cached for the current Builder session and included in the exported ZIP. Recipients use those local copies. This covers the standard EvoSupplement viewer libraries; external links, remote resources in custom HTML, or remote dependencies inside imported content may still need internet. Check custom content offline before describing the entire supplement as offline.

The ordinary **Download project ZIP** remains available for static hosting. Portable export also keeps `evosupplement-project.json`, so its ZIP can be reopened through **Open project ZIP**. Use **Save state** separately to preserve an incomplete draft and its original uploads.

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

The generated ZIP includes only the shared viewer modules actually used by the project. Builder 1.9.0 includes all seven interactive modules, including the Taxonomy Sankey Viewer 1.4.1 and Multi-Structure Comparison Viewer 1.0.0.

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
- the optional project cover image, when selected;
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

Portable export may download third-party viewer libraries into the author’s browser for inclusion in the ZIP. The local launcher serves the extracted publication to the recipient’s browser on their own computer; it does not publish the supplement to the internet.

## Bundled dependency

The Builder bundles JSZip for reading and creating ZIP archives. Its license is included under `builder/vendor/JSZIP-LICENSE.md`.

Portable export includes the third-party runtime libraries needed by the selected viewers, together with their license notices. Normal project export retains the viewer templates’ existing CDN references.
