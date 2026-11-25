"""Generate original cloth assets in local Blender, then embed compact meshes.
Run with Blender --background --factory-startup --python this_file.
No downloaded model or hidden external dependency is used.
"""
import bpy, math, json, os, sys, struct, base64
from pathlib import Path
from mathutils import Vector

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parent.parent if SCRIPT.parent.name == 'models' else SCRIPT.parents[1] / 'outputs' / 'coastal-dusk'
OUT = ROOT / 'models'
OUT.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 65
scene.render.fps = 24
bpy.context.preferences.filepaths.save_version=0

def cube(name, dimensions, center, bevel):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod = obj.modifiers.new('Soft contact edges', 'BEVEL')
    mod.width, mod.segments = bevel, 4
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.modifiers.new('Cloth collider', 'COLLISION')
    obj.collision.thickness_outer = 0.012
    obj.collision.cloth_friction = 12
    return obj

mattress = cube('Mattress collision proxy', (2.78,3.64,.40), (0,0,.64), .12)
frame = cube('Timber frame collision proxy', (2.86,3.74,.29), (0,0,.35), .06)
ground = cube('Floor collision proxy', (8,8,.06), (0,0,-.03), .005)

nx, ny = 64, 60
verts, faces, uv_grid = [], [], []
for j in range(ny+1):
    v=j/ny
    # Blender Y is minus Three.js Z; pinned edge is at the bed's head.
    y=.85-v*3.20
    for i in range(nx+1):
        u=i/nx
        x=(u-.5)*3.68
        wrinkle=(.031*math.sin(x*8.2+y*2.1)+.017*math.sin(x*15.7-y*4.6))*(.3+.7*math.sin(v*math.pi)**2)
        rumple=.07*math.exp(-((x+.62)/.55)**2-((y+.35)/.73)**2)
        z=.98+wrinkle+rumple+.018*math.cos(y*6.4+x*2.7)
        verts.append((x,y,z));uv_grid.append((u,v))
        if i<nx and j<ny:
            k=j*(nx+1)+i
            faces.append((k,k+1,k+nx+2,k+nx+1))
data=bpy.data.meshes.new('Quilt simulation grid')
data.from_pydata(verts,[],faces);data.update()
quilt=bpy.data.objects.new('Draped quilt',data);scene.collection.objects.link(quilt)
uv=data.uv_layers.new(name='Fabric UV')
for poly in data.polygons:
    for loop in poly.loop_indices: uv.data[loop].uv=uv_grid[data.loops[loop].vertex_index]
pins=quilt.vertex_groups.new(name='Tucked head edge')
for i in range(nx+1):
    x=verts[i][0]
    if abs(x)<1.2:pins.add([i],1.0,'REPLACE')
cloth=quilt.modifiers.new('Settled cotton duvet', 'CLOTH')
settings=cloth.settings
for key,value in {'quality':8,'mass':.28,'air_damping':3,'tension_stiffness':45,'compression_stiffness':45,'shear_stiffness':20,'bending_stiffness':.65,'tension_damping':8,'compression_damping':8,'shear_damping':8,'bending_damping':2,'vertex_group_mass':pins.name}.items():
    if hasattr(settings,key):setattr(settings,key,value)
cloth.collision_settings.use_collision=True
cloth.collision_settings.distance_min=.018
cloth.collision_settings.collision_quality=4
cloth.collision_settings.use_self_collision=True
cloth.collision_settings.self_distance_min=.012
cloth.point_cache.frame_start=1;cloth.point_cache.frame_end=65
bpy.context.view_layer.objects.active=quilt;quilt.select_set(True)
for obj in [mattress,frame,ground]:obj.select_set(False)
for frame_no in range(1,66):
    scene.frame_set(frame_no)
    deps=bpy.context.evaluated_depsgraph_get()
    quilt.evaluated_get(deps).to_mesh_clear()
    if frame_no%10==0: print('CLOTH_FRAME',frame_no,flush=True)
bpy.ops.object.modifier_apply(modifier=cloth.name)
smooth=quilt.modifiers.new('Duvet surface relaxation','SMOOTH');smooth.factor=.20;smooth.iterations=3
bpy.ops.object.modifier_apply(modifier=smooth.name)
# Controlled slack: finite, differently oriented folds, never a repeating wave.
# Positive displacement only preserves the collision-resolved mattress contact.
def smoothstep(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
ridges=[((-.95,.35),(-.30,-.45),.070,.13),((.75,.15),(.22,-.72),.065,.16),
        ((-.75,-.80),(.25,-1.20),.060,.15),((.80,-.62),(1.10,-1.45),.052,.11),
        ((-.2,.55),(.45,.12),.048,.12),((-1.05,-1.20),(-.55,-1.55),.043,.10)]
for v in quilt.data.vertices:
    x,y,z=v.co
    mask=smoothstep(.74,.87,z)*smoothstep(0,.18,1.36-abs(x))*smoothstep(0,.18,y+1.65)*smoothstep(0,.12,.80-y)
    rise=0
    for (ax,ay),(bx,by),amp,width in ridges:
        dx,dy=bx-ax,by-ay;t=max(0,min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)))
        qx,qy=ax+t*dx,ay+t*dy
        rise+=amp*math.exp(-((x-qx)**2+(y-qy)**2)/(width*width))*math.sin(math.pi*t)**2
    v.co.z+=mask*rise
head=sorted([(v.co.x,v.co.y,v.co.z) for v in quilt.data.vertices[:nx+1]])
def head_height(x):
    for a,b in zip(head,head[1:]):
        if a[0]<=x<=b[0]:
            t=(x-a[0])/(b[0]-a[0]);return a[2]*(1-t)+b[2]*t
    return head[0][2] if x<head[0][0] else head[-1][2]
sub=quilt.modifiers.new('Fine fabric surface','SUBSURF');sub.levels=1
bpy.ops.object.modifier_apply(modifier=sub.name)
thickness=quilt.modifiers.new('Cotton fill thickness','SOLIDIFY');thickness.thickness=.025;thickness.offset=0
bpy.ops.object.modifier_apply(modifier=thickness.name)
for p in quilt.data.polygons:p.use_smooth=True

# A genuine folded header, connected visually to the simulation's head edge.
rv,rf,ruv=[],[],[]
for j in range(25):
    t=j/24
    for i in range(65):
        x=(i/64-.5)*2.82;z0=head_height(x)
        if t<=.28:
            a=t/.28*math.pi;y=.85+.045*math.sin(a);z=z0+.045*(1-math.cos(a))
        else:
            s=(t-.28)/.72;y=.85-.48*s;z=z0+.09-.025*s+.012*math.sin(s*math.pi)
        y+=.018*math.sin(x*3.2+.7)*math.sin(t*math.pi)
        z+=.008*math.sin(x*5.7+t*2)*math.sin(t*math.pi)
        rv.append((x,y,z));ruv.append((i/64,t))
        if i<64 and j<24:
            k=j*65+i;rf.append((k,k+1,k+66,k+65))
rm=bpy.data.meshes.new('Folded duvet header');rm.from_pydata(rv,[],rf);rm.update()
turnback=bpy.data.objects.new('Turned-back linen edge',rm);scene.collection.objects.link(turnback)
rt=rm.uv_layers.new(name='Fabric UV')
for poly in rm.polygons:
    poly.use_smooth=True
    for loop in poly.loop_indices:rt.data[loop].uv=ruv[rm.loops[loop].vertex_index]
bpy.context.view_layer.objects.active=turnback
solid=turnback.modifiers.new('Folded fabric thickness','SOLIDIFY');solid.thickness=.018;solid.offset=0
bpy.ops.object.modifier_apply(modifier=solid.name)

# Pinched, filled pillow with irregular seam gathers. Shared normalized shape.
px,py=40,28
pverts,pfaces,puvs=[],[],[]
for side in [1,-1]:
    for j in range(py+1):
        v=j/py*2-1
        for i in range(px+1):
            u=i/px*2-1
            edge=min(1-abs(u),1-abs(v))
            dome=max(0,(1-u*u)*(1-v*v))**.58
            crease=(math.sin(v*33+u*4)*math.exp(-(1-abs(u))*17)+math.sin(u*28-v*3)*math.exp(-(1-abs(v))*17))*.018*math.sin(max(edge,0)*math.pi*4)
            x=u*.5*(1-.07*abs(v)**8)
            y=v*.5*(1-.06*abs(u)**8)
            z=side*(.018+.48*dome+crease)
            # Subtle central settling is not mirrored on the underside.
            if side>0:z-=.045*math.exp(-((u-.18)/.44)**2-((v+.1)/.55)**2)
            pverts.append((x,y,z));puvs.append(((u+1)/2,(v+1)/2))
            if i<px and j<py:
                k=(0 if side==1 else (px+1)*(py+1))+j*(px+1)+i
                f=(k,k+1,k+px+2,k+px+1)
                pfaces.append(f if side>0 else tuple(reversed(f)))
layer=(px+1)*(py+1)
ring=list(range(px+1))+[j*(px+1)+px for j in range(1,py+1)]+[py*(px+1)+i for i in range(px-1,-1,-1)]+[j*(px+1) for j in range(py-1,0,-1)]
for n,k in enumerate(ring):
    q=ring[(n+1)%len(ring)];pfaces.append((k,k+layer,q+layer,q))
pm=bpy.data.meshes.new('Pinched pillow');pm.from_pydata(pverts,[],pfaces);pm.update()
pillow=bpy.data.objects.new('Soft filled pillow',pm);scene.collection.objects.link(pillow)
puv=pm.uv_layers.new(name='Fabric UV')
for poly in pm.polygons:
    poly.use_smooth=True
    for loop in poly.loop_indices:puv.data[loop].uv=puvs[pm.loops[loop].vertex_index]

def encode_array(values,fmt):
    return base64.b64encode(struct.pack('<'+str(len(values))+fmt,*values)).decode('ascii')

def export_mesh(obj):
    me=obj.data;me.calc_loop_triangles()
    pos=[];norm=[];tex=[]
    # Emit seam-aware vertices per loop; then index identical tuples.
    unique={};indices=[]
    uv=me.uv_layers.active.data
    for tri in me.loop_triangles:
        for li in tri.loops:
            loop=me.loops[li];v=me.vertices[loop.vertex_index]
            p=v.co;n=v.normal;t=uv[li].uv
            values=tuple(round(v,6) for v in (p.x,p.z,-p.y,n.x,n.z,-n.y,t.x,t.y))
            if values not in unique:
                unique[values]=len(pos)//3;pos.extend(values[:3]);norm.extend(values[3:6]);tex.extend(values[6:])
            indices.append(unique[values])
    bbox=[[min(pos[i::3]) for i in range(3)],[max(pos[i::3]) for i in range(3)]]
    return {'position':encode_array(pos,'f'),'normal':encode_array(norm,'f'),'uv':encode_array(tex,'f'),'index':encode_array(indices,'I'),'vertices':len(pos)//3,'triangles':len(indices)//3,'bounds':bbox}

assets={'quilt':export_mesh(quilt),'pillow':export_mesh(pillow),'turnback':export_mesh(turnback)}
assets['provenance']={'tool':bpy.app.version_string,'clothFrames':65,'artDirectedFolds':6,'source':'Original local Blender cloth simulation, six art-directed slack folds, modeled pillow and folded header; no external models','coordinates':'Three.js Y up, bed-local'}
(ROOT/'softgoods.js').write_text('/* Generated by work/build-softgoods.py with local Blender. */\nwindow.CoastalSoftgoods='+json.dumps(assets,separators=(',',':'))+';\n',encoding='utf-8')
summary={name:{k:v for k,v in value.items() if k in ['vertices','triangles','bounds']} for name,value in assets.items() if name!='provenance'}
(OUT/'softgoods-build.json').write_text(json.dumps({'provenance':assets['provenance'],'meshes':summary},indent=2),encoding='utf-8')
# Editable original source, without simulation dependency on external caches.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'coastal-softgoods.blend'))
print('SOFTGOODS_EXPORT',json.dumps(summary),flush=True)
