// Forzando actualización de claves
import React, { useState, useEffect } from 'react';
import { AuthModal } from './components/AuthModal';
import { SettingsModal } from './components/SettingsModal';
import { PWAPrompt } from './components/PWAPrompt';
import { supabase } from './lib/supabase';
import { LandingPage } from './pages/LandingPage';
import { UserDashboard } from './pages/UserDashboard';

function App() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Initial session check
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // Fetch profile
        let { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profileError && profileError.code === 'PGRST116') {
          const { data: newProfile } = await supabase
            .from('profiles')
            .insert([{
              id: session.user.id,
              name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
              nickname: session.user.user_metadata?.nickname || 'Atleta'
            }])
            .select()
            .single();
          profile = newProfile;
        }

        const userData = { ...session.user, ...profile };
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
      }
    };

    checkUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Evento de Auth detectado:', event);

      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
        try {
          console.log('Recuperando perfil para:', session.user.id);
          let { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profileError && profileError.code === 'PGRST116') {
            console.log('Perfil no encontrado, creando perfil de emergencia...');
            const { data: newProfile, error: createError } = await supabase
              .from('profiles')
              .insert([{
                id: session.user.id,
                name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
                nickname: session.user.user_metadata?.nickname || 'Atleta'
              }])
              .select()
              .single();

            if (createError) console.error('Error creando perfil:', createError);
            profile = newProfile;
          }

          const userData = { ...session.user, ...profile };
          setUser(userData);
          localStorage.setItem('user', JSON.stringify(userData));
          setIsAuthModalOpen(false);
          console.log('Usuario cargado correctamente');
        } catch (err) {
          console.error('Error crítico en onAuthStateChange:', err);
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        localStorage.removeItem('user');
        console.log('Sesión cerrada');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-[#1c1c1c] text-white selection:bg-anvil-red selection:text-white font-sans">
      {user ? (
        <UserDashboard user={user} onLogout={handleLogout} />
      ) : (
        <LandingPage onLoginClick={() => setIsAuthModalOpen(true)} user={user} />
      )}

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLogin={setUser}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        user={user}
        onUpdate={setUser}
      />
      <PWAPrompt />
    </div>
  );
}

export default App;
