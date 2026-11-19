/* =========================================================================
   FARMACIA DAVALSI — RESPALDO LOCAL (BACKUP) EN 1 CLIC
   - Botón "💾 Respaldo" en el POS (dock inferior izquierdo + menú de usuario).
   - Descarga un ZIP con la base de datos SQLite completa de la farmacia,
     inventario.csv, ventas_del_dia.csv y detalle_ventas_del_dia.csv (abren en Excel).
   - El servidor además guarda automáticamente 1 respaldo diario en
     farmacia-davalsi/respaldos (conserva los últimos 14).
   ========================================================================= */
(function () {
  'use strict';

  class FarmaBackupManager {
    constructor() {
      this.isDownloading = false;
      setTimeout(() => this.injectButton(), 900);
    }

    injectButton() {
      let dock = document.getElementById('davalsi-quick-dock');
      if (!dock) {
        dock = document.createElement('div');
        dock.id = 'davalsi-quick-dock';
        dock.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:9990;display:flex;gap:8px;';
        document.body.appendChild(dock);
      }
      if (document.getElementById('btn-davalsi-backup')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'btn-davalsi-backup';
      btn.title = 'Descargar copia de seguridad completa (base de datos + Excel de inventario y ventas del día)';
      btn.className = 'px-3 py-2 rounded-2xl bg-slate-900/95 hover:bg-slate-800 text-sky-300 font-black text-xs shadow-lg border border-sky-500/40 flex items-center gap-1.5 cursor-pointer';
      btn.innerHTML = '<span>💾</span><span>Respaldo</span>';
      btn.onclick = () => this.openModal();
      dock.appendChild(btn);
    }

    isLoggedIn() {
      if (window.sysState && window.sysState.sessionToken) return true;
      try {
        const auth = JSON.parse(sessionStorage.getItem('davalsi_sys_auth') || '{}');
        return Boolean(auth.token);
      } catch (e) {
        return false;
      }
    }

    async openModal() {
      let modal = document.getElementById('davalsi-backup-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'davalsi-backup-modal';
        modal.className = 'fixed inset-0 z-[99998] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4';
        modal.addEventListener('click', (ev) => { if (ev.target === modal) modal.classList.add('hidden'); });
        document.body.appendChild(modal);
      }
      modal.classList.remove('hidden');
      this.render({ cargando: true });

      if (!this.isLoggedIn()) {
        this.render({ error: 'Inicie sesión como administrador de la farmacia para usar los respaldos.' });
        return;
      }
      try {
        const res = await fetch('/api/backup/list');
        const data = await res.json();
        this.render({ respaldos: (data && data.respaldos) || [], carpeta: data && data.carpeta, error: data && data.ok ? '' : (data && data.error) });
      } catch (e) {
        this.render({ respaldos: [], error: 'No se pudo consultar la lista de respaldos.' });
      }
    }

    render(opts) {
      const modal = document.getElementById('davalsi-backup-modal');
      if (!modal) return;
      const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
      const lista = (opts.respaldos || []).slice(0, 10).map(r => `
        <li class="flex justify-between text-xs py-1 border-b border-slate-800">
          <span class="font-mono text-slate-300">${esc(r.archivo)}</span>
          <span class="text-slate-400">${esc(r.fecha)} · ${esc(r.tamano_kb)} KB</span>
        </li>`).join('');

      modal.innerHTML = `
        <div class="w-full max-w-2xl bg-slate-950 border-2 border-sky-500/60 rounded-3xl shadow-2xl overflow-hidden text-slate-100">
          <div class="px-5 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
            <div>
              <div class="text-base font-black text-sky-300">💾 Respaldo Local de la Farmacia</div>
              <div class="text-[11px] text-slate-400">Copia completa: inventario, ventas, cierres de caja, deudores, recetas y configuración.</div>
            </div>
            <button type="button" onclick="document.getElementById('davalsi-backup-modal').classList.add('hidden')" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black text-xs cursor-pointer">✕ Cerrar</button>
          </div>
          <div class="p-5 space-y-4">
            ${opts.error ? `<div class="p-3 rounded-xl bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs font-bold">${esc(opts.error)}</div>` : ''}
            <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-1">
              <div>📦 <strong>base_datos/*.db</strong> — copia exacta de la base de datos (para restaurar el sistema).</div>
              <div>📊 <strong>inventario.csv</strong> — todos los productos con stock, lote, vencimiento, costo y precio (Excel).</div>
              <div>🧾 <strong>ventas_del_dia.csv</strong> y <strong>detalle_ventas_del_dia.csv</strong> — ventas de hoy (Excel).</div>
              <div>📄 <strong>LEEME_RESTAURAR.txt</strong> — pasos para restaurar.</div>
            </div>
            <button type="button" id="btn-davalsi-backup-download" ${opts.cargando || opts.error ? 'disabled' : ''}
              onclick="window.farmaBackup.download()"
              class="w-full px-5 py-3 rounded-2xl ${opts.cargando || opts.error ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-400 hover:to-teal-400 text-slate-950 cursor-pointer'} font-black text-sm shadow-lg">
              ${opts.cargando ? 'Cargando…' : '⬇️ Descargar Respaldo Completo Ahora (.zip)'}
            </button>
            <div class="text-[11px] text-slate-400">
              🔁 <strong>Respaldo automático diario:</strong> el servidor guarda 1 copia por día en
              <span class="font-mono text-slate-300">${esc(opts.carpeta || 'farmacia-davalsi/respaldos')}</span> (últimos 14 días).
              Copie esa carpeta a una memoria USB o a la nube periódicamente.
            </div>
            ${lista ? `<div><div class="text-[10px] font-black uppercase text-slate-400 mb-1">Últimos respaldos automáticos</div><ul>${lista}</ul></div>` : ''}
          </div>
        </div>`;
    }

    async download() {
      if (this.isDownloading) return;
      this.isDownloading = true;
      const btn = document.getElementById('btn-davalsi-backup-download');
      if (btn) btn.textContent = '⏳ Generando respaldo…';
      try {
        const res = await fetch('/api/backup/download');
        if (!res.ok) {
          let msg = 'No se pudo generar el respaldo.';
          try { msg = (await res.json()).error || msg; } catch (e) {}
          throw new Error(msg);
        }
        const blob = await res.blob();
        const cd = res.headers.get('Content-Disposition') || '';
        const m = cd.match(/filename="([^"]+)"/);
        const filename = m ? m[1] : `Respaldo_Farmacia_Davalsi_${new Date().toISOString().slice(0, 10)}.zip`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);

        const nProd = res.headers.get('X-Backup-Productos') || '0';
        const nVentas = res.headers.get('X-Backup-Ventas-Hoy') || '0';
        if (typeof window.showToast === 'function') {
          window.showToast(`💾 Respaldo descargado: ${nProd} productos y ${nVentas} ventas de hoy.`);
        }
        if (window.farmaUnifiedAgent) {
          window.farmaUnifiedAgent.say(
            `Respaldo completo descargado con ${nProd} productos y ${nVentas} ventas del día. Guárdalo en una memoria USB o en la nube.`,
            'Respaldo Local',
            7
          );
        }
        this.openModal();
      } catch (e) {
        alert(e.message || 'Error al descargar el respaldo.');
        if (btn) btn.textContent = '⬇️ Descargar Respaldo Completo Ahora (.zip)';
      } finally {
        this.isDownloading = false;
      }
    }
  }

  window.farmaBackup = new FarmaBackupManager();
})();
