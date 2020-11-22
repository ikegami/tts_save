import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import luabundle from 'luabundle';
import { Module as LuaModule } from 'luabundle';
import NoBundleMetadataError from 'luabundle/errors/NoBundleMetadataError';
import { Command, flags } from '@oclif/command';
import os from 'os';
import path from 'path';
const { dirname } = path;
import { Readable } from 'stream';

import {
   JsonValue, JsonArray, JsonDict,
   is_json_dict, is_json_array,
} from './types';


const invalid_xml_re = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
const chars_to_escape_xml_re = /[\t\n\r"&'<>]/;
const char_escapes_xml: Readonly<Record<string, string>> = {
   '\t': '&#x9;',
   '\n': '&#xA;',
   '\r': '&#xD;',
   '<':  '&lt;',
   '>':  '&gt;',
   '&':  '&amp;',
   '"':  '&quot;',
   "'":  '&#x27;',
};

function text_to_xml_attr(text: string): string {
   if (invalid_xml_re.test(text))
      throw 'String not supported by XML';  // eslint-disable-line no-throw-literal

   return text.replace(chars_to_escape_xml_re, _ => char_escapes_xml[_]);
}


const clean_str_for_path_re = /[\u0000-\u001F"*./:<>?\\|]]/g;  // This is still very permissive.
const module_path_sep_re = /[./\\]/;
const absolute_include_path_re = /^![/\\]/;
const include_path_sep_re = /[/\\]/;
const xml_ext_re = /\.xml$/i;

function clean_str_for_path(s: string): string {
   return s.replace(clean_str_for_path_re, ' ').trimEnd();
}

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


const cr_re = /\r/g;

function normalize_line_endings(s: string): string {
   return s.replace(cr_re, '');
}


const lf_re = /\n/g;

function to_native_line_endings(s: string): string {
   s = normalize_line_endings(s);
   if (process.platform === 'win32')
      s = s.replace(lf_re, '\r\n');

   return s;
}


const opt_trailing_lf_re = /\n?$/;

function ensure_trailing_lf(s: string): string {
   if (!s.length)
      return s;

   return s.replace(opt_trailing_lf_re, '\n');
}


const extra_trailing_lf_re = /\n+$/;

function remove_extra_trailing_lf(s: string): string {
   return s.replace(extra_trailing_lf_re, '\n');
}


function chomp(s: string): string {
   if (s.slice(-1) === '\n')
      s = s.slice(0, -1);

   return s;
}


async function readStream(stream: Readable): Promise<Buffer> {
   const chunks = [ ];
   for await (const chunk of stream)
      chunks.push(chunk);

   return Buffer.concat(chunks);
}


async function readTextFromStdin(): Promise<string> {
   if (process.platform === 'win32')
      return ( await readStream(process.stdin) ).toString('utf8');
   else
      return readFileSync(process.stdin.fd, 'utf8');
}


function writeTextFileSync(qfn: string, text: string): void {
   writeFileSync(qfn, to_native_line_endings(ensure_trailing_lf(text)), 'utf8');
}


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
   /
      ( (?: ^ [^\S\n]+ )? )
      (
         <!-- [^\S\n]+ include [^\S\n]+
         ( (?!--)\S (?: (?:(?!--)[^\n])* (?!--)\S )? )
         [^\S\n]+ -->
      )
      \n
      (.*?)
      \2
   /msg;
*/

const xml_include_re = /((?:^[^\S\n]+)?)(<!--[^\S\n]+include[^\S\n]+((?!--)\S(?:(?:(?!--)[^\n])*(?!--)\S)?)[^\S\n]+-->)\n(.*?)\2/msg;

class ExtractCommand extends Command {
   static description = 'Extract the components from a Tabletop Simulator save file';

   static flags = {
      help:     flags.help({ char: 'h' }),
      version:  flags.version({ char: 'v' }),

      output:   flags.string({ char: 'o', default: '.', description: 'Output path of the root (entry point) module.' }),

      all:      flags.boolean({ char: 'a', description: 'Extract everything, and unbundle included/required files.' }),
      scripts:  flags.boolean({ char: 's', description: 'Extract scripts.' }),
      xml:      flags.boolean({ char: 'x', description: 'Extract XML.' }),
      notes:    flags.boolean({ char: 'n', description: 'Extract Notebook entries.' }),
      unbundle: flags.boolean({ char: 'u', description: 'Unbundle included/required files.' }),
   };

   static args = [
      {
         name: 'save_file',
         required: false,
         description: 'Path of TTS save file (.json). May be omitted to read from stdin instead.',
      },
   ];


   out_dir_qfn         = '';
   opt_extract_scripts = false;
   opt_extract_xml     = false;
   opt_extract_notes   = false;
   opt_unbundle        = false;


   unbundle_script_includes(lib_data: Record<string, string>, dir_qfn: string, script: string): string {
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

            lib_data[qfn] = this.unbundle_script_includes(lib_data, dirname(qfn), included_script);

            return include;
         },
      );
   }


   unbundle_script(lib_data: Record<string, string>, script: string): string {
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
            lib_data[base_qfn + '.ttslua'] = module.content;
         }
      }

      return this.unbundle_script_includes(lib_data, '.', script);
   }


   _unbundle_xml(lib_data: Record<string, string>, dir_qfn: string, xml: string): string {
      return remove_extra_trailing_lf(xml.replace(xml_include_re,
         (match, prefix, include, include_path, included_xml) => {
            let qfn = sanitize_xml_include_path(include_path);
            if (qfn === undefined)
               return match;

            include = `<Include src="${ text_to_xml_attr(include_path) }"/>`;

            qfn = dir_qfn + '/' + qfn;

            const prefix_re = new RegExp('^' + prefix, 'mg');
            included_xml = included_xml.replace(prefix_re, '');

            lib_data[qfn] = this._unbundle_xml(lib_data, dirname(qfn), included_xml);

            return prefix + include;
         },
      ));
   }


   unbundle_xml(lib_data: Record<string, string>, xml: string): string {
      return this._unbundle_xml(lib_data, '.', xml);
   }


   extract_scripts_from_mod(obj_data: Record<string, string>, lib_data: Record<string, string>, mod: Readonly<JsonDict>): void {
      let script = typeof mod.LuaScript === 'string' ? mod.LuaScript : undefined;
      let xml    = typeof mod.XmlUI     === 'string' ? mod.XmlUI     : undefined;

      if (!script && !xml)
         return;

      if ( script ) script = normalize_line_endings(script);
      if ( xml    ) xml    = normalize_line_endings(xml);

      if (this.opt_unbundle) {
         if ( script ) script = this.unbundle_script( lib_data, script );
         if ( xml    ) xml    = this.unbundle_xml(    lib_data, xml    );
      }

      if ( script ) obj_data[ 'Global.-1.ttslua' ] = script;
      if ( xml    ) obj_data[ 'Global.-1.xml'    ] = xml;
   }


   extract_scripts_from_obj(obj_data: Record<string, string>, lib_data: Record<string, string>, guid_counts: Record<string, number>, obj: Readonly<JsonDict>): void {
      let script = typeof obj.LuaScript === 'string' ? obj.LuaScript : undefined;
      let xml    = typeof obj.XmlUI     === 'string' ? obj.XmlUI     : undefined;

      if (!script && !xml)
         return;

      let name;
      if (!name && typeof obj.Nickname === 'string')
         name = clean_str_for_path(obj.Nickname);
      if (!name && typeof obj.Name === 'string')
         name = clean_str_for_path(obj.Name);
      if (!name)
         return;

      let guid;
      if (!guid && typeof obj.GUID === 'string')
         guid = clean_str_for_path(obj.GUID);
      if (!guid)
         return;

      let base_fn = name + '.' + guid;
      if (guid in guid_counts)
         base_fn += '-' + ++guid_counts[guid];

      if ( script ) script = normalize_line_endings(script);
      if ( xml    ) xml    = normalize_line_endings(xml);

      if (this.opt_unbundle) {
         if ( script ) script = this.unbundle_script( lib_data, script );
         if ( xml    ) xml    = this.unbundle_xml(    lib_data, xml    );
      }

      if ( script ) obj_data[ base_fn + '.ttslua' ] = script;
      if ( xml    ) obj_data[ base_fn + '.xml'    ] = xml;
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


   extract_scripts(mod: Readonly<JsonDict>): void {
      const libs_dir_qfn = path.join(this.out_dir_qfn, 'lib');
      const objs_dir_qfn = path.join(this.out_dir_qfn, 'objs');
      const dir_exists: Record<string, boolean> = {
         [libs_dir_qfn]: existsSync(libs_dir_qfn),
         [objs_dir_qfn]: existsSync(objs_dir_qfn),
      };

      const obj_data: Record<string, string> = { };
      const lib_data: Record<string, string> = { };

      this.extract_scripts_from_mod(obj_data, lib_data, mod);

      if (is_json_array(mod.ObjectStates)) {
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

            this.extract_scripts_from_obj(obj_data, lib_data, guid_counts, obj);
         }
      }

      for (const fn of Object.keys(obj_data)) {
         const qfn = path.join(objs_dir_qfn, fn);
         const file = obj_data[fn];

         if (!dir_exists[objs_dir_qfn]) {
            mkdirSync(objs_dir_qfn);
            dir_exists[objs_dir_qfn] = true;
         }

         writeTextFileSync(qfn, file);
      }

      for (const partial_qfn of Object.keys(lib_data)) {
         const qfn = path.join(libs_dir_qfn, partial_qfn);
         const file = lib_data[partial_qfn];

         const dir_qfn = dirname(qfn);
         if (!dir_exists[dir_qfn]) {
            mkdirSync(dir_qfn, { recursive: true });
            dir_exists[dir_qfn] = true;
         }

         writeTextFileSync(qfn, file);
      }
   }


   extract_notes(mod: Readonly<JsonDict>): void {
      const tabs = mod.TabStates;
      if (!is_json_dict(tabs))
         return;

      const notebook_dir_qfn = path.join(this.out_dir_qfn, 'notes');
      let dir_exists = existsSync(notebook_dir_qfn);

      const keys = Object.keys(tabs);
      keys.sort(
         (a, b) => {
            const a_num = Number.parseInt(a, 10);
            const b_num = Number.parseInt(b, 10);
            if (!Number.isNaN(a_num) && !Number.isNaN(b_num)) {
               if      (a_num < b_num) return -1;
               else if (a_num > b_num) return +1;
               else                    return  0;
            }

            if      (!Number.isNaN(a_num)) return -1;
            else if (!Number.isNaN(b_num)) return +1;

            if      (a < b) return -1;
            else if (a > b) return +1;
            else            return  0;
         },
      );

      const counts: Record<string, number> = { };
      for (const key of keys) {
         const tab = tabs[key];
         if (!is_json_dict(tab))
            continue;

         if (typeof tab.body !== 'string')
            continue;

         const body = normalize_line_endings(tab.body);
         if (!body.length)
            continue;

         const title = typeof tab.title === 'string' ? normalize_line_endings(tab.title) : '';

         let base_fn = clean_str_for_path(title) || '[Untitled]';
         if (counts[base_fn]) {
            base_fn += '.' + ++counts[base_fn];
         } else {
            counts[base_fn] = 1;
         }

         if (!dir_exists) {
            mkdirSync(notebook_dir_qfn);
            dir_exists = true;
         }

         const file = 'Title: ' + title + '\n\n' + body;
         writeTextFileSync(path.join(notebook_dir_qfn, base_fn + '.txt'), file);
      }
   }


   async run(): Promise<void> {
      const { args, flags } = this.parse(ExtractCommand);

      let mod_json;
      if (!args.save_file) {
         mod_json = await readTextFromStdin();
      }
      else if (existsSync(args.save_file)) {
         mod_json = readFileSync(args.save_file, 'utf8');
      }
      else {
         const doc_dir_qfn =
            process.platform === 'win32'
               ? path.join(os.homedir(), 'Documents')
               : os.homedir();

         const tts_dir_qfn = path.join(doc_dir_qfn, 'My Games/Tabletop Simulator');
         const mod_fqfn = path.resolve(tts_dir_qfn, 'Saves', args.save_file);
         mod_json = readFileSync(mod_fqfn, 'utf8');
      }

      if (flags.output === '')
         flags.output = '.';

      this.out_dir_qfn         = flags.output;
      this.opt_extract_scripts = flags.all || flags.scripts;
      this.opt_extract_xml     = flags.all || flags.xml;
      this.opt_extract_notes   = flags.all || flags.notes;
      this.opt_unbundle        = flags.all || flags.unbundle;

      mkdirSync(this.out_dir_qfn, { recursive: true });

      const mod: JsonValue = JSON.parse(mod_json);
      if (is_json_dict(mod)) {
         if (this.opt_extract_scripts || this.opt_extract_xml)
            this.extract_scripts(mod);

         if (this.opt_extract_notes)
            this.extract_notes(mod);
      }
   }
}


export = ExtractCommand;
