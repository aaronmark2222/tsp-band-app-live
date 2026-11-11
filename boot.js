// Runs before app.js (kept out of index.html so the page needs no inline script).
// The sign-in form stays hidden (so password managers don't pop up) unless
// this device has no saved sign-in; the app shows it later if one fails.
(function () {
  try {
    var signedIn = Object.keys(localStorage).some(function (k) { return /^sb-.*-auth-token$/.test(k) && localStorage.getItem(k); });
    if (!signedIn) {
      document.getElementById('login-screen').classList.remove('hidden');
      document.getElementById('loading').classList.add('hidden');
    }
  } catch (e) {
    document.getElementById('login-screen').classList.remove('hidden');
  }
})();
