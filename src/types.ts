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
// Hack to create a recursive type.
// export type JsonDict = Record<string, JsonValue>;
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface JsonDict extends Record<string, JsonValue> { }

export function is_json_dict(x: JsonValue): x is JsonDict {
   return x instanceof Object && !Array.isArray(x);
}

export function is_json_array(x: JsonValue): x is JsonArray {
   return Array.isArray(x);
}


export interface ModuleWithScripts {
   LuaScript: string,
   XmlUI:     string,
}

export function is_module_with_scripts(x: any): x is ModuleWithScripts {
   if (typeof x !== 'object')
      return false;

   if ('LuaScript' in x && typeof x.LuaScript !== 'string')
      return false;

   if ('XmlUI' in x && typeof x.XmlUI !== 'string')
      return false;

   return true;
}


export interface GameObjectWithScripts {
   GUID:      string,
   Name:      string,
   Nickname:  string,
   LuaScript: string,
   XmlUI:     string,
}

export function is_game_object_with_scripts(x: any): x is GameObjectWithScripts {
   if (typeof x !== 'object')
      return false;

   if (!('GUID' in x) || typeof x.GUID !== 'string')
      return false;

   if (!('Name' in x) || typeof x.Name !== 'string')
      return false;

   if (!('Nickname' in x) || typeof x.Nickname !== 'string')
      return false;

   if ('LuaScript' in x && typeof x.LuaScript !== 'string')
      return false;

   if ('XmlUI' in x && typeof x.XmlUI !== 'string')
      return false;

   return true;
}


export interface NotebookTab {
   body:  string,
   title: string,
}

export function is_notebook_tab(x: any): x is NotebookTab {
   if (typeof x !== 'object')
      return false;

   if (typeof x.body !== 'string')
      return false;

   if (typeof x.title !== 'string')
      return false;

   return true;
}


export type Notebook = Record<string, NotebookTab>;

export function is_notebook(x: any): x is Notebook {
   if (typeof x !== 'object')
      return false;

   for (const key of Object.keys(x)) {
      if (typeof key !== 'string')
         return false;

      if (!is_notebook_tab(x[key]))
         return false;
   }

   return true;
}


export interface ModuleWithNotebook {
   TabStates: Notebook,
}

export function is_module_with_notebook(x: any): x is ModuleWithNotebook {
   if (typeof x !== 'object')
      return false;

   if (!('TabStates' in x) || !is_notebook(x.TabStates))
      return false;

   return true;
}
