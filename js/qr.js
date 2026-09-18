(function () {
  "use strict";

  function parseUpiUri(value) {
    if (typeof value !== "string") return null;
    var text = value.trim();
    if (!/^upi:\/\//i.test(text)) return null;

    var parsed;
    try {
      parsed = new URL(text);
    } catch (error) {
      return null;
    }
    if (parsed.protocol.toLowerCase() !== "upi:" || parsed.hostname.toLowerCase() !== "pay") return null;
    var pa = parsed.searchParams.get("pa");
    if (!pa || !/^[^@\s/?]+@[^@\s/?]+$/.test(pa)) return null;
    return parsed;
  }

  function buildPaymentUri(baseUri, amountPaise) {
    var parsed = parseUpiUri(baseUri);
    if (!parsed) throw new Error("This QR is not a valid UPI payment QR.");
    parsed.searchParams.set("am", (amountPaise / 100).toFixed(2));
    parsed.searchParams.set("cu", "INR");
    return parsed.toString();
  }

  function qrImageDataUri(value) {
    if (typeof window.qrcode !== "function") throw new Error("QR generation library is unavailable.");
    var qr = window.qrcode(0, "M");
    qr.addData(value);
    qr.make();
    var tag = qr.createImgTag(5, 4);
    var match = tag.match(/src="([^"]+)"/i);
    if (!match) throw new Error("Unable to generate payment QR.");
    return match[1];
  }

  async function decodeQrImage(file) {
    var image = await loadImage(file);
    var nativeError = null;

    if ("BarcodeDetector" in window) {
      try {
        var detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        var nativeCodes = await detector.detect(image);
        if (nativeCodes && nativeCodes.length && nativeCodes[0].rawValue) return nativeCodes[0].rawValue.trim();
      } catch (error) {
        nativeError = error;
      }
    }

    if (typeof window.jsQR !== "function") {
      throw new Error(nativeError ? "Unable to read this image. Try a clearer QR image." : "The local QR decoder is unavailable.");
    }

    var canvas = document.createElement("canvas");
    var context = canvas.getContext("2d", { willReadFrequently: true });
    var maxDimension = 1800;
    var scale = Math.min(1, maxDimension / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    var pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    var result = window.jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" });
    if (!result || !result.data) throw new Error("Unable to find a QR code in this image.");
    return result.data.trim();
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Unable to open this image. Please choose a valid PNG, JPG or WebP file."));
      };
      image.src = url;
    });
  }

  window.QRTools = {
    parseUpiUri: parseUpiUri,
    buildPaymentUri: buildPaymentUri,
    qrImageDataUri: qrImageData,
    decodeQrImage: decodeQrImage
  };
}());