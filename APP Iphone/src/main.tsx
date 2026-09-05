import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ErrorBoundary } from 'react-error-boundary'
import App from './App'
import { ErrorFallback } from './components/ui/ErrorFallback'
import './index.css'



/*
 * AQUÍ HABÍA UN DESREGISTRO FORZOSO DE TODOS LOS SERVICE WORKERS.
 *
 * Se puso para salir de un problema de caché, y desde entonces la aplicación
 * estaba en una situación absurda: `vite-plugin-pwa` construía el manifiesto,
 * el service worker y la caché en tiempo de ejecución —se pagaba el coste en
 * cada build— y esto lo tiraba al arrancar. Se pagaba y no se obtenía nada.
 *
 * La decisión K11 lo reactiva. Y lo que de verdad resuelve el problema de
 * caché que motivó el desregistro NO es desregistrar: es
 * `registerType: 'prompt'` (ver vite.config.ts). Con él, una versión nueva no
 * se apodera de la pestaña por sorpresa — avisa y espera a que la persona
 * decida, que es lo que no puede fallar a mitad de una sesión de
 * entrenamiento.
 *
 * El registro lo hace ahora `ReloadPrompt` con `useRegisterSW`, que es
 * además quien enseña el aviso.
 *
 * POR QUÉ IMPORTA DE VERDAD: el gimnasio es un sótano de hormigón. El atleta
 * abre la sesión con cobertura en la puerta y la pierde al bajar. Con el
 * service worker vivo, la sesión del día se puede LEER sin conexión; escribir
 * ya lo cubría `src/lib/offlineQueue.ts`. Las dos piezas juntas son lo que
 * hace que se pueda entrenar sin cobertura.
 */

// Detector de desbordes horizontales. El `import()` va dentro del `if` para
// que ni el módulo ni su coste entren en el bundle de producción.
if (import.meta.env.DEV) {
  import('./lib/overflowGuard').then(m => m.instalarDetectorDeDesbordes())
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes garbage collection
    },
  },
})

import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ErrorBoundary>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
