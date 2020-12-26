import { expect, test } from '@oclif/test';
import fs from 'fs';
const { readdirSync, readFileSync, mkdirSync, rmdirSync } = fs;
import path from 'path';

import { readTextFileSync, writeTextFileSync } from '../../src/Utils';


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

const expected_dir_qfn          = path.join(__dirname, 'main/expected');
const work_dir_qfn              = path.join(__dirname, 'main/out');
const linked_resources_qfn      = path.join(__dirname, 'main/linked_resources.json');
const work_linked_resources_qfn = path.join(work_dir_qfn, 'linked_resources.json');

const expected_qfns = find_files(expected_dir_qfn);
const expected_qfn_set = new Set(expected_qfns);

rmdirSync(work_dir_qfn, { recursive: true });
mkdirSync(work_dir_qfn);
writeTextFileSync(work_linked_resources_qfn, readTextFileSync(linked_resources_qfn));

const expected_output =
   [
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531771993/9A75E19D95F39DA667EC4949C3AC6AA7F49F4471/ as image00...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531772076/1E0CB4F48D33E05989E1653C4A10C0618A71F83D/ as image01...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531772136/1ABC8CCF428B03AD621B70EBE947C9F28A163344/ as image02...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531772196/685CEA6AC4960BB6C80F05BC8A6BC6176B9238F4/ as image03...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531772282/685CEA6AC4960BB6C80F05BC8A6BC6176B9238F4/ as image04...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531772349/685CEA6AC4960BB6C80F05BC8A6BC6176B9238F4/ as image05...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531772412/685CEA6AC4960BB6C80F05BC8A6BC6176B9238F4/ as image06...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531772477/685CEA6AC4960BB6C80F05BC8A6BC6176B9238F4/ as image07...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531772535/685CEA6AC4960BB6C80F05BC8A6BC6176B9238F4/ as image08...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531772593/685CEA6AC4960BB6C80F05BC8A6BC6176B9238F4/ as image09...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531772702/685CEA6AC4960BB6C80F05BC8A6BC6176B9238F4/ as image10...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531772762/685CEA6AC4960BB6C80F05BC8A6BC6176B9238F4/ as image11...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531772825/685CEA6AC4960BB6C80F05BC8A6BC6176B9238F4/ as image12...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531772880/685CEA6AC4960BB6C80F05BC8A6BC6176B9238F4/ as image13...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531772936/65488B4BB686513F0CDB3A4DD8B5E056914764ED/ as model00...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531772992/685CEA6AC4960BB6C80F05BC8A6BC6176B9238F4/ as image14...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531773044/65488B4BB686513F0CDB3A4DD8B5E056914764ED/ as model01...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531773111/685CEA6AC4960BB6C80F05BC8A6BC6176B9238F4/ as image15...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531773176/CBCD13006F3B308396F43237B1350DA97108E725/ as asset_bundle00...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531773246/7E66A56B1E89C7CCFD827371AF549F8AD4A57B2C/ as pdf00...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531793136/516F47D660C281581FDDB5B23F34AAD907E616BA/ as audio00...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531794202/516F47D660C281581FDDB5B23F34AAD907E616BA/ as audio01...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531795283/516F47D660C281581FDDB5B23F34AAD907E616BA/ as audio02...',
      'Downloading http://cloud-3.steamusercontent.com/ugc/1666860163531886198/685CEA6AC4960BB6C80F05BC8A6BC6176B9238F4/ as image16...',
   ]
      .map( _ => _ + '\n' )
      .join('');

describe('Script and XML Extraction',
   async () => {
      const promise = new Promise(
         (resolve, _reject) => {
            test
               .stderr()
               .stdout()
               .command([ 'download', '-o', work_dir_qfn ])
               .timeout(15000)
               .finally(resolve)
               .it('Empty Output', ctx => {
                  expect(ctx.stderr + ctx.stdout).to.equal(expected_output);
                  expect(ctx.stderr).to.equal('');
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

               if (expected_qfn === 'linked_resources.json') {
                  const expected = fix(readFileSync(path.join(expected_dir_qfn, expected_qfn), 'utf8'));
                  const result = readFileSync(path.join(work_dir_qfn, expected_qfn), 'utf8');
                  expect(result).to.be.equal(expected);
               } else {
                  const expected = readFileSync(path.join(expected_dir_qfn, expected_qfn));
                  const result = readFileSync(path.join(work_dir_qfn, expected_qfn));
                  const match = Buffer.compare(expected, result) === 0;
                  expect(match).to.be.true;
               }
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
