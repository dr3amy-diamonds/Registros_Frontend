/**
 * AiresFlow — audit-logs-loader.js
 * Bitácora de Gestión: consume GET /auditoria/ con filtros y paginación server-side.
 */

const REGISTROS_POR_PAGINA_BITACORA = 10;

let paginaBitacora = 1;
let solicitudBitacora = null;
let totalBitacora = 0;

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

function totalPaginasBitacora() {
    return Math.max(1, Math.ceil(totalBitacora / REGISTROS_POR_PAGINA_BITACORA));
}

function construirQueryBitacora() {
    const params = new URLSearchParams({
        skip: String((paginaBitacora - 1) * REGISTROS_POR_PAGINA_BITACORA),
        limit: String(REGISTROS_POR_PAGINA_BITACORA),
    });
    Object.entries(filtrosBitacora).forEach(([clave, valor]) => {
        if (valor !== "" && valor !== null && valor !== undefined) {
            params.set(clave, valor);
        }
    });
    return params.toString();
}

function actualizarPaginacionBitacora() {
    const resumen = document.getElementById('bitacora-resumen');
    const indicador = document.getElementById('indicador-pagina-bitacora');
    const btnAnterior = document.getElementById('btn-bitacora-anterior');
    const btnSiguiente = document.getElementById('btn-bitacora-siguiente');

    const paginas = totalPaginasBitacora();
    if (paginaBitacora > paginas) paginaBitacora = paginas;
    if (paginaBitacora < 1) paginaBitacora = 1;

    const desde = totalBitacora === 0 ? 0 : (paginaBitacora - 1) * REGISTROS_POR_PAGINA_BITACORA + 1;
    const hasta = totalBitacora === 0 ? 0 : Math.min(paginaBitacora * REGISTROS_POR_PAGINA_BITACORA, totalBitacora);

    if (resumen) {
        resumen.textContent = totalBitacora === 0
            ? 'Sin eventos para mostrar'
            : `Mostrando ${desde}–${hasta} de ${totalBitacora} eventos`;
    }
    if (indicador) {
        indicador.textContent = `Página ${paginaBitacora} de ${paginas}`;
    }
    if (btnAnterior) {
        btnAnterior.disabled = paginaBitacora <= 1 || totalBitacora === 0;
    }
    if (btnSiguiente) {
        btnSiguiente.disabled = paginaBitacora >= paginas || totalBitacora === 0;
    }
}

function renderizarBitacora(items, total) {
    const tbody = document.getElementById('tabla-bitacora-body');
    if (!tbody) return;

    totalBitacora = Number(total) || 0;
    tbody.innerHTML = '';

    if (!items.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="px-4 py-10 text-center text-slate-500">
                    <i class="fas fa-inbox text-2xl mb-2 text-slate-300" aria-hidden="true"></i>
                    <p class="text-sm font-medium">No hay eventos de gestión para mostrar con los filtros actuales.</p>
                    <p class="text-xs text-slate-400 mt-1">Prueba limpiar los filtros para ampliar la búsqueda.</p>
                </td>
            </tr>`;
        actualizarPaginacionBitacora();
        return;
    }

    items.forEach((evento) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition align-top';
        tr.innerHTML = `
            <td class="text-sm font-medium text-slate-700 whitespace-nowrap">${escaparHtml(evento.fecha_hora)}</td>
            <td class="whitespace-nowrap">
                <p class="text-sm font-medium text-slate-900">${escaparHtml(evento.actor_nombre)}</p>
                <p class="text-xs text-slate-500 mt-0.5">${escaparHtml(evento.actor_rol_etiqueta)}</p>
            </td>
            <td class="text-sm text-slate-600">${escaparHtml(evento.ubicacion)}</td>
            <td>
                <span class="status-pill status-neutral text-[11px] px-2 py-0.5 whitespace-nowrap">${escaparHtml(evento.tipo_evento_etiqueta)}</span>
            </td>
            <td class="text-sm text-slate-700">
                <p data-detalle class="line-clamp-2 max-w-[460px] leading-snug"></p>
            </td>`;
        const detalle = tr.querySelector('[data-detalle]');
        if (detalle) {
            detalle.textContent = evento.narrativa || '—';
            detalle.title = evento.narrativa || '';
        }
        tbody.appendChild(tr);
    });

    actualizarPaginacionBitacora();
}

async function cargarBitacora() {
    const tbody = document.getElementById('tabla-bitacora-body');

    if (solicitudBitacora) {
        solicitudBitacora.abort();
    }
    const controlador = new AbortController();
    solicitudBitacora = controlador;

    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="px-4 py-10 text-center text-slate-500">
                    <i class="fas fa-spinner fa-spin text-uccLight text-xl mb-2" aria-hidden="true"></i>
                    <p class="text-sm">Cargando bitácora de gestión…</p>
                </td>
            </tr>`;
    }

    try {
        const respuesta = await API.peticion(`/auditoria/?${construirQueryBitacora()}`, {
            method: 'GET',
            signal: controlador.signal,
        });
        if (controlador.signal.aborted) return;

        const items = respuesta?.items || [];
        const total = respuesta?.total ?? 0;
        totalBitacora = Number(total) || 0;

        const paginas = totalPaginasBitacora();
        if (items.length === 0 && totalBitacora > 0 && paginaBitacora > paginas) {
            paginaBitacora = paginas;
            return cargarBitacora();
        }

        renderizarBitacora(items, totalBitacora);
    } catch (error) {
        if (error?.name === 'AbortError' || controlador.signal.aborted) return;
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-4 py-6">
                        <div class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
                            <p class="text-sm font-medium text-rose-700">No se pudo cargar la bitácora.</p>
                            <p class="text-xs text-rose-600 mt-1">${escaparHtml(extraerMensajeError(error))}</p>
                            <p class="text-xs text-slate-500 mt-1">Verifica la conexión con el servidor e inténtalo de nuevo.</p>
                            <button type="button" onclick="cargarBitacora()" class="btn-secondary text-xs min-h-[32px] px-3 py-1.5 mt-3">
                                <i class="fas fa-redo text-[10px]" aria-hidden="true"></i>
                                Reintentar
                            </button>
                        </div>
                    </td>
                </tr>`;
        }
        actualizarPaginacionBitacora();
    } finally {
        if (solicitudBitacora === controlador) {
            solicitudBitacora = null;
        }
    }
}

async function cargarTiposEventoFiltro() {
    const select = document.getElementById('filterTipo');
    if (!select) return;

    try {
        const tipos = await API.get('/auditoria/tipos-evento');
        const valorActual = select.value;
        select.innerHTML = '<option value="">Todos</option>';
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
        select.innerHTML = '<option value="">Todos</option>';
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

    selectPiso.innerHTML = '<option value="">Todos</option>';
    selectPiso.disabled = true;
    selectEspacio.innerHTML = '<option value="">Todos</option>';
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
    selectEspacio.innerHTML = '<option value="">Todos</option>';

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

function aplicarFiltrosBitacora() {
    sincronizarFiltrosDesdeFormulario();
    paginaBitacora = 1;
    cargarBitacora();
}

function limpiarFiltrosBitacora() {
    document.getElementById('filterFechaDesde').value = "";
    document.getElementById('filterFechaHasta').value = "";
    document.getElementById('filterTipo').value = "";
    document.getElementById('filterActor').value = "";
    document.getElementById('filterBloque').value = "";
    document.getElementById('filterPiso').innerHTML = '<option value="">Todos</option>';
    document.getElementById('filterPiso').disabled = true;
    document.getElementById('filterEspacio').innerHTML = '<option value="">Todos</option>';
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

    paginaBitacora = 1;
    cargarBitacora();
}

function irPaginaBitacora(delta) {
    const destino = paginaBitacora + delta;
    if (destino < 1 || destino > totalPaginasBitacora()) return;
    paginaBitacora = destino;
    cargarBitacora();
}

function inicializarEventosBitacora() {
    document.getElementById('btnAplicarFiltros')?.addEventListener('click', aplicarFiltrosBitacora);
    document.getElementById('btnLimpiarFiltros')?.addEventListener('click', limpiarFiltrosBitacora);
    document.getElementById('btn-bitacora-anterior')?.addEventListener('click', () => irPaginaBitacora(-1));
    document.getElementById('btn-bitacora-siguiente')?.addEventListener('click', () => irPaginaBitacora(1));

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
            aplicarFiltrosBitacora();
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    inicializarEventosBitacora();
    await Promise.all([cargarTiposEventoFiltro(), cargarBloquesFiltro()]);
    cargarBitacora();
});
