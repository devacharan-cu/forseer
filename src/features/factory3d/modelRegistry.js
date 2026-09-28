// Maps a machine's recorded type to a 3D asset. Assets are authored by
// scripts/build-machine-models.mjs; any licensed GLB with the same named
// andon nodes can replace a file in public/models/machines/ without code changes.
//
// extents are the model's measured footprint (metres) used for layout.
export const MACHINE_MODELS = {
  'cnc-mill': { url: '/models/machines/cnc-mill.glb', x: [-1.8, 1.45], z: [-1.6, 1.25], height: 2.3 },
  'laser-cutter': { url: '/models/machines/laser-cutter.glb', x: [-1.65, 2.45], z: [-1.1, 1.0], height: 1.8 },
  'welding-robot': { url: '/models/machines/welding-robot.glb', x: [-1.5, 1.5], z: [-1.4, 1.4], height: 2.3 },
  'stamping-press': { url: '/models/machines/stamping-press.glb', x: [-1.85, 2.0], z: [-0.95, 1.95], height: 4.3 },
  'hydraulic-press': { url: '/models/machines/hydraulic-press.glb', x: [-1.5, 2.0], z: [-0.75, 1.3], height: 4.3 },
  'injection-molder': { url: '/models/machines/injection-molder.glb', x: [-2.35, 2.35], z: [-0.7, 0.9], height: 2.6 },
  'packaging-machine': { url: '/models/machines/packaging-machine.glb', x: [-2.65, 2.25], z: [-1.05, 0.8], height: 2.0 },
  'sealing-machine': { url: '/models/machines/sealing-machine.glb', x: [-1.3, 1.3], z: [-0.75, 0.75], height: 2.6 },
  'labeling-machine': { url: '/models/machines/labeling-machine.glb', x: [-1.2, 1.2], z: [-1.05, 0.4], height: 2.0 },
  'inspection-station': { url: '/models/machines/inspection-station.glb', x: [-1.3, 1.3], z: [-0.6, 0.9], height: 2.9 },
  'generic-machine': { url: '/models/machines/generic-machine.glb', x: [-0.95, 0.95], z: [-0.75, 0.8], height: 2.0 },
}

export const CONVEYOR_MODEL_URL = '/models/machines/conveyor.glb'

// CC0 photoreal set dressing from Poly Haven (credits in public/models/CREDITS.md).
// The shelving asset is authored at 10x real size (21 m tall), hence its scale.
export const PROP_MODELS = {
  toolCart: { url: '/models/props/tool_cart.glb', scale: 1 },
  shelves: { url: '/models/props/steel_frame_shelves_01.glb', scale: 0.1 },
  extinguisher: { url: '/models/props/korean_fire_extinguisher_01.glb', scale: 1 },
  barrel: { url: '/models/props/Barrel_01.glb', scale: 1 },
  storageCart: { url: '/models/props/industrial_storage_cart.glb', scale: 1 },
  weldingCart: { url: '/models/props/portable_welding_cart.glb', scale: 1 },
  toolChest: { url: '/models/props/metal_tool_chest.glb', scale: 1 },
}

export const ENVIRONMENT_HDRI = '/hdri/machine_shop_02_1k.hdr'

const TYPE_RULES = [
  [/stamp/i, 'stamping-press'],
  [/hydraulic|press/i, 'hydraulic-press'],
  [/weld/i, 'welding-robot'],
  [/laser/i, 'laser-cutter'],
  [/cnc|mill|lathe|machining/i, 'cnc-mill'],
  [/inject|mold|mould/i, 'injection-molder'],
  [/packag|wrap|carton/i, 'packaging-machine'],
  [/seal/i, 'sealing-machine'],
  [/label/i, 'labeling-machine'],
  [/inspect|vision|quality/i, 'inspection-station'],
]

export function modelKeyForType(machineType) {
  for (const [pattern, key] of TYPE_RULES) if (pattern.test(machineType ?? '')) return key
  return 'generic-machine'
}
