# Changelog

## v1.0.0-beta.3

Fixes the rough edges from real-world testing: entity names were too long for a tile, tiles couldn't be resized or reordered without editing YAML, and the card offered only 7 tile types.

- **Short names**: tiles now prefer the entity registry's own (device-relative) name over `ha-indi-client`'s full "Device + property" friendly name, and strip a trailing `(unit hint)` — so a tile reads "Celestial RA" instead of wrapping/truncating "EQMod Mount Celestial RA (hh:mm:ss)".
- **Resizable tiles**: each tile takes an optional `width`/`height` (1-4 grid cells; `image`/`handcontrol` default to 2×2), editable via number inputs in the editor's tile list.
- **Resizable card**: implements Home Assistant's `getGridOptions()`, so in a sections-view dashboard the whole card gets the standard drag-resize handles.
- **Drag-and-drop reordering**: the editor's tile list is now reordered by dragging a tile by its handle, replacing the previous up/down buttons.
- **Two more tile types**: `gauge` (a numeric entity as a circular gauge) and `button` (one tap runs a `script`/`button`/`scene` entity).
- Fixed the `select` tile's dropdown (`ha-select`) setting its current value before its options existed, which could leave it showing blank on first paint.

## v1.0.0-beta.2

Tile-based rework: a real `ha-indi-client` install can expose thousands of entities, so v1.0.0-beta.1's "auto-render every discovered device" approach didn't scale. This release replaces it with a curated, combinable tile model, styled after Home Assistant's own Tile card.

- New `tiles` config: an ordered list of small tiles, each one a `value`, `toggle`, `select` (dropdown), `stepper` (+/-), `coordinate` (2 entities in one tile), `image` (camera), or `handcontrol` (a compass-style press-and-hold N/S/E/W pad for mount slewing) tile.
- The editor's device auto-discovery is repurposed into one-click "Suggested tiles": it recognizes coordinate pairs, north/south/east/west motion switches, and camera entities per `ha-indi-client` device, and offers to add the matching tile — nothing is ever added without an explicit click.
- Manual tile composer: pick a type, pick its entity/entities via the standard searchable entity picker (fine even with a very large entity count), optionally name it, add it.
- Removed: `auto_discover`, `config_entry_id`, `hidden_devices`, `device_order`, `camera_entity`, `show_camera`, and `sections` — superseded by `tiles`. This is a breaking config change; existing beta.1 cards need to be reconfigured.

## v1.0.0-beta.1

CCDciel-style auto-discovery.

- Auto-discovery: the card now finds every entity belonging to the `ha-indi-client` integration by itself (via the Home Assistant entity/device registry) and groups them by INDI device — no manual entity picking needed to get started.
- Device panels replace the flat entity list: each discovered device gets its own panel with a connection indicator, sized by device kind (mount/camera/focuser/filter wheel/dome, detected from the device name) and a "Last message" footer where available.
- `select` entities (e.g. mount park/unpark, filter wheel selection) now render as a real dropdown (`ha-select`, with a plain `<select>` fallback) that calls `select.select_option`, instead of just showing static text.
- `number`/`input_number` entities render as a +/- stepper that calls `set_value`, respecting `min`/`max`/`step`.
- The editor gained an auto-discovery toggle and a discovered-devices list (show/hide, reorder); the previous manual section/entity picker is kept as an "Extra entities (advanced)" section for anything auto-discovery doesn't cover.
- New config options: `auto_discover`, `config_entry_id`, `hidden_devices`, `device_order`.

## v1.0.0-beta.0

Initial beta release.

- Visual layout editor: add sections, pick any entity via `ha-entity-picker`, reorder entities and sections with up/down controls, and remove what you don't need — no YAML required.
- Optional live camera image: pick a `camera.*` entity to show its current snapshot at the top of the card, with a toggle to hide it.
- Toggleable entities (`switch`, `input_boolean`, `light`, `fan`) get an inline switch; everything else shows its formatted state.
- Clicking any row or the camera image opens the standard Home Assistant more-info dialog.

Note: `ha-indi-client` does not fetch INDI BLOB/image data yet, so it exposes no `camera.*` entity today — `camera_entity` works with any camera entity in your system and is ready for when `ha-indi-client` adds BLOB support.

Planned for a later version: free-form grid placement, a live camera view fed by `ha-indi-client`'s BLOBs, control widgets for numbers/covers/climate, and a CCDciel-style capture sequence builder.
