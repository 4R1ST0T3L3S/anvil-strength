import { supabase } from '../lib/supabase';

export interface CoachInvite {
    id: string;
    coach_id: string;
    code: string;
    label: string | null;
    max_uses: number;
    uses: number;
    expires_at: string | null;
    revoked_at: string | null;
    created_at: string;
}

/** Por qué una invitación no sirve. El texto para el usuario vive en la UI. */
export type InviteProblem =
    | 'no_existe'
    | 'caducada'
    | 'revocada'
    | 'agotada'
    | 'es_tuya'
    | 'sin_sesion';

export interface InvitePreview {
    coachName: string | null;
    coachAvatar: string | null;
    coachRole: string | null;
    isValid: boolean;
    problem: InviteProblem | null;
}

export interface RedeemResult {
    ok: boolean;
    problem: InviteProblem | null;
    coachName: string | null;
    /** Ya estaba vinculado antes. Es éxito, no error: ha pulsado dos veces. */
    alreadyLinked: boolean;
}

/**
 * Dónde se recuerda un código cuando alguien abre el enlace SIN sesión.
 *
 * Hace falta porque registrarse se lleva al usuario fuera de la página —al
 * correo de confirmación, o a Google— y al volver ya no queda ni rastro de
 * la URL original. Sin esto, invitar a alguien que todavía no tiene cuenta
 * (que es el caso normal) no funcionaría nunca.
 *
 * `localStorage` y no `sessionStorage`: el enlace de confirmación de correo
 * se suele abrir en una pestaña NUEVA, y `sessionStorage` no se comparte
 * entre pestañas.
 */
const PENDING_KEY = 'anvil:invitacion-pendiente';

export const invitesService = {
    // -----------------------------------------------------------------
    // Lado del entrenador
    // -----------------------------------------------------------------

    async listByCoach(coachId: string): Promise<CoachInvite[]> {
        const { data, error } = await supabase
            .from('coach_invites')
            .select('*')
            .eq('coach_id', coachId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data ?? []) as CoachInvite[];
    },

    /**
     * Crea una invitación.
     *
     * El código lo genera el SERVIDOR (`new_invite_code`), no el navegador:
     * dos coaches creando un enlace en el mismo segundo podrían sacar el
     * mismo código si cada uno lo sortea por su cuenta.
     *
     * Siempre lleva caducidad. Un enlace eterno que da acceso a los datos de
     * entrenamiento de alguien acaba reenviado en un grupo de WhatsApp dos
     * años después, y para entonces nadie recuerda de dónde salió.
     */
    async create(
        coachId: string,
        options?: { label?: string | null; maxUses?: number; expiresInDays?: number }
    ): Promise<CoachInvite> {
        const { data: code, error: codeError } = await supabase.rpc('new_invite_code');
        if (codeError) throw codeError;

        const days = options?.expiresInDays ?? 30;
        const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();

        const { data, error } = await supabase
            .from('coach_invites')
            .insert({
                coach_id: coachId,
                code,
                label: options?.label?.trim() || null,
                max_uses: options?.maxUses ?? 1,
                expires_at: expiresAt,
            })
            .select()
            .single();

        if (error) throw error;
        return data as CoachInvite;
    },

    /**
     * Anular. No se borra la fila: se marca.
     *
     * Borrarla dejaría el código libre para que el generador lo volviera a
     * sortear, y entonces un enlace viejo que alguien tenía guardado
     * empezaría a funcionar otra vez apuntando a otro sitio.
     */
    async revoke(inviteId: string): Promise<void> {
        const { error } = await supabase
            .from('coach_invites')
            .update({ revoked_at: new Date().toISOString() })
            .eq('id', inviteId);

        if (error) throw error;
    },

    /** La URL que se comparte. */
    buildUrl(code: string): string {
        return `${window.location.origin}/invitacion/${code}`;
    },


    // -----------------------------------------------------------------
    // Lado de quien recibe la invitación
    // -----------------------------------------------------------------

    /** De quién es la invitación, para poder enseñarlo sin tener sesión. */
    async peek(code: string): Promise<InvitePreview> {
        const { data, error } = await supabase.rpc('peek_coach_invite', { p_code: code });
        if (error) throw error;

        const row = Array.isArray(data) ? data[0] : data;
        if (!row) {
            return { coachName: null, coachAvatar: null, coachRole: null, isValid: false, problem: 'no_existe' };
        }

        return {
            coachName: row.coach_name ?? null,
            coachAvatar: row.coach_avatar ?? null,
            coachRole: row.coach_role ?? null,
            isValid: Boolean(row.is_valid),
            problem: (row.reason as InviteProblem) ?? null,
        };
    },

    async redeem(code: string): Promise<RedeemResult> {
        const { data, error } = await supabase.rpc('redeem_coach_invite', { p_code: code });
        if (error) throw error;

        const row = Array.isArray(data) ? data[0] : data;
        if (!row) return { ok: false, problem: 'no_existe', coachName: null, alreadyLinked: false };

        return {
            ok: Boolean(row.ok),
            problem: row.ok ? null : ((row.reason as InviteProblem) ?? null),
            coachName: row.coach_name ?? null,
            alreadyLinked: row.reason === 'ya_vinculado',
        };
    },

    // -----------------------------------------------------------------
    // Invitación recordada mientras el usuario crea su cuenta
    // -----------------------------------------------------------------

    rememberPending(code: string): void {
        try {
            localStorage.setItem(PENDING_KEY, JSON.stringify({ code, at: Date.now() }));
        } catch {
            // Modo privado o cuota llena. Se pierde el vínculo automático,
            // pero el enlace sigue funcionando si lo vuelve a abrir.
        }
    },

    /**
     * Devuelve el código pendiente y lo borra, en la misma llamada.
     *
     * Se descarta pasadas 24 horas: si alguien empezó a registrarse hace una
     * semana y no terminó, engancharlo ahora a un entrenador sin que lo pida
     * sería una sorpresa desagradable.
     */
    takePending(): string | null {
        try {
            const raw = localStorage.getItem(PENDING_KEY);
            if (!raw) return null;
            localStorage.removeItem(PENDING_KEY);

            const { code, at } = JSON.parse(raw) as { code: string; at: number };
            if (!code || Date.now() - at > 86_400_000) return null;
            return code;
        } catch {
            return null;
        }
    },

    peekPending(): string | null {
        try {
            const raw = localStorage.getItem(PENDING_KEY);
            if (!raw) return null;
            const { code, at } = JSON.parse(raw) as { code: string; at: number };
            return code && Date.now() - at <= 86_400_000 ? code : null;
        } catch {
            return null;
        }
    },
};
