//! The vault's client and types, imported from its WASM so they always match
//! the real contract (`docs/IMPLEMENTATION.md` section 5.1). Build the vault
//! WASM first: `cargo build -p vc-vault-contract --target wasm32v1-none --release`.

use soroban_sdk::{contractclient, Address, Env};

soroban_sdk::contractimport!(file = "../target/wasm32v1-none/release/vc_vault_contract.wasm");

#[allow(dead_code)]
#[contractclient(name = "FactoryClient")]
pub trait VaultFactory {
    fn is_vault(e: Env, vault_address: Address) -> bool;
}
