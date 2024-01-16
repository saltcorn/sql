const db = require("@saltcorn/data/db");
const { eval_expression } = require("@saltcorn/data/models/expression");
const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
const { getState } = require("@saltcorn/data/db/state");

const { Parser } = require("node-sql-parser");
const parser = new Parser();

const configuration_workflow = () =>
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
              },
            ],
          });
        },
      },
      {
        name: "columns",
        form: async (context) => {
          const theForm = new Form({
            fields: [
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
                ],
              }),
            ],
          });
          return theForm;
        },
      },
    ],
  });

const runQuery = async (cfg, where) => {
  const is_sqlite = db.isSQLite;
  const opt = {
    database: is_sqlite ? "SQLite" : "PostgreSQL",
  };
  const { tableList, ast } = parser.parse(cfg?.sql, opt);
  //console.log(ast[0].where);
  //console.log(tableList);

  const colNames = new Set((cfg?.columns || []).map((c) => c.name));

  let phIndex = 1;
  const phValues = [];
  for (const k of Object.keys(where)) {
    if (!colNames.has(k)) continue;
    const newClause = {
      type: "binary_expr",
      operator: "=",
      left: { type: "column_ref", table: null, column: db.sqlsanitize(k) },
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

  const client = is_sqlite ? db : await db.getClient();
  await client.query(`BEGIN;`);
  if (!is_sqlite) {
    await client.query(`SET LOCAL search_path TO "${db.getTenantSchema()}";`);
    await client.query(`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;`);
  }
  const qres = await client.query(parser.sqlify(ast, opt), phValues);

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
