import { existsSync, mkdirSync, readFileSync } from 'fs';
import { Command, flags } from '@oclif/command';
import os from 'os';
import path from 'path';
const { dirname } = path;

import { JsonValue, JsonDict, is_json_dict } from './Json';
import { readTextFromStdin, writeTextFileSync } from './Utils';
import { ScriptExtractor } from './ScriptExtractor';
import { LinkedExtractor } from './LinkedExtractor';
import { NotesExtractor  } from './NotesExtractor';


// ================================================================================

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


   extract_scripts(mod: Readonly<JsonDict>): void {
      const extractor = new ScriptExtractor(this.opt_unbundle);
      extractor.extract_scripts(mod);
      const obj_data = extractor.obj_data;
      const lib_data = extractor.lib_data;

      const libs_dir_qfn = path.join(this.out_dir_qfn, 'lib');
      const objs_dir_qfn = path.join(this.out_dir_qfn, 'objs');
      const dir_exists: Record<string, boolean> = {
         [libs_dir_qfn]: existsSync(libs_dir_qfn),
         [objs_dir_qfn]: existsSync(objs_dir_qfn),
      };

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


   extract_linked(mod: Readonly<JsonDict>): void {
      const extractor = new LinkedExtractor();
      extractor.extract_linked(mod);
      const resources = extractor.resources;

      const linked_resources_qfn = path.join(this.out_dir_qfn, 'linked_resources.json');

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
      const extractor = new NotesExtractor();
      extractor.extract_notes(mod);
      const tab_data = extractor.tab_data;

      const notebook_dir_qfn = path.join(this.out_dir_qfn, 'notes');
      mkdirSync(notebook_dir_qfn, { recursive: true });

      for (const tab of tab_data) {
         const file = 'Title: ' + tab.title + '\n\n' + tab.body;
         writeTextFileSync(path.join(notebook_dir_qfn, tab.fn), file);
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


// ================================================================================

export = ExtractCommand;
