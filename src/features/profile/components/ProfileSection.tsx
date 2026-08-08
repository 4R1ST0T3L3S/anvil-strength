import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import { Loader, Save, Camera, Trash2, CheckCircle2, AlertCircle, LogOut, FileText, ChevronRight } from 'lucide-react';
import { ConfirmationModal } from '../../../components/modals/ConfirmationModal';
import { isStaff } from '../../../lib/roles';
import { RolesSection } from './RolesSection';
import { PdfThemeSettings } from './PdfThemeSettings';
import { PersonalInfoSection } from './PersonalInfoSection';

interface ProfileSectionProps {
    user: UserProfile;
    onUpdate: () => void;
    onBack?: () => void;
}

/**
 * MI PERFIL
 * =====================================================================
 * Reescrito sobre el sistema de diseño: `surface-*`/`ink-*`/`border-*` en
 * vez de negro y grises a pelo, `rounded-card`/`rounded-field` en vez de
 * `rounded-2xl`/`rounded-xl` sueltos, y la escala tipográfica `t-*`. Antes
 * era la única pantalla del panel con su propia paleta de rojos, verdes y
 * grises con opacidad a mano — el resto de la aplicación ya no se ve así.
 */
export function ProfileSection({ user, onUpdate, onBack }: ProfileSectionProps) {
    /** "Mi perfil" y "Documento PDF" son dos pantallas, no un formulario con
     *  pestañas: la segunda necesita el ancho entero para la vista previa. */
    const [screen, setScreen] = useState<'profile' | 'pdf'>('profile');

    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(user.avatar_url || user.profile_image || null);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

    const fieldsFrom = (u: UserProfile) => ({
        name: u.full_name || u.name || '',
        nickname: u.nickname || '',
        gender: u.gender || '',
        weight_category: u.weight_category || '',
        age_category: u.age_category || '',
        squat_pr: u.squat_pr?.toString() || '',
        bench_pr: u.bench_pr?.toString() || '',
        deadlift_pr: u.deadlift_pr?.toString() || '',
        biography: u.biography || ''
    });

    const [formData, setFormData] = useState(() => fieldsFrom(user));

    /**
     * El formulario se resincroniza cuando llega un `user` distinto de
     * verdad —tras guardar, o al terminar de cargar el perfil detrás del
     * usuario optimista— y NO en un efecto que dispararía un render de más
     * en cada paso. Se AJUSTA el estado durante el propio render, comparando
     * una foto de los campos contra la última que se sincronizó: es el
     * patrón que React recomienda para derivar estado de una prop que
     * cambia.
     */
    const snapshot = JSON.stringify(fieldsFrom(user));
    const [syncedSnapshot, setSyncedSnapshot] = useState(snapshot);
    if (snapshot !== syncedSnapshot) {
        setSyncedSnapshot(snapshot);
        setFormData(fieldsFrom(user));
        setImagePreview(user.avatar_url || user.profile_image || null);
    }

    if (screen === 'pdf') {
        return <PdfThemeSettings user={user} onBack={() => setScreen('profile')} />;
    }

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                setMessage({ type: 'error', text: 'La imagen es demasiado grande (máx 2MB)' });
                return;
            }
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const removePhoto = () => {
        setImageFile(null);
        setImagePreview(null);
    };

    const uploadImage = async (): Promise<string | null> => {
        if (!imageFile) return null;
        try {
            const fileExt = imageFile.name.split('.').pop();
            const fileName = `${user.id}-${Date.now()}.${fileExt}`;
            const filePath = `avatars/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('profiles')
                .upload(filePath, imageFile);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('profiles').getPublicUrl(filePath);
            return data.publicUrl;
        } catch (error) {
            console.error('Error al subir imagen:', error);
            return null;
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setMessage(null);

        try {
            let profileImageUrl = user.avatar_url || user.profile_image || '';

            if (imageFile) {
                const uploadedUrl = await uploadImage();
                if (uploadedUrl) profileImageUrl = uploadedUrl;
            } else if (imagePreview === null) {
                profileImageUrl = '';
            }

            const updateData: Partial<UserProfile> = {
                full_name: formData.name,
                nickname: formData.nickname,
                avatar_url: profileImageUrl,
                gender: (formData.gender as "male" | "female") || undefined,
                age_category: formData.age_category || undefined,
                weight_category: formData.weight_category || undefined,
                biography: formData.biography || undefined
            };

            if (user.role === 'athlete') {
                updateData.squat_pr = formData.squat_pr ? parseFloat(formData.squat_pr) : undefined;
                updateData.bench_pr = formData.bench_pr ? parseFloat(formData.bench_pr) : undefined;
                updateData.deadlift_pr = formData.deadlift_pr ? parseFloat(formData.deadlift_pr) : undefined;
            }

            const { error } = await supabase
                .from('profiles')
                .update(updateData)
                .eq('id', user.id);

            if (error) throw error;

            setMessage({ type: 'success', text: 'Perfil actualizado con éxito' });
            onUpdate();
            setImageFile(null);
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            console.error('Error al actualizar perfil:', error);
            setMessage({ type: 'error', text: 'No se pudo guardar la información' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleLogout = async () => {
        try {
            await supabase.auth.signOut();
            window.location.href = '/';
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
            window.location.href = '/';
        }
    };

    return (
        <div className="mx-auto w-full max-w-4xl px-4 py-6 pb-24 md:px-8 md:py-10">
            <header className="mb-8">
                {onBack && (
                    <button
                        onClick={onBack}
                        className="mb-2 flex items-center gap-1.5 text-t-xs font-bold uppercase tracking-widest text-ink-subtle transition-colors duration-fast hover:text-ink"
                    >
                        ← Volver
                    </button>
                )}
                <h1 className="text-t-3xl font-black uppercase tracking-display text-ink">Mi perfil</h1>
                <p className="mt-1 text-t-sm text-ink-muted">Gestiona tu información personal y marcas.</p>
            </header>

            {message && (
                <div className={`mb-6 flex items-center gap-3 rounded-card border p-4 ${
                    message.type === 'success'
                        ? 'border-[var(--success-line,var(--border-strong))] bg-[var(--success-quiet)] text-success'
                        : 'border-[var(--danger-line,var(--border-strong))] bg-[var(--danger-quiet)] text-danger'
                }`}>
                    {message.type === 'success' ? <CheckCircle2 size={18} aria-hidden="true" /> : <AlertCircle size={18} aria-hidden="true" />}
                    <p className="text-t-sm font-bold">{message.text}</p>
                </div>
            )}

            {/* Qué eres en Anvil. Va lo PRIMERO porque de esto cuelga todo
                lo demás: qué paneles ves, qué entradas de menú tienes y qué
                secciones aparecen debajo —el propio bloque de PDF de aquí
                abajo, sin ir más lejos, solo sale si gestionas atletas—. */}
            <div className="mb-6">
                <RolesSection user={user} />
            </div>

            {/* Documento PDF. Solo staff: es el atleta quien lo RECIBE, no
                quien lo diseña. Va arriba del formulario y no al final: es la
                razón por la que muchos entrenadores abren "Mi perfil". */}
            {isStaff(user) && (
                <button
                    onClick={() => setScreen('pdf')}
                    className="group mb-6 flex w-full items-center gap-4 rounded-card border border-[var(--border-default)] bg-surface-raised p-4 text-left transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:bg-surface-overlay"
                >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field bg-brand-quiet text-brand">
                        <FileText size={18} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-t-sm font-bold text-ink">Documento PDF</span>
                        <span className="block text-t-xs text-ink-subtle">
                            Colores, tipografía, logotipo y estilo del entrenamiento que reciben tus atletas
                        </span>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-faint transition-transform duration-fast ease-snap group-hover:translate-x-0.5" />
                </button>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
                {/* Avatar */}
                <div className="flex flex-col items-center gap-6 rounded-card border border-[var(--border-default)] bg-surface-raised p-6 md:flex-row md:p-8">
                    <div className="relative shrink-0">
                        <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-pill border-2 border-[var(--border-strong)] bg-surface-sunken md:h-32 md:w-32">
                            {imagePreview ? (
                                <img src={imagePreview} alt="Avatar" className="h-full w-full object-cover" />
                            ) : (
                                <span className="text-t-2xl font-black text-ink-faint">
                                    {(formData.nickname?.[0] || formData.name?.[0] || 'U').toUpperCase()}
                                </span>
                            )}
                        </div>
                        <label className="absolute -bottom-0.5 -right-0.5 flex h-9 w-9 cursor-pointer items-center justify-center rounded-pill bg-brand text-brand-ink shadow-raise transition-colors duration-fast hover:bg-brand-hover">
                            <Camera size={16} aria-hidden="true" />
                            <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                        </label>
                        {imagePreview && (
                            <button
                                type="button"
                                onClick={removePhoto}
                                aria-label="Quitar foto"
                                className="absolute -top-1 -right-1 flex h-7 w-7 items-center justify-center rounded-pill bg-surface-overlay text-ink-muted shadow-raise transition-colors duration-fast hover:bg-[var(--danger-quiet)] hover:text-danger"
                            >
                                <Trash2 size={13} aria-hidden="true" />
                            </button>
                        )}
                    </div>
                    <div className="min-w-0 text-center md:text-left">
                        <h3 className="text-t-base font-bold text-ink">Foto de perfil</h3>
                        <p className="mt-1 text-t-sm leading-relaxed text-ink-subtle">
                            Una foto clara, a ser posible cuadrada. Máximo 2 MB.
                        </p>
                    </div>
                </div>

                {/* Datos personales */}
                <section className="space-y-4 rounded-card border border-[var(--border-default)] bg-surface-raised p-5 md:p-6">
                    <h2 className="text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">Información personal</h2>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <FormField label="Nombre completo">
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                required
                                className={INPUT}
                            />
                        </FormField>
                        <FormField label="Apodo / mote">
                            <input
                                type="text"
                                value={formData.nickname}
                                onChange={e => setFormData({ ...formData, nickname: e.target.value })}
                                className={INPUT}
                            />
                        </FormField>
                        <FormField label="Correo">
                            <input
                                type="email"
                                value={user.email}
                                disabled
                                className={`${INPUT} cursor-not-allowed text-ink-faint`}
                            />
                        </FormField>
                        <FormField label="Rol">
                            <div className={`${INPUT} flex items-center text-ink-muted`}>
                                {user.role === 'coach' ? 'Entrenador' : user.role === 'nutritionist' ? 'Nutricionista' : 'Atleta'}
                            </div>
                        </FormField>
                    </div>
                </section>

                {/* Categorías y marcas */}
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <section className="space-y-4 rounded-card border border-[var(--border-default)] bg-surface-raised p-5 md:p-6">
                        <h2 className="text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">Categorías</h2>
                        <div className="space-y-4">
                            <FormField label="Categoría de edad">
                                <select
                                    value={formData.age_category}
                                    onChange={e => setFormData({ ...formData, age_category: e.target.value })}
                                    className={INPUT}
                                >
                                    <option value="">Seleccionar…</option>
                                    <option value="Sub-Junior">Sub-Junior</option>
                                    <option value="Junior">Junior</option>
                                    <option value="Senior">Senior (Open)</option>
                                    <option value="Master 1">Master 1</option>
                                    <option value="Master 2">Master 2</option>
                                    <option value="Master 3">Master 3</option>
                                    <option value="Master 4">Master 4</option>
                                </select>
                            </FormField>
                            <FormField label="Sexo">
                                <select
                                    value={formData.gender}
                                    onChange={e => setFormData({ ...formData, gender: e.target.value })}
                                    className={INPUT}
                                >
                                    <option value="">Seleccionar…</option>
                                    <option value="male">Masculino</option>
                                    <option value="female">Femenino</option>
                                </select>
                            </FormField>
                            <FormField label="Categoría de peso">
                                <select
                                    value={formData.weight_category}
                                    onChange={e => setFormData({ ...formData, weight_category: e.target.value })}
                                    className={INPUT}
                                >
                                    <option value="">Seleccionar…</option>
                                    <optgroup label="Masculino">
                                        <option value="-59kg">-59kg</option>
                                        <option value="-66kg">-66kg</option>
                                        <option value="-74kg">-74kg</option>
                                        <option value="-83kg">-83kg</option>
                                        <option value="-93kg">-93kg</option>
                                        <option value="-105kg">-105kg</option>
                                        <option value="-120kg">-120kg</option>
                                        <option value="+120kg">+120kg</option>
                                    </optgroup>
                                    <optgroup label="Femenino">
                                        <option value="-47kg">-47kg</option>
                                        <option value="-52kg">-52kg</option>
                                        <option value="-57kg">-57kg</option>
                                        <option value="-63kg">-63kg</option>
                                        <option value="-69kg">-69kg</option>
                                        <option value="-76kg">-76kg</option>
                                        <option value="-84kg">-84kg</option>
                                        <option value="+84kg">+84kg</option>
                                    </optgroup>
                                </select>
                            </FormField>
                        </div>
                    </section>

                    <section className="space-y-4 rounded-card border border-[var(--border-default)] bg-surface-raised p-5 md:p-6">
                        <h2 className="text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">Marcas (PR)</h2>
                        <div className="space-y-2.5">
                            <PrField label="Sentadilla" value={formData.squat_pr} onChange={v => setFormData({ ...formData, squat_pr: v })} />
                            <PrField label="Banca" value={formData.bench_pr} onChange={v => setFormData({ ...formData, bench_pr: v })} />
                            <PrField label="Muerto" value={formData.deadlift_pr} onChange={v => setFormData({ ...formData, deadlift_pr: v })} />
                        </div>
                    </section>
                </div>

                {/* Biografía */}
                <section className="space-y-4 rounded-card border border-[var(--border-default)] bg-surface-raised p-5 md:p-6">
                    <h2 className="text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                        {user.role === 'coach' ? 'Biografía / especialidad' : 'Sobre mí / objetivos'}
                    </h2>
                    <textarea
                        value={formData.biography}
                        onChange={e => setFormData({ ...formData, biography: e.target.value })}
                        rows={5}
                        placeholder="Escribe algo sobre ti…"
                        className={`${INPUT} h-auto resize-none py-3`}
                    />
                </section>

                <div className="flex justify-end pt-1">
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="flex w-full items-center justify-center gap-2 rounded-field bg-brand px-8 py-3 text-t-sm font-extrabold uppercase tracking-wide text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover disabled:opacity-40 md:w-auto"
                    >
                        {isSaving ? <Loader size={17} className="animate-spin" /> : <Save size={17} />}
                        {isSaving ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                </div>
            </form>

            {/* INFORMACIÓN PERSONAL.
                Fuera del formulario de arriba a propósito: no son columnas de
                `profiles` sino un catálogo que decide el entrenador, con su
                propio guardado y su propio historial de fechas. Meterla dentro
                obligaría a que el botón "Guardar cambios" hablase con dos
                tablas que no tienen nada que ver.

                El atleta ve y rellena lo que su entrenador le pide; quien no
                tiene entrenador ve el juego predefinido. */}
            <div className="mt-6">
                <PersonalInfoSection
                    athleteId={user.id}
                    mode="athlete"
                    coachId={user.coach_id ?? null}
                    editorId={user.id}
                />
            </div>

            <div className="mt-8 border-t border-subtle pt-6">
                <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-field border border-[var(--border-default)] px-6 py-3 text-t-sm font-bold text-danger transition-colors duration-fast ease-snap hover:bg-[var(--danger-quiet)]"
                >
                    <LogOut size={17} aria-hidden="true" />
                    Cerrar sesión
                </button>
            </div>

            <ConfirmationModal
                isOpen={showLogoutConfirm}
                onClose={() => setShowLogoutConfirm(false)}
                onConfirm={handleLogout}
                title="¿Cerrar sesión?"
                description="Tendrás que volver a iniciar sesión para acceder a tu cuenta."
                confirmText="Cerrar sesión"
                cancelText="Cancelar"
                variant="danger"
            />
        </div>
    );
}

const INPUT =
    'h-11 w-full rounded-field border border-subtle bg-surface-sunken px-3 text-t-sm text-ink outline-none transition-colors duration-fast focus:border-brand';

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block space-y-1.5">
            <span className="block text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">{label}</span>
            {children}
        </label>
    );
}

function PrField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <div className="flex items-center justify-between rounded-field border border-subtle bg-surface-sunken px-4 py-2.5">
            <span className="text-t-xs font-bold uppercase tracking-widest text-ink-subtle">{label}</span>
            <input
                type="number"
                step="0.1"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder="0"
                className="w-20 bg-transparent text-right text-t-lg font-black tabular-nums text-ink outline-none"
            />
        </div>
    );
}
