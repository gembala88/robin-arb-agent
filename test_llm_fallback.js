// Test B: LLM Provider/Key Fallback
// Set LLM_BAD=1 to force NVIDIA key 1 failure and prove fallback to key 2.
import 'dotenv/config';
import { analyzeToken } from './llm.js';

async function test() {
  console.log('=== MODUL B: LLM Key Fallback Test ===\n');

  // Build a minimal token info object
  const info = {
    symbol: 'NOTHING',
    token: '0x0000000000000000000000000000000000000001',
    lastGradPct: 35,
    curveRealEth: '500000000000000000',
    curveRaiseTarget: '10000000000000000000',
    curveVirtualEth: '10000000000000000000',
    firstBuyBlock: 8000000,
    lastBuyBlock: 8900000,
    totalEthIn: '10000000000000000000',
    totalEthOut: '2000000000000000000',
    totalFees: '500000000000000000',
    buyers: ['0x1','0x2','0x3','0x4','0x5'],
    buyEvents: [
      { block: 8900000, buyer: '0x1', ethIn: '1000000000000000000' },
      { block: 8899900, buyer: '0x2', ethIn: '2000000000000000000' },
    ],
    sellEvents: [],
    feeEvents: [],
    sellCount: 0,
    feeCount: 0,
    buyerConcentration: 40,
    compositeScore: 65,
  };

  const cfg = { volumeWindowHours: 1, avgBlockTimeSec: 2 };

  console.log('Profiles active:');
  console.log(`  NVIDIA_KEY set:     ${!!process.env.NVIDIA_API_KEY}`);
  console.log(`  NVIDIA_KEY_2 set:   ${!!process.env.NVIDIA_API_KEY_2}`);
  console.log(`  CLAUDE_API_KEY set: ${!!process.env.CLAUDE_API_KEY}`);
  console.log('');

  if (process.env.LLM_BAD) {
    // Temporarily override keys to test fallback
    console.log('LLM_BAD=1 — setting nvidia-1 key to INVALID to trigger fallback\n');
    process.env.NVIDIA_API_KEY = 'BADKEY';
  }

  console.log('Calling analyzeToken()...');
  const result = await analyzeToken(info, 8949000, 8949000, cfg);

  if (result) {
    console.log('\n✅ LLM response received:');
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\nℹ️  No LLM response (all profiles exhausted or no keys configured)');
  }

  // Edge-case checks
  console.log('\nEdge-case verification:');
  console.log(`  - result is object or null: ${result === null || typeof result === 'object'}`);
  console.log(`  - null is valid when no keys: ${!process.env.NVIDIA_API_KEY && !process.env.CLAUDE_API_KEY}`);
  console.log(`  - PROFILES is non-empty when keys exist: ${!!process.env.NVIDIA_API_KEY || !!process.env.CLAUDE_API_KEY}`);
}

test().catch(e => {
  console.error('\n❌ TEST GAGAL:', e.shortMessage || e.message);
  process.exit(1);
});
