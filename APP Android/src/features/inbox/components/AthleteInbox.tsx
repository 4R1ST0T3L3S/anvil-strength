import { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, CheckCheck, Inbox, Dumbbell, MailOpen } from 'lucide-react';
import type { UserProfile } from '../../../hooks/useUser';
import { useAthleteInbox, useInboxItemActions } from '../hooks/useInbox';
import type { InboxItem } from '../../../services/inboxService';
import { PageHeader, Contenido } from '../../../components/layout/PageHeader';
import { SegmentedControl } from '../../../components/ui/SegmentedControl';
import { EstadoDeDatos } from '../../../components/ui/EstadoDeDatos';
import { SkeletonList } from '../../../components/ui/Skeleton';
import { List, ListRow } from '../../../components/ui/List';
import { Avatar } from '../../../components/ui/Avatar';
import { Punto } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { IconButton } from '../../../components/ui/IconButton';
import { Modal } from '../../../components/ui/Modal';
import { EmptyState } from '../../../components/ui/EmptyState';
import { marcaCorta, fechaLarga, haceCuanto } from '../../../lib/tiempo';

/**
 * LA BANDEJA DEL ATLETA
 * =====================================================================
 *
 * Lo que su entrenador le ha hecho llegar sobre sus entrenamientos: el
 * feedback y los avisos de «revisado». Sin leer arriba y en seminegrita;
 * abrir uno lo marca como leído; archivar lo aparta sin borrarlo.
 *
 * Está hecha para crecer (`kind`): una nota suelta del entrenador o un aviso
 * del sistema entrarían aquí sin tocar la pantalla.
 */

type Filtro = 'todo' | 'sin-leer' | 'archivados';

export function AthleteInbox({ user, onOpenTraining }: { user: UserProfile; onOpenTraining: () => void }) {
    const [filtro, setFiltro] = useState<Filtro>('todo');
    const [abierto, setAbierto] = useState<InboxItem | null>(null);

    const vivos = useAthleteInbox(user.id, { enabled: filtro !== 'archivados' });
    const archivados = useAthleteInbox(user.id, { archivados: true, enabled: filtro === 'archivados' });
    const { marcar, marcarTodoLeido } = useInboxItemActions(user.id);

    const consulta = filtro === 'archivados' ? archivados : vivos;
    const lista = useMemo(() => {
        const base = filtro === 'archivados' ? archivados.elementos : vivos.elementos;
        return filtro === 'sin-leer' ? base.filter(i => !i.readAt) : base;
    }, [filtro, vivos.elementos, archivados.elementos]);

    const sinLeer = vivos.elementos.filter(i => !i.readAt).length;

    const abrir = (item: InboxItem) => {
        setAbierto(item);
        if (!item.readAt) marcar.mutate({ ids: [item.id], read: true });
    };

    return (
        <Contenido ancho="estrecho">
            <PageHeader
                titulo="Bandeja de entrada"
                subtitulo={sinLeer > 0 ? `${sinLeer} ${sinLeer === 1 ? 'mensaje sin leer' : 'mensajes sin leer'}` : 'Feedback y avisos de tu entrenador'}
                acciones={
                    sinLeer > 0 ? (
                        <Button variant="ghost" size="sm" icon={<CheckCheck className="h-4 w-4" aria-hidden="true" />} onClick={() => marcarTodoLeido.mutate()}>
                            <span className="hidden sm:inline">Marcar todo leído</span>
                        </Button>
                    ) : undefined
                }
            >
                <SegmentedControl
                    aria-label="Qué enseñar"
                    block
                    activo={filtro}
                    onChange={setFiltro}
                    segmentos={[
                        { id: 'todo', label: 'Todo' },
                        { id: 'sin-leer', label: 'Sin leer', insignia: sinLeer },
                        { id: 'archivados', label: 'Archivados' },
                    ]}
                />
            </PageHeader>

            <div className="px-4 sm:px-6 lg:px-8">
                <EstadoDeDatos
                    consulta={consulta}
                    vacio={false}
                    esqueleto={<SkeletonList filas={4} />}
                    queEs="que.datos"
                >
                    {lista.length === 0 ? (
                        filtro === 'archivados' ? (
                            <EmptyState icon={<Archive />} title="Nada archivado" body="Lo que archives desde la bandeja se guarda aquí." />
                        ) : filtro === 'sin-leer' ? (
                            <EmptyState kind="done" icon={<MailOpen />} title="Todo leído" body="No tienes nada pendiente de leer." />
                        ) : (
                            <EmptyState
                                icon={<Inbox />}
                                title="Tu bandeja está vacía"
                                body="Cuando tu entrenador revise un entrenamiento o te deje feedback, aparecerá aquí."
                            />
                        )
                    ) : (
                        <List>
                            {lista.map(item => (
                                <ListRow
                                    key={item.id}
                                    avatar={<Avatar nombre={item.senderName} src={item.senderAvatar} size={40} />}
                                    titulo={
                                        <span className="flex items-center gap-2">
                                            {!item.readAt && <Punto aria-label="Sin leer" />}
                                            <span className="truncate">{tituloDe(item)}</span>
                                        </span>
                                    }
                                    destacada={!item.readAt}
                                    subtitulo={subtituloDe(item)}
                                    valor={marcaCorta(item.createdAt)}
                                    chevron
                                    onClick={() => abrir(item)}
                                />
                            ))}
                        </List>
                    )}
                </EstadoDeDatos>
            </div>

            <Modal
                open={!!abierto}
                onClose={() => setAbierto(null)}
                title={abierto ? tituloDe(abierto) : undefined}
                description={abierto ? contextoDe(abierto) : undefined}
                size="md"
                footer={
                    abierto && (
                        <>
                            {abierto.archivedAt ? (
                                <Button
                                    variant="secondary"
                                    icon={<ArchiveRestore className="h-4 w-4" aria-hidden="true" />}
                                    onClick={() => { marcar.mutate({ ids: [abierto.id], archived: false }); setAbierto(null); }}
                                >
                                    Devolver a la bandeja
                                </Button>
                            ) : (
                                <Button
                                    variant="secondary"
                                    icon={<Archive className="h-4 w-4" aria-hidden="true" />}
                                    onClick={() => { marcar.mutate({ ids: [abierto.id], archived: true }); setAbierto(null); }}
                                >
                                    Archivar
                                </Button>
                            )}
                            {abierto.sessionId && (
                                <Button variant="primary" icon={<Dumbbell className="h-4 w-4" aria-hidden="true" />} onClick={() => { setAbierto(null); onOpenTraining(); }}>
                                    Ver mi entrenamiento
                                </Button>
                            )}
                        </>
                    )
                }
            >
                {abierto && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <Avatar nombre={abierto.senderName} src={abierto.senderAvatar} size={36} />
                            <div className="min-w-0">
                                <p className="text-t-sm font-semibold text-ink">{abierto.senderName ?? 'Tu entrenador'}</p>
                                <p className="text-t-xs text-ink-subtle">{haceCuanto(abierto.createdAt)}</p>
                            </div>
                            <IconButton
                                className="ml-auto"
                                size="sm"
                                aria-label={abierto.readAt ? 'Marcar como no leído' : 'Marcar como leído'}
                                icon={<MailOpen />}
                                onClick={() => marcar.mutate({ ids: [abierto.id], read: !abierto.readAt })}
                            />
                        </div>
                        {abierto.body ? (
                            <p className="whitespace-pre-wrap text-t-base leading-relaxed text-ink">{abierto.body}</p>
                        ) : (
                            <p className="flex items-center gap-2 text-t-base text-ink-muted">
                                <CheckCheck className="h-5 w-5 text-success" aria-hidden="true" />
                                Tu entrenador ha revisado este entrenamiento.
                            </p>
                        )}
                        {abierto.payload.was_modified && (
                            <p className="text-t-xs text-ink-subtle">Lo revisó después de los cambios que hiciste.</p>
                        )}
                    </div>
                )}
            </Modal>
        </Contenido>
    );
}

function tituloDe(i: InboxItem): string {
    if (i.kind === 'training_feedback') return 'Feedback de tu entrenador';
    if (i.kind === 'training_reviewed') return 'Entrenamiento revisado';
    return i.title;
}

function contextoDe(i: InboxItem): string | undefined {
    const p = i.payload;
    const partes = [p.session_label, p.block_name && `${p.block_name}${p.week_number ? ` · semana ${p.week_number}` : ''}`].filter(Boolean);
    if (p.completed_at) partes.push(fechaLarga(p.completed_at));
    return partes.length ? partes.join(' — ') : undefined;
}

function subtituloDe(i: InboxItem): string {
    const sesion = [i.payload.session_label, i.payload.completed_at ? fechaLarga(i.payload.completed_at) : null].filter(Boolean).join(' · ');
    if (i.kind === 'training_feedback' && i.body) return i.body.length > 90 ? `${i.body.slice(0, 90)}…` : i.body;
    if (i.kind === 'training_reviewed') return sesion ? `Revisado: ${sesion}` : 'Revisado por tu entrenador';
    return i.body ?? sesion;
}
