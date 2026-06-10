import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type MetaAccount } from "../lib/api";
import { qk } from "../lib/queryKeys";

export type AccountPatch = Partial<{
  label: string;
  meta_access_token: string;
  meta_ad_account_id: string;
  meta_page_id: string;
  meta_pixel_id: string;
  preferred_currency: string;
  timezone: string;
  is_default: boolean;
}>;

/** Liste des clés Meta connectées de l'utilisateur. */
export function useMetaAccounts() {
  return useQuery<MetaAccount[]>({ queryKey: qk.accounts, queryFn: () => api.listAccounts() });
}

/** Mutations CRUD sur les comptes Meta — invalident la liste à chaque succès. */
export function useAccountMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.accounts });
  const create = useMutation({ mutationFn: (body: AccountPatch) => api.createAccount(body), onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: AccountPatch }) => api.updateAccount(id, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteAccount(id), onSuccess: invalidate });
  return { create, update, remove };
}
