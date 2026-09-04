const CARD_VERSION = "1.0.0-beta.0";

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
  cover: "mdi:window-shutter",
  lock: "mdi:lock-outline",
  climate: "mdi:thermostat",
};

const TOGGLE_DOMAINS = new Set(["switch", "input_boolean", "light", "fan"]);

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

class HaIndiCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("ha-indi-card-editor");
  }

  static getStubConfig(hass) {
    const entityIds = hass ? Object.keys(hass.states) : [];
    const camera = entityIds.find((id) => domainOf(id) === "camera");
    const others = entityIds.filter((id) => domainOf(id) !== "camera").slice(0, 3);
    return {
      type: "custom:ha-indi-card",
      title: "INDI Observatory",
      camera_entity: camera || "",
      show_camera: true,
      sections: others.length ? [{ title: "Status", entities: others }] : [],
    };
  }

  setConfig(config) {
    if (!config || typeof config !== "object") {
      throw new Error("Invalid configuration");
    }
    this._config = {
      show_camera: true,
      sections: [],
      ...config,
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
    return 1 + (this._config.camera_entity && this._config.show_camera !== false ? 3 : 0) + rows;
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

    const cameraObj = config.camera_entity && hass ? hass.states[config.camera_entity] : undefined;
    const showCamera = config.show_camera !== false && !!cameraObj;
    if (showCamera) {
      this._contentEl.appendChild(this._buildCameraEl(config.camera_entity, cameraObj));
    }

    const sections = config.sections || [];
    sections.forEach((section) => {
      this._contentEl.appendChild(this._buildSectionEl(section, hass));
    });

    const isEmpty = !showCamera && sections.every((s) => !(s.entities || []).length);
    if (isEmpty) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Add entities in the card editor.";
      this._contentEl.appendChild(empty);
    }
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

    if (!unavailable && TOGGLE_DOMAINS.has(domain)) {
      const toggle = document.createElement("ha-switch");
      toggle.dataset.toggle = entityId;
      toggle.checked = stateObj.state === "on";
      row.appendChild(toggle);
    } else {
      const stateEl = document.createElement("span");
      stateEl.className = "state";
      stateEl.textContent = unavailable ? "unavailable" : formatState(hass, stateObj);
      row.appendChild(stateEl);
    }

    return row;
  }

  _styles() {
    return `
      ha-card { display: flex; flex-direction: column; }
      .card-header { font-size: 1.2em; font-weight: 500; padding: 16px 16px 0; }
      .card-content { padding: 8px 16px 16px; display: flex; flex-direction: column; gap: 4px; }
      .camera { border-radius: 8px; overflow: hidden; cursor: pointer; margin-bottom: 8px; line-height: 0; }
      .camera img { width: 100%; display: block; }
      .camera-placeholder { padding: 32px; text-align: center; color: var(--secondary-text-color); }
      .section-title {
        font-weight: 500; color: var(--secondary-text-color); margin: 8px 0 2px;
        text-transform: uppercase; font-size: 0.75em; letter-spacing: 0.05em;
      }
      .row { display: flex; align-items: center; gap: 12px; padding: 6px 0; cursor: pointer; }
      .row ha-icon { color: var(--state-icon-color, var(--paper-item-icon-color)); }
      .name { flex: 1; }
      .state { color: var(--secondary-text-color); }
      .empty { color: var(--secondary-text-color); padding: 16px 0; text-align: center; }
    `;
  }
}

class HaIndiCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = {
      show_camera: true,
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

  _buildSectionsEditor() {
    const wrap = document.createElement("div");
    wrap.className = "sections";

    const heading = document.createElement("div");
    heading.className = "heading";
    heading.textContent = "Layout: sections & entities";
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
  description: "Advanced card for ha-indi-client: pick entities and an optional live camera image, arranged into sections.",
  preview: false,
});

console.info(
  `%c HA-INDI-CARD %c v${CARD_VERSION} `,
  "color: white; background: #039be5; font-weight: 700; border-radius: 4px 0 0 4px; padding: 2px 0 2px 8px;",
  "color: #039be5; background: white; font-weight: 700; border-radius: 0 4px 4px 0; padding: 2px 8px 2px 0;"
);
