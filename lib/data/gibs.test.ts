import { describe, expect, it } from "vitest";
import { latestDateFromDomain, smapTileUrl } from "./gibs";

describe("NASA GIBS SMAP layer", () => {
  it("reads the latest date from a domain with gaps", () => {
    // shape of a real response, 2026-11-15
    const xml = "<Domains><DimensionDomain><ows:Identifier>time</ows:Identifier><Domain>2026-10-25/2026-11-06/P1D,2026-11-08/2026-11-10/P1D</Domain></DimensionDomain></Domains>";
    expect(latestDateFromDomain(xml)).toBe("2026-11-10");
  });

  it("handles single dates and timestamps", () => {
    expect(latestDateFromDomain("<Domain>2026-11-01,2026-11-03T12:00:00Z</Domain>")).toBe("2026-11-03");
  });

  it("returns null when nothing is listed", () => {
    expect(latestDateFromDomain("<Domain></Domain>")).toBeNull();
    expect(latestDateFromDomain("<Error/>")).toBeNull();
  });

  it("puts the date in the tile path", () => {
    expect(smapTileUrl("2026-11-10")).toContain("/default/2026-11-10/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png");
  });
});
