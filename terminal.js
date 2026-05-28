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
    additionalButtons: [
      {
        label: "Show current activity",
        onclick: "sql_terminal_show_activity(this)",
        class: "btn btn-outline-secondary",
        afterSave: true,
      },
    ],
  });
  return form;
};
const activityScript = script(`
  const sql_all_queries = {}
  
  function sql_terminal_show_activity() {   
      view_post("SQL Terminal", "get_activity", {}, render_table )
  }
  function arrayToHTMLTable(data) {
    if (!data || data.length === 0) return '<table></table>';

    const headers = Object.keys(data[0]);

    const headerRow = '<tr>' + headers.map(function(h) {
      return '<th>' + h + '</th>';
    }).join('') + '</tr>';

    const bodyRows = data.map(function(obj) {
      return '<tr>' + headers.map(function(h) {
        return '<td>' + (obj[h] != null ? obj[h] : '') + '</td>';
      }).join('') + '</tr>';
    }).join('');

    return '<table class="table">' + headerRow + bodyRows + '</table>';
  }
  function render_table(data) {
     const rows = data.rows
     const active_keys = new Set()
     for(const row of rows) {
        const key = row.query_start + row.query
        sql_all_queries[key] = row
        active_keys.add(key)
     }
     const past_queries = []
     Object.keys(sql_all_queries).forEach(k=>{
       if(!active_keys.has(k)) past_queries.push(sql_all_queries[k])
     })
     const linkout = '<a class="btn btn-primary" href="/view/SQL%20Terminal">Done</a>'
     const current_table = rows.length ? "<h5>Active queries</h5>"+arrayToHTMLTable(rows) : "<h5>Active queries</h5><p>No active queries</p>"
     const past_table = past_queries.length ? "<h5>Previous queries</h5>"+arrayToHTMLTable(past_queries)+"<i>Runtime is largest observed and not indicative of total duration</i><br>":""
     $('[data-sc-embed-viewname="SQL Terminal"]').html(current_table+past_table+linkout)
     setTimeout(sql_terminal_show_activity, 400)
  }
  `,
);

const run = async (table_id, viewname, cfg, state, { res, req }) => {
  const form = await getForm(viewname);
  return activityScript + renderForm(form, req.csrfToken());
};

const runPost = async (
  table_id,
  viewname,
  config,
  state,
  body,
  { req, res },
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

    await client.query(`COMMIT;`);

    if (!is_sqlite) client.release(true);
    sqlResult = mkTable(
      qres.fields.map((field) => ({ label: field.name, key: field.name })),
      qres.rows,
    );
  } catch (error) {
    sqlResult = error.message;
  }

  res.sendWrap("SQL Terminal", [
    activityScript,
    renderForm(form, req.csrfToken()),
    sqlResult,
  ]);
};

const get_activity = async (table_id, viewname, config, body, { req, res }) => {
  const { rows } = await db.query(`SELECT pid,
       state,
       wait_event,
       query_start::time,
       EXTRACT(epoch FROM now() - query_start) AS runtime,
       query
FROM pg_stat_activity
WHERE state = 'active' AND NOT query LIKE '%pg_stat_activity%'
ORDER BY runtime DESC;`);

  return { json: { rows } };
};

module.exports = {
  name: "SQL Terminal",
  display_state_form: false,
  tableless: true,
  singleton: true,
  get_state_fields,
  run,
  runPost,
  routes: { get_activity },
};
