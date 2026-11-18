// YOGI's face. A small rig of parameters (eyes, brows, mouth, cheeks, head)
// is tweened by GSAP for expressions and driven every frame by the voice's
// audio levels for lip sync. Rendering writes SVG attributes from the rig.
import {DotFace} from './dotface.js';
import {OrbFace} from './orbface.js';
import {EXPRESSION_BASE, EXPRESSIONS} from './expressions.js';
const gsap = window.gsap;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);

const MOUTH = {cx: 200, cy: 292};
const EYES = {L: {cx: 148, cy: 214}, R: {cx: 252, cy: 214}};
const BROWS = {L: {cx: 148, cy: 170}, R: {cx: 252, cy: 170}};

export class Face {
  constructor({getVoiceLevels, reducedMotion = () => false, style = () => 'dots'}) {
    this.getVoiceLevels = getVoiceLevels;
    this.reduced = reducedMotion;
    this.style = style;
    this.dots = new DotFace(document.getElementById('dotFace'));
    this.orb = new OrbFace(document.getElementById('orbFace'));
    this.gazeW = 0; this.pinned = null;
    this.t0 = performance.now();
    this.p = {lookX: 0, lookY: 0, blink: 1, eyeScale: 1, squint: 0, browL: 0, browR: 0, tiltL: 0, tiltR: 0,
      smile: .55, open: 0, width: 1, cheek: .5, headY: 0, headRot: 0, nod: 0, winkL:0,winkR:0,happyEyes:0,heartEyes:0,starEyes:0,xEyes:0,shades:0,tear:0,smirk:0};
    this.expression = null; this.expressionUntil = 0; this.replyBeat = 0;
    this.el = {
      head: $('head'), eyeL: $('eyeL'), eyeR: $('eyeR'), browL: $('browL'), browR: $('browR'),
      mouth: $('mouthShape'), clip: $('mouthClipPath'), teeth: $('teeth'), tongue: $('tongue'),
      cheekL: $('cheekL'), cheekR: $('cheekR'), rings: [...document.querySelectorAll('#rings .ring')],
      thoughts: [...document.querySelectorAll('#thoughts circle')], tuner: $('tuner'),
      stars: $('fxStars'), xs: $('fxX'), shades: $('fxShades'), tear: $('fxTear'),
    };
    this.state = 'idle';
    this.loops = [];
    this.buildTuner();
    this.level = 0; this.speakOpen = 0; this.speakWidth = 1;
    this.render();
    if (!gsap) return;
    gsap.ticker.add(() => this.tick());
    this.scheduleBlink();
    this.scheduleGlance();
    if (!this.reduced()) this.breathing = gsap.to(this.p, {headY: -4, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1});
    this.setState('idle', true);

  }

  // A ring of 28 bars around the head: tunes up while the voice is prepared,
  // then follows the real audio spectrum while YOGI speaks.
  buildTuner() {
    const count = 28, ns = 'http://www.w3.org/2000/svg';
    this.bars = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 360;
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', '197'); rect.setAttribute('width', '6'); rect.setAttribute('rx', '3');
      rect.setAttribute('transform', `rotate(${angle} 200 228)`);
      this.el.tuner.append(rect);
      this.bars.push({rect, h: 0});
    }
    this.setBars(0);
  }
  setBars(base, levels) {
    for (let i = 0; i < this.bars.length; i++) {
      const bar = this.bars[i];
      const target = levels ? levels[i] : base;
      bar.h += (target - bar.h) * .35;
      const h = Math.max(0, bar.h);
      bar.rect.setAttribute('y', String(228 - 190 - h));
      bar.rect.setAttribute('height', String(h));
      bar.rect.style.opacity = h < .5 ? '0' : '.9';
    }
  }

  scheduleBlink() {
    gsap.delayedCall(rand(1.8, 5.2), () => {
      if(this.reduced()){this.scheduleBlink();return;}
      const twice = Math.random() < .2;
      const tl = gsap.timeline({onComplete: () => this.scheduleBlink()});
      tl.to(this.p, {blink: .06, duration: .07, ease: 'power2.in'}).to(this.p, {blink: 1, duration: .12, ease: 'power2.out'});
      if (twice) tl.to(this.p, {blink: .06, duration: .07, delay: .08}).to(this.p, {blink: 1, duration: .12});
    });
  }
  scheduleGlance() {
    gsap.delayedCall(rand(1.4, 3.8), () => {
      if (['idle', 'listening', 'speaking', 'preparing'].includes(this.state) && !this.reduced()) {
        const spread = this.state === 'idle' ? 1 : .35;
        gsap.to(this.p, {lookX: rand(-.6, .6) * spread, lookY: rand(-.4, .35) * spread, duration: rand(.18, .32), ease: 'power3.out', overwrite: 'auto'});
      }
      this.scheduleGlance();
    });
  }

  stopLoops() { this.loops.forEach(t => t.kill()); this.loops = []; }

  setState(next, force = false) {
    if (!gsap || (next === this.state && !force)) return;
    const carry = !force && this.expression && performance.now()<this.expressionUntil && ['idle','speaking','preparing'].includes(next) ? {name:this.expression,remaining:(this.expressionUntil-performance.now())/1000} : null;
    this.expressionTimer?.kill();this.expression=null;
    $('faceTitle').textContent="YOGI's face — "+next;
    this.state = next;
    this.stopLoops();
    document.querySelector('.face-wrap').dataset.expression=next;
    const p = this.p, ease = 'power3.out';
    if(!this.reduced()&&!this.breathing)this.breathing=gsap.to(p,{headY:-4,duration:2.6,ease:'sine.inOut',yoyo:true,repeat:-1});
    this.breathing?.paused(this.reduced());
    if(this.reduced())gsap.set(p,{headY:0,nod:0});
    gsap.to(this.el.thoughts, {opacity: 0, duration: .2, overwrite: true});
    gsap.to(this.el.rings, {opacity: 0, duration: .2, overwrite: true});
    const calm = {winkL:0,winkR:0,happyEyes:0,heartEyes:0,starEyes:0,xEyes:0,shades:0,tear:0,smirk:0,eyeScale: 1, squint: 0, browL: 0, browR: 0, tiltL: 0, tiltR: 0, headRot: 0, cheek: .5, width: 1, duration: this.reduced()?0:.45, ease, overwrite: 'auto'};
    switch (next) {
      case 'idle':
        gsap.to(p, {...calm, smile: .55, lookX: 0, lookY: 0});
        break;
      case 'listening': {
        gsap.to(p, {...calm, ...EXPRESSIONS.curious.pose, eyeScale: 1.1, smile: .35, headRot: -4, lookX: 0, lookY: -.1});
        if (!this.reduced()) {
          this.loops.push(gsap.fromTo(this.el.rings, {scale: .92, opacity: .7, transformOrigin: '50% 50%'},
            {scale: 1.28, opacity: 0, duration: 1.8, ease: 'sine.out', stagger: {each: .6, repeat: -1}}));
        } else gsap.set(this.el.rings[0], {opacity: .5, scale: 1.05, transformOrigin: '50% 50%'});
        break;
      }
      case 'thinking': case 'reasoning': {
        gsap.to(p, {...calm, smile: .05, width: .62, browL: 10, browR: -2, tiltL: -8, tiltR: 6, headRot: 5, lookX: .55, lookY: -.75, cheek: .35});
        const dots = this.el.thoughts;
        if (!this.reduced()) {
          this.loops.push(gsap.timeline({repeat: -1, repeatDelay: .2})
            .fromTo(dots, {opacity: 0, scale: .4, y: 8, transformOrigin: '50% 50%'}, {opacity: .9, scale: 1, y: 0, duration: .45, ease: 'back.out(2)', stagger: .22})
            .to(dots, {opacity: 0, duration: .35, stagger: .12, delay: .8}));
          // Pondering: the eyes drift from one side to the other.
          this.loops.push(gsap.timeline({repeat: -1, repeatDelay: .6})
            .to(p, {lookX: -.5, lookY: -.7, headRot: -3, tiltL: 6, tiltR: -8, browL: -2, browR: 10, duration: .7, ease: 'sine.inOut', delay: 1.6})
            .to(p, {lookX: .55, lookY: -.75, headRot: 5, tiltL: -8, tiltR: 6, browL: 10, browR: -2, duration: .7, ease: 'sine.inOut', delay: 1.8}));
        } else gsap.set(dots, {opacity: .8});
        break;
      }
      case 'searching': {
        gsap.to(p,{...calm,...EXPRESSIONS.curious.pose,headRot:0,smile:.12,lookY:-.15,lookX:-.65});
        if(!this.reduced())this.loops.push(gsap.to(p,{lookX:.65,duration:.8,ease:'sine.inOut',yoyo:true,repeat:-1}));
        break;
      }
      case 'reading': {
        gsap.to(p,{...calm,...EXPRESSIONS.focused.pose,squint:.3,headRot:3,lookY:.75,lookX:-.55,smile:.18});
        if(!this.reduced())this.loops.push(gsap.to(p,{lookX:.6,duration:1.2,ease:'none',repeat:-1,repeatDelay:.25}));
        break;
      }
      case 'creating': {
        gsap.to(p,{...calm,eyeScale:1.12,browL:10,browR:10,lookX:.35,lookY:-.45,smile:.7,cheek:.85,headRot:-3});
        if(!this.reduced())this.loops.push(gsap.to(p,{lookX:-.35,headRot:3,duration:1.6,ease:'sine.inOut',yoyo:true,repeat:-1}));
        break;
      }
      case 'working': case 'usingtool':
        gsap.to(p,{...calm,...EXPRESSIONS.focused.pose,lookX:0,lookY:.12,smile:.15});
        break;
      case 'awaiting':
        gsap.to(p,{...calm,...EXPRESSIONS.curious.pose,lookX:0,lookY:0,headRot:-5,smile:.3});
        break;
      case 'success':
        gsap.to(p,{...calm,...EXPRESSIONS.proud.pose,lookX:0,lookY:0});
        this.nod();
        break;
      case 'writing': {
        gsap.to(p, {...calm, ...EXPRESSIONS.focused.pose, smile: .2, lookY: .55, lookX: .7, headRot: 2});
        if (!this.reduced()) this.loops.push(gsap.to(p, {lookX: .25, duration: .9, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: .5}));
        break;
      }
      case 'preparing': {
        gsap.to(p, {...calm, smile: .2, width: .72, open: .12, cheek: .75, eyeScale: 1.04, browL: 5, browR: 5, lookX: 0, lookY: 0});
        if (!this.reduced()) {
          // Tuning up: a wave of bars travels around the head, like an orchestra finding its note.
          const wave = {t: 0};
          this.loops.push(gsap.to(wave, {t: 1, duration: 1.4, ease: 'none', repeat: -1, onUpdate: () => {
            const n = this.bars.length;
            this.tunerLevels = this.bars.map((_, i) => 3 + 14 * Math.max(0, Math.sin((i / n - wave.t) * Math.PI * 2 * 2)) ** 3);
          }}));
          this.loops.push(gsap.to(p, {cheek: .9, duration: .7, yoyo: true, repeat: -1, ease: 'sine.inOut'}));
        }
        break;
      }
      case 'speaking':
        gsap.to(p, {...calm, smile: .45, lookX: 0, lookY: 0, browL: 2, browR: 2, cheek: .6});
        break;
      case 'error':
        gsap.to(p, {...calm, ...EXPRESSIONS.concerned.pose, lookY: .3});

        break;
    }
    if (next !== 'preparing') this.tunerLevels = null;
    if (next !== 'speaking' && next !== 'preparing') gsap.to(p, {open: 0, duration: this.reduced()?0:.25, overwrite: 'auto'});
    if(carry)this.express(carry.name,carry.remaining);
    else if(this.pinned&&!['listening','error'].includes(next))this.express(this.pinned,1e6,true);
  }

  // Reactions decorate the current activity; speech still drives the jaw.
  // A pinned expression stays until it is set back to automatic.
  pin(name) { this.pinned = EXPRESSIONS[name] ? name : null; this.setState(this.state, true); }
  express(name, seconds=2.6, fromPin=false) {
    const expression=EXPRESSIONS[name];if(!expression)return false;
    this.expressionTimer?.kill();this.stopLoops();
    this.expression=name;this.expressionUntil=performance.now()+seconds*1000;
    document.querySelector('.face-wrap').dataset.expression=name;
    $('faceTitle').textContent='YOGI — '+expression.label;
    const pose={...EXPRESSION_BASE,...expression.pose};
    // Keep live speech parameters under the audio analyser's control.
    if(this.state==='speaking'){delete pose.open;delete pose.width;}
    if(gsap)gsap.to(this.p,{...pose,duration:this.reduced()?0:.32,ease:'power2.out',overwrite:'auto'});
    else {Object.assign(this.p,pose);this.render();}
    const restore=()=>{this.expression=null;$('faceTitle').textContent="YOGI's face";this.setState(this.state,true);};
    if(gsap)this.expressionTimer=gsap.delayedCall(Math.max(.1,seconds),restore);
    return true;
  }
  cheer() { this.express('cheerful'); }
  setGaze(x, y) { this.gaze = {x, y, at: performance.now()}; }
  glanceScroll(direction) { this.scrollGlance = {y: direction, at: performance.now()}; }
  get busyExpression() { return !!this.expression && performance.now() < this.expressionUntil; }

  nod() {
    if (!gsap || this.reduced()) return;
    gsap.timeline().to(this.p, {nod: 6, duration: .18, ease: 'power2.out'}).to(this.p, {nod: 0, duration: .4, ease: 'power2.inOut'});
  }

  tick() {
    if(document.hidden||(document.body.classList.contains('has-file-workspace')&&!document.body.classList.contains('present')))return;
    const now=performance.now(),active=this.state==='speaking'||(this.music&&now-this.music.at<250);
    const fps=this.reduced()?8:active?60:this.state==='idle'?24:30,interval=1000/fps;
    if(this.lastFrame!==undefined&&now-this.lastFrame<interval)return;
    this.lastFrame=now-((now-(this.lastFrame??now))%interval);
    const p = this.p;
    if (this.state === 'speaking') {
      const v = this.getVoiceLevels?.();
      if (v) {
        // Lip sync: loudness opens the jaw, the balance of low and high
        // frequencies shapes it (round "oo" versus wide "ee" and "s").
        const attack = .55, release = .22;
        const target = clamp(v.level * 1.15, 0, 1);
        this.level += (target - this.level) * (target > this.level ? attack : release);
        const total = v.low + v.mid + v.high + 1e-6;
        const round = v.low / total, bright = (v.mid + v.high) / total;
        const width = clamp(.72 + bright * .62 - round * .18, .62, 1.25);
        this.speakWidth += (width - this.speakWidth) * .3;
        p.open = clamp(this.level * (1.05 - v.high / total * .35), 0, .95);
        p.width = this.speakWidth;
        this.lastBins = v.bins;
        if (v.bins && !this.reduced()) {
          const n = this.bars.length;
          this.setBars(0, this.bars.map((_, i) => {
            const k = i < n / 2 ? i : n - 1 - i;
            return 2 + (v.bins[Math.min(v.bins.length - 1, k)] || 0) * 22;
          }));
        } else this.setBars(0);
        // Small head movement on stressed syllables.
        if (target > .55 && this.level > .5 && Math.random() < .04) this.nod();
      }
    } else if (this.tunerLevels) this.setBars(0, this.tunerLevels);
    else this.setBars(0);
    this.render();
  }

  // The eyes follow the pointer in every state. The pointer's pull fades in when it
  // moves and fades out after it rests, so YOGI's own glances return naturally.
  view() {
    const p = this.p, now = performance.now(), active = !this.reduced() && this.gaze && now - this.gaze.at < 6000;
    const max = ['idle', 'listening', 'awaiting', 'success', 'speaking', 'preparing'].includes(this.state) ? 1 : .75;
    this.gazeW += ((active ? max : 0) - this.gazeW) * .12;
    let lookX = p.lookX, lookY = p.lookY;
    if (this.gazeW > .002) { lookX = p.lookX * (1 - this.gazeW) + clamp(this.gaze.x, -1.3, 1.3) * this.gazeW; lookY = p.lookY * (1 - this.gazeW) + clamp(this.gaze.y, -1.2, 1.2) * this.gazeW; }
    if (this.scrollGlance && now - this.scrollGlance.at < 450 && !this.reduced()) lookY = lookY * .5 + this.scrollGlance.y * .5;
    return lookX === p.lookX && lookY === p.lookY ? p : {...p, lookX, lookY};
  }
  render() {
    let view = this.view();
    const music=this.music;
    // Add a render-only rig offset so speech, work states and expression pins remain intact.
    if(music&&!this.reduced()&&!document.hidden&&performance.now()-music.at<250&&['idle','success'].includes(this.state)){
      const pulse=clamp(music.pulse,0,1),level=clamp(music.level,0,1);
      view={...view,headRot:view.headRot+music.side*pulse*9,headY:view.headY-pulse*15,nod:view.nod+level*3};
      if(!this.pinned&&!this.busyExpression){
        const weight=clamp(Math.max(level*1.65,pulse*.7),0,1);
        if(music.pose){
          const mixed={...view};
          for(const key of ['eyeScale','squint','browL','browR','tiltL','tiltR','cheek','width','open','smile','winkL','winkR','happyEyes','heartEyes','starEyes','xEyes','shades','tear','smirk']){
            const target=music.pose[key];if(Number.isFinite(target))mixed[key]=view[key]+(target-view[key])*weight;
          }
          view=mixed;
        }else view={...view,smile:Math.max(view.smile,.6+level*.3),happyEyes:Math.max(view.happyEyes,pulse*.45)};
      }
    }
    this.character?.pose(view,this.style());
    if (this.style() === 'orb') { this.orb.draw(view, {state: this.state, t: (performance.now() - this.t0) / 1000, bins: this.state === 'speaking' ? this.lastBins : null, reduced: this.reduced()}); return; }
    if (this.style() === 'dots') {
      this.dots.draw(view, {state: this.state, t: (performance.now() - this.t0) / 1000, bins: this.state === 'speaking' ? this.lastBins : null, reduced: this.reduced()});
      return;
    }
    const p = view, e = this.el;
    const headT = `translate(0 ${(p.headY + p.nod).toFixed(2)}) rotate(${p.headRot.toFixed(2)} 200 370)`;
    e.head.setAttribute('transform', headT);
    const fxEyes = Math.max(p.starEyes||0, p.xEyes||0, p.shades||0) > .5;
    const fxShift = `translate(${(p.lookX * 11).toFixed(2)} ${(p.lookY * 8).toFixed(2)})`;
    for (const [node, value] of [[e.stars, (p.starEyes||0) > .5 && p.blink > .3], [e.xs, (p.xEyes||0) > .5], [e.shades, (p.shades||0) > .5]]) { if (!node) continue; node.setAttribute('opacity', value ? '1' : '0'); node.setAttribute('transform', fxShift); }
    if (e.tear) { e.tear.setAttribute('opacity', String(clamp(p.tear||0, 0, 1))); e.tear.setAttribute('transform', fxShift); }
    for (const side of ['L', 'R']) {
      const eye = EYES[side], dx = p.lookX * 11, dy = p.lookY * 8;
      const wink=side==='L'?p.winkL:p.winkR;
      const sy = (fxEyes ? 0.001 : 1) * p.eyeScale * p.blink * (1 - p.squint * .45) * (1-wink) * (1-p.happyEyes*.9), sx = p.eyeScale;
      e['eye' + side].setAttribute('transform', `translate(${eye.cx + dx} ${eye.cy + dy}) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(${-eye.cx} ${-eye.cy})`);
      const brow = BROWS[side], raise = side === 'L' ? p.browL : p.browR, tilt = side === 'L' ? p.tiltL : p.tiltR;
      e['brow' + side].setAttribute('transform', `translate(${(dx * .4).toFixed(2)} ${(-raise + dy * .3 + p.squint * 4).toFixed(2)}) rotate(${tilt} ${brow.cx} ${brow.cy})`);
    }
    const cheekScale = 1 + (p.cheek - .5) * .25;
    for (const [node, cx] of [[e.cheekL, 118], [e.cheekR, 282]]) {
      node.style.opacity = String(clamp(p.cheek, 0, 1) * .8);
      node.setAttribute('transform', `translate(${cx} 268) scale(${cheekScale.toFixed(3)}) translate(${-cx} -268)`);
    }
    // Mouth geometry from the rig.
    const {cx, cy} = MOUTH, ox = p.lookX * 4;
    const w = 33 * p.width + p.smile * 4;
    const cornerY = cy - p.smile * 7;
    const topY = cy - 2 - p.open * 10 + p.smile * 2;
    const botY = cy + 4 + Math.max(0, p.smile) * 9 + p.open * 54 + Math.min(0, p.smile) * -2;
    const L = cx - w + ox, R = cx + w + ox, C = cx + ox;
    const frown = p.smile < 0 ? p.smile * -10 : 0;
    const sm = (p.smirk || 0) * 10, LY = cornerY + frown + sm * .6, RY = cornerY + frown - sm;
    const d = `M${L + sm} ${LY}C${C - w * .55} ${topY - frown * .4} ${C + w * .55} ${topY - frown * .4 - sm * .4} ${R} ${RY}C${C + w * .7} ${botY - sm * .5} ${C - w * .7} ${botY} ${L + sm} ${LY}Z`;
    e.mouth.setAttribute('d', d); e.clip.setAttribute('d', d);
    const topMid = .25 * cornerY + .75 * topY, botMid = .25 * cornerY + .75 * botY;
    e.teeth.setAttribute('x', String(C - w * .62)); e.teeth.setAttribute('width', String(w * 1.24));
    e.teeth.setAttribute('y', String(topMid - 3)); e.teeth.setAttribute('height', String(4 + p.open * 9));
    e.teeth.style.opacity = p.open > .12 ? '1' : '0';
    e.tongue.setAttribute('cx', String(C)); e.tongue.setAttribute('cy', String(botMid - 3 - p.open * 4));
    e.tongue.setAttribute('rx', String(w * .58)); e.tongue.setAttribute('ry', String(5 + p.open * 9));
    e.tongue.style.opacity = p.open > .2 ? '1' : '0';
  }
}
