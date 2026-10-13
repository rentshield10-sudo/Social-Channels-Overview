// Opens the scraper's own Chrome profile in a visible window so you can sign in to
// Instagram / Facebook once. Close the window when done; hourly scrapes reuse the session.
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {readFileSync} from 'node:fs';

const root = path.resolve(import.meta.dirname, '..');
const {chromePath} = JSON.parse(readFileSync(path.join(root, 'config/accounts.json'), 'utf8'));
const browser = await puppeteer.launch({executablePath: chromePath, headless: false, defaultViewport: null, userDataDir: path.join(root, '.scraper-profile'), args: ['--no-first-run']});
const [page] = await browser.pages();
await page.goto('https://www.instagram.com/accounts/login/');
await (await browser.newPage()).goto('https://www.facebook.com/login');
console.log('Sign in in the opened window, then close it.');
await new Promise((r) => browser.on('disconnected', r));
