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
    await Table.create("sqlusers", require("./data").sqlusers);
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
    const us = await table.getRows({}, { orderBy: "id" });
    expect(us.length).toBe(3);
    expect(us[0].id).toBe(1);

    const twous = await table.getRows({}, { limit: 2 });
    expect(twous.length).toBe(2);
    const twous1 = await table.getRows(
      {},
      { limit: 2, orderBy: "id", orderDesc: true },
    );
    expect(twous1.length).toBe(2);
    expect(twous1[0].id).toBe(3);

    const admins = await table.getRows({ role_id: 1 });
    expect(admins.length).toBe(1);
    expect(admins[0].email).toBe("admin@foo.com");
    const admin = await table.getRow({ role_id: 1 });
    expect(admin.email).toBe("admin@foo.com");
  });
});
