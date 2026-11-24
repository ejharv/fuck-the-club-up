import type { Metadata } from "next";
import { Archivo, Bowlby_One, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { signOutAction } from "./actions";
import { SECTIONS, SITE_URL } from "@/lib/sections";
import { cf } from "@/lib/env";
import { currentMember } from "@/lib/session";
import { getSiteContent } from "@/lib/site-content";
import "./globals.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], weight: ["400", "500", "700"], display: "swap" });
const bowlby = Bowlby_One({ variable: "--font-bowlby", subsets: ["latin"], weight: "400", display: "swap" });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Fuck The Club Up", template: "%s | Fuck The Club Up" },
  description: "Going out in Ann Arbor: the nights, the places, and the stories that turned into lore.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [member, content] = await Promise.all([currentMember(), getSiteContent()]);
  const openTakedowns =
    member?.role === "admin"
      ? ((await (await cf()).DB.prepare("SELECT COUNT(*) AS n FROM takedown_requests WHERE status = 'open'").first<{ n: number }>())?.n ?? 0)
      : 0;
  return (
    <html lang="en" className={`${archivo.variable} ${bowlby.variable} ${jetbrains.variable}`}>
      <body className="antialiased">
        <a href="#main" className="mono sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-maize focus:px-3 focus:py-2 focus:text-night">
          Skip to content
        </a>
        <header className="mx-auto max-w-6xl px-4 pt-5 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="display text-xl sm:text-2xl">
              Fuck The <span className="text-maize">Club</span> Up
            </Link>
            <div className="mono flex items-center gap-4">
              {member ? (
                <>
                  <Link href="/new" className="rounded-sm bg-maize px-3 py-2 text-night hover:bg-ink">
                    New post
                  </Link>
                  {member.role === "admin" && (
                    <>
                      <Link href="/nights" className="hover:text-maize">
                        Nights
                      </Link>
                      <Link href="/crew" className="hidden hover:text-maize sm:inline">
                        Crew
                      </Link>
                      <Link href="/site" className="hidden hover:text-maize sm:inline">
                        Site
                      </Link>
                      <Link href="/takedowns" className="hover:text-maize">
                        Takedowns
                        {openTakedowns > 0 && (
                          <span className="ml-1 rounded-full bg-pink px-1.5 text-night" aria-label={`${openTakedowns} open`}>
                            {openTakedowns}
                          </span>
                        )}
                      </Link>
                    </>
                  )}
                  <form action={signOutAction}>
                    <button className="uppercase tracking-[inherit] text-dim hover:text-ink">Sign out</button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="text-dim hover:text-ink">
                  Crew sign in
                </Link>
              )}
            </div>
          </div>
          <nav aria-label="Sections" className="mono -mx-4 mt-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
            <ul className="flex gap-5 whitespace-nowrap text-dim">
              {SECTIONS.map((s) => (
                <li key={s.slug}>
                  <Link href={`/section/${s.slug}`} className="hover:text-maize">
                    {s.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/about" className="hover:text-maize">
                  About
                </Link>
              </li>
            </ul>
          </nav>
        </header>
        <div className="light-strip" aria-hidden />
        <main id="main">{children}</main>
        <footer className="mx-auto mt-24 max-w-6xl border-t border-line px-4 py-8 sm:px-6">
          {content.footerLine && <p className="text-dim">{content.footerLine}</p>}
          {content.footerRules && <p className="mono mt-3 text-maize">{content.footerRules}</p>}
          <p className="mono mt-4 flex gap-5 text-dim">
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
