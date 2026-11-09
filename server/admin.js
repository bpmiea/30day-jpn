const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const dayKey=(time)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
export async function adminApi(request,db,user,url,data){
 if(user.role!=='admin')return json({error:'需要管理员权限。'},403);
 if(request.method==='GET'&&url.pathname==='/api/admin/stats'){
  const now=Date.now(),today=dayKey(now),start=dayKey(now-13*86400000);
  const [users,learning,activity,mastery,daily,modes]=await db.batch([
   db.prepare('SELECT COUNT(*) total,SUM(disabled) disabled FROM users'),
   db.prepare('SELECT COUNT(*) total,COUNT(DISTINCT CASE WHEN day_key=? THEN user_id END) active_today,COUNT(DISTINCT CASE WHEN created_at>=? THEN user_id END) active_week FROM learning_events').bind(today,now-7*86400000),
   db.prepare('SELECT COALESCE(SUM(seconds),0) seconds FROM activity'),
   db.prepare('SELECT COUNT(*) total FROM progress WHERE score>=80'),
   db.prepare('SELECT day_key,COUNT(*) total,COUNT(DISTINCT user_id) learners,SUM(seconds) seconds FROM learning_events WHERE day_key>=? GROUP BY day_key ORDER BY day_key').bind(start),
   db.prepare('SELECT mode,COUNT(*) total FROM learning_events GROUP BY mode ORDER BY total DESC')
  ]);
  return json({users:users.results[0],learning:{...learning.results[0],seconds:activity.results[0].seconds,mastered_modes:mastery.results[0].total},daily:daily.results,modes:modes.results,today,timezone:'Asia/Shanghai'});
 }
 if(request.method==='GET'&&url.pathname==='/api/admin/users'){
  const search=(url.searchParams.get('q')||'').trim().slice(0,254),status=url.searchParams.get('status')||'all';
  const page=Math.min(100000,Math.max(1,parseInt(url.searchParams.get('page'),10)||1)),limit=20;
  const where=`WHERE (instr(lower(u.email),lower(?))>0 OR instr(lower(u.name),lower(?))>0)${status==='disabled'?' AND u.disabled=1':status==='enabled'?' AND u.disabled=0':''}`;
  const [count,rows]=await db.batch([
   db.prepare(`SELECT COUNT(*) total FROM users u ${where}`).bind(search,search),
   db.prepare(`SELECT u.id,u.email,u.name,u.role,u.disabled,u.created_at,
    (SELECT COUNT(*) FROM learning_events e WHERE e.user_id=u.id) learning_count,
    (SELECT COALESCE(SUM(seconds),0) FROM activity a WHERE a.user_id=u.id) seconds,
    (SELECT MAX(created_at) FROM learning_events e WHERE e.user_id=u.id) last_learning
    FROM users u ${where} ORDER BY u.created_at DESC,u.id LIMIT ? OFFSET ?`).bind(search,search,limit,(page-1)*limit)
  ]);
  return json({users:rows.results,total:count.results[0].total,page,limit});
 }
 const match=/^\/api\/admin\/users\/([a-f0-9-]{36})$/.exec(url.pathname);
 if(request.method==='POST'&&match){
  if(!['disable','enable','revoke_sessions'].includes(data.action))return json({error:'无效的账号操作。'},400);
  const target=await db.prepare('SELECT id,role FROM users WHERE id=?').bind(match[1]).first();
  if(!target)return json({error:'账号不存在。'},404);
  if(data.action==='disable'&&(target.id===user.id||target.role==='admin'))return json({error:'不能停用管理员账号。'},400);
  const changes=[];
  if(data.action!=='revoke_sessions')changes.push(db.prepare('UPDATE users SET disabled=? WHERE id=?').bind(data.action==='disable'?1:0,target.id));
  if(data.action!=='enable')changes.push(db.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id));
  changes.push(db.prepare('INSERT INTO admin_audit(actor_id,target_id,action,created_at) VALUES(?,?,?,?)').bind(user.id,target.id,data.action,Date.now()));
  await db.batch(changes);
  return json({ok:true});
 }
 return json({error:'后台接口不存在。'},404);
}
