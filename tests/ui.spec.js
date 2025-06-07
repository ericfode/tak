const { test, expect } = require('@playwright/test');

const baseURL = 'http://localhost:8123/index.html';

async function openAndInit(page) {
  await page.goto(baseURL);
  await page.waitForSelector('#controls');
  // send fake server update to render board
  await page.evaluate(() => {
    window.takGameApp.handleServerMessage({
      data: JSON.stringify({
        type: 'update',
        data: {
          board: Array(5).fill(0).map(() => Array(5).fill([])),
          currentPlayer: 'White',
          pieces: { White: { flats: 21, capstones: 1 }, Black: { flats: 21, capstones: 1 } },
          board_size: 5,
          winner: null
        },
        message: 'init for test'
      })
    });
  });
}

test('board renders 5x5 after init', async ({ page }) => {
  await openAndInit(page);
  const cells = await page.$$('#game-board .board-cell');
  expect(cells.length).toBe(25);
});

test('placing a flat updates board', async ({ page }) => {
  await openAndInit(page);
  await page.click('#game-board .board-cell[data-r="0"][data-c="0"]');
  const piece = await page.$('#game-board .board-cell[data-r="0"][data-c="0"] .piece');
  expect(piece).not.toBeNull();
});
