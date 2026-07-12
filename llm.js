import { formatEther } from 'ethers';

// Provider-agnostic LLM layer. Default: NVIDIA NIM (free tier, OpenAI-compatible).
// Claude is supported as alternative. Set LLM_PROVIDER=claude and CLAUDE_API_KEY.

const PROVIDER  = (process.env.LLM_PROVIDER || 'nvidia').toLowerCase();
const NVIDIA_KEY = process.env.NVIDIA_API_KEY;
const CLAUDE_KEY = process.env.CLAUDE_API_KEY;
const NVIDIA_MODEL = process.env.LLM_MODEL || 'nvidia/llama-3.3-nemotron-super-49b-v1.5';
const CLAUDE_MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-20250514';

function buildPrompt(info, currentBlock, head, cfg) {
  const vol1h = Number(formatEther(computeVolume(info, currentBlock, cfg.volumeWindowHours, cfg.avgBlockTimeSec)));
  const blocks48h = Math.floor(48 * 3600 / cfg.avgBlockTimeSec);
  const cutoff48h = currentBlock - blocks48h;
  const recent48hBuys = info.buyEvents?.filter(e => e.block >= cutoff48h) || [];
  const recent48hBuyers = new Set(recent48hBuys.map(e => e.buyer));
  const vol48h = recent48hBuys.reduce((s, e) => s + Number(formatEther(BigInt(e.ethIn))), 0);
  const buyers48h = recent48hBuyers.size;

  return `You are an arbitrage screening AI for Robinhood Chain (chainId 4663). 
A bonding-curve token is being evaluated for Uniswap V4 pool creation + atomic arbitrage.
Analyze the data below and decide: is this token worth creating a V4 pool for?
Respond in JSON only: {"decision":"YES/NO/MAYBE","confidence":"LOW/MED/HIGH","reason":"1-2 sentence","risks":["risk1","risk2"],"score":0-100}

TOKEN DATA:
- Symbol: ${info.symbol}
- Address: ${info.token}
- Graduation: ${info.lastGradPct.toFixed(1)}% (realEth/raiseTarget)
- Real ETH: ${formatEther(BigInt(info.curveRealEth || '0'))} ETH / Raise Target: ${formatEther(BigInt(info.curveRaiseTarget || '0'))} ETH
- Virtual ETH: ${formatEther(BigInt(info.curveVirtualEth || '0'))} ETH
- Age: ${((currentBlock - info.firstBuyBlock) * cfg.avgBlockTimeSec / 3600).toFixed(1)} hours
- All-time unique buyers: ${info.buyers?.length || 0}
- Buyers in last 48h: ${buyers48h} of ${info.buyers?.length || 0} total
- Volume 48h: ${vol48h.toFixed(4)} ETH
- Volume 1h: ${vol1h.toFixed(4)} ETH
- All-time total buys: ${info.totalEthIn ? formatEther(BigInt(info.totalEthIn)) : '0'} ETH
- Sell events count: ${info.sellCount || 0}
- FeeCollected events: ${info.feeCount || 0}
- Top buyer concentration: ${info.buyerConcentration ? info.buyerConcentration.toFixed(1) : '?'}% (lower = more distributed)
- Last buy block: ${info.lastBuyBlock} (${currentBlock - info.lastBuyBlock} blocks ago)
- First buy block: ${info.firstBuyBlock}
- Chain head: ${head}

DECISION CRITERIA:
- YES = strong fundamentals, active community, good distribution
- MAYBE = decent but needs monitoring
- NO = dead token, honeypot, scam pattern, or insufficient activity`;
}

function computeVolume(info, currentBlock, windowHours, blockTime) {
  const cutoff = currentBlock - Math.floor(windowHours * 3600 / blockTime);
  const events = info.buyEvents || [];
  let sum = 0n;
  for (const e of events) {
    if (e.block >= cutoff) sum += BigInt(e.ethIn);
  }
  return sum;
}

async function callNVIDIA(prompt) {
  const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${NVIDIA_KEY}`,
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1024,
    }),
  });
  const j = await r.json();
  return j?.choices?.[0]?.message?.content || null;
}

async function callClaude(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': CLAUDE_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const j = await r.json();
  return j?.content?.[0]?.text || null;
}

function parseLLMResponse(text) {
  if (!text) return null;
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}') + 1;
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    return JSON.parse(text.slice(jsonStart, jsonEnd));
  }
  return { decision: 'MAYBE', confidence: 'LOW', reason: 'parse error', risks: [], score: 0 };
}

export async function analyzeToken(info, currentBlock, head, cfg) {
  const key = PROVIDER === 'claude' ? CLAUDE_KEY : NVIDIA_KEY;
  if (!key) return null;

  const prompt = buildPrompt(info, currentBlock, head, cfg);
  try {
    const text = PROVIDER === 'claude' ? await callClaude(prompt) : await callNVIDIA(prompt);
    return parseLLMResponse(text);
  } catch {
    return null;
  }
}
