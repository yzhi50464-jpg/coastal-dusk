/* Poly Haven Fern 02, CC0 1.0. Modeling: Rico Cilliers; scanning: Rob Tuytel.
 * Source: https://polyhaven.com/a/fern_02 ; https://polyhaven.com/license
 * Locally converted with Blender; this model is not an original creation.
 * Generated payload is embedded here by build-fern-assets.py. */
(() => {
  'use strict';
  const asset = /*__FERN_PAYLOAD__*/ null;
  const readyByRenderer = new WeakMap();
  function typed(text, Type) {
    const raw = atob(text), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Type(bytes.buffer);
  }
  async function build(THREE, renderer) {
    const geometries = asset.meshes.map(record => {
      const geometry = new THREE.BufferGeometry();
      geometry.name = record.name;
      for (const [attribute, count] of [['position', 3], ['normal', 3], ['uv', 2]]) {
        geometry.setAttribute(attribute, new THREE.BufferAttribute(typed(record[attribute], Float32Array), count));
      }
      geometry.setIndex(new THREE.BufferAttribute(typed(record.index, Uint16Array), 1));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometry.userData = {source: asset.provenance.source, variant: record.name, triangles: record.triangles};
      return geometry;
    });
    const loader = new THREE.TextureLoader();
    const load = url => new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
    const [diffuse, alpha, normal] = await Promise.all(['diffuse', 'alpha', 'normal'].map(key => load(asset.textures[key])));
    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    for (const [key, texture] of [['diffuse', diffuse], ['alpha', alpha], ['normal', normal]]) {
      texture.name = `Poly Haven Fern 02 ${key} 1K`;
      texture.colorSpace = key === 'diffuse' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = anisotropy;
      texture.flipY = true; // Blender UV coordinates are bottom-left based.
      texture.needsUpdate = true;
      if (texture.image.width !== 1024 || texture.image.height !== 1024) throw new Error('Fern 02 texture dimensions must be 1024 × 1024');
    }
    const material = new THREE.MeshStandardMaterial({
      name: 'Poly Haven Fern 02 alpha-cut leaves', color: '#ffffff', map: diffuse, alphaMap: alpha,
      normalMap: normal, normalScale: new THREE.Vector2(.55, .55), roughness: .82, metalness: 0,
      alphaTest: .50, side: THREE.DoubleSide, transparent: false, depthWrite: true,
      envMapIntensity: .38
    });
    material.userData = {...asset.provenance};
    const stats = {
      ready: true, source: asset.provenance.source, license: asset.provenance.license,
      authors: asset.provenance.authors, sharedGeometries: geometries.length, sharedMaterials: 1,
      variants: asset.meshes.map(record => ({name: record.name, triangles: record.triangles, vertices: record.vertices, normalizedBounds: record.bounds})),
      textureSizes: {diffuse: [diffuse.image.width, diffuse.image.height], alpha: [alpha.image.width, alpha.image.height], normal: [normal.image.width, normal.image.height]},
      instances: 0, instanceTriangles: 0
    };
    function createFern(parent, x, y, z, height = .55, variant = 0) {
      if (!parent || typeof parent.add !== 'function') throw new TypeError('createFern requires a Three.js parent');
      if (![x, y, z, height].every(Number.isFinite) || height <= 0) throw new RangeError('Fern position and positive height must be finite');
      let index = typeof variant === 'string' ? asset.meshes.findIndex(record => record.name === variant || record.name.endsWith('_' + variant)) : Math.trunc(variant);
      if (!Number.isFinite(index)) index = 0;
      index = ((index % geometries.length) + geometries.length) % geometries.length;
      const fern = new THREE.Mesh(geometries[index], material);
      fern.name = 'Poly Haven Fern 02 ' + asset.meshes[index].name;
      fern.position.set(x, y, z);
      fern.scale.setScalar(height);
      fern.castShadow = true;
      fern.receiveShadow = true;
      fern.userData = {asset: 'fern_02', variant: asset.meshes[index].name, source: asset.provenance.source, height, triangles: asset.meshes[index].triangles};
      parent.add(fern);
      stats.instances++;
      stats.instanceTriangles += asset.meshes[index].triangles;
      return fern;
    }
    return {createFern, stats};
  }
  window.CoastalNature = {
    provenance: asset.provenance,
    prepare(THREE, renderer) {
      if (!THREE || !renderer?.capabilities) return Promise.reject(new TypeError('CoastalNature.prepare requires Three.js and its renderer'));
      if (!readyByRenderer.has(renderer)) {
        const promise = build(THREE, renderer).catch(error => {readyByRenderer.delete(renderer); throw error;});
        readyByRenderer.set(renderer, promise);
      }
      return readyByRenderer.get(renderer);
    }
  };
})();
