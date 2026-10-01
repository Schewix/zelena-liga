import { logger } from '../../logger.js';

export function respond(res: any, status: number, message: string, detail?: string) {
  if (status >= 500) {
    logger.error('[api/admin/event-state]', message, detail ? { detail } : {});
  }
  return res.status(status).json(detail ? { error: message, detail } : { error: message });
}
