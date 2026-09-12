begin;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'rls-a@test.local'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'rls-b@test.local');

insert into repos (id, user_id, owner, repo, url) values
  ('aaaaaaaa-1111-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'rls', 'repo-a', 'https://github.com/rls/repo-a'),
  ('bbbbbbbb-1111-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'rls', 'repo-b', 'https://github.com/rls/repo-b');

insert into code_chunks (repo_id, user_id, file_path, content, chunk_index, start_offset, end_offset, embedding) values
  ('aaaaaaaa-1111-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'a.py', 'a', 0, 0, 1, array_fill(0.1::float4, array[768])::vector),
  ('bbbbbbbb-1111-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'b.py', 'b', 0, 0, 1, array_fill(0.1::float4, array[768])::vector);

insert into indexed_files (repo_id, user_id, file_path, sha) values
  ('aaaaaaaa-1111-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'a.py', 'sha-a'),
  ('bbbbbbbb-1111-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'b.py', 'sha-b');

insert into subscriptions (user_id, stripe_customer_id, plan_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cus_rls_a', 'free'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'cus_rls_b', 'ultra');

insert into usage_monthly (user_id, month, messages) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '2026-09-01', 1),
  ('bbbbbbbb-0000-4000-8000-000000000002', '2026-09-01', 99);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-4000-8000-000000000001", "role": "authenticated"}', true);

do $$
declare
  affected int;
begin
  assert (select count(*) from repos) = 1, 'A vê repos que não são dele';
  assert (select count(*) from code_chunks) = 1, 'A vê chunks que não são dele';
  assert (select count(*) from indexed_files) = 0, 'indexed_files não tem policy e mesmo assim é legível';
  assert (select count(*) from subscriptions) = 1, 'A vê subscrições de outros';
  assert (select count(*) from usage_monthly) = 1, 'A vê o uso de outros';

  assert (
    select count(*) from match_chunks(
      array_fill(0.1::float4, array[768])::vector,
      'bbbbbbbb-1111-4000-8000-000000000002',
      'bbbbbbbb-0000-4000-8000-000000000002'
    )
  ) = 0, 'A lê chunks de B pelo match_chunks passando o user_id de B';

  assert (
    select count(*) from match_chunks(
      array_fill(0.1::float4, array[768])::vector,
      'aaaaaaaa-1111-4000-8000-000000000001',
      'aaaaaaaa-0000-4000-8000-000000000001'
    )
  ) = 1, 'A não consegue ler os próprios chunks pelo match_chunks';

  delete from repos where id = 'bbbbbbbb-1111-4000-8000-000000000002';
  get diagnostics affected = row_count;
  assert affected = 0, 'A apagou um repo de B';

  update repos set url = 'https://github.com/rls/tampered' where id = 'aaaaaaaa-1111-4000-8000-000000000001';
  get diagnostics affected = row_count;
  assert affected = 0, 'A alterou um repo (não há policy de update)';

  update subscriptions set plan_id = 'ultra' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  assert affected = 0, 'A subiu o próprio plano sem pagar';

  begin
    perform add_usage('aaaaaaaa-0000-4000-8000-000000000001', -1000, -1000);
    raise exception 'A conseguiu mexer no próprio contador de uso pelo add_usage';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into repos (user_id, owner, repo, url)
    values ('bbbbbbbb-0000-4000-8000-000000000002', 'rls', 'plantado', 'https://github.com/rls/plantado');
    raise exception 'A inseriu um repo em nome de B';
  exception when insufficient_privilege then
    null;
  end;

  delete from repos where id = 'aaaaaaaa-1111-4000-8000-000000000001';
  get diagnostics affected = row_count;
  assert affected = 1, 'A não consegue apagar o próprio repo';
end $$;

rollback;
