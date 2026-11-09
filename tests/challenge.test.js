import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyChallenge,serviceConfig} from '../server/services.js';
test('production registration fails closed without credentials or token',async()=>{
 const request=new Request('https://study.example/api/auth/register');
 assert.equal((await verifyChallenge(request,{},'token')).status,503);
 assert.equal((await verifyChallenge(request,{TURNSTILE_SECRET_KEY:'real-secret'},'')).status,400);
 assert.equal((await verifyChallenge(request,{TURNSTILE_SECRET_KEY:'1x0000000000000000000000000000000AA'},'token')).status,503);
 assert.equal(serviceConfig(request,{APP_ENV:'development'}).turnstileSiteKey,null);
});
test('real verification enforces hostname, action and success',async()=>{
 const request=new Request('https://study.example/api/auth/register'),env={TURNSTILE_SECRET_KEY:'test-secret'};
 for(const result of [{success:false},{success:true,hostname:'other.example',action:'register'},{success:true,hostname:'study.example',action:'login'}])assert.equal((await verifyChallenge(request,env,'token',async()=>Response.json(result))).ok,false);
 assert.equal((await verifyChallenge(request,env,'token',async()=>Response.json({success:true,hostname:'study.example',action:'register'}))).ok,true);
});
test('official dummy verification is restricted to local development',async()=>{
 const request=new Request('http://127.0.0.1:8787/api/auth/register');
 assert.equal((await verifyChallenge(request,{APP_ENV:'development'},'dummy',async()=>Response.json({success:true}))).ok,true);
 assert.equal((await verifyChallenge(request,{},'dummy')).ok,false);
});
