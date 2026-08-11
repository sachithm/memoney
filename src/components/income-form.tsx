"use client";

import { useState } from "react";
import { INPUT_CLASSES } from "@/lib/form-classes";

interface IncomeFormProps {
  onSuccess: () => void;
}

const INCOME_CATEGORIES = [
  "Salary",
  "Bonus",
  "Dividend",
  "Interest",
  "Side Income",
  "Other",
];

export default function IncomeForm({ onSuccess }: IncomeFormProps) {
  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Salary");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !amount || !description) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/manual/income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          amount: parseFloat(amount),
          description,
          category,
        }),
      });

      if (!res.ok) throw new Error("Failed to save income");

      setDate(new Date().toISOString().slice(0, 10));
      setAmount("");
      setDescription("");
      setCategory("Salary");
      onSuccess();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
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
            className={INPUT_CLASSES}
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
            className={INPUT_CLASSES}
            placeholder="1200.00"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={INPUT_CLASSES}
          >
            {INCOME_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={INPUT_CLASSES}
            placeholder="August salary, freelance gig…"
            required
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={submitting || !amount || !description}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
      >
        {submitting ? "Saving…" : "Add Income"}
      </button>
    </form>
  );
}
