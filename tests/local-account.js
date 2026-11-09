import {randomUUID} from 'node:crypto';
import {writeFile,unlink,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {passwordHash} from '../worker.js';
const execute=promisify(execFile);
export async function localAccount(){
 const id=randomUUID(),email=`ui-${id}@example.test`,password=randomUUID(),salt=randomUUID();
 const path=`test-results/account-${id}.sql`;
 await mkdir('test-results',{recursive:true});
 const sql=async text=>{await writeFile(path,text);try{for(let attempt=0;attempt<4;attempt++){try{await execute(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','30day-jpn-db','--local','--file',path]);return;}catch(e){if(attempt===3||!String(e.stderr).includes('SQLITE_BUSY'))throw e;await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));}}}finally{await unlink(path);}};
 await sql(`INSERT INTO users(id,email,name,password_hash,salt,created_at) VALUES('${id}','${email}','测试学习者','${await passwordHash(password,salt)}','${salt}',${Date.now()});`);
 return {id,email,password,promote:()=>sql(`UPDATE users SET role='admin' WHERE id='${id}';`),cleanup:()=>sql(`DELETE FROM admin_audit WHERE actor_id='${id}' OR target_id='${id}'; DELETE FROM users WHERE id='${id}';`)};
}
