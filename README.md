# ACTA Gate

**Let any Soroban contract require a valid verifiable credential.**

HackMeridian 2026 · Scale track · built on [ACTA](https://github.com/ACTA-Team)'s vault
contracts (`vc-vault`, `vc-vault-factory`, `did-stellar-registry`), which are already on
mainnet.

- Idea and specification: [`docs/IDEA.md`](docs/IDEA.md)
- Implementation research: [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md)

## Built during HackMeridian

Everything in this repository was written on 25 October 2026, in
[these commits](https://github.com/ACTA-Team/acta-gate-meridian/compare/3456e58...main)
(`3456e58`, the empty monorepo, to `main`). ACTA's three contracts came in as they were on
mainnet and were changed here.

| Existed before (ACTA, [`contracts-acta@282fe47`](https://github.com/ACTA-Team/contracts-acta/tree/282fe47)) | Built on 25 Oct |
|---|---|
| `vc-vault` 0.4.0: the holder's vault, on mainnet | `vc-vault` 0.5.0: records the `issuer`, `revoke_by_issuer`, `is_revoked` ([commit](https://github.com/ACTA-Team/acta-gate-meridian/commit/bd17820)) |
| `vc-vault-factory`: deploys vaults, `is_vault` | `vc-gate`: the index from an address to its credential and claims ([commit](https://github.com/ACTA-Team/acta-gate-meridian/commit/56f2500), [`check`](https://github.com/ACTA-Team/acta-gate-meridian/commit/5f13881)) |
| `did-stellar-registry`: `did:stellar` on chain | `credential-policy`: the OpenZeppelin `Policy` with the three traps covered ([commit](https://github.com/ACTA-Team/acta-gate-meridian/commit/32c3367)) |
| The three were on `soroban-sdk` 23.4; here they build on 26.1 unchanged | `credential-vote`: the second consumer of the gate ([commit](https://github.com/ACTA-Team/acta-gate-meridian/commit/3f286b4)) |
| | `integration-tests`: treasury and vote through a real OpenZeppelin smart account ([commit](https://github.com/ACTA-Team/acta-gate-meridian/commit/790e16f)) |
| | `apps/api` and `apps/web`: the backend and the demo console ([api](https://github.com/ACTA-Team/acta-gate-meridian/commit/a4d7a4c), [web](https://github.com/ACTA-Team/acta-gate-meridian/commit/e98338e)) |
| | Testnet deployments and the verified on-chain run ([doc](docs/deployments/acta-gate-testnet.md)) |

## Gate your contract in 10 lines

This is what `credential-vote` does before letting anyone propose or vote, condensed from
[`contracts/credential-vote/src/lib.rs`](contracts/credential-vote/src/lib.rs). One
cross-contract call, whatever the number of claims, and nothing to cache: `vc-gate` re-reads
the vault every time, so a revocation by the issuer reaches your contract on the next call.

```rust
#[contractclient(name = "GateClient")]
trait Gate {
    fn check(e: Env, holder: Address, issuer: Address, credential_type: String,
             claims: Map<String, String>) -> bool;
}

fn require_credentialed(e: &Env, who: &Address) {
    let req = storage::requirement(e);                    // gate, issuer, type, claims: fixed at deploy
    let ok = GateClient::new(e, &req.gate)
        .check(who, &req.issuer, &req.credential_type, &claims_map(e, &req));
    if !ok { panic_with_error!(e, Error::NotCredentialed) }
}
```

A smart account gets the same thing without writing code: install `credential-policy` on its
rule and every `transfer` goes through that `check`.

## How judges can test it

**Live demo:** [gate.acta.build](https://gate.acta.build), backed by
[backend-gate.acta.build](https://backend-gate.acta.build) on Stellar testnet. You play all
three roles. Six clicks, each one a real testnet transaction, each one linked to the explorer
from the dialog and the activity feed:

1. **Marta: create the wallet.** A passkey (Face ID, Touch ID or Windows Hello). ACTA registers
   her `did:stellar` and deploys her vault; she signs nothing and needs no XLM.
2. **GrantFox: issue Gold.** Into her vault, then registered in `vc-gate` with `tier: Gold`.
3. **Treasury: pay Marta.** The policy asks `vc-gate.check` → paid.
4. **Treasury: pay someone without a credential.** → `RecipientNotCredentialed`.
5. **GrantFox: revoke in the vault.** `revoke_by_issuer`; nobody touches the gate.
6. **Treasury: pay Marta again.** → rejected. The revocation reached a contract GrantFox does
   not own.

Below the three panels, the vote: Marta proposes and votes with the same credential, signing
with her passkey, and after step 5 she cannot any more.

**Already verified on chain:** [`docs/deployments/acta-gate-testnet.md`](docs/deployments/acta-gate-testnet.md)
lists the contracts, the accounts, the measured costs and the step-by-step run, including the
[payment to a credentialed holder](https://stellar.expert/explorer/testnet/tx/25d68ea2464686ce0b89f6bfa700fd3807c1daaf7c9b210762f5bef9496b456d)
and the [issuer's revocation](https://stellar.expert/explorer/testnet/tx/b7919b03589f7d4bc06b114810ec139839b9d9fdb766fec1c20def1cd6f94fe0).

**Run the contract tests locally** (the vault's WASM first: `vc-gate` imports it, and its
`build.rs` stops with that exact command if it is missing, without running cargo itself):

```bash
cd contracts
cargo build -p vc-vault-contract --target wasm32v1-none --release
cargo test                                  # every contract
cargo test -p acta-gate-integration-tests   # the treasury and the vote, end to end
```

## Layout

```
apps/
  web/                 Next.js 16: passkey identity, treasury and vote demo (English and Spanish)
  api/                 Express 5: issues the demo's credentials (through vc-gate),
                       signs treasury payments, relays the holder's signed votes
packages/
  shared/              Networks and contract IDs, shared by web and api
  typescript-config/   Base, node and nextjs tsconfigs
contracts/             Cargo workspace (soroban-sdk 26.1, stellar-accounts 0.7.2)
  vc-vault/            ACTA, modified here
  vc-vault-factory/    ACTA
  did-stellar-registry/  ACTA
  vc-gate/             Index: from an address to its credential and its claims
  credential-policy/   The treasury's policy
  credential-vote/     Contributor vote: the second contract that asks vc-gate
circuits/              Reserved for the ZK phase (Circom + Groth16 over BN254)
docs/
```

Turborepo runs everything, contracts included: `contracts/package.json` wraps `cargo`.

## Requirements

- Node 24 and pnpm 11
- Rust stable with the `wasm32v1-none` target
- stellar-cli **25.2 or later**. `stellar-accounts` 0.7.2 turns on `experimental_spec_shaking_v2`,
  and `soroban-sdk` refuses to build WASM with an older CLI

## Commands

```bash
pnpm install
pnpm dev                                   # web :3000 and api :4000
pnpm build                                 # everything, contracts included
pnpm test
pnpm turbo run test --filter=@acta-gate/contracts
```

Environment variables: copy `apps/api/.env.example` and `apps/web/.env.example` to `.env`.

Deployed: the api runs on Railway at https://backend-gate.acta.build (`railway.json`), and the
web uses it by default; point `NEXT_PUBLIC_API_URL` at `http://localhost:4000` to use a local
api. The web deploys to Vercel with `apps/web` as its root directory (`apps/web/vercel.json`).
The api's `CORS_ORIGIN` takes every web origin, comma-separated.

## The demo

Run `pnpm dev` and open http://localhost:3000. The console follows the five steps in
[`docs/IDEA.md`](docs/IDEA.md): Marta (holder), GrantFox (issuer) and the treasury.
Below them sits the second gate: the contributor vote (`credential-vote`), with the same
requirement. The same credential opens a payment and a vote; one revocation closes both.
The page is in English and Spanish (the language menu in the header).

The backend calls the contracts deployed on testnet with `contract.Client.from`; the
treasury pays through an Ed25519 signer, and ACTA's account pays the fees. The contract IDs
come from `packages/shared` ([`docs/deployments/acta-gate-testnet.md`](docs/deployments/acta-gate-testnet.md));
`apps/api/.env` needs the treasury's address and the three secret keys, and the backend
refuses to start without them. The API's tests run against an in-memory double of the
contracts' rules (`apps/api/test/mock-chain.ts`), with no network.

| Endpoint | Step |
|---|---|
| `POST /dids { address }` | 1a. ACTA registers Marta's `did:stellar` with her passkey as its key (`register_sponsored`) |
| `POST /holders { address }` | 1b. ACTA creates Marta's vault, bound to her DID (`deploy_sponsored`) |
| `POST /credentials { address, tier }` | 2. GrantFox issues (`issue`) and registers in `vc-gate` |
| `POST /payments { to, amount }` | 3 and 4. The treasury pays; `credential-policy` decides |
| `POST /credentials/revoke { address }` | 5. GrantFox revokes in the vault (`revoke_by_issuer`) |
| `POST /proposals { proposer, title, auth? }` | 6. Marta opens a proposal (`credential-vote.propose`); `vc-gate` decides |
| `POST /votes { voter, proposal, inFavor, auth? }` | 6. Marta votes (`credential-vote.vote`); the credential is checked at that moment |
| `GET /proposals?voter=` | Proposals, their tally, and the voter's `has_voted` |
| `GET /holders/:address` · `GET /activity` · `GET /config` | State of the vault, of `vc-gate` and `can_vote`; activity log |

`propose` and `vote` need Marta's signature (`require_auth`), so they take two rounds: the first one simulates the call (a rejection
such as `NotCredentialed` or `AlreadyVoted` shows up there, before anyone signs) and
answers `{ status: "unsigned", authEntry }`; the web signs it with the passkey
(`smart-account-kit`, Default rule 0) and sends it back in `auth`. The backend simulates
again and submits it, paying the fee with ACTA's account.

## Known limitations

- **`execute` is unwrapped one level only.** `credential-policy` opens
  `execute(target, fn, args)` and checks the inner call. An `execute` whose inner call is
  another `execute` of the same account is let through as an admin call, and the policy
  does not recurse. That is not a bypass today because Soroban forbids reentrancy: the
  account cannot call its own `execute` from inside `execute`, so the nested call never
  runs. The policy relies on that rule rather than on unwrapping every level.
- **The passkey deployer secret ships to the browser.** `NEXT_PUBLIC_DEPLOYER_SECRET` pays
  for the holder's smart account on testnet only. On mainnet that is the relayer's job.
- **The testnet deployment may predate the TTL hardening in this branch.** `credential-policy`
  now extends the TTL of its `Requirement` and instance on install and on every read,
  rejects a duplicate claim key at `install`, and emits `Enforced`; `vc-gate` extends its
  instance on every read and caps `vc_id`; `credential-vote.has_voted` extends the vote it
  reads. The contract IDs in [the deployment doc](docs/deployments/acta-gate-testnet.md)
  were deployed before those changes. Redeploying the policy means redeploying the treasury
  too (`apps/api/scripts/deploy-smart-account.ts treasury`): the policy is installed on its
  rule.
- A credential that is not registered in `vc-gate` does not exist for the gate.
- If the holder moves a credential to another of their vaults (`push`), the issuer has to
  call `register` again. The contract already supports it; the backend does not detect it yet.
- Proposing and voting with a passkey are not verified on chain yet
  ([placeholder](docs/deployments/acta-gate-testnet.md#proposal-and-vote-verified-on-chain-passkey)).

## Roadmap

Bring the vault changes to ACTA's public contracts and mainnet, credential expiration,
zero-knowledge selective disclosure (Protocol 25 BN254 and Poseidon host functions, see
[`circuits/`](circuits)), and credentials for AI agents checked before an x402 payment.
