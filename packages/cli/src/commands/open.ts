import { DEFAULTS } from '@konduktor/shared';
import { openBrowser } from '../browser.js';

export async function open() {
  const url = `http://localhost:${DEFAULTS.port}`;
  console.log(`Opening ${url}`);
  openBrowser(url);
}
