import type { Priorities, RotationPlan, RotationSettings } from "@/types";

export const DEFAULT_PLANS: RotationPlan[] = [
  { id: "plan-a", name: "Rotation A", crops: ["corn", "corn", "corn"], colorSlot: 0, compare: true },
  { id: "plan-b", name: "Rotation B", crops: ["corn", "mungbean", "corn"], colorSlot: 1, compare: true },
  { id: "plan-c", name: "Rotation C", crops: ["corn", "peanut", "sweetpotato"], colorSlot: 2, compare: true },
];

export const DEFAULT_SETTINGS: RotationSettings = { seasonsPerYear: 2, startMonth: 5 };

export const DEFAULT_PRIORITIES: Priorities = { water: 3, diversity: 3, cover: 3, climate: 3, nutrients: 3 };

export const MAX_PLANS = 4;
export const MAX_SEASONS = 8;
