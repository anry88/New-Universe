/** Thrown for deterministic client-facing construction failures with structured client-safe details. */
export class BuildingOperationError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'BuildingOperationError';
    this.code = code;
    this.details = details;
  }
}
