-- Migration 0002 — make observation writes atomic and self-policing.
--
-- Two problems this solves.
--
-- 1. Applying a revision is three statements: retire the old row, insert the
--    new one, record the revision. Run from the client they are three separate
--    round-trips, and a failure between them leaves the fact table with either
--    two current rows for one period or none. Either corrupts every series
--    reading silently.
--
-- 2. Nothing enforced "exactly one current row per (indicator, period_end)".
--    The unique constraint in migration 0001 is on (indicator_id, period_end,
--    revision), which happily permits two rows with is_current = true.

-- --------------------------------------------------------------------------
-- Per-adapter settings for an indicator.
--
-- Migration 0001 has `transform` for value transforms and `detection_config`
-- for thresholds, but nowhere to say *where* a weather series is measured.
-- Without this, adding an Open-Meteo indicator would need a code change, and
-- adding indicators has to stay data entry to reach 50-100 of them (§8).
-- --------------------------------------------------------------------------
alter table indicators
  add column if not exists adapter_config jsonb not null default '{}';

comment on column indicators.adapter_config is
  'Adapter-specific settings, e.g. {latitude, longitude, daily} for Open-Meteo.';

-- --------------------------------------------------------------------------
-- The invariant, enforced by the database rather than by convention.
-- --------------------------------------------------------------------------
create unique index if not exists indicator_observations_one_current
  on indicator_observations (indicator_id, period_end)
  where is_current;

-- --------------------------------------------------------------------------
-- Atomic apply.
--
-- Takes a batch of observations as JSON and, in one transaction:
--   * inserts periods we have never seen
--   * ignores periods whose value is unchanged
--   * for a changed value, retires the current row, inserts revision n+1,
--     and appends to observation_revisions
--
-- Idempotent: replaying the same payload is a no-op, which is what lets the
-- pipeline retry a failed step without special-casing partial success.
-- --------------------------------------------------------------------------
create or replace function apply_observations(
  p_indicator_id   uuid,
  p_source_id      uuid,
  p_raw_payload_id uuid,
  p_rows           jsonb
)
returns table (inserted int, revised int, unchanged int)
language plpgsql
security invoker
as $$
declare
  r            jsonb;
  v_existing   indicator_observations%rowtype;
  v_value      numeric;
  v_inserted   int := 0;
  v_revised    int := 0;
  v_unchanged  int := 0;
  -- Float noise must not register as a revision. A provider re-emitting
  -- 4.900000000001 for 4.9 would otherwise produce a stream of phantom rows.
  c_epsilon    numeric := 1e-9;
begin
  for r in select * from jsonb_array_elements(p_rows)
  loop
    v_value := (r->>'value')::numeric;

    select * into v_existing
    from indicator_observations
    where indicator_id = p_indicator_id
      and period_end   = (r->>'period_end')::date
      and is_current
    for update;

    if not found then
      insert into indicator_observations (
        indicator_id, period_start, period_end, period_type, value, unit,
        released_at, raw_payload_id, source_id, revision, is_current
      ) values (
        p_indicator_id,
        (r->>'period_start')::date,
        (r->>'period_end')::date,
        r->>'period_type',
        v_value,
        r->>'unit',
        nullif(r->>'released_at', '')::timestamptz,
        p_raw_payload_id,
        p_source_id,
        1,
        true
      );
      v_inserted := v_inserted + 1;

    elsif abs(v_existing.value - v_value) <= c_epsilon then
      v_unchanged := v_unchanged + 1;

    else
      -- Retire, do not overwrite. Point-in-time correctness depends on the
      -- original print surviving (§36).
      update indicator_observations
         set is_current = false
       where id = v_existing.id;

      insert into indicator_observations (
        indicator_id, period_start, period_end, period_type, value, unit,
        released_at, raw_payload_id, source_id, revision, is_current
      ) values (
        p_indicator_id,
        (r->>'period_start')::date,
        (r->>'period_end')::date,
        r->>'period_type',
        v_value,
        r->>'unit',
        nullif(r->>'released_at', '')::timestamptz,
        p_raw_payload_id,
        p_source_id,
        v_existing.revision + 1,
        true
      );

      insert into observation_revisions (
        indicator_id, period_end, previous_value, new_value, raw_payload_id
      ) values (
        p_indicator_id,
        (r->>'period_end')::date,
        v_existing.value,
        v_value,
        p_raw_payload_id
      );

      v_revised := v_revised + 1;
    end if;
  end loop;

  return query select v_inserted, v_revised, v_unchanged;
end;
$$;

comment on function apply_observations is
  'Atomically applies a batch of observations, appending revisions rather than overwriting. Idempotent.';
