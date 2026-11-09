import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localAccount} from './local-account.js';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:8787';
const request=(path,body,cookie,source=origin)=>fetch(origin+'/api'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json',Origin:source}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
const login=async a=>{const r=await request('/auth/login',{email:a.email,password:a.password});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
test('admin permissions, learning statistics, search, suspension, session revocation',{skip:!process.env.RUN_API_TESTS},async()=>{
 assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
 const admin=await localAccount(),learner=await localAccount();
 try{
  await admin.promote();const ac=await login(admin),uc=await login(learner);
  assert.equal((await request('/admin/stats')).status,401);
  assert.equal((await request('/admin/users',undefined,uc)).status,403);
  assert.equal((await request('/admin/users/'+admin.id,{action:'disable'},uc)).status,403);
  assert.equal((await request('/auth/me',undefined,ac)).status,200);
  const event={event_id:crypto.randomUUID(),day:1001,mode:'words',score:100,seconds:120};
  for(let i=0;i<2;i++)assert.equal((await request('/progress',event,uc)).status,200);
  const result=await (await request('/admin/users?q='+encodeURIComponent(learner.email),undefined,ac)).json();
  assert.equal(result.total,1);assert.equal(result.users[0].learning_count,1);assert.equal(result.users[0].seconds,120);
  assert.ok(!('password_hash' in result.users[0]));assert.ok(!('salt' in result.users[0]));
  const stats=await (await request('/admin/stats',undefined,ac)).json();assert.ok(stats.learning.total>=1);assert.ok(stats.learning.seconds>=120);assert.ok(stats.daily.length>0);
  assert.equal((await request('/admin/users/'+admin.id,{action:'disable'},ac)).status,400);
  assert.equal((await request('/admin/users/'+learner.id,{action:'disable'},ac,'https://evil.example')).status,403);
  assert.equal((await request('/admin/users/'+learner.id,{action:'disable'},ac)).status,200);
  assert.equal((await request('/progress',undefined,uc)).status,401);
  assert.equal((await request('/auth/login',{email:learner.email,password:learner.password})).status,403);
  assert.equal((await request('/admin/users/'+learner.id,{action:'enable'},ac)).status,200);
  const uc2=await login(learner);
  assert.equal((await request('/progress',undefined,uc)).status,401);
  assert.equal((await request('/progress',undefined,uc2)).status,200);
  assert.equal((await request('/admin/users/'+learner.id,{action:'revoke_sessions'},ac)).status,200);
  assert.equal((await request('/progress',undefined,uc2)).status,401);
 }finally{await learner.cleanup();await admin.cleanup();}
});
