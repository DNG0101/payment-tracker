# UPI Splitter

A fast, privacy-friendly UPI payment splitter that runs entirely in the browser and can be deployed directly to GitHub Pages.

## What it does

- Reads an existing merchant UPI QR image locally.
- Saves only the business name and validated UPI payment URI in `localStorage`.
- Splits a bill into payment QRs capped at ₹1,999 each.
- Keeps money calculations in integer paise.
- Lets the operator edit unpaid QR amounts while preserving the total.
- Locks manually confirmed paid QR amounts.
- Shows payment progress and a school-style total verification.
- Clears the transaction on completion and on every browser refresh, while retaining the business setup.

This app does **not** verify payments with a bank or UPI provider. “Mark as Paid” is an operator confirmation.

## Architecture

This is a static site:

```text
index.html
css/style.css
js/app.js
js/qr.js
js/storage.js
vendor/jsQR.js
vendor/qrcode-generator.js
```

There is no server, database, framework, analytics, payment API, or build step. `jsQR` is the local fallback decoder and `qrcode-generator` creates payment QR images locally. Native `BarcodeDetector` is used first where the browser supports it.

## Deploy to GitHub Pages

1. Create a GitHub repository.
2. Upload the contents of this folder to the repository root.
3. In **Settings → Pages**, choose **Deploy from a branch**, select the default branch and `/ (root)`.
4. Open the generated `https://USERNAME.github.io/REPOSITORY/` URL.

The site uses relative asset paths, so it works from a repository subpath.

## Privacy and storage

The uploaded QR image is decoded in memory and is never uploaded. The only persistent data is:

```js
{
  businessName: "...",
  upiBaseUri: "upi://pay?..."
}
```

Bill totals, already-paid values, generated QRs, edits and paid states are runtime-only. A refresh removes them. Use **Change Business QR** to intentionally remove the saved business configuration.

## QR splitting and editing

The default cap is defined once in `js/app.js`:

```js
var MAX_QR_AMOUNT_PAISE = 199900;
```

Money is represented as paise, so ₹1,999 is `199900`. The initial split fills QRs up to the cap and puts the remainder in the final QR. Editing an unpaid QR takes the difference from or adds it to other unpaid QR cards, starting at the end; overflow creates additional capped QRs. Paid cards are never changed by redistribution.

Every generated URI preserves the decoded UPI parameters, replaces `am`, and sets `cu=INR`.

## Browser compatibility

Current Chrome, Edge, Android Chrome, Firefox, and Safari/iOS are supported as far as their image and canvas APIs allow. Browsers without `BarcodeDetector` automatically use the bundled `jsQR` decoder.

## Manual test checklist

After setup with a valid UPI QR, try:

- ₹1 → one QR
- ₹1,999 → one QR
- ₹2,000 → ₹1,999 + ₹1
- ₹3,000 → ₹1,999 + ₹1,001
- ₹3,998 → ₹1,999 + ₹1,999
- ₹3,999 → ₹1,999 + ₹1,999 + ₹1
- ₹6,000 → ₹1,999 + ₹1,999 + ₹1,999 + ₹3
- ₹6,000 with ₹1,500 already paid → ₹1,999 + ₹1,999 + ₹502
- Edit the first ₹1,999 on a ₹6,000 bill to ₹1,500 → final QR becomes ₹502
- Mark a card paid and verify its editor locks
- Refresh during a transaction and verify the business remains while the transaction disappears

The project intentionally has no build process: open `index.html` through a static host (GitHub Pages is recommended).