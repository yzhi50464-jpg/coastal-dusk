/* 暮岸 — procedural geometry with locally embedded generated sky/stone assets. */
(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
  } catch (error) { $('loading').hidden = true; $('error').hidden = false; return; }
  const quality=CoastalQuality.create(THREE,renderer);
  if(!quality.capabilities.instancing){$('loading').hidden=true;$('error').hidden=false;$('error-detail').textContent='当前浏览器缺少实例化绘图功能。请更新浏览器，或在其他设备上打开。';return;}
  if(!quality.capabilities.derivatives){$('loading').hidden=true;$('error').hidden=false;$('error-detail').textContent='当前浏览器缺少场景材质所需的图形扩展。请更新浏览器，或在其他设备上打开。';return;}
  renderer.setPixelRatio(quality.pixelRatio());
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  // PCF respects the light's filtering radius, unlike the fixed soft kernel.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset=false;
  $('world').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, .10, 2800);
  const clock = new THREE.Clock();
  let seed = 24617;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const rr = (a, b) => a + rand() * (b - a);
  const clamp = THREE.MathUtils.clamp;
  const state = { time: 31, dusk: .16, wind: .85, paused: matchMedia('(prefers-reduced-motion: reduce)').matches, view: 'deck' };
  const makeMaterial = (color, roughness = .8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, envMapIntensity:.38, ...extra });
  const materials = {};
  const hash2=(x,y)=>{let n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
  function noise2(x,y){const ix=Math.floor(x),iy=Math.floor(y);let u=x-ix,v=y-iy;u=u*u*(3-2*u);v=v*v*(3-2*v);return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash2(ix,iy),hash2(ix+1,iy),u),THREE.MathUtils.lerp(hash2(ix,iy+1),hash2(ix+1,iy+1),u),v);}
  function surfaceTexture(kind){
    const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d'),data=ctx.createImageData(512,512);
    for(let y=0;y<512;y++)for(let x=0;x<512;x++){
      let r,g,b;const grain=hash2(x,y),coarse=noise2(x/57,y/57),fine=noise2(x/8,y/8),n=coarse*.5+fine*.24+grain*.26;
      if(kind==='stone'){
        const vein=Math.pow(1-Math.abs(Math.sin(x*.019+y*.013+coarse*7)),15)*16;
        const moss=Math.max(0,noise2(x/80+60,y/80)-.56)*65;
        r=55+n*64+vein+moss*.3;g=57+n*63+vein+moss*.55;b=57+n*59+vein-moss*.1;
      }else{const weave=((x%4===0)?-13:0)+((y%4===0)?-10:0)+n*20;r=192+weave;g=177+weave;b=150+weave;}
      const i=(y*512+x)*4;data.data[i]=r;data.data[i+1]=g;data.data[i+2]=b;data.data[i+3]=255;
    }ctx.putImageData(data,0,0);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t;
  }

  // Painted textures remain entirely local; there are no downloaded image assets.
  function woodTexture(base, variant) {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 1024;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 1024);
    for (let i = 0; i < 3400; i++) {
      const x = rr(0, 256), y = rr(0, 1024);
      ctx.strokeStyle = `rgba(${rand() > .45 ? '12,6,2' : '245,210,153'},${rr(.012, .075)})`;
      ctx.lineWidth = rr(.15, .85); ctx.beginPath(); ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + rr(-2, 2), y + 35, x + rr(-3, 3), y + 110, x + rr(-2, 2), y + rr(110, 850)); ctx.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const x = rr(20, 235), y = rr(40, 980);
      for (let r = 1; r < 9; r++) { ctx.strokeStyle = `rgba(20,10,3,${.10 - r * .009})`; ctx.beginPath(); ctx.ellipse(x, y, r * 1.4, r * 4.6, .05, 0, Math.PI * 2); ctx.stroke(); }
    }
    const pixels=ctx.getImageData(0,0,256,1024);
    for(let y=0;y<1024;y++)for(let x=0;x<256;x++){
      const i=(y*256+x)*4,weather=(noise2(x/28,y/115)-.5)*10+(hash2(x,y)-.5)*3;
      const pores=Math.pow(noise2(x/3,y/18),7)*7;
      for(let c=0;c<3;c++)pixels.data[i+c]+=weather-pores;
    }ctx.putImageData(pixels,0,0);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(1, variant || 1);
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return texture;
  }
  const woodMap = woodTexture('#ad8052', 1), deckMap = woodTexture('#a37b50', 1);
  deckMap.center.set(.5,.5);
  const stoneMap=surfaceTexture('stone'),fabricMap=surfaceTexture('linen');fabricMap.repeat.set(3,3);
  materials.wood = makeMaterial('#dfc4a2', .74, { map: woodMap, bumpMap: woodMap, bumpScale: .008 });
  materials.darkWood = makeMaterial('#a48b6b', .77, { map: woodMap, bumpMap: woodMap, bumpScale: .009 });
  materials.deck = makeMaterial('#d5b18b', .76, { map: deckMap, bumpMap: deckMap, bumpScale: .006 });
  materials.trim = makeMaterial('#876a4e', .74, { map: woodMap });
  materials.metal = makeMaterial('#302d25', .38, { metalness: .75 });
  materials.cushion = makeMaterial('#fff4df', .96,{map:fabricMap,bumpMap:fabricMap,bumpScale:.016});
  materials.wicker = makeMaterial('#977d55', .88,{map:woodMap,bumpMap:woodMap,bumpScale:.006});
  materials.roof = makeMaterial('#27343c', .78, { metalness: .12 });
  materials.ceramic = makeMaterial('#292e28', .43,{metalness:.45,bumpMap:fabricMap,bumpScale:.006});
  materials.cream = makeMaterial('#ece0c4', .32);
  materials.leaf = makeMaterial('#344638', .95);
  materials.leafLight = makeMaterial('#617050', .96);
  materials.rock = makeMaterial('#c1bab1', .92, {map:stoneMap,bumpMap:stoneMap,bumpScale:.21});
  materials.rockDark = makeMaterial('#8d9496', .57, {map:stoneMap,bumpMap:stoneMap,bumpScale:.17});
  materials.glow = new THREE.MeshBasicMaterial({ color: '#ffd395', toneMapped: false });
  materials.glow.color.multiplyScalar(3.2);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitSphere = new THREE.SphereGeometry(1, 28, 20);
  const shadows = [];
  function mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); (parent || scene).add(m); return m;
  }
  function box(w, h, d, mat, parent, x = 0, y = 0, z = 0, cast = true) {
    if(mat.map===woodMap||mat.map===deckMap){
      const m=rounded(w,h,d,Math.min(.008,Math.min(w,h,d)*.12),mat,parent,x,y,z);m.castShadow=cast;return m;
    }
    const m = mesh(unitBox, mat, parent, x, y, z); m.scale.set(w, h, d); m.castShadow = cast; m.receiveShadow = true; return m;
  }
  function sphere(r, mat, parent, x, y, z, sx = 1, sy = 1, sz = 1) {
    const m = mesh(unitSphere, mat, parent, x, y, z); m.scale.set(r * sx, r * sy, r * sz); m.castShadow = true; return m;
  }
  function cylinder(rt, rb, h, mat, parent, x = 0, y = 0, z = 0, segments = 16) {
    const m = mesh(new THREE.CylinderGeometry(rt, rb, h, segments), mat, parent, x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
  }
  function rod(a, b, radius, mat, parent, segments = 10) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), direction = B.clone().sub(A);
    const m = cylinder(radius, radius, direction.length(), mat, parent, ...A.clone().add(B).multiplyScalar(.5).toArray(), segments);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); return m;
  }
  function tube(points, radius, mat, parent, segments = 40) {
    return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), segments, radius, radius>.035?10:5, false), mat, parent);
  }
  function rounded(w,h,d,r,mat,parent,x=0,y=0,z=0){
    const g=new THREE.BoxGeometry(w,h,d,5,5,5),p=g.attributes.position,n=g.attributes.normal;
    const timberMap=mat.map===woodMap||mat.map===deckMap,uv=g.attributes.uv;
    const sizes=[w,h,d],grainAxis=sizes.indexOf(Math.max(...sizes));
    const offsetU=hash2(x*4.3+z*.7,y+3.1),offsetV=hash2(z*5.1+x*.9,y+7.6);
    for(let i=0;i<p.count;i++){
      const v=new THREE.Vector3().fromBufferAttribute(p,i);
      if(timberMap){
        // Meter-based UVs follow each member's length, including horizontal
        // beams. Stable offsets avoid repeating the same knots on every plank.
        const face=[Math.abs(n.getX(i)),Math.abs(n.getY(i)),Math.abs(n.getZ(i))];
        const faceAxis=face.indexOf(Math.max(...face));
        const across=faceAxis===grainAxis?(grainAxis+1)%3:[0,1,2].find(axis=>axis!==grainAxis&&axis!==faceAxis);
        const along=faceAxis===grainAxis?(grainAxis+2)%3:grainAxis;
        uv.setXY(i,v.getComponent(across)/1.3+offsetU,v.getComponent(along)/2.5+offsetV);
      }
      for(let axis=0;axis<3;axis++){
        const half=[w,h,d][axis]/2,rr=Math.min(r,half*.95),q=Math.round((v.getComponent(axis)/[w,h,d][axis]+.5)*5);
        v.setComponent(axis,[-half,-half+rr*.3,-half+rr,half-rr,half-rr*.3,half][q]);
      }
      const core=new THREE.Vector3(clamp(v.x,-w/2+r,w/2-r),clamp(v.y,-h/2+r,h/2-r),clamp(v.z,-d/2+r,d/2-r)),normal=v.clone().sub(core).normalize();
      v.copy(core).addScaledVector(normal,r);p.setXYZ(i,v.x,v.y,v.z);n.setXYZ(i,normal.x,normal.y,normal.z);
    }const m=mesh(g,mat,parent,x,y,z);m.castShadow=true;m.receiveShadow=true;return m;
  }
  function puffy(w,h,d,mat,parent,x,y,z){
    const g=new THREE.SphereGeometry(1,36,24),p=g.attributes.position;
    for(let i=0;i<p.count;i++)for(let axis=0;axis<3;axis++){const v=p.getComponent(i,axis);p.setComponent(i,axis,Math.sign(v)*Math.pow(Math.abs(v),.42)*[w,h,d][axis]/2);}
    g.computeVertexNormals();const m=mesh(g,mat,parent,x,y,z);m.castShadow=m.receiveShadow=true;return m;
  }
  // Small real edge radii catch broad highlights without adding an outline.
  function timber(w,h,d,mat,parent,x=0,y=0,z=0){
    return rounded(w,h,d,Math.min(.035,Math.min(w,h,d)*.18),mat,parent,x,y,z);
  }
  function timberBrace(a,b,w,d,mat,parent){
    const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),direction=B.clone().sub(A);
    const m=timber(w,direction.length(),d,mat,parent,...A.clone().add(B).multiplyScalar(.5).toArray());
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return m;
  }

  const textureLoader=new THREE.TextureLoader();
  const [nature,reef]=await Promise.all([CoastalNature.prepare(THREE,renderer),CoastalReef.prepare(THREE,renderer)]);
  const [skyAsset,rockAsset,woodAsset]=await Promise.all([
    textureLoader.loadAsync(window.CoastalAssets.sky),textureLoader.loadAsync(window.CoastalAssets.rock),textureLoader.loadAsync(window.CoastalAssets.wood)
  ]);
  for(const texture of[skyAsset,rockAsset]){
    texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  }
  skyAsset.wrapS=THREE.RepeatWrapping;
  rockAsset.wrapS=rockAsset.wrapT=THREE.RepeatWrapping;
  materials.rockAsset=rockAsset;
  // Preserve the deterministic construction seed: the original procedural
  // texture calls above still run, but the final timber surface uses this asset.
  for(const texture of[woodMap,deckMap]){texture.image=woodAsset.image;texture.needsUpdate=true;}
  materials.wood.bumpScale=.012;materials.darkWood.bumpScale=.014;materials.deck.bumpScale=.009;
  const atmosphereUniforms = { uTime: { value: 0 }, uNight: { value: state.dusk },uSkyTexture:{value:skyAsset} };
  const noiseGLSL = `
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*noise(p);p=p*2.03+13.1;a*=.5;}return s;}
    uniform sampler2D uSkyTexture;
    vec3 proceduralSkyColor(vec3 d,float night){
      float h=max(d.y,0.);float glow=pow(max(0.,dot(normalize(vec3(.64,.035,-.77)),d)),4.);
      vec3 horizon=mix(vec3(.16,.072,.10),vec3(.014,.022,.05),night);
      vec3 middle=mix(vec3(.060,.092,.19),vec3(.012,.019,.05),night);
      vec3 top=mix(vec3(.025,.065,.18),vec3(.005,.012,.035),night);
      vec3 col=mix(horizon,middle,smoothstep(0.,.22,h));col=mix(col,top,smoothstep(.16,.65,h));
      float band=exp(-pow((h-.045)/.085,2.));
      col+=vec3(.88,.135,.010)*band*(.25+.75*glow)*(1.-night)*1.05;
      col+=vec3(.15,.035,.025)*exp(-pow((h-.16)/.08,2.))*(1.-night);
      col*=mix(vec3(1.),vec3(1.,.82,.45),glow*band*(1.-night));
      col=mix(mix(vec3(.10,.065,.11),vec3(.014,.022,.05),night),col,smoothstep(0.,.018,h));return col;
    }
    vec3 skyColor(vec3 d,float night){
      float azimuth=atan(sin(atan(d.x,-d.z)-.6947),cos(atan(d.x,-d.z)-.6947));
      // The generated sky is visually a broad photographic panorama, not a
      // calibrated HDRI. Fit its cloud scale and gradient to the reference view.
      float u=clamp(.5+azimuth/3.14159265,.001,.999);
      float elevation=asin(clamp(d.y,-1.,1.));
      float v=clamp(.445+elevation*1.12,0.,1.);
      vec3 photographed=texture2D(uSkyTexture,vec2(u,v)).rgb*.72;
      photographed=mix(vec3(dot(photographed,vec3(.2126,.7152,.0722))),photographed,.86);
      float darkness=clamp((night-.16)/.84,0.,1.);
      photographed*=mix(vec3(1.),vec3(.10,.15,.23),darkness);
      float photoMask=(1.-smoothstep(1.12,1.55,abs(azimuth)))*(1.-smoothstep(.45,.64,elevation));
      return mix(proceduralSkyColor(d,night),mix(photographed,proceduralSkyColor(d,night),darkness*.15),photoMask);
    }`;
  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: atmosphereUniforms,
    vertexShader: 'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 vDir;uniform float uTime,uNight;${noiseGLSL}
      void main(){vec3 d=normalize(vDir);vec3 col=skyColor(d,uNight);
      gl_FragColor=vec4(col,1.);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace('1.);#include', '1.);\n#include') });
  mesh(new THREE.SphereGeometry(1800, 48, 24), skyMat);
  const starPositions = [];
  for (let i = 0; i < 520; i++) { const a = rr(0, Math.PI * 2), h = rr(.22, 1), r = Math.sqrt(1 - h * h) * 1600; starPositions.push(Math.cos(a) * r, h * 1600, Math.sin(a) * r); }
  const starsGeo = new THREE.BufferGeometry(); starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const starsMat = new THREE.PointsMaterial({ color: '#e5eaff', size: 1.35, sizeAttenuation: false, transparent: true, opacity: .08, depthWrite: false });
  scene.add(new THREE.Points(starsGeo, starsMat));
  // At this point the scene contains only the sky and faint stars. Capture that
  // exact orientation for material lighting, matching water and glazing.
  const environmentBackdrop=new Set(scene.children);
  function rebuildEnvironment(){
    if(!quality.capabilities.hdr){scene.environment=null;return;}
    const previous=scene.environment;scene.environment=null;
    const visibility=scene.children.map(object=>[object,object.visible]);for(const [object] of visibility)if(!environmentBackdrop.has(object))object.visible=false;
    const pmrem=new THREE.PMREMGenerator(renderer);
    try{scene.environment=pmrem.fromScene(scene,.06,.1,2800).texture;}finally{for(const [object,visible] of visibility)object.visible=visible;pmrem.dispose();if(previous)previous.dispose();}
  }
  rebuildEnvironment();
  const hemi = new THREE.HemisphereLight('#7898ca', '#50402c', .85); scene.add(hemi);
  const sunset = new THREE.DirectionalLight('#cbb6ac', .20); sunset.position.set(60, 12, -75); scene.add(sunset);
  sunset.castShadow = true; sunset.shadow.mapSize.set(2048, 2048);
  Object.assign(sunset.shadow.camera, { left: -27, right: 27, top: 24, bottom: -24, near: 1, far: 130 });
  sunset.shadow.bias = -.0003; sunset.shadow.normalBias = .025;sunset.shadow.radius=3;
  const coolFill = new THREE.DirectionalLight('#8ba6d0', .38); coolFill.position.set(-20, 28, 18); scene.add(coolFill);
  const warmLights = [], glows = [];
  const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 128;
  const gc = glowCanvas.getContext('2d'), grad = gc.createRadialGradient(64,64,0,64,64,64);
  grad.addColorStop(0,'rgba(255,217,154,1)');grad.addColorStop(.12,'rgba(255,191,100,.65)');grad.addColorStop(.4,'rgba(255,151,57,.12)');grad.addColorStop(1,'rgba(255,130,30,0)');gc.fillStyle=grad;gc.fillRect(0,0,128,128);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  function halo(parent, x, y, z, size = 1.2, opacity = .5) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: '#ffe0ab', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity, toneMapped: false }));
    sp.position.set(x,y,z);sp.scale.setScalar(size);parent.add(sp);glows.push(sp);return sp;
  }
  function warmLight(parent,x,y,z,intensity=15,distance=8,shadow=false) {
    const l=new THREE.PointLight('#ffb65e',intensity,distance,2);l.position.set(x,y,z);parent.add(l);l.castShadow=shadow;
    if(shadow){l.shadow.mapSize.set(1024,1024);l.shadow.bias=-.0005;l.shadow.normalBias=.012;l.shadow.radius=4;}warmLights.push({ light:l,base:intensity });return l;
  }

  // The sea, geology and fine coastal vegetation are independent procedural systems.
  const ocean=CoastalOcean.create({THREE,scene,timeUniform:atmosphereUniforms.uTime,nightUniform:atmosphereUniforms.uNight,wind:state.wind,skyGLSL:noiseGLSL,skyTexture:skyAsset});
  const water=ocean.mesh,waterUniforms=ocean.uniforms;
  const terrain=CoastalTerrain.create({THREE,scene,rand,rr,noise2,materials,reef});
  const {shoreEdge,landHeight}=terrain;
  const foamRocks=terrain.foamRocks;
  foamRocks.slice(0,32).forEach((v,i)=>waterUniforms.uRocks.value[i].copy(v));
  waterUniforms.uShoreMap.value=terrain.shoreField.texture;
  waterUniforms.uShoreBounds.value.copy(terrain.shoreField.bounds);
  // Layered, forested headlands rise continuously from a winding coast.
  function headland(cx,cz,width,depth,height){
    const front=x=>cz+depth*.5+Math.sin(x*.018)*depth*.10+
      Math.sin(x*.069+1.8)*depth*.045+Math.sin(x*.153)*depth*.018;
    const elevation=(x,z)=>{
      const t=clamp((front(x)-z)/depth,0,1),nx=clamp((x-cx)/width+.5,0,1);
      const ridge=Math.pow(Math.sin(Math.PI*t),.62),envelope=Math.pow(Math.sin(nx*Math.PI),cz>-250&&width>100?.72:.92);
      const spurs=.49+.36*noise2(x*.036,z*.043)+.15*noise2(x*.11,z*.13);
      const shoulders=.78+.14*Math.sin(nx*12+.8)+.08*Math.sin(nx*29+1.6)+.035*Math.sin(nx*73);
      return envelope*height*ridge*spurs*shoulders;
    };
    const geo=new THREE.PlaneGeometry(1,1,360,64);geo.rotateX(-Math.PI/2);const p=geo.attributes.position,colors=[];
    for(let i=0;i<p.count;i++){const x=cx+p.getX(i)*width,t=.5-p.getZ(i),z=front(x)-t*depth,y=elevation(x,z)-.18;p.setXYZ(i,x,y,z);const n=noise2(x*.13,z*.15)*.65+noise2(x*.61,z*.61)*.35,c=new THREE.Color().setHSL(.28+n*.06,.20,.12+n*.11);colors.push(c.r,c.g,c.b);}
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
    const hillMaterial=makeMaterial(cz<-250?'#a9b8c8':'#8b969b',.96,{vertexColors:true,emissive:cz<-250?'#435767':'#40535a',emissiveIntensity:cz<-250?.24:.025});
    hillMaterial.onBeforeCompile=shader=>{
      shader.uniforms.uCoastNight=atmosphereUniforms.uNight;
      shader.vertexShader='varying vec3 hillNormal;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nhillNormal=normal;');
      shader.fragmentShader='varying vec3 hillNormal;uniform float uCoastNight;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
        // Diffuse sky fill retains forest colors and shaded spurs at dusk.
        float skyFill=.09+.18*max(0.,dot(normalize(hillNormal),normalize(vec3(-.5,.6,.4))));
        totalEmissiveRadiance+=diffuseColor.rgb*skyFill*(1.-uCoastNight*.85);`);
    };
    hillMaterial.customProgramCacheKey=()=> 'coastal-forest-spurs-5';
    const land=mesh(geo,hillMaterial,scene);land.name='Forested headland';land.userData.coast={center:[cx,cz],width,depth,height};
    if(cz>-250&&width>100){
      // Only a distant canopy contour: one small batch, no individual leaf cards
      // or extra shadows. Its own hash preserves every existing scene position.
      const crowns=[],dummy=new THREE.Object3D(),color=new THREE.Color();
      for(let x=cx-width*.34;x<cx+width*.485;x+=1.8){
        const q=(x-cx)/width+.5,seed=hash2(x,13.1);
        if(q>.95&&seed>.22)continue;
        const px=x+(hash2(x,17)-.5)*.9;
        // A single crest line, not scattered balls on the visible front slope.
        let pz=front(px)-depth*.5,ground=-Infinity;
        for(let j=0;j<=14;j++){const z=front(px)-depth*(.28+j*.03),y=elevation(px,z)-.18;if(y>ground){ground=y;pz=z;}}
        const h=.42+seed*.64;
        if(ground<1.5)continue;
        crowns.push({x:px,y:ground-.12,z:pz,h,r:.65+hash2(x,31)*.65,shade:hash2(x,43)});
      }
      // Share the hillside's diffuse sky fill: separate dark materials made
      // these tiny distant crowns read as black beads rather than forest.
      const forest=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),hillMaterial,crowns.length);
      forest.name='Headland canopy silhouette';
      crowns.forEach((c,i)=>{dummy.position.set(c.x,c.y,c.z);dummy.rotation.set(.1*c.shade,c.shade*6.283,.13*c.shade);dummy.scale.set(c.r,c.h*.52,c.r*.78);dummy.updateMatrix();forest.setMatrixAt(i,dummy.matrix);const n=noise2(c.x*.13,c.z*.15)*.65+noise2(c.x*.61,c.z*.61)*.35;color.setHSL(.28+n*.06,.20,.12+n*.11);forest.setColorAt(i,color);});
      forest.castShadow=false;forest.receiveShadow=false;forest.computeBoundingSphere();scene.add(forest);
      scene.userData.headlandForest={crowns:crowns.length,triangles:crowns.length*20,drawCalls:1};
    }
    return elevation;
  }
  const coastHeight=headland(-150,-180,360,120,65);headland(-310,-340,740,120,54);headland(600,-330,65,35,5);headland(950,-420,80,45,6);
  const villageGlow=new THREE.MeshBasicMaterial({color:'#eab369',toneMapped:false});villageGlow.color.multiplyScalar(1.3);
  const villageWalls=['#b0aba0','#8f9da0'].map(c=>makeMaterial(c,.95,{emissive:'#3c4650',emissiveIntensity:.17}));
  const villageRoof=makeMaterial('#48535e',.9,{emissive:'#3c4650',emissiveIntensity:.08});
  const villageShape=new THREE.Shape();villageShape.moveTo(-.5,0);villageShape.lineTo(.5,0);villageShape.lineTo(0,.35);villageShape.closePath();
  const villageRoofGeo=new THREE.ExtrudeGeometry(villageShape,{depth:1,bevelEnabled:false});villageRoofGeo.translate(0,0,-.5);
  for(let i=0;i<60;i++){
    const x=rr(-110,20),z=-151+rr(-14,9),ground=coastHeight(x,z)-.18;
    if(i%3===0){
      const w=rr(1.4,2.6),h=rr(.9,1.7),d=rr(1.2,1.8);
      box(w,h,d,villageWalls[i%2],scene,x,ground+h/2,z,false);
      mesh(villageRoofGeo,villageRoof,scene,x,ground+h,z).scale.set(w+.18,1,d+.18);
      for(const side of[-1,1]){
        const xx=x+side*w*.24,y=ground+h*.58,zz=z+d/2+.012;
        box(.19,.22,.025,villageGlow,scene,xx,y,zz,false);halo(scene,xx,y,zz,.42,.16);
      }
    }else{
      box(.09,.10,.08,villageGlow,scene,x,ground+.16,z,false);halo(scene,x,ground+.16,z,.32,.16);
    }
  }
  for(const x of [560,612,930,980]){halo(scene,x,1,-380,1.8,.6);box(.32,.2,.2,materials.glow,scene,x,1,-380,false);}

  const cabin=new THREE.Group();scene.add(cabin);
  const deckY=2.45;
  // Supporting posts and individually laid deck planks.
  box(6.6,.32,12.7,materials.trim,cabin,-8.2,deckY-.27,4.85);
  const plankMats=Array.from({length:9},(_,i)=>{const m=materials.deck.clone();m.color.setHSL(.081+rr(-.008,.008),.21+rr(0,.08),.40+rr(-.04,.05));return m;});
  for(let row=0;row<21;row++){
    const x=-11.35+row*.309;let z=-1.5;
    while(z<11.19){const len=Math.min(rr(2.3,4.8),11.2-z);if(len<.025)break;
      rounded(.304,.15,len-.006,.006,plankMats[(row+Math.floor(z+2))%9],cabin,x,deckY,z+len/2);
      for(const zz of [z+.065,z+len-.065])for(const xx of [x-.085,x+.085])cylinder(.0055,.0055,.002,materials.metal,cabin,xx,deckY+.077,zz,6);
      z+=len;
    }
  }
  for(const x of [-11.2,-8.2,-5.15])for(const z of [-.9,3.9,11.0])timber(.3,3.2,.32,materials.darkWood,cabin,x,.7,z);
  timber(6.6,.3,.22,materials.darkWood,cabin,-8.2,2.05,11.19);
  timber(.22,.3,12.7,materials.darkWood,cabin,-4.95,2.05,4.85);
  // A few supporting knees and recessed joists give the platform real depth.
  for(const z of [1.2,4.0,6.8])timber(6.5,.22,.15,materials.darkWood,cabin,-8.2,1.91,z);
  for(const x of [-11.2,-8.2,-5.15]){
    const direction=x< -6?1:-1;
    timberBrace([x,.98,11],[x+direction*.88,1.92,11],.13,.15,materials.darkWood,cabin);
    timber(.46,.10,.43,materials.trim,cabin,x,1.78,11);
  }
  for(const z of [3.9,11])timberBrace([-5.15,.98,z],[-5.15,1.92,z-.82],.13,.15,materials.darkWood,cabin);
  const house=new THREE.Group();house.name="Glazed shore cabin";house.rotation.y=Math.PI/2;house.position.set(-10.6,0,-2.9);cabin.add(house);
  // Interior timber retains its grain at a lower contrast than the weathered deck.
  materials.interiorWood=materials.wood.clone();materials.interiorWood.roughness=.91;materials.interiorWood.bumpScale=.003;
  materials.interiorWood.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, diffuse * vec3(0.29,0.17,0.085),0.30);');};
  materials.interiorWood.customProgramCacheKey=()=> 'interior-muted-cedar-v1';
  // Sheltered beams and sills are worn smooth, unlike exposed deck boards.
  // Keep their grain/color and real edge radii without centimeter-high relief.
  const shelteredWood=materials.wood.clone(),shelteredDarkWood=materials.darkWood.clone();
  shelteredWood.name='Smooth sheltered cedar';shelteredWood.roughness=.84;shelteredWood.bumpScale=.0045;
  shelteredDarkWood.name='Smooth sheltered dark cedar';shelteredDarkWood.roughness=.86;shelteredDarkWood.bumpScale=.005;
  // Cabin interior: reference-led sea-view bedroom and workstation.
  box(8.2,.24,7.6,materials.wood,house,-7,deckY,-4.45);
  const plaster=makeMaterial('#b5a28b',.97);
  box(8.1,4.3,.18,plaster,house,-7,4.63,-8.2);
  // The mountain-facing wall has a real exterior skin; the existing plaster
  // remains the room's interior backing, with furniture/clearances untouched.
  const rearSidingMats=[.96,1,1.035].map((t,i)=>{const m=shelteredWood.clone();m.name='Rear cedar siding '+i;m.color.multiplyScalar(t);return m;});
  const rearSkin=new THREE.Group();rearSkin.name='Mountain-facing timber envelope';house.add(rearSkin);
  for(let i=0;i<31;i++){
    const x=-10.90+i*.26;
    timber(.252,4.14,.13,rearSidingMats[i%3],rearSkin,x,4.71,-8.345);
  }
  for(const x of [-11.06,-2.94])timber(.19,4.36,.21,shelteredDarkWood,rearSkin,x,4.68,-8.36);
  timber(8.31,.19,.23,shelteredDarkWood,rearSkin,-7,2.73,-8.38);
  timber(8.31,.20,.23,shelteredDarkWood,rearSkin,-7,6.77,-8.38);
  for(const [x,side]of[[-10.95,1],[-3.05,-1]])timberBrace([x,6.18,-8.40],[x+side*.46,6.68,-8.40],.09,.10,shelteredDarkWood,rearSkin);
  box(.17,.76,7.8,materials.wood,house,-11.12,2.95,-4.4);
  const ceiling=box(8.2,.2,7.6,materials.interiorWood,house,-7,6.85,-4.45);ceiling.userData.cutaway=true;
  // Vertical timber siding flanks the glazing.
  for(let i=0;i<30;i++){const x=-10.94+i*.27;if(x+.131> -8.20&&x-.131< -5.72)continue;box(.262,.74,.16,materials.wood,house,x,2.95,-.57);}
  for(let i=0;i<28;i++)box(.16,.75,.265,materials.wood,house,-2.88,2.95,-8.08+i*.27);
  // Local environment reflections preserve the sea, sky and nearby timber in
  // the glazing. Reflection increases naturally at grazing viewing angles.
  const glazing=[],glassTarget=new THREE.WebGLCubeRenderTarget(quality.current().reflection,{
    type:quality.capabilities.hdr?THREE.HalfFloatType:THREE.UnsignedByteType,
    generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter
  });
  glassTarget.texture.colorSpace=THREE.LinearSRGBColorSpace;
  const glassCamera=new THREE.CubeCamera(.15,2000,glassTarget);
  glassCamera.position.set(-9.8,4.86,4.1);scene.add(glassCamera);
  const glassMat=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,
    uniforms:{environment:{value:glassTarget.texture}},
    vertexShader:`varying vec3 glassWorld,glassNormal;
      void main(){vec4 world=modelMatrix*vec4(position,1.);glassWorld=world.xyz;
        glassNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader:`uniform samplerCube environment;varying vec3 glassWorld,glassNormal;
      void main(){vec3 view=normalize(cameraPosition-glassWorld),n=normalize(glassNormal);
        if(dot(n,view)<0.)n=-n;
        float facing=max(0.,dot(n,view));
        float fresnel=.045+.59*pow(1.-facing,5.);
        vec3 reflected=textureCube(environment,reflect(-view,n),.45).rgb;
        gl_FragColor=vec4(reflected*vec3(.96,.985,1.),min(.64,fresnel));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  function windowPane(x,y,z,w,h,angle=0){
    const pane=mesh(new THREE.PlaneGeometry(w,h),glassMat,house,x,y,z);
    pane.rotation.y=angle;pane.name='Sea-reflecting glazing';glazing.push(pane);return pane;
  }
  let glassCapturedDusk=-1,glassCapturedAt=-Infinity,glassCaptures=0;
  function refreshGlazing(){
    const now=performance.now();
    if(glassCapturedDusk>=0&&(Math.abs(state.dusk-glassCapturedDusk)<.025||now-glassCapturedAt<350))return;
    const previousTarget=renderer.getRenderTarget(),tone=renderer.toneMapping,output=renderer.outputColorSpace;
    glazing.forEach(p=>p.visible=false);
    try{
      renderer.toneMapping=THREE.NoToneMapping;renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
      glassCamera.update(renderer,scene);glassCapturedDusk=state.dusk;glassCapturedAt=now;glassCaptures++;
    }finally{
      glazing.forEach(p=>p.visible=true);renderer.toneMapping=tone;renderer.outputColorSpace=output;
      renderer.setRenderTarget(previousTarget);
    }
  }
  for(const z of [-8.15,-5.62,-3.08,-.5])timber(.22,4.5,.16,materials.trim,house,-11.12,4.7,z);
  for(const z of [-6.86,-4.33,-1.80])windowPane(-11.13,4.86,z,2.36,3.25,Math.PI/2);
  timber(.25,.23,7.9,shelteredDarkWood,house,-11.12,6.85,-4.4);
  timber(.21,.12,7.8,shelteredDarkWood,house,-11.12,3.34,-4.4);
  for(const x of [-10.98,-8.30,-5.62,-2.94])timber(.16,4.5,.22,materials.trim,house,x,4.7,-.5);
  for(const z of [-8.15,-5.62,-3.08,-.5])timber(.22,4.5,.16,materials.trim,house,-2.92,4.7,z);
  timber(8.3,.23,.25,shelteredDarkWood,house,-7,6.85,-.5);
  timber(.25,.23,7.9,shelteredDarkWood,house,-2.92,6.85,-4.4);
  for(const x of [-9.64,-4.28])windowPane(x,4.86,-.52,2.5,3.25);
  for(const z of [-6.86,-4.33,-1.80])windowPane(-2.91,4.86,z,2.36,3.25,Math.PI/2);
  for(const x of [-9.64,-4.28])timber(2.5,.12,.21,shelteredDarkWood,house,x,3.34,-.5);
  timber(.21,.12,7.8,shelteredDarkWood,house,-2.9,3.34,-4.4);
  // Fine inner glazing stops create recessed, softly lit frame edges.
  const revealWood=materials.trim.clone();revealWood.color.multiplyScalar(.86);
  for(const x of [-9.64,-6.96,-4.28]){
    for(const edge of [-1,1])timber(.035,3.12,.075,revealWood,house,x+edge*1.22,4.87,-.60);
    for(const y of [3.35,6.43]){if(x===-6.96&&y===3.35)continue;timber(2.46,.045,.075,materials.wood,house,x,y,-.60);}
  }
  for(const side of [-11.12,-2.92])for(const z of [-6.86,-4.33,-1.80]){
    for(const edge of [-1,1])timber(.075,3.12,.035,revealWood,house,side+(side< -7?.07:-.07),4.87,z+edge*1.14);
    for(const y of [3.35,6.43])timber(.075,.045,2.30,materials.wood,house,side+(side< -7?.07:-.07),y,z);
  }
  const curtainMat=makeMaterial('#c1c5ca',.98,{map:fabricMap,bumpMap:fabricMap,bumpScale:.009,side:THREE.DoubleSide});
  rod([-10.97,6.63,-.80],[-3.04,6.63,-.80],.025,materials.metal,house);
  for(const x of [-10.57,-3.44]){
    const g=new THREE.PlaneGeometry(.70,3.80,40,24),p=g.attributes.position;
    for(let i=0;i<p.count;i++){const xx=p.getX(i),yy=p.getY(i);p.setZ(i,Math.sin(xx*47+Math.sin(yy)*.15)*.060+.009*Math.cos(yy*5+xx*7));}g.computeVertexNormals();
    const curtain=mesh(g,curtainMat,house,x,4.63,-.81);curtain.castShadow=true;curtain.receiveShadow=true;
  }
  // Ridge follows the glazed terrace wall; the gable faces the approach.
  const roofPivot=new THREE.Group(),roofParts=new THREE.Group();
  roofPivot.userData.cutaway=true;
  roofPivot.position.set(-7,0,-4.35);roofPivot.rotation.y=-Math.PI/2;
  roofParts.position.set(7,0,4.35);roofPivot.add(roofParts);house.add(roofPivot);
  // Front triangular gable, planked infill and rafters.
  const triangle=new THREE.Shape();triangle.moveTo(-4.25,0);triangle.lineTo(4.25,0);triangle.lineTo(0,2.2);triangle.closePath();
  mesh(new THREE.ShapeGeometry(triangle),materials.wood,roofParts,-7,6.9,-.48);
  for(let i=-14;i<=14;i++){const x=i*.28,h=2.16-Math.abs(x)*.515;if(h>0)box(.268,h,.08,materials.wood,roofParts,-7+x,6.9+h*.5,-.40);}
  timberBrace([-11.4,6.82,-.28],[-7,9.13,-.28],.23,.22,shelteredDarkWood,roofParts);
  timberBrace([-7,9.13,-.28],[-2.6,6.82,-.28],.23,.22,shelteredDarkWood,roofParts);
  timber(.18,2.2,.18,shelteredDarkWood,roofParts,-7,8,-.3);
  timber(8.40,.10,.15,shelteredWood,roofParts,-7,6.68,-.32);
  // Close the far gable as well as the approach gable. All of these parts are
  // under roofPivot, so the existing roof-cutaway still removes them together.
  const rearGable=new THREE.Group();rearGable.name='Closed rear timber gable';roofParts.add(rearGable);
  const rearGableBacking=mesh(new THREE.ShapeGeometry(triangle),rearSidingMats[1],rearGable,-7,6.9,-8.22);rearGableBacking.rotation.y=Math.PI;
  for(let i=-14;i<=14;i++){
    const x=i*.28,h=2.16-Math.abs(x)*.515;
    if(h>0)box(.268,h,.08,rearSidingMats[(i+15)%3],rearGable,-7+x,6.9+h*.5,-8.28);
  }
  timberBrace([-11.4,6.82,-8.40],[-7,9.13,-8.40],.23,.22,shelteredDarkWood,rearGable);
  timberBrace([-7,9.13,-8.40],[-2.6,6.82,-8.40],.23,.22,shelteredDarkWood,rearGable);
  timber(.18,2.2,.18,shelteredDarkWood,rearGable,-7,8,-8.41);
  timber(8.40,.10,.15,shelteredWood,rearGable,-7,6.68,-8.39);
  // A small shaded louver is geometry, not a black decal or a new light.
  const rearVentWood=shelteredDarkWood.clone();rearVentWood.name='Rear gable louver dark recess';rearVentWood.color.multiplyScalar(.34);
  box(.94,.54,.055,rearVentWood,rearGable,-7,7.86,-8.45);
  for(const x of[-7.52,-6.48])timber(.07,.68,.11,shelteredWood,rearGable,x,7.86,-8.49);
  for(const y of[7.55,8.17])timber(1.10,.07,.11,shelteredWood,rearGable,-7,y,-8.49);
  for(let i=0;i<5;i++){const blade=timber(.94,.045,.14,shelteredWood,rearGable,-7,7.62+i*.12,-8.51);blade.rotation.x=-.28;}
  for(const [x,sign] of [[-10.98,1],[-2.94,-1]]){
    timberBrace([x,6.23,-.32],[x+sign*.40,6.70,-.32],.095,.12,shelteredDarkWood,roofParts);
    timber(.23,.20,.045,shelteredWood,roofParts,x,6.72,-.24);
  }
  // Small overlapping curved ceramic tiles, with individual lips and ridge caps.
  const tileMats=Array.from({length:5},(_,i)=>makeMaterial(new THREE.Color('#657d91').multiplyScalar(.94+i*.025),.65,{bumpMap:stoneMap,bumpScale:.007,envMapIntensity:1.1}));
  const tileGeo=new THREE.PlaneGeometry(.68,.375,4,12);tileGeo.rotateX(-Math.PI/2);
  const tp=tileGeo.attributes.position;
  for(let i=0;i<tp.count;i++){const x=tp.getX(i),z=tp.getZ(i);tp.setY(i,.12+.040*(1-Math.pow(z/.1875,2))+.017*(x/.68+.5));}tileGeo.computeVertexNormals();
  for(const side of [-1,1]){
    const roof=new THREE.Group();roof.position.set(-7+side*2.22,8.02,-4.35);roof.rotation.z=-side*.472; roofParts.add(roof);
    box(5,.16,9.6,materials.roof,roof);
    for(let row=0;row<8;row++)for(let col=0;col<25;col++){
      const tile=mesh(tileGeo,tileMats[(row*7+col*3+(side+1))%5],roof,-2.2+row*.61,rr(-.002,.002),-4.6+col*.38);
      tile.castShadow=true;tile.receiveShadow=true;if(side<0)tile.rotation.y=Math.PI;
    }
    timber(5.1,.27,.15,shelteredDarkWood,roof,0,-.08,4.78);
    timber(5.1,.27,.15,shelteredDarkWood,roof,0,-.08,-4.78);
    timber(.18,.22,9.6,shelteredDarkWood,roof,side*2.46,-.1,0);
    // A narrow lower fascia and a sheltered soffit soften the roof silhouette.
    timber(5.12,.065,.08,shelteredWood,roof,0,-.235,4.80);
    timber(5.12,.065,.08,shelteredWood,roof,0,-.235,-4.80);
    timber(.08,.065,9.6,shelteredWood,roof,side*2.48,-.235,0);
    timber(.44,.05,9.30,shelteredWood,roof,side*2.15,-.18,0);
    for(let i=0;i<9;i++)timber(5.1,.16,.12,shelteredDarkWood,roof,0,-.25,-4.3+i*1.08);
  }
  for(let i=0;i<25;i++){
    const cap=mesh(new THREE.CylinderGeometry(.20,.20,.41,12,1,true,Math.PI/2,Math.PI),tileMats[i%5],roofParts,-7,9.13,-8.94+i*.38);cap.rotation.x=Math.PI/2;cap.castShadow=true;cap.receiveShadow=true;
  }
  house.updateWorldMatrix(true,true);
  const rearWallBounds=new THREE.Box3().setFromObject(rearSkin),rearGableBounds=new THREE.Box3().setFromObject(rearGable);
  scene.userData.rearArchitecture={sidingBoards:31,rearGableBoards:29,louverBlades:5,negativeEndFascias:4,
    wallBounds:{min:rearWallBounds.min.toArray(),max:rearWallBounds.max.toArray()},gableBounds:{min:rearGableBounds.min.toArray(),max:rearGableBounds.max.toArray()}};
  // Preserve the exterior random sequence when replacing the former lounge.
  for(let i=0;i<75;i++)rand();
  const interior=CoastalInterior.create({THREE,house,materials,makeMaterial,mesh,box,rounded,puffy,cylinder,sphere,rod,tube,warmLight,halo,fabricMap,nature});
  const pendant=new THREE.Group();pendant.userData.cutaway=true;house.add(pendant);
  rod([-6.5,6.6,-6.1],[-6.5,6.28,-6.1],.018,materials.metal,pendant);
  cylinder(.17,.43,.28,materials.cream,pendant,-6.5,6.14,-6.1,32).castShadow=false;sphere(.11,materials.glow,pendant,-6.5,5.98,-6.1).castShadow=false;halo(pendant,-6.5,5.97,-6.1,1,.19);
  // Keep curved cloth receiving contact shadows without grazing-angle self-shadow bands.
  const bedroomKey=new THREE.SpotLight('#ffd0a0',22,12,1.20,.65,2);bedroomKey.position.set(-6.5,5.94,-6.1);bedroomKey.target.position.set(-6.8,2.6,-4.9);house.add(bedroomKey,bedroomKey.target);bedroomKey.castShadow=true;bedroomKey.shadow.mapSize.set(2048,2048);bedroomKey.shadow.bias=-.001;bedroomKey.shadow.normalBias=.035;bedroomKey.shadow.radius=7;warmLights.push({light:bedroomKey,base:22});
  warmLight(house,-9.6,4.4,-6.5,5,5).color.set('#ffce98');
  // Weak wall bounce distributes the room's warmth beyond the pendant hotspot.
  warmLight(house,-4.5,4.5,-6.5,2.2,6.5).color.set('#d7b58e');
  // Light spilling from the room and wall sconces gives the deck its amber pools.
  warmLight(house,-8.5,3.4,-.05,5.5,4.5);
  warmLight(cabin,-8.3,4.2,6.7,2.5,5.5);
  // A small ceiling bounce lifts sheltered timber without washing the terrace.
  warmLight(house,-8.2,6.20,.18,2.2,4.8);

  function lantern(parent,x,y,z,scale=1,light=true,power=16,shadow=false){
    const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(scale);parent.add(g);
    box(.44,.06,.44,materials.metal,g,0,.03,0);box(.43,.06,.43,materials.metal,g,0,.66,0);
    for(const a of [-.19,.19])for(const b of [-.19,.19])box(.035,.62,.035,materials.metal,g,a,.34,b);
    const pane=new THREE.MeshBasicMaterial({color:'#ffbf65',transparent:true,opacity:.26,depthWrite:false,toneMapped:false});
    box(.35,.54,.35,pane,g,0,.34,0,false);cylinder(.09,.1,.33,materials.cream,g,0,.21,0);
    sphere(.055,materials.glow,g,0,.42,0,.7,1.7,.7);
    const handle=mesh(new THREE.TorusGeometry(.13,.018,6,20,Math.PI),materials.metal,g,0,.75,0);handle.rotation.z=0;
    cylinder(.32,.24,.13,materials.metal,g,0,.75,0,4).rotation.y=Math.PI/4;
    halo(g,0,.4,0,1.15,.50);if(light)warmLight(g,0,.46,0,power,7,shadow);return g;
  }
  // Wall lanterns: modest diffuse spill plus one broad downward shadow pool.
  // A separate, softly rounded wall fixture leaves the square table lanterns intact.
  const wallLanternMetal=materials.metal.clone();
  wallLanternMetal.name='Wall lantern satin bronze';wallLanternMetal.roughness=.48;
  const wallLanternGlass=new THREE.MeshStandardMaterial({
    name:'Wall lantern frosted amber glass',color:'#ffd6a0',roughness:.48,metalness:0,
    transparent:true,opacity:.24,depthWrite:false,side:THREE.FrontSide,envMapIntensity:.38
  });
  // A linear intensity mask, not a color photograph: a small center-to-end
  // falloff suggests frosted diffusion without a brighter light or white core.
  const wallDiffusionCanvas=document.createElement('canvas');wallDiffusionCanvas.width=64;wallDiffusionCanvas.height=128;
  const wallDiffusionContext=wallDiffusionCanvas.getContext('2d'),wallDiffusionPixels=wallDiffusionContext.createImageData(64,128);
  for(let y=0;y<128;y++)for(let x=0;x<64;x++){
    const v=.80+.20*Math.exp(-Math.pow((y/127-.5)/.28,2))+(hash2(x,y)-.5)*.016,k=(y*64+x)*4,c=Math.round(clamp(v,0,1)*255);
    wallDiffusionPixels.data[k]=wallDiffusionPixels.data[k+1]=wallDiffusionPixels.data[k+2]=c;wallDiffusionPixels.data[k+3]=255;
  }
  wallDiffusionContext.putImageData(wallDiffusionPixels,0,0);
  const wallDiffusionMap=new THREE.CanvasTexture(wallDiffusionCanvas);wallDiffusionMap.name='Frosted lamp diffusion falloff';
  wallDiffusionMap.colorSpace=THREE.NoColorSpace;wallDiffusionMap.minFilter=THREE.LinearMipmapLinearFilter;
  const wallLanternDiffuser=new THREE.MeshStandardMaterial({
    name:'Wall lantern warm diffuse core',color:'#e7b779',roughness:.9,metalness:0,
    emissive:'#ffbc6c',emissiveIntensity:.55,emissiveMap:wallDiffusionMap,toneMapped:true
  });
  function wallLantern(parent,x,y,z,scale,power){
    const g=new THREE.Group();g.name='Frosted cylindrical wall lantern';
    g.position.set(x,y,z);g.scale.setScalar(scale);parent.add(g);
    const lathe=(name,profile,mat,cast=true)=>{
      const part=mesh(new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),24),mat,g);
      part.name=name;part.castShadow=cast;part.receiveShadow=cast;return part;
    };
    lathe('Wall lantern rounded foot',[[0,0],[.13,0],[.18,.012],[.199,.028],[.205,.046],[.199,.062],[.18,.077],[.175,.09],[0,.09]],wallLanternMetal);
    lathe('Wall lantern curved rain hood',[[0,.65],[.16,.65],[.21,.655],[.225,.667],[.225,.677],[.211,.69],[.186,.714],[.16,.748],[.136,.786],[.11,.815],[.072,.833],[.04,.842],[0,.842]],wallLanternMetal);
    const glass=mesh(new THREE.CylinderGeometry(.177,.177,.53,24,1,true),wallLanternGlass,g,0,.36,0);
    glass.name='Wall lantern single-surface frosted sleeve';
    lathe('Wall lantern softly glowing diffuser',[[0,.115],[.09,.115],[.12,.135],[.132,.20],[.135,.36],[.13,.51],[.115,.565],[.08,.583],[0,.583]],wallLanternDiffuser,false);
    const collar=cylinder(.178,.178,.025,wallLanternMetal,g,0,.64,0,24);collar.name='Wall lantern top collar';
    for(let i=0;i<4;i++){
      const angle=Math.PI/4+i*Math.PI/2;
      const rib=cylinder(.009,.0105,.565,wallLanternMetal,g,Math.sin(angle)*.185,.355,Math.cos(angle)*.185,8);
      rib.name='Wall lantern slender frame';
    }
    const handle=mesh(new THREE.TorusGeometry(.08,.014,6,16,Math.PI),wallLanternMetal,g,0,.802,0);
    handle.name='Wall lantern curved hanging loop';handle.castShadow=true;
    // These transforms and light parameters intentionally match the former fixture.
    halo(g,0,.4,0,1.15,.50);
    const light=warmLight(g,0,.46,0,power,7,false);light.name='Wall lantern existing warm light';
    g.updateWorldMatrix(true,true);
    const inverse=g.matrixWorld.clone().invert(),bounds=new THREE.Box3(),point=new THREE.Vector3();
    let finite=true,vertexCount=0,triangleCount=0,meshCount=0;
    g.traverse(part=>{
      if(!part.isMesh||!part.geometry)return;
      const positions=part.geometry.getAttribute('position'),relative=new THREE.Matrix4().multiplyMatrices(inverse,part.matrixWorld);
      meshCount++;vertexCount+=positions.count;triangleCount+=(part.geometry.index?part.geometry.index.count:positions.count)/3;
      for(let i=0;i<positions.count;i++){
        point.fromBufferAttribute(positions,i).applyMatrix4(relative);
        finite=finite&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&Number.isFinite(point.z);bounds.expandByPoint(point);
      }
    });
    g.userData.geometry={finite,meshCount,vertexCount,triangleCount,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray(),size:bounds.getSize(new THREE.Vector3()).toArray()}};
    return g;
  }
  for(const x of [-8.8,-3.15]){
    tube([[x,6.5,-.3],[x,6.53,-.05],[x,6.33,.08]],.035,materials.metal,house,12);
    timber(.15,.46,.045,materials.darkWood,house,x,6.08,-.34);
    for(let i=0;i<3;i++){
      const y=6.304-i*.048,link=mesh(new THREE.TorusGeometry(.025,.006,5,12),wallLanternMetal,house,x,y,.08+(6.33-y)*.15);
      link.name='Connected wall lantern hanging link';link.rotation.y=i%2*Math.PI/2;link.castShadow=true;
    }
    wallLantern(house,x,5.45,.1,.85,x< -7?6.5:9);
  }
  const porchPool=new THREE.SpotLight('#ffc17c',9,8,.92,.90,2);
  porchPool.position.set(-8.8,5.84,.4);porchPool.target.position.set(-7.4,deckY+.08,2.45);
  porchPool.castShadow=true;porchPool.shadow.mapSize.set(1024,1024);
  porchPool.shadow.camera.near=.20;porchPool.shadow.camera.far=8;
  porchPool.shadow.bias=-.00015;porchPool.shadow.normalBias=.012;porchPool.shadow.radius=4;
  house.add(porchPool,porchPool.target);warmLights.push({light:porchPool,base:9});

  // One post per joint, with a recessed light facing the terrace, not a bright
  // block passing all the way through the timber. Rail heights stay unchanged.
  const railPosts=new Map(),railDiffuser=new THREE.MeshBasicMaterial({name:'Warm recessed rail diffuser',color:'#ffce82',toneMapped:true});
  railDiffuser.color.multiplyScalar(1.55);
  const railBezel=makeMaterial('#58412a',.68,{metalness:.35});railBezel.name='Recessed rail lamp bronze bezel';
  function railLine(a,b,n){
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
    let nx=-dz/len,nz=dx/len;
    if((-8.2-(a[0]+b[0])/2)*nx+(4.85-(a[1]+b[1])/2)*nz<0){nx=-nx;nz=-nz;}
    for(let i=0;i<=n;i++){
      const t=i/n,x=THREE.MathUtils.lerp(a[0],b[0],t),z=THREE.MathUtils.lerp(a[1],b[1],t);
      const key=x.toFixed(4)+','+z.toFixed(4),previous=railPosts.get(key);
      if(previous){previous.nx+=nx;previous.nz+=nz;previous.lit=previous.lit||i%2===0;previous.joints++;}
      else railPosts.set(key,{x,z,nx,nz,lit:i%2===0,joints:1});
    }
    for(const y of [deckY+1.12,deckY+.49]){const rail=rounded(len,.13,.105,.018,materials.wood,cabin,(a[0]+b[0])/2,y,(a[1]+b[1])/2);rail.rotation.y=-Math.atan2(dz,dx);}
  }
  railLine([-8.65,11],[-5.15,11],3);railLine([-5.15,11],[-5.15,-1.3],7);
  railLine([-11.15,-1.3],[-5.15,-1.3],4);railLine([-11.15,11],[-11.15,8.5],2);
  const railFixtureRecords=[];
  for(const p of railPosts.values()){
    rounded(.29,1.5,.29,.015,materials.darkWood,cabin,p.x,deckY+.74,p.z);rounded(.32,.07,.32,.015,materials.wood,cabin,p.x,deckY+1.5,p.z);
    const inward=new THREE.Vector3(p.nx,0,p.nz).normalize(),g=new THREE.Group();
    // A joined square post still needs a flat mounting face, not a plate
    // floating diagonally across its uncut corner. Prefer the long sea rail.
    if(p.joints>1)inward.set(Math.abs(p.nx)>=Math.abs(p.nz)?Math.sign(p.nx):0,0,Math.abs(p.nx)>=Math.abs(p.nz)?0:Math.sign(p.nz));
    g.name='Inward recessed rail lamp';g.position.set(p.x,deckY+1.31,p.z);g.rotation.y=Math.atan2(inward.x,inward.z);cabin.add(g);
    const faceDepth=.145;
    rounded(.17,.115,.018,.006,railBezel,g,0,0,faceDepth-.003).castShadow=false;
    rounded(.125,.074,.006,.002,railDiffuser,g,0,0,faceDepth+.008).castShadow=false;
    halo(g,0,0,faceDepth+.025,.45,.24);
    // The unshadowed point is a broad spill proxy, kept away from the wood to
    // avoid an inverse-square hot pixel directly above the inset diffuser.
    if(p.lit)warmLight(g,0,.04,faceDepth+.30,2.8,4.3);
    g.userData.railFixture={site:[p.x,p.z],inward:inward.toArray(),faceDepth,joints:p.joints,light:p.lit};
    railFixtureRecords.push(g.userData.railFixture);
  }
  scene.userData.railFixtures={uniquePosts:railPosts.size,joinedCorners:railFixtureRecords.filter(p=>p.joints>1).length,records:railFixtureRecords};
  // Open approach at the landward corner, with grounded stone steps.
  for(let i=0;i<5;i++){
    const z=11.55+i*.68,top=2.32-i*.22,base=landHeight(-10,z)-.2;
    box(2.3,Math.max(.18,top-base),.75,materials.rock,cabin,-10,(top+base)/2,z);
  }
  for(let i=0;i<3;i++)box(1.5,.09,.74,materials.rock,cabin,-10,landHeight(-10,15.2+i*.8)+.03,15.2+i*.8);
  for(const [x,z,s]of[[-11.35,11.7,.70],[-8.6,13.1,.65],[-11.2,15.8,.65]])
    lantern(cabin,x,landHeight(x,z)+.05,z,s,true,5.8);

  // Woven rattan chairs: curved timber frame plus individual warp/weft strands.
  const wickerMats=Array.from({length:5},(_,i)=>{const m=materials.wicker.clone();m.color.multiplyScalar(.94+i*.025);return m;});
  function chair(x,z,angle){
    const g=new THREE.Group();g.position.set(x,deckY+.08,z);g.rotation.y=angle;cabin.add(g);
    // Chair-only ribbon frame: broad across the surface, thin along its normal.
    // Six perimeter vertices retain soft edge bevels without round-rope bulk.
    function strip(sample,width,thickness,steps,mat,normal=new THREE.Vector3(0,.30,1)){
      const positions=[],uvs=[],indices=[],sides=6;
      for(let i=0;i<=steps;i++){
        const t=i/steps,p=sample(t),tangent=sample(Math.min(1,t+.0001)).sub(sample(Math.max(0,t-.0001))).normalize();
        const n=normal.clone().addScaledVector(tangent,-normal.dot(tangent)).normalize(),across=new THREE.Vector3().crossVectors(n,tangent).normalize();
        for(let j=0;j<sides;j++){const a=j/sides*Math.PI*2,q=p.clone().addScaledVector(across,Math.cos(a)*width*.5).addScaledVector(n,Math.sin(a)*thickness*.5);positions.push(q.x,q.y,q.z);uvs.push(j/sides,t);}
        if(i<steps)for(let j=0;j<sides;j++){const a=i*sides+j,b=i*sides+(j+1)%sides;indices.push(a,b,a+sides,b,b+sides,a+sides);}
      }
      for(const end of[0,1]){const p=sample(end),center=positions.length/3,start=end*steps*sides;positions.push(p.x,p.y,p.z);uvs.push(.5,end);for(let j=0;j<sides;j++){const a=start+j,b=start+(j+1)%sides;indices.push(center,end?a:b,end?b:a);}}
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
      const part=mesh(geometry,mat,g);part.castShadow=part.receiveShadow=true;return part;
    }
    function taperedMember(a,b,w,d){
      const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),direction=B.clone().sub(A),length=direction.length();
      const part=rounded(w,length,d,.012,materials.darkWood,g,...A.clone().add(B).multiplyScalar(.5).toArray()),p=part.geometry.attributes.position,n=part.geometry.attributes.normal;
      for(let i=0;i<p.count;i++){
        const f=.78+.22*(p.getY(i)/length+.5),xx=p.getX(i),zz=p.getZ(i),normal=new THREE.Vector3(n.getX(i)/f,n.getY(i)-.22/length*(xx*n.getX(i)+zz*n.getZ(i))/f,n.getZ(i)/f).normalize();
        p.setXYZ(i,xx*f,p.getY(i),zz*f);n.setXYZ(i,normal.x,normal.y,normal.z);
      }
      part.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return part;
    }
    for(const side of [-1,1]){
      taperedMember([side*.64,.086,.65],[side*.56,1.18,.42],.085,.065);
      taperedMember([side*.62,.086,-.65],[side*.57,1.14,-.48],.085,.065);
      const backStile=taperedMember([side*.55,1.02,-.56],[side*.67,2.03,-.79],.085,.065);backStile.material=materials.wood;
      const armCurve=new THREE.CatmullRomCurve3([[side*.64,1.40,.57],[side*.70,1.48,.06],[side*.66,1.54,-.5],[side*.66,1.8,-.76]].map(p=>new THREE.Vector3(...p)));
      strip(t=>armCurve.getPointAt(t),.108,.052,24,materials.wood,new THREE.Vector3(0,1,0));
      for(let i=0;i<8;i++){
        const t=.07+i*.022,p=armCurve.getPointAt(t),tangent=armCurve.getTangentAt(t),normal=new THREE.Vector3(0,1,0).addScaledVector(tangent,-tangent.y).normalize(),across=new THREE.Vector3().crossVectors(normal,tangent).normalize();
        const wrap=mesh(new THREE.TorusGeometry(.055,.0035,4,10),materials.wicker,g,...p.toArray());wrap.scale.y=.48;wrap.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,normal,tangent));
      }
      const support=taperedMember([side*.56,.93,.5],[side*.64,1.4,.52],.063,.055);support.material=materials.wood;
    }
    rounded(1.36,.12,1.28,.05,materials.darkWood,g,0,.88,0);
    const cushionGroup=new THREE.Group();cushionGroup.position.set(0,1.055,.035);cushionGroup.rotation.x=.025;g.add(cushionGroup);
    const cushionGeometry=new THREE.SphereGeometry(1,32,20),cushionPoints=cushionGeometry.attributes.position;
    for(let i=0;i<cushionPoints.count;i++){
      const xx=Math.sign(cushionPoints.getX(i))*Math.pow(Math.abs(cushionPoints.getX(i)),.42)*.62,yy=Math.sign(cushionPoints.getY(i))*Math.pow(Math.abs(cushionPoints.getY(i)),.42)*.125,zz=Math.sign(cushionPoints.getZ(i))*Math.pow(Math.abs(cushionPoints.getZ(i)),.42)*.565;
      const settling=yy>0?.018*Math.exp(-((xx/.31)**2)-((zz/.29)**2))*(yy/.125):0;
      cushionPoints.setXYZ(i,xx,yy-settling,zz);
    }
    cushionGeometry.computeVertexNormals();const cushion=mesh(cushionGeometry,materials.cushion,cushionGroup);cushion.castShadow=cushion.receiveShadow=true;
    const seam=makeMaterial('#b7a585',.93);
    const edgeScale=Math.pow(1-Math.pow(.075/.125,2/.42),.42/2);
    for(const y of [-.075,.075]){const edge=[];for(let i=0;i<=40;i++){const a=i/40*Math.PI*2;edge.push([Math.sign(Math.cos(a))*Math.pow(Math.abs(Math.cos(a)),.42)*.62*edgeScale,y,Math.sign(Math.sin(a))*Math.pow(Math.abs(Math.sin(a)),.42)*.565*edgeScale]);}tube(edge,.007,seam,cushionGroup,56);}
    tube([[-.67,2.03,-.79],[-.36,2.13,-.88],[0,2.17,-.9],[.36,2.13,-.88],[.67,2.03,-.79]],.065,materials.wood,g);
    function wovenPoint(u,t,phase){
      const bend=1-u*u,xx=u*(.52+.13*t),yy=1.035+t*(1+bend*.12),zz=-.53-t*(.26+bend*.10),over=Math.sin(phase)*.0042;
      return new THREE.Vector3(xx,yy+over*.28,zz+over);
    }
    const warpCount=33,weftCount=27;
    for(let i=0;i<warpCount;i++){
      const u=-1+2*i/(warpCount-1);strip(t=>wovenPoint(u,t,(t*(weftCount-1)+i)*Math.PI+Math.PI*.5),.026,.006,52,wickerMats[i%5]);
    }
    for(let i=0;i<weftCount;i++){
      const t=i/(weftCount-1);strip(s=>wovenPoint(-1+2*s,t,(s*(warpCount-1)+i)*Math.PI-Math.PI*.5),.025,.006,64,wickerMats[(i+2)%5]);
    }
    // A slightly tilted linen pillow leaves the tapered woven outline visible.
    const pillow=puffy(.78,.73,.28,materials.cushion,g,-.03,1.50,-.43);pillow.rotation.x=-.20;pillow.rotation.z=.09;
    return g;
  }
  // Leave a usable landing outside the newly opened bedroom doorway.
  chair(-9.2,3.0,Math.atan2(.5,1.8)).scale.set(1.1,1.0,1.1);
  chair(-7.3,7.0,2.45).scale.set(1.1,1.0,1.1);
  // Round slatted tea table, crossed trestle legs and tea service.
  const table=new THREE.Group();table.position.set(-8.7,deckY+.08,4.8);cabin.add(table);
  cylinder(1.06,1.045,.10,materials.darkWood,table,0,1.29,0,96);
  const tableEdge=[[1.005,1.31],[1.052,1.31],[1.071,1.325],[1.075,1.36],[1.060,1.383],[1.005,1.383],[1.005,1.31]].map(p=>new THREE.Vector2(...p));
  const easedRim=mesh(new THREE.LatheGeometry(tableEdge,96),materials.darkWood,table);easedRim.castShadow=easedRim.receiveShadow=true;
  for(let i=-7;i<=7;i++){
    const x=i*.133,halfLength=Math.sqrt(1.04**2-x*x),len=halfLength*2;
    const slat=rounded(.127,.075,len,.012,materials.wood,table,x,1.35,0);
    const positions=slat.geometry.attributes.position,normals=slat.geometry.attributes.normal;
    // Follow the actual circular rim across each board's width, not just its
    // centre. The softened ends cannot protrude as squared, stair-step corners.
    for(let j=0;j<positions.count;j++){
      const localZ=positions.getZ(j),worldX=x+positions.getX(j);
      const edge=Math.sqrt(Math.max(.0001,1.04**2-worldX*worldX)),scale=edge/halfLength;
      const nx=normals.getX(j),ny=normals.getY(j),nz=normals.getZ(j);
      const normal=new THREE.Vector3(nx+localZ*worldX/(edge*edge)*nz,ny,nz/scale).normalize();
      positions.setZ(j,localZ*scale);normals.setXYZ(j,normal.x,normal.y,normal.z);
    }
    positions.needsUpdate=normals.needsUpdate=true;slat.geometry.computeBoundingSphere();
    for(const z of [-len*.38,len*.38])cylinder(.009,.009,.002,materials.metal,table,x,1.389,z,6);
  }
  for(const z of [-.45,.45]){rod([-.63,0,z],[.63,1.26,z],.055,materials.darkWood,table);rod([.63,0,z],[-.63,1.26,z],.055,materials.darkWood,table);}
  rod([0,.5,-.65],[0,.5,.65],.045,materials.darkWood,table);
  cylinder(.42,.42,.026,materials.trim,table,-.1,1.415,0,48);
  const pot=new THREE.Group();pot.position.set(-.17,1.44,-.08);table.add(pot);
  sphere(.22,materials.ceramic,pot,0,.2,0,1.2,.85,1);cylinder(.15,.2,.06,materials.ceramic,pot,0,.35,0);sphere(.04,materials.trim,pot,0,.41,0);
  tube([[.15,.18,0],[.3,.20,0],[.39,.38,0]],.045,materials.ceramic,pot,16);
  tube([[-.17,.27,0],[-.32,.34,0],[-.33,.13,0],[-.18,.12,0]],.025,materials.trim,pot,20);
  // Arched kettle handle.
  tube([[-.20,.21,0],[-.23,.57,0],[0,.70,0],[.23,.57,0],[.20,.21,0]],.018,materials.metal,pot,32);
  function cup(x,z){
    cylinder(.14,.14,.018,materials.cream,table,x,1.425,z,28);
    const profile=[[0,0],[.075,0],[.105,.12],[.12,.14],[.105,.145],[.089,.04],[0,.035]].map(p=>new THREE.Vector2(...p));
    mesh(new THREE.LatheGeometry(profile,24),materials.cream,table,x,1.44,z);
    cylinder(.089,.089,.006,makeMaterial('#6f3e18',.18),table,x,1.545,z,24);
    const handle=mesh(new THREE.TorusGeometry(.045,.012,6,16),materials.cream,table,x+.12,1.51,z);return handle;
  }
  cup(-.52,.4);cup(.35,-.4);lantern(table,.58,1.4,.27,.65,true,5.2,true);
  // Small vase and a few dry sprigs.
  const vaseProfile=[[0,0],[.09,0],[.12,.08],[.11,.22],[.05,.29],[.05,.38],[.043,.38],[.043,.29],[.10,.21],[.10,.08],[0,.02]].map(p=>new THREE.Vector2(...p));
  mesh(new THREE.LatheGeometry(vaseProfile,32),new THREE.MeshPhysicalMaterial({color:'#b5cbb5',roughness:.08,metalness:.15,transparent:true,opacity:.38,side:THREE.DoubleSide,envMapIntensity:1}),table,.18,1.43,-.63);
  const driedFlowers=makeMaterial('#c9b178',.9);
  for(let i=0;i<9;i++){
    const x=.18+rr(-.26,.26),z=-.63+rr(-.16,.16),y=rr(2.05,2.35);rod([.18,1.5,-.63],[x,y,z],.0045,materials.leafLight,table);
    for(let j=0;j<3;j++){const xx=x+rr(-.08,.08),yy=y-rr(0,.12),zz=z+rr(-.07,.07);rod([x,y-.2,z],[xx,yy,zz],.0025,materials.leafLight,table);sphere(.022,driedFlowers,table,xx,yy,zz);}
  }
  // Steam uses soft procedural sprites; it never needs a PNG texture.
  const steam=[];const steamMat=new THREE.SpriteMaterial({map:glowTexture,color:'#dedbd2',transparent:true,opacity:.07,depthWrite:false,blending:THREE.NormalBlending});
  for(let i=0;i<12;i++){const sp=new THREE.Sprite(steamMat.clone());table.add(sp);steam.push({sprite:sp,phase:i/12});}

  // Terracotta planters use the same individually folded leaves as the shore.
  function planter(x,z,s=1){
    cylinder(.38*s,.26*s,.62*s,makeMaterial('#665443'),cabin,x,deckY+.32*s,z);
    cylinder(.4*s,.39*s,.10*s,makeMaterial('#73614c'),cabin,x,deckY+.61*s,z);
    terrain.addPlanterFoliage(x,deckY+.65*s,z,.70*s);
  }
  planter(-10.45,.45,1.05);planter(-5.75,-.7,.85);planter(-10.45,8.75,.7);

  // Two distant birds, a quiet moving detail on the horizon.
  const birds=[];
  for(let i=0;i<4;i++){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-1,0,0,-.45,.15,0,0,0,0,.45,.15,0,1,0,0],3));
    const b=new THREE.Line(g,new THREE.LineBasicMaterial({color:'#354256'}));b.position.set(15+i*8,17+i*1.5,-90-i*17);b.scale.setScalar(.65);scene.add(b);birds.push(b);
  }

  // Separate roof batches preserve real cutaway visibility after world-space merging.
  const cutawayGeometry=new THREE.Group();cutawayGeometry.name='Cutaway roof batches';scene.add(cutawayGeometry);
  // Batch static opaque geometry by material to keep the detailed weave inexpensive.
  function batchStaticMeshes(){
    scene.updateMatrixWorld(true);const batches=new Map();
    scene.traverse(obj=>{
      if(!obj.isMesh||obj.isInstancedMesh||obj.material.transparent||obj.material.isShaderMaterial||Array.isArray(obj.material))return;
      let parent=obj,cutaway=false;while(parent){cutaway=cutaway||!!parent.userData.cutaway;parent=parent.parent;}
      obj.userData.inCutaway=cutaway;
      const key=obj.material.uuid+'/'+obj.castShadow+'/'+obj.receiveShadow+'/'+cutaway;
      if(!batches.has(key))batches.set(key,[]);batches.get(key).push(obj);
    });
    const p=new THREE.Vector3(),n=new THREE.Vector3(),nm=new THREE.Matrix3();
    for(const objects of batches.values()){
      if(objects.length<2)continue;
      const positions=[],normals=[],uvs=[],indices=[];let offset=0;
      for(const obj of objects){
        const g=obj.geometry,a=g.attributes;nm.getNormalMatrix(obj.matrixWorld);
        for(let i=0;i<a.position.count;i++){
          p.fromBufferAttribute(a.position,i).applyMatrix4(obj.matrixWorld);positions.push(p.x,p.y,p.z);
          if(a.normal)n.fromBufferAttribute(a.normal,i).applyMatrix3(nm).normalize();else n.set(0,1,0);normals.push(n.x,n.y,n.z);
          uvs.push(a.uv?a.uv.getX(i):0,a.uv?a.uv.getY(i):0);
        }
        if(g.index)for(let i=0;i<g.index.count;i++)indices.push(g.index.getX(i)+offset);
        else for(let i=0;i<a.position.count;i++)indices.push(i+offset);
        offset+=a.position.count;
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeBoundingSphere();
      const merged=mesh(geo,objects[0].material,objects[0].userData.inCutaway?cutawayGeometry:scene);merged.castShadow=objects[0].castShadow;merged.receiveShadow=objects[0].receiveShadow;
      for(const obj of objects)obj.removeFromParent();
    }
  }
  batchStaticMeshes();
  // WebGL 1 implementations without 32-bit element indices can still draw the
  // original geometry by expanding only those indexed buffers that need it.
  if(!quality.capabilities.uintIndices){const expanded=new Map();scene.traverse(o=>{if(!o.isMesh||!(o.geometry.index?.array instanceof Uint32Array))return;const original=o.geometry;if(!expanded.has(original))expanded.set(original,original.toNonIndexed());o.geometry=expanded.get(original);});for(const original of expanded.keys())original.dispose();}
  // The building and lights stay in place; their shadows only need one render.
  renderer.shadowMap.autoUpdate=false;
  renderer.shadowMap.needsUpdate=true;

  // Camera orbit with damped pointer, wheel and two-finger pinch input.
  const orbit={target:new THREE.Vector3(-6.99,4.8,1),radius:10.865,theta:-.34883,phi:1.52476,fov:60};
  const desired={target:orbit.target.clone(),radius:orbit.radius,theta:orbit.theta,phi:orbit.phi,fov:orbit.fov};
  let transition=false,dragging=false,moved=false,lastX=0,lastY=0,pinchDistance=0;
  const pointers=new Map();
  const presets={wide:{target:new THREE.Vector3(-2,1,-4),radius:36.23,theta:-.1974,phi:1.3988,fov:55},deck:{target:new THREE.Vector3(-6.99,4.8,1),radius:10.865,theta:-.34883,phi:1.52476,fov:60}};
  function cameraPreset(eye,target,fov){const v=new THREE.Vector3(...eye).sub(new THREE.Vector3(...target));return {target:new THREE.Vector3(...target),radius:v.length(),theta:Math.atan2(v.x,v.z),phi:Math.acos(v.y/v.length()),fov};}
  presets.room=cameraPreset([-11.8,4.7,7.2],[-16.9,3.9,4.3],66);
  presets.bedsea=cameraPreset([-16.45,4.2,5.6],[-6.9,3.8,3.8],68);
  presets.plan=cameraPreset([-11.8,21.8,9.5],[-11.8,2.8,4.3],42);
  const isIndoor=()=>state.view==='room'||state.view==='bedsea';
  function zoomRadius(value){return clamp(value,isIndoor()?presets[state.view].radius*.72:state.view==='plan'?15:6,isIndoor()?presets[state.view].radius*1.16:68);}
  function setView(name,instant=false){
    if(!presets[name])return;
    const cutaway=name==='plan';roofPivot.visible=ceiling.visible=pendant.visible=cutawayGeometry.visible=!cutaway;
    renderer.shadowMap.needsUpdate=true;glassCapturedDusk=-1;
    state.view=name;const p=presets[name];desired.target.copy(p.target);desired.radius=p.radius;desired.theta=p.theta;desired.phi=p.phi;desired.fov=p.fov;transition=true;
    $('view-wide').classList.toggle('active',name==='wide');$('view-deck').classList.toggle('active',name==='deck');
    $('view-wide').setAttribute('aria-pressed',name==='wide');$('view-deck').setAttribute('aria-pressed',name==='deck');
    $('view-interior').value=['room','bedsea','plan'].includes(name)?name:'';
    document.body.dataset.view=name;
    // Interior transitions snap to avoid flying through the roof and walls.
    if(isIndoor()||name==='plan')instant=true;
    if(instant){orbit.target.copy(p.target);orbit.radius=p.radius;orbit.theta=p.theta;orbit.phi=p.phi;orbit.fov=p.fov;}
  }
  const canvas=renderer.domElement;
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0&&e.pointerType==='mouse')return;canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});dragging=true;moved=false;lastX=e.clientX;lastY=e.clientY;if(pointers.size===2){const p=[...pointers.values()];pinchDistance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}});
  canvas.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===2){const p=[...pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(pinchDistance>0)desired.radius=zoomRadius(desired.radius*pinchDistance/Math.max(d,1));pinchDistance=d;}
    else if(dragging){desired.theta-=(e.clientX-lastX)*.003;desired.phi=clamp(desired.phi-(e.clientY-lastY)*.002,state.view==='plan'?.08:isIndoor()?1.05:.77,isIndoor()?1.85:1.53);moved=true;}
    lastX=e.clientX;lastY=e.clientY;
    desired.theta=clamp(desired.theta,isIndoor()?presets[state.view].theta-.8:-1.48,isIndoor()?presets[state.view].theta+.8:1.6);
  });
  function endPointer(e){pointers.delete(e.pointerId);dragging=pointers.size>0;pinchDistance=0;if(dragging){const p=[...pointers.values()][0];lastX=p.x;lastY=p.y;}}
  canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);canvas.addEventListener('lostpointercapture',endPointer);
  canvas.addEventListener('wheel',e=>{e.preventDefault();desired.radius=zoomRadius(desired.radius*Math.exp(e.deltaY*.0008));},{passive:false});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  $('view-wide').onclick=()=>setView('wide');$('view-deck').onclick=()=>setView('deck');
  $('view-interior').onchange=e=>{if(e.target.value)setView(e.target.value);};
  function toggleSettings(force){const open=typeof force==='boolean'?force:$('atmosphere').hidden;$('atmosphere').hidden=!open;$('settings').setAttribute('aria-expanded',open);}
  $('settings').onclick=()=>toggleSettings();$('close-panel').onclick=()=>toggleSettings(false);
  function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),2300);}
  function togglePause(){state.paused=!state.paused;$('pause-symbol').setAttribute('d',state.paused?'M9 5 19 12 9 19Z':'M9 6v12m6-12v12');$('pause').setAttribute('aria-label',state.paused?'继续画面':'暂停画面');$('pause').title=state.paused?'继续画面（空格）':'暂停画面（空格）';}
  if(state.paused){state.paused=false;togglePause();}
  $('pause').onclick=togglePause;
  $('fullscreen').onclick=async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch(e){toast('当前窗口不支持全屏，可使用浏览器 F11');}};
  $('dusk').oninput=e=>{state.dusk=+e.target.value;$('dusk-value').textContent=state.dusk<.3?'日暮':state.dusk<.7?'蓝调':'夜色';$('time-label').textContent=state.dusk<.3?'蓝调时刻 · 18:42':state.dusk<.7?'暮色渐深 · 19:06':'星光初现 · 19:35';};
  $('waves').oninput=e=>{state.wind=+e.target.value;$('waves-value').textContent=state.wind<.7?'轻柔':state.wind<1.2?'微风':'起风';};
  document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();togglePause();}const views=['wide','deck','room','bedsea','plan'];if(/^[1-5]$/.test(e.key))setView(views[+e.key-1]);if(e.key.toLowerCase()==='h')document.body.classList.toggle('clean');if(e.key==='Escape')toggleSettings(false);if(e.key.toLowerCase()==='m')$('sound').click();});
  window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(quality.pixelRatio());renderer.setSize(innerWidth,innerHeight);post.resize();});
  // Web Audio synthesizes surf from filtered noise, entirely offline and opt-in.
  let audioContext,masterGain,audioOn=false;
  $('sound').onclick=async()=>{
    try{
      if(!audioContext){
        audioContext=new (window.AudioContext||window.webkitAudioContext)();const ac=audioContext;
        masterGain=ac.createGain();masterGain.gain.value=0;masterGain.connect(ac.destination);
        const buffer=ac.createBuffer(1,ac.sampleRate*8,ac.sampleRate),data=buffer.getChannelData(0);
        let brown=0;for(let i=0;i<data.length;i++){brown=(brown+(Math.random()*2-1)*.024)/1.024;data[i]=brown*3.5;}
        const source=ac.createBufferSource();source.buffer=buffer;source.loop=true;
        const low=ac.createBiquadFilter();low.type='lowpass';low.frequency.value=1100;
        const high=ac.createBiquadFilter();high.type='highpass';high.frequency.value=100;
        const waveGain=ac.createGain();waveGain.gain.value=.28;
        const lfo=ac.createOscillator(),lfoGain=ac.createGain();lfo.frequency.value=.105;lfoGain.gain.value=.2;lfo.connect(lfoGain);lfoGain.connect(waveGain.gain);lfo.start();
        source.connect(low);low.connect(high);high.connect(waveGain);waveGain.connect(masterGain);source.start();
      }
      await audioContext.resume();audioOn=!audioOn;masterGain.gain.setTargetAtTime(audioOn?.55:0,audioContext.currentTime,.6);
      document.body.classList.toggle('has-sound',audioOn);$('sound').setAttribute('aria-label',audioOn?'关闭海浪声':'开启海浪声');$('sound').title=audioOn?'关闭海浪声（M）':'开启海浪声（M）';
    }catch(e){toast('浏览器暂时无法播放声音');}
  };

  const post=CoastalPost.create({THREE,renderer,scene,camera,quality});
  const shadowLights=[];scene.traverse(o=>{if(o.isLight&&o.castShadow){o.userData.requestedShadow=true;o.userData.originalShadowSize=o.shadow.mapSize.x;shadowLights.push(o);}});
  function applyQuality(profile){
    renderer.setPixelRatio(quality.pixelRatio());renderer.setSize(innerWidth,innerHeight);post.setQuality(profile);
    for(const light of shadowLights){
      light.castShadow=!(profile.level==='low'&&light.isPointLight);
      const size=Math.min(light.userData.originalShadowSize,profile.shadow);
      if(light.shadow.mapSize.x!==size){light.shadow.map?.dispose();light.shadow.map=null;light.shadow.mapPass?.dispose();light.shadow.mapPass=null;light.shadow.mapSize.set(size,size);}
    }
    if(glassTarget.width!==profile.reflection)glassTarget.setSize(profile.reflection,profile.reflection);
    glassCapturedDusk=-1;renderer.shadowMap.needsUpdate=true;updateQualityLabel();
  }
  function updateQualityLabel(){const q=quality.stats();$('quality-value').textContent=(q.mode==='auto'?'自动 · ':'')+q.name;$('quality').value=q.mode;}
  quality.onChange(applyQuality);$('quality').onchange=e=>quality.setMode(e.target.value);applyQuality(quality.current());
  let contextLost=false;
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();contextLost=true;quality.suspend(true);$('graphics-status').hidden=false;$('graphics-message').textContent='画面暂时中断，正在恢复…';});
  canvas.addEventListener('webglcontextrestored',()=>{
    try{rebuildEnvironment();glassCapturedDusk=-1;renderer.shadowMap.needsUpdate=true;applyQuality(quality.current());post.resize();contextLost=false;quality.suspend(false);clock.getDelta();$('graphics-status').hidden=true;}
    catch(error){$('graphics-message').textContent='画面恢复失败，请重新载入。';}
  });
  document.addEventListener('visibilitychange',()=>{quality.suspend(document.hidden||contextLost);clock.getDelta();});
  let frames=0;
  function animate(){
    requestAnimationFrame(animate);const elapsed=Math.min(clock.getDelta(),1);if(contextLost||document.hidden)return;const dt=Math.min(elapsed,.06);if(!state.paused)state.time+=dt;
    const t=state.time;atmosphereUniforms.uTime.value=t;atmosphereUniforms.uNight.value=state.dusk;waterUniforms.uWind.value=state.wind;
    hemi.intensity=.82-state.dusk*.50;sunset.intensity=.20*(1-state.dusk)+.035;coolFill.intensity=.36-state.dusk*.21;
    starsMat.opacity=Math.max(0,(state.dusk-.25)*.9);renderer.toneMappingExposure=1.04+state.dusk*.1;
    for(const {light,base} of warmLights)light.intensity=base*(1+state.dusk*.3)*(1+Math.sin(t*1.7+base)*.014);
    steam.forEach(({sprite,phase})=>{const p=(t*.15+phase)%1;sprite.position.set(-.17+Math.sin(p*8+t*.2)*.08,1.92+p*.8,-.08+Math.cos(p*5)*.06);sprite.scale.set(.14+p*.25,.26+p*.35,1);sprite.material.opacity=Math.sin(p*Math.PI)*.075;});
    birds.forEach((b,i)=>{b.position.x=15+i*8+Math.sin(t*.035+i)*13;b.position.y=17+i*1.5+Math.sin(t*.4+i)*.4;const pos=b.geometry.attributes.position;pos.setY(0,Math.sin(t*2.1+i)*.25);pos.setY(4,Math.sin(t*2.1+i)*.25);pos.needsUpdate=true;});
    const ease=1-Math.exp(-elapsed*3.4);orbit.target.lerp(desired.target,ease);orbit.radius=THREE.MathUtils.lerp(orbit.radius,desired.radius,ease);orbit.theta=THREE.MathUtils.lerp(orbit.theta,desired.theta,ease);orbit.phi=THREE.MathUtils.lerp(orbit.phi,desired.phi,ease);orbit.fov=THREE.MathUtils.lerp(orbit.fov,desired.fov,ease);
    if(Math.abs(camera.fov-orbit.fov)>.001){camera.fov=orbit.fov;camera.updateProjectionMatrix();}
    const mobile=innerWidth<650&&!isIndoor()?1.35:1;
    camera.position.set(orbit.target.x+orbit.radius*mobile*Math.sin(orbit.phi)*Math.sin(orbit.theta),orbit.target.y+orbit.radius*mobile*Math.cos(orbit.phi),orbit.target.z+orbit.radius*mobile*Math.sin(orbit.phi)*Math.cos(orbit.theta));
    if(isIndoor()){house.worldToLocal(camera.position);camera.position.x=clamp(camera.position.x,-10.8,-3.4);camera.position.z=clamp(camera.position.z,state.view==='bedsea'?-5.95:-7.8,-.85);camera.position.y=clamp(camera.position.y,state.view==='bedsea'?4.05:3.85,6.2);house.localToWorld(camera.position);}
    else camera.position.y=Math.max(camera.position.y,landHeight(camera.position.x,camera.position.z)+1.1,.6);camera.lookAt(orbit.target);
    refreshGlazing();renderer.info.reset();post.render();
    quality.sample(elapsed*1000);
    if(++frames===3){$('loading').classList.add('done');setTimeout(()=>$('loading').remove(),1100);}
  }
  // A small read-only diagnostic handle used for visual verification.
  window.coastalScene={renderer,scene,camera,state,setView,post,stats:()=>({drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,glassCaptures,contextLost,quality:quality.stats(),nature:nature.stats,reef:reef.stats,cutaway:!cutawayGeometry.visible,interior:interior.group.userData.layout,assets:{sky:[skyAsset.image.width,skyAsset.image.height],rock:[rockAsset.image.width,rockAsset.image.height],wood:[woodMap.image.width,woodMap.image.height]}})};
  setView('deck',true);
  animate();
})().catch(error=>{
  console.error('Scene initialization failed',error);
  const loading=document.getElementById('loading');if(loading)loading.hidden=true;
  document.getElementById('error').hidden=false;
});
