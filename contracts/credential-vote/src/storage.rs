use soroban_sdk::{contracttype, Address, Env};

use crate::{Proposal, Requirement};

/// Same TTL policy as `vc-gate` and the vault: extend to ~180 days once fewer
/// than ~30 remain.
const TTL_THRESHOLD: u32 = 518_400;
const TTL_EXTEND_TO: u32 = 3_110_400;

#[contracttype]
enum DataKey {
    Requirement,
    NextId,
    Proposal(u32),
    /// `(proposal, voter)`: present once the voter has voted.
    Vote(u32, Address),
}

pub fn set_requirement(e: &Env, requirement: &Requirement) {
    e.storage()
        .instance()
        .set(&DataKey::Requirement, requirement);
    e.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

pub fn requirement(e: &Env) -> Requirement {
    e.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    e.storage().instance().get(&DataKey::Requirement).unwrap()
}

/// Hands out ids from 0, one per proposal.
pub fn next_id(e: &Env) -> u32 {
    let id: u32 = e.storage().instance().get(&DataKey::NextId).unwrap_or(0);
    e.storage().instance().set(&DataKey::NextId, &(id + 1));
    id
}

pub fn write_proposal(e: &Env, proposal: &Proposal) {
    let key = DataKey::Proposal(proposal.id);
    e.storage().persistent().set(&key, proposal);
    e.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

pub fn read_proposal(e: &Env, id: u32) -> Option<Proposal> {
    let key = DataKey::Proposal(id);
    let proposal = e.storage().persistent().get(&key);
    if proposal.is_some() {
        e.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }
    proposal
}

pub fn mark_voted(e: &Env, proposal: u32, voter: &Address) {
    let key = DataKey::Vote(proposal, voter.clone());
    e.storage().persistent().set(&key, &true);
    e.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

pub fn has_voted(e: &Env, proposal: u32, voter: &Address) -> bool {
    e.storage()
        .persistent()
        .has(&DataKey::Vote(proposal, voter.clone()))
}
