/**
 * ============================================================================
 * LOGIN.JS - Autenticación y Gestión de Sesión (VERSIÓN FINAL REFACTORIZADA)
 * ============================================================================
 *
 * Responsabilidades críticas:
 * - INTERCEPTAR el evento submit del formulario ANTES de enviarse
 * - Llamar a API.authLogin con credenciales en formato x-www-form-urlencoded
 * - Decodificar JWT y extraer datos del usuario
 * - Guardar token en localStorage
 * - Redirigir según el rol
 */

console.log("🚀 Script login.js iniciando...");

// ============================================================================
// INICIALIZACIÓN DEL FORMULARIO DE LOGIN
// ============================================================================

function initializeLoginForm() {
    console.log("✅ Inicializando formulario de login...");

    const loginForm = document.getElementById("loginForm");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const submitBtn = document.getElementById("submitBtn");
    const btnText = document.getElementById("btnText");
    const btnIcon = document.getElementById("btnIcon");
    const errorContainer = document.getElementById("errorContainer");
    const errorMessage = document.getElementById("errorMessage");

    if (!loginForm) {
        console.error("❌ CRÍTICO: No se encontró #loginForm en el DOM");
        return;
    }

    // Manejador de submit del formulario de login
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Gestión visual del estado de carga
        errorContainer?.classList.add('hidden');
        submitBtn.disabled = true;
        btnText.textContent = 'Autenticando...';
        btnIcon.className = 'fas fa-spinner fa-spin';

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        try {
            // Llamar al método de autenticación (x-www-form-urlencoded)
            const resultado = await API.authLogin(email, password);

            if (resultado && resultado.exito) {
                console.log('✅ Autenticación exitosa para:', resultado.email);
                const rutaDestino = getRedirectUrlByRole(resultado.rol);
                // Redirigir según el rol del usuario
                globalThis.location.href = rutaDestino || '/perfil';
            }
        } catch (error) {
            console.error('❌ Fallo en el inicio de sesión:', error.message || error);
            errorMessage.textContent = error.message || 'Error de conexión con el servidor.';
            errorContainer.classList.remove('hidden');

            // Restablecer estado del botón
            submitBtn.disabled = false;
            btnText.textContent = 'Entrar al Sistema';
            btnIcon.className = 'fas fa-arrow-right';

            // Limpiar contraseña por seguridad
            passwordInput.value = '';
        }
    });

    console.log("✅ Event listener de submit registrado");
}

/**
 * Obtiene la URL de redirección según el rol del usuario
 */
function getRedirectUrlByRole(role) {
    const roleRoutes = {
        'Jefe de Infraestructura': '/dashboard',
        'Auxiliar de Infraestructura': '/programacion',
        'Tecnico': '/reporte-tecnico'
    };

    return roleRoutes[role] || null;
}

// ============================================================================
// PUNTO DE ENTRADA: INICIALIZAR CUANDO EL DOM ESTÉ LISTO
// ============================================================================

if (document.readyState === 'loading') {
    console.log("⏳ DOM cargando... esperando DOMContentLoaded");
    document.addEventListener('DOMContentLoaded', initializeLoginForm);
} else {
    console.log("⏳ DOM ya está listo, inicializando ahora");
    initializeLoginForm();
}

// ============================================================================
// DEBUG Y ESTADO INICIAL
// ============================================================================
console.log("✅ login.js cargado correctamente");
console.log("📊 Estado de sesión:", {
    hasToken: !!localStorage.getItem('token'),
    userEmail: localStorage.getItem('userEmail') || 'ninguno',
    userRole: localStorage.getItem('userRole') || 'ninguno',
    usuario_nombre: localStorage.getItem('usuario_nombre') || 'ninguno'
});