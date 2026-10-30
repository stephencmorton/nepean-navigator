import {school} from './data.js';
import {renderRouteMap} from './route-map.js';
import {setupInstallation} from './install.js';
import {navigate, constrainRoomInput, floorName} from './routing.js';

const form = document.querySelector('#navigation');
const error = document.querySelector('#error');
const result = document.querySelector('#result');
const steps = document.querySelector('#steps');
const title = document.querySelector('#route-title');
const summary = document.querySelector('#route-summary');
const changeRoute = document.querySelector('#change-route');
const routeMapPanel = document.querySelector('#route-map-panel');
const numberExplanation = document.querySelector('#number-explanation');
numberExplanation.addEventListener('click', event => {
  if (!event.target.closest('summary')) numberExplanation.open = false;
});
const numberCards = document.querySelector('#number-cards');
const exampleNumberCard = document.querySelector('#example-number-card');
const numberCardTemplate = document.querySelector('#number-card-template');
function alignNumberArrows() {
  for (const card of document.querySelectorAll('.number-card')) {
    const {width, left} = card.querySelector('.number-arrows').getBoundingClientRect();
    if (!width) continue;
    // Aim each arrow from its digit group to the corresponding explanation column.
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
}
const numberCardObserver = new ResizeObserver(alignNumberArrows);
numberCardObserver.observe(numberCards);
numberCardObserver.observe(exampleNumberCard);

function explainRoomNumber(number, label) {
  const card = numberCardTemplate.content.firstElementChild.cloneNode(true);
  const name = school.knownRooms[number]?.name ?? `Room ${number}`;
  card.querySelector('h3').textContent = `${label} · ${name}`;
  const groups = [
    floorName(Number(number[0])),
    school.buildings[Number(number[1])].name,
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
    note.textContent = `${name} is on a ${level}.`;
    note.hidden = false;
  }
  return card;
}

function renderNumberExplanation({start, end, path}) {
  const cards = [];
  if (!start.entrance) cards.push(explainRoomNumber(start.number, 'Starting room'));
  cards.push(explainRoomNumber(end.number, 'Destination'));
  numberCards.replaceChildren(...cards);
  numberExplanation.hidden = !path;
  numberExplanation.open = false;
}

exampleNumberCard.replaceChildren(explainRoomNumber('3204', 'Example'));

const knownRooms = document.querySelector('#known-rooms');
const startingRoomLabel = form.querySelector('label[for="start-room"]');
let selectedEntrance = null;
const entranceButtons = document.querySelector('#entrance-buttons');
const useStartRoom = document.querySelector('#use-start-room');
function selectEntrance(entrance) {
  selectedEntrance = entrance;
  form.elements.start.disabled = Boolean(entrance);
  form.elements.start.required = !entrance;
  form.elements.start.value = entrance ? `Entrance ${entrance}` : '';
  startingRoomLabel.textContent = entrance ? 'Starting point' : 'Starting room';
  useStartRoom.hidden = !entrance;
  for (const button of entranceButtons.children) {
    button.setAttribute('aria-pressed', String(button.dataset.entrance === entrance));
  }
  error.hidden = true;
}
for (const entrance of Object.keys(school.entrances)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = entrance;
  button.dataset.entrance = entrance;
  button.setAttribute('aria-label', `Start at Entrance ${entrance}`);
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => {
    selectEntrance(entrance);
    form.elements.end.focus();
  });
  entranceButtons.append(button);
}
useStartRoom.addEventListener('click', () => {
  selectEntrance(null);
  form.elements.start.focus();
});
const roomInputs = [form.elements.start, form.elements.end];
const focusedRoomInput = () => roomInputs.includes(document.activeElement) ? document.activeElement : null;
// Keep the room-entry controls higher on screen when the phone keyboard opens.
let roomScrollFrame;
function scrollToRoomEntry() {
  cancelAnimationFrame(roomScrollFrame);
  roomScrollFrame = requestAnimationFrame(() => {
    if (focusedRoomInput()) {
      startingRoomLabel.scrollIntoView({block: 'start', behavior: 'instant'});
    }
  });
}
for (const input of roomInputs) input.addEventListener('focus', scrollToRoomEntry);
// Mobile keyboards resize the visible viewport after focus has already fired.
window.visualViewport?.addEventListener('resize', scrollToRoomEntry);
// Fill the focused room, then the first empty room, otherwise the destination.
for (const [number, room] of Object.entries(school.knownRooms)) {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', `Use ${room.name}, room ${number}`);
  const name = document.createElement('span');
  name.textContent = room.name;
  const code = document.createElement('span');
  code.className = 'destination-code';
  code.textContent = number;
  button.append(name, code);
  // Capture focus before a mouse click or touch transfers it to the button.
  let pointerRoom = null;
  button.addEventListener('pointerdown', () => { pointerRoom = focusedRoomInput(); });
  button.addEventListener('pointercancel', () => { pointerRoom = null; });
  button.addEventListener('click', event => {
    const input = (event.detail > 0 ? pointerRoom : null) ?? focusedRoomInput()
      ?? roomInputs.find(input => !input.disabled && !input.value) ?? form.elements.end;
    pointerRoom = null;
    input.value = number;
    form.elements.end.focus();
  });
  item.append(button);
  knownRooms.append(item);
}

function renderRouteSummary({start, end}) {
  for (const [prefix, room] of [['from', start], ['to', end]]) {
    const {number} = room;
    const name = school.knownRooms[number]?.name;
    document.querySelector(`#route-${prefix}-label`).textContent = room.entrance ? `Entrance ${room.entrance}` : name ? `${name} · ${number}` : `Room ${number}`;
    const level = school.knownRooms[number]?.level ?? floorName(room.doorFloor ?? room.floor);
    document.querySelector(`#route-${prefix}-location`).textContent = `${school.buildings[room.building].name} · ${level}`;
  }
}
for (const input of roomInputs) {
  // Remove invalid characters without moving the caret past the remaining digits.
  const constrain = () => {
    const value = input.value;
    const constrained = constrainRoomInput(value);
    if (value !== constrained) {
      const cursor = input.selectionStart ?? value.length;
      const position = constrainRoomInput(value.slice(0, cursor)).length;
      input.value = constrained;
      input.setSelectionRange(position, position);
    }
    if (input === form.elements.start && input.value.length === 4) {
      form.elements.end.focus();
    }
  };
  // Defer sanitization until an input-method composition has finished.
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
  selectEntrance(null);
  form.elements.start.value = form.elements.end.value;
  form.elements.end.value = '';
  form.hidden = false;
  result.hidden = true;
  document.body.classList.remove('showing-route');
  form.elements.end.focus();
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  error.hidden = true;
  result.hidden = true;
  steps.replaceChildren();
  try {
    // Normalize only on submission so typing a fourth digit remains natural.
    const route = navigate(selectedEntrance ?? form.elements.start.value, form.elements.end.value);
    if (!selectedEntrance) form.elements.start.value = route.start.number;
    form.elements.end.value = route.end.number;
    renderNumberExplanation(route);
    steps.replaceChildren(...(route.path ? route.steps.slice(1) : route.steps).map(text => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
    renderRouteSummary(route);
    summary.hidden = !route.path;
    renderRouteMap(document.querySelector('#route-map'), route);
    routeMapPanel.hidden = !route.path;
    title.textContent = route.path ? 'Your route' : 'No route found';
    result.hidden = false;
    // Keep room inputs available when the map cannot connect the rooms.
    form.hidden = Boolean(route.path);
    document.body.classList.toggle('showing-route', Boolean(route.path));
    title.focus({preventScroll: true});
    result.scrollIntoView({block: 'start', behavior: 'instant'});
  } catch (exception) {
    error.textContent = exception.message;
    error.hidden = false;
  }
});

const appMenu = document.querySelector('#app-menu');
const menuToggle = appMenu.querySelector('summary');
for (const [trigger, dialog] of [
  ['#open-number-guide', '#number-guide-dialog'],
  ['#open-room-guide', '#room-guide-dialog'],
  ['#open-share', '#share-dialog'],
  ['#open-about', '#about-dialog'],
]) {
  document.querySelector(trigger).addEventListener('click', () => {
    appMenu.open = false;
    menuToggle.focus();
    document.querySelector(dialog).showModal();
  });
}
// Copy the public app address, including when opened from a local or offline install.
const shareStatus = document.querySelector('#share-status');
document.querySelector('#open-share').addEventListener('click', () => { shareStatus.textContent = ''; });
document.querySelector('#copy-share-link').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector('#share-link').href);
    shareStatus.textContent = 'Link copied.';
  } catch {
    shareStatus.textContent = 'Could not copy the link. Touch and hold or right-click the link above to copy it.';
  }
});
document.addEventListener('click', event => {
  if (!appMenu.contains(event.target)) appMenu.open = false;
});
appMenu.addEventListener('keydown', event => {
  if (event.key === 'Escape' && appMenu.open) {
    event.preventDefault();
    appMenu.open = false;
    menuToggle.focus();
  }
});
appMenu.addEventListener('focusout', event => {
  if (event.relatedTarget && !appMenu.contains(event.relatedTarget)) appMenu.open = false;
});

setupInstallation(appMenu);
