// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { downloadBrowser } from 'puppeteer/internal/node/install.js';

import { execSync } from 'child_process';

export const installBrowser = (controller: 'puppeteer' | 'playwright') => {
  switch (controller) {
    case 'playwright': {
      return installByPlaywright();
    }
    case 'puppeteer': {
      return installByPuppeteer();
    }
  }
};

const installByPuppeteer = async () => {
  await downloadBrowser();
};

const installByPlaywright = async () => {
  execSync('npx playwright install --with-deps', { stdio: 'inherit' });
};
