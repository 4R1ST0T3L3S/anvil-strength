# Migraciones

**A partir del 21 de agosto de 2026, todo el SQL nuevo va aquí**, numerado y en
orden: `NNNN_nombre_corto.sql`.

Los ~80 ficheros sueltos de `database/` (los `FIX_*`, `MASTER_*`,
`00_DIAGNOSTICO_*`) se quedan donde están: son el histórico y hay quince
documentos y comentarios que los referencian por su ruta actual. Moverlos
costaría más de lo que resolvería. Lo que sí cambia es que **no crecen más**.

## Cómo saber qué está aplicado

No preguntando a nadie ni mirando una nota:

```bash
npm run db:check
```

Sondea la base de producción con la clave anónima e imprime, línea a línea, qué
existe y qué no, con la consecuencia de cada cosa que falte. El inventario vive
en [`scripts/db-check.mjs`](../../scripts/db-check.mjs).

**Al añadir una migración, añade su comprobación a ese inventario.** Una
migración que el verificador no conoce es una migración que volverá a
olvidarse — que es exactamente lo que pasó con `FIX_COMPETICIONES_CLUB.sql`,
sin aplicar durante semanas mientras la página pública de competiciones estaba
rota.

## Reglas

1. **Idempotente siempre.** `CREATE OR REPLACE`, `IF NOT EXISTS`,
   `DROP ... IF EXISTS` antes de crear. Se tiene que poder ejecutar dos veces
   seguidas sin miedo.
2. **Bloque de comprobación al final**, que imprima con `RAISE NOTICE` lo que
   ha quedado. Un script que termina en silencio no prueba nada.
3. **Una comprobación de permisos que salte de tabla en tabla va SIEMPRE dentro
   de una función `SECURITY DEFINER STABLE`** con `SET search_path`. Es lo que
   corta el anidamiento de RLS; sin eso, guardar una sola fila llegó a tardar
   ocho segundos (ver `database/FIX_TIMEOUT_SERIES.sql`).
4. **Antes de crear una política, borra las variantes viejas por su nombre
   exacto.** `DROP POLICY IF EXISTS` distingue mayúsculas: `"Coach manage sets"`
   y `"Coach Manage Sets"` son dos políticas distintas y coexisten tan ricamente,
   sumando su coste en cada consulta.
5. **`auth.uid()` siempre envuelto** en `(SELECT auth.uid())` dentro de una
   política: sin el envoltorio se evalúa una vez POR FILA.
6. **Toda columna que el cliente escriba** tiene que estar aplicada antes de
   desplegar el código que la escribe. PostgREST rechaza el lote ENTERO con
   `PGRST204` si una sola columna del payload no existe: no se guarda nada.

## Índice

| # | Fichero | Qué trae |
|---|---|---|
| 0001 | `0001_bloque1_integridad.sql` | Borrado real del atleta gestionado (K2) y consolidación de las políticas duplicadas de `training_blocks` |
| 0002 | `0002_chat_messages.sql` | El esquema y la RLS de `chat_messages`, que solo existían en el panel (K12); índices de conversación y `chat_roster()` |
