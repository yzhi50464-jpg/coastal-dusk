/* Procedural coastal sea. No external normal maps, photographs or models. */
(() => {
  'use strict';
  window.CoastalOcean = {
    create({ THREE, scene, timeUniform, nightUniform, wind = .85, skyGLSL,skyTexture }) {
      // A periodic directional spectrum, filtered by the GPU's mipmaps, prevents
      // the sub-pixel wavelets from turning into stripes at the horizon.
      const size = 256, data = new Uint8Array(size * size * 4), modes = [];
      let seed = 721191;
      const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
      for (let i = 0; i < 36; i++) {
        const a = random() * Math.PI * 2, k = 3 + Math.pow(random(), .8) * 46;
        const x = Math.round(Math.cos(a) * k), y = Math.round(Math.sin(a) * k);
        modes.push([x, y, random() * Math.PI * 2, .028 / Math.pow(k / 5, .38)]);
      }
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        let dx = 0, dz = 0, h = 0;
        for (const [kx, kz, phase, amplitude] of modes) {
          const p = (x * kx + y * kz) / size * Math.PI * 2 + phase;
          const d = Math.cos(p) * amplitude;
          dx += d * kx / Math.hypot(kx, kz); dz += d * kz / Math.hypot(kx, kz);
          h += Math.sin(p) * amplitude;
        }
        const i = (y * size + x) * 4;
        data[i] = Math.max(0, Math.min(255, 128 + dx * 310));
        data[i + 1] = Math.max(0, Math.min(255, 128 + dz * 310));
        data[i + 2] = Math.max(0, Math.min(255, 128 + h * 170)); data[i + 3] = 255;
      }
      const ripples = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
      ripples.wrapS = ripples.wrapT = THREE.RepeatWrapping;
      ripples.magFilter = THREE.LinearFilter; ripples.minFilter = THREE.LinearMipmapLinearFilter;
      ripples.generateMipmaps = true; ripples.anisotropy = 8; ripples.needsUpdate = true;
      const uniforms = {
        uTime: timeUniform, uNight: nightUniform,uSkyTexture:{value:skyTexture}, uWind: { value: wind }, uRipples: { value: ripples },
        uRocks: { value: Array.from({ length: 32 }, () => new THREE.Vector4(9000, 9000, 1, 0)) },
        uShoreMap:{value:null},uShoreBounds:{value:new THREE.Vector4(-44,-85,1/70,1/130)}
      };
      const waveGLSL = `
        // Height and analytic slopes from a non-repeating directional spectrum.
        vec3 coastalWave(vec2 p,float t,float wind,float footprint){
          vec3 w=vec3(0.);float amplitude=.18;
          for(int i=0;i<10;i++){
            float f=float(i),angle=i<3?-.12+f*.28:f*2.399963+.31;
            vec2 direction=vec2(cos(angle),sin(angle));
            float k=.48*pow(1.68,f);
            float phase=dot(direction,p)*k+t*sqrt(k*9.81)*.36+f*8.57;
            float fade=1./(1.+footprint*k*k);
            vec2 packetDirection=vec2(cos(f*.71+.61),sin(f*.71+.61))*(.038+f*.004);
            float packetPhase=dot(p,packetDirection)-t*(.07+f*.003)+f*1.4;
            float packet=.70+.30*sin(packetPhase);
            float height=.82*sin(phase)+.18*sin(phase*2.);
            float slope=.82*cos(phase)+.36*cos(phase*2.);
            vec2 derivative=packet*slope*k*direction+height*.30*cos(packetPhase)*packetDirection;
            w+=vec3(packet*height,derivative)*amplitude*fade;
            amplitude*=.53;
          }
          return w*(.38+.62*wind);
        }
      `;
      const material = new THREE.ShaderMaterial({
        uniforms, side: THREE.FrontSide,
        vertexShader: `
          uniform float uTime,uWind;
          varying vec3 vSeaWorld;
          ${waveGLSL}
          void main(){
            vec4 world=modelMatrix*vec4(position,1.);
            world.y+=coastalWave(world.xz,uTime,uWind,0.).x;
            vSeaWorld=world.xyz;
            gl_Position=projectionMatrix*viewMatrix*world;
          }
        `,
        fragmentShader: `
          uniform float uTime,uNight,uWind;
          uniform sampler2D uRipples;
          uniform sampler2D uShoreMap;
          uniform vec4 uShoreBounds;
          uniform vec4 uRocks[32];
          varying vec3 vSeaWorld;
          ${skyGLSL}
          ${waveGLSL}
          float seaNoise(vec2 p){return texture2D(uRipples,p).b;}
          void main(){
            vec2 p=vSeaWorld.xz;
            vec3 viewDirection=normalize(cameraPosition-vSeaWorld);
            float distanceToCamera=length(cameraPosition-vSeaWorld);
            float farFootprint=pow(distanceToCamera*.0018,2.);
            vec2 drift=vec2(.009,-.005)*uTime;
            vec2 textureP=p*vec2(.155,.112)+drift;
            textureP+=vec2(noise(p*.033),noise(p*.031+8.))*.35;
            vec2 micro=texture2D(uRipples,textureP).rg*2.-1.;
            vec2 micro2=texture2D(uRipples,mat2(.72,-.69,.69,.72)*p*.067-drift*.73).rg*2.-1.;
            vec3 wave=coastalWave(p,uTime,uWind,farFootprint);
            float windPatch=.64+.36*noise(p*.035+uTime*.003);
            vec2 slopes=wave.yz+(micro*.16+micro2*.075)*(.24+uWind*.76)*windPatch;
            vec3 normal=normalize(vec3(-slopes.x,1.,-slopes.y));
            float NoV=max(.015,dot(normal,viewDirection));
            float fresnel=.025+.975*pow(1.-NoV,5.);
            vec3 reflection=reflect(-viewDirection,normal);
            reflection.y=max(.012,abs(reflection.y));
            vec3 reflectionColor=skyColor(normalize(reflection),uNight);
            // The broad blue sky is reflected over most of the sea. The last
            // orange light occupies a small azimuth on the western horizon.
            vec2 sunset=normalize(vec2(.64,-.77));
            float alignment=max(0.,dot(normalize(reflection.xz),sunset));
            float orangeAzimuth=pow(alignment,26.);
            vec3 coolSky=mix(vec3(.070,.105,.168),vec3(.012,.023,.054),uNight);
            float skyHeight=clamp(reflection.y,0.,1.);
            coolSky*=.82+.18*skyHeight;
            reflectionColor=mix(coolSky,reflectionColor,.10+orangeAzimuth*.38);
            // Rough reflection of the luminous band, broken into short wavelets.
            float reflectionBand=exp(-pow(reflection.y/.19,2.))*orangeAzimuth;
            float rippledLight=smoothstep(.22,.7,texture2D(uRipples,textureP*.47+vec2(.12,1.3)).b);
            reflectionColor+=vec3(.21,.070,.024)*reflectionBand*(.30+rippledLight*.70)*(1.-uNight);
            vec3 body=mix(vec3(.020,.044,.072),vec3(.005,.014,.029),uNight);
            float swellLight=.90+.10*sin(p.x*.18+p.y*.13+uTime*.19);
            body*=swellLight;
            vec3 color=mix(body,reflectionColor,.14+fresnel*.81);
            color*=.82+.30*smoothstep(-.14,.20,wave.x);
            float crest=smoothstep(.08,.23,wave.x);
            color+=vec3(.009,.018,.021)*crest*(1.-uNight*.7);
            // Surf follows a baked field of the actual rock/ground footprints.
            // Advancing wave fronts and receding lace break along that shore.
            float foam=0.;
            if(distanceToCamera<155.){
              vec2 shoreUV=(p-uShoreBounds.xy)*uShoreBounds.zw;
              if(shoreUV.x>0.&&shoreUV.x<1.&&shoreUV.y>0.&&shoreUV.y<1.){
                vec2 field=texture2D(uShoreMap,shoreUV).rg;
                float d=field.r*8.;
                vec2 texel=vec2(1./512.,1./1024.);
                vec2 gradient=vec2(texture2D(uShoreMap,shoreUV+vec2(texel.x,0.)).r-texture2D(uShoreMap,shoreUV-vec2(texel.x,0.)).r,
                  texture2D(uShoreMap,shoreUV+vec2(0.,texel.y)).r-texture2D(uShoreMap,shoreUV-vec2(0.,texel.y)).r);
                vec2 outward=gradient/max(length(gradient),.00001);
                float windward=smoothstep(-.12,.75,dot(outward,normalize(vec2(1.,.2))));
                // A shared incoming swell reaches different parts of the irregular
                // shore at different phases. Broad torn fronts, then thinning
                // backwash: not one permanent cellular outline per rock.
                float swellPhase=dot(p,normalize(vec2(1.,.2)))*.88+uTime*.92;
                float arrival=swellPhase+noise(p*.22)*1.8;
                float impact=pow(max(0.,sin(arrival)),3.);
                float retreat=.5+.5*sin(arrival-1.45);
                vec2 tangent=vec2(-outward.y,outward.x);
                vec2 flow=p+outward*(sin(arrival)*.18+uTime*.027)+tangent*uTime*.012;
                float coarse=noise(flow*1.15+vec2(5.,9.));
                float broken=noise(flow*3.8+coarse*2.3);
                float bubbles=seaNoise(flow*.91+vec2(.1,-uTime*.008));
                float density=smoothstep(.38,.66,coarse*.48+broken*.36+bubbles*.16);
                float frontDistance=.20+(1.-impact)*.85+noise(p*.72)*.28+(broken-.5)*.15;
                float front=exp(-pow((d-frontDistance)/(.09+impact*.17),2.));
                float trailing=exp(-d*1.4)*retreat;
                float filaments=1.-smoothstep(.025,.11,abs(broken*.72+bubbles*.28-.51));
                float froth=smoothstep(.26,.63,noise(flow*9.3)*.56+seaNoise(flow*1.7)*.44);
                float tornFront=front*impact*(.22+.78*windward)*(.06+.94*density)*(.20+.80*froth);
                float backwash=trailing*(density*.46+filaments*.055)*(.16+.84*windward)*froth;
                foam=(tornFront*1.45+backwash*.39)*(1.-field.g);
                foam*=1.-smoothstep(1.7,3.0,d);
                color+=vec3(.003,.012,.013)*exp(-d*.45)*(1.-uNight*.8);
              }
            }
            vec3 foamColor=mix(vec3(.43,.49,.53),vec3(.065,.095,.13),uNight);
            color=mix(color,foamColor,clamp(foam,0.,.82));
            // Quiet amber flicker near the lit terrace rather than five long streaks.
            vec3 deckLight=vec3(-5.1,3.9,7.8)-vSeaWorld;
            float deckDistance=length(deckLight);
            vec3 halfVector=normalize(normalize(deckLight)+viewDirection);
            float deckSpec=pow(max(0.,dot(normal,halfVector)),95.);
            color+=vec3(.48,.18,.035)*deckSpec/(1.+deckDistance*deckDistance*.035);
            float underDeck=(1.-smoothstep(-5.15,-4.9,p.x))*smoothstep(-11.8,-11.1,p.x)*(1.-smoothstep(10.9,11.4,p.y))*smoothstep(-1.5,-1.,p.y);
            color*=1.-underDeck*.52;
            vec3 haze=mix(vec3(.085,.095,.135),vec3(.009,.016,.035),uNight);
            color=mix(color,haze,1.-exp(-distanceToCamera*.00052));
            gl_FragColor=vec4(color,1.);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `
      });
      // A flat central grid and quadratically stretched outer skirt reserve
      // geometry for the visible shore while meeting the distant horizon.
      const geometry = new THREE.PlaneGeometry(2, 2, 320, 320);
      geometry.rotateX(-Math.PI / 2);
      const positions = geometry.attributes.position;
      const stretch = v => {
        const a = Math.abs(v);
        return Math.sign(v) * (a < .65 ? a / .65 * 55 : 55 + Math.pow((a - .65) / .35, 2) * 1745);
      };
      for (let i = 0; i < positions.count; i++) positions.setXYZ(i, stretch(positions.getX(i)), 0, stretch(positions.getZ(i)));
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'Procedural coastal sea'; mesh.position.y = -.14;
      mesh.userData.surf={version:2,shoreField:true,phases:['incoming front','torn whitewater','receding wash'],maximumReach:3};
      scene.add(mesh);
      return { mesh, uniforms };
    }
  };
})();
