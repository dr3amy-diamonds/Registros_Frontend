/**
 * AiresFlow — modal-accesible.js
 * Gestor accesible de diálogos: role="dialog", Escape, trampa de foco,
 * restauración de foco y bloqueo de scroll.
 *
 * Uso:
 *   ModalAccesible.open('modal-programar-mantenimiento')
 *   ModalAccesible.close('modal-programar-mantenimiento')
 *   ModalAccesible.initModal('mi-modal')  — cablea Escape + clic fuera + [data-close-modal]
 *
 * Los modales deben tener en el HTML:
 *   role="dialog" aria-modal="true" aria-labelledby="<id-del-titulo>"
 */

(function () {
    'use strict';

    const FOCUSABLE_SELECTOR = [
        'a[href]',
        'button:not([disabled])',
        'textarea:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
    ].join(', ');

    // Último elemento con foco antes de abrir cada modal (para restaurarlo).
    const lastFocusedByModal = new Map();
    const wiredModals = new Set();

    function getModal(id) {
        return document.getElementById(id);
    }

    function isOpen(modal) {
        if (!modal) return false;
        return !modal.classList.contains('hidden') && modal.style.display !== 'none';
    }

    function firstFocusable(modal) {
        const els = Array.from(modal.querySelectorAll(FOCUSABLE_SELECTOR))
            .filter((el) => el.offsetParent !== null || el === document.activeElement);
        return els.length ? els[0] : null;
    }

    function trapTabKey(event, modal) {
        if (event.key !== 'Tab') return;
        const focusables = Array.from(modal.querySelectorAll(FOCUSABLE_SELECTOR))
            .filter((el) => !el.disabled && el.tabIndex !== -1 && el.offsetParent !== null);
        if (!focusables.length) {
            event.preventDefault();
            return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function onKeyDown(event) {
        if (event.key === 'Escape') {
            const modal = event.currentTarget.__modalRef;
            if (modal && isOpen(modal)) {
                event.stopPropagation();
                close(event.currentTarget.__modalId);
            }
            return;
        }
        const modal = event.currentTarget.__modalRef;
        if (modal) trapTabKey(event, modal);
    }

    function onBackdropClick(event) {
        const modal = event.currentTarget;
        if (event.target === modal) {
            close(modal.id);
        }
    }

    function open(id, options) {
        const modal = getModal(id);
        if (!modal) {
            console.error('[ModalAccesible] Modal no encontrado:', id);
            return false;
        }
        initModal(id);

        if (!lastFocusedByModal.has(id) || !isOpen(modal)) {
            lastFocusedByModal.set(id, document.activeElement);
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        modal.style.display = 'flex';
        document.body.classList.add('overflow-hidden');

        const focusTarget = (options && options.focus)
            ? modal.querySelector(options.focus)
            : firstFocusable(modal);
        if (focusTarget) {
            window.setTimeout(() => {
                try { focusTarget.focus({ preventScroll: true }); } catch (_) { focusTarget.focus(); }
            }, 30);
        }
        return true;
    }

    function close(id) {
        const modal = getModal(id);
        if (!modal) return false;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        modal.style.display = 'none';

        // Si no quedan modales abiertos, liberar el scroll.
        const anyOpen = Array.from(document.querySelectorAll('[role="dialog"]'))
            .some((m) => !m.classList.contains('hidden') && m.style.display !== 'none');
        if (!anyOpen) document.body.classList.remove('overflow-hidden');

        const prev = lastFocusedByModal.get(id);
        if (prev && document.contains(prev)) {
            try { prev.focus({ preventScroll: true }); } catch (_) { prev.focus(); }
        }
        lastFocusedByModal.delete(id);
        return true;
    }

    function initModal(id) {
        const modal = getModal(id);
        if (!modal || wiredModals.has(id)) return;

        if (!modal.hasAttribute('role')) modal.setAttribute('role', 'dialog');
        if (!modal.hasAttribute('aria-modal')) modal.setAttribute('aria-modal', 'true');

        // Guardar referencia para el handler de teclado.
        const handler = onKeyDown;
        const proxy = (e) => handler(e);
        proxy.__modalRef = modal;
        proxy.__modalId = id;
        // keydown a nivel de documento filtrado por modal abierto (foco dentro).
        document.addEventListener('keydown', (e) => {
            if (!isOpen(modal)) return;
            if (e.key === 'Escape') {
                e.stopPropagation();
                close(id);
                return;
            }
            if (modal.contains(document.activeElement)) {
                trapTabKey(e, modal);
            }
        });

        modal.addEventListener('click', onBackdropClick);
        modal.querySelectorAll('[data-close-modal]').forEach((btn) => {
            btn.addEventListener('click', () => close(id));
        });

        wiredModals.add(id);
    }

    window.ModalAccesible = { open, close, initModal, isOpen };

    // Auto-cablear diálogos presentes en el DOM.
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[role="dialog"][id]').forEach((m) => initModal(m.id));
    });
})();
