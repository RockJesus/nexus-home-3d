/**
 * 房间内部：家具布景 + 实体装置。
 * 纯几何体拼装，不带任何贴图依赖，保持单文件产物不膨胀。
 * 每个实体槽位都会长出对应的模型，并打上 userData.slot 供射线命中。
 */
import * as THREE from "three";

const PAD = 0.16; // 家具到墙面的留白（米）

/** 共享材质：整个场景一套，避免每个房间各建一份 */
export function createMats() {
  return {
    body: new THREE.MeshStandardMaterial({
      color: 0x30485a,
      metalness: 0.4,
      roughness: 0.5,
      emissive: 0x153542,
      emissiveIntensity: 1.05,
    }),
    soft: new THREE.MeshStandardMaterial({
      color: 0x405a6b,
      metalness: 0.2,
      roughness: 0.82,
      emissive: 0x173944,
      emissiveIntensity: 0.95,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: 0x1c2b38,
      metalness: 0.6,
      roughness: 0.4,
      emissive: 0x061320,
      emissiveIntensity: 0.6,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: 0x47606f,
      metalness: 0.85,
      roughness: 0.28,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x0d2b38,
      metalness: 0.1,
      roughness: 0.15,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  };
}

/** 房间类型：优先用配置里的 kind，其次按名字猜 */
export function roomKind(room) {
  const kind = (room.kind || "").toLowerCase();
  if (["bedroom", "living", "kitchen", "dining", "study", "bath", "garage"].includes(kind)) return kind;
  const name = String(room.name || "");
  if (/车库|car|garage/i.test(name)) return "garage";
  if (/主卧|次卧|卧|儿童房|bed/i.test(name)) return "bedroom";
  if (/客厅|起居|living|lounge/i.test(name)) return "living";
  if (/厨|kitchen/i.test(name)) return "kitchen";
  if (/餐厅|餐|dining/i.test(name)) return "dining";
  if (/书房|study|office|工作/i.test(name)) return "study";
  if (/卫|浴|bath|wash/i.test(name)) return "bath";
  return "living";
}

function box(parent, mat, x, y, z, w, h, d, slot, action) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  if (slot) mesh.userData = { slot, action: action || "select" };
  parent.add(mesh);
  return mesh;
}

function cyl(parent, mat, x, y, z, r, h, seg = 16) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function neonEdge(mesh, color, opacity) {
  const line = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 32),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
  );
  line.position.copy(mesh.position);
  line.rotation.copy(mesh.rotation);
  return line;
}

/**
 * 按房间类型摆一组低模家具。furniture 只是氛围，不带实体，
 * 真正可点的东西在 addDevices 里。
 */
export function buildFurniture(group, room, size, mats, accent) {
  let rim = null;
  const { w, d, h } = size;
  const kind = roomKind(room);
  const iw = Math.max(0.6, w - PAD * 2);
  const id = Math.max(0.6, d - PAD * 2);
  const g = new THREE.Group();
  group.add(g);

  if (kind === "bedroom") {
    const bw = Math.min(iw * 0.62, 1.7);
    const bd = Math.min(id * 0.82, 2.0);
    box(g, mats.soft, -iw * 0.16, 0.16, 0, bw, 0.24, bd); // 床垫
    box(g, mats.body, -iw * 0.16, 0.28, -bd / 2 + 0.06, bw, 0.42, 0.1); // 床头板
    box(g, mats.glass, -iw * 0.24, 0.3, bd * 0.24, bw * 0.38, 0.1, bd * 0.16); // 枕头
    box(g, mats.glass, -iw * 0.08, 0.3, bd * 0.24, bw * 0.38, 0.1, bd * 0.16);
    box(g, mats.body, iw * 0.3, 0.22, -id * 0.28, 0.42, 0.44, 0.36); // 床头柜
    box(g, mats.body, iw * 0.34, 0.9, id * 0.34, 0.62, 1.7, 0.34); // 衣柜
  } else if (kind === "kitchen") {
    box(g, mats.body, 0, 0.38, -id * 0.26, iw * 0.92, 0.76, 0.6); // 灶台
    box(g, mats.dark, -iw * 0.26, 0.78, -id * 0.26, 0.62, 0.04, 0.5); // 灶面
    for (let i = 0; i < 2; i += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.13, 0.02, 8, 20),
        new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.9 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(-iw * 0.26 + (i === 0 ? -0.16 : 0.16), 0.81, -id * 0.26 + (i === 0 ? -0.1 : 0.12));
      g.add(ring);
    }
    box(g, mats.body, -iw * 0.3, 0.88, id * 0.18, 0.7, 1.76, 0.66); // 冰箱
    box(g, mats.metal, -iw * 0.3, 0.88, id * 0.18 + 0.34, 0.02, 1.6, 0.02);
    box(g, mats.soft, iw * 0.24, 0.42, id * 0.3, iw * 0.4, 0.84, id * 0.32); // 岛台
  } else if (kind === "dining") {
    box(g, mats.body, 0, 0.36, 0, iw * 0.46, 0.06, id * 0.62); // 桌面
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      box(g, mats.metal, sx * iw * 0.18, 0.17, sz * id * 0.24, 0.05, 0.34, 0.05);
    });
    [[-1, 0], [1, 0]].forEach(([sx]) => {
      box(g, mats.soft, sx * iw * 0.36, 0.22, 0, 0.44, 0.08, id * 0.44);
      box(g, mats.soft, sx * iw * 0.44, 0.42, 0, 0.08, 0.42, id * 0.44);
    });
  } else if (kind === "study") {
    box(g, mats.body, 0, 0.36, -id * 0.16, iw * 0.72, 0.05, id * 0.34); // 书桌
    box(g, mats.metal, -iw * 0.3, 0.18, -id * 0.16, 0.05, 0.36, id * 0.3);
    box(g, mats.metal, iw * 0.3, 0.18, -id * 0.16, 0.05, 0.36, id * 0.3);
    box(g, mats.soft, 0, 0.24, id * 0.12, 0.44, 0.42, 0.44); // 椅子
    box(g, mats.soft, 0, 0.5, id * 0.28, 0.44, 0.36, 0.08);
    for (let i = 0; i < 3; i += 1) {
      box(g, mats.dark, iw * 0.34, 0.42 + i * 0.34, -id * 0.5, 0.26, 0.04, 0.5); // 书架层板
    }
  } else if (kind === "bath") {
    box(g, mats.body, -iw * 0.18, 0.3, 0, iw * 0.5, 0.5, id * 0.7);
    box(g, mats.glass, -iw * 0.18, 0.5, 0, iw * 0.42, 0.06, id * 0.6);
    box(g, mats.body, iw * 0.32, 0.42, -id * 0.2, 0.5, 0.84, 0.36);
  } else if (kind === "garage") {
    // 车：车身 + 座舱 + 四轮 + 头灯
    const cw = Math.min(iw * 0.72, 1.9);
    const cd = Math.min(id * 0.82, 4.0);
    box(g, mats.body, 0, 0.42, 0, cw, 0.42, cd);
    box(g, mats.dark, 0, 0.72, -cd * 0.06, cw * 0.86, 0.32, cd * 0.46);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.14, 14),
        mats.dark
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * cw * 0.46, 0.2, sz * cd * 0.32);
      g.add(wheel);
    });
    const hl = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xd7f7ff, emissiveIntensity: 1.6 });
    box(g, hl, -cw * 0.3, 0.5, -cd * 0.5, 0.16, 0.08, 0.04);
    box(g, hl, cw * 0.3, 0.5, -cd * 0.5, 0.16, 0.08, 0.04);
  } else {
    // living / 默认：沙发 + 茶几 + 电视柜 + 地毯
    box(g, mats.soft, 0, 0.24, id * 0.26, iw * 0.66, 0.26, id * 0.26); // 沙发座
    box(g, mats.soft, 0, 0.44, id * 0.4, iw * 0.66, 0.34, 0.12); // 靠背
    box(g, mats.glass, 0, 0.32, id * 0.28, iw * 0.66, 0.03, id * 0.24); // 坐垫高光
    box(g, mats.body, 0, 0.2, -id * 0.02, iw * 0.34, 0.18, id * 0.24); // 茶几
    box(g, mats.dark, 0, 0.1, -id * 0.02, iw * 0.34, 0.02, id * 0.24);
    box(g, mats.body, 0, 0.14, -id * 0.3, iw * 0.56, 0.3, 0.36); // 电视柜
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(iw * 0.78, id * 0.5),
      new THREE.MeshStandardMaterial({ color: 0x0e2532, roughness: 0.9, transparent: true, opacity: 0.6 })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.012, id * 0.06);
    g.add(rug);
  }

  // 家具按房间净高压一下，避免衣柜顶穿玻璃盒
  g.scale.y = Math.min(1, (h - 0.1) / 1.75);

  // 大件家具描边：暗场里靠这条线读轮廓
  const lineMat = new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.42, depthWrite: false });
  const meshes = [];
  g.traverse((obj) => {
    if (obj.isMesh && obj.geometry && obj !== rim) meshes.push(obj);
  });
  meshes.forEach((mesh) => {
    const box3 = new THREE.Box3().setFromObject(mesh);
    const size3 = box3.getSize(new THREE.Vector3());
    if (size3.x * size3.y * size3.z < 0.05) return;
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 40), lineMat);
    line.position.copy(mesh.position);
    line.rotation.copy(mesh.rotation);
    line.scale.copy(mesh.scale);
    g.add(line);
  });

  // 统一的氛围：天花板一圈描边，暗示透明盒子
  rim = new THREE.Mesh(
    new THREE.BoxGeometry(w - 0.02, 0.02, d - 0.02),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.35 })
  );
  rim.position.y = h - 0.03;
  group.add(rim);
}

/**
 * 实体装置：每个槽位长出对应模型，返回可刷新的句柄。
 */
export function addDevices(group, room, size, mats, accent, alert) {
  const { w, d, h } = size;
  const handles = {};
  const keys = Object.keys(room.entities || {});
  const use = (slot) => keys.includes(slot);

  if (use("light")) {
    const g = new THREE.Group();
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0x0b1a22,
      emissive: accent,
      emissiveIntensity: 0.2,
      roughness: 0.3,
      metalness: 0.2,
    });
    cyl(g, mats.metal, 0, h - 0.08, 0, 0.02, 0.16, 8);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), bulbMat);
    bulb.position.set(0, h - 0.26, 0);
    bulb.scale.y = 0.8;
    bulb.userData = { slot: "light", action: "toggle" };
    g.add(bulb);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 12, 10),
      new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.position.copy(bulb.position);
    g.add(halo);

    group.add(g);
    handles.light = { bulb, bulbMat, halo };
  }

  if (use("switch")) {
    const g = new THREE.Group();
    const panel = box(g, mats.dark, w * 0.4, Math.min(h * 0.55, 1.2), -d * 0.42, 0.12, 0.22, 0.03);
    panel.userData = { slot: "switch", action: "toggle" };
    const led = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.02, 0.01),
      new THREE.MeshStandardMaterial({ color: 0x0a1a22, emissive: accent, emissiveIntensity: 0.8 })
    );
    led.position.set(w * 0.4, Math.min(h * 0.55, 1.2) + 0.07, -d * 0.42 + 0.02);
    led.userData = { slot: "switch", action: "toggle" };
    g.add(led);
    group.add(g);
    handles.switch = { led };
  }

  if (use("climate")) {
    const g = new THREE.Group();
    const unitMat = new THREE.MeshStandardMaterial({
      color: 0x1b2b36,
      metalness: 0.4,
      roughness: 0.44,
    });
    const bodyM = box(g, unitMat, -w * 0.15, h * 0.72, -d * 0.42, Math.min(w * 0.45, 0.9), 0.26, 0.2);
    bodyM.userData = { slot: "climate", action: "select" };
    for (let i = 0; i < 3; i += 1) {
      const slit = new THREE.Mesh(
        new THREE.BoxGeometry(Math.min(w * 0.4, 0.8), 0.012, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x06202b, emissive: accent, emissiveIntensity: 0.35 })
      );
      slit.position.set(-w * 0.15, h * 0.72 - 0.06 + i * 0.05, -d * 0.42 + 0.1);
      g.add(slit);
    }
    const led = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.02, 0.012),
      new THREE.MeshStandardMaterial({ color: 0x0a1a22, emissive: accent, emissiveIntensity: 1 })
    );
    led.position.set(-w * 0.15 + Math.min(w * 0.45, 0.9) * 0.42, h * 0.72 + 0.08, -d * 0.42 + 0.1);
    g.add(led);
    group.add(g);
    handles.climate = { body: bodyM, led };
  }

  if (use("cover")) {
    const g = new THREE.Group();
    // 窗：玻璃面 + 两片帘
    const winMat = new THREE.MeshStandardMaterial({
      color: accent,
      transparent: true,
      opacity: 0.14,
      emissive: accent,
      emissiveIntensity: 0.25,
      depthWrite: false,
    });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * 0.62, 1.6), h * 0.5), winMat);
    win.position.set(0, h * 0.52, d * 0.44);
    win.userData = { slot: "cover", action: "toggle" };
    g.add(win);

    const curtainMat = new THREE.MeshStandardMaterial({
      color: 0x142430,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      roughness: 0.9,
    });
    const cw = Math.min(w * 0.62, 1.6) / 2;
    const curtains = [];
    [-1, 1].forEach((sx) => {
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(cw * 0.98, h * 0.52), curtainMat);
      curtain.position.set(sx * cw / 2, h * 0.52, d * 0.43);
      curtain.userData = { slot: "cover", action: "toggle" };
      curtains.push({ mesh: curtain, base: sx * cw / 2, half: cw / 2, sx });
      g.add(curtain);
    });
    group.add(g);
    handles.cover = { curtains };
  }

  if (use("sensor")) {
    const g = new THREE.Group();
    const pillar = box(g, mats.dark, -w * 0.38, Math.min(h * 0.4, 0.8), d * 0.36, 0.1, 0.36, 0.1);
    pillar.userData = { slot: "sensor", action: "select" };
    const dot = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.04, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x0a1a22, emissive: alert, emissiveIntensity: 1.2 })
    );
    dot.position.set(-w * 0.38, Math.min(h * 0.4, 0.8) + 0.2, d * 0.36);
    dot.userData = { slot: "sensor", action: "select" };
    g.add(dot);
    group.add(g);
    handles.sensor = { dot };
  }

  if (use("media_player")) {
    const g = new THREE.Group();
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x05090d,
      emissive: 0x0a2430,
      emissiveIntensity: 0.4,
      metalness: 0.3,
      roughness: 0.3,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * 0.66, 1.7), Math.min(w * 0.4, 0.95)), screenMat);
    screen.position.set(0, h * 0.56, -d * 0.4);
    screen.userData = { slot: "media_player", action: "toggle" };
    g.add(screen);
    const frame = box(g, mats.dark, 0, h * 0.56, -d * 0.42, Math.min(w * 0.68, 1.75), Math.min(w * 0.42, 1), 0.04);
    frame.userData = { slot: "media_player", action: "toggle" };
    group.add(g);
    handles.media_player = { screenMat };
  }

  return handles;
}

/** 车库：把卷帘门单独返回，供开合动画使用 */
export function buildGarageDoor(group, size, mats, accent) {
  const { w, d, h } = size;
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.86, h * 0.94, 0.06),
    new THREE.MeshStandardMaterial({
      color: 0x152430,
      metalness: 0.85,
      roughness: 0.3,
      emissive: accent,
      emissiveIntensity: 0.1,
      transparent: true,
      opacity: 0.92,
    })
  );
  door.position.set(0, h / 2 + 0.04, d / 2 + 0.03);
  group.add(door);
  const edge = neonEdge(door, accent, 0.7);
  group.add(edge);
  return { door, edge };
}

export function neonEdgeLine(target, color, opacity) {
  return neonEdge(target, color, opacity);
}
