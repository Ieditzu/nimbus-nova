import { NovaError } from "../api/client";

export function errorMessage(error: unknown): string {
  if (error instanceof NovaError) return error.message;
  if (error instanceof SyntaxError) return "Răspuns neașteptat de la server.";
  return "API oprit";
}
