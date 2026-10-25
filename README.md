# ACTA Gate

**Que cualquier contrato de Soroban pueda exigir una credencial verificable válida.**

HackMeridian 2026 · track Scale · sobre los contratos de vaults de
[ACTA](https://github.com/ACTA-Team) (`vc-vault`, `vc-vault-factory`,
`did-stellar-registry`), que ya están en mainnet.

- Idea y especificación: [`docs/IDEA ES.md`](docs/IDEA%20ES.md)
- Investigación de implementación: [`docs/IMPLEMENTATION ES.md`](docs/IMPLEMENTATION%20ES.md)

## Estructura

```
apps/
  web/                 Next.js 16: identidad con passkey, demo de la tesorería
  api/                 Express 5: emisión de las credenciales del demo (vía vc-gate),
                       firma de pagos de la tesorería
packages/
  shared/              Redes y IDs de contratos, compartidos por web y api
  typescript-config/   tsconfig base, node y nextjs
contracts/             Workspace de Cargo (soroban-sdk 26.1, stellar-accounts 0.7.2)
  vc-vault/            ACTA, modificado acá
  vc-vault-factory/    ACTA
  did-stellar-registry/  ACTA
  vc-gate/             Índice: de una dirección a su credencial y sus claims
  credential-policy/   Policy de la tesorería
  credential-vote/     Votación de contribuidores: el segundo contrato que consulta vc-gate
circuits/              Reservado para la fase ZK (Circom + Groth16 sobre BN254)
docs/
```

Turborepo orquesta todo, contratos incluidos: `contracts/package.json` envuelve a `cargo`.

## Requisitos

- Node 24 y pnpm 11
- Rust stable con el target `wasm32v1-none`
- stellar-cli **25.2 o más**. `stellar-accounts` 0.7.2 activa `experimental_spec_shaking_v2`, y
  `soroban-sdk` se niega a compilar a WASM con un CLI más viejo

## Comandos

```bash
pnpm install
pnpm dev                                   # web :3000 y api :4000
pnpm build                                 # todo, contratos incluidos
pnpm test
pnpm turbo run test --filter=@acta-gate/contracts
```

Variables de entorno: copiar `apps/api/.env.example` y `apps/web/.env.example` a `.env`.

## El demo

`pnpm dev` y abrir http://localhost:3000. La consola sigue los cinco pasos de
[`docs/IDEA ES.md`](docs/IDEA%20ES.md): Marta (titular), GrantFox (emisor) y la tesorería.

El backend tiene dos modos (`GATE_MODE` en `apps/api/.env`):

| Modo | Qué hace |
|---|---|
| `mock` (por defecto) | Corre en memoria las mismas reglas que `vc-vault` 0.5.0, `vc-gate` y `credential-policy`. Funciona hoy, sin contratos desplegados |
| `testnet` | Llama a los contratos desplegados con `contract.Client.from`. La tesorería paga con `smart-account-kit` y un firmante Ed25519. Necesita los spikes PA y P8 y todas las variables de `.env.example` |

| Endpoint | Paso |
|---|---|
| `POST /holders { address }` | 1. ACTA crea el vault de Marta (`deploy_sponsored`) |
| `POST /credentials { address, tier }` | 2. GrantFox emite (`issue`) y registra en `vc-gate` |
| `POST /payments { to, amount }` | 3 y 4. La tesorería paga; `credential-policy` decide |
| `POST /credentials/revoke { address }` | 5. GrantFox revoca en el vault (`revoke_by_issuer`) |
| `GET /holders/:address` · `GET /activity` · `GET /config` | Estado del vault y de `vc-gate`, log de actividad |
