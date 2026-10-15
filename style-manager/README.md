# Project Style Manager

Project Style Manager unifies the colors of selected module layers in a Builder **Save state** ZIP. It runs locally in the browser and exports a new state that can be opened with **Load state** in the Builder.

## Workflow

1. In the Builder, save your current state ZIP.
2. Open **Project Style Manager** from EvoSupplement Studio and load that ZIP.
3. Select the layers that should share a palette: **Taxonomy**, **Neighborhood**, **Architecture**, and/or **Network**. Every instance of each selected layer is included.
4. Review the final display names after the module's renaming rules. Expand **Sources** to inspect module instances, original identifiers, and existing styles.
5. Resolve conflicting colors with an existing-color choice, a color picker, or a hexadecimal color. If enabled, resolve architecture shape conflicts too. A conflicting style is never chosen automatically.
6. Apply the palette. You can then create another independent group from the remaining layers, or edit an applied group's palette.
7. Download the updated state ZIP, reopen it in the Builder, and export your supplement. Color and shape dictionaries can also be downloaded separately for each applied group.

For example, choosing **Neighborhood + Architecture** applies a shared palette to every neighborhood and architecture instance in the project. Taxonomy and Network keep their previous styles unless included in a selected group.

## Names and grouping

- Names match exactly after renaming, including case. Different original identifiers with the same final display name share a color within the selected group.
- Original identifiers and renaming rules remain in the project. Applying a palette changes visual styles; it does not merge biological records.
- Network palettes refer to the viewer's **Function categories**, rather than node display names. Taxonomy retains its configured coloring mode.
- Shapes apply to supported architecture elements. Special fixed feature conventions are reported separately when relevant.
- Each module layer belongs to one applied palette group. An existing group can be edited; its membership is fixed in that state. To choose a different grouping, reload the original state ZIP.
- The review is paginated for larger projects. Search includes final names, original identifiers, and source module titles. **Unresolved only** helps locate remaining conflicts.

## Saving and portability

All processing uses local scripts; the manager does not upload project data. Applied choices are stored in the exported Builder state, along with the original uploaded data, page contents, and settings. Unselected module assets are preserved.

Review changes are applied only when you click **Apply shared palette** or **Update shared palette**. Downloads contain applied groups. Keep the original state ZIP if you want to restore its previous colors or choose a new grouping.

This tool consumes editable Builder state archives. A published supplement ZIP is not a substitute for the Builder's **Save state** ZIP.
