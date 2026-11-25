/* Local rendering budgets: the same scene on desktop and constrained GPUs. */
(() => {
  'use strict';
  window.CoastalQuality={create(THREE,renderer){
    const gl=renderer.getContext(),webgl2=renderer.capabilities.isWebGL2;
    const limits={maxTextureSize:renderer.capabilities.maxTextureSize,maxRenderbuffer:gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)};
    const capabilities={webgl2,uintIndices:webgl2||!!renderer.extensions.get('OES_element_index_uint'),instancing:webgl2||!!renderer.extensions.get('ANGLE_instanced_arrays'),derivatives:webgl2||!!renderer.extensions.get('OES_standard_derivatives'),hdr:false,samples:0};
    if(webgl2&&renderer.extensions.has('EXT_color_buffer_float')){
      const previous=renderer.getRenderTarget(),probe=new THREE.WebGLRenderTarget(4,4,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,depthBuffer:true});
      try{
        renderer.setRenderTarget(probe);
        capabilities.hdr=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
        if(capabilities.hdr){
          const color=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES)||[]);
          const depth=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,gl.SAMPLES)||[]);
          capabilities.samples=Math.max(0,...color.filter(n=>n<=4&&depth.includes(n)));
        }
      }catch(error){capabilities.hdr=false;}finally{renderer.setRenderTarget(previous);probe.dispose();}
    }
    const profiles={
      high:{name:'精细',ratio:1.75,pixels:2600000,shadow:2048,reflection:512,post:'full',aoSamples:12,samples:Math.min(4,capabilities.samples)},
      balanced:{name:'均衡',ratio:1.35,pixels:1400000,shadow:1024,reflection:256,post:'balanced',aoSamples:8,samples:0},
      low:{name:'流畅',ratio:1,pixels:750000,shadow:1024,reflection:128,post:'off',aoSamples:0,samples:0}
    };
    const coarse=matchMedia('(pointer:coarse)').matches,small=innerWidth<700;
    const memory=navigator.deviceMemory||8,cores=navigator.hardwareConcurrency||8;
    let automaticLevel=(!webgl2||memory<=2)?'low':(coarse&&small||memory<=4||cores<=4||navigator.connection?.saveData)?'balanced':'high';
    let mode='auto';try{mode=new URLSearchParams(location.search).get('quality')||localStorage.getItem('coastal-quality')||'auto';}catch(error){}
    if(!['auto','high','balanced','low'].includes(mode))mode='auto';
    let level=mode==='auto'?automaticLevel:mode,callback=()=>{},suspended=false;
    let lastChange=performance.now(),windowStart=lastChange,frames=0,total=0,lastMean=0;
    function current(){return {...profiles[level],level,post:capabilities.hdr?profiles[level].post:'off'};}
    function pixelRatio(){const p=current(),w=Math.max(1,innerWidth),h=Math.max(1,innerHeight);return Math.min(devicePixelRatio||1,p.ratio,Math.sqrt(p.pixels/(w*h)),limits.maxRenderbuffer/w,limits.maxRenderbuffer/h,limits.maxTextureSize/w,limits.maxTextureSize/h);}
    function reset(){windowStart=performance.now();frames=0;total=0;}
    function change(next){if(next===level)return;level=next;lastChange=performance.now();reset();callback(current());}
    const api={capabilities,current,pixelRatio,
      onChange(fn){callback=fn;},
      setMode(next){if(!['auto','high','balanced','low'].includes(next))return;mode=next;if(mode==='auto')automaticLevel=(!webgl2||memory<=2)?'low':(coarse&&small||memory<=4||cores<=4)?'balanced':'high';try{localStorage.setItem('coastal-quality',mode);}catch(error){}const nextLevel=mode==='auto'?automaticLevel:mode;if(level===nextLevel){reset();callback(current());}else change(nextLevel);},
      suspend(value){suspended=value;reset();},
      sample(ms){if(mode!=='auto'||suspended||document.hidden)return;const now=performance.now();if(now-lastChange<8000)return;frames++;total+=Math.min(ms,500);if(now-windowStart<4000||frames<8)return;lastMean=total/frames;reset();if(level==='high'&&lastMean>42){automaticLevel='balanced';change(automaticLevel);}else if(level==='balanced'&&lastMean>65){automaticLevel='low';change(automaticLevel);}else if(now-lastChange>30000&&lastMean<21&&level!=='high'){automaticLevel=level==='low'?'balanced':'high';change(automaticLevel);}},
      stats(){const p=current();return {mode,level,name:p.name,pixelRatio:renderer.getPixelRatio(),pixelBudget:p.pixels,post:p.post,meanFrameMs:lastMean,capabilities:{...capabilities}};}
    };return api;
  }};
})();
