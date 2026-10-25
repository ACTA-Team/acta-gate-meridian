#![no_std]
//! `credential-policy`: an OpenZeppelin smart-account `Policy` that only lets a
//! treasury pay addresses holding a valid credential.
//! Spec: `docs/IDEA ES.md`, section "Contrato: credential-policy", and the three
//! traps in `docs/IMPLEMENTATION ES.md` section 6.

#[cfg(test)]
mod test;

use soroban_sdk::{
    auth::Context, contract, contracterror, contractimpl, contracttype, panic_with_error, Address,
    Env, String, Vec,
};
use stellar_accounts::{
    policies::Policy,
    smart_account::{ContextRule, Signer},
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NoSigners = 1,
    RecipientNotCredentialed = 2,
    AllowanceNotPermitted = 3,
    NotInstalled = 4,
    /// Scaffold only: removed once `enforce` is implemented.
    NotImplemented = 99,
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

#[contract]
pub struct CredentialPolicy;

#[contractimpl]
impl CredentialPolicy {
    pub fn get_requirement(
        e: Env,
        smart_account: Address,
        context_rule_id: u32,
    ) -> Option<Requirement> {
        e.storage()
            .persistent()
            .get(&DataKey::Requirement(smart_account, context_rule_id))
    }
}

#[contractimpl]
impl Policy for CredentialPolicy {
    type AccountParams = Requirement;

    #[allow(unused_variables)]
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
        // TODO: unwrap `execute` (trap 3), check the `transfer` recipient, reject `approve`.
        // Fails closed until implemented.
        panic_with_error!(e, Error::NotImplemented)
    }

    fn install(
        e: &Env,
        install_params: Requirement,
        context_rule: ContextRule,
        smart_account: Address,
    ) {
        smart_account.require_auth();
        let key = DataKey::Requirement(smart_account, context_rule.id);
        e.storage().persistent().set(&key, &install_params);
    }

    fn uninstall(e: &Env, context_rule: ContextRule, smart_account: Address) {
        smart_account.require_auth();
        let key = DataKey::Requirement(smart_account, context_rule.id);
        if !e.storage().persistent().has(&key) {
            panic_with_error!(e, Error::NotInstalled);
        }
        e.storage().persistent().remove(&key);
    }
}
