import type { BeliefSummary } from "../../lib/api";

export function isRelatedCompanyThesis(
  company: BeliefSummary,
  macro: BeliefSummary,
): boolean {
  const explicitCompanyTickers = new Set([
    ...macro.companyTickers,
    ...macro.captureMechanisms.map((capture) => capture.companyTicker),
  ]);
  return Boolean(
    company.companyTicker && explicitCompanyTickers.has(company.companyTicker),
  );
}
