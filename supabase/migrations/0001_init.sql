-- 句型日练 Pattern Daily — 同步表
-- 在 Supabase 控制台 → SQL Editor 中整段粘贴执行即可（可重复执行）。

create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  tbl        text        not null check (tbl in ('cards', 'reviews', 'attempts', 'sessions', 'userFrames', 'profile')),
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at bigint      not null,
  deleted    boolean     not null default false,
  server_ts  timestamptz not null default clock_timestamp(),
  primary key (user_id, tbl, id)
);

create index if not exists records_user_server_ts_idx on public.records (user_id, server_ts);

alter table public.records enable row level security;

drop policy if exists "records_select_own" on public.records;
create policy "records_select_own" on public.records
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "records_insert_own" on public.records;
create policy "records_insert_own" on public.records
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "records_update_own" on public.records;
create policy "records_update_own" on public.records
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 每次更新都刷新 server_ts，其他设备才能通过游标拉到这次变更。
create or replace function public.records_touch_server_ts()
returns trigger
language plpgsql
as $$
begin
  new.server_ts := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists records_touch_server_ts on public.records;
create trigger records_touch_server_ts
  before update on public.records
  for each row execute function public.records_touch_server_ts();

-- 批量推送：只有 updated_at 更新的一方才会覆盖服务器上的行（last-write-wins）。
-- rows 形如 [{"tbl":"cards","id":"dozen:d01","data":{...},"updated_at":1700000000000,"deleted":false}, ...]
create or replace function public.push_records(rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.records as r (user_id, tbl, id, data, updated_at, deleted)
  select auth.uid(), x.tbl, x.id, coalesce(x.data, '{}'::jsonb), x.updated_at, coalesce(x.deleted, false)
  from (
    select distinct on (j.tbl, j.id) j.tbl, j.id, j.data, j.updated_at, j.deleted
    from jsonb_to_recordset(rows) as j(tbl text, id text, data jsonb, updated_at bigint, deleted boolean)
    order by j.tbl, j.id, j.updated_at desc
  ) as x
  on conflict (user_id, tbl, id) do update
    set data       = excluded.data,
        updated_at = excluded.updated_at,
        deleted    = excluded.deleted
    where excluded.updated_at > r.updated_at;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.push_records(jsonb) from public;
grant execute on function public.push_records(jsonb) to authenticated;
