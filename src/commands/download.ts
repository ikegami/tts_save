import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import got from 'got';
import { Command, flags } from '@oclif/command';
import path from 'path';

import { JsonValue, JsonDict, is_json_array, is_json_dict } from '../Json';
import { padz, remove_ext, writeTextFileSync, get_tts_dir } from '../Utils';
import { LinkedResourceType, is_linked_resource_type } from '../LinkedExtractor';


// ================================================================================
// Types

type Job = {
   id:   number,
   url:  string,
   type: LinkedResourceType,
   fn:   string,
};

type JobResult = {
   fn: string,
};


// ================================================================================
// Constants

const cache_subdir_by_type: Record<LinkedResourceType, string> = {
   asset_bundle: 'Assetbundles',
   audio:        'Audio',
   image:        'Images',
   model:        'Models',
   pdf:          'PDF',
};


// ================================================================================
// Private utilities.

// ----------------------------------------

const cache_key_filter_re = /[^a-zA-Z0-9]/g;

function get_cache_key(url: string): string {
   return url.replace(cache_key_filter_re, '');
}


// ----------------------------------------

const determine_ext_dispatch: Record<LinkedResourceType, Function> = {
   asset_bundle: (_buf: Buffer) => '.unity3d',
   model:        (_buf: Buffer) => '.obj',
   pdf:          (_buf: Buffer) => '.pdf',

   audio: (buf: Buffer) => {
      if (buf.length >= 16 && buf.readUInt32BE(0) === 0x52494646 && buf.readUInt32BE(8) === 0x57415645)
         return '.wav';

      if (buf.length >= 2 && buf[0] === 0xFF) {
         const byte1 = buf[1];
         if (byte1 === 0xFB || byte1 === 0xF3 || byte1 === 0xF2)
            return '.mp3';
      }

      return '.WAV';
   },

   image: (buf: Buffer) => {
      if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504E47 && buf.readUInt32BE(4) === 0x0D0A1A0A)
         return '.png';

      if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF)
         return '.jpg';

      return '.PNG';
   },
};


function determine_ext(buf: Buffer, type: LinkedResourceType): string {
   return determine_ext_dispatch[type](buf);
}


// ================================================================================

class BadFormatError extends Error {
   constructor() {
      super('Unrecognized format of resource file.');
   }
}


// ================================================================================

class DownloadCommand extends Command {
   static description = 'Download resources referenced by a Tabletop Simulator save file';

   static flags = {
      help:   flags.help({ char: 'h' }),

      output: flags.string({ char: 'o', default: '.', description: 'Output path.' }),
      force:  flags.boolean({ char: 'f', description: 'Don\'t use the cache.' }),
      quiet:  flags.boolean({ char: 'q', description: 'Don\'t emit informational messages.' }),
   };


   out_dir_qfn      = '.';
   resource_dir_qfn = '';
   cache_dir_qfn    = '';
   opt_force        = false;
   opt_quiet        = false;


   console_log(msg: string): void {
      if (!this.opt_quiet)
         console.log(msg);
   }


   cache_listings: Record<string, Record<string, string>> = { };

   get_cache_entry(job: Readonly<Job>): string|undefined {
      try {
         const cache_subdir_fn = cache_subdir_by_type[job.type];
         const cache_subdir_qfn = path.join(this.cache_dir_qfn, cache_subdir_fn);

         if (!(job.type in this.cache_listings)) {
            const listing: Record<string, string> = { };
            this.cache_listings[job.type] = listing;
            for (const fn of readdirSync(cache_subdir_qfn)) {
               listing[remove_ext(fn)] = path.join(cache_subdir_fn, fn);
            }
         }

         const listing = this.cache_listings[job.type];
         const cache_key = get_cache_key(job.url);
         return listing[cache_key];
      } catch {
         return undefined;
      }
   }


   async download_resource(job: Readonly<Job>): Promise<JobResult> {
      let buf;
      const cache_entry = this.get_cache_entry(job);
      if (cache_entry === undefined || this.opt_force) {
         this.console_log(`Downloading ${ job.url } as ${ job.fn }${ cache_entry === undefined ? '' : ' (forced)' }...`);
         const response = await got(job.url, {
            responseType: 'buffer',
         });

         buf = response.body;
      } else {
         this.console_log(`Fetching ${ job.url } from cache as ${ job.fn }...`);
         buf = readFileSync(path.join(this.cache_dir_qfn, cache_entry));
      }

      const ext = determine_ext(buf, job.type);
      const fn = job.fn + ext;
      const qfn = path.join(this.resource_dir_qfn, fn);
      writeFileSync(qfn, buf);

      return {
         fn: fn,
      };
   }


   async download_resources(): Promise<void> {
      const linked_resources_qfn = path.join(this.out_dir_qfn, 'linked_resources.json');
      const json = readFileSync(linked_resources_qfn, 'utf8');
      const data: JsonValue = JSON.parse(json);
      if (!is_json_dict(data))
         throw new BadFormatError();

      const resources = data.resources;
      if (!is_json_array(resources))
         throw new BadFormatError();

      const todo: Job[] = [ ];
      const order = String(resources.length - 1).length;
      const counts: Record<string, number> = { };
      let i = -1;
      for (const resource of resources) {
         ++i;

         if (!is_json_dict(resource) || typeof resource.url !== 'string' || !is_linked_resource_type(resource.type)) {
            console.error('Skipping bad entry ' + i);
            continue;
         }

         const type = resource.type;
         const num = type in counts ? counts[type] : 0;
         counts[type] = num + 1;

         todo.push({
            id:   i,
            url:  resource.url,
            type: type,
            fn:   type + padz(num, order),
         });
      }

      mkdirSync(this.resource_dir_qfn, { recursive: true });

      for (const job of todo) {
         try {
            const result = await this.download_resource(job);   // eslint-disable-line no-await-in-loop
            ( resources[job.id] as JsonDict ).fn = result.fn;
            const json = JSON.stringify(data, undefined, 3);
            writeTextFileSync(linked_resources_qfn, json);
         } catch {
            console.error(`Failure downloading/saving ${ job.url } as ${ job.fn }.`);
         }
      }
   }


   async run(): Promise<void> {
      const { flags } = this.parse(DownloadCommand);

      if (flags.output === '')
         flags.output = '.';

      this.out_dir_qfn      = flags.output;
      this.resource_dir_qfn = path.join(this.out_dir_qfn, 'resources');
      this.cache_dir_qfn    = path.join(get_tts_dir(), 'Mods');
      this.opt_force        = flags.force;
      this.opt_quiet        = flags.quiet;

      await this.download_resources();
   }
}


// ================================================================================

export = DownloadCommand;
