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
