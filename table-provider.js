const db = require("@saltcorn/data/db");
const { eval_expression } = require("@saltcorn/data/models/expression");
const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");

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
                fields: [{}],
              }),
            ],
          });
          return theForm;
        },
      },
    ],
  });

const runQuery = async (cfg) => {
  const is_sqlite = db.isSQLite;

  const client = is_sqlite ? db : await db.getClient();
  await client.query(`BEGIN;`);
  if (!is_sqlite) {
    await client.query(`SET LOCAL search_path TO "${db.getTenantSchema()}";`);
    await client.query(`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;`);
  }
  const qres = await client.query(cfg?.sql, []);

  await client.query(`ROLLBACK;`);

  if (!is_sqlite) client.release(true);
  return qres;
};

module.exports = {
  "SQL query": {
    configuration_workflow,
    fields: [],
    get_table: (cfg) => {
      return {
        getRows: async () => {
          const qres = await runQuery();
          return qres.rows;
        },
      };
    },
  },
};
