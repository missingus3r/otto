// otto — web-push client. Exposes window.enableNotifications() and a
// convenience handler for buttons with [data-push-enable].

(function () {
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  async function enableNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Tu navegador no soporta notificaciones push.');
      return false;
    }

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      alert('Permiso denegado.');
      return false;
    }

    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const keyResp = await fetch('/push/key');
    const { key } = await keyResp.json();
    if (!key) {
      alert('Servidor sin VAPID configurado.');
      return false;
    }

    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }

    const r = await fetch('/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    });
    if (!r.ok) {
      alert('No se pudo guardar la suscripción.');
      return false;
    }

    alert('Notificaciones activadas.');
    return true;
  }

  window.enableNotifications = enableNotifications;

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-push-enable]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        enableNotifications().catch(function (err) {
          console.error('[push]', err);
          alert('Error: ' + err.message);
        });
      });
    });
  });
})();
