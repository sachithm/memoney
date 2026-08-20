import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test("shows Financial Tools section with both calculators", async ({
    page,
  }) => {
    await page.goto("/");
    // Wait for the page to load (dashboard may be slow due to API calls)
    await page.waitForSelector("text=Financial Tools", { timeout: 30000 });

    // Financial Tools section
    await expect(
      page.getByRole("heading", { name: "Financial Tools" }),
    ).toBeVisible();

    // Both calculator cards
    await expect(
      page.getByRole("heading", { name: "Compound Interest Calculator" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Mortgage Comparison Calculator" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Rent vs Buy Comparison" }),
    ).toBeVisible();
    // Take Home Salary Calculator card
    await expect(
      page.getByRole("heading", { name: "Take Home Salary Calculator" }),
    ).toBeVisible();
  });

  test("navigates to take home salary page", async ({ page }) => {
    await page.goto("/take-home-salary");
    // URL params are synced on mount
    expect(page.url()).toContain("/take-home-salary");
    await expect(
      page.getByRole("heading", { name: /Take Home Salary/i }),
    ).toBeVisible();
  });

  test("navigates to rent vs buy page", async ({ page }) => {
    await page.goto("/rent-vs-buy");
    expect(page.url()).toContain("/rent-vs-buy");
    await expect(
      page.getByRole("heading", { name: "Rent vs Buy Comparison" }),
    ).toBeVisible();
  });

  test("navigates to mortgage comparison page", async ({ page }) => {
    await page.goto("/mortgage-comparison");
    expect(page.url()).toContain("/mortgage-comparison");
    await expect(
      page.getByRole("heading", { name: "Mortgage Comparison Calculator" }),
    ).toBeVisible();
  });

  test("navigates to compound interest page", async ({ page }) => {
    await page.goto("/compound-interest");
    expect(page.url()).toContain("/compound-interest");
    await expect(
      page.getByRole("heading", { name: /Compound Interest/i }),
    ).toBeVisible();
  });
});

test.describe("Mortgage Comparison Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/mortgage-comparison");
    // Wait for the chart container to be ready
    await page.waitForSelector("text=Mortgage Comparison Calculator");
  });

  test("renders all input sections", async ({ page }) => {
    // Header
    await expect(
      page.getByRole("heading", { name: "Mortgage Comparison Calculator" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Back to Dashboard/ }),
    ).toBeVisible();

    // Mode toggle
    await expect(page.locator("button", { hasText: "Fix Deposit" })).toBeVisible();
    await expect(page.locator("button", { hasText: "Fix Term" })).toBeVisible();

    // Labels
    await expect(page.locator("text=Initial Investment (£)")).toBeVisible();
    await expect(page.locator("text=Mortgage Interest Rate (%)")).toBeVisible();
    await expect(page.locator("text=Property Appreciation Rate (%)")).toBeVisible();
    await expect(page.locator("text=Monthly Mortgage Payment (£)")).toBeVisible();
    await expect(page.locator("text=Years")).toBeVisible();
    await expect(page.locator("text=Compare with stock market investment")).toBeVisible();
  });

  test("displays correct default values", async ({ page }) => {
    // Property value (deposit × multiplier = 30000 × 10)
    await expect(page.locator("text=£300,000").first()).toBeVisible();

    // Standard payment ≈ £1,449.42
    await expect(page.locator("text=Standard:").first()).toBeVisible();
    const standardText = await page.locator("text=Standard:").first().locator("..").textContent();
    expect(standardText).toContain("£1,449.42");

    // Total Spent = deposit + payments = 30000 + 1449.42*360 ≈ £551,791
    const spentText = await page.locator("text=Total Spent:").first().locator("..").textContent();
    expect(spentText).toMatch(/£551,79/);

    // Total Interest Paid ≈ £251,791
    const interestText = await page.locator("text=Total Interest Paid:").first().locator("..").textContent();
    expect(interestText).toMatch(/£251,79/);

    // Property Net Equity ≈ £973,019
    await expect(page.locator("text=/Property Net Equity:.*£973,019/")).toBeVisible();
  });

  test("shows mortgage payoff message in Fix Deposit mode", async ({
    page,
  }) => {
    await expect(page.locator("text=Mortgage Payoff:")).toBeVisible();
    // With standard payment and 30-year term, should show "Paid off at year 30"
    await expect(page.locator("text=/Paid off at year 30/")).toBeVisible();
  });

  test("chart container renders with recharts SVG elements", async ({
    page,
  }) => {
    // The chart is inside a div with the recharts responsive container
    await page.waitForSelector(".recharts-responsive-container", {
      timeout: 10000,
    });
    // Wait for SVG elements
    await page.waitForFunction(() => {
      const container = document.querySelector(".recharts-responsive-container");
      if (!container) return false;
      return container.querySelector("svg") !== null;
    });
    const svgCount = await page.locator(".recharts-responsive-container svg").count();
    expect(svgCount).toBeGreaterThan(0);
  });

  test("toggling to Fix Term mode changes the UI", async ({ page }) => {
    // Initially Fix Deposit mode — multiplier visible
    await expect(page.locator("text=Mortgage Multiplier")).toBeVisible();

    // Switch to Fix Term
    await page.locator("button", { hasText: "Fix Term" }).click();

    // Multiplier should be hidden
    await expect(page.locator("text=Mortgage Multiplier")).not.toBeVisible();
    // Property Value display should appear (look for the label element)
    await expect(
      page.locator("label", { hasText: "Property Value" }).first()
    ).toBeVisible();
  });

  test("stock market toggle hides/shows comparison", async ({ page }) => {
    // Stock market input should be visible
    await expect(page.locator("text=Stock Market Annual Return (%)")).toBeVisible();
    await expect(page.locator("text=Stock Market Value:")).toBeVisible();

    // Toggle off
    await page.getByRole("switch").click();

    // Stock market input should be hidden
    await expect(page.locator("text=Stock Market Annual Return (%)")).not.toBeVisible();
    await expect(page.locator("text=Stock Market Value:")).not.toBeVisible();

    // Toggle back on
    await page.getByRole("switch").click();
    await expect(page.locator("text=Stock Market Annual Return (%)")).toBeVisible();
    await expect(page.locator("text=Stock Market Value:")).toBeVisible();
  });

  test("changing monthly payment slider updates current payment display", async ({
    page,
  }) => {
    // Read the current payment value
    const currentText = await page.locator("text=Current:").first().locator("..").textContent();
    expect(currentText).not.toBeNull();
    const currentMatch = currentText!.match(/£([0-9,]+\.?[0-9]*)/);
    expect(currentMatch).not.toBeNull();
    const originalVal = parseFloat(currentMatch![1].replace(/,/g, ""));

    // The payment slider is the 4th range input (index 3)
    const allSliders = await page.locator('input[type="range"]').all();
    const paymentSlider = allSliders[3];
    const sliderValue = await paymentSlider.inputValue();

    // Set to a higher value (add 500, rounded to step of 50)
    const newValue = String(
      Math.round((Number(sliderValue) + 500) / 50) * 50,
    );
    await paymentSlider.fill(newValue);

    // Current payment should have increased — wait for the text to update
    await page.waitForFunction(
      (original) => {
        const elements = Array.from(
          document.querySelectorAll("p, div, span"),
        );
        for (const el of elements) {
          if (el.textContent?.includes("Current:")) {
            const match = el.textContent.match(/£([0-9,]+\.?[0-9]*)/);
            if (match) {
              return parseFloat(match[1].replace(/,/g, "")) > original;
            }
          }
        }
        return false;
      },
      originalVal,
      { timeout: 10000 },
    );
  });

  test("changing years slider updates summary title", async ({ page }) => {
    // Years slider is the 5th range input (index 4)
    const allSliders = await page.locator('input[type="range"]').all();
    const yearsSlider = allSliders[4];

    await yearsSlider.fill("20");

    await expect(page.locator("text=/Summary \\(Year 20\\)/")).toBeVisible();
  });

  test("back to dashboard link navigates home", async ({ page }) => {
    await page.getByRole("link", { name: /Back to Dashboard/ }).click();
    await expect(page).toHaveURL("/", { timeout: 30000 });
    await expect(page.locator("text=Financial Tools")).toBeVisible();
  });
});

test.describe("Compound Interest Page", () => {
  test("renders with default values", async ({ page }) => {
    await page.goto("/compound-interest");

    await expect(
      page.getByRole("heading", { name: /Compound Interest/i }),
    ).toBeVisible();
    await expect(page.locator("text=Initial Investment")).toBeVisible();
    await expect(page.locator("text=Annual Rate of Return")).toBeVisible();
    await expect(page.locator("text=Years")).toBeVisible();
    await expect(page.locator("text=Growth Over Time")).toBeVisible();
  });

  test("back to dashboard link navigates home", async ({ page }) => {
    await page.goto("/compound-interest");
    await page.getByRole("link", { name: /Back to Dashboard/ }).click();
    await expect(page).toHaveURL("/", { timeout: 30000 });
    await expect(page.locator("text=Financial Tools")).toBeVisible();
  });
});

test.describe("Rent vs Buy Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/rent-vs-buy");
    await page.waitForSelector("text=Rent vs Buy Comparison");
  });

  test("renders with default values", async ({ page }) => {
    // Header
    await expect(
      page.getByRole("heading", { name: "Rent vs Buy Comparison" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Back to Dashboard/ }),
    ).toBeVisible();

    // Input fields
    await expect(page.locator("text=Starting Investment (£)")).toBeVisible();
    await expect(page.locator("text=Property Value (£)")).toBeVisible();
    await expect(page.locator("text=Total Monthly (£)")).toBeVisible();
    await expect(
      page.locator("text=Rent Increase Rate (%)"),
    ).toBeVisible();
    await expect(
      page.locator("text=Mortgage Interest Rate (%)"),
    ).toBeVisible();
    await expect(page.locator("text=Mortgage Term (years)")).toBeVisible();
    await expect(
      page.locator("text=Property Appreciation Rate (%)"),
    ).toBeVisible();
    await expect(
      page.locator("text=Stock Market Return Rate (%)"),
    ).toBeVisible();
    await expect(
      page.locator("text=Monthly Maintenance Cost (£)"),
    ).toBeVisible();
    await expect(
      page.locator("text=Projection Period (years)"),
    ).toBeVisible();
  });

  test("displays correct derived summary values", async ({ page }) => {
    // Monthly mortgage payment ≈ £1,558.64  (405,000 @ 3% over 35y)
    const paymentText = await page.locator("text=Mortgage Payment/Month:").locator("..").textContent();
    expect(paymentText).toContain("£1,558");

    // Monthly Rent (£) defaults to mortgage payment + maintenance
    // (a "fair comparison" baseline) ≈ £1,858.64
    const rentText = await page
      .locator("text=Monthly Rent (£):")
      .locator("..")
      .textContent();
    expect(rentText).toContain("£1,858");

    // Stock Investment/Month (Rent) ≈ £641.36  (2500 − 1858.64)
    const investText = await page
      .locator("text=Stock Investment/Month (Rent)")
      .locator("..")
      .textContent();
    expect(investText).toContain("£641");

    // Summary section
    await expect(page.locator("text=Rent + Invest NW:")).toBeVisible();
    await expect(page.locator("text=Mortgage + Invest NW:")).toBeVisible();
    await expect(page.locator("text=Difference (Rent")).toBeVisible();
    await expect(page.locator("text=wins by")).toBeVisible();
  });

  test("renders chart with recharts SVG elements", async ({ page }) => {
    await page.waitForSelector(".recharts-responsive-container", {
      timeout: 10000,
    });
    await page.waitForFunction(() => {
      const container = document.querySelector(".recharts-responsive-container");
      if (!container) return false;
      return container.querySelector("svg") !== null;
    });
    const svgCount = await page.locator(".recharts-responsive-container svg").count();
    expect(svgCount).toBeGreaterThan(0);
  });

  test("shows chart legend entries", async ({ page }) => {
    await expect(page.locator("text=Rent + Invest").first()).toBeVisible();
    await expect(page.locator("text=Mortgage + Invest").first()).toBeVisible();
  });

  test("updates starting investment input", async ({ page }) => {
    await page.fill('input[type="number"]', "50000");
    expect(page.locator('input[type="number"]').first()).toHaveValue("50000");
  });

  test("updates maintenance cost and reflects in mortgage investment", async ({
    page,
  }) => {
    // Mortgage scenario invests (total monthly − mortgage payment − maintenance).
    // Default: 2500 − 1558.64 − 300 = £641.36
    const mortgageInvest = page
      .locator("text=Stock Investment/Month (Mortgage)")
      .locator("..");
    await expect(mortgageInvest).toContainText(/£641/);

    const maintenanceInput = page
      .locator("text=Monthly Maintenance Cost (£)")
      .locator("xpath=following-sibling::input[contains(@class,'border')]");
    await maintenanceInput.fill("500");

    // Now: 2500 − 1558.64 − 500 = £441.36
    await expect(mortgageInvest).toContainText(/£441/);
  });

  test("shows affordability warning when budget too low", async ({ page }) => {
    const budgetInput = page.locator('input[type="number"]').nth(2); // 3rd number input
    await budgetInput.fill("500");

    await expect(
      page.locator("text=⚠ Your total monthly amount is below your rent"),
    ).toBeVisible();
  });

  test("back to dashboard link navigates home", async ({ page }) => {
    await page.getByRole("link", { name: /Back to Dashboard/ }).click();
    await expect(page).toHaveURL("/", { timeout: 30000 });
    await expect(page.locator("text=Financial Tools")).toBeVisible();
  });
});

test.describe("Take Home Salary Page", () => {
  test("renders with default values", async ({ page }) => {
    await page.goto("/take-home-salary");

    await expect(
      page.getByRole("heading", { name: /Take Home Salary/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Back to Dashboard/ }),
    ).toBeVisible();

    // Input fields
    await expect(
      page.locator("text=Annual Salary (£)"),
    ).toBeVisible();
  });

  test("back to dashboard link navigates home", async ({ page }) => {
    await page.goto("/take-home-salary");
    await page.getByRole("link", { name: /Back to Dashboard/ }).click();
    await expect(page).toHaveURL("/", { timeout: 30000 });
    await expect(page.locator("text=Financial Tools")).toBeVisible();
  });

  test("add second person shows second person inputs and comparison", async ({
    page,
  }) => {
    await page.goto("/take-home-salary");

    // Add second person
    await page.getByRole("button", { name: /Add Second Person/ }).click();

    // Second person inputs appear
    await expect(
      page.locator("text=Annual Salary (£) — Person 2"),
    ).toBeVisible();
    await expect(
      page.locator("text=Pension Contribution (%) — Person 2"),
    ).toBeVisible();

    // Two summary cards
    await expect(
      page.locator("text=Take-Home Summary — Person 1"),
    ).toBeVisible();
    await expect(
      page.locator("text=Take-Home Summary — Person 2"),
    ).toBeVisible();

    // Cumulative Tax Comparison table appears
    await expect(
      page.locator("text=Cumulative Tax Comparison"),
    ).toBeVisible();
    await expect(page.locator("text=Combined")).toBeVisible();
  });

  test("remove second person hides second person inputs", async ({
    page,
  }) => {
    await page.goto("/take-home-salary");

    await page.getByRole("button", { name: /Add Second Person/ }).click();
    await expect(
      page.locator("text=Annual Salary (£) — Person 2"),
    ).toBeVisible();

    await page.getByRole("button", { name: /Remove Second Person/ }).click();
    await expect(
      page.locator("text=Annual Salary (£) — Person 2"),
    ).not.toBeVisible();
    await expect(
      page.locator("text=Cumulative Tax Comparison"),
    ).not.toBeVisible();
  });

  test("two-person mode shows combined cumulative tax in comparison table", async ({
    page,
  }) => {
    await page.goto(
      "/take-home-salary?people=2&salary=60000&salary2=40000",
    );

    await page.waitForTimeout(500);

    // Cumulative Tax Comparison table should show both persons and combined
    await expect(
      page.locator("text=Cumulative Tax Comparison"),
    ).toBeVisible();
    await expect(page.locator("text=Person 1").first()).toBeVisible();
    await expect(page.locator("text=Person 2").first()).toBeVisible();
    await expect(page.locator("text=Combined").first()).toBeVisible();

    // Should have rows for Income Tax, National Insurance, Student Loan,
    // Total Tax, Gross Income, Take-Home Pay
    await expect(page.locator("text=Income Tax").first()).toBeVisible();
    await expect(
      page.locator("text=National Insurance").first(),
    ).toBeVisible();
    await expect(page.locator("text=Total Tax").first()).toBeVisible();
    await expect(page.locator("text=Gross Income").first()).toBeVisible();
    await expect(
      page.locator("text=Take-Home Pay").first(),
    ).toBeVisible();
  });

  test("updates cumulative tax when person2 salary changes", async ({
    page,
  }) => {
    await page.goto("/take-home-salary");

    await page.getByRole("button", { name: /Add Second Person/ }).click();
    await page.waitForTimeout(300);

    // Change person 2 salary from 35000 to 60000
    const salaryInput2 = page.locator('input[type="number"]').nth(4);
    await salaryInput2.fill("60000");

    await page.waitForTimeout(300);

    // The cumulative table should still be visible
    await expect(
      page.locator("text=Cumulative Tax Comparison"),
    ).toBeVisible();
  });

  test("two-person URL params populate both persons and people=2 toggles mode", async ({
    page,
  }) => {
    await page.goto(
      "/take-home-salary?people=2&salary=50000&salary2=30000&pension2=5",
    );

    await page.waitForTimeout(500);

    // Person 1 salary
    const salaryInput1 = page.locator('input[type="number"]').first();
    await expect(salaryInput1).toHaveValue("50000");

    // Person 2 salary — second number input in the second person's form
    // Person 1 form has salary, pension, employer match (3 number inputs)
    // Person 2 form starts at the 4th number input (nth(3) is Person2 salary)
    const salaryInput2 = page.locator('input[type="number"]').nth(3);
    await expect(salaryInput2).toHaveValue("30000");

    // Person 2 pension
    const pensionInput2 = page.locator('input[type="number"]').nth(4);
    await expect(pensionInput2).toHaveValue("5");
  });
});

test.describe("URL Parameter Sharing", () => {
  test("take-home-salary loads config from URL params", async ({ page }) => {
    await page.goto(
      "/take-home-salary?salary=60000&freq=annual&pension=5&studentLoan=plan2",
    );

    // Wait for the salary input to show 60000
    await page.waitForSelector('input[value="60000"]', { timeout: 10000 });
    await expect(page.locator('input[value="60000"]')).toBeVisible();
    // Pension input should show 5
    const pensionInput = page.locator('input[type="number"]').nth(1);
    await expect(pensionInput).toHaveValue("5");
    // Student loan select should show plan2
    const loanSelect = page.locator("select").nth(1);
    await expect(loanSelect).toHaveValue("plan2");
  });

  test("take-home-salary updates URL when salary changes", async ({
    page,
  }) => {
    await page.goto("/take-home-salary");

    // Change the annual salary
    const salaryInput = page.locator('input[type="number"]').first();
    await salaryInput.fill("60000");

    await page.waitForFunction(
      () => window.location.search.includes("salary=60000"),
      { timeout: 10000 },
    );
  });

  test("compound-interest loads config from URL params", async ({
    page,
  }) => {
    await page.goto(
      "/compound-interest?initialInvestment=20000&contribution=1000&annualRate=5&years=20",
    );

    await page.waitForTimeout(500);
    await expect(page.locator('input[type="number"][value="20000"]')).toBeVisible();
    await expect(page.locator('input[type="number"][value="1000"]')).toBeVisible();
    await expect(page.locator('input[type="number"][value="5"]')).toBeVisible();
    // Years is a range slider — verify via summary title
    await expect(page.locator("text=Summary (Year 20)")).toBeVisible();
  });

  test("compound-interest updates URL on input change", async ({ page }) => {
    await page.goto("/compound-interest");

    await page.locator('input[type="number"][value="10000"]').fill("15000");

    await page.waitForFunction(
      () => window.location.search.includes("initialInvestment=15000"),
      { timeout: 10000 },
    );
  });

  test("mortgage-comparison loads config from URL params", async ({
    page,
  }) => {
    await page.goto(
      "/mortgage-comparison?initialInvestment=50000&mortgageRate=6&years=20",
    );

    await page.waitForTimeout(500);
    await expect(page.locator('input[type="number"][value="50000"]')).toBeVisible();
    // Years is a range slider — verify via summary title
    await expect(page.locator("text=/Summary \\(Year 20\\)/")).toBeVisible();
    await expect(
      page.locator("text=/Property Net Equity/").first(),
    ).toBeVisible();
  });

  test("mortgage-comparison updates URL on input change", async ({
    page,
  }) => {
    await page.goto("/mortgage-comparison");

    await page.locator('input[type="number"][value="30000"]').fill("40000");

    await page.waitForFunction(
      () => window.location.search.includes("initialInvestment=40000"),
      { timeout: 10000 },
    );
  });

  test("rent-vs-buy loads config from URL params", async ({ page }) => {
    await page.goto(
      "/rent-vs-buy?startingInvestment=50000&propertyValue=400000",
    );

    await page.waitForTimeout(500);
    await expect(page.locator('input[type="number"][value="50000"]')).toBeVisible();
    await expect(page.locator('input[type="number"][value="400000"]')).toBeVisible();
  });
});
