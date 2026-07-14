import 'dotenv/config';
import fs from 'node:fs';
import { Contract, formatEther, formatUnits, AbiCoder, keccak256 } from 'ethers';
import { makeProvider } from './provider.js';
import { V3, V4, V4_NFPM, LP_V3_CASHCAT_WETH, LP_V4_CASHCAT_USDG } from './config.js';
import { V3_NFPM_ABI, ERC20_ABI } from './abis.js';
import { UC } from './config.js';
import { tg } from './telegram.js';

const abi = AbiCoder.defaultAbiCoder();
const STATE_FILE = new URL('./lp_state.json', import.meta.url);
const CASHCAT = LP_V3_CASHCAT_WETH.token0;
const WETH = LP_V3_CASHCAT_WETH.token1;
const { sqrt } = Math;

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { positions: [], monitor: {} }; }
}
function saveState(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

function computeV4PoolId(key) {
  return keccak256(abi.encode(
    ['tuple(address,address,uint24,int24,address)'],
    [[key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]]
  ));
}

function tickToPrice(tick) {
  return 1.0001 ** tick;
}

function ilConcentrated(entryPrice, currentPrice, tickLower, tickUpper) {
  const r = currentPrice / entryPrice;
  const sqrtR = sqrt(r);
  const priceLower = tickToPrice(tickLower);
  const priceUpper = tickToPrice(tickUpper);

  if (currentPrice <= priceLower) return -(1 - 1 / r);
  if (currentPrice >= priceUpper) return -(r - 1);
  return 2 * sqrtR / (1 + r) - 1;
}

async function getV3Position(provider, tokenId) {
  try {
    const nfpm = new Contract(V3.nfpm, V3_NFPM_ABI, provider);
    const pos = await nfpm.positions.staticCall(tokenId);
    return pos;
  } catch {
    return null;
  }
}

async function getPoolSlot0(provider) {
  const slot0Raw = await provider.call({ to: LP_V3_CASHCAT_WETH.pool, data: '0x3850c7bd' });
  const [sqrtPriceX96, tick] = AbiCoder.defaultAbiCoder().decode(
    ['uint160', 'int24', 'uint16', 'uint16', 'uint16', 'uint8', 'bool'], slot0Raw
  );
  return { sqrtPriceX96: Number(sqrtPriceX96), tick: Number(tick) };
}

async function checkV3(provider, entry, config) {
  if (!entry?.tokenId) return null;
  const tokenId = BigInt(entry.tokenId);
  const pos = await getV3Position(provider, tokenId);
  if (!pos) return { error: 'position burned or not found' };

  const { tick: currentTick, sqrtPriceX96 } = await getPoolSlot0(provider);
  const price = tickToPrice(currentTick);
  const entryPrice = tickToPrice(Number(entry._entryTick ?? currentTick));

  const ilPct = ilConcentrated(entryPrice, price, Number(pos.tickLower), Number(pos.tickUpper)) * 100;
  const feeValueEth = Number(formatEther(pos.tokensOwed1)) + Number(formatUnits(pos.tokensOwed0, 18)) * price;
  const outOfRange = currentTick < Number(pos.tickLower) || currentTick > Number(pos.tickUpper);
  const threshold = Number(config.ilExitThresholdPct);
  const ilExceedsThreshold = ilPct < -threshold;

  return {
    dex: 'V3',
    pool: LP_V3_CASHCAT_WETH.symbol,
    tokenId: entry.tokenId,
    currentTick,
    tickLower: Number(pos.tickLower),
    tickUpper: Number(pos.tickUpper),
    price,
    entryPrice,
    ilPct,
    feeValueEth,
    liquidity: formatUnits(pos.liquidity, 18),
    outOfRange,
    ilExceedsThreshold,
    shouldNotify: ilExceedsThreshold || outOfRange,
  };
}

async function checkV4(provider, entry, config) {
  if (!config.enableV4CashcatUsdg) return null;
  if (entry && entry.dex !== 'V4') return null;

  const stateView = new Contract(V4.poolManager, [
    'function getSlot0(bytes32) view returns (uint160, int24, uint24, uint24)',
  ], provider);
  const poolId = computeV4PoolId(LP_V4_CASHCAT_USDG.key);

  let currentTick;
  try {
    const [, tick] = await stateView.getSlot0.staticCall(poolId);
    currentTick = Number(tick);
  } catch {
    return { error: 'V4 pool not initialized' };
  }

  return {
    dex: 'V4', pool: LP_V4_CASHCAT_USDG.symbol, currentTick, price: tickToPrice(currentTick),
    note: 'V4 monitoring limited (no positions() equivalent confirmed yet)',
  };
}

async function monitorOnce(provider, config) {
  const state = loadState();
  state.monitor ??= {};
  state.monitor.consecutiveFails ??= 0;

  if (!state.positions.length) {
    console.log('No positions in state. Run lp_deposit.js first.');
    saveState(state);
    return;
  }

  console.log(`\n=== LP Monitor ${new Date().toISOString()} ===`);
  let anyFail = false;

  for (const entry of state.positions) {
    if (entry.dex === 'V3') {
      const result = await checkV3(provider, entry, config);
      if (!result || result.error) {
        console.log(`  V3 #${entry.tokenId}: ${result?.error ?? 'null'}`);
        anyFail = true;
        continue;
      }

      const rangePct = ((result.currentTick - result.tickLower) / (result.tickUpper - result.tickLower) * 100).toFixed(1);
      const statusIcon = result.outOfRange ? 'OUT' : 'IN';
      console.log(`  V3 #${result.tokenId}: IL=${result.ilPct.toFixed(2)}% fee=${result.feeValueEth.toFixed(6)}ETH liq=${result.liquidity.slice(0,8)} range=${rangePct}% [${statusIcon}]`);

      if (result.shouldNotify) {
        const parts = [
          `\u{1F514} LP Monitor: ${result.pool} #${result.tokenId}`,
          `IL: ${result.ilPct.toFixed(2)}% (threshold: -${config.ilExitThresholdPct}%)`,
          `Fees earned: ${result.feeValueEth.toFixed(6)} ETH`,
          `Entry: ${result.entryPrice.toFixed(8)} | Now: ${result.price.toFixed(8)}`,
        ];
        if (result.outOfRange) parts.push('\u{26A0}\u{FE0F} OUT OF RANGE');
        if (result.ilExceedsThreshold) parts.push('\u{26A0}\u{FE0F} IL exceeds threshold');
        await tg(parts.join('\n')).catch(() => {});
      }
    } else if (entry.dex === 'V4') {
      const result = await checkV4(provider, entry, config);
      if (result?.error) {
        console.log(`  V4: ${result.error}`);
      } else {
        console.log(`  V4: tick=${result.currentTick} price=${result.price.toFixed(8)} USDG/CASHCAT`);
      }
    }
  }

  // Circuit breaker: persist consecutive failures
  if (anyFail) {
    state.monitor.consecutiveFails++;
  } else {
    state.monitor.consecutiveFails = 0;
  }

  if (state.monitor.consecutiveFails >= Number(config.maxConsecutiveFails)) {
    const msg = `\u{26A0}\u{FE0F} LP Monitor circuit breaker: ${state.monitor.consecutiveFails} consecutive failures`;
    console.log(`\n${msg}`);
    await tg(msg).catch(() => {});
  }

  saveState(state);
}

async function main() {
  const provider = await makeProvider();
  const config = UC('lp');
  const isWatch = process.env.WATCH === '1';

  if (isWatch) {
    console.log(`Continuous monitoring every ${config.monitorIntervalMs}ms. Ctrl+C to stop.`);
    while (true) {
      try { await monitorOnce(provider, config); }
      catch (e) { console.error(`Monitor error: ${e.shortMessage || e.message}`); }
      await new Promise(r => setTimeout(r, config.monitorIntervalMs));
    }
  } else {
    await monitorOnce(provider, config);
  }
}

main().catch(e => { console.error('FATAL:', e.shortMessage || e.message); process.exit(1); });
