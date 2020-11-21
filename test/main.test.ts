import { expect, test } from '@oclif/test';
import fs from 'fs';
const { readdirSync, readFileSync, rmdirSync } = fs;
import path from 'path';

import cmd = require('../src');

// -----

// All returned paths are relative to the provided path.
function find_files(base_dir_qfn: string): string[] {
   const qfns = [ ];
   const todo = [ '.' ];
   while (todo.length) {
      const rel_dir_qfn = todo.pop() as string;
      const dir_qfn = path.join(base_dir_qfn, rel_dir_qfn);
      for (const de of readdirSync(dir_qfn, { withFileTypes: true })) {
         const qfn = path.join(rel_dir_qfn, de.name);
         if (de.isDirectory()) {
            todo.push(qfn);
         } else {
            qfns.push(qfn);
         }
      }
   }

   return qfns;
}

const line_ending_re = /\r?\n/g;

// We want native line endings, but the reference file might not have native line endings.
// We want a terminating line ending, even when one isn't found in the expected file.
function to_native_line_endings(s: string): string {
   if (!s.length)
      return s;

   if (s.slice(-1) !== '\n')
      s += '\n';

   if (process.platform === 'win32')
      s = s.replace(line_ending_re, '\r\n');
   else
      s = s.replace(line_ending_re, '\n');

   return s;
}

// -----

const expected_dir_qfn  = path.join(__dirname, 'main/expected');
const resulting_dir_qfn = path.join(__dirname, 'main/out');
const test_file_qfn     = path.join(__dirname, 'main/TS_Save_000.json');

const expected_qfns = find_files(expected_dir_qfn);
const expected_qfn_set = new Set(expected_qfns);

rmdirSync(resulting_dir_qfn, { recursive: true });

describe('Script and XML Extraction',
   function() {
      const run_cmd =
         test
            .stdout()
            .do(() => cmd.run([ '-a', '-o', resulting_dir_qfn, test_file_qfn ]));

      run_cmd
         .it('Empty Output', ctx => {
            expect(ctx.stdout).to.equal('');
         });

      const with_dirs =
         run_cmd
            .add('resulting_qfns', () => find_files(resulting_dir_qfn))
            .add('resulting_qfn_set', ({ resulting_qfns }) => new Set(resulting_qfns));

      for (const expected_qfn of expected_qfns) {
         with_dirs
            .it('File ' + expected_qfn, ctx => {
               expect(ctx.resulting_qfn_set.has(expected_qfn)).to.be.equal(true);

               const exepected = to_native_line_endings(readFileSync(path.join(expected_dir_qfn, expected_qfn), 'utf8'));
               const result = readFileSync(path.join(resulting_dir_qfn, expected_qfn), 'utf8');
               expect(result).to.be.equal(exepected);
            });
      }

      with_dirs
         .it('No extra files', ctx => {
            const extra = [ ];
            for (const resulting_qfn of ctx.resulting_qfns) {
               if (!expected_qfn_set.has(resulting_qfn))
                  extra.push(resulting_qfn);
            }

            const extra_str = extra.join( process.platform === 'win32' ? ';' : ':' );
            expect(extra_str).to.be.equal('');
         });
   },
);
