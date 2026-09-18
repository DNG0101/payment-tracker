(function () {
  "use strict";

  var STORAGE_KEY = "upi-splitter-business-v1";

  function loadBusiness() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || typeof data.businessName !== "string" || typeof data.upiBaseUri !== "string") return null;
      return data;
    } catch (error) {
      return null;
    }
  }

  function saveBusiness(businessName, upiBaseUri) {
    var data = { businessName: businessName, upiBaseUri: upiBaseUri };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return data;
  }

  function clearBusiness() {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  window.BusinessStorage = {
    load: loadBusiness,
    save: saveBusiness,
    clear: clearBusiness
  };
}());