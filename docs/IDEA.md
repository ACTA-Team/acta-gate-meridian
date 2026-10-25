# ACTA Gate

**Let any Soroban contract require a valid verifiable credential.**

Built at HackMeridian 2026 · Scale track · on top of ACTA's vault contracts
(`vc-vault`, `vc-vault-factory`, `did-stellar-registry`), copied into
[`contracts/`](../contracts/README.md) and modified for the gate.

---

## The problem

On Stellar today, a credential is something a person *shows*: a PDF, a QR code, a
link that a person or an off-chain service checks. Contracts cannot read it.

So when an on-chain app needs to know *"is this address a verified
contributor / graduate / member?"*, it keeps its own allowlist, by hand, run by an
admin. That allowlist goes stale as soon as a credential is revoked, and every app
builds it from scratch.

## What ACTA Gate does

ACTA Gate turns a credential stored in an ACTA vault into something a contract can
verify, with revocation applied live.

1. **`vc-vault` (modified)**: the vault now stores **who issued** each credential
   and lets **the issuer revoke it**. It is the source of truth.
2. **`vc-gate`**: an index for contracts. When the treasury is about to pay an
   address, `vc-gate` knows which vault holds its credential and which public claims
   it has (for example, tier Gold). Every query asks the vault again.
3. **`credential-policy`**: a policy for [OpenZeppelin smart accounts](https://docs.openzeppelin.com/stellar-contracts/accounts/smart-account).
   Installed on a treasury, it makes that treasury able to pay only addresses with a
   valid credential.
4. **The passkey holder**: the vault owner is a smart account with Face ID. Her
   vault and her `did:stellar` are the DID that ACTA's model already promises. ACTA
   creates them for her (`deploy_sponsored`, `register_sponsored`): she does not
   sign, does not pay, does not need XLM.

### What we changed in the vault

The original vault stored the credential and knew whose it was, but it lacked two
things for a contract to be able to trust it:

| Missing | Before (`vc-vault` 0.4.0) | Now (0.5.0) |
|---|---|---|
| **Knowing who issued it** | `issue` required the issuer's signature, but **only stored `issuer_did`**, a string the issuer declares. Anyone could store in their vault a credential claiming to be from GrantFox | Each credential stores **`issuer`**: the address that signed the issuance. It is kept if the credential moves to another vault (`push`) |
| **Letting the issuer revoke** | `revoke` required the signature of the **vault owner**, that is, the holder | **`revoke_by_issuer`**: only that credential's `issuer` can call it |
| **Seeing whether the vault is revoked** | `verify_vc` ignored `revoke_vault`, and there was no way to read it | **`is_revoked()`** |

### Why `vc-gate` still exists

When the treasury pays, the policy only knows Marta's **address**, not her vault or
her credential id. Someone has to translate "address → vault → GrantFox credential
of type X", and also store the public claims the gate needs. The vault's `vc_data`
can be encrypted, so those claims cannot be read from there. That is `vc-gate`: an
index, **not a second source of truth**.

### The demo

A GrantFox treasury pays open source contributors in USDC, but only those who hold
a valid "Contributor Gold" credential.

| Step | What happens |
|---|---|
| 1 | Marta creates her wallet with Face ID. ACTA creates her vault and her `did:stellar` |
| 2 | GrantFox issues her a Contributor Gold credential in her vault, and registers it in `vc-gate` with `tier: Gold` |
| 3 | The treasury pays Marta → **passes** |
| 4 | The treasury pays an address without a credential → **the policy rejects it** |
| 5 | GrantFox revokes Marta's credential in her vault (`revoke_by_issuer`) → the next payment **is rejected** |

Nobody updated an allowlist. The revocation reached a third-party contract on its own.

**Marta makes no transaction.** The credential is in her vault, and the vault
already says it is hers.

---

## Architecture

```
                       ACTA (in contracts/)                         ACTA Gate (new)
  ┌──────────────────────────────────────────┐
  │ vc-vault-factory                         │◄── is_vault? ───────┐
  │   one vault per holder                   │                     │
  └──────────────────────────────────────────┘                     │
  ┌──────────────────────────────────────────┐           ┌─────────┴─────────┐
  │ Marta's vc-vault (0.5.0)                 │◄─ reads ──│     vc-gate       │◄── GrantFox
  │   vault_owner() → her smart account      │           │  register()       │    (registers)
  │   get_vc(id).issuer → who issued it      │           │  is_valid()       │
  │   verify_vc(id) → Valid / Revoked        │           │  has_claim()      │
  │   revoke_by_issuer(id) ◄── GrantFox      │           └─────────▲─────────┘
  │   is_revoked()                           │                     │ is_valid?
  └──────────────────────────────────────────┘           ┌─────────┴─────────┐
  ┌──────────────────────────────────────────┐           │ credential-policy │
  │ did-stellar-registry                     │           │  (OZ Policy)      │
  │   Marta's did:stellar                    │           └─────────▲─────────┘
  └──────────────────▲───────────────────────┘                     │ enforce()
                     │ controller                 GrantFox treasury (OZ smart account)
  Marta's passkey smart account                   a single Default rule: threshold + credential-policy
  (vault owner)
```

---

## Contract: `vc-gate`

**No admin, no upgrade.** Its only dependency (the vault factory) is fixed in the
constructor.

```rust
__constructor(vault_factory: Address)
```

### ABI

| Function | Auth | Purpose |
|---|---|---|
| `register(issuer, vault, vc_id, credential_type, claims)` | `issuer` | Links a credential the issuer already issued, with its public claims |
| `is_valid(holder, issuer, credential_type)` | — | `bool` |
| `has_claim(holder, issuer, credential_type, key, value)` | — | `bool` |
| `check(holder, issuer, credential_type, claims)` | — | `bool`: `is_valid` plus all the claims, in a single call |
| `get_record(holder, issuer, credential_type)` | — | `Option<GateRecord>` |

`vc-gate` has no `revoke`: the issuer revokes in the vault, and the gate sees it on
the next query.

### `register`: what is checked, in order

```
 1. issuer.require_auth()
 2. vault_factory.is_vault(vault)                          else NotAVault
 3. credential_type ≤ 64 bytes; claims ≤ 8 entries,
    each value ≤ 64 bytes                                  else InputTooLong
 4. vault.get_vc(vc_id).issuer == issuer                   else NotTheIssuer
 5. vault.verify_vc(vc_id) == Valid and !vault.is_revoked() else CredentialNotValid
 6. holder = vault.vault_owner()
 7. store GateRecord under (holder, issuer, credential_type); emit Registered
```

**Step 4 is the key.** The vault now stores the address that signed the issuance,
so `vc-gate` can check on-chain that whoever registers really is the issuer. Nobody
can register someone else's credential with made-up claims.

### `is_valid`: re-checked on every call

```
r = record(holder, issuer, credential_type)        if it does not exist, false
r.vault.verify_vc(r.vc_id) == Valid                (holder and issuer revocation)
!r.vault.is_revoked()                              (the whole vault)
```

`has_claim` is `is_valid` plus `r.claims[key] == value`. `check` is `is_valid` plus
all the claims passed to it at once, so that a caller that needs several does not pay
one cross-contract call for each: it is what `credential-policy` uses.

### Types and storage

```rust
pub struct GateRecord {
    pub vault: Address,
    pub vc_id: String,
    pub claims: Map<String, String>,    // e.g. { "tier": "Gold" }
    pub registered_at: u64,
}
```

| Key | Type | Content |
|---|---|---|
| `Config` | instance | The vault factory, fixed in the constructor |
| `Record(holder, issuer, credential_type)` | persistent | `GateRecord`. A new record of the same type replaces the previous one (for example, Silver → Gold) |

### Errors

| Code | Name | When |
|---:|---|---|
| 1 | `NotAVault` | The vault was not deployed by ACTA's factory |
| 2 | `InputTooLong` | Type, claims or values above the limits |
| 3 | `NotTheIssuer` | The credential does not exist in the vault, or its `issuer` is someone else |
| 4 | `CredentialNotValid` | The credential or the vault is revoked |

### Events

`Registered { holder, issuer, credential_type, vault, vc_id }`

---

## Contract: `credential-policy`

An implementation of OpenZeppelin's `Policy` trait (`stellar-accounts` 0.7.2).

### Installation parameters

```rust
pub struct Claim { pub key: String, pub value: String }

pub struct Requirement {
    pub gate: Address,               // vc-gate
    pub issuer: Address,             // the issuer whose credentials count (GrantFox)
    pub credential_type: String,     // e.g. "ContributorBadge"
    pub claims: Vec<Claim>,          // all must match, e.g. [{ tier: Gold }]
}
```

If `claims` is empty, any valid credential of that type works. It is stored per
`(smart_account, context_rule_id)`, as OpenZeppelin requires for policies shared
across accounts. Two claims with the same key contradict each other: `enforce`
fails closed with `MalformedRequirement`.

### `enforce`

```
smart_account.require_auth()
authenticated_signers is not empty                              else NoSigners
(fn, args) = the call being authorized; if it is execute(target, target_fn,
             target_args) on the account itself, (target_fn, target_args) is used
fn == "transfer":
    recipient = args[1]               (a MuxedAddress resolves to its base account)
    ok = gate.check(recipient, issuer, type, claims)      (a single cross-contract call)
    ok                                                          else RecipientNotCredentialed
fn == "approve":                                                     AllowanceNotPermitted
transfer or execute with arguments that cannot be read:              MalformedCall
claims with the same key twice:                                      MalformedRequirement
anything else: allowed            (the account's administrative calls keep working)
```

### Treasury configuration

The policy is only as strong as the rule it sits in. Three things in OpenZeppelin's
`do_check_auth` make this concrete:

| Pitfall | Why | Required configuration |
|---|---|---|
| A rule with policies does not verify its signers | It delegates the signer check to the policies | `enforce` rejects an empty signer set, **and** the same rule carries the threshold policy (k of n) |
| The signer chooses which rule applies | `AuthPayload.context_rule_ids`; `Default` applies to every call | The treasury has **one** rule: `Default` → `{ threshold, credential-policy }` |
| `execute` hides the `transfer` | The inner `transfer` is authorized by the invoker, never by `__check_auth` | `enforce` opens `execute` and checks the inner call |

- **The `transfer` of any token is checked**, not just USDC's.
- **`approve` is rejected.** Otherwise, an allowance followed by `transfer_from` would
  skip the check.
- **Install it on an account with no live allowances.** Rejecting `approve` closes
  the bypass going forward, but an allowance granted *before* installing the policy
  does not go through the treasury's `__check_auth`: the `transfer_from` is signed by
  the spender. A new account, or verify there are none.
- **`burn` passes.** It pays no one, so it is not an uncredentialed payment, but it
  destroys funds. It stays on the governance side, just like uninstalling the policy.
- **The policy limits payments, not governance.** Whoever meets the threshold can
  uninstall it.

Implementation notes and evidence: [`IMPLEMENTATION.md`](IMPLEMENTATION.md).

## Contract: `credential-vote`

The second consumer of `vc-gate`, to prove the title's claim: it is not a smart
account or a payment, it is an ordinary contract that asks before letting someone
act. A vote among GrantFox's contributors: **only those with a valid credential can
propose and vote.** The same credential of Marta's opens a payment and a vote;
GrantFox revokes it once in her vault, and both close.

**No admin, no upgrade.** The requirement is fixed in the constructor, with the same
shape as `credential-policy`'s:

```rust
__constructor(requirement: Requirement)   // gate, issuer, credential_type, claims
```

Two claims with the same key contradict each other: deployment fails with
`MalformedRequirement`, so a badly built requirement never gets to vote.

### ABI

| Function | Auth | Purpose |
|---|---|---|
| `propose(proposer, title) -> u32` | `proposer` | Opens a proposal. The proposer has to be credentialed |
| `vote(voter, proposal, in_favor)` | `voter` | One vote per address and proposal. Queries `vc-gate` at that moment |
| `proposal(id) -> Option<Proposal>` | — | Title, proposer, votes for and against, `created_at` |
| `has_voted(proposal, voter) -> bool` | — | |
| `can_vote(who) -> bool` | — | What the gate answers today about `who`, under this requirement |

Each check is **a single call** to `vc-gate.check(holder, issuer, type,
claims)`, no matter how many claims the requirement demands, just like in
`credential-policy`.

**The credential is checked when voting, not when it was issued.** A revocation
blocks new votes and proposals; votes already cast remain. It is the same rule as in
the treasury: the gate caches nothing, and the revocation arrives on its own.

Unlike the treasury, here **Marta acts**: `vote` requires her signature. With her
passkey smart account, it is a Face ID.

### Errors

| Code | Name | When |
|---:|---|---|
| 1 | `NotCredentialed` | `vc-gate` does not vouch for that address with the required claims |
| 2 | `ProposalNotFound` | |
| 3 | `AlreadyVoted` | Second time on the same proposal |
| 4 | `InputTooLong` | Title longer than 128 bytes |
| 5 | `MalformedRequirement` | In the constructor: two claims with the same key |

### Events

`Proposed { id, proposer, title }` · `Voted { id, voter, in_favor }`

---

## Security model

| Property | How |
|---|---|
| The credential is authentic | The vault stores in `issuer` the address that signed the issuance; `vc-gate` checks it at registration |
| The vault is legitimate | `vault_factory.is_vault(vault)`: it was deployed by ACTA's factory |
| It belongs to whoever presents it | The credential is in a vault whose `vault_owner` is the payment recipient. That owner never changes |
| Revocation is immediate | `is_valid` reads the vault's `verify_vc` and `is_revoked` on every call; there is no cache |
| No admin keys | `vc-gate` has no admin and no way to be upgraded |

**Trust assumption:** whoever configures the policy knows the issuer's address (for
example, GrantFox's). The issuer's `did:stellar` is for display, not for deciding.

**What is public:** only the claims the issuer registers in `vc-gate` (such as
`tier: Gold`). **The vault's `vc_data` can stay encrypted**, as ACTA already does.

---

## Cost

Measured with mainnet parameters (August 2026, XLM = $0.172).

| Item | Cost | When |
|---|---|---|
| Vault issuance fee | 1 USDC on mainnet · 5 XLM on testnet (set by the factory) | Per credential |
| Credential rent in the vault | ~$0.082/year (201 B `vc_data`) · ~$0.137/year (1 KB) | Per credential |
| Registration in `vc-gate` | *measured at the event* | Per credential used in the gate |
| Holder's vault | ~$0.057/year in rent (+ the deployment, once) | Per person |
| Holder's `did:stellar` | ~0.27 XLM/year (≈ $0.046) | Per person |

---

## How to run it

> To be completed at the event.

```bash
pnpm install
pnpm turbo run test --filter=@acta-gate/contracts   # the six contracts
pnpm dev                                           # web :3000 and api :4000
```

Contract details and how to test them: [`contracts/README.md`](../contracts/README.md).

**Stack:** `soroban-sdk` 26.1 across the workspace · OpenZeppelin `stellar-accounts`
0.7.2 · `smart-account-kit`.

## Deployments

The modified vault is a new contract: the demo uses new testnet deployments
(factory with the 0.5.0 vault template). The original model's deployments, for
reference, are in [`deployments/`](deployments/).

| Contract | Testnet |
|---|---|
| `vc-vault-factory` | `CCPEKQVBJP5XK4WLJS3XOVJFH2Q2IQPJK4DAYKUS3NGMCGWMXUJU5TKU` |
| `vc-gate` | `CDNCAGEI3OCL5G6NL7UVKYR7Q34UPBGPO4SZB3YKOHCPKU5U33LN5UOD` |
| `credential-policy` | `CBNICQYB5VOIWYPS4WF27OAKCKEALW54SYGFETN63UYF6537KCQZEH66` |
| `credential-vote` | `CAZUHZRKTGYD2DSIQCTKX5KO3HS4FI565D256HFY5YWAJGLD367GBEAN` |
| `did-stellar-registry` | `CCGVBGVF5V4L7N6QNHBZQLZ6LY7W6ZUFR4JCPWCUKATQWUFBX5TS3OWZ` |

---

## Limitations

- **If the holder moves the credential to another of their vaults (`push`)**, the
  gate record keeps pointing to the previous vault and `is_valid` returns false until
  the issuer calls `register` again. **The contract needs nothing new:** `push` is
  owner-scoped (`receive_push` rejects with `PushOwnerMismatch` if the destination's
  owner is someone else), so `vault_owner` does not change, the key
  `(holder, issuer, credential_type)` is the same and the record is replaced. What is
  missing is the backend plumbing that detects the push and registers again.
- **Revocations live in the vault**, which is correct, but a credential that is not
  registered in `vc-gate` does not exist for the gate.

## Roadmap

- **Detect a `push` and register again** from the backend; the contract already supports it (see Limitations).
- **Bring the vault changes to ACTA's public repo**, and deploy them on mainnet.
- **Move to the Merkle model** when it launches: the gate keeps the same interface
  (`is_valid`, `has_claim`) and only changes where it reads from.
- **Zero-knowledge selective disclosure** (X-Ray, Protocol 25).
- Credential **expiration**.
- **AI agents:** credentials for agents, verified before an x402 payment.
