import { agentResponse, llmsFullTxt } from '@/markdown';

export const dynamic = 'force-static';

export const GET = async () => agentResponse(await llmsFullTxt(), 'text/plain');
