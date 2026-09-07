/**
 * AiresFlow — maintenance-loader.js
 * Controlador de Programación de Mantenimientos
 * Sincronización FastAPI · Filtros · Paginación · Toasts premium
 */

/* ── Estado global del módulo ─────────────────────────────────────────────── */
let paginaActual = 1;
const registrosPorPagina = 10;
let mantenimientosCargadosGlobal = [];
let mantenimientosFiltrados = [];
let equiposPorId = {};
let usuariosPorId = {};
let programacionesPorId = {};

let ordenSeleccionada = null;
let tiposMantenimientoPorId = {};

/* ── Utilidades ───────────────────────────────────────────────────────────── */

function normalizarTexto(texto) {
    return String(texto ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}

function extraerMensajeError(error) {
    return error?.message || String(error) || 'Error desconocido';
}

function nombreCompletoUsuario(usuario) {
    if (!usuario) return 'Sin asignar';
    if (usuario.nombre && usuario.apellido) {
        return `${usuario.nombre} ${usuario.apellido}`.trim();
    }
    return usuario.nombre || usuario.correo_institucional || 'Sin asignar';
}

function obtenerEspacioDesdeEquipo(equipo) {
    if (!equipo) return null;
    return equipo.espacio || equipo.espacio_fisico || null;
}

function nombreAulaDesdeEquipo(equipo) {
    const espacio = obtenerEspacioDesdeEquipo(equipo);
    if (espacio?.nombre) {
        const piso = espacio.piso != null ? ` · Piso ${espacio.piso}` : '';
        return `${espacio.nombre}${piso}`;
    }
    return 'Ubicación no disponible';
}

function resolverEquipoParaOrden(equipoId, equipoAnidado) {
    if (equipoAnidado?.id) return equiposPorId[equipoAnidado.id] || equipoAnidado;
    if (equipoId && equiposPorId[equipoId]) return equiposPorId[equipoId];
    return equipoAnidado || null;
}

function parsearFechaSolo(fechaStr) {
    if (!fechaStr) return null;
    const parte = String(fechaStr).split('T')[0];
    const [y, m, d] = parte.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
}

function formatearFechaDisplay(fechaStr) {
    const fecha = parsearFechaSolo(fechaStr);
    if (!fecha) return '—';
    return fecha.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function hoySinHora() {
    const h = new Date();
    return new Date(h.getFullYear(), h.getMonth(), h.getDate());
}

function resolverEstadoOrden(mantenimiento, programacion) {
    if (programacion?.estado) {
        const estadoProg = String(programacion.estado);
        if (estadoProg === 'Pendiente') {
            const fechaProg = parsearFechaSolo(programacion.fecha_programada);
            const hoy = hoySinHora();
            if (fechaProg && fechaProg < hoy) return 'Vencido';
            if (fechaProg && fechaProg.getTime() === hoy.getTime()) return 'En progreso';
        }
        return estadoProg;
    }

    const fecha = parsearFechaSolo(mantenimiento?.fecha_mantenimiento);
    const hoy = hoySinHora();
    if (!fecha) return 'Completado';
    if (fecha > hoy) return 'Pendiente';
    if (fecha.getTime() === hoy.getTime()) return 'En progreso';
    return 'Completado';
}

function clasesBadgeEstado(estado) {
    const mapa = {
        Pendiente: 'bg-amber-100 text-amber-700',
        'En progreso': 'bg-blue-100 text-blue-700',
        Completado: 'bg-emerald-100 text-emerald-700',
        Cancelado: 'bg-slate-200 text-slate-600',
        Vencido: 'bg-red-100 text-red-700'
    };
    return mapa[estado] || 'bg-slate-100 text-slate-600';
}

function iconoEstado(estado) {
    const mapa = {
        Pendiente: 'fa-clock',
        'En progreso': 'fa-spinner',
        Completado: 'fa-check-circle',
        Cancelado: 'fa-ban',
        Vencido: 'fa-exclamation-triangle'
    };
    return mapa[estado] || 'fa-circle';
}

/* ── Toasts AiresFlow ─────────────────────────────────────────────────────── */

function mostrarNotificacion(tipo, mensaje) {
    let contenedor = document.getElementById('toast-container');
    if (!contenedor) {
        contenedor = document.createElement('div');
        contenedor.id = 'toast-container';
        contenedor.className = 'fixed top-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none';
        contenedor.setAttribute('aria-live', 'polite');
        document.body.appendChild(contenedor);
    }

    const esExito = tipo === 'exito' || tipo === 'success';
    const clases = esExito
        ? 'bg-uccLight text-slate-900 border border-cyan-300/50'
        : 'bg-red-500 text-white border border-red-400/40';
    const icono = esExito ? 'fa-circle-check' : 'fa-circle-exclamation';
    const textoSeguro = escaparHtml(mensaje);

    const toast = document.createElement('div');
    toast.className = `${clases} pointer-events-auto flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl text-sm font-semibold max-w-sm transform transition-all duration-300 translate-x-6 opacity-0`;
    toast.innerHTML = `<i class="fas ${icono}"></i><span>${textoSeguro}</span>`;
    contenedor.appendChild(toast);

    requestAnimationFrame(() => toast.classList.remove('translate-x-6', 'opacity-0'));
    setTimeout(() => {
        toast.classList.add('translate-x-6', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4200);
}

/* ── Construcción de órdenes enriquecidas ─────────────────────────────────── */

function construirOrdenDesdeMantenimiento(mantenimiento) {
    const equipo = resolverEquipoParaOrden(mantenimiento.equipo_id, mantenimiento.equipo);
    const tecnico = usuariosPorId[mantenimiento.encargado_id] || mantenimiento.encargado || null;
    const programacion = Object.values(programacionesPorId).find(
        (p) => p.mantenimiento_id === mantenimiento.id
    ) || null;

    const fechaRef = programacion?.fecha_programada || mantenimiento.fecha_mantenimiento;
    const estado = resolverEstadoOrden(mantenimiento, programacion);
    const tipoId = mantenimiento.tipo_mantenimiento_id;
    const aulaNombre = nombreAulaDesdeEquipo(equipo);

    return {
        id: mantenimiento.id,
        programacion_id: programacion?.id || null,
        equipo_id: mantenimiento.equipo_id,
        encargado_id: mantenimiento.encargado_id,
        tipo_mantenimiento_id: tipoId,
        fecha: fechaRef,
        estado,
        equipo,
        codigo_activo: equipo?.codigo_activo || `EQ-${mantenimiento.equipo_id}`,
        aula: aulaNombre,
        aula_busqueda: normalizarTexto(equipo?.espacio?.nombre || aulaNombre),
        tecnico_nombre: nombreCompletoUsuario(tecnico),
        tecnico_busqueda: normalizarTexto(nombreCompletoUsuario(tecnico)),
        tipo_nombre: programacion?.tipo_mantenimiento?.nombre || nombreTipoMantenimiento(tipoId) || '—',
        raw: mantenimiento
    };
}

function construirOrdenDesdeProgramacion(programacion) {
    const equipo = resolverEquipoParaOrden(programacion.equipo_id, programacion.equipo);
    const tecnico = programacion.encargado || usuariosPorId[programacion.encargado_id] || null;
    const estado = resolverEstadoOrden({}, programacion);
    const aulaNombre = nombreAulaDesdeEquipo(equipo);

    return {
        id: programacion.id,
        programacion_id: programacion.id,
        equipo_id: programacion.equipo_id,
        encargado_id: programacion.encargado_id,
        tipo_mantenimiento_id: programacion.tipo_mantenimiento_id,
        fecha: programacion.fecha_programada,
        estado,
        equipo,
        codigo_activo: equipo?.codigo_activo || `EQ-${programacion.equipo_id}`,
        aula: aulaNombre,
        aula_busqueda: normalizarTexto(equipo?.espacio?.nombre || aulaNombre),
        tecnico_nombre: nombreCompletoUsuario(tecnico),
        tecnico_busqueda: normalizarTexto(nombreCompletoUsuario(tecnico)),
        tipo_nombre: programacion.tipo_mantenimiento?.nombre
            || nombreTipoMantenimiento(programacion.tipo_mantenimiento_id)
            || '—',
        raw: programacion
    };
}

function fusionarOrdenes(mantenimientos, programaciones) {
    const ordenes = [];
    const vinculados = new Set(
        programaciones.filter((p) => p.mantenimiento_id).map((p) => p.mantenimiento_id)
    );

    programaciones.forEach((prog) => {
        programacionesPorId[prog.id] = prog;
        ordenes.push(construirOrdenDesdeProgramacion(prog));
    });

    mantenimientos.forEach((mant) => {
        if (!vinculados.has(mant.id)) {
            ordenes.push(construirOrdenDesdeMantenimiento(mant));
        }
    });

    return ordenes.sort((a, b) => {
        const fa = parsearFechaSolo(a.fecha)?.getTime() || 0;
        const fb = parsearFechaSolo(b.fecha)?.getTime() || 0;
        return fb - fa;
    });
}

/* ── Catálogos y selectores ───────────────────────────────────────────────── */

function nombreTipoMantenimiento(tipoId, tipoAnidado) {
    if (tipoAnidado?.nombre) return tipoAnidado.nombre;
    if (tipoId != null && tiposMantenimientoPorId[tipoId]) {
        return tiposMantenimientoPorId[tipoId];
    }
    return null;
}

function poblarSelectTipoMantenimiento(tipos) {
    const selectTipo = document.getElementById('selectTipo');
    if (!selectTipo) return;

    const lista = Array.isArray(tipos) ? tipos : [];
    let html = '<option value="">Selecciona el tipo</option>';
    lista.forEach((tipo) => {
        html += `<option value="${tipo.id}">${escaparHtml(tipo.nombre)}</option>`;
    });
    selectTipo.innerHTML = html;
}

function indexarTiposMantenimiento(tipos) {
    tiposMantenimientoPorId = {};
    (tipos || []).forEach((tipo) => {
        tiposMantenimientoPorId[tipo.id] = tipo.nombre;
    });
}

function poblarSelectoresFormulario(equipos, tecnicos) {
    const selectActivo = document.getElementById('selectActivo');
    const listaEquipos = Array.isArray(equipos) ? equipos : [];
    const listaTecnicos = Array.isArray(tecnicos) ? tecnicos : [];

    let htmlEquipos = '<option value="">Selecciona un equipo</option>';
    listaEquipos.forEach((eq) => {
        const aula = nombreAulaDesdeEquipo(eq);
        htmlEquipos += `<option value="${eq.id}">${escaparHtml(eq.codigo_activo)} — ${escaparHtml(aula)}</option>`;
    });
    if (selectActivo) selectActivo.innerHTML = htmlEquipos;

    let htmlTecnicos = '<option value="">Selecciona un técnico</option>';
    listaTecnicos.forEach((u) => {
        htmlTecnicos += `<option value="${u.id}">${escaparHtml(nombreCompletoUsuario(u))}</option>`;
    });

    let htmlTecnicosReasignar = '<option value="">Selecciona técnico</option>';
    listaTecnicos.forEach((u) => {
        htmlTecnicosReasignar += `<option value="${u.id}">${escaparHtml(nombreCompletoUsuario(u))}</option>`;
    });

    const selectTecnico = document.getElementById('selectTecnico');
    const selectReasignar = document.getElementById('selectTecnicoReasignar');
    if (selectTecnico) selectTecnico.innerHTML = htmlTecnicos;
    if (selectReasignar) selectReasignar.innerHTML = htmlTecnicosReasignar;
}

function filtrarTecnicosDesdeUsuarios(usuarios) {
    const lista = Array.isArray(usuarios) ? usuarios : (usuarios?.items || []);
    const tecnicos = lista.filter((u) => u.tipo_rol === 'Tecnico');
    return tecnicos.length > 0 ? tecnicos : lista;
}

async function cargarDatosIniciales() {
    const tbody = document.getElementById('tabla-mantenimientos-body');

    try {
        const [equiposRes, usuariosRes, mantenimientosRes, programacionesRes, tiposRes] = await Promise.all([
            API.get('/equipos/?limit=100'),
            API.get('/usuarios/?limit=100&rol=Tecnico'),
            API.get('/mantenimientos/?limit=100'),
            API.get('/programaciones/?size=100'),
            API.get('/tipos-mantenimiento/'),
        ]);

        const listaEquipos = equiposRes?.items || equiposRes || [];
        equiposPorId = {};
        listaEquipos.forEach((eq) => { equiposPorId[eq.id] = eq; });

        const listaUsuarios = usuariosRes?.items || usuariosRes || [];
        const listaTecnicos = filtrarTecnicosDesdeUsuarios(listaUsuarios);
        usuariosPorId = {};
        listaTecnicos.forEach((u) => { usuariosPorId[u.id] = u; });

        const listaMantenimientos = Array.isArray(mantenimientosRes)
            ? mantenimientosRes
            : (mantenimientosRes?.items || []);

        const listaProgramaciones = programacionesRes?.items || programacionesRes || [];
        programacionesPorId = {};

        const listaTipos = Array.isArray(tiposRes) ? tiposRes : (tiposRes?.items || []);
        indexarTiposMantenimiento(listaTipos);
        poblarSelectTipoMantenimiento(listaTipos);

        mantenimientosCargadosGlobal = fusionarOrdenes(listaMantenimientos, listaProgramaciones);

        poblarSelectoresFormulario(listaEquipos, listaTecnicos);
        paginaActual = 1;
        aplicarFiltrosYPaginacion();
    } catch (error) {
        console.error('Error cargando datos:', error);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="px-8 py-12 text-center text-red-600">
                        <i class="fas fa-exclamation-circle text-2xl mb-3"></i>
                        <p class="font-semibold">No se pudieron cargar las órdenes.</p>
                        <p class="text-sm mt-1 text-slate-500">${escaparHtml(extraerMensajeError(error))}</p>
                    </td>
                </tr>`;
        }
        mostrarNotificacion('error', extraerMensajeError(error));
    }
}

/* ── Filtrado semántico (aula + técnico + estado + fechas) ────────────────── */

function obtenerOrdenesFiltradas() {
    const termino = normalizarTexto(
        document.getElementById('input-busqueda-mantenimiento')?.value || ''
    );
    const estadoFiltro = document.getElementById('filterEstado')?.value || '';
    const fechaDesde = document.getElementById('filterFechaDesde')?.value || '';
    const fechaHasta = document.getElementById('filterFechaHasta')?.value || '';

    mantenimientosFiltrados = mantenimientosCargadosGlobal.filter((item) => {
        const nombreAula = normalizarTexto(item.equipo?.espacio?.nombre || item.aula_busqueda || '');
        const nombreTecnico = item.tecnico_busqueda;

        const coincideBusqueda = !termino
            || nombreAula.includes(termino)
            || nombreTecnico.includes(termino);

        const coincideEstado = !estadoFiltro || item.estado === estadoFiltro;

        const fechaOrden = parsearFechaSolo(item.fecha);
        let coincideFecha = true;

        if (fechaDesde) {
            const desde = parsearFechaSolo(fechaDesde);
            if (fechaOrden && desde && fechaOrden < desde) coincideFecha = false;
        }
        if (fechaHasta) {
            const hasta = parsearFechaSolo(fechaHasta);
            if (fechaOrden && hasta && fechaOrden > hasta) coincideFecha = false;
        }

        return coincideBusqueda && coincideEstado && coincideFecha;
    });

    return mantenimientosFiltrados;
}

function aplicarFiltrosYPaginacion() {
    paginaActual = 1;
    renderizarTablaYPaginacion();
}

/* ── Paginación estricta (10 filas) ───────────────────────────────────────── */

function renderizarTablaYPaginacion() {
    const filtradas = obtenerOrdenesFiltradas();
    const total = filtradas.length;
    const totalPaginas = Math.max(1, Math.ceil(total / registrosPorPagina));

    if (paginaActual > totalPaginas) paginaActual = totalPaginas;
    if (paginaActual < 1) paginaActual = 1;

    const inicio = (paginaActual - 1) * registrosPorPagina;
    const fin = inicio + registrosPorPagina;
    const paginaItems = filtradas.slice(inicio, fin);

    const tbody = document.getElementById('tabla-mantenimientos-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!paginaItems.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-8 py-12 text-center text-slate-500">
                    <i class="fas fa-inbox text-3xl mb-3 text-slate-300"></i>
                    <p class="font-medium">No hay órdenes que coincidan con los filtros.</p>
                </td>
            </tr>`;
    } else {
        paginaItems.forEach((orden) => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50/50 transition';
            const badge = clasesBadgeEstado(orden.estado);
            const icono = iconoEstado(orden.estado);
            const idModal = orden.programacion_id ?? orden.id;

            tr.innerHTML = `
                <td class="px-8 py-5 font-bold text-uccDark">${escaparHtml(orden.codigo_activo)}</td>
                <td class="px-8 py-5 text-slate-600">${escaparHtml(orden.aula)}</td>
                <td class="px-8 py-5"><span class="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold">${escaparHtml(orden.tipo_nombre)}</span></td>
                <td class="px-8 py-5 font-semibold text-slate-700">${formatearFechaDisplay(orden.fecha)}</td>
                <td class="px-8 py-5 text-slate-600">${escaparHtml(orden.tecnico_nombre)}</td>
                <td class="px-8 py-5"><span class="inline-flex items-center gap-1 ${badge} px-3 py-1 rounded-full text-xs font-bold"><i class="fas ${icono} w-3"></i> ${escaparHtml(orden.estado)}</span></td>
                <td class="px-8 py-5 text-center">
                    <button type="button" data-orden-id="${idModal}" class="btn-ver-ficha inline-flex items-center justify-center bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg text-xs font-bold transition" title="Ver ficha">
                        <i class="fas fa-eye text-[#00acc9]"></i>
                        <span class="ml-2">Ver Ficha</span>
                    </button>
                </td>`;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.btn-ver-ficha').forEach((btn) => {
            btn.addEventListener('click', () => {
                openDetalleOrdenModal(btn.getAttribute('data-orden-id'));
            });
        });
    }

    const desde = total === 0 ? 0 : inicio + 1;
    const hasta = total === 0 ? 0 : Math.min(fin, total);
    const paginacionTexto = document.getElementById('paginacion-texto');
    if (paginacionTexto) {
        paginacionTexto.textContent = `Mostrando ${desde} a ${hasta} de ${total} órdenes en total`;
    }

    const btnAnt = document.getElementById('btn-pagina-anterior');
    const btnSig = document.getElementById('btn-pagina-siguiente');
    if (btnAnt) btnAnt.disabled = paginaActual <= 1 || total === 0;
    if (btnSig) btnSig.disabled = paginaActual >= totalPaginas || total === 0;
}

function irPaginaAnterior() {
    if (paginaActual > 1) {
        paginaActual -= 1;
        renderizarTablaYPaginacion();
    }
}

function irPaginaSiguiente() {
    const totalPaginas = Math.ceil(mantenimientosFiltrados.length / registrosPorPagina);
    if (paginaActual < totalPaginas) {
        paginaActual += 1;
        renderizarTablaYPaginacion();
    }
}

/* ── Modal Programar ──────────────────────────────────────────────────────── */

function openProgramarMantenimientoModal() {
    const modal = document.getElementById('modal-programar-mantenimiento');
    modal?.classList.remove('hidden');
    modal?.classList.add('flex');
}

function closeProgramarMantenimientoModal() {
    const modal = document.getElementById('modal-programar-mantenimiento');
    modal?.classList.add('hidden');
    modal?.classList.remove('flex');
    const resetIds = ['selectActivo', 'inputFechaPlanificada', 'selectTecnico', 'selectTipo'];
    resetIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

async function submitProgramarMantenimiento(event) {
    event.preventDefault();

    const equipoId = Number(document.getElementById('selectActivo')?.value);
    const fecha = document.getElementById('inputFechaPlanificada')?.value;
    const encargadoId = Number(document.getElementById('selectTecnico')?.value);
    const tipoId = Number(document.getElementById('selectTipo')?.value);

    if (!equipoId || !fecha || !encargadoId || !tipoId) {
        mostrarNotificacion('error', 'Complete todos los campos obligatorios.');
        return;
    }

    const btn = document.getElementById('btn-submit-programar');
    if (btn) btn.disabled = true;

    try {
        await API.post('/programaciones/', {
            equipo_id: equipoId,
            encargado_id: encargadoId,
            tipo_mantenimiento_id: tipoId,
            fecha_programada: fecha
        });
        mostrarNotificacion('exito', 'Orden de mantenimiento programada correctamente.');
        closeProgramarMantenimientoModal();
        await cargarDatosIniciales();
    } catch (error) {
        mostrarNotificacion('error', extraerMensajeError(error));
    } finally {
        if (btn) btn.disabled = false;
    }
}

/* ── Modal Detalle ────────────────────────────────────────────────────────── */

function buscarOrdenPorId(idReferencia) {
    const ref = String(idReferencia);
    return mantenimientosCargadosGlobal.find(
        (o) => String(o.programacion_id) === ref || String(o.id) === ref
    );
}

function restablecerControlesModalDetalle() {
    const selectTecnico = document.getElementById('selectTecnicoReasignar');
    const btnGuardar = document.getElementById('btn-guardar-orden');
    const btnCancelar = document.getElementById('btn-cancelar-mantenimiento');

    if (selectTecnico) {
        selectTecnico.disabled = false;
        selectTecnico.classList.remove('opacity-60', 'cursor-not-allowed');
    }
    if (btnGuardar) btnGuardar.classList.remove('hidden');
    if (btnCancelar) btnCancelar.classList.remove('hidden');
}

function aplicarBloqueoModalDetalle(mensaje) {
    const selectTecnico = document.getElementById('selectTecnicoReasignar');
    const btnGuardar = document.getElementById('btn-guardar-orden');
    const btnCancelar = document.getElementById('btn-cancelar-mantenimiento');

    if (selectTecnico) {
        selectTecnico.disabled = true;
        selectTecnico.classList.add('opacity-60', 'cursor-not-allowed');
    }
    if (btnGuardar) btnGuardar.classList.add('hidden');
    if (btnCancelar) btnCancelar.classList.add('hidden');

    if (mensaje) mostrarNotificacion('exito', mensaje);
}

function openDetalleOrdenModal(idReferencia) {
    const orden = buscarOrdenPorId(idReferencia);
    if (!orden) {
        mostrarNotificacion('error', 'No se encontró la orden seleccionada.');
        return;
    }

    ordenSeleccionada = orden;
    resetearBotonCancelar();
    restablecerControlesModalDetalle();

    const idDisplay = orden.programacion_id
        ? `ORD-${String(orden.programacion_id).padStart(3, '0')}`
        : `MNT-${String(orden.id).padStart(3, '0')}`;

    const campos = {
        detalleMantenimientoId: orden.programacion_id || orden.id,
        detalleOrderId: idDisplay,
        detalleEquipo: orden.codigo_activo,
        detalleAula: orden.aula,
        detalleDate: String(orden.fecha || '').split('T')[0],
        detalleTipo: orden.tipo_nombre,
        detalleEstado: orden.estado
    };

    Object.entries(campos).forEach(([id, valor]) => {
        const el = document.getElementById(id);
        if (el) el.value = valor;
    });

    const selectReasignar = document.getElementById('selectTecnicoReasignar');
    if (selectReasignar) selectReasignar.value = orden.encargado_id || '';

    const userRole = localStorage.getItem('userRole');
    const estadoCerrado = orden.estado === 'Completado' || orden.estado === 'Cancelado';
    const esTecnico = userRole === 'Tecnico';

    if (estadoCerrado) {
        aplicarBloqueoModalDetalle('Esta orden está cerrada y no admite modificaciones.');
    } else if (esTecnico) {
        aplicarBloqueoModalDetalle('Modo consulta: no tiene permisos para modificar esta orden.');
    }

    const modal = document.getElementById('modal-detalle-orden');
    modal?.classList.remove('hidden');
    modal?.classList.add('flex');
}

function closeDetalleOrdenModal() {
    const modal = document.getElementById('modal-detalle-orden');
    modal?.classList.add('hidden');
    modal?.classList.remove('flex');
    ordenSeleccionada = null;
    resetearBotonCancelar();
}

function resetearBotonCancelar() {
    const btn = document.getElementById('btn-cancelar-mantenimiento');
    if (!btn) return;
    btn.textContent = 'Cancelar orden';
    btn.classList.remove('bg-red-600', 'animate-pulse', 'ring-2', 'ring-red-300');
    btn.classList.add('bg-red-600');
}

async function guardarCambiosOrden() {
    if (!ordenSeleccionada) return;

    const encargadoId = Number(document.getElementById('selectTecnicoReasignar')?.value);
    const fecha = document.getElementById('detalleDate')?.value;

    if (!encargadoId || !fecha) {
        mostrarNotificacion('error', 'Seleccione técnico y fecha válidos.');
        return;
    }

    const btn = document.getElementById('btn-guardar-orden');
    if (btn) btn.disabled = true;

    try {
        if (ordenSeleccionada.programacion_id) {
            await API.put(`/programaciones/${ordenSeleccionada.programacion_id}`, {
                encargado_id: encargadoId,
                fecha_programada: fecha
            });
        } else if (typeof ordenSeleccionada.id === 'number') {
            await API.post('/mantenimientos/', {
                equipo_id: ordenSeleccionada.equipo_id,
                encargado_id: encargadoId,
                tipo_mantenimiento_id: ordenSeleccionada.tipo_mantenimiento_id,
                fecha_mantenimiento: fecha,
                registrado_por: encargadoId,
                detalle_mantenimiento: 'Actualización de asignación desde ficha de orden'
            });
        }

        mostrarNotificacion('exito', 'Cambios guardados correctamente.');
        closeDetalleOrdenModal();
        await cargarDatosIniciales();
    } catch (error) {
        mostrarNotificacion('error', extraerMensajeError(error));
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function cancelarMantenimiento() {
    if (!ordenSeleccionada) return;

    const confirmar = await solicitarConfirmacion({
        titulo: 'Cancelar orden de mantenimiento',
        mensaje: '¿Está seguro de cancelar esta orden? Esta acción no se puede deshacer.',
        textoAceptar: 'Sí, cancelar',
        esPeligroso: true
    });

    if (!confirmar) return;

    const btn = document.getElementById('btn-cancelar-mantenimiento');
    if (btn) btn.disabled = true;

    try {
        if (ordenSeleccionada.programacion_id) {
            await API.put(`/programaciones/${ordenSeleccionada.programacion_id}`, {
                estado: 'Cancelado'
            });
        }
        mostrarNotificacion('exito', 'Orden cancelada correctamente.');
        closeDetalleOrdenModal();
        await cargarDatosIniciales();
    } catch (error) {
        mostrarNotificacion('error', extraerMensajeError(error));
    } finally {
        if (btn) btn.disabled = false;
        resetearBotonCancelar();
    }
}

/* ── Inicialización ───────────────────────────────────────────────────────── */

function inicializarEventosMaintenance() {
    const userRole = localStorage.getItem('userRole');
    if (userRole === 'Tecnico') {
        document
            .querySelector('button[onclick="openProgramarMantenimientoModal()"]')
            ?.classList.add('hidden');
    }

    document.getElementById('input-busqueda-mantenimiento')
        ?.addEventListener('input', aplicarFiltrosYPaginacion);
    document.getElementById('filterEstado')
        ?.addEventListener('change', aplicarFiltrosYPaginacion);
    document.getElementById('filterFechaDesde')
        ?.addEventListener('change', aplicarFiltrosYPaginacion);
    document.getElementById('filterFechaHasta')
        ?.addEventListener('change', aplicarFiltrosYPaginacion);

    document.getElementById('btn-pagina-anterior')
        ?.addEventListener('click', irPaginaAnterior);
    document.getElementById('btn-pagina-siguiente')
        ?.addEventListener('click', irPaginaSiguiente);

    document.getElementById('modal-programar-mantenimiento')
        ?.addEventListener('click', (e) => {
            if (e.target.id === 'modal-programar-mantenimiento') closeProgramarMantenimientoModal();
        });
    document.getElementById('modal-detalle-orden')
        ?.addEventListener('click', (e) => {
            if (e.target.id === 'modal-detalle-orden') closeDetalleOrdenModal();
        });
}

document.addEventListener('DOMContentLoaded', () => {
    inicializarEventosMaintenance();
    aplicarVisibilidadGestionTiposMantenimiento();
    cargarDatosIniciales();
});

/* ── Gestión de tipos de mantenimiento (CRUD — superusuario) ─────────────── */

const CLASE_FILA_GESTION = 'bg-slate-50 rounded-xl px-4 py-2.5 mb-2 flex justify-between items-center text-sm hover:bg-slate-100/90 transition-colors duration-200';
const CLASE_BTN_EDITAR_GESTION = 'p-2 rounded-lg text-slate-400 hover:text-uccLight transition-colors';
const CLASE_BTN_ELIMINAR_GESTION = 'p-2 rounded-lg text-slate-400 hover:text-red-500 transition-colors';
const CLASE_INPUT_INLINE_GESTION = 'flex-1 border border-slate-200 hover:border-slate-300 focus:border-uccLight focus:ring-2 focus:ring-cyan-100 transition-all rounded-xl px-4 py-2.5 text-slate-800 bg-white text-sm font-medium';

function esSuperusuarioProgramacion() {
    const rol = (localStorage.getItem('rol') || localStorage.getItem('userRole') || '').toLowerCase();
    return rol.includes('jefe de infraestructura');
}

function aplicarVisibilidadGestionTiposMantenimiento() {
    const btn = document.getElementById('btn-gestion-tipos-mantenimiento');
    if (btn) btn.classList.toggle('hidden', !esSuperusuarioProgramacion());
}

function formatearFrecuenciaTipoMantenimiento(frecuenciaDias) {
    if (frecuenciaDias == null || frecuenciaDias === '') return 'Sin frecuencia';
    return `${frecuenciaDias} día${Number(frecuenciaDias) === 1 ? '' : 's'}`;
}

function parsearFrecuenciaInput(valor) {
    const texto = String(valor ?? '').trim();
    if (!texto) return null;
    const numero = Number.parseInt(texto, 10);
    if (Number.isNaN(numero) || numero < 0) {
        throw new Error('La frecuencia debe ser un número entero mayor o igual a 0');
    }
    return numero;
}

async function recargarTiposMantenimientoEnFormularios() {
    const tipos = await API.get('/tipos-mantenimiento/');
    const lista = Array.isArray(tipos) ? tipos : (tipos?.items || []);
    indexarTiposMantenimiento(lista);
    poblarSelectTipoMantenimiento(lista);
    return lista;
}

function openGestionTiposMantenimientoModal() {
    if (!esSuperusuarioProgramacion()) {
        mostrarNotificacion('error', 'Solo el superusuario puede gestionar tipos de mantenimiento.');
        return;
    }
    const modal = document.getElementById('modal-gestion-tipos-mantenimiento');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    renderizarListaTiposMantenimiento();
}

function closeGestionTiposMantenimientoModal() {
    const modal = document.getElementById('modal-gestion-tipos-mantenimiento');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    const inputNombre = document.getElementById('input-nuevo-tipo-mantenimiento');
    const inputFrecuencia = document.getElementById('input-nuevo-frecuencia-mantenimiento');
    if (inputNombre) inputNombre.value = '';
    if (inputFrecuencia) inputFrecuencia.value = '';
}

async function renderizarListaTiposMantenimiento() {
    const lista = document.getElementById('lista-tipos-mantenimiento-gestion');
    if (!lista) return;

    lista.innerHTML = '<p class="text-xs text-slate-400 text-center py-6"><i class="fas fa-spinner fa-spin mr-1"></i> Cargando...</p>';

    try {
        const tipos = await API.get('/tipos-mantenimiento/');

        if (!tipos.length) {
            lista.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">No hay tipos de mantenimiento registrados</p>';
            return;
        }

        lista.innerHTML = '';
        tipos.forEach((tipo) => {
            const fila = document.createElement('div');
            fila.id = `tipo-mantenimiento-row-${tipo.id}`;
            fila.className = CLASE_FILA_GESTION;
            fila.innerHTML = `
                <div class="flex-1 min-w-0 pr-2">
                    <span class="font-semibold text-slate-800 truncate tipo-mantenimiento-nombre-display">${escaparHtml(tipo.nombre)}</span>
                    <span class="text-xs text-slate-400 ml-2 tipo-mantenimiento-frecuencia-display">${escaparHtml(formatearFrecuenciaTipoMantenimiento(tipo.frecuencia_dias))}</span>
                </div>
                <div class="flex items-center gap-0.5 shrink-0">
                    <button type="button" onclick="activarEdicionTipoMantenimiento(${tipo.id})" class="${CLASE_BTN_EDITAR_GESTION}" title="Editar">
                        <i class="fas fa-pen text-xs"></i>
                    </button>
                    <button type="button" onclick="eliminarTipoMantenimiento(${tipo.id})" class="${CLASE_BTN_ELIMINAR_GESTION}" title="Eliminar">
                        <i class="fas fa-trash text-xs"></i>
                    </button>
                </div>`;
            fila.dataset.frecuencia = tipo.frecuencia_dias ?? '';
            lista.appendChild(fila);
        });
    } catch (error) {
        lista.innerHTML = `<p class="text-xs text-red-500 text-center py-6">${escaparHtml(extraerMensajeError(error))}</p>`;
        mostrarNotificacion('error', extraerMensajeError(error));
    }
}

async function submitCrearTipoMantenimiento() {
    const inputNombre = document.getElementById('input-nuevo-tipo-mantenimiento');
    const inputFrecuencia = document.getElementById('input-nuevo-frecuencia-mantenimiento');
    const nombre = inputNombre?.value.trim();
    if (!nombre) {
        mostrarNotificacion('error', 'Ingresa el nombre del tipo de mantenimiento');
        return;
    }

    let frecuencia_dias = null;
    try {
        frecuencia_dias = parsearFrecuenciaInput(inputFrecuencia?.value);
    } catch (error) {
        mostrarNotificacion('error', extraerMensajeError(error));
        return;
    }

    const payload = { nombre };
    if (frecuencia_dias != null) payload.frecuencia_dias = frecuencia_dias;

    try {
        await API.post('/tipos-mantenimiento/', payload);
        if (inputNombre) inputNombre.value = '';
        if (inputFrecuencia) inputFrecuencia.value = '';
        mostrarNotificacion('exito', `Tipo de mantenimiento "${nombre}" registrado`);
        await renderizarListaTiposMantenimiento();
        await recargarTiposMantenimientoEnFormularios();
    } catch (error) {
        mostrarNotificacion('error', extraerMensajeError(error));
    }
}

function activarEdicionTipoMantenimiento(id) {
    const fila = document.getElementById(`tipo-mantenimiento-row-${id}`);
    if (!fila) return;
    const nombreActual = fila.querySelector('.tipo-mantenimiento-nombre-display')?.textContent?.trim() || '';
    const frecuenciaActual = fila.dataset.frecuencia ?? '';

    fila.className = `${CLASE_FILA_GESTION} flex-col sm:flex-row sm:items-center bg-white ring-2 ring-cyan-100 border border-uccLight/30 gap-3`;
    fila.innerHTML = `
        <div class="flex flex-col sm:flex-row gap-2 flex-1 min-w-0 w-full">
            <input type="text" id="edit-tipo-mantenimiento-nombre-${id}" value="${nombreActual.replace(/"/g, '&quot;')}" maxlength="30"
                placeholder="Nombre" class="${CLASE_INPUT_INLINE_GESTION}">
            <input type="number" id="edit-tipo-mantenimiento-frecuencia-${id}" value="${frecuenciaActual.replace(/"/g, '&quot;')}" min="0" step="1"
                placeholder="Frecuencia (días)" class="${CLASE_INPUT_INLINE_GESTION} sm:max-w-[160px]">
        </div>
        <div class="flex items-center gap-1 shrink-0">
            <button type="button" onclick="guardarEdicionTipoMantenimiento(${id})" class="p-2.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors duration-200" title="Guardar">
                <i class="fas fa-check"></i>
            </button>
            <button type="button" onclick="renderizarListaTiposMantenimiento()" class="p-2.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-colors duration-200" title="Cancelar">
                <i class="fas fa-times"></i>
            </button>
        </div>`;
    document.getElementById(`edit-tipo-mantenimiento-nombre-${id}`)?.focus();
}

async function guardarEdicionTipoMantenimiento(id) {
    const inputNombre = document.getElementById(`edit-tipo-mantenimiento-nombre-${id}`);
    const inputFrecuencia = document.getElementById(`edit-tipo-mantenimiento-frecuencia-${id}`);
    const nombre = inputNombre?.value.trim();
    if (!nombre) {
        mostrarNotificacion('error', 'El nombre no puede estar vacío');
        return;
    }

    let frecuencia_dias = null;
    try {
        frecuencia_dias = parsearFrecuenciaInput(inputFrecuencia?.value);
    } catch (error) {
        mostrarNotificacion('error', extraerMensajeError(error));
        return;
    }

    const payload = { nombre, frecuencia_dias };

    try {
        await API.put(`/tipos-mantenimiento/${id}`, payload);
        mostrarNotificacion('exito', 'Tipo de mantenimiento actualizado');
        await renderizarListaTiposMantenimiento();
        await recargarTiposMantenimientoEnFormularios();
    } catch (error) {
        mostrarNotificacion('error', extraerMensajeError(error));
    }
}

async function eliminarTipoMantenimiento(id) {
    const confirmar = await solicitarConfirmacion({
        titulo: 'Eliminar tipo de mantenimiento',
        mensaje: '¿Eliminar este tipo de mantenimiento del catálogo? Esta acción no se puede deshacer.',
        textoAceptar: 'Sí, eliminar',
        esPeligroso: true
    });
    if (!confirmar) return;

    try {
        await API.delete(`/tipos-mantenimiento/${id}`);
        mostrarNotificacion('exito', 'Tipo de mantenimiento eliminado');
        await renderizarListaTiposMantenimiento();
        await recargarTiposMantenimientoEnFormularios();
    } catch (error) {
        mostrarNotificacion('error', extraerMensajeError(error));
    }
}

/* ── Exposición global (handlers inline del HTML) ─────────────────────────── */
window.openProgramarMantenimientoModal = openProgramarMantenimientoModal;
window.closeProgramarMantenimientoModal = closeProgramarMantenimientoModal;
window.submitProgramarMantenimiento = submitProgramarMantenimiento;
window.openDetalleOrdenModal = openDetalleOrdenModal;
window.closeDetalleOrdenModal = closeDetalleOrdenModal;
window.guardarCambiosOrden = guardarCambiosOrden;
window.cancelarMantenimiento = cancelarMantenimiento;
window.mostrarNotificacion = mostrarNotificacion;
window.openGestionTiposMantenimientoModal = openGestionTiposMantenimientoModal;
window.closeGestionTiposMantenimientoModal = closeGestionTiposMantenimientoModal;
window.submitCrearTipoMantenimiento = submitCrearTipoMantenimiento;
window.activarEdicionTipoMantenimiento = activarEdicionTipoMantenimiento;
window.guardarEdicionTipoMantenimiento = guardarEdicionTipoMantenimiento;
window.eliminarTipoMantenimiento = eliminarTipoMantenimiento;
window.renderizarListaTiposMantenimiento = renderizarListaTiposMantenimiento;
