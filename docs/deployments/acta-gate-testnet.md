# ACTA Gate en testnet

Despliegue del demo, 2026-10-25. Network passphrase: `Test SDF Network ; September 2015`.

## Contratos

| Contrato | ID / hash | Notas |
|---|---|---|
| `vc-vault` 0.5.0 (template) | WASM `856ec0922edba82196f6d9145ddb95a0fb972ffb18153b2e562a36658c02f0f1` | Guarda `issuer` y tiene `revoke_by_issuer` |
| `vc-vault-factory` | `CCPEKQVBJP5XK4WLJS3XOVJFH2Q2IQPJK4DAYKUS3NGMCGWMXUJU5TKU` | Construida con el template 0.5.0. Comisiones desactivadas |
| `vc-gate` | `CDNCAGEI3OCL5G6NL7UVKYR7Q34UPBGPO4SZB3YKOHCPKU5U33LN5UOD` | `vault_factory` = la factory de arriba |
| `credential-policy` | `CBNICQYB5VOIWYPS4WF27OAKCKEALW54SYGFETN63UYF6537KCQZEH66` | |
| `did-stellar-registry` | `CCGVBGVF5V4L7N6QNHBZQLZ6LY7W6ZUFR4JCPWCUKATQWUFBX5TS3OWZ` | Código sin cambios; instancia propia del demo |

## La tesorería

| | |
|---|---|
| Smart account | `CD724INVERFLPXAULVMTMUUUEKLWF2YIGIJ7MC2J3XBYU35F3IAZ64NP` |
| Regla | Una, `Default` (id 0): firmante Ed25519 externo + policies `{ umbral 1 de 1, credential-policy }` |
| Requirement | `gate` = `vc-gate`, `issuer` = GrantFox, `ContributorBadge`, `claims: [{ tier: Gold }]` |
| Fondos | 200 USDC de testnet de Circle al desplegarse |

Se despliega con `apps/api/scripts/deploy-smart-account.ts treasury`.

> **Pendiente de rehacer.** La tesorería de arriba todavía tiene instalada la
> `credential-policy` del despliegue anterior, apuntando al `vc-gate` anterior.
> Hay que volver a correr el script con las direcciones nuevas para que el
> `Requirement` apunte al gate de esta tabla.

## Cuentas (solo direcciones públicas)

| Rol | Dirección |
|---|---|
| ACTA (sponsor de vaults, paga comisiones) | `GDT4CHG5DFMVBW47OUWQJSGFBR5WATL5KSTHBIUAHIK7ZBCY66TICKEG` |
| GrantFox (emisor) | `GDNELPMTURNICKCTPK3L5UAEKUSWSYFCDNGBTSFNWJNZNJMI2I7LD7ZD` |
| Firmante Ed25519 de la tesorería | `GDWWCQXC4T5F4BWKDYE3CK5ER3TOUCAB25YFKHQYXQTW6GY5MFHVIF7O` |
| Deployer de las smart accounts con passkey (web) | `GA56DIMBD74DJ6I3EIBYW3T5HGO3XYZ2XVHPYKBSA7RASCZLRR3GVD2N` |

## Demo verificado on-chain

> **Pendiente de rehacer.** Las direcciones y la transacción de abajo son del
> despliegue anterior. Hay que volver a correr el flujo contra los contratos de
> este documento.

Con una smart account de prueba como titular (`CAD475NI57SKXSFMEYMR67PF5WZD3GUMIWBCQGEG3H2O6CJNZBS5CSO7`):

1. Vault creado por ACTA: `CBKNXFBIBLKZ3QC7SUECEFRSNBWFJKCTHR5G7BLXQW35L7MQSADM3MIQ`
2. GrantFox emite Gold y registra en `vc-gate` → `is_valid = true`
3. La tesorería le paga 5 USDC → [tx](https://stellar.expert/explorer/testnet/tx/a80a0b6707a80da24551186c0bdc4f87feb08710d1d677ca54bab766b59e4b15)
4. Pago a una dirección sin credencial → `RecipientNotCredentialed`
5. GrantFox revoca (`revoke_by_issuer`) → `is_valid = false` → el siguiente pago, `RecipientNotCredentialed`

## Costos medidos en testnet

| Operación | Costo |
|---|---|
| Crear un vault (`deploy_sponsored`) | ~263 XLM. El vault extiende el TTL de su instancia (y de su código) a ~180 días |
| Emitir + registrar en `vc-gate` | ~3,6 XLM |
