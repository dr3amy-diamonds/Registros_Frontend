/**
 * AiresFlow — audit-logs-loader.js
 * Bitácora de Gestión: consume GET /auditoria/ con filtros server-side.
 */

let filtrosBitacora = {
    fecha_desde: "",
    fecha_hasta: "",
    tipo_evento: "",
    actor_nombre: "",
    bloque_id: "",
    piso: "",
    espacio_id: "",
};

let catalogoBloques = [];
let catalogoEspacios = [];

function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto ?? '';
    return div.innerHTML;
}

function extraerMensajeError(error) {
    return error?.message || String(error) || 'Error desconocido';
}

function construirQueryBitacora() {
    const params = new URLSearchParams({ limit: "200" });
    Object.entries(filtrosBitacora).forEach(([clave, valor]) => {
        if (valor !== "" && valor !== null && valor !== undefined) {
            params.set(clave, valor);
        }
    });
    return params.toString();
}

function renderizarBitacora(items, total) {
    const tbody = document.getElementById('tabla-bitacora-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!items.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="px-8 py-12 text-center text-slate-500">
                    <i class="fas fa-inbox text-3xl mb-3 text-slate-300"></i>
                    <p class="font-medium">No hay eventos de gestión para mostrar con los filtros actuales.</p>
                </td>
            </tr>`;
    } else {
        items.forEach((evento) => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50/50 transition align-top';
            tr.innerHTML = `
                <td class="px-6 py-5 text-sm font-semibold text-slate-700 whitespace-nowrap">${escaparHtml(evento.fecha_hora)}</td>
                <td class="px-6 py-5 whitespace-nowrap">
                    <p class="text-sm font-bold text-uccDark">${escaparHtml(evento.actor_nombre)}</p>
                    <p class="text-xs text-slate-500 font-medium mt-0.5">${escaparHtml(evento.actor_rol_etiqueta)}</p>
                </td>
                <td class="px-6 py-5 text-sm text-slate-600">${escaparHtml(evento.ubicacion)}</td>
                <td class="px-6 py-5">
                    <span class="inline-block bg-slate-100 text-slate-600 font-bold text-xs rounded-full px-2.5 py-1">${escaparHtml(evento.tipo_evento_etiqueta)}</span>
                </td>
                <td class="px-6 py-5 text-sm text-slate-700 leading-relaxed">${escaparHtml(evento.narrativa)}</td>`;
            tbody.appendChild(tr);
        });
    }

    const resumen = document.getElementById('bitacora-resumen');
    if (resumen) {
        resumen.textContent = `${items.length} evento(s) visibles de ${total} que coinciden con los filtros`;
    }
}

async function cargarBitacora() {
    const tbody = document.getElementById('tabla-bitacora-body');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="px-8 py-12 text-center text-slate-500">
                    <i class="fas fa-spinner fa-spin text-uccLight text-2xl mb-3"></i>
                    <p class="font-medium">Cargando bitácora de gestión…</p>
                </td>
            </tr>`;
    }

    try {
        const respuesta = await API.get(`/auditoria/?${construirQueryBitacora()}`);
        renderizarBitacora(respuesta?.items || [], respuesta?.total ?? 0);
    } catch (error) {
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-8 py-12 text-center text-red-600">
                        <i class="fas fa-exclamation-circle text-2xl mb-3"></i>
                        <p class="font-semibold">No se pudo cargar la bitácora.</p>
                        <p class="text-sm mt-1 text-slate-500">${escaparHtml(extraerMensajeError(error))}</p>
                    </td>
                </tr>`;
        }
    }
}

async function cargarTiposEventoFiltro() {
    const select = document.getElementById('filterTipo');
    if (!select) return;

    try {
        const tipos = await API.get('/auditoria/tipos-evento');
        const valorActual = select.value;
        select.innerHTML = '<option value="">Tipo de evento</option>';
        (tipos || []).forEach((tipo) => {
            const opt = document.createElement('option');
            opt.value = tipo;
            opt.textContent = tipo;
            select.appendChild(opt);
        });
        if (valorActual) select.value = valorActual;
    } catch (error) {
        console.error('Error cargando tipos de evento:', error);
    }
}

async function cargarBloquesFiltro() {
    const select = document.getElementById('filterBloque');
    if (!select) return;

    try {
        const data = await API.get('/bloques/?limit=100');
        catalogoBloques = Array.isArray(data) ? data : (data.items || []);
        select.innerHTML = '<option value="">Bloque</option>';
        catalogoBloques.forEach((bloque) => {
            const opt = document.createElement('option');
            opt.value = String(bloque.id);
            opt.textContent = bloque.nombre_bloque;
            select.appendChild(opt);
        });
    } catch (error) {
        console.error('Error cargando bloques:', error);
    }
}

async function cargarEspaciosPorBloque(bloqueId) {
    const selectPiso = document.getElementById('filterPiso');
    const selectEspacio = document.getElementById('filterEspacio');
    if (!selectPiso || !selectEspacio) return;

    selectPiso.innerHTML = '<option value="">Piso</option>';
    selectPiso.disabled = true;
    selectEspacio.innerHTML = '<option value="">Espacio / Aula</option>';
    selectEspacio.disabled = true;
    filtrosBitacora.piso = "";
    filtrosBitacora.espacio_id = "";

    if (!bloqueId) return;

    try {
        const data = await API.get(`/espacios/?bloque_id=${bloqueId}&limit=100`);
        catalogoEspacios = Array.isArray(data) ? data : (data.items || []);

        const pisos = [...new Set(catalogoEspacios.map((e) => e.piso).filter((p) => p !== null && p !== undefined))].sort((a, b) => a - b);

        if (pisos.length) {
            pisos.forEach((piso) => {
                const opt = document.createElement('option');
                opt.value = String(piso);
                opt.textContent = `Piso ${piso}`;
                selectPiso.appendChild(opt);
            });
            selectPiso.disabled = false;
        }

        catalogoEspacios.forEach((espacio) => {
            const opt = document.createElement('option');
            opt.value = String(espacio.id);
            const pisoTxt = espacio.piso != null ? `Piso ${espacio.piso} · ` : '';
            opt.textContent = `${pisoTxt}${espacio.nombre}`;
            opt.dataset.piso = espacio.piso != null ? String(espacio.piso) : '';
            selectEspacio.appendChild(opt);
        });
        if (catalogoEspacios.length) selectEspacio.disabled = false;
    } catch (error) {
        console.error('Error cargando espacios:', error);
    }
}

function filtrarEspaciosPorPiso(piso) {
    const selectEspacio = document.getElementById('filterEspacio');
    if (!selectEspacio) return;

    const valorPrevio = selectEspacio.value;
    selectEspacio.innerHTML = '<option value="">Espacio / Aula</option>';

    const lista = piso === ""
        ? catalogoEspacios
        : catalogoEspacios.filter((e) => String(e.piso) === String(piso));

    lista.forEach((espacio) => {
        const opt = document.createElement('option');
        opt.value = String(espacio.id);
        const pisoTxt = espacio.piso != null ? `Piso ${espacio.piso} · ` : '';
        opt.textContent = `${pisoTxt}${espacio.nombre}`;
        selectEspacio.appendChild(opt);
    });

    if (valorPrevio && [...selectEspacio.options].some((o) => o.value === valorPrevio)) {
        selectEspacio.value = valorPrevio;
    }
}

function sincronizarFiltrosDesdeFormulario() {
    filtrosBitacora.fecha_desde = document.getElementById('filterFechaDesde')?.value || "";
    filtrosBitacora.fecha_hasta = document.getElementById('filterFechaHasta')?.value || "";
    filtrosBitacora.tipo_evento = document.getElementById('filterTipo')?.value || "";
    filtrosBitacora.actor_nombre = document.getElementById('filterActor')?.value?.trim() || "";
    filtrosBitacora.bloque_id = document.getElementById('filterBloque')?.value || "";
    filtrosBitacora.piso = document.getElementById('filterPiso')?.value ?? "";
    filtrosBitacora.espacio_id = document.getElementById('filterEspacio')?.value || "";
}

function limpiarFiltrosBitacora() {
    document.getElementById('filterFechaDesde').value = "";
    document.getElementById('filterFechaHasta').value = "";
    document.getElementById('filterTipo').value = "";
    document.getElementById('filterActor').value = "";
    document.getElementById('filterBloque').value = "";
    document.getElementById('filterPiso').innerHTML = '<option value="">Piso</option>';
    document.getElementById('filterPiso').disabled = true;
    document.getElementById('filterEspacio').innerHTML = '<option value="">Espacio / Aula</option>';
    document.getElementById('filterEspacio').disabled = true;

    filtrosBitacora = {
        fecha_desde: "",
        fecha_hasta: "",
        tipo_evento: "",
        actor_nombre: "",
        bloque_id: "",
        piso: "",
        espacio_id: "",
    };

    cargarBitacora();
}

function inicializarEventosBitacora() {
    document.getElementById('btnAplicarFiltros')?.addEventListener('click', () => {
        sincronizarFiltrosDesdeFormulario();
        cargarBitacora();
    });

    document.getElementById('btnLimpiarFiltros')?.addEventListener('click', limpiarFiltrosBitacora);

    document.getElementById('filterBloque')?.addEventListener('change', async (e) => {
        filtrosBitacora.bloque_id = e.target.value;
        await cargarEspaciosPorBloque(e.target.value);
    });

    document.getElementById('filterPiso')?.addEventListener('change', (e) => {
        filtrosBitacora.piso = e.target.value;
        filtrarEspaciosPorPiso(e.target.value);
    });

    document.getElementById('filterActor')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sincronizarFiltrosDesdeFormulario();
            cargarBitacora();
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    inicializarEventosBitacora();
    await Promise.all([cargarTiposEventoFiltro(), cargarBloquesFiltro()]);
    cargarBitacora();
});
