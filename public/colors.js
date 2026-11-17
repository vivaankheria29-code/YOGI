const fields={accent:'Accent',background:'Background',panel:'Panels',text:'Text',face:'Face dots'};
const defaults={dark:{accent:'#D71921',background:'#000000',panel:'#0E0E0E',text:'#FFFFFF',face:'#FFFFFF'},light:{accent:'#C8131C',background:'#F2F2F2',panel:'#FFFFFF',text:'#000000',face:'#000000'}};
const presets={Original:'#D71921',Ice:'#57B7FF',Mint:'#4EE2AA',Amber:'#FFBF47',Violet:'#B58AFF'};
const valid=value=>typeof value==='string'&&/^#[\da-f]{6}$/i.test(value);
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const mix=(a,b,t)=>'#'+rgb(a).map((v,i)=>Math.round(v*(1-t)+rgb(b)[i]*t).toString(16).padStart(2,'0')).join('');
const luminance=hex=>rgb(hex).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
export const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
const foreground=color=>contrast(color,'#FFFFFF')>=contrast(color,'#000000')?'#FFFFFF':'#000000';
const tokens=['ground','surface','surface-2','surface-3','line','ink','ink-2','ink-3','core-red','core-red-hover','core-red-ink','core-red-soft','core-red-line','on-accent','red','on-red','live','focus','dot-off','dot-on','dot-red','dot-grid','user-bubble'];
let refresh=()=>{};
export function applyColorScheme(prefs){
  const mode=prefs.theme==='light'?'light':'dark',saved=prefs.colorSchemes?.[mode];
  const colors={...defaults[mode]};
  for(const key of Object.keys(fields))if(valid(saved?.[key]))colors[key]=saved[key].toUpperCase();
  const root=document.documentElement;
  for(const name of tokens)root.style.removeProperty('--'+name);
  if(saved&&typeof saved==='object'){
    const {accent:a,background:b,panel:p,text:t,face:f}=colors;
    let accentInk=a;
    for(let i=1;i<=12&&Math.min(contrast(accentInk,b),contrast(accentInk,p))<4.5;i++)accentInk=mix(a,t,i/12);
    const values={ground:b,surface:p,'surface-2':mix(p,t,.055),'surface-3':mix(p,t,.10),line:mix(p,t,.23),ink:t,'ink-2':mix(b,t,.85),'ink-3':mix(b,t,.72),'core-red':a,'core-red-hover':mix(a,foreground(a),.15),'core-red-ink':accentInk,'core-red-soft':mix(p,a,.13),'core-red-line':mix(p,a,.55),'on-accent':foreground(a),red:a,'on-red':foreground(a),live:a,focus:accentInk,'dot-off':mix(b,f,.12),'dot-on':f,'dot-red':a,'dot-grid':mix(b,f,.10),'user-bubble':mix(p,t,.06)};
    for(const [name,value] of Object.entries(values))root.style.setProperty('--'+name,value);
  }
  document.querySelector('meta[name=theme-color]').content=colors.background;
  refresh(colors,mode);
}
export function initColorEditor(prefs,save){
  const grid=document.querySelector('#colorFields'),buttons=document.querySelector('#colorPresets');
  const inputs={};
  const update=(key,value)=>{
    if(!valid(value))return;
    const mode=prefs.theme==='light'?'light':'dark';
    prefs.colorSchemes={...prefs.colorSchemes,[mode]:{...defaults[mode],...prefs.colorSchemes?.[mode],[key]:value.toUpperCase()}};
    save();
  };
  for(const [key,label] of Object.entries(fields)){
    const row=document.createElement('div');row.className='color-field';
    const name=document.createElement('label');name.htmlFor='color-'+key;name.textContent=label;
    const picker=document.createElement('input');picker.type='color';picker.id='color-'+key;picker.setAttribute('aria-label',label+' color');
    const hex=document.createElement('input');hex.type='text';hex.id='hex-'+key;hex.maxLength=7;hex.spellcheck=false;hex.autocomplete='off';hex.setAttribute('aria-label',label+' hex color');hex.setAttribute('aria-describedby','color-input-hint');
    picker.addEventListener('input',()=>update(key,picker.value));
    hex.addEventListener('input',()=>{hex.setAttribute('aria-invalid',String(!valid(hex.value)));update(key,hex.value);});
    hex.addEventListener('blur',()=>{if(valid(hex.value))hex.value=hex.value.toUpperCase();});
    row.append(name,picker,hex);grid.append(row);inputs[key]={picker,hex};
  }
  for(const [name,accent] of Object.entries(presets)){
    const button=document.createElement('button');button.type='button';button.textContent=name;button.style.setProperty('--swatch',accent);button.dataset.palette=name;button.setAttribute('aria-pressed','false');
    button.onclick=()=>{const mode=prefs.theme==='light'?'light':'dark';prefs.colorSchemes={...prefs.colorSchemes,[mode]:{...defaults[mode],accent:name==='Original'?defaults[mode].accent:accent}};save();};buttons.append(button);
  }
  document.querySelector('#resetColors').onclick=()=>{const mode=prefs.theme==='light'?'light':'dark';prefs.colorSchemes={...prefs.colorSchemes};delete prefs.colorSchemes[mode];save();};
  refresh=(colors,mode)=>{
    for(const [key,{picker,hex}] of Object.entries(inputs)){picker.value=colors[key];if(document.activeElement!==hex||hex.value.toUpperCase()!==colors[key]){hex.value=colors[key];hex.removeAttribute('aria-invalid');}}
    const ratio=Math.min(contrast(colors.text,colors.background),contrast(colors.text,colors.panel));
    document.querySelector('#colorContrast').textContent=`Text contrast: ${ratio.toFixed(1)}:1 — ${ratio>=4.5?'readable body text':'low contrast; adjust Text, Background or Panels'}.`;
    document.querySelector('#colorMode').textContent=`Editing ${mode} mode · changes save automatically`;
    for(const button of buttons.children){const expected={...defaults[mode],accent:button.dataset.palette==='Original'?defaults[mode].accent:presets[button.dataset.palette]};button.setAttribute('aria-pressed',String(Object.keys(fields).every(key=>colors[key]===expected[key])));}
  };
}
