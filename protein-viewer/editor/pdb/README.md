# PDB structures

Place hosted `.pdb` files in this directory and reference them from `config.js`:

```js
pdbUrl: './pdb/my-protein.pdb'
```

The matching YAML component definition normally lives in `annotations/`:

```js
yamlUrl: './annotations/my-protein.yaml'
```

## Guidelines

- Keep the PDB and YAML residue numbering mode aligned (`auth` or `label`).
- Verify chain identifiers before defining `default_chain`, `chain`, or `chains`.
- Treat filenames as case-sensitive when deploying to GitHub Pages.
- Prefer concise, stable filenames without spaces for hosted projects.
- The browser application accepts PDB files up to 50 MB.

`demo-protein.pdb` is a synthetic demonstration structure included only for interface testing. It must not be used as a scientific model or reference structure.
