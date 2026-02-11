// servers/db-types.ts
var { DatabaseSync } = await import("node:sqlite");
var LIST_LIMIT_MIN = 1;
var LIST_LIMIT_MAX = 200;
var INTERACTION_OFFSET_MIN = 0;
var QUERY_MAX_LENGTH = 500;
var SEARCH_EVAL_DEFAULT_LIMIT = 5;
function ok(text) {
  return { content: [{ type: "text", text }] };
}
function fail(message) {
  return {
    content: [{ type: "text", text: message }],
    isError: true
  };
}
export {
  DatabaseSync,
  INTERACTION_OFFSET_MIN,
  LIST_LIMIT_MAX,
  LIST_LIMIT_MIN,
  QUERY_MAX_LENGTH,
  SEARCH_EVAL_DEFAULT_LIMIT,
  fail,
  ok
};
