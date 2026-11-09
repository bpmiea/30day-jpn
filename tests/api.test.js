import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localAccount} from './local-account.js';
import {questionsFor} from '../public/curriculum.js';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:8787';
async function request(path,body,cookie,source=origin){return fetch(origin+'/api'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json',Origin:source}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});}
test('local D1: login, gated registration, course progress, idempotency, review schedule, logout',{skip:!process.env.RUN_API_TESTS},async()=>{
 assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Tests must target a local server');
 const a=await localAccount();try{
 assert.equal((await request('/progress')).status,401);
 assert.equal((await request('/auth/register',{email:a.email,password:a.password,name:'测试'})).status,400);
 const r=await request('/auth/login',{email:a.email,password:a.password});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly/);const cookie=r.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('/preferences',{course_id:'n4',daily_goal:60,autoplay:false},cookie)).status,200);
 const event={event_id:crypto.randomUUID(),day:2001,mode:'words',score:100,seconds:600};
 assert.equal((await request('/progress',event,cookie,'https://evil.example')).status,403);
 for(let i=0;i<2;i++)assert.equal((await request('/progress',event,cookie)).status,200);
 const question=questionsFor(2001,'words')[0],cards={event_id:event.event_id,items:[{question,correct:true}]};
 for(let i=0;i<2;i++)assert.equal((await request('/cards',cards,cookie)).status,200);
 let data=await (await request('/progress',undefined,cookie)).json();assert.equal(data.preferences.course_id,'n4');assert.equal(data.progress.length,1);assert.equal(data.progress[0].seconds,600);assert.equal(data.cards.length,1);assert.equal(data.cards[0].correct_count,1);assert.equal(data.cards[0].step,1);const due=data.cards[0].due_at;
 assert.equal((await request('/cards',{...cards,event_id:crypto.randomUUID()},cookie)).status,200);
 data=await (await request('/progress',undefined,cookie)).json();assert.equal(data.cards[0].due_at,due);assert.equal(data.cards[0].step,1);
 assert.equal((await request('/cards',{event_id:crypto.randomUUID(),items:[{question,correct:false}]},cookie)).status,200);
 data=await (await request('/progress',undefined,cookie)).json();assert.equal(data.cards[0].step,0);assert.ok(data.cards[0].due_at<Date.now()+601000);
 assert.equal((await request('/progress',{...event,event_id:crypto.randomUUID(),day:1001},cookie)).status,200);
 data=await (await request('/progress',undefined,cookie)).json();assert.deepEqual(data.progress.map(p=>p.day),[1001,2001]);assert.equal(data.activity[0].seconds,1200);
 assert.equal((await request('/tts',{text:'not a lesson'},cookie)).status,400);
 assert.equal((await request('/auth/logout',{},cookie)).status,200);assert.equal((await request('/progress',undefined,cookie)).status,401);
 }finally{await a.cleanup();}
});
