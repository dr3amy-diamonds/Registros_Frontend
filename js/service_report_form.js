/**
 * AiresFlow — service_report_form.js
 * Ciclo de cierre técnico: precarga por orden_id, costo = materiales, POST atómico.
 */

const ESTADOS_INMUTABLES = new Set(['Completado', 'Cancelado']);

const INSUMOS_FIJOS_ESPERADOS = [
    'Capacitor de Marcha',
    'Bomba de Condensación',
    'Embobinado de Motor',
];

let ordenId = null;
let equipoSeleccionadoId = null;
let tipoMantenimientoId = null;
let ordenCongelada = false;
let usuarioActualId = null;
let contadorFilasAdicionales = 0;

function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto ?? '';
    return div.innerHTML;
}

function extraerMensajeError(error) {
    const detalle = error?.message || error;
    if (Array.isArray(detalle)) {
        return detalle.map((d) => d.msg || JSON.stringify(d)).join('; ');
    }
    return String(detalle || 'Error desconocido');
}

function mostrarToast(tipo, mensaje) {
    let contenedor = document.getElementById('toast-container');
    if (!contenedor) {
        contenedor = document.createElement('div');
        contenedor.id = 'toast-container';
        contenedor.className = 'fixed top-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none';
        document.body.appendChild(contenedor);
    }

    const esExito = tipo === 'exito';
    const clases = esExito
        ? 'bg-uccLight text-slate-900 border border-cyan-300/50'
        : 'bg-red-500 text-white border border-red-400/40';
    const icono = esExito ? 'fa-circle-check' : 'fa-circle-exclamation';

    const toast = document.createElement('div');
    toast.className = `${clases} pointer-events-auto flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl text-sm font-semibold max-w-sm`;
    toast.innerHTML = `<i class="fas ${icono}"></i><span>${escaparHtml(mensaje)}</span>`;
    contenedor.appendChild(toast);
    setTimeout(() => toast.remove(), 4200);
}

function obtenerOrdenIdDesdeUrl() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('orden_id');
    if (!raw) return null;
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function setValorCampo(id, valor) {
    const el = document.getElementById(id);
    if (el) el.value = valor ?? '';
}

function congelarFormulario(congelar) {
    ordenCongelada = congelar;
    const form = document.getElementById('reporteForm');
    if (!form) return;

    form.querySelectorAll('input, textarea, select, button').forEach((el) => {
        if (el.id === 'btn-cerrar-sesion') return;
        if (congelar) {
            el.dataset.estadoPrevio = el.disabled ? '1' : '0';
            el.disabled = true;
        } else if (el.dataset.estadoPrevio !== '1') {
            el.disabled = false;
        }
    });

    document.getElementById('banner-orden-cerrada')?.classList.toggle('hidden', !congelar);

    const btnGuardar = document.getElementById('btn-guardar-reporte');
    if (btnGuardar) btnGuardar.classList.toggle('hidden', congelar);

    const btnLimpiar = document.getElementById('btn-limpiar-formulario');
    if (btnLimpiar) btnLimpiar.classList.toggle('hidden', congelar);

    document.getElementById('btn-agregar-insumo-adicional')?.classList.toggle('hidden', congelar);
}

function poblarSelectEspacio(espacio) {
    const selectEspacio = document.getElementById('select-espacio');
    if (!selectEspacio || !espacio) return;

    const bloque = espacio.bloque?.nombre_bloque || espacio.bloque || '';
    const etiqueta = [espacio.nombre, bloque].filter(Boolean).join(' · ');

    selectEspacio.innerHTML = '';
    const opcion = document.createElement('option');
    opcion.value = String(espacio.id);
    opcion.textContent = etiqueta || `Espacio #${espacio.id}`;
    opcion.selected = true;
    selectEspacio.appendChild(opcion);
    selectEspacio.disabled = true;
}

function poblarSelectTipoMantenimiento(tipos, tipoSeleccionadoId) {
    const selectTipo = document.getElementById('tipoMantenimiento');
    if (!selectTipo) return;

    const lista = Array.isArray(tipos) ? tipos : [];
    selectTipo.innerHTML = '';

    if (!lista.length) {
        selectTipo.innerHTML = '<option value="" disabled selected>Sin tipos disponibles</option>';
        return;
    }

    lista.forEach((tipo) => {
        const opcion = document.createElement('option');
        opcion.value = String(tipo.id);
        opcion.textContent = tipo.nombre;
        selectTipo.appendChild(opcion);
    });

    if (tipoSeleccionadoId) {
        selectTipo.value = String(tipoSeleccionadoId);
    }
    selectTipo.disabled = true;
}

async function cargarCatalogoTiposMantenimiento(tipoSeleccionadoId) {
    try {
        const tipos = await API.get('/tipos-mantenimiento/');
        const lista = Array.isArray(tipos) ? tipos : (tipos?.items || []);
        poblarSelectTipoMantenimiento(lista, tipoSeleccionadoId);
        return lista;
    } catch (error) {
        console.error('Error cargando tipos de mantenimiento:', error);
        const selectTipo = document.getElementById('tipoMantenimiento');
        if (selectTipo) {
            selectTipo.innerHTML = '<option value="" disabled selected>Error al cargar tipos</option>';
        }
        return [];
    }
}

function aplicarDatosOrden(programacion) {
    const equipo = programacion.equipo || {};

    ordenId = programacion.id;
    equipoSeleccionadoId = programacion.equipo_id;
    tipoMantenimientoId = programacion.tipo_mantenimiento_id;
    usuarioActualId = programacion.encargado_id;

    setValorCampo('ordenId', ordenId);
    setValorCampo('equipoId', equipoSeleccionadoId);
    setValorCampo('codigoActivo', equipo.codigo_activo || `EQ-${equipo.id || programacion.equipo_id}`);
    setValorCampo('marcaActivo', equipo.marca?.nombre || '—');
    setValorCampo('modeloActivo', equipo.modelo || '—');
    setValorCampo('bloqueEquipo', equipo.espacio?.bloque?.nombre_bloque || '—');

    poblarSelectEspacio(equipo.espacio);
    cargarCatalogoTiposMantenimiento(tipoMantenimientoId);

    if (ESTADOS_INMUTABLES.has(programacion.estado)) {
        congelarFormulario(true);
    }
}

async function precargarOrdenDesdeBackend(idOrden) {
    try {
        const programacion = await API.get(`/programaciones/orden/${idOrden}`);
        aplicarDatosOrden(programacion);
        return programacion;
    } catch (error) {
        console.error('Error precargando orden:', error);
        document.getElementById('reporteForm')?.classList.add('hidden');
        document.getElementById('banner-orden-cerrada')?.classList.add('hidden');

        const banner = document.getElementById('banner-sin-orden-id');
        if (banner) {
            banner.classList.remove('hidden');
            banner.innerHTML = `
                <i class="fas fa-exclamation-circle text-red-400 text-3xl mb-4"></i>
                <p class="leading-relaxed">No se pudo cargar la orden #${escaparHtml(String(idOrden))}: ${escaparHtml(extraerMensajeError(error))}</p>
                <a href="/mis-ordenes" class="inline-block mt-4 text-uccLight font-bold hover:underline">Volver a la Agenda de Mantenimiento</a>
            `;
        }
        return null;
    }
}

function crearElementoComponente(comp) {
    const divComponente = document.createElement('div');
    divComponente.className = 'p-4 bg-white border border-slate-200 rounded-lg hover:border-uccLight/50 transition componente-item';

    const checkboxId = `checkbox_${comp.id}`;
    const cantidadId = `cant_${comp.id}`;
    const precioId = `precio_${comp.id}`;
    const detallesId = `detalles_${comp.id}`;

    divComponente.innerHTML = `
        <div class="flex items-start gap-3 mb-0">
            <input type="checkbox" id="${checkboxId}"
                class="checkbox-componente w-5 h-5 rounded border-slate-300 text-uccLight cursor-pointer focus:ring-2 focus:ring-uccLight mt-0.5"
                data-componente-id="${comp.id}" data-detalles-id="${detallesId}">
            <label for="${checkboxId}" class="flex-1 text-sm font-bold text-slate-700 cursor-pointer">
                ${escaparHtml(comp.nombre)}
            </label>
        </div>
        <div id="${detallesId}" class="mt-4 pt-4 border-t border-slate-100 space-y-3 hidden">
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label for="${cantidadId}" class="block text-xs font-bold uppercase text-slate-600 mb-1">Cantidad</label>
                    <input type="number" id="${cantidadId}" class="input-cantidad w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-uccLight focus:outline-none" placeholder="Ej: 2" step="0.1" min="0">
                </div>
                <div>
                    <label for="${precioId}" class="block text-xs font-bold uppercase text-slate-600 mb-1">Valor unitario ($)</label>
                    <input type="number" id="${precioId}" class="input-precio w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-uccLight focus:outline-none" placeholder="Ej: 15000" step="100" min="0">
                </div>
            </div>
            <div class="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <p class="text-xs text-slate-600">
                    <span class="font-bold">Subtotal: $</span>
                    <span class="subtotal-componente text-sm font-black text-uccLight">0</span>
                </p>
            </div>
        </div>`;

    return divComponente;
}

function crearFilaInsumoAdicional() {
    contadorFilasAdicionales += 1;
    const filaId = contadorFilasAdicionales;
    const contenedor = document.getElementById('contenedor-insumos-adicionales');
    if (!contenedor) return;

    const fila = document.createElement('div');
    fila.id = `insumo-adicional-${filaId}`;
    fila.className = 'p-4 bg-white border border-slate-200 rounded-lg space-y-3 insumo-adicional-item';
    fila.innerHTML = `
        <div class="flex items-start justify-between gap-3">
            <label class="block text-xs font-bold uppercase text-slate-600 flex-1">
                Nombre del insumo
                <input type="text" class="input-nombre-adicional w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-uccLight focus:outline-none" placeholder="Ej: Gas refrigerante R32">
            </label>
            <button type="button" data-fila-id="${filaId}" class="btn-quitar-adicional shrink-0 p-2 text-slate-400 hover:text-red-500 transition mt-5" title="Quitar fila">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="block text-xs font-bold uppercase text-slate-600 mb-1">Cantidad</label>
                <input type="number" class="input-cantidad-adicional w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-uccLight focus:outline-none" step="0.1" min="0" placeholder="Ej: 1">
            </div>
            <div>
                <label class="block text-xs font-bold uppercase text-slate-600 mb-1">Valor unitario ($)</label>
                <input type="number" class="input-precio-adicional w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-uccLight focus:outline-none" step="100" min="0" placeholder="Ej: 25000">
            </div>
        </div>
        <p class="text-xs text-slate-500">
            <span class="font-bold">Subtotal: $</span>
            <span class="subtotal-adicional text-sm font-black text-uccLight">0</span>
        </p>`;

    contenedor.appendChild(fila);

    fila.querySelector('.btn-quitar-adicional')?.addEventListener('click', () => {
        if (ordenCongelada) return;
        fila.remove();
        actualizarTotalMateriales();
    });

    fila.querySelectorAll('.input-cantidad-adicional, .input-precio-adicional').forEach((input) => {
        input.addEventListener('input', () => actualizarSubtotalAdicional(fila));
    });
}

function actualizarSubtotalAdicional(fila) {
    const cantidad = parseFloat(fila.querySelector('.input-cantidad-adicional')?.value || 0);
    const precio = parseFloat(fila.querySelector('.input-precio-adicional')?.value || 0);
    const subtotalSpan = fila.querySelector('.subtotal-adicional');
    if (subtotalSpan) {
        subtotalSpan.textContent = (cantidad * precio).toLocaleString('es-CO');
    }
    actualizarTotalMateriales();
}

function actualizarSubtotalComponente(detallesId) {
    const detallesDiv = document.getElementById(detallesId);
    if (!detallesDiv) return;

    const cantidad = parseFloat(detallesDiv.querySelector('.input-cantidad')?.value || 0);
    const precio = parseFloat(detallesDiv.querySelector('.input-precio')?.value || 0);
    const subtotalSpan = detallesDiv.querySelector('.subtotal-componente');
    if (subtotalSpan) {
        subtotalSpan.textContent = (cantidad * precio).toLocaleString('es-CO');
    }
    actualizarTotalMateriales();
}

function calcularTotalMateriales() {
    let total = 0;

    document.querySelectorAll('.checkbox-componente:checked').forEach((checkbox) => {
        const detallesId = checkbox.getAttribute('data-detalles-id');
        const detallesDiv = document.getElementById(detallesId);
        if (!detallesDiv) return;
        const cantidad = parseFloat(detallesDiv.querySelector('.input-cantidad')?.value || 0);
        const precio = parseFloat(detallesDiv.querySelector('.input-precio')?.value || 0);
        total += cantidad * precio;
    });

    document.querySelectorAll('.insumo-adicional-item').forEach((fila) => {
        const nombre = fila.querySelector('.input-nombre-adicional')?.value?.trim();
        const cantidad = parseFloat(fila.querySelector('.input-cantidad-adicional')?.value || 0);
        const precio = parseFloat(fila.querySelector('.input-precio-adicional')?.value || 0);
        if (nombre && cantidad > 0) {
            total += cantidad * precio;
        }
    });

    return total;
}

function actualizarTotalMateriales() {
    const total = calcularTotalMateriales();
    const totalEl = document.getElementById('total-materiales');
    if (totalEl) totalEl.textContent = total.toLocaleString('es-CO');
    return total;
}

function configurarEventListenersComponentes() {
    document.querySelectorAll('.checkbox-componente').forEach((checkbox) => {
        const detallesId = checkbox.getAttribute('data-detalles-id');
        const componenteId = checkbox.getAttribute('data-componente-id');
        const detallesDiv = document.getElementById(detallesId);
        const cantidadInput = document.getElementById(`cant_${componenteId}`);
        const precioInput = document.getElementById(`precio_${componenteId}`);

        checkbox.addEventListener('change', (e) => {
            if (ordenCongelada) {
                e.target.checked = !e.target.checked;
                return;
            }
            if (e.target.checked) {
                detallesDiv.classList.remove('hidden');
            } else {
                detallesDiv.classList.add('hidden');
                if (cantidadInput) cantidadInput.value = '';
                if (precioInput) precioInput.value = '';
                const subtotalSpan = detallesDiv.querySelector('.subtotal-componente');
                if (subtotalSpan) subtotalSpan.textContent = '0';
            }
            actualizarTotalMateriales();
        });

        [cantidadInput, precioInput].forEach((input) => {
            input?.addEventListener('input', () => actualizarSubtotalComponente(detallesId));
        });
    });
}

function cargarCheckboxesComponentes() {
    const contenedor = document.getElementById('contenedor-componentes');
    if (!contenedor) return;

    API.get('/tipo_componentes/?fijos=true')
        .then((componentes) => {
            let lista = Array.isArray(componentes) ? componentes : [];
            lista = lista.filter((c) => INSUMOS_FIJOS_ESPERADOS.includes(c.nombre));
            lista.sort(
                (a, b) => INSUMOS_FIJOS_ESPERADOS.indexOf(a.nombre) - INSUMOS_FIJOS_ESPERADOS.indexOf(b.nombre)
            );

            contenedor.innerHTML = '';

            if (!lista.length) {
                contenedor.innerHTML = '<p class="text-center text-slate-400 py-4 text-sm">No hay insumos fijos configurados en el sistema.</p>';
                return;
            }

            lista.forEach((comp) => contenedor.appendChild(crearElementoComponente(comp)));
            configurarEventListenersComponentes();
            actualizarTotalMateriales();
        })
        .catch((error) => {
            contenedor.innerHTML = `<p class="text-red-600 text-sm p-4">${escaparHtml(extraerMensajeError(error))}</p>`;
        });
}

function recolectarComponentesPayload() {
    const componentes = [];

    document.querySelectorAll('.checkbox-componente:checked').forEach((checkbox) => {
        const componenteId = Number(checkbox.getAttribute('data-componente-id'));
        const detallesId = checkbox.getAttribute('data-detalles-id');
        const detallesDiv = document.getElementById(detallesId);
        if (!detallesDiv) return;

        const cantidad = parseFloat(detallesDiv.querySelector('.input-cantidad')?.value || 0);
        const precio = parseFloat(detallesDiv.querySelector('.input-precio')?.value || 0);
        if (cantidad <= 0) return;

        componentes.push({
            repuesto_utilizado_id: componenteId,
            cantidad,
            precio_unitario: precio,
        });
    });

    document.querySelectorAll('.insumo-adicional-item').forEach((fila) => {
        const nombre = fila.querySelector('.input-nombre-adicional')?.value?.trim();
        const cantidad = parseFloat(fila.querySelector('.input-cantidad-adicional')?.value || 0);
        const precio = parseFloat(fila.querySelector('.input-precio-adicional')?.value || 0);
        if (!nombre || cantidad <= 0) return;

        componentes.push({
            nombre,
            cantidad,
            precio_unitario: precio,
        });
    });

    return componentes;
}

function construirDetalleMantenimiento() {
    const descripcion = document.getElementById('descripcionTrabajo')?.value?.trim() || '';
    const problemas = document.getElementById('problemas_encontrados')?.value?.trim() || '';
    const acciones = document.getElementById('acciones_recomendadas')?.value?.trim() || '';
    const estado = document.querySelector('input[name="estado"]:checked')?.value || '';

    return [
        descripcion && `TRABAJO REALIZADO:\n${descripcion}`,
        problemas && `HALLAZGOS TÉCNICOS:\n${problemas}`,
        acciones && `RECOMENDACIONES:\n${acciones}`,
        estado && `ESTADO FINAL DEL EQUIPO: ${estado}`,
    ].filter(Boolean).join('\n\n');
}

async function cerrarOrdenAtomica(event) {
    event.preventDefault();

    if (ordenCongelada) {
        mostrarToast('error', 'Esta orden ya está cerrada y no admite cambios.');
        return;
    }

    const form = document.getElementById('reporteForm');
    if (!form?.checkValidity()) {
        form.reportValidity();
        return;
    }

    if (!ordenId) {
        mostrarToast('error', 'Falta el parámetro orden_id en la URL (ej: ?orden_id=25).');
        return;
    }

    if (!equipoSeleccionadoId) {
        mostrarToast('error', 'No se cargó el equipo asociado a la orden.');
        return;
    }

    const detalle = construirDetalleMantenimiento();
    if (detalle.trim().length < 15) {
        mostrarToast('error', 'El detalle técnico debe tener al menos 15 caracteres.');
        return;
    }

    const componentes = recolectarComponentesPayload();
    const costoServicio = actualizarTotalMateriales();
    if (costoServicio < 0) {
        mostrarToast('error', 'El costo del servicio no puede ser negativo.');
        return;
    }

    const btnGuardar = document.getElementById('btn-guardar-reporte');
    const textoOriginal = btnGuardar?.innerHTML;

    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cerrando orden...';
    }

    try {
        const payload = {
            fecha_mantenimiento: document.getElementById('fechaMantenimiento')?.value,
            detalle_mantenimiento: detalle,
            costo_servicio: costoServicio,
            componentes,
        };

        const respuesta = await API.post(`/mantenimientos/cerrar-orden/${ordenId}`, payload);

        mostrarToast(
            'exito',
            `Orden #${ordenId} cerrada. Mantenimiento #${respuesta?.mantenimiento?.id ?? ''} registrado.`
        );

        congelarFormulario(true);
    } catch (error) {
        mostrarToast('error', extraerMensajeError(error));
    } finally {
        if (btnGuardar && !ordenCongelada) {
            btnGuardar.disabled = false;
            btnGuardar.innerHTML = textoOriginal;
        }
    }
}

function reiniciarFormularioEditable() {
    if (ordenCongelada) return;

    document.querySelectorAll('.checkbox-componente').forEach((checkbox) => {
        checkbox.checked = false;
        const detallesId = checkbox.getAttribute('data-detalles-id');
        const detallesDiv = document.getElementById(detallesId);
        detallesDiv?.classList.add('hidden');
    });

    const contenedorAdicionales = document.getElementById('contenedor-insumos-adicionales');
    if (contenedorAdicionales) contenedorAdicionales.innerHTML = '';

    actualizarTotalMateriales();
}

function inicializarFormularioReporte() {
    const nombreUsuario = localStorage.getItem('usuario_nombre') || 'TÉCNICO DE INFRAESTRUCTURA';
    setValorCampo('nombreTecnico', nombreUsuario.toUpperCase());

    const inputFecha = document.getElementById('fechaMantenimiento');
    if (inputFecha) inputFecha.value = new Date().toISOString().split('T')[0];

    document.getElementById('reporteForm')?.addEventListener('submit', cerrarOrdenAtomica);

    document.getElementById('btn-agregar-insumo-adicional')?.addEventListener('click', () => {
        if (ordenCongelada) return;
        crearFilaInsumoAdicional();
    });

    document.getElementById('btn-limpiar-formulario')?.addEventListener('click', async () => {
        if (ordenCongelada) return;
        const confirmar = await solicitarConfirmacion({
            titulo: 'Limpiar formulario',
            mensaje: '¿Está seguro de limpiar los campos editables? Los datos del equipo no se modificarán.',
            textoAceptar: 'Sí, limpiar',
            esPeligroso: false
        });
        if (!confirmar) return;

        const camposPreservar = ['codigoActivo', 'marcaActivo', 'modeloActivo', 'bloqueEquipo', 'equipoId', 'ordenId', 'nombreTecnico', 'fechaMantenimiento'];
        const valores = {};
        camposPreservar.forEach((id) => {
            const el = document.getElementById(id);
            if (el) valores[id] = el.value;
        });

        document.getElementById('reporteForm')?.reset();

        camposPreservar.forEach((id) => setValorCampo(id, valores[id]));
        if (inputFecha && valores.fechaMantenimiento) inputFecha.value = valores.fechaMantenimiento;

        if (tipoMantenimientoId) {
            cargarCatalogoTiposMantenimiento(tipoMantenimientoId);
        }

        reiniciarFormularioEditable();
    });
}

function mostrarAccesoDesdeAgenda() {
    document.getElementById('reporteForm')?.classList.add('hidden');
    document.getElementById('banner-orden-cerrada')?.classList.add('hidden');
    document.getElementById('banner-sin-orden-id')?.classList.remove('hidden');
}

function ocultarAccesoDesdeAgenda() {
    document.getElementById('reporteForm')?.classList.remove('hidden');
    document.getElementById('banner-sin-orden-id')?.classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', async () => {
    inicializarFormularioReporte();

    const idDesdeUrl = obtenerOrdenIdDesdeUrl();
    if (!idDesdeUrl) {
        mostrarAccesoDesdeAgenda();
        return;
    }

    ocultarAccesoDesdeAgenda();
    cargarCheckboxesComponentes();
    await precargarOrdenDesdeBackend(idDesdeUrl);
});
