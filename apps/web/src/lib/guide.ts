import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

const guideDir = path.join(process.cwd(), "..", "..", "content", "guide");

export type Cutoff = {
  year: number;
  budget: number;
  selfFinanced?: number;
};

export type Program = {
  name: string;
  cutoffs: Cutoff[];
};

export type FtnCutoffs = {
  source: string;
  note: string;
  programs: Program[];
};

export async function getFtnCutoffs(): Promise<FtnCutoffs> {
  const raw = await fs.readFile(
    path.join(guideDir, "ftn", "cutoffs.yaml"),
    "utf8",
  );
  return parse(raw) as FtnCutoffs;
}
