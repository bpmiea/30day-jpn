import {serviceConfig,verifyChallenge,synthesize} from './server/services.js';
import {adminApi} from './server/admin.js';
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const token=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const digest=async value=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
export async function passwordHash(password,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256)));}
function equal(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
const cookie=(value,url,expire=false)=>`jpn_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${expire?0:2592000}${url.protocol==='https:'?'; Secure':''}`;
async function userFor(request,db){const value=request.headers.get('Cookie')?.match(/(?:^|;\s*)jpn_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!value)return null;return db.prepare('SELECT u.id,u.email,u.name,u.role FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0').bind(await digest(value),Date.now()).first();}
async function limited(db,key,max=20){const now=Date.now();await db.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(now).run();const row=await db.prepare('INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+900000).first();return row.count>max;}
export function validCompletion(d){return d&&Number.isInteger(d.day)&&((((d.day>=1&&d.day<=60)||(d.day>=1001&&d.day<=1060)||(d.day>=2001&&d.day<=2060)||(d.day>=3001&&d.day<=3060))&&['words','grammar','listen','speak','write','assessment'].includes(d.mode))||(d.day===0&&d.mode==='review'))&&Number.isFinite(d.score)&&d.score>=0&&d.score<=100&&Number.isInteger(d.seconds)&&d.seconds>=0&&d.seconds<=7200;}
async function api(request,env,url){
 if(url.pathname==='/api/config')return json(serviceConfig(request,env));
 if(url.pathname==='/api/health')return json({ok:true,app:'30day-jpn',database:!!env.DB});
 if(!env.DB)return json({error:'数据库尚未配置，请先完成 D1 初始化。'},503);
 if(!['GET','HEAD'].includes(request.method)&&request.headers.get('Origin')!==url.origin)return json({error:'请求来源无效'},403);
 let data={};if(['POST','PUT'].includes(request.method)){if(!request.headers.get('Content-Type')?.includes('application/json'))return json({error:'需要 JSON 请求'},415);const raw=await request.text();if(raw.length>100000)return json({error:'请求过大'},413);try{data=JSON.parse(raw)}catch{return json({error:'请求格式错误'},400)}}
 const path=url.pathname;
 if(request.method==='POST'&&(path==='/api/auth/register'||path==='/api/auth/login')){
  const email=String(data.email||'').trim().toLowerCase(),password=String(data.password||''),name=String(data.name||'').trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||password.length<8||password.length>128)return json({error:'请输入有效邮箱和 8–128 位密码。'},400);
  if(await limited(env.DB,await digest((request.headers.get('CF-Connecting-IP')||'local')+':auth')))return json({error:'尝试次数过多，请 15 分钟后重试。'},429);
  let user;
  if(path.endsWith('register')){const challenge=await verifyChallenge(request,env,data.turnstileToken);if(!challenge.ok)return json({error:challenge.error},challenge.status);if(!name||name.length>30)return json({error:'昵称需为 1–30 个字符。'},400);const salt=token(),id=crypto.randomUUID();try{await env.DB.prepare('INSERT INTO users(id,email,name,password_hash,salt,created_at) VALUES (?,?,?,?,?,?)').bind(id,email,name,await passwordHash(password,salt),salt,Date.now()).run()}catch(e){if(String(e).includes('UNIQUE'))return json({error:'该邮箱已注册，请登录。'},409);throw e;}user={id,email,name};}
  else{user=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();const candidate=await passwordHash(password,user?.salt||'dummy-salt-for-timing');if(!user||!equal(candidate,user.password_hash))return json({error:'邮箱或密码不正确。'},401);if(user.disabled)return json({error:'该账号已停用，请联系管理员。'},403);}
  const session=token();await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()),env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await digest(session),user.id,Date.now()+2592000000)]);
  return json({user:{id:user.id,email:user.email,name:user.name,role:user.role||'user'}},200,{'Set-Cookie':cookie(session,url)});
 }
 const user=await userFor(request,env.DB);
 if(path==='/api/auth/me'&&request.method==='GET')return json({user});
 if(!user)return json({error:'请先登录。'},401);
 if(path.startsWith('/api/admin/'))return adminApi(request,env.DB,user,url,data);
 if(path==='/api/auth/logout'&&request.method==='POST'){const session=request.headers.get('Cookie')?.match(/jpn_session=([a-f0-9]{64})/)?.[1];if(session)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(session)).run();return json({ok:true},200,{'Set-Cookie':cookie('',url,true)});}
 if(path==='/api/progress'&&request.method==='GET'){const [p,m,a,c,pref]=await env.DB.batch([env.DB.prepare('SELECT day,mode,score,seconds,completed_at FROM progress WHERE user_id=? ORDER BY day,mode').bind(user.id),env.DB.prepare('SELECT question_id,payload,reviewed FROM mistakes WHERE user_id=?').bind(user.id),env.DB.prepare('SELECT day_key,seconds FROM activity WHERE user_id=? ORDER BY day_key').bind(user.id),env.DB.prepare('SELECT question_id,payload,due_at,step,correct_count FROM review_cards WHERE user_id=? ORDER BY due_at').bind(user.id),env.DB.prepare('SELECT course_id,daily_goal,autoplay FROM preferences WHERE user_id=?').bind(user.id)]);return json({progress:p.results,mistakes:m.results.map(x=>({...JSON.parse(x.payload),reviewed:!!x.reviewed})),activity:a.results,cards:c.results.map(x=>({...JSON.parse(x.payload),due_at:x.due_at,step:x.step,correct_count:x.correct_count})),preferences:pref.results[0]||null});}
 if(path==='/api/progress'&&request.method==='POST'){
  if(!validCompletion(data)||typeof data.event_id!=='string'||!/^[a-f0-9-]{36}$/.test(data.event_id))return json({error:'学习记录无效。'},400);
  const {day,mode,score,seconds}=data,now=Date.now();const dayKey=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
  await env.DB.prepare('INSERT OR IGNORE INTO learning_events(user_id,event_id,day,mode,score,seconds,day_key,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(user.id,data.event_id,day,mode,score,seconds,dayKey,now).run();
  return json({ok:true});
 }
 if(path==='/api/mistakes'&&request.method==='POST'){
  if(!Array.isArray(data.items)||data.items.length>80||data.items.some(x=>!x||typeof x.id!=='string'||!/^\d{1,4}-(words|grammar|listen|speak|write)-\d{1,3}$/.test(x.id)||!['choice','listen','write','speak','match','order'].includes(x.kind)||typeof x.answer!=='string'))return json({error:'错题记录无效'},400);
  if(data.items.length)await env.DB.batch(data.items.map(item=>env.DB.prepare('INSERT INTO mistakes(user_id,question_id,payload,reviewed) VALUES(?,?,?,?) ON CONFLICT(user_id,question_id) DO UPDATE SET payload=excluded.payload,reviewed=excluded.reviewed').bind(user.id,item.id,JSON.stringify(item),item.reviewed?1:0)));
  return json({ok:true});
 }

 if(path==='/api/preferences'&&request.method==='POST'){
  if(!['n5','n4','n3'].includes(data.course_id)||![15,30,60].includes(data.daily_goal)||typeof data.autoplay!=='boolean')return json({error:'学习设置无效。'},400);
  await env.DB.prepare('INSERT INTO preferences(user_id,course_id,daily_goal,autoplay,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET course_id=excluded.course_id,daily_goal=excluded.daily_goal,autoplay=excluded.autoplay,updated_at=excluded.updated_at').bind(user.id,data.course_id,data.daily_goal,data.autoplay?1:0,Date.now()).run();return json({ok:true});
 }
 if(path==='/api/tts'&&request.method==='POST'){
  if(await limited(env.DB,'tts:'+user.id,180))return json({error:'语音请求较多，请稍后再试。'},429);
  return synthesize(request,env,data);
 }
 if(path==='/api/cards'&&request.method==='POST'){
  if(typeof data.event_id!=='string'||!/^[a-f0-9-]{36}$/.test(data.event_id)||!Array.isArray(data.items)||data.items.length>80||data.items.some(x=>!x||typeof x.correct!=='boolean'||typeof x.question?.answer!=='string'||!/^\d{1,4}-(words|grammar|listen|speak|write)-\d{1,3}$/.test(x.question?.id)))return json({error:'复习记录无效。'},400);
  const now=Date.now();const queries=data.items.filter(x=>x.question.kind!=='speak').map(({question,correct})=>env.DB.prepare(`INSERT INTO review_cards(user_id,question_id,payload,due_at,step,correct_count)
    SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM review_events WHERE user_id=? AND event_id=?)
    ON CONFLICT(user_id,question_id) DO UPDATE SET payload=excluded.payload,
      due_at=CASE WHEN ?=0 THEN ? WHEN review_cards.due_at>? THEN review_cards.due_at ELSE ?+(CASE MIN(review_cards.step+1,5) WHEN 1 THEN 86400000 WHEN 2 THEN 259200000 WHEN 3 THEN 604800000 WHEN 4 THEN 1209600000 ELSE 2592000000 END) END,
      step=CASE WHEN ?=0 THEN 0 WHEN review_cards.due_at>? THEN review_cards.step ELSE MIN(review_cards.step+1,5) END,
      correct_count=review_cards.correct_count+?`).bind(user.id,question.id,JSON.stringify(question),now+(correct?86400000:600000),correct?1:0,correct?1:0,user.id,data.event_id,correct?1:0,now+600000,now,now,correct?1:0,now,correct?1:0));
  queries.push(env.DB.prepare('INSERT OR IGNORE INTO review_events(user_id,event_id,created_at) VALUES(?,?,?)').bind(user.id,data.event_id,now));await env.DB.batch(queries);return json({ok:true});
 }
 return json({error:'接口不存在。'},404);
}
export default {async fetch(request,env){const url=new URL(request.url);if(url.pathname.startsWith('/api/')){try{return await api(request,env,url)}catch(e){console.error('API failure',e?.message);return json({error:'服务暂时不可用，请稍后重试。'},500)}}const asset=await env.ASSETS.fetch(request);if(url.pathname.startsWith('/downloads/')){if(asset.headers.get('Content-Type')?.includes('text/html'))return new Response('文件不存在',{status:404});if(url.pathname.endsWith('.apk')&&asset.ok){const headers=new Headers(asset.headers);headers.set('Content-Type','application/vnd.android.package-archive');headers.set('Content-Disposition','attachment; filename="30day-jpn-1.1.0.apk"');return new Response(asset.body,{status:asset.status,headers});}}return asset;}};
