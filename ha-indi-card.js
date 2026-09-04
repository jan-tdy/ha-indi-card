const CARD_VERSION = "1.0.0-beta.1";
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

const TOGGLE_DOMAINS = new Set(["switch", "input_boolean", "light", "fan"]);

const DEVICE_KIND_ICONS = {
  mount: "mdi:telescope",
  camera: "mdi:camera-iris",
  focuser: "mdi:image-filter-center-focus",
  filterwheel: "mdi:palette-swatch",
  dome: "mdi:garage",
  weather: "mdi:weather-partly-cloudy",
  hub: "mdi:server-network",
  generic: "mdi:chip",
};

const DEVICE_KIND_ORDER = ["mount", "camera", "focuser", "filterwheel", "dome", "weather", "generic", "hub"];

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

function deviceKindOf(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("mount") || n.includes("telescope")) return "mount";
  if (n.includes("ccd") || n.includes("camera") || n.includes("guide")) return "camera";
  if (n.includes("focus")) return "focuser";
  if (n.includes("filter")) return "filterwheel";
  if (n.includes("dome") || n.includes("roof") || n.includes("shutter")) return "dome";
  if (n.includes("weather") || n.includes("watchdog") || n.includes("sky")) return "weather";
  if (n.includes("server")) return "hub";
  return "generic";
}

/**
 * Groups every entity belonging to the ha-indi-client integration by its
 * INDI device, using the entity/device registry data Home Assistant exposes
 * on the hass object (no manual entity picking needed).
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

  const devices = Array.from(byDevice.entries()).map(([deviceId, entityIds]) => {
    const deviceEntry = hass.devices[deviceId];
    const name = (deviceEntry && (deviceEntry.name_by_user || deviceEntry.name)) || "INDI Device";
    entityIds.sort();
    return { id: deviceId, name, kind: deviceKindOf(name), entityIds };
  });

  devices.sort((a, b) => {
    const ai = DEVICE_KIND_ORDER.indexOf(a.kind);
    const bi = DEVICE_KIND_ORDER.indexOf(b.kind);
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });

  return devices;
}

function extractDeviceRoles(entityIds, hass) {
  let connected;
  let lastMessage;
  let camera;
  const rest = [];
  entityIds.forEach((entityId) => {
    const stateObj = hass.states[entityId];
    const domain = domainOf(entityId);
    const friendly = (stateObj && stateObj.attributes.friendly_name) || "";
    if (domain === "camera") {
      camera = entityId;
    } else if (domain === "switch" && /connected/i.test(friendly)) {
      connected = entityId;
    } else if (domain === "binary_sensor" && /server connected/i.test(friendly)) {
      connected = entityId;
    } else if (domain === "sensor" && /last message/i.test(friendly)) {
      lastMessage = entityId;
    } else {
      rest.push(entityId);
    }
  });
  return { connected, lastMessage, camera, rest };
}

class HaIndiCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("ha-indi-card-editor");
  }

  static getStubConfig(hass) {
    const entityIds = hass ? Object.keys(hass.states) : [];
    const camera = entityIds.find((id) => domainOf(id) === "camera");
    return {
      type: "custom:ha-indi-card",
      title: "INDI Observatory",
      auto_discover: true,
      camera_entity: camera || "",
      show_camera: true,
    };
  }

  setConfig(config) {
    if (!config || typeof config !== "object") {
      throw new Error("Invalid configuration");
    }
    if (config.sections != null && !Array.isArray(config.sections)) {
      throw new Error("Invalid configuration: sections must be a list");
    }
    const sections = (config.sections || []).map((section) => {
      if (!section || typeof section !== "object") {
        throw new Error("Invalid configuration: each section must be an object");
      }
      const entities = section.entities;
      if (entities != null && !Array.isArray(entities)) {
        throw new Error("Invalid configuration: section entities must be a list");
      }
      if (Array.isArray(entities) && entities.some((e) => typeof e !== "string")) {
        throw new Error("Invalid configuration: section entities must be a list of entity ids");
      }
      return { ...section, entities: entities || [] };
    });

    this._config = {
      show_camera: true,
      auto_discover: true,
      ...config,
      sections,
    };
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
    if (!this._config) return 1;
    const rows = (this._config.sections || []).reduce(
      (n, s) => n + 1 + (s.entities ? s.entities.length : 0),
      0
    );
    const deviceCount =
      this._config.auto_discover !== false
        ? discoverIndiDevices(this._hass, this._config.config_entry_id).filter((d) => d.kind !== "hub").length
        : 0;
    return 1 + (this._config.camera_entity && this._config.show_camera !== false ? 3 : 0) + rows + deviceCount * 3;
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (ev) => this._handleClick(ev));
    }
    this._render();
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

  _visibleDevices() {
    const config = this._config;
    if (config.auto_discover === false) return [];
    const devices = discoverIndiDevices(this._hass, config.config_entry_id);
    const hidden = new Set(config.hidden_devices || []);
    let visible = devices.filter((d) => d.kind !== "hub" && !hidden.has(d.id));
    if (Array.isArray(config.device_order) && config.device_order.length) {
      const orderIndex = new Map(config.device_order.map((id, i) => [id, i]));
      visible = visible.slice().sort((a, b) => {
        const ai = orderIndex.has(a.id) ? orderIndex.get(a.id) : 999;
        const bi = orderIndex.has(b.id) ? orderIndex.get(b.id) : 999;
        return ai - bi;
      });
    }
    return visible;
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

    this._headerEl.hidden = !config.title;
    this._headerEl.textContent = config.title || "";

    while (this._contentEl.firstChild) {
      this._contentEl.removeChild(this._contentEl.firstChild);
    }

    if (!hass) return;

    const autoDiscover = config.auto_discover !== false;
    const allDevices = autoDiscover ? discoverIndiDevices(hass, config.config_entry_id) : [];
    const hubDevice = allDevices.find((d) => d.kind === "hub");
    if (hubDevice) {
      const { connected } = extractDeviceRoles(hubDevice.entityIds, hass);
      if (connected) {
        this._contentEl.appendChild(this._buildHubStatusEl(connected, hass));
      }
    }

    const cameraObj = config.camera_entity ? hass.states[config.camera_entity] : undefined;
    const showCamera = config.show_camera !== false && !!cameraObj;
    if (showCamera) {
      this._contentEl.appendChild(this._buildCameraEl(config.camera_entity, cameraObj));
    }

    const visibleDevices = this._visibleDevices();
    visibleDevices.forEach((device) => {
      this._contentEl.appendChild(this._buildDevicePanelEl(device, hass));
    });

    const sections = config.sections || [];
    if (sections.length && (visibleDevices.length || showCamera)) {
      const divider = document.createElement("div");
      divider.className = "section-title";
      divider.textContent = "Other entities";
      this._contentEl.appendChild(divider);
    }
    sections.forEach((section) => {
      this._contentEl.appendChild(this._buildSectionEl(section, hass));
    });

    const isEmpty = !showCamera && !visibleDevices.length && sections.every((s) => !(s.entities || []).length);
    if (isEmpty) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = autoDiscover
        ? "No ha-indi-client devices found yet. Make sure the integration is set up, or add entities manually in the card editor."
        : "Add entities in the card editor.";
      this._contentEl.appendChild(empty);
    }
  }

  _buildHubStatusEl(entityId, hass) {
    const stateObj = hass.states[entityId];
    const on = !!stateObj && stateObj.state === "on";
    const wrap = document.createElement("div");
    wrap.className = "hub-status";
    wrap.dataset.moreInfo = entityId;
    const dot = document.createElement("span");
    dot.className = `status-dot ${on ? "status-on" : "status-off"}`;
    wrap.appendChild(dot);
    const label = document.createElement("span");
    label.textContent = on ? "INDI server connected" : "INDI server disconnected";
    wrap.appendChild(label);
    return wrap;
  }

  _buildDevicePanelEl(device, hass) {
    const { connected, lastMessage, camera, rest } = extractDeviceRoles(device.entityIds, hass);

    const panel = document.createElement("div");
    panel.className = "device-panel";

    const header = document.createElement("div");
    header.className = "device-header";

    const iconEl = document.createElement("ha-icon");
    iconEl.icon = DEVICE_KIND_ICONS[device.kind] || DEVICE_KIND_ICONS.generic;
    header.appendChild(iconEl);

    const nameEl = document.createElement("span");
    nameEl.className = "device-name";
    nameEl.textContent = device.name;
    header.appendChild(nameEl);

    if (connected) {
      const connStateObj = hass.states[connected];
      if (domainOf(connected) === "switch") {
        const toggle = document.createElement("ha-switch");
        toggle.dataset.toggle = connected;
        toggle.checked = !!connStateObj && connStateObj.state === "on";
        header.appendChild(toggle);
      } else {
        const dot = document.createElement("span");
        dot.className = `status-dot ${connStateObj && connStateObj.state === "on" ? "status-on" : "status-off"}`;
        dot.dataset.moreInfo = connected;
        header.appendChild(dot);
      }
    }

    panel.appendChild(header);

    const body = document.createElement("div");
    body.className = "device-body";

    if (camera) {
      const cameraObj = hass.states[camera];
      if (cameraObj) body.appendChild(this._buildCameraEl(camera, cameraObj));
    }

    rest.forEach((entityId) => {
      body.appendChild(this._buildRowEl(entityId, hass));
    });

    panel.appendChild(body);

    if (lastMessage) {
      const msgObj = hass.states[lastMessage];
      const footer = document.createElement("div");
      footer.className = "device-footer";
      footer.dataset.moreInfo = lastMessage;
      footer.textContent = msgObj ? msgObj.state : "";
      panel.appendChild(footer);
    }

    return panel;
  }

  _buildCameraEl(entityId, stateObj) {
    const wrap = document.createElement("div");
    wrap.className = "camera";
    wrap.dataset.moreInfo = entityId;
    if (stateObj.attributes.entity_picture) {
      const img = document.createElement("img");
      img.src = stateObj.attributes.entity_picture;
      img.alt = stateObj.attributes.friendly_name || entityId;
      wrap.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "camera-placeholder";
      placeholder.textContent = "No image";
      wrap.appendChild(placeholder);
    }
    return wrap;
  }

  _buildSectionEl(section, hass) {
    const box = document.createElement("div");
    box.className = "section";
    if (section.title) {
      const title = document.createElement("div");
      title.className = "section-title";
      title.textContent = section.title;
      box.appendChild(title);
    }
    (section.entities || []).forEach((entityId) => {
      box.appendChild(this._buildRowEl(entityId, hass));
    });
    return box;
  }

  _buildRowEl(entityId, hass) {
    const stateObj = hass ? hass.states[entityId] : undefined;
    const domain = domainOf(entityId);
    const unavailable = !stateObj;
    const name = (stateObj && stateObj.attributes.friendly_name) || entityId;
    const icon = (stateObj && stateObj.attributes.icon) || FALLBACK_ICONS[domain] || "mdi:information-outline";

    const row = document.createElement("div");
    row.className = "row";
    row.dataset.moreInfo = entityId;

    const iconEl = document.createElement("ha-icon");
    iconEl.icon = icon;
    row.appendChild(iconEl);

    const nameEl = document.createElement("span");
    nameEl.className = "name";
    nameEl.textContent = name;
    row.appendChild(nameEl);

    if (unavailable) {
      const stateEl = document.createElement("span");
      stateEl.className = "state";
      stateEl.textContent = "unavailable";
      row.appendChild(stateEl);
    } else if (TOGGLE_DOMAINS.has(domain)) {
      const toggle = document.createElement("ha-switch");
      toggle.dataset.toggle = entityId;
      toggle.checked = stateObj.state === "on";
      row.appendChild(toggle);
    } else if (domain === "select") {
      row.appendChild(this._buildSelectEl(entityId, stateObj));
    } else if (domain === "number" || domain === "input_number") {
      row.appendChild(this._buildStepperEl(entityId, stateObj));
    } else {
      const stateEl = document.createElement("span");
      stateEl.className = "state";
      stateEl.textContent = formatState(hass, stateObj);
      row.appendChild(stateEl);
    }

    return row;
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
      .card-content { padding: 8px 16px 16px; display: flex; flex-direction: column; gap: 4px; }
      .hub-status {
        display: flex; align-items: center; gap: 8px; padding: 0 0 8px; cursor: pointer;
        color: var(--secondary-text-color); font-size: 0.85em;
      }
      .status-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
      .status-on { background: var(--success-color, #43a047); }
      .status-off { background: var(--error-color, #db4437); }
      .camera { border-radius: 8px; overflow: hidden; cursor: pointer; margin-bottom: 8px; line-height: 0; }
      .camera img { width: 100%; display: block; }
      .camera-placeholder { padding: 32px; text-align: center; color: var(--secondary-text-color); }
      .device-panel {
        border: 1px solid var(--divider-color); border-radius: 12px; padding: 12px; margin-bottom: 12px;
      }
      .device-header { display: flex; align-items: center; gap: 8px; font-weight: 500; margin-bottom: 8px; }
      .device-header ha-icon { color: var(--state-icon-color, var(--paper-item-icon-color)); }
      .device-header ha-switch, .device-header .status-dot { margin-left: auto; }
      .device-name { flex: 1; }
      .device-body { display: flex; flex-direction: column; gap: 4px; }
      .device-footer {
        margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--divider-color);
        font-size: 0.8em; font-style: italic; color: var(--secondary-text-color); cursor: pointer;
      }
      .section-title {
        font-weight: 500; color: var(--secondary-text-color); margin: 8px 0 2px;
        text-transform: uppercase; font-size: 0.75em; letter-spacing: 0.05em;
      }
      .row { display: flex; align-items: center; gap: 12px; padding: 6px 0; cursor: pointer; }
      .row ha-icon { color: var(--state-icon-color, var(--paper-item-icon-color)); }
      .name { flex: 1; }
      .state { color: var(--secondary-text-color); }
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
      ha-select { width: 160px; }
      .empty { color: var(--secondary-text-color); padding: 16px 0; text-align: center; }
    `;
  }
}

class HaIndiCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = {
      show_camera: true,
      auto_discover: true,
      sections: [],
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
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
    root.appendChild(this._buildAutoDiscoverField());
    root.appendChild(this._buildDevicesEditor());
    root.appendChild(this._buildSectionsEditor());

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

    const cameraRow = document.createElement("div");
    cameraRow.className = "row";

    const cameraPicker = document.createElement("ha-entity-picker");
    cameraPicker.hass = this._hass;
    cameraPicker.label = "Camera entity (optional)";
    cameraPicker.value = this._config.camera_entity || "";
    cameraPicker.includeDomains = ["camera"];
    cameraPicker.style.flex = "1";
    cameraPicker.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      this._updateConfig({ ...this._config, camera_entity: ev.detail.value || "" });
    });
    cameraRow.appendChild(cameraPicker);
    wrap.appendChild(cameraRow);

    if (this._config.camera_entity) {
      const switchField = document.createElement("ha-formfield");
      switchField.label = "Show camera image";
      const switchEl = document.createElement("ha-switch");
      switchEl.checked = this._config.show_camera !== false;
      switchEl.addEventListener("change", (ev) => {
        this._updateConfig({ ...this._config, show_camera: ev.target.checked });
      });
      switchField.appendChild(switchEl);
      wrap.appendChild(switchField);
    }

    return wrap;
  }

  _buildAutoDiscoverField() {
    const wrap = document.createElement("div");
    wrap.className = "card-config";

    const field = document.createElement("ha-formfield");
    field.label = "Auto-discover ha-indi-client devices";
    const switchEl = document.createElement("ha-switch");
    switchEl.checked = this._config.auto_discover !== false;
    switchEl.addEventListener("change", (ev) => {
      this._updateConfig({ ...this._config, auto_discover: ev.target.checked });
    });
    field.appendChild(switchEl);
    wrap.appendChild(field);

    return wrap;
  }

  _buildDevicesEditor() {
    if (this._config.auto_discover === false) return document.createDocumentFragment();

    const devices = discoverIndiDevices(this._hass, this._config.config_entry_id).filter((d) => d.kind !== "hub");
    const wrap = document.createElement("div");
    wrap.className = "devices";

    const heading = document.createElement("div");
    heading.className = "heading";
    heading.textContent = "Discovered devices";
    wrap.appendChild(heading);

    if (!devices.length) {
      const note = document.createElement("div");
      note.className = "note";
      note.textContent = "No ha-indi-client devices found yet.";
      wrap.appendChild(note);
      return wrap;
    }

    const hidden = new Set(this._config.hidden_devices || []);
    const orderIndex = new Map((this._config.device_order || []).map((id, i) => [id, i]));
    const ordered = devices.slice().sort((a, b) => {
      const ai = orderIndex.has(a.id) ? orderIndex.get(a.id) : devices.indexOf(a);
      const bi = orderIndex.has(b.id) ? orderIndex.get(b.id) : devices.indexOf(b);
      return ai - bi;
    });

    ordered.forEach((device, index) => {
      const row = document.createElement("div");
      row.className = "device-row";
      if (hidden.has(device.id)) row.classList.add("device-hidden");

      const iconEl = document.createElement("ha-icon");
      iconEl.icon = DEVICE_KIND_ICONS[device.kind] || DEVICE_KIND_ICONS.generic;
      row.appendChild(iconEl);

      const nameEl = document.createElement("span");
      nameEl.className = "device-row-name";
      nameEl.textContent = device.name;
      row.appendChild(nameEl);

      row.appendChild(
        this._buildIconButton("mdi:arrow-up", index === 0, () => {
          const newOrder = ordered.map((d) => d.id);
          [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
          this._updateConfig({ ...this._config, device_order: newOrder });
        })
      );
      row.appendChild(
        this._buildIconButton("mdi:arrow-down", index === ordered.length - 1, () => {
          const newOrder = ordered.map((d) => d.id);
          [newOrder[index + 1], newOrder[index]] = [newOrder[index], newOrder[index + 1]];
          this._updateConfig({ ...this._config, device_order: newOrder });
        })
      );

      const isHidden = hidden.has(device.id);
      row.appendChild(
        this._buildIconButton(isHidden ? "mdi:eye-off" : "mdi:eye", false, () => {
          const newHidden = new Set(this._config.hidden_devices || []);
          if (isHidden) {
            newHidden.delete(device.id);
          } else {
            newHidden.add(device.id);
          }
          this._updateConfig({ ...this._config, hidden_devices: Array.from(newHidden) });
        })
      );

      wrap.appendChild(row);
    });

    return wrap;
  }

  _buildSectionsEditor() {
    const wrap = document.createElement("div");
    wrap.className = "sections";

    const heading = document.createElement("div");
    heading.className = "heading";
    heading.textContent = "Extra entities (advanced)";
    wrap.appendChild(heading);

    const sections = this._config.sections || [];
    sections.forEach((section, index) => {
      wrap.appendChild(this._buildSectionEditor(section, index, sections.length));
    });

    const addSectionBtn = document.createElement("button");
    addSectionBtn.className = "add-section";
    addSectionBtn.type = "button";
    addSectionBtn.textContent = "+ Add section";
    addSectionBtn.addEventListener("click", () => {
      const newSections = [...sections, { title: "New section", entities: [] }];
      this._updateConfig({ ...this._config, sections: newSections });
    });
    wrap.appendChild(addSectionBtn);

    return wrap;
  }

  _buildSectionEditor(section, index, total) {
    const sections = this._config.sections;
    const box = document.createElement("div");
    box.className = "section-box";

    const header = document.createElement("div");
    header.className = "section-header";

    const titleField = document.createElement("ha-textfield");
    titleField.label = "Section title";
    titleField.value = section.title || "";
    titleField.style.flex = "1";
    titleField.addEventListener("change", (ev) => {
      const newSections = sections.map((s, i) => (i === index ? { ...s, title: ev.target.value } : s));
      this._updateConfig({ ...this._config, sections: newSections });
    });
    header.appendChild(titleField);

    header.appendChild(
      this._buildIconButton("mdi:arrow-up", index === 0, () => {
        this._updateConfig({ ...this._config, sections: arrayMove(sections, index, index - 1) });
      })
    );
    header.appendChild(
      this._buildIconButton("mdi:arrow-down", index === total - 1, () => {
        this._updateConfig({ ...this._config, sections: arrayMove(sections, index, index + 1) });
      })
    );
    header.appendChild(
      this._buildIconButton("mdi:delete", false, () => {
        const newSections = sections.filter((_, i) => i !== index);
        this._updateConfig({ ...this._config, sections: newSections });
      })
    );

    box.appendChild(header);

    const entities = section.entities || [];
    entities.forEach((entityId, entIndex) => {
      box.appendChild(this._buildEntityRow(index, entIndex, entityId, entities.length));
    });

    const addPicker = document.createElement("ha-entity-picker");
    addPicker.hass = this._hass;
    addPicker.label = "Add entity";
    addPicker.value = "";
    addPicker.style.marginTop = "4px";
    addPicker.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      const value = ev.detail.value;
      if (!value) return;
      const newSections = sections.map((s, i) =>
        i === index ? { ...s, entities: [...(s.entities || []), value] } : s
      );
      this._updateConfig({ ...this._config, sections: newSections });
    });
    box.appendChild(addPicker);

    return box;
  }

  _buildEntityRow(sectionIndex, entIndex, entityId, total) {
    const sections = this._config.sections;
    const row = document.createElement("div");
    row.className = "entity-row";

    const picker = document.createElement("ha-entity-picker");
    picker.hass = this._hass;
    picker.value = entityId;
    picker.style.flex = "1";
    picker.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      const value = ev.detail.value;
      const newSections = sections.map((s, i) => {
        if (i !== sectionIndex) return s;
        const newEntities = value
          ? s.entities.map((e, j) => (j === entIndex ? value : e))
          : s.entities.filter((_, j) => j !== entIndex);
        return { ...s, entities: newEntities };
      });
      this._updateConfig({ ...this._config, sections: newSections });
    });
    row.appendChild(picker);

    row.appendChild(
      this._buildIconButton("mdi:arrow-up", entIndex === 0, () => {
        const newSections = sections.map((s, i) =>
          i === sectionIndex ? { ...s, entities: arrayMove(s.entities, entIndex, entIndex - 1) } : s
        );
        this._updateConfig({ ...this._config, sections: newSections });
      })
    );
    row.appendChild(
      this._buildIconButton("mdi:arrow-down", entIndex === total - 1, () => {
        const newSections = sections.map((s, i) =>
          i === sectionIndex ? { ...s, entities: arrayMove(s.entities, entIndex, entIndex + 1) } : s
        );
        this._updateConfig({ ...this._config, sections: newSections });
      })
    );
    row.appendChild(
      this._buildIconButton("mdi:delete", false, () => {
        const newSections = sections.map((s, i) =>
          i === sectionIndex ? { ...s, entities: s.entities.filter((_, j) => j !== entIndex) } : s
        );
        this._updateConfig({ ...this._config, sections: newSections });
      })
    );

    return row;
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
      .row { display: flex; align-items: center; gap: 8px; }
      ha-textfield, ha-entity-picker { width: 100%; }
      .heading { font-weight: 500; color: var(--secondary-text-color); }
      .devices { display: flex; flex-direction: column; gap: 4px; }
      .device-row { display: flex; align-items: center; gap: 4px; padding: 4px 0; }
      .device-row-name { flex: 1; }
      .device-hidden { opacity: 0.5; }
      .note { color: var(--secondary-text-color); font-size: 0.9em; }
      .sections { display: flex; flex-direction: column; gap: 12px; }
      .section-box {
        border: 1px solid var(--divider-color); border-radius: 8px; padding: 12px;
        display: flex; flex-direction: column; gap: 8px;
      }
      .section-header { display: flex; align-items: center; gap: 4px; }
      .entity-row { display: flex; align-items: center; gap: 4px; }
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
    "CCDciel-style dashboard for ha-indi-client: auto-discovers your INDI devices and lays them out as control panels, with an optional live camera image.",
  preview: false,
});

console.info(
  `%c HA-INDI-CARD %c v${CARD_VERSION} `,
  "color: white; background: #039be5; font-weight: 700; border-radius: 4px 0 0 4px; padding: 2px 0 2px 8px;",
  "color: #039be5; background: white; font-weight: 700; border-radius: 0 4px 4px 0; padding: 2px 8px 2px 0;"
);
