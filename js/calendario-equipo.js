/**
 * AiresFlow — calendario-equipo.js
 * Calendario anual por equipo 12×31 conectado a FastAPI sin mocks.
 * Regla estricta: solo verde para Completado / Realizado.
 */

(function () {
    'use strict';

    const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    let equiposCache = [];
    let tiposPorId = {};
    let usuariosPorId = {};
    let eventosAnio = [];
    let equipoActual = null;
    let anioActual = new Date().getFullYear();
    let eventosGlobalAnio = [];
    let espacioFiltro = '';

    /* ── Utilidades ── */

    function escaparHtml(texto) {
        const div = document.createElement('div');
        div.textContent = texto == null ? '' : String(texto);
        return div.innerHTML;
    }

    function normalizar(texto) {
        return String(texto || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    function parsearFecha(fechaStr) {
        if (!fechaStr) return null;
        const parte = String(fechaStr).split('T')[0];
        const partes = parte.split('-').map(Number);
        if (partes.length < 3 || !partes[0] || !partes[1] || !partes[2]) return null;
        return new Date(partes[0], partes[1] - 1, partes[2]);
    }

    function formatearFecha(fechaStr) {
        const f = parsearFecha(fechaStr);
        if (!f) return '—';
        return f.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function formatearCOP(valor) {
        const n = Number(valor);
        if (!Number.isFinite(n) || n <= 0) return '—';
        try {
            return n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
        } catch (_) {
            return '$' + Math.round(n).toLocaleString('es-CO');
        }
    }

    function nombreCompleto(usuario) {
        if (!usuario) return 'Sin asignar';
        if (usuario.nombre && usuario.apellido) return (usuario.nombre + ' ' + usuario.apellido).trim();
        return usuario.nombre || usuario.correo_institucional || 'Sin asignar';
    }

    function esCorrectivo(nombreTipo) {
        return normalizar(nombreTipo).includes('correct');
    }

    function diasEnMes(anio, mesIdx) {
        return new Date(anio, mesIdx + 1, 0).getDate();
    }

    /* ── Carga de datos (endpoints existentes) ── */

    async function cargarCatalogos() {
        try {
            const [tiposRes, usuariosRes] = await Promise.all([
                API.get('/tipos-mantenimiento/').catch(() => []),
                API.get('/usuarios/?limit=100').catch(() => [])
            ]);
            const tipos = Array.isArray(tiposRes) ? tiposRes : (tiposRes?.items || []);
            tipos.forEach((t) => { tiposPorId[t.id] = t.nombre; });
            const usuarios = Array.isArray(usuariosRes) ? usuariosRes : (usuariosRes?.items || []);
            usuarios.forEach((u) => { usuariosPorId[u.id] = u; });
        } catch (e) {
            console.warn('[CalendarioEquipo] No se pudieron cargar catálogos:', e);
        }
    }

    async function cargarEquipos() {
        const res = await API.get('/equipos/?limit=100');
        const lista = Array.isArray(res) ? res : (res?.items || []);
        equiposCache = lista;
        return lista;
    }

    async function cargarEventosEquipo(equipoId, anio) {
        const qs = 'equipo_id=' + encodeURIComponent(equipoId) + '&anio=' + encodeURIComponent(anio);
        const [resProgramaciones, resMantenimientos] = await Promise.all([
            API.peticion('/programaciones/?' + qs + '&size=100').catch(() => ({ items: [] })),
            API.peticion('/mantenimientos/?' + qs + '&limit=100').catch(() => [])
        ]);
        const progs = resProgramaciones?.items || (Array.isArray(resProgramaciones) ? resProgramaciones : []);
        const mants = Array.isArray(resMantenimientos) ? resMantenimientos : (resMantenimientos?.items || []);
        return { progs, mants };
    }

    /* ── Normalización a eventos de calendario ── */

    function estadoProgramacion(prog) {
        const estado = String(prog?.estado || 'Pendiente');
        if (estado === 'Cancelado' || estado === 'Completado') return estado;
        const f = parsearFecha(prog.fecha_programada);
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        if (f && f < hoy) return 'Vencido';
        return estado; // Pendiente / En progreso → programado
    }

    function esCompletado(estado) {
        const n = normalizar(estado);
        return n === 'completado' || n === 'realizado' || n === 'completada';
    }

    function construirEventos(progs, mants) {
        const eventos = [];
        (progs || []).forEach((p) => {
            const estado = String(p?.estado || '');
            if (!esCompletado(estado)) return; // Solo ejecutados en verde
            const tipoNombre = p?.tipo_mantenimiento?.nombre || tiposPorId[p.tipo_mantenimiento_id] || '—';
            const encargado = p?.encargado || usuariosPorId[p.encargado_id] || null;
            eventos.push({
                origen: 'programacion',
                id: p.id,
                equipo_id: p.equipo_id ?? p.equipo?.id ?? null,
                espacio_nombre: (p.equipo && p.equipo.espacio && p.equipo.espacio.nombre) || null,
                orden_id: 'ORD-' + String(p.id).padStart(3, '0'),
                fecha: String(p.fecha_programada || '').split('T')[0],
                fecha_ejecucion: String(p.fecha_programada || '').split('T')[0],
                tipo: tipoNombre,
                correctivo: esCorrectivo(tipoNombre),
                estado: 'Completado',
                descripcion: 'Orden ORD-' + String(p.id).padStart(3, '0') + ' · ' + tipoNombre,
                observaciones: 'Orden ORD-' + String(p.id).padStart(3, '0') + ' · ' + tipoNombre,
                responsable: nombreCompleto(encargado),
                tecnico_nombre: nombreCompleto(encargado),
                insumos_gastados: [],
                gasto: null,
                costo_total: null
            });
        });
        (mants || []).forEach((m) => {
            const tipoNombre = m.tipo_nombre || tiposPorId[m.tipo_mantenimiento_id] || '—';
            const tecnicoNombre = m.tecnico_nombre || nombreCompleto(usuariosPorId[m.encargado_id] || m.encargado || null);
            const insumos = Array.isArray(m.insumos_gastados) ? m.insumos_gastados : [];
            const costo = m.costo_total ?? m.costo_servicio ?? null;
            eventos.push({
                origen: 'mantenimiento',
                id: m.id,
                equipo_id: m.equipo_id ?? m.equipo?.id ?? null,
                espacio_nombre: (m.equipo && m.equipo.espacio && m.equipo.espacio.nombre) || m.espacio_nombre || null,
                orden_id: 'MNT-' + m.id,
                fecha: String(m.fecha_mantenimiento || '').split('T')[0],
                fecha_ejecucion: String(m.fecha_mantenimiento || '').split('T')[0],
                tipo: tipoNombre,
                correctivo: esCorrectivo(tipoNombre),
                estado: 'Completado',
                descripcion: m.observaciones || m.detalle_mantenimiento || ('Mantenimiento MNT-' + m.id),
                observaciones: m.observaciones || m.detalle_mantenimiento || '—',
                responsable: tecnicoNombre,
                tecnico_nombre: tecnicoNombre,
                insumos_gastados: insumos,
                gasto: costo,
                costo_total: costo
            });
        });
        return eventos
            .filter((e) => parsearFecha(e.fecha))
            .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
    }

    function claseEstado() {
        return 'is-realizado';
    }

    function etiquetaEstado() {
        return 'Realizado';
    }

    /* ── Render: encabezados de días 1–31 ── */

    function construirEncabezadoDias(theadId, descripcion) {
        const thead = document.getElementById(theadId);
        if (!thead) return;
        const tr = document.createElement('tr');
        const thMes = document.createElement('th');
        thMes.scope = 'col';
        thMes.textContent = 'Mes';
        tr.appendChild(thMes);
        for (let d = 1; d <= 31; d++) {
            const th = document.createElement('th');
            th.scope = 'col';
            th.textContent = String(d);
            tr.appendChild(th);
        }
        thead.innerHTML = '';
        thead.appendChild(tr);
        const tabla = thead.closest('table');
        if (tabla && descripcion) tabla.setAttribute('aria-label', descripcion);
    }

    /* ── Render: encabezado estilo Excel ── */

    function renderEncabezado(equipo) {
        const box = document.getElementById('encabezado-equipo-calendario');
        if (!box) return;
        if (!equipo) {
            box.innerHTML = '<p class="text-sm text-slate-500 font-medium">Selecciona un equipo para ver su ficha anual.</p>';
            return;
        }
        const espacio = equipo.espacio || {};
        const bloque = espacio.bloque || {};
        const marca = (equipo.marca && equipo.marca.nombre) || equipo.marca || 'No especificada';
        box.innerHTML =
            '<div class="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">' +
            '<div class="p-5">' +
            '<p class="text-[11px] font-black uppercase tracking-[0.2em] text-uccTeal mb-3">Ubicación</p>' +
            '<dl class="space-y-1.5 text-sm">' +
            '<div class="flex gap-2"><dt class="font-bold text-slate-600 w-28 shrink-0">Bloque:</dt><dd class="text-slate-800">' + escaparHtml(bloque.codigo_bloque || bloque.nombre || '—') + '</dd></div>' +
            '<div class="flex gap-2"><dt class="font-bold text-slate-600 w-28 shrink-0">Espacio:</dt><dd class="text-slate-800">' + escaparHtml(espacio.nombre || 'Ubicación no disponible') + '</dd></div>' +
            '<div class="flex gap-2"><dt class="font-bold text-slate-600 w-28 shrink-0">Piso:</dt><dd class="text-slate-800">' + escaparHtml(espacio.piso != null ? 'Piso ' + espacio.piso : '—') + '</dd></div>' +
            '</dl></div>' +
            '<div class="p-5">' +
            '<p class="text-[11px] font-black uppercase tracking-[0.2em] text-uccTeal mb-3">Características del equipo</p>' +
            '<dl class="space-y-1.5 text-sm">' +
            '<div class="flex gap-2"><dt class="font-bold text-slate-600 w-28 shrink-0">Código:</dt><dd class="text-slate-800 font-black">' + escaparHtml(equipo.codigo_activo || ('EQ-' + equipo.id)) + '</dd></div>' +
            '<div class="flex gap-2"><dt class="font-bold text-slate-600 w-28 shrink-0">Marca/Modelo:</dt><dd class="text-slate-800">' + escaparHtml(marca) + ' / ' + escaparHtml(equipo.modelo || '—') + '</dd></div>' +
            '<div class="flex gap-2"><dt class="font-bold text-slate-600 w-28 shrink-0">Capacidad:</dt><dd class="text-slate-800">' + escaparHtml(equipo.capacidad_btu ? Number(equipo.capacidad_btu).toLocaleString('es-CO') + ' BTU' : '—') + '</dd></div>' +
            '<div class="flex gap-2"><dt class="font-bold text-slate-600 w-28 shrink-0">Serie:</dt><dd class="text-slate-800">' + escaparHtml(equipo.numero_serie || '—') + '</dd></div>' +
            '</dl></div></div>';
    }

    /* ── Render: matriz 12×31 ── */

    function eventosPorDia(eventos) {
        const mapa = new Map(); // 'MM-DD' -> [eventos]
        eventos.forEach((e) => {
            const f = parsearFecha(e.fecha);
            if (!f || f.getFullYear() !== anioActual) return;
            const clave = String(f.getMonth()).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0');
            if (!mapa.has(clave)) mapa.set(clave, []);
            mapa.get(clave).push(e);
        });
        return mapa;
    }

    function claseCelda() {
        return 'is-realizado';
    }

    function renderMatriz(tbodyId, tituloId, eventos, esCorrectivo) {
        const tbody = document.getElementById(tbodyId);
        const titulo = document.getElementById(tituloId);
        if (!tbody) return;
        const filtrados = eventos.filter((e) => e.correctivo === esCorrectivo);
        if (titulo) {
            titulo.textContent = (esCorrectivo ? 'Mantenimiento Correctivo' : 'Mantenimiento Preventivo') +
                ' — ' + anioActual + ' (' + filtrados.length + ' registros)';
        }
        const mapa = eventosPorDia(filtrados);
        tbody.innerHTML = '';
        if (!equipoActual) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 32;
            td.className = 'px-6 py-8 text-center text-sm text-slate-500 font-medium';
            td.textContent = 'Selecciona un equipo para ver su calendario anual.';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }
        for (let m = 0; m < 12; m++) {
            const tr = document.createElement('tr');
            const th = document.createElement('th');
            th.scope = 'row';
            th.textContent = MESES[m];
            th.title = MESES_LARGOS[m];
            tr.appendChild(th);
            const maxDia = diasEnMes(anioActual, m);
            for (let d = 1; d <= 31; d++) {
                const td = document.createElement('td');
                if (d > maxDia) {
                    const s = document.createElement('span');
                    s.className = 'cal-cell is-empty';
                    s.setAttribute('aria-hidden', 'true');
                    s.textContent = '·';
                    td.appendChild(s);
                } else {
                    const clave = String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
                    const lista = mapa.get(clave) || [];
                    if (!lista.length) {
                        const s = document.createElement('span');
                        s.className = 'cal-cell is-empty';
                        s.setAttribute('aria-hidden', 'true');
                        s.textContent = '';
                        td.appendChild(s);
                    } else {
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'cal-cell ' + claseCelda(lista);
                        btn.textContent = lista.length > 1 ? 'X' + lista.length : 'X';
                        const resumen = lista.map((e) => etiquetaEstado(e.estado)).join(', ');
                        btn.setAttribute('aria-label', MESES_LARGOS[m] + ' ' + d + ': ' + lista.length + ' registro(s) (' + resumen + '). Ver detalle');
                        btn.addEventListener('click', () => abrirDetalleDia(m, d, lista));
                        td.appendChild(btn);
                    }
                }
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
    }

    /* ── Render: vista lista (móvil) ── */

    function renderLista(eventos) {
        const cont = document.getElementById('lista-calendario-equipo');
        if (!cont) return;
        cont.innerHTML = '';
        const delAnio = eventos.filter((e) => {
            const f = parsearFecha(e.fecha);
            return f && f.getFullYear() === anioActual;
        });
        if (!equipoActual) {
            cont.innerHTML = '<p class="text-sm text-slate-500 font-medium text-center py-6">Selecciona un equipo para ver sus registros.</p>';
            return;
        }
        if (!delAnio.length) {
            cont.innerHTML = '<p class="text-sm text-slate-500 font-medium text-center py-6">Sin registros en ' + anioActual + ' para este equipo.</p>';
            return;
        }
        delAnio.forEach((e, i) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'cal-lista-item w-full text-left flex items-center justify-between gap-3';
            item.setAttribute('aria-label', 'Ver detalle del registro ' + (i + 1) + ' del ' + formatearFecha(e.fecha));
            item.innerHTML =
                '<span class="min-w-0">' +
                '<span class="block text-xs font-black text-uccTeal uppercase tracking-wider">' + escaparHtml(e.correctivo ? 'Correctivo' : 'Preventivo') + ' · ' + escaparHtml(etiquetaEstado(e.estado)) + '</span>' +
                '<span class="block text-sm font-bold text-slate-800 truncate">' + escaparHtml(formatearFecha(e.fecha)) + ' — ' + escaparHtml(e.descripcion) + '</span>' +
                '<span class="block text-xs text-slate-600 truncate">' + escaparHtml(e.responsable) + '</span>' +
                '</span>' +
                '<i class="fas fa-chevron-right text-slate-500" aria-hidden="true"></i>';
            item.addEventListener('click', () => abrirDetalleDia(null, null, [e]));
            cont.appendChild(item);
        });
    }

    /* ── Modal solo lectura ── */

    function abrirDetalleDia(mesIdx, dia, lista) {
        const tituloDia = document.getElementById('subtitulo-detalle-calendario');
        if (tituloDia) {
            tituloDia.textContent = (mesIdx != null && dia != null)
                ? MESES_LARGOS[mesIdx] + ' ' + dia + ' de ' + anioActual + ' · ' + (equipoActual?.codigo_activo || '')
                : 'Registro · ' + (equipoActual?.codigo_activo || '');
        }
        const tbody = document.getElementById('tabla-detalle-calendario-body');
        if (tbody) {
            tbody.innerHTML = '';
            if (!lista || !lista.length) {
                tbody.innerHTML = '<tr><td colspan="6" class="px-5 py-8 text-center text-sm text-slate-500">Sin mantenimientos completados.</td></tr>';
            }
            (lista || []).forEach((e) => {
                const insumosTxt = Array.isArray(e.insumos_gastados) && e.insumos_gastados.length
                    ? e.insumos_gastados.map((i) => (i.nombre || 'Insumo') + ' ×' + (i.cantidad ?? '')).join(', ')
                    : '—';
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50/60 transition';
                tr.innerHTML =
                    '<td class="px-5 py-4 font-black text-emerald-700">' + escaparHtml(e.orden_id || ('MNT-' + e.id)) + '</td>' +
                    '<td class="px-5 py-4 font-semibold text-slate-700 whitespace-nowrap">' + escaparHtml(formatearFecha(e.fecha_ejecucion || e.fecha)) + '</td>' +
                    '<td class="px-5 py-4 text-slate-600">' + escaparHtml(e.tecnico_nombre || e.responsable || 'Sin asignar') + '</td>' +
                    '<td class="px-5 py-4 text-slate-600">' + escaparHtml(e.observaciones || e.descripcion || '—') + '</td>' +
                    '<td class="px-5 py-4 text-slate-600">' + escaparHtml(insumosTxt) + '</td>' +
                    '<td class="px-5 py-4 font-bold text-slate-700 whitespace-nowrap">' + escaparHtml(e.costo_total != null ? formatearCOP(e.costo_total) : (e.gasto != null ? formatearCOP(e.gasto) : '—')) + '</td>';
                tbody.appendChild(tr);
            });
        }
        if (window.ModalAccesible) {
            window.ModalAccesible.open('modal-detalle-calendario');
        } else {
            const modal = document.getElementById('modal-detalle-calendario');
            modal?.classList.remove('hidden');
            modal?.classList.add('flex');
        }
    }

    function cerrarDetalleCalendario() {
        if (window.ModalAccesible) {
            window.ModalAccesible.close('modal-detalle-calendario');
        } else {
            const modal = document.getElementById('modal-detalle-calendario');
            modal?.classList.add('hidden');
            modal?.classList.remove('flex');
        }
    }

    /* ── Vista global sin clic: espacios + realizados ── */

    function equipoDeEvento(e) {
        return equiposCache.find((eq) => eq.id === e.equipo_id) || null;
    }

    function espacioDeEvento(e) {
        if (e.espacio_nombre) return e.espacio_nombre;
        const eq = equipoDeEvento(e);
        return (eq && eq.espacio && eq.espacio.nombre) || 'Sin ubicación';
    }

    async function cargarGlobal() {
        try {
            const [resProgs, resMants] = await Promise.all([
                API.peticion('/programaciones/?size=100').catch(() => ({ items: [] })),
                API.peticion('/mantenimientos/?limit=100').catch(() => [])
            ]);
            const progs = resProgs?.items || (Array.isArray(resProgs) ? resProgs : []);
            const mants = Array.isArray(resMants) ? resMants : (resMants?.items || []);
            const todos = construirEventos(progs, mants);
            eventosGlobalAnio = todos.filter((e) => {
                const f = parsearFecha(e.fecha);
                return f && f.getFullYear() === anioActual;
            });
        } catch (e) {
            eventosGlobalAnio = [];
        }
        renderEspacios();
        renderTablaGlobal();
    }

    function renderEspacios() {
        const lista = document.getElementById('lista-espacios-global');
        if (!lista) return;
        const conteo = new Map();
        eventosGlobalAnio.forEach((e) => {
            const nombre = espacioDeEvento(e);
            conteo.set(nombre, (conteo.get(nombre) || 0) + 1);
        });
        const nombres = [...conteo.keys()].sort((a, b) => a.localeCompare(b, 'es'));
        if (!nombres.length) {
            lista.innerHTML = '<li class="px-5 py-4 text-sm text-slate-500 font-medium">Sin mantenimientos en ' + anioActual + '.</li>';
            return;
        }
        lista.innerHTML = '';
        nombres.forEach((nombre) => {
            const li = document.createElement('li');
            const activo = espacioFiltro === nombre;
            li.innerHTML = '<button type="button" class="w-full flex items-center justify-between gap-2 px-5 py-2.5 text-sm transition min-h-[36px] ' +
                (activo ? 'bg-[#00acc9]/10 font-bold text-uccDark' : 'hover:bg-slate-50 font-medium text-slate-700') + '" aria-pressed="' + activo + '">' +
                '<span class="truncate">' + escaparHtml(nombre) + '</span>' +
                '<span class="shrink-0 text-xs font-black rounded-full px-2.5 py-0.5 ' + (activo ? 'bg-[#00acc9]/20 text-uccDark' : 'bg-slate-100 text-slate-600') + '">' + conteo.get(nombre) + '</span></button>';
            li.querySelector('button').addEventListener('click', () => {
                espacioFiltro = activo ? '' : nombre;
                renderEspacios();
                renderTablaGlobal();
            });
            lista.appendChild(li);
        });
    }

    function renderTablaGlobal() {
        const tbody = document.getElementById('tabla-global-anio-body');
        const titulo = document.getElementById('titulo-global-anio');
        const btnTodos = document.getElementById('btn-quitar-filtro-espacio');
        if (!tbody) return;
        const lista = espacioFiltro
            ? eventosGlobalAnio.filter((e) => espacioDeEvento(e) === espacioFiltro)
            : eventosGlobalAnio;
        if (titulo) {
            titulo.textContent = 'Mantenimientos realizados — ' + anioActual + ' (' + lista.length + ')' +
                (espacioFiltro ? ' · ' + espacioFiltro : '');
        }
        if (btnTodos) {
            btnTodos.classList.toggle('hidden', !espacioFiltro);
            btnTodos.onclick = () => { espacioFiltro = ''; renderEspacios(); renderTablaGlobal(); };
        }
        if (!lista.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="px-5 py-8 text-center text-sm text-slate-500">Sin mantenimientos' +
                (espacioFiltro ? ' en este espacio' : ' en ' + anioActual) + '.</td></tr>';
            return;
        }
        tbody.innerHTML = lista.map((e) => {
            const eq = equipoDeEvento(e);
            return '<tr class="hover:bg-slate-50/60 transition">' +
                '<td class="px-5 py-2.5 font-semibold text-slate-700 whitespace-nowrap">' + escaparHtml(formatearFecha(e.fecha)) + '</td>' +
                '<td class="px-5 py-2.5 font-bold text-slate-800">' + escaparHtml(eq ? (eq.codigo_activo || ('EQ-' + eq.id)) : (e.orden_id || '—')) + '</td>' +
                '<td class="px-5 py-2.5 text-slate-600">' + escaparHtml(espacioDeEvento(e)) + '</td>' +
                '<td class="px-5 py-2.5 text-slate-600">' + escaparHtml(e.tipo || '—') + '</td>' +
                '<td class="px-5 py-2.5 text-slate-600">' + escaparHtml(e.tecnico_nombre || e.responsable || 'Sin asignar') + '</td></tr>';
        }).join('');
    }

    /* ── Orquestación ── */

    function renderTodo() {
        renderMatriz('matriz-preventivo-body', 'titulo-matriz-preventivo', eventosAnio, false);
        renderMatriz('matriz-correctivo-body', 'titulo-matriz-correctivo', eventosAnio, true);
        renderLista(eventosAnio);
        const resumen = document.getElementById('resumen-calendario-equipo');
        if (resumen) {
            if (!equipoActual) {
                resumen.textContent = 'Sin equipo seleccionado.';
            } else {
                const n = eventosAnio.filter((e) => {
                    const f = parsearFecha(e.fecha);
                    return f && f.getFullYear() === anioActual;
                }).length;
                resumen.textContent = n + ' mantenimiento(s) completado(s) en ' + anioActual + ' para ' + (equipoActual.codigo_activo || ('EQ-' + equipoActual.id)) + '.';
            }
        }
    }

    async function recargarCalendario() {
        const selectEq = document.getElementById('select-equipo-calendario');
        const selectAnio = document.getElementById('select-anio-calendario');
        const id = Number(selectEq?.value);
        if (selectAnio) anioActual = Number(selectAnio.value) || anioActual;
        equipoActual = equiposCache.find((e) => e.id === id) || null;
        renderEncabezado(equipoActual);
        if (!equipoActual) {
            eventosAnio = [];
            renderTodo();
            return;
        }
        try {
            const { progs, mants } = await cargarEventosEquipo(equipoActual.id, anioActual);
            eventosAnio = construirEventos(progs, mants);
        } catch (e) {
            eventosAnio = [];
        }
        renderTodo();
    }

    function poblarControles() {
        const selectEq = document.getElementById('select-equipo-calendario');
        if (selectEq) {
            let html = '<option value="">Selecciona un equipo…</option>';
            equiposCache.forEach((eq) => {
                const aula = (eq.espacio && eq.espacio.nombre) || 'Sin ubicación';
                html += '<option value="' + eq.id + '">' + escaparHtml(eq.codigo_activo || ('EQ-' + eq.id)) + ' — ' + escaparHtml(aula) + '</option>';
            });
            selectEq.innerHTML = html;
            selectEq.addEventListener('change', recargarCalendario);
        }
        const selectAnio = document.getElementById('select-anio-calendario');
        if (selectAnio) {
            const base = new Date().getFullYear();
            let html = '';
            for (let y = base - 2; y <= base + 2; y++) {
                html += '<option value="' + y + '"' + (y === anioActual ? ' selected' : '') + '>' + y + '</option>';
            }
            selectAnio.innerHTML = html;
            selectAnio.addEventListener('change', () => {
                anioActual = Number(selectAnio.value) || base;
                espacioFiltro = '';
                cargarGlobal();
                recargarCalendario();
            });
        }
    }

    async function init() {
        if (window.ModalAccesible) window.ModalAccesible.initModal('modal-detalle-calendario');
        construirEncabezadoDias('matriz-preventivo-head', 'Grilla anual de mantenimiento preventivo por día');
        construirEncabezadoDias('matriz-correctivo-head', 'Grilla anual de mantenimiento correctivo por día');
        try {
            await cargarCatalogos();
            await cargarEquipos();
        } catch (e) {
            console.error('[CalendarioEquipo] Error inicializando:', e);
        }
        poblarControles();
        renderEncabezado(null);
        renderTodo();
        await cargarGlobal();
        // Auto-seleccionar el primer equipo para mostrar contenido de inmediato.
        const selectEq = document.getElementById('select-equipo-calendario');
        if (selectEq && equiposCache.length) {
            selectEq.value = String(equiposCache[0].id);
            await recargarCalendario();
        }
    }

    window.cerrarDetalleCalendario = cerrarDetalleCalendario;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
