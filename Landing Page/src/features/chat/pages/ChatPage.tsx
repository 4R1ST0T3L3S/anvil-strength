import { useEffect, useMemo } from 'react';
import { MessageSquare } from 'lucide-react';
import type { UserProfile } from '../../../hooks/useUser';
import { isStaff } from '../../../lib/roles';
import { useConversaciones } from '../hooks/useChat';
import { ListaDeConversaciones } from '../components/ListaDeConversaciones';
import { Hilo, type PersonaDelChat } from '../components/Hilo';
import { PageHeader } from '../../../components/layout/PageHeader';
import { EmptyState } from '../../../components/ui/EmptyState';
import { EstadoDeDatos } from '../../../components/ui/EstadoDeDatos';
import { SkeletonList } from '../../../components/ui/Skeleton';
import { cn } from '../../../lib/utils';

/**
 * MENSAJES
 * =====================================================================
 *
 * En escritorio, dos columnas: la lista a la izquierda y el hilo a la
 * derecha. En móvil, una u otra según haya conversación en la URL.
 *
 * El atleta con UNA sola conversación (su entrenador) entra directo en ella:
 * una lista de un elemento es una pantalla de más.
 */
export function ChatPage({
    user,
    chatId,
    onAbrir,
    onCerrar,
    onVerFicha,
}: {
    user: UserProfile;
    /** Con quién se está hablando (de la URL). */
    chatId: string | null;
    onAbrir: (otherId: string) => void;
    onCerrar: () => void;
    onVerFicha?: (otherId: string) => void;
}) {
    const staff = isStaff(user);
    const conversaciones = useConversaciones(user.id, staff);
    const lista = useMemo(() => conversaciones.data ?? [], [conversaciones.data]);

    const activa = useMemo<PersonaDelChat | null>(() => {
        if (!chatId) return null;
        const c = lista.find(x => x.otherId === chatId);
        if (c) return { id: c.otherId, full_name: c.fullName, avatar_url: c.avatarUrl, papel: c.otherRole, canMessage: c.canMessage };
        // La lista aún no ha llegado: se abre igual con lo que se sabe.
        return conversaciones.isPending ? { id: chatId, full_name: '…', canMessage: true } : null;
    }, [chatId, lista, conversaciones.isPending]);

    // Una sola conversación: entrar directo.
    useEffect(() => {
        if (!chatId && !conversaciones.isPending && lista.length === 1 && !staff) {
            onAbrir(lista[0].otherId);
        }
    }, [chatId, lista, conversaciones.isPending, staff, onAbrir]);

    const mostrarListaEnMovil = !chatId;

    return (
        <div className="flex h-full min-h-0 flex-col lg:flex-row">
            {/* LISTA */}
            <aside
                className={cn(
                    'flex min-h-0 flex-col lg:w-[340px] lg:shrink-0 lg:border-r lg:border-[var(--separator)]',
                    mostrarListaEnMovil ? 'flex-1' : 'hidden lg:flex'
                )}
            >
                <PageHeader titulo="Mensajes" subtitulo={staff ? 'Tus atletas' : undefined} className="lg:px-5 lg:pb-3 lg:pt-6" />
                <EstadoDeDatos consulta={conversaciones} esqueleto={<div className="px-3"><SkeletonList filas={4} /></div>} queEs="que.datos">
                    <ListaDeConversaciones
                        conversaciones={lista}
                        cargando={false}
                        activa={chatId}
                        me={user.id}
                        onAbrir={onAbrir}
                        className="flex-1"
                    />
                </EstadoDeDatos>
            </aside>

            {/* HILO */}
            <section className={cn('min-h-0 flex-1', mostrarListaEnMovil ? 'hidden lg:flex lg:flex-col' : 'flex flex-col')}>
                {activa ? (
                    <Hilo
                        key={activa.id}
                        me={user.id}
                        otro={activa}
                        onAtras={onCerrar}
                        onVerFicha={onVerFicha && activa.papel === 'athlete' ? () => onVerFicha(activa.id) : undefined}
                        className="flex-1"
                    />
                ) : chatId && !conversaciones.isPending ? (
                    <EmptyState kind="error" title="No encuentro esa conversación" body="Puede que ya no tengáis relación o que el enlace sea antiguo." />
                ) : (
                    <div className="hidden h-full items-center justify-center lg:flex">
                        <EmptyState icon={<MessageSquare />} title="Elige una conversación" body="Los mensajes aparecen en tiempo real y se entregan aunque la otra persona tenga la app cerrada." />
                    </div>
                )}
            </section>
        </div>
    );
}
