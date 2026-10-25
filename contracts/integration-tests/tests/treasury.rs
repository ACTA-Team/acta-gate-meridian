//! The treasury of `docs/IMPLEMENTATION ES.md` §7, assembled from the real
//! pieces: an OpenZeppelin smart account (`stellar-accounts` 0.7.2) whose only
//! rule, `Default`, carries `{ threshold 1-of-1, credential-policy }`; the real
//! `vc-gate`; and Marta's real `vc-vault`, deployed by the real factory.
//!
//! Every case goes through the account's `__check_auth`, that is, through
//! OpenZeppelin's `do_check_auth`, the way a transaction does on chain. The
//! unit tests in `credential-policy` call `enforce` directly with contexts
//! built by hand; these prove the three traps of §6 against the code that
//! actually calls `enforce`.
//!
//! Not covered: the host-side signature flow (auth entries, nonces, the
//! Ed25519 verifier). That is exercised on testnet
//! (`docs/deployments/acta-gate-testnet.md`). The verifier here accepts any
//! signature, so these tests are about authorization, not authentication.
//!
//! The account contract below is built from the crate's building blocks. The
//! one on testnet is `smart-account-kit`'s WASM, compiled from a slightly newer
//! OpenZeppelin commit with the same `Policy` trait (`IMPLEMENTATION ES.md` §4).
//!
//! The last section adds the second gate, `credential-vote`, next to the
//! treasury: one credential opens both, one revocation closes both.

use credential_policy::{
    Claim, CredentialPolicy, CredentialPolicyClient, Error as PolicyError, Requirement,
};
use credential_vote::{CredentialVote, CredentialVoteClient, Error as VoteError};
use soroban_sdk::{
    auth::{Context, ContractContext, CustomAccountInterface},
    contract, contractimpl,
    crypto::Hash,
    map, symbol_short,
    testutils::{Address as _, BytesN as _},
    vec, Address, Bytes, BytesN, Env, IntoVal, Map, String, Symbol, TryFromVal, Val, Vec,
};
use stellar_accounts::{
    policies::{simple_threshold, Policy},
    smart_account::{
        add_context_rule, do_check_auth, AuthPayload, ContextRule, ContextRuleType,
        ExecutionEntryPoint, Signer, SmartAccount, SmartAccountClient, SmartAccountError,
    },
};
use vc_gate::{VcGate, VcGateClient};
use vc_vault_factory_contract::{VaultFactoryContract, VaultFactoryContractClient, VaultInitMeta};

mod vault {
    soroban_sdk::contractimport!(file = "../target/wasm32v1-none/release/vc_vault_contract.wasm");
}

const DEFAULT_RULE: u32 = 0;
const CREDENTIAL_TYPE: &str = "ContributorBadge";

// ───────────────────────────── the contracts ─────────────────────────────

/// A smart account with the shape of the kit's: a constructor that creates the
/// `Default` rule, `__check_auth` delegating to `do_check_auth`, the management
/// functions, and `execute`.
#[contract]
pub struct Treasury;

#[contractimpl]
impl Treasury {
    pub fn __constructor(e: &Env, signers: Vec<Signer>, policies: Map<Address, Val>) {
        add_context_rule(
            e,
            &ContextRuleType::Default,
            &String::from_str(e, "Default"),
            None,
            &signers,
            &policies,
        );
    }
}

#[contractimpl]
impl CustomAccountInterface for Treasury {
    type Error = SmartAccountError;
    type Signature = AuthPayload;

    #[allow(non_snake_case)]
    fn __check_auth(
        e: Env,
        signature_payload: Hash<32>,
        signatures: AuthPayload,
        auth_contexts: Vec<Context>,
    ) -> Result<(), SmartAccountError> {
        do_check_auth(&e, &signature_payload, &signatures, &auth_contexts)
    }
}

#[contractimpl(contracttrait)]
impl SmartAccount for Treasury {}

#[contractimpl(contracttrait)]
impl ExecutionEntryPoint for Treasury {}

/// OpenZeppelin's simple threshold policy (k of n), as a contract.
#[contract]
pub struct ThresholdPolicy;

#[contractimpl]
impl Policy for ThresholdPolicy {
    type AccountParams = simple_threshold::SimpleThresholdAccountParams;

    fn enforce(
        e: &Env,
        context: Context,
        authenticated_signers: Vec<Signer>,
        context_rule: ContextRule,
        smart_account: Address,
    ) {
        simple_threshold::enforce(
            e,
            &context,
            &authenticated_signers,
            &context_rule,
            &smart_account,
        )
    }

    fn install(
        e: &Env,
        params: Self::AccountParams,
        context_rule: ContextRule,
        smart_account: Address,
    ) {
        simple_threshold::install(e, &params, &context_rule, &smart_account)
    }

    fn uninstall(e: &Env, context_rule: ContextRule, smart_account: Address) {
        simple_threshold::uninstall(e, &context_rule, &smart_account)
    }
}

/// Stands in for the Ed25519 verifier: every signature is accepted.
#[contract]
pub struct AnySignature;

#[contractimpl]
impl AnySignature {
    pub fn verify(_e: Env, _hash: Bytes, _key_data: Val, _sig_data: Val) -> bool {
        true
    }

    pub fn canonicalize_key(e: Env, key_data: Val) -> Bytes {
        Bytes::try_from_val(&e, &key_data).unwrap()
    }

    pub fn batch_canonicalize_key(e: Env, key_data: Vec<Val>) -> Vec<Bytes> {
        Vec::from_iter(
            &e,
            key_data
                .iter()
                .map(|k| Bytes::try_from_val(&e, &k).unwrap()),
        )
    }
}

// ───────────────────────────── the world ─────────────────────────────

/// A holder with a vault from ACTA's factory and, maybe, a credential in it.
struct Holder<'a> {
    address: Address,
    vault: vault::Client<'a>,
    vc_id: String,
}

struct World<'a> {
    e: Env,
    /// GrantFox.
    issuer: Address,
    /// Any token: the policy checks every `transfer`.
    token: Address,
    factory: VaultFactoryContractClient<'a>,
    gate: VcGateClient<'a>,
    policy: CredentialPolicyClient<'a>,
    threshold: Address,
    /// The treasury's Ed25519 external signer.
    signer: Signer,
    treasury: TreasuryClient<'a>,
    /// The same account, through the `SmartAccount` trait's client.
    account: SmartAccountClient<'a>,
    /// The second gate: GrantFox's contributor vote, with the same requirement.
    vote: CredentialVoteClient<'a>,
}

fn s(e: &Env, v: &str) -> String {
    String::from_str(e, v)
}

impl<'a> World<'a> {
    /// ACTA's factory and `vc-gate`, then the treasury configured exactly as
    /// `apps/api/scripts/deploy-smart-account.ts treasury` does.
    fn new() -> Self {
        Self::with_treasury(true)
    }

    /// `with_threshold = false` leaves `credential-policy` alone on the rule,
    /// the misconfiguration trap 1 is about.
    fn with_treasury(with_threshold: bool) -> Self {
        let e = Env::default();
        e.mock_all_auths_allowing_non_root_auth();

        let vault_hash = e.deployer().upload_contract_wasm(vault::WASM);
        let meta = VaultInitMeta {
            vault_hash,
            contract_admin: Address::generate(&e),
        };
        let factory =
            VaultFactoryContractClient::new(&e, &e.register(VaultFactoryContract, (meta,)));
        let gate = VcGateClient::new(&e, &e.register(VcGate, (&factory.address,)));

        let issuer = Address::generate(&e);
        let policy = CredentialPolicyClient::new(&e, &e.register(CredentialPolicy, ()));
        let threshold = e.register(ThresholdPolicy, ());
        let verifier = e.register(AnySignature, ());
        let signer = Signer::External(verifier, Bytes::from_array(&e, &[0xED; 32]));

        let requirement = Requirement {
            gate: gate.address.clone(),
            issuer: issuer.clone(),
            credential_type: s(&e, CREDENTIAL_TYPE),
            claims: vec![
                &e,
                Claim {
                    key: s(&e, "tier"),
                    value: s(&e, "Gold"),
                },
            ],
        };
        let vote_requirement = credential_vote::Requirement {
            gate: gate.address.clone(),
            issuer: issuer.clone(),
            credential_type: s(&e, CREDENTIAL_TYPE),
            claims: vec![
                &e,
                credential_vote::Claim {
                    key: s(&e, "tier"),
                    value: s(&e, "Gold"),
                },
            ],
        };
        let vote = CredentialVoteClient::new(&e, &e.register(CredentialVote, (vote_requirement,)));

        let mut policies: Map<Address, Val> =
            map![&e, (policy.address.clone(), requirement.into_val(&e))];
        if with_threshold {
            let params = simple_threshold::SimpleThresholdAccountParams { threshold: 1 };
            policies.set(threshold.clone(), params.into_val(&e));
        }
        let treasury = TreasuryClient::new(
            &e,
            &e.register(Treasury, (vec![&e, signer.clone()], policies)),
        );
        let account = SmartAccountClient::new(&e, &treasury.address);

        World {
            token: Address::generate(&e),
            issuer,
            factory,
            gate,
            policy,
            threshold,
            signer,
            treasury,
            account,
            vote,
            e,
        }
    }

    /// Step 1: ACTA deploys the holder's vault.
    fn holder(&self) -> Holder<'a> {
        let address = Address::generate(&self.e);
        let vault_id = self.factory.deploy(
            &address,
            &s(&self.e, "did:stellar:testnet:holder"),
            &BytesN::random(&self.e),
        );
        Holder {
            address,
            vault: vault::Client::new(&self.e, &vault_id),
            vc_id: s(&self.e, "urn:uuid:vc-1"),
        }
    }

    /// Step 2a: GrantFox issues into the vault.
    fn issue(&self, holder: &Holder<'a>) {
        holder.vault.issue(
            &holder.vc_id,
            &s(&self.e, "<ciphertext>"),
            &holder.vault.address,
            &self.issuer,
            &s(&self.e, "did:stellar:testnet:grantfox"),
        );
    }

    /// Step 2b: GrantFox registers the public claim in `vc-gate`.
    fn register(&self, holder: &Holder<'a>, tier: &str) {
        self.gate.register(
            &self.issuer,
            &holder.vault.address,
            &holder.vc_id,
            &s(&self.e, CREDENTIAL_TYPE),
            &map![&self.e, (s(&self.e, "tier"), s(&self.e, tier))],
        );
    }

    /// Steps 1 and 2 together.
    fn holder_with(&self, tier: &str) -> Holder<'a> {
        let holder = self.holder();
        self.issue(&holder);
        self.register(&holder, tier);
        holder
    }

    fn call(&self, contract: &Address, fn_name: Symbol, args: Vec<Val>) -> Context {
        Context::Contract(ContractContext {
            contract: contract.clone(),
            fn_name,
            args,
        })
    }

    /// `token.transfer(treasury, to, 25)`.
    fn transfer(&self, to: &Address) -> Context {
        let args = vec![
            &self.e,
            self.treasury.address.into_val(&self.e),
            to.into_val(&self.e),
            25_i128.into_val(&self.e),
        ];
        self.call(&self.token, symbol_short!("transfer"), args)
    }

    /// `token.approve(treasury, spender, 25, 1000)`.
    fn approve(&self, spender: &Address) -> Context {
        let args = vec![
            &self.e,
            self.treasury.address.into_val(&self.e),
            spender.into_val(&self.e),
            25_i128.into_val(&self.e),
            1000_u32.into_val(&self.e),
        ];
        self.call(&self.token, symbol_short!("approve"), args)
    }

    /// `treasury.execute(token, inner.fn_name, inner.args)`.
    fn execute(&self, inner: Context) -> Context {
        let Context::Contract(c) = inner else {
            unreachable!()
        };
        let args = vec![
            &self.e,
            c.contract.into_val(&self.e),
            c.fn_name.into_val(&self.e),
            c.args.into_val(&self.e),
        ];
        self.call(&self.treasury.address, symbol_short!("execute"), args)
    }

    /// The treasury's `__check_auth` for one context, signed by `signers`
    /// under `rule`: what the host runs when the account's `require_auth`
    /// fires in a transaction.
    fn authorize_with(
        &self,
        context: Context,
        signers: &[Signer],
        rule: u32,
    ) -> Result<(), soroban_sdk::Error> {
        let mut signatures = Map::new(&self.e);
        for signer in signers {
            signatures.set(signer.clone(), Bytes::from_array(&self.e, &[7; 64]));
        }
        let payload = AuthPayload {
            signers: signatures,
            context_rule_ids: vec![&self.e, rule],
        };
        match self.e.try_invoke_contract_check_auth::<soroban_sdk::Error>(
            &self.treasury.address,
            &BytesN::random(&self.e),
            payload.into_val(&self.e),
            &vec![&self.e, context],
        ) {
            Ok(()) => Ok(()),
            Err(Ok(err)) => Err(err),
            Err(Err(invoke)) => panic!("unexpected result: {invoke:?}"),
        }
    }

    /// Signed by the treasury's signer, on its only rule.
    fn authorize(&self, context: Context) -> Result<(), soroban_sdk::Error> {
        self.authorize_with(context, std::slice::from_ref(&self.signer), DEFAULT_RULE)
    }

    /// The treasury pays `to`.
    fn pay(&self, to: &Address) -> Result<(), soroban_sdk::Error> {
        self.authorize(self.transfer(to))
    }

    /// `who` opens a proposal in the contributor vote.
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

    /// `who` votes in favor of `proposal`.
    fn cast(&self, who: &Address, proposal: u32) -> Result<(), soroban_sdk::Error> {
        match self.vote.try_vote(who, &proposal, &true) {
            Ok(Ok(())) => Ok(()),
            Err(Ok(err)) => Err(err),
            other => panic!("unexpected result: {other:?}"),
        }
    }
}

fn policy_err(e: PolicyError) -> Result<(), soroban_sdk::Error> {
    Err(e.into())
}

fn rejected() -> Result<(), soroban_sdk::Error> {
    policy_err(PolicyError::RecipientNotCredentialed)
}

// ───────────────────────────── the cases ─────────────────────────────

#[test]
fn the_treasury_is_wired_like_the_testnet_one() {
    let w = World::new();
    let rule = w.account.get_context_rule(&DEFAULT_RULE);
    assert_eq!(w.account.get_context_rules_count(), 1);
    assert_eq!(rule.context_type, ContextRuleType::Default);
    assert_eq!(rule.signers, vec![&w.e, w.signer.clone()]);
    assert_eq!(rule.policies.len(), 2);
    assert!(rule.policies.contains(&w.threshold));
    assert!(rule.policies.contains(&w.policy.address));

    let requirement = w
        .policy
        .get_requirement(&w.treasury.address, &DEFAULT_RULE)
        .unwrap();
    assert_eq!(requirement.gate, w.gate.address);
    assert_eq!(requirement.issuer, w.issuer);
    assert_eq!(requirement.claims.len(), 1);
}

#[test]
fn pays_a_holder_with_a_valid_gold_credential() {
    let w = World::new();
    let marta = w.holder_with("Gold");
    assert!(w
        .gate
        .is_valid(&marta.address, &w.issuer, &s(&w.e, CREDENTIAL_TYPE)));
    assert_eq!(w.pay(&marta.address), Ok(()));
}

#[test]
fn rejects_an_address_without_a_credential() {
    let w = World::new();
    assert_eq!(w.pay(&Address::generate(&w.e)), rejected());
}

#[test]
fn rejects_a_holder_whose_credential_is_not_in_the_gate() {
    let w = World::new();
    let holder = w.holder();
    w.issue(&holder);
    // In the vault, but GrantFox never registered it: the gate cannot see it.
    assert_eq!(w.pay(&holder.address), rejected());
}

#[test]
fn rejects_a_silver_holder_when_gold_is_required() {
    let w = World::new();
    let silver = w.holder_with("Silver");
    assert_eq!(w.pay(&silver.address), rejected());
}

/// The demo's step 5: nobody touches the gate or an allowlist.
#[test]
fn issuer_revocation_bounces_the_next_payment() {
    let w = World::new();
    let marta = w.holder_with("Gold");
    assert_eq!(w.pay(&marta.address), Ok(()));

    marta
        .vault
        .revoke_by_issuer(&marta.vc_id, &s(&w.e, "2026-10-25"));

    assert_eq!(w.pay(&marta.address), rejected());
}

#[test]
fn holder_revocation_and_a_revoked_vault_bounce_too() {
    let w = World::new();

    let by_holder = w.holder_with("Gold");
    by_holder
        .vault
        .revoke(&by_holder.vc_id, &s(&w.e, "2026-10-25"));
    assert_eq!(w.pay(&by_holder.address), rejected());

    let whole_vault = w.holder_with("Gold");
    whole_vault.vault.revoke_vault();
    assert_eq!(w.pay(&whole_vault.address), rejected());
}

/// Trap 1: a rule with policies does not check its own signers, so the
/// policies have to. Two layers: the threshold policy on the same rule, and
/// `credential-policy` refusing an empty signer set on its own.
#[test]
fn trap_1_a_payment_without_signers_is_rejected() {
    let w = World::new();
    let marta = w.holder_with("Gold");
    let result = w.authorize_with(w.transfer(&marta.address), &[], DEFAULT_RULE);
    // Whichever policy runs first says no. Their order is the map's.
    let threshold_said_no = Err(soroban_sdk::Error::from_contract_error(
        simple_threshold::SimpleThresholdError::NotAllowed as u32,
    ));
    assert!(
        result == policy_err(PolicyError::NoSigners) || result == threshold_said_no,
        "unexpected result: {result:?}"
    );
}

#[test]
fn trap_1_credential_policy_alone_still_rejects_an_unsigned_payment() {
    let w = World::with_treasury(false);
    let marta = w.holder_with("Gold");
    // Without the threshold policy, `do_check_auth` would have let this through.
    assert_eq!(
        w.authorize_with(w.transfer(&marta.address), &[], DEFAULT_RULE),
        policy_err(PolicyError::NoSigners)
    );
    assert_eq!(w.pay(&marta.address), Ok(()));
}

/// Trap 2: the signer picks the rule. This documents the hole, so the
/// treasury must never get a second rule that can authorize a payment.
#[test]
fn trap_2_a_second_rule_without_the_policy_is_a_backdoor() {
    let w = World::new();
    let stranger = Address::generate(&w.e);
    assert_eq!(w.pay(&stranger), rejected());

    let backdoor = w.account.add_context_rule(
        &ContextRuleType::Default,
        &s(&w.e, "backdoor"),
        &None,
        &vec![&w.e, w.signer.clone()],
        &Map::new(&w.e),
    );
    assert_eq!(
        w.authorize_with(
            w.transfer(&stranger),
            std::slice::from_ref(&w.signer),
            backdoor.id
        ),
        Ok(())
    );
}

/// Trap 3: `execute(target, fn, args)` is authorized as a call to the account
/// itself; the inner `transfer` never reaches a policy on its own.
#[test]
fn trap_3_execute_is_opened_and_checked() {
    let w = World::new();
    let marta = w.holder_with("Gold");
    let stranger = Address::generate(&w.e);
    assert_eq!(w.authorize(w.execute(w.transfer(&marta.address))), Ok(()));
    assert_eq!(w.authorize(w.execute(w.transfer(&stranger))), rejected());
}

#[test]
fn approve_is_rejected_directly_and_through_execute() {
    let w = World::new();
    let marta = w.holder_with("Gold");
    assert_eq!(
        w.authorize(w.approve(&marta.address)),
        policy_err(PolicyError::AllowanceNotPermitted)
    );
    assert_eq!(
        w.authorize(w.execute(w.approve(&marta.address))),
        policy_err(PolicyError::AllowanceNotPermitted)
    );
}

#[test]
fn the_treasury_can_still_manage_itself() {
    let w = World::new();
    let new_signer = Signer::Delegated(Address::generate(&w.e));
    let args = vec![&w.e, DEFAULT_RULE.into_val(&w.e), new_signer.into_val(&w.e)];
    let admin = w.call(&w.treasury.address, Symbol::new(&w.e, "add_signer"), args);
    assert_eq!(w.authorize(admin), Ok(()));
}

#[test]
fn a_signer_outside_the_rule_cannot_pay() {
    let w = World::new();
    let marta = w.holder_with("Gold");
    let intruder = Signer::External(
        Address::generate(&w.e),
        Bytes::from_array(&w.e, &[0xBA; 32]),
    );
    assert_eq!(
        w.authorize_with(w.transfer(&marta.address), &[intruder], DEFAULT_RULE),
        Err(soroban_sdk::Error::from_contract_error(
            SmartAccountError::UnauthorizedSigner as u32
        ))
    );
}

// ───────────────────────────── the second gate ─────────────────────────────

fn not_a_voter<T>() -> Result<T, soroban_sdk::Error> {
    Err(VoteError::NotCredentialed.into())
}

#[test]
fn a_gold_holder_proposes_and_votes_with_the_real_gate() {
    let w = World::new();
    let marta = w.holder_with("Gold");
    let id = w.propose(&marta.address).unwrap();
    assert_eq!(w.cast(&marta.address, id), Ok(()));
    assert_eq!(w.vote.proposal(&id).unwrap().in_favor, 1);

    assert_eq!(w.cast(&Address::generate(&w.e), id), not_a_voter());
    let silver = w.holder_with("Silver");
    assert_eq!(w.propose(&silver.address), not_a_voter());
    assert_eq!(w.cast(&silver.address, id), not_a_voter());
}

/// The pitch line: the same credential opens a payment and a vote, and one
/// revocation by the issuer closes both. Nobody touched either contract.
#[test]
fn one_credential_two_gates_one_revocation() {
    let w = World::new();
    let marta = w.holder_with("Gold");
    let id = w.propose(&marta.address).unwrap();

    assert_eq!(w.pay(&marta.address), Ok(()));
    assert_eq!(w.cast(&marta.address, id), Ok(()));

    marta
        .vault
        .revoke_by_issuer(&marta.vc_id, &s(&w.e, "2026-10-25"));

    assert_eq!(w.pay(&marta.address), rejected());
    assert_eq!(w.propose(&marta.address), not_a_voter());
    // The vote already cast stays; the gate only stops new ones.
    assert_eq!(w.vote.proposal(&id).unwrap().in_favor, 1);
}
