import {test} from 'node:test';
import assert from 'node:assert/strict';
import {curriculum,courses,modes,questionsFor,assessmentFor,normalize,courseLessons,foundations,foundationQuestions} from '../public/curriculum.js';
import strokePaths from '../public/learn/strokes/paths.js';
import {validCompletion,passwordHash} from '../worker.js';
test('three independent 60-lesson routes and a one-hour daily plan',()=>{
 assert.equal(curriculum.length,192);assert.equal(foundations.length,12);assert.equal(new Set(curriculum.map(d=>d.day)).size,192);
 for(const c of courses)assert.equal(courseLessons(c.id).length,60);
 assert.equal(modes.reduce((sum,m)=>sum+m.minutes,0),60);
});
test('lesson-mode sets have answerable questions and stable unique IDs',()=>{
 const ids=new Set();for(const d of curriculum)for(const m of modes){const qs=questionsFor(d.day,m.id);assert.ok(qs.length);for(const q of qs){
 assert.ok(!ids.has(q.id),q.id);ids.add(q.id);assert.ok(q.answer,q.id);assert.ok(q.explain,q.id);
 if(q.options){assert.equal(new Set(q.options).size,4,q.id);assert.ok(q.options.includes(q.answer),q.id);}
 if(q.kind==='listen')assert.ok(q.audio);
 if(q.kind==='write')for(const char of q.answer)assert.ok(strokePaths[char]?.length,`${q.id}: ${char}`);
 if(q.kind==='match'){assert.equal(new Set(q.pairs.map(w=>w.jp)).size,q.pairs.length);assert.equal(new Set(q.pairs.map(w=>w.zh)).size,q.pairs.length);}
 if(q.kind==='order')assert.equal([...q.tokens.join('')].sort().join(''),[...q.answer].sort().join(''));
 }}
});
test('all specialist lessons cover listening, writing and speaking and save with their own IDs',()=>{
 for(const lesson of foundations){
  const questions=foundationQuestions(lesson.day);
  for(const kind of ['listen','write','speak'])assert.ok(questions.some(q=>q.kind===kind));
  assert.equal(new Set(questions.map(q=>q.id)).size,questions.length);
  for(const question of questions.filter(q=>q.kind==='write'))for(const char of question.answer)assert.ok(strokePaths[char]?.length,char);
  assert.ok(validCompletion({day:lesson.day,mode:'foundation',score:80,seconds:300}));
 }
 assert.equal(validCompletion({day:1001,mode:'foundation',score:80,seconds:300}),false);
});
test('assessments cover every course without duplicate questions',()=>{for(const c of courses){const qs=assessmentFor(c.id);assert.equal(qs.length,30);assert.equal(new Set(qs.map(q=>q.id)).size,30);}});
test('kana normalization supports katakana and punctuation',()=>{assert.equal(normalize('ガクセイ。'),normalize('がくせい'));assert.equal(normalize(' ｶﾞｸｾｲ '),'がくせい');});
test('progress validation covers new courses and rejects impossible IDs',()=>{
 for(const day of [1,60,1001,1060,2001,2060,3001,3060])assert.ok(validCompletion({day,mode:'words',score:80,seconds:600}));
 for(const day of [61,1000,1061,2000,2061,3000,3061])assert.ok(!validCompletion({day,mode:'words',score:80,seconds:600}));
 for(const x of [{mode:'admin'},{score:101},{seconds:-1},{seconds:7201},{seconds:NaN}])assert.ok(!validCompletion({day:1001,mode:'words',score:80,seconds:600,...x}));
});
test('password hashes depend on both password and salt',async()=>{const a=await passwordHash('test-password','salt-a');assert.equal(a.length,64);assert.equal(a,await passwordHash('test-password','salt-a'));assert.notEqual(a,await passwordHash('test-password','salt-b'));});
