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

export const ftnExamCodes = ["P1", "P3", "P4", "P5", "P6", "P7", "P8"] as const;
export type FtnExamCode = (typeof ftnExamCodes)[number];
export type FtnExamId = `ftn-${Lowercase<FtnExamCode>}`;

export type FtnExam = {
  id: FtnExamId;
  code: FtnExamCode;
  officialName: string;
  status: "available" | "planned";
  programs: string[];
};

export type FtnFaculty = {
  id: "ftn";
  slug: "ftn";
  name: string;
  university: string;
  city: string;
  officialUrl: string;
  programsUrl: string;
};

export type FtnCatalog = {
  source: string;
  retrievedAt: string;
  faculty: FtnFaculty;
  exams: FtnExam[];
};

export type FtnExamPrograms = {
  examId: "ftn-p1";
  source: string;
  retrievedAt: string;
  programs: string[];
};
