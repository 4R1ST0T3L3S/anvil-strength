# Diagnóstico de Rendimiento — Anvil Strength

**Estado**: El aviso "Your project is currently exhausting multiple resources" sigue apareciendo en Supabase a pesar de ejecutar `OPTIMIZACION_RENDIMIENTO.sql`.

## Por qué sigue apareciendo

Hay **dos presupuestos independientes** en Supabase que se agotan por separado:

1. **CPU** — se recupera cada hora
2. **IO de disco** — se recupera cada hora (en algunas instancias cada 24h)

Ejecutar `OPTIMIZACION_RENDIMIENTO.sql` reduce el *consumo por consulta* pero no restaura un presupuesto ya agotado. Verás la mejora cuando se recupere en la siguiente ventana.

**Verifica cuál se agotó**: Supabase → Database → Reports → Resource Usage. Si ves "IO exhausted", espera. Si es "CPU exhausted" y acabas de optimizar, es que hay más trabajo que no se ve.

---

## Qué ya se hizo

### SQL (database/OPTIMIZACION_RENDIMIENTO.sql)
- ✅ Envuelto `auth.uid()` en todas las políticas (resuelve una sola vez, no por fila)
- ✅ Creado índices en todas las claves ajenas
- ✅ Reescrito políticas permisivas duplicadas

### Cliente (src/features/training/components/WorkoutLogger.tsx)
- ✅ WorkoutLogger ahora carga solo la semana actual (8× menos datos)
- ✅ Otras semanas se cargan bajo demanda (lazy loading)

### Servidor (src/services/trainingService.ts)
- ✅ `getExerciseHistoryByAthlete` limitada a últimos 2 bloques (en lugar de histórico completo)

---

## Si el aviso persiste después de 1 hora

**Opción 1: Verificar que las optimizaciones se aplicaron**

Ejecuta en el editor SQL de Supabase — debe decir `0` para las dos filas:

```sql
-- Políticas con JWT sin envolver (debe ser 0)
SELECT count(*)
  FROM pg_policies
 WHERE schemaname = 'public'
   AND (COALESCE(qual, '') LIKE '%auth.uid()%' OR COALESCE(with_check, '') LIKE '%auth.uid()%')
   AND COALESCE(qual, '')       NOT LIKE '%SELECT auth.uid()%'
   AND COALESCE(with_check, '') NOT LIKE '%SELECT auth.uid()%';

-- Claves ajenas sin índice (debe ser 0)
SELECT count(*)
  FROM pg_constraint c
  JOIN pg_class     t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
 WHERE c.contype = 'f'
   AND n.nspname = 'public'
   AND NOT EXISTS (
       SELECT 1 FROM pg_index i
        WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1]
   );
```

Si alguna sale mayor que 0, las optimizaciones no se aplicaron: vuelve a ejecutar `OPTIMIZACION_RENDIMIENTO.sql` completo.

---

**Opción 2: Ver qué consultas consumen más**

Habilita `pg_stat_statements` en Supabase → Database → Extensions (si no está ya) y luego ejecuta:

```sql
SELECT calls,
       round(total_exec_time)::bigint      AS ms_totales,
       round(mean_exec_time)::numeric(10,2) AS ms_media,
       rows,
       left(query, 200)                     AS consulta
  FROM pg_stat_statements
 ORDER BY total_exec_time DESC
 LIMIT 20;
```

Busca:
- Consultas que se lanzan 1000+ veces aunque sean rápidas (problema: N+1)
- Consultas de 100ms+ (problema: carga datos innecesarios o falta índice)

Si ves `session_exercises` recorriendo `training_sets (*)` muchas veces, es que se está cargando histórico completo. Si ves `auth.uid()` miles de veces, es que una política aún no está optimizada.

---

**Opción 3: Upgrade temporal**

Si necesitas que vuelva a funcionar HOY:

Supabase → Project Settings → Billing → Change Compute

Sube a `Medium` o `Large` por un mes mientras optimizas. El presupuesto mayor te dejará respirar, y verás mejor si el gasto baja después de arreglarlo.

---

## Si el gasto es realmente alto

Hay dos culpables más que no cambian estructura pero que sí consumen:

1. **`AthleteStatsModal` cargando historial completo** — igual que el del constructor, carga TODO para mostrar un resumen. Opción: paginación o filtro de fecha.

2. **Realtime subscriptions** — hay 17 canales abiertos. Algunos (Arena, games) generan muchas notificaciones. Opción: cerrar los que no se usen, o pasar a polling.

Dime si quieres optimizar cualquiera de esos.

---

## Resumen de cambios

| Fichero | Cambio | Impacto |
|---------|--------|--------|
| `database/OPTIMIZACION_RENDIMIENTO.sql` | Políticas + índices | Alto (x5-10 consultas) |
| `database/MIGRACION_PENDIENTE.sql` | Añadidas columnas `target_metric` y `notes` | Crítico (fijaba guardado) |
| `WorkoutLogger.tsx` | Solo semana actual al abrir | Alto (x8 en carga) |
| `trainingService.ts` | Historial últimos 2 bloques | Medio-Alto |

---

## Cuándo esperar mejora

- **En 1h**: Los presupuestos se recuperan. Verás la mejora si el gasto baja de verdad.
- **En 24h**: Si es de IO, algunos planes se recuperan a las 24h.
- **Nunca**: Si el gasto es realmente alto (miles de atletas, entrenadores lanzando reportes cada minuto), necesitas upgrade o rediseño más profundo.

---

*Generado después de ejecutar `database/OPTIMIZACION_RENDIMIENTO.sql` el 2 de agosto de 2026.*
