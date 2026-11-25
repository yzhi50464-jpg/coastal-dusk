"""Reduce official Coast Rocks 05 glTF with Blender; export an offline JS asset.

Run prepare-textures.py first. Optional --preview renders neutral-light original
and reduced images from the same camera for shape/compression review.
"""
import base64
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
MANIFEST = json.loads((ROOT / 'sources.json').read_text(encoding='utf-8-sig'))
TEXTURES = json.loads((ROOT / 'texture-build.json').read_text(encoding='utf-8'))
for record in MANIFEST['files']:
    data = (ROOT / record['path']).read_bytes()
    assert hashlib.md5(data).hexdigest() == record['officialMD5'], record['path']
    assert hashlib.sha256(data).hexdigest() == record['sha256'], record['path']

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'original' / 'coast_rocks_05_1k.gltf'))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
if len(meshes) != 1:
    raise RuntimeError('Expected one complete coastal rock formation')
source = meshes[0]
bpy.context.view_layer.objects.active = source
source.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
source.data.calc_loop_triangles()
original_triangles = len(source.data.loop_triangles)
original_box = [[min((source.matrix_world @ v.co)[axis] for v in source.data.vertices) for axis in range(3)], [max((source.matrix_world @ v.co)[axis] for v in source.data.vertices) for axis in range(3)]]

low = source.copy()
low.data = source.data.copy()
low.name = 'Coast Rocks 05 - 11K marine ledge'
bpy.context.scene.collection.objects.link(low)
source.select_set(False)
low.select_set(True)
bpy.context.view_layer.objects.active = low
# glTF splits vertices at UV/normal seams. Collapse-decimating those disconnected
# islands independently opens false cracks. Weld coincident positions first;
# Blender's per-loop UV data still retain the original atlas boundaries.
before_weld = len(low.data.vertices)
bm = bmesh.new()
bm.from_mesh(low.data)
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
bm.to_mesh(low.data)
bm.free()
low.data.update()
welded_vertices = before_weld - len(low.data.vertices)
decimate = low.modifiers.new('Preserve overall erosion at 11K triangles', 'DECIMATE')
decimate.decimate_type = 'COLLAPSE'
decimate.ratio = 11000 / original_triangles
decimate.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=decimate.name)
low.data.calc_loop_triangles()
if not 9000 <= len(low.data.loop_triangles) <= 12000:
    raise RuntimeError('Reduced triangle count is outside 9-12K budget')
# Rebuild geometric normals after simplification, retaining per-loop UV islands.
if low.data.has_custom_normals:
    bpy.ops.mesh.customdata_custom_splitnormals_clear()
for polygon in low.data.polygons:
    polygon.use_smooth = True
low.data.update()

def material_for_preview():
    material = bpy.data.materials.new('Coast Rocks 05 optimized PBR')
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    maps = {}
    for key in ('diffuse', 'normal', 'arm'):
        image = bpy.data.images.load(str(ROOT / TEXTURES[key]['path']), check_existing=False)
        image.colorspace_settings.name = 'sRGB' if key == 'diffuse' else 'Non-Color'
        node = nodes.new('ShaderNodeTexImage')
        node.image = image
        maps[key] = node
    links.new(maps['diffuse'].outputs['Color'], bsdf.inputs['Base Color'])
    normal = nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value = .5
    links.new(maps['normal'].outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    channels = nodes.new('ShaderNodeSeparateColor')
    channels.mode = 'RGB'
    links.new(maps['arm'].outputs['Color'], channels.inputs['Color'])
    links.new(channels.outputs['Green'], bsdf.inputs['Roughness'])
    return material

low.data.materials.clear()
low.data.materials.append(material_for_preview())

def encoded(values, kind):
    return base64.b64encode(struct.pack('<' + str(len(values)) + kind, *values)).decode('ascii')

mesh = low.data
mesh.calc_loop_triangles()
world = low.matrix_world
normal_transform = world.to_3x3().inverted().transposed()
points = []
for vertex in mesh.vertices:
    p = world @ vertex.co
    points.append((p.x, p.z, -p.y))
lower = [min(p[axis] for p in points) for axis in range(3)]
upper = [max(p[axis] for p in points) for axis in range(3)]
center = ((upper[0] + lower[0]) / 2, lower[1], (upper[2] + lower[2]) / 2)
# The glTF bounds are ~4.04m wide while the official asset metadata lists ~3.04m.
# Explicitly normalize to that documented width instead of silently guessing
# which export scale callers expect. All axes use the same scale factor.
width_meters = 3.0363906621932983
normalization_scale = width_meters / (upper[0] - lower[0])
positions, normals, uvs, indices = [], [], [], []
unique = {}
uv = mesh.uv_layers.active.data
for triangle in mesh.loop_triangles:
    for loop_index in triangle.loops:
        loop = mesh.loops[loop_index]
        p = points[loop.vertex_index]
        n = (normal_transform @ mesh.corner_normals[loop_index].vector).normalized()
        t = uv[loop_index].uv
        values = tuple(round(value, 7) for value in ((p[0] - center[0]) * normalization_scale, (p[1] - center[1]) * normalization_scale, (p[2] - center[2]) * normalization_scale, n.x, n.z, -n.y, t.x, t.y))
        if values not in unique:
            unique[values] = len(positions) // 3
            positions.extend(values[:3]); normals.extend(values[3:6]); uvs.extend(values[6:])
        indices.append(unique[values])
if len(unique) >= 65536:
    raise RuntimeError('Reduced mesh must fit Uint16 indices')
bounds = [[min(positions[i::3]) for i in range(3)], [max(positions[i::3]) for i in range(3)]]
mesh_record = {
    'position': encoded(positions, 'f'), 'normal': encoded(normals, 'f'), 'uv': encoded(uvs, 'f'), 'index': encoded(indices, 'H'),
    'vertices': len(unique), 'triangles': len(indices) // 3, 'bounds': bounds, 'originalTriangles': original_triangles,
}
provenance = {
    'asset': 'Coast Rocks 05', 'author': MANIFEST['author'], 'source': MANIFEST['source'],
    'license': MANIFEST['license'], 'licenseURL': MANIFEST['licenseURL'], 'legalCode': MANIFEST['legalCode'],
    'conversion': 'Coincident glTF seam vertices welded before local Blender collapse reduction to approximately 11K triangles; smooth normals rebuilt, per-loop UV atlas retained; Y-up, X/Z centered, bottom Y=0, uniformly normalized to official 3.03639m width. Diffuse 1K, normal/ARM 512 JPEG; no color/gamma conversion on data maps.',
    'tool': 'Blender ' + bpy.app.version_string, 'originalCreator': False,
}
images = {key: 'data:image/jpeg;base64,' + base64.b64encode((ROOT / info['path']).read_bytes()).decode('ascii') for key, info in TEXTURES.items()}
payload = {'mesh': mesh_record, 'textures': images, 'provenance': provenance}
template = (ROOT / 'coast-runtime.js').read_text(encoding='utf-8')
output = template.replace('/*__COAST_PAYLOAD__*/ null', json.dumps(payload, separators=(',', ':')))
target = ROOT.parent.parent / 'coast-assets.js'
target.write_text(output, encoding='utf-8')
if target.stat().st_size > 4000000:
    raise RuntimeError('Runtime asset exceeds 4MB cap')
summary = {
    'provenance': provenance, 'originalTriangles': original_triangles, 'triangles': mesh_record['triangles'], 'vertices': mesh_record['vertices'],
    'bounds': bounds, 'dimensionsMeters': [bounds[1][i] - bounds[0][i] for i in range(3)],
    'originalBoundsBlender': original_box, 'originalToRuntimeOriginYUp': list(center), 'normalizationScale': normalization_scale, 'weldedCoincidentVertices': welded_vertices,
    'textures': TEXTURES, 'generatedJavaScriptBytes': target.stat().st_size,
    'generatedJavaScriptSHA256': hashlib.sha256(target.read_bytes()).hexdigest(),
}
(ROOT / 'coast-build.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print('COAST_BUILD', json.dumps(summary), flush=True)

# Align the editable Blender file with the runtime coordinate convention while
# retaining Blender Z-up. Apply the same normalization to both comparison meshes.
for obj in (source, low):
    transform = obj.matrix_world.copy()
    for vertex in obj.data.vertices:
        p = transform @ vertex.co
        vertex.co = ((p.x - center[0]) * normalization_scale, (p.y + center[2]) * normalization_scale, (p.z - center[1]) * normalization_scale)
    obj.matrix_world.identity()
    obj.data.update()

if '--preview' in sys.argv:
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    scene.render.resolution_x = 800
    scene.render.resolution_y = 600
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 6
    scene.world = bpy.data.worlds.new('Neutral studio world')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.60, .68, .76, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .45
    scene.view_settings.view_transform = 'AgX'
    target_point = Vector((0, 0, bounds[1][1] * .5))
    camera_data = bpy.data.cameras.new('Reef comparison camera')
    camera = bpy.data.objects.new('Reef comparison camera', camera_data)
    scene.collection.objects.link(camera)
    camera.location = target_point + Vector((3.5, -4.6, 3.0))
    camera.rotation_euler = (target_point - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = 3.50
    scene.camera = camera
    light_data = bpy.data.lights.new('Broad neutral key', 'AREA')
    light = bpy.data.objects.new('Broad neutral key', light_data)
    scene.collection.objects.link(light)
    light.location = target_point + Vector((-3.0, -2.8, 5.5))
    light.rotation_euler = (target_point - light.location).to_track_quat('-Z', 'Y').to_euler()
    light_data.energy = 700
    light_data.shape = 'DISK'
    light_data.size = 4.5
    for label, visible in [('original', source), ('reduced', low)]:
        source.hide_render = visible != source
        low.hide_render = visible != low
        scene.render.filepath = str(ROOT / f'preview-{label}.png')
        bpy.ops.render.render(write_still=True)
    source.hide_render = True
    low.hide_render = False
    print('COAST_PREVIEWS_RENDERED', flush=True)

# The editable reduced source is separate from the unchanged downloaded glTF.
bpy.data.objects.remove(source, do_unlink=True)
for image in bpy.data.images:
    if image.filepath and image.name.startswith(('diffuse-', 'normal-', 'arm-')):
        image.pack()
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'coast-rocks-05-reduced.blend'), compress=True)
