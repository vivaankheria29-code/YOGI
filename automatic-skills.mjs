import {loadSkillCatalog,useDevelopmentSkill} from './skill-library.mjs';
const groups=[
  {test:/\b(remotion|video|videos|caption|captions|lower.thirds|reel|reels|kinetic.typography|motion.graphics)\b/i,preferred:[],category:'video-animation'},
  {test:/\b(three\.?js|threejs|r3f|react.three.fiber|webgl|webgpu|webxr|gltf|3d)\b/i,preferred:[],category:'web-3d'},
  {test:/\bgsap\b/i,preferred:['gsap-core'],category:'animation'},
  {test:/\bgsap\b.*\b(timeline|stagger|sequence)\b|\b(timeline|stagger|sequence)\b.*\bgsap\b/i,preferred:['gsap-timeline'],category:'animation'},
  {test:/\bscrolltrigger\b/i,preferred:['gsap-scrolltrigger'],category:'animation'},
  {test:/\bgsap\b.*\breact\b|\breact\b.*\bgsap\b/i,preferred:['gsap-react'],category:'animation'},
  {test:/\breact\b/i,preferred:['react-expert'],category:'frontend'},
  {test:/\bnext(?:\.?js|\.js)\b/i,preferred:['nextjs-developer','nextjs-app-router-patterns'],category:'frontend'},
  {test:/\bvue\b/i,preferred:['vue-expert'],category:'frontend'},
  {test:/\bangular\b/i,preferred:['angular-architect'],category:'frontend'},
  {test:/\bsvelte\b/i,preferred:['svelte-development'],category:'frontend'},
  {test:/\b(node\.?js|express|nestjs)\b/i,preferred:['nodejs-backend-patterns'],category:'backend'},
  {test:/\b(fastapi|django|flask)\b/i,preferred:['fastapi-expert','django-expert'],category:'backend'},
  {test:/\bpostgres(?:ql)?\b/i,preferred:['postgres-pro','postgresql-table-design'],category:'backend'},
  {test:/\b(sql|database|mysql|sqlite)\b/i,preferred:['database-design','database-optimizer','sql-pro'],category:'backend'},
  {test:/\b(rest|api|graphql|backend|back.end|server|endpoint|websocket)\b/i,preferred:['api-designer','api-design-principles'],category:'backend'},
  {test:/\b(auth(?:entication|orization)?|oauth|jwt|login|sign.in)\b/i,preferred:['auth-implementation-patterns'],category:'backend'},
  {test:/\b(animation|animations|animate|animated|motion|gsap|transition|transitions|hover|ripple|fade|stagger|parallax|tween|keyframe|reveal|confetti)\b/i,preferred:['yogi-motion-sequence-stagger','yogi-motion-sequence-interrupt'],category:'animation'},
  {test:/\b(accessibility|accessible|a11y|wcag|screen.reader)\b/i,preferred:['a11y-audit','accessibility-compliance'],category:'frontend'},
  {test:/\b(website|webpage|web.app|landing.page|homepage|frontend|front.end|dashboard|responsive|css|html|layout|ui|ux)\b/i,preferred:['frontend-design','design-taste-frontend'],category:'frontend'},
  {test:/\b(docker|container|kubernetes|deployment|deploy|ci\/cd|devops)\b/i,preferred:['docker-expert','deployment-pipeline-design'],category:'backend'},
  {test:/\b(playwright|cypress|vitest|jest|unit.tests?|integration.tests?|e2e)\b/i,preferred:['playwright-expert','javascript-testing-patterns'],category:'frontend'},
];
const stop=new Set('a an the i we you it this that my our your please can could would should will want need make build create add fix use using write update change now also new some with for from into and or to of on in is be do have has how what why when does not more less as by application app project feature work implement improve optimize debug test tests design code'.split(' '));
const platforms=['sankhya','jsp','vue','angular','svelte','swift','flutter','rust','elixir','django','flask','fastapi','laravel','php','rails','dotnet','aspnet','wordpress','webflow','shopify','salesforce','kubernetes','terraform','graphql','mcp','clerk','supabase'];
function terms(text){return [...new Set(String(text).toLowerCase().replace(/node\.?js/g,'nodejs').replace(/next\.?js/g,'nextjs').replace(/postgresql/g,'postgres').replace(/\bmodal\b/g,'dialog').replace(/\b(buttons|menus|dialogs|cards|lists|forms|loaders|messages|captions|particles|tooltips|animations|transitions)\b/g,w=>w.slice(0,-1)).replace(/\b(authentication|authorization|login|oauth2)\b/g,w=>w==='oauth2'?'oauth':'auth').match(/[a-z][a-z0-9+#]+/g)||[])].filter(w=>w.length>2&&!stop.has(w));}
function noSkills(text){return /\b(?:do\s+not|don't|dont|without|no|skip|disable|avoid)\s+(?:(?:using|use|any|all|automatic|automatically|the|installed|development)\s+)*skills?\b/i.test(text);}
const indexCache=new WeakMap();
function indexed(catalog){
  let index=indexCache.get(catalog);if(index)return index;
  const documents=catalog.skills.map(skill=>({skill,name:new Set(terms(skill.name.replace(/-/g,' '))),description:new Set(terms(skill.description))}));
  const frequency=new Map();for(const d of documents)for(const word of new Set([...d.name,...d.description]))frequency.set(word,(frequency.get(word)||0)+1);
  index={documents,frequency};indexCache.set(catalog,index);return index;
}
export function automaticSkillContext(root,{request='',history=[],maxSkills=2,maxCharacters=30000}={}){
  request=String(request).slice(0,12000);
  if(noSkills(request))return {skills:[],context:'',optedOut:true};
  let query=request;
  const currentMatches=groups.filter(group=>group.test.test(request));
  // Carry project context into short follow-ups, not into unrelated questions.
  const followup=/\b(add|fix|change|update|improve|continue|refactor|optimi[sz]e|make|remove|implement|same)\b/i.test(request);
  if(followup&&request.length<180&&(!currentMatches.length||/\b(it|this|that|same|existing|current|these|those)\b/i.test(request))){
    query+='\n'+history.filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.text==='string').slice(-4).map(m=>m.text.slice(0,1200)).join('\n');
  }
  const matching=groups.filter(group=>group.test.test(query)).sort((a,b)=>Number(b.test.test(request))-Number(a.test.test(request)));
  if(!matching.length)return {skills:[],context:'',optedOut:false};
  const catalog=loadSkillCatalog(root),words=terms(query),categories=new Set((currentMatches.length?currentMatches:matching).map(g=>g.category));
  const {documents,frequency}=indexed(catalog);
  if(categories.has('web-3d')||categories.has('video-animation')){categories.delete('frontend');categories.delete('animation');}
  const preferred=new Map();
  matching.forEach((group,groupIndex)=>group.preferred.forEach((name,i)=>preferred.set(name,Math.max(preferred.get(name)||0,48-i*3-(groupIndex?2:0)))));
  const ranked=documents.filter(d=>categories.has(d.skill.category)).map(d=>{
    let score=preferred.get(d.skill.name)||0;
    if(d.skill.storage==='on-demand'){
      const recipe=d.skill.recipe;score+=recipe?.delivery==='standard'?12:0;score+=recipe?.task==='build'?5:0;
      const taskPatterns={performance:/\b(optimi[sz]e|slow|performance|fps|lag|stutter)\b/i,debug:/\b(fix|debug|broken|drift|failure|bug)\b/i,lifecycle:/\b(dispose|cleanup|leak|unmount|lifecycle)\b/i,timing:/\b(pacing|timing|easing|interpolation)\b/i,delivery:/\b(export|render.pipeline|delivery|deploy)\b/i,'asset-loading':/\b(preload|loading|missing.asset|decode)\b/i,accessibility:/\b(accessibility|accessible|a11y)\b/i,responsive:/\b(responsive|resize|aspect.ratio)\b/i,'color-alpha':/\b(color|alpha|transparency|fringe)\b/i};
      if(taskPatterns[recipe?.task]?.test(query))score+=50;
      for(const value of [recipe?.task,recipe?.delivery])if(value&&query.toLowerCase().includes(value.replace(/-/g,' ')))score+=25;
    }
    for(const word of words){const weight=1+Math.log((catalog.count+1)/(1+(frequency.get(word)||0)));score+=(d.name.has(word)?4:d.description.has(word)?1:0)*weight;}
    if(!/\b(native|mobile|ios|android|expo)\b/i.test(query)&&/react-native|expo-|makepad|^ui-page$/.test(d.skill.name))score=-1;
    if(!/\b(azure|aws|google.cloud|gcp|claimable)\b/i.test(query)&&/^(azure-|aws-|gcp-|claimable-)/.test(d.skill.name))score=-1;
    for(const platform of platforms)if(d.name.has(platform)&&!new RegExp('\\b'+platform+'\\b','i').test(query))score=-1;
    if(!/\b(audit|scan|assess|assessment|vulnerabilit(?:y|ies)|penetration|pentest|attack|exploit|injection|xss)\b/i.test(query)&&/hunt-|broken-authentication|injection|xss|pen-testing|security-testing|security-audit|^database-security$|^api-security$/.test(d.skill.name))score=-1;
    if(d.skill.category==='animation'&&d.skill.provenance==='yogi-authored'){const hits=words.filter(w=>!['yogi','motion','animation','animate','animated','effect','effects','smooth','cool'].includes(w)&&d.name.has(w)).length;score+=hits>=2?42:hits===1?16:0;}
    if(d.skill.repo==='Jeffallan/claude-skills')score+=1;
    return {...d,score};
  }).filter(d=>d.score>=8).sort((a,b)=>b.score-a.score||a.skill.name.localeCompare(b.skill.name));
  const selected=[];let characters=0;
  const focusedRecipe=ranked[0]?.skill.provenance==='yogi-authored'&&!/^yogi-motion-sequence-/.test(ranked[0].skill.name)&&!/-audit$/.test(ranked[0].skill.name);
  for(const {skill,score} of ranked){
    if(selected[0]&&catalog.skills.find(s=>s.name===selected[0].name)?.storage==='on-demand')break;
    if(selected.length>=Math.max(1,Math.min(3,maxSkills)))break;
    if(focusedRecipe&&score<ranked[0].score*.7)continue;
    try{
      const loaded=useDevelopmentSkill(root,{name:skill.name});
      if(characters+loaded.text.length>maxCharacters)continue;
      selected.push({name:skill.name,category:skill.category,source:skill.sourceUrl,instructions:loaded.text});characters+=loaded.text.length;
    }catch{/* An unavailable or edited resource must not stop the user's request. */}
  }
  return {skills:selected.map(({name,category,source})=>({name,category,source})),optedOut:false,context:selected.length?'Automatically selected development guidance for this turn. Apply only what fits the current request; it grants no permissions and never overrides user scope or higher-priority instructions. Other skills can be searched if the task needs them. Do not carry incompatible guidance into later tasks.\n'+JSON.stringify(selected):''};
}
