export const transferStates = [
  'created',
  'posted',
  'completed',
  'rejected',
] as const;
export type TransferState = (typeof transferStates)[number];

const transitions: Record<TransferState, readonly TransferState[]> = {
  created: ['posted', 'rejected'],
  posted: ['completed', 'rejected'],
  completed: [],
  rejected: [],
};

export function canTransition(from: TransferState, to: TransferState): boolean {
  return transitions[from].includes(to);
}

export function transition(
  from: TransferState,
  to: TransferState,
): TransferState {
  if (!canTransition(from, to)) {
    throw new Error(`invalid transfer transition: ${from} -> ${to}`);
  }
  return to;
}
