import {curriculum,courses,courseLessons,getLesson,modes,questionsFor,assessmentFor,placementQuestions,normalize,foundations,foundationQuestions} from './curriculum.js';
import {shell,homeView,chooseView,coursesView,dayView,reviewView,libraryView,libraryResults,profileView,wordCard,esc} from './views.js';
import {icon} from './icons.js';
import {playJapanese,stopSpeech,hasBeginnerClip} from './speech.js';
import {stopRecording,toggleRecording,recognize} from './media.js';
import {handwritingView,initHandwriting} from './handwriting.js';
window.addEventListener('jpn-app-pause',()=>{stopSpeech();stopRecording();});

const $=s=>document.querySelector(s);
function stored(){try{return JSON.parse(localStorage.getItem('jpn-preferences-v2'))||{}}catch{return{}}}
const prefs=stored();
const requestedCourse=new URLSearchParams(location.search).get('course');
if(['n5','n4','n3'].includes(requestedCourse))prefs.courseId=requestedCourse;
const state={user:null,progress:[],mistakes:[],activity:[],cards:[],courseId:['n5','n4','n3'].includes(prefs.courseId)?prefs.courseId:'n5',draftCourse:['n5','n4','n3'].includes(prefs.courseId)?prefs.courseId:'n5',dailyGoal:[15,30,60].includes(prefs.dailyGoal)?prefs.dailyGoal:60,autoplay:prefs.autoplay!==false,deviceVoice:prefs.deviceVoice===true&&prefs.speechVersion==='cosy-ja-v1',page:prefs.courseId?'home':'choose',libraryTab:'vocab',search:'',auth:null,offline:false,loading:true,config:{},challengeToken:''};
let lesson=null,clockTimer,toastTimer,authBusy=false,pendingLesson=null,challengeWidget,challengePromise,authTrigger,guestFoundation;
const done=(id,mode)=>state.progress.some(p=>p.day===id&&p.mode===mode&&p.score>=80);
const completeLesson=id=>modes.every(m=>done(id,m.id));
const currentLesson=()=>courseLessons(state.courseId).find(d=>!completeLesson(d.day))||courseLessons(state.courseId).at(-1);
const dateKey=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const todayMinutes=()=>Math.floor((state.activity.find(a=>a.day_key===dateKey())?.seconds||0)/60);
const xp=()=>state.progress.reduce((a,p)=>a+Math.round(p.score/5)+10,0);
function streak(){let count=0,date=new Date();if(!state.activity.some(x=>x.day_key===dateKey(date)))date.setDate(date.getDate()-1);while(state.activity.some(x=>x.day_key===dateKey(date))){count++;date.setDate(date.getDate()-1)}return count;}
const dueCards=()=>state.cards.filter(q=>q.due_at<=Date.now());
const context=()=>({state,done,completeLesson,currentLesson,dateKey,todayMinutes,xp,streak,dueCards});
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4200);}
async function api(path,body){const response=await fetch('/api'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});let data;try{data=await response.json()}catch{throw Error('服务没有响应，请检查网络后重试。')}if(!response.ok)throw Error(data.error||'请求失败');return data;}
function saveLocal(){try{localStorage.setItem('jpn-preferences-v2',JSON.stringify({courseId:state.courseId,dailyGoal:state.dailyGoal,autoplay:state.autoplay,deviceVoice:state.deviceVoice,speechVersion:'cosy-ja-v1'}))}catch{}}
async function savePreferences(){if(state.user)await api('/preferences',{course_id:state.courseId,daily_goal:state.dailyGoal,autoplay:state.autoplay});saveLocal();}
async function loadProgress(){const data=await api('/progress');state.progress=data.progress;state.mistakes=data.mistakes;state.activity=data.activity;state.cards=data.cards||[];if(data.preferences){state.courseId=data.preferences.course_id;state.draftCourse=state.courseId;state.dailyGoal=data.preferences.daily_goal;state.autoplay=!!data.preferences.autoplay;saveLocal();}state.offline=false;}
function render() {
 if(challengeWidget!==undefined&&window.turnstile){
  try{window.turnstile.remove(challengeWidget)}catch{}
  challengeWidget=undefined;
  state.challengeToken='';
 }
 const views={home:homeView,choose:chooseView,courses:coursesView,review:reviewView,library:libraryView,profile:profileView};
 const viewContext=context();
 const body=state.detail ? dayView(state.detail,viewContext) : views[state.page](viewContext);
 $('#app').innerHTML=shell(body,viewContext)+(state.auth?authView():'');
 bind();
 if(state.auth==='register')mountChallenge();
}
function navigate(page){stopSpeech();stopRecording();if(lesson){clearInterval(clockTimer);lesson=null;}state.page=page;state.auth=null;state.detail=null;if(page==='choose')state.draftCourse=state.courseId;render();window.scrollTo(0,0);$('#main-content')?.focus({preventScroll:true});}
function openDetail(button) {
 stopSpeech();
 state.detail=Number(button.dataset.dayDetail);
 render();
 window.scrollTo(0,0);
 $('#main-content').focus({preventScroll:true});
}
async function chooseCourse(id){const old=state.courseId;state.courseId=id;try{await savePreferences();navigate('home');toast('已切换到 '+courses.find(c=>c.id===id).from+' → '+courses.find(c=>c.id===id).to+'，已有进度会保留。')}catch(e){state.courseId=old;toast(e.message)}}
function listenButtons(){document.querySelectorAll('[data-say]').forEach(b=>b.onclick=async()=>{b.setAttribute('aria-busy','true');await speak(b.dataset.say,b.dataset.rate||'normal');b.removeAttribute('aria-busy')});}
function bind(){
 document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav));
 document.querySelectorAll('[data-select-course]').forEach(b=>b.onclick=()=>{state.draftCourse=b.dataset.selectCourse;render();$('[data-select-course='+state.draftCourse+']')?.focus({preventScroll:true})});
 document.querySelectorAll('[data-course-tab]').forEach(b=>b.onclick=async()=>{const old=state.courseId;state.courseId=b.dataset.courseTab;try{await savePreferences();render();$('[data-course-tab='+state.courseId+']')?.focus({preventScroll:true})}catch(e){state.courseId=old;toast(e.message)}});
 document.querySelectorAll('[data-day-detail]').forEach(b=>b.onclick=()=>openDetail(b));
 document.querySelectorAll('[data-lesson]').forEach(b=>b.onclick=()=>startLesson(+b.dataset.day,b.dataset.lesson));
 document.querySelectorAll('[data-foundation]').forEach(button=>button.onclick=()=>startLesson(Number(button.dataset.foundation),'foundation'));
 document.querySelectorAll('[data-assessment]').forEach(b=>b.onclick=()=>{const id=b.dataset.assessment;startLesson(courseLessons(id).at(-1).day,'assessment',assessmentFor(id))});
 document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action,b));
 document.querySelectorAll('[data-library-tab]').forEach(b=>b.onclick=()=>{state.libraryTab=b.dataset.libraryTab;state.search='';render();$('[data-library-tab='+state.libraryTab+']')?.focus({preventScroll:true})});
 $('#library-search')?.addEventListener('input',e=>{state.search=e.target.value;$('#library-results').innerHTML=libraryResults(state.search,context());listenButtons();document.querySelectorAll('#library-results [data-day-detail]').forEach(b=>b.onclick=()=>openDetail(b))});
 $('#goal-setting')?.addEventListener('change',async e=>{const old=state.dailyGoal;state.dailyGoal=+e.target.value;try{await savePreferences();toast('每日目标已保存。')}catch(err){state.dailyGoal=old;render();toast(err.message)}});
 $('#autoplay-setting')?.addEventListener('change',async e=>{const old=state.autoplay;state.autoplay=e.target.checked;try{await savePreferences()}catch(err){state.autoplay=old;render();toast(err.message)}});
 $('#device-voice-setting')?.addEventListener('change',e=>{state.deviceVoice=e.target.checked;saveLocal();toast(state.deviceVoice?'已启用设备日语备用，音质不作为教学标准。':'已关闭设备备用，只使用教学语音。')});
 $('#auth-form')?.addEventListener('submit',authenticate);$('.modal-backdrop')?.addEventListener('click',e=>{if(e.target.classList.contains('modal-backdrop'))action('close-auth')});listenButtons();
}
async function action(id, trigger){
 if(['login','register'].includes(id)){
  if(!state.auth){
   const source=trigger||document.activeElement;
   const key=source?.dataset.action;
   const mode=source?.dataset.lesson;
   authTrigger=key?'[data-action="'+key+'"]':mode?'[data-lesson="'+mode+'"]':null;
  }
  state.auth=id;state.challengeToken='';render();$('#auth-title')?.focus();return;
 }
 if(id==='close-auth'){state.auth=null;pendingLesson=null;render();(authTrigger&&$(authTrigger)||$('#main-content'))?.focus({preventScroll:true});return;}
 if(id==='back-detail'){state.detail=null;render();window.scrollTo(0,0);$('#main-content')?.focus({preventScroll:true});return;}
 if(id==='retry-load')return refreshLearning();
 if(id==='select-course')return chooseCourse(state.draftCourse);
 if(id==='placement'){const items=placementQuestions.map(q=>({...q,kind:'choice',prompt:q.prompt||q.audio,audio:undefined}));return startLesson(0,'placement',items);}
 if(id==='review'||id==='due-review'||id==='all-review'){const items=id==='review'?state.mistakes.filter(x=>!x.reviewed):id==='due-review'?dueCards():[...state.cards].sort(()=>Math.random()-.5);if(items.length)return startLesson(0,'review',items.slice(0,15));return;}
 if(id==='logout'){try{await api('/auth/logout',{});state.user=null;state.progress=[];state.cards=[];state.activity=[];state.mistakes=[];navigate('home');toast('已退出，学习记录保存在云端。')}catch(e){toast(e.message)}return;}
 if(id==='export'){const link=document.createElement('a');const url=URL.createObjectURL(new Blob([JSON.stringify({exportedAt:new Date().toISOString(),preferences:{courseId:state.courseId,dailyGoal:state.dailyGoal},progress:state.progress,activity:state.activity,mistakes:state.mistakes,cards:state.cards},null,2)],{type:'application/json'}));link.href=url;link.download='30day-jpn-record.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
function authView(){const register=state.auth==='register';return `<div class="modal-backdrop"><section class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button class="close-btn" data-action="close-auth" aria-label="关闭">${icon('close')}</button><h2 id="auth-title" tabindex="-1">${register?'创建学习账号':'欢迎回来。'}</h2><p>${register?'创建账号，同步课程和复习记录。':'登录后，从上次的那一课继续。'}</p><form id="auth-form">${register?'<label>昵称<input name="name" autocomplete="nickname" required maxlength="30" placeholder="怎么称呼你？"></label>':''}<label>邮箱<input type="email" name="email" required maxlength="254" autocomplete="email" placeholder="you@example.com"></label><label>密码<input type="password" name="password" minlength="8" maxlength="128" required autocomplete="${register?'new-password':'current-password'}" placeholder="至少 8 个字符"></label>${register?'<div id="turnstile-container"></div><p id="challenge-note" role="status">正在加载安全验证…</p>':''}<div id="auth-error" role="alert"></div><button class="btn primary full" type="submit" ${register?'disabled':''}>${register?'创建账号':'登录'} ${icon('arrow')}</button></form><p class="auth-switch">${register?'已有账号？':'第一次来？'} <button data-action="${register?'login':'register'}">${register?'去登录':'注册账号'}</button></p><p class="fine-print">密码加盐哈希保存。当前不提供邮箱找回，<br>请使用密码管理器保存专属密码。</p></section></div>`;}
async function mountChallenge(){
 if(!state.config.turnstileSiteKey){if($('#challenge-note'))$('#challenge-note').textContent='安全验证尚未配置，注册暂不可用。';return}
 try{if(!window.turnstile){if(!challengePromise)challengePromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.onload=resolve;script.onerror=()=>{challengePromise=null;reject(Error('安全验证加载失败，请检查网络并重试。'))};document.head.appendChild(script)});await challengePromise;}
 if(!$('#turnstile-container')||challengeWidget!==undefined)return;challengeWidget=window.turnstile.render('#turnstile-container',{sitekey:state.config.turnstileSiteKey,action:'register',theme:'auto',size:window.innerWidth<360?'compact':'flexible',callback:token=>{state.challengeToken=token;const button=$('#auth-form button[type=submit]');if(button)button.disabled=false;if($('#challenge-note'))$('#challenge-note').textContent='安全验证已通过';},'expired-callback':()=>{state.challengeToken='';if($('#auth-form button[type=submit]'))$('#auth-form button[type=submit]').disabled=true;},'error-callback':()=>{state.challengeToken='';if($('#challenge-note'))$('#challenge-note').textContent='验证暂不可用，请关闭后重试。';if($('#auth-form button[type=submit]'))$('#auth-form button[type=submit]').disabled=true;}});
 }catch(e){if($('#challenge-note'))$('#challenge-note').textContent=e.message;}
}
async function authenticate(event){event.preventDefault();if(authBusy)return;const register=state.auth==='register';if(register&&!state.challengeToken)return;authBusy=true;const button=event.target.querySelector('button[type=submit]');button.disabled=true;button.textContent='正在连接…';try{const result=await api('/auth/'+state.auth,{...Object.fromEntries(new FormData(event.target)),turnstileToken:state.challengeToken});state.user=result.user;await loadProgress();await savePreferences();state.auth=null;const pending=pendingLesson;pendingLesson=null;if(pending)startLesson(...pending);else if(guestFoundation){lesson=guestFoundation;guestFoundation=null;lesson.saved=false;await finishLesson();}else navigate('home');toast('登录成功，课程与学习记录已同步。')}catch(e){if($('#auth-error'))$('#auth-error').textContent=e.message;if(register&&window.turnstile&&challengeWidget!==undefined){window.turnstile.reset(challengeWidget);state.challengeToken='';}button.disabled=register;button.textContent=register?'创建账号':'登录';}finally{authBusy=false;}}
async function speak(text,rate='normal'){if(!state.user&&!state.deviceVoice&&!hasBeginnerClip(text)){toast('登录后使用教学语音。');return false}try{if($('#voice-status'))$('#voice-status').textContent='正在加载日语音频…';const ok=await playJapanese(text,rate,state.deviceVoice);if($('#voice-status'))$('#voice-status').textContent=state.deviceVoice&&!hasBeginnerClip(text)?'设备日语备用 · 非教学音频':'日语语音 · '+(rate==='slow'?'慢速':'正常语速');return ok;}catch(e){if(e.name!=='AbortError'){if($('#voice-status'))$('#voice-status').textContent=e.message;toast(e.message)}return false;}}
function stopMedia(){stopSpeech();stopRecording();}
function startLesson(id,mode,items){
 if(mode!=='placement'&&!(mode==='foundation'&&id===1101)&&!state.user){pendingLesson=[id,mode,items];action('register');return;}
 stopMedia();clearInterval(clockTimer);lesson={eventId:crypto.randomUUID(),day:id,mode,items:items||(mode==='foundation'?foundationQuestions(id):questionsFor(id,mode)),index:0,correct:0,answer:null,checked:false,wrong:[],reviewed:[],results:[],elapsed:0,saved:false,heard:false,matched:[],selectedWord:null,matchErrors:0,order:[],intro:!items};
 if(lesson.intro)showIntro();else showLesson();clockTimer=setInterval(()=>{if(lesson&&!lesson.saved&&document.visibilityState==='visible'){lesson.elapsed=Math.min(lesson.elapsed+1,7200);if($('#lesson-time'))$('#lesson-time').textContent=timeText(lesson.elapsed)}},1000);
}
const timeText=seconds=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
function lessonHeader(){const d=getLesson(lesson.day),name=lesson.mode==='foundation'?'读写入门':lesson.mode==='review'?'记忆复习':lesson.mode==='assessment'?'阶段检查':lesson.mode==='placement'?'水平自查':modes.find(m=>m.id===lesson.mode).name;return `<header class="lesson-header"><button class="round-btn" id="exit-lesson" aria-label="退出练习">${icon('close')}</button><progress class="lesson-progress" max="${lesson.items.length}" value="${lesson.index}" aria-label="练习完成进度"></progress><span>${lesson.intro?'准备':lesson.index+1+' / '+lesson.items.length}</span><span class="lesson-timer">${icon('clock')}<b id="lesson-time">${timeText(lesson.elapsed)}</b></span></header><div class="lesson-label">${d?d.level+' · 第 '+d.index+' 课 · ':''}${name}</div>`;}
function showIntro() {
 const current=getLesson(lesson.day);
 const wordIntro=lesson.mode==='words'||current.kanaLesson||current.foundation;
 const steps=current.foundation?'<ol class="intro-steps"><li>听示范，记住口型和假名。</li><li>用手指描笔顺，再遮住字形写一遍。</li><li>跟读两遍，最后盖住文字做听辨。</li></ol>':'';
 const wordList=current.foundation
  ? `<div class="foundation-word-list">${current.words.map(word=>`
     <article class="surface-card"><div><h2 lang="ja">${esc(word.jp)}</h2>
      <p><span lang="ja">${esc(word.jp===word.kana?'':word.kana)}</span> ${esc(word.zh)}</p></div>
      <button class="audio-pill" data-say="${esc(word.jp)}">${icon('volume')} 听示范</button>
      <p>${esc(word.cue)}</p>
     </article>`).join('')}</div>`
  : `<div class="word-grid">${current.words.map(word=>wordCard(word,current.kanaLesson)).join('')}</div>`;
 const notes=wordIntro?wordList:`<section class="note-card"><h2 lang="ja">${esc(current.sentence)}</h2><p>${esc(current.translation)}</p><button class="audio-pill" data-say="${esc(current.sentence)}">${icon('volume')} 听示范</button></section>`;
 $('#app').innerHTML=`<div class="lesson-page">${lessonHeader()}
  <main class="lesson-intro"><h1>${esc(current.title)}</h1><p>${esc(current.explanation)}</p>
   ${steps}${notes}<div class="native-tip"><b>发音与字形提醒</b><p>${esc(current.zhTip)}</p></div>
  </main><footer class="exercise-footer"><span>共 ${lesson.items.length} 个练习</span><button class="btn primary" id="begin-exercise">开始练习 ${icon('arrow')}</button></footer></div>`;
 $('#exit-lesson').onclick=exitLesson;
 $('#begin-exercise').onclick=()=>{stopMedia();lesson.intro=false;showLesson()};
 listenButtons();
 window.scrollTo(0,0);
}
function showLesson(){
 const q=lesson.items[lesson.index];lesson.answer=null;lesson.checked=false;lesson.heard=false;lesson.matched=[];lesson.selectedWord=null;lesson.matchErrors=0;lesson.order=[];lesson.writing=null;
 $('#app').innerHTML=`<div class="lesson-page">${lessonHeader()}<main class="exercise"><h1>${esc(q.label)}</h1>${q.passage?`<article class="reading-passage" lang="ja">${esc(q.passage)}</article>`:''}${q.kind==='listen'?`<button class="listen-button" id="play-audio" aria-label="播放日语听力">${icon('volume')}<span>听日语</span></button><div class="audio-controls"><button id="slow-audio">慢速 ${icon('play')}</button><button id="transcript-toggle" aria-controls="transcript" aria-expanded="false">文字辅助</button></div><p id="transcript" hidden>${esc(q.audio)}<small>辅助模式不能代替独立听力测评。</small></p>`:q.kind==='match'?'':`<div class="prompt-card ${q.passage?'hidden-prompt':''}"><h2 lang="ja">${esc(q.prompt)}</h2>${q.kana?`<p class="kana-reading">${esc(q.kana)}</p>`:''}${q.translation?`<p>${esc(q.translation)}</p>`:''}${q.audio?`<div class="word-audio-controls"><button id="play-audio" class="audio-pill" aria-label="日语朗读">${icon('volume')} 日语朗读</button><button id="slow-audio" class="audio-pill">慢速</button></div>`:''}</div>`}${q.audio?`<p id="voice-status" class="voice-status">${hasBeginnerClip(q.audio)?'元音示范':state.deviceVoice?'设备日语备用':state.config.ttsReady?'日语合成音频':'教学音频待配置'}</p>`:''}${q.options?`<div class="answer-options">${q.options.map((o,i)=>`<button class="answer-option" data-option="${i}" aria-pressed="false"><span aria-hidden="true">${i+1}</span><span class="answer-text">${esc(o)}</span><span class="choice-state"></span></button>`).join('')}</div>`:''}${q.kind==='order'?`<div class="order-answer" id="order-answer"><span>按顺序选择下面的词块</span></div><div class="token-bank">${q.tokens.map((t,i)=>`<button data-token="${i}">${esc(t)}</button>`).join('')}</div>`:''}${q.kind==='match'?`<div class="matching-grid"><div>${q.pairs.map((w,i)=>`<button data-match-jp="${i}" aria-pressed="false" lang="ja">${esc(w.jp)}<small>${icon('volume')}</small></button>`).join('')}</div><div>${q.pairs.map((w,i)=>({w,i})).reverse().map(({w,i})=>`<button data-match-zh="${i}">${esc(w.zh)}</button>`).join('')}</div></div><p class="fine-print">先选日语，再选对应中文。点击日语同时朗读。</p>`:''}${q.kind==='write'?handwritingView():''}${q.kind==='speak'?`<p class="speaking-translation">${esc(q.explain)}</p><div class="speaking-panel"><button class="btn tonal-button" id="record">${icon('mic')} 开始录音</button><button class="btn secondary" id="repeat-aloud">已跟读一次</button><p id="record-status" role="status">录音仅在本页面保留，不会上传。</p><audio id="record-playback" controls hidden></audio><p id="repeat-status" role="status">跟读进度 0 / 2</p><details class="speaking-help"><summary>可选文字识别</summary><p class="fine-print">浏览器识别服务可能收到录音，识别文字仅供对照。</p><button class="text-button" id="recognize">识别我读的文字</button><p id="recognition-result" role="status"></p></details></div>`:''}</main><footer class="exercise-footer"><div id="feedback" role="status"><span class="muted">${q.kind==='speak'?'先听，再说，再回听。':'试着回忆，不用急着答。'}</span></div><button class="btn primary" id="check-answer" disabled>${q.kind==='speak'?'完成跟读':q.kind==='write'?'核对书写':'检查答案'} ${icon('arrow')}</button></footer></div>`;
 $('#exit-lesson').onclick=exitLesson;
 $('#play-audio')?.addEventListener('click',async()=>{const active=lesson;const heard=await speak(q.audio);if(lesson===active){lesson.heard=heard||lesson.heard;updateCheck()}});
 $('#slow-audio')?.addEventListener('click',async()=>{const active=lesson;const heard=await speak(q.audio,'slow');if(lesson===active){lesson.heard=heard||lesson.heard;updateCheck()}});
 $('#transcript-toggle')?.addEventListener('click',()=>{$('#transcript').hidden=!$('#transcript').hidden;$('#transcript-toggle').setAttribute('aria-expanded',String(!$('#transcript').hidden));lesson.heard=true;lesson.assisted=true;updateCheck()});
 document.querySelectorAll('[data-option]').forEach(b=>b.onclick=()=>{if(lesson.checked)return;lesson.answer=q.options[+b.dataset.option];document.querySelectorAll('[data-option]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));x.querySelector('.choice-state').textContent=x===b?'已选':'';});updateCheck()});
 document.querySelectorAll('[data-token]').forEach(b=>b.onclick=()=>{if(lesson.checked)return;lesson.order.push(+b.dataset.token);renderOrder(q)});
 document.querySelectorAll('[data-match-jp]').forEach(b=>b.onclick=()=>{if(lesson.checked||lesson.matched.includes(+b.dataset.matchJp))return;lesson.selectedWord=+b.dataset.matchJp;document.querySelectorAll('[data-match-jp]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});speak(q.pairs[lesson.selectedWord].jp)});
 document.querySelectorAll('[data-match-zh]').forEach(b=>b.onclick=()=>{if(lesson.checked||lesson.selectedWord===null||lesson.matched.includes(+b.dataset.matchZh))return;const i=+b.dataset.matchZh;if(i===lesson.selectedWord){lesson.matched.push(i);const japanese=document.querySelector(`[data-match-jp="${i}"]`);for(const matched of [japanese,b]){matched.classList.add('matched');matched.disabled=true;matched.insertAdjacentHTML('beforeend',icon('check'));}japanese.setAttribute('aria-pressed','false');japanese.classList.remove('selected');lesson.selectedWord=null;if(lesson.matched.length===q.pairs.length)lesson.answer=q.answer;updateCheck()}else{lesson.matchErrors++;b.classList.add('incorrect');setTimeout(()=>b.classList.remove('incorrect'),500);toast('这两个词还没有配上，再想一想。')}});
 $('#check-answer').onclick=checkAnswer;
 $('#record')?.addEventListener('click',()=>{stopSpeech();toggleRecording();});
 if(q.kind==='write')initHandwriting(q.answer,success=>{lesson.writing=success;updateCheck();});
 $('#recognize')?.addEventListener('click',()=>{stopSpeech();recognize();});
 if(q.kind==='speak'){
  const repeat=$('#repeat-aloud');
  lesson.repeats=0;
  repeat.onclick=()=>{
   if(lesson.checked || lesson.repeats>=2)return;
   lesson.repeats++;
   $('#repeat-status').textContent='跟读进度 '+lesson.repeats+' / 2';
   repeat.textContent=lesson.repeats===2?'已跟读两遍':'已跟读第二遍';
   repeat.disabled=lesson.repeats===2;
   updateCheck();
  };
 }
 window.scrollTo(0,0);
 if(state.autoplay&&q.kind!=='listen'&&q.word&&q.audio&&(state.config.ttsReady||state.deviceVoice))speak(q.audio);
}
function renderOrder(q){$('#order-answer').innerHTML=lesson.order.map((index,i)=>`<button data-remove-token="${i}">${esc(q.tokens[index])}</button>`).join('')||'<span>按顺序选择下面的词块</span>';document.querySelectorAll('[data-token]').forEach(b=>b.disabled=lesson.order.includes(+b.dataset.token));document.querySelectorAll('[data-remove-token]').forEach(b=>b.onclick=()=>{if(lesson.checked)return;lesson.order.splice(+b.dataset.removeToken,1);renderOrder(q)});lesson.answer=lesson.order.map(i=>q.tokens[i]).join('');updateCheck();}
function updateCheck(){if(!lesson||!$('#check-answer'))return;const q=lesson.items[lesson.index];$('#check-answer').disabled=lesson.checked?false:q.kind==='speak'?lesson.repeats<2:q.kind==='write'?lesson.writing===null:!lesson.answer?.trim()||(q.kind==='listen'&&!lesson.heard)||(q.kind==='order'&&lesson.order.length!==q.tokens.length);}
function checkAnswer(){
 if(lesson.checked){if(lesson.index+1===lesson.items.length)return finishLesson();stopMedia();lesson.index++;showLesson();return}
 const q=lesson.items[lesson.index];const equal=normalize(lesson.answer||'')===normalize(q.answer);const ok=q.kind==='write'?lesson.writing:q.kind==='speak'||(equal&&(q.kind!=='match'||lesson.matchErrors===0));lesson.checked=true;lesson.results.push({question:q,correct:ok});if(ok){lesson.correct++;if(lesson.mode==='review')lesson.reviewed.push({...q,reviewed:true})}else lesson.wrong.push({...q,reviewed:false});
 document.querySelectorAll('[data-option]').forEach(b=>{const value=q.options[+b.dataset.option];b.disabled=true;b.classList.toggle('correct',value===q.answer);b.classList.toggle('incorrect',value===lesson.answer&&!ok);b.querySelector('.choice-state').textContent=value===q.answer?'正确':value===lesson.answer&&!ok?'错误':''});
 $('#feedback').innerHTML=`<div class="feedback ${ok?'success':'error'}"><strong>${icon(ok?'check':'book')} ${ok?q.kind==='speak'?'这次跟读完成了。':q.kind==='write'?'按笔顺写完了。':'答对了。':q.kind==='match'?'配对完成，错配的部分再记一次。' :q.kind==='write'?'下次再试着独立写。':'再记住一次。'}</strong><p>${esc(q.explain)}</p></div>`;$('#check-answer').innerHTML=(lesson.index+1===lesson.items.length?'完成这一组':'继续')+' '+icon('arrow');
}
async function finishLesson(){stopMedia();clearInterval(clockTimer);if(lesson.mode==='placement')return finishPlacement();if(!state.user)return finishGuestFoundation();const score=Math.round(lesson.correct/lesson.items.length*100);$('#app').innerHTML=`<div class="completion-page"><div class="completion-stamp">${icon(score>=80?'check':'review')}</div><h1>${score>=80?'这关通过！':'还差一点，再试一次'}</h1><p>${lesson.mode==='speak'?'已完成两遍跟读。可以再听示范，比较音拍和停顿。':score>=80?'本关已掌握，接着挑战下一关。':'正确率达到 80% 后，这一项记为掌握。'}</p><div class="result-stats"><div><b>${score}%</b><span>${lesson.mode==='speak'?'跟读完成率':lesson.mode==='foundation'?'练习通过率':'正确率'}</span></div><div><b>${lesson.correct}/${lesson.items.length}</b><span>${lesson.mode==='speak'?'已跟读示范数':'通过题数'}</span></div><div><b>${timeText(lesson.elapsed)}</b><span>学习用时</span></div></div>${lesson.assisted?'<p class="fine-print">本次使用了文字辅助，结果不代表独立听力能力。</p>':''}<p class="completion-tip">${lesson.mode==='speak'?'可再练一遍，比较自己和示范的音拍。':'听辨和书写会加入复习计划。未独立完成的题会优先出现。'}</p><p id="save-status" role="status">正在保存学习记录…</p><button class="btn primary full" id="back-home" disabled>回到学习 ${icon('arrow')}</button><button class="btn secondary full" id="retry-save" hidden>重试保存</button><button class="btn secondary full" id="repeat-lesson" hidden>再练一轮</button><button class="btn secondary full" id="next-foundation" hidden>下一节专项课</button></div>`;$('#back-home').onclick=()=>{lesson=null;navigate('home')};$('#retry-save').onclick=saveLesson;const {day,mode,items}=lesson;$('#repeat-lesson').onclick=()=>startLesson(day,mode,mode==='review'||mode==='assessment'?items:undefined);const next=foundations.find(item=>item.day===day+1);if(mode==='foundation'&&next)$('#next-foundation').onclick=()=>startLesson(next.day,'foundation');await saveLesson();}
async function saveLesson(){if(lesson.saving)return;lesson.saving=true;$('#retry-save').hidden=true;try{if(!lesson.progressSaved){await api('/progress',{event_id:lesson.eventId,day:lesson.day,mode:lesson.mode,score:Math.round(lesson.correct/lesson.items.length*100),seconds:lesson.elapsed});lesson.progressSaved=true;}if(!lesson.cardsSaved){await api('/cards',{event_id:lesson.eventId,items:lesson.results});lesson.cardsSaved=true;}const mistakes=[...lesson.wrong,...lesson.reviewed];if(mistakes.length)await api('/mistakes',{items:mistakes});await loadProgress();lesson.saved=true;$('#save-status').textContent='✓ 进度与复习安排已同步';$('#back-home').disabled=false;$('#repeat-lesson').hidden=false;$('#next-foundation').hidden=!$('#next-foundation').onclick;}catch(e){$('#save-status').textContent='尚未完整保存：'+e.message+' 请保留此页面并重试。';$('#retry-save').hidden=false;}finally{lesson.saving=false;}}
function finishGuestFoundation() {
 const score=Math.round(lesson.correct/lesson.items.length*100);
 lesson.saved=true;
 $('#app').innerHTML=`<main class="completion-page"><h1>五个元音练完了</h1><p>本轮通过率 ${score}%。现在可以再练一轮，或登录后进入专项课并保存记录。</p>
  <button class="btn primary full" id="guest-repeat">再练一轮</button><button class="btn secondary full" id="guest-login">登录 / 注册</button>
  <button class="text-button" id="guest-home">返回学习首页</button></main>`;
 $('#guest-repeat').onclick=()=>startLesson(1101,'foundation');
 $('#guest-login').onclick=()=>{guestFoundation=lesson;navigate('home');action('login');};
 $('#guest-home').onclick=()=>navigate('home');
}
function finishPlacement(){const n5=lesson.results.slice(0,6).filter(x=>x.correct).length,n4=lesson.results.slice(6).filter(x=>x.correct).length,recommended=n5<5?'n5':n4<5?'n4':'n3',course=courses.find(x=>x.id===recommended);lesson.saved=true;$('#app').innerHTML=`<div class="completion-page"><div class="completion-stamp">${icon('path')}</div><h1>建议从 ${course.from} → ${course.to} 开始。</h1><p>N5 基础 ${n5}/6 · N4 基础 ${n4}/6</p><div class="native-tip"><p>${course.outcome}</p></div><p class="fine-print">这是简短的文字自查，未评估听力与口语。建议按实际学习体验调整起点。</p><button class="btn primary full" id="accept-placement">采用这个起点 ${icon('arrow')}</button><button class="btn secondary full" id="choose-placement">自己选择</button></div>`;$('#accept-placement').onclick=()=>{lesson=null;chooseCourse(recommended)};$('#choose-placement').onclick=()=>{lesson=null;navigate('choose')};}
function exitLesson(){stopMedia();clearInterval(clockTimer);lesson=null;navigate('home');toast('已退出。完成整组后会保存进度与复习安排。');}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.auth)action('close-auth');if(state.auth&&e.key==='Tab'){const items=[...document.querySelectorAll('.auth-modal button,.auth-modal input')].filter(x=>!x.disabled),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}if(!state.auth&&lesson&&e.key==='Enter'&&!e.isComposing&&$('#check-answer')&&!$('#check-answer').disabled&&!['BUTTON','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();checkAnswer()}});
window.addEventListener('beforeunload',e=>{if(lesson&&!lesson.saved){e.preventDefault();e.returnValue=''}});
async function refreshLearning(initial=false) {
 state.loading=true;state.offline=false;render();
 try {
  const [config,auth]=await Promise.all([api('/config'),api('/auth/me')]);
  state.config=config;state.user=auth.user;
  if(state.user){await loadProgress();if(initial)state.page='home';}
 } catch {state.offline=true;}
 finally {state.loading=false;render();}
}
await refreshLearning(true);
