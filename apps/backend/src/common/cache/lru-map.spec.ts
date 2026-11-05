import { LruMap } from './lru-map';

describe('LruMap', () => {
  it('never grows past its capacity, evicting the least recently used key', () => {
    const m = new LruMap<string, number>(2);
    m.set('a', 1);
    m.set('b', 2);
    m.get('a'); // a is now more recent than b
    m.set('c', 3);
    expect([...m.keys()]).toEqual(['a', 'c']);
    expect(m.size).toBe(2);
  });

  it('updating a key does not evict anything', () => {
    const m = new LruMap<string, number>(2);
    m.set('a', 1);
    m.set('b', 2);
    m.set('a', 10);
    expect(m.get('a')).toBe(10);
    expect(m.size).toBe(2);
  });

  it('rejects an invalid size', () => {
    expect(() => new LruMap(0)).toThrow(RangeError);
  });
});
