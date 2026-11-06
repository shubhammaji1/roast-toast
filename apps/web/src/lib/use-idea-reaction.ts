"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { send } from "./api";
import { useApp } from "../components/providers";

type Change = { kind: "interest" | "bookmark" | "follow"; active: boolean };
function patch(data: any, id: string, change: Change): any {
  if (!data || typeof data !== "object") return data;
  if (data.id === id && data.authorId && data.title) {
    const field =
      change.kind === "interest"
        ? "interested"
        : change.kind === "bookmark"
          ? "saved"
          : "following";
    return {
      ...data,
      [field]: change.active,
      ...(change.kind === "interest"
        ? {
            interests: Math.max(
              0,
              data.interests +
                (change.active ? 1 : 0) -
                (data.interested ? 1 : 0),
            ),
          }
        : {}),
    };
  }
  if (data.pages)
    return { ...data, pages: data.pages.map((p: any) => patch(p, id, change)) };
  if (data.ideas)
    return { ...data, ideas: data.ideas.map((i: any) => patch(i, id, change)) };
  if (data.idea) return { ...data, idea: patch(data.idea, id, change) };
  return data;
}
export function useIdeaReaction(id: string) {
  const client = useQueryClient();
  const { toast } = useApp();
  const filter = {
    predicate: (q: { queryKey: readonly unknown[] }) =>
      ["ideas", "idea", "profile"].includes(String(q.queryKey[0])),
  };
  return useMutation({
    mutationFn: (change: Change) => send(`/ideas/${id}/reactions`, change),
    onMutate: async (change) => {
      await client.cancelQueries(filter);
      const previous = client.getQueriesData(filter);
      for (const [key, data] of previous)
        client.setQueryData(key, patch(data, id, change));
      return previous;
    },
    onError: (error, _change, previous) => {
      for (const [key, data] of previous || []) client.setQueryData(key, data);
      toast(error.message);
    },
    onSettled: () => client.invalidateQueries(filter),
  });
}
