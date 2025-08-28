const { div, pre, a } = require("@saltcorn/markup/tags");
const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const Table = require("@saltcorn/data/models/table");
const View = require("@saltcorn/data/models/view");
const Trigger = require("@saltcorn/data/models/trigger");
const { getState } = require("@saltcorn/data/db/state");
const db = require("@saltcorn/data/db");
//const { fieldProperties } = require("./helpers");

class SQLQuerySkill {
  static skill_name = "SQL query";

  get skill_label() {
    return "SQL Query";
  }

  constructor(cfg) {
    Object.assign(this, cfg);
  }

  systemPrompt() {
    const trigger = Trigger.findOne({ name: this.trigger_name });

    return `${this.trigger_name} tool: ${trigger.description}`;
  }

  static async configFields() {
    return [
      {
        name: "mode",
        label: "Mode",
        type: "String",
        required: true,
        attributes: { options: ["Tool", "Preload into system prompt"] },
      },
      {
        name: "sql",
        label: "SQL",
        input_type: "code",
        attributes: { mode: "text/x-sql" },
        sublabel:
          "Refer to row parameters in the order below with <code>$1</code>, <code>$2</code> etc",
      },
      {
        name: "query_parameters",
        label: "Query parameters",
        sublabel:
          "Comma separated list of variables to use as SQL query parameters. User variables can be used as <code>user.id</code> etc",
        type: "String",
      },
      {
        name: "add_sys_prompt",
        label: "Additional prompt",
        type: "String",
        fieldview: "textarea",
      },
    ];
  }

  provideTools() {
    let properties = {};

    const trigger = Trigger.findOne({ name: this.trigger_name });
    if (trigger.table_id) {
      const table = Table.findOne({ id: trigger.table_id });

      table.fields
        .filter((f) => !f.primary_key)
        .forEach((field) => {
          properties[field.name] = {
            description: field.label + " " + field.description || "",
            ...fieldProperties(field),
          };
        });
    }
    return {
      type: "function",
      process: async (row, { req }) => {
        const result = await trigger.runWithoutRow({ user: req?.user, row });
        return result;
      },
      /*renderToolCall({ phrase }, { req }) {
        return div({ class: "border border-primary p-2 m-2" }, phrase);
      },*/
      renderToolResponse: async (response, { req }) => {
        return div({ class: "border border-success p-2 m-2" }, response);
      },
      function: {
        name: trigger.name,
        description: trigger.description,
        parameters: {
          type: "object",
          //required: ["action_javascript_code", "action_name"],
          properties,
        },
      },
    };
  }
}

module.exports = SQLQuerySkill;
