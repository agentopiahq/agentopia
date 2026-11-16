import { WEATHERS, WEATHER_KINDS, WEATHER_MS, weatherAt, weatherOf } from '../sky';
import { SkyWeather, WEATHER_TURN_MS } from '../skyWeather';

/** A spell, and moments inside it. */
const block = 2000;
const into = (f: number, b = block): number => (b + f) * WEATHER_MS;
/** A weather that differs from the clock's in `b` and the spell after, on fog. */
const unlike = (b = block): (typeof WEATHER_KINDS)[number] =>
  WEATHER_KINDS.find(
    (k) =>
      WEATHERS[k].fog !== WEATHERS[weatherOf(b)].fog &&
      WEATHERS[k].fog !== WEATHERS[weatherOf(b + 1)].fog
  ) ?? 'fog';

describe('SkyWeather', () => {
  it('follows the clock until picked', () => {
    const weather = new SkyWeather();
    expect(weather.pickedAt(into(0.3))).toBeNull();
    expect(weather.at(into(0.3))).toEqual(weatherAt(into(0.3)));
  });

  it.each(WEATHER_KINDS)('holds %s once picked and rolled in', (kind) => {
    const weather = new SkyWeather();
    weather.pick(kind, into(0.2));
    expect(weather.pickedAt(into(0.2))).toBe(kind);
    expect(weather.at(into(0.2) + WEATHER_TURN_MS)).toEqual({ ...WEATHERS[kind], kind });
  });

  it('holds a pick only for the rest of its spell, then the clock has it again', () => {
    const weather = new SkyWeather();
    weather.pick('snow', into(0.2));
    expect(weather.pickedAt(into(0.6))).toBe('snow');
    expect(weather.leftAt(into(0.6))).toBeCloseTo(0.4 * WEATHER_MS);
    expect(weather.pickedAt(into(1.01))).toBeNull();
    expect(weather.leftAt(into(1.01))).toBeNull();
    expect(weather.at(into(1.3))).toEqual(weatherAt(into(1.3)));
  });

  it('eases a pick into the next spell without a jump', () => {
    const kind = unlike();
    const weather = new SkyWeather();
    weather.pick(kind, into(0.2));
    const end = into(1);
    expect(weather.at(end - 1).fog).toBeCloseTo(weatherAt(end + 1).fog, 2);
    expect(weather.at(into(0.7)).fog).toBeCloseTo(WEATHERS[kind].fog);
  });

  it('gives a pick made late in its spell its full roll-in before easing out', () => {
    const kind = unlike();
    const weather = new SkyWeather();
    const late = into(1) - 5000;
    weather.pick(kind, late);
    expect(weather.at(late + WEATHER_TURN_MS).fog).toBeCloseTo(WEATHERS[kind].fog);
    expect(weather.turning(into(1) - 500)).toBe(true);
    expect(weather.at(into(1) - 1).fog).toBeCloseTo(weatherAt(into(1) + 1).fog, 2);
  });

  it('rolls a pick in from what was showing, without a jump', () => {
    const before = weatherOf(block);
    const kind = unlike();
    const weather = new SkyWeather();
    const now = into(0.3);
    weather.pick(kind, now);
    expect(weather.at(now).fog).toBeCloseTo(WEATHERS[before].fog);
    const halfway = weather.at(now + WEATHER_TURN_MS / 2).fog;
    expect(halfway).toBeCloseTo((WEATHERS[before].fog + WEATHERS[kind].fog) / 2);
    expect(weather.turning(now + WEATHER_TURN_MS / 2)).toBe(true);
    expect(weather.turning(now + WEATHER_TURN_MS)).toBe(false);
  });

  it('rolls back to the clock’s weather when told to follow it', () => {
    const weather = new SkyWeather();
    weather.pick('rain', into(0.2));
    weather.follow(into(0.3));
    expect(weather.pickedAt(into(0.3))).toBeNull();
    expect(weather.at(into(0.3)).rain).toBeCloseTo(1);
    const settled = into(0.3) + WEATHER_TURN_MS;
    expect(weather.at(settled)).toEqual(weatherAt(settled));
  });

  it('counts only real changes by hand', () => {
    const weather = new SkyWeather();
    weather.follow(into(0.1));
    weather.pick('fog', into(0.1));
    weather.pick('fog', into(0.15));
    weather.follow(into(0.2));
    expect(weather.version).toBe(2);
  });
});
