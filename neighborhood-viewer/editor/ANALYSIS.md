# Neighborhood analysis workspace

Analysis is available only in the Neighborhood **editor**. Published figure pages do not load the analysis interface, worker, or statistical code. All input processing and calculation take place in the browser; no annotation file is sent to a service.

## Quick start

1. Load a standard neighborhood TSV or compact architecture input, with optional rename and color YAML files.
2. Set the viewer's direction, intergenic-distance, Include, and Exclude filters.
3. Expand **Analyze neighborhoods**. Choose **Current filtered view** or **All loaded neighborhoods**, original domain IDs or renamed groups, and a similarity method.
4. Choose **Run analysis**. Results are calculated explicitly, in a worker, with progress and Cancel. Cancelling or encountering a calculation error retains earlier results.
5. Explore **Overview**, **Similarity network**, **Order patterns**, and **Alternative domains**. Tables show 20 results per page and have search and sorting. Select a result to inspect its representative neighborhoods in the viewer below; **Clear selection** restores the viewer's original filtered rows.
6. Use **Save analysis JSON** for a reopenable session, or **Export results ZIP** for the complete session and tabular outputs. The existing **Download package ZIP** also includes `analysis-session.json` when an analysis is available.

The editor must be served over local HTTP or a hosted site for its worker to run reliably. Opening the editor HTML directly as a `file:` URL can block workers; the interface explains this instead of falling back to an unresponsive computation on the page.

## Input, scope and observation units

Both scopes apply the current query-centered direction and distance rules. **All loaded neighborhoods** bypasses Include / Exclude only. The analysis selection itself never changes either analysis scope. An all-data selection can therefore include representatives hidden by the viewer's Include / Exclude filters; the selection message reports the number actually visible.

Each query-connected segment is initially one observation, even if it contains multiple queries. Negative-strand query neighborhoods are reversed so that queries point right; the first query after orientation anchors the positions. The domain order within a protein remains its N-to-C order. Genes with another query are retained and identified. A segment with no query is excluded and reported. Divergent query orientations are reported and use the explicitly recorded fallback anchor.

Exact duplicated loci are collapsed. By default, overlapping genomic regions use one deterministic representative per connected overlap component; an advanced option retains non-identical overlaps. Representative choice first favors observations that meet the minimum-domain threshold, then the implemented query/domain/gene ordering. Source links remain in the result. Statistics and default result selections use the representative, because overlapping source rows can have different annotations. A separately labelled button can inspect all linked source rows. Deduplication is not a correction for related strains or phylogeny.

Compact input preserves ordered genes. Synthetic compact coordinates are not treated as measured base-pair distances or evidence of physical overlap. Unannotated genes remain unknown positions in order patterns. Fixed marker features are excluded from domain composition according to the analysis core's marker handling. A missing annotation does not establish biological absence.

**Exclude query genes** removes every query gene from composition and alternative-domain presence tests, while retaining query genes in order patterns and context. It does not globally remove a domain merely because another query protein contains that domain.

## Similarity and groups

- **Jaccard** uses domain presence: intersection size divided by union size.
- **Count-weighted Jaccard** uses domain occurrence counts: the sum of per-domain minimum counts divided by the sum of per-domain maximum counts. Repeated copies within one protein count separately.
- Renamed-group mode merges identical display labels before calculation. Exported domain mappings retain the original IDs.
- Composition similarity and order similarity are separate results. Order similarity compares sets of annotated adjacent-gene signatures, preserving gene boundaries and orientations.
- Links must pass the threshold and the per-node strongest-neighbor rule. The retained graph is the **union** of each node's strongest links, so incoming selections can make a node's final degree larger than the configured neighbor count.
- Groups are either connected components or deterministic label-propagation groups of the retained sparse graph. They depend on the similarity threshold and sparsification settings; a connected component need not contain only mutually high-scoring pairs.

The network drawing shows up to 200 nodes and 800 links and reports the displayed counts. Choose a group to inspect a smaller part. Its circular position has no biological meaning. All computed nodes, groups and retained links are available in tables and exports. Nodes are keyboard-focusable and Enter/Space selects them.

## Gene order

Complete patterns, adjacent pairs, gene triplets and windows around queries retain gene boundaries, query labels, relative strand, and unknown genes. The primary count is distinct representative observations containing the pattern; the same observation counts once even if a local pattern repeats. Exports also report the number of occurrences. Frequency uses all included analysis observations as its denominator. Multiple queries can contribute distinct windows without duplicating the observation's presence in a pattern.

## Candidate alternative domains

For each eligible domain pair, the analysis counts A only, B only, both, and neither. Support and expected-coexistence thresholds define the tested family of pairs. It calculates a one-sided Fisher exact test for depletion, then Benjamini–Hochberg adjustment across **all eligible tested pairs**, before screening for coexistence fraction and maximum adjusted p-value. Coexistence fraction is `both / min(support_A, support_B)`. Thus, candidates may include exceptions rather than requiring perfect exclusion.

The default maximum adjusted p-value is 1, which keeps an exploratory list; a value such as 0.05 provides a stricter screen. A small adjusted p-value is not evidence of evolutionary direction or functional equivalence. Tests assume independent observations; shared ancestry, sampling bias, annotation quality, and neighborhood boundaries affect their interpretation.

An optional metadata field and exact value restrict the alternative-domain cohort. The other analysis views still use the selected neighborhood scope. This is cohort selection, not a phylogenetic correction or a combined stratified test. Selecting a similarity-group cohort can introduce circularity because the groups may depend on the same candidate domains.

Context is assessed separately from significance. Stronger evidence requires the same position relative to the query, compatible strand and annotated flanks, and matching ordered context after masking the candidate identities. Domain slots inside a protein remain ordered. Results distinguish a carrier-gene alternative from an alternative domain within a shared protein architecture. Context counts are matched context templates, not independent pairs of samples; support counts and linked observations are available for inspection. Unknown flanks do not establish a context match.

For large candidate lists, the strongest 500 candidates receive context assessment by default. This limit can be raised under **Work limits for large projects**. Other candidates keep their full counts, p-values and q-values and are explicitly marked **Not assessed (limit)**. They are not shown as having zero context support. The multiple-testing correction includes the entire eligible tested family.

## Large projects and reproducibility

Advanced work limits control similarity comparisons, retained links, eligible alternative-domain tests, and context assessments. Exceeding a comparison or link budget stops the calculation with a message; it does not silently return a partial graph or partial multiple-testing correction. Raising limits can substantially increase memory and running time. Cancel terminates the worker.

Data, rename, filter, or parameter edits visibly mark earlier results stale. Stale results can be reviewed and exported with their original snapshot, but cannot select current neighborhood rows. Presentation changes and temporary analysis selection do not make results stale.

A saved analysis JSON contains a schema version, exact input snapshot, options, computed results, mappings, processing summary, and a content fingerprint. Reloading it checks nested references and counts before replacing existing results. Selection is enabled only if the entire normalized snapshot content matches the current editor data and filters; transient load IDs are remapped to the current rows. A different dataset can still be inspected as an archived result, with selection disabled. The JSON is an analysis session, not a Builder Save state ZIP; it does not automatically add analysis results to a publication figure or restore viewer input files.

The results ZIP includes:

- `analysis-session.json`: snapshot, settings, provenance and complete computed results.
- `neighborhoods.tsv`: analysis observations, composition counts and source links.
- `groups.tsv` and `similarity-links.tsv`: all computed groups and retained links.
- `order-*.tsv`: complete and local order patterns with membership, counts and occurrences.
- `alternative-domains.tsv`: contingency counts, support, p/q values, effect measures and context-assessment status.
- `domain-mapping.tsv`: analysis features mapped to original IDs and display labels.

TSV exports escape fields and prefix spreadsheet-formula-like text with an apostrophe. JSON preserves exact strings. Saving results is explicit; the browser warns before leaving with an unsaved analysis.
