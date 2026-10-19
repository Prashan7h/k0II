/* ===== PERSISTENCE (IndexedDB) + BOUNCE ===== */
const DB_NAME="ko2-db", DB_STORE="projects";

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>req.result.createObjectStore(DB_STORE);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function idbSet(key, val){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(DB_STORE,"readwrite");
    tx.objectStore(DB_STORE).put(val,key);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}
async function idbGet(key){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(DB_STORE,"readonly");
    const req=tx.objectStore(DB_STORE).get(key);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

function bufferToBase64(buffer){
  if(!buffer) return null;
  const nCh=buffer.numberOfChannels, len=buffer.length, sr=buffer.sampleRate;
  const pcm=new Float32Array(len*nCh);
  for(let c=0;c<nCh;c++){ const d=buffer.getChannelData(c); for(let i=0;i<len;i++) pcm[i*nCh+c]=d[i]; }
  const bytes=new Uint8Array(pcm.buffer);
  let s=""; const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk) s+=String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i+chunk,bytes.length)));
  return { sr, nCh, len, data:btoa(s) };
}
function base64ToBuffer(obj){
  if(!obj) return null;
  ensureAudio();
  const bin=atob(obj.data);
  const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  const pcm=new Float32Array(bytes.buffer);
  const buf=window.__ko2.ctx.createBuffer(obj.nCh, obj.len, obj.sr);
  for(let c=0;c<obj.nCh;c++){
    const d=buf.getChannelData(c);
    for(let i=0;i<obj.len;i++) d[i]=pcm[i*obj.nCh+c];
  }
  return buf;
}

function serializeProject(){
  return {
    version:2, bpm:state.bpm, swing:state.swing, patternLength:state.patternLength,
    fxIndex:state.fxIndex, fxParams:state.fxParams, velCurve:state.velCurve,
    groupPatIdx:groupPatIdx.slice(), scene:state.scene, song:song.slice(),
    scenes:scenes.map(s=>({...s, patterns:s.patterns.slice()})),
    patterns:patterns.map(gs=>gs.map(p=>({ bars:p.bars, notes:p.notes.map(n=>({...n,locks:{...n.locks}})), faderAuto:(p.faderAuto||[]).map(a=>({...a})) }))),
    groups:pads.map(g=>g.map(s=>({
      name:s.name, level:s.level, pitch:s.pitch, tune:s.tune, start:s.start, end:s.end,
      lpf:s.lpf, hpf:s.hpf, atk:s.atk, rel:s.rel, pan:s.pan, velSens:s.velSens, playMode:s.playMode,
      timeStretch:s.timeStretch, stretchMode:s.stretchMode, sampleBpm:s.sampleBpm, fxSend:s.fxSend,
      buffer:bufferToBase64(s.buffer),
      layers:(s.layers||[]).filter(L=>L&&L.buffer).map(L=>({min:L.min,max:L.max,name:L.name,buffer:bufferToBase64(L.buffer)})),
    }))),
  };
}

async function applyProject(data){
  ensureAudio();
  state.bpm=data.bpm||120; state.swing=data.swing||0; state.patternLength=data.patternLength||16;
  state.fxIndex=data.fxIndex||0; state.fxParams=data.fxParams||{x:0.35,y:0.3};
  state.velCurve=data.velCurve||"linear";
  if(data.groupPatIdx) data.groupPatIdx.forEach((v,i)=>groupPatIdx[i]=v);
  if(data.scenes){ scenes.length=0; data.scenes.forEach(s=>scenes.push(s)); }
  if(data.song) song=data.song.slice();
  state.scene=data.scene||0;
  for(let g=0;g<4;g++){
    if(data.patterns&&data.patterns[g]){
      patterns[g]=data.patterns[g].map(p=>({ bars:p.bars||1, notes:(p.notes||[]).slice(), faderAuto:(p.faderAuto||[]).slice() }));
    }
    if(data.groups&&data.groups[g]){
      pads[g]=data.groups[g].map(s=>{
        const snd=emptySound(s.name||"---");
        Object.assign(snd,s); snd.buffer=base64ToBuffer(s.buffer); snd.stretched=null;
        snd.layers=(s.layers||[]).map(L=>({min:L.min,max:L.max,name:L.name,buffer:base64ToBuffer(L.buffer)}));
        return snd;
      });
    }
  }
  applyFx();
  setKnobAngle(document.getElementById("knobX"),(state.bpm-40)/200);
  setKnobAngle(document.getElementById("knobY"),state.swing);
  updatePadLights(); setStatus();
}

async function saveLocal(){
  try{
    const data=serializeProject();
    await idbSet("project", data);
    try{ localStorage.setItem("ko2-meta", JSON.stringify({ bpm:state.bpm, saved:Date.now() })); }catch(_){}
    lcd("SAV"); toast("Saved to IndexedDB");
  }catch(e){ lcd("ERR"); toast("Save failed"); console.warn(e); }
}
async function loadLocal(){
  try{
    const data=await idbGet("project");
    if(!data){ toast("No saved project"); lcd("NON"); return; }
    await applyProject(data); lcd("LOD"); toast("Loaded from IndexedDB");
  }catch(e){ lcd("ERR"); toast("Load failed"); console.warn(e); }
}
function exportJson(){
  const blob=new Blob([JSON.stringify(serializeProject())],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="ko2-project.json"; a.click();
  lcd("EXP"); toast("Exported JSON");
}
function importJson(file){
  const reader=new FileReader();
  reader.onload=async()=>{ try{ await applyProject(JSON.parse(reader.result)); lcd("IMP"); toast("Imported"); }catch(e){ lcd("ERR"); toast("Import failed"); } };
  reader.readAsText(file);
}

function audioBufferToWav(buffer){
  const nCh=buffer.numberOfChannels, sr=buffer.sampleRate, len=buffer.length;
  const dataLen=len*nCh*2; const ab=new ArrayBuffer(44+dataLen); const v=new DataView(ab);
  const w=(o,s)=>{ for(let i=0;i<s.length;i++) v.setUint8(o+i,s.charCodeAt(i)); };
  w(0,"RIFF"); v.setUint32(4,36+dataLen,true); w(8,"WAVE"); w(12,"fmt ");
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,nCh,true);
  v.setUint32(24,sr,true); v.setUint32(28,sr*nCh*2,true);
  v.setUint16(32,nCh*2,true); v.setUint16(34,16,true); w(36,"data"); v.setUint32(40,dataLen,true);
  let off=44; const chans=[]; for(let c=0;c<nCh;c++) chans.push(buffer.getChannelData(c));
  for(let i=0;i<len;i++) for(let c=0;c<nCh;c++){
    let x=Math.max(-1,Math.min(1,chans[c][i]));
    v.setInt16(off, x<0?x*0x8000:x*0x7fff, true); off+=2;
  }
  return ab;
}

/** Bounce with FX chain replica in OfflineAudioContext */
async function bounceWav(){
  ensureAudio(); toast("Rendering with FX…"); lcd("RND",true);
  const sr=44100, steps=state.patternLength, sp=(60/state.bpm)/4;
  const dur=steps*sp+2.0;
  const offline=new OfflineAudioContext(2, Math.ceil(dur*sr), sr);

  // Build simplified FX graph offline
  const oMaster=offline.createGain(); oMaster.gain.value=state.volume;
  const oComp=offline.createDynamicsCompressor();
  oComp.threshold.value=-16; oComp.ratio.value=3; oComp.connect(oMaster); oMaster.connect(offline.destination);
  const oDry=offline.createGain(); oDry.gain.value=1;
  const oWet=offline.createGain(); oWet.gain.value=0.5;
  const oFxIn=offline.createGain();
  oDry.connect(oComp); oWet.connect(oComp);

  // delay as default wet path (or based on fxIndex)
  const oDelay=offline.createDelay(2); oDelay.delayTime.value=lerp(0.05,0.75,state.fxParams.x);
  const oFb=offline.createGain(); oFb.gain.value=lerp(0.05,0.8,state.fxParams.y);
  oDelay.connect(oFb); oFb.connect(oDelay);
  if(state.fxIndex===0){ oFxIn.connect(oDelay); oDelay.connect(oWet); }
  else if(state.fxIndex===2){
    const ws=offline.createWaveShaper(); ws.curve=makeDistortionCurve(lerp(10,120,state.fxParams.x));
    const dg=offline.createGain(); dg.gain.value=lerp(0.15,0.6,state.fxParams.y);
    oFxIn.connect(ws); ws.connect(dg); dg.connect(oWet);
  } else if(state.fxIndex===4){
    const f=offline.createBiquadFilter(); f.type="lowpass"; f.frequency.value=lerp(200,8000,state.fxParams.x); f.Q.value=lerp(0.5,10,state.fxParams.y);
    oFxIn.connect(f); f.connect(oWet);
  } else {
    // reverb-ish: feedback delay network lite
    const d2=offline.createDelay(1); d2.delayTime.value=0.03;
    const g2=offline.createGain(); g2.gain.value=0.4;
    oFxIn.connect(d2); d2.connect(g2); g2.connect(oWet);
  }

  const oGroups=[];
  for(let g=0;g<4;g++){
    const gg=offline.createGain(); gg.gain.value=0.9*groupProjectVol[g];
    const send=offline.createGain(); send.gain.value=0.2;
    gg.connect(oDry); gg.connect(send); send.connect(oFxIn);
    oGroups.push({gg, send});
  }

  function playOffline(g, padIndex, when, vel, pitchOff, locks){
    const snd=pads[g][padIndex]; if(!snd||!snd.buffer) return;
    const buf=getPlayBuffer(snd)||snd.buffer;
    const src=offline.createBufferSource(); src.buffer=buf;
    src.playbackRate.value=Math.pow(2,((locks&&locks.pitch!=null?locks.pitch:snd.pitch)+snd.tune+(pitchOff||0))/12);
    const gain=offline.createGain();
    const level=snd.level*(vel==null?1:vel);
    const lpf=offline.createBiquadFilter(); lpf.type="lowpass"; lpf.frequency.value=snd.lpf*lerp(0.4,1,vel==null?1:vel);
    gain.gain.setValueAtTime(0,when); gain.gain.linearRampToValueAtTime(level, when+snd.atk);
    const startOff=snd.start*buf.duration, endOff=snd.end*buf.duration;
    const pdur=Math.max(0.01,(endOff-startOff)/Math.max(0.01,src.playbackRate.value));
    gain.gain.setValueAtTime(level, when+Math.max(0,pdur-snd.rel));
    gain.gain.linearRampToValueAtTime(0.0001, when+pdur);
    src.connect(lpf); lpf.connect(gain); gain.connect(oGroups[g].gg);
    oGroups[g].send.gain.value=snd.fxSend;
    try{ src.start(when, startOff, pdur+snd.rel); }catch(_){}
  }

  for(let step=0; step<steps; step++){
    const when=step*sp+0.05;
    for(let g=0;g<4;g++){
      const pat=window.__ko2.currentPattern(g);
      for(const n of pat.notes.filter(x=>x.step===step))
        playOffline(g, n.pad, when, n.vel, n.pitch, n.locks);
    }
  }

  const rendered=await offline.startRendering();
  // check non-silent
  let peak=0; const ch=rendered.getChannelData(0);
  for(let i=0;i<ch.length;i+=64) peak=Math.max(peak, Math.abs(ch[i]));
  const wav=audioBufferToWav(rendered);
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([wav],{type:"audio/wav"}));
  a.download="ko2-bounce.wav"; a.click();
  lcd(peak>0.001?"WAV":"SIL");
  toast(peak>0.001?("Bounce OK peak="+peak.toFixed(2)):("Bounce silent?"));
  return { peak, sampleRate:sr, duration:dur };
}

Object.assign(window.__ko2, { saveLocal, loadLocal, exportJson, importJson, bounceWav, serializeProject, applyProject, bufferToBase64, base64ToBuffer });
