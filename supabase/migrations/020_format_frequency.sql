-- 020: Frequência por tipo de publicação (Feed / Story / Reels)
-- format_frequency: JSONB { "feed": 2, "story": 2, "reels": 1 }
-- frequency_per_week passa a ser derivado (soma) via trigger.

ALTER TABLE editorial_profiles
  ADD COLUMN IF NOT EXISTS format_frequency JSONB DEFAULT '{}'::jsonb;

-- Total semanal agora deriva de format_frequency; limite fixo sai do banco
ALTER TABLE editorial_profiles
  DROP CONSTRAINT IF EXISTS chk_frequency;

CREATE OR REPLACE FUNCTION fn_sync_format_frequency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  total INTEGER;
BEGIN
  IF NEW.format_frequency IS NOT NULL AND NEW.format_frequency <> '{}'::jsonb THEN
    SELECT COALESCE(SUM(
      CASE WHEN v.value ~ '^[0-9]+$' THEN v.value::INTEGER ELSE 0 END
    ), 0)
      INTO total
      FROM jsonb_each_text(NEW.format_frequency) AS v(key, value);

    NEW.frequency_per_week := GREATEST(total, 1);

    -- Garante que o gerador semanal não trunque abaixo do configurado
    IF NEW.max_weekly IS NULL OR NEW.max_weekly < NEW.frequency_per_week THEN
      NEW.max_weekly := NEW.frequency_per_week + 2;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_format_frequency ON editorial_profiles;
CREATE TRIGGER trg_sync_format_frequency
  BEFORE INSERT OR UPDATE ON editorial_profiles
  FOR EACH ROW EXECUTE FUNCTION fn_sync_format_frequency();

-- Backfill: distribui a frequência atual nas 3 zonas (~40% feed / ~40% story / ~20% reels)
DO $$
DECLARE
  r RECORD;
  f INTEGER;
  reels_n INTEGER;
  story_n INTEGER;
BEGIN
  FOR r IN
    SELECT id, COALESCE(frequency_per_week, 5) AS freq
      FROM editorial_profiles
     WHERE format_frequency IS NULL OR format_frequency = '{}'::jsonb
  LOOP
    f := GREATEST(r.freq, 1);
    reels_n := FLOOR(f / 5.0)::INTEGER;
    story_n := CEIL((f - reels_n) / 2.0)::INTEGER;
    UPDATE editorial_profiles
       SET format_frequency = jsonb_build_object(
             'feed', f - reels_n - story_n,
             'story', story_n,
             'reels', reels_n
           ),
           frequency_per_week = f
     WHERE id = r.id;
  END LOOP;
END $$;
