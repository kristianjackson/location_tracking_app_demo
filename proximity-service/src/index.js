// Worker entry point for the proximity service.
// Full implementation in task 2.9.

export { ProximityRoom } from './proximity-room.js';

export default {
  async fetch(request, env) {
    // TODO: Implement CORS, WebSocket upgrade, and Durable Object routing (task 2.9)
    return new Response('Proximity Service', { status: 200 });
  },
};
