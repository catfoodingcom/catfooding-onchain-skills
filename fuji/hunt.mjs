#!/usr/bin/env node
// Spot the fake: read-only hunt for tokenized-stock tokens on mainnet EVM chains (Avalanche by default).
// Reads only. It loads no key and has no way to sign or send anything: there is no wallet code in this file.
// Never buy, approve or interact with a token it finds.
//
// Three checks for every token that carries a stock's name:
//   1. Is it real?   Only the chain can say: who controls the contract (its proxy admin or beacon).
//                    Names, symbols, pools and liquidity are never evidence; copies copy all of them.
//   2. Is the price fair?  The token's pool price against the real share price.
//   3. Can you get out?    Pool liquidity and trades in the last 24 hours.

import { createPublicClient, http, getAddress } from "viem";

// The chains the hunt reads. Avalanche is where the kit's cats live (on Fuji); X Layer and Base are the other cat
// chains; Ethereum and Robinhood Chain are where CoAgentic Markets watches tokenized stocks. Reads only, on all of them.
const CHAINS = {
  avalanche: { name: "Avalanche C-Chain", id: 43114, gecko: "avax", rpc: "https://api.avax.network/ext/bc/C/rpc" },
  xlayer: { name: "X Layer", id: 196, gecko: "x-layer", rpc: "https://rpc.xlayer.tech" },
  base: { name: "Base", id: 8453, gecko: "base", rpc: "https://mainnet.base.org" },
  ethereum: { name: "Ethereum", id: 1, gecko: "eth", rpc: "https://ethereum-rpc.publicnode.com" },
  robinhood: { name: "Robinhood Chain", id: 4663, gecko: "robinhood", rpc: "https://rpc.mainnet.chain.robinhood.com" },
};
const SITE = process.env.CATFOODING_SITE || "https://jess.catfooding.com";
const GECKO = "https://api.geckoterminal.com/api/v2";
const UA = { "User-Agent": "catfooding-hunt/0.1", Accept: "application/json" };
const EXIT_MIN_USD = 10_000; // below this, selling even a small amount moves the price a lot
const EXIT_MIN_VOLUME_USD = 1_000; // and someone has to be trading it: a pool nobody uses is no exit

// How to recognise each issuer's own tokens on an EVM chain. A token passes only if the chain shows it was
// created under the issuer's control. `anchor` is the issuer-published fact each fingerprint comes from.
const ISSUERS = {
  xstocks: {
    name: "xStocks",
    claims: (n, s, t) => /xstock/i.test(n) || new RegExp(`^w?${t}x$`, "i").test(s),
    fingerprint: { proxyAdmin: "0x696c685a02a1fc6e2aacbe26cd6695f4f4a6a085" },
    anchor: "xStocks' own EVM tokens (e.g. 0x707c6bc22b6cf83b930b0a68c3bb20a94836de71, listed on xstocks.fi, same address on every EVM chain) all have this proxy admin.",
  },
  ondo: {
    name: "Ondo",
    claims: (n, s, t) => /ondo/i.test(n) || new RegExp(`^${t}on$`, "i").test(s),
    fingerprint: { beacon: "0x985462c9aa4d6c3ad59ae6e1e9c0c11347ed1598" },
    anchor: "Ondo's AAPLon on Ethereum (0x14c3abf95cb9c93a8b82c1cdcb76d72cb87b2d4c, from Ondo's API documentation) is a proxy on this beacon.",
  },
  dinari: {
    name: "Dinari",
    claims: (n, s, t) => /dinari/i.test(n) || new RegExp(`^${t}\\.d$`, "i").test(s),
    fingerprint: null, // Dinari doesn't publish its contract addresses (docs checked 8 Nov 2026)
    reference: { beacon: "0x4062d9cbf85da2913880a3a5641cf05e85774f27" },
    anchor: "Dinari publishes no contract addresses to check against. For comparison: Dinari's Apple token on Ethereum (0x68E670D2f9B792f034a1826cF4A8F180C9952Cb6, as labelled on Etherscan) is a small proxy on this beacon.",
  },
};

// Robinhood's own tokens on Robinhood Chain share one beacon. Not issuer-published, so a match is reported as unanchored.
ISSUERS.robinhood = {
  name: "Robinhood",
  claims: (n) => /robinhood token/i.test(n),
  fingerprint: { beacon: "0xe10b6f6b275de231345c20d14ab812db62151b00" },
  unanchored: true,
  anchor: "Robinhood's tokens on Robinhood Chain (six checked 21 Sep 2026) are all proxies on this beacon. Robinhood doesn't publish an address list, so this is not anchored to the issuer.",
};

// Families we know but can't settle either way. "Wrapped <Company> xStock" tokens (e.g. wTSLAx on X Layer) share one
// proxy admin that isn't xStocks' own: they may be the issuer's wrapped product under a separate setup.
const UNCONFIRMED_FAMILIES = [
  { proxyAdmin: "0x312063009e74142339edc92bcff6cfcfaa958bfa", note: "one of the 'Wrapped … xStock' family: they share a proxy admin that isn't xStocks' own, and may be xStocks' wrapped product under a separate setup. Not confirmed either way" },
];
// A wrapper holds another token. The wrapper is never the issuer's own token, but it may hold the real one.
const isWrapper = (n, s) => /\bwrapped\b/i.test(n) || /^(w|fw)[A-Z]/.test(s);

// Stocks the hunt knows, with the company names a copy might use.
const STOCKS = {
  TSLA: ["Tesla"], AAPL: ["Apple"], NVDA: ["NVIDIA", "Nvidia"], MSFT: ["Microsoft"], AMZN: ["Amazon"],
  GOOGL: ["Alphabet", "Google"], META: ["Meta Platforms"], COIN: ["Coinbase"], MSTR: ["MicroStrategy", "Strategy"],
  CRCL: ["Circle"], HOOD: ["Robinhood"], SPCX: ["SpaceX", "Space Exploration"], SPY: ["S&P 500", "SP500", "SPDR"], QQQ: ["Nasdaq", "QQQ"],
};
const SLOT = {
  implementation: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  proxyAdmin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
  beacon: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
};

// ---- arguments ----
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const ticker = (argv.find((a) => !a.startsWith("--")) || "TSLA").toUpperCase();
const chainKey = (argv.find((a) => a.startsWith("--chain="))?.split("=")[1] || "avalanche").toLowerCase();
const out = (lines, data) => console.log(JSON_OUT ? JSON.stringify(data, null, 2) : lines.join("\n"));
const fail = (message) => {
  if (JSON_OUT) console.log(JSON.stringify({ ok: false, error: message }));
  else console.error(`Stopped: ${message}`);
  process.exit(1);
};
const HELP = `Spot the fake, read-only, on mainnet. Loads no key; sends nothing.

  node hunt.mjs <STOCK> [--chain=<chain>] [--json]     e.g. node hunt.mjs TSLA --chain=xlayer

Stocks: ${Object.keys(STOCKS).join(", ")}
Chains: ${Object.keys(CHAINS).join(", ")} (default avalanche)`;
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}
if (!STOCKS[ticker]) fail(`the hunt doesn't know ${ticker}. Stocks: ${Object.keys(STOCKS).join(", ")}.`);
const CHAIN = CHAINS[chainKey];
if (!CHAIN) fail(`the hunt doesn't read ${chainKey}. Chains: ${Object.keys(CHAINS).join(", ")}.`);
const RPC = process.env.HUNT_RPC || CHAIN.rpc;

const pub = createPublicClient({ transport: http(RPC) }); // reads only: no account, no wallet client
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url, what) {
  // A room on one Wi-Fi shares GeckoTerminal's per-address limit, so wait and retry for up to about a minute.
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
      if (r.status === 429) {
        if (!JSON_OUT && i === 0) console.error('GeckoTerminal is busy (many people hunting at once). Waiting and retrying…');
        await sleep(5000 * (i + 1));
        continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === 4) fail(`couldn't read ${what} (${e.message}). Nothing was sent. Try again in a minute: node hunt.mjs ${ticker} --chain=${chainKey}`);
      await sleep(3000);
    }
  }
  fail(`${what} is rate-limiting. Nothing was sent. Try again in a minute: node hunt.mjs ${ticker} --chain=${chainKey}`);
}
const slotAddress = (v) => (!v || BigInt(v) === 0n ? null : getAddress(`0x${v.slice(-40)}`).toLowerCase());
const usd = (v) => (v == null ? "–" : `$${Math.round(v).toLocaleString("en-US")}`);
const pct = (v) => (v == null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
const decode = (s) => String(s ?? "").replace(/&amp;/g, "&");
const price = (v) => (!v ? "–" : v < 0.0001 ? "under $0.0001" : `$${v < 1 ? v.toPrecision(3) : v.toFixed(2)}`);
const of = (name) => (name.endsWith("s") ? `${name}'` : `${name}'s`);
// Calls itself a tokenized stock (or uses an issuer-style brand) without naming an issuer we can check.
const claimsStock = (n) => /tokeni[sz]ed|\b[a-z]?stocks?\b|hyperliquid/i.test(n);

async function main() {
  const id = await pub.getChainId().catch((e) => fail(`could not reach the ${CHAIN.name} RPC (${e.shortMessage || e.message}).`));
  if (id !== CHAIN.id) fail(`the RPC is on chain ${id}, not ${CHAIN.name} (${CHAIN.id}).`);

  // 1. Find: every DEX pool on the chain that turns up for the stock's ticker or company names.
  const pools = new Map();
  for (const q of [ticker, ...STOCKS[ticker]]) {
    const d = await getJson(`${GECKO}/search/pools?network=${CHAIN.gecko}&query=${encodeURIComponent(q)}`, "GeckoTerminal's pool search");
    for (const p of d.data ?? []) pools.set(p.id, p);
    await sleep(2100); // GeckoTerminal's free API allows about 30 calls a minute
  }
  const byToken = new Map();
  for (const p of pools.values()) {
    const a = p.attributes;
    for (const side of ["base_token", "quote_token"]) {
      const addr = p.relationships[side].data.id.split("_")[1].toLowerCase();
      const price = Number(side === "base_token" ? a.base_token_price_usd : a.quote_token_price_usd);
      const t = byToken.get(addr) ?? { pools: [] };
      t.pools.push({ address: a.address, name: decode(a.name), liquidityUsd: Number(a.reserve_in_usd ?? 0), volume24hUsd: Number(a.volume_usd?.h24 ?? 0), priceUsd: price, createdAt: a.pool_created_at });
      byToken.set(addr, t);
    }
  }
  const addrs = [...byToken.keys()];
  const meta = new Map();
  for (let i = 0; i < addrs.length; i += 30) {
    const d = await getJson(`${GECKO}/networks/${CHAIN.gecko}/tokens/multi/${addrs.slice(i, i + 30).join(",")}`, "GeckoTerminal's token data");
    for (const t of d.data ?? []) meta.set(t.attributes.address.toLowerCase(), t.attributes);
    await sleep(2100);
  }
  const names = STOCKS[ticker].map((n) => n.toLowerCase());
  const carriesName = (n, s) => new RegExp(`^${ticker}(x|on|\\.d|b|r)?$`, "i").test(s) || names.some((c) => n.toLowerCase().includes(c));
  const candidates = addrs
    .map((a) => ({ address: a, name: decode(meta.get(a)?.name), symbol: meta.get(a)?.symbol ?? "", pools: byToken.get(a).pools }))
    .filter((t) => carriesName(t.name, t.symbol));

  // The real share price, for the fair-price check.
  let share = null;
  try {
    const m = await (await fetch(`${SITE}/api/market/stocks`, { signal: AbortSignal.timeout(15000) })).json();
    share = m?.stocks?.find((s) => s.stock === ticker)?.sharePrice ?? null;
  } catch {
    // no share price: the fair-price check says so
  }

  // 2. Check each one on the chain.
  const tokens = [];
  for (const t of candidates) {
    const address = getAddress(t.address);
    const [code, impl, admin, beacon] = await Promise.all([
      pub.getCode({ address }),
      ...Object.values(SLOT).map((slot) => pub.getStorageAt({ address, slot })),
    ]);
    // A 45-byte EIP-1167 clone keeps its target in the code itself, not in a storage slot.
    const clone = code && /^0x363d3d373d3d3d363d73[0-9a-f]{40}5af43d82803e903d91602b57fd5bf3$/i.test(code) ? `0x${code.slice(22, 62)}`.toLowerCase() : null;
    const fp = { codeBytes: code ? (code.length - 2) / 2 : 0, implementation: slotAddress(impl), proxyAdmin: slotAddress(admin), beacon: slotAddress(beacon), cloneOf: clone };
    const liquidityUsd = t.pools.reduce((s, p) => s + p.liquidityUsd, 0);
    const volume24hUsd = t.pools.reduce((s, p) => s + p.volume24hUsd, 0);
    const best = [...t.pools].sort((a, b) => b.liquidityUsd - a.liquidityUsd)[0];
    const premiumPct = share && best?.priceUsd ? (best.priceUsd / share - 1) * 100 : null;
    const pricedLikeStock = premiumPct !== null && Math.abs(premiumPct) < 20;
    const claimed = Object.entries(ISSUERS).find(([, i]) => i.claims(t.name, t.symbol, ticker))?.[0] ?? null;
    let verdict, why;
    const family = UNCONFIRMED_FAMILIES.find((f) => f.proxyAdmin === fp.proxyAdmin);
    const issuerMatch = claimed && ISSUERS[claimed].fingerprint && Object.entries(ISSUERS[claimed].fingerprint).every(([k, v]) => fp[k] === v);
    if (family && !issuerMatch) {
      verdict = "unconfirmed";
      why = family.note;
    } else if (!issuerMatch && isWrapper(t.name, t.symbol)) {
      verdict = "unconfirmed";
      why = `a wrapper${claimed ? ` using ${of(ISSUERS[claimed].name)} name` : ""}: it isn't the issuer's own token, but it may hold the real one. Check what it wraps before trusting it`;
    } else if (!claimed && pricedLikeStock) {
      verdict = "unconfirmed";
      why = "names no issuer, yet its pool prices it near the share: it may be run as a stock token, but there's no issuer to check it against";
    } else if (!claimed && claimsStock(t.name)) {
      verdict = "unconfirmed";
      why = "calls itself a tokenized stock, but names no issuer that publishes addresses to check against";
    } else if (!claimed) {
      verdict = "no-issuer";
      why = "doesn't claim to be the stock, only borrows the name";
    } else if (ISSUERS[claimed].fingerprint) {
      const [k, v] = Object.entries(ISSUERS[claimed].fingerprint)[0];
      const ok = fp[k] === v;
      verdict = ok ? "issuer" : "lookalike";
      const nm = ISSUERS[claimed].name;
      why = ok ? `${k} matches ${of(nm)}${ISSUERS[claimed].unanchored ? " (not anchored: the issuer publishes no address list)" : ""}` : `uses ${of(nm)} name, but its ${k} isn't ${of(nm)}${fp.cloneOf ? ` (it's a minimal clone of ${fp.cloneOf}, not the issuer's proxy)` : fp.implementation || fp.beacon ? "" : " (it isn't a proxy at all)"}`;
    } else {
      verdict = "unconfirmed";
      const ref = ISSUERS[claimed].reference;
      const likeRef = ref && fp.beacon === ref.beacon;
      why = `uses ${of(ISSUERS[claimed].name)} name; ${ISSUERS[claimed].name} publishes no contract addresses to check against${likeRef ? ", though it is a proxy on the same beacon as Dinari's Ethereum tokens" : `, and unlike Dinari's tokens on Ethereum it ${fp.beacon ? "is on a different beacon" : "isn't a proxy"}`}`;
    }
    const canExit = liquidityUsd >= EXIT_MIN_USD && volume24hUsd >= EXIT_MIN_VOLUME_USD;
    tokens.push({
      address, name: t.name, symbol: t.symbol, claimedIssuer: claimed ? ISSUERS[claimed].name : null, verdict, why, ...fp,
      priceUsd: best?.priceUsd ?? null, premiumPct, liquidityUsd, volume24hUsd, canExit, pools: t.pools.length,
      firstPool: t.pools.map((p) => p.createdAt).filter(Boolean).sort()[0] ?? null,
    });
  }
  const order = { issuer: 0, lookalike: 1, unconfirmed: 2, "no-issuer": 3 };
  tokens.sort((a, b) => order[a.verdict] - order[b.verdict] || b.liquidityUsd - a.liquidityUsd);

  // Copies often share one contract: the same code size under many names.
  const sizes = {};
  for (const t of tokens) (sizes[t.codeBytes] ??= []).push(t);
  const families = Object.entries(sizes)
    .filter(([, ts]) => ts.length >= 3)
    .map(([bytes, ts]) => ({ codeBytes: Number(bytes), tokens: ts.length, issuersNamed: [...new Set(ts.map((t) => t.claimedIssuer ?? "none"))] }));

  // 3. Report.
  const count = (v) => tokens.filter((t) => t.verdict === v).length;
  const LABEL = { issuer: "FROM ISSUER", lookalike: "LOOK-ALIKE", unconfirmed: "CAN'T CONFIRM", "no-issuer": "BORROWS NAME" };
  const lines = [
    `Spot the fake: ${ticker} on ${CHAIN.name} · ${new Date().toISOString().slice(0, 16)}Z · read-only, nothing sent`,
    `Share price: ${share ? `$${share}` : "not available right now"}`,
    "",
    ...tokens.flatMap((t) => [
      `${LABEL[t.verdict].padEnd(13)} ${t.symbol.padEnd(9)} ${t.name.slice(0, 42).padEnd(42)} ${t.address}`,
      `              ${t.why}`,
      `              price ${price(t.priceUsd)} (${pct(t.premiumPct)} vs share) · liquidity ${usd(t.liquidityUsd)} · 24h trades ${usd(t.volume24hUsd)} · ${t.canExit ? "you could sell" : "no real exit"} · ${t.codeBytes} bytes`,
    ]),
    "",
    `${tokens.length} tokens carry ${ticker}'s name. From the issuer they name: ${count("issuer")}. Look-alikes: ${count("lookalike")}. Can't confirm: ${count("unconfirmed")}. Only borrow the name: ${count("no-issuer")}.`,
    `Could you sell any? ${tokens.filter((t) => t.canExit).length ? tokens.filter((t) => t.canExit).map((t) => t.symbol).join(", ") : `none: no token has ${usd(EXIT_MIN_USD)} of liquidity and ${usd(EXIT_MIN_VOLUME_USD)} of trades in the last 24 hours`}.`,
    ...families.map((f) => `Same-size contracts: ${f.tokens} tokens are ${f.codeBytes.toLocaleString("en-US")} bytes each, named for ${f.issuersNamed.map((x) => (x === "none" ? "no issuer" : x)).join(", ")}.`),
    "",
    "How to read it: only FROM ISSUER passes. A name, a symbol, a pool or a price is never proof; copies copy all of them.",
    "These are on-chain facts about each contract, not claims about who made it. Don't buy, approve or interact with any of these tokens.",
    "Fingerprints: " + Object.values(ISSUERS).map((i) => `${i.name}: ${i.anchor}`).join(" "),
  ];
  out(lines, { ok: true, chain: chainKey, chainId: CHAIN.id, stock: ticker, sharePrice: share, readAt: new Date().toISOString(), tokens, families, exitMinUsd: EXIT_MIN_USD, exitMinVolumeUsd: EXIT_MIN_VOLUME_USD, issuers: Object.fromEntries(Object.entries(ISSUERS).map(([k, i]) => [k, { name: i.name, fingerprint: i.fingerprint, anchor: i.anchor }])) });
}

main().catch((e) => fail(e.shortMessage || e.message));
