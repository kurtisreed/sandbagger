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

/** Fresh load, logged out (clears stored login AND the PHP session cookie). */
async function freshLoggedOut() {
  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.clearBrowserCookies');
  await cdp.detach();
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

  /** Admin pages: group overview (invite code), golfer roster, courses. */
  async admin() {
    await signInDemo();
    await page.click('#hamburger-menu-btn');
    await sleep(250);
    await page.click('#menu-edit-group');
    await visible('#edit-group-golfers-btn');
    // Show the production domain in the invite link instead of localhost
    await page.waitForFunction(() => {
      const el = document.getElementById('group-invite-link-display');
      return el && el.value.includes('join=');
    }, { timeout: 10000 });
    await page.evaluate(() => {
      const el = document.getElementById('group-invite-link-display');
      el.value = el.value.replace(window.location.origin, 'https://sandbaggerscoring.com');
    });
    await shot('admin-group');

    await page.click('#edit-group-golfers-btn');
    await visible('#edit-golfers-list');
    await sleep(600);
    await shot('admin-golfers');
    await page.click('#add-golfer-btn');
    await sleep(400);
    await shot('admin-add-golfer');

    // back to admin, then courses
    await page.click('#back-from-edit-golfers-btn');
    await visible('#edit-group-golfers-btn');
    await page.click('#manage-courses-btn');
    await visible('#courses-list');
    await sleep(600);
    await shot('admin-courses');
  },

  async 'qr-bestball'() {
    await signInDemo();
    await openQuickRoundSetup('best-ball', 'quickround-type');
    await visible('#start-best-ball');
    await pickFourPlayers(['team1-player1', 'team1-player2', 'team2-player1', 'team2-player2']);
    await pickCourseAndTee();
    await shot('bestball-setup', { fullPage: false });
    await page.click('#start-best-ball');
    await visible('select[data-hole]', 20000);
    await enterScores(9);
    await shot('bestball-scoring');
  },

  async 'qr-rollingskins'() {
    await signInDemo();
    await openQuickRoundSetup('rolling-skins');
    await visible('#start-rolling-skins');
    await pickFourPlayers(['rs-player1', 'rs-player2', 'rs-player3', 'rs-player4']);
    await pickCourseAndTee();
    await page.click('#start-rolling-skins');
    await visible('select[data-hole]', 20000);
    await enterScores(9);
    await shot('rollingskins-scoring');
    await page.evaluate(() => {
      const el = document.getElementById('rolling-skins-summary');
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
      const wrap = document.querySelector('.skins-table-wrapper');
      if (wrap && el) wrap.scrollTop = el.offsetTop - 60;
    });
    await shot('rollingskins-summary');
  },

  async 'qr-wolf'() {
    await signInDemo();
    await openQuickRoundSetup('wolf');
    await visible('#start-wolf');
    await pickFourPlayers(['wolf-player1', 'wolf-player2', 'wolf-player3', 'wolf-player4']);
    await pickCourseAndTee();
    await page.click('#start-wolf');
    await visible('select[data-hole]', 20000);
    await shot('wolf-scoring');
  },

  async 'qr-rabbit'() {
    await signInDemo();
    await openQuickRoundSetup('rabbit');
    await visible('#start-rabbit');
    await pickFourPlayers(['rabbit-player1', 'rabbit-player2', 'rabbit-player3', 'rabbit-player4']);
    await pickCourseAndTee();
    await page.click('#start-rabbit');
    await visible('select[data-hole]', 20000);
    await shot('rabbit-scoring');
  },

  /** Dashboard again once quick rounds exist — shows the Resume cards. */
  async 'dashboard-active'() {
    await signInDemo();
    await shot('dashboard-active');
  },

  /** My Account page: profile, groups, credentials. */
  async account() {
    await signInDemo();
    await page.click('#hamburger-menu-btn');
    await sleep(250);
    await page.click('#menu-edit-user');
    await page.waitForFunction(
      () => (document.getElementById('profile-display-first-name')?.textContent || '').length > 0,
      { timeout: 10000 }
    );
    await sleep(600);
    await shot('account-page');
  },

  /** My History: past tournaments and quick rounds. */
  async history() {
    await signInDemo();
    await page.click('#hamburger-menu-btn');
    await sleep(250);
    await page.click('#menu-my-history');
    await page.waitForFunction(
      () => document.querySelectorAll('#tournament-history-content > div').length > 0,
      { timeout: 10000 }
    );
    await sleep(500);
    await shot('history-page');
  },

  /** Ryder Cup creation wizard: step 1, team setup, player assignment, card. */
  async 't-wizard'() {
    await signInDemo();
    await page.click('#create-tournament-btn');
    await visible('#nt-name');
    await type('#nt-name', 'Ryder Cup Weekend');
    await setDate('#nt-start-date', 0);
    await setDate('#nt-end-date', 2);
    const rcValue = await page.$eval('#nt-format', (sel) =>
      [...sel.options].find((o) => /ryder/i.test(o.textContent))?.value
    );
    await page.select('#nt-format', rcValue);
    await shot('tournament-step1');

    await page.click('#nt-continue-btn');
    await visible('#nt-team1-name');
    await type('#nt-team1-name', 'USA');
    await type('#nt-team2-name', 'Europe');
    await shot('tournament-teams');

    await page.click('#nt-step2-continue-btn');
    await visible('.nt-assign-btn');
    // Alternate golfers between the two teams
    await page.evaluate(() => {
      const ids = [...new Set([...document.querySelectorAll('.nt-assign-btn')]
        .map((b) => b.dataset.golferId))];
      ids.forEach((gid, i) => {
        document.querySelector(`.nt-assign-btn[data-golfer-id="${gid}"][data-team="${(i % 2) + 1}"]`).click();
      });
    });
    await sleep(300);
    await shot('tournament-assign');

    await page.click('#nt-step3-continue-btn');
    await visible('#user-dashboard', 20000);
    await sleep(900);
    await scenes['tournament-card']();
  },

  /** The tournament card on the dashboard (scrolled into view). */
  async 'tournament-card'() {
    if (!(await page.$('#user-dashboard'))) await signInDemo();
    if (await page.$eval('#user-dashboard', (el) => el.style.display === 'none')) await signInDemo();
    await page.evaluate(() => {
      const h4 = [...document.querySelectorAll('.tournament-card h4')]
        .find((el) => /ryder cup/i.test(el.textContent));
      if (h4) h4.closest('.tournament-card').scrollIntoView({ behavior: 'instant', block: 'start' });
      window.scrollBy(0, -70);
    });
    await shot('tournament-card');
  },

  /** Add a round to the tournament: round info, matches, tee times. */
  async 't-round'() {
    await signInDemo();
    await page.click('.add-round-btn');
    await visible('#add-round-date');
    await setDate('#add-round-date', 0);
    await page.waitForFunction(
      () => document.querySelectorAll('#add-round-course option[value]:not([value=""])').length > 0,
      { timeout: 10000 }
    );
    const course = await page.$eval('#add-round-course', (sel) =>
      [...sel.options].map((o) => o.value).find((v) => v)
    );
    await page.select('#add-round-course', course);
    await page.waitForFunction(
      () => document.querySelectorAll('#add-round-tees option[value]:not([value=""])').length > 0,
      { timeout: 10000 }
    );
    const tees = await page.$eval('#add-round-tees', (sel) =>
      [...sel.options].map((o) => o.value).filter((v) => v)
    );
    await page.select('#add-round-tees', tees[Math.min(2, tees.length - 1)]);
    await shot('tournament-add-round');

    await page.click('#add-round-form button[type="submit"]');
    await visible('#add-match-btn');
    await page.click('#add-match-btn');
    await sleep(250);
    await page.click('#add-match-btn');
    await sleep(250);
    // Fill both matches. Each select's options may be team-filtered (Ryder Cup),
    // so pick the first not-yet-used golfer from that select's own options.
    const used = new Set();
    for (let m = 0; m < 2; m++) {
      for (const [team, pos] of [[1, 1], [1, 2], [2, 1], [2, 2]]) {
        const sel = `.match-player-select[data-match-index="${m}"][data-team="${team}"][data-position="${pos}"]`;
        const val = await page.$eval(sel, (el, usedArr) => {
          const taken = new Set(usedArr);
          return [...el.options].map((o) => o.value).find((v) => v && !taken.has(v));
        }, [...used]);
        used.add(val);
        await page.select(sel, val);
        await sleep(80);
      }
    }
    await shot('tournament-matches');

    await page.click('#continue-to-tee-times-btn');
    await visible('#add-tee-time-btn');
    await sleep(300);
    // First tee time exists by default: assign match 1; add a second for match 2
    await page.click('.add-match-to-tee-btn[data-tee-index="0"]');
    await sleep(200);
    await page.select('.tee-time-match-select[data-tee-index="0"]', 'match-0');
    await sleep(200);
    await page.click('#add-tee-time-btn');
    await sleep(300);
    await page.click('.add-match-to-tee-btn[data-tee-index="1"]');
    await sleep(200);
    await page.select('.tee-time-match-select[data-tee-index="1"]', 'match-1');
    await sleep(200);
    await shot('tournament-teetimes');

    await page.click('#save-all-btn');
    await visible('#user-dashboard', 20000);
  },

  /** Score a tournament round: match scorecard + Round + Tournament tabs. */
  async 't-scoring'() {
    await signInDemo();
    // Quick-round cards also render .tournament-round-btn — target the
    // Ryder Cup (format 3) round specifically.
    await page.click('.tournament-round-btn[data-format-id="3"]');
    await visible('select[data-hole]', 20000);
    await enterScores(9);
    await shot('tournament-match-scoring');

    await page.evaluate(() => document.querySelector('button[data-page="today"]').click());
    await sleep(1200);
    await shot('tournament-round-tab');

    await page.evaluate(() => document.querySelector('button[data-page="tournament"]').click());
    await sleep(1200);
    await shot('tournament-standings-tab');
  },
};

/** Set a date input to today + offsetDays (date inputs need value + events). */
async function setDate(sel, offsetDays) {
  await page.evaluate(({ sel, offsetDays }) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const el = document.querySelector(sel);
    el.value = d.toISOString().slice(0, 10);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { sel, offsetDays });
}

// ── Quick-round helpers ─────────────────────────────────────────────────────

/** Dashboard → + New Quick Round → pick a type. Optionally screenshots the selector. */
async function openQuickRoundSetup(type, shotName) {
  await page.click('#create-quick-round-btn');
  await visible('#round-type-select');
  await page.select('#round-type-select', type);
  if (shotName) await shot(shotName);
  await page.click('#continue-round-type-btn');
}

/** Fill four distinct golfers into the given select ids. */
async function pickFourPlayers(selectIds) {
  const values = await page.$eval(`#${selectIds[0]}`, (sel) =>
    [...sel.options].map((o) => o.value).filter((v) => v && v !== 'new-player')
  );
  for (let i = 0; i < selectIds.length; i++) {
    await page.select(`#${selectIds[i]}`, values[i]);
    await sleep(120);
  }
}

/** Pick the first course, then a middle tee once the tee select populates. */
async function pickCourseAndTee() {
  const course = await page.$eval('#select-course', (sel) =>
    [...sel.options].map((o) => o.value).find((v) => v)
  );
  await page.select('#select-course', course);
  await page.waitForFunction(
    () => document.querySelectorAll('#select-tee option[value]:not([value=""])').length > 0,
    { timeout: 10000 }
  );
  const tees = await page.$eval('#select-tee', (sel) =>
    [...sel.options].map((o) => o.value).filter((v) => v)
  );
  await page.select('#select-tee', tees[Math.min(2, tees.length - 1)]);
  await sleep(200);
}

/** Enter plausible scores for holes 1..n for every golfer on the card. */
async function enterScores(n) {
  const pattern = [4, 5, 3, 4, 6, 4, 5, 4, 3, 4, 4, 5, 3, 5, 4, 4, 6, 4];
  const selects = await page.$$eval('select[data-hole][data-golfer]', (els) =>
    els.map((el) => ({ hole: +el.dataset.hole, golfer: el.dataset.golfer }))
  );
  const golfers = [...new Set(selects.map((s) => s.golfer))];
  for (const { hole, golfer } of selects) {
    if (hole > n) continue;
    const gi = golfers.indexOf(golfer);
    const score = Math.max(3, Math.min(7, pattern[(hole - 1 + gi * 3) % pattern.length] + (gi % 2)));
    await page.select(`select[data-hole="${hole}"][data-golfer="${golfer}"]`, String(score));
    await sleep(90); // let the save fire
  }
  await sleep(800); // final leaderboard refresh
}

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
