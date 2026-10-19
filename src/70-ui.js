/* ===== UI / HITPAD / CONTROLS ===== */
function updatePadLights(){
  document.querySelectorAll(".pad").forEach((el,i)=>{
    // data-pad attribute
  });
  document.querySelectorAll(".pad").forEach((el)=>{
    const i=+el.dataset.pad;
    const snd=pads[state.group][i];
    el.classList.toggle("has-sound", !!(snd&&snd.buffer));
    const pat=window.__ko2.currentPattern(state.group);
    const onStep=state.playing && pat.notes.some(n=>n.step===window.__ko2.stepInBar && n.pad===i);
    const stepView=!state.playing && pat.notes.some(n=>n.step===state.currentStep && n.pad===i);
    el.classList.toggle("seq-lit", onStep||stepView);
  });
}
function setStatus(){
  document.getElementById("stMode").textContent=state.mode.toUpperCase().slice(0,6);
  document.getElementById("stExtra").innerHTML=
    '<span class="hi">'+(state.quantize?"Q":"F")+" "+state.bpm+(state.keysMode?" KEY":"")+(state.songMode?" SNG":"")+"</span>";
  document.getElementById("ledRec").className="led"+(state.recording||state.recordArmed?" rec on":"");
  document.getElementById("ledPlay").className="led"+(state.playing?" play on":"");
  document.getElementById("ledMet").className="led"+(state.metronome&&state.playing?" on":"");
  document.querySelectorAll(".group-btn").forEach((b,i)=>b.classList.toggle("active", i===state.group));
  document.getElementById("btnMain").classList.toggle("lit", state.mode==="main");
  document.getElementById("btnSound").classList.toggle("lit", state.mode==="sound"||state.mode==="edit");
  document.getElementById("btnTempo").classList.toggle("lit", state.mode==="tempo");
  document.getElementById("btnKeys").classList.toggle("active", !!state.keysMode);
  document.getElementById("btnSample").classList.toggle("active", state.mode==="sample"||state.mode==="chop");
  document.getElementById("btnFx").classList.toggle("active", state.mode==="fx");
  document.getElementById("btnTiming").classList.toggle("active", state.mode==="timing");
  document.getElementById("btnShift").classList.toggle("held", state.shift);
  document.getElementById("btnRecord").classList.toggle("active", state.recording||state.recordArmed);
  document.getElementById("btnPlay").classList.toggle("active", state.playing);
  // pictograms
  updatePictos();
  updatePadLights();
}
function updatePictos(){
  const L=document.getElementById("pictosL"), R=document.getElementById("pictosR");
  if(!L.dataset.ready){
    const icons=["♪","▣","⏱","✦","◎","▲","◆","◌"];
    L.innerHTML=icons.slice(0,6).map((c,i)=>'<span class="picto" data-i="'+i+'" style="color:'+['#c44','#48a','#ca4','#4a8','#a4a','#c84'][i]+'">'+c+'</span>').join("");
    R.innerHTML=icons.slice(2).map((c,i)=>'<span class="picto" data-i="'+i+'" style="color:'+['#48c','#a44','#4a8','#ca4','#a4a','#48a'][i]+'">'+c+'</span>').join("");
    L.dataset.ready="1";
  }
  L.querySelectorAll(".picto").forEach((el,i)=>{
    el.classList.toggle("on",
      (i===0&&state.mode==="sound")||(i===1&&state.mode==="main")||(i===2&&state.mode==="tempo")||
      (i===3&&state.mode==="fx")||(i===4&&state.recording)||(i===5&&state.keysMode));
  });
}

function hitPad(padIndex, vel, down, groupOverride){
  const g=groupOverride!=null?groupOverride:state.group;
  vel=vel==null?0.85:vel; down=down!==false;
  ensureAudio(); const _c=window.__ko2.ctx; if(_c && _c.state==="suspended") _c.resume();

  if(state.mode==="fx" && state.fxHeld){
    if(down){ state.punchFx.set(padIndex, vel); lcd(PUNCH_FX[PUNCH_BY_PAD[padIndex]].name); }
    else { state.punchFx.delete(padIndex); if(!state.punchFx.size) clearPunchFx(); }
    updatePunchFx();
    return;
  }
  if(state.mode==="sample"){
    if(down){
      if(state.shift) startResample(padIndex);
      else startSampleRecord(padIndex);
    } else {
      if(startResample._rec) stopResample();
      else stopSampleRecord();
    }
    return;
  }
  if(state.faderHold && down){
    state.faderAssign=padIndex; lcd(FADER_ASSIGNS[padIndex].slice(0,3));
    toast("Fader → "+FADER_ASSIGNS[padIndex]); return;
  }
  if(!state.playing && state.recording && down){
    addNote(g, padIndex, state.currentStep, vel);
    playSound(g, padIndex, window.__ko2.ctx.currentTime, vel);
    lcd("S"+String(state.currentStep+1).padStart(2,"0")); updatePadLights(); return;
  }
  if(state.eraseHeld && down){
    erasePadNotes(g, padIndex); lcd(state.playing?"ERS":"TRK"); updatePadLights(); return;
  }
  if(!down){
    const p=state.keysMode?state.keysRootPad:padIndex;
    const snd=pads[g][p];
    if(snd && (snd.playMode===2||snd.playMode===3) && !state.keysMode) stopVoice(g+":"+p, window.__ko2.ctx.currentTime);
    if(window.__ko2.sendMidiNote) window.__ko2.sendMidiNote(g, p, 0, false);
    return;
  }
  state.selectedPad=padIndex;
  let pitchOff=0, p=padIndex;
  if(state.keysMode){ p=state.keysRootPad; pitchOff=(padIndex-5)+state.keysOctave*12; }
  playSound(g, p, window.__ko2.ctx.currentTime, vel, pitchOff);
  if(state.recording && state.playing){
    addNote(g, state.keysMode?state.keysRootPad:padIndex, window.__ko2.stepInBar, vel, pitchOff);
  }
  if(state.mode==="sound"||state.mode==="edit"){
    const snd=pads[g][padIndex]; lcd(snd&&snd.name?snd.name.slice(0,3):"---");
  } else if(state.mode==="main") lcd(PAD_LABELS[padIndex].replace("ENTER","ENT").slice(0,3));
  setStatus();
}

function setMode(m){ state.mode=m; lcd(m.slice(0,3).toUpperCase()); setStatus(); }

function adjustSelected(param, delta){
  const snd=pads[state.group][state.selectedPad]; if(!snd) return;
  switch(param){
    case "level": snd.level=clamp(snd.level+delta,0,1.5); lcd(Math.round(snd.level*100)); break;
    case "pitch": snd.pitch=clamp(snd.pitch+delta*12,-24,24); lcd((snd.pitch>=0?"+":"")+Math.round(snd.pitch)); break;
    case "tune": snd.tune=clamp(snd.tune+delta*2,-12,12); lcd(Math.round(snd.tune*10)); break;
    case "lpf": snd.lpf=clamp(snd.lpf*(1+delta),200,18000); lcd(Math.round(snd.lpf/100)); break;
    case "hpf": snd.hpf=clamp(snd.hpf+delta*200,20,8000); lcd(Math.round(snd.hpf/10)); break;
    case "atk": snd.atk=clamp(snd.atk+delta*0.08,0.001,2); lcd(Math.round(snd.atk*100)); break;
    case "rel": snd.rel=clamp(snd.rel+delta*0.08,0.01,2); lcd(Math.round(snd.rel*100)); break;
    case "pan": snd.pan=clamp(snd.pan+delta,-1,1); lcd(Math.round(snd.pan*50)); break;
    case "time": snd.timeStretch=clamp(snd.timeStretch+delta,0.25,8); lcd(Math.round(snd.timeStretch*100)); break;
    case "fx": snd.fxSend=clamp(snd.fxSend+delta,0,1); lcd(Math.round(snd.fxSend*100)); break;
    case "mode": snd.playMode=(snd.playMode+(delta>0?1:3))%4; lcd(PLAY_MODES[snd.playMode]); break;
    case "start": snd.start=clamp(snd.start+delta*0.04,0,snd.end-0.01); lcd(Math.round(snd.start*100)); break;
    case "end": snd.end=clamp(snd.end+delta*0.04,snd.start+0.01,1); lcd(Math.round(snd.end*100)); break;
    case "stretch": {
      const modes=["off","bpm","bar"]; let i=modes.indexOf(snd.stretchMode); if(i<0)i=0;
      i=(i+(delta>0?1:2))%3; snd.stretchMode=modes[i]; snd.stretched=null; lcd(modes[i].slice(0,3).toUpperCase()); break;
    }
    case "sbpm": snd.sampleBpm=clamp(snd.sampleBpm+delta*10,40,240); snd.stretched=null; lcd(String(Math.round(snd.sampleBpm))); break;
  }
}

function onButton(name, down){
  ensureAudio();
  const el=document.querySelector('[data-btn="'+name+'"]');
  if(el) el.classList.toggle("pressed", !!down);
  if(name==="shift"){ state.shift=down; setStatus(); return; }
  if(!down){
    if(name==="fx"){ state.fxHeld=false; if(state.punchFx.size) clearPunchFx(); }
    if(name==="erase") state.eraseHeld=false;
    if(name==="fader") state.faderHold=false;
    return;
  }
  switch(name){
    case "main":
      if(state.shift) commitScene();
      else { state.songMode=false; setMode("main"); }
      break;
    case "sound":
      if(state.shift){ setMode("edit"); state.editPage=0; lcd("ED0"); }
      else setMode("sound");
      break;
    case "tempo":
      if(state.shift){
        const lens=[8,16,32,64];
        let i=lens.indexOf(state.patternLength);
        state.patternLength=lens[(i+1)%lens.length];
        const pat=window.__ko2.currentPattern(state.group);
        pat.bars=Math.max(1, Math.ceil(state.patternLength/16));
        lcd("L"+String(state.patternLength).padStart(2,"0"));
      } else setMode("tempo");
      break;
    case "sample":
      if(state.shift){ setMode("chop"); chopSelected(12); }
      else setMode("sample");
      break;
    case "timing":
      if(state.shift){
        // timing correct — snap offsets
        window.__ko2.currentPattern(state.group).notes.forEach(n=>{ n.offset=0; });
        lcd("TC"); toast("Timing correct");
      } else { setMode("timing"); state.quantize=!state.quantize; lcd(state.quantize?"QNT":"FRE"); }
      break;
    case "fx":
      state.fxHeld=true;
      if(state.shift){ lcd("CMP"); toast("Master / sidechain (basic)"); }
      else setMode("fx");
      break;
    case "erase":
      state.eraseHeld=true;
      if(state.shift){ lcd("SYS"); toast("System: use toolbar · MIDI learn via MIDI btn"); }
      break;
    case "keys":
      state.keysMode=!state.keysMode;
      if(state.keysMode) state.keysRootPad=state.selectedPad;
      lcd(state.keysMode?"KEY":"OFF"); setStatus();
      break;
    case "fader":
      state.faderHold=true; lcd(FADER_ASSIGNS[state.faderAssign].slice(0,3));
      break;
    case "record":
      if(state.playing){ state.recording=!state.recording; lcd(state.recording?"REC":"PLY"); }
      else { state.recording=!state.recording; state.recordArmed=state.recording; lcd(state.recording?"ARM":"---"); }
      setStatus();
      break;
    case "play":
      if(state.playing) stopPlay();
      else if(state.recordArmed||state.recording) startPlay({ countIn:!state.shift, record:true, fromStart:!!state.shift });
      else {
        if(state.shift && state.song.length>1){ state.songMode=true; state.songPos=0; recallScene(song[0]); }
        startPlay({ fromStart:!!state.shift });
      }
      break;
    case "minus": handleMinusPlus(-1); break;
    case "plus": handleMinusPlus(1); break;
  }
  setStatus();
}

function handleMinusPlus(dir){
  if(state.mode==="fx"){
    state.fxIndex=(state.fxIndex+dir+FX_NAMES.length)%FX_NAMES.length;
    applyFx(); lcd(FX_NAMES[state.fxIndex]); toast(FX_NAMES[state.fxIndex]);
  } else if(state.mode==="sound") adjustSelected("level", dir*0.05);
  else if(state.mode==="edit"){
    state.editPage=(state.editPage+dir+6)%6;
    lcd(["SND","TRM","ENV","TIM","MOD","FLT"][state.editPage]);
  } else if(state.mode==="tempo"){ state.bpm=clamp(state.bpm+dir,40,240); lcd(String(state.bpm)); }
  else if(state.keysMode && state.shift){
    state.keysOctave=clamp(state.keysOctave+dir,-3,3);
    lcd("O"+(state.keysOctave>=0?"+":"")+state.keysOctave);
  } else if(state.shift && state.mode==="main"){
    // change scene
    recallScene(clamp(state.scene+dir,0,scenes.length-1));
  } else if(state.recording && !state.playing){
    const pat=window.__ko2.currentPattern(state.group);
    pat.bars=clamp((pat.bars||1)+dir,1,99);
    state.patternLength=pat.bars*16;
    lcd("B"+String(pat.bars).padStart(2,"0"));
  } else if(!state.playing){
    // nudge selected pad's notes or step
    if(state.shift){
      const pat=window.__ko2.currentPattern(state.group);
      pat.notes.filter(n=>n.pad===state.selectedPad && n.step===state.currentStep).forEach(n=>{
        n.step=clamp(n.step+dir,0,state.patternLength-1);
      });
      lcd("NDG");
    } else {
      state.currentStep=(state.currentStep+dir+state.patternLength)%state.patternLength;
      lcd(String(state.currentStep+1).padStart(3,"0"));
    }
    updatePadLights();
  } else if(state.shift){
    // pattern select
    groupPatIdx[state.group]=clamp(groupPatIdx[state.group]+dir,0,patterns[state.group].length-1);
    lcd("P"+String(groupPatIdx[state.group]+1).padStart(2,"0"));
  } else {
    recallScene(clamp(state.scene+dir,0,scenes.length-1));
  }
}

function bindKnob(el, onChange){
  let dragging=false, lastY=0;
  const start=(y)=>{ dragging=true; lastY=y; ensureAudio(); };
  const move=(y)=>{ if(!dragging) return; const dy=lastY-y; lastY=y; onChange(dy*0.005); };
  el.addEventListener("mousedown",(e)=>{ e.preventDefault(); start(e.clientY); });
  window.addEventListener("mousemove",(e)=>move(e.clientY));
  window.addEventListener("mouseup",()=>dragging=false);
  el.addEventListener("touchstart",(e)=>start(e.touches[0].clientY),{passive:true});
  el.addEventListener("touchmove",(e)=>move(e.touches[0].clientY),{passive:true});
  el.addEventListener("touchend",()=>dragging=false);
}
function setKnobAngle(el, norm){ el.style.setProperty("--angle", (-135+norm*270)+"deg"); }

function onKnobX(delta){
  delta*=state.shift?0.25:1;
  if(state.mode==="tempo"||state.mode==="main"){
    state.bpm=clamp(Math.round(state.bpm+delta*40),40,240);
    setKnobAngle(document.getElementById("knobX"),(state.bpm-40)/200); lcd(String(state.bpm));
  } else if(state.mode==="fx"){
    state.fxParams.x=clamp(state.fxParams.x+delta,0,1);
    setKnobAngle(document.getElementById("knobX"),state.fxParams.x); applyFx(); lcd(Math.round(state.fxParams.x*100));
  } else if(state.mode==="sound"||state.mode==="edit"){
    adjustSelected(["level","start","atk","stretch","mode","lpf"][state.editPage]||"level", delta);
  } else if(state.mode==="sample"){
    state.inputGain=clamp(state.inputGain+delta,0,2); lcd(Math.round(state.inputGain*100));
  } else if(state.mode==="timing"){
    const opts=[1,2,4,8,16,32]; let i=opts.indexOf(state.noteInterval); if(i<0)i=4;
    if(Math.abs(delta)>0.02){ i=clamp(i+(delta>0?1:-1),0,opts.length-1); state.noteInterval=opts[i]; lcd("1/"+state.noteInterval); }
  } else adjustSelected("level", delta);
  if(state.stepLockMode && window.__ko2.writeLiveLock){
    const snd=pads[state.group][state.selectedPad];
    window.__ko2.writeLiveLock('level', snd?snd.level:state.fader);
  }
  setStatus();
}
function onKnobY(delta){
  delta*=state.shift?0.25:1;
  if(state.mode==="tempo"||state.mode==="timing"||state.mode==="main"){
    state.swing=clamp(state.swing+delta,0,1);
    setKnobAngle(document.getElementById("knobY"),state.swing); lcd("SW"+Math.round(state.swing*10));
  } else if(state.mode==="fx"){
    state.fxParams.y=clamp(state.fxParams.y+delta,0,1);
    setKnobAngle(document.getElementById("knobY"),state.fxParams.y); applyFx(); lcd(Math.round(state.fxParams.y*100));
  } else if(state.mode==="sound"||state.mode==="edit"){
    adjustSelected(["pitch","end","rel","sbpm","pan","hpf"][state.editPage]||"pitch", delta);
  } else if(state.mode==="sample"){
    state.sampleThreshold=clamp(state.sampleThreshold+delta*0.05,0.001,0.5); lcd("TH"+Math.round(state.sampleThreshold*100));
  } else { state.metroVol=clamp(state.metroVol+delta,0,1); lcd("MT"+Math.round(state.metroVol*10)); }
  if(state.stepLockMode && window.__ko2.writeLiveLock){
    const snd=pads[state.group][state.selectedPad];
    window.__ko2.writeLiveLock('pitch', snd?snd.pitch:0);
  }
  setStatus();
}
function onVol(delta){
  state.volume=clamp(state.volume+delta,0,1);
  setKnobAngle(document.getElementById("knobVol"),state.volume);
  if(window.__ko2.masterGain&&window.__ko2.ctx) window.__ko2.masterGain.gain.setTargetAtTime(state.volume, window.__ko2.ctx.currentTime, 0.02);
  lcd(Math.round(state.volume*100));
}

function bindFader(){
  const track=document.getElementById("faderTrack");
  const update=(clientY)=>{
    const rect=track.getBoundingClientRect();
    applyFaderValue(1-(clientY-rect.top)/rect.height);
    lcd(Math.round(state.fader*100));
    if(state.recording&&state.playing) recordFaderAutomation();
  };
  track.addEventListener("mousedown",(e)=>{
    e.preventDefault(); ensureAudio();
    const move=(ev)=>update(ev.clientY);
    const up=()=>{ window.removeEventListener("mousemove",move); window.removeEventListener("mouseup",up); };
    update(e.clientY); window.addEventListener("mousemove",move); window.addEventListener("mouseup",up);
  });
  track.addEventListener("touchstart",(e)=>update(e.touches[0].clientY),{passive:true});
  track.addEventListener("touchmove",(e)=>update(e.touches[0].clientY),{passive:true});
}

function buildPads(){
  const root=document.getElementById("pads"); root.innerHTML="";
  // Enable Force Touch events on Safari
  root.addEventListener("webkitmouseforcewillbegin",(e)=>e.preventDefault());
  const rows=[
    {labels:["LEVEL","PITCH","TIME"], pads:[0,1,2]},
    {labels:["LPF","HPF","→FX"], pads:[3,4,5]},
    {labels:["ATK","REL","PAN"], pads:[6,7,8]},
    {labels:["TUNE","VEL","MOD"], pads:[9,10,11]},
  ];
  rows.forEach(row=>{
    const lab=document.createElement("div"); lab.className="pad-lab-row";
    row.labels.forEach(t=>{ const s=document.createElement("span"); s.innerHTML='<i class="dot"></i>'+t; lab.appendChild(s); });
    root.appendChild(lab);
    const prow=document.createElement("div"); prow.className="pad-row";
    row.pads.forEach(i=>{
      const b=document.createElement("button"); b.type="button"; b.className="pad"; b.dataset.pad=i; b.textContent=PAD_LABELS[i];
      const down=(e)=>{
        e.preventDefault();
        b.classList.add("pressed");
        let vel=0.85;
        if(e.getModifierState && e.getModifierState("Shift")) vel=0.4;
        else if(e.getModifierState && e.getModifierState("Alt")) vel=1;
        else vel=velocityFromEvent(e,b);
        hitPad(i, vel, true);
        // aftertouch tracking
        const moveAT=(ev)=>{
          const at=aftertouchFromEvent(ev);
          if(at!=null){ applyAftertouch(state.group,i,at); if(state.fxHeld){ state.punchFx.set(i,at); updatePunchFx(); } }
        };
        const up=(ev)=>{
          b.classList.remove("pressed"); hitPad(i,0,false);
          window.removeEventListener("mousemove", moveAT);
          window.removeEventListener("mouseup", up);
          b.removeEventListener("touchmove", moveAT);
          b.removeEventListener("touchend", up);
          b.removeEventListener("webkitmouseforcechanged", moveAT);
        };
        window.addEventListener("mousemove", moveAT);
        window.addEventListener("mouseup", up);
        b.addEventListener("touchmove", moveAT, {passive:true});
        b.addEventListener("touchend", up);
        b.addEventListener("webkitmouseforcechanged", moveAT);
      };
      b.addEventListener("mousedown", down);
      b.addEventListener("touchstart", down, {passive:false});
      b.addEventListener("pointerdown",(e)=>{ if(e.pointerType==="pen"){ e.preventDefault(); down(e); } });
      b.addEventListener("dragover",(e)=>{ e.preventDefault(); b.style.outline="2px solid #e85a1a"; });
      b.addEventListener("dragleave",()=>b.style.outline="");
      b.addEventListener("drop", async(e)=>{ e.preventDefault(); b.style.outline=""; const f=e.dataTransfer.files[0]; if(f) await loadAudioToPad(f,state.group,i); });
      prow.appendChild(b);
    });
    root.appendChild(prow);
  });
}

Object.assign(window.__ko2, { hitPad, setStatus, updatePadLights, buildPads, onButton, adjustSelected, setKnobAngle, onKnobX, onKnobY, onVol, bindKnob, bindFader });
