use soroban_sdk::{contracttype, Address, Env, String};

use crate::types::{Config, GateRecord};

/// Same TTL policy as `vc-vault` (`constants.rs`): extend to ~180 days once
/// fewer than ~30 remain.
pub const TTL_THRESHOLD: u32 = 518_400;
pub const TTL_EXTEND_TO: u32 = 3_110_400;

#[contracttype]
#[allow(clippy::large_enum_variant)] // storage keys are host handles, never moved around in bulk
pub(crate) enum DataKey {
    Config,
    /// `(holder, issuer, credential_type)`. A new registration of the same type replaces it.
    Record(Address, Address, String),
}

/// Every entrypoint calls this: the instance (and with it the config) stays
/// alive as long as someone registers in or asks the gate.
pub fn extend_instance(e: &Env) {
    e.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

pub fn set_config(e: &Env, config: &Config) {
    e.storage().instance().set(&DataKey::Config, config);
    extend_instance(e);
}

pub fn config(e: &Env) -> Config {
    extend_instance(e);
    e.storage().instance().get(&DataKey::Config).unwrap()
}

pub fn write_record(
    e: &Env,
    holder: &Address,
    issuer: &Address,
    credential_type: &String,
    record: &GateRecord,
) {
    let key = DataKey::Record(holder.clone(), issuer.clone(), credential_type.clone());
    e.storage().persistent().set(&key, record);
    e.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

/// Reading a record keeps it alive: a gate that is used never archives.
pub fn read_record(
    e: &Env,
    holder: &Address,
    issuer: &Address,
    credential_type: &String,
) -> Option<GateRecord> {
    let key = DataKey::Record(holder.clone(), issuer.clone(), credential_type.clone());
    let record = e.storage().persistent().get(&key);
    if record.is_some() {
        e.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }
    record
}
