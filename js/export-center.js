const TAMANO_PAGINA_EXPORTACION = 100;
const MAX_PAGINAS_EXPORTACION = 500;
const TIPO_CSV = "text/csv;charset=utf-8;";
const TIPO_JSON = "application/json;charset=utf-8;";

const cacheExportacion = {
    equipos: null,
    mantenimientos: null,
    programaciones: null
};

let mapaEquiposExportacion = new Map();

const COLUMNAS_EQUIPOS = [
    ["id", (equipo) => equipo.id],
    ["codigo_activo", (equipo) => equipo.codigo_activo],
    ["marca", (equipo) => equipo.marca?.nombre ?? ""],
    ["modelo", (equipo) => equipo.modelo],
    ["capacidad_btu", (equipo) => equipo.capacidad_btu],
    ["tonelaje", (equipo) => equipo.tonelaje],
    ["numero_serie", (equipo) => equipo.numero_serie],
    ["voltaje", (equipo) => equipo.voltaje],
    ["refrigerante", (equipo) => equipo.refrigerante],
    ["fecha_compra", (equipo) => equipo.fecha_compra],
    ["fecha_instalacion", (equipo) => equipo.fecha_instalacion],
    ["ultima_fecha", (equipo) => equipo.ultima_fecha],
    ["proxima_fecha", (equipo) => equipo.proxima_fecha],
    ["estado", (equipo) => equipo.estado],
    ["tipo_equipo", (equipo) => equipo.tipo?.nombre ?? ""],
    ["bloque_id", (equipo) => equipo.espacio?.bloque_id ?? ""],
    ["espacio_id", (equipo) => equipo.espacio?.id ?? equipo.espacio_id ?? ""],
    ["espacio", (equipo) => equipo.espacio?.nombre ?? ""],
    ["piso", (equipo) => equipo.espacio?.piso ?? ""]
];

const COLUMNAS_MANTENIMIENTOS = [
    ["id", (mantenimiento) => mantenimiento.id],
    ["fecha_mantenimiento", (mantenimiento) => mantenimiento.fecha_mantenimiento],
    ["equipo_id", (mantenimiento) => mantenimiento.equipo_id],
    ["equipo_codigo", (mantenimiento) => mapaEquiposExportacion.get(Number(mantenimiento.equipo_id))?.codigo_activo ?? ""],
    ["tipo", (mantenimiento) => mantenimiento.tipo_nombre ?? mantenimiento.tipo_mantenimiento?.nombre ?? ""],
    ["tecnico", (mantenimiento) => mantenimiento.tecnico_nombre ?? mantenimiento.encargado?.nombre ?? ""],
    ["trabajo_realizado", (mantenimiento) => mantenimiento.trabajo_realizado ?? mantenimiento.observaciones ?? mantenimiento.detalle_mantenimiento ?? ""],
    ["estado_final", (mantenimiento) => mantenimiento.estado_final],
    ["hallazgos", (mantenimiento) => mantenimiento.hallazgos],
    ["recomendaciones", (mantenimiento) => mantenimiento.recomendaciones],
    ["costo_servicio", (mantenimiento) => mantenimiento.costo_servicio ?? mantenimiento.costo_total ?? ""],
    ["created_at", (mantenimiento) => mantenimiento.created_at]
];

const COLUMNAS_PROGRAMACIONES = [
    ["id", (programacion) => programacion.id],
    ["fecha_programada", (programacion) => programacion.fecha_programada],
    ["estado", (programacion) => programacion.estado],
    ["equipo_id", (programacion) => programacion.equipo_id],
    ["equipo_codigo", (programacion) => programacion.equipo?.codigo_activo ?? ""],
    ["tipo_mantenimiento", (programacion) => programacion.tipo_mantenimiento?.nombre ?? ""],
    ["tecnico", (programacion) => programacion.encargado?.nombre ?? ""],
    ["mantenimiento_id", (programacion) => programacion.mantenimiento_id]
];

function formatearNumero(valor) {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return "—";
    return new Intl.NumberFormat("es-CO").format(numero);
}

function mostrarEstado(mensaje, variante = "info") {
    const contenedor = document.getElementById("export-status");
    if (!contenedor) return;

    const estilos = {
        info: "text-slate-600",
        exito: "text-emerald-700 border-emerald-200 bg-emerald-50",
        error: "text-rose-700 border-rose-200 bg-rose-50"
    };

    contenedor.className = `panel p-3 mt-4 text-sm ${estilos[variante] || estilos.info}`;
    contenedor.textContent = mensaje;
}

function establecerCargando(activo, botonActivo = null) {
    document.querySelectorAll("[data-export], #btn-exportar-todo").forEach((boton) => {
        if (activo) {
            boton.dataset.htmlOriginal = boton.innerHTML;
            boton.disabled = true;
            if (boton === botonActivo) {
                boton.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Generando…';
            }
        } else {
            boton.disabled = false;
            if (boton.dataset.htmlOriginal) {
                boton.innerHTML = boton.dataset.htmlOriginal;
                delete boton.dataset.htmlOriginal;
            }
        }
    });
}

function obtenerFormato() {
    return document.querySelector('input[name="formato-exportacion"]:checked')?.value || "csv";
}

function actualizarEstiloFormato() {
    document.querySelectorAll('input[name="formato-exportacion"]').forEach((input) => {
        const etiqueta = input.closest("label");
        if (!etiqueta) return;
        etiqueta.classList.toggle("border-cyan-300", input.checked);
        etiqueta.classList.toggle("bg-cyan-50", input.checked);
    });

    const nota = document.getElementById("nota-exportar-todo");
    if (nota) {
        nota.textContent = obtenerFormato() === "csv"
            ? "Con CSV se descargarán 3 archivos."
            : "Con JSON se descargará 1 archivo.";
    }
}

function filtrarEquipos(equipos) {
    const excluir = document.getElementById("excluir-dados-baja")?.checked;
    if (!excluir) return equipos;
    return equipos.filter((equipo) => String(equipo?.estado || "").trim().toLowerCase() !== "dado de baja");
}

function actualizarContador(nombre, valor) {
    const elementos = document.querySelectorAll(`[data-contador="${nombre}"]`);
    elementos.forEach((elemento) => {
        elemento.textContent = formatearNumero(valor);
    });
}

async function cargarEquipos() {
    if (cacheExportacion.equipos) return cacheExportacion.equipos;

    const equipos = [];
    let total = Infinity;

    for (let pagina = 0; pagina < MAX_PAGINAS_EXPORTACION; pagina++) {
        const datos = await API.peticion(
            `/equipos/?skip=${pagina * TAMANO_PAGINA_EXPORTACION}&limit=${TAMANO_PAGINA_EXPORTACION}`,
            { method: "GET" }
        );
        const items = Array.isArray(datos?.items) ? datos.items : [];
        equipos.push(...items);

        if (Number.isFinite(Number(datos?.total))) total = Number(datos.total);
        if (items.length < TAMANO_PAGINA_EXPORTACION || equipos.length >= total) break;
    }

    cacheExportacion.equipos = equipos;
    mapaEquiposExportacion = new Map(equipos.map((equipo) => [Number(equipo.id), equipo]));
    return equipos;
}

async function cargarMantenimientos() {
    if (cacheExportacion.mantenimientos) return cacheExportacion.mantenimientos;

    const mantenimientos = [];

    for (let pagina = 0; pagina < MAX_PAGINAS_EXPORTACION; pagina++) {
        const datos = await API.peticion(
            `/mantenimientos/?skip=${pagina * TAMANO_PAGINA_EXPORTACION}&limit=${TAMANO_PAGINA_EXPORTACION}`,
            { method: "GET" }
        );
        const items = Array.isArray(datos) ? datos : (Array.isArray(datos?.items) ? datos.items : []);
        mantenimientos.push(...items);
        if (items.length < TAMANO_PAGINA_EXPORTACION) break;
    }

    cacheExportacion.mantenimientos = mantenimientos;
    return mantenimientos;
}

async function cargarProgramaciones() {
    if (cacheExportacion.programaciones) return cacheExportacion.programaciones;

    const programaciones = [];
    let total = Infinity;

    for (let pagina = 1; pagina <= MAX_PAGINAS_EXPORTACION; pagina++) {
        const datos = await API.peticion(
            `/programaciones/?page=${pagina}&size=${TAMANO_PAGINA_EXPORTACION}`,
            { method: "GET" }
        );
        const items = Array.isArray(datos?.items) ? datos.items : [];
        programaciones.push(...items);

        if (Number.isFinite(Number(datos?.total))) total = Number(datos.total);
        if (items.length < TAMANO_PAGINA_EXPORTACION || programaciones.length >= total) break;
    }

    cacheExportacion.programaciones = programaciones;
    return programaciones;
}

async function cargarContadores() {
    const solicitudes = [
        {
            nombre: "equipos",
            peticion: API.peticion("/equipos/?skip=0&limit=1", { method: "GET" }),
            extraer: (datos) => datos?.total
        },
        {
            nombre: "mantenimientos",
            peticion: API.peticion("/mantenimientos/estadisticas/resumen", { method: "GET" }),
            extraer: (datos) => datos?.total_mantenimientos
        },
        {
            nombre: "programaciones",
            peticion: API.peticion("/programaciones/?page=1&size=1", { method: "GET" }),
            extraer: (datos) => datos?.total
        }
    ];

    const resultados = await Promise.allSettled(solicitudes.map((solicitud) => solicitud.peticion));

    resultados.forEach((resultado, indice) => {
        if (resultado.status !== "fulfilled") {
            document.querySelectorAll(`[data-contador="${solicitudes[indice].nombre}"]`).forEach((elemento) => {
                elemento.textContent = "No disponible";
            });
            return;
        }
        actualizarContador(solicitudes[indice].nombre, solicitudes[indice].extraer(resultado.value));
    });
}

function escaparCsv(valor) {
    if (valor === null || valor === undefined) return '""';
    const texto = typeof valor === "object" ? JSON.stringify(valor) : String(valor);
    return `"${texto.replace(/"/g, '""')}"`;
}

function construirCsv(columnas, filas) {
    const encabezado = columnas.map(([nombre]) => escaparCsv(nombre)).join(";");
    const lineas = filas.map((fila) => {
        return columnas.map(([, obtener]) => escaparCsv(obtener(fila))).join(";");
    });
    return `\ufeff${[encabezado, ...lineas].join("\r\n")}\r\n`;
}

function fechaParaArchivo() {
    const ahora = new Date();
    const dosDigitos = (valor) => String(valor).padStart(2, "0");
    return `${ahora.getFullYear()}-${dosDigitos(ahora.getMonth() + 1)}-${dosDigitos(ahora.getDate())}`;
}

function nombreArchivo(base, extension) {
    return `airesflow_${base}_${fechaParaArchivo()}.${extension}`;
}

function descargarArchivo(contenido, nombre, tipoMime) {
    const blob = new Blob([contenido], { type: tipoMime });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function esperar(milisegundos) {
    return new Promise((resolve) => setTimeout(resolve, milisegundos));
}

function obtenerColumnas(nombre) {
    if (nombre === "equipos") return COLUMNAS_EQUIPOS;
    if (nombre === "mantenimientos") return COLUMNAS_MANTENIMIENTOS;
    return COLUMNAS_PROGRAMACIONES;
}

async function obtenerFilas(nombre) {
    if (nombre === "equipos") {
        return filtrarEquipos(await cargarEquipos());
    }
    if (nombre === "mantenimientos") {
        const [, mantenimientos] = await Promise.all([cargarEquipos(), cargarMantenimientos()]);
        return mantenimientos;
    }
    return cargarProgramaciones();
}

async function exportarConjunto(nombre, boton) {
    const formato = obtenerFormato();
    establecerCargando(true, boton);
    mostrarEstado(`Preparando exportación de ${nombre}…`);

    try {
        const filas = await obtenerFilas(nombre);
        const columnas = obtenerColumnas(nombre);
        const archivo = nombreArchivo(nombre, formato);

        if (formato === "json") {
            descargarArchivo(JSON.stringify(filas, null, 2), archivo, TIPO_JSON);
        } else {
            descargarArchivo(construirCsv(columnas, filas), archivo, TIPO_CSV);
        }

        mostrarEstado(`Descarga iniciada: ${archivo}.`, "exito");
    } catch (error) {
        mostrarEstado(`No se pudo exportar: ${error?.message || error}. Revisa la conexión e inténtalo de nuevo.`, "error");
    } finally {
        establecerCargando(false);
    }
}

async function exportarTodo(boton) {
    const formato = obtenerFormato();
    establecerCargando(true, boton);
    mostrarEstado("Preparando exportación completa…");

    try {
        const [equipos, mantenimientos, programaciones] = await Promise.all([
            cargarEquipos(),
            cargarMantenimientos(),
            cargarProgramaciones()
        ]);

        const equiposFiltrados = filtrarEquipos(equipos);

        if (formato === "json") {
            const archivo = nombreArchivo("exportacion_completa", "json");
            const contenido = {
                exportado_en: new Date().toISOString(),
                equipos: equiposFiltrados,
                mantenimientos,
                programaciones
            };
            descargarArchivo(JSON.stringify(contenido, null, 2), archivo, TIPO_JSON);
            mostrarEstado(`Descarga iniciada: ${archivo}.`, "exito");
            return;
        }

        mostrarEstado("Se descargarán 3 archivos CSV.");

        const conjuntos = [
            { nombre: "equipos", filas: equiposFiltrados },
            { nombre: "mantenimientos", filas: mantenimientos },
            { nombre: "programaciones", filas: programaciones }
        ];

        for (const conjunto of conjuntos) {
            const archivo = nombreArchivo(conjunto.nombre, "csv");
            descargarArchivo(construirCsv(obtenerColumnas(conjunto.nombre), conjunto.filas), archivo, TIPO_CSV);
            await esperar(400);
        }

        mostrarEstado("Descarga iniciada: 3 archivos CSV.", "exito");
    } catch (error) {
        mostrarEstado(`No se pudo exportar: ${error?.message || error}. Revisa la conexión e inténtalo de nuevo.`, "error");
    } finally {
        establecerCargando(false);
    }
}

function inicializarExportacion() {
    document.querySelectorAll("[data-export]").forEach((boton) => {
        boton.addEventListener("click", () => exportarConjunto(boton.dataset.export, boton));
    });

    const botonExportarTodo = document.getElementById("btn-exportar-todo");
    botonExportarTodo?.addEventListener("click", () => exportarTodo(botonExportarTodo));

    document.querySelectorAll('input[name="formato-exportacion"]').forEach((input) => {
        input.addEventListener("change", actualizarEstiloFormato);
    });

    actualizarEstiloFormato();
    cargarContadores();
}

document.addEventListener("DOMContentLoaded", inicializarExportacion);
