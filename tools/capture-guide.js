#!/usr/bin/env node
/**
 * capture-guide.js — regenerates the screenshots used by guide.html
 *
 * Drives the app in headless Brave (Chromium) at phone size and saves PNGs
 * to guide-assets/. Organized into named "scenes" so individual sections of
 * the guide can be re-captured after UI changes without redoing everything.
 *
 * Usage:
 *   node tools/capture-guide.js                # run every scene
 *   node tools/capture-guide.js auth dashboard # run specific scenes
 *
 * Prereqs:
 *   - PHP dev server running:  php -S localhost:8080 -t <repo root>
 *   - XAMPP MySQL running (the app's local database)
 *   - Demo group reset beforehand if re-running the "auth" scene
 *     (it registers demo@sandbaggerscoring.com / "Saturday Golf Club")
 */

const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:8080';
const OUT_DIR = path.join(__dirname, '..', 'guide-assets');
const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

const DEMO = {
  firstName: 'Chris',
  lastName: 'Parker',
  email: 'demo@sandbaggerscoring.com',
  password: 'demo12345',
  groupName: 'Saturday Golf Club',
  handicap: '12.4',
};

let page; // current page, set in main()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(name, opts = {}) {
  await sleep(opts.settle ?? 400); // let fonts/transitions settle
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: !!opts.fullPage });
  console.log(`  📸 ${name}.png`);
}

async function visible(sel, timeout = 10000) {
  await page.waitForSelector(sel, { visible: true, timeout });
}

async function type(sel, text) {
  await page.click(sel, { clickCount: 3 });
  await page.type(sel, text, { delay: 15 });
}

/** Fresh load, logged out (clears stored login). */
async function freshLoggedOut() {
  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
  await visible('#login-form');
}

/** Sign in as the demo admin and land on the dashboard. */
async function signInDemo() {
  await freshLoggedOut();
  await type('#login-email', DEMO.email);
  await type('#login-password', DEMO.password);
  await page.click('#login-submit-btn');
  await visible('#user-dashboard');
  await sleep(600); // let dashboard cards load
}

// ── Scenes ──────────────────────────────────────────────────────────────────

const scenes = {
  /** Sign-in, signup chooser, create-a-group form, first dashboard.
   *  NOTE: registers the demo account — reset the demo org before re-running. */
  async auth() {
    await freshLoggedOut();
    await shot('signin');

    await page.click('#show-signup-link');
    await visible('#signup-chooser');
    await shot('signup-chooser');

    await page.click('#chooser-create-btn');
    await visible('#register-form');
    await type('#reg-first-name', DEMO.firstName);
    await type('#reg-last-name', DEMO.lastName);
    await type('#reg-email', DEMO.email);
    await type('#reg-password', DEMO.password);
    await type('#reg-group-name', DEMO.groupName);
    await type('#reg-handicap', DEMO.handicap);
    await shot('create-group-form');

    await page.click('#register-submit-btn');
    await visible('#user-dashboard', 15000);
    // Reload so the session (with the admin role) drives the dashboard —
    // register.php's immediate response lacks the role, hiding admin cards.
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await visible('#user-dashboard', 15000);
    await sleep(800);
    await shot('dashboard-new-group');
  },

  /** Join-a-group screen with a valid invite code (green group preview).
   *  Requires an invite code for the demo org: pass INVITE_CODE env var. */
  async join() {
    const code = process.env.INVITE_CODE;
    if (!code) throw new Error('Set INVITE_CODE=<code> for the join scene');
    await freshLoggedOut();
    await page.click('#show-signup-link');
    await visible('#signup-chooser');
    await page.click('#chooser-join-btn');
    await visible('#join-form');
    await type('#join-code-input', code);
    await sleep(900); // code validation fetch → green preview
    await type('#join-first-name', 'Pat');
    await type('#join-last-name', 'Murphy');
    await type('#join-email', 'pat.murphy@example.com');
    await type('#join-password', 'golfgolf1');
    await type('#join-handicap', '18.2');
    await shot('join-group-form');
  },

  /** Dashboard with seeded data, plus the hamburger menu open. */
  async dashboard() {
    await signInDemo();
    await shot('dashboard');

    await page.click('#hamburger-menu-btn');
    await sleep(300);
    await shot('menu-open');
  },
};

// ── Runner ──────────────────────────────────────────────────────────────────

(async function main() {
  const requested = process.argv.slice(2);
  const toRun = requested.length ? requested : Object.keys(scenes);

  for (const name of toRun) {
    if (!scenes[name]) {
      console.error(`Unknown scene "${name}". Available: ${Object.keys(scenes).join(', ')}`);
      process.exit(1);
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: BRAVE,
    headless: true,
    args: ['--no-first-run', '--disable-features=Translate'],
  });
  page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  try {
    for (const name of toRun) {
      console.log(`▶ scene: ${name}`);
      await scenes[name]();
    }
  } finally {
    await browser.close();
  }
  console.log('✅ done');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
