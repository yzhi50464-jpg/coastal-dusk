/* CPU-only asset/API checks. TextureLoader is mocked; browser visual QA remains
 * separate. Actual source image dimensions are checked by Blender at export. */
const fs = require('fs'), path = require('path'), assert = require('assert'), crypto = require('crypto');
const base = path.resolve(__dirname, '../..');
const THREE = require(path.join(base, 'vendor/three.min.js'));
const build = JSON.parse(fs.readFileSync(path.join(__dirname, 'fern-build.json'), 'utf8'));
const source = fs.readFileSync(path.join(base, 'nature-assets.js'));
assert.strictEqual(crypto.createHash('sha256').update(source).digest('hex'), build.generatedJavaScriptSHA256);
global.window = {};
require(path.join(base, 'nature-assets.js'));
let textureLoads = 0;
class MockTextureLoader {
  load(uri, onLoad) {
    assert(/^data:image\/(jpeg|png);base64,/.test(uri));
    textureLoads++;
    const texture = new THREE.Texture({width: 1024, height: 1024});
    queueMicrotask(() => onLoad(texture));
    return texture;
  }
}
(async () => {
  const testThree = {...THREE, TextureLoader: MockTextureLoader};
  const renderer = {capabilities: {getMaxAnisotropy: () => 16}};
  const preparing = window.CoastalNature.prepare(testThree, renderer);
  assert.strictEqual(preparing, window.CoastalNature.prepare(testThree, renderer), 'prepare promise must be cached');
  const nature = await preparing, root = new THREE.Group();
  assert.strictEqual(textureLoads, 3);
  const bounds = [];
  for (let variant = 0; variant < 4; variant++) {
    const mesh = nature.createFern(root, 0, 0, 0, 1, variant), geometry = mesh.geometry;
    for (const attribute of Object.values(geometry.attributes)) assert(Array.from(attribute.array).every(Number.isFinite));
    assert(Array.from(geometry.index.array).every(index => index >= 0 && index < geometry.attributes.position.count));
    assert.strictEqual(geometry.index.count / 3, build.variants[variant].triangles);
    const box = geometry.boundingBox;
    assert(Math.abs(box.min.y) < 1e-6 && Math.abs(box.max.y - 1) < 1e-6, 'height must span exactly 0..1');
    assert(Math.abs(box.min.x + box.max.x) < 1e-5 && Math.abs(box.min.z + box.max.z) < 1e-5, 'horizontal bounds must be centered');
    assert(mesh.castShadow && mesh.receiveShadow);
    assert.strictEqual(mesh.material.alphaTest, .5);
    assert.strictEqual(mesh.material.side, THREE.DoubleSide);
    assert.strictEqual(mesh.material.transparent, false);
    assert(mesh.material.map.generateMipmaps && mesh.material.normalMap.generateMipmaps && mesh.material.alphaMap.generateMipmaps);
    assert.strictEqual(mesh.material.map.colorSpace, THREE.SRGBColorSpace);
    assert.strictEqual(mesh.material.normalMap.colorSpace, THREE.NoColorSpace);
    bounds.push({name: geometry.name, min: box.min.toArray(), max: box.max.toArray()});
  }
  const plantA = nature.createFern(root, 2, 3, 4, .55, 'b'), plantB = nature.createFern(root, 5, 3, 4, .55, 'fern_02_b');
  assert.strictEqual(plantA.geometry, plantB.geometry, 'instances must reuse geometry');
  assert.strictEqual(plantA.material, plantB.material, 'instances must reuse material');
  root.updateMatrixWorld(true);
  const world = new THREE.Box3().setFromObject(plantA);
  assert(Math.abs(world.min.y - 3) < 1e-6 && Math.abs(world.max.y - 3.55) < 1e-6);
  assert.throws(() => nature.createFern(root, 0, 0, 0, -1), RangeError);
  assert(build.worstCaseThreePlantsTriangles < 20000);
  assert(source.length < 3000000);
  console.log(JSON.stringify({result: 'PASS_CPU_ONLY', imageDecode: 'Blender checked real source sizes; this API test mocks TextureLoader', bytes: source.length, sharedTextureLoads: textureLoads, worstCaseThreePlantsTriangles: build.worstCaseThreePlantsTriangles, bounds}, null, 2));
})().catch(error => {console.error(error); process.exitCode = 1;});
