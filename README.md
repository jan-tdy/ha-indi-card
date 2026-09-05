# ha-indi-card

![ha-indi-card](assets/banner.svg)

An advanced Home Assistant Lovelace card for [`ha-indi-client`](https://github.com/jan-tdy/ha-indi-client) — combine only the entities you pick into a clean, tile-style, resizable dashboard for your INDI observatory.

> **Status:** `v1.0.0-beta.3` — the foundation of a longer-term goal: an in-Home-Assistant alternative to imaging tools like [CCDciel](https://www.ap-i.net/ccdciel/en/start) (capture sequences, live camera view, focus/guide feedback).
>
> **Why not just render every entity?** A real `ha-indi-client` setup can expose thousands of entities (one per INDI property, across every driver on the server). This card never renders them all — you (or a one-click suggestion) pick the handful that matter, each becoming a tile, in the same visual language as Home Assistant's own Tile card.
>
> **Note:** `ha-indi-client` does not fetch INDI BLOB/image data yet (see its [known limitations](https://github.com/jan-tdy/ha-indi-client#known-limitations)), so there is no camera entity coming from it today. The `image` tile works with any `camera.*` entity in your system — once `ha-indi-client` gains BLOB support, point one at it with no changes needed here.

## Features

- **Tiles, not a flat list or auto-rendered panels** — every entity you add becomes its own small tile (icon, short name, live value), laid out in a responsive grid in Home Assistant's own tile-card style.
- **Short, readable names** — tiles prefer the entity's own (device-relative) registry name over `ha-indi-client`'s full "Device + property" friendly name, and drop a trailing unit hint, so a tile reads "Celestial RA" instead of wrapping "EQMod Mount Celestial RA (hh:mm:ss)". Override with your own `name` any time.
- **A tile type per kind of control**, not just a generic readout:
  - **Value** — any sensor/state, read-only.
  - **Toggle** — switch/light/fan, with an inline switch.
  - **Dropdown** — `select` entities (mount park/unpark, filter wheel, ...), using Home Assistant's own `ha-select` dropdown component.
  - **Stepper** — `number`/`input_number` entities with +/- buttons (focuser position, CCD target temperature, ...).
  - **Gauge** — a numeric entity as a circular gauge.
  - **Coordinates** — two entities (e.g. RA + DEC) combined into one tile.
  - **Camera image** — a live snapshot from any `camera.*` entity.
  - **Hand control** — a compass-style N/S/E/W press-and-hold pad wired to four switch entities, for slewing a mount the way a real hand controller works.
  - **Button** — one tap runs a `script`/`button`/`scene` entity (e.g. a quick "Park" or "Refresh" action).
- **Resizable, drag-to-reorder tiles** — set a tile's width/height (1-4 grid cells) right in its row in the editor, and drag tiles by their handle to reorder them.
- **The card itself is resizable** — it implements Home Assistant's grid sizing so, in a sections-view dashboard, you can drag-resize the whole card like any built-in one.
- **Smart suggestions, not automation** — the editor looks at what `ha-indi-client` actually exposes (via the device registry) and offers one-click "+ Add" suggestions for coordinate pairs, hand controls, and camera images it recognizes — but nothing is ever added without you clicking it.
- **Fully visual editor** — pick a tile type, pick its entity/entities from the standard (searchable) Home Assistant entity picker, optionally name it, and add it. No YAML required.

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

Add a new card, search for **INDI Card**, and use the editor: accept a suggested tile or two, then add more via the "Add a tile" composer. Or configure it directly in YAML:

```yaml
type: custom:ha-indi-card
title: INDI Observatory
tiles:
  - type: coordinate
    name: Mount position
    width: 2
    entities:
      - sensor.telescope_simulator_ra
      - sensor.telescope_simulator_dec
  - type: handcontrol
    name: Slew
    north: switch.telescope_simulator_motion_north
    south: switch.telescope_simulator_motion_south
    east: switch.telescope_simulator_motion_east
    west: switch.telescope_simulator_motion_west
  - type: select
    entity: select.telescope_simulator_parking
  - type: gauge
    name: CCD temperature
    entity: sensor.ccd_simulator_temperature
  - type: stepper
    name: CCD target temp
    entity: number.ccd_simulator_temperature
  - type: image
    entity: camera.guide_cam
    width: 2
    height: 2
  - type: button
    name: Refresh
    entity: script.refresh_indi_server
  - type: toggle
    entity: switch.telescope_simulator_connected
```

| Option  | Type   | Default | Description                                             |
| ------- | ------ | ------- | --------------------------------------------------------- |
| `title` | string | —       | Card header.                                             |
| `tiles` | list   | `[]`    | Ordered list of tiles — see below.                        |

Each entry in `tiles` has a `type` plus fields specific to it, and an optional `name`/`icon` override plus `width`/`height` (grid cells, 1-4; default 1, or 2×2 for `image`/`handcontrol`):

| `type`        | Fields                                    | Notes                                              |
| ------------- | ------------------------------------------ | --------------------------------------------------- |
| `value`       | `entity`                                   | Any domain; read-only.                             |
| `toggle`      | `entity`                                   | `switch`/`input_boolean`/`light`/`fan`.             |
| `select`      | `entity`                                   | Renders as a real dropdown.                        |
| `stepper`     | `entity`                                   | `number`/`input_number`, uses its `min`/`max`/`step`. |
| `gauge`       | `entity`, optional `min`/`max`             | Numeric; falls back to the entity's own `min`/`max`. |
| `coordinate`  | `entities` (list of 2+)                    | Shown stacked in one tile.                         |
| `image`       | `entity`                                   | Any `camera.*` entity.                             |
| `handcontrol` | `north`, `south`, `east`, `west`           | Each a `switch` entity; press-and-hold slewing.    |
| `button`      | `entity`, optional `label`                 | A `script`/`button`/`scene` entity; runs on tap.   |

## Roadmap

Longer term, the goal is a dashboard that covers the same ground as dedicated astro-imaging
software (CCDciel, EKOS/KStars) directly inside Home Assistant — planned in rough order:

- Live camera view fed by `ha-indi-client`'s CCD/guide-camera BLOBs, once it supports them.
- Dedicated widgets for covers and climate entities (e.g. dome/roof).
- A history/sparkline tile.
- Capture sequence builder (exposure/filter/count lists) and run/status controls.

## License

MIT — see [LICENSE](LICENSE).
