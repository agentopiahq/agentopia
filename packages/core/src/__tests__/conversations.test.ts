import { seededRng } from '../clock';
import { CONVERSATIONS, lineMs, lineStarts, pickConversation } from '../conversations';

describe('conversations', () => {
  it('has plenty to talk about', () => {
    expect(CONVERSATIONS.length).toBeGreaterThanOrEqual(80);
  });

  it.each(CONVERSATIONS.map((lines) => [lines[0], lines]))(
    '"%s" runs two to five rounds of bubble-sized lines',
    (_opening, lines) => {
      expect(lines.length).toBeGreaterThanOrEqual(3);
      expect(lines.length).toBeLessThanOrEqual(10);
      for (const line of lines) {
        expect(line.trim()).toBe(line);
        expect(line.length).toBeGreaterThan(0);
        expect(line.length).toBeLessThanOrEqual(50);
      }
    }
  );

  it('never opens two conversations the same way', () => {
    const openings = CONVERSATIONS.map((lines) => lines[0]);
    expect(new Set(openings).size).toBe(openings.length);
  });

  it('picks only conversations not heard lately, while there are any', () => {
    const heard = new Set(CONVERSATIONS.slice(1).map((lines) => lines[0]));
    const rng = seededRng(3);
    for (let i = 0; i < 20; i++) {
      expect(pickConversation(rng, (o) => heard.has(o))).toBe(CONVERSATIONS[0]);
    }
    const all = new Set(CONVERSATIONS.map((lines) => lines[0]));
    expect(pickConversation(rng, (o) => all.has(o))).toBeDefined();
  });

  it('holds a longer line up longer, within reason', () => {
    expect(lineMs('ha')).toBeLessThan(lineMs('a line long enough to need a moment to read'));
    expect(lineMs('x'.repeat(200))).toBeLessThanOrEqual(4200);
    expect(lineStarts(['a', 'bb'])).toEqual([0, lineMs('a'), lineMs('a') + lineMs('bb')]);
  });
});
