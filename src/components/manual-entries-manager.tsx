"use client";

import { useState } from "react";
import Link from "next/link";
import {
  formatCurrency,
  formatDate,
  toDateInputValue,
} from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────

interface BalanceEntry {
  id: string;
  date: string;
  amount: number;
  currency: string;
  source: string;
  isLiability: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface IncomeEntry {
  id: string;
  date: string;
  amount: number;
  description: string;
  category: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ExpenseEntry {
  id: string;
  date: string;
  amount: number;
  description: string;
  category: string;
  card: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type Tab = "balances" | "income" | "expenses";

interface ManualEntriesManagerProps {
  initialData: {
    balances: BalanceEntry[];
    incomes: IncomeEntry[];
    expenses: ExpenseEntry[];
  };
}

// ─── Constants ─────────────────────────────────────────────────

const INCOME_CATEGORIES = [
  "Salary",
  "Bonus",
  "Dividend",
  "Interest",
  "Side Income",
  "Other",
];

const EXPENSE_CATEGORIES = [
  "Food",
  "Travel",
  "Shopping",
  "Bills",
  "Entertainment",
  "Health",
  "Other",
];

// Explicit text-gray-900 ensures high contrast on white cards.
const INPUT_CLASSES =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

const SELECT_CLASSES =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

const API_BASE: Record<Tab, string> = {
  balances: "/api/manual/balances",
  income: "/api/manual/income",
  expenses: "/api/manual/expenses",
};

const TABLE_COLUMNS: Record<
  Tab,
  { key: string; label: string }[]
> = {
  balances: [
    { key: "date", label: "Date" },
    { key: "amount", label: "Amount" },
    { key: "source", label: "Source" },
    { key: "isLiability", label: "Type" },
  ],
  income: [
    { key: "date", label: "Date" },
    { key: "amount", label: "Amount" },
    { key: "description", label: "Description" },
    { key: "category", label: "Category" },
  ],
  expenses: [
    { key: "date", label: "Date" },
    { key: "amount", label: "Amount" },
    { key: "description", label: "Description" },
    { key: "category", label: "Category" },
    { key: "card", label: "Card" },
  ],
};

const TAB_LABEL: Record<Tab, string> = {
  balances: "balance",
  income: "income",
  expenses: "expense",
};

// ─── Array helpers (type-safe) ─────────────────────────

function patchItem<T extends { id: string }>(
  arr: T[],
  id: string,
  updated: Partial<T>,
): T[] {
  return arr.map((item) =>
    item.id === id ? { ...item, ...updated } : item,
  );
}

function removeItem<T extends { id: string }>(arr: T[], id: string): T[] {
  return arr.filter((item) => item.id !== id);
}

function prependItem<T>(arr: T[], item: T): T[] {
  return [item, ...arr];
}

// ─── Cell rendering helpers ─────────────────────────────

/** Display-mode cell content (no <td> wrapper). */
function displayContent(entry: Record<string, unknown>, key: string) {
  const val = entry[key];
  switch (key) {
    case "date":
      return (
        <span className="text-gray-500">
          {formatDate(val as string)}
        </span>
      );
    case "amount":
      return (
        <span className="font-medium text-gray-900">
          {formatCurrency(val as number)}
        </span>
      );
    case "isLiability":
      return val ? (
        <span className="px-2 py-0.5 text-xs font-medium text-red-700 bg-red-50 rounded-full">
          Liability
        </span>
      ) : (
        <span className="px-2 py-0.5 text-xs font-medium text-green-700 bg-green-50 rounded-full">
          Asset
        </span>
      );
    case "card":
      return <span className="text-gray-500">{val ? String(val) : "—"}</span>;
    default:
      return (
        <span className="text-gray-500">
          {val ? String(val) : "—"}
        </span>
      );
  }
}

/** Edit-mode cell content (no <td> wrapper). */
function editContent(
  tab: Tab,
  draft: Record<string, unknown>,
  key: string,
  onChange: (k: string, v: unknown) => void,
) {
  const val = draft[key];
  switch (key) {
    case "date":
      return (
        <input
          type="date"
          value={toDateInputValue(val as string)}
          onChange={(e) => onChange(key, e.target.value)}
          className={INPUT_CLASSES}
          required
        />
      );
    case "amount":
      return (
        <input
          type="number"
          step="0.01"
          value={val as string}
          onChange={(e) => onChange(key, e.target.value)}
          className={INPUT_CLASSES}
          placeholder="0.00"
          required
        />
      );
    case "isLiability":
      return (
        <input
          type="checkbox"
          checked={val as boolean}
          onChange={(e) => onChange(key, e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
      );
    case "category":
      return (
        <select
          value={val as string}
          onChange={(e) => onChange(key, e.target.value)}
          className={SELECT_CLASSES}
        >
          {(tab === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(
            (c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ),
          )}
        </select>
      );
    case "card":
      return (
        <input
          type="text"
          value={(val as string) || ""}
          onChange={(e) => onChange(key, e.target.value || null)}
          className={INPUT_CLASSES}
          placeholder="e.g. Amex"
        />
      );
    case "source":
    case "description":
      return (
        <input
          type="text"
          value={val as string}
          onChange={(e) => onChange(key, e.target.value)}
          className={INPUT_CLASSES}
          placeholder={key === "source" ? "Source" : "Description"}
        />
      );
    default:
      return <span>{String(val)}</span>;
  }
}

// ─── Component ─────────────────────────────────────────────────

export default function ManualEntriesManager({
  initialData,
}: ManualEntriesManagerProps) {
  // ─── Data state ──────────────────────────────────────
  const [balances, setBalances] = useState<BalanceEntry[]>(
    initialData.balances,
  );
  const [incomes, setIncomes] = useState<IncomeEntry[]>(initialData.incomes);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>(
    initialData.expenses,
  );

  // ─── UI state ────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("balances");
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<Record<string, unknown>>({});

  // Editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<Tab | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, unknown>>({});

  // Deletion
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingType, setDeletingType] = useState<Tab | null>(null);

  // Operation loading
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingSaving, setAddingSaving] = useState(false);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "balances", label: "Balances", count: balances.length },
    { id: "income", label: "Income", count: incomes.length },
    { id: "expenses", label: "Expenses", count: expenses.length },
  ];

  // ─── Edit handlers ───────────────────────────────────

  const startEdit = (type: Tab, entry: Record<string, unknown>) => {
    setEditingType(type);
    setEditingId(entry.id as string);
    const draft: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(entry)) {
      if (k === "amount") {
        draft[k] = String(v);
      } else if (v instanceof Date) {
        draft[k] = v.toISOString().slice(0, 10);
      } else {
        draft[k] = v;
      }
    }
    setEditDraft(draft);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingType(null);
    setEditDraft({});
  };

  const saveEdit = async () => {
    if (!editingId || !editingType) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...editDraft };
      if (typeof body.amount === "string") {
        const parsed = parseFloat(body.amount as string);
        if (isNaN(parsed)) throw new Error("Invalid amount");
        body.amount = parsed;
      }
      delete body.deletedAt;
      delete body.createdAt;
      delete body.updatedAt;
      delete body.id;

      const res = await fetch(`${API_BASE[editingType]}/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Failed to update: ${err}`);
      }
      const updated: unknown = await res.json();
      if (editingType === "balances") {
        setBalances((prev) =>
          patchItem(prev, editingId, updated as Partial<BalanceEntry>),
        );
      } else if (editingType === "income") {
        setIncomes((prev) =>
          patchItem(prev, editingId, updated as Partial<IncomeEntry>),
        );
      } else {
        setExpenses((prev) =>
          patchItem(prev, editingId, updated as Partial<ExpenseEntry>),
        );
      }
      cancelEdit();
    } catch (err) {
      console.error(err);
      alert((err as Error).message || "Failed to update entry");
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete handlers ─────────────────────────────────

  const startDelete = (type: Tab, id: string) => {
    setDeletingType(type);
    setDeletingId(id);
  };

  const cancelDelete = () => {
    setDeletingId(null);
    setDeletingType(null);
  };

  const confirmDelete = async () => {
    if (!deletingId || !deletingType) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE[deletingType]}/${deletingId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Failed to delete: ${err}`);
      }
      if (deletingType === "balances") {
        setBalances((prev) => removeItem(prev, deletingId));
      } else if (deletingType === "income") {
        setIncomes((prev) => removeItem(prev, deletingId));
      } else {
        setExpenses((prev) => removeItem(prev, deletingId));
      }
      cancelDelete();
    } catch (err) {
      console.error(err);
      alert((err as Error).message || "Failed to delete entry");
    } finally {
      setDeleting(false);
    }
  };

  // ─── Add handlers ────────────────────────────────────

  const openAdd = () => {
    setAdding(true);
    setAddForm({
      date: new Date().toISOString().slice(0, 10),
      amount: "",
      ...(activeTab === "balances" && {
        source: "",
        isLiability: false,
      }),
      ...(activeTab === "income" && {
        description: "",
        category: "Salary",
      }),
      ...(activeTab === "expenses" && {
        description: "",
        category: "Food",
        card: "",
      }),
    });
  };

  const closeAdd = () => {
    setAdding(false);
    setAddForm({});
  };

  const handleAddChange = (field: string, value: unknown) => {
    setAddForm((prev) => ({ ...prev, [field]: value }));
  };

  const submitAdd = async () => {
    if (!addForm.date || !addForm.amount) return;
    setAddingSaving(true);
    try {
      const body: Record<string, unknown> = { ...addForm };
      if (typeof body.amount === "string") {
        const parsed = parseFloat(body.amount as string);
        if (isNaN(parsed)) throw new Error("Invalid amount");
        body.amount = parsed;
      }
      const res = await fetch(API_BASE[activeTab], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Failed to add: ${err}`);
      }
      const newItem: unknown = await res.json();
      if (activeTab === "balances") {
        setBalances((prev) => prependItem(prev, newItem as BalanceEntry));
      } else if (activeTab === "income") {
        setIncomes((prev) => prependItem(prev, newItem as IncomeEntry));
      } else {
        setExpenses((prev) => prependItem(prev, newItem as ExpenseEntry));
      }
      closeAdd();
    } catch (err) {
      console.error(err);
      alert((err as Error).message || "Failed to add entry");
    } finally {
      setAddingSaving(false);
    }
  };

  const isRowEditing = (id: string) =>
    editingId === id && editingType === activeTab;
  const isRowDeleting = (id: string) =>
    deletingId === id && deletingType === activeTab;

  // ─── Render: add form ─────────────────────────────────

  const renderAddForm = () => {
    const isBalance = activeTab === "balances";
    const isIncome = activeTab === "income";

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">
            Add new {TAB_LABEL[activeTab]}
          </h3>
          <button
            onClick={closeAdd}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Date
            </label>
            <input
              type="date"
              value={(addForm.date as string) || ""}
              onChange={(e) => handleAddChange("date", e.target.value)}
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
              value={(addForm.amount as string) || ""}
              onChange={(e) => handleAddChange("amount", e.target.value)}
              className={INPUT_CLASSES}
              placeholder="0.00"
              required
            />
          </div>

          {isBalance && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Source
                </label>
                <input
                  type="text"
                  value={(addForm.source as string) || ""}
                  onChange={(e) => handleAddChange("source", e.target.value)}
                  className={INPUT_CLASSES}
                  placeholder="e.g. Monzo Checking"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={(addForm.isLiability as boolean) || false}
                    onChange={(e) =>
                      handleAddChange("isLiability", e.target.checked)
                    }
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Liability (reduces net worth)
                </label>
              </div>
            </>
          )}

          {isIncome && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={(addForm.description as string) || ""}
                  onChange={(e) =>
                    handleAddChange("description", e.target.value)
                  }
                  className={INPUT_CLASSES}
                  placeholder="August salary…"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  value={(addForm.category as string) || "Salary"}
                  onChange={(e) =>
                    handleAddChange("category", e.target.value)
                  }
                  className={SELECT_CLASSES}
                >
                  {INCOME_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {!isBalance && !isIncome && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={(addForm.description as string) || ""}
                  onChange={(e) =>
                    handleAddChange("description", e.target.value)
                  }
                  className={INPUT_CLASSES}
                  placeholder="Tesco, Uber…"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  value={(addForm.category as string) || "Food"}
                  onChange={(e) =>
                    handleAddChange("category", e.target.value)
                  }
                  className={SELECT_CLASSES}
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
                <input
                  type="text"
                  value={(addForm.card as string) || ""}
                  onChange={(e) =>
                    handleAddChange("card", e.target.value || null)
                  }
                  className={INPUT_CLASSES}
                  placeholder="e.g. Amex"
                />
              </div>
            </>
          )}
        </div>

        <button
          onClick={submitAdd}
          disabled={addingSaving || !addForm.date || !addForm.amount}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          {addingSaving ? "Saving…" : "Save entry"}
        </button>
      </div>
    );
  };

  // ─── Render: table ───────────────────────────────────

  const currentData =
    activeTab === "balances"
      ? balances.map((b) => b as unknown as Record<string, unknown>)
      : activeTab === "income"
        ? incomes.map((i) => i as unknown as Record<string, unknown>)
        : expenses.map((e) => e as unknown as Record<string, unknown>);

  const renderTable = () => {
    const columns = TABLE_COLUMNS[activeTab];

    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {currentData.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500">
              No {TAB_LABEL[activeTab]} entries yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {col.label}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {currentData.map((entry) => {
                  const id = entry.id as string;
                  const inEdit = isRowEditing(id);
                  const inDelete = isRowDeleting(id);

                  return (
                    <tr
                      key={id}
                      className={
                        inEdit
                          ? "bg-blue-50/30"
                          : "hover:bg-gray-50 transition-colors"
                      }
                    >
                      {inEdit ? (
                        // ── Edit mode ──
                        <>
                          {columns.map((col) => (
                            <td key={col.key} className="px-4 py-2">
                              {editContent(
                                activeTab,
                                editDraft,
                                col.key,
                                (k, v) =>
                                  setEditDraft((p) => ({ ...p, [k]: v })),
                              )}
                            </td>
                          ))}
                          <td className="px-4 py-2.5">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={saveEdit}
                                disabled={saving}
                                className="px-3 py-1 text-xs font-medium text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                              >
                                {saving ? "Saving…" : "Save"}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : inDelete ? (
                        // ── Delete confirmation mode ──
                        <>
                          {columns.map((col) => (
                            <td key={col.key} className="px-4 py-2">
                              {displayContent(entry, col.key)}
                            </td>
                          ))}
                          <td className="px-4 py-2.5">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={confirmDelete}
                                disabled={deleting}
                                className="px-3 py-1 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                              >
                                {deleting ? "Deleting…" : "Confirm"}
                              </button>
                              <button
                                onClick={cancelDelete}
                                className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        // ── Normal display mode ──
                        <>
                          {columns.map((col) => (
                            <td key={col.key} className="px-4 py-2">
                              {displayContent(entry, col.key)}
                            </td>
                          ))}
                          <td className="px-4 py-2.5">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => startEdit(activeTab, entry)}
                                className="p-1 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                title="Edit"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => startDelete(activeTab, id)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded-lg transition"
                                title="Delete"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // ─── Main render ─────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">
              Manual Entries
            </h1>
            <Link
              href="/"
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              ← Back to Dashboard
            </Link>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Manage all manually-added balance, income, and expense entries.
            Edit rows in-line or delete with confirmation.
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab navigation */}
        <div className="mb-6 flex gap-1 bg-white rounded-lg shadow p-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  cancelEdit();
                  cancelDelete();
                  closeAdd();
                }}
                className={
                  "px-4 py-2 rounded-lg text-sm font-medium transition " +
                  (isActive
                    ? "bg-blue-600 text-white shadow"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50")
                }
              >
                {tab.label} ({tab.count})
              </button>
            );
          })}
        </div>

        {/* Add new entry */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          {!adding ? (
            <div className="flex items-center justify-between">
              <button
                onClick={openAdd}
                className="px-4 py-2 text-sm font-medium text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition"
              >
                ＋ Add new {TAB_LABEL[activeTab]}
              </button>
              <button
                onClick={() => window.location.reload()}
                className="text-xs text-gray-500 hover:text-gray-700"
                title="Refresh"
              >
                Refresh
              </button>
            </div>
          ) : (
            renderAddForm()
          )}
        </div>

        {/* Data table */}
        {renderTable()}
      </main>
    </div>
  );
}
