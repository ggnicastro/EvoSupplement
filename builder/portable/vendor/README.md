# Libraries included in portable exports

`portable-vendor.js` runs inside the Builder when a portable ZIP is requested. It downloads the exact versions already used by the structure viewers, includes their licenses, and returns local files for the ZIP. It does not include library binaries itself.

An internet connection is required while exporting a project that uses either structure viewer. The recipient receives the downloaded files in the exported ZIP and does not need a CDN connection to load those libraries. Other viewer modules do not need these downloads. Ordinary project export is unaffected.

| Dependency | Version | Portable ZIP file | Used by |
|---|---|---|---|
| Mol* JavaScript | 5.11.0 | `vendor/molstar-5.11.0/molstar.js` | Protein, multi-structure |
| Mol* stylesheet | 5.11.0 | `vendor/molstar-5.11.0/molstar.css` | Protein, multi-structure |
| Mol* MIT license | 5.11.0 | `vendor/molstar-5.11.0/LICENSE` | Protein, multi-structure |
| js-yaml JavaScript | 5.4.1 | `vendor/js-yaml-5.4.1/js-yaml.umd.min.js` | Protein |
| js-yaml MIT license | 5.4.1 | `vendor/js-yaml-5.4.1/LICENSE` | Protein |

Sources are pinned to `https://cdn.jsdelivr.net/npm/molstar@5.11.0/` and `https://cdn.jsdelivr.net/npm/js-yaml@5.4.1/`. The exact URLs are exported through `EvoSupplementPortableVendor.assets` and written to `vendor/THIRD-PARTY.json`, together with byte sizes and SHA-256 hashes when the browser provides Web Crypto. Hashes record the actual included files; they are not predeclared integrity attestations. Any CSS assets bundled as data URLs are also recorded.

Upstream repositories:

- [Mol*](https://github.com/molstar/molstar/tree/v5.11.0)
- [js-yaml](https://github.com/nodeca/js-yaml)

## Integration

Load `portable-vendor.js` as a classic script before the Builder script. Call:

```js
const files = await window.EvoSupplementPortableVendor.collect(
  ['protein', 'multistructure'],
  ({ completed, total, label }) => updateProgress(completed / total, label)
);
for (const file of files) zip.file(file.path, file.bytes);
```

Each returned file has `path`, `bytes` (`Uint8Array`), and `mime`; downloaded files also have `sourceUrl`. The progress callback receives `completed`, `total`, `path`, and `label`. `collect` accepts a kind string or an iterable of kinds. Only `protein` and `multistructure` trigger downloads. Other module kinds return an empty array without network requests.

Replace the corresponding CDN script/stylesheet URLs in exported viewer HTML using the fixed mappings in `assets`. Remove CDN preconnect tags. Viewer pages one directory below their module use `../../vendor/...` to reach these files.

The entire collection must succeed before generating the ZIP. Failed downloads, HTML error responses, invalid script/license payloads, and unsupported external CSS references stop export with an error. Successful downloads are cached in memory for the Builder tab. Failed requests are discarded so a later export can retry. CSS `url()` references inside the same pinned package are downloaded and embedded; `@import`, escaped URL syntax, and references outside the pinned package stop export for manual review.

## Offline scope

Bundling the viewer libraries covers local PDB/mmCIF, local YAML/FASTA, and MOLX scenes whose required assets were embedded when saved. It does not download arbitrary URLs inside uploaded HTML, configuration, or Mol* snapshots. External links, remote data services, volume streaming, and incomplete MOLX snapshots may still need internet. A portable package should be tested with its actual data and external network requests disabled before distributing it as fully offline.

The build environment used for this change could not retrieve the CDN binaries (HTTP 403). No placeholder library files were substituted, and live Mol* execution was not claimed as tested. The bundler's branches, caching, validation, license inclusion, CSS embedding, and failure handling were tested with explicitly marked fixture responses.
