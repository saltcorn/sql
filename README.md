# sql

Actions and views based on SQL

### SQLView

Use this view to create HTML code views of the results of arbitrary SQL queries

1. Create a view of this type.
2. Set output type = Table or JSON to begin with
3. Start by creating your SQL query with no qualifiers (which will come from the URL query state)
4. When you are happy with the SQL query, switch to output type = HTML
5. Create your HTML view, use `{{ rows }}` to access rows. For instance if your query is an aggregation with a single row result (e.g. `SELECT COUNT(*) FROM...`), access this with `{{ rows[0].count }}`, for example `<h2>{{ rows[0].count }}</h2>`. You can also loop, e.g. `{{# for(const row of rows) { }}`
6. When you are happy with both you are SQL and HTML code, Think about whether you need any parameters from the state. List these comma-separated, in order and use in the SQL code as `$1`, `$2` etc. Example SQL code: `select * from _sc_config where key = $1;`
