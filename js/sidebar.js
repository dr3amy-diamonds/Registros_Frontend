/**
 * AiresFlow - Sidebar modular exclusivo para Técnico.
 * Inyecta solo dos accesos y mantiene el comportamiento móvil sin listeners globales.
 */
(function () {
    function inicializarSidebar() {
        const sidebar = document.getElementById("sidebar") || document.getElementById("main-sidebar");
        const overlay = document.getElementById("sidebar-overlay");
        const userRole = localStorage.getItem("rol") || localStorage.getItem("userRole");
        const currentPath = window.location.pathname.toLowerCase();

        aplicarRestriccionesVisualesRol();

        if (!sidebar || !overlay) {
            vincularBotonCerrarSesion();
            console.warn("⚠️ Sidebar: no se encontraron los elementos estructurales necesarios.");
            return;
        }

        function sincronizarEstadoMenu() {
            const abierto = !sidebar.classList.contains("-translate-x-full");
            document.querySelectorAll('#btn-menu-toggle, [id*="btn-menu"], .toggle-sidebar').forEach((boton) => {
                boton.setAttribute('aria-expanded', String(abierto));
            });
        }

        function toggleSidebar() {
            sidebar.classList.toggle("-translate-x-full");
            overlay.classList.toggle("hidden");
            sincronizarEstadoMenu();
        }

        function cerrarSidebar() {
            sidebar.classList.add("-translate-x-full");
            overlay.classList.add("hidden");
            sincronizarEstadoMenu();
        }

        function obtenerNavContainer() {
            return document.querySelector("#sidebar nav") || document.querySelector("nav");
        }

        function limpiarEInyectarNavTecnico() {
            if (!esTecnico()) {
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
                    id: "nav-calendario",
                    href: "/calendario",
                    label: "Resumen Mantenimiento",
                    icono: "fas fa-calendar-alt"
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
                                <a href="${boton.href}" id="${boton.id}" class="flex items-center gap-3 px-3 py-2.5 text-slate-700 hover:bg-slate-100 rounded-lg transition text-sm font-medium">
                                    <i class="${boton.icono} w-5" aria-hidden="true"></i>
                                    <span>${boton.label}</span>
                                </a>
                        `
                    );
                }
            });

            function marcarNavActivo(navId) {
                const enlace = document.getElementById(navId);
                if (!enlace) return;

                enlace.classList.remove("text-slate-600", "text-slate-700", "hover:bg-slate-100");
                enlace.classList.add("bg-cyan-50", "text-uccDark", "border", "border-cyan-200", "font-semibold");
                enlace.setAttribute("aria-current", "page");
            }

            if (currentPath.includes("mis-ordenes") || currentPath.includes("mis_ordenes")) {
                marcarNavActivo("nav-mis-ordenes");
            } else if (currentPath.includes("calendario") || currentPath.includes("calendar")) {
                marcarNavActivo("nav-calendario");
            } else if (currentPath.includes("inventario") || currentPath.includes("asset_inventory")) {
                marcarNavActivo("nav-inventario");
            } else if (currentPath.includes("reporte-tecnico") || currentPath.includes("service_report_form")) {
                marcarNavActivo("nav-mis-ordenes");
            }
        }

        function asegurarEnlaceCalendario() {
            const nav = obtenerNavContainer();
            if (!nav) return;
            const existentes = Array.from(nav.querySelectorAll('a[href="/calendario"]'));
            if (existentes.length > 1) {
                existentes.slice(1).forEach((nodo) => nodo.remove());
            }
            let enlace = nav.querySelector('a[href="/calendario"]');
            if (!enlace) {
                const ref = nav.querySelector('a[href="/programacion"]');
                const html = '<a href="/calendario" id="nav-calendario" class="flex items-center gap-3 px-4 py-3 text-slate-700 hover:bg-slate-100 rounded-xl transition font-medium text-sm">' +
                    '<i class="fas fa-calendar-alt w-5"></i><span>Resumen Mantenimiento</span></a>';
                if (ref && ref.insertAdjacentHTML) {
                    ref.insertAdjacentHTML("afterend", html);
                } else {
                    nav.insertAdjacentHTML("beforeend", html);
                }
                enlace = nav.querySelector('a[href="/calendario"]');
            }
            if (enlace && !enlace.id) enlace.id = "nav-calendario";
            if (enlace && (currentPath.includes("calendario") || currentPath.includes("calendar"))) {
                enlace.classList.remove("text-slate-600", "text-slate-700", "hover:bg-slate-100");
                enlace.classList.add("bg-cyan-50", "text-uccDark", "border", "border-cyan-200", "font-semibold");
                enlace.setAttribute("aria-current", "page");
            }
        }

        function marcarEnlaceActivoGenerico() {
            if (esTecnico()) return;
            const mapa = [
                { ruta: "dashboard", href: "/dashboard" },
                { ruta: "inventario", href: "/inventario" },
                { ruta: "programacion", href: "/programacion" },
                { ruta: "auditoria", href: "/auditoria" },
                { ruta: "exportar", href: "/exportar" },
                { ruta: "usuarios", href: "/usuarios" }
            ];
            const coincidencia = mapa.find((item) => currentPath.includes(item.ruta));
            if (!coincidencia) return;
            const enlace = Array.from(document.querySelectorAll("#sidebar nav a, aside nav a"))
                .find((nodo) => nodo.getAttribute("href") === coincidencia.href);
            if (!enlace) return;
            enlace.classList.remove("text-slate-700", "hover:bg-slate-100");
            enlace.classList.add("bg-cyan-50", "text-uccDark", "border", "border-cyan-200", "font-semibold");
            enlace.setAttribute("aria-current", "page");
        }

        function accionInventario(nombre) {
            if (typeof window[nombre] === 'function') {
                window[nombre]();
                return;
            }
            window.location.href = '/inventario';
        }
        window.accionInventario = accionInventario;

        function esTecnico() {
            return String(userRole || "").normalize("NFD").replaceAll(/\p{Diacritic}/gu, "").trim().toLowerCase() === "tecnico";
        }

        function aplicarRestriccionesVisualesRol() {
            if (!esTecnico()) return;
            document.querySelectorAll("[data-solo-gestion]").forEach((elemento) => {
                elemento.classList.add("hidden");
            });
        }

        function inyectarAccionesSecundarias() {
            if (esTecnico()) {
                document.getElementById('sidebar-acciones-secundarias')?.remove();
                return;
            }
            if (document.getElementById('sidebar-acciones-secundarias')) return;
            const nav = obtenerNavContainer();
            if (!nav) return;
            const acciones = [
                { label: 'Gestionar Insumos', icon: 'fas fa-box-open', fn: 'openGestionTiposComponenteModal' },
                { label: 'Registrar Nuevo Activo', icon: 'fas fa-plus', fn: 'openCrearActivoModal' }
            ];
            const box = document.createElement('div');
            box.id = 'sidebar-acciones-secundarias';
            box.className = 'px-4 pb-2 mt-auto';
            box.setAttribute('aria-label', 'Acciones');
            box.innerHTML = '<p class="px-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Acciones</p>' +
                acciones.map((a) => '<button type="button" onclick="accionInventario(\'' + a.fn + '\')" class="w-full flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-[#132740] bg-slate-100 hover:bg-[#00acc9]/15 border border-slate-200 transition min-h-[36px] mt-1"><i class="' + a.icon + ' text-[#00acc9]"></i><span>' + a.label + '</span></button>').join('');
            nav.insertAdjacentElement('afterend', box);
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
        asegurarEnlaceCalendario();
        marcarEnlaceActivoGenerico();
        inyectarAccionesSecundarias();
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
