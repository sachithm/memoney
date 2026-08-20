# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/app.spec.ts >> Rent vs Buy Page >> updates starting investment input
- Location: e2e/tests/app.spec.ts:339:7

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator:  locator('input[type="number"]').first()
Expected: "50000"
Received: ""

Call log:
  - Expect "toHaveValue" with timeout 5000ms
  - waiting for locator('input[type="number"]').first()
  - Protocol error (Runtime.callFunctionOn): Internal server error, session closed.

```

# Test source

```ts
  241 |     await expect(page.locator("text=Annual Rate of Return")).toBeVisible();
  242 |     await expect(page.locator("text=Years")).toBeVisible();
  243 |     await expect(page.locator("text=Growth Over Time")).toBeVisible();
  244 |   });
  245 | 
  246 |   test("back to dashboard link navigates home", async ({ page }) => {
  247 |     await page.goto("/compound-interest");
  248 |     await page.getByRole("link", { name: /Back to Dashboard/ }).click();
  249 |     await expect(page).toHaveURL("/", { timeout: 30000 });
  250 |     await expect(page.locator("text=Financial Tools")).toBeVisible();
  251 |   });
  252 | });
  253 | 
  254 | test.describe("Rent vs Buy Page", () => {
  255 |   test.beforeEach(async ({ page }) => {
  256 |     await page.goto("/rent-vs-buy");
  257 |     await page.waitForSelector("text=Rent vs Buy Comparison");
  258 |   });
  259 | 
  260 |   test("renders with default values", async ({ page }) => {
  261 |     // Header
  262 |     await expect(
  263 |       page.getByRole("heading", { name: "Rent vs Buy Comparison" }),
  264 |     ).toBeVisible();
  265 |     await expect(
  266 |       page.getByRole("link", { name: /Back to Dashboard/ }),
  267 |     ).toBeVisible();
  268 | 
  269 |     // Input fields
  270 |     await expect(page.locator("text=Starting Investment (£)")).toBeVisible();
  271 |     await expect(page.locator("text=Property Value (£)")).toBeVisible();
  272 |     await expect(page.locator("text=Total Monthly (£)")).toBeVisible();
  273 |     await expect(
  274 |       page.locator("text=Rent Increase Rate (%)"),
  275 |     ).toBeVisible();
  276 |     await expect(
  277 |       page.locator("text=Mortgage Interest Rate (%)"),
  278 |     ).toBeVisible();
  279 |     await expect(page.locator("text=Mortgage Term (years)")).toBeVisible();
  280 |     await expect(
  281 |       page.locator("text=Property Appreciation Rate (%)"),
  282 |     ).toBeVisible();
  283 |     await expect(
  284 |       page.locator("text=Stock Market Return Rate (%)"),
  285 |     ).toBeVisible();
  286 |     await expect(
  287 |       page.locator("text=Monthly Maintenance Cost (£)"),
  288 |     ).toBeVisible();
  289 |     await expect(
  290 |       page.locator("text=Projection Period (years)"),
  291 |     ).toBeVisible();
  292 |   });
  293 | 
  294 |   test("displays correct derived summary values", async ({ page }) => {
  295 |     // Monthly mortgage payment ≈ £1,558.64  (405,000 @ 3% over 35y)
  296 |     const paymentText = await page.locator("text=Mortgage Payment/Month:").locator("..").textContent();
  297 |     expect(paymentText).toContain("£1,558");
  298 | 
  299 |     // Monthly Rent (£) defaults to mortgage payment + maintenance
  300 |     // (a "fair comparison" baseline) ≈ £1,858.64
  301 |     const rentText = await page
  302 |       .locator("text=Monthly Rent (£):")
  303 |       .locator("..")
  304 |       .textContent();
  305 |     expect(rentText).toContain("£1,858");
  306 | 
  307 |     // Stock Investment/Month (Rent) ≈ £641.36  (2500 − 1858.64)
  308 |     const investText = await page
  309 |       .locator("text=Stock Investment/Month (Rent)")
  310 |       .locator("..")
  311 |       .textContent();
  312 |     expect(investText).toContain("£641");
  313 | 
  314 |     // Summary section
  315 |     await expect(page.locator("text=Rent + Invest NW:")).toBeVisible();
  316 |     await expect(page.locator("text=Mortgage + Invest NW:")).toBeVisible();
  317 |     await expect(page.locator("text=Difference (Rent")).toBeVisible();
  318 |     await expect(page.locator("text=wins by")).toBeVisible();
  319 |   });
  320 | 
  321 |   test("renders chart with recharts SVG elements", async ({ page }) => {
  322 |     await page.waitForSelector(".recharts-responsive-container", {
  323 |       timeout: 10000,
  324 |     });
  325 |     await page.waitForFunction(() => {
  326 |       const container = document.querySelector(".recharts-responsive-container");
  327 |       if (!container) return false;
  328 |       return container.querySelector("svg") !== null;
  329 |     });
  330 |     const svgCount = await page.locator(".recharts-responsive-container svg").count();
  331 |     expect(svgCount).toBeGreaterThan(0);
  332 |   });
  333 | 
  334 |   test("shows chart legend entries", async ({ page }) => {
  335 |     await expect(page.locator("text=Rent + Invest").first()).toBeVisible();
  336 |     await expect(page.locator("text=Mortgage + Invest").first()).toBeVisible();
  337 |   });
  338 | 
  339 |   test("updates starting investment input", async ({ page }) => {
  340 |     await page.fill('input[type="number"]', "50000");
> 341 |     expect(page.locator('input[type="number"]').first()).toHaveValue("50000");
      |                                                          ^ Error: expect(locator).toHaveValue(expected) failed
  342 |   });
  343 | 
  344 |   test("updates maintenance cost and reflects in mortgage investment", async ({
  345 |     page,
  346 |   }) => {
  347 |     // Mortgage scenario invests (total monthly − mortgage payment − maintenance).
  348 |     // Default: 2500 − 1558.64 − 300 = £641.36
  349 |     const mortgageInvest = page
  350 |       .locator("text=Stock Investment/Month (Mortgage)")
  351 |       .locator("..");
  352 |     await expect(mortgageInvest).toContainText(/£641/);
  353 | 
  354 |     const maintenanceInput = page
  355 |       .locator("text=Monthly Maintenance Cost (£)")
  356 |       .locator("xpath=following-sibling::input[contains(@class,'border')]");
  357 |     await maintenanceInput.fill("500");
  358 | 
  359 |     // Now: 2500 − 1558.64 − 500 = £441.36
  360 |     await expect(mortgageInvest).toContainText(/£441/);
  361 |   });
  362 | 
  363 |   test("shows affordability warning when budget too low", async ({ page }) => {
  364 |     const budgetInput = page.locator('input[type="number"]').nth(2); // 3rd number input
  365 |     await budgetInput.fill("500");
  366 | 
  367 |     await expect(
  368 |       page.locator("text=⚠ Your total monthly amount is below your rent"),
  369 |     ).toBeVisible();
  370 |   });
  371 | 
  372 |   test("back to dashboard link navigates home", async ({ page }) => {
  373 |     await page.getByRole("link", { name: /Back to Dashboard/ }).click();
  374 |     await expect(page).toHaveURL("/", { timeout: 30000 });
  375 |     await expect(page.locator("text=Financial Tools")).toBeVisible();
  376 |   });
  377 | });
  378 | 
  379 | test.describe("Take Home Salary Page", () => {
  380 |   test("renders with default values", async ({ page }) => {
  381 |     await page.goto("/take-home-salary");
  382 | 
  383 |     await expect(
  384 |       page.getByRole("heading", { name: /Take Home Salary/i }),
  385 |     ).toBeVisible();
  386 |     await expect(
  387 |       page.getByRole("link", { name: /Back to Dashboard/ }),
  388 |     ).toBeVisible();
  389 | 
  390 |     // Input fields
  391 |     await expect(
  392 |       page.locator("text=Annual Salary (£)"),
  393 |     ).toBeVisible();
  394 |   });
  395 | 
  396 |   test("back to dashboard link navigates home", async ({ page }) => {
  397 |     await page.goto("/take-home-salary");
  398 |     await page.getByRole("link", { name: /Back to Dashboard/ }).click();
  399 |     await expect(page).toHaveURL("/", { timeout: 30000 });
  400 |     await expect(page.locator("text=Financial Tools")).toBeVisible();
  401 |   });
  402 | 
  403 |   test("add second person shows second person inputs and comparison", async ({
  404 |     page,
  405 |   }) => {
  406 |     await page.goto("/take-home-salary");
  407 | 
  408 |     // Add second person
  409 |     await page.getByRole("button", { name: /Add Second Person/ }).click();
  410 | 
  411 |     // Second person inputs appear
  412 |     await expect(
  413 |       page.locator("text=Annual Salary (£) — Person 2"),
  414 |     ).toBeVisible();
  415 |     await expect(
  416 |       page.locator("text=Pension Contribution (%) — Person 2"),
  417 |     ).toBeVisible();
  418 | 
  419 |     // Two summary cards
  420 |     await expect(
  421 |       page.locator("text=Take-Home Summary — Person 1"),
  422 |     ).toBeVisible();
  423 |     await expect(
  424 |       page.locator("text=Take-Home Summary — Person 2"),
  425 |     ).toBeVisible();
  426 | 
  427 |     // Cumulative Tax Comparison table appears
  428 |     await expect(
  429 |       page.locator("text=Cumulative Tax Comparison"),
  430 |     ).toBeVisible();
  431 |     await expect(page.locator("text=Combined")).toBeVisible();
  432 |   });
  433 | 
  434 |   test("remove second person hides second person inputs", async ({
  435 |     page,
  436 |   }) => {
  437 |     await page.goto("/take-home-salary");
  438 | 
  439 |     await page.getByRole("button", { name: /Add Second Person/ }).click();
  440 |     await expect(
  441 |       page.locator("text=Annual Salary (£) — Person 2"),
```