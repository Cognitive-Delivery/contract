/**
 * The lease rules a schema cannot state: SPEC §6, L1 to L3 (schema set 1.2).
 *
 * Draft-07 JSON Schema validates one field at a time and cannot compare two, so "expires after it
 * was issued" and "is not its own parent" cannot be patterns. They are rules here, run by the
 * conformance runner against every valid lease fixture (which must pass them all) and against the
 * fixtures under `fixtures/invalid-by-rule/` (each of which must fail exactly the rule its
 * `.expect.json` names). An implementation proves its own rules by supplying `rules(lease,
 * context?)` on its adapter; one that does not is reported as unchecked, never as passing.
 *
 * Each finding is `{ rule, path, message }`. `path` is the JSON Pointer of the field the rule is
 * about, in the same style as a schema rejection's `.expect.json`.
 *
 *   L1  `expires_at` is after `issued_at`. Equal is refused too: a lease that expires the instant
 *       it is issued opens nothing, and UCAN calls that case `TooEarly` for the same reason.
 *   L2  `parent_lease_id`, when present, is not `lease_id`.
 *   L3  A `revoked` record's `by` names the issuer or a lease in the chain above the revoked one.
 *       Needs the journal, so it is checked only when `context.chainOf(leaseId)` is supplied; the
 *       record shape itself lands with the `lease-record` schema.
 */

const RFC3339_MS_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** `{ rule, path, message }[]`, empty when every rule holds. Never throws on a malformed lease. */
export function checkLeaseRules(lease, context = {}) {
  const findings = [];
  if (!lease || typeof lease !== 'object') {
    return [{ rule: 'L1', path: '', message: 'not an object' }];
  }
  const issued = typeof lease.issued_at === 'string' && RFC3339_MS_Z.test(lease.issued_at) ? Date.parse(lease.issued_at) : NaN;
  const expires = typeof lease.expires_at === 'string' && RFC3339_MS_Z.test(lease.expires_at) ? Date.parse(lease.expires_at) : NaN;
  if (Number.isFinite(issued) && Number.isFinite(expires) && expires <= issued) {
    findings.push({
      rule: 'L1',
      path: '/expires_at',
      message: `expires_at ${lease.expires_at} is not after issued_at ${lease.issued_at}: a lease that has expired when issued opens nothing`,
    });
  }
  if (typeof lease.parent_lease_id === 'string' && lease.parent_lease_id === lease.lease_id) {
    findings.push({
      rule: 'L2',
      path: '/parent_lease_id',
      message: 'parent_lease_id names the lease itself: a lease cannot be narrowed against its own grant',
    });
  }
  if (lease.event === 'revoked' && typeof lease.by === 'string' && lease.by !== 'issuer' && typeof context.chainOf === 'function') {
    const chain = context.chainOf(lease.lease_id) ?? [];
    if (!chain.includes(lease.by)) {
      findings.push({
        rule: 'L3',
        path: '/by',
        message: `revoked by ${lease.by}, which is neither the issuer nor an ancestor of ${lease.lease_id}`,
      });
    }
  }
  return findings;
}

/** The rule codes this module knows, for the runner's completeness check. */
export const LEASE_RULES = ['L1', 'L2', 'L3'];
