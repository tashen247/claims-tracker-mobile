import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClaimStatus, UpdateClaimStatusRequest } from '@claims/shared';
import { api } from './index';

export const queryKeys = {
  policies: ['policies'] as const,
  claims: (status?: ClaimStatus) => ['claims', 'list', status ?? 'all'] as const,
  claim: (id: string) => ['claims', 'detail', id] as const,
};

export function usePolicies() {
  return useQuery({ queryKey: queryKeys.policies, queryFn: () => api.listPolicies() });
}

export function useClaims(status?: ClaimStatus) {
  return useInfiniteQuery({
    queryKey: queryKeys.claims(status),
    queryFn: ({ pageParam }) => api.listClaims({ status, pageToken: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextPageToken ?? undefined,
  });
}

export function useClaim(id: string) {
  return useQuery({ queryKey: queryKeys.claim(id), queryFn: () => api.getClaim(id) });
}

export function useUpdateClaimStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateClaimStatusRequest) => api.updateClaimStatus(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['claims'] });
    },
  });
}
