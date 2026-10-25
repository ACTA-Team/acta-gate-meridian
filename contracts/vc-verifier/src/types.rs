use soroban_sdk::{contracttype, Address, BytesN, Map, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub factory: Address,
    pub did_registry: Address,
    pub network: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Attestation {
    pub did_id: BytesN<16>,
    pub batch_id: String,
    pub index: u32,
    /// `credentialSubject` without `id`.
    pub claims: Map<String, String>,
    pub attested_at: u64,
}
