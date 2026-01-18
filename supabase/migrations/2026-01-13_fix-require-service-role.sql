-- Hotfix: Supabase PostgREST exposes JWT role via request.jwt.claims (JSON), not request.jwt.claim.role.
-- Run this if your worker logs "service role required" while calling claim_book_processing_job.

create or replace function public._require_service_role()
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  jwt_role text;
begin
  jwt_role := nullif(current_setting('request.jwt.claim.role', true), '');
  if jwt_role is null then
    begin
      jwt_role := (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role');
    exception
      when others then
        jwt_role := null;
    end;
  end if;

  if coalesce(jwt_role, '') <> 'service_role' then
    raise exception 'service role required';
  end if;
end;
$$;
