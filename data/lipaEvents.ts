/**
 * Real, dated weather events at or near Lipa (2024–2025), used ONLY to check model output (never as input).
 * Each entry names the source that was opened (2026-11-15) and how directly it applies to the Lipa AOI / Plot A.
 * Not an exhaustive list: an alarm outside these windows is "not matched", not necessarily false.
 */
export interface RealEvent {
  id: string;
  kind: "dry" | "wet";
  start: string;
  end: string;
  what: string;
  sources: string[];
  applies: "plot" | "province" | "region";
}

export const LIPA_REAL_EVENTS: RealEvent[] = [
  {
    id: "elnino-2024-dry",
    kind: "dry",
    start: "2024-02-01",
    end: "2024-03-31",
    what: "El Niño drought: soil dried fast, corn weakened, low yield (farmer); agricultural damage in Calabarzon incl. Batangas, corn among damaged crops",
    sources: [
      "Farmer interview, Mang Edgar, Plot A, question 9 (DATA-MANIFEST.md section 9)",
      "https://philstar.com/nation/2024/03/19/2341621/el-nio-agriculture-damage-8-regions-hits-p175-billion",
    ],
    applies: "plot",
  },
  {
    id: "carina-habagat-2024-07",
    kind: "wet",
    start: "2024-07-22",
    end: "2024-07-25",
    what: "Typhoon Carina (Gaemi) with the enhanced southwest monsoon: heavy rain over Luzon; Batangas placed under a state of calamity",
    sources: ["https://en.wikipedia.org/wiki/Typhoon_Gaemi"],
    applies: "province",
  },
  {
    id: "kristine-2024-10",
    kind: "wet",
    start: "2024-10-22",
    end: "2024-10-25",
    what: "Severe Tropical Storm Kristine (Trami): Calabarzon daily rain above 300 mm on 22–24 Oct; Batangas 391.3 mm on 24–25 Oct, flooding",
    sources: ["https://en.wikipedia.org/wiki/Tropical_Storm_Trami_(2024)"],
    applies: "province",
  },
];
