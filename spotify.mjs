import {randomBytes,createHash} from 'node:crypto';
const scopes='playlist-read-private playlist-read-collaborative user-read-playback-state user-modify-playback-state';
const error=(status,message)=>Object.assign(new Error(message),{status});
export function playlistId(value){
 const text=String(value||'').trim();if(/^spotify:playlist:[A-Za-z0-9]{22}$/.test(text))return text.split(':')[2];
 try{const u=new URL(text);if(u.protocol!=='https:'||u.hostname!=='open.spotify.com'||u.username||u.password)return null;return /^\/(?:intl-[a-z]+\/)?(?:embed\/)?playlist\/([A-Za-z0-9]{22})\/?$/.exec(u.pathname)?.[1]||null;}catch{return null;}
}
export function createSpotify({port,fetcher=fetch,now=Date.now}){
 let session=null,pending=null,refreshing=null,generation=0;
 const redirectUri=`http://127.0.0.1:${port}/spotify/callback`;
 async function token(params){
  const response=await fetcher('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params),signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token)throw error(401,'Spotify could not authorize this session. Reconnect your account and check the Client ID and redirect URI.');
  return data;
 }
 const remember=(data,clientId,previous)=>({clientId,access:data.access_token,refresh:data.refresh_token||previous,expires:now()+Math.max(1,Number(data.expires_in)||3600)*1000});
 async function access(){
  if(!session)throw error(401,'Connect Spotify first.');
  if(session.expires>now()+30000)return session.access;
  if(!refreshing){const current=session,version=generation;refreshing=token({grant_type:'refresh_token',refresh_token:current.refresh,client_id:current.clientId}).then(data=>{if(version!==generation)throw error(401,'Spotify was disconnected.');session=remember(data,current.clientId,current.refresh);return session.access;}).catch(e=>{if(version===generation)session=null;throw e;}).finally(()=>{refreshing=null;});}
  return refreshing;
 }
 async function api(path,options={}){
  const auth=await access();const response=await fetcher('https://api.spotify.com/v1'+path,{...options,headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000)});
  if(response.status===204)return {};
  const data=await response.json().catch(()=>({}));
  if(!response.ok){if(response.status===401)session=null;throw error(response.status===429?429:response.status===401?401:response.status===404?404:502,response.status===403?'Spotify denied access. Device playback requires Premium; check your app permissions and allowed users.':response.status===404?'No active Spotify device. Open Spotify, play a song there, then refresh devices.':response.status===429?'Spotify is rate limiting requests. Wait a moment before trying again.':'Spotify could not finish this request. Reconnect if your session has expired.');}
  return data;
 }
 return {
  status(){return {connected:!!session,redirectUri,sessionOnly:true};},
  connect(clientId){if(!/^[a-f0-9]{32}$/i.test(String(clientId)))throw error(400,'Enter the 32-character Client ID from your Spotify developer app.');generation++;const verifier=randomBytes(48).toString('base64url');pending={state:randomBytes(32).toString('base64url'),verifier,clientId,expires:now()+600000};const u=new URL('https://accounts.spotify.com/authorize');u.search=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:redirectUri,state:pending.state,scope:scopes,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')}).toString();return {url:u.href};},
  async callback(url){const attempt=pending;if(!attempt||attempt.expires<now()||url.searchParams.get('state')!==attempt.state)throw error(400,'This Spotify sign-in link expired or is invalid. Return to YOGI and connect again.');pending=null;if(url.searchParams.has('error'))throw error(400,'Spotify sign-in was cancelled. Nothing was linked.');const code=url.searchParams.get('code');if(!code||code.length>2048)throw error(400,'Spotify did not return an authorization code.');const version=generation,data=await token({grant_type:'authorization_code',code,redirect_uri:redirectUri,client_id:attempt.clientId,code_verifier:attempt.verifier});if(version!==generation)throw error(400,'This sign-in was cancelled.');session=remember(data,attempt.clientId);return true;},
  disconnect(){generation++;session=null;pending=null;},
  async playlists(offset=0){const start=Number(offset);if(!Number.isInteger(start)||start<0||start>10000)throw error(400,'Invalid playlist offset.');const data=await api('/me/playlists?limit=20&offset='+start);return {items:(data.items||[]).filter(p=>p&&/^[a-zA-Z0-9]{22}$/.test(p.id)).map(p=>({id:p.id,name:p.name,owner:p.owner?.display_name||'',url:'https://open.spotify.com/playlist/'+p.id})),next:data.next?start+20:null};},
  async devices(){const data=await api('/me/player/devices');return {devices:(data.devices||[]).filter(d=>d.id&&!d.is_restricted).map(d=>({id:d.id,name:d.name,type:d.type,active:d.is_active}))};},
  async control({action,playlist,deviceId}){if(!['play','pause','next','previous'].includes(action))throw error(400,'Unknown playback action.');if(deviceId!==undefined&&(typeof deviceId!=='string'||deviceId.length>256))throw error(400,'Invalid Spotify device.');let body;if(action==='play'&&playlist){const id=playlistId(playlist);if(!id)throw error(400,'Use a Spotify playlist link.');body=JSON.stringify({context_uri:'spotify:playlist:'+id});}const endpoint={play:'play',pause:'pause',next:'next',previous:'previous'}[action];await api('/me/player/'+endpoint+(deviceId?'?device_id='+encodeURIComponent(deviceId):''),{method:['next','previous'].includes(action)?'POST':'PUT',...(body?{body}:{})});return {ok:true};}
 };
}
