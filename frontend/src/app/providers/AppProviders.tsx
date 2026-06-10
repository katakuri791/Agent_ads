import type { ReactNode } from "react";
import { QueryProvider } from "./QueryProvider";
import { ToastProvider } from "./ToastProvider";
import { AccountProvider } from "./AccountProvider";
import { FiltersProvider } from "./FiltersProvider";

/** Compose tous les providers de l'app dans le bon ordre. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <ToastProvider>
        <AccountProvider>
          <FiltersProvider>{children}</FiltersProvider>
        </AccountProvider>
      </ToastProvider>
    </QueryProvider>
  );
}
