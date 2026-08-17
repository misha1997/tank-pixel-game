import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@tank/shared';

export const socket = io() as unknown as Socket<ServerToClientEvents, ClientToServerEvents>;
