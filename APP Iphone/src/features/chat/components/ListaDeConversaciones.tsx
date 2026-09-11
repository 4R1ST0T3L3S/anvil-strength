import { useMemo, useState } from 'react';
import { MessageSquare, Search } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Avatar } from '../../../components/ui/Avatar';
import { Contador } from '../../../components/ui/Badge';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonList } from '../../../components/ui/Skeleton';
import { marcaCorta } from '../../../lib/tiempo';
import { vistaPrevia, type Conversation } from '../../../services/chatService';
import { CheckCheck, Check } from 'lucide-react';

/**
 * LA LISTA DE CONVERSACIONES
 * =====================================================================
 *
 * Una fila por persona: avatar, nombre, último mensaje y cuándo; contador
 * rojo si hay sin leer. Las que tienen algo sin leer van en seminegrita.
 * Buscador solo a partir de seis conversaciones: para tres, estorba.
 */
export function ListaDeConversaciones({
    conversaciones,
    cargando,
    activa,
    me,
    onAbrir,
    className,
}: {
    conversaciones: Conversation[];
    cargando: boolean;
    activa: string | null;
    me: string;
    onAbrir: (otherId: string) => void;
    className?: string;
}) {
    const [busqueda, setBusqueda] = useState('');
    const visibles = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return q ? conversaciones.filter(c => c.fullName.toLowerCase().includes(q)) : conversaciones;
    }, [conversaciones, busqueda]);

    return (
        <div className={cn('flex h-full min-h-0 flex-col', className)}>
            {conversaciones.length >= 6 && (
                <div className="relative px-3 pb-2 pt-1">
                    <Search className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
                    <input
                        type="search"
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar"
                        aria-label="Buscar conversación"
                        className="h-9 w-full rounded-[10px] bg-[var(--fill-input)] pl-9 pr-3 text-t-sm text-ink placeholder:text-ink-subtle focus-visible:outline-none focus-visible:bg-surface-raised focus-visible:shadow-[0_0_0_1px_var(--border-strong)]"
                    />
                </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
                {cargando ? (
                    <div className="px-3"><SkeletonList filas={4} /></div>
                ) : visibles.length === 0 ? (
                    <EmptyState
                        icon={<MessageSquare />}
                        title={busqueda ? 'Sin resultados' : 'Sin conversaciones'}
                        body={busqueda ? 'Ninguna conversación coincide con la búsqueda.' : 'Cuando tengas un entrenador o atletas vinculados, aparecerán aquí.'}
                    />
                ) : (
                    <ul className="px-2">
                        {visibles.map(c => {
                            const esActiva = activa === c.otherId;
                            const sinLeer = c.unreadCount > 0;
                            const ultimoMio = c.last?.senderId === me;
                            return (
                                <li key={c.otherId}>
                                    <button
                                        type="button"
                                        onClick={() => onAbrir(c.otherId)}
                                        data-no-press
                                        aria-current={esActiva ? 'true' : undefined}
                                        className={cn(
                                            'flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2.5 text-left transition-colors duration-fast',
                                            esActiva ? 'bg-[var(--fill-selected)]' : 'hover:bg-[var(--fill-hover)] active:bg-[var(--fill-pressed)]'
                                        )}
                                    >
                                        <Avatar nombre={c.fullName} src={c.avatarUrl} size={48} />
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-baseline justify-between gap-2">
                                                <span className={cn('truncate text-t-base text-ink', sinLeer ? 'font-semibold' : 'font-medium')}>{c.fullName}</span>
                                                {c.last && (
                                                    <span className={cn('shrink-0 text-t-xs tabular-nums', sinLeer ? 'font-semibold text-brand-text' : 'text-ink-subtle')}>
                                                        {marcaCorta(c.last.createdAt)}
                                                    </span>
                                                )}
                                            </span>
                                            <span className="mt-0.5 flex items-center justify-between gap-2">
                                                <span className={cn('flex min-w-0 items-center gap-1 text-t-sm', sinLeer ? 'font-medium text-ink' : 'text-ink-subtle')}>
                                                    {ultimoMio && c.last && (
                                                        c.last.deliveredAt
                                                            ? <CheckCheck className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-label="Entregado" />
                                                            : <Check className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-label="Enviado" />
                                                    )}
                                                    <span className="truncate">
                                                        {c.last ? vistaPrevia({ type: c.last.type, content: c.last.content, attachmentName: c.last.attachmentName }) : (c.otherRole === 'coach' ? 'Tu entrenador' : 'Sin mensajes todavía')}
                                                    </span>
                                                </span>
                                                {sinLeer && <Contador n={c.unreadCount} aria-label={`${c.unreadCount} sin leer`} />}
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
