# Multi-Structure Comparison Viewer

The Multi-Structure Comparison Viewer presents several independent Mol* scenes in one responsive grid. It is adapted from the uploaded MVT project and follows the EvoSupplement `shared/`, `editor/`, and `figureN/` organization.

## Directory structure

```text
multi-structure-viewer/
├── shared/
│   ├── multi-structure-viewer.js
│   └── styles.css
├── editor/
│   ├── index.html
│   ├── config.js
│   ├── editor.js
│   └── vendor/
├── figure1/
│   ├── index.html
│   └── config.js
├── sample/
│   ├── molx/
│   └── structures/
└── MVT-LICENSE.txt
```

## Editor

Open `editor/` through an HTTP server. The editor can:

- choose any practical panel count from 2 to 64;
- load one `.molx` snapshot per panel;
- attach an optional PDB or mmCIF file for reader download;
- edit panel labels and focused Mol* layouts;
- choose the initial grid;
- position structures independently;
- switch **Synchronize cameras** on after positioning, so subsequent rotation, pan, and zoom are applied relatively to every loaded panel;
- choose whether the published figure starts synchronized;
- export a definition JSON or a publication package ZIP.

The synchronization mode preserves the current camera of every panel when it is enabled. The panel where the next mouse interaction begins becomes the driver. Its subsequent camera delta is applied to the other panels rather than replacing their absolute camera snapshots.

## Publication package

The editor exports:

```text
multi-structure-publication.zip
├── multi-structure.json
├── molx/
├── structures/          # optional
├── README.txt
└── MVT-LICENSE.txt
```

Use this ZIP as the input for the **Multi-Structure Comparison Viewer** item in EvoSupplement Project Builder. The panel count is fixed by the package; readers cannot add or remove panels in the published figure.

## Figure

The publication page automatically loads the configured scenes. Readers can:

- switch the grid layout;
- expand one panel into a focused Mol* interface;
- rotate, pan, and zoom panels independently;
- enable or disable synchronized camera movement;
- download the MOLX snapshot and optional source structure when downloads are enabled.

The figure intentionally does not contain file pickers, panel-count controls, label editing, or package generation.

## Configuration

A direct figure configuration can define `files`, or it can point to a packaged definition:

```javascript
window.MULTI_STRUCTURE_VIEWER_CONFIG = {
  title: 'Structure comparison',
  editorMode: false,
  autoLoad: true,
  definitionUrl: './data/multi-structure.json',
  showDownloads: true,
  maxPanels: 64
};
```

The definition JSON contains the ordered panel list, labels, MOLX paths, optional structure paths, focused layouts, grid columns, and initial synchronization state.

## MOLX snapshots

MOLX is the primary input because it preserves the authored Mol* scene, including representations, components, colors, visibility, and the saved camera. A PDB or mmCIF file is optional and is offered only as a source-file download in this first version.

## Performance

Each panel is an independent Mol* instance. Large panel counts and complex scenes can require substantial GPU memory. The editor allows up to 64 panels but displays a warning above 12. For public figures, use only as many simultaneously loaded scenes as are scientifically useful.

## Attribution

The initial grid, focused-panel, MOLX loading, and download behavior was adapted from MVT. Its MIT license notice is preserved in `MVT-LICENSE.txt`. EvoSupplement additions include the Editor/Figure split, flexible panel authoring, publication packages, Project Builder integration, and relative camera synchronization.
