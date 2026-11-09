import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serviceConfig,speechInput,synthesize,streamedWav} from '../server/services.js';
import {curriculum,kanaTable} from '../public/curriculum.js';

const request=new Request('http://127.0.0.1:8787/api/tts');
const env={DASHSCOPE_API_KEY:'test-only-key'};
const sample=()=>{const b=new Uint8Array(128);b.set(new TextEncoder().encode('RIFF'),0);b.set(new TextEncoder().encode('WAVE'),8);return b;};
const event=data=>'data: '+JSON.stringify(data)+'\n\n';
const provider=()=>new Response(event({output:{audio:{data:btoa('a'.repeat(128))}}})+event({output:{finish_reason:'stop',audio:{data:'',url:'https://unused.example'}}}),{headers:{'Content-Type':'text/event-stream'}});

test('config uses only the new key and never exposes credentials',()=>{
 const c=serviceConfig(request,{...env,APP_ENV:'development'});
 assert.equal(c.ttsReady,true);assert.equal(c.ttsVoice,'loongtomoka_v3');assert.ok(!JSON.stringify(c).includes(env.DASHSCOPE_API_KEY));
 assert.equal(serviceConfig(request,{AZURE_SPEECH_KEY:'old',AZURE_SPEECH_REGION:'old'}).ttsReady,false);
});
test('all curriculum audio fits the provider limit and explicitly selects Japanese',()=>{
 const texts=[...curriculum.flatMap(d=>[...d.words.map(w=>w.jp),d.sentence,d.reading?.text].filter(Boolean)),...kanaTable.flatMap(k=>[k.jp,k.kata])];
 for(const text of texts){const q=speechInput({text});assert.ok(q,text);assert.equal(q.input.language_hints[0],'ja');assert.ok([...q.text].length<=601);}
 assert.equal(speechInput({text:'日本'}).text,'にほん。');
 assert.equal(speechInput({text:'学生'}).text,'がくせい。');
 assert.equal(speechInput({text:'arbitrary text'}),null);assert.equal(speechInput(null),null);
});
test('missing key and unapproved text fail before making a paid request',async()=>{
 const noFetch=()=>{throw Error('unexpected request');};
 assert.equal((await synthesize(request,{}, {text:'日本'},noFetch)).status,503);
 assert.equal((await synthesize(request,env,{text:'arbitrary text'},noFetch)).status,400);
});
test('synthesis sends Japanese to Beijing, receives PCM directly, shares cached audio across speeds',async()=>{
 const calls=[],entries=new Map();
 const cache={match:async k=>entries.get(k.url)?.clone(),put:async(k,v)=>entries.set(k.url,v)};
 const fetcher=async(url,options)=>{calls.push({url,options});return provider();};
 let r=await synthesize(request,env,{text:'日本',rate:'normal'},fetcher,cache);
 assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'audio/wav');assert.equal((await r.arrayBuffer()).byteLength,172);
 assert.equal(calls[0].url,'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer');
 assert.deepEqual(JSON.parse(calls[0].options.body),{model:'cosyvoice-v3-flash',input:{text:'にほん。',voice:'loongtomoka_v3',format:'pcm',sample_rate:24000,language_hints:['ja'],rate:.95,seed:42}});
 assert.equal(calls[0].options.headers.Authorization,'Bearer test-only-key');
 assert.equal(calls[0].options.headers['X-DashScope-SSE'],'enable');
 r=await synthesize(request,env,{text:'日本',rate:'slow'},fetcher,cache);assert.equal(r.status,200);assert.equal(calls.length,1);
});
test('provider errors and incomplete streams fail closed without fetching result URLs',async()=>{
 for(const response of [new Response('',{status:401}),Response.json({output:{audio:{url:'https://unused.example'}}}),new Response(event({output:{audio:{data:btoa('ab')}}})),new Response(event({code:'AccessDenied'}))]){
  const body=await response.text();let calls=0;const result=await synthesize(request,env,{text:'日本'},async()=>{calls++;return new Response(body,{status:response.status});});assert.equal(result.status,502);assert.ok(calls>=1&&calls<=2);
 }
});
test('stream parser handles split events and writes the expected WAV format',async()=>{
 const text=event({output:{audio:{data:btoa('abcd')}}})+event({output:{audio:{data:btoa('efgh')},finish_reason:'stop'}});
 const bytes=new TextEncoder().encode(text);const response=new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=7)controller.enqueue(bytes.slice(i,i+7));controller.close();}}));
 const wav=await streamedWav(response),header=new DataView(wav.buffer);assert.equal(wav.length,52);assert.equal(header.getUint32(24,true),24000);assert.equal(header.getUint16(34,true),16);assert.equal(new TextDecoder().decode(wav.slice(44)),'abcdefgh');
});

test('a WAV container from the provider cannot be wrapped as raw PCM again',async()=>{
 const wav=sample();
 const response=new Response(event({output:{audio:{data:Buffer.from(wav).toString('base64')},finish_reason:'stop'}}));
 await assert.rejects(streamedWav(response),/Expected raw PCM/);
});

test('Chinese/default voices cannot replace the dedicated Japanese voice',()=>{
 for(const text of ['あ','ア','を','学生','日本']){
  const q=speechInput({text});assert.equal(q.input.voice,'loongtomoka_v3');assert.equal(q.input.format,'pcm');assert.deepEqual(q.input.language_hints,['ja']);assert.ok(q.text.endsWith('。'));
 }
});
test('optional cache failures do not break audio',async()=>{
 const r=await synthesize(request,env,{text:'日本'},async()=>provider(),{match(){throw Error('cache');},put(){throw Error('cache');}});assert.equal(r.status,200);
});
test('player reuses cloud audio for slow playback with pitch preservation',async()=>{
 const oldFetch=globalThis.fetch,oldAudio=globalThis.Audio,oldWindow=globalThis.window;let calls=0;const players=[];
 try{
  globalThis.window={};globalThis.Audio=class {constructor(url){this.url=url;players.push(this);}async play(){}pause(){}};
  globalThis.fetch=async()=>{calls++;return new Response(sample(),{headers:{'Content-Type':'audio/wav'}});};
  const {playJapanese,stopSpeech}=await import('../public/speech.js');
  assert.equal(await playJapanese('日本'),true);assert.equal(await playJapanese('日本','slow'),true);
  assert.equal(calls,1);assert.equal(players[0].url,players[1].url);assert.equal(players[1].playbackRate,.75);assert.equal(players[1].preservesPitch,true);stopSpeech();
 }finally{globalThis.fetch=oldFetch;globalThis.Audio=oldAudio;globalThis.window=oldWindow;}
});
