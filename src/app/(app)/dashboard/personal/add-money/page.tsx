import type { Metadata } from "next";
import { AddMoneyView } from "@/features/personal/flows";

export const metadata: Metadata = { title: "Add Money" };

export default function Page() {
  return <AddMoneyView />;
}
