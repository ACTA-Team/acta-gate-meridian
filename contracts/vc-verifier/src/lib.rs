#![no_std]
//! `vc-verifier`: turns an ACTA credential into something a contract can check,
//! with revocation applied live. Spec: `docs/IDEA ES.md`, section "Contrato: vc-verifier".
//!
//! No admin and no upgrade path: dependencies are fixed in the constructor.

mod error;
mod storage;
mod types;

#[cfg(test)]
mod test;

pub use error::Error;
pub use types::{Attestation, Config};

use soroban_sdk::{
    contract, contractimpl, panic_with_error, Address, Bytes, BytesN, Env, String, Vec,
};

#[contract]
pub struct VcVerifier;

#[contractimpl]
impl VcVerifier {
    /// `network` is `"testnet"` or `"mainnet"`.
    pub fn __constructor(e: Env, factory: Address, did_registry: Address, network: String) {
        storage::set_config(
            &e,
            &Config {
                factory,
                did_registry,
                network,
            },
        );
    }

    pub fn config(e: Env) -> Config {
        storage::config(&e)
    }

    /// Presents a credential on-chain once and records an attestation.
    #[allow(unused_variables)]
    pub fn attest(
        e: Env,
        holder: Address,
        anchor: Address,
        batch_id: String,
        index: u32,
        credential: Bytes,
        path: Vec<BytesN<32>>,
    ) -> Attestation {
        holder.require_auth();
        // TODO: steps 2-13 of the spec (Merkle proof, revocation, JSON profile, DID controller).
        panic_with_error!(&e, Error::NotImplemented)
    }

    /// Re-reads revocation and the DID controller on every call.
    #[allow(unused_variables)]
    pub fn is_valid(e: Env, holder: Address, anchor: Address, credential_type: String) -> bool {
        // TODO: anchor.get_status + did_registry.get, through the try_ clients.
        false
    }

    pub fn get_attestation(
        e: Env,
        holder: Address,
        anchor: Address,
        credential_type: String,
    ) -> Option<Attestation> {
        storage::attestation(&e, &holder, &anchor, &credential_type)
    }
}
