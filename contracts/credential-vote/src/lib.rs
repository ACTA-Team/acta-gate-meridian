#![no_std]
//! `credential-vote`: a vote that only credentialed addresses can take part
//! in. The second consumer of `vc-gate`, next to `credential-policy`: a plain
//! contract, not a smart account, that asks the gate before letting someone
//! act. Spec: `docs/IDEA.md`, section "Contract: credential-vote".
//!
//! The credential is checked when proposing and when voting, live against
//! `vc-gate` (which re-reads the vault). A revocation stops new votes; votes
//! already cast stay. No admin and no upgrade path: the requirement is fixed
//! in the constructor, like `vc-gate` fixes its factory.

mod storage;

#[cfg(test)]
mod test;

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype,
    panic_with_error, Address, Env, Map, String, Vec,
};

/// Keeps a proposal small and its reads cheap.
pub const MAX_TITLE_LEN: u32 = 128;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// `vc-gate` does not vouch for this address right now.
    NotCredentialed = 1,
    ProposalNotFound = 2,
    AlreadyVoted = 3,
    /// The title is above `MAX_TITLE_LEN`.
    InputTooLong = 4,
    /// The `Requirement` lists the same claim key twice, so the two values
    /// contradict each other. Rejected at deploy time.
    MalformedRequirement = 5,
}

/// Same shape as `credential-policy`'s claim: both consumers ask the gate the
/// same question.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Claim {
    pub key: String,
    pub value: String,
}

/// Who counts as a voter.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Requirement {
    /// The `vc-gate` contract.
    pub gate: Address,
    /// The issuer whose credentials count, as recorded by `vc-gate`.
    pub issuer: Address,
    pub credential_type: String,
    /// Every claim must match, e.g. `[Claim { key: "tier", value: "Gold" }]`.
    /// Empty means any valid credential of `credential_type`.
    pub claims: Vec<Claim>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub id: u32,
    pub proposer: Address,
    pub title: String,
    pub in_favor: u32,
    pub against: u32,
    pub created_at: u64,
}

#[contractevent]
pub struct Proposed {
    pub id: u32,
    pub proposer: Address,
    pub title: String,
}

#[contractevent]
pub struct Voted {
    pub id: u32,
    pub voter: Address,
    pub in_favor: bool,
}

#[allow(dead_code)]
#[contractclient(name = "GateClient")]
trait Gate {
    /// `vc-gate`'s `check`: a valid credential plus every claim matching, in a
    /// single call (`docs/IMPLEMENTATION.md` section 5.4).
    fn check(
        e: Env,
        holder: Address,
        issuer: Address,
        credential_type: String,
        claims: Map<String, String>,
    ) -> bool;
}

#[contract]
pub struct CredentialVote;

#[contractimpl]
impl CredentialVote {
    /// Fails with `MalformedRequirement` if two claims share a key: a `Map`
    /// would silently keep one of them.
    pub fn __constructor(e: Env, requirement: Requirement) {
        if claims_map(&e, &requirement).len() != requirement.claims.len() {
            panic_with_error!(&e, Error::MalformedRequirement);
        }
        storage::set_requirement(&e, &requirement);
    }

    pub fn requirement(e: Env) -> Requirement {
        storage::requirement(&e)
    }

    /// A credentialed address opens a proposal. Returns its id.
    pub fn propose(e: Env, proposer: Address, title: String) -> u32 {
        proposer.require_auth();
        if title.len() > MAX_TITLE_LEN {
            panic_with_error!(&e, Error::InputTooLong);
        }
        require_credentialed(&e, &proposer);

        let id = storage::next_id(&e);
        let proposal = Proposal {
            id,
            proposer: proposer.clone(),
            title: title.clone(),
            in_favor: 0,
            against: 0,
            created_at: e.ledger().timestamp(),
        };
        storage::write_proposal(&e, &proposal);
        Proposed {
            id,
            proposer,
            title,
        }
        .publish(&e);
        id
    }

    /// One vote per address and proposal. The credential is checked now, not
    /// when it was issued: a revoked holder cannot vote any more.
    pub fn vote(e: Env, voter: Address, proposal: u32, in_favor: bool) {
        voter.require_auth();
        let mut p = match storage::read_proposal(&e, proposal) {
            Some(p) => p,
            None => panic_with_error!(&e, Error::ProposalNotFound),
        };
        if storage::has_voted(&e, proposal, &voter) {
            panic_with_error!(&e, Error::AlreadyVoted);
        }
        require_credentialed(&e, &voter);

        if in_favor {
            p.in_favor += 1;
        } else {
            p.against += 1;
        }
        storage::write_proposal(&e, &p);
        storage::mark_voted(&e, proposal, &voter);
        Voted {
            id: proposal,
            voter,
            in_favor,
        }
        .publish(&e);
    }

    pub fn proposal(e: Env, id: u32) -> Option<Proposal> {
        storage::read_proposal(&e, id)
    }

    pub fn has_voted(e: Env, proposal: u32, voter: Address) -> bool {
        storage::has_voted(&e, proposal, &voter)
    }

    /// What the gate says about `who` right now, under this vote's requirement.
    pub fn can_vote(e: Env, who: Address) -> bool {
        is_credentialed(&e, &who)
    }
}

fn require_credentialed(e: &Env, who: &Address) {
    if !is_credentialed(e, who) {
        panic_with_error!(e, Error::NotCredentialed);
    }
}

/// One cross-contract call whatever the number of claims.
fn is_credentialed(e: &Env, who: &Address) -> bool {
    let req = storage::requirement(e);
    GateClient::new(e, &req.gate).check(
        who,
        &req.issuer,
        &req.credential_type,
        &claims_map(e, &req),
    )
}

fn claims_map(e: &Env, req: &Requirement) -> Map<String, String> {
    let mut claims = Map::new(e);
    for c in req.claims.iter() {
        claims.set(c.key, c.value);
    }
    claims
}
