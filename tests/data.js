const sqlusers = {
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
};

module.exports = { sqlusers };
