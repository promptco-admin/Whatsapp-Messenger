"use client";

import { useEffect, useState } from "react";

export type CurrentUser = {
  id: number;
  email: string;
  name: string;
  role: "admin" | "agent";
  active: number;
  phone_masking: number;
  created_at: string;
};

export function useCurrentUser(): { user: CurrentUser | null; loading: boolean; refresh: () => void } {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  function refresh() {
    setLoading(true);
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setUser(j.user || null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  return { user, loading, refresh };
}
