const {
  div,
  pre,
  a,
  script,
  table,
  tbody,
  thead,
  tr,
  th,
} = require("@saltcorn/markup/tags");
const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const Table = require("@saltcorn/data/models/table");
const View = require("@saltcorn/data/models/view");
const Trigger = require("@saltcorn/data/models/trigger");
const { getState } = require("@saltcorn/data/db/state");
const db = require("@saltcorn/data/db");
const { eval_expression } = require("@saltcorn/data/models/expression");
const { interpolate } = require("@saltcorn/data/utils");

//const { fieldProperties } = require("./helpers");

class SQLQuerySkill {
  static skill_name = "SQL query";

  get skill_label() {
    return "SQL Query";
  }

  constructor(cfg) {
    Object.assign(this, cfg);
  }

  async runQuery({ triggering_row, user }) {
    const row = triggering_row;
    const read_only = true;
    const is_sqlite = db.isSQLite;

    const phValues = [];
    (this.query_parameters || "")
      .split(",")
      .filter((s) => s)
      .forEach((sp0) => {
        const sp = sp0.trim();
        if (sp.startsWith("user.")) {
          phValues.push(eval_expression(sp, {}, user));
        } else if (typeof row[sp] === "undefined") phValues.push(null);
        else phValues.push(row[sp]);
      });

    const client = is_sqlite ? db : await db.getClient();
    await client.query(`BEGIN;`);
    if (!is_sqlite) {
      await client.query(`SET LOCAL search_path TO "${db.getTenantSchema()}";`);
      if (read_only)
        await client.query(
          `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;`
        );
    }
    const qres = await client.query(this.sql, phValues);

    await client.query(`COMMIT;`);

    if (!is_sqlite) client.release(true);

    if (this.row_format) {
      return qres.rows
        .map((r) => interpolate(this.row_format, r, user))
        .join("\n\n");
    }
    return JSON.stringify(qres.rows);
  }

  async systemPrompt({ triggering_row, user }) {
    if (this.mode === "Preload into system prompt") {
      const rows = await this.runQuery({ triggering_row, user });
      return `${this.add_sys_prompt}: ${rows}`;
    }
    return `${this.add_sys_prompt}`;
  }

  static async configFields() {
    return [
      {
        name: "mode",
        label: "Mode",
        type: "String",
        required: true,
        attributes: { options: ["Preload into system prompt", "Tool"] },
      },

      {
        name: "sql",
        label: "SQL",
        input_type: "code",
        attributes: {
          mode: "text/x-sql",
          onChange: "window.change_sql_code?.(event)",
        },
        sublabel: "Add arguments with <code>$1</code>, <code>$2</code> etc",
      },
      {
        input_type: "section_header",
        label: " ",
        sublabel:
          script(`function change_sql_code(e) {console.log(e.target.value)}`) +
          div(
            table(thead(tr(th("Name"), th("Description"), th("Type"))), tbody())
          ),
        showIf: { mode: "Tool" },
        attributes: { secondColHoriz: true },
      },
      {
        name: "query_parameters",
        label: "Query parameters",
        sublabel:
          "Comma separated list of variables to use as SQL query parameter values. User variables can be used as <code>user.id</code> etc",
        type: "String",
        showIf: { mode: "Preload into system prompt" },
      },
      {
        name: "add_sys_prompt",
        label: "Additional prompt",
        type: "String",
        fieldview: "textarea",
      },
      {
        name: "row_format",
        label: "Row format",
        type: "String",
        fieldview: "textarea",
        sublabel:
          "Format of text to send to LLM, use <code>{{ }}</code> to access row fields. If not set, rows will be sent as JSON",
      },
    ];
  }
}

module.exports = SQLQuerySkill;
