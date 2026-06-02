"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "概要" },
  { href: "/members", label: "メンバー" },
  { href: "/api-messages", label: "API Messages" },
  { href: "/simulate", label: "配分シミュレーション" },
  { href: "/sync-log", label: "取り込み履歴" },
];

export function AppNav() {
  const path = usePathname();
  return (
    <nav className="app-nav">
      {NAV.map((n) => {
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
