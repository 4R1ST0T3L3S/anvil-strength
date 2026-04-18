import { TrackingPoint } from './tracker';

export interface PhaseMetrics {
  type: 'eccentric' | 'concentric';
  startTime: number;
  endTime: number;
  startHeight: number;
  endHeight: number;
  rom: number; // meters
  meanVelocity: number;
  peakVelocity: number;
  minVelocity: number; // Sticking point minimum
  stickingHeight: number; 
  duration: number; // seconds
  horizontalDeviationCm: number;
  dataPoints: any[];
}

/**
 * Filtra y segmenta un array curvo de velocidades en repeticiones limpias (fases excéntricas y concéntricas)
 */
export const extractLiftingPhases = (
   smoothedVelocities: any[], 
   pixelToMeterRatio: number,
   minRomThreshold = 0.15 // Min 15cm ROM para considerarse una repetición
): { eccentrics: PhaseMetrics[], concentrics: PhaseMetrics[] } => {
    
    let currentState = 0; // 0 rest, 1 up, -1 down
    const concentrics: PhaseMetrics[] = [];
    const eccentrics: PhaseMetrics[] = [];
    let currentPhase: any[] = [];
    
    const finalizePhase = () => {
        if (currentPhase.length === 0) return;
        
        const first = currentPhase[0];
        const last = currentPhase[currentPhase.length - 1];
        
        const startH = -first.y * pixelToMeterRatio;
        const endH = -last.y * pixelToMeterRatio;
        const rom = Math.abs(endH - startH);
        
        if (rom >= minRomThreshold) {
            const velocities = currentPhase.map(p => p.velocity);
            const peak = Math.max(...velocities);
            const absoluteMin = Math.min(...currentPhase.map(p => p.velocity));
            
            // Sticking point (punto de estancamiento de Vmínima después del primer pico)
            let stickingMinVel = peak;
            let stickingMinY = first.y;
            if (currentState === 1 && currentPhase.length > 5) {
                const peakIdx = velocities.indexOf(peak);
                for(let k = peakIdx; k < currentPhase.length - 2; k++){
                    if(velocities[k] < stickingMinVel) {
                        stickingMinVel = velocities[k];
                        stickingMinY = currentPhase[k].y;
                    }
                }
            }
            
            const mean = velocities.reduce((a, b) => a + b, 0) / velocities.length;
            const xs = currentPhase.map(p => p.x);
            const devCm = (Math.max(...xs) - Math.min(...xs)) * pixelToMeterRatio * 100;
            
            const phase: PhaseMetrics = {
                type: currentState === 1 ? 'concentric' : 'eccentric',
                startTime: first.time,
                endTime: last.time,
                duration: (last.time - first.time) / 1000,
                startHeight: startH,
                endHeight: endH,
                rom,
                meanVelocity: Math.abs(mean),
                peakVelocity: Math.abs(currentState === 1 ? peak : absoluteMin),
                minVelocity: currentState === 1 ? Math.abs(stickingMinVel) : 0,
                stickingHeight: currentState === 1 ? -stickingMinY * pixelToMeterRatio : 0,
                horizontalDeviationCm: devCm,
                dataPoints: currentPhase
            };
            
            if (currentState === 1) concentrics.push(phase);
            else eccentrics.push(phase);
        }
        
        currentPhase = [];
    };

    // Tolerate tiny stutters inside a phase by requiring multiple frames to switch state?
    // For now a strict velocity threshold +/- 0.04 m/s is enough.
    for (const p of smoothedVelocities) {
        if (p.velocity > 0.04) {
            if (currentState !== 1) { finalizePhase(); currentState = 1; }
            currentPhase.push(p);
        } else if (p.velocity < -0.04) {
            if (currentState !== -1) { finalizePhase(); currentState = -1; }
            currentPhase.push(p);
        } else {
            finalizePhase();
            currentState = 0;
        }
    }
    
    finalizePhase(); 
    return { eccentrics, concentrics };
};

/**
 * Física Dinámica (Aislador de aceleración y RFD)
 */
export const calculateDynamics = (
    velocitiesArray: any[],
    massKg: number
) => {
    const g = 9.81; 
    let maxForce = 0;
    let meanForceSum = 0;
    let maxPower = 0;
    let meanPowerSum = 0;
    let maxRfd = 0;
    let validCount = 0;
    
    // Usamos el teorema central de aceleración extendido (ventana step de 2 => aprox total t de 120-130ms) 
    // Para no multiplicar la microestática de frame como fuerza explosiva falsa.
    const forces: {time: number, force: number}[] = [];
    const step = 2; 
    
    for (let i = step; i < velocitiesArray.length - step; i++) {
        const pPrev = velocitiesArray[i - step];
        const pNext = velocitiesArray[i + step];
        const pCurr = velocitiesArray[i];
        
        const dt = (pNext.time - pPrev.time) / 1000;
        if (dt <= 0.001) continue;
        
        const dv = pNext.velocity - pPrev.velocity;
        const a = dv / dt; 
        
        const f = massKg * (g + a);
        const power = Math.max(0, f * pCurr.velocity); 
        
        forces.push({time: pCurr.time, force: f});
        
        if (f > maxForce) maxForce = f;
        if (power > maxPower) maxPower = power;
        
        meanForceSum += f;
        meanPowerSum += power;
        validCount++;
    }
    
    // The REAL Rate of Force Development
    // Tasa más elevada en un frame continuo de ~100 milisegundos de desarrollo (Standard ISO)
    for (let i = 0; i < forces.length; i++) {
        for (let j = i + 1; j < forces.length; j++) {
            const dt = (forces[j].time - forces[i].time) / 1000;
            if (dt >= 0.08 && dt <= 0.12) { 
                 const rfd = (forces[j].force - forces[i].force) / dt;
                 if (rfd > maxRfd) maxRfd = rfd;
                 break;
            }
            if (dt > 0.12) break; // Optimization exit
        }
    }

    return {
        meanForce: validCount > 0 ? meanForceSum / validCount : 0,
        peakForce: maxForce,
        meanPower: validCount > 0 ? meanPowerSum / validCount : 0,
        peakPower: maxPower,
        rfd: Math.max(0, maxRfd)
    };
};

/**
 * Estimación 1RM de grado científico
 */
export const estimate1RM = (massKg: number, currentVelocity: number, testType: 'squat'|'bench'|'deadlift') => {
    let mvt = 0.30;
    let slope = 0.0125;
    
    if (testType === 'bench') {
        mvt = 0.15;
        slope = 0.0125; 
    }
    if (testType === 'deadlift') {
        mvt = 0.20;
        slope = 0.0100;
    }

    // Perfil Biomecánico Estándar (Basado en la linearidad de carga-velocidad)
    // %1RM = 100 - ( (Velocidad Actual - Velocidad Residual Mínima) / Descenso porcentual )
    const estimatedPercent = Math.min(100, Math.max(15, 100 - ((currentVelocity - mvt) / slope)));
    const estimated1RM = massKg / (estimatedPercent / 100);
    
    return {
        percent: estimatedPercent,
        rm: estimated1RM
    };
};
