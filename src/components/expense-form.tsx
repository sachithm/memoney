"use client";

import { useState } from "react";
import { INPUT_CLASSES } from "@/lib/form-classes";

interface ExpenseFormProps {
  onSuccess: () => void;
}

const EXPENSE_CATEGORIES = [
  "Food",
  "Travel",
  "Shopping",
  "Bills",
  "Entertainment",
  "Health",
  "Other",
];

const CARD_OPTIONS = ["Amex", "Monzo Credit", "HSBC Credit", "Other"];

export default function ExpenseForm({ onSuccess }: ExpenseFormProps) {
  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Food");
  const [card, setCard] = useState("");
  const [customCard, setCustomCard] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !amount || !description) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/manual/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          amount: parseFloat(amount),
          description,
          category,
          card: card === "Other" ? customCard || undefined : card || undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to save expense");

      setDate(new Date().toISOString().slice(0, 10));
      setAmount("");
      setDescription("");
      setCategory("Food");
      setCard("");
      setCustomCard("");
      onSuccess();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
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
            placeholder="45.99"
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
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Card
          </label>
          <select
            value={card}
            onChange={(e) => setCard(e.target.value)}
            className={INPUT_CLASSES}
          >
            <option value="">No card</option>
            {CARD_OPTIONS.map((c) => (
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
            placeholder="Tesco, Uber, Netflix…"
            required
          />
        </div>
      </div>

      {card === "Other" && (
        <input
          type="text"
          value={customCard}
          onChange={(e) => setCustomCard(e.target.value)}
          className={INPUT_CLASSES}
          placeholder="Custom card name"
        />
      )}

      <button
        type="submit"
        disabled={submitting || !amount || !description}
        className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
      >
        {submitting ? "Saving…" : "Add Expense"}
      </button>
    </form>
  );
}
