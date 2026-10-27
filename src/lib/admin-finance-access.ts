/** Shared UI boundary only; API roles and SQL/RLS independently enforce reports. */
export const canReadAdminFinance = (role: string | null | undefined): boolean =>
  role === "admin" || role === "super_admin";

export const isAdminFinancePath = (pathname: string): boolean =>
  /^\/admin\/(money|payouts|payments|reports)(\/|$)/.test(pathname) ||
  // The existing detail page bundles operational facts with private ledgers.
  // Managers use the rider board and operational scorecard, not this dossier.
  /^\/admin\/riders\/[0-9a-f-]{36}(\/|$)/i.test(pathname);
