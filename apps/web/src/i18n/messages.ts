import type { ActivityEvent, ActivityKind } from "@acta-gate/shared";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-6)}`;

/** `credentialType` and `tier` as the hero and the panels mention them. */
interface Requirement {
  credentialType: string;
  tier: string;
}

type ActivityText = (e: ActivityEvent) => { title: string; detail: string };

/** Spanish is the source: every other locale has the same shape. */
export const es = {
  meta: {
    eyebrow: "HackMeridian 2026 · Track Scale",
    headlineLead: "Que cualquier contrato pueda exigir una credencial",
    headlineAccent: "válida.",
    intro: (issuer: string, r: Requirement) => ({
      before: `La tesorería de ${issuer} solo le paga a quien tiene una credencial`,
      after: `${r.tier} vigente. Nadie mantiene una allowlist: la revocación llega sola a un contrato ajeno. Y la misma credencial abre una votación: una revocación cierra los dos.`,
    }),
    activity: "Actividad on-chain",
    builtOn: "Built on",
  },
  header: {
    theme: "Cambiar tema",
    language: "Idioma",
  },
  common: {
    copied: "Dirección copiada",
    done: "Listo",
    close: "Cerrar",
    progress: "Progreso de las transacciones de esta acción",
    needWallet: "Primero crea la wallet de Marta.",
    offline: (url: string) => `No se pudo conectar con el backend en ${url}`,
  },
  steps: {
    list: [
      "Marta crea su wallet con Face ID. ACTA le crea su vault",
      "GrantFox le emite Contributor Gold y la registra en vc-gate",
      "La tesorería le paga a Marta → pasa",
      "La tesorería le paga a alguien sin credencial → la policy lo rechaza",
      "GrantFox revoca en el vault → el siguiente pago a Marta se rechaza",
    ],
    vote: "Con la misma credencial Marta vota → pasa. Después de la revocación, su voto rebota",
  },
  holder: {
    role: "Titular",
    description:
      "Su identidad es una smart account con passkey. ACTA le crea el vault: ella no firma ni paga nada.",
    did: "Cédula",
    resolver: "resolver en did.acta.build",
    issuerFallback: "Emisor",
    reset: "Empezar con otra titular",
    passkeyHint:
      "Una passkey de tu dispositivo controla la smart account. Sin frase semilla, sin XLM.",
    create: "Crear wallet con Face ID",
  },
  credential: {
    waiting: "Esperando al emisor…",
    noVault: "sin vault",
    unregistered: "sin registro",
    revoked: "Revocada",
  },
  issuer: {
    role: "Emisor",
    description:
      "Emite la credencial en el vault de Marta y registra el claim público en vc-gate. Puede revocarla cuando quiera.",
    address: "Dirección",
    tier: "Tier",
    unregistered:
      "La credencial está en el vault pero no en vc-gate: la tesorería todavía no la ve.",
    register: "Registrar en vc-gate",
    issue: (tier: string) => `Emitir ${tier} y registrar en vc-gate`,
    revoke: "Revocar en el vault",
  },
  treasury: {
    role: "Tesorería",
    nameFallback: "Tesorería",
    description: (r: Requirement) =>
      `Smart account de OpenZeppelin. Su única regla lleva credential-policy: solo paga a quien tenga ${r.credentialType} ${r.tier} válida.`,
    amount: "Monto (USDC)",
    payHolder: "Pagarle a Marta",
    payStranger: "Pagarle a alguien sin credencial",
    last: "Último pago",
    paid: "Pagado",
    rejected: "Rechazado por la policy",
  },
  vote: {
    role: "Segundo gate",
    nameFallback: "Votación de contribuidores",
    description: (r: Requirement) =>
      `credential-vote no es una smart account ni un pago: es un contrato común que le pregunta a vc-gate antes de dejar proponer o votar. Mismo requisito que la tesorería: ${r.credentialType} ${r.tier} válida. Acá firma Marta.`,
    notDeployed: "credential-vote no está desplegado en esta red. Se activa con",
    notDeployedTail: "en el backend.",
    contract: "Contrato",
    newProposal: "Nueva propuesta",
    placeholder: "Financiar el sprint de documentación",
    tooLong: (max: number) => `Más de ${max} bytes: InputTooLong`,
    propose: "Proponer como Marta",
    proposals: "Propuestas",
    empty: "Todavía no hay propuestas. Solo puede abrir una quien tenga la credencial.",
    inFavor: "A favor",
    against: "En contra",
  },
  flows: {
    failed: "Algo falló",
    wallet: {
      title: "Wallet de Marta",
      passkey: "Passkey y smart account",
      passkeyDetail: "Tu navegador te pide Face ID o Touch ID",
      did: "ACTA crea tu cédula",
      didDetail: "register_sponsored · did:stellar con tu passkey como llave",
      vault: "ACTA crea tu vault",
      vaultDetail: "deploy_sponsored · Marta no firma ni paga",
      done: "Wallet lista",
      doneDetail: "Tu smart account, tu did:stellar y tu vault ya están en Stellar.",
    },
    issue: {
      title: (tier: string) => `Credencial Contributor ${tier}`,
      issue: (issuer: string) => `${issuer} emite en el vault`,
      issueDetail: "vault.issue · guarda quién la emitió",
      register: "Registro en vc-gate",
      done: (tier: string) => `Contributor ${tier} emitida`,
    },
    register: {
      title: "Registrar en vc-gate",
      done: "Registrada en vc-gate",
    },
    revoke: {
      title: "Revocar la credencial",
      revoke: (issuer: string) => `${issuer} revoca en el vault`,
      gate: "vc-gate lo ve en la siguiente lectura",
      gateDetail: "Nadie toca el gate ni una allowlist",
      stillValid: "vc-gate todavía la ve válida",
      done: "Credencial revocada",
      doneDetail:
        "vc-gate.is_valid → false. El próximo pago y el próximo voto de Marta van a rebotar.",
    },
    pay: {
      title: (amount: string) => `Pago de ${amount} USDC`,
      sign: "La tesorería firma el pago",
      signDetail: "Firmante Ed25519 · regla Default",
      policy: "credential-policy consulta vc-gate",
      rejected: "Pago rechazado por la policy",
      done: "Pago aprobado",
      doneDetail: (amount: string, to: string) => `${amount} USDC llegaron a ${short(to)}`,
    },
    holderCall: {
      gate: "credential-vote consulta vc-gate",
      sign: "Marta firma con su passkey",
      signDetail: "require_auth · Face ID o Touch ID",
    },
    propose: {
      title: "Nueva propuesta",
      rejected: "Propuesta rechazada",
      done: (id: number) => `Propuesta #${id} abierta`,
    },
    vote: {
      title: (inFavor: boolean, id: number) => `Voto ${inFavor ? "a favor" : "en contra"} · #${id}`,
      gateDetail: "vote · check(tier) en este momento",
      rejected: "Voto rechazado",
      done: "Voto registrado",
      doneDetail: (id: number, inFavor: number, against: number) =>
        `#${id}: ${inFavor} a favor · ${against} en contra`,
    },
  },
  wallet: {
    deployFailed: (reason: string) => `No se pudo desplegar la smart account: ${reason}`,
    notController: "Esta passkey no controla la smart account de Marta",
    missingDeployer:
      "Falta NEXT_PUBLIC_DEPLOYER_SECRET en apps/web/.env: la cuenta de testnet que paga el despliegue de la smart account. Configúrala y reinicia pnpm dev.",
  },
  activity: {
    empty: "Todavía no hay actividad. Empieza creando la wallet de Marta.",
    events: {
      did_registered: (e) => ({
        title: "Cédula creada",
        detail: `ACTA registró ${e.params.did ?? "un did:stellar"} para ${short(e.subject)}`,
      }),
      vault_deployed: (e) => ({
        title: "Vault creado",
        detail: `ACTA patrocinó el vault de ${short(e.subject)}`,
      }),
      credential_issued: (e) => ({
        title: `Credencial ${e.params.tier ?? ""} emitida`,
        detail: `${e.params.issuer ?? ""} → vault ${short(e.params.vault ?? "")}`,
      }),
      gate_registered: (e) => ({
        title: "Registrada en vc-gate",
        detail: `tier: ${e.params.tier ?? ""} para ${short(e.subject)}`,
      }),
      credential_revoked: (e) => ({
        title: "Credencial revocada",
        detail: `${e.params.issuer ?? ""} revocó en el vault de ${short(e.subject)}`,
      }),
      payment_sent: (e) => ({
        title: `Pago de ${e.params.amount ?? ""} USDC`,
        detail: `La tesorería le pagó a ${short(e.subject)}`,
      }),
      payment_rejected: (e) => ({
        title: "Pago rechazado",
        detail: `${short(e.subject)}: ${e.params.reason ?? ""}`,
      }),
      proposal_created: (e) => ({
        title: `Propuesta #${e.params.id ?? ""}`,
        detail: `${short(e.subject)}: ${e.params.title ?? ""}`,
      }),
      vote_cast: (e) => ({
        title: `Voto ${e.params.inFavor === "true" ? "a favor" : "en contra"} · #${e.params.id ?? ""}`,
        detail: `${short(e.subject)} votó en la propuesta #${e.params.id ?? ""}`,
      }),
      vote_rejected: (e) => ({
        title: e.params.action === "propose" ? "Propuesta rechazada" : "Voto rechazado",
        detail: `${short(e.subject)}: ${e.params.reason ?? ""}`,
      }),
    } satisfies Record<ActivityKind, ActivityText> as Record<ActivityKind, ActivityText>,
  },
};

export type Messages = typeof es;

export const en: Messages = {
  meta: {
    eyebrow: "HackMeridian 2026 · Scale track",
    headlineLead: "Let any contract require a",
    headlineAccent: "valid credential.",
    intro: (issuer, r) => ({
      before: `${issuer}'s treasury only pays people who hold a current`,
      after: `${r.tier} credential. Nobody maintains an allowlist: the revocation reaches someone else's contract on its own. And the same credential opens a vote: one revocation closes both.`,
    }),
    activity: "On-chain activity",
    builtOn: "Built on",
  },
  header: {
    theme: "Toggle theme",
    language: "Language",
  },
  common: {
    copied: "Address copied",
    done: "Done",
    close: "Close",
    progress: "Progress of this action's transactions",
    needWallet: "Create Marta's wallet first.",
    offline: (url) => `Could not reach the backend at ${url}`,
  },
  steps: {
    list: [
      "Marta creates her wallet with Face ID. ACTA creates her vault",
      "GrantFox issues her Contributor Gold and registers it in vc-gate",
      "The treasury pays Marta → it goes through",
      "The treasury pays someone without a credential → the policy rejects it",
      "GrantFox revokes in the vault → the next payment to Marta is rejected",
    ],
    vote: "With the same credential Marta votes → it goes through. After the revocation, her vote bounces",
  },
  holder: {
    role: "Holder",
    description:
      "Her identity is a smart account with a passkey. ACTA creates her vault: she signs and pays nothing.",
    did: "DID",
    resolver: "resolver at did.acta.build",
    issuerFallback: "Issuer",
    reset: "Start over with another holder",
    passkeyHint: "A passkey on your device controls the smart account. No seed phrase, no XLM.",
    create: "Create wallet with Face ID",
  },
  credential: {
    waiting: "Waiting for the issuer…",
    noVault: "no vault",
    unregistered: "not registered",
    revoked: "Revoked",
  },
  issuer: {
    role: "Issuer",
    description:
      "Issues the credential into Marta's vault and registers the public claim in vc-gate. It can revoke it whenever it wants.",
    address: "Address",
    tier: "Tier",
    unregistered:
      "The credential is in the vault but not in vc-gate: the treasury cannot see it yet.",
    register: "Register in vc-gate",
    issue: (tier) => `Issue ${tier} and register in vc-gate`,
    revoke: "Revoke in the vault",
  },
  treasury: {
    role: "Treasury",
    nameFallback: "Treasury",
    description: (r) =>
      `An OpenZeppelin smart account. Its only rule carries credential-policy: it only pays holders of a valid ${r.credentialType} ${r.tier}.`,
    amount: "Amount (USDC)",
    payHolder: "Pay Marta",
    payStranger: "Pay someone without a credential",
    last: "Last payment",
    paid: "Paid",
    rejected: "Rejected by the policy",
  },
  vote: {
    role: "Second gate",
    nameFallback: "Contributor vote",
    description: (r) =>
      `credential-vote is neither a smart account nor a payment: it is a plain contract that asks vc-gate before letting anyone propose or vote. Same requirement as the treasury: a valid ${r.credentialType} ${r.tier}. Here Marta signs.`,
    notDeployed: "credential-vote is not deployed on this network. Turn it on with",
    notDeployedTail: "in the backend.",
    contract: "Contract",
    newProposal: "New proposal",
    placeholder: "Fund the docs sprint",
    tooLong: (max) => `Over ${max} bytes: InputTooLong`,
    propose: "Propose as Marta",
    proposals: "Proposals",
    empty: "No proposals yet. Only a credential holder can open one.",
    inFavor: "In favor",
    against: "Against",
  },
  flows: {
    failed: "Something went wrong",
    wallet: {
      title: "Marta's wallet",
      passkey: "Passkey and smart account",
      passkeyDetail: "Your browser asks for Face ID or Touch ID",
      did: "ACTA creates your DID",
      didDetail: "register_sponsored · did:stellar with your passkey as its key",
      vault: "ACTA creates your vault",
      vaultDetail: "deploy_sponsored · Marta neither signs nor pays",
      done: "Wallet ready",
      doneDetail: "Your smart account, your did:stellar and your vault are on Stellar.",
    },
    issue: {
      title: (tier) => `Contributor ${tier} credential`,
      issue: (issuer) => `${issuer} issues into the vault`,
      issueDetail: "vault.issue · records who issued it",
      register: "Registration in vc-gate",
      done: (tier) => `Contributor ${tier} issued`,
    },
    register: {
      title: "Register in vc-gate",
      done: "Registered in vc-gate",
    },
    revoke: {
      title: "Revoke the credential",
      revoke: (issuer) => `${issuer} revokes in the vault`,
      gate: "vc-gate sees it on the next read",
      gateDetail: "Nobody touches the gate or an allowlist",
      stillValid: "vc-gate still sees it as valid",
      done: "Credential revoked",
      doneDetail: "vc-gate.is_valid → false. Marta's next payment and next vote will bounce.",
    },
    pay: {
      title: (amount) => `Payment of ${amount} USDC`,
      sign: "The treasury signs the payment",
      signDetail: "Ed25519 signer · Default rule",
      policy: "credential-policy asks vc-gate",
      rejected: "Payment rejected by the policy",
      done: "Payment approved",
      doneDetail: (amount, to) => `${amount} USDC reached ${short(to)}`,
    },
    holderCall: {
      gate: "credential-vote asks vc-gate",
      sign: "Marta signs with her passkey",
      signDetail: "require_auth · Face ID or Touch ID",
    },
    propose: {
      title: "New proposal",
      rejected: "Proposal rejected",
      done: (id) => `Proposal #${id} opened`,
    },
    vote: {
      title: (inFavor, id) => `Vote ${inFavor ? "in favor" : "against"} · #${id}`,
      gateDetail: "vote · check(tier) right now",
      rejected: "Vote rejected",
      done: "Vote recorded",
      doneDetail: (id, inFavor, against) => `#${id}: ${inFavor} in favor · ${against} against`,
    },
  },
  wallet: {
    deployFailed: (reason) => `Could not deploy the smart account: ${reason}`,
    notController: "This passkey does not control Marta's smart account",
    missingDeployer:
      "NEXT_PUBLIC_DEPLOYER_SECRET is missing in apps/web/.env: the testnet account that pays for deploying the smart account. Set it and restart pnpm dev.",
  },
  activity: {
    empty: "No activity yet. Start by creating Marta's wallet.",
    events: {
      did_registered: (e) => ({
        title: "DID created",
        detail: `ACTA registered ${e.params.did ?? "a did:stellar"} for ${short(e.subject)}`,
      }),
      vault_deployed: (e) => ({
        title: "Vault created",
        detail: `ACTA sponsored the vault of ${short(e.subject)}`,
      }),
      credential_issued: (e) => ({
        title: `${e.params.tier ?? ""} credential issued`,
        detail: `${e.params.issuer ?? ""} → vault ${short(e.params.vault ?? "")}`,
      }),
      gate_registered: (e) => ({
        title: "Registered in vc-gate",
        detail: `tier: ${e.params.tier ?? ""} for ${short(e.subject)}`,
      }),
      credential_revoked: (e) => ({
        title: "Credential revoked",
        detail: `${e.params.issuer ?? ""} revoked in the vault of ${short(e.subject)}`,
      }),
      payment_sent: (e) => ({
        title: `Payment of ${e.params.amount ?? ""} USDC`,
        detail: `The treasury paid ${short(e.subject)}`,
      }),
      payment_rejected: (e) => ({
        title: "Payment rejected",
        detail: `${short(e.subject)}: ${e.params.reason ?? ""}`,
      }),
      proposal_created: (e) => ({
        title: `Proposal #${e.params.id ?? ""}`,
        detail: `${short(e.subject)}: ${e.params.title ?? ""}`,
      }),
      vote_cast: (e) => ({
        title: `Vote ${e.params.inFavor === "true" ? "in favor" : "against"} · #${e.params.id ?? ""}`,
        detail: `${short(e.subject)} voted on proposal #${e.params.id ?? ""}`,
      }),
      vote_rejected: (e) => ({
        title: e.params.action === "propose" ? "Proposal rejected" : "Vote rejected",
        detail: `${short(e.subject)}: ${e.params.reason ?? ""}`,
      }),
    },
  },
};

export const MESSAGES = { es, en } as const;
export type Locale = keyof typeof MESSAGES;
export const LOCALES = Object.keys(MESSAGES) as Locale[];
/** Each language in its own words, so a visitor can find theirs whatever is on screen. */
export const LOCALE_NAMES: Record<Locale, string> = { es: "Español", en: "English" };
