"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { FIELDS } from "@/data/fields";
import { DEFAULT_PLANS, DEFAULT_PRIORITIES, DEFAULT_SETTINGS } from "@/data/rotations";
import type { Field, FollowUp, Priorities, RotationPlan, RotationSettings } from "@/types";

interface Persisted {
  fieldId: string;
  plans: RotationPlan[];
  settings: RotationSettings;
  priorities: Priorities;
  followUps: FollowUp[];
}

interface Store extends Persisted {
  field: Field;
  fields: Field[];
  setFieldId: (id: string) => void;
  setPlans: (update: (plans: RotationPlan[]) => RotationPlan[]) => void;
  setSettings: (s: RotationSettings) => void;
  setPriorities: (p: Priorities) => void;
  addFollowUp: (f: FollowUp) => void;
  clearFollowUps: (discoveryId: string) => void;
  resetRotations: () => void;
}

const KEY = "terra.state.v1";
const INITIAL: Persisted = {
  fieldId: FIELDS[0].id,
  plans: DEFAULT_PLANS,
  settings: DEFAULT_SETTINGS,
  priorities: DEFAULT_PRIORITIES,
  followUps: [],
};

const Ctx = createContext<Store | null>(null);

/** App-wide working state: the selected field and the user's rotation experiments. */
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(INITIAL);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Persisted>;
        if (saved.fieldId && !FIELDS.some((f) => f.id === saved.fieldId)) delete saved.fieldId;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore after hydration
        setState((s) => ({ ...s, ...saved }));
      }
    } catch {
      /* storage unavailable: keep defaults */
    }
    // A ?field=<id> link opens the app on that field
    const linked = new URLSearchParams(window.location.search).get("field");
    if (linked && FIELDS.some((f) => f.id === linked)) setState((s) => ({ ...s, fieldId: linked }));
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, loaded]);

  const patch = useCallback((p: Partial<Persisted>) => setState((s) => ({ ...s, ...p })), []);

  const value = useMemo<Store>(() => ({
    ...state,
    fields: FIELDS,
    field: FIELDS.find((f) => f.id === state.fieldId) ?? FIELDS[0],
    setFieldId: (fieldId) => patch({ fieldId }),
    setPlans: (update) => setState((s) => ({ ...s, plans: update(s.plans) })),
    setSettings: (settings) => patch({ settings }),
    setPriorities: (priorities) => patch({ priorities }),
    addFollowUp: (f) => setState((s) => ({ ...s, followUps: [...s.followUps, f] })),
    clearFollowUps: (id) => setState((s) => ({ ...s, followUps: s.followUps.filter((f) => f.discoveryId !== id) })),
    resetRotations: () => patch({ plans: DEFAULT_PLANS, settings: DEFAULT_SETTINGS, priorities: DEFAULT_PRIORITIES }),
  }), [state, patch]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
