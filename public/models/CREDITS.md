# 3D asset credits

## Machine models — `models/machines/`

Authored for FORSEER by `scripts/build-machine-models.mjs` (one model per seeded machine type, plus a conveyor module), then welded and meshopt-compressed with glTF-Transform. Each model has three named stack-light nodes (`andon_red`, `andon_amber`, `andon_green`) that the app lights from real machine state.

Any GLB with the same node names can replace a file here; the type → file mapping lives in `src/features/factory3d/modelRegistry.js`.

## Props and lighting — CC0 1.0 (public domain), from [Poly Haven](https://polyhaven.com)

Downloaded at 1k resolution and repacked as meshopt-compressed GLB with 512 px WebP textures.

| File | Poly Haven asset | Author(s) |
|---|---|---|
| `props/tool_cart.glb` | [Tool Cart](https://polyhaven.com/a/tool_cart) | Savva Zakharov |
| `props/steel_frame_shelves_01.glb` | [Steel Frame Shelves 01](https://polyhaven.com/a/steel_frame_shelves_01) | James Ray Cock |
| `props/korean_fire_extinguisher_01.glb` | [Korean Fire Extinguisher 01](https://polyhaven.com/a/korean_fire_extinguisher_01) | UM JOORIN |
| `props/Barrel_01.glb` | [Barrel 01](https://polyhaven.com/a/Barrel_01) | Jorge Camacho |
| `props/industrial_storage_cart.glb` | [Industrial Storage Cart](https://polyhaven.com/a/industrial_storage_cart) | Jule Bielitz |
| `props/portable_welding_cart.glb` | [Portable Welding Cart](https://polyhaven.com/a/portable_welding_cart) | Georgii Gorbunov |
| `props/metal_tool_chest.glb` | [Metal Tool Chest](https://polyhaven.com/a/metal_tool_chest) | Yann Kervran, John Hutcheson |
| `../hdri/machine_shop_02_1k.hdr` | [Machine Shop 02](https://polyhaven.com/a/machine_shop_02) (image-based lighting) | Poly Haven |
