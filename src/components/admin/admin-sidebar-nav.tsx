"use client";

/**
 * Grouped admin sidebar navigation (ops pass 2026-10-06).
 *
 * 26 links in one flat list meant every visit started with a scan. Groups
 * give the list a shape, and any group staff never open can be folded away
 * (remembered per browser) — the badge still shows on the folded header, so
 * a waiting application is never hidden by a collapsed section.
 */

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { IconChevron } from "@/components/ui/icons";
import {
  ADMIN_NAV_GROUPS,
  navGroupsServerSnapshot,
  pendingFor,
  pendingNoun,
  readCollapsedGroups,
  subscribeNavGroups,
  writeCollapsedGroups,
  type AdminQueue,
} from "./admin-nav";

export type AdminQueueCounts = Partial<Record<AdminQueue, number>>;

export default function AdminSidebarNav({
  pathname,
  counts,
  onNavigate,
}: {
  pathname: string;
  counts: AdminQueueCounts;
  /** Close the mobile drawer after a tap. */
  onNavigate?: () => void;
}) {
  // localStorage holds the fold; the store keeps React in step with it. Until
  // it is read on the client the server snapshot keeps every group open, so
  // the markup never disagrees on first paint.
  const collapsed = useSyncExternalStore(
    subscribeNavGroups,
    readCollapsedGroups,
    navGroupsServerSnapshot,
  );

  const toggle = (id: string): void => {
    writeCollapsedGroups(
      collapsed.includes(id)
        ? collapsed.filter((group) => group !== id)
        : [...collapsed, id],
    );
  };

  return (
    <nav aria-label="Admin" className="flex-1 space-y-3 px-3 py-4">
      {ADMIN_NAV_GROUPS.map((group) => {
        const open = !collapsed.includes(group.id);
        const groupPending = group.items.reduce(
          (sum, item) => sum + pendingFor(item, counts),
          0,
        );
        return (
          <section key={group.id}>
            <h2>
              <button
                type="button"
                onClick={() => toggle(group.id)}
                aria-expanded={open}
                aria-controls={`admin-nav-${group.id}`}
                className="flex w-full items-center gap-2 rounded-lg px-3.5 py-1.5 text-left text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-ivory-100/45 transition-colors hover:text-ivory-100/80"
              >
                <IconChevron
                  className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
                />
                <span className="flex-1">{group.label}</span>
                {groupPending > 0 && (
                  <span
                    className="rounded-full bg-gold-500 px-1.5 py-0.5 text-[0.62rem] font-bold leading-none text-white"
                    aria-label={`${groupPending} waiting in ${group.label}`}
                  >
                    {groupPending > 99 ? "99+" : groupPending}
                  </span>
                )}
              </button>
            </h2>
            <ul
              id={`admin-nav-${group.id}`}
              hidden={!open}
              className="mt-0.5 space-y-0.5"
            >
              {group.items.map((item) => {
                const active = item.match(pathname);
                const waiting = pendingFor(item, counts);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                        active
                          ? "bg-ivory-50/10 text-ivory-50 ring-1 ring-white/10"
                          : "text-ivory-100/60 hover:bg-white/5 hover:text-ivory-50"
                      }`}
                    >
                      <item.icon className="h-[1.1rem] w-[1.1rem]" />
                      <span className="flex-1">{item.label}</span>
                      {waiting > 0 && item.queue && (
                        <span
                          className="rounded-full bg-gold-500 px-1.5 py-0.5 text-[0.62rem] font-bold leading-none text-white"
                          aria-label={`${waiting} ${pendingNoun(item.queue)}${waiting === 1 ? "" : "s"} waiting`}
                        >
                          {waiting > 99 ? "99+" : waiting}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}
