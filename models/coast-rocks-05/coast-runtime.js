/* Coast Rocks 05 by Rob Tuytel / Poly Haven, CC0 1.0.
 * https://polyhaven.com/a/coast_rocks_05 — https://polyhaven.com/license
 * Locally reduced geometry and compressed maps; not an original model. */
(() => {
  'use strict';
  const asset = /*__COAST_PAYLOAD__*/ null;
  const readyByRenderer = new WeakMap();
  function typed(text, Type) {
    const raw = atob(text), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Type(bytes.buffer);
  }
  async function build(THREE, renderer) {
    const geometry = new THREE.BufferGeometry();
    geometry.name = 'Poly Haven Coast Rocks 05 reduced marine ledge';
    for (const [attribute, size] of [['position', 3], ['normal', 3], ['uv', 2]]) {
      geometry.setAttribute(attribute, new THREE.BufferAttribute(typed(asset.mesh[attribute], Float32Array), size));
    }
    geometry.setIndex(new THREE.BufferAttribute(typed(asset.mesh.index, Uint16Array), 1));
    // AO channel shares the source UV atlas; Three r160's default AO UV channel
    // is uv1, and older consumers also commonly look for uv2.
    geometry.setAttribute('uv1', geometry.attributes.uv.clone());
    geometry.setAttribute('uv2', geometry.attributes.uv.clone());
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData = {source: asset.provenance.source, triangles: asset.mesh.triangles};
    const loader = new THREE.TextureLoader();
    const load = url => new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
    const [diffuse, normal, arm] = await Promise.all(['diffuse', 'normal', 'arm'].map(key => load(asset.textures[key])));
    for (const [key, texture, dimension] of [['diffuse', diffuse, 1024], ['normal', normal, 512], ['arm', arm, 512]]) {
      if (texture.image.width !== dimension || texture.image.height !== dimension) throw new Error(`Coast Rocks 05 ${key} texture dimensions are invalid`);
      texture.name = `Poly Haven Coast Rocks 05 ${key}`;
      texture.colorSpace = key === 'diffuse' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      texture.flipY = true;
      texture.needsUpdate = true;
    }
    const material = new THREE.MeshStandardMaterial({
      name: 'Poly Haven Coast Rocks 05 weathered stone', color: '#ffffff', map: diffuse,
      normalMap: normal, normalScale: new THREE.Vector2(.50, .50), roughnessMap: arm,
      roughness: .90, aoMap: arm, aoMapIntensity: .65, metalness: 0, envMapIntensity: .38,
      side: THREE.DoubleSide // Source is an open scan patch, not a closed solid.
    });
    material.userData = {...asset.provenance};
    const proxyMaterial = new THREE.MeshBasicMaterial({side: THREE.DoubleSide});
    const stats = {
      ready: true, source: asset.provenance.source, author: asset.provenance.author, license: asset.provenance.license,
      triangles: asset.mesh.triangles, vertices: asset.mesh.vertices, bounds: asset.mesh.bounds,
      originalTriangles: asset.mesh.originalTriangles, textureSizes: {diffuse: [1024, 1024], normal: [512, 512], arm: [512, 512]},
      geometryCoordinates: 'Y up, X/Z bounds centered, minY=0, uniformly scaled to official 3.03639m width', instances: 0, instanceTriangles: 0, proxies: 0
    };
    function createRock(parent, x, y, z, scale = 1, angle = 0) {
      if (!parent || typeof parent.add !== 'function') throw new TypeError('createRock requires a Three.js parent');
      if (![x, y, z, scale, angle].every(Number.isFinite) || scale <= 0) throw new RangeError('Rock transform must be finite with positive scale');
      const rock = new THREE.Mesh(geometry, material);
      rock.name = 'Poly Haven Coast Rocks 05 marine ledge';
      rock.position.set(x, y, z);
      rock.scale.setScalar(scale);
      rock.rotation.y = angle;
      rock.castShadow = true;
      rock.receiveShadow = true;
      rock.userData = {asset: 'coast_rocks_05', source: asset.provenance.source, triangles: asset.mesh.triangles};
      parent.add(rock);
      stats.instances++;
      stats.instanceTriangles += asset.mesh.triangles;
      return rock;
    }
    function createProxy(rock) {
      if (!rock?.isMesh || rock.geometry !== geometry) throw new TypeError('createProxy requires a rock created by this prepared asset');
      rock.updateWorldMatrix(true, false);
      const proxy = new THREE.InstancedMesh(geometry, proxyMaterial, 1);
      proxy.name = 'Coast Rocks 05 shoreline bake proxy';
      proxy.setMatrixAt(0, rock.matrixWorld);
      proxy.instanceMatrix.needsUpdate = true;
      proxy.computeBoundingSphere();
      proxy.visible = false;
      proxy.userData = {asset: 'coast_rocks_05', bakeOnly: true, transformSpace: 'world matrix baked into instance 0'};
      // Add only under an identity-transform parent, or leave detached. The
      // exact same reduced surface is available to Raycaster/shoreline baking.
      stats.proxies++;
      return proxy;
    }
    return {createRock, createProxy, geometry, material, stats};
  }
  window.CoastalReef = {
    provenance: asset.provenance,
    prepare(THREE, renderer) {
      if (!THREE || !renderer?.capabilities) return Promise.reject(new TypeError('CoastalReef.prepare requires Three.js and its renderer'));
      if (!readyByRenderer.has(renderer)) {
        const promise = build(THREE, renderer).catch(error => {readyByRenderer.delete(renderer); throw error;});
        readyByRenderer.set(renderer, promise);
      }
      return readyByRenderer.get(renderer);
    }
  };
})();
