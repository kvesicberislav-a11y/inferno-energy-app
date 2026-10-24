const ZONA = "Europe/Zagreb";

const formatDatuma = new Intl.DateTimeFormat("hr-HR", {
  timeZone: ZONA,
  day: "numeric",
  month: "numeric",
  year: "numeric",
});

/** "2026-10-24T10:00:00Z" -> "24. 10. 2026." (po zagrebačkom vremenu) */
export function formatDatum(iso: string) {
  return formatDatuma.format(new Date(iso));
}
