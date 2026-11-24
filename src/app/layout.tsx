import type { Metadata } from "next";
import { Archivo, Bowlby_One, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { signOutAction } from "./actions";
import { SITE_URL } from "@/lib/sections";

const TABS = [
  { href: "/night-reports", label: "Night Reports" },
  { href: "/playlists", label: "Playlists" },
  { href: "/places", label: "Places" },
  { href: "/about", label: "About" },
];
import { cf } from "@/lib/env";
import { isAnyHost } from "@/lib/hosting";
import { currentMember, signedInEmail } from "@/lib/session";
import { getSiteContent } from "@/lib/site-content";
import "./globals.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], weight: ["400", "500", "700"], display: "swap" });
const bowlby = Bowlby_One({ variable: "--font-bowlby", subsets: ["latin"], weight: "400", display: "swap" });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Fuck The Club Up", template: "%s | Fuck The Club Up" },
  description: "Going out: the nights, the places, and the stories that turned into lore.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [member, content, email] = await Promise.all([currentMember(), getSiteContent(), signedInEmail()]);
  const hostOnly = !member && (await isAnyHost(email));
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
        <header className="mx-auto max-w-6xl px-[max(1rem,env(safe-area-inset-left))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:pt-5">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 sm:gap-x-4">
            <Link href="/" className="display -my-2 shrink-0 whitespace-nowrap py-3 text-[1.15rem] min-[400px]:text-xl sm:text-2xl">
              Fuck The <span className="text-maize">Club</span> Up
            </Link>
            <div className={`mono hdr-actions -mr-2 flex flex-wrap items-center gap-x-1 gap-y-1 sm:gap-x-2 ${member ? "-ml-2 w-[calc(100%+1rem)] justify-between sm:ml-0 sm:w-auto sm:justify-end" : ""}`}>
              {member ? (
                <>
                  <Link href="/new" className="ml-2 inline-flex min-h-11 items-center rounded-sm bg-maize px-3 text-night hover:bg-ink sm:ml-0 sm:mr-1">
                    New post
                  </Link>
                  <Link href="/nights" className="tap hover:text-maize">
                    Host
                  </Link>
                  {member.role === "admin" && (
                    <>
                      <Link href="/crew" className="tap hidden hover:text-maize sm:inline-flex">
                        Crew
                      </Link>
                      <Link href="/site" className="tap hidden hover:text-maize sm:inline-flex">
                        Site
                      </Link>
                      <Link href="/takedowns" className="tap hover:text-maize">
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
                    <button className="tap uppercase tracking-[inherit] text-dim hover:text-ink">Sign out</button>
                  </form>
                </>
              ) : hostOnly ? (
                <>
                  <Link href="/nights" className="tap hover:text-maize">
                    Host
                  </Link>
                  <form action={signOutAction}>
                    <button className="tap uppercase tracking-[inherit] text-dim hover:text-ink">Sign out</button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="tap text-dim hover:text-ink">
                  Crew sign in
                </Link>
              )}
            </div>
          </div>
          <nav aria-label="Site" className="mono mt-1 pb-1 sm:mt-2">
            <ul className="-mx-2 flex flex-wrap text-dim">
              {TABS.map((t) => (
                <li key={t.href}>
                  <Link href={t.href} className="tap whitespace-nowrap hover:text-maize">
                    {t.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </header>
        <div className="light-strip" aria-hidden />
        <main id="main">{children}</main>
        <footer className="mx-auto mt-20 max-w-6xl border-t border-line px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8 sm:mt-28 sm:px-6">
          {content.footerLine && <p className="max-w-[60ch] text-dim">{content.footerLine}</p>}
          {content.footerRules && <p className="mono mt-3 text-maize">{content.footerRules}</p>}
          <p className="mono -mx-2 mt-3 flex text-dim">
            <Link href="/privacy" className="tap hover:text-ink">Privacy</Link>
            <Link href="/terms" className="tap hover:text-ink">Terms</Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
