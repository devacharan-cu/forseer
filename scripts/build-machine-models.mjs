// Authors FORSEER's machine GLB assets: one model per seeded machine type, plus a
// conveyor module. Units are metres, +Y is up, the operator side faces +Z.
//
// Every model contains three separately named stack-light segments
// (andon_red, andon_amber, andon_green) that the app lights from real machine
// state. Everything else is merged into one mesh per material to keep draw calls low.
//
//   node scripts/build-machine-models.mjs
//   npx @gltf-transform/cli optimize <in>.glb <out>.glb --compress meshopt   (per file)
import { mkdirSync, writeFileSync } from 'node:fs'
import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const OUT_DIR = new URL('../public/models/machines/', import.meta.url)

// GLTFExporter's binary path relies on the browser FileReader.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer
      this.onloadend?.({ target: this })
      this.onload?.({ target: this })
    })
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`
      this.onloadend?.({ target: this })
      this.onload?.({ target: this })
    })
  }
}

const MATERIALS = {
  paint_white: { color: '#e7eaed', roughness: 0.42, metalness: 0.12 },
  paint_grey: { color: '#9aa2ab', roughness: 0.48, metalness: 0.28 },
  paint_press: { color: '#6f7b86', roughness: 0.46, metalness: 0.3 },
  graphite: { color: '#2b2f34', roughness: 0.55, metalness: 0.35 },
  steel: { color: '#c7ccd1', roughness: 0.26, metalness: 0.92 },
  dark_steel: { color: '#555b62', roughness: 0.34, metalness: 0.86 },
  safety_yellow: { color: '#f2b705', roughness: 0.44, metalness: 0.1 },
  robot_orange: { color: '#e8792b', roughness: 0.4, metalness: 0.15 },
  accent_blue: { color: '#2563eb', roughness: 0.38, metalness: 0.2 },
  glass: { color: '#b9d3e3', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.26 },
  glass_tint: { color: '#34414c', roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.55 },
  rubber: { color: '#1a1c1f', roughness: 0.92, metalness: 0 },
  screen: { color: '#0d1a26', roughness: 0.2, metalness: 0.1, emissive: '#1f5f99', emissiveIntensity: 0.9 },
  estop: { color: '#c62828', roughness: 0.35, metalness: 0.05 },
  button_green: { color: '#1f9d55', roughness: 0.35, metalness: 0.05 },
  copper: { color: '#b86b3a', roughness: 0.3, metalness: 0.9 },
  product: { color: '#c8a068', roughness: 0.8, metalness: 0 },
  label: { color: '#f4f5f6', roughness: 0.6, metalness: 0 },
  led: { color: '#ffffff', roughness: 0.3, metalness: 0, emissive: '#dbeafe', emissiveIntensity: 1.6 },
}

const ANDON = {
  andon_red: '#dc2626',
  andon_amber: '#f59e0b',
  andon_green: '#16a34a',
}

function material(name) {
  const spec = MATERIALS[name]
  const mat = new MeshStandardMaterial({
    name,
    color: spec.color,
    roughness: spec.roughness,
    metalness: spec.metalness,
    transparent: spec.transparent ?? false,
    opacity: spec.opacity ?? 1,
  })
  if (spec.emissive) {
    mat.emissive.set(spec.emissive)
    mat.emissiveIntensity = spec.emissiveIntensity ?? 1
  }
  return mat
}

// Geometry primitives -------------------------------------------------------
const rbox = (w, h, d, r = 0.03, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.2, h / 2.2, d / 2.2))
const box = (w, h, d) => new BoxGeometry(w, h, d)
const cyl = (r, h, seg = 32, rTop = r) => new CylinderGeometry(rTop, r, h, seg)
const tube = (points, radius, seg = 48) =>
  new TubeGeometry(new CatmullRomCurve3(points.map((p) => new Vector3(...p))), seg, radius, 12, false)

class ModelBuilder {
  constructor(name) {
    this.name = name
    this.buckets = new Map()
    this.named = []
  }

  static transform(geometry, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
    const matrix = new Matrix4().compose(new Vector3(...p), new Quaternion().setFromEuler(new Euler(...r)), new Vector3(...s))
    const g = geometry.index ? geometry.toNonIndexed() : geometry
    g.applyMatrix4(matrix)
    g.deleteAttribute('uv')
    return g
  }

  add(geometry, mat, transform) {
    if (!this.buckets.has(mat)) this.buckets.set(mat, [])
    this.buckets.get(mat).push(ModelBuilder.transform(geometry, transform))
    return this
  }

  addNamed(nodeName, geometry, mat, transform) {
    this.named.push({ nodeName, geometry: ModelBuilder.transform(geometry, transform), mat })
    return this
  }

  build() {
    const group = new Group()
    group.name = this.name
    for (const [matName, geometries] of this.buckets) {
      const mesh = new Mesh(mergeGeometries(geometries, false), material(matName))
      mesh.name = `${this.name}_${matName}`
      mesh.castShadow = true
      mesh.receiveShadow = true
      group.add(mesh)
    }
    for (const { nodeName, geometry, mat } of this.named) {
      const lens = new MeshStandardMaterial({ name: nodeName, color: mat, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.9 })
      lens.emissive.set(mat)
      lens.emissiveIntensity = 0
      const mesh = new Mesh(geometry, lens)
      mesh.name = nodeName
      group.add(mesh)
    }
    return group
  }
}

// Shared sub-assemblies -----------------------------------------------------
function stackLight(b, x, y, z) {
  b.add(cyl(0.035, 0.08), 'graphite', { p: [x, y + 0.04, z] })
  b.add(cyl(0.018, 0.22, 16), 'steel', { p: [x, y + 0.19, z] })
  const seg = 0.11
  const base = y + 0.3
  b.addNamed('andon_green', cyl(0.055, seg - 0.008), ANDON.andon_green, { p: [x, base + seg * 0.5, z] })
  b.addNamed('andon_amber', cyl(0.055, seg - 0.008), ANDON.andon_amber, { p: [x, base + seg * 1.5, z] })
  b.addNamed('andon_red', cyl(0.055, seg - 0.008), ANDON.andon_red, { p: [x, base + seg * 2.5, z] })
  for (let i = 0; i <= 3; i++) b.add(cyl(0.058, 0.008), 'graphite', { p: [x, base + seg * i, z] })
  b.add(cyl(0.045, 0.04, 24, 0.02), 'graphite', { p: [x, base + seg * 3 + 0.02, z] })
}

function controlPanel(b, x, y, z, ry = 0, { width = 0.55, height = 0.5 } = {}) {
  const rot = [0, ry, 0]
  const off = (dx, dy, dz) => {
    const v = new Vector3(dx, dy, dz).applyEuler(new Euler(...rot))
    return [x + v.x, y + v.y, z + v.z]
  }
  b.add(rbox(width, height, 0.1, 0.02), 'graphite', { p: [x, y, z], r: rot })
  b.add(box(width * 0.78, height * 0.55, 0.012), 'screen', { p: off(0, height * 0.12, 0.051), r: rot })
  b.add(cyl(0.03, 0.03, 24), 'estop', { p: off(width * 0.33, -height * 0.32, 0.06), r: [Math.PI / 2, ry, 0] })
  for (let i = 0; i < 3; i++) {
    b.add(cyl(0.016, 0.02, 16), i === 0 ? 'button_green' : 'dark_steel', {
      p: off(-width * 0.3 + i * 0.07, -height * 0.32, 0.055),
      r: [Math.PI / 2, ry, 0],
    })
  }
}

function pedestalPanel(b, x, z, ry = 0, height = 1.35) {
  b.add(cyl(0.18, 0.03, 32), 'dark_steel', { p: [x, 0.015, z] })
  b.add(cyl(0.035, height - 0.3, 16), 'steel', { p: [x, (height - 0.3) / 2, z] })
  controlPanel(b, x, height - 0.05, z, ry, { width: 0.5, height: 0.42 })
}

function feet(b, xs, zs, y = 0) {
  for (const x of xs) for (const z of zs) b.add(cyl(0.05, 0.06, 16), 'dark_steel', { p: [x, y + 0.03, z] })
}

// A belt conveyor along X, centred at (cx, cz), belt surface at height `top`.
function conveyor(b, length, cx, cz, top = 0.9, width = 0.56) {
  b.add(box(length, 0.025, width), 'rubber', { p: [cx, top - 0.0125, cz] })
  for (const side of [-1, 1]) {
    b.add(rbox(length, 0.1, 0.04, 0.01), 'dark_steel', { p: [cx, top - 0.05, cz + side * (width / 2 + 0.02)] })
    b.add(box(length, 0.03, 0.015), 'steel', { p: [cx, top + 0.04, cz + side * (width / 2 + 0.02)] })
  }
  for (const end of [-1, 1]) b.add(cyl(0.05, width, 24), 'steel', { p: [cx + end * (length / 2 - 0.05), top - 0.05, cz], r: [Math.PI / 2, 0, 0] })
  const legs = Math.max(2, Math.round(length / 0.9) + 1)
  for (let i = 0; i < legs; i++) {
    const lx = cx - length / 2 + 0.1 + (i * (length - 0.2)) / (legs - 1)
    for (const side of [-1, 1]) b.add(box(0.05, top - 0.1, 0.05), 'dark_steel', { p: [lx, (top - 0.1) / 2, cz + side * (width / 2 - 0.02)] })
    b.add(box(0.05, 0.05, width), 'dark_steel', { p: [lx, 0.25, cz] })
  }
}

function glassFrame(b, w, h, cx, cy, cz, { axis = 'z', frameMat = 'paint_grey', glassMat = 'glass' } = {}) {
  const t = 0.035
  const r = axis === 'x' ? [0, Math.PI / 2, 0] : [0, 0, 0]
  const along = (d) => (axis === 'x' ? [cx, cy, cz + d] : [cx + d, cy, cz])
  b.add(box(w - t * 2, h - t * 2, 0.012), glassMat, { p: [cx, cy, cz], r })
  b.add(rbox(w, t, 0.05, 0.01), frameMat, { p: [cx, cy + h / 2 - t / 2, cz], r })
  b.add(rbox(w, t, 0.05, 0.01), frameMat, { p: [cx, cy - h / 2 + t / 2, cz], r })
  b.add(rbox(t, h, 0.05, 0.01), frameMat, { p: along(-w / 2 + t / 2).map((v, i) => (i === 1 ? cy : v)), r })
  b.add(rbox(t, h, 0.05, 0.01), frameMat, { p: along(w / 2 - t / 2).map((v, i) => (i === 1 ? cy : v)), r })
}

// Machine models ------------------------------------------------------------
function cncMill() {
  const b = new ModelBuilder('cnc_mill')
  b.add(rbox(2.75, 0.22, 2.2, 0.03), 'graphite', { p: [0, 0.11, 0] })
  b.add(rbox(2.6, 2.0, 0.08), 'paint_white', { p: [0, 1.22, -1.01] })
  b.add(rbox(0.08, 2.0, 2.1), 'paint_white', { p: [-1.26, 1.22, 0] })
  b.add(rbox(0.48, 2.0, 2.1, 0.05), 'paint_white', { p: [1.06, 1.22, 0] })
  b.add(rbox(2.6, 0.14, 2.1, 0.05), 'paint_white', { p: [0, 2.19, 0] })
  b.add(rbox(2.64, 0.07, 2.14, 0.02), 'accent_blue', { p: [0, 2.08, 0] })
  b.add(rbox(2.14, 0.76, 0.08, 0.02), 'paint_white', { p: [-0.23, 0.6, 1.01] })
  b.add(box(2.1, 0.05, 1.95), 'dark_steel', { p: [-0.23, 0.97, 0] })
  glassFrame(b, 1.05, 1.1, -0.77, 1.54, 1.05)
  glassFrame(b, 1.05, 1.1, 0.26, 1.54, 1.07)
  for (const x of [-0.3, 0.73]) b.add(cyl(0.018, 0.5, 12), 'steel', { p: [x, 1.52, 1.12] })
  // Work zone
  b.add(box(1.35, 0.12, 0.62), 'steel', { p: [-0.25, 1.06, 0.05] })
  for (let i = 0; i < 4; i++) b.add(box(1.35, 0.012, 0.03), 'dark_steel', { p: [-0.25, 1.125, -0.18 + i * 0.15] })
  b.add(rbox(0.3, 0.13, 0.18, 0.01), 'dark_steel', { p: [-0.35, 1.18, 0.05] })
  b.add(rbox(0.75, 1.0, 0.5, 0.03), 'paint_grey', { p: [-0.25, 1.55, -0.68] })
  b.add(rbox(0.42, 0.5, 0.48, 0.03), 'dark_steel', { p: [-0.25, 1.78, -0.28] })
  b.add(cyl(0.075, 0.28), 'steel', { p: [-0.25, 1.43, -0.22] })
  b.add(cyl(0.02, 0.12, 16, 0.045), 'steel', { p: [-0.25, 1.24, -0.22] })
  // Operator side
  controlPanel(b, 1.12, 1.55, 1.12, -0.35, { width: 0.56, height: 0.62 })
  b.add(cyl(0.025, 0.55, 12), 'steel', { p: [1.12, 1.95, 0.95], r: [0.6, 0, 0] })
  b.add(rbox(0.3, 0.55, 0.012, 0.005), 'graphite', { p: [1.06, 1.3, 1.052] })
  // Chip conveyor, chip bin, coolant tank
  b.add(rbox(0.36, 0.55, 1.5, 0.03), 'dark_steel', { p: [-1.5, 0.62, -0.1], r: [0, 0, -0.18] })
  b.add(rbox(0.55, 0.45, 0.62, 0.03), 'paint_grey', { p: [-1.52, 0.23, 0.95] })
  b.add(rbox(1.3, 0.5, 0.42, 0.03), 'paint_grey', { p: [-0.2, 0.25, -1.35] })
  b.add(tube([[0.3, 0.5, -1.3], [0.6, 0.8, -1.15], [0.8, 1.6, -1.06]], 0.025), 'graphite')
  stackLight(b, 1.1, 2.26, -0.7)
  return b.build()
}

function laserCutter() {
  const b = new ModelBuilder('laser_cutter')
  b.add(rbox(3.3, 0.85, 1.9, 0.04), 'graphite', { p: [0, 0.425, 0] })
  for (const z of [-0.96, 0.96]) b.add(rbox(3.3, 0.6, 0.03, 0.01), 'paint_white', { p: [0, 0.45, z] })
  b.add(rbox(3.34, 0.06, 1.94, 0.02), 'accent_blue', { p: [0, 0.83, 0] })
  for (let i = 0; i < 18; i++) b.add(box(0.012, 0.09, 1.6), 'dark_steel', { p: [-1.45 + i * 0.17, 0.9, 0] })
  for (const z of [-0.88, 0.88]) b.add(box(3.2, 0.1, 0.1), 'steel', { p: [0, 0.94, z] })
  b.add(rbox(0.28, 0.32, 1.95, 0.03), 'paint_white', { p: [0.35, 1.18, 0] })
  b.add(rbox(0.3, 0.06, 1.97, 0.02), 'accent_blue', { p: [0.35, 1.36, 0] })
  b.add(rbox(0.2, 0.34, 0.2, 0.02), 'dark_steel', { p: [0.52, 1.1, 0.15] })
  b.add(cyl(0.012, 0.12, 16, 0.04), 'steel', { p: [0.52, 0.88, 0.15] })
  // Hood over the bed
  glassFrame(b, 3.2, 0.55, 0, 1.2, 0.97, { glassMat: 'glass_tint' })
  glassFrame(b, 3.2, 0.55, 0, 1.2, -0.97, { glassMat: 'glass_tint' })
  b.add(rbox(3.2, 0.05, 1.95, 0.01), 'glass_tint', { p: [0, 1.5, 0] })
  b.add(rbox(3.26, 0.08, 2.0, 0.02), 'paint_white', { p: [0, 1.52, 0] })
  // Chiller, extraction, controls
  b.add(rbox(0.7, 1.1, 0.7, 0.04), 'paint_white', { p: [2.1, 0.55, -0.55] })
  b.add(box(0.5, 0.35, 0.012), 'graphite', { p: [2.1, 0.8, -0.195] })
  b.add(tube([[2.1, 1.1, -0.7], [2.1, 1.7, -0.8], [1.4, 1.8, -1.1], [0.6, 1.62, -1.05]], 0.09), 'paint_grey')
  pedestalPanel(b, 2.0, 0.75, -0.5)
  feet(b, [-1.5, 1.5], [-0.8, 0.8])
  stackLight(b, 2.1, 1.1, -0.35)
  return b.build()
}

function weldingRobot() {
  const b = new ModelBuilder('welding_robot')
  b.add(rbox(3.0, 0.14, 2.8, 0.03), 'graphite', { p: [0, 0.07, 0] })
  for (const x of [-1.2, 1.2]) for (const z of [-1.1, 1.1]) b.add(box(0.03, 0.005, 0.8), 'safety_yellow', { p: [x * 0.98, 0.143, z * 0.5] })
  // Safety fence on three sides, open towards the operator.
  const fence = (x, z, len, axis) => {
    const posts = Math.round(len / 1.0)
    for (let i = 0; i <= posts; i++) {
      const d = -len / 2 + (i * len) / posts
      const p = axis === 'x' ? [x + d, 1.0, z] : [x, 1.0, z + d]
      b.add(box(0.06, 1.86, 0.06), 'safety_yellow', { p })
    }
    const panel = axis === 'x' ? [len - 0.06, 1.55, 0.012] : [0.012, 1.55, len - 0.06]
    b.add(box(...panel), 'glass_tint', { p: [x, 1.0, z] })
    b.add(axis === 'x' ? box(len, 0.05, 0.05) : box(0.05, 0.05, len), 'safety_yellow', { p: [x, 1.9, z] })
  }
  fence(0, -1.38, 2.9, 'x')
  fence(-1.48, 0, 2.7, 'z')
  fence(1.48, -0.35, 2.0, 'z')
  // Six-axis robot arm.
  const bx = -0.35
  const bz = -0.3
  b.add(cyl(0.34, 0.12), 'graphite', { p: [bx, 0.2, bz] })
  b.add(cyl(0.3, 0.32), 'robot_orange', { p: [bx, 0.42, bz] })
  b.add(rbox(0.36, 0.34, 0.42, 0.06), 'robot_orange', { p: [bx, 0.72, bz] })
  b.add(cyl(0.16, 0.44, 32), 'graphite', { p: [bx, 0.78, bz], r: [Math.PI / 2, 0, 0] })
  const shoulder = new Vector3(bx, 0.8, bz)
  const elbow = new Vector3(bx + 0.42, 1.55, bz + 0.18)
  const wrist = new Vector3(bx + 1.12, 1.42, bz + 0.46)
  const link = (a, c, r, mat) => {
    const dir = new Vector3().subVectors(c, a)
    const len = dir.length()
    const mid = new Vector3().addVectors(a, c).multiplyScalar(0.5)
    const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize())
    const euler = new Euler().setFromQuaternion(quat)
    b.add(rbox(r * 2, len, r * 1.6, r * 0.6), mat, { p: [mid.x, mid.y, mid.z], r: [euler.x, euler.y, euler.z] })
  }
  link(shoulder, elbow, 0.13, 'robot_orange')
  b.add(cyl(0.14, 0.34, 32), 'graphite', { p: [elbow.x, elbow.y, elbow.z], r: [Math.PI / 2, 0, 0.2] })
  link(elbow, wrist, 0.09, 'robot_orange')
  b.add(new SphereGeometry(0.1, 24, 16), 'graphite', { p: [wrist.x, wrist.y, wrist.z] })
  const torchTip = new Vector3(wrist.x + 0.22, wrist.y - 0.42, wrist.z + 0.12)
  link(wrist, torchTip, 0.03, 'copper')
  b.add(cyl(0.012, 0.08, 12, 0.022), 'copper', { p: [torchTip.x, torchTip.y - 0.02, torchTip.z] })
  b.add(tube([[bx, 1.0, bz - 0.15], [bx + 0.2, 1.7, bz - 0.05], [bx + 0.8, 1.72, bz + 0.3], [wrist.x, wrist.y + 0.05, wrist.z]], 0.025), 'graphite')
  // Positioner with a workpiece.
  b.add(rbox(0.9, 0.55, 0.7, 0.04), 'paint_grey', { p: [0.75, 0.42, 0.35] })
  b.add(cyl(0.38, 0.06), 'dark_steel', { p: [0.75, 0.73, 0.35] })
  b.add(rbox(0.5, 0.18, 0.3, 0.02), 'steel', { p: [0.75, 0.85, 0.35] })
  b.add(rbox(0.12, 0.3, 0.3, 0.02), 'steel', { p: [0.65, 1.0, 0.35] })
  // Welding power source and wire drum.
  b.add(rbox(0.55, 0.9, 0.7, 0.04), 'paint_white', { p: [1.05, 0.59, -0.95] })
  b.add(box(0.36, 0.2, 0.012), 'screen', { p: [1.05, 0.85, -0.595] })
  b.add(cyl(0.26, 0.55), 'graphite', { p: [-1.05, 0.42, -0.95] })
  b.add(cyl(0.2, 0.56), 'copper', { p: [-1.05, 0.42, -0.95] })
  pedestalPanel(b, 1.2, 1.25, -0.6)
  stackLight(b, 1.48, 1.92, -1.35)
  return b.build()
}

function stampingPress() {
  const b = new ModelBuilder('stamping_press')
  b.add(rbox(2.3, 0.72, 1.85, 0.05), 'graphite', { p: [0, 0.36, 0] })
  b.add(box(1.75, 0.12, 1.35), 'steel', { p: [0, 0.78, 0] })
  b.add(rbox(1.25, 0.26, 0.95, 0.02), 'dark_steel', { p: [0, 0.97, 0] })
  for (const x of [-0.92, 0.92]) {
    b.add(rbox(0.44, 2.25, 1.55, 0.06), 'paint_press', { p: [x, 1.84, 0] })
    b.add(box(0.05, 1.3, 0.12), 'steel', { p: [x * 0.745, 1.8, 0.4] })
    b.add(box(0.05, 1.3, 0.12), 'steel', { p: [x * 0.745, 1.8, -0.4] })
  }
  b.add(rbox(2.36, 0.85, 1.75, 0.07), 'paint_press', { p: [0, 3.38, 0] })
  b.add(rbox(2.4, 0.09, 1.79, 0.02), 'accent_blue', { p: [0, 3.02, 0] })
  b.add(rbox(1.34, 0.58, 1.02, 0.04), 'dark_steel', { p: [0, 2.3, 0] })
  b.add(rbox(1.25, 0.22, 0.95, 0.02), 'steel', { p: [0, 1.9, 0] })
  for (const x of [-0.35, 0.35]) b.add(cyl(0.09, 0.45), 'steel', { p: [x, 2.78, 0] })
  // Flywheel with its guard, drive motor and belt.
  b.add(cyl(0.64, 0.2, 48), 'dark_steel', { p: [1.3, 3.3, -0.1], r: [0, 0, Math.PI / 2] })
  b.add(cyl(0.18, 0.34, 32), 'steel', { p: [1.3, 3.3, -0.1], r: [0, 0, Math.PI / 2] })
  b.add(new TorusGeometry(0.62, 0.035, 12, 48), 'steel', { p: [1.41, 3.3, -0.1], r: [0, Math.PI / 2, 0] })
  b.add(new CylinderGeometry(0.72, 0.72, 0.3, 48, 1, false, 0, Math.PI), 'safety_yellow', { p: [1.34, 3.3, -0.1], r: [0, 0, Math.PI / 2] })
  b.add(cyl(0.26, 0.62), 'graphite', { p: [0.2, 4.05, -0.35], r: [0, 0, Math.PI / 2] })
  b.add(cyl(0.1, 0.16), 'steel', { p: [0.6, 4.05, -0.35], r: [0, 0, Math.PI / 2] })
  b.add(box(0.12, 0.05, 0.9), 'rubber', { p: [1.0, 3.72, -0.25], r: [0.9, 0, -0.35] })
  // Light curtains, two-hand control, electrical cabinet.
  for (const x of [-0.72, 0.72]) {
    b.add(rbox(0.07, 1.25, 0.07, 0.01), 'safety_yellow', { p: [x, 1.55, 0.98] })
    b.add(box(0.015, 1.05, 0.015), 'estop', { p: [x - Math.sign(x) * 0.04, 1.55, 0.98] })
  }
  b.add(cyl(0.2, 0.03, 32), 'dark_steel', { p: [0, 0.015, 1.75] })
  b.add(cyl(0.04, 1.0, 16), 'steel', { p: [0, 0.5, 1.75] })
  b.add(rbox(0.72, 0.2, 0.3, 0.03), 'safety_yellow', { p: [0, 1.08, 1.75] })
  for (const x of [-0.24, 0.24]) b.add(cyl(0.055, 0.05, 24), 'button_green', { p: [x, 1.2, 1.75] })
  b.add(cyl(0.045, 0.05, 24), 'estop', { p: [0, 1.2, 1.75] })
  b.add(rbox(0.55, 1.9, 0.65, 0.04), 'paint_white', { p: [-1.55, 0.95, 0.25] })
  b.add(box(0.36, 0.26, 0.012), 'screen', { p: [-1.55, 1.45, 0.58] })
  b.add(box(0.02, 1.5, 0.012), 'graphite', { p: [-1.55, 0.9, 0.583] })
  b.add(tube([[-1.55, 1.9, 0.1], [-1.3, 2.6, 0.0], [-1.0, 3.0, -0.2]], 0.035), 'graphite')
  stackLight(b, -0.9, 3.8, 0.6)
  return b.build()
}

function hydraulicPress() {
  const b = new ModelBuilder('hydraulic_press')
  b.add(rbox(1.9, 0.62, 1.45, 0.05), 'graphite', { p: [0, 0.31, 0] })
  b.add(box(1.55, 0.1, 1.15), 'steel', { p: [0, 0.67, 0] })
  for (const x of [-0.64, 0.64]) for (const z of [-0.44, 0.44]) b.add(cyl(0.09, 2.5), 'steel', { p: [x, 1.95, z] })
  b.add(rbox(1.9, 0.6, 1.45, 0.06), 'paint_grey', { p: [0, 3.2, 0] })
  b.add(rbox(1.94, 0.07, 1.49, 0.02), 'accent_blue', { p: [0, 2.94, 0] })
  b.add(cyl(0.3, 0.7), 'steel', { p: [0, 3.85, 0] })
  b.add(cyl(0.34, 0.08), 'dark_steel', { p: [0, 4.22, 0] })
  b.add(rbox(1.55, 0.26, 1.15, 0.03), 'dark_steel', { p: [0, 2.05, 0] })
  b.add(cyl(0.13, 0.72), 'steel', { p: [0, 2.55, 0] })
  for (const x of [-0.64, 0.64]) for (const z of [-0.44, 0.44]) b.add(cyl(0.13, 0.3), 'dark_steel', { p: [x, 2.05, z] })
  b.add(rbox(1.2, 0.18, 0.9, 0.02), 'steel', { p: [0, 0.81, 0] })
  // Hydraulic power unit with piping.
  b.add(rbox(0.8, 0.75, 1.05, 0.04), 'paint_grey', { p: [1.55, 0.375, -0.1] })
  b.add(cyl(0.18, 0.5), 'graphite', { p: [1.55, 0.97, -0.3], r: [0, 0, Math.PI / 2] })
  b.add(cyl(0.12, 0.8), 'steel', { p: [1.8, 1.15, 0.3] })
  b.add(cyl(0.07, 0.02, 32), 'steel', { p: [1.32, 0.95, 0.43], r: [Math.PI / 2, 0, 0] })
  b.add(cyl(0.06, 0.012, 32), 'glass', { p: [1.32, 0.95, 0.445], r: [Math.PI / 2, 0, 0] })
  b.add(tube([[1.4, 0.8, -0.4], [1.2, 2.2, -0.5], [0.5, 3.9, -0.3], [0.25, 3.9, -0.1]], 0.03), 'steel')
  b.add(tube([[1.6, 0.8, -0.5], [1.4, 2.4, -0.62], [0.6, 3.6, -0.4], [0.3, 3.6, -0.2]], 0.03), 'steel')
  for (const x of [-0.62, 0.62]) {
    b.add(rbox(0.07, 1.1, 0.07, 0.01), 'safety_yellow', { p: [x, 1.35, 0.85] })
    b.add(box(0.015, 0.9, 0.015), 'estop', { p: [x - Math.sign(x) * 0.04, 1.35, 0.85] })
  }
  pedestalPanel(b, -1.25, 1.1, 0.4)
  stackLight(b, -0.7, 3.5, 0.55)
  return b.build()
}

function injectionMolder() {
  const b = new ModelBuilder('injection_molder')
  b.add(rbox(4.7, 0.95, 1.35, 0.05), 'paint_white', { p: [0, 0.475, 0] })
  b.add(rbox(4.72, 0.06, 1.37, 0.02), 'accent_blue', { p: [0, 0.93, 0] })
  b.add(rbox(4.6, 0.08, 1.3, 0.02), 'graphite', { p: [0, 0.04, 0] })
  // Clamping unit
  b.add(rbox(0.2, 1.02, 1.02, 0.03), 'dark_steel', { p: [-0.45, 1.46, 0] })
  b.add(rbox(0.18, 0.95, 0.95, 0.03), 'dark_steel', { p: [-1.2, 1.46, 0] })
  b.add(rbox(0.22, 1.02, 1.02, 0.03), 'dark_steel', { p: [-2.15, 1.46, 0] })
  for (const y of [1.11, 1.81]) for (const z of [-0.36, 0.36]) b.add(cyl(0.05, 1.85), 'steel', { p: [-1.3, y, z], r: [0, 0, Math.PI / 2] })
  b.add(rbox(0.72, 0.36, 0.5, 0.03), 'graphite', { p: [-1.68, 1.46, 0] })
  b.add(rbox(0.22, 0.5, 0.6, 0.02), 'steel', { p: [-0.62, 1.46, 0] })
  glassFrame(b, 1.95, 0.95, -1.28, 1.46, 0.69, { frameMat: 'paint_white' })
  glassFrame(b, 1.95, 0.95, -1.28, 1.46, -0.69, { frameMat: 'paint_white' })
  b.add(rbox(2.0, 0.08, 1.4, 0.02), 'paint_white', { p: [-1.28, 1.97, 0] })
  // Injection unit
  b.add(cyl(0.1, 1.35), 'steel', { p: [0.32, 1.46, 0], r: [0, 0, Math.PI / 2] })
  for (let i = 0; i < 5; i++) b.add(cyl(0.135, 0.09), 'graphite', { p: [-0.1 + i * 0.22, 1.46, 0], r: [0, 0, Math.PI / 2] })
  b.add(cyl(0.02, 0.18, 16, 0.08), 'steel', { p: [-0.42, 1.46, 0], r: [0, 0, Math.PI / 2] })
  b.add(rbox(1.2, 0.6, 0.75, 0.04), 'paint_grey', { p: [1.6, 1.25, 0] })
  b.add(cyl(0.2, 0.55), 'graphite', { p: [2.1, 1.7, 0], r: [0, 0, Math.PI / 2] })
  // Material hopper and dryer
  b.add(new CylinderGeometry(0.28, 0.07, 0.45, 32), 'steel', { p: [0.78, 1.95, 0] })
  b.add(cyl(0.28, 0.4), 'steel', { p: [0.78, 2.37, 0] })
  b.add(cyl(0.3, 0.05), 'dark_steel', { p: [0.78, 2.6, 0] })
  b.add(cyl(0.05, 0.12), 'steel', { p: [0.78, 1.68, 0] })
  controlPanel(b, 0.25, 1.45, 0.78, 0, { width: 0.6, height: 0.5 })
  b.add(rbox(0.6, 0.35, 0.5, 0.03), 'dark_steel', { p: [-1.28, 0.75, 0.9], r: [0.35, 0, 0] })
  stackLight(b, -0.45, 2.01, -0.45)
  return b.build()
}

function packagingMachine() {
  const b = new ModelBuilder('packaging_machine')
  for (const x of [-1.1, 1.1]) for (const z of [-0.45, 0.45]) b.add(cyl(0.05, 0.3, 16), 'steel', { p: [x, 0.15, z] })
  b.add(rbox(2.5, 0.72, 1.15, 0.05), 'paint_white', { p: [0, 0.66, 0] })
  b.add(rbox(2.52, 0.06, 1.17, 0.02), 'accent_blue', { p: [0, 0.99, 0] })
  glassFrame(b, 2.4, 0.72, 0, 1.4, 0.56, { frameMat: 'paint_white' })
  glassFrame(b, 2.4, 0.72, 0, 1.4, -0.56, { frameMat: 'paint_white' })
  b.add(rbox(2.45, 0.08, 1.15, 0.02), 'paint_white', { p: [0, 1.78, 0] })
  b.add(box(2.35, 0.012, 1.08), 'glass', { p: [0, 1.77, 0] })
  conveyor(b, 2.3, 0, 0, 1.04, 0.4)
  conveyor(b, 1.4, -1.95, 0, 0.95, 0.4)
  conveyor(b, 1.0, 1.75, 0, 0.95, 0.4)
  for (let i = 0; i < 3; i++) b.add(rbox(0.22, 0.14, 0.26, 0.02), 'product', { p: [-2.4 + i * 0.4, 1.03, 0] })
  b.add(rbox(0.3, 0.1, 0.28, 0.02), 'label', { p: [1.8, 1.0, 0] })
  b.add(cyl(0.24, 0.48), 'label', { p: [-0.6, 1.25, -0.8], r: [Math.PI / 2, 0, 0] })
  b.add(cyl(0.06, 0.62), 'steel', { p: [-0.6, 1.25, -0.8], r: [Math.PI / 2, 0, 0] })
  b.add(rbox(0.06, 0.55, 0.06, 0.01), 'steel', { p: [-0.6, 0.98, -0.62] })
  controlPanel(b, 1.05, 1.42, 0.72, -0.25, { width: 0.5, height: 0.42 })
  b.add(cyl(0.025, 0.4, 12), 'steel', { p: [1.05, 1.68, 0.62] })
  stackLight(b, 1.1, 1.82, -0.4)
  return b.build()
}

function sealingMachine() {
  const b = new ModelBuilder('sealing_machine')
  for (const x of [-0.7, 0.7]) for (const z of [-0.4, 0.4]) b.add(cyl(0.05, 0.25, 16), 'steel', { p: [x, 0.125, z] })
  b.add(rbox(1.7, 0.75, 1.05, 0.05), 'paint_white', { p: [0, 0.62, 0] })
  b.add(rbox(1.72, 0.06, 1.07, 0.02), 'accent_blue', { p: [0, 0.98, 0] })
  conveyor(b, 2.6, 0, 0, 1.05, 0.42)
  for (const x of [-0.5, 0.5]) b.add(cyl(0.05, 1.05), 'steel', { p: [x, 1.55, -0.1] })
  b.add(rbox(0.9, 0.35, 0.72, 0.04), 'dark_steel', { p: [0, 1.45, 0] })
  b.add(box(0.8, 0.02, 0.6), 'copper', { p: [0, 1.27, 0] })
  b.add(rbox(1.2, 0.18, 0.5, 0.03), 'paint_white', { p: [0, 2.12, -0.1] })
  b.add(cyl(0.11, 0.35), 'steel', { p: [0, 1.85, 0] })
  b.add(cyl(0.16, 0.5), 'label', { p: [0, 1.95, -0.62], r: [0, 0, Math.PI / 2] })
  b.add(box(0.14, 0.12, 0.012), 'safety_yellow', { p: [0.3, 1.45, 0.362] })
  glassFrame(b, 1.1, 0.7, 0, 1.55, 0.5)
  for (let i = 0; i < 3; i++) b.add(rbox(0.26, 0.08, 0.3, 0.02), 'product', { p: [-1.1 + i * 0.35, 1.1, 0] })
  controlPanel(b, 0.95, 1.45, 0.55, -0.4, { width: 0.4, height: 0.36 })
  stackLight(b, 0.7, 2.21, -0.3)
  return b.build()
}

function labelingMachine() {
  const b = new ModelBuilder('labeling_machine')
  conveyor(b, 2.4, 0, 0, 0.92, 0.36)
  for (const z of [-0.22, 0.22]) b.add(box(2.2, 0.02, 0.02), 'steel', { p: [0, 1.08, z] })
  b.add(rbox(0.7, 0.75, 0.6, 0.04), 'paint_white', { p: [0.2, 0.4, -0.72] })
  b.add(cyl(0.05, 1.3), 'steel', { p: [-0.1, 1.3, -0.62] })
  b.add(rbox(0.55, 0.48, 0.26, 0.04), 'paint_white', { p: [-0.1, 1.42, -0.45] })
  b.add(rbox(0.57, 0.06, 0.28, 0.02), 'accent_blue', { p: [-0.1, 1.64, -0.45] })
  b.add(cyl(0.21, 0.08, 40), 'label', { p: [-0.3, 1.62, -0.28], r: [Math.PI / 2, 0, 0] })
  b.add(cyl(0.06, 0.1, 24), 'graphite', { p: [-0.3, 1.62, -0.28], r: [Math.PI / 2, 0, 0] })
  b.add(cyl(0.12, 0.08, 32), 'graphite', { p: [0.12, 1.45, -0.28], r: [Math.PI / 2, 0, 0] })
  b.add(box(0.3, 0.02, 0.12), 'steel', { p: [0.1, 1.12, -0.28], r: [0, 0, -0.3] })
  b.add(box(0.05, 0.05, 0.08), 'graphite', { p: [-0.55, 1.05, -0.3] })
  for (let i = 0; i < 5; i++) {
    const x = -1.0 + i * 0.45
    b.add(cyl(0.06, 0.22, 24), 'glass_tint', { p: [x, 1.03, 0] })
    b.add(cyl(0.025, 0.06, 16), 'accent_blue', { p: [x, 1.17, 0] })
    if (i > 2) b.add(cyl(0.062, 0.08, 24), 'label', { p: [x, 1.03, 0] })
  }
  glassFrame(b, 1.2, 0.5, -0.1, 1.3, 0.3)
  controlPanel(b, 0.75, 1.35, -0.55, 0, { width: 0.42, height: 0.36 })
  b.add(cyl(0.025, 0.6, 12), 'steel', { p: [0.75, 1.0, -0.62] })
  stackLight(b, 0.45, 1.7, -0.55)
  return b.build()
}

function inspectionStation() {
  const b = new ModelBuilder('inspection_station')
  conveyor(b, 2.6, 0, 0, 0.92, 0.44)
  for (const x of [-0.6, 0.6]) for (const z of [-0.5, 0.5]) b.add(box(0.06, 1.25, 0.06), 'steel', { p: [x, 1.52, z] })
  for (const z of [-0.5, 0.5]) b.add(box(1.26, 0.06, 0.06), 'steel', { p: [0, 2.14, z] })
  for (const x of [-0.6, 0.6]) b.add(box(0.06, 0.06, 1.06), 'steel', { p: [x, 2.14, 0] })
  b.add(rbox(1.3, 0.3, 1.1, 0.04), 'paint_white', { p: [0, 2.32, 0] })
  b.add(rbox(1.32, 0.05, 1.12, 0.02), 'accent_blue', { p: [0, 2.2, 0] })
  glassFrame(b, 1.14, 1.15, 0, 1.55, -0.52, { glassMat: 'glass_tint', frameMat: 'steel' })
  glassFrame(b, 1.14, 0.7, 0, 1.78, 0.52, { glassMat: 'glass_tint', frameMat: 'steel' })
  for (const [x, tilt] of [[-0.3, 0.35], [0, 0], [0.3, -0.35]]) {
    b.add(rbox(0.13, 0.13, 0.22, 0.02), 'graphite', { p: [x, 1.98, 0], r: [Math.PI / 2, 0, tilt] })
    b.add(cyl(0.035, 0.05, 24), 'glass_tint', { p: [x, 1.86, 0], r: [0, 0, tilt] })
  }
  b.add(new TorusGeometry(0.2, 0.025, 12, 48), 'led', { p: [0, 1.75, 0], r: [Math.PI / 2, 0, 0] })
  for (let i = 0; i < 4; i++) b.add(rbox(0.2, 0.12, 0.24, 0.02), 'product', { p: [-1.0 + i * 0.6, 1.0, 0] })
  b.add(rbox(0.5, 0.55, 0.45, 0.04), 'paint_grey', { p: [0.95, 0.275, 0.62] })
  b.add(cyl(0.035, 0.3), 'steel', { p: [0.95, 1.05, -0.35], r: [Math.PI / 2, 0, 0] })
  b.add(rbox(0.12, 0.12, 0.18, 0.02), 'dark_steel', { p: [0.95, 1.05, -0.52] })
  b.add(cyl(0.025, 0.8, 12), 'steel', { p: [-0.95, 1.05, 0.6] })
  controlPanel(b, -0.95, 1.55, 0.6, 0.3, { width: 0.5, height: 0.36 })
  stackLight(b, 0.6, 2.47, -0.5)
  return b.build()
}

function genericMachine() {
  const b = new ModelBuilder('generic_machine')
  b.add(rbox(1.9, 0.18, 1.5, 0.03), 'graphite', { p: [0, 0.09, 0] })
  b.add(rbox(1.8, 1.55, 1.4, 0.06), 'paint_white', { p: [0, 0.96, 0] })
  b.add(rbox(1.82, 0.07, 1.42, 0.02), 'accent_blue', { p: [0, 1.62, 0] })
  glassFrame(b, 0.9, 0.7, -0.3, 1.1, 0.71)
  controlPanel(b, 0.55, 1.15, 0.74, 0, { width: 0.42, height: 0.4 })
  stackLight(b, 0.7, 1.74, -0.5)
  return b.build()
}

function conveyorModule() {
  const b = new ModelBuilder('conveyor')
  conveyor(b, 1.0, 0, 0, 0.9, 0.5)
  return b.build()
}

const MODELS = {
  'cnc-mill': cncMill,
  'laser-cutter': laserCutter,
  'welding-robot': weldingRobot,
  'stamping-press': stampingPress,
  'hydraulic-press': hydraulicPress,
  'injection-molder': injectionMolder,
  'packaging-machine': packagingMachine,
  'sealing-machine': sealingMachine,
  'labeling-machine': labelingMachine,
  'inspection-station': inspectionStation,
  'generic-machine': genericMachine,
  conveyor: conveyorModule,
}

mkdirSync(OUT_DIR, { recursive: true })
const exporter = new GLTFExporter()
for (const [file, build] of Object.entries(MODELS)) {
  const scene = new Scene()
  scene.add(build())
  const glb = await exporter.parseAsync(scene, { binary: true })
  writeFileSync(new URL(`${file}.glb`, OUT_DIR), Buffer.from(glb))
  console.log(`wrote ${file}.glb (${(glb.byteLength / 1024).toFixed(0)} KB)`)
}
