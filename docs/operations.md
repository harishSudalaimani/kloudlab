# Provisioning and cleanup operations

## Provisioning failures

1. A start request writes a `PENDING` session with owner, lab version, expiry, and idempotency key before calling the provider.
2. The worker claims the associated job with a conditional lease and moves the session to `PROVISIONING`.
3. On success, persist provider/resource references and move to `READY` conditionally from `PROVISIONING`.
4. On transient failure, retain the record, set a bounded exponential retry time, increment attempts, and emit a redacted audit event. On permanent failure, mark `FAILED` and expose a safe error code to the student.
5. Repeated retries must use the same session/resource tags so a retry cannot create untracked duplicate infrastructure.

## Cleanup failures

The reconciler queries due sessions from the expiry GSI and also periodically inventories provider resources tagged with `cloudlab=true` and a session ID to find orphaned resources. It requests destroy, checks provider state until absence, and only then marks the session `DESTROYED`. Failed deletes remain `CLEANUP_PENDING`, alert after the retry threshold, and never become invisible when TTL removes an expired record. Operators can retry a job by resetting its lease and next-attempt time; every manual action is audited.

## Security response

If a lab boundary or access token is suspected compromised, revoke the session at the gateway, stop/destroy the tagged resource, disable the affected lab version, and preserve audit/job records. Rotate backend role credentials through the platform's identity mechanism; do not place long-lived keys in the application.
