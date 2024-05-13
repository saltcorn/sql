const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const View = require("@saltcorn/data/models/view");
const Trigger = require("@saltcorn/data/models/trigger");
const { findType } = require("@saltcorn/data/models/discovery");
const { save_menu_items } = require("@saltcorn/data/models/config");
const db = require("@saltcorn/data/db");
const Workflow = require("@saltcorn/data/models/workflow");
const { renderForm } = require("@saltcorn/markup");
const { div, script, domReady, pre, code } = require("@saltcorn/markup/tags");
const { getState } = require("@saltcorn/data/db/state");
const { mkTable } = require("@saltcorn/markup");

const get_state_fields = () => [];

const getForm = async (viewname) => {
  const fields = [
    {
      name: "sql",
      label: "SQL",
      input_type: "code",
      attributes: { mode: "text/x-sql" },
    },
  ];

  const form = new Form({
    action: `/view/${viewname}`,
    fields,
    submitLabel: "Run query",
  });
  return form;
};

const run = async (table_id, viewname, cfg, state, { res, req }) => {
  const form = await getForm(viewname);
  return renderForm(form, req.csrfToken());
};

const runPost = async (
  table_id,
  viewname,
  config,
  state,
  body,
  { req, res }
) => {
  const form = await getForm(viewname);
  form.validate(body);

  const is_sqlite = db.isSQLite;
  const client = is_sqlite ? db : await db.getClient();
  await client.query(`BEGIN;`);
  if (!is_sqlite) {
    await client.query(`SET LOCAL search_path TO "${db.getTenantSchema()}";`);
  }

  let sqlResult;
  try {
    const qres = await client.query(form.values.sql, []);

    await client.query(`ROLLBACK;`);

    if (!is_sqlite) client.release(true);
    sqlResult = mkTable(
      qres.fields.map((field) => ({ label: field.name, key: field.name })),
      qres.rows
    );
  } catch (error) {
    sqlResult = error.message;
  }

  res.sendWrap("SQL Terminal", [renderForm(form, req.csrfToken()), sqlResult]);
};

module.exports = {
  name: "SQL Terminal",
  display_state_form: false,
  tableless: true,
  singleton: true,
  get_state_fields,
  run,
  runPost,
};
