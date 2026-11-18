// YOGI's smooth face for the Glass look: a glossy sphere with two tall, soft
// eyes that track wherever you point, a simple mouth, and a thin activity arc.
// It reads the same rig as the other faces, so every expression works here too.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function css(name, fallback) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; }

export class OrbFace {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.colorsAt = -Infinity;
    this.resize(); this.resizeObserver=new ResizeObserver(() => this.resize());this.resizeObserver.observe(canvas);
  }
  resize() {
    const box = this.canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = Math.max(1, Math.round(Math.min(box.width, box.height) * dpr));
    if (this.canvas.width !== size || this.canvas.height !== size) { this.canvas.width = size; this.canvas.height = size; }
  }
  destroy(){this.resizeObserver.disconnect();}
  colors() {
    const now = performance.now();
    if (now - this.colorsAt > 500) {
      const light = document.documentElement.dataset.theme === 'light';
      this.c = {accent: css('--accent', '#0A84FF'), eye: css('--orb-eye', light ? '#1D1D1F' : '#FFFFFF'), top: light ? '#FFFFFF' : '#3A3D46', bottom: light ? '#D9DCE4' : '#0F1014', rim: light ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.22)', cheek: 'rgba(255,120,140,', shadow: light ? 'rgba(40,50,80,.18)' : 'rgba(0,0,0,.55)'};
      this.colorsAt = now;
    }
    return this.c;
  }
  draw(p, fx) {
    const c = this.colors(), g = this.ctx, S = this.canvas.width, u = S / 100; // drawing in a 100×100 space
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, S, S); g.scale(u, u);
    const bob = (p.headY + p.nod) * .12, rot = p.headRot * Math.PI / 180 * .6;
    // Sphere
    g.save(); g.translate(50, 50 + bob); g.rotate(rot);
    const body = g.createRadialGradient(-14, -20, 4, 0, 0, 52); body.addColorStop(0, css('--orb-top',c.top)); body.addColorStop(1, css('--orb-bottom',c.bottom));
    g.shadowColor = c.shadow; g.shadowBlur = 8; g.shadowOffsetY = 3;
    g.fillStyle = body; g.beginPath(); g.arc(0, 0, 44, 0, Math.PI * 2); g.fill();
    g.shadowColor = 'transparent';
    g.lineWidth = .8; g.strokeStyle = c.rim; g.stroke();
    // Specular highlight
    const spec = g.createRadialGradient(-16, -26, 0, -16, -26, 22); spec.addColorStop(0, 'rgba(255,255,255,.35)'); spec.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = spec; g.beginPath(); g.arc(0, 0, 44, 0, Math.PI * 2); g.fill();
    // Features move as a group with the gaze, like a face turning on a sphere.
    const gx = clamp(p.lookX, -1.3, 1.3) * 11, gy = clamp(p.lookY, -1.3, 1.3) * 9;
    g.translate(gx, gy);
    // Cheeks
    const blush = clamp((p.cheek - .5) * 1.6, 0, .6);
    if (blush > .02) for (const x of [-22, 22]) { const r = g.createRadialGradient(x, 13, 0, x, 13, 9); r.addColorStop(0, c.cheek + blush + ')'); r.addColorStop(1, c.cheek + '0)'); g.fillStyle = r; g.beginPath(); g.arc(x, 13, 9, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = c.eye; g.strokeStyle = c.eye; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const side of [-1, 1]) {
      const x = side * 14, y = -6, wink = (side < 0 ? p.winkL : p.winkR) || 0;
      const h = 19 * p.eyeScale * p.blink * (1 - p.squint * .5) * (1 - wink), w = 9.5 * p.eyeScale;
      // Brows
      const raise = side < 0 ? p.browL : p.browR, tilt = (side < 0 ? p.tiltL : p.tiltR) * Math.PI / 180;
      g.save(); g.translate(x, -19 - raise * .45 + p.squint * 2); g.rotate(tilt * .8); g.lineWidth = 2.2; g.globalAlpha = .55;
      g.beginPath(); g.moveTo(-5.5, 1); g.quadraticCurveTo(0, -2, 5.5, 1); g.stroke(); g.restore();
      if ((p.shades || 0) > .5) {
        g.fillStyle = '#0B0B0D'; g.beginPath(); g.ellipse(x, y + 1, 11, 8, 0, 0, Math.PI * 2); g.fill();
        if (side < 0) { g.lineWidth = 2.4; g.strokeStyle = '#0B0B0D'; g.beginPath(); g.moveTo(-3, y - 2); g.quadraticCurveTo(0, y - 4, 3, y - 2); g.stroke(); }
        g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - 6, y - 2); g.lineTo(x - 2, y - 5); g.stroke();
        g.fillStyle = c.eye; g.strokeStyle = c.eye; continue;
      }
      if ((p.starEyes || 0) > .5 && p.blink > .3) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 3.6 : 9; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.fillStyle = '#FFD60A'; g.fill(); g.fillStyle = c.eye; continue; }
      if ((p.xEyes || 0) > .5) { g.lineWidth = 2.8; g.beginPath(); g.moveTo(x - 5, y - 5); g.lineTo(x + 5, y + 5); g.moveTo(x + 5, y - 5); g.lineTo(x - 5, y + 5); g.stroke(); continue; }
      if ((p.heartEyes || 0) > .5 && p.blink > .3) { g.fillStyle = '#FF375F'; g.beginPath(); g.moveTo(x, y + 7); g.bezierCurveTo(x - 12, y - 1, x - 6, y - 11, x, y - 5); g.bezierCurveTo(x + 6, y - 11, x + 12, y - 1, x, y + 7); g.fill(); g.fillStyle = c.eye; continue; }
      if ((p.happyEyes || 0) > .5 && p.blink > .3) { g.lineWidth = 3; g.beginPath(); g.moveTo(x - 6, y + 2); g.quadraticCurveTo(x, y - 7, x + 6, y + 2); g.stroke(); continue; }
      // The pupil shifts inside the eye a little more than the face does, so the look is unmistakable.
      const px = clamp(p.lookX, -1.3, 1.3) * 2.6, py = clamp(p.lookY, -1.3, 1.3) * 2.4;
      const hh = Math.max(1.4, h);
      g.beginPath(); g.roundRect(x - w / 2 + px, y - hh / 2 + py, w, hh, Math.min(w, hh) / 2); g.fill();
    }
    if ((p.tear || 0) > .3) { g.globalAlpha = clamp(p.tear, 0, 1); g.fillStyle = '#64D2FF'; g.beginPath(); g.moveTo(-14, 4); g.quadraticCurveTo(-10, 10, -14, 13); g.quadraticCurveTo(-18, 10, -14, 4); g.fill(); g.globalAlpha = 1; g.fillStyle = c.eye; }
    // Mouth
    const mw = 9 * p.width + p.smile * 1.5, my = 15, sm = (p.smirk || 0) * 3;
    if (p.open < .14) {
      g.lineWidth = 2.6; g.beginPath(); g.moveTo(-mw + sm, my - p.smile * 2 + sm * .5); g.quadraticCurveTo(sm * .5, my + p.smile * 7 - (p.smile < 0 ? 1 : 0), mw, my - p.smile * 2 - sm); g.stroke();
    } else {
      const oh = 2 + p.open * 11;
      g.beginPath(); g.moveTo(-mw, my - p.smile * 2); g.quadraticCurveTo(0, my - 2 + p.smile * 1.5, mw, my - p.smile * 2); g.quadraticCurveTo(0, my + oh + p.smile * 3, -mw, my - p.smile * 2); g.fill();
    }
    g.restore();
    // Activity arc around the sphere
    const t = fx.t; let from = 0, len = 0, alpha = 0;
    if (fx.state === 'listening') { from = -Math.PI / 2; len = Math.PI * 2; alpha = fx.reduced ? .7 : .45 + .35 * Math.sin(t * 4); }
    else if (['thinking', 'reasoning', 'searching', 'reading', 'working', 'usingtool', 'writing', 'creating', 'preparing'].includes(fx.state)) { from = fx.reduced ? 0 : t * 3.2; len = Math.PI * .7; alpha = .9; }
    else if (fx.state === 'speaking') { const lvl = fx.bins ? fx.bins.reduce((a, b) => a + b, 0) / fx.bins.length : 0; from = -Math.PI / 2; len = Math.PI * 2; alpha = clamp(lvl * 3, .15, 1); }
    else if (fx.state === 'error') { from = 0; len = Math.PI * 2; alpha = .7; }
    if (alpha > 0) {
      g.lineWidth = 2; g.lineCap = 'round'; g.strokeStyle = fx.state === 'error' ? '#FF453A' : c.accent; g.globalAlpha = alpha;
      g.beginPath(); g.arc(50, 50 + bob, 47.5, from, from + len); g.stroke(); g.globalAlpha = 1;
    }
  }
}
