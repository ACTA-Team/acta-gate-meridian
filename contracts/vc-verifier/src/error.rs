use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotAnAnchor = 1,
    CredentialTooLarge = 2,
    BatchNotFound = 3,
    IndexOutOfRange = 4,
    ProofInvalid = 5,
    CredentialRevoked = 6,
    MalformedCredential = 7,
    IssuerMismatch = 8,
    IndexMismatch = 9,
    InvalidSubjectDid = 10,
    WrongNetwork = 11,
    DidNotFound = 12,
    DidDeactivated = 13,
    NotDidController = 14,
    /// Scaffold only: removed once `attest` is implemented.
    NotImplemented = 99,
}
