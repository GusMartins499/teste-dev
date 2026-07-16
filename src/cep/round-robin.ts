export class RoundRobin<T> {
  private index = 0;

  constructor(private readonly items: readonly T[]) {}

  next(): T[] {
    const start = this.index;
    this.index = (this.index + 1) % this.items.length;
    return [...this.items.slice(start), ...this.items.slice(0, start)];
  }
}
