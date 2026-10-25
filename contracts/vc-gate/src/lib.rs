#![no_std]
//! `vc-gate`: issuers issue through it into an ACTA `vc-vault`, so it can record
//! what the vault does not: who issued the credential, what it claims, and the
//! issuer's own revocation. Spec: `docs/IDEA ES.md`, section "Contrato: vc-gate".
//!
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

    /// Issues into `vault` on the issuer's behalf and records the issuer.
    #[allow(unused_variables, clippy::too_many_arguments)]
    pub fn issue(
        e: Env,
        issuer: Address,
        vault: Address,
        vc_id: String,
        vc_data: String,
        issuer_did: String,
        credential_type: String,
        claims: Map<String, String>,
    ) {
        issuer.require_auth();
        // TODO: is_vault, caps, vault.issue (the issuer's auth covers it and the fee),
        // vault_owner, store the GateRecord. `docs/IMPLEMENTATION ES.md` section 5.2.
        panic_with_error!(&e, Error::NotImplemented)
    }

    /// The issuer revokes what it issued.
    #[allow(unused_variables)]
    pub fn revoke(e: Env, issuer: Address, holder: Address, credential_type: String) {
        issuer.require_auth();
        // TODO: RecordNotFound / AlreadyRevoked, set revoked_by_issuer, emit Revoked.
        panic_with_error!(&e, Error::NotImplemented)
    }

    /// Re-checks the issuer's revocation and the vault's `verify_vc` on every call.
    #[allow(unused_variables)]
    pub fn is_valid(e: Env, holder: Address, issuer: Address, credential_type: String) -> bool {
        // TODO: record exists, !revoked_by_issuer, vault.try_verify_vc == Valid.
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
