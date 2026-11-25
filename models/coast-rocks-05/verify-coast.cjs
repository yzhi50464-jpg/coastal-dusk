/* Offline CPU/API checks; this does not replace browser shader/image QA. */
const fs = require('fs'), path = require('path'), assert = require('assert'), crypto = require('crypto');
const base = path.resolve(__dirname, '../..');
const THREE = require(path.join(base, 'vendor/three.min.js'));
const build = JSON.parse(fs.readFileSync(path.join(__dirname, 'coast-build.json'), 'utf8'));
const source = fs.readFileSync(path.join(base, 'coast-assets.js'));
assert.strictEqual(crypto.createHash('sha256').update(source).digest('hex'), build.generatedJavaScriptSHA256);
function jpegSize(bytes) {
  assert.strictEqual(bytes.readUInt16BE(0), 0xffd8);
  let i = 2;
  while (i < bytes.length) {
    while (bytes[i] === 0xff) i++;
    const marker = bytes[i++];
    if (marker === 0xd9 || marker === 0xda) break;
    const size = bytes.readUInt16BE(i);
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return {height: bytes.readUInt16BE(i + 3), width: bytes.readUInt16BE(i + 5)};
    i += size;
  }
  throw new Error('JPEG dimensions not found');
}
global.window = {};
require(path.join(base, 'coast-assets.js'));
const CoastalReef = window.CoastalReef;
let loads = 0;
class MockTextureLoader {
  load(uri, onLoad) {
    assert(uri.startsWith('data:image/jpeg;base64,'));
    const dimensions = jpegSize(Buffer.from(uri.split(',')[1], 'base64'));
    const texture = new THREE.Texture(dimensions);
    loads++;
    queueMicrotask(() => onLoad(texture));
    return texture;
  }
}
(async () => {
  const renderer = {capabilities: {getMaxAnisotropy: () => 16}};
  const three = {...THREE, TextureLoader: MockTextureLoader};
  const preparing = CoastalReef.prepare(three, renderer);
  assert.strictEqual(preparing, CoastalReef.prepare(three, renderer));
  const reef = await preparing;
  assert.strictEqual(loads, 3);
  const root = new THREE.Group();
  root.position.set(-6, 1, 2);
  root.rotation.y = -.19;
  const a = reef.createRock(root, 2, .15, 4, .85, .31), b = reef.createRock(root, 9, .15, 4, .85, -.30);
  assert.strictEqual(a.geometry, b.geometry);
  assert.strictEqual(a.material, b.material);
  const geometry = a.geometry;
  for (const attribute of Object.values(geometry.attributes)) assert(Array.from(attribute.array).every(Number.isFinite));
  assert(Array.from(geometry.index.array).every(i => i >= 0 && i < geometry.attributes.position.count));
  assert.strictEqual(geometry.index.count / 3, build.triangles);
  assert(build.triangles >= 9000 && build.triangles <= 12000);
  assert(build.triangles * 2 < 30000);
  assert(source.length < 4000000);
  const box = geometry.boundingBox;
  assert(Math.abs(box.min.y) < 1e-6);
  assert(Math.abs(box.min.x + box.max.x) < 1e-5 && Math.abs(box.min.z + box.max.z) < 1e-5);
  for (let i = 0; i < geometry.attributes.normal.count; i++) {
    const normal = new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, i);
    assert(Math.abs(normal.length() - 1) < .001);
  }
  assert.strictEqual(a.material.map.colorSpace, THREE.SRGBColorSpace);
  assert.strictEqual(a.material.normalMap.colorSpace, THREE.NoColorSpace);
  assert.strictEqual(a.material.roughnessMap.colorSpace, THREE.NoColorSpace);
  assert.strictEqual(a.material.aoMap, a.material.roughnessMap);
  assert.strictEqual(a.material.side, THREE.DoubleSide);
  assert(a.castShadow && a.receiveShadow);
  root.updateMatrixWorld(true);
  const proxy = reef.createProxy(a), matrix = new THREE.Matrix4();
  proxy.getMatrixAt(0, matrix);
  for (let i = 0; i < 16; i++) assert(Math.abs(matrix.elements[i] - a.matrixWorld.elements[i]) < 1e-6);
  assert(proxy.isInstancedMesh && proxy.count === 1 && proxy.visible === false);
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  const center = new THREE.Box3().setFromObject(a).getCenter(new THREE.Vector3());
  let checked = 0, maximumHitDifference = 0;
  for (const dx of [-.7, -.35, 0, .35, .7]) for (const dz of [-.7, -.35, 0, .35, .7]) {
    ray.set(new THREE.Vector3(center.x + dx, 10, center.z + dz), down);
    const visualHit = ray.intersectObject(a, false)[0], proxyHit = ray.intersectObject(proxy, false)[0];
    if (visualHit && proxyHit) {
      const difference = visualHit.point.distanceTo(proxyHit.point);
      maximumHitDifference = Math.max(maximumHitDifference, difference);
      assert(difference < 1e-4);
      checked++;
    }
  }
  assert(checked > 0, 'No geometric hits to compare');
  console.log(JSON.stringify({result: 'PASS_CPU_ONLY', bytes: source.length, triangles: build.triangles, vertices: build.vertices, bounds: build.bounds, textureSizes: reef.stats.textureSizes, proxyRayChecks: checked, maximumHitDifference, twoInstancesTriangles: build.triangles * 2}, null, 2));
})().catch(error => {console.error(error); process.exitCode = 1;});
