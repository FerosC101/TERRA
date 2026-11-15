/**
 * The guided tour of the platform, in order. Each step opens `page` and spotlights the
 * element marked `data-tour="<target>"`. A step without a target (or whose target is not on
 * screen, such as a control hidden at phone width) shows its card in the middle instead.
 */
export type TourStep = {
  page: string;
  target?: string;
  title: string;
  body: string;
  /** Short hint about what to try, shown under the body */
  tip?: string;
};

export const TOUR: TourStep[] = [
  {
    page: "/overview",
    title: "Welcome to TERRA",
    body: "A two-minute walk through the platform, page by page. TERRA watches one field with NASA satellites and an in-field station, notices what changes, and helps you plan what to plant next.",
    tip: "Use the arrow keys to move, or Esc to leave at any time.",
  },
  {
    page: "/overview", target: "field",
    title: "Pick a field",
    body: "Lipa Cropland in Batangas is the main field. Switch fields here and every page follows.",
  },
  {
    page: "/overview", target: "data-status",
    title: "Know what is real",
    body: "This tells you what is live NASA data, what is a NASA snapshot and what is demo data. Every number in TERRA carries a source tag: Sensor, Satellite, Model or Simulation.",
  },
  {
    page: "/overview", target: "attention",
    title: "What needs attention",
    body: "The most important open discovery, what to check next, and how strong the evidence is.",
    tip: "Investigate opens the full step-by-step investigation.",
  },
  {
    page: "/overview", target: "conditions",
    title: "Conditions now",
    body: "Today's key readings with the last 30 days behind each one, and the change over the last two weeks.",
  },
  {
    page: "/overview", target: "station",
    title: "Meet the field station",
    body: "The solar-powered pod that measures the soil where the crop grows, so the satellites can be checked against the ground.",
    tip: "Drag to rotate it, then press Explode view to see inside.",
  },
  {
    page: "/explorer", target: "place-card",
    title: "Your field on the map",
    body: "The field in 3D on real terrain, with the station and soil-moisture beacons. Tap the card for a summary, or a beacon for its reading.",
  },
  {
    page: "/explorer", target: "map-controls",
    title: "Map controls",
    body: "Change the map style, including the live NASA soil-moisture view, switch between 2D and 3D, reset north, zoom, or frame the field again.",
    tip: "Press H to hide all the controls.",
  },
  {
    page: "/explorer", target: "map-key",
    title: "Read the key",
    body: "What each colour and beacon means, and where each layer comes from.",
  },
  {
    page: "/discoveries", target: "discovery-list",
    title: "Discovery Center",
    body: "Patterns that depart from this field's own history. Each one is a question to investigate, not a conclusion.",
    tip: "Open a discovery to see its evidence and the next observation to make.",
  },
  {
    page: "/model", target: "dimensions",
    title: "One field, five parts",
    body: "Water, soil, climate, vegetation and rotation. Choose one to focus the model and its charts.",
  },
  {
    page: "/model", target: "field-scene",
    title: "Watch the field respond",
    body: "The 3D field follows the record: the soil fills with stored water, the crop grows with the season, and rain or sun follows the day.",
    tip: "Press play in the date bar above to run the season.",
  },
  {
    page: "/rotation-lab", target: "rotation-build",
    title: "Build rotations",
    body: "Each row is one plan, read left to right. Tap a crop to change it and use the arrows to reorder seasons.",
  },
  {
    page: "/rotation-lab", target: "rotation-compare",
    title: "Compare the plans",
    body: "Water use, diversity, soil cover, nutrients and heat, side by side. TERRA shows the trade-offs and never declares a winner.",
  },
  {
    page: "/future-earth", target: "scenarios",
    title: "Try a different climate",
    body: "See how the same plans hold up in a hotter, drier or wetter season. These are simulations, not forecasts.",
  },
  {
    page: "/reports", target: "report-sections",
    title: "Share a report",
    body: "Choose the sections to include, then print it or save it as a PDF for your cooperative or adviser.",
  },
  {
    page: "/reports",
    title: "You're ready",
    body: "That's the loop: observe, discover, investigate, understand, experiment, adapt. Start again any time from the Tour button at the top.",
  },
];
