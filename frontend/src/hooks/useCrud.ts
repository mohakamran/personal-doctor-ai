import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useToast } from "@/contexts/ToastContext";

/** Mutation helper: invalidates related queries and shows a toast on success/failure. */
export function useAppMutation<TVars, TResult>(
  fn: (v: TVars) => Promise<TResult>,
  opts: { invalidate?: QueryKey[]; success?: string; onSuccess?: (r: TResult, v: TVars) => void } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      for (const k of opts.invalidate ?? []) qc.invalidateQueries({ queryKey: k });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      if (opts.success) toast.success(opts.success);
      opts.onSuccess?.(r, v);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
