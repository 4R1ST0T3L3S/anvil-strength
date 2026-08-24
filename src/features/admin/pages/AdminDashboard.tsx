import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useUser, UserProfile } from '../../../hooks/useUser';
import { adminService } from '../services/adminService';
import { isAdmin } from '../../../lib/roles';
import { Loader, UserCheck, UserX, Shield, ShieldAlert, Check, X, Search, Save, Users, Activity, Dumbbell, Apple, Globe } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CLAVES } from '../../../lib/queryKeys';

type TabType = 'todos' | 'atletas' | 'entrenadores' | 'nutricionistas';

export function AdminDashboard() {
    const navigate = useNavigate();
    const { data: currentUser, isLoading: isUserLoading } = useUser();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [initialUsers, setInitialUsers] = useState<UserProfile[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<TabType>('todos');
    const queryClient = useQueryClient();
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    /*
     * LA LISTA DEL SERVIDOR VA POR CONSULTA; LA EDITABLE SIGUE SIENDO LOCAL.
     *
     * Esta pantalla mantiene DOS copias a proposito —la que se esta tocando y
     * la original— para poder ensenar el boton de guardar solo cuando hay
     * cambios de verdad. Eso es estado de formulario, no cache de servidor, y
     * por eso no desaparece.
     *
     * Lo que si desaparece es el efecto que las llenaba: con el, entrar en el
     * panel eran dos renders (uno con la lista vacia y otro con los datos) y
     * cero cache. El ajuste durante el render siembra las dos copias en cuanto
     * llega una lista nueva, sin pintar el intermedio.
     */
    const { data: usuariosServidor, isPending: cargandoUsuarios, error: errorConsulta } = useQuery({
        queryKey: CLAVES.usuariosAdmin.raiz,
        queryFn: async () => {
            const data = await adminService.getAllUsers();
            // El propio administrador se quita de la lista: la columna de correo
            // no esta en la base y no se puede filtrar en el servidor.
            return data.filter(u => u.id !== currentUser?.id);
        },
        enabled: isAdmin(currentUser),
    });

    const [semillaUsuarios, setSemillaUsuarios] = useState(usuariosServidor);
    if (usuariosServidor && semillaUsuarios !== usuariosServidor) {
        setSemillaUsuarios(usuariosServidor);
        setUsers(usuariosServidor);
        setInitialUsers(usuariosServidor);
    }

    const isLoading = cargandoUsuarios;
    // El fallo de la consulta se ensena con los demas errores de la pantalla,
    // en vez de dejar la tabla vacia sin explicacion.
    const errorVisible = error ?? (errorConsulta instanceof Error ? errorConsulta.message : null);

    /** Vuelve a pedir la lista. Tras guardar cambios o borrar a alguien. */
    const loadUsers = async () => {
        setError(null);
        await queryClient.invalidateQueries({ queryKey: CLAVES.usuariosAdmin.raiz });
    };

    // Show message briefly
    const showSuccess = (msg: string) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(null), 3000);
    };

    const showError = (msg: string) => {
        setError(msg);
        setTimeout(() => setError(null), 5000);
    };

    const toggleAccess = (userId: string, currentAccess: boolean) => {
        setUsers(users.map(u => u.id === userId ? { ...u, has_access: !currentAccess } : u));
    };

    const changeRole = (userId: string, newRole: 'coach' | 'athlete' | 'nutritionist') => {
        setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    };

    const pendingChanges = users.filter(u => {
        const initial = initialUsers.find(init => init.id === u.id);
        if (!initial) return false;
        return u.role !== initial.role || u.has_access !== initial.has_access;
    });

    const hasChanges = pendingChanges.length > 0;

    const handleSaveChanges = async () => {
        if (!hasChanges) return;
        setIsSaving(true);
        setError(null);
        
        try {
            const updates = pendingChanges.map(u => ({
                id: u.id,
                role: u.role,
                has_access: u.has_access
            }));
            
            await adminService.updateUsersBulk(updates);
            
            // La copia original se iguala a la editada, y así el botón de
            // guardar desaparece sin esperar a que vuelva el servidor.
            setInitialUsers(users);
            showSuccess('Cambios guardados correctamente');
            // Y además se invalida la consulta: lo que se acaba de guardar
            // tiene que quedar reflejado en la caché, o cualquier otra pantalla
            // que lea esta lista seguiría enseñando los roles de antes.
            void loadUsers();
        } catch (err: unknown) {
            showError(err instanceof Error ? err.message : 'Error al guardar los cambios en la base de datos');
        } finally {
            setIsSaving(false);
        }
    };

    const changeCoach = async (athleteId: string, coachId: string) => {
        try {
            const newCoachId = coachId === 'unassigned' ? null : coachId;
            setUsers(users.map(u => u.id === athleteId ? { ...u, coach_id: newCoachId } : u));
            await adminService.updateUserCoach(athleteId, newCoachId);
            showSuccess(`Entrenador actualizado`);
        } catch {
            const restoredUser = users.find(u => u.id === athleteId);
            if (restoredUser) setUsers(users.map(u => u.id === athleteId ? { ...u, coach_id: restoredUser.coach_id } : u));
            showError('Error al actualizar entrenador');
        }
    };

    const changeNutritionist = async (athleteId: string, nutritionistId: string) => {
        try {
            const newNutId = nutritionistId === 'unassigned' ? null : nutritionistId;
            setUsers(users.map(u => u.id === athleteId ? { ...u, nutritionist_id: newNutId } : u));
            await adminService.updateUserNutritionist(athleteId, newNutId);
            showSuccess(`Nutricionista actualizado`);
        } catch {
            const restoredUser = users.find(u => u.id === athleteId);
            if (restoredUser) setUsers(users.map(u => u.id === athleteId ? { ...u, nutritionist_id: restoredUser.nutritionist_id } : u));
            showError('Error al actualizar nutricionista');
        }
    };

    const updateBrandColor = async (coachId: string, color: string) => {
        try {
            setUsers(users.map(u => u.id === coachId ? { ...u, brand_color: color } : u));
            await adminService.updateCoachBranding(coachId, { brand_color: color });
            showSuccess('Color de marca actualizado');
        } catch {
            showError('Error al actualizar color');
        }
    };

    const handleLogoUpload = async (coachId: string, file: File) => {
        try {
            if (file.size > 2 * 1024 * 1024) throw new Error("La imagen pesa más de 2MB");
            showSuccess('Subiendo logo...');
            const newUrl = await adminService.uploadCoachLogo(coachId, file);
            setUsers(users.map(u => u.id === coachId ? { ...u, logo_url: newUrl } : u));
            showSuccess('Logo de marca actualizado');
        } catch (err: unknown) {
            showError(err instanceof Error ? err.message : 'Error al subir el logo');
        }
    };

    // Filter logic
    const coaches = users.filter(u => u.role === 'coach');
    const nutritionists = users.filter(u => u.role === 'nutritionist');

    const filteredUsers = users.filter(u => {
        // Text search
        const lowerReq = searchTerm.toLowerCase();
        const matchesSearch = u.full_name?.toLowerCase().includes(lowerReq) ||
                            u.email?.toLowerCase().includes(lowerReq) ||
                            u.nickname?.toLowerCase().includes(lowerReq);
        
        if (!matchesSearch) return false;

        // Tab filter
        if (activeTab === 'todos') return true;
        if (activeTab === 'atletas') return u.role === 'athlete';
        if (activeTab === 'entrenadores') return u.role === 'coach';
        if (activeTab === 'nutricionistas') return u.role === 'nutritionist';
        return true;
    });

    // Auth protection check
    if (isUserLoading) {
        return (
            <div className="min-h-[100dvh] bg-surface-sunken text-ink flex items-center justify-center p-4">
                <Loader className="animate-spin text-brand-text h-8 w-8" />
            </div>
        );
    }

    if (!isAdmin(currentUser)) {
        return <Navigate to="/" replace />;
    }

    // Render helpers
    const renderUserAvatar = (user: UserProfile) => (
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-black/50 overflow-hidden border border-line flex items-center justify-center flex-shrink-0">
                {user.avatar_url ? (
                    <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                ) : (
                    <span className="font-bold text-ink-subtle">{user.full_name?.charAt(0) || '?'}</span>
                )}
            </div>
            <div>
                <p className="font-bold text-ink leading-tight">
                    {user.full_name}
                </p>
                {user.nickname && (
                    <p className="text-xs text-brand-text font-semibold">
                        "{user.nickname}"
                    </p>
                )}
            </div>
        </div>
    );

    const tabs = [
        { id: 'todos', label: 'Todos', icon: Users },
        { id: 'atletas', label: 'Atletas', icon: Activity },
        { id: 'entrenadores', label: 'Entrenadores', icon: Dumbbell },
        { id: 'nutricionistas', label: 'Nutricionistas', icon: Apple },
    ];

    return (
        <div className="min-h-[100dvh] bg-surface-sunken text-ink pt-24 pb-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">

                {/* Header Section */}
                <div className="mb-8 border-b border-line pb-6">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-black uppercase flex items-center gap-3">
                                <ShieldAlert className="text-brand-text" size={32} />
                                Panel de <span className="text-brand-text">Administración</span>
                            </h1>
                            <p className="text-ink-muted mt-2">
                                Gestión oficial exclusiva para administradores
                            </p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto items-center">
                            <button
                                onClick={() => navigate('/web')}
                                className="flex items-center justify-center gap-2 bg-surface-sunken hover:bg-white/5 text-info border border-line px-4 py-2 rounded-lg font-bold uppercase transition-colors whitespace-nowrap shadow-lg active:scale-95"
                            >
                                <Globe size={18} />
                                Ver Web
                            </button>
                            {hasChanges && (
                                <button
                                    onClick={handleSaveChanges}
                                    disabled={isSaving}
                                    className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-ink px-4 py-2 rounded-lg font-bold uppercase transition-colors whitespace-nowrap shadow-lg shadow-green-900/20 disabled:opacity-50"
                                >
                                    {isSaving ? <Loader className="animate-spin" size={18} /> : <Save size={18} />}
                                    Guardar Cambios ({pendingChanges.length})
                                </button>
                            )}
                            <div className="relative w-full max-w-sm">
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre o email..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-surface-sunken border border-line text-ink pl-10 pr-4 py-2 rounded-lg focus:border-anvil-red transition-colors"
                                />
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" size={18} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex flex-wrap gap-2 mb-8">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as TabType)}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm uppercase transition-[background-color,border-color,box-shadow,color] ${
 isActive 
 ? 'bg-anvil-red text-ink shadow-lg shadow-anvil-red/20' 
 : 'bg-surface-sunken text-ink-muted border border-subtle hover:border-strong hover:text-ink'
 }`}
                            >
                                <Icon size={18} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Alerts */}
                {errorVisible && (
                    <div className="mb-6 bg-danger-quiet border border-danger/20 text-danger-text p-4 rounded-lg flex items-center gap-3 font-bold">
                        <X size={20} />
                        {errorVisible}
                    </div>
                )}

                {successMsg && (
                    <div className="mb-6 bg-success-quiet border border-success/20 text-success p-4 rounded-lg flex items-center gap-3 font-bold">
                        <Check size={20} />
                        {successMsg}
                    </div>
                )}

                {/* Users Table / List */}
                {isLoading ? (
                    <div className="flex items-center justify-center p-12">
                        <Loader className="animate-spin text-brand-text h-12 w-12" />
                    </div>
                ) : (
                    <div className="bg-surface-sunken border border-line rounded-xl overflow-hidden shadow-2xl">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-black/40 border-b border-line text-sm font-bold text-ink-muted uppercase tracking-wider">
                                        <th className="p-4 pl-6 w-1/4">Usuario</th>
                                        <th className="p-4 w-1/4">Email</th>
                                        
                                        {activeTab === 'todos' && (
                                            <>
                                                <th className="p-4">Rol</th>
                                                <th className="p-4 w-32 text-center">Acceso</th>
                                            </>
                                        )}
                                        
                                        {activeTab === 'atletas' && (
                                            <>
                                                <th className="p-4">Entrenador</th>
                                                <th className="p-4">Nutricionista</th>
                                            </>
                                        )}

                                        {activeTab === 'entrenadores' && (
                                            <>
                                                <th className="p-4 w-24 text-center">Color</th>
                                                <th className="p-4 w-32">Logo</th>
                                                <th className="p-4">Atletas Asignados</th>
                                            </>
                                        )}

                                        {activeTab === 'nutricionistas' && (
                                            <>
                                                <th className="p-4">Atletas Asignados</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-subtle">
                                    {filteredUsers.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-ink-subtle italic">
                                                No se encontraron usuarios
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredUsers.map((user) => (
                                            <tr key={user.id} className="hover:bg-white/5 transition-colors group">
                                                <td className="p-4 pl-6">
                                                    {renderUserAvatar(user)}
                                                </td>
                                                <td className="p-4">
                                                    <span className="text-ink text-sm">{user.email || 'N/A'}</span>
                                                </td>

                                                {/* Columnas para Todos */}
                                                {activeTab === 'todos' && (
                                                    <>
                                                        <td className="p-4">
                                                            <div className="relative inline-block w-40">
                                                                <select
                                                                    value={user.role}
                                                                    onChange={(e) => changeRole(user.id, e.target.value as 'coach' | 'athlete' | 'nutritionist')}
                                                                    className={`w-full appearance-none bg-surface-sunken border rounded-lg px-3 py-1.5 text-sm font-bold uppercase cursor-pointer transition-colors ${user.role === 'coach'
 ? 'border-indigo-500/30 text-indigo-400 hover:border-indigo-500/60'
 : user.role === 'nutritionist'
 ? 'border-emerald-500/30 text-success hover:border-emerald-500/60'
 : 'border-line text-ink hover:border-white/30'
 }`}
                                                                >
                                                                    <option value="athlete" className="bg-surface-sunken text-ink">Atleta</option>
                                                                    <option value="coach" className="bg-surface-sunken text-indigo-400">Entrenador</option>
                                                                    <option value="nutritionist" className="bg-surface-sunken text-success">Nutricionista</option>
                                                                </select>
                                                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-ink-subtle">
                                                                    <Shield size={14} />
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-4">
                                                            <button
                                                                onClick={() => toggleAccess(user.id, user.has_access)}
                                                                className={`mx-auto flex items-center justify-center gap-2 px-4 py-2 w-full max-w-[120px] rounded-lg font-bold text-sm uppercase transition-[background-color,border-color,box-shadow,color,transform] shadow-md active:scale-95 ${user.has_access
 ? 'bg-success-quiet text-success border border-green-500/30 hover:bg-green-500/20 shadow-green-500/5'
 : 'bg-danger-quiet text-danger-text border border-red-500/30 hover:bg-red-500/20 shadow-red-500/5'
 }`}
                                                            >
                                                                {user.has_access ? (
                                                                    <>
                                                                        <UserCheck size={16} /> Alta
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <UserX size={16} /> Baja
                                                                    </>
                                                                )}
                                                            </button>
                                                        </td>
                                                    </>
                                                )}

                                                {/* Columnas para Atletas */}
                                                {activeTab === 'atletas' && (
                                                    <>
                                                        <td className="p-4">
                                                            <div className="relative inline-block w-full min-w-[180px]">
                                                                <select
                                                                    value={user.coach_id || 'unassigned'}
                                                                    onChange={(e) => changeCoach(user.id, e.target.value)}
                                                                    className="w-full appearance-none bg-surface-sunken border border-line rounded-lg px-3 py-2 text-sm text-ink font-semibold cursor-pointer focus:border-anvil-red transition-colors"
                                                                >
                                                                    <option value="unassigned" className="bg-surface-sunken text-ink-subtle">Sin asignar</option>
                                                                    {coaches.map(c => (
                                                                        <option key={c.id} value={c.id} className="bg-surface-sunken text-indigo-400">{c.full_name}</option>
                                                                    ))}
                                                                </select>
                                                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-ink-subtle">
                                                                    <Dumbbell size={14} />
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="relative inline-block w-full min-w-[180px]">
                                                                <select
                                                                    value={user.nutritionist_id || 'unassigned'}
                                                                    onChange={(e) => changeNutritionist(user.id, e.target.value)}
                                                                    className="w-full appearance-none bg-surface-sunken border border-line rounded-lg px-3 py-2 text-sm text-ink font-semibold cursor-pointer focus:border-anvil-red transition-colors"
                                                                >
                                                                    <option value="unassigned" className="bg-surface-sunken text-ink-subtle">Sin asignar</option>
                                                                    {nutritionists.map(n => (
                                                                        <option key={n.id} value={n.id} className="bg-surface-sunken text-success">{n.full_name}</option>
                                                                    ))}
                                                                </select>
                                                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-ink-subtle">
                                                                    <Apple size={14} />
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </>
                                                )}

                                                {/* Columnas para Entrenadores */}
                                                {activeTab === 'entrenadores' && (
                                                    <>
                                                        <td className="p-4 text-center">
                                                            <input 
                                                                type="color" 
                                                                value={user.brand_color || '#dc2626'} 
                                                                onChange={(e) => setUsers(users.map(u => u.id === user.id ? { ...u, brand_color: e.target.value } : u))}
                                                                onBlur={(e) => updateBrandColor(user.id, e.target.value)}
                                                                className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent flex-shrink-0"
                                                            />
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="flex items-center gap-2">
                                                                {user.logo_url && (
                                                                    <img src={user.logo_url} alt="Logo" className="w-8 h-8 object-contain bg-white/5 rounded flex-shrink-0" />
                                                                )}
                                                                <label className="text-t-2xs font-bold uppercase bg-surface-sunken hover:bg-white/10 px-2 py-1.5 border border-strong rounded cursor-pointer transition-colors whitespace-nowrap text-ink">
                                                                    Subir
                                                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleLogoUpload(user.id, e.target.files[0])} />
                                                                </label>
                                                            </div>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="flex flex-wrap gap-2">
                                                                {users.filter(u => u.coach_id === user.id).length > 0 ? (
                                                                    users.filter(u => u.coach_id === user.id).map(athlete => (
                                                                        <span key={athlete.id} className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-1 rounded text-xs font-bold whitespace-nowrap">
                                                                            {athlete.full_name}
                                                                        </span>
                                                                    ))
                                                                ) : (
                                                                    <span className="text-ink-subtle text-sm italic">Ningún atleta asignado</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </>
                                                )}

                                                {/* Columnas para Nutricionistas */}
                                                {activeTab === 'nutricionistas' && (
                                                    <td className="p-4">
                                                        <div className="flex flex-wrap gap-2">
                                                            {users.filter(u => u.nutritionist_id === user.id).length > 0 ? (
                                                                users.filter(u => u.nutritionist_id === user.id).map(athlete => (
                                                                    <span key={athlete.id} className="bg-success-quiet text-success border border-success/20 px-2 py-1 rounded text-xs font-bold">
                                                                        {athlete.full_name}
                                                                    </span>
                                                                ))
                                                            ) : (
                                                                <span className="text-ink-subtle text-sm italic">Ningún atleta asignado</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                )}

                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
