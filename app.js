import {school} from './data.js';
import {navigate, roomLabel, constrainRoomInput, floorName} from './routing.js';

const form = document.querySelector('#navigation');
const error = document.querySelector('#error');
const result = document.querySelector('#result');
const steps = document.querySelector('#steps');
const title = document.querySelector('#route-title');
const summary = document.querySelector('#route-summary');
const changeRoute = document.querySelector('#change-route');
function renderList(list, texts) {
  list.replaceChildren(...texts.map(text => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
}

// Room-number explanation: cards, arrows, and collapse behavior.
const numberExplanation = document.querySelector('#number-explanation');
numberExplanation.addEventListener('click', event => {
  // The summary already toggles the details element through native behavior.
  if (!event.target.closest('summary')) numberExplanation.open = false;
});
const numberCards = document.querySelector('#number-cards');
const numberCardTemplate = document.querySelector('#number-card-template');
// Keep arrow origins aligned with the fixed-width digits at every card width.
new ResizeObserver(() => {
  for (const card of numberCards.children) {
    const {width, left} = card.querySelector('.number-arrows').getBoundingClientRect();
    if (!width) continue;
    card.querySelectorAll('.number-arrows > svg').forEach((arrow, index) => {
      const destination = width * (index * 2 + 1) / 6;
      const digits = card.querySelectorAll('.number-row > .number-digits')[index].getBoundingClientRect();
      const origin = digits.left + digits.width / 2 - left;
      // Arrowheads point down by default; rotate to follow the shaft's vector.
      const angle = Math.atan2(origin - destination, 30 - 2) * 180 / Math.PI;
      arrow.querySelector('line').setAttribute('x1', origin);
      arrow.querySelector('path').setAttribute('transform', `translate(${destination} 30) rotate(${angle})`);
    });
  }
}).observe(numberCards);

function explainRoomNumber(number, label) {
  const card = numberCardTemplate.content.firstElementChild.cloneNode(true);
  card.querySelector('h3').textContent = `${label} · ${roomLabel(number)}`;
  const groups = [
    floorName(Number(number[0])),
    school.buildings[Number(number[1])],
    `Room ${number.slice(2)}`,
  ];
  card.querySelector('.number-row > .floor-group').textContent = number[0];
  card.querySelector('.number-row > .building-group').textContent = number[1];
  card.querySelectorAll('.number-row > .room-group span').forEach((digit, index) => { digit.textContent = number[index + 2]; });
  card.querySelectorAll('.number-group').forEach((group, index) => {
    group.querySelector('.number-value').textContent = groups[index];
  });
  const level = school.knownRooms[number]?.level;
  if (level) {
    const note = card.querySelector('.number-note');
    note.textContent = `${roomLabel(number)} is on a ${level}.`;
    note.hidden = false;
  }
  return card;
}

function renderNumberExplanation(start, end, visible) {
  numberCards.replaceChildren(
    explainRoomNumber(start, 'Starting room'),
    explainRoomNumber(end, 'Destination'),
  );
  numberExplanation.hidden = !visible;
  numberExplanation.open = true;
}

// Room entry and route display.
const knownRooms = document.querySelector('#known-rooms');
renderList(knownRooms, Object.entries(school.knownRooms).map(([number, room]) => `${number} — ${room.name}`));
for (const input of [form.elements.start, form.elements.end]) {
  const constrain = () => {
    const value = input.value;
    const constrained = constrainRoomInput(value);
    if (value !== constrained) {
      const cursor = input.selectionStart ?? value.length;
      const position = constrainRoomInput(value.slice(0, cursor)).length;
      input.value = constrained;
      input.setSelectionRange(position, position);
    }
  };
  input.addEventListener('input', (event) => {
    if (!event.isComposing) constrain();
  });
  input.addEventListener('compositionend', constrain);
  input.addEventListener('paste', event => {
    if (!event.clipboardData) return;
    event.preventDefault();
    // Clean clipboard text before the browser's maxlength can truncate its digits.
    input.setRangeText(constrainRoomInput(event.clipboardData.getData('text')), input.selectionStart, input.selectionEnd, 'end');
    constrain();
  });
}
changeRoute.addEventListener('click', () => {
  form.hidden = false;
  result.hidden = true;
  document.body.classList.remove('showing-route');
  form.elements.start.focus();
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  error.hidden = true;
  result.hidden = true;
  steps.replaceChildren();
  try {
    const route = navigate(form.elements.start.value, form.elements.end.value);
    renderNumberExplanation(form.elements.start.value.trim(), form.elements.end.value.trim(), Boolean(route.path));
    renderList(steps, route.steps);
    summary.textContent = `${roomLabel(form.elements.start.value.trim())} → ${roomLabel(form.elements.end.value.trim())}`;
    title.textContent = route.path ? 'Your route' : 'No route found';
    result.hidden = false;
    // Keep room inputs available when the map cannot connect the rooms.
    form.hidden = Boolean(route.path);
    document.body.classList.toggle('showing-route', Boolean(route.path));
    title.focus({preventScroll: true});
    (route.path ? summary : result).scrollIntoView({block: 'start'});
  } catch (exception) {
    error.textContent = exception.message;
    error.hidden = false;
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register(new URL('./sw.js', import.meta.url));
    } catch (exception) {
      console.warn('Offline access unavailable.', exception);
    }
  });
}

const installControl = document.querySelector('#install-control');
const installButton = document.querySelector('#install-app');
const installHelp = document.querySelector('#install-help');
const standalone = window.matchMedia('(display-mode: standalone)');
let installPrompt = null;
let installed = false;
function refreshInstallControl() {
  installControl.hidden = installed || standalone.matches || navigator.standalone === true;
}
refreshInstallControl();
standalone.addEventListener('change', refreshInstallControl);
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  refreshInstallControl();
});
window.addEventListener('appinstalled', () => {
  installed = true;
  installPrompt = null;
  refreshInstallControl();
});
installButton.addEventListener('click', async () => {
  if (installPrompt) {
    const prompt = installPrompt;
    installPrompt = null;
    installButton.disabled = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') {
        installed = true;
        refreshInstallControl();
      }
    } catch {
      installHelp.hidden = false;
      installButton.setAttribute('aria-expanded', 'true');
    } finally {
      installButton.disabled = false;
    }
  } else {
    installHelp.hidden = !installHelp.hidden;
    installButton.setAttribute('aria-expanded', String(!installHelp.hidden));
  }
});
