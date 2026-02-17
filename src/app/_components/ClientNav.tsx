"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
};

function matches(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function ClientNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  // Find the single "best" active item: longest href that matches pathname
  const activeHref =
    items
      .filter((it) => matches(pathname, it.href))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;

  return (
    <nav style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      {items.map((item) => {
        const active = item.href === activeHref;

        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              textDecoration: "none",
              padding: "6px 10px",
              borderRadius: 8,
              fontWeight: active ? 700 : 500,
              background: active ? "#000000" : "transparent",
              color: active ? "#ffffff" : "#000000",
              border: active ? "1px solid #000000" : "1px solid transparent",
              transition: "all 0.15s ease",
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
