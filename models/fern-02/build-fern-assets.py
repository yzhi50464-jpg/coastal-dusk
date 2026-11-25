"""Convert the original CC0 Fern 02 blend into four offline Three.js clumps.

Run with Blender in background mode. This is a deterministic geometry/material
conversion, not an AI-generated asset, remesh, or scan authored by this project.
Only the dedicated nature-assets.js and fern-build.json outputs are written.
"""
import base64
import hashlib
import json
import struct
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'fern_02_1k.blend'
MANIFEST = json.loads((ROOT / 'sources.json').read_text(encoding='utf-8-sig'))
for record in MANIFEST['files']:
    data = (ROOT / record['path']).read_bytes()
    if hashlib.md5(data).hexdigest() != record['officialMD5']:
        raise RuntimeError('Original source MD5 mismatch: ' + record['path'])
    if hashlib.sha256(data).hexdigest() != record['sha256']:
        raise RuntimeError('Original source SHA256 mismatch: ' + record['path'])

bpy.ops.wm.open_mainfile(filepath=str(SOURCE))


def encoded(values, kind):
    return base64.b64encode(struct.pack('<' + str(len(values)) + kind, *values)).decode('ascii')


def mesh_record(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    world = obj.matrix_world
    normal_transform = world.to_3x3().inverted().transposed()
    # Blender Z-up -> Three.js Y-up is a proper rotation, preserving winding.
    points = []
    for vertex in mesh.vertices:
        p = world @ vertex.co
        points.append((p.x, p.z, -p.y))
    lower = [min(p[axis] for p in points) for axis in range(3)]
    upper = [max(p[axis] for p in points) for axis in range(3)]
    height = upper[1] - lower[1]
    center = ((upper[0] + lower[0]) * .5, lower[1], (upper[2] + lower[2]) * .5)
    if height <= 0:
        raise RuntimeError('Empty fern height: ' + obj.name)
    positions, normals, uvs, indices = [], [], [], []
    unique = {}
    uv = mesh.uv_layers.active.data
    for triangle in mesh.loop_triangles:
        for loop_index in triangle.loops:
            loop = mesh.loops[loop_index]
            p = points[loop.vertex_index]
            n = (normal_transform @ mesh.corner_normals[loop_index].vector).normalized()
            t = uv[loop_index].uv
            values = tuple(round(value, 7) for value in (
                (p[0] - center[0]) / height, (p[1] - center[1]) / height, (p[2] - center[2]) / height,
                n.x, n.z, -n.y, t.x, t.y
            ))
            if values not in unique:
                unique[values] = len(positions) // 3
                positions.extend(values[:3])
                normals.extend(values[3:6])
                uvs.extend(values[6:])
            indices.append(unique[values])
    if len(unique) >= 65536:
        raise RuntimeError('Fern is too large for Uint16 indices')
    bounds = [[min(positions[i::3]) for i in range(3)], [max(positions[i::3]) for i in range(3)]]
    return {
        'name': obj.name, 'vertices': len(unique), 'triangles': len(indices) // 3,
        'position': encoded(positions, 'f'), 'normal': encoded(normals, 'f'),
        'uv': encoded(uvs, 'f'), 'index': encoded(indices, 'H'), 'bounds': bounds,
        'originalBoundsYUp': [lower, upper], 'originalHeightMeters': height,
    }


meshes = [mesh_record(obj) for obj in sorted(bpy.context.scene.objects, key=lambda item: item.name) if obj.type == 'MESH']
if len(meshes) != 4:
    raise RuntimeError('Expected four separate complete fern clumps')
textures = {}
for name, path, mime in [
    ('diffuse', 'textures/fern_02_diff_1k.jpg', 'image/jpeg'),
    ('alpha', 'textures/fern_02_alpha_1k.png', 'image/png'),
    ('normal', 'textures/fern_02_nor_gl_1k.jpg', 'image/jpeg'),
]:
    image = bpy.data.images.load(str(ROOT / path), check_existing=False)
    if tuple(image.size) != (1024, 1024):
        raise RuntimeError('Texture is not 1K square: ' + path)
    textures[name] = 'data:' + mime + ';base64,' + base64.b64encode((ROOT / path).read_bytes()).decode('ascii')

provenance = {
    'asset': 'Poly Haven Fern 02', 'source': MANIFEST['source'], 'license': MANIFEST['license'],
    'licenseURL': MANIFEST['licenseURL'], 'legalCode': MANIFEST['legalCode'], 'authors': MANIFEST['authors'],
    'conversion': 'Original source mesh separated by complete plant; world transforms baked; Y-up, centered X/Z and normalized to unit height. Original 1K diffuse/alpha/GL normal maps embedded unchanged.',
    'tool': 'Blender ' + bpy.app.version_string, 'originalCreator': False,
}
payload = {'meshes': meshes, 'textures': textures, 'provenance': provenance}
template = (ROOT / 'nature-runtime.js').read_text(encoding='utf-8')
output = template.replace('/*__FERN_PAYLOAD__*/ null', json.dumps(payload, separators=(',', ':')))
target = ROOT.parent.parent / 'nature-assets.js'
target.write_text(output, encoding='utf-8')
summary = {
    'provenance': provenance,
    'variants': [{key: mesh[key] for key in ['name', 'vertices', 'triangles', 'bounds', 'originalBoundsYUp', 'originalHeightMeters']} for mesh in meshes],
    'totalSourceTriangles': sum(mesh['triangles'] for mesh in meshes),
    'worstCaseThreePlantsTriangles': max(mesh['triangles'] for mesh in meshes) * 3,
    'textureDimensions': {name: [1024, 1024] for name in textures},
    'generatedJavaScriptBytes': target.stat().st_size,
    'generatedJavaScriptSHA256': hashlib.sha256(target.read_bytes()).hexdigest(),
}
(ROOT / 'fern-build.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print('FERN_BUILD', json.dumps(summary), flush=True)
