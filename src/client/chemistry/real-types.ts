import type { ChemistryDepth } from "../../content/chemistry/questions";
import type { QuestionResponse, SharedReport } from "../../domain/chemistry";

export interface OwnView {
  id: string;
  depth: ChemistryDepth;
  manifestId: string;
  status: string;
  createdAt: number;
  acceptedAt: number | null;
  assessmentExpiresAt: number | null;
  reportExpiresAt: number | null;
  role: "creator" | "invitee";
  own: {
    submitted: boolean;
    submissionRevision: number | null;
    draftRevision: number;
  };
  invitation: { expiresAt: number; state: string } | null;
  reportAvailable: boolean;
}

export interface ReportPayload {
  report: SharedReport;
  expiresAt: number;
}

export class RealError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export async function realApi<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  const response = await fetch(`/api/v1/chemistry-check${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers:
      method === "GET" || method === "HEAD"
        ? {}
        : { "content-type": "application/json", "x-cheapseggs-action": "chemistry" },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new RealError(response.status, body.error ?? "unavailable");
  }
  return (await response.json()) as T;
}

export function blankResponse(
  questionId: string,
  version: number,
  intimate: boolean,
): QuestionResponse {
  return {
    questionId,
    questionVersion: version,
    state: "skipped",
    own: [],
    accept: null,
    importance: "medium",
    dealbreaker: false,
    disclosure: intimate ? "private" : "summary",
  };
}

export function messageForError(error: unknown): string {
  if (!(error instanceof RealError)) return "That private assessment is unavailable.";
  if (error.code === "sign_in_required") return "Sign in with your own account to continue.";
  if (error.code === "adult_declaration_required")
    return "Confirm your 18+ declaration in your account first.";
  if (error.code === "not_ready")
    return "This is not ready yet. Both people must complete the same step.";
  if (error.status === 429) return "Too many attempts. Please wait before trying again.";
  return "That private assessment is unavailable.";
}
