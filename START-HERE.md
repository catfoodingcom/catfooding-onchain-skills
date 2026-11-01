# Start here

Give your agent the Catfooding skills and adopt an Agent Cat on Avalanche Fuji. It's all test money and free.

## You need

- Node.js 20 or newer
- An agent that can load skills and run commands, such as Claude Code. Any agent that can run a shell command will do.

## Six steps

1. **Load the skill.** Copy or link the `fuji/` folder into your agent's skills folder. For Claude Code, that's `~/.claude/skills/catfooding-fuji`. Then run `npm install` in it.
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
