/**
 * 场景层：three.js 只负责「怎么长出来」。
 * 这一层不认识 HA —— 只认 floors 结构和 read(room) 回调。
 */
import * as THREE from "three";
import {
  HEIGHTS,
  layoutRooms,
  sortFloors,
  FLOOR_W,
  FLOOR_D,
} from "./shared.js";
import { addDevices, buildFurniture, buildGarageDoor, createMats, roomKind } from "./furniture.js";

const IDLE_MS = 80; // 无交互时的渲染节流
const ACTIVE_MS = 14;

export class NexusEngine {
  constructor(canvas, overlay, options = {}) {
    if (!canvas) throw new Error("nexus-home-3d：缺少画布节点");

    this.canvas = canvas;
    this.overlay = overlay;
    this.accent = new THREE.Color(options.accent || "#00E7FF");
    this.alert = new THREE.Color(options.alert || "#FF2D95");
    this.speed = 0.0045;
    this.autoRotate = true;
    this.exploded = false;
    this.selected = null;
    this.read = options.read || (() => ({ lit: false, brightness: 0, devices: {} }));
    this.mats = createMats();
    this.onPick = options.onPick || (() => {});

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x04060a, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x04060a, 34, 70);

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);

    this.world = new THREE.Group();
    this.scene.add(this.world);

    this._buildStatic();
    this._bindInput();

    this._running = false;
    this._raf = 0;
    this._last = 0;
    this._acc = 0;
    this._dragging = false;
    this._moved = 0;
    this._px = 0;
    this._py = 0;

    this.floorGroups = [];
    this.roomNodes = [];
    this.labels = [];
    this._lightBudget = 14;

    this._onLost = (event) => {
      event.preventDefault();
      this._running = false;
      if (this.onContextLost) this.onContextLost();
    };
    canvas.addEventListener("webglcontextlost", this._onLost, false);

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas.parentElement || canvas);
  }

  /* ---------------- 静态场景 ---------------- */

  _buildStatic() {
    this.hemi = new THREE.HemisphereLight(0x84bcd8, 0x10202c, 1.35);
    this.amb = new THREE.AmbientLight(0x6390b0, 0.85);
    this.key = new THREE.PointLight(0x00e7ff, 10, 50, 2);
    this.key.position.set(9, 13, 8);
    this.fill = new THREE.DirectionalLight(0xbcd8ea, 0.75);
    this.fill.position.set(-5, 14, 9);
    this.sideL = new THREE.DirectionalLight(0x7fd8f0, 1.05);
    this.sideL.position.set(-12, 5, 10);
    this.sideR = new THREE.DirectionalLight(0xff9ecb, 0.6);
    this.sideR.position.set(12, 4, -6);
    this.under = new THREE.DirectionalLight(0x1c9fc4, 0.55);
    this.under.position.set(2, -8, 9);
    this.scene.add(this.hemi, this.amb, this.key, this.fill, this.sideL, this.sideR, this.under);

    const polar = new THREE.PolarGridHelper(15, 16, 6, 64, 0x0d3a4a, 0x0a2833);
    polar.position.y = -2.6;
    this.scene.add(polar);

    const grid = new THREE.GridHelper(34, 34, 0x0b2f3e, 0x071e28);
    grid.position.y = -2.62;
    this.scene.add(grid);

    const glowTex = this._radialTexture();
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -2.58;
    this.scene.add(glow);

    this.slabMat = new THREE.MeshStandardMaterial({
      color: 0x12303f,
      metalness: 0.15,
      roughness: 0.72,
      emissive: 0x00a4c4,
      emissiveIntensity: 0.1,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  _radialTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const rg = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    rg.addColorStop(0, "rgba(0,231,255,.34)");
    rg.addColorStop(0.45, "rgba(0,120,160,.12)");
    rg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }

  /* ---------------- 数据 → 场景 ---------------- */

  setData(floors, read) {
    if (read) this.read = read;
    this._clearWorld();
    this._lightBudget = 14;
    const ordered = sortFloors(floors || []);
    ordered.forEach((floor, index) => this._buildFloor(floor, index));
    this._frameCamera();
    this.world.updateMatrixWorld(true);
    this.renderOnce();
  }

  setTheme(accent, alert) {
    this.accent.set(accent || "#00E7FF");
    this.alert.set(alert || "#FF2D95");
    this.key.color.copy(this.accent);
    this.roomNodes.forEach((node) => {
      this._applyState(node, this.read(node.room) || { lit: false, brightness: 0, devices: {} });
    });
    this.renderOnce();
  }

  _clearWorld() {
    this.floorGroups.forEach((group) => {
      this.world.remove(group);
      disposeTree(group);
    });
    this.floorGroups = [];
    this.roomNodes = [];
    if (this.overlay) this.overlay.textContent = "";
    this.labels = [];
  }

  _buildFloor(floor, index) {
    const group = new THREE.Group();
    const slots = layoutRooms(floor.rooms);
    const baseY = floor.level * 2.85 + (this.exploded ? index * 0.45 : 0);

    let bx0 = -FLOOR_W / 2;
    let bx1 = FLOOR_W / 2;
    let dz0 = -FLOOR_D / 2;
    let dz1 = -FLOOR_D / 2;
    if (slots.length) {
      bx0 = Math.min(...slots.map((s) => s.px - s.w / 2)) - 0.45;
      bx1 = Math.max(...slots.map((s) => s.px + s.w / 2)) + 0.45;
      dz0 = Math.min(...slots.map((s) => s.pz - s.d / 2)) - 0.45;
      dz1 = Math.max(...slots.map((s) => s.pz + s.d / 2)) + 0.45;
    } else {
      bx0 = -1.4;
      bx1 = 1.4;
      dz0 = -1.1;
      dz1 = 1.1;
    }

    const slabW = Math.max(0.8, bx1 - bx0);
    const slabD = Math.max(0.8, dz1 - dz0);
    const ccx = (bx0 + bx1) / 2;
    const ccz = (dz0 + dz1) / 2;

    const slab = new THREE.Mesh(new THREE.BoxGeometry(slabW, 0.07, slabD), this.slabMat);
    slab.position.set(ccx, -0.04, ccz);
    group.add(slab);

    const edgeMat = new THREE.LineBasicMaterial({
      color: floor.level < 0 ? 0xff2d95 : 0x00e7ff,
      transparent: true,
      opacity: 0.34,
    });
    const slabEdge = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), edgeMat);
    slabEdge.position.copy(slab.position);
    group.add(slabEdge);

    const gridSize = Math.max(slabW, slabD);
    const topGrid = new THREE.GridHelper(gridSize, Math.round(gridSize * 3), 0x0f5f7a, 0x0c3b4c);
    topGrid.position.set(ccx, 0.055, ccz);
    topGrid.material.transparent = true;
    topGrid.material.opacity = 0.3;
    topGrid.material.depthWrite = false;
    topGrid.scale.x = slabW / gridSize;
    topGrid.scale.z = slabD / gridSize;
    group.add(topGrid);

    slots.forEach(({ room, w, d, px, pz }) => {
      this._buildRoom(group, floor, room, w, d, px, pz);
    });

    this._addLabel(
      new THREE.Vector3(bx0 - 0.12, 1.0, dz1 - 0.35),
      floor.name,
      floor.id,
      { floor: true }
    );

    group.position.y = baseY;
    group.userData = { floorId: floor.id, baseY };
    this.world.add(group);
    this.floorGroups.push(group);
  }

  _buildRoom(group, floor, room, w, d, px, pz) {
    const h = HEIGHTS[room.size] || HEIGHTS.m;
    const state = this.read(room) || { lit: false, brightness: 0, devices: {} };
    const lit = !!state.lit;

    // 玻璃外壳：墙是透明的，直接能看进屋里
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0x0b2432,
      emissive: this.accent.clone(),
      emissiveIntensity: lit ? 0.1 : 0.02,
      metalness: 0.35,
      roughness: 0.35,
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const shell = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shellMat);
    shell.position.set(px, h / 2 + 0.06, pz);
    shell.renderOrder = 4;
    shell.userData = { roomId: room.id, floorId: floor.id, isShell: true };
    group.add(shell);

    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(shell.geometry, 20),
      new THREE.LineBasicMaterial({
        color: lit ? this.accent.getHex() : 0x3d6d85,
        transparent: true,
        opacity: lit ? 0.95 : 0.55,
        depthWrite: false,
      })
    );
    edge.position.copy(shell.position);
    edge.userData = { roomId: room.id, floorId: floor.id, isEdge: true };
    group.add(edge);

    // 室内家具与实体装置
    const inner = new THREE.Group();
    inner.position.set(px, 0.07, pz);
    group.add(inner);
    buildFurniture(inner, room, { w, d, h }, this.mats, this.accent.getHex());
    const devices = addDevices(inner, room, { w, d, h }, this.mats, this.accent.getHex(), this.alert.getHex());
    inner.traverse((obj) => {
      if (obj.userData && obj.userData.slot) {
        obj.userData.roomId = room.id;
        obj.userData.floorId = floor.id;
      }
    });

    let garage = null;
    if (roomKind(room) === "garage") {
      garage = buildGarageDoor(inner, { w, d, h }, this.mats, this.accent.getHex());
      [garage.door, garage.edge].forEach((mesh) => {
        mesh.userData = { roomId: room.id, floorId: floor.id, slot: "cover", action: "toggle" };
      });
    }

    let lamp = null;
    if (this._lightBudget > 0) {
      this._lightBudget -= 1;
      lamp = new THREE.PointLight(this.accent.getHex(), 0.3, Math.max(w, d) * 1.8, 2);
      lamp.position.set(px, h - 0.26, pz);
      lamp.visible = lit;
      group.add(lamp);
    }

    const node = {
      room,
      roomId: room.id,
      floorId: floor.id,
      shell,
      shellMat,
      edge,
      inner,
      devices,
      garage,
      lamp,
      h,
      w,
      d,
      curtains: devices.cover ? devices.cover.curtains : null,
      curtainTarget: null,
      garageTarget: null,
    };
    this.roomNodes.push(node);
    this._applyState(node, state);
    this._addLabel(new THREE.Vector3(px, h + 0.55, pz), room.name, floor.id, { roomId: room.id });
  }

  /** 把一次读数写进场景：外壳、灯、开关指示、窗帘、车库门 */
  _applyState(node, state) {
    const lit = !!state.lit;
    const brightness = Math.max(0, Math.min(100, state.brightness || 0));
    const selected = this.selected === node.roomId;
    const devices = state.devices || {};

    node.shellMat.emissive.copy(selected ? this.alert : this.accent);
    node.shellMat.emissiveIntensity = selected ? 0.05 : lit ? 0.04 + (brightness / 100) * 0.1 : 0.015;
    node.shellMat.opacity = 0.07;

    node.edge.material.color.set(selected ? this.alert.getHex() : lit ? this.accent.getHex() : 0x3d6d85);
    node.edge.material.opacity = selected ? 1 : lit ? 0.95 : 0.55;

    if (node.devices.light) {
      const { bulbMat, halo } = node.devices.light;
      bulbMat.emissiveIntensity = lit ? 0.3 + (brightness / 100) * 1.8 : 0.08;
      halo.material.opacity = lit ? 0.1 + (brightness / 100) * 0.22 : 0.04;
    }
    if (node.devices.switch) {
      const on = !!(devices.switch && devices.switch.on);
      node.devices.switch.led.material.emissiveIntensity = on ? 1.8 : 0.3;
    }
    if (node.devices.climate) {
      const on = !!(devices.climate && devices.climate.on);
      node.devices.climate.led.material.emissiveIntensity = on ? 1.8 : 0.3;
    }
    if (node.devices.sensor) {
      const on = !!(devices.sensor && devices.sensor.on);
      node.devices.sensor.dot.material.emissiveIntensity = on ? 1.6 : 0.8;
    }
    if (node.curtains) {
      const cover = devices.cover || {};
      const position = cover.position != null ? Number(cover.position) : cover.on ? 100 : 0;
      node.curtainTarget = node.curtains.map((cur) => (position > 20 ? cur.sx * cur.half * 3 : cur.sx * cur.half));
    }
    if (node.garage) {
      const cover = devices.cover || {};
      const open = !!(cover.on || (cover.position != null && Number(cover.position) > 30));
      node.garageTarget = open ? node.h : 0;
    }
    if (node.lamp) {
      node.lamp.visible = lit || selected;
      node.lamp.intensity = lit ? 0.12 + (brightness / 100) * 0.45 : selected ? 0.16 : 0;
    }
  }

  _addLabel(local, text, floorId, opts) {
    if (!this.overlay) return;
    const el = document.createElement("div");
    el.className = opts.floor ? "label floor" : "label room";
    el.textContent = text;
    this.overlay.appendChild(el);
    const item = {
      el,
      local,
      floorId,
      roomId: opts.roomId || null,
      floorLabel: !!opts.floor,
    };
    this.labels.push(item);
  }

  /** 相机按内容自动取景：竖屏看高度，横屏看宽度，楼层增减不用改代码 */
  _frameCamera(zoom) {
    const box = new THREE.Box3().setFromObject(this.world);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const host = this.canvas.parentElement || this.canvas;
    const aspect = (host.clientWidth || 1) / (host.clientHeight || 1);

    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const spanY = Math.max(size.y, 3);
    const spanXZ = Math.max(size.x, size.z);
    const distY = spanY * 0.5 / Math.tan(vFov / 2);
    const distXZ = spanXZ * 0.5 / Math.tan(hFov / 2);
    const dist = Math.max(distY, distXZ) * 1.35 * (zoom || 1);

    const dir = new THREE.Vector3(0.62, 0.42, 0.66).normalize();
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.camera.lookAt(center.x, center.y + size.y * 0.06, center.z);
    this.camera.near = 0.1;
    this.camera.far = dist * 6;
    this.camera.updateProjectionMatrix();
    this._focus = center.clone();
    this._framed = true;
  }

  /* ---------------- 状态增量 ---------------- */

  refreshRoom(roomId) {
    const node = this.roomNodes.find((n) => n.roomId === roomId);
    if (!node) return;
    this._applyState(node, this.read(node.room) || { lit: false, brightness: 0, devices: {} });
    this.renderOnce();
  }

  setSelected(roomId) {
    this.selected = roomId || null;
    this._frameCamera(roomId ? 0.92 : 1);
    this.roomNodes.forEach((node) => {
      if (node.roomId === roomId || node.roomId === this._prevSelected) {
        this._applyState(node, this.read(node.room) || { lit: false, brightness: 0, devices: {} });
      }
    });
    this._prevSelected = roomId || null;
    this.syncLabels();
    this.renderOnce();
  }

  setAutoRotate(on) {
    this.autoRotate = !!on;
  }

  setSpeed(value) {
    const n = Number(value);
    if (Number.isFinite(n)) this.speed = n;
  }

  setExploded(on) {
    this.exploded = !!on;
    this.floorGroups.forEach((group, index) => {
      const floorLevel = group.userData.baseY;
      group.position.y = floorLevel + (this.exploded ? index * 0.4 : 0);
    });
    this._frameCamera();
    this.renderOnce();
  }

  /* ---------------- 输入 ---------------- */

  _bindInput() {
    const canvas = this.canvas;

    this._down = (event) => {
      this._dragging = true;
      this._px = event.clientX;
      this._py = event.clientY;
      this._moved = 0;
      if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    };

    this._move = (event) => {
      if (!this._dragging) return;
      const dx = event.clientX - this._px;
      const dy = event.clientY - this._py;
      this._moved += Math.abs(dx) + Math.abs(dy);
      this.world.rotation.y += dx * 0.006;
      const focus = this._focus || new THREE.Vector3(0, 2, 0);
      this.camera.position.y = Math.max(focus.y - 4, Math.min(focus.y + 18, this.camera.position.y + dy * 0.03));
      this.camera.lookAt(focus.x, focus.y + 0.12, focus.z);
      this._px = event.clientX;
      this._py = event.clientY;
    };

    this._up = (event) => {
      const wasDrag = this._dragging;
      this._dragging = false;
      if (wasDrag && this._moved < 6) this._pick(event);
    };

    this._wheel = (event) => {
      event.preventDefault();
      const focus = this._focus || new THREE.Vector3(0, 2, 0);
      const offset = this.camera.position.clone().sub(focus);
      const length = offset.length();
      const next = length * (1 + Math.sign(event.deltaY) * 0.06);
      if (next > 6 && next < 60) {
        this.camera.position.copy(focus).add(offset.multiplyScalar(next / length));
        this.camera.lookAt(focus.x, focus.y + 0.12, focus.z);
      }
    };

    canvas.addEventListener("pointerdown", this._down);
    canvas.addEventListener("pointermove", this._move);
    canvas.addEventListener("pointerup", this._up);
    canvas.addEventListener("pointercancel", this._up);
    canvas.addEventListener("wheel", this._wheel, { passive: false });
  }

  _pick(event) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hits = ray.intersectObjects(this.world.children, true);
    const device = hits.find((hit) => hit.object.userData && hit.object.userData.roomId && hit.object.userData.slot);
    if (device) {
      const u = device.object.userData;
      this.onPick(u.roomId, u.slot, u.action || "toggle");
      return;
    }
    const roomHit = hits.find((hit) => hit.object.userData && hit.object.userData.roomId);
    if (roomHit) this.onPick(roomHit.object.userData.roomId, null, "select");
  }

  /* ---------------- 渲染 ---------------- */

  resize() {
    const host = this.canvas.parentElement || this.canvas;
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    const aspect = this.camera.aspect;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this._framed || Math.abs(aspect - this.camera.aspect) > 0.02) this._frameCamera();
    this.syncLabels();
    this.renderOnce();
  }

  syncLabels() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const tmp = new THREE.Vector3();
    this.labels.forEach((label) => {
      const group = this.floorGroups.find((g) => g.userData.floorId === label.floorId);
      if (!group) {
        label.el.style.opacity = 0;
        return;
      }
      tmp.copy(label.local).applyMatrix4(group.matrixWorld).project(this.camera);
      const x = (tmp.x * 0.5 + 0.5) * rect.width;
      const y = (-tmp.y * 0.5 + 0.5) * rect.height;
      const visible = tmp.z < 1 && tmp.z > -1;
      label.el.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px)`;
      label.el.style.opacity = visible ? (label.roomId === this.selected ? "1" : "0.72") : "0";
      label.el.classList.toggle("hot", !!label.roomId && label.roomId === this.selected);
    });
  }

  renderOnce() {
    this.syncLabels();
    this.renderer.render(this.scene, this.camera);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._last = 0;
    const loop = (time) => {
      if (!this._running) return;
      this._raf = requestAnimationFrame(loop);
      const delta = time - this._last;
      this._last = time;
      this._acc += delta;
      const idle = !this._dragging && !this.autoRotate;
      if (this._acc < (idle ? IDLE_MS : ACTIVE_MS)) return;
      this._acc = 0;
      if (this.autoRotate && !this._dragging) this.world.rotation.y += this.speed;
      this.roomNodes.forEach((node) => {
        if (node.garage && typeof node.garageTarget === "number") {
          const base = node.h / 2 + 0.04;
          const target = base + node.garageTarget;
          node.garage.door.position.y += (target - node.garage.door.position.y) * 0.12;
          node.garage.edge.position.copy(node.garage.door.position);
        }
        if (node.curtains && node.curtainTarget) {
          node.curtains.forEach((cur, index) => {
            const target = node.curtainTarget[index];
            cur.mesh.position.x += (target - cur.mesh.position.x) * 0.14;
          });
        }
      });
      this.renderer.render(this.scene, this.camera);
      this.syncLabels();
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  destroy() {
    this.stop();
    this._resizeObserver.disconnect();
    this.canvas.removeEventListener("webglcontextlost", this._onLost);
    this.canvas.removeEventListener("pointerdown", this._down);
    this.canvas.removeEventListener("pointermove", this._move);
    this.canvas.removeEventListener("pointerup", this._up);
    this.canvas.removeEventListener("pointercancel", this._up);
    this.canvas.removeEventListener("wheel", this._wheel);
    this._clearWorld();
    disposeTree(this.scene);
    this.renderer.dispose();
  }
}

function disposeTree(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    const material = obj.material;
    if (material) {
      const list = Array.isArray(material) ? material : [material];
      list.forEach((m) => {
        Object.keys(m).forEach((key) => {
          const value = m[key];
          if (value && value.isTexture) value.dispose();
        });
        m.dispose();
      });
    }
  });
}
