# ACTA Gate — investigación de implementación

Cómo construir lo que explica [`IDEA ES.md`](IDEA%20ES.md) sobre los contratos de
vaults de ACTA, que viven en [`contracts/`](../contracts/README.md) y se modifican
acá. Todo se verificó contra el código fuente y contra el estado real de testnet.
Actualizado el 2026-10-25.

---

## 1. Qué le faltaba al vault, y qué le cambiamos

El vault original (`vc-vault` 0.4.0, el que está en mainnet) es el commit `282fe47`
del repo público. Las líneas de "Antes" apuntan ahí; las de "Ahora", al código de
este repo.

| Hueco | Antes (0.4.0) | Ahora (0.5.0) |
|---|---|---|
| **No guardaba quién emitió** | `issue` exige la firma de `issuer_addr` ([`contract.rs:197`](https://github.com/ACTA-Team/contracts-acta/blob/282fe47/contracts/vc-vault/src/contract.rs#L197)) pero guarda solo `issuer_did`, un texto libre ([`:216`](https://github.com/ACTA-Team/contracts-acta/blob/282fe47/contracts/vc-vault/src/contract.rs#L216)). La dirección queda únicamente en el evento `vc_issued` ([`:220`](https://github.com/ACTA-Team/contracts-acta/blob/282fe47/contracts/vc-vault/src/contract.rs#L220)), y los RPC borran los eventos a los ~7 días | `VerifiableCredential.issuer` ([`verifiable_credential.rs:23`](../contracts/vc-vault/src/types/verifiable_credential.rs#L23)), guardado en `issue` y `batch_issue` ([`contract.rs:233`](../contracts/vc-vault/src/contract.rs#L233), [`:296`](../contracts/vc-vault/src/contract.rs#L296)) y conservado en `push` ([`:370`](../contracts/vc-vault/src/contract.rs#L370), [`:423`](../contracts/vc-vault/src/contract.rs#L423)) |
| **El emisor no podía revocar** | `revoke` exige la firma del **dueño del vault** ([`:280-284`](https://github.com/ACTA-Team/contracts-acta/blob/282fe47/contracts/vc-vault/src/contract.rs#L280-L284)) | `revoke_by_issuer` ([`contract.rs:324`](../contracts/vc-vault/src/contract.rs#L324)): exige la firma de `get_vc(id).issuer` ([`:336`](../contracts/vc-vault/src/contract.rs#L336)) y funciona aunque el vault esté revocado. El titular sigue revocando con `revoke` ([`:307`](../contracts/vc-vault/src/contract.rs#L307)) |
| **No se podía leer si el vault estaba revocado** | `revoke_vault` marca el vault ([`:117`](https://github.com/ACTA-Team/contracts-acta/blob/282fe47/contracts/vc-vault/src/contract.rs#L117)), pero `verify_vc` no lo consulta ([`:164`](https://github.com/ACTA-Team/contracts-acta/blob/282fe47/contracts/vc-vault/src/contract.rs#L164)) y no había función para leerlo | `is_revoked()` ([`contract.rs:107`](../contracts/vc-vault/src/contract.rs#L107)) |

Además:
- **La versión sube a 0.5.0**, con el evento nuevo `VCRevokedByIssuer`.
- **El campo `issuance_contract` queda como estaba.** `issue` y `receive_push` siempre
  lo fijan a este vault, así que la rama de `verify_vc` que delega a otro contrato
  ([`contract.rs:183`](../contracts/vc-vault/src/contract.rs#L183)) es inalcanzable.
  Queda comentada en el código porque, si algún flujo futuro permitiera setearlo, esa
  rama devolvería lo que diga el otro contrato **sin leer `read_vc_status`**: se
  saltaría `revoke` y `revoke_by_issuer`, y el `is_valid` del gate pasa por ahí.
- **Tests:** 9 nuevos en `vc-vault` y 1 en `vc-vault-factory`.
  - Que `issue` y `batch_issue` guarden al emisor, y que `push` lo conserve.
  - Que `revoke_by_issuer` pida exactamente la firma del emisor, y que el dueño no
    pueda revocar como emisor.
  - Los errores al revocar algo inexistente, dos veces, o después de que lo revocó
    el titular.
  - `is_revoked`, y que el emisor pueda revocar dentro de un vault revocado.

**Lo que no cambia:** la emisión sigue abierta (cualquiera puede emitir en cualquier
vault, pagando la comisión). La diferencia es que ahora **se sabe quién fue**, y eso
basta para que un contrato decida en quién confía.

---

## 2. Un solo workspace en `soroban-sdk` 26.1

Los seis contratos están en `contracts/`, en un solo workspace. Los de ACTA venían
de la 23.4 y se subieron a la 26.1, porque `stellar-accounts` 0.7.2 (las smart
accounts de OpenZeppelin) exige `soroban-sdk ^26.1`.

| | Resultado |
|---|---|
| Código de los contratos de ACTA | **Compiló sin cambios** en la 26.1 |
| Tests | 11 líneas adaptadas: en la 26.1, `env.events().all()` devuelve `ContractEvents` (sin `.len()` ni `.get()`). Ahora los eventos se comparan completos, en XDR, con `Event::to_xdr` |
| `Cargo.lock` | Solo sumó las entradas de los tres contratos, sin cambiar ninguna versión |

El WASM del vault cambió, así que **ya no es el de mainnet**. El demo usa despliegues
nuevos en testnet (§4).

---

## 3. Stack

```toml
# contracts/Cargo.toml
[workspace.dependencies]
soroban-sdk      = "26.1.0"
stellar-accounts = "0.7.2"        # trait Policy y tipos de OpenZeppelin
```

- **Commitear `Cargo.lock`.** Resolver dependencias desde cero rompe
  `soroban-env-host` (`rand_core` incompatible); ya nos pasó al separar contratos en
  otro workspace.
- **Compilar el WASM del vault antes de los tests y de clippy:** los tests de la
  factory lo importan al compilar. El CI y `contracts/package.json` ya lo hacen.

---

## 4. Infraestructura

### Lo que hay que desplegar

| Pieza | Por qué |
|---|---|
| Template de `vc-vault` 0.5.0 + una `vc-vault-factory` construida con él | El vault cambió; la factory fija el hash del template al construirse |
| `vc-gate` y `credential-policy` | Son las piezas nuevas |

El `did-stellar-registry` no cambió: se puede reusar el 0.3.0 de testnet.

### Lo que se reusa (testnet)

| Pieza | Testnet |
|---|---|
| `did-stellar-registry` 0.3.0 (ACTA) | `CAJQFHGAJR5Q2NMGM7IYGM2KK6FLQXT634XZMGEYKKOYN2E2ONCFRSQK` |
| Smart account (una por wallet) | WASM `1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a` |
| Verificador WebAuthn (passkeys) | `CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F` |
| Verificador Ed25519 | `CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4` |
| Policy de umbral | `CB3FATQKCIRIQOCYRUPCQ2KREQ7T4RPKS7EAEOZWPEPUKWEDRVROBCEG` |
| USDC (Circle), SAC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |

Los despliegues del modelo original (vault 0.4.0, factory, comisiones) están de
referencia en [`deployments/`](deployments/). En mainnet, el registro es el 0.2.0, que
**no tiene `register_sponsored`**: ahí Marta tendría que firmar su cédula una vez.

**Compatibilidad con nuestra policy.** Los contratos de `smart-account-kit` se
compilaron con `soroban-sdk` 26.1.0 desde el commit `1e513890` de OpenZeppelin, que
no es exactamente `v0.7.2` (38 commits más, 2 menos). Lo comparamos: el trait
`Policy` y los tipos que recibe (`ContextRule`, `Signer`, `ContextRuleType`) son
idénticos. Una policy compilada contra `stellar-accounts` 0.7.2 funciona con esas
cuentas.

**El USDC** es el de Circle: el emisor tiene `home_domain` = `centre.io`, y ya lo
tienen unos 4.000 contratos, así que una smart account lo puede recibir.

---

## 5. `vc-gate`: cómo construirlo

### 5.1 Hablar con el vault

Como el vault está en el mismo workspace, **no hacen falta espejos escritos a mano**.
`vc-gate` importa el WASM del vault, igual que los tests de la factory, y obtiene el
cliente y los tipos (`VerifiableCredential` con `issuer`, `VCStatus`) siempre
sincronizados con el código real:

```rust
mod vc_vault {
    soroban_sdk::contractimport!(file = "../target/wasm32v1-none/release/vc_vault_contract.wasm");
}

#[contractclient(name = "VaultFactoryClient")]
pub trait VaultFactory { fn is_vault(e: Env, vault_address: Address) -> bool; }
```

- Exige compilar el WASM del vault antes de `vc-gate`. El CI ya lo hace.
- **No depender de `vc-vault-contract` como crate.** Un contrato enlazado como
  dependencia exporta sus funciones dentro del WASM de quien lo usa.
- **En `is_valid`, usar los métodos `try_`.** Así un vault archivado devuelve `false`
  en vez de abortar la transacción de quien llama.

### 5.2 `register`

```rust
pub fn register(e: Env, issuer: Address, vault: Address, vc_id: String,
                credential_type: String, claims: Map<String, String>) {
    issuer.require_auth();
    if !VaultFactoryClient::new(&e, &factory(&e)).is_vault(&vault) {
        panic_with_error!(&e, Error::NotAVault);
    }
    check_caps(&e, &credential_type, &claims);                  // tipo ≤ 64, ≤ 8 claims, valores ≤ 64

    let v = vc_vault::Client::new(&e, &vault);
    match v.get_vc(&vc_id) {
        Some(vc) if vc.issuer == issuer => {}                   // prueba on-chain de quién emitió
        _ => panic_with_error!(&e, Error::NotTheIssuer),
    }
    if v.verify_vc(&vc_id) != vc_vault::VCStatus::Valid || v.is_revoked() {
        panic_with_error!(&e, Error::CredentialNotValid);
    }
    let holder = v.vault_owner();
    let record = GateRecord { vault, vc_id, claims, registered_at: e.ledger().timestamp() };
    storage::write_record(&e, &holder, &issuer, &credential_type, &record);
    events::registered(&e, &holder, &issuer, &credential_type, &record);
}
```

- **Emitir y registrar son dos transacciones** (una transacción de Soroban hace una
  sola invocación): primero `vault.issue`, después `gate.register`. Las firma el
  mismo emisor; el backend de ACTA puede enviar las dos.
- Ya no hace falta que `vc-gate` emita en nombre del emisor ni que la firma cubra
  llamadas anidadas: el vault prueba solo quién emitió.

### 5.3 `is_valid`

```rust
pub fn is_valid(e: Env, holder: Address, issuer: Address, credential_type: String) -> bool {
    let Some(r) = storage::read_record(&e, &holder, &issuer, &credential_type) else { return false };
    let v = vc_vault::Client::new(&e, &r.vault);
    let valid = matches!(v.try_verify_vc(&r.vc_id), Ok(Ok(vc_vault::VCStatus::Valid)));
    let vault_ok = matches!(v.try_is_revoked(), Ok(Ok(false)));
    valid && vault_ok
}
```

- **`verify_vc` ya incluye las dos revocaciones:** la del titular (`revoke`) y la del
  emisor (`revoke_by_issuer`). No hay revocación duplicada en el gate.
- **No hace falta volver a comprobar `issuer` ni `vault_owner`:** el emisor de una
  credencial y el dueño de un vault no cambian nunca.
- `verify_vc` **extiende el TTL** de la credencial, o sea que escribe. Dentro de una
  transacción real cuesta un poco más; en una simulación no importa.

### 5.4 `check`: un solo salto para varios claims

`credential-policy` necesita validez **y** todos los claims. Con `is_valid` más un
`has_claim` por claim eran `1+N` llamadas cruzadas al gate, y cada una volvía a
llamar dos veces al vault (`try_verify_vc` + `try_is_revoked`): con 3 claims, 9
saltos y 3 extensiones de TTL redundantes, todo dentro de `__check_auth`, donde el
presupuesto de CPU es escaso.

```rust
pub fn check(e: Env, holder: Address, issuer: Address,
             credential_type: String, claims: Map<String, String>) -> bool {
    match storage::read_record(&e, &holder, &issuer, &credential_type) {
        // Compara los claims primero: un claim que no coincide no gasta el salto.
        Some(record) => {
            claims.iter().all(|(k, v)| record.claims.get(k) == Some(v))
                && vault_says_valid(&e, &record)
        }
        None => false,
    }
}
```

- **Un mapa vacío es `is_valid`:** `all` sobre nada es true.
- **`is_valid` y `has_claim` se quedan.** Son la ABI pública que puede usar cualquier
  otro contrato; `check` es aditivo.
- **`Requirement.claims` es un `Vec`,** así que puede traer la misma clave dos veces
  con valores distintos. Pasarlo a `Map` se quedaría con uno solo y perdería la otra
  exigencia, así que un requirement así falla cerrado con `MalformedRequirement`.

### 5.5 Decisiones de diseño

- **Clave `(holder, issuer, credential_type)`.** Un registro nuevo del mismo tipo
  reemplaza al anterior (por ejemplo, Silver → Gold). Si se necesitara más de una
  credencial vigente del mismo tipo, la clave tendría que incluir el `vc_id`.
- **Sin admin.** La factory de vaults queda fija en el constructor.
- **El gate no cachea validez.** Solo guarda dónde está la credencial y sus claims.

---

## 6. `credential-policy`: cómo construirla, y tres trampas

La policy implementa `stellar_accounts::policies::Policy`.

| Método | Para qué |
|---|---|
| `enforce(e, context, authenticated_signers, context_rule, smart_account)` | Se llama dentro de `__check_auth` de la cuenta. Hace panic para rechazar |
| `install(e, params, context_rule, smart_account)` | Guarda el `Requirement` por `(smart_account, rule.id)` |
| `uninstall(e, context_rule, smart_account)` | Lo borra |

Las tres trampas salieron del código de OpenZeppelin (`smart_account/storage.rs`,
función `do_check_auth`). Ninguna está en la documentación general, y las tres
dejarían a la tesorería pagarle a alguien sin credencial.

### Trampa 1 — una regla con policies no verifica sus firmantes

En `do_check_auth`, una regla **con** policies se salta el chequeo de "deben firmar
todos los firmantes" y le deja todo a las policies. Si `credential-policy` fuera la
única policy de una regla, **cualquiera podría mandar un pago sin ninguna firma**, y
pasaría siempre que el destinatario tenga credencial. Un contribuidor con credencial
podría vaciar la tesorería hacia sí mismo.

**Solución (dos capas):**
- `enforce` hace panic si `authenticated_signers.is_empty()`. Es exactamente lo que
  hace la policy `spending_limit` de OpenZeppelin.
- La regla también tiene que llevar la policy de umbral (k de n).

### Trampa 2 — el firmante elige qué regla se aplica

`AuthPayload.context_rule_ids` deja que el firmante elija la regla para cada
llamada, y una regla `Default` aplica a todo. Si la tesorería tiene cualquier regla
sin `credential-policy` que pueda autorizar un pago, el firmante simplemente elige
esa.

**Solución:** la tesorería tiene **una sola** regla, `Default`, con
`[umbral, credential-policy]`. `credential-policy` deja pasar las llamadas que no
son pagos (las llamadas administrativas de la propia cuenta), así que administrarla
sigue funcionando.

### Trampa 3 — `execute` esconde el `transfer`

Las smart accounts de OpenZeppelin tienen `execute(target, target_fn,
target_args)`. Autoriza la llamada **a la propia cuenta** y después llama al
contrato destino directamente. El `USDC.transfer(from = tesorería, …)` interno queda
autorizado porque lo invoca la propia cuenta, así que **ninguna policy ve nunca un
`transfer`**.

**Solución:** `enforce` abre las llamadas a `execute` y le aplica las mismas reglas
a la llamada interna.

```rust
fn enforce(e: &Env, context: Context, signers: Vec<Signer>, rule: ContextRule, account: Address) {
    account.require_auth();
    if signers.is_empty() { panic_with_error!(e, Error::NoSigners) }            // trampa 1

    let (fn_name, args) = match context {
        Context::Contract(c) if c.contract == account && c.fn_name == symbol_short!("execute") => {
            let f: Symbol = c.args.get(1).unwrap().into_val(e);               // trampa 3
            let a: Vec<Val> = c.args.get(2).unwrap().into_val(e);
            (f, a)
        }
        Context::Contract(c) => (c.fn_name, c.args),
        _ => return,                                                          // despliegues: no es un pago
    };

    if fn_name == symbol_short!("transfer") {
        let to = MuxedAddress::try_from_val(e, &args.get(1).unwrap()).unwrap().address();
        // Una sola llamada cruzada, con los claims que haga falta (§5.4).
        if !recipient_is_credentialed(e, &account, rule.id, &to) {
            panic_with_error!(e, Error::RecipientNotCredentialed)
        }
    } else if fn_name == symbol_short!("approve") {
        panic_with_error!(e, Error::AllowanceNotPermitted);  // un permiso + transfer_from saltaría el chequeo
    }
}
```

- **Destinatario muxed.** Desde el protocolo 23, el `transfer` del SAC recibe
  `to: MuxedAddress`. `MuxedAddress::try_from_val` acepta tanto una dirección normal
  como una muxed, y `.address()` devuelve la cuenta base (verificado en
  `soroban-sdk` 26.1, `muxed_address.rs` y `token.rs`).
- **Se revisa el `transfer` de cualquier token, no solo el de USDC.** Es el modo
  estricto, y el correcto para una tesorería que "solo le paga a quien tiene
  credencial".
- **`approve` se rechaza.** Si no, la tesorería podría dar un permiso, y el
  `transfer_from` del autorizado lo firmaría el autorizado, nunca la tesorería.
- **Un permiso anterior a la instalación es invisible.** Rechazar `approve` cierra el
  bypass hacia adelante, pero un `transfer_from` contra un permiso ya otorgado lo
  firma el autorizado: nunca pasa por el `__check_auth` de la tesorería. Es una
  precondición de despliegue (§7), no algo que `enforce` pueda ver.
- **`burn` pasa.** Cada `require_auth` sobre la tesorería genera su propio contexto,
  así que la policy sí ve el `transfer` que hace un contrato intermedio. Pero
  `burn(from = tesorería)` cae en el "cualquier otra: se permite": no le paga a
  nadie, aunque destruye fondos. Queda del lado de la gobernanza.
- **La policy limita los pagos, no la gobernanza.** Quien cumpla el umbral igual
  puede desinstalarla.

---

## 7. La tesorería

| Parámetro | Valor |
|---|---|
| Cuenta | Wallet de `smart-account-kit` (WASM `1b5f…`) |
| Firmante | Firmante externo **Ed25519** (verificador `CAAVTMCB…`), para que el backend del demo firme los pagos desde un script |
| Reglas | **Una**: `Default` → policies `{ umbral (1 de 1), credential-policy }` |
| Parámetros de `credential-policy` | `gate`, la dirección de GrantFox, `"ContributorBadge"`, `claims: [{ tier: Gold }]` |
| Fondos | USDC de testnet de Circle (`CBIELTK6…`) |
| Precondición | **Sin permisos (`approve`) vivos al instalar la policy.** Un `transfer_from` contra un permiso previo lo firma el autorizado y no pasa por el `__check_auth` de la tesorería. Cuenta nueva, o verificar que no haya ninguno |

---

## 8. Los flujos

### Marta (titular): sin ninguna transacción propia

1. **Wallet.** `kit.createWallet('ACTA', email)`: passkey más una smart account
   `C…`. Las comisiones las paga `deployerSecret` (una clave de testnet nuestra; solo
   en testnet, porque queda en el navegador) o el relayer proxy del kit.
2. **Vault.** ACTA llama a `vc-vault-factory.deploy_sponsored(ACTA, owner = su C…,
   did_uri, salt)` ([`factory contract.rs:216`](../contracts/vc-vault-factory/src/contract.rs#L216)).
   Paga ACTA; Marta no firma.
3. **Cédula.** ACTA llama a `register_sponsored` en el registro con `controller` = su
   `C…`. El registro exige al menos una llave de autenticación: se usa la de su
   passkey como Multikey.
   - El verificador de OpenZeppelin guarda las llaves P-256 **sin comprimir, de 65
     bytes**.
   - Multikey necesita la forma **comprimida de 33 bytes** (`0x02`/`0x03` según la
     paridad de y, más x), con el prefijo multicodec `p256-pub` (`0x80 0x24`) y
     codificada en base58btc (`z…`).

### GrantFox (emisor): dos transacciones

4. `vault.issue(vc_id, vc_data, vault, GrantFox, issuer_did)`. El vault cobra la
   comisión (XLM en testnet, USDC en mainnet) y guarda `issuer = GrantFox`.
5. `vc-gate.register(GrantFox, vault, vc_id, "ContributorBadge", { tier: "Gold" })`.

### El pago y la revocación

6. La tesorería paga a la `C…` de Marta. `credential-policy` pregunta
   `vc-gate.is_valid` y `has_claim(..., "tier", "Gold")`: el registro apunta a su
   vault, `verify_vc` da `Valid` y el vault no está revocado → pasa.
7. GrantFox llama a `vault.revoke_by_issuer(vc_id, fecha)` → `verify_vc` da
   `Revoked` → el siguiente pago rebota.

---

## 9. Spikes pendientes (antes del evento)

| # | Spike | Estado |
|---|---|---|
| PA | Desplegar en testnet el template de `vc-vault` 0.5.0 y una `vc-vault-factory` construida con él | **Abierto.** Es lo primero que necesita el demo |
| PB | `deploy_sponsored` con una smart account del kit como `owner`, y un `transfer` de USDC hacia esa `C…` | **Abierto** |
| P4 | Wallet con passkey en testnet (`createWallet` + `signAndSubmit` con `deployerSecret`) | **Casi resuelto.** La infraestructura está desplegada |
| P8 | Instalar `credential-policy` en la regla `Default` de una wallet del kit y pagar a través de ella, incluido vía `execute` | **Abierto.** Valida las tres trampas |

No hace falta un spike de autorización anidada: `vc-gate` no emite en nombre del
emisor.

---

## 10. Costos

Medidos con parámetros de mainnet (agosto de 2026, XLM = $0,172), de la evaluación
interna de costos de ACTA y de simulaciones en mainnet.

| Concepto | Costo | Por |
|---|---|---|
| Comisión de emisión | 1 USDC (mainnet) · 5 XLM (testnet) | Credencial |
| Renta de la credencial en el vault | ~$0,082/año (`vc_data` de 201 B) · ~$0,137/año (1 KB). El campo `issuer` suma unos pocos bytes | Credencial |
| `GateRecord` en `vc-gate` | A medir. Estimado: unos cientos de bytes, del orden de $0,02/año | Credencial usada en el gate |
| Renta del vault | ~$0,057/año | Persona |
| `did:stellar` | ~0,27 XLM/año (≈ $0,046) | Persona |

---

## 11. Qué existe y en qué nos diferenciamos

| Proyecto | Qué hace | Diferencia |
|---|---|---|
| Safeguard (`Safeguard-Inc/safeguard-contracts`) | Pagos protegidos por policies con allowlists, topes y reglas por jurisdicción | Las listas se mantienen a mano. ACTA Gate saca la "lista" de credenciales emitidas por los emisores, con revocación en vivo |
| Soroban-Identity (muchas copias) | DIDs y credenciales guardadas on-chain | Sin integración con smart accounts |
| POK | Credenciales como NFTs en wallets custodiadas (Polygon) | Ningún contrato puede verificar lo que certifican |

---

## Fuentes

- Contratos de ACTA en este repo: [`contracts/vc-vault/src/contract.rs`](../contracts/vc-vault/src/contract.rs), [`types/verifiable_credential.rs`](../contracts/vc-vault/src/types/verifiable_credential.rs), [`vc-vault-factory/src/contract.rs`](../contracts/vc-vault-factory/src/contract.rs). El original, en [`ACTA-Team/contracts-acta@282fe47`](https://github.com/ACTA-Team/contracts-acta/tree/282fe47)
- OpenZeppelin `stellar-contracts`: [v0.7.2](https://github.com/OpenZeppelin/stellar-contracts/tree/v0.7.2), [`smart_account/storage.rs` (`do_check_auth`)](https://github.com/OpenZeppelin/stellar-contracts/blob/v0.7.2/packages/accounts/src/smart_account/storage.rs), [`policies/spending_limit.rs`](https://github.com/OpenZeppelin/stellar-contracts/blob/v0.7.2/packages/accounts/src/policies/spending_limit.rs), [ejemplo multisig](https://github.com/OpenZeppelin/stellar-contracts/tree/v0.7.2/examples/multisig-smart-account)
- [`stellar/smart-account-kit`](https://github.com/stellar/smart-account-kit) y sus [despliegues en testnet y mainnet](https://github.com/stellar/smart-account-kit/blob/main/docs/deployments-protocol-27-2026-07-09.md)
- `soroban-sdk` 26.1 (`muxed_address.rs`, `token.rs`, `testutils.rs`), de crates.io
- [Safeguard contracts](https://github.com/Safeguard-Inc/safeguard-contracts) · [Soroban-Identity](https://github.com/Fayedamz/Soroban-Identity)
