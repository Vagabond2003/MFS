import { z } from "zod";
import { normalizePhone } from "./utils";
import { DEFAULT_LANG, LANGS, msg } from "./i18n/core";

/**
 * Validation rules shared by the forms (client) and the API layer (server).
 * The client validates for UX; the server re-validates because client input
 * is never trusted.
 */

export const BD_PHONE = /^01[3-9]\d{8}$/;

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Mobile number is required")
  .transform(normalizePhone)
  .refine((v) => BD_PHONE.test(v), "Enter a valid 11-digit mobile number (01XXXXXXXXX)");

export const optionalEmailSchema = z
  .string()
  .trim()
  .max(120)
  .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address")
  .optional();

export const emailSchema = z.string().trim().min(1, "Email is required").pipe(z.email("Enter a valid email address"));

export const nameSchema = z
  .string()
  .trim()
  .min(3, "Enter your full name")
  .max(80, "Name is too long")
  .regex(/^[\p{L} .'-]+$/u, "Use letters, spaces, dots or hyphens only");

export const addressSchema = z.string().trim().min(8, "Enter a complete address").max(200);

export const dobSchema = z
  .string()
  .min(1, "Date of birth is required")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date")
  .refine((v) => ageOn(v) >= 18, "You must be at least 18 years old")
  .refine((v) => ageOn(v) <= 100, "Enter a valid date of birth");

export function ageOn(dob: string, now = new Date()) {
  const d = new Date(dob);
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(72, "At most 72 characters")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/\d/, "Include a number")
  .regex(/[^A-Za-z0-9]/, "Include a symbol");

export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw) && pw.length >= 10) score++;
  const labels = [msg("Too weak"), msg("Weak"), msg("Fair"), msg("Good"), msg("Strong")];
  return { score: score as 0 | 1 | 2 | 3 | 4, label: labels[score] };
}

export const pinSchema = z
  .string()
  .regex(/^\d{5}$/, "PIN must be exactly 5 digits")
  .refine((v) => !/^(\d)\1{4}$/.test(v), "PIN cannot be the same digit repeated")
  .refine((v) => !["01234", "12345", "23456", "34567", "45678", "56789", "98765", "54321"].includes(v), "PIN is too easy to guess");

/** For verifying an existing PIN we only check the shape. */
export const pinEntrySchema = z.string().regex(/^\d{5}$/, "Enter your 5-digit PIN");

export const otpSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code");

export const nidSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s/g, ""))
  .refine((v) => /^(\d{10}|\d{13}|\d{17})$/.test(v), "NID must be 10, 13 or 17 digits");

export const optionalNidSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s/g, ""))
  .refine((v) => v === "" || /^(\d{10}|\d{13}|\d{17})$/.test(v), "NID must be 10, 13 or 17 digits")
  .optional();

/** Taka amount as typed by the user (string), e.g. "1250" or "1,250.50" */
export const takaAmountSchema = (min = 1, max = 1_000_000) =>
  z
    .string()
    .trim()
    .min(1, "Enter an amount")
    .transform((v) => v.replace(/[,\s৳]/g, ""))
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Enter a valid amount (up to 2 decimals)")
    .refine((v) => Number(v) >= min, `Minimum amount is ৳${min.toLocaleString("en-IN")}`)
    .refine((v) => Number(v) <= max, `Maximum amount is ৳${max.toLocaleString("en-IN")}`);

/* ───────────── File uploads ───────────── */

export const UPLOAD_RULES = {
  maxBytes: 5 * 1024 * 1024,
  mimeTypes: ["image/jpeg", "image/png", "application/pdf"] as const,
  extensions: [".jpg", ".jpeg", ".png", ".pdf"] as const,
};

export function validateUploadFile(file: File): string | null {
  if (file.size === 0) return "The file is empty";
  if (file.size > UPLOAD_RULES.maxBytes) return "File must be 5 MB or smaller";
  const lower = file.name.toLowerCase();
  if (!UPLOAD_RULES.extensions.some((ext) => lower.endsWith(ext))) return "Upload a JPG, PNG or PDF";
  if (!(UPLOAD_RULES.mimeTypes as readonly string[]).includes(file.type)) return "Upload a JPG, PNG or PDF";
  return null;
}

/**
 * Check the file's magic bytes match its declared type. Extensions and MIME
 * types are client-controlled; the signature is what the bytes actually are.
 */
export async function sniffFileSignature(file: File): Promise<"image/jpeg" | "image/png" | "application/pdf" | null> {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image/png";
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return "application/pdf";
  return null;
}

const uploadShape = {
  uploadId: z.string().min(1),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
};
export const uploadRefSchema = z.object(uploadShape);
const requiredUpload = (what: string) => z.object(uploadShape, { error: `Upload the ${what}` });
const mustAccept = (what: string) => z.boolean().refine((v) => v === true, { message: `You must accept the ${what}` });

/* ───────────── Registration payloads (validated server-side too) ───────────── */

/** Interface language the new account starts with; changeable later in the profile. */
export const languageSchema = z.enum(LANGS, { error: "Choose a language" });

export const personalRegistrationSchema = z.object({
  fullName: nameSchema,
  phone: phoneSchema,
  email: optionalEmailSchema,
  dateOfBirth: dobSchema,
  address: addressSchema,
  password: passwordSchema,
  pin: pinSchema,
  nidNumber: optionalNidSchema,
  nidDocument: uploadRefSchema.nullable().optional(),
  selfieCheckId: z.string().nullable().optional(),
  otpChallengeId: z.string().min(1, "Send a verification code to your mobile first"),
  otpCode: otpSchema,
  language: languageSchema.default(DEFAULT_LANG),
  acceptTerms: mustAccept("terms"),
});
export type PersonalRegistrationInput = z.input<typeof personalRegistrationSchema>;

export const agentRegistrationSchema = z.object({
  fullName: nameSchema,
  phone: phoneSchema,
  email: emailSchema,
  dateOfBirth: dobSchema,
  address: addressSchema,
  outletName: z.string().trim().min(3, "Enter the outlet / shop name").max(80),
  businessAddress: addressSchema,
  emergencyName: nameSchema,
  emergencyRelation: z.string().trim().min(2, "Enter the relationship").max(40),
  emergencyPhone: phoneSchema,
  nidNumber: nidSchema,
  nidFront: requiredUpload("front of your NID"),
  nidBack: requiredUpload("back of your NID"),
  photo: requiredUpload("photograph"),
  password: passwordSchema,
  pin: pinSchema,
  otpChallengeId: z.string().min(1, "Send a verification code to your mobile first"),
  otpCode: otpSchema,
  language: languageSchema.default(DEFAULT_LANG),
  acceptTerms: mustAccept("agent terms"),
});
export type AgentRegistrationInput = z.input<typeof agentRegistrationSchema>;

export const BUSINESS_CATEGORIES = [
  "RESTAURANT",
  "GROCERY",
  "RETAIL",
  "ECOMMERCE",
  "PHARMACY",
  "SERVICES",
  "OTHER",
] as const;

export const merchantRegistrationSchema = z.object({
  ownerName: nameSchema,
  phone: phoneSchema,
  email: emailSchema,
  businessName: z.string().trim().min(2, "Enter the business name").max(100),
  category: z.enum(BUSINESS_CATEGORIES, { error: "Choose a business category" }),
  businessAddress: addressSchema,
  registrationNumber: z.string().trim().min(4, "Enter the registration number").max(40),
  tradeLicenseNumber: z.string().trim().min(4, "Enter the trade license number").max(40),
  taxId: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{9,13}$/.test(v), "TIN/BIN must be 9–13 digits")
    .optional(),
  ownerNidNumber: nidSchema,
  tradeLicenseDoc: requiredUpload("trade license"),
  registrationDoc: requiredUpload("registration certificate"),
  ownerNidDoc: requiredUpload("owner's NID"),
  taxDoc: uploadRefSchema.nullable().optional(),
  password: passwordSchema,
  pin: pinSchema,
  otpChallengeId: z.string().min(1, "Send a verification code to your mobile first"),
  otpCode: otpSchema,
  language: languageSchema.default(DEFAULT_LANG),
  acceptTerms: mustAccept("merchant terms"),
});
export type MerchantRegistrationInput = z.input<typeof merchantRegistrationSchema>;

export function firstZodError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input";
}

export function zodFieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}
