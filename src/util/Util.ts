/**
 * Makes an error from a plain object.
 * @param obj The error object.
 */
export function makeError(obj: ErrorObject): Error {
  const err = new Error();
  err.stack = obj.stack;
  err.message = obj.message;
  return err;
}

export interface ErrorObject {
  stack: string;
  message: string;
  name: string;
}

/**
 * Chunks an array.
 * @param entries The entries to chunk.
 * @param chunks How many chunks to create.
 */
export function chunk<T>(entries: T[], chunks: number): Array<T[]> {
  const result = [];
  const amount = Math.floor(entries.length / chunks);
  const mod = entries.length % chunks;

  for (let i = 0; i < chunks; i++) {
    result[i] = entries.splice(0, i < mod ? amount + 1 : amount);
  }

  return result;
}
