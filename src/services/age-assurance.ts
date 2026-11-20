/** Provider boundary only. No live provider or client assertion ingestion exists in M3A. */
export interface AdultAssertion {
  subjectId: string;
  provider: string;
  assertionId: string;
  over18: true;
  method:
    | "document_match"
    | "facial_age_estimation"
    | "digital_identity"
    | "bank"
    | "mobile_network";
  policyVersion: string;
  jurisdictionPolicy: string;
  issuedAt: number;
  expiresAt: number;
}
export interface AgeAssuranceProvider {
  readonly id: string;
  /** Hosted flow; no document/selfie/DOB passes through CheapSeggs. */
  begin(input: {
    subjectId: string;
    nonce: string;
    jurisdictionPolicy: string;
    returnUrl: string;
  }): Promise<{ redirectUrl: string; expiresAt: number }>;
  /** Reviewed SDK/signature verification must bind audience, subject, nonce, epoch, expiry and replay. */
  verifyCallback(request: Request): Promise<AdultAssertion | null>;
  revoke(assertionId: string): Promise<void>;
}
export const ADULT_CONTENT_GATES = {
  providerActivated: false,
  legalMarketsApproved: false,
  contentReviewApproved: false,
} as const;
