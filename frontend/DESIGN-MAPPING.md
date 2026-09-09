# PowerManage design mapping

Primary reference: ../electricity-bill-calculator/DESIGN.md.

Existing component trees, API services, role guards, invoice/payment/email handlers and navigation destinations are retained.

| Existing surface | Design mapping |
| --- | --- |
| App canvas | Background #fcfaf7; foreground #423d38; system sans |
| Sidebar, header, mobile navigation | Scoped app-shell: black at 70%, 12px blur, white text, 10% white borders; orange active navigation |
| Desktop sidebar | 256px expanded / 64px collapsed; existing collapse behavior |
| Workspace | Centered 1400px maximum; 32px desktop, 24px tablet, 12?16px mobile gutters |
| Dashboard, property billing, readings, invoices, My Bills | Existing cards use white surface, #e3e0dd borders, 12px radius, subtle shadow |
| Primary actions | #fe6e00 / #ff6b00 hover; white labels; 6px radius |
| Forms | White surface, #d1d5dc border, 6px radius, orange focus; mobile inputs 16px |
| Tables | Neutral header, 48px height, 12px tracked labels, compact 14px cells; existing scrolling/card alternatives retained |
| Paid / successful | #dcfce7 background / #016630 text |
| Pending / demo | #fef9c2 background / #874b00 text |
| Overdue / error | Danger #fb2c36 with soft red background |
| Void / inactive | Neutral surface and muted foreground |
| Consumption | Orange bars at 60% opacity, 4px top corners; existing horizontal scrolling |
| Dashboard charts | Orange line/fill, neutral grid and labels; existing interactive data controls |
| Dialogs, toasts | 12px dialog / 8px message radius, constrained viewport height, dialog shadow |
| Search and account dropdown | Explicit neutral popover tokens inside dark header |
| Theme preference | Light default; saved dark preference retained using #413830 / #4a423a |

## Responsive adaptation

320px uses 12px content gutters. 375, 390 and 414px use 16px gutters. Existing single-column forms/cards remain until their tablet breakpoints. At 768px the invoice filters use two columns. Desktop sidebar starts at 1024px; mobile navigation is hidden there. Dashboard metrics expand to six columns at 1440px, with three columns on smaller wide screens. Admin bottom tabs reuse current navigation; More opens the current drawer. User tabs and invoice/receipt active states are retained. Bottom safe-area padding reserves space for fixed navigation.

Cards retain their context-specific compact spacing, typically 16px on mobile and 24px for analytical panels. No security-product layouts or backend behavior were imported from the reference.

## Validation

Run TypeScript, lint, production build and the existing Vitest regression suite. Browser viewport checks require an available browser connection; source-level responsive review does not substitute for rendered verification.
