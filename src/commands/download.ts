import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import got from 'got';
import { Command, flags } from '@oclif/command';
import path from 'path';

import { JsonValue, JsonDict, is_json_array, is_json_dict } from '../Json';
import { padz, writeTextFileSync } from '../Utils';
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

class BadFormatError extends Error {
   constructor() {
      super('Unrecognized format of resource file.');
   }
}


// ================================================================================

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

class DownloadCommand extends Command {
   static description = 'Download resources referenced by a Tabletop Simulator save file';

   static flags = {
      help:   flags.help({ char: 'h' }),

      output: flags.string({ char: 'o', default: '.', description: 'Output path.' }),
   };


   out_dir_qfn      = '';
   resource_dir_qfn = '';


   async download_resource(job: Job): Promise<JobResult> {
      const response = await got(job.url, {
         responseType: 'buffer',
      });

      const buf = response.body;

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

      this.resource_dir_qfn = path.join(this.out_dir_qfn, 'resources');
      mkdirSync(this.resource_dir_qfn, { recursive: true });

      for (const job of todo) {
         try {
            console.log(`Downloading ${ job.url } as ${ job.fn }...`);
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

      this.out_dir_qfn = flags.output;

      await this.download_resources();
   }
}


// ================================================================================

export = DownloadCommand;
