/* eslint-disable no-restricted-globals */

// Cargar OpenCV de manera síncrona dentro del worker. 
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
    winSize = new self.cv.Size(31, 31);
    maxLevel = 4;
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

            const roiSize = 60;
            let startX = Math.max(0, Math.round(data.x - roiSize / 2));
            let startY = Math.max(0, Math.round(data.y - roiSize / 2));
            let width = Math.min(oldGray.cols - startX, roiSize);
            let height = Math.min(oldGray.rows - startY, roiSize);
            
            const rect = new self.cv.Rect(startX, startY, width, height);
            const roiGray = oldGray.roi(rect);
            
            const corners = new self.cv.Mat();
            const mask = new self.cv.Mat();
            
            self.cv.goodFeaturesToTrack(roiGray, corners, 1, 0.01, 10, mask, 3, false, 0.04);
            
            if (corners.rows > 0) {
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

            self.postMessage({ type: 'TRACK_DONE', status: status, x: newX, y: newY });
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
            
            const MAX_WIDTH = 480;
            let scale = 1.0;
            if (gray.cols > MAX_WIDTH) {
                scale = MAX_WIDTH / gray.cols;
                const dsize = new self.cv.Size(MAX_WIDTH, Math.round(gray.rows * scale));
                self.cv.resize(gray, gray, dsize, 0, 0, self.cv.INTER_AREA);
            }

            const minRad = Math.max(15, Math.round(gray.cols * 0.05));
            const maxRad = Math.round(gray.cols * 0.45);
            const minDist = Math.round(gray.cols * 0.12);

            let bestCircle = null;
            let bestScore = 0;

            // Multi-pass with different preprocessing
            const tryDetect = function(preprocessed, paramsList) {
                for (const params of paramsList) {
                    if (bestCircle) return;
                    const circles = new self.cv.Mat();
                    self.cv.HoughCircles(preprocessed, circles, self.cv.HOUGH_GRADIENT, 
                        params.dp, minDist, params.p1, params.p2, minRad, maxRad);
                    
                    if (circles.cols > 0) {
                        const limit = Math.min(20, circles.cols);
                        for (let i = 0; i < limit; i++) {
                            const cx = circles.data32F[i * 3];
                            const cy = circles.data32F[i * 3 + 1];
                            const r = circles.data32F[i * 3 + 2];
                            const inBounds = cx > r * 0.3 && cy > r * 0.3 && 
                                           cx < (preprocessed.cols - r * 0.3) && cy < (preprocessed.rows - r * 0.3);
                            const score = inBounds ? r : r * 0.5;
                            if (score > bestScore) {
                                bestScore = score;
                                bestCircle = { x: cx / scale, y: cy / scale, r: r / scale };
                            }
                        }
                    }
                    circles.delete();
                }
            };

            const paramSets = [
                { dp: 1, p1: 80, p2: 40 },
                { dp: 1, p1: 60, p2: 30 },
                { dp: 1.2, p1: 50, p2: 25 },
            ];

            // Pass 1: GaussianBlur 
            const g1 = gray.clone();
            self.cv.GaussianBlur(g1, g1, new self.cv.Size(9, 9), 2, 2);
            tryDetect(g1, paramSets);
            g1.delete();

            // Pass 2: CLAHE + Blur (dark environments)
            if (!bestCircle) {
                const g2 = gray.clone();
                const clahe = new self.cv.CLAHE(3.0, new self.cv.Size(8, 8));
                clahe.apply(g2, g2);
                clahe.delete();
                self.cv.GaussianBlur(g2, g2, new self.cv.Size(7, 7), 1.5, 1.5);
                tryDetect(g2, paramSets);
                g2.delete();
            }

            // Pass 3: MedianBlur (noise)
            if (!bestCircle) {
                const g3 = gray.clone();
                self.cv.medianBlur(g3, g3, 7);
                tryDetect(g3, paramSets);
                g3.delete();
            }
            
            gray.delete();
            
            self.postMessage({ type: 'AUTO_CALIBRATE_DONE', circle: bestCircle });
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
            frame.delete();
            
            const MAX_WIDTH = 480;
            let scale = 1.0;
            if (gray.cols > MAX_WIDTH) {
                scale = MAX_WIDTH / gray.cols;
                const dsize = new self.cv.Size(MAX_WIDTH, Math.round(gray.rows * scale));
                self.cv.resize(gray, gray, dsize, 0, 0, self.cv.INTER_AREA);
            }

            self.cv.GaussianBlur(gray, gray, new self.cv.Size(7, 7), 1.5, 1.5);
            
            const circles = new self.cv.Mat();
            const minRad = Math.max(10, Math.round(30 * scale));
            const maxRad = Math.round(350 * scale);
            const minDist = Math.max(10, Math.round(15 * scale)); 
            
            self.cv.HoughCircles(gray, circles, self.cv.HOUGH_GRADIENT, 1, minDist, 60, 30, minRad, maxRad);
            
            if (circles.cols === 0) {
                self.cv.HoughCircles(gray, circles, self.cv.HOUGH_GRADIENT, 1.5, minDist, 50, 20, minRad, maxRad);
            }
            
            let bestCircle = null;
            if (circles.cols > 0) {
                const targetX = data.x * scale;
                const targetY = data.y * scale;
                let candidates = [];

                for (let i = 0; i < Math.min(30, circles.cols); i++) {
                    const cx = circles.data32F[i * 3];
                    const cy = circles.data32F[i * 3 + 1];
                    const r = circles.data32F[i * 3 + 2];
                    const dist = Math.sqrt(Math.pow(cx - targetX, 2) + Math.pow(cy - targetY, 2));
                    
                    if (dist < r * 1.2 || dist < (100 * scale)) {
                        candidates.push({ x: cx/scale, y: cy/scale, r: r/scale, dist: dist });
                    }
                }

                if (candidates.length > 0) {
                    candidates.sort((a, b) => a.dist - b.dist);
                    const closeThreshold = candidates[0].dist + (25 * scale);
                    const closeCandidates = candidates.filter(c => c.dist <= closeThreshold);
                    closeCandidates.sort((a, b) => b.r - a.r);
                    bestCircle = closeCandidates[0];
                }
            }
            
            gray.delete();
            circles.delete();
            
            self.postMessage({ type: 'AUTO_CALIBRATE_DONE', circle: bestCircle });
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
