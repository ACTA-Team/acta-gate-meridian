extern crate std;

use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger},
    Address, Env, Map, String, Vec,
};

use crate::{Claim, CredentialVote, CredentialVoteClient, Error, Requirement};

/// Stands in for `vc-gate`: a holder is valid with the tier stored for them.
#[contract]
struct FakeGate;

#[contractimpl]
impl FakeGate {
    pub fn set_tier(e: Env, holder: Address, tier: String) {
        e.storage().persistent().set(&holder, &tier);
    }

    pub fn revoke(e: Env, holder: Address) {
        e.storage().persistent().remove(&holder);
    }

    pub fn check(
        e: Env,
        holder: Address,
        _issuer: Address,
        _credential_type: String,
        claims: Map<String, String>,
    ) -> bool {
        let Some(tier) = e.storage().persistent().get::<_, String>(&holder) else {
            return false;
        };
        claims
            .iter()
            .all(|(k, v)| k == String::from_str(&e, "tier") && v == tier)
    }
}

struct Setup<'a> {
    e: Env,
    vote: CredentialVoteClient<'a>,
    gate: FakeGateClient<'a>,
    marta: Address,
    stranger: Address,
}

fn s(e: &Env, v: &str) -> String {
    String::from_str(e, v)
}

fn setup<'a>(claims: &[(&str, &str)]) -> Setup<'a> {
    let e = Env::default();
    e.mock_all_auths();
    e.ledger().set_timestamp(1_761_000_000);

    let gate = FakeGateClient::new(&e, &e.register(FakeGate, ()));
    let mut required = Vec::new(&e);
    for (k, v) in claims {
        required.push_back(Claim {
            key: s(&e, k),
            value: s(&e, v),
        });
    }
    let requirement = Requirement {
        gate: gate.address.clone(),
        issuer: Address::generate(&e),
        credential_type: s(&e, "ContributorBadge"),
        claims: required,
    };
    let vote = CredentialVoteClient::new(&e, &e.register(CredentialVote, (requirement,)));

    let marta = Address::generate(&e);
    gate.set_tier(&marta, &s(&e, "Gold"));

    Setup {
        stranger: Address::generate(&e),
        marta,
        gate,
        vote,
        e,
    }
}

impl Setup<'_> {
    fn propose(&self, who: &Address) -> Result<u32, soroban_sdk::Error> {
        match self
            .vote
            .try_propose(who, &s(&self.e, "Fund the docs sprint"))
        {
            Ok(Ok(id)) => Ok(id),
            Err(Ok(err)) => Err(err),
            other => panic!("unexpected result: {other:?}"),
        }
    }

    fn cast(&self, who: &Address, proposal: u32, in_favor: bool) -> Result<(), soroban_sdk::Error> {
        match self.vote.try_vote(who, &proposal, &in_favor) {
            Ok(Ok(())) => Ok(()),
            Err(Ok(err)) => Err(err),
            other => panic!("unexpected result: {other:?}"),
        }
    }
}

fn err<T>(e: Error) -> Result<T, soroban_sdk::Error> {
    Err(e.into())
}

#[test]
fn constructor_stores_the_requirement() {
    let t = setup(&[("tier", "Gold")]);
    let r = t.vote.requirement();
    assert_eq!(r.gate, t.gate.address);
    assert_eq!(r.claims.len(), 1);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn a_requirement_with_a_duplicate_claim_key_cannot_be_deployed() {
    setup(&[("tier", "Gold"), ("tier", "Silver")]);
}

#[test]
fn a_credentialed_holder_proposes_and_votes() {
    let t = setup(&[("tier", "Gold")]);
    let id = t.propose(&t.marta).unwrap();
    assert_eq!(id, 0);

    let p = t.vote.proposal(&id).unwrap();
    assert_eq!(p.proposer, t.marta);
    assert_eq!(p.title, s(&t.e, "Fund the docs sprint"));
    assert_eq!((p.in_favor, p.against), (0, 0));
    assert_eq!(p.created_at, 1_761_000_000);

    assert_eq!(t.cast(&t.marta, id, true), Ok(()));
    let p = t.vote.proposal(&id).unwrap();
    assert_eq!((p.in_favor, p.against), (1, 0));
    assert!(t.vote.has_voted(&id, &t.marta));
}

#[test]
fn ids_count_up() {
    let t = setup(&[("tier", "Gold")]);
    assert_eq!(t.propose(&t.marta), Ok(0));
    assert_eq!(t.propose(&t.marta), Ok(1));
    assert_eq!(t.propose(&t.marta), Ok(2));
}

#[test]
fn tallies_both_sides() {
    let t = setup(&[("tier", "Gold")]);
    let id = t.propose(&t.marta).unwrap();
    let other = Address::generate(&t.e);
    t.gate.set_tier(&other, &s(&t.e, "Gold"));
    assert_eq!(t.cast(&t.marta, id, true), Ok(()));
    assert_eq!(t.cast(&other, id, false), Ok(()));
    let p = t.vote.proposal(&id).unwrap();
    assert_eq!((p.in_favor, p.against), (1, 1));
}

#[test]
fn a_stranger_can_neither_propose_nor_vote() {
    let t = setup(&[("tier", "Gold")]);
    assert_eq!(t.propose(&t.stranger), err(Error::NotCredentialed));
    let id = t.propose(&t.marta).unwrap();
    assert_eq!(t.cast(&t.stranger, id, true), err(Error::NotCredentialed));
    assert!(!t.vote.can_vote(&t.stranger));
    assert!(t.vote.can_vote(&t.marta));
}

#[test]
fn the_wrong_tier_does_not_count() {
    let t = setup(&[("tier", "Gold")]);
    let id = t.propose(&t.marta).unwrap();
    let silver = Address::generate(&t.e);
    t.gate.set_tier(&silver, &s(&t.e, "Silver"));
    assert_eq!(t.cast(&silver, id, true), err(Error::NotCredentialed));
}

#[test]
fn without_claims_any_valid_credential_counts() {
    let t = setup(&[]);
    let silver = Address::generate(&t.e);
    t.gate.set_tier(&silver, &s(&t.e, "Silver"));
    let id = t.propose(&silver).unwrap();
    assert_eq!(t.cast(&silver, id, true), Ok(()));
    assert_eq!(t.cast(&t.stranger, id, true), err(Error::NotCredentialed));
}

#[test]
fn one_vote_per_address() {
    let t = setup(&[("tier", "Gold")]);
    let id = t.propose(&t.marta).unwrap();
    assert_eq!(t.cast(&t.marta, id, true), Ok(()));
    assert_eq!(t.cast(&t.marta, id, false), err(Error::AlreadyVoted));
    let p = t.vote.proposal(&id).unwrap();
    assert_eq!((p.in_favor, p.against), (1, 0));
}

#[test]
fn a_revocation_stops_new_votes_and_keeps_old_ones() {
    let t = setup(&[("tier", "Gold")]);
    let first = t.propose(&t.marta).unwrap();
    let second = t.propose(&t.marta).unwrap();
    assert_eq!(t.cast(&t.marta, first, true), Ok(()));

    t.gate.revoke(&t.marta);

    assert_eq!(t.cast(&t.marta, second, true), err(Error::NotCredentialed));
    assert_eq!(t.propose(&t.marta), err(Error::NotCredentialed));
    assert_eq!(t.vote.proposal(&first).unwrap().in_favor, 1);
}

#[test]
fn unknown_proposal() {
    let t = setup(&[("tier", "Gold")]);
    assert_eq!(t.cast(&t.marta, 7, true), err(Error::ProposalNotFound));
    assert_eq!(t.vote.proposal(&7), None);
}

#[test]
fn title_cap() {
    let t = setup(&[("tier", "Gold")]);
    let long = s(&t.e, &"x".repeat(129));
    assert_eq!(
        t.vote.try_propose(&t.marta, &long),
        Err(Ok(Error::InputTooLong.into()))
    );
    let max = s(&t.e, &"x".repeat(128));
    assert_eq!(t.vote.try_propose(&t.marta, &max), Ok(Ok(0)));
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn voting_needs_the_voters_signature() {
    let t = setup(&[("tier", "Gold")]);
    let id = t.propose(&t.marta).unwrap();
    t.e.set_auths(&[]);
    t.vote.vote(&t.marta, &id, &true);
}

#[test]
fn claims_are_all_required() {
    let t = setup(&[("tier", "Gold"), ("role", "maintainer")]);
    // The fake gate only knows `tier`, so `role` never matches.
    assert_eq!(t.propose(&t.marta), err(Error::NotCredentialed));
}
