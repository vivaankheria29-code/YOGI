// The waiting card shown in the thread between sending a message and the first
// words of the reply. It shows what is really happening (status from the
// server), how long it has been, and after a few seconds a short fact to read.
const gsap = window.gsap;

const STEPS = {
  General: ['Reading your message', 'Gathering my thoughts', 'Connecting the dots', 'Shaping an answer', 'Polishing the words', 'Almost there'],
  Build: ['Reading your request', 'Sketching the structure', 'Working through the details', 'Checking it fits together', 'Almost there'],
  Research: ['Reading your question', 'Looking at the sources', 'Comparing what they say', 'Checking the facts', 'Pulling it together'],
  Create: ['Reading your idea', 'Playing with options', 'Picking the best one', 'Adding the details', 'Almost there'],
  Plan: ['Reading your plan', 'Looking at your tasks', 'Putting things in order', 'Checking the timing', 'Almost there'],
};

// Short, checked facts. Shown one at a time while a longer answer is prepared.
const FACTS = [
  'Octopuses have three hearts and blue blood.',
  'A day on Venus lasts longer than a year on Venus.',
  'Bananas are berries, botanically speaking. Strawberries are not.',
  'The Eiffel Tower grows about 15 cm taller on hot summer days as its iron expands.',
  'Sharks were swimming in the oceans before the first trees grew on land.',
  'Wombats produce cube-shaped droppings.',
  'A group of flamingos is called a flamboyance.',
  'Sunlight takes about 8 minutes and 20 seconds to reach Earth.',
  'Your brain uses roughly a fifth of your body’s energy while weighing about 2% of it.',
  'The rules for calculating with zero were written down by the Indian mathematician Brahmagupta in 628 CE.',
  'Chess grew out of chaturanga, a game played in India around the sixth century.',
  'Hummingbirds are the only birds that can fly backwards.',
  'There are more possible chess games than atoms in the observable universe.',
  'At its triple point, water can boil and freeze at the same time.',
  'A teaspoon of neutron star would weigh around a billion tonnes on Earth.',
  'Butterflies taste with sensors on their feet.',
  'The first computer “bug” was a real moth, found in a Harvard relay in 1947.',
  'Sea otters often hold hands while they sleep so they do not drift apart.',
  'Jupiter’s Great Red Spot is a storm wider than the whole Earth.',
  'Ada Lovelace published what is often called the first computer program in 1843.',
  'Raipur is the capital of Chhattisgarh.',
  'Rakesh Sharma became the first Indian in space in 1984.',
  'In 2023 Chandrayaan-3 made India the first country to land near the Moon’s south pole.',
  'Koalas have fingerprints so like ours that they are hard to tell apart under a microscope.',
  'Honey sealed in ancient Egyptian tombs has been found still edible after thousands of years.',
  'Light from some stars you see tonight left them before humans had writing.',
];

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

export class WaitingCard {
  constructor({mode = 'General', reduced = () => false}) {
    this.reduced = reduced;
    this.steps = STEPS[mode] || STEPS.General;
    this.stepIndex = 0; this.started = performance.now(); this.realStatus = null; this.tweens = [];
    this.root = el('div', 'thinking');
    const row = el('div', 'think-row');
    this.orbit = el('div', 'orbit'); this.orbit.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i++) this.orbit.append(el('i'));
    this.text = el('div', 'think-text');
    this.time = el('span', 'think-time', '0s');
    row.append(this.orbit, this.text, this.time);
    this.lines = el('div', 'think-lines'); this.lines.setAttribute('aria-hidden', 'true');
    for (const w of [92, 78, 54]) { const i = el('i'); i.style.width = w + '%'; this.lines.append(i); }
    this.fact = el('div', 'fact'); this.fact.hidden = true;
    this.fact.append(el('span', 'fact-label', 'While you wait'), this.factText = el('p', 'fact-text'), this.factTimer = el('i', 'fact-timer'));
    this.factTimer.setAttribute('aria-hidden', 'true');
    this.root.append(row, this.lines, this.fact);
    this.show(this.steps[0]);
    this.animate();
    this.clock = setInterval(() => this.tickClock(), 250);
  }

  animate() {
    if (!gsap || this.reduced()) return;
    // Three dots chase each other around a small orbit, squashing as they pass.
    const dots = [...this.orbit.children];
    dots.forEach((dot, i) => {
      const state = {a: i * (Math.PI * 2 / 3)};
      this.tweens.push(gsap.to(state, {a: `+=${Math.PI * 2}`, duration: 1.6, ease: 'none', repeat: -1, onUpdate: () => {
        const r = 11, x = Math.cos(state.a) * r, y = Math.sin(state.a) * r * .7;
        gsap.set(dot, {x, y, scale: .65 + (Math.sin(state.a) * .5 + .5) * .55});
      }}));
    });
    this.tweens.push(gsap.fromTo(this.lines.children, {scaleX: .25, opacity: .4}, {scaleX: 1, opacity: 1, duration: 1.1, ease: 'sine.inOut', stagger: .18, yoyo: true, repeat: -1}));
  }

  // Letters of the status line rise in one after another.
  show(message) {
    this.current = message;
    this.text.replaceChildren();
    const label = message.endsWith('…') ? message : message + '…';
    this.text.setAttribute('aria-label', label);
    const chars = [...label].map(c => { const s = el('span', 'ch', c); s.setAttribute('aria-hidden', 'true'); return s; });
    this.text.append(...chars);
    if (gsap && !this.reduced()) gsap.from(chars, {y: 10, opacity: 0, duration: .32, ease: 'power3.out', stagger: .018});
  }

  setStatus(text) {
    if (!text) return;
    this.realStatus = text.replace(/[.…]+$/, '');
    this.lastReal = performance.now();
    if (this.realStatus !== this.current) this.show(this.realStatus);
  }

  tickClock() {
    const secs = (performance.now() - this.started) / 1000;
    this.time.textContent = Math.floor(secs) + 's';
    // Rotate friendly steps every few seconds, unless the server just told us what it is doing.
    const sinceReal = this.lastReal ? (performance.now() - this.lastReal) / 1000 : Infinity;
    const due = Math.floor(secs / 3.2);
    if (sinceReal > 4 && due !== this.lastDue) {
      this.lastDue = due;
      if (due > 0) { this.stepIndex = Math.min(this.steps.length - 1, this.stepIndex + 1); if (this.steps[this.stepIndex] !== this.current) this.show(this.steps[this.stepIndex]); }
    }
    if (secs > 5 && this.fact.hidden) this.startFacts();
  }

  startFacts() {
    this.fact.hidden = false;
    this.factIndex = Math.floor(Math.random() * FACTS.length);
    const next = () => {
      this.factIndex = (this.factIndex + 1) % FACTS.length;
      this.factText.textContent = FACTS[this.factIndex];
      if (gsap && !this.reduced()) {
        gsap.fromTo(this.factText, {opacity: 0, y: 8}, {opacity: 1, y: 0, duration: .45, ease: 'power3.out'});
        this.tweens.push(gsap.fromTo(this.factTimer, {scaleX: 0}, {scaleX: 1, duration: 8, ease: 'none'}));
      }
    };
    next();
    if (gsap && !this.reduced()) gsap.from(this.fact, {opacity: 0, y: 14, duration: .5, ease: 'power3.out'});
    this.factClock = setInterval(next, 8000);
  }

  destroy() {
    clearInterval(this.clock); clearInterval(this.factClock);
    this.tweens.forEach(t => t.kill());
    this.root.remove();
  }
}
