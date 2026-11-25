# Poly Haven Fern 02 — offline conversion

This is an externally sourced CC0 model, **not an original model created for this project**.

- Official asset: https://polyhaven.com/a/fern_02
- Modeling: **Rico Cilliers**; scanning: **Rob Tuytel**.
- License: **CC0 1.0** — https://polyhaven.com/license and https://creativecommons.org/publicdomain/zero/1.0/
- Official download manifest: https://api.polyhaven.com/files/fern_02
- `sources.json` records each exact source URL, official MD5, verified local MD5, SHA256, and byte count.

## Contents and processing

`fern_02_1k.blend` is the unchanged official source. `textures/` contains unchanged official 1024×1024 diffuse JPG, alpha PNG and OpenGL-normal JPG files. Only these three runtime maps were downloaded; the original Blender material references additional roughness/EXR maps that are intentionally omitted. The converter reads the geometry independently and sets constant roughness `.82` in Three.js. Do not claim that the original Blender shading network is reproduced exactly.

`build-fern-assets.py` uses local Blender to export the four existing complete plant objects separately, bake their object transforms, convert Z-up to Y-up, center each plant's X/Z bounds, place its bottom at Y=0 and normalize its height to 1. It preserves original triangulation, UVs and loop normals; no model simplification or external model loader is needed. `fern-build.json` contains measured geometry, dimensions and the generated JavaScript hash.

The generated `../../nature-assets.js` embeds four indexed BufferGeometries and all three images as data URIs. Runtime uses one shared material and reuses geometries. Alpha cutout, double-sided shading and alpha-tested shadows keep leaf silhouettes; depth writing stays enabled. Diffuse is sRGB; alpha and normals remain linear. Textures use trilinear mipmaps and up to 8× anisotropy. No runtime network, Blender, filesystem access or glTFLoader is required.

## Build

```powershell
& .\download-assets.ps1
blender --background --python .\build-fern-assets.py
```

Download only when reconstructing the source; ordinary use is fully offline. `download-assets.ps1` verifies source MD5 and size before writing the provenance manifest. The converter independently verifies both recorded hashes.

`node .\verify-nature.cjs` checks generated-file hash, decoded geometry, finite normals/UVs, indices, exact base/height normalization, geometry/material sharing, mipmap settings, source budgets and API behavior. This CPU test deliberately mocks image loading; it is not a substitute for the browser image-decode and visual-placement test.

## Integration API

Load `nature-assets.js` before your scene. It does not mutate or start the scene itself.

```javascript
const nature = await CoastalNature.prepare(THREE, renderer);
const fern = nature.createFern(parent, x, y, z, 0.55, 'b');
fern.rotation.y = Math.PI * 0.3;
console.log(nature.stats);
```

`prepare` is cached per renderer and resolves after all local image data are decoded. `createFern(parent,x,y,z,height,variant)` returns a Mesh for one complete plant. Position is relative to `parent`, including Y at the plant's **bottom**, not the pot bottom. Height is the desired bounding-box height in scene units. Variant can be 0–3, `a`–`d`, or `fern_02_a`–`fern_02_d`. The four original clumps are wide, arching ground ferns: start around **0.40–0.55 m tall** for indoor pots, and check their horizontal bounds before placing them near glass, curtains or a walkway. Rotate the returned mesh normally. Geometry/material are shared: do not dispose them when removing a single instance.

`nature.stats` provides decoded texture sizes, measured normalized variant bounds, triangles, number of created instances, and summed instance triangles. `instances` counts creations, not currently attached meshes. Browser rendering and placement verification are the integrator's responsibility; source conversion alone is not a visual acceptance test.
