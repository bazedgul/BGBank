export class Money {
  private constructor(
    readonly minor: bigint,
    readonly currency: string,
  ) {}

  static of(minor: bigint, currency: string): Money {
    const normalized = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalized)) throw new Error('invalid currency');
    if (minor < 0n) throw new Error('amount must not be negative');
    return new Money(minor, normalized);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    if (other.minor > this.minor) throw new Error('insufficient funds');
    return new Money(this.minor - other.minor, this.currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minor + other.minor, this.currency);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) throw new Error('currency mismatch');
  }
}
