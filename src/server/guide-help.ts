import { GUIDE_HELP, GUIDE_TOPICS } from '../shared/world-guide.ts';
import type { GuideTopic } from '../shared/world-guide.ts';
import { RequestError } from './errors.ts';

export interface GuideReply { mode: 'fixed-help' | 'ai'; answer: string }
export type GuideResponder = (question: string, knowledge: string) => Promise<string>;
/** No credentials, player data, storage or network implementation in this boundary.
 * A future provider adapter requires explicit configuration and separate approval. */
export function createGuideHelp(options: { enabled?: boolean; respond?: GuideResponder } = {}) {
  return {
    status: { aiEnabled: options.enabled === true && !!options.respond },
    async reply(body: Record<string, unknown>): Promise<GuideReply> {
      if (Object.keys(body).some(k => !['topic', 'language', 'question'].includes(k)) || !GUIDE_TOPICS.includes(body.topic as GuideTopic)) throw new RequestError(400, 'Choose a guide topic.');
      const language = body.language === 'zh' ? 'zh' : 'en', answer = GUIDE_HELP[body.topic as GuideTopic][language];
      if (body.question === undefined) return { mode: 'fixed-help', answer };
      if (typeof body.question !== 'string' || body.question.trim().length < 1 || body.question.length > 500) throw new RequestError(400, 'Use a question between 1 and 500 characters.');
      if (!options.enabled || !options.respond) throw new RequestError(503, 'AI conversation is not enabled. Fixed help is available.');
      const text = await options.respond(body.question.trim(), Object.values(GUIDE_HELP).map(x => x[language]).join('\n'));
      return { mode: 'ai', answer: text.slice(0, 1600) };
    },
  };
}
