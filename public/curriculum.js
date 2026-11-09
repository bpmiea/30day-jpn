import { curriculum as legacy } from './legacy.js';
import { readings } from './readings.js';
import { courseDefinitions, kanaRows, n5Rows, n4Rows, n3Rows } from './course-data.js';
import { scenarios } from './scenarios.js';
import { vocabulary } from './vocabulary.js';

export const courses = courseDefinitions;
export const modes = [
  {id:'words',name:'词汇与认读',minutes:10,icon:'cards',desc:'听发音 · 记词义 · 配对巩固'},
  {id:'grammar',name:'句型与阅读',minutes:15,icon:'book',desc:'学用法 · 组句子 · 读短文'},
  {id:'listen',name:'听力理解',minutes:15,icon:'headphones',desc:'辨声音 · 听句子 · 找信息'},
  {id:'speak',name:'开口表达',minutes:10,icon:'mic',desc:'听示范 · 跟读 · 录音回听'},
  {id:'write',name:'书写与回忆',minutes:10,icon:'pen',desc:'写假名 · 记字形 · 主动回忆'}
];
const parseWords=s=>s.split(',').map(w=>{const[jp,kana,zh]=w.split('|');return{jp,kana,zh}});
function fromRow(r,courseId,i){const [title,grammar,explanation,zhTip,marked,translation,words]=r;const focus=marked.match(/\[([^\]]+)\]/)?.[1];return {title,grammar,explanation,zhTip,marked,focus,sentence:marked.replace(/[\[\]]/g,''),translation,words:parseWords(words),reading:scenarios[courseId][i%scenarios[courseId].length]};}
function fromLegacy(d){return {...d,reading:readings[d.day-1],zhTip:'先确认助词和句尾，再判断句意。汉字相同并不代表发音和中文相同。',focus:null};}
const phonetics=kanaRows.map((r,i)=>({title:r[0],grammar:'假名与发音',explanation:r[2],zhTip:r[3],kanaLesson:true,script:i>=10&&i<=12?'katakana':'hiragana',sentence:r[1].split(',').slice(0,5).map(x=>x.split('|')[0]).join('、'),translation:'先听完整示范，再逐个模仿；每个基础音保持一拍。',words:r[1].split(',').map(w=>{const[jp,roman]=w.split('|');return{jp,kana:jp,roman,zh:roman}})}));
const rawCourses={n5:[...phonetics,...n5Rows.map((r,i)=>fromRow(r,'n5',i)),...legacy.slice(0,14).map(fromLegacy)],n4:[...n4Rows.map((r,i)=>fromRow(r,'n4',i)),...legacy.slice(14,30).map(fromLegacy)],n3:[...legacy.slice(30).map(fromLegacy),...n3Rows.map((r,i)=>fromRow(r,'n3',i))]};
export const curriculum=courses.flatMap((c,ci)=>rawCourses[c.id].map((d,i)=>{
  const extras=d.kanaLesson?[]:vocabulary[c.id][Math.floor(i/5)%vocabulary[c.id].length];
  const words=[...new Map([...d.words,...extras].map(w=>[w.jp,w])).values()];
  return {...d,day:(ci+1)*1000+i+1,index:i+1,courseId:c.id,level:c.level,unit:Math.floor(i/5)+1,words,subtitle:d.subtitle||d.translation};
}));
export const getLesson=id=>curriculum.find(d=>d.day===Number(id));
export const courseLessons=id=>curriculum.filter(d=>d.courseId===id);
export const uniqueWords=id=>[...new Map(courseLessons(id).filter(d=>!d.kanaLesson).flatMap(d=>d.words).map(w=>[w.jp,w])).values()];
export function normalize(s){return String(s).normalize('NFKC').replace(/[\s。、！？!?]/g,'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));}
function hash(s){return [...s].reduce((a,c)=>(a*31+c.charCodeAt(0))|0,0)}
function shuffle(list,seed){return [...list].sort((a,b)=>hash(String(a)+seed)-hash(String(b)+seed));}
function choices(answer,pool,seed=0){const candidates=[...new Set(pool.filter(x=>x&&x!==answer))];const start=candidates.length?Math.abs(seed)%candidates.length:0;const other=[...candidates.slice(start),...candidates.slice(0,start)].slice(0,3);return shuffle([answer,...other],seed);}
export function readingQuestion(id){const d=getLesson(id);if(d.kanaLesson){const w=d.words.at(-1);return{id:`${id}-grammar-2`,kind:'choice',label:'认读这个假名或词',prompt:w.jp,audio:w.jp,answer:w.roman,options:choices(w.roman,phonetics.flatMap(x=>x.words.map(x=>x.roman)),id),explain:d.explanation};}const r=d.reading;return{id:`${id}-grammar-2`,kind:'choice',label:r.question,passage:r.text,prompt:'阅读并选择',answer:r.answer,options:shuffle(r.options,id),explain:`${r.answer}。请回到原文核对信息。`};}
export function questionsFor(id,mode){
 const d=getLesson(id);if(!d)throw Error('课程不存在');const pool=uniqueWords(d.courseId),romans=phonetics.flatMap(x=>x.words.map(w=>w.roman));
 if(mode==='words')return d.words.map((w,i)=>({id:`${id}-words-${i}`,kind:'choice',label:d.kanaLesson?'听一听，选出正确的读音':'听发音，选择词义',prompt:w.jp,kana:d.kanaLesson?null:w.kana,audio:w.jp,answer:w.zh,options:choices(w.zh,d.kanaLesson?romans:pool.map(x=>x.zh),id+i*3),explain:d.kanaLesson?`${w.jp} → ${w.roman}。${d.zhTip}`:`${w.jp}（${w.kana}）：${w.zh}`,word:w})).concat(d.kanaLesson?[]:[{id:`${id}-words-80`,kind:'match',label:'把单词与中文意思配对',pairs:d.words.slice(0,4),answer:d.words.slice(0,4).map(w=>w.jp).join('|'),explain:'配对完成。再次朗读每个词，建立声音与词义的联系。'}]);
 if(mode==='grammar'){
  if(d.kanaLesson)return [readingQuestion(id),...d.words.slice(0,4).map((w,i)=>({id:`${id}-grammar-${10+i}`,kind:'choice',label:'根据读音，找出假名',prompt:w.roman,answer:w.jp,options:choices(w.jp,phonetics.filter(x=>x.script===d.script).flatMap(x=>x.words.map(w=>w.jp)),id+i),explain:`${w.roman} 对应 ${w.jp}。${d.zhTip}`}))];
  const result=[{id:`${id}-grammar-0`,kind:'choice',label:'理解这个句子',prompt:d.sentence,audio:d.sentence,answer:d.translation,options:choices(d.translation,courseLessons(d.courseId).map(x=>x.translation),id),explain:d.explanation+' '+d.zhTip}];
  if(d.focus){const pieces=d.marked.split(/[\[\]]/).filter(Boolean);result.push({id:`${id}-grammar-1`,kind:'choice',label:'选择合适的表达填空',prompt:d.marked.replace(/\[[^\]]+\]/,'（　）'),answer:d.focus,options:choices(d.focus,courseLessons(d.courseId).map(x=>x.focus).filter(Boolean),id),explain:d.explanation});result.push({id:`${id}-grammar-3`,kind:'order',label:'排列词块，组成这个句子',prompt:d.translation,tokens:shuffle(pieces,id),answer:d.sentence,audio:d.sentence,explain:d.sentence+' '+d.explanation});}
  else result.push({id:`${id}-grammar-1`,kind:'choice',label:'这个句子的关键用法是？',prompt:d.sentence,audio:d.sentence,answer:d.grammar,options:choices(d.grammar,courseLessons(d.courseId).map(x=>x.grammar),id),explain:d.explanation});
  return [...result,readingQuestion(id)];
 }
 if(mode==='listen')return d.words.slice(0,6).map((w,i)=>({id:`${id}-listen-${i}`,kind:'listen',label:d.kanaLesson?'听声音，找出对应的假名':'听单词，选择中文意思',audio:w.jp,answer:d.kanaLesson?w.jp:w.zh,options:choices(d.kanaLesson?w.jp:w.zh,d.kanaLesson?phonetics.flatMap(x=>x.words.map(w=>w.jp)):pool.map(x=>x.zh),id+i),explain:`${w.jp}：${w.zh}`})).concat(d.kanaLesson?[]:[{id:`${id}-listen-80`,kind:'listen',label:'听句子，选择正确含义',audio:d.sentence,answer:d.translation,options:choices(d.translation,courseLessons(d.courseId).map(x=>x.translation),id),explain:d.sentence+' '+d.translation},{...readingQuestion(id),id:`${id}-listen-81`,kind:'listen',label:d.reading.question,audio:d.reading.text,passage:null,explain:d.reading.answer}]);
 if(mode==='speak')return [{id:`${id}-speak-0`,kind:'speak',label:d.kanaLesson?'跟读，每个音拍都读清楚':'听示范，用日语表达',prompt:d.sentence,audio:d.sentence,answer:d.sentence,explain:d.translation+' '+d.zhTip}];
 if(mode==='write')return d.words.slice(0,8).map((w,i)=>({id:`${id}-write-${i}`,kind:'write',label:d.kanaLesson?`根据读音，写出${d.script==='katakana'?'片假名':'平假名'}`:'凭记忆写出假名读音',prompt:d.kanaLesson?w.roman:w.jp,translation:d.kanaLesson?'写在练习板上，再输入核对':w.zh,audio:w.jp,answer:w.kana,strictScript:d.kanaLesson,explain:`${w.jp} → ${w.kana}`}));
 return [];
}
export function assessmentFor(courseId){const lessons=courseLessons(typeof courseId==='string'?courseId:getLesson(courseId)?.courseId);if(!lessons.length)return[];return Array.from({length:30},(_,i)=>{const d=lessons[Math.min(Math.floor(i*lessons.length/30),lessons.length-1)];return i%3===0?readingQuestion(d.day):questionsFor(d.day,i%3===1?'words':'listen')[0]});}
export const placementQuestions=[...assessmentFor('n5').slice(9,15),...assessmentFor('n4').slice(9,15)].map(q=>({...q,placement:true}));
export const kanaTable=phonetics.slice(0,6).flatMap(x=>x.words).map(w=>({...w,kata:w.jp.replace(/[ぁ-ゖ]/g,c=>String.fromCharCode(c.charCodeAt(0)+96))}));
