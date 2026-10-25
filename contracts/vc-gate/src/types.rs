use soroban_sdk::{contracttype, Address, BytesN, Map, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub vault_factory: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GateRecord {
    pub vault: Address,
    pub vc_id: String,
    /// `sha256(XDR(vc_data))` at issuance.
    pub data_hash: BytesN<32>,
    /// What the issuer registers for the gate, e.g. `{ "tier": "Gold" }`.
    pub claims: Map<String, String>,
    pub issued_at: u64,
    pub revoked_by_issuer: bool,
}
