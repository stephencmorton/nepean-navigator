import {school} from './data.js';
import {navigate, roomLabel, constrainRoomInput, floorName} from './routing.js';

const form = document.querySelector('#navigation');
const error = document.querySelector('#error');
const result = document.querySelector('#result');
const steps = document.querySelector('#steps');
const title = document.querySelector('#route-title');
const summary = document.querySelector('#route-summary');
const numberExplanation = document.querySelector('#number-explanation');
numberExplanation.addEventListener('click', event => {
  // The summary already toggles the details element through native behavior.
  if (!event.target.closest('summary')) numberExplanation.open = false;
});
const numberCards = document.querySelector('#number-cards');
const numberCardTemplate = document.querySelector('#number-card-template');
function explainRoomNumber(number, label) {
  const card = numberCardTemplate.content.firstElementChild.cloneNode(true);
  card.querySelector('h3').textContent = `${label} · ${roomLabel(number)}`;
  const groups = [
    [number[0], floorName(Number(number[0]))],
    [number[1], school.buildings[Number(number[1])]],
    [number.slice(2), `Room ${number.slice(2)}`],
  ];
  card.querySelectorAll('.number-group').forEach((group, index) => {
    group.querySelector('.number-digits').textContent = groups[index][0];
    group.querySelector('.number-value').textContent = groups[index][1];
  });
  const level = school.knownRooms[number]?.level;
  if (level) {
    const note = card.querySelector('.number-note');
    note.textContent = `${roomLabel(number)} is on a ${level}.`;
    note.hidden = false;
  }
  return card;
}

const changeRoute = document.querySelector('#change-route');
function renderList(list, texts) {
  list.replaceChildren(...texts.map(text => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
}

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
    numberCards.replaceChildren(
      explainRoomNumber(form.elements.start.value.trim(), 'Starting room'),
      explainRoomNumber(form.elements.end.value.trim(), 'Destination'),
    );
    numberExplanation.hidden = !route.path;
    numberExplanation.open = true;
    renderList(steps, route.steps);
    summary.textContent = `${roomLabel(form.elements.start.value.trim())} → ${roomLabel(form.elements.end.value.trim())}`;
    title.textContent = route.path ? 'Your route' : 'No route found';
    result.hidden = false;
    // Keep room inputs available when the map cannot connect the rooms.
    form.hidden = Boolean(route.path);
    document.body.classList.toggle('showing-route', Boolean(route.path));
    title.focus({preventScroll: true});
    result.scrollIntoView({block: 'start'});
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
