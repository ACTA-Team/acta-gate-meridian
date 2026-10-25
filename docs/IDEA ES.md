# ACTA Gate

**Que cualquier contrato de Soroban pueda exigir una credencial verificable válida.**

Construido en HackMeridian 2026 · track Scale · sobre los contratos de vaults de ACTA
(`vc-vault`, `vc-vault-factory`, `did-stellar-registry`), copiados en
[`contracts/`](../contracts/README.md) y modificados para el gate.

---

## El problema

Hoy en Stellar, una credencial es algo que una persona *muestra*: un PDF, un QR, un
link que revisa una persona o un servicio off-chain. Los contratos no la pueden
leer.

Entonces, cuando una app on-chain necesita saber *"¿esta dirección es un
contribuidor / egresado / miembro verificado?"*, mantiene su propia allowlist, a
mano, a cargo de un admin. Esa allowlist queda desactualizada apenas se revoca una
credencial, y cada app la arma desde cero.

## Qué hace ACTA Gate

ACTA Gate convierte una credencial guardada en un vault de ACTA en algo que un
contrato puede verificar, con la revocación aplicada en vivo.

1. **`vc-vault` (modificado)**: el vault ahora guarda **quién emitió** cada
   credencial y deja que **el emisor la revoque**. Es la fuente de verdad.
2. **`vc-gate`**: un índice para contratos. Cuando la tesorería le va a pagar a una
   dirección, `vc-gate` sabe en qué vault está su credencial y qué claims públicos
   tiene (por ejemplo, tier Gold). Cada consulta vuelve a preguntarle al vault.
3. **`credential-policy`**: una policy para [smart accounts de OpenZeppelin](https://docs.openzeppelin.com/stellar-contracts/accounts/smart-account).
   Instalada en una tesorería, hace que esa tesorería solo pueda pagarle a
   direcciones con una credencial válida.
4. **El titular con passkey**: la dueña del vault es una smart account con Face ID.
   Su vault y su `did:stellar` son la cédula que ya promete el modelo de ACTA. ACTA
   los crea por ella (`deploy_sponsored`, `register_sponsored`): no firma, no paga,
   no necesita XLM.

### Qué le cambiamos al vault

El vault original guardaba la credencial y sabía de quién era, pero le faltaban dos
cosas para que un contrato pudiera confiar en ella:

| Faltaba | Antes (`vc-vault` 0.4.0) | Ahora (0.5.0) |
|---|---|---|
| **Saber quién la emitió** | `issue` exigía la firma del emisor, pero **solo guardaba `issuer_did`**, un texto que el emisor declara. Cualquiera podía guardar en su vault una credencial que dijera ser de GrantFox | Cada credencial guarda **`issuer`**: la dirección que firmó la emisión. Se conserva si la credencial se mueve a otro vault (`push`) |
| **Que el emisor pueda revocar** | `revoke` exigía la firma del **dueño del vault**, es decir, del titular | **`revoke_by_issuer`**: solo la puede llamar el `issuer` de esa credencial |
| **Ver si el vault está revocado** | `verify_vc` ignoraba `revoke_vault`, y no había forma de leerlo | **`is_revoked()`** |

### Por qué sigue existiendo `vc-gate`

Cuando la tesorería paga, la policy solo conoce **la dirección** de Marta, no su
vault ni el id de su credencial. Alguien tiene que traducir "dirección → vault →
credencial de GrantFox del tipo X", y además guardar los claims públicos que el gate
necesita. El `vc_data` del vault puede ir cifrado, así que esos claims no se pueden
leer de ahí. Eso es `vc-gate`: un índice, **no una segunda fuente de verdad**.

### El demo

Una tesorería de GrantFox les paga en USDC a contribuidores de open source, pero
solo a los que tienen una credencial "Contributor Gold" válida.

| Paso | Qué pasa |
|---|---|
| 1 | Marta crea su wallet con Face ID. ACTA le crea su vault y su `did:stellar` |
| 2 | GrantFox le emite una credencial Contributor Gold en su vault, y la registra en `vc-gate` con `tier: Gold` |
| 3 | La tesorería le paga a Marta → **pasa** |
| 4 | La tesorería le paga a una dirección sin credencial → **la policy lo rechaza** |
| 5 | GrantFox revoca la credencial de Marta en su vault (`revoke_by_issuer`) → el siguiente pago **se rechaza** |

Nadie actualizó una allowlist. La revocación llegó sola a un contrato ajeno.

**Marta no hace ninguna transacción.** La credencial está en su vault, y el vault ya
dice que es de ella.

---

## Arquitectura

```
                       ACTA (en contracts/)                         ACTA Gate (nuevo)
  ┌──────────────────────────────────────────┐
  │ vc-vault-factory                         │◄── is_vault? ───────┐
  │   un vault por titular                   │                     │
  └──────────────────────────────────────────┘                     │
  ┌──────────────────────────────────────────┐           ┌─────────┴─────────┐
  │ vc-vault de Marta (0.5.0)                │◄─ lee ────│     vc-gate       │◄── GrantFox
  │   vault_owner() → su smart account       │           │  register()       │    (registra)
  │   get_vc(id).issuer → quién la emitió    │           │  is_valid()       │
  │   verify_vc(id) → Valid / Revoked        │           │  has_claim()      │
  │   revoke_by_issuer(id) ◄── GrantFox      │           └─────────▲─────────┘
  │   is_revoked()                           │                     │ is_valid?
  └──────────────────────────────────────────┘           ┌─────────┴─────────┐
  ┌──────────────────────────────────────────┐           │ credential-policy │
  │ did-stellar-registry                     │           │  (Policy de OZ)   │
  │   did:stellar de Marta                   │           └─────────▲─────────┘
  └──────────────────▲───────────────────────┘                     │ enforce()
                     │ controller                 Tesorería de GrantFox (smart account de OZ)
  Smart account con passkey de Marta              una sola regla Default: umbral + credential-policy
  (dueña del vault)
```

---

## Contrato: `vc-gate`

**Sin admin ni upgrade.** Su única dependencia (la factory de vaults) queda fija en
el constructor.

```rust
__constructor(vault_factory: Address)
```

### ABI

| Función | Auth | Para qué |
|---|---|---|
| `register(issuer, vault, vc_id, credential_type, claims)` | `issuer` | Vincula una credencial que el emisor ya emitió, con sus claims públicos |
| `is_valid(holder, issuer, credential_type)` | — | `bool` |
| `has_claim(holder, issuer, credential_type, key, value)` | — | `bool` |
| `check(holder, issuer, credential_type, claims)` | — | `bool`: `is_valid` más todos los claims, en una sola llamada |
| `get_record(holder, issuer, credential_type)` | — | `Option<GateRecord>` |

`vc-gate` no tiene `revoke`: el emisor revoca en el vault, y el gate lo ve en la
siguiente consulta.

### `register`: qué se verifica, en orden

```
 1. issuer.require_auth()
 2. vault_factory.is_vault(vault)                          si no, NotAVault
 3. credential_type ≤ 64 bytes; claims ≤ 8 entradas,
    cada valor ≤ 64 bytes                                  si no, InputTooLong
 4. vault.get_vc(vc_id).issuer == issuer                   si no, NotTheIssuer
 5. vault.verify_vc(vc_id) == Valid y !vault.is_revoked()  si no, CredentialNotValid
 6. holder = vault.vault_owner()
 7. guardar GateRecord en (holder, issuer, credential_type); emitir Registered
```

**El paso 4 es la clave.** El vault ahora guarda la dirección que firmó la emisión,
así que `vc-gate` puede comprobar on-chain que quien registra es de verdad el
emisor. Nadie puede registrar una credencial ajena con claims inventados.

### `is_valid`: se vuelve a verificar en cada llamada

```
r = record(holder, issuer, credential_type)        si no existe, false
r.vault.verify_vc(r.vc_id) == Valid                (revocación del titular y del emisor)
!r.vault.is_revoked()                              (el vault entero)
```

`has_claim` es `is_valid` más `r.claims[key] == value`. `check` es `is_valid` más
todos los claims que le pasen de una vez, para que quien necesita varios no pague una
llamada cruzada por cada uno: es lo que usa `credential-policy`.

### Tipos y almacenamiento

```rust
pub struct GateRecord {
    pub vault: Address,
    pub vc_id: String,
    pub claims: Map<String, String>,    // p. ej. { "tier": "Gold" }
    pub registered_at: u64,
}
```

| Clave | Tipo | Contenido |
|---|---|---|
| `Config` | instance | La factory de vaults, fija en el constructor |
| `Record(holder, issuer, credential_type)` | persistent | `GateRecord`. Un registro nuevo del mismo tipo reemplaza al anterior (por ejemplo, Silver → Gold) |

### Errores

| Código | Nombre | Cuándo |
|---:|---|---|
| 1 | `NotAVault` | El vault no lo desplegó la factory de ACTA |
| 2 | `InputTooLong` | Tipo, claims o valores por encima de los topes |
| 3 | `NotTheIssuer` | La credencial no existe en el vault, o su `issuer` es otro |
| 4 | `CredentialNotValid` | La credencial o el vault están revocados |

### Eventos

`Registered { holder, issuer, credential_type, vault, vc_id }`

---

## Contrato: `credential-policy`

Una implementación del trait `Policy` de OpenZeppelin (`stellar-accounts` 0.7.2).

### Parámetros de instalación

```rust
pub struct Claim { pub key: String, pub value: String }

pub struct Requirement {
    pub gate: Address,               // vc-gate
    pub issuer: Address,             // el emisor cuyas credenciales cuentan (GrantFox)
    pub credential_type: String,     // p. ej. "ContributorBadge"
    pub claims: Vec<Claim>,          // tienen que coincidir todos, p. ej. [{ tier: Gold }]
}
```

Si `claims` está vacío, sirve cualquier credencial válida de ese tipo. Se guarda por
`(smart_account, context_rule_id)`, como exige OpenZeppelin para policies
compartidas entre cuentas. Dos claims con la misma clave se contradicen: `enforce`
falla cerrado con `MalformedRequirement`.

### `enforce`

```
smart_account.require_auth()
authenticated_signers no está vacío                             si no, NoSigners
(fn, args) = la llamada que se autoriza; si es execute(target, target_fn,
             target_args) de la propia cuenta, se usa (target_fn, target_args)
fn == "transfer":
    recipient = args[1]               (un MuxedAddress se resuelve a su cuenta base)
    ok = gate.check(recipient, issuer, type, claims)      (una sola llamada cruzada)
    ok                                                          si no, RecipientNotCredentialed
fn == "approve":                                                     AllowanceNotPermitted
transfer o execute con argumentos que no se pueden leer:              MalformedCall
claims con la misma clave dos veces:                                  MalformedRequirement
cualquier otra: se permite        (las llamadas administrativas de la cuenta siguen funcionando)
```

### Configuración de la tesorería

La policy es tan fuerte como la regla en la que está. Tres cosas del `do_check_auth`
de OpenZeppelin lo hacen concreto:

| Trampa | Por qué | Configuración necesaria |
|---|---|---|
| Una regla con policies no verifica sus firmantes | Le delega a las policies el chequeo de firmantes | `enforce` rechaza un conjunto de firmantes vacío, **y** la misma regla lleva la policy de umbral (k de n) |
| El firmante elige qué regla se aplica | `AuthPayload.context_rule_ids`; `Default` aplica a toda llamada | La tesorería tiene **una** regla: `Default` → `{ umbral, credential-policy }` |
| `execute` esconde el `transfer` | El `transfer` interno lo autoriza el invocador, nunca `__check_auth` | `enforce` abre `execute` y revisa la llamada interna |

- **Se revisa el `transfer` de cualquier token**, no solo el de USDC.
- **`approve` se rechaza.** Si no, un permiso seguido de `transfer_from` se saltaría
  el chequeo.
- **Instalarla sobre una cuenta sin permisos vivos.** Rechazar `approve` cierra el
  bypass hacia adelante, pero un permiso otorgado *antes* de instalar la policy no
  pasa por el `__check_auth` de la tesorería: el `transfer_from` lo firma el
  autorizado. Cuenta nueva, o verificar que no haya ninguno.
- **`burn` pasa.** No le paga a nadie, así que no es un pago sin credencial, pero
  destruye fondos. Queda del lado de la gobernanza, igual que desinstalar la policy.
- **La policy limita los pagos, no la gobernanza.** Quien cumpla el umbral puede
  desinstalarla.

Notas de implementación y evidencia: [`IMPLEMENTATION ES.md`](IMPLEMENTATION%20ES.md).

---

## Modelo de seguridad

| Propiedad | Cómo |
|---|---|
| La credencial es auténtica | El vault guarda en `issuer` la dirección que firmó la emisión; `vc-gate` lo comprueba al registrar |
| El vault es legítimo | `vault_factory.is_vault(vault)`: lo desplegó la factory de ACTA |
| Es de quien la presenta | La credencial está en un vault cuyo `vault_owner` es el destinatario del pago. Ese dueño no cambia nunca |
| La revocación es inmediata | `is_valid` lee en cada llamada el `verify_vc` y el `is_revoked` del vault; no hay caché |
| Sin llaves de admin | `vc-gate` no tiene admin ni forma de actualizarse |

**Supuesto de confianza:** quien configura la policy sabe cuál es la dirección del
emisor (por ejemplo, la de GrantFox). El `did:stellar` del emisor sirve para
mostrarlo, no para decidir.

**Qué queda público:** solo los claims que el emisor registra en `vc-gate` (como
`tier: Gold`). **El `vc_data` del vault puede seguir cifrado**, como ya hace ACTA.

---

## Costo

Medido con parámetros de mainnet (agosto de 2026, XLM = $0,172).

| Concepto | Costo | Cuándo |
|---|---|---|
| Comisión de emisión del vault | 1 USDC en mainnet · 5 XLM en testnet (la configura la factory) | Por credencial |
| Renta de la credencial en el vault | ~$0,082/año (`vc_data` de 201 B) · ~$0,137/año (1 KB) | Por credencial |
| Registro en `vc-gate` | *se mide en el evento* | Por credencial usada en el gate |
| Vault del titular | ~$0,057/año de renta (+ el despliegue, una vez) | Por persona |
| `did:stellar` del titular | ~0,27 XLM/año (≈ $0,046) | Por persona |

---

## Cómo correrlo

> Se completa en el evento.

```bash
pnpm install
pnpm turbo run test --filter=@acta-gate/contracts   # los cinco contratos
pnpm dev                                           # web :3000 y api :4000
```

Detalle de los contratos y de cómo probarlos: [`contracts/README.md`](../contracts/README.md).

**Stack:** `soroban-sdk` 26.1 en todo el workspace · OpenZeppelin `stellar-accounts`
0.7.2 · `smart-account-kit`.

## Despliegues

El vault modificado es un contrato nuevo: el demo usa despliegues nuevos en testnet
(factory con el template del vault 0.5.0). Los despliegues del modelo original, de
referencia, están en [`deployments/`](deployments/).

| Contrato | Testnet |
|---|---|
| `vc-vault` 0.5.0 (template) + `vc-vault-factory` | *antes o en el evento* |
| `vc-gate` | *en el evento* |
| `credential-policy` | *en el evento* |

---

## Limitaciones

- **Si el titular mueve la credencial a otro de sus vaults (`push`)**, el registro
  del gate queda apuntando al vault anterior y `is_valid` da false hasta que el
  emisor vuelva a llamar `register`. **El contrato no necesita nada nuevo:** `push`
  es owner-scoped (`receive_push` rechaza con `PushOwnerMismatch` si el dueño del
  destino es otro), así que `vault_owner` no cambia, la clave
  `(holder, issuer, credential_type)` es la misma y el registro se reemplaza. Falta
  la plomería del backend que detecte el push y vuelva a registrar.
- **Las revocaciones viven en el vault**, que es lo correcto, pero una credencial
  que no está registrada en `vc-gate` no existe para el gate.

## Roadmap

- **Detectar un `push` y volver a registrar** desde el backend; el contrato ya lo soporta (ver Limitaciones).
- **Llevar los cambios del vault al repo público** de ACTA, y desplegarlos en mainnet.
- **Pasar al modelo Merkle** cuando se lance: el gate mantiene la misma interfaz
  (`is_valid`, `has_claim`) y solo cambia de dónde lee.
- **Divulgación selectiva con conocimiento cero** (X-Ray, Protocol 25).
- **Expiración** de credenciales.
- **Agentes de IA:** credenciales para agentes, verificadas antes de un pago x402.
