use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotAVault = 1,
    InputTooLong = 2,
    RecordNotFound = 3,
    AlreadyRevoked = 4,
    /// Scaffold only: removed once `issue` and `revoke` are implemented.
    NotImplemented = 99,
}
