/* ===== SYNTHESIZED FACTORY-STYLE KITS ===== */
function renderTone(fn, duration, sampleRate){
  ensureAudio();
  sampleRate=sampleRate||44100;
  const len=Math.floor(duration*sampleRate);
  const buf=ctx.createBuffer(1,len,sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=fn(i/sampleRate,i,len);
  // soft clip
  for(let i=0;i<len;i++) d[i]=Math.tanh(d[i]*1.2);
  return buf;
}
function env(t,a,hold,r,dur){
  if(t<a) return t/Math.max(a,1e-6);
  if(t<a+hold) return 1;
  const rs=Math.max(a+hold, dur-r);
  if(t<rs) return 1;
  return Math.max(0,1-(t-rs)/Math.max(r,1e-6));
}
function noise(){ return Math.random()*2-1; }

function makeKick(){
  return renderTone((t)=>{
    const f=150*Math.pow(0.03,t/0.4);
    const click=Math.sin(2*Math.PI*4000*t)*Math.exp(-t*80)*0.4;
    return (Math.sin(2*Math.PI*f*t)+click)*env(t,0.001,0.04,0.32,0.45)*1.3;
  },0.45);
}
function makeSnare(){
  return renderTone((t)=>{
    const tone=Math.sin(2*Math.PI*190*t)*Math.exp(-t*16);
    const n=noise()*Math.exp(-t*10);
    return (tone*0.35+n*0.75)*env(t,0.001,0.015,0.18,0.28);
  },0.28);
}
function makeHat(open){
  const dur=open?0.4:0.07;
  return renderTone((t)=>{
    let n=0; for(let h=1;h<=8;h++) n+=Math.sin(2*Math.PI*(1800+h*1700)*t);
    n=n*0.06+noise()*0.5;
    // bandpass-ish by differentiating
    return n*Math.exp(-t*(open?7:60))*env(t,0.0005,0.01,open?0.3:0.04,dur);
  },dur);
}
function makeClap(){
  return renderTone((t)=>{
    const bursts=[0,0.011,0.023,0.042]; let v=0;
    for(const b of bursts) if(t>=b) v+=noise()*Math.exp(-(t-b)*38);
    return v*0.55*env(t,0.001,0.02,0.14,0.22);
  },0.22);
}
function makeTom(f0){
  return renderTone((t)=>{
    const f=f0*Math.pow(0.45,t/0.28);
    return Math.sin(2*Math.PI*f*t)*env(t,0.002,0.05,0.22,0.35)*0.9;
  },0.35);
}
function makeRim(){
  return renderTone((t)=>(Math.sin(2*Math.PI*850*t)+0.6*Math.sin(2*Math.PI*1300*t))*Math.exp(-t*42)*0.4,0.1);
}
function makeClave(){
  return renderTone((t)=>Math.sin(2*Math.PI*2500*t)*Math.exp(-t*55)*0.55,0.09);
}
function makePerc(f){
  return renderTone((t)=>Math.sin(2*Math.PI*f*t)*Math.exp(-t*28)*0.65,0.14);
}
function makeBass(f, bright){
  return renderTone((t)=>{
    const s=Math.sin(2*Math.PI*f*t)+0.35*Math.sin(2*Math.PI*f*2*t)+(bright?0.15*Math.sin(2*Math.PI*f*3*t):0);
    return s*0.45*env(t,0.008,0.12,0.22,0.5);
  },0.5);
}
function makeKey(f){
  return renderTone((t)=>{
    const s=Math.sin(2*Math.PI*f*t)*0.55+Math.sin(2*Math.PI*f*2*t)*0.2+Math.sin(2*Math.PI*f*3*t)*0.08;
    return s*env(t,0.01,0.15,0.35,0.55);
  },0.55);
}
function makeVoxChop(f){
  return renderTone((t)=>{
    // formant-ish
    const a=Math.sin(2*Math.PI*f*t);
    const f1=Math.sin(2*Math.PI*(f*2.2)*t)*0.4;
    const f2=Math.sin(2*Math.PI*(f*3.5)*t)*0.2;
    const trem=0.7+0.3*Math.sin(2*Math.PI*6*t);
    return (a+f1+f2)*trem*0.3*env(t,0.02,0.08,0.15,0.35);
  },0.35);
}

function loadDefaultKit(){
  ensureAudio();
  const A=[
    [makeKick(),"KIK"],[makeSnare(),"SNR"],[makeHat(false),"CHH"],
    [makeHat(true),"OHH"],[makeClap(),"CLP"],[makeTom(130),"TMH"],
    [makeTom(95),"TMM"],[makeTom(70),"TML"],[makeRim(),"RIM"],
    [makeClave(),"CLV"],[makePerc(780),"PRC"],[makeBass(55),"SUB"],
  ];
  pads[0]=A.map(([b,n])=>{ const s=emptySound(n); s.buffer=b; return s; });

  const bassFs=[41,46,49,55,62,69,73,82,87,98,110,123];
  pads[1]=bassFs.map((f,i)=>{ const s=emptySound("BS"+String(i+1).padStart(2,"0")); s.buffer=makeBass(f,i>5); s.playMode=1; s.rel=0.25; s.atk=0.01; return s; });

  const keyFs=[261.63,293.66,329.63,349.23,392.00,440.00,493.88,523.25,587.33,659.25,698.46,783.99];
  pads[2]=keyFs.map((f,i)=>{ const s=emptySound("KY"+String(i+1).padStart(2,"0")); s.buffer=makeKey(f); s.playMode=1; s.rel=0.3; return s; });

  const voxFs=[180,200,220,247,270,300,330,360,400,440,480,520];
  pads[3]=voxFs.map((f,i)=>{ const s=emptySound("VX"+String(i+1).padStart(2,"0")); s.buffer=makeVoxChop(f); s.playMode=0; s.rel=0.12; return s; });
}

function seedDemoPattern(){
  const p=patterns[0][0]; p.notes=[]; p.bars=1;
  const add=(step,pad,vel)=>(p.notes.push({step,tick:step*6,pad,vel,pitch:0,len:6,locks:{}}));
  for(const s of [0,4,8,12]) add(s,0,1);
  for(const s of [4,12]) add(s,1,0.95);
  for(let s=0;s<16;s+=2) add(s,2,s%4===0?0.7:0.4);
  add(14,3,0.65); add(10,4,0.85);
  state.patternLength=16;
}

Object.assign(window.__ko2, { loadDefaultKit, seedDemoPattern, renderTone });
