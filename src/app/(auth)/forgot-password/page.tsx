import { ForgotPassword } from "@/features/auth/forgot-password";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Reset password");

export default function ForgotPasswordPage() {
  return <ForgotPassword />;
}
