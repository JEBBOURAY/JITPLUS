import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import type { TeamMember } from '@/types';
import { queryKeys, STALE } from './keys';

export function useTeamMembers(enabled = true) {
  return useQuery<TeamMember[]>({
    queryKey: queryKeys.teamMembers,
    queryFn: async () => {
      const res = await api.get('/merchant/team');
      return res.data;
    },
    staleTime: STALE.MEDIUM,
    enabled,
  });
}

export function useCreateTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { nom: string; email: string; password: string }) => {
      const res = await api.post('/merchant/team', payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.teamMembers }),
  });
}

export function useUpdateTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, string | boolean> }) => {
      const res = await api.patch(`/merchant/team/${id}`, payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.teamMembers }),
  });
}

export function useDeleteTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/merchant/team/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.teamMembers }),
  });
}
