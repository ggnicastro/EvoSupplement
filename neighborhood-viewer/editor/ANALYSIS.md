# Neighborhood analysis workspace

Analysis is available only in the Neighborhood **editor**. Published figure pages do not load the analysis interface, worker, or statistical code. All input processing and calculation take place in the browser; no annotation file is sent to a service.

## Quick start

1. Load a standard neighborhood TSV or compact architecture input, with optional rename and color YAML files.
2. Set the viewer's continuity and text filters, then open **Analyze neighborhoods**.
3. Choose **Neighborhoods** (filtered or all loaded), **Minimum Jaccard** (default **0.33**), and **Community algorithm** (Louvain or Leiden-style refinement).
4. Click **Run analysis**. Computation runs locally in a cancellable worker. Earlier results remain available if a run fails.
5. Read the community cards: **Community 1: A, B, G**, for example. These are connector domain IDs, not neighborhood IDs. **Show neighborhoods** filters the viewer to the analyzed members of that community. **Clear selection** restores the previous viewer filters.
6. **Save analysis JSON** preserves the input snapshot, settings, memberships, scores and results. **Export results ZIP** includes a simple community list as well as complete tables. The existing package ZIP also includes the analysis session.

The main result does not list individual neighborhoods. Their identities and edge scores remain in the saved analysis and exports for filtering and reproducibility. Isolated neighborhoods remain saved but do not generate connector lists. Search and pagination apply to the community cards. Network drawings, individual neighborhoods, order patterns and alternative-domain tables are available under the collapsed **Detailed results** section.

**Advanced settings** contains **Minimum shared domains per edge** (default 2, configurable upward), resolution (default 1), random seed (42), iteration limit (20), domain identity, query exclusion, overlap handling and work limits. Every new run requires at least **two distinct composition domains** per neighborhood after marker/unknown removal and any query exclusion. The minimum can be increased but not lowered below two. Repeated copies of one domain do not qualify. TM/TMS and SIG/SIF identifiers, configured marker features and unknown annotations such as `?` never count toward this minimum. The rule is enforced in the computational core, including reruns of older sessions. Query domains are included by default; query exclusion is explicit. Optional alternative-domain tests are off by default. Existing continuity filters still determine which genes enter an analysis observation, but gene strand and order do not affect presence Jaccard.

The editor must be served over local HTTP or a hosted site for its worker to run reliably. Opening the HTML as a `file:` URL can block workers. No calculation silently falls back to an unresponsive main-thread run.

## Select connector domains for color curation

Each connector has a checkbox. **Select all connectors** selects every connector in that community. Selections are shared across communities: checking the same domain in one card checks its other occurrences, and each original domain ID is added only once. Pending selections remain available across community search and pagination.

Click **Add selected to color list** to mark those domains as **Include this domain in color YAML** in the existing Domain curation panel. The panel opens so you can adjust the colors. Existing colors, renames, and other selected domains are preserved. Unchecking a connector or using **Clear connector selection** only clears the pending analysis selection; it never removes a previously selected color. A successful addition clears the pending checkboxes.

In renamed-group analysis, selecting a connector adds its supporting original domain IDs from the analyzed observations. The checkbox tooltip lists those IDs. Only the current matching input can receive additions; stale or archived results for another input cannot update its color list. The complete selection is validated before any changes are applied. Curation's own search and frequency-scope filters can hide already-added domains; choose **All loaded data** or clear the domain search to inspect them. YAML color export retains the applied selections across the whole input.

Changing colors alone does not change the Jaccard input or invalidate its communities. Data, renames, continuity/text filters and analysis parameters still require a new analysis. Older analysis fingerprints that included display colors remain readable. Connector checkboxes are temporary UI selections and are cleared on a new run or session import. Use the curation YAML/package downloads to save the applied colors. This workflow does not assign network Function groups or export a network-node YAML.

## Input, scope and observation units

Both scopes apply the current query-centered direction and distance rules. **All loaded neighborhoods** bypasses Include / Exclude only. The analysis selection itself never changes either analysis scope. An all-data selection can therefore include representatives hidden by the viewer's Include / Exclude filters; the selection message reports the number actually visible.

Each query-connected segment is initially one observation, even if it contains multiple queries. Negative-strand query neighborhoods are reversed so that queries point right; the first query after orientation anchors the positions. The domain order within a protein remains its N-to-C order. Genes with another query are retained and identified. A segment with no query is excluded and reported. Divergent query orientations are reported and use the explicitly recorded fallback anchor.

Exact duplicated loci are collapsed. By default, overlapping genomic regions use one deterministic representative per connected overlap component; an advanced option retains non-identical overlaps. Representative choice first favors observations that meet the minimum-domain threshold, then the implemented query/domain/gene ordering. Source links remain in the result. Statistics and default result selections use the representative, because overlapping source rows can have different annotations. A separately labelled button can inspect all linked source rows. Deduplication is not a correction for related strains or phylogeny.

Compact input preserves ordered genes. Synthetic compact coordinates are not treated as measured base-pair distances or evidence of physical overlap. Unannotated genes remain unknown positions in order patterns. Fixed marker features are excluded from domain composition according to the analysis core's marker handling. A missing annotation does not establish biological absence.

**Exclude query genes** removes every query gene from composition and alternative-domain presence tests, while retaining query genes in order patterns and context. It does not globally remove a domain merely because another query protein contains that domain.

## Similarity, communities and connectors

New runs use **binary presence Jaccard**: the number of shared domain identities divided by the number of distinct identities across both neighborhoods. Repeated copies, gene order and strand do not change this score. Original domain IDs are the default; advanced renamed-group mode merges identical display labels before comparison and retains the original-ID mapping.

Each analyzed neighborhood is a network node. A pair forms one undirected edge only if **both** conditions pass: Jaccard is **greater than or equal to** the threshold (default 0.33), and the two neighborhoods share at least **two distinct composition domains**. The shared-domain minimum can be increased under **Advanced settings** but cannot be lowered below two for a new run. Edges are weighted by Jaccard; this additional criterion does not change the similarity formula. Shared identities are counted after removal of unknowns/markers, optional query exclusion and the selected raw-ID or renamed representation. Repeated copies do not increase shared-domain count. For example, `{nPUA, BpsA_C}` and `{nPUA, Mrr_cat}` have Jaccard 1/3 but share only one domain, so they do not form an edge. Scores are not rounded before thresholding. **All qualifying edges are retained**, without top-neighbor pruning. The processing summary separately counts pairs that pass Jaccard but fail the shared-domain minimum; they are not classified as top-K omissions. Comparison and edge budgets stop the run with an explanation rather than returning a partial graph.

The selectable algorithms are:

- **Louvain:** multilevel weighted modularity optimization.
- **Leiden-style refinement:** local moving, connected refinement and multilevel aggregation, using the existing Network Viewer implementation. This is a connectivity-refined variant, **not the full stochastic reference Leiden implementation**; the interface and provenance identify it accordingly.

Both expose resolution, seed and iteration limit. Community membership is reproducible for the same normalized data, parameters and implementation. Members of one community need not all exceed the threshold with every other member: the threshold controls individual edges, while community detection partitions the whole weighted graph.

A **connector domain** is shared by both endpoints of at least one edge internal to a community. The saved result records its number of supporting internal edges, number of distinct supporting neighborhoods, and those neighborhood identities. A domain found only in one neighborhood is not a connector. Shared domains supporting only cross-community edges do not enter either community's connector list on that basis. The same domain may connect more than one community. Connectors do not need to occur in every community member, and the list is distinct from the inventory of all domains in that community.

Communities with fewer than two connector domains are omitted from the simple list; all neighborhoods, including isolates and any singleton communities, remain in the saved results. Selecting a card shows its analyzed representative neighborhoods. Overlap-linked source rows remain available in detailed results and exports.

Legacy sessions retain their recorded count-weighted or presence similarity, connected-components/label-propagation grouping, and top-K pruning. The simple connector list is reconstructed from their saved internal edges and labelled as a legacy result. Loading a session does not reinterpret it as a new complete-threshold analysis. Older sessions without the shared-domain parameter retain their historical edges for inspection and are labelled accordingly. Rerunning them enforces a minimum of two shared domains. New JSON sessions store this parameter and each edge's distinct shared-domain count; import checks those counts against the saved compositions.

The optional network drawing shows at most 200 nodes and 800 links and reports that display limit. It does not change the computed graph or community memberships. Circular positions carry no biological meaning.

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
- `communities.txt` and `communities.tsv`: simple community-to-connector lists, with no neighborhood ID lists.
- `groups.tsv` and `similarity-links.tsv`: complete community membership, all-domain inventories, connector support and retained links. New link tables include `shared_domain_count`.
- `order-*.tsv`: complete and local order patterns with membership, counts and occurrences.
- `alternative-domains.tsv`: contingency counts, support, p/q values, effect measures and context-assessment status.
- `domain-mapping.tsv`: analysis features mapped to original IDs and display labels.

TSV exports escape fields and prefix spreadsheet-formula-like text with an apostrophe. JSON preserves exact strings. Saving results is explicit; the browser warns before leaving with an unsaved analysis.
