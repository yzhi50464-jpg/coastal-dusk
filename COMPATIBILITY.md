# Local verification — 2026-10-24

Tested with Chrome 155.0.8059.85 on this Windows computer, using an isolated headless browser and actual rendered framebuffers. Mobile dimensions and device-pixel ratios were emulated; these checks are not physical Android/iOS or Safari tests.

| Case | Actual result |
| --- | --- |
| High → balanced → low → high, via UI | Rendered nonempty frames, correct post-processing changes, no GL errors |
| 3840 × 2160 CSS, DPR 3, high | Drawing buffer 2149 × 1209 = 2,598,141 pixels; within the 2.6M budget |
| 844 × 390 landscape settings | Bounded, scrollable panel; quality selector reachable; overlapping view picker raised behind settings |
| WebGL 1 forced before initialization | Genuine WebGLRenderingContext; five views rendered; no HDR or PMREM; no GL errors |
| WebGL 1 with OES_element_index_uint denied | Four large meshes expanded to non-indexed buffers; zero remaining Uint32-indexed meshes; all five views rendered without GL errors |
| WebGL 2 with float-color extension denied | Direct rendering worked, no HDR/PMREM; no GL errors |
| Real WEBGL_lose_context loss and restore | Camera, view, paused time and dusk retained; environment rebuilt, glass recaptured, high-quality rendering recovered |

The final v18 seven-scenario run had zero browser exceptions/console errors and zero remote requests. Normal offline verification also checked layout bounds, a clear terrace doorway, all five views, roof restoration, night settings, audio, pointer drag and mobile two-finger pinch. The imported fern maps decoded at 1024 × 1024 and the two placed plants total 4,632 triangles.

Both scanned ledges retain UV/UV1/UV2, use Uint16 indices and total 21,998 triangles. Browser-decoded maps are 1024² diffuse, 512² normal and 512² packed ARM. Vertical rays found 27 exposed sample points across the two real meshes; all 27 corresponding cells were present in the baked shoreline mask. Actual transformed patch bottoms are Y=-0.42 and tops are about 1.126/0.956, clear of the cabin and deck. The distant crest canopy is 160 instances / 3,200 triangles / one draw batch, without shadow passes.

The final normal offline run reported 219 initial draw calls and 5,830,936 rendered triangles at high quality, including the scene's rendering passes; this is not an FPS measurement or a hardware-independent performance promise. Bedroom aisle remains 0.9132 scene units; twelve terrace-door ray probes were unobstructed. Water pixel differences stayed within one byte of temporal dither while paused, and changed substantially when advancing scene time. The final self-contained HTML was rendered and verified; both HTMLs also passed byte-content matching against every current runtime module.

The v18 rear envelope adds local cedar siding and a closed louvered rear gable, without changing light powers or furniture. Nine real ray probes hit the mountain-facing siding and five hit the rear gable in the merged rendered meshes. In plan view those five gable probes found no visible gable while all nine wall probes still hit; all gable hits returned after restoring the roof. Dedicated rear and shore camera screenshots supplement the five user views. The revised canopy retains two instance batches: 2,594 branches and 46,960 leaves, totaling 730,072 triangles (+6,300 versus v17), with zero exclusion-zone vertex intrusions. Two short shore spines reuse ten existing rocks; scanned ledges remain unchanged. Smaller gravel/barnacles reduce the shore-detail geometry from 28,904 to 24,536 triangles. New runtime code requires no additional browser extensions or external downloads.

The v17 wall lamps use regular MeshStandardMaterial, one FrontSide transparent sleeve per lamp, tone-mapped warm diffuse cores, and a power-of-two 64×128 linear intensity mask. No transmission, new shadow lights or HDR-only lamp shaders were introduced. Browser checks inspected real merged geometry/materials: two sleeves, 768 core triangles, finite positions and the expected weak falloff texture. The two existing wall-light world positions were unchanged. All 18 rail-lamp stations were unique and faced inward; actual diffuser vertices were only 0.006 scene units deep at the intended inner timber faces. Eleven rail point lights remain. Sheltered cedar surfaces retain their maps with local bump scales .0045/.005 and roughness .84/.86.

The minimum WebGL 1 path needs ANGLE_instanced_arrays and OES_standard_derivatives. Missing essential capabilities show a readable failure screen. The missing OES_element_index_uint path is now exercised in the seven-scenario run; expanding geometry costs more buffer memory than retaining indices. It is a functional fallback, not a promise that old GPUs will run at high frame rates. Frame rates remain device-dependent and are not certified by these checks.

The scene uses approximate real-time lighting and surf. Lower quality intentionally trades antialiasing, reflection resolution and contact shading for lower pixel and render-target cost. Auto mode uses capability/device hints and sustained frame timings; manual modes remain subject to hardware and pixel limits.
