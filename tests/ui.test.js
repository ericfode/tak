const puppeteer = require('puppeteer');
const assert = require('assert');
const { spawn } = require('child_process');

const PORT = 8123;
const BASE_URL = `http://localhost:${PORT}/index.html`;

async function startServer() {
  // use python's simple HTTP server since repo used it before
  const proc = spawn('python3', ['-m', 'http.server', PORT]);
  // give server time to start
  await new Promise((res) => setTimeout(res, 2000));
  return proc;
}

async function runTests() {
  const server = await startServer();
  let browser;
  try {
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // helper to open page and initialize board
    async function openAndInit() {
      await page.goto(BASE_URL);
      await page.waitForSelector('#controls');
      await page.evaluate(() => {
        window.takGameApp.handleServerMessage({
          data: JSON.stringify({
            type: 'update',
            data: {
              board: Array(5).fill(0).map(() => Array(5).fill([])),
              currentPlayer: 'White',
              pieces: {
                White: { flats: 21, capstones: 1 },
                Black: { flats: 21, capstones: 1 }
              },
              board_size: 5,
              winner: null
            },
            message: 'init for test'
          })
        });
      });
    }

    // Test 1: board renders correctly
    await openAndInit();
    const cells = await page.$$('#game-board .board-cell');
    assert.strictEqual(cells.length, 25, 'board should render 5x5');
    console.log('Test 1 passed');

    // Test 2: placing a flat updates board
    await page.click('#game-board .board-cell[data-r="0"][data-c="0"]');
    const piece = await page.$('#game-board .board-cell[data-r="0"][data-c="0"] .piece');
    assert.ok(piece, 'piece should exist after click');
    console.log('Test 2 passed');

    await browser.close();
    server.kill();
  } catch (err) {
    console.error(err);
    if (browser) await browser.close();
    server.kill();
    process.exitCode = 1;
  }
}

runTests();
