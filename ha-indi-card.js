const CARD_VERSION = "1.0.0-beta.2";
const INDI_PLATFORM = "indi_client";

const FALLBACK_ICONS = {
  camera: "mdi:camera",
  switch: "mdi:toggle-switch-outline",
  input_boolean: "mdi:toggle-switch-outline",
  light: "mdi:lightbulb-outline",
  fan: "mdi:fan",
  binary_sensor: "mdi:checkbox-blank-circle-outline",
  sensor: "mdi:gauge",
  number: "mdi:tune-variant",
  input_number: "mdi:tune-variant",
  select: "mdi:format-list-bulleted",
  input_select: "mdi:format-list-bulleted",
  text: "mdi:form-textbox",
  input_text: "mdi:form-textbox",
  cover: "mdi:window-shutter",
  lock: "mdi:lock-outline",
  climate: "mdi:thermostat",
};

const TOGGLE_DOMAINS = ["switch", "input_boolean", "light", "fan"];

const TILE_TYPES = new Set(["value", "toggle", "select", "stepper", "coordinate", "image", "handcontrol"]);

const TILE_TYPE_LABELS = [
  ["value", "Value / sensor readout"],
  ["toggle", "Toggle (switch/light/fan)"],
  ["select", "Dropdown (select)"],
  ["stepper", "Number stepper"],
  ["coordinate", "Coordinates (2 entities)"],
  ["image", "Camera image"],
  ["handcontrol", "Hand control (mount slew)"],
];

const TILE_TYPE_DEFAULT_ICON = {
  value: "mdi:information-outline",
  toggle: "mdi:toggle-switch-outline",
  select: "mdi:format-list-bulleted",
  stepper: "mdi:tune-variant",
  coordinate: "mdi:crosshairs-gps",
  image: "mdi:camera",
  handcontrol: "mdi:telescope",
};

function domainOf(entityId) {
  return entityId.split(".", 1)[0];
}

function fireEvent(node, type, detail = {}) {
  const event = new CustomEvent(type, {
    bubbles: true,
    cancelable: false,
    composed: true,
    detail,
  });
  node.dispatchEvent(event);
  return event;
}

function formatState(hass, stateObj) {
  const unit = stateObj.attributes.unit_of_measurement;
  const value =
    hass && typeof hass.formatEntityState === "function"
      ? hass.formatEntityState(stateObj)
      : stateObj.state;
  return unit && !String(value).includes(unit) ? `${value} ${unit}` : value;
}

function arrayMove(arr, from, to) {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/**
 * Groups every entity belonging to the ha-indi-client integration by its
 * INDI device, using the entity/device registry data Home Assistant exposes
 * on the hass object. Used only to power the editor's "suggested tiles" —
 * a real installation can have thousands of entities, so nothing here is
 * ever rendered on the card itself without the user explicitly adding it.
 */
function discoverIndiDevices(hass, configEntryId) {
  if (!hass || !hass.entities || !hass.devices) return [];
  const byDevice = new Map();
  Object.keys(hass.entities).forEach((entityId) => {
    const entry = hass.entities[entityId];
    if (!entry || entry.platform !== INDI_PLATFORM) return;
    if (configEntryId && entry.config_entry_id !== configEntryId) return;
    const deviceId = entry.device_id || `_no_device_${entityId}`;
    if (!byDevice.has(deviceId)) byDevice.set(deviceId, []);
    byDevice.get(deviceId).push(entityId);
  });

  return Array.from(byDevice.entries())
    .map(([deviceId, entityIds]) => {
      const deviceEntry = hass.devices[deviceId];
      const name = (deviceEntry && (deviceEntry.name_by_user || deviceEntry.name)) || "INDI Device";
      entityIds.sort();
      return { id: deviceId, name, entityIds };
    })
    .filter((d) => !/server/i.test(d.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function findEntityByNamePattern(entityIds, hass, pattern, domains) {
  return entityIds.find((id) => {
    if (domains && !domains.includes(domainOf(id))) return false;
    const stateObj = hass.states[id];
    const friendly = (stateObj && stateObj.attributes.friendly_name) || id;
    return pattern.test(friendly);
  });
}

function suggestTilesForDevice(device, hass) {
  const suggestions = [];

  const ra = findEntityByNamePattern(device.entityIds, hass, /\b(ra|right ascension)\b/i, ["sensor", "number"]);
  const dec = findEntityByNamePattern(device.entityIds, hass, /\b(dec|declination)\b/i, ["sensor", "number"]);
  if (ra && dec) {
    suggestions.push({
      label: `Coordinates (${device.name})`,
      tile: { type: "coordinate", entities: [ra, dec], name: device.name },
    });
  }

  const north = findEntityByNamePattern(device.entityIds, hass, /north/i, ["switch"]);
  const south = findEntityByNamePattern(device.entityIds, hass, /south/i, ["switch"]);
  const east = findEntityByNamePattern(device.entityIds, hass, /east/i, ["switch"]);
  const west = findEntityByNamePattern(device.entityIds, hass, /west/i, ["switch"]);
  if (north && south && east && west) {
    suggestions.push({
      label: `Hand control (${device.name})`,
      tile: { type: "handcontrol", north, south, east, west, name: device.name },
    });
  }

  const camera = device.entityIds.find((id) => domainOf(id) === "camera");
  if (camera) {
    suggestions.push({
      label: `Camera image (${device.name})`,
      tile: { type: "image", entity: camera, name: device.name },
    });
  }

  return suggestions;
}

class HaIndiCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("ha-indi-card-editor");
  }

  static getStubConfig() {
    return {
      type: "custom:ha-indi-card",
      title: "INDI Observatory",
      tiles: [],
    };
  }

  setConfig(config) {
    if (!config || typeof config !== "object") {
      throw new Error("Invalid configuration");
    }
    if (config.tiles != null && !Array.isArray(config.tiles)) {
      throw new Error("Invalid configuration: tiles must be a list");
    }
    const tiles = (config.tiles || []).map((tile, index) => {
      if (!tile || typeof tile !== "object") {
        throw new Error(`Invalid configuration: tile ${index} must be an object`);
      }
      if (!TILE_TYPES.has(tile.type)) {
        throw new Error(`Invalid configuration: tile ${index} has an unknown type`);
      }
      if (tile.type === "coordinate") {
        if (tile.entities != null && !Array.isArray(tile.entities)) {
          throw new Error(`Invalid configuration: tile ${index} entities must be a list`);
        }
      } else if (tile.type === "handcontrol") {
        ["north", "south", "east", "west"].forEach((dir) => {
          if (tile[dir] != null && typeof tile[dir] !== "string") {
            throw new Error(`Invalid configuration: tile ${index} ${dir} must be an entity id`);
          }
        });
      } else if (tile.entity != null && typeof tile.entity !== "string") {
        throw new Error(`Invalid configuration: tile ${index} entity must be an entity id`);
      }
      return tile;
    });

    this._config = { ...config, tiles };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    const tiles = this._config ? this._config.tiles || [] : [];
    return Math.max(1, Math.ceil(tiles.length / 3) + 1);
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (ev) => this._handleClick(ev));
    }
    this._render();
  }

  disconnectedCallback() {
    this._releaseActivePress();
  }

  _releaseActivePress() {
    if (this._activePress && this._hass) {
      const { entityId } = this._activePress;
      this._hass.callService(domainOf(entityId), "turn_off", { entity_id: entityId });
    }
    this._activePress = null;
  }

  _handleClick(ev) {
    const toggle = ev.target.closest("[data-toggle]");
    if (toggle) {
      ev.stopPropagation();
      const entityId = toggle.dataset.toggle;
      this._hass.callService(domainOf(entityId), "toggle", { entity_id: entityId });
      return;
    }
    const row = ev.target.closest("[data-more-info]");
    if (row) {
      fireEvent(this, "hass-more-info", { entityId: row.dataset.moreInfo });
    }
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    const config = this._config;
    const hass = this._hass;

    if (!this._contentEl) {
      this.shadowRoot.innerHTML = `<style>${this._styles()}</style><ha-card><div class="card-header" hidden></div><div class="card-content"></div></ha-card>`;
      this._headerEl = this.shadowRoot.querySelector(".card-header");
      this._contentEl = this.shadowRoot.querySelector(".card-content");
    }

    // A re-render tears down and rebuilds every tile, including a hand-control
    // button that may be mid-press; release it first so turn_off always fires
    // exactly once instead of leaving the mount slewing with no way to stop it.
    this._releaseActivePress();

    this._headerEl.hidden = !config.title;
    this._headerEl.textContent = config.title || "";

    while (this._contentEl.firstChild) {
      this._contentEl.removeChild(this._contentEl.firstChild);
    }

    if (!hass) return;

    const tiles = config.tiles || [];
    if (!tiles.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Add tiles in the card editor to show entities from ha-indi-client.";
      this._contentEl.appendChild(empty);
      return;
    }

    const grid = document.createElement("div");
    grid.className = "tiles-grid";
    tiles.forEach((tile) => {
      grid.appendChild(this._buildTileEl(tile, hass));
    });
    this._contentEl.appendChild(grid);
  }

  _buildTileEl(tile, hass) {
    switch (tile.type) {
      case "toggle":
        return this._buildToggleTile(tile, hass);
      case "select":
        return this._buildSelectTile(tile, hass);
      case "stepper":
        return this._buildStepperTile(tile, hass);
      case "coordinate":
        return this._buildCoordinateTile(tile, hass);
      case "image":
        return this._buildImageTile(tile, hass);
      case "handcontrol":
        return this._buildHandControlTile(tile);
      default:
        return this._buildValueTile(tile, hass);
    }
  }

  _buildTileShell({ icon, name, value, moreInfoEntityId, control, footer, wide }) {
    const tile = document.createElement("div");
    tile.className = wide ? "tile tile-wide" : "tile";
    if (moreInfoEntityId) tile.dataset.moreInfo = moreInfoEntityId;

    const main = document.createElement("div");
    main.className = "tile-main";

    const iconWrap = document.createElement("div");
    iconWrap.className = "tile-icon";
    const iconEl = document.createElement("ha-icon");
    iconEl.icon = icon;
    iconWrap.appendChild(iconEl);
    main.appendChild(iconWrap);

    const info = document.createElement("div");
    info.className = "tile-info";
    const nameEl = document.createElement("div");
    nameEl.className = "tile-name";
    nameEl.textContent = name;
    info.appendChild(nameEl);

    if (value instanceof Node) {
      info.appendChild(value);
    } else if (value !== undefined) {
      const valueEl = document.createElement("div");
      valueEl.className = "tile-value";
      valueEl.textContent = value;
      info.appendChild(valueEl);
    }
    main.appendChild(info);

    if (control) {
      control.classList.add("tile-control");
      main.appendChild(control);
    }

    tile.appendChild(main);

    if (footer) {
      footer.classList.add("tile-footer");
      tile.appendChild(footer);
    }

    return tile;
  }

  _buildValueTile(tileConfig, hass) {
    const entityId = tileConfig.entity;
    const stateObj = entityId && hass ? hass.states[entityId] : undefined;
    const domain = entityId ? domainOf(entityId) : undefined;
    const unavailable = !stateObj;
    const name = tileConfig.name || (stateObj && stateObj.attributes.friendly_name) || entityId || "Value";
    const icon =
      tileConfig.icon ||
      (stateObj && stateObj.attributes.icon) ||
      (domain && FALLBACK_ICONS[domain]) ||
      TILE_TYPE_DEFAULT_ICON.value;

    return this._buildTileShell({
      icon,
      name,
      value: unavailable ? "unavailable" : formatState(hass, stateObj),
      moreInfoEntityId: entityId,
    });
  }

  _buildToggleTile(tileConfig, hass) {
    const entityId = tileConfig.entity;
    const stateObj = entityId && hass ? hass.states[entityId] : undefined;
    const domain = entityId ? domainOf(entityId) : undefined;
    const unavailable = !stateObj;
    const name = tileConfig.name || (stateObj && stateObj.attributes.friendly_name) || entityId || "Toggle";
    const icon =
      tileConfig.icon ||
      (stateObj && stateObj.attributes.icon) ||
      (domain && FALLBACK_ICONS[domain]) ||
      TILE_TYPE_DEFAULT_ICON.toggle;

    const control = document.createElement("ha-switch");
    if (entityId) control.dataset.toggle = entityId;
    control.checked = !unavailable && stateObj.state === "on";
    control.disabled = unavailable;

    return this._buildTileShell({
      icon,
      name,
      value: unavailable ? "unavailable" : stateObj.state === "on" ? "On" : "Off",
      moreInfoEntityId: entityId,
      control,
    });
  }

  _buildSelectTile(tileConfig, hass) {
    const entityId = tileConfig.entity;
    const stateObj = entityId && hass ? hass.states[entityId] : undefined;
    const name = tileConfig.name || (stateObj && stateObj.attributes.friendly_name) || entityId || "Select";
    const icon = tileConfig.icon || (stateObj && stateObj.attributes.icon) || TILE_TYPE_DEFAULT_ICON.select;

    if (!stateObj) {
      return this._buildTileShell({ icon, name, value: "unavailable", moreInfoEntityId: entityId });
    }

    const footer = document.createElement("div");
    footer.className = "tile-select";
    footer.appendChild(this._buildSelectEl(entityId, stateObj));

    return this._buildTileShell({ icon, name, value: stateObj.state, moreInfoEntityId: entityId, footer });
  }

  _buildStepperTile(tileConfig, hass) {
    const entityId = tileConfig.entity;
    const stateObj = entityId && hass ? hass.states[entityId] : undefined;
    const domain = entityId ? domainOf(entityId) : undefined;
    const name = tileConfig.name || (stateObj && stateObj.attributes.friendly_name) || entityId || "Value";
    const icon =
      tileConfig.icon ||
      (stateObj && stateObj.attributes.icon) ||
      (domain && FALLBACK_ICONS[domain]) ||
      TILE_TYPE_DEFAULT_ICON.stepper;

    if (!stateObj) {
      return this._buildTileShell({ icon, name, value: "unavailable", moreInfoEntityId: entityId });
    }

    const footer = document.createElement("div");
    footer.className = "tile-stepper-footer";
    footer.appendChild(this._buildStepperEl(entityId, stateObj));

    return this._buildTileShell({ icon, name, moreInfoEntityId: entityId, footer });
  }

  _buildCoordinateTile(tileConfig, hass) {
    const entityIds = tileConfig.entities || [];
    const name = tileConfig.name || "Coordinates";
    const icon = tileConfig.icon || TILE_TYPE_DEFAULT_ICON.coordinate;

    const value = document.createElement("div");
    value.className = "tile-coords";
    entityIds.forEach((entityId) => {
      const stateObj = hass ? hass.states[entityId] : undefined;
      const label = (stateObj && stateObj.attributes.friendly_name) || entityId;
      const text = stateObj ? formatState(hass, stateObj) : "unavailable";
      const row = document.createElement("div");
      row.className = "tile-coord-row";
      const labelEl = document.createElement("span");
      labelEl.className = "tile-coord-label";
      labelEl.textContent = label;
      const textEl = document.createElement("span");
      textEl.textContent = text;
      row.appendChild(labelEl);
      row.appendChild(textEl);
      value.appendChild(row);
    });

    return this._buildTileShell({ icon, name, value, moreInfoEntityId: entityIds[0] });
  }

  _buildImageTile(tileConfig, hass) {
    const entityId = tileConfig.entity;
    const stateObj = entityId && hass ? hass.states[entityId] : undefined;
    const name = tileConfig.name || (stateObj && stateObj.attributes.friendly_name) || entityId || "Camera";
    const icon = tileConfig.icon || TILE_TYPE_DEFAULT_ICON.image;

    const footer = document.createElement("div");
    footer.className = "tile-image";
    if (stateObj && stateObj.attributes.entity_picture) {
      const img = document.createElement("img");
      img.src = stateObj.attributes.entity_picture;
      img.alt = name;
      footer.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "tile-image-placeholder";
      placeholder.textContent = "No image";
      footer.appendChild(placeholder);
    }

    return this._buildTileShell({ icon, name, moreInfoEntityId: entityId, footer, wide: true });
  }

  _buildHandControlTile(tileConfig) {
    const name = tileConfig.name || "Hand control";
    const icon = tileConfig.icon || TILE_TYPE_DEFAULT_ICON.handcontrol;
    const directions = { north: "mdi:chevron-up", south: "mdi:chevron-down", east: "mdi:chevron-right", west: "mdi:chevron-left" };

    const pad = document.createElement("div");
    pad.className = "handcontrol-pad";

    Object.keys(directions).forEach((dir) => {
      const entityId = tileConfig[dir];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `handcontrol-btn handcontrol-${dir}`;
      btn.setAttribute("aria-label", dir.charAt(0).toUpperCase() + dir.slice(1));
      const iconEl = document.createElement("ha-icon");
      iconEl.icon = directions[dir];
      btn.appendChild(iconEl);
      if (!entityId) {
        btn.disabled = true;
      } else {
        const press = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (this._activePress) return;
          this._activePress = { entityId };
          this._hass.callService(domainOf(entityId), "turn_on", { entity_id: entityId });
        };
        const release = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (!this._activePress || this._activePress.entityId !== entityId) return;
          this._activePress = null;
          this._hass.callService(domainOf(entityId), "turn_off", { entity_id: entityId });
        };
        btn.addEventListener("pointerdown", press);
        btn.addEventListener("pointerup", release);
        btn.addEventListener("pointerleave", release);
        btn.addEventListener("pointercancel", release);
      }
      pad.appendChild(btn);
    });

    const center = document.createElement("div");
    center.className = "handcontrol-center";
    const centerIcon = document.createElement("ha-icon");
    centerIcon.icon = icon;
    center.appendChild(centerIcon);
    pad.appendChild(center);

    const footer = document.createElement("div");
    footer.appendChild(pad);

    return this._buildTileShell({ icon, name, footer, wide: true });
  }

  _buildSelectEl(entityId, stateObj) {
    const options = stateObj.attributes.options || [];

    if (customElements.get("ha-select") && customElements.get("mwc-list-item")) {
      const selectEl = document.createElement("ha-select");
      selectEl.naturalMenuWidth = true;
      selectEl.value = stateObj.state;
      options.forEach((option) => {
        const item = document.createElement("mwc-list-item");
        item.value = option;
        item.textContent = option;
        selectEl.appendChild(item);
      });
      selectEl.addEventListener("selected", (ev) => {
        ev.stopPropagation();
        const option = options[ev.detail.index];
        if (option && option !== stateObj.state) {
          this._hass.callService("select", "select_option", { entity_id: entityId, option });
        }
      });
      selectEl.addEventListener("click", (ev) => ev.stopPropagation());
      selectEl.addEventListener("closed", (ev) => ev.stopPropagation());
      return selectEl;
    }

    const nativeSelect = document.createElement("select");
    nativeSelect.className = "native-select";
    options.forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option;
      opt.textContent = option;
      if (option === stateObj.state) opt.selected = true;
      nativeSelect.appendChild(opt);
    });
    nativeSelect.addEventListener("click", (ev) => ev.stopPropagation());
    nativeSelect.addEventListener("change", (ev) => {
      ev.stopPropagation();
      this._hass.callService("select", "select_option", { entity_id: entityId, option: ev.target.value });
    });
    return nativeSelect;
  }

  _buildStepperEl(entityId, stateObj) {
    const domain = domainOf(entityId);
    const min = Number(stateObj.attributes.min);
    const max = Number(stateObj.attributes.max);
    const step = Number(stateObj.attributes.step) || 1;

    const clamp = (v) => {
      let out = v;
      if (!Number.isNaN(min)) out = Math.max(min, out);
      if (!Number.isNaN(max)) out = Math.min(max, out);
      return out;
    };

    const setValue = (delta) => {
      const next = clamp(Number(stateObj.state) + delta);
      this._hass.callService(domain, "set_value", { entity_id: entityId, value: next });
    };

    const wrap = document.createElement("div");
    wrap.className = "stepper";

    const minusBtn = document.createElement("button");
    minusBtn.type = "button";
    minusBtn.className = "stepper-btn";
    const minusIcon = document.createElement("ha-icon");
    minusIcon.icon = "mdi:minus";
    minusBtn.appendChild(minusIcon);
    minusBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      setValue(-step);
    });
    wrap.appendChild(minusBtn);

    const valueEl = document.createElement("span");
    valueEl.className = "stepper-value";
    valueEl.textContent = formatState(this._hass, stateObj);
    wrap.appendChild(valueEl);

    const plusBtn = document.createElement("button");
    plusBtn.type = "button";
    plusBtn.className = "stepper-btn";
    const plusIcon = document.createElement("ha-icon");
    plusIcon.icon = "mdi:plus";
    plusBtn.appendChild(plusIcon);
    plusBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      setValue(step);
    });
    wrap.appendChild(plusBtn);

    return wrap;
  }

  _styles() {
    return `
      ha-card { display: flex; flex-direction: column; }
      .card-header { font-size: 1.2em; font-weight: 500; padding: 16px 16px 0; }
      .card-content { padding: 8px 16px 16px; }
      .empty { color: var(--secondary-text-color); padding: 16px 0; text-align: center; }

      .tiles-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
      .tile {
        background: var(--ha-card-background, var(--card-background-color, #fff));
        border-radius: 12px; border: 1px solid var(--divider-color);
        padding: 10px; display: flex; flex-direction: column; gap: 8px; cursor: pointer;
      }
      .tile-wide { grid-column: span 2; }
      .tile-main { display: flex; align-items: center; gap: 8px; }
      .tile-icon {
        flex: none; width: 36px; height: 36px; border-radius: 50%;
        background: rgba(var(--rgb-primary-color, 3, 155, 229), 0.15);
        display: flex; align-items: center; justify-content: center;
      }
      .tile-icon ha-icon { color: var(--primary-color); }
      .tile-info { flex: 1; min-width: 0; }
      .tile-name {
        font-size: 0.8em; color: var(--secondary-text-color);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .tile-value {
        font-size: 1.1em; font-weight: 500;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .tile-control { flex: none; }
      .tile-footer { margin-top: 4px; }

      .tile-coords { display: flex; flex-direction: column; gap: 2px; }
      .tile-coord-row { display: flex; justify-content: space-between; gap: 8px; font-size: 0.95em; }
      .tile-coord-label { color: var(--secondary-text-color); }

      .tile-image { border-radius: 8px; overflow: hidden; line-height: 0; }
      .tile-image img { width: 100%; display: block; }
      .tile-image-placeholder { padding: 24px; text-align: center; color: var(--secondary-text-color); }

      .tile-select, .tile-select ha-select { width: 100%; }
      .tile-stepper-footer { display: flex; justify-content: center; }
      .stepper { display: flex; align-items: center; gap: 8px; }
      .stepper-btn {
        background: none; border: 1px solid var(--divider-color); border-radius: 50%;
        width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
        cursor: pointer; color: var(--primary-text-color); flex: none;
      }
      .stepper-value { min-width: 64px; text-align: center; font-variant-numeric: tabular-nums; }
      .native-select {
        background: var(--card-background-color); color: var(--primary-text-color);
        border: 1px solid var(--divider-color); border-radius: 4px; padding: 4px 8px;
      }

      .handcontrol-pad {
        display: grid; grid-template-columns: repeat(3, 48px); grid-template-rows: repeat(3, 48px);
        gap: 4px; justify-content: center; margin: 8px auto 0;
      }
      .handcontrol-north { grid-column: 2; grid-row: 1; }
      .handcontrol-west { grid-column: 1; grid-row: 2; }
      .handcontrol-center {
        grid-column: 2; grid-row: 2; display: flex; align-items: center; justify-content: center;
        color: var(--secondary-text-color);
      }
      .handcontrol-east { grid-column: 3; grid-row: 2; }
      .handcontrol-south { grid-column: 2; grid-row: 3; }
      .handcontrol-btn {
        border-radius: 50%; border: 1px solid var(--divider-color); background: none;
        display: flex; align-items: center; justify-content: center; cursor: pointer;
        color: var(--primary-text-color); touch-action: none; user-select: none;
      }
      .handcontrol-btn:active { background: var(--primary-color); color: var(--text-primary-color, #fff); }
      .handcontrol-btn:disabled { opacity: 0.3; cursor: default; }
    `;
  }
}

class HaIndiCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { tiles: [], ...config };
    this._composerType = this._composerType || "value";
    this._composerEntities = this._composerEntities || {};
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    // hass updates arrive on every state change system-wide. A full _render()
    // would wipe the composer's name field and any in-progress entity-picker
    // search/focus, so after the first paint just refresh the pickers in place.
    if (first || !this.shadowRoot || !this.shadowRoot.firstChild) {
      this._render();
      return;
    }
    this.shadowRoot.querySelectorAll("ha-entity-picker").forEach((picker) => {
      picker.hass = hass;
    });
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
    this._render();
  }

  _updateConfig(newConfig) {
    this._config = newConfig;
    fireEvent(this, "config-changed", { config: this._config });
    this._render();
  }

  _render() {
    if (!this.shadowRoot || !this._hass || !this._config) return;
    this.shadowRoot.innerHTML = `<style>${this._styles()}</style>`;
    const root = document.createElement("div");
    root.className = "editor";

    root.appendChild(this._buildGeneralFields());
    root.appendChild(this._buildSuggestionsEditor());
    root.appendChild(this._buildTileListEditor());
    root.appendChild(this._buildTileComposer());

    this.shadowRoot.appendChild(root);
  }

  _buildGeneralFields() {
    const wrap = document.createElement("div");
    wrap.className = "card-config";
    const titleField = document.createElement("ha-textfield");
    titleField.label = "Title";
    titleField.value = this._config.title || "";
    titleField.addEventListener("change", (ev) => {
      this._updateConfig({ ...this._config, title: ev.target.value });
    });
    wrap.appendChild(titleField);
    return wrap;
  }

  _buildSuggestionsEditor() {
    const devices = discoverIndiDevices(this._hass);
    const suggestions = [];
    devices.forEach((device) => {
      suggestTilesForDevice(device, this._hass).forEach((s) => suggestions.push(s));
    });

    if (!suggestions.length) return document.createDocumentFragment();

    const wrap = document.createElement("div");
    wrap.className = "suggestions";
    const heading = document.createElement("div");
    heading.className = "heading";
    heading.textContent = "Suggested tiles";
    wrap.appendChild(heading);

    suggestions.forEach((s) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "suggestion-btn";
      btn.textContent = `+ ${s.label}`;
      btn.addEventListener("click", () => {
        const tiles = [...(this._config.tiles || []), s.tile];
        this._updateConfig({ ...this._config, tiles });
      });
      wrap.appendChild(btn);
    });

    return wrap;
  }

  _buildTileListEditor() {
    const wrap = document.createElement("div");
    wrap.className = "tile-list";

    const heading = document.createElement("div");
    heading.className = "heading";
    heading.textContent = "Tiles";
    wrap.appendChild(heading);

    const tiles = this._config.tiles || [];
    if (!tiles.length) {
      const note = document.createElement("div");
      note.className = "note";
      note.textContent = "No tiles yet — add one below.";
      wrap.appendChild(note);
    }

    tiles.forEach((tile, index) => {
      const row = document.createElement("div");
      row.className = "tile-row";

      const label = document.createElement("span");
      label.className = "tile-row-label";
      label.textContent = this._describeTile(tile);
      row.appendChild(label);

      row.appendChild(
        this._buildIconButton("mdi:arrow-up", index === 0, () => {
          this._updateConfig({ ...this._config, tiles: arrayMove(tiles, index, index - 1) });
        })
      );
      row.appendChild(
        this._buildIconButton("mdi:arrow-down", index === tiles.length - 1, () => {
          this._updateConfig({ ...this._config, tiles: arrayMove(tiles, index, index + 1) });
        })
      );
      row.appendChild(
        this._buildIconButton("mdi:delete", false, () => {
          this._updateConfig({ ...this._config, tiles: tiles.filter((_, i) => i !== index) });
        })
      );

      wrap.appendChild(row);
    });

    return wrap;
  }

  _describeTile(tile) {
    const typeLabels = {
      value: "Value",
      toggle: "Toggle",
      select: "Dropdown",
      stepper: "Stepper",
      coordinate: "Coordinates",
      image: "Image",
      handcontrol: "Hand control",
    };
    const label = typeLabels[tile.type] || tile.type;
    return tile.name ? `${label} — ${tile.name}` : label;
  }

  _buildTileComposer() {
    const wrap = document.createElement("div");
    wrap.className = "composer";

    const heading = document.createElement("div");
    heading.className = "heading";
    heading.textContent = "Add a tile";
    wrap.appendChild(heading);

    const typeSelect = document.createElement("select");
    typeSelect.className = "native-select";
    TILE_TYPE_LABELS.forEach(([value, label]) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      typeSelect.appendChild(opt);
    });
    typeSelect.value = this._composerType;
    typeSelect.addEventListener("change", (ev) => {
      this._composerType = ev.target.value;
      this._composerEntities = {};
      this._render();
    });
    wrap.appendChild(typeSelect);

    const fieldsWrap = document.createElement("div");
    fieldsWrap.className = "composer-fields";
    wrap.appendChild(fieldsWrap);

    const nameField = document.createElement("ha-textfield");
    nameField.label = "Name (optional)";
    nameField.value = this._composerName || "";
    nameField.addEventListener("change", (ev) => {
      this._composerName = ev.target.value;
    });
    fieldsWrap.appendChild(nameField);

    const buildPicker = (label, domains) => {
      const picker = document.createElement("ha-entity-picker");
      picker.hass = this._hass;
      picker.label = label;
      if (domains) picker.includeDomains = domains;
      return picker;
    };

    const type = this._composerType;
    if (type === "coordinate") {
      const p1 = buildPicker("Entity 1 (e.g. RA)", ["sensor", "number", "input_number"]);
      p1.value = this._composerEntities.e1 || "";
      p1.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        this._composerEntities.e1 = ev.detail.value;
      });
      fieldsWrap.appendChild(p1);

      const p2 = buildPicker("Entity 2 (e.g. DEC)", ["sensor", "number", "input_number"]);
      p2.value = this._composerEntities.e2 || "";
      p2.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        this._composerEntities.e2 = ev.detail.value;
      });
      fieldsWrap.appendChild(p2);
    } else if (type === "handcontrol") {
      ["north", "south", "east", "west"].forEach((dir) => {
        const p = buildPicker(dir.charAt(0).toUpperCase() + dir.slice(1), ["switch"]);
        p.value = this._composerEntities[dir] || "";
        p.addEventListener("value-changed", (ev) => {
          ev.stopPropagation();
          this._composerEntities[dir] = ev.detail.value;
        });
        fieldsWrap.appendChild(p);
      });
    } else {
      const domains = type === "toggle" ? TOGGLE_DOMAINS : type === "select" ? ["select"] : type === "stepper" ? ["number", "input_number"] : type === "image" ? ["camera"] : undefined;
      const p = buildPicker("Entity", domains);
      p.value = this._composerEntities.entity || "";
      p.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        this._composerEntities.entity = ev.detail.value;
      });
      fieldsWrap.appendChild(p);
    }

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "add-section";
    addBtn.textContent = "+ Add tile";
    addBtn.addEventListener("click", () => {
      let tile;
      if (type === "coordinate") {
        const entities = [this._composerEntities.e1, this._composerEntities.e2].filter(Boolean);
        if (entities.length < 2) return;
        tile = { type: "coordinate", entities, name: this._composerName || undefined };
      } else if (type === "handcontrol") {
        const { north, south, east, west } = this._composerEntities;
        if (!north && !south && !east && !west) return;
        tile = { type: "handcontrol", north, south, east, west, name: this._composerName || undefined };
      } else {
        if (!this._composerEntities.entity) return;
        tile = { type, entity: this._composerEntities.entity, name: this._composerName || undefined };
      }
      const tiles = [...(this._config.tiles || []), tile];
      this._composerEntities = {};
      this._composerName = "";
      this._updateConfig({ ...this._config, tiles });
    });
    wrap.appendChild(addBtn);

    return wrap;
  }

  _buildIconButton(icon, disabled, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-btn";
    btn.disabled = disabled;
    const iconEl = document.createElement("ha-icon");
    iconEl.icon = icon;
    btn.appendChild(iconEl);
    btn.addEventListener("click", onClick);
    return btn;
  }

  _styles() {
    return `
      .editor { display: flex; flex-direction: column; gap: 16px; padding: 8px 0; }
      .card-config { display: flex; flex-direction: column; gap: 12px; }
      ha-textfield, ha-entity-picker { width: 100%; }
      .heading { font-weight: 500; color: var(--secondary-text-color); }
      .note { color: var(--secondary-text-color); font-size: 0.9em; }

      .suggestions { display: flex; flex-direction: column; gap: 4px; }
      .suggestion-btn {
        align-self: flex-start; background: none; border: 1px solid var(--divider-color);
        border-radius: 8px; padding: 6px 12px; cursor: pointer; color: var(--primary-color);
      }

      .tile-list { display: flex; flex-direction: column; gap: 4px; }
      .tile-row { display: flex; align-items: center; gap: 4px; padding: 4px 0; }
      .tile-row-label { flex: 1; }

      .composer {
        display: flex; flex-direction: column; gap: 8px;
        border-top: 1px solid var(--divider-color); padding-top: 12px;
      }
      .composer-fields { display: flex; flex-direction: column; gap: 8px; }
      .native-select {
        background: var(--card-background-color); color: var(--primary-text-color);
        border: 1px solid var(--divider-color); border-radius: 4px; padding: 8px;
      }

      .icon-btn {
        background: none; border: none; cursor: pointer; padding: 4px;
        color: var(--primary-text-color); display: flex; align-items: center;
      }
      .icon-btn:disabled { opacity: 0.3; cursor: default; }
      .add-section {
        align-self: flex-start; background: none; border: 1px dashed var(--divider-color);
        border-radius: 8px; padding: 8px 16px; cursor: pointer; color: var(--primary-color);
      }
    `;
  }
}

if (!customElements.get("ha-indi-card")) {
  customElements.define("ha-indi-card", HaIndiCard);
}
if (!customElements.get("ha-indi-card-editor")) {
  customElements.define("ha-indi-card-editor", HaIndiCardEditor);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-indi-card",
  name: "INDI Card",
  description:
    "A Home Assistant tile-style dashboard for ha-indi-client: combine only the entities you pick — readouts, toggles, a coordinate pair, a camera image, a mount hand control — into tiles, with smart suggestions from the entities ha-indi-client exposes.",
  preview: false,
});

console.info(
  `%c HA-INDI-CARD %c v${CARD_VERSION} `,
  "color: white; background: #039be5; font-weight: 700; border-radius: 4px 0 0 4px; padding: 2px 0 2px 8px;",
  "color: #039be5; background: white; font-weight: 700; border-radius: 0 4px 4px 0; padding: 2px 8px 2px 0;"
);
