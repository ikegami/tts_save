export const is_array = Array.isArray;

export function is_object(x: any): x is object {
   return x instanceof Object;
}


type ObjectWithProp<O extends object, P extends string> =
   P extends keyof O ? O : O & { [K in P]: any };

export function has_prop<O extends object, P extends string>(obj: O, prop: P): obj is ObjectWithProp<O, P> {
   return prop in obj;
}


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
