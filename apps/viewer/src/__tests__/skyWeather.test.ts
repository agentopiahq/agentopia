import { WEATHERS, WEATHER_KINDS, WEATHER_MS, weatherAt, weatherOf } from '../sky';
import { SkyWeather, WEATHER_TURN_MS } from '../skyWeather';

const at = 1_763_000_000_000;

/** A moment well inside a spell, away from its eased end. */
const mid = (block: number): number => (block + 0.3) * WEATHER_MS;

describe('SkyWeather', () => {
  it('follows the clock until picked', () => {
    const weather = new SkyWeather();
    expect(weather.picked).toBeNull();
    expect(weather.at(at)).toEqual(weatherAt(at));
  });

  it.each(WEATHER_KINDS)('holds %s once picked and rolled in', (kind) => {
    const weather = new SkyWeather();
    weather.pick(kind, at);
    expect(weather.picked).toBe(kind);
    expect(weather.at(at + WEATHER_TURN_MS)).toEqual({ ...WEATHERS[kind], kind });
  });

  it('holds a pick through the clock’s next spells', () => {
    const block = Math.floor(at / WEATHER_MS);
    const kind = WEATHER_KINDS.find((k) => k !== weatherOf(block + 3)) ?? 'rain';
    const weather = new SkyWeather();
    weather.pick(kind, mid(block));
    expect(weather.at(mid(block + 3)).kind).toBe(kind);
  });

  it('rolls a pick in from what was showing, without a jump', () => {
    const block = 2000;
    const before = weatherOf(block);
    const kind = WEATHER_KINDS.find((k) => WEATHERS[k].fog !== WEATHERS[before].fog) ?? 'fog';
    const weather = new SkyWeather();
    const now = mid(block);
    weather.pick(kind, now);
    expect(weather.at(now).fog).toBeCloseTo(WEATHERS[before].fog);
    const halfway = weather.at(now + WEATHER_TURN_MS / 2).fog;
    expect(halfway).toBeCloseTo((WEATHERS[before].fog + WEATHERS[kind].fog) / 2);
    expect(weather.turning(now + WEATHER_TURN_MS / 2)).toBe(true);
    expect(weather.turning(now + WEATHER_TURN_MS)).toBe(false);
  });

  it('rolls back to the clock’s weather when told to follow it', () => {
    const weather = new SkyWeather();
    weather.pick('rain', at);
    weather.follow(at + 5000);
    expect(weather.picked).toBeNull();
    expect(weather.at(at + 5000).rain).toBeCloseTo(1);
    const settled = at + 5000 + WEATHER_TURN_MS;
    expect(weather.at(settled)).toEqual(weatherAt(settled));
  });

  it('counts only real changes by hand', () => {
    const weather = new SkyWeather();
    weather.follow(at);
    weather.pick('fog', at);
    weather.pick('fog', at + 10);
    weather.follow(at + 20);
    expect(weather.version).toBe(2);
  });
});
