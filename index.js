const db = require("@saltcorn/data/db");
const Form = require("@saltcorn/data/models/form");
const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
const Workflow = require("@saltcorn/data/models/workflow");
const { eval_expression } = require("@saltcorn/data/models/expression");
const {
  text,
  div,
  h5,
  style,
  a,
  script,
  pre,
  domReady,
  i,
  text_attr,
} = require("@saltcorn/markup/tags");
const { mkTable } = require("@saltcorn/markup");
const { readState } = require("@saltcorn/data/plugin-helper");

const Handlebars = require("handlebars");

const configuration_workflow = () =>
  new Workflow({
    steps: [
      {
        name: "views",
        form: async (context) => {
          return new Form({
            fields: [
              {
                name: "sql",
                label: "SQL",
                input_type: "code",
                attributes: { mode: "text/x-sql" },
              },
              {
                name: "state_parameters",
                label: "State parameters",
                sublabel:
                  "Comma separated list of state variables from URL querystring to use as SQL query parameters",
                type: "String",
              },
              {
                name: "output_type",
                label: "Output type",
                type: "String",
                required: true,
                attributes: { options: ["Table", "JSON", "HTML"] },
              },
              {
                name: "html_code",
                label: "HTML Code",
                input_type: "code",
                attributes: { mode: "text/html" },
                showIf: { output_type: "HTML" },
              },
              {
                input_type: "section_header",
                label: " ",
                sublabel: div(
                  "Use handlebars to access query result in the <code>rows</code> variable. Example: <code>{{#each rows}}&lt;h1&gt;{{this.name}}&lt;/h1&gt;{{/each}}</code>"
                ),
                showIf: { row_count: "Many" },
              },
            ],
          });
        },
      },
    ],
  });

const get_state_fields = () => [];

const run = async (
  table_id,
  viewname,
  { sql, output_type, state_parameters, html_code },
  state,
  extraArgs
) => {
  const is_sqlite = db.isSQLite;

  const phValues = [];
  (state_parameters || "").split(",").forEach((sp0) => {
    const sp = sp0.trim();
    if (typeof state[sp] === "undefined") phValues.push(null);
    else phValues.push(state[sp]);
  });

  const client = is_sqlite ? db : await db.getClient();
  await client.query(`BEGIN;`);
  if (!is_sqlite) {
    await client.query(`SET LOCAL search_path TO "${db.getTenantSchema()}";`);
    await client.query(`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;`);
  }
  const qres = await client.query(sql, phValues);

  await client.query(`ROLLBACK`);

  if (!is_sqlite) client.release(true);
  switch (output_type) {
    case "HTML":
      const template = Handlebars.compile(html_code || "");
      return template({ rows: qres.rows });

    case "JSON":
      return `<pre>${JSON.stringify(qres.rows, null, 2)}</pre>`;

    default: //Table
      return mkTable(
        qres.fields.map((field) => ({ label: field.name, key: field.name })),
        qres.rows
      );
  }
};

module.exports = {
  sc_plugin_api_version: 1,
  plugin_name: "sql",
  viewtemplates: [
    {
      name: "SQLView",
      display_state_form: false,
      tableless: true,
      get_state_fields,
      configuration_workflow,
      run,
    },
  ],
};
