// trade_log.js — append-only JSON log of every arb execution.
// Imported by arb.js (not yet live). Safe to call with dummy data for testing.

import fs from 'node:fs';

const LOG_FILE = 'trade_log.json';

export function logTrade(trade) {
  const entry = {
    timestamp: new Date().toISOString(),
    ...trade,
  };

  let existing = [];
  try {
    const raw = fs.readFileSync(LOG_FILE, 'utf8');
    existing = JSON.parse(raw);
    if (!Array.isArray(existing)) existing = [];
  } catch {
    // File doesn't exist or is corrupt — start fresh
  }

  existing.push(entry);

  // Keep last 1000 entries to prevent unbounded growth
  if (existing.length > 1000) existing = existing.slice(-1000);

  fs.writeFileSync(LOG_FILE, JSON.stringify(existing, null, 2));
}

export function getTradeHistory(limit = 50) {
  try {
    const raw = fs.readFileSync(LOG_FILE, 'utf8');
    const all = JSON.parse(raw);
    if (!Array.isArray(all)) return [];
    return all.slice(-limit).reverse();
  } catch {
    return [];
  }
}

export function getTradeStats() {
  const all = getTradeHistory(1000);
  if (!all.length) return { total: 0, successes: 0, fails: 0, totalProfitEth: 0 };

  const successes = all.filter(t => t.success);
  const fails = all.filter(t => !t.success);
  const totalProfitEth = successes.reduce((s, t) => s + (Number(t.profitEth) || 0), 0);

  return {
    total: all.length,
    successes: successes.length,
    fails: fails.length,
    totalProfitEth,
    lastTrade: all[0]?.timestamp || null,
  };
}
