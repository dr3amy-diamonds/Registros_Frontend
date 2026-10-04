/**
 * Utilidades para renderizar observaciones de mantenimiento con estructura legible.
 */

function escaparHtmlObservacion(texto) {
    const div = document.createElement("div");
    div.textContent = texto ?? "";
    return div.innerHTML;
}

const ETIQUETAS_OBSERVACION_MANTENIMIENTO = [
    "TRABAJO REALIZADO",
    "HALLAZGOS TÉCNICOS",
    "RECOMENDACIONES",
    "ESTADO FINAL DEL EQUIPO",
];

function formatearObservacionesMantenimiento(texto) {
    if (!texto || !String(texto).trim()) {
        return '<span class="text-slate-400 italic text-sm">Sin observaciones</span>';
    }

    const raw = String(texto).trim();
    const regexEtiquetas = /(TRABAJO REALIZADO|HALLAZGOS TÉCNICOS|RECOMENDACIONES|ESTADO FINAL DEL EQUIPO)\s*:?\s*/gi;
    const tieneEstructura = ETIQUETAS_OBSERVACION_MANTENIMIENTO.some((etiqueta) =>
        raw.toUpperCase().includes(etiqueta)
    );

    if (!tieneEstructura) {
        return `<p class="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">${escaparHtmlObservacion(raw)}</p>`;
    }

    const bloques = [];
    const regexBloques = new RegExp(
        `(TRABAJO REALIZADO|HALLAZGOS TÉCNICOS|RECOMENDACIONES|ESTADO FINAL DEL EQUIPO)\\s*:?\\s*([\\s\\S]*?)(?=(TRABAJO REALIZADO|HALLAZGOS TÉCNICOS|RECOMENDACIONES|ESTADO FINAL DEL EQUIPO)\\s*:?\\s*|$)`,
        "gi"
    );

    let coincidencia;
    while ((coincidencia = regexBloques.exec(raw)) !== null) {
        bloques.push({
            etiqueta: coincidencia[1].trim(),
            contenido: coincidencia[2].trim() || "—",
        });
    }

    if (!bloques.length) {
        return `<p class="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">${escaparHtmlObservacion(raw)}</p>`;
    }

    return bloques
        .map(
            (bloque) => `
                <div class="observacion-bloque pb-2.5 mb-2.5 border-b border-slate-100 last:border-b-0 last:mb-0 last:pb-0">
                    <p class="text-[10px] font-black uppercase tracking-wider text-uccLight mb-1">${escaparHtmlObservacion(bloque.etiqueta)}</p>
                    <p class="text-sm text-slate-700 leading-relaxed">${escaparHtmlObservacion(bloque.contenido)}</p>
                </div>`
        )
        .join("");
}

function _sinTildesJS(s) {
    try {
        return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch (e) {
        return String(s || "");
    }
}

function extraerBloqueObservacion(texto, etiqueta) {
    if (!texto || !String(texto).trim()) return null;
    const raw = String(texto);
    const re = new RegExp(
        etiqueta + "\\s*:?\\s*([\\s\\S]*?)(?=(TRABAJO REALIZADO|HALLAZGOS TÉCNICOS|HALLAZGOS TECNICOS|RECOMENDACIONES|ESTADO FINAL DEL EQUIPO)\\s*:?\\s*|$)",
        "i"
    );
    const m = raw.match(re);
    if (!m) return null;
    const v = (m[1] || "").trim();
    return v || null;
}

function normalizarEstadoFinalObservacion(raw) {
    if (!raw) return null;
    const t = _sinTildesJS(raw).toLowerCase().trim();
    if (!t || ["—", "-", "ninguno", "ninguna", "n/a", "na"].includes(t)) {
        // "Ninguno" solo no es estado válido; se evalúa abajo por si contiene palabra clave.
    }
    if (t.includes("operativo")) return "Operativo";
    if (t.includes("reparaci") || t.includes("observaci")) return "En reparación";
    if (t.includes("baja") || t.includes("fuera") || t.includes("inactivo")) return "Dado de baja";
    return null;
}

function parseDetalleMantenimientoJS(texto) {
    if (!texto || !String(texto).trim()) {
        return { trabajo_realizado: null, hallazgos: null, recomendaciones: null, estado_final: null };
    }
    const raw = String(texto);
    const tieneEstructura = ETIQUETAS_OBSERVACION_MANTENIMIENTO.some((et) =>
        _sinTildesJS(raw).toUpperCase().includes(_sinTildesJS(et).toUpperCase())
    );
    let hallazgos = extraerBloqueObservacion(raw, "HALLAZGOS TÉCNICOS") || extraerBloqueObservacion(raw, "HALLAZGOS TECNICOS");
    const parsed = {
        trabajo_realizado: extraerBloqueObservacion(raw, "TRABAJO REALIZADO"),
        hallazgos: hallazgos,
        recomendaciones: extraerBloqueObservacion(raw, "RECOMENDACIONES"),
        estado_final: normalizarEstadoFinalObservacion(extraerBloqueObservacion(raw, "ESTADO FINAL DEL EQUIPO")),
    };
    if (!tieneEstructura) parsed.trabajo_realizado = raw.trim();
    return parsed;
}

function formatearSoloTrabajoRealizado(texto, trabajoPreparseado) {
    const trabajo = trabajoPreparseado != null ? trabajoPreparseado : parseDetalleMantenimientoJS(texto).trabajo_realizado;
    if (!trabajo) return '<span class="text-slate-400 italic text-sm">Sin descripción</span>';
    return `<p class="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">${escaparHtmlObservacion(trabajo)}</p>`;
}
