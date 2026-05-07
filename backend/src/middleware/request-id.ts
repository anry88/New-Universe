import { v4 as uuidv4 } from 'uuid';
import { FastifyRequest } from 'fastify';

export function generateRequestId(_req: FastifyRequest) {
  return uuidv4();
}
