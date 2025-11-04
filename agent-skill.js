const { div, pre, a } = require("@saltcorn/markup/tags");
const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const Table = require("@saltcorn/data/models/table");
const View = require("@saltcorn/data/models/view");
const Trigger = require("@saltcorn/data/models/trigger");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
const { getState } = require("@saltcorn/data/db/state");
const db = require("@saltcorn/data/db");
const { eval_expression } = require("@saltcorn/data/models/expression");
const { interpolate } = require("@saltcorn/data/utils");
const { features } = require("@saltcorn/data/db/state");

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
    if (this.mode === "Preload into system prompt") {
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
    } else {
      (this.toolargs || []).forEach((arg) => {
        phValues.push(row[arg.name]);
      });
    }
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
        attributes: {
          options: features.nested_fieldrepeats
            ? ["Preload into system prompt", "Tool"]
            : ["Preload into system prompt"],
        },
      },
      {
        name: "tool_name",
        label: "Tool name",
        type: "String",
        showIf: { mode: "Tool" },
        class: "validate-identifier",
      },
      {
        name: "tool_description",
        label: "Tool description",
        type: "String",
        showIf: { mode: "Tool" },
      },

      {
        name: "sql",
        label: "SQL",
        input_type: "code",
        attributes: { mode: "text/x-sql" },
        sublabel:
          "Refer to query parameters with <code>$1</code>, <code>$2</code> etc",
      },
      { input_type: "section_header", label: "Query parameters" },
      new FieldRepeat({
        name: "toolargs",
        showIf: { mode: "Tool" },
        fields: [
          {
            name: "name",
            label: "Name",
            type: "String",
          },
          {
            name: "description",
            label: "Description",
            type: "String",
          },
          {
            name: "argtype",
            label: "Type",
            type: "String",
            required: true,
            attributes: { options: ["string", "number", "integer", "boolean"] },
          },
          {
            name: "options",
            label: "Options",
            type: "String",
            sublabel: "Optional. Comma-separated list of values",
            showIf: { argtype: "string" },
          },
        ],
      }),
      {
        name: "query_parameters",
        label: "Query parameters",
        sublabel:
          "Comma separated list of variables to use as SQL query parameters. User variables can be used as <code>user.id</code> etc",
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
        name: "display_result",
        label: "Display result",
        type: "Bool",
        sublabel: "Show rows from the query in JSON format",
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

  provideTools = () => {
    if (this.mode === "Preload into system prompt") return null;
    let properties = {};
    (this.toolargs || []).forEach((arg) => {
      properties[arg.name] = {
        description: arg.description,
        type: arg.argtype,
      };
      if (arg.options && arg.argtype === "string")
        properties[arg.name].enum = arg.options.split(",").map((s) => s.trim());
    });
    return {
      type: "function",
      process: async (row, { req }) => {
        return await this.runQuery({ triggering_row: row });
      },
      /*renderToolCall({ phrase }, { req }) {
        return div({ class: "border border-primary p-2 m-2" }, phrase);
      },*/
      renderToolResponse: this.display_result
        ? async (response, { req }) => {
            return div({ class: "border border-success p-2 m-2" }, response);
          }
        : undefined,
      function: {
        name: this.tool_name,
        description: this.tool_description,
        parameters: {
          type: "object",
          required: (this.toolargs || []).map((a) => a.name),
          properties,
        },
      },
    };
  };
}

module.exports = SQLQuerySkill;
