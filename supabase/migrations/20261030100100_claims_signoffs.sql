-- The claims check ignores sign-offs (Phase 14): "Best wishes" ended every drafted reply and
-- was flagged as an unverifiable superlative. Kept in step with checkClaims in
-- src/lib/workspace.ts (the parity test checks both).
create or replace function private.claims_flags(p_text text, p_sector public.sector_pack, p_unbuilt text[])
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  rules jsonb := jsonb_build_array(
    jsonb_build_object('pattern', '\y(best|number one|world.leading|most effective)\y', 'reason', 'Unverifiable superlative'),
    jsonb_build_object('pattern', '\y(guarantee\w*|will improve|double your|100% success|cuts bills)\y', 'reason', 'Promises results')
  );
  r jsonb;
  m text[];
  feature text;
  flags jsonb := '[]';
begin
  if p_text is null or p_text = '' then
    return flags;
  end if;
  -- Sign-offs aren't claims ("Best wishes", "All the best").
  p_text := regexp_replace(p_text, '\y(best wishes|best regards|kind regards|all the best|best of luck)\y', '~', 'gi');
  if p_sector is distinct from 'general' then
    rules := rules || jsonb_build_array(jsonb_build_object(
      'pattern', '\y(actually works|proven|clinically|risk.free|approved|certified)\y',
      'reason', 'Regulated claim needs supporting evidence'));
  end if;
  for r in select * from jsonb_array_elements(rules) loop
    for m in select regexp_matches(p_text, r ->> 'pattern', 'gi') loop
      flags := flags || jsonb_build_array(jsonb_build_object('phrase', m[1], 'reason', r ->> 'reason'));
    end loop;
  end loop;
  foreach feature in array coalesce(p_unbuilt, '{}') loop
    if length(trim(feature)) > 0 then
      for m in select regexp_matches(p_text, '\y(' || regexp_replace(trim(feature), '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || ')\y', 'gi') loop
        flags := flags || jsonb_build_array(jsonb_build_object('phrase', m[1], 'reason', 'Feature not built yet'));
      end loop;
    end if;
  end loop;
  return flags;
end;
$$;
