export class StreamBuffer<T = unknown> {
  private buffer: (T | undefined)[];
  private head = 0;
  private globalIndex = 0;
  private count = 0;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(event: T): number {
    this.buffer[this.head] = event;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
    return this.globalIndex++;
  }

  getSince(fromIndex: number): T[] {
    if (fromIndex >= this.globalIndex) return [];
    const available = Math.min(this.count, this.globalIndex - fromIndex);
    const start = (this.head - available + this.capacity) % this.capacity;
    const result: T[] = [];
    for (let i = 0; i < available; i++) {
      result.push(this.buffer[(start + i) % this.capacity]!);
    }
    return result;
  }

  getAll(): T[] {
    return this.getSince(this.globalIndex - this.count);
  }

  get currentIndex(): number {
    return this.globalIndex;
  }

  get size(): number {
    return this.count;
  }
}
