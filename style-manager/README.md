# Project Style Manager

Project Style Manager edits display names and unifies colors and supported shapes across selected module layers in a Builder **Save state** ZIP. It runs locally in the browser and exports a new state that can be opened with **Load state** in the Builder.

## Workflow

1. In the Builder, save your current state ZIP.
2. Open **Project Style Manager** from EvoSupplement Studio and load that ZIP.
3. Select the layers that should share a palette: **Taxonomy**, **Neighborhood**, **Architecture**, and/or **Network**. Every instance of each selected layer is included.
4. Review the current display names after each module's existing renaming rules. Enter replacements in **New display name**, or leave names unchanged. Expand **Sources** to inspect module instances and original identifiers.
5. Click **Preview renamed palette** after editing names. Entries assigned the same final name are combined into one palette row. Preview does not change the saved project. Name edits disable the palette and Apply button until previewed; **Reset name edits** restores the current project's names for another preview.
6. Resolve conflicting colors with an existing-color choice, a color picker, or a hexadecimal color. If enabled, resolve architecture shape conflicts too. A conflicting style is never chosen automatically, including conflicts created by merging names.
7. Apply the palette to save both names and styles. You can then create another independent group from the remaining layers, or edit an applied group's names and styles. Further edits start from the names already applied.
8. Download the updated state ZIP, reopen it in the Builder, and export your supplement. Color and shape dictionaries, and the latest applied rename plan, can also be downloaded separately for each group.

For example, choosing **Neighborhood + Architecture** applies a shared palette to every neighborhood and architecture instance in the project. Taxonomy and Network keep their previous styles unless included in a selected group.

## Names and grouping

- Names match exactly after renaming, including case. Different original identifiers with the same final display name share a color within the selected group.
- Original identifiers remain in the project. Applying names updates the selected modules' rename mappings or display-name settings; it does not merge biological records.
- A name edit affects all occurrences of the current display name in the selected layers. Renames are simultaneous: `A → B` and `B → C` produces `B` and `C`, without following chains. Empty names and control characters are rejected.
- Network palettes refer to the viewer's **Function categories**, rather than node display names. Taxonomy retains its configured coloring mode.
- A Network `Unassigned` group containing edge endpoints without node annotations must be annotated in the Network editor before renaming that group. The manager reports this before applying any changes.
- Taxonomy labels outside the current color categories can be renamed without adding color overrides or changing the coloring mode.
- Shapes apply to supported architecture elements. Special fixed feature conventions are reported separately when relevant.
- Each module layer belongs to one applied palette group. An existing group can be edited; its membership is fixed in that state. To choose a different grouping, reload the original state ZIP.
- The review is paginated for larger projects. Search includes final names, original identifiers, and source module titles. **Unresolved only** helps locate remaining conflicts.

## Rename plan YAML

The optional **Import rename plan YAML** input replaces the pending name edits with a mapping of **current display name → new display name**. All keys must exist in the selected layers. It is a project-level rename plan, not a module-specific original-identifier dictionary.

```yaml
HAD-like: HAD
Hydrolase: HAD
```

Previewing this plan combines `HAD-like`, `Hydrolase`, and any existing `HAD` entry. Their colors and supported shapes must agree or be resolved explicitly. The updated state contains the corresponding module-specific rename assets and settings. **Download rename plan YAML** exports the last applied nonempty plan for the selected group, including after later color-only edits. Historical plans retained in the state are never replayed automatically.

## Saving and portability

All processing uses local scripts; the manager does not upload project data. Applied choices are stored in the exported Builder state, along with the original uploaded data, page contents, and settings. Unselected module assets are preserved.

Review changes are applied only when you click **Apply shared palette** or **Update shared palette**. Downloads contain applied groups; pending name edits and palette choices remain in the current review until applied. Keep the original state ZIP if you want to restore its previous names and colors or choose a new grouping.

This tool consumes editable Builder state archives. A published supplement ZIP is not a substitute for the Builder's **Save state** ZIP.
