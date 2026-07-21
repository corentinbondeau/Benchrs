"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";

interface Child {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  shirt_number: number | null;
  position: string | null;
}

interface ParentChildContextType {
  children: Child[];
  selectedChild: Child | null;
  selectedChildId: string | null;
  setSelectedChildId: (id: string) => void;
  loading: boolean;
  isParent: boolean;
}

const ParentChildContext = createContext<ParentChildContextType>({
  children: [],
  selectedChild: null,
  selectedChildId: null,
  setSelectedChildId: () => {},
  loading: false,
  isParent: false,
});

export function useParentChild() {
  return useContext(ParentChildContext);
}

export function ParentChildProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const isParent = session?.user?.role === "parent";
  const [childList, setChildList] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isParent) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/parent-student");
        if (res.ok && !cancelled) {
          const data = await res.json();
          const extracted: Child[] = data.map((link: { student: Child }) => link.student).filter(Boolean);
          setChildList(extracted);
          if (extracted.length > 0) {
            const stored = typeof window !== "undefined" ? localStorage.getItem("selectedChildId") : null;
            const match = stored && extracted.find((c) => c.id === stored);
            setSelectedChildId(match ? match.id : extracted[0].id);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [isParent]);

  const handleSetSelectedChildId = useCallback((id: string) => {
    setSelectedChildId(id);
    localStorage.setItem("selectedChildId", id);
  }, []);

  const selectedChild = childList.find((c) => c.id === selectedChildId) || null;

  return (
    <ParentChildContext.Provider
      value={{
        children: childList,
        selectedChild,
        selectedChildId,
        setSelectedChildId: handleSetSelectedChildId,
        loading,
        isParent,
      }}
    >
      {children}
    </ParentChildContext.Provider>
  );
}
