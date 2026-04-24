// Mock for cloudflare:workers module used in vitest environment.
// Provides a minimal DurableObject base class so proximity-room.js can be imported.

export class DurableObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}
