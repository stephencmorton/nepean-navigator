import {navigate} from './routing.js';

const form = document.querySelector('#navigation');
const error = document.querySelector('#error');
const result = document.querySelector('#result');
const steps = document.querySelector('#steps');
const title = document.querySelector('#route-title');
const summary = document.querySelector('#route-summary');
const changeRoute = document.querySelector('#change-route');
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

const status = document.querySelector('#offline-status');
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register(new URL('./sw.js', import.meta.url));
      await navigator.serviceWorker.ready;
      status.textContent = 'Ready for offline use.';
    } catch {
      status.textContent = 'Offline access unavailable. You can still use directions while online.';
    }
  });
} else status.textContent = 'This browser does not support offline access.';
