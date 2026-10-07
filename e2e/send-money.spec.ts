import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { e2eDatabaseUrl } from "./database";

// Accounts from supabase/seed.sql and e2e/fixtures.sql (demo password and PIN documented in seed.sql).
const SENDER = { phone: "01700000001", password: "demo@1234", pin: "24680" };
const RECIPIENT = "01700000002";

test("a customer sends ৳1,500 and both wallets change by the server's figures", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Mobile number" }).fill(SENDER.phone);
  await page.getByRole("textbox", { name: "Password" }).fill(SENDER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // The dashboard renders only once the app has confirmed the session; then go on through the app's own link.
  await expect(page.getByText("Available balance")).toBeVisible();
  await page.getByRole("link", { name: "Send Money" }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/personal\/send$/);
  await page.getByRole("textbox", { name: "Recipient mobile number" }).fill(RECIPIENT);
  await page.getByRole("textbox", { name: "Amount" }).fill("1500");
  await page.getByRole("button", { name: "Continue" }).click();

  // Review: the fee and total come from the server's quote (৳5 above ৳1,000).
  await expect(page.getByText("Balance after this transaction:")).toContainText("৳3,495.00");
  await page.getByLabel("PIN digit 1").fill(SENDER.pin); // fills all five boxes, like a paste
  await page.getByRole("button", { name: /^Send ৳1,505\.00$/ }).click();

  await expect(page.getByRole("heading", { name: "Send Money successful" })).toBeVisible();
  await expect(page.getByText("Transaction ID")).toBeVisible();

  const sql = postgres(e2eDatabaseUrl(), { ssl: false, max: 1 });
  try {
    const wallets = await sql<{ phone: string; available: string }[]>`
      select u.phone, w.available::text from wallets w join users u on u.id = w.user_id where u.phone in (${SENDER.phone}, ${RECIPIENT})`;
    expect(Object.fromEntries(wallets.map((w) => [w.phone, Number(w.available)]))).toEqual({ [SENDER.phone]: 349_500, [RECIPIENT]: 150_000 });
    const [txn] = await sql<{ amount: string; sender_fee: string; status: string }[]>`
      select amount::text, sender_fee::text, status from transactions where type = 'SEND_MONEY'`;
    expect(txn).toEqual({ amount: "150000", sender_fee: "500", status: "SUCCESSFUL" });
  } finally {
    await sql.end({ timeout: 5 });
  }
});
