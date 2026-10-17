# DynamoDB design

## Access patterns

| Entity / operation | Key/query pattern |
| --- | --- |
| User profile | `Profiles`: PK `SUB#<cognito-sub>`; GetItem/PutItem by subject. |
| Lab catalog and immutable versions | `Catalog`: PK `LAB#<slug>`, SK `VERSION#<version>`; Query versions or exact GetItem. A catalog list uses a `CATALOG` partition and sort key `LAB#<slug>` in the same table. |
| Courses and enrollment | `Courses`: PK `COURSE#<id>`, SK `VERSION#<version>`; `Enrollments`: PK `SUB#<sub>`, SK `COURSE#<id>`; course roster uses GSI1 PK `COURSE#<id>`, SK `SUB#<sub>`. |
| Student sessions / environment refs | `Sessions`: PK `SUB#<sub>`, SK `SESSION#<id>`; owner list is Query on the base partition. GSI1 PK `STATUS#<status>`, SK `EXPIRES#<timestamp>#SESSION#<id>` supports reconciliation; GSI2 PK `RESOURCE#<provider>#<resource-id>` supports exact resource lookup. |
| Student progress / task results / scores | `Progress`: PK `SUB#<sub>`, SK `LAB#<slug>#VERSION#<version>`; task result is an attribute/map updated conditionally on the expected session and version. |
| Orders, payments, entitlements | `Commerce`: PK `SUB#<sub>`, SK `ORDER#<id>` or `ENTITLEMENT#<lab-or-course>`; GSI1 PK `RAZORPAY_ORDER#<provider-id>` for webhook lookup. A unique event item keyed by `EVENT#<provider-event-id>` makes webhook effects idempotent. |
| Provision/retry/reset/cleanup jobs | `Jobs`: PK `JOB#<id>`, SK `STATE`; GSI1 PK `STATE#<state>`, SK `NEXT_ATTEMPT#<time>#JOB#<id>` for workers. Use a conditional lease (`leaseOwner`, `leaseUntil`) to prevent concurrent workers. |
| Security audit | `Audit`: PK `DAY#<UTC-date>#SHARD#<n>`, SK `<time>#<event-id>`; writes are append-only and sharded. Query by day/shard for investigation; export/retention policy is operationally configured. |

## Initial table choices

Use separate `Profiles`, `Catalog`, `Courses`, `Enrollments`, `Sessions`, `Progress`, `Commerce`, `Jobs`, and `Audit` tables. This keeps IAM scopes, retention, and write patterns understandable. Create only the indexes listed above when their callers exist. All user-owned writes condition on the verified subject and expected prior status. Payment confirmation plus entitlement grant uses `TransactWriteItems` with a condition that the payment/order is not already granted; webhook event idempotency is also conditional.

The `Sessions` table has TTL on `ttlEpoch` only as a storage cleanup hint. The worker must query GSI1 for due live sessions, destroy the provider resource, confirm it is absent, then conditionally mark `DESTROYED`. A stuck cleanup stays visible and retryable; DynamoDB TTL is never the infrastructure cleanup mechanism.

## Security and cost settings

Enable AWS-owned encryption (or a customer-managed KMS key where policy requires), point-in-time recovery for production, deletion protection for production tables, and environment-specific on-demand or provisioned capacity with alarms. API and worker roles get only required table actions and key/resource-scoped EC2/SSM permissions. Terraform controls Cognito callbacks per environment. Local development uses DynamoDB Local with dummy values only.
