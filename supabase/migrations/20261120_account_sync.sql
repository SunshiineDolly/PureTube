begin;

create table public.viddy_library (
    owner uuid primary key references auth.users(id) on delete cascade,
    revision integer not null check (revision > 0),
    data jsonb not null check (
        jsonb_typeof(data) = 'object'
        and data @> '{"version":1}'
        and octet_length(data::text) <= 5242880
    )
);

alter table public.viddy_library enable row level security;
revoke all on public.viddy_library from public, anon, authenticated;
grant select, insert, update on public.viddy_library to authenticated;

create policy own_library on public.viddy_library
    for all to authenticated
    using (owner = (select auth.uid()))
    with check (owner = (select auth.uid()));

create function public.viddy_write_library(expected integer, snapshot jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if expected = 0 then
        insert into public.viddy_library(owner, revision, data)
        values (auth.uid(), 1, snapshot)
        on conflict (owner) do nothing;
    else
        update public.viddy_library
        set revision = revision + 1, data = snapshot
        where owner = auth.uid() and revision = expected;
    end if;
    return found;
end;
$$;

revoke all on function public.viddy_write_library(integer, jsonb) from public, anon;
grant execute on function public.viddy_write_library(integer, jsonb) to authenticated;

commit;
