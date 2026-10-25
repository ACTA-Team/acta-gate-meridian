use soroban_sdk::{contractevent, Address, Env, String};

#[contractevent]
pub struct Registered {
    pub holder: Address,
    pub issuer: Address,
    pub credential_type: String,
    pub vault: Address,
    pub vc_id: String,
}

pub fn registered(
    e: &Env,
    holder: &Address,
    issuer: &Address,
    credential_type: &String,
    vault: &Address,
    vc_id: &String,
) {
    Registered {
        holder: holder.clone(),
        issuer: issuer.clone(),
        credential_type: credential_type.clone(),
        vault: vault.clone(),
        vc_id: vc_id.clone(),
    }
    .publish(e);
}
