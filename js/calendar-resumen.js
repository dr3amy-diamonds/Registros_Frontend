/**
 * AiresFlow — calendar-resumen.js
 * Resumen Mantenimiento Preventivo estilo Excel.
 * Filas = espacios, columnas = días del año. Solo verde = Completado / Realizado.
 * Dinámico: usa GET /calendario/resumen?anio= (1 request agregado).
 * Fallback legacy: paginados /mantenimientos + /programaciones + /espacios.
 */
(function () {
    'use strict';

    var MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
    var MESES_CAP = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    var MESES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    var anioActual = new Date().getFullYear();
    var equiposPorId = {};
    var espacios = [];
    var eventos = [];
    var porMes = new Array(12).fill(0);
    var totalesPorEspacio = {};

    function escaparHtml(texto) {
        var div = document.createElement('div');
        div.textContent = texto == null ? '' : String(texto);
        return div.innerHTML;
    }

    function normalizar(texto) {
        return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    }

    function esCompletado(estado) {
        var n = normalizar(estado);
        return n === 'completado' || n === 'realizado' || n === 'completada';
    }

    function parsearFecha(fechaStr) {
        if (!fechaStr) return null;
        var s = (fechaStr instanceof Date) ? fechaStr.toISOString().split('T')[0] : String(fechaStr);
        var parte = s.split('T')[0].split('-').map(Number);
        if (parte.length < 3 || !parte[0] || !parte[1] || !parte[2]) return null;
        return new Date(parte[0], parte[1] - 1, parte[2]);
    }

    function fechaISO(fechaStr) {
        if (!fechaStr) return '';
        if (fechaStr instanceof Date) return fechaStr.toISOString().split('T')[0];
        return String(fechaStr).split('T')[0];
    }

    function formatearFecha(fechaStr) {
        var f = parsearFecha(fechaStr);
        if (!f) return '—';
        return f.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function formatearCOP(valor) {
        var n = Number(valor);
        if (!Number.isFinite(n) || n <= 0) return '—';
        try {
            return n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
        } catch (_) {
            return '$' + Math.round(n).toLocaleString('es-CO');
        }
    }

    function diasEnMes(anio, mesIdx) {
        return new Date(anio, mesIdx + 1, 0).getDate();
    }

    function nombreTecnico(u) {
        if (!u) return 'Sin asignar';
        if (u.nombre && u.apellido) return (u.nombre + ' ' + u.apellido).trim();
        return u.nombre || u.correo_institucional || 'Sin asignar';
    }

    /* ---------- Agregado (1 request) ---------- */

    async function fetchResumenAgregado(anio) {
        var data = await API.peticion('/calendario/resumen?anio=' + encodeURIComponent(anio));
        if (!data || !Array.isArray(data.espacios)) throw new Error('agregado vacío');
        return data;
    }

    function aplicarResumenAgregado(data) {
        espacios = (data.espacios || []).map(function (e) {
            return { id: e.id, nombre: e.nombre, codigo_espacio: e.codigo_espacio, bloque_nombre: e.bloque_nombre, total: e.total || 0 };
        });
        totalesPorEspacio = {};
        espacios.forEach(function (e) { totalesPorEspacio[String(e.id)] = e.total || 0; });
        porMes = Array.isArray(data.por_mes) && data.por_mes.length === 12 ? data.por_mes.slice() : new Array(12).fill(0);
        eventos = (data.eventos || []).map(function (e) {
            var f = fechaISO(e.fecha || e.fecha_ejecucion);
            return {
                orden_id: e.orden_id,
                fecha: f,
                fecha_ejecucion: fechaISO(e.fecha_ejecucion || e.fecha),
                equipo_id: e.equipo_id != null ? e.equipo_id : null,
                espacio_id: e.espacio_id != null ? e.espacio_id : null,
                espacio_nombre: e.espacio_nombre || null,
                tecnico_nombre: e.tecnico_nombre || 'Sin asignar',
                observaciones: e.observaciones || '—',
                insumos_gastados: Array.isArray(e.insumos_gastados) ? e.insumos_gastados : [],
                costo_total: e.costo_total != null ? e.costo_total : null,
                estado: e.estado || 'Completado',
                origen: e.origen || 'mantenimiento'
            };
        });
        return construirIndice(eventos);
    }

    /* ---------- Legacy fallback (paginado) ---------- */

    async function fetchTodasPaginasMantenimientos(anio) {
        var todos = [];
        var skip = 0;
        var limit = 100;
        for (var i = 0; i < 20; i++) {
            var url = '/mantenimientos/?anio=' + encodeURIComponent(anio) + '&skip=' + skip + '&limit=' + limit;
            var res = await API.peticion(url).catch(function () { return []; });
            var lista = Array.isArray(res) ? res : (res && res.items ? res.items : []);
            if (!lista.length) break;
            todos = todos.concat(lista);
            if (lista.length < limit) break;
            skip += limit;
        }
        return todos;
    }

    async function fetchTodasPaginasProgramaciones(anio) {
        var todos = [];
        for (var page = 1; page <= 20; page++) {
            var url = '/programaciones/?anio=' + encodeURIComponent(anio) + '&estado=Completado&page=' + page + '&size=100';
            var res = await API.peticion(url).catch(function () { return { items: [] }; });
            var lista = (res && res.items) || (Array.isArray(res) ? res : []);
            if (!lista.length) break;
            todos = todos.concat(lista);
            if (lista.length < 100) break;
        }
        return todos;
    }

    async function cargarEquiposYEspacios() {
        var eqRes = await API.get('/equipos/?limit=100').catch(function () { return []; });
        var listaEq = Array.isArray(eqRes) ? eqRes : (eqRes && eqRes.items ? eqRes.items : []);
        equiposPorId = {};
        listaEq.forEach(function (eq) { equiposPorId[eq.id] = eq; });

        var espRes = await API.get('/espacios/?limit=100').catch(function () { return null; });
        var listaEsp = null;
        if (espRes) {
            if (Array.isArray(espRes)) listaEsp = espRes;
            else if (espRes.items) listaEsp = espRes.items;
            else if (espRes.data) listaEsp = espRes.data;
        }
        if (listaEsp && listaEsp.length) {
            espacios = listaEsp.slice().sort(function (a, b) { return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'); });
        } else {
            var mapa = {};
            listaEq.forEach(function (eq) {
                var esp = eq.espacio || eq.espacio_fisico || null;
                var nombre = (esp && esp.nombre) || 'Sin ubicación';
                var id = (esp && esp.id != null) ? esp.id : ('eq-' + eq.id);
                if (!mapa[id]) mapa[id] = { id: id, nombre: nombre };
            });
            espacios = Object.keys(mapa).map(function (k) { return mapa[k]; });
            espacios.sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre), 'es'); });
        }
        totalesPorEspacio = {};
    }

    function espacioDeEvento(e) {
        if (e.espacio_id != null) {
            var hit = null;
            for (var i = 0; i < espacios.length; i++) {
                if (String(espacios[i].id) === String(e.espacio_id)) { hit = espacios[i]; break; }
            }
            if (hit) return { id: hit.id, nombre: hit.nombre };
            if (e.espacio_nombre) return { id: e.espacio_id, nombre: e.espacio_nombre };
            return { id: e.espacio_id, nombre: 'Espacio ' + e.espacio_id };
        }
        var eq = equiposPorId[e.equipo_id] || null;
        var esp = eq ? (eq.espacio || eq.espacio_fisico || null) : null;
        if (esp && esp.id != null) return { id: esp.id, nombre: esp.nombre };
        if (e.espacio_nombre) {
            var hit2 = espacios.filter(function (s) { return s.nombre === e.espacio_nombre; })[0];
            if (hit2) return { id: hit2.id, nombre: hit2.nombre };
            return { id: 'nom-' + e.espacio_nombre, nombre: e.espacio_nombre };
        }
        return { id: 'sin-ubicacion', nombre: 'Sin ubicación' };
    }

    function normalizarEventos(mants, progs) {
        var out = [];
        (mants || []).forEach(function (m) {
            var f = String(m.fecha_mantenimiento || '').split('T')[0];
            if (!parsearFecha(f)) return;
            var insumos = Array.isArray(m.insumos_gastados) ? m.insumos_gastados : [];
            var costo = (m.costo_total != null) ? m.costo_total : (m.costo_servicio != null ? m.costo_servicio : null);
            out.push({
                orden_id: 'MNT-' + m.id,
                fecha: f,
                fecha_ejecucion: f,
                equipo_id: m.equipo_id != null ? m.equipo_id : (m.equipo && m.equipo.id),
                espacio_nombre: (m.equipo && m.equipo.espacio && m.equipo.espacio.nombre) || m.espacio_nombre || null,
                espacio_id: (m.equipo && m.equipo.espacio && m.equipo.espacio.id != null) ? m.equipo.espacio.id : null,
                tecnico_nombre: m.tecnico_nombre || nombreTecnico(m.encargado || null),
                observaciones: m.observaciones || m.detalle_mantenimiento || '—',
                insumos_gastados: insumos,
                costo_total: costo,
                estado: 'Completado'
            });
        });
        (progs || []).forEach(function (p) {
            if (!esCompletado(p.estado)) return;
            var f = String(p.fecha_programada || '').split('T')[0];
            if (!parsearFecha(f)) return;
            var enc = p.encargado || null;
            out.push({
                orden_id: 'ORD-' + String(p.id).padStart(3, '0'),
                fecha: f,
                fecha_ejecucion: f,
                equipo_id: p.equipo_id != null ? p.equipo_id : (p.equipo && p.equipo.id),
                espacio_nombre: (p.equipo && p.equipo.espacio && p.equipo.espacio.nombre) || null,
                espacio_id: (p.equipo && p.equipo.espacio && p.equipo.espacio.id != null) ? p.equipo.espacio.id : null,
                tecnico_nombre: nombreTecnico(enc),
                observaciones: 'Orden ORD-' + String(p.id).padStart(3, '0') + ' · ' + ((p.tipo_mantenimiento && p.tipo_mantenimiento.nombre) || ''),
                insumos_gastados: [],
                costo_total: null,
                estado: 'Completado'
            });
        });
        return out;
    }

    function construirIndice(eventosLista) {
        var mapa = {};
        porMes = new Array(12).fill(0);
        var conteoEsp = {};
        eventosLista.forEach(function (e) {
            var f = parsearFecha(e.fecha);
            if (!f || f.getFullYear() !== anioActual) return;
            var esp = espacioDeEvento(e);
            var clave = String(esp.id) + '|' + f.getMonth() + '-' + f.getDate();
            if (!mapa[clave]) mapa[clave] = [];
            mapa[clave].push(e);
            porMes[f.getMonth()] += 1;
            conteoEsp[String(esp.id)] = (conteoEsp[String(esp.id)] || 0) + 1;
        });
        if (!Object.keys(totalesPorEspacio).length) totalesPorEspacio = conteoEsp;
        return mapa;
    }

    /* ---------- Render ---------- */

    function renderHead() {
        var thead = document.getElementById('cal-resumen-head');
        if (!thead) return;
        var trMeses = document.createElement('tr');
        var corner = document.createElement('th');
        corner.setAttribute('rowspan', '2');
        corner.className = 'cal-resumen-corner';
        corner.textContent = 'Espacio';
        corner.scope = 'col';
        trMeses.appendChild(corner);
        for (var m = 0; m < 12; m++) {
            var th = document.createElement('th');
            th.setAttribute('colspan', String(diasEnMes(anioActual, m)));
            th.className = 'cal-resumen-mes';
            th.textContent = MESES[m];
            th.id = 'cal-mes-' + m;
            th.setAttribute('data-mes', String(m));
            trMeses.appendChild(th);
        }
        var thTotal = document.createElement('th');
        thTotal.setAttribute('rowspan', '2');
        thTotal.className = 'cal-resumen-total-head';
        thTotal.textContent = 'Total';
        thTotal.scope = 'col';
        thTotal.title = 'Intervenciones en el año';
        trMeses.appendChild(thTotal);
        var trDias = document.createElement('tr');
        for (var m2 = 0; m2 < 12; m2++) {
            var max = diasEnMes(anioActual, m2);
            for (var d = 1; d <= max; d++) {
                var td = document.createElement('th');
                td.className = 'cal-resumen-dia';
                td.textContent = String(d);
                td.title = d + ' de ' + MESES_CAP[m2];
                td.scope = 'col';
                trDias.appendChild(td);
            }
        }
        thead.innerHTML = '';
        thead.appendChild(trMeses);
        thead.appendChild(trDias);
    }

    function totalDeEspacio(espId, indice) {
        var key = String(espId);
        if (totalesPorEspacio[key] != null) return totalesPorEspacio[key];
        var n = 0;
        Object.keys(indice).forEach(function (k) {
            if (k.split('|')[0] === key) n += indice[k].length;
        });
        return n;
    }

    function renderBody(indice) {
        var tbody = document.getElementById('cal-resumen-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!espacios.length) {
            tbody.innerHTML = '<tr><td class="px-8 py-12 text-center text-sm text-slate-500">Sin espacios registrados.</td></tr>';
            return;
        }
        espacios.forEach(function (esp) {
            var tr = document.createElement('tr');
            var th = document.createElement('th');
            th.scope = 'row';
            th.className = 'cal-resumen-fila';
            th.textContent = esp.nombre || ('Espacio ' + esp.id);
            th.title = esp.bloque_nombre ? (esp.nombre + ' · ' + esp.bloque_nombre) : (esp.nombre || '');
            tr.appendChild(th);
            for (var m = 0; m < 12; m++) {
                var max = diasEnMes(anioActual, m);
                for (var d = 1; d <= max; d++) {
                    var td = document.createElement('td');
                    var clave = String(esp.id) + '|' + m + '-' + d;
                    var lista = indice[clave] || [];
                    if (!lista.length) {
                        var s = document.createElement('span');
                        s.className = 'cal-cell is-empty';
                        s.setAttribute('aria-hidden', 'true');
                        s.textContent = '';
                        td.appendChild(s);
                    } else {
                        var btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'cal-cell is-realizado' + (lista.length > 1 ? ' is-multi' : '');
                        btn.textContent = lista.length > 1 ? String(lista.length) : 'X';
                        btn.setAttribute('aria-label', (esp.nombre || '') + ', ' + MESES_CAP[m] + ' ' + d + ': ' + lista.length + ' registro(s). Ver detalle');
                        btn.title = lista.map(function (e) { return e.orden_id; }).join(', ');
                        (function (mesIdx, dia, items) {
                            btn.addEventListener('click', function () { abrirDetalle(mesIdx, dia, items); });
                        })(m, d, lista);
                        td.appendChild(btn);
                    }
                    tr.appendChild(td);
                }
            }
            var tdT = document.createElement('td');
            tdT.className = 'cal-total';
            var tot = totalDeEspacio(esp.id, indice);
            tdT.textContent = tot > 0 ? String(tot) : '—';
            tdT.setAttribute('aria-label', (esp.nombre || '') + ': ' + tot + ' en ' + anioActual);
            tr.appendChild(tdT);
            tbody.appendChild(tr);
        });
    }

    function renderKPIs(indice) {
        var elE = document.getElementById('kpi-espacios');
        var elV = document.getElementById('kpi-eventos');
        var elC = document.getElementById('kpi-cobertura');
        var totalEv = eventos.length;
        var conDatos = Object.keys(totalesPorEspacio).filter(function (k) { return (totalesPorEspacio[k] || 0) > 0; }).length;
        if (!conDatos) {
            var vistos = {};
            Object.keys(indice).forEach(function (k) { vistos[k.split('|')[0]] = true; });
            conDatos = Object.keys(vistos).length;
        }
        var cob = espacios.length ? Math.round((conDatos / espacios.length) * 100) : 0;
        if (elE) elE.textContent = String(espacios.length);
        if (elV) elV.textContent = String(totalEv);
        if (elC) elC.textContent = cob + '%';
    }

    function renderMonthNav() {
        var nav = document.getElementById('nav-meses');
        if (!nav) return;
        nav.innerHTML = '';
        MESES_SHORT.forEach(function (nombre, idx) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = nombre;
            b.setAttribute('aria-label', 'Ir a ' + MESES_CAP[idx]);
            b.addEventListener('click', function () { saltarAMes(idx); });
            nav.appendChild(b);
        });
        var sel = document.getElementById('select-mes-salto');
        if (sel && !sel.options.length) {
            MESES_CAP.forEach(function (nombre, idx) {
                var o = document.createElement('option');
                o.value = String(idx);
                o.textContent = nombre;
                sel.appendChild(o);
            });
            sel.value = String(new Date().getMonth());
            sel.addEventListener('change', function () { saltarAMes(Number(sel.value) || 0); });
        }
    }

    function saltarAMes(mesIdx) {
        var head = document.getElementById('cal-mes-' + mesIdx);
        var scroll = document.getElementById('cal-resumen-scroll');
        var sel = document.getElementById('select-mes-salto');
        if (sel) sel.value = String(mesIdx);
        document.querySelectorAll('.cal-resumen-mes.is-target').forEach(function (el) { el.classList.remove('is-target'); });
        if (head) head.classList.add('is-target');
        if (head && scroll) {
            try { scroll.scrollTo({ left: Math.max(0, head.offsetLeft - 200), behavior: 'smooth' }); }
            catch (_) { scroll.scrollLeft = Math.max(0, head.offsetLeft - 200); }
        }
        setTimeout(function () { if (head) head.classList.remove('is-target'); }, 1600);
    }

    function renderListaMovil() {
        var cont = document.getElementById('lista-calendario-resumen');
        if (!cont) return;
        cont.innerHTML = '';
        var delAnio = eventos.filter(function (e) {
            var f = parsearFecha(e.fecha);
            return f && f.getFullYear() === anioActual;
        }).sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; });
        if (!delAnio.length) {
            cont.innerHTML = '<p class="text-sm text-slate-500 font-medium text-center py-6">Sin registros en ' + anioActual + '.</p>';
            return;
        }
        delAnio.forEach(function (e) {
            var esp = espacioDeEvento(e);
            var item = document.createElement('button');
            item.type = 'button';
            item.className = 'cal-lista-item w-full text-left flex items-center justify-between gap-3';
            item.innerHTML =
                '<span class="min-w-0">' +
                '<span class="block text-xs font-black text-emerald-700 uppercase tracking-wider">X · Realizado</span>' +
                '<span class="block text-sm font-bold text-slate-800 truncate">' + escaparHtml(formatearFecha(e.fecha)) + ' — ' + escaparHtml(esp.nombre) + '</span>' +
                '<span class="block text-xs text-slate-600 truncate">' + escaparHtml(e.orden_id + ' · ' + (e.tecnico_nombre || '')) + '</span>' +
                '</span><i class="fas fa-chevron-right text-slate-500" aria-hidden="true"></i>';
            (function (ev) {
                item.addEventListener('click', function () { abrirDetalle(null, null, [ev]); });
            })(e);
            cont.appendChild(item);
        });
    }

    function abrirDetalle(mesIdx, dia, lista) {
        var subt = document.getElementById('subtitulo-detalle-calendario');
        if (subt) {
            subt.textContent = (mesIdx != null && dia != null)
                ? MESES_CAP[mesIdx] + ' ' + dia + ' de ' + anioActual + ' · ' + lista.length + ' registro(s)'
                : 'Registro · ' + anioActual;
        }
        var tbody = document.getElementById('tabla-detalle-calendario-body');
        if (tbody) {
            tbody.innerHTML = '';
            (lista || []).forEach(function (e) {
                var insumosTxt = (Array.isArray(e.insumos_gastados) && e.insumos_gastados.length)
                    ? e.insumos_gastados.map(function (i) { return (i.nombre || 'Insumo') + ' ×' + (i.cantidad != null ? i.cantidad : ''); }).join(', ')
                    : '—';
                var tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50/60 transition';
                tr.innerHTML =
                    '<td class="px-5 py-4 font-black text-emerald-700">' + escaparHtml(e.orden_id || ('MNT-' + e.id)) + '</td>' +
                    '<td class="px-5 py-4 font-semibold text-slate-700 whitespace-nowrap">' + escaparHtml(formatearFecha(e.fecha_ejecucion || e.fecha)) + '</td>' +
                    '<td class="px-5 py-4 text-slate-600">' + escaparHtml(e.tecnico_nombre || 'Sin asignar') + '</td>' +
                    '<td class="px-5 py-4 text-slate-600">' + escaparHtml(e.observaciones || '—') + '</td>' +
                    '<td class="px-5 py-4 text-slate-600">' + escaparHtml(insumosTxt) + '</td>' +
                    '<td class="px-5 py-4 font-bold text-slate-700 whitespace-nowrap">' + escaparHtml(e.costo_total != null ? formatearCOP(e.costo_total) : '—') + '</td>';
                tbody.appendChild(tr);
            });
        }
        if (window.ModalAccesible) window.ModalAccesible.open('modal-detalle-calendario');
        else {
            var modal = document.getElementById('modal-detalle-calendario');
            if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
        }
    }

    function cerrarDetalleCalendario() {
        if (window.ModalAccesible) window.ModalAccesible.close('modal-detalle-calendario');
        else {
            var modal = document.getElementById('modal-detalle-calendario');
            if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
        }
    }

    function poblarAnios() {
        var sel = document.getElementById('select-anio-resumen');
        if (!sel) return;
        var base = new Date().getFullYear();
        var html = '';
        for (var y = base - 2; y <= base + 2; y++) {
            html += '<option value="' + y + '"' + (y === anioActual ? ' selected' : '') + '>' + y + '</option>';
        }
        sel.innerHTML = html;
        sel.addEventListener('change', function () {
            anioActual = Number(sel.value) || base;
            recargar();
        });
    }

    function pintarTodo(indice, origen) {
        renderHead();
        renderBody(indice);
        renderListaMovil();
        renderKPIs(indice);
        renderMonthNav();
        var estado = document.getElementById('resumen-calendario-estado');
        if (estado) estado.textContent = eventos.length + ' mantenimiento(s) completado(s) en ' + anioActual + ' · ' + espacios.length + ' espacios.' + (origen === 'agregado' ? ' (1 request)' : ' (legacy)');
    }

    async function recargar() {
        var estado = document.getElementById('resumen-calendario-estado');
        if (estado) estado.textContent = 'Cargando mantenimientos del año ' + anioActual + '…';
        // Vía dinámica: 1 request agregado
        try {
            var data = await fetchResumenAgregado(anioActual);
            var indice = aplicarResumenAgregado(data);
            pintarTodo(indice, 'agregado');
            return;
        } catch (_) { /* fallback legacy */ }
        try {
            var res = await Promise.all([fetchTodasPaginasMantenimientos(anioActual), fetchTodasPaginasProgramaciones(anioActual)]);
            eventos = normalizarEventos(res[0], res[1]);
        } catch (e) {
            eventos = [];
        }
        var indiceLegacy = construirIndice(eventos);
        pintarTodo(indiceLegacy, 'legacy');
    }

    async function init() {
        if (window.ModalAccesible) window.ModalAccesible.initModal('modal-detalle-calendario');
        poblarAnios();
        var sel = document.getElementById('select-anio-resumen');
        if (sel) anioActual = Number(sel.value) || anioActual;
        // Agregado ya trae espacios; legacy necesita precarga
        try {
            var data = await fetchResumenAgregado(anioActual);
            var indice = aplicarResumenAgregado(data);
            pintarTodo(indice, 'agregado');
        } catch (_) {
            try { await cargarEquiposYEspacios(); } catch (e) { espacios = []; }
            await recargar();
        }
    }

    window.cerrarDetalleCalendario = cerrarDetalleCalendario;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
