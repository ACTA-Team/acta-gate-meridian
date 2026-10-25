extern crate std;

use soroban_sdk::{
    auth::{Context, ContractContext},
    contract, contractimpl, symbol_short,
    testutils::{
        storage::{Instance, Persistent},
        Address as _, Events, Ledger,
    },
    vec, Address, Bytes, Env, Event as _, IntoVal, Map, String, Symbol, Val, Vec,
};
use stellar_accounts::smart_account::{ContextRule, ContextRuleType, Signer};

use crate::{
    Claim, CredentialPolicy, CredentialPolicyClient, DataKey, Enforced, Error, Requirement,
    TTL_EXTEND_TO, TTL_THRESHOLD,
};

/// Stands in for `vc-gate`: a holder is valid with the tier stored for them.
#[contract]
struct FakeGate;

#[contractimpl]
impl FakeGate {
    pub fn set_tier(e: Env, holder: Address, tier: String) {
        e.storage().persistent().set(&holder, &tier);
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
    policy: CredentialPolicyClient<'a>,
    gate: FakeGateClient<'a>,
    account: Address,
    rule: ContextRule,
    token: Address,
    marta: Address,
    stranger: Address,
}

fn requirement(e: &Env, gate: &Address, claims: &[(&str, &str)]) -> Requirement {
    let mut required = Vec::new(e);
    for (k, v) in claims {
        required.push_back(Claim {
            key: String::from_str(e, k),
            value: String::from_str(e, v),
        });
    }
    Requirement {
        gate: gate.clone(),
        issuer: Address::generate(e),
        credential_type: String::from_str(e, "ContributorBadge"),
        claims: required,
    }
}

/// Everything but the `install`, so a test can try its own requirement.
fn setup_uninstalled<'a>() -> Setup<'a> {
    let e = Env::default();
    e.mock_all_auths();

    let gate = FakeGateClient::new(&e, &e.register(FakeGate, ()));
    let policy = CredentialPolicyClient::new(&e, &e.register(CredentialPolicy, ()));
    let account = Address::generate(&e);
    let rule = ContextRule {
        id: 0,
        context_type: ContextRuleType::Default,
        name: String::from_str(&e, "Default"),
        signers: Vec::new(&e),
        signer_ids: Vec::new(&e),
        policies: vec![&e, policy.address.clone()],
        policy_ids: vec![&e, 0],
        valid_until: None,
    };

    let marta = Address::generate(&e);
    gate.set_tier(&marta, &String::from_str(&e, "Gold"));

    Setup {
        token: Address::generate(&e),
        stranger: Address::generate(&e),
        marta,
        account,
        rule,
        policy,
        gate,
        e,
    }
}

fn setup<'a>(claims: &[(&str, &str)]) -> Setup<'a> {
    let t = setup_uninstalled();
    let req = requirement(&t.e, &t.gate.address, claims);
    t.policy.install(&req, &t.rule, &t.account);
    t
}

impl Setup<'_> {
    fn signers(&self) -> Vec<Signer> {
        vec![
            &self.e,
            Signer::External(
                Address::generate(&self.e),
                Bytes::from_array(&self.e, &[1; 32]),
            ),
        ]
    }

    fn call(&self, contract: &Address, fn_name: Symbol, args: Vec<Val>) -> Context {
        Context::Contract(ContractContext {
            contract: contract.clone(),
            fn_name,
            args,
        })
    }

    fn transfer(&self, to: &Address) -> Context {
        let args = vec![
            &self.e,
            self.account.into_val(&self.e),
            to.into_val(&self.e),
            25_i128.into_val(&self.e),
        ];
        self.call(&self.token, symbol_short!("transfer"), args)
    }

    fn approve(&self, spender: &Address) -> Context {
        let args = vec![
            &self.e,
            self.account.into_val(&self.e),
            spender.into_val(&self.e),
            25_i128.into_val(&self.e),
            1000_u32.into_val(&self.e),
        ];
        self.call(&self.token, symbol_short!("approve"), args)
    }

    /// `account.execute(token, inner.fn_name, inner.args)`.
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
        self.call(&self.account, symbol_short!("execute"), args)
    }

    fn enforce(&self, context: &Context) -> Result<(), soroban_sdk::Error> {
        self.enforce_with(context, &self.signers())
    }

    fn enforce_with(
        &self,
        context: &Context,
        signers: &Vec<Signer>,
    ) -> Result<(), soroban_sdk::Error> {
        match self
            .policy
            .try_enforce(context, signers, &self.rule, &self.account)
        {
            Ok(Ok(())) => Ok(()),
            Err(Ok(err)) => Err(err),
            other => panic!("unexpected result: {other:?}"),
        }
    }

    /// Ledgers left on the `Requirement` entry and on the policy's instance.
    fn ttls(&self) -> (u32, u32) {
        let key = DataKey::Requirement(self.account.clone(), self.rule.id);
        self.e.as_contract(&self.policy.address, || {
            (
                self.e.storage().persistent().get_ttl(&key),
                self.e.storage().instance().get_ttl(),
            )
        })
    }

    /// Moves the ledger forward until the policy's entries are below the
    /// threshold, keeping the fake gate alive so `enforce` can still ask it.
    fn age_past_threshold(&self) {
        self.e.as_contract(&self.gate.address, || {
            let far = TTL_EXTEND_TO * 2;
            self.e.storage().instance().extend_ttl(far, far);
            self.e
                .storage()
                .persistent()
                .extend_ttl(&self.marta, far, far);
        });
        let elapsed = TTL_EXTEND_TO - TTL_THRESHOLD + 1;
        self.e.ledger().with_mut(|l| l.sequence_number += elapsed);
        let (entry, instance) = self.ttls();
        assert!(entry < TTL_THRESHOLD && instance < TTL_THRESHOLD);
    }
}

fn err(e: Error) -> Result<(), soroban_sdk::Error> {
    Err(e.into())
}

#[test]
fn pays_a_credentialed_recipient() {
    let t = setup(&[("tier", "Gold")]);
    assert_eq!(t.enforce(&t.transfer(&t.marta)), Ok(()));
}

#[test]
fn rejects_a_recipient_without_the_credential() {
    let t = setup(&[("tier", "Gold")]);
    assert_eq!(
        t.enforce(&t.transfer(&t.stranger)),
        err(Error::RecipientNotCredentialed)
    );
}

#[test]
fn rejects_a_recipient_with_the_wrong_claim() {
    let t = setup(&[("tier", "Gold")]);
    t.gate.set_tier(&t.marta, &String::from_str(&t.e, "Silver"));
    assert_eq!(
        t.enforce(&t.transfer(&t.marta)),
        err(Error::RecipientNotCredentialed)
    );
}

#[test]
fn without_claims_any_valid_credential_counts() {
    let t = setup(&[]);
    t.gate.set_tier(&t.marta, &String::from_str(&t.e, "Silver"));
    assert_eq!(t.enforce(&t.transfer(&t.marta)), Ok(()));
    assert_eq!(
        t.enforce(&t.transfer(&t.stranger)),
        err(Error::RecipientNotCredentialed)
    );
}

#[test]
fn trap_1_rejects_a_call_without_signers() {
    let t = setup(&[("tier", "Gold")]);
    let none = Vec::new(&t.e);
    assert_eq!(
        t.enforce_with(&t.transfer(&t.marta), &none),
        err(Error::NoSigners)
    );
}

#[test]
fn trap_3_opens_execute() {
    let t = setup(&[("tier", "Gold")]);
    assert_eq!(t.enforce(&t.execute(t.transfer(&t.marta))), Ok(()));
    assert_eq!(
        t.enforce(&t.execute(t.transfer(&t.stranger))),
        err(Error::RecipientNotCredentialed)
    );
}

#[test]
fn rejects_approve_directly_and_through_execute() {
    let t = setup(&[("tier", "Gold")]);
    assert_eq!(
        t.enforce(&t.approve(&t.marta)),
        err(Error::AllowanceNotPermitted)
    );
    assert_eq!(
        t.enforce(&t.execute(t.approve(&t.marta))),
        err(Error::AllowanceNotPermitted)
    );
}

#[test]
fn lets_admin_calls_through() {
    let t = setup(&[("tier", "Gold")]);
    let admin = t.call(&t.account, Symbol::new(&t.e, "add_signer"), Vec::new(&t.e));
    assert_eq!(t.enforce(&admin), Ok(()));
}

#[test]
fn lets_transfer_from_and_burn_from_through() {
    // The treasury is the spender, not the source: these move or burn tokens
    // out of an allowance someone else granted it. Not a payment by the treasury.
    let t = setup(&[("tier", "Gold")]);
    let args = vec![
        &t.e,
        t.account.into_val(&t.e),
        t.stranger.into_val(&t.e),
        t.stranger.into_val(&t.e),
        25_i128.into_val(&t.e),
    ];
    let transfer_from = t.call(&t.token, Symbol::new(&t.e, "transfer_from"), args);
    assert_eq!(t.enforce(&transfer_from), Ok(()));
    let args = vec![
        &t.e,
        t.account.into_val(&t.e),
        t.stranger.into_val(&t.e),
        25_i128.into_val(&t.e),
    ];
    let burn_from = t.call(&t.token, Symbol::new(&t.e, "burn_from"), args);
    assert_eq!(t.enforce(&burn_from), Ok(()));
}

#[test]
fn fails_closed_on_a_malformed_transfer() {
    let t = setup(&[("tier", "Gold")]);
    let short = t.call(&t.token, symbol_short!("transfer"), Vec::new(&t.e));
    assert_eq!(t.enforce(&short), err(Error::MalformedCall));
}

#[test]
fn a_transfer_on_a_rule_without_the_policy_installed_is_rejected() {
    let t = setup(&[("tier", "Gold")]);
    t.policy.uninstall(&t.rule, &t.account);
    assert_eq!(t.policy.get_requirement(&t.account, &0), None);
    assert_eq!(t.enforce(&t.transfer(&t.marta)), err(Error::NotInstalled));
}

#[test]
fn uninstall_twice_fails() {
    let t = setup(&[]);
    t.policy.uninstall(&t.rule, &t.account);
    assert_eq!(
        t.policy.try_uninstall(&t.rule, &t.account),
        Err(Ok(Error::NotInstalled.into()))
    );
}

#[test]
fn install_rejects_a_requirement_with_a_duplicate_claim_key() {
    let t = setup_uninstalled();
    let req = requirement(
        &t.e,
        &t.gate.address,
        &[("tier", "Gold"), ("tier", "Silver")],
    );
    assert_eq!(
        t.policy.try_install(&req, &t.rule, &t.account),
        Err(Ok(Error::MalformedRequirement.into()))
    );
    assert_eq!(t.policy.get_requirement(&t.account, &0), None);
}

#[test]
fn enforce_still_fails_closed_on_a_duplicate_claim_key() {
    // `install` rejects it; if the entry got there some other way, a payment
    // never goes through on half a requirement.
    let t = setup_uninstalled();
    let req = requirement(
        &t.e,
        &t.gate.address,
        &[("tier", "Gold"), ("tier", "Silver")],
    );
    let key = DataKey::Requirement(t.account.clone(), t.rule.id);
    t.e.as_contract(&t.policy.address, || {
        t.e.storage().persistent().set(&key, &req);
    });
    assert_eq!(
        t.enforce(&t.transfer(&t.marta)),
        err(Error::MalformedRequirement)
    );
}

#[test]
fn install_extends_the_requirement_and_the_instance() {
    let t = setup(&[("tier", "Gold")]);
    assert_eq!(t.ttls(), (TTL_EXTEND_TO, TTL_EXTEND_TO));
}

#[test]
fn enforce_extends_the_requirement_and_the_instance() {
    let t = setup(&[("tier", "Gold")]);
    t.age_past_threshold();
    assert_eq!(t.enforce(&t.transfer(&t.marta)), Ok(()));
    assert_eq!(t.ttls(), (TTL_EXTEND_TO, TTL_EXTEND_TO));
}

#[test]
fn get_requirement_extends_the_requirement_and_the_instance() {
    let t = setup(&[("tier", "Gold")]);
    t.age_past_threshold();
    assert!(t.policy.get_requirement(&t.account, &0).is_some());
    assert_eq!(t.ttls(), (TTL_EXTEND_TO, TTL_EXTEND_TO));
}

#[test]
fn an_admin_call_does_not_touch_the_ttl() {
    // Nothing is read for a call that is not a payment, so nothing is extended.
    let t = setup(&[("tier", "Gold")]);
    t.age_past_threshold();
    let before = t.ttls();
    let admin = t.call(&t.account, Symbol::new(&t.e, "add_signer"), Vec::new(&t.e));
    assert_eq!(t.enforce(&admin), Ok(()));
    assert_eq!(t.ttls(), before);
}

#[test]
fn a_payment_that_passes_emits_enforced() {
    let t = setup(&[("tier", "Gold")]);
    assert_eq!(t.enforce(&t.transfer(&t.marta)), Ok(()));
    let expected = Enforced {
        smart_account: t.account.clone(),
        context_rule_id: t.rule.id,
        recipient: t.marta.clone(),
    };
    assert_eq!(
        t.e.events().all(),
        [expected.to_xdr(&t.e, &t.policy.address)]
    );
}

#[test]
fn a_rejected_payment_and_an_admin_call_emit_nothing() {
    let t = setup(&[("tier", "Gold")]);
    assert_eq!(
        t.enforce(&t.transfer(&t.stranger)),
        err(Error::RecipientNotCredentialed)
    );
    assert_eq!(t.e.events().all().events().len(), 0);
    let admin = t.call(&t.account, Symbol::new(&t.e, "add_signer"), Vec::new(&t.e));
    assert_eq!(t.enforce(&admin), Ok(()));
    assert_eq!(t.e.events().all().events().len(), 0);
}
