"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// 意味区切りで <wbr> を挿入する対象。バッジ・コード・入力欄などは避ける。
const SELECTOR = "h1, h2, h3, h4, p, li, .page-subtitle, .callout, .lede, blockquote";

export function BudouxWrap() {
  const pathname = usePathname();
  useEffect(() => {
    let cancelled = false;
    import("budoux").then(({ loadDefaultJapaneseParser }) => {
      if (cancelled) return;
      const parser = loadDefaultJapaneseParser();
      document.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
        parser.applyToElement(el);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);
  return null;
}
