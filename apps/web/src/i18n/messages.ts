import type { ActivityEvent, ActivityKind } from "@acta-gate/shared";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-6)}`;

/** `credentialType` and `tier` as the hero and the panels mention them. */
interface Requirement {
  credentialType: string;
  tier: string;
}

type ActivityText = (e: ActivityEvent) => { title: string; detail: string };

/** A contract's error code in words a visitor understands, or the code when it is new. */
const reasonIn = (reasons: Record<string, string>) => (code: string | null | undefined) =>
  code ? (reasons[code] ?? code) : "";

const esReason = reasonIn({
  RecipientNotCredentialed: "No tiene una credencial Gold vigente",
  NotCredentialed: "No tiene una credencial Gold vigente",
  AlreadyVoted: "Ya votó en esta propuesta",
  ProposalNotFound: "Esa propuesta no existe",
  InputTooLong: "El título es demasiado largo",
  MissingSetting: "Falta configurar el servidor",
});

const enReason = reasonIn({
  RecipientNotCredentialed: "They don't hold a current Gold credential",
  NotCredentialed: "They don't hold a current Gold credential",
  AlreadyVoted: "Already voted on this proposal",
  ProposalNotFound: "That proposal doesn't exist",
  InputTooLong: "The title is too long",
  MissingSetting: "The server isn't fully set up",
});

/** Spanish is the source: every other locale has the same shape. */
export const es = {
  meta: {
    eyebrow: "HackMeridian 2026 · Track Scale",
    headlineLead: "Que cualquier contrato pueda exigir una credencial",
    headlineAccent: "válida.",
    intro: (issuer: string, r: Requirement) => ({
      before: `La tesorería de ${issuer} solo le paga a quien tiene una credencial`,
      after: `${r.tier} vigente. Nadie lleva una lista a mano: si ${issuer} la revoca, los pagos se cortan solos. Y la misma credencial sirve para votar: una sola revocación cierra las dos puertas.`,
    }),
    activity: "Actividad en la red",
    footer: "ACTA Gate · credenciales verificables",
    builtOn: "Hecho sobre",
  },
  header: {
    theme: "Cambiar tema",
    language: "Idioma",
  },
  common: {
    copied: "Dirección copiada",
    done: "Listo",
    close: "Cerrar",
    progress: "Progreso de esta acción",
    needWallet: "Primero crea la wallet de Marta.",
    offline: (url: string) => `No se pudo conectar con el servidor (${url})`,
    yes: "Sí",
    no: "No",
    reason: esReason,
  },
  steps: {
    list: [
      "Marta crea su wallet con Face ID",
      "GrantFox le da una credencial Gold",
      "La tesorería le paga a Marta → se aprueba",
      "La tesorería intenta pagarle a alguien sin credencial → se rechaza",
      "GrantFox revoca la credencial → el siguiente pago a Marta se rechaza",
    ],
    vote: "Marta vota con la misma credencial → se acepta. Después de revocarla, ya no puede votar",
  },
  holder: {
    role: "Titular",
    description:
      "Marta entra con Face ID o su huella, sin contraseñas ni frases secretas. ACTA le prepara todo y ella no paga nada.",
    account: "Cuenta",
    vault: "Bóveda",
    did: "Identidad",
    resolver: "ver en did.acta.build",
    issuerFallback: "Emisor",
    reset: "Empezar con otra titular",
    passkeyHint:
      "Tu dispositivo protege la cuenta con Face ID o tu huella. No necesitas criptomonedas.",
    create: "Crear wallet con Face ID",
  },
  credential: {
    waiting: "Esperando al emisor…",
    noVault: "sin bóveda",
    status: "Estado",
    statuses: { valid: "Vigente", revoked: "Revocada", invalid: "No válida" },
    visible: "Reconocida por los contratos",
    notPublished: "Todavía no",
    level: "Nivel",
    revoked: "Revocada",
  },
  issuer: {
    role: "Emisor",
    description:
      "Le entrega a Marta su credencial y la publica para que los contratos la reconozcan. Puede revocarla cuando quiera.",
    address: "Dirección",
    tier: "Nivel",
    unregistered:
      "Marta ya tiene la credencial, pero falta publicarla: la tesorería todavía no la reconoce.",
    register: "Publicar la credencial",
    issue: (tier: string) => `Dar credencial ${tier}`,
    revoke: "Revocar la credencial",
  },
  treasury: {
    role: "Tesorería",
    nameFallback: "Tesorería",
    account: "Cuenta",
    description: (r: Requirement) =>
      `La cuenta que paga a los contribuidores. Antes de cada pago revisa sola si quien cobra tiene una credencial ${r.tier} vigente.`,
    amount: "Monto (USDC)",
    payHolder: "Pagarle a Marta",
    payStranger: "Pagarle a alguien sin credencial",
    last: "Último pago",
    paid: "Pagado",
    rejected: "Rechazado",
  },
  vote: {
    role: "Votación",
    nameFallback: "Votación de contribuidores",
    description: (r: Requirement) =>
      `Solo quien tiene una credencial ${r.tier} vigente puede proponer y votar. Es la misma credencial que usa la tesorería, y aquí Marta firma con su Face ID.`,
    notDeployed: "La votación no está disponible en esta red. Se activa con",
    notDeployedTail: "en el servidor.",
    contract: "Contrato",
    canVote: "¿Marta puede votar?",
    newProposal: "Nueva propuesta",
    placeholder: "Financiar el sprint de documentación",
    tooLong: (max: number) => `El título es demasiado largo (máximo ${max} caracteres simples)`,
    propose: "Proponer como Marta",
    proposals: "Propuestas",
    empty: "Todavía no hay propuestas. Solo puede abrir una quien tenga la credencial.",
    inFavor: "A favor",
    against: "En contra",
    voted: "Ya votaste",
  },
  flows: {
    failed: "Algo falló",
    wallet: {
      title: "Wallet de Marta",
      passkey: "Creando tu cuenta",
      passkeyDetail: "Tu navegador te pide Face ID o tu huella",
      did: "Creando tu identidad digital",
      didDetail: "ACTA la registra por ti, sin costo",
      vault: "Creando tu bóveda de credenciales",
      vaultDetail: "Ahí vas a guardar tus credenciales. Tampoco pagas nada",
      done: "Wallet lista",
      doneDetail: "Tu cuenta, tu identidad y tu bóveda ya están en Stellar.",
    },
    issue: {
      title: (tier: string) => `Credencial ${tier}`,
      issue: (issuer: string) => `${issuer} le entrega la credencial`,
      issueDetail: "Queda guardada en la bóveda de Marta",
      register: "Publicando la credencial",
      registerDetail: "Para que los contratos la reconozcan",
      done: (tier: string) => `Credencial ${tier} entregada`,
      doneDetail: (visible: boolean): string =>
        visible ? "Los contratos ya la reconocen." : "Los contratos todavía no la reconocen.",
    },
    register: {
      title: "Publicar la credencial",
      done: "Credencial publicada",
    },
    revoke: {
      title: "Revocar la credencial",
      revoke: (issuer: string) => `${issuer} revoca la credencial`,
      revokeDetail: "Desde la bóveda de Marta",
      gate: "Los contratos se enteran solos",
      gateDetail: "Nadie tiene que actualizar ninguna lista",
      stillValid: "La credencial todavía figura como vigente",
      done: "Credencial revocada",
      doneDetail: "El próximo pago y el próximo voto de Marta se van a rechazar.",
    },
    pay: {
      title: (amount: string) => `Pago de ${amount} USDC`,
      sign: "La tesorería prepara el pago",
      signDetail: "Lo firma su responsable",
      policy: "Revisando la credencial",
      policyDetail: "La tesorería verifica que quien cobra tenga la credencial",
      rejected: "Pago rechazado",
      done: "Pago aprobado",
      doneDetail: (amount: string, to: string) => `${amount} USDC llegaron a ${short(to)}`,
    },
    holderCall: {
      gate: "Revisando la credencial de Marta",
      sign: "Marta confirma con su Face ID",
      signDetail: "Tu navegador te lo va a pedir",
    },
    propose: {
      title: "Nueva propuesta",
      gateDetail: "Solo quien tiene la credencial puede proponer",
      rejected: "Propuesta rechazada",
      done: (id: number) => `Propuesta #${id} abierta`,
    },
    vote: {
      title: (inFavor: boolean, id: number) => `Voto ${inFavor ? "a favor" : "en contra"} · #${id}`,
      gateDetail: "Se revisa en este momento, no cuando se emitió",
      rejected: "Voto rechazado",
      done: "Voto registrado",
      doneDetail: (id: number, inFavor: number, against: number) =>
        `#${id}: ${inFavor} a favor · ${against} en contra`,
    },
  },
  wallet: {
    deployFailed: (reason: string) => `No se pudo crear tu cuenta: ${reason}`,
    notController: "Esta llave no corresponde a la cuenta de Marta",
    missingDeployer:
      "Falta configurar la cuenta que paga la creación de wallets (NEXT_PUBLIC_DEPLOYER_SECRET en apps/web/.env). Configúrala y reinicia pnpm dev.",
  },
  activity: {
    empty: "Todavía no hay actividad. Empieza creando la wallet de Marta.",
    events: {
      did_registered: (e) => ({
        title: "Identidad creada",
        detail: `ACTA creó la identidad digital de ${short(e.subject)}`,
      }),
      vault_deployed: (e) => ({
        title: "Bóveda creada",
        detail: `ACTA creó la bóveda de ${short(e.subject)}`,
      }),
      credential_issued: (e) => ({
        title: `Credencial ${e.params.tier ?? ""} entregada`,
        detail: `${e.params.issuer ?? ""} se la entregó a ${short(e.subject)}`,
      }),
      gate_registered: (e) => ({
        title: "Credencial publicada",
        detail: `Los contratos ya reconocen a ${short(e.subject)}`,
      }),
      credential_revoked: (e) => ({
        title: "Credencial revocada",
        detail: `${e.params.issuer ?? ""} revocó la credencial de ${short(e.subject)}`,
      }),
      payment_sent: (e) => ({
        title: `Pago de ${e.params.amount ?? ""} USDC`,
        detail: `La tesorería le pagó a ${short(e.subject)}`,
      }),
      payment_rejected: (e) => ({
        title: "Pago rechazado",
        detail: `${short(e.subject)}: ${esReason(e.params.reason)}`,
      }),
      proposal_created: (e) => ({
        title: `Propuesta #${e.params.id ?? ""}`,
        detail: e.params.title ?? "",
      }),
      vote_cast: (e) => ({
        title: `Voto ${e.params.inFavor === "true" ? "a favor" : "en contra"} · #${e.params.id ?? ""}`,
        detail: `${short(e.subject)} votó en la propuesta #${e.params.id ?? ""}`,
      }),
      vote_rejected: (e) => ({
        title: e.params.action === "propose" ? "Propuesta rechazada" : "Voto rechazado",
        detail: `${short(e.subject)}: ${esReason(e.params.reason)}`,
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
      after: `${r.tier} credential. Nobody keeps a list by hand: if ${issuer} revokes it, payments stop on their own. And the same credential lets you vote: one revocation closes both doors.`,
    }),
    activity: "Network activity",
    footer: "ACTA Gate · verifiable credentials",
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
    progress: "Progress of this action",
    needWallet: "Create Marta's wallet first.",
    offline: (url) => `Could not reach the server (${url})`,
    yes: "Yes",
    no: "No",
    reason: enReason,
  },
  steps: {
    list: [
      "Marta creates her wallet with Face ID",
      "GrantFox gives her a Gold credential",
      "The treasury pays Marta → approved",
      "The treasury tries to pay someone without a credential → rejected",
      "GrantFox revokes the credential → the next payment to Marta is rejected",
    ],
    vote: "Marta votes with the same credential → accepted. Once it's revoked, she can't vote",
  },
  holder: {
    role: "Holder",
    description:
      "Marta signs in with Face ID or her fingerprint: no passwords, no secret phrases. ACTA sets everything up and she pays nothing.",
    account: "Account",
    vault: "Vault",
    did: "Identity",
    resolver: "view on did.acta.build",
    issuerFallback: "Issuer",
    reset: "Start over with another holder",
    passkeyHint:
      "Your device protects the account with Face ID or your fingerprint. No crypto needed.",
    create: "Create wallet with Face ID",
  },
  credential: {
    waiting: "Waiting for the issuer…",
    noVault: "no vault",
    status: "Status",
    statuses: { valid: "Current", revoked: "Revoked", invalid: "Not valid" },
    visible: "Recognized by contracts",
    notPublished: "Not yet",
    level: "Level",
    revoked: "Revoked",
  },
  issuer: {
    role: "Issuer",
    description:
      "Gives Marta her credential and publishes it so contracts recognize it. It can revoke it whenever it wants.",
    address: "Address",
    tier: "Level",
    unregistered:
      "Marta already has the credential, but it isn't published yet: the treasury doesn't recognize it.",
    register: "Publish the credential",
    issue: (tier) => `Give a ${tier} credential`,
    revoke: "Revoke the credential",
  },
  treasury: {
    role: "Treasury",
    nameFallback: "Treasury",
    account: "Account",
    description: (r) =>
      `The account that pays contributors. Before every payment it checks on its own that the recipient holds a current ${r.tier} credential.`,
    amount: "Amount (USDC)",
    payHolder: "Pay Marta",
    payStranger: "Pay someone without a credential",
    last: "Last payment",
    paid: "Paid",
    rejected: "Rejected",
  },
  vote: {
    role: "Vote",
    nameFallback: "Contributor vote",
    description: (r) =>
      `Only holders of a current ${r.tier} credential can propose and vote. It's the same credential the treasury uses, and here Marta signs with her Face ID.`,
    notDeployed: "Voting isn't available on this network. Turn it on with",
    notDeployedTail: "on the server.",
    contract: "Contract",
    canVote: "Can Marta vote?",
    newProposal: "New proposal",
    placeholder: "Fund the docs sprint",
    tooLong: (max) => `The title is too long (at most ${max} plain characters)`,
    propose: "Propose as Marta",
    proposals: "Proposals",
    empty: "No proposals yet. Only a credential holder can open one.",
    inFavor: "In favor",
    against: "Against",
    voted: "You voted",
  },
  flows: {
    failed: "Something went wrong",
    wallet: {
      title: "Marta's wallet",
      passkey: "Creating your account",
      passkeyDetail: "Your browser asks for Face ID or your fingerprint",
      did: "Creating your digital identity",
      didDetail: "ACTA registers it for you, free of charge",
      vault: "Creating your credential vault",
      vaultDetail: "Where your credentials live. You don't pay for this either",
      done: "Wallet ready",
      doneDetail: "Your account, your identity and your vault are on Stellar.",
    },
    issue: {
      title: (tier) => `${tier} credential`,
      issue: (issuer) => `${issuer} gives her the credential`,
      issueDetail: "It's stored in Marta's vault",
      register: "Publishing the credential",
      registerDetail: "So contracts recognize it",
      done: (tier) => `${tier} credential delivered`,
      doneDetail: (visible) =>
        visible ? "Contracts recognize it now." : "Contracts don't recognize it yet.",
    },
    register: {
      title: "Publish the credential",
      done: "Credential published",
    },
    revoke: {
      title: "Revoke the credential",
      revoke: (issuer) => `${issuer} revokes the credential`,
      revokeDetail: "From Marta's vault",
      gate: "Contracts find out on their own",
      gateDetail: "Nobody has to update any list",
      stillValid: "The credential still shows as current",
      done: "Credential revoked",
      doneDetail: "Marta's next payment and next vote will be rejected.",
    },
    pay: {
      title: (amount) => `Payment of ${amount} USDC`,
      sign: "The treasury prepares the payment",
      signDetail: "Signed by its manager",
      policy: "Checking the credential",
      policyDetail: "The treasury verifies that the recipient holds the credential",
      rejected: "Payment rejected",
      done: "Payment approved",
      doneDetail: (amount, to) => `${amount} USDC reached ${short(to)}`,
    },
    holderCall: {
      gate: "Checking Marta's credential",
      sign: "Marta confirms with Face ID",
      signDetail: "Your browser will ask for it",
    },
    propose: {
      title: "New proposal",
      gateDetail: "Only credential holders can propose",
      rejected: "Proposal rejected",
      done: (id) => `Proposal #${id} opened`,
    },
    vote: {
      title: (inFavor, id) => `Vote ${inFavor ? "in favor" : "against"} · #${id}`,
      gateDetail: "Checked right now, not when it was issued",
      rejected: "Vote rejected",
      done: "Vote recorded",
      doneDetail: (id, inFavor, against) => `#${id}: ${inFavor} in favor · ${against} against`,
    },
  },
  wallet: {
    deployFailed: (reason) => `Could not create your account: ${reason}`,
    notController: "This key doesn't belong to Marta's account",
    missingDeployer:
      "The account that pays for creating wallets isn't set up (NEXT_PUBLIC_DEPLOYER_SECRET in apps/web/.env). Set it and restart pnpm dev.",
  },
  activity: {
    empty: "No activity yet. Start by creating Marta's wallet.",
    events: {
      did_registered: (e) => ({
        title: "Identity created",
        detail: `ACTA created the digital identity of ${short(e.subject)}`,
      }),
      vault_deployed: (e) => ({
        title: "Vault created",
        detail: `ACTA created the vault of ${short(e.subject)}`,
      }),
      credential_issued: (e) => ({
        title: `${e.params.tier ?? ""} credential delivered`,
        detail: `${e.params.issuer ?? ""} gave it to ${short(e.subject)}`,
      }),
      gate_registered: (e) => ({
        title: "Credential published",
        detail: `Contracts now recognize ${short(e.subject)}`,
      }),
      credential_revoked: (e) => ({
        title: "Credential revoked",
        detail: `${e.params.issuer ?? ""} revoked the credential of ${short(e.subject)}`,
      }),
      payment_sent: (e) => ({
        title: `Payment of ${e.params.amount ?? ""} USDC`,
        detail: `The treasury paid ${short(e.subject)}`,
      }),
      payment_rejected: (e) => ({
        title: "Payment rejected",
        detail: `${short(e.subject)}: ${enReason(e.params.reason)}`,
      }),
      proposal_created: (e) => ({
        title: `Proposal #${e.params.id ?? ""}`,
        detail: e.params.title ?? "",
      }),
      vote_cast: (e) => ({
        title: `Vote ${e.params.inFavor === "true" ? "in favor" : "against"} · #${e.params.id ?? ""}`,
        detail: `${short(e.subject)} voted on proposal #${e.params.id ?? ""}`,
      }),
      vote_rejected: (e) => ({
        title: e.params.action === "propose" ? "Proposal rejected" : "Vote rejected",
        detail: `${short(e.subject)}: ${enReason(e.params.reason)}`,
      }),
    },
  },
};

export const MESSAGES = { es, en } as const;
export type Locale = keyof typeof MESSAGES;
export const LOCALES = Object.keys(MESSAGES) as Locale[];
/** Each language in its own words, so a visitor can find theirs whatever is on screen. */
export const LOCALE_NAMES: Record<Locale, string> = { es: "Español", en: "English" };
