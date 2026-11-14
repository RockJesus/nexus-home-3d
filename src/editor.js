/**
 * 可视化编辑器：楼层 / 房间 / 实体全在这里加删。
 * 表单只构建一次（_build），之后只同步值（_syncForm），避免输入时丢焦点。
 */
import {
  ENTITY_KEYS,
  KIND_LABEL,
  ROOM_KINDS,
  SIZES,
  esc,
  normalizeKind,
  sizeKey,
  uid,
} from "./shared.js";

const STYLE = `
:host{display:block;--accent:#00E7FF;--alert:#FF2D95}
.editor{background:#0b1017;border:1px solid rgba(0,231,255,.18);border-radius:10px;padding:14px;color:#d9e8f2;
  font-family:"PingFang SC","Microsoft YaHei","Segoe UI",system-ui,sans-serif;font-size:13px}
.sec{margin-bottom:18px}
.sec h4{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--accent);margin:0 0 10px;font-weight:600}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px}
.field{display:flex;flex-direction:column;gap:4px;flex:1;min-width:130px}
.field.wide{flex:2 1 240px}
.field label{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#6b7f93}
input[type=text],input[type=number],select{
  width:100%;background:#04070b;border:1px solid rgba(0,231,255,.22);color:#d9e8f2;
  padding:8px 10px;font-size:13px;font-family:inherit;outline:0;border-radius:4px;box-sizing:border-box}
input:focus,select:focus{border-color:var(--accent);box-shadow:0 0 12px rgba(0,231,255,.18)}
input[type=color]{width:100%;height:34px;padding:2px;background:#04070b;border:1px solid rgba(0,231,255,.22);border-radius:4px}
.check{display:flex;align-items:center;gap:8px;font-size:12px;color:#9fb4c4;padding-bottom:6px}
.check input{width:16px;height:16px;accent-color:#00E7FF}

.floor{border:1px solid rgba(0,231,255,.14);border-radius:6px;padding:10px;margin-bottom:10px;background:rgba(255,255,255,.02)}
.floor .fhead{display:flex;gap:8px;align-items:flex-end}
.floor .fhead .field{min-width:110px}
.room{border-top:1px solid rgba(0,231,255,.1);margin-top:10px;padding-top:10px}
.rhead2{display:flex;gap:8px;align-items:flex-end;margin-bottom:8px}
.ents{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px}
.entf{display:flex;flex-direction:column;gap:3px}
.entf label{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#5f7489}
.btn{background:none;border:1px solid rgba(0,231,255,.28);color:#8fa6b7;padding:7px 11px;font-size:11px;
  letter-spacing:.1em;cursor:pointer;border-radius:4px;font-family:inherit;transition:.2s;white-space:nowrap}
.btn:hover{color:var(--accent);border-color:var(--accent)}
.btn.danger{color:#ff6aa5;border-color:rgba(255,45,149,.35)}
.btn.danger:hover{color:#fff;background:rgba(255,45,149,.18);border-color:var(--alert)}
.btn.add{color:var(--accent);border-style:dashed}
.hintline{font-size:11px;color:#5f7489;line-height:1.7;margin:2px 0 10px}
`;

class NexusHome3DEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = null;
    this._built = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (this._built) this._bindPickers();
  }

  setConfig(config) {
    this._config = normalizeLoose(config);
    if (!this._built) {
      this._build();
      this._built = true;
    } else {
      this._syncForm();
    }
  }

  /* ---------------- 构建 ---------------- */

  _build() {
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
      <div class="editor">
        <div class="sec">
          <h4>基础</h4>
          <div class="row">
            <div class="field wide"><label>标题</label><input type="text" data-cfg="title"></div>
            <div class="field wide"><label>副标题</label><input type="text" data-cfg="subtitle"></div>
          </div>
          <div class="row">
            <div class="field"><label>高度 (px)</label><input type="number" data-cfg="height" min="320" step="20"></div>
            <div class="field"><label>主霓虹</label><input type="color" data-cfg="theme.accent"></div>
            <div class="field"><label>选中 / 告警</label><input type="color" data-cfg="theme.alert"></div>
            <div class="field"><label>旋转速度</label><input type="number" data-cfg="camera.speed" step="0.0005" min="0"></div>
          </div>
          <div class="row">
            <div class="check"><input type="checkbox" data-cfg="camera.auto_rotate"><span>自动旋转</span></div>
            <div class="check"><input type="checkbox" data-cfg="theme.scanlines"><span>扫描线</span></div>
          </div>
        </div>
        <div class="sec">
          <div class="row" style="justify-content:space-between;align-items:center">
            <h4 style="margin:0">楼层与房间</h4>
            <button class="btn add" data-act="add-floor">＋ 新增楼层</button>
          </div>
          <div class="hintline">房间尺寸决定体块大小，位置自动排布；车库会带一扇升降门。</div>
          <div data-floors></div>
        </div>
      </div>`;

    this._fields = {};
    this.shadowRoot.querySelectorAll("[data-cfg]").forEach((el) => {
      this._fields[el.dataset.cfg] = el;
      const event = el.type === "checkbox" || el.type === "color" ? "change" : "input";
      el.addEventListener(event, () => this._onField(el));
    });
    this.shadowRoot.querySelector('[data-act="add-floor"]').addEventListener("click", () => {
      const level = Math.max(-1, ...this._config.floors.map((f) => Number(f.level) || 0)) + 1;
      this._config.floors.push({
        id: uid("f"),
        name: `${level} 层`,
        level,
        rooms: [],
      });
      this._rebuildFloors();
      this._emit();
    });

    this._rebuildFloors();
    this._syncForm();
  }

  _onField(el) {
    const path = el.dataset.cfg;
    const value = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) : el.value;
    setPath(this._config, path, value);
    this._emit();
  }

  /* ---------------- 楼层 / 房间 ---------------- */

  _rebuildFloors() {
    const host = this.shadowRoot.querySelector("[data-floors]");
    if (!host) return;

    if (!this._config.floors.length) {
      host.innerHTML = `<div class="hintline">还没有楼层，点上面的「新增楼层」开始。</div>`;
      return;
    }

    host.innerHTML = this._config.floors
      .map((floor, fi) => {
        const rooms = (floor.rooms || [])
          .map((room, ri) => this._roomMarkup(floor, room, fi, ri))
          .join("");
        return `<div class="floor" data-floor-index="${fi}">
          <div class="fhead">
            <div class="field" style="flex:2"><label>楼层名称</label>
              <input type="text" data-floor-name="${fi}" value="${esc(floor.name)}"></div>
            <div class="field" style="max-width:96px"><label>楼层序号</label>
              <input type="number" data-floor-level="${fi}" value="${Number(floor.level) || 0}"></div>
            <button class="btn danger" data-del-floor="${fi}">删除楼层</button>
          </div>
          ${rooms || '<div class="hintline" style="margin:10px 0 0">这一层还没有房间。</div>'}
          <div style="margin-top:10px"><button class="btn add" data-add-room="${fi}">＋ 新增房间 / 车库</button></div>
        </div>`;
      })
      .join("");

    this._bindFloorEvents();
    this._bindPickers();
  }

  _roomMarkup(floor, room, fi, ri) {
    const key = sizeKey(room.size);
    const sizes = Object.keys(SIZES)
      .map((k) => `<option value="${k}"${k === key ? " selected" : ""}>${k.toUpperCase()} ${SIZES[k][0]}×${SIZES[k][1]}</option>`)
      .join("");
    const ents = ENTITY_KEYS.map((entityKey) => {
      const value = room.entities && room.entities[entityKey] ? room.entities[entityKey] : "";
      const id = `ent-${fi}-${ri}-${entityKey}`;
      return `<div class="entf">
        <label>${KIND_LABEL[entityKey]}</label>
        <input type="text" id="${id}" data-ent="${fi}:${ri}:${entityKey}" value="${esc(value)}"
               placeholder="entity_id" spellcheck="false">
      </div>`;
    }).join("");

    return `<div class="room" data-room-index="${ri}" data-parent-floor="${fi}">
      <div class="rhead2">
        <div class="field" style="flex:2"><label>房间名称</label>
          <input type="text" data-room-name="${fi}:${ri}" value="${esc(room.name)}"></div>
        <div class="field" style="max-width:132px"><label>尺寸</label>
          <select data-room-size="${fi}:${ri}">${sizes}</select></div>
        <div class="field" style="max-width:110px"><label>类型</label>
          <select data-room-kind="${fi}:${ri}">
${Object.keys(ROOM_KINDS)
  .map((k) => `<option value="${k}"${room.kind === k ? " selected" : ""}>${ROOM_KINDS[k]}</option>`)
  .join("")}
          </select></div>
        <button class="btn danger" data-del-room="${fi}:${ri}">删除</button>
      </div>
      <div class="ents">${ents}</div>
    </div>`;
  }

  _bindFloorEvents() {
    const host = this.shadowRoot.querySelector("[data-floors]");

    host.querySelectorAll("[data-floor-name]").forEach((el) => {
      el.addEventListener("input", () => {
        this._config.floors[Number(el.dataset.floorName)].name = el.value;
        this._emit();
      });
    });

    host.querySelectorAll("[data-floor-level]").forEach((el) => {
      el.addEventListener("input", () => {
        this._config.floors[Number(el.dataset.floorLevel)].level = Number(el.value) || 0;
        this._emit();
      });
    });

    host.querySelectorAll("[data-del-floor]").forEach((el) => {
      el.addEventListener("click", () => {
        this._config.floors.splice(Number(el.dataset.delFloor), 1);
        this._rebuildFloors();
        this._emit();
      });
    });

    host.querySelectorAll("[data-add-room]").forEach((el) => {
      el.addEventListener("click", () => {
        const fi = Number(el.dataset.addRoom);
        this._config.floors[fi].rooms.push({
          id: uid("r"),
          name: "新房间",
          kind: normalizeKind("", "新房间"),
          size: "m",
          entities: {},
        });
        this._rebuildFloors();
        this._emit();
      });
    });

    host.querySelectorAll("[data-room-name]").forEach((el) => {
      el.addEventListener("input", () => {
        const [fi, ri] = el.dataset.roomName.split(":").map(Number);
        this._config.floors[fi].rooms[ri].name = el.value;
        this._emit();
      });
    });

    host.querySelectorAll("[data-room-size]").forEach((el) => {
      el.addEventListener("change", () => {
        const [fi, ri] = el.dataset.roomSize.split(":").map(Number);
        this._config.floors[fi].rooms[ri].size = el.value;
        this._emit();
      });
    });

    host.querySelectorAll("[data-room-kind]").forEach((el) => {
      el.addEventListener("change", () => {
        const [fi, ri] = el.dataset.roomKind.split(":").map(Number);
        this._config.floors[fi].rooms[ri].kind = el.value;
        this._emit();
      });
    });

    host.querySelectorAll("[data-del-room]").forEach((el) => {
      el.addEventListener("click", () => {
        const [fi, ri] = el.dataset.delRoom.split(":").map(Number);
        this._config.floors[fi].rooms.splice(ri, 1);
        this._rebuildFloors();
        this._emit();
      });
    });

    host.querySelectorAll("[data-ent]").forEach((el) => {
      el.addEventListener("input", () => {
        const [fi, ri, key] = el.dataset.ent.split(":");
        const room = this._config.floors[Number(fi)].rooms[Number(ri)];
        const value = el.value.trim();
        room.entities = room.entities || {};
        if (value) room.entities[key] = value;
        else delete room.entities[key];
        this._emit();
      });
    });
  }

  /** 有原生实体选择器就升级成选择器，没有就用文本输入兜底 */
  _bindPickers() {
    if (!this._hass) return;
    const host = this.shadowRoot.querySelector("[data-floors]");
    if (!host) return;
    if (!customElements.get("ha-entity-picker")) return;

    host.querySelectorAll("[data-ent]").forEach((el) => {
      if (el.dataset.upgraded === "1") return;
      const input = document.createElement("ha-entity-picker");
      input.hass = this._hass;
      input.value = el.value || "";
      input.allowCustomEntity = true;
      input.style.width = "100%";
      input.dataset.ent = el.dataset.ent;
      input.dataset.upgraded = "1";
      input.addEventListener("value-changed", (event) => {
        const [fi, ri, key] = input.dataset.ent.split(":");
        const room = this._config.floors[Number(fi)].rooms[Number(ri)];
        room.entities = room.entities || {};
        if (event.detail.value) room.entities[key] = event.detail.value;
        else delete room.entities[key];
        this._emit();
      });
      el.replaceWith(input);
    });
  }

  /* ---------------- 同步与派发 ---------------- */

  _syncForm() {
    if (!this._fields) return;
    Object.keys(this._fields).forEach((path) => {
      const el = this._fields[path];
      const value = getPath(this._config, path);
      if (el.type === "checkbox") el.checked = !!value;
      else el.value = value == null ? "" : value;
    });
  }

  _emit() {
    this._syncForm();
    this._config.type = `custom:${"nexus-home-3d"}`;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      })
    );
  }
}

/* 编辑器内部使用的宽松归一化：不抛错，缺字段补默认，便于边填边存 */
function normalizeLoose(raw) {
  const base = {
    type: "custom:nexus-home-3d",
    title: "我的家",
    subtitle: "",
    height: 560,
    theme: { accent: "#00E7FF", alert: "#FF2D95", scanlines: true },
    camera: { auto_rotate: true, speed: 0.0045 },
    floors: [],
  };
  if (!raw || typeof raw !== "object") return base;
  const merged = Object.assign(base, raw);
  merged.theme = Object.assign({}, base.theme, raw.theme || {});
  merged.camera = Object.assign({}, base.camera, raw.camera || {});
  merged.floors = (Array.isArray(raw.floors) ? raw.floors : []).map((floor) => ({
    id: floor.id || uid("f"),
    name: floor.name || "楼层",
    level: Number.isFinite(Number(floor.level)) ? Number(floor.level) : 0,
    rooms: (Array.isArray(floor.rooms) ? floor.rooms : []).map((room) => ({
      id: room.id || uid("r"),
      name: room.name || "房间",
      kind: normalizeKind(room.kind, room.name),
      size: room.size || "m",
      entities: Object.assign({}, room.entities || {}),
    })),
  }));
  return merged;
}

function setPath(obj, path, value) {
  const parts = path.split(".");
  let target = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!target[parts[i]] || typeof target[parts[i]] !== "object") target[parts[i]] = {};
    target = target[parts[i]];
  }
  target[parts[parts.length - 1]] = value;
}

function getPath(obj, path) {
  return path.split(".").reduce((acc, part) => (acc == null ? acc : acc[part]), obj);
}

customElements.define("nexus-home-3d-editor", NexusHome3DEditor);
export { NexusHome3DEditor };
