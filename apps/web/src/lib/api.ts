import type {
  ActionResult,
  ActivityEvent,
  ApiError,
  DemoConfig,
  HolderView,
  PaymentResult,
  Tier,
} from "@acta-gate/shared";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: init?.method ?? "GET",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiRequestError("Offline", `No se pudo conectar con el backend en ${BASE_URL}`);
  }
  const data = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok) {
    const error = (data as ApiError | null)?.error;
    throw new ApiRequestError(error?.code ?? "HttpError", error?.message ?? `HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  config: () => request<DemoConfig>("/config"),
  activity: () => request<ActivityEvent[]>("/activity"),
  holder: (address: string) => request<HolderView>(`/holders/${address}`),
  createHolder: (address: string) =>
    request<ActionResult>("/holders", { method: "POST", body: { address } }),
  issue: (address: string, tier: Tier) =>
    request<ActionResult>("/credentials", { method: "POST", body: { address, tier } }),
  register: (address: string) =>
    request<ActionResult>("/credentials/register", { method: "POST", body: { address } }),
  revoke: (address: string) =>
    request<ActionResult>("/credentials/revoke", { method: "POST", body: { address } }),
  pay: (to: string, amount: string) =>
    request<PaymentResult>("/payments", { method: "POST", body: { to, amount } }),
};
