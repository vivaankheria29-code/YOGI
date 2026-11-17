// Match "Hey Yogi" the way speech services actually transcribe it, across accents.
// Three sensitivity levels:
//   strict    – known spellings only ("hey yogi", "hi yogee", "हे योगी")
//   balanced  – also near-misses ("hey yoki", "hey yogic", "a yogi", "heyogi")
//   sensitive – also the name alone at the start of what you say ("Yogi, what's the time?")
// Original character offsets keep the question's own spelling and language.
const GREETINGS = new Set(['hey','hay','hai','hi','hii','hiya','heya','hello','helo','hallo','ok','okay','oye','oi','हे','हाय','है','ए','हेलो','ओके','अरे']);
const LOOSE_GREETINGS = new Set(['he','a','ay','ey','eh','hei','hy','high','hay','yo','are','arey','arre','re','heyy','heyyy','yeah']);
const NAMES = new Set(['yogi','yogee','yogie','yogy','yoga','jogi','yogiji','yogii','yogis','योगी','योगि','जोगी','योगीजी']);
const SPLIT_TAILS = new Set(['gi','gee','ghee','ji','g','gy','key','ki']);
let level = 'balanced';
export function setWakeSensitivity(value) { level = ['strict', 'balanced', 'sensitive'].includes(value) ? value : 'balanced'; }
export function wakeSensitivity() { return level; }

function tokenKey(text) {
  const key = text.normalize('NFKC').toLowerCase();
  return /[a-z]/i.test(key) ? key.normalize('NFD').replace(/\p{M}/gu, '') : key;
}
function distance(a, b) {
  const row = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const tmp = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
  }
  return row[b.length];
}
// Does this single word sound like "Yogi"?
function isName(word, mode = level) {
  if (NAMES.has(word)) return true;
  if (mode === 'strict') return false;
  if (!/^[yj]/.test(word) && !/^[योजो]/u.test(word)) return false;
  if (/^[yj]o+g+h?(i|ee|ie|y|ey|ey|e|ii|ji)s?$/.test(word)) return true;
  if (/^yog(ic|ish|ie?s|ey|hi)$/.test(word)) return true;
  if (/^yo(k|c|kk)(i|ee|y|ie)$/.test(word)) return true;
  return word.length >= 4 && word.length <= 6 && Math.min(distance(word, 'yogi'), distance(word, 'yogee')) <= 1;
}
// Loose greetings ("a", "he", "are") only count at the start of an utterance,
// so "I saw a yogi" never wakes YOGI.
function isGreeting(word, mode = level, first = false) {
  return GREETINGS.has(word) || (mode !== 'strict' && first && LOOSE_GREETINGS.has(word)) || (mode !== 'strict' && ['heyy','heyyy','hei','hy'].includes(word));
}
// "heyyogi", "heyogi", "hiyogi": greeting and name glued into one token.
function gluedWake(word, mode = level) {
  if (mode === 'strict') return /^(hey|hi|hay|hai)y?ogi(e|ee)?$/.test(word);
  const m = /^(hey+|hay|hai|hi+|hello|ok|okay|a|ay|he)(y?o.+)$/.exec(word);
  return !!m && isName(m[2].startsWith('y') ? m[2] : 'y' + m[2], mode);
}

export function findWakePhrase(text, mode = level) {
  if (typeof text !== 'string') return null;
  const tokens = [...text.matchAll(/[\p{L}\p{M}\p{N}']+/gu)].map(m => Object.assign(m, {key: tokenKey(m[0]).replace(/'s$|'/g, '')}));
  const done = (start, endToken) => {
    if (['ji', 'जी'].includes(tokens[endToken + 1]?.key)) endToken++;
    const index = tokens[start].index, end = tokens[endToken].index + tokens[endToken][0].length;
    return {index, end, phrase: text.slice(index, end), question: text.slice(end).replace(/^[\s,.:;!?।–—-]+/u, '').trim()};
  };
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i].key, next = tokens[i + 1]?.key || '';
    if (gluedWake(word, mode)) return done(i, i);
    if (isGreeting(word, mode, i === 0 || /[.!?।]\s*$/u.test(text.slice(0, tokens[i].index)))) {
      if (next && isName(next, mode)) return done(i, i + 1);
      // "hey yo gee" / "hey yo ki": the name split in two.
      if (next === 'yo' && SPLIT_TAILS.has(tokens[i + 2]?.key || '')) return done(i, i + 2);
      // "hey you gee" is a common mishearing in Indian English.
      if (mode !== 'strict' && ['you', 'u'].includes(next) && ['gi', 'gee', 'ghee', 'ji', 'g'].includes(tokens[i + 2]?.key || '')) return done(i, i + 2);
    }
    if (mode === 'sensitive' && i === 0 && isName(word, mode) && tokens.length > 1) return done(i, i);
  }
  return null;
}
export function canonicalWakeText(text) {
  let rest = String(text), out = '';
  for (let i = 0; i < 100; i++) {
    const match = findWakePhrase(rest);
    if (!match) break;
    out += rest.slice(0, match.index) + 'hey yogi'; rest = rest.slice(match.end);
  }
  return out + rest;
}
