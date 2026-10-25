use soroban_sdk::{contracttype, Address, Env, String};

use crate::types::{Config, GateRecord};

#[contracttype]
#[allow(clippy::large_enum_variant)] // storage keys are host handles, never moved around in bulk
enum DataKey {
    Config,
    /// `(holder, issuer, credential_type)`. A new issuance of the same type replaces it.
    Record(Address, Address, String),
}

pub fn set_config(e: &Env, config: &Config) {
    e.storage().instance().set(&DataKey::Config, config);
}

pub fn config(e: &Env) -> Config {
    e.storage().instance().get(&DataKey::Config).unwrap()
}

pub fn record(
    e: &Env,
    holder: &Address,
    issuer: &Address,
    credential_type: &String,
) -> Option<GateRecord> {
    let key = DataKey::Record(holder.clone(), issuer.clone(), credential_type.clone());
    e.storage().persistent().get(&key)
}
