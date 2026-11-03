/* =========================================================================
   KEEP-ALIVE PING PARA RENDER (DESPERTADOR AUTOMÁTICO CADA 10 MINUTOS)
   Evita que la instancia gratuita de Render entre en reposo mientras la pantalla esté abierta.
   ========================================================================= */
(function() {
  'use strict';
  const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutos (600,000 ms)

  function pingRenderServer() {
    // Solo enviar ping si la pestaña o ventana está activa o abierta
    fetch('/ping', { credentials: 'same-origin', cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        // Servidor activo
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          // Silencioso en local
        } else {
          console.log('[Render-KeepAlive] Pong recibido:', data.status);
        }
      })
      .catch(err => {
        console.warn('[Render-KeepAlive] Error al despertar servidor Render:', err);
      });
  }

  // Primer ping inicial diferido a los 10 segundos
  setTimeout(pingRenderServer, 10000);
  // Intervalo recurrente cada 10 minutos
  setInterval(pingRenderServer, PING_INTERVAL_MS);
})();
