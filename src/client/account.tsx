import { render } from "preact";
import { flushSync } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import "./styles.css";

interface Account {
  email: string;
  state: string;
  adultStatus: { selfDeclared: boolean; independentlyVerified: boolean };
  categoryApprovals: string[];
  freshAuthentication: boolean;
}
interface Session {
  id: string;
  current: boolean;
  createdAt: number;
  expiresAt: number;
}
const CATEGORIES = [
  { id: "touch", name: "Touch & closeness" },
  { id: "senses", name: "Senses" },
  { id: "fantasy", name: "Make-believe" },
];

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers:
      body === undefined
        ? {}
        : { "content-type": "application/json", "x-cheapseggs-action": "account" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const data = (await response.json()) as { error?: string };
    const messages: Record<string, string> = {
      recent_sign_in_required:
        "Sign in again with a new email code, then confirm deletion within five minutes.",
      invalid_or_expired_code: "That code could not be used. Check it or request a new code.",
      rate_limited: "Too many attempts. Please wait 15 minutes before trying again.",
      email_unavailable: "Account email is temporarily unavailable. Please try again later.",
      email_not_configured: "Email sign-in is unavailable. The guest wheel is still open.",
      auth_not_configured: "Account sign-in is unavailable. The guest wheel is still open.",
    };
    throw new Error(
      messages[data.error ?? ""] ?? "We could not complete that request. Please try again.",
    );
  }
  return response.json() as Promise<T>;
}
function AccountPage() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [adult, setAdult] = useState(false);
  const [sent, setSent] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [reauth, setReauth] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshEpoch = useRef(0);

  async function refresh() {
    const epoch = ++refreshEpoch.current;
    const status = await api<{ emailSignInAvailable: boolean }>("/api/account/status");
    if (epoch !== refreshEpoch.current) return;
    setAvailable(status.emailSignInAvailable);
    const response = await fetch("/api/account", { cache: "no-store", credentials: "same-origin" });
    if (epoch !== refreshEpoch.current) return;
    if (response.status === 401 || response.status === 503) {
      setAccount(null);
      setSessions([]);
      return;
    }
    if (!response.ok) throw new Error("Account controls are temporarily unavailable.");
    const current = (await response.json()) as Account;
    const listed = await api<{ sessions: Session[] }>("/api/account/sessions");
    if (epoch !== refreshEpoch.current) return;
    setAccount(current);
    setSessions(listed.sessions);
  }
  useEffect(() => {
    void refresh().catch(() =>
      setMessage(
        "Account controls are temporarily unavailable. You can still use the guest wheel.",
      ),
    );
    // Clear the visible identity on pagehide, including bfcache. Always revalidate on return.
    const hide = () =>
      flushSync(() => {
        refreshEpoch.current++;
        setAccount(null);
        setSessions([]);
        setOtp("");
        setEmail("");
        setConfirmation("");
      });
    const show = () => void refresh().catch(() => hide());
    const focus = () => void refresh().catch(() => hide());
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    window.addEventListener("focus", focus);
    return () => {
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      window.removeEventListener("focus", focus);
    };
  }, []);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const showSignIn = !account || reauth;
  return (
    <>
      <aside class="topline">YOUR ACCOUNT · 18+</aside>
      <header class="site-header wrap">
        <a class="wordmark" href="/">
          cheap<span>seggs</span>
        </a>
        <a href="/play/">Guest wheel</a>
      </header>
      <main class="wrap account-page" id="main">
        <p class="eyebrow">YOUR OWN SEAT AT THE TABLE.</p>
        <h1>Your account.</h1>
        <p>
          Each person has their own account. Signing in never grants consent for an activity or
          access to another person’s answers.
        </p>
        <p role="status" aria-live="polite">
          {message}
        </p>
        {available === null && <p>Checking account availability…</p>}
        {available === false && (
          <section class="entry-card">
            <h2>Email sign-in is not open yet.</h2>
            <p>
              Account email delivery is awaiting configuration. No email address is collected here
              while sign-in is unavailable. <a href="/play/">The guest wheel is open.</a>
            </p>
          </section>
        )}
        {showSignIn && available && (
          <section class="entry-card">
            <h2>{reauth ? "Confirm it’s you" : "Create an account or sign in"}</h2>
            <p>
              We’ll send a code to your inbox. CheapSeggs will appear in the email and your browser
              history. Anyone with access to your inbox can recover this account.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  if (!sent) {
                    await api("/api/auth/email-otp/send-verification-otp", { email, adult });
                    setSent(true);
                    setMessage(
                      "If delivery succeeds, your code will arrive shortly. It expires in 10 minutes.",
                    );
                  } else {
                    await api("/api/auth/sign-in/email-otp", { email, otp, adult, recovery });
                    setOtp("");
                    setEmail("");
                    setSent(false);
                    setReauth(false);
                    setAdult(false);
                    await refresh();
                    setMessage(
                      recovery
                        ? "Account recovered. Other sessions have ended."
                        : "You’re signed in.",
                    );
                  }
                });
              }}
            >
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  value={email}
                  disabled={busy || sent}
                  onInput={(e) => setEmail(e.currentTarget.value)}
                />
              </label>
              <label class="check-label">
                <input
                  type="checkbox"
                  checked={adult}
                  required
                  disabled={busy}
                  onChange={(e) => setAdult(e.currentTarget.checked)}
                />
                I am 18 or older. This is my own declaration, not independent age verification.
              </label>
              <label class="check-label">
                <input
                  type="checkbox"
                  checked={recovery}
                  disabled={busy}
                  onChange={(e) => setRecovery(e.currentTarget.checked)}
                />
                Recover my account and end all other sessions after sign-in.
              </label>
              {sent && (
                <label>
                  Eight-digit code
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{8}"
                    maxLength={8}
                    required
                    value={otp}
                    disabled={busy}
                    onInput={(e) => setOtp(e.currentTarget.value)}
                  />
                </label>
              )}
              <button class="button" type="submit" disabled={busy || !adult}>
                {busy ? "Please wait…" : sent ? "Confirm code" : "Send account code"}
              </button>
              {sent && (
                <button
                  type="button"
                  class="text-button"
                  disabled={busy}
                  onClick={() => {
                    setSent(false);
                    setOtp("");
                  }}
                >
                  Use another address or request a new code
                </button>
              )}
            </form>
            <p class="small-note">
              No marketing signup. No guest choices, results or activity history are imported. We do
              not ask for your legal name, birth date or identity documents.
            </p>
          </section>
        )}
        {account && (
          <>
            <section class="entry-card">
              <h2>Account access</h2>
              <p>Signed in as {account.email}</p>
              <p>
                Email ownership: confirmed. Adult status:{" "}
                {account.adultStatus.selfDeclared ? "self-declared 18+" : "not declared"}.
                Independent age verification: unavailable.
              </p>
              <p>
                Verified-adult and restricted content are closed. No premium access is sold here.
              </p>
              <button
                type="button"
                class="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api("/api/account/adulthood", {
                      adult: !account.adultStatus.selfDeclared,
                    });
                    await refresh();
                  })
                }
              >
                {account.adultStatus.selfDeclared
                  ? "Withdraw adult declaration"
                  : "Declare I am 18 or older"}
              </button>
              <p class="small-note">
                Withdrawing your declaration also removes category approvals. A new sign-in asks for
                a new declaration.
              </p>
            </section>
            <section class="entry-card">
              <h2>Your category approvals</h2>
              <p>
                These optional approvals cover the current non-explicit preview categories. Each
                activity still needs your own decision. The guest wheel keeps its separate choices
                in memory.
              </p>
              {CATEGORIES.map((category) => (
                <label class="check-label" key={category.id}>
                  <input
                    type="checkbox"
                    checked={account.categoryApprovals.includes(category.id)}
                    disabled={busy || !account.adultStatus.selfDeclared}
                    onChange={(event) => {
                      const approved = event.currentTarget.checked;
                      void run(async () => {
                        await api("/api/account/categories", { category: category.id, approved });
                        await refresh();
                      });
                    }}
                  />
                  {category.name}
                </label>
              ))}
            </section>
            <section class="entry-card">
              <h2>Sessions & recovery</h2>
              <p>
                Sessions expire after seven days, or after 24 hours without account use. Session
                labels show times only; we do not save IP addresses or device descriptions.
              </p>
              <ul>
                {sessions.map((session) => (
                  <li key={session.id}>
                    {session.current ? "This session" : "Other session"} · started{" "}
                    {new Date(session.createdAt).toLocaleString()}{" "}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api("/api/account/revoke", { sessionId: session.id });
                          await refresh();
                        })
                      }
                    >
                      End session
                    </button>
                  </li>
                ))}
              </ul>
              <button
                class="button"
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api("/api/account/revoke", { all: true });
                    refreshEpoch.current++;
                    setAccount(null);
                    setSessions([]);
                    setMessage("All sessions ended.");
                  })
                }
              >
                End all sessions
              </button>{" "}
              <button
                class="text-button"
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api("/api/auth/sign-out", {});
                    refreshEpoch.current++;
                    setAccount(null);
                    setSessions([]);
                    setMessage("Signed out.");
                  })
                }
              >
                Sign out
              </button>
              <p>
                <button
                  type="button"
                  class="text-button"
                  onClick={() => {
                    setEmail(account.email);
                    setReauth(true);
                    setSent(false);
                    document.getElementById("main")?.focus();
                  }}
                >
                  Sign in again for recovery or deletion
                </button>
              </p>
              <p class="small-note">
                If you lose access to your inbox, account recovery is unavailable. Email changes and
                passkeys are not supported in this release.
              </p>
            </section>
            <section class="entry-card">
              <h2>Delete your account</h2>
              <p>
                Deletion immediately removes your account, sessions, adult declaration and category
                approvals from the live database. Backups age out within 30 days. A minimal deletion
                marker prevents account restoration. This cannot remove emails already in your
                inbox.
              </p>
              {!account.freshAuthentication && (
                <p>
                  Sign in again before deleting. Confirmation requires a sign-in within the last
                  five minutes.
                </p>
              )}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    await api("/api/account/delete", { confirmation });
                    refreshEpoch.current++;
                    setAccount(null);
                    setSessions([]);
                    setConfirmation("");
                    setMessage("Your account has been deleted.");
                  });
                }}
              >
                <label>
                  Type DELETE to confirm
                  <input
                    value={confirmation}
                    autoComplete="off"
                    onInput={(event) => setConfirmation(event.currentTarget.value)}
                  />
                </label>
                <button class="button" type="submit" disabled={busy || confirmation !== "DELETE"}>
                  Delete my account
                </button>
              </form>
            </section>
          </>
        )}
        <p>
          <a href="/privacy/">Privacy & discretion</a> · <a href="/play/">Continue as a guest</a>
        </p>
      </main>
      <footer class="wrap site-footer">
        <p>Curiosity is optional. Boundaries are mandatory.</p>
      </footer>
    </>
  );
}
const root = document.getElementById("app");
if (root) render(<AccountPage />, root);
