import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

const STORAGE_KEY = "metascope.selectedAccount";

interface AccountCtxValue {
  /** Compte Meta sélectionné (multi-comptes). null = laisser le backend choisir
   *  le compte par défaut. */
  selectedAccountId: string | null;
  setSelectedAccountId: (id: string | null) => void;
}

const AccountCtx = createContext<AccountCtxValue>({
  selectedAccountId: null,
  setSelectedAccountId: () => {},
});

export const useAccount = () => useContext(AccountCtx);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [selectedAccountId, setSel] = useState<string | null>(
    () => (typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null),
  );
  const setSelectedAccountId = useCallback((id: string | null) => {
    setSel(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);
  return (
    <AccountCtx.Provider value={{ selectedAccountId, setSelectedAccountId }}>
      {children}
    </AccountCtx.Provider>
  );
}
