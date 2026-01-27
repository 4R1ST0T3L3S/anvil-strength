import React, { useState, useEffect } from 'react';
import { Trophy, FileText, Mail, Instagram, Menu, X, User, ShoppingBag } from 'lucide-react';
import { AuthModal } from './components/AuthModal';
import { TeamModal } from './components/TeamModal';
import { athletes } from './data/athletes';

function App() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    
    // Check for stored user
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setIsMobileMenuOpen(false);
    }
  };

  const navLinks = [
    { name: 'FILOSOFÍA', href: '#filosofia' },
    { name: 'ENTRENADORES', href: '#entrenadores' },
    { name: 'ATLETAS', href: '#atletas' },
    { name: 'LOGROS', href: '#logros' },
    { name: 'AFILIATE', href: '#afiliacion' },
  ];

  return (
    <div className="min-h-screen bg-[#1c1c1c] text-white selection:bg-anvil-red selection:text-white font-sans">
      {/* SBD-style Header */}
      <header 
        className={`fixed w-full z-50 transition-all duration-300 ${
          isScrolled ? 'bg-[#1c1c1c] shadow-lg py-2' : 'bg-transparent py-6'
        }`}
      >
        <div className="max-w-[1400px] mx-auto px-6 flex items-center justify-between md:justify-center md:gap-12">
          {/* Logo */}
          <div className="flex-shrink-0">
            <a href="#" className="block hover:opacity-80 transition-opacity">
              <img 
                src="/logo.svg" 
                alt="Anvil Strength Logo" 
                className="h-10 md:h-12 w-auto object-contain"
              />
            </a>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              <a 
                key={link.name} 
                href={link.href} 
                onClick={(e) => handleNavClick(e, link.href)}
                className="text-sm font-bold tracking-wider text-gray-300 hover:text-white transition-colors uppercase"
              >
                {link.name}
              </a>
            ))}
          </nav>

          {/* Right Icons (SBD Style) */}
          <div className="flex items-center space-x-4 md:space-x-6">
            {user ? (
              <div className="flex items-center gap-4">
                <span className="hidden md:block text-white text-sm font-bold uppercase">{user.name}</span>
                <button 
                  onClick={handleLogout}
                  className="text-gray-300 hover:text-anvil-red text-xs font-bold uppercase"
                >
                  <span className="hidden md:inline">Salir</span>
                  <span className="md:hidden"><User className="h-5 w-5 text-anvil-red" /></span>
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setIsAuthModalOpen(true)}
                className="text-gray-300 hover:text-white"
              >
                <User className="h-5 w-5" />
              </button>
            )}
            <button className="hidden md:block text-gray-300 hover:text-white relative">
              <ShoppingBag className="h-5 w-5" />
              <span className="absolute -top-2 -right-2 bg-anvil-red text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full">0</span>
            </button>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-white p-2"
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-[#1c1c1c] border-t border-white/10 absolute w-full">
            <div className="px-4 pt-2 pb-4 space-y-1">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  className="block px-3 py-4 text-base font-bold text-gray-300 hover:text-white hover:bg-white/5 border-b border-white/5"
                  onClick={(e) => handleNavClick(e, link.href)}
                >
                  {link.name}
                </a>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center">
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1c1c1c] via-transparent to-transparent" />
        </div>
        <div className="relative z-10 text-center px-4 max-w-5xl mx-auto mt-20 md:mt-80">
          <h1 className="text-5xl sm:text-6xl md:text-9xl font-black tracking-tighter mb-8 text-white flex flex-col md:block items-center gap-2 md:gap-0">
            <span>ANVIL</span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-200 to-gray-500">STRENGTH</span>
          </h1>
          <p className="text-lg md:text-3xl text-gray-200 mb-12 font-bold tracking-wide uppercase max-w-lg mx-auto md:max-w-none">
            Trabajamos con datos no con sensaciones
          </p>
          <div className="flex flex-col md:flex-row gap-4 justify-center">
            <a 
              href="#afiliacion" 
              onClick={(e) => handleNavClick(e, '#afiliacion')}
              className="inline-block bg-white text-black hover:bg-gray-200 font-black py-4 px-10 rounded-sm transition-all uppercase tracking-wider"
            >
              Únete al equipo
            </a>
            <a 
              href="#filosofia" 
              onClick={(e) => handleNavClick(e, '#filosofia')}
              className="inline-block border-2 border-white text-white hover:bg-white hover:text-black font-black py-4 px-10 rounded-sm transition-all uppercase tracking-wider"
            >
              Nuestra Filosofía
            </a>
          </div>
        </div>
      </section>

      {/* Filosofía Section */}
      <section id="filosofia" className="min-h-screen flex flex-col justify-center py-32 bg-[#1c1c1c]">
        <div className="max-w-[1400px] mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-20 items-center">
          <div className="text-center md:text-left">
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-8 uppercase">
              Forjados en <br/> <span className="text-anvil-red">Hierro</span>
            </h2>
            <div className="space-y-6 text-lg text-gray-400 leading-relaxed font-medium">
              <p>
                No somos un club que se basa en sensaciones o planificaciones tradicionales. <span className="text-white font-bold">Llevamos la ciencia al límite.</span>
              </p>
              <p>
                Nos basamos en <span className="text-anvil-red font-bold">VBT (Velocity Based Training)</span>, llevando la calidad, personalización y precisión al máximo en cada entrenamiento.
              </p>
              <p>
                No construimos perdedores, <span className="text-white font-bold">construimos atletas de alto rendimiento</span>. Porque para rendir como tal, necesitas programaciones de alto nivel. En un deporte con normas de competición, <span className="text-anvil-red font-bold">debes entrenar con normas de competición.</span>
              </p>
            </div>
          </div>
          <div className="relative">
             <div className="aspect-[4/5] bg-gray-800 rounded-sm overflow-hidden grayscale hover:grayscale-0 transition-all duration-500">
                <img src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=2070&auto=format&fit=crop" alt="Filosofía" className="w-full h-full object-cover" />
             </div>
             <div className="absolute -bottom-10 -left-10 w-full h-full border-2 border-anvil-red -z-10 hidden md:block"></div>
          </div>
        </div>
      </section>

      {/* Entrenadores Section */}
      <section id="entrenadores" className="min-h-[70vh] flex flex-col justify-center py-20 bg-[#252525]">
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase mb-4">Entrenadores</h2>
            <div className="w-20 h-1 bg-anvil-red mx-auto"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Coach 1 */}
            <div className="group relative overflow-hidden bg-[#1c1c1c] aspect-[3/4] shadow-2xl rounded-sm">
              <img src="https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?q=80&w=2070&auto=format&fit=crop" alt="Javier Estelles" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 grayscale group-hover:grayscale-0" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-8">
                <h3 className="text-3xl font-bold text-white uppercase mb-1">Javier Estelles</h3>
                <p className="text-anvil-red font-bold tracking-wider mb-4">ENTRENADOR Y NUTRICIONISTA</p>
                <div className="flex gap-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-y-4 group-hover:translate-y-0">
                  <a href="https://www.instagram.com/javierestelles?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==" target="_blank" rel="noopener noreferrer" className="p-2 bg-white text-black hover:bg-anvil-red hover:text-white transition-colors"><Instagram size={20} /></a>
                  <a href="#" className="p-2 bg-white text-black hover:bg-anvil-red hover:text-white transition-colors"><Mail size={20} /></a>
                </div>
              </div>
            </div>

            {/* Coach 2 */}
            <div className="group relative overflow-hidden bg-[#1c1c1c] aspect-[3/4] shadow-2xl rounded-sm">
              <img src="https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?q=80&w=2070&auto=format&fit=crop" alt="Javier Bou" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 grayscale group-hover:grayscale-0" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-8">
                <h3 className="text-3xl font-bold text-white uppercase mb-1">Javier Bou</h3>
                <p className="text-anvil-red font-bold tracking-wider mb-4">ENTRENADOR DE POWERLIFTING</p>
                <div className="flex gap-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-y-4 group-hover:translate-y-0">
                  <a href="https://www.instagram.com/boustrength?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==" target="_blank" rel="noopener noreferrer" className="p-2 bg-white text-black hover:bg-anvil-red hover:text-white transition-colors"><Instagram size={20} /></a>
                  <a href="#" className="p-2 bg-white text-black hover:bg-anvil-red hover:text-white transition-colors"><Mail size={20} /></a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Atletas Section */}
      <section id="atletas" className="min-h-screen flex flex-col justify-center py-32 bg-[#1c1c1c]">
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="flex justify-between items-end mb-16">
             <div>
                <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase mb-4">Nuestros Atletas</h2>
                <div className="w-20 h-1 bg-anvil-red"></div>
             </div>
             <button 
               onClick={() => setIsTeamModalOpen(true)}
               className="hidden md:block text-gray-400 hover:text-white font-bold uppercase tracking-wider text-sm transition-colors"
             >
               Ver todo el equipo &rarr;
             </button>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
             {athletes.slice(0, 4).map((athlete) => (
                <div key={athlete.id} className="group relative aspect-[4/5] bg-[#252525] overflow-hidden">
                   <img src={athlete.image} alt={athlete.name} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                   <div className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-black/90 to-transparent">
                      <p className="text-white font-bold uppercase">{athlete.name}</p>
                      <p className="text-xs text-gray-400 uppercase">{athlete.category}</p>
                   </div>
                </div>
             ))}
          </div>
        </div>
      </section>

      {/* Logros Section */}
      <section id="logros" className="min-h-screen flex flex-col justify-center py-32 bg-[#252525]">
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase mb-4">Logros Recientes</h2>
            <p className="text-gray-400">Resultados que hablan por sí solos.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { title: "Campeonato Nacional 2024", result: "3 Medallas de Oro", desc: "Récord Nacional Peso Muerto" },
              { title: "Copa Regional Norte", result: "1er Lugar por Equipos", desc: "Dominio total categoría -93kg" },
              { title: "Mundial Powerlifting", result: "Top 10 Mundial", desc: "Representación Internacional" }
            ].map((item, i) => (
              <div key={i} className="bg-[#1c1c1c] p-10 border border-white/5 hover:border-anvil-red/50 transition-colors group">
                <Trophy className="h-10 w-10 text-anvil-red mb-6" />
                <h3 className="text-2xl font-bold text-white uppercase mb-2">{item.title}</h3>
                <p className="text-xl text-gray-300 font-bold mb-4">{item.result}</p>
                <p className="text-gray-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Afiliación Section */}
      <section id="afiliacion" className="min-h-screen flex flex-col justify-center py-32 bg-anvil-red relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-8 text-white uppercase">
            ¿Listo para competir?
          </h2>
          <p className="text-white/90 text-xl mb-12 font-medium">
            Únete a Anvil Strength. Descarga los documentos necesarios y comienza tu camino hacia la tarima.
          </p>
          
          <div className="flex flex-col md:flex-row gap-6 justify-center">
             <a href="https://docs.google.com/forms/d/e/1FAIpQLSckZ2BU0Plvxk0ceGvYsRgg3ELS2jap8Rnqjzicbpy_zjwR2g/viewform" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-3 bg-black text-white hover:bg-gray-900 py-4 px-8 rounded-sm font-bold uppercase tracking-wider transition-all">
                <FileText size={20} />
                Formulario de Inscripción
             </a>
             <button className="flex items-center justify-center gap-3 bg-white text-anvil-red hover:bg-gray-100 py-4 px-8 rounded-sm font-bold uppercase tracking-wider transition-all">
                <FileText size={20} />
                Normativa del Equipo
             </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black py-16 border-t border-white/10">
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-2">
               {/* Footer Logo */}
               <span className="font-black text-2xl tracking-tighter text-white">ANVIL STRENGTH</span>
            </div>
            <div className="flex gap-8 text-sm font-bold text-gray-500 uppercase tracking-wider">
               <a href="https://www.instagram.com/anvilstrength_?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Instagram</a>
               <a href="#" className="hover:text-white transition-colors">Email</a>
               <a href="#" className="hover:text-white transition-colors">Aviso Legal</a>
            </div>
          </div>
          <p className="mt-8 text-center md:text-left text-xs text-gray-700 font-medium uppercase tracking-widest">
            © 2025 Anvil Strength Powerlifting Team. Todos los derechos reservados.
          </p>
        </div>
      </footer>

      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        onLogin={setUser}
      />
      
      <TeamModal
        isOpen={isTeamModalOpen}
        onClose={() => setIsTeamModalOpen(false)}
        athletes={athletes}
      />
    </div>
  );
}

export default App;
