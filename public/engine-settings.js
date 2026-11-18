const $=selector=>document.querySelector(selector);
export function initEngineSettings({onChange=()=>{},isBusy=()=>false}={}){
  let saved=null,providers=[],loading=false,dirty=false,saving=false,modelRequest=0;
  const drafts=new Map();let current='codex';
  function note(text,error=false){$('#engineFeedback').textContent=text;$('#engineFeedback').dataset.error=String(error);}
  function actualModel(){return $('#engineModel').value==='__custom__'?$('#engineCustomModel').value.trim():$('#engineModel').value;}
  function selectionState(){const node=$('#engineSelectionState');if(!node)return;const draft=value(),p=providers.find(p=>p.id===draft.id),name=p?.name||draft.id;const different=!saved||draft.id!==saved.id||draft.model!==saved.model||draft.executable!==saved.executable;node.dataset.dirty=String(different);node.textContent=different?`Not applied as app default: ${name} · ${draft.model||'CLI default'}. Use it for this chat or save it as the app default.`:`Saved app default: ${name} · ${draft.model||'CLI default'}. The chat’s Model selector can override this.`;}
  function value(){return {id:$('#engineProvider').value,model:actualModel(),executable:$('#engineExecutable').value.trim()};}
  function option(id,label){const o=document.createElement('option');o.value=id;o.textContent=label;return o;}
  function customVisibility(){const custom=$('#engineModel').value==='__custom__';$('#customModelField').hidden=!custom;$('#engineCustomModel').disabled=!custom;selectionState();}
  async function loadModels(model='',force=false){
    const request=++modelRequest,provider=$('#engineProvider').value,select=$('#engineModel'),executable=$('#engineExecutable').value.trim();
    select.replaceChildren(option('','Use CLI default model'));
    if(model)select.append(option(model,model+' · selected model'));
    if(provider!=='amp')select.append(option('__custom__','Custom model…'));
    select.value=model;customVisibility();select.disabled=provider==='amp';
    $('#modelListHelp').textContent=provider==='amp'?'Configure Amp’s model in Amp itself.':'Loading model choices…';
    if(provider==='amp')return;
    try{
      const query=new URLSearchParams({provider,executable,...(force?{refresh:'1'}:{})});
      const response=await fetch('/api/models?'+query);const data=await response.json();
      if(request!==modelRequest||provider!==$('#engineProvider').value||executable!==$('#engineExecutable').value.trim())return;
      if(!response.ok||!Array.isArray(data.models))throw new Error(data.error||'Could not load model choices.');
      // Read the current selection after the await so a response never overwrites a choice made while loading.
      const selected=select.value,custom=$('#engineCustomModel').value;
      const entries=new Map(data.models.filter(m=>typeof m.id==='string'&&m.id&&m.id!=='__custom__').map(m=>[m.id,(m.label||m.id)+(m.source==='config'?' · configured':m.source==='saved'?' · saved':'')]));
      if(selected&&selected!=='__custom__'&&!entries.has(selected))entries.set(selected,selected+' · selected model');
      select.replaceChildren(option('','Use CLI default model'),...Array.from(entries,([id,label])=>option(id,label)),option('__custom__','Custom model…'));
      select.value=selected;$('#engineCustomModel').value=custom;customVisibility();$('#modelListHelp').textContent=data.hint||'Availability depends on your CLI and account.';
    }catch{if(request===modelRequest)$('#modelListHelp').textContent='Model list unavailable. Keep the CLI default or choose Custom model. Saved model IDs are preserved.';}
  }
  function describe(){const p=providers.find(p=>p.id===$('#engineProvider').value);if(!p)return;$('#engineDocs').href=p.docs;$('#engineDocs').textContent=`${p.name} installation & sign-in ↗`;
    selectionState();
    $('#engineCapabilities').textContent=p.id==='codex'?'Codex: native connected apps, image inputs, approval forms and workspace sandbox.':'Headless adapter: your CLI’s own tools and permissions apply. YOGI’s Codex app connections and approval forms are unavailable. Attachments are passed as local paths; image reading depends on the CLI. Requires YOGI Full access. Authentication is verified on your first message.';
  }
  function providerOptions(){const select=$('#engineProvider');select.replaceChildren();for(const [label,installed] of [['Detected on this computer',true],['Other supported CLIs',false]]){const group=document.createElement('optgroup');group.label=label;for(const p of providers.filter(p=>!!p.installed===installed))group.append(option(p.id,p.name+(p.installed?' · installed':' · not detected')));if(group.children.length)select.append(group);}}
  function render(data){providers=data.providers;saved=data.selected;providerOptions();current=saved.id;$('#engineProvider').value=saved.id;$('#engineCustomModel').value='';$('#engineExecutable').value=saved.executable;loadModels(saved.model);drafts.set(saved.id,saved);dirty=false;describe();note(data.status?.detail||(data.status?.connected?'CLI ready.':'Install and sign in to your CLI, then reconnect.'));}
  async function refresh(){if(loading||saving||dirty)return;loading=true;try{const response=await fetch('/api/settings/engine');const data=await response.json();if(!response.ok||!Array.isArray(data.providers))throw new Error(data.error||'Could not load CLI choices.');render(data);}catch(error){note(error.message,true);}finally{loading=false;}}
  $('#engineProvider').addEventListener('change',()=>{drafts.set(current,{id:current,model:actualModel(),executable:$('#engineExecutable').value});current=$('#engineProvider').value;const draft=drafts.get(current)||{model:'',executable:''};$('#engineCustomModel').value='';$('#engineExecutable').value=draft.executable;loadModels(draft.model);dirty=true;describe();note('Save to use this CLI for your next message.');});
  $('#engineModel').addEventListener('change',()=>{dirty=true;customVisibility();if($('#engineModel').value==='__custom__')$('#engineCustomModel').focus();note('Unsaved model selection.');});
  for(const id of ['engineCustomModel','engineExecutable'])$('#'+id).addEventListener('input',()=>{dirty=true;selectionState();note('Unsaved engine settings.');});
  $('#engineExecutable').addEventListener('change',()=>loadModels(actualModel(),true));
  $('#refreshEngineModels')?.addEventListener('click',async()=>{const button=$('#refreshEngineModels');button.disabled=true;try{const response=await fetch('/api/settings/engine');const data=await response.json();if(response.ok&&Array.isArray(data.providers)){const current=$('#engineProvider').value;providers=data.providers;providerOptions();$('#engineProvider').value=current;describe();}await loadModels(actualModel(),true);}catch{note('Could not refresh installed CLIs.',true);}finally{button.disabled=false;}});
  $('#engineForm').addEventListener('submit',async event=>{event.preventDefault();if(saving)return;if(isBusy()){note('Stop the current reply before changing CLI.',true);return;}if($('#engineModel').value==='__custom__'&&!actualModel()){note('Enter a custom model ID or choose the CLI default.',true);return;}saving=true;$('#saveEngine').disabled=true;$('#testEngine').disabled=true;note('Saving your engine…');try{const response=await fetch('/api/settings/engine',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value())});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not save this CLI.');render(data);note(`${providers.find(p=>p.id===saved.id)?.name} selected. ${data.status?.detail||'Applies to your next message.'}`);await onChange();}catch(error){note(error.message,true);}finally{saving=false;$('#saveEngine').disabled=false;$('#testEngine').disabled=false;}});
  $('#testEngine').addEventListener('click',async()=>{if(saving)return;if(dirty||!saved){note('Save these settings before testing the selected CLI.',true);return;}if(isBusy()){note('Finish the reply before testing the CLI.',true);return;}$('#testEngine').disabled=true;note('Checking the CLI installation…');try{const response=await fetch('/api/engine/test',{method:'POST'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Installation test failed.');note(`${data.name} starts successfully. This test does not verify sign-in, subscription or model access.`);}catch(error){note(error.message,true);}finally{$('#testEngine').disabled=false;}});
  refresh();return {refresh,value,load:p=>{if(!providers.length)return;$('#engineProvider').value=p.id;current=p.id;$('#engineCustomModel').value='';$('#engineExecutable').value=p.executable||'';loadModels(p.model||'');dirty=true;describe();note('Connection fields loaded. Save the chat connection below, or save as the app default.');}};
}
