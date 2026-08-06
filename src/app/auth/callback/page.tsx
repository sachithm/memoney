"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * This page is the `redirect_uri` that TrueLayer sends the user back to
 * after they complete (or cancel) the bank selection/auth journey.
 *
 * The actual connection status is updated via the `connection.authorized`
 * webhook, but we poll our own API here to give the user immediate feedback.
 */
export default function AuthCallbackPage() {
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState<"loading" | "connected" | "failed">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        // The user returns with connection info in the URL query.
        // TrueLayer redirects with `?connection_id=...` (or similar).
        const urlParams = new URLSearchParams(window.location.search);
        const connectionId = urlParams.get("connection_id");
        const error = urlParams.get("error");

        if (error) {
          setStatus("failed");
          setError(error);
          return;
        }

        if (!connectionId) {
          // No connection_id in URL — just show the page
          setStatus("connected");
          return;
        }

        // Poll our backend for connection status
        // (the webhook may take a moment to fire)
        const res = await fetch(`/api/data/connections/${connectionId}`);
        if (res.ok) {
          setStatus("connected");
        } else {
          setStatus("failed");
          setError("Could not verify connection status");
        }
      } catch {
        setStatus("failed");
        setError("An error occurred");
      } finally {
        setChecking(false);
      }
    };

    checkConnection();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        {checking ? (
          <>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <h2 className="text-xl font-semibold">Verifying your connection…</h2>
            <p className="text-sm text-gray-500">
              This window will close automatically.
            </p>
          </>
        ) : status === "connected" ? (
          <>
            <div className="text-green-500 text-4xl">✓</div>
            <h2 className="text-xl font-semibold">Bank connected!</h2>
            <p className="text-sm text-gray-500">
              Your accounts will appear on the dashboard shortly.
            </p>
            <Link href="/" className="text-blue-600 hover:underline">
              Back to dashboard
            </Link>
          </>
        ) : (
          <>
            <div className="text-red-500 text-4xl">✗</div>
            <h2 className="text-xl font-semibold">Connection failed</h2>
            {error && <p className="text-sm text-gray-600">{error}</p>}
            <Link href="/" className="text-blue-600 hover:underline">
              Try again
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
