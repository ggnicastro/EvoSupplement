# Project Style Manager

Project Style Manager edits display names and unifies colors and supported shapes across selected module layers in a Builder **Save state** ZIP. It runs locally in the browser and exports a state that can be opened with **Load state** in the Builder.

## Compact review workflow

1. Save your current state ZIP in the Builder, then load it in **Project Style Manager**.
2. Select **Taxonomy**, **Neighborhood**, **Architecture**, and/or **Network**. Every instance of a selected layer belongs to this application group.
3. Click **Review selected layers**. The summary shows the number of names, selected modules, and unresolved styles. The editing list starts collapsed.
4. Open **Review names**. A single list contains current-to-new names, frequencies, colors, shapes, and expandable source details. It starts with the most frequent entries and 20 rows per page; 50 or 100 rows are also available.
5. Edit names and styles in the same row. **Preview changes** applies pending renames to the review, combines names with identical targets, and shows a paginated summary of name changes, merged entries, and style updates. This preview does not modify the saved project.
6. If a merged entry has conflicting colors or shapes, use **Resolve styles in list**. This returns to the same editing list with unresolved entries visible. Choose the styles, then preview again. A conflict is never resolved automatically.
7. Apply the reviewed palette. Any subsequent name, color, shape, or group-name edit requires a fresh preview before Apply becomes available. List filters do not invalidate a preview or change the application scope.
8. Download the updated state ZIP, reopen it in the Builder, and export your supplement. Applied groups can also export their color YAML, shape YAML, and latest nonempty rename plan.

Name edits temporarily disable color and shape editing until **Preview changes** refreshes the grouping. Unchanged style choices are retained; identical explicit choices can carry into merged entries. After applying, further edits start from the committed names. Applied rename plans never run again automatically.

## Finding names in a large project

- **Order:** most frequent, name A–Z, or most modules containing the entry in loaded data.
- **Frequency measure:** choose one selected layer's unit for sorting and the minimum-frequency threshold. Different biological units are never added together.
- **Search:** current names, proposed names, original identifiers, and source module titles.
- **Unresolved only:** entries still needing a color or shape choice.
- **Edited only:** entries with explicit pending name or style edits, including edits made on another page.
- **Show layer / Show module:** narrow the visible list and its frequencies. These controls do not change the selected application group.
- **Minimum frequency:** keep entries at or above the threshold in the selected frequency measure.

The preview always covers the whole selected application group, including changes hidden by list filters. Closing or returning from the preview does not apply it. **Reset name edits**, under **Rename plan and reset**, clears the pending rename plan; preview again to restore the original grouping.

Sources are built only when their details are opened and paginated in batches of 20. A merged entry with many original names shows three name editors initially and pages the remaining editors in batches of 20. Color menus show up to 100 most-used existing colors; any other hexadecimal color can be entered directly. The change preview also shows only 20 entries per page.

## Frequency definitions

Frequencies come from the loaded data, before individual viewer display filters. YAML-only names remain editable but have zero frequency when no data record uses them.

| Layer | Frequency | Additional detail |
| --- | --- | --- |
| Neighborhood | Unique genes containing the domain in each module | Repeated domains in one gene count once; occurrence totals remain available. Overlapping neighborhoods use genomic coordinates or stable compact protein IDs to avoid counting the same gene twice. |
| Architecture | Unique proteins containing the domain in each module | Repeated domains in one protein count once; occurrence totals count valid annotation rows. |
| Taxonomy | Input records associated with the taxon, including lineage ancestors | A record counts once for a merged label even when several constituent taxa occur in its lineage. |
| Network | Viewer node identities in the Function category | Nodes follow the viewer's normalized display-name grouping and effective Function selection. Loaded excluded or unused nodes are included; valid unannotated edge endpoints belong to Unassigned. |

Counts are deduplicated within each module, then added across modules of the same layer. Loading the same data in two modules counts its use in both modules. When renames combine labels, counts are recomputed from their underlying entities rather than adding potentially overlapping totals. **Most modules** counts module instances with real data, rather than dictionary-only style sources. Source details also show occurrence totals and the number of modules contributing data.

For example, choosing **Neighborhood + Architecture** lets the list show gene and protein counts separately. Selecting **Neighborhood genes** orders by genes; it never adds genes to proteins. Showing one architecture module changes the visible list and frequency measure, while Apply still updates every instance of both selected layers.

## Names and grouping

- Names match exactly after renaming, including case. Different original identifiers with the same final display name share a color within the selected group.
- Original identifiers and biological records remain in the project. Applying names updates rename mappings or display-name settings.
- A name edit affects all occurrences of that current display name in the selected layers. Renames are simultaneous: `A → B` and `B → C` produces `B` and `C`, without following chains. Empty names and control characters are rejected.
- A combined row retains separate current-to-new editors for its constituent names, allowing one proposed rename to be revised without changing the others.
- Network palettes refer to **Function categories**, not node display names. Taxonomy retains its configured coloring mode. Taxonomy labels outside the current color categories can be renamed without adding color overrides.
- A Network `Unassigned` group containing edge endpoints without node annotations must be annotated in the Network editor before that group can be renamed. The manager reports this before applying changes.
- Shapes apply to supported architecture elements. Fixed marker conventions are reported separately when relevant.
- Each layer belongs to one applied group. An existing group's names and styles can be edited, but its layer membership is fixed in that state. To regroup layers, reload the original state ZIP.

## Rename plan YAML

Under **Rename plan and reset**, **Import rename plan YAML** replaces pending name edits with a mapping of **current display name → new display name**. All keys must exist in the selected layers. This is a project-level plan, not a module-specific original-identifier dictionary.

```yaml
HAD-like: HAD
Hydrolase: HAD
```

Previewing this plan combines `HAD-like`, `Hydrolase`, and any existing `HAD` entry. Their colors and supported shapes must agree or be resolved explicitly. The updated state contains the corresponding module-specific rename assets and settings. **Download rename plan YAML** exports the last applied nonempty plan for the selected group, including after later color-only edits. Historical plans retained in the state are never replayed automatically.

## Saving and portability

All processing uses local scripts; the manager does not upload project data. Applied choices are stored in the exported Builder state, along with original uploaded data, page contents, and settings. Unselected module assets are preserved.

Review changes are committed only with **Apply shared palette** or **Update shared palette**, after a current preview. Downloads contain applied groups; pending name edits and palette choices remain in the review until applied. Keep the original state ZIP to restore earlier names and colors or choose different groups.

The manager consumes editable Builder state archives. A published supplement ZIP is not a substitute for the Builder's **Save state** ZIP.
