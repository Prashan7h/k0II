/* ===== AUDIO ENGINE ===== */
let ctx=null, masterGain, masterComp, masterFilter, bitcrusher;
let fxInput, fxWet, fxDry, fxBusGain;
let delayNode, delayFeedback, delayFilter, convolver, reverbGain, revFilter;
let distortion, distortionGain, distFilter;
let chorusDelay, chorusLfo, chorusGain, fxFilter, compressor;
const groupGains=[], groupFxSends=[], groupFilters=[], groupTremolos=[];
let punchBus, punchFilter, punchGain, tapeRate=1, grainBuf=null;
let analyser;
const activeVoices=new Map();

function makeImpulse(seconds, decay){
  const rate=44100, len=Math.floor(rate*seconds);
  const ac=ctx||new (window.AudioContext||window.webkitAudioContext)();
  const buf=ac.createBuffer(2,len,rate);
  for(let c=0;c<2;c++){ const d=buf.getChannelData(c); for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,decay); }
  return buf;
}
function makeDistortionCurve(amount){
  const n=256, curve=new Float32Array(n), k=amount;
  for(let i=0;i<n;i++){ const x=(i*2)/n-1; curve[i]=((Math.PI+k)*x)/(Math.PI+k*Math.abs(x)); }
  return curve;
}

function ensureAudio(){
  if(ctx) return ctx;
  const AC=window.AudioContext||window.webkitAudioContext;
  ctx=new AC();
  masterGain=ctx.createGain(); masterGain.gain.value=state.volume;
  masterComp=ctx.createDynamicsCompressor();
  masterComp.threshold.value=-16; masterComp.knee.value=10; masterComp.ratio.value=3;
  masterComp.attack.value=0.003; masterComp.release.value=0.12;
  masterFilter=ctx.createBiquadFilter(); masterFilter.type="lowpass"; masterFilter.frequency.value=20000;
  punchFilter=ctx.createBiquadFilter(); punchFilter.type="lowpass"; punchFilter.frequency.value=18000; punchFilter.Q.value=1;
  punchGain=ctx.createGain(); punchGain.gain.value=1;
  analyser=ctx.createAnalyser(); analyser.fftSize=256;

  fxInput=ctx.createGain(); fxDry=ctx.createGain(); fxDry.gain.value=1;
  fxWet=ctx.createGain(); fxWet.gain.value=0.55; fxBusGain=ctx.createGain();

  delayNode=ctx.createDelay(2.0); delayNode.delayTime.value=0.3;
  delayFeedback=ctx.createGain(); delayFeedback.gain.value=0.35;
  delayFilter=ctx.createBiquadFilter(); delayFilter.type="lowpass"; delayFilter.frequency.value=4500;
  delayNode.connect(delayFilter); delayFilter.connect(delayFeedback); delayFeedback.connect(delayNode);

  convolver=ctx.createConvolver(); convolver.buffer=makeImpulse(1.6,2.2);
  reverbGain=ctx.createGain(); reverbGain.gain.value=0.45;
  revFilter=ctx.createBiquadFilter(); revFilter.type="lowpass"; revFilter.frequency.value=6000;

  distortion=ctx.createWaveShaper(); distortion.curve=makeDistortionCurve(45); distortion.oversample="2x";
  distortionGain=ctx.createGain(); distortionGain.gain.value=0.35;
  distFilter=ctx.createBiquadFilter(); distFilter.type="lowpass"; distFilter.frequency.value=8000;

  chorusDelay=ctx.createDelay(0.05); chorusDelay.delayTime.value=0.014;
  chorusLfo=ctx.createOscillator();
  const chorusLfoGain=ctx.createGain(); chorusLfoGain.gain.value=0.004;
  chorusLfo.frequency.value=1.4; chorusLfo.connect(chorusLfoGain); chorusLfoGain.connect(chorusDelay.delayTime); chorusLfo.start();
  chorusGain=ctx.createGain(); chorusGain.gain.value=0.4;

  fxFilter=ctx.createBiquadFilter(); fxFilter.type="lowpass"; fxFilter.frequency.value=8000; fxFilter.Q.value=2;
  compressor=ctx.createDynamicsCompressor(); compressor.threshold.value=-22; compressor.ratio.value=5; compressor.attack.value=0.005; compressor.release.value=0.1;

  // Groups -> dry/send -> punchFilter -> masterFilter -> masterComp -> masterGain -> dest
  for(let g=0;g<4;g++){
    const gg=ctx.createGain(); gg.gain.value=0.9*groupProjectVol[g];
    const send=ctx.createGain(); send.gain.value=0.12;
    const filt=ctx.createBiquadFilter(); filt.type="lowpass"; filt.frequency.value=18000;
    const trem=ctx.createGain(); trem.gain.value=1;
    gg.connect(filt); filt.connect(trem); trem.connect(fxDry); trem.connect(send); send.connect(fxInput);
    groupGains.push(gg); groupFxSends.push(send); groupFilters.push(filt); groupTremolos.push(trem);
  }
  fxDry.connect(punchFilter); fxWet.connect(punchFilter);
  punchFilter.connect(punchGain); punchGain.connect(masterFilter);
  masterFilter.connect(masterComp); masterComp.connect(masterGain); masterGain.connect(analyser); analyser.connect(ctx.destination);
  applyFx();
  installStretchWorklet();
  return ctx;
}

function applyFx(){
  if(!ctx) return;
  try{ fxInput.disconnect(); }catch(_){}
  [delayNode,convolver,distortion,chorusDelay,fxFilter,compressor,revFilter,distFilter].forEach(n=>{ try{n.disconnect();}catch(_){} });
  if(state.fxOff){ return; }
  const x=state.fxParams.x, y=state.fxParams.y;
  switch(state.fxIndex){
    case 0:
      delayNode.delayTime.value=lerp(0.05,0.75,x); delayFeedback.gain.value=lerp(0.05,0.8,y);
      fxInput.connect(delayNode); delayNode.connect(fxWet); break;
    case 1:
      reverbGain.gain.value=lerp(0.1,0.95,x); revFilter.frequency.value=lerp(1500,12000,y);
      fxInput.connect(convolver); convolver.connect(revFilter); revFilter.connect(reverbGain); reverbGain.connect(fxWet); break;
    case 2:
      distortion.curve=makeDistortionCurve(lerp(8,140,x)); distortionGain.gain.value=lerp(0.12,0.7,y);
      distFilter.frequency.value=lerp(2000,12000,y);
      fxInput.connect(distortion); distortion.connect(distFilter); distFilter.connect(distortionGain); distortionGain.connect(fxWet); break;
    case 3:
      chorusLfo.frequency.value=lerp(0.2,5,x); chorusGain.gain.value=lerp(0.1,0.75,y);
      fxInput.connect(chorusDelay); chorusDelay.connect(chorusGain); chorusGain.connect(fxWet); break;
    case 4:
      fxFilter.type=x<0.5?"lowpass":"highpass";
      fxFilter.frequency.value=lerp(180,9000, x<0.5?x*2:(x-0.5)*2);
      fxFilter.Q.value=lerp(0.4,14,y); fxInput.connect(fxFilter); fxFilter.connect(fxWet); break;
    case 5:
      compressor.threshold.value=lerp(-40,-8,x); compressor.ratio.value=lerp(2,14,y);
      fxInput.connect(compressor); compressor.connect(fxWet); break;
  }
}

/* WSOLA-ish stretch via AudioWorklet (inline) */
let stretchNodeClass=null;
async function installStretchWorklet(){
  if(!ctx||stretchNodeClass) return;
  const code=`
class WsolaProcessor extends AudioWorkletProcessor {
  constructor(){ super(); this.buf=null; this.pos=0; this.ratio=1; this.grain=1024; this.hop=256;
    this.port.onmessage=(e)=>{ if(e.data.buf){ this.buf=e.data.buf; this.pos=0; this.ratio=e.data.ratio||1; } }; }
  process(inputs, outputs){
    const out=outputs[0][0]; if(!out) return true;
    if(!this.buf){ out.fill(0); return true; }
    const g=this.grain, hopIn=this.hop, hopOut=Math.max(1, Math.round(hopIn*this.ratio));
    for(let i=0;i<out.length;i++){
      const p=this.pos|0;
      let s=0, wsum=0;
      for(let k=0;k<g;k++){
        const idx=p+k; if(idx>=this.buf.length) break;
        const w=0.5-0.5*Math.cos(2*Math.PI*k/g);
        s+=this.buf[idx]*w; wsum+=w;
      }
      out[i]=wsum?s/wsum:0;
      this.pos+=this.ratio;
      if(this.pos>=this.buf.length) this.pos=0;
    }
    return true;
  }
}
registerProcessor('wsola-stretch', WsolaProcessor);
`;
  try{
    const blob=new Blob([code],{type:"application/javascript"});
    await ctx.audioWorklet.addModule(URL.createObjectURL(blob));
    stretchNodeClass=true;
  }catch(e){ console.warn("Worklet unavailable", e); }
}

/** Offline-friendly stretch: return new AudioBuffer time-stretched independent of pitch */
function stretchBuffer(buffer, ratio){
  if(!buffer||Math.abs(ratio-1)<0.02) return buffer;
  const ch=buffer.numberOfChannels, sr=buffer.sampleRate;
  const srcLen=buffer.length;
  const dstLen=Math.max(1, Math.floor(srcLen/ratio));
  const out=ctx.createBuffer(ch, dstLen, sr);
  const grain=1024, hopOut=256, hopIn=Math.max(1, Math.round(hopOut*ratio));
  for(let c=0;c<ch;c++){
    const src=buffer.getChannelData(c), dst=out.getChannelData(c);
    let read=0, write=0;
    while(write+grain<dstLen && read+grain<srcLen){
      for(let k=0;k<grain;k++){
        const w=0.5-0.5*Math.cos(2*Math.PI*k/grain);
        const idx=write+k;
        if(idx<dstLen) dst[idx]+=src[Math.min(srcLen-1, read+k)]*w;
      }
      read+=hopIn; write+=hopOut;
    }
    // normalize peaks from overlap
    let peak=0; for(let i=0;i<dstLen;i++) peak=Math.max(peak, Math.abs(dst[i]));
    if(peak>1) for(let i=0;i<dstLen;i++) dst[i]/=peak;
  }
  return out;
}

function getPlayBuffer(snd){
  if(!snd||!snd.buffer) return null;
  if(snd.stretchMode==="bpm" && snd.sampleBpm>0){
    const ratio=(snd.sampleBpm/state.bpm)*(snd.timeStretch||1);
    if(!snd.stretched || snd.stretchBpm!==state.bpm || snd._stretchRatio!==ratio){
      snd.stretched=stretchBuffer(snd.buffer, ratio);
      snd.stretchBpm=state.bpm; snd._stretchRatio=ratio;
    }
    return snd.stretched;
  }
  if(snd.stretchMode==="bar"){
    // fit to N bars
    const bars=Math.max(1, Math.round(snd.timeStretch||1));
    const targetDur=(60/state.bpm)*4*bars;
    const ratio=snd.buffer.duration/targetDur;
    if(!snd.stretched || snd._stretchRatio!==ratio){
      snd.stretched=stretchBuffer(snd.buffer, ratio);
      snd._stretchRatio=ratio;
    }
    return snd.stretched;
  }
  return snd.buffer;
}

function stopVoice(key, when){
  const list=activeVoices.get(key)||[];
  const t=when||(ctx?ctx.currentTime:0);
  for(const v of list){
    try{
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setValueAtTime(Math.max(v.g.gain.value,0.0001),t);
      v.g.gain.linearRampToValueAtTime(0.0001,t+0.03);
      v.src.stop(t+0.05);
    }catch(_){}
  }
  activeVoices.set(key,[]);
}

function playSound(group, padIndex, when, velocity, pitchOffset, gateDur, locks){
  velocity=velocity==null?1:velocity; pitchOffset=pitchOffset||0; locks=locks||{};
  ensureAudio(); if(ctx.state==="suspended") ctx.resume();
  let playPad=padIndex;
  if(sampleSwapMap && sampleSwapMap.has(padIndex) && group===state.group){
    playPad=sampleSwapMap.get(padIndex);
  }
  let snd=pads[group][playPad];
  if(!snd) return;
  // velocity layers (use original padIndex for layer selection on the sounding sample)
  if(snd.layers && snd.layers.length){
    const layer=snd.layers.find(L=>velocity>=L.min && velocity<=L.max) || snd.layers[snd.layers.length-1];
    if(layer && layer.buffer) snd={...snd, buffer:layer.buffer};
  }
  const buf=getPlayBuffer(snd);
  if(!buf) return;

  const key=group+":"+padIndex;
  if(snd.playMode===0||snd.playMode===2) stopVoice(key, when);

  const src=ctx.createBufferSource();
  src.buffer=buf;
  let rate=Math.pow(2,( (locks.pitch!=null?locks.pitch:snd.pitch)+snd.tune+pitchOffset )/12);
  if(snd.stretchMode==="off") rate*=(snd.timeStretch||1);
  // punch pitch random / octave
  if(state.punchFx.has(9)) rate*=Math.pow(2, -state.punchFx.get(9)*0.5); // pitch rand down
  if(state.punchFx.has(1)) rate*=Math.pow(2, -1 + state.punchFx.get(1)*0.5); // oct down
  if(state.punchFx.has(7)) { /* tape handled globally */ }
  src.playbackRate.value=rate * (tapeRate||1);
  if(snd.playMode===3) src.loop=true;

  const g=ctx.createGain();
  const panner=ctx.createStereoPanner?ctx.createStereoPanner():null;
  const lpf=ctx.createBiquadFilter(); lpf.type="lowpass";
  const hpf=ctx.createBiquadFilter(); hpf.type="highpass";

  const levelBase=(locks.level!=null?locks.level:snd.level)*velocity*(snd.velSens||1);
  // velocity affects filter & attack (harder = brighter & snappier)
  const velBright=lerp(0.4,1,velocity);
  let lpfFreq=(locks.lpf!=null?locks.lpf:snd.lpf)*velBright;
  let hpfFreq=locks.hpf!=null?locks.hpf:snd.hpf;
  let attack=Math.max(0.0005,(locks.atk!=null?locks.atk:snd.atk)*(2-velocity));
  let release=locks.rel!=null?locks.rel:snd.rel;
  let pan=locks.pan!=null?locks.pan:snd.pan;

  if(group===state.group){
    const fa=FADER_ASSIGNS[state.faderAssign], fv=state.fader;
    if(fa==="LEVEL") {/* applied via group or level */}
    if(fa==="PITCH"||fa==="TUNE") rate*=Math.pow(2,((fv-0.5)*24)/12), src.playbackRate.value=rate*(tapeRate||1);
    if(fa==="LPF") lpfFreq=lerp(200,18000,fv);
    if(fa==="HPF") hpfFreq=lerp(20,5000,fv);
    if(fa==="ATK") attack=lerp(0.001,0.4,fv);
    if(fa==="REL") release=lerp(0.01,0.8,fv);
    if(fa==="PAN"&&panner) pan=(fv-0.5)*2;
    if(fa==="FX") groupFxSends[group].gain.setValueAtTime(fv, when);
    if(fa==="LEVEL") { /* multiply */ }
  }
  // fader level assign
  let level=levelBase;
  if(group===state.group && FADER_ASSIGNS[state.faderAssign]==="LEVEL") level*=state.fader;
  level*=groupProjectVol[group];

  lpf.frequency.value=clamp(lpfFreq,80,20000);
  hpf.frequency.value=clamp(hpfFreq,20,8000);
  if(panner) panner.pan.value=pan;

  const t0=Math.max(when, ctx.currentTime);
  g.gain.setValueAtTime(0,t0);
  g.gain.linearRampToValueAtTime(level, t0+attack);

  const startOff=(locks.start!=null?locks.start:snd.start)*buf.duration;
  const endOff=(locks.end!=null?locks.end:snd.end)*buf.duration;
  const dur=Math.max(0.01,(endOff-startOff)/Math.max(0.01,Math.abs(src.playbackRate.value)));

  src.connect(hpf); hpf.connect(lpf);
  if(panner){ lpf.connect(panner); panner.connect(g); } else lpf.connect(g);
  g.connect(groupGains[group]);
  // per-sound FX send momentarily
  groupFxSends[group].gain.setTargetAtTime(snd.fxSend, t0, 0.01);

  try{
    if(src.loop){ src.loopStart=startOff; src.loopEnd=endOff; src.start(t0, startOff); }
    else src.start(t0, startOff, (gateDur!=null?gateDur:dur)+release);
  }catch(e){ console.warn(e); return; }

  if(snd.playMode!==3 && gateDur==null){
    const stopAt=t0+dur;
    g.gain.setValueAtTime(level, Math.max(t0+attack, stopAt-release));
    g.gain.linearRampToValueAtTime(0.0001, stopAt);
    try{ src.stop(stopAt+0.03); }catch(_){}
  } else if(gateDur!=null){
    const stopAt=t0+gateDur;
    g.gain.setValueAtTime(level, Math.max(t0+attack, stopAt-release));
    g.gain.linearRampToValueAtTime(0.0001, stopAt);
    try{ src.stop(stopAt+0.03); }catch(_){}
  }

  const voice={src,g};
  if(snd.playMode!==1) activeVoices.set(key,[voice]);
  else { if(!activeVoices.has(key)) activeVoices.set(key,[]); activeVoices.get(key).push(voice); }

  // MIDI out
  if(window.__ko2 && window.__ko2.sendMidiNote) window.__ko2.sendMidiNote(group, padIndex, velocity, true);

  const el=document.querySelector('.pad[data-pad="'+padIndex+'"]');
  if(el && group===state.group){ el.classList.add("hit"); setTimeout(()=>el.classList.remove("hit"),70); }
}

function playMetronome(when, accent){
  ensureAudio();
  const o=ctx.createOscillator(), g=ctx.createGain();
  o.frequency.value=accent?1400:900;
  g.gain.setValueAtTime(0,when);
  g.gain.linearRampToValueAtTime(state.metroVol*0.35, when+0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, when+0.04);
  o.connect(g); g.connect(masterGain); o.start(when); o.stop(when+0.05);
}

/* Punch-in FX application */
let tremLfo=null, filterLfo=null, punchInterval=null;
let sampleSwapMap=null; // padIndex -> swapPadIndex when punch swap active

function updatePunchFx(){
  if(!ctx) return;
  const t=ctx.currentTime;
  const active=state.punchFx;
  // reset defaults then apply
  let lpf=18000, hpf=20, tremDepth=0, tremRate=4, sendBoost=0, bit=0, grain=0;
  tapeRate=1;

  if(active.has(3)){ // LPF pad 4
    lpf=lerp(18000,300, active.get(3));
  }
  if(active.has(4)){ // HPF pad 5
    hpf=lerp(20,6000, active.get(4));
  }
  if(active.has(0)){ // tremolo pad 7
    tremDepth=active.get(0)*0.9; tremRate=lerp(2,18,active.get(0));
  }
  if(active.has(5)){ // send FX pad 6
    sendBoost=active.get(5);
    for(let g=0;g<4;g++) groupFxSends[g].gain.setTargetAtTime(clamp(0.1+sendBoost,0,1), t, 0.03);
  }
  if(active.has(2)){ // decimator pad 9 - simulate with lowpass + gain crunch
    bit=active.get(2);
    masterFilter.frequency.setTargetAtTime(lerp(12000,800,bit), t, 0.04);
    punchGain.gain.setTargetAtTime(1+bit*0.4, t, 0.04);
  } else {
    masterFilter.frequency.setTargetAtTime(20000, t, 0.08);
    punchGain.gain.setTargetAtTime(1, t, 0.08);
  }
  if(active.has(7)){ // tape stop pad 2
    tapeRate=lerp(1, 0.05, active.get(7));
  }
  if(active.has(8)){ // filter LFO pad 3
    const spd=lerp(0.5,12, active.get(8));
    if(!filterLfo){
      filterLfo=ctx.createOscillator();
      const gv=ctx.createGain(); gv.gain.value=4000;
      filterLfo.connect(gv); gv.connect(punchFilter.frequency);
      filterLfo.frequency.value=spd; filterLfo.start();
      filterLfo._g=gv;
    } else filterLfo.frequency.setTargetAtTime(spd,t,0.05);
  } else if(filterLfo){
    try{ filterLfo.stop(); }catch(_){}
    filterLfo=null;
  }
  if(active.has(6)){ // beat repeat - stutter via gain
    const len=lerp(0.02,0.2, active.get(6));
    if(!punchInterval){
      punchInterval=setInterval(()=>{
        if(!ctx||!state.punchFx.has(6)) return;
        const now=ctx.currentTime;
        punchGain.gain.setValueAtTime(1, now);
        punchGain.gain.setValueAtTime(0.05, now+len*0.5);
        punchGain.gain.setValueAtTime(1, now+len);
      }, Math.max(30, len*1000));
    }
  } else if(punchInterval){ clearInterval(punchInterval); punchInterval=null; }

  // apply LPF/HPF combo as bandpass-ish
  if(active.has(3)||active.has(4)){
    if(active.has(3)&&active.has(4)){
      punchFilter.type="bandpass";
      punchFilter.frequency.setTargetAtTime(lerp(200,4000,(active.get(3)+active.get(4))/2), t, 0.04);
      punchFilter.Q.setTargetAtTime(4, t, 0.04);
    } else if(active.has(3)){
      punchFilter.type="lowpass"; punchFilter.frequency.setTargetAtTime(lpf,t,0.04); punchFilter.Q.value=1;
    } else {
      punchFilter.type="highpass"; punchFilter.frequency.setTargetAtTime(hpf,t,0.04); punchFilter.Q.value=1;
    }
  } else if(!active.has(8)){
    punchFilter.type="lowpass"; punchFilter.frequency.setTargetAtTime(18000,t,0.08); punchFilter.Q.value=0.7;
  }

  // tremolo
  if(tremDepth>0){
    for(let g=0;g<4;g++){
      const tg=groupTremolos[g];
      tg.gain.cancelScheduledValues(t);
      // approximate with LFO via script - simple setTarget oscillation using oscillator
    }
    if(!tremLfo){
      tremLfo=ctx.createOscillator();
      const depth=ctx.createGain(); depth.gain.value=tremDepth*0.5;
      tremLfo.connect(depth);
      for(let g=0;g<4;g++) depth.connect(groupTremolos[g].gain);
      // offset base
      for(let g=0;g<4;g++) groupTremolos[g].gain.setValueAtTime(1-tremDepth*0.5, t);
      tremLfo.frequency.value=tremRate; tremLfo.start();
      tremLfo._depth=depth;
    } else {
      tremLfo.frequency.setTargetAtTime(tremRate,t,0.05);
      tremLfo._depth.gain.setTargetAtTime(tremDepth*0.5,t,0.05);
    }
  } else if(tremLfo){
    try{ tremLfo.stop(); }catch(_){}
    tremLfo=null;
    for(let g=0;g<4;g++) groupTremolos[g].gain.setTargetAtTime(1,t,0.05);
  }

  if(active.has(11)){ // granuliser - rapid gating
    const gs=lerp(0.01,0.08, active.get(11));
    punchGain.gain.setValueAtTime(1, t);
    punchGain.gain.linearRampToValueAtTime(0.1, t+gs*0.5);
    punchGain.gain.linearRampToValueAtTime(1, t+gs);
  }

  // Sample swap (pad "0" -> punch index 10): shuffle pad→pad mapping for current group
  if(active.has(10)){
    if(!sampleSwapMap){
      const idxs=[0,1,2,3,4,5,6,7,8,9,10,11].filter(i=>pads[state.group][i]&&pads[state.group][i].buffer);
      const shuffled=idxs.slice();
      for(let i=shuffled.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]]; }
      sampleSwapMap=new Map();
      idxs.forEach((from,i)=>sampleSwapMap.set(from, shuffled[i]));
      // ensure at least some differ
      if(idxs.length>1 && idxs.every((from,i)=>sampleSwapMap.get(from)===from)){
        sampleSwapMap.set(idxs[0], idxs[1]); sampleSwapMap.set(idxs[1], idxs[0]);
      }
    }
  } else {
    sampleSwapMap=null;
  }
}

function clearPunchFx(){
  state.punchFx.clear();
  if(!ctx) return;
  const t=ctx.currentTime;
  punchFilter.type="lowpass"; punchFilter.frequency.setTargetAtTime(18000,t,0.08);
  punchGain.gain.setTargetAtTime(1,t,0.05);
  masterFilter.frequency.setTargetAtTime(20000,t,0.08);
  tapeRate=1;
  if(tremLfo){ try{tremLfo.stop();}catch(_){} tremLfo=null; }
  if(filterLfo){ try{filterLfo.stop();}catch(_){} filterLfo=null; }
  if(punchInterval){ clearInterval(punchInterval); punchInterval=null; }
  sampleSwapMap=null;
  for(let g=0;g<4;g++) groupTremolos[g].gain.setTargetAtTime(1,t,0.05);
}

Object.assign(window.__ko2, {
  ensureAudio, applyFx, playSound, playMetronome, stopVoice, getPlayBuffer, stretchBuffer,
  updatePunchFx, clearPunchFx, groupGains, groupFxSends, groupFilters,
});
Object.defineProperties(window.__ko2, {
  ctx: { get(){ return ctx; }, configurable: true },
  masterGain: { get(){ return masterGain; }, configurable: true },
  fxWet: { get(){ return fxWet; }, configurable: true },
  nodes: { get(){ return { masterGain, masterComp, masterFilter, punchFilter, punchGain, fxInput, fxWet, fxDry, delayNode, delayFeedback, convolver, reverbGain, distortion, distortionGain, chorusDelay, chorusGain, fxFilter, compressor, groupGains, groupFxSends, groupFilters, analyser }; }, configurable: true },
});
