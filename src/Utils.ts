import { readFileSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';


// ================================================================================

export function padz(num: any, n: number): string {
   let s = String(num);
   while (s.length < n)
      s = '0' + s;

   return s;
}


// ================================================================================

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

export function text_to_xml_attr(text: string): string {
   if (invalid_xml_re.test(text))
      throw 'String not supported by XML';  // eslint-disable-line no-throw-literal

   return text.replace(chars_to_escape_xml_re, _ => char_escapes_xml[_]);
}


// ================================================================================

const clean_str_for_path_re = /[\u0000-\u001F"*./:<>?\\|\]]/g;  // This is still very permissive.

export function clean_str_for_path(s: string): string {
   return s.replace(clean_str_for_path_re, ' ').trimEnd();
}


// ================================================================================

const cr_re = /\r/g;
const lf_re = /\n/g;
const opt_trailing_lf_re = /\n?$/;
const extra_trailing_lf_re = /\n+$/;

export function normalize_line_endings(s: string): string {
   return s.replace(cr_re, '');
}

export function to_native_line_endings(s: string): string {
   s = normalize_line_endings(s);
   if (process.platform === 'win32')
      s = s.replace(lf_re, '\r\n');

   return s;
}

export function ensure_trailing_lf(s: string): string {
   if (!s.length)
      return s;

   return s.replace(opt_trailing_lf_re, '\n');
}


export function remove_extra_trailing_lf(s: string): string {
   return s.replace(extra_trailing_lf_re, '\n');
}

export function chomp(s: string): string {
   if (s.slice(-1) === '\n')
      s = s.slice(0, -1);

   return s;
}


// ================================================================================

const ext_re = /(?<=.)\.\w*$/;

export function remove_ext(s: string): string {
   return s.replace(ext_re, '');
}


// ================================================================================

export async function readStream(stream: Readable): Promise<Buffer> {
   const chunks = [ ];
   for await (const chunk of stream)
      chunks.push(chunk);

   return Buffer.concat(chunks);
}

export async function readTextFromStdin(): Promise<string> {
   if (process.platform === 'win32')
      return ( await readStream(process.stdin) ).toString('utf8');
   else
      return readFileSync(process.stdin.fd, 'utf8');
}

export function readTextFileSync(qfn: string): string {
   return normalize_line_endings(readFileSync(qfn, 'utf8'));
}

export function writeTextFileSync(qfn: string, text: string): void {
   writeFileSync(qfn, to_native_line_endings(ensure_trailing_lf(text)), 'utf8');
}

export function copyFileSync(dst_qfn: string, src_qfn: string): void {
   writeFileSync(dst_qfn, readFileSync(src_qfn));
}

export function copyTextFileSync(dst_qfn: string, src_qfn: string): void {
   writeTextFileSync(dst_qfn, readTextFileSync(src_qfn));
}


// ================================================================================

export function get_tts_dir(): string {
   const doc_dir_qfn =
      process.platform === 'win32'
         ? path.join(os.homedir(), 'Documents')
         : os.homedir();

   return path.join(doc_dir_qfn, 'My Games/Tabletop Simulator');
}
