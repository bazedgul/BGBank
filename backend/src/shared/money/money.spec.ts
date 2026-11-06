import { Money } from './money';

describe('Money', () => {
  it('uses integer minor units and rejects unsafe operations', () => {
    expect(Money.of(100n, 'usd').subtract(Money.of(25n, 'USD')).minor).toBe(
      75n,
    );
    expect(() => Money.of(1n, 'USD').subtract(Money.of(2n, 'USD'))).toThrow(
      'insufficient funds',
    );
    expect(() => Money.of(1n, 'USD').add(Money.of(1n, 'EUR'))).toThrow(
      'currency mismatch',
    );
  });
});
