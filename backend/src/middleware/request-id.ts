import { v4 as uuidv4 } from 'uuid';
import { IncomingMessage } from 'http';

export function generateRequestId(_req: IncomingMessage) {
  return uuidv4();
}
