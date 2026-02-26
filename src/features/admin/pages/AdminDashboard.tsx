import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useUser, UserProfile } from '../../../hooks/useUser';
import { adminService } from '../services/adminService';
import { Loader, UserCheck, UserX, Shield, ShieldAlert, Check, X, Search } from 'lucide-react';

export function AdminDashboard() {
    const { data: currentUser, isLoading: isUserLoading } = useUser();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Function to load users
    const loadUsers = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const data = await adminService.getAllUsers();

            // Filter out the current admin user since the email column isn't in the database to filter backend
            const filteredData = data.filter(u => u.id !== currentUser?.id);

            setUsers(filteredData);
            setFilteredUsers(filteredData);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Error al cargar usuarios');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (currentUser?.email === 'anvilstrength@gmail.com') {
            loadUsers();
        }
    }, [currentUser]);

    useEffect(() => {
        if (searchTerm.trim() === '') {
            setFilteredUsers(users);
        } else {
            const lowerReq = searchTerm.toLowerCase();
            setFilteredUsers(
                users.filter(u =>
                    u.full_name?.toLowerCase().includes(lowerReq) ||
                    u.email?.toLowerCase().includes(lowerReq) ||
                    u.nickname?.toLowerCase().includes(lowerReq)
                )
            );
        }
    }, [searchTerm, users]);

    // Show message briefly
    const showSuccess = (msg: string) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(null), 3000);
    };

    const showError = (msg: string) => {
        setError(msg);
        setTimeout(() => setError(null), 5000);
    };

    const toggleAccess = async (userId: string, currentAccess: boolean) => {
        try {
            // Optimistic update
            setUsers(users.map(u => u.id === userId ? { ...u, has_access: !currentAccess } : u));
            await adminService.updateUserAccess(userId, !currentAccess);
            showSuccess(`Acceso ${!currentAccess ? 'concedido' : 'revocado'}`);
        } catch (err) {
            // Revert on error
            setUsers(users.map(u => u.id === userId ? { ...u, has_access: currentAccess } : u));
            showError('Error al actualizar acceso');
        }
    };

    const changeRole = async (userId: string, newRole: 'coach' | 'athlete' | 'nutritionist') => {
        try {
            const uIndex = users.findIndex(u => u.id === userId);
            if (uIndex === -1) return;

            // Optimistic update
            setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
            await adminService.updateUserRole(userId, newRole);
            const roleName = newRole === 'coach' ? 'Entrenador' : newRole === 'nutritionist' ? 'Nutricionista' : 'Atleta';
            showSuccess(`Rol actualizado a ${roleName}`);
        } catch (err) {
            // Revert
            const restoredUser = users.find(u => u.id === userId);
            if (restoredUser) {
                // Simplified revert for optimistic UI update failure
                setUsers(users.map(u => u.id === userId ? { ...u, role: restoredUser.role } : u));
            }
            showError('Error al actualizar rol');
        }
    };

    // Auth protection check
    if (isUserLoading) {
        return (
            <div className="min-h-screen bg-[#1c1c1c] text-white flex items-center justify-center p-4">
                <Loader className="animate-spin text-anvil-red h-8 w-8" />
            </div>
        );
    }

    if (!currentUser || currentUser.email !== 'anvilstrength@gmail.com') {
        return <Navigate to="/" replace />;
    }

    return (
        <div className="min-h-screen bg-[#111] text-white pt-24 pb-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">

                {/* Header Section */}
                <div className="mb-8 border-b border-white/10 pb-6">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-black uppercase flex items-center gap-3">
                                <ShieldAlert className="text-anvil-red" size={32} />
                                Panel de <span className="text-anvil-red">Administración</span>
                            </h1>
                            <p className="text-gray-400 mt-2">
                                Gestión oficial exclusiva para la cuenta anvilstrength@gmail.com
                            </p>
                        </div>

                        <div className="relative max-w-sm w-full">
                            <input
                                type="text"
                                placeholder="Buscar por nombre o email..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-[#1c1c1c] border border-white/10 text-white pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-anvil-red transition-colors"
                            />
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                        </div>
                    </div>
                </div>

                {/* Alerts */}
                {error && (
                    <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-lg flex items-center gap-3 font-bold">
                        <X size={20} />
                        {error}
                    </div>
                )}

                {successMsg && (
                    <div className="mb-6 bg-green-500/10 border border-green-500/20 text-green-500 p-4 rounded-lg flex items-center gap-3 font-bold">
                        <Check size={20} />
                        {successMsg}
                    </div>
                )}

                {/* Users Table / List */}
                {isLoading ? (
                    <div className="flex items-center justify-center p-12">
                        <Loader className="animate-spin text-anvil-red h-12 w-12" />
                    </div>
                ) : (
                    <div className="bg-[#1c1c1c] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-black/40 border-b border-white/10 text-sm font-bold text-gray-400 uppercase tracking-wider">
                                        <th className="p-4 pl-6">Usuario</th>
                                        <th className="p-4">Email</th>
                                        <th className="p-4">Rol</th>
                                        <th className="p-4">Acceso</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredUsers.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-gray-500 italic">
                                                No se encontraron usuarios
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredUsers.map((user) => (
                                            <tr key={user.id} className="hover:bg-white/5 transition-colors group">
                                                <td className="p-4 pl-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-black/50 overflow-hidden border border-white/10 flex items-center justify-center flex-shrink-0">
                                                            {user.avatar_url ? (
                                                                <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span className="font-bold text-gray-500">{user.full_name?.charAt(0) || '?'}</span>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-white leading-tight">
                                                                {user.full_name}
                                                            </p>
                                                            {user.nickname && (
                                                                <p className="text-xs text-anvil-red font-semibold">
                                                                    "{user.nickname}"
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <span className="text-gray-300 text-sm">{user.email || 'N/A'}</span>
                                                </td>
                                                <td className="p-4">
                                                    <div className="relative inline-block w-40">
                                                        <select
                                                            value={user.role}
                                                            onChange={(e) => changeRole(user.id, e.target.value as 'coach' | 'athlete' | 'nutritionist')}
                                                            className={`w-full appearance-none bg-[#111] border rounded-lg px-3 py-1.5 text-sm font-bold uppercase cursor-pointer focus:outline-none transition-colors ${user.role === 'coach'
                                                                ? 'border-indigo-500/30 text-indigo-400 hover:border-indigo-500/60'
                                                                : user.role === 'nutritionist'
                                                                    ? 'border-emerald-500/30 text-emerald-400 hover:border-emerald-500/60'
                                                                    : 'border-white/10 text-gray-300 hover:border-white/30'
                                                                }`}
                                                        >
                                                            <option value="athlete" className="bg-[#111] text-gray-300">Atleta</option>
                                                            <option value="coach" className="bg-[#111] text-indigo-400">Entrenador</option>
                                                            <option value="nutritionist" className="bg-[#111] text-emerald-400">Nutricionista</option>
                                                        </select>
                                                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                                                            <Shield size={14} />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <button
                                                        onClick={() => toggleAccess(user.id, user.has_access)}
                                                        className={`flex items-center justify-center gap-2 px-4 py-2 w-32 rounded-lg font-bold text-sm uppercase transition-all shadow-md active:scale-95 ${user.has_access
                                                            ? 'bg-green-500/10 text-green-500 border border-green-500/30 hover:bg-green-500/20 shadow-green-500/5'
                                                            : 'bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20 shadow-red-500/5'
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
