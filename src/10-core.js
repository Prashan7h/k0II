(() => {
"use strict";
const PAD_LABELS = ["7","8","9","4","5","6","1","2","3",".","0","ENTER"];
const PAD_PARAMS = ["LEVEL","PITCH","TIME","LPF","HPF","→FX","ATK","REL","PAN","TUNE","VEL","MOD"];
const FADER_ASSIGNS = ["LEVEL","PITCH","TIME","LPF","HPF","FX","ATK","REL","PAN","TUNE","VEL","MOD"];
const FX_NAMES = ["DLY","REV","DST","CHO","FLT","CMP"];
const PLAY_MODES = ["one","key","leg","lop"];
const PUNCH_FX = [
  { id:"trem", name:"TRM", label:"Tremolo" },       // 7
  { id:"octdn", name:"OCT", label:"Octave Down" },  // 8
  { id:"deci", name:"DEC", label:"Decimator" },     // 9
  { id:"lpf", name:"LPF", label:"Low-Pass" },       // 4
  { id:"hpf", name:"HPF", label:"High-Pass" },      // 5
  { id:"send", name:"FX", label:"Send FX" },        // 6
  { id:"rept", name:"RPT", label:"Beat Repeat" },   // 1
  { id:"tape", name:"STP", label:"Tape Stop" },     // 2
  { id:"flfo", name:"LFO", label:"Filter LFO" },    // 3
  { id:"prand", name:"RND", label:"Pitch Rand" },   // .
  { id:"swap", name:"SWP", label:"Sample Swap" },   // 0
  { id:"gran", name:"GRN", label:"Granuliser" },    // ENTER
];
// Map pad index -> punch FX (pad order 7,8,9,4,5,6,1,2,3,.,0,ENTER)
const PUNCH_BY_PAD = [0,1,2, 3,4,5, 6,7,8, 9,10,11];
const STEPS_PER_BAR = 16;
const LOOKAHEAD = 0.025, SCHEDULE_AHEAD = 0.12;
const PPQN = 96;

function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
function lerp(a,b,t){ return a+(b-a)*t; }
function toast(msg){ const t=document.getElementById("toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toast._id); toast._id=setTimeout(()=>t.classList.remove("show"),2000); }
function lcd(text, blink){ const el=document.getElementById("lcd"); el.textContent=String(text).toUpperCase().slice(0,3).padStart(3," "); el.classList.toggle("blink",!!blink); }

function emptySound(name){
  return { name:name||"---", buffer:null, stretched:null, stretchBpm:0, level:0.9, pitch:0, tune:0, start:0, end:1,
    lpf:18000, hpf:20, atk:0.001, rel:0.05, pan:0, velSens:1, playMode:0, timeStretch:1, stretchMode:"off",
    sampleBpm:120, fxSend:0.15, layers:[] };
}
function emptyPattern(bars){
  return { notes:[], bars: bars||1, faderAuto:[] }; // notes: {step,tick,pad,vel,pitch,len,locks}
}
function emptyScene(){ return { patterns:[0,0,0,0], name:"" }; }

const state = {
  mode:"main", group:0, selectedPad:0, shift:false,
  playing:false, recording:false, recordArmed:false,
  bpm:120, swing:0.0, quantize:true, noteInterval:16, metronome:true, metroVol:0.25, volume:0.85,
  fader:0.85, faderAssign:0, faderHold:false,
  fxIndex:0, fxParams:{x:0.35,y:0.3}, fxOff:false,
  patternLength:16, currentStep:0, editPage:0,
  keysOctave:0, keysRootPad:0, keysMode:false,
  scene:0, songPos:0, songMode:false,
  countIn:0, punchFx:new Map(), // pad -> pressure
  soloGroups:null, fxHeld:false, eraseHeld:false,
  velCurve:"linear", fixedVel:0.85,
  inputGain:0.8, sampleThreshold:0.02, sampleArmed:false,
  midiIn:null, midiOut:null, midiLearn:false, midiMap:{}, stepLockMode:false,
  aftertouchParam:"lpf",
};

/** @type {ReturnType<typeof emptyPattern>[][]} patterns[group][patIdx] */
const patterns = [[],[],[],[]];
/** @type {ReturnType<typeof emptySound>[][]} */
const pads = [[],[],[],[]];
/** @type {ReturnType<typeof emptyScene>[]} */
const scenes = [];
/** @type {number[]} */
let song = [0];
const groupPatIdx = [0,0,0,0]; // current pattern index per group
const groupProjectVol = [1,1,1,1];

for (let g=0;g<4;g++){
  for (let i=0;i<12;i++) pads[g].push(emptySound("---"));
  for (let p=0;p<8;p++) patterns[g].push(emptyPattern(1));
}
scenes.push(emptyScene()); scenes[0].name="1";

window.__ko2 = { state, pads, patterns, scenes, song, groupPatIdx, PAD_LABELS, PUNCH_FX, clamp, lerp, toast, lcd, emptySound, emptyPattern };
