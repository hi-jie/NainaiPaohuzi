import { chooseAction } from './ai/player.mjs';
import { setMusicPlaying } from './audio/music.mjs?v=5-fbe4af7499ad';
import { playAction } from './audio/player.mjs';
import { cutDeck, shuffledDeck } from './game/deck.mjs?v=17';
import { Round } from './game/state-machine.mjs?v=19';
import { presets } from './rules/presets.mjs';
import { load, save } from './storage/save.mjs';
import { animateAction, openingStages, renderHistory, showOpeningFrame, renderTable } from './ui/table.mjs?v=24';

const home = document.querySelector('#home');
const table = document.querySelector('#table');
const history = document.querySelector('#discard-history');
const pauseMenu = document.querySelector('#pause-menu');
const startButton = document.querySelector('#start');
const score = document.querySelector('#score');
const settings = document.querySelector('#settings');
const data = load();
let round;
let timer;

const modes = settings.querySelector('.modes');
function showModes() {
  modes.innerHTML = Object.entries(presets).map(([key, { name }]) =>
    `<button type="button" data-mode="${key}" aria-pressed="${data.settings.mode === key}">${name}</button>`).join('');
}
showModes();
const settingFields = document.querySelectorAll('#settings input, #pause-menu input');
for (const field of settingFields) {
  field.checked = data.settings[field.name];
  field.addEventListener('change', () => {
    data.settings[field.name] = field.checked;
    for (const input of settingFields) {
      if (input.name === field.name) input.checked = field.checked;
    }
    save(data);
    if (field.name === 'music') setMusicPlaying(field.checked);
  });
}
modes.addEventListener('click', ({ target }) => {
  if (!target.dataset.mode) return;
  data.settings.mode = target.dataset.mode;
  save(data);
  showModes();
});
score.textContent = data.score;

function startMusic() {
  setMusicPlaying(data.settings.music);
}

startMusic();
document.addEventListener('click', startMusic, { once: true });

function showHome() {
  table.hidden = true;
  home.hidden = false;
  startButton.focus();
}

function showRound(event) {
  table.innerHTML = renderTable(round, data.score, event);
  if (event) animateAction(table, event);
  scheduleTurn();
}

function fitTable() {
  if (table.hidden) return;
  const { clientWidth: width, clientHeight: height } = table;
  const scale = Math.min(width / 864, height / 480);
  table.style.setProperty('--table-scale', scale);
  table.style.setProperty('--table-width', `${width / scale}px`);
  table.style.setProperty('--table-height', `${height / scale}px`);
}

new ResizeObserver(fitTable).observe(table);

function scheduleTurn() {
  if (round.phase !== 'finished' && round.seat !== 0) {
    const action = round.options[0];
    const thinking = round.phase === 'discard' ? 1450 : round.phase === 'draw' ? 950 : 1150;
    const delay = action.forced ? 650 : thinking + Math.random() * 650;
    timer = setTimeout(() => step(chooseAction(round)), delay);
  }
}

function beginPlay() {
  round.revealOpening();
  showRound();
}

function showOpening(stageIndex) {
  const command = document.activeElement.closest('.opening button')?.dataset.command ?? 'skip-opening';
  showOpeningFrame(table, round, data.score, openingStages[stageIndex].name);
  table.querySelector(`[data-command="${command}"]`).focus({ preventScroll: true });
  timer = setTimeout(() => {
    if (stageIndex + 1 === openingStages.length) beginPlay();
    else showOpening(stageIndex + 1);
  }, openingStages[stageIndex].duration);
}

function start(dealer = Math.floor(Math.random() * 3)) {
  const deck = cutDeck(shuffledDeck(Math.random), Math.random);
  round = new Round(data.settings, dealer, Math.random, deck, { deferOpening: true });
  home.hidden = true;
  table.hidden = false;
  fitTable();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) beginPlay();
  else showOpening(0);
  startMusic();
}

function step(action) {
  const before = round.events.length;
  round.act(action);
  const event = round.events.length > before ? round.events.at(-1) : null;
  if (event && round.rules.sound) playAction(event.type);
  if (round.phase === 'finished') {
    data.score += round.result.delta[0];
    save(data);
    score.textContent = data.score;
  }
  showRound(event);
}

function selectDiscard(button) {
  table.querySelector('[data-select-card][aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-pressed', 'true');
  const confirm = table.querySelector('[data-command="discard"]');
  confirm.disabled = false;
  confirm.classList.add('guided');
}

startButton.addEventListener('click', () => start());
table.addEventListener('click', ({ target }) => {
  const button = target.closest('button');
  if (!button) return;
  if (button.dataset.history !== undefined) {
    clearTimeout(timer);
    history.innerHTML = renderHistory(round, Number(button.dataset.history), button.dataset.view);
    history.showModal();
    return;
  }
  clearTimeout(timer);
  if (button.dataset.command === 'home') {
    showHome();
  } else if (button.dataset.command === 'skip-opening') {
    beginPlay();
  } else if (button.dataset.command === 'pause') {
    pauseMenu.returnValue = '';
    pauseMenu.showModal();
  } else if (button.dataset.command === 'again') {
    start(round.result.winner ?? round.dealer);
  } else if (button.dataset.selectCard !== undefined) {
    selectDiscard(button);
  } else if (button.dataset.command === 'discard') {
    const selected = table.querySelector('[data-select-card][aria-pressed="true"]');
    step(round.options[Number(selected.dataset.selectCard)]);
  } else if (button.dataset.command === 'eat') {
    step(round.options[Number(table.querySelector('.eat-picker').dataset.index)]);
  } else if (button.dataset.command === 'next-eat') {
    const picker = table.querySelector('.eat-picker');
    const count = round.options.length - 1;
    const index = (Number(picker.dataset.index) + 1) % count;
    table.innerHTML = renderTable(round, data.score, null, index);
    table.querySelector('[data-command="next-eat"]').focus();
  } else {
    step(round.options[Number(button.dataset.action)]);
  }
});
history.addEventListener('close', scheduleTurn);
pauseMenu.addEventListener('close', () => {
  if (pauseMenu.returnValue === 'home') {
    showHome();
    return;
  }
  const { autoStack, sound } = data.settings;
  round.rules.sound = sound;
  if (round.rules.autoStack !== autoStack) {
    round.rules.autoStack = autoStack;
    const eatIndex = Number(table.querySelector('.eat-picker')?.dataset.index ?? 0);
    const selected = table.querySelector('[data-select-card][aria-pressed="true"]')?.dataset.selectCard;
    table.innerHTML = renderTable(round, data.score, null, eatIndex);
    if (selected !== undefined) selectDiscard(table.querySelector(`[data-select-card="${selected}"]`));
    table.querySelector('[data-command="pause"]').focus();
  }
  scheduleTurn();
});
