# A selected phrase, with room to read

Warm phrasing can arrive in two beats; precise phrasing may use a brief masked accent. Keep full semantic text in initial HTML. Author one to eight spans with natural spaces and inline emphasis/links; no character splitter or forced desktop line breaks. Do not animate the primary h1, ordinary paragraphs, navigation, legal copy or essential actions.

```html
<h2 id="care" data-motion="text" data-motion-treatment="phrase" data-motion-duration="500" data-motion-stagger="80">
 <span data-motion-word style="display:inline-block">Care for the object.</span>
 <span data-motion-word style="display:inline-block"><em>Keep its story.</em></span>
</h2>
```

Second treatment: `data-motion-treatment="mask"` uses a temporary clip on each authored phrase; a static underline may emphasize the selected word. Each span wraps naturally inside its parent; never set a fixed line height/mask height. No duplicated text, synthetic spaces or changed heading names. Selection/copy preserves the original message. Font completion/viewport resize finishes copy rather than recalculating fragile line splits. Focus and anchors finish immediately; an already visible heading stays still. Mobile may use static when the phrase consumes most of the screen. After <=1.5s the whole message is available with a quiet interval. Watch wrapping at 375px and 200% zoom, delayed fonts, focus inside a phrase and reverse scroll. Profile optional clipping paint cost. See phrase lesson for both treatments and normal/static/reduced controls.
