/** The three ways a command fails, each with its exit code: 1 usage, 2 the server rejected the call, 3 unreachable. */
export class UsageError extends Error {
  readonly exitCode = 1;
}

export class Rejected extends Error {
  readonly exitCode = 2;
}

export class Unreachable extends Error {
  readonly exitCode = 3;
  constructor(readonly url: string) {
    super(`satchel: Satchel isn't reachable at ${url}. Tell the owner and carry on without it.`);
  }
}
