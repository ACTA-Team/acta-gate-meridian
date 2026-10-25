extern crate std;

use soroban_sdk::{testutils::Address as _, Address, Env};

use crate::{CredentialPolicy, CredentialPolicyClient};

#[test]
fn no_requirement_before_install() {
    let e = Env::default();
    let id = e.register(CredentialPolicy, ());
    let client = CredentialPolicyClient::new(&e, &id);
    assert_eq!(client.get_requirement(&Address::generate(&e), &0), None);
}
