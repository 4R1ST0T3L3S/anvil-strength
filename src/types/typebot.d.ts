/**
 * Tipos para `@typebot.io/react`, que el paquete no publica.
 *
 * Sin esto `tsc --noEmit` falla con TS7016 en cuanto alguien importa `Bubble`
 * o `Popup`. No saltaba en los despliegues porque el script de build es
 * `vite build` a secas, que transpila sin comprobar tipos: el error solo
 * aparece al ejecutar la comprobación a mano, que es justo cuando interesa
 * que el proyecto esté limpio.
 *
 * Se declaran solo las dos props que se usan en la portada. Si algún día hace
 * falta más superficie del widget, se amplía aquí.
 */
declare module '@typebot.io/react' {
    import type { ComponentType } from 'react';

    interface TypebotWidgetProps {
        /** Identificador público del flujo en Typebot. */
        typebot: string;
        apiHost?: string;
        prefilledVariables?: Record<string, unknown>;
    }

    /** Burbuja flotante anclada a una esquina. */
    export const Bubble: ComponentType<TypebotWidgetProps>;

    /** Diálogo centrado sobre la página. */
    export const Popup: ComponentType<TypebotWidgetProps>;
}
