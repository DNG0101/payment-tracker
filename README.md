# Payment Tracker

A fast, browser-only UPI payment splitter and manual payment tracker designed to run directly on GitHub Pages.

## Live app

`https://dng0101.github.io/payment-tracker/`

## What it does

- Add a merchant UPI QR by **uploading an image** or **scanning it live with the camera**.
- Includes a **Scan Any QR** utility that can decode general QR content locally in the browser.
- Stores only the business name and base UPI URI in `localStorage`.
- Keeps the current payment session in memory only, so refresh clears the transaction but retains the business setup.
- Accepts a total amount plus an optional already-paid amount.
- Splits the remaining amount into payment QRs using a default maximum of ₹1,999 per QR.
- Embeds the exact amount in every generated UPI QR.
- Lets an operator edit an unpaid QR amount and automatically redistributes the difference while preserving the total.
- Locks paid QR amounts and tracks paid/pending totals.
- Shows a school-style addition/subtraction check so the QR amounts visibly add up to the remaining amount.
- Works on mobile and desktop.

## Direct-scan note

Generated payment QRs are intended to be scanned directly with the camera/QR scanner inside a UPI app. Gallery-import QR behavior varies across UPI apps and is not relied on by this project.

## Privacy

QR images, camera frames, UPI data and transaction calculations are processed locally in the browser. There is no backend and no database.

## GitHub Pages architecture

The project uses plain HTML, CSS and JavaScript plus locally bundled QR libraries. Core functionality does not require a backend or external API.

## Main files

- `index.html` — UI and dialogs
- `css/style.css` — responsive styling
- `js/storage.js` — persistent business configuration only
- `js/qr.js` — UPI parsing, QR image decoding and QR generation
- `js/app.js` — transaction logic, splitting, redistribution, status tracking and camera scanner

## Amount logic

Money is represented internally as integer paise to avoid floating-point rounding issues.

Default maximum per generated QR:

```js
var MAX_QR_AMOUNT_PAISE = 199900;
```

Example:

```text
₹6000 => ₹1999 + ₹1999 + ₹1999 + ₹3
```

If an individual unpaid amount is edited, the difference is redistributed across other unpaid QRs without changing the overall remaining total. Paid QR amounts are never modified silently.

## Browser requirements

Live camera scanning uses `getUserMedia`, which works on HTTPS pages such as GitHub Pages. Where `BarcodeDetector` is available it is used first; otherwise the scanner falls back to the locally bundled `jsQR` decoder.

## Payment verification

The **Mark as Paid** action is manual operator tracking. This project does not connect to a bank or PSP callback and does not claim automatic bank verification.
