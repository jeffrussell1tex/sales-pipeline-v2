import {
    pgTable, text, integer, boolean, timestamp, jsonb, varchar, decimal
} from 'drizzle-orm/pg-core';

// ── USERS ─────────────────────────────────────────────────────────────────────
// Sales reps, managers, admins — one row per user account
export const users = pgTable('users', {
    id:            text('id').primaryKey(),                          // e.g. "usr_001"
    name:          varchar('name', { length: 255 }).notNull(),
    email:         varchar('email', { length: 255 }).notNull().unique(),
    role:          varchar('role', { length: 50 }).notNull().default('User'),  // Admin | Manager | User | ReadOnly
    team:          varchar('team', { length: 255 }),
    territory:     varchar('territory', { length: 255 }),
    quota:         decimal('quota', { precision: 12, scale: 2 }),
    active:        boolean('active').notNull().default(true),
    profile:       jsonb('profile').default('{}'),                   // full profile fields (firstName, lastName, phone, etc.)
    createdAt:     timestamp('created_at').notNull().defaultNow(),
    updatedAt:     timestamp('updated_at').notNull().defaultNow(),
});

// ── PIPELINES ─────────────────────────────────────────────────────────────────
// Named pipelines (e.g. "Enterprise", "SMB")
export const pipelines = pgTable('pipelines', {
    id:        text('id').primaryKey(),
    name:      varchar('name', { length: 255 }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ── ACCOUNTS ──────────────────────────────────────────────────────────────────
// Customer/prospect companies
export const accounts = pgTable('accounts', {
    id:                text('id').primaryKey(),
    name:              varchar('name', { length: 255 }).notNull(),
    verticalMarket:    varchar('vertical_market', { length: 255 }),
    industry:          varchar('industry', { length: 255 }),
    address:           text('address'),
    city:              varchar('city', { length: 255 }),
    state:             varchar('state', { length: 100 }),
    zip:               varchar('zip', { length: 20 }),
    country:           varchar('country', { length: 100 }),
    website:           varchar('website', { length: 500 }),
    phone:             varchar('phone', { length: 50 }),
    accountOwner:      varchar('account_owner', { length: 255 }),    // rep name
    assignedRep:       varchar('assigned_rep', { length: 255 }),
    assignedTerritory: varchar('assigned_territory', { length: 255 }),
    parentAccountId:   text('parent_account_id'),                    // for sub-accounts
    notes:             text('notes'),
    createdAt:         timestamp('created_at').notNull().defaultNow(),
    updatedAt:         timestamp('updated_at').notNull().defaultNow(),
});

// ── CONTACTS ──────────────────────────────────────────────────────────────────
// Individual people at accounts
export const contacts = pgTable('contacts', {
    id:                text('id').primaryKey(),
    prefix:            varchar('prefix', { length: 20 }),
    firstName:         varchar('first_name', { length: 255 }),
    middleName:        varchar('middle_name', { length: 255 }),
    lastName:          varchar('last_name', { length: 255 }),
    suffix:            varchar('suffix', { length: 20 }),
    nickName:          varchar('nick_name', { length: 255 }),
    title:             varchar('title', { length: 255 }),
    company:           varchar('company', { length: 255 }),          // account name
    department:        varchar('department', { length: 255 }),
    workLocation:      varchar('work_location', { length: 255 }),
    email:             varchar('email', { length: 255 }),
    personalEmail:     varchar('personal_email', { length: 255 }),
    phone:             varchar('phone', { length: 50 }),
    mobile:            varchar('mobile', { length: 50 }),
    address:           text('address'),
    city:              varchar('city', { length: 255 }),
    state:             varchar('state', { length: 100 }),
    zip:               varchar('zip', { length: 20 }),
    country:           varchar('country', { length: 100 }),
    managers:          jsonb('managers').default('[]'),              // array of contact names
    directReports:     jsonb('direct_reports').default('[]'),
    assistantName:     varchar('assistant_name', { length: 255 }),
    homeAddress:       text('home_address'),
    notes:             text('notes'),
    assignedRep:       varchar('assigned_rep', { length: 255 }),
    assignedTerritory: varchar('assigned_territory', { length: 255 }),
    createdAt:         timestamp('created_at').notNull().defaultNow(),
    updatedAt:         timestamp('updated_at').notNull().defaultNow(),
});

// ── OPPORTUNITIES ─────────────────────────────────────────────────────────────
// Sales deals / pipeline opportunities
export const opportunities = pgTable('opportunities', {
    id:                   text('id').primaryKey(),
    pipelineId:           text('pipeline_id').notNull(),
    opportunityName:      varchar('opportunity_name', { length: 500 }),
    account:              varchar('account', { length: 255 }),        // account name
    site:                 varchar('site', { length: 255 }),
    salesRep:             varchar('sales_rep', { length: 255 }),
    stage:                varchar('stage', { length: 100 }).notNull(),
    arr:                  decimal('arr', { precision: 12, scale: 2 }),
    implementationCost:   decimal('implementation_cost', { precision: 12, scale: 2 }),
    forecastedCloseDate:  varchar('forecasted_close_date', { length: 20 }),
    closeQuarter:         varchar('close_quarter', { length: 50 }),
    products:             text('products'),
    unionized:            varchar('unionized', { length: 10 }),
    painPoints:           text('pain_points'),
    contacts:             text('contacts'),                           // legacy text field
    contactIds:           jsonb('contact_ids').default('[]'),         // array of contact ids
    notes:                text('notes'),
    nextSteps:            text('next_steps'),
    probability:          integer('probability'),
    forecastCategory:     varchar('forecast_category', { length: 100 }),
    vertical:             varchar('vertical', { length: 255 }),
    territory:            varchar('territory', { length: 255 }),
    team:                 varchar('team', { length: 255 }),
    lostReason:           text('lost_reason'),
    lostCategory:         varchar('lost_category', { length: 255 }),
    lostDate:             varchar('lost_date', { length: 20 }),
    wonDate:              varchar('won_date', { length: 20 }),
    stageChangedDate:     varchar('stage_changed_date', { length: 20 }),
    createdDate:          varchar('created_date', { length: 20 }),
    createdBy:            varchar('created_by', { length: 255 }),
    stageHistory:         jsonb('stage_history').default('[]'),       // [{stage, date, prevStage, author, timestamp}]
    comments:             jsonb('comments').default('[]'),            // [{id, text, author, timestamp}]
    createdAt:            timestamp('created_at').notNull().defaultNow(),
    updatedAt:            timestamp('updated_at').notNull().defaultNow(),
});

// ── TASKS ─────────────────────────────────────────────────────────────────────
// Follow-up tasks and to-dos
export const tasks = pgTable('tasks', {
    id:             text('id').primaryKey(),
    title:          varchar('title', { length: 500 }),
    description:    text('description'),
    type:           varchar('type', { length: 100 }),                // Call, Email, Meeting, etc.
    dueDate:        varchar('due_date', { length: 20 }),
    dueTime:        varchar('due_time', { length: 10 }),
    reminderDate:   varchar('reminder_date', { length: 20 }),
    reminderTime:   varchar('reminder_time', { length: 10 }),
    assignedTo:     varchar('assigned_to', { length: 255 }),
    priority:       varchar('priority', { length: 50 }),             // Low | Medium | High
    status:         varchar('status', { length: 50 }),               // Open | In Progress | Completed
    completed:      boolean('completed').notNull().default(false),
    completedDate:  varchar('completed_date', { length: 20 }),
    opportunityId:  text('opportunity_id'),
    contactId:      text('contact_id'),
    accountId:      text('account_id'),
    relatedTo:      text('related_to'),
    createdAt:      timestamp('created_at').notNull().defaultNow(),
    updatedAt:      timestamp('updated_at').notNull().defaultNow(),
});

// ── ACTIVITIES ────────────────────────────────────────────────────────────────
// Call logs, emails, meetings, notes on opportunities/contacts
export const activities = pgTable('activities', {
    id:            text('id').primaryKey(),
    type:          varchar('type', { length: 100 }),                 // Call | Email | Meeting | Note | etc.
    date:          varchar('date', { length: 20 }),
    subject:       varchar('subject', { length: 500 }),
    notes:         text('notes'),
    outcome:       varchar('outcome', { length: 255 }),
    duration:      integer('duration'),                              // minutes
    opportunityId: text('opportunity_id'),
    contactId:     text('contact_id'),
    accountId:     text('account_id'),
    author:        varchar('author', { length: 255 }),
    createdAt:     timestamp('created_at').notNull().defaultNow(),
    updatedAt:     timestamp('updated_at').notNull().defaultNow(),
});

// ── SETTINGS ──────────────────────────────────────────────────────────────────
// Company-wide app configuration (one row per tenant)
export const settings = pgTable('settings', {
    id:              text('id').primaryKey().default('default'),
    companyName:     varchar('company_name', { length: 255 }),
    companyLogo:     text('company_logo'),                           // base64 or URL
    fiscalYearStart: varchar('fiscal_year_start', { length: 10 }),  // e.g. "2025-01-01"
    stages:          jsonb('stages').default('[]'),                  // array of stage names
    taskTypes:       jsonb('task_types').default('[]'),
    painPoints:      jsonb('pain_points').default('[]'),
    verticalMarkets: jsonb('vertical_markets').default('[]'),
    fieldVisibility: jsonb('field_visibility').default('{}'),        // role-based field access
    updatedAt:       timestamp('updated_at').notNull().defaultNow(),
});

// ── AUDIT LOG ─────────────────────────────────────────────────────────────────
// Record of all create/update/delete actions
export const auditLog = pgTable('audit_log', {
    id:         text('id').primaryKey(),
    action:     varchar('action', { length: 50 }).notNull(),         // create | update | delete
    entityType: varchar('entity_type', { length: 100 }).notNull(),   // opportunity | contact | account | task
    entityId:   text('entity_id').notNull(),
    entityName: text('entity_name'),
    detail:     text('detail'),
    userId:     text('user_id'),
    userName:   varchar('user_name', { length: 255 }),
    timestamp:  timestamp('timestamp').notNull().defaultNow(),
});

// ── LEADS ─────────────────────────────────────────────────────────────────────
// Inbound prospects before they become opportunities
export const leads = pgTable('leads', {
    id:           text('id').primaryKey(),
    firstName:    varchar('first_name', { length: 255 }),
    lastName:     varchar('last_name', { length: 255 }),
    company:      varchar('company', { length: 255 }),
    title:        varchar('title', { length: 255 }),
    email:        varchar('email', { length: 255 }),
    phone:        varchar('phone', { length: 50 }),
    source:       varchar('source', { length: 100 }),           // Web Form | LinkedIn | Trade Show | etc.
    status:       varchar('status', { length: 50 }).notNull().default('New'),  // New | Contacted | Qualified | Working | Converted | Dead
    score:        integer('score').default(50),                 // 0–100
    estimatedARR: decimal('estimated_arr', { precision: 12, scale: 2 }),
    assignedTo:   varchar('assigned_to', { length: 255 }),      // rep name
    notes:        text('notes'),
    convertedAt:  varchar('converted_at', { length: 30 }),
    createdAt:    timestamp('created_at').notNull().defaultNow(),
    updatedAt:    timestamp('updated_at').notNull().defaultNow(),
});
