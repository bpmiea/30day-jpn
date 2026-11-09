import {courses,courseLessons,modes} from './curriculum.js';
import {icon} from './icons.js';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Original sparrow companion; a small, local SVG rather than a borrowed mascot.
export function sparrow(){return `<svg class="sparrow" viewBox="0 0 150 145" fill="none" aria-hidden="true"><ellipse cx="76" cy="133" rx="42" ry="7" fill="#e9e5da"/><path d="m35 94-23 8 23 10" fill="#ad643e"/><path d="M51 118v13m9-1H45m47-12v13m-7-1h15" stroke="#a3663f" stroke-width="5" stroke-linecap="round"/><path d="M35 57c0-25 17-39 43-39 28 0 47 18 47 46v28c0 26-22 39-48 36-29-2-43-16-42-38Z" fill="#d99351"/><path d="M55 22 52 9l16 10m7 0L83 7l4 14" fill="#d99351"/><path d="M47 70c8-12 19-19 32-19 18 0 32 11 36 26v19c0 20-16 30-36 29-22-1-36-13-36-31Z" fill="#fff3db"/><path d="M39 72c-13 1-18 9-16 21 2 9 10 15 22 14" fill="#bd7744"/><path d="m113 78 15 5-14 7" fill="#f4b64b"/><ellipse cx="65" cy="57" rx="5" ry="6" fill="#49372d"/><ellipse cx="99" cy="57" rx="5" ry="6" fill="#49372d"/><circle cx="66" cy="55" r="1.4" fill="white"/><circle cx="100" cy="55" r="1.4" fill="white"/><path d="m74 68 8 7 8-7" fill="#e58b36"/><ellipse cx="53" cy="69" rx="8" ry="4" fill="#eeb17d"/><ellipse cx="109" cy="69" rx="8" ry="4" fill="#eeb17d"/><path d="m49 91 52-7 3 22-51 7Z" fill="#418a91"/><path d="m53 91 24 7 24-13M77 98l2 12" stroke="#b6e0d7" stroke-width="2"/><path d="M112 91c-5-4-14-1-15 6-1 6 6 11 12 9" fill="#bd7744"/></svg>`;}

export function pathHome(c){
 const {state,currentLesson,done,completeLesson,todayMinutes,dueCards}=c;
 const d=currentLesson(),course=courses.find(x=>x.id===state.courseId),lessons=courseLessons(course.id);
 const passed=modes.filter(m=>done(d.day,m.id)).length;
 const active=Math.max(0,modes.findIndex(m=>!done(d.day,m.id)));
 const titles=['认一认','读懂句子','听一听','开口说','动手写'];
 const subtitles=['声音和词义配对','句型与短文','听音选答案','跟读与录音','假名与字形'];
 const nextLesson=lessons[d.index];
 return `<section class="journey-heading"><button class="route-switch" data-nav="choose"><span class="route-level">${course.to}</span><b>${course.from} → ${course.to}</b><span class="chevron">⌄</span></button><button class="route-catalog" data-nav="courses">全部课程 ${icon('path')}</button></section>
 <section class="unit-banner"><div><span>第 ${d.unit} 单元 · 第 ${d.index} 课</span><h1>${escape(d.kanaLesson?d.sentence:d.title)}</h1><p>${d.kanaLesson?'认识假名，听准每一个音':'本课学习：'+escape(d.grammar)}</p></div><button data-day-detail="${d.day}" aria-label="本课学习笔记">${icon('book')}</button></section>
 <section class="daily-quest"><span class="quest-icon">${icon('clock')}</span><div><div><b>今日目标</b><span>${todayMinutes()} / ${state.dailyGoal} 分钟</span></div><div class="quest-track"><i style="width:${Math.min(todayMinutes()/state.dailyGoal,1)*100}%"></i></div></div><button data-nav="profile" aria-label="调整每日学习目标">${icon('arrow')}</button></section>
 <div class="path-heading"><h2>这一课，走五步</h2><span>${passed} / 5 已掌握</span></div>
 <section class="learning-path" aria-label="本课闯关路径">
  <svg class="path-line" viewBox="0 0 340 540" preserveAspectRatio="none" aria-hidden="true"><path d="M170 60C170 120 98 100 98 162S242 200 242 264 100 300 100 366s70 40 70 102"/></svg>
  ${modes.map((m,i)=>{const complete=done(d.day,m.id),current=i===active&&!complete;return `<div class="path-stop stop-${i} ${complete?'completed':current?'current':'upcoming'}">
   <div class="node-wrap">${current?'<span class="start-bubble">从这里开始</span>':''}<button class="path-node" data-lesson="${m.id}" data-day="${d.day}" ${!complete&&!current?'disabled':''} ${current?'aria-current="step"':''} aria-label="${titles[i]}，${complete?'已掌握，可复习':current?'开始练习':'完成前面的关卡后解锁'}">${icon(complete?'check':current?m.icon:'lock')}</button>${complete?'<span class="node-star">★</span>':''}</div>
   <div class="node-caption"><b>${titles[i]}</b><span>${subtitles[i]}</span><small>${complete?'已掌握':m.minutes+' 分钟'}</small></div>
  </div>`}).join('')}
  <div class="path-companion">${sparrow()}<span>あいうえお！</span></div>
 </section>
 <section class="lesson-ticket"><span class="ticket-icon">${icon(passed===5?'check':'star')}</span><div><b>${passed===5?'本课已掌握':'完成五步，集齐一枚课程章'}</b><p>${lessons.filter(x=>completeLesson(x.day)).length} / ${lessons.length} 枚 · ${course.to} 学习记录</p></div><span class="ticket-stamp">${course.symbol}</span></section>
 <button class="review-nudge" data-nav="review"><span class="review-symbol">${icon('review')}</span><div><b>${dueCards().length?`${dueCards().length} 道题该复习了`:'复习站'}</b><p>${dueCards().length?'花几分钟，把学过的再记牢。':'学过的字词，会按记忆情况安排复习。'}</p></div>${icon('arrow')}</button>
 ${nextLesson?`<button class="next-unit-peek" data-day-detail="${nextLesson.day}"><span>下一课</span><b>${escape(nextLesson.title)}</b>${icon('arrow')}</button>`:''}
 ${!state.user?'<div class="signin-note"><button data-action="login">登录 / 注册</button><span>保存闯关和复习进度</span></div>':''}`;
}
