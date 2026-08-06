"use client";

import { useState, useEffect } from "react";

interface BalanceSource {
  id: string;
  name: string;
}

interface BalanceFormProps {
  onSuccess: () => void;
}

export default function BalanceForm({ onSuccess }: BalanceFormProps) {
  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("");
  const [isLiability, setIsLiability] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sources, setSources] = useState<BalanceSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [showNewSource, setShowNewSource] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");

  // Load existing sources on mount
  useEffect(() => {
    fetch("/api/manual/sources")
      .then((res) => res.ok ? res.json() : [])
      .then((data: BalanceSource[]) => setSources(data))
      .catch(() => {
        // Sources not configured — user can still type a source
      })
      .finally(() => setLoadingSources(false));
  }, []);

  const loadSources = () => {
    fetch("/api/manual/sources")
      .then((res) => res.ok ? res.json() : [])
      .then((data: BalanceSource[]) => setSources(data))
      .catch(() => {});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !amount || !source) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/manual/balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          amount: parseFloat(amount),
          source,
          isLiability,
        }),
      });

      if (!res.ok) throw new Error("Failed to save balance");

      // Reset form
      setDate(new Date().toISOString().slice(0, 10));
      setAmount("");
      setSource("");
      setIsLiability(false);
      setShowNewSource(false);
      setNewSourceName("");
      onSuccess();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === "__new__") {
      setShowNewSource(true);
    } else {
      setShowNewSource(false);
      setSource(value);
    }
  };

  const handleNewSourceBlur = async () => {
    if (newSourceName.trim() && !sources.some((s) => s.name === newSourceName.trim())) {
      const res = await fetch("/api/manual/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSourceName.trim() }),
      });
      if (res.ok) {
        await loadSources();
      }
    }
    setShowNewSource(false);
    setNewSourceName("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Amount (£)
          </label>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="+5000 or -1000"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Balance Source
          </label>
          {showNewSource ? (
            <div className="flex gap-1">
              <input
                type="text"
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
                onBlur={handleNewSourceBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleNewSourceBlur();
                  }
                }}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Type new source…"
                autoFocus
              />
              <button
                type="button"
                onClick={handleNewSourceBlur}
                className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
              >
                ✓
              </button>
            </div>
          ) : (
            <select
              value={source}
              onChange={handleSourceChange}
              disabled={loadingSources}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
            >
              <option value="">— Select or create source —</option>
              {sources.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
              <option value="__new__">＋ New source…</option>
            </select>
          )}
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={isLiability}
              onChange={(e) => setIsLiability(e.target.checked)}
              className="rounded"
            />
            Liability (reduces net worth)
          </label>
        </div>
      </div>
      <button
        type="submit"
        disabled={submitting || !amount || !source}
        className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
      >
        {submitting ? "Saving…" : "Add Balance Entry"}
      </button>
    </form>
  );
}
