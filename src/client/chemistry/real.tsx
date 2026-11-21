import type { JSX } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";
import type { ChemistryDepth } from "../../content/chemistry/questions";
import { RealAssessmentDetail } from "./RealDetail";
import { ChemistryReport } from "./Report";
import { messageForError, type OwnView, type ReportPayload, realApi } from "./real-types";

export function RealAssessments(): JSX.Element | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [items, setItems] = useState<OwnView[]>([]);
  const [inviteToken, setInviteToken] = useState("");
  const [confirmLabel, setConfirmLabel] = useState("");
  const [depth, setDepth] = useState<ChemistryDepth>(25);
  const [inviteeLabel, setInviteeLabel] = useState("");
  const [created, setCreated] = useState<{ url: string; label: string } | null>(null);
  const [view, setView] = useState<OwnView | null>(null);
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshList = useCallback(async () => {
    try {
      const body = await realApi<{ assessments: OwnView[] }>("/assessments");
      setItems(body.assessments);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const token = new URLSearchParams(location.hash.slice(1)).get("invite");
    if (token) {
      setInviteToken(token);
      history.replaceState(null, "", location.pathname + location.search);
    }
    void (async () => {
      try {
        await realApi<{ available: boolean }>("/status");
        if (cancelled) return;
        setAvailable(true);
      } catch {
        if (!cancelled) setAvailable(false);
        return;
      }
      const response = await fetch("/api/account", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (cancelled) return;
      setSignedIn(response.ok);
      if (response.ok) await refreshList();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshList]);

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (error) {
      setMessage(messageForError(error));
    } finally {
      setBusy(false);
    }
  };

  const open = (item: OwnView) =>
    act(async () => {
      const body = await realApi<{ assessment: OwnView }>(`/assessments/${item.id}`);
      setView(body.assessment);
      setReport(null);
      setCreated(null);
    });

  const create = () =>
    act(async () => {
      const body = await realApi<{
        assessment: OwnView;
        invitation: { token: string; inviteeLabel: string };
      }>("/assessments", { body: { depth, inviteeLabel } });
      setCreated({
        url: `${location.origin}/chemistry/#invite=${body.invitation.token}`,
        label: body.invitation.inviteeLabel,
      });
      setView(body.assessment);
      setInviteeLabel("");
      await refreshList();
    });

  const accept = () =>
    act(async () => {
      const body = await realApi<{ assessmentId: string }>("/invitations/accept", {
        body: { token: inviteToken, confirmLabel },
      });
      history.replaceState(null, "", location.pathname + location.search);
      setInviteToken("");
      setConfirmLabel("");
      const loaded = await realApi<{ assessment: OwnView }>(`/assessments/${body.assessmentId}`);
      setView(loaded.assessment);
      await refreshList();
    });

  const withdraw = (id: string, method: "POST" | "DELETE") =>
    act(async () => {
      await realApi(`/assessments/${id}${method === "DELETE" ? "" : "/withdraw"}`, { method });
      setView(null);
      setReport(null);
      await refreshList();
    });

  if (available !== true) return null;

  if (signedIn === false) {
    return (
      <section class="chemistry-panel chemistry-real" aria-labelledby="chemistry-real-title">
        <h2 id="chemistry-real-title">Real two-person assessments</h2>
        <p>
          This signed-in flow is available for review. Sign in with your own account to create or
          accept an assessment.
        </p>
        <a class="button button-outline" href="/account/">
          Sign in
        </a>
      </section>
    );
  }

  if (report && view) {
    return (
      <section class="chemistry-real">
        <ChemistryReport
          report={report.report}
          depthName={`${view.depth}-question assessment`}
          onEdit={() => setReport(null)}
          onRestart={() => {
            setReport(null);
            setView(null);
            void refreshList();
          }}
          onAnswerMore={() => setReport(null)}
          onSample={() => setReport(null)}
        />
        <p class="chemistry-note">
          Report access ends {new Date(report.expiresAt * 1000).toLocaleDateString()}. Either person
          can withdraw earlier, which revokes it immediately.
        </p>
      </section>
    );
  }

  if (view) {
    return (
      <RealAssessmentDetail
        view={view}
        created={created}
        message={message}
        busy={busy}
        onClose={() => {
          setView(null);
          setCreated(null);
          setMessage("");
          void refreshList();
        }}
        onReload={async () => {
          const body = await realApi<{ assessment: OwnView }>(`/assessments/${view.id}`);
          setView(body.assessment);
        }}
        onReport={setReport}
        onWithdraw={withdraw}
        onMessage={setMessage}
      />
    );
  }

  return (
    <section class="chemistry-panel chemistry-real" aria-labelledby="chemistry-real-title">
      <h2 id="chemistry-real-title">Real two-person assessments</h2>
      <p>
        Independent accounts, encrypted answers and mutual release approval. Neither person sees the
        other's answers, and accepting a link never creates a couple.
      </p>
      {message ? <p class="chemistry-warning">{message}</p> : null}

      {inviteToken ? (
        <div class="chemistry-real-block">
          <h3>You have an invitation</h3>
          <label class="chemistry-field">
            <span>Confirm the name you were invited as</span>
            <input
              type="text"
              maxLength={40}
              value={confirmLabel}
              onInput={(event) => setConfirmLabel(event.currentTarget.value)}
            />
          </label>
          <div class="chemistry-actions">
            <button
              type="button"
              class="button"
              disabled={busy || confirmLabel.trim().length === 0}
              onClick={accept}
            >
              Accept assessment invitation
            </button>
            <button
              type="button"
              class="text-link"
              onClick={() => {
                history.replaceState(null, "", location.pathname + location.search);
                setInviteToken("");
              }}
            >
              Not now
            </button>
          </div>
          <p class="chemistry-note">
            An invitation is not a login and grants no access to the other person's account. You can
            withdraw at any time.
          </p>
        </div>
      ) : null}

      <div class="chemistry-real-block">
        <h3>Start an assessment</h3>
        <div class="chemistry-modes">
          {[25, 50, 100].map((value) => (
            <label class={`chemistry-mode${depth === value ? " is-selected" : ""}`} key={value}>
              <input
                type="radio"
                name="real-depth"
                checked={depth === value}
                onChange={() => setDepth(value as ChemistryDepth)}
              />
              <span>{value} questions</span>
            </label>
          ))}
        </div>
        <label class="chemistry-field">
          <span>Who is this invitation for?</span>
          <input
            type="text"
            maxLength={40}
            value={inviteeLabel}
            onInput={(event) => setInviteeLabel(event.currentTarget.value)}
            placeholder="A first name or nickname they will recognise"
          />
        </label>
        <button
          type="button"
          class="button"
          disabled={busy || inviteeLabel.trim().length === 0}
          onClick={create}
        >
          Create invitation
        </button>
        <p class="chemistry-note">
          The label is not sent automatically and is not an account lookup. Anyone who knows the
          link and label can accept. Confirm who joined through a trusted channel before submitting.
          The label does not verify identity.
        </p>
      </div>

      {items.length ? (
        <div class="chemistry-real-block">
          <h3>Your assessments</h3>
          <ul class="chemistry-real-list">
            {items.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.depth}-question assessment</strong>
                  <p class="chemistry-note">
                    {item.status.replaceAll("_", " ")} · you are the {item.role}
                  </p>
                </div>
                <button type="button" class="button button-small" onClick={() => open(item)}>
                  Open
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
