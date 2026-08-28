import React, { useEffect, useState } from 'react';

import { Share, PlusSquare, Download, MoreVertical, Smartphone } from 'lucide-react';

export const PwaInstallBlocker: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [shouldBlock, setShouldBlock] = useState(false);
    const [isIos, setIsIos] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    
    useEffect(() => {
        const handleBeforeInstallPrompt = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        
        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    useEffect(() => {
        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone || document.referrer.includes('android-app://');
        
        setIsIos(/iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream);

        // DESACTIVADO TEMPORALMENTE PARA DESARROLLO
        const bypass = true; // urlParams.get('bypass-pwa') === 'true';

        if (isMobileDevice && !isStandalone && !bypass) {
            setShouldBlock(true);
        }
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setDeferredPrompt(null);
        }
    };

    if (!shouldBlock) {
        return <>{children}</>;
    }

    return (
        <div className="fixed inset-0 z-[9999] bg-surface-canvas flex flex-col items-center justify-center p-6 text-center overflow-y-auto">
            <div className="flex flex-col items-center max-w-sm w-full animate-fade-in-up">
                
                <div className="w-32 h-32 mb-8 flex items-center justify-center animate-fade-in-up">
                    <img src="/logo-dark-removebg-preview.png" alt="Anvil Strength Logo" className="w-full h-auto object-contain" />
                </div>

                <h1 className="text-t-3xl font-black uppercase tracking-display text-ink mb-3">
                    Instala la App
                </h1>
                
                <p className="text-t-base text-ink-muted mb-10 leading-relaxed px-4">
                    Para entrenar con Anvil Strength y acceder a tu panel privado, debes instalar la aplicación en tu móvil.
                </p>

                {deferredPrompt ? (
                    <div className="w-full">
                        <button 
                            onClick={handleInstallClick}
                            className="flex w-full items-center justify-center gap-3 rounded-field bg-brand px-6 py-4 text-t-base font-black uppercase tracking-wide text-brand-ink transition-all hover:bg-brand-hover active:scale-[0.98] shadow-glow"
                        >
                            <Download size={22} />
                            Instalar aplicación
                        </button>
                        <p className="mt-4 text-t-xs text-ink-faint">Es rápido y 100% gratuito.</p>
                    </div>
                ) : (
                    <div className="bg-surface-raised rounded-card p-6 w-full border border-subtle text-left">
                        {isIos ? (
                            <>
                                <h3 className="font-bold text-ink mb-4 flex items-center gap-2">
                                    <Smartphone size={18} className="text-brand" /> 
                                    <span>En tu iPhone / iPad:</span>
                                </h3>
                                <ul className="text-t-sm text-ink-subtle space-y-4">
                                    <li className="flex items-start gap-3">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-overlay border border-subtle text-ink font-bold text-t-xs">1</span>
                                        <span>Abre esta página en <strong>Safari</strong> (si no lo estás ya).</span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-overlay border border-subtle text-ink font-bold text-t-xs">2</span>
                                        <span className="leading-tight">
                                            Pulsa el botón de <strong>Compartir</strong> 
                                            <Share size={16} className="inline mx-1 text-ink-muted relative -top-[1px]" /> 
                                            en la barra inferior.
                                        </span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-overlay border border-subtle text-ink font-bold text-t-xs">3</span>
                                        <span className="leading-tight">
                                            Selecciona <strong>Añadir a la pantalla de inicio</strong>
                                            <PlusSquare size={16} className="inline mx-1 text-ink-muted relative -top-[1px]" />
                                        </span>
                                    </li>
                                </ul>
                            </>
                        ) : (
                            <>
                                <h3 className="font-bold text-ink mb-4 flex items-center gap-2">
                                    <Smartphone size={18} className="text-brand" /> 
                                    <span>En tu Android:</span>
                                </h3>
                                <ul className="text-t-sm text-ink-subtle space-y-4">
                                    <li className="flex items-start gap-3">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-overlay border border-subtle text-ink font-bold text-t-xs">1</span>
                                        <span className="leading-tight">
                                            Pulsa el botón de <strong>Menú</strong> 
                                            <MoreVertical size={16} className="inline mx-1 text-ink-muted relative -top-[1px]" /> 
                                            arriba a la derecha en Chrome.
                                        </span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-overlay border border-subtle text-ink font-bold text-t-xs">2</span>
                                        <span>Selecciona <strong>Instalar aplicación</strong> o <strong>Añadir a la pantalla de inicio</strong>.</span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-overlay border border-subtle text-ink font-bold text-t-xs">3</span>
                                        <span>Acepta el mensaje para instalar.</span>
                                    </li>
                                </ul>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
