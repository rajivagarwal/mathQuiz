import { registerSW } from 'virtual:pwa-register';
import './ui/styles.css';
import { createApp } from './app';

/**
 * iOS keeps a home-screen app alive for days, so it can sit on an old build
 * until something asks for a new one -- which is why a fix can be deployed and
 * still not be on the phone. Ask every time the app comes back to the front.
 *
 * Reloading then costs nothing: coming back from the background already
 * cancels any round in progress, and everything else lives in localStorage.
 */
registerSW({
  immediate: true,
  onRegisteredSW: (_swUrl, registration) => {
    if (!registration) return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration.update();
    });
  },
});

const root = document.getElementById('app');
if (root) createApp(root);
