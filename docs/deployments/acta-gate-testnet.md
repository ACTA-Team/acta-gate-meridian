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
| `credential-vote` | `CBHPFHOBDDDHP2PFVWGSFOI4THVPQF5I5RZMHCSBZ362FYWJYZ4RWNSE` | WASM `a41a51c12d3603bbecb3db63e44eed7a4812eb6df609986ce22118eec1185ea6`. `requirement` = the gate above, GrantFox (`GC7INDGA…EFA6`), `ContributorBadge`, `[{ tier: Gold }]`. [tx](https://stellar.expert/explorer/testnet/tx/8f50d6d8e5c7797d1e6b00dadda272a063ac1924bc9c29271a6f3b6fed7d06dc) |

Verified with on-chain reads on 2026-10-25: `vc-gate.config().vault_factory` is the
factory in this table, `credential-vote.requirement()` returns the gate in this table,
GrantFox (`GC7INDGA…EFA6`), `ContributorBadge` and `[{ tier: Gold }]`, and the treasury's
`credential-policy.get_requirement(treasury, 0)` returns the same requirement. The IDs are also in
`packages/shared/src/index.ts` and in `apps/api/.env.example`.

### Previous deployment (replaced)

| Contract | ID / hash |
|---|---|
| `vc-vault` 0.5.0 (template) | WASM `7c5f8b1c5194d72281f4e6c79c8a93fd090fb236e330291f2dcfc816049855b4` |
| `vc-vault-factory` | `CCHI33MJAWFCLHLX6CLFAT32ERHMILF3LCUV4SYKWP3ASIBTPZNRDL3Y` |
| `vc-gate` | `CCQLGN7IOR4GSGDLLQ2SALMUWWQ67DGHV7WQUEDZDGTFIX3OIKA5HOU2` |
| `credential-policy` | `CAI3YAVSWX2GA5SX2KCAMHLOLHVOPZUL2MXQQNSIUFSRY2RBKKOJGIQR` |
| `did-stellar-registry` 0.3.0 (ACTA's, reused) | `CAJQFHGAJR5Q2NMGM7IYGM2KK6FLQXT634XZMGEYKKOYN2E2ONCFRSQK` |
| `credential-vote`, trusting the previous GrantFox (`GDNELPMT…D7ZD`), whose key the demo does not have | `CAZUHZRKTGYD2DSIQCTKX5KO3HS4FI565D256HFY5YWAJGLD367GBEAN` |
| Treasury, with the previous `credential-policy` | `CD724INVERFLPXAULVMTMUUUEKLWF2YIGIJ7MC2J3XBYU35F3IAZ64NP` |

## The treasury

| | |
|---|---|
| Smart account | `CCJACTUKEMDSICCWLUFF4GWLD3H2KZRWXUTUC7342JZ7FNDGHMYXYHIJ` ([tx](https://stellar.expert/explorer/testnet/tx/246d3db27d94f84e1d6055b69cfa86a0d2ef4be0d4461d0f454b47c4d55a7d89)) |
| Rule | One, `Default` (id 0): external Ed25519 signer + policies `{ threshold 1 of 1, credential-policy }` |
| Requirement | `gate` = `vc-gate`, `issuer` = GrantFox (`GC7INDGA…EFA6`), `ContributorBadge`, `claims: [{ tier: Gold }]` (verified on-chain) |
| Funds | 200 Circle testnet USDC, bought on the testnet DEX for ~230 XLM ([tx](https://stellar.expert/explorer/testnet/tx/5074a918457e9d160b553fcfd9cbe2c609090c7312b42dffa22a4ec85378aeb0)) |

Deployed with `apps/api/scripts/deploy-smart-account.ts treasury`.

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
    "issuer": "GC7INDGAMCG522TIOWRH7TPVENROPFROKOXWYAFEFQCAFZNA2U2EEFA6",
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
| GrantFox (issuer) | `GC7INDGAMCG522TIOWRH7TPVENROPFROKOXWYAFEFQCAFZNA2U2EEFA6` |
| GrantFox, previous (its key is not available to the demo) | `GDNELPMTURNICKCTPK3L5UAEKUSWSYFCDNGBTSFNWJNZNJMI2I7LD7ZD` |
| The treasury's Ed25519 signer | `GDWWCQXC4T5F4BWKDYE3CK5ER3TOUCAB25YFKHQYXQTW6GY5MFHVIF7O` |
| Deployer of the passkey smart accounts (web) | `GA56DIMBD74DJ6I3EIBYW3T5HGO3XYZ2XVHPYKBSA7RASCZLRR3GVD2N` |
| Deployer of the passkey smart accounts (web, a second one funded by friendbot on 2026-10-25) | `GC662RXLB3UPX76ITPJGMM4HTQTY6YCCPGYSY5L3CWEGRKIADAJYHWLA` |
| Sponsor of vaults and DIDs, fee payer (a second one, 2026-10-25) | `GAVCFGDUIOIKK3BH7ECG45M5QZQH46P3CCBLUPAX5MJCFBOFDQSA5VP4` |
| Ed25519 signer for the new treasury (2026-10-25) | `GAT3IATJNNJD44UVBD32LCUJAHV7MHNIA4H7OSQ2PMSD42D265WAGBR7` |

## Demo verified on-chain

On 2026-10-25, through the API, against the contracts in this document. The holder is a
test smart account with an Ed25519 signer (`deploy-smart-account.ts plain`), so the DID
step, which needs a passkey, is skipped:

1. Holder `CD33COZJMLCR7CYXJZIN7UBMO3IZXP6HLE47WTNE7G7UXKABLDCXUFYF`; vault created by ACTA:
   `CCQ6GYWMRUFVRJRE363YVNXQHOX6IBJUKQHBM5FTEU4K6FMBAIFU43QZ`
2. GrantFox issues Gold and registers it in `vc-gate` → `is_valid = true`, `can_vote = true`
   ([tx](https://stellar.expert/explorer/testnet/tx/0b58882e1e8b8bc9c1c7e44caab2c6b592d3416bd850f920a697fe01d7e9599b))
3. The treasury pays the holder 5 USDC → paid ([tx](https://stellar.expert/explorer/testnet/tx/25d68ea2464686ce0b89f6bfa700fd3807c1daaf7c9b210762f5bef9496b456d))
4. Payment to an address without a credential → `RecipientNotCredentialed`
5. GrantFox revokes (`revoke_by_issuer`) → `is_valid = false`, `can_vote = false`
   ([tx](https://stellar.expert/explorer/testnet/tx/b7919b03589f7d4bc06b114810ec139839b9d9fdb766fec1c20def1cd6f94fe0)) → the next payment,
   `RecipientNotCredentialed`

Not verified yet: proposing and voting, which need a passkey signature from the browser.

## Proposal and vote verified on-chain (passkey)

To be filled from the browser against the `credential-vote` in this document: the same
holder as the demo, signing with her passkey, so the title's claim closes on chain: one
credential, two gates, one revocation.

| Step | Tx |
|---|---|
| Marta proposes (`propose`, signed with her passkey) | TODO: stellar.expert link |
| Marta votes (`vote`, signed with her passkey) | TODO: stellar.expert link |
| An address without a credential tries to vote → `NotCredentialed` | TODO: stellar.expert link (or the simulation error) |
| GrantFox revokes (`revoke_by_issuer`) → Marta's next vote → `NotCredentialed` | TODO: stellar.expert link |

## Costs measured on testnet

| Operation | Cost |
|---|---|
| Create a vault (`deploy_sponsored`) | ~263 XLM. The vault extends the TTL of its instance (and its code) to ~180 days |
| Issue + register in `vc-gate` | ~3.6 XLM |
