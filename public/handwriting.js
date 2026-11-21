import paths from './learn/strokes/paths.js';
import {icon} from './icons.js';

const space = 'http://www.w3.org/2000/svg';
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const samples = 20;

function resample(points) {
  const lengths = [0];
  for (let index = 1; index < points.length; index++) {
    lengths.push(lengths[index - 1] + distance(points[index], points[index - 1]));
  }
  const total = lengths.at(-1);
  if (!total) return [];
  let segment = 1;
  return Array.from({length:samples}, (_, index) => {
    const target = total * index / (samples - 1);
    while (segment < lengths.length - 1 && lengths[segment] <= target) segment++;
    const from = points[segment - 1];
    const to = points[segment];
    const span = lengths[segment] - lengths[segment - 1];
    const part = span > 0 ? (target - lengths[segment - 1]) / span : 0;
    return {x:from.x + (to.x - from.x) * part, y:from.y + (to.y - from.y) * part};
  });
}

export function strokeMatches(points, reference) {
  const line = resample(points);
  if (!line.length) return false;
  const average = line.reduce((sum, point, index) => sum + distance(point, reference[index]), 0) / samples;
  const expectedLength = reference.slice(1).reduce((sum, point, index) => sum + distance(point, reference[index]), 0);
  const actualLength = line.slice(1).reduce((sum, point, index) => sum + distance(point, line[index]), 0);
  const reverseAverage = line.reduce((sum, point, index) => sum + distance(point, reference[samples-1-index]), 0) / samples;
  return average <= reverseAverage && actualLength >= expectedLength * .5 && actualLength <= expectedLength * 1.8
    && average <= 15 && distance(line[0], reference[0]) <= 21
    && distance(line.at(-1), reference.at(-1)) <= 21;
}

export function handwritingView() {
  return `
    <section class="handwriting-panel" aria-labelledby="writing-step">
      <div class="writing-heading"><h2 id="writing-step">描写练习</h2><span id="writing-counter"></span></div>
      <div id="writing-sequence" class="writing-sequence" aria-hidden="true"></div>
      <svg id="writing-board" viewBox="0 0 109 109" role="img" aria-label="手写练习板，用手指、触控笔或鼠标书写">
        <path class="writing-gridlines" d="M 54.5 0 V 109 M 0 54.5 H 109"/>
        <g id="writing-guide"></g><g id="writing-ink"></g>
      </svg>
      <p id="writing-status" role="status"></p>
      <div class="writing-controls">
        <button class="text-button" id="show-strokes">${icon('play')} 看笔顺</button>
        <button class="text-button" id="undo-stroke" disabled>撤销一笔</button>
        <button class="text-button" id="clear-canvas">重写本字</button>
        <button class="outline-button" id="writing-next" hidden>继续</button>
        <button class="text-button" id="retry-later">稍后再练</button>
      </div>
      <p class="fine-print"><a href="/learn/strokes/NOTICE.txt" target="_blank" rel="noopener">笔顺数据：KanjiVG</a></p>
    </section>`;
}

export function initHandwriting(answer, onComplete) {
  const glyphs = [...answer.normalize('NFKC')].filter(char => !/[\s。、！？!?]/u.test(char));
  const board = document.querySelector('#writing-board');
  const guide = document.querySelector('#writing-guide');
  const ink = document.querySelector('#writing-ink');
  const status = document.querySelector('#writing-status');
  const step = document.querySelector('#writing-step');
  const counter = document.querySelector('#writing-counter');
  const sequence = document.querySelector('#writing-sequence');
  const undo = document.querySelector('#undo-stroke');
  const clear = document.querySelector('#clear-canvas');
  const preview = document.querySelector('#show-strokes');
  const next = document.querySelector('#writing-next');
  const retry = document.querySelector('#retry-later');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let glyphIndex = 0, tracing = true, assisted = false, finished = false;
  let approved = [], reference = [], pointer = null;
  const draw = (name, parent, attributes) => {
    const element = document.createElementNS(space, name);
    Object.entries(attributes).forEach(([attr,value]) => element.setAttribute(attr,value));
    parent.append(element);
    return element;
  };

  function message(text) { status.textContent = text; }
  function clearGuide() {
    guide.getAnimations({subtree:true}).forEach(animation=>animation.cancel());
    guide.replaceChildren();
  }
  function showGuide() {
    clearGuide();
    if (!tracing || approved.length >= reference.length) return;
    for (const stroke of reference) guide.append(stroke.path);
    reference.forEach(({path}, index) => {
      path.classList.remove('preview-stroke');
      path.classList.toggle('current-stroke', index === approved.length);
    });
    const start = reference[approved.length].points[0];
    draw('circle', guide, {cx:start.x, cy:start.y, r:2.4, class:'stroke-start'});
  }
  function update() {
    const remaining = reference.length - approved.length;
    undo.disabled = !approved.length;
    next.hidden = remaining > 0;
    next.textContent = tracing
      ? glyphIndex + 1 === glyphs.length ? '开始默写' : '描写下一个字'
      : glyphIndex + 1 === glyphs.length ? '完成默写' : '默写下一个字';
    board.classList.toggle('writing-done', remaining===0);
    if (remaining) {
      message(tracing ? `从圆点起笔，描第 ${approved.length + 1} 笔。` : `已写 ${approved.length} 笔。按记忆继续写。`);
    } else {
      message(tracing ? '这个字描完了。' : '这个字写完了。');
    }
    showGuide();
  }
  function loadGlyph() {
    ink.replaceChildren();
    clearGuide();
    approved = [];
    step.textContent = tracing ? '第 1 轮 · 看着描写' : '第 2 轮 · 遮住字形默写';
    counter.textContent = `第 ${glyphIndex + 1} / ${glyphs.length} 字`;
    sequence.replaceChildren(...glyphs.map((char,index)=>{
      const glyph=document.createElement('span');
      glyph.lang='ja';
      glyph.textContent=tracing?char:index<glyphIndex?'✓':'□';
      if(index===glyphIndex) glyph.className='current-glyph';
      return glyph;
    }));
    reference = (paths[glyphs[glyphIndex]] || []).map(d => {
      const path = draw('path', guide, {d, class:'stroke-guide'});
      const length = path.getTotalLength();
      return {path, length, points:Array.from({length:samples}, (_,i)=>path.getPointAtLength(length*i/(samples-1)))};
    });
    if (!reference.length) {
      message('这个字的笔顺资料未收录，可以稍后再练。');
      preview.disabled = clear.disabled = true;
      return;
    }
    preview.disabled = clear.disabled = false;
    update();
  }
  function point(event) {
    const matrix = board.getScreenCTM();
    return new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
  }
  board.addEventListener('pointerdown', event => {
    if (finished || pointer || approved.length >= reference.length || event.button !== 0) return;
    if (!tracing) clearGuide();
    const start = point(event);
    const stroke = draw('polyline', ink, {class:'writing-stroke', points:`${start.x},${start.y}`});
    pointer = {id:event.pointerId, points:[start], stroke};
    board.setPointerCapture(event.pointerId);
  });
  board.addEventListener('pointermove', event => {
    if (pointer?.id !== event.pointerId) return;
    pointer.points.push(point(event));
    pointer.stroke.setAttribute('points', pointer.points.map(p => `${p.x},${p.y}`).join(' '));
  });
  board.addEventListener('pointerup', event => {
    if (pointer?.id !== event.pointerId) return;
    const {points,stroke} = pointer;
    pointer = null;
    points.push(point(event));
    if (!strokeMatches(points, reference[approved.length].points)) {
      stroke.remove();
      message(tracing ? '这一笔的位置、走向或长度还可以调整。请沿提示线重写。' : '这一笔和示范有些不同。试着重写，或点「看笔顺」。');
      return;
    }
    approved.push(stroke);
    update();
  });
  for (const eventName of ['pointercancel','lostpointercapture']) {
    board.addEventListener(eventName, event => {
      if (pointer?.id !== event.pointerId) return;
      pointer.stroke.remove();
      pointer = null;
    });
  }
  undo.onclick = () => { if(!pointer){approved.pop()?.remove();update();} };
  clear.onclick = () => { if(!pointer)loadGlyph(); };
  preview.onclick = () => {
    if (pointer || !reference.length) return;
    if (!tracing) {
      assisted = true;
      approved = [];
      ink.replaceChildren();
      undo.disabled = true;
      next.hidden = true;
    }
    clearGuide();
    reference.forEach(({path,length,points},index) => {
      guide.append(path);
      path.classList.remove('current-stroke');
      path.classList.add('preview-stroke');
      const marker=draw('text',guide,{x:Math.max(4,points[0].x-5),y:Math.max(8,points[0].y-4),class:'stroke-number'});
      marker.textContent=String(index+1);
      if (!reduceMotion) {
        path.animate([{strokeDasharray:`0 ${length}`},{strokeDasharray:`${length} ${length}`}],
          {duration:450,delay:index*480,fill:'backwards'});
        marker.animate([{opacity:0},{opacity:1}],{duration:150,delay:index*480,fill:'backwards'});
      }
    });
    message(tracing ? '观察每一笔的起点和方向。' : '看完后再重写这个字。这次会记录为提示后完成。');
  };
  function finish(success, text) {
    finished = true;
    [next,retry,preview,undo,clear].forEach(button => {button.disabled=true;});
    message(text);
    onComplete(success);
  }
  next.onclick = () => {
    if (pointer || approved.length !== reference.length) return;
    glyphIndex++;
    if (glyphIndex === glyphs.length) {
      if (!tracing) {finish(!assisted, assisted?'已看提示写完，下次试试独立写。':'两轮完成，可以核对这一题了。');return;}
      tracing = false;
      glyphIndex = 0;
    }
    loadGlyph();
    board.scrollIntoView({block:'nearest'});
  };
  retry.onclick = () => finish(false,'已标记为稍后再练，可以进入下一题。');
  loadGlyph();
}
