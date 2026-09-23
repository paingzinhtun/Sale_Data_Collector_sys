# Shopday — sales collection for a traditional shop

Shopday records each customer purchase as one sale with one or more items. It assigns `0001`, `0002`, and so on within each business day, records the entry time, and exports the closed day's item-level data as a UTF-8 CSV. A sale number can repeat on another day; use **business date + sale ID** as the unique reference.

## Why this project exists

Some traditional shops count the money at closing but do not record which products were sold. That makes it difficult to answer simple questions later: *What sold today? How many units? Can we reconstruct the day's sales?* Shopday makes item-level recording possible with a short entry after each customer leaves.

This is a working prototype for **one shop device**. It has not yet been validated as a faster or more accurate workflow in a real shop. Read the [project case study](docs/CASE_STUDY.md) for the design decisions, evidence collected so far, and a small field-trial plan.

### What the first version does

- Records a purchase with one or more products, quantities, prices, and a payment method.
- Assigns a sequential sale ID for each business day and records entry time.
- Shows a daybook and cash-sales summary; voids an incorrect sale while preserving its ID.
- Closes a day with an actual cash count and downloads an item-level CSV.
- Saves a full JSON backup for recovery in an empty browser profile.

## Run locally

From the project root:

```bash
python3 -m http.server 8000 --directory public
```

Visit `http://localhost:8000`. The browser must support IndexedDB. Do not open `index.html` directly as a `file:` URL; service workers and some storage features require a local web server or HTTPS.

## Deploy to Vercel

Push this folder to your GitHub repository, import it in Vercel, and deploy. `vercel.json` sets the framework to Other and the output directory to `public`; there are no build dependencies or environment variables. Keep the same Vercel production domain after launch because browser storage belongs to that domain.

## How to use

1. On the shop device, confirm **Open shop** and optionally record opening cash.
2. Enter all products in a purchase, with quantity and unit price in whole MMK, then tap **Save sale**. Different customers get different sale IDs. Payment method applies to the whole purchase.
3. Review sales in **Daybook**. An incorrect entry can be voided with a reason; its ID stays reserved for the audit trail. Record the correct transaction as a new sale.
4. At closing, enter counted cash and optionally record how much to keep for tomorrow and set aside. Confirm **Close and download CSV**. The browser downloads the CSV automatically; if a download is blocked, use the export button in Daybook or History.
5. Keep the CSV somewhere safe every day. Use **Back up all days** to save a full JSON backup as well. A JSON backup can be restored on a *new, empty browser profile* using **Restore backup**.

## CSV schema

One row per item, including each item in a multi-item purchase. Repeated sale IDs represent items from the same purchase. Fields: `business_date`, `sale_id`, `sold_at`, `status`, `item_number`, `product`, `quantity`, `unit_price_mmk`, `line_total_mmk`, `sale_total_mmk`, `payment_method`, `note`, `void_reason`. Void sales retain their original amounts for audit, but are excluded from the dashboard totals. A closed day with no sales exports a header-only file. CSV includes a UTF-8 BOM for Excel and guards against spreadsheet formula injection.

## Important limits

- Data stays in **one browser on one device**. Vercel only hosts the app files; it does not store shop records or synchronize multiple devices. If browser data is cleared or the device is lost, the shop needs its downloaded backups. A browser can also deny persistent storage requests, so export every day regardless.
- The cash estimate is opening cash **plus recorded cash sales**. It cannot account for purchases, expenses, withdrawals, refunds, credit payments, or cash added to the drawer. Counted cash is entered by the shopkeeper, and any difference needs human investigation. “Keep for tomorrow” and “Set aside” are closing notes, not bank transfers or a profit calculation.
- One business day can be open at a time. Reopening a closed day continues its sale numbers rather than restarting them. The next calendar date begins at `0001`. Times and dates use the device's local clock and time zone; set the device clock correctly.
- The app does not track inventory, costs, profit, customers, or receivables. Those need more source records and a shared database in a later version.

## Structure

`public/index.html` is the UI, `public/app.js` handles interactions, `public/db.js` contains IndexedDB transactions, and `public/core.js` contains validation/export functions. There are no external scripts, fonts, trackers, or API calls.
