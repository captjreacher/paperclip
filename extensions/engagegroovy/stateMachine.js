export const ENGAGEGROOVY_STAGES = [
  "NEW",
  "CEO_BRIEFED",
  "RESEARCH_DONE",
  "EDITOR_IN_PROGRESS",
  "DESIGN_DONE",
  "WRITING_DONE",
  "EDITOR_FINAL",
  "READY_FOR_MGRNZ",
  "COMPLETE",
  "BLOCKED",
  "REVIEW_REQUESTED",
];

const TERMINAL_STAGES = new Set(["COMPLETE"]);
const RESUMABLE_STAGES = [
  "CEO_BRIEFED",
  "RESEARCH_DONE",
  "EDITOR_IN_PROGRESS",
  "DESIGN_DONE",
  "WRITING_DONE",
  "EDITOR_FINAL",
  "READY_FOR_MGRNZ",
  "REVIEW_REQUESTED",
];

const ALLOWED_TRANSITIONS = new Map([
  ["NEW", new Set(["CEO_BRIEFED", "BLOCKED", "REVIEW_REQUESTED"])],
  ["CEO_BRIEFED", new Set(["RESEARCH_DONE", "BLOCKED", "REVIEW_REQUESTED"])],
  ["RESEARCH_DONE", new Set(["EDITOR_IN_PROGRESS", "BLOCKED", "REVIEW_REQUESTED"])],
  ["EDITOR_IN_PROGRESS", new Set(["DESIGN_DONE", "WRITING_DONE", "BLOCKED", "REVIEW_REQUESTED"])],
  ["DESIGN_DONE", new Set(["WRITING_DONE", "BLOCKED", "REVIEW_REQUESTED"])],
  ["WRITING_DONE", new Set(["EDITOR_FINAL", "BLOCKED", "REVIEW_REQUESTED"])],
  ["EDITOR_FINAL", new Set(["READY_FOR_MGRNZ", "BLOCKED", "REVIEW_REQUESTED"])],
  ["READY_FOR_MGRNZ", new Set(["COMPLETE", "BLOCKED", "REVIEW_REQUESTED"])],
  ["BLOCKED", new Set(RESUMABLE_STAGES)],
  ["REVIEW_REQUESTED", new Set(["EDITOR_IN_PROGRESS", "DESIGN_DONE", "WRITING_DONE", "EDITOR_FINAL", "READY_FOR_MGRNZ", "BLOCKED"])],
  ["COMPLETE", new Set()],
]);

export function assertValidStage(stage) {
  if (!ENGAGEGROOVY_STAGES.includes(stage)) {
    throw new Error(`Unknown ENGAGEGROOVY stage: ${stage}`);
  }
}

export function canTransition(currentStage, nextStage) {
  assertValidStage(nextStage);
  if (currentStage == null) return true;
  assertValidStage(currentStage);
  if (currentStage === nextStage) return true;
  return ALLOWED_TRANSITIONS.get(currentStage)?.has(nextStage) ?? false;
}

export function assertValidTransition(currentStage, nextStage) {
  if (!canTransition(currentStage, nextStage)) {
    throw new Error(`Invalid ENGAGEGROOVY stage transition: ${currentStage} -> ${nextStage}`);
  }
}

export function isTerminalStage(stage) {
  return TERMINAL_STAGES.has(stage);
}

export function deriveStageFromPaperclipStatus(status) {
  if (status === "blocked") return "BLOCKED";
  if (status === "in_review") return "REVIEW_REQUESTED";
  if (status === "done" || status === "cancelled") return "COMPLETE";
  return null;
}
