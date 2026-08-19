export const ISSUE_CATEGORIES = new Set([
  'toilet',
  'hygiene',
  'power',
  'water',
  'air_conditioning',
  'building',
  'other'
]);

export const ISSUE_SEVERITIES = new Set(['normal', 'caution', 'urgent']);

export function evaluateIssueStatus(severities, initialStatus) {
  if (severities.includes('urgent')) return 'red';
  if (severities.includes('caution')) return 'yellow';
  return initialStatus;
}
