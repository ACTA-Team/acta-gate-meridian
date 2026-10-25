# contracts

Un solo workspace de Cargo, con `soroban-sdk` **26.1**, para todos los contratos de
ACTA Gate.

| Contrato | De dónde viene | Qué hace |
|---|---|---|
| [`vc-vault`](vc-vault/README.md) | ACTA, modificado acá | Un vault por titular: guarda sus credenciales y su estado |
| [`vc-vault-factory`](vc-vault-factory/README.md) | ACTA | Despliega vaults, cobra la comisión de emisión, `is_vault` |
| [`did-stellar-registry`](did-stellar-registry/README.md) | ACTA | Registro on-chain de `did:stellar` |
| `vc-gate` | ACTA Gate | Índice para contratos: de una dirección a su credencial y sus claims |
| `credential-policy` | ACTA Gate | Policy de smart account: la tesorería solo le paga a quien tiene credencial |
| `credential-vote` | ACTA Gate | Votación: solo propone y vota quien tiene credencial. El segundo consumidor de `vc-gate` |
| `integration-tests` | ACTA Gate | Solo tests: la tesorería y la votación de punta a punta, a través de una smart account real de OpenZeppelin, `vc-gate` y el vault |

## Los contratos de ACTA

Se copiaron de [`ACTA-Team/contracts-acta`](https://github.com/ACTA-Team/contracts-acta),
rama `dev`, commit `282fe47`, y **se modifican acá, no en el repo público**.

- **Se subieron de `soroban-sdk` 23.4 a 26.1** para compartir workspace con los
  contratos de ACTA Gate: las smart accounts de OpenZeppelin exigen la 26.1. El
  código de los contratos compiló sin cambios; solo se adaptaron los tests que
  leen eventos, porque en la 26.1 `env.events().all()` devuelve `ContractEvents`.
- **Ya no son idénticos a los de mainnet.** Cualquier demo usa despliegues nuevos
  en testnet. Los despliegues de referencia del modelo original están en
  [`docs/deployments/`](../docs/deployments/).
- **Las rutas son las mismas que en el repo público** (`contracts/<contrato>`), así
  que un cambio se puede llevar allá con `git format-patch -- contracts/vc-vault`.
  Si el repo público sigue en la 23.4, primero hay que subirlo de versión.

## Probar

```bash
cd contracts
# primero el WASM del vault: los tests de la factory lo importan al compilar
cargo build -p vc-vault-contract --target wasm32v1-none --release
cargo test
cargo clippy --all-targets -- -D warnings
stellar contract build            # stellar-cli 25.2 o más
```

`cargo test -p acta-gate-integration-tests` corre solo los tests de integración de la
tesorería (`integration-tests/tests/treasury.rs`): cada caso pasa por el `__check_auth`
de una smart account de OpenZeppelin con `{ umbral, credential-policy }` en su única
regla, y la credencial vive en un vault real desplegado por la factory. Al final, el mismo
titular pasa por `credential-vote`: una credencial, dos gates, una revocación.

O desde la raíz: `pnpm turbo run test --filter=@acta-gate/contracts`.

Los scripts de ACTA (`scripts/build.sh`, `deploy.sh`, `deploy-mainnet.sh`,
`release.sh`) se corren desde esta carpeta con `sh scripts/<script>`.

## Licencia

Apache-2.0. Ver [`LICENSE`](LICENSE) y [`NOTICE`](NOTICE).
