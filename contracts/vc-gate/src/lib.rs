#![no_std]
//! `vc-gate`: lets a contract go from a holder's address to a credential in
//! their `vc-vault`, plus the public claims a gate needs (e.g. `tier: Gold`).
//! Spec: `docs/IDEA ES.md`, section "Contrato: vc-gate".
//!
//! The vault is the source of truth: it records the issuer and both
//! revocations. `vc-gate` only indexes, and re-checks the vault on every read.
//! No admin and no upgrade path: the vault factory is fixed in the constructor.

mod error;
mod storage;
mod types;

#[cfg(test)]
mod test;

pub use error::Error;
pub use types::{Config, GateRecord};

use soroban_sdk::{contract, contractimpl, panic_with_error, Address, Env, Map, String};

#[contract]
pub struct VcGate;

#[contractimpl]
impl VcGate {
    pub fn __constructor(e: Env, vault_factory: Address) {
        storage::set_config(&e, &Config { vault_factory });
    }

    pub fn config(e: Env) -> Config {
        storage::config(&e)
    }

    /// The issuer links a credential it issued into `vault`, with the claims
    /// the gate exposes.
    #[allow(unused_variables)]
    pub fn register(
        e: Env,
        issuer: Address,
        vault: Address,
        vc_id: String,
        credential_type: String,
        claims: Map<String, String>,
    ) {
        issuer.require_auth();
        // TODO: is_vault, caps, vault.get_vc(vc_id).issuer == issuer, verify_vc == Valid,
        // holder = vault_owner, store the GateRecord. `docs/IMPLEMENTATION ES.md` section 5.2.
        panic_with_error!(&e, Error::NotImplemented)
    }

    /// Re-checks the vault on every call: `verify_vc` (holder and issuer
    /// revocations) and `is_revoked`.
    #[allow(unused_variables)]
    pub fn is_valid(e: Env, holder: Address, issuer: Address, credential_type: String) -> bool {
        // TODO: record exists, vault.try_verify_vc == Valid, !vault.is_revoked().
        false
    }

    /// `is_valid` plus `claims[key] == value`.
    #[allow(unused_variables)]
    pub fn has_claim(
        e: Env,
        holder: Address,
        issuer: Address,
        credential_type: String,
        key: String,
        value: String,
    ) -> bool {
        // TODO: is_valid && record.claims.get(key) == Some(value).
        false
    }

    pub fn get_record(
        e: Env,
        holder: Address,
        issuer: Address,
        credential_type: String,
    ) -> Option<GateRecord> {
        storage::record(&e, &holder, &issuer, &credential_type)
    }
}
