export const is_array = Array.isArray;

export function is_object(x: any): x is object {
   return x instanceof Object;
}


type ObjectWithProp<O extends object, P extends string> =
   P extends keyof O ? O : O & { [K in P]: any };

export function has_prop<O extends object, P extends string>(obj: O, prop: P): obj is ObjectWithProp<O, P> {
   return prop in obj;
}
