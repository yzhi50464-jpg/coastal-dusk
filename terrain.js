/* Procedural coastal geology with a local generated stone surface texture. */
(() => {
  'use strict';
  window.CoastalTerrain = {
    create({ THREE, scene, rand, rr, noise2, materials,reef }) {
      const clamp = THREE.MathUtils.clamp;
      const stonePositions = Array.from({ length: 16 }, () => []);
      const leafItems = [], grassPositions = [], grassColors = [], stemPositions = [];
      const shoreEdge = z => -4.6 - Math.max(0, -z) * .29 + Math.sin(z * .18) * .85 + Math.sin(z * .49) * .36;
      const isBuilding = (x,z,m=0) =>
        (x>-11.8-m&&x<-4.7+m&&z>-2-m&&z<11.5+m)||
        (x>-19.4-m&&x<-10.6+m&&z>-.6-m&&z<9+m);
      const isApproach=(x,z,m=0)=>x>-11.7-m&&x<-8.2+m&&z>10.9-m&&z<18+m;
      const landHeight = (x, z) => {
        const inland = Math.max(0, shoreEdge(z) - x);
        let y = -.04 + inland * .185 + noise2(x * .27, z * .27) * Math.min(1.15, inland * .13);
        y += Math.sin(z * .20 + x * .17) * Math.min(.35, inland * .05);
        // A recessed bank supports the foundation rather than protruding through timber.
        if (isBuilding(x, z, .25)) y = Math.min(y, 1.62);
        if(isApproach(x,z))y=Math.min(y,1.55-clamp((z-11)/5,0,1)*.30);
        return y;
      };
      const hash3 = (x, y, z) => { const q = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return q - Math.floor(q); };
      const stoneNoise = `
        varying vec3 coastWorld;
        uniform sampler2D uRockSurface;
        float coastHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
        float coastNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(mix(coastHash(i),coastHash(i+vec3(1,0,0)),f.x),mix(coastHash(i+vec3(0,1,0)),coastHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(coastHash(i+vec3(0,0,1)),coastHash(i+vec3(1,0,1)),f.x),mix(coastHash(i+vec3(0,1,1)),coastHash(i+vec3(1,1,1)),f.x),f.y),f.z);
        }
        float coastFbm(vec3 p){return coastNoise(p)*.57+coastNoise(p*2.07+3.4)*.27+coastNoise(p*4.13+7.1)*.11+coastNoise(p*9.73)*.05;}
        float coastRelief(vec3 p){return coastNoise(p*3.7)*.055+coastNoise(p*20.)*.012+coastNoise(p*65.)*.003;}
      `;
      const stoneMat = new THREE.MeshStandardMaterial({ color: '#c6bdb1', roughness: .89, metalness: .015 });
      stoneMat.extensions={derivatives:true};
      stoneMat.onBeforeCompile = shader => {
        shader.uniforms.uRockSurface={value:materials.rockAsset};
        shader.vertexShader = 'varying vec3 coastWorld;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 coastP=vec4(transformed,1.);
          #ifdef USE_INSTANCING
            coastP=instanceMatrix*coastP;
          #endif
          coastWorld=(modelMatrix*coastP).xyz;`);
        shader.fragmentShader = stoneNoise + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          vec3 cp=coastWorld;
          float broad=coastFbm(cp*.95),mineral=coastNoise(cp*19.);
          float strata=cp.y*1.2+cp.x*.43+cp.z*.25+coastNoise(cp*1.2)*1.3;
          float fractureSignal=abs(sin(strata*9.+coastNoise(cp*4.)*1.2));
          float fractureAA=max(.015,fwidth(fractureSignal)*.65);
          float cracks=1.-smoothstep(.045-fractureAA,.045+fractureAA,fractureSignal);
          float quartz=pow(smoothstep(.60,.82,coastNoise(cp*4.6+16.)),3.)*.10;
          float wet=1.-smoothstep(.15,.95,cp.y+coastNoise(cp*5.)*.14);
          vec3 weights=pow(abs(normalize(cross(dFdx(cp),dFdy(cp)))),vec3(4.));
          weights/=max(dot(weights,vec3(1.)),.0001);
          vec3 stoneTex=texture2D(uRockSurface,cp.yz*.42).rgb*weights.x+
            texture2D(uRockSurface,cp.xz*.42+vec2(.27,.51)).rgb*weights.y+
            texture2D(uRockSurface,cp.xy*.42+vec2(.63,.13)).rgb*weights.z;
          float stoneHeight=dot(stoneTex,vec3(.2126,.7152,.0722));
          vec3 dry=stoneTex*1.6*(.84+broad*.32);
          dry*=1.-cracks*.04;dry+=quartz*.12;
          float lichen=smoothstep(.57,.73,coastNoise(cp*3.8+9.))*smoothstep(.7,2.1,cp.y);
          dry=mix(dry,vec3(.32,.35,.23),lichen*.27);
          diffuseColor.rgb*=mix(dry,vec3(.145,.151,.154)*(broad+.56),wet*.75);`);
        shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor=mix(.91,.36,1.-smoothstep(.08,.72,coastWorld.y));`);
        shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          float e=.012;
          vec3 cg=vec3(coastRelief(coastWorld+vec3(e,0,0))-coastRelief(coastWorld-vec3(e,0,0)),coastRelief(coastWorld+vec3(0,e,0))-coastRelief(coastWorld-vec3(0,e,0)),coastRelief(coastWorld+vec3(0,0,e))-coastRelief(coastWorld-vec3(0,0,e)))/(e*2.);
          vec3 vg=mat3(viewMatrix)*cg;normal=normalize(normal-(vg-normal*dot(normal,vg))*.32);`);
        shader.fragmentShader=shader.fragmentShader.replace('normal-(vg-normal*dot(normal,vg))*.32);',`normal-(vg-normal*dot(normal,vg))*.32);
          // Fine relief inferred from local stone luminance, not a scanned normal map.
          vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);
          vec3 r1=cross(sy,normal),r2=cross(normal,sx);float det=dot(sx,r1);
          vec3 grad=sign(det)*(dFdx(stoneHeight)*r1+dFdy(stoneHeight)*r2);
          normal=normalize(abs(det)*normal-grad*.038);`);
      };
      stoneMat.customProgramCacheKey = () => 'coast-weathered-stone-5';

      // Radial sampling of a softly intersected cleavage hull gives weathered
      // edges and irregular relief, while retaining a geological slab structure.
      function clippedRockGeometry(variant) {
        const planes=[];
        for(const d of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]])
          planes.push({n:new THREE.Vector3(...d),c:rr(.70,1.04)});
        for(let i=0;i<12;i++){
          const a=i*2.399963+variant*.37,h=rr(-.82,.87),r=Math.sqrt(1-h*h);
          planes.push({n:new THREE.Vector3(Math.cos(a)*r,h,Math.sin(a)*r),c:rr(.86,1.10)});
        }
        const slab=variant%3!==0;
        if(slab){
          // Oblique bedding planes form broken wedges, not rounded cobbles.
          // Hashes keep the placement/vegetation random stream unchanged.
          planes.push({n:new THREE.Vector3(.18+hash3(variant,2,1)*.30,1,.24).normalize(),c:.64+hash3(variant,3,5)*.18});
          planes.push({n:new THREE.Vector3(-.42,.26,1).normalize(),c:.66+hash3(variant,7,2)*.18});
        }
        const geometry=new THREE.IcosahedronGeometry(1,9),position=geometry.attributes.position;
        const direction=new THREE.Vector3(),distances=[];
        for(let i=0;i<position.count;i++){
          direction.fromBufferAttribute(position,i).normalize();distances.length=0;
          let nearest=10;
          for(const plane of planes){const dot=plane.n.dot(direction);if(dot>.001){const d=plane.c/dot;distances.push(d);nearest=Math.min(nearest,d);}}
          const cleavage=slab?42+(variant%4)*9:22;
          let blend=0;for(const d of distances)blend+=Math.exp(-(d-nearest)*cleavage);
          const hull=nearest-Math.log(blend)/cleavage;
          const x=direction.x,y=direction.y,z=direction.z;
          const relief=(noise2(x*3.4+y*.8+variant*9,z*3.4+y*1.7)-.5)*(slab?.11:.18)+
            (noise2(x*10.2+y*3.1+variant*13,z*10.2-y*2.2)-.5)*.038;
          direction.multiplyScalar(hull+relief);
          position.setXYZ(i,direction.x,direction.y,direction.z);
        }
        // Weld normals across the triangular sampling lattice. This smooths
        // weathering without replacing the underlying cleavage geometry.
        geometry.computeVertexNormals();const normal=geometry.attributes.normal,sums=new Map(),keys=[];
        for(let i=0;i<position.count;i++){
          const key=[position.getX(i),position.getY(i),position.getZ(i)].map(v=>v.toFixed(5)).join('/');keys.push(key);
          const n=sums.get(key)||new THREE.Vector3();n.x+=normal.getX(i);n.y+=normal.getY(i);n.z+=normal.getZ(i);sums.set(key,n);
        }
        for(const n of sums.values())n.normalize();
        for(let i=0;i<normal.count;i++){const n=sums.get(keys[i]);normal.setXYZ(i,n.x,n.y,n.z);}
        geometry.computeBoundingSphere();return geometry;
      }
      const rockGeos = stonePositions.map((_,i) => clippedRockGeometry(i));
      const foamCandidates = [];
      const rockRotation = new THREE.Matrix4(),rockEuler = new THREE.Euler();
      function rock(x, y, z, sx, sy, sz, sea = false, rotation = rr(0,6.283),foundation=false) {
        const rx=rr(-.20,.20),rz=rr(-.23,.23);
        if(isApproach(x,z,Math.max(sx,sz)))y=Math.min(y,landHeight(x,z)-Math.max(sx,sy,sz)*1.3);
        // A hard geometric envelope protects the entire deck, including outer posts.
        // The tilted width/depth contribute to vertical height as well as sy.
        if (!foundation&&isBuilding(x,z,Math.max(sx,sz)*1.2)) {
          rockRotation.makeRotationFromEuler(rockEuler.set(rx,rotation,rz));const e=rockRotation.elements;
          y=Math.min(y,2.06-1.25*(Math.abs(e[1]*sx)+Math.abs(e[5]*sy)+Math.abs(e[9]*sz)));
        }
        const index = Math.floor(rand() * rockGeos.length);
        stonePositions[index].push({ x,y,z,sx,sy,sz,ry:rotation,rx,rz,foundation });
        if (sea && y + sy > .18) foamCandidates.push({ x,z,r:Math.max(sx,sz)*.80,exposure:clamp((y+sy)*.8,.3,1) });
      }

      // Contiguous uneven ground reaches all the way down to the intertidal band.
      const groundGeo = new THREE.PlaneGeometry(1, 1, 110, 200);groundGeo.rotateX(-Math.PI/2);
      const gp = groundGeo.attributes.position;
      for (let i = 0; i < gp.count; i++) {
        const z = gp.getZ(i) * 190 - 44, t = gp.getX(i) + .5, x = THREE.MathUtils.lerp(-74, shoreEdge(z) + .15, t);
        gp.setXYZ(i,x,landHeight(x,z)-.16,z);
      }
      groundGeo.computeVertexNormals();const ground = new THREE.Mesh(groundGeo, stoneMat);ground.receiveShadow = true;scene.add(ground);

      // Layered outcrops, broken ledges and smaller rubble share one bedrock trend.
      for (let i = 0; i < 280; i++) {
        const z=rr(-125,40),inland=rr(-.2,13.5),x=shoreEdge(z)-inland,s=rr(.50,1.45),y=landHeight(x,z);
        rock(x,y-.17,z,s*rr(.8,1.35),s*rr(.80,1.30),s*rr(.7,1.25),inland<.5,-.35+rr(-.7,.7));
      }
      // Denser foreground with geological seams between split, oblique slabs.
      for (let i = 0; i < 120; i++) {
        const z=rr(-9,27),x=shoreEdge(z)-rr(-2.6,10.5),s=rr(.32,1.05),y=landHeight(x,z);
        rock(x,y-.15,z,s*rr(1.0,1.55),s*rr(.85,1.5),s*rr(.75,1.4),x>shoreEdge(z)-.3,-.55+rr(-.5,.5));
      }
      // Small intertidal skerries remain low and partly submerged; no giant balls.
      for (let i = 0; i < 65; i++) {
        const z=rr(-62,29),x=shoreEdge(z)+rr(1.2,9),s=rr(.45,1.35);
        rock(x,rr(-.48,-.20),z,s*rr(1,1.45),s*rr(.60,1.0),s*rr(.75,1.4),true,-.4+rr(-.3,.4));
      }
      for(let i=0;i<250;i++){
        const z=rr(-36,35),x=shoreEdge(z)-rr(-.2,16),s=rr(.08,.30);
        rock(x,landHeight(x,z)+s*.05,z,s*rr(1,1.7),s*.55,s*rr(.7,1.3));
      }
      // Stone foundation and low retaining wall, fitted below the house sill.
      for(let row=0;row<3;row++)for(let i=0;i<16;i++){
        const y=1.16+row*.43,z=.03+i*.53,x=-18.72+i*.50;
        for(const wallX of[-18.83,-11.35])rock(wallX,y,z,.32,.25,.32,false,rr(-.15,.15),true);
        for(const wallZ of[-.20,8.24])rock(x,y,wallZ,.32,.25,.32,false,rr(-.15,.15),true);
      }
      // Group exposed bedrock into connected, oblique ledges. Foundation stones
      // and approach geometry remain untouched. No calls to rand() in this pass.
      let ledgeCount=0,fractureCount=0;
      stonePositions.forEach((items,variant)=>{
        const fragments=[];
        for(const p of items){
          if(p.foundation||p.z< -65||p.z>35||Math.max(p.sx,p.sz)<.48)continue;
          if(isBuilding(p.x,p.z,1)||isApproach(p.x,p.z,2))continue;
          const offshore=p.x-shoreEdge(p.z),h=hash3(p.x,p.y,p.z);
          if(offshore>.65){
            const ridge=Math.round((p.z+62)/8.1),center=-62+ridge*8.1+(hash3(ridge,3,8)-.5)*4.6;
            const bend=.11+hash3(ridge,4,6)*.30;
            p.z=center+offshore*bend+(h-.5)*2.25;p.x=shoreEdge(p.z)+offshore;
            p.sx*=1.04+h*.32;p.sy*=.62+h*.20;p.sz*=.58+h*.24;
            p.ry=-.38+(hash3(ridge,7,9)-.5)*.28;p.rx=.10+(h-.5)*.16;p.rz=-.16;
            p.y=-.23-p.sy*(.08+hash3(ridge,4,2)*.18);ledgeCount++;
          }else if(offshore>-14&&h>.24){
            p.sx*=1.24;p.sy*=.74;p.sz*=.82;p.ry=-.40+(h-.5)*.48;
            p.rx=.13+(hash3(p.z,7,1)-.5)*.18;p.rz=-.19;
            p.y=landHeight(p.x,p.z)-.17;ledgeCount++;
          }
          if(offshore>-.8&&offshore<8&&h>.57&&variant%3!==0){
            // A displaced sister block exposes a joint and a stepped waterline.
            const q={...p,sx:p.sx*.58,sy:p.sy*.71,sz:p.sz*.48};
            const shift=p.sz*.92;
            q.x+=Math.sin(p.ry)*shift;q.z+=Math.cos(p.ry)*shift;
            q.y-=.12;q.ry+=.08;q.rx-=.10;fragments.push(q);fractureCount++;
          }
        }
        items.push(...fragments);
        for(const p of items){
          if(p.foundation)continue;
          if(isApproach(p.x,p.z,Math.max(p.sx,p.sz)))p.y=Math.min(p.y,landHeight(p.x,p.z)-Math.max(p.sx,p.sy,p.sz)*1.3);
          if(isBuilding(p.x,p.z,Math.max(p.sx,p.sz)*1.2)){
            rockRotation.makeRotationFromEuler(rockEuler.set(p.rx,p.ry,p.rz));const e=rockRotation.elements;
            p.y=Math.min(p.y,2.06-1.25*(Math.abs(e[1]*p.sx)+Math.abs(e[5]*p.sy)+Math.abs(e[9]*p.sz)));
          }
        }
      });
      // Refit a few existing nearshore blocks into two short, broken rock tongues.
      // Hash-only variation preserves the vegetation stream and the total rock count.
      {
        const rocksBefore=stonePositions.reduce((sum,items)=>sum+items.length,0),spines=[];
        const candidates=[];
        stonePositions.forEach((items,variant)=>items.forEach((p,index)=>{
          const offshore=p.x-shoreEdge(p.z),padding=Math.max(p.sx,p.sz)+.3;
          if(!p.foundation&&p.z>=17&&p.z<=24&&offshore>=-.08&&offshore<=3.05&&
            !isBuilding(p.x,p.z,padding)&&!isApproach(p.x,p.z,padding))candidates.push({p,variant,index});
        }));
        const transform=new THREE.Object3D(),point=new THREE.Vector3(),placements=[];
        let movedRocks=0,exclusionIntrusions=0;
        for(const [spine,rootZ,length,bend]of[[0,17.75,2.72,.40],[1,20.85,2.58,.61]]){
          const members=candidates.filter(({p})=>(p.z<20?0:1)===spine);
          const main=members.filter(({p})=>p.sy>=.45).sort((a,b)=>b.p.sx*b.p.sy*b.p.sz-a.p.sx*a.p.sy*a.p.sz);
          const chips=members.filter(({p})=>p.sy<.45),bounds=new THREE.Box3();let rockCount=0;
          for(const [list,fragment]of[[main,false],[chips,true]])for(let i=0;i<list.length;i++){
            const {p,variant,index}=list[i],h=hash3(variant,index,36+spine),q={...p};
            const t=fragment?(i+.45)/(list.length+.35):(list.length===1?.35:i/(list.length-1));
            const offshore=.10+length*t+(h-.5)*.12;
            q.z=rootZ+bend*offshore+(h-.5)*.15+(fragment?(i%2?.32:-.29):0);
            q.x=shoreEdge(q.z)+offshore;
            q.sx*=.91+h*.06;q.sy*=.93-t*.13;q.sz*=.75+h*.10;
            q.ry=-Math.atan(bend)+(h-.5)*.15;q.rx=.07+h*.08;q.rz=-.10-t*.09;
            transform.position.set(q.x,0,q.z);transform.rotation.set(q.rx,q.ry,q.rz);transform.scale.set(q.sx,q.sy,q.sz);transform.updateMatrix();
            const vertices=rockGeos[variant].attributes.position,footprint=new THREE.Box3();let highest=-Infinity,safe=true;
            for(let v=0;v<vertices.count;v++){
              point.fromBufferAttribute(vertices,v).applyMatrix4(transform.matrix);highest=Math.max(highest,point.y);
              if(isBuilding(point.x,point.z,.3)||isApproach(point.x,point.z,.3))safe=false;
              footprint.expandByPoint(point);
            }
            if(!safe){exclusionIntrusions++;continue;}
            const crest=(fragment?.35:.77)-t*(fragment?.22:.53)+(h-.5)*.07;
            q.y=crest-highest;footprint.min.y+=q.y;footprint.max.y+=q.y;
            placements.push({variant,sourceIndex:index,spine,fragment,from:[p.x,p.y,p.z],to:[q.x,q.y,q.z],crest});
            Object.assign(p,q);bounds.union(footprint);movedRocks++;rockCount++;
          }
          if(rockCount)spines.push({id:spine,rootZ,length,bend,rockCount,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}});
        }
        scene.userData.coastalShoreSpines={stage:'before-scanned-placement-filter',movedRocks,spines,placements,rocksBefore,
          rocksAfter:stonePositions.reduce((sum,items)=>sum+items.length,0),triangleDelta:0,exclusionPadding:.3,exclusionIntrusions};
      }
      // The reference has a close, fractured reef mass in the lower-right
      // foreground, not an empty strip of water between isolated small stones.
      const foregroundReefs=[[-.8,21.3,1.5],[2.7,22.3,1.8],[3.3,17.8,1.2]];
      const scannedPlacements=reef?[[2.7,-.42,22.3,1.55,.62],[3.3,-.42,17.8,1.38,-.55]]:[];
      if(reef)for(const items of stonePositions)for(let i=items.length-1;i>=0;i--){const p=items[i];if(!p.foundation&&scannedPlacements.some(([x,y,z,s])=>Math.hypot((p.x-x)/(s*1.85),(p.z-z)/(s*1.65))<1))items.splice(i,1);}
      foregroundReefs.forEach(([cx,cz,size],group)=>{
        if(reef&&group>0)return;
        for(let i=0;i<5;i++){
          const angle=i*2.39996+group*.7,r=i===0?0:size*(.52+hash3(i,group,5)*.25);
          const s=size*(i===0?.86:.45+hash3(i,group,8)*.28),variant=(group*5+i*3)%16;
          stonePositions[variant].push({x:cx+Math.cos(angle)*r,y:-.12+hash3(i,group,11)*.15,z:cz+Math.sin(angle)*r,
            sx:s*(.88+hash3(i,3,group)*.35),sy:s*(.54+hash3(i,4,group)*.24),sz:s*(.64+hash3(i,6,group)*.28),
            rx:.11+hash3(i,5,group)*.24,ry:-.46+(hash3(i,8,group)-.5)*.7,rz:-.24+hash3(i,9,group)*.30,foundation:false});
        }
      });
      scene.userData.coastalGeology={ledges:ledgeCount,splitFragments:fractureCount,foregroundReefs:foregroundReefs.length,scannedGroups:scannedPlacements.length};
      // All fracture blocks are instanced; their world-space surface shader remains
      // coherent across both large geology and the tightly fitted foundation.
      const dummy = new THREE.Object3D(),rockMeshes=[];
      stonePositions.forEach((items,j)=>{
        if(!items.length)return;const rocks=new THREE.InstancedMesh(rockGeos[j],stoneMat,items.length);
        items.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(p.rx,p.ry,p.rz);dummy.scale.set(p.sx,p.sy,p.sz);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);});
        rocks.castShadow=true;rocks.receiveShadow=true;rocks.computeBoundingSphere();scene.add(rocks);rockMeshes.push(rocks);
      });
      const scannedBounds=[];
      for(const [x,y,z,scale,angle] of scannedPlacements){
        const rock=reef.createRock(scene,x,y,z,scale,angle);
        // Keep these two material instances separate so static batching retains
        // the scan's extra AO UV channel and inspectable placement geometry.
        rock.material=reef.material.clone();
        rock.material.aoMapIntensity=.45;
        rock.material.envMapIntensity=.70;
        rock.material.onBeforeCompile=shader=>{
          shader.vertexShader='varying vec3 reefWorld;\n'+shader.vertexShader;
          shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nreefWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
          shader.fragmentShader='varying vec3 reefWorld;\n'+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
            float reefDry=smoothstep(-.10,.70,reefWorld.y);
            float reefLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
            diffuseColor.rgb=mix(diffuseColor.rgb,vec3(reefLuma),.32)*mix(vec3(.68,.74,.79),vec3(1.03,1.05,1.08),reefDry);`);
          shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
            roughnessFactor=mix(.48,max(.76,roughnessFactor),smoothstep(-.10,.70,reefWorld.y));`);
        };
        rock.material.customProgramCacheKey=()=> 'coast-scan-wet-v2';
        rock.updateWorldMatrix(true,false);rockMeshes.push(reef.createProxy(rock));
        const b=rock.geometry.boundingBox.clone().applyMatrix4(rock.matrixWorld);scannedBounds.push({min:b.min.toArray(),max:b.max.toArray(),center:[x,y,z]});
      }
      scene.userData.scannedReefs={count:scannedPlacements.length,triangles:reef?reef.stats.instanceTriangles:0,bounds:scannedBounds,source:reef?reef.stats.source:null};
      foamCandidates.sort((a,b)=>b.r-a.r);const foamRocks=[];
      for(const p of foamCandidates){if(foamRocks.some(q=>Math.hypot(q.x-p.x,q.y-p.z)<p.r+q.z+.8))continue;foamRocks.push(new THREE.Vector4(p.x,p.z,p.r,p.exposure));if(foamRocks.length===24)break;}

      // Distance to the actual irregular rock/ground footprint at the waterline.
      // Baking this once avoids one synthetic circular foam ring per boulder.
      function bakeShoreField(){
        const width=512,height=1024,minX=-44,minZ=-85,spanX=70,spanZ=130;
        const sx=spanX/width,sz=spanZ/height,diagonal=Math.hypot(sx,sz);
        const occupied=new Uint8Array(width*height),distance=new Float32Array(width*height);
        for(let iz=0;iz<height;iz++)for(let ix=0;ix<width;ix++){
          const x=minX+(ix+.5)*sx,z=minZ+(iz+.5)*sz;
          occupied[iz*width+ix]=landHeight(x,z)-.16>-.14?1:0;
        }
        const matrix=new THREE.Matrix4(),point=new THREE.Vector3(),bounds=new THREE.Box3();
        for(const rocks of rockMeshes){
          rocks.geometry.computeBoundingBox();const p=rocks.geometry.attributes.position;
          for(let instance=0;instance<rocks.count;instance++){
            rocks.getMatrixAt(instance,matrix);matrix.premultiply(rocks.matrixWorld);
            bounds.copy(rocks.geometry.boundingBox).applyMatrix4(matrix);
            const cx=matrix.elements[12],cz=matrix.elements[14];
            if(bounds.max.y<-.14||bounds.max.x<shoreEdge(cz)-1.2||bounds.max.x<minX||bounds.min.x>minX+spanX||bounds.max.z<minZ||bounds.min.z>minZ+spanZ)continue;
            const bins=Array.from({length:24},()=>null);
            for(let i=0;i<p.count;i++){
              point.fromBufferAttribute(p,i).applyMatrix4(matrix);if(point.y<-.14)continue;
              const dx=point.x-cx,dz=point.z-cz,r=dx*dx+dz*dz;
              const bin=Math.min(23,Math.floor((Math.atan2(dz,dx)+Math.PI)/(Math.PI*2)*24));
              if(!bins[bin]||r>bins[bin].r)bins[bin]={x:point.x,z:point.z,r};
            }
            const polygon=bins.filter(Boolean);if(polygon.length<3)continue;
            const loX=Math.max(0,Math.floor((bounds.min.x-minX)/sx)),hiX=Math.min(width-1,Math.ceil((bounds.max.x-minX)/sx));
            const loZ=Math.max(0,Math.floor((bounds.min.z-minZ)/sz)),hiZ=Math.min(height-1,Math.ceil((bounds.max.z-minZ)/sz));
            for(let iz=loZ;iz<=hiZ;iz++)for(let ix=loX;ix<=hiX;ix++){
              if(occupied[iz*width+ix])continue;
              const x=minX+(ix+.5)*sx,z=minZ+(iz+.5)*sz;let inside=false;
              for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
                const a=polygon[i],b=polygon[j];
                if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
              }
              if(inside)occupied[iz*width+ix]=1;
            }
          }
        }
        for(let i=0;i<distance.length;i++)distance[i]=occupied[i]?0:8;
        for(let z=0;z<height;z++)for(let x=0;x<width;x++){
          const i=z*width+x;let d=distance[i];
          if(x)d=Math.min(d,distance[i-1]+sx);
          if(z){d=Math.min(d,distance[i-width]+sz);if(x)d=Math.min(d,distance[i-width-1]+diagonal);if(x<width-1)d=Math.min(d,distance[i-width+1]+diagonal);}
          distance[i]=d;
        }
        for(let z=height-1;z>=0;z--)for(let x=width-1;x>=0;x--){
          const i=z*width+x;let d=distance[i];
          if(x<width-1)d=Math.min(d,distance[i+1]+sx);
          if(z<height-1){d=Math.min(d,distance[i+width]+sz);if(x)d=Math.min(d,distance[i+width-1]+diagonal);if(x<width-1)d=Math.min(d,distance[i+width+1]+diagonal);}
          distance[i]=d;
        }
        const pixels=new Uint8Array(width*height*4);
        for(let i=0;i<distance.length;i++){pixels[i*4]=Math.min(255,Math.round(distance[i]/8*255));pixels[i*4+1]=occupied[i]*255;pixels[i*4+3]=255;}
        const texture=new THREE.DataTexture(pixels,width,height,THREE.RGBAFormat);
        texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
        return {texture,bounds:new THREE.Vector4(minX,minZ,1/spanX,1/spanZ)};
      }
      const shoreField=bakeShoreField();

      // Coastal evergreen leaves: a folded pointed surface, not sphere clusters.
      const leafGeo = new THREE.BufferGeometry();
      leafGeo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,-.23,.30,0,-.18,.73,.01,0,1,.018,.18,.73,.01,.23,.30,0,0,.50,.055],3));
      leafGeo.setIndex([6,0,1,6,1,2,6,2,3,6,3,4,6,4,5,6,5,0]);leafGeo.computeVertexNormals();
      const leafMat = new THREE.MeshStandardMaterial({color:'#e0dec6',roughness:.82,metalness:0,side:THREE.DoubleSide});
      // Subtle world-position tint removes the uniform repeated-clone appearance.
      leafMat.onBeforeCompile=shader=>{
        shader.vertexShader='varying vec3 coastLeafWorld;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
          vec4 leafP=vec4(transformed,1.);
          #ifdef USE_INSTANCING
            leafP=instanceMatrix*leafP;
          #endif
          coastLeafWorld=(modelMatrix*leafP).xyz;`);
        shader.fragmentShader='varying vec3 coastLeafWorld;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          float mottling=sin(coastLeafWorld.x*17.+sin(coastLeafWorld.z*22.))*sin(coastLeafWorld.y*33.);
          diffuseColor.rgb*=.91+mottling*.09;`);
      };
      leafMat.customProgramCacheKey=()=> 'coast-small-leaf-3';
      function stem(a,b,r) {
        // Four-sided tapered twigs merged into one geometry, hidden beneath foliage.
        const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),dir=B.clone().sub(A).normalize();
        const t=new THREE.Vector3().crossVectors(dir,Math.abs(dir.y)>.9?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0)).normalize(),v=new THREE.Vector3().crossVectors(dir,t);
        for(let i=0;i<4;i++){
          const an=i*Math.PI/2,bn=(i+1)*Math.PI/2;
          const p=A.clone().addScaledVector(t,Math.cos(an)*r).addScaledVector(v,Math.sin(an)*r),q=A.clone().addScaledVector(t,Math.cos(bn)*r).addScaledVector(v,Math.sin(bn)*r);
          const u=B.clone().addScaledVector(t,Math.cos(an)*r*.4).addScaledVector(v,Math.sin(an)*r*.4),w=B.clone().addScaledVector(t,Math.cos(bn)*r*.4).addScaledVector(v,Math.sin(bn)*r*.4);
          for(const pt of [p,q,u,q,w,u])stemPositions.push(pt.x,pt.y,pt.z);
        }
      }
      function sprig(x,y,z,dx,dy,dz,length,scale=1,tint=0,leafWidth=1){
        const dir=new THREE.Vector3(dx,dy,dz).normalize(),base=new THREE.Vector3(x,y,z),end=base.clone().addScaledVector(dir,length);
        stem(base.toArray(),end.toArray(),.0045*scale);
        const pairs=8+Math.floor(rand()*7),phase=rr(0,6.28);
        for(let i=0;i<pairs;i++){
          const t=.16+i/(pairs+1)*.82,mid=base.clone().lerp(end,t),a=phase+t*2.7;
          for(const side of [-1,1]){
            const leafDir=new THREE.Vector3(Math.cos(a)*side*.78+dir.x*.35,.27+dir.y*.42,Math.sin(a)*side*.78+dir.z*.35).normalize();
            leafItems.push({x:mid.x,y:mid.y,z:mid.z,dir:leafDir,s:rr(.085,.15)*scale*(1-t*.22),twist:rr(-.7,.7),tint,leafWidth});
          }
        }
        leafItems.push({x:end.x,y:end.y,z:end.z,dir,s:rr(.085,.14)*scale,twist:phase,tint,leafWidth});
      }
      function shrub(x,y,z,size,shoots=24){
        const habit=hash3(x,y,z),heightScale=habit<.34?.62:habit<.72?.92:1.16;
        const leafWidth=habit<.34?1.15:habit<.72?.88:.58,spread=habit>.72?.72:1;
        // Each shoot carries paired leaves along its full length. Stems therefore
        // disappear into a naturally irregular canopy rather than exposed twig fans.
        for(let j=0;j<shoots;j++){
          const a=j*2.399963+rr(-.3,.3),r=Math.sqrt(rand())*size*.90*spread,h=size*(.34+Math.sqrt(Math.max(0,1-r*r/(size*size)))*.58)*rr(.72,1.2)*heightScale;
          const bx=x+Math.cos(a)*r*.40,bz=z+Math.sin(a)*r*.40,ex=x+Math.cos(a)*r+h*.10,ez=z+Math.sin(a)*r;
          const by=y+rr(.04,.18)*size,ey=y+h;
          stem([x,y,z],[bx,y+h*.34,bz],.011*size);
          sprig(bx,by,bz,ex-bx,ey-by,ez-bz,Math.hypot(ex-bx,ey-by,ez-bz),Math.min(1.25,.65+size*.35),rr(-.025,.025)+(habit-.5)*.025,leafWidth);
          // Shorter secondary foliage closes gaps at the crown and sides.
          sprig((bx+ex)*.5,y+h*.50,(bz+ez)*.5,Math.cos(a+.6),.55,Math.sin(a+.6),size*rr(.22,.45),Math.min(1.1,.6+size*.3),.015,leafWidth);
        }
      }
      function plantingHeight(x,z){
        let y=landHeight(x,z);
        for(const list of stonePositions)for(const p of list){
          if(Math.abs(x-p.x)>p.sx+p.sz||Math.abs(z-p.z)>p.sx+p.sz)continue;
          const dx=x-p.x,dz=z-p.z,c=Math.cos(p.ry),s=Math.sin(p.ry),u=(dx*c-dz*s)/(p.sx*.82),v=(dx*s+dz*c)/(p.sz*.82),r=u*u+v*v;
          if(r<1)y=Math.max(y,p.y+p.sy*Math.sqrt(1-r)*.80-.05);
        }
        return y;
      }
      function grassClump(x,y,z,size){
        const blades=12+Math.floor(rand()*13);
        for(let j=0;j<blades;j++){
          const a=rr(0,Math.PI*2),r=rr(0,.13)*size,bx=x+Math.cos(a)*r,bz=z+Math.sin(a)*r,h=rr(.22,.70)*size,w=rr(.009,.020)*size,bend=rr(.15,.45)*size;
          const side=new THREE.Vector3(Math.cos(a),0,Math.sin(a)),lean=new THREE.Vector3(Math.sin(a)*bend,0,Math.cos(a)*bend);
          const levels=[0,.35,.72,1];
          for(let s=0;s<3;s++){
            const points=[];
            for(const [t,sign] of [[levels[s],-1],[levels[s],1],[levels[s+1],1],[levels[s],-1],[levels[s+1],1],[levels[s+1],-1]]){
              points.push(bx+lean.x*t*t+side.x*w*(1-t)*sign,y+h*t,bz+lean.z*t*t+side.z*w*(1-t)*sign);
              const c=new THREE.Color().setHSL(rr(.18,.25),rr(.16,.36),.15+t*.12);grassColors.push(c.r,c.g,c.b);
            }
            grassPositions.push(...points);
          }
        }
      }
      // Plants occupy soil pockets inland of the rocks. Density falls away in the
      // wave-washed strip, while the left foreground is full and richly layered.
      for(let i=0;i<210;i++){
        const z=i<130?rr(-35,39):rr(-112,-35),inland=rr(1.5,i<130?22:28),x=shoreEdge(z)-inland;
        if(isBuilding(x,z,1.65)||isApproach(x,z,.8))continue;
        const size=rr(.85,1.65)*(inland>14?1.12:1);
        shrub(x,plantingHeight(x,z)-.04,z,size,z>-35?28:18);
      }
      for(let i=0;i<70;i++){
        const z=rr(-25,31),x=shoreEdge(z)-rr(1.2,17);
        if(isBuilding(x,z,1.15)||isApproach(x,z,.7))continue;
        shrub(x,plantingHeight(x,z),z,rr(.50,.95),20);
      }
      // Dense, overlapping foreground thickets like the reference's green bank.
      // Individual irregular sprigs retain leaf detail at close inspection.
      for(let i=0;i<95;i++){
        const z=rr(12.4,35),x=shoreEdge(z)-rr(2.0,19);
        if(isBuilding(x,z,1.1)||isApproach(x,z,.9))continue;
        shrub(x,plantingHeight(x,z)-.08,z,rr(.85,1.65),28);
      }
      // Background greenery frames the cabin without growing into the camera.
      shrub(-21.5,landHeight(-21.5,0),0,1.8,40);
      shrub(-21.3,landHeight(-21.3,-5),-5,2.0,42);
      shrub(-18.5,landHeight(-18.5,-12),-12,2.2,46);
      for(let i=0;i<520;i++){
        const z=rr(-87,39),x=shoreEdge(z)-rr(.6,24);
        if(isBuilding(x,z,.6)||isApproach(x,z,.3))continue;
        grassClump(x,landHeight(x,z)+.015,z,rr(.5,1.1));
      }
      let leavesMesh=null,stemsMesh=null;
      function flushFoliage(){
        if(leavesMesh){leavesMesh.removeFromParent();leavesMesh.dispose();}
        leavesMesh=new THREE.InstancedMesh(leafGeo,leafMat,leafItems.length);
        const quat=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),color=new THREE.Color();
        leafItems.forEach((p,i)=>{
          dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,0);quat.setFromUnitVectors(up,p.dir);dummy.quaternion.copy(quat);dummy.rotateY(p.twist);dummy.scale.set(p.s*(p.leafWidth||1),p.s,p.s);dummy.updateMatrix();leavesMesh.setMatrixAt(i,dummy.matrix);
          color.setHSL(rr(.19,.27)+p.tint,rr(.20,.39),rr(.17,.32));leavesMesh.setColorAt(i,color);
        });
        leavesMesh.castShadow=true;leavesMesh.receiveShadow=true;leavesMesh.computeBoundingSphere();scene.add(leavesMesh);
        if(stemsMesh){stemsMesh.geometry.dispose();stemsMesh.removeFromParent();}
        const stemsGeo=new THREE.BufferGeometry();stemsGeo.setAttribute('position',new THREE.Float32BufferAttribute(stemPositions,3));stemsGeo.computeVertexNormals();
        stemsMesh=new THREE.Mesh(stemsGeo,new THREE.MeshStandardMaterial({color:'#635e3b',roughness:1}));stemsMesh.castShadow=true;stemsMesh.receiveShadow=true;scene.add(stemsMesh);
      }
      const grassGeo=new THREE.BufferGeometry();grassGeo.setAttribute('position',new THREE.Float32BufferAttribute(grassPositions,3));grassGeo.setAttribute('color',new THREE.Float32BufferAttribute(grassColors,3));grassGeo.computeVertexNormals();
      const grass=new THREE.Mesh(grassGeo,new THREE.MeshStandardMaterial({color:'#c5c79d',roughness:.97,side:THREE.DoubleSide,vertexColors:true}));grass.castShadow=true;grass.receiveShadow=true;scene.add(grass);
      flushFoliage();
      // A second vegetation scale frames the house like the reference: crooked,
      // wind-shaped evergreen crowns over a broadleaf understory. Its private
      // seed and separate batches leave every existing rock, grass and planter
      // (including the shared random stream used by the cabin) unchanged.
      function addCoastalCanopy(){
        let canopySeed=650920;
        const random=()=>{canopySeed=(canopySeed*1664525+1013904223)>>>0;return canopySeed/4294967296;};
        const range=(a,b)=>a+(b-a)*random(),up=new THREE.Vector3(0,1,0);
        const canopy=new THREE.Group();canopy.name='coastal-layered-canopy';scene.add(canopy);
        const branches=[],leaves=[],counts={trees:0,understory:0,ferns:0},plantLayers=[];
        const safe=(x,z,padding=.48)=>!isBuilding(x,z,padding)&&!isApproach(x,z,padding);
        // All leaves are real cupped surfaces, not camera-facing sprites or
        // opaque canopy balls. The raised midrib catches small dusk highlights.
        const broadLeaf=new THREE.BufferGeometry();
        broadLeaf.setAttribute('position',new THREE.Float32BufferAttribute([
          0,0,0,-.20,.15,.013,-.34,.38,.026,-.29,.68,.038,-.15,.89,.045,
          0,1,.051,.15,.89,.045,.29,.68,.038,.34,.38,.026,.20,.15,.013,
          0,.25,.065,0,.56,.102,0,.81,.088
        ],3));
        broadLeaf.setIndex([0,1,10,0,10,9,1,2,10,2,11,10,2,3,11,3,4,12,3,12,11,4,5,12,5,6,12,6,7,12,7,11,12,7,8,11,8,10,11,8,9,10]);
        broadLeaf.computeVertexNormals();
        const leafSurface=new THREE.MeshStandardMaterial({color:'#d6dfb7',roughness:.79,metalness:0,side:THREE.DoubleSide});
        // Fine local vein/cup variation is deliberately weak: foliage should
        // read as overlapping leathery leaves instead of noisy flat triangles.
        const bark=new THREE.MeshStandardMaterial({color:'#514a34',roughness:.97});
        const bgeo=new THREE.CylinderGeometry(.58,1,1,7,1,false);
        function branch(a,b,radius){
          const length=a.distanceTo(b);if(length<.015)return;
          for(let i=0;i<6;i++){const p=a.clone().lerp(b,i/5);if(!safe(p.x,p.z,radius+.48))return;}
          branches.push({mid:a.clone().lerp(b,.5),direction:b.clone().sub(a).normalize(),length: length+radius*.55,radius});
        }
        function leaf(position,direction,length,width,tint=0){
          // A full leaf-length guard protects the glazing and circulation, not
          // merely a test of plant-root positions.
          if(!safe(position.x,position.z,length+.48))return;
          leaves.push({position,direction,length,width,roll:range(-Math.PI,Math.PI),hue:range(.225,.270)+tint,saturation:range(.28,.42),lightness:range(.20,.29)});
        }
        function leafyTwig(a,b,scale,phase,tint){
          branch(a,b,.008*scale);const axis=b.clone().sub(a).normalize();
          const side=new THREE.Vector3().crossVectors(axis,up).normalize();
          if(side.lengthSq()<.01)side.set(1,0,0);
          const across=new THREE.Vector3().crossVectors(axis,side).normalize();
          // Short arched, overlapping shoots fill each crown lobe in depth.
          // The old long, almost coplanar fans left bare branch spokes visible.
          for(let i=0;i<10;i++){
            const t=.08+i*.098,anchor=a.clone().lerp(b,t).addScaledVector(across,Math.sin(t*Math.PI)*.075*scale),angle=phase+i*2.39996;
            const outward=side.clone().multiplyScalar(Math.cos(angle)).addScaledVector(across,Math.sin(angle));
            for(let j=0;j<3;j++){
              const dir=outward.clone().multiplyScalar(j===0?1:-.75).addScaledVector(axis,.37+j*.18).add(new THREE.Vector3(range(-.22,.22),range(-.12,.25),range(-.22,.22))).normalize();
              const pos=anchor.clone().addScaledVector(outward,j===0?.03:-.025).addScaledVector(axis,j*.018);
              leaf(pos,dir,range(.18,.29)*scale,range(.88,1.15),tint);
            }
          }
          for(let i=0;i<12;i++){
            const a=phase+i*2.39996,dir=new THREE.Vector3(Math.cos(a),range(-.15,.55),Math.sin(a)).normalize();
            leaf(b.clone().add(new THREE.Vector3(range(-.13,.13),range(-.09,.15),range(-.13,.13)).multiplyScalar(scale)),dir,range(.18,.28)*scale,range(.88,1.15),tint-.012);
          }
        }
        function woodyPlant(x,z,height,spread,small=false){
          const base=new THREE.Vector3(x,(small?plantingHeight(x,z):landHeight(x,z))-.04,z),phase=range(0,6.283);
          const stems=small?2:3,scale=small?.70:1,firstLeaf=leaves.length,firstBranch=branches.length;
          const plantTint=range(-.016,.018),wind=new THREE.Vector3(.24,0,.12);
          for(let trunk=0;trunk<stems;trunk++){
            const angle=phase+trunk*2.39996+range(-.25,.25),leaderHeight=height*range(.80,1.0);
            const lean=new THREE.Vector3(Math.cos(angle)*spread*.29,0,Math.sin(angle)*spread*.29).add(wind),points=[base.clone()];
            for(let i=1;i<=4;i++){
              const t=i/4,p=base.clone().addScaledVector(lean,t*t).add(new THREE.Vector3(Math.sin(t*3.8+angle)*height*.035,leaderHeight*t*.77,Math.sin(t*4.4+angle)*height*.026));
              branch(points[i-1],p,(small?.034:.13)*(1-t*.58));points.push(p);
            }
            for(let limb=0;limb<(small?3:4);limb++){
              const a=angle+limb*1.71+range(-.46,.46),level=.40+limb*.13+range(-.025,.035);
              const root=base.clone().lerp(points[4],level/.77),reach=spread*range(.48,.84)*(1-limb*.065);
              const end=root.clone().add(new THREE.Vector3(Math.cos(a)*reach+.16,leaderHeight*range(.12,.23),Math.sin(a)*reach));
              branch(root,end,(small?.019:.055)*(1-limb*.08));
              for(let fork=0;fork<(small?2:3);fork++){
                const fa=a+range(-1.15,1.15),start=root.clone().lerp(end,.58+fork*.18);
                // Staggered lobes have distinct upper/lower surfaces, rather
                // than forming either one flat spray or a regular crown ball.
                const lift=(fork-1)*height*.047+range(.025,.09)*height;
                const tip=start.clone().add(new THREE.Vector3(Math.cos(fa)*spread*range(.18,.34),lift,Math.sin(fa)*spread*range(.18,.34)));
                branch(start,tip,small?.012:.024);
                for(let twig=0;twig<(small?2:3);twig++){
                  const ta=fa+(twig-1)*1.65+range(-.28,.28),rise=twig===1?range(.22,.43):range(-.19,.16);
                  const startTwig=tip.clone().add(new THREE.Vector3(Math.cos(ta)*.08,rise*.32,Math.sin(ta)*.08).multiplyScalar(scale));
                  const tipEnd=startTwig.clone().add(new THREE.Vector3(Math.cos(ta)*range(.30,.52)*scale,rise*scale,Math.sin(ta)*range(.30,.52)*scale));
                  leafyTwig(startTwig,tipEnd,scale*range(.92,1.07),phase+fork+twig,plantTint+(small?-.012:0));
                }
              }
            }
          }
          counts[small?'understory':'trees']++;
          plantLayers.push({kind:small?'understory':'tree',root:base.toArray(),height,spread,firstLeaf,leaves:leaves.length-firstLeaf,branches:branches.length-firstBranch});
        }
        // The tall crowns remain landward of the house and do not occupy the
        // deck, the glass-side entry, or the open horizon beyond the tea table.
        for(const [x,z,h,s]of[
          [-23.2,-2.8,7.9,2.30],[-22.0,-8.3,8.0,2.15],[-25.0,-13.6,6.7,2.55],
          [-28.4,-5.4,6.0,2.50],[-26.4,5.3,5.2,2.25],[-26.4,12.1,4.0,2.05],
          [-30.5,-14.5,5.8,2.65],[-25.5,-21.0,5.6,2.25]
        ])woodyPlant(x,z,h,s);
        for(const [x,z,h,s]of[
          [-15.1,16.9,1.05,.95],[-19.0,18.1,1.08,1.10],[-17.2,22.9,1.12,1.08],[-14.4,25.4,.95,.82],
          [-21.5,11.7,1.55,1.15],[-23.0,4.2,1.80,1.25],[-20.1,-3.8,2.25,1.35],
          [-18.0,-7.0,1.75,1.20],[-22.9,-11.1,2.45,1.30]
        ])woodyPlant(x,z,h,s,true);
        // A few low arching fern fans bridge the soil/stone scale below the
        // shrubs. Paired pinnae follow curved rachises rather than radial stars.
        for(const [x,z]of[[-14.5,14.0],[-16.1,19.4],[-20.8,17.5],[-18.6,25.2],[-13.5,27.6],[-21.2,10.8],[-19.9,-4.1],[-16.0,-5.1],[-22.8,-5.6],[-23.4,1.7]]){
          const base=new THREE.Vector3(x,plantingHeight(x,z)+.02,z),phase=range(0,6.283);
          for(let f=0;f<8;f++){
            const a=phase+f*2.39996,length=range(.66,1.08),direction=new THREE.Vector3(Math.cos(a),0,Math.sin(a)),side=new THREE.Vector3(-Math.sin(a),0,Math.cos(a));let prev=base;
            for(let j=1;j<=10;j++){
              const t=j/10,p=base.clone().addScaledVector(direction,t*length).add(new THREE.Vector3(0,Math.sin(t*Math.PI*.78)*length*.68,0));
              branch(prev,p,.004);prev=p;
              for(const sign of[-1,1])leaf(p.clone(),side.clone().multiplyScalar(sign).addScaledVector(direction,.42).add(new THREE.Vector3(0,.07,0)).normalize(),(.19*(1-t)+.045)*length,.43,-.016);
            }
          }
          counts.ferns++;
        }
        const transform=new THREE.Object3D(),color=new THREE.Color(),bounds=new THREE.Box3(),point=new THREE.Vector3();let exclusionIntrusions=0;
        function finishBatch(geometry,material,items,name,place){
          const batch=new THREE.InstancedMesh(geometry,material,items.length);batch.name=name;
          items.forEach((p,i)=>{
            place(p);transform.updateMatrix();batch.setMatrixAt(i,transform.matrix);
            if(p.hue!==undefined){color.setHSL(p.hue,p.saturation,p.lightness);batch.setColorAt(i,color);}
            const vertices=geometry.attributes.position;
            for(let v=0;v<vertices.count;v++){
              point.fromBufferAttribute(vertices,v).applyMatrix4(transform.matrix);bounds.expandByPoint(point);
              if(!safe(point.x,point.z,.35))exclusionIntrusions++;
            }
          });
          batch.castShadow=true;batch.receiveShadow=true;batch.computeBoundingSphere();canopy.add(batch);
        }
        finishBatch(bgeo,bark,branches,'wind-shaped-evergreen-branches',p=>{
          transform.position.copy(p.mid);transform.quaternion.setFromUnitVectors(up,p.direction);transform.scale.set(p.radius,p.length,p.radius);
        });
        finishBatch(broadLeaf,leafSurface,leaves,'layered-evergreen-leaves',p=>{
          transform.position.copy(p.position);transform.quaternion.setFromUnitVectors(up,p.direction);transform.rotateY(p.roll);transform.scale.set(p.length*p.width,p.length,p.length);
        });
        canopy.userData={...counts,branches:branches.length,leaves:leaves.length,drawCalls:2,triangles:branches.length*bgeo.index.count/3+leaves.length*broadLeaf.index.count/3,
          bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},exclusionPadding:.35,exclusionIntrusions,plantLayers};
        scene.userData.coastalVegetation=canopy.userData;
      }
      addCoastalCanopy();
      // Near-coast details deliberately use their own seed. Adding a shell or log
      // never reshuffles the existing shrubs, furniture or scene construction.
      function addShoreDetails(){
        let detailSeed=802731;
        const random=()=>{detailSeed=(detailSeed*1664525+1013904223)>>>0;return detailSeed/4294967296;};
        const range=(a,b)=>a+(b-a)*random(),up=new THREE.Vector3(0,1,0);
        const details=new THREE.Group();details.name='coastal-shore-details';scene.add(details);
        const counts={driftwood:0,gravel:0,barnacles:0,shells:0,seaweedTufts:0,wetPatches:0};
        const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),instanceMatrix=new THREE.Matrix4(),normalMatrix=new THREE.Matrix3();
        rockMeshes.forEach(m=>m.updateMatrixWorld(true));
        const excluded=(x,z,padding=.3)=>isBuilding(x,z,padding)||isApproach(x,z,padding);
        function surface(x,z){
          if(excluded(x,z))return null;
          ray.set(new THREE.Vector3(x,16,z),down);const hits=ray.intersectObjects(rockMeshes,false);
          if(!hits.length)return null;const hit=hits[0];
          hit.object.getMatrixAt(hit.instanceId,instanceMatrix);instanceMatrix.premultiply(hit.object.matrixWorld);normalMatrix.getNormalMatrix(instanceMatrix);
          const normal=hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
          return {point:hit.point.clone(),normal};
        }
        function instanceBatch(geometry,material,items,name){
          if(!items.length){geometry.dispose();return;}
          const batch=new THREE.InstancedMesh(geometry,material,items.length);batch.name=name;
          const transform=new THREE.Object3D(),color=new THREE.Color();
          items.forEach((p,i)=>{
            transform.position.copy(p.position);transform.quaternion.setFromUnitVectors(up,p.normal||up);transform.rotateY(p.angle||0);transform.scale.copy(p.scale);transform.updateMatrix();batch.setMatrixAt(i,transform.matrix);
            if(p.color){color.set(p.color);batch.setColorAt(i,color);}
          });
          batch.receiveShadow=true;batch.castShadow=false;batch.computeBoundingSphere();details.add(batch);
        }
        // Gravel collects in uneven pockets rather than an evenly scattered layer.
        const pebbles=[];
        for(let pocket=0;pocket<10;pocket++){
          const z=range(10.7,24),x=shoreEdge(z)+range(-1.4,.9),center=surface(x,z);if(!center)continue;
          const a=range(0,6.283),length=range(.30,.80),width=range(.12,.27);
          for(let i=0;i<38;i++){
            const u=range(-1,1)*length,v=range(-1,1)*width,px=x+Math.cos(a)*u-Math.sin(a)*v,pz=z+Math.sin(a)*u+Math.cos(a)*v,hit=surface(px,pz);
            if(!hit||Math.abs(hit.point.y-center.point.y)>.22||hit.normal.y<.50)continue;
            const sizeSample=random(),s=sizeSample<.90?.006+sizeSample/.90*.010:.020+(sizeSample-.90)/.10*.007;
            const shade=range(.13,.24),color=new THREE.Color(shade*1.04,shade,shade*.89);
            pebbles.push({position:hit.point.clone().addScaledVector(hit.normal,s*.32),normal:hit.normal,angle:range(0,6.283),scale:new THREE.Vector3(s*range(.8,1.5),s*.45,s*range(.8,1.2)),color});
          }
        }
        counts.gravel=pebbles.length;
        instanceBatch(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:'#b8b1a4',roughness:.86}),pebbles,'gravel-pockets');

        // Pale salt-weathered driftwood, with bent limbs, tapered broken ends and
        // longitudinal grain. Three isolated pieces leave the coastline readable.
        const pixels=new Uint8Array(128*512*4);
        for(let y=0;y<512;y++)for(let x=0;x<128;x++){
          const grain=Math.sin(x*.72+Math.sin(y*.013)*1.3)+Math.sin(x*2.16+Math.sin(y*.021)*.7)*.38;
          const fine=(hash3(x,y,18)-.5)*10,value=154+grain*19+fine,index=(y*128+x)*4;
          pixels[index]=value;pixels[index+1]=value*.97;pixels[index+2]=value*.86;pixels[index+3]=255;
        }
        const woodTexture=new THREE.DataTexture(pixels,128,512,THREE.RGBAFormat);woodTexture.needsUpdate=true;woodTexture.colorSpace=THREE.SRGBColorSpace;woodTexture.wrapS=woodTexture.wrapT=THREE.RepeatWrapping;woodTexture.magFilter=THREE.LinearFilter;woodTexture.minFilter=THREE.LinearMipmapLinearFilter;woodTexture.generateMipmaps=true;
        const wood=new THREE.MeshStandardMaterial({color:'#e0d7be',map:woodTexture,bumpMap:woodTexture,bumpScale:.015,roughness:.94});
        const brokenWood=new THREE.MeshStandardMaterial({color:'#a7a08b',roughness:1});
        function washedBranch(a,b,radius){
          const direction=b.clone().sub(a),length=direction.length(),g=new THREE.CylinderGeometry(radius*.47,radius,length,9,7,true),p=g.attributes.position;
          for(let i=0;i<p.count;i++){
            const t=p.getY(i)/length+.5,offset=Math.sin(t*Math.PI)*radius*.70,ragged=1+.09*Math.sin(t*23+p.getX(i)*37);
            p.setXYZ(i,p.getX(i)*ragged+offset,p.getY(i),p.getZ(i)*ragged+Math.sin(t*4)*radius*.23);
          }
          g.computeVertexNormals();const m=new THREE.Mesh(g,wood);m.position.copy(a).lerp(b,.5);m.quaternion.setFromUnitVectors(up,direction.normalize());m.castShadow=true;m.receiveShadow=true;details.add(m);
          for(const [position,r]of[[a,radius],[b,radius*.47]]){
            const end=new THREE.Mesh(new THREE.CircleGeometry(r,9),brokenWood);end.position.copy(position).addScaledVector(direction,position===a?-.001:.001);end.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),position===a?direction.clone().negate():direction);details.add(end);
          }
        }
        for(const [z,offset,angle]of[[11.7,.45,-.6],[18.6,.85,.35],[-17.5,-.35,.75]]){
          let hit=null,bestScore=Infinity;
          for(let search=0;search<60;search++){
            const pz=z+range(-2.1,2.1),px=shoreEdge(pz)+offset+range(-1.8,1.8),candidate=surface(px,pz);
            if(!candidate||candidate.point.y<.04||candidate.point.y>1.65||candidate.normal.y<.50||excluded(px,pz,1.5))continue;
            const score=Math.abs(pz-z)+Math.abs(px-shoreEdge(pz)-offset)*.5;if(score<bestScore){bestScore=score;hit=candidate;}
          }
          if(!hit)continue;
          const length=range(1.35,1.95),direction=new THREE.Vector3(Math.cos(angle),range(-.03,.03),Math.sin(angle)),a=hit.point.clone().addScaledVector(direction,-length*.5).add(new THREE.Vector3(0,.10,0)),b=hit.point.clone().addScaledVector(direction,length*.5).add(new THREE.Vector3(0,.10,0));
          if(excluded(a.x,a.z,.65)||excluded(b.x,b.z,.65))continue;
          // Raise each endpoint only enough to clear the actual support stones.
          const A=surface(a.x,a.z),B=surface(b.x,b.z);if(A)a.y=Math.max(a.y,A.point.y+.065);if(B)b.y=Math.max(b.y,B.point.y+.055);
          let lift=0;
          for(let i=1;i<6;i++){const p=a.clone().lerp(b,i/6),support=surface(p.x,p.z);if(support)lift=Math.max(lift,support.point.y+.07-p.y);}a.y+=lift;b.y+=lift;
          washedBranch(a,b,.075);
          for(let limb=0;limb<3;limb++){
            const root=a.clone().lerp(b,.25+limb*.22),side=limb%2?1:-1,end=root.clone().add(new THREE.Vector3(-direction.z*side*range(.26,.49),range(.06,.15),direction.x*side*range(.26,.49)));
            washedBranch(root,end,range(.018,.033));
          }
          counts.driftwood++;
        }

        // Barnacles and a few ridged clam halves follow low rock surfaces. Colonies
        // have gaps and mixed shell colors, avoiding bright uniform polka dots.
        const barnacles=[],shells=[],colonyCenters=[];
        for(let attempt=0;attempt<100&&colonyCenters.length<18;attempt++){
          const z=range(-20,25),x=shoreEdge(z)+range(.55,6),hit=surface(x,z);
          if(!hit||hit.point.y<-.02||hit.point.y>.78||hit.normal.y<.40)continue;
          if(colonyCenters.some(p=>p.distanceTo(hit.point)<.8))continue;colonyCenters.push(hit.point);
          const colonyCount=Math.floor(range(12,25));
          for(let i=0;i<colonyCount;i++){
            const a=range(0,6.283),r=Math.sqrt(random())*range(.12,.24),near=surface(x+Math.cos(a)*r,z+Math.sin(a)*r);
            if(!near||Math.abs(near.point.y-hit.point.y)>.16)continue;
            const size=range(.014,.031),shade=range(.32,.51),color=new THREE.Color(shade*1.05,shade,shade*.87);
            barnacles.push({position:near.point.clone().addScaledVector(near.normal,.003),normal:near.normal,angle:range(0,6.283),scale:new THREE.Vector3(size,size*range(.65,1.2),size),color});
          }
          if(random()>.35){
            const s=range(.045,.072);shells.push({position:hit.point.clone().addScaledVector(hit.normal,.008),normal:hit.normal,angle:range(0,6.283),scale:new THREE.Vector3(s,s,s*.85),color:new THREE.Color('#9c9685')});
          }
        }
        const barnacleProfile=[[1,0],[.91,.24],[.64,.54],[.43,.59],[.34,.53],[.43,.36],[.54,.28]].map(p=>new THREE.Vector2(...p));
        instanceBatch(new THREE.LatheGeometry(barnacleProfile,7),new THREE.MeshStandardMaterial({color:'#dbd7cb',roughness:.92,side:THREE.DoubleSide}),barnacles,'waterline-barnacles');
        counts.barnacles=barnacles.length;
        const shellGeo=new THREE.SphereGeometry(1,12,5,0,Math.PI*2,0,Math.PI/2),sp=shellGeo.attributes.position;
        for(let i=0;i<sp.count;i++){const x=sp.getX(i),z=sp.getZ(i),a=Math.atan2(z,x),rib=1+Math.cos(a*12)*.055;sp.setXYZ(i,x*rib,sp.getY(i)*.24,z*rib);}
        shellGeo.computeVertexNormals();instanceBatch(shellGeo,new THREE.MeshStandardMaterial({color:'#cfc7b4',roughness:.80,side:THREE.DoubleSide}),shells,'scattered-clam-shells');counts.shells=shells.length;

        // Short wet ribbons cling to intertidal faces; broad curled strips differ
        // visibly from the upright inland grasses without changing the silhouette.
        const weedVertices=[],weedColors=[];
        for(let attempt=0;attempt<140&&counts.seaweedTufts<32;attempt++){
          const z=range(-22,26),x=shoreEdge(z)+range(.1,4.5),hit=surface(x,z);if(!hit||hit.point.y<-.02||hit.point.y>.63||hit.normal.y<.35)continue;
          const tangent=new THREE.Vector3().crossVectors(hit.normal,Math.abs(hit.normal.z)>.8?new THREE.Vector3(1,0,0):new THREE.Vector3(0,0,1)).normalize(),bitangent=new THREE.Vector3().crossVectors(hit.normal,tangent);
          for(let blade=0;blade<6;blade++){
            const angle=range(0,6.283),length=range(.18,.38),width=range(.012,.026),dir=tangent.clone().multiplyScalar(Math.cos(angle)).addScaledVector(bitangent,Math.sin(angle)),side=new THREE.Vector3().crossVectors(hit.normal,dir);
            const point=(t,sign)=>hit.point.clone().addScaledVector(hit.normal,.009+Math.sin(t*Math.PI)*.075+t*.014).addScaledVector(dir,t*length).addScaledVector(side,Math.sin(t*5.2)*.035+sign*width*Math.sin(t*Math.PI*.92));
            for(let segment=0;segment<4;segment++){
              const a=segment/4,b=(segment+1)/4;
              for(const p of[point(a,-1),point(a,1),point(b,1),point(a,-1),point(b,1),point(b,-1)]){weedVertices.push(p.x,p.y,p.z);const shade=range(.12,.20);weedColors.push(shade*.80,shade,shade*.53);}
            }
          }
          counts.seaweedTufts++;
        }
        const weedsGeo=new THREE.BufferGeometry();weedsGeo.setAttribute('position',new THREE.Float32BufferAttribute(weedVertices,3));weedsGeo.setAttribute('color',new THREE.Float32BufferAttribute(weedColors,3));weedsGeo.computeVertexNormals();
        const weeds=new THREE.Mesh(weedsGeo,new THREE.MeshStandardMaterial({color:'#98996c',roughness:.39,side:THREE.DoubleSide,vertexColors:true}));weeds.name='wet-seaweed-ribbons';weeds.receiveShadow=true;details.add(weeds);

        // A few thin, irregular films sit on genuinely flat depressions only.
        // Rejecting sloping/uneven candidates prevents floating blue puddles.
        const wetMaterial=new THREE.MeshPhysicalMaterial({color:'#2a3431',roughness:.12,metalness:.08,clearcoat:1,clearcoatRoughness:.07});
        for(let attempt=0;attempt<140&&counts.wetPatches<3;attempt++){
          const z=range(10.5,23),x=shoreEdge(z)+range(-.4,2),hit=surface(x,z);if(!hit||hit.point.y<.08||hit.point.y>1.1||hit.normal.y<.96)continue;
          const radius=range(.16,.30),vertices=[hit.point.x,hit.point.y+.007,hit.point.z],indices=[];let safe=true;
          for(let i=0;i<16;i++){
            const a=i/16*Math.PI*2,r=radius*range(.79,1.15),near=surface(x+Math.cos(a)*r,z+Math.sin(a)*r);
            if(!near||Math.abs(near.point.y-hit.point.y)>.018){safe=false;break;}vertices.push(near.point.x,near.point.y+.008,near.point.z);indices.push(0,(i+1)%16+1,i+1);
          }
          if(!safe)continue;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
          const wet=new THREE.Mesh(geometry,wetMaterial);wet.name='small-tide-film';wet.receiveShadow=true;details.add(wet);counts.wetPatches++;
        }
        let triangles=0;details.traverse(m=>{if(m.isMesh)triangles+=(m.geometry.index?m.geometry.index.count:m.geometry.attributes.position.count)*(m.isInstancedMesh?m.count:1)/3;});
        details.userData={...counts,triangles};
      }
      addShoreDetails();
      function addPlanterFoliage(x,y,z,size=1){
        shrub(x,y,z,size*1.12,36);flushFoliage();
      }
      return {foamRocks,shoreField,shoreEdge,landHeight,addPlanterFoliage};
    }
  };
})();
