import { chooseAction } from './ai/player.mjs';
import { playAction } from './audio/player.mjs';
import { Round } from './game/state-machine.mjs';
import { presets } from './rules/presets.mjs';
import { load, save } from './storage/save.mjs';
import { animateAction, renderHistory, renderTable } from './ui/table.mjs';

const home = document.querySelector('#home');
const table = document.querySelector('#table');
const history = document.querySelector('#discard-history');
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
for (const field of settings.querySelectorAll('input')) field.checked = data.settings[field.name];
modes.addEventListener('click', ({ target }) => {
  if (!target.dataset.mode) return;
  data.settings.mode = target.dataset.mode;
  save(data);
  showModes();
});
score.textContent = data.score;

settings.addEventListener('change', ({ target }) => {
  data.settings[target.name] = target.type === 'checkbox' ? target.checked : target.value;
  save(data);
});

function showRound(event) {
  table.innerHTML = renderTable(round, data.score, event);
  if (event) animateAction(table, event);
  scheduleTurn();
}

function fitTable() {
  if (table.hidden) return;
  const { clientWidth: width, clientHeight: height } = table;
  const wide = width > height * 1.2;
  table.classList.toggle('wide', wide);
  table.style.setProperty('--table-scale', Math.min(width / (wide ? 864 : 420), height / (wide ? 480 : 700)));
}

new ResizeObserver(fitTable).observe(table);

function scheduleTurn() {
  if (round.phase !== 'finished' && (round.seat !== 0 || round.options[0].forced)) {
    const action = round.options[0];
    const thinking = round.phase === 'discard' ? 1450 : round.phase === 'draw' ? 950 : 1150;
    const delay = action.forced ? 650 : thinking + Math.random() * 650;
    timer = setTimeout(() => step(chooseAction(round)), delay);
  }
}

function start(dealer = Math.floor(Math.random() * 3)) {
  round = new Round(data.settings, dealer);
  home.hidden = true;
  table.hidden = false;
  fitTable();
  showRound();
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

document.querySelector('#start').addEventListener('click', () => start());
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
    table.hidden = true;
    home.hidden = false;
  } else if (button.dataset.command === 'again') {
    start(round.result.winner ?? round.dealer);
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
