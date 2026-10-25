use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotAVault = 1,
    InputTooLong = 2,
    /// The credential is not in the vault, or `get_vc(id).issuer` is someone else.
    NotTheIssuer = 3,
    /// The credential is revoked (by the holder or the issuer) or the vault is.
    CredentialNotValid = 4,
    /// Scaffold only: removed once `register` is implemented.
    NotImplemented = 99,
}
