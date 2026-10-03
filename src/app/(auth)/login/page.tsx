import { Suspense } from "react";
import { LoginForm } from "@/features/auth/login-form";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Login");

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
