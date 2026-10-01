// RN-22: why the bot paused a conversation for a human.
export const HANDOFF_REASONS = [
  'requested',
  'not_understood',
  'blocked_client',
  'late_cancellation',
] as const;

export type HandoffReason = (typeof HANDOFF_REASONS)[number];
