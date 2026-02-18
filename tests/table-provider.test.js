const { getState } = require("@saltcorn/data/db/state");
const View = require("@saltcorn/data/models/view");
const Table = require("@saltcorn/data/models/table");
const Plugin = require("@saltcorn/data/models/plugin");

const { mockReqRes } = require("@saltcorn/data/tests/mocks");
const { afterAll, beforeAll, describe, it, expect } = require("@jest/globals");

afterAll(require("@saltcorn/data/db").close);
beforeAll(async () => {
  await require("@saltcorn/data/db/reset_schema")();
  await require("@saltcorn/data/db/fixtures")();

  getState().registerPlugin("base", require("@saltcorn/data/base-plugin"));
  getState().registerPlugin("@saltcorn/sql", require(".."));
});

// run with:
//  saltcorn dev:plugin-test -d ~/sql/

//jest.setTimeout(30000);

describe("sql table provider", () => {
  it("creates table", async () => {
    await Table.create("sqlusers", {
      min_role_read: 1,
      min_role_write: 1,
      provider_name: "SQL query",
      provider_cfg: {
        sql: "select * from users;",
        columns: [
          {
            name: "id",
            type: "Integer",
            label: "id",
            primary_key: true,
          },
          {
            name: "email",
            type: "String",
            label: "email",
          },
          {
            name: "password",
            type: "String",
            label: "password",
          },
          {
            name: "role_id",
            type: "Integer",
            label: "role id",
          },
          {
            name: "reset_password_token",
            type: "String",
            label: "reset password token",
          },
          {
            name: "reset_password_expiry",
            type: "String",
            label: "reset password expiry",
          },
          {
            name: "language",
            type: "String",
            label: "language",
          },
          {
            name: "disabled",
            type: "Bool",
            label: "disabled",
          },
          {
            name: "api_token",
            type: "String",
            label: "api token",
          },
          {
            name: "_attributes",
            type: "JSON",
            label: " attributes",
          },
          {
            name: "verification_token",
            type: "String",
            label: "verification token",
          },
          {
            name: "verified_on",
            type: "String",
            label: "verified on",
          },
          {
            name: "last_mobile_login",
            type: "String",
            label: "last mobile login",
          },
        ],
        //ignore_where: true,
      },
      ownership_formula: null,
    });
    await getState().refresh_tables(false);
  });
  it("counts table", async () => {
    const table = Table.findOne("sqlusers");
    const nus = await table.countRows({});
    expect(nus).toBe(3);
    const nadmin = await table.countRows({ role_id: 1 });
    expect(nadmin).toBe(1);
  });
  it("gets rows from table", async () => {
    const table = Table.findOne("sqlusers");
    const us = await table.getRows({});
    expect(us.length).toBe(3);
    const admins = await table.getRows({ role_id: 1 });
    expect(admins.length).toBe(1);
    expect(admins[0].email).toBe("admin@foo.com")
    const admin = await table.getRow({ role_id: 1 });
    expect(admin.email).toBe("admin@foo.com")
  });
});
