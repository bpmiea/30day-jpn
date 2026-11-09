// Server-selected Japanese neural voice. Never silently falls back to a Chinese/default voice.
import {curriculum} from './curriculum.js';
const readings=new Map(curriculum.flatMap(d=>d.words.map(w=>[w.jp,w.kana])));
let currentAudio=null,controller=null,requestNumber=0;
const clips=new Map();
export function stopSpeech(){requestNumber++;controller?.abort();currentAudio?.pause();if(currentAudio)currentAudio.currentTime=0;window.speechSynthesis?.cancel();}
export async function playJapanese(text,rate='normal',fallback=false){
 stopSpeech();const number=requestNumber;
 if(fallback)return playDevice(text,rate);
 const key=text;
 let url=clips.get(key);
 if(!url){controller=new AbortController();const response=await fetch('/api/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,rate}),signal:controller.signal});
  if(!response.ok){const error=await response.json();throw Error(error.error||'日语语音暂不可用。');}
  const blob=await response.blob();if(!blob.type.includes('audio'))throw Error('服务未返回有效的日语音频。');
  if(number!==requestNumber)return false;
  url=URL.createObjectURL(blob);clips.set(key,url);if(clips.size>80){const first=clips.keys().next().value;URL.revokeObjectURL(clips.get(first));clips.delete(first);}
 }
 if(number!==requestNumber)return false;
 currentAudio=new Audio(url);currentAudio.preservesPitch=true;currentAudio.playbackRate=rate==='slow'?.75:1;await currentAudio.play();return true;
}
async function playDevice(text,rate){
 if(!window.speechSynthesis)throw Error('此浏览器没有设备语音功能。');
 let voices=speechSynthesis.getVoices();if(!voices.length){await new Promise(resolve=>{const timer=setTimeout(resolve,1500);speechSynthesis.addEventListener('voiceschanged',()=>{clearTimeout(timer);resolve()},{once:true})});voices=speechSynthesis.getVoices();}
 const voice=voices.find(v=>/^ja[-_]JP$/i.test(v.lang));
 if(!voice)throw Error('设备没有日语语音包。已停止播放，不会改用中文语音。');
 const utterance=new SpeechSynthesisUtterance(readings.get(text)||text);utterance.voice=voice;utterance.lang='ja-JP';utterance.rate=rate==='slow'?.65:.9;
 return new Promise((resolve,reject)=>{utterance.onstart=()=>resolve(true);utterance.onerror=()=>reject(Error('设备日语语音播放失败。'));speechSynthesis.speak(utterance)});
}
