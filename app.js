import {navigate} from './routing.js';

const form = document.querySelector('#navigation');
const error = document.querySelector('#error');
const result = document.querySelector('#result');
const steps = document.querySelector('#steps');
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
    result.hidden = false;
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
