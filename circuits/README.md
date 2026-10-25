# circuits

Reserved for the zero-knowledge phase (roadmap): selective disclosure of an ACTA
credential, verified on-chain with the BN254 and Poseidon host functions from
Protocol 25 (X-Ray).

The idea: today `vc-gate` keeps the claims a contract checks (such as `tier: Gold`)
public. With a proof, a holder could show that their credential satisfies a
requirement without registering the claim itself, and the gate would verify the
proof instead of comparing values.

Planned stack: Circom + snarkjs, Groth16 over BN254, Poseidon matching
[`rs-soroban-poseidon`](https://github.com/stellar/rs-soroban-poseidon).

Nothing here is wired into the build yet, and it is not part of the hackathon
submission. See the roadmap in the [root README](../README.md#limitations-and-roadmap).
