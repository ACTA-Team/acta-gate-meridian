# ACTA Gate — implementation research

How to build what [`IDEA.md`](IDEA.md) explains on top of ACTA's vault contracts,
which live in [`contracts/`](../contracts/README.md) and are modified
here. Everything was verified against the source code and against the real state of testnet.
Updated 2026-10-25.

---

## 1. What the vault was missing, and what we changed

The original vault (`vc-vault` 0.4.0, the one on mainnet) is commit `282fe47`
of the public repo. The "Before" lines point there; the "Now" lines, to the code in
this repo.

| Gap | Before (0.4.0) | Now (0.5.0) |
|---|---|---|
| **It didn't store who issued** | `issue` requires the signature of `issuer_addr` ([`contract.rs:197`](https://github.com/ACTA-Team/contracts-acta/blob/282fe47/contracts/vc-vault/src/contract.rs#L197)) but stores only `issuer_did`, a free-form string ([`:216`](https://github.com/ACTA-Team/contracts-acta/blob/282fe47/contracts/vc-vault/src/contract.rs#L216)). The address is kept only in the `vc_issued` event ([`:220`](https://github.com/ACTA-Team/contracts-acta/blob/282fe47/contracts/vc-vault/src/contract.rs#L220)), and RPCs drop events after ~7 days | `VerifiableCredential.issuer` ([`verifiable_credential.rs:23`](../contracts/vc-vault/src/types/verifiable_credential.rs#L23)), stored in `issue` and `batch_issue` ([`contract.rs:233`](../contracts/vc-vault/src/contract.rs#L233), [`:296`](../contracts/vc-vault/src/contract.rs#L296)) and preserved in `push` ([`:370`](../contracts/vc-vault/src/contract.rs#L370), [`:423`](../contracts/vc-vault/src/contract.rs#L423)) |
| **The issuer couldn't revoke** | `revoke` requires the signature of the **vault owner** ([`:280-284`](https://github.com/ACTA-Team/contracts-acta/blob/282fe47/contracts/vc-vault/src/contract.rs#L280-L284)) | `revoke_by_issuer` ([`contract.rs:324`](../contracts/vc-vault/src/contract.rs#L324)): requires the signature of `get_vc(id).issuer` ([`:336`](../contracts/vc-vault/src/contract.rs#L336)) and works even if the vault is revoked. The holder still revokes with `revoke` ([`:307`](../contracts/vc-vault/src/contract.rs#L307)) |
| **There was no way to read whether the vault was revoked** | `revoke_vault` marks the vault ([`:117`](https://github.com/ACTA-Team/contracts-acta/blob/282fe47/contracts/vc-vault/src/contract.rs#L117)), but `verify_vc` doesn't check it ([`:164`](https://github.com/ACTA-Team/contracts-acta/blob/282fe47/contracts/vc-vault/src/contract.rs#L164)) and there was no function to read it | `is_revoked()` ([`contract.rs:107`](../contracts/vc-vault/src/contract.rs#L107)) |

Also:
- **The version goes up to 0.5.0**, with the new `VCRevokedByIssuer` event.
- **The `issuance_contract` field stays as it was.** `issue` and `receive_push` always
  set it to this vault, so the `verify_vc` branch that delegates to another contract
  ([`contract.rs:183`](../contracts/vc-vault/src/contract.rs#L183)) is unreachable.
  It is commented in the code because, if some future flow allowed setting it, that
  branch would return whatever the other contract says **without reading `read_vc_status`**: it
  would skip `revoke` and `revoke_by_issuer`, and the gate's `is_valid` goes through there.
- **Tests:** 9 new in `vc-vault` and 1 in `vc-vault-factory`.
  - That `issue` and `batch_issue` store the issuer, and that `push` preserves it.
  - That `revoke_by_issuer` requires exactly the issuer's signature, and that the owner can't
    revoke as the issuer.
  - The errors when revoking something that doesn't exist, twice, or after the holder
    revoked it.
  - `is_revoked`, and that the issuer can revoke inside a revoked vault.

**What doesn't change:** issuance stays open (anyone can issue into any
vault, by paying the fee). The difference is that now **we know who it was**, and that
is enough for a contract to decide whom it trusts.

---

## 2. A single workspace on `soroban-sdk` 26.1

The six contracts are in `contracts/`, in a single workspace. ACTA's came
from 23.4 and were upgraded to 26.1, because `stellar-accounts` 0.7.2 (OpenZeppelin's smart
accounts) requires `soroban-sdk ^26.1`.

| | Result |
|---|---|
| ACTA's contract code | **Compiled unchanged** on 26.1 |
| Tests | 11 lines adapted: on 26.1, `env.events().all()` returns `ContractEvents` (no `.len()` or `.get()`). Events are now compared whole, in XDR, with `Event::to_xdr` |
| `Cargo.lock` | Only added the entries for the three contracts, without changing any version |

The vault WASM changed, so **it is no longer the mainnet one**. The demo uses new
deployments on testnet (§4).

---

## 3. Stack

```toml
# contracts/Cargo.toml
[workspace.dependencies]
soroban-sdk      = "26.1.0"
stellar-accounts = "0.7.2"        # OpenZeppelin's Policy trait and types
```

- **Commit `Cargo.lock`.** Resolving dependencies from scratch breaks
  `soroban-env-host` (incompatible `rand_core`); it already happened to us when splitting contracts into
  another workspace.
- **Build the vault WASM before the tests and clippy:** the factory tests
  import it at compile time. CI and `contracts/package.json` already do this.

---

## 4. Infrastructure

### What has to be deployed

| Piece | Why |
|---|---|
| `vc-vault` 0.5.0 template + a `vc-vault-factory` built with it | The vault changed; the factory pins the template hash when it is constructed |
| `vc-gate` and `credential-policy` | They are the new pieces |

The `did-stellar-registry` code didn't change, but a dedicated instance is deployed
for the demo instead of reusing ACTA's.

### What is reused (testnet)

| Piece | Testnet |
|---|---|
| Smart account (one per wallet) | WASM `1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a` |
| WebAuthn verifier (passkeys) | `CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F` |
| Ed25519 verifier | `CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4` |
| Threshold policy | `CB3FATQKCIRIQOCYRUPCQ2KREQ7T4RPKS7EAEOZWPEPUKWEDRVROBCEG` |
| USDC (Circle), SAC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |

The deployments of the original model (vault 0.4.0, factory, fees) are kept for
reference in [`deployments/`](deployments/). On mainnet, the registry is 0.2.0, which
**doesn't have `register_sponsored`**: there Marta would have to sign her DID once.

**Compatibility with our policy.** The `smart-account-kit` contracts were
compiled with `soroban-sdk` 26.1.0 from OpenZeppelin commit `1e513890`, which
is not exactly `v0.7.2` (38 commits ahead, 2 behind). We compared them: the
`Policy` trait and the types it receives (`ContextRule`, `Signer`, `ContextRuleType`) are
identical. A policy compiled against `stellar-accounts` 0.7.2 works with those
accounts.

**The USDC** is Circle's: the issuer has `home_domain` = `centre.io`, and about
4,000 contracts already hold it, so a smart account can receive it.

---

## 5. `vc-gate`: how to build it

### 5.1 Talking to the vault

Since the vault is in the same workspace, **no hand-written mirrors are needed**.
`vc-gate` imports the vault WASM, just like the factory tests, and gets the
client and the types (`VerifiableCredential` with `issuer`, `VCStatus`) always
in sync with the real code:

```rust
mod vc_vault {
    soroban_sdk::contractimport!(file = "../target/wasm32v1-none/release/vc_vault_contract.wasm");
}

#[contractclient(name = "VaultFactoryClient")]
pub trait VaultFactory { fn is_vault(e: Env, vault_address: Address) -> bool; }
```

- Requires building the vault WASM before `vc-gate`. CI already does this.
- **Don't depend on `vc-vault-contract` as a crate.** A contract linked as a
  dependency exports its functions inside the WASM of whoever uses it.
- **In `is_valid`, use the `try_` methods.** That way an archived vault returns `false`
  instead of aborting the caller's transaction.

### 5.2 `register`

```rust
pub fn register(e: Env, issuer: Address, vault: Address, vc_id: String,
                credential_type: String, claims: Map<String, String>) {
    issuer.require_auth();
    if !VaultFactoryClient::new(&e, &factory(&e)).is_vault(&vault) {
        panic_with_error!(&e, Error::NotAVault);
    }
    check_caps(&e, &credential_type, &claims);                  // type ≤ 64, ≤ 8 claims, values ≤ 64

    let v = vc_vault::Client::new(&e, &vault);
    match v.get_vc(&vc_id) {
        Some(vc) if vc.issuer == issuer => {}                   // on-chain proof of who issued
        _ => panic_with_error!(&e, Error::NotTheIssuer),
    }
    if v.verify_vc(&vc_id) != vc_vault::VCStatus::Valid || v.is_revoked() {
        panic_with_error!(&e, Error::CredentialNotValid);
    }
    let holder = v.vault_owner();
    let record = GateRecord { vault, vc_id, claims, registered_at: e.ledger().timestamp() };
    storage::write_record(&e, &holder, &issuer, &credential_type, &record);
    events::registered(&e, &holder, &issuer, &credential_type, &record);
}
```

- **Issuing and registering are two transactions** (a Soroban transaction makes a
  single invocation): first `vault.issue`, then `gate.register`. The same
  issuer signs both; ACTA's backend can submit both.
- `vc-gate` no longer needs to issue on behalf of the issuer, nor does the signature need to cover
  nested calls: the vault alone proves who issued.

### 5.3 `is_valid`

```rust
pub fn is_valid(e: Env, holder: Address, issuer: Address, credential_type: String) -> bool {
    let Some(r) = storage::read_record(&e, &holder, &issuer, &credential_type) else { return false };
    let v = vc_vault::Client::new(&e, &r.vault);
    let valid = matches!(v.try_verify_vc(&r.vc_id), Ok(Ok(vc_vault::VCStatus::Valid)));
    let vault_ok = matches!(v.try_is_revoked(), Ok(Ok(false)));
    valid && vault_ok
}
```

- **`verify_vc` already covers both revocations:** the holder's (`revoke`) and the
  issuer's (`revoke_by_issuer`). There is no duplicated revocation in the gate.
- **There's no need to re-check `issuer` or `vault_owner`:** the issuer of a
  credential and the owner of a vault never change.
- `verify_vc` **extends the TTL** of the credential, which means it writes. Inside a
  real transaction it costs a bit more; in a simulation it doesn't matter.

### 5.4 `check`: a single hop for several claims

`credential-policy` needs validity **and** all the claims. With `is_valid` plus one
`has_claim` per claim it was `1+N` cross-contract calls to the gate, and each one called
the vault twice again (`try_verify_vc` + `try_is_revoked`): with 3 claims, 9
hops and 3 redundant TTL extensions, all inside `__check_auth`, where the
CPU budget is scarce.

```rust
pub fn check(e: Env, holder: Address, issuer: Address,
             credential_type: String, claims: Map<String, String>) -> bool {
    match storage::read_record(&e, &holder, &issuer, &credential_type) {
        // Compare the claims first: a claim that doesn't match doesn't spend the hop.
        Some(record) => {
            claims.iter().all(|(k, v)| record.claims.get(k) == Some(v))
                && vault_says_valid(&e, &record)
        }
        None => false,
    }
}
```

- **An empty map is `is_valid`:** `all` over nothing is true.
- **`is_valid` and `has_claim` stay.** They are the public ABI any other
  contract can use; `check` is additive.
- **`Requirement.claims` is a `Vec`,** so it can carry the same key twice
  with different values. Turning it into a `Map` would keep only one and lose the other
  requirement, so such a requirement fails closed with `MalformedRequirement`.

### 5.5 Design decisions

- **Key `(holder, issuer, credential_type)`.** A new record of the same type
  replaces the previous one (for example, Silver → Gold). If more than one
  active credential of the same type were needed, the key would have to include the `vc_id`.
- **No admin.** The vault factory is fixed in the constructor.
- **The gate doesn't cache validity.** It only stores where the credential is and its claims.

---

## 6. `credential-policy`: how to build it, and three traps

The policy implements `stellar_accounts::policies::Policy`.

| Method | What for |
|---|---|
| `enforce(e, context, authenticated_signers, context_rule, smart_account)` | Called inside the account's `__check_auth`. Panics to reject |
| `install(e, params, context_rule, smart_account)` | Stores the `Requirement` by `(smart_account, rule.id)` |
| `uninstall(e, context_rule, smart_account)` | Deletes it |

The three traps came from OpenZeppelin's code (`smart_account/storage.rs`,
function `do_check_auth`). None of them is in the general documentation, and all three
would let the treasury pay someone without a credential.

### Trap 1 — a rule with policies doesn't verify its signers

In `do_check_auth`, a rule **with** policies skips the "all signers must sign"
check and leaves everything to the policies. If `credential-policy` were the
only policy of a rule, **anyone could send a payment without any signature**, and
it would pass as long as the recipient has a credential. A contributor with a credential
could drain the treasury to themselves.

**Fix (two layers):**
- `enforce` panics if `authenticated_signers.is_empty()`. This is exactly what
  OpenZeppelin's `spending_limit` policy does.
- The rule must also carry the threshold policy (k of n).

### Trap 2 — the signer chooses which rule applies

`AuthPayload.context_rule_ids` lets the signer choose the rule for each
call, and a `Default` rule applies to everything. If the treasury has any rule
without `credential-policy` that can authorize a payment, the signer simply picks
that one.

**Fix:** the treasury has **a single** rule, `Default`, with
`[threshold, credential-policy]`. `credential-policy` lets through calls that aren't
payments (the account's own administrative calls), so administering it
still works.

### Trap 3 — `execute` hides the `transfer`

OpenZeppelin smart accounts have `execute(target, target_fn,
target_args)`. It authorizes the call **to the account itself** and then calls the
target contract directly. The inner `USDC.transfer(from = treasury, …)` is
authorized because the account itself invokes it, so **no policy ever sees a
`transfer`**.

**Fix:** `enforce` unwraps calls to `execute` and applies the same rules
to the inner call.

```rust
fn enforce(e: &Env, context: Context, signers: Vec<Signer>, rule: ContextRule, account: Address) {
    account.require_auth();
    if signers.is_empty() { panic_with_error!(e, Error::NoSigners) }            // trap 1

    let (fn_name, args) = match context {
        Context::Contract(c) if c.contract == account && c.fn_name == symbol_short!("execute") => {
            let f: Symbol = c.args.get(1).unwrap().into_val(e);               // trap 3
            let a: Vec<Val> = c.args.get(2).unwrap().into_val(e);
            (f, a)
        }
        Context::Contract(c) => (c.fn_name, c.args),
        _ => return,                                                          // deployments: not a payment
    };

    if fn_name == symbol_short!("transfer") {
        let to = MuxedAddress::try_from_val(e, &args.get(1).unwrap()).unwrap().address();
        // A single cross-contract call, with as many claims as needed (§5.4).
        if !recipient_is_credentialed(e, &account, rule.id, &to) {
            panic_with_error!(e, Error::RecipientNotCredentialed)
        }
    } else if fn_name == symbol_short!("approve") {
        panic_with_error!(e, Error::AllowanceNotPermitted);  // an allowance + transfer_from would skip the check
    }
}
```

- **Muxed recipient.** Since protocol 23, the SAC's `transfer` takes
  `to: MuxedAddress`. `MuxedAddress::try_from_val` accepts both a regular address
  and a muxed one, and `.address()` returns the base account (verified in
  `soroban-sdk` 26.1, `muxed_address.rs` and `token.rs`).
- **The `transfer` of any token is checked, not just USDC's.** It's the strict
  mode, and the right one for a treasury that "only pays those who hold a
  credential".
- **`approve` is rejected.** Otherwise, the treasury could grant an allowance, and the
  spender's `transfer_from` would be signed by the spender, never by the treasury.
- **An allowance granted before installation is invisible.** Rejecting `approve` closes the
  bypass going forward, but a `transfer_from` against an already granted allowance is
  signed by the spender: it never goes through the treasury's `__check_auth`. It's a
  deployment precondition (§7), not something `enforce` can see.
- **`burn` passes.** Each `require_auth` on the treasury produces its own context,
  so the policy does see the `transfer` made by an intermediate contract. But
  `burn(from = treasury)` falls into "any other: allowed": it doesn't pay
  anyone, although it destroys funds. That's left to governance.
- **The policy limits payments, not governance.** Whoever meets the threshold can still
  uninstall it.

---

## 7. The treasury

| Parameter | Value |
|---|---|
| Account | `smart-account-kit` wallet (WASM `1b5f…`) |
| Signer | External **Ed25519** signer (verifier `CAAVTMCB…`), so the demo backend signs payments from a script |
| Rules | **One**: `Default` → policies `{ threshold (1 of 1), credential-policy }` |
| `credential-policy` parameters | `gate`, GrantFox's address, `"ContributorBadge"`, `claims: [{ tier: Gold }]` |
| Funds | Circle's testnet USDC (`CBIELTK6…`) |
| Precondition | **No live allowances (`approve`) when installing the policy.** A `transfer_from` against a prior allowance is signed by the spender and doesn't go through the treasury's `__check_auth`. A new account, or verify there are none |

---

## 8. The flows

### Marta (holder): no transaction of her own

1. **Wallet.** `kit.createWallet('ACTA', email)`: passkey plus a `C…` smart
   account. Fees are paid by `deployerSecret` (a testnet key of ours; testnet
   only, because it stays in the browser) or the kit's relayer proxy.
2. **Vault.** ACTA calls `vc-vault-factory.deploy_sponsored(ACTA, owner = her C…,
   did_uri, salt)` ([`factory contract.rs:216`](../contracts/vc-vault-factory/src/contract.rs#L216)).
   ACTA pays; Marta doesn't sign.
3. **DID.** ACTA calls `register_sponsored` on the registry with `controller` = her
   `C…`. The registry requires at least one authentication key: her
   passkey's is used as a Multikey.
   - OpenZeppelin's verifier stores P-256 keys **uncompressed, 65
     bytes**.
   - Multikey needs the **compressed 33-byte** form (`0x02`/`0x03` depending on the
     parity of y, plus x), with the `p256-pub` multicodec prefix (`0x80 0x24`) and
     encoded in base58btc (`z…`).

### GrantFox (issuer): two transactions

4. `vault.issue(vc_id, vc_data, vault, GrantFox, issuer_did)`. The vault charges the
   fee (XLM on testnet, USDC on mainnet) and stores `issuer = GrantFox`.
5. `vc-gate.register(GrantFox, vault, vc_id, "ContributorBadge", { tier: "Gold" })`.

### The payment and the revocation

6. The treasury pays Marta's `C…`. `credential-policy` asks
   `vc-gate.is_valid` and `has_claim(..., "tier", "Gold")`: the record points to her
   vault, `verify_vc` returns `Valid` and the vault isn't revoked → it passes.
7. GrantFox calls `vault.revoke_by_issuer(vc_id, date)` → `verify_vc` returns
   `Revoked` → the next payment bounces.

---

## 9. Pending spikes (before the event)

| # | Spike | Status |
|---|---|---|
| PA | Deploy on testnet the `vc-vault` 0.5.0 template and a `vc-vault-factory` built with it | **Resolved.** See `deployments/acta-gate-testnet.md` |
| PB | `deploy_sponsored` with a kit smart account as `owner`, and a USDC `transfer` to that `C…` | **Open** |
| P4 | Passkey wallet on testnet (`createWallet` + `signAndSubmit` with `deployerSecret`) | **Almost resolved.** The infrastructure is deployed |
| P8 | Install `credential-policy` on the `Default` rule of a kit wallet and pay through it, including via `execute` | **Open.** Validates the three traps |

No nested authorization spike is needed: `vc-gate` doesn't issue on behalf of the
issuer.

---

## 10. Costs

Measured with mainnet parameters (August 2026, XLM = $0.172), from ACTA's internal
cost assessment and from mainnet simulations.

| Item | Cost | Per |
|---|---|---|
| Issuance fee | 1 USDC (mainnet) · 5 XLM (testnet) | Credential |
| Credential rent in the vault | ~$0.082/year (`vc_data` of 201 B) · ~$0.137/year (1 KB). The `issuer` field adds a few bytes | Credential |
| `GateRecord` in `vc-gate` | To be measured. Estimate: a few hundred bytes, on the order of $0.02/year | Credential used in the gate |
| Vault rent | ~$0.057/year | Person |
| `did:stellar` | ~0.27 XLM/year (≈ $0.046) | Person |

---

## 11. What exists and how we differ

| Project | What it does | Difference |
|---|---|---|
| Safeguard (`Safeguard-Inc/safeguard-contracts`) | Payments protected by policies with allowlists, caps and per-jurisdiction rules | The lists are maintained by hand. ACTA Gate derives the "list" from credentials issued by the issuers, with live revocation |
| Soroban-Identity (many copies) | DIDs and credentials stored on-chain | No smart account integration |
| POK | Credentials as NFTs in custodial wallets (Polygon) | No contract can verify what they certify |

---

## Sources

- ACTA's contracts in this repo: [`contracts/vc-vault/src/contract.rs`](../contracts/vc-vault/src/contract.rs), [`types/verifiable_credential.rs`](../contracts/vc-vault/src/types/verifiable_credential.rs), [`vc-vault-factory/src/contract.rs`](../contracts/vc-vault-factory/src/contract.rs). The original, at [`ACTA-Team/contracts-acta@282fe47`](https://github.com/ACTA-Team/contracts-acta/tree/282fe47)
- OpenZeppelin `stellar-contracts`: [v0.7.2](https://github.com/OpenZeppelin/stellar-contracts/tree/v0.7.2), [`smart_account/storage.rs` (`do_check_auth`)](https://github.com/OpenZeppelin/stellar-contracts/blob/v0.7.2/packages/accounts/src/smart_account/storage.rs), [`policies/spending_limit.rs`](https://github.com/OpenZeppelin/stellar-contracts/blob/v0.7.2/packages/accounts/src/policies/spending_limit.rs), [multisig example](https://github.com/OpenZeppelin/stellar-contracts/tree/v0.7.2/examples/multisig-smart-account)
- [`stellar/smart-account-kit`](https://github.com/stellar/smart-account-kit) and its [testnet and mainnet deployments](https://github.com/stellar/smart-account-kit/blob/main/docs/deployments-protocol-27-2026-07-09.md)
- `soroban-sdk` 26.1 (`muxed_address.rs`, `token.rs`, `testutils.rs`), from crates.io
- [Safeguard contracts](https://github.com/Safeguard-Inc/safeguard-contracts) · [Soroban-Identity](https://github.com/Fayedamz/Soroban-Identity)
