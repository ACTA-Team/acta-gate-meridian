extern crate std;

use soroban_sdk::{testutils::Address as _, Address, Env, Map, String};

use crate::{Error, VcGate, VcGateClient};

fn setup(e: &Env) -> (VcGateClient<'_>, Address) {
    let vault_factory = Address::generate(e);
    let id = e.register(VcGate, (&vault_factory,));
    (VcGateClient::new(e, &id), vault_factory)
}

#[test]
fn constructor_stores_config() {
    let e = Env::default();
    let (client, vault_factory) = setup(&e);
    assert_eq!(client.config().vault_factory, vault_factory);
}

#[test]
fn unknown_record_is_none_and_invalid() {
    let e = Env::default();
    let (client, _) = setup(&e);
    let holder = Address::generate(&e);
    let issuer = Address::generate(&e);
    let ty = String::from_str(&e, "ContributorBadge");
    assert_eq!(client.get_record(&holder, &issuer, &ty), None);
    assert!(!client.is_valid(&holder, &issuer, &ty));
    let (k, v) = (String::from_str(&e, "tier"), String::from_str(&e, "Gold"));
    assert!(!client.has_claim(&holder, &issuer, &ty, &k, &v));
}

#[test]
fn register_fails_closed_until_implemented() {
    let e = Env::default();
    e.mock_all_auths();
    let (client, _) = setup(&e);
    let issuer = Address::generate(&e);
    let vault = Address::generate(&e);

    let registered = client.try_register(
        &issuer,
        &vault,
        &String::from_str(&e, "vc-1"),
        &String::from_str(&e, "ContributorBadge"),
        &Map::new(&e),
    );
    // The stub panics with the contract error; `try_` surfaces it as `soroban_sdk::Error`.
    let not_implemented = soroban_sdk::Error::from(Error::NotImplemented);
    assert_eq!(registered, Err(Ok(not_implemented)));
}
