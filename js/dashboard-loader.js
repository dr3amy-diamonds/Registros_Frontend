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

    function pintarSaldo(presupuesto, saldo) {
        var estado = document.getElementById('kpi-saldo-estado');
        var card = document.getElementById('card-saldo');
        var valor = document.getElementById('kpi-saldo');
        var base = 'p-4 rounded-lg border border-slate-100 shadow-sm flex flex-col justify-center gap-1 min-h-[96px]';
        var texto = 'Presupuesto menos gasto';
        var cardExtra = 'bg-emerald-50/60';
        var valorColor = 'text-2xl font-bold text-[#10b981] tabular-nums leading-none';
        if (!(presupuesto > 0)) {
            texto = 'Sin presupuesto asignado';
            cardExtra = 'bg-slate-50';
            valorColor = 'text-2xl font-bold text-slate-500 tabular-nums leading-none';
        } else if (saldo <= 0) {
            texto = 'Sin saldo disponible';
            cardExtra = 'bg-red-50';
            valorColor = 'text-2xl font-bold text-red-600 tabular-nums leading-none';
        } else if ((saldo / presupuesto) < 0.2) {
            texto = 'Saldo bajo — menos del 20%';
            cardExtra = 'bg-amber-50';
            valorColor = 'text-2xl font-bold text-amber-700 tabular-nums leading-none';
        } else {
            texto = 'Saldo saludable';
        }
        if (card) card.className = base + ' ' + cardExtra;
        if (valor) valor.className = valorColor;
        if (estado) estado.textContent = texto;
    }

    function pintarSaldoFijo() {
        pintarSaldo(0, 0);
    }

    async function cargarResumen() {
        try {
            var data = await API.peticion('/dashboard/resumen');
            var flota = (data && data.flota) || data || {};
            var financiero = (data && data.financiero) || {};
            var estado = (data && data.estado_equipos) || {};
            var mes = (data && data.mantenimientos_mes) || {};

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
            pintarSaldo(presupuesto, saldo);

            setTexto('estado-operativos', estado.operativos != null ? estado.operativos : 0);
            setTexto('estado-reparacion', estado.en_reparacion != null ? estado.en_reparacion : 0);
            setTexto('estado-inactivos', estado.inactivos != null ? estado.inactivos : 0);
            setTexto('estado-baja', estado.dados_baja != null ? estado.dados_baja : 0);

            setTexto('mant-realizados', mes.realizados != null ? mes.realizados : 0);
            setTexto('mant-programados', mes.programados != null ? mes.programados : 0);
            setTexto('mant-pendientes', mes.pendientes != null ? mes.pendientes : 0);
            setTexto('mant-vencidos', mes.vencidos != null ? mes.vencidos : 0);

            mostrarError(null);
        } catch (err) {
            setTexto('kpi-total', 0);
            setTexto('kpi-chiller', 0);
            setTexto('kpi-otros', 0);
            setTexto('kpi-presupuesto', formatoCOP.format(0));
            setTexto('kpi-gastado', formatoCOP.format(0));
            setTexto('kpi-saldo', formatoCOP.format(0));
            setTexto('estado-operativos', 0);
            setTexto('estado-reparacion', 0);
            setTexto('estado-inactivos', 0);
            setTexto('estado-baja', 0);
            setTexto('mant-realizados', 0);
            setTexto('mant-programados', 0);
            setTexto('mant-pendientes', 0);
            setTexto('mant-vencidos', 0);
            pintarSaldoFijo();
            mostrarError('No se pudo cargar el resumen. Verifique la conexión e intente de nuevo.');
            console.error('Error al cargar resumen:', err);
        }
    }

    document.addEventListener('DOMContentLoaded', cargarResumen);
})();
