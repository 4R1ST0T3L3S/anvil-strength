import { Inbox, CheckCheck } from 'lucide-react';
import type { UserProfile } from '../../../hooks/useUser';
import { useCoachInboxSummary } from '../hooks/useInbox';
import { PageHeader, Contenido } from '../../../components/layout/PageHeader';
import { EstadoDeDatos } from '../../../components/ui/EstadoDeDatos';
import { SkeletonList } from '../../../components/ui/Skeleton';
import { List, ListRow } from '../../../components/ui/List';
import { Avatar } from '../../../components/ui/Avatar';
import { Badge, Contador } from '../../../components/ui/Badge';
import { EmptyState } from '../../../components/ui/EmptyState';
import { fechaRelativa, diasEntre } from '../../../lib/tiempo';

/**
 * LA BANDEJA DEL ENTRENADOR
 * =====================================================================
 *
 * Una fila por atleta con entrenamientos terminados y sin revisar. Lo que
 * importa se lee de izquierda a derecha: quién, cuántos, cuándo fue el
 * último. Nada más. El detalle está a un toque.
 *
 * Los que llevan más tiempo esperando van arriba: el orden lo da el
 * entrenamiento más antiguo sin revisar, no el más reciente. Es lo contrario
 * de una bandeja de correo y es a propósito: aquí lo viejo es deuda.
 */
export function CoachInbox({ user, onOpenAthlete }: { user: UserProfile; onOpenAthlete: (athleteId: string) => void }) {
    const resumen = useCoachInboxSummary(user.id);

    const ordenados = [...resumen.atletas].sort((a, b) =>
        (a.oldestPendingAt ?? '').localeCompare(b.oldestPendingAt ?? '') || a.fullName.localeCompare(b.fullName, 'es')
    );

    return (
        <Contenido ancho="estrecho">
            <PageHeader
                titulo="Bandeja de entrada"
                subtitulo={
                    resumen.totalPendientes > 0
                        ? `${resumen.totalPendientes} ${resumen.totalPendientes === 1 ? 'entrenamiento' : 'entrenamientos'} por revisar`
                        : 'Entrenamientos terminados por tus atletas, pendientes de tu revisión'
                }
            />

            <div className="px-4 sm:px-6 lg:px-8">
                <EstadoDeDatos
                    consulta={resumen}
                    vacio={ordenados.length === 0}
                    esqueleto={<SkeletonList filas={4} />}
                    queEs="que.atletas"
                    vacioIcono={<CheckCheck />}
                    vacioTitulo="Todo revisado"
                    vacioCuerpo="Cuando un atleta termine un entrenamiento aparecerá aquí hasta que lo marques como revisado."
                >
                    {ordenados.length === 0 ? (
                        <EmptyState kind="done" icon={<CheckCheck />} title="Todo revisado" body="Cuando un atleta termine un entrenamiento aparecerá aquí hasta que lo marques como revisado." />
                    ) : (
                        <List>
                            {ordenados.map(a => {
                                const espera = a.oldestPendingAt ? diasEntre(a.oldestPendingAt) : 0;
                                return (
                                    <ListRow
                                        key={a.athleteId}
                                        avatar={<Avatar nombre={a.fullName} src={a.avatarUrl} size={44} />}
                                        inset={72}
                                        titulo={a.fullName}
                                        destacada
                                        subtitulo={
                                            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                                                <span>
                                                    {a.pendingCount} {a.pendingCount === 1 ? 'entrenamiento pendiente' : 'entrenamientos pendientes'}
                                                </span>
                                                {a.modifiedCount > 0 && (
                                                    <Badge tono="aviso">{a.modifiedCount === 1 ? 'Modificado' : `${a.modifiedCount} modificados`}</Badge>
                                                )}
                                                {espera >= 3 && (
                                                    <Badge tono="neutro">Esperando {espera} días</Badge>
                                                )}
                                            </span>
                                        }
                                        valor={a.lastCompletedAt ? `Último: ${fechaRelativa(a.lastCompletedAt)}` : undefined}
                                        derecha={<Contador n={a.pendingCount} aria-label={`${a.pendingCount} pendientes`} />}
                                        chevron
                                        onClick={() => onOpenAthlete(a.athleteId)}
                                        aria-label={`${a.fullName}, ${a.pendingCount} entrenamientos pendientes`}
                                    />
                                );
                            })}
                        </List>
                    )}
                </EstadoDeDatos>

                {ordenados.length > 0 && (
                    <p className="mt-4 flex items-start gap-2 px-1 text-t-xs leading-relaxed text-ink-subtle">
                        <Inbox className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Un entrenamiento solo sale de aquí cuando lo marcas como revisado. Si el atleta lo cambia después, vuelve.
                    </p>
                )}
            </div>
        </Contenido>
    );
}
