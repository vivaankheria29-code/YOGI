import {canonicalWakeText} from './wake-word.js';
// YOGI's voice. Text arrives in pieces (sentence by sentence while a reply
// streams); each piece is synthesised ahead of time so playback is continuous.
// An AnalyserNode exposes live levels so the face can lip sync to real audio.
// Without an ElevenLabs key it can fall back to the browser's own voice.

export function cleanForSpeech(text) {
  return String(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/```[\s\S]*$/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'the link')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/[*_`#>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitForSpeech(text, max = 600) {
  const clean = cleanForSpeech(text), chunks = [];
  let rest = clean;
  while (rest.length > max) {
    let end = rest.lastIndexOf('. ', max);
    if (end < max / 2) end = rest.lastIndexOf(' ', max);
    end = end < 1 ? max : end + 1;
    chunks.push(rest.slice(0, end).trim()); rest = rest.slice(end).trim();
  }
  if (rest) chunks.push(rest);
  return chunks.filter(c => /[\p{L}\p{N}]/u.test(c));
}

export class VoicePlayer {
  constructor({onError, onState, onCaption, engine = () => 'auto', elevenReady = () => false}) {
    Object.assign(this, {onError, onState, onCaption, engine, elevenReady});
    this.context = null; this.analyser = null; this.version = 0;
    this.queue = []; this.playing = false; this.source = null; this.state = 'idle';
    this.speechText = ''; this.echoUntil = 0; this.streamingAudio = null;
    this.freq = null; this.time = null; this.synthLevel = 0; this.synthActive = false;
  }
  get isPlaying() { return this.state !== 'idle'; }
  get useBrowser() {
    const choice = this.engine();
    return choice === 'browser' || (choice === 'auto' && (!this.elevenReady() || this.fallback));
  }
  async unlock() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('Audio playback is not supported in this browser.');
    if (!this.context) {
      this.context = new AudioContext();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 1024; this.analyser.smoothingTimeConstant = .5;
      this.analyser.connect(this.context.destination);
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      this.time = new Uint8Array(this.analyser.fftSize);
    }
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('Audio is blocked. Press Enable audio to try again.');
    if (this.queue.length && !this.playing) { this.setState('preparing'); this.prefetch(); this.play(this.version); }
  }
  get canStream() { return typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported('audio/mpeg'); }
  matchesPlayback(transcript) {
    if (!this.speechText || (this.state !== 'speaking' && Date.now()>this.echoUntil)) return false;
    const normalize = value => canonicalWakeText(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
    const heard = normalize(transcript), spoken = normalize(this.speechText);
    return heard.length >= 5 && spoken.includes(heard);
  }
  markSpeech(text) { this.speechText = text; this.echoUntil = Date.now()+1000; }
  setState(state) { if (state !== this.state) { this.state = state; this.onState?.(state); } }

  stop() {
    this.version++;
    for (const item of this.queue) item.controller?.abort();
    this.queue = []; this.echoUntil = Date.now()+500;
    this.streamingAudio?.pause(); this.streamingAudio = null;
    if (this.source) { try { this.source.stop(); } catch {} this.source = null; }
    if (window.speechSynthesis) speechSynthesis.cancel();
    this.synthActive = false; this.playing = false;
    this.onCaption?.(null);
    this.setState('idle');
  }

  // Adds text to the end of what YOGI is saying.
  enqueue(text) {
    const pieces = splitForSpeech(text);
    if (!pieces.length) return;
    for (const piece of pieces) this.queue.push({text: piece});
    if (!this.context || this.context.state !== 'running') { this.setState('blocked'); return; }
    if (!this.playing) this.setState('preparing');
    this.prefetch();
    if (!this.playing) this.play(this.version);
  }

  prefetch() {
    if (this.useBrowser || this.canStream) return;
    let inFlight = 0;
    for (const item of this.queue) {
      if (item.audio || item.error) continue;
      if (item.promise) { inFlight++; continue; }
      if (inFlight >= 2) break;
      inFlight++;
      item.controller = new AbortController();
      item.promise = fetch('/api/tts', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text: item.text}), signal: item.controller.signal})
        .then(async response => {
          if (!response.ok) { const err = await response.json().catch(() => ({})); throw Object.assign(new Error(err.error || 'Could not generate the voice.'), {status: response.status}); }
          return this.context.decodeAudioData(await response.arrayBuffer());
        })
        .then(audio => { item.audio = audio; return audio; })
        .catch(error => { item.error = error; throw error; })
        .finally(() => this.prefetch());
      item.promise.catch(() => {});
    }
  }

  async play(version) {
    this.playing = true;
    while (this.queue.length && version === this.version) {
      const item = this.queue[0];
      try {
        if (this.useBrowser) await this.speakBrowser(item.text, version);
        else if (this.canStream) await this.playStream(item, version);
        else {
          if (!this.context || this.context.state !== 'running') throw new Error('Turn the voice on to hear YOGI.');
          if (!item.promise && !item.audio) this.prefetch();
          const audio = item.audio || await item.promise;
          if (version !== this.version) return;
          await this.playBuffer(audio, item.text, version);
        }
      } catch (error) {
        if (version !== this.version || error.name === 'AbortError') return;
        if (error.name === 'NotAllowedError') { this.playing=false;this.setState('blocked');return; }
        // A missing or rejected key falls back to the browser voice for this reply.
        if (window.speechSynthesis && ([400, 401, 402, 403, 404, 429, 499, 500, 502, 503].includes(error.status) || error.mediaFailure || error instanceof TypeError)) {
          // Say why once per reply, so a bad key is visible instead of a silent switch.
          if (!this.fallback) this.onError?.((error.message && !error.mediaFailure ? error.message + ' ' : 'ElevenLabs is unavailable. ') + 'Using the built-in voice for now.');
          this.fallback = true;
          try { await this.speakBrowser(item.text, version); } catch {}
        } else this.onError?.(error.message);
      }
      if (version !== this.version) return;
      this.queue.shift();
      if (this.queue.length) this.setState('preparing');
    }
    this.playing = false;
    if (version === this.version) { this.fallback=false;this.echoUntil=Date.now()+500;this.onCaption?.(null); this.setState('idle'); }
  }

  async playStream(item, version) {
    item.controller = new AbortController();
    const signal = item.controller.signal;
    const response = await fetch('/api/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:item.text}),signal});
    if(!response.ok){const error=await response.json().catch(()=>({}));throw Object.assign(new Error(error.error||'Could not generate voice.'),{status:response.status});}
    if(version!==this.version){await response.body?.cancel();return;}
    const media = new MediaSource(), audio = new Audio(), url = URL.createObjectURL(media);
    audio.src=url; this.streamingAudio=audio;
    let node, reader, bytes=0, started=false, rejectPlayback;
    const playback = new Promise((resolve,reject)=>{rejectPlayback=reject;audio.onended=resolve;audio.onerror=()=>reject(Object.assign(new Error('Streaming audio could not play.'),{mediaFailure:true}));});
    playback.catch(()=>{});
    const aborted=()=>rejectPlayback(new DOMException('Playback stopped.','AbortError'));
    signal.addEventListener('abort',aborted,{once:true});
    const until = (target,event,action) => new Promise((resolve,reject)=>{
      const cleanup=()=>{target.removeEventListener(event,done);target.removeEventListener('error',fail);signal.removeEventListener('abort',cancel);};
      const done=()=>{cleanup();resolve();},fail=()=>{cleanup();reject(Object.assign(new Error('Audio decoding failed.'),{mediaFailure:true}));},cancel=()=>{cleanup();reject(new DOMException('Playback stopped.','AbortError'));};
      target.addEventListener(event,done,{once:true});target.addEventListener('error',fail,{once:true});signal.addEventListener('abort',cancel,{once:true});
      if(signal.aborted)return cancel();try{action?.();}catch(error){cleanup();reject(error);}
    });
    try {
      if(media.readyState!=='open')await until(media,'sourceopen');
      node=this.context.createMediaElementSource(audio);node.connect(this.analyser);this.source=node;
      const buffer=media.addSourceBuffer('audio/mpeg');reader=response.body.getReader();
      audio.onplaying=()=>{this.markSpeech(item.text);this.setState('speaking');};
      while(true){
        const {done,value}=await reader.read();if(done)break;if(signal.aborted)throw new DOMException('Playback stopped.','AbortError');
        bytes+=value.byteLength;
        await until(buffer,'updateend',()=>buffer.appendBuffer(value));
        if(!started){started=true;audio.play().catch(rejectPlayback);this.onCaption?.({text:item.text,progress:()=>audio.currentTime/(Number.isFinite(audio.duration)?audio.duration:Math.max(bytes/16000,audio.currentTime+.2))});}
      }
      if(!started)throw Object.assign(new Error('No speech audio received.'),{mediaFailure:true});
      media.endOfStream();await playback;
    } finally {
      item.controller.abort();signal.removeEventListener('abort',aborted);audio.pause();audio.removeAttribute('src');audio.load();
      if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}
      node?.disconnect();if(this.source===node)this.source=null;if(this.streamingAudio===audio)this.streamingAudio=null;URL.revokeObjectURL(url);
    }
  }

  playBuffer(audio, text, version) {
    return new Promise(resolve => {
      const source = this.context.createBufferSource();
      source.buffer = audio; source.connect(this.analyser);
      this.source = source;
      source.onended = () => { source.disconnect(); if (this.source === source) this.source = null; resolve(); };
      source.start(); this.markSpeech(text);
      this.setState('speaking');
      const started = this.context.currentTime;
      this.onCaption?.({text, progress: () => version === this.version ? (this.context.currentTime - started) / audio.duration : 1});
    });
  }

  pickVoice() {
    const voices = speechSynthesis.getVoices();
    const english = voices.filter(v => /^en/i.test(v.lang));
    const prefer = [/en-IN.*(female|heera|neerja|swara)/i, /(heera|neerja|swara)/i, /google uk english female/i, /(samantha|zira|aria|jenny|libby|sonia)/i, /female/i, /en-IN/i];
    for (const rule of prefer) { const hit = english.find(v => rule.test(v.name + ' ' + v.lang)); if (hit) return hit; }
    return english[0] || voices[0] || null;
  }

  speakBrowser(text, version) {
    if (!window.speechSynthesis) return Promise.reject(new Error('This browser has no built-in voice. Add an ElevenLabs key in Settings.'));
    return new Promise((resolve,reject) => {
      const utter = new SpeechSynthesisUtterance(text);
      const voice = /[\u0900-\u097f]/.test(text) ? speechSynthesis.getVoices().find(v=>/^hi/i.test(v.lang)) : this.pickVoice(); if (voice) utter.voice = voice;
      utter.lang = /[\u0900-\u097f]/.test(text) ? 'hi-IN' : 'en-IN';
      utter.rate = 1.02; utter.pitch = 1.08;
      let spoken = 0;
      utter.onstart = () => {
        this.markSpeech(text);
        this.synthActive = true; this.setState('speaking');
        this.onCaption?.({text, progress: () => spoken / text.length});
      };
      // Each word boundary triggers a syllable pulse for the mouth.
      utter.onboundary = e => { spoken = e.charIndex; this.synthKick = performance.now(); };
      const done = () => { this.synthActive = false; resolve(); };
      utter.onend = done; utter.onerror = event => {this.synthActive=false;if(event.error==='not-allowed')reject(new DOMException('Press Enable audio to hear the reply.','NotAllowedError'));else if(event.error==='canceled'||event.error==='interrupted')resolve();else reject(new Error('The built-in voice could not speak. Try a different voice engine.'));};
      if (version !== this.version) return resolve();
      speechSynthesis.speak(utter);
    });
  }

  // Levels for lip sync: overall loudness plus low/mid/high band energy.
  levels() {
    if (this.synthActive) {
      // The browser voice is not analysable, so a syllable rhythm is synthesised
      // from word boundaries and a fast oscillation.
      const t = performance.now(), since = (t - (this.synthKick || 0)) / 1000;
      const pulse = Math.exp(-since * 7) * .9;
      const flutter = (Math.sin(t / 55) * .5 + .5) * (Math.sin(t / 137) * .5 + .5);
      const level = Math.min(1, pulse * .7 + flutter * .45);
      const bins = Array.from({length: 14}, (_, i) => level * (.4 + .6 * Math.abs(Math.sin(t / 90 + i))));
      return {level, low: .5 + Math.sin(t / 210) * .3, mid: .4, high: .2 + Math.max(0, Math.sin(t / 160)) * .3, bins};
    }
    if (!this.source || !this.analyser) return {level: 0, low: 0, mid: 0, high: 0, bins: null};
    this.analyser.getByteTimeDomainData(this.time);
    this.analyser.getByteFrequencyData(this.freq);
    let sum = 0;
    for (let i = 0; i < this.time.length; i++) { const v = (this.time[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / this.time.length);
    const hz = this.context.sampleRate / this.analyser.fftSize;
    const band = (a, b) => { let s = 0, n = 0; for (let i = Math.floor(a / hz); i <= Math.min(this.freq.length - 1, Math.floor(b / hz)); i++) { s += this.freq[i]; n++; } return n ? s / n / 255 : 0; };
    const bins = [];
    for (let i = 0; i < 14; i++) bins.push(band(120 * 1.32 ** i, 120 * 1.32 ** (i + 1)));
    return {level: Math.min(1, rms * 4.2), low: band(120, 900), mid: band(900, 2600), high: band(2600, 7000), bins};
  }
}

// Local input-level guard. This does not record or upload audio. Chrome's
// SpeechRecognition owns its own stream; this parallel meter rejects results
// without a sustained signal above the room's measured noise floor.
export class SpeechNoiseGate {
  constructor() { this.reset(); }
  reset() { this.floor = .003; this.calibration = []; this.started = null; this.run = 0; this.lastSpeech = -Infinity; this.previous = null; }
  sample(rms, now) {
    if (this.started === null) this.started = now;
    const dt = this.previous === null ? 0 : Math.min(80, Math.max(0, now-this.previous));
    this.previous = now;
    if (now-this.started < 650) {
      this.calibration.push(rms);
      const ordered = [...this.calibration].sort((a,b)=>a-b);
      this.floor = Math.max(.0005, ordered[Math.floor(ordered.length*.35)] || .0005);
      return;
    }
    const threshold = Math.max(.008, this.floor*2.8);
    if (rms > threshold) {
      this.run += dt;
      if (this.run >= 160) this.lastSpeech = now;
    } else {
      this.run = 0;
      this.floor += (rms-this.floor)*.015;
    }
  }
  recent(now) { return now-this.lastSpeech < 4500; }
}

export function confirmedTranscript(results, minimumConfidence = .65) {
  return Array.from(results).filter(result => {
    const alternative = result?.[0];
    if (!result?.isFinal || !alternative?.transcript?.trim()) return false;
    // Some engines report zero when confidence is unavailable. The local
    // noise gate remains mandatory in that case.
    const confidence = alternative.confidence;
    return confidence === 0 || confidence == null || confidence >= minimumConfidence;
  }).map(result => result[0].transcript.trim()).join(' ');
}

export class MicrophoneGuard {
  constructor() { this.gate = new SpeechNoiseGate(); this.version = 0; }
  async start() {
    if (this.ready) return;
    if (this.pending) return this.pending;
    const version = this.version;
    this.pending = this.open(version).finally(() => { if (version === this.version) this.pending = null; });
    return this.pending;
  }
  async open(version) {
    let stream, context;
    try {
      stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:false},video:false});
      if (version !== this.version) { stream.getTracks().forEach(track=>track.stop()); return; }
      context = new (window.AudioContext || window.webkitAudioContext)();
      this.stream = stream; this.context = context;
      await context.resume();
      if (version !== this.version) return;
      if (context.state !== 'running') throw new Error('Click Talk to activate the microphone.');
      const source = context.createMediaStreamSource(stream), analyser = context.createAnalyser();
      analyser.fftSize = 1024; source.connect(analyser);
      this.gate.reset();
      const samples = new Float32Array(analyser.fftSize);
      const tick = () => {
        if (version !== this.version) return;
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum,value)=>sum+value*value,0)/samples.length);
        this.gate.sample(rms, performance.now());
        this.timer = setTimeout(tick, 25);
      };
      tick();
      await new Promise(resolve=>setTimeout(resolve, 700));
      if (version === this.version) this.ready = true;
    } catch (error) {
      stream?.getTracks().forEach(track=>track.stop());
      context?.close().catch(()=>{});
      throw error;
    }
  }
  accepts() { return this.ready && this.gate.recent(performance.now()); }
  stop() {
    this.version++; this.ready = false; this.pending = null;
    clearTimeout(this.timer);
    this.stream?.getTracks().forEach(track=>track.stop()); this.stream = null;
    this.context?.close().catch(()=>{}); this.context = null;
    this.gate.reset();
  }
}
