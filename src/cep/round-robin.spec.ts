import { RoundRobin } from './round-robin';

describe('RoundRobin', () => {
  it('returns the full list, not a single item, so callers can fall back', () => {
    const rr = new RoundRobin(['a', 'b', 'c']);

    expect(rr.next()).toEqual(['a', 'b', 'c']);
  });

  it('advances the starting element on each call', () => {
    const rr = new RoundRobin(['a', 'b', 'c']);

    expect(rr.next()).toEqual(['a', 'b', 'c']);
    expect(rr.next()).toEqual(['b', 'c', 'a']);
    expect(rr.next()).toEqual(['c', 'a', 'b']);
  });

  it('wraps around to the first element after a full cycle', () => {
    const rr = new RoundRobin(['a', 'b']);

    rr.next();
    rr.next();

    expect(rr.next()).toEqual(['a', 'b']);
  });

  it('keeps the cyclic order of the elements after the starting one', () => {
    const rr = new RoundRobin(['a', 'b', 'c', 'd']);

    rr.next();
    rr.next();

    expect(rr.next()).toEqual(['c', 'd', 'a', 'b']);
  });

  it('is a no-op ordering for a single element', () => {
    const rr = new RoundRobin(['only']);

    expect(rr.next()).toEqual(['only']);
    expect(rr.next()).toEqual(['only']);
  });
});
