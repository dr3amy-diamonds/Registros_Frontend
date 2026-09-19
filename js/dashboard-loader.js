/* AiresFlow — dashboard-loader.js: resumen de equipos + resumen financiero. */
(function () {
    'use strict';

    var formatoCOP = new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
    });

    function setTexto(id, value) {
        var el = document.getElementById(id);
        if (el) el.textContent = String(value);
    }

    function mostrarError(mensaje) {
        var el = document.getElementById('dashboard-error');
        if (!el) return;
        if (!mensaje) {
            el.classList.add('hidden');
            el.textContent = '';
            return;
        }
        el.textContent = mensaje;
        el.classList.remove('hidden');
    }

    function pintarSaldo(saldo, presupuesto) {
        var valor = document.getElementById('kpi-saldo');
        var estado = document.getElementById('kpi-saldo-estado');
        var tarjeta = document.getElementById('card-saldo');
        if (!valor) return;
        var clasesValor = ['text-green-700', 'text-amber-700', 'text-red-700'];
        valor.classList.remove.apply(valor.classList, clasesValor);
        if (tarjeta) tarjeta.classList.remove('bg-green-50', 'bg-amber-50', 'bg-red-50');

        var texto = '';
        if (presupuesto > 0 && saldo <= 0) {
            valor.classList.add('text-red-700');
            if (tarjeta) tarjeta.classList.add('bg-red-50');
            texto = 'Sin saldo disponible. Solicite ampliación de presupuesto.';
        } else if (presupuesto > 0 && saldo < presupuesto * 0.2) {
            valor.classList.add('text-amber-700');
            if (tarjeta) tarjeta.classList.add('bg-amber-50');
            texto = 'Saldo bajo. Queda menos del 20% del presupuesto.';
        } else {
            valor.classList.add('text-green-700');
            if (tarjeta) tarjeta.classList.add('bg-green-50');
            texto = 'Saldo saludable para próximas intervenciones.';
        }
        if (estado) {
            estado.textContent = texto;
            estado.classList.remove('text-slate-500', 'text-green-700', 'text-amber-700', 'text-red-700');
            estado.classList.add(valor.classList.contains('text-red-700') ? 'text-red-700'
                : valor.classList.contains('text-amber-700') ? 'text-amber-700' : 'text-green-700');
        }
    }

    async function cargarResumen() {
        try {
            var data = await API.peticion('/dashboard/resumen');
            var flota = (data && data.flota) || data || {};
            var financiero = (data && data.financiero) || {};

            setTexto('kpi-total', flota.total_equipos != null ? flota.total_equipos : 0);
            setTexto('kpi-chiller', flota.total_chiller != null ? flota.total_chiller : 0);
            setTexto('kpi-otros', flota.total_otros != null ? flota.total_otros : 0);

            var presupuesto = Number(financiero.presupuesto_asignado || 0);
            var gastado = Number(financiero.total_gastado || 0);
            var saldo = financiero.saldo_disponible != null
                ? Number(financiero.saldo_disponible)
                : presupuesto - gastado;

            setTexto('kpi-presupuesto', formatoCOP.format(presupuesto));
            setTexto('kpi-gastado', formatoCOP.format(gastado));
            setTexto('kpi-saldo', formatoCOP.format(saldo));
            pintarSaldo(saldo, presupuesto);
            mostrarError(null);
        } catch (err) {
            setTexto('kpi-total', 0);
            setTexto('kpi-chiller', 0);
            setTexto('kpi-otros', 0);
            setTexto('kpi-presupuesto', formatoCOP.format(0));
            setTexto('kpi-gastado', formatoCOP.format(0));
            setTexto('kpi-saldo', formatoCOP.format(0));
            mostrarError('No se pudo cargar el resumen. Verifique la conexión e intente de nuevo.');
            console.error('Error al cargar resumen:', err);
        }
    }

    document.addEventListener('DOMContentLoaded', cargarResumen);
})();
