import { transition } from './transfer-state';

describe('transfer state machine', () => {
  it('allows only the immediate atomic path', () => {
    expect(transition('created', 'posted')).toBe('posted');
    expect(transition('posted', 'completed')).toBe('completed');
    expect(() => transition('created', 'completed')).toThrow();
    expect(() => transition('completed', 'rejected')).toThrow();
  });
});
