# Start here

Give your agent the Catfooding skills and adopt an Agent Cat on Avalanche Fuji. It's all test money and free.

## You need

- Node.js 20 or newer
- A coding agent: Claude Code, Codex, or any agent that can read files and run commands on your machine.

**Why a coding agent?** The skill is a set of instructions plus a small script. The agent reads the instructions, runs the script to check the network, build transactions and send them once you say yes, and keeps a test key in a file on your machine. A chat-only assistant can't run commands or keep files, so it can explain the steps but not do them. _(More on choosing and setting up an agent to come.)_

## The quickest start

Open your agent and paste this:

> Clone https://github.com/catfoodingcom/catfooding-onchain-skills into a new folder for it (suggest where first). Then read START-HERE.md and fuji/SKILL.md and walk me through the steps, including the challenge in step 9. Keep going on your own; stop only when you need my answer, test AVAX from the faucet, a permission, or my yes to send a transaction.

This repository is public, so cloning needs no GitHub account.

## The steps

1. **Get the kit.** `git clone https://github.com/catfoodingcom/catfooding-onchain-skills` makes a `catfooding-onchain-skills` folder inside the folder you run it in, so run it where you keep projects (for example `~/projects`). Or use the green **Code** button, then **Download ZIP**.
2. **Load the skill.** Run `npm install` in the `fuji/` folder. Every kit command runs from that folder. Then give the skill to your agent:
   - **Claude Code:** copy or link the folder to `~/.claude/skills/catfooding-fuji`.
   - **Codex or another agent:** ask it to read `fuji/SKILL.md` and follow it.

   If your agent was opened in a different folder, it may ask permission to work in the new one or to use the network. That's your agent's own safety check, separate from approving a transaction.
3. **Connect a wallet.** Ask your agent to "set up my Catfooding wallet on Fuji". It creates a test wallet and gives you its address. Other options are in [docs/connect-your-wallet.md](docs/connect-your-wallet.md).
4. **Get test AVAX.** Paste the address into the [Builder Hub faucet](https://build.avax.network/console/primary-network/faucet), then tell your agent when it's done. It checks the balance.
5. **Adopt an Agent Cat.** Pick a coat: White, Gold, Calico, Black, Red, Pink or Violet. Ask "adopt me a Gold cat" (or your coat). A new wallet takes three transactions: mint 25 test dollars, approve exactly 25, adopt. Your agent shows you each one before it sends, and sends only when you say yes.
6. **Read the market with your cat.** Ask "how are tokenized stocks priced across chains?" Your cat reads the same stock on X Layer, Robinhood Chain, Solana and Ethereum, and how far each is from the real share price.
7. **Check on your cat.** Ask "how's my cat?" Your agent gives you the cat's own page, for example `jess.catfooding.com/cats/43113/3`. Anyone with the link can see it, no wallet needed.
8. **Take your cat home (optional).** To pat and feed it on the site, the cat has to be in a wallet your browser can sign with. Ask "send my cat to my wallet" and give your browser wallet's address (MetaMask, Core, OKX Wallet…). Your agent shows the transfer and sends it when you say yes. Then sign in on the cat's page with that wallet. Its stage and care go with it. Your agent can still read the market for it with `--owner=<your address>`, read-only.
9. **Spot the fake (the challenge).** Ask "hunt for fake TSLA tokens on Avalanche". Your agent runs `node hunt.mjs TSLA`. It only reads, and needs no key, no cat and no test AVAX. Then try another chain. What it checks and how to win are in [Challenge: spot the fake](#challenge-spot-the-fake) below.

## If something stops

The script says why it stopped and what to do. Anything already sent stays done: if adoption worked and a later step fails, your cat is still yours. Ask your agent to run the same step again, for example `node cat.mjs market`. If it keeps failing, tell us at the event.

## Challenge: spot the fake

Tokenized stocks are real shares on a chain, from issuers such as xStocks, Ondo and Dinari. Copies of them are everywhere. Search Avalanche's DEX pools for "TSLA" today and you'll find more than a dozen tokens carrying Tesla's name. None of them is from the issuer it names.

Your agent goes hunting, read-only, on mainnet. Ask it: **"hunt for fake TSLA tokens on Avalanche"** (or AAPL, NVDA, SPY, MSFT, AMZN, MSTR, CRCL, HOOD…). It runs `node hunt.mjs TSLA` and checks every token with the stock's name three ways:

1. **Is it real?** Only the chain can say: who controls the contract. A name, a symbol, a pool or a price is never proof; copies copy all of them.
2. **Is the price fair?** The token's pool price against the real share price.
3. **Can you get out?** Enough liquidity and trades to sell into.

Then hunt the same stock on another chain: `--chain=xlayer`, `base`, `ethereum` or `robinhood`. Avalanche has no genuine ones to find. Ethereum has, so you'll see what passing looks like next to the copies, and that a genuine token can still have no exit.

**To win, tell us at the event:** for the stock you hunted, how many tokens carry its name, how many are from the issuer they name, and whether you could sell any of them. Then the hard part: explain why one of them can't be confirmed either way.

Rules: the hunt only reads. It loads no key and can't send anything. Never buy, approve or interact with a token it finds. Its findings are facts about each contract, not claims about who made it.

## Safety

- Transactions are Fuji only: `cat.mjs` refuses every other network. The challenge's `hunt.mjs` reads mainnet chains, but loads no key and can't send anything.
- Your keys stay with you. We never hold keys or funds.
- Every transaction is a dry run until you say send. Approvals are exact, never unlimited.
