# Shopday: item-level sales collection for a traditional shop

**Stage:** Working prototype deployed through Vercel. Shop use and outcomes have not yet been measured.

## 1. The problem I chose

In the shop workflow I wanted to support, the seller counts money at closing and decides what to keep for tomorrow or set aside. Individual products sold during the day are not recorded. A total cash amount cannot tell the owner which products sold, in what quantities, or which recorded purchase needs correction.

My initial question was: **Can the seller record each purchase quickly enough that a usable item-level record exists at the end of the day?** This is a workflow hypothesis, not a proven result from a shop trial.

## 2. The user and the moment of use

The intended user is one seller using one phone or computer at the shop. After a customer leaves, the seller opens the web app and records all products in that purchase together. The seller explicitly opens the business day and closes it after counting cash.

The key unit is a **purchase**, not a product row: one customer can buy several products in one purchase. The app gives that purchase one sale ID, such as `0001`, then writes one CSV row for each product under that ID. On the next business date, numbering starts at `0001` again. The date plus sale ID identifies a purchase across days.

## 3. What I built

1. **Open day:** confirm a business date and optionally enter opening drawer cash.
2. **Record sale:** enter one or more product names, quantities, and whole-MMK unit prices; choose cash or other/transfer. The app calculates line and sale totals, stores the entry time, and allocates the next ID.
3. **Review and correct:** see valid sales in the daybook. An incorrect sale can be marked void with a reason; its ID is not reused. The corrected purchase is entered as a new sale.
4. **Close day:** count actual cash, optionally note cash kept for tomorrow and set aside, then download the day's CSV. The day can be reopened to correct a missed entry while continuing its old numbering.
5. **Back up:** download all recorded days as JSON and restore that backup into an empty browser profile.

### Example of the CSV structure

The values below are **illustrative**, not real shop data:

| business_date | sale_id | item_number | product | quantity | unit_price_mmk | line_total_mmk | sale_total_mmk |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| 2026-09-23 | 0001 | 1 | Pen | 1 | 100 | 100 | 600 |
| 2026-09-23 | 0001 | 2 | Notebook | 1 | 500 | 500 | 600 |
| 2026-09-23 | 0002 | 1 | Pencil | 2 | 100 | 200 | 200 |

The complete CSV also includes the entry timestamp, status, payment method, note, and void reason. Void rows keep their original amounts for inspection; the app excludes void sales from its daybook totals.

## 4. Why I made these design choices

| Choice | Reason and consequence |
| --- | --- |
| One sale ID per purchase | A basket of products stays together; CSV repeats the ID across its item rows. |
| A separate business-day record | Opening and closing are explicit, and IDs reset by date without mixing days. |
| Void instead of delete | Corrections remain visible and old IDs are not silently reused. |
| IndexedDB in the browser | A single device can record without setting up a server database; it cannot synchronize devices. |
| Daily CSV plus full JSON backup | The owner gets a simple item-level export and a separate recovery file. Both must be stored safely outside the browser. |
| Actual closing cash entered by the seller | The app cannot infer expenses, supplier payments, or withdrawals from sales alone. Its opening cash + cash-sales figure is only an estimate. |

## 5. What has been verified

- Automated checks pass for a multi-product purchase total, valid whole-MMK amounts, and CSV row behavior including quotes, spreadsheet-formula protection, and void records (`npm test`).
- The app files and Vercel configuration are present in the GitHub repository. The connected GitHub deployment check reported Vercel success for the app commit.
- No real-shop entry-time, completeness, user adoption, or business outcome has been measured yet. A successful deployment is evidence that the app is hosted, not evidence that it improved the shop.

## 6. A small field trial to collect real evidence

Use a separate test browser profile for synthetic examples. For a real trial, agree with the shopkeeper on which device will be the ledger and how daily backups will be kept. Do not publish customer names, cash balances, or raw business records.

For the first three shop days, note:

| Date | Purchases actually observed | Purchases recorded | CSV downloaded? | Seller feedback / missed entries |
| --- | ---: | ---: | --- | --- |
| Day 1 |  |  |  |  |
| Day 2 |  |  |  |  |
| Day 3 |  |  |  |  |

Also time 10 ordinary entries and record the median seconds per entry. Compare the recorded count to a separate tally at closing. This can reveal whether the workflow is practical without claiming that item-level capture is complete from the app's own data alone.

After the trial, write one honest observation in this form: **“Across [number] days, [number] of [number] observed purchases were recorded; median entry time was [number] seconds; the seller reported [specific difficulty].”** If the trial has not happened, leave those numbers blank.

## 7. Current limits and next iteration

Browser data belongs to one device, browser profile, and site domain. Clearing site data or losing that device can lose records unless exports were saved elsewhere. This version has no login, shared database, stock tracking, cost/profit calculation, credit balance, returns, or customer ledger. It does not prove how much cash should be saved; spending and other cash movements are outside the model.

The next decision depends on the field trial. If entering every small sale is too slow, simplify product selection and measure whether capture improves. If several sellers need the same ledger, add authenticated shared storage and test synchronization before relying on it for operations. If the owner needs profit or inventory decisions, first collect purchase costs and stock movements; do not infer them from revenue alone.

## 8. How to present this project

For a portfolio or LinkedIn post, show: **problem → seller workflow → one multi-item sale → CSV output → one design tradeoff → measured trial result (when available).** Include the repository and a verified live URL, plus screenshots taken with sample data. Until the field trial is complete, describe this as a working prototype and state what you plan to measure.

**Repository:** https://github.com/paingzinhtun/Sale_Data_Collector_sys

**Live app URL:** Add the public Vercel URL after opening and verifying it.
