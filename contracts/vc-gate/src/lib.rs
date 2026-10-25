#![no_std]
//! `vc-gate`: lets a contract go from a holder's address to a credential in
//! their `vc-vault`, plus the public claims a gate needs (e.g. `tier: Gold`).
//! Spec: `docs/IDEA ES.md`, section "Contrato: vc-gate", and
//! `docs/IMPLEMENTATION ES.md` section 5.
//!
//! The vault is the source of truth: it records the issuer and both
//! revocations. `vc-gate` only indexes, and re-checks the vault on every read.
//! No admin and no upgrade path: the vault factory is fixed in the constructor.

mod error;
mod events;
mod storage;
mod types;
mod vault;

#[cfg(test)]
mod test;

pub use error::Error;
pub use types::{Config, GateRecord};

use soroban_sdk::{contract, contractimpl, panic_with_error, Address, Env, Map, String};

/// Caps that keep a record small and its reads cheap.
pub const MAX_TYPE_LEN: u32 = 64;
pub const MAX_CLAIMS: u32 = 8;
pub const MAX_CLAIM_LEN: u32 = 64;

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
    /// the gate exposes. A new registration of the same type replaces the old one.
    pub fn register(
        e: Env,
        issuer: Address,
        vault: Address,
        vc_id: String,
        credential_type: String,
        claims: Map<String, String>,
    ) {
        issuer.require_auth();

        let factory = vault::FactoryClient::new(&e, &storage::config(&e).vault_factory);
        if !factory.is_vault(&vault) {
            panic_with_error!(&e, Error::NotAVault);
        }
        check_caps(&e, &credential_type, &claims);

        let v = vault::Client::new(&e, &vault);
        // The vault records the address that authorized the issuance: on-chain
        // proof of who issued it.
        match v.get_vc(&vc_id) {
            Some(vc) if vc.issuer == issuer => {}
            _ => panic_with_error!(&e, Error::NotTheIssuer),
        }
        if v.verify_vc(&vc_id) != vault::VCStatus::Valid || v.is_revoked() {
            panic_with_error!(&e, Error::CredentialNotValid);
        }

        let holder = v.vault_owner();
        let record = GateRecord {
            vault: vault.clone(),
            vc_id: vc_id.clone(),
            claims,
            registered_at: e.ledger().timestamp(),
        };
        storage::write_record(&e, &holder, &issuer, &credential_type, &record);
        events::registered(&e, &holder, &issuer, &credential_type, &vault, &vc_id);
    }

    /// Re-checks the vault on every call: `verify_vc` (holder and issuer
    /// revocations) and `is_revoked`. A failing vault call reads as `false`.
    pub fn is_valid(e: Env, holder: Address, issuer: Address, credential_type: String) -> bool {
        match storage::read_record(&e, &holder, &issuer, &credential_type) {
            Some(record) => vault_says_valid(&e, &record),
            None => false,
        }
    }

    /// `is_valid` plus `claims[key] == value`.
    pub fn has_claim(
        e: Env,
        holder: Address,
        issuer: Address,
        credential_type: String,
        key: String,
        value: String,
    ) -> bool {
        match storage::read_record(&e, &holder, &issuer, &credential_type) {
            Some(record) => record.claims.get(key) == Some(value) && vault_says_valid(&e, &record),
            None => false,
        }
    }

    /// `is_valid` plus every entry in `claims` matching the record. A caller
    /// that needs several claims pays one cross-contract call instead of one
    /// per claim; an empty map is just `is_valid`.
    pub fn check(
        e: Env,
        holder: Address,
        issuer: Address,
        credential_type: String,
        claims: Map<String, String>,
    ) -> bool {
        match storage::read_record(&e, &holder, &issuer, &credential_type) {
            // Compare the claims first: a mismatch costs no vault call.
            Some(record) => {
                claims.iter().all(|(k, v)| record.claims.get(k) == Some(v))
                    && vault_says_valid(&e, &record)
            }
            None => false,
        }
    }

    pub fn get_record(
        e: Env,
        holder: Address,
        issuer: Address,
        credential_type: String,
    ) -> Option<GateRecord> {
        storage::read_record(&e, &holder, &issuer, &credential_type)
    }
}

fn vault_says_valid(e: &Env, record: &GateRecord) -> bool {
    let v = vault::Client::new(e, &record.vault);
    let valid = matches!(
        v.try_verify_vc(&record.vc_id),
        Ok(Ok(vault::VCStatus::Valid))
    );
    let vault_ok = matches!(v.try_is_revoked(), Ok(Ok(false)));
    valid && vault_ok
}

fn check_caps(e: &Env, credential_type: &String, claims: &Map<String, String>) {
    let too_long = credential_type.len() > MAX_TYPE_LEN
        || claims.len() > MAX_CLAIMS
        || claims
            .iter()
            .any(|(k, v)| k.len() > MAX_CLAIM_LEN || v.len() > MAX_CLAIM_LEN);
    if too_long {
        panic_with_error!(e, Error::InputTooLong);
    }
}
