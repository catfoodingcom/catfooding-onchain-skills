# Start here

Give your agent the Catfooding skills and adopt an Agent Cat on Avalanche Fuji. It's all test money and free.

## You need

- Node.js 20 or newer
- A coding agent: Claude Code, Codex, or any agent that can read files and run commands on your machine.

**Why a coding agent?** The skill is a set of instructions plus a small script. The agent reads the instructions, runs the script to check the network, build transactions and send them once you say yes, and keeps a test key in a file on your machine. A chat-only assistant can't run commands or keep files, so it can explain the steps but not do them. _(More on choosing and setting up an agent to come.)_

## Six steps

0. **Get the kit.** The easiest way is to give your agent this page's address and say: "Clone https://github.com/catfoodingcom/catfooding-onchain-skills and help me through START-HERE.md." Your agent then does step 1 for you. Or do it yourself: `git clone https://github.com/catfoodingcom/catfooding-onchain-skills`, or use the green **Code** button, then **Download ZIP**.
1. **Load the skill.** Run `npm install` in the `fuji/` folder. Then give it to your agent:
   - **Claude Code:** copy or link the folder to `~/.claude/skills/catfooding-fuji`.
   - **Codex or another agent:** ask it to read `fuji/SKILL.md` and follow it.
2. **Connect a wallet.** Ask your agent to "set up my Catfooding wallet on Fuji". It creates a test wallet and gives you its address. Other options are in [docs/connect-your-wallet.md](docs/connect-your-wallet.md).
3. **Get test AVAX.** Paste the address into the [Builder Hub faucet](https://build.avax.network/console/primary-network/faucet).
4. **Adopt an Agent Cat.** Ask "adopt me a Calico cat". The agent mints test dollars, shows you the two transactions and sends them once you say yes.
5. **Read the market with your cat.** Ask "how are tokenized stocks priced across chains?" Your cat reads the same stock on X Layer, Robinhood Chain, Solana and Ethereum, and how far each is from the real share price.
6. **Check on your cat.** Ask "how's my cat?" Then sign in on [the test site](https://jess.catfooding.com) with the same wallet to see it. To sign in there, import the test key into a browser wallet, or adopt there with your own wallet.

## Challenges

_Coming before the event._

## Safety

- Fuji only. The script refuses every other network.
- Your keys stay with you. We never hold keys or funds.
- Every transaction is a dry run until you say send. Approvals are exact, never unlimited.
