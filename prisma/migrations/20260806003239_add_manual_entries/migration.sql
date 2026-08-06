-- CreateTable
CREATE TABLE "BalanceEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "source" TEXT NOT NULL,
    "isLiability" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "IncomeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Other',
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ExpenseEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Other',
    "card" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "BalanceEntry_date_idx" ON "BalanceEntry"("date");

-- CreateIndex
CREATE INDEX "BalanceEntry_source_idx" ON "BalanceEntry"("source");

-- CreateIndex
CREATE INDEX "BalanceEntry_deletedAt_idx" ON "BalanceEntry"("deletedAt");

-- CreateIndex
CREATE INDEX "IncomeEntry_date_idx" ON "IncomeEntry"("date");

-- CreateIndex
CREATE INDEX "IncomeEntry_category_idx" ON "IncomeEntry"("category");

-- CreateIndex
CREATE INDEX "IncomeEntry_deletedAt_idx" ON "IncomeEntry"("deletedAt");

-- CreateIndex
CREATE INDEX "ExpenseEntry_date_idx" ON "ExpenseEntry"("date");

-- CreateIndex
CREATE INDEX "ExpenseEntry_category_idx" ON "ExpenseEntry"("category");

-- CreateIndex
CREATE INDEX "ExpenseEntry_deletedAt_idx" ON "ExpenseEntry"("deletedAt");
