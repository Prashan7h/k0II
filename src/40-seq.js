/* ===== SEQUENCER / SCENES / SONG ===== */
let schedulerTimer=null, nextNoteTime=0, stepInBar=0;

function secondsPerStep(){ return (60/state.bpm)/4; } // 16th
function swingOffset(step){
  if(state.swing<=0) return 0;
  if(step%2===1) return secondsPerStep()*state.swing*0.55;
  return 0;
}
function currentPattern(g){ return patterns[g][groupPatIdx[g]] || patterns[g][0]; }
function patternSteps(g){ const p=currentPattern(g); return Math.min(99*STEPS_PER_BAR, (p.bars||1)*STEPS_PER_BAR); }

function scheduleStep(step, when){
  if(state.countIn>0){ playMetronome(when, state.countIn%4===0); return; }
  if(state.metronome && step%4===0) playMetronome(when, step%16===0);

  for(let g=0;g<4;g++){
    if(state.soloGroups && !state.soloGroups.has(g)) continue;
    const pat=currentPattern(g);
    const notes=pat.notes.filter(n=>n.step===step);
    for(const n of notes){
      const lenSec=(n.len||6)*(60/state.bpm)/24; // ticks at 96ppqn, 24 ticks/16th? use step fractions
      playSound(g, n.pad, when+(n.offset||0), n.vel==null?1:n.vel, n.pitch||0, null, n.locks);
    }
    // fader automation
    if(pat.faderAuto && pat.faderAuto.length){
      const fa=pat.faderAuto.find(a=>a.step===step);
      if(fa && g===state.group){
        state.fader=fa.value;
        applyFaderValue(fa.value, when);
      }
    }
  }
  if(state.punchFx.size) updatePunchFx();
  stepInBar=step; state.currentStep=step;
  if(Math.abs(when-(window.__ko2.ctx?window.__ko2.ctx.currentTime:0))<0.1){
    requestAnimationFrame(()=>{ lcd(String(step+1).padStart(3,"0")); if(window.__ko2.updatePadLights) window.__ko2.updatePadLights(); });
  }
}

function advanceStep(){
  if(state.countIn>0){
    state.countIn--; nextNoteTime+=secondsPerStep();
    if(state.countIn===0){ stepInBar=0; state.recording=true; state.recordArmed=false; lcd("REC",true); }
    return;
  }
  const step=stepInBar;
  nextNoteTime+=secondsPerStep()+swingOffset(step);
  const len=Math.max(state.patternLength, ...[0,1,2,3].map(patternSteps));
  let next=step+1;
  if(next>=len){
    next=0;
    if(state.songMode && song.length){
      state.songPos=(state.songPos+1)%song.length;
      recallScene(song[state.songPos]);
    }
  }
  stepInBar=next;
}

function schedulerTick(){
  const c=window.__ko2.ctx; if(!state.playing||!c) return;
  while(nextNoteTime<c.currentTime+SCHEDULE_AHEAD){
    scheduleStep(stepInBar, nextNoteTime); advanceStep();
  }
}

function startPlay(opts){
  opts=opts||{};
  ensureAudio(); window.__ko2.ctx.resume();
  if(state.playing) return;
  state.playing=true;
  stepInBar=opts.fromStart?0:state.currentStep;
  nextNoteTime=window.__ko2.ctx.currentTime+0.05;
  if(opts.countIn){ state.countIn=4; state.recordArmed=true; lcd("CNT"); }
  else {
    state.countIn=0;
    if(opts.record){ state.recording=true; lcd("REC",true); } else lcd("PLY");
  }
  if(window.__ko2.setStatus) window.__ko2.setStatus();
  if(window.__ko2.midiClockStart) window.__ko2.midiClockStart();
  schedulerTimer=setInterval(schedulerTick, LOOKAHEAD*1000);
  schedulerTick();
}
function stopPlay(){
  state.playing=false; state.recording=false; state.recordArmed=false; state.countIn=0;
  if(schedulerTimer){ clearInterval(schedulerTimer); schedulerTimer=null; }
  if(window.__ko2.midiClockStop) window.__ko2.midiClockStop();
  lcd(String(state.currentStep+1).padStart(3,"0"));
  if(window.__ko2.setStatus) window.__ko2.setStatus();
}

function addNote(group, pad, step, vel, pitch, len){
  const pat=currentPattern(group);
  pat.notes=pat.notes.filter(n=>!(n.step===step&&n.pad===pad&&(pitch==null||n.pitch===(pitch||0))));
  pat.notes.push({ step, tick:step*6, pad, vel:vel==null?1:vel, pitch:pitch||0, len:len||6, locks:{}, offset:0 });
}
function erasePadNotes(group, pad){ currentPattern(group).notes=currentPattern(group).notes.filter(n=>n.pad!==pad); }
function erasePattern(group){ currentPattern(group).notes=[]; currentPattern(group).faderAuto=[]; }

function commitScene(){
  // snapshot current pattern indices into a new scene
  const sc=emptyScene();
  sc.patterns=groupPatIdx.slice();
  sc.name=String(scenes.length+1);
  // deep-ish copy patterns into new pattern slots for each group so edits don't destroy previous
  for(let g=0;g<4;g++){
    const src=currentPattern(g);
    const copy={ bars:src.bars, notes:src.notes.map(n=>({...n, locks:{...n.locks}})), faderAuto:(src.faderAuto||[]).map(a=>({...a})) };
    // find next empty or push
    let idx=patterns[g].findIndex((p,i)=>i>groupPatIdx[g] && p.notes.length===0);
    if(idx<0){ patterns[g].push(copy); idx=patterns[g].length-1; }
    else patterns[g][idx]=copy;
    groupPatIdx[g]=idx;
    sc.patterns[g]=idx;
  }
  scenes.push(sc);
  state.scene=scenes.length-1;
  song.push(state.scene);
  lcd("COM"); toast("Committed scene "+scenes.length);
}
function recallScene(idx){
  idx=clamp(idx,0,scenes.length-1);
  state.scene=idx;
  const sc=scenes[idx];
  for(let g=0;g<4;g++) groupPatIdx[g]=sc.patterns[g]||0;
  lcd("SC"+String(idx+1).padStart(2,"0"));
}

function applyFaderValue(v, when){
  state.fader=clamp(v,0,1);
  const cap=document.getElementById("faderCap");
  if(cap) cap.style.top=((1-state.fader)*100)+"%";
  const c=window.__ko2.ctx; if(!c) return;
  const t=when||c.currentTime, g=state.group, fa=FADER_ASSIGNS[state.faderAssign];
  const nodes=window.__ko2.nodes;
  if(fa==="LEVEL") nodes.groupGains[g].gain.setTargetAtTime(0.05+state.fader*0.95,t,0.02);
  if(fa==="FX") nodes.groupFxSends[g].gain.setTargetAtTime(state.fader,t,0.02);
  if(fa==="LPF"){ nodes.groupFilters[g].type="lowpass"; nodes.groupFilters[g].frequency.setTargetAtTime(lerp(200,18000,state.fader),t,0.03); }
  if(fa==="HPF"){ nodes.groupFilters[g].type="highpass"; nodes.groupFilters[g].frequency.setTargetAtTime(lerp(20,5000,state.fader),t,0.03); }
}

function recordFaderAutomation(){
  if(!state.recording||!state.playing) return;
  const pat=currentPattern(state.group);
  pat.faderAuto=pat.faderAuto.filter(a=>a.step!==stepInBar);
  pat.faderAuto.push({ step:stepInBar, value:state.fader, assign:state.faderAssign });
}

Object.assign(window.__ko2, {
  startPlay, stopPlay, addNote, erasePadNotes, erasePattern, commitScene, recallScene,
  currentPattern, patternSteps, applyFaderValue, recordFaderAutomation,
  get stepInBar(){ return stepInBar; },
  set stepInBar(v){ stepInBar=v; },
});
