import type { Role } from "@/types/domain";

/**
 * DEVELOPMENT / DEMO ACCOUNTS — fictional people and businesses.
 * Phone numbers and emails are placeholders (example.com is reserved).
 * Shown on the login page only when NEXT_PUBLIC_API_MODE=mock.
 */
export const DEMO_PASSWORD = "Demo@1234";
export const DEMO_PIN = "24680";

export interface DemoAccount {
  role: Role;
  name: string;
  identifier: string;
  note: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { role: "PERSONAL", name: "Nadia Islam", identifier: "01710000001", note: "Verified · main demo customer" },
  { role: "PERSONAL", name: "Tanvir Ahmed", identifier: "01710000002", note: "Verified customer" },
  { role: "PERSONAL", name: "Farhana Kabir", identifier: "01710000003", note: "KYC pending · lower limits" },
  { role: "AGENT", name: "Rafiq Hossain", identifier: "01810000001", note: "Verified agent · Hossain Telecom Point" },
  { role: "AGENT", name: "Shirin Akter", identifier: "01810000002", note: "Under review · operations locked" },
  { role: "MERCHANT", name: "Spice Garden Restaurant", identifier: "01910000001", note: "Verified merchant" },
  { role: "MERCHANT", name: "FreshMart Grocery", identifier: "01910000002", note: "Pending verification" },
  { role: "ADMIN", name: "Platform Admin", identifier: "admin@example.com", note: "2FA on — OTP shown on screen" },
];
