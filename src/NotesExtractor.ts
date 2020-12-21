import { JsonDict, is_json_dict } from './Json';
import { clean_str_for_path, normalize_line_endings } from './Utils';


// ================================================================================
// Types

export interface TabDataRow {
   fn:    string,
   index: number,
   title: string,
   body:  string,
}


// ================================================================================
// Public class.

export class NotesExtractor {
   _tab_data: TabDataRow[];

   constructor() {
      this._tab_data = [ ];
   }


   // ========================================
   // Public accessors.

   get tab_data(): TabDataRow[] {
      return this._tab_data;
   }


   // ========================================
   // Public instance methods.

   extract_notes(mod: Readonly<JsonDict>): void {
      const tabs = mod.TabStates;
      if (!is_json_dict(tabs))
         return;

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

         this._tab_data.push({
            fn:    '',        // Placeholder.
            index: 0,         // Placeholder.
            title: title,
            body:  body,
         });
      }

      if (!this._tab_data.length)
         return;

      const counts: Record<string, number> = { };
      for (const tab of this._tab_data) {
         const base_fn = clean_str_for_path(tab.title) || '[Untitled]';
         tab.fn = base_fn;

         // eslint-disable-next-line no-multi-assign
         tab.index = counts[base_fn] = ( counts[base_fn] || 0 ) + 1;
      }

      for (const tab of this._tab_data) {
         tab.fn = tab.fn + ( counts[tab.fn] > 1 ? '.' + tab.index : '' ) + '.txt';
      }
   }
}
