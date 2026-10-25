use soroban_sdk::{contracttype, Address, Map, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub vault_factory: Address,
}

/// Where the credential lives and what the gate exposes. Validity is never
/// cached here: `is_valid` asks the vault every time.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GateRecord {
    pub vault: Address,
    pub vc_id: String,
    /// What the issuer registers for the gate, e.g. `{ "tier": "Gold" }`.
    pub claims: Map<String, String>,
    pub registered_at: u64,
}
