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
