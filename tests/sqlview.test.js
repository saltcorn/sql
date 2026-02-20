const { getState } = require("@saltcorn/data/db/state");
const View = require("@saltcorn/data/models/view");
const Table = require("@saltcorn/data/models/table");
const Plugin = require("@saltcorn/data/models/plugin");

const { mockReqRes } = require("@saltcorn/data/tests/mocks");
const { afterAll, beforeAll, describe, it, expect } = require("@jest/globals");
const db = require("@saltcorn/data/db");

afterAll(require("@saltcorn/data/db").close);
beforeAll(async () => {
  await require("@saltcorn/data/db/reset_schema")();
  await require("@saltcorn/data/db/fixtures")();

  getState().registerPlugin("base", require("@saltcorn/data/base-plugin"));
  getState().registerPlugin("@saltcorn/sql", require(".."));
  //db.set_sql_logging(true);
});

describe("sql view", () => {
  it("runs", async () => {
    const view = new View({
      name: "BookSQLView",
      description: "",
      viewtemplate: "SQLView",
      configuration: {
        sql: "select id, author, pages from books order by id;",
        html_code: `<script>const boooks = {{ JSON.stringify(rows) }}<script>`,
        output_type: "HTML",
        state_parameters: "",
      },
      min_role: 1,
      table: null,
    });
    const result = await view.run({}, mockReqRes);

    expect(result).toBe(
      '<script>const boooks = [{"id":1,"author":"Herman Melville","pages":967},{"id":2,"author":"Leo Tolstoy","pages":728}]<script>',
    );
  });
  it("run with state params", async () => {
    const view = new View({
      name: "BookSQLView",
      description: "",
      viewtemplate: "SQLView",
      configuration: {
        sql: "select id, author, pages from books where id = $1",
        html_code: `<script>const boooks = {{ JSON.stringify(rows) }}<script>`,
        output_type: "HTML",
        state_parameters: "id",
      },
      min_role: 1,
      table: null,
    });
    const result = await view.run({id:2}, mockReqRes);

    expect(result).toBe(
      '<script>const boooks = [{"id":2,"author":"Leo Tolstoy","pages":728}]<script>',
    );
  });
   it("runs with handlebars", async () => {
    const view = new View({
      name: "BookSQLView",
      description: "",
      viewtemplate: "SQLView",
      configuration: {
        sql: "select id, author, pages from books order by id;",
        html_code: `{{#each rows}}<h1>{{this.author}}</h1>{{/each}}`,
        output_type: "HTML with handlebars",
        state_parameters: "",
      },
      min_role: 1,
      table: null,
    });
    const result = await view.run({}, mockReqRes);

    expect(result).toBe(
      '<h1>Herman Melville</h1><h1>Leo Tolstoy</h1>',
    );
  });
});
