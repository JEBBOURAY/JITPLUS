import { router, type Href } from 'expo-router';

/**
 * Replaces the whole root history with `href`. A plain `router.replace` only
 * swaps the top screen, so login / register / previous private screens stayed
 * underneath and the back button (or swipe) brought them back.
 */
export function resetTo(href: Href): void {
  if (router.canDismiss()) router.dismissAll();
  router.replace(href);
}

/**
 * Back to the existing tabs when they are under the current screen, otherwise
 * opens them as the only screen (never a second set of tabs on top).
 */
export function backToTabs(href: Href = '/(tabs)'): void {
  if (router.canDismiss()) router.dismissTo(href);
  else router.replace(href);
}

/**
 * Opens a route from a notification / inbox tap. Tab routes go back to the
 * existing tabs instead of pushing a second set of tabs on top of the stack.
 */
export function openRoute(href: Href): void {
  if (typeof href === 'string' && href.startsWith('/(tabs)')) backToTabs(href);
  else router.push(href);
}
