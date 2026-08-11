"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import NetWorthChart from "@/components/networth-chart";
import BalanceForm from "@/components/balance-form";
import IncomeForm from "@/components/income-form";
import ExpenseForm from "@/components/expense-form";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ManualData, type DashboardInitialData } from "@/lib/types";

interface DashboardProps {
  initialData: DashboardInitialData;
}

export default function DashboardClient({ initialData }: DashboardProps) {
  const { connections, accounts, trading212 } = initialData;

  // Only the manual net-worth block changes when the user adds an entry, so it
  // lives in client state — allowing a targeted refetch instead of a full
  // page reload (which would also re-run the rate-limited T212 + bank queries).
  const [manual, setManual] = useState<ManualData>(initialData.manual);

  const [connecting, setConnecting] = useState(false);
  const [connectingSaltEdge, setConnectingSaltEdge] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [refreshing, setRefreshing] = useState<string | null>(null);

  /** Refetch just the manual net-worth payload and update it in place. */
  const refreshNetworth = useCallback(async () => {
    try {
      const res = await fetch("/api/manual/networth", { cache: "no-store" });
      if (res.ok) {
        const data: ManualData = await res.json();
        setManual(data);
      }
    } catch (e) {
      console.error("Failed to refresh net worth:", e);
    }
  }, []);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      const res = await fetch("/api/auth/connect", { method: "POST" });
      const data = await res.json();
      if (data.linkUri) {
        window.location.href = data.linkUri;
      }
    } catch {
      console.error("Failed to connect");
    } finally {
      setConnecting(false);
    }
  }, []);

  const handleSaltEdgeConnect = useCallback(async () => {
    if (!selectedProvider) return;
    setConnectingSaltEdge(true);
    try {
      const res = await fetch("/api/saltedge/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_code: selectedProvider }),
      });
      const data = await res.json();
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    } catch {
      console.error("Salt Edge connect failed");
    } finally {
      setConnectingSaltEdge(false);
    }
  }, [selectedProvider]);

  const handleRefresh = useCallback(async (connectionId: string) => {
    setRefreshing(connectionId);
    try {
      const res = await fetch("/api/data/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      if (res.ok) {
        // Reload to pick up fresh data (transactions arrive async via webhook)
        window.location.reload();
      }
    } catch {
      console.error("Refresh failed");
    } finally {
      setRefreshing(null);
    }
  }, []);

  const totalBankBalance = useMemo(
    () => accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0),
    [accounts],
  );
  const totalTrading212Value = useMemo(
    () => trading212.account?.totalValue || 0,
    [trading212],
  );
  const totalCombinedValue = useMemo(
    () => totalBankBalance + totalTrading212Value,
    [totalBankBalance, totalTrading212Value],
  );

  const statusColors = useMemo<Record<string, string>>(
    () => ({
      AUTHORIZED: "bg-green-100 text-green-800",
      PENDING: "bg-yellow-100 text-yellow-800",
      FAILED: "bg-red-100 text-red-800",
      DELETED: "bg-gray-100 text-gray-800",
    }),
    [],
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                memoney — Net worth tracker
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Track your net worth, bank accounts, and Trading 212 holdings
                over time.
              </p>
            </div>
            <Link
              href="/"
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              ← Back to tools
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex flex-col sm:flex-row gap-4 items-start">
          <div>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {connecting ? "Connecting…" : "Connect Bank (TrueLayer)"}
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 items-end">
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Select UK bank…</option>
              <option value="monzo">Monzo</option>
              <option value="revolut">Revolut</option>
              <option value="hsbc">HSBC</option>
              <option value="barclays">Barclays</option>
              <option value="starling">Starling</option>
              <option value="tsb">TSB</option>
              <option value="natwest">NatWest</option>
              <option value="lloyds">Lloyds</option>
              <option value="santander">Santander</option>
            </select>
            <button
              onClick={handleSaltEdgeConnect}
              disabled={connectingSaltEdge || !selectedProvider}
              className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 transition"
            >
              {connectingSaltEdge ? "Connecting…" : "Connect via Open Banking"}
            </button>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Net Worth
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-3xl font-bold text-gray-900">
                {manual.summary.netWorth !== 0
                  ? formatCurrency(manual.summary.netWorth)
                  : totalCombinedValue > 0
                  ? `£${totalCombinedValue.toFixed(2)}`
                  : "—"}
              </p>
              <p className="text-sm text-gray-500 mt-1">Total net worth</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-3xl font-bold text-blue-600">
                {manual.summary.totalAssets !== 0
                  ? formatCurrency(manual.summary.totalAssets)
                  : totalBankBalance > 0
                  ? `£${totalBankBalance.toFixed(2)}`
                  : "—"}
              </p>
              <p className="text-sm text-gray-500 mt-1">Total assets</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-3xl font-bold text-red-600">
                {manual.summary.totalLiabilities > 0
                  ? `-${formatCurrency(manual.summary.totalLiabilities)}`
                  : "£0.00"}
              </p>
              <p className="text-sm text-gray-500 mt-1">Total liabilities</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-3xl font-bold text-purple-600">
                {formatCurrency(totalTrading212Value)}
              </p>
              <p className="text-sm text-gray-500 mt-1">Trading 212</p>
            </div>
          </div>

          {/* Net Worth Chart */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Net Worth Over Time
            </h3>
            <NetWorthChart data={manual.timeSeries} />
          </div>

          {/* Income / Expense / Savings Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm text-gray-500 mb-1">Total Income</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(manual.summary.income.total)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Savings rate: {manual.summary.income.savingsRate}%
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm text-gray-500 mb-1">Total Expenses</p>
              <p className="text-2xl font-bold text-red-600">
                {formatCurrency(manual.summary.expenses.total)}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm text-gray-500 mb-1">Net Savings</p>
              <p
                className={`text-2xl font-bold ${
                  manual.summary.monthlySavings >= 0
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {formatCurrency(manual.summary.monthlySavings)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Last 30 days • All sources combined
              </p>
            </div>
          </div>

          {/* Income breakdown by category */}
          {manual.income.byCategory.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Income by category
              </h4>
              <div className="flex flex-wrap gap-3">
                {manual.income.byCategory.map((c) => (
                  <div
                    key={c.category}
                    className="bg-gray-50 px-3 py-1 rounded-full text-xs"
                  >
                    {c.category}: {formatCurrency(c.total)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expense breakdown by category */}
          {manual.expenses.byCategory.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Expenses by category
              </h4>
              <div className="flex flex-wrap gap-3">
                {manual.expenses.byCategory.map((c) => (
                  <div
                    key={c.category}
                    className="bg-gray-50 px-3 py-1 rounded-full text-xs"
                  >
                    {c.category}: {formatCurrency(c.total)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Connections
            </h2>
            {connections.length === 0 ? (
              <p className="text-gray-500">
                No connections yet. Connect a bank to get started.
              </p>
            ) : (
              <div className="space-y-3">
                {connections.map((conn) => (
                  <div
                    key={conn.id}
                    className="bg-white rounded-lg shadow p-4 flex justify-between items-center"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {conn.providerId || "Unknown provider"}
                      </p>
                      <p className="text-xs text-gray-500">
                        via {conn.source}
                      </p>
                      <p className="text-sm text-gray-500">
                        {formatDate(conn.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {conn.status === "AUTHORIZED" && conn.connectionId && (
                        <button
                          onClick={() => handleRefresh(conn.id)}
                          disabled={refreshing === conn.id}
                          className="text-xs px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
                        >
                          {refreshing === conn.id ? "Refreshing…" : "Refresh"}
                        </button>
                      )}
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          statusColors[conn.status] || "bg-gray-100"
                        }`}
                      >
                        {conn.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Accounts
            </h2>
            {accounts.length === 0 ? (
              <p className="text-gray-500">
                No accounts found. Connect a bank and refresh to see your
                accounts here.
              </p>
            ) : (
              <div className="space-y-3">
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="bg-white rounded-lg shadow p-4"
                  >
                    <div className="flex justify-between">
                      <p className="font-medium text-gray-900">{acc.name}</p>
                      <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                        {acc.type}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      {acc.currency} {acc.balance?.toFixed(2)}
                    </p>
                    {acc.iban && (
                      <p className="text-xs text-gray-400">
                        IBAN: {acc.iban}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Trading 212 section */}
        <div className="mt-8">
          {trading212.error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">
                Trading 212 error: {trading212.error}
              </p>
            </div>
          ) : trading212.account ? (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Trading 212
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-white rounded-lg shadow p-6">
                  <p className="text-3xl font-bold text-gray-900">
                    £{trading212.account.totalValue.toFixed(2)}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Total value ({trading212.account.currency})
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-gray-500">Cash available</p>
                      <p className="font-medium">
                        £{trading212.account.cash.availableToTrade.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Invested</p>
                      <p className="font-medium">
                        £{trading212.account.investments.currentValue.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
                {trading212.positions.length > 0 && (
                  <div className="bg-white rounded-lg shadow p-6">
                    <p className="font-semibold text-gray-900 mb-2">
                      Holdings ({trading212.positions.length})
                    </p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {trading212.positions.map((pos) => (
                        <div
                          key={pos.ticker}
                          className="flex justify-between text-sm"
                        >
                          <span className="text-gray-700">{pos.ticker}</span>
                          <span className="text-gray-500">
                            {pos.quantity} × £{pos.currentPrice.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {trading212.transactions.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-3">
                    Recent Transactions
                  </h3>
                  <div className="bg-white rounded-lg shadow overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Type
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Amount
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Date
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {trading212.transactions.slice(0, 10).map((tx) => (
                          <tr key={tx.reference}>
                            <td className="px-4 py-2 text-sm text-gray-700">
                              {tx.type}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-500">
                              {tx.currency} {tx.amount.toFixed(2)}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-500">
                              {formatDate(tx.dateTime)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500">
              Trading 212 not configured. Add{" "}
              <code className="bg-gray-100 px-1 rounded">
                TRADING212_API_KEY
              </code>{" "}
              to your .env to show investment data.
            </p>
          )}
        </div>

        {/* Manual Data Entry section */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Manual Entries
            </h2>
            <Link
              href="/manual"
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Manage all manual entries →
            </Link>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Balance Entry Form */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3">
                Balance
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                Snapshot an account balance on any date (assets or liabilities).
              </p>
              <BalanceForm onSuccess={refreshNetworth} />
            </div>

            {/* Income Entry Form */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3">
                Income
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                Record a paycheque, dividend, or other income.
              </p>
              <IncomeForm onSuccess={refreshNetworth} />
            </div>

            {/* Expense Entry Form */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3">
                Expense
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                Record a credit card payment or cash expense.
              </p>
              <ExpenseForm onSuccess={refreshNetworth} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
