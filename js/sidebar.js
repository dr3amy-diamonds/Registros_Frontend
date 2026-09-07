/**
 * AiresFlow - Sidebar modular exclusivo para Técnico.
 * Inyecta solo dos accesos y mantiene el comportamiento móvil sin listeners globales.
 */
(function () {
    function inicializarSidebar() {
        const sidebar = document.getElementById("sidebar") || document.getElementById("main-sidebar");
        const overlay = document.getElementById("sidebar-overlay");
        const userRole = localStorage.getItem("userRole");
        const currentPath = window.location.pathname.toLowerCase();

        if (!sidebar || !overlay) {
            vincularBotonCerrarSesion();
            console.warn("⚠️ Sidebar: no se encontraron los elementos estructurales necesarios.");
            return;
        }

        function toggleSidebar() {
            sidebar.classList.toggle("-translate-x-full");
            overlay.classList.toggle("hidden");
        }

        function cerrarSidebar() {
            sidebar.classList.add("-translate-x-full");
            overlay.classList.add("hidden");
        }

        function obtenerNavContainer() {
            return document.querySelector("#sidebar nav") || document.querySelector("nav");
        }

        function limpiarEInyectarNavTecnico() {
            if (userRole !== "Tecnico") {
                return;
            }

            const navContainer = obtenerNavContainer();
            if (!navContainer) {
                return;
            }

            navContainer.innerHTML = "";

            const botones = [
                {
                    id: "nav-mis-ordenes",
                    href: "/mis-ordenes",
                    label: "Agenda de Mantenimiento",
                    icono: "fas fa-calendar-check"
                },
                {
                    id: "nav-inventario",
                    href: "/inventario",
                    label: "Historial de Activos",
                    icono: "fas fa-history"
                }
            ];

            botones.forEach((boton) => {
                if (!document.getElementById(boton.id)) {
                    navContainer.insertAdjacentHTML(
                        "beforeend",
                        `
                                <a href="${boton.href}" id="${boton.id}" class="flex items-center gap-3 px-4 py-3 text-slate-600 hover:bg-slate-700/50 hover:text-white rounded-xl transition-all text-sm font-medium group">
                                    <div class="text-slate-500 group-hover:text-uccLight transition-colors">
                                    <i class="${boton.icono} text-base"></i>
                                </div>
                                <span>${boton.label}</span>
                            </a>
                        `
                    );
                }
            });

            function marcarNavActivo(navId) {
                const enlace = document.getElementById(navId);
                if (!enlace) return;

                enlace.classList.remove("text-slate-300", "hover:bg-slate-700/50", "hover:text-white");
                enlace.classList.add("bg-uccLight", "text-uccDark", "font-bold");

                const iconoContenedor = enlace.querySelector("div");
                const texto = enlace.querySelector("span");

                if (iconoContenedor) {
                    iconoContenedor.className = "text-uccDark";
                }

                if (texto) {
                    texto.className = "text-uccDark";
                }
            }

            if (currentPath.includes("mis-ordenes") || currentPath.includes("mis_ordenes")) {
                marcarNavActivo("nav-mis-ordenes");
            } else if (currentPath.includes("inventario") || currentPath.includes("asset_inventory")) {
                marcarNavActivo("nav-inventario");
            } else if (currentPath.includes("reporte-tecnico") || currentPath.includes("service_report_form")) {
                marcarNavActivo("nav-mis-ordenes");
            }
        }

        function reemplazarYVincular(selector, accion) {
            const nodos = Array.from(document.querySelectorAll(selector));
            const elementosUnicos = new Set();

            nodos.forEach((nodo) => {
                const raiz = nodo.matches("button, a") ? nodo : (nodo.closest("button, a") || nodo);
                elementosUnicos.add(raiz);
            });

            elementosUnicos.forEach((elemento) => {
                if (!elemento.parentNode) {
                    return;
                }

                const clon = elemento.cloneNode(true);
                elemento.parentNode.replaceChild(clon, elemento);
                clon.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    accion();
                });
            });
        }

        function vincularBotonCerrarSesion() {
            const accionLogout = () => {
                if (typeof window.logout === "function") {
                    window.logout();
                    return;
                }
                localStorage.clear();
                window.location.href = "/login";
            };

            document.querySelectorAll("#btn-cerrar-sesion, button[onclick*='logout']").forEach((boton) => {
                if (boton.dataset.logoutBound === "1") {
                    return;
                }
                boton.dataset.logoutBound = "1";
                boton.removeAttribute("onclick");
                boton.addEventListener("click", (evento) => {
                    evento.preventDefault();
                    evento.stopPropagation();
                    accionLogout();
                });
            });
        }

        function vincularControlesMoviles() {
            reemplazarYVincular('[id*="btn-menu"], .fa-bars, #btn-menu-mobile, .toggle-sidebar', toggleSidebar);

            const btnCloseSidebar = document.getElementById("btn-close-sidebar");
            if (btnCloseSidebar && btnCloseSidebar.parentNode) {
                const clonClose = btnCloseSidebar.cloneNode(true);
                btnCloseSidebar.parentNode.replaceChild(clonClose, btnCloseSidebar);
                clonClose.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    cerrarSidebar();
                });
            }

            overlay.addEventListener("click", cerrarSidebar);

            sidebar.querySelectorAll("nav a").forEach((enlace) => {
                enlace.addEventListener("click", () => {
                    if (window.innerWidth < 768) {
                        cerrarSidebar();
                    }
                });
            });
        }

        limpiarEInyectarNavTecnico();
        vincularBotonCerrarSesion();
        vincularControlesMoviles();
        cerrarSidebar();

        console.log("✅ Sidebar técnico cargado con éxito.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", inicializarSidebar);
    } else {
        inicializarSidebar();
    }
})();
