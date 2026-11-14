/**
 * 入口：注册卡片与编辑器 + 市场选择器条目 + 版本串。
 * 编辑器必须是顶层静态 import —— 动态 import 在 bundle 模式下不会被内联。
 */
import { NexusHome3DCard } from "./card.js";
import { NexusHome3DEditor } from "./editor.js";
import { CARD_TAG, EDITOR_TAG, VERSION } from "./shared.js";

// 两个类在各自模块里已经 customElements.define，这里只做兜底与注册条目
if (!customElements.get(CARD_TAG)) customElements.define("nexus-home-3d", NexusHome3DCard);
if (!customElements.get(EDITOR_TAG)) customElements.define("nexus-home-3d-editor", NexusHome3DEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG,
    name: "NEXUS Home 3D",
    description: "赛博朋克风格的三维家宅总览：点房间即可控制实体，楼层与房间在编辑器里增删。",
    preview: true,
    documentationURL: "https://github.com/RockJesus/nexus-home-3d#readme",
  });
}

console.info(
  `%c NEXUS-HOME-3D %c ${VERSION} `,
  "background:#001318;color:#00E7FF;font-weight:700;letter-spacing:.2em",
  "background:#00E7FF;color:#001318;font-weight:700"
);
