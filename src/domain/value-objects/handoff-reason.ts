// RN-22: why the bot paused a conversation for a human. US-17 and US-18 add
// the blocked client and the late cancellation.
export const HANDOFF_REASONS = ['requested', 'not_understood'] as const;

export type HandoffReason = (typeof HANDOFF_REASONS)[number];
