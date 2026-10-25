use soroban_sdk::{contracttype, Address, Env, String};

use crate::types::{Attestation, Config};

#[contracttype]
#[allow(clippy::large_enum_variant)] // storage keys are host handles, never moved around in bulk
enum DataKey {
    Config,
    Attestation(Address, Address, String),
}

pub fn set_config(e: &Env, config: &Config) {
    e.storage().instance().set(&DataKey::Config, config);
}

pub fn config(e: &Env) -> Config {
    e.storage().instance().get(&DataKey::Config).unwrap()
}

pub fn attestation(
    e: &Env,
    holder: &Address,
    anchor: &Address,
    credential_type: &String,
) -> Option<Attestation> {
    let key = DataKey::Attestation(holder.clone(), anchor.clone(), credential_type.clone());
    e.storage().persistent().get(&key)
}
