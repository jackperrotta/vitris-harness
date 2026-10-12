// The Cloudflare artifact uses the same current display shell as the site picker.
import {renderThemePickerShell} from './theme-picker-shell.ts';
export const CLOUD_GALLERY_SHELL=renderThemePickerShell({fontStyles:'',introHtml:'<p>Loading complete templates from Cloudflare…</p><div id="catalogstatus" class="small" role="status" aria-live="polite">Loading live catalog…</div>',collectionOptions:'<option value="All directions">All directions</option>',release:'Cloudflare',scriptHtml:'<!-- CLOUD_GALLERY_RUNTIME -->'});
