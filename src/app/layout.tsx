import type { Metadata, Viewport } from "next";
import { Noto_Sans_Bengali, Plus_Jakarta_Sans } from "next/font/google";
import { getLang, getT } from "@/lib/i18n/server";
import { Providers } from "./providers";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

/** Bengali glyphs — Plus Jakarta Sans has none, so the browser falls back to this per character. */
const bengali = Noto_Sans_Bengali({
  variable: "--font-bengali",
  subsets: ["bengali"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: {
      default: t("Kosh — Simple. Secure. Smarter Payments."),
      template: "%s · Kosh",
    },
    description: t("Kosh is a mobile financial services platform for personal customers, agents and merchants."),
  };
}

export const viewport: Viewport = {
  themeColor: "#0d8065",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang();
  return (
    <html lang={lang} className={`${jakarta.variable} ${bengali.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers lang={lang}>{children}</Providers>
      </body>
    </html>
  );
}
