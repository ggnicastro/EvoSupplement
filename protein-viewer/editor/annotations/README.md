# YAML annotations

YAML files in this directory define the Mol* components rendered for a PDB or mmCIF structure. The format is designed to be readable, version-controlled, and easy to reuse across related proteins.


## Visual authoring in the Protein Structure and MSA Editor

The YAML can be written by hand or generated in `protein-viewer/editor/`:

1. Load a PDB or mmCIF structure. An existing YAML and aligned FASTA file are optional.
2. Either select residues and use **Capture selection**, or create a native Mol* selection component with a supported representation and use **Refresh components** followed by **Import**.
3. Review the annotation name, representation, color mode, opacity, visibility, tooltip, and optional 3D label.
4. Review and reorder the annotation list, then apply the generated YAML as a live preview.
5. Download the YAML and use it unchanged in a publication `figureN/` folder or in EvoSupplement Builder.

A continuous selection is exported as `start` and `end`; a discontinuous selection is exported as `positions`. Equivalent residue sets selected on several chains are exported as one region with `chains`, while chain-specific selections with different residue sets become separate regions. The editor uses the same parser and MolViewSpec scene builder as the publication viewer, so the preview is a compatibility check rather than a separate rendering path.

The native-component importer is deliberately limited to region-like selection components and their main representations. It reads supported representation types, the primary color theme or uniform color, opacity, and initial visibility. The base structure, YAML-generated components, camera state, measurements, distances, and transient focus objects are not imported. Components with several supported representations are offered as separate rows because each version-1 YAML region describes one representation.

## Structure–MSA references

When an aligned FASTA file is loaded, the editor can rank candidate reference records for each observed structure chain. It first checks exact slice relationships and then uses the viewer's permissive shared-segment alignment, allowing structures or references that are partial, contain terminal tags, or omit unresolved loops. The proposal is only a convenience: the author reviews the selected row before export.

The accepted relationship is written under `msa.references`, where the key is the **structure chain identifier** and the value is the FASTA sequence identifier or complete FASTA header:

```yaml
msa:
  references:
    D: pdb|8T2T|D
```

This mapping is what enables bidirectional Mol*–MSA selection in the publication viewer. It does not replace `default_chain`, which controls region defaults.

## Minimal file

```yaml
version: 1
title: My component scene
numbering: auth
default_chain: A

viewer:
  style: illustrative
  component_representation: spacefill
  component_color_theme: illustrative
  component_opacity: 0.45
  components_visible: true

regions:
  - name: Domain A
    chain: A
    start: 1
    end: 100
    color: "#2563EB"

  - name: Active-site atoms
    chain: A
    positions: [120, 155, 188]
    component_representation: ball_and_stick
    component_color_theme: element-symbol
    component_opacity: 1.0
```

The application also creates a `Base structure` cartoon (white, opacity `0.2` by default) for whole-chain context. Viewer component defaults (`component_*`) apply to the YAML regions, not to that base component — see [Base structure options](#base-structure-options) to customize it instead. When the editor starts from a structure without YAML, it intentionally uses an opaque neutral-gray base so residues are easy to inspect and select; those explicit base settings are written into the generated YAML.

> **Always set `chain` (or `chains`) explicitly on every region.** YAML keys are case-sensitive: `chain:` and `Chain:` are different keys. If the key is missing, misspelled, or wrongly capitalized, the region silently falls back to matching *every* chain in the structure instead of failing with an error. See [Unrecognized keys](#unrecognized-keys) below for how the viewer now warns about this.

## Selection forms

Use exactly one selection form per region.

### Inclusive range

```yaml
- name: Domain
  chain: A
  start: 10
  end: 80
```

### Exact positions

```yaml
- name: Catalytic residues
  chain: A
  positions: [2, 10, 22]
```

### Single residue

```yaml
- name: Catalytic lysine
  chain: A
  residue: 42
```

## Chains and numbering

Global defaults:

```yaml
numbering: auth
default_chain: A
```

Per-region overrides:

```yaml
- name: Chain B motif
  chain: B
  numbering: label
  positions: [12, 19, 44]
```

Multiple chains:

```yaml
chains: [A, B, C]
```

All chains (equivalent to omitting `chain`/`chains` entirely):

```yaml
chain: all
```

## Viewer defaults

```yaml
viewer:
  style: illustrative
  component_representation: spacefill
  component_color_theme: illustrative
  component_opacity: 0.45
  components_visible: true
  background: "#FFFFFF"
  create_components: true
  show_labels: false
  show_tooltips: true
```

A region inherits these values and may override any `component_*` property.

### Base structure options

The automatic whole-chain context component can also be customized from `viewer:`:

```yaml
viewer:
  base_component_name: Base structure
  base_color: "#FFFFFF"
  base_opacity: 0.20
```

These three properties affect only the base component, not the YAML regions. Its representation is always `cartoon` and it always has hydrogens hidden — those two aspects are not configurable.

## Region styling

Uniform color shorthand:

```yaml
- name: Blue domain
  chain: A
  start: 1
  end: 100
  color: "#2563EB"
```

Explicit component styling:

```yaml
- name: Catalytic surface
  chain: A
  start: 120
  end: 220
  component_representation: surface
  component_color_theme: uniform
  component_color: "#F97316"
  component_opacity: 0.65
  component_visible: true
```

Native element colors:

```yaml
- name: Active-site atoms
  chain: A
  positions: [44, 79, 133]
  component_representation: ball_and_stick
  component_color_theme: element-symbol
  component_opacity: 1.0
```

AlphaFold/AF3 confidence (pLDDT), read directly from the B-factor column — no extra setup needed:

```yaml
- name: Predicted model
  chain: A
  start: 1
  end: 500
  component_representation: cartoon
  component_color_theme: plddt
```

## Common region properties

| Property | Purpose |
|---|---|
| `name` | Region and component name |
| `enabled` | Include or exclude the region |
| `start`, `end` | Inclusive range |
| `positions` | Exact residue list |
| `residue` | Single residue |
| `chain`, `chains` | Chain selection override |
| `numbering` | `auth` or `label` |
| `color` | Uniform color shorthand |
| `create_component` | Create the region representation |
| `component_name` | Custom Mol* component name |
| `component_representation` | Geometry type |
| `component_color_theme` | Mol* color theme |
| `component_color` | Fixed color |
| `component_opacity` | Opacity from `0` to `1` |
| `component_visible` | Initial visibility (singular — not `components_visible`, which is the `viewer:`-level default) |
| `tooltip` | Mol* hover tooltip |
| `label` | 3D label |
| `description` | Tooltip description |

## Unrecognized keys

Every key at the top level, inside `viewer:`, and inside each region is checked against a known list. Anything else — usually a typo, like `Chain:` instead of `chain:`, or `components_visible:` instead of `component_visible:` inside a region — is **ignored, not applied**, and reported after loading:

- the browser **console** lists every unrecognized key with its exact location, for example `regions[2].Chain` or `viewer.selector`;
- the **status indicator and toast notification** switch to a warning state mentioning how many unrecognized keys were found.

Always check the console after editing a YAML file if you see this warning — an ignored key silently falls back to a default, which can be hard to notice visually (for example, an ignored `chain:` key makes a region match every chain instead of just one).

## Notes

- The structure file can be `.pdb`, `.ent`, `.cif`, or `.mmcif` — the format is detected automatically and does not need to be declared in the YAML.
- Hydrogens are hidden automatically.
- `style: illustrative` enables Illustrative defaults and post-processing.
- Explicit region properties take priority over viewer defaults.
- Overlapping regions remain independent Mol* representations and may draw geometry over the same residues.
- File names and paths are case-sensitive on GitHub Pages.
- Start from [`template.yaml`](template.yaml) for a documented example.
