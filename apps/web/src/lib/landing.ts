export type LandingProgramGroupId =
  "software" | "systems" | "information" | "interdisciplinary";

export type LandingProgramGroup = {
  id: LandingProgramGroupId;
  programs: [string, string, string | null];
};

const groupPrograms: Record<LandingProgramGroupId, readonly string[]> = {
  software: [
    "Softversko inženjerstvo i informacione tehnologije",
    "Primenjeno softversko inženjerstvo",
    "Računarstvo i automatika (E2)",
  ],
  systems: [
    "Energetika, elektronika i telekomunikacije (E1)",
    "Merenje i regulacija",
    "Mehatronika",
  ],
  information: [
    "Inženjerstvo informacionih sistema",
    "Informacioni inženjering",
  ],
  interdisciplinary: ["Biomedicinsko inženjerstvo", "Animacija u inženjerstvu"],
};

const groupOrder = Object.keys(groupPrograms) as LandingProgramGroupId[];

export function buildLandingProgramGroups(
  programs: readonly string[],
): LandingProgramGroup[] {
  const expected = groupOrder.flatMap((id) => groupPrograms[id]);
  const actual = new Set(programs);
  if (
    actual.size !== programs.length ||
    expected.length !== programs.length ||
    expected.some((program) => !actual.has(program))
  ) {
    throw new Error(
      "FTN P1 program groups must be reviewed after catalog drift",
    );
  }

  return groupOrder.map((id) => {
    const [first, second, third = null] = groupPrograms[id];
    return { id, programs: [first, second, third] };
  });
}
