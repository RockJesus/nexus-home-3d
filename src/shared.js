/**
 * NEXUS Home 3D — 共享常量与纯函数
 * 结构层：这里只描述「家里有什么」，不碰 three.js，也不碰 HA。
 */

export const CARD_TAG = "nexus-home-3d";
export const EDITOR_TAG = "nexus-home-3d-editor";
export const VERSION = "v1.0.2";

/** 房间底面尺寸档位，单位近似米 */
export const SIZES = { s: [1.6, 1.4], m: [2.2, 1.9], l: [3.0, 2.4], xl: [3.4, 2.6] };
/** 体块高度档位：面积越大越高，后排大房间才不会被前排小房间挡住 */
export const HEIGHTS = { s: 0.95, m: 1.18, l: 1.4, xl: 1.62 };

export const ENTITY_KEYS = ["light", "switch", "climate", "cover", "sensor"];

/** 房间类型决定室内摆什么家具 */
export const ROOM_KINDS = {
  room: "通用房间",
  bedroom: "卧室",
  living: "客厅",
  kitchen: "厨房",
  dining: "餐厅",
  study: "书房",
  bath: "卫生间",
  garage: "车库",
};

export function normalizeKind(kind, name) {
  const key = String(kind || "").toLowerCase();
  if (key && ROOM_KINDS[key]) return key;
  const text = String(name || "");
  if (/车库|garage/i.test(text)) return "garage";
  if (/主卧|次卧|卧室|儿童房|bed/i.test(text)) return "bedroom";
  if (/厨房|kitchen/i.test(text)) return "kitchen";
  if (/餐厅|dining/i.test(text)) return "dining";
  if (/书房|study|办公/i.test(text)) return "study";
  if (/卫|浴|bath/i.test(text)) return "bath";
  if (/客厅|起居|living/i.test(text)) return "living";
  return "room";
}

export const KIND_LABEL = {
  light: "灯光",
  switch: "开关 / 场景",
  climate: "空调",
  cover: "窗帘 / 门",
  sensor: "传感器",
};

/** 实体域 → 可用服务，控制层只认这张表 */
export const SERVICES = {
  light: { on: "turn_on", off: "turn_off" },
  switch: { on: "turn_on", off: "turn_off" },
  cover: { open: "open_cover", close: "close_cover", pos: "set_cover_position" },
  climate: { temp: "set_temperature" },
};

let seq = 0;
export function uid(prefix = "r") {
  seq += 1;
  return `${prefix}${seq}${Math.random().toString(36).slice(2, 5)}`;
}

export function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function domainOf(entityId) {
  return String(entityId || "").split(".")[0];
}

/** size 支持 "m" 与 [2.4, 1.9] 两种写法 */
export function normalizeSize(size) {
  if (Array.isArray(size) && size.length >= 2) {
    const w = Number(size[0]);
    const d = Number(size[1]);
    if (Number.isFinite(w) && Number.isFinite(d) && w > 0 && d > 0) return [w, d];
  }
  if (typeof size === "string" && SIZES[size]) return SIZES[size].slice();
  return SIZES.m.slice();
}

export function sizeKey(size) {
  if (typeof size === "string" && SIZES[size]) return size;
  return "m";
}

export function roomArea(room) {
  const [w, d] = normalizeSize(room && room.size);
  return w * d;
}

function asNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 配置归一化：默认值、id 补齐、非法字段收敛。
 * 只有结构本身不可用时才抛错 —— 抛错要能让用户看懂哪里错了。
 */
export function normalizeConfig(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("nexus-home-3d：配置必须是一个对象");
  }
  if (raw.floors != null && !Array.isArray(raw.floors)) {
    throw new Error("nexus-home-3d：floors 必须是数组");
  }

  const theme = Object.assign(
    { accent: "#00E7FF", alert: "#FF2D95", scanlines: true },
    raw.theme || {}
  );
  const camera = Object.assign(
    { auto_rotate: true, speed: 0.0045, fov: 34, view: "perspective" },
    raw.camera || {}
  );

  const floorsRaw = Array.isArray(raw.floors) ? raw.floors : [];
  const floors = floorsRaw.map((f, fi) => {
    const floor = {
      id: String(f.id || uid("f")),
      name: String(f.name || `${fi + 1} 层`),
      level: asNumber(f.level, fi),
      rooms: Array.isArray(f.rooms) ? f.rooms : [],
    };
    floor.rooms = floor.rooms.map((r, ri) => ({
      id: String(r.id || uid("r")),
      name: String(r.name || `房间 ${ri + 1}`),
      kind: normalizeKind(r.kind, r.name),
      size: Array.isArray(r.size) ? normalizeSize(r.size) : sizeKey(r.size),
      entities: normalizeEntities(r.entities),
    }));
    return floor;
  });

  return {
    type: raw.type,
    title: String(raw.title || "我的家"),
    subtitle: String(raw.subtitle || ""),
    height: Math.max(320, asNumber(raw.height, 560)),
    theme,
    camera,
    floors,
  };
}

/** 实体映射只保留五个已知槽位；字符串/对象都收成 entity_id 字符串 */
export function normalizeEntities(entities) {
  const out = {};
  if (!entities || typeof entities !== "object") return out;
  ENTITY_KEYS.forEach((key) => {
    const value = entities[key];
    const eid = typeof value === "string" ? value : value && value.entity;
    if (typeof eid === "string" && eid.includes(".")) out[key] = eid.trim();
  });
  return out;
}

/**
 * 从 hass.states 读一个实体的可渲染状态。
 * 三态都要能渲染：正常值 / unavailable / unknown；实体不存在返回 missing。
 */
export function readState(hass, entityId) {
  if (!hass || !entityId) return null;
  const st = hass.states && hass.states[entityId];
  if (!st) return { missing: true, unavailable: true };
  const a = st.attributes || {};
  const raw = st.state;
  const unavailable = raw === "unavailable" || raw === "unknown";
  const on = raw === "on" || raw === "open" || raw === "playing" || raw === "heat" || raw === "cool";
  return {
    entity: st,
    state: raw,
    unavailable,
    on,
    brightness: a.brightness != null ? Math.round((Number(a.brightness) / 255) * 100) : 100,
    position: a.current_position != null ? Number(a.current_position) : null,
    temperature: a.temperature != null ? Number(a.temperature) : null,
    mode: a.hvac_mode || raw,
    unit:
      (a.unit_of_measurement && String(a.unit_of_measurement)) ||
      (hass.config && hass.config.unit_system && hass.config.unit_system.temperature) ||
      "°C",
  };
}

/** 楼层排序：level 大的在上 */
export function sortFloors(floors) {
  return floors.slice().sort((a, b) => b.level - a.level);
}

/** 房间货架排布：给定楼层底板，按尺寸自动落位，不写死坐标 */
export const FLOOR_W = 7.4;
export const FLOOR_D = 5.8;
export const PAD = 0.22;
export const GAP = 0.1;

export function layoutRooms(rooms) {
  let x = -FLOOR_W / 2 + PAD;
  let z = -FLOOR_D / 2 + PAD;
  let rowD = 0;
  return rooms.map((room) => {
    const [w, d] = normalizeSize(room.size);
    if (x + w > FLOOR_W / 2 - PAD + 0.001) {
      x = -FLOOR_W / 2 + PAD;
      z += rowD + GAP;
      rowD = 0;
    }
    const slot = { room, w, d, px: x + w / 2, pz: z + d / 2 };
    x += w + GAP;
    rowD = Math.max(rowD, d);
    return slot;
  });
}

/** 把 #RRGGBB 收进可用的十六进制颜色（非法值回退） */
export function safeColor(value, fallback) {
  const str = String(value || "").trim();
  return /^#([0-9a-fA-F]{6})$/.test(str) ? str : fallback;
}
