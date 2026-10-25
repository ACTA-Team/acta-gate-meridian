//! Public contract interface. All exported functions are defined here.

use soroban_sdk::{Address, Env, String, Vec};

use crate::types::{VCStatus, VerifiableCredential};

#[allow(dead_code)]
pub trait VcVaultTrait {
    // --- Admin ---
    fn nominate_admin(e: Env, new_admin: Address);
    fn accept_contract_admin(e: Env);
    fn version(e: Env) -> String;

    // --- Vault management ---
    fn set_vault_admin(e: Env, new_admin: Address);
    fn set_vault_did(e: Env, did_uri: String);
    fn vault_did(e: Env) -> Option<String>;
    fn vault_owner(e: Env) -> Address;
    /// Whether the vault admin called `revoke_vault`. `verify_vc` does not
    /// look at this flag; callers that need it must check it themselves.
    fn is_revoked(e: Env) -> bool;
    fn deny_issuer(e: Env, issuer_addr: Address);
    fn allow_issuer(e: Env, issuer_addr: Address);
    fn revoke_vault(e: Env);

    // --- Credential queries ---
    fn list_vc_ids(e: Env, offset: u32, limit: u32) -> Vec<String>;
    fn vc_count(e: Env) -> u32;
    fn get_vc(e: Env, vc_id: String) -> Option<VerifiableCredential>;
    /// Returns the on-chain STATUS of a VC (Valid / Revoked / Invalid). This is
    /// a revocation/status signal ONLY. Issuance is open - anyone can deposit a
    /// VC into a vault - so "Valid in the vault" alone proves nothing about who
    /// issued it. Check `get_vc(id).issuer`: it is the address that authorized
    /// the issuance. `issuer_did` is only declared by the caller.
    fn verify_vc(e: Env, vc_id: String) -> VCStatus;

    // --- Issuance ---
    fn issue(
        e: Env,
        vc_id: String,
        vc_data: String,
        vault_contract: Address,
        issuer_addr: Address,
        issuer_did: String,
    ) -> String;
    fn batch_issue(
        e: Env,
        issuer_addr: Address,
        vault_contract: Address,
        issuer_did: String,
        vcs: Vec<(String, String)>,
    ) -> Vec<String>;
    /// The holder (vault owner) revokes a credential.
    fn revoke(e: Env, vc_id: String, date: String);
    /// The issuer revokes a credential it issued. Requires the auth of
    /// `get_vc(id).issuer`.
    fn revoke_by_issuer(e: Env, vc_id: String, date: String);
    fn push(e: Env, vc_id: String, dest_vault: Address);
    fn receive_push(
        e: Env,
        source_vault: Address,
        source_owner: Address,
        vc_id: String,
        vc_data: String,
        issuer_did: String,
        issuer: Address,
    );

    // --- Issuer queries ---
    fn list_denied_issuers(e: Env, offset: u32, limit: u32) -> Vec<Address>;
    fn denied_issuer_count(e: Env) -> u32;
}
