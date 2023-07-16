// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { downloadBrowser } from 'puppeteer/internal/node/install.js';

import { version as playwrightVersion } from 'playwright/package.json';

import * as core from '@actions/core';
import { execSync } from 'child_process';

export const installBrowser = (controller: 'puppeteer' | 'playwright') => {
  core.info(`Installing browser for ${controller}`);

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
  execSync(`npx playwright@${playwrightVersion} install chromium --with-deps`, { stdio: 'inherit' });
};
