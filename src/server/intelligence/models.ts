export const DEFAULT_ANALYSIS_MODEL = "gpt-5.4-mini";
export const DEFAULT_SYNTHESIS_MODEL = "gpt-5.5";
export const DEFAULT_THESIS_EVALUATION_MODEL = "gpt-5.5";

export function getAnalysisModel(): string {
  return process.env.OPENAI_ANALYSIS_MODEL?.trim() || DEFAULT_ANALYSIS_MODEL;
}

export function getSynthesisModel(): string {
  return process.env.OPENAI_SYNTHESIS_MODEL?.trim() || DEFAULT_SYNTHESIS_MODEL;
}

export function getThesisEvaluationModel(): string {
  return (
    process.env.OPENAI_THESIS_EVALUATION_MODEL?.trim() ||
    DEFAULT_THESIS_EVALUATION_MODEL
  );
}
