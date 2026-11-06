"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Compass,
  Bookmark,
  Lightbulb,
  Bell,
  UserRound,
  Plus,
  Search,
  ArrowUpRight,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { useApp } from "./providers";
import { Brand } from "./ui";

const nav = [
  { href: "/feed", label: "The table", icon: Home },
  { href: "/explore", label: "Explore ideas", icon: Compass },
  { href: "/saved", label: "Saved for later", icon: Bookmark },
  { href: "/my-ideas", label: "My ideas", icon: Lightbulb },
  { href: "/notifications", label: "Notifications", icon: Bell },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { me, guard } = useApp();
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className={`app-shell ${collapsed ? "nav-collapsed" : ""}`}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Brand />
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!collapsed}
          aria-controls="sidebar-navigation"
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
        <div className="sidebar-inner" id="sidebar-navigation">
          <button
            type="button"
            className="button primary create-nav"
            aria-label="Pitch an idea"
            title="Pitch an idea"
            onClick={() => guard(() => router.push("/new"))}
          >
            <Plus size={19} />
            <span>Pitch an idea</span>
          </button>
          <nav aria-label="Main navigation">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                className={`nav-item ${path === href || (href === "/feed" && path === "/") ? "active" : ""}`}
                key={href}
                href={href}
                aria-label={label}
                aria-current={
                  path === href || (href === "/feed" && path === "/")
                    ? "page"
                    : undefined
                }
                title={label}
              >
                <Icon size={19} strokeWidth={1.7} />
                <span>{label}</span>
              </Link>
            ))}
            {me?.profile?.role === "admin" && (
              <Link
                className={`nav-item ${path === "/admin" ? "active" : ""}`}
                href="/admin"
                aria-label="Moderation"
                title="Moderation"
                aria-current={path === "/admin" ? "page" : undefined}
              >
                <ShieldCheck size={19} />
                <span>Moderation</span>
              </Link>
            )}
          </nav>
          <div className="sidebar-bottom">
            <Link href="/community" title="Community guidelines">
              <span>Table manners</span>
            </Link>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <Link href="/" className="topbar-title">
            The idea café<span>OPEN MINDS. OPEN TABLE.</span>
          </Link>
          <form
            className="search-box"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`/explore?q=${encodeURIComponent(search)}`);
            }}
          >
            <Search size={17} />
            <input
              aria-label="Search ideas"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find your next rabbit hole…"
            />
            <kbd>↵</kbd>
          </form>
          <div className="topbar-account">
            <Link
              className="notification-button icon-button"
              href="/notifications"
              aria-label="Notifications"
            >
              <Bell size={19} />
            </Link>
            {!me?.profile && (
              <button
                className="button small-button dark"
                onClick={() => guard(() => router.push("/new"))}
              >
                Pitch an idea
                <ArrowUpRight size={14} />
              </button>
            )}
          </div>
        </header>
        <main id="main-content" className="workspace" tabIndex={-1}>
          {children}
        </main>
        <footer className="footer">
          <span>
            roast & toast. <span>Made for ideas with a little potential.</span>
          </span>
          <div>
            <Link href="/community">Table manners</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <Link
          href="/feed"
          aria-current={path === "/feed" || path === "/" ? "page" : undefined}
        >
          <Home size={20} />
          <span>The table</span>
        </Link>
        <Link
          href="/explore"
          aria-current={path === "/explore" ? "page" : undefined}
        >
          <Compass size={20} />
          <span>Explore</span>
        </Link>
        <button
          className="mobile-create"
          onClick={() => guard(() => router.push("/new"))}
          aria-label="Pitch an idea"
        >
          <Plus size={25} />
        </button>
        <Link
          href="/saved"
          aria-current={path === "/saved" ? "page" : undefined}
        >
          <Bookmark size={20} />
          <span>Saved</span>
        </Link>
        <Link
          href="/profile"
          aria-current={path === "/profile" ? "page" : undefined}
        >
          <UserRound size={20} />
          <span>You</span>
        </Link>
      </nav>
    </div>
  );
}
