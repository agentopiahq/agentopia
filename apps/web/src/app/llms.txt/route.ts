import { agentResponse, llmsTxt } from '@/markdown';

export const dynamic = 'force-static';

export const GET = () => agentResponse(llmsTxt(), 'text/plain');
