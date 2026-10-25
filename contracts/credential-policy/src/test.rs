extern crate std;

use soroban_sdk::{
    auth::{Context, ContractContext},
    contract, contractimpl, symbol_short,
    testutils::Address as _,
    vec, Address, Bytes, Env, IntoVal, String, Symbol, Val, Vec,
};
use stellar_accounts::smart_account::{ContextRule, ContextRuleType, Signer};

use crate::{Claim, CredentialPolicy, CredentialPolicyClient, Error, Requirement};

/// Stands in for `vc-gate`: a holder is valid with the tier stored for them.
#[contract]
struct FakeGate;

#[contractimpl]
impl FakeGate {
    pub fn set_tier(e: Env, holder: Address, tier: String) {
        e.storage().persistent().set(&holder, &tier);
    }

    pub fn is_valid(e: Env, holder: Address, _issuer: Address, _credential_type: String) -> bool {
        e.storage().persistent().has(&holder)
    }

    pub fn has_claim(
        e: Env,
        holder: Address,
        _issuer: Address,
        _credential_type: String,
        key: String,
        value: String,
    ) -> bool {
        let tier: Option<String> = e.storage().persistent().get(&holder);
        key == String::from_str(&e, "tier") && tier == Some(value)
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

fn setup<'a>(claims: &[(&str, &str)]) -> Setup<'a> {
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

    let mut required = Vec::new(&e);
    for (k, v) in claims {
        required.push_back(Claim {
            key: String::from_str(&e, k),
            value: String::from_str(&e, v),
        });
    }
    let requirement = Requirement {
        gate: gate.address.clone(),
        issuer: Address::generate(&e),
        credential_type: String::from_str(&e, "ContributorBadge"),
        claims: required,
    };
    policy.install(&requirement, &rule, &account);

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
