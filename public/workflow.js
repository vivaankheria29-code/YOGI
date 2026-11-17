// Display activity metadata, never private reasoning text or guessed emotions.
export const WORK_PHASES = new Set(['thinking','reading','searching','reasoning','writing','creating','working','usingtool','awaiting']);
export function phaseFromStatus(event) {
  if(WORK_PHASES.has(event.phase))return event.phase;
  const text=String(event.text||'');
  if(/reading|uploading/i.test(text))return 'reading';
  if(/searching|looking for pictures/i.test(text))return 'searching';
  if(/drawing|generating.*image/i.test(text))return 'creating';
  if(/waiting for.*(answer|approval)/i.test(text))return 'awaiting';
  if(/^using /i.test(text))return 'usingtool';
  if(/workspace|running|building/i.test(text))return 'working';
  return 'reasoning';
}
