import { PublicHeader } from '../../../components/layout/PublicHeader';
import { PublicFooter } from '../../../components/layout/PublicFooter';
import { ProfileSection } from '../components/ProfileSection';
import { SelectorDeTema } from '../../../components/ui/SelectorDeTema';
import { SelectorDeIdioma } from '../../../components/ui/SelectorDeIdioma';
import { UserProfile, useUser } from '../../../hooks/useUser';
import { ShieldAlert, RefreshCw } from 'lucide-react';

interface ProfilePageProps {
    user: UserProfile;
    onLoginClick: () => void;
}

export function ProfilePage({ user, onLoginClick }: ProfilePageProps) {
    const { refetch, isFetching } = useUser();

    return (
        <div className="min-h-[100dvh] bg-surface-sunken font-sans selection:bg-brand flex flex-col">
            <PublicHeader onLoginClick={onLoginClick} />
            <div className="flex-1 pt-32 pb-20 px-4">
                <div className="max-w-4xl mx-auto mb-8 bg-[#151515] border border-warning/20 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-6 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500/10 via-amber-500 to-amber-500/10" />
                    <div className="w-16 h-16 bg-warning-quiet rounded-full flex items-center justify-center border border-warning/20 shrink-0">
                        <ShieldAlert className="w-8 h-8 text-warning" />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tight text-ink mb-1">Cuenta en Revisión</h2>
                            <p className="text-ink-muted text-sm">
                                Tu cuenta está pendiente de aprobación por el equipo de Anvil Strength. Mientras tanto, puedes configurar tu perfil.
                            </p>
                        </div>
                        <button
                            onClick={() => refetch()}
                            disabled={isFetching}
                            className="shrink-0 flex items-center justify-center gap-2 bg-warning-quiet hover:bg-amber-500/20 text-warning border border-amber-500/30 px-4 py-2.5 rounded-xl font-bold uppercase text-sm transition-colors disabled:opacity-50"
                        >
                            <RefreshCw size={16} className={isFetching ? "animate-spin" : ""} />
                            Comprobar estado
                        </button>
                    </div>
                </div>
                <ProfileSection user={user} onUpdate={() => refetch()} />

                {/* PREFERENCIAS DEL DISPOSITIVO.
                    El tema no se guarda en la cuenta sino en el aparato: el
                    mismo entrenador puede querer claro en el portátil del
                    gimnasio y oscuro en el móvil, y sincronizarlo se lo
                    impediría. Por eso vive aquí y no entre los datos del
                    perfil, que sí viajan con la persona.

                    Y por eso está: en la cabecera del panel el icono se oculta
                    por debajo de `sm`, donde ya conviven el conmutador de
                    panel, los avisos y la ⋮. Sin esta fila no habría forma de
                    cambiar el tema desde un móvil dentro del panel. */}
                <section className="rounded-card border border-[var(--border-default)] bg-surface-raised p-5 md:p-6">
                    <h2 className="mb-1 text-t-lg font-black uppercase tracking-display text-ink">
                        Este dispositivo
                    </h2>
                    <p className="mb-5 text-t-sm text-ink-muted">
                        Ajustes que se quedan en este aparato y no viajan con tu cuenta.
                    </p>
                    <div className="flex items-center justify-between gap-4 rounded-field bg-surface-canvas px-4 py-3">
                        <div className="min-w-0">
                            <p className="text-t-sm font-bold text-ink">Tema</p>
                            <p className="text-t-xs text-ink-subtle">
                                Por defecto sigue al sistema, y cambia con él al anochecer.
                            </p>
                        </div>
                        <SelectorDeTema />
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-4 rounded-field bg-surface-canvas px-4 py-3">
                        <div className="min-w-0">
                            <p className="text-t-sm font-bold text-ink">Idioma</p>
                            <p className="text-t-xs text-ink-subtle">
                                Cambia la voz de la aplicación. Lo que hayas escrito tú —nombres de
                                ejercicio, notas, mensajes— se queda como está.
                            </p>
                        </div>
                        <SelectorDeIdioma />
                    </div>
                </section>
            </div>
            <PublicFooter />
        </div>
    );
}
