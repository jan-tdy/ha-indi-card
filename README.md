# ha-indi-card

![ha-indi-card](assets/banner.svg)

An advanced Home Assistant Lovelace card for [`ha-indi-client`](https://github.com/jan-tdy/ha-indi-client) — a CCDciel-style dashboard for your INDI observatory, built automatically from whatever devices the integration finds.

> **Status:** `v1.0.0-beta.1` — the foundation of a longer-term goal: an in-Home-Assistant alternative to imaging tools like [CCDciel](https://www.ap-i.net/ccdciel/en/start) (capture sequences, live camera view, focus/guide feedback).
>
> **Note:** `ha-indi-client` does not fetch INDI BLOB/image data yet (see its [known limitations](https://github.com/jan-tdy/ha-indi-client#known-limitations)), so there is no camera entity coming from it today. The `camera_entity` option below works with any `camera.*` entity in your system (e.g. from a different integration) — once `ha-indi-client` gains BLOB support, it'll show that image with no changes needed here.

## Features

- **Auto-discovery** — finds every entity belonging to the `ha-indi-client` integration on its own (via the Home Assistant entity/device registry) and groups them by INDI device. No manual entity picking required to get started.
- **Device panels, not a flat list** — each INDI device (mount, CCD, focuser, filter wheel, dome, ...) gets its own panel with a connection indicator, sized and controlled the way the property behaves: toggles for switches, a proper dropdown for `select` entities (park/unpark, filter selection, ...), +/- steppers for numbers, and plain readouts for sensors.
- **Live camera image** — pick any `camera.*` entity and show its current snapshot at the top of the card, with a toggle to hide it.
- **Visual editor** — toggle auto-discovery, show/hide and reorder discovered devices, and (optionally) add extra entities by hand for anything not covered by auto-discovery — all without YAML.

## Installation

### HACS (custom repository)

This card is not yet in the default HACS store. Add it manually:

1. In Home Assistant, go to **HACS → Frontend → ⋮ → Custom repositories**.
2. Add `https://github.com/jan-tdy/ha-indi-card` as category **Dashboard**.
3. Install **ha-indi-card**, then reload your browser.

### Manual

1. Copy `ha-indi-card.js` into `<config>/www/ha-indi-card.js`.
2. Add it as a Lovelace resource: **Settings → Dashboards → ⋮ → Resources**
   - URL: `/local/ha-indi-card.js`
   - Resource type: `JavaScript Module`

## Usage

Add a new card, search for **INDI Card**, and it will auto-discover your `ha-indi-client` devices with no further configuration. Use the editor to set a title, hide/reorder devices, or add extra entities. Or configure it directly in YAML:

```yaml
type: custom:ha-indi-card
title: INDI Observatory
auto_discover: true
hidden_devices: []
device_order: []
camera_entity: camera.some_other_camera
show_camera: true
sections:
  - title: Weather
    entities:
      - sensor.outdoor_temperature
```

| Option           | Type    | Default | Description                                                                 |
| ---------------- | ------- | ------- | ---------------------------------------------------------------------------- |
| `title`          | string  | —       | Card header.                                                                 |
| `auto_discover`  | boolean | `true`  | Auto-detect `ha-indi-client` devices/entities and render them as panels.    |
| `config_entry_id`| string  | —       | Restrict auto-discovery to one `ha-indi-client` config entry (multi-server setups). |
| `hidden_devices` | list    | `[]`    | Device IDs to hide from the auto-discovered panels.                         |
| `device_order`   | list    | `[]`    | Explicit device ID ordering for the auto-discovered panels.                 |
| `camera_entity`  | string  | —       | A `camera.*` entity to show as a live image (independent of auto-discovery). |
| `show_camera`    | boolean | `true`  | Show/hide the camera image without removing the entity.                     |
| `sections`       | list    | `[]`    | Extra, manually-picked `{ title, entities }` groups, rendered below the auto-discovered panels. |

## Roadmap

Longer term, the goal is a dashboard that covers the same ground as dedicated astro-imaging
software (CCDciel, EKOS/KStars) directly inside Home Assistant — planned in rough order:

- Live camera view fed by `ha-indi-client`'s CCD/guide-camera BLOBs, once it supports them.
- Free-form grid/drag-and-drop placement within a device panel.
- Dedicated widgets for covers and climate entities (e.g. dome/roof).
- Capture sequence builder (exposure/filter/count lists) and run/status controls.

## License

MIT — see [LICENSE](LICENSE).
