import type { ReactNode } from "react";
import { QueryProvider } from "./QueryProvider";
import { ToastProvider } from "./ToastProvider";
import { AccountProvider } from "./AccountProvider";
import { FiltersProvider } from "./FiltersProvider";
import { ImageLightboxProvider } from "../components/shared/ImageLightboxModal";

/** Compose tous les providers de l'app dans le bon ordre. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <ToastProvider>
        <AccountProvider>
          <FiltersProvider>
            <ImageLightboxProvider>
              {children}
            </ImageLightboxProvider>
          </FiltersProvider>
        </AccountProvider>
      </ToastProvider>
    </QueryProvider>
  );
}
