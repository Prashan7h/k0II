/* ===== HELP + INIT ===== */
function fillHelp(){
  document.getElementById("helpCard").innerHTML=`
<button type="button" class="close-help" id="closeHelp">Close</button>
<h2>K.O. II — browser recreation</h2>
<p>Faithful-ish EP-133 workflow. Factory-style synthesised kits (not TE samples).</p>
<h3>Modes &amp; combos</h3>
<ul>
<li><b>MAIN</b> play/sequence · <b>SHIFT+MAIN</b> Commit scene</li>
<li><b>SOUND</b> edit · <b>SHIFT+SOUND</b> Sound Edit pages (−/+)</li>
<li><b>TEMPO</b> BPM · <b>SHIFT+TEMPO</b> loop length · Knob Y = swing</li>
<li><b>SAMPLE</b> hold pad = mic record (threshold) · <b>SHIFT+SAMPLE</b> chop · <b>SHIFT+pad in SAMPLE</b> resample</li>
<li><b>KEYS</b> chromatic · <b>SHIFT+−/+</b> octave</li>
<li><b>FX</b> −/+ choose DLY/REV/DST/CHO/FLT/CMP · hold FX+pads = 12 punch-in FX (pressure)</li>
<li><b>FADER</b>+pad assigns LEVEL/PITCH/LPF/… · record automation while REC</li>
<li><b>TIMING</b> quantize toggle · <b>SHIFT+TIMING</b> timing correct</li>
<li><b>ERASE</b>+pad erase notes · <b>ERASE</b>+group erase pattern</li>
<li>Song: commit scenes, <b>SHIFT+PLAY</b> plays song chain</li>
</ul>
<h3>Pressure / velocity (Mac)</h3>
<ul>
<li><b>Force Touch trackpad (Safari)</b>: press harder on a pad — uses <code>webkitForce</code></li>
<li><b>Apple Pencil / stylus / some touch</b>: <code>PointerEvent.pressure</code></li>
<li><b>Mouse</b>: click higher on the pad = harder; <kbd>Shift</kbd>+click = soft, <kbd>Alt</kbd>+click = hard</li>
<li>Toolbar velocity curve: Soft / Linear / Hard / Fixed</li>
<li><b>Web MIDI</b>: MIDI button — real note velocity; learn mode maps notes to pads; clock out</li>
<li>Aftertouch / force-after-hit tweaks filter (aftertouch → LPF)</li>
<li><b>Vel Layers</b> toolbar: assign up to 4 samples per pad by velocity range</li>
<li><b>Step Lock</b>: arm lock mode, select step (−/+) &amp; pad, turn knobs to lock level/pitch/LPF/atk into the note</li>
<li>Punch-in pad <b>0</b> = Sample Swap (shuffles pad samples while held)</li>
</ul>
<h3>Punch-in FX (hold FX + pad)</h3>
<ul>
<li>7 Tremolo · 8 Octave down · 9 Decimator · 4 LPF · 5 HPF · 6 Send FX</li>
<li>1 Beat repeat · 2 Tape stop · 3 Filter LFO · . Pitch rand · 0 Sample swap · ENTER Granuliser</li>
<li>Combine LPF+HPF for band-pass. Pressure deepens the effect.</li>
</ul>
<h3>Keyboard</h3>
<ul>
<li>Pads: <kbd>7-9</kbd>/<kbd>UIO</kbd> <kbd>4-6</kbd>/<kbd>JKL</kbd> <kbd>1-3</kbd> <kbd>M,.</kbd> · Groups <kbd>A-D</kbd></li>
<li><kbd>Space</kbd> Play · <kbd>R</kbd> Record · <kbd>Q/W/E</kbd> Sound/Main/Tempo · <kbd>S</kbd> Sample · <kbd>F</kbd> FX · <kbd>Z</kbd> Keys · <kbd>T</kbd> Timing · <kbd>X</kbd> Erase · <kbd>[ ]</kbd> −/+ · <kbd>H</kbd> Help</li>
</ul>
<h3>Sound edit pages (SHIFT+SOUND, −/+)</h3>
<ul><li>SND level/pitch · TRM start/end · ENV atk/rel · TIM stretch mode/sample BPM · MOD play mode/pan · FLT LPF/HPF</li></ul>
`;
  document.getElementById("closeHelp").onclick=()=>document.getElementById("help").classList.remove("open");
}


/* ===== VELOCITY LAYERS + STEP LOCK UI ===== */
state.stepLockMode = false;
let layerTargetSlot = 0;

function openLayerPanel(){
  const g=state.group, pi=state.selectedPad;
  const snd=pads[g][pi];
  document.getElementById('layerPadLabel').textContent='ABCD'[g]+':'+PAD_LABELS[pi];
  if(!snd.layers) snd.layers=[];
  const root=document.getElementById('layerRows'); root.innerHTML='';
  for(let i=0;i<4;i++){
    const L=snd.layers[i]||{min:i*0.25, max:(i+1)*0.25, name:'—', buffer:null};
    const row=document.createElement('div'); row.className='row'; row.dataset.i=i;
    row.innerHTML=`<strong>L${i+1}</strong>
      <label>min</label><input type="number" class="lmin" min="0" max="1" step="0.01" value="${L.min}" style="width:58px" />
      <label>max</label><input type="number" class="lmax" min="0" max="1" step="0.01" value="${L.max}" style="width:58px" />
      <span class="lname" style="min-width:60px;color:#8cf">${L.buffer? (L.name||'SMP') : 'empty'}</span>
      <button type="button" class="lset">Set slot</button>`;
    row.querySelector('.lset').onclick=()=>{ layerTargetSlot=i; toast('Pick audio for layer '+(i+1)); document.getElementById('layerFile').click(); };
    root.appendChild(row);
  }
  document.getElementById('layerPanel').classList.add('open');
}
function saveLayersFromPanel(){
  const g=state.group, pi=state.selectedPad;
  const snd=pads[g][pi];
  const rows=[...document.getElementById('layerRows').children];
  const layers=[];
  rows.forEach((row,i)=>{
    const min=+row.querySelector('.lmin').value, max=+row.querySelector('.lmax').value;
    const prev=(snd.layers&&snd.layers[i])||{};
    if(prev.buffer || (snd.layers&&snd.layers[i]&&snd.layers[i].buffer)){
      layers.push({ min, max, name: prev.name||('L'+(i+1)), buffer: prev.buffer||snd.layers[i].buffer });
    }
  });
  // keep buffers from existing if user only changed ranges
  rows.forEach((row,i)=>{
    const min=+row.querySelector('.lmin').value, max=+row.querySelector('.lmax').value;
    const existing=snd.layers&&snd.layers[i];
    if(existing&&existing.buffer){
      const idx=layers.findIndex(L=>L.buffer===existing.buffer);
      if(idx>=0){ layers[idx].min=min; layers[idx].max=max; }
      else layers.push({ min, max, name: existing.name, buffer: existing.buffer });
    }
  });
  // dedupe by rebuilding cleanly
  const clean=[];
  rows.forEach((row,i)=>{
    const min=+row.querySelector('.lmin').value, max=+row.querySelector('.lmax').value;
    const existing=snd.layers&&snd.layers[i];
    if(existing&&existing.buffer) clean.push({ min, max, name: existing.name||('L'+(i+1)), buffer: existing.buffer });
  });
  snd.layers=clean;
  toast(clean.length? (clean.length+' velocity layers set') : 'No layers (need audio in slots)');
  lcd('LAY');
  document.getElementById('layerPanel').classList.remove('open');
}

async function loadLayerAudio(file){
  ensureAudio();
  const arr=await file.arrayBuffer();
  const buf=await window.__ko2.ctx.decodeAudioData(arr.slice(0));
  const g=state.group, pi=state.selectedPad;
  const snd=pads[g][pi];
  if(!snd.layers) snd.layers=[];
  while(snd.layers.length<4) snd.layers.push({ min:0, max:1, name:'—', buffer:null });
  const i=layerTargetSlot;
  snd.layers[i]={ min: i*0.25, max:(i+1)*0.25, name: file.name.slice(0,8), buffer: buf };
  openLayerPanel(); // refresh
  toast('Layer '+(i+1)+' ← '+file.name);
}

function refreshLockInfo(){
  const step=(+document.getElementById('lockStep').value||1)-1;
  const pad=+document.getElementById('lockPad').value;
  const pat=window.__ko2.currentPattern(state.group);
  const notes=pat.notes.filter(n=>n.step===step && n.pad===pad);
  document.getElementById('lockInfo').textContent = notes.length
    ? notes.map(n=>JSON.stringify({vel:n.vel, pitch:n.pitch, locks:n.locks||{}}, null, 0)).join('\n')
    : '(no notes on this step/pad — place one first)';
  // load first note locks into sliders
  if(notes[0]&&notes[0].locks){
    const L=notes[0].locks;
    if(L.level!=null) document.getElementById('lkLevel').value=L.level;
    if(L.pitch!=null) document.getElementById('lkPitch').value=L.pitch;
    if(L.lpf!=null) document.getElementById('lkLpf').value=L.lpf;
    if(L.atk!=null) document.getElementById('lkAtk').value=L.atk;
  }
}
function applyStepLocksFromPanel(){
  const step=(+document.getElementById('lockStep').value||1)-1;
  const pad=+document.getElementById('lockPad').value;
  const locks={
    level:+document.getElementById('lkLevel').value,
    pitch:+document.getElementById('lkPitch').value,
    lpf:+document.getElementById('lkLpf').value,
    atk:+document.getElementById('lkAtk').value,
  };
  const pat=window.__ko2.currentPattern(state.group);
  let notes=pat.notes.filter(n=>n.step===step && n.pad===pad);
  if(!notes.length){
    addNote(state.group, pad, step, 1);
    notes=pat.notes.filter(n=>n.step===step && n.pad===pad);
  }
  notes.forEach(n=>{ n.locks=Object.assign({}, n.locks||{}, locks); });
  toast('Locks written to step '+(step+1)+' pad '+PAD_LABELS[pad]);
  lcd('LCK');
  refreshLockInfo();
}
function writeLiveLock(param, value){
  if(!state.stepLockMode) return;
  const step=state.currentStep, pad=state.selectedPad;
  const pat=window.__ko2.currentPattern(state.group);
  let notes=pat.notes.filter(n=>n.step===step && n.pad===pad);
  if(!notes.length){ addNote(state.group, pad, step, 0.85); notes=pat.notes.filter(n=>n.step===step && n.pad===pad); }
  notes.forEach(n=>{ n.locks=n.locks||{}; n.locks[param]=value; });
  lcd('LCK');
}

function openLockPanel(){
  const sel=document.getElementById('lockPad');
  sel.innerHTML=PAD_LABELS.map((l,i)=>`<option value="${i}">${l}</option>`).join('');
  sel.value=state.selectedPad;
  document.getElementById('lockStep').value=state.currentStep+1;
  document.getElementById('lkLevel').value=0.9;
  document.getElementById('lkPitch').value=0;
  document.getElementById('lkLpf').value=18000;
  document.getElementById('lkAtk').value=0.001;
  refreshLockInfo();
  document.getElementById('lockPanel').classList.add('open');
}

function bindLayerLockUI(){
  document.getElementById('btnLayers').onclick=()=>openLayerPanel();
  document.getElementById('closeLayers').onclick=()=>document.getElementById('layerPanel').classList.remove('open');
  document.getElementById('layerPanel').addEventListener('click',(e)=>{ if(e.target.id==='layerPanel') e.target.classList.remove('open'); });
  document.getElementById('layerSave').onclick=saveLayersFromPanel;
  document.getElementById('layerClear').onclick=()=>{ pads[state.group][state.selectedPad].layers=[]; openLayerPanel(); toast('Layers cleared'); };
  document.getElementById('layerLoadBtn').onclick=()=>document.getElementById('layerFile').click();
  document.getElementById('layerFile').onchange=async(e)=>{ if(e.target.files[0]) await loadLayerAudio(e.target.files[0]); e.target.value=''; };

  document.getElementById('btnStepLock').onclick=()=>openLockPanel();
  document.getElementById('closeLock').onclick=()=>document.getElementById('lockPanel').classList.remove('open');
  document.getElementById('lockPanel').addEventListener('click',(e)=>{ if(e.target.id==='lockPanel') e.target.classList.remove('open'); });
  document.getElementById('lockApply').onclick=applyStepLocksFromPanel;
  document.getElementById('lockClear').onclick=()=>{
    const step=(+document.getElementById('lockStep').value||1)-1;
    const pad=+document.getElementById('lockPad').value;
    window.__ko2.currentPattern(state.group).notes.filter(n=>n.step===step&&n.pad===pad).forEach(n=>{ n.locks={}; });
    refreshLockInfo(); toast('Locks cleared');
  };
  document.getElementById('lockToggle').onclick=()=>{
    state.stepLockMode=!state.stepLockMode;
    document.getElementById('lockBadge').classList.toggle('on', state.stepLockMode);
    document.getElementById('lockToggle').textContent=state.stepLockMode?'Lock mode ON':'Arm lock mode';
    lcd(state.stepLockMode?'LCK':'OFF');
    toast(state.stepLockMode?'Step lock armed — select pad/step, turn knobs':'Step lock off');
  };
  document.getElementById('lockStep').onchange=refreshLockInfo;
  document.getElementById('lockPad').onchange=refreshLockInfo;
}

Object.assign(window.__ko2, { writeLiveLock, openLayerPanel, openLockPanel });


function bindUI(){
  buildPads();
  document.querySelectorAll(".group-btn").forEach(b=>{
    b.addEventListener("click",()=>{
      const g=+b.dataset.group;
      if(state.fxHeld){
        if(!state.soloGroups) state.soloGroups=new Set();
        if(state.soloGroups.has(g)) state.soloGroups.delete(g); else state.soloGroups.add(g);
        if(!state.soloGroups.size) state.soloGroups=null;
        lcd("SOL"); return;
      }
      if(state.eraseHeld){ erasePattern(g); lcd("PTN"); toast("Erased pattern"); updatePadLights(); return; }
      if(state.shift){
        // hold group + fader = project volume — on click cycle pattern
        groupPatIdx[g]=clamp(groupPatIdx[g]+1,0,patterns[g].length-1);
        lcd("P"+String(groupPatIdx[g]+1).padStart(2,"0"));
      }
      state.group=g; lcd(" "+ "ABCD"[g]+" "); setStatus();
    });
  });
  ["sound","main","tempo","sample","timing","fx","erase","keys","fader","record","play","minus","plus","shift"].forEach(name=>{
    const el=document.querySelector('[data-btn="'+name+'"]'); if(!el) return;
    el.addEventListener("mousedown",(e)=>{ e.preventDefault(); onButton(name,true); });
    el.addEventListener("mouseup",()=>onButton(name,false));
    el.addEventListener("mouseleave",()=>onButton(name,false));
    el.addEventListener("touchstart",(e)=>{ e.preventDefault(); onButton(name,true); },{passive:false});
    el.addEventListener("touchend",(e)=>{ e.preventDefault(); onButton(name,false); },{passive:false});
  });
  bindKnob(document.getElementById("knobX"), onKnobX);
  bindKnob(document.getElementById("knobY"), onKnobY);
  bindKnob(document.getElementById("knobVol"), onVol);
  bindFader(); applyFaderValue(0.85);
  setKnobAngle(document.getElementById("knobVol"), state.volume);
  setKnobAngle(document.getElementById("knobX"), (state.bpm-40)/200);
  setKnobAngle(document.getElementById("knobY"), state.swing);

  document.getElementById("btnHelp").onclick=()=>{ fillHelp(); document.getElementById("help").classList.add("open"); };
  document.getElementById("help").addEventListener("click",(e)=>{ if(e.target.id==="help") e.target.classList.remove("open"); });
  document.getElementById("btnSave").onclick=()=>saveLocal();
  document.getElementById("btnLoad").onclick=()=>loadLocal();
  document.getElementById("btnExport").onclick=()=>exportJson();
  document.getElementById("btnImport").onclick=()=>document.getElementById("fileJson").click();
  document.getElementById("fileJson").onchange=(e)=>{ if(e.target.files[0]) importJson(e.target.files[0]); };
  document.getElementById("btnBounce").onclick=()=>bounceWav().catch(err=>{ console.warn(err); toast("Bounce failed"); });
  document.getElementById("fileAudio").onchange=async(e)=>{
    const files=[...e.target.files];
    for(let i=0;i<files.length;i++) await loadAudioToPad(files[i], state.group, (state.selectedPad+i)%12);
  };
  document.querySelector('.toolbar label').addEventListener("click",()=>document.getElementById("fileAudio").click());
  document.getElementById("velCurve").onchange=(e)=>{
    state.velCurve=e.target.value;
    lcd(e.target.value.slice(0,3).toUpperCase());
  };
  document.getElementById("btnMidi").onclick=async()=>{
    if(state.shift){ state.midiLearn=true; lcd("LRN"); toast("Play a MIDI note to map to selected pad"); }
    else await initMidi();
  };
  document.getElementById("device").addEventListener("click",()=>{ ensureAudio(); if(window.__ko2.ctx.state==="suspended") window.__ko2.ctx.resume(); });

  const padKeys={
    Digit7:0,Digit8:1,Digit9:2,KeyU:0,KeyI:1,KeyO:2,
    Digit4:3,Digit5:4,Digit6:5,KeyJ:3,KeyK:4,KeyL:5,
    Digit1:6,Digit2:7,Digit3:8,KeyM:9,Comma:10,Period:11,
    Numpad7:0,Numpad8:1,Numpad9:2,Numpad4:3,Numpad5:4,Numpad6:5,
    Numpad1:6,Numpad2:7,Numpad3:8,Numpad0:10,NumpadDecimal:9,NumpadEnter:11,
  };
  const held=new Set();
  window.addEventListener("keydown",(e)=>{
    if(e.repeat) return;
    if(e.key==="?"||e.key==="h"||e.key==="H"){ if(!e.metaKey&&!e.ctrlKey){ fillHelp(); document.getElementById("help").classList.toggle("open"); return; } }
    if(e.code==="Space"){ e.preventDefault(); onButton("play",true); return; }
    if(e.code==="KeyR"){ onButton("record",true); return; }
    if(e.key==="Shift"){ onButton("shift",true); return; }
    if(e.code==="BracketLeft"){ onButton("minus",true); return; }
    if(e.code==="BracketRight"){ onButton("plus",true); return; }
    if(e.code==="KeyS"&&!e.metaKey){ onButton("sample",true); return; }
    if(e.code==="KeyF"&&!e.metaKey){ onButton("fx",true); return; }
    if(e.code==="KeyA"){ state.group=0; setStatus(); lcd(" A "); return; }
    if(e.code==="KeyB"){ state.group=1; setStatus(); lcd(" B "); return; }
    if(e.code==="KeyC"){ state.group=2; setStatus(); lcd(" C "); return; }
    if(e.code==="KeyD"){ state.group=3; setStatus(); lcd(" D "); return; }
    if(e.code==="KeyQ"){ onButton("sound",true); return; }
    if(e.code==="KeyW"){ onButton("main",true); return; }
    if(e.code==="KeyE"){ onButton("tempo",true); return; }
    if(e.code==="KeyT"){ onButton("timing",true); return; }
    if(e.code==="KeyX"){ onButton("erase",true); return; }
    if(e.code==="KeyZ"){ onButton("keys",true); return; }
    const pi=padKeys[e.code];
    if(pi!=null){
      e.preventDefault(); held.add(e.code);
      let vel=0.85;
      if(e.shiftKey) vel=0.35; else if(e.altKey) vel=1;
      hitPad(pi, applyVelCurve(vel), true);
    }
  });
  window.addEventListener("keyup",(e)=>{
    if(e.code==="Space") onButton("play",false);
    if(e.code==="KeyR") onButton("record",false);
    if(e.key==="Shift") onButton("shift",false);
    if(e.code==="KeyS") onButton("sample",false);
    if(e.code==="KeyF") onButton("fx",false);
    if(e.code==="KeyX") onButton("erase",false);
    if(padKeys[e.code]!=null && held.has(e.code)){ held.delete(e.code); hitPad(padKeys[e.code],0,false); }
  });
}

function init(){
  bindUI();
  bindLayerLockUI();
  try{ loadDefaultKit(); seedDemoPattern(); }
  catch(e){
    console.warn(e);
    document.body.addEventListener("click",()=>{ if(!pads[0][0]?.buffer){ loadDefaultKit(); seedDemoPattern(); } },{once:true});
  }
  lcd("KO2"); setStatus();
  // expose test hooks
  window.__ko2.ready=true;
}

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();
})();
