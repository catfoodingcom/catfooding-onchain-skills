#!/usr/bin/env node
// Catfooding on Avalanche Fuji: set up a test wallet, mint test dollars, adopt an Agent Cat, check on it.
// Fuji only. The rules below are checked here in code, not left to the agent's instructions.

import { createPublicClient, createWalletClient, http, formatUnits, parseUnits, parseEventLogs, getAddress, isAddress, encodeFunctionData } from "viem";
import { avalancheFuji } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

// ---- fixed for Fuji ----
const CHAIN_ID = 43113;
const RPC = process.env.FUJI_RPC || "https://api.avax-test.network/ext/bc/C/rpc";
const CATS = getAddress("0x8D4675929bA6d7caBB0aA1F08517D0B07B605fF8");
const DOLLAR = getAddress("0xb294f12EcF59DCDDB6489BCf4e5bCE29B7a20320");
const COATS = ["White", "Gold", "Calico", "Black", "Red", "Pink", "Violet"];
const SITE = process.env.CATFOODING_SITE || "https://jess.catfooding.com"; // the test site until Fuji reaches app.catfooding.com
const FAUCET = "https://build.avax.network/console/primary-network/faucet";
const EXPLORER = "https://testnet.snowtrace.io";
const KEY_FILE = process.env.CATFOODING_KEY_FILE || join(homedir(), ".catfooding", "fuji-test-key");
const MIN_GAS = parseUnits("0.005", 18); // enough AVAX for an approve and an adopt, with room to spare
const MINT_LIMIT = 1000;
// A cat's own wallet (ERC-6551 token-bound account). Every address here is already deployed and verified
// on Fuji: the standard registry, and Tokenbound's account proxy and account. Nothing of ours to trust.
const TBA_REGISTRY = getAddress("0x000000006551c19487814612e58FE06813775758");
const TBA_PROXY = getAddress("0x55266d75D1a14E4572138116aF39863Ed6596E7F"); // Tokenbound AccountProxy
const TBA_ACCOUNT = getAddress("0x41C8f39463A868d3A88af00cd0fe7102F30E44eC"); // Tokenbound AccountV3Upgradable
const MULTICALL3 = getAddress("0xcA11bde05977b3631167028862bE2a173976CA11");
const TBA_SALT = `0x${"0".repeat(64)}`;
const CAT_WALLET_FUND_LIMIT = 100; // test dollars per top-up: the cat's wallet is for its own small things
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"; // EIP-1967

const catsAbi = [
  { type: "function", name: "adopt", stateMutability: "nonpayable", inputs: [{ name: "coat", type: "uint8" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "price", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "paymentToken", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "coatCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "remainingInLitter", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  { type: "function", name: "totalAdopted", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "coatOf", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "uint8" }] },
  { type: "function", name: "safeTransferFrom", stateMutability: "nonpayable", inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "id", type: "uint256" }], outputs: [] },
  { type: "function", name: "litterOf", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "uint32" }] },
  { type: "event", name: "Adopted", inputs: [
    { name: "tokenId", type: "uint256", indexed: true }, { name: "adopter", type: "address", indexed: true },
    { name: "litter", type: "uint32", indexed: true }, { name: "coat", type: "uint8", indexed: false },
    { name: "price", type: "uint256", indexed: false }, { name: "toBook", type: "uint256", indexed: false },
  ] },
];
const dollarAbi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
];
const tbaArgs = (id) => [TBA_PROXY, TBA_SALT, BigInt(CHAIN_ID), CATS, id];
const registryAbi = [
  { type: "function", name: "account", stateMutability: "view", inputs: [{ name: "implementation", type: "address" }, { name: "salt", type: "bytes32" }, { name: "chainId", type: "uint256" }, { name: "tokenContract", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "createAccount", stateMutability: "nonpayable", inputs: [{ name: "implementation", type: "address" }, { name: "salt", type: "bytes32" }, { name: "chainId", type: "uint256" }, { name: "tokenContract", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] },
];
const proxyAbi = [{ type: "function", name: "initialize", stateMutability: "nonpayable", inputs: [{ name: "implementation", type: "address" }], outputs: [] }];
const accountAbi = [
  { type: "function", name: "execute", stateMutability: "payable", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" }, { name: "operation", type: "uint8" }], outputs: [{ type: "bytes" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
const multicallAbi = [
  { type: "function", name: "aggregate3", stateMutability: "payable", inputs: [{ name: "calls", type: "tuple[]", components: [{ name: "target", type: "address" }, { name: "allowFailure", type: "bool" }, { name: "callData", type: "bytes" }] }], outputs: [{ type: "tuple[]", components: [{ name: "success", type: "bool" }, { name: "returnData", type: "bytes" }] }] },
];

// ---- arguments ----
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--") && !a.includes("=")));
const opt = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const positional = argv.filter((a) => !a.startsWith("--"));
const [command, arg] = positional;
const SEND = flags.has("--send");
const JSON_OUT = flags.has("--json");

const out = (lines, data) => {
  if (JSON_OUT) console.log(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  else console.log(lines.filter((l) => l !== null).join("\n"));
};
const fail = (message, code = 1) => {
  if (JSON_OUT) console.log(JSON.stringify({ ok: false, error: message }));
  else console.error(`Stopped: ${message}`);
  process.exit(code);
};
const usd = (v) => `${formatUnits(v, 6)} tUSD`;
const avax = (v) => `${Number(formatUnits(v, 18)).toFixed(4)} AVAX`;
const txLink = (h) => `${EXPLORER}/tx/${h}`;
const catPage = (id) => `${SITE}/cats/${CHAIN_ID}/${id}`; // public, read-only: anyone with the link sees the cat

const pub = createPublicClient({ chain: avalancheFuji, transport: http(RPC) });

// ---- the network check: every command runs it first ----
async function checkNetwork() {
  const id = await pub.getChainId().catch((e) => fail(`could not reach the Fuji RPC (${e.shortMessage || e.message}).`));
  if (id !== CHAIN_ID) fail(`the RPC is on chain ${id}, not Avalanche Fuji (${CHAIN_ID}). This kit only runs on Fuji.`);
  const token = await pub.readContract({ address: CATS, abi: catsAbi, functionName: "paymentToken" });
  if (getAddress(token) !== DOLLAR) fail("the Agent Cats contract doesn't match the kit. Update the kit before going on.");
}

// ---- the signer: a test-only key on this machine, or none (hand-off) ----
function loadKey() {
  if (!existsSync(KEY_FILE)) return null;
  const key = readFileSync(KEY_FILE, "utf8").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) fail(`${KEY_FILE} doesn't hold a key in the expected format.`);
  return privateKeyToAccount(key);
}
function whoAmI() {
  // --owner=<address> reads as a cat owned by another wallet (say, after sending your cat to your browser
  // wallet). Read-only skills only: with no key for that wallet, nothing can be sent for it.
  const flag = opt("from") !== undefined ? "from" : "owner";
  const from = opt(flag);
  if (from) {
    if (!isAddress(from)) fail(`--${flag}=${from} isn't an address.`);
    return { address: getAddress(from), account: null };
  }
  const account = loadKey();
  if (!account) fail(`no wallet yet. Run "node cat.mjs setup" to create a test wallet, or pass --from=<address> to prepare transactions for another wallet to sign.`);
  return { address: account.address, account };
}

async function balances(address) {
  const [gas, dollars, cats] = await Promise.all([
    pub.getBalance({ address }),
    pub.readContract({ address: DOLLAR, abi: dollarAbi, functionName: "balanceOf", args: [address] }),
    pub.readContract({ address: CATS, abi: catsAbi, functionName: "balanceOf", args: [address] }),
  ]);
  return { gas, dollars, cats };
}

/** Send a transaction, or describe it (dry run / hand-off). Every transaction is simulated first. */
async function transact(who, { to, abi, functionName, args, says }) {
  const { request } = await pub
    .simulateContract({ account: who.address, address: to, abi, functionName, args })
    .catch((e) => fail(`${says} would fail: ${e.shortMessage || e.message}`));
  const step = { says, to, function: functionName, args, data: encodeFunctionData({ abi, functionName, args }) };
  if (!SEND || !who.account) return { ...step, sent: false };
  const wallet = createWalletClient({ account: who.account, chain: avalancheFuji, transport: http(RPC) });
  const hash = await wallet.writeContract({ ...request, account: who.account });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") fail(`${says} was sent but failed on chain: ${txLink(hash)}`);
  return { ...step, sent: true, hash, link: txLink(hash), receipt };
}

function handOff(who, steps) {
  // without a local key, show exactly what to sign, so a person's wallet (or another signer) can send it
  if (who.account) return null;
  return steps.map((s) => ({ chainId: CHAIN_ID, from: who.address, to: s.to, value: "0", data: s.data, says: s.says }));
}

// ---- commands ----
async function setup() {
  await checkNetwork();
  let created = false;
  if (!existsSync(KEY_FILE)) {
    mkdirSync(dirname(KEY_FILE), { recursive: true, mode: 0o700 });
    writeFileSync(KEY_FILE, generatePrivateKey() + "\n", { mode: 0o600, flag: "wx" });
    chmodSync(KEY_FILE, 0o600);
    created = true;
  }
  const { address } = whoAmI();
  const b = await balances(address);
  const needsGas = b.gas < MIN_GAS;
  out([
    created ? `Created a new test wallet. Its key is in ${KEY_FILE} (only you can read it). Use it for Fuji only, never for real funds.` : `Using the test wallet in ${KEY_FILE}.`,
    `Address: ${address}`,
    `Gas: ${avax(b.gas)}${needsGas ? `  ← needs test AVAX. Get some free at ${FAUCET} (send it to the address above).` : ""}`,
    `Test dollars: ${usd(b.dollars)}`,
    `Agent Cats: ${b.cats}`,
  ], { ok: true, created, address, keyFile: KEY_FILE, gas: formatUnits(b.gas, 18), dollars: formatUnits(b.dollars, 6), cats: b.cats, needsGas, faucet: FAUCET });
}

async function status() {
  await checkNetwork();
  const who = whoAmI();
  const b = await balances(who.address);
  const ids = await catsOf(who.address, b.cats);
  out([
    `Wallet ${who.address} on Avalanche Fuji`,
    `Gas: ${avax(b.gas)}${b.gas < MIN_GAS ? `  ← low; get test AVAX at ${FAUCET}` : ""}`,
    `Test dollars: ${usd(b.dollars)}`,
    `Agent Cats: ${ids.length ? ids.map((i) => `#${i}`).join(", ") : 'none in this wallet. Adopt one: pick a coat and run "node cat.mjs adopt --coat=<coat>"'}`,
    ...ids.map((i) => `  #${i}: ${catPage(i)}`),
  ], { ok: true, address: who.address, gas: formatUnits(b.gas, 18), dollars: formatUnits(b.dollars, 6), cats: ids, pages: ids.map(catPage) });
}

async function catsOf(address, count) {
  if (count === 0n) return [];
  const total = Number(await pub.readContract({ address: CATS, abi: catsAbi, functionName: "totalAdopted" }));
  const ids = Array.from({ length: total }, (_, i) => BigInt(i + 1));
  const owners = await pub.multicall({ contracts: ids.map((id) => ({ address: CATS, abi: catsAbi, functionName: "ownerOf", args: [id] })) });
  return ids.filter((_, i) => owners[i].status === "success" && getAddress(owners[i].result) === address).map(Number);
}

async function mint() {
  await checkNetwork();
  const who = whoAmI();
  const amount = Number(arg ?? 50);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MINT_LIMIT) fail(`mint between 1 and ${MINT_LIMIT} test dollars at a time.`);
  const step = await transact(who, { to: DOLLAR, abi: dollarAbi, functionName: "mint", args: [parseUnits(String(amount), 6)], says: `Mint ${amount} test dollars to ${who.address}` });
  report([step], who, step.sent ? [`Done. Test dollars now: ${usd((await balances(who.address)).dollars)}`] : []);
}

async function adopt() {
  await checkNetwork();
  const who = whoAmI();
  const coatName = opt("coat");
  if (!coatName) fail(`choose a coat with --coat=<name>: ${COATS.join(", ")}.`);
  const coat = COATS.findIndex((c) => c.toLowerCase() === coatName.toLowerCase());
  if (coat < 0) fail(`unknown coat "${coatName}". Coats: ${COATS.join(", ")}.`);

  const [price, coatCount, paused, remaining, allowance, b] = await Promise.all([
    pub.readContract({ address: CATS, abi: catsAbi, functionName: "price" }),
    pub.readContract({ address: CATS, abi: catsAbi, functionName: "coatCount" }),
    pub.readContract({ address: CATS, abi: catsAbi, functionName: "paused" }),
    pub.readContract({ address: CATS, abi: catsAbi, functionName: "remainingInLitter" }),
    pub.readContract({ address: DOLLAR, abi: dollarAbi, functionName: "allowance", args: [who.address, CATS] }),
    balances(who.address),
  ]);
  if (coat >= coatCount) fail(`the ${COATS[coat]} coat isn't open yet.`);
  if (paused) fail("adoptions are paused right now.");
  if (remaining === 0) fail("this litter is fully adopted. The next one opens soon.");
  if (b.dollars < price) fail(`adopting costs ${usd(price)} and the wallet has ${usd(b.dollars)}. Mint test dollars first: node cat.mjs mint ${formatUnits(price, 6)}`);
  if (who.account && b.gas < MIN_GAS) fail(`the wallet has ${avax(b.gas)}, not enough for gas. Get test AVAX at ${FAUCET}`);

  const steps = [];
  // exact-amount approval: only ever the adoption price, never an unlimited allowance
  if (allowance !== price) {
    steps.push(await transact(who, { to: DOLLAR, abi: dollarAbi, functionName: "approve", args: [CATS, price], says: `Allow the Agent Cats contract to take exactly ${usd(price)}` }));
  }
  if (allowance >= price || SEND) {
    steps.push(await transact(who, { to: CATS, abi: catsAbi, functionName: "adopt", args: [coat], says: `Adopt a ${COATS[coat]} Agent Cat for ${usd(price)}` }));
  } else {
    // the adopt can't be simulated until the approval exists, so describe it without simulating
    steps.push({ says: `Adopt a ${COATS[coat]} Agent Cat for ${usd(price)}`, to: CATS, function: "adopt", args: [coat], data: encodeFunctionData({ abi: catsAbi, functionName: "adopt", args: [coat] }), sent: false });
  }

  const last = steps.at(-1);
  let cat = null;
  if (last.sent) {
    const [ev] = parseEventLogs({ abi: catsAbi, eventName: "Adopted", logs: last.receipt.logs });
    cat = Number(ev.args.tokenId);
  }
  report(steps, who, cat ? [`Adopted Agent Cat #${cat} (${COATS[coat]}).`, `Its page (anyone with the link can see it): ${catPage(cat)}`] : [], { cat, page: cat ? catPage(cat) : null });
}

async function catInfo() {
  await checkNetwork();
  if (!arg || !/^\d+$/.test(arg)) fail("give a cat number, e.g. node cat.mjs cat 1");
  const id = BigInt(arg);
  const owner = await pub.readContract({ address: CATS, abi: catsAbi, functionName: "ownerOf", args: [id] }).catch(() => fail(`there's no Agent Cat #${arg} on Fuji yet.`));
  const [coat, litter] = await Promise.all([
    pub.readContract({ address: CATS, abi: catsAbi, functionName: "coatOf", args: [id] }),
    pub.readContract({ address: CATS, abi: catsAbi, functionName: "litterOf", args: [id] }),
  ]);
  const meta = await fetch(`${SITE}/api/cats/meta/${CHAIN_ID}/${arg}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const stage = meta?.attributes?.find((a) => a.trait_type === "Stage")?.value ?? "unknown";
  out([
    `Agent Cat #${arg} on Avalanche Fuji`,
    `Owner: ${owner}`,
    `Coat: ${COATS[coat] ?? coat} · Litter ${litter} · Stage: ${stage}`,
    `Page: ${catPage(arg)}`,
  ], { ok: true, cat: Number(id), owner, coat: COATS[coat] ?? coat, litter, stage, page: catPage(arg), image: meta?.image ?? null });
}

// ---- the Agent Cat gate: skills belong to a cat, so every skill past adoption runs this first ----
const NO_CAT = 3; // exit code for "no cat": an agent can tell it apart from other stops

/** The cat this wallet's skills run as: --cat=<n> if given (it must be the wallet's), else its first cat. */
async function requireCat(who) {
  const picked = opt("cat");
  if (picked !== undefined) {
    if (!/^\d+$/.test(picked)) fail(`--cat=${picked} isn't a cat number.`);
    const owner = await pub.readContract({ address: CATS, abi: catsAbi, functionName: "ownerOf", args: [BigInt(picked)] }).catch(() => null);
    if (!owner) fail(`there's no Agent Cat #${picked} on Fuji.`, NO_CAT);
    if (getAddress(owner) !== who.address) fail(`Agent Cat #${picked} belongs to ${owner}, not this wallet (${who.address}).`, NO_CAT);
    return Number(picked);
  }
  const count = await pub.readContract({ address: CATS, abi: catsAbi, functionName: "balanceOf", args: [who.address] });
  const [first] = await catsOf(who.address, count);
  if (!first) fail(`no Agent Cat in ${who.address}. Skills belong to an Agent Cat, so adopt one first: pick a coat and run "node cat.mjs adopt --coat=<coat>".`, NO_CAT);
  return first;
}

async function check() {
  await checkNetwork();
  const who = whoAmI();
  const cat = await requireCat(who);
  out([`Skills run as Agent Cat #${cat}, owned by ${who.address}.`, `Its page: ${catPage(cat)}`], { ok: true, cat, address: who.address, readOnly: !who.account, page: catPage(cat) });
}

// The real Catfooding waitlist (the live app, not the test site), so a sign-up is kept.
const WAITLIST = "https://app.catfooding.com/waitlist";

// ---- send a cat to another wallet, e.g. from the agent's test wallet to the person's own browser wallet ----
async function send() {
  await checkNetwork();
  if (opt("owner") !== undefined) fail("--owner is for read-only skills. Send from the wallet that holds the cat.");
  const who = whoAmI();
  if (!arg || !/^\d+$/.test(arg)) fail("give the cat number and where to send it, e.g. node cat.mjs send 3 --to=0xYourWallet");
  const to = opt("to");
  if (!to || !isAddress(to)) fail("say where to send it with --to=<address>: the wallet that should own the cat.");
  const dest = getAddress(to);
  if (dest === who.address) fail("that's the wallet the cat is already in.");
  if (/^0x0{40}$/i.test(dest)) fail("that's the zero address: a cat sent there is gone for good.");
  // Never into its own wallet, created or not: the cat would control the wallet holding the cat, and
  // neither could ever be moved again. (A wallet not created yet has no code, so the contract check misses it.)
  const ownWallet = await pub.readContract({ address: TBA_REGISTRY, abi: registryAbi, functionName: "account", args: tbaArgs(BigInt(arg)) });
  if (getAddress(ownWallet) === dest) fail(`${dest} is Agent Cat #${arg}'s own wallet. A cat can't go into its own wallet: both would be locked forever. Send it to a person's wallet.`);
  // a contract can only hold a cat if it says it accepts one; refuse them for now (a cat's vault comes later)
  const code = await pub.getCode({ address: dest });
  if (code && code !== "0x") fail(`${dest} is a contract, not a wallet. Send the cat to a wallet address (like the one in your browser wallet).`);
  const id = BigInt(arg);
  const owner = await pub.readContract({ address: CATS, abi: catsAbi, functionName: "ownerOf", args: [id] }).catch(() => fail(`there's no Agent Cat #${arg} on Fuji.`));
  if (getAddress(owner) !== who.address) fail(`Agent Cat #${arg} belongs to ${owner}, not this wallet (${who.address}).`, NO_CAT);
  const b = await balances(who.address);
  if (who.account && b.gas < MIN_GAS) fail(`the wallet has ${avax(b.gas)}, not enough for gas. Get test AVAX at ${FAUCET}`);

  const step = await transact(who, { to: CATS, abi: catsAbi, functionName: "safeTransferFrom", args: [who.address, dest, id], says: `Send Agent Cat #${arg} to ${dest}` });
  report([step], who, step.sent ? [
    `Agent Cat #${arg} is now in ${dest}. Its stage and care went with it.`,
    `Sign in with that wallet to look after it: ${catPage(arg)}`,
    `With that wallet at hand, join the waitlist to hear when adoption opens for real: ${WAITLIST}`,
    `This wallet no longer holds it. To keep reading with the cat, add --owner=${dest} (read-only).`,
  ] : [], { cat: Number(arg), to: dest, page: catPage(arg) });
}

// ---- the cat's own wallet (ERC-6551): an address tied to the cat; whoever holds the cat controls it ----
async function catWalletState(id) {
  const address = await pub.readContract({ address: TBA_REGISTRY, abi: registryAbi, functionName: "account", args: tbaArgs(id) });
  const code = await pub.getCode({ address });
  const exists = !!code && code !== "0x";
  const implWord = exists ? await pub.getStorageAt({ address, slot: IMPL_SLOT }) : null;
  const ready = !!implWord && BigInt(implWord) !== 0n;
  const [gas, dollars] = await Promise.all([
    pub.getBalance({ address }),
    pub.readContract({ address: DOLLAR, abi: dollarAbi, functionName: "balanceOf", args: [address] }),
  ]);
  return { address: getAddress(address), exists, ready, gas, dollars };
}

const CAT_WALLET_RULES = [
  "What it is: a wallet that belongs to the cat. Whoever holds the cat controls it, so it moves with the cat.",
  "What it isn't: a place for your own money. If the cat changes hands, everything in its wallet goes with it.",
];

async function wallet() {
  await checkNetwork();
  const action = arg ?? "show";
  if (!["show", "create", "fund", "return"].includes(action)) fail(`"wallet ${action}" isn't a wallet command. Use: wallet, wallet create, wallet fund <amount>, wallet return <amount|all>.`);
  const who = whoAmI();
  const cat = await requireCat(who);
  const id = BigInt(cat);
  const w = await catWalletState(id);

  if (action === "show") {
    return out([
      `Agent Cat #${cat}'s own wallet: ${w.address}`,
      w.ready ? "Created. The cat's owner controls it." : w.exists ? "Created but not set up yet: run \"node cat.mjs wallet create\" to finish." : "Not created yet: its address is known already. Run \"node cat.mjs wallet create\" to create it.",
      `Holds: ${avax(w.gas)} · ${usd(w.dollars)}`,
      `See it: ${EXPLORER}/address/${w.address}`,
      ...CAT_WALLET_RULES,
    ], { ok: true, cat, wallet: w.address, created: w.ready, gas: w.gas, dollars: w.dollars, explorer: `${EXPLORER}/address/${w.address}` });
  }
  if (opt("owner") !== undefined) fail("--owner is read-only. Use the wallet that holds the cat.");

  if (action === "create") {
    if (w.ready) fail(`Agent Cat #${cat}'s wallet already exists: ${w.address}`);
    const calls = [];
    if (!w.exists) calls.push({ target: TBA_REGISTRY, allowFailure: false, callData: encodeFunctionData({ abi: registryAbi, functionName: "createAccount", args: tbaArgs(id) }) });
    calls.push({ target: w.address, allowFailure: false, callData: encodeFunctionData({ abi: proxyAbi, functionName: "initialize", args: [TBA_ACCOUNT] }) });
    const step = await transact(who, { to: MULTICALL3, abi: multicallAbi, functionName: "aggregate3", args: [calls], says: `Create Agent Cat #${cat}'s own wallet at ${w.address}` });
    return report([step], who, step.sent ? [`Agent Cat #${cat} has its own wallet: ${w.address}`, ...CAT_WALLET_RULES] : [], { cat, wallet: w.address });
  }

  if (!w.ready) fail(`Agent Cat #${cat} has no wallet yet. Run "node cat.mjs wallet create" first.`);

  if (action === "fund") {
    const raw = positional[2];
    if (!raw || !/^\d+(\.\d{1,6})?$/.test(raw)) fail("say how many test dollars, e.g. node cat.mjs wallet fund 5");
    if (Number(raw) <= 0 || Number(raw) > CAT_WALLET_FUND_LIMIT) fail(`top up between 0 and ${CAT_WALLET_FUND_LIMIT} test dollars at a time: the cat's wallet is for its own small things.`);
    const amount = parseUnits(raw, 6);
    const b = await balances(who.address);
    if (b.dollars < amount) fail(`this wallet has ${usd(b.dollars)}, less than ${usd(amount)}. Mint some first: node cat.mjs mint`);
    const step = await transact(who, { to: DOLLAR, abi: dollarAbi, functionName: "transfer", args: [w.address, amount], says: `Send ${usd(amount)} to Agent Cat #${cat}'s wallet` });
    return report([step], who, step.sent ? [`Agent Cat #${cat}'s wallet now holds ${usd(w.dollars + amount)}.`] : [], { cat, wallet: w.address });
  }

  // return: the cat's wallet sends test dollars back to its owner. Only the cat's owner can make it act.
  const raw = positional[2];
  if (!raw || !(raw === "all" || /^\d+(\.\d{1,6})?$/.test(raw))) fail("say how many test dollars, or all, e.g. node cat.mjs wallet return all");
  const amount = raw === "all" ? w.dollars : parseUnits(raw, 6);
  if (amount <= 0n) fail(`Agent Cat #${cat}'s wallet holds no test dollars to return.`);
  if (amount > w.dollars) fail(`Agent Cat #${cat}'s wallet holds ${usd(w.dollars)}, less than ${usd(amount)}.`);
  const transfer = encodeFunctionData({ abi: dollarAbi, functionName: "transfer", args: [who.address, amount] });
  const step = await transact(who, { to: w.address, abi: accountAbi, functionName: "execute", args: [DOLLAR, 0n, transfer, 0], says: `Agent Cat #${cat}'s wallet sends ${usd(amount)} back to ${who.address}` });
  return report([step], who, step.sent ? [`Done: the cat's own wallet acted, signed by you as its owner.`] : [], { cat, wallet: w.address });
}

// ---- market data: tokenized stocks across chains (a skill, so it runs as the wallet's cat) ----
async function market() {
  await checkNetwork();
  const who = whoAmI();
  const cat = await requireCat(who);
  const want = opt("stock")?.toUpperCase();
  const url = `${SITE}/api/market/stocks`;
  const retry = `Your Agent Cat #${cat} is fine. Try again in a minute: node cat.mjs market`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    .catch((e) => fail(`couldn't reach Catfooding's market data at ${url} (${e.name === "TimeoutError" ? "timed out after 15 s" : "network error"}). ${retry}`));
  if (!res.ok) fail(`Catfooding's market data at ${url} answered HTTP ${res.status}. ${retry}`);
  const data = await res.json().catch(() => fail(`Catfooding's market data at ${url} sent something that isn't JSON. ${retry}`));
  if (!data?.ok) fail(data?.error ?? "market data isn't available right now.");
  const stocks = want ? data.stocks.filter((s) => s.stock === want) : data.stocks;
  if (want && !stocks.length) fail(`no data for ${want}. Stocks: ${data.stocks.map((s) => s.stock).join(", ")}.`);
  const pct = (v) => (v === null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`);
  const lines = [`Tokenized stocks, read for Agent Cat #${cat} · ${data.observedAt} · US market: ${data.usMarket?.state ?? "unknown"}`];
  for (const s of stocks) {
    lines.push("", `${s.stock}  share price ${s.sharePrice ?? "–"}${s.closestToShare ? `  · closest: ${s.closestToShare.chain} (${s.closestToShare.issuer})` : ""}`);
    for (const l of s.listings) lines.push(`  ${l.chain.padEnd(16)} ${(l.issuer ?? "").padEnd(20)} ${String(l.symbol ?? "").padEnd(8)} ${pct(l.premiumPct).padStart(7)}${l.tradable ? "" : "  (thin)"}${l.stale ? "  (old read)" : ""}`);
  }
  lines.push("", "% = token price vs the real share price. (thin) = not enough liquidity to trade. (old read) = that chain wasn't read in the last 2 hours. Not investment advice.");
  lines.push("Data: CoAgentic Markets lab (coagentic.markets/lab/chains)");
  out(lines, { ...data, cat, source: "CoAgentic Markets lab (https://coagentic.markets/lab/chains)" });
}

function report(steps, who, doneLines = [], extra = {}) {
  const sent = steps.every((s) => s.sent);
  const handoff = handOff(who, steps);
  const lines = [];
  if (sent) {
    for (const s of steps) lines.push(`✓ ${s.says}`, `  ${s.link}`);
    lines.push(...doneLines);
  } else {
    lines.push(handoff ? `Prepared for ${who.address} to sign (nothing sent):` : "Dry run. Nothing sent. These transactions would be sent:");
    steps.forEach((s, i) => lines.push(`  ${i + 1}. ${s.says}  (${s.function} on ${s.to})`));
    if (!handoff) lines.push("Run again with --send to send them.");
  }
  out(lines, {
    ok: true, sent, address: who.address,
    steps: steps.map(({ receipt, ...s }) => s),
    ...(handoff ? { handoff } : {}), ...extra,
  });
}

const HELP = `Catfooding on Avalanche Fuji

  node cat.mjs setup                 create a test wallet (or show the existing one) and its balances
  node cat.mjs status                balances and the Agent Cats this wallet owns
  node cat.mjs mint [amount]         mint test dollars (default 50, max 1000)
  node cat.mjs adopt --coat=<name>   adopt an Agent Cat (${COATS.join(", ")})
  node cat.mjs cat <number>          look up an Agent Cat
  node cat.mjs check [--cat=<n>]     which Agent Cat this wallet's skills run as (exit 3 if none)
  node cat.mjs market [--stock=SPCX] tokenized stocks across chains vs the real share price (needs a cat)
  node cat.mjs send <number> --to=<address>  send a cat to another wallet, e.g. your browser wallet
  node cat.mjs wallet [--cat=<n>]    the cat's own wallet: its address, whether it's created, what it holds
  node cat.mjs wallet create         create the cat's own wallet (one transaction)
  node cat.mjs wallet fund <amount>  put test dollars in the cat's wallet (up to ${CAT_WALLET_FUND_LIMIT} at a time)
  node cat.mjs wallet return <amount|all>  the cat's wallet sends test dollars back to you

  Transactions are a dry run unless you add --send.
  --from=<address>   prepare transactions for another wallet to sign (no local key used)
  --owner=<address>  read-only skills (check, market) as the cat in another wallet, after you've sent it there
  --json             machine-readable output

  Challenge: node hunt.mjs TSLA [--chain=xlayer|base|ethereum|robinhood]   spot the fake stock tokens, read-only`;

const commands = { setup, status, mint, adopt, cat: catInfo, check, market, send, wallet };
if (!command || flags.has("--help") || !commands[command]) {
  console.log(HELP);
  process.exit(command && !commands[command] ? 1 : 0);
}
await commands[command]().catch((e) => fail(e.shortMessage || e.message));
