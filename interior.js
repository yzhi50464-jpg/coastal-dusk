/* Reference-led bedroom and workstation. All furniture is editable geometry. */
window.CoastalInterior={create(api){
  const {THREE,house,materials,makeMaterial,mesh,box,rounded,puffy,cylinder,sphere,rod,tube,warmLight,halo,fabricMap,nature}=api;
  const room=new THREE.Group();room.name='Sea-view bedroom';house.add(room);
  const floor=2.62,cream=makeMaterial('#e0d9cb',.92);
  // Low-contrast cotton fibers are stochastic, not a high-frequency line grid.
  // All three maps are power-of-two and mipmapped, including on WebGL 1.
  let quiltHeightPixels=null;
  function cottonTexture(quilted=false,height=false){
    const size=quilted?512:256;
    const hash=(x,y,s)=>{let n=Math.imul(x+s,374761393)^Math.imul(y+s*3,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};
    const soft=(x,y,s)=>{const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,a=fx*fx*(3-2*fx),b=fy*fy*(3-2*fy);return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iy,s),hash(ix+1,iy,s),a),THREE.MathUtils.lerp(hash(ix,iy+1,s),hash(ix+1,iy+1,s),a),b)-.5;};
    const t=canvasMap((c,w,h)=>{
      const pixels=c.createImageData(w,h),vertical=[.12,.28,.44,.60,.76,.91],horizontal=[.095,.68,.955],edges=[0,...vertical,1];
      if(height&&quiltHeightPixels){pixels.data.set(quiltHeightPixels);quiltHeightPixels=null;c.putImageData(pixels,0,0);return;}
      if(quilted&&!height)quiltHeightPixels=new Uint8ClampedArray(w*h*4);
      const seamX=Array.from({length:h},(_,y)=>vertical.map((v,i)=>v*w+soft(i*3.7,y/91,41)*1.5));
      const seamY=Array.from({length:w},(_,x)=>horizontal.map((v,i)=>v*h+soft(x/105,i*2.3,61)*1.5));
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const fibers=(hash(x>>1,y,7)*.55+hash(x,y>>1,17)*.45-.5)*2,flock=soft(x/19,y/23,29)*2;
        let pressed=0,stitch=0,panel=0;
        if(quilted){
          let distance=Infinity;for(const seam of seamX[y])distance=Math.min(distance,Math.abs(x-seam));for(const seam of seamY[x])distance=Math.min(distance,Math.abs(y-seam));
          pressed=Math.exp(-((distance/4.2)**2));stitch=Math.exp(-((distance/1.25)**2));
          // Broad, nearly imperceptible fill variation, bounded by the sewn bays.
          const u=x/w;let bay=0;while(bay<edges.length-2&&u>edges[bay+1])bay++;
          const across=(u-edges[bay])/(edges[bay+1]-edges[bay]);panel=Math.sin(across*Math.PI)*Math.sin(across*Math.PI);
        }
        const bump=185+fibers*1.3+flock*.8-pressed*18-stitch*22,v=height?bump:228+fibers*3.2+flock*2.4+panel*2.5-pressed*9-stitch*8,k=(y*w+x)*4;
        pixels.data[k]=pixels.data[k+1]=pixels.data[k+2]=v;pixels.data[k+3]=255;
        if(quilted&&!height){quiltHeightPixels[k]=quiltHeightPixels[k+1]=quiltHeightPixels[k+2]=bump;quiltHeightPixels[k+3]=255;}
      }
      c.putImageData(pixels,0,0);
    },size,size);
    t.name=quilted?(height?'Quilt seam height':'Cotton quilt panel color'):'Soft cotton fiber color';
    t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.anisotropy=4;
    if(height)t.colorSpace=THREE.NoColorSpace;
    if(!quilted){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(3,3);}
    return t;
  }
  const cloth=cottonTexture(),quiltColor=cottonTexture(true),quiltHeight=cottonTexture(true,true);
  const linen=makeMaterial('#bfb7a8',.98,{map:cloth,bumpMap:cloth,bumpScale:.0035});
  const duvet=makeMaterial('#706b6c',.98,{map:quiltColor,bumpMap:quiltHeight,bumpScale:.018,side:THREE.DoubleSide});
  const darkCloth=makeMaterial('#4e515a',.98,{map:cloth,bumpMap:cloth,bumpScale:.0035}),black=makeMaterial('#14191d',.48),white=makeMaterial('#d4d4cd',.62);
  const named=(g,name)=>{g.name=name;return g;};
  function group(name,x,y,z,angle=0){const g=named(new THREE.Group(),name);g.position.set(x,y,z);g.rotation.y=angle;room.add(g);return g;}
  function canvasMap(draw,w=512,h=512){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;}
  function fromBlender(name){const a=CoastalSoftgoods[name],g=new THREE.BufferGeometry();const decode=(v,T)=>{const str=atob(v),bytes=new Uint8Array(str.length);for(let i=0;i<str.length;i++)bytes[i]=str.charCodeAt(i);return new T(bytes.buffer);};for(const [key,n] of [['position',3],['normal',3],['uv',2]])g.setAttribute(key,new THREE.BufferAttribute(decode(a[key],Float32Array),n));g.setIndex(new THREE.BufferAttribute(decode(a.index,Uint32Array),1));g.computeBoundingBox();return g;}
  const pillowGeometry=fromBlender('pillow');
  function pillow(w,h,d,mat,parent,x,y,z){const p=mesh(pillowGeometry,mat,parent,x,y,z);p.scale.set(w,h,d);p.castShadow=p.receiveShadow=true;return p;}
  function plant(parent,x,y,z,s=1){
    cylinder(.23*s,.17*s,.40*s,makeMaterial('#62533e',.94),parent,x,y+.2*s,z);
    cylinder(.20*s,.20*s,.015,makeMaterial('#25251d'),parent,x,y+.41*s,z);
    if(nature&&s>=.9){const fern=nature.createFern(parent,x,y+.41*s,z,.42*s,x<-7?'b':'c');fern.rotation.y=x<-7?.7:-.3;return;}
    const leafMat=makeMaterial('#405133',.89,{side:THREE.DoubleSide});
    for(let i=0;i<17;i++){
      const a=i*2.39996,l=(.42+(i%5)*.09)*s,verts=[],inds=[];
      for(let j=0;j<=10;j++){const t=j/10,r=l*t*.7,yy=l*Math.sin(t*2.0),w=Math.sin(t*Math.PI)*.075*s;
        for(const side of[-1,1])verts.push(x+Math.cos(a)*r+Math.sin(a)*w*side,y+.38*s+yy,z+Math.sin(a)*r-Math.cos(a)*w*side);
        if(j<10){const k=j*2;inds.push(k,k+1,k+2,k+1,k+3,k+2);}
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setIndex(inds);geo.computeVertexNormals();const leaf=mesh(geo,leafMat,parent);leaf.castShadow=true;
    }
  }
  function lamp(parent,x,y,z,s=.8){
    cylinder(.18*s,.22*s,.09*s,materials.cream,parent,x,y+.045*s,z);
    rod([x,y+.05*s,z],[x,y+.55*s,z],.018*s,materials.metal,parent);
    cylinder(.18*s,.29*s,.34*s,makeMaterial('#f5dcb0',.92,{emissive:'#d98738',emissiveIntensity:.24}),parent,x,y+.65*s,z,28);
    sphere(.065*s,materials.glow,parent,x,y+.51*s,z).castShadow=false;warmLight(parent,x,y+.48*s,z,3.8,3.8).color.set('#ffcc8c');halo(parent,x,y+.5*s,z,.8,.14);
  }
  // Clear glass frontage and a solid equipment wall correspond to the plan.
  box(.12,4.15,7.45,makeMaterial('#a99a86',.97),room,-3.09,4.68,-4.43);
  const floorMat=materials.interiorWood.clone();floorMat.onBeforeCompile=materials.interiorWood.onBeforeCompile;floorMat.customProgramCacheKey=materials.interiorWood.customProgramCacheKey;floorMat.color.set('#c0b39e');floorMat.roughness=.88;
  for(let i=0;i<22;i++)rounded(.35,.035,7.34,.003,floorMat,room,-10.85+i*.355,floor-.035,-4.42);
  const bed=group('Double bed',-8.65,floor,-5.58);
  box(3.18,.025,4.45,makeMaterial('#9b927f',.99,{map:fabricMap,bumpMap:fabricMap,bumpScale:.014}),bed,0,.01,.23);
  for(const x of[-1.18,1.18])for(const z of[-1.45,1.45])cylinder(.07,.08,.23,materials.darkWood,bed,x,.13,z);
  rounded(2.85,.29,3.73,.09,materials.darkWood,bed,0,.35,0);
  puffy(2.76,.39,3.62,linen,bed,0,.64,0);
  rounded(2.99,1.55,.22,.09,darkCloth,bed,0,.95,-1.91);
  for(const x of[-.69,.69]){const p=pillow(1.26,.34,.87,linen,bed,x,1.25,-1.29);p.rotation.x=.75;p.rotation.z=x*.04;}
  for(const x of[-.51,.51]){const p=pillow(.89,.31,.66,darkCloth,bed,x,1.29,-.86);p.rotation.x=.78;p.rotation.z=-x*.13;}
  // Locally simulated in Blender, then embedded as real, inspectable geometry.
  const quilt=fromBlender('quilt'),blanket=mesh(quilt,duvet,bed);blanket.name='Blender-simulated cotton duvet';blanket.castShadow=blanket.receiveShadow=true;
  const turnback=mesh(fromBlender('turnback'),linen.clone(),bed);turnback.name='Folded linen header';turnback.castShadow=turnback.receiveShadow=true;
  for(const x of[-10.48,-6.82]){
    rounded(.68,.59,.72,.035,materials.wood,room,x,floor+.32,-7.23);
    box(.54,.24,.025,materials.darkWood,room,x,floor+.36,-6.855);rod([x-.10,floor+.39,-6.82],[x+.10,floor+.39,-6.82],.012,materials.metal,room);
    lamp(room,x+.08,floor+.63,-7.22,.72);plant(room,x-.18,floor+.63,-7.40,.42);
  }
  // Framed art and wall-mounted AC above the headboard.
  const art=canvasMap((c,w,h)=>{c.fillStyle='#12191d';c.fillRect(0,0,w,h);c.fillStyle='#ded5be';c.font='38px Georgia';c.textAlign='center';c.fillText('Time Flies',w/2,h*.54);},512,256);
  box(1.73,.94,.08,materials.darkWood,room,-8.65,5.15,-8.03);
  mesh(new THREE.PlaneGeometry(1.58,.79),new THREE.MeshBasicMaterial({map:art}),room,-8.65,5.15,-7.98);
  rounded(1.63,.52,.30,.08,white,room,-8.65,6.14,-7.91);
  box(1.34,.065,.025,black,room,-8.65,5.99,-7.75);
  // Desk runs along the far wall; chair leaves a central passage to the terrace.
  const desk=group('Computer workstation',-3.82,floor,-6.48,-Math.PI/2);
  rounded(2.74,.10,1.00,.045,white,desk,0,1.12,0);
  rounded(.57,.99,.84,.025,white,desk,-1.04,.57,-.03);
  for(const y of[.35,.66,.93]){box(.49,.013,.018,materials.trim,desk,-1.04,y,.40);box(.17,.018,.025,materials.metal,desk,-1.04,y+.09,.42);}
  for(const z of[-.37,.37])rod([1.15,.05,z],[1.15,1.08,z],.035,white,desk);
  const desktopMap=canvasMap((c,w,h)=>{
    const g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,'#182553');g.addColorStop(.45,'#0877a6');g.addColorStop(.52,'#f6bcbc');g.addColorStop(.70,'#74229a');g.addColorStop(1,'#0a152b');c.fillStyle=g;c.fillRect(0,0,w,h);
    for(let i=0;i<26;i++){c.strokeStyle=`hsla(${185+i*5},90%,${55+i%4*8}%,.36)`;c.lineWidth=3+i%4;c.beginPath();c.moveTo(w/2,h*.48);c.quadraticCurveTo(w*(i/26),h*.65,(i%2?w:0),h*(i/26));c.stroke();}
    c.fillStyle='#ffffff44';c.fillRect(0,h-15,w,15);
  },768,432);
  rounded(1.49,.86,.085,.035,black,desk,0,1.84,-.28);
  const screen=mesh(new THREE.PlaneGeometry(1.40,.77),new THREE.MeshBasicMaterial({map:desktopMap,toneMapped:false}),desk,0,1.84,-.232);screen.name='Computer display';
  rod([0,1.17,-.3],[0,1.44,-.3],.035,black,desk);rounded(.45,.035,.28,.015,black,desk,0,1.19,-.23);
  rounded(.90,.035,.30,.02,black,desk,-.10,1.195,.23);
  const keyMat=makeMaterial('#788b97',.57,{emissive:'#7e35a4',emissiveIntensity:.24});
  for(let r=0;r<4;r++)for(let k=0;k<13;k++)box(.047,.015,.043,keyMat,desk,-.49+k*.062,1.223,.125+r*.061);
  rounded(.13,.058,.20,.05,black,desk,.64,1.22,.23);
  box(.27,.015,.35,makeMaterial('#3f4247'),desk,.64,1.184,.23);
  const pc=group('RGB computer tower',-3.78,floor,-4.65,-Math.PI/2);
  rounded(.50,.96,.68,.04,black,pc,0,.50,0);
  const rgbColors=['#ad39ee','#6d56ed','#df63d5'];
  for(let i=0;i<3;i++){const mat=new THREE.MeshBasicMaterial({color:rgbColors[i],toneMapped:false});mesh(new THREE.TorusGeometry(.14,.012,8,36),mat,pc,0,.23+i*.27,.35);cylinder(.045,.045,.012,materials.metal,pc,0,.23+i*.27,.355).rotation.x=Math.PI/2;for(let j=0;j<7;j++){const a=j*Math.PI*2/7;const blade=mesh(new THREE.PlaneGeometry(.075,.028),materials.metal,pc,Math.sin(a)*.083,.23+i*.27+Math.cos(a)*.083,.356);blade.rotation.z=-a+.5;}}
  box(.39,.80,.012,new THREE.MeshPhysicalMaterial({color:'#686e86',transparent:true,opacity:.16,roughness:.12,depthWrite:false}),pc,0,.5,.365);
  // One continuous molded seat/back, with a dished shell rather than a box back.
  const chair=new THREE.Group();chair.name='White desk chair';chair.position.set(0,0,1.28);chair.rotation.y=Math.PI;desk.add(chair);
  function chairShell(){
    const profile=new THREE.CatmullRomCurve3([[0,.78,.36],[0,.765,.23],[0,.75,-.05],[0,.78,-.22],[0,.87,-.31],[0,1.10,-.345],[0,1.36,-.38],[0,1.49,-.385]].map(p=>new THREE.Vector3(...p)));
    const nu=32,nv=32,row=nu+1,layer=row*(nv+1),positions=[],uvs=[],indices=[];
    function surface(u,v){
      const p=profile.getPoint(THREE.MathUtils.clamp(v,0,1)),q=2*u-1;
      const width=.405-.073*Math.exp(-(((v-.49)/.17)**2))-.035*Math.exp(-((v/.085)**2))-.028*Math.exp(-(((v-1)/.065)**2));
      const back=THREE.MathUtils.smoothstep(v,.38,.68);
      p.x=q*width;p.y+=(1-back)*.045*q**4-.055*Math.pow(Math.abs(q),8)*THREE.MathUtils.smoothstep(v,.88,1);
      p.z+=back*.102*q*q;return p;
    }
    for(const side of[1,-1])for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){
      const u=i/nu,v=j/nv,p=surface(u,v),du=surface(Math.min(1,u+.001),v).sub(surface(Math.max(0,u-.001),v));
      const dv=surface(u,Math.min(1,v+.001)).sub(surface(u,Math.max(0,v-.001))),n=du.cross(dv).normalize();
      p.addScaledVector(n,side*.018);positions.push(p.x,p.y,p.z);uvs.push(u,v);
    }
    for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){
      const k=j*row+i,b=k+layer;indices.push(k,k+1,k+row,k+1,k+row+1,k+row,b,b+row,b+1,b+1,b+row,b+row+1);
    }
    const rim=[];for(let i=0;i<=nu;i++)rim.push(i);for(let j=1;j<=nv;j++)rim.push(j*row+nu);for(let i=nu-1;i>=0;i--)rim.push(nv*row+i);for(let j=nv-1;j>0;j--)rim.push(j*row);
    for(let i=0;i<rim.length;i++){const a=rim[i],b=rim[(i+1)%rim.length];indices.push(a,a+layer,b,b,a+layer,b+layer);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();return g;
  }
  // Elliptical section keeps the armrests broad and soft, without tubular rails.
  function chairRibbon(points,width,thickness,segments=24,across=12,axis=new THREE.Vector3(1,0,0)){
    const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),positions=[],uvs=[],indices=[];
    for(let i=0;i<=segments;i++){
      const t=i/segments,p=path.getPointAt(t),tangent=path.getTangentAt(t),w=axis.clone().addScaledVector(tangent,-axis.dot(tangent)).normalize(),b=new THREE.Vector3().crossVectors(tangent,w).normalize();
      const taper=.72+.28*Math.sin(Math.PI*t);
      for(let j=0;j<across;j++){const a=j/across*Math.PI*2,q=p.clone().addScaledVector(w,Math.cos(a)*width*.5*taper).addScaledVector(b,Math.sin(a)*thickness*.5);positions.push(q.x,q.y,q.z);uvs.push(t,j/across);}
      if(i<segments)for(let j=0;j<across;j++){const a=i*across+j,n=i*across+(j+1)%across;indices.push(a,n,a+across,n,n+across,a+across);}
    }
    for(const end of[0,1]){const p=path.getPointAt(end),center=positions.length/3;positions.push(p.x,p.y,p.z);uvs.push(end,.5);const start=end*segments*across;for(let j=0;j<across;j++){const a=start+j,b=start+(j+1)%across;indices.push(center,end?a:b,end?b:a);}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();return g;
  }
  mesh(chairShell(),white,chair).name='Continuous curved chair shell';
  puffy(.75,.095,.61,white,chair,0,.815,.045);
  for(const side of[-1,1])mesh(chairRibbon([[side*.355,.81,.25],[side*.426,.94,.28],[side*.444,1.09,.21],[side*.44,1.145,-.055],[side*.368,1.14,-.287]],.09,.055),white,chair).name='Swept shell armrest';
  for(let i=0;i<5;i++){
    const a=i*Math.PI*2/5,x=Math.cos(a)*.43,z=Math.sin(a)*.43,axle=new THREE.Vector3(-Math.sin(a),0,Math.cos(a));
    mesh(chairRibbon([[0,.20,0],[x*.46,.18,z*.46],[x,.105,z]],.075,.035,10,8,axle),white,chair);
    cylinder(.025,.025,.07,materials.metal,chair,x,.115,z,12);
    for(const side of[-1,1]){const wheel=cylinder(.052,.052,.027,black,chair,x+axle.x*.019*side,.055,z+axle.z*.019*side,12);wheel.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axle);}
  }
  cylinder(.045,.055,.57,materials.metal,chair,0,.44,0);rounded(.25,.06,.22,.025,black,chair,0,.72,0);
  chair.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});
  const rugMap=canvasMap((c,w,h)=>{c.fillStyle='#bdb6a6';c.fillRect(0,0,w,h);c.fillStyle='#292729';for(let i=0;i<120;i++){const a=i*2.39996,r=25+Math.sqrt(i/120)*205,x=w/2+Math.cos(a)*r,y=h/2+Math.sin(a)*r;c.beginPath();c.ellipse(x,y,9+(i%4)*3,4+i%7,a,0,7);c.fill();}c.strokeStyle='#292729';c.lineWidth=13;c.beginPath();c.arc(w/2,h/2,245,0,7);c.stroke();});
  const rug=mesh(new THREE.CircleGeometry(1.05,64),makeMaterial('#ffffff',1,{map:rugMap}),desk,0,.025,1.22);rug.rotation.x=-Math.PI/2;
  // Violet/cyan hexagonal panels and quiet screen spill, as in the reference.
  for(let i=0;i<8;i++){
    const x=-.92+(i%4)*.43,y=2.82+Math.floor(i/4)*.37;
    const mat=new THREE.MeshBasicMaterial({color:i<4?'#c25de1':'#56afd9',toneMapped:false});
    const hex=mesh(new THREE.CircleGeometry(.235,6),mat,desk,x,y,-.52);hex.rotation.z=Math.PI/6;
  }
  const violet=new THREE.PointLight('#a446ff',1.7,3,2);violet.position.set(0,2.70,-.25);desk.add(violet);
  const blue=new THREE.PointLight('#5baddb',1.1,2.5,2);blue.position.set(0,1.8,.20);desk.add(blue);
  // Headphone stand and small accessories.
  rod([-.99,1.18,-.15],[-.99,1.61,-.15],.013,materials.metal,desk);
  tube([[-1.16,1.52,-.15],[-1.16,1.72,-.15],[-.99,1.81,-.15],[-.82,1.72,-.15],[-.82,1.52,-.15]],.027,black,desk,24);
  for(const x of[-1.16,-.82])puffy(.09,.19,.14,darkCloth,desk,x,1.51,-.15);
  plant(desk,.98,1.18,-.24,.37);
  const wardrobe=group('Timber wardrobe',-3.61,floor,-3.19,-Math.PI/2);
  rounded(2.34,3.32,.79,.025,materials.wood,wardrobe,0,1.66,0);
  for(const x of[-.59,.59]){rounded(1.13,3.21,.045,.01,materials.darkWood,wardrobe,x,1.67,.42);rod([x+(x<0?.4:-.4),1.35,.46],[x+(x<0?.4:-.4),1.88,.46],.016,materials.metal,wardrobe);}
  const shelf=group('Open storage shelf',-3.60,floor,-1.35,-Math.PI/2);
  for(const x of[-.39,.39])box(.065,2.75,.52,materials.darkWood,shelf,x,1.375,0);
  for(let i=0;i<4;i++){box(.85,.06,.55,materials.wood,shelf,0,.18+i*.78,0);cylinder(.10,.08,.18,materials.cream,shelf,-.18,.30+i*.78,0);}
  lamp(shelf,0,2.60,0,.56);
  plant(room,-4.40,floor,-1.42,1.05);plant(room,-10.45,floor,-1.25,1.15);
  // Additional pleated curtains along the bed-side glazing.
  const curtainMat=makeMaterial('#958b7b',.98,{map:fabricMap,side:THREE.DoubleSide});
  for(const z of[-7.60,-1.08]){const geo=new THREE.PlaneGeometry(.72,3.65,32,8),p=geo.attributes.position;
    for(let i=0;i<p.count;i++)p.setZ(i,Math.sin(p.getX(i)*52)*.055);geo.computeVertexNormals();const curtain=mesh(geo,curtainMat,room,-10.96,4.48,z);curtain.rotation.y=Math.PI/2;curtain.castShadow=true;
  }
  // Record furniture bounds before the renderer merges static meshes.
  house.updateMatrixWorld(true);const inv=house.matrixWorld.clone().invert(),bounds={};
  for(const g of [bed,desk,wardrobe,shelf,pc]){const b=new THREE.Box3();g.traverse(o=>{if(!o.isMesh)return;if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();b.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld)));});bounds[g.name]={min:b.min.toArray(),max:b.max.toArray()};}
  room.userData.layout={bed:true,workstation:true,wardrobe:true,chair:true,airConditioner:true,openTerraceDoor:true,bounds,doorClearWidth:2.40,softgoods:{tool:CoastalSoftgoods.provenance.tool,frames:CoastalSoftgoods.provenance.clothFrames,quiltVertices:quilt.attributes.position.count,quiltTriangles:quilt.index.count/3,quiltBounds:{min:quilt.boundingBox.min.toArray(),max:quilt.boundingBox.max.toArray()},pillowVertices:pillowGeometry.attributes.position.count}};
  return {group:room};
}};
