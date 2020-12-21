export type JsonValue = null | string | number | boolean | JsonArray | JsonDict;
export type JsonArray = JsonValue[];
// The following definition is a hack to create a recursive type equivalent to the following:
// export type JsonDict = Record<string, JsonValue>;
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface JsonDict extends Record<string, JsonValue> { }

export function is_json_dict(x: JsonValue): x is JsonDict {
   return x instanceof Object && !Array.isArray(x);
}

export function is_json_array(x: JsonValue): x is JsonArray {
   return Array.isArray(x);
}
