// gmgn.js — GMGN security check integration (scaffolding for when Robinhood Chain is supported)
//
// Current GMGN support: sol, bsc, base, eth (Robinhood Chain NOT supported as of 2026-07).
// This module is a NO-OP until GMGN adds Robinhood. When that happens:
//   1. Set RPC_URL=https://gmgn.ai/defi/quotation/v1/tokens/security/robinhood/<addr>
//      (or use the official gmgn-cli)
//   2. Parse the response fields below
//   3. Wire checkSecurity() into screener.js evaluateAndNotify()
//
// GMGN security response fields (when supported):
//   is_honeypot: "yes" | "no"
//   owner_renounced: true | false
//   open_source: "yes" | "no"
//   buy_tax: number (0-1)
//   sell_tax: number (0-1)
//   top_10_holder_rate: number (0-1)
//   rug_ratio: number
//   sniper_count: number
//   is_blacklisted: boolean
//   lp_burned_pct: number
//
// Get API key at: https://gmgn.ai/ai

export async function checkSecurity(tokenAddr) {
  console.log('GMGN: Robinhood Chain not supported yet — skipping security check for', tokenAddr);
  return null;
}
