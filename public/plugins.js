import {safeLink} from './results.js';
const $=s=>document.querySelector(s);
const element=(tag,text,className)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
export class PluginPanel {
  constructor(onUse){this.onUse=onUse;this.loaded=false;$('#refreshPlugins').onclick=()=>this.load(true);$('#pluginSearch').oninput=()=>this.renderApps();}
  // A plugin is shown as a row: a coloured initial, its full name (wrapping, never
  // squeezed into a button), what it does, its status, and a short "Use" action.
  renderApps(){
    const grid=$('#pluginGrid'),query=($('#pluginSearch')?.value||'').trim().toLowerCase();grid.replaceChildren();
    const list=(this.apps||[]).filter(a=>!query||a.name.toLowerCase().includes(query)||(a.description||'').toLowerCase().includes(query));
    if(!list.length){grid.append(element('p',query?'No plugin matches “'+query+'”.':'No apps are connected.','empty'));return;}
    for(const app of list){
      const row=element('article',null,'plugin-row'+(app.callable?'':' off'));
      let hue=0;for(const ch of app.name)hue=(hue*31+ch.charCodeAt(0))%360;
      const avatar=element('span',app.name.replace(/[^\p{L}\p{N}]/gu,'').slice(0,2)||'?','plugin-avatar');avatar.style.setProperty('--hue',hue);
      const info=element('div',null,'plugin-info');
      const title=element('h3',app.name);title.title=app.name;
      info.append(title,element('p',app.description||(app.callable?'Connected. Ask YOGI to use it, or press Use.':'Installed but not available right now. Reconnect it in Codex.')));
      const status=element('span',app.callable?'Ready':app.enabled?'Unavailable':'Off',app.callable?'plugin-ready':'plugin-unavailable');
      const button=element('button','Use');button.type='button';button.disabled=!app.callable;button.setAttribute('aria-label','Use '+app.name);button.onclick=()=>this.onUse(app.name);
      row.append(avatar,info,status,button);grid.append(row);
    }
  }
  async load(refresh=false){
    if(this.loading)return;
    if(this.loaded&&!refresh)return;
    this.loading=true;$('#pluginSummary').textContent='Checking your connections…';$('#refreshPlugins').disabled=true;
    try{
      const response=await fetch('/api/plugins'+(refresh?'?refresh=true':''));const data=await response.json();if(!response.ok)throw new Error(data.error);
      const ready=data.apps.filter(a=>a.callable).length;
      $('#pluginSummary').textContent=data.unsupported?data.message:`${ready} app${ready===1?'':'s'} ready · ${data.localPlugins.filter(p=>p.enabled).length} skill bundles installed`;
      $('#pluginCount').textContent=ready;$('#pluginGrid').replaceChildren();$('#localPluginList').replaceChildren();
      this.apps=[...data.apps].sort((a,b)=>Number(b.callable)-Number(a.callable)||a.name.localeCompare(b.name));
      this.renderApps();
      for(const plugin of data.localPlugins){const row=element('div',null,'local-plugin-row');row.append(element('span',plugin.name.replaceAll('-',' ')),element('small',plugin.enabled?'Installed':'Disabled'));$('#localPluginList').append(row);}
      this.loaded=true;
    }catch(error){$('#pluginSummary').textContent=error.message||'Could not load plugins. Try Refresh.';}
    finally{this.loading=false;$('#refreshPlugins').disabled=false;}
  }
}
export class ApprovalPanel {
  constructor(notify){this.notify=notify;this.pending=new Map();}
  clear(){this.pending.clear();$('#approvalPanel').replaceChildren();$('#approvalPanel').hidden=true;}
  add(request){this.pending.set(request.id,request);this.render();$('#approvalPanel').scrollIntoView({behavior:'smooth',block:'nearest'});}
  render(){
    const panel=$('#approvalPanel');panel.replaceChildren();panel.hidden=!this.pending.size;
    for(const request of this.pending.values()){
      const card=element('form',null,'approval-card');card.append(element('span','Your answer is needed','who'),element('h3',request.title));
      if(request.message)card.append(element('p',request.message));
      if(request.detail)card.append(element('pre',request.detail));
      if(request.url){const url=safeLink(request.url);if(url){const link=element('a','Open the connection page');link.href=url;link.target='_blank';link.rel='noopener noreferrer';card.append(link);}}
      const getters=[];let supported=true;
      if(request.kind==='questions'){
        for(const question of request.questions||[]){
          const label=element('label',question.question);let input;
          if(question.options?.length){input=element('select');input.append(new Option('Choose an answer…',''));for(const option of question.options)input.append(new Option(option.label+(option.description?' — '+option.description:''),option.label));}
          else{input=element('input');input.type=question.isSecret?'password':'text';input.autocomplete='off';}
          input.required=true;label.append(input);card.append(label);getters.push({key:question.id,value:()=>[input.value]});
        }
      }else if(request.kind==='form'){
        const properties=request.schema?.properties;
        if(!properties&&!request.url)supported=false;
        for(const [key,schema]of Object.entries(properties||{})){
          if(!['string','number','integer','boolean','array'].includes(schema.type)){supported=false;continue;}
          const label=element('label',schema.title||key);if(schema.description)label.append(element('small',schema.description));let input,getValue;
          const options=schema.enum||schema.oneOf?.map(x=>x.const)||schema.items?.enum||schema.items?.anyOf?.map(x=>x.const);
          if(options){input=element('select');input.multiple=schema.type==='array';if(!input.multiple)input.append(new Option('Choose…',''));for(let i=0;i<options.length;i++)input.append(new Option(schema.enumNames?.[i]||schema.oneOf?.[i]?.title||schema.items?.anyOf?.[i]?.title||options[i],options[i]));getValue=()=>input.multiple?[...input.selectedOptions].map(x=>x.value):input.value;}
          else if(schema.type==='boolean'){input=element('input');input.type='checkbox';getValue=()=>input.checked;}
          else{input=element('input');input.type=/secret|password|api.?key|token/i.test(key)?'password':['number','integer'].includes(schema.type)?'number':'text';input.autocomplete='off';if(schema.type==='integer')input.step='1';if(schema.minimum!=null)input.min=schema.minimum;if(schema.maximum!=null)input.max=schema.maximum;getValue=()=>['number','integer'].includes(schema.type)?Number(input.value):input.value;}
          if(request.schema.required?.includes(key)&&schema.type!=='boolean')input.required=true;
          label.append(input);card.append(label);getters.push({key,value:getValue});
        }
      }
      if(!supported)card.append(element('p','This app needs its own sign-in form. Decline here and finish that step in the engine app on this computer.'));
      const actions=element('div',null,'approval-actions');
      const submit=async decision=>{
        if(decision==='accept'&&!card.reportValidity())return;
        const values=Object.fromEntries(getters.map(g=>[g.key,g.value()]));
        const body={id:request.id,decision};
        if(request.kind==='questions')body.answers=decision==='accept'?values:Object.fromEntries((request.questions||[]).map(q=>[q.id,[q.options?.find(o=>/decline|cancel|^no\b/i.test(o.label))?.label||'Cancel']]));
        if(request.kind==='form'&&decision==='accept')body.content=values;
        actions.querySelectorAll('button').forEach(b=>b.disabled=true);
        try{const response=await fetch('/api/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error);this.pending.delete(request.id);this.render();}
        catch(error){this.notify(error.message);actions.querySelectorAll('button').forEach(b=>b.disabled=false);}
      };
      const accept=element('button',request.kind==='questions'?'Submit answers':'Allow once');accept.type='submit';accept.disabled=!supported;accept.className='approval-accept';
      const decline=element('button','Decline');decline.type='button';decline.onclick=()=>submit('decline');
      actions.append(accept,decline);card.append(actions);card.onsubmit=event=>{event.preventDefault();submit('accept');};panel.append(card);
    }
  }
}
