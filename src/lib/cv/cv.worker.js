/* eslint-disable no-restricted-globals */

// Cargar OpenCV de manera síncrona dentro del worker. 
// Al estar en un worker, si tarda 10 segundos en compilar, NO bloquea la pantalla principal de React!
self.importScripts('/opencv.js');

let cvReady = false;
let oldGray = null;
let p0 = null;
let p1 = null;
let st = null;
let err = null;
let winSize = null;
let maxLevel = null;
let criteria = null;

function initCV() {
    if (self.cv && self.cv.Mat) {
        setupVariables();
    } else if (self.cv && self.cv.onRuntimeInitialized) {
        self.cv.onRuntimeInitialized = () => {
            setupVariables();
        };
    } else {
        // Fallback poller
        let check = setInterval(() => {
            if (self.cv && self.cv.Mat) {
                clearInterval(check);
                setupVariables();
            }
        }, 100);
    }
}

function setupVariables() {
    cvReady = true;
    p1 = new self.cv.Mat();
    st = new self.cv.Mat();
    err = new self.cv.Mat();
    // Aumentamos el tamaño de la ventana (winSize) para rastrear movimientos mucho más rápidos y grandes
    winSize = new self.cv.Size(31, 31);
    // Aumentamos los niveles de la pirámide para capturar mejor los grandes saltos de distancia en vídeos de bajos FPS
    maxLevel = 4;
    // Aumentamos las iteraciones para una mejor convergencia de seguimiento
    criteria = new self.cv.TermCriteria(self.cv.TERM_CRITERIA_EPS | self.cv.TERM_CRITERIA_COUNT, 30, 0.01);
    self.postMessage({ type: 'READY' });
}

self.onmessage = function(e) {
    const data = e.data;
    
    if (data.type === 'PING') {
        if (cvReady) self.postMessage({ type: 'READY' });
        return;
    }
    
    if (!cvReady) {
        self.postMessage({ type: 'ERROR', message: 'OpenCV no está listo en el worker' });
        return;
    }

    if (data.type === 'INIT') {
        try {
            if (oldGray) oldGray.delete();
            if (p0) p0.delete();

            const imgData = new ImageData(new Uint8ClampedArray(data.buffer), data.width, data.height);
            const frame = self.cv.matFromImageData(imgData);
            
            oldGray = new self.cv.Mat();
            self.cv.cvtColor(frame, oldGray, self.cv.COLOR_RGBA2GRAY);
            frame.delete();

            // Auto-snapping al mejor "feature" (esquina/borde de la barra) cercano al centro clickeado
            const roiSize = 60;
            let startX = Math.max(0, Math.round(data.x - roiSize / 2));
            let startY = Math.max(0, Math.round(data.y - roiSize / 2));
            let width = Math.min(oldGray.cols - startX, roiSize);
            let height = Math.min(oldGray.rows - startY, roiSize);
            
            const rect = new self.cv.Rect(startX, startY, width, height);
            const roiGray = oldGray.roi(rect);
            
            const corners = new self.cv.Mat();
            const mask = new self.cv.Mat();
            
            // Buscar la característica más prominente
            self.cv.goodFeaturesToTrack(roiGray, corners, 1, 0.01, 10, mask, 3, false, 0.04);
            
            if (corners.rows > 0) {
                // Actualizar coords del ancla detectada
                data.x = corners.data32F[0] + startX;
                data.y = corners.data32F[1] + startY;
            }
            
            roiGray.delete();
            corners.delete();
            mask.delete();

            p0 = new self.cv.Mat(1, 1, self.cv.CV_32FC2);
            p0.data32F[0] = data.x;
            p0.data32F[1] = data.y;
            
            self.postMessage({ type: 'INIT_DONE', x: data.x, y: data.y });
        } catch (error) {
            self.postMessage({ type: 'ERROR', message: error.message });
        }
    } 
    else if (data.type === 'TRACK') {
        try {
            const imgData = new ImageData(new Uint8ClampedArray(data.buffer), data.width, data.height);
            const frame = self.cv.matFromImageData(imgData);
            const frameGray = new self.cv.Mat();
            self.cv.cvtColor(frame, frameGray, self.cv.COLOR_RGBA2GRAY);
            
            self.cv.calcOpticalFlowPyrLK(
                oldGray, frameGray, p0, p1, st, err, winSize, maxLevel, criteria
            );
            
            let status = st.data[0];
            let newX = data.lastX;
            let newY = data.lastY;

            if (status === 1) {
                newX = p1.data32F[0];
                newY = p1.data32F[1];
                
                p0.data32F[0] = newX;
                p0.data32F[1] = newY;
            }

            oldGray.delete();
            oldGray = frameGray;
            frame.delete();

            self.postMessage({
                type: 'TRACK_DONE',
                status: status,
                x: newX,
                y: newY
            });
        } catch (error) {
            self.postMessage({ type: 'ERROR', message: error.message });
        }
    }
    else if (data.type === 'AUTO_CALIBRATE') {
        try {
            const imgData = new ImageData(new Uint8ClampedArray(data.buffer), data.width, data.height);
            const frame = self.cv.matFromImageData(imgData);
            const gray = new self.cv.Mat();
            self.cv.cvtColor(frame, gray, self.cv.COLOR_RGBA2GRAY);
            frame.delete();
            
            // Redimensionar a 480px máx para speed (suficiente para detectar un disco de 45cm)
            const MAX_WIDTH = 480;
            let scale = 1.0;
            if (gray.cols > MAX_WIDTH) {
                scale = MAX_WIDTH / gray.cols;
                const dsize = new self.cv.Size(MAX_WIDTH, Math.round(gray.rows * scale));
                self.cv.resize(gray, gray, dsize, 0, 0, self.cv.INTER_AREA);
            }

            // Gaussian blur: el mejor preprocesado para Hough
            self.cv.GaussianBlur(gray, gray, new self.cv.Size(9, 9), 2, 2);

            const circles = new self.cv.Mat();
            // Rango de radio proporcional: el disco de 25kg ocupa ~15-45% del ancho del frame
            const minRad = Math.round(gray.cols * 0.06);  // 6% del ancho
            const maxRad = Math.round(gray.cols * 0.48);  // 48% del ancho
            const minDist = Math.round(gray.cols * 0.15); // Mínima distancia entre centros

            // Intento 1: Detección estricta (param2 alto = pocos falsos positivos)
            self.cv.HoughCircles(gray, circles, self.cv.HOUGH_GRADIENT, 1, minDist, 80, 45, minRad, maxRad);

            let bestCircle = null;

            if (circles.cols === 0) {
                // Intento 2: Si no encontró nada, relajar sensibilidad
                self.cv.HoughCircles(gray, circles, self.cv.HOUGH_GRADIENT, 1.2, minDist, 60, 30, minRad, maxRad);
            }

            if (circles.cols > 0) {
                // Buscar el círculo más grande (disco principal, no buje central)
                let bestR = 0;
                const limit = Math.min(15, circles.cols);
                for (let i = 0; i < limit; i++) {
                    const r = circles.data32F[i * 3 + 2];
                    if (r > bestR) {
                        bestR = r;
                        bestCircle = {
                            x: circles.data32F[i * 3] / scale,
                            y: circles.data32F[i * 3 + 1] / scale,
                            r: r / scale
                        };
                    }
                }
            }
            
            gray.delete();
            circles.delete();
            
            self.postMessage({
                type: 'AUTO_CALIBRATE_DONE',
                circle: bestCircle
            });
        } catch (error) {
            self.postMessage({ type: 'ERROR', message: "Error auto-detectando disco: " + error.message });
        }
    }

    else if (data.type === 'ASSIST_CALIBRATE') {
        try {
            const imgData = new ImageData(new Uint8ClampedArray(data.buffer), data.width, data.height);
            const frame = self.cv.matFromImageData(imgData);
            const gray = new self.cv.Mat();
            self.cv.cvtColor(frame, gray, self.cv.COLOR_RGBA2GRAY);
            
            const MAX_WIDTH = 640;
            let scale = 1.0;
            if (gray.cols > MAX_WIDTH) {
                scale = MAX_WIDTH / gray.cols;
                const newWidth = MAX_WIDTH;
                const newHeight = Math.round(gray.rows * scale);
                const dsize = new self.cv.Size(newWidth, newHeight);
                self.cv.resize(gray, gray, dsize, 0, 0, self.cv.INTER_AREA);
            }

            // Quitamos el CLAHE. El CLAHE iluminaba el disco brillante y texturizaba el negro arruinando el gradiente.
            // En su lugar aplicamos un desenfoque Gaussiano, el mejor amigo del detector Canny Edge.
            self.cv.GaussianBlur(gray, gray, new self.cv.Size(5, 5), 1.5, 1.5);
            
            const circles = new self.cv.Mat();
            const minRad = Math.max(10, Math.round(40 * scale));
            const maxRad = Math.round(400 * scale);
            const minDist = Math.max(10, Math.round(10 * scale)); 
            
            // Sensibilidad Extrema:
            // DP=1.5: Permite holgura geométrica (ideal para aros que son tapados y no tienen el centro perfecto visible)
            // Param1=50 y Param2=25: El algoritmo recogerá la mínima sombra curva que exista.
            self.cv.HoughCircles(gray, circles, self.cv.HOUGH_GRADIENT, 1.5, minDist, 50, 25, minRad, maxRad);
            
            let bestCircle = null;
            if (circles.cols > 0) {
                const targetX = data.x * scale;
                const targetY = data.y * scale;
                let candidates = [];

                for (let i = 0; i < circles.cols; i++) {
                    const cx = circles.data32F[i * 3];
                    const cy = circles.data32F[i * 3 + 1];
                    const r = circles.data32F[i * 3 + 2];
                    
                    // Distancia pitagórica al click del usuario
                    const dist = Math.sqrt(Math.pow(cx - targetX, 2) + Math.pow(cy - targetY, 2));
                    
                    // Filtrar rigurosamente solo los círculos cerca de donde el usuario hizo click 
                    // (Evita capturar un "aro fantasma" gigante en el fondo del gimnasio)
                    if (dist < (r * 1.5) || dist < (80 * scale)) {
                        candidates.push({ x: cx/scale, y: cy/scale, r: r/scale, dist: dist });
                    }
                }

                if (candidates.length > 0) {
                    // Agrupar alrededor del centro más cercano al click
                    candidates.sort((a, b) => a.dist - b.dist);
                    const closestDist = candidates[0].dist;
                    
                    // Aislar solo aquellos círculos concéntricos al centro principal (tolerancia 30px)
                    const concentricCandidates = candidates.filter(c => Math.abs(c.dist - closestDist) < (30 * scale));
                    
                    // Ahora sí, dentro del disco, elegimos el borde exterior más ancho garantizando que sea el disco físico base
                    concentricCandidates.sort((a, b) => b.r - a.r);
                    bestCircle = concentricCandidates[0];
                }
            }
            
            gray.delete();
            circles.delete();
            frame.delete();
            
            self.postMessage({
                type: 'AUTO_CALIBRATE_DONE',
                circle: bestCircle
            });
        } catch (error) {
            self.postMessage({ type: 'ERROR', message: "Error en asistencia: " + error.message });
        }
    }
    else if (data.type === 'CLEANUP') {
        if (oldGray) oldGray.delete();
        if (p0) p0.delete();
        oldGray = null;
        p0 = null;
    }
};

initCV();
