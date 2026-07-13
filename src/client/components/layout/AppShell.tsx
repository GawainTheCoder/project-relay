import {
  BrainCircuit,
  BookOpenText,
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  Database,
  LayoutDashboard,
  Menu,
  Rss,
  Search,
  X,
} from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { NavLink, Outlet } from "react-router-dom";

import { CommandPalette } from "../CommandPalette";
import { useDashboard } from "../../context/useDashboard";

const primaryNavigation = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, end: true },
  { label: "Theses", href: "/theses", icon: BrainCircuit, end: false },
  { label: "Reviews", href: "/reviews", icon: CalendarCheck2, end: false },
] as const;

const utilityNavigation = [
  { label: "Evidence", href: "/signals", icon: Database },
  { label: "Sources", href: "/sources", icon: Rss },
  { label: "Daily readout", href: "/today", icon: BookOpenText },
] as const;

export function AppShell() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const mobileCloseButtonRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const wasMobileOpenRef = useRef(false);
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

  useEffect(() => {
    let animationFrame: number | null = null;
    if (isMobileOpen) {
      wasMobileOpenRef.current = true;
      animationFrame = window.requestAnimationFrame(() => {
        mobileCloseButtonRef.current?.focus();
      });
    } else if (wasMobileOpenRef.current) {
      wasMobileOpenRef.current = false;
      mobileMenuButtonRef.current?.focus();
    }
    return () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [isMobileOpen]);

  const containMobileDrawerFocus = (
    event: ReactKeyboardEvent<HTMLElement>,
  ) => {
    if (event.key !== "Tab") {
      return;
    }
    const focusable = Array.from(
      mobileDrawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const nav = (
    <>
      <div className="flex h-[76px] items-center border-b border-relay-border px-5">
        <div
          className={`overflow-hidden transition-[width,opacity] ${
            isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
          }`}
        >
          <span className="block text-lg font-semibold tracking-tight">
            Relay
          </span>
          <span className="mt-0.5 block whitespace-nowrap text-xs text-relay-muted">
            Investment notebook
          </span>
        </div>
        {isCollapsed ? (
          <span className="font-mono text-base font-semibold text-relay-accent">
            R
          </span>
        ) : null}
      </div>
      <nav aria-label="Relay navigation" className="flex-1 px-2 py-5">
        <ul className="space-y-1">
          {primaryNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <NavLink
                  aria-label={isCollapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    `group relative flex min-h-11 items-center gap-3 rounded-md px-4 text-sm transition-colors before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:bg-transparent before:transition-colors ${
                      isActive
                        ? "bg-relay-surface text-relay-text before:bg-relay-accent [&_svg]:text-relay-accent"
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
        <div
          className={
            isCollapsed ? "my-5 border-t border-relay-border" : "my-5"
          }
        >
          {!isCollapsed ? (
            <p className="px-4 pb-2 text-xs font-medium text-relay-subtle">
              Workspace
            </p>
          ) : null}
          <ul className="space-y-1">
            {utilityNavigation.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <NavLink
                    aria-label={isCollapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `flex min-h-11 items-center gap-3 rounded-md px-4 text-sm transition-colors ${
                        isActive
                          ? "bg-relay-surface text-relay-text [&_svg]:text-relay-accent"
                          : "text-relay-muted hover:bg-relay-surface hover:text-relay-text [&_svg]:text-relay-subtle"
                      }`
                    }
                    onClick={() => setIsMobileOpen(false)}
                    to={item.href}
                  >
                    <Icon
                      aria-hidden="true"
                      className="size-[18px] shrink-0"
                      strokeWidth={1.7}
                    />
                    <span className={isCollapsed ? "lg:hidden" : ""}>
                      {item.label}
                    </span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
      <div className="border-t border-relay-border p-2">
        <button
          aria-label="Search Relay"
          className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm text-relay-muted transition-colors hover:bg-relay-surface-2 hover:text-relay-text"
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
      <a
        className="sr-only z-50 rounded-md bg-relay-accent px-4 py-2 text-sm font-semibold text-relay-deep focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        href="#relay-main-content"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-relay-border bg-relay-deep/95 px-3 backdrop-blur lg:hidden">
        <button
          aria-expanded={isMobileOpen}
          aria-label="Open navigation"
          className="grid size-11 place-items-center rounded-md text-relay-muted hover:bg-relay-surface-2 hover:text-relay-text"
          onClick={() => setIsMobileOpen(true)}
          ref={mobileMenuButtonRef}
          type="button"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
        <span className="text-sm font-semibold tracking-tight">Relay</span>
        <button
          aria-label="Search Relay"
          className="grid size-11 place-items-center rounded-md text-relay-muted hover:bg-relay-surface-2 hover:text-relay-text"
          onClick={() => setIsSearchOpen(true)}
          type="button"
        >
          <Search aria-hidden="true" className="size-5" />
        </button>
      </header>

      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-relay-border bg-relay-deep transition-[width] duration-200 lg:flex ${
          isCollapsed ? "w-[72px]" : "w-[208px]"
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
          <aside
            aria-label="Navigation menu"
            aria-modal="true"
            className="relative flex h-full w-[272px] flex-col border-r border-relay-border bg-relay-deep"
            onKeyDown={containMobileDrawerFocus}
            ref={mobileDrawerRef}
            role="dialog"
          >
            <button
              aria-label="Close navigation"
              className="absolute right-3 top-4 rounded p-2 text-relay-muted hover:bg-relay-surface-2 hover:text-relay-text"
              onClick={() => setIsMobileOpen(false)}
              ref={mobileCloseButtonRef}
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
          isCollapsed ? "lg:ml-[72px]" : "lg:ml-[208px]"
        }`}
      >
        {isSeedData ? (
          <div
            className="flex min-h-8 items-center justify-center border-b border-relay-warning/25 bg-relay-warning/7 px-4 py-1.5 text-center text-xs font-medium text-relay-warning"
            role="status"
          >
            Seed data · Example source quotes are not independently verified
          </div>
        ) : null}
        <div
          className="min-w-0 pb-20 focus:outline-none lg:pb-0"
          id="relay-main-content"
          tabIndex={-1}
        >
          <Outlet />
        </div>
      </div>

      <nav
        aria-label="Primary mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 grid h-[68px] grid-cols-3 border-t border-relay-border bg-relay-deep/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {primaryNavigation.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              className={({ isActive }) =>
                `flex min-h-11 flex-col items-center justify-center gap-1 rounded-md text-xs transition-colors ${
                  isActive
                    ? "text-relay-text [&_svg]:text-relay-accent"
                    : "text-relay-muted [&_svg]:text-relay-subtle"
                }`
              }
              end={item.end}
              key={item.href}
              to={item.href}
            >
              <Icon aria-hidden="true" className="size-[18px]" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <CommandPalette
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </div>
  );
}
