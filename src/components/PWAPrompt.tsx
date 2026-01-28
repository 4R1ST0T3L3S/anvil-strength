import { useState, useEffect } from 'react';
import { X, Share, PlusSquare } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export const PWAPrompt = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [isIOS, setIsIOS] = useState(false);

    useEffect(() => {
        // Check if it's iOS
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        setIsIOS(isIOSDevice);

        // Check if already in standalone mode
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;

        if (isStandalone) {
            return;
        }

        if (isIOSDevice) {
            // Show prompt for iOS after a small delay
            const timer = setTimeout(() => setShowPrompt(true), 3000);
            return () => clearTimeout(timer);
        } else {
            // Android / Desktop logic
            const handleBeforeInstallPrompt = (e: any) => {
                e.preventDefault();
                setDeferredPrompt(e);
                setShowPrompt(true);
            };

            window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

            return () => {
                window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            };
        }
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            setDeferredPrompt(null);
            setShowPrompt(false);
        }
    };

    const closePrompt = () => {
        setShowPrompt(false);
    };

    if (!showPrompt) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-[#1c1c1c] border-t border-white/10 shadow-2xl safe-area-bottom"
            >
                <div className="max-w-[1400px] mx-auto flex flex-col gap-4">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <h3 className="text-white font-bold text-lg mb-1">
                                Instala Anvil Strength App
                            </h3>
                            <p className="text-gray-400 text-sm">
                                {isIOS
                                    ? "Para una mejor experiencia, añade la app a tu pantalla de inicio."
                                    : "Accede más rápido y úsala offline instalando la aplicación."}
                            </p>
                        </div>
                        <button
                            onClick={closePrompt}
                            className="p-1 hover:bg-white/10 rounded-full transition-colors text-gray-400"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {isIOS ? (
                        <div className="flex flex-col gap-2 text-sm text-gray-300 bg-white/5 p-3 rounded-lg border border-white/5">
                            <div className="flex items-center gap-3">
                                <span className="flex items-center justify-center w-6 h-6 bg-white/10 rounded-full text-xs">1</span>
                                <span>Pulsa el botón <strong>Compartir</strong> <Share className="inline w-4 h-4 ml-1" /></span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="flex items-center justify-center w-6 h-6 bg-white/10 rounded-full text-xs">2</span>
                                <span>Busca y selecciona <strong>Añadir a inicio</strong> <PlusSquare className="inline w-4 h-4 ml-1" /></span>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={handleInstallClick}
                            className="w-full bg-[#E31B1B] text-white font-bold py-3 px-4 rounded-lg hover:bg-red-700 transition-colors active:scale-95 transform"
                        >
                            Instalar Aplicación
                        </button>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
