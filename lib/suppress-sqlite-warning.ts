/**
 * Suppress Node.js SQLite experimental warning.
 * Import this module before importing node:sqlite.
 */
const originalEmit = process.emit;
// @ts-expect-error - runtime patch for warning suppression
process.emit = (event, ...args) => {
  if (
    event === "warning" &&
    typeof args[0] === "object" &&
    args[0] !== null &&
    "name" in args[0] &&
    (args[0] as { name: string }).name === "ExperimentalWarning" &&
    "message" in args[0] &&
    typeof (args[0] as { message: string }).message === "string" &&
    (args[0] as { message: string }).message.includes("SQLite")
  ) {
    return false;
  }
  return originalEmit.apply(process, [event, ...args] as unknown as Parameters<
    typeof process.emit
  >);
};
