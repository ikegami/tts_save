import { JsonValue, JsonDict, is_json_dict, is_json_array } from './Json';


// ================================================================================
// Types

export const enum LinkedResourceType {
   ASSET_BUNDLE = 'asset_bundle',
   AUDIO        = 'audio',
   IMAGE        = 'image',
   MODEL        = 'model',
   PDF          = 'pdf',
}

const valid_types = new Set([
   LinkedResourceType.ASSET_BUNDLE,
   LinkedResourceType.AUDIO,
   LinkedResourceType.IMAGE,
   LinkedResourceType.MODEL,
   LinkedResourceType.PDF,
]);

export function is_linked_resource_type(type: any): type is LinkedResourceType {
   return valid_types.has(type);
}

export type LinkedResourceDataRow = {
   url:  string,
   type: LinkedResourceType,
};


// ================================================================================
// Public class.

export class LinkedExtractor {
   _resources_lkup: Record<string, LinkedResourceDataRow>;

   constructor() {
      this._resources_lkup = { };
   }


   // ========================================
   // Public accessors.

   get resources(): LinkedResourceDataRow[] {
      return Object.values(this._resources_lkup);
   }


   // ========================================
   // Private instance methods.

   add_linked_resource(url: Readonly<JsonValue>, type: Readonly<LinkedResourceType>): void {
      if (typeof url !== 'string' || url === '')
         return;

      if (url in this._resources_lkup)
         return;

      this._resources_lkup[url] = {
         url:  url,
         type: type,
      };
   }


   extract_linked_from_mod(mod: Readonly<JsonDict>): void {
      this.add_linked_resource(mod.TableURL, LinkedResourceType.IMAGE);
      this.add_linked_resource(mod.SkyURL,   LinkedResourceType.IMAGE);

      if (is_json_dict(mod.Lighting)) {
         // Might be more limited than other images.
         this.add_linked_resource(mod.Lighting.LutURL, LinkedResourceType.IMAGE);
      }

      if (is_json_dict(mod.MusicPlayer)) {
         const mp = mod.MusicPlayer;
         this.add_linked_resource(mp.CurrentAudioURL, LinkedResourceType.AUDIO);

         if (is_json_array(mp.AudioLibrary)) {
            for (const rec of mp.AudioLibrary) {
               if (is_json_dict(rec)) {
                  this.add_linked_resource(rec.Item1, LinkedResourceType.AUDIO);
               }
            }
         }
      }

      if (is_json_array(mod.CustomUIAssets)) {
         for (const rec of mod.CustomUIAssets) {
            if (is_json_dict(rec)) {
               this.add_linked_resource(rec.URL, LinkedResourceType.IMAGE);
            }
         }
      }
   }


   extract_linked_from_obj(obj: Readonly<JsonDict>): void {
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
         this.add_linked_resource(custom.ImageURL,          LinkedResourceType.IMAGE);
         this.add_linked_resource(custom.ImageSecondaryURL, LinkedResourceType.IMAGE);
      }

      if (is_json_dict(obj.CustomDeck)) {
         const custom = obj.CustomDeck;
         if (is_json_dict(custom)) {
            for (const deck_id of Object.keys(custom)) {
               const deck = custom[deck_id];
               if (is_json_dict(deck)) {
                  this.add_linked_resource(deck.FaceURL, LinkedResourceType.IMAGE);
                  this.add_linked_resource(deck.BackURL, LinkedResourceType.IMAGE);
               }
            }
         }
      }

      if (is_json_dict(obj.CustomAssetbundle)) {
         const custom = obj.CustomAssetbundle;
         this.add_linked_resource(custom.AssetbundleURL,          LinkedResourceType.ASSET_BUNDLE);
         this.add_linked_resource(custom.AssetbundleSecondaryURL, LinkedResourceType.ASSET_BUNDLE);
      }

      if (is_json_dict(obj.CustomMesh)) {
         const custom = obj.CustomMesh;
         this.add_linked_resource(custom.MeshURL,     LinkedResourceType.MODEL);
         this.add_linked_resource(custom.DiffuseURL,  LinkedResourceType.IMAGE);
         this.add_linked_resource(custom.NormalURL,   LinkedResourceType.IMAGE);
         this.add_linked_resource(custom.ColliderURL, LinkedResourceType.MODEL);
      }

      if (is_json_dict(obj.CustomPDF)) {
         const custom = obj.CustomPDF;
         this.add_linked_resource(custom.PDFUrl, LinkedResourceType.PDF);
      }
   }


   // ========================================
   // Public instance methods.

   extract_linked(mod: Readonly<JsonDict>): void {
      this.extract_linked_from_mod(mod);

      if (!is_json_array(mod.ObjectStates))
         return;

      const objs: JsonValue[] = [ ...mod.ObjectStates ];
      while (objs.length) {
         const obj = objs.pop() as JsonValue;
         if (!is_json_dict(obj))
            continue;

         if (is_json_array(obj.ContainedObjects))
            objs.push(...obj.ContainedObjects);
         if (is_json_dict(obj.States))
            objs.push(...Object.values(obj.States));

         this.extract_linked_from_obj(obj);
      }
   }
}
