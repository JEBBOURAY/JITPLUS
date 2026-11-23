/**
 * Wraps a user-typed value (a name, a label) in Unicode isolate marks before it is
 * put inside a translated sentence. Without them an Arabic name at the start of a
 * French sentence (or a Latin one in an Arabic sentence) sets the direction of the
 * whole paragraph and the sentence renders out of order.
 */
export function isolate(text: string): string {
  return `⁨${text}⁩`;
}
