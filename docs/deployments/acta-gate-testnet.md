# ACTA Gate en testnet

Despliegue del demo, 2026-10-25. Network passphrase: `Test SDF Network ; September 2015`.

## Contratos

| Contrato | ID / hash | Notas |
|---|---|---|
| `vc-vault` 0.5.0 (template) | WASM `7c5f8b1c5194d72281f4e6c79c8a93fd090fb236e330291f2dcfc816049855b4` | Guarda `issuer` y tiene `revoke_by_issuer` |
| `vc-vault-factory` | `CCHI33MJAWFCLHLX6CLFAT32ERHMILF3LCUV4SYKWP3ASIBTPZNRDL3Y` | Construida con el template 0.5.0. Comisiones desactivadas |
| `vc-gate` | `CCQLGN7IOR4GSGDLLQ2SALMUWWQ67DGHV7WQUEDZDGTFIX3OIKA5HOU2` | `vault_factory` = la factory de arriba |
| `credential-policy` | `CAI3YAVSWX2GA5SX2KCAMHLOLHVOPZUL2MXQQNSIUFSRY2RBKKOJGIQR` | |

## La tesorería

| | |
|---|---|
| Smart account | `CD724INVERFLPXAULVMTMUUUEKLWF2YIGIJ7MC2J3XBYU35F3IAZ64NP` |
| Regla | Una, `Default` (id 0): firmante Ed25519 externo + policies `{ umbral 1 de 1, credential-policy }` |
| Requirement | `gate` = `vc-gate`, `issuer` = GrantFox, `ContributorBadge`, `claims: [{ tier: Gold }]` |
| Fondos | 200 USDC de testnet de Circle al desplegarse |

Se despliega con `apps/api/scripts/deploy-smart-account.ts treasury`.

## Cuentas (solo direcciones públicas)

| Rol | Dirección |
|---|---|
| ACTA (sponsor de vaults, paga comisiones) | `GDT4CHG5DFMVBW47OUWQJSGFBR5WATL5KSTHBIUAHIK7ZBCY66TICKEG` |
| GrantFox (emisor) | `GDNELPMTURNICKCTPK3L5UAEKUSWSYFCDNGBTSFNWJNZNJMI2I7LD7ZD` |
| Firmante Ed25519 de la tesorería | `GDWWCQXC4T5F4BWKDYE3CK5ER3TOUCAB25YFKHQYXQTW6GY5MFHVIF7O` |
| Deployer de las smart accounts con passkey (web) | `GA56DIMBD74DJ6I3EIBYW3T5HGO3XYZ2XVHPYKBSA7RASCZLRR3GVD2N` |

## Demo verificado on-chain

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
