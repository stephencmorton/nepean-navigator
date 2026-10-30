export function setupInstallation(appMenu) {
  const menuToggle = appMenu.querySelector('summary');
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
  const menuInstallButton = document.querySelector('#menu-install-app');
  const installButtons = [installButton, menuInstallButton];
  const installHelp = document.querySelector('#install-help');
  const standalone = window.matchMedia('(display-mode: standalone)');
  let installPrompt = null;
  let installed = false;
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
}
