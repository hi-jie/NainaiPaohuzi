import { grades, rankForScore, ranks, rankThreshold } from '../rules/ranks.mjs';

export function rankBadge({ mark, color }, stars) {
  return `<span class="rank-insignia" style="--rank-color:${color}">
    <svg class="rank-badge" viewBox="0 0 100 100" aria-hidden="true">
    <path class="rank-badge-rays" d="M50 2 59 18 78 10 79 30 98 38 85 50 98 62 78 69 78 90 59 82 50 98 41 82 22 90 22 69 2 62 15 50 2 38 21 30 22 10 41 18Z"/>
    <path class="rank-badge-face" d="M50 10 82 28 82 62 70 79 50 91 30 79 18 62 18 28Z"/>
    <path class="rank-badge-trim" d="M50 17 75 32 75 60 65 74 50 83 35 74 25 60 25 32Z"/>
    <text x="50" y="53" text-anchor="middle" dominant-baseline="central">${mark}</text>
    </svg>
    <svg class="rank-stars" viewBox="0 0 90 25" role="img" aria-label="${stars} 星">
      ${[[16, 9], [45, 15], [74, 9]].map(([x, y], index) =>
        `<path${index < stars ? ' class="filled"' : ''} transform="translate(${x} ${y})"
          d="M0-7 2.1-2.3 7.2-1.8 3.4 1.6 4.5 6.8 0 4.1-4.5 6.8-3.4 1.6-7.2-1.8-2.1-2.3Z"/>`).join('')}
    </svg>
  </span>`;
}

export function bindRankPanel(panel) {
  const track = panel.querySelector('.rank-track');
  const axis = panel.querySelector('.rank-axis');
  const portrait = matchMedia('(orientation: portrait)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let selected = 0;
  let width = 0;
  let step = 0;
  let drag;

  function measure() {
    width = track.clientWidth;
    step = (track.scrollWidth - width) / (ranks.length - 1);
  }

  function updateAxis() {
    const page = track.scrollLeft / step;
    selected = Math.round(page);
    axis.style.setProperty('--rank-progress', `${100 * page / (ranks.length - 1)}%`);
  }

  function goTo(index, behavior = reducedMotion.matches ? 'instant' : 'smooth') {
    const rank = Math.max(0, Math.min(index, ranks.length - 1));
    track.scrollTo({ left: rank * step, behavior });
  }

  track.addEventListener('scroll', () => {
    if (step) updateAxis();
  });
  new ResizeObserver(() => {
    if (track.clientWidth && track.clientWidth !== width) {
      measure();
      goTo(selected, 'instant');
    }
  }).observe(track);

  track.addEventListener('keydown', event => {
    const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (direction) {
      event.preventDefault();
      goTo(selected + direction);
    }
  });

  const horizontal = event => portrait.matches ? event.clientY : event.clientX;
  track.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    drag = { start: horizontal(event), scroll: track.scrollLeft, rank: selected };
    track.classList.add('dragging-rank');
    track.setPointerCapture(event.pointerId);
  });
  track.addEventListener('pointermove', event => {
    if (drag) track.scrollLeft = drag.scroll + drag.start - horizontal(event);
  });
  track.addEventListener('lostpointercapture', () => {
    if (!drag) return;
    const distance = track.scrollLeft - drag.scroll;
    const rank = Math.abs(distance) >= Math.min(64, step * .16)
      ? drag.rank + Math.sign(distance) : drag.rank;
    drag = undefined;
    track.classList.remove('dragging-rank');
    goTo(rank);
  });

  return (score, peakScore) => {
    const current = rankForScore(score);
    const peak = rankForScore(peakScore);
    track.innerHTML = ranks.map((rank, index) => {
      const own = index === current.rank;
      const status = own ? 'current' : index <= peak.rank ? 'past' : 'locked';
      const label = own ? '当前段位' : index <= peak.rank ? '历史段位' : '未达段位';
      const stars = own ? current.grade + 1 : index < peak.rank ? grades.length : index === peak.rank ? peak.grade + 1 : 0;
      const target = own ? current.nextAt ?? rankThreshold(index, current.grade) : rankThreshold(index, 0);
      const title = own ? `${rank.name}・${grades[current.grade]}` : rank.name;
      const targetLabel = own && current.nextAt !== null ? '升级所需' : '段位所需';
      return `<section class="rank-slide" data-status="${status}" aria-label="${label}">
        ${rankBadge(rank, stars)}
        <h3>${title}</h3>
        <p class="rank-description">${rank.description}</p>
        <p class="rank-points" aria-label="当前积分 ${score}，${targetLabel} ${target} 积分"><strong>${score}</strong> / ${target}</p>
      </section>`;
    }).join('');
    measure();
    goTo(current.rank, 'instant');
    updateAxis();
  };
}
