import { customType } from "drizzle-orm/pg-core";

export const ltree = customType<{ data: string }>({
  dataType() {
    return "ltree";
  },
});

export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});
