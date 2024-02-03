const db = require("@saltcorn/data/db");
const { eval_expression } = require("@saltcorn/data/models/expression");
const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
const Field = require("@saltcorn/data/models/field");
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
                    attributes: { options: getState().type_names },
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

const runQuery = async (cfg, where) => {
  const sqlTmpl = cfg?.sql || "";
  const template = _.template(sqlTmpl || "", {
    evaluate: /\{\{#(.+?)\}\}/g,
    interpolate: /\{\{([^#].+?)\}\}/g,
  });

  const qctx = {};

  if (where.forUser) qctx.user = sqlEscapeObject(where.forUser);
  else qctx.user = null;

  const sql = template(qctx);

  const is_sqlite = db.isSQLite;
  const opt = {
    database: is_sqlite ? "SQLite" : "PostgreSQL",
  };

  const { ast } = parser.parse(sql, opt);

  const colNames = new Set((cfg?.columns || []).map((c) => c.name));

  let phIndex = 1;
  const phValues = [];
  for (const k of Object.keys(where)) {
    if (!colNames.has(k)) continue;
    const sqlCol = (ast[0].columns || []).find((c) => k === c.as);
    let left = {
      type: "column_ref",
      table: sqlCol?.expr?.table,
      column: db.sqlsanitize(k),
    };
    const newClause = {
      type: "binary_expr",
      operator: "=",
      left,
      right: { type: "number", value: "$" + phIndex },
    };
    phIndex += 1;
    phValues.push(where[k]);
    if (!ast[0].where) ast[0].where = newClause;
    else {
      ast[0].where = {
        type: "binary_expr",
        operator: "AND",
        left: ast[0].where,
        right: newClause,
      };
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
  } else if (where?.limit) {
    ast[0].limit = {
      seperator: "",
      value: [{ type: "number", value: where.limit }],
    };
  }

  const client = is_sqlite ? db : await db.getClient();
  await client.query(`BEGIN;`);
  if (!is_sqlite) {
    await client.query(`SET LOCAL search_path TO "${db.getTenantSchema()}";`);
    await client.query(`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;`);
  }

  const sqlQ = parser.sqlify(ast, opt);
  const qres = await client.query(sqlQ, phValues);
  qres.query = sqlQ;
  await client.query(`ROLLBACK;`);

  if (!is_sqlite) client.release(true);
  return qres;
};

module.exports = {
  "SQL query": {
    configuration_workflow,
    fields: (cfg) => cfg?.columns || [],
    get_table: (cfg) => {
      return {
        getRows: async (where) => {
          const qres = await runQuery(cfg, where);
          return qres.rows;
        },
      };
    },
  },
};
