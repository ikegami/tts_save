import luabundle from 'luabundle';
import { Module as LuaModule } from 'luabundle';
import NoBundleMetadataError from 'luabundle/errors/NoBundleMetadataError';
import path from 'path';
const { dirname } = path;

import {
   text_to_xml_attr,
   clean_str_for_path,
   normalize_line_endings,
   remove_extra_trailing_lf,
   chomp,
} from './Utils';

import { JsonValue, JsonArray, JsonDict, is_json_dict, is_json_array } from './Json';


// ================================================================================
// Types

export interface ObjDataRow {
   name:    string,
   guid:    string,
   index:   number,
   script?: string,
   xml?:    string,
}


// ================================================================================
// Private utilities.

// ----------------------------------------

const module_path_sep_re = /[./\\]/;
const absolute_include_path_re = /^![/\\]/;
const include_path_sep_re = /[/\\]/;
const xml_ext_re = /\.xml$/i;

function sanitize_module_path(module_path: string): string {
   return (
      module_path
         .split(module_path_sep_re)
         .map( _ => clean_str_for_path(_) )
         .filter( _ => _.length )
         .join('/')
   );
}

function sanitize_script_include_path(include_path: string): string|undefined {
   // foo is a relative path (foo).
   // /foo is a relative path (foo).
   // !/foo is an absolute path (/foo).
   // /!/foo is a relative path (!/foo).

   let rel_path = include_path.replace(absolute_include_path_re, '');
   const is_absolute = rel_path !== include_path;

   rel_path =
      rel_path
         .split(include_path_sep_re)
         .map( _ => clean_str_for_path(_) )
         .filter( _ => _.length )
         .join('/');

   if (!rel_path.length)
      return undefined;

   return is_absolute ? '/' + rel_path : rel_path;
}

function sanitize_xml_include_path(include_path: string): string|undefined {
   // foo.xml and /foo.xml are both relative paths.

   include_path =
      include_path
         .replace(xml_ext_re, '')
         .split(include_path_sep_re)
         .map( _ => clean_str_for_path(_) )
         .filter( _ => _.length )
         .join('/');

   if (!include_path.length)
      return undefined;

   return include_path + '.xml';
}


// ----------------------------------------

const valid_guid_re = /^[0-9a-fA-F]{6}$/;

function is_valid_guid(s: string): boolean {
   return valid_guid_re.test(s);
}


// ----------------------------------------

/*
   const script_include_re = /
      ^ ----
      (
         \s*
         \#include
         [^\S\n]+
         ( \S(?:[^\n]*\S)? )
         [^\S\n]*
      )
      \n
      (.*?)
      ^ ---- \1 $
   /xmsg;
*/

const script_include_re = /^----(\s*#include[^\S\n]+(\S(?:[^\n]*\S)?)[^\S\n]*)\n(.*?)^----\1$/msg;
const is_wrapped_script_re = /^<(.*)>$/s;
const wrapped_script_re = /^do\n(.*)\nend$/s;


/*
   const xml_include_re = /
      ( (?: ^ [^\S\n]+ )? )
      (
         <!-- [^\S\n]+ include [^\S\n]+
         ( (?!--)\S (?: (?:(?!--)[^\n])* (?!--)\S )? )
         [^\S\n]+ -->
      )
      \n
      (.*?)
      \2
   /xmsg;
*/

const xml_include_re = /((?:^[^\S\n]+)?)(<!--[^\S\n]+include[^\S\n]+((?!--)\S(?:(?:(?!--)[^\n])*(?!--)\S)?)[^\S\n]+-->)\n(.*?)\2/msg;


// ================================================================================
// Public class.

export class ScriptExtractor {
   _unbundle: boolean;
   _obj_data: ObjDataRow[];
   _lib_data: Record<string, string>;

   constructor(unbundle: boolean) {
      this._unbundle = unbundle;
      this._obj_data = [ ];
      this._lib_data = { };
   }


   // ========================================
   // Public accessors.

   get obj_data(): ObjDataRow[] {
      return this._obj_data;
   }

   get lib_data(): Record<string, string> {
      return this._lib_data;
   }


   // ========================================
   // Private instance methods.

   unbundle_script_includes(dir_qfn: string, script: string): string {
      return script.replace(script_include_re,
         (match, include, include_path, included_script) => {
            included_script = chomp(included_script);

            const include_path_match = include_path.match(is_wrapped_script_re);
            if (include_path_match) {
               include_path = include_path_match[1];
               included_script = included_script.replace(wrapped_script_re, '$1');
            }

            let qfn = sanitize_script_include_path(include_path);
            if (qfn === undefined)
               return match;

            if (qfn[0] === '/') {
               qfn = qfn.slice(1) + '.ttslua';
            } else {
               qfn = dir_qfn + '/' + qfn + '.ttslua';
            }

            this._lib_data[qfn] = this.unbundle_script_includes(dirname(qfn), included_script);

            return include;
         },
      );
   }


   unbundle_script(script: string): string {
      let unbundled;
      try {
         unbundled = luabundle.unbundleString(script);
      } catch (e) {
         if (!(e instanceof NoBundleMetadataError)) {
            throw e;
         }
      }

      if (unbundled) {
         const root_name = unbundled.metadata.rootModuleName;
         script = unbundled.modules[root_name].content;
         delete unbundled.modules[root_name];

         for (const module of Object.values<LuaModule>(unbundled.modules)) {
            const base_qfn = sanitize_module_path(module.name);
            if (!base_qfn.length)
               continue;

            // Modules can't use #include.
            this._lib_data[base_qfn + '.ttslua'] = module.content;
         }
      }

      return this.unbundle_script_includes('.', script);
   }


   _unbundle_xml(dir_qfn: string, xml: string): string {
      return remove_extra_trailing_lf(xml.replace(xml_include_re,
         (match, prefix, include, include_path, included_xml) => {
            let qfn = sanitize_xml_include_path(include_path);
            if (qfn === undefined)
               return match;

            include = `<Include src="${ text_to_xml_attr(include_path) }"/>`;

            qfn = dir_qfn + '/' + qfn;

            const prefix_re = new RegExp('^' + prefix, 'mg');
            included_xml = included_xml.replace(prefix_re, '');

            this._lib_data[qfn] = this._unbundle_xml(dirname(qfn), included_xml);

            return prefix + include;
         },
      ));
   }


   unbundle_xml(xml: string): string {
      return this._unbundle_xml('.', xml);
   }


   extract_scripts_from_mod_or_obj(name: string, guid: string, mod_or_obj: Readonly<JsonDict>): void {
      let script = typeof mod_or_obj.LuaScript === 'string' ? mod_or_obj.LuaScript : undefined;
      let xml    = typeof mod_or_obj.XmlUI     === 'string' ? mod_or_obj.XmlUI     : undefined;

      if (!script && !xml)
         return;

      if ( script ) script = normalize_line_endings(script);
      if ( xml    ) xml    = normalize_line_endings(xml);

      if (this._unbundle) {
         if ( script ) script = this.unbundle_script(script);
         if ( xml    ) xml    = this.unbundle_xml(xml);
      }

      this._obj_data.push({ name: name, guid: guid, index: 0, script: script, xml: xml });
   }


   extract_scripts_from_mod(mod: Readonly<JsonDict>): void {
      this.extract_scripts_from_mod_or_obj('Global', '-1', mod);
   }


   extract_scripts_from_obj(guid_counts: Record<string, number>, obj: Readonly<JsonDict>): void {
      let name;
      if (!name && typeof obj.Nickname === 'string')
         name = clean_str_for_path(obj.Nickname);
      if (!name && typeof obj.Name === 'string')
         name = clean_str_for_path(obj.Name);
      if (!name)
         return;

      const guid = obj.GUID;
      if (typeof guid !== 'string' || !is_valid_guid(guid))
         return;

      this.extract_scripts_from_mod_or_obj(name, guid, obj);
   }


   find_guids(guid_counts: Record<string, number>, objs: Readonly<JsonArray>): void {
      for (const obj of objs) {
         if (!is_json_dict(obj))
            continue;

         if (typeof obj.GUID !== 'string')
            continue;

         const guid = clean_str_for_path(obj.GUID);
         if (guid === '')
            continue;

         guid_counts[guid] = ( guid_counts[guid] || 0 ) + 1;

         if (is_json_array(obj.ContainedObjects))
            this.find_guids(guid_counts, obj.ContainedObjects);
         if (is_json_dict(obj.States))
            this.find_guids(guid_counts, Object.values(obj.States));
      }
   }


   // ========================================
   // Public instance methods.

   extract_scripts(mod: Readonly<JsonDict>): void {
      this.extract_scripts_from_mod(mod);

      if (!is_json_array(mod.ObjectStates))
         return;

      const guid_counts: Record<string, number> = { };
      this.find_guids(guid_counts, mod.ObjectStates);
      for (const guid of Object.keys(guid_counts)) {
         if (guid_counts[guid] > 1)
            guid_counts[guid] = 0;
         else
            delete guid_counts[guid];
      }

      const objs: JsonValue[] = [ ...mod.ObjectStates ];
      while (objs.length) {
         const obj = objs.pop() as JsonValue;
         if (!is_json_dict(obj))
            continue;

         if (is_json_array(obj.ContainedObjects))
            objs.push(...obj.ContainedObjects);
         if (is_json_dict(obj.States))
            objs.push(...Object.values(obj.States));

         this.extract_scripts_from_obj(guid_counts, obj);
      }
   }
}
