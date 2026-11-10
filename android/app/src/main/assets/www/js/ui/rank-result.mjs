import { grades, rankForScore, ranks, rankThreshold } from '../rules/ranks.mjs';
import { rankBadge } from './rank-panel.mjs?v=169';

const nextTarget = rank => rank.nextAt ?? rankThreshold(rank.rank, rank.grade);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function emblem(rank, stars = rank.grade + 1) {
  const info = ranks[rank.rank];
  return `<div class="rank-result-emblem">${rankBadge(info, stars)}
    <h3>${info.name}・${grades[rank.grade]}</h3></div>`;
}

export function rankResultView(score, delta) {
  const start = score - delta;
  const before = rankForScore(start);
  return `<aside class="rank-result" aria-label="段位结算" aria-hidden="true">
    <small>段位结算</small>
    <div class="rank-result-stage">${emblem(before)}</div>
    <div class="rank-result-points"><strong>${start}</strong><span> / ${nextTarget(before)}</span></div>
    <div class="rank-result-delta${delta < 0 ? ' loss' : ''}">${delta > 0 ? '+' : ''}${delta} 分</div>
    <div class="rank-result-message" aria-live="polite"></div>
  </aside>`;
}

function countTo(label, start, end) {
  if (start === end) return Promise.resolve();
  return new Promise(resolve => {
    const began = performance.now();
    function frame(now) {
      if (!label.isConnected) return resolve();
      const progress = Math.min(1, (now - began) / 640);
      label.textContent = Math.round(end + (start - end) * (1 - progress) ** 2);
      if (progress < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

async function animateStars(emblem, from, to) {
  const stars = [...emblem.querySelectorAll('.rank-stars path')];
  const rising = to > from;
  const changed = rising ? stars.slice(from, to) : stars.slice(to, from).reverse();
  await Promise.all(changed.map(async (star, index) => {
    if (rising) star.classList.add('filled');
    await star.animate(rising ? [
      { opacity: .2, scale: .45, translate: '0 -10px' },
      { opacity: 1, scale: 1.28, translate: '0 0', offset: .67 },
      { opacity: 1, scale: 1, translate: '0 0' }
    ] : [
      { opacity: 1, scale: 1, translate: '0 0' },
      { opacity: 0, scale: .55, translate: '0 15px' }
    ], { duration: 250, delay: index * 65, fill: 'backwards', easing: 'ease-out' }).finished;
    if (!rising) star.classList.remove('filled');
  }));
  emblem.querySelector('.rank-stars').setAttribute('aria-label', `${to} 星`);
}

export async function animateRankResult(settlement, score, delta) {
  const panel = settlement.querySelector('.rank-result');
  const stage = panel.querySelector('.rank-result-stage');
  const points = panel.querySelector('.rank-result-points strong');
  const target = panel.querySelector('.rank-result-points span');
  const message = panel.querySelector('.rank-result-message');
  const start = score - delta;
  const before = rankForScore(start);
  const after = rankForScore(score);
  const direction = Math.sign(after.rank - before.rank);
  const gradeChange = after.grade - before.grade;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  await wait(500);
  if (!settlement.isConnected) return;
  settlement.classList.add('show-rank-result');
  panel.removeAttribute('aria-hidden');
  if (!reduce) {
    const shift = settlement.querySelector('.settlement-layout').getAnimations();
    await Promise.allSettled(shift.map(animation => animation.finished));
    if (!settlement.isConnected) return;
    await countTo(points, start, score);
  }
  if (!settlement.isConnected) return;
  points.textContent = score;
  target.textContent = ` / ${nextTarget(after)}`;
  if (direction || gradeChange) {
    message.textContent = direction ? (direction > 0 ? '升段' : '降段') : gradeChange > 0 ? '升星' : '掉星';
  }
  if (reduce) {
    stage.innerHTML = emblem(after);
    return;
  }

  let current = stage.firstElementChild;
  if (direction) {
    const enteringStars = direction > 0 ? 0 : grades.length;
    await animateStars(current, before.grade + 1, direction > 0 ? grades.length : 0);
    if (!settlement.isConnected) return;
    stage.insertAdjacentHTML('beforeend', emblem(after, enteringStars));
    const next = stage.lastElementChild;
    const timing = { duration: 320, easing: 'ease-in-out', fill: 'both' };
    await Promise.all([
      current.animate([{ transform: 'translateX(0)', opacity: 1 },
        { transform: `translateX(${-100 * direction}%)`, opacity: 0 }], timing).finished,
      next.animate([{ transform: `translateX(${100 * direction}%)`, opacity: 0 },
        { transform: 'translateX(0)', opacity: 1 }], timing).finished
    ]);
    current.remove();
    current = next;
    if (settlement.isConnected) await animateStars(current, enteringStars, after.grade + 1);
  } else if (gradeChange) {
    await animateStars(current, before.grade + 1, after.grade + 1);
  }
  current.querySelector('h3').textContent = `${ranks[after.rank].name}・${grades[after.grade]}`;
}
