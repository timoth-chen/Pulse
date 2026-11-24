# Pulse — find your financial rhythm

A private finance app for two people with combined finances, with manual accounts, CSV imports, and a shared day-to-day picture. Bank CSV exports are the ongoing transaction import source.

## Household interface refresh
- Persistent desktop sidebar with Settings at the bottom; compact scrolling navigation on phones.
- Streaming-inspired profile picker with large initials tiles. Profile access remains password-free.
- Dashboard activity, upcoming bills, and goal progress use your actual saved records.
- Spend from a goal using any recorded account, including credit cards: records one expense and reduces the goal in one server operation. Amounts cannot exceed the goal balance. Account balances remain manual snapshots, consistent with other transaction entry. Deleting the expense does not automatically restore a goal withdrawal; adjust the goal balance if reversing it.
- Light/Dark controls, local fonts, reduced-motion support, and responsive forms.
- Run `npm start`, then open http://localhost:8080. No build step required.
- For isolated testing, set `HF_DATA_DIR` to a separate directory and `PORT` to an unused port.

## Owner views and profiles

Named account owners have profiles automatically; Joint and unassigned records do not create profiles. A first-run name form is available only before the household has its first profile. With one profile, Pulse opens it directly. With multiple named owners, the picker offers those profiles.

The compact switch icon and signed-in name live above Settings in the desktop sidebar. The top owner switcher is a viewing filter: only the active choice has a label, with other choices shown as circular initials/icons. The three-person icon selects Everyone. Unassigned records appear in Everyone, without creating an Unassigned profile or owner button.

Settings → Open with Everyone is saved per signed-in profile in SQLite. Off (the default) opens Pulse with only that profile's records; on opens the whole household. Manual owner changes apply across the current visit. The saved default is applied again when Pulse opens. Viewing another owner does not change the signed-in identity or stored ownership.

The owner view applies to financial read APIs, dashboard totals, history, transactions, budgets/goals, bills, investments, payoff plans, funds checks, transfers, and financial exports. Split transactions count only the selected person's portions; choose Everyone to edit a partial split's original record. Funds checks still deduct every obligation charged to the selected account, including jointly owned bills. Mixed-owner CSV import commits require Everyone. These are household viewing controls, not an access-control boundary.

## Accounts and account detail

Accounts is directly below Dashboard. Its list stays complete for the chosen owner; use an account's eye control to include/exclude it from the overview graphs and totals without deleting its balance history. Hidden accounts remain available to open individually. This visibility preference is stored on the account or loan, and also applies to the dashboard net-worth overview.

Selecting a row opens a separate account detail view with that account's line chart, period selector, metadata, notes, transactions, and holdings for investment accounts. Edit the balance/owner through Edit account, or manage a loan through Payoff. Balance CSVs contain account totals only, so they do not invent holdings, spending transactions, live bank connections, rates, or original loan principal.

Performance defaults to six months and uses a continuous line. Breakdown uses green for cash, blue for investments, and red shades for liabilities, debts below zero, and a net-worth line. Allocation shows the current balance mix. Available periods are 1/3/6 months, YTD, 1 year, and all time; breakdowns can group monthly, quarterly, or yearly. Hover/focus/tap to inspect balances and changes, with a tracking dot and vertical guide following the selected graph point. Raw balance tables live in a separate History tab on both the overview and account detail screens; history-start notes and hidden-account counts are omitted from the main chart. Latest balances carry forward until updated, with no fabricated history before the first observation. Search, Sort, Filters, and Add account share an aligned toolbar. Specific-account, type, and amount criteria stay behind Filters. Inputs, dropdowns, and action controls use a 38px height; checkboxes and multiline notes keep their natural shapes.

## Page URLs and shared owners

Every main page has a URL: `/dashboard`, `/accounts`, `/transactions`, `/cash-flow`, `/reports`, `/forecast`, `/funds-check`, `/budget`, `/goals`, `/recurring`, `/payoff`, `/investments`, `/import`, and `/settings`. Sidebar links support normal open-in-new-tab behavior. Refresh and browser back/forward restore the selected page. Account details use `/accounts/:id` (loans use `/accounts/loans/:id`); transactions use `/transactions/:id`. Receipt, retail-order and rule tabs have their own transaction subpaths. The server serves the app shell for these paths, and sign-in preserves the destination.

The account editor has one **Owners** dropdown with checkboxes for existing named profiles. Choose one or several owners. Shared membership is stored as `owners`; the legacy `person` label remains compatible with older records. No combined-name profile is created. A shared account is visible in each member's view at its full balance; Everyone counts it once. This does not assume a percentage ownership split. Transactions with an explicitly assigned owner keep that owner; unassigned transactions inherit account membership. Ownership changes are captured in balance history.

Minimum payment and **Payment account** appear only for credit cards. Payment account identifies where Funds Check should reserve the minimum payment; it does not send payments or move money. Savings, chequing and investment editors omit credit-card fields. Account details show the latest committed upload's filename, upload time, type, and records-through date, separately from balance observation dates.

Transaction utility actions stay behind **Actions**. The category section contains the optional four-digit MCC field; missing codes are left blank, never inferred from a category. Close icons are unboxed. Body text, forms, controls, and amounts continue to use self-hosted IBM Plex Sans, with Fraunces for expressive headings and the existing blue/rose light and dark theme tokens.

## Payoff

Payoff has its own page for loan balances, circular progress, payment details, and estimated payoff dates. The progress ring uses original principal when provided; unknown principal is not fabricated. Add loan/Edit plan opens a form for balance, owner, lender, original principal, APR, monthly payment, next due date, and pay-from account.

Try a monthly payment opens a read-only calculator. Enter the amount and an explicit APR (including 0 for interest-free debt) to preview months remaining, payoff date, total interest, and total payments. Calculations round monthly interest/payments to cents and stop if the payment cannot cover interest. Use this payment explicitly saves the monthly payment and APR to the plan. Previewing does not record a payment or change the current balance. Estimates assume fixed monthly payments and APR and exclude fees and future rate changes.

## Transactions

The transaction workspace has matching totals, a date-grouped list (when sorted by date), review filters, account/category/owner/date/amount filters, sorting, and bulk Mark reviewed. Search and filters apply to totals as well as rows. The list pages through every match in groups of 200; matched totals and CSV downloads use the full filtered set.

Click a row for its detail drawer: merchant, date, amount, category, owner, account, notes, tags, review state, split, transfer, and delete. Shared purchases show only the selected owner's portions, and require Everyone to edit or bulk-review the full purchase. Existing split totals cannot be changed independently of their parts. New manual transactions open in a dialog; transfers and partner balances stay behind a secondary disclosure. Transaction metadata and review state persist in SQLite. This implementation does not connect to a Monarch login or a bank, and does not claim Monarch's proprietary implementation.

Transactions also has Receipts, Retail orders and Rules tabs, optional columns, date-group totals, a collapsible summary and a full filtered CSV download. Receipt/order references and itemized text can be attached from the detail drawer and viewed by owner. JPEG, PNG, WebP and PDF files up to 5 MB can also be attached locally. Files are served through authenticated, owner-scoped download routes. Screenshot extraction is available through the optional OpenAI API integration. Automatic receipt-to-transaction matching, email forwarding and retailer sync are not connected.

Rules persist in SQLite and apply to future CSV previews. A separate preview/apply flow can update matching, unsplit existing transactions after review; it records each change in transaction history. Create them in Rules or start from a transaction's detail drawer. CSV uploads now stage a review first: original rows remain available, duplicates/invalid rows are identified, and nothing enters the transaction ledger until **Import selected transactions**. The old direct `/api/import` route rejects writes and points clients to the staged workflow.

The import preview supports **Export AI review package**, **Load AI suggestions**, and optional embedded OpenAI cleanup for unknown rows. Suggestions remain pending until individually accepted/rejected; unresolved suggestions block commit. AI can propose labels or exclusion, but cannot rewrite dates, amounts or account identifiers. No AI receives data without an explicit review/extraction action and consent. [API contract and JSON example](docs/AI-IMPORT.md) explain how an assistant can integrate with this workflow.

Cash Flow shows period-by-period income/spending/net. Reports offers Cash flow, Spending and Income tabs, selectable trends/breakdowns/Sankey, category/group hierarchies, saved configurations, and CSV/PNG exports. Forecast provides an editable savings scenario inside Financial tools. Cash Flow and Reports exclude transfers and honor owner-scoped split portions. Forecast uses explicit assumptions, not imported balance changes as income or assumed investment returns.

Controls use a common 38px height and 10px field radius. The active owner is an oval badge, theme icons sit at the far right, and the dark background uses a restrained blue/slate palette with a subtle pink tint; liability data retain their semantic red.

## Transaction detail, categories and accounting

The transaction drawer shows a review button, visibility/recurring controls, amount/account, merchant, original statement, grouped category picker, owner, goal link, notes, tags, review assignment, attachments, activity, and hidden utility actions. **Split** is beside Category and edits parts inside the drawer. A goal selection links the transaction without moving or withdrawing savings; use Goals for allocation changes or spending from a goal.

Categories have a parent group and a type. Coffee Shops, Groceries, Drinks, Desserts and Restaurants belong to **Food & drink**. Transactions → Categories lets you edit parent groups/types. Types affect all historical calculations: positive amounts in expense categories reduce spending (refunds/reimbursements), and negative amounts in income categories reduce income. Transfers are excluded. Pending is excluded by default, with an explicit **Include pending in totals** option. Raw transaction amounts are preserved.

Summary reconciliation compares the currently imported view with the original Monarch source, including excluded accounts and pending in the source comparison only. It does not restore excluded accounts. Largest incoming/outgoing amounts omit hidden/pending/transfers as selected; average signed transaction is the signed mean of raw filtered records, including transfers. Original CSV counts can differ from a newer Monarch screenshot or from internal parent/split record counts.

The Chexy preset uses gross ÷ 1.0175 for the base and the cent remainder for the fee. Example: $667.82 → $656.33 Auto Payment + $11.49 Financial Fees. Parts must match the total exactly, and the original record is counted once. A narrowly scoped statement/account/exact-amount rule can be saved explicitly. Existing exported fee/base rows are recognized as already separated and are not split or merged automatically. The import retains their original source IDs and amounts.

## Bank CSVs and screenshots

Import supports Monarch CSV and mapped bank CSV. Bank imports accept signed/inverted Amount or separate Debit/Credit columns, an existing account when missing from the file, explicit MDY/DMY dates, and mapped headerless files. Ambiguous dates and blank amounts are rejected instead of guessed. Amounts are treated as CAD; files explicitly containing other currencies require conversion first. Possible overlaps with existing transactions are excluded initially for review; they are not silently merged.

Use **Correct a draft row** for manual corrections before commit. This keeps original values/correction history. Screenshots (PNG/JPEG/WebP) can be extracted into drafts when the server has an OpenAI key. Every included date/sign/amount must be verified against the source image before screenshot import is allowed. API cleanup is rules/history first, AI only for unknown rows, with accept/reject and optional reusable-rule creation. See [AI setup and API contracts](docs/AI-IMPORT.md).

## Planning first pass

- **Budget:** choose a planning month, create Fixed/Flexible/Non-monthly category templates, edit one month’s amount, and optionally roll unspent amounts or overspending forward from a chosen start month. Planning limits are entered by you, not inferred from incomplete spending. Rollover uses recorded history and can overstate available money when imports are missing.
- **Goals:** a dedicated page supports target dates, planned contributions, contribution/withdrawal activity, balance adjustments, and spending from any account. Allocating savings does not change account balances or create income; a purchase from a goal creates one expense. Target-date monthly amounts are simple required-allocation estimates.
- **Recurring:** detect candidate weekly/biweekly/monthly/quarterly/yearly patterns, inspect amount changes and older patterns, then confirm amount/date/account in the bill form. Detection never creates bills automatically. Mark paid advances a bill schedule and records payment metadata; it does not create another purchase or change an account balance.
- **Transactions:** saved views belong to the signed-in profile. Bulk edit category/owner/tags/report visibility on full unsplit records. Pending and hidden records remain visible, but do not contribute to posted spending, income, budget usage or recurring detection. Changes, reviews, splits and applied rules have local activity history. Split parts must match to the cent.
- **Reports:** filter dates/accounts/categories, choose a report type and chart, and click a trend period or breakdown to open matching transactions. Imported monthly counts and account coverage are observations, never a certification that the file is complete.
- **Forecast / investments:** save several named savings scenarios and edit holdings. Unknown holding cost basis stays unknown, so Pulse does not invent an investment gain. Holdings and account balance snapshots remain separate; this is not a market-return calculation or live price feed.

### Incremental transaction CSVs

The import preserves source IDs, original statements, pending/review metadata and source owner names. A full owner name that unambiguously matches an existing profile’s first name maps to that profile without creating another profile. Original owner text remains in the source record. Reimports add new source IDs without replacing historical transactions; a source ID that changes from pending to posted can update that status without overwriting manual notes or classifications. Changed source IDs are not automatically assumed to represent the same purchase.

For an authorized local import with an automatic pre-import SQLite backup:

```bash
node scripts/import-transactions.js "/absolute/path/Transactions.csv" --commit --exclude-account "Account to omit"
```

Omit `--commit` to stage only. Explicit account exclusions become defaults for future previews, where individual rows can still be deliberately included. The command keeps existing account balances unchanged and retains an import record plus original parsed rows. The browser review flow remains the normal route for AI suggestions. CSVs are treated as data, not instructions.

## Storage: SQLite for records, CSV for exchange

Pulse now stores its live records in **`data/pulse.sqlite`** using Node's built-in SQLite support. Use **Node.js 24 or newer**; no separate database server or SQLite package installation is needed. Docker uses Node 24 as well.

```bash
npm install
npm run db:setup
npm start
# Open http://localhost:8080
```

`npm start` also initializes the database automatically. On the first run, existing `data/db.json` records migrate with their IDs, profiles, sessions, and metadata intact. A timestamped `data/db.pre-sqlite-*.json` backup is created before migration, and the original JSON remains untouched. Malformed JSON stops migration rather than resetting your data. Once migrated, SQLite is authoritative: editing the old JSON will not change the app.

Tables separate profiles, sessions, accounts, transactions, goals, budgets, bills, holdings, loans, transfers, balance snapshots, balance-import reviews/source rows, transaction rules, staged transaction imports, goal activity, bill payments, transaction edit history, saved views/scenarios, attachment metadata, and category definitions. Integer-cent SQL columns expose account/transaction amounts; imported historical amounts are stored as integer cents. Per-record JSON preserves legacy metadata and nested fields such as splits. This is a compatibility migration, not a fully normalized accounting ledger. Each save is an atomic SQL transaction; WAL mode supports readers during writes. Revision checks prevent a stale process from overwriting another process's changes.

### Importing balance history

Import → Account balances & history accepts `Date,Balance,Account` CSV files. Uploading stages the rows without changing account balances. Review account types and owners, confirm that amounts are already CAD, and choose whether to include each account, exclude it, or keep only its history. Native-currency USD amounts must be converted before this importer is used. A USD-looking name alone is not a reliable indicator of the export's currency.

Negative balances on credit/loan accounts convert to Pulse's positive-amount-owed convention; negative cash balances remain overdrafts. Exact-name matches keep their existing account IDs. Existing observations on the same date and newer current balances win over imported balances. Reimporting the same file does not duplicate snapshots or accounts. This does not create transactions, holdings, interest rates, payment schedules, or original loan principal amounts that the CSV does not provide.

To stage a file from the command line instead:

```bash
npm run db:setup -- --balances "/absolute/path/to/Balances.csv"
```

Closed/history-only accounts contribute zero after their last recorded day and are hidden from current account totals. For an older account kept open, its last known value continues to contribute until you update it. CSV source rows and import decisions remain saved for reference.

### Backups and recovery

```bash
npm run db:backup
npm test
```

Backups use SQLite's online backup API and go into `data/backups/`. If receipt files exist, `db:backup` copies them to a companion `<backup>.sqlite.attachments` directory; restore its contents as `data/attachments/` alongside the database. Payroll originals in `data/payroll-documents/` are copied to a `<backup>.sqlite.payroll-documents` companion directory; restore those contents alongside the database too. Source screenshots in `data/imports/` are copied to a `<backup>.sqlite.imports` companion directory, which must also be restored. Financial JSON exports do not include file contents. The Import page's backup download remains a portable JSON export of financial records; it excludes profiles/sessions. To restore a full SQLite backup, stop Pulse, preserve the current `data/` directory, and restore the backup as `pulse.sqlite` in a fresh data directory. Do not pair it with another database's `-wal` or `-shm` files. You can point `HF_DATA_DIR` at the restored directory. To use the legacy JSON with the new app, start with a fresh data directory containing that JSON, which will be migrated again.

Keep `data/` on a persistent local volume. SQLite files, source records, JSON backups and SQLite backups are git-ignored and excluded from Docker build context. If Pulse later needs multiple application servers or heavy concurrent writes, evaluate PostgreSQL.

## Existing features
- **Every transaction categorised 5 ways:** date, merchant, amount, category,
  account *and* person. Change category or person in the Transactions
  detail drawer. "Uncategorized" rows are flagged. Person comes from the CSV if present,
  otherwise from who owns the account (set account owners once and every
  transaction on that account counts as that person).
- **Dashboard by Day / Week (Mon–Sun) / Month / Year** with Prev/Next:
  income, spending, net, savings rate, **pie chart** by category,
  **Sankey flow** (income by person → household → categories + saved),
  breakdowns by person and by account, and an income-vs-spending trend.
- **Budgets & buckets:** a monthly limit per category with spent / remaining /
  % used and a clear **over or under** flag, plus buckets (envelopes/goals like
  Emergency fund, Trip) with target, current amount and progress.
- **Bills — fixed & variable:** rent (fixed) vs utilities (variable, with
  typical amount + last actual), next due date, frequency, autopay, pay-from
  account, overdue flags, "Mark paid" (advances the due date), monthly totals
  for fixed vs variable, and total due in the next 30 days.
- **Investments across all accounts:** holdings with account, person, current
  value and cost basis; total invested, gain/loss, by-account totals, and an
  allocation pie by asset type.
- **Loans & who you owe:** original amount, balance, APR, monthly payment —
  with **% paid off, progress bar, months remaining and estimated payoff date**.
  A combined "Who do I owe money to?" list: loans + credit card balances +
  overdue bills, with a grand total.
- **Do I have enough in chequing?** For each chequing account: balance minus
  bills + loan payments + credit-card minimums due in the next 30 days =
  **safe-to-spend**, with an explicit *Enough ✓ / NOT enough — short by $X*.
  Unassigned bills are counted against your first chequing account.
- **On your phone:** it's a PWA — host it with HTTPS, open it on your phone,
  "Add to Home Screen", and it installs like an app. The Funds Check is on the
  Dashboard and has its own tab: enter a purchase amount before you buy and it
  answers yes/no based on safe-to-spend, not just the raw balance.

## New in v3 — splits & transfers
- **Split a transaction:** Transactions → **Split** on any row. Enter parts as
  positive amounts; they must add up to the full transaction exactly (the app
  refuses a split that doesn't, so nothing is lost or double-counted). Each part
  gets its own category and person, and the dashboard/budgets count the *parts*.
  Example: Costco −$200 → Groceries $120 (Timothy) + Household Supplies $80 (Partner).
- **Transfers are not spending:** Transactions → **Mark transfer** on any row
  (e.g. a Monarch import that is just money moving between accounts) excludes it
  from income/spending.
- **Record a transfer** (Transactions page, bottom card):
  - *Between accounts* — chequing → savings, paying a card, etc. Optionally
    updates both account balances (credit accounts: paying one reduces what's owed).
  - *Lent / covered* — one partner covered the other. Creates a balance:
    "Partner owes Timothy $50", shown on the Dashboard and Transactions page.
  - *Payback* — reduces that balance. Deleting a transfer undoes its balance effects.

## Does this have to run on my PC?
It has to run *somewhere* — but not necessarily your PC. Your options:
| Where it runs | Phone access | PC must stay on? | Cost |
|---|---|---|---|
| Your PC, `localhost` only | No — PC browser only | Yes, while you use it | $0 |
| Your PC + home Wi-Fi (PC's local IP) | At home only | Yes | $0 |
| Your PC + **Tailscale** | Anywhere, private | Yes | $0 |
| Cloud host (Fly.io / Railway / Render / a $5 VPS) | Anywhere, always on | **No** | ~$0–5/mo |
For checking funds *while shopping*, cloud or Tailscale is the practical
choice — a PC-only copy is asleep/off exactly when you're at the store.
The code and database are portable. To move hosts, stop the app and copy `data/`, or restore a SQLite backup on the new host.

## Design system — current owner direction

Updated 2026-11-03: the owner's latest direction is **Pulse**, with a blue-tinted, multicolour background inspired by abstract desktop wallpapers. This supersedes the earlier Glance name and purple-only direction. Avoid bank-like green branding.

- Dark mode combines neutral slate surfaces with blue, lilac, and rose ambient colour fields. Light mode uses the same colour placement with luminous pastel hues and white panels, so both modes share the same atmosphere. Saved theme preferences win; new devices default to dark.
- Dashboard panels remain opaque for readable amounts. Summary panels use a subtle three-colour blend in both themes.
- The supplied dollar/pulse symbol is recreated as transparent SVG paths in `public/assets/pulse-logo-light.svg` (dark mark) and `pulse-logo-dark.svg` (white mark). A separate SVG app icon supplies its own dark background. CSS selects the correct mark for the theme.
- Profile tiles use blue, lilac, and rose gradients with white initials.
- Preserve the desktop sidebar with Settings at the bottom and scrolling mobile navigation.
- Use IBM Plex Sans for body and amounts, with tabular numerals. Fraunces is reserved for expressive headings. Fonts are self-hosted.
- Use the local SVG navigation icon family. Compact controls use 38px heights, with extra space around touch controls; keyboard focus remains visible. Respect reduced-motion preferences.
- Income and spending must remain understandable through labels and signs, not colour alone. Blue marks controls and progress; rose marks errors/over-budget states; amber marks caution.
- Sun and moon icons select Light and Dark, with accessible labels and pressed states matching the displayed theme. Switch instantly.
- Stay with vanilla HTML/CSS/JS, without a build step. Styles and theme tokens live in `public/styles.css`; interactions and chart colours live in `public/app.js`.
- `server.js` provides the atomic `/api/buckets/:id/spend` endpoint. Account balances remain manual snapshots.

## Accounts — the one rule to know
- chequing / savings / investment / cash: **balance = what you have**
- credit: **balance = what you owe**, plus a minimum payment and which
  chequing account pays it — that's what feeds the coverage check.
Balances are yours to keep current (open an account under Accounts, then select Edit account).
There is deliberately **no bank connection** — same snapshot model as v1.

## Run it
```bash
docker compose up -d --build     # then open http://localhost:8080
# or:  npm install && npm start
```
Open it and you get a Netflix-style profile picker: **"Who's using it?"**
Tap your name (or your partner's) and you're in — **no password, by the
owner's choice (v3.3)**. First run, add a profile by name; both profiles
see the same shared household data. The old email/password endpoints still
exist on the server for older accounts, but the UI no longer uses them.

## Security — read this, it matters now that there is no password
Anyone who can reach the app can tap a profile and open your household
finances. That is the trade-off of the password-free picker, and it is
acceptable ONLY on a private network:
- **Safe:** localhost, or your home Wi-Fi only, or behind Tailscale.
- **NOT safe on its own:** a public cloud URL with no other protection.
  If you host it publicly, put proxy-level authentication in front of it
  (or restrict `/api/profiles` and `/api/profiles/select` at your proxy)
  — otherwise anyone who finds the link is in.
- After you've both signed up, restrict profile creation at your proxy
  too, or anyone reaching the app could add a profile (they would still
  only see the same household data — there is no per-profile privacy).

## Try it safely first
"Load sample data" (Dashboard) seeds a fake chequing account ($3,250),
a Visa, a TFSA, budgets, buckets, bills, two ETF holdings and two loans, plus
a fake month of transactions — so every page works before you touch real data.
"Remove sample data" deletes only the sample items.

## Hosting notes
- Persist `data/` (including `pulse.sqlite` and its WAL files) — attach a
  volume at `/app/data` on cloud hosts or data vanishes on redeploy.
- Use HTTPS if it's internet-reachable (Fly/Railway/Render include it, or use
  Tailscale). Passwords are scrypt-hashed; sessions are HttpOnly cookies.
- Anyone who registers on your instance sees the household data (by design,
  for a couple). After you've both signed up, restrict `/api/register` at
  your proxy or keep it on a private network.
- Backups: use `npm run db:backup` for a complete SQLite backup, or download a financial JSON export on the Import page.

## Monarch CSV
Desktop Monarch → download transactions CSV → Import tab → review staged rows → Import selected transactions.
Recognised columns (case-insensitive): `Date, Merchant, Category, Account,
Amount`, optional `Person/Owner, Notes, Tags`. Duplicates are skipped;
transfers and credit-card payments are excluded from income/spending totals
so purchases aren't double-counted.

## Layout
```
server.js    Express API — auth, import, dashboard, budgets, bills,
             investments, loans, coverage/funds-check (no DB server needed)
public/      Vanilla JS frontend + PWA (manifest + service worker), no build step
lib/         SQLite storage, balance import, and account-history calculations
scripts/     Database setup/staging and online SQLite backups
data/pulse.sqlite  Your live database — created on first run, git-ignored
```
Stack is deliberately boring: Node 24 + Express, one dependency, built-in SQLite storage.

## Interface standards and transaction money movements

Fields and dropdowns use a 38 px height and 9 px radius. Multiline notes grow naturally; checkboxes retain their compact size. Spacing uses 4/8/12/16/24/32 px steps and panels use a 16 px radius. Button contents stay centered without hover movement. Desktop navigation scrolls independently, can be pinned or revealed from the left edge, and uses an off-canvas drawer on phones. Clicking outside a transaction drawer closes it.

Transactions keep an editable `displayName` separately from their immutable `originalName` and source statement. A clear name can stay the same; no AI call is required for naming. Subcategories have editable symbols and share their parent category’s colour; parent groups stay in the category picker. Only explicit unresolved review flags appear on rows. Transaction actions, recurring setup, optional tags/goals and attachments live under ⋯. MCC sits below Category. Company logos are local assets where available; other merchants use initials. Local merchant SVGs originate from [homarr-labs/dashboard-icons](https://github.com/homarr-labs/dashboard-icons); trademarks belong to their respective owners.

Transactions → Transfers records new account movements. Existing imported entries are linked from either row’s ⋯ → Link account transfer: opposite signed, equal amount, different accounts. Candidate suggestions look within seven days. Linking excludes both sides from income/spending and never changes current balances. Paying $100 from checking to a card decreases cash and card debt by $100, leaving net worth unchanged. Imported snapshots remain authoritative. Applying a new manual transfer to current balances is a separate, unchecked-by-default option; historical entries older than snapshots cannot apply again. Removing an applied manual transfer is blocked if balances have since changed.

For shared purchases, open an outgoing expense and choose ⋯ → Someone owes me a portion. The original charge stays intact, split spending is assigned to the payer and the other person, and a separate claim tracks what is owed. Transactions → Shared spending links an incoming e-transfer to one or more claims. Only the allocated repayment portion becomes a transfer; any unallocated amount retains its original classification. Repayments do not create income or repeat the original expense. Claims are tracked separately and do not inflate account balances/net worth as additional assets. Unlink a repayment before deleting a claim; unlink a money movement before changing its financial allocation. Shared and linked rows are excluded from bulk categorization/rule application.

A metadata-only migration is available with `node scripts/refresh-transaction-presentation.js /path/to/Monarch-transactions.csv`. It backs up SQLite, fills missing display/original names, and recovers explicit source review flags by Monarch ID, while checking that amounts, categories, owners, source statements and balance history stay unchanged. Restart the server after running it.

## Compact transaction workspace and Cash Flow

The current compact control standard is **38px height / 9px radius**, with 12–16px form gaps. Transaction filters use labelled fields, amount/date pairs, a scrollable panel contained within the viewport, a persistent Done action and removable active-filter chips. Export CSV sits beside Add transaction. Category and Account remain visible columns; the former Columns menu is removed. Click a display name, subcategory, owner badge or amount to edit it in the row; Enter/blur saves and Escape cancels. Split portions and linked money movements protect their financial allocation.

The detail header holds Create rule, review flag, ⋯ and Close. Tags, goal and attachments are in the body. ⋯ contains contextual money-movement actions with explanations, recurring setup, Copy transaction ID and Delete. IDs are stable local transaction IDs; imported Monarch IDs and original source text stay stored separately. Transfers and repayments are secondary **Manage** destinations instead of primary transaction tabs.

Categories supports adding a subcategory (including a new parent category), renaming and editing directly in the row, choosing an emoji/symbol, and setting the shared parent colour. Renaming updates saved transaction/split references, budget/bill categories and rule conditions/actions without changing amounts or original statement names. Original import stages remain source records. Future imports recognize previous names through saved aliases. Category charts use the same saved parent colour.

Cash Flow has monthly/quarterly/yearly selectable periods, an income/expense timeline and net-savings line, account/date filters, four summary figures, and category/subcategory/merchant breakdowns. Bar charts and a balanced Sankey are alternative views of the same posted, owner-scoped data. Transfers, pending rows and hidden rows stay excluded; refunds offset spending and income reversals offset income. Zero-activity periods are explicitly unverified import gaps. Sankey “From existing funds” explains a period shortfall rather than inventing an income transaction. Negative category totals appear as refunds/reversals on the appropriate side of the diagram. Charts do not mutate account balances.

## Searchable rows, category lifecycle and entity details

Transaction name/subcategory cells open searchable pickers with existing values and an inline Create action. New subcategories inherit a parent’s colour; parent colour controls live on the Categories group headings. A subcategory row offers Edit and Delete. Delete always opens a confirmation and reports usage. Used categories require a same-type replacement before any mutation. Transactions/splits, budgets, recurring payments, rules and transfer/shared-purchase restoration references are reassigned together. Original statements, transaction IDs and amounts stay unchanged; bank accounts are not moved. A tombstone redirects later imports using the deleted name, while committed import stages remain original source evidence.

Small arrows beside names/subcategories navigate to `/transactions/merchants/:name` or `/transactions/categories/:name`, with a period chart, filtered ledger and summary. Account arrows open the existing account detail route. Entity pages support reload and browser history. Daily/weekly/monthly/quarterly/yearly detail charts retain empty periods and exclude transfers from income/spending totals.

Filters uses a searchable sectioned dialog for Categories, Merchants, Accounts, Tags, Goals, Owners, Amount and Other. Choices are drafted until Apply; Cancel leaves the current view unchanged. Parent category checkboxes select children. Applied selections appear as removable chips and carry into CSV export and saved views. Split filters retain only matching amounts. Date has its own presets and custom range dialog. Manage holds occasional transfer/repayment tools; its popup is no longer clipped by the tab bar.

## Thirty-period detail charts and continuous transactions

Merchant/subcategory detail charts display 30 calendar buckets at a time. Earlier/later controls move by 30 periods, short date labels are thinned to avoid overlap, and bars use red for net spending and green for net income/refunds. The dashed line is average net spending across the 30 displayed calendar periods, including periods with no imported activity. This is separate from the summary’s average transaction magnitude. Clicking or keyboard-activating a bucket filters the ledger and summary to that bucket’s inclusive date range; the full chart window remains visible. Click the selected bar again or Show all dates to clear it. Other filters still apply.

Summary contains exactly Total transactions, Largest transaction, Average transaction, Total spending, First transaction, and Last transaction. Largest/average transaction use absolute amounts from the full filtered set, while spending keeps the normal transfer/refund/pending rules. Dates use month names. Summary closes on navigation back to Transactions; chart refreshes and loading more rows do not force it open. Source reconciliation and import-coverage explanations have been removed from this panel.

The ledger loads 200 rows per request as the bottom approaches. It pauses at 2,000 loaded rows per view; Continue loading allows another 2,000. This is a responsive rendering guard rather than a data/import limit. Filtering resets the batch state. Summary and CSV export cover the full filtered set, and selection is preserved while additional rows arrive. Duplicate IDs are not appended. A failed additional request offers Retry.

Reference behaviour was checked against Monarch’s [Using Reports](https://help.monarch.com/hc/en-us/articles/21846787088916-Using-Reports), which documents trend-bar clicks filtering the related transactions, and its [May 2025 product update](https://www.monarch.com/blog/monarch-extension-and-more), which documents average lines. The 30-bucket window, averaging formula and loading guard above are Pulse implementation choices.

## Sticky transaction tools and stable editors

Search, Date and Filters are in the sticky transaction header immediately before the owner switcher. Light/dark controls live in the sidebar above the signed-in profile and Settings. Summary is an inline collapsible section inside the ledger card. The empty Views selector is removed; existing saved filters are available under Filters → Other.

Date and Filters use anchored **non-modal** panels: the ledger stays visible and scrollable, opening preserves scroll position, and clicking outside closes the draft. Panels are positioned before opening to prevent native dialog autofocus from scrolling the document. Destructive confirmations and transaction-detail dialogs retain their modal behaviour.

Inline inputs overlay their cells while the table column widths are held. Merchant lookup uses existing transaction display names; subcategory lookup lists the current parent first and all other parents below, and searches by subcategory or parent name. Pending is a visible text label rather than an unexplained dot. The larger unresolved-review flag has a dedicated column immediately after the checkbox. Detail arrows remain visible without hover.

Empty/net-zero chart periods have no hit region, keyboard target, click handler or tooltip. Nonzero bars show a bounded custom tooltip with dates, the merchant/subcategory, signed net amount, spending and income; the native long browser tooltip is removed. Existing average-line and click-to-filter semantics remain unchanged. All these changes leave saved financial records untouched.

## Shared header and sticky ledger controls

Accounts now uses the same header area for its existing search, sort and filters; Transactions keeps Search, Sort, Date and Filters beside the owner switcher. Controls are moved with their existing handlers, so account and transaction filtering remain separate. Sidebar and header have opaque theme-specific fills, borders and clear separation from the scrolling workspace. On desktop, an unpinned sidebar remains as a 60px icon rail and expands on hover; pinning restores the full labelled sidebar. Phones retain the off-canvas navigation.

The body’s Transactions / Edit multiple / Columns command bar sticks immediately below the measured header height. Selection actions stay with it when rows are selected. Columns are optional local visibility preferences for category, account and owner; they do not modify records. The sidebar, header, command bar and transaction list retain independent scrolling behaviour where appropriate.

Merchant/subcategory pickers have an additional search field inside the popup. Desktop dropdowns can grow to 560px when space permits; filtered results shrink to their content. Merchant results are no longer truncated at the first 200 names. All existing names in the current owner view can be scrolled and searched. Category options remain grouped with the current parent first. Selection still preserves original bank statement names, amounts and account IDs.

## Rules after row edits

Saving an inline transaction name, subcategory, owner, or amount first saves that row, then offers to create a rule. Dismissing the prompt keeps the single-row edit. The rule opens in a responsive popup with explicit matching conditions and updates. Amount changes can supply exact matching conditions; rules never rewrite amounts. Saving a rule enables it for future CSV imports and opens a separate existing-transaction preview. Existing records change only after Apply; Future imports only leaves them untouched. Preview is scoped to the current owner view and limited to 2,000 eligible records per application.

Returning from transaction tools to All clears local filters and the entity chart together, reloads the ledger, and closes Summary. The global owner selection is retained.

Sidebar navigation uses the header navigation button to expand or collapse on desktop, with hover expansion from the compact icon rail. The separate pin button is removed. Collapsed navigation icons are centered horizontally and vertically; appearance controls sit beneath the Pulse brand, separate from profile and Settings. Transaction sorting lives in the sticky ledger toolbar beside Edit multiple and Columns.

The expanded sidebar shows only the inactive theme icon beside Pulse; the collapsed rail hides appearance controls. Settings uses a gear. Ledger actions, sorting, and transaction tool tabs share IBM Plex Sans and consistent weight/height. The transaction actions menu includes Create rule. The rule popup has Settings and unsaved Preview changes tabs, two columns of expandable switches, text matching operators, signed amount comparisons/ranges, owner/account/category conditions, and label/owner/tag/visibility/review/goal/fee-split updates. Add tags preserves existing tags. Saving still offers a separate opt-in preview/apply step for existing records. Legacy rule conditions remain supported.

Cash-flow Sankey ribbons are closed filled paths whose widths match the amounts at each node. Both sides reconcile in cents through the center; refunds/reversals stay explicit, and spending shortfalls are labeled From existing funds. Each side displays up to 11 named entries plus an Other total when needed; the full breakdown remains in Bar chart view, and the Other tooltip lists its members. Label rows have minimum spacing independent of their financial thickness, preventing small merchants from overlapping or stretching the diagram indefinitely.

The rule editor automatically previews eligible existing transactions after conditions/actions change (350 ms debounce). The live count and Preview changes tab update without requiring a rule name or saving a rule. Counts exclude records already in the desired state and protected split/shared/linked transactions, and follow the current owner view. Empty or incomplete criteria show guidance instead of a misleading count. Stale responses are discarded when editing or closing the popup. Saving/applying remains an explicit separate action.

## Reports and Financial tools

Reports at `/reports` uses posted, visible, owner-scoped split portions and excludes transfers/card payments, following the same financial classification as Cash Flow. Summary and trends reconcile in cents with the income/expense breakdown. Refunds reduce expenses; reversals reduce income. Choose Cash flow, Spending or Income, then Trend bars, Breakdown or Sankey, with monthly/quarterly/yearly trends. Category & group Sankey routes category leaves through parent groups; small leaves combine within their parent without changing totals. Filters include all time/YTD/last twelve months/custom dates, account and category. Breakdown/trend clicks drill into Transactions. PNG exports embed local fonts; CSV exports follow the report tab. Named report configurations live in SQLite `report_views`, belong to the signed-in profile, and use the global owner selection when loaded.

Financial tools at `/tools` replaces Forecast in the main navigation. Forecast keeps `/forecast` and its existing saved scenarios, with a return link to Tools. The tools home contains a 2026 Ontario employee income-tax/take-home estimate (basic credits only), separate CPP/CPP2/EI cap progress and projected last-deduction dates, and TFSA/FHSA room worksheets. These are manual scenarios, never bank transactions or balance changes. Calculator drafts remain in memory per selected owner for the current session; Everyone is a separate one-person hypothetical scenario, never a combined household tax return.

Income estimates assume one employer, full-year CPP/EI eligibility, age 18–64 and Ontario employment. They include federal/Ontario brackets and basic personal/employment/CPP/EI credits, enhanced CPP deductions, Ontario surtax, health premium and basic tax reduction. They omit LIFT, refundable benefits, spouse/dependant/age credits, bonuses, Quebec, pensions and self-employment. Annual tax liability is averaged over pay periods; this is not a payroll-withholding or tax-filing engine. Optional savings deductions reduce taxable income but are not subtracted from the displayed before-savings take-home. Rate source: [CRA 2026 Ontario payroll tables](https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032on-jan/t4032on-january-general-information.html), checked November 7, 2026. The CPP tracker models constant future pensionable/insurable gross with no exempt periods and stops projecting at December 31, 2026.

Room worksheets require verified January 1 room, complete contributions and (for FHSA) RRSP transfers and lifetime amounts. They never infer room from account balances or incomplete imports. TFSA withdrawals are shown separately as room restored next January. FHSA calculates standard remaining participation/lifetime room and omits special re-participation/excess corrections. Sources: [CRA TFSA calculation](https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account/contributing/calculate-room.html), [CRA FHSA participation room](https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/first-home-savings-account/contributing-your-fhsa.html).

## Payroll: understand each pay statement

Payroll has its own sidebar entry and `/payroll` route. It is separate from financial scenarios and bank transactions. Upload PDF/PNG/JPEG (up to 8 MB and twenty PDF pages), paste text, or add manually. A reviewed statement records employer/owner/pay date/period/frequency, current-pay and YTD fields, gross-to-net reconciliation, source evidence, and an optional link to an existing income deposit. Payroll never creates transactions or updates account balances. Matching requires the same net amount, a pay date within five days, the statement owner’s income deposit, and no other linked statement. Source access follows the requested owner view.

Extraction is local, without an AI API/key. macOS uses PDFKit for selectable PDF text and Apple Vision for images/scanned pages. The native helper compiles once using the installed Xcode command-line tools; first use can take one or two minutes, then subsequent reads reuse the compiled helper in a private temporary directory. Linux uses Poppler (`pdfinfo`, `pdftotext`, `pdftoppm`) and Tesseract. The Docker image installs those utilities and English OCR data. Other Linux installations can install `poppler-utils` and `tesseract-ocr` through their package manager. If local tools fail, the draft stays reviewable and fields can be entered manually. No silent cloud fallback exists.

The deterministic label reader identifies common explicit labels and a clearly labelled Current/YTD column order. Unknown/ambiguous dates, conflicting amounts, missing labels and unfamiliar layouts remain blank for review. It does not infer owner, invent missing amounts, or treat document text as instructions. Common English payroll layouts are the first supported mapping set; OCR recognition is broader than automatic field mapping. Amounts currently use CAD and ordinary nonnegative earnings/deductions. Employer pension amounts are informational and do not reduce take-home. Combined income tax and federal/provincial detail are not counted twice.

Users must check an explicit verification box before saving. Gross plus reimbursements minus total deductions must reconcile to net pay, and known deduction components cannot exceed that difference. Unclassified deductions stay visible. YTD amounts use the latest statement per person/employer/year, never the sum of repeated cumulative figures. Duplicate file hashes per owner and duplicate payment fingerprints are rejected. Statements can be corrected, reviewed against their original document, or deleted without changing linked bank transactions. The CPP tracker can be populated from a selected 2026 statement; missing pensionable earnings and the next pay date still require entry.

SQLite tables `payroll_records` and `payroll_imports` store approved figures and unfinished review drafts. Originals live in the private `data/payroll-documents/` directory, not public assets; files use mode 0600 and authenticated no-store responses. Discarding drafts or deleting a statement removes its original file when no record references it. Financial exports omit raw extracted payroll text and unfinished drafts; document bytes are only in the data directory / complete backup. Standard `db:backup` now copies payroll originals into its companion directory. Back up the full data directory when moving hosts. Calculator/session profiles are still the existing password-free household model, not independent private user accounts.

## Unified Imports and Windows hosting

`/import` is the single Imports entry point. Choose Transactions CSV, Balance history CSV, Pay stub PDF/photo, Transaction screenshot, or Receipt/document. One file chooser adapts to the type. Account and owner selections appear only where relevant. Source account/owner values remain authoritative; the selections fill missing values, never overwrite accounts embedded in a multi-account export. Balance CSVs without an Account column need an explicitly selected existing account. Pay stubs need an employee owner and get their employer during review; they do not require a bank account. Receipts require selecting an existing full transaction and confirming the attachment preview.

Payroll Upload, account-detail Import transactions, and transaction Attach receipt/file are contextual shortcuts to this page with type/account/owner/transaction preselected. They no longer open separate file pickers. Existing validation, currency confirmation, duplicate detection, stage review and explicit Save/Commit steps remain in effect. A unified history lists transaction/balance/payroll drafts, saved imports and attached receipts, with links back to the relevant review or analysis page. Payroll remains the place to understand pay, rather than a second upload center.

The Imports page checks the processing host’s local tools. Run `npm run imports:check` on the server to print readiness for PDF text, photo OCR and scanned PDF OCR. Native Windows installations can put Poppler and Tesseract on PATH, or set `PULSE_PDFINFO`, `PULSE_PDFTOTEXT`, `PULSE_PDFTOPPM` and `PULSE_TESSERACT` to full executable paths in `.env`; see `.env.example`. Paths with spaces are passed as executable arguments without a shell. Missing readers leave manual review/text entry available and never trigger a cloud fallback. The readiness check verifies tool availability, not extraction quality on every payroll layout.

For a Windows host, the prepared Docker route uses Linux containers and bundles Poppler, Tesseract and English OCR data. In PowerShell from the project directory, run `docker compose up --build -d`, then open `http://localhost:8080`. The `./data` volume retains SQLite and documents across container recreation. Docker Desktop must be configured for Linux containers; Windows-hosted operation has not been verified in this Mac test environment. Compose forwards the optional OpenAI key/model from the host `.env` for explicitly consented transaction screenshot/cleanup features; pay-stub extraction does not use it. Windows executable paths are for native hosting and are not forwarded into Linux containers. See [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/).


## Purchase planning and daily capture

Funds Check projects daily chequing cash from a dated balance, scheduled bills and loan payments, entered pay dates, additional spending and a proposed one-time purchase. The lowest projected balance matters as much as month-end cash. Credit-card purchases use an entered payment date; a payment beyond the horizon reserves that purchase cost. Confirm full card payments and missing bills separately. Scenarios do not move money or update recorded bank balances. Tools remain available while Forecast is open, including a purchase savings target.

On a phone, **+ Expense** records the purchase, account, category and optional camera receipt immediately. It counts toward the budget while awaiting bank confirmation. When a bank CSV contains a possible matching expense (same account, signed amount and a date within five days), import review asks whether to confirm the capture or keep a separate entry. Confirmation preserves the original transaction ID, purchase date, notes, category and receipt, stores the bank statement/date separately, and avoids counting the expense twice. Matching is never automatic based only on equal amounts. Receipt capture currently uses manual entry of the amount and merchant; it does not require external AI.

The ENHANCE Workday pay-statement layout supports a multi-page PDF with one statement per page. Each statement is separately reviewed and saved, with a shared original PDF and page reference. Payroll does not create bank deposits. Unknown deductions and unsupported layouts still require manual review.


## Full-card-payment Funds Check

Credit-card account settings now include the balance date, latest statement closing date, that statement’s payment due date, unpaid statement amount, and payment account. Funds Check defaults to about three months and schedules the full unpaid statement separately from unbilled charges. New purchases, later logged activity, recurring bills/loans paid by card and selected-card everyday spending feed the next closing cycle. Dates repeat monthly using the entered day anchors, clamped for short months; bank holiday shifts, interest and late fees are not calculated. Always check actual statements. A blank statement amount reserves the full current balance on the entered due date and is labelled an estimate; missing cycle dates produce an incomplete result instead of an affordability verdict. Past-due unpaid statements are reserved at the forecast start.

Raw card balances and dates may be overridden for the scenario before a new CSV is available. The entered balance is assumed to include all charges through its date, so only later recorded activity is added. New manual captures remain single transactions when later bank-confirmed. These scenario overrides do not update account balances or transactions; Edit card settings saves recurring account configuration. Forecast entries can include named one-off or repeating incoming e-transfers, plus expected net pay. Incoming forecasts are not posted income or repayments in the transaction ledger. Card payments beyond the horizon remain reserved, and statement details explain each projected payment. The result shows the baseline without the purchase, lowest cash date and end-of-horizon cash.


## Airport-style purchase check

Funds Check now opens with a purchase-total field and a single Check purchase button. The expandable cash-flow setup is saved in SQLite per signed-in profile and owner view. It stores the default chequing account/card, 90/120/180-day horizon, cash buffer, biweekly net-pay anchor, everyday-spending estimate, named expected partner e-transfers, planned outgoing transfers (for example Japan travel), and recurring card charges with optional processing-fee percentages. Enter positive amounts in the outgoing-transfer UI; the saved projection treats them as withdrawals. Card and chequing balance/statement figures are saved through their account editors and refreshed from imports, rather than copied into the saved setup. Checking a purchase writes no transactions or balances.

Every quick check starts on the local browser date. Past one-time transfers expire; repeating pay and repayments roll forward from their original anchors. Charges go onto their chosen card and then into statement-payment cycles, not directly out of chequing. Current statement metadata is reused until a newer cycle is expected; later cycles conservatively reserve the whole current card balance unless actual statement details are updated. The result reports the first negative cash event/date, lowest balance, ending cash and baseline without the purchase. Missing card settings or a missing checking balance date prevent a coverage verdict. Cards with no payment account in the current owner view are flagged instead of silently omitted.

Near-term recorded deposits are conservatively reconciled against expected incoming flows, including combined/partial partner payments, to avoid forecasting both cash already received and the full expected amount again. One actual entry is not reused for multiple exact matches; ambiguous overlap adjustments are displayed for review and never modify the ledger. Named outgoing/card charges are skipped only for a unique matching recorded amount, nearby date and merchant label. Keep recurring bill/loan assignments current and do not schedule the same bill again as a custom card charge. Actual receipt-to-bank matching remains in import review. Forecast amounts are estimates, not a bank connection or a promise of future income; card interest, fees beyond entered processing fees and holiday shifts are not calculated.


## Bills and Payroll feed Funds Check

Recurring payments have one home: **Bills** (`/recurring`). Optional processing-fee percentages (for example a Chexy charge) are included in bill totals and projected card statements. Existing saved Funds Check card-charge entries migrate into Bills once, with their amount, fee, frequency and payment card preserved; subsequent checks do not create duplicate bill entries. Funds Check links to Bills and shows its saved items rather than maintaining another recurring-charge editor.

New cash-flow setups default to **Predict from Payroll**. Choose the payroll profile and, when there are multiple employers, an employer. Each check reads the newest saved statement’s take-home amount and pay-date/frequency anchor, advances weekly/biweekly/monthly paydays into the forecast, and labels them estimates. New statements update the estimate without resaving the setup. Missing statements, unsupported frequencies and ambiguous employer selections need review; old statements display an age warning. Unknown frequency is inferred only from two consecutive matching seven- or fourteen-day intervals. Semimonthly dates are not guessed. Manual pay and no-pay modes remain available. Payroll predictions never generate actual future pay statements, income transactions or deposits.


## Bills agenda and emergency cushion

Bills has Upcoming, Paid this month and Not upcoming views, household/personal groups, and 30/60/90-day windows. Fixed bills use their entered amount; variable bills display an estimate and accept an actual amount when marked paid. The compact editor handles payment account, processing fee, start/end dates, and active/paused/cancelled status. Loan payments appear directly from loan records and link to account details; do not add the same loan as a second bill. Paused, cancelled and ended bills are excluded from future Funds Check payments. Monthly dates retain their original day anchor through short months. Marking a bill paid records its status and advances its schedule; it does not generate a bank transaction.

Goals now includes an emergency-cushion planner. Confirm completed import months and explicitly choose essential categories; no category is automatically accepted as essential. Historical averages exclude hidden/pending transactions and transfers/card payments, retain actual purchase/split expenses and offset refunds. For each selected category, the plan uses the larger of the confirmed-month average and current monthly scheduled bills/loan minimums, avoiding adding the same costs twice. Unrecorded essential costs may be entered separately. The planner shows 3/6-month targets, reserved savings, gap and the monthly amount needed for an entered build timeline. Imported history is never automatically labelled complete. Income estimates name their Payroll profile or use observed imported income if unavailable; they do not guarantee future earnings.

Save the plan per profile/view, optionally create an Emergency cushion goal, and test the monthly contribution against the existing Funds Check timing forecast. The test schedules savings monthly starting the day after the first expected pay, or tomorrow if no expected pay is present; review that assumption before setting up transfers. Missing cash-flow/card metadata prevents a positive verdict. Goals earmark existing money and do not add to net worth, create another savings account or move cash. A vacation goal is optional; Funds Check can assess a trip when it arises. Predictable annual bills and repairs can use separate goals instead of being mixed into emergency money.


## Savings navigation and bill amount types

Savings is now the sidebar destination at `/savings`; `/goals` remains a compatible link and resolves to Savings. The emergency-cushion planner stays visible, while other savings goals are in an optional collapsed section. Stored goals, contributions and identifiers are unchanged. Bills explicitly labels Fixed amount versus Variable estimate and offers an amount-type filter alongside household/personal and upcoming/paid/inactive filters.

Budget remains a monthly category-and-owner spending plan. Limits are entered manually, may be overridden for a particular month, and may carry unused amounts or overspending forward when rollover is enabled. Posted/logged purchases reduce the category budget; bank-confirming a captured expense preserves that transaction instead of adding another purchase. Transfers and card payments are excluded, refunds offset spending, and future bill schedules or predicted payroll do not count as recorded transactions. An in-page explanation describes the distinctions. Outside-budget spending now checks owner as well as category, so another owner’s purchase is not treated as covered by the wrong person’s budget.


## Flexible parent/subcategory budgets

Budget now uses a hierarchy at `/budget`. A parent cap contains its subcategory allocations: for example Food & drink 800, Groceries 500 and Coffee 100 leave 200 unallocated inside the parent, rather than summing to 1,400. Child amounts above an explicit parent cap are rejected with an explanation. Parent and child planning groups can be Fixed, Flexible or Non-monthly; the summary apportions child limits and the parent’s unassigned pool without counting them twice. Income allocations are separate from expense allocations.

Inline edits affect only the selected month. Allocation settings can set values from that month forward, including versioned planning groups and rollover; historical planned amounts remain available for comparison. Removing an allocation ends it from the chosen month onward and preserves earlier plans and all transactions. Existing category budgets continue to work. Category reassignments that produce duplicate allocation records are aggregated with actual spending counted once and flagged for review. A year table compares allocated/planned amounts with recorded actuals; months with no imports are labelled rather than assumed complete.

Use Bills & Payroll opens a reviewable estimate list for the selected current/future month, including optional employer selection. It copies only selected estimates into that month and replaces matching owner/category amounts; it does not post income or bills as transactions. Estimates may be edited or excluded. Projected monthly remainder uses expected/recorded income and at least each expense allocation or spending already above it; past months show recorded actual left. Funds Check remains the date-by-date bank cash test. Parent caps, dashboard budget totals and the quick expense budget hint share the same allocation math.

Manage categories is available inside Budget: add/rename/move subcategories, edit symbols and parent colours, rename/merge parent groups, or remove a parent by moving its children into another parent. Used subcategory deletion requires confirmed reassignment of linked records. Category changes preserve original transaction amounts, accounts and statement text. The emergency cushion and stored savings goals are unaffected by budget allocations.

### Investments: holdings and reported balances
The Investments page supports current share quantities (CAD/USD) and dated reported values. Uploads → Investments accepts a holdings CSV with `Symbol,Quantity,Currency,Price` (optional `Name,Cost Basis CAD`), IBKR Open Positions CSV sections, or a PDF/PNG/JPEG statement. All imports require an investment account and explicit review before saving. PDF/photo text is extracted locally; enter and confirm the statement date and CAD account total. Broker-specific formats should be checked against their source; activity/trade CSVs are deliberately rejected. Positions replace matching quantities without creating purchases or cash transactions. Unlisted holdings remain.

Set `ALPHAVANTAGE_API_KEY` in `.env` and restart to enable optional daily stock/ETF quotes. Enable daily refresh on each holding. The running server checks hourly, caches today's quotes, and caps requests at 25 per UTC day (initial symbol/currency verification also consumes a request). Unsupported symbols/provider limits retain the previous dated value. TSX defaults to the provider's `.TRT` suffix; the provider symbol can be overridden. USD holdings use Bank of Canada's dated USD/CAD reference rate. Historical CAD cost stays fixed; account balances are not automatically overwritten by holdings because cash/unlisted assets may be missing. Corporate actions and trades require quantity updates. No brokerage credentials or trading API are required.

Sun Life and other statement-tracked accounts can use reviewed dated CAD snapshots. Charts show balance changes, not cash-flow-adjusted investment returns. HOOPP stays separate in Payroll rather than being treated as shares. Investment source documents are private files in `data/investment-documents`; `npm run db:backup` copies them to a companion `.investment-documents` folder alongside the SQLite backup. Restore that folder to the same data directory with the database. Docker forwards the optional market-data key on Windows as well.

### Merchant web lookup during import review
Expand AI cleanup in a staged transaction import and keep “Look up unfamiliar merchant names online” selected. Rules and recognized history run first. Up to 10 unrecognized rows per request (including source-categorized rows) can be researched, using only merchant descriptors for the search stage. Official business sites are preferred, cited links appear in the review, and structured cleanup proposals still require acceptance. No date, amount, account or original statement is rewritten by AI cleanup. Accepted suggestions can be saved as merchant rules for future imports. Disabling lookup keeps the existing unknown-row cleanup (up to 50). This uses the server's OPENAI_API_KEY / OPENAI_MODEL and OpenAI Responses web_search, with additional API/search usage; it is not a Google integration or a personal ChatGPT subscription connection. Provider failures or uncited search results do not save cleanup changes.

For personal ChatGPT without API billing, open the import preview → “Use my own ChatGPT” → Copy ChatGPT prompt (or download it). It contains up to 50 unrecognized merchant descriptors, stable draft row IDs and the current category catalog. Paste ChatGPT's JSON response into the same draft and choose Load suggestions for review; accept/reject the proposed changes before importing. Original amounts, dates and accounts stay untouched. The prompt asks for web-supported brand names where browsing is available. No rows are sent automatically. Copied prompts contain statement text and tags; inspect before sharing. For another batch, resolve the current proposals and copy a new prompt.

Profile selection has a brief blue/rose arrival animation: the chosen avatar moves to centre, emits a soft pulse and welcomes the selected person before revealing the app. It runs only on an explicit profile click, prevents double selection, cleans up on failure, and honours reduced-motion preferences. Automatic single-profile entry and existing sessions skip it.

### Personal dashboard and navigation
Everyday defaults put Accounts and Transactions just below Dashboard, then Funds Check, Budget, Bills and Imports. Dashboard prioritizes Funds Check, net worth, budget, upcoming bills and recent transactions; secondary breakdowns, the Sankey, largest expenses and welcome banner are hidden initially. Customize opens from the dashboard heading, the sidebar or Settings. Choose visible items and use accessible up/down buttons to reorder either list. Save stores the layout in the signed-in profile's SQLite preferences, independent of the household viewing filter and shared across devices. Reset to defaults restores the suggested draft; Save applies it. Settings and the Dashboard navigation link remain reachable, and hiding items never deletes records or disables their URLs.

### Direct layout editing
Dashboard/Sidebar Customize now enters an editing mode on the actual page. Drag a dotted handle with a mouse or touch; focused handles also accept arrow keys. Widget controls offer Full width/Standard width and Hide. The Show/hide items list remains available for restoring hidden items. Save layout persists both order and widths for the signed-in profile; Cancel restores the starting draft. Settings' layout list remains available as an accessible alternative.

### Password sign-in setup (before remote access)
The existing private profile-picker mode remains available until you choose credentials. Open Settings → Sign-in & security, enter your email and a unique password/passphrase of 15–256 characters, then Save sign-in. This immediately requires credentials household-wide, rotates your session and invalidates all old password-free sessions. Existing financial owners and records are preserved. Use Create setup invitation for the other existing owner and share that private one-use link (24-hour expiry); they choose their own email/password without creating duplicate profiles. The circular picker then asks for a password, or use Sign in with email. Public registration is closed once profiles exist. Changing an existing password requires the current password and ends that profile's other sessions. Emails are identifiers only: no verification mail or emailed password recovery is configured. Retain host access and backups for recovery.

Password hashes use Node scrypt with per-user salts; session tokens are stored hashed. Credential attempts are rate-limited and browser mutations reject mismatched Origin hosts. Credentials and invitation tokens must never be logged or put into example files. Configure HTTPS for remote hosting and set `PULSE_SECURE_COOKIES=true` when HTTPS is terminated at a reverse proxy; preserve the external Host header. Household owner filters remain shared finance views, not private per-owner record authorization. MFA/passkeys, email recovery and deployment hardening are separate work, so do not treat adding a password alone as a complete internet deployment.

Widget presentation can also be changed in Customize mode. Recent activity, upcoming bills, budgets, trend and largest-expense widgets offer Compact/Detailed views; compact lists show up to three entries with a details link. Net worth and investment cards can hide supporting explanatory text in compact mode. Preferences persist per profile alongside order and width. Cancel restores the original draft, including visibility, width and view choices. Drag handles support touch/pointer input, keyboard arrows and edge scrolling on long pages; the edit toolbar stays available while scrolling.


### Optional profile PIN
After setting a password, open Settings → Sign-in & security → Quick sign-in PIN. Enter your password, a 6–12 digit PIN and its confirmation. Password and PIN are alternatives in the profile sign-in dialog; email sign-in continues to use the password. PINs use a separate salted scrypt hash and retain leading zeros. Five wrong PIN attempts lock that profile's PIN for 15 minutes, with the counter/expiry persisted in SQLite. Password sign-in remains available and clears the PIN lock. Setting, replacing or removing a PIN requires the password and ends that profile's other sessions. Changing the password removes the previous PIN; set it up again if desired. PIN login is optional quick access, not a second authentication factor.

Layout edit mode reserves the full desktop sidebar gutter even when navigation normally collapses. The sticky edit bar stays inside the main content and below the header; widget controls occupy a full-width row above content, including flex-based net-worth cards. On phones the sidebar remains an optional drawer, and the floating expense shortcut is hidden while arranging widgets.


Sidebar and dashboard customization are separate. The icon-only control above the sidebar profile edits only navigation, with drag handles and Save/Cancel controls inside the sidebar; it does not change the current page. Dashboard Customize edits only dashboard widgets. Each visibility dialog and Reset applies only to its section. Saving merges that section into the latest stored preferences so dashboard edits do not overwrite sidebar choices, and vice versa. Settings provides separate buttons for the two editors.


### Canadian vehicle valuations
Open an Other assets account (such as your car), then Vehicle market value. Save the 17-character VIN, current kilometres and Canadian postal code; retail dealer type and certified status are optional comparison settings. Set `MARKETCHECK_API_KEY` in the host `.env` and restart to connect the Canadian MarketCheck Price Base API (`/v2/predict/car/ca/marketcheck_price`). Provider plan/credits may be required. No provider key is stored in the browser; queries require data-sharing consent and run manually or through your optional monthly schedule. Inputs are kilometres, converted to miles for the provider; returned values are CAD. Generic/null valuations are not substituted for an exact VIN estimate. Results are dealer-retail predictions, not guaranteed private-sale/trade-in proceeds.

Estimates with the same details reuse the previous result for 24 hours. There is no scheduled/automatic billing loop. Review the source/date/value and choose Use as account value to update that asset's recorded value and balance history; the lookup itself does not change net worth, loans or spending. Vehicle equity remains car value minus the separately recorded auto loan. Changing vehicle details invalidates applying an older estimate for different inputs, and newer dated balances are protected. If the key/provider is unavailable, manual account editing remains available and prior balances are preserved. No live provider request has been made as part of setup.

Provider reference: https://docs.marketcheck.com/docs/api/cars/market-insights/marketcheck-price

Vehicle quotes also support `CARDOG_API_KEY` (https://cardog.app/pricing): 50 free credits/month, quotes cost 5 credits, free tier stops at its allowance. Cardog uses a derived VIN configuration code and returns Canadian comparable asking-price medians, not mileage-adjusted resale values. Quotes require at least five listings and an as-of date within 30 days. MarketCheck eligibility and additional fees depend on your plan.

Monthly vehicle checks are optional per account, on the first of each month (Toronto). The running server checks hourly and at startup, with at most one scheduled attempt per account/calendar month; it does not replay missed months or automatically retry failures. An explicit separate option applies the quote to the asset balance; otherwise quotes are saved for review. Update your odometer as needed. No loan balances or transactions are changed. API keys stay on the server.

### Revised transaction CSVs
Transaction exports include a permanent `Pulse Transaction ID`. The normal transaction importer automatically recognizes it, independently of bank IDs. Known full-record IDs stage before/after suggestions for merchant, category, tags and notes; unchanged rows are skipped, and only accepted edits are applied at final confirmation. Bank rows without a Pulse ID retain normal new/duplicate handling. Unknown, repeated, out-of-scope IDs and changed dates/amounts/accounts/original statements are flagged and never inserted as new transactions. Partial split exports cannot update the parent. Category edits on split/linked transactions require transaction details. Missing CSV rows never delete saved records. Commit checks the preview baseline again to avoid overwriting newer manual edits and records update events. Preserve the Pulse ID column when using external cleanup tools; older exports without it cannot update by ID.

### Split proposals in transaction CSVs
Fresh transaction exports include `Split Number`, `Split Category`, `Split Amount`, `Split Owner`, `Split Note`. An unsplit transaction is one row with blank split cells. A split is 2–100 rows with the same Pulse ID and identical complete parent fields (including full signed Amount), numbered 1..N. Only Split Amount carries the allocation; allocations must total the parent's signed amount exactly. No extra parent row is included. Normal imports collapse these rows to one pending update. Before/after review supports accepting/rejecting the whole allocation set; accepted splits replace the prior set inside the original transaction and produce an audit event. They never create child transactions. Blank split cells do not clear existing splits. Unknown categories/owners, malformed sequences, mismatched totals, partial exports and linked money movements are rejected. Instructions for external cleanup: `/pulse-chatgpt-transaction-review.txt`.

Account renaming keeps the same account ID, updates transaction/holding display references and exact account rule conditions, and preserves previous names as import aliases. Source transaction identifiers and deduplication keys remain unchanged. Bank and balance CSVs using an old name match the same account, and prior upload history remains visible. Pending update previews must be prepared again if their protected account reference changed.

### Account identity and bill status
Accounts expose a read-only imported/source name and an editable display name. The internal account ID stays fixed, while previous names remain import aliases. Credit statement/payment fields are grouped under optional details.

Bills defaults to a 30-day charge/withdrawal agenda, with a separate all-bills view and explicit last-charge/end dates. Bill editors support deletion with confirmation, preserving transactions and recorded payment history. Clear posted transactions can automatically confirm an occurrence using its charged account, merchant/statement match, date within five days, and fixed gross amount (variable estimates additionally require the same category and a bounded amount). Ambiguous matches, pending transactions and wrong accounts are not confirmed. One transaction cannot automatically pay multiple bill templates. Auto-match history retains its source transaction ID; source corrections/removal invalidate matching. This records the card charge, not independent proof that Chexy delivered money to a provider. Optional provider date is separate from charge date and credit-card repayment due date.

### Wealthsimple bank exports

Upload credit card, chequing, or investment activity CSVs through Imports. Choose the existing account for card/chequing files; map each investment source account separately. Confirm possible existing matches during review: keep the saved transaction unchanged, import a separate purchase, or skip the row. Confirmed matches remember the source identity for later uploads. Matching never replaces cleaned categories, display names, tags, notes, or splits. Equal amounts alone are not automatically merged.

Investment activity is stored separately from spending and appears under Investments. It does not infer holdings, replace balances, or create budget income/expenses. CAD cash amounts are required. Blank-cash option expiries remain non-cash events. This importer does not automatically submit data to AI.

### Other bank CSV formats

Imports suggest columns from common bank headers, including underscore-separated names. Comma, semicolon and tab delimiters are recognized. Check the source sample, adjust the field dropdowns, and expand Date & amount settings when required. Ambiguous numeric dates require an explicit choice. “Remember this format” saves column/date/sign settings for the signed-in profile after a successful preview; account and owner selections are not remembered. Known raw-bank source rows are skipped; possible existing matches require confirmation and preserve cleaned metadata. No missing records are deleted. Formats without a bank transaction identifier use source fingerprints, so changed statement wording may require another matching review.

### Optional cleanup batches

Match decisions and pending suggestions must be resolved; improving merchant names or categories is optional. Personal ChatGPT prompts contain up to 50 eligible rows with read-only dates/CAD amounts, names, statement text, categories, tags, row IDs, and the category catalog. Account/owner names and the entire saved history are not included. Copy the prompt, load the CSV/JSON response, review suggestions, then Finish this batch; unchanged rows are also marked reviewed so the next prompt advances. Connected AI handles up to 50 rows, or 10 with merchant lookup, and records reviewed rows after a successful response. No request is automatic.

### Transaction import stages

Choose file → Check columns → Resolve duplicates → Edit & cleanup → Review → Submitted. Duplicate decisions are completed before editing. Editing and optional AI cleanup share one stage, with counts for missing labels, flags, pending suggestions and manual corrections. Final review is read-only: Edit returns to the preceding stage, and Submit import is the only action that commits the draft. Pending suggestions, unsaved form edits and unverified screenshots cannot bypass review.

### Merchant normalization and cleanup approval

Pending cleanup shows before/after values for every changed field, with Accept all / Reject all for the whole pending set. Clear merchant prefixes (for example AMZN MKTP and PRESTO FARE) can produce local normalization suggestions without an AI request. Names customized by users or merchant rules take precedence; original statement text, amounts and dates are preserved.

Accepted merchant-name changes become account-scoped merchant-only rules when the selected import rows are submitted. Recognized reference-bearing prefixes can match future reference suffixes; unfamiliar descriptors use exact statement matches. Categories, owners, notes and tags are not copied into these learned rules. Rejecting a name change or abandoning the draft does not create a rule. Existing rules are not overwritten. Personal ChatGPT prompts explicitly request merchant-name normalization in addition to category review.

### ChatGPT response feedback

The personal ChatGPT screen separates prompt preparation, response validation, and reviewing loaded suggestions. Pasting or choosing a response file calls a local preview endpoint: it verifies the format, import/batch IDs and allowed fields, reports the number of suggestions, and does not change the draft. Review suggestions then loads the validated response for before/after approval. The screen confirms loading explicitly. Next batch / Complete cleanup appears only after the response is loaded and every suggestion in that batch is accepted or rejected. Empty suggestions responses are supported as an explicit “no changes” result. No response is submitted to financial records until the final Submit import action.

### Editing import rows

In Edit & cleanup, click a date, merchant name, amount or category directly in the preview table. Enter or leaving the field saves the draft correction; Escape cancels it. The cell editor overlays the existing cell so column dimensions do not jump, and table scroll is preserved after saving. Final review is read-only. Dates/amounts of Pulse-ID updates, kept duplicate matches and split totals remain protected. Correcting one field preserves unrelated pending suggestions.

Pasting a ChatGPT reply validates it and automatically opens proposed changes for review; no changes are accepted automatically. Manually typed replies can use Review suggestions. Accept / Accept all refreshes the draft table and highlights changed rows; Reject preserves the current draft value. Submit import remains the only action that writes the selected transaction changes into financial records.

### Matching a ChatGPT reply to its draft

A pasted or uploaded valid cleanup response opens its comparisons automatically after local validation. Replies carrying another import ID offer Open matching draft and preserve the current draft. The lookup is limited to drafts owned by the signed-in profile. Already-loaded replies are identified; Use a different response permits a revision, preserving accepted values and replacing only pending reply suggestions after validation. Malformed replies show an error above the input. Original bank text and financial records remain unchanged until explicit acceptance and final submission.

## Investment account workspace

Investments groups holdings, cash and contribution review by account, with an owner-scoped combined value chart. Combined history starts only when all visible accounts have recorded values. Value changes are not described as investment return. Activity is retained inside each account rather than in a global log.

Activity review totals CAD deposits and withdrawals over the imported period. Trades, dividends and fees are not contributions; ambiguous transfers require classification. Transfers between investment accounts are excluded from contributions. Missing opening cash or earlier activity is never assumed to be zero. Activity classification does not automatically alter holdings or cash. Reconstructing lifetime contributions requires complete history and review of account transfers.

Record dated investment cash through Edit cash. The default valuation uses reported account totals. Opt into All holdings + recorded cash only after entering all positions; quote refreshes then update that account total and its snapshots. Cash stays at the last entered amount until reconciled. Complete holdings imports can remove positions omitted from the new snapshot after explicit confirmation. Historical position snapshots remain preserved.

Connected cleanup now shares merchant/MCC guidance with the personal ChatGPT workflow. MCC suggestions require merchant web lookup and supporting URLs, preserve existing codes, and remain suggestions for human acceptance. No-look-up runs must leave MCC blank. No live API calls are made by the automated tests.

Investment charts have independent account/holding controls for one, three and six months, year to date, one, three and five years, and all time. Blue segments indicate rising recorded values and red segments falling values. Area, line and change-between-observation bars are available; hover, focus, arrow keys or touch inspect a tracking point. These represent recorded value changes, not cash-flow-adjusted returns.

Activity reconstruction uses signed quantities, including negative sales, share transfers, expirations and corporate-action adjustments. Explicit ACB-only entries and non-cash share movements are excluded from cash. Blank-currency corporate actions and USD in-kind transfers are preserved as non-cash activity, never converted to CAD cash. Reconstructed ending quantities and cumulative CAD cash movement assume zero opening balances and remain review-only; they do not overwrite accounts or fabricate historical market prices.

## Apply activity reconstruction

In Investments, each account with imported activity offers **Build holdings from history** (or **Review activity updates** after confirmation). Preview compares saved shares and cash with the proposed result, shows removed holdings, and lets you confirm quote currency and exchange. Rebuild starts with no shares and an entered opening CAD cash balance; import missing earlier history when opening shares existed. Confirmation is required. The server checks a preview fingerprint and prepares changes on a copy before committing, so stale or invalid previews cannot partially replace holdings.

Applying saves quantities, dated CAD cash, a record of applied activity identities, and the optional future-import setting. Historical snapshots are preserved. Prices are retained for matching quote settings; old trade prices never become current quotes. Changed quantities require fresh cost-basis review. Reported account balances remain separate unless holdings-plus-cash valuation is selected; that mode waits for all prices before updating the account total.

With future updates enabled, supported new activity updates holdings/cash once when the activity import commits. Duplicate rows are ignored. New quote symbols, backdated previously unseen activity, changed previously applied history, manual quantity/cash edits, negative ending cash and unsupported events pause automatic application and show a review message on the account. Cash-only accounts are supported. Transfer classification affects contribution summaries; it never suppresses actual cash movements or treats in-kind transfers as CAD cash. Your initial reconstruction is not applied merely by importing a file.

## Full financial picture for AI analysis

Financial tools and Settings offer **Prepare AI snapshot**. Choose Everyone for the household or a named owner, inspect coverage/counts, copy the analysis prompt and download the JSON snapshot for ChatGPT or Claude. The file includes all saved transactions in scope (no row truncation), accounts, debts, holdings and activity, value history, bills/payments, budgets and overrides, payroll current/YTD figures, shared purchases/repayments, forecast setups and savings plans. Record counts and source coverage distinguish a complete export from incomplete bank history.

This export uses explicit financial-field allowlists. It excludes passwords, PIN hashes, API credentials, sessions, staged imports and original documents/receipt binaries. It is not the raw database backup and is not live AI access. No data is uploaded to an external provider by preparing/downloading the snapshot. Any later data requires a fresh export. The included prompt explains transfer/split/payroll/investment double-counting risks and requires evidence, uncertainty and separate proposed edits.

## Setup-time investment price-history rebuild

After confirming complete activity with Build holdings from history, choose **Rebuild price history** on an investment account. Map every historical security to its correct provider ticker/quote currency; non-overlapping date periods support ticker/listing changes. Options require a confirmed contract multiplier and a usable historical price source. Confirm complete activity through the chosen end date.

Cache prices through Alpha Vantage (standard full weekly history, recent 100 daily observations, or full daily history with premium access) or upload a Date,Close CSV of unadjusted/as-traded prices. Historical USD/CAD is cached from Bank of Canada. Daily-close prices must not already be split/dividend adjusted: signed corporate actions and dividends are applied from activity. Cached data is reused, and price requests share the existing daily provider request budget. No AI API is required. Provider failures retain the existing cache and never fabricate prices.

The rebuild replays daily signed quantities/cash and marks holdings using dated closes and FX. Net funding includes cash movements and in-kind transfers; it is never employment income. Gain/loss is account value less opening cash/funding, including dividends, fees and FX; it is not a tax calculation or annualized return. Unknown in-kind funding valuation suppresses gain claims. Weekly-price estimates are explicitly labelled, and pre-corporate-action quotes are not carried into post-action quantities. Missing prices/FX create visible coverage gaps and broken lines. Negative/missing opening shares and unsupported cash activity prevent a rebuild.

Generated account/holding history is stored separately from original balance observations. Re-running replaces only generated history for that account and leaves current balances, holdings, transactions and recorded snapshots unchanged. New activity or changed price cache marks generated results stale. Value, funding and gain/loss have independent chart controls; the combined rebuilt view labels which accounts are included and requires matching date coverage across that subset. Original account-value charts remain available under Recorded account values. AI snapshot exports include the generated account performance context.

Historical downloads track the requested range for each coverage mode. Resuming the same setup on a later day skips already completed range requests instead of consuming the daily request budget again. The setup end date is retained between visits. Provider access limitations remain visible as gaps; caching a request does not imply that the provider supplied every historical price.

### Investment account value and net funding
Investment account details show holdings, average cost where known, separate cash, prior-close holding changes and a dotted net-funding comparison. Funding includes cash and in-kind transfers; it is not household income. Chart gains subtract funding changes and do not present balance growth as a percentage return. Canadian CDR activity is separated from U.S. shares with the same ticker without changing the original import.

The account's **Update history & prices** button resolves historical listings using Yahoo Finance, sending ticker/company names only. Yahoo is an unofficial, best-effort source and can omit delisted securities. As-traded closes reverse subsequent split adjustments before signed quantities are valued. Historical USD/CAD uses Bank of Canada reference rates. Missing prices leave explicit gaps. A dated user brokerage checkpoint can reconcile the chart without changing the underlying provider cache. This remains a reconstruction, not an exact broker return or tax calculation.

Investment account layout: one account chart below five account totals, followed by current holdings and collapsed trade/account history. Holding cost and open gain/loss stay independent of money deposited. The selected chart range also controls the holding price-change column; All time shows the remaining position’s gain/loss against its cost basis. Holding rows are read-only. Import, holding management and cash adjustments remain explicit actions. The portfolio chart incorporates reconstructed account values once, with recorded values as fallback.

Investment menus use plain, aligned menu rows. On phones, holdings become cards with per-position book cost. Value/book cost/open gain above the list total all current holdings in that account, excluding cash. Metric explanations are available on the account totals. The hourly market-data check now performs an additional after-close refresh after 18:00 America/Toronto even when a morning quote was cached. When a closing price is available it supersedes a same-day screenshot checkpoint, updates holdings/account totals, and rebuilds cached account history. The server must be running; missing provider data retains its dated previous value.

Investment account groups open by default when their balance is nonzero. Zero-balance groups start collapsed; their chart and details are created only when expanded, keeping the mobile page lighter. Reconstruction runs only for accounts with imported investment activity. Accounts with reported balances alone retain those values and do not acquire inferred holdings or funding history.

### Other investments
Physical silver and defined-benefit pensions are separate owner-scoped records under Investments. Silver stores quantity and book cost without guessing a market price or purchase date. A dated manual valuation creates/updates one linked Other asset account, so net worth includes the value once. Cost alone does not create an asset balance. HOOPP reads the latest applicable paystub pension deductions and YTD fields; it never adds cumulative YTD figures together or treats contributions as the pension's market value. Multiple payroll employers require a matching employer. Statement-based annual pension estimates are separate from payroll and net worth. These records are included in the financial-analysis export.

### IBKR nightly reporting sync

Under Investments → settings gear → IBKR nightly sync, enter an Activity Flex Query ID and a Flex Web Service token. Use XML, Last 365 Calendar Days, Open Positions (Summary), Trades (Executions), Cash Transactions (Detail), Cash Report, Transfers, Corporate Actions, and Net Asset Value in Base. Keep CAD as the account base currency. The account must already have its broker account ID linked by an import. Each connection targets that existing account; other accounts in the report are ignored.

Pulse requests a fresh report at or after 2 a.m. America/Toronto once daily while running, including a catch-up after startup. Temporary failures retry hourly. Closing positions and cash come from IBKR, so no separate market-price key is needed. Earlier imported CSV history is retained. Unsupported instruments or incomplete reports stop the sync with a visible error and retain existing financial data. Check the last report date; token expiry requires renewal in IBKR.

Tokens stay server-side in `data/ibkr-flex.json` (0600), outside the financial database and financial exports. Include this file only in a trusted private host backup. Disconnect removes credentials while retaining imported financial records. This reporting integration cannot place trades.

### Investment chart views

Each investment account and the combined portfolio use a full-width History / Allocation tab switch. Allocation groups current CAD values by holding, account, asset type, account type, sector or currency. Recorded cash is included. Accounts without holding breakdowns remain visible as unitemized balances; missing sector data stays Unknown. Chart view/group selections are remembered locally. Market-price settings and IBKR connections are available from the Investments settings gear.

### Investment sectors

Company sector metadata is looked up by exact public ticker and a matching company name through Yahoo Finance, cached for 30 days, and refreshed with the normal investment refresh. No account identifiers, quantities or balances are sent to this lookup. Sources and check dates appear under Allocation → Sector → Sector sources & dates. Imports preserve metadata for an unchanged security and clear it when the ticker or currency changes. Manual sectors are retained.

VFV and QQC currently use issuer factsheet sector weights dated September 30, 2026. These weights estimate sector exposure using the holding’s current CAD value; they are not live underlying holdings. QQC’s consumer categories retain CI’s labels because they do not map precisely to standard company sectors. The original weights, source URL, date and estimated status are stored with each fund holding. Unknown funds remain unclassified until a supported breakdown is available.
