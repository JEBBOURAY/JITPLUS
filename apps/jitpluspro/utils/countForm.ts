/**
 * Suffix of a counted string key: `One`, `Few` or `Other`. Darija counts 2 to 10
 * with the plural noun ("3 زبناء") and the singular from 11 ("15 زبون"); French and
 * English give `Few` and `Other` the same text.
 */
export function countForm(count: number): 'One' | 'Few' | 'Other' {
  if (count === 1) return 'One';
  return count >= 2 && count <= 10 ? 'Few' : 'Other';
}
