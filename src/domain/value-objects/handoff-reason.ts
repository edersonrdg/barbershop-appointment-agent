// RN-22: why the bot paused a conversation for a human. US-18 adds the late
// cancellation.
export const HANDOFF_REASONS = [
  'requested',
  'not_understood',
  'blocked_client',
] as const;

export type HandoffReason = (typeof HANDOFF_REASONS)[number];
