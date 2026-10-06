import { describe, it, expect } from 'vitest';
import { StreamBuffer } from '../../src/ws/stream-buffer.js';

describe('StreamBuffer', () => {
  it('stores and retrieves events', () => {
    const buf = new StreamBuffer(5);
    buf.push({ idx: 0 }); buf.push({ idx: 1 }); buf.push({ idx: 2 });
    expect(buf.getSince(0)).toHaveLength(3);
    expect(buf.getSince(1)).toHaveLength(2);
  });

  it('wraps around when full (ring buffer)', () => {
    const buf = new StreamBuffer(3);
    buf.push({ idx: 0 }); buf.push({ idx: 1 }); buf.push({ idx: 2 });
    buf.push({ idx: 3 });
    const events = buf.getAll();
    expect(events).toHaveLength(3);
    expect(events[0].idx).toBe(1);
    expect(events[2].idx).toBe(3);
  });

  it('getSince returns empty for future index', () => {
    const buf = new StreamBuffer(10);
    buf.push({ idx: 0 });
    expect(buf.getSince(999)).toHaveLength(0);
  });

  it('tracks global index across wraps', () => {
    const buf = new StreamBuffer(2);
    buf.push({ a: 1 }); buf.push({ a: 2 }); buf.push({ a: 3 });
    expect(buf.currentIndex).toBe(3);
    expect(buf.getSince(1)).toHaveLength(2);
  });
});
