import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, BellOff, ClipboardList, Dumbbell, Inbox, Info, MessageSquare, MessageSquareText, Smartphone, Trophy, Users, CheckCheck, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Contenido } from '../../../components/layout/PageHeader';
import { List, ListRow } from '../../../components/ui/List';
import { Switch, SwitchRow } from '../../../components/ui/Switch';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { usePushNotifications } from '../../../hooks/usePushNotifications';
import { notificationPrefsService, PREFERENCIAS_POR_DEFECTO, type CategoriaAviso, type PreferenciasAvisos } from '../../../services/notificationPrefsService';
import { CLAVES } from '../../../lib/queryKeys';
import { esAppEmpaquetada } from '../../../lib/entorno';

/**
 * AJUSTES → AVISOS
 * =====================================================================
 *
 * Qué avisos quiere recibir cada persona, por tipo. Se aplican AL MOMENTO
 * (interruptores, sin botón de guardar) y en el SERVIDOR: lo que se apaga
 * no llega ni a la campana ni al móvil.
 *
 * Y el push de este dispositivo, con el estado real del permiso del
 * navegador: si está bloqueado, se dice dónde se desbloquea en vez de
 * ofrecer un botón que no puede funcionar.
 */

const CATEGORIAS: { id: CategoriaAviso; titulo: string; descripcion: string; icono: LucideIcon; soloAtleta?: boolean; soloCoach?: boolean }[] = [
    { id: 'message', titulo: 'Mensajes', descripcion: 'Cuando te escriben por el chat.', icono: MessageSquare },
    { id: 'feedback', titulo: 'Feedback', descripcion: 'Comentarios de tu entrenador sobre un entrenamiento.', icono: MessageSquareText, soloAtleta: true },
    { id: 'review', titulo: 'Revisiones', descripcion: 'Cuando tu entrenador marca un entrenamiento como revisado.', icono: CheckCheck, soloAtleta: true },
    { id: 'inbox', titulo: 'Bandeja de entrada', descripcion: 'Entrenamientos terminados por tus atletas, listos para revisar.', icono: Inbox, soloCoach: true },
    { id: 'training', titulo: 'Entrenamiento', descripcion: 'Bloques nuevos y cambios en tu planificación.', icono: Dumbbell },
    { id: 'competition', titulo: 'Competiciones', descripcion: 'Convocatorias y recordatorios de competición.', icono: Trophy },
    { id: 'checkin', titulo: 'Check-in', descripcion: 'Recordatorio del check-in semanal.', icono: ClipboardList, soloAtleta: true },
    { id: 'club', titulo: 'Club', descripcion: 'Marcas de otros atletas y anuncios del club.', icono: Users },
    { id: 'system', titulo: 'Sistema', descripcion: 'Avisos sobre tu cuenta.', icono: Info },
];

export function NotificationSettings({ userId, esStaff, esAtleta, onBack }: { userId: string; esStaff: boolean; esAtleta: boolean; onBack?: () => void }) {
    const queryClient = useQueryClient();
    const consulta = useQuery({
        queryKey: [...CLAVES.avisos.preferencias(userId), 'completo'],
        queryFn: () => notificationPrefsService.get(userId),
        staleTime: 5 * 60_000,
    });
    // Lo que se enseña: lo que ha tocado la persona si ha tocado algo, si
    // no lo guardado, si no lo de serie. Sin copiar la consulta a estado.
    const [local, setLocal] = useState<PreferenciasAvisos | null>(null);
    const prefs: PreferenciasAvisos = local ?? consulta.data?.prefs ?? PREFERENCIAS_POR_DEFECTO;

    const push = usePushNotifications();

    const cambiar = async (id: CategoriaAviso, valor: boolean) => {
        const antes = prefs;
        const despues = { ...prefs, [id]: valor };
        setLocal(despues);
        try {
            await notificationPrefsService.set(userId, despues);
            queryClient.setQueryData(CLAVES.avisos.preferencias(userId), despues);
            queryClient.invalidateQueries({ queryKey: CLAVES.avisos.preferencias(userId) });
        } catch (err) {
            setLocal(antes);
            toast.error(err instanceof Error ? err.message : 'No se pudo guardar.');
        }
    };

    const alternarPush = async () => {
        if (push.isSubscribed) {
            const ok = await push.unsubscribe();
            if (ok) toast('Avisos en este dispositivo desactivados');
        } else {
            const ok = await push.subscribeToPush();
            if (ok) toast.success('Activado: te avisaremos aunque la app esté cerrada.');
            else if (push.permission === 'denied') toast.error('El navegador tiene los avisos bloqueados para esta web.');
            else toast.error('No se pudieron activar los avisos.');
        }
    };

    const visibles = CATEGORIAS.filter(c => (!c.soloAtleta || esAtleta) && (!c.soloCoach || esStaff));
    const todoApagado = visibles.every(c => prefs[c.id] === false);

    return (
        <Contenido ancho="estrecho">
            <PageHeader
                titulo="Avisos"
                subtitulo="Qué quieres que te avisemos, y dónde."
                atras={onBack ? { onClick: onBack } : undefined}
                compacta
            />
            <div className="space-y-6 px-4 sm:px-6 lg:px-8">
                <List
                    titulo="En este dispositivo"
                    pie={
                        !push.isSupported
                            ? esAppEmpaquetada()
                                ? 'Dentro de la app instalada los avisos llegan por el sistema.'
                                : 'Este navegador no admite avisos con la app cerrada.'
                            : push.permission === 'denied'
                                ? 'El navegador tiene bloqueados los avisos de esta web. Se desbloquean en los ajustes del sitio (el candado de la barra de direcciones).'
                                : 'Con esto activado, los avisos llegan aunque tengas la app cerrada. Cada dispositivo se activa por separado.'
                    }
                >
                    <ListRow
                        icono={<Smartphone />}
                        titulo="Avisos con la app cerrada"
                        subtitulo={push.isSubscribed ? 'Activados en este dispositivo' : 'Desactivados'}
                        derecha={
                            push.isSupported && push.permission !== 'denied' ? (
                                <Switch checked={push.isSubscribed} onChange={() => void alternarPush()} disabled={push.isLoading} aria-label="Avisos con la app cerrada" />
                            ) : (
                                <Badge tono="neutro">{push.permission === 'denied' ? 'Bloqueado' : 'No disponible'}</Badge>
                            )
                        }
                    />
                </List>

                <List
                    titulo="Qué te avisamos"
                    pie="Se aplica a la campana, a los avisos dentro de la app y a los del dispositivo. Los mensajes del chat que estés viendo no avisan nunca."
                    accion={
                        todoApagado ? (
                            <Button variant="ghost" size="sm" icon={<BellRing className="h-4 w-4" aria-hidden="true" />} onClick={() => visibles.forEach(c => void cambiar(c.id, true))}>
                                Activar todo
                            </Button>
                        ) : undefined
                    }
                >
                    {visibles.map(c => (
                        <SwitchRow
                            key={c.id}
                            icono={<c.icono />}
                            titulo={c.titulo}
                            descripcion={c.descripcion}
                            checked={prefs[c.id] !== false}
                            onChange={(v) => void cambiar(c.id, v)}
                            disabled={consulta.isPending || consulta.data?.disponible === false}
                        />
                    ))}
                </List>

                {consulta.data?.disponible === false && (
                    <p className="flex items-start gap-2 px-1 text-t-xs text-warning">
                        <BellOff className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Los ajustes por tipo estarán disponibles cuando se actualice la base de datos (database/NOTIFICACIONES_2026-09-11.sql).
                    </p>
                )}
            </div>
        </Contenido>
    );
}
