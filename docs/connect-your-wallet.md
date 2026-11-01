# Connect your agent's wallet

This is the first step of the kit: give your agent a wallet it can use on Avalanche Fuji. The Catfooding steps after it are the same whichever signer you pick.

| Signer | Networks | Who holds the key | Best for |
|---|---|---|---|
| **1. A test wallet on your machine** (default) | Fuji | your machine, in `~/.catfooding/fuji-test-key` | the event; any agent that can run a command |
| **2. Your browser wallet signs** (hand-off) | Fuji, any network your wallet has | your wallet (Core, MetaMask, OKX Wallet…) | keeping a person in the loop for every transaction |
| **3. OKX Onchain OS agentic wallet** | X Layer testnet (not Fuji yet) | OKX's secure enclave; you set the limits | builders already using OKX's skills |

We never hold your keys or funds, whichever you choose.

## 1. A test wallet on your machine

```bash
cd fuji && npm install
node cat.mjs setup
```

`setup` creates a new key, saves it to `~/.catfooding/fuji-test-key` where only your user can read it, and prints the address. It never prints the key.

1. Send test AVAX to that address from the [Builder Hub faucet](https://build.avax.network/console/primary-network/faucet). 0.05 AVAX is plenty.
2. Run `node cat.mjs status` to check it arrived.

Rules:

- It's a **test wallet**. Never copy a real wallet's key into that file, and never send real funds to it.
- To keep the key somewhere else, set `CATFOODING_KEY_FILE=/path/to/file`.
- The script stops if its RPC is on any network other than Fuji, even when you set `FUJI_RPC` yourself.

## 2. Your browser wallet signs (hand-off)

Pass your wallet's address and the agent prepares the transactions without sending anything:

```bash
node cat.mjs adopt --coat=Calico --from=0xYourAddress --json
```

The `handoff` list has each transaction's `chainId`, `to`, `value` and `data`, in order. Sign them in your wallet: approval first, then adoption.

Or adopt on [the test site](https://jess.catfooding.com/adopt/lucky) yourself. Its wallet button switches your wallet to Fuji.

## 3. OKX Onchain OS agentic wallet

OKX's agentic wallet works as follows:

- You sign in once through a browser link.
- The keys stay in OKX's secure enclave.
- You set spending limits on OKX's site.

As of 1 Nov 2026 it supports **X Layer testnet** and Avalanche mainnet, **not Fuji**. Agent Cats are also on X Layer testnet, so an Onchain OS agent can adopt there with OKX's `wallet contract-call`. That flow isn't in this kit yet.

## What we kept from OKX's skills, and what we changed

**Kept:**
- one table that maps what you want to the command
- a check before anything runs
- confirmation before every transaction
- addresses and hashes given back exactly as returned
- no unlimited approvals
- text read from the chain treated as data, not instructions

**Changed:**
- **The rules are in the script, not only in the instructions.** The network check, exact-amount approvals and mint limits stop the command even if an agent ignores the instructions.
- **A dry run by default.** Every transaction is simulated and described in plain words. Nothing is sent without `--send`.
- **One page to start**, not many references.
- **Each skill belongs to an Agent Cat.** You adopt a cat first, and later skills check for it.
