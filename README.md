# ACTA Gate

**Let any Soroban contract require a valid verifiable credential.**

HackMeridian 2026 · Scale track · built on [ACTA](https://github.com/ACTA-Team)'s vault
contracts (`vc-vault`, `vc-vault-factory`, `did-stellar-registry`), which are already on
mainnet.

- Idea and specification: [`docs/IDEA.md`](docs/IDEA.md)
- Implementation research: [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md)

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
