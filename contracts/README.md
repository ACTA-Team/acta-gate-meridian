# contracts

A single Cargo workspace, on `soroban-sdk` **26.1**, for every ACTA Gate contract.

| Contract | Origin | What it does |
|---|---|---|
| [`vc-vault`](vc-vault/README.md) | ACTA, modified here | One vault per holder: stores their credentials and their status |
| [`vc-vault-factory`](vc-vault-factory/README.md) | ACTA | Deploys vaults, charges the issuance fee, `is_vault` |
| [`did-stellar-registry`](did-stellar-registry/README.md) | ACTA | On-chain registry of `did:stellar` |
| `vc-gate` | ACTA Gate | Index for contracts: from an address to its credential and its claims |
| `credential-policy` | ACTA Gate | Smart account policy: the treasury only pays credential holders |
| `credential-vote` | ACTA Gate | Vote: only credential holders propose and vote. The second consumer of `vc-gate` |
| `integration-tests` | ACTA Gate | Tests only: the treasury and the vote end to end, through a real OpenZeppelin smart account, `vc-gate` and the vault |

## ACTA's contracts

They were copied from [`ACTA-Team/contracts-acta`](https://github.com/ACTA-Team/contracts-acta),
branch `dev`, commit `282fe47`, and **are modified here, not in the public repo**.

- **They were upgraded from `soroban-sdk` 23.4 to 26.1** to share a workspace with
  ACTA Gate's contracts: OpenZeppelin's smart accounts require 26.1. The contracts'
  code compiled unchanged; only the tests that read events were adapted, because in
  26.1 `env.events().all()` returns `ContractEvents`.
- **They are no longer identical to the ones on mainnet.** Any demo uses fresh
  deployments on testnet. The reference deployments of the original model are in
  [`docs/deployments/`](../docs/deployments/).
- **The paths are the same as in the public repo** (`contracts/<contract>`), so a
  change can be carried over with `git format-patch -- contracts/vc-vault`. If the
  public repo is still on 23.4, it has to be upgraded first.

## Testing

```bash
cd contracts
# the vault's WASM first: vc-gate and the factory's tests import it at compile time
cargo build -p vc-vault-contract --target wasm32v1-none --release
cargo test
cargo clippy --all-targets -- -D warnings
stellar contract build            # stellar-cli 25.2 or later
```

If the WASM is missing, `vc-gate/build.rs` stops the build with that same command in its
message, instead of `contractimport!`'s opaque error. The script only checks that the file
exists: it does **not** run cargo on its own (a cargo nested inside a build script
deadlocks on the `target/` lock).

`cargo test -p acta-gate-integration-tests` runs only the treasury's integration tests
(`integration-tests/tests/treasury.rs`): every case goes through the `__check_auth` of an
OpenZeppelin smart account with `{ threshold, credential-policy }` on its only rule, and
the credential lives in a real vault deployed by the factory. At the end, the same holder
goes through `credential-vote`: one credential, two gates, one revocation.

Or from the root: `pnpm turbo run test --filter=@acta-gate/contracts`.

ACTA's scripts (`scripts/build.sh`, `deploy.sh`, `deploy-mainnet.sh`, `release.sh`) run
from this folder with `sh scripts/<script>`.

## License

Apache-2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
