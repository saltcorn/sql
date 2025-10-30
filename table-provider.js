const db = require("@saltcorn/data/db");
const { eval_expression } = require("@saltcorn/data/models/expression");
const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const { getState } = require("@saltcorn/data/db/state");
const SqlString = require("sqlstring");
const { Parser } = require("node-sql-parser");
const { mkTable } = require("@saltcorn/markup");
const { pre, code } = require("@saltcorn/markup/tags");
const parser = new Parser();
const _ = require("underscore");

const configuration_workflow = (req) =>
  new Workflow({
    steps: [
      {
        name: "query",
        form: async () => {
          return new Form({
            fields: [
              {
                name: "sql",
                label: "SQL",
                input_type: "code",
                attributes: { mode: "text/x-sql" },
                validator(sql) {
                  try {
                    const is_sqlite = db.isSQLite;
                    const opt = {
                      database: is_sqlite ? "SQLite" : "PostgreSQL",
                    };
                    const template = _.template(sql || "", {
                      evaluate: /\{\{#(.+?)\}\}/g,
                      interpolate: /\{\{([^#].+?)\}\}/g,
                    });
                    const sql1 = template({ user: req.user });

                    const pres = parser.parse(sql1, opt);
                    if (!Array.isArray(pres.ast))
                      return "Not terminated by semicolon?";
                  } catch (e) {
                    return e.message;
                  }
                },
              },
              {
                label: "Ignore where/order",
                sublabel:
                  "Always use this SQL directly without attempting to modify it",
                type: "Bool",
                name: "ignore_where",
              },
            ],
          });
        },
      },
      {
        name: "columns",
        form: async (context) => {
          const qres = await runQuery(context, { forUser: req.user });
          const tbl = mkTable(
            qres.fields.map((field) => ({
              label: field.name,
              key: field.name,
            })),
            qres.rows?.slice?.(0, 5)
          );
          const pkey_options = getState().type_names.filter(
            (tnm) => getState().types[tnm]?.primaryKey
          );
          const tables = await Table.find({});

          const fkey_opts = [
            "File",
            ...tables
              .filter((t) => !t.provider_name && !t.external)
              .map((t) => `Key to ${t.name}`),
          ];
          const theForm = new Form({
            blurb: pre(code(qres.query)) + tbl,
            fields: [
              {
                input_type: "section_header",
                label: "Column types",
              },
              new FieldRepeat({
                name: "columns",
                fields: [
                  {
                    name: "name",
                    label: "Name",
                    type: "String",
                    required: true,
                  },
                  {
                    name: "label",
                    label: "Label",
                    type: "String",
                    required: true,
                  },
                  {
                    name: "type",
                    label: "Type",
                    type: "String",
                    required: true,
                    attributes: {
                      options: getState().type_names.concat(fkey_opts || []),
                    },
                  },
                  {
                    name: "primary_key",
                    label: "Primary key",
                    type: "Bool",
                    //showIf: { type: pkey_options },
                  },
                ],
              }),
            ],
          });
          if (!context.columns || !context.columns.length) {
            if (!theForm.values) theForm.values = {};
            theForm.values.columns = qres.fields.map((f) => ({
              name: f.name,
              label: Field.nameToLabel(f.name),
              type: dataTypeIdToTypeGuess(f.dataTypeID),
            }));
          }
          return theForm;
        },
      },
    ],
  });

const dataTypeIdToTypeGuess = (typeid) => {
  switch (typeid) {
    case 23:
      return "Integer";
    case 25:
      return "String";
    case 1184:
      return "Date";
    case 16:
      return "Bool";
    case 701:
      return "Float";
    case 3802:
      return "JSON";
    default:
      return "String";
  }
};

const sqlEscapeObject = (o) => {
  if (typeof o !== "object" || o === null) return SqlString.escape(o);
  const r = {};
  Object.entries(o).forEach(([k, v]) => {
    if (typeof v === "object") r[k] = sqlEscapeObject(v);
    else r[k] = SqlString.escape(v);
  });
  return r;
};

const getSqlQuery = (sql, cfg, where, opts) => {
  const is_sqlite = db.isSQLite;
  const opt = {
    database: is_sqlite ? "SQLite" : "PostgreSQL",
  };
  let sqlQ;
  const phValues = [];
  if (cfg?.ignore_where) {
    sqlQ = sql;
  } else {
    const { ast } = parser.parse(sql, opt);
    /*console.log(
      JSON.stringify(
        parser.parse(
          `select * from "users" where "email" ILIKE concat('%',cast($1 as text),'%')`,
          opt
        ).ast,
        null,
        2
      )
    );*/
    const colNames = new Set((cfg?.columns || []).map((c) => c.name));
    let phIndex = 1;
    //console.log(ast[0].columns);
    for (const k of Object.keys(where)) {
      if (!colNames.has(k)) continue;
      const sqlCol =
        ast[0].columns == "*"
          ? {
              type: "expr",
              expr: { type: "column_ref", table: null, column: k },
              as: null,
            }
          : (ast[0].columns || []).find(
              (c) => k === c.as || (!c.as && k === c.expr?.column)
            );
      const sqlExprCol =
        ast[0].columns == "*"
          ? {
              type: "expr",
              expr: { type: "column_ref", table: null, column: k },
              as: null,
            }
          : (ast[0].columns || []).find((c) => c.expr?.as == k);
      const sqlAggrCol = (ast[0].columns || []).find(
        (c) =>
          c.expr?.type === "aggr_func" &&
          c.expr?.name?.toUpperCase() === k.toUpperCase()
      );

      let left = sqlExprCol
        ? { ...sqlExprCol.expr, as: null }
        : sqlAggrCol
        ? { ...sqlAggrCol.expr }
        : {
            type: "column_ref",
            table: sqlCol?.expr?.table,
            column: sqlCol?.expr?.column || db.sqlsanitize(k),
          };
      //console.log({ k, sqlCol, sqlExprCol });
      if (!sqlCol) {
        const starCol = (ast[0].columns || []).find(
          (c) => c.type === "star_ref"
        );
        if (starCol)
          left = {
            type: "column_ref",
            table: starCol?.expr?.table,
            column: db.sqlsanitize(k),
          };
      }
      const newClause = {
        type: "binary_expr",
        operator: where[k]?.ilike && !sqlAggrCol ? "ILIKE" : "=",
        left,
        right:
          where[k]?.ilike && !sqlAggrCol && true
            ? {
                type: "function",
                name: {
                  name: [
                    {
                      type: "default",
                      value: "concat",
                    },
                  ],
                },
                args: {
                  type: "expr_list",
                  value: [
                    {
                      type: "single_quote_string",
                      value: "%",
                    },
                    {
                      type: "cast",
                      keyword: "cast",
                      expr: { type: "number", value: "$" + phIndex },
                      symbol: "as",
                      target: [
                        {
                          dataType: "TEXT",
                        },
                      ],
                    },

                    {
                      type: "single_quote_string",
                      value: "%",
                    },
                  ],
                },
              }
            : { type: "number", value: "$" + phIndex },
      };
      phIndex += 1;
      phValues.push(where[k]?.ilike ? where[k]?.ilike : where[k]);
      if (!sqlAggrCol) {
        if (!ast[0].where) ast[0].where = newClause;
        else {
          ast[0].where = {
            type: "binary_expr",
            operator: "AND",
            left: ast[0].where,
            right: newClause,
          };
        }
      } else {
        if (!ast[0].having) ast[0].having = newClause;
        else {
          ast[0].having = {
            type: "binary_expr",
            operator: "AND",
            left: ast[0].having,
            right: newClause,
          };
        }
      }
    }
    if (where?.limit && where?.offset) {
      ast[0].limit = {
        seperator: "offset",
        value: [
          { type: "number", value: where.limit },
          { type: "number", value: where.offset },
        ],
      };
    } else if (opts?.limit && opts?.offset) {
      ast[0].limit = {
        seperator: "offset",
        value: [
          { type: "number", value: opts.limit },
          { type: "number", value: opts.offset },
        ],
      };
    } else if (where?.limit) {
      ast[0].limit = {
        seperator: "",
        value: [{ type: "number", value: where.limit }],
      };
    } else if (opts?.limit) {
      ast[0].limit = {
        seperator: "",
        value: [{ type: "number", value: opts.limit }],
      };
    }
    //console.log(ast[0]);
    //console.log(ast[0].orderby[[0]]);

    const orderBy = where?.orderBy || opts?.orderBy;
    const orderDesc = where?.orderDesc || opts?.orderDesc;

    if (orderBy) {
      if (typeof orderBy === "string")
        ast[0].orderby = [
          {
            expr: {
              type: "column_ref",
              table: null,
              column: db.sqlsanitize(orderBy),
            },
            type: orderDesc ? "DESC" : "ASC",
          },
        ];
      else if (orderBy.operator) {
        const { operator, field, target } = orderBy;
        const fieldCol = (cfg.columns || []).find((c) => c.name === field);
        const type = getState().types[fieldCol?.type];
        const op = type?.distance_operators[operator];
        if (op?.type === "SqlBinOp") {
          ast[0].orderby = [
            {
              expr: {
                type: "binary_expr",
                operator: op.name,
                left: {
                  type: "column_ref",
                  table: null,
                  column: db.sqlsanitize(field),
                },
                right: {
                  type: "number",
                  value: "$" + phIndex,
                },
              },
              type: orderDesc ? "DESC" : "ASC",
            },
          ];
          phIndex += 1;
          phValues.push(target);
        }
      }
    }
    sqlQ = parser.sqlify(ast, opt);
  }
  return { sqlQ, phValues };
};

const runQuery = async (cfg, where, opts) => {
  const sqlTmpl = cfg?.sql || "";
  const template = _.template(sqlTmpl || "", {
    evaluate: /\{\{#(.+?)\}\}/g,
    interpolate: /\{\{([^#].+?)\}\}/g,
  });

  const qctx = {};

  if (opts?.forUser) qctx.user = sqlEscapeObject(opts.forUser);
  else if (where?.forUser)
    qctx.user = sqlEscapeObject(where.forUser); //workaround legacy bug
  else qctx.user = null;

  const sql = template(qctx);
  const is_sqlite = db.isSQLite;

  const { sqlQ, phValues } = getSqlQuery(sql, cfg, where, opts);

  const client = is_sqlite ? db : await db.getClient();
  await client.query(`BEGIN;`);
  if (!is_sqlite) {
    await client.query(`SET LOCAL search_path TO "${db.getTenantSchema()}";`);
    await client.query(`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;`);
  }

  //console.trace({ sqlQ, phValues, opts });
  const qres = await client.query(sqlQ, phValues);
  qres.query = sqlQ;
  await client.query(`ROLLBACK;`);

  if (!is_sqlite) client.release(true);
  return qres;
};

const countRows = async (cfg, where, opts) => {
  const sqlTmpl = cfg?.sql || "";
  const template = _.template(sqlTmpl || "", {
    evaluate: /\{\{#(.+?)\}\}/g,
    interpolate: /\{\{([^#].+?)\}\}/g,
  });

  const qctx = {};

  if (opts?.forUser) qctx.user = sqlEscapeObject(opts.forUser);
  else if (where?.forUser)
    qctx.user = sqlEscapeObject(where.forUser); //workaround legacy bug
  else qctx.user = null;

  const sql = template(qctx);
  const is_sqlite = db.isSQLite;

  const { sqlQ, phValues } = getSqlQuery(sql, cfg, where, opts);

  const client = is_sqlite ? db : await db.getClient();
  await client.query(`BEGIN;`);
  if (!is_sqlite) {
    await client.query(`SET LOCAL search_path TO "${db.getTenantSchema()}";`);
    await client.query(`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;`);
  }

  //console.trace({ sqlQ, phValues, opts });
  const qres = await client.query(`select count(*) from (${sqlQ})`, phValues);
  qres.query = sqlQ;
  await client.query(`ROLLBACK;`);

  if (!is_sqlite) client.release(true);
  return qres.rows[0].count;
};

module.exports = {
  "SQL query": {
    configuration_workflow,
    fields: (cfg) => cfg?.columns || [],
    get_table: (cfg) => {
      return {
        getRows: async (where, opts) => {
          const qres = await runQuery(cfg, where, opts);
          return qres.rows;
        },
        countRows: async (where, opts) => {
          return await countRows(cfg, where, opts);
        },
      };
    },
  },
};
