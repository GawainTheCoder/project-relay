import {
  BookOpen,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  Database,
  Layers3,
  Menu,
  Rss,
  Search,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import { CommandPalette } from "../CommandPalette";
import { useDashboard } from "../../context/useDashboard";

const primaryNavigation = [
  { label: "Today", href: "/", icon: Sun, end: true },
  { label: "Theses", href: "/theses", icon: BrainCircuit, end: false },
  { label: "Evidence", href: "/signals", icon: Database, end: false },
  { label: "Briefs", href: "/briefs", icon: BookOpen, end: false },
  { label: "Stack", href: "/stack", icon: Layers3, end: false },
  { label: "Sources", href: "/sources", icon: Rss, end: false },
] as const;

export function AppShell() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { data } = useDashboard();
  const isSeedData = data?.demoData ?? false;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSearchOpen((current) => !current);
      }
      if (event.key === "Escape") {
        setIsSearchOpen(false);
        setIsMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const nav = (
    <>
      <div className="flex h-18 items-center border-b border-relay-border px-5">
        <span
          className={`overflow-hidden text-xl font-semibold tracking-tight transition-[width,opacity] ${
            isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
          }`}
        >
          Relay
        </span>
        {isCollapsed ? (
          <span className="font-mono text-base font-semibold text-relay-accent">
            R
          </span>
        ) : null}
      </div>
      <nav aria-label="Primary navigation" className="flex-1 px-2 py-5">
        <ul className="space-y-1">
          {primaryNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <NavLink
                  className={({ isActive }) =>
                    `group relative flex h-11 items-center gap-3 px-4 text-sm transition-colors before:absolute before:left-0 before:top-1/2 before:h-5 before:w-px before:-translate-y-1/2 before:bg-transparent before:transition-colors ${
                      isActive
                        ? "text-relay-text before:bg-relay-accent [&_svg]:text-relay-accent"
                        : "text-relay-muted hover:bg-white/[0.025] hover:text-relay-text [&_svg]:text-relay-subtle group-hover:[&_svg]:text-relay-muted"
                    }`
                  }
                  end={item.end}
                  onClick={() => setIsMobileOpen(false)}
                  to={item.href}
                >
                  <Icon
                    aria-hidden="true"
                    className="size-[18px] shrink-0"
                    strokeWidth={1.7}
                  />
                  <span
                    className={`truncate transition-opacity ${
                      isCollapsed ? "lg:hidden" : ""
                    }`}
                  >
                    {item.label}
                  </span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-relay-border p-2">
        <button
          aria-label="Search Relay"
          className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm text-relay-muted transition-colors hover:bg-relay-surface-2 hover:text-relay-text"
          onClick={() => setIsSearchOpen(true)}
          type="button"
        >
          <Search aria-hidden="true" className="size-[18px] shrink-0" />
          <span className={isCollapsed ? "lg:hidden" : ""}>Search</span>
          {!isCollapsed ? (
            <kbd className="ml-auto rounded border border-relay-border px-1.5 py-0.5 font-mono text-[10px] text-relay-subtle">
              ⌘K
            </kbd>
          ) : null}
        </button>
        <button
          aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"}
          className="mt-1 hidden h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-relay-subtle transition-colors hover:bg-relay-surface-2 hover:text-relay-text lg:flex"
          onClick={() => setIsCollapsed((current) => !current)}
          type="button"
        >
          {isCollapsed ? (
            <ChevronRight aria-hidden="true" className="size-[18px]" />
          ) : (
            <>
              <ChevronLeft aria-hidden="true" className="size-[18px]" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-relay-bg text-relay-text">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-relay-border bg-relay-deep px-4 lg:hidden">
        <button
          aria-expanded={isMobileOpen}
          aria-label="Open navigation"
          className="rounded p-2 text-relay-muted hover:bg-relay-surface-2 hover:text-relay-text"
          onClick={() => setIsMobileOpen(true)}
          type="button"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
        <span className="text-base font-semibold">Relay</span>
        <button
          aria-label="Search Relay"
          className="rounded p-2 text-relay-muted hover:bg-relay-surface-2 hover:text-relay-text"
          onClick={() => setIsSearchOpen(true)}
          type="button"
        >
          <Search aria-hidden="true" className="size-5" />
        </button>
      </header>

      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-relay-border bg-relay-deep transition-[width] duration-200 lg:flex ${
          isCollapsed ? "w-[72px]" : "w-[196px]"
        }`}
      >
        {nav}
      </aside>

      {isMobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/70"
            onClick={() => setIsMobileOpen(false)}
            type="button"
          />
          <aside className="relative flex h-full w-[244px] flex-col border-r border-relay-border bg-relay-deep">
            <button
              aria-label="Close navigation"
              className="absolute right-3 top-4 rounded p-2 text-relay-muted hover:bg-relay-surface-2 hover:text-relay-text"
              onClick={() => setIsMobileOpen(false)}
              type="button"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
            {nav}
          </aside>
        </div>
      ) : null}

      <div
        className={`min-w-0 transition-[margin] duration-200 ${
          isCollapsed ? "lg:ml-[72px]" : "lg:ml-[196px]"
        }`}
      >
        {isSeedData ? (
          <div
            className="flex min-h-8 items-center justify-center border-b border-relay-warning/25 bg-relay-warning/7 px-4 py-1.5 text-center font-mono text-[9px] uppercase tracking-[0.08em] text-relay-warning"
            role="status"
          >
            Seed data · Example source quotes are not independently verified
          </div>
        ) : null}
        <Outlet />
      </div>

      <CommandPalette
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </div>
  );
}
