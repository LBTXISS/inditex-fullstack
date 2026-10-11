import { useSyncExternalStore } from 'react';
import { CartStore } from './cartStore.js';

export const cartStore = new CartStore();

/** Suscribe React al único contador confirmado mediante snapshots estables.
 * @returns {{ readonly count: number, readonly sending: boolean }} */
export function useCart() {
  return useSyncExternalStore(cartStore.subscribe, cartStore.getSnapshot, cartStore.getSnapshot);
}
