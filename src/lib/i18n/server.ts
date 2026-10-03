import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DEFAULT_LANG, LANG_COOKIE, isLang, translator, type Lang } from "./core";

/** The visitor's interface language, from the language cookie. */
export async function getLang(): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(value) ? value : DEFAULT_LANG;
}

/** `t()` for Server Components. */
export async function getT() {
  return translator(await getLang());
}

/** `export const generateMetadata = titled("Send Money")` — a page title in the visitor's language. */
export function titled(title: string) {
  return async (): Promise<Metadata> => ({ title: (await getT())(title) });
}
