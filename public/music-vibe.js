import {EXPRESSION_BASE,EXPRESSIONS} from './expressions.js';
// Adaptive onset detector: actual bass/energy rises trigger a short, decaying pulse.
export class BeatDetector{
 constructor(){this.reset();}
 reset(){this.avg=.02;this.previous=0;this.lastBeat=-Infinity;this.last=null;this.pulse=0;this.level=0;this.side=1;this.frames=0;}
 sample({rms,bass},time){
  const dt=this.last===null?16:Math.min(100,Math.max(1,time-this.last));this.last=time;
  const energy=Math.min(1,Math.max(0,rms*2.5+bass*.4));
  const rise=energy-this.previous,threshold=Math.max(.025,this.avg*.22);
  const beat=this.frames>3&&rms>.006&&energy>Math.max(.045,this.avg*1.32)&&rise>threshold&&time-this.lastBeat>220;
  if(beat){this.lastBeat=time;this.pulse=Math.min(1,.4+energy);this.side*=-1;}
  else this.pulse*=Math.exp(-dt/155);
  this.level+=(Math.min(1,rms*5)-this.level)*(1-Math.exp(-dt/(rms>.01?55:110)));
  this.avg+=(energy-this.avg)*(1-Math.exp(-dt/700));this.previous=energy;this.frames++;
  return {beat,pulse:this.pulse,level:this.level,side:this.side};
 }
}
// Beat phrases move between complete poses; interpolation lets smiles, eyes and brows blend.
export class MusicExpressionMixer{
 constructor(){this.reset();}
 reset(){this.pose={...EXPRESSION_BASE};this.target={...EXPRESSION_BASE};this.last=null;this.changed=-Infinity;this.beats=0;this.index=-1;this.name='cheerful';}
 sample(audio,time){
  const dt=this.last===null?16:Math.min(100,Math.max(1,time-this.last));this.last=time;
  if(audio.beat){
   this.beats++;
   if(this.index<0||(this.beats%3===1&&time-this.changed>900)){
    this.index++;this.changed=time;
    const sequence=audio.level>.4?['cheerful','playful','mischievous','excited','cool','affectionate','laughing','proud']:['cheerful','relieved','playful','proud','mischievous','curious','affectionate','cool'];
    this.name=sequence[this.index%sequence.length];this.target={...EXPRESSION_BASE,...EXPRESSIONS[this.name].pose};
    if(this.name==='playful'&&this.index%2){this.target.winkR=this.target.winkL;this.target.winkL=0;}
   }
  }
  const ease=1-Math.exp(-dt/240);
  for(const key of Object.keys(EXPRESSION_BASE))this.pose[key]+=(this.target[key]-this.pose[key])*ease;
  return {pose:{...this.pose},expression:this.name};
 }
}
export function initMusicVibe({face,mediaDevices=navigator.mediaDevices,Audio=window.AudioContext||window.webkitAudioContext}){
 const button=document.querySelector('#musicVibe'),status=document.querySelector('#musicVibeStatus'),strength=document.querySelector('#musicVibeStrength');
 let stream=null,context=null,source=null,analyser=null,frame=0,version=0,starting=false,lastStatus='',quietAt=0;
 const detector=new BeatDetector(),mixer=new MusicExpressionMixer();
 const reduced=()=>document.documentElement.classList.contains('reduce-motion')||matchMedia('(prefers-reduced-motion: reduce)').matches;
 const say=text=>{if(lastStatus!==text){status.textContent=text;lastStatus=text;}};
 function stop(message='Music vibe is off.'){
  version++;starting=false;cancelAnimationFrame(frame);frame=0;
  const old=stream;stream=null;old?.getTracks().forEach(t=>t.stop());source?.disconnect();analyser?.disconnect();source=null;analyser=null;
  const oldContext=context;context=null;oldContext?.close().catch(()=>{});
  detector.reset();mixer.reset();face.music=null;document.body.removeAttribute('data-music-vibe');button.disabled=false;button.textContent='Vibe with music';button.setAttribute('aria-pressed','false');say(message);
 }
 async function start(){
  if(starting||stream)return;
  if(!mediaDevices?.getDisplayMedia||!Audio)return say('Audio sharing needs a supported desktop browser such as Chrome or Edge.');
  starting=true;const current=++version;button.disabled=true;say('Choose the tab playing music and enable Share tab audio.');
  let captured=null,createdContext=null;
  try{
   // The browser requires a video track for display capture. No frames are read, recorded or sent.
   captured=await mediaDevices.getDisplayMedia({video:true,audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,suppressLocalAudioPlayback:false},preferCurrentTab:true,selfBrowserSurface:'include',systemAudio:'include'});
   if(current!==version){captured.getTracks().forEach(t=>t.stop());return;}
   if(!captured.getAudioTracks().length){captured.getTracks().forEach(t=>t.stop());stop('No shared audio. Try again and enable Share tab audio, or choose a source that supports audio.');return;}
   stream=captured;createdContext=new Audio();context=createdContext;await context.resume();
   if(current!==version){captured.getTracks().forEach(t=>t.stop());if(createdContext.state!=='closed')await createdContext.close();return;}
   source=context.createMediaStreamSource(new MediaStream(captured.getAudioTracks()));analyser=context.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.2;source.connect(analyser);
   const wave=new Float32Array(analyser.fftSize),bins=new Uint8Array(analyser.frequencyBinCount);quietAt=performance.now();
   for(const track of stream.getTracks())track.addEventListener('ended',()=>{if(current===version)stop('Audio sharing ended. Music vibe is off.');},{once:true});
   button.disabled=false;button.textContent='Stop music vibe';button.setAttribute('aria-pressed','true');document.body.dataset.musicVibe='on';
   let lastAnalysis=-Infinity;
   const draw=time=>{
    if(!stream||current!==version||document.hidden){frame=0;return;}
    if(time-lastAnalysis<32){frame=requestAnimationFrame(draw);return;}lastAnalysis=time;
    analyser.getFloatTimeDomainData(wave);analyser.getByteFrequencyData(bins);let sum=0;for(const x of wave)sum+=x*x;const rms=Math.sqrt(sum/wave.length);
    const lo=Math.max(1,Math.floor(40*analyser.fftSize/context.sampleRate)),hi=Math.min(bins.length-1,Math.ceil(240*analyser.fftSize/context.sampleRate));let bass=0;for(let i=lo;i<=hi;i++)bass+=bins[i]/255;bass/=Math.max(1,hi-lo+1);
    const value=detector.sample({rms,bass},time),expression=mixer.sample(value,time),amount=Number(strength.value)/100;
    face.music=reduced()?null:{...value,...expression,pulse:value.pulse*amount,level:value.level*amount,at:time};
    if(rms>.006)quietAt=time;
    say(reduced()?'Audio linked. Face motion is paused by Reduce motion.':!['idle','success'].includes(face.state)?'Audio linked. YOGI’s current activity takes priority.':time-quietAt>2500?'Waiting for music in the shared audio. Device playback must be on this computer.':'Face follows the shared audio’s beat and energy.');
    frame=requestAnimationFrame(draw);
   };
   detector.reset();mixer.reset();frame=requestAnimationFrame(draw);starting=false;
   // Resume one analysis loop when the page becomes visible again.
   resume=()=>{if(stream&&current===version&&!frame){detector.reset();mixer.reset();frame=requestAnimationFrame(draw);}};
  }catch(error){captured?.getTracks().forEach(t=>t.stop());if(current===version)stop(error.name==='NotAllowedError'?'Audio sharing was cancelled or blocked. Music vibe stays off.':'Could not capture audio. Try Chrome or Edge and select a tab with shared audio.');}
 }
 let resume=()=>{};
 button.onclick=()=>stream||starting?stop():start();
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;face.music=null;}else resume();});
 window.addEventListener('pagehide',()=>stop());
 return {stop,start,get active(){return !!stream;}};
}
