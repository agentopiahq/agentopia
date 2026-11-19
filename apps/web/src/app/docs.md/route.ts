import { markdownResponse } from '@/markdown';

export const dynamic = 'force-static';

export const GET = () => markdownResponse('/docs');
