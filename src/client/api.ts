import type { SpinRequest, SpinResponse, WheelConfigDto } from "../domain/wheel";

/** Guest nonce lives in memory only: no cookie, no localStorage, no sessionStorage. */
export const GUEST_HEADER = "x-cheapseggs-guest";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export function createGuestToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function parse(response: Response): Promise<unknown> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? "request_failed", response.status);
  }
  return response.json();
}

export async function loadWheel(): Promise<WheelConfigDto> {
  const response = await fetch("/api/v1/wheels/misfortune", {
    headers: { accept: "application/json" },
    credentials: "omit",
    cache: "no-store",
  });
  return (await parse(response)) as WheelConfigDto;
}

export async function requestSpin(
  token: string,
  body: Omit<SpinRequest, "wheelId">,
): Promise<SpinResponse> {
  const response = await fetch("/api/v1/spins", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      [GUEST_HEADER]: token,
    },
    credentials: "omit",
    cache: "no-store",
    body: JSON.stringify({ wheelId: "misfortune", ...body }),
  });
  return (await parse(response)) as SpinResponse;
}

export async function resetGuest(token: string): Promise<void> {
  await fetch("/api/v1/guest", {
    method: "DELETE",
    headers: { [GUEST_HEADER]: token },
    credentials: "omit",
    cache: "no-store",
    keepalive: true,
  }).catch(() => undefined);
}
