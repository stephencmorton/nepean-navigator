// Browser interface: room entry, route rendering, number explanations, and app installation.
import {school} from './data.js';
import {renderRouteMap} from './route-map.js';
import {navigate, roomLabel, constrainRoomInput, floorName, parseRoom} from './routing.js';

// Shared elements used to switch between room entry, errors, and route results.
const form = document.querySelector('#navigation');
const error = document.querySelector('#error');
const result = document.querySelector('#result');
const steps = document.querySelector('#steps');
const title = document.querySelector('#route-title');
const summary = document.querySelector('#route-summary');
const changeRoute = document.querySelector('#change-route');
// Render direction text and destination names as plain text rather than HTML.
function renderList(list, texts) {
  // Build fresh items so a new route cannot retain steps from the previous one.
  list.replaceChildren(...texts.map(text => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
}

// Room-number explanation: cards, arrows, and collapse behavior.
const numberExplanation = document.querySelector('#number-explanation');
// Allow tapping the explanation body to collapse it without overriding the summary.
numberExplanation.addEventListener('click', event => {
  // The summary already toggles the details element through native behavior.
  if (!event.target.closest('summary')) numberExplanation.open = false;
});
const numberCards = document.querySelector('#number-cards');
const exampleNumberCard = document.querySelector('#example-number-card');
const numberCardTemplate = document.querySelector('#number-card-template');
// Keep arrow origins aligned with the fixed-width digits at every card width.
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

// Populate a room-number card, including any destination-specific floor exception.
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
  // Fill the paired room digits separately while keeping their shared visual group.
  card.querySelectorAll('.number-row > .room-group span').forEach((digit, index) => { digit.textContent = number[index + 2]; });
  // Match each digit group to its human-readable meaning.
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

// Reset both explanation cards, initially collapsed, for each mapped route.
function renderNumberExplanation(start, end, visible) {
  numberCards.replaceChildren(
    explainRoomNumber(start, 'Starting room'),
    explainRoomNumber(end, 'Destination'),
  );
  numberExplanation.hidden = !visible;
  numberExplanation.open = false;
}

// Keep an example available from the menu without changing either route input.
exampleNumberCard.replaceChildren(explainRoomNumber('3214', 'Example'));

// Room entry and route display.
const knownRooms = document.querySelector('#known-rooms');
// Let destination shortcuts fill the existing field without submitting an incomplete route.
for (const [number, room] of Object.entries(school.knownRooms)) {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', `Set destination to ${room.name}, room ${number}`);
  const name = document.createElement('span');
  name.textContent = room.name;
  const code = document.createElement('span');
  code.className = 'destination-code';
  code.textContent = number;
  button.append(name, code);
  // Keep room entry and keyboard submission available after choosing a shortcut.
  button.addEventListener('click', () => {
    form.elements.end.value = number;
    form.elements.end.focus();
  });
  item.append(button);
  knownRooms.append(item);
}

// Present room identifiers and floor context once, above the movement instructions.
function renderRouteSummary(start, end) {
  for (const [prefix, number] of [['from', start], ['to', end]]) {
    const room = parseRoom(number);
    const name = school.knownRooms[number]?.name;
    document.querySelector(`#route-${prefix}-label`).textContent = name ? `${name} · ${number}` : `Room ${number}`;
    const level = school.knownRooms[number]?.level ?? floorName(room.floor);
    document.querySelector(`#route-${prefix}-location`).textContent = `${school.buildings[room.building]} · ${level}`;
  }
}
for (const input of [form.elements.start, form.elements.end]) {
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
  };
  // Defer sanitization until an input-method composition has finished.
  input.addEventListener('input', (event) => {
    if (!event.isComposing) constrain();
  });
  input.addEventListener('compositionend', constrain);
  // Sanitize pasted text before applying the four-digit limit.
  input.addEventListener('paste', event => {
    if (!event.clipboardData) return;
    event.preventDefault();
    // Clean clipboard text before the browser's maxlength can truncate its digits.
    input.setRangeText(constrainRoomInput(event.clipboardData.getData('text')), input.selectionStart, input.selectionEnd, 'end');
    constrain();
  });
}
// Return to room entry with the previous values available for editing.
changeRoute.addEventListener('click', () => {
  form.hidden = false;
  result.hidden = true;
  document.body.classList.remove('showing-route');
  form.elements.start.focus();
});
// Compute directions and move focus to the result, or announce a validation error.
form.addEventListener('submit', (event) => {
  event.preventDefault();
  error.hidden = true;
  result.hidden = true;
  steps.replaceChildren();
  try {
    // Normalize only on submission so typing a fourth digit remains natural.
    const start = parseRoom(form.elements.start.value).number;
    const end = parseRoom(form.elements.end.value).number;
    const route = navigate(start, end);
    form.elements.start.value = start;
    form.elements.end.value = end;
    renderNumberExplanation(start, end, Boolean(route.path));
    renderList(steps, route.path ? route.steps.slice(1) : route.steps);
    renderRouteSummary(start, end);
    summary.hidden = !route.path;
    renderRouteMap(document.querySelector('#route-map'), route.path, start, end);
    document.querySelector('#route-map-panel').hidden = !route.path;
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

// Keep supplementary information in dialogs and return focus to the hamburger after closing.
const appMenu = document.querySelector('#app-menu');
const menuToggle = appMenu.querySelector('summary');
for (const [trigger, dialog] of [
  ['#open-number-guide', '#number-guide-dialog'],
  ['#open-room-guide', '#room-guide-dialog'],
  ['#open-share', '#share-dialog'],
  ['#open-about', '#about-dialog'],
]) {
  // Close the dropdown before opening a dialog so its return target stays visible.
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
// Dismiss the dropdown when a pointer interaction moves back into the app.
document.addEventListener('click', event => {
  if (!appMenu.contains(event.target)) appMenu.open = false;
});
// Return keyboard users to the toggle when they dismiss the dropdown with Escape.
appMenu.addEventListener('keydown', event => {
  if (event.key === 'Escape' && appMenu.open) {
    event.preventDefault();
    appMenu.open = false;
    menuToggle.focus();
  }
});
// Avoid leaving the dropdown over the form when keyboard focus moves elsewhere.
appMenu.addEventListener('focusout', event => {
  if (event.relatedTarget && !appMenu.contains(event.relatedTarget)) appMenu.open = false;
});

// Register offline support after page load without blocking normal navigation.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register(new URL('./sw.js', import.meta.url));
    } catch (exception) {
      console.warn('Offline access unavailable.', exception);
    }
  });
}

// Offer a native install prompt when available, with manual instructions as fallback.
const installControl = document.querySelector('#install-control');
const installButton = document.querySelector('#install-app');
const menuInstallButton = document.querySelector('#menu-install-app');
const installButtons = [installButton, menuInstallButton];
const installHelp = document.querySelector('#install-help');
const standalone = window.matchMedia('(display-mode: standalone)');
let installPrompt = null;
let installed = false;
// Hide installation controls when the app is already installed or running standalone.
function refreshInstallControl() {
  const hide = installed || standalone.matches || navigator.standalone === true;
  installControl.hidden = hide;
  menuInstallButton.hidden = hide;
}
refreshInstallControl();
standalone.addEventListener('change', refreshInstallControl);
// Save the browser's install offer until the user chooses to install.
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  refreshInstallControl();
});
// Discard the used prompt and reflect installation completed outside this button.
window.addEventListener('appinstalled', () => {
  installed = true;
  installPrompt = null;
  refreshInstallControl();
});
// Keep both triggers in sync and bring the footer instructions into view from the menu.
function showInstallHelp(visible, fromMenu) {
  installHelp.hidden = !visible;
  for (const button of installButtons) button.setAttribute('aria-expanded', String(visible));
  if (visible && fromMenu) {
    installHelp.focus({preventScroll: true});
    installHelp.scrollIntoView({block: 'start', behavior: 'instant'});
  }
}

// Share the one-use native prompt and manual instructions between both installation buttons.
async function requestInstall(event) {
  const fromMenu = event.currentTarget === menuInstallButton;
  if (fromMenu) {
    appMenu.open = false;
    menuToggle.focus();
  }
  if (installPrompt) {
    const prompt = installPrompt;
    installPrompt = null;
    for (const button of installButtons) button.disabled = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') {
        installed = true;
        refreshInstallControl();
      }
    } catch {
      showInstallHelp(true, fromMenu);
    } finally {
      for (const button of installButtons) button.disabled = false;
    }
  } else {
    showInstallHelp(fromMenu || installHelp.hidden, fromMenu);
  }
}
for (const button of installButtons) button.addEventListener('click', requestInstall);
