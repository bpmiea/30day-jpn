import {courses, courseLessons, modes, foundations} from './curriculum.js';
import {icon} from './icons.js';

const escape = text => String(text).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

export function pathHome(context) {
  const {state, currentLesson, done, completeLesson, todayMinutes, dueCards} = context;
  const lesson = currentLesson();
  const course = courses.find(item => item.id === state.courseId);
  const lessons = courseLessons(course.id);
  const completed = modes.filter(mode => done(lesson.day, mode.id)).length;
  const activeMode = modes.find(mode => !done(lesson.day, mode.id));
  const mastered = lessons.filter(item => completeLesson(item.day)).length;
  const nextLesson = lessons[lesson.index];
  const minutes = todayMinutes();
  const due = dueCards().length;
  const nextFoundation = foundations.find(item => !done(item.day, 'foundation')) || foundations[0];

  return `
    <div class="learning-layout">
      <div class="learning-main">
        <div class="journey-heading">
          <button class="route-switch tonal-button" data-nav="choose"
            aria-label="切换路线，当前 ${course.from} 到 ${course.to}">
            ${icon('path')} ${course.from} → ${course.to} ${icon('chevronDown')}
          </button>
          <button class="route-catalog text-button" data-nav="courses">全部课程 ${icon('arrow')}</button>
        </div>
        <section class="unit-banner" aria-labelledby="lesson-title">
          <div>
            <div class="eyebrow">第 ${lesson.unit} 单元 · 第 ${lesson.index} 课</div>
            <h1 id="lesson-title">${escape(lesson.kanaLesson ? lesson.sentence : lesson.title)}</h1>
            <p>${lesson.kanaLesson ? '认识假名，听准每一个音' : escape(lesson.grammar)}</p>
          </div>
          <button class="outline-button" data-day-detail="${lesson.day}">${icon('book')} 课程笔记</button>
        </section>
        ${course.id === 'n5' ? `<section class="foundation-entry surface-card">
          <span class="card-icon">${icon('pen')}</span>
          <div><h2>读写入门专项</h2><p>${escape(nextFoundation.title)} · 听音、手写、跟读</p></div>
          <button class="tonal-button" data-foundation="${nextFoundation.day}">${nextFoundation.day === 1101 ? '试学' : '继续专项'} ${icon('arrow')}</button>
        </section>` : ''}
        <section aria-labelledby="practice-title">
          <div class="path-heading section-title">
            <h2 id="practice-title">本课练习</h2>
            <span>${completed} / ${modes.length} 已掌握</span>
          </div>
          <ol class="learning-path">
            ${modes.map(mode => {
              const passed = done(lesson.day, mode.id);
              const current = activeMode === mode;
              const status = passed ? '已掌握' : current ? '开始' : '待解锁';
              return `
                <li class="path-stop ${passed ? 'completed' : current ? 'current' : 'upcoming'}">
                  <button class="path-node" data-lesson="${mode.id}" data-day="${lesson.day}"
                    ${current ? 'aria-current="step"' : ''} ${!passed && !current ? 'disabled' : ''}>
                    <span class="node-icon">${icon(mode.icon)}</span>
                    <span class="node-caption"><b>${mode.name}</b><small>${mode.desc} · ${mode.minutes} 分钟</small></span>
                    <span class="node-status">${status} ${icon(passed ? 'check' : current ? 'arrow' : 'lock')}</span>
                  </button>
                </li>`;
            }).join('')}
          </ol>
        </section>
        ${nextLesson ? `
          <button class="next-unit-peek" data-day-detail="${nextLesson.day}">
            <span>下一课</span><b>${escape(nextLesson.title)}</b>${icon('arrow')}
          </button>` : ''}
      </div>
      <aside class="learning-aside" aria-label="目标与复习">
        <section class="daily-quest surface-card">
          <div class="card-title"><span class="card-icon">${icon('clock')}</span><h2>今日目标</h2>
            <button class="icon-button" data-nav="profile" aria-label="调整每日学习目标">${icon('arrow')}</button>
          </div>
          <div class="quest-value"><strong>${minutes}</strong><span> / ${state.dailyGoal} 分钟</span></div>
          <progress max="${state.dailyGoal}" value="${minutes}" aria-label="今日目标完成进度"></progress>
        </section>
        <section class="lesson-ticket surface-card">
          <div class="card-title"><span class="card-icon">${icon('check')}</span><h2>路线进度</h2></div>
          <p>已掌握 ${mastered} / ${lessons.length} 课</p>
          <progress max="${lessons.length}" value="${mastered}" aria-label="课程掌握进度"></progress>
        </section>
        <button class="review-nudge surface-card" data-nav="review">
          <span class="card-icon">${icon('review')}</span>
          <span><b>${due ? `${due} 道题该复习了` : '复习计划'}</b>
          <small>${due ? '查看到期练习' : '按记忆情况安排练习'}</small></span>
          ${icon('arrow')}
        </button>
        ${!state.user ? '<div class="signin-note"><p>登录后同步学习与复习记录。</p><button class="outline-button" data-action="login">登录 / 注册</button></div>' : ''}
      </aside>
    </div>`;
}
