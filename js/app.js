(function () {
  "use strict";

  var MAX_QR_AMOUNT_PAISE = 199900;
  var DEBOUNCE_MS = 190;
  var state = {
    business: null,
    totalPaise: 0,
    alreadyPaidPaise: 0,
    remainingPaise: 0,
    qrPayments: [],
    amountTimer: null,
    pendingBusinessUri: ""
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
  function validateSplit() {
    if (state.remainingPaise === 0) return state.qrPayments.length === 0;
    return state.qrPayments.length > 0 &&
      sumAmounts(state.qrPayments) === state.remainingPaise &&
      state.qrPayments.every(function (item) {
        return Number.isSafeInteger(item.amountPaise) && item.amountPaise > 0 && item.amountPaise <= MAX_QR_AMOUNT_PAISE;
      });
  }
  function paymentsFromAmounts(amounts) {
    return amounts.map(function (amount) {
      return { id: "payment-" + Math.random().toString(36).slice(2), amountPaise: amount, paid: false };
    });
  }
  function resetTransaction() {
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
  function updateAmountSummary() {
    if (state.totalPaise <= 0 || state.alreadyPaidPaise < 0 || state.alreadyPaidPaise > state.totalPaise) {
      el.amountSummary.hidden = true;
      return;
    }
    el.amountSummary.hidden = false;
    if (state.remainingPaise === 0) {
      el.amountSummary.innerHTML = "Total " + money(state.totalPaise) + " &minus; already paid " + money(state.alreadyPaidPaise) + " = <strong>No remaining payment required.</strong>";
    } else {
      el.amountSummary.innerHTML = "Total " + money(state.totalPaise) + " &minus; already paid " + money(state.alreadyPaidPaise) + " = <strong>" + money(state.remainingPaise) + " remaining</strong>";
    }
  }
  function applyAmounts(amounts) {
    state.qrPayments = paymentsFromAmounts(amounts);
    renderTransaction();
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
    applyAmounts(splitAmount(state.remainingPaise));
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
    var qrPaid = state.qrPayments.reduce(function (total, item) { return total + (item.paid ? item.amountPaise : 0); }, 0);
    var pending = state.remainingPaise - qrPaid;
    var complete = pending === 0;
    el.progressContent.innerHTML = "";
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
    var qrPaid = state.qrPayments.reduce(function (total, item) { return total + (item.paid ? item.amountPaise : 0); }, 0);
    var accounted = state.alreadyPaidPaise + qrPaid;
    el.accountingContent.innerHTML = "";
    addStat(el.accountingContent, "Total to collect", money(state.totalPaise));
    addStat(el.accountingContent, "Accounted so far", money(accounted));
    addStat(el.accountingContent, "Unpaid QR amount", money(state.remainingPaise - qrPaid), (state.remainingPaise - qrPaid) ? "pending" : "complete");
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
    el.qrList.innerHTML = "";
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
      }
      frame.appendChild(image);
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
    var lines = document.createElement("div");
    lines.className = "math-lines";
    state.qrPayments.forEach(function (payment, index) {
      var line = document.createElement("div");
      line.className = "math-line";
      line.textContent = (index === state.qrPayments.length - 1 ? "+ " : "  ") + money(payment.amountPaise);
      lines.appendChild(line);
    });
    var totalLine = document.createElement("div");
    totalLine.className = "math-line total";
    totalLine.textContent = "  " + money(state.remainingPaise) + "  ✓";
    lines.appendChild(totalLine);
    el.mathBreakdown.innerHTML = "";
    el.mathBreakdown.appendChild(lines);
    var note = document.createElement("p");
    note.className = "math-note";
    note.textContent = "QR Total = Remaining Amount ✓ (" + money(sumAmounts(state.qrPayments)) + " = " + money(state.remainingPaise) + ")";
    el.mathBreakdown.appendChild(note);
    el.mathCheck.textContent = "✓ Totals match";
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
      var add = -difference;
      for (var i = next.length - 1; i >= 0 && add > 0; i -= 1) {
        if (i === index || next[i].paid) continue;
        var capacity = MAX_QR_AMOUNT_PAISE - next[i].amountPaise;
        var moved = Math.min(capacity, add);
        next[i].amountPaise += moved;
        add -= moved;
      }
      while (add > 0) {
        var chunk = Math.min(MAX_QR_AMOUNT_PAISE, add);
        next.push({ id: "payment-" + Math.random().toString(36).slice(2), amountPaise: chunk, paid: false });
        add -= chunk;
      }
    } else {
      var take = difference;
      for (var j = next.length - 1; j >= 0 && take > 0; j -= 1) {
        if (j === index || next[j].paid) continue;
        var available = next[j].amountPaise;
        var removed = Math.min(available, take);
        next[j].amountPaise -= removed;
        take -= removed;
      }
      if (take > 0) {
        showToast("That increase would require changing a paid QR. Edit a smaller amount.");
        renderTransaction();
        return;
      }
      next = next.filter(function (item) { return item.amountPaise > 0 || item.paid; });
    }
    if (next.some(function (item) { return item.amountPaise <= 0 || item.amountPaise > MAX_QR_AMOUNT_PAISE; }) || sumAmounts(next) !== state.remainingPaise) {
      showToast("This edit cannot preserve the payment total.");
      renderTransaction();
      return;
    }
    state.qrPayments = next;
    renderTransaction();
  }

  async function handleQrFile(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setSetupMessage("Please choose a PNG, JPG, JPEG or WebP image.");
      return;
    }
    setSetupMessage("Reading your QR locally…", true);
    try {
      var raw = await QRTools.decodeQrImage(file);
      var parsed = QRTools.parseUpiUri(raw);
      if (!parsed) throw new Error("This QR does not appear to contain a valid UPI payment address. Please upload a UPI payment QR.");
      state.pendingBusinessUri = parsed.toString();
      el.decodedUpi.textContent = parsed.searchParams.get("pa") + " · UPI payment address found";
      el.businessForm.hidden = false;
      setSetupMessage("");
      el.businessName.focus();
    } catch (error) {
      el.businessForm.hidden = true;
      setSetupMessage(error && error.message ? error.message : "Unable to read this image. Please try a clearer QR image.");
    }
  }
  function showSetup() {
    el.setupView.hidden = false;
    el.dashboardView.hidden = true;
    el.merchantDetails.hidden = true;
    el.businessForm.hidden = true;
    el.qrFileInput.value = "";
    setSetupMessage("");
  }
  function showDashboard() {
    el.setupView.hidden = true;
    el.dashboardView.hidden = false;
    el.merchantName.textContent = state.business.businessName;
    el.merchantDetails.hidden = false;
    resetTransaction();
  }
  function saveBusiness() {
    var name = el.businessName.value.trim();
    if (!name) {
      showToast("Enter a business name to continue.");
      el.businessName.focus();
      return;
    }
    state.business = BusinessStorage.save(name, state.pendingBusinessUri);
    showDashboard();
  }
  function changeBusiness() {
    if (!window.confirm("Change the saved business QR? The current transaction will be cleared.")) return;
    BusinessStorage.clear();
    state.business = null;
    resetTransaction();
    showSetup();
  }
  function merchantDetails() {
    if (!state.business) return;
    var parsed = QRTools.parseUpiUri(state.business.upiBaseUri);
    var pa = parsed ? parsed.searchParams.get("pa") : "";
    var masked = pa;
    if (pa && pa.indexOf("@") > 1) masked = pa.slice(0, Math.min(2, pa.indexOf("@"))) + "******" + pa.slice(pa.indexOf("@"));
    showToast(state.business.businessName + " · " + masked);
  }
  function finishPayment() {
    var unpaid = state.qrPayments.some(function (payment) { return !payment.paid; });
    if (unpaid) {
      el.confirmDialog.hidden = false;
      el.dialogConfirm.focus();
    } else {
      resetTransaction();
      showToast("Payment session completed. Ready for the next customer.");
    }
  }
  function finishConfirmed() {
    el.confirmDialog.hidden = true;
    resetTransaction();
    showToast("Payment session completed. Ready for the next customer.");
  }

  function cacheElements() {
    [
      "setup-view", "dashboard-view", "upload-dropzone", "qr-file-input", "setup-message", "business-form",
      "decoded-upi", "business-name", "save-business", "merchant-name", "change-business", "total-amount",
      "already-paid", "total-error", "paid-error", "amount-summary", "transaction-content", "no-payment",
      "progress-content", "accounting-content", "qr-count", "qr-list", "math-breakdown", "math-check",
      "complete-payment", "merchant-details", "toast", "confirm-dialog", "dialog-cancel", "dialog-confirm"
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
    el.uploadDropzone.addEventListener("drop", function (event) { handleQrFile(event.dataTransfer.files[0]); });
    el.saveBusiness.addEventListener("click", saveBusiness);
    el.businessName.addEventListener("keydown", function (event) { if (event.key === "Enter") saveBusiness(); });
    el.changeBusiness.addEventListener("click", changeBusiness);
    el.totalAmount.addEventListener("input", debounceGenerate);
    el.alreadyPaid.addEventListener("input", debounceGenerate);
    el.completePayment.addEventListener("click", finishPayment);
    el.dialogCancel.addEventListener("click", function () { el.confirmDialog.hidden = true; });
    el.dialogConfirm.addEventListener("click", finishConfirmed);
    el.merchantDetails.addEventListener("click", merchantDetails);
  }
  function init() {
    cacheElements();
    wireEvents();
    state.business = BusinessStorage.load();
    if (state.business && QRTools.parseUpiUri(state.business.upiBaseUri)) showDashboard();
    else showSetup();
  }
  document.addEventListener("DOMContentLoaded", init);
}());