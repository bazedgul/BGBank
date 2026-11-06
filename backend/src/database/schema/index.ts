import {
  boolean,
  bigint,
  check,
  foreignKey,
  integer,
  index,
  pgTable,
  primaryKey,
  jsonb,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const currencies = pgTable(
  'currencies',
  {
    code: varchar('code', { length: 3 }).primaryKey(),
    name: text('name').notNull(),
    minorUnitExponent: smallint('minor_unit_exponent').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'currencies_code_uppercase_format_check',
      sql`${table.code} ~ '^[A-Z]{3}$'`,
    ),
    check(
      'currencies_minor_unit_exponent_check',
      sql`${table.minorUnitExponent} >= 0`,
    ),
    check(
      'currencies_name_not_blank_check',
      sql`length(trim(${table.name})) > 0`,
    ),
  ],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'users_status_check',
      sql`${table.status} IN ('pending', 'active', 'suspended', 'closed')`,
    ),
    check(
      'users_closed_at_consistency_check',
      sql`(${table.status} = 'closed' AND ${table.closedAt} IS NOT NULL) OR (${table.status} <> 'closed' AND ${table.closedAt} IS NULL)`,
    ),
  ],
);

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id),
    displayName: varchar('display_name', { length: 200 }).notNull(),
    countryCode: varchar('country_code', { length: 2 }).notNull(),
    preferredLanguage: varchar('preferred_language', { length: 20 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'customers_display_name_not_blank_check',
      sql`length(trim(${table.displayName})) > 0`,
    ),
    check(
      'customers_country_code_format_check',
      sql`${table.countryCode} ~ '^[A-Z]{2}$'`,
    ),
    check(
      'customers_preferred_language_not_blank_check',
      sql`length(trim(${table.preferredLanguage})) > 0`,
    ),
  ],
);

export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 100 }).notNull().unique(),
    name: varchar('name', { length: 200 }).notNull(),
    accountType: text('account_type').notNull(),
    normalSide: text('normal_side').notNull(),
    parentId: uuid('parent_id'),
    currency: varchar('currency', { length: 3 })
      .notNull()
      .references(() => currencies.code),
    kind: text('kind').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('ledger_accounts_id_currency_unique').on(table.id, table.currency),
    index('ledger_accounts_parent_id_idx').on(table.parentId),
    foreignKey({
      columns: [table.parentId, table.currency],
      foreignColumns: [table.id, table.currency],
      name: 'ledger_accounts_parent_currency_fk',
    }),
    check(
      'ledger_accounts_type_check',
      sql`${table.accountType} IN ('asset', 'liability', 'equity', 'income', 'expense')`,
    ),
    check(
      'ledger_accounts_normal_side_check',
      sql`${table.normalSide} IN ('debit', 'credit')`,
    ),
    check(
      'ledger_accounts_kind_check',
      sql`${table.kind} IN ('control', 'customer_subledger', 'operational', 'clearing', 'suspense', 'income', 'expense')`,
    ),
    check(
      'ledger_accounts_status_check',
      sql`${table.status} IN ('active', 'closed')`,
    ),
    check(
      'ledger_accounts_not_self_parent_check',
      sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`,
    ),
    check(
      'ledger_accounts_code_not_blank_check',
      sql`length(trim(${table.code})) > 0`,
    ),
    check(
      'ledger_accounts_name_not_blank_check',
      sql`length(trim(${table.name})) > 0`,
    ),
  ],
);

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountNumber: varchar('account_number', { length: 34 }).notNull().unique(),
    accountType: text('account_type').notNull(),
    currency: varchar('currency', { length: 3 })
      .notNull()
      .references(() => currencies.code),
    status: text('status').notNull().default('pending'),
    ledgerAccountId: uuid('ledger_account_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    unique('accounts_id_currency_unique').on(table.id, table.currency),
    uniqueIndex('accounts_ledger_account_id_unique').on(table.ledgerAccountId),
    foreignKey({
      columns: [table.ledgerAccountId, table.currency],
      foreignColumns: [ledgerAccounts.id, ledgerAccounts.currency],
      name: 'accounts_ledger_account_currency_fk',
    }),
    check(
      'accounts_account_type_check',
      sql`${table.accountType} IN ('current', 'savings')`,
    ),
    check(
      'accounts_account_number_not_blank_check',
      sql`length(trim(${table.accountNumber})) > 0`,
    ),
    check(
      'accounts_status_check',
      sql`${table.status} IN ('pending', 'active', 'frozen', 'dormant', 'closed')`,
    ),
    check(
      'accounts_closed_at_consistency_check',
      sql`(${table.status} = 'closed' AND ${table.closedAt} IS NOT NULL) OR (${table.status} <> 'closed' AND ${table.closedAt} IS NULL)`,
    ),
  ],
);

export const accountOwners = pgTable(
  'account_owners',
  {
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    role: text('role').notNull().default('primary'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.customerId] }),
    uniqueIndex('account_owners_primary_unique')
      .on(table.accountId)
      .where(sql`${table.role} = 'primary'`),
    index('account_owners_customer_id_idx').on(table.customerId),
    check(
      'account_owners_role_check',
      sql`${table.role} IN ('primary', 'joint')`,
    ),
  ],
);

export const journals = pgTable(
  'journals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    journalType: text('journal_type').notNull(),
    status: text('status').notNull().default('draft'),
    businessReference: varchar('business_reference', { length: 200 }).notNull(),
    reversesJournalId: uuid('reverses_journal_id'),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (table) => [
    foreignKey({
      columns: [table.reversesJournalId],
      foreignColumns: [table.id],
      name: 'journals_reverses_journal_fk',
    }),
    check(
      'journals_status_check',
      sql`${table.status} IN ('draft', 'posted', 'abandoned', 'expired')`,
    ),
    check(
      'journals_posted_at_consistency_check',
      sql`(${table.status} = 'posted' AND ${table.postedAt} IS NOT NULL) OR (${table.status} <> 'posted' AND ${table.postedAt} IS NULL)`,
    ),
  ],
);

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    journalId: uuid('journal_id')
      .notNull()
      .references(() => journals.id),
    ledgerAccountId: uuid('ledger_account_id').notNull(),
    side: text('side').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    currency: varchar('currency', { length: 3 })
      .notNull()
      .references(() => currencies.code),
    entryPosition: integer('entry_position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('journal_entries_journal_position_unique').on(
      table.journalId,
      table.entryPosition,
    ),
    foreignKey({
      columns: [table.ledgerAccountId, table.currency],
      foreignColumns: [ledgerAccounts.id, ledgerAccounts.currency],
      name: 'journal_entries_ledger_account_currency_fk',
    }),
    check(
      'journal_entries_side_check',
      sql`${table.side} IN ('debit', 'credit')`,
    ),
    check(
      'journal_entries_amount_positive_check',
      sql`${table.amountMinor} > 0`,
    ),
  ],
);

export const journalStatusHistory = pgTable('journal_status_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  journalId: uuid('journal_id')
    .notNull()
    .references(() => journals.id),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  actorType: text('actor_type').notNull(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  actorReference: varchar('actor_reference', { length: 200 }),
  reason: text('reason').notNull(),
  requestId: varchar('request_id', { length: 200 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const accountBalanceProjections = pgTable(
  'account_balance_projections',
  {
    accountId: uuid('account_id').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    ledgerBalanceMinor: bigint('ledger_balance_minor', {
      mode: 'bigint',
    }).notNull(),
    availableBalanceMinor: bigint('available_balance_minor', {
      mode: 'bigint',
    }).notNull(),
    lastPostedJournalId: uuid('last_posted_journal_id').references(
      () => journals.id,
    ),
    projectionVersion: bigint('projection_version', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.currency] }),
    foreignKey({
      columns: [table.accountId, table.currency],
      foreignColumns: [accounts.id, accounts.currency],
      name: 'account_projections_account_currency_fk',
    }),
    check(
      'account_projections_available_balance_check',
      sql`${table.availableBalanceMinor} = ${table.ledgerBalanceMinor}`,
    ),
  ],
);

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorType: text('actor_type').notNull(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  actorReference: varchar('actor_reference', { length: 200 }),
  action: varchar('action', { length: 100 }).notNull(),
  targetType: varchar('target_type', { length: 100 }).notNull(),
  targetId: uuid('target_id'),
  requestId: varchar('request_id', { length: 200 }).notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const outboxEvents = pgTable('outbox_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventType: varchar('event_type', { length: 150 }).notNull(),
  aggregateType: varchar('aggregate_type', { length: 100 }).notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  payload: jsonb('payload').notNull(),
  state: text('state').notNull().default('pending'),
  attemptCount: integer('attempt_count').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  workerId: varchar('worker_id', { length: 200 }),
  claimToken: uuid('claim_token'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  lastErrorCode: varchar('last_error_code', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const customerCredentials = pgTable('customer_credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  loginIdentifier: varchar('login_identifier', { length: 320 })
    .notNull()
    .unique(),
  passwordHash: text('password_hash').notNull(),
  passwordAlgorithm: varchar('password_algorithm', { length: 32 })
    .notNull()
    .default('argon2id'),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const customerSessions = pgTable('customer_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  sessionClass: varchar('session_class', { length: 16 })
    .notNull()
    .default('customer'),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  csrfTokenHash: varchar('csrf_token_hash', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  idleExpiresAt: timestamp('idle_expires_at', { withTimezone: true }).notNull(),
  absoluteExpiresAt: timestamp('absolute_expires_at', {
    withTimezone: true,
  }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  userAgent: varchar('user_agent', { length: 512 }),
  createdIp: text('created_ip'),
});

export const transfers = pgTable(
  'transfers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    sourceAccountId: uuid('source_account_id')
      .notNull()
      .references(() => accounts.id),
    destinationAccountId: uuid('destination_account_id')
      .notNull()
      .references(() => accounts.id),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    currency: varchar('currency', { length: 3 })
      .notNull()
      .references(() => currencies.code),
    state: varchar('state', { length: 16 }).notNull().default('created'),
    journalId: uuid('journal_id').references(() => journals.id),
    reference: varchar('reference', { length: 200 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('transfers_actor_created_idx').on(
      table.actorUserId,
      table.createdAt,
      table.id,
    ),
    index('transfers_source_created_idx').on(
      table.sourceAccountId,
      table.createdAt,
      table.id,
    ),
    index('transfers_destination_created_idx').on(
      table.destinationAccountId,
      table.createdAt,
      table.id,
    ),
    check('transfers_amount_positive_check', sql`${table.amountMinor} > 0`),
    check(
      'transfers_distinct_accounts_check',
      sql`${table.sourceAccountId} <> ${table.destinationAccountId}`,
    ),
    check(
      'transfers_state_check',
      sql`${table.state} IN ('created', 'posted', 'completed', 'rejected')`,
    ),
    check(
      'transfers_state_journal_check',
      sql`(
    (${table.state} IN ('created', 'rejected') AND ${table.journalId} IS NULL AND ${table.postedAt} IS NULL AND ${table.completedAt} IS NULL)
    OR (${table.state} = 'posted' AND ${table.journalId} IS NOT NULL AND ${table.postedAt} IS NOT NULL AND ${table.completedAt} IS NULL)
    OR (${table.state} = 'completed' AND ${table.journalId} IS NOT NULL AND ${table.postedAt} IS NOT NULL AND ${table.completedAt} IS NOT NULL)
  `,
    ),
    foreignKey({
      columns: [table.sourceAccountId, table.currency],
      foreignColumns: [accounts.id, accounts.currency],
      name: 'transfers_currency_source_fk',
    }),
    foreignKey({
      columns: [table.destinationAccountId, table.currency],
      foreignColumns: [accounts.id, accounts.currency],
      name: 'transfers_currency_destination_fk',
    }),
  ],
);

export const transferStateHistory = pgTable(
  'transfer_state_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    transferId: uuid('transfer_id')
      .notNull()
      .references(() => transfers.id),
    fromState: varchar('from_state', { length: 16 }),
    toState: varchar('to_state', { length: 16 }).notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    reason: varchar('reason', { length: 200 }).notNull(),
    requestId: varchar('request_id', { length: 200 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('transfer_state_history_transfer_idx').on(
      table.transferId,
      table.createdAt,
      table.id,
    ),
  ],
);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scope: varchar('scope', { length: 100 }).notNull(),
    key: varchar('key', { length: 255 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    state: varchar('state', { length: 16 }).notNull().default('processing'),
    transferId: uuid('transfer_id').references(() => transfers.id),
    responseJson: jsonb('response_json'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    terminalAt: timestamp('terminal_at', { withTimezone: true }),
    tombstoneUntil: timestamp('tombstone_until', { withTimezone: true }),
  },
  (table) => [
    unique('idempotency_keys_scope_key_unique').on(table.scope, table.key),
    index('idempotency_keys_cleanup_idx').on(table.tombstoneUntil),
    check(
      'idempotency_keys_hash_check',
      sql`length(${table.requestHash}) = 64`,
    ),
    check(
      'idempotency_keys_state_check',
      sql`${table.state} IN ('processing', 'completed', 'rejected', 'tombstone')`,
    ),
    check(
      'idempotency_keys_terminal_consistency_check',
      sql`(
    (${table.state} = 'processing' AND ${table.terminalAt} IS NULL)
    OR (${table.state} IN ('completed', 'rejected', 'tombstone') AND ${table.terminalAt} IS NOT NULL)
  `,
    ),
    check(
      'idempotency_keys_completed_result_check',
      sql`(
    (${table.state} = 'completed' AND ${table.transferId} IS NOT NULL AND ${table.responseJson} IS NOT NULL)
    OR ${table.state} <> 'completed'
  `,
    ),
  ],
);
