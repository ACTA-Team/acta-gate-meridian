# ACTA Gate on testnet

Demo deployment, 2026-10-25. Network passphrase: `Test SDF Network ; September 2015`.

## Contracts

| Contract | ID / hash | Notes |
|---|---|---|
| `vc-vault` 0.5.0 (template) | WASM `856ec0922edba82196f6d9145ddb95a0fb972ffb18153b2e562a36658c02f0f1` | Records `issuer` and has `revoke_by_issuer` |
| `vc-vault-factory` | `CCPEKQVBJP5XK4WLJS3XOVJFH2Q2IQPJK4DAYKUS3NGMCGWMXUJU5TKU` | Built with the 0.5.0 template. Fees disabled |
| `vc-gate` | `CDNCAGEI3OCL5G6NL7UVKYR7Q34UPBGPO4SZB3YKOHCPKU5U33LN5UOD` | `vault_factory` = the factory above |
| `credential-policy` | `CBNICQYB5VOIWYPS4WF27OAKCKEALW54SYGFETN63UYF6537KCQZEH66` | |
| `did-stellar-registry` | `CCGVBGVF5V4L7N6QNHBZQLZ6LY7W6ZUFR4JCPWCUKATQWUFBX5TS3OWZ` | Unchanged code; the demo's own instance |
| `credential-vote` | `CAZUHZRKTGYD2DSIQCTKX5KO3HS4FI565D256HFY5YWAJGLD367GBEAN` | `requirement` = the gate above, GrantFox, `ContributorBadge`, `[{ tier: Gold }]` |

Verified with on-chain reads on 2026-10-25: `vc-gate.config().vault_factory` is the
factory in this table, and `credential-vote.requirement()` returns the gate in this table,
GrantFox (`GDNELPMT…D7ZD`), `ContributorBadge` and `[{ tier: Gold }]`. The IDs are also in
`packages/shared/src/index.ts` and in `apps/api/.env.example`.

### Previous deployment (replaced)

| Contract | ID / hash |
|---|---|
| `vc-vault` 0.5.0 (template) | WASM `7c5f8b1c5194d72281f4e6c79c8a93fd090fb236e330291f2dcfc816049855b4` |
| `vc-vault-factory` | `CCHI33MJAWFCLHLX6CLFAT32ERHMILF3LCUV4SYKWP3ASIBTPZNRDL3Y` |
| `vc-gate` | `CCQLGN7IOR4GSGDLLQ2SALMUWWQ67DGHV7WQUEDZDGTFIX3OIKA5HOU2` |
| `credential-policy` | `CAI3YAVSWX2GA5SX2KCAMHLOLHVOPZUL2MXQQNSIUFSRY2RBKKOJGIQR` |
| `did-stellar-registry` 0.3.0 (ACTA's, reused) | `CAJQFHGAJR5Q2NMGM7IYGM2KK6FLQXT634XZMGEYKKOYN2E2ONCFRSQK` |

## The treasury

| | |
|---|---|
| Smart account | `CD724INVERFLPXAULVMTMUUUEKLWF2YIGIJ7MC2J3XBYU35F3IAZ64NP` |
| Rule | One, `Default` (id 0): external Ed25519 signer + policies `{ threshold 1 of 1, credential-policy }` |
| Requirement | `gate` = `vc-gate`, `issuer` = GrantFox, `ContributorBadge`, `claims: [{ tier: Gold }]` |
| Funds | 200 Circle testnet USDC when deployed |

Deployed with `apps/api/scripts/deploy-smart-account.ts treasury`.

> **To be redone.** The treasury above still has the previous deployment's
> `credential-policy` installed, pointing at the previous `vc-gate`. The script has to
> run again with the new addresses so that the `Requirement` points at the gate in this
> table.

## The vote (`credential-vote`)

No admin and no upgrade: the requirement is fixed in the constructor, the same one as the
treasury's (`claims` is a `Vec<Claim>`, not a map). To deploy it again:

```bash
cd contracts
stellar contract build --package credential-vote
stellar contract deploy \
  --wasm target/wasm32v1-none/release/credential_vote.wasm \
  --source <ACTA account> --network testnet \
  -- --requirement '{
    "gate": "CDNCAGEI3OCL5G6NL7UVKYR7Q34UPBGPO4SZB3YKOHCPKU5U33LN5UOD",
    "issuer": "GDNELPMTURNICKCTPK3L5UAEKUSWSYFCDNGBTSFNWJNZNJMI2I7LD7ZD",
    "credential_type": "ContributorBadge",
    "claims": [{ "key": "tier", "value": "Gold" }]
  }'
```

The backend reads it from `CREDENTIAL_VOTE_ID`. `propose` and `vote` need the holder's
signature: the web asks for it with the passkey and the backend pays the fee.

## Accounts (public addresses only)

| Role | Address |
|---|---|
| ACTA (vault sponsor, pays fees) | `GDT4CHG5DFMVBW47OUWQJSGFBR5WATL5KSTHBIUAHIK7ZBCY66TICKEG` |
| GrantFox (issuer) | `GDNELPMTURNICKCTPK3L5UAEKUSWSYFCDNGBTSFNWJNZNJMI2I7LD7ZD` |
| The treasury's Ed25519 signer | `GDWWCQXC4T5F4BWKDYE3CK5ER3TOUCAB25YFKHQYXQTW6GY5MFHVIF7O` |
| Deployer of the passkey smart accounts (web) | `GA56DIMBD74DJ6I3EIBYW3T5HGO3XYZ2XVHPYKBSA7RASCZLRR3GVD2N` |

## Demo verified on-chain

> **To be redone.** The addresses and the transaction below belong to the previous
> deployment. The flow has to run again against the contracts in this document.

With a test smart account as the holder (`CAD475NI57SKXSFMEYMR67PF5WZD3GUMIWBCQGEG3H2O6CJNZBS5CSO7`):

1. Vault created by ACTA: `CBKNXFBIBLKZ3QC7SUECEFRSNBWFJKCTHR5G7BLXQW35L7MQSADM3MIQ`
2. GrantFox issues Gold and registers it in `vc-gate` → `is_valid = true`
3. The treasury pays 5 USDC → [tx](https://stellar.expert/explorer/testnet/tx/a80a0b6707a80da24551186c0bdc4f87feb08710d1d677ca54bab766b59e4b15)
4. Payment to an address without a credential → `RecipientNotCredentialed`
5. GrantFox revokes (`revoke_by_issuer`) → `is_valid = false` → the next payment, `RecipientNotCredentialed`

## Costs measured on testnet

| Operation | Cost |
|---|---|
| Create a vault (`deploy_sponsored`) | ~263 XLM. The vault extends the TTL of its instance (and its code) to ~180 days |
| Issue + register in `vc-gate` | ~3.6 XLM |
