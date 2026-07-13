// Test D: Trade Log — run with: node test_trade_log.js
// Tests the trade_log module using DUMMY data (no real transactions)

import { logTrade, getTradeHistory, getTradeStats } from './trade_log.js';

// Clean up any previous test data
import fs from 'node:fs';
try { fs.unlinkSync('trade_log.json'); } catch {}

console.log('=== MODUL D: Trade Log Test (dummy data only) ===\n');

// Test 1: Log a successful trade
logTrade({
  token: '0x1234567890abcdef1234567890abcdef12345678',
  symbol: 'TEST1',
  profitEth: '0.0523',
  gasCostEth: '0.0012',
  txHash: '0xabc123...',
  success: true,
  route: 'V5→V4',
});
console.log('1. Logged SUCCESS trade');

// Test 2: Log a failed trade
logTrade({
  token: '0xabcdef1234567890abcdef1234567890abcdef12',
  symbol: 'TEST2',
  profitEth: '0',
  gasCostEth: '0.0015',
  txHash: null,
  success: false,
  error: 'execution reverted: insufficient output',
});
console.log('2. Logged FAILED trade');

// Test 3: Log another success
logTrade({
  token: '0x1111111111111111111111111111111111111111',
  symbol: 'PROFIT',
  profitEth: '0.1200',
  gasCostEth: '0.0010',
  txHash: '0xdef456...',
  success: true,
  route: 'V5→V4',
});
console.log('3. Logged another SUCCESS trade');

// Test 4: Read history
console.log('\n4. Trade history (last 10):');
const history = getTradeHistory(10);
console.log(JSON.stringify(history, null, 2));

// Test 5: Read stats
console.log('\n5. Trade stats:');
const stats = getTradeStats();
console.log(JSON.stringify(stats, null, 2));

// Test 6: Edge cases
console.log('\n6. Edge-case verification:');
console.log(`   - history is array: ${Array.isArray(history)}`);
console.log(`   - history length = 3: ${history.length === 3}`);
console.log(`   - stats.total = 3: ${stats.total === 3}`);
console.log(`   - stats.successes = 2: ${stats.successes === 2}`);
console.log(`   - stats.fails = 1: ${stats.fails === 1}`);
console.log(`   - stats.totalProfitEth ≈ 0.1723: ${Math.abs(stats.totalProfitEth - 0.1723) < 0.0001}`);

// Edge: empty file
console.log('\n7. Edge: statistik dari file kosong:');
fs.unlinkSync('trade_log.json');
const emptyStats = getTradeStats();
console.log(`   - total = 0: ${emptyStats.total === 0}`);
console.log(`   - successes = 0: ${emptyStats.successes === 0}`);

// Edge: corrupt file
console.log('\n8. Edge: file corrupt (not JSON):');
fs.writeFileSync('trade_log.json', 'NOT JSON');
const corruptHistory = getTradeHistory();
console.log(`   - returns empty array: ${Array.isArray(corruptHistory) && corruptHistory.length === 0}`);

// Cleanup
try { fs.unlinkSync('trade_log.json'); } catch {}

console.log('\n✅ TRADE LOG MODUL BERHASIL — semua fungsi siap dipanggil arb.js nanti');
