// YOGI as a circular LED dot matrix, in the spirit of Nothing's Glyph Matrix.
// The same face rig used by the illustrated face (eyes, brows, mouth, cheeks)
// is drawn at low resolution; each LED lights by how much of a feature covers
// it. The outer ring of LEDs shows what YOGI is doing.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const N = 35;                       // LEDs across
const REGION = {cx: 200, cy: 248, size: 270}; // part of the 400x420 rig shown on the matrix

function rgb(hex) {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) || 0);
}

export class DotFace {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.off = document.createElement('canvas');
    this.off.width = N; this.off.height = N;
    this.octx = this.off.getContext('2d', {willReadFrequently: true});
    this.colorsAt = -Infinity;
    this.cells = [];
    const R = N / 2 - .5;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x - (N - 1) / 2, dy = y - (N - 1) / 2, d = Math.hypot(dx, dy);
      if (d > R + .2) continue;
      let angle = Math.atan2(dx, -dy); if (angle < 0) angle += Math.PI * 2; // 0 at top, clockwise
      this.cells.push({x, y, d, angle, ring: d > R - 1.3});
    }
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
  }

  resize() {
    const box = this.canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = Math.max(1, Math.round(Math.min(box.width, box.height) * dpr));
    if (this.canvas.width !== size || this.canvas.height !== size) { this.canvas.width = size; this.canvas.height = size; }
  }
  destroy() { this.resizeObserver.disconnect(); }

  colors() {
    const now = performance.now();
    if (now - this.colorsAt > 500) {
      const css = getComputedStyle(this.canvas);
      this.c = {off: rgb(css.getPropertyValue('--dot-off') || '#1c1c1c'), on: rgb(css.getPropertyValue('--dot-on') || '#ffffff'), red: rgb(css.getPropertyValue('--dot-red') || '#d71921')};
      this.colorsAt = now;
    }
    return this.c;
  }

  // Draws the rig into the low-resolution buffer and returns LED coverage.
  coverage(p) {
    const g = this.octx, s = N / REGION.size;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, N, N);
    g.setTransform(s, 0, 0, s, -(REGION.cx - REGION.size / 2) * s, -(REGION.cy - REGION.size / 2) * s);
    // Head motion
    g.translate(0, p.headY + p.nod);
    g.translate(200, 370); g.rotate(p.headRot * Math.PI / 180); g.translate(-200, -370);
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round';
    const dx = p.lookX * 12, dy = p.lookY * 9;
    // Cheeks glow faintly when she is happy
    const blush = clamp((p.cheek - .55) * 1.4, 0, .5);
    if (blush > .02) {
      g.globalAlpha = blush;
      for (const cx of [116, 284]) { g.beginPath(); g.ellipse(cx, 274, 24, 14, 0, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
    }
    for (const [cx, side] of [[146, 'L'], [254, 'R']]) {
      // Eyes, with a dark glint cut out of each
      const wink=(side==='L'?p.winkL:p.winkR)||0;
      const ry = 31 * p.eyeScale * p.blink * (1 - p.squint * .45) * (1-wink), rx = 23 * p.eyeScale;
      const ex=cx+dx,ey=214+dy;
      if((p.shades||0)>.5){
        // Sunglasses: two lit lenses joined by a bridge, a dark glint on each.
        g.beginPath();g.ellipse(ex,ey+2,30,22,0,0,Math.PI*2);g.fill();
        if(side==='L'){g.lineWidth=7;g.beginPath();g.moveTo(ex+28,ey-6);g.lineTo(ex+80,ey-6);g.stroke();}
        g.globalCompositeOperation='destination-out';g.lineWidth=5;g.beginPath();g.moveTo(ex-14,ey-8);g.lineTo(ex-2,ey-14);g.stroke();g.globalCompositeOperation='source-over';
      } else if((p.starEyes||0)>.5 && p.blink>.3){
        g.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?12:30;g.lineTo(ex+Math.cos(a)*r,ey+Math.sin(a)*r);}g.closePath();g.fill();
      } else if((p.xEyes||0)>.5){
        g.lineWidth=9;g.beginPath();g.moveTo(ex-17,ey-17);g.lineTo(ex+17,ey+17);g.moveTo(ex+17,ey-17);g.lineTo(ex-17,ey+17);g.stroke();
      } else if((p.heartEyes||0)>.5 && p.blink>.3){
        const x=cx+dx,y=214+dy;g.beginPath();g.moveTo(x,y+25);g.bezierCurveTo(x-42,y-3,x-23,y-38,x,y-17);g.bezierCurveTo(x+23,y-38,x+42,y-3,x,y+25);g.fill();
      } else if((p.happyEyes||0)>.5 && p.blink>.3){
        g.lineWidth=9;g.beginPath();g.moveTo(cx+dx-22,220+dy);g.quadraticCurveTo(cx+dx,189+dy,cx+dx+22,220+dy);g.stroke();
      } else {
        g.beginPath(); g.ellipse(cx + dx, 214 + dy, rx, Math.max(2.5, ry), 0, 0, Math.PI * 2); g.fill();
        if (ry > 12) { g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(cx + dx + 8, 214 + dy - ry * .38, 7, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'source-over'; }
      }
      // Brows
      const raise = side === 'L' ? p.browL : p.browR, tilt = (side === 'L' ? p.tiltL : p.tiltR) * Math.PI / 180;
      const by = 152 - raise * 1.2 + dy * .3 + p.squint * 4;
      g.save(); g.translate(cx + dx * .4, by); g.rotate(tilt);
      g.lineWidth = 8; g.beginPath(); g.moveTo(-22, 6); g.quadraticCurveTo(0, -8, 22, 6); g.stroke(); g.restore();
    }
    if((p.tear||0)>.3){g.globalAlpha=Math.min(1,p.tear);const tx=150+dx,ty=252+dy;g.beginPath();g.moveTo(tx,ty-14);g.quadraticCurveTo(tx+10,ty+2,tx,ty+8);g.quadraticCurveTo(tx-10,ty+2,tx,ty-14);g.fill();g.globalAlpha=1;}
    // Mouth: the same geometry as the illustrated face
    const cy = 296, ox = p.lookX * 4;
    const w = 36 * p.width + p.smile * 4;
    const cornerY = cy - p.smile * 8;
    const topY = cy - 3 - p.open * 10 + p.smile * 2;
    const botY = cy + 6 + Math.max(0, p.smile) * 9 + p.open * 56 + Math.min(0, p.smile) * -2;
    const frown = p.smile < 0 ? p.smile * -10 : 0;
    const L = 200 - w + ox, R = 200 + w + ox, C = 200 + ox;
    // A closed mouth is drawn as a curved line, so the smile reads at LED resolution.
    if (p.open < .16) {
      const bend = p.smile * 36 - (p.smile < 0 ? 6 : 0);
      g.lineWidth = 9 + p.open * 30;
      const sm = (p.smirk || 0) * 12;
      g.beginPath(); g.moveTo(L + sm * .8, cy - p.smile * 10 + sm * .5); g.quadraticCurveTo(C + sm, cy + bend - sm * .6, R, cy - p.smile * 10 - sm); g.stroke();
      return g.getImageData(0, 0, N, N).data;
    }
    g.beginPath();
    g.moveTo(L, cornerY + frown);
    g.bezierCurveTo(C - w * .55, topY - frown * .4, C + w * .55, topY - frown * .4, R, cornerY + frown);
    g.bezierCurveTo(C + w * .7, botY, C - w * .7, botY, L, cornerY + frown);
    g.fill();
    // An open mouth shows a dark inside, so it reads as a mouth and not a blob
    if (p.open > .3) {
      g.globalCompositeOperation = 'destination-out';
      const inset = 9;
      // Use the actual curve midpoints, so a broad laugh keeps its lower lip.
      const upper = .25 * (cornerY + frown) + .75 * (topY - frown * .4);
      const lower = .25 * (cornerY + frown) + .75 * botY;
      g.beginPath(); g.ellipse(C, (upper + lower) / 2, Math.max(0, w * .62 - inset * .4), Math.max(0, (lower - upper) * .3 - 1), 0, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    return g.getImageData(0, 0, N, N).data;
  }

  ringLevel(cell, fx) {
    const t = fx.t, a = cell.angle;
    switch (fx.state) {
      case 'listening': return fx.reduced ? .7 : .45 + .45 * Math.sin(t * 4.2);
      case 'thinking': case 'reasoning': case 'searching': case 'reading': case 'working': case 'usingtool': case 'writing': {
        if (fx.reduced) return .25;
        const head = (t * (fx.state === 'thinking' ? 3.4 : 1.8)) % (Math.PI * 2);
        let d = head - a; if (d < 0) d += Math.PI * 2;
        return Math.max(0, 1 - d / 1.6) ** 2;
      }
      case 'creating': case 'preparing': {
        if (fx.reduced) return .3;
        const v = Math.sin((a / (Math.PI * 2) - t * .75) * Math.PI * 4);
        return Math.max(0, v) ** 3;
      }
      case 'awaiting': return .3;
      case 'success': return fx.reduced ? .5 : .3 + .25 * Math.sin(t * 3);
      case 'error': return .65;
      case 'speaking': {
        if (!fx.bins) return 0;
        const half = a <= Math.PI ? a : Math.PI * 2 - a;
        const k = Math.min(fx.bins.length - 1, Math.floor(half / Math.PI * fx.bins.length));
        return clamp(fx.bins[k] * 1.6, 0, 1);
      }
      default: return 0;
    }
  }

  draw(p, fx) {
    const data = this.coverage(p), c = this.colors(), ctx = this.ctx;
    const size = this.canvas.width, cell = size / N, r = cell * .36;
    ctx.clearRect(0, 0, size, size);
    const red = fx.state === 'listening' || fx.state === 'error';
    for (const k of this.cells) {
      let level = data[(k.y * N + k.x) * 4 + 3] / 255;
      let color = c.on;
      if (k.ring) {
        const ring = this.ringLevel(k, fx);
        if (ring > level) { level = ring; if (red) color = c.red; }
      }
      level = level < .08 ? 0 : level;
      const redChannel=Math.round(c.off[0]+(color[0]-c.off[0])*level),greenChannel=Math.round(c.off[1]+(color[1]-c.off[1])*level),blueChannel=Math.round(c.off[2]+(color[2]-c.off[2])*level);
      ctx.fillStyle = `rgb(${redChannel},${greenChannel},${blueChannel})`;
      ctx.beginPath();
      ctx.arc((k.x + .5) * cell, (k.y + .5) * cell, r * (level > 0 ? 1 : .82), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
