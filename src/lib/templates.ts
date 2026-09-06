export type TemplateSectionSpec = {
  code: string;
  title: string;
  minutes: number;
  questions: number;
  score: number;
  trials?: number;
  types?: Record<string, number>;
  passages?: { groups: number; questionsPerGroup: number; standalone: number };
  note?: string;
};

export type ChoiceRules = {
  sectionCode: string;
  mode: "SELECT_ONE_BRANCH";
  branches: { id: string; label: string; pickCount?: number; subjects: string[] }[];
} | null;

export function parseSectionsSpec(json: string): TemplateSectionSpec[] {
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

export function parseChoiceRules(json: string | null): ChoiceRules {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export const GRACE_SECONDS = 15; // ân hạn mạng cho autosave sau deadline
