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
   ObjDataRow, TabDataRow,
   LinkedResourceType, LinkedResourceData,
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


const valid_guid_re = /^[0-9a-fA-F]{6}$/;

function is_valid_guid(s: string): boolean {
   return valid_guid_re.test(s);
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
      linked:   flags.boolean({ char: 'l', description: 'Save list of linked resources.' }),
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
   opt_extract_linked  = false;
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


   extract_scripts_from_mod_or_obj(obj_data: ObjDataRow[], lib_data: Record<string, string>, name: string, guid: string, mod_or_obj: Readonly<JsonDict>): void {
      let script = typeof mod_or_obj.LuaScript === 'string' ? mod_or_obj.LuaScript : undefined;
      let xml    = typeof mod_or_obj.XmlUI     === 'string' ? mod_or_obj.XmlUI     : undefined;

      if (!script && !xml)
         return;

      if ( script ) script = normalize_line_endings(script);
      if ( xml    ) xml    = normalize_line_endings(xml);

      if (this.opt_unbundle) {
         if ( script ) script = this.unbundle_script( lib_data, script );
         if ( xml    ) xml    = this.unbundle_xml(    lib_data, xml    );
      }

      obj_data.push({ name: name, guid: guid, index: 0, script: script, xml: xml });
   }


   extract_scripts_from_mod(obj_data: ObjDataRow[], lib_data: Record<string, string>, mod: Readonly<JsonDict>): void {
      this.extract_scripts_from_mod_or_obj(obj_data, lib_data, 'Global', '-1', mod);
   }


   extract_scripts_from_obj(obj_data: ObjDataRow[], lib_data: Record<string, string>, guid_counts: Record<string, number>, obj: Readonly<JsonDict>): void {
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

      this.extract_scripts_from_mod_or_obj(obj_data, lib_data, name, guid, obj);
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

      const obj_data: ObjDataRow[] = [ ];
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

      if (obj_data.length) {
         if (!dir_exists[objs_dir_qfn]) {
            mkdirSync(objs_dir_qfn);
            dir_exists[objs_dir_qfn] = true;
         }

         const counts: Record<string, number> = { };
         for (const obj of obj_data) {
            // eslint-disable-next-line no-multi-assign
            obj.index = counts[obj.guid] = ( counts[obj.guid] || 0 ) + 1;
         }

         for (const obj of obj_data) {
            const base_fn = obj.name + '.' + obj.guid + ( counts[obj.guid] > 1 ? '-' + obj.index : '' );
            if ( obj.script ) writeTextFileSync( path.join( objs_dir_qfn, base_fn + '.ttslua' ), obj.script );
            if ( obj.xml    ) writeTextFileSync( path.join( objs_dir_qfn, base_fn + '.xml'    ), obj.xml    );
         }
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


   add_linked_resource(resources_lkup: Record<string, LinkedResourceData>, url: Readonly<JsonValue>, type: Readonly<LinkedResourceType>): void {
      if (typeof url === 'string' && url !== '' && !( url in resources_lkup )) {
         resources_lkup[url] = {
            url:  url,
            type: type,
         };
      }
   }


   extract_linked_from_mod(resources_lkup: Record<string, LinkedResourceData>, mod: Readonly<JsonDict>): void {
      this.add_linked_resource(resources_lkup, mod.TableURL, LinkedResourceType.IMAGE);
      this.add_linked_resource(resources_lkup, mod.SkyURL,   LinkedResourceType.IMAGE);

      if (is_json_dict(mod.Lighting)) {
         // Might be more limited than other images.
         this.add_linked_resource(resources_lkup, mod.Lighting.LutURL, LinkedResourceType.IMAGE);
      }

      if (is_json_dict(mod.MusicPlayer)) {
         const mp = mod.MusicPlayer;
         this.add_linked_resource(resources_lkup, mp.CurrentAudioURL, LinkedResourceType.AUDIO);

         if (is_json_array(mp.AudioLibrary)) {
            for (const rec of mp.AudioLibrary) {
               if (is_json_dict(rec)) {
                  this.add_linked_resource(resources_lkup, rec.Item1, LinkedResourceType.AUDIO);
               }
            }
         }
      }

      if (is_json_array(mod.CustomUIAssets)) {
         for (const rec of mod.CustomUIAssets) {
            if (is_json_dict(rec)) {
               this.add_linked_resource(resources_lkup, rec.URL, LinkedResourceType.IMAGE);
            }
         }
      }
   }


   extract_linked_from_obj(resources_lkup: Record<string, LinkedResourceData>, obj: Readonly<JsonDict>): void {
      /*
         Card                       CustomDeck
         CardCustom                 CustomDeck
         Custom_Assetbundle         CustomAssetbundle
         Custom_Board               CustomImage
         Custom_Dice                CustomImage
         Custom_Model               CustomMesh
         Custom_PDF                 CustomPDF
         Custom_Tile                CustomImage
         Custom_Tile_Stack          CustomImage
         Custom_Token               CustomImage
         Custom_Token_Stack         CustomImage
         Deck                       CustomDeck
         DeckCustom                 CustomDeck
         Figurine_Custom            CustomImage
      */

      if (is_json_dict(obj.CustomImage)) {
         const custom = obj.CustomImage;
         this.add_linked_resource(resources_lkup, custom.ImageURL,          LinkedResourceType.IMAGE);
         this.add_linked_resource(resources_lkup, custom.ImageSecondaryURL, LinkedResourceType.IMAGE);
      }

      if (is_json_dict(obj.CustomDeck)) {
         const custom = obj.CustomDeck;
         if (is_json_dict(custom)) {
            for (const deck_id of Object.keys(custom)) {
               const deck = custom[deck_id];
               if (is_json_dict(deck)) {
                  this.add_linked_resource(resources_lkup, deck.FaceURL, LinkedResourceType.IMAGE);
                  this.add_linked_resource(resources_lkup, deck.BackURL, LinkedResourceType.IMAGE);
               }
            }
         }
      }

      if (is_json_dict(obj.CustomAssetbundle)) {
         const custom = obj.CustomAssetbundle;
         this.add_linked_resource(resources_lkup, custom.AssetbundleURL,          LinkedResourceType.ASSET_BUNDLE);
         this.add_linked_resource(resources_lkup, custom.AssetbundleSecondaryURL, LinkedResourceType.ASSET_BUNDLE);
      }

      if (is_json_dict(obj.CustomMesh)) {
         const custom = obj.CustomMesh;
         this.add_linked_resource(resources_lkup, custom.MeshURL,     LinkedResourceType.MODEL);
         this.add_linked_resource(resources_lkup, custom.DiffuseURL,  LinkedResourceType.IMAGE);
         this.add_linked_resource(resources_lkup, custom.NormalURL,   LinkedResourceType.IMAGE);
         this.add_linked_resource(resources_lkup, custom.ColliderURL, LinkedResourceType.MODEL);
      }

      if (is_json_dict(obj.CustomPDF)) {
         const custom = obj.CustomPDF;
         this.add_linked_resource(resources_lkup, custom.PDFUrl, LinkedResourceType.PDF);
      }
   }


   extract_linked(mod: Readonly<JsonDict>): void {
      const linked_resources_qfn = path.join(this.out_dir_qfn, 'linked_resources.json');

      const resources_lkup: Record<string, LinkedResourceData> = { };

      this.extract_linked_from_mod(resources_lkup, mod);

      if (is_json_array(mod.ObjectStates)) {
         const objs: JsonValue[] = [ ...mod.ObjectStates ];
         while (objs.length) {
            const obj = objs.pop() as JsonValue;
            if (!is_json_dict(obj))
               continue;

            if (is_json_array(obj.ContainedObjects))
               objs.push(...obj.ContainedObjects);
            if (is_json_dict(obj.States))
               objs.push(...Object.values(obj.States));

            this.extract_linked_from_obj(resources_lkup, obj);
         }
      }

      const resources = Object.values(resources_lkup);

      // The test to check if the JSON is correct is pretty naïve.
      // Hopefully, sorting the results will be sufficient to
      // allow a binary compare.
      resources.sort((a, b) => {
         if (a.url < b.url) return -1;
         if (a.url > b.url) return +1;
         return 0;
      });

      const data = { resources: resources };
      const json = JSON.stringify(data, undefined, 3);
      writeTextFileSync(linked_resources_qfn, json);
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

      const tab_data: TabDataRow[] = [ ];
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
         const base_fn = clean_str_for_path(title) || '[Untitled]';

         tab_data.push({
            base_fn: base_fn,
            index:   0,
            title:   title,
            body:    body,
         });
      }

      if (!tab_data.length)
         return;

      if (!dir_exists) {
         mkdirSync(notebook_dir_qfn);
         dir_exists = true;
      }

      const counts: Record<string, number> = { };
      for (const tab of tab_data) {
         // eslint-disable-next-line no-multi-assign
         tab.index = counts[tab.base_fn] = ( counts[tab.base_fn] || 0 ) + 1;
      }

      for (const tab of tab_data) {
         const fn = tab.base_fn + ( counts[tab.base_fn] > 1 ? '.' + tab.index : '' ) + '.txt';
         const file = 'Title: ' + tab.title + '\n\n' + tab.body;
         writeTextFileSync(path.join(notebook_dir_qfn, fn), file);
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
      this.opt_extract_linked  = flags.all || flags.linked;
      this.opt_extract_notes   = flags.all || flags.notes;
      this.opt_unbundle        = flags.all || flags.unbundle;

      mkdirSync(this.out_dir_qfn, { recursive: true });

      const mod: JsonValue = JSON.parse(mod_json);
      if (is_json_dict(mod)) {
         if (this.opt_extract_scripts || this.opt_extract_xml)
            this.extract_scripts(mod);
         if (this.opt_extract_linked)
            this.extract_linked(mod);
         if (this.opt_extract_notes)
            this.extract_notes(mod);
      }
   }
}


export = ExtractCommand;
