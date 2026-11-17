import {readFileSync,existsSync} from 'node:fs';
import {parseEnv} from 'node:util';
import path from 'node:path';
export function readVoiceConfig(root) {
  const file=path.join(root,'.env'), local=existsSync(file)?parseEnv(readFileSync(file,'utf8')):{};
  return {apiKey:(local.ELEVENLABS_API_KEY||process.env.ELEVENLABS_API_KEY||'').trim(),voiceId:(local.ELEVENLABS_VOICE_ID||process.env.ELEVENLABS_VOICE_ID||'onwK4e9ZLuTAKqWW03F9').trim(),modelId:(local.ELEVENLABS_MODEL_ID||process.env.ELEVENLABS_MODEL_ID||'eleven_turbo_v2_5').trim()};
}
export function voiceStatus(config){return {provider:'ElevenLabs',configured:!!config.apiKey,voiceId:config.voiceId,modelId:config.modelId};}
export class VoiceError extends Error{constructor(status,message){super(message);this.status=status;}}
export async function* streamSpeech(text,config,signal,fetcher=fetch){
  if(typeof text!=='string'||!text.trim()||text.length>5000)throw new VoiceError(400,'Speech text must contain 1–5,000 characters.');
  if(!config.apiKey)throw new VoiceError(503,'Save an ElevenLabs API key in Settings to enable this voice.');
  const combined=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(45000)]);
  let reader;
  try {
    const response=await fetcher('https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(config.voiceId)+'/stream?output_format=mp3_44100_128',{method:'POST',headers:{'xi-api-key':config.apiKey,'Content-Type':'application/json','Accept':'audio/mpeg'},body:JSON.stringify({text:text.trim(),model_id:config.modelId,voice_settings:{stability:.5,similarity_boost:.75,use_speaker_boost:true}}),signal:combined});
    if(!response.ok)throw new VoiceError(response.status===429?429:502,response.status===401||response.status===403?'ElevenLabs rejected the key or its permissions. Check Settings.':response.status===429?'ElevenLabs usage limit reached. Check your plan.':'ElevenLabs could not generate audio (HTTP '+response.status+').');
    if(!response.body)throw new VoiceError(502,'ElevenLabs returned empty audio.');
    reader=response.body.getReader();let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>15*1024**2)throw new VoiceError(502,'Speech audio exceeded the size limit.');yield Buffer.from(value);}
    if(!size)throw new VoiceError(502,'ElevenLabs returned empty audio.');
  }catch(error){if(error instanceof VoiceError)throw error;if(signal?.aborted)throw new VoiceError(499,'Speech request canceled.');throw new VoiceError(502,combined.aborted?'Speech generation timed out. Try again.':'Could not connect to ElevenLabs. Check your connection.');}
  finally{if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}}
}
// Compatibility for callers which explicitly need a complete downloadable buffer.
export async function synthesize(text,config,signal,fetcher=fetch){const chunks=[];for await(const chunk of streamSpeech(text,config,signal,fetcher))chunks.push(chunk);return Buffer.concat(chunks);}
