"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; external?: boolean };

const NAV: NavItem[] = [
  { href: "/", label: "概要" },
  { href: "/members", label: "メンバー" },
  { href: "/cowork", label: "Cowork" },
  { href: "/code-otel", label: "Code (OTel)" },
  { href: "/api-messages", label: "コンソール API" },
  { href: "/simulate", label: "配分シミュレーション" },
  { href: "/sync-log", label: "取り込み履歴" },
  {
    href: "https://app.instyle.group/html/claude-team-usage-reports.html",
    label: "レポート",
    external: true,
  },
];

export function AppNav() {
  const path = usePathname();
  return (
    <nav className="app-nav">
      {NAV.map((n) => {
        if (n.external) {
          return (
            <a
              key={n.href}
              href={n.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {n.label}
            </a>
          );
        }
        const isActive =
          n.href === "/" ? path === "/" : path.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} className={isActive ? "is-active" : ""}>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
