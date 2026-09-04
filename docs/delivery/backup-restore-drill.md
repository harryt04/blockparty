# Backup and restore drill

This is the quarterly evidence packet for OPS-009, ENG-017, and SEC-005. The
drill must use a separate MongoDB replica set and credentials. Never restore a
production archive over a live database, and never put backup keys, connection
strings, capability values, or player data in this record.

## Schedule and controls

- Snapshot schedule: at least daily; the operator records the backup target,
  encryption key reference, access policy, monitoring check, and retention.
- Restore schedule: at least quarterly and before public release.
- Isolation: restore into a disposable replica set with a distinct database and
  network/security group. Do not allow the web service to receive public traffic.
- Targets: RPO is 24 hours without point-in-time recovery; RTO is 4 hours. These
  are objectives, not a zero-data-loss or high-availability promise.
- Destruction: after evidence is captured, destroy the isolated database,
  volume, decrypted archive, and temporary credentials.

## Operator procedure

Use an approved KMS-backed recipient or equivalent access-controlled encryption
tool. The example below uses `age`; replace it only with an approved tool and
record its exact version.

```sh
umask 077
backup_started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
mongodump --uri="$MONGODB_URI" --db="$MONGODB_DB" --archive --gzip \
  | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" \
  > "/secure-backup-target/blockparty-${backup_started_at}.archive.age"
```

Record the archive checksum and backup completion time in the provider's
immutable audit record. Do not print the URI, credentials, recipient secret, or
archive contents.

Provision the isolated replica set, then restore the encrypted archive into its
isolated database:

```sh
restore_started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
age --decrypt --identity "$BACKUP_AGE_IDENTITY" \
  "/secure-backup-target/<archive>.archive.age" \
  | mongorestore --uri="$ISOLATED_MONGODB_URI" --nsFrom="${MONGODB_DB}.*" \
      --nsTo="blockparty_restore.*" --archive --gzip --drop
```

Run compatibility/index maintenance and the automated restored-dataset check
against the isolated URI/database. The verifier checks all restored games and
their ordered events/receipts, captured content/rule/state versions and hashes,
expiry timestamps, capability hash-only handling, index names, and replayed
snapshot invariants. It emits aggregate counts only.

```sh
MONGODB_URI="$ISOLATED_MONGODB_URI" MONGODB_DB="blockparty_restore" \
  pnpm db:maintain
MONGODB_URI="$ISOLATED_MONGODB_URI" MONGODB_DB="blockparty_restore" \
  pnpm db:verify-restore
```

Confirm that at least one completed game can be opened through the read-only
summary/bootstrap reader in the isolated environment. Confirm expiry fields
remain unchanged and that capability documents contain hashes, not raw tokens.
Do not use the restored database for gameplay or write repairs during the
drill; remediation is recorded separately and the drill is repeated afterward.

## Evidence record

```text
Environment / isolated replica-set identifier:
Source backup target:
Archive recovery point (UTC):
Archive checksum / provider audit link:
mongodump version:
age or KMS tool version:
mongorestore version:
MongoDB version and replica-set configuration:
Index maintenance result:
Restore integrity report:
Completed-game read-only result:
RPO observed:
RTO observed:
Result: PASS / FAIL:
Remediation and issue links:
Operator / reviewer:
Drill date (UTC):
Isolation teardown confirmation:
```

The operator and reviewer attach the raw provider/tool output in the restricted
operations record, while this repository record retains only the aggregate
result and links. A failed or missing drill is not release evidence.
