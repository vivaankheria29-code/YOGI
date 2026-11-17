const $=selector=>document.querySelector(selector);
let offset=0,controller;
export async function refreshSkillLibrary(reset=true){
  controller?.abort();controller=new AbortController();const request=controller;
  if(reset)offset=0;
  $('#moreSkills').disabled=true;
  try{
    const params=new URLSearchParams({q:$('#skillQuery').value,category:$('#skillCategory').value,offset:String(offset)});
    const response=await fetch('/api/skills?'+params,{signal:request.signal});
    const data=await response.json();if(!response.ok||!Array.isArray(data.skills))throw new Error(data.error||'Could not load the skill catalog.');
    if(request!==controller)return;
    const state=data.status||{};
    $('#skillLibraryStatus').textContent=`${state.installed||0} / ${state.total||5750} skills installed · ${state.categories?.frontend||0} frontend · ${state.categories?.backend||0} backend/development · ${state.categories?.animation||0} animation · ${state.categories?.['video-animation']||0} video · ${state.categories?.['web-3d']||0} web 3D`;
    if(state.conflicts?.length)$('#skillLibraryStatus').textContent+=` · ${state.conflicts.length} existing or modified folders preserved`;
    if(reset)$('#skillResults').replaceChildren();
    for(const skill of data.skills){
      const card=document.createElement('article');card.className='skill-card';
      const title=document.createElement('h4');title.textContent=skill.name;
      const description=document.createElement('p');description.textContent=skill.description;
      const footer=document.createElement('div');footer.className='skill-card-footer';
      const category=document.createElement('span');category.textContent=(({'frontend':'Frontend','animation':'Animation','backend':'Backend/development','video-animation':'Video animation','web-3d':'3D websites'}[skill.category]||skill.category))+' · '+(skill.provenance==='yogi-authored'?'YOGI recipe · ':'')+skill.license;
      if(typeof skill.sourceUrl==='string'&&/^https:\/\/(github\.com|developer\.mozilla\.org|www\.remotion\.dev|threejs\.org|r3f\.docs\.pmnd\.rs)\//.test(skill.sourceUrl)){const link=document.createElement('a');link.href=skill.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent=skill.sourceLabel||'GitHub source';footer.append(category,link);}else footer.append(category);
      card.append(title,description,footer);$('#skillResults').append(card);
    }
    offset+=data.skills.length;
    $('#skillResultCount').textContent=data.total?`Showing ${offset} of ${data.total} matching skills.`:'No matching skills. Try a framework or task such as React, PostgreSQL, testing, or accessibility.';
    $('#moreSkills').hidden=offset>=data.total;
  }catch(error){if(error.name!=='AbortError')$('#skillResultCount').textContent=error.message;}
  finally{if(request===controller)$('#moreSkills').disabled=false;}
}
$('#skillSearch').addEventListener('submit',event=>{event.preventDefault();refreshSkillLibrary();});
$('#skillCategory').addEventListener('change',()=>refreshSkillLibrary());
$('#moreSkills').onclick=()=>refreshSkillLibrary(false);
