/** Buffer circular simples com cap fixo — descarta do início ao ultrapassar. */
export class RingBuffer<T> {
  private items: T[] = [];

  constructor(private readonly cap: number) {}

  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.cap) {
      this.items.splice(0, this.items.length - this.cap);
    }
  }

  toArray(): T[] {
    return [...this.items];
  }

  get size(): number {
    return this.items.length;
  }
}
