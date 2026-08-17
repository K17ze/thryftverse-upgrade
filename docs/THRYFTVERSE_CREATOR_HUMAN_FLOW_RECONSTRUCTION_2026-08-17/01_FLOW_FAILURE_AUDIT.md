# Flow Failure Audit

## 1. The current entry screen encodes the software instead of the user's intent

`CreatorEntryScreen.tsx` initializes `view` as `tiles` and explicitly describes the new default as four intent tiles: Camera, Photos, Items and Templates, with Start with text below. That architectural choice is the main regression. A creator should not need to classify their intention before seeing the camera or gallery.

This is a common synthetic UI failure: every backend/domain capability becomes a card, tile, rail or route. Humans do not think “I am now entering the Items subsystem.” They think “I want to make this look with these photos and this jacket.”

## 2. Camera-first disappeared

The key wrong state is conceptually:

```ts
type EntryView = 'tiles' | 'camera';
const [view, setView] = useState('tiles');
```

Camera should not be an entry sub-view. Camera **is the root creator state**.

## 3. Look / Poster / Search became hidden routing concepts

The split into dedicated Look and Poster composers is internally healthy, but the user-facing creation mode moved outside the active creator surface. The product needs a single capture surface with a stable Look / Poster / Search switch. Internally the selected mode can still route to the dedicated editor after acquisition.

## 4. Look now contains too many simultaneous advisors

The current Look screen can render an Auto Layout bar, a separate Layout Preview rail, a commerce Source Tray and the Context Tool Rail around the canvas. Each subsystem may be individually reasonable; together they create a product that constantly tells the user what it can do rather than letting them manipulate their composition.

## 5. Latest work increased capability but also synthetic density

The current HEAD commit explicitly added AI effect browsing, camera effects and another auto-layout surface. The next cycle should not ask “what parity feature is still missing?” It should ask “which permanent surfaces can disappear while capability remains reachable?”

## 6. Post-selection discontinuity

After choosing an image, the correct mental state is: **this image is now my editable object**. Any static action screen asking the user to choose Crop / Edit / Effects / Continue breaks continuity. Media confirmation should seed the editor and immediately show it.

## 7. Post-capture discontinuity

Single capture should transition directly into the editor. Retake does not require a forced review page; back/delete can provide recovery. Explicit multi-capture is the exception because the user intentionally entered a batching mode.

## 8. Root diagnosis

The department has been optimized for feature discoverability, parity checklists and component modularity. It now needs to be optimized for **intention continuity, motor fluency, canvas primacy, progressive disclosure and emotional momentum**.
