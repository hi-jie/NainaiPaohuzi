import { chooseAction } from './ai/player.mjs?v=141';
import { setMusicPlaying, setMusicVolume } from './audio/music.mjs?v=208-cbe0bee8a6aa';
import { playAction, playEffect, setSoundEnabled, setSoundVolume, stopEffect, stopSound, unlockSound } from './audio/player.mjs?v=250';
import { pickTablemates } from './data/tablemates.mjs?v=179';
import { cutDeck, shuffledDeck } from './game/deck.mjs?v=17';
import { Round } from './game/state-machine.mjs?v=253';
import { MahjongRound } from './game/mahjong-round.mjs';
import { presets } from './rules/presets.mjs?v=250';
import { load, save } from './storage/save.mjs?v=250';
import { bindHandDrag } from './ui/hand-drag.mjs?v=254';
import { createHandLayout, moveHandCard, syncHandLayout } from './ui/hand.mjs?v=235';
import { animateAction, animateHandSort, animateTurnArrow, captureOfferMotion, openingStages, previewEat, renderEatChoices, showOpeningFrame, renderTable, showFinishedTable, showRoundResult } from './ui/table.mjs?v=253';
import { bindTutorial } from './ui/tutorial.mjs?v=250';
import { bindProfile } from './ui/profile.mjs?v=202';
import { bindAppUpdate } from './ui/update.mjs?v=252';

const main = document.querySelector('main');
const home = document.querySelector('#home');
const setup = document.querySelector('#round-setup');
const table = document.querySelector('#table');
const pauseMenu = document.querySelector('#pause-menu');
const leaveMenu = document.querySelector('#leave-menu');
const resumeMenu = document.querySelector('#resume-menu');
const eatMenu = document.querySelector('#eat-menu');
const startButton = document.querySelector('#start');
const profilePage = document.querySelector('#profile');
const profileButton = document.querySelector('#open-profile');
const scoreRecords = profilePage.querySelector('.score-records');
const profileStatus = profilePage.querySelector('#profile-status');
const scoreResetDialog = document.querySelector('#score-reset-dialog');
const scoreResetTitle = scoreResetDialog.querySelector('#score-reset-title');
const confirmScoreReset = scoreResetDialog.querySelector('#confirm-score-reset');
const settings = document.querySelector('#settings');
const settingsButton = document.querySelector('#open-settings');
bindAppUpdate();
const modeTitle = document.querySelector('#mode-title');
const modeScore = document.querySelector('#mode-score');
const seatPicker = document.querySelector('#mahjong-seats');
const paohuziOptions = document.querySelector('#paohuzi-options');
const meldVisibility = document.querySelector('#meld-visibility');
const openTutorial = bindTutorial(document.querySelector('#tutorial'));
const data = load();
const refreshProfile = bindProfile(profilePage, profileButton, document.querySelector('#nickname-dialog'), data.profile, profile => {
  save({ ...data, profile });
  data.profile = profile;
});
let mahjongSeats = data.settings.mahjongSeats ?? presets.mahjong.seats;
let selectedMode = data.settings.mode;
let round;
let handLayout = null;
let timer;
let openingEnds;
let musicWaitingForSound = data.settings.sound;

const modes = home.querySelector('.modes');
modes.innerHTML = Object.entries(presets).map(([key, { name }]) =>
  `<button type="button" class="primary" data-mode="${key}">${name}</button>`).join('');

const sharedControls = document.querySelector('#shared-setting-controls');
for (const panel of document.querySelectorAll('.shared-settings')) {
  panel.append(sharedControls.content.cloneNode(true));
}
function showSettingValue(field) {
  const value = data.settings[field.name];
  if (field.type === 'checkbox') {
    field.checked = value;
    if (field.name === 'openMelds') meldVisibility.textContent = value ? '明提明偎' : '暗提暗偎';
  } else {
    field.value = value;
    field.nextElementSibling.value = `${value}%`;
    field.setAttribute('aria-valuetext', `${value}%`);
  }
}

const settingFields = document.querySelectorAll('.menu-options input, #pause-menu input');
for (const field of settingFields) {
  showSettingValue(field);
  const isVolume = field.type === 'range';
  field.addEventListener(isVolume ? 'input' : 'change', () => {
    const value = isVolume ? field.valueAsNumber : field.checked;
    data.settings[field.name] = value;
    for (const input of settingFields) {
      if (input.name === field.name) showSettingValue(input);
    }
    save(data);
    if (field.name === 'musicVolume') setMusicVolume(value / 100);
    if (field.name === 'soundVolume') setSoundVolume(value / 100);
    if (field.name === 'music' || field.name === 'sound') syncMusic();
    if (field.name === 'sound') {
      setSoundEnabled(value);
      if (value) unlockSound();
    }
  });
}
setMusicVolume(data.settings.musicVolume / 100);
setSoundVolume(data.settings.soundVolume / 100);
modes.addEventListener('click', ({ target }) => {
  if (target.dataset.mode) showSetup(target.dataset.mode);
});
seatPicker.addEventListener('click', ({ target }) => {
  if (!target.dataset.seats) return;
  mahjongSeats = Number(target.dataset.seats);
  updateSeatPicker();
});
settingsButton.addEventListener('click', () => showFront(settings, settings.querySelector('[data-back-home]')));
document.querySelector('#exit-game').addEventListener('click', () => { location.href = 'paohuzi://exit'; });
settings.querySelector('[data-back-home]').addEventListener('click', () => showHome(settingsButton));
setup.querySelector('[data-back-home]').addEventListener('click', () => showHome());
document.querySelector('#setup-tutorial').addEventListener('click', () => openTutorial(selectedMode));
document.querySelector('#pause-tutorial').addEventListener('click', () => openTutorial(round.rules.mode));
profileButton.addEventListener('click', () => {
  scoreRecords.innerHTML = Object.entries(presets).map(([mode, { name }]) =>
    `<li class="record-entry">
      <dl class="record-card"><dt>${name}</dt><dd class="record-score"><strong>${data.scores[mode]}</strong> 分</dd></dl>
      <button class="record-reset" type="button" data-reset-mode="${mode}" aria-label="${name}积分清零" aria-haspopup="dialog">
        <svg class="nav-icon" aria-hidden="true"><use href="#icon-refresh"/></svg>清零
      </button>
    </li>`).join('');
  refreshProfile();
  showFront(profilePage, profilePage.querySelector('[data-back-home]'));
});
scoreRecords.addEventListener('click', ({ target }) => {
  const button = target.closest('[data-reset-mode]');
  if (!button) return;
  const mode = button.dataset.resetMode;
  scoreResetTitle.textContent = `清零${presets[mode].name}积分？`;
  confirmScoreReset.value = mode;
  scoreResetDialog.returnValue = '';
  scoreResetDialog.showModal();
});
scoreResetDialog.addEventListener('close', () => {
  const mode = scoreResetDialog.returnValue;
  if (!Object.hasOwn(presets, mode)) return;
  const scores = { ...data.scores, [mode]: 0 };
  try {
    save({ ...data, scores });
    data.scores = scores;
    scoreRecords.querySelector(`[data-reset-mode="${mode}"]`).closest('.record-entry')
      .querySelector('.record-score strong').textContent = '0';
    profileStatus.textContent = '';
  } catch {
    profileStatus.textContent = '积分清零失败';
  }
});
profilePage.querySelector('[data-back-home]').addEventListener('click', () => showHome(profileButton));

function syncMusic() {
  setMusicPlaying(data.settings.music && (!data.settings.sound || !musicWaitingForSound));
}

if (musicWaitingForSound) {
  setSoundEnabled(true).then(() => {
    musicWaitingForSound = false;
    syncMusic();
  });
}
syncMusic();
document.addEventListener('click', () => {
  if (data.settings.sound) unlockSound();
}, { capture: true, once: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopSound();
});
window.addEventListener('blur', stopSound);
window.addEventListener('pagehide', stopSound);
window.addEventListener('paohuzi-foreground-change', () => {
  if (!window.paohuziForeground) stopSound();
});

function showFront(screen, focus) {
  table.hidden = true;
  for (const page of [home, setup, settings, profilePage]) page.hidden = page !== screen;
  focus.focus({ preventScroll: true });
}

function showHome(focus = modes.querySelector(`[data-mode="${selectedMode}"]`)) {
  stopSound();
  showFront(home, focus);
}

function showSetup(mode) {
  selectedMode = mode;
  modeTitle.textContent = presets[mode].name;
  modeScore.textContent = data.scores[mode];
  seatPicker.hidden = mode !== 'mahjong';
  paohuziOptions.hidden = mode === 'mahjong';
  updateSeatPicker();
  showFront(setup, startButton);
}

function updateSeatPicker() {
  for (const button of seatPicker.children) {
    button.setAttribute('aria-pressed', Number(button.dataset.seats) === mahjongSeats);
  }
}

function saveRound(keep = round.phase !== 'finished') {
  data.round = keep ? { state: round.toSave(), handLayout } : null;
  save(data);
}

function paintRound(event, motion, action) {
  const previousSeat = table.querySelector('.turn-arrow')?.dataset.seat;
  table.innerHTML = renderTable(round, data.scores[round.rules.mode], event, '', handLayout, data.profile);
  animateTurnArrow(table.querySelector('.turn-arrow'), previousSeat);
  if (event || motion) animateAction(table, round, event, motion, action);
}

function showRound(event, motion, action) {
  const score = data.scores[round.rules.mode];
  if (round.phase === 'finished') {
    showFinishedTable(table, round, score, event, data.profile);
    timer = setTimeout(() => showRoundResult(table, round, score, data.profile), 2200);
  } else {
    paintRound(event, motion, action);
    scheduleTurn();
  }

  const callout = table.querySelector('.callout');
  if (!callout) return;
  const playImpact = () => { if (round.rules.sound) playEffect('impact'); };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    playImpact();
  } else {
    callout.addEventListener('animationend', playImpact, { once: true });
  }
}

function layoutScale(width, height) {
  return Math.min(width / 864, height / 480);
}

new ResizeObserver(([{ contentRect: { width, height } }]) => {
  if (!width || !height) return;
  const scale = layoutScale(width, height);
  main.style.setProperty('--front-scale', scale);
  main.style.setProperty('--front-width', `${width / scale}px`);
  main.style.setProperty('--front-height', `${height / scale}px`);
}).observe(main);

function fitTable() {
  if (table.hidden) return;
  const { clientWidth: width, clientHeight: height } = table;
  const scale = layoutScale(width, height);
  table.style.setProperty('--table-scale', scale);
  table.style.setProperty('--table-width', `${width / scale}px`);
  table.style.setProperty('--table-height', `${height / scale}px`);
  if (eatMenu.open) placeEatMenu();
}

new ResizeObserver(fitTable).observe(table);

function scheduleTurn() {
  const action = round.options[0];
  if (!action || (round.seat === 0 && !action.forced)) return;
  if (round.phase === 'last-draw') {
    timer = setTimeout(() => step(action), 1200);
    return;
  }
  const [minimum, maximum] = round.phase === 'discard' ? [1800, 3500]
    : round.phase === 'draw' ? [950, 1600] : [1150, 1800];
  const delay = action.forced ? 650 : minimum + Math.random() * (maximum - minimum);
  timer = setTimeout(() => step(action.forced ? action : chooseAction(round)), delay);
}

function beginPlay() {
  stopEffect();
  const from = table.querySelector('.opening .landing .card')?.getBoundingClientRect();
  const motion = from ? { offer: { source: round.dealer, card: round.opening, kind: 'opening' }, from } : null;
  round.revealOpening();
  saveRound();
  showRound(null, motion);
}

function scheduleOpening(stageIndex, delay) {
  timer = setTimeout(() => {
    if (stageIndex + 1 === openingStages.length) beginPlay();
    else showOpening(stageIndex + 1);
  }, delay);
}

function showOpening(stageIndex) {
  const { name, duration } = openingStages[stageIndex];
  const command = document.activeElement.closest('.opening button')?.dataset.command ?? 'skip-opening';
  const dealDelays = showOpeningFrame(table, round, data.scores[round.rules.mode], name, data.profile);
  if (name === 'shuffle' && data.settings.sound) playEffect('shuffle');
  if (name === 'deal' && data.settings.sound) playEffect('card', dealDelays);
  table.querySelector(`[data-command="${command}"]`).focus({ preventScroll: true });
  openingEnds = performance.now() + duration;
  scheduleOpening(stageIndex, duration);
}

function resumeRound() {
  const opening = table.querySelector('.opening');
  if (opening) {
    const stageIndex = openingStages.findIndex(({ name }) => name === opening.dataset.stage);
    scheduleOpening(stageIndex, Math.max(0, openingEnds - performance.now()));
  } else {
    scheduleTurn();
  }
}

function showTable() {
  home.hidden = true;
  setup.hidden = true;
  table.hidden = false;
  fitTable();
  syncMusic();
}

function start(dealer, tablemates) {
  stopSound();
  const mahjong = data.settings.mode === 'mahjong';
  const seats = mahjong ? mahjongSeats : presets[data.settings.mode].seats;
  const Game = mahjong ? MahjongRound : Round;
  const deck = cutDeck(shuffledDeck(Math.random), Math.random);
  round = new Game(data.settings, dealer ?? Math.floor(Math.random() * seats), Math.random, deck, { deferOpening: true });
  round.tablemates = tablemates ?? pickTablemates(seats - 1);
  handLayout = null;
  saveRound();
  showTable();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) beginPlay();
  else showOpening(0);
}

function continueSavedRound() {
  const state = data.round.state;
  const Game = state.rules.mode === 'mahjong' ? MahjongRound : Round;
  round = Game.fromSave(state);
  selectedMode = round.rules.mode;
  data.settings.mode = selectedMode;
  if (selectedMode === 'mahjong') {
    mahjongSeats = round.rules.seats;
    data.settings.mahjongSeats = mahjongSeats;
  }
  round.rules.sound = data.settings.sound;
  handLayout = data.round.handLayout;
  const needsTablemates = !round.tablemates;
  if (needsTablemates) round.tablemates = pickTablemates(round.players.length - 1);
  if (needsTablemates || round.phase === 'finished') saveRound();
  showTable();
  if (round.openingHand) beginPlay();
  else showRound();
}

function step(action) {
  const before = round.events.length;
  const seat = round.seat;
  const motion = captureOfferMotion(table, round);
  const usedCards = handLayout && seat === 0
    ? [...table.querySelectorAll('.hand :is([aria-pressed="true"], .eat-preview, .hinted)[data-hand-card]')]
    : [];
  round.act(action);
  if (handLayout) {
    handLayout = syncHandLayout(handLayout, round.players[0].hand, round.rules.patterns,
      new Set(usedCards.map(card => Number(card.dataset.handCard))), round.rules.mode === 'mahjong');
  }
  const event = round.events.length > before ? round.events.at(-1) : null;
  if (round.phase === 'finished') {
    data.scores[round.rules.mode] += round.result.delta[0];
  }
  saveRound();
  const soundEvent = action.type === '过' ? { type: '过', seat } : event;
  if (soundEvent && round.rules.sound) playAction(soundEvent, round);
  showRound(event, motion, action);
}

function selectDiscard(button) {
  table.querySelector('[data-select-card][aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-pressed', 'true');
  const confirm = table.querySelector('[data-command="discard"]');
  confirm.disabled = false;
  confirm.classList.add('guided');
}

function placeEatMenu() {
  const scale = Number(table.style.getPropertyValue('--table-scale'));
  const frame = table.parentElement.getBoundingClientRect();
  const button = table.querySelector('.hand-actions button').getBoundingClientRect();
  const portrait = matchMedia('(orientation: portrait)').matches;
  const left = portrait ? button.top - frame.top : button.left - frame.left;
  const bottom = portrait ? frame.right - button.left : button.bottom - frame.top;
  eatMenu.style.setProperty('--eat-right', `${left - 10 * scale}px`);
  eatMenu.style.setProperty('--eat-bottom', `${bottom}px`);
  eatMenu.style.setProperty('--eat-scale', Math.max(1, scale));
  const choices = eatMenu.querySelector('.eat-choices');
  const scrollTop = choices.scrollTop;
  eatMenu.classList.remove('two-columns', 'scroll-choices');
  if (choices.scrollHeight <= choices.clientHeight) return;
  eatMenu.classList.add('two-columns');
  if (choices.scrollHeight > choices.clientHeight) {
    eatMenu.classList.add('scroll-choices');
    choices.scrollTop = scrollTop;
  }
}

function updateEatSelection(choice) {
  if (choice) {
    const { patterns } = round.rules;
    const layout = handLayout ?? createHandLayout(round.players[0].hand, patterns);
    previewEat(table, round.options[Number(choice.dataset.action)], layout, patterns);
  } else {
    previewEat(table);
  }
  const button = table.querySelector('[data-command="choose-eat"]');
  button.textContent = choice ? '确认吃' : '选择吃法';
  if (choice) button.removeAttribute('aria-haspopup');
}

function setHandLayout(layout, selectedId) {
  handLayout = layout;
  saveRound();
  paintRound();
  if (selectedId !== undefined) {
    selectDiscard(table.querySelector(`[data-hand-card="${selectedId}"][data-select-card]`));
  }
  if (eatMenu.open) updateEatSelection(eatMenu.querySelector('.eat-choice[aria-pressed="true"]'));
}

bindHandDrag(table, {
  onStart: () => clearTimeout(timer),
  onDrop(source, target) {
    const layout = handLayout ?? createHandLayout(round.players[0].hand, round.rules.patterns, round.rules.mode === 'mahjong');
    const moved = moveHandCard(layout, source, target);
    if (moved !== layout) {
      setHandLayout(moved, table.querySelector('[data-select-card][aria-pressed="true"]')?.dataset.handCard);
    }
  },
  onEnd: scheduleTurn
});

startButton.addEventListener('click', () => {
  data.settings.mode = selectedMode;
  if (selectedMode === 'mahjong') data.settings.mahjongSeats = mahjongSeats;
  start();
});
for (const type of ['selectstart', 'contextmenu']) {
  table.addEventListener(type, event => {
    if (event.target.closest('[data-hand-card]')) event.preventDefault();
  });
}
table.addEventListener('click', ({ target }) => {
  const button = target.closest('button');
  if (!button) return;
  if (button.dataset.command === 'auto-hand') {
    animateHandSort(table, () => setHandLayout(null));
    return;
  }
  if (button.dataset.command === 'choose-eat') {
    if (eatMenu.open) {
      const choice = eatMenu.querySelector('.eat-choice[aria-pressed="true"]');
      eatMenu.close();
      if (choice) step(round.options[Number(choice.dataset.action)]);
    } else {
      eatMenu.innerHTML = renderEatChoices(round.options, round.offer.card);
      eatMenu.show();
      updateEatSelection(null);
      placeEatMenu();
    }
    return;
  }
  eatMenu.close();
  clearTimeout(timer);
  if (button.dataset.command === 'home') {
    showHome();
  } else if (button.dataset.command === 'skip-opening') {
    beginPlay();
  } else if (button.dataset.command === 'leave') {
    leaveMenu.returnValue = '';
    leaveMenu.showModal();
  } else if (button.dataset.command === 'pause') {
    pauseMenu.showModal();
  } else if (button.dataset.command === 'again') {
    start(round.result.nextDealer ?? round.result.winner ?? round.dealer, round.tablemates);
  } else if (button.dataset.command === 'review-round' || button.dataset.command === 'return-to-result') {
    const review = button.dataset.command === 'review-round';
    const back = table.querySelector('[data-command="return-to-result"]');
    table.querySelector('.settlement').hidden = review;
    table.querySelector('.felt').inert = !review;
    back.hidden = !review;
    (review ? back : table.querySelector('[data-command="review-round"]')).focus({ preventScroll: true });
  } else if (button.dataset.selectCard !== undefined) {
    selectDiscard(button);
  } else if (button.dataset.command === 'discard') {
    const selected = table.querySelector('[data-select-card][aria-pressed="true"]');
    step(round.options[Number(selected.dataset.selectCard)]);
  } else {
    step(round.options[Number(button.dataset.action)]);
  }
});
eatMenu.addEventListener('click', ({ target }) => {
  const choice = target.closest('.eat-choice');
  if (!choice) return;
  eatMenu.querySelector('.eat-choice[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
  choice.setAttribute('aria-pressed', 'true');
  updateEatSelection(choice);
});
document.addEventListener('click', ({ target }) => {
  syncMusic();
  if (eatMenu.open && !eatMenu.contains(target) && !target.closest('[data-command="choose-eat"]')) eatMenu.close();
  const button = target.closest('button:not(:disabled)');
  if (!data.settings.sound || !button || button.matches('[data-command="discard"], [data-action], [data-select-card], .eat-choice')) return;
  const selection = button.matches('[data-mode], [data-seats]');
  playEffect(selection ? 'select' : 'button');
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !eatMenu.open) return;
  event.preventDefault();
  eatMenu.close();
  table.querySelector('[data-command="choose-eat"]').focus({ preventScroll: true });
});
eatMenu.addEventListener('close', () => {
  if (eatMenu.open) return;
  previewEat(table);
  const button = table.querySelector('[data-command="choose-eat"]');
  if (button) {
    button.textContent = '吃';
    button.setAttribute('aria-haspopup', 'dialog');
  }
});
pauseMenu.addEventListener('close', () => {
  round.rules.sound = data.settings.sound;
  resumeRound();
});
leaveMenu.addEventListener('close', () => {
  if (leaveMenu.returnValue === 'discard') {
    saveRound(false);
    showHome();
  } else resumeRound();
});
resumeMenu.addEventListener('close', () => {
  if (resumeMenu.returnValue === 'resume') continueSavedRound();
  else {
    saveRound(false);
    showHome();
  }
});
if (data.round) resumeMenu.showModal();
