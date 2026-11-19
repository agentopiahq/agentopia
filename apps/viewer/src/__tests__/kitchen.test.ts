import { Facing, Iso, V3 } from '../kit/iso';
import { MAT } from '../kit/palette';
import { drinksFridge, kitchenCounter } from '../objects/kitchen';

/** A canvas that keeps what is set on it, takes every call and draws nothing. */
function nullCanvas(): CanvasRenderingContext2D {
  const props: Record<string | symbol, unknown> = { globalAlpha: 1, lineWidth: 1 };
  const call = (): unknown => canvas;
  const canvas: CanvasRenderingContext2D = new Proxy(call, {
    get: (_target, key) => (key in props ? props[key] : canvas),
    set: (_target, key, value) => {
      props[key] = value;
      return true;
    },
    apply: () => canvas,
  }) as unknown as CanvasRenderingContext2D;
  return canvas;
}

/** A pen that logs, in draw order, the calls `tag` names; the rest go through. */
function logged(
  facing: Facing,
  tag: (method: string, args: unknown[]) => string | null
): { k: Iso; log: string[] } {
  const k = new Iso(nullCanvas(), { unit: 32 }).place([0, 0, 0], facing);
  const log: string[] = [];
  // Lettering needs a real canvas transform; what it says is beside the point here.
  k.text = () => undefined;
  for (const method of ['box', 'fill', 'cylinder'] as const) {
    const draw = k[method].bind(k) as (...args: unknown[]) => void;
    (k as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
      const name = tag(method, args);
      if (name) {
        log.push(name);
      }
      draw(...args);
    };
  }
  return { k, log };
}

describe('the drinks fridge', () => {
  it.each<Facing>(['+y', '+x', '-x', '-y'])(
    'draws its plinth before the cabinet, and the open door in front from the front, facing %s',
    (facing) => {
      const { k, log } = logged(facing, (method, args) => {
        if (method === 'box') {
          const [lo, hi] = args as [V3, V3];
          return hi[2] === 0.04 && lo[2] === 0 ? 'plinth' : lo[2] === 0.04 ? 'cabinet' : null;
        }
        return method === 'fill' && args[1] === MAT.glass.l && args[2] === 0.3 ? 'door' : null;
      });
      drinksFridge.draw(k, { open: 1 });
      const order = log.filter((name, i) => log.indexOf(name) === i);
      expect(order.indexOf('plinth')).toBeLessThan(order.indexOf('cabinet'));
      const front = k.facing([0, 1, 0]);
      expect(order.indexOf('door') > order.indexOf('cabinet')).toBe(front);
    }
  );
});

describe('the kitchen counter', () => {
  it('draws the tap in front of the splashback', () => {
    const { k, log } = logged('+y', (method, args) => {
      if (method === 'fill' && args[1] === '#f3f1ec') {
        return 'splashback';
      }
      return method === 'cylinder' && args[0] === -0.6 ? 'tap' : null;
    });
    kitchenCounter.draw(k);
    expect(log.indexOf('splashback')).toBeGreaterThanOrEqual(0);
    expect(log.indexOf('splashback')).toBeLessThan(log.indexOf('tap'));
  });
});
