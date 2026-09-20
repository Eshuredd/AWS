"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const links = [
  { href: "/", label: "Plan ride" },
  { href: "/trusted-contacts", label: "Trusted contacts" },
];

export default function HeaderNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  return <div className="header-navigation" ref={menu}>
    <nav className="desktop-nav" aria-label="Primary navigation">
      {links.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined}>{link.label}</Link>)}
    </nav>
    <button type="button" className="menu-button" aria-label="Open navigation menu" aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(value => !value)}>
      <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
    </button>
    {open && <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation">
      {links.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} onClick={() => setOpen(false)}>{link.label === "Plan ride" ? "Plan a ride" : link.label}</Link>)}
    </nav>}
  </div>;
}
