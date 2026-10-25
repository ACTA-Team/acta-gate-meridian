import type { ApiError } from "@acta-gate/shared";
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message } } satisfies ApiError);
    return;
  }
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    res.status(400).json({ error: { code: "BadRequest", message } } satisfies ApiError);
    return;
  }
  console.error(err);
  const message = err instanceof Error ? err.message : "Unexpected error";
  res.status(500).json({ error: { code: "Internal", message } } satisfies ApiError);
};
