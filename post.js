/* Coastal contact shading. No addon, image, model, or network dependency. */
(() => {
  'use strict';
  window.CoastalPost = {
    create({ THREE, renderer, scene, camera, quality }) {
      const fallback = { enabled: false, available:false, render: () => renderer.render(scene, camera), resize() {},setQuality(){} };
      if (!quality.capabilities.hdr) return fallback;
      let profile=quality.current(),active=profile.post!=='off';

      const size = new THREE.Vector2();
      const depth = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
      depth.format = THREE.DepthFormat;
      depth.minFilter = depth.magFilter = THREE.NearestFilter;
      const color = new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType, format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        depthBuffer: true, stencilBuffer: false, depthTexture: depth
      });
      color.texture.colorSpace = THREE.LinearSRGBColorSpace;
      // WebGL 2 resolves the multisampled depth attachment into the depth
      // texture before the following passes, keeping fine wicker/roof edges.
      color.samples = profile.samples;
      const target = () => new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType, format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        depthBuffer: false, stencilBuffer: false
      });
      const aoA = target(), aoB = target(), bloomA = target(), bloomB = target();
      const passScene = new THREE.Scene();
      const passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
      quad.frustumCulled = false;
      passScene.add(quad);
      const vertexShader = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
      const reconstruct = `
        uniform sampler2D tDepth;
        uniform mat4 projectionInverse;
        vec3 viewPosition(vec2 uv) {
          float d=texture2D(tDepth,uv).x;
          vec4 p=projectionInverse*vec4(uv*2.-1.,d*2.-1.,1.);
          return p.xyz/p.w;
        }
      `;
      function shader(uniforms, fragmentShader, toneMapped = false) {
        return new THREE.ShaderMaterial({
          vertexShader, fragmentShader, uniforms, toneMapped,
          depthTest: false, depthWrite: false, blending: THREE.NoBlending
        });
      }
      const common = { tDepth: { value: depth }, projectionInverse: { value: camera.projectionMatrixInverse } };
      const ao = shader({ ...common,
        projection: { value: camera.projectionMatrix },
        viewInverse: { value: camera.matrixWorld },
        radius: { value: .43 },sampleCount:{value:profile.aoSamples||8}
      }, `
        varying vec2 vUv;
        uniform mat4 projection,viewInverse;
        uniform float radius,sampleCount;
        ${reconstruct}
        void main(){
          float d=texture2D(tDepth,vUv).x;
          if(d>.999995){gl_FragColor=vec4(1.);return;}
          vec3 p=viewPosition(vUv);
          // Only nearby solid surfaces need contact shading. Neither the sky
          // nor the distant sea should acquire a layer of screen-space dirt.
          if(-p.z>65.){gl_FragColor=vec4(1.);return;}
          vec3 world=(viewInverse*vec4(p,1.)).xyz;
          float surfaceMask=smoothstep(-.1,.8,world.y);
          vec3 n=normalize(cross(dFdx(p),dFdy(p)));
          if(dot(n,-p)<0.)n=-n;
          vec3 tangent=normalize(cross(n,abs(n.z)<.95?vec3(0.,0.,1.):vec3(0.,1.,0.)));
          vec3 bitangent=cross(n,tangent);
          float angle=fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453)*6.283185;
          float occlusion=0.;
          for(int i=0;i<12;i++){
            if(float(i)>=sampleCount)break;
            float f=float(i)+.5;
            float a=angle+f*2.399963;
            float h=.18+.72*fract(f*.618034);
            float r=sqrt(1.-h*h);
            float shell=.16+.84*(f/sampleCount)*(f/sampleCount);
            vec3 q=p+(tangent*cos(a)*r+bitangent*sin(a)*r+n*h)*radius*shell;
            vec4 clip=projection*vec4(q,1.);
            vec2 uv=clip.xy/clip.w*.5+.5;
            if(uv.x<.002||uv.y<.002||uv.x>.998||uv.y>.998)continue;
            vec3 s=viewPosition(uv);
            float dz=s.z-q.z;
            float nearSurface=1.-smoothstep(radius*.45,radius*1.6,length(s-p));
            occlusion+=smoothstep(.018,.065,dz)*nearSurface;
          }
          float fade=1.-smoothstep(30.,65.,-p.z);
          gl_FragColor=vec4(vec3(1.-occlusion/sampleCount*.53*fade*surfaceMask),1.);
        }
      `);
      ao.extensions.derivatives = true;
      const aoBlur = shader({ ...common, tInput: { value: aoA.texture }, stepUV: { value: new THREE.Vector2() } }, `
        varying vec2 vUv;
        uniform sampler2D tInput;
        uniform vec2 stepUV;
        ${reconstruct}
        void main(){
          float z=viewPosition(vUv).z;
          float sum=0.,weight=0.;
          for(int i=-3;i<=3;i++){
            float k=float(i);
            vec2 uv=vUv+stepUV*k;
            float dz=abs(viewPosition(uv).z-z);
            float w=exp(-k*k*.26)*exp(-dz/max(.025,-z*.004));
            sum+=texture2D(tInput,uv).r*w;weight+=w;
          }
          gl_FragColor=vec4(vec3(sum/max(weight,.0001)),1.);
        }
      `);
      const bright = shader({ tInput: { value: color.texture }, pixel: { value: new THREE.Vector2() } }, `
        varying vec2 vUv;uniform sampler2D tInput;uniform vec2 pixel;
        void main(){
          vec3 c=(texture2D(tInput,vUv+pixel*vec2(-.5,-.5)).rgb+
                  texture2D(tInput,vUv+pixel*vec2(.5,-.5)).rgb+
                  texture2D(tInput,vUv+pixel*vec2(-.5,.5)).rgb+
                  texture2D(tInput,vUv+pixel*vec2(.5,.5)).rgb)*.25;
          float l=max(c.r,max(c.g,c.b));
          float threshold=smoothstep(.85,1.3,l)*max(l-.85,0.)/max(l,.001);
          gl_FragColor=vec4(min(c*threshold,vec3(8.)),1.);
        }
      `);
      const blur = shader({ tInput: { value: bloomA.texture }, stepUV: { value: new THREE.Vector2() } }, `
        varying vec2 vUv;uniform sampler2D tInput;uniform vec2 stepUV;
        void main(){
          vec3 c=texture2D(tInput,vUv).rgb*.227027;
          c+=(texture2D(tInput,vUv+stepUV*1.384615).rgb+texture2D(tInput,vUv-stepUV*1.384615).rgb)*.316216;
          c+=(texture2D(tInput,vUv+stepUV*3.230769).rgb+texture2D(tInput,vUv-stepUV*3.230769).rgb)*.070270;
          gl_FragColor=vec4(c,1.);
        }
      `);
      const finish = shader({ tColor: { value: color.texture }, tAO: { value: aoA.texture }, tBloom: { value: bloomA.texture }, frame: { value: 0 } }, `
        varying vec2 vUv;
        uniform sampler2D tColor,tAO,tBloom;
        uniform float frame;
        void main(){
          vec3 c=texture2D(tColor,vUv).rgb;
          c*=texture2D(tAO,vUv).r;
          c+=texture2D(tBloom,vUv).rgb*.12;
          // Restrained optical falloff: the scene retains its natural color
          // contrast rather than acquiring a heavy graded filter.
          vec2 edge=vUv*(1.-vUv);
          c*=.975+.025*pow(16.*edge.x*edge.y,.22);
          gl_FragColor=vec4(c,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          // One sub-byte of dither prevents banding in the dusk gradient.
          float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233))+frame*.1)*43758.5453)-.5;
          gl_FragColor.rgb+=grain/400.;
        }
      `, true);

      function pass(material, out) {
        quad.material = material;
        renderer.setRenderTarget(out);
        renderer.render(passScene, passCamera);
      }
      let width = 1, height = 1, halfWidth = 1, halfHeight = 1;
      function resize() {
        // Drawing-buffer size includes DPR and stays correct if callers resize
        // the renderer before invoking this method.
        renderer.getDrawingBufferSize(size);
        width = active?Math.max(1, Math.floor(size.x)):1; height = active?Math.max(1, Math.floor(size.y)):1;
        halfWidth = Math.max(1, Math.ceil(width / 2)); halfHeight = Math.max(1, Math.ceil(height / 2));
        color.setSize(width, height);
        for (const rt of [aoA, aoB, bloomA, bloomB]) rt.setSize(halfWidth, halfHeight);
        bright.uniforms.pixel.value.set(1 / width, 1 / height);
      }
      resize();
      let warned = false;
      const api = { enabled: active, available:true,resize,
        setQuality(next){profile=next;active=next.post!=='off';api.enabled=active;ao.uniforms.sampleCount.value=next.aoSamples||8;if(color.samples!==next.samples){color.dispose();color.samples=next.samples;}resize();},
        render() {
          if (!api.enabled) { renderer.render(scene, camera); return; }
          const previousTarget = renderer.getRenderTarget();
          const tone = renderer.toneMapping;
          const output = renderer.outputColorSpace;
          const autoClear = renderer.autoClear;
          try {
            renderer.autoClear = true;
            renderer.toneMapping = THREE.NoToneMapping;
            renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
            renderer.setRenderTarget(color);
            renderer.render(scene, camera);
            pass(ao, aoA);
            aoBlur.uniforms.tInput.value = aoA.texture;
            aoBlur.uniforms.stepUV.value.set(1 / halfWidth, 0); pass(aoBlur, aoB);
            aoBlur.uniforms.tInput.value = aoB.texture;
            aoBlur.uniforms.stepUV.value.set(0, 1 / halfHeight); pass(aoBlur, aoA);
            pass(bright, bloomA);
            blur.uniforms.tInput.value = bloomA.texture;
            blur.uniforms.stepUV.value.set(.8 / halfWidth, 0); pass(blur, bloomB);
            blur.uniforms.tInput.value = bloomB.texture;
            blur.uniforms.stepUV.value.set(0, .8 / halfHeight); pass(blur, bloomA);
            renderer.toneMapping = tone;
            renderer.outputColorSpace = output;
            finish.uniforms.frame.value += 1;
            pass(finish, previousTarget);
          } catch (error) {
            api.enabled = false;
            if (!warned) { console.warn('Contact shading unavailable; using native rendering.', error); warned = true; }
            renderer.toneMapping = tone; renderer.outputColorSpace = output;
            renderer.setRenderTarget(previousTarget); renderer.render(scene, camera);
          } finally {
            renderer.toneMapping = tone; renderer.outputColorSpace = output; renderer.autoClear = autoClear;
            renderer.setRenderTarget(previousTarget);
          }
        }
      };
      return api;
    }
  };
})();
