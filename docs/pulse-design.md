# Pulse interface direction

Pulse brings one household's accounts, spending and investments into view.

Character: calm, precise, reassuring. Neutral ledger-like surfaces and restrained blue controls leave colour to financial charts and meaningful state. Amounts align consistently; ownership stays visible. Existing features and section order remain intact.

The shared presentation is consolidated in `public/pulse-design.css`, loaded after legacy component styles. It sets light/dark surface tokens, spacing, typography, control states, responsive grouping, keyboard focus and reduced-motion behaviour. Existing IBM Plex Sans and the Pulse mark are retained. It does not change financial calculations or stored records.

Changes follow the Unslop pass order: spacing, colour, icons, copy, typography, layout, component details, visuals, motion. Profile selection now gives immediate status feedback without the decorative arrival animation. Charts remain the main visual content.

Validation covers dashboard, accounts, transactions, imports and investments on desktop and mobile, with no page overflow or browser errors. The existing automated suite passes 309 tests.

Design workflow credit: **Unslop by Damir Sokolovsky**, https://github.com/heydamir/unslop, licensed CC BY 4.0. The neutral ledger direction was adapted for Pulse; no generated imagery was required.
