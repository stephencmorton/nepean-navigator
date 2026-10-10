import {navigate, resolveRoomNumber, constrainRoomInput} from './routing.js';

const form = document.querySelector('#navigation');
const error = document.querySelector('#error');
const result = document.querySelector('#result');
const steps = document.querySelector('#steps');
const title = document.querySelector('#route-title');
const summary = document.querySelector('#route-summary');
const changeRoute = document.querySelector('#change-route');
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
  input.addEventListener('change', () => { input.value = resolveRoomNumber(input.value); });
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
    form.elements.start.value = resolveRoomNumber(form.elements.start.value);
    form.elements.end.value = resolveRoomNumber(form.elements.end.value);
    const route = navigate(form.elements.start.value, form.elements.end.value);
    for (const text of route.steps) {
      const item = document.createElement('li');
      item.textContent = text;
      steps.append(item);
    }
    summary.textContent = `Room ${form.elements.start.value.trim()} → Room ${form.elements.end.value.trim()}`;
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
