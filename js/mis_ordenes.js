/**
 * AiresFlow — mis_ordenes.js
 * Agenda operativa del técnico: consume GET /programaciones/mis-asignadas
 * y enlaza cada tarjeta al formulario transaccional con ?orden_id=N.
 */

function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto ?? '';
    return div.innerHTML;
}

function obtenerBadgeTipo(orden) {
    const nombre = orden?.tipo_mantenimiento?.nombre || '';
    const nombreNormalizado = nombre.toLowerCase();

    if (nombreNormalizado.includes('preventivo')) {
        return {
            etiqueta: nombre || 'Preventivo',
            clases: 'bg-green-50 text-green-700 font-bold text-xs rounded-full px-2.5 py-1',
        };
    }
    if (nombreNormalizado.includes('correctivo')) {
        return {
            etiqueta: nombre || 'Correctivo',
            clases: 'bg-amber-50 text-amber-700 font-bold text-xs rounded-full px-2.5 py-1',
        };
    }
    if (nombreNormalizado.includes('emergencia')) {
        return {
            etiqueta: nombre || 'Emergencia',
            clases: 'bg-red-50 text-red-700 font-bold text-xs rounded-full px-2.5 py-1',
        };
    }
    return {
        etiqueta: nombre || 'Mantenimiento',
        clases: 'bg-slate-100 text-slate-600 font-bold text-xs rounded-full px-2.5 py-1',
    };
}

function formatearUbicacion(equipo) {
    const espacio = equipo?.espacio;
    if (!espacio) return { bloque: '—', salon: '—' };

    const bloque = espacio.bloque?.nombre_bloque || espacio.bloque?.codigo_bloque || '—';
    const salon = espacio.nombre || '—';
    return { bloque, salon };
}

function crearTarjetaOrden(orden) {
    const equipo = orden.equipo || {};
    const { bloque, salon } = formatearUbicacion(equipo);
    const badge = obtenerBadgeTipo(orden);
    const marca = equipo.marca?.nombre || '—';
    const modelo = equipo.modelo || '—';
    const codigoActivo = equipo.codigo_activo || `EQ-${equipo.id || orden.equipo_id}`;

    const tarjeta = document.createElement('article');
    tarjeta.className = 'bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition duration-300 p-6 flex flex-col gap-4';

    tarjeta.innerHTML = `
        <div class="flex items-start justify-between gap-3">
            <p class="text-xs font-mono text-slate-400">ID Orden: #${escaparHtml(String(orden.id))}</p>
            <span class="${badge.clases}">${escaparHtml(badge.etiqueta)}</span>
        </div>
        <div>
            <p class="text-lg font-black text-uccDark">${escaparHtml(codigoActivo)}</p>
            <p class="text-sm text-slate-600 font-semibold mt-1">${escaparHtml(marca)} · ${escaparHtml(modelo)}</p>
        </div>
        <div class="space-y-2 text-sm">
            <div class="flex items-start gap-2 text-slate-600">
                <i class="fas fa-building text-uccLight mt-0.5 w-4"></i>
                <div>
                    <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bloque / Edificio</p>
                    <p class="font-medium">${escaparHtml(bloque)}</p>
                </div>
            </div>
            <div class="flex items-start gap-2 text-slate-600">
                <i class="fas fa-door-open text-uccLight mt-0.5 w-4"></i>
                <div>
                    <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Espacio / Salón (Aula)</p>
                    <p class="font-medium">${escaparHtml(salon)}</p>
                </div>
            </div>
        </div>
        <a href="service_report_form.html?orden_id=${encodeURIComponent(orden.id)}"
           class="mt-auto w-full bg-uccLight hover:bg-opacity-90 text-white text-sm font-bold py-2.5 rounded-xl transition duration-300 flex items-center justify-center gap-2">
            <i class="fas fa-wrench"></i>
            <span>Abrir Reporte Técnico</span>
        </a>
    `;

    return tarjeta;
}

function mostrarEstadoVacio(contenedorGrid) {
    contenedorGrid.className = '';
    contenedorGrid.innerHTML = `
        <div class="border-dashed border-2 border-slate-200 bg-white p-8 rounded-2xl text-center max-w-lg mx-auto">
            <i class="fas fa-calendar-check text-slate-300 text-5xl mb-4"></i>
            <p class="text-slate-600 font-medium">¡Al día! No tienes órdenes de mantenimiento pendientes asignadas para hoy</p>
        </div>
    `;
}

function mostrarError(mensaje) {
    const contenedor = document.getElementById('contenedor-agenda');
    const loader = document.getElementById('loader-agenda');
    const grid = document.getElementById('grid-ordenes');

    if (loader) loader.classList.add('hidden');
    if (grid) grid.classList.add('hidden');

    if (!contenedor) return;

    let errorEl = document.getElementById('error-agenda');
    if (!errorEl) {
        errorEl = document.createElement('div');
        errorEl.id = 'error-agenda';
        contenedor.appendChild(errorEl);
    }

    errorEl.className = 'bg-red-50 border border-red-200 text-red-700 p-6 rounded-2xl text-sm font-medium text-center max-w-lg mx-auto';
    errorEl.textContent = mensaje;
}

async function cargarMisOrdenesAsignadas() {
    const loader = document.getElementById('loader-agenda');
    const grid = document.getElementById('grid-ordenes');
    const token = localStorage.getItem('token');

    if (!token) {
        window.location.href = 'auth_login.html';
        return;
    }

    try {
        const respuesta = await fetch(`${CONFIG.API_BASE_URL}/programaciones/mis-asignadas`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
            },
        });

        if (respuesta.status === 401) {
            localStorage.clear();
            window.location.href = 'auth_login.html';
            return;
        }

        if (!respuesta.ok) {
            let detalle = 'No se pudieron cargar las órdenes asignadas.';
            try {
                const cuerpo = await respuesta.json();
                detalle = cuerpo.detail || detalle;
            } catch (_) { /* respuesta no JSON */ }
            throw new Error(detalle);
        }

        const ordenes = await respuesta.json();
        const lista = Array.isArray(ordenes) ? ordenes : [];

        if (loader) loader.classList.add('hidden');

        if (!grid) return;

        if (!lista.length) {
            mostrarEstadoVacio(grid);
            return;
        }

        grid.classList.remove('hidden');
        grid.innerHTML = '';
        lista.forEach((orden) => grid.appendChild(crearTarjetaOrden(orden)));
    } catch (error) {
        console.error('Error cargando agenda:', error);
        mostrarError(error.message || 'Error de conexión con el servidor.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    cargarMisOrdenesAsignadas();
});
