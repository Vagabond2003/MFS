import type { Metadata } from "next";
import { SendMoneyView } from "@/features/personal/flows";

export const metadata: Metadata = { title: "Send Money" };

export default function Page() {
  return <SendMoneyView />;
}
