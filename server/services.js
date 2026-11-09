import { curriculum, kanaTable } from '../public/curriculum.js';
const TEST_SITE='1x00000000000000000000AA';
const TEST_SECRET='1x0000000000000000000000000000000AA';
export function localDev(request,env){return env.APP_ENV==='development'&&['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname)}
export function serviceConfig(request,env){const dev=localDev(request,env);return {turnstileSiteKey:env.TURNSTILE_SITE_KEY||(dev?TEST_SITE:null),turnstileTesting:dev&&!env.TURNSTILE_SITE_KEY,ttsReady:!!env.DASHSCOPE_API_KEY?.trim(),ttsVoice:'loongtomoka_v3',ttsProvider:'阿里云百炼 CosyVoice · 日语女声',ttsVersion:'cosy-ja-v1',development:dev};}
export async function verifyChallenge(request,env,value,fetcher=fetch){
 const dev=localDev(request,env),secret=env.TURNSTILE_SECRET_KEY||(dev?TEST_SECRET:null);
 if(!secret||(!dev&&/^[123]x0+AA$/.test(secret)))return {ok:false,status:503,error:'注册验证尚未配置，请联系管理员。'};
 if(typeof value!=='string'||!value||value.length>2048)return {ok:false,status:400,error:'请先完成安全验证。'};
 const body=new FormData();body.set('secret',secret);body.set('response',value);const ip=request.headers.get('CF-Connecting-IP');if(ip)body.set('remoteip',ip);
 try{const r=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body,signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('verification unavailable');const result=await r.json();
 const testing=dev&&secret===TEST_SECRET;
 if(!result.success||(!testing&&(result.hostname!==new URL(request.url).hostname||result.action!=='register')))return {ok:false,status:400,error:'安全验证未通过或已过期，请重新验证。'};
 return {ok:true};
 }catch{return {ok:false,status:503,error:'安全验证服务暂时不可用，请稍后重试。'}}
}
const audioEntries=new Map();
for(const d of curriculum){for(const w of d.words)audioEntries.set(w.jp,w.kana);audioEntries.set(d.sentence,d.sentence);if(d.reading)audioEntries.set(d.reading.text,d.reading.text);}
for(const k of kanaTable){audioEntries.set(k.jp,k.jp);audioEntries.set(k.kata,k.kata);}
// Provider protocol: docs/SPEECH.md. Language is explicit even for kanji-only words.
const MODEL='cosyvoice-v3-flash';
const VOICE='loongtomoka_v3';
const ENDPOINT='https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer';
export function speechInput(data){
 if(!data||typeof data.text!=='string'||!audioEntries.has(data.text))return null;
 const reading=audioEntries.get(data.text);
 if([...reading].length>600)return null;
 // A sentence boundary stabilizes isolated kana/word synthesis. Kana are read
 // as syllables here; particles in complete sentences keep their context.
 const text=/[。！？!?]$/.test(reading)?reading:reading+'。';
 return {text,model:MODEL,input:{text,voice:VOICE,format:'pcm',sample_rate:24000,language_hints:['ja'],rate:.95,seed:42}};
}
export async function streamedWav(response){
 const reader=response.body?.getReader();if(!reader)throw Error('No audio stream');
 const decoder=new TextDecoder();let pending='',bytes=0,finished=false;const chunks=[];
 function event(block){const value=block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');if(!value||value==='[DONE]')return;const data=JSON.parse(value);if(data.code)throw Error('Provider stream error');const encoded=data.output?.audio?.data;if(encoded){const binary=atob(encoded);bytes+=binary.length;if(bytes>12000000)throw Error('Audio too large');chunks.push(Uint8Array.from(binary,c=>c.charCodeAt(0)));}if(data.output?.finish_reason==='stop')finished=true;}
 try{while(true){const {value,done}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});if(pending.length>16000000)throw Error('Event too large');let match;while((match=/\r?\n\r?\n/.exec(pending))){event(pending.slice(0,match.index));pending=pending.slice(match.index+match[0].length);}}pending+=decoder.decode();if(pending.trim())event(pending);}catch(e){reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
 if(!finished||bytes<2||bytes%2)throw Error('Incomplete PCM stream');
 // This endpoint is explicitly requested as PCM. Never treat a WAV container
 // (the old Qwen stream included one) as samples and add a second header.
 if(chunks[0]?.length>=12&&new TextDecoder().decode(chunks[0].slice(0,4))==='RIFF')throw Error('Expected raw PCM, received WAV');
 const wav=new Uint8Array(44+bytes),view=new DataView(wav.buffer);const label=(offset,s)=>wav.set(new TextEncoder().encode(s),offset);
 label(0,'RIFF');view.setUint32(4,36+bytes,true);label(8,'WAVE');label(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,24000,true);view.setUint32(28,48000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);label(36,'data');view.setUint32(40,bytes,true);let offset=44;for(const c of chunks){wav.set(c,offset);offset+=c.length;}return wav;
}
export async function synthesize(request,env,data,fetcher=fetch,cache=globalThis.caches?.default){
 const input=speechInput(data);
 if(!input)return Response.json({error:'只允许朗读课程中已有、长度合规的日语内容。'},{status:400});
 if(!env.DASHSCOPE_API_KEY?.trim())return Response.json({error:'日语语音尚未配置。请填写阿里云百炼 API Key 后启用。',code:'TTS_NOT_CONFIGURED'},{status:503});
 const payload=JSON.stringify({model:input.model,input:input.input});
 // Normal and slow playback share audio; the browser preserves pitch when slowing it.
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('cosy-ja-pcm-v1:'+payload)));
 const key=new Request(new URL('/__speech/'+Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join(''),request.url));
 try{const cached=await cache?.match(key);if(cached)return cached;}catch{/* Cache is optional. */}
 let stage='generation';
 for(let synthesisAttempt=0;synthesisAttempt<2;synthesisAttempt++){
 try{
  let r;
  for(let attempt=0;attempt<3;attempt++){
   r=await fetcher(ENDPOINT,{method:'POST',headers:{Authorization:'Bearer '+env.DASHSCOPE_API_KEY.trim(),'Content-Type':'application/json','X-DashScope-SSE':'enable'},body:payload,signal:AbortSignal.timeout(60000)});
   if(r.status!==429||attempt===2)break;
   await r.body?.cancel();await new Promise(resolve=>setTimeout(resolve,1500*(attempt+1)));
  }
  if(!r.ok){
   const failure=await r.json().catch(()=>({}));
   const error=failure.code==='AccessDenied.Unpurchased'?'百炼尚未开通 CosyVoice。请在北京地域开通模型，并检查 API Key 的业务空间权限。':r.status===401?'百炼 API Key 无效，请检查北京地域的密钥。':r.status===429?'语音服务额度不足或请求过多，请稍后重试。':'日语语音生成失败，请检查百炼 API Key、北京地域及模型权限。';
   return Response.json({error},{status:502});
  }
  stage='audio-stream';
  const body=await streamedWav(r);
  const response=new Response(body,{headers:{'Content-Type':'audio/wav','Cache-Control':'public, max-age=2592000','X-Speech-Version':'cosy-ja-v1','X-Content-Type-Options':'nosniff'}});
  try{await cache?.put(key,response.clone());}catch{/* Playback must not depend on cache availability. */}
  return response;
 }catch(e){if(synthesisAttempt===0){await new Promise(resolve=>setTimeout(resolve,500));continue;}console.error('TTS request failed',{stage,type:e?.name||'Error'});return Response.json({error:'语音服务连接失败，请稍后重试。'},{status:502});}
 }
}
