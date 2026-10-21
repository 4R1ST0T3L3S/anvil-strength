import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, Eye, EyeOff, ImagePlus, Pencil, Plus, Trash2, Trophy, Upload, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { SegmentedControl } from '../../../components/ui/SegmentedControl';
import { ConfirmationModal } from '../../../components/modals/ConfirmationModal';
import { SafeImage } from '../../../components/ui/SafeImage';
import { normalizarNombre } from '../../../lib/atletas';
import { CLAVE_CLUB, clubWebService, useClubWebAdmin, type FilaAtleta, type FilaLogro } from '../../../services/clubWebService';

/**
 * LA WEB DEL CLUB, SIN TOCAR CÓDIGO (`/admin/web`)
 * =====================================================================
 *
 * Atletas (foto, categoría, marcas, Instagram, recorte de la convocatoria)
 * y logros del club. Antes se cambiaban editando src/data a mano y
 * desplegando; ahora se guardan en `club_athletes` / `club_achievements` y
 * la web pública los lee al momento.
 *
 * Solo administración y desarrollo (la RLS lo exige igual: aunque alguien
 * llegara aquí, no podría guardar).
 */

type Pestana = 'atletas' | 'logros';

const campo = 'h-10 w-full rounded-field bg-[var(--fill-input)] px-3 text-t-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

export function AdminWebPage() {
    const navigate = useNavigate();
    const [pestana, setPestana] = useState<Pestana>('atletas');
    const { data, isLoading, error } = useClubWebAdmin();

    return (
        <div className="min-h-[100dvh] bg-surface-canvas px-4 pb-16 pt-8 md:px-8">
            <div className="mx-auto max-w-5xl">
                <button
                    type="button"
                    onClick={() => navigate('/admin')}
                    className="mb-4 inline-flex min-h-[44px] items-center gap-2 text-t-sm font-semibold text-ink-subtle hover:text-ink"
                >
                    <ArrowLeft size={16} aria-hidden="true" /> Panel de administración
                </button>
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-t-2xl font-semibold text-ink md:text-t-3xl">La web del club</h1>
                        <p className="mt-1 text-t-sm text-ink-muted">Lo que cambies aquí sale en anvilstrength.es al momento: portada, plantilla, convocatorias y logros.</p>
                    </div>
                    <SegmentedControl
                        segmentos={[
                            { id: 'atletas', label: 'Atletas', icono: <Users size={14} /> },
                            { id: 'logros', label: 'Logros', icono: <Trophy size={14} /> },
                        ]}
                        activo={pestana}
                        onChange={setPestana}
                        aria-label="Qué editar"
                    />
                </div>

                <div className="mt-6">
                    {isLoading && <p className="text-t-sm text-ink-subtle">Cargando…</p>}
                    {error && (
                        <p className="rounded-card bg-[var(--danger-quiet)] p-4 text-t-sm text-danger-text">
                            No se han podido cargar los datos. Si es la primera vez, falta ejecutar database/CLUB_WEB_2026-10-21.sql.
                        </p>
                    )}
                    {data && pestana === 'atletas' && <ListaAtletas filas={data.atletas} />}
                    {data && pestana === 'logros' && <ListaLogros filas={data.logros} />}
                </div>
            </div>
        </div>
    );
}

// =====================================================================
// COMÚN
// =====================================================================

function useRefrescar() {
    const qc = useQueryClient();
    return () => qc.invalidateQueries({ queryKey: CLAVE_CLUB });
}

function Fila({ foto, titulo, subtitulo, visible, primero, ultimo, onSubir, onBajar, onVisible, onEditar, onBorrar }: {
    foto?: string | null; titulo: string; subtitulo: ReactNode; visible: boolean; primero: boolean; ultimo: boolean;
    onSubir: () => void; onBajar: () => void; onVisible: () => void; onEditar: () => void; onBorrar: () => void;
}) {
    const boton = 'flex h-10 w-10 items-center justify-center rounded-field text-ink-subtle hover:bg-[var(--fill-hover)] hover:text-ink disabled:opacity-30';
    return (
        <li className={`flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 rounded-card border border-[var(--border-default)] bg-surface-raised p-2.5 sm:p-3 ${visible ? '' : 'opacity-60'}`}>
            <div className="flex min-w-0 flex-1 items-center gap-3">
            <SafeImage
                src={foto ?? undefined}
                alt=""
                className="h-14 w-12 shrink-0 rounded-field object-cover"
                fallback={<span className="flex h-14 w-12 shrink-0 items-center justify-center rounded-field bg-surface-overlay text-ink-faint"><Trophy size={18} /></span>}
            />
            <button type="button" onClick={onEditar} className="min-w-0 flex-1 text-left min-h-[44px] py-1">
                <span className="block truncate text-t-sm font-semibold text-ink">{titulo}</span>
                <span className="block truncate text-t-xs text-ink-subtle">{subtitulo}</span>
            </button>
            </div>
            <div className="flex w-full sm:w-auto shrink-0 items-center justify-end border-t border-[var(--separator)] sm:border-t-0 pt-1.5 sm:pt-0">
                <button type="button" className={boton} onClick={onSubir} disabled={primero} aria-label="Subir"><ArrowUp size={16} /></button>
                <button type="button" className={boton} onClick={onBajar} disabled={ultimo} aria-label="Bajar"><ArrowDown size={16} /></button>
                <button type="button" className={boton} onClick={onVisible} aria-label={visible ? 'Ocultar en la web' : 'Mostrar en la web'} title={visible ? 'Visible en la web' : 'Oculto'}>
                    {visible ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <button type="button" className={boton} onClick={onEditar} aria-label="Editar"><Pencil size={16} /></button>
                <button type="button" className={`${boton} hover:text-danger-text`} onClick={onBorrar} aria-label="Eliminar"><Trash2 size={16} /></button>
            </div>
        </li>
    );
}

function Etiqueta({ texto, children, ayuda }: { texto: string; children: ReactNode; ayuda?: string }) {
    return (
        <label className="block">
            <span className="text-t-xs font-semibold text-ink-muted">{texto}</span>
            <span className="mt-1 block">{children}</span>
            {ayuda && <span className="mt-1 block text-t-2xs text-ink-subtle">{ayuda}</span>}
        </label>
    );
}

/** Campo de imagen: URL a mano o subir un archivo al bucket `club-web`. */
function CampoImagen({ valor, onCambio, carpeta, alSubir }: { valor: string; onCambio: (url: string) => void; carpeta: 'atletas' | 'logros'; alSubir?: (f: File) => void }) {
    const input = useRef<HTMLInputElement>(null);
    const [subiendo, setSubiendo] = useState(false);
    const subir = async (f: File) => {
        setSubiendo(true);
        try {
            const url = await clubWebService.subirFoto(f, carpeta);
            onCambio(url);
            alSubir?.(f);
        } catch (e) {
            toast.error(`No se pudo subir: ${(e as Error).message}`);
        } finally {
            setSubiendo(false);
        }
    };
    return (
        <div className="flex gap-2">
            <input className={campo} value={valor} onChange={(e) => onCambio(e.target.value)} placeholder="/athletes/foto.jpg o https://…" />
            <input ref={input} type="file" accept="image/*,video/webm,video/quicktime,video/mp4" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = ''; }} />
            <Button variant="secondary" icon={<Upload size={14} />} loading={subiendo} onClick={() => input.current?.click()}>Subir</Button>
        </div>
    );
}

/** Ancho y alto de una imagen local, para el recorte. */
function medir(f: File): Promise<{ w: number; h: number }> {
    return new Promise((ok, mal) => {
        const img = new Image();
        img.onload = () => { ok({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(img.src); };
        img.onerror = mal;
        img.src = URL.createObjectURL(f);
    });
}

const num = (v: string) => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n : 0; };

// =====================================================================
// ATLETAS
// =====================================================================

const ATLETA_VACIO: Partial<FilaAtleta> = {
    name: '', slug: '', category: '', image: '', description: '', instagram: '', last_competition: '',
    gl_points: 0, squat: 0, bench: 0, deadlift: 0, total: 0, cutout_src: '', cutout_src800: '', cutout_width: null, cutout_height: null,
    cutout_scale: 1, cutout_drop: 0, video_webm: '', video_mov: '', visible: true,
};

function ListaAtletas({ filas }: { filas: FilaAtleta[] }) {
    const refrescar = useRefrescar();
    const [editando, setEditando] = useState<Partial<FilaAtleta> | null>(null);
    const [borrando, setBorrando] = useState<FilaAtleta | null>(null);

    const mover = async (i: number, d: -1 | 1) => {
        const orden = filas.map((f, k) => ({ id: f.id, order_index: k }));
        [orden[i].order_index, orden[i + d].order_index] = [orden[i + d].order_index, orden[i].order_index];
        try { await clubWebService.reordenar('club_athletes', orden); refrescar(); } catch { toast.error('No se pudo reordenar'); }
    };
    const alternarVisible = async (f: FilaAtleta) => {
        try { await clubWebService.guardarAtleta({ id: f.id, slug: f.slug, name: f.name, visible: !f.visible }); refrescar(); } catch { toast.error('No se pudo guardar'); }
    };

    return (
        <>
            <div className="mb-3 flex items-center justify-between">
                <p className="text-t-sm text-ink-subtle">{filas.length} atletas · el orden es el de la plantilla de la web</p>
                <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditando({ ...ATLETA_VACIO, order_index: filas.length })}>Añadir atleta</Button>
            </div>
            <ul className="space-y-2">
                {filas.map((f, i) => (
                    <Fila
                        key={f.id}
                        foto={f.image}
                        titulo={f.name}
                        subtitulo={`${f.category || 'Sin categoría'} · ${Number(f.total) > 0 ? `${f.total} kg de total` : 'sin total'}${f.cutout_src ? ' · con recorte' : ''}`}
                        visible={f.visible}
                        primero={i === 0}
                        ultimo={i === filas.length - 1}
                        onSubir={() => mover(i, -1)}
                        onBajar={() => mover(i, 1)}
                        onVisible={() => alternarVisible(f)}
                        onEditar={() => setEditando(f)}
                        onBorrar={() => setBorrando(f)}
                    />
                ))}
            </ul>
            {editando && <EditorAtleta inicial={editando} onCerrar={() => setEditando(null)} onGuardado={() => { refrescar(); setEditando(null); }} />}
            <ConfirmationModal
                isOpen={!!borrando}
                onClose={() => setBorrando(null)}
                onConfirm={async () => {
                    if (!borrando) return;
                    try { await clubWebService.borrarAtleta(borrando.id); refrescar(); toast.success('Atleta eliminado'); } catch { toast.error('No se pudo eliminar'); }
                    setBorrando(null);
                }}
                title={`¿Eliminar a ${borrando?.name ?? ''} de la web?`}
                description="Desaparece de la portada y de las convocatorias. Su cuenta en la app no se toca. Si solo quieres esconderlo, usa el ojo."
                confirmText="Eliminar"
                variant="danger"
            />
        </>
    );
}

function EditorAtleta({ inicial, onCerrar, onGuardado }: { inicial: Partial<FilaAtleta>; onCerrar: () => void; onGuardado: () => void }) {
    const [f, setF] = useState<Partial<FilaAtleta>>(inicial);
    const [guardando, setGuardando] = useState(false);
    const nuevo = !inicial.id;
    const set = <K extends keyof FilaAtleta>(k: K, v: FilaAtleta[K]) => setF((x) => ({ ...x, [k]: v }));
    const totalCalculado = (Number(f.squat) || 0) + (Number(f.bench) || 0) + (Number(f.deadlift) || 0);

    const guardar = async () => {
        const name = (f.name ?? '').trim();
        if (!name) { toast.error('Falta el nombre'); return; }
        const slug = (f.slug?.trim() || normalizarNombre(name).replace(/ /g, '-'));
        setGuardando(true);
        try {
            const limpio = Object.fromEntries(Object.entries({ ...f, name, slug }).map(([k, v]) => [k, v === '' ? null : v]));
            await clubWebService.guardarAtleta(limpio as Partial<FilaAtleta> & { slug: string; name: string });
            toast.success(nuevo ? 'Atleta añadido' : 'Atleta guardado');
            onGuardado();
        } catch (e) {
            toast.error(`No se pudo guardar: ${(e as Error).message}`);
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Modal
            open
            onClose={onCerrar}
            title={nuevo ? 'Nuevo atleta' : `Editar a ${inicial.name}`}
            size="lg"
            footer={<><Button variant="secondary" onClick={onCerrar}>Cancelar</Button><Button variant="primary" loading={guardando} onClick={guardar}>Guardar</Button></>}
        >
            <div className="grid gap-4 sm:grid-cols-2">
                <Etiqueta texto="Nombre" ayuda="Tal y como sale en la web. Para enlazar con su cuenta y con las competiciones basta con nombre y primer apellido."><input className={campo} value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="Pau Rodriguez" /></Etiqueta>
                <Etiqueta texto="Categoría" ayuda="Peso y división: -105kg SBJ, -63kg JNR, -83kg Open…"><input className={campo} value={f.category ?? ''} onChange={(e) => set('category', e.target.value)} /></Etiqueta>
                <div className="sm:col-span-2"><Etiqueta texto="Foto de la plantilla"><CampoImagen carpeta="atletas" valor={f.image ?? ''} onCambio={(v) => set('image', v)} /></Etiqueta></div>
                <Etiqueta texto="Instagram"><input className={campo} value={f.instagram ?? ''} onChange={(e) => set('instagram', e.target.value)} placeholder="https://www.instagram.com/usuario" /></Etiqueta>
                <Etiqueta texto="Competición de sus marcas"><input className={campo} value={f.last_competition ?? ''} onChange={(e) => set('last_competition', e.target.value)} placeholder="SBD Cup 2025" /></Etiqueta>
            </div>

            <fieldset className="mt-5">
                <legend className="text-t-xs font-semibold uppercase tracking-wide text-ink-subtle">Mejores marcas (kg)</legend>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {([['squat', 'Sentadilla'], ['bench', 'Banca'], ['deadlift', 'Peso muerto'], ['total', 'Total'], ['gl_points', 'Puntos GL']] as const).map(([k, t]) => (
                        <Etiqueta key={k} texto={t}>
                            <input className={campo} inputMode="decimal" value={String(f[k] ?? 0)} onChange={(e) => set(k, num(e.target.value))} />
                        </Etiqueta>
                    ))}
                </div>
                {totalCalculado > 0 && Math.abs(totalCalculado - (Number(f.total) || 0)) > 0.01 && (
                    <p className="mt-2 text-t-xs text-ink-muted">
                        Las tres marcas suman {totalCalculado} kg.{' '}
                        <button type="button" className="font-semibold text-brand-text underline" onClick={() => set('total', totalCalculado)}>Usar como total</button>
                    </p>
                )}
            </fieldset>

            <div className="mt-5">
                <Etiqueta texto="Presentación"><textarea className={`${campo} h-24 py-2`} value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} /></Etiqueta>
            </div>

            <fieldset className="mt-5 rounded-card bg-[var(--fill-muted)] p-4">
                <legend className="px-1 text-t-xs font-semibold uppercase tracking-wide text-ink-subtle">Convocatoria y portada</legend>
                <p className="text-t-xs text-ink-subtle">Foto SIN fondo (PNG o WebP transparente), de cintura para arriba o de cuerpo entero. Al subirla se mide sola.</p>
                <div className="mt-3 grid gap-4">
                    <Etiqueta texto="Recorte">
                        <CampoImagen carpeta="atletas" valor={f.cutout_src ?? ''} onCambio={(v) => setF((x) => ({ ...x, cutout_src: v, cutout_src800: v }))}
                            alSubir={async (file) => { try { const { w, h } = await medir(file); setF((x) => ({ ...x, cutout_width: w, cutout_height: h })); } catch { /* sin medidas */ } }} />
                    </Etiqueta>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Etiqueta texto="Ancho (px)"><input className={campo} inputMode="numeric" value={String(f.cutout_width ?? '')} onChange={(e) => set('cutout_width', num(e.target.value) || null)} /></Etiqueta>
                        <Etiqueta texto="Alto (px)"><input className={campo} inputMode="numeric" value={String(f.cutout_height ?? '')} onChange={(e) => set('cutout_height', num(e.target.value) || null)} /></Etiqueta>
                        <Etiqueta texto={`Tamaño · ${Number(f.cutout_scale ?? 1).toFixed(2)}`} ayuda="Más grande si es de cuerpo entero">
                            <input type="range" min={0.6} max={1.8} step={0.02} value={Number(f.cutout_scale ?? 1)} onChange={(e) => set('cutout_scale', Number(e.target.value))} className="w-full accent-[var(--brand)]" />
                        </Etiqueta>
                        <Etiqueta texto={`Bajar · ${Math.round(Number(f.cutout_drop ?? 0) * 100)} %`} ayuda="Esconde las piernas bajo el suelo">
                            <input type="range" min={0} max={0.45} step={0.01} value={Number(f.cutout_drop ?? 0)} onChange={(e) => set('cutout_drop', Number(e.target.value))} className="w-full accent-[var(--brand)]" />
                        </Etiqueta>
                    </div>
                    {f.cutout_src && (
                        <div className="flex h-48 items-end justify-center overflow-hidden rounded-card bg-surface-sunken">
                            <img src={f.cutout_src} alt="" className="h-full w-auto object-contain object-bottom" style={{ transform: `translateY(${Number(f.cutout_drop ?? 0) * 100}%) scale(${Number(f.cutout_scale ?? 1)})`, transformOrigin: 'bottom' }} />
                        </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Etiqueta texto="Vídeo WebM con transparencia (opcional)"><CampoImagen carpeta="atletas" valor={f.video_webm ?? ''} onCambio={(v) => set('video_webm', v)} /></Etiqueta>
                        <Etiqueta texto="Vídeo MOV/HEVC para iPhone (opcional)"><CampoImagen carpeta="atletas" valor={f.video_mov ?? ''} onCambio={(v) => set('video_mov', v)} /></Etiqueta>
                    </div>
                </div>
            </fieldset>
        </Modal>
    );
}

// =====================================================================
// LOGROS
// =====================================================================

function ListaLogros({ filas }: { filas: FilaLogro[] }) {
    const refrescar = useRefrescar();
    const [editando, setEditando] = useState<Partial<FilaLogro> | null>(null);
    const [borrando, setBorrando] = useState<FilaLogro | null>(null);

    const mover = async (i: number, d: -1 | 1) => {
        const orden = filas.map((f, k) => ({ id: f.id, order_index: k }));
        [orden[i].order_index, orden[i + d].order_index] = [orden[i + d].order_index, orden[i].order_index];
        try { await clubWebService.reordenar('club_achievements', orden); refrescar(); } catch { toast.error('No se pudo reordenar'); }
    };

    return (
        <>
            <div className="mb-3 flex items-center justify-between">
                <p className="text-t-sm text-ink-subtle">Los tres primeros salen en la portada; todos, en el historial.</p>
                <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditando({ title: '', result: '', description: '', images: [], visible: true, order_index: -1 })}>Añadir logro</Button>
            </div>
            <ul className="space-y-2">
                {filas.map((f, i) => (
                    <Fila
                        key={f.id}
                        foto={f.images?.[0]}
                        titulo={f.title}
                        subtitulo={f.result}
                        visible={f.visible}
                        primero={i === 0}
                        ultimo={i === filas.length - 1}
                        onSubir={() => mover(i, -1)}
                        onBajar={() => mover(i, 1)}
                        onVisible={async () => { try { await clubWebService.guardarLogro({ id: f.id, title: f.title, visible: !f.visible }); refrescar(); } catch { toast.error('No se pudo guardar'); } }}
                        onEditar={() => setEditando(f)}
                        onBorrar={() => setBorrando(f)}
                    />
                ))}
            </ul>
            {editando && <EditorLogro inicial={editando} onCerrar={() => setEditando(null)} onGuardado={() => { refrescar(); setEditando(null); }} />}
            <ConfirmationModal
                isOpen={!!borrando}
                onClose={() => setBorrando(null)}
                onConfirm={async () => {
                    if (!borrando) return;
                    try { await clubWebService.borrarLogro(borrando.id); refrescar(); toast.success('Logro eliminado'); } catch { toast.error('No se pudo eliminar'); }
                    setBorrando(null);
                }}
                title="¿Eliminar este logro?"
                description={borrando?.title ?? ''}
                confirmText="Eliminar"
                variant="danger"
            />
        </>
    );
}

function EditorLogro({ inicial, onCerrar, onGuardado }: { inicial: Partial<FilaLogro>; onCerrar: () => void; onGuardado: () => void }) {
    const [f, setF] = useState<Partial<FilaLogro>>(inicial);
    const [nueva, setNueva] = useState('');
    const [guardando, setGuardando] = useState(false);
    const nuevo = !inicial.id;
    const fotos = f.images ?? [];

    const guardar = async () => {
        const title = (f.title ?? '').trim();
        if (!title) { toast.error('Falta el título'); return; }
        setGuardando(true);
        try {
            await clubWebService.guardarLogro({ ...f, title, achieved_on: f.achieved_on || null });
            toast.success(nuevo ? 'Logro añadido' : 'Logro guardado');
            onGuardado();
        } catch (e) {
            toast.error(`No se pudo guardar: ${(e as Error).message}`);
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Modal
            open
            onClose={onCerrar}
            title={nuevo ? 'Nuevo logro' : 'Editar logro'}
            size="lg"
            footer={<><Button variant="secondary" onClick={onCerrar}>Cancelar</Button><Button variant="primary" loading={guardando} onClick={guardar}>Guardar</Button></>}
        >
            <div className="grid gap-4 sm:grid-cols-2">
                <Etiqueta texto="Competición"><input className={campo} value={f.title ?? ''} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Campeonato de España Junior 2026" /></Etiqueta>
                <Etiqueta texto="Resultado"><input className={campo} value={f.result ?? ''} onChange={(e) => setF({ ...f, result: e.target.value })} placeholder="Campeón -105kg" /></Etiqueta>
                <Etiqueta texto="Fecha (opcional)"><input type="date" className={campo} value={f.achieved_on ?? ''} onChange={(e) => setF({ ...f, achieved_on: e.target.value })} /></Etiqueta>
            </div>
            <div className="mt-4">
                <Etiqueta texto="Descripción"><textarea className={`${campo} h-24 py-2`} value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} /></Etiqueta>
            </div>
            <div className="mt-4">
                <span className="text-t-xs font-semibold text-ink-muted">Fotos (la primera es la portada)</span>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {fotos.map((u, i) => (
                        <div key={`${u}-${i}`} className="relative aspect-[4/5] overflow-hidden rounded-field bg-surface-sunken">
                            <SafeImage src={u} alt="" className="h-full w-full object-cover" />
                            <button type="button" aria-label="Quitar foto" onClick={() => setF({ ...f, images: fotos.filter((_, j) => j !== i) })} className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-pill bg-black/60 text-white"><X size={14} /></button>
                        </div>
                    ))}
                    <SubirFotoLogro onSubida={(u) => setF((x) => ({ ...x, images: [...(x.images ?? []), u] }))} />
                </div>
                <div className="mt-2 flex gap-2">
                    <input className={campo} value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="…o pega la dirección de una foto" />
                    <Button variant="secondary" disabled={!nueva.trim()} onClick={() => { setF((x) => ({ ...x, images: [...(x.images ?? []), nueva.trim()] })); setNueva(''); }}>Añadir</Button>
                </div>
            </div>
        </Modal>
    );
}

function SubirFotoLogro({ onSubida }: { onSubida: (url: string) => void }) {
    const input = useRef<HTMLInputElement>(null);
    const [subiendo, setSubiendo] = useState(false);
    return (
        <>
            <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                const archivos = [...(e.target.files ?? [])];
                e.target.value = '';
                setSubiendo(true);
                for (const a of archivos) {
                    try { onSubida(await clubWebService.subirFoto(a, 'logros')); } catch (err) { toast.error(`No se pudo subir ${a.name}: ${(err as Error).message}`); }
                }
                setSubiendo(false);
            }} />
            <button
                type="button"
                onClick={() => input.current?.click()}
                disabled={subiendo}
                className="flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-field border border-dashed border-[var(--border-strong)] text-t-xs font-semibold text-ink-subtle hover:border-brand hover:text-ink"
            >
                <ImagePlus size={20} aria-hidden="true" />
                {subiendo ? 'Subiendo…' : 'Subir fotos'}
            </button>
        </>
    );
}
