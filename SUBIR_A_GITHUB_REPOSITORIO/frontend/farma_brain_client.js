/* =========================================================================
   FARMA-BRAIN CLIENT INTEGRATION ENGINE (POS & INVENTARIO)
   Conecta la interfaz del POS y la carga de inventario con /api/farma/asistir
   y /api/inventory/batch-analysis.
   ========================================================================= */

(function() {
  'use strict';

  window.FarmaBrainClient = {
    // 1. Invocar asistencia clínica en vivo (Sustituciones, Alergias, Interacciones, Diálogo 3D)
    asistirCheckout: async function(medicamentoBuscado = '', onRiskDetected = null) {
      try {
        const cartItems = (typeof window.posCart !== 'undefined' && Array.isArray(window.posCart)) 
          ? window.posCart 
          : [];
        
        let pacienteData = {};
        const cedulaInp = document.getElementById('pos-client-cedula');
        const nombreInp = document.getElementById('pos-client-name');
        const telInp = document.getElementById('pos-client-phone');
        if (cedulaInp && cedulaInp.value) pacienteData.cedula = cedulaInp.value.trim();
        if (nombreInp && nombreInp.value) pacienteData.nombre_completo = nombreInp.value.trim();
        if (telInp && telInp.value) pacienteData.telefono = telInp.value.trim();

        const farmaciaId = (window.sysState && window.sysState.activeFarmaciaId) ? window.sysState.activeFarmaciaId : 1;

        const payload = {
          farmacia_id: farmaciaId,
          medicamento_buscado: medicamentoBuscado,
          items: cartItems,
          paciente: pacienteData
        };

        const res = await fetch('/api/farma/asistir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.ok) {
          window.FarmaBrainClient.renderFarmaDialogue(data);
          if (data.bloquear_cobro) {
            window.FarmaBrainClient.enforceCheckoutBlock(data);
            if (typeof onRiskDetected === 'function') onRiskDetected(data);
          } else {
            window.FarmaBrainClient.releaseCheckoutBlock();
          }
          return data;
        }
      } catch (e) {
        console.warn('[FarmaBrainClient] Error en asistirCheckout:', e);
      }
      return null;
    },

    // 2. Renderizar burbuja de diálogo 3D del robot Farma
    renderFarmaDialogue: function(data) {
      const bubble = document.getElementById('pos-cross-selling-container');
      const textEl = document.getElementById('pos-cross-selling-dialogue');
      const tagBadge = document.getElementById('pos-cross-selling-tag-badge');
      const triggerPill = document.getElementById('pos-cross-selling-trigger-pill');
      const cardsEl = document.getElementById('pos-cross-selling-cards');

      if (!bubble || !textEl) return;

      bubble.classList.remove('hidden');

      if (data.nivel_riesgo === 'ROJO') {
        bubble.className = 'p-3.5 rounded-2xl border-2 border-rose-500 bg-rose-50 space-y-2 shadow-md animate-pulse';
        if (tagBadge) {
          tagBadge.className = 'text-[10px] font-black px-2 py-0.5 rounded-lg bg-rose-600 text-white border border-rose-700';
          tagBadge.textContent = '🚨 BLOQUEO CLÍNICO';
        }
        if (triggerPill) {
          triggerPill.className = 'px-2 py-0.2 rounded-full text-[9px] font-black bg-rose-600 text-white tracking-wider';
          triggerPill.textContent = 'INTERACCIÓN SEVERA / ALERGIA';
        }
      } else if (data.nivel_riesgo === 'AMARILLO') {
        bubble.className = 'p-3.5 rounded-2xl border-2 border-amber-400 bg-amber-50 space-y-2 shadow-sm';
        if (tagBadge) {
          tagBadge.className = 'text-[10px] font-black px-2 py-0.5 rounded-lg bg-amber-500 text-slate-950 border border-amber-600';
          tagBadge.textContent = '⚠️ PRECAUCIÓN';
        }
        if (triggerPill) {
          triggerPill.className = 'px-2 py-0.2 rounded-full text-[9px] font-black bg-amber-500 text-slate-950 tracking-wider';
          triggerPill.textContent = 'AJUSTE CLÍNICO';
        }
      } else {
        bubble.className = 'p-3.5 rounded-2xl border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 space-y-2 shadow-sm';
        if (tagBadge) {
          tagBadge.className = 'text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-800 border border-indigo-200';
          tagBadge.textContent = 'Clínico Farma';
        }
        if (triggerPill) {
          triggerPill.className = 'px-2 py-0.2 rounded-full text-[9px] font-black bg-indigo-600 text-white tracking-wider';
          triggerPill.textContent = 'COPILOTO EN VIVO';
        }
      }

      textEl.textContent = data.farma_dialogo || 'Parámetros evaluados correctamente.';

      // Renderizar sustituciones si las hay
      if (cardsEl && data.sustituciones_disponibles && data.sustituciones_disponibles.length > 0) {
        cardsEl.innerHTML = data.sustituciones_disponibles.map(s => `
          <div class="p-2.5 rounded-xl bg-white border border-indigo-200 flex items-center justify-between shadow-2xs">
            <div>
              <div class="flex items-center gap-1.5">
                <span class="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-900">${s.tipo.split(' ')[0]}</span>
                <p class="font-extrabold text-xs text-indigo-950">${s.nombre_comercial}</p>
              </div>
              <p class="text-[10px] text-slate-500">${s.principio_activo_dci} • ${s.concentracion} • ${s.ubicacion_anaquel}</p>
            </div>
            <button type="button" onclick="if(typeof addPosProductById==='function'){addPosProductById(${s.producto_id});}" class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] shadow-xs cursor-pointer">
              + Seleccionar (RD$ ${parseFloat(s.precio_venta).toFixed(2)})
            </button>
          </div>
        `).join('');
      }

      // Animación del avatar 3D si existe
      if (typeof triggerPosFarmaIa3dReaction === 'function') {
        triggerPosFarmaIa3dReaction();
      }
    },

    // 3. Bloqueo visual estricto de facturación si hay riesgo ROJO
    enforceCheckoutBlock: function(data) {
      const cobroBtn = document.getElementById('btn-cobrar-factura');
      if (cobroBtn) {
        cobroBtn.disabled = true;
        cobroBtn.classList.add('opacity-50', 'cursor-not-allowed', 'bg-rose-600');
        cobroBtn.classList.remove('bg-emerald-600', 'bg-teal-600');
        cobroBtn.innerHTML = '🚫 FACTURACIÓN BLOQUEADA POR RIESGO CLÍNICO ROJO';
      }
    },

    releaseCheckoutBlock: function() {
      const cobroBtn = document.getElementById('btn-cobrar-factura');
      if (cobroBtn) {
        cobroBtn.disabled = false;
        cobroBtn.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-rose-600');
        cobroBtn.classList.add('bg-emerald-600');
        cobroBtn.innerHTML = '🧾 Facturar e Imprimir Recibo';
      }
    },

    // 4. Auditoría de lote al cerrar carga de inventario
    
    // 5. Cargar panel "Renovaciones del Día" (≤ 5 días de tratamiento crónico)
    cargarRenovacionesDelDia: async function(farmaciaId = 1) {
      const container = document.getElementById('pos-renovaciones-cards-list');
      const badge = document.getElementById('pos-renovaciones-count-badge');
      if (!container) return;

      try {
        const res = await fetch(`/api/adherencia/renovaciones?farmacia_id=${farmaciaId}&dias=5`);
        const data = await res.json();
        if (!data.ok || !data.renovaciones) {
          container.innerHTML = '<div class="p-3 text-center text-slate-400 text-xs col-span-2">No hay pacientes próximos a agotar medicación.</div>';
          if (badge) badge.textContent = '0 Pacientes';
          return;
        }

        const items = data.renovaciones;
        if (badge) badge.textContent = `${items.length} Pacientes`;

        if (items.length === 0) {
          container.innerHTML = '<div class="p-3 text-center text-emerald-700 bg-emerald-50 rounded-xl font-bold text-xs col-span-2">✅ Todos los pacientes crónicos están al día con su tratamiento.</div>';
          return;
        }

        container.innerHTML = items.map(r => {
          const dias = r.dias_restantes;
          const statusBg = dias <= 2 ? 'bg-rose-100 text-rose-900 border-rose-300' : 'bg-amber-100 text-amber-900 border-amber-300';
          const stockBadge = r.hay_stock 
            ? `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800">Stock: ${r.stock_disponible} unid. disp.</span>`
            : `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-rose-600 text-white animate-pulse">AGOTADO (Sugerir Sustituto)</span>`;

          let sustitutosHtml = '';
          if (!r.hay_stock && r.sustitutos_sugeridos && r.sustitutos_sugeridos.length > 0) {
            const s = r.sustitutos_sugeridos[0];
            sustitutosHtml = `
              <div class="mt-1 p-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-[10px] text-indigo-950 flex items-center justify-between">
                <span>🔄 <strong>Sustituto en stock:</strong> ${s.nombre_comercial} (${s.ubicacion_anaquel})</span>
                <button type="button" onclick="if(typeof addPosProductById==='function'){addPosProductById(${s.producto_id});}" class="px-2 py-0.5 rounded bg-indigo-600 text-white font-bold text-[9px] hover:bg-indigo-700 cursor-pointer">+ Cargar</button>
              </div>
            `;
          }

          return `
            <div class="p-3 rounded-2xl bg-white border border-teal-200 shadow-2xs space-y-1.5">
              <div class="flex items-start justify-between gap-1.5">
                <div>
                  <div class="flex items-center gap-1.5">
                    <span class="px-2 py-0.5 rounded-full text-[9px] font-black border ${statusBg}">Quedan ${Math.max(0, dias)} días</span>
                    <strong class="text-xs font-black text-slate-900">${r.paciente_nombre}</strong>
                  </div>
                  <p class="text-[11px] font-bold text-teal-800">${r.medicamento_nombre} <span class="text-slate-500 font-normal">(${r.dosis_diaria})</span></p>
                </div>
                ${stockBadge}
              </div>
              
              <div class="flex items-center justify-between text-[10px] text-slate-600 bg-slate-50 p-1.5 rounded-lg">
                <span>Agotamiento: <strong>${r.fecha_estimada_agotamiento}</strong></span>
                <span class="text-emerald-700 font-black">Desc. Fidelidad: ${r.descuento_fidelizacion_pct}% (RD$ ${parseFloat(r.precio_final_fidelizado).toFixed(2)})</span>
              </div>

              ${sustitutosHtml}

              <div class="flex items-center justify-between pt-1">
                <a href="${r.whatsapp_link}" target="_blank" class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] flex items-center gap-1 shadow-2xs transition">
                  <span>📱</span> <span>[Enviar aviso por WhatsApp]</span>
                </a>
                ${r.hay_stock ? `
                  <button type="button" onclick="if(typeof addPosProductById==='function'){addPosProductById(${r.producto_id});} if(typeof showToast==='function'){showToast('Cargado tratamiento fidelizado de ${r.paciente_nombre}');}" class="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10px] cursor-pointer">
                    ⚡ Despachar en Caja
                  </button>
                ` : ''}
              </div>
            </div>
          `;
        }).join('');
      } catch (e) {
        console.warn('[FarmaBrainClient] Error en cargarRenovacionesDelDia:', e);
      }
    }

    analizarLoteInventario: async function(farmaciaId = 1) {
      try {
        const res = await fetch('/api/inventory/batch-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ farmacia_id: farmaciaId })
        });
        const data = await res.json();
        if (data.ok && typeof showToast === 'function') {
          showToast(`🤖 FarmaBrain: ${data.resumen.lotes_vencimiento_7_meses} lotes a vencer en 7 meses y ${data.resumen.kits_propuestos_count} kits sugeridos.`, 'info');
        }
        return data;
      } catch (e) {
        console.warn('[FarmaBrainClient] Error en analizarLoteInventario:', e);
      }
      return null;
    }
  };

  // Escuchar cambios en la cédula del cliente en el mostrador para auditar automáticamente
  document.addEventListener('DOMContentLoaded', () => {
    const cedulaInp = document.getElementById('pos-client-cedula');
    if (cedulaInp) {
      cedulaInp.addEventListener('blur', () => {
        if (cedulaInp.value.trim().length >= 5) {
          window.FarmaBrainClient.asistirCheckout();
        }
      });
    }
  });
})();


  window.loadPosRenovacionesDelDia = function() {
    const fid = (window.sysState && window.sysState.activeFarmaciaId) ? window.sysState.activeFarmaciaId : 1;
    if (window.FarmaBrainClient && window.FarmaBrainClient.cargarRenovacionesDelDia) {
      window.FarmaBrainClient.cargarRenovacionesDelDia(fid);
    }
  };
