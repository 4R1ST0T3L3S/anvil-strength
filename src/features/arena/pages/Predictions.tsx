import { useEffect, useState } from 'react'; // <--- 1. AÑADIDO useEffect y useState
import { useNavigate } from 'react-router-dom';
import { Trophy, ArrowLeft, TrendingUp, AlertCircle, Coins } from 'lucide-react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { supabase } from '../../../lib/supabase'; // <--- 2. AÑADIDO (Asegúrate de que la ruta a lib/supabase es correcta)

interface PredictionsProps {
  user: any;
}

export default function Predictions({ user }: PredictionsProps) {
  const navigate = useNavigate();
  const [balance, setBalance] = useState<number>(0); // Estado para guardar las monedas
  const [loading, setLoading] = useState(true);      // Estado de carga

  // --- 3. LÓGICA PARA TRAER LAS MONEDAS ---
  useEffect(() => {
    async function fetchCoins() {
      if (!user) return;

      try {
        // Buscamos en la tabla 'profiles' la columna 'coins' del usuario actual
        const { data, error } = await supabase
          .from('profiles')
          .select('coins')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error buscando monedas:', error);
        } else if (data) {
          // Si encontramos el dato, actualizamos el estado (si es null, ponemos 0)
          setBalance(data.coins || 0);
        }
      } catch (err) {
        console.error('Error de conexión:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchCoins();
  }, [user]); // Se ejecuta cuando cargamos el usuario

  const menuItems = [
    {
      icon: <ArrowLeft size={20} />,
      label: 'Volver al Inicio',
      isActive: false,
      onClick: () => navigate('/dashboard'),
    },
    {
      icon: <Trophy size={20} />,
      label: 'La Arena',
      isActive: true,
      onClick: () => { },
    }
  ];

  if (!user) return <div className="p-10 text-white">Cargando perfil...</div>;

  return (
    <DashboardLayout
      menuItems={menuItems}
    >
      <div className="p-4 md:p-8 text-white min-h-screen">
        {/* CABECERA */}
        <header className="mb-10 border-b border-gray-800 pb-6">
          <h1 className="text-4xl md:text-5xl font-black text-yellow-500 tracking-tighter uppercase mb-2 flex items-center gap-3">
            <Trophy className="h-10 w-10 md:h-12 md:w-12" />
            LA ARENA
          </h1>
          <p className="text-gray-400 text-lg">
            Usa tus <strong>Anvil Coins</strong> para apostar en los grandes eventos y ganar premios.
          </p>
        </header>

        {/* CONTENIDO PRINCIPAL */}
        <div className="grid md:grid-cols-2 gap-8">

          {/* TARJETA DE ESTADO (MONEDERO) */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-6 relative overflow-hidden">

            <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/10 rounded-full blur-3xl" />

            <div className="p-4 bg-gray-800 rounded-full border border-gray-700 relative z-10">
              <AlertCircle size={48} className="text-gray-500" />
            </div>

            <div className="relative z-10">
              <h2 className="text-2xl font-bold text-white mb-2">Zona de Apuestas</h2>
              <p className="text-gray-400 text-sm max-w-xs mx-auto">
                Pronto podrás multiplicar tus monedas acertando los resultados de la AEP.
              </p>
            </div>

            <div className="bg-gradient-to-r from-yellow-900/20 to-yellow-600/20 px-8 py-4 rounded-2xl border border-yellow-500/30 flex flex-col items-center w-full max-w-sm relative z-10">
              <span className="text-yellow-500/80 text-xs font-bold tracking-widest uppercase mb-1">SALDO ACTUAL</span>
              <div className="flex items-center gap-3">
                <Coins className={`h-8 w-8 text-yellow-400 ${loading ? 'animate-pulse' : ''}`} />

                {/* AQUÍ MOSTRAMOS EL SALDO REAL O UN SPINNER */}
                {loading ? (
                  <span className="text-2xl font-black text-gray-600">...</span>
                ) : (
                  <span className="text-5xl font-black text-white tracking-tighter drop-shadow-lg animate-in fade-in slide-in-from-bottom-2">
                    {balance}
                  </span>
                )}

                <span className="text-yellow-500 font-bold text-xl mt-2">AC</span>
              </div>
            </div>

          </div>

          {/* PRÓXIMOS EVENTOS */}
          <div className="space-y-4 opacity-50 pointer-events-none select-none">
            <h3 className="text-xl font-bold text-gray-300 flex items-center gap-2">
              <TrendingUp size={20} /> Próximos Eventos
            </h3>

            <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs text-green-400 font-bold bg-green-400/10 px-2 py-1 rounded">EN VIVO</span>
                <span className="text-xs text-gray-500">Marzo 2026</span>
              </div>
              <div className="font-bold text-lg">Mundial Sheffield 2026</div>
              <div className="text-sm text-gray-400">Ganador Absoluto Masculino</div>
            </div>

            <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs text-gray-500 font-bold bg-gray-700 px-2 py-1 rounded">PRÓXIMAMENTE</span>
                <span className="text-xs text-gray-500">Abril 2026</span>
              </div>
              <div className="font-bold text-lg">Nacionales AEP</div>
              <div className="text-sm text-gray-400">Récord de Total - Javi Bou</div>
            </div>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}