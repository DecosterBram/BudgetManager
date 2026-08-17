import { sqliteTable, integer, text, real, unique } from "drizzle-orm/sqlite-core";

export const categoryGroups = sqliteTable("category_groups", {
  id:         integer("id").primaryKey({ autoIncrement: true }),
  name:       text("name").notNull().unique(),
  sortOrder:  integer("sort_order").notNull().default(0),
  archivedAt: text("archived_at"),
});

export const categories = sqliteTable("categories", {
  id:         integer("id").primaryKey({ autoIncrement: true }),
  name:       text("name").notNull().unique(),
  kind:       text("kind", { enum: ["need", "want", "save"] }).notNull(),
  groupId:    integer("group_id").notNull().references(() => categoryGroups.id),
  sortOrder:  integer("sort_order").notNull().default(0),
  archivedAt: text("archived_at"),
});

export const transactions = sqliteTable("transactions", {
  id:            integer("id").primaryKey({ autoIncrement: true }),
  occurredOn:    text("occurred_on").notNull(),
  datePrecision: text("date_precision", { enum: ["day", "month"] }).notNull().default("day"),
  description:   text("description").notNull(),
  amountCents:   integer("amount_cents").notNull(),
  categoryId:    integer("category_id").notNull().references(() => categories.id),
  kind:          text("kind", { enum: ["expense", "income"] }).notNull().default("expense"),
  note:          text("note"),
  entrySource:   text("entry_source", { enum: ["manual", "import"] }).notNull().default("manual"),
  createdAt:     text("created_at").notNull(),
});

export const budgetLines = sqliteTable("budget_lines", {
  id:           integer("id").primaryKey({ autoIncrement: true }),
  month:        text("month").notNull(),
  categoryId:   integer("category_id").notNull().references(() => categories.id),
  plannedCents: integer("planned_cents").notNull(),
}, (t) => [unique().on(t.month, t.categoryId)]);

export const months = sqliteTable("months", {
  month:                  text("month").primaryKey(),
  incomeProjectedCents:   integer("income_projected_cents").notNull().default(0),
  incomeActualCents:      integer("income_actual_cents").notNull().default(0),
  pctNeed:                real("pct_need").notNull().default(0.50),
  pctWant:                real("pct_want").notNull().default(0.25),
  pctSave:                real("pct_save").notNull().default(0.25),
  closedAt:               text("closed_at"),
});

export const merchantRules = sqliteTable("merchant_rules", {
  id:          integer("id").primaryKey({ autoIncrement: true }),
  pattern:     text("pattern").notNull().unique(),
  categoryId:  integer("category_id").notNull().references(() => categories.id),
  hitCount:    integer("hit_count").notNull().default(1),
  lastUsedOn:  text("last_used_on").notNull(),
});
