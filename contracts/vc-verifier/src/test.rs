extern crate std;

use soroban_sdk::{testutils::Address as _, Address, Env, String};

use crate::{VcVerifier, VcVerifierClient};

fn setup(e: &Env) -> (VcVerifierClient<'_>, Address, Address) {
    let factory = Address::generate(e);
    let registry = Address::generate(e);
    let id = e.register(
        VcVerifier,
        (&factory, &registry, String::from_str(e, "testnet")),
    );
    (VcVerifierClient::new(e, &id), factory, registry)
}

#[test]
fn constructor_stores_config() {
    let e = Env::default();
    let (client, factory, registry) = setup(&e);
    let config = client.config();
    assert_eq!(config.factory, factory);
    assert_eq!(config.did_registry, registry);
    assert_eq!(config.network, String::from_str(&e, "testnet"));
}

#[test]
fn unknown_attestation_is_none_and_invalid() {
    let e = Env::default();
    let (client, _, _) = setup(&e);
    let holder = Address::generate(&e);
    let anchor = Address::generate(&e);
    let ty = String::from_str(&e, "ContributorBadge");
    assert_eq!(client.get_attestation(&holder, &anchor, &ty), None);
    assert!(!client.is_valid(&holder, &anchor, &ty));
}
