# Changelog

## v1.0.0-beta.0

Initial beta release.

- Visual layout editor: add sections, pick any entity via `ha-entity-picker`, reorder entities and sections with up/down controls, and remove what you don't need — no YAML required.
- Optional live camera image: pick a `camera.*` entity to show its current snapshot at the top of the card, with a toggle to hide it.
- Toggleable entities (`switch`, `input_boolean`, `light`, `fan`) get an inline switch; everything else shows its formatted state.
- Clicking any row or the camera image opens the standard Home Assistant more-info dialog.

Note: `ha-indi-client` does not fetch INDI BLOB/image data yet, so it exposes no `camera.*` entity today — `camera_entity` works with any camera entity in your system and is ready for when `ha-indi-client` adds BLOB support.

Planned for a later version: free-form grid placement, a live camera view fed by `ha-indi-client`'s BLOBs, control widgets for numbers/covers/climate, and a CCDciel-style capture sequence builder.
