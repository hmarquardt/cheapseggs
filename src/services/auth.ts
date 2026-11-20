/** Framework adapter boundary; no custom session or crypto implementation in the scaffold. */
export interface Principal {
  userId: string;
  sessionId: string;
  expiresAt: number;
  adultAccessValidUntil: number;
}

export interface IdentityService {
  resolve(request: Request): Promise<Principal | null>;
  revokeAll(userId: string): Promise<void>;
}

export const authFoundation = { status: "not-configured" } as const;
