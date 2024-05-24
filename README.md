# Low latency middleware for permissionless

Tested on Optimism Sepolia. Changes:

- Uses current timestamp for nonce key, instead of querying the entrypoiny
- Uses `feeRef` for syncing L2 gas prices
- Uses `gasRef` for syncing L1 gas values
- Calculates `preVerificationGas` locally
- Requests `callGasLimit` and `verificationGasLimit` from the bundler only once

## Running locally

### Set environment

```bash
cp .env.sample .env
```

### Run

```bash
pnpm install
bun run index.ts
```