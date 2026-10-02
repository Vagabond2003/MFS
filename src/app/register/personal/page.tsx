import type { Metadata } from "next";
import { PersonalRegistration } from "@/features/register/personal-form";

export const metadata: Metadata = { title: "Personal account" };

export default function Page() {
  return <PersonalRegistration />;
}
