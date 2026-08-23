import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { buildWeekPdf, type PrintWeek } from '../lib/export/weekPdf';
import { PDF_PRESETS, resolveTheme, type PdfThemeInput } from '../lib/export/pdfTheme';
import { scanPdfTemplate, type TemplateScan } from '../lib/export/pdfTemplateScan';
import '../index.css';

/**
 * BANCO DE PRUEBAS DE LA HOJA DE ENTRENAMIENTO — solo desarrollo.
 *
 * Ver pdf-preview.html. Se sirve en /pdf-preview.html y no entra en el bundle.
 *
 * Existe porque los ajustes del PDF viven detrás del inicio de sesión, dentro
 * del perfil de un entrenador, y comprobar que un filete cae donde tiene que
 * caer no puede exigir crear una cuenta, un bloque y una semana. Aquí la
 * misma función que genera la descarga real —`buildWeekPdf`— se pinta a
 * tamaño y al lado del PDF que se le eche por encima para copiarle el diseño.
 */

const WEEK: PrintWeek = {
    blockName: 'Bloque de fuerza',
    athleteName: 'Marc Alonso',
    weekLabel: 'Semana 3 · Acumulación',
    dateRange: '4 – 10 de agosto',
    days: [{
        title: 'Lunes',
        date: '4 de agosto',
        warmup: 'Movilidad de cadera, 5 min.\nBarra vacía, 2 series de 10.',
        extras: 'Si la espalda molesta en la primera serie, baja 10 kg y avisa.',
        exercises: [
            {
                name: 'Sentadilla trasera', variant: 'Con pausa de 2 segundos',
                series: '4', reps: '5', rest: "3'", intensity: '140 kg',
                notes: 'Sube el peso si la última serie sale limpia.',
            },
            { name: 'Press banca con agarre cerrado', series: '5', reps: '3', rest: "2'30\"", intensity: 'RPE 8' },
            { name: 'Peso muerto rumano', series: '3', reps: '8', rest: "2'", intensity: '100 kg' },
            { name: 'Remo con barra', series: '4', reps: '10', rest: "90\"", intensity: '70 kg' },
        ],
    }],
};

/** Un día largo, para ver el salto de página y el corte de la tabla. */
const LONG_DAY: PrintWeek = {
    ...WEEK,
    days: [{
        ...WEEK.days[0],
        exercises: Array.from({ length: 11 }, (_, i) => ({
            name: `Ejercicio número ${i + 1} con un nombre razonablemente largo`,
            series: '4', reps: '8', rest: "2'", intensity: `${60 + i * 5} kg`,
            notes: i % 3 === 0 ? 'Una nota del entrenador que ocupa su renglón.' : null,
        })),
    }],
};

GlobalWorkerOptions.workerSrc = workerUrl;

/** Pinta todas las páginas de un PDF, una debajo de otra. */
function PdfCanvas({ bytes, width = 460 }: { bytes: ArrayBuffer | null; width?: number }) {
    const host = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!bytes || !host.current) return;
        const container = host.current;
        let cancelled = false;

        (async () => {
            const doc = await getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
            if (cancelled) { await doc.destroy(); return; }
            container.replaceChildren();

            for (let n = 1; n <= doc.numPages; n++) {
                const page = await doc.getPage(n);
                const base = page.getViewport({ scale: 1 });
                const viewport = page.getViewport({ scale: width / base.width });
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(viewport.width);
                canvas.height = Math.round(viewport.height);
                canvas.className = 'mb-3 w-full rounded-lg ring-1 ring-white/15';
                const context = canvas.getContext('2d');
                if (!context) continue;
                await page.render({ canvas, canvasContext: context, viewport, background: '#FFFFFF' }).promise;
                if (cancelled) break;
                container.append(canvas);
            }
            await doc.destroy();
        })().catch(err => console.error(err));

        return () => { cancelled = true; };
    }, [bytes, width]);

    return <div ref={host} />;
}

function Bench() {
    const [preset, setPreset] = useState('pizarra');
    const [long, setLong] = useState(false);
    const [scan, setScan] = useState<TemplateScan | null>(null);
    const [original, setOriginal] = useState<ArrayBuffer | null>(null);
    const [busy, setBusy] = useState(false);

    const theme: PdfThemeInput = scan
        ? { ...scan.theme, header: { ...scan.theme.header, logoDataUrl: scan.logoDataUrl } }
        : (PDF_PRESETS.find(p => p.key === preset)?.theme ?? {});

    const bytes = buildWeekPdf({ ...(long ? LONG_DAY : WEEK), theme }).output('arraybuffer');
    const resolved = resolveTheme(theme);

    const onFile = async (file: File) => {
        setBusy(true);
        try {
            const data = await file.arrayBuffer();
            setOriginal(data.slice(0));
            setScan(await scanPdfTemplate(data.slice(0)));
        } catch (err) {
            console.error(err);
            alert(`No se pudo leer: ${err}`);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-[100dvh] bg-[#0b0c0e] p-6 text-white">
            <h1 className="mb-1 text-xl font-black uppercase tracking-widest">Hoja de entrenamiento</h1>
            <p className="mb-5 text-xs text-white/50">
                {resolved.layout.sheet === 'table' ? 'Maqueta de tabla' : 'Maqueta de bloques'} ·{' '}
                {resolved.page} · {resolved.sheet.columns.length} columnas · fila {(resolved.sheet.rowUnits * 4).toFixed(0)} mm
            </p>

            <div className="mb-5 flex flex-wrap items-center gap-2">
                {PDF_PRESETS.map(p => (
                    <button
                        key={p.key}
                        onClick={() => { setPreset(p.key); setScan(null); setOriginal(null); }}
                        className={`rounded px-3 py-1.5 text-xs font-bold uppercase ${
 !scan && preset === p.key ? 'bg-white text-black' : 'bg-white/10 text-white/70'
 }`}
                    >
                        {p.label}
                    </button>
                ))}
                <button
                    onClick={() => setLong(v => !v)}
                    className={`rounded px-3 py-1.5 text-xs font-bold uppercase ${long ? 'bg-amber-400 text-black' : 'bg-white/10 text-white/70'}`}
                >
                    Día largo
                </button>
                <label className="cursor-pointer rounded bg-sky-500 px-3 py-1.5 text-xs font-bold uppercase text-black">
                    {busy ? 'Leyendo…' : 'Copiar de un PDF'}
                    <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
                    />
                </label>
            </div>

            {scan && (
                <pre className="mb-5 max-h-64 overflow-auto rounded-lg bg-black/50 p-3 text-t-2xs leading-relaxed text-emerald-300">
                    {JSON.stringify({ report: scan.report, theme: scan.theme }, null, 1)}
                </pre>
            )}

            <div className="flex flex-wrap gap-6">
                <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">Generado</p>
                    <PdfCanvas bytes={bytes} />
                </div>
                {original && (
                    <div>
                        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">Original</p>
                        <PdfCanvas bytes={original} />
                    </div>
                )}
                {scan?.logoDataUrl && (
                    <div>
                        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">Logotipo recortado</p>
                        <img src={scan.logoDataUrl} alt="" className="max-w-[220px] bg-[repeating-conic-gradient(#333_0_25%,#222_0_50%)] bg-[length:16px_16px] p-2" />
                    </div>
                )}
            </div>
        </div>
    );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Bench />);
