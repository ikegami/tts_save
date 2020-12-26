import { expect, test } from '@oclif/test';
import fs from 'fs';
const { readdirSync, readFileSync, rmdirSync } = fs;
import path from 'path';


// ================================================================================

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


// ================================================================================

const line_ending_re = /\r?\n/g;

// We want native line endings, but the reference file might not have native line endings.
// We want a terminating line ending, even when one isn't found in the expected file.
function fix(s: string): string {
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


// ================================================================================

const expected_dir_qfn = path.join(__dirname, 'main/expected');
const work_dir_qfn     = path.join(__dirname, 'main/out');
const test_file_qfn    = path.join(__dirname, 'main/TS_Save_000.json');

const expected_qfns = find_files(expected_dir_qfn);
const expected_qfn_set = new Set(expected_qfns);

rmdirSync(work_dir_qfn, { recursive: true });

describe('Script and XML Extraction',
   async () => {
      const promise = new Promise(
         (resolve, _reject) => {
            test
               .stderr()
               .stdout()
               .command([ 'extract', '-a', '-o', work_dir_qfn, test_file_qfn ])
               .timeout(10000)
               .finally(resolve)
               .it('Empty Output', ctx => {
                  expect(ctx.stderr).to.equal('');
                  expect(ctx.stdout).to.equal('');
               });
         },
      );

      const after_run =
         test
            .do(async () => { await promise; })
            .add('work_qfns', () => find_files(work_dir_qfn))
            .add('work_qfn_set', ({ work_qfns }) => new Set(work_qfns));

      for (const expected_qfn of expected_qfns) {
         after_run
            .it('File ' + expected_qfn, ctx => {
               expect(ctx.work_qfn_set.has(expected_qfn)).to.be.true;

               const expected = fix(readFileSync(path.join(expected_dir_qfn, expected_qfn), 'utf8'));
               const result = readFileSync(path.join(work_dir_qfn, expected_qfn), 'utf8');
               expect(result).to.be.equal(expected);
            });
      }

      after_run
         .it('No extra files', ctx => {
            const extra = [ ];
            for (const work_qfn of ctx.work_qfns) {
               if (!expected_qfn_set.has(work_qfn))
                  extra.push(work_qfn);
            }

            const extra_str = extra.join( process.platform === 'win32' ? ';' : ':' );
            expect(extra_str).to.be.equal('');
         });
   },
);
