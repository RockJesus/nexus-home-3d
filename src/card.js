/**
 * 控制层：卡片的 DOM、交互、实体读写都在这里。
 * 场景渲染委托给 NexusEngine，配置解析委托给 shared.js。
 */
import { NexusEngine } from "./engine.js";
import {
  ENTITY_KEYS,
  KIND_LABEL,
  SERVICES,
  esc,
  normalizeConfig,
  normalizeSize,
  readState,
  sortFloors,
  domainOf,
} from "./shared.js";

const ICONS = {
  light:
    '<svg viewBox="0 0 256 256"><path d="M160 216H96a8 8 0 0 1 0-16h64a8 8 0 0 1 0 16Zm32-64a80 80 0 1 0-128 0v4l-20 32h168l-20-32v-4Z"/></svg>',
  switch:
    '<svg viewBox="0 0 256 256"><path d="M200 88H56a16 16 0 0 0-16 16v48a16 16 0 0 0 16 16h144a16 16 0 0 0 16-16v-48a16 16 0 0 0-16-16Zm-8 48a24 24 0 1 1-24-24 24 24 0 0 1 24 24Z"/></svg>',
  climate:
    '<svg viewBox="0 0 256 256"><path d="M128 24a16 16 0 0 0-16 16v100.7a48 48 0 1 0 32 0V40a16 16 0 0 0-16-16Zm0 168a16 16 0 1 1 16-16 16 16 0 0 1-16 16Z"/></svg>',
  cover:
    '<svg viewBox="0 0 256 256"><path d="M216 40H40a8 8 0 0 0-8 8v160a8 8 0 0 0 16 0V56h64v152a8 8 0 0 0 16 0V56h80v152a8 8 0 0 0 16 0V48a8 8 0 0 0-8-8Z"/></svg>',
  sensor:
    '<svg viewBox="0 0 256 256"><path d="M128 96a32 32 0 0 0-32 32 48 48 0 0 1-48 48 8 8 0 0 0 0 16 64 64 0 0 0 64-64 16 16 0 0 1 32 0 96 96 0 0 0 96 96 8 8 0 0 0 0-16 80 80 0 0 1-80-80 32 32 0 0 0-32-32Z"/></svg>',
};

const PREVIEW_CSS = `
.preview{display:grid;grid-template-rows:auto 1fr;gap:10px;height:100%;padding:14px;box-sizing:border-box;
  background:#05070b;border-radius:12px;contain:strict;overflow:hidden}
.preview .pvhead{font:600 11px/1.4 ui-monospace,monospace;letter-spacing:.2em;text-transform:uppercase;
  color:#00e7ff;opacity:.9}
.preview .pvbody{display:grid;place-items:center;min-height:0}
.preview svg{width:88%;max-height:100%;height:auto}
`;

const PREVIEW_TAGS = new Set([
  "hui-card-picker",
  "hui-dialog-add-card",
  "hui-dialog-edit-card",
  "hui-card-editor",
  "ha-editor",
  "hui-card-preview",
]);

const STYLE = `
:host { display:block; --accent:#00E7FF; --alert:#FF2D95; }
:host([hidden]) { display:none; }
.root{
  position:relative;height:100%;min-height:0;overflow:hidden;
  background:radial-gradient(120% 90% at 50% 0%,#0b1420 0%,#05070b 62%),#05070b;
  color:#d9e8f2;font-family:"PingFang SC","Microsoft YaHei","Segoe UI",system-ui,sans-serif;
  border-radius:12px;isolation:isolate;
}
.root::after{
  content:"";position:absolute;inset:0;pointer-events:none;z-index:9;
  background:repeating-linear-gradient(0deg,rgba(0,0,0,.34) 0 1px,rgba(0,0,0,0) 1px 3px);opacity:.3;
}
.root.no-scan::after{display:none}
.bar{
  height:52px;display:flex;align-items:center;gap:14px;padding:0 16px;position:relative;z-index:6;
  border-bottom:1px solid rgba(0,231,255,.16);
  background:linear-gradient(180deg,rgba(9,15,24,.94),rgba(6,10,16,.72));
}
.brand{display:flex;align-items:baseline;gap:8px;flex:0 0 auto}
.brand b{font-size:14px;letter-spacing:.3em;font-weight:800;color:#fff;text-shadow:0 0 18px rgba(0,231,255,.5)}
.brand i{font-style:normal;font-size:9px;letter-spacing:.22em;color:var(--accent);opacity:.8}
.headtxt{min-width:0;flex:1}
.headtxt b{display:block;font-size:13px;font-weight:600;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.headtxt span{display:block;font-size:10px;color:#6b7f93;letter-spacing:.06em;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stat{display:flex;gap:14px;font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:10px;color:#6b7f93;flex:0 0 auto}
.stat b{color:#d9e8f2;font-weight:500}
.icbtn{
  flex:0 0 auto;height:26px;padding:0 10px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;
  color:#6b7f93;background:rgba(6,10,16,.7);border:1px solid rgba(0,231,255,.18);cursor:pointer;
  transition:.25s;font-family:inherit;
}
.icbtn:hover{color:var(--accent);border-color:rgba(0,231,255,.5)}
.icbtn.on{color:#001318;background:var(--accent);border-color:var(--accent);font-weight:700}

.stage{position:absolute;inset:52px 0 0 0;display:grid;grid-template-columns:230px minmax(0,1fr) 296px;min-height:0;z-index:5}
.rail{border-right:1px solid rgba(0,231,255,.14);display:flex;flex-direction:column;min-height:0;background:linear-gradient(180deg,rgba(8,13,21,.86),rgba(4,7,11,.9))}
.rail.right{border-right:0;border-left:1px solid rgba(0,231,255,.14)}
.railhead{padding:11px 13px 9px;border-bottom:1px solid rgba(0,231,255,.1);flex:0 0 auto}
.railhead h3{font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:var(--accent);font-weight:600;margin:0}
.tree{flex:1;overflow:auto;padding:8px 9px 14px;scrollbar-width:thin}
.tree::-webkit-scrollbar{width:4px}
.tree::-webkit-scrollbar-thumb{background:rgba(0,231,255,.28)}
.floorbox{border:1px solid rgba(0,231,255,.14);margin-bottom:7px;background:rgba(10,17,26,.6);transition:.3s;clip-path:polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,0 100%)}
.floorbox:hover{border-color:rgba(0,231,255,.4)}
.frow{display:flex;align-items:center;gap:7px;padding:8px 9px;cursor:pointer}
.caret{width:10px;color:var(--accent);font-size:9px;opacity:.7;transition:.25s}
.floorbox.open .caret{transform:rotate(90deg)}
.fname{font-size:12px;font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fnum{font-family:ui-monospace,monospace;font-size:9px;color:#6b7f93}
.rooms{display:none;padding:0 6px 6px}
.floorbox.open .rooms{display:block}
.room{display:flex;align-items:center;gap:7px;padding:6px 7px;font-size:11.5px;color:#a8bccd;cursor:pointer;border-left:2px solid transparent;transition:.25s}
.room:hover{background:rgba(0,231,255,.06);color:#fff}
.room.sel{border-left-color:var(--accent);background:linear-gradient(90deg,rgba(0,231,255,.14),transparent);color:#fff}
.rdot{width:5px;height:5px;border-radius:50%;background:#33465a;flex:0 0 auto}
.rdot.on{background:var(--accent);box-shadow:0 0 8px var(--accent)}
.rname{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.emptyroom{font-size:10.5px;color:#46596b;padding:6px 8px}

.view{position:relative;min-width:0;background:#04060a;overflow:hidden}
canvas{display:block;width:100%;height:100%;touch-action:none}
.overlay{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.label{
  position:absolute;transform:translate(-50%,-50%);font-size:10.5px;letter-spacing:.04em;color:#cfe6f2;
  white-space:nowrap;padding:2px 6px;border:1px solid rgba(0,231,255,.35);background:rgba(4,8,12,.62);
  transition:opacity .2s;font-variant-numeric:tabular-nums;
}
.label.floor{font-size:9px;letter-spacing:.18em;color:var(--accent);border:0;background:none;text-transform:uppercase;opacity:.65}
.label.hot{color:#fff;border-color:var(--alert);box-shadow:0 0 14px rgba(255,45,149,.5)}
.vtitle{position:absolute;left:14px;bottom:12px;pointer-events:none;z-index:3}
.vtitle h4{font-size:19px;font-weight:800;line-height:1;margin:0;color:#fff;text-shadow:0 0 24px rgba(0,231,255,.45)}
.vtitle p{font-size:9.5px;letter-spacing:.16em;color:#6b7f93;margin:5px 0 0;text-transform:uppercase}
.viewbtns{position:absolute;right:10px;top:10px;display:flex;gap:6px;z-index:4}
.fallback{position:absolute;inset:0;display:none;place-content:center;padding:24px;text-align:center;color:#6b7f93;font-size:12px;line-height:1.9}
.fallback.show{display:grid}

.panel{flex:1;padding:12px 13px 20px;overflow:auto;scrollbar-width:thin}
.panel::-webkit-scrollbar{width:4px}
.panel::-webkit-scrollbar-thumb{background:rgba(0,231,255,.28)}
.hint{padding:30px 10px;text-align:center;color:#46596b;font-size:11.5px;line-height:1.9}
.hint b{display:block;color:#6b7f93;font-size:12px;margin-bottom:5px}
.rhead{margin-bottom:12px}
.rhead .k{font-size:9px;letter-spacing:.22em;color:var(--alert);text-transform:uppercase}
.rhead h2{font-size:18px;font-weight:700;margin:6px 0 0;letter-spacing:.01em}
.rhead .meta{display:flex;gap:12px;margin-top:7px;font-family:ui-monospace,monospace;font-size:10px;color:#6b7f93}
.rhead .meta b{color:var(--accent);font-weight:500}
.ent.focus{border-color:rgba(255,45,149,.6);box-shadow:0 0 0 1px rgba(255,45,149,.28),0 0 18px rgba(255,45,149,.16) inset}
.ent{border:1px solid rgba(0,231,255,.13);background:rgba(8,14,22,.72);padding:10px 11px;margin-bottom:8px;transition:.25s;clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%)}
.ent:hover{border-color:rgba(0,231,255,.35)}
.ent.miss{opacity:.5}
.erow{display:flex;align-items:center;gap:9px}
.eic{width:19px;height:19px;flex:0 0 auto;color:var(--accent);opacity:.9}
.eic svg{width:100%;height:100%;fill:currentColor}
.etxt{flex:1;min-width:0}
.etxt b{display:block;font-size:11.5px;font-weight:600}
.etxt span{display:block;font-family:ui-monospace,monospace;font-size:9px;color:#46596b;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sw{width:38px;height:20px;flex:0 0 auto;border:1px solid rgba(0,231,255,.3);background:rgba(0,0,0,.5);position:relative;cursor:pointer;transition:.3s;padding:0}
.sw i{position:absolute;top:2px;left:2px;width:14px;height:14px;background:#2b3f52;transition:.3s}
.sw.on{border-color:var(--accent);box-shadow:0 0 16px rgba(0,231,255,.35);background:rgba(0,231,255,.12)}
.sw.on i{left:20px;background:var(--accent);box-shadow:0 0 10px var(--accent)}
.slid{display:flex;align-items:center;gap:9px;margin-top:9px}
.range{-webkit-appearance:none;appearance:none;flex:1;height:2px;background:rgba(0,231,255,.2);outline:0;margin:0}
.range::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;background:var(--accent);box-shadow:0 0 10px var(--accent);cursor:pointer}
.val{font-family:ui-monospace,monospace;font-size:10px;color:var(--accent);min-width:34px;text-align:right;font-variant-numeric:tabular-nums}
.readout{display:flex;align-items:baseline;gap:5px;margin-top:8px}
.readout b{font-size:22px;font-weight:300;font-family:ui-monospace,monospace;color:#d9e8f2}
.readout span{font-size:10px;color:#6b7f93}
.adv{display:flex;gap:5px;margin-top:9px}
.adv button{flex:1;font-size:9.5px;letter-spacing:.08em;padding:5px;background:rgba(0,231,255,.06);border:1px solid rgba(0,231,255,.2);color:#6b7f93;cursor:pointer;transition:.2s;font-family:inherit}
.adv button:hover{color:var(--accent);border-color:var(--accent)}
.foot{flex:0 0 auto;padding:8px 12px;border-top:1px solid rgba(0,231,255,.1);font-size:9.5px;color:#4a5e70}
.foot b{color:var(--accent);font-weight:500}

.preview{padding:14px;display:grid;grid-template-rows:auto 1fr;height:100%;gap:10px}
.preview .pvhead{font-size:11px;letter-spacing:.2em;color:var(--accent);text-transform:uppercase}
.preview .pvbody{display:grid;place-items:center}
.preview svg{width:86%;max-height:100%}

/* 容器变窄就换布局：不依赖视口，HA 分栏里也能正确塌陷 */
.root.compact .stage{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) minmax(0,44%)}
.root.compact .rail.left{display:none}
.root.compact .rail.right{min-height:0;overflow:hidden;border-left:0;border-top:1px solid rgba(0,231,255,.14)}
.root.compact .panel{min-height:0;overflow:auto}
.root.compact .foot{display:none}
.root.compact .stat{display:none}
.root.compact .vtitle h4{font-size:15px}
.root.compact .vtitle p{display:none}
.root.compact .bar{gap:10px;padding:0 12px}
.root.compact .brand i{display:none}
`;

class NexusHome3DCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = null;
    this._engine = null;
    this._selected = null;
    this._open = new Set();
    this._prevStates = {};
    this._pending = new Map();
    this._visible = true;
    this._built = false;
  }

  static getStubConfig(hass) {
    const lights = Object.keys((hass && hass.states) || {}).filter((e) => e.startsWith("light."));
    return {
      title: "我的家",
      height: 560,
      floors: [
        {
          id: "f1",
          name: "一层",
          level: 0,
          rooms: [
            {
              id: "living",
              name: "客厅",
              size: "l",
              entities: lights[0] ? { light: lights[0] } : {},
            },
          ],
        },
      ],
    };
  }

  static async getConfigElement() {
    return document.createElement("nexus-home-3d-editor");
  }

  setConfig(config) {
    this._config = normalizeConfig(config);
    this._open = new Set(sortFloors(this._config.floors).map((f) => f.id));
    this._selected = null;
    this._built = false;
    this._render();
  }

  set hass(hass) {
    if (this._previewOnly || this._isPreview()) {
      this._hass = hass;
      return;
    }
    const hadHass = !!this._hass;
    this._hass = hass;
    if (!this._built) {
      this._render();
      return;
    }
    this._syncStates(!hadHass);
  }

  getCardSize() {
    const h = this._config ? this._config.height : 560;
    return Math.max(3, Math.round(h / 50));
  }

  getGridOptions() {
    const rows = this.getCardSize();
    return { columns: "full", min_columns: 6, rows, min_rows: 4, max_rows: 24 };
  }

  getLayoutOptions() {
    const rows = this.getCardSize();
    return { grid_columns: "full", grid_min_columns: 6, grid_rows: rows, grid_min_rows: 4 };
  }

  connectedCallback() {
    if (this._config && !this._built) this._render();
    if (!this._previewOnly) this._observeVisibility();
  }

  disconnectedCallback() {
    if (this._previewOnly) {
      this.shadowRoot.innerHTML = "";
      this._built = false;
    }
    if (this._engine) {
      this._engine.destroy();
      this._engine = null;
    }
    if (this._io) this._io.disconnect();
  }

  /* ---------------- 渲染骨架 ---------------- */

  _render() {
    if (!this._config) return;
    const cfg = this._config;

    if (this._isPreview()) {
      // 选择器缩略图：只挂 ~600B 的轻量样式，不进 WebGL、不建状态表
      this.shadowRoot.innerHTML = `<style>${PREVIEW_CSS}</style>${this._previewMarkup()}`;
      this._built = true;
      this._previewOnly = true;
      return;
    }

    this._previewOnly = false;
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <div class="root${cfg.theme.scanlines ? "" : " no-scan"}"
           style="--accent:${esc(cfg.theme.accent)};--alert:${esc(cfg.theme.alert)};height:${cfg.height}px">
        <div class="bar">
          <div class="brand"><b>NEXUS</b><i>HOME 3D</i></div>
          <div class="headtxt"><b>${esc(cfg.title)}</b><span>${esc(cfg.subtitle || "3D 旋转 · 点击房间 · 直控实体")}</span></div>
          <div class="stat"><span>实体 <b data-stat="ent">0</b></span><span>楼层 <b data-stat="flo">0</b></span></div>
          <button class="icbtn on" data-act="rotate">自动旋转</button>
        </div>
        <div class="stage">
          <aside class="rail left">
            <div class="railhead"><h3>结构 / STRUCTURE</h3></div>
            <div class="tree" data-tree></div>
          </aside>
          <div class="view">
            <canvas data-canvas></canvas>
            <div class="overlay" data-overlay></div>
            <div class="viewbtns">
              <button class="icbtn" data-act="explode">分层展开</button>
            </div>
            <div class="vtitle"><h4>${esc(cfg.title)}</h4><p>3D · CLICK TO CONTROL</p></div>
            <div class="fallback" data-fallback>
              <div>当前环境不支持 WebGL<br>已切换为结构列表模式，控制功能不受影响</div>
            </div>
          </div>
          <aside class="rail right">
            <div class="railhead"><h3>实体控制 / CONTROL</h3></div>
            <div class="panel" data-panel></div>
            <div class="foot">写入走 <b>callService</b> · 状态读 <b>hass.states</b></div>
          </aside>
        </div>
      </div>`;

    this._built = true;
    this._nodes = {
      root: this.shadowRoot.querySelector(".root"),
      tree: this.shadowRoot.querySelector("[data-tree]"),
      panel: this.shadowRoot.querySelector("[data-panel]"),
      canvas: this.shadowRoot.querySelector("[data-canvas]"),
      overlay: this.shadowRoot.querySelector("[data-overlay]"),
      fallback: this.shadowRoot.querySelector("[data-fallback]"),
      statEnt: this.shadowRoot.querySelector('[data-stat="ent"]'),
      statFlo: this.shadowRoot.querySelector('[data-stat="flo"]'),
    };

    this._nodes.root.querySelector('[data-act="rotate"]').addEventListener("click", (event) => {
      const engine = this._engine;
      if (!engine) return;
      engine.setAutoRotate(!engine.autoRotate);
      event.currentTarget.classList.toggle("on", engine.autoRotate);
    });

    this._nodes.root.querySelector('[data-act="explode"]').addEventListener("click", (event) => {
      const engine = this._engine;
      if (!engine) return;
      engine.setExploded(!engine.exploded);
      event.currentTarget.classList.toggle("on", engine.exploded);
    });

    this._renderTree();
    this._renderPanel();
    this._updateStats();
    this._observeWidth();
    this._initEngine();
    this._observeVisibility();
  }

  _previewMarkup() {
    const title = this._config && this._config.title ? this._config.title : "";
    // 单一 path 拼三层楼块，无文字节点、无滤镜，picker 里几 KB 内存
    return `<div class="preview">
      <div class="pvhead">NEXUS · ${esc(title)}</div>
      <div class="pvbody">
        <svg viewBox="0 0 220 150" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
          <g fill="none" stroke="#00E7FF" stroke-width="1.1" opacity=".9">
            <path d="M110 18 L186 55 L110 92 L34 55 Z"/>
            <path d="M46 74 L122 111 L122 132 L46 95 Z" opacity=".55"/>
            <path d="M34 68 L96 99 L96 118 L34 87 Z" opacity=".4"/>
            <path d="M122 111 L186 78 L186 99 L122 132 Z" opacity=".4"/>
          </g>
          <g stroke="#FF2D95" stroke-width="1" opacity=".75" fill="none">
            <path d="M86 39 L86 18 L134 18 L134 41"/>
          </g>
        </svg>
      </div>
    </div>`;
  }

  /* ---------------- 场景 ---------------- */

  _initEngine() {
    if (!this._nodes || !this._nodes.canvas) return;
    const cfg = this._config;
    try {
      this._engine = new NexusEngine(this._nodes.canvas, this._nodes.overlay, {
        accent: cfg.theme.accent,
        alert: cfg.theme.alert,
        mobile: /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(String(navigator.userAgent || "")),
        read: (room) => this._roomState(room),
        onPick: (roomId, slot, action) => this._pickFromScene(roomId, slot, action),
        onContextLost: () => this._onEngineLost(),
      });
      this._engine.setSpeed(cfg.camera.speed);
      this._engine.setAutoRotate(cfg.camera.auto_rotate);
      this._engine.setData(cfg.floors);
      this._engine.start();
      if (this._selected) this._engine.setSelected(this._selected);
    } catch (error) {
      this._nodes.fallback.classList.add("show");
      console.warn("[nexus-home-3d] WebGL 不可用，已降级为列表模式", error);
    }
  }

  /** 房间整体读数：灯光决定发光，其余槽位驱动室内模型 */
  /** WebGL 上下文丢失（移动端显存不足最常见）：停止 3D，保留完整实体控制 */
  _onEngineLost() {
    if (!this._nodes) return;
    this._nodes.fallback.classList.add("show");
    this._nodes.fallback.innerHTML =
      "<b>3D 渲染已停止</b>WebGL 上下文丢失，多为移动端显存不足<br>已切到列表模式，实体仍可正常控制";
    if (this._nodes.canvas) this._nodes.canvas.style.visibility = "hidden";
  }

  _roomState(room) {
    const out = { lit: false, brightness: 0, devices: {} };
    if (!room || !room.entities) return out;
    ENTITY_KEYS.forEach((key) => {
      const eid = room.entities[key];
      if (!eid) return;
      const st = this._stateFor(eid);
      if (!st) return;
      out.devices[key] = {
        on: !!st.on,
        position: st.position,
        unavailable: !!st.unavailable || !!st.missing,
      };
      if (key === "light" && st.on && !st.unavailable) {
        out.lit = true;
        out.brightness = Math.max(0, Math.min(100, st.brightness || 0));
      }
    });
    return out;
  }

  /** 3D 里点到模型：选中房间 + 高亮对应槽位，可切换的直接执行 */
  _pickFromScene(roomId, slot, action) {
    this._select(roomId, slot || null);
    if (!slot) return;
    const hit = this._findRoom(roomId);
    const eid = hit && hit.room.entities[slot];
    if (!eid) return;
    if (action !== "toggle") return;
    const st = this._stateFor(eid);
    if (slot === "light" || slot === "switch") {
      const next = !(st && st.on);
      this._service(eid, next ? "on" : "off", { on: next });
    } else if (slot === "cover") {
      const open = !!(st && (st.on || (st.position != null && st.position > 30)));
      if (open) this._service(eid, "close", { position: 0 });
      else this._service(eid, "pos", { position: 100 }, { position: 100 });
    }
  }

  /* ---------------- 状态同步 ---------------- */

  _syncStates(initial) {
    if (!this._config || this._previewOnly || this._isPreview()) return;

    const changed = new Set();
    this._config.floors.forEach((floor) => {
      floor.rooms.forEach((room) => {
        ENTITY_KEYS.forEach((key) => {
          const eid = room.entities[key];
          if (!eid) return;
          const signature = this._signature(eid);
          if (initial || this._prevStates[eid] !== signature) {
            this._prevStates[eid] = signature;
            changed.add(room.id);
            if (this._pending.has(eid)) this._pending.delete(eid);
          }
        });
      });
    });

    if (initial) {
      this._config.floors.forEach((floor) =>
        floor.rooms.forEach((room) => changed.add(room.id))
      );
    }

    if (this._engine) changed.forEach((roomId) => this._engine.refreshRoom(roomId));
    if (changed.size) {
      this._paintTreeStates();
      if (this._selected && changed.has(this._selected)) this._renderPanel();
    }
    this._updateStats();
  }

  _signature(entityId) {
    const st = this._hass && this._hass.states && this._hass.states[entityId];
    if (!st) return "missing";
    const a = st.attributes || {};
    return `${st.state}|${a.brightness || ""}|${a.current_position || ""}|${a.temperature || ""}`;
  }

  /** 读实体状态并叠加乐观更新 */
  _stateFor(entityId) {
    if (!entityId) return null;
    const base = readState(this._hass, entityId) || { missing: true, unavailable: true };
    const pending = this._pending.get(entityId);
    if (!pending) return base;
    if (Date.now() > pending.until) {
      this._pending.delete(entityId);
      return base;
    }
    const merged = Object.assign({}, base, pending.patch);
    if ("on" in pending.patch) merged.on = pending.patch.on;
    return merged;
  }

  /* ---------------- 结构树 ---------------- */

  _renderTree() {
    const tree = this._nodes.tree;
    const floors = sortFloors(this._config.floors);
    if (!floors.length) {
      tree.innerHTML = `<div class="hint"><b>还没有楼层</b>打开卡片编辑器即可添加</div>`;
      return;
    }
    let html = "";
    floors.forEach((floor) => {
      const open = this._open.has(floor.id) ? " open" : "";
      html += `<div class="floorbox${open}" data-floor="${esc(floor.id)}">
        <div class="frow" data-toggle="${esc(floor.id)}">
          <span class="caret">▶</span>
          <span class="fname">${esc(floor.name)}</span>
          <span class="fnum">${floor.rooms.length} RM</span>
        </div>
        <div class="rooms">`;
      if (!floor.rooms.length) {
        html += `<div class="emptyroom">（空楼层）</div>`;
      }
      floor.rooms.forEach((room) => {
        const lit = this._roomState(room).lit;
        const sel = this._selected === room.id ? " sel" : "";
        html += `<div class="room${sel}" data-room="${esc(room.id)}">
          <span class="rdot${lit ? " on" : ""}"></span>
          <span class="rname">${esc(room.name)}</span>
          ${room.kind === "garage" ? '<span class="fnum">GARAGE</span>' : ""}
        </div>`;
      });
      html += `</div></div>`;
    });
    tree.innerHTML = html;

    tree.querySelectorAll("[data-toggle]").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.dataset.toggle;
        if (this._open.has(id)) this._open.delete(id);
        else this._open.add(id);
        this._renderTree();
      });
    });
    tree.querySelectorAll("[data-room]").forEach((el) => {
      el.addEventListener("click", () => this._select(el.dataset.room));
    });
  }

  _paintTreeStates() {
    if (!this._nodes) return;
    this._nodes.tree.querySelectorAll("[data-room]").forEach((el) => {
      const room = this._findRoom(el.dataset.room);
      if (!room) return;
      const lit = this._roomState(room).lit;
      const dot = el.querySelector(".rdot");
      if (dot) dot.classList.toggle("on", lit);
    });
  }

  _updateStats() {
    if (!this._nodes || !this._nodes.statEnt) return;
    let ent = 0;
    this._config.floors.forEach((floor) =>
      floor.rooms.forEach((room) => {
        ent += Object.keys(room.entities || {}).length;
      })
    );
    this._nodes.statEnt.textContent = ent;
    this._nodes.statFlo.textContent = this._config.floors.length;
  }

  _findRoom(roomId) {
    for (const floor of this._config.floors) {
      for (const room of floor.rooms) {
        if (room.id === roomId) return { room, floor };
      }
    }
    return null;
  }

  _select(roomId, slot) {
    const hit = this._findRoom(roomId);
    if (!hit) return;
    this._selected = roomId;
    this._focus = slot || null;
    this._open.add(hit.floor.id);
    if (this._engine) this._engine.setSelected(roomId);
    this._renderTree();
    this._renderPanel();
  }

  /* ---------------- 控制面板 ---------------- */

  _renderPanel() {
    const panel = this._nodes.panel;
    if (!this._selected) {
      panel.innerHTML = `<div class="hint"><b>未选择房间</b>点击 3D 场景中的房间<br>直接读取 / 控制它的实体</div>`;
      return;
    }
    const hit = this._findRoom(this._selected);
    if (!hit) {
      panel.innerHTML = `<div class="hint"><b>房间已被删除</b>请重新选择一个房间</div>`;
      return;
    }
    const { room, floor } = hit;
    const [w, d] = normalizeSize(room.size);
    const keys = ENTITY_KEYS.filter((key) => room.entities[key]);

    let html = `<div class="rhead">
      <div class="k">${room.kind === "garage" ? "GARAGE" : "ROOM"} / ${esc(floor.name)}</div>
      <h2>${esc(room.name)}</h2>
      <div class="meta"><span>面积 <b>${(w * d).toFixed(1)} m²</b></span><span>实体 <b>${keys.length}</b></span></div>
    </div>`;

    if (!keys.length) {
      html += `<div class="hint"><b>还没有绑定实体</b>在卡片编辑器里为这个房间选择实体</div>`;
    }

    keys.forEach((key) => {
      const eid = room.entities[key];
      const st = this._stateFor(eid);
      const domain = domainOf(eid);

      if (!st || st.missing) {
        html += this._entityShell(key, eid, "实体缺失");
        return;
      }
      if (st.unavailable) {
        html += this._entityShell(key, eid, "不可用");
        return;
      }

      if (key === "light") {
        html += `<div class="ent${this._focus === key ? " focus" : ""}">
          <div class="erow">
            <span class="eic">${ICONS.light}</span>
            <span class="etxt"><b>${KIND_LABEL.light}</b><span>${esc(eid)}</span></span>
            <button class="sw ${st.on ? "on" : ""}" data-power="${esc(eid)}" data-domain="${esc(domain)}" aria-label="开关"><i></i></button>
          </div>
          <div class="slid">
            <input class="range" type="range" min="1" max="100" value="${st.brightness}" data-bright="${esc(eid)}" aria-label="亮度">
            <span class="val">${st.brightness}%</span>
          </div>
        </div>`;
      } else if (key === "switch") {
        html += `<div class="ent${this._focus === key ? " focus" : ""}">
          <div class="erow">
            <span class="eic">${ICONS.switch}</span>
            <span class="etxt"><b>${KIND_LABEL.switch}</b><span>${esc(eid)}</span></span>
            <button class="sw ${st.on ? "on" : ""}" data-power="${esc(eid)}" data-domain="${esc(domain)}" aria-label="开关"><i></i></button>
          </div>
        </div>`;
      } else if (key === "climate") {
        html += `<div class="ent${this._focus === key ? " focus" : ""}">
          <div class="erow">
            <span class="eic">${ICONS.climate}</span>
            <span class="etxt"><b>${KIND_LABEL.climate}</b><span>${esc(eid)} · ${esc(st.mode || "")}</span></span>
          </div>
          <div class="readout"><b>${st.temperature == null ? "—" : st.temperature}</b><span>${esc(st.unit)}</span></div>
          <div class="adv">
            <button data-temp="-1" data-eid="${esc(eid)}">－1°</button>
            <button data-temp="1" data-eid="${esc(eid)}">＋1°</button>
          </div>
        </div>`;
      } else if (key === "cover") {
        html += `<div class="ent${this._focus === key ? " focus" : ""}">
          <div class="erow">
            <span class="eic">${ICONS.cover}</span>
            <span class="etxt"><b>${KIND_LABEL.cover}</b><span>${esc(eid)}</span></span>
            <span class="val">${st.position == null ? "—" : st.position + "%"}</span>
          </div>
          <div class="adv">
            <button data-cover="0" data-eid="${esc(eid)}">关闭</button>
            <button data-cover="50" data-eid="${esc(eid)}">半开</button>
            <button data-cover="100" data-eid="${esc(eid)}">全开</button>
          </div>
        </div>`;
      } else if (key === "sensor") {
        const value = st.entity ? st.entity.state : "—";
        html += `<div class="ent${this._focus === key ? " focus" : ""}">
          <div class="erow">
            <span class="eic">${ICONS.sensor}</span>
            <span class="etxt"><b>${KIND_LABEL.sensor}</b><span>${esc(eid)}</span></span>
          </div>
          <div class="readout"><b>${esc(value)}</b><span>${esc(st.entity && st.entity.attributes.unit_of_measurement || st.unit)}</span></div>
        </div>`;
      }
    });

    panel.innerHTML = html;
    this._bindPanel();
  }

  _entityShell(key, eid, note) {
    return `<div class="ent miss">
      <div class="erow">
        <span class="eic">${ICONS[key] || ICONS.switch}</span>
        <span class="etxt"><b>${KIND_LABEL[key] || key}</b><span>${esc(eid)}</span></span>
        <span class="val">${note}</span>
      </div>
    </div>`;
  }

  _bindPanel() {
    const panel = this._nodes.panel;

    panel.querySelectorAll("[data-power]").forEach((el) => {
      el.addEventListener("click", () => {
        const eid = el.dataset.power;
        const st = this._stateFor(eid);
        const next = !(st && st.on);
        el.classList.toggle("on", next);
        this._service(eid, next ? "on" : "off", { on: next });
      });
    });

    panel.querySelectorAll("[data-bright]").forEach((el) => {
      el.addEventListener("input", () => {
        const eid = el.dataset.bright;
        const value = Number(el.value);
        const label = el.parentElement.querySelector(".val");
        if (label) label.textContent = `${value}%`;
        const st = this._stateFor(eid);
        this._service(eid, "on", { on: true, brightness: value }, { brightness_pct: value });
        if (st && !st.on) this._renderPanel();
      });
    });

    panel.querySelectorAll("[data-temp]").forEach((el) => {
      el.addEventListener("click", () => {
        const eid = el.dataset.eid;
        const st = this._stateFor(eid);
        const current = st && st.temperature != null ? st.temperature : 22;
        const next = Math.round((current + Number(el.dataset.temp)) * 10) / 10;
        this._service(eid, "temp", { temperature: next }, { temperature: next });
      });
    });

    panel.querySelectorAll("[data-cover]").forEach((el) => {
      el.addEventListener("click", () => {
        const eid = el.dataset.eid;
        const position = Number(el.dataset.cover);
        if (position === 0) this._service(eid, "close", { position: 0 });
        else this._service(eid, "pos", { position }, { position });
      });
    });
  }

  /**
   * 唯一的写入口：乐观更新 + 3 秒回滚。
   * 真实 HA 里 this._hass.callService(domain, service, data)。
   */
  _service(entityId, action, patch, extra) {
    const domain = domainOf(entityId);
    const table = SERVICES[domain] || SERVICES.switch;
    const service = table[action] || action;

    this._pending.set(entityId, {
      patch: Object.assign({}, patch, { unavailable: false, missing: false }),
      until: Date.now() + 3000,
    });

    const payload = Object.assign({ entity_id: entityId }, extra || patchPayload(action, patch));
    try {
      if (this._hass && typeof this._hass.callService === "function") {
        this._hass.callService(domain, service, payload);
      } else {
        console.warn("[nexus-home-3d] hass 尚未就绪，已跳过 callService", domain, service, payload);
      }
    } catch (error) {
      console.error("[nexus-home-3d] callService 失败", error);
      this._pending.delete(entityId);
    }

    const room = this._selected ? this._findRoom(this._selected) : null;
    if (room && Object.values(room.room.entities).includes(entityId)) {
      if (this._engine) this._engine.refreshRoom(room.room.id);
    }
    this._renderPanel();
    this._paintTreeStates();

    setTimeout(() => {
      if (!this._pending.has(entityId)) return;
      const pending = this._pending.get(entityId);
      if (Date.now() >= pending.until) {
        this._pending.delete(entityId);
        if (this._engine && room) this._engine.refreshRoom(room.room.id);
        this._renderPanel();
        this._paintTreeStates();
      }
    }, 3100);
  }

  /* ---------------- 可见性 ---------------- */

  _observeWidth() {
    if (!this._nodes || !this._nodes.root) return;
    if (this._ro) this._ro.disconnect();
    this._ro = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      this._nodes.root.classList.toggle("compact", width < 900);
      if (this._engine) this._engine.resize();
    });
    this._ro.observe(this._nodes.root);
  }

  _observeVisibility() {
    if (this._io || !this._nodes || !this._nodes.root) return;
    this._io = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        if (visible === this._visible) return;
        this._visible = visible;
        if (this._engine) {
          if (visible) this._engine.start();
          else this._engine.stop();
        }
      },
      { threshold: 0.05 }
    );
    this._io.observe(this._nodes.root);
  }

  _isPreview() {
    if (this._preview) return true;
    let node = this.parentElement;
    for (let depth = 0; node && depth < 12; depth += 1) {
      if (PREVIEW_TAGS.has(String(node.localName || "").toLowerCase())) return true;
      node = node.parentElement || (node.getRootNode && node.getRootNode().host) || null;
    }
    return false;
  }
}

function patchPayload(action, patch) {
  if (action === "on" && patch.brightness != null) return { brightness_pct: patch.brightness };
  if (action === "pos" && patch.position != null) return { position: patch.position };
  if (action === "temp" && patch.temperature != null) return { temperature: patch.temperature };
  return {};
}

customElements.define("nexus-home-3d", NexusHome3DCard);
export { NexusHome3DCard };
