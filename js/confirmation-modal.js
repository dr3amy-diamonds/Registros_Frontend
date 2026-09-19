// ========================================
// Modal de Confirmación Personalizado UI
// Sistema AiresFlow - UCC Montería
// ========================================

/**
 * Inyecta el HTML del modal de confirmación en el DOM
 * Se ejecuta una sola vez al cargar el script
 */
function inyectarModalConfirmacion() {
    // Verificar si el modal ya existe
    if (document.getElementById('modal-confirmacion-global')) {
        return;
    }

    const modalHTML = `
        <div id="modal-confirmacion-global" role="dialog" aria-modal="true" aria-labelledby="confirmacion-titulo" aria-describedby="confirmacion-mensaje" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm hidden flex items-center justify-center z-[100] p-4" style="display: none;">
            <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 overflow-hidden transform transition-all">
                <!-- Encabezado del modal -->
                <div id="confirmacion-header" class="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                    <div id="confirmacion-icon-container" class="flex items-center justify-center w-12 h-12 rounded-xl bg-amber-100">
                        <i id="confirmacion-icon" class="fas fa-exclamation-triangle text-amber-600 text-xl"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 id="confirmacion-titulo" class="text-lg font-black text-slate-800 tracking-tight">
                            Confirmar acción
                        </h3>
                    </div>
                </div>

                <!-- Cuerpo del modal -->
                <div class="px-6 py-5">
                    <p id="confirmacion-mensaje" class="text-sm text-slate-600 leading-relaxed">
                        ¿Está seguro de que desea continuar con esta acción?
                    </p>
                </div>

                <!-- Botones de acción -->
                <div class="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
                    <button type="button" id="btn-confirmacion-cancelar" class="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-6 py-2.5 rounded-xl transition flex items-center justify-center gap-2">
                        <i class="fas fa-times text-sm"></i>
                        <span>Cancelar</span>
                    </button>
                    <button type="button" id="btn-confirmacion-aceptar" class="w-full sm:w-auto bg-uccDark hover:bg-slate-800 text-white font-bold px-6 py-2.5 rounded-xl shadow-lg transition flex items-center justify-center gap-2">
                        <i class="fas fa-check text-sm"></i>
                        <span id="texto-btn-aceptar">Confirmar</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

/**
 * Muestra el modal de confirmación y retorna una Promise
 * @param {Object} opciones - Configuración del modal
 * @param {string} opciones.titulo - Título del modal
 * @param {string} opciones.mensaje - Mensaje descriptivo
 * @param {string} opciones.textoAceptar - Texto del botón de confirmación (default: "Confirmar")
 * @param {boolean} opciones.esPeligroso - Si true, aplica estilo destructivo (rojo)
 * @returns {Promise<boolean>} - true si acepta, false si cancela
 */
function solicitarConfirmacion(opciones = {}) {
    // Valores por defecto
    const config = {
        titulo: opciones.titulo || 'Confirmar acción',
        mensaje: opciones.mensaje || '¿Está seguro de que desea continuar con esta acción?',
        textoAceptar: opciones.textoAceptar || 'Confirmar',
        esPeligroso: opciones.esPeligroso || false
    };

    // Inyectar modal si no existe
    inyectarModalConfirmacion();

    return new Promise((resolve) => {
        const modal = document.getElementById('modal-confirmacion-global');
        const iconContainer = document.getElementById('confirmacion-icon-container');
        const icon = document.getElementById('confirmacion-icon');
        const titulo = document.getElementById('confirmacion-titulo');
        const mensaje = document.getElementById('confirmacion-mensaje');
        const btnAceptar = document.getElementById('btn-confirmacion-aceptar');
        const btnCancelar = document.getElementById('btn-confirmacion-cancelar');
        const textoAceptar = document.getElementById('texto-btn-aceptar');

        if (!modal) {
            console.error('❌ Modal de confirmación no encontrado');
            resolve(false);
            return;
        }

        // Configurar contenido del modal
        titulo.textContent = config.titulo;
        mensaje.textContent = config.mensaje;
        textoAceptar.textContent = config.textoAceptar;

        // Aplicar estilos según severidad
        if (config.esPeligroso) {
            // Estilo destructivo (rojo)
            iconContainer.className = 'flex items-center justify-center w-12 h-12 rounded-xl bg-red-100';
            icon.className = 'fas fa-exclamation-triangle text-red-600 text-xl';
            btnAceptar.className = 'w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2.5 rounded-xl shadow-lg transition flex items-center justify-center gap-2';
        } else {
            // Estilo estándar (amber)
            iconContainer.className = 'flex items-center justify-center w-12 h-12 rounded-xl bg-amber-100';
            icon.className = 'fas fa-exclamation-triangle text-amber-600 text-xl';
            btnAceptar.className = 'w-full sm:w-auto bg-uccDark hover:bg-slate-800 text-white font-bold px-6 py-2.5 rounded-xl shadow-lg transition flex items-center justify-center gap-2';
        }

        // Función para cerrar modal y limpiar eventos
        const previouslyFocused = document.activeElement;
        const cerrarModal = (resultado) => {
            modal.classList.add('hidden');
            modal.style.display = 'none';
            document.body.classList.remove('overflow-hidden');

            // Remover event listeners
            btnAceptar.replaceWith(btnAceptar.cloneNode(true));
            btnCancelar.replaceWith(btnCancelar.cloneNode(true));

            if (previouslyFocused && document.contains(previouslyFocused)) {
                try { previouslyFocused.focus({ preventScroll: true }); } catch (_) { previouslyFocused.focus(); }
            }
            resolve(resultado);
        };

        // Mostrar modal
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        document.body.classList.add('overflow-hidden');

        // Foco inicial en cancelar (acción segura) + trampa de Tab
        const btnAceptarNuevo = document.getElementById('btn-confirmacion-aceptar');
        const btnCancelarNuevo = document.getElementById('btn-confirmacion-cancelar');

        const trapTab = (e) => {
            if (e.key !== 'Tab') return;
            const focusables = [btnCancelarNuevo, btnAceptarNuevo].filter(Boolean);
            if (!focusables.length) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        modal.addEventListener('keydown', trapTab);
        window.setTimeout(() => {
            try { btnCancelarNuevo.focus({ preventScroll: true }); } catch (_) { btnCancelarNuevo.focus(); }
        }, 30);

        btnAceptarNuevo.addEventListener('click', () => cerrarModal(true));
        btnCancelarNuevo.addEventListener('click', () => cerrarModal(false));

        // Cerrar con tecla ESC
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                cerrarModal(false);
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);

        // Cerrar al hacer clic fuera del modal
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                cerrarModal(false);
            }
        });
    });
}

// Auto-inyectar modal al cargar el DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inyectarModalConfirmacion);
} else {
    inyectarModalConfirmacion();
}
