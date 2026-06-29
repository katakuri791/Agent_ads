import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getUrlParam, onUrlChange, setUrlParams } from "../lib/url";

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

/** Source du compte sélectionné au boot : le param d'URL `account` prime (lien
 *  partagé / reload sur une URL profonde), sinon le dernier choix persisté. */
function initialAccount(): string | null {
  if (typeof window === "undefined") return null;
  return getUrlParam("account") || localStorage.getItem(STORAGE_KEY);
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [selectedAccountId, setSel] = useState<string | null>(initialAccount);

  // Si l'URL portait un compte au boot mais pas le localStorage, on aligne le
  // localStorage et l'URL pour cohérence (sans créer d'entrée d'historique au-delà).
  useEffect(() => {
    if (selectedAccountId) {
      localStorage.setItem(STORAGE_KEY, selectedAccountId);
      setUrlParams({ account: selectedAccountId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSelectedAccountId = useCallback((id: string | null) => {
    setSel(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
    setUrlParams({ account: id });
  }, []);

  // Boutons précédent/suivant du navigateur → resync depuis l'URL.
  useEffect(() => onUrlChange(() => setSel(getUrlParam("account"))), []);

  return (
    <AccountCtx.Provider value={{ selectedAccountId, setSelectedAccountId }}>
      {children}
    </AccountCtx.Provider>
  );
}
