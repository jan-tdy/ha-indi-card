# Changelog

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
