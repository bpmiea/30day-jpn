const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const {localAccount}=await import('./local-account.js');const account=await localAccount();const browser=await chromium.launch({headless:true,channel:'msedge',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try{
 const context=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone']});const page=await context.newPage();
 await page.goto('http://127.0.0.1:8787/learn/');await page.waitForSelector('[data-action="select-course"]');await page.locator('[data-action="select-course"]').click();await page.locator('.mobile-nav [data-nav="profile"]').click();await page.locator('[data-action="login"]').click();await page.locator('[name=email]').fill(account.email);await page.locator('[name=password]').fill(account.password);await page.locator('#auth-form button[type=submit]').click();await page.waitForSelector('.auth-modal',{state:'detached'});
 await page.locator('.unit-banner [data-day-detail]').click();await page.locator('[data-lesson="speak"]').click();await page.locator('#begin-exercise').click();await page.locator('#record').click();await page.waitForFunction(()=>document.querySelector('#record-status').textContent.includes('正在录音'));await page.waitForTimeout(300);await page.locator('#record').click();await page.waitForFunction(()=>!document.querySelector('#record-playback').hidden);assert.match(await page.locator('#record-playback').getAttribute('src'),/^blob:/);await page.screenshot({path:'test-results/ui-speaking.png',fullPage:true});await page.locator('#exit-lesson').click();
 const guest=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
 await guest.goto('http://127.0.0.1:8787/learn/?course=n5');
 await guest.locator('[data-foundation="1101"]').click();
 const sound=guest.waitForResponse(r=>r.url().endsWith('/learn/sounds/3042.wav')&&r.ok());
 await guest.getByRole('button',{name:'听示范'}).first().click();await sound;
 await guest.locator('#begin-exercise').click();
 assert.equal(await guest.locator('input').count(),0);
 const paths=(await import('../public/learn/strokes/paths.js')).default;
 const cdp=await guest.context().newCDPSession(guest);
 const board=guest.locator('#writing-board');
 async function writeStroke(pathData,reverse=false){
  await board.scrollIntoViewIfNeeded();
  const points=await board.evaluate((svg,d)=>{
   const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);
   const length=path.getTotalLength(),matrix=svg.getScreenCTM();
   const points=Array.from({length:14},(_,i)=>{
    const p=path.getPointAtLength(length*i/13).matrixTransform(matrix);return {x:p.x,y:p.y};
   });path.remove();return points;
  },pathData);
  if(reverse)points.reverse();const [first,...rest]=points;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[first]});
  for(const point of rest)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }
 await writeStroke(paths['あ'][0],true);
 assert.equal(await guest.locator('.writing-stroke').count(),0);
 for(const round of [1,2]){
  for(const d of paths['あ'])await writeStroke(d);
  assert.equal(await guest.locator('.writing-stroke').count(),3);
  if(round===1){
   await guest.locator('#undo-stroke').click();assert.equal(await guest.locator('.writing-stroke').count(),2);
   await writeStroke(paths['あ'][2]);
  }
  await guest.locator('#writing-next').click();
  if(round===1)assert.equal(await guest.locator('#writing-guide path').count(),0);
 }
 await guest.locator('#check-answer').click();await guest.locator('.feedback.success').waitFor();await guest.locator('#check-answer').click();
 await guest.locator('#repeat-aloud').click();assert.ok(await guest.locator('#check-answer').isDisabled());
 await guest.locator('#repeat-aloud').click();assert.ok(await guest.locator('#check-answer').isEnabled());
 console.log('PASS: microphone replay, guest audio, touch stroke checking, two writing rounds and two spoken repetitions.');
 }finally{await browser.close();await account.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1});
