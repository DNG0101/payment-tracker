(function () {
  "use strict";

  var MAX_QR_AMOUNT_PAISE = 199900;
  var DEBOUNCE_MS = 190;
  var CAMERA_SCAN_INTERVAL_MS = 170;
  var state = {
    business: null,
    pendingBusinessUri: "",
    totalPaise: 0,
    alreadyPaidPaise: 0,
    remainingPaise: 0,
    qrPayments: [],
    amountTimer: null,
    scannerStream: null,
    scannerTimer: null,
    scannerPurpose: "generic",
    scannerLastValue: ""
  };
  var el = {};

  function byId(id) { return document.getElementById(id); }
  function money(paise) {
    var value = (paise / 100).toFixed(2);
    if (value.endsWith(".00")) value = value.slice(0, -3);
    return "₹" + value;
  }
  function moneyPlain(paise) { return (paise / 100).toFixed(2); }

  function parseMoney(value) {
    var text = String(value == null ? "" : value).trim().replace(/,/g, "");
    if (text === "") return 0;
    if (!/^(?:\d+)(?:\.\d{0,2})?$/.test(text)) return null;
    var pieces = text.split(".");
    var whole = Number(pieces[0]);
    var decimals = (pieces[1] || "").padEnd(2, "0");
    if (!Number.isSafeInteger(whole) || whole < 0) return null;
    var paise = whole * 100 + Number(decimals);
    return Number.isSafeInteger(paise) ? paise : null;
  }

  function setError(node, text) {
    node.textContent = text || "";
    node.hidden = !text;
  }

  function showToast(text) {
    el.toast.textContent = text;
    el.toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () { el.toast.hidden = true; }, 3300);
  }

  function setSetupMessage(text, info) {
    el.setupMessage.textContent = text || "";
    el.setupMessage.classList.toggle("info", Boolean(info));
    el.setupMessage.hidden = !text;
  }

  function splitAmount(totalPaise) {
    var parts = [];
    var left = totalPaise;
    while (left > MAX_QR_AMOUNT_PAISE) {
      parts.push(MAX_QR_AMOUNT_PAISE);
      left -= MAX_QR_AMOUNT_PAISE;
    }
    if (left > 0) parts.push(left);
    return parts;
  }

  function sumAmounts(payments) {
    return payments.reduce(function (total, item) { return total + item.amountPaise; }, 0);
  }

  function paidQrTotal() {
    return state.qrPayments.reduce(function (total, item) {
      return total + (item.paid ? item.amountPaise : 0);
    }, 0);
  }

  function validateSplit(payments) {
    var list = payments || state.qrPayments;
    if (state.remainingPaise === 0) return list.length === 0;
    return list.length > 0 &&
      sumAmounts(list) === state.remainingPaise &&
      list.every(function (item) {
        return Number.isSafeInteger(item.amountPaise) && item.amountPaise > 0 && item.amountPaise <= MAX_QR_AMOUNT_PAISE;
      });
  }

  function newPayment(amountPaise) {
    return {
      id: "payment-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
      amountPaise: amountPaise,
      paid: false
    };
  }

  function paymentsFromAmounts(amounts) {
    return amounts.map(newPayment);
  }

  function resetTransaction() {
    window.clearTimeout(state.amountTimer);
    state.totalPaise = 0;
    state.alreadyPaidPaise = 0;
    state.remainingPaise = 0;
    state.qrPayments = [];
    el.totalAmount.value = "";
    el.alreadyPaid.value = "0";
    setError(el.totalError, "");
    setError(el.paidError, "");
    el.amountSummary.hidden = true;
    el.transactionContent.hidden = true;
    el.noPayment.hidden = false;
  }

  function resetGeneratedOnly() {
    state.totalPaise = 0;
    state.alreadyPaidPaise = 0;
    state.remainingPaise = 0;
    state.qrPayments = [];
    el.transactionContent.hidden = true;
    el.noPayment.hidden = false;
    el.amountSummary.hidden = true;
  }

  function updateAmountSummary() {
    if (state.totalPaise <= 0 || state.alreadyPaidPaise < 0 || state.alreadyPaidPaise > state.totalPaise) {
      el.amountSummary.hidden = true;
      return;
    }
    el.amountSummary.hidden = false;
    el.amountSummary.textContent = "";
    var line = document.createElement("div");
    line.className = "summary-equation";
    line.textContent = money(state.totalPaise) + " − " + money(state.alreadyPaidPaise) + " = " + money(state.remainingPaise) + " remaining";
    el.amountSummary.appendChild(line);
    if (state.remainingPaise === 0) {
      var done = document.createElement("strong");
      done.textContent = "No remaining payment required.";
      el.amountSummary.appendChild(done);
    }
  }

  function generateForInputs() {
    var total = parseMoney(el.totalAmount.value);
    var paid = parseMoney(el.alreadyPaid.value);
    var totalError = total === null || total <= 0 ? "Enter a total amount greater than ₹0." : "";
    setError(el.totalError, totalError);
    if (totalError) {
      resetGeneratedOnly();
      return;
    }

    var paidError = paid === null ? "Enter a valid amount with up to 2 decimal places." : paid > total ? "Already paid amount cannot be greater than the total amount." : "";
    setError(el.paidError, paidError);
    if (paidError) {
      resetGeneratedOnly();
      return;
    }

    state.totalPaise = total;
    state.alreadyPaidPaise = paid;
    state.remainingPaise = total - paid;
    updateAmountSummary();

    if (state.remainingPaise === 0) {
      state.qrPayments = [];
      el.transactionContent.hidden = true;
      el.noPayment.hidden = false;
      return;
    }

    state.qrPayments = paymentsFromAmounts(splitAmount(state.remainingPaise));
    renderTransaction();
  }

  function debounceGenerate() {
    window.clearTimeout(state.amountTimer);
    state.amountTimer = window.setTimeout(generateForInputs, DEBOUNCE_MS);
  }

  function renderTransaction() {
    if (state.remainingPaise <= 0 || !validateSplit()) {
      if (state.remainingPaise > 0) showToast("Internal calculation error. No incorrect QR was generated.");
      el.transactionContent.hidden = true;
      el.noPayment.hidden = false;
      return;
    }

    el.transactionContent.hidden = false;
    el.noPayment.hidden = true;
    updateAmountSummary();
    el.qrCount.textContent = state.qrPayments.length + (state.qrPayments.length === 1 ? " QR" : " QRs");
    renderProgress();
    renderAccounting();
    renderCards();
    renderMath();
  }

  function renderProgress() {
    var qrPaid = paidQrTotal();
    var pending = state.remainingPaise - qrPaid;
    var complete = pending === 0;
    el.progressContent.textContent = "";
    addStat(el.progressContent, "Total Bill", money(state.totalPaise));
    addStat(el.progressContent, "Already Paid", money(state.alreadyPaidPaise));
    addStat(el.progressContent, "QR Payments Paid", money(qrPaid));
    addStat(el.progressContent, "Still Pending", money(pending), complete ? "complete" : "pending");
    if (complete) {
      var banner = document.createElement("div");
      banner.className = "success-banner";
      banner.textContent = "✓ Payment Amount Completed";
      el.progressContent.appendChild(banner);
    }
  }

  function renderAccounting() {
    var qrPaid = paidQrTotal();
    var accounted = state.alreadyPaidPaise + qrPaid;
    var unpaid = state.remainingPaise - qrPaid;
    el.accountingContent.textContent = "";
    addStat(el.accountingContent, "Total to collect", money(state.totalPaise));
    addStat(el.accountingContent, "Accounted so far", money(accounted));
    addStat(el.accountingContent, "Unpaid QR amount", money(unpaid), unpaid ? "pending" : "complete");
  }

  function addStat(parent, label, value, extraClass) {
    var row = document.createElement("div");
    row.className = "stat-row";
    var labelNode = document.createElement("span");
    labelNode.className = "stat-label";
    labelNode.textContent = label;
    var valueNode = document.createElement("strong");
    valueNode.className = "stat-value" + (extraClass ? " " + extraClass : "");
    valueNode.textContent = value;
    row.append(labelNode, valueNode);
    parent.appendChild(row);
  }

  function renderCards() {
    el.qrList.textContent = "";
    state.qrPayments.forEach(function (payment, index) {
      var card = document.createElement("article");
      card.className = "qr-card" + (payment.paid ? " paid" : "");

      var header = document.createElement("div");
      header.className = "qr-card-header";
      var title = document.createElement("h3");
      title.textContent = "Payment " + (index + 1) + " of " + state.qrPayments.length;
      header.appendChild(title);
      if (payment.paid) {
        var paidLabel = document.createElement("span");
        paidLabel.className = "paid-label";
        paidLabel.textContent = "✓ PAID";
        header.appendChild(paidLabel);
      }

      var row = document.createElement("div");
      row.className = "qr-amount-row";
      var amountWrap = document.createElement("div");
      amountWrap.className = "currency-input";
      var rupee = document.createElement("span");
      rupee.setAttribute("aria-hidden", "true");
      rupee.textContent = "₹";
      var amountInput = document.createElement("input");
      amountInput.type = "text";
      amountInput.inputMode = "decimal";
      amountInput.value = moneyPlain(payment.amountPaise);
      amountInput.disabled = payment.paid;
      amountInput.setAttribute("aria-label", "Amount for payment " + (index + 1));
      amountWrap.append(rupee, amountInput);
      row.appendChild(amountWrap);

      if (!payment.paid) {
        var apply = document.createElement("button");
        apply.className = "button button-primary apply-button";
        apply.type = "button";
        apply.title = "Apply and redistribute";
        apply.setAttribute("aria-label", "Apply amount and redistribute payment " + (index + 1));
        apply.textContent = "→";
        apply.addEventListener("click", function () { editPayment(index, amountInput.value); });
        amountInput.addEventListener("keydown", function (event) {
          if (event.key === "Enter") editPayment(index, amountInput.value);
        });
        row.appendChild(apply);
      }

      var frame = document.createElement("div");
      frame.className = "qr-frame";
      var image = document.createElement("img");
      image.alt = "UPI payment QR for " + money(payment.amountPaise);
      try {
        image.src = QRTools.qrImageDataUri(QRTools.buildPaymentUri(state.business.upiBaseUri, payment.amountPaise));
      } catch (error) {
        image.alt = "Payment QR unavailable";
        frame.classList.add("qr-error");
        var errorText = document.createElement("span");
        errorText.textContent = "Unable to generate QR";
        frame.appendChild(errorText);
      }
      if (image.src) frame.appendChild(image);

      var payLabel = document.createElement("p");
      payLabel.className = "pay-label";
      payLabel.textContent = "Pay " + money(payment.amountPaise);

      card.append(header, row, frame, payLabel);

      if (payment.paid) {
        var lock = document.createElement("div");
        lock.className = "paid-lock";
        lock.textContent = "🔒 Paid amount locked";
        card.appendChild(lock);
      }

      var paidButton = document.createElement("button");
      paidButton.className = "button " + (payment.paid ? "button-ghost" : "button-primary") + " paid-button";
      paidButton.type = "button";
      paidButton.disabled = payment.paid;
      paidButton.textContent = payment.paid ? "✓ PAID" : "Mark as Paid";
      paidButton.addEventListener("click", function () {
        payment.paid = true;
        renderTransaction();
      });
      card.appendChild(paidButton);
      el.qrList.appendChild(card);
    });
  }

  function renderMath() {
    el.mathBreakdown.textContent = "";

    if (state.alreadyPaidPaise > 0) {
      var subtraction = document.createElement("div");
      subtraction.className = "math-block";
      appendMathLine(subtraction, "  " + money(state.totalPaise));
      appendMathLine(subtraction, "- " + money(state.alreadyPaidPaise));
      appendMathLine(subtraction, "  " + money(state.remainingPaise), true);
      var subtractionLabel = document.createElement("p");
      subtractionLabel.className = "math-caption";
      subtractionLabel.textContent = "Remaining amount";
      var wrap = document.createElement("div");
      wrap.append(subtractionLabel, subtraction);
      el.mathBreakdown.appendChild(wrap);
    }

    var additionWrap = document.createElement("div");
    var additionLabel = document.createElement("p");
    additionLabel.className = "math-caption";
    additionLabel.textContent = "QR amount addition";
    var addition = document.createElement("div");
    addition.className = "math-block";
    state.qrPayments.forEach(function (payment, index) {
      appendMathLine(addition, (index === state.qrPayments.length - 1 ? "+ " : "  ") + money(payment.amountPaise));
    });
    appendMathLine(addition, "  " + money(state.remainingPaise) + "  ✓", true);
    additionWrap.append(additionLabel, addition);
    el.mathBreakdown.appendChild(additionWrap);

    var note = document.createElement("p");
    note.className = "math-note";
    note.textContent = "QR Total = Remaining Amount ✓ (" + money(sumAmounts(state.qrPayments)) + " = " + money(state.remainingPaise) + ")";
    el.mathBreakdown.appendChild(note);
    el.mathCheck.textContent = "✓ Totals match";
  }

  function appendMathLine(parent, text, total) {
    var line = document.createElement("div");
    line.className = "math-line" + (total ? " total" : "");
    line.textContent = text;
    parent.appendChild(line);
  }

  function editPayment(index, rawAmount) {
    var requested = parseMoney(rawAmount);
    var selected = state.qrPayments[index];
    if (!selected || selected.paid) return;

    if (requested === null || requested <= 0) {
      showToast("Enter a valid amount greater than ₹0.");
      renderTransaction();
      return;
    }
    if (requested > MAX_QR_AMOUNT_PAISE) {
      showToast("Each QR payment must be ₹1999 or less.");
      renderTransaction();
      return;
    }

    var difference = requested - selected.amountPaise;
    if (difference === 0) return;

    var next = state.qrPayments.map(function (item) {
      return { id: item.id, amountPaise: item.amountPaise, paid: item.paid };
    });
    next[index].amountPaise = requested;

    if (difference < 0) {
      var freed = -difference;
      for (var i = next.length - 1; i >= 0 && freed > 0; i -= 1) {
        if (i === index || next[i].paid) continue;
        var capacity = MAX_QR_AMOUNT_PAISE - next[i].amountPaise;
        if (capacity <= 0) continue;
        var moved = Math.min(capacity, freed);
        next[i].amountPaise += moved;
        freed -= moved;
      }
      while (freed > 0) {
        var chunk = Math.min(MAX_QR_AMOUNT_PAISE, freed);
        next.push(newPayment(chunk));
        freed -= chunk;
      }
    } else {
      var needed = difference;
      for (var j = next.length - 1; j >= 0 && needed > 0; j -= 1) {
        if (j === index || next[j].paid) continue;
        var removed = Math.min(next[j].amountPaise, needed);
        next[j].amountPaise -= removed;
        needed -= removed;
      }
      if (needed > 0) {
        showToast("That increase would require changing a paid QR. Choose a smaller amount.");
        renderTransaction();
        return;
      }
      next = next.filter(function (item) { return item.paid || item.amountPaise > 0; });
    }

    if (!validateCandidate(next)) {
      showToast("Unable to redistribute that amount safely.");
      renderTransaction();
      return;
    }

    state.qrPayments = next;
    renderTransaction();
  }

  function validateCandidate(list) {
    return list.length > 0 &&
      sumAmounts(list) === state.remainingPaise &&
      list.every(function (item) {
        return Number.isSafeInteger(item.amountPaise) && item.amountPaise > 0 && item.amountPaise <= MAX_QR_AMOUNT_PAISE;
      });
  }

  async function handleQrFile(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setSetupMessage("Please choose a PNG, JPG, JPEG or WebP image.");
      return;
    }

    setSetupMessage("Reading QR…", true);
    try {
      var decoded = await QRTools.decodeQrImage(file);
      acceptBusinessQr(decoded, "image");
    } catch (error) {
      setSetupMessage(error && error.message ? error.message : "Unable to read this QR image.");
    } finally {
      el.qrFileInput.value = "";
    }
  }

  function acceptBusinessQr(rawValue, source) {
    var parsed = QRTools.parseUpiUri(rawValue);
    if (!parsed) {
      setSetupMessage("QR scanned successfully, but it is not a valid UPI payment QR. Use 'Scan Any QR' if you only want to read its content.");
      return false;
    }
    state.pendingBusinessUri = rawValue.trim();
    el.decodedUpi.textContent = maskUpiUri(state.pendingBusinessUri);
    el.businessForm.hidden = false;
    setSetupMessage(source === "camera" ? "UPI QR scanned successfully." : "UPI QR image decoded successfully.", true);
    var pn = parsed.searchParams.get("pn");
    if (!el.businessName.value.trim() && pn) el.businessName.value = pn;
    el.businessName.focus();
    return true;
  }

  function maskUpiUri(uri) {
    var parsed = QRTools.parseUpiUri(uri);
    if (!parsed) return uri;
    var pa = parsed.searchParams.get("pa") || "";
    var at = pa.indexOf("@");
    if (at > 3) {
      var left = pa.slice(0, at);
      pa = left.slice(0, 2) + "••••" + left.slice(-2) + pa.slice(at);
    }
    return "upi://pay?pa=" + pa + (parsed.searchParams.get("pn") ? "&pn=" + parsed.searchParams.get("pn") : "");
  }

  function saveBusiness() {
    var name = el.businessName.value.trim();
    if (!state.pendingBusinessUri || !QRTools.parseUpiUri(state.pendingBusinessUri)) {
      setSetupMessage("Upload or scan a valid UPI business QR first.");
      return;
    }
    if (!name) {
      setSetupMessage("Enter the business name.");
      el.businessName.focus();
      return;
    }

    try {
      state.business = BusinessStorage.save(name, state.pendingBusinessUri);
      state.pendingBusinessUri = "";
      showDashboard();
      showToast("Business saved on this device.");
    } catch (error) {
      setSetupMessage("Unable to save business details in this browser.");
    }
  }

  function showSetup() {
    resetTransaction();
    stopScanner();
    state.business = null;
    state.pendingBusinessUri = "";
    el.dashboardView.hidden = true;
    el.setupView.hidden = false;
    el.businessForm.hidden = true;
    el.businessName.value = "";
    el.decodedUpi.textContent = "";
    el.merchantDetails.hidden = true;
    setSetupMessage("", false);
  }

  function showDashboard() {
    el.setupView.hidden = true;
    el.dashboardView.hidden = false;
    el.merchantName.textContent = state.business.businessName;
    el.merchantDetails.hidden = false;
    resetTransaction();
    window.setTimeout(function () { el.totalAmount.focus(); }, 0);
  }

  function requestChangeBusiness() {
    if (!window.confirm("Change the saved business QR? This removes the current saved business setup from this browser.")) return;
    BusinessStorage.clear();
    showSetup();
  }

  function showMerchantDetails() {
    if (!state.business) return;
    var parsed = QRTools.parseUpiUri(state.business.upiBaseUri);
    var pa = parsed ? parsed.searchParams.get("pa") : "";
    var masked = pa;
    if (pa) {
      var at = pa.indexOf("@");
      if (at > 4) masked = pa.slice(0, 2) + "••••" + pa.slice(at - 2);
    }
    window.alert("Business: " + state.business.businessName + "\nUPI: " + (masked || "Unavailable"));
  }

  function completePayment() {
    if (!state.qrPayments.length) {
      resetTransaction();
      return;
    }
    var hasUnpaid = state.qrPayments.some(function (item) { return !item.paid; });
    if (hasUnpaid) {
      el.confirmDialog.hidden = false;
      return;
    }
    finishPaymentSession();
  }

  function finishPaymentSession() {
    el.confirmDialog.hidden = true;
    resetTransaction();
    showToast("Payment session completed. Ready for the next customer.");
  }

  async function openScanner(purpose) {
    stopScanner();
    state.scannerPurpose = purpose || "generic";
    state.scannerLastValue = "";
    el.scannerResult.hidden = true;
    el.scannerResultText.textContent = "";
    el.useScannedBusiness.hidden = true;
    el.scannerStatus.textContent = "Requesting camera access…";
    el.scannerDialog.hidden = false;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      el.scannerStatus.textContent = "Camera scanning is not supported by this browser. Use QR image upload instead.";
      return;
    }

    try {
      state.scannerStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      el.scannerVideo.srcObject = state.scannerStream;
      await el.scannerVideo.play();
      el.scannerStatus.textContent = "Point the camera at a QR code.";
      scanCameraFrame();
    } catch (error) {
      el.scannerStatus.textContent = "Camera access failed. Allow camera permission or use QR image upload.";
    }
  }

  function stopScanner() {
    if (state.scannerTimer) {
      window.clearTimeout(state.scannerTimer);
      state.scannerTimer = null;
    }
    if (state.scannerStream) {
      state.scannerStream.getTracks().forEach(function (track) { track.stop(); });
      state.scannerStream = null;
    }
    if (el.scannerVideo) {
      el.scannerVideo.pause();
      el.scannerVideo.srcObject = null;
    }
  }

  function closeScanner() {
    stopScanner();
    el.scannerDialog.hidden = true;
  }

  async function scanCameraFrame() {
    if (!state.scannerStream || el.scannerDialog.hidden) return;
    try {
      var value = await decodeVideoFrame(el.scannerVideo);
      if (value) {
        handleScannedValue(value.trim());
        return;
      }
    } catch (error) {
      // Keep scanning; transient frame failures are expected.
    }
    state.scannerTimer = window.setTimeout(scanCameraFrame, CAMERA_SCAN_INTERVAL_MS);
  }

  async function decodeVideoFrame(video) {
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return "";

    if ("BarcodeDetector" in window) {
      try {
        if (!decodeVideoFrame.detector) decodeVideoFrame.detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        var codes = await decodeVideoFrame.detector.detect(video);
        if (codes && codes.length && codes[0].rawValue) return codes[0].rawValue;
      } catch (error) {
        decodeVideoFrame.detector = null;
      }
    }

    if (typeof window.jsQR !== "function") return "";
    if (!decodeVideoFrame.canvas) {
      decodeVideoFrame.canvas = document.createElement("canvas");
      decodeVideoFrame.context = decodeVideoFrame.canvas.getContext("2d", { willReadFrequently: true });
    }

    var canvas = decodeVideoFrame.canvas;
    var context = decodeVideoFrame.context;
    var maxWidth = 900;
    var scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    var pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    var result = window.jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" });
    return result && result.data ? result.data : "";
  }

  function handleScannedValue(value) {
    if (!value || value === state.scannerLastValue) return;
    state.scannerLastValue = value;
    stopScanner();
    el.scannerStatus.textContent = "QR decoded successfully.";
    el.scannerResult.hidden = false;
    el.scannerResultText.textContent = value;

    var isUpi = Boolean(QRTools.parseUpiUri(value));
    if (state.scannerPurpose === "business") {
      if (isUpi) {
        acceptBusinessQr(value, "camera");
        closeScanner();
      } else {
        el.scannerStatus.textContent = "QR decoded, but it is not a UPI payment QR. You can copy the decoded content below.";
      }
    } else {
      el.useScannedBusiness.hidden = !isUpi || Boolean(state.business);
    }
  }

  function copyScannerResult() {
    var value = el.scannerResultText.textContent;
    if (!value) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).then(function () { showToast("QR content copied."); }).catch(function () { fallbackCopy(value); });
    } else {
      fallbackCopy(value);
    }
  }

  function fallbackCopy(value) {
    var area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); showToast("QR content copied."); } catch (error) { showToast("Copy failed. Select the decoded text manually."); }
    area.remove();
  }

  function useGenericScanForBusiness() {
    var value = el.scannerResultText.textContent;
    if (!QRTools.parseUpiUri(value)) return;
    closeScanner();
    if (!state.business) {
      acceptBusinessQr(value, "camera");
      el.setupView.hidden = false;
    }
  }

  function cacheElements() {
    [
      "setup-view", "dashboard-view", "upload-dropzone", "qr-file-input", "setup-message", "business-form",
      "decoded-upi", "business-name", "save-business", "merchant-name", "change-business", "total-amount",
      "already-paid", "total-error", "paid-error", "amount-summary", "transaction-content", "no-payment",
      "progress-content", "accounting-content", "qr-count", "qr-list", "math-breakdown", "math-check",
      "complete-payment", "merchant-details", "toast", "confirm-dialog", "dialog-cancel", "dialog-confirm",
      "scan-business-qr", "scan-any-qr", "scanner-dialog", "scanner-close", "scanner-video", "scanner-status",
      "scanner-result", "scanner-result-text", "copy-scan-result", "use-scanned-business"
    ].forEach(function (id) {
      var key = id.replace(/-([a-z])/g, function (_, letter) { return letter.toUpperCase(); });
      el[key] = byId(id);
    });
  }

  function wireEvents() {
    el.qrFileInput.addEventListener("change", function (event) { handleQrFile(event.target.files[0]); });

    ["dragenter", "dragover"].forEach(function (type) {
      el.uploadDropzone.addEventListener(type, function (event) {
        event.preventDefault();
        el.uploadDropzone.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach(function (type) {
      el.uploadDropzone.addEventListener(type, function (event) {
        event.preventDefault();
        el.uploadDropzone.classList.remove("dragover");
      });
    });
    el.uploadDropzone.addEventListener("drop", function (event) {
      var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      handleQrFile(file);
    });

    el.saveBusiness.addEventListener("click", saveBusiness);
    el.businessName.addEventListener("keydown", function (event) { if (event.key === "Enter") saveBusiness(); });
    el.changeBusiness.addEventListener("click", requestChangeBusiness);
    el.merchantDetails.addEventListener("click", showMerchantDetails);
    el.totalAmount.addEventListener("input", debounceGenerate);
    el.alreadyPaid.addEventListener("input", debounceGenerate);
    el.completePayment.addEventListener("click", completePayment);
    el.dialogCancel.addEventListener("click", function () { el.confirmDialog.hidden = true; });
    el.dialogConfirm.addEventListener("click", finishPaymentSession);

    el.scanBusinessQr.addEventListener("click", function () { openScanner("business"); });
    el.scanAnyQr.addEventListener("click", function () { openScanner("generic"); });
    el.scannerClose.addEventListener("click", closeScanner);
    el.copyScanResult.addEventListener("click", copyScannerResult);
    el.useScannedBusiness.addEventListener("click", useGenericScanForBusiness);

    el.scannerDialog.addEventListener("click", function (event) {
      if (event.target === el.scannerDialog) closeScanner();
    });
    window.addEventListener("pagehide", stopScanner);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && !el.scannerDialog.hidden) closeScanner();
    });
  }

  function init() {
    cacheElements();
    wireEvents();
    state.business = BusinessStorage.load();
    if (state.business && QRTools.parseUpiUri(state.business.upiBaseUri)) {
      showDashboard();
    } else {
      if (state.business) BusinessStorage.clear();
      showSetup();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
}());
