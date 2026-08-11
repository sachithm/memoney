"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/** The connection statuses we care about on the front end. */
type ConnectionStatus = "PENDING" | "AUTHORIZED" | "FAILED" | "DELETED" | "UNKNOWN";

/** Final outcome shown to the user once polling settles. */
type Outcome = "loading" | "connected" | "failed";

interface PollResult {
  outcome: Outcome;
  /** Optional human-readable detail shown alongside a failed outcome. */
  detail: string | null;
}

/**
 * This page is the `redirect_uri` that TrueLayer sends the user back to after
 * they complete (or cancel) the bank selection/auth journey.
 *
 * The authoritative `connection.authorized` event arrives via the TrueLayer
 * webhook (signature-verified in `/api/webhooks/truelayer`), but we poll our
 * own connection-status endpoint here so the user gets immediate feedback
 * instead of waiting for the webhook to land.
 */
export default function AuthCallbackPage() {
  const [result, setResult] = useState<PollResult>({
    outcome: "loading",
    detail: null,
  });

  useEffect(() => {
    // TrueLayer redirects back with `?connection_id=...`. An `error` query
    // param indicates the bank/consent flow itself rejected the user.
    const urlParams = new URLSearchParams(window.location.search);
    const connectionId = urlParams.get("connection_id");
    const paramError = urlParams.get("error");

    // AbortController + a `cancelled` flag let us tear down the polling loop
    // (in-flight fetch + pending setTimeout) when the component unmounts.
    const controller = new AbortController();
    const intervalMs = 2000; // 2s between checks
    const maxAttempts = 15; // ~30s of polling
    let attempts = 0;
    let cancelled = false;

    const check = async () => {
      attempts += 1;

      if (paramError) {
        setResult({ outcome: "failed", detail: paramError });
        return;
      }

      if (!connectionId) {
        // No connection_id in the URL — nothing to poll; assume success and let
        // the webhook-driven status update on the dashboard confirm it.
        setResult({
          outcome: "connected",
          detail:
            "Your bank is being verified. The connection will appear on the dashboard shortly.",
        });
        return;
      }

      try {
        const res = await fetch(`/api/data/connections/${connectionId}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!res.ok) {
          // Endpoint not ready / not found — fall back to connected so the UX
          // isn't blocked by a missing id, then rely on the webhook.
          if (res.status === 404 && attempts <= 3) {
            if (!cancelled) setTimeout(check, intervalMs);
            return;
          }
          setResult({
            outcome: "failed",
            detail: `Could not verify connection status (HTTP ${res.status})`,
          });
          return;
        }

        const body = (await res.json()) as {
          connection: { status: string } | null;
        };

        if (!body.connection) {
          setResult({ outcome: "failed", detail: "Connection not found" });
          return;
        }

        const status = body.connection.status as ConnectionStatus;
        if (status === "AUTHORIZED") {
          setResult({ outcome: "connected", detail: null });
        } else if (status === "FAILED" || status === "DELETED") {
          setResult({
            outcome: "failed",
            detail: `Connection ${status.toLowerCase()}`,
          });
        } else {
          // PENDING (or anything else) — keep polling until the budget runs out.
          if (attempts < maxAttempts && !cancelled) {
            setTimeout(check, intervalMs);
          } else {
            setResult({
              outcome: "failed",
              detail:
                "Connection is still pending. Check back on the dashboard.",
            });
          }
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (cancelled) return;
        setResult({
          outcome: "failed",
          detail: "An error occurred while verifying your connection",
        });
      }
    };

    // Kick off the first check, then continue via setTimeout.
    check();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const { outcome, detail } = result;

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        {outcome === "loading" ? (
          <>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <h2 className="text-xl font-semibold">Verifying your connection…</h2>
            <p className="text-sm text-gray-500">
              This window will close automatically.
            </p>
          </>
        ) : outcome === "connected" ? (
          <>
            <div className="text-green-500 text-4xl">✓</div>
            <h2 className="text-xl font-semibold">Bank connected!</h2>
            <p className="text-sm text-gray-500">
              {detail ||
                "Your accounts will appear on the dashboard shortly."}
            </p>
            <Link href="/" className="text-blue-600 hover:underline">
              Back to dashboard
            </Link>
          </>
        ) : (
          <>
            <div className="text-red-500 text-4xl">✗</div>
            <h2 className="text-xl font-semibold">Connection failed</h2>
            {detail && <p className="text-sm text-gray-600">{detail}</p>}
            <Link href="/" className="text-blue-600 hover:underline">
              Try again
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
