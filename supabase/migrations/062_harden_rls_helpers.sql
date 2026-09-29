-- 062: hardening dos helpers apontados pelo Supabase Security Advisor
--  1) revoga EXECUTE do papel anon em 13 funcoes SECURITY DEFINER que so sao
--     chamadas com sessao autenticada (public_workspaces_list permanece anon,
--     pois e usada na pagina de solicitacao de acesso pre-login)
--  2) fixa search_path de public.action_status_label (corpo = CASE puro)
--  3) remove a funcao de teste legada public.ztest_accent (corpo = literal,
--     sem dependentes externos)
-- Idempotente; executa em unica transacao implicita (bloco DO unico).
do $$
declare fn text;
begin
  foreach fn in array array[
    'has_workspace_access(uuid,uuid)',
    'is_any_env_staff(uuid)',
    'is_env_admin(uuid,environment_type)',
    'is_env_staff(uuid,environment_type)',
    'is_guardian(uuid)',
    'is_oracullo_admin(uuid)',
    'is_sharks_admin(uuid)',
    'is_sharks_team(uuid)',
    'org_environment(uuid)',
    'ws_env_allows_write(uuid,uuid)',
    'ws_env_map()',
    'ws_environment(uuid)',
    'ws_visible(uuid,uuid)'
  ] loop
    if to_regprocedure('public.' || fn) is not null then
      execute format('revoke execute on function public.%s from public, anon', fn);
      execute format('grant execute on function public.%s to authenticated, service_role', fn);
    else
      raise notice 'funcao inexistente, pulando: %', fn;
    end if;
  end loop;

  execute 'alter function public.action_status_label(text) set search_path = ''''';

  drop function if exists public.ztest_accent();
end $$;
