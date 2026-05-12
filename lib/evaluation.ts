export type EvaluationCriterion = {
  name: string;
  passed: boolean;
  note?: string;
};

export type Evaluation = {
  success: boolean;
  summary: string;
  criteria: EvaluationCriterion[];
};

const FENCED_BLOCK = /```(evaluation|json)\s*\n([\s\S]*?)\n```\s*$/i;

export function parseEvaluation(
  resultText: string | undefined,
): { evaluation: Evaluation | null; cleanedText: string } {
  if (!resultText) return { evaluation: null, cleanedText: "" };

  const match = resultText.match(FENCED_BLOCK);
  if (!match) return { evaluation: null, cleanedText: resultText };

  try {
    const parsed = JSON.parse(match[2]) as unknown;
    const evaluation = coerceEvaluation(parsed);
    if (!evaluation) return { evaluation: null, cleanedText: resultText };
    const cleanedText = resultText.slice(0, match.index).trimEnd();
    return { evaluation, cleanedText };
  } catch {
    return { evaluation: null, cleanedText: resultText };
  }
}

function coerceEvaluation(value: unknown): Evaluation | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.success !== "boolean") return null;
  if (typeof obj.summary !== "string") return null;
  if (!Array.isArray(obj.criteria)) return null;

  const criteria: EvaluationCriterion[] = [];
  for (const raw of obj.criteria) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    if (typeof c.name !== "string" || typeof c.passed !== "boolean") continue;
    criteria.push({
      name: c.name,
      passed: c.passed,
      note: typeof c.note === "string" ? c.note : undefined,
    });
  }

  return { success: obj.success, summary: obj.summary, criteria };
}
