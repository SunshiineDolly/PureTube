begin;
create schema if not exists viddy_private;
revoke all on schema viddy_private from public, anon, authenticated;

create table viddy_private.accounts (
    id uuid primary key default gen_random_uuid(),
    verifier bytea not null unique,
    uses_legacy_library boolean not null default false,
    revision integer not null default 0 check (revision >= 0),
    data jsonb check (data is null or (
        jsonb_typeof(data) = 'object' and data @> '{"version":1}'
        and octet_length(data::text) <= 2097152
    ))
);
alter table viddy_private.accounts enable row level security;
revoke all on viddy_private.accounts from public, anon, authenticated;

create function public.viddy_private_account(
  action text, account_key text, expected integer default null, snapshot jsonb default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
    digest bytea;
    account_row viddy_private.accounts%rowtype;
    owner_id uuid;
    result jsonb;
begin
    if account_key is null or length(account_key) <> 49 or account_key !~ '^viddy_[A-Za-z0-9_-]{43}$' then
        raise exception 'Invalid account key' using errcode = '22023';
    end if;
    digest := sha256(convert_to(account_key, 'UTF8'));
    select a.* into account_row from viddy_private.accounts a where a.verifier = digest;

    if action in ('create', 'attach') then
        owner_id := auth.uid();
        if action = 'attach' and owner_id is null then
            raise exception 'Sign in to your existing account first' using errcode = '42501';
        end if;
        if account_row.id is not null then
            if (action = 'attach' and account_row.id <> owner_id)
                or (action = 'create' and account_row.uses_legacy_library) then
                raise exception 'Key cannot be used for this action' using errcode = '42501';
            end if;
            return to_jsonb(account_row.id);
        end if;

        perform pg_advisory_xact_lock(28162301);
        if (select count(*) from viddy_private.accounts) >= 128 then
            raise exception 'Viddy has reached its free account capacity' using errcode = '54000';
        end if;
        insert into viddy_private.accounts(id, verifier, uses_legacy_library)
        values (case when action = 'attach' then owner_id else gen_random_uuid() end, digest, action = 'attach')
        returning id into owner_id;
        return to_jsonb(owner_id);
    end if;

    if account_row.id is null then
        raise exception 'Invalid account key' using errcode = '42501';
    end if;
    if action = 'identify' then return to_jsonb(account_row.id); end if;

    if action = 'read' then
        if account_row.uses_legacy_library then
            select jsonb_build_object('revision', l.revision, 'data', l.data) into result
            from public.viddy_library l where l.owner = account_row.id and l.revision is distinct from expected;
            return result;
        end if;
        if account_row.revision = 0 or account_row.revision = expected then return null; end if;
        return jsonb_build_object('revision', account_row.revision, 'data', account_row.data);
    end if;

    if action = 'write' then
        if expected is null or expected < 0 or snapshot is null
           or not (snapshot @> '{"version":1}')
           or octet_length(snapshot::text) > 2097152 then
            raise exception 'Library exceeds the supported size or format' using errcode = '22023';
        end if;
        if account_row.uses_legacy_library then
            if expected = 0 then
                insert into public.viddy_library(owner, revision, data)
                values (account_row.id, 1, snapshot) on conflict (owner) do nothing;
            else
                update public.viddy_library l set revision = l.revision + 1, data = snapshot
                where l.owner = account_row.id and l.revision = expected;
            end if;
        else
            update viddy_private.accounts a set revision = a.revision + 1, data = snapshot
            where a.id = account_row.id and a.revision = expected;
        end if;
        return to_jsonb(found);
    end if;
    raise exception 'Unknown account action' using errcode = '22023';
end;
$$;

revoke all on function public.viddy_private_account(text, text, integer, jsonb) from public;
grant execute on function public.viddy_private_account(text, text, integer, jsonb) to anon, authenticated;
commit;
