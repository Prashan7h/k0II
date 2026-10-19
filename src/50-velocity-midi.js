/* ===== VELOCITY / PRESSURE / MIDI ===== */
function applyVelCurve(raw){
  raw=clamp(raw,0,1);
  if(state.velCurve==="fixed") return state.fixedVel;
  if(state.velCurve==="soft") return Math.pow(raw,0.55);
  if(state.velCurve==="hard") return Math.pow(raw,1.8);
  return raw;
}

/** Extract velocity from a pointer/mouse/touch event */
function velocityFromEvent(e, padEl){
  // 1) Force Touch (Safari)
  if(typeof e.webkitForce==="number" && e.webkitForce>0){
    // webkitForce 0..3 typical, 1 = click
    return applyVelCurve(clamp(e.webkitForce/3,0,1));
  }
  // 2) Pointer pressure (Pencil / pen / some trackpads)
  if(e.pointerType && (e.pointerType==="pen" || e.pointerType==="touch") && typeof e.pressure==="number" && e.pressure>0){
    return applyVelCurve(clamp(e.pressure,0,1));
  }
  if(typeof e.pressure==="number" && e.pressure>0 && e.pressure<1){
    return applyVelCurve(clamp(e.pressure,0,1));
  }
  // 3) Touch radius fallback
  if(e.touches && e.touches[0]){
    const t=e.touches[0];
    if(t.force>0) return applyVelCurve(clamp(t.force,0,1));
    if(t.radiusX) return applyVelCurve(clamp(t.radiusX/40,0.2,1));
  }
  // 4) Click position on pad (higher = harder) — mouse fallback
  if(padEl && (e.clientY!=null)){
    const r=padEl.getBoundingClientRect();
    const ny=1-((e.clientY-r.top)/Math.max(r.height,1));
    return applyVelCurve(clamp(0.35+ny*0.65,0.2,1));
  }
  // 5) Keyboard modifiers handled by caller
  return applyVelCurve(0.85);
}

function aftertouchFromEvent(e){
  if(typeof e.webkitForce==="number") return clamp(e.webkitForce/3,0,1);
  if(typeof e.pressure==="number") return clamp(e.pressure,0,1);
  if(e.touches&&e.touches[0]&&e.touches[0].force) return clamp(e.touches[0].force,0,1);
  return null;
}

function applyAftertouch(group, pad, amount){
  if(amount==null) return;
  const snd=pads[group][pad]; if(!snd) return;
  const param=state.aftertouchParam;
  if(param==="lpf") snd._atLpf=lerp(snd.lpf, 400, amount);
  if(param==="level"){ /* live voice hard — skip */ }
  // update live group filter lightly
  const nodes=window.__ko2.nodes;
  if(nodes && param==="lpf") nodes.groupFilters[group].frequency.setTargetAtTime(lerp(snd.lpf,300,amount), window.__ko2.ctx.currentTime, 0.05);
}

/* Web MIDI */
let midiAccess=null, midiClockTimer=null;
async function initMidi(){
  if(!navigator.requestMIDIAccess){ toast("Web MIDI not available"); return false; }
  try{
    midiAccess=await navigator.requestMIDIAccess({sysex:false});
    midiAccess.inputs.forEach(inp=>{
      inp.onmidimessage=onMidiMessage;
    });
    const outs=[...midiAccess.outputs.values()];
    if(outs.length) state.midiOut=outs[0];
    const ins=[...midiAccess.inputs.values()];
    document.getElementById("ledMidi")?.classList.toggle("on", ins.length>0);
    toast("MIDI: "+ins.length+" in / "+outs.length+" out");
    return true;
  }catch(e){ toast("MIDI denied"); console.warn(e); return false; }
}

function onMidiMessage(ev){
  const [st,d1,d2]=ev.data;
  const cmd=st&0xf0, ch=st&0x0f;
  document.getElementById("ledMidi")?.classList.add("on");
  if(cmd===0x90 && d2>0){
    const vel=applyVelCurve(d2/127);
    if(state.midiLearn){
      state.midiMap[d1]={ group:state.group, pad:state.selectedPad };
      state.midiLearn=false; lcd("LRN"); toast("Learned note "+d1+" → pad "+PAD_LABELS[state.selectedPad]);
      return;
    }
    const map=state.midiMap[d1];
    if(map) hitPad(map.pad, vel, true, map.group);
    else {
      // default chromatic map C2=36
      const base=36+state.group*12;
      const off=d1-base;
      if(off>=0 && off<12) hitPad(off, vel, true, state.group);
      else if(state.keysMode){
        // play root with pitch
        const p=d1-60;
        playSound(state.group, state.keysRootPad, window.__ko2.ctx.currentTime, vel, p);
      }
    }
  } else if(cmd===0x80 || (cmd===0x90 && d2===0)){
    const map=state.midiMap[d1];
    if(map) hitPad(map.pad, 0, false, map.group);
  } else if(cmd===0xd0){
    // channel aftertouch
    applyAftertouch(state.group, state.selectedPad, d1/127);
  } else if(cmd===0xa0){
    applyAftertouch(state.group, d1%12, d2/127);
  } else if(st===0xfa){ startPlay({fromStart:true}); }
  else if(st===0xfc){ stopPlay(); }
}

function sendMidiNote(group, pad, vel, on){
  if(!state.midiOut) return;
  const note=36+group*12+pad;
  const v=clamp(Math.round(vel*127),1,127);
  state.midiOut.send([on?0x90:0x80, note, on?v:0]);
}

function midiClockStart(){
  if(!state.midiOut) return;
  state.midiOut.send([0xfa]);
  const interval=(60/state.bpm)/24*1000;
  midiClockTimer=setInterval(()=>{ try{ state.midiOut.send([0xf8]); }catch(_){} }, interval);
}
function midiClockStop(){
  if(midiClockTimer){ clearInterval(midiClockTimer); midiClockTimer=null; }
  if(state.midiOut) try{ state.midiOut.send([0xfc]); }catch(_){}
}

Object.assign(window.__ko2, {
  velocityFromEvent, aftertouchFromEvent, applyAftertouch, applyVelCurve,
  initMidi, sendMidiNote, midiClockStart, midiClockStop,
});
// hitPad defined later — forward
