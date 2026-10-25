//! `src/vault.rs` imports the vault's WASM with `contractimport!`, so this crate
//! (and everything that tests through it: `vc-gate`, `credential-policy`'s
//! neighbours, the integration tests) cannot compile until that WASM exists.
//! Without this check, `cargo test` fails with an opaque macro error deep in
//! `contractimport!`. This script does not run cargo itself: nesting a cargo
//! invocation inside a build script deadlocks on the target-dir lock.

use std::path::Path;

/// Same path `src/vault.rs` hands to `contractimport!`, relative to this crate.
const VAULT_WASM: &str = "../target/wasm32v1-none/release/vc_vault_contract.wasm";

fn main() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").expect("cargo sets CARGO_MANIFEST_DIR");
    let wasm = Path::new(&manifest_dir).join(VAULT_WASM);
    // Re-run once the file appears or changes, so a fresh build picks it up.
    println!("cargo:rerun-if-changed={}", wasm.display());
    println!("cargo:rerun-if-changed=build.rs");

    if !wasm.is_file() {
        panic!(
            "\n\nvc-gate imports the vault's WASM, and it is not built yet:\n  {}\n\n\
             Build it first, from `contracts/`:\n\n  \
             cargo build -p vc-vault-contract --target wasm32v1-none --release\n\n\
             then run your command again (`cargo test`, `cargo clippy`, `stellar contract build`).\n",
            wasm.display()
        );
    }
}
