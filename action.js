const db = require("@saltcorn/data/db");
const { eval_expression } = require("@saltcorn/data/models/expression");

module.exports = {
  run_sql_code: {
    namespace: "Code",
    configFields: ({ mode }) => [
      {
        name: "sql",
        label: "SQL",
        input_type: "code",
        attributes: { mode: "text/x-sql" },
        sublabel:
          "Refer to row parameters in the order below with <code>$1</code>, <code>$2</code> etc",
      },
      {
        name: "row_parameters",
        label: "Row parameters",
        sublabel:
          "Comma separated list of row variables to use as SQL query parameters. User variables can be used as <code>user.id</code> etc",
        type: "String",
      },
      {
        name: "read_only",
        label: "Read only",
        sublabel: "Run the SQL in a read-only transactions",
        type: "Bool",
      },

      ...(mode === "workflow"
        ? [
            {
              label: "Variable",
              name: "results_variable",
              class: "validate-identifier",
              sublabel: "Context variable to write to query results to",
              type: "String",
              required: true,
            },
          ]
        : []),
    ],
    run: async ({
      row,
      configuration: { sql, row_parameters, read_only, results_variable },
      user,
      mode,
    }) => {
      const is_sqlite = db.isSQLite;

      const phValues = [];
      (row_parameters || "")
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
        await client.query(
          `SET LOCAL search_path TO "${db.getTenantSchema()}";`
        );
        if (read_only)
          await client.query(
            `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;`
          );
      }
      const qres = await client.query(sql, phValues);

      await client.query(`COMMIT;`);

      if (!is_sqlite) client.release(true);
      if (mode === "workflow" && results_variable)
        return { [results_variable]: qres.rows };
      else return qres.rows;
    },
  },
};
