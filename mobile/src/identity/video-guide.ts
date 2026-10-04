export function videoGuide(elapsed: number) {
  if (elapsed < 2) return { text: "Privește drept spre cameră", icon: "person-outline" as const };
  if (elapsed < 4) return { text: "Întoarce ușor capul la stânga", icon: "arrow-back-outline" as const };
  if (elapsed < 6) return { text: "Întoarce ușor capul la dreapta", icon: "arrow-forward-outline" as const };
  return { text: "Revino cu fața spre cameră", icon: "person-outline" as const };
}
