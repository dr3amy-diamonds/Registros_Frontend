// ========================================
// Cargador Dinámico del Inventario de Equipos
// ========================================

const API_BASE_URL = "http://127.0.0.1:8000/api/v1";

let paginaActual = 1;
const espaciosPorPagina = 24;
let equiposCompletosGlobal = []; // Catálogo completo de equipos sin filtrar
let equiposPorEspacioGlobal = new Map(); // espacioId (string) -> equipos[]
let espaciosVisiblesGlobal = []; // Espacios que cumplen los filtros activos
let espacioSeleccionadoId = null; // Espacio abierto en el nivel 2 inline
let espaciosCatalogGlobal = [];
let bloquesCatalogGlobal = [];
let temporizadorBusqueda = null;
let modoEdicionEquipo = false;
let equipoEnEdicionId = null;

const PISO_MIN = 1;
const PISO_MAX = 7;

function esRolTecnico() {
    const rol = (localStorage.getItem("rol") || localStorage.getItem("userRole") || "")
        .normalize("NFD")
        .replaceAll(/\p{Diacritic}/gu, "")
        .trim()
        .toLowerCase();
    return rol === "tecnico";
}

function aplicarRestriccionesRol() {
    if (!esRolTecnico()) return;
    document.querySelectorAll("[data-solo-gestion]").forEach((elemento) => {
        elemento.classList.add("hidden");
    });
}

async function obtenerTodosLosEspacios() {
    const espacios = [];
    const limit = 100;
    let skip = 0;
    let total = Infinity;

    while (skip < total) {
        const response = await fetch(`${API_BASE_URL}/espacios/?skip=${skip}&limit=${limit}`);
        if (!response.ok) throw new Error(`Error HTTP ${response.status} al cargar espacios`);
        const data = await response.json();
        const items = Array.isArray(data) ? data : (data.items || []);
        total = Array.isArray(data) ? items.length : Number(data.total || items.length);
        espacios.push(...items);
        if (!items.length) break;
        skip += limit;
    }

    return espacios;
}

function primerDigito(texto) {
    if (texto == null) return null;
    const m = String(texto).match(/\d/);
    return m ? parseInt(m[0], 10) : null;
}

function validarEspacioLocal(nombre, codigo, piso) {
    const p = Number(piso);
    if (!Number.isInteger(p) || p < PISO_MIN || p > PISO_MAX) {
        return `Piso debe estar entre ${PISO_MIN} y ${PISO_MAX}`;
    }
    for (const etiqueta of [nombre, codigo]) {
        const d = primerDigito(etiqueta);
        if (d !== null && d !== p) {
            return `Incoherencia aula/piso: '${etiqueta}' inicia en ${d} pero piso=${p}`;
        }
    }
    return null;
}

// ========================================
// FUNCIONES DE LECTURA Y CARGA
// ========================================

/**
 * Carga todas las tablas maestras necesarias para poblar selectores en formularios
 * Realiza peticiones concurrentes a: marcas, bloques, espacios y tipos de equipo
 */
async function cargarSelectoresFormularios() {
    console.log("📋 Cargando datos maestros para selectores...");

    const cargarMarcas = async () => {
        try {
            const respuesta = await fetch(`${API_BASE_URL}/marcas/`);
            if (!respuesta.ok) throw new Error(`Error HTTP ${respuesta.status}`);
            const marcas = await respuesta.json();
            const select = document.getElementById("select-marca");
            if (select) {
                select.innerHTML = '<option value="">Selecciona una marca</option>';
                marcas.forEach((marca) => {
                    const option = document.createElement("option");
                    option.value = marca.id;
                    option.textContent = marca.nombre;
                    select.appendChild(option);
                });
            }
        } catch (err) {
            console.error("❌ Error al cargar marcas:", err);
            const select = document.getElementById("select-marca");
            if (select) select.innerHTML = '<option value="">Error al cargar marcas</option>';
        }
    };

    const cargarEspacios = async () => {
        try {
            const espacios = await obtenerTodosLosEspacios();
            const select = document.getElementById("select-espacio-equipo");
            if (select) {
                select.innerHTML = '<option value="">Selecciona un espacio</option>';
                espacios.forEach((espacio) => {
                    const option = document.createElement("option");
                    option.value = espacio.id;
                    option.textContent = `${espacio.nombre} (Piso ${espacio.piso ?? "N/A"})`;
                    select.appendChild(option);
                });
            }
        } catch (err) {
            console.error("❌ Error al cargar espacios:", err);
            const select = document.getElementById("select-espacio-equipo");
            if (select) select.innerHTML = '<option value="">Error al cargar espacios</option>';
        }
    };

    const cargarBloques = async () => {
        try {
            const respuesta = await fetch(`${API_BASE_URL}/bloques/`);
            if (!respuesta.ok) throw new Error(`Error HTTP ${respuesta.status}`);
            const data = await respuesta.json();
            const bloques = Array.isArray(data) ? data : (data.items || []);
            const select = document.getElementById("select-bloque-espacio");
            if (select) {
                select.innerHTML = '<option value="">Selecciona un bloque</option>';
                bloques.forEach((bloque) => {
                    const option = document.createElement("option");
                    option.value = bloque.id;
                    option.textContent = bloque.nombre_bloque;
                    select.appendChild(option);
                });
            }
        } catch (err) {
            console.error("❌ Error al cargar bloques:", err);
            const select = document.getElementById("select-bloque-espacio");
            if (select) select.innerHTML = '<option value="">Error al cargar bloques</option>';
        }
    };

    const cargarTiposEspacio = async () => {
        try {
            const respuesta = await fetch(`${API_BASE_URL}/tipos-espacios/`);
            if (!respuesta.ok) throw new Error(`Error HTTP ${respuesta.status}`);
            const tiposEspacio = await respuesta.json();
            const select = document.getElementById("select-tipo-espacio");
            if (select) {
                select.innerHTML = '<option value="">Selecciona tipo de espacio</option>';
                tiposEspacio.forEach((tipo) => {
                    const option = document.createElement("option");
                    option.value = tipo.id;
                    option.textContent = tipo.nombre;
                    select.appendChild(option);
                });
            }
        } catch (err) {
            console.error("❌ Error al cargar tipos de espacio:", err);
            const select = document.getElementById("select-tipo-espacio");
            if (select) select.innerHTML = '<option value="">Error al cargar tipos</option>';
        }
    };

    const cargarTiposEquipo = async () => {
        try {
            const respuesta = await fetch(`${API_BASE_URL}/tipos-equipo/`);
            if (!respuesta.ok) throw new Error(`Error HTTP ${respuesta.status}`);
            const data = await respuesta.json();
            const tiposEquipo = Array.isArray(data) ? data : (data.items || []);
            const select = document.getElementById("select-tipo-equipo");
            if (select) {
                select.innerHTML = '<option value="">Selecciona tipo de equipo</option>';
                tiposEquipo.forEach((tipo) => {
                    const option = document.createElement("option");
                    option.value = tipo.id;
                    option.textContent = tipo.nombre;
                    select.appendChild(option);
                });
            }
        } catch (err) {
            console.error("❌ Error al cargar tipos de equipo:", err);
            const select = document.getElementById("select-tipo-equipo");
            if (select) select.innerHTML = '<option value="">Error al cargar tipos</option>';
        }
    };

    const cargarRefrigerantes = async () => {
        try {
            const respuesta = await fetch(`${API_BASE_URL}/tipos-gas-refrigerante/`);
            if (!respuesta.ok) throw new Error(`Error HTTP ${respuesta.status}`);
            const data = await respuesta.json();
            const refrigerantes = Array.isArray(data) ? data : (data.items || []);
            const select = document.getElementById("selectRefrigerante");
            if (select) {
                select.innerHTML = '<option value="">Selecciona un refrigerante</option>';
                refrigerantes.forEach((ref) => {
                    const option = document.createElement("option");
                    option.value = ref.nombre;
                    option.textContent = ref.nombre;
                    select.appendChild(option);
                });
            }
        } catch (err) {
            console.error("❌ Error al cargar refrigerantes:", err);
            const select = document.getElementById("selectRefrigerante");
            if (select) select.innerHTML = '<option value="">Error al cargar refrigerantes</option>';
        }
    };

    await Promise.all([
        cargarMarcas(),
        cargarEspacios(),
        cargarBloques(),
        cargarTiposEspacio(),
        cargarTiposEquipo(),
        cargarRefrigerantes(),
    ]);
}

/**
 * Obtiene el catálogo completo de equipos recorriendo la paginación del backend.
 * @returns {Promise<Array>} Lista completa de equipos
 */
async function obtenerTodosLosEquipos() {
    const equipos = [];
    const limit = 100;
    let skip = 0;
    let total = Infinity;

    while (skip < total) {
        const respuesta = await fetch(`${API_BASE_URL}/equipos/?skip=${skip}&limit=${limit}`);
        if (!respuesta.ok) {
            throw new Error(`Error HTTP ${respuesta.status}: ${respuesta.statusText}`);
        }
        const data = await respuesta.json();
        const items = Array.isArray(data) ? data : (data.items || []);
        total = Array.isArray(data) ? items.length : Number(data.total ?? items.length);
        equipos.push(...items);
        if (!items.length) break;
        skip += limit;
    }

    return equipos;
}

/**
 * Carga el catálogo de espacios y de equipos desde el backend
 * y renderiza la matriz de espacios del inventario.
 */
async function cargarInventarioCompleto() {
    const grid = document.getElementById("gridEspacios");

    if (!grid) {
        console.error("❌ No se encontró el elemento con id='gridEspacios'");
        return;
    }

    renderizarCargaInventario(grid);

    try {
        const [espacios, equipos] = await Promise.all([
            obtenerTodosLosEspacios(),
            obtenerTodosLosEquipos(),
        ]);

        espaciosCatalogGlobal = espacios;
        equiposCompletosGlobal = equipos;
        equiposPorEspacioGlobal = agruparEquiposPorEspacio(equipos);
        espacioSeleccionadoId = null;
        paginaActual = 1;

        console.log(`✅ Cargados ${espacios.length} espacios y ${equipos.length} equipos`);
        aplicarFiltrosInventario();
    } catch (error) {
        console.error("❌ Error al cargar el inventario:", error);
        renderizarErrorInventario(grid, error);
    }
}

/**
 * Dibuja los doce bloques grises del estado de carga.
 * @param {HTMLElement} grid
 */
function renderizarCargaInventario(grid) {
    grid.innerHTML = Array.from(
        { length: 12 },
        () => '<div class="h-[104px] rounded-xl bg-slate-100 animate-pulse motion-reduce:animate-none"></div>',
    ).join("");
    const resumen = document.getElementById("texto-paginacion-equipos");
    if (resumen) resumen.textContent = "Cargando espacios…";
    actualizarBotonesPaginacion(0);
}

/**
 * Dibuja el bloque de error de red con opción de reintento.
 * @param {HTMLElement} grid
 * @param {Error} error
 */
function renderizarErrorInventario(grid, error) {
    grid.innerHTML = `
        <div class="col-span-full bg-red-50 border border-red-200 rounded-md p-4">
            <p class="text-sm font-semibold text-red-700">
                <i class="fas fa-exclamation-circle mr-2" aria-hidden="true"></i>Error al conectar con el servidor
            </p>
            <p class="text-xs text-red-600 mt-1">${escaparHtmlInline(error.message)}</p>
            <p class="text-xs text-red-500 mt-1">Verifica que el backend esté corriendo en ${escaparHtmlInline(API_BASE_URL)}</p>
            <button type="button" onclick="cargarInventarioCompleto()" class="mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-semibold transition">
                <i class="fas fa-redo mr-1" aria-hidden="true"></i>Reintentar
            </button>
        </div>
    `;
    const resumen = document.getElementById("texto-paginacion-equipos");
    if (resumen) resumen.textContent = "No se pudo cargar el inventario";
    actualizarBotonesPaginacion(0);
}


function obtenerEspacioEquipo(equipo) {
    return equipo && equipo.espacio && typeof equipo.espacio === "object" ? equipo.espacio : null;
}

function obtenerEspacioIdEquipo(equipo) {
    const espacio = obtenerEspacioEquipo(equipo);
    if (espacio && espacio.id != null && espacio.id !== "") return espacio.id;
    return equipo.espacio_id != null && equipo.espacio_id !== "" ? equipo.espacio_id : null;
}

function obtenerBloqueIdEquipo(equipo) {
    const espacio = obtenerEspacioEquipo(equipo);
    if (espacio) {
        if (espacio.bloque_id != null && espacio.bloque_id !== "") return espacio.bloque_id;
        if (espacio.bloque && typeof espacio.bloque === "object" && espacio.bloque.id != null) {
            return espacio.bloque.id;
        }
    }
    if (equipo.bloque_id != null && equipo.bloque_id !== "") return equipo.bloque_id;
    return null;
}

/**
 * Devuelve el espacio del catálogo por su identificador.
 * @param {string|number} espacioId
 * @returns {Object|null}
 */
function obtenerEspacioPorId(espacioId) {
    if (espacioId == null) return null;
    return espaciosCatalogGlobal.find((espacio) => String(espacio.id) === String(espacioId)) || null;
}

/**
 * Agrupa los equipos por espacio sobre el catálogo completo.
 * @param {Array} equipos
 * @returns {Map<string, Array>}
 */
function agruparEquiposPorEspacio(equipos) {
    const agrupados = new Map();
    (equipos || []).forEach((equipo) => {
        const espacioId = obtenerEspacioIdEquipo(equipo);
        if (espacioId == null) return;
        const clave = String(espacioId);
        if (!agrupados.has(clave)) agrupados.set(clave, []);
        agrupados.get(clave).push(equipo);
    });
    return agrupados;
}

/**
 * Equipos asignados a un espacio, ordenados por código de activo.
 * @param {string|number} espacioId
 * @returns {Array}
 */
function obtenerEquiposDelEspacio(espacioId) {
    if (espacioId == null) return [];
    return ordenarEquiposPorCodigo(equiposPorEspacioGlobal.get(String(espacioId)) || []);
}

/**
 * Normaliza texto para comparación: sin mayúsculas, sin diacríticos y con trim.
 * @param {*} valor
 * @returns {string}
 */
function normalizarTexto(valor) {
    return String(valor ?? "")
        .normalize("NFD")
        .replaceAll(/\p{Diacritic}/gu, "")
        .trim()
        .toLowerCase();
}

function obtenerConfigEstadoEquipo(estado) {
    const normalizado = normalizarEstadoEquipo(estado);
    const configuracion = {
        "Operativo": { texto: "Operativo", dot: "bg-emerald-500" },
        "En reparacion": { texto: "En reparación", dot: "bg-amber-500" },
        "Inactivo": { texto: "Inactivo", dot: "bg-slate-400" },
        "Dado de baja": { texto: "Dado de baja", dot: "bg-rose-500" },
    };
    return configuracion[normalizado] || {
        texto: normalizado || "Sin estado",
        dot: "bg-slate-400",
    };
}

/**
 * Crea la tarjeta de un espacio (nivel 1) dentro de la matriz del inventario.
 * Reglas: 1 equipo muestra dot + estado; 2+ equipos muestran solo el total;
 * sin equipos muestra "Sin equipos".
 * @param {Object} espacio
 * @returns {HTMLButtonElement}
 */
function crearTarjetaEspacio(espacio) {
    const equipos = obtenerEquiposDelEspacio(espacio.id);
    const total = equipos.length;
    const piso = obtenerPisoEspacio(espacio);
    const bloqueId = espacio.bloque_id != null
        ? espacio.bloque_id
        : (espacio.bloque && espacio.bloque.id != null ? espacio.bloque.id : null);
    const nombre = espacio.nombre ? String(espacio.nombre) : "Espacio sin nombre";
    const codigo = espacio.codigo_espacio != null && espacio.codigo_espacio !== ""
        ? String(espacio.codigo_espacio)
        : "Sin código";
    const tipo = espacio.tipo_espacio && espacio.tipo_espacio.nombre
        ? String(espacio.tipo_espacio.nombre)
        : "";
    const etiquetaPiso = piso == null ? "SIN PISO" : `PISO ${piso}`;
    const estadoUnico = total === 1 ? obtenerConfigEstadoEquipo(equipos[0].estado) : null;

    const tarjeta = document.createElement("button");
    tarjeta.type = "button";
    tarjeta.className = `group w-full text-left rounded-xl border p-3 min-h-[104px] flex flex-col gap-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-uccTeal focus-visible:ring-offset-2 ${
        total === 0
            ? "bg-slate-50/70 border-dashed border-slate-300 hover:border-uccTeal hover:bg-white"
            : "bg-white border-slate-200 hover:border-uccTeal hover:shadow-sm"
    }`;

    tarjeta.setAttribute("data-espacio-id", espacio.id);
    tarjeta.setAttribute("data-codigo-espacio", codigo);
    tarjeta.setAttribute("data-piso", piso == null ? "" : String(piso));
    tarjeta.setAttribute("data-bloque-id", bloqueId == null ? "" : String(bloqueId));
    tarjeta.setAttribute("data-total-equipos", String(total));

    const ariaTotal = total === 0
        ? "sin equipos"
        : total === 1
            ? `1 equipo, ${estadoUnico.texto}`
            : `${total} equipos`;
    tarjeta.setAttribute("aria-label", `Ver equipos de ${nombre}, ${ariaTotal}`);
    tarjeta.title = `${nombre} · ${codigo} · ${ariaTotal}`;

    let pie;
    if (total === 0) {
        pie = `
            <span class="h-1.5 w-1.5 rounded-full bg-slate-300 shrink-0" aria-hidden="true"></span>
            <span class="text-[11px] font-medium text-slate-400 truncate">Sin equipos</span>
        `;
    } else if (total === 1) {
        pie = `
            <span class="h-2 w-2 rounded-full shrink-0 ${estadoUnico.dot}" aria-hidden="true"></span>
            <span class="text-[11px] font-semibold text-slate-600 truncate">${escaparHtmlInline(estadoUnico.texto)}</span>
        `;
    } else {
        pie = `
            <i class="fas fa-snowflake text-[11px] text-uccTeal shrink-0" aria-hidden="true"></i>
            <span class="text-[11px] font-bold text-slate-700 truncate">${total} Equipos</span>
        `;
    }

    tarjeta.innerHTML = `
        <span class="flex items-center justify-between gap-2 min-w-0">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate min-w-0">${escaparHtmlInline(etiquetaPiso)}</span>
            ${tipo ? `<span class="text-[9px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 shrink-0 max-w-[55%] truncate">${escaparHtmlInline(tipo)}</span>` : ""}
        </span>
        <span class="block min-w-0">
            <span class="block text-[13px] font-bold uppercase leading-tight text-slate-800 truncate">${escaparHtmlInline(nombre)}</span>
            <span class="block text-[11px] leading-tight text-slate-500 font-mono truncate">${escaparHtmlInline(codigo)}</span>
        </span>
        <span class="mt-auto pt-2 border-t border-slate-100 flex items-center gap-1.5 min-w-0">
            ${pie}
            <i class="fas fa-chevron-right ml-auto text-[9px] text-slate-300 group-hover:text-uccTeal transition-colors shrink-0" aria-hidden="true"></i>
        </span>
    `;

    tarjeta.addEventListener("click", () => abrirEspacioInline(espacio.id));
    return tarjeta;
}

/**
 * Crea la tarjeta de un equipo (nivel 2) con Código ID, Tipo, Serie y Estado.
 * @param {Object} equipo
 * @returns {HTMLButtonElement}
 */
function crearTarjetaEquipoEspacio(equipo) {
    const estado = obtenerConfigEstadoEquipo(equipo.estado);
    const codigoActivo = equipo.codigo_activo != null && equipo.codigo_activo !== ""
        ? String(equipo.codigo_activo)
        : "Sin código";
    const tipoEquipo = obtenerNombreTipoEquipo(equipo);
    const serie = equipo.numero_serie != null && equipo.numero_serie !== ""
        ? String(equipo.numero_serie)
        : "Sin serie";

    const tarjeta = document.createElement("button");
    tarjeta.type = "button";
    tarjeta.className = "group w-full text-left bg-white border border-slate-200 rounded-xl p-3.5 min-h-[132px] flex flex-col gap-2.5 hover:border-uccTeal hover:shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-uccTeal focus-visible:ring-offset-2";
    tarjeta.setAttribute("data-equipo-id", equipo.id);
    tarjeta.setAttribute("data-codigo-activo", codigoActivo);
    tarjeta.setAttribute("data-espacio-id", String(obtenerEspacioIdEquipo(equipo) ?? ""));
    tarjeta.setAttribute("data-estado", normalizarEstadoEquipo(equipo.estado));
    tarjeta.setAttribute("aria-label", `Abrir ficha técnica del activo ${codigoActivo}, ${estado.texto}`);
    tarjeta.title = `${codigoActivo} · ${tipoEquipo} · ${serie}`;

    tarjeta.innerHTML = `
        <span class="flex items-start justify-between gap-2 min-w-0">
            <span class="min-w-0">
                <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Código ID</span>
                <span class="block text-[15px] font-extrabold font-mono text-uccDark leading-tight break-all">${escaparHtmlInline(codigoActivo)}</span>
            </span>
            <span class="h-2 w-2 mt-1 rounded-full shrink-0 ${estado.dot}" aria-hidden="true"></span>
        </span>
        <span class="block space-y-1 text-[11px]">
            <span class="flex items-baseline justify-between gap-2 min-w-0">
                <span class="text-[9px] font-bold uppercase tracking-wide text-slate-400 shrink-0">Tipo</span>
                <span class="font-semibold text-slate-700 truncate">${escaparHtmlInline(tipoEquipo)}</span>
            </span>
            <span class="flex items-baseline justify-between gap-2 min-w-0">
                <span class="text-[9px] font-bold uppercase tracking-wide text-slate-400 shrink-0">Serie</span>
                <span class="font-mono text-slate-700 truncate">${escaparHtmlInline(serie)}</span>
            </span>
        </span>
        <span class="mt-auto pt-2 border-t border-slate-100 flex items-center gap-1.5 min-w-0">
            <span class="h-1.5 w-1.5 rounded-full shrink-0 ${estado.dot}" aria-hidden="true"></span>
            <span class="text-[11px] font-semibold text-slate-600 truncate">${escaparHtmlInline(estado.texto)}</span>
            <i class="fas fa-chevron-right ml-auto text-[9px] text-slate-300 group-hover:text-uccTeal transition-colors shrink-0" aria-hidden="true"></i>
        </span>
    `;

    tarjeta.addEventListener("click", () => mostrarDetalleInline(equipo.id));
    return tarjeta;
}

/**
 * Piso numérico de un espacio, o null si no está definido.
 * @param {Object} espacio
 * @returns {number|string|null}
 */
function obtenerPisoEspacio(espacio) {
    const piso = espacio ? espacio.piso : null;
    if (piso == null || piso === "") return null;
    const num = Number(piso);
    return Number.isNaN(num) ? String(piso) : num;
}

/**
 * Ordena espacios por piso y luego por nombre.
 * @param {Array} espacios
 * @returns {Array}
 */
function ordenarEspaciosPorPiso(espacios) {
    return [...espacios].sort((a, b) => {
        const pa = obtenerPisoEspacio(a);
        const pb = obtenerPisoEspacio(b);
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1;
        if (pb == null) return -1;
        if (pa !== pb) return pa > pb ? 1 : -1;
        return String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { numeric: true });
    });
}

/**
 * Ordena equipos por código de activo.
 * @param {Array} equipos
 * @returns {Array}
 */
function ordenarEquiposPorCodigo(equipos) {
    return [...(equipos || [])].sort((a, b) => String(a.codigo_activo || "")
        .localeCompare(String(b.codigo_activo || ""), "es", { numeric: true }));
}

/**
 * Crea el separador de piso de ancho completo dentro de la matriz.
 * @param {number|string|null} piso
 * @returns {HTMLDivElement}
 */
function crearSeparadorPiso(piso) {
    const separador = document.createElement("div");
    separador.className = "col-span-full sticky top-0 z-10 flex items-center gap-2 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200 py-1";
    separador.setAttribute("role", "heading");
    separador.setAttribute("aria-level", "2");
    const etiqueta = piso == null ? "SIN PISO" : `PISO ${piso}`;
    separador.innerHTML = `
        <span class="text-[10px] font-bold uppercase tracking-widest text-slate-500">${escaparHtmlInline(etiqueta)}</span>
        <span class="h-px flex-1 bg-slate-200" aria-hidden="true"></span>
    `;
    return separador;
}

/**
 * Extrae el nombre del tipo de equipo desde la respuesta de la API
 * @param {Object} equipo
 * @returns {string}
 */
function obtenerNombreTipoEquipo(equipo) {
    if (equipo.tipo && typeof equipo.tipo === "object" && equipo.tipo.nombre) {
        return equipo.tipo.nombre;
    }
    if (equipo.tipo_equipo && typeof equipo.tipo_equipo === "object" && equipo.tipo_equipo.nombre) {
        return equipo.tipo_equipo.nombre;
    }
    if (typeof equipo.tipo === "string") return equipo.tipo;
    if (typeof equipo.tipo_equipo === "string") return equipo.tipo_equipo;
    return "No especificado";
}

/**
 * Obtiene el badge HTML de estado coloreado según el estado del equipo
 * @param {string} estado - Estado del equipo
 * @returns {string} HTML del badge
 */
function obtenerBadgeEstado(estado) {
    const estadosConfig = {
        "Operativo": { clase: "status-pill status-success", icono: "fas fa-check", texto: "Operativo" },
        "En reparacion": { clase: "status-pill status-warning", icono: "fas fa-tools", texto: "En reparación" },
        "Inactivo": { clase: "status-pill status-neutral", icono: "fas fa-pause", texto: "Inactivo" },
        "Dado de baja": { clase: "status-pill status-danger", icono: "fas fa-ban", texto: "Dado de baja" }
    };

    const config = estadosConfig[estado] || {
        clase: "status-pill status-neutral",
        icono: "fas fa-question",
        texto: estado || "Desconocido"
    };

    return `
        <span class="${config.clase}">
            <i class="${config.icono}" aria-hidden="true"></i> ${config.texto}
        </span>
    `;
}

function equipoEstaInactivo(estado) {
    const est = String(estado || "").trim().toLowerCase();
    return est === "inactivo" || est === "dado de baja";
}

/**
 * Devuelve la única acción válida según el estado del equipo:
 * Inactivo/Dado de baja -> Activar; cualquier otro estado -> Dar de Baja.
 */
function obtenerAccionEstadoEquipoHtml(estado) {
    if (equipoEstaInactivo(estado)) {
        return '<button type="button" data-solo-gestion onclick="activateTechnicalSheet()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition"><i class="fas fa-play"></i> Activar Equipo</button>';
    }
    return '<button type="button" data-solo-gestion onclick="decommissionTechnicalSheet()" class="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition"><i class="fas fa-power-off"></i> Dar de Baja</button>';
}

/**
 * Refleja el nuevo estado en las vistas ya cargadas sin recargar el inventario.
 */
function aplicarEstadoLocalEquipo(equipoId, nuevoEstado) {
    const id = String(equipoId);
    equiposCompletosGlobal.forEach((equipo) => {
        if (String(equipo.id) === id) equipo.estado = nuevoEstado;
    });
    equiposPorEspacioGlobal = agruparEquiposPorEspacio(equiposCompletosGlobal);

    renderizarEspaciosPaginado();

    if (espacioSeleccionadoId) {
        const espacio = obtenerEspacioPorId(espacioSeleccionadoId);
        if (espacio) {
            actualizarCabeceraEspacio(espacio);
            renderizarEquiposEspacio(espacio);
        }
    }

    const pillInline = document.getElementById("dInlineStatusPill");
    if (pillInline) pillInline.innerHTML = obtenerBadgeEstado(nuevoEstado);

    const accionInline = document.getElementById("dInlineEstadoAccion");
    if (accionInline) accionInline.innerHTML = obtenerAccionEstadoEquipoHtml(nuevoEstado);

    const pillModal = document.getElementById("technicalSheetStatusPill");
    if (pillModal) pillModal.innerHTML = obtenerBadgeEstado(nuevoEstado);

    const accionModal = document.getElementById("modalEstadoAccion");
    if (accionModal) accionModal.innerHTML = obtenerAccionEstadoEquipoHtml(nuevoEstado);

    aplicarRestriccionesRol();
}

function normalizarEstadoEquipo(estado) {
    if (!estado) return "";
    const clave = normalizarTexto(estado);
    const mapa = {
        "operativo": "Operativo",
        "en reparacion": "En reparacion",
        "inactivo": "Inactivo",
        "dado de baja": "Dado de baja",
    };
    return mapa[clave] || estado;
}

/**
 * Renderiza la matriz de espacios (nivel 1) con paginación local
 * de 24 espacios por página.
 */
function renderizarEspaciosPaginado() {
    const grid = document.getElementById("gridEspacios");
    if (!grid) return;

    const total = espaciosVisiblesGlobal.length;
    const totalPaginas = Math.max(1, Math.ceil(total / espaciosPorPagina));

    if (paginaActual > totalPaginas) paginaActual = totalPaginas;
    if (paginaActual < 1) paginaActual = 1;

    const inicio = (paginaActual - 1) * espaciosPorPagina;
    const fin = inicio + espaciosPorPagina;
    const espaciosPagina = espaciosVisiblesGlobal.slice(inicio, fin);

    grid.innerHTML = "";

    if (total === 0) {
        const hayFiltros = filtrosInventarioActivos();
        grid.innerHTML = `
            <div class="col-span-full py-16 text-center">
                <i class="fas fa-door-open text-slate-300 text-2xl" aria-hidden="true"></i>
                <p class="mt-2 text-sm text-slate-500">
                    ${hayFiltros
                        ? "No se encontraron espacios para el filtro seleccionado"
                        : "No hay espacios registrados en la base de datos"}
                </p>
            </div>
        `;
        actualizarTextoPaginacion(0, 0, 0);
        actualizarBotonesPaginacion(0);
        reiniciarScrollInventario();
        return;
    }

    const espaciosOrdenados = ordenarEspaciosPorPiso(espaciosPagina);
    let pisoActual = Symbol("ninguno");
    espaciosOrdenados.forEach((espacio) => {
        const piso = obtenerPisoEspacio(espacio);
        const clave = piso == null ? "sin-piso" : `piso-${piso}`;
        if (clave !== pisoActual) {
            pisoActual = clave;
            grid.appendChild(crearSeparadorPiso(piso));
        }
        grid.appendChild(crearTarjetaEspacio(espacio));
    });

    actualizarTextoPaginacion(inicio, fin, total);
    actualizarBotonesPaginacion(totalPaginas);
    reiniciarScrollInventario();
}

/**
 * Muestra la matriz de espacios y oculta las vistas inline.
 */
function mostrarVistaEspacios() {
    const lista = document.getElementById("contenedor-inventario");
    const espacioVista = document.getElementById("vista-espacio-inline");
    const detalle = document.getElementById("vista-detalle-inline");

    if (detalle) {
        detalle.classList.add("hidden");
        detalle.classList.remove("flex");
    }
    if (espacioVista) {
        espacioVista.classList.add("hidden");
        espacioVista.classList.remove("flex");
    }
    if (lista) lista.classList.remove("hidden");
}

/**
 * Vuelve al nivel 1 conservando filtros y página.
 */
function volverAEspacios() {
    espacioSeleccionadoId = null;
    mostrarVistaEspacios();
    reiniciarScrollInventario();
    // Mostrar la barra de filtros al volver a la vista de espacios
    var panelFiltros = document.querySelector('.panel');
    if (panelFiltros) panelFiltros.classList.remove("hidden");
}

/**
 * Abre el nivel 2 inline con los equipos del espacio seleccionado.
 * @param {string|number} espacioId
 */
function abrirEspacioInline(espacioId) {
    const espacio = obtenerEspacioPorId(espacioId);
    if (!espacio) return;
    espacioSeleccionadoId = String(espacio.id);
    mostrarVistaEspacio(espacio);
}

/**
 * Activa la vista inline del espacio y dibuja su diagrama de equipos.
 * @param {Object} espacio
 */
function mostrarVistaEspacio(espacio) {
    const lista = document.getElementById("contenedor-inventario");
    const espacioVista = document.getElementById("vista-espacio-inline");
    const detalle = document.getElementById("vista-detalle-inline");

    if (!espacioVista) {
        console.error("❌ No se encontró el elemento con id='vista-espacio-inline'");
        return;
    }

    if (lista) lista.classList.add("hidden");
    if (detalle) {
        detalle.classList.add("hidden");
        detalle.classList.remove("flex");
    }
    espacioVista.classList.remove("hidden");
    espacioVista.classList.add("flex");

    actualizarCabeceraEspacio(espacio);
    renderizarEquiposEspacio(espacio);

    const scroller = document.getElementById("scroller-equipos-espacio");
    if (scroller) scroller.scrollTop = 0;

    const titulo = document.getElementById("espacioInlineNombre");
    if (titulo) {
        titulo.setAttribute("tabindex", "-1");
        titulo.focus({ preventScroll: true });
    }
}

/**
 * Rellena la cabecera del nivel 2 con los datos del espacio.
 * @param {Object} espacio
 */
function actualizarCabeceraEspacio(espacio) {
    const equipos = obtenerEquiposDelEspacio(espacio.id);
    const total = equipos.length;
    const piso = obtenerPisoEspacio(espacio);
    const bloque = espacio.bloque && espacio.bloque.nombre_bloque
        ? String(espacio.bloque.nombre_bloque)
        : "No especificado";
    const tipo = espacio.tipo_espacio && espacio.tipo_espacio.nombre
        ? String(espacio.tipo_espacio.nombre)
        : "No especificado";
    const codigo = espacio.codigo_espacio != null && espacio.codigo_espacio !== ""
        ? String(espacio.codigo_espacio)
        : "Sin código";

    const nombreEl = document.getElementById("espacioInlineNombre");
    if (nombreEl) nombreEl.textContent = espacio.nombre || "Espacio sin nombre";
    const codigoEl = document.getElementById("espacioInlineCodigo");
    if (codigoEl) codigoEl.textContent = `Código ${codigo}`;
    const pisoEl = document.getElementById("espacioInlinePiso");
    if (pisoEl) pisoEl.textContent = `Piso ${piso == null ? "N/A" : piso}`;
    const bloqueEl = document.getElementById("espacioInlineBloque");
    if (bloqueEl) bloqueEl.textContent = bloque;
    const tipoEl = document.getElementById("espacioInlineTipo");
    if (tipoEl) tipoEl.textContent = tipo;
    const conteoEl = document.getElementById("espacioInlineConteo");
    if (conteoEl) {
        conteoEl.textContent = total === 0
            ? "Sin equipos"
            : `${total} ${total === 1 ? "equipo" : "equipos"}`;
    }
}

/**
 * Dibuja el diagrama de cuadros del espacio (nivel 2).
 * @param {Object} espacio
 */
function renderizarEquiposEspacio(espacio) {
    const grid = document.getElementById("gridEquiposEspacio");
    if (!grid) return;

    const equipos = obtenerEquiposDelEspacio(espacio.id);
    grid.innerHTML = "";

    if (!equipos.length) {
        grid.innerHTML = `
            <div class="col-span-full py-12 text-center">
                <i class="fas fa-snowflake text-slate-300 text-2xl" aria-hidden="true"></i>
                <p class="mt-2 text-sm font-semibold text-slate-500">Sin equipos registrados en este espacio</p>
                <p class="mt-1 text-xs text-slate-400">Los equipos que se asignen a este espacio aparecerán aquí.</p>
            </div>
        `;
        return;
    }

    const fragmento = document.createDocumentFragment();
    equipos.forEach((equipo) => fragmento.appendChild(crearTarjetaEquipoEspacio(equipo)));
    grid.appendChild(fragmento);
}

/**
 * Devuelve el área desplazable de la matriz al inicio.
 */
function reiniciarScrollInventario() {
    const scroller = document.getElementById("scroller-inventario");
    if (scroller) scroller.scrollTop = 0;
}

/**
 * Indica si hay algún filtro activo.
 * @returns {boolean}
 */
function filtrosInventarioActivos() {
    const selectBloque = document.getElementById("assetBlockFilter");
    const selectPiso = document.getElementById("filterPiso");
    const inputBusqueda = document.getElementById("assetAulaFilter");
    return Boolean(
        (selectBloque && selectBloque.value)
        || (selectPiso && selectPiso.value)
        || (inputBusqueda && inputBusqueda.value.trim()),
    );
}

/**
 * Actualiza el texto inferior de paginación
 */
function actualizarTextoPaginacion(inicio, fin, total) {
    const paginacion = document.getElementById("texto-paginacion-equipos");
    if (!paginacion) return;

    if (total === 0) {
        paginacion.textContent = "Sin resultados";
        return;
    }

    paginacion.textContent = `Mostrando ${inicio + 1}–${Math.min(fin, total)} de ${total} espacios`;
}

/**
 * Habilita o deshabilita los botones Anterior / Siguiente
 */
function actualizarBotonesPaginacion(totalPaginas) {
    const btnAnterior = document.getElementById("btn-pagina-anterior");
    const btnSiguiente = document.getElementById("btn-pagina-siguiente");
    const indicador = document.getElementById("indicador-pagina-actual");

    const enPrimera = paginaActual <= 1 || totalPaginas === 0;
    const enUltima = paginaActual >= totalPaginas || totalPaginas === 0;

    if (btnAnterior) btnAnterior.disabled = enPrimera;
    if (btnSiguiente) btnSiguiente.disabled = enUltima;

    if (indicador) {
        indicador.textContent = totalPaginas === 0
            ? "—"
            : `Página ${paginaActual} de ${totalPaginas}`;
    }
}

function irPaginaAnterior() {
    if (paginaActual > 1) {
        paginaActual--;
        renderizarEspaciosPaginado();
    }
}

function irPaginaSiguiente() {
    const totalPaginas = Math.ceil(espaciosVisiblesGlobal.length / espaciosPorPagina) || 1;
    if (paginaActual < totalPaginas) {
        paginaActual++;
        renderizarEspaciosPaginado();
    }
}

// ========================================
// FUNCIONES DE MODAL (CREAR ACTIVO)
// ========================================

/**
 * Abre el modal para crear un nuevo activo/equipo
 */
function actualizarTituloModalActivo() {
    const titulo = document.getElementById("titulo-modal-activo");
    const textoBtn = document.getElementById("texto-btn-submit-activo");
    const grupoEspacio = document.getElementById("grupo-espacio-activo");
    if (titulo) {
        titulo.textContent = modoEdicionEquipo ? "Editar Equipo" : "Registrar Nuevo Equipo";
    }
    if (textoBtn) {
        textoBtn.textContent = modoEdicionEquipo ? "Guardar Cambios" : "Registrar Activo";
    }
    if (grupoEspacio) {
        grupoEspacio.classList.toggle("hidden", modoEdicionEquipo);
    }
}

function resetearModoFormularioActivo() {
    modoEdicionEquipo = false;
    equipoEnEdicionId = null;
    actualizarTituloModalActivo();
}

function openCrearActivoModal() {
    if (esRolTecnico()) {
        mostrarNotificacion("error", "El rol Técnico no puede crear ni modificar equipos.");
        return;
    }
    const modal = document.getElementById("modal-crear-activo");
    if (modal) {
        if (!modoEdicionEquipo) {
            resetearModoFormularioActivo();
        }
        actualizarTituloModalActivo();
        modal.classList.remove("hidden");
        console.log("✅ Modal de activo abierto");
    }
}

/**
 * Cierra el modal para crear un nuevo activo/equipo
 */
function closeCrearActivoModal() {
    const modal = document.getElementById("modal-crear-activo");
    if (modal) {
        modal.classList.add("hidden");
        const form = modal.querySelector("form");
        if (form) form.reset();
        resetearModoFormularioActivo();
    }
}

function normalizarFechaInput(valor) {
    if (valor === null || valor === undefined || valor === "") return "";
    if (typeof valor === "string") {
        const coincidencia = valor.match(/^\d{4}-\d{2}-\d{2}/);
        return coincidencia ? coincidencia[0] : "";
    }
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return "";
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const dia = String(fecha.getDate()).padStart(2, "0");
    return `${anio}-${mes}-${dia}`;
}

function asignarValorFormulario(id, valor) {
    const elemento = document.getElementById(id);
    if (!elemento) return;
    elemento.value = valor === null || valor === undefined ? "" : String(valor);
}

function seleccionarOpcionFormulario(id, valor, etiqueta) {
    const select = document.getElementById(id);
    if (!select) return;
    if (valor === null || valor === undefined || valor === "") {
        select.value = "";
        return;
    }
    const texto = String(valor);
    const existe = Array.from(select.options).some((option) => option.value === texto);
    if (!existe) {
        const option = document.createElement("option");
        option.value = texto;
        option.textContent = etiqueta || texto;
        select.appendChild(option);
    }
    select.value = texto;
}

/**
 * Pre-llena el formulario de activo con datos de un equipo existente.
 * @param {Object} equipo
 */
function rellenarFormularioEquipo(equipo) {
    const marcaId = equipo.marca_id ?? (equipo.marca && equipo.marca.id) ?? "";
    const tipoEquipoId = equipo.tipo_equipo_id ?? (equipo.tipo && equipo.tipo.id) ?? "";
    const espacioId = equipo.espacio_id ?? (equipo.espacio && equipo.espacio.id) ?? "";
    const capacidad = equipo.capacidad_btu ?? "";
    const tonelajeNumero = Number(equipo.tonelaje);
    const tonelaje = equipo.tonelaje === null || equipo.tonelaje === undefined || equipo.tonelaje === "" || !Number.isFinite(tonelajeNumero)
        ? ""
        : tonelajeNumero.toFixed(2);

    asignarValorFormulario("inputCodigoActivo", equipo.codigo_activo);
    asignarValorFormulario("input-modelo", equipo.modelo);
    asignarValorFormulario("inputNumeroSerie", equipo.numero_serie);
    asignarValorFormulario("inputVoltaje", equipo.voltaje);
    asignarValorFormulario("inputTonelaje", tonelaje);
    asignarValorFormulario("inputFechaCompra", normalizarFechaInput(equipo.fecha_compra));
    asignarValorFormulario("inputFechaInstalacion", normalizarFechaInput(equipo.fecha_instalacion));
    asignarValorFormulario("inputUltimaFecha", normalizarFechaInput(equipo.ultima_fecha));
    asignarValorFormulario("inputProximaFecha", normalizarFechaInput(equipo.proxima_fecha));

    seleccionarOpcionFormulario("select-marca", marcaId);
    seleccionarOpcionFormulario("select-tipo-equipo", tipoEquipoId);
    seleccionarOpcionFormulario("select-espacio-equipo", espacioId);
    const capacidadNumero = Number(capacidad);
    seleccionarOpcionFormulario(
        "selectCapacidad",
        capacidad,
        capacidad !== "" && Number.isFinite(capacidadNumero)
            ? `${capacidadNumero.toLocaleString("es-CO")} BTU`
            : String(capacidad || ""),
    );
    seleccionarOpcionFormulario("selectRefrigerante", equipo.refrigerante);
}

// ========================================
// FUNCIONES DE MODAL (CREAR ESPACIO)
// ========================================

/**
 * Abre el modal para crear un nuevo espacio/aula
 */
function openCrearEspacioModal() {
    const modal = document.getElementById("modal-crear-espacio");
    if (modal) {
        modal.classList.remove("hidden");
        console.log("✅ Modal de crear espacio abierto");
    }
}

/**
 * Cierra el modal para crear un nuevo espacio/aula
 */
function closeCrearEspacioModal() {
    const modal = document.getElementById("modal-crear-espacio");
    if (modal) {
        modal.classList.add("hidden");
        // Resetear formulario
        const form = document.getElementById("formCrearEspacio");
        if (form) form.reset();
    }
}

/**
 * Envía el formulario de crear nuevo espacio al backend
 * @param {Event} event - Evento del submit del formulario
 */
async function submitCrearEspacio(event) {
    event.preventDefault();

    try {
        const codigoEspacio = document.getElementById("inputCodigoEspacio").value;
        const nombre = document.getElementById("inputNombreEspacio").value;
        const piso = parseInt(document.getElementById("inputPisoEspacio").value);
        const bloqueId = document.getElementById("select-bloque-espacio").value;
        const tipoEspacioId = document.getElementById("select-tipo-espacio").value;

        if (!codigoEspacio || !nombre || piso === "" || !bloqueId || !tipoEspacioId) {
            mostrarNotificacion("error", "Por favor completa todos los campos del formulario");
            return;
        }

        const errorRegla = validarEspacioLocal(nombre, codigoEspacio, piso);
        if (errorRegla) {
            mostrarNotificacion("error", errorRegla);
            return;
        }

        const payload = {
            codigo_espacio: codigoEspacio,
            nombre: nombre,
            piso: piso,
            bloque_id: parseInt(bloqueId),
            tipo_espacio_id: parseInt(tipoEspacioId)
        };

        console.log("🚀 Enviando espacio:", payload);

        const response = await fetch(`${API_BASE_URL}/espacios/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(extraerMensajeError(errorData));
        }

        const resultado = await response.json();
        console.log("✅ Espacio creado exitosamente:", resultado);

        mostrarNotificacion("exito", "Espacio creado correctamente");
        closeCrearEspacioModal();
        cargarSelectoresFormularios();

    } catch (error) {
        console.error("❌ Error al crear espacio:", error);
        mostrarNotificacion("error", error.message);
    }
}

// ========================================
// MAPEO DE CAPACIDAD A TONELAJE
// ========================================

const capacidadATonelaje = {
    '12000': 1.00,
    '18000': 1.50,
    '24000': 2.00,
    '30000': 2.50,
    '43000': 3.58,
    '60000': 5.00
};

// ========================================
// FUNCIONES ADICIONALES DE MODAL (EQUIPO)
// ========================================


/**
 * Maneja el envío del formulario de crear equipo DESDE EL EVENT LISTENER
 * Lee directamente de los selectores dinámicos y hace el POST correcto
 * @param {Event} event - Evento del submit del formulario
 */
async function submitCrearActivoFormulario(event) {
    event.preventDefault();
    if (esRolTecnico()) {
        mostrarNotificacion("error", "El rol Técnico no puede crear ni modificar equipos.");
        return;
    }

    try {
        const codigoActivoInput = document.getElementById("inputCodigoActivo").value.trim();
        const marcaId = parseInt(document.getElementById("select-marca").value);
        const espacioId = parseInt(document.getElementById("select-espacio-equipo").value);
        const tipoEquipoId = parseInt(document.getElementById("select-tipo-equipo").value);
        const capacidadBtu = parseInt(document.getElementById("selectCapacidad").value);
        const numeroSerie = document.getElementById("inputNumeroSerie").value.trim();
        const modeloValue = document.getElementById("input-modelo").value.trim();
        const voltajeInput = document.getElementById("inputVoltaje").value.trim();
        const voltaje = parseInt(voltajeInput, 10);
        const refrigerante = document.getElementById("selectRefrigerante").value;
        const fechaCompra = document.getElementById("inputFechaCompra").value;
        const fechaInstalacion = document.getElementById("inputFechaInstalacion").value;
        const ultimaFecha = document.getElementById("inputUltimaFecha").value;
        const proximaFecha = document.getElementById("inputProximaFecha").value;
        const tonelajeInput = document.getElementById("inputTonelaje").value.trim();
        const tonelajeCalculado = tonelajeInput !== ""
            ? Number.parseFloat(tonelajeInput)
            : capacidadATonelaje[capacidadBtu.toString()];
        const tonelaje = Number.isFinite(tonelajeCalculado) ? tonelajeCalculado : null;
        const esEdicion = Boolean(modoEdicionEquipo && equipoEnEdicionId);

        // Validación básica
        const espacioInvalido = !esEdicion && isNaN(espacioId);
        if (!codigoActivoInput || isNaN(marcaId) || espacioInvalido || isNaN(capacidadBtu) || !numeroSerie || !modeloValue || isNaN(voltaje) || !refrigerante) {
            mostrarNotificacion("error", "Por favor completa todos los campos del formulario");
            return;
        }

        const payload = {
             codigo_activo: String(codigoActivoInput),
             marca_id: marcaId,
             espacio_id: espacioId,
             tipo_equipo_id: tipoEquipoId,
             capacidad_btu: capacidadBtu,
             modelo: modeloValue,
             numero_serie: numeroSerie,
             voltaje: voltaje,
             refrigerante: refrigerante,
             estado: "Operativo",
             tonelaje: tonelaje,
             fecha_compra: fechaCompra || null,
             fecha_instalacion: fechaInstalacion || null,
             ultima_fecha: ultimaFecha || null,
             proxima_fecha: proximaFecha || null
         };

        const url = esEdicion
            ? `${API_BASE_URL}/equipos/${equipoEnEdicionId}/`
            : `${API_BASE_URL}/equipos/`;
        const method = esEdicion ? "PUT" : "POST";

        const bodyPayload = esEdicion
            ? {
                codigo_activo: String(codigoActivoInput),
                modelo: modeloValue,
                capacidad_btu: capacidadBtu,
                tonelaje: tonelaje,
                numero_serie: numeroSerie,
                voltaje: voltaje,
                refrigerante: refrigerante,
                marca_id: marcaId,
                tipo_equipo_id: tipoEquipoId,
                fecha_compra: fechaCompra || null,
                fecha_instalacion: fechaInstalacion || null,
                ultima_fecha: ultimaFecha || null,
                proxima_fecha: proximaFecha || null
            }
            : payload;

        console.log(`🚀 Enviando equipo (${method}):`, bodyPayload);

        const response = await fetch(url, {
            method,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify(bodyPayload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            const mensaje = extraerMensajeError(errorData) || "Error en el formulario";
            mostrarNotificacion("error", mensaje);
            return;
        }

        await response.json();

        mostrarNotificacion(
            "exito",
            esEdicion ? "Equipo actualizado correctamente" : "Equipo registrado exitosamente en la base de datos"
        );
        closeCrearActivoModal();
        cargarInventarioCompleto();

    } catch (error) {
        console.error("❌ Error al crear equipo:", error);
        mostrarNotificacion("error", error.message || "Error inesperado al crear el equipo");
    }
}

// ========================================
// FUNCIONES DE MODAL (HOJA DE VIDA TÉCNICA)
// ========================================

/**
 * Abre el modal de Hoja de Vida Técnica y carga los datos del equipo
 * @param {number} equipoId - ID del equipo a mostrar
 */
async function openTechnicalSheet(equipoId) {
    const modal = document.getElementById("modal-hoja-vida");
    
    if (!modal) {
        console.error("❌ Modal con id='modal-hoja-vida' no encontrado");
        return;
    }

    try {
        // Guardar ID del equipo actualmente abierto
        window.currentEquipoId = equipoId;
        
        // Mostrar modal con estado de carga
        modal.classList.remove("hidden");
        modal.style.display = 'flex';
        document.body.classList.add('overflow-hidden');
        
        console.log("📋 Cargando datos del equipo ID:", equipoId);
        
        // Realizar petición GET para obtener datos del equipo
        const response = await fetch(`${API_BASE_URL}/equipos/${equipoId}/`);
        
        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
        }

        const equipo = await response.json();
        console.log("✅ Datos del equipo cargados:", equipo);
        
        // Guardar código de activo para la función de activación
        window.currentEquipoCodigoActivo = equipo.codigo_activo;

        // Rellenar campos del modal con los datos obtenidos
        const campos = {
            technicalSheetId: equipo.codigo_activo || "N/A",
            technicalSheetBrand: equipo.marca 
                ? (typeof equipo.marca === 'object' ? equipo.marca.nombre : equipo.marca)
                : "No especificada",
            technicalSheetModel: equipo.modelo || "No especificado",
            technicalSheetType: obtenerNombreTipoEquipo(equipo),
            technicalSheetBtu: equipo.capacidad_btu 
                ? `${equipo.capacidad_btu.toLocaleString("es-CO")} BTU/h`
                : "No especificada",
            technicalSheetTr: equipo.tonelaje 
                ? `${parseFloat(equipo.tonelaje).toFixed(2)} TR`
                : "No especificado",
            technicalSheetBlock: equipo.espacio && equipo.espacio.codigo_espacio
                ? equipo.espacio.codigo_espacio
                : "No especificado",
            technicalSheetSpace: equipo.espacio && equipo.espacio.nombre
                ? equipo.espacio.nombre
                : "No especificado",
            technicalSheetFloor: equipo.espacio && equipo.espacio.piso
                ? `Piso ${equipo.espacio.piso}`
                : "No especificado",
            technicalSheetInstallDate: equipo.fecha_instalacion
                ? new Date(equipo.fecha_instalacion).toLocaleDateString("es-CO")
                : "No especificada",
            technicalSheetLastService: equipo.ultima_fecha
                ? new Date(equipo.ultima_fecha).toLocaleDateString("es-CO")
                : "No registrada",
            technicalSheetWarranty: "Vigente",
            technicalSheetNextMaintenance: equipo.proxima_fecha
                ? new Date(equipo.proxima_fecha).toLocaleDateString("es-CO")
                : "No programado",
            technicalSheetCountdown: "Información disponible",
            technicalSheetStatusPill: obtenerBadgeEstado(equipo.estado),
            technicalSheetSubtitle: equipo.numero_serie || "Sin serie",
            technicalSheetSerialNumber: equipo.numero_serie || "No especificado",
            technicalSheetVoltage: equipo.voltaje || "No especificado",
            technicalSheetRefrigerant: equipo.refrigerante || "No especificado"
        };

        // Actualizar campos de texto sin reemplazar el HTML
        Object.keys(campos).forEach(id => {
            const elemento = document.getElementById(id);
            if (elemento) {
                if (id === "technicalSheetStatusPill") {
                    elemento.innerHTML = campos[id];
                } else {
                    elemento.textContent = campos[id];
                }
            } else {
                console.warn(`⚠️  Campo no encontrado: ${id}`);
            }
        });
        
        // Control dinámico de la acción según el estado
        const accionModal = document.getElementById("modalEstadoAccion");
        if (accionModal) accionModal.innerHTML = obtenerAccionEstadoEquipoHtml(equipo.estado);

        await cargarHistorialIntervenciones(equipoId);

        console.log("✅ Modal de Hoja de Vida Técnica rellenado exitosamente");

    } catch (error) {
        console.error("❌ Error al cargar detalles técnicos:", error);
        mostrarNotificacion("error", `Error al cargar los detalles del equipo: ${error.message}`);
        cargarHistorialIntervenciones(equipoId, true);
    }
}

// ========================================
// VISTA DETALLE INLINE OPCIÓN C (reemplaza tabla en el mismo espacio)
// ========================================
function setInlineTexto(id, valor) {
    var el = document.getElementById(id);
    if (el) el.textContent = valor;
}

/**
 * Vuelve desde la ficha del activo al nivel anterior:
 * al aula (nivel 2) si se abrió desde un espacio, o a los espacios (nivel 1).
 */
function volverAListaInventario() {
    var detalle = document.getElementById("vista-detalle-inline");
    if (detalle) {
        detalle.classList.add("hidden");
        detalle.classList.remove("flex");
    }
    // Mostrar nuevamente la barra de filtros al volver al inventario
    var panelFiltros = document.querySelector('.panel');
    if (panelFiltros) panelFiltros.classList.remove("hidden");
    if (espacioSeleccionadoId) {
        var espacio = obtenerEspacioPorId(espacioSeleccionadoId);
        if (espacio) {
            mostrarVistaEspacio(espacio);
            return;
        }
    }
    espacioSeleccionadoId = null;
    mostrarVistaEspacios();
    reiniciarScrollInventario();
}

/**
 * Ajusta los botones de retorno de la ficha según el nivel de origen.
 */
function actualizarNavegacionDetalle() {
    var texto = document.getElementById("texto-volver-detalle");
    if (texto) texto.textContent = espacioSeleccionadoId ? "Volver al Aula" : "Volver a Espacios";
    var secundario = document.getElementById("btn-volver-espacios-detalle");
    if (secundario) secundario.classList.toggle("hidden", !espacioSeleccionadoId);
}

async function mostrarDetalleInline(equipoId) {
    var lista = document.getElementById("contenedor-inventario");
    var espacioVista = document.getElementById("vista-espacio-inline");
    var detalle = document.getElementById("vista-detalle-inline");
    if (!detalle) {
        openTechnicalSheet(equipoId);
        return;
    }
    if (lista) lista.classList.add("hidden");
    if (espacioVista) {
        espacioVista.classList.add("hidden");
        espacioVista.classList.remove("flex");
    }
    detalle.classList.remove("hidden");
    detalle.classList.add("flex");
    // Ocultar la barra de filtros superiores al ver el detalle
    var panelFiltros = document.querySelector('.panel');
    if (panelFiltros) panelFiltros.classList.add("hidden");
    actualizarNavegacionDetalle();
    window.currentEquipoId = equipoId;
    setInlineTexto("dInlineId", "Cargando...");
    setInlineTexto("dInlineSubtitle", "Cargando ficha...");
    try {
        const response = await fetch(`${API_BASE_URL}/equipos/${equipoId}/`);
        if (!response.ok) throw new Error(`Error HTTP ${response.status}`);
        const equipo = await response.json();
        window.currentEquipoCodigoActivo = equipo.codigo_activo;
        const marca = equipo.marca ? (typeof equipo.marca === "object" ? equipo.marca.nombre : equipo.marca) : "No especificada";
        setInlineTexto("dInlineId", equipo.codigo_activo || "N/A");
        setInlineTexto("dInlineIdHeader", equipo.codigo_activo || "N/A");
        setInlineTexto("dInlineSubtitle", equipo.numero_serie ? ("Serie " + equipo.numero_serie) : "Sin serie");
        setInlineTexto("dInlineBrand", marca);
        setInlineTexto("dInlineModel", equipo.modelo || "No especificado");
        setInlineTexto("dInlineSerial", equipo.numero_serie || "No especificado");
        setInlineTexto("dInlineType", obtenerNombreTipoEquipo(equipo));
        setInlineTexto("dInlineBtu", equipo.capacidad_btu ? `${Number(equipo.capacidad_btu).toLocaleString("es-CO")} BTU/h` : "No especificada");
        setInlineTexto("dInlineTr", equipo.tonelaje ? `${parseFloat(equipo.tonelaje).toFixed(2)} TR` : "No especificado");
        setInlineTexto("dInlineVoltage", equipo.voltaje || "No especificado");
        setInlineTexto("dInlineRefrigerant", equipo.refrigerante || "No especificado");
        setInlineTexto("dInlineBlock", equipo.espacio && equipo.espacio.codigo_espacio ? equipo.espacio.codigo_espacio : "No especificado");
        setInlineTexto("dInlineSpace", equipo.espacio && equipo.espacio.nombre ? equipo.espacio.nombre : "No especificado");
        setInlineTexto("dInlineFloor", equipo.espacio && equipo.espacio.piso != null ? `Piso ${equipo.espacio.piso}` : "No especificado");
        setInlineTexto("dInlineInstallDate", equipo.fecha_instalacion ? new Date(equipo.fecha_instalacion).toLocaleDateString("es-CO") : "No especificada");
        setInlineTexto("dInlineLastService", equipo.ultima_fecha ? new Date(equipo.ultima_fecha).toLocaleDateString("es-CO") : "No registrada");
        setInlineTexto("dInlineWarranty", "Vigente");
        setInlineTexto("dInlineNextMaintenance", equipo.proxima_fecha ? new Date(equipo.proxima_fecha).toLocaleDateString("es-CO") : "No programado");
        setInlineTexto("dInlineCountdown", "Información disponible");
        var pill = document.getElementById("dInlineStatusPill");
        if (pill) pill.innerHTML = obtenerBadgeEstado(equipo.estado);
        var accionInline = document.getElementById("dInlineEstadoAccion");
        if (accionInline) accionInline.innerHTML = obtenerAccionEstadoEquipoHtml(equipo.estado);
        await cargarHistorialInline(equipoId);
        // Sincroniza también el modal clásico por compatibilidad
        try { await openTechnicalSheetSilent(equipo); } catch (e) { /* solo inline */ }
    } catch (error) {
        console.error("❌ Error detalle inline:", error);
        setInlineTexto("dInlineId", "Error");
        mostrarNotificacion("error", "No se pudo cargar el detalle del equipo.");
    }
}

async function openTechnicalSheetSilent(equipo) {
    const mapa = {
        technicalSheetId: equipo.codigo_activo || "N/A",
        technicalSheetIdHeader: equipo.codigo_activo || "N/A",
        technicalSheetBrand: equipo.marca ? (typeof equipo.marca === "object" ? equipo.marca.nombre : equipo.marca) : "No especificada",
        technicalSheetModel: equipo.modelo || "No especificado",
        technicalSheetType: obtenerNombreTipoEquipo(equipo),
        technicalSheetSubtitle: equipo.numero_serie ? ("Serie " + equipo.numero_serie) : "Sin serie",
        technicalSheetSerialNumber: equipo.numero_serie || "No especificado",
        technicalSheetVoltage: equipo.voltaje || "No especificado",
        technicalSheetRefrigerant: equipo.refrigerante || "No especificado"
    };
    Object.keys(mapa).forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.textContent = mapa[id];
    });
}

var historialAnioInline = new Date().getFullYear();
var historialEquipoIdInline = null;
var historialEventosInline = [];

function fetchConTokenInline(url) {
    var headers = {};
    try {
        var t = localStorage.getItem("token");
        if (t) headers["Authorization"] = "Bearer " + t;
    } catch (e) {}
    return fetch(url, { headers: headers });
}

function esCorrectivoInline(nombreTipo) {
    return String(nombreTipo || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().indexOf("correct") !== -1;
}

function formatearCOPInline(valor) {
    var n = Number(valor);
    if (!Number.isFinite(n) || n <= 0) return "$ 0";
    try { return n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }); }
    catch (e) { return "$" + Math.round(n).toLocaleString("es-CO"); }
}

function describirDetalleInline(texto) {
    try {
        if (typeof formatearObservacionesMantenimiento === "function") {
            return formatearObservacionesMantenimiento(texto);
        }
    } catch (e) {}
    return '<p class="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">' + escaparHtmlInline(texto || "Sin observaciones") + "</p>";
}

function badgeEstadoEquipoInline(estado) {
    var v = String(estado || "").trim();
    if (!v || v === "—") return '<span class="text-slate-400 text-sm">—</span>';
    var cls = "bg-slate-100 text-slate-600";
    var icon = "fas fa-question";
    if (v === "Operativo") { cls = "bg-green-100 text-green-700"; icon = "fas fa-check"; }
    else if (v === "En reparacion") { cls = "bg-amber-100 text-amber-700"; icon = "fas fa-tools"; }
    else if (v === "Dado de baja") { cls = "bg-red-100 text-red-700"; icon = "fas fa-ban"; }
    return '<span class="inline-flex items-center gap-1 ' + cls + ' px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap"><i class="' + icon + '"></i> ' + escaparHtmlInline(v) + "</span>";
}

function resolverParsedInline(item) {
    // Prefiere campos del backend; fallback a parse local del texto.
    var trabajo = item.trabajo_realizado != null ? item.trabajo_realizado : null;
    var estado = item.estado_final != null ? item.estado_final : null;
    var hallazgos = item.hallazgos != null ? item.hallazgos : null;
    var recomendaciones = item.recomendaciones != null ? item.recomendaciones : null;
    var necesitaParse = (trabajo == null || estado == null) && typeof parseDetalleMantenimientoJS === "function";
    if (necesitaParse) {
        try {
            var p = parseDetalleMantenimientoJS(item.descripcion || "");
            if (trabajo == null) trabajo = p.trabajo_realizado;
            if (estado == null) estado = p.estado_final;
            if (hallazgos == null) hallazgos = p.hallazgos;
            if (recomendaciones == null) recomendaciones = p.recomendaciones;
        } catch (e) {}
    }
    return { trabajo: trabajo, estado: estado, hallazgos: hallazgos, recomendaciones: recomendaciones };
}

function describirTrabajoInline(item) {
    var r = resolverParsedInline(item);
    var html = "";
    try {
        if (typeof formatearSoloTrabajoRealizado === "function") {
            html = formatearSoloTrabajoRealizado(item.descripcion, r.trabajo);
        } else {
            html = '<p class="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">' + escaparHtmlInline(r.trabajo || "Sin descripción") + "</p>";
        }
    } catch (e) {
        html = '<p class="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">' + escaparHtmlInline(r.trabajo || "Sin descripción") + "</p>";
    }
    var extras = "";
        if (r.hallazgos) extras += '<div class="mt-1"><p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Hallazgos</p><p class="text-xs text-slate-600">' + escaparHtmlInline(r.hallazgos) + "</p></div>";
        if (r.recomendaciones) extras += '<div class="mt-1"><p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Recomendaciones</p><p class="text-xs text-slate-600">' + escaparHtmlInline(r.recomendaciones) + "</p></div>";
    if (extras) {
        html += '<details class="mt-1.5 text-xs"><summary class="cursor-pointer text-[#00acc9] font-bold hover:underline">Ver hallazgos y recomendaciones</summary><div class="mt-1 space-y-1">' + extras + "</div></details>";
    }
    return html;
}

function formatearFechaInline(fechaStr) {
    if (!fechaStr) return "—";
    var s = String(fechaStr).split("T")[0];
    var p = s.split("-");
    if (p.length < 3) return s;
    return p[2] + "/" + p[1] + "/" + p[0];
}

function parsearFechaInline(fechaStr) {
    if (!fechaStr) return null;
    var s = String(fechaStr).split("T")[0].split("-").map(Number);
    if (s.length < 3 || !s[0] || !s[1] || !s[2]) return null;
    return new Date(s[0], s[1] - 1, s[2]);
}

function diasEnMesInline(anio, mesIdx) {
    return new Date(anio, mesIdx + 1, 0).getDate();
}

function poblarAniosInline() {
    var sel = document.getElementById("select-anio-inline");
    if (!sel) return;
    if (sel.options.length) return;
    var base = new Date().getFullYear();
    var html = "";
    for (var y = base - 2; y <= base + 2; y++) {
        html += '<option value="' + y + '"' + (y === historialAnioInline ? " selected" : "") + ">" + y + "</option>";
    }
    sel.innerHTML = html;
    sel.addEventListener("change", function () {
        historialAnioInline = Number(sel.value) || base;
        if (historialEquipoIdInline) cargarHistorialAnualInline(historialEquipoIdInline, historialAnioInline);
    });
}

function construirEncabezadoDiasInline(theadId) {
    var thead = document.getElementById(theadId);
    if (!thead) return;
    var tr = document.createElement("tr");
    var thMes = document.createElement("th");
    thMes.scope = "col";
    thMes.textContent = "Mes";
    tr.appendChild(thMes);
    for (var d = 1; d <= 31; d++) {
        var th = document.createElement("th");
        th.scope = "col";
        th.textContent = String(d);
        tr.appendChild(th);
    }
    thead.innerHTML = "";
    thead.appendChild(tr);
}

function escaparHtmlInline(t) {
    return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function badgeTipoInline(tipoNombre) {
    var esCorr = esCorrectivoInline(tipoNombre);
    var txt = escaparHtmlInline(tipoNombre || "—");
    var cls = esCorr ? "bg-amber-50 text-amber-700" : "bg-cyan-50 text-cyan-700";
    return '<span class="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold ' + cls + '">' + txt + "</span>";
}

function renderMatrizInline(tbodyId, tituloId, eventos, esCorr, anio) {
    var tbody = document.getElementById(tbodyId);
    var titulo = document.getElementById(tituloId);
    if (!tbody) return;
    var MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    var filtrados = eventos.filter(function (e) { return !!e.correctivo === !!esCorr; });
    if (titulo) {
        titulo.textContent = (esCorr ? "Mantenimiento correctivo" : "Mantenimiento preventivo") + " — " + anio + " (" + filtrados.length + ")";
    }
    var mapa = {};
    filtrados.forEach(function (e) {
        var f = parsearFechaInline(e.fecha);
        if (!f || f.getFullYear() !== anio) return;
        var clave = f.getMonth() + "-" + f.getDate();
        if (!mapa[clave]) mapa[clave] = [];
        mapa[clave].push(e);
    });
    tbody.innerHTML = "";
    for (var m = 0; m < 12; m++) {
        var tr = document.createElement("tr");
        var th = document.createElement("th");
        th.scope = "row";
        th.textContent = MESES[m];
        tr.appendChild(th);
        var maxDia = diasEnMesInline(anio, m);
        for (var d = 1; d <= 31; d++) {
            var td = document.createElement("td");
            if (d > maxDia) {
                var v = document.createElement("span");
                v.className = "cal-cell is-empty";
                v.textContent = "·";
                td.appendChild(v);
            } else {
                var lista = mapa[m + "-" + d] || [];
                if (!lista.length) {
                    var s = document.createElement("span");
                    s.className = "cal-cell is-empty";
                    s.textContent = "";
                    td.appendChild(s);
                } else {
                    (function (mesIdx, dia, items) {
                        var btn = document.createElement("button");
                        btn.type = "button";
                        btn.className = "cal-cell is-realizado";
                        btn.textContent = items.length > 1 ? "X" + items.length : "X";
                        btn.setAttribute("aria-label", "Ver detalle del día");
                        btn.addEventListener("click", function () { abrirDetalleDiaInline(mesIdx, dia, items); });
                        td.appendChild(btn);
                    })(m, d, lista);
                }
            }
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
}

function renderHistorialUnicoInline(eventosMant) {
    var tbody = document.getElementById("dInlineHistory");
    var resumen = document.getElementById("resumen-anio-inline");
    if (!tbody) return;
    var ordenados = (eventosMant || []).slice().sort(function (a, b) {
        return String(b.fecha || "") < String(a.fecha || "") ? -1 : 1;
    });
    var nPrev = ordenados.filter(function (e) { return !e.correctivo; }).length;
    var nCorr = ordenados.filter(function (e) { return !!e.correctivo; }).length;
    if (resumen) resumen.textContent = ordenados.length + " en " + historialAnioInline + " · " + nPrev + " preventivos · " + nCorr + " correctivos";
    if (!ordenados.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-5 py-8 text-center text-slate-500 italic">No hay intervenciones registradas aún para este equipo en ' + historialAnioInline + ".</td></tr>";
        return;
    }
    tbody.innerHTML = "";
    ordenados.forEach(function (item, idx) {
        var fila = document.createElement("tr");
        fila.className = "hover:bg-slate-50/60 align-top";
        var costoTxt = escaparHtmlInline(formatearCOPInline(item.costo));
        fila.innerHTML =
            '<td class="px-5 py-4 text-slate-500 text-sm align-top whitespace-nowrap">' + (idx + 1) + "</td>" +
            '<td class="px-5 py-4 text-slate-700 font-medium whitespace-nowrap align-top">' + escaparHtmlInline(formatearFechaInline(item.fecha)) + "</td>" +
            '<td class="px-5 py-4 text-slate-600 text-sm align-top" style="min-width:280px;max-width:460px">' + describirTrabajoInline(item) + "</td>" +
            '<td class="px-5 py-4 align-top whitespace-nowrap">' + badgeEstadoEquipoInline(item.estado_final) + "</td>" +
            '<td class="px-5 py-4 text-slate-600 text-sm align-top whitespace-nowrap">' + escaparHtmlInline(item.tecnico || "—") + "</td>" +
            '<td class="px-5 py-4 text-slate-700 font-bold whitespace-nowrap text-sm align-top">' + costoTxt + "</td>" +
            '<td class="px-5 py-4 align-top whitespace-nowrap">' + badgeTipoInline(item.tipo) + "</td>";
        tbody.appendChild(fila);
    });
}

function abrirDetalleDiaInline(mesIdx, dia, lista) {
    var MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    var sub = document.getElementById("subtitulo-detalle-dia-inline");
    if (sub) sub.textContent = MESES_LARGOS[mesIdx] + " " + dia + " de " + historialAnioInline + " · " + lista.length + " registro(s)";
    var tbody = document.getElementById("tabla-detalle-dia-inline-body");
    if (tbody) {
        tbody.innerHTML = "";
        lista.forEach(function (e) {
            var tr = document.createElement("tr");
            tr.className = "align-top";
            tr.innerHTML =
                '<td class="px-4 py-3 text-slate-700 font-medium whitespace-nowrap align-top">' + escaparHtmlInline(formatearFechaInline(e.fecha)) + "</td>" +
                '<td class="px-4 py-3 text-slate-600 align-top whitespace-nowrap">' + escaparHtmlInline(e.tecnico || "—") + "</td>" +
                '<td class="px-4 py-3 align-top whitespace-nowrap">' + badgeTipoInline(e.tipo) + "</td>" +
                '<td class="px-4 py-3 text-slate-600 text-sm align-top" style="min-width:260px;max-width:440px">' + describirTrabajoInline(e) + "</td>" +
                '<td class="px-4 py-3 align-top whitespace-nowrap">' + badgeEstadoEquipoInline(e.estado_final) + "</td>" +
                '<td class="px-4 py-3 font-bold text-slate-700 whitespace-nowrap text-sm align-top">' + escaparHtmlInline(formatearCOPInline(e.costo)) + "</td>";
            tbody.appendChild(tr);
        });
    }
    var modal = document.getElementById("modal-detalle-dia-inline");
    if (modal) { modal.classList.remove("hidden"); modal.classList.add("flex"); }
}

function cerrarDetalleDiaInline() {
    var modal = document.getElementById("modal-detalle-dia-inline");
    if (modal) { modal.classList.add("hidden"); modal.classList.remove("flex"); }
}

async function cargarHistorialAnualInline(equipoId, anio) {
    var tbody = document.getElementById("dInlineHistory");
    var vacio = '<tr><td colspan="7" class="px-5 py-8 text-center text-slate-500 italic">No hay intervenciones registradas aún para este equipo en ' + anio + ".</td></tr>";
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="px-5 py-6 text-center text-slate-400 text-sm"><i class="fas fa-spinner fa-spin mr-2"></i>Cargando historial ' + anio + "…</td></tr>";
    renderMatrizInline("matriz-prev-body-inline", "titulo-matriz-prev-inline", [], false, anio);
    renderMatrizInline("matriz-corr-body-inline", "titulo-matriz-corr-inline", [], true, anio);
    var mants = [];
    var progs = [];
    try {
        var r1 = await fetchConTokenInline(API_BASE_URL + "/mantenimientos/?equipo_id=" + encodeURIComponent(equipoId) + "&anio=" + encodeURIComponent(anio) + "&limit=100");
        if (r1.ok) {
            var d1 = await r1.json();
            mants = Array.isArray(d1) ? d1 : (d1.items || []);
        }
    } catch (e) { mants = []; }
    try {
        var r2 = await fetchConTokenInline(API_BASE_URL + "/programaciones/?equipo_id=" + encodeURIComponent(equipoId) + "&anio=" + encodeURIComponent(anio) + "&size=100");
        if (r2.ok) {
            var d2 = await r2.json();
            progs = d2.items || (Array.isArray(d2) ? d2 : []);
        }
    } catch (e) { progs = []; }
    // Fallback sin año: historial por equipo (incluye gasto total)
    if (!mants.length) {
        try {
            var r3 = await fetchConTokenInline(API_BASE_URL + "/equipos/" + encodeURIComponent(equipoId) + "/mantenimientos?limit=100");
            if (r3.ok) {
                var d3 = await r3.json();
                var todos = Array.isArray(d3) ? d3 : (d3.items || []);
                mants = todos.filter(function (m) {
                    var f = parsearFechaInline(m.fecha_mantenimiento);
                    return f && f.getFullYear() === anio;
                }).map(function (m) {
                    return {
                        fecha_mantenimiento: String(m.fecha_mantenimiento).split("T")[0],
                        tipo_nombre: m.tipo_nombre,
                        tecnico_nombre: m.tecnico_nombre,
                        observaciones: m.detalle_mantenimiento,
                        detalle_mantenimiento: m.detalle_mantenimiento,
                        costo_total: m.costo_total,
                        costo_servicio: m.costo_total,
                        trabajo_realizado: m.trabajo_realizado,
                        estado_final: m.estado_final,
                        hallazgos: m.hallazgos,
                        recomendaciones: m.recomendaciones
                    };
                });
            }
        } catch (e) {}
    }
    function nombreTecnicoProg(p) {
        if (p.encargado && typeof p.encargado === "object") {
            var n = p.encargado.nombre || "";
            return n || "Sin asignar";
        }
        return "Sin asignar";
    }
    function tipoProg(p) {
        if (p.tipo_mantenimiento && typeof p.tipo_mantenimiento === "object") return p.tipo_mantenimiento.nombre || "—";
        return "—";
    }
    var eventosMant = (mants || []).map(function (m) {
        var tipo = m.tipo_nombre || "—";
        var costo = (m.costo_total != null ? m.costo_total : m.costo_servicio);
        return {
            fecha: String(m.fecha_mantenimiento || "").split("T")[0],
            tipo: tipo,
            correctivo: esCorrectivoInline(tipo),
            tecnico: m.tecnico_nombre || "Sin asignar",
            descripcion: m.observaciones || m.detalle_mantenimiento || "—",
            trabajo_realizado: m.trabajo_realizado,
            estado_final: m.estado_final,
            hallazgos: m.hallazgos,
            recomendaciones: m.recomendaciones,
            costo: costo,
            origen: "mantenimiento",
            id: m.id
        };
    }).filter(function (e) { return parsearFechaInline(e.fecha); });
    var eventosProg = (progs || []).filter(function (p) {
        var est = String(p.estado || "");
        return est === "Completado" || est === "Completada" || est === "Realizado";
    }).map(function (p) {
        var tipo = tipoProg(p);
        return {
            fecha: String(p.fecha_programada || "").split("T")[0],
            tipo: tipo,
            correctivo: esCorrectivoInline(tipo),
            tecnico: nombreTecnicoProg(p),
            descripcion: "Orden " + (p.id != null ? p.id : "") + " · " + tipo,
            costo: null,
            origen: "programacion",
            id: p.id
        };
    }).filter(function (e) { return parsearFechaInline(e.fecha); });
    // Matrices: trabajos hechos + órdenes completadas (automático). Historial: solo trabajos con detalle y gasto.
    var paraMatrices = eventosMant.concat(eventosProg);
    historialEventosInline = paraMatrices;
    renderMatrizInline("matriz-prev-body-inline", "titulo-matriz-prev-inline", paraMatrices, false, anio);
    renderMatrizInline("matriz-corr-body-inline", "titulo-matriz-corr-inline", paraMatrices, true, anio);
    renderHistorialUnicoInline(eventosMant);
    if (!paraMatrices.length && tbody && !eventosMant.length) tbody.innerHTML = vacio;
}

async function cargarHistorialInline(equipoId) {
    historialEquipoIdInline = equipoId;
    poblarAniosInline();
    construirEncabezadoDiasInline("matriz-prev-head-inline");
    construirEncabezadoDiasInline("matriz-corr-head-inline");
    var sel = document.getElementById("select-anio-inline");
    if (sel && sel.value) historialAnioInline = Number(sel.value) || historialAnioInline;
    await cargarHistorialAnualInline(equipoId, historialAnioInline);
}

/**
 * Carga el historial de mantenimientos en la tabla de la hoja de vida
 * @param {number} equipoId
 * @param {boolean} forzarVacio - Si true, muestra mensaje vacío sin fetch
 */
async function cargarHistorialIntervenciones(equipoId, forzarVacio = false) {
    const tbody = document.getElementById("technicalSheetHistory");
    if (!tbody) return;

    const filaVacia = `
        <tr>
            <td colspan="4" class="px-6 py-8 text-center text-slate-500 italic">
                No hay intervenciones registradas aún para este equipo.
            </td>
        </tr>
    `;

    if (forzarVacio) {
        tbody.innerHTML = filaVacia;
        return;
    }

    tbody.innerHTML = `
        <tr>
            <td colspan="4" class="px-6 py-6 text-center text-slate-400 text-sm">
                <i class="fas fa-spinner fa-spin mr-2"></i>Cargando historial...
            </td>
        </tr>
    `;

    try {
        const response = await fetch(`${API_BASE_URL}/equipos/${equipoId}/mantenimientos`);

        if (!response.ok) {
            tbody.innerHTML = filaVacia;
            return;
        }

        const data = await response.json();
        const intervenciones = Array.isArray(data) ? data : (data.items || []);

        if (!intervenciones.length) {
            tbody.innerHTML = filaVacia;
            return;
        }

        tbody.innerHTML = "";
        intervenciones.forEach(item => {
            const fila = document.createElement("tr");
            const fecha = item.fecha_mantenimiento
                ? new Date(item.fecha_mantenimiento + "T00:00:00").toLocaleDateString("es-CO")
                : "—";
            fila.innerHTML = `
                <td class="px-4 py-2.5 text-slate-700 font-medium">${fecha}</td>
                <td class="px-4 py-2.5 text-slate-600">${item.tecnico_nombre || "—"}</td>
                <td class="px-4 py-2.5">
                    <span class="status-pill status-info">${item.tipo_nombre || "—"}</span>
                </td>
                <td class="px-4 py-2.5 text-slate-600 text-sm align-top">${formatearObservacionesMantenimiento(item.detalle_mantenimiento)}</td>
            `;
            tbody.appendChild(fila);
        });
    } catch {
        tbody.innerHTML = filaVacia;
    }
}

/**
 * Edita el equipo actualmente abierto
 */
async function editTechnicalSheet() {
    if (esRolTecnico()) {
        mostrarNotificacion("error", "El rol Técnico no puede modificar equipos.");
        return;
    }
    if (!window.currentEquipoId) {
        mostrarNotificacion("error", "No hay equipo seleccionado");
        return;
    }

    try {
        const response = await fetchConTokenInline(`${API_BASE_URL}/equipos/${window.currentEquipoId}/`);
        if (!response.ok) {
            throw new Error("No se pudo cargar el equipo para editar");
        }

        const equipo = await response.json();
        closeTechnicalSheetModal();

        modoEdicionEquipo = true;
        equipoEnEdicionId = equipo.id;
        window.currentEquipoId = equipo.id;

        await cargarSelectoresFormularios();
        openCrearActivoModal();
        const form = document.getElementById("form-crear-activo");
        if (form) form.reset();
        rellenarFormularioEquipo(equipo);
    } catch (error) {
        console.error("❌ Error al abrir edición:", error);
        mostrarNotificacion("error", error.message);
    }
}

let equipoTrasladoId = null;

function mostrarErrorTraslado(mensaje) {
    const error = document.getElementById("traslado-error");
    if (!error) return;
    error.textContent = mensaje || "";
    error.classList.toggle("hidden", !mensaje);
}

function cerrarModalTraslado() {
    const modal = document.getElementById("modal-trasladar-equipo");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
    const form = document.getElementById("form-trasladar-equipo");
    if (form) form.reset();
    const boton = document.getElementById("btn-confirmar-traslado");
    if (boton) {
        boton.disabled = false;
        boton.textContent = "Trasladar";
    }
    mostrarErrorTraslado("");
    equipoTrasladoId = null;
}

async function abrirModalTraslado(equipoId) {
    if (esRolTecnico()) {
        mostrarNotificacion("error", "El rol Técnico no puede trasladar equipos.");
        return;
    }

    const id = Number(equipoId || window.currentEquipoId);
    if (!id) {
        mostrarNotificacion("error", "No hay equipo seleccionado");
        return;
    }

    const modal = document.getElementById("modal-trasladar-equipo");
    const select = document.getElementById("select-espacio-destino");
    const boton = document.getElementById("btn-confirmar-traslado");
    const codigo = document.getElementById("traslado-equipo-codigo");
    const origen = document.getElementById("traslado-origen");
    if (!modal || !select) return;

    equipoTrasladoId = id;
    mostrarErrorTraslado("");
    if (codigo) codigo.textContent = "Cargando activo...";
    if (origen) origen.textContent = "Consultando ubicación actual...";
    select.innerHTML = '<option value="">Cargando espacios...</option>';
    select.disabled = true;
    if (boton) boton.disabled = true;

    modal.classList.remove("hidden");
    modal.classList.add("flex");

    try {
        const [respuestaEquipo, espacios] = await Promise.all([
            fetchConTokenInline(`${API_BASE_URL}/equipos/${id}/`),
            obtenerTodosLosEspacios(),
        ]);

        if (!respuestaEquipo.ok) throw new Error("No se pudo cargar el equipo");
        if (equipoTrasladoId !== id) return;
        const equipo = await respuestaEquipo.json();
        const espacioActualId = equipo.espacio_id ?? (equipo.espacio && equipo.espacio.id);
        const nombreEspacio = (equipo.espacio && equipo.espacio.nombre) || equipo.espacio_nombre || "Sin espacio asignado";
        const pisoEspacio = equipo.espacio && equipo.espacio.piso !== undefined ? ` · Piso ${equipo.espacio.piso}` : "";

        if (codigo) codigo.textContent = `${equipo.codigo_activo || "Equipo"} · ${equipo.modelo || "Sin modelo"}`;
        if (origen) origen.textContent = `Ubicación actual: ${nombreEspacio}${pisoEspacio}`;

        const destinos = espacios.filter((espacio) => String(espacio.id) !== String(espacioActualId));
        select.innerHTML = '<option value="">Selecciona un espacio</option>';
        destinos.forEach((espacio) => {
            const option = document.createElement("option");
            option.value = espacio.id;
            option.textContent = `${espacio.nombre} · Piso ${espacio.piso ?? "N/A"}`;
            select.appendChild(option);
        });

        if (!destinos.length) {
            select.innerHTML = '<option value="">No hay otros espacios disponibles</option>';
            if (boton) boton.disabled = true;
        } else if (boton) {
            boton.disabled = false;
        }
    } catch (error) {
        console.error("❌ Error al abrir traslado:", error);
        mostrarErrorTraslado(error.message || "No se pudo preparar el traslado");
        select.innerHTML = '<option value="">Error al cargar espacios</option>';
    } finally {
        select.disabled = false;
    }
}

async function submitTrasladoEquipo(event) {
    event.preventDefault();
    if (esRolTecnico()) {
        mostrarNotificacion("error", "El rol Técnico no puede trasladar equipos.");
        return;
    }

    const select = document.getElementById("select-espacio-destino");
    const boton = document.getElementById("btn-confirmar-traslado");
    const destinoId = Number(select && select.value);
    if (!equipoTrasladoId || !destinoId) {
        mostrarErrorTraslado("Selecciona un espacio de destino válido.");
        return;
    }

    mostrarErrorTraslado("");
    if (boton) {
        boton.disabled = true;
        boton.textContent = "Trasladando...";
    }

    try {
        const response = await fetch(`${API_BASE_URL}/equipos/${equipoTrasladoId}/trasladar`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify({ espacio_destino_id: destinoId }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(extraerMensajeError(data) || "Error al trasladar el equipo");
        }

        mostrarNotificacion("exito", "Equipo trasladado correctamente");
        cerrarModalTraslado();
        closeTechnicalSheetModal();
        cargarInventarioCompleto();
    } catch (error) {
        console.error("❌ Error al trasladar equipo:", error);
        mostrarErrorTraslado(error.message || "No se pudo trasladar el equipo");
        if (boton) {
            boton.disabled = false;
            boton.textContent = "Trasladar";
        }
    }
}

/**
 * Cambia el estado del equipo a "Inactivo" (dar de baja)
 */
async function decommissionTechnicalSheet() {
    if (esRolTecnico()) {
        mostrarNotificacion("error", "El rol Técnico no puede dar de baja equipos.");
        return;
    }
    if (!window.currentEquipoId) {
        mostrarNotificacion("error", "No hay equipo seleccionado");
        return;
    }

    const confirmar = await solicitarConfirmacion({
        titulo: 'Dar de Baja Equipo',
        mensaje: '¿Está seguro de que desea dar de baja este equipo? Se marcará como Inactivo en el sistema y dejará de estar disponible para programación de mantenimientos.',
        textoAceptar: 'Dar de Baja',
        esPeligroso: true
    });

    if (!confirmar) return;

    try {
        console.log("🔄 Desactivando equipo ID:", window.currentEquipoId);
        
        const response = await fetch(`${API_BASE_URL}/equipos/${window.currentEquipoId}/estado/Inactivo`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("token")}`,
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || "Error al desactivar el equipo");
        }
        
        const resultado = await response.json();
        console.log("✅ Equipo desactivado exitosamente:", resultado);
        
        mostrarNotificacion("exito", "Equipo desactivado correctamente");
        aplicarEstadoLocalEquipo(window.currentEquipoId, "Inactivo");

    } catch (error) {
        console.error("❌ Error al desactivar equipo:", error);
        mostrarNotificacion("error", error.message);
    }
}

/**
 * Activa el equipo cambiando su estado a "Operativo"
 */
async function activateTechnicalSheet() {
    if (esRolTecnico()) {
        mostrarNotificacion("error", "El rol Técnico no puede reactivar equipos.");
        return;
    }
    if (!window.currentEquipoId) {
        mostrarNotificacion("error", "No hay equipo seleccionado");
        return;
    }

    const confirmar = await solicitarConfirmacion({
        titulo: 'Activar Equipo',
        mensaje: '¿Está seguro de que desea activar este equipo? Se marcará como Operativo en el sistema y estará disponible para programación de mantenimientos.',
        textoAceptar: 'Activar',
        esPeligroso: false
    });

    if (!confirmar) return;

    try {
        console.log("🔄 Activando equipo ID:", window.currentEquipoId);
        
        const response = await fetch(`${API_BASE_URL}/equipos/${window.currentEquipoId}/estado/Operativo`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("token")}`,
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || "Error al activar el equipo");
        }
        
        const resultado = await response.json();
        console.log("✅ Equipo activado exitosamente:", resultado);
        
        mostrarNotificacion("exito", "Equipo activado correctamente");
        aplicarEstadoLocalEquipo(window.currentEquipoId, "Operativo");

    } catch (error) {
        console.error("❌ Error al activar equipo:", error);
        mostrarNotificacion("error", error.message);
    }
}

/**
 * Devuelve los espacios que cumplen de forma acumulativa los filtros activos.
 * La búsqueda cubre nombre/código del espacio y código/serie de sus equipos.
 * @returns {Array}
 */
function obtenerEspaciosFiltrados() {
    const selectBloque = document.getElementById("assetBlockFilter");
    const selectPiso = document.getElementById("filterPiso");
    const inputBusqueda = document.getElementById("assetAulaFilter");

    const bloqueId = selectBloque && selectBloque.value ? String(selectBloque.value) : "";
    const piso = selectPiso && selectPiso.value ? String(selectPiso.value) : "";
    const texto = normalizarTexto(inputBusqueda ? inputBusqueda.value : "");

    return espaciosCatalogGlobal.filter((espacio) => {
        if (bloqueId && String(espacio.bloque_id) !== bloqueId) return false;

        if (piso) {
            const pisoEspacio = obtenerPisoEspacio(espacio);
            if (pisoEspacio == null || String(pisoEspacio) !== piso) return false;
        }

        if (texto) {
            const equipos = equiposPorEspacioGlobal.get(String(espacio.id)) || [];
            const campos = [
                espacio.nombre,
                espacio.codigo_espacio,
                ...equipos.flatMap((equipo) => [equipo.codigo_activo, equipo.numero_serie]),
            ].map(normalizarTexto);
            if (!campos.some((campo) => campo.includes(texto))) return false;
        }

        return true;
    });
}

/**
 * Recalcula la lista visible con los filtros activos y vuelve al nivel 1.
 */
function aplicarFiltrosInventario() {
    espaciosVisiblesGlobal = obtenerEspaciosFiltrados();
    espacioSeleccionadoId = null;
    paginaActual = 1;
    mostrarVistaEspacios();
    renderizarEspaciosPaginado();
}

/**
 * Programa la actualización de la matriz tras 150 ms sin tecleo.
 */
function programarFiltroBusqueda() {
    if (temporizadorBusqueda) clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(() => {
        temporizadorBusqueda = null;
        aplicarFiltrosInventario();
    }, 150);
}

/**
 * Limpia los filtros y vuelve al inventario completo agrupado por piso
 */
function limpiarFiltrosInventario() {
    const selectBloque = document.getElementById("assetBlockFilter");
    const selectPiso = document.getElementById("filterPiso");
    const inputBusqueda = document.getElementById("assetAulaFilter");

    if (selectBloque) selectBloque.value = "";

    if (selectPiso) {
        selectPiso.innerHTML = '<option value="">Todos los pisos</option>';
        selectPiso.disabled = true;
    }

    if (inputBusqueda) inputBusqueda.value = "";

    if (temporizadorBusqueda) {
        clearTimeout(temporizadorBusqueda);
        temporizadorBusqueda = null;
    }

    paginaActual = 1;
    if (espaciosCatalogGlobal.length) {
        aplicarFiltrosInventario();
    } else {
        cargarInventarioCompleto();
    }
}

async function cargarFiltrosInventario() {
    try {
        const bloquesRes = await fetch(`${API_BASE_URL}/bloques/?limit=100`);
        if (bloquesRes.ok) {
            const bloquesData = await bloquesRes.json();
            bloquesCatalogGlobal = Array.isArray(bloquesData) ? bloquesData : (bloquesData.items || []);
            const selectBloque = document.getElementById("assetBlockFilter");
            if (selectBloque) {
                const bloqueSeleccionado = selectBloque.value;
                selectBloque.innerHTML = '<option value="">Todos los bloques</option>';
                bloquesCatalogGlobal.forEach(bloque => {
                    const option = document.createElement("option");
                    option.value = bloque.id;
                    option.textContent = bloque.nombre_bloque || bloque.codigo_bloque;
                    selectBloque.appendChild(option);
                });
                if (bloqueSeleccionado) selectBloque.value = bloqueSeleccionado;
            }
        }
    } catch (err) {
        console.error("Error al cargar bloques del inventario:", err);
    }

    if (!espaciosCatalogGlobal.length) {
        try {
            espaciosCatalogGlobal = await obtenerTodosLosEspacios();
        } catch (err) {
            console.error("Error al cargar espacios del inventario:", err);
        }
    }
}

/**
 * Recalcula los pisos disponibles según el bloque seleccionado.
 * @param {string} bloqueId - ID del bloque seleccionado
 */
function poblarPisosPorBloque(bloqueId) {
    const selectPiso = document.getElementById("filterPiso");
    const inputBusqueda = document.getElementById("assetAulaFilter");

    if (!selectPiso) return;

    selectPiso.innerHTML = '<option value="">Todos los pisos</option>';
    selectPiso.disabled = true;

    if (inputBusqueda) inputBusqueda.value = "";

    if (bloqueId) {
        const espaciosDelBloque = espaciosCatalogGlobal.filter(e => String(e.bloque_id) === String(bloqueId));
        const pisosUnicos = [...new Set(espaciosDelBloque.map(e => Number(e.piso)))]
            .filter(n => Number.isInteger(n) && n >= PISO_MIN && n <= PISO_MAX)
            .sort((a, b) => a - b);

        pisosUnicos.forEach(piso => {
            const option = document.createElement("option");
            option.value = piso;
            option.textContent = `Piso ${piso}`;
            selectPiso.appendChild(option);
        });

        selectPiso.disabled = pisosUnicos.length === 0;
    }

    aplicarFiltrosInventario();
}

/**
 * Cierra el modal de Hoja de Vida Técnica
 */
function closeTechnicalSheetModal() {
    const modal = document.getElementById("modal-hoja-vida");
    if (modal) {
        modal.classList.add("hidden");
        modal.style.display = 'none';
        document.body.classList.remove('overflow-hidden');
        window.currentEquipoId = null;
        window.currentEquipoCodigoActivo = null;
        console.log("✅ Modal de Hoja de Vida Técnica cerrado");
    }
}

// ========================================
// NOTIFICACIONES Y UTILIDADES API
// ========================================

/**
 * Muestra una notificación toast al administrador
 * @param {'exito'|'error'} tipo - Tipo de notificación
 * @param {string} mensaje - Mensaje a mostrar
 */
function mostrarNotificacion(tipo, mensaje) {
    let container = document.getElementById("notificaciones-toast");
    if (!container) {
        container = document.createElement("div");
        container.id = "notificaciones-toast";
        container.className = "fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    const esExito = tipo === "exito";
    toast.className = `px-5 py-4 rounded-xl shadow-lg border text-sm font-semibold flex items-start gap-3 ${
        esExito
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-red-50 border-red-200 text-red-800"
    }`;
    toast.innerHTML = `
        <i class="fas ${esExito ? "fa-check-circle" : "fa-exclamation-circle"} mt-0.5"></i>
        <span>${mensaje}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("opacity-0", "transition-opacity", "duration-500");
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

/**
 * Extrae el mensaje de error de una respuesta FastAPI
 * @param {object} errorData - JSON de error
 * @returns {string}
 */
function extraerMensajeError(errorData) {
    if (!errorData || !errorData.detail) return "Error en la operación";
    if (typeof errorData.detail === "string") return errorData.detail;
    if (Array.isArray(errorData.detail)) {
        return errorData.detail.map(e => e.msg || JSON.stringify(e)).join(". ");
    }
    return JSON.stringify(errorData.detail);
}

// ========================================
// GESTIÓN DE MARCAS (CRUD)
// ========================================

const CLASE_FILA_GESTION = "bg-slate-50 rounded-xl px-4 py-2.5 mb-2 flex justify-between items-center text-sm hover:bg-slate-100/90 transition-colors duration-200";
const CLASE_BTN_EDITAR_GESTION = "p-2 rounded-lg text-slate-400 hover:text-uccLight transition-colors";
const CLASE_BTN_ELIMINAR_GESTION = "p-2 rounded-lg text-slate-400 hover:text-red-500 transition-colors";
const CLASE_INPUT_INLINE_GESTION = "flex-1 border border-slate-200 hover:border-slate-300 focus:border-uccLight focus:ring-2 focus:ring-cyan-100 transition-all rounded-xl px-4 py-2.5 text-slate-800 bg-white text-sm font-medium";

function openGestionMarcasModal() {
    if (esRolTecnico()) {
        mostrarNotificacion("error", "El rol Técnico no puede gestionar marcas.");
        return;
    }
    const modal = document.getElementById("modal-gestion-marcas");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    renderizarListaMarcas();
}

function closeGestionMarcasModal() {
    const modal = document.getElementById("modal-gestion-marcas");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    const input = document.getElementById("input-nueva-marca");
    if (input) input.value = "";
}

async function renderizarListaMarcas() {
    const lista = document.getElementById("lista-marcas-gestion");
    if (!lista) return;

    lista.innerHTML = '<p class="text-xs text-slate-400 text-center py-6"><i class="fas fa-spinner fa-spin mr-1"></i> Cargando...</p>';

    try {
        const response = await fetch(`${API_BASE_URL}/marcas/?limit=100`);
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));
        const marcas = await response.json();

        if (!marcas.length) {
            lista.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">No hay marcas registradas</p>';
            return;
        }

        lista.innerHTML = "";
        marcas.forEach(marca => {
            const fila = document.createElement("div");
            fila.id = `marca-row-${marca.id}`;
            fila.className = CLASE_FILA_GESTION;
            fila.innerHTML = `
                <span class="font-semibold text-slate-800 truncate marca-nombre-display flex-1 min-w-0 pr-2">${marca.nombre}</span>
                <div class="flex items-center gap-0.5 shrink-0">
                    <button type="button" onclick="activarEdicionMarca(${marca.id})" class="${CLASE_BTN_EDITAR_GESTION}" title="Editar">
                        <i class="fas fa-pen text-xs"></i>
                    </button>
                    <button type="button" onclick="eliminarMarca(${marca.id})" class="${CLASE_BTN_ELIMINAR_GESTION}" title="Eliminar">
                        <i class="fas fa-trash text-xs"></i>
                    </button>
                </div>
            `;
            lista.appendChild(fila);
        });
    } catch (error) {
        lista.innerHTML = `<p class="text-xs text-red-500 text-center py-6">${error.message}</p>`;
        mostrarNotificacion("error", error.message);
    }
}

async function submitCrearMarca() {
    const input = document.getElementById("input-nueva-marca");
    const nombre = input?.value.trim();
    if (!nombre) {
        mostrarNotificacion("error", "Ingresa el nombre de la marca");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/marcas/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nombre })
        });
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));

        input.value = "";
        mostrarNotificacion("exito", `Marca "${nombre}" registrada correctamente`);
        await renderizarListaMarcas();
        cargarSelectoresFormularios();
    } catch (error) {
        mostrarNotificacion("error", error.message);
    }
}

function activarEdicionMarca(id) {
    const fila = document.getElementById(`marca-row-${id}`);
    if (!fila) return;

    const nombreActual = fila.querySelector(".marca-nombre-display")?.textContent?.trim() || "";

    fila.className = `${CLASE_FILA_GESTION} bg-white ring-2 ring-cyan-100 border border-uccLight/30`;
    fila.innerHTML = `
        <input type="text" id="edit-marca-${id}" value="${nombreActual.replace(/"/g, "&quot;")}" maxlength="20"
            class="${CLASE_INPUT_INLINE_GESTION}">
        <div class="flex items-center gap-1 shrink-0">
            <button type="button" onclick="guardarEdicionMarca(${id})" class="p-2.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors duration-200" title="Guardar">
                <i class="fas fa-check"></i>
            </button>
            <button type="button" onclick="renderizarListaMarcas()" class="p-2.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-colors duration-200" title="Cancelar">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    document.getElementById(`edit-marca-${id}`)?.focus();
}

async function guardarEdicionMarca(id) {
    const input = document.getElementById(`edit-marca-${id}`);
    const nombre = input?.value.trim();
    if (!nombre) {
        mostrarNotificacion("error", "El nombre no puede estar vacío");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/marcas/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nombre })
        });
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));

        mostrarNotificacion("exito", "Marca actualizada correctamente");
        await renderizarListaMarcas();
        cargarSelectoresFormularios();
    } catch (error) {
        mostrarNotificacion("error", error.message);
    }
}

async function eliminarMarca(id) {
    const confirmar = await solicitarConfirmacion({
        titulo: 'Eliminar Marca',
        mensaje: '¿Está seguro de que desea eliminar esta marca del catálogo? Esta acción no se puede deshacer.',
        textoAceptar: 'Eliminar',
        esPeligroso: true
    });

    if (!confirmar) return;

    try {
        const response = await fetch(`${API_BASE_URL}/marcas/${id}`, { method: "DELETE" });
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));

        mostrarNotificacion("exito", "Marca eliminada correctamente");
        await renderizarListaMarcas();
        cargarSelectoresFormularios();
    } catch (error) {
        mostrarNotificacion("error", error.message);
    }
}

// ========================================
// GESTIÓN DE ESPACIOS (CRUD)
// ========================================

async function cargarBloquesGestionEspacios() {
    const select = document.getElementById("select-gestion-espacio-bloque");
    if (!select) return;

    try {
        const response = await fetch(`${API_BASE_URL}/bloques/?limit=100`);
        if (!response.ok) return;
        const data = await response.json();
        const bloques = Array.isArray(data) ? data : (data.items || []);
        select.innerHTML = '<option value="">Selecciona bloque</option>';
        bloques.forEach(bloque => {
            const option = document.createElement("option");
            option.value = bloque.id;
            option.textContent = bloque.nombre_bloque || bloque.codigo_bloque;
            select.appendChild(option);
        });
        if (bloques.length > 0) select.value = bloques[0].id;
    } catch (err) {
        console.error("Error al cargar bloques para gestión:", err);
    }
}

function openGestionEspaciosModal() {
    if (esRolTecnico()) {
        mostrarNotificacion("error", "El rol Técnico no puede gestionar espacios.");
        return;
    }
    const modal = document.getElementById("modal-gestion-espacios");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    cargarBloquesGestionEspacios();
    cargarSelectoresFormularios();
    renderizarListaEspacios();
}

function closeGestionEspaciosModal() {
    const modal = document.getElementById("modal-gestion-espacios");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    const inputCodigo = document.getElementById("input-nuevo-espacio-codigo");
    const inputNombre = document.getElementById("input-nuevo-espacio-nombre");
    if (inputCodigo) inputCodigo.value = "";
    if (inputNombre) inputNombre.value = "";
}

async function renderizarListaEspacios() {
    const lista = document.getElementById("lista-espacios-gestion");
    if (!lista) return;

    lista.innerHTML = '<p class="text-xs text-slate-400 text-center py-6"><i class="fas fa-spinner fa-spin mr-1"></i> Cargando...</p>';

    try {
        const response = await fetch(`${API_BASE_URL}/espacios/?limit=100`);
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));
        const data = await response.json();
        const espacios = Array.isArray(data) ? data : (data.items || []);

        if (!espacios.length) {
            lista.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">No hay espacios registrados</p>';
            return;
        }

        lista.innerHTML = "";
        espacios.forEach(espacio => {
            const pisoLabel = espacio.piso != null ? ` · Piso ${espacio.piso}` : "";
            const fila = document.createElement("div");
            fila.id = `espacio-row-${espacio.id}`;
            fila.className = CLASE_FILA_GESTION;
            fila.innerHTML = `
                <div class="min-w-0 flex-1 pr-2">
                    <span class="espacio-codigo-display text-uccLight font-bold text-xs uppercase tracking-wide">${espacio.codigo_espacio}</span>
                    <span class="text-slate-400 text-xs">${pisoLabel}</span>
                    <p class="espacio-nombre-display font-semibold text-slate-800 truncate">${espacio.nombre}</p>
                </div>
                <div class="flex items-center gap-0.5 shrink-0">
                    <button type="button" onclick="activarEdicionEspacio(${espacio.id})" class="${CLASE_BTN_EDITAR_GESTION}" title="Editar">
                        <i class="fas fa-pen text-xs"></i>
                    </button>
                    <button type="button" onclick="eliminarEspacio(${espacio.id})" class="${CLASE_BTN_ELIMINAR_GESTION}" title="Eliminar">
                        <i class="fas fa-trash text-xs"></i>
                    </button>
                </div>
            `;
            lista.appendChild(fila);
        });
    } catch (error) {
        lista.innerHTML = `<p class="text-xs text-red-500 text-center py-6">${error.message}</p>`;
        mostrarNotificacion("error", error.message);
    }
}

async function submitCrearEspacioGestion() {
    const codigo = document.getElementById("input-nuevo-espacio-codigo")?.value.trim();
    const nombre = document.getElementById("input-nuevo-espacio-nombre")?.value.trim();
    const piso = parseInt(document.getElementById("input-nuevo-espacio-piso")?.value, 10) || 1;
    const bloqueId = parseInt(document.getElementById("select-gestion-espacio-bloque")?.value, 10);

    if (!codigo || !nombre || isNaN(bloqueId)) {
        mostrarNotificacion("error", "Completa código, nombre y bloque");
        return;
    }

    const errorReglaGestion = validarEspacioLocal(nombre, codigo, piso);
    if (errorReglaGestion) {
        mostrarNotificacion("error", errorReglaGestion);
        return;
    }

    const payload = {
        codigo_espacio: codigo,
        nombre,
        piso,
        bloque_id: bloqueId
    };

    try {
        const response = await fetch(`${API_BASE_URL}/espacios/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));

        document.getElementById("input-nuevo-espacio-codigo").value = "";
        document.getElementById("input-nuevo-espacio-nombre").value = "";
        mostrarNotificacion("exito", `Espacio "${nombre}" registrado correctamente`);
        await renderizarListaEspacios();
        cargarSelectoresFormularios();
    } catch (error) {
        mostrarNotificacion("error", error.message);
    }
}

function activarEdicionEspacio(id) {
    const fila = document.getElementById(`espacio-row-${id}`);
    if (!fila) return;

    const codigoActual = fila.querySelector(".espacio-codigo-display")?.textContent?.trim() || "";
    const nombreActual = fila.querySelector(".espacio-nombre-display")?.textContent?.trim() || "";

    fila.className = `${CLASE_FILA_GESTION} flex-col sm:flex-row sm:items-center bg-white ring-2 ring-cyan-100 border border-uccLight/30 gap-3`;
    fila.innerHTML = `
        <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
            <input type="text" id="edit-espacio-codigo-${id}" value="${codigoActual.replace(/"/g, "&quot;")}" maxlength="20"
                placeholder="Código" class="${CLASE_INPUT_INLINE_GESTION} text-xs font-bold">
            <input type="text" id="edit-espacio-nombre-${id}" value="${nombreActual.replace(/"/g, "&quot;")}" maxlength="65"
                placeholder="Nombre" class="${CLASE_INPUT_INLINE_GESTION}">
        </div>
        <div class="flex items-center gap-1 shrink-0 self-end sm:self-center">
            <button type="button" onclick="guardarEdicionEspacio(${id})" class="p-2.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors duration-200" title="Guardar">
                <i class="fas fa-check"></i>
            </button>
            <button type="button" onclick="renderizarListaEspacios()" class="p-2.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-colors duration-200" title="Cancelar">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
}

async function guardarEdicionEspacio(id) {
    const codigo = document.getElementById(`edit-espacio-codigo-${id}`)?.value.trim();
    const nombre = document.getElementById(`edit-espacio-nombre-${id}`)?.value.trim();

    if (!codigo || !nombre) {
        mostrarNotificacion("error", "Código y nombre son obligatorios");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/espacios/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ codigo_espacio: codigo, nombre })
        });
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));

        mostrarNotificacion("exito", "Espacio actualizado correctamente");
        await renderizarListaEspacios();
        cargarSelectoresFormularios();
    } catch (error) {
        mostrarNotificacion("error", error.message);
    }
}

async function eliminarEspacio(id) {
    const confirmar = await solicitarConfirmacion({
        titulo: 'Eliminar Espacio',
        mensaje: '¿Está seguro de que desea eliminar este espacio del catálogo? Esta acción no se puede deshacer.',
        textoAceptar: 'Eliminar',
        esPeligroso: true
    });

    if (!confirmar) return;

    try {
        const response = await fetch(`${API_BASE_URL}/espacios/${id}`, { method: "DELETE" });
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));

        mostrarNotificacion("exito", "Espacio eliminado correctamente");
        await renderizarListaEspacios();
        cargarSelectoresFormularios();
        cargarFiltrosInventario();
    } catch (error) {
        mostrarNotificacion("error", error.message);
    }
}

// ========================================
// GESTIÓN DE BLOQUES (CRUD)
// ========================================

function openGestionBloquesModal() {
    const modal = document.getElementById("modal-gestion-bloques");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    renderizarListaBloques();
}

function closeGestionBloquesModal() {
    const modal = document.getElementById("modal-gestion-bloques");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    const codigo = document.getElementById("input-nuevo-bloque-codigo");
    const nombre = document.getElementById("input-nuevo-bloque-nombre");
    if (codigo) codigo.value = "";
    if (nombre) nombre.value = "";
}

async function renderizarListaBloques() {
    const lista = document.getElementById("lista-bloques-gestion");
    if (!lista) return;

    lista.innerHTML = '<p class="text-xs text-slate-400 text-center py-6"><i class="fas fa-spinner fa-spin mr-1"></i> Cargando...</p>';

    try {
        const response = await fetch(`${API_BASE_URL}/bloques/?limit=100`);
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));
        const data = await response.json();
        const bloques = Array.isArray(data) ? data : (data.items || []);

        if (!bloques.length) {
            lista.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">No hay bloques registrados</p>';
            return;
        }

        lista.innerHTML = "";
        bloques.forEach(bloque => {
            const fila = document.createElement("div");
            fila.id = `bloque-row-${bloque.id}`;
            fila.className = CLASE_FILA_GESTION;
            fila.innerHTML = `
                <div class="min-w-0 flex-1 pr-2">
                    <span class="bloque-codigo-display text-uccLight font-bold text-xs uppercase tracking-wide">${bloque.codigo_bloque}</span>
                    <p class="bloque-nombre-display font-semibold text-slate-800 truncate">${bloque.nombre_bloque}</p>
                </div>
                <div class="flex items-center gap-0.5 shrink-0">
                    <button type="button" onclick="activarEdicionBloque(${bloque.id})" class="${CLASE_BTN_EDITAR_GESTION}" title="Editar">
                        <i class="fas fa-pen text-xs"></i>
                    </button>
                    <button type="button" onclick="eliminarBloque(${bloque.id})" class="${CLASE_BTN_ELIMINAR_GESTION}" title="Eliminar">
                        <i class="fas fa-trash text-xs"></i>
                    </button>
                </div>`;
            lista.appendChild(fila);
        });
    } catch (error) {
        lista.innerHTML = `<p class="text-xs text-red-500 text-center py-6">${error.message}</p>`;
        mostrarNotificacion("error", error.message);
    }
}

async function submitCrearBloque() {
    const codigo = document.getElementById("input-nuevo-bloque-codigo")?.value.trim();
    const nombre = document.getElementById("input-nuevo-bloque-nombre")?.value.trim();
    if (!codigo || !nombre) {
        mostrarNotificacion("error", "Ingresa código y nombre del bloque");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/bloques/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ codigo_bloque: codigo, nombre_bloque: nombre }),
        });
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));

        document.getElementById("input-nuevo-bloque-codigo").value = "";
        document.getElementById("input-nuevo-bloque-nombre").value = "";
        mostrarNotificacion("exito", `Bloque "${nombre}" registrado correctamente`);
        await renderizarListaBloques();
        await cargarBloquesGestionEspacios();
        cargarSelectoresFormularios();
        cargarFiltrosInventario();
    } catch (error) {
        mostrarNotificacion("error", error.message);
    }
}

function activarEdicionBloque(id) {
    const fila = document.getElementById(`bloque-row-${id}`);
    if (!fila) return;

    const nombreActual = fila.querySelector(".bloque-nombre-display")?.textContent?.trim() || "";
    const codigoActual = fila.querySelector(".bloque-codigo-display")?.textContent?.trim() || "";

    fila.className = `${CLASE_FILA_GESTION} flex-col sm:flex-row sm:items-center bg-white ring-2 ring-cyan-100 border border-uccLight/30 gap-3`;
    fila.innerHTML = `
        <div class="flex-1 min-w-0">
            <span class="text-xs text-slate-400 font-bold uppercase">${codigoActual}</span>
            <input type="text" id="edit-bloque-nombre-${id}" value="${nombreActual.replace(/"/g, "&quot;")}" maxlength="65"
                class="${CLASE_INPUT_INLINE_GESTION} mt-1">
        </div>
        <div class="flex items-center gap-1 shrink-0 self-end sm:self-center">
            <button type="button" onclick="guardarEdicionBloque(${id})" class="p-2.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors duration-200" title="Guardar">
                <i class="fas fa-check"></i>
            </button>
            <button type="button" onclick="renderizarListaBloques()" class="p-2.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-colors duration-200" title="Cancelar">
                <i class="fas fa-times"></i>
            </button>
        </div>`;
}

async function guardarEdicionBloque(id) {
    const nombre = document.getElementById(`edit-bloque-nombre-${id}`)?.value.trim();
    if (!nombre) {
        mostrarNotificacion("error", "El nombre no puede estar vacío");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/bloques/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nombre_bloque: nombre }),
        });
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));

        mostrarNotificacion("exito", "Bloque actualizado correctamente");
        await renderizarListaBloques();
        await cargarBloquesGestionEspacios();
        cargarSelectoresFormularios();
        cargarFiltrosInventario();
    } catch (error) {
        mostrarNotificacion("error", error.message);
    }
}

async function eliminarBloque(id) {
    const confirmar = await solicitarConfirmacion({
        titulo: 'Eliminar Bloque',
        mensaje: '¿Está seguro de que desea eliminar este bloque del catálogo? Esta acción no se puede deshacer.',
        textoAceptar: 'Eliminar',
        esPeligroso: true
    });

    if (!confirmar) return;

    try {
        const response = await fetch(`${API_BASE_URL}/bloques/${id}`, { method: "DELETE" });
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));

        mostrarNotificacion("exito", "Bloque eliminado correctamente");
        await renderizarListaBloques();
        await cargarBloquesGestionEspacios();
        cargarSelectoresFormularios();
        cargarFiltrosInventario();
    } catch (error) {
        mostrarNotificacion("error", error.message);
    }
}

// ========================================
// GESTIÓN DE TIPOS DE EQUIPO (CRUD — superusuario)
// ========================================

function esSuperusuarioInventario() {
    const rol = (localStorage.getItem("rol") || localStorage.getItem("userRole") || "").toLowerCase();
    return rol.includes("jefe de infraestructura");
}

function esGestorCatalogoInsumos() {
    const rol = (localStorage.getItem("rol") || localStorage.getItem("userRole") || "").toLowerCase();
    return rol.includes("jefe de infraestructura") || rol.includes("auxiliar de infraestructura");
}

function aplicarVisibilidadGestionTiposEquipo() {
    const esSuper = esSuperusuarioInventario();
    const puedeGestionarInsumos = esGestorCatalogoInsumos();
    const btnTipos = document.getElementById("btn-gestion-tipos-equipo");
    const btnRefrig = document.getElementById("btn-gestion-refrigerantes");
    const btnComponentes = document.getElementById("btn-gestion-tipos-componente");
    if (btnTipos) btnTipos.classList.toggle("hidden", !esSuper);
    if (btnRefrig) btnRefrig.classList.toggle("hidden", !esSuper);
    if (btnComponentes) btnComponentes.classList.toggle("hidden", !puedeGestionarInsumos);
}

function openGestionTiposEquipoModal() {
    if (!esSuperusuarioInventario()) {
        mostrarNotificacion("error", "Solo el superusuario puede gestionar tipos de equipo.");
        return;
    }
    const modal = document.getElementById("modal-gestion-tipos-equipo");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    renderizarListaTiposEquipo();
}

function closeGestionTiposEquipoModal() {
    const modal = document.getElementById("modal-gestion-tipos-equipo");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    const input = document.getElementById("input-nuevo-tipo-equipo");
    if (input) input.value = "";
}

async function renderizarListaTiposEquipo() {
    const lista = document.getElementById("lista-tipos-equipo-gestion");
    if (!lista) return;

    lista.innerHTML = '<p class="text-xs text-slate-400 text-center py-6"><i class="fas fa-spinner fa-spin mr-1"></i> Cargando...</p>';

    try {
        const response = await fetch(`${API_BASE_URL}/tipos-equipo/`);
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));
        const tipos = await response.json();

        if (!tipos.length) {
            lista.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">No hay tipos de equipo registrados</p>';
            return;
        }

        lista.innerHTML = "";
        tipos.forEach((tipo) => {
            const fila = document.createElement("div");
            fila.id = `tipo-equipo-row-${tipo.id}`;
            fila.className = CLASE_FILA_GESTION;
            fila.innerHTML = `
                <span class="font-semibold text-slate-800 truncate tipo-equipo-nombre-display flex-1 min-w-0 pr-2">${tipo.nombre}</span>
                <div class="flex items-center gap-0.5 shrink-0">
                    <button type="button" onclick="activarEdicionTipoEquipo(${tipo.id})" class="${CLASE_BTN_EDITAR_GESTION}" title="Editar">
                        <i class="fas fa-pen text-xs"></i>
                    </button>
                    <button type="button" onclick="eliminarTipoEquipo(${tipo.id})" class="${CLASE_BTN_ELIMINAR_GESTION}" title="Eliminar">
                        <i class="fas fa-trash text-xs"></i>
                    </button>
                </div>`;
            lista.appendChild(fila);
        });
    } catch (error) {
        lista.innerHTML = `<p class="text-xs text-red-500 text-center py-6">${error.message}</p>`;
        mostrarNotificacion("error", error.message);
    }
}

async function submitCrearTipoEquipo() {
    const input = document.getElementById("input-nuevo-tipo-equipo");
    const nombre = input?.value.trim();
    if (!nombre) {
        mostrarNotificacion("error", "Ingresa el nombre del tipo de equipo");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/tipos-equipo/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify({ nombre }),
        });
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));

        input.value = "";
        mostrarNotificacion("exito", `Tipo de equipo "${nombre}" registrado`);
        await renderizarListaTiposEquipo();
        cargarSelectoresFormularios();
    } catch (error) {
        mostrarNotificacion("error", error.message);
    }
}

function activarEdicionTipoEquipo(id) {
    const fila = document.getElementById(`tipo-equipo-row-${id}`);
    if (!fila) return;
    const nombreActual = fila.querySelector(".tipo-equipo-nombre-display")?.textContent?.trim() || "";

    fila.className = `${CLASE_FILA_GESTION} bg-white ring-2 ring-cyan-100 border border-uccLight/30`;
    fila.innerHTML = `
        <input type="text" id="edit-tipo-equipo-${id}" value="${nombreActual.replace(/"/g, "&quot;")}" maxlength="30"
            class="${CLASE_INPUT_INLINE_GESTION}">
        <div class="flex items-center gap-1 shrink-0">
            <button type="button" onclick="guardarEdicionTipoEquipo(${id})" class="p-2.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors duration-200" title="Guardar">
                <i class="fas fa-check"></i>
            </button>
            <button type="button" onclick="renderizarListaTiposEquipo()" class="p-2.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-colors duration-200" title="Cancelar">
                <i class="fas fa-times"></i>
            </button>
        </div>`;
    document.getElementById(`edit-tipo-equipo-${id}`)?.focus();
}

async function guardarEdicionTipoEquipo(id) {
    const input = document.getElementById(`edit-tipo-equipo-${id}`);
    const nombre = input?.value.trim();
    if (!nombre) {
        mostrarNotificacion("error", "El nombre no puede estar vacío");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/tipos-equipo/${id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify({ nombre }),
        });
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));

        mostrarNotificacion("exito", "Tipo de equipo actualizado");
        await renderizarListaTiposEquipo();
        cargarSelectoresFormularios();
    } catch (error) {
        mostrarNotificacion("error", error.message);
    }
}

async function eliminarTipoEquipo(id) {
    const confirmar = await solicitarConfirmacion({
        titulo: 'Eliminar Tipo de Equipo',
        mensaje: '¿Está seguro de que desea eliminar este tipo de equipo del catálogo? Esta acción no se puede deshacer.',
        textoAceptar: 'Eliminar',
        esPeligroso: true
    });

    if (!confirmar) return;

    try {
        const response = await fetch(`${API_BASE_URL}/tipos-equipo/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));

        mostrarNotificacion("exito", "Tipo de equipo eliminado");
        await renderizarListaTiposEquipo();
        cargarSelectoresFormularios();
    } catch (error) {
        mostrarNotificacion("error", error.message);
    }
}

// ========================================
// GESTIÓN DE REFRIGERANTES (CRUD — superusuario)
// ========================================

function openGestionRefrigerantesModal() {
    if (!esSuperusuarioInventario()) {
        mostrarNotificacion("error", "Solo el superusuario puede gestionar tipos de refrigerante.");
        return;
    }
    const modal = document.getElementById("modal-gestion-refrigerantes");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    renderizarListaRefrigerantes();
}

function closeGestionRefrigerantesModal() {
    const modal = document.getElementById("modal-gestion-refrigerantes");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    const input = document.getElementById("input-nuevo-refrigerante");
    if (input) input.value = "";
}

async function renderizarListaRefrigerantes() {
    const lista = document.getElementById("lista-refrigerantes-gestion");
    if (!lista) return;

    lista.innerHTML = '<p class="text-xs text-slate-400 text-center py-6"><i class="fas fa-spinner fa-spin mr-1"></i> Cargando...</p>';

    try {
        const response = await fetch(`${API_BASE_URL}/tipos-gas-refrigerante/`);
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));
        const refrigerantes = await response.json();

        if (!refrigerantes.length) {
            lista.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">No hay refrigerantes registrados</p>';
            return;
        }

        lista.innerHTML = "";
        refrigerantes.forEach(ref => {
            const fila = document.createElement("div");
            fila.id = `refrigerante-row-${ref.id}`;
            fila.className = CLASE_FILA_GESTION;
            fila.innerHTML = `
                <span class="font-semibold text-slate-800 truncate refrigerante-nombre-display flex-1 min-w-0 pr-2">${ref.nombre}</span>
                <div class="flex items-center gap-0.5 shrink-0">
                    <button type="button" onclick="activarEdicionRefrigerante(${ref.id})" class="${CLASE_BTN_EDITAR_GESTION}" title="Editar">
                        <i class="fas fa-pen text-xs"></i>
                    </button>
                    <button type="button" onclick="eliminarRefrigerante(${ref.id})" class="${CLASE_BTN_ELIMINAR_GESTION}" title="Eliminar">
                        <i class="fas fa-trash text-xs"></i>
                    </button>
                </div>`;
            lista.appendChild(fila);
        });
    } catch (error) {
        lista.innerHTML = `<p class="text-xs text-red-500 text-center py-6">${error.message}</p>`;
        mostrarNotificacion("error", error.message);
    }
}

async function submitCrearRefrigerante() {
    const input = document.getElementById("input-nuevo-refrigerante");
    const nombre = input?.value.trim();
    if (!nombre) {
        mostrarNotificacion("error", "Ingresa el nombre del refrigerante");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/tipos-gas-refrigerante/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify({ nombre }),
        });
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));

        input.value = "";
        mostrarNotificacion("exito", `Refrigerante "${nombre}" registrado`);
        await renderizarListaRefrigerantes();
        cargarSelectoresFormularios();
    } catch (error) {
        mostrarNotificacion("error", error.message);
    }
}

function activarEdicionRefrigerante(id) {
    const fila = document.getElementById(`refrigerante-row-${id}`);
    if (!fila) return;
    const nombreActual = fila.querySelector(".refrigerante-nombre-display")?.textContent?.trim() || "";

    fila.className = `${CLASE_FILA_GESTION} bg-white ring-2 ring-cyan-100 border border-uccLight/30`;
    fila.innerHTML = `
        <input type="text" id="edit-refrigerante-${id}" value="${nombreActual.replace(/"/g, "&quot;")}" maxlength="20"
            class="${CLASE_INPUT_INLINE_GESTION}">
        <div class="flex items-center gap-1 shrink-0">
            <button type="button" onclick="guardarEdicionRefrigerante(${id})" class="p-2.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors duration-200" title="Guardar">
                <i class="fas fa-check"></i>
            </button>
            <button type="button" onclick="renderizarListaRefrigerantes()" class="p-2.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-colors duration-200" title="Cancelar">
                <i class="fas fa-times"></i>
            </button>
        </div>`;
    document.getElementById(`edit-refrigerante-${id}`)?.focus();
}

async function guardarEdicionRefrigerante(id) {
    const input = document.getElementById(`edit-refrigerante-${id}`);
    const nombre = input?.value.trim();
    if (!nombre) {
        mostrarNotificacion("error", "El nombre no puede estar vacío");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/tipos-gas-refrigerante/${id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify({ nombre }),
        });
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));

        mostrarNotificacion("exito", "Refrigerante actualizado");
        await renderizarListaRefrigerantes();
        cargarSelectoresFormularios();
    } catch (error) {
        mostrarNotificacion("error", error.message);
    }
}

async function eliminarRefrigerante(id) {
    const confirmar = await solicitarConfirmacion({
        titulo: 'Eliminar Refrigerante',
        mensaje: '¿Está seguro de que desea eliminar este refrigerante del catálogo? Esta acción no se puede deshacer.',
        textoAceptar: 'Eliminar',
        esPeligroso: true
    });

    if (!confirmar) return;

    try {
        const response = await fetch(`${API_BASE_URL}/tipos-gas-refrigerante/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));

        mostrarNotificacion("exito", "Refrigerante eliminado");
        await renderizarListaRefrigerantes();
        cargarSelectoresFormularios();
    } catch (error) {
        mostrarNotificacion("error", error.message);
    }
}

// ========================================
// GESTIÓN DE TIPOS DE COMPONENTES / INSUMOS (CRUD — superusuario)
// ========================================

function openGestionTiposComponenteModal() {
    if (!esGestorCatalogoInsumos()) {
        mostrarNotificacion("error", "Solo Jefe o Auxiliar de Infraestructura pueden gestionar el catálogo de insumos.");
        return;
    }
    const modal = document.getElementById("modal-gestion-tipos-componente");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    renderizarListaTiposComponente();
}

function closeGestionTiposComponenteModal() {
    const modal = document.getElementById("modal-gestion-tipos-componente");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    const input = document.getElementById("input-nuevo-tipo-componente");
    if (input) input.value = "";
}

async function renderizarListaTiposComponente() {
    const lista = document.getElementById("lista-tipos-componente-gestion");
    if (!lista) return;

    lista.innerHTML = '<p class="text-xs text-slate-400 text-center py-6"><i class="fas fa-spinner fa-spin mr-1"></i> Cargando...</p>';

    try {
        const response = await fetch(`${API_BASE_URL}/tipo_componentes/`, {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));
        const tipos = await response.json();

        if (!tipos.length) {
            lista.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">No hay tipos de insumos registrados</p>';
            return;
        }

        lista.innerHTML = "";
        tipos.forEach((tipo) => {
            const fila = document.createElement("div");
            fila.id = `tipo-componente-row-${tipo.id}`;
            fila.className = CLASE_FILA_GESTION;
            fila.innerHTML = `
                <span class="font-semibold text-slate-800 truncate tipo-componente-nombre-display flex-1 min-w-0 pr-2">${tipo.nombre}</span>
                <div class="flex items-center gap-0.5 shrink-0">
                    <button type="button" onclick="activarEdicionTipoComponente(${tipo.id})" class="${CLASE_BTN_EDITAR_GESTION}" title="Editar">
                        <i class="fas fa-pen text-xs"></i>
                    </button>
                    <button type="button" onclick="eliminarTipoComponente(${tipo.id})" class="${CLASE_BTN_ELIMINAR_GESTION}" title="Eliminar">
                        <i class="fas fa-trash text-xs"></i>
                    </button>
                </div>`;
            lista.appendChild(fila);
        });
    } catch (error) {
        lista.innerHTML = `<p class="text-xs text-red-500 text-center py-6">${error.message}</p>`;
        mostrarNotificacion("error", error.message);
    }
}

async function submitCrearTipoComponente() {
    const input = document.getElementById("input-nuevo-tipo-componente");
    const nombre = input?.value.trim();
    if (!nombre) {
        mostrarNotificacion("error", "Ingresa el nombre del insumo o componente");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/tipo_componentes/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify({ nombre }),
        });
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));

        input.value = "";
        mostrarNotificacion("exito", `Insumo "${nombre}" registrado`);
        await renderizarListaTiposComponente();
    } catch (error) {
        mostrarNotificacion("error", error.message);
    }
}

function activarEdicionTipoComponente(id) {
    const fila = document.getElementById(`tipo-componente-row-${id}`);
    if (!fila) return;

    const nombreActual = fila.querySelector(".tipo-componente-nombre-display")?.textContent?.trim() || "";

    fila.className = `${CLASE_FILA_GESTION} bg-white ring-2 ring-cyan-100 border border-uccLight/30`;
    fila.innerHTML = `
        <input type="text" id="edit-tipo-componente-nombre-${id}" value="${nombreActual.replace(/"/g, "&quot;")}" maxlength="60"
            class="${CLASE_INPUT_INLINE_GESTION} flex-1 min-w-0">
        <div class="flex items-center gap-0.5 shrink-0">
            <button type="button" onclick="guardarEdicionTipoComponente(${id})" class="p-2.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors duration-200" title="Guardar">
                <i class="fas fa-check"></i>
            </button>
            <button type="button" onclick="renderizarListaTiposComponente()" class="p-2.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-colors duration-200" title="Cancelar">
                <i class="fas fa-times"></i>
            </button>
        </div>`;
}

async function guardarEdicionTipoComponente(id) {
    const nombre = document.getElementById(`edit-tipo-componente-nombre-${id}`)?.value.trim();
    if (!nombre) {
        mostrarNotificacion("error", "El nombre no puede estar vacío");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/tipo_componentes/${id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify({ nombre }),
        });
        if (!response.ok) throw new Error(extraerMensajeError(await response.json()));

        mostrarNotificacion("exito", "Insumo actualizado");
        await renderizarListaTiposComponente();
    } catch (error) {
        mostrarNotificacion("error", error.message);
    }
}

async function eliminarTipoComponente(id) {
    const confirmar = await solicitarConfirmacion({
        titulo: 'Eliminar Insumo',
        mensaje: '¿Está seguro de que desea eliminar este insumo del catálogo? Esta acción no se puede deshacer.',
        textoAceptar: 'Eliminar',
        esPeligroso: true
    });

    if (!confirmar) return;

    try {
        const response = await fetch(`${API_BASE_URL}/tipo_componentes/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (!response.ok) {
            const payload = response.status === 204 ? null : await response.json();
            throw new Error(extraerMensajeError(payload));
        }

        mostrarNotificacion("exito", "Insumo eliminado");
        await renderizarListaTiposComponente();
    } catch (error) {
        mostrarNotificacion("error", error.message);
    }
}

/**
 * Se ejecuta cuando el DOM está completamente cargado
 */
document.addEventListener("DOMContentLoaded", () => {
    console.log("📋 Inicializando cargador de inventario...");
    aplicarVisibilidadGestionTiposEquipo();
    aplicarRestriccionesRol();
    cargarSelectoresFormularios();
    cargarFiltrosInventario();
    cargarInventarioCompleto();

    // Agregar event listener al formulario de crear equipo
    const formCrearActivo = document.getElementById("form-crear-activo");
    if (formCrearActivo) {
        formCrearActivo.addEventListener("submit", submitCrearActivoFormulario);
    }

    const formTraslado = document.getElementById("form-trasladar-equipo");
    if (formTraslado) {
        formTraslado.addEventListener("submit", submitTrasladoEquipo);
    }

    const selectCapacidad = document.getElementById("selectCapacidad");
    if (selectCapacidad) {
        selectCapacidad.addEventListener("change", () => {
            const inputTonelaje = document.getElementById("inputTonelaje");
            if (!inputTonelaje) return;
            inputTonelaje.value = capacidadATonelaje[selectCapacidad.value] ?? "";
        });
    }

    // Event listeners para filtros acumulativos
    const selectBloque = document.getElementById("assetBlockFilter");
    if (selectBloque) {
        selectBloque.addEventListener("change", () => {
            poblarPisosPorBloque(selectBloque.value);
        });
    }

    const selectPiso = document.getElementById("filterPiso");
    if (selectPiso) {
        selectPiso.addEventListener("change", () => {
            aplicarFiltrosInventario();
        });
    }

    const inputBusqueda = document.getElementById("assetAulaFilter");
    if (inputBusqueda) {
        inputBusqueda.addEventListener("input", programarFiltroBusqueda);
    }
});

