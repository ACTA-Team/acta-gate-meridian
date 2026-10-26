#![no_std]
//! `credential-policy`: an OpenZeppelin smart-account `Policy` that only lets a
//! treasury pay addresses holding a valid credential.
//! Spec: `docs/IDEA.md`, section "Contract: credential-policy", and the three
//! traps in `docs/IMPLEMENTATION.md` section 6.

#[cfg(test)]
mod test;

use soroban_sdk::{
    auth::Context, contract, contractclient, contracterror, contractevent, contractimpl,
    contracttype, panic_with_error, symbol_short, Address, Env, Map, MuxedAddress, String, Symbol,
    TryFromVal, Val, Vec,
};
use stellar_accounts::{
    policies::Policy,
    smart_account::{ContextRule, Signer},
};

/// Same TTL policy as `vc-gate` and the vault (`constants.rs`): extend to
/// ~180 days once fewer than ~30 remain. Both the `Requirement` entry and the
/// contract instance are extended on `install` and on every read, the way
/// OpenZeppelin's `simple_threshold` policy keeps its threshold alive: a
/// treasury that pays never finds its policy archived.
pub const TTL_THRESHOLD: u32 = 518_400;
pub const TTL_EXTEND_TO: u32 = 3_110_400;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NoSigners = 1,
    RecipientNotCredentialed = 2,
    AllowanceNotPermitted = 3,
    NotInstalled = 4,
    /// A `transfer` or `execute` whose arguments cannot be read. Fails closed.
    MalformedCall = 5,
    /// The `Requirement` lists the same claim key twice, so the two values
    /// contradict each other. Rejected at `install`, and again at `enforce`
    /// in case the entry was written some other way. Fails closed.
    MalformedRequirement = 6,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Claim {
    pub key: String,
    pub value: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Requirement {
    /// The `vc-gate` contract.
    pub gate: Address,
    /// The issuer whose credentials count, as recorded by `vc-gate`.
    pub issuer: Address,
    pub credential_type: String,
    /// Every claim must match, e.g. `[Claim { key: "tier", value: "Gold" }]`.
    /// Empty means any valid credential of `credential_type`.
    pub claims: Vec<Claim>,
}

#[contracttype]
enum DataKey {
    /// Stored per `(smart_account, context_rule_id)`, as OpenZeppelin requires
    /// for policies shared between accounts.
    Requirement(Address, u32),
}

/// A payment passed the check: `recipient` holds the credential the
/// treasury's rule requires. Admin calls that go through do not emit it.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Enforced {
    #[topic]
    pub smart_account: Address,
    pub context_rule_id: u32,
    pub recipient: Address,
}

#[allow(dead_code)]
#[contractclient(name = "GateClient")]
trait Gate {
    /// `vc-gate`'s `check`: a valid credential plus every claim matching, in a
    /// single call (`docs/IMPLEMENTATION.md` section 5.4).
    fn check(
        e: Env,
        holder: Address,
        issuer: Address,
        credential_type: String,
        claims: Map<String, String>,
    ) -> bool;
}

#[contract]
pub struct CredentialPolicy;

#[contractimpl]
impl CredentialPolicy {
    /// Reading keeps the entry and the instance alive, like `enforce` does.
    pub fn get_requirement(
        e: Env,
        smart_account: Address,
        context_rule_id: u32,
    ) -> Option<Requirement> {
        read_requirement(&e, &smart_account, context_rule_id)
    }
}

#[contractimpl]
impl Policy for CredentialPolicy {
    type AccountParams = Requirement;

    fn enforce(
        e: &Env,
        context: Context,
        authenticated_signers: Vec<Signer>,
        context_rule: ContextRule,
        smart_account: Address,
    ) {
        smart_account.require_auth();
        // Trap 1: a rule with policies does not check its own signers.
        if authenticated_signers.is_empty() {
            panic_with_error!(e, Error::NoSigners);
        }

        let (fn_name, args) = match context {
            // Trap 3: `execute(target, target_fn, target_args)` hides the inner call.
            Context::Contract(c)
                if c.contract == smart_account && c.fn_name == symbol_short!("execute") =>
            {
                let inner_fn = c.args.get(1).and_then(|v| Symbol::try_from_val(e, &v).ok());
                let inner_args = c
                    .args
                    .get(2)
                    .and_then(|v| Vec::<Val>::try_from_val(e, &v).ok());
                match (inner_fn, inner_args) {
                    (Some(f), Some(a)) => (f, a),
                    _ => panic_with_error!(e, Error::MalformedCall),
                }
            }
            Context::Contract(c) => (c.fn_name, c.args),
            // Deploying a contract is not a payment.
            _ => return,
        };

        if fn_name == symbol_short!("transfer") {
            // Since protocol 23 the SAC takes `to: MuxedAddress`; `.address()` is the base account.
            let to = match args.get(1).map(|v| MuxedAddress::try_from_val(e, &v)) {
                Some(Ok(to)) => to.address(),
                _ => panic_with_error!(e, Error::MalformedCall),
            };
            if !recipient_is_credentialed(e, &smart_account, context_rule.id, &to) {
                panic_with_error!(e, Error::RecipientNotCredentialed);
            }
            Enforced {
                smart_account,
                context_rule_id: context_rule.id,
                recipient: to,
            }
            .publish(e);
        } else if fn_name == symbol_short!("approve") {
            // An allowance plus `transfer_from` would skip the check.
            panic_with_error!(e, Error::AllowanceNotPermitted);
        }
        // Anything else is allowed: the account's own admin calls keep working.
        // That includes `transfer_from` and `burn_from`, which are not a way
        // around the gate. In both, the treasury is the *spender*, not the
        // source: `transfer_from(spender = treasury, from = X, to, amount)`
        // moves X's tokens out of an allowance X granted, and `burn_from`
        // burns them. The treasury's own funds leave only through `transfer`
        // (checked here) or an allowance it granted (`approve`, rejected
        // above). `burn` is the one call that spends the treasury's balance
        // without a recipient: it destroys funds, which is a governance
        // decision, not a payment.
    }

    /// Stores the `Requirement` and keeps it alive (~180 days) together with
    /// the contract instance. A requirement that lists the same claim key
    /// twice is rejected here, so a treasury never installs a rule that can
    /// only fail closed.
    fn install(
        e: &Env,
        install_params: Requirement,
        context_rule: ContextRule,
        smart_account: Address,
    ) {
        smart_account.require_auth();
        if claims_map(e, &install_params).is_none() {
            panic_with_error!(e, Error::MalformedRequirement);
        }
        let key = requirement_key(&smart_account, context_rule.id);
        e.storage().persistent().set(&key, &install_params);
        extend_ttl(e, &key);
    }

    fn uninstall(e: &Env, context_rule: ContextRule, smart_account: Address) {
        smart_account.require_auth();
        let key = requirement_key(&smart_account, context_rule.id);
        if !e.storage().persistent().has(&key) {
            panic_with_error!(e, Error::NotInstalled);
        }
        e.storage().persistent().remove(&key);
    }
}

fn requirement_key(account: &Address, rule_id: u32) -> DataKey {
    DataKey::Requirement(account.clone(), rule_id)
}

/// Extends the `Requirement` entry and the contract instance.
fn extend_ttl(e: &Env, key: &DataKey) {
    e.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
    e.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

/// Reading a requirement keeps it alive: a policy that is used never archives.
fn read_requirement(e: &Env, account: &Address, rule_id: u32) -> Option<Requirement> {
    let key = requirement_key(account, rule_id);
    let requirement = e.storage().persistent().get(&key);
    if requirement.is_some() {
        extend_ttl(e, &key);
    }
    requirement
}

/// The claims as the map `vc-gate.check` takes, or `None` when the `Vec`
/// carries the same key twice with different values: a `Map` would silently
/// keep one of them and drop the other requirement.
fn claims_map(e: &Env, req: &Requirement) -> Option<Map<String, String>> {
    let mut claims = Map::new(e);
    for c in req.claims.iter() {
        claims.set(c.key, c.value);
    }
    (claims.len() == req.claims.len()).then_some(claims)
}

fn recipient_is_credentialed(e: &Env, account: &Address, rule_id: u32, to: &Address) -> bool {
    let req = match read_requirement(e, account, rule_id) {
        Some(r) => r,
        None => panic_with_error!(e, Error::NotInstalled),
    };
    // One cross-contract call whatever the number of claims. `install` already
    // rejects a duplicate key; this fails closed if the entry got there some
    // other way (an older version of this contract, for instance).
    let claims = match claims_map(e, &req) {
        Some(c) => c,
        None => panic_with_error!(e, Error::MalformedRequirement),
    };
    GateClient::new(e, &req.gate).check(to, &req.issuer, &req.credential_type, &claims)
}
