#!/usr/bin/env python3
"""Print Supabase-style TypeScript table blocks for the given public tables, read from a local
Postgres. A stand-in for `supabase gen types` where Docker isn't available (the CLI needs it):
the output matches the generated format so the blocks can be pasted into
src/integrations/supabase/types.ts, which Prettier then formats. Prefer `npm run db:types` when
the Supabase CLI and Docker are available.

Usage: scripts/db/gen-table-types.py <database> <table> [<table> ...]
"""
import subprocess
import sys

DB = sys.argv[1]
TABLES = sys.argv[2:]


def q(sql: str) -> list[list[str]]:
    out = subprocess.run(
        ["psql", "-X", "-At", "-F", "\t", "-d", DB, "-c", sql],
        check=True, capture_output=True, text=True,
    ).stdout
    return [line.split("\t") for line in out.splitlines() if line]


ENUMS = {r[0] for r in q("select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e'")}
SCALARS = {
    "uuid": "string", "text": "string", "timestamptz": "string", "timestamp": "string",
    "date": "string", "time": "string", "interval": "string", "inet": "unknown",
    "int2": "number", "int4": "number", "int8": "number", "numeric": "number",
    "float4": "number", "float8": "number", "bool": "boolean", "citext": "string",
}


def ts_type(udt: str, nullable: bool) -> str:
    is_array = udt.startswith("_")
    base = udt[1:] if is_array else udt
    if base in ENUMS:
        t = f'Database["public"]["Enums"]["{base}"]'
    elif base in ("json", "jsonb"):
        t = "Json"
    else:
        t = SCALARS.get(base, "unknown")
    if is_array:
        t = f"{t}[]"
    if base in ("json", "jsonb") and not is_array:
        return "Json | null" if nullable else "NonNullable<Json>"
    return f"{t} | null" if nullable else t


def block(table: str) -> str:
    cols = q(f"""
      select column_name, udt_name, is_nullable, coalesce(column_default, ''), is_identity, is_generated
      from information_schema.columns
      where table_schema = 'public' and table_name = '{table}'
      order by column_name""")
    fks = q(f"""
      select c.conname,
        (select string_agg('"' || a.attname || '"', ', ' order by k.ord)
           from unnest(c.conkey) with ordinality k(attnum, ord)
           join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum),
        (select string_agg('"' || a.attname || '"', ', ' order by k.ord)
           from unnest(c.confkey) with ordinality k(attnum, ord)
           join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum),
        rt.relname,
        -- One-to-one when the FK columns are exactly a unique key of this table.
        exists (select 1 from pg_constraint u where u.conrelid = c.conrelid and u.contype in ('u', 'p')
                and (select array_agg(x order by x) from unnest(u.conkey) x) = (select array_agg(x order by x) from unnest(c.conkey) x))
      from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_class rt on rt.oid = c.confrelid
      join pg_namespace n on n.oid = t.relnamespace
      where c.contype = 'f' and n.nspname = 'public' and t.relname = '{table}'
      order by c.conname""")
    out = [f"      {table}: {{", "        Row: {"]
    for name, udt, nullable, *_ in cols:
        out.append(f"          {name}: {ts_type(udt, nullable == 'YES')};")
    out += ["        };", "        ComputedFields: never;", "        Insert: {"]
    for name, udt, nullable, default, ident, gen in cols:
        optional = nullable == "YES" or default != "" or ident == "YES" or gen == "ALWAYS"
        out.append(f"          {name}{'?' if optional else ''}: {ts_type(udt, nullable == 'YES')};")
    out += ["        };", "        Update: {"]
    for name, udt, nullable, *_ in cols:
        out.append(f"          {name}?: {ts_type(udt, nullable == 'YES')};")
    out.append("        };")
    if not fks:
        out.append("        Relationships: [];")
    else:
        out.append("        Relationships: [")
        for conname, cols_, refcols, reftable, one in fks:
            out += [
                "          {",
                f'            foreignKeyName: "{conname}";',
                f"            columns: [{cols_}];",
                f"            isOneToOne: {'true' if one == 't' else 'false'};",
                f'            referencedRelation: "{reftable}";',
                f"            referencedColumns: [{refcols}];",
                "          },",
            ]
        out.append("        ];")
    out.append("      };")
    return "\n".join(out)


print("\n".join(block(t) for t in TABLES))
