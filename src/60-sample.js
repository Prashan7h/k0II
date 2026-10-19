/* ===== SAMPLING / CHOP / RESAMPLE ===== */
let mediaStream=null, recordScript=null, recordingPad=-1, pcmChunks=[], peakMeter=0;
let resampleDest=null, resampleChunks=[];

async function startSampleRecord(padIndex){
  ensureAudio(); recordingPad=padIndex; lcd("MIC",true); pcmChunks=[]; peakMeter=0;
  try{
    mediaStream=await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:false, noiseSuppression:false, autoGainControl:false } });
    const src=window.__ko2.ctx.createMediaStreamSource(mediaStream);
    const gain=window.__ko2.ctx.createGain(); gain.gain.value=state.inputGain;
    src.connect(gain);
    recordScript=window.__ko2.ctx.createScriptProcessor(2048,1,1);
    const thr=state.sampleThreshold;
    let started=false;
    recordScript.onaudioprocess=(e)=>{
      if(recordingPad<0) return;
      const input=e.inputBuffer.getChannelData(0);
      let peak=0; for(let i=0;i<input.length;i++) peak=Math.max(peak, Math.abs(input[i]));
      peakMeter=peak;
      if(!started){
        if(peak>=thr) started=true; else return;
      }
      pcmChunks.push(new Float32Array(input));
    };
    const silent=window.__ko2.ctx.createGain(); silent.gain.value=0;
    gain.connect(recordScript); recordScript.connect(silent); silent.connect(window.__ko2.ctx.destination);
  }catch(err){ lcd("DEN"); toast("Mic denied"); console.warn(err); }
}

function stopSampleRecord(){
  const padIndex=recordingPad;
  if(recordScript){ try{ recordScript.disconnect(); }catch(_){} }
  if(mediaStream){ mediaStream.getTracks().forEach(t=>t.stop()); mediaStream=null; }
  if(pcmChunks.length && padIndex>=0){
    let len=0; pcmChunks.forEach(a=>len+=a.length);
    if(len>0){
      const buf=window.__ko2.ctx.createBuffer(1,len,window.__ko2.ctx.sampleRate);
      const d=buf.getChannelData(0); let o=0;
      for(const a of pcmChunks){ d.set(a,o); o+=a.length; }
      const fade=Math.min(512, Math.floor(len/8));
      for(let i=0;i<fade;i++){ d[i]*=i/fade; d[len-1-i]*=i/fade; }
      const snd=emptySound("SMP"); snd.buffer=buf; snd.sampleBpm=state.bpm;
      pads[state.group][padIndex]=snd;
      lcd("OK!"); toast("Sampled "+PAD_LABELS[padIndex]+" ("+(len/window.__ko2.ctx.sampleRate).toFixed(2)+"s)");
      if(window.__ko2.updatePadLights) window.__ko2.updatePadLights();
    }
  }
  recordingPad=-1; recordScript=null; pcmChunks=[];
}

async function loadAudioToPad(file, group, padIndex){
  ensureAudio();
  const arr=await file.arrayBuffer();
  const buf=await window.__ko2.ctx.decodeAudioData(arr.slice(0));
  const snd=emptySound(file.name.replace(/\.[^.]+$/,"").slice(0,3).toUpperCase()||"AUD");
  snd.buffer=buf; snd.sampleBpm=state.bpm;
  pads[group][padIndex]=snd;
  lcd("LOD"); toast("Loaded → "+ "ABCD"[group]+":"+PAD_LABELS[padIndex]);
  if(window.__ko2.updatePadLights) window.__ko2.updatePadLights();
}

function chopSelected(slices){
  slices=slices||12;
  const snd=pads[state.group][state.selectedPad];
  if(!snd||!snd.buffer){ toast("Select a pad with a sample"); lcd("NON"); return; }
  for(let i=0;i<12;i++){
    const copy=Object.assign(emptySound("CH"+String(i+1).padStart(2,"0")), snd, {
      buffer:snd.buffer, start:i/slices, end:Math.min(1,(i+1)/slices), playMode:0, layers:[]
    });
    pads[state.group][i]=copy;
  }
  lcd("CHP"); toast("Chopped into "+slices+" slices");
  if(window.__ko2.updatePadLights) window.__ko2.updatePadLights();
}

/** Resample main mix into a pad (offline-ish: MediaStreamDestination while playing) */
async function startResample(padIndex){
  ensureAudio();
  const c=window.__ko2.ctx;
  resampleDest=c.createMediaStreamDestination();
  window.__ko2.nodes.masterGain.connect(resampleDest);
  const rec=new MediaRecorder(resampleDest.stream);
  resampleChunks=[];
  rec.ondataavailable=(e)=>{ if(e.data.size) resampleChunks.push(e.data); };
  rec.onstop=async()=>{
    try{ window.__ko2.nodes.masterGain.disconnect(resampleDest); }catch(_){}
    const blob=new Blob(resampleChunks,{type:"audio/webm"});
    const ab=await blob.arrayBuffer();
    try{
      const buf=await c.decodeAudioData(ab.slice(0));
      const snd=emptySound("RSP"); snd.buffer=buf; snd.sampleBpm=state.bpm;
      pads[state.group][padIndex]=snd;
      lcd("RSP"); toast("Resampled to pad "+PAD_LABELS[padIndex]);
      if(window.__ko2.updatePadLights) window.__ko2.updatePadLights();
    }catch(e){ lcd("ERR"); toast("Resample decode failed"); }
  };
  rec.start();
  startResample._rec=rec;
  lcd("RSP",true);
  toast("Resampling… press SAMPLE again to stop");
}
function stopResample(){
  if(startResample._rec && startResample._rec.state==="recording") startResample._rec.stop();
  startResample._rec=null;
}

Object.assign(window.__ko2, { startSampleRecord, stopSampleRecord, loadAudioToPad, chopSelected, startResample, stopResample });
