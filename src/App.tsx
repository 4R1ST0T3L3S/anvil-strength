// Forzando actualización de claves
import React, { useState, useEffect } from 'react';
import { AuthModal } from './components/AuthModal';
import { SettingsModal } from './components/SettingsModal';
import { PWAPrompt } from './components/PWAPrompt';
import { supabase } from './lib/supabase';
import { LandingPage } from './pages/LandingPage';
import { UserDashboard } from './pages/UserDashboard';
import { CoachDashboard } from './pages/CoachDashboard';

function App() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Initialize from localStorage to prevent flash of logged-out state
  const [user, setUser] = useState<any>(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

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
              full_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
              nickname: session.user.user_metadata?.nickname || 'Atleta',
              role: 'athlete'
            }])
            .select()
            .single();
          profile = newProfile;
        }

        // Map DB columns (full_name, avatar_url) to UI expected keys (name, profile_image)
        const userData = {
          ...session.user,
          ...profile,
          name: profile?.full_name || profile?.name || session.user.user_metadata?.full_name,
          profile_image: profile?.avatar_url || profile?.profile_image || session.user.user_metadata?.avatar_url,
          role: profile?.role || 'athlete'
        };

        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
      }
    };

    checkUser();

    // Helper to fetch profile with timeout
    const fetchProfileSafely = async (userId: string, meta: any) => {
      try {
        console.log('Fetching profile for:', userId);

        // Timeout promise
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
        );

        // Fetch promise
        const fetchPromise = supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        // Race them
        let { data: profile, error: profileError } = await Promise.race([fetchPromise, timeout]) as any;

        if (profileError && profileError.code === 'PGRST116') {
          console.log('Perfil no encontrado, creando perfil...');
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert([{
              id: userId,
              full_name: meta?.full_name || 'Atleta',
              nickname: meta?.nickname || 'Atleta'
            }])
            .select()
            .single();

          if (createError) {
            console.error('Error creating profile:', createError);
            throw createError;
          }
          profile = newProfile;
        } else if (profileError) {
          throw profileError;
        }

        return profile;
      } catch (err) {
        console.error('Error fetching/creating profile:', err);
        // Fallback to minimal profile from metadata if DB fails
        return {
          id: userId,
          name: meta?.full_name || 'Atleta',
          nickname: meta?.nickname || 'Atleta',
          role: 'athlete'
        };
      }
    };

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Evento de Auth detectado:', event);

      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
        try {
          const profile = await fetchProfileSafely(session.user.id, session.user.user_metadata);

          // Map DB columns (full_name, avatar_url) to UI expected keys (name, profile_image)
          const userData = {
            ...session.user,
            ...profile,
            name: profile?.full_name || profile?.name,
            profile_image: profile?.avatar_url || profile?.profile_image,
            role: profile?.role || 'athlete'
          };
          setUser(userData);
          localStorage.setItem('user', JSON.stringify(userData));
          setIsAuthModalOpen(false); // Close modal if open
          console.log('Usuario cargado y modal cerrado');
        } catch (err) {
          console.error('Critical Auth Error:', err);
          // Even on error, if we have a session, let them in with basic data
          setUser(session.user);
          setIsAuthModalOpen(false);
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
    setUser(null);
    localStorage.removeItem('user');
  };

  // Navigation state
  const [currentView, setCurrentView] = useState<'dashboard' | 'landing' | 'coach_dashboard'>('landing');

  // Update view when user state changes
  useEffect(() => {
    if (user) {
      setCurrentView('dashboard');
    } else {
      setCurrentView('landing');
    }
  }, [user]);

  return (
    <div className="min-h-screen bg-[#1c1c1c] text-white selection:bg-anvil-red selection:text-white font-sans">
      {user && currentView === 'dashboard' ? (
        <UserDashboard
          user={user}
          onLogout={handleLogout}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onGoToHome={() => setCurrentView('landing')}
          onGoToCoachDashboard={() => setCurrentView('coach_dashboard')}
        />
      ) : user && currentView === 'coach_dashboard' ? (
        <CoachDashboard
          user={user}
          onBack={() => setCurrentView('dashboard')}
        />
      ) : (
        <LandingPage
          onLoginClick={() => setIsAuthModalOpen(true)}
          user={user}
          onGoToDashboard={() => setCurrentView('dashboard')}
        />
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
