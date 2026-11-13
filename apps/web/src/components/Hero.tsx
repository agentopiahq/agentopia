import Image from 'next/image';

import OfficeScene from '@/components/OfficeScene';
import { DESCRIPTION, TITLE } from '@/constants';
import airbyteLogo from '@/images/logos/airbyte.svg';
import liquidLogo from '@/images/logos/liquid.svg';
import liverampLogo from '@/images/logos/liveramp.svg';
import scaleLogo from '@/images/logos/scale.svg';

const CompanyGroups = [
  { name: 'LiveRamp', logo: liverampLogo, height: 30 },
  { name: 'Scale AI', logo: scaleLogo, height: 20 },
  { name: 'Airbyte', logo: airbyteLogo, height: 48 },
  { name: 'Liquid AI', logo: liquidLogo, height: 28 },
];

export default function Hero() {
  return (
    <section
      id="hero"
      aria-label="Hero"
      className="flex min-h-[80vh] flex-col justify-start px-6 pb-16 pt-2 text-center sm:px-8 sm:pt-4"
    >
      <h1 className="sr-only">{TITLE}</h1>
      <div className="w-full">
        <OfficeScene />
      </div>

      <p className="mx-auto mt-12 max-w-2xl text-xl tracking-tight text-slate-500">{DESCRIPTION}</p>

      <div className="mt-20 sm:mt-24 lg:mb-8">
        <p className="text-xl tracking-tight text-slate-500">Brought to you by folks from</p>
        <ul
          role="list"
          className="mt-8 grid grid-cols-2 gap-x-8 sm:flex sm:items-center sm:justify-center sm:gap-x-5 sm:gap-y-10 xl:flex xl:flex-row xl:gap-x-12 xl:gap-y-0"
        >
          {CompanyGroups.map((company) => (
            <li key={company.name} className="flex items-center justify-center">
              <Image
                src={company.logo}
                style={{ height: company.height * 1.2, width: 'auto' }}
                alt={company.name}
                unoptimized
                loading="lazy"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
