import { randomBytes } from "node:crypto";
import { query, transaction } from "./database.js";

type Data = Record<string, any>;
const identifier = (key: string) => {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key))
    throw new Error("Invalid database field");
  return key;
};
const field = (key: string) =>
  key === "_id" ? "id" : `data->>'${identifier(key)}'`;
export function whereSQL(filter: Data, values: any[]): string {
  const bind = (value: any) => {
    values.push(value instanceof Date ? value.toISOString() : value);
    return `$${values.length}`;
  };
  const parts = Object.entries(filter).map(([key, value]): string => {
    if (key === "$or" || key === "$and")
      return `(${value.map((v: Data) => whereSQL(v, values)).join(key === "$or" ? " OR " : " AND ") || "FALSE"})`;
    const col = field(key);
    if (value === null) return `(${col} IS NULL)`;
    if (typeof value === "object" && !(value instanceof Date)) {
      return Object.entries(value)
        .filter(([op]) => op !== "$options")
        .map(([op, v]) => {
          if (op === "$in" || op === "$nin")
            return `(${col} ${op === "$nin" ? "NOT " : ""}IN (SELECT jsonb_array_elements_text(${bind(JSON.stringify(v))}::jsonb))${op === "$nin" ? ` OR ${col} IS NULL` : ""})`;
          if (op === "$regex")
            return `${col} ${value.$options?.includes("i") ? "~*" : "~"} ${bind(v)}`;
          const cmp = {
            $gt: ">",
            $lt: "<",
            $gte: ">=",
            $lte: "<=",
            $ne: "<>",
            $eq: "=",
          }[op];
          if (!cmp) throw new Error(`Unsupported query operator ${op}`);
          if (v === null) return `${col} IS ${op === "$ne" ? "NOT " : ""}NULL`;
          const numeric = typeof v === "number";
          return `(${numeric ? `(${col})::numeric` : col} ${cmp} ${bind(v)}${op === "$ne" ? ` OR ${col} IS NULL` : ""})`;
        })
        .join(" AND ");
    }
    return `${col} = ${bind(String(value instanceof Date ? value.toISOString() : value))}`;
  });
  return parts.join(" AND ") || "TRUE";
}
class Query<T> implements PromiseLike<T> {
  private ordering: Data = {};
  private take: number | undefined;
  private projection = "";
  private plain = false;
  constructor(
    private table: string,
    private filter: Data,
    private one: boolean,
    private wrap: (row: Data) => any,
  ) {}
  sort(value: Data) {
    this.ordering = value;
    return this;
  }
  limit(value: number) {
    this.take = value;
    return this;
  }
  select(value: string) {
    this.projection = value;
    return this;
  }
  lean() {
    this.plain = true;
    return this;
  }
  async run() {
    const values: any[] = [];
    const condition = whereSQL(this.filter, values);
    const sort = Object.entries(this.ordering)
      .map(
        ([key, direction]) =>
          `${["version", "revision"].includes(key) ? `(${field(key)})::numeric` : field(key)} ${direction === -1 ? "DESC" : "ASC"}`,
      )
      .join(",");
    const limit = this.one ? 1 : this.take;
    const result = await query(
      `SELECT id, data FROM ${this.table} WHERE ${condition}${sort ? ` ORDER BY ${sort}` : ""}${limit !== undefined ? ` LIMIT ${Math.max(0, Math.floor(limit))}` : ""}`,
      values,
    );
    const rows = result.rows.map((row) => {
      let data = { ...row.data, _id: row.id };
      if (this.projection)
        data = Object.fromEntries(
          ["_id", ...this.projection.split(/\s+/)]
            .filter((k) => !k.startsWith("-"))
            .map((k) => [k, data[k]]),
        );
      return this.plain ? data : this.wrap(data);
    });
    return (this.one ? rows[0] || null : rows) as T;
  }
  then<TResult1 = T, TResult2 = never>(
    resolve?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(resolve, reject);
  }
}
/** PostgreSQL repository. One JSONB table per entity, indexed in the committed SQL migration.
 * Filters compile to parameterized SQL; writes and revisions share real SQL transactions.
 */
export function repository(table: string, defaults: Data = {}) {
  identifier(table);
  const wrap = (data: Data): any => {
    const record = { ...data };
    Object.defineProperties(record, {
      toJSON: {
        value: () => {
          const { _id, ...rest } = record;
          return { ...rest, id: _id };
        },
      },
      save: {
        value: async (_options?: unknown) => {
          const version = record.version ?? 0;
          const { _id, ...body } = record;
          body.updatedAt = new Date().toISOString();
          body.version = version + 1;
          const result = await query(
            `UPDATE ${table} SET data=$1::jsonb WHERE id=$2 AND (data->>'version')::int=$3 RETURNING id`,
            [JSON.stringify(body), _id, version],
          );
          if (!result.rows.length)
            throw Object.assign(
              new Error(
                "This changed in another tab. Refresh before trying again.",
              ),
              { status: 409 },
            );
          Object.assign(record, body);
          return record;
        },
      },
    });
    return record;
  };
  const find = (filter: Data = {}) =>
    new Query<Data[]>(table, filter, false, wrap);
  const findOne = (filter: Data = {}) =>
    new Query<Data | null>(table, filter, true, wrap);
  const createOne = async (input: Data) => {
    const {
      _id = randomBytes(12).toString("hex"),
      id: _unused,
      ...body
    } = input;
    const now = new Date().toISOString();
    const data = {
      ...structuredClone(defaults),
      version: 0,
      createdAt: now,
      updatedAt: now,
      ...body,
    };
    await query(`INSERT INTO ${table}(id,data) VALUES ($1,$2::jsonb)`, [
      _id,
      JSON.stringify(data),
    ]);
    return wrap({ ...data, _id });
  };
  const update = async (
    filter: Data,
    input: Data,
    options: Data = {},
    one = false,
  ): Promise<{
    value: any;
    matchedCount: number;
    modifiedCount?: number;
    upsertedCount?: number;
  }> => {
    const values: any[] = [];
    const condition = whereSQL(filter, values);
    const changes =
      input.$set ||
      (Object.keys(input).some((k) => k.startsWith("$")) ? {} : input);
    values.push(
      JSON.stringify({ ...changes, updatedAt: new Date().toISOString() }),
    );
    let expression = `data || $${values.length}::jsonb`;
    for (const [key, amount] of Object.entries(input.$inc || {})) {
      identifier(key);
      values.push(amount);
      expression = `jsonb_set(${expression}, '{${key}}', to_jsonb(COALESCE((data->>'${key}')::int,0) + $${values.length}::int))`;
    }
    for (const key of Object.keys(input.$unset || {})) {
      values.push(identifier(key));
      expression = `(${expression} - $${values.length}::text)`;
    }
    if (options.upsert) {
      // Serialize competing upserts by logical key; unique indexes are the final guard.
      return transaction(async () => {
        await query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `${table}:${JSON.stringify(filter)}`,
        ]);
        const existing = await findOne(filter);
        if (!existing) {
          const inserted = await createOne({
            ...filter,
            ...input.$setOnInsert,
            ...changes,
          });
          return { value: inserted, matchedCount: 0, upsertedCount: 1 };
        }
        const result = await update(filter, input, {}, one);
        return result;
      });
    }
    const result = await query(
      `UPDATE ${table} SET data=${expression} WHERE ${one ? `id IN (SELECT id FROM ${table} WHERE ${condition} LIMIT 1)` : condition} RETURNING id,data`,
      values,
    );
    return {
      value: result.rows[0]
        ? wrap({ ...result.rows[0].data, _id: result.rows[0].id })
        : null,
      matchedCount: result.rows.length,
      modifiedCount: result.rows.length,
    };
  };
  const remove = async (filter: Data, one: boolean) => {
    const values: any[] = [];
    const condition = whereSQL(filter, values);
    const result = await query(
      `DELETE FROM ${table} WHERE ${one ? `id IN (SELECT id FROM ${table} WHERE ${condition} LIMIT 1)` : condition} RETURNING id`,
      values,
    );
    return { deletedCount: result.rows.length };
  };
  return {
    find,
    findOne,
    findById: (id: unknown) => findOne({ _id: String(id) }),
    exists: async (filter: Data) => Boolean(await findOne(filter).lean()),
    countDocuments: async (filter: Data = {}) => {
      const values: any[] = [];
      const result = await query(
        `SELECT count(*)::int AS count FROM ${table} WHERE ${whereSQL(filter, values)}`,
        values,
      );
      return result.rows[0].count as number;
    },
    create: async (input: Data | Data[], _options?: unknown): Promise<any> =>
      Array.isArray(input)
        ? Promise.all(input.map(createOne))
        : createOne(input),
    updateOne: (filter: Data, input: Data, options: Data = {}) =>
      update(filter, input, options, true),
    updateMany: (filter: Data, input: Data, options: Data = {}) =>
      update(filter, input, options),
    findOneAndUpdate: async (filter: Data, input: Data, options: Data = {}) =>
      (await update(filter, input, options, true)).value,
    deleteOne: (filter: Data, _options?: unknown) => remove(filter, true),
    deleteMany: (filter: Data, _options?: unknown) => remove(filter, false),
  };
}
