import { PersonalRegistration } from "@/features/register/personal-form";
import { titled } from "@/lib/i18n/server";

export const generateMetadata = titled("Personal account");

export default function Page() {
  return <PersonalRegistration />;
}
