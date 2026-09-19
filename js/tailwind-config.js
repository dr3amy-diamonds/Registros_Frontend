/* AiresFlow — configuración Tailwind compartida (CDN Play).
 * Sustituye los bloques `tailwind.config = {...}` antes inline en cada HTML.
 * Cargar DESPUÉS de https://cdn.tailwindcss.com :
 *   <script src="https://cdn.tailwindcss.com"></script>
 *   <script src="js/tailwind-config.js"></script>
 */
tailwind.config = {
    theme: {
        extend: {
            colors: {
                uccDark: '#132740',
                uccLight: '#00acc9',
                /* Variante oscura accesible: texto/botones sobre blanco ≥ 4.5:1 */
                uccTeal: '#0e7490',
                uccTealDark: '#155e75'
            },
            fontFamily: {
                sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif']
            }
        }
    }
};
