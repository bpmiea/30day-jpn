const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const {localAccount}=await import('./local-account.js');const {questionsFor}=await import('../public/curriculum.js');const account=await localAccount();
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Exercise error handling without incurring provider calls; live synthesis is checked separately.
 await page.route('**/api/tts',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'语音测试：服务暂不可用'})}));
 await page.goto('http://127.0.0.1:8787/learn/');await page.waitForFunction(()=>document.querySelector('[data-action="select-course"]'));
 await page.locator('[data-action="select-course"]').click();await page.locator('.mobile-nav [data-nav="profile"]').click();await page.locator('[data-action="login"]').click();
 await page.locator('[name=email]').fill(account.email);await page.locator('[name=password]').fill(account.password);await page.locator('#auth-form button[type=submit]').click();await page.waitForSelector('.auth-modal',{state:'detached'});
 await page.locator('.mobile-nav [data-nav="profile"]').click();await page.locator('#autoplay-setting').uncheck();await page.waitForTimeout(200);await page.locator('.mobile-nav [data-nav="home"]').click();
 assert.equal(await page.locator('.path-stop.current [data-lesson="words"]').count(),1);assert.equal(await page.locator('.path-node:disabled').count(),4);
 await page.locator('.path-stop.current .path-node').click();await page.locator('#begin-exercise').click();
 let failOnce=true;await page.route('**/api/cards',r=>{if(failOnce){failOnce=false;return r.fulfill({status:503,contentType:'application/json',body:'{"error":"测试重试"}'});}return r.continue();});
 const qs=questionsFor(1001,'words');
 for(let i=0;i<qs.length;i++){const q=qs[i],answer=i===0?q.options.find(x=>x!==q.answer):q.answer;await page.locator('[data-option="'+q.options.indexOf(answer)+'"]').click();await page.locator('#check-answer').click();if(i===0)await page.screenshot({path:'test-results/ui-feedback.png',fullPage:true});await page.locator('#check-answer').click();}
 await page.locator('#retry-save').waitFor({state:'visible'});await page.locator('#retry-save').click();await page.waitForFunction(()=>document.querySelector('#save-status')?.textContent.includes('已同步'));
 await page.screenshot({path:'test-results/ui-complete.png',fullPage:true});await page.locator('#back-home').click();assert.equal(await page.locator('.path-stop.current [data-lesson="grammar"]').count(),1);
 await page.reload();await page.waitForSelector('.path-stop.current [data-lesson="grammar"]');await page.screenshot({path:'test-results/ui-progress.png',fullPage:true});
 await page.locator('.mobile-nav [data-nav="review"]').click();await page.locator('[data-action="review"]').click();await page.locator('[data-option="'+qs[0].options.indexOf(qs[0].answer)+'"]').click();await page.locator('#check-answer').click();await page.locator('#check-answer').click();await page.waitForFunction(()=>document.querySelector('#save-status')?.textContent.includes('已同步'));await page.locator('#back-home').click();
 await page.locator('[data-nav="choose"]').click();await page.locator('[data-select-course="n4"]').click();await page.locator('[data-action="select-course"]').click();await page.locator('.path-stop.current .path-node').click();await page.locator('#begin-exercise').click();
 for(const q of questionsFor(2001,'words')){if(q.kind==='match'){for(let i=0;i<q.pairs.length;i++){await page.locator('[data-match-jp="'+i+'"]').click();await page.locator('[data-match-zh="'+i+'"]').click();}}else await page.locator('[data-option="'+q.options.indexOf(q.answer)+'"]').click();await page.locator('#check-answer').click();await page.locator('#check-answer').click();}
 await page.waitForFunction(()=>document.querySelector('#save-status')?.textContent.includes('已同步'));await page.locator('#back-home').click();await page.locator('.path-stop.current .path-node').click();await page.locator('#begin-exercise').click();
 for(const q of questionsFor(2001,'grammar')){if(q.kind==='order'){let remainder=q.answer;const unused=new Set(q.tokens.map((_,i)=>i));while(unused.size){const i=[...unused].find(i=>remainder.startsWith(q.tokens[i]));assert.notEqual(i,undefined);await page.locator('[data-token="'+i+'"]').click();remainder=remainder.slice(q.tokens[i].length);unused.delete(i);}await page.screenshot({path:'test-results/ui-order.png',fullPage:true});}else await page.locator('[data-option="'+q.options.indexOf(q.answer)+'"]').click();await page.locator('#check-answer').click();await page.locator('#check-answer').click();}
 await page.waitForFunction(()=>document.querySelector('#save-status')?.textContent.includes('已同步'));await page.locator('#back-home').click();assert.equal(await page.locator('.path-stop.current [data-lesson="listen"]').count(),1);
 await page.locator('.path-stop.current .path-node').click();await page.locator('#begin-exercise').click();await page.locator('[data-option="0"]').click();assert.ok(await page.locator('#check-answer').isDisabled());await page.locator('#play-audio').click();await page.waitForFunction(()=>document.querySelector('#voice-status')?.textContent.includes('服务暂不可用'));assert.ok(await page.locator('#check-answer').isDisabled());await page.locator('#transcript-toggle').click();assert.equal(await page.locator('#check-answer').isDisabled(),false);await page.locator('#exit-lesson').click();
 for(const width of [320,360,390,430,1280]){await page.setViewportSize({width,height:844});for(const view of ['home','courses','review','library','profile']){await page.locator('.mobile-nav [data-nav="'+view+'"]').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+' '+view);}}
 assert.deepEqual(errors,[]);console.log('PASS: login, persisted preferences/progress, path unlock, save retry, review, matching, ordering, audio failure, 25 responsive views; no browser errors.');
 }finally{await browser.close();await account.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1});
