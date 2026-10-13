import { NavLink, useLocation } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { NavSection } from '@/app/navigation';
import { useUiStore } from '@/store/uiStore';
import { Logo } from './Logo';
import { useDb } from '@/hooks/useDb';
import { useShopScope } from '@/hooks/useShopScope';

/** Counts that need someone's attention: unread chats, receipts to check. */
function useBadges(): Record<string, number> {
  const db = useDb();
  const { shopId } = useShopScope();
  const mine = <T extends { shopId: string | null }>(rows: T[]): T[] => (shopId === null ? rows : rows.filter((r) => r.shopId === shopId));
  return {
    messages: mine(db.messages).filter((m) => m.from === 'customer' && !m.readByStaff).length,
    payments: mine(db.onlinePayments).filter((p) => p.status === 'verifying').length,
  };
}

export interface SidebarProps {
  sections: NavSection[];
}

/** True when a nav item owns the current URL, including its child routes. */
function isActive(pathname: string, item: { to: string; match?: string }): boolean {
  if (item.match) return pathname === item.match || pathname.startsWith(`${item.match}/`);
  return pathname === item.to;
}

function NavList({
  sections,
  collapsed,
  onNavigate,
}: {
  sections: NavSection[];
  collapsed: boolean;
  onNavigate?: () => void;
}): JSX.Element {
  const { pathname } = useLocation();
  const badges = useBadges();

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main">
      {sections.map((section) => (
        <div key={section.label}>
          {!collapsed && (
            <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
              {section.label}
            </p>
          )}

          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item);
              const Icon = item.icon;

              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={!item.match}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors',
                      collapsed && 'justify-center px-0',
                      active
                        ? 'bg-brand text-brand-ink shadow-sm'
                        : 'text-muted hover:bg-line/50 hover:text-ink',
                    )}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {item.badge && (badges[item.badge] ?? 0) > 0 && (
                      <span className={cn('ml-auto rounded-full bg-danger px-1.5 text-[11px] font-semibold leading-5 text-white', collapsed && 'absolute ml-5 -mt-5')}>
                        {badges[item.badge]}
                      </span>
                    )}
                    {collapsed && <span className="sr-only">{item.label}</span>}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ sections }: SidebarProps): JSX.Element {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleCollapsed = useUiStore((s) => s.toggleSidebarCollapsed);
  const open = useUiStore((s) => s.sidebarOpen);
  const setOpen = useUiStore((s) => s.setSidebarOpen);

  return (
    <>
      {/* Permanent rail from lg up */}
      <aside
        className={cn(
          'no-print hidden shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[68px]' : 'w-[248px]',
        )}
      >
        <div
          className={cn(
            'flex h-16 items-center border-b border-line px-3',
            collapsed ? 'justify-center' : 'justify-between',
          )}
        >
          <Logo markOnly={collapsed} />
          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Collapse sidebar"
              className="grid h-8 w-8 place-items-center rounded-lg text-subtle transition-colors hover:bg-line/60 hover:text-ink"
            >
              <PanelLeftClose className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>

        <NavList sections={sections} collapsed={collapsed} />

        {collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Expand sidebar"
            className="mx-auto mb-3 grid h-9 w-9 place-items-center rounded-xl text-subtle transition-colors hover:bg-line/60 hover:text-ink"
          >
            <PanelLeftOpen className="h-4 w-4" aria-hidden />
          </button>
        )}
      </aside>

      {/* Slide-over drawer below lg */}
      {open && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/40 animate-fade-in" onClick={() => setOpen(false)} aria-hidden />

          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex w-[278px] flex-col bg-surface shadow-pop animate-slide-in-right"
          >
            <div className="flex h-16 items-center justify-between border-b border-line px-3">
              <Logo />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-line/60 hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <NavList sections={sections} collapsed={false} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
