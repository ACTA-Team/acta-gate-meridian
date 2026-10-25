extern crate std;

use soroban_sdk::{
    map,
    testutils::{Address as _, BytesN as _},
    Address, BytesN, Env, Map, String,
};
use vc_vault_factory_contract::{VaultFactoryContract, VaultInitMeta};

use crate::{vault, Error, VcGate, VcGateClient};

struct Setup<'a> {
    e: Env,
    gate: VcGateClient<'a>,
    factory: Address,
    holder: Address,
    issuer: Address,
    vault: vault::Client<'a>,
}

/// The real factory deploys Marta's vault; GrantFox is the issuer.
fn setup<'a>() -> Setup<'a> {
    let e = Env::default();
    e.mock_all_auths_allowing_non_root_auth();

    let vault_hash = e.deployer().upload_contract_wasm(vault::WASM);
    let meta = VaultInitMeta {
        vault_hash,
        contract_admin: Address::generate(&e),
    };
    let factory = e.register(VaultFactoryContract, (meta,));
    let factory_client = vc_vault_factory_contract::VaultFactoryContractClient::new(&e, &factory);

    let holder = Address::generate(&e);
    let vault_id = factory_client.deploy(
        &holder,
        &String::from_str(&e, "did:stellar:testnet:marta"),
        &BytesN::random(&e),
    );

    let gate_id = e.register(VcGate, (&factory,));
    Setup {
        gate: VcGateClient::new(&e, &gate_id),
        vault: vault::Client::new(&e, &vault_id),
        issuer: Address::generate(&e),
        holder,
        factory,
        e,
    }
}

fn s(e: &Env, v: &str) -> String {
    String::from_str(e, v)
}

fn ty(e: &Env) -> String {
    s(e, "ContributorBadge")
}

fn gold(e: &Env) -> Map<String, String> {
    map![e, (s(e, "tier"), s(e, "Gold"))]
}

impl Setup<'_> {
    fn issue(&self, issuer: &Address, vc_id: &str) -> String {
        let id = s(&self.e, vc_id);
        self.vault.issue(
            &id,
            &s(&self.e, "<ciphertext>"),
            &self.vault.address,
            issuer,
            &s(&self.e, "did:issuer"),
        );
        id
    }

    fn register(&self, vc_id: &String, claims: &Map<String, String>) {
        self.gate.register(
            &self.issuer,
            &self.vault.address,
            vc_id,
            &ty(&self.e),
            claims,
        );
    }

    fn try_register(
        &self,
        issuer: &Address,
        vault: &Address,
        vc_id: &String,
    ) -> Option<soroban_sdk::Error> {
        let r = self
            .gate
            .try_register(issuer, vault, vc_id, &ty(&self.e), &gold(&self.e));
        match r {
            Ok(Ok(())) => None,
            Err(Ok(err)) => Some(err),
            other => panic!("unexpected result: {other:?}"),
        }
    }

    fn is_valid(&self) -> bool {
        self.gate.is_valid(&self.holder, &self.issuer, &ty(&self.e))
    }

    fn has(&self, key: &str, value: &str) -> bool {
        self.gate.has_claim(
            &self.holder,
            &self.issuer,
            &ty(&self.e),
            &s(&self.e, key),
            &s(&self.e, value),
        )
    }
}

#[test]
fn constructor_stores_config() {
    let t = setup();
    assert_eq!(t.gate.config().vault_factory, t.factory);
}

#[test]
fn unknown_holder_is_invalid() {
    let t = setup();
    assert!(!t.is_valid());
    assert!(!t.has("tier", "Gold"));
    assert_eq!(t.gate.get_record(&t.holder, &t.issuer, &ty(&t.e)), None);
}

#[test]
fn register_indexes_the_vault_owner_with_its_claims() {
    let t = setup();
    let vc_id = t.issue(&t.issuer, "vc-1");
    t.register(&vc_id, &gold(&t.e));

    let record = t.gate.get_record(&t.holder, &t.issuer, &ty(&t.e)).unwrap();
    assert_eq!(record.vault, t.vault.address);
    assert_eq!(record.vc_id, vc_id);
    assert!(t.is_valid());
    assert!(t.has("tier", "Gold"));
    assert!(!t.has("tier", "Silver"));
    assert!(!t.has("name", "Marta"));
}

#[test]
fn another_issuer_does_not_count() {
    let t = setup();
    let vc_id = t.issue(&t.issuer, "vc-1");
    t.register(&vc_id, &gold(&t.e));
    let other = Address::generate(&t.e);
    assert!(!t.gate.is_valid(&t.holder, &other, &ty(&t.e)));
}

#[test]
fn register_rejects_a_vault_the_factory_did_not_deploy() {
    let t = setup();
    let vc_id = t.issue(&t.issuer, "vc-1");
    let fake = Address::generate(&t.e);
    assert_eq!(
        t.try_register(&t.issuer, &fake, &vc_id),
        Some(Error::NotAVault.into())
    );
}

#[test]
fn register_rejects_someone_who_did_not_issue_it() {
    let t = setup();
    let vc_id = t.issue(&t.issuer, "vc-1");
    let impostor = Address::generate(&t.e);
    assert_eq!(
        t.try_register(&impostor, &t.vault.address, &vc_id),
        Some(Error::NotTheIssuer.into())
    );
}

#[test]
fn register_rejects_a_missing_credential() {
    let t = setup();
    let missing = s(&t.e, "nope");
    assert_eq!(
        t.try_register(&t.issuer, &t.vault.address, &missing),
        Some(Error::NotTheIssuer.into())
    );
}

#[test]
fn register_rejects_a_revoked_credential() {
    let t = setup();
    let vc_id = t.issue(&t.issuer, "vc-1");
    t.vault.revoke_by_issuer(&vc_id, &s(&t.e, "2026-10-25"));
    assert_eq!(
        t.try_register(&t.issuer, &t.vault.address, &vc_id),
        Some(Error::CredentialNotValid.into())
    );
}

#[test]
fn register_rejects_a_revoked_vault() {
    let t = setup();
    let vc_id = t.issue(&t.issuer, "vc-1");
    t.vault.revoke_vault();
    assert_eq!(
        t.try_register(&t.issuer, &t.vault.address, &vc_id),
        Some(Error::CredentialNotValid.into())
    );
}

#[test]
fn register_enforces_the_caps() {
    let t = setup();
    let vc_id = t.issue(&t.issuer, "vc-1");
    let long = s(&t.e, &"x".repeat(65));
    let mut too_many = Map::new(&t.e);
    for i in 0..9 {
        too_many.set(s(&t.e, &std::format!("k{i}")), s(&t.e, "v"));
    }
    let cases = [
        (long.clone(), gold(&t.e)),
        (ty(&t.e), map![&t.e, (s(&t.e, "tier"), long.clone())]),
        (ty(&t.e), map![&t.e, (long, s(&t.e, "Gold"))]),
        (ty(&t.e), too_many),
    ];
    for (credential_type, claims) in cases {
        let r = t.gate.try_register(
            &t.issuer,
            &t.vault.address,
            &vc_id,
            &credential_type,
            &claims,
        );
        assert_eq!(r, Err(Ok(Error::InputTooLong.into())));
    }
}

#[test]
fn issuer_revocation_reaches_the_gate() {
    let t = setup();
    let vc_id = t.issue(&t.issuer, "vc-1");
    t.register(&vc_id, &gold(&t.e));
    t.vault.revoke_by_issuer(&vc_id, &s(&t.e, "2026-10-25"));
    assert!(!t.is_valid());
    assert!(!t.has("tier", "Gold"));
}

#[test]
fn holder_revocation_reaches_the_gate() {
    let t = setup();
    let vc_id = t.issue(&t.issuer, "vc-1");
    t.register(&vc_id, &gold(&t.e));
    t.vault.revoke(&vc_id, &s(&t.e, "2026-10-25"));
    assert!(!t.is_valid());
}

#[test]
fn a_revoked_vault_reaches_the_gate() {
    let t = setup();
    let vc_id = t.issue(&t.issuer, "vc-1");
    t.register(&vc_id, &gold(&t.e));
    t.vault.revoke_vault();
    assert!(!t.is_valid());
}

#[test]
fn a_new_registration_replaces_the_old_one() {
    let t = setup();
    let silver = t.issue(&t.issuer, "vc-silver");
    t.register(&silver, &map![&t.e, (s(&t.e, "tier"), s(&t.e, "Silver"))]);
    assert!(t.has("tier", "Silver"));

    let gold_id = t.issue(&t.issuer, "vc-gold");
    t.register(&gold_id, &gold(&t.e));
    assert!(t.has("tier", "Gold"));
    assert!(!t.has("tier", "Silver"));
    assert_eq!(
        t.gate
            .get_record(&t.holder, &t.issuer, &ty(&t.e))
            .unwrap()
            .vc_id,
        gold_id
    );
}
