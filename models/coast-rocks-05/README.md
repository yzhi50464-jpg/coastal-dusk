# Coast Rocks 05 — offline reduced marine ledge

External source: **Coast Rocks 05 by Rob Tuytel / Poly Haven**, licensed **CC0 1.0**. This is not an original model made for the project.

- Official source: https://polyhaven.com/a/coast_rocks_05
- License: https://polyhaven.com/license
- CC0: https://creativecommons.org/publicdomain/zero/1.0/
- Official file manifest: https://api.polyhaven.com/files/coast_rocks_05

`original/` preserves the exact official glTF, BIN, diffuse, GL normal and ARM files. `sources.json` records URL, expected/actual MD5, SHA256 and byte count. The selected official glTF is the complete low marine-erosion formation; it is not a cropped image, a generic round rock or a runtime external model request.

## Conversion

`prepare-textures.py` uses local Pillow to resize diffuse to 1024×1024 and normal/ARM to 512×512, then encode JPEG with 4:4:4 chroma. It does not perform color management, gamma conversion, exposure adjustments or color grading. Normal and packed ARM channels remain numerical RGB data. `texture-build.json` records original dimensions, output sizes, hashes and per-channel JPEG compression error. Lossy JPEG introduces small numerical error; it is not described as mathematically lossless.

`build-coast-assets.py` first welds coincident glTF seam vertices while preserving per-loop UVs, then uses Blender to reduce the original 771,724-triangle mesh to approximately 11K triangles with Collapse decimation, retain the original UV atlas, recalculate smooth normals, bake object transforms and convert Z-up to Y-up. Welding before reduction prevents false cracks caused by independently simplifying disconnected UV islands. This is a simplified mesh, so minor original erosion detail is represented by the normal map rather than geometry. The supplied glTF is about 4.04m wide while the official metadata states 3.036m; this module **uniformly normalizes the width to 3.0363907m**, centers the resulting X/Z bounds, and places its lowest vertex at **Y=0**. Actual final bounds, normalization factor and counts are in `coast-build.json`.

`../../coast-assets.js` embeds indexed position/normal/UV buffers and all three processed images. No runtime network, Blender, file access, glTFLoader or Pillow is needed. Geometry/material are shared between instances. The material uses diffuse sRGB, normal/ARM linear, moderate `.50` normal strength, `.90` roughness multiplier, `.65` AO strength and no metalness. It preserves double-sided shading because the source is an open scan patch rather than a closed solid. All textures have power-of-two dimensions, mipmaps and up to 8× anisotropy.

## Rebuild

```powershell
& .\download-assets.ps1
python .\prepare-textures.py
blender --background --python .\build-coast-assets.py -- --preview
node .\verify-coast.cjs
```

The download is build-time only. `--preview` optionally renders original/reduced neutral-light PNG comparisons. `coast-rocks-05-reduced.blend` is an editable local reduced source. The unchanged downloaded glTF remains available for reprocessing.

## Runtime API

Load `coast-assets.js` before the scene:

```javascript
const reef = await CoastalReef.prepare(THREE, renderer);
const rock = reef.createRock(parent, x, bottomY, z, 1.0, Math.PI * .2);
// Uniform scale is a multiplier on the normalized 3.03639-meter width.
// Angle is radians about local Y. Geometry and material are shared.
const proxy = reef.createProxy(rock);
terrainRockMeshes.push(proxy);
```

`prepare` resolves after embedded images decode and is cached per renderer. `createRock(parent,x,y,z,scale=1,angle=0)` returns a Mesh relative to `parent`; Y is the model's **bottom**, not its center. The returned Mesh casts and receives shadows. Caller may adjust its transform and common `reef.material` before static batching; clone material first for instance-only changes.

`createProxy(rock)` snapshots the rock's **current world transform** into one InstancedMesh instance using the identical reduced geometry. It returns a detached, invisible, double-sided bake-only proxy. This supports the existing terrain baker's `.count`, `.getMatrixAt()`, BufferGeometry bounds and Raycaster path. Keep it detached or attach only beneath an identity-transform scene parent; do not add beneath the transformed cabin. Create the proxy after final placement, or recreate it if the rock moves. It is intended for shore-distance baking, not as a visible second copy or a collision-physics engine.

`reef.geometry`, `reef.material`, and `reef.stats` are exposed for integration. Instance counts track creations, not current attachments. Only 1–2 visible copies are intended; three full copies exceed the requested approximately 30K new-triangle budget. Per-instance geometry must not be disposed when removing a single rock. Browser placement, final waterline rebake and scene light matching remain integrator checks.

The CPU verifier mocks texture loading, separately checks real JPEG dimensions from file headers, validates geometry/normals/indexing/bounds and proxy world transforms, and does not claim a browser visual pass.

## Scene integration

`terrain.js` places two shared-geometry copies with submerged patch bottoms. Each copy clones only the material so the scene's generic static merge cannot remove its extra AO UV channels. Diffuse is mildly desaturated and modulated by world-height wet/dry tint; wet roughness has a `.48` floor instead of multiplying an already-low ARM value into a mirror-like surface. Scene overrides use `.45` AO strength and `.70` environment intensity; the reusable base asset values above remain unchanged. Two detached same-geometry proxies are created after placement and before shoreline/detailed-shore baking. They are never rendered. The browser verifier checks decoded texture dimensions, retained UV channels, Uint16 indexing, actual transformed bounds, 21,998 placed triangles and shore-mask occupancy at vertical ray hits on the exposed scan.
