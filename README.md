# sql

Actions and views based on SQL

### SQLView view

Use this view to create HTML code views of the results of arbitrary SQL queries

1. Create a view of this type.
2. Set output type = Table or JSON to begin with
3. Start by creating your SQL query with no qualifiers (which will come from the URL query state). The preview table should update as you type
4. When you are happy with the SQL query, switch to output type = HTML
5. Create your HTML code, use `{{ rows }}` to access rows. For instance if your query is an aggregation with a single row result (e.g. `SELECT COUNT(*) FROM...`), access this with `{{ rows[0].count }}`, for example `<h2>{{ rows[0].count }}</h2>`. You can also loop, e.g. `{{# for(const row of rows) { }}`
6. When you are happy with both you are SQL and HTML code, Think about whether you need any parameters from the state. List these comma-separated, in order and use in the SQL code as `$1`, `$2` etc. Example SQL code: `select * from _sc_config where key = $1;`

### run_sql_code action

This action allows you to run arbitrary SQL. You specify values from the row that needs to be included in the query using positional parameters `$1`, `$2` etc.

### SQL query table provider

This will give you a Saltcorn "virtual table" based on an SQL
query and specifying result fields (these will be guessed from the query
result, but you need to check and assign a primary key).

Normally you don't need to worry about the where clause when this is
filtered by one of the columns in a view. Your query will be parsed,
and the appropriate where clause will be inserted before the final query
is run.

There are some very specific cases in which you need to include information
about the user in the query in a way that cannot be done in the normal way by state filtering. In this case, you can use string interpolation to include information about the user. For instance:

```
... where baz in (select id from zubs where user_zub = {{ user.myzub }} ) ...
```

User row values used in this way are automatically escaped by the
[sqlstring](https://www.npmjs.com/package/sqlstring) to prevent SQL
injection.
