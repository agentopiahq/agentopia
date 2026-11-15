import {
  COPYRIGHT_HOLDER,
  GITHUB_URL,
  SITE_URL,
  copyrightLine,
  creditLinks,
} from '../credits/credits';
import { COMPANY_LOGOS } from '../credits/logos';

describe('creditLinks', () => {
  it.each([
    ['the website itself', '', ['/terms', '/privacy'], false],
    ['the local viewer', SITE_URL, [`${SITE_URL}/terms`, `${SITE_URL}/privacy`], true],
  ])('points the legal links at %s', (_, site, legal, external) => {
    const links = creditLinks(site);
    expect(links.map((link) => link.href)).toEqual([GITHUB_URL, ...legal]);
    expect(links[0].external).toBe(true);
    expect(links.slice(1).every((link) => link.external === external)).toBe(true);
  });
});

describe('copyrightLine', () => {
  it('names the year and the holder', () => {
    expect(copyrightLine(2026)).toBe(`© 2026 ${COPYRIGHT_HOLDER}. All rights reserved.`);
  });
});

describe('COMPANY_LOGOS', () => {
  it.each(COMPANY_LOGOS.map((logo) => [logo.name, logo]))('%s is a bare inline svg', (_, logo) => {
    expect(logo.svg.startsWith('<svg')).toBe(true);
    expect(logo.svg).not.toMatch(/<\?xml|class=/);
    expect(logo.height).toBeGreaterThan(0);
  });
});
